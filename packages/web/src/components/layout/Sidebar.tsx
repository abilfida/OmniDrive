import React from 'react';
import { useUIStore } from '../../stores/useUIStore';
import { useUploadStore } from '../../stores/uploadStore';
import { useDriveStore } from '../../stores/driveStore';
import { useAuthStore } from '../../stores/authStore';
import { NavLink } from 'react-router-dom';
import {
  HardDrive,
  Monitor,
  Users,
  Trash2,
  Plus,
  Settings,
  Clock,
  Star,
  FolderTree,
  Shield,
} from 'lucide-react';
import { formatFileSize } from '../../lib/utils';

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `flex items-center gap-3 px-4 py-2 rounded-full cursor-pointer transition-colors text-sm ${
    isActive ? 'bg-blue-100 text-gray-900 font-medium' : 'hover:bg-gray-100 text-gray-700'
  }`;

export const Sidebar: React.FC = () => {
  const isSidebarOpen = useUIStore((state) => state.isSidebarOpen);
  const setShowModal = useUploadStore((state) => state.setShowModal);
  const { aggregate } = useDriveStore();
  const { user } = useAuthStore();

  if (!isSidebarOpen) return null;

  const usagePercentage = aggregate.totalQuota > 0
    ? Math.min((aggregate.totalUsed / aggregate.totalQuota) * 100, 100)
    : 0;

  return (
    <aside className="w-64 bg-surface h-full flex flex-col p-3 gap-1 flex-shrink-0">
      {/* New button */}
      <div className="px-1 py-2 mb-1">
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-3 bg-white text-gray-700 rounded-2xl px-5 py-3.5 shadow-sm w-max hover:shadow-md hover:bg-gray-50 transition-all font-medium ml-1 text-sm"
        >
          <Plus size={20} className="text-primary" />
          New
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex flex-col gap-0.5">
        <NavLink to="/files/root" className={navLinkClass}>
          <HardDrive size={20} />
          <span>My Drive</span>
        </NavLink>
        <NavLink to="/" end className={navLinkClass}>
          <Clock size={20} />
          <span>Recent</span>
        </NavLink>
        <NavLink to="/starred" className={navLinkClass}>
          <Star size={20} />
          <span>Starred</span>
        </NavLink>
        <NavLink to="/shared" className={navLinkClass}>
          <Users size={20} />
          <span>Shared</span>
        </NavLink>
        <div className="flex items-center gap-3 px-4 py-2 hover:bg-gray-100 rounded-full cursor-pointer text-gray-700 text-sm">
          <Monitor size={20} />
          <span>Computers</span>
        </div>
        <NavLink to="/workspaces" className={navLinkClass}>
          <FolderTree size={20} />
          <span>Workspaces</span>
        </NavLink>
        <NavLink to="/trash" className={navLinkClass}>
          <Trash2 size={20} />
          <span>Trash</span>
        </NavLink>
        {user?.role === 'super_admin' && (
          <NavLink to="/admin/users" className={navLinkClass}>
            <Shield size={20} />
            <span>Users</span>
          </NavLink>
        )}
      </nav>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Settings link */}
      <NavLink to="/settings" className={navLinkClass}>
        <Settings size={20} />
        <span>Settings</span>
      </NavLink>

      {/* Storage quota */}
      {aggregate.totalQuota > 0 && (
        <div className="px-4 py-3 mt-1">
          <div className="h-1.5 w-full bg-gray-200 rounded-full overflow-hidden mb-2">
            <div
              className="h-full rounded-full bg-blue-500 transition-all"
              style={{ width: `${usagePercentage}%` }}
            />
          </div>
          <p className="text-xs text-gray-500">
            {formatFileSize(aggregate.totalUsed)} of {formatFileSize(aggregate.totalQuota)} used
          </p>
          <NavLink
            to="/settings"
            className="text-xs text-blue-600 hover:underline mt-1 block"
          >
            Manage storage
          </NavLink>
        </div>
      )}
    </aside>
  );
};
