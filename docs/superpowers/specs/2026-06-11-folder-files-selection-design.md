# Folder/Files Selection and Bulk Actions Design

## Overview
Refining the UI/UX for selecting multiple files and folders in OmniDrive, along with improving the visibility and functionality of the bulk actions menu.

## Architecture & Components

### 1. Floating Bulk Action Bar (`BulkActionBar.tsx`)
- **UI Refresh**: The action bar will be extracted from its current inline position at the top of the file list and converted into a fixed, floating bar positioned at the bottom center of the screen (`fixed bottom-8 left-1/2 -translate-x-1/2 z-50`).
- **Styling**: It will feature a sleek, pill-shaped design with a backdrop blur and shadow to elevate it above the content.
- **Actions**: Will display selected count, Clear selection (X), Delete, Add to Workspace, and **Move to another drive**.

### 2. Selection Enhancements (`FileGrid.tsx` & `useSelectionStore.ts`)
- **Store Update**: `useSelectionStore` will be updated to track the `lastSelectedId` to determine the start of a Shift-click range.
- **Shift-Click Range Selection**:
  - When a user Shift-clicks an item, all items between the last selected item and the newly clicked item will be selected.
  - To support this, `FileGrid.tsx` will need to derive a flat list of items (`[...subfolders, ...files]`) and compute indices.
- **Hover Checkboxes**:
  - Use `opacity-0 group-hover:opacity-100` on the checkbox container by default.
  - When an item is selected, apply `opacity-100` regardless of hover state.
- **Clickable Hit Area**:
  - If `hasSelection` is true, clicking anywhere on an item's row/card will toggle its selection instead of opening it. Double click will still open it.

### 3. Bulk Move to Another Drive (`MoveDriveModal.tsx` & `FilesPage.tsx`)
- **Modal Update**: `MoveDriveModal.tsx` currently accepts a single `file: FileEntry`. It will be updated to accept `files: FileEntry[]`.
- **API Flow**:
  - The modal will iterate over `files` and sequentially call the move API.
  - It will track success/failure counts.
  - On completion, it will show a unified toast message (e.g., "Moved 3 items", or "Moved 2 items, 1 failed").

## Data Flow & Error Handling
- **Bulk Operations**: Bulk move will iterate sequentially and report partial successes via toast notifications.
- **Selection State**: Shift-click relies on the rendered order of items.

## Testing Strategy
- Verify bulk action bar appears floating at the bottom when an item is selected.
- Verify shift-click selects the correct range in both grid and list views.
- Verify bulk move succeeds for multiple items and accurately reports partial failures if any.
