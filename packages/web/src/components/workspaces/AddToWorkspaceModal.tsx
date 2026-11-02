import { useState, useEffect } from 'react';
import { api } from '../../lib/api';
import type { WorkspaceFolder, FileEntry } from '../../types';
import { X, Folder } from 'lucide-react';
import { useEscapeToClose } from '../../hooks/useEscapeToClose';

interface Props {
  file: FileEntry;
  onClose: () => void;
  onSuccess: () => void;
}

export function AddToWorkspaceModal({ file, onClose, onSuccess }: Props) {
  const [folders, setFolders] = useState<WorkspaceFolder[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    api.getWorkspaceTree().then(res => setFolders(res.folders));
  }, []);

  const handleAdd = async () => {
    if (!selectedId) return;
    try {
      await api.addFilesToWorkspace(selectedId, [file.id]);
      onSuccess();
    } catch {
      // Error handled by parent
    }
  };

  useEscapeToClose(onClose);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" role="dialog" aria-modal="true">
      <div className="w-full max-w-md bg-white rounded-xl shadow-xl overflow-hidden flex flex-col max-h-[80vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-xl font-semibold">Add to Workspace</h2>
          <button onClick={onClose} className="text-gray-500 hover:bg-gray-100 p-1 rounded-full"><X size={20} /></button>
        </div>
        <div className="p-4 overflow-y-auto flex-1 space-y-2">
          {folders.map(folder => (
            <button
              key={folder.id}
              onClick={() => setSelectedId(folder.id)}
              className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-left ${selectedId === folder.id ? 'bg-blue-100' : 'hover:bg-gray-50'}`}
            >
              <Folder size={16} className="text-blue-500" />
              {folder.name}
            </button>
          ))}
        </div>
        <div className="px-6 py-4 border-t flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200">Cancel</button>
          <button onClick={handleAdd} disabled={!selectedId} className="px-4 py-2 font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50">Add</button>
        </div>
      </div>
    </div>
  );
}
