import { useEffect, useState, useCallback, ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import { getSharedMeta, verifySharedPassword, SharedMetaResponse } from '../lib/api';
import { formatFileSize } from '../lib/utils';
import { FileIcon } from '../components/files/FileIcon';
import { Lock, Download, AlertCircle, Loader2, Folder } from 'lucide-react';

export function PublicSharedPage() {
  const { id } = useParams<{ id: string }>();
  const [loading, setLoading] = useState(true);
  const [meta, setMeta] = useState<SharedMetaResponse | null>(null);
  const [error, setError] = useState('');
  
  const [password, setPassword] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [passwordError, setPasswordError] = useState('');

  const loadMeta = useCallback(async (skipLoadingState = false) => {
    if (!id) {
      setLoading(false);
      setError('Invalid link ID');
      return;
    }
    try {
      if (!skipLoadingState) setLoading(true);
      setError('');
      const data = await getSharedMeta(id);
      setMeta(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message || 'Failed to load shared link');
    } finally {
      if (!skipLoadingState) setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadMeta();
  }, [loadMeta]);

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !password) return;
    
    try {
      setVerifying(true);
      setPasswordError('');
      await verifySharedPassword(id, password);
      await loadMeta(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setPasswordError(message || 'Incorrect password');
    } finally {
      setVerifying(false);
    }
  };

  const handleDownload = () => {
    if (!id) return;
    const apiUrl = import.meta.env.VITE_API_URL || '';
    window.location.href = `${apiUrl}/api/shared/${id}/download`;
  };

  const renderContent = (): ReactNode => {
    if (loading) {
      return (
        <div className="bg-white p-10 rounded-2xl shadow-xl max-w-md w-full border border-gray-100 flex flex-col items-center">
          <Loader2 className="animate-spin text-blue-500 mb-4" size={48} />
          <p className="text-gray-500 font-medium">Loading...</p>
        </div>
      );
    }

    if (error) {
      return (
        <div className="bg-white p-10 rounded-2xl shadow-xl max-w-md w-full border border-red-200 flex flex-col items-center">
          <AlertCircle size={48} className="text-red-500 mb-4" />
          <h2 className="text-2xl font-bold text-gray-800 mb-2">Error</h2>
          <p className="text-gray-500">{error}</p>
        </div>
      );
    }

    if (meta?.requiresPassword) {
      return (
        <div className="bg-white p-10 rounded-2xl shadow-xl max-w-md w-full border border-gray-100">
          <div className="text-center mb-8">
            <div className="flex justify-center mb-4">
              <Lock size={48} className="text-blue-500" />
            </div>
            <h2 className="text-2xl font-bold text-gray-800 mb-2">Password Required</h2>
            <p className="text-gray-500">This shared link is protected by a password.</p>
          </div>

          <form onSubmit={handlePasswordSubmit}>
            <div className="mb-4">
              <input
                type="password"
                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                placeholder="Enter password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoFocus
              />
            </div>
            
            {passwordError && (
              <p className="text-red-500 text-sm mb-4">{passwordError}</p>
            )}

            <button
              type="submit"
              className="w-full flex items-center justify-center gap-2 px-4 py-3 text-white bg-blue-600 rounded-xl font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed mt-6"
              disabled={verifying || !password}
            >
              {verifying && <Loader2 className="animate-spin" size={18} />}
              Unlock
            </button>
          </form>
        </div>
      );
    }

    return (
      <div className="bg-white p-10 rounded-2xl shadow-xl max-w-md w-full border border-gray-100 text-center">
        {meta?.type === 'folder' ? (
          <div className="mb-8">
            <div className="mb-4 flex justify-center"><Folder size={72} className="text-blue-500" fill="currentColor" /></div>
            <h2 className="text-2xl font-bold text-gray-800 mb-2">Shared Folder</h2>
            <p className="text-gray-500">Folder view is not supported yet.</p>
          </div>
        ) : (
          <div className="mb-8">
            <div className="text-7xl mb-4 leading-none flex justify-center"><FileIcon mimeType={meta?.target?.mimeType || null} /></div>
            <h2 className="text-2xl font-bold text-gray-800 mb-2 break-words">{meta?.target?.name || 'Unknown File'}</h2>
            {typeof meta?.target?.size === 'number' && (
              <p className="text-gray-500">{formatFileSize(meta.target.size)}</p>
            )}
          </div>
        )}

        <button
          onClick={handleDownload}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 text-white bg-blue-600 rounded-xl font-medium hover:bg-blue-700 transition-colors shadow-sm mt-8"
        >
          <Download size={20} />
          Download
        </button>
      </div>
    );
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
      {renderContent()}
    </div>
  );
}
