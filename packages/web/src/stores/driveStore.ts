import { create } from 'zustand';
import type { DriveAccount, AggregateQuota } from '../types';
import { api } from '../lib/api';

interface DriveState {
  drives: DriveAccount[];
  aggregate: AggregateQuota;
  isLoading: boolean;
  // Set when loading drives failed, so pages can offer a retry instead of
  // claiming that no drive is connected.
  error: string | null;
  fetchDrives: () => Promise<void>;
  removeDrive: (id: string) => Promise<void>;
  triggerSync: (id: string) => Promise<void>;
}

const emptyAggregate: AggregateQuota = { totalQuota: 0, totalUsed: 0, totalFree: 0, driveCount: 0 };

export const useDriveStore = create<DriveState>((set) => ({
  drives: [],
  aggregate: emptyAggregate,
  isLoading: false,
  error: null,

  fetchDrives: async () => {
    set({ isLoading: true, error: null });
    try {
      const data = await api.getDrives();
      set({ drives: data.drives, aggregate: data.aggregate, isLoading: false });
    } catch (err) {
      set({ isLoading: false, error: err instanceof Error ? err.message : 'Failed to load drives' });
    }
  },

  removeDrive: async (id: string) => {
    await api.disconnectDrive(id);
    set((state) => ({
      drives: state.drives.filter((d) => d.id !== id),
    }));
  },

  triggerSync: async (id: string) => {
    await api.triggerSync(id);
  },
}));
