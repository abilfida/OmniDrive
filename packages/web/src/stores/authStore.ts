import { create } from 'zustand';
import type { User } from '../types';
import { api, setUnauthorizedHandler } from '../lib/api';

interface AuthState {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  fetchUser: () => Promise<void>;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isLoading: true,
  isAuthenticated: false,

  fetchUser: async () => {
    try {
      const { user } = await api.getUser();
      set({ user, isAuthenticated: true, isLoading: false });
    } catch {
      set({ user: null, isAuthenticated: false, isLoading: false });
    }
  },

  logout: async () => {
    try {
      await api.logout();
    } finally {
      set({ user: null, isAuthenticated: false });
    }
  },
}));

// Any authenticated request that comes back 401 means the session expired:
// drop the user so AuthGuard sends them to the login page.
setUnauthorizedHandler(() => {
  useAuthStore.setState({ user: null, isAuthenticated: false, isLoading: false });
});
