import { useEffect, useState } from 'react';
import { useDriveStore } from '../stores/driveStore';
import { DriveAccountCard } from '../components/DriveAccountCard';
import { useToastStore } from '../stores/toastStore';
import { useAuthStore } from '../stores/authStore';
import { AdminInvitations } from '../components/admin/AdminInvitations';
import { Plus, Key, X } from 'lucide-react';

export function SettingsPage() {
  const { drives, fetchDrives, removeDrive, triggerSync } = useDriveStore();
  const { addToast } = useToastStore();
  const { user } = useAuthStore();
  const [showSaForm, setShowSaForm] = useState(false);
  const [saCredentials, setSaCredentials] = useState('');
  const [saFolderId, setSaFolderId] = useState('');

  useEffect(() => {
    fetchDrives();
  }, [fetchDrives]);

  const handleSync = async (id: string) => {
    try {
      await triggerSync(id);
      addToast('success', 'Sync completed');
      fetchDrives();
    } catch {
      addToast('error', 'Sync failed');
    }
  };

  const handleDisconnect = async (id: string) => {
    try {
      await removeDrive(id);
      addToast('success', 'Drive disconnected');
      fetchDrives();
    } catch {
      addToast('error', 'Failed to disconnect drive');
    }
  };

  const handleAddServiceAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const { api } = await import('../lib/api');
      await api.addServiceAccount(saCredentials, saFolderId);
      addToast('success', 'Service account added');
      setSaCredentials('');
      setSaFolderId('');
      setShowSaForm(false);
      fetchDrives();
    } catch {
      addToast('error', 'Failed to add service account');
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <h1 className="text-2xl font-semibold text-gray-800">Settings</h1>

      {/* Section: Connected Drives */}
      <div>
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Connected Drives</h2>
        <div className="space-y-3">
          {drives.map((drive, i) => (
            <DriveAccountCard
              key={drive.id}
              drive={drive}
              index={i}
              onSync={handleSync}
              onDisconnect={handleDisconnect}
            />
          ))}
          {drives.length === 0 && (
            <div className="text-center py-8 text-gray-400 border border-dashed border-gray-200 rounded-xl">
              No drives connected yet
            </div>
          )}
        </div>
      </div>

      {/* Section: Add Drive */}
      <div>
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Add Drive</h2>
        <div className="flex gap-3 flex-wrap">
          <a
            href={`${import.meta.env.VITE_API_URL ?? ''}/api/drives/connect`}
            className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors font-medium text-sm no-underline"
            style={{ textDecoration: 'none' }}
          >
            <Plus size={18} /> Add Google Drive
          </a>
          <button
            className="flex items-center gap-2 px-4 py-2.5 bg-white text-gray-700 rounded-xl border border-gray-300 hover:bg-gray-50 transition-colors font-medium text-sm"
            onClick={() => setShowSaForm(!showSaForm)}
          >
            <Key size={18} /> Add Service Account
          </button>
        </div>
      </div>

      {/* Service Account Form */}
      {showSaForm && (
        <div className="bg-white border border-gray-200 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold text-gray-800">Add Service Account</h3>
            <button
              onClick={() => setShowSaForm(false)}
              className="p-1.5 hover:bg-gray-100 rounded-full text-gray-500 transition-colors"
            >
              <X size={18} />
            </button>
          </div>
          <form onSubmit={handleAddServiceAccount} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Service Account JSON
              </label>
              <textarea
                value={saCredentials}
                onChange={(e) => setSaCredentials(e.target.value)}
                placeholder="Paste service account JSON key..."
                rows={6}
                className="w-full font-mono text-xs border border-gray-300 rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Shared Folder ID
              </label>
              <input
                type="text"
                value={saFolderId}
                onChange={(e) => setSaFolderId(e.target.value)}
                placeholder="Google Drive folder ID shared with SA"
                className="w-full border border-gray-300 rounded-xl p-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
            <div className="flex gap-3 justify-end pt-2">
              <button
                type="button"
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-xl hover:bg-gray-50 transition-colors"
                onClick={() => setShowSaForm(false)}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-xl hover:bg-blue-700 transition-colors"
              >
                Add Account
              </button>
            </div>
          </form>
        </div>
      )}
      {user?.role === 'super_admin' && <AdminInvitations />}
    </div>
  );
}
