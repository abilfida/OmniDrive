# Folder/Files Selection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refine the UI/UX for folder and file selection by adding shift-click range selection, hover-based checkboxes, a floating bulk action bar, and bulk drive moves.

**Architecture:** We will extend `useSelectionStore` to support adding multiple items. `FileGrid` will track the last selected item to compute shift-click ranges. `BulkActionBar` will be repositioned to fixed bottom, and `MoveDriveModal` will be upgraded to process an array of files sequentially.

**Tech Stack:** React, TailwindCSS, Zustand

---

### Task 1: Update useSelectionStore for Range Selection

**Files:**
- Modify: `packages/web/src/stores/useSelectionStore.ts`
- Modify: `packages/web/src/stores/useSelectionStore.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// Add to packages/web/src/stores/useSelectionStore.test.ts inside 'store functions' describe block
    it('should select multiple items', () => {
      const file1 = { type: 'file', item: { id: '1' } as any } as const;
      const file2 = { type: 'file', item: { id: '2' } as any } as const;
      
      useSelectionStore.getState().selectMultiple([file1, file2]);
      expect(useSelectionStore.getState().selectedItems).toEqual([file1, file2]);
      
      // Should not duplicate existing items
      useSelectionStore.getState().selectMultiple([file1]);
      expect(useSelectionStore.getState().selectedItems).toEqual([file1, file2]);
    });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/web/src/stores/useSelectionStore.test.ts`
Expected: FAIL with "selectMultiple is not a function"

- [ ] **Step 3: Write minimal implementation**

Modify `packages/web/src/stores/useSelectionStore.ts` to add `selectMultiple`:

```typescript
// 1. Add to SelectionState interface
interface SelectionState {
  selectedItems: SelectedItem[];
  toggleSelection: (item: SelectedItem) => void;
  selectMultiple: (items: SelectedItem[]) => void;
  selectAll: (items: SelectedItem[]) => void;
  clearSelection: () => void;
}

// 2. Add to create<SelectionState>
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/web/src/stores/useSelectionStore.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/stores/useSelectionStore.ts packages/web/src/stores/useSelectionStore.test.ts
git commit -m "feat: add selectMultiple to useSelectionStore"
```

### Task 2: Refactor BulkActionBar UI

**Files:**
- Modify: `packages/web/src/components/layout/BulkActionBar.tsx`

- [ ] **Step 1: Update BulkActionBar component to be floating**

Modify `packages/web/src/components/layout/BulkActionBar.tsx`:

```tsx
import React, { useState } from 'react';
import { useSelectionStore } from '../../stores/useSelectionStore';
import { useToastStore } from '../../stores/toastStore';
import { api } from '../../lib/api';
import { X, Trash2, Folder, Star, HardDrive } from 'lucide-react';

export interface BulkActionBarProps {
  onActionComplete: () => void;
  onMoveRequested?: () => void;
  onWorkspaceRequested?: () => void;
  onMoveDriveRequested?: () => void;
}

export const BulkActionBar: React.FC<BulkActionBarProps> = ({ onActionComplete, onMoveRequested, onWorkspaceRequested, onMoveDriveRequested }) => {
  const { selectedItems, clearSelection } = useSelectionStore();
  const addToast = useToastStore((s) => s.addToast);
  const [isProcessing, setIsProcessing] = useState(false);

  if (selectedItems.length === 0) return null;

  const allFiles = selectedItems.every(i => i.type === 'file');

  const handleDelete = async () => {
    if (!confirm(`Delete ${selectedItems.length} items permanently?`)) return;
    setIsProcessing(true);
    addToast('info', `Deleting ${selectedItems.length} items...`);
    
    let successCount = 0;
    let failCount = 0;
    
    for (const selected of selectedItems) {
      try {
        if (selected.type !== 'file') {
          throw new Error('Only files can be deleted via bulk action');
        }
        await api.deleteFile(selected.item.id);
        successCount++;
      } catch (error) {
        console.error('Deletion failed for item:', selected, error);
        failCount++;
      }
    }
    
    if (failCount === 0) {
      addToast('success', `✅ Deleted ${successCount} items`);
    } else {
      addToast('error', `⚠️ Deleted ${successCount} items, ${failCount} failed`);
    }
    
    setIsProcessing(false);
    clearSelection();
    onActionComplete();
  };

  return (
    <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 flex items-center justify-between bg-white/80 backdrop-blur-md border border-gray-200 text-gray-800 rounded-full shadow-2xl px-6 py-3 min-w-[500px]">
      <div className="flex items-center gap-4 border-r border-gray-200 pr-4">
        <button onClick={clearSelection} disabled={isProcessing} className="p-1.5 hover:bg-gray-100 text-gray-500 rounded-full transition-colors">
          <X size={18} />
        </button>
        <span className="font-medium text-sm text-blue-600 bg-blue-50 px-2.5 py-0.5 rounded-full">{selectedItems.length} selected</span>
      </div>
      <div className="flex items-center gap-2 pl-2">
        <button onClick={handleDelete} disabled={isProcessing} className="flex items-center gap-2 px-3 py-1.5 hover:bg-red-50 text-gray-600 hover:text-red-600 rounded-full transition-colors text-sm font-medium" title="Delete selected items">
          <Trash2 size={16} /> Delete
        </button>
        <button onClick={onMoveRequested} disabled={isProcessing} className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-100 text-gray-600 rounded-full transition-colors text-sm font-medium" title="Move selected items">
          <Folder size={16} /> Move
        </button>
        <button 
          onClick={onMoveDriveRequested} 
          disabled={isProcessing || !allFiles} 
          className={`flex items-center gap-2 px-3 py-1.5 rounded-full transition-colors text-sm font-medium ${!allFiles ? 'opacity-50 cursor-not-allowed text-gray-400' : 'hover:bg-gray-100 text-gray-600'}`} 
          title={!allFiles ? 'Can only move files to another drive' : 'Move to another drive'}
        >
          <HardDrive size={16} /> Move Drive
        </button>
        <button 
          onClick={onWorkspaceRequested} 
          disabled={isProcessing || !allFiles} 
          className={`flex items-center gap-2 px-3 py-1.5 rounded-full transition-colors text-sm font-medium ${!allFiles ? 'opacity-50 cursor-not-allowed text-gray-400' : 'hover:bg-gray-100 text-gray-600'}`} 
          title={!allFiles ? 'Can only add files to Workspace' : 'Add to Workspace'}
        >
          <Star size={16} /> Workspace
        </button>
      </div>
    </div>
  );
};
```

- [ ] **Step 2: Commit**

```bash
git add packages/web/src/components/layout/BulkActionBar.tsx
git commit -m "ui: refactor BulkActionBar to floating pill design"
```

### Task 3: Support Bulk Move to Another Drive

**Files:**
- Modify: `packages/web/src/components/MoveDriveModal.tsx`

- [ ] **Step 1: Update MoveDriveModal to accept multiple files**

Modify `packages/web/src/components/MoveDriveModal.tsx`:

```tsx
import { useState } from 'react';
import { HardDrive, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { useDriveStore } from '../stores/driveStore';
import { api } from '../lib/api';
import { FileEntry, DriveAccount } from '../types';
import { formatFileSize } from '../lib/utils';
import { useToastStore } from '../stores/toastStore';

interface MoveDriveModalProps {
  files: FileEntry[];
  onClose: () => void;
  onSuccess: () => void;
  onError: (error: any) => void;
}

export function MoveDriveModal({ files, onClose, onSuccess, onError }: MoveDriveModalProps) {
  const { drives } = useDriveStore();
  const addToast = useToastStore((s) => s.addToast);
  const [isMoving, setIsMoving] = useState(false);
  const [movingToDriveId, setMovingToDriveId] = useState<string | null>(null);

  // Consider all drives that are not the source of EVERY file.
  // Simplest is to just show all drives, but for UX, exclude if it's the exact same drive for the single file.
  const availableDrives = files.length === 1 
    ? drives.filter(d => d.id !== files[0].driveAccountId)
    : drives;

  const handleMove = async (drive: DriveAccount) => {
    if (files.length === 0) return;
    try {
      setIsMoving(true);
      setMovingToDriveId(drive.id);
      
      let successCount = 0;
      let failCount = 0;
      
      for (const file of files) {
        if (file.driveAccountId === drive.id) {
          // Skip if already in this drive
          continue;
        }
        try {
          await api.moveFileToDrive(file.id, drive.id);
          successCount++;
        } catch (e) {
          failCount++;
        }
      }
      
      if (failCount === 0 && successCount > 0) {
        addToast('success', `✅ Moved ${successCount} item(s) to ${drive.email}`);
      } else if (failCount > 0) {
        addToast('error', `⚠️ Moved ${successCount} item(s), ${failCount} failed`);
      }
      
      onSuccess();
    } catch (err) {
      onError(err);
    } finally {
      setIsMoving(false);
      setMovingToDriveId(null);
    }
  };

  return (
    <Dialog open={files.length > 0} onOpenChange={(open) => !open && !isMoving && onClose()}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Move to Another Drive</DialogTitle>
          <DialogDescription>
            Select a destination drive to move {files.length} item(s). This may take a moment depending on the file size.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          {availableDrives.length === 0 ? (
            <p className="text-sm text-center text-muted-foreground py-4">
              No other drives available. Please connect another Google Drive account.
            </p>
          ) : (
            availableDrives.map(drive => (
              <button
                key={drive.id}
                onClick={() => handleMove(drive)}
                disabled={isMoving}
                className={`flex items-center p-3 border rounded-lg transition-colors text-left ${
                  isMoving && movingToDriveId !== drive.id 
                    ? 'opacity-50 cursor-not-allowed' 
                    : 'hover:bg-accent hover:text-accent-foreground'
                } ${isMoving && movingToDriveId === drive.id ? 'ring-2 ring-primary border-primary bg-accent' : ''}`}
              >
                <div className="flex-shrink-0 mr-4">
                  {isMoving && movingToDriveId === drive.id ? (
                    <Loader2 className="w-5 h-5 text-primary animate-spin" />
                  ) : (
                    <HardDrive className="w-5 h-5 text-muted-foreground" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {drive.email}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Free space: {formatFileSize(drive.freeSpace)}
                  </p>
                </div>
              </button>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/web/src/components/MoveDriveModal.tsx
git commit -m "feat: upgrade MoveDriveModal to handle bulk files"
```

### Task 4: Connect Bulk Action Bar to FilesPage

**Files:**
- Modify: `packages/web/src/pages/FilesPage.tsx`

- [ ] **Step 1: Update FilesPage logic**

Modify `packages/web/src/pages/FilesPage.tsx` to handle bulk drive move state:

1. Update state: `const [moveDriveTarget, setMoveDriveTarget] = useState<FileEntry | null>(null);` becomes `const [moveDriveFiles, setMoveDriveFiles] = useState<FileEntry[]>([]);`
2. Pass `onMoveDriveRequested` to `BulkActionBar`.
3. Update `MoveDriveModal` props to use `files={moveDriveFiles}`.

In `packages/web/src/pages/FilesPage.tsx`:

Find:
```tsx
  const [moveDriveTarget, setMoveDriveTarget] = useState<FileEntry | null>(null);
```
Replace with:
```tsx
  const [moveDriveFiles, setMoveDriveFiles] = useState<FileEntry[]>([]);
```

Find:
```tsx
        {/* Toolbar */}
        {selectedItems.length > 0 ? (
          <BulkActionBar 
            onActionComplete={() => refresh()} 
            onWorkspaceRequested={() => setWorkspaceTarget(selectedItems[0].item as FileEntry)}
          />
        ) : (
```
Replace with:
```tsx
        {/* Toolbar */}
        {selectedItems.length > 0 ? (
          <BulkActionBar 
            onActionComplete={() => refresh()} 
            onWorkspaceRequested={() => setWorkspaceTarget(selectedItems[0].item as FileEntry)}
            onMoveDriveRequested={() => {
              const files = selectedItems.filter(i => i.type === 'file').map(i => i.item as FileEntry);
              setMoveDriveFiles(files);
            }}
          />
        ) : (
```

Find `MoveDriveModal` inside `<DropZone>`:
```tsx
          <MoveDriveModal
            file={moveDriveTarget}
            onClose={() => setMoveDriveTarget(null)}
            onSuccess={() => {
              setMoveDriveTarget(null);
              refresh();
            }}
            onError={(err) => {
              console.error(err);
              addToast('error', 'Failed to move file');
              setMoveDriveTarget(null);
            }}
          />
```
Replace with:
```tsx
          <MoveDriveModal
            files={moveDriveFiles}
            onClose={() => setMoveDriveFiles([])}
            onSuccess={() => {
              setMoveDriveFiles([]);
              clearSelection();
              refresh();
            }}
            onError={(err) => {
              console.error(err);
              addToast('error', 'Failed to move file(s)');
              setMoveDriveFiles([]);
            }}
          />
```

Find `onMoveDrive={setMoveDriveTarget}` in `FileGrid` rendering inside `FilesPage`:
```tsx
              onMoveDrive={setMoveDriveTarget}
```
Replace with:
```tsx
              onMoveDrive={(file) => setMoveDriveFiles([file])}
```

- [ ] **Step 2: Commit**

```bash
git add packages/web/src/pages/FilesPage.tsx
git commit -m "feat: connect bulk move drive functionality to FilesPage"
```

### Task 5: Enhance FileGrid Selection Interactions

**Files:**
- Modify: `packages/web/src/components/files/FileGrid.tsx`

- [ ] **Step 1: Implement shift-click and hit areas**

Modify `packages/web/src/components/files/FileGrid.tsx`.
Add imports:
```tsx
import { useSelectionStore, type SelectedItem, isSameItem } from '../../stores/useSelectionStore';
```

Add state inside `FileGrid`:
```tsx
  const [lastSelected, setLastSelected] = React.useState<SelectedItem | null>(null);
  const { selectedItems, toggleSelection, selectMultiple, selectAll, clearSelection } = useSelectionStore();
```

Create a helper function inside `FileGrid` before `return` statements:
```tsx
  const handleItemClick = (e: React.MouseEvent, item: SelectedItem) => {
    e.stopPropagation();
    if (e.shiftKey && lastSelected) {
      // Prevent text selection
      document.getSelection()?.removeAllRanges();
      
      const allItems: SelectedItem[] = [
        ...subfolders.map(f => ({ type: 'folder' as const, item: f })),
        ...files.map(f => ({ type: 'file' as const, item: f }))
      ];
      const startIndex = allItems.findIndex(i => isSameItem(i, lastSelected));
      const endIndex = allItems.findIndex(i => isSameItem(i, item));
      
      if (startIndex !== -1 && endIndex !== -1) {
        const start = Math.min(startIndex, endIndex);
        const end = Math.max(startIndex, endIndex);
        selectMultiple(allItems.slice(start, end + 1));
      }
    } else if (e.metaKey || e.ctrlKey || hasSelection) {
      toggleSelection(item);
      setLastSelected(item);
    } else {
      toggleSelection(item);
      setLastSelected(item);
    }
  };
```

Update checkbox interactions and row/card interactions for Folders (List View & Grid View):
Find folder rendering wrapper:
```tsx
                <div
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleSelection({ type: 'folder', item: folder });
                  }}
```
Replace with:
```tsx
                <div
                  onClick={(e) => handleItemClick(e, { type: 'folder', item: folder })}
```

Update Files wrapper similarly:
```tsx
                <div
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleSelection({ type: 'file', item: file });
                  }}
```
Replace with:
```tsx
                <div
                  onClick={(e) => handleItemClick(e, { type: 'file', item: file })}
```

Update Checkbox visibility logic across all 4 input elements:
Change `className={`w-4 h-4 cursor-pointer ...` to ensure it looks right. It already uses `opacity-0 group-hover:opacity-100 transition-opacity` which is correct, but change `flex-shrink-0` if present.
For the file list/grid checkbox `<input>` elements, update `onChange` to be a no-op since the parent `div` handles the click, OR stop propagation:

```tsx
                    <input 
                      type="checkbox" 
                      className={`w-4 h-4 cursor-pointer flex-shrink-0 ${isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 transition-opacity'}`}
                      checked={isSelected}
                      readOnly
                      onClick={(e) => {
                        e.stopPropagation(); // Stop reaching parent div
                        handleItemClick(e, { type: 'folder', item: folder }); // manually trigger
                      }}
                    />
```
*(Apply to both files and folders in both list and grid views)*.

- [ ] **Step 2: Commit**

```bash
git add packages/web/src/components/files/FileGrid.tsx
git commit -m "feat: add shift-click range selection and better hit areas"
```
