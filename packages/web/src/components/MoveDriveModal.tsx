import { useState } from 'react';
import { HardDrive, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { useDriveStore } from '../stores/driveStore';
import { api } from '../lib/api';
import { FileEntry, DriveAccount } from '../types';
import { formatFileSize } from '../lib/utils';
import { useToastStore } from '../stores/toastStore';

interface MoveDriveModalProps {
  files: FileEntry[];
  onClose: () => void;
  onSuccess: () => void;
  onError: (error: any) => void;
}

export function MoveDriveModal({ files, onClose, onSuccess, onError }: MoveDriveModalProps) {
  const { drives } = useDriveStore();
  const addToast = useToastStore((s) => s.addToast);
  const [isMoving, setIsMoving] = useState(false);
  const [movingToDriveId, setMovingToDriveId] = useState<string | null>(null);

  // Consider all drives that are not the source of EVERY file.
  // Simplest is to just show all drives, but for UX, exclude if it's the exact same drive for the single file.
  const availableDrives = files.length === 1 
    ? drives.filter(d => d.id !== files[0].driveAccountId)
    : drives;

  const handleMove = async (drive: DriveAccount) => {
    if (files.length === 0) return;
    try {
      setIsMoving(true);
      setMovingToDriveId(drive.id);
      
      let successCount = 0;
      let failCount = 0;
      
      for (const file of files) {
        if (file.driveAccountId === drive.id) {
          // Skip if already in this drive
          continue;
        }
        try {
          await api.moveFileToDrive(file.id, drive.id);
          successCount++;
        } catch (e) {
          failCount++;
        }
      }
      
      if (failCount === 0 && successCount > 0) {
        addToast('success', `✅ Moved ${successCount} item(s) to ${drive.email}`);
      } else if (failCount > 0) {
        addToast('error', `⚠️ Moved ${successCount} item(s), ${failCount} failed`);
      } else if (successCount === 0 && failCount === 0) {
        addToast('info', 'Items are already in the selected drive');
      }
      
      if (successCount > 0) {
        onSuccess();
      } else {
        onClose();
      }
    } catch (err) {
      onError(err);
    } finally {
      setIsMoving(false);
      setMovingToDriveId(null);
    }
  };

  return (
    <Dialog open={files.length > 0} onOpenChange={(open) => !open && !isMoving && onClose()}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Move to Another Drive</DialogTitle>
          <DialogDescription>
            Select a destination drive to move {files.length} item(s). This may take a moment depending on the file size.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          {availableDrives.length === 0 ? (
            <p className="text-sm text-center text-muted-foreground py-4">
              No other drives available. Please connect another Google Drive account.
            </p>
          ) : (
            availableDrives.map(drive => (
              <button
                key={drive.id}
                onClick={() => handleMove(drive)}
                disabled={isMoving}
                className={`flex items-center p-3 border rounded-lg transition-colors text-left ${
                  isMoving && movingToDriveId !== drive.id 
                    ? 'opacity-50 cursor-not-allowed' 
                    : 'hover:bg-accent hover:text-accent-foreground'
                } ${isMoving && movingToDriveId === drive.id ? 'ring-2 ring-primary border-primary bg-accent' : ''}`}
              >
                <div className="flex-shrink-0 mr-4">
                  {isMoving && movingToDriveId === drive.id ? (
                    <Loader2 className="w-5 h-5 text-primary animate-spin" />
                  ) : (
                    <HardDrive className="w-5 h-5 text-muted-foreground" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {drive.email}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Free space: {formatFileSize(drive.freeSpace)}
                  </p>
                </div>
              </button>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
