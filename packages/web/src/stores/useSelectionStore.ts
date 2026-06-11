import { create } from 'zustand';
import type { FileEntry, DriveFolder, WorkspaceFolder } from '../types';

export type SelectedItem = 
  | { type: 'file'; item: FileEntry }
  | { type: 'folder'; item: DriveFolder | WorkspaceFolder };

interface SelectionState {
  selectedItems: SelectedItem[];
  toggleSelection: (item: SelectedItem) => void;
  selectMultiple: (items: SelectedItem[]) => void;
  selectAll: (items: SelectedItem[]) => void;
  clearSelection: () => void;
}

export const isSameItem = (a: SelectedItem, b: SelectedItem): boolean => {
  if (a.type !== b.type) return false;
  
  if (a.type === 'file' && b.type === 'file') {
    return a.item.id === b.item.id;
  }
  
  if (a.type === 'folder' && b.type === 'folder') {
    if (a.item.id && b.item.id) {
      return a.item.id === b.item.id;
    }
    if ('googleFolderId' in a.item && 'googleFolderId' in b.item) {
      return a.item.googleFolderId === b.item.googleFolderId;
    }
    return false;
  }
  
  return false;
};

export const useSelectionStore = create<SelectionState>((set) => ({
  selectedItems: [],
  toggleSelection: (item) => set((state) => {
    const exists = state.selectedItems.some(i => isSameItem(i, item));
    if (exists) {
      return { selectedItems: state.selectedItems.filter(i => !isSameItem(i, item)) };
    }
    return { selectedItems: [...state.selectedItems, item] };
  }),
  selectMultiple: (items) => set((state) => {
    const newItems = items.filter(item => !state.selectedItems.some(i => isSameItem(i, item)));
    return { selectedItems: [...state.selectedItems, ...newItems] };
  }),
  selectAll: (items) => set({ selectedItems: items }),
  clearSelection: () => set({ selectedItems: [] }),
}));
