import fs from 'fs';

function replaceInFile(filePath, search, replace) {
  if (!fs.existsSync(filePath)) return;
  let content = fs.readFileSync(filePath, 'utf-8');
  content = content.split(search).join(replace);
  fs.writeFileSync(filePath, content);
}

function regexReplace(filePath, regex, replace) {
  if (!fs.existsSync(filePath)) return;
  let content = fs.readFileSync(filePath, 'utf-8');
  content = content.replace(regex, replace);
  fs.writeFileSync(filePath, content);
}

// 1. Fix Workspace -> WorkspaceFolder for the UI components
const uiFiles = [
  'packages/web/src/pages/WorkspacesPage.tsx',
  'packages/web/src/components/workspaces/WorkspaceSidebar.tsx',
  'packages/web/src/components/workspaces/AddToWorkspaceModal.tsx',
  'packages/web/src/components/files/FileGrid.tsx',
  'packages/web/src/pages/FilesPage.tsx',
  'packages/web/src/pages/StarredPage.tsx',
  'packages/web/src/stores/useSelectionStore.ts',
  'packages/web/src/lib/api.ts'
];

uiFiles.forEach(f => {
  regexReplace(f, /Workspace(\[\]|\s|\,|\>)/g, 'WorkspaceFolder$1');
  regexReplace(f, /type\s*\{\s*WorkspaceFolder,\s*FileEntry/g, 'type { WorkspaceFolder, FileEntry');
  regexReplace(f, /import\s+type\s*\{\s*WorkspaceFolder/g, 'import type { WorkspaceFolder');
});

// 2. Fix api.createWorkspace back to api.createFolder
replaceInFile('packages/web/src/pages/FilesPage.tsx', 'api.createWorkspace', 'api.createFolder');
replaceInFile('packages/web/src/pages/WorkspacesPage.tsx', 'api.createWorkspace', 'api.createFolder');

// 3. Update BulkActionBar.tsx for workspace terminology
replaceInFile('packages/web/src/components/layout/BulkActionBar.tsx', 'onVirtualFolderRequested', 'onWorkspaceRequested');
replaceInFile('packages/web/src/components/layout/BulkActionBar.tsx', 'Add to Virtual Folder', 'Add to Workspace');

// 4. Fix virtualFolderId to workspaceFolderId in uploadStore.ts and api.ts
replaceInFile('packages/web/src/stores/uploadStore.ts', 'virtualFolderId,', 'workspaceFolderId: virtualFolderId,');
regexReplace('packages/web/src/lib/api.ts', /workspaceId\?\:\s*string/g, 'workspaceFolderId?: string');
regexReplace('packages/web/src/lib/api.ts', /workspaceId\)\s*=>/g, 'workspaceFolderId) =>');
replaceInFile('packages/web/src/lib/api.ts', 'workspaceId: string | null', 'workspaceFolderId: string | null');
replaceInFile('packages/web/src/lib/api.ts', 'JSON.stringify({ workspaceId })', 'JSON.stringify({ workspaceFolderId })');

console.log("Fixes applied");
