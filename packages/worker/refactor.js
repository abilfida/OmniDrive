const fs = require('fs');

let code = fs.readFileSync('src/routes/folders.ts', 'utf8');

// 1. Breadcrumb query
code = code.replace(
  /SELECT id, name, parent_id, 0 as lvl FROM virtual_folders WHERE id = \? AND user_id = \?/g,
  'SELECT wf.id, wf.name, wf.parent_id, 0 as lvl FROM workspace_folders wf JOIN workspace_members wm ON wf.workspace_id = wm.workspace_id WHERE wf.id = ? AND wm.user_id = ?'
);

code = code.replace(
  /FROM virtual_folders v\n\s*JOIN breadcrumb_path bp ON v\.id = bp\.parent_id\n\s*WHERE v\.user_id = \?/g,
  'FROM workspace_folders v\n        JOIN breadcrumb_path bp ON v.id = bp.parent_id\n        JOIN workspace_members wm ON v.workspace_id = wm.workspace_id\n        WHERE wm.user_id = ?'
);

// 2. /tree route
code = code.replace(
  /'SELECT \* FROM virtual_folders WHERE user_id = \? ORDER BY name ASC'/g,
  "'SELECT wf.* FROM workspace_folders wf JOIN workspace_members wm ON wf.workspace_id = wm.workspace_id WHERE wm.user_id = ? ORDER BY wf.name ASC'"
);

// 3. /:id? route GET folder
code = code.replace(
  /'SELECT \* FROM virtual_folders WHERE id = \? AND user_id = \?'/g,
  "'SELECT wf.* FROM workspace_folders wf JOIN workspace_members wm ON wf.workspace_id = wm.workspace_id WHERE wf.id = ? AND wm.user_id = ?'"
);

// 4. Subfolders query
code = code.replace(
  /'SELECT \* FROM virtual_folders WHERE user_id = \? AND parent_id = \? ORDER BY name ASC'/g,
  "'SELECT wf.* FROM workspace_folders wf JOIN workspace_members wm ON wf.workspace_id = wm.workspace_id WHERE wm.user_id = ? AND wf.parent_id = ? ORDER BY wf.name ASC'"
);

code = code.replace(
  /'SELECT \* FROM virtual_folders WHERE user_id = \? AND parent_id IS NULL ORDER BY name ASC'/g,
  "'SELECT wf.* FROM workspace_folders wf JOIN workspace_members wm ON wf.workspace_id = wm.workspace_id WHERE wm.user_id = ? AND wf.parent_id IS NULL ORDER BY wf.name ASC'"
);

// 5. Files query
code = code.replace(
  /f\.virtual_folder_id = \?/g,
  "f.workspace_folder_id = ?"
);

code = code.replace(
  /f\.virtual_folder_id IS NULL/g,
  "f.workspace_folder_id IS NULL"
);

// 6. POST / create
const postReplacement = `  const id = generateId();
  let workspaceId: string;
  if (parentId) {
    const parent = await c.env.DB.prepare('SELECT wf.workspace_id FROM workspace_folders wf JOIN workspace_members wm ON wf.workspace_id = wm.workspace_id WHERE wf.id = ? AND wm.user_id = ?').bind(parentId, userId).first<{ workspace_id: string }>();
    if (!parent) throw new AppError(404, 'Parent folder not found');
    workspaceId = parent.workspace_id;
  } else {
    const member = await c.env.DB.prepare('SELECT workspace_id FROM workspace_members WHERE user_id = ? AND role = "owner" LIMIT 1').bind(userId).first<{ workspace_id: string }>();
    if (member) {
      workspaceId = member.workspace_id;
    } else {
      workspaceId = generateId();
      await c.env.DB.batch([
        c.env.DB.prepare('INSERT INTO workspaces (id, name, owner_id) VALUES (?, ?, ?)').bind(workspaceId, 'My Workspace', userId),
        c.env.DB.prepare('INSERT INTO workspace_members (id, workspace_id, user_id, role) VALUES (?, ?, ?, ?)').bind(generateId(), workspaceId, userId, 'owner')
      ]);
    }
  }

  await c.env.DB.prepare(
    'INSERT INTO workspace_folders (id, workspace_id, name, parent_id, icon, color) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(id, workspaceId, name, parentId || null, icon || '📁', color || '#4A90D9').run();`;

code = code.replace(
  /  const id = generateId\(\);\n  await c\.env\.DB\.prepare\(\n    'INSERT INTO virtual_folders \(id, user_id, name, parent_id, icon, color\) VALUES \(\?, \?, \?, \?, \?, \?\)'\n  \)\.bind\(id, userId, name, parentId \|\| null, icon \|\| '📁', color \|\| '#4A90D9'\)\.run\(\);/g,
  postReplacement
);

// 7. PUT /:id and DELETE /:id updates
code = code.replace(
  /UPDATE virtual_folders SET (.*) WHERE id = \? AND user_id = \?/g,
  'UPDATE workspace_folders SET $1 WHERE id = ? AND workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = ?)'
);

code = code.replace(
  /DELETE FROM virtual_folders WHERE id = \? AND user_id = \?/g,
  'DELETE FROM workspace_folders WHERE id = ? AND workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = ?)'
);

// 8. UPDATE files SET virtual_folder_id = ?
code = code.replace(
  /UPDATE files SET virtual_folder_id = \?,/g,
  'UPDATE files SET workspace_folder_id = ?,'
);

// 9. Sync route query
code = code.replace(
  /WHERE f\.virtual_folder_id = \? AND f\.user_id = \?/g,
  'WHERE f.workspace_folder_id = ? AND f.user_id = ?'
);

fs.writeFileSync('src/routes/folders.ts', code);
console.log('folders.ts rewritten');
