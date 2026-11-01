import type { D1Database } from '@cloudflare/workers-types';
import type { GoogleDriveService } from './google-drive';

// Files handled per policy per cron run, to stay within per-invocation limits;
// the rest are picked up by the next run.
const RETENTION_BATCH_SIZE = 200;

export class PolicyService {
  constructor(private db: D1Database) {}

  async checkQuota(workspaceId: string, incomingBytes: number): Promise<boolean> {
    const workspace = await this.db.prepare('SELECT used_bytes FROM workspaces WHERE id = ?').bind(workspaceId).first<{ used_bytes: number }>();
    if (!workspace) return false;

    const policy = await this.db.prepare(
      `SELECT config FROM workspace_policies 
       WHERE workspace_id = ? AND policy_type = 'storage_quota'`
    ).bind(workspaceId).first<{ config: string }>();

    if (!policy) return true; // No quota set

    const config = JSON.parse(policy.config) as { max_bytes: number };
    return (workspace.used_bytes + incomingBytes) <= config.max_bytes;
  }

  async checkRetentionProtection(folderId: string): Promise<boolean> {
    const policy = await this.db.prepare(
      `SELECT p.config 
       FROM workspace_policies p
       JOIN workspace_folders f ON f.workspace_id = p.workspace_id
       WHERE f.id = ? AND p.policy_type = 'data_retention'
         AND (p.target_type = 'workspace' OR (p.target_type = 'folder' AND p.target_id = ?))`
    ).bind(folderId, folderId).first<{ config: string }>();

    if (!policy) return false;

    const config = JSON.parse(policy.config) as { action: string, days?: number };
    return config.action === 'prevent_deletion';
  }

  async updateWorkspaceStorage(workspaceId: string, sizeDelta: number) {
    await this.db.prepare('UPDATE workspaces SET used_bytes = COALESCE(used_bytes, 0) + ? WHERE id = ?').bind(sizeDelta, workspaceId).run();
  }

  // Applies auto_delete retention policies. Expired files are moved to the Google
  // Drive bin first (recoverable for 30 days if a policy was misconfigured), and
  // their rows are removed only once Google confirmed, so the two stay in step.
  async processAutoDeleteRetentionPolicies(driveService: GoogleDriveService) {
    const { results: policies } = await this.db.prepare(
      `SELECT * FROM workspace_policies WHERE policy_type = 'data_retention' AND json_extract(config, '$.action') = 'auto_delete'`
    ).all<{ id: string, workspace_id: string, target_type: string, target_id: string | null, config: string }>();

    for (const policy of policies) {
      let days: unknown;
      try {
        days = JSON.parse(policy.config).days;
      } catch {
        days = undefined;
      }
      if (typeof days !== 'number' || !Number.isInteger(days) || days < 1) {
        console.error(`Skipping retention policy ${policy.id}: invalid "days" in config`);
        continue;
      }

      // Compare in SQLite's own datetime format (created_at is 'YYYY-MM-DD HH:MM:SS').
      const cutoff = `-${days} days`;
      const folderFilter = policy.target_type === 'workspace' ? '' : 'AND workspace_folder_id = ?';
      const binds: unknown[] = policy.target_type === 'workspace'
        ? [policy.workspace_id, cutoff]
        : [policy.workspace_id, cutoff, policy.target_id];
      const { results: expiredFiles } = await this.db.prepare(
        `SELECT id, google_file_id, size, workspace_id, drive_account_id FROM files
         WHERE workspace_id = ? AND created_at < datetime('now', ?) ${folderFilter}
         LIMIT ${RETENTION_BATCH_SIZE}`
      ).bind(...binds).all<{ id: string, google_file_id: string, size: number, workspace_id: string, drive_account_id: string }>();

      for (const file of expiredFiles) {
        try {
          await driveService.trashFile(file.drive_account_id, file.google_file_id);
        } catch (err) {
          console.error(`Retention: could not trash ${file.id} in Google Drive; keeping it`, err);
          continue;
        }
        await this.db.batch([
          this.db.prepare('DELETE FROM files WHERE id = ?').bind(file.id),
          this.db.prepare('UPDATE workspaces SET used_bytes = MAX(0, COALESCE(used_bytes, 0) - ?) WHERE id = ?').bind(file.size || 0, file.workspace_id),
        ]);
      }
    }
  }
}
