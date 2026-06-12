# Standalone Node.js Backend Design

## Overview
This document specifies the architecture for running OmniDrive as a standalone Node.js application, completely independent of Cloudflare's `wrangler` CLI and proprietary runtime emulators (`miniflare` / `workerd`). This allows the project to be self-hosted via Docker with a pure, lightweight Node.js footprint.

## Approach: Polyfill & Wrapper (Zero Refactoring)
Instead of refactoring the business logic to remove references to `c.env.DB` and `c.env.KV`, we will construct a mock `Env` object at the Node.js entry point. This object will mimic the exact API signatures of Cloudflare's D1 and KV, but will be backed by standard Node.js libraries. 

### 1. New Entry Point (`src/node-server.ts`)
- Use `@hono/node-server` to boot the application.
- Serve the Hono application (`app.fetch`) and inject the custom Node-based `env` object.
- **Bonus:** Serve the React frontend's static files directly via Hono's `serveStatic` middleware, effectively eliminating the need for Nginx.

### 2. D1 Polyfill (`src/polyfills/d1.ts`)
- **Library**: `better-sqlite3`.
- **Implementation**:
  - Class `D1DatabaseWrapper` implementing `prepare(query)`.
  - Class `D1PreparedStatementWrapper` implementing `bind(...args)`, `first()`, `run()`, and `all()`.
  - Queries are executed synchronously via `better-sqlite3` but wrapped in Promises to match D1's asynchronous nature.
- **Data storage**: Mapped to a local volume path (e.g., `/data/omnidrive.sqlite`).

### 3. KV Polyfill (`src/polyfills/kv.ts`)
- **Storage**: A dedicated SQLite table (or separate `kv.sqlite` file).
- **Schema**: `id (TEXT PRIMARY KEY)`, `value (TEXT)`, `expiration (INTEGER)`.
- **Implementation**:
  - Class `KVNamespaceWrapper` implementing:
    - `.get(key)`: Returns the value if `expiration` > current timestamp, otherwise returns `null`.
    - `.put(key, value, { expirationTtl })`: Inserts/updates the record. Calculates absolute expiration timestamp if TTL is provided.
    - `.delete(key)`: Deletes the record.
- Background cleanup function (optional) to periodically purge expired keys.

### 4. Cron Scheduler (`src/polyfills/cron.ts`)
- **Library**: `node-cron`.
- **Implementation**:
  - Run alongside the Node server.
  - Automatically triggers the `app.scheduled()` function at defined intervals (e.g., `*/30 * * * *`), exactly as Cloudflare Cron Triggers do.

### 5. Dockerfile & Infrastructure Simplification
- Modify `Dockerfile.unified` (or consolidate into a single Dockerfile).
- Remove Nginx installation and configuration.
- Change `CMD` to simply `node dist/node-server.js`.
- Remove `start-unified.sh` as proxying is no longer needed.
- This creates a true, single-process container structure.

## Deployment Strategy
The original Cloudflare `wrangler` deployment mechanism remains completely untouched. The Cloudflare Workers target will continue to use `src/index.ts`, while Docker and local standard usage will invoke `src/node-server.ts`.
