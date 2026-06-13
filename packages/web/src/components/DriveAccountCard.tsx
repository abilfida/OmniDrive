import { HardDrive, RefreshCw, Trash2 } from 'lucide-react';
import type { DriveAccount } from '../types';
import { QuotaBar } from './QuotaBar';
import { formatFileSize, getDriveColor } from '../lib/utils';
import { useState } from 'react';

interface DriveAccountCardProps {
  drive: DriveAccount;
  index: number;
  onSync: (id: string) => Promise<void>;
  onDisconnect: (id: string) => Promise<void>;
}

export function DriveAccountCard({ drive, index, onSync, onDisconnect }: DriveAccountCardProps) {
  const [syncing, setSyncing] = useState(false);
  const color = getDriveColor(index);
  
  const isSyncing = syncing || drive.syncStatus === 'syncing';

  const handleSync = async () => {
    setSyncing(true);
    try { await onSync(drive.id); } finally { setSyncing(false); }
  };

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-5 hover:shadow-sm transition-shadow">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: color }}
          >
            <HardDrive size={18} color="white" />
          </div>
          <div>
            <div className="text-sm font-semibold text-gray-800">{drive.email}</div>
            <div className="text-xs text-gray-400">
              {drive.type === 'service_account' ? 'Service Account' : 'OAuth'}
              {drive.isPrimary && <span className="ml-1.5 text-blue-500 font-medium">· Primary</span>}
            </div>
            {drive.lastSyncedAt && (
              <div className="text-[10px] text-gray-400 mt-0.5">
                Last synced: {new Date(drive.lastSyncedAt).toLocaleString()}
              </div>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <button
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-50 border border-gray-200 rounded-lg hover:bg-gray-100 transition-colors disabled:opacity-50"
            onClick={handleSync}
            disabled={isSyncing}
          >
            <RefreshCw size={12} className={isSyncing ? 'animate-spin' : ''} />
            {isSyncing ? 'Syncing...' : 'Sync'}
          </button>
          {!drive.isPrimary && (
            <button
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-600 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 transition-colors"
              onClick={() => {
                if (confirm(`Disconnect ${drive.email}? Files from this drive will be removed from Omnidrive.`)) {
                  onDisconnect(drive.id);
                }
              }}
            >
              <Trash2 size={12} />
              Disconnect
            </button>
          )}
        </div>
      </div>

      <QuotaBar used={drive.usedQuota} total={drive.totalQuota} color={color} showLabel={false} />
      <div className="flex justify-between mt-2 text-xs text-gray-400">
        <span>{formatFileSize(drive.freeSpace)} free of {formatFileSize(drive.totalQuota)}</span>
        <span>{drive.usagePercent}%</span>
      </div>
    </div>
  );
}
