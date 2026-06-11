import { useEffect, useState, useCallback } from 'react';
import { useDriveStore } from '../stores/driveStore';
import { QuotaBar } from '../components/QuotaBar';
import { FileGrid } from '../components/files/FileGrid';
import { ShareModal } from '../components/ShareModal';
import { MoveDriveModal } from '../components/MoveDriveModal';
import { FilePreviewModal } from '../components/FilePreviewModal';
import { formatFileSize, getDriveColor } from '../lib/utils';
import { api } from '../lib/api';
import { useSharedStore } from '../stores/sharedStore';
import { HardDrive, RefreshCw, TrendingUp, Clock } from 'lucide-react';
import { useToastStore } from '../stores/toastStore';
import type { FileEntry } from '../types';

export function DashboardPage() {
  const { drives, aggregate, isLoading, fetchDrives } = useDriveStore();
  const [recentFiles, setRecentFiles] = useState<FileEntry[]>([]);
  const [recentFolders, setRecentFolders] = useState<any[]>([]);
  const [shareTarget, setShareTarget] = useState<{ id: string, type: 'file' | 'folder' } | null>(null);
  const [moveFileTarget, setMoveFileTarget] = useState<FileEntry | null>(null);
  const [previewFile, setPreviewFile] = useState<FileEntry | null>(null);
  const { addToast } = useToastStore();
  
  const { fetchSharedLinks, isTargetShared } = useSharedStore();

  const refreshRecent = useCallback(() => {
    api.getRecentFiles().then((data) => {
      setRecentFiles(data.files.slice(0, 12));
      setRecentFolders(data.folders ? data.folders.slice(0, 12) : []);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    fetchDrives();
    fetchSharedLinks();
    refreshRecent();
  }, [fetchDrives, fetchSharedLinks, refreshRecent]);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-800">Home</h1>
        <button
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          onClick={() => fetchDrives()}
        >
          <RefreshCw size={14} />
          Refresh
        </button>
      </div>

      {/* Aggregate Quota */}
      {aggregate.driveCount > 0 && (
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-100 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <TrendingUp size={18} className="text-blue-600" />
              <span className="font-semibold text-gray-800">Total Storage</span>
            </div>
            <span className="text-sm text-gray-500">
              {aggregate.driveCount} drive{aggregate.driveCount > 1 ? 's' : ''} connected
            </span>
          </div>
          <QuotaBar used={aggregate.totalUsed} total={aggregate.totalQuota} />
          <div className="flex gap-4 mt-3 text-sm text-gray-500">
            <span className="text-blue-700 font-medium">{formatFileSize(aggregate.totalUsed)} used</span>
            <span>·</span>
            <span>{formatFileSize(aggregate.totalFree)} free</span>
            <span>·</span>
            <span>{formatFileSize(aggregate.totalQuota)} total</span>
          </div>
        </div>
      )}

      {/* Per-Drive Quota */}
      {drives.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Connected Drives</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {drives.map((drive, i) => (
              <div key={drive.id} className="bg-white border border-gray-200 rounded-xl p-4 hover:shadow-sm transition-shadow">
                <div className="flex items-center gap-3 mb-3">
                  <div
                    className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: getDriveColor(i) }}
                  >
                    <HardDrive size={16} color="white" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-gray-800 truncate">{drive.email}</div>
                    <div className="text-xs text-gray-400">
                      {drive.type === 'service_account' ? 'Service Account' : 'OAuth'}
                      {drive.isPrimary && <span className="ml-1.5 text-blue-600 font-medium">· Primary</span>}
                    </div>
                  </div>
                </div>
                <QuotaBar used={drive.usedQuota} total={drive.totalQuota} color={getDriveColor(i)} showLabel={false} />
                <div className="flex justify-between mt-2 text-xs text-gray-400">
                  <span>{formatFileSize(drive.usedQuota)} used</span>
                  <span>{drive.usagePercent}%</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent */}
      {(recentFiles.length > 0 || recentFolders.length > 0) && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Clock size={16} className="text-gray-400" />
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Recent</h2>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <FileGrid
              files={recentFiles}
              subfolders={recentFolders}
              getDriveInfo={(driveAccountId) => {
                if (!driveAccountId) return { drive: null, index: 0 };
                const index = drives.findIndex((d) => d.id === driveAccountId);
                if (index === -1) return { drive: drives[0] || null, index: 0 };
                return { drive: drives[index], index };
              }}
              onShare={(id, type) => setShareTarget({ id, type })}
              onMoveDrive={setMoveFileTarget}
              onPreviewFile={setPreviewFile}
              isTargetShared={isTargetShared}
              viewMode="list"
            />
          </div>
        </div>
      )}

      {isLoading && (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        </div>
      )}

      {shareTarget && (
        <ShareModal
          targetType={shareTarget.type}
          targetId={shareTarget.id}
          onClose={() => setShareTarget(null)}
        />
      )}

      {moveFileTarget && (
        <MoveDriveModal
          file={moveFileTarget}
          onClose={() => setMoveFileTarget(null)}
          onSuccess={() => {
            setMoveFileTarget(null);
            refreshRecent();
            addToast('success', 'File moved successfully');
          }}
          onError={(msg) => addToast('error', msg)}
        />
      )}

      {previewFile && (
        <FilePreviewModal
          file={previewFile}
          onClose={() => setPreviewFile(null)}
        />
      )}
    </div>
  );
}
