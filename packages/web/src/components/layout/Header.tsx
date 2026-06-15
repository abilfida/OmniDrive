import React from 'react';
import { Menu, LogOut } from 'lucide-react';
import { useUIStore } from '../../stores/useUIStore';
import { useAuthStore } from '../../stores/authStore';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import { Omnibar } from './Omnibar';

export const Header: React.FC = () => {
  const toggleSidebar = useUIStore((state) => state.toggleSidebar);
  const { user, logout } = useAuthStore();

  const getInitials = (name: string) => name ? name.charAt(0).toUpperCase() : 'U';

  return (
    <header className="flex items-center justify-between px-2 py-2 bg-surface h-16 w-full gap-4">
      <div className="flex items-center min-w-[240px] px-2 gap-4">
        <button 
          onClick={toggleSidebar}
          className="p-2 hover:bg-gray-200 rounded-full text-gray-700 transition-colors"
        >
          <Menu size={24} />
        </button>
        <div className="flex items-center gap-2">
          <img src="/logo.png" alt="OmniDrive" className="w-8 h-8 object-contain flex-shrink-0" />
          <span className="text-xl text-gray-700 font-medium tracking-wide">OmniDrive</span>
        </div>
      </div>
      
      <Omnibar />
      
      <div className="flex items-center gap-2 px-2 text-gray-600">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center font-medium cursor-pointer hover:bg-blue-700 select-none overflow-hidden">
              {user?.avatarUrl ? (
                <img src={user.avatarUrl} alt={user.name} className="w-full h-full object-cover" />
              ) : (
                <span>{getInitials(user?.name || 'User')}</span>
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56 bg-white shadow-xl rounded-xl border border-gray-200">
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col space-y-1 py-1">
                <p className="text-sm font-medium leading-none text-gray-800">{user?.name || 'User'}</p>
                <p className="text-xs leading-none text-gray-500">{user?.email || 'user@example.com'}</p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator className="bg-gray-200" />
            <DropdownMenuItem 
              className="cursor-pointer text-red-600 focus:text-red-600 focus:bg-red-50"
              onClick={() => logout()}
            >
              <LogOut className="mr-2 h-4 w-4" />
              <span>Log out</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
};
