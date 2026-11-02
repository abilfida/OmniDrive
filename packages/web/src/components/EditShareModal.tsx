import { useState } from 'react';
import { X, Calendar, Lock, Settings, ChevronDown, ChevronUp } from 'lucide-react';
import { updateSharedLink, SharedLink } from '../lib/api';
import { useSharedStore } from '../stores/sharedStore';
import { useToastStore } from '../stores/toastStore';
import { useEscapeToClose } from '../hooks/useEscapeToClose';

interface EditShareModalProps {
  link: SharedLink;
  onClose: () => void;
}

export function EditShareModal({ link, onClose }: EditShareModalProps) {
  // Extract datetime-local suitable string from ISO date string
  const getInitialDate = (isoString: string | null) => {
    if (!isoString) return '';
    const date = new Date(isoString);
    // Adjust to local timezone for datetime-local input
    const offset = date.getTimezoneOffset() * 60000;
    const localISOTime = (new Date(date.getTime() - offset)).toISOString().slice(0, 16);
    return localISOTime;
  };

  // We don't load the password_hash, we just allow setting a new password.
  const [password, setPassword] = useState('');
  const [expiresAt, setExpiresAt] = useState(getInitialDate(link.expiresAt));
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [allowDownloads, setAllowDownloads] = useState(link.allowDownloads);
  const [allowUploads, setAllowUploads] = useState(link.allowUploads);
  const [maxDownloads, setMaxDownloads] = useState(link.maxDownloads ? String(link.maxDownloads) : '');
  const [requireEmail, setRequireEmail] = useState(link.requireEmail);
  const [webhookUrl, setWebhookUrl] = useState(link.webhookUrl || '');
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { addToast } = useToastStore();

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      let isoExpiresAt = undefined;
      if (expiresAt) {
        const [datePart, timePart] = expiresAt.split('T');
        const [year, month, day] = datePart.split('-').map(Number);
        const [hour, minute] = timePart.split(':').map(Number);
        isoExpiresAt = new Date(year, month - 1, day, hour, minute).toISOString();
      }

      await updateSharedLink(link.id, {
        password: password === '' ? null : password,
        expiresAt: expiresAt ? isoExpiresAt : null, // send null if explicitly cleared
        allowDownloads,
        allowUploads: link.targetType === 'folder' ? allowUploads : false,
        maxDownloads: maxDownloads ? parseInt(maxDownloads, 10) : null,
        requireEmail,
        webhookUrl: webhookUrl || undefined
      });
      
      useSharedStore.getState().fetchSharedLinks();
      addToast('success', 'Shared link settings updated successfully');
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to update shared link');
    } finally {
      setLoading(false);
    }
  };

  const currentDateTime = new Date().toISOString().slice(0, 16);

  useEscapeToClose(onClose);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/50 backdrop-blur-sm" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden flex flex-col max-h-full" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center p-5 border-b border-gray-100 shrink-0">
          <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
            <Settings size={20} className="text-blue-500" />
            Edit Settings
          </h2>
          <button className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors shrink-0" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="p-6 overflow-y-auto">
          {error && (
            <div className="text-red-500 mb-4 text-sm bg-red-50 p-3 rounded-lg border border-red-100">
              {error}
            </div>
          )}

          <form onSubmit={handleUpdate} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-gray-700 flex items-center gap-1.5">
                <Lock size={14} className="text-gray-400" /> New Password (optional)
              </label>
              <input
                type="password"
                placeholder="Leave blank to keep current password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-shadow"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-gray-700 flex items-center gap-1.5">
                <Calendar size={14} className="text-gray-400" /> Expiration Date (optional)
              </label>
              <input
                type="datetime-local"
                value={expiresAt}
                min={currentDateTime}
                onChange={(e) => setExpiresAt(e.target.value)}
                className="px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-shadow"
              />
            </div>

            <div className="pt-2">
              <button 
                type="button" 
                onClick={() => setShowAdvanced(!showAdvanced)} 
                className="flex items-center text-sm font-medium text-gray-600 hover:text-gray-800 transition-colors"
              >
                <Settings size={14} className="mr-1.5" />
                Advanced Settings
                {showAdvanced ? <ChevronUp size={14} className="ml-1" /> : <ChevronDown size={14} className="ml-1" />}
              </button>

              {showAdvanced && (
                <div className="flex flex-col gap-3 mt-3 p-4 bg-gray-50 rounded-xl border border-gray-200">
                  <label className="flex items-center gap-2.5 text-sm text-gray-700 cursor-pointer">
                    <input 
                      type="checkbox" 
                      checked={allowDownloads} 
                      onChange={(e) => setAllowDownloads(e.target.checked)} 
                      className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer" 
                    />
                    <span className="select-none">Allow Downloads</span>
                  </label>
                  
                  {link.targetType === 'folder' && (
                    <label className="flex items-center gap-2.5 text-sm text-gray-700 cursor-pointer">
                      <input 
                        type="checkbox" 
                        checked={allowUploads} 
                        onChange={(e) => setAllowUploads(e.target.checked)} 
                        className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer" 
                      />
                      <span className="select-none">Allow Uploads (Public Drop folder)</span>
                    </label>
                  )}

                  <label className="flex items-center gap-2.5 text-sm text-gray-700 cursor-pointer">
                    <input 
                      type="checkbox" 
                      checked={requireEmail} 
                      onChange={(e) => setRequireEmail(e.target.checked)} 
                      className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer" 
                    />
                    <span className="select-none">Require Email to View</span>
                  </label>

                  <div className="flex flex-col gap-1.5 mt-2">
                    <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Max Downloads</label>
                    <input 
                      type="number" 
                      min="1" 
                      value={maxDownloads} 
                      onChange={(e) => setMaxDownloads(e.target.value)} 
                      placeholder="e.g. 10 (Leave blank for unlimited)" 
                      className="px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" 
                    />
                  </div>

                  <div className="flex flex-col gap-1.5 mt-2">
                    <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Webhook URL</label>
                    <input 
                      type="url" 
                      value={webhookUrl} 
                      onChange={(e) => setWebhookUrl(e.target.value)} 
                      placeholder="e.g. https://your-api.com/webhook" 
                      className="px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" 
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 mt-4 pt-4 border-t border-gray-100">
              <button 
                type="button" 
                className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors" 
                onClick={onClose}
              >
                Cancel
              </button>
              <button 
                type="submit" 
                className="flex items-center justify-center min-w-[100px] px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed" 
                disabled={loading}
              >
                {loading ? (
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  'Save Settings'
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
