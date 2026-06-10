# User Management Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Streamline the "User Management" interface, replace the email invite system with an admin user creation form identical to the Sign Up form, and integrate Invitation Code management into a unified Tab layout.

**Architecture:** 
- Update the backend API to handle `name` on registration and add a new admin endpoint for user creation.
- Refactor `Sidebar.tsx` to use the label "Users".
- Update `LoginPage.tsx` to include the `name` field in the registration form.
- Consolidate `AdminInvitations` and the new "Add User" logic into `AdminUsersPage` using a tabbed interface.
- Remove deprecated components (`InviteUserModal` and standalone `AdminInvitations`).

**Tech Stack:** React, Tailwind CSS, Hono (Cloudflare Workers backend), SQLite (D1)

---

### Task 1: Update Backend Auth and Admin Routes

**Files:**
- Modify: `packages/worker/src/routes/auth.ts`
- Modify: `packages/worker/src/routes/admin.ts`

- [ ] **Step 1: Update `/register` endpoint to accept `name`**
Modify `packages/worker/src/routes/auth.ts` line 21 to extract `name`:
```typescript
  const { name, username, password, email, invitation_code } = await c.req.json();
```
Modify the `INSERT` binding around line 51:
```typescript
  ).bind(id, username, passwordHash, email || null, name || username, isSuperAdmin).run();
```

- [ ] **Step 2: Add `/users` endpoints to `admin.ts`**
Append to `packages/worker/src/routes/admin.ts`:
```typescript
import * as bcrypt from 'bcryptjs';
import { validatePassword } from '../lib/validation';

adminRouter.get('/users', async (c) => {
  const { results } = await c.env.DB.prepare('SELECT id, username, email, name, avatar_url, is_super_admin as role FROM users ORDER BY created_at DESC').all();
  return c.json({ users: results.map(u => ({ ...u, role: u.role ? 'super_admin' : 'member', status: 'active' })) });
});

adminRouter.post('/users', async (c) => {
  const { name, username, password, email, role } = await c.req.json();
  if (!username || !password) throw new AppError(400, 'Username and password required');
  const passwordError = validatePassword(password);
  if (passwordError) throw new AppError(400, passwordError);

  const existing = await c.env.DB.prepare('SELECT id FROM users WHERE username = ?').bind(username).first();
  if (existing) throw new AppError(400, 'Username already exists');

  const id = generateId();
  const passwordHash = await bcrypt.hash(password, 10);
  const isSuperAdmin = role === 'super_admin' ? 1 : 0;

  await c.env.DB.prepare(
    'INSERT INTO users (id, username, password_hash, email, name, is_super_admin) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(id, username, passwordHash, email || null, name || username, isSuperAdmin).run();

  return c.json({ success: true, user: { id, username, email, name: name || username, role: isSuperAdmin ? 'super_admin' : 'member', status: 'active' } });
});
```

### Task 2: Update API Client

**Files:**
- Modify: `packages/web/src/lib/api.ts`

- [ ] **Step 1: Update `api.ts` functions**
In `packages/web/src/lib/api.ts`, modify the auth and admin sections to include the new endpoints:
```typescript
  register: (data: any) => request<{ success: boolean; user: import('../types').User }>('/api/auth/register', { method: 'POST', body: JSON.stringify(data) }),
  getAdminUsers: () => request<{ users: import('../types').User[] }>('/api/admin/users'),
  adminCreateUser: (data: any) => request<{ success: boolean; user: import('../types').User }>('/api/admin/users', { method: 'POST', body: JSON.stringify(data) }),
```

### Task 3: Update Sidebar & Login Page

**Files:**
- Modify: `packages/web/src/components/layout/Sidebar.tsx`
- Modify: `packages/web/src/pages/LoginPage.tsx`

- [ ] **Step 1: Rename Sidebar label**
In `packages/web/src/components/layout/Sidebar.tsx`, locate the "User Management" text and change it:
```tsx
        {user?.role === 'super_admin' && (
          <NavLink to="/admin/users" className={navLinkClass}>
            <Shield size={20} />
            <span>Users</span>
          </NavLink>
        )}
```

- [ ] **Step 2: Add Name field to LoginPage.tsx**
In `packages/web/src/pages/LoginPage.tsx`, add `const [name, setName] = useState('');` next to other state variables.
In `handleSubmit`:
```typescript
      if (isRegister) {
        await api.register({ name, username, password, email, invitation_code: invitationCode });
```
In the `isRegister` form render block, add the Name field:
```tsx
            {isRegister && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                  <input type="text" value={name} onChange={e => setName(e.target.value)} className="w-full px-4 py-2 border rounded-xl focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email (Optional)</label>
```

### Task 4: Refactor AdminUsersPage

**Files:**
- Modify: `packages/web/src/pages/AdminUsersPage.tsx`
- Delete: `packages/web/src/components/admin/InviteUserModal.tsx`
- Delete: `packages/web/src/components/admin/AdminInvitations.tsx`

- [ ] **Step 1: Delete deprecated files**
Remove `packages/web/src/components/admin/InviteUserModal.tsx` and `packages/web/src/components/admin/AdminInvitations.tsx`.

- [ ] **Step 2: Rewrite AdminUsersPage**
Replace the entire content of `packages/web/src/pages/AdminUsersPage.tsx` with the consolidated tabbed view:
```tsx
import React, { useState, useEffect } from 'react';
import { useAuthStore } from '../stores/authStore';
import { ShieldAlert, Plus, MoreVertical, X } from 'lucide-react';
import type { User } from '../types';
import { api } from '../lib/api';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../components/ui/dropdown-menu';

export const AdminUsersPage: React.FC = () => {
  const { user } = useAuthStore();
  const [activeTab, setActiveTab] = useState<'users' | 'invitations'>('users');
  
  // Users state
  const [users, setUsers] = useState<User[]>([]);
  const [isAddUserModalOpen, setIsAddUserModalOpen] = useState(false);
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'member' | 'super_admin'>('member');
  
  // Invitations state
  const [invitations, setInvitations] = useState<any[]>([]);
  const [code, setCode] = useState('');
  const [maxUses, setMaxUses] = useState(1);

  useEffect(() => {
    if (user?.role === 'super_admin') {
      loadUsers();
      loadInvitations();
    }
  }, [user]);

  const loadUsers = async () => {
    try {
      const res = await api.getAdminUsers();
      setUsers(res.users);
    } catch (e) {}
  };

  const loadInvitations = async () => {
    try {
      const res = await api.getInvitations();
      setInvitations(res.invitations);
    } catch (e) {}
  };

  if (user?.role !== 'super_admin') {
    return (
      <div className="flex flex-col items-center justify-center h-full text-gray-500">
        <ShieldAlert size={48} className="text-red-400 mb-4" />
        <h2 className="text-xl font-medium text-gray-800">Access Denied</h2>
      </div>
    );
  }

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.adminCreateUser({ name, username, email, password, role });
      setIsAddUserModalOpen(false);
      loadUsers();
      setName(''); setUsername(''); setEmail(''); setPassword(''); setRole('member');
    } catch (err) {
      alert('Failed to create user');
    }
  };

  const handleCreateInvitation = async (e: React.FormEvent) => {
    e.preventDefault();
    await api.createInvitation(code, maxUses);
    setCode('');
    setMaxUses(1);
    loadInvitations();
  };

  const handleDeleteInvitation = async (id: string) => {
    await api.deleteInvitation(id);
    loadInvitations();
  };

  return (
    <div className="p-6 h-full overflow-y-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-800 mb-4">Users</h1>
        <div className="flex gap-4 border-b">
          <button 
            onClick={() => setActiveTab('users')}
            className={`pb-2 px-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'users' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
          >
            Active Users
          </button>
          <button 
            onClick={() => setActiveTab('invitations')}
            className={`pb-2 px-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'invitations' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
          >
            Invitation Codes
          </button>
        </div>
      </div>

      {activeTab === 'users' && (
        <>
          <div className="flex justify-end mb-4">
            <button
              onClick={() => setIsAddUserModalOpen(true)}
              className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition-colors"
            >
              <Plus size={20} />
              <span>Add User</span>
            </button>
          </div>
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase">Name</th>
                  <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase">Username</th>
                  <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase">Email</th>
                  <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase">Role</th>
                  <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {users.map((u) => (
                  <tr key={u.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm font-medium text-gray-900">{u.name || u.username}</td>
                    <td className="px-6 py-4 text-sm text-gray-500">{u.username}</td>
                    <td className="px-6 py-4 text-sm text-gray-500">{u.email}</td>
                    <td className="px-6 py-4 text-sm">
                      <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${u.role === 'super_admin' ? 'bg-purple-100 text-purple-800' : 'bg-gray-100 text-gray-800'}`}>
                        {u.role}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">
                        {u.status || 'active'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button className="p-1 hover:bg-gray-200 rounded text-gray-500"><MoreVertical size={16} /></button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="bg-white shadow-xl rounded-xl border border-gray-200 w-40">
                          <DropdownMenuItem className="cursor-pointer">Toggle Status</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {isAddUserModalOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
              <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
                <div className="flex items-center justify-between px-6 py-4 border-b">
                  <h3 className="text-lg font-medium text-gray-900">Add User</h3>
                  <button onClick={() => setIsAddUserModalOpen(false)} className="p-1 hover:bg-gray-100 rounded-full text-gray-500">
                    <X size={20} />
                  </button>
                </div>
                <form onSubmit={handleCreateUser} className="p-6 space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                    <input type="text" value={name} onChange={e => setName(e.target.value)} className="w-full px-3 py-2 border rounded-md" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Username</label>
                    <input type="text" required value={username} onChange={e => setUsername(e.target.value)} className="w-full px-3 py-2 border rounded-md" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                    <input type="email" value={email} onChange={e => setEmail(e.target.value)} className="w-full px-3 py-2 border rounded-md" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                    <input type="password" required value={password} onChange={e => setPassword(e.target.value)} className="w-full px-3 py-2 border rounded-md" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
                    <select value={role} onChange={e => setRole(e.target.value as 'member' | 'super_admin')} className="w-full px-3 py-2 border rounded-md">
                      <option value="member">Member</option>
                      <option value="super_admin">Super Admin</option>
                    </select>
                  </div>
                  <div className="mt-6 flex justify-end gap-3">
                    <button type="button" onClick={() => setIsAddUserModalOpen(false)} className="px-4 py-2 text-sm border rounded-md">Cancel</button>
                    <button type="submit" className="px-4 py-2 text-sm text-white bg-blue-600 rounded-md">Add User</button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </>
      )}

      {activeTab === 'invitations' && (
        <div className="mt-4">
          <form onSubmit={handleCreateInvitation} className="flex gap-4 mb-6">
            <input type="text" value={code} onChange={e => setCode(e.target.value)} placeholder="Code (e.g. TEAM-2026)" className="border px-3 py-2 rounded" required />
            <input type="number" value={maxUses} onChange={e => setMaxUses(Number(e.target.value))} placeholder="Max Uses" className="border w-24 px-3 py-2 rounded" required min="0" />
            <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded">Create Code</button>
          </form>
          <ul className="space-y-2">
            {invitations.map(inv => (
              <li key={inv.id} className="flex items-center justify-between p-4 bg-gray-50 rounded border">
                <div>
                  <span className="font-bold">{inv.code}</span>
                  <span className="text-sm text-gray-500 ml-4">Used: {inv.used_count} / {inv.max_uses === 0 ? 'Unlimited' : inv.max_uses}</span>
                </div>
                <button onClick={() => handleDeleteInvitation(inv.id)} className="text-red-600 hover:underline text-sm">Delete</button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};
```
