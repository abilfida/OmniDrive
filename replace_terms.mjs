import fs from 'fs';

const replacements = [
  { search: /VirtualFolderSidebar/g, replace: 'WorkspaceSidebar' },
  { search: /VirtualFolder/g, replace: 'Workspace' },
  { search: /virtualFolder/g, replace: 'workspace' },
  { search: /Virtual Folder/g, replace: 'Workspace' },
  { search: /virtual folder/g, replace: 'workspace' },
  { search: /virtual-folders/g, replace: 'workspaces' },
  { search: /virtual-folder/g, replace: 'workspace' },
  { search: /VirtualFolders/g, replace: 'Workspaces' },
  { search: /getVirtualFolderTree/g, replace: 'getWorkspaceTree' },
  { search: /syncVirtualFolder/g, replace: 'syncWorkspace' },
  { search: /createFolder/g, replace: 'createWorkspace' } // careful with this one
];

function processFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  let content = fs.readFileSync(filePath, 'utf-8');
  replacements.forEach(({ search, replace }) => {
    // skip createFolder replace for api.ts maybe? No, let's keep it simple
    if (search.toString() === '/createFolder/g' && filePath.includes('api.ts')) return;
    content = content.replace(search, replace);
  });
  fs.writeFileSync(filePath, content);
}

const files = [
  'packages/web/src/pages/WorkspacesPage.tsx',
  'packages/web/src/components/workspaces/WorkspaceSidebar.tsx',
  'packages/web/src/components/workspaces/AddToWorkspaceModal.tsx',
  'packages/web/src/lib/api.ts',
  'packages/web/src/components/files/FileGrid.tsx',
  'packages/web/src/pages/FilesPage.tsx',
  'packages/web/src/pages/StarredPage.tsx',
  'packages/web/src/stores/useSelectionStore.ts'
];

files.forEach(processFile);
console.log("Replaced references in files.");
