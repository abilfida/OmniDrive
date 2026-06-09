import React, { useState } from 'react';
import { useAuthStore } from '../stores/authStore';
import { ShieldAlert, Plus, MoreVertical } from 'lucide-react';
import type { User } from '../types';
import { InviteUserModal } from '../components/admin/InviteUserModal';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog';

export const AdminUsersPage: React.FC = () => {
  const { user } = useAuthStore();
  const [users, setUsers] = useState<User[]>([
    {
      id: '1', googleId: 'g1', email: 'admin@omnidrive.com', name: 'Admin One', 
      avatarUrl: null, role: 'super_admin', status: 'active', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
    },
    {
      id: '3', googleId: 'g3', email: 'user2@omnidrive.com', name: 'User Three', 
      avatarUrl: null, role: 'member', status: 'active', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
    }
  ]);
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<string | null>(null);

  if (user?.role !== 'super_admin') {
    return (
      <div className="flex flex-col items-center justify-center h-full text-gray-500">
        <ShieldAlert size={48} className="text-red-400 mb-4" />
        <h2 className="text-xl font-medium text-gray-800">Access Denied</h2>
        <p className="mt-2">You do not have permission to view this page.</p>
      </div>
    );
  }

  const handleInvite = (email: string, role: 'super_admin' | 'member') => {
    console.log('Inviting', email, role);
    setIsInviteModalOpen(false);
  };

  const handleToggleStatus = (id: string, currentStatus: 'active' | 'blocked' | undefined) => {
    const newStatus = currentStatus === 'blocked' ? 'active' : 'blocked';
    setUsers(prevUsers => prevUsers.map(userItem => userItem.id === id ? { ...userItem, status: newStatus } : userItem));
  };

  const confirmDelete = () => {
    if (userToDelete) {
      setUsers(prevUsers => prevUsers.filter(userItem => userItem.id !== userToDelete));
      setUserToDelete(null);
    }
  };

  return (
    <div className="p-6 h-full overflow-y-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-gray-800">User Management</h1>
        <button
          onClick={() => setIsInviteModalOpen(true)}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition-colors"
        >
          <Plus size={20} />
          <span>Invite User</span>
        </button>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase">Name</th>
              <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase">Email</th>
              <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase">Role</th>
              <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {users.map((userItem) => (
              <tr key={userItem.id} className="hover:bg-gray-50">
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-medium overflow-hidden">
                      {userItem.avatarUrl ? <img src={userItem.avatarUrl} alt="" className="w-full h-full object-cover" /> : userItem.name.charAt(0).toUpperCase()}
                    </div>
                    <span className="text-sm font-medium text-gray-900">{userItem.name}</span>
                  </div>
                </td>
                <td className="px-6 py-4 text-sm text-gray-500">{userItem.email}</td>
                <td className="px-6 py-4 text-sm">
                  <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${userItem.role === 'super_admin' ? 'bg-purple-100 text-purple-800' : 'bg-gray-100 text-gray-800'}`}>
                    {userItem.role || 'member'}
                  </span>
                </td>
                <td className="px-6 py-4 text-sm">
                  <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${userItem.status === 'blocked' ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'}`}>
                    {userItem.status || 'active'}
                  </span>
                </td>
                <td className="px-6 py-4 text-sm text-gray-500">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button className="p-1 hover:bg-gray-200 rounded text-gray-500">
                        <MoreVertical size={16} />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="bg-white shadow-xl rounded-xl border border-gray-200 w-40">
                      <DropdownMenuItem className="cursor-pointer" onClick={() => handleToggleStatus(userItem.id, userItem.status)}>
                        {userItem.status === 'blocked' ? 'Unblock User' : 'Block User'}
                      </DropdownMenuItem>
                      <DropdownMenuItem className="cursor-pointer text-red-600 focus:text-red-600 focus:bg-red-50" onClick={() => setUserToDelete(userItem.id)}>
                        Delete User
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {isInviteModalOpen && (
        <InviteUserModal onClose={() => setIsInviteModalOpen(false)} onSubmit={handleInvite} />
      )}

      <Dialog open={!!userToDelete} onOpenChange={(open) => !open && setUserToDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete User</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this user? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button
              onClick={() => setUserToDelete(null)}
              className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={confirmDelete}
              className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
            >
              Delete
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
