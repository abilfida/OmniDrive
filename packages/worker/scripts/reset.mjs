import readline from 'readline';
import { execSync } from 'child_process';
import { writeFileSync, unlinkSync } from 'fs';
import { fileURLToPath } from 'url';

export async function promptUser(isRemote) {
  if (!isRemote) return true;
  
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question("\x1b[31mPERINGATAN: Anda akan menghapus SELURUH data di PRODUCTION. Ketik 'YES' untuk melanjutkan: \x1b[0m", (answer) => {
      rl.close();
      resolve(answer.trim().toUpperCase() === 'YES');
    });
  });
}

export function resetD1(execSync, flag) {
  console.log(`\n=> Mereset D1 Database (${flag})...`);
  console.log('Menghapus tabel secara berurutan (berdasarkan dependensi)...');
  
  // Daftar tabel diurutkan dari child ke parent untuk menghindari error foreign keys di D1
  const TABLES_TO_DROP = [
    's3_multipart_parts',
    's3_multipart_uploads',
    's3_credentials',
    'shared_link_logs',
    'automation_logs',
    'sync_state',
    'drive_folders',
    'files',
    'workspace_policies',
    'workspace_members',
    'audit_logs',
    'invitation_codes',
    'workspace_folders',
    'shared_links',
    'automation_rules',
    'workspaces',
    'drive_accounts',
    'users'
  ];

  const dropCommands = TABLES_TO_DROP.map(t => `DROP TABLE IF EXISTS ${t};`).join(' ');
  execSync(`npx wrangler d1 execute omnidrive ${flag} -y --command="${dropCommands}"`, { stdio: 'inherit' });
  
  console.log('Menerapkan schema baru...');
  execSync(`npx wrangler d1 execute omnidrive ${flag} -y --file=src/db/schema.sql`, { stdio: 'inherit' });
}

export function resetKV(execSync, writeFileSync, unlinkSync, flag) {
  console.log(`\n=> Mereset KV Namespace (${flag})...`);
  console.log('Mendapatkan daftar keys...');
  const keysOutput = execSync(`npx wrangler kv key list --binding=KV ${flag}`).toString();
  const keysData = JSON.parse(keysOutput);
  
  if (keysData.length > 0) {
    const keysToDelete = keysData.map(k => k.name);
    writeFileSync('temp_keys.json', JSON.stringify(keysToDelete));
    console.log(`Menghapus ${keysToDelete.length} keys...`);
    execSync(`npx wrangler kv bulk delete --binding=KV ${flag} temp_keys.json`, { stdio: 'inherit' });
    unlinkSync('temp_keys.json');
  } else {
    console.log('KV Namespace sudah kosong.');
  }
}

async function main() {
  const isRemote = process.argv.includes('--remote');
  const flag = isRemote ? '--remote' : '--local';

  const confirmed = await promptUser(isRemote);
  if (!confirmed) {
    console.log('Operasi dibatalkan.');
    process.exit(1);
  }

  try {
    resetD1(execSync, flag);
    resetKV(execSync, writeFileSync, unlinkSync, flag);
    console.log('\n=> Selesai! Data berhasil direset.');
  } catch (err) {
    console.error('Terjadi kesalahan selama reset:', err.message);
    process.exit(1);
  }
}

// Only run if executed directly (not when imported in tests)
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
