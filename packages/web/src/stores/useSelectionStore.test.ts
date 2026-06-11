import { describe, it, expect, beforeEach } from 'vitest';
import { useSelectionStore, isSameItem } from './useSelectionStore';
import type { FileEntry, DriveFolder } from '../types';

describe('useSelectionStore', () => {
  beforeEach(() => {
    useSelectionStore.setState({ selectedItems: [] });
  });

  describe('isSameItem', () => {
    it('should correctly compare file items by id', () => {
      const file1 = { type: 'file', item: { id: '1' } as FileEntry } as const;
      const file2 = { type: 'file', item: { id: '1' } as FileEntry } as const;
      const file3 = { type: 'file', item: { id: '2' } as FileEntry } as const;
      
      expect(isSameItem(file1, file2)).toBe(true);
      expect(isSameItem(file1, file3)).toBe(false);
    });

    it('should correctly compare folder items with id', () => {
      const folder1 = { type: 'folder', item: { id: '1', googleFolderId: 'g1' } as DriveFolder } as const;
      const folder2 = { type: 'folder', item: { id: '1', googleFolderId: 'g2' } as DriveFolder } as const;
      const folder3 = { type: 'folder', item: { id: '2', googleFolderId: 'g1' } as DriveFolder } as const;
      
      expect(isSameItem(folder1, folder2)).toBe(true);
      expect(isSameItem(folder1, folder3)).toBe(false);
    });

    it('should correctly compare folder items without id using googleFolderId', () => {
      const folder1 = { type: 'folder', item: { googleFolderId: 'g1' } as DriveFolder } as const;
      const folder2 = { type: 'folder', item: { googleFolderId: 'g1' } as DriveFolder } as const;
      const folder3 = { type: 'folder', item: { googleFolderId: 'g2' } as DriveFolder } as const;
      const folder4 = { type: 'folder', item: { id: '1', googleFolderId: 'g1' } as DriveFolder } as const;
      
      expect(isSameItem(folder1, folder2)).toBe(true);
      expect(isSameItem(folder1, folder3)).toBe(false);
      expect(isSameItem(folder1, folder4)).toBe(true);
    });

    it('should not match different types', () => {
      const file = { type: 'file', item: { id: '1' } as FileEntry } as const;
      const folder = { type: 'folder', item: { id: '1', googleFolderId: 'g1' } as DriveFolder } as const;
      
      expect(isSameItem(file as any, folder as any)).toBe(false);
    });
  });

  describe('store functions', () => {
    it('should select multiple items', () => {
      const file1 = { type: 'file', item: { id: '1' } as any } as const;
      const file2 = { type: 'file', item: { id: '2' } as any } as const;
      
      useSelectionStore.getState().selectMultiple([file1, file2]);
      expect(useSelectionStore.getState().selectedItems).toEqual([file1, file2]);
      
      // Should not duplicate existing items
      useSelectionStore.getState().selectMultiple([file1]);
      expect(useSelectionStore.getState().selectedItems).toEqual([file1, file2]);
    });

    it('should toggle file selection correctly', () => {
      const dummyFile = { id: '1', name: 'test.txt' } as FileEntry;
      
      useSelectionStore.getState().toggleSelection({ type: 'file', item: dummyFile });
      expect(useSelectionStore.getState().selectedItems).toEqual([{ type: 'file', item: dummyFile }]);
      
      useSelectionStore.getState().toggleSelection({ type: 'file', item: dummyFile });
      expect(useSelectionStore.getState().selectedItems).toEqual([]);
    });

    it('should toggle folder selection correctly (with and without id)', () => {
      const folderWithId = { id: 'f1', name: 'folder1', googleFolderId: 'g1' } as DriveFolder;
      const folderWithoutId = { name: 'folder2', googleFolderId: 'g2' } as DriveFolder;
      
      const item1 = { type: 'folder', item: folderWithId } as const;
      const item2 = { type: 'folder', item: folderWithoutId } as const;
      
      useSelectionStore.getState().toggleSelection(item1);
      expect(useSelectionStore.getState().selectedItems).toEqual([item1]);
      
      useSelectionStore.getState().toggleSelection(item2);
      expect(useSelectionStore.getState().selectedItems).toEqual([item1, item2]);
      
      useSelectionStore.getState().toggleSelection({ type: 'folder', item: { ...folderWithId } as DriveFolder });
      expect(useSelectionStore.getState().selectedItems).toEqual([item2]);
      
      useSelectionStore.getState().toggleSelection({ type: 'folder', item: { name: 'diff_name', googleFolderId: 'g2' } as DriveFolder });
      expect(useSelectionStore.getState().selectedItems).toEqual([]);
    });

    it('should toggle an item out of multiple selected items correctly', () => {
      const file1 = { type: 'file', item: { id: '1' } as FileEntry } as const;
      const file2 = { type: 'file', item: { id: '2' } as FileEntry } as const;
      const folder = { type: 'folder', item: { googleFolderId: 'g1' } as DriveFolder } as const;
      
      useSelectionStore.setState({ selectedItems: [file1, folder, file2] });
      
      useSelectionStore.getState().toggleSelection(folder);
      
      expect(useSelectionStore.getState().selectedItems).toEqual([file1, file2]);
    });

    it('should select all and clear selection', () => {
      const dummyFile = { id: '1', name: 'test.txt' } as FileEntry;
      
      useSelectionStore.getState().selectAll([{ type: 'file', item: dummyFile }]);
      expect(useSelectionStore.getState().selectedItems.length).toBe(1);
      
      useSelectionStore.getState().clearSelection();
      expect(useSelectionStore.getState().selectedItems).toEqual([]);
    });
  });
});
