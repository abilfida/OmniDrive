# Omnidrive

**Unified multi-Google Drive storage gateway built on Cloudflare Workers.**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg)](https://www.typescriptlang.org/)
[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-orange.svg)](https://workers.cloudflare.com/)

> 🌐 *Baca dalam [Bahasa Indonesia](README.id.md)*

---

## What is Omnidrive?

Omnidrive lets you connect multiple Google Drive accounts and manage all your files from a single dashboard. It runs entirely on Cloudflare's edge network — Workers for the API, D1 for the database, and KV for session storage — so there's no traditional server to maintain.

## Features

- **🔗 Multi-Drive Accounts** — Connect multiple Google Drive accounts via OAuth or Service Account JSON keys
- **🏢 Enterprise Workspaces** — Team workspaces replacing virtual folders, with RBAC, Quotas, Data Retention Policies, and Audit Logging
- **📁 Unified File Browsing** — Browse files across all connected drives in a single merged view
- **🔍 Global Search & Metadata** — Unified global search with metadata filtering, custom file metadata properties, and visual badges
- **⬆️ Smart Upload & Bulk Actions** — Drag-and-drop upload, automatic drive selection, and bulk operations (Move, Delete)
- **🔒 Shared Links** — Share files with password protection, expiration dates, and download limits
- **⚡ Automation Rules** — Auto-move or auto-delete files based on name or extension patterns
- **🔄 Real-Time Sync** — Automatic sync via Google Drive Changes API (cron every 30 minutes)
- **🌙 Dark Mode** — Modern dark theme UI with Notion-style hierarchical workspace sidebar

## Tech Stack

| Layer | Technology |
|-------|------------|
| **Backend** | [Hono](https://hono.dev/) on [Cloudflare Workers](https://workers.cloudflare.com/) |
| **Database** | [Cloudflare D1](https://developers.cloudflare.com/d1/) (SQLite) |
| **Session Store** | [Cloudflare KV](https://developers.cloudflare.com/kv/) |
| **Frontend** | [React 19](https://react.dev/) + [Vite](https://vite.dev/) |
| **State Management** | [Zustand](https://zustand.docs.pmnd.rs/) |
| **Language** | [TypeScript](https://www.typescriptlang.org/) |
| **Auth** | Google OAuth 2.0 |

## Architecture

```
omnidrive/
├── packages/
│   ├── worker/          # Cloudflare Worker (API backend)
│   │   ├── src/
│   │   │   ├── routes/      # API route handlers
│   │   │   ├── services/    # Business logic (Google Drive, sync, auth)
│   │   │   ├── middleware/  # Auth guard, CORS, error handling
│   │   │   ├── db/          # D1 schema
│   │   │   └── types/       # TypeScript types
│   │   └── tests/           # Vitest unit tests
│   └── web/             # React SPA (frontend)
│       └── src/
│           ├── components/  # UI components
│           ├── pages/       # Route pages
│           ├── stores/      # Zustand state stores
│           ├── hooks/       # Custom React hooks
│           ├── lib/         # API client, utilities
│           └── types/       # TypeScript types
├── docs/                # Design specs and implementation plans
├── Makefile             # Deployment automation
└── package.json         # Monorepo root (npm workspaces)
```

The backend and frontend communicate via REST API. In development, Vite's dev server proxies `/api/*` requests to the local Worker on port 8787.

## Prerequisites

- [Node.js](https://nodejs.org/) 18+ and npm
- A [Cloudflare account](https://dash.cloudflare.com/sign-up) (free tier works)
- A [Google Cloud project](https://console.cloud.google.com/) with the Google Drive API enabled
- An OAuth 2.0 Client ID (Web application type) from Google Cloud Console

## Getting Started

### 1. Clone and Install

```bash
git clone https://github.com/abilfida/omnidrive.git
cd omnidrive
npm install
```

### 2. Configure the Worker

```bash
# Copy the example config
cp packages/worker/wrangler.example.toml packages/worker/wrangler.toml

# Create a D1 database
npx wrangler d1 create omnidrive
# Copy the database_id from the output into wrangler.toml

# Create a KV namespace
npx wrangler kv namespace create KV
# Copy the namespace id from the output into wrangler.toml

# Apply the database schema
npx wrangler d1 execute omnidrive --local --file=packages/worker/src/db/schema.sql
```

### 3. Set Up Google OAuth Credentials

```bash
# Copy the secrets template
cp packages/worker/.dev.vars.example packages/worker/.dev.vars
```

Edit `packages/worker/.dev.vars` and fill in your Google OAuth credentials:

1. Go to [Google Cloud Console](https://console.cloud.google.com/) → APIs & Services → Credentials
2. Create an **OAuth 2.0 Client ID** (Web application type)
3. Add `http://localhost:8787/api/auth/google/callback` as an authorized redirect URI
4. Copy the Client ID and Client Secret into `.dev.vars`

### 4. Configure the Frontend

```bash
cp packages/web/.env.example packages/web/.env
```

For local development, leave `VITE_API_URL` empty — the Vite dev server proxies API calls automatically.

### 5. Run

```bash
npm run dev
```

This starts both the Worker (port 8787) and the web app (port 5173) concurrently. Open [http://localhost:5173](http://localhost:5173) in your browser.

## Database Management

If you need to perform a complete factory reset of all data (dropping all tables in D1 and clearing all sessions in KV), you can use the built-in reset commands. These commands are optimized to handle D1's strict foreign key constraints.

```bash
# Reset local development database and KV
make reset-local

# Reset production (remote) database and KV
# WARNING: This deletes ALL production data! Requires explicit 'YES' confirmation.
make reset-remote
```

## Deployment

### Backend (Cloudflare Workers)

```bash
# Set production secrets
npx wrangler secret put GOOGLE_CLIENT_ID
npx wrangler secret put GOOGLE_CLIENT_SECRET

# Update FRONTEND_URL and WORKER_URL in wrangler.toml [vars] to production URLs

# Deploy
make deploy-worker
```

### Frontend (Cloudflare Pages)

```bash
# Set VITE_API_URL in packages/web/.env.production to your Worker URL
make deploy-web
```

Or use the [Cloudflare Pages dashboard](https://dash.cloudflare.com/?to=/:account/pages) for automatic deployments from your Git repo.

## Environment Variables

### Worker Secrets (set via `wrangler secret put` atau `.dev.vars`)

| Variable | Description |
|----------|-------------|
| `GOOGLE_CLIENT_ID` | Google OAuth 2.0 Client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth 2.0 Client Secret |
| `JWT_SECRET` | Dedicated JWT signing key for shared links (min 32 chars) |
| `TOKEN_ENCRYPTION_KEY` | AES-256-GCM key for encrypting OAuth tokens at rest (32 chars) |

### Worker Config (set in `wrangler.toml` `[vars]`)

| Variable | Description | Default |
|----------|-------------|---------|
| `FRONTEND_URL` | Frontend origin for CORS and redirects | `http://localhost:5173` |
| `WORKER_URL` | Worker URL for OAuth callback | `http://localhost:8787` |

### Worker Bindings (set in `wrangler.toml`)

| Binding | Type | Description |
|---------|------|-------------|
| `DB` | D1 Database | SQLite database for all application data |
| `KV` | KV Namespace | Session storage and OAuth token cache |

### Web Environment (set in `.env` or `.env.production`)

| Variable | Description | Default |
|----------|-------------|---------|
| `VITE_API_URL` | Worker API base URL (empty for local dev) | `""` |

## License

[MIT](LICENSE) © 2026 abilfida
