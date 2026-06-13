# Docker Sync Resilience Design

## Overview
The OmniDrive background synchronization feature suffers from critical stability and memory issues when deployed in a single-container Docker environment. The current implementation buffers large Google Drive directories entirely in memory (causing Out-Of-Memory crashes), lacks proper state recovery if Docker restarts, and risks database corruption due to the absence of graceful shutdown handling.

This design document outlines a "Resume-able Sync" architecture that completely resolves memory exhaustion, handles unexpected container terminations flawlessly, and prevents cron-triggered database lockups.

## Architecture & Implementation Details

### 1. Database Modifications
To support resume-able syncs, the database must track progress at a granular level rather than waiting for the entire sync to complete.

**Schema Changes (`src/db/schema.sql`):**
- Add a new column `next_page_token` (TEXT) to the `sync_state` table.
- **State Logic:**
  - `change_token` IS NULL AND `next_page_token` IS NOT NULL: Initial sync was interrupted and must resume from `next_page_token`.
  - `change_token` IS NOT NULL: Initial sync is complete; standard incremental sync applies.

### 2. Node Server Startup & Cleanup
When the Docker container starts, it may inherit corrupted database states from an abrupt termination.

**Cleanup Logic (`src/node-server.ts`):**
- Immediately after database initialization, execute:
  `UPDATE sync_state SET status = 'error', error_message = 'Sync interrupted by server restart' WHERE status = 'syncing'`
- This guarantees that no account remains indefinitely locked in the UI, allowing users or the background cron to safely retry.

### 3. Generator-Based Sync & Transactions
Fetching all files at once must be eliminated to prevent OOM errors.

**Google Drive Service (`src/services/google-drive.ts`):**
- Create `async function* iterateAllFilesAndFolders(driveAccountId, startPageToken?)`.
- This generator will yield chunks of data (e.g., arrays of files and folders) alongside the `nextPageToken` for that chunk.

**Sync Engine (`src/services/sync.ts`):**
- Refactor `performInitialSync` to consume the generator via `for await`.
- **Database Batches:** Each yielded chunk must be inserted into the database as a single batched execution (or transaction loop).
- **Checkpointing:** At the end of each chunk insertion, update the `next_page_token` in the `sync_state` table. If a crash occurs, progress is saved up to the last completed page.

### 4. Concurrency Lock & Graceful Shutdown
We must protect the SQLite database from overlapping writes and abrupt container kills.

**In-Memory Concurrency Lock:**
- Implement a global `Set<string>` (e.g., `activeSyncs`) inside the Node server or sync module.
- Before `runScheduledSync` attempts to sync an account, it checks the Set. If the ID is present, it skips the account. The ID is removed upon success or failure.

**Graceful Shutdown:**
- Listen for the `SIGTERM` signal in `node-server.ts` (the signal Docker uses for stopping containers).
- Upon receiving `SIGTERM`:
  1. Reject new incoming sync requests.
  2. Set a global `isShuttingDown` flag.
  3. Inside the generator loop in `sync.ts`, check `isShuttingDown`. If true, gracefully exit the loop, save the latest `next_page_token`, and allow the process to terminate via `process.exit(0)`.

## Scope and Boundaries
This design is explicitly targeted at **single-container deployments** utilizing SQLite (via the D1 polyfill). It avoids complex distributed tools like Redis or external queues to maintain system simplicity and operational lightness. Horizontal scaling of the Node server is out of scope for this spec.
