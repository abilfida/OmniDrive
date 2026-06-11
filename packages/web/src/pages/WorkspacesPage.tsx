import { useState, useEffect, useMemo, useCallback } from 'react';
import { api } from '../lib/api';
import type { WorkspaceFolder, FileEntry, DriveFolder, BreadcrumbItem } from '../types';
import { WorkspaceSidebar } from '../components/workspaces/WorkspaceSidebar';
import { WorkspaceMainView } from '../components/workspaces/WorkspaceMainView';
import { useToastStore } from '../stores/toastStore';
import { useSelectionStore, type SelectedItem } from '../stores/useSelectionStore';
import { useUIStore } from '../stores/useUIStore';

export function WorkspacesPage() {
  const [folders, setFolders] = useState<WorkspaceFolder[]>([]);
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null);
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [subfolders, setSubfolders] = useState<WorkspaceFolder[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [retentionTargetId, setRetentionTargetId] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const addToast = useToastStore(state => state.addToast);
  const { clearSelection, toggleSelection } = useSelectionStore();
  const setIsInfoPanelOpen = useUIStore(s => s.setIsInfoPanelOpen);

  const fetchTree = useCallback(async () => {
    try {
      const res = await api.getWorkspaceTree();
      setFolders(res.folders);
    } catch {
      addToast('error', 'Failed to load workspaces');
    }
  }, [addToast]);

  const fetchContents = useCallback(async (folderId: string, cursor?: string) => {
    try {
      if (cursor) setIsLoadingMore(true);
      const res = await api.getFolderContents(folderId, cursor);
      
      if (cursor) {
        setFiles(prev => [...prev, ...res.files]);
      } else {
        setFiles(res.files);
        setSubfolders(res.subfolders);
      }
      
      setNextCursor(res.pagination?.nextCursor || null);
      setHasMore(res.pagination?.hasMore || false);
    } catch {
      addToast('error', 'Failed to load folder contents');
    } finally {
      setIsLoadingMore(false);
    }
  }, [addToast]);

  useEffect(() => {
    fetchTree();
  }, [fetchTree]);

  useEffect(() => {
    if (activeFolderId) {
      fetchContents(activeFolderId);
    } else {
      setFiles([]);
      setSubfolders([]);
    }
    clearSelection();
  }, [activeFolderId, clearSelection, fetchContents]);

  const handleCreateFolder = async (parentId?: string | null) => {
    const promptMessage = parentId ? 'New subfolder name:' : 'New workspace name:';
    const name = prompt(promptMessage);
    if (name?.trim()) {
      try {
        await api.createFolder(name.trim(), parentId === null ? undefined : parentId);
        fetchTree();
      } catch {
        addToast('error', 'Failed to create workspace');
      }
    }
  };

  const handleRename = async (id: string) => {
    const folder = folders.find(f => f.id === id);
    if (!folder) return;
    const name = prompt('Rename workspace:', folder.name);
    if (name?.trim() && name.trim() !== folder.name) {
      try {
        await api.updateFolder(id, { name: name.trim() });
        fetchTree();
      } catch {
        addToast('error', 'Failed to rename workspace');
      }
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to delete this workspace?')) {
      try {
        await api.deleteFolder(id);
        if (activeFolderId === id) {
          setActiveFolderId(null);
        }
        fetchTree();
      } catch {
        addToast('error', 'Failed to delete workspace');
      }
    }
  };

  const handleSync = async () => {
    if (!activeFolderId) return;
    setIsSyncing(true);
    try {
      await api.syncWorkspace(activeFolderId);
      addToast('success', 'Sync started.');
      setTimeout(() => fetchContents(activeFolderId), 2000);
    } catch {
      addToast('error', 'Failed to start sync');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleViewInfo = useCallback((item: FileEntry | WorkspaceFolder | DriveFolder, type: 'file' | 'folder') => {
    clearSelection();
    toggleSelection({ type, item } as SelectedItem);
    setIsInfoPanelOpen(true);
  }, [clearSelection, toggleSelection, setIsInfoPanelOpen]);

  const activeFolder = useMemo(() => folders.find(f => f.id === activeFolderId) || null, [folders, activeFolderId]);

  const breadcrumbPath = useMemo(() => {
    const path: BreadcrumbItem[] = [];
    let current = activeFolder;
    while (current) {
      path.unshift({ id: current.id, name: current.name });
      current = folders.find(f => f.id === current!.parentId) || null;
    }
    return path;
  }, [activeFolder, folders]);

  const getDriveInfo = useCallback(() => ({ drive: null as any, index: 0 }), []);
  const onPreviewFile = useCallback(() => {}, []);
  const onShare = useCallback(() => {}, []);
  const onRenameFile = useCallback(() => {}, []);
  const onMoveDrive = useCallback(() => {}, []);
  const isTargetShared = useCallback(() => false, []);
  const errorDrives = useMemo(() => new Set<string>(), []);

  const onDeleteFile = useCallback(async (id: string) => {
    try {
      await api.moveFile(id, null);
      addToast('success', 'Removed');
      if (activeFolderId) fetchContents(activeFolderId);
    } catch {
      addToast('error', 'Failed');
    }
  }, [activeFolderId, fetchContents, addToast]);

  const handleSetRetentionPolicy = useCallback((id: string, type: 'file' | 'folder') => {
    if (type === 'folder') {
      setRetentionTargetId(id);
    }
  }, []);

  const loadMore = useCallback(() => {
    if (!isLoadingMore && hasMore && nextCursor && activeFolderId) {
      fetchContents(activeFolderId, nextCursor);
    }
  }, [isLoadingMore, hasMore, nextCursor, activeFolderId, fetchContents]);

  const fileTabProps = useMemo(() => ({
    files,
    subfolders,
    getDriveInfo,
    onNavigateFolder: setActiveFolderId,
    onPreviewFile,
    onShare,
    onRenameFile,
    onDeleteFile,
    onMoveDrive,
    isTargetShared,
    errorDrives,
    onViewInfo: handleViewInfo,
    onSetRetentionPolicy: handleSetRetentionPolicy,
    loadMore,
    hasMore,
    isLoadingMore
  }), [
    files,
    subfolders,
    getDriveInfo,
    onPreviewFile,
    onShare,
    onRenameFile,
    onDeleteFile,
    onMoveDrive,
    isTargetShared,
    errorDrives,
    handleViewInfo,
    handleSetRetentionPolicy,
    loadMore,
    hasMore,
    isLoadingMore
  ]);

  return (
    <div className="flex h-full w-full overflow-hidden bg-white">
      <WorkspaceSidebar 
        folders={folders}
        activeFolderId={activeFolderId}
        onSelect={setActiveFolderId} 
        onRename={handleRename}
        onDelete={handleDelete}
        onNewSubfolder={handleCreateFolder}
      />
      <WorkspaceMainView
        activeFolder={activeFolder}
        path={breadcrumbPath}
        onCreateFolder={() => activeFolder && handleCreateFolder(activeFolder.id)}
        onCreateRootFolder={() => handleCreateFolder(null)}
        onSync={handleSync}
        isSyncing={isSyncing}
        fileTabProps={fileTabProps as any}
      />
      {retentionTargetId && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-lg p-6 max-w-md w-full">
            <h3 className="text-lg font-bold mb-4">Set Retention Policy</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Action</label>
                <select id="retentionAction" className="w-full border-gray-300 rounded p-2 text-sm border">
                  <option value="auto_delete">Auto-Delete (Retention limit)</option>
                  <option value="prevent_deletion">Prevent Deletion (Legal Hold)</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Days</label>
                <input id="retentionDays" type="number" defaultValue={30} className="w-full border-gray-300 rounded p-2 text-sm border" />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded" onClick={() => setRetentionTargetId(null)}>Cancel</button>
              <button className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700" onClick={async () => {
                const action = (document.getElementById('retentionAction') as HTMLSelectElement).value;
                const days = parseInt((document.getElementById('retentionDays') as HTMLInputElement).value, 10);
                if (activeFolderId) {
                  try {
                    await api.createWorkspacePolicy(activeFolderId, {
                      targetType: 'folder',
                      targetId: retentionTargetId,
                      policyType: 'data_retention',
                      config: { action, days }
                    });
                    addToast('success', 'Policy applied successfully');
                    setRetentionTargetId(null);
                  } catch {
                    addToast('error', 'Failed to apply policy');
                  }
                }
              }}>Save Policy</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
