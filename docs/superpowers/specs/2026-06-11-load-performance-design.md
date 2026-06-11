# Enterprise Load Performance Optimization Design (OmniDrive)

## Overview
This document outlines the design for optimizing load performance in OmniDrive, specifically targeting the backend bottleneck where folders with tens of thousands of files cause high memory usage and slow rendering. We will implement Keyset-based Pagination (Infinite Scroll) to resolve this.

## Architecture & Data Flow

### API Contracts
- **Endpoints**: `GET /api/folders/:id` (and relevant file endpoints like `/api/files/recent` and `/api/files/search`).
- **Request Parameters**: 
  - `cursor` (string, base64 encoded): Identifies the starting point for the next page.
  - `limit` (number): Default 50. Maximum number of items to fetch per request.
- **Response Payload**: 
  - Appends a `pagination` object: `{ nextCursor: string | null, hasMore: boolean }`.

### Database Strategy (Cloudflare D1)
- **Method**: Keyset Pagination (Seek Method).
- **Cursor Structure**: A JSON string encoded in Base64 containing the last item's sort keys. For folders sorted by name, it will be `{ "name": "document.pdf", "id": "file_123" }`.
- **SQL Updates**:
  - The `WHERE` clause will append the cursor condition: `AND (f.name > ? OR (f.name = ? AND f.id > ?))`.
  - The `ORDER BY` clause will be deterministic: `ORDER BY f.name ASC, f.id ASC`.
  - Appended `LIMIT ?` to prevent full table scans.
- **Performance**: We will ensure covering indexes exist for the combinations used in the WHERE clause, ensuring O(1) seek times even on extremely large datasets.

## Component Changes

### Backend (Cloudflare Workers)
- Update `packages/worker/src/routes/folders.ts` (and `files.ts` if applicable) to parse the `cursor` and `limit` query parameters.
- Implement helper functions for encoding and decoding cursors safely.
- Modify the DB queries to conditionally inject the keyset cursor logic if a cursor is provided.
- Calculate `hasMore` by fetching `limit + 1` items and checking if the result length exceeds `limit`. If it does, return `limit` items and generate the `nextCursor` from the last item.

### Frontend (React/Zustand)
- **State Management**:
  - Modify data fetching functions in the frontend to accept an optional `cursor` argument.
  - When loading more, append the newly fetched files to the existing array rather than replacing the data.
  - Track `hasMore` and `nextCursor` to prevent unnecessary requests at the bottom of the list.
- **UI Components**:
  - Implement an Infinite Scroll mechanism using `IntersectionObserver` (or a dedicated component package) at the bottom of the file list grid/table.
  - Render a small loading spinner at the bottom of the list while the next page is being fetched, providing smooth UX without blocking the interface.

## Error Handling & Testing
- **Error Handling**: If a provided `cursor` is invalid or malformed JSON, the backend will catch the error, ignore the cursor, and default to fetching the first page, preventing application crashes.
- **Testing**: 
  - Add unit tests for the cursor decoding logic.
  - Verify that the API correctly returns `hasMore: false` on the last page.
