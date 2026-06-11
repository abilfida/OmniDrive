import React, { useState } from 'react';
import { useSelectionStore } from '../../stores/useSelectionStore';
import { useToastStore } from '../../stores/toastStore';
import { api } from '../../lib/api';
import { X, Trash2, Folder, Star, HardDrive } from 'lucide-react';

export interface BulkActionBarProps {
  onActionComplete: () => void;
  onMoveRequested?: () => void;
  onWorkspaceRequested?: () => void;
  onMoveDriveRequested?: () => void;
}

export const BulkActionBar: React.FC<BulkActionBarProps> = ({ onActionComplete, onMoveRequested, onWorkspaceRequested, onMoveDriveRequested }) => {
  const { selectedItems, clearSelection } = useSelectionStore();
  const addToast = useToastStore((s) => s.addToast);
  const [isProcessing, setIsProcessing] = useState(false);

  if (selectedItems.length === 0) return null;

  const allFiles = selectedItems.every(i => i.type === 'file');

  const handleDelete = async () => {
    if (!confirm(`Delete ${selectedItems.length} items permanently?`)) return;
    setIsProcessing(true);
    addToast('info', `Deleting ${selectedItems.length} items...`);
    
    let successCount = 0;
    let failCount = 0;
    
    for (const selected of selectedItems) {
      try {
        if (selected.type !== 'file') {
          throw new Error('Only files can be deleted via bulk action');
        }
        await api.deleteFile(selected.item.id);
        successCount++;
      } catch (error) {
        console.error('Deletion failed for item:', selected, error);
        failCount++;
      }
    }
    
    if (failCount === 0) {
      addToast('success', `✅ Deleted ${successCount} items`);
    } else {
      addToast('error', `⚠️ Deleted ${successCount} items, ${failCount} failed`);
    }
    
    setIsProcessing(false);
    clearSelection();
    onActionComplete();
  };

  return (
    <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 flex items-center justify-between bg-white/80 backdrop-blur-md border border-gray-200 text-gray-800 rounded-full shadow-2xl px-6 py-3 min-w-[500px]">
      <div className="flex items-center gap-4 border-r border-gray-200 pr-4">
        <button onClick={clearSelection} disabled={isProcessing} className="p-1.5 hover:bg-gray-100 text-gray-500 rounded-full transition-colors">
          <X size={18} />
        </button>
        <span className="font-medium text-sm text-blue-600 bg-blue-50 px-2.5 py-0.5 rounded-full">{selectedItems.length} selected</span>
      </div>
      <div className="flex items-center gap-2 pl-2">
        <button onClick={handleDelete} disabled={isProcessing} className="flex items-center gap-2 px-3 py-1.5 hover:bg-red-50 text-gray-600 hover:text-red-600 rounded-full transition-colors text-sm font-medium" title="Delete selected items">
          <Trash2 size={16} /> Delete
        </button>
        <button onClick={onMoveRequested} disabled={isProcessing} className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-100 text-gray-600 rounded-full transition-colors text-sm font-medium" title="Move selected items">
          <Folder size={16} /> Move
        </button>
        <button 
          onClick={onMoveDriveRequested} 
          disabled={isProcessing || !allFiles} 
          className={`flex items-center gap-2 px-3 py-1.5 rounded-full transition-colors text-sm font-medium ${!allFiles ? 'opacity-50 cursor-not-allowed text-gray-400' : 'hover:bg-gray-100 text-gray-600'}`} 
          title={!allFiles ? 'Can only move files to another drive' : 'Move to another drive'}
        >
          <HardDrive size={16} /> Move Drive
        </button>
        <button 
          onClick={onWorkspaceRequested} 
          disabled={isProcessing || !allFiles} 
          className={`flex items-center gap-2 px-3 py-1.5 rounded-full transition-colors text-sm font-medium ${!allFiles ? 'opacity-50 cursor-not-allowed text-gray-400' : 'hover:bg-gray-100 text-gray-600'}`} 
          title={!allFiles ? 'Can only add files to Workspace' : 'Add to Workspace'}
        >
          <Star size={16} /> Workspace
        </button>
      </div>
    </div>
  );
};
