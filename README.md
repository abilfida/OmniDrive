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
- **🔄 Resilient Background Sync** — Automatic sync via Google Drive Changes API (cron every 30 minutes). Features OOM-safe chunk processing using generators, resume-able syncs across restarts via `next_page_token`, atomic upserts for performance, and graceful shutdown (SIGTERM) to prevent concurrent syncs.
- **🌙 Dark Mode** — Modern dark theme UI with Notion-style hierarchical workspace sidebar

## Security

Omnidrive implements a robust security model to protect your files and data:
- **Token Encryption**: Google OAuth tokens are encrypted at rest using AES-256-GCM.
- **CSRF & SSRF Protection**: All mutating endpoints are protected against Cross-Site Request Forgery, and webhooks are validated against Server-Side Request Forgery.
- **Rate Limiting**: Built-in sliding window rate limiters protect authentication and public endpoints from brute-force attacks.
- **OAuth PKCE**: Authentication flow uses Proof Key for Code Exchange (S256) for enhanced security.
- **Strict Access Control**: Enforced RBAC role escalation prevention and IDOR (Insecure Direct Object Reference) prevention on all resource access.


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

### 1. Setup Google OAuth Credentials

Before running the deployment wizard, ensure you have a Google OAuth App configured:
1. Go to [Google Cloud Console](https://console.cloud.google.com/) → APIs & Services → Credentials
2. Create an **OAuth 2.0 Client ID** (Web application type)
3. Add `http://localhost:8787/api/auth/google/callback` as an authorized redirect URI (if running locally) or your production domain callback.
4. Keep the Client ID and Client Secret handy.

### 2. Run the Interactive Setup (Quickstart)

Omnidrive includes a fully automated deployment wizard that configures your environment, sets up databases, and starts the application for you. You can run it directly via remote script:

```bash
curl -fsSL https://raw.githubusercontent.com/abilfida/omnidrive/main/deploy.sh | bash
```

*(This script will automatically clone the repository if it's not present in the current directory).*

Follow the prompts to select your deployment target:
- **💻 Local Development**: Automatically provisions local D1/KV databases, generates secrets, and starts `npm run dev`.
- **🐳 Docker Compose (Self-hosted)**: Generates `.env`, exposes your selected port, and runs `docker compose up -d`.
- **☁️ Cloudflare (Production)**: Provisions remote D1/KV resources, pushes secrets to Cloudflare, and deploys the API and Frontend directly to the edge.

Or use the [Cloudflare Pages dashboard](https://dash.cloudflare.com/?to=/:account/pages) for automatic deployments from your Git repo if you prefer CI/CD.


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
