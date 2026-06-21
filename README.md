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
- **☁️ S3 Object Storage API** — S3-compatible API (path-style access) exposing each workspace as a bucket; supports rclone, aws-cli, boto3, and AWS SDK with full Multipart Upload support

## Security

Omnidrive implements a robust security model to protect your files and data:
- **Token Encryption**: Google OAuth tokens are encrypted at rest using AES-256-GCM.
- **CSRF & SSRF Protection**: All mutating endpoints are protected against Cross-Site Request Forgery, and webhooks are validated against Server-Side Request Forgery.
- **Rate Limiting**: Built-in sliding window rate limiters protect authentication and public endpoints from brute-force attacks.
- **OAuth PKCE**: Authentication flow uses Proof Key for Code Exchange (S256) for enhanced security.
- **Strict Access Control**: Enforced RBAC role escalation prevention and IDOR (Insecure Direct Object Reference) prevention on all resource access.


## S3 Object Storage API

Omnidrive exposes an S3-compatible Object Storage API. Any S3 client (rclone, aws-cli, boto3, AWS SDK) can connect to it using path-style access.

**How it works:**
- Each **Workspace** is a **Bucket**
- Files inside a workspace become **Objects**, with folder paths as key prefixes
- Generate per-user credentials from **Settings → S3 Credentials**

**Endpoint:** `https://<your-worker-url>/s3`

**rclone configuration example:**
```ini
[omnidrive]
type = s3
provider = Other
access_key_id = OMNI...
secret_access_key = ...
endpoint = https://<your-worker-url>/s3
force_path_style = true
```

**Supported operations:** ListBuckets, ListObjectsV2, GetObject, PutObject (single-part), HeadObject, DeleteObject, and full Multipart Upload (Initiate, UploadPart, CompleteMultipartUpload, AbortMultipartUpload).

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

### 3. Manual Deployment to Cloudflare

If you prefer not to use the `deploy.sh` script, you can deploy manually:

1. **Login to Cloudflare via Wrangler**
   ```bash
   npx wrangler login
   ```
2. **Create D1 Database**
   ```bash
   npx wrangler d1 create omnidrive
   ```
   *Update `packages/worker/wrangler.toml` with the generated `database_id`.*
3. **Create KV Namespace**
   ```bash
   npx wrangler kv:namespace create OMNIDRIVE_SESSIONS
   ```
   *Update `packages/worker/wrangler.toml` with the generated KV `id`.*
4. **Apply Database Migrations**
   ```bash
   npm run db:migrate:remote -w packages/worker
   ```
5. **Set Secrets (Secure Environment Variables)**
   Run these commands one by one and enter the respective values:
   ```bash
   npx wrangler secret put GOOGLE_CLIENT_ID -c packages/worker/wrangler.toml
   npx wrangler secret put GOOGLE_CLIENT_SECRET -c packages/worker/wrangler.toml
   npx wrangler secret put JWT_SECRET -c packages/worker/wrangler.toml
   npx wrangler secret put TOKEN_ENCRYPTION_KEY -c packages/worker/wrangler.toml
   ```
6. **Deploy Worker (Backend)**
   ```bash
   npm run deploy -w packages/worker
   ```
   *Note the Worker URL provided after deployment.*
7. **Deploy Pages (Frontend)**
   Ensure you have configured `packages/web/.env.production` with your newly deployed Worker domain.
   ```bash
   npm run build -w packages/web
   npx wrangler pages deploy packages/web/dist --project-name=omnidrive-web
   ```

## Environment Variables

Omnidrive uses a **single centralized `.env` file** at the root of the project to manage both Web and Worker configurations.

### Global Configuration (set in `/.env`)

Copy `/.env.example` to `/.env` and fill in your values. This file is automatically read by both Vite and Wrangler during local development.

| Variable | Description | Default |
|----------|-------------|---------|
| `WEB_PORT` | Port for the React frontend | `8999` |
| `WORKER_PORT` | Port for the Cloudflare Worker API | `8888` |
| `FRONTEND_URL` | Frontend origin for CORS and redirects | `http://localhost:8999` |
| `WORKER_URL` | Worker URL for OAuth callback | `http://localhost:8888` |
| `VITE_API_URL` | Worker API base URL for the frontend | `http://localhost:8888` |
| `GOOGLE_CLIENT_ID` | Google OAuth 2.0 Client ID | |
| `GOOGLE_CLIENT_SECRET` | Google OAuth 2.0 Client Secret | |
| `JWT_SECRET` | JWT signing key for shared links (min 32 chars) | |
| `TOKEN_ENCRYPTION_KEY` | AES-256-GCM key for encrypting OAuth tokens (32 chars)| |

*Note: For production on Cloudflare, backend secrets should be set via `wrangler secret put`, and non-secrets in `wrangler.toml` under `[vars]`. The frontend uses `packages/web/.env.production`.*

## License

[MIT](LICENSE) © 2026 abilfida
