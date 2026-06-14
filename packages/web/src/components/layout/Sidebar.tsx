import React from 'react';
import { useUIStore } from '../../stores/useUIStore';
import { useAuthStore } from '../../stores/authStore';
import { NavLink } from 'react-router-dom';
import {
  HardDrive,
  Users,
  Trash2,
  Settings,
  Clock,
  Star,
  FolderTree,
  UserCog,
} from 'lucide-react';
import { SidebarStorage } from './SidebarStorage';

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `flex items-center gap-3 px-4 py-2 rounded-full cursor-pointer transition-colors text-sm ${
    isActive ? 'bg-blue-100 text-gray-900 font-medium' : 'hover:bg-gray-100 text-gray-700'
  }`;

export const Sidebar: React.FC = () => {
  const isSidebarOpen = useUIStore((state) => state.isSidebarOpen);
  const { user } = useAuthStore();

  if (!isSidebarOpen) return null;

  return (
    <aside className="w-64 bg-surface h-full flex flex-col p-3 gap-1 flex-shrink-0">


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
            <UserCog size={20} />
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
      <SidebarStorage />
    </aside>
  );
};
