import React, { useState } from 'react';
import { useSelectionStore } from '../../stores/useSelectionStore';
import { formatFileSize, formatRelativeTime, getFileIcon } from '../../lib/utils';
import { X, File, Folder, Loader2, RefreshCw } from 'lucide-react';
import { useUIStore } from '../../stores/useUIStore';
import { useToastStore } from '../../stores/toastStore';

export const InfoPanel: React.FC = () => {
  const selectedItems = useSelectionStore((s) => s.selectedItems);
  const toggleInfoPanel = useUIStore((s) => s.toggleInfoPanel);

  if (selectedItems.length === 0) {
    return (
      <aside className="w-80 bg-white border-l border-gray-200 p-4 flex flex-col flex-shrink-0">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold text-gray-800">Details</h2>
          <button onClick={toggleInfoPanel} className="p-1.5 hover:bg-gray-100 rounded-full text-gray-500">
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center text-center px-4">
          <File size={48} className="text-gray-300 mb-4" />
          <p className="text-sm text-gray-500">Select a file or folder to see its details here.</p>
        </div>
      </aside>
    );
  }

  if (selectedItems.length > 1) {
    return (
      <aside className="w-80 bg-white border-l border-gray-200 p-4 flex flex-col flex-shrink-0">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold text-gray-800">Details</h2>
          <button onClick={toggleInfoPanel} className="p-1.5 hover:bg-gray-100 rounded-full text-gray-500">
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center text-center px-4">
          <File size={48} className="text-gray-300 mb-4" />
          <p className="text-sm text-gray-800 font-medium">{selectedItems.length} items selected</p>
          <p className="text-xs text-gray-500 mt-2">Select a single item to view its properties.</p>
        </div>
      </aside>
    );
  }

  const { type, item } = selectedItems[0];
  const [isSyncing, setIsSyncing] = useState(false);
  const addToast = useToastStore((s) => s.addToast);

  const handleForceSync = async () => {
    if (type !== 'folder') return;
    setIsSyncing(true);
    try {
      const { api } = await import('../../lib/api');
      const driveId = (item as any).driveAccountId || '';
      await api.forceSyncFolder(item.id!, driveId);
      addToast('success', 'Sync queued. Data will update shortly.');
    } catch (err: any) {
      addToast('error', err.message || 'Failed to queue sync.');
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <aside className="w-80 bg-white border-l border-gray-200 p-4 flex flex-col flex-shrink-0 overflow-y-auto">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-lg font-semibold text-gray-800">Details</h2>
        <button onClick={toggleInfoPanel} className="p-1.5 hover:bg-gray-100 rounded-full text-gray-500 transition-colors">
          <X size={18} />
        </button>
      </div>

      <div className="mb-6 flex justify-center">
        {type === 'folder' ? (
          <div className="w-24 h-24 bg-blue-50 rounded-2xl flex items-center justify-center">
            <Folder size={48} className="text-blue-500" />
          </div>
        ) : (
          <div className="w-24 h-24 bg-gray-50 border border-gray-200 rounded-2xl flex items-center justify-center text-5xl shadow-sm">
            {getFileIcon(item.mimeType)}
          </div>
        )}
      </div>

      <h3 className="text-base font-medium text-gray-800 text-center mb-6 break-words px-2">
        {item.name}
      </h3>

      <div className="space-y-4">
        <div className="border-t border-gray-100 pt-4">
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Properties</h4>
          <dl className="space-y-3 text-sm">
            <div className="flex flex-col">
              <dt className="text-gray-500 mb-0.5 text-xs">Type</dt>
              <dd className="text-gray-800">{type === 'folder' ? 'Google Drive Folder' : item.mimeType || 'Unknown file type'}</dd>
            </div>
            {type === 'file' && (
              <div className="flex flex-col">
                <dt className="text-gray-500 mb-0.5 text-xs">Size</dt>
                <dd className="text-gray-800">{formatFileSize(item.size)}</dd>
              </div>
            )}
            <div className="flex flex-col">
              <dt className="text-gray-500 mb-0.5 text-xs">Modified</dt>
              <dd className="text-gray-800">
                {type === 'file' 
                  ? formatRelativeTime(item.googleModifiedAt ?? item.createdAt)
                  : '—'}
              </dd>
            </div>
            {type === 'file' && item.googleCreatedAt && (
              <div className="flex flex-col">
                <dt className="text-gray-500 mb-0.5 text-xs">Created</dt>
                <dd className="text-gray-800">{formatRelativeTime(item.googleCreatedAt)}</dd>
              </div>
            )}
            {type === 'folder' && 'lastSyncedAt' in item && (
              <div className="flex flex-col">
                <dt className="text-gray-500 mb-0.5 text-xs">Last Synced</dt>
                <dd className="text-gray-800">
                  {item.lastSyncedAt ? formatRelativeTime(item.lastSyncedAt) : 'Never'}
                </dd>
              </div>
            )}
          </dl>
          
          {type === 'folder' && (
            <div className="mt-4">
              <button
                onClick={handleForceSync}
                disabled={isSyncing}
                className="flex items-center justify-center w-full gap-2 px-3 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {isSyncing ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                {isSyncing ? 'Syncing...' : 'Force Sync'}
              </button>
            </div>
          )}
        </div>
        
        <div className="border-t border-gray-100 pt-4">
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Tags & Metadata</h4>
          {('metadata' in item && item.metadata) ? (
            <div className="flex flex-wrap gap-2 mb-3">
              {Object.entries(typeof (item as any).metadata === 'string' ? JSON.parse((item as any).metadata) : (item as any).metadata).map(([k, v]) => (
                <div key={k} className="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded-full flex items-center">
                  <span className="font-semibold mr-1">{k}:</span> {v as string}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-gray-400 mb-3">No tags applied.</p>
          )}
          <form 
            onSubmit={async (e) => {
              e.preventDefault();
              const form = e.target as HTMLFormElement;
              const key = (form.elements.namedItem('metaKey') as HTMLInputElement).value;
              const value = (form.elements.namedItem('metaValue') as HTMLInputElement).value;
              if (!key || !value) return;

              const { api } = await import('../../lib/api');
              const currentMeta = typeof (item as any).metadata === 'string' ? JSON.parse((item as any).metadata || '{}') : ((item as any).metadata || {});
              const newMeta = { ...currentMeta, [key]: value };

              try {
                if (type === 'file') {
                  await api.updateFileMetadata(item.id, newMeta);
                } else if ((item as any).workspaceId) {
                  await api.updateFolderMetadata((item as any).workspaceId, item.id!, newMeta);
                }
                // Update local state temporarily for UX
                (item as any).metadata = newMeta;
                form.reset();
              } catch (err) {
                console.error(err);
              }
            }}
            className="flex gap-2"
          >
            <input name="metaKey" placeholder="Key" className="w-1/3 border rounded px-2 py-1 text-xs" />
            <input name="metaValue" placeholder="Value" className="flex-1 border rounded px-2 py-1 text-xs" />
            <button type="submit" className="bg-gray-800 text-white px-2 py-1 rounded text-xs">Add</button>
          </form>
        </div>
      </div>
    </aside>
  );
};
