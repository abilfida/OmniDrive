// packages/web/src/pages/LoginPage.tsx
import { useState } from 'react';
import { api } from '../lib/api';

export function LoginPage() {
  const [isRegister, setIsRegister] = useState(false);
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [invitationCode, setInvitationCode] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    try {
      if (isRegister) {
        await api.register({ name, username, password, email, invitation_code: invitationCode });
      } else {
        await api.login({ username, password });
      }
      window.location.href = '/';
    } catch (err: any) {
      setErrorMsg(err.message || 'Authentication failed');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 px-4">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 rounded-full bg-blue-200 opacity-30 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 rounded-full bg-indigo-200 opacity-30 blur-3xl" />
      </div>

      <div className="relative w-full max-w-sm">
        <div className="bg-white/80 backdrop-blur-sm rounded-3xl shadow-xl shadow-blue-900/10 border border-white/60 p-10 text-center">
          <h1 className="text-3xl font-bold text-gray-900 mb-1">OmniDrive</h1>
          <p className="text-gray-500 text-sm mb-8">
            Your unified Google Drive gateway
          </p>

          {errorMsg && (
            <div className="mb-6 px-4 py-3 rounded-xl bg-red-50 border border-red-100 text-red-600 text-sm">
              {errorMsg}
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex flex-col gap-4 text-left">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Username</label>
              <input type="text" required value={username} onChange={e => setUsername(e.target.value)} className="w-full px-4 py-2 border rounded-xl focus:ring-2 focus:ring-blue-500" />
            </div>
            
            {isRegister && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                  <input type="text" value={name} onChange={e => setName(e.target.value)} className="w-full px-4 py-2 border rounded-xl focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email (Optional)</label>
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)} className="w-full px-4 py-2 border rounded-xl focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Invitation Code (Required)</label>
                  <input type="text" required value={invitationCode} onChange={e => setInvitationCode(e.target.value)} className="w-full px-4 py-2 border rounded-xl focus:ring-2 focus:ring-blue-500" />
                </div>
              </>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <input type="password" required value={password} onChange={e => setPassword(e.target.value)} className="w-full px-4 py-2 border rounded-xl focus:ring-2 focus:ring-blue-500" />
            </div>

            <button type="submit" className="w-full py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors mt-2">
              {isRegister ? 'Create Account' : 'Sign In'}
            </button>
          </form>

          <div className="mt-6">
            <button onClick={() => setIsRegister(!isRegister)} className="text-sm text-blue-600 hover:underline">
              {isRegister ? 'Already have an account? Sign in' : 'Need an account? Register'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
