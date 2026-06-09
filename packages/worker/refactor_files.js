const fs = require('fs');

let code = fs.readFileSync('src/routes/files.ts', 'utf8');

// Replace virtualFolderId variable names
code = code.replace(/virtualFolderId/g, 'workspaceFolderId');

// Handle workspace_id for the file insert
code = code.replace(
  /id, user_id, drive_account_id, virtual_folder_id,\n\s*google_file_id/g,
  'id, user_id, drive_account_id, workspace_folder_id, workspace_id,\n      google_file_id'
);

code = code.replace(
  /id, userId, driveAccountId, workspaceFolderId \|\| null,\n\s*gFile.id/g,
  `id, userId, driveAccountId, workspaceFolderId || null, workspaceId,\n    gFile.id`
);

// Look for the finalize upload logic to add workspaceId retrieval
const finalizeRegex = /const { googleFileId, driveAccountId, workspaceFolderId } = await c\.req\.json\(\);\n\n  if \(!googleFileId/g;
code = code.replace(
  finalizeRegex,
  `const { googleFileId, driveAccountId, workspaceFolderId } = await c.req.json();

  let workspaceId = null;
  if (workspaceFolderId) {
    const wf = await c.env.DB.prepare('SELECT workspace_id FROM workspace_folders WHERE id = ?').bind(workspaceFolderId).first<{ workspace_id: string }>();
    if (wf) workspaceId = wf.workspace_id;
  }

  if (!googleFileId`
);

// We should also replace virtual_folder_id across the whole file if there are any remaining
code = code.replace(/virtual_folder_id/g, 'workspace_folder_id');

fs.writeFileSync('src/routes/files.ts', code);
console.log('files.ts rewritten');
