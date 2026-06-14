import { X, Upload, Check, AlertCircle, Loader } from 'lucide-react';
import { useUploadStore } from '../stores/uploadStore';
import { useDriveStore } from '../stores/driveStore';
import { useToastStore } from '../stores/toastStore';
import { formatFileSize, getDriveColor } from '../lib/utils';
import { useState } from 'react';

interface UploadModalProps {
  folderId?: string;
  driveId?: string; // Optional: prepopulate if in a specific drive
  onClose: () => void;
  onSuccess: () => void;
}

export function UploadModal({ folderId, driveId, onClose, onSuccess }: UploadModalProps) {
  const { queue, isUploading, removeFile, startUpload, clearQueue } = useUploadStore();
  const { drives } = useDriveStore();
  const { addToast } = useToastStore();
  const [selectedDriveId, setSelectedDriveId] = useState<string>(driveId || '');

  const handleUpload = async () => {
    try {
      await startUpload(selectedDriveId || undefined, folderId);
      addToast('success', 'Upload completed');
      onSuccess();
    } catch {
      addToast('error', 'Upload failed');
    }
  };

  const handleClose = () => {
    if (!isUploading) {
      clearQueue();
      onClose();
    }
  };

  const allDone = queue.length > 0 && queue.every((item) => item.status === 'done' || item.status === 'error');

  const statusIcon = (status: string) => {
    switch (status) {
      case 'done': return <Check size={16} className="text-green-500" />;
      case 'error': return <AlertCircle size={16} className="text-red-500" />;
      case 'uploading':
      case 'confirming': return <Loader size={16} className="text-blue-500 animate-spin" />;
      default: return null;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/50 backdrop-blur-sm" onClick={handleClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden flex flex-col max-h-full" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center p-5 border-b border-gray-100 shrink-0">
          <h2 className="text-lg font-semibold text-gray-800">Upload Files</h2>
          <button className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors shrink-0" onClick={handleClose}>
            <X size={18} />
          </button>
        </div>

        {/* File list or File Picker */}
        <div className="max-h-[200px] overflow-y-auto px-6 py-2 border-b border-gray-100">
          {queue.length === 0 ? (
            <div className="py-8 flex flex-col items-center justify-center">
              <input 
                type="file" 
                multiple 
                onChange={(e) => {
                  if (e.target.files && e.target.files.length > 0) {
                    useUploadStore.getState().addFiles(Array.from(e.target.files));
                  }
                }} 
                className="hidden" 
                id="modal-file-upload" 
              />
              <label 
                htmlFor="modal-file-upload" 
                className="cursor-pointer flex flex-col items-center gap-3 text-gray-400 hover:text-blue-500 transition-colors"
              >
                <div className="w-12 h-12 bg-blue-50 rounded-full flex items-center justify-center text-blue-500">
                  <Upload size={24} />
                </div>
                <span className="text-sm font-medium">Click to select files</span>
              </label>
            </div>
          ) : (
            queue.map((item) => (
              <div key={item.id} className="flex items-center gap-3 py-3 border-b border-gray-50 last:border-0">
                <span className="flex-1 text-sm text-gray-700 truncate">{item.file.name}</span>
                <span className="text-xs text-gray-400 whitespace-nowrap">{formatFileSize(item.file.size)}</span>
                {item.status === 'uploading' && (
                  <span className="text-xs text-blue-600 min-w-[40px] text-right font-medium">{item.progress}%</span>
                )}
                <div className="w-4 h-4 flex items-center justify-center shrink-0">
                  {statusIcon(item.status)}
                </div>
                {item.status === 'pending' && !isUploading && (
                  <button 
                    className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-md transition-colors" 
                    onClick={() => removeFile(item.id)}
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            ))
          )}
        </div>

        {/* Drive selector */}
        {!isUploading && !allDone && (
          <div className="p-6 pb-2">
            <label className="block text-sm font-medium text-gray-700 mb-3">
              Target Drive
            </label>
            <div className="flex flex-col gap-2">
              <label className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer border transition-colors ${!selectedDriveId ? 'bg-blue-50 border-blue-200' : 'border-gray-200 hover:bg-gray-50'}`}>
                <input 
                  type="radio" 
                  name="drive" 
                  value="" 
                  checked={!selectedDriveId} 
                  onChange={() => setSelectedDriveId('')} 
                  className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-800">Auto (most free space)</span>
              </label>
              {drives.map((drive, i) => (
                <label key={drive.id} className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer border transition-colors ${selectedDriveId === drive.id ? 'bg-blue-50 border-blue-200' : 'border-gray-200 hover:bg-gray-50'}`}>
                  <input 
                    type="radio" 
                    name="drive" 
                    value={drive.id} 
                    checked={selectedDriveId === drive.id} 
                    onChange={() => setSelectedDriveId(drive.id)} 
                    className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                  />
                  <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: getDriveColor(i) }} />
                  <span className="text-sm text-gray-800 flex-1 truncate">{drive.email}</span>
                  <span className="text-xs text-gray-500 whitespace-nowrap">{formatFileSize(drive.freeSpace)} free</span>
                </label>
              ))}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="p-5 flex justify-end gap-3 shrink-0">
          {allDone ? (
            <button 
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors" 
              onClick={handleClose}
            >
              Done
            </button>
          ) : (
            <>
              <button 
                className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50" 
                onClick={handleClose} 
                disabled={isUploading}
              >
                Cancel
              </button>
              <button 
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed" 
                onClick={handleUpload} 
                disabled={isUploading || queue.length === 0}
              >
                {isUploading ? (
                  <><Loader size={16} className="animate-spin" /> Uploading...</>
                ) : (
                  <><Upload size={16} /> Upload</>
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
