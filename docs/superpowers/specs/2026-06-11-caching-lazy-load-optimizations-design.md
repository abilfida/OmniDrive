# Caching, Lazy Loading, and Rate-Limit Optimizations Design

## 1. Overview
The primary goal of this optimization is to maximize application responsiveness and strictly minimize rate-limiting from both Cloudflare Workers and the Google Drive API. This is achieved by introducing a robust database caching layer with configurable TTL, a "stale-while-revalidate" background synchronization approach, asynchronous lazy loading during user interactions (hover), and explicit manual sync controls in the View Info panel.

## 2. Architecture & Data Flow

### 2.1 Database & Settings
- **TTL Configuration:** Introduce a `sync_ttl_minutes` setting (defaulting to 5 minutes) in the workspace or user settings to allow open-source users to flexibly configure their caching policy.
- **Sync Tracking:** Utilize or add `last_synced_at` (timestamp) and `sync_status` (enum: `idle`, `syncing`, `error`) fields to both the `workspace_folders` and `files` tables.
- **Locking Mechanism (Rate Limit Protection):** Whenever a background sync is triggered due to TTL expiration, the backend must check the `sync_status`. If the status is already `syncing`, the backend will abort the duplicate request. This lock ensures that concurrent user actions (like spamming F5 or hovering multiple items rapidly) only result in a single Google Drive API call per expired item.

### 2.2 Navigation & Stale-While-Revalidate
- **Instant UI Response:** When a user navigates to a folder (`/api/folders/:id`), the backend will immediately return the cached data from the database, allowing the frontend to render the page with zero latency wait from Google Drive.
- **Background Sync:** Utilizing Cloudflare Workers' `ctx.waitUntil()`, the backend checks if the folder's `last_synced_at` exceeds the `sync_ttl_minutes`. If expired, it acquires the sync lock (`sync_status = 'syncing'`), fetches fresh data from Google Drive, updates the database, and releases the lock (`sync_status = 'idle'`) entirely in the background.

### 2.3 Hover & Lazy Loading
- **Pre-fetching & Item-Level Sync:** Hovering over a specific file or folder triggers a prefetch API call. Similar to navigation, the backend instantly returns cached data and performs an item-level background sync to Google Drive *only* if that specific item's TTL has expired.
- **Visual Lazy Load:** Heavy graphical assets, such as document previews and image thumbnails, are strictly deferred and lazy-loaded only when the user hovers over the corresponding item, saving bandwidth on list/grid views.

### 2.4 View Info Panel & Manual Sync
- **Last Synced Display:** The View Info side panel will surface the `last_synced_at` data in a human-readable format (e.g., "Last synced: 2 minutes ago").
- **Force Sync Button:** A dedicated "Sync" button will be added to the panel. Unlike background navigation syncs, this button explicitly ignores the TTL and forces an immediate, synchronous data refresh from Google Drive.
- **Visual Feedback:** When clicked, the button transforms into a loading spinner. Upon a successful sync, the information in the panel and the main view will automatically update. If it fails, the spinner stops, and a prominent red Toast notification will explain the error to the user.

## 3. Error Handling
- **Background Sync Failures:** If a background sync (triggered by navigation or hover) fails due to a Google Drive API error or rate limit, the item's status is quietly set to `error`. The application will not crash; the user continues to see the cached database data seamlessly.
- **Manual Sync Failures:** If a force sync initiated via the View Info panel fails, the UI will clearly indicate the failure via a Toast notification to inform the user that their manual action did not succeed.

## 4. Testing Strategy
- **Concurrency & Lock Testing:** Simulate race conditions by firing multiple simultaneous requests to an expired item to verify that the `sync_status` lock successfully prevents multiple outbound Google Drive API calls.
- **Stale-While-Revalidate Logic:** Unit test the backend to ensure `ctx.waitUntil()` correctly updates the database in the background without blocking the initial JSON response payload.
- **UI Interaction Tests:** Verify that the Sync button in the View Info panel correctly displays the loading spinner, updates the UI data upon success, and shows the Toast notification upon failure.
