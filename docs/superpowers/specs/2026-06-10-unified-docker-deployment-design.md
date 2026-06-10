# Unified Docker Deployment Design

## 1. Overview
This spec outlines the addition of a Unified Docker Image build for the OmniDrive project. The unified image combines both the React Frontend and the Cloudflare Worker Backend into a single container for easier single-node deployment (e.g., homelab, single VPS), avoiding multi-container orchestration.

## 2. Architecture
The unified container will use a single port (80) exposed to the host.
- **Base Environment**: `node:20-alpine` with `nginx` installed.
- **Frontend Serving**: Nginx serves the compiled React assets (SPA fallback).
- **Backend Serving**: Wrangler runs the backend worker in local dev mode.
- **Internal Proxying**: Nginx reverse proxies any requests to `/api/` directly to the internally running Wrangler instance (`http://127.0.0.1:8787`).

## 3. Files to Add/Modify

### 3.1 `Dockerfile.unified`
A multi-stage Dockerfile located in the project root:
- **Stage 1 (Builder)**: Copies monorepo code, runs `npm ci` and builds the `@omnidrive/web` package.
- **Stage 2 (Runner)**:
  - Base: `node:20-alpine`
  - Installs `nginx`.
  - Copies built web assets to `/usr/share/nginx/html`.
  - Copies worker source code and required `package.json`s.
  - Exposes port 80.
  - Uses a custom entrypoint script to launch both services.

### 3.2 `nginx-unified.conf`
Nginx configuration tailored for the unified setup:
- Listens on port 80.
- Serves static files with `try_files $uri $uri/ /index.html;`.
- Includes a location block for `/api/` that uses `proxy_pass http://127.0.0.1:8787/`.

### 3.3 `start-unified.sh`
A bash script to manage processes:
- Starts Wrangler in the background.
- Starts Nginx in the foreground.

### 3.4 GitHub Action Workflow Update
Instead of creating a completely new file, it is cleaner to update the existing `.github/workflows/docker-publish.yml` to build and push three images on tag push:
1. `omnidrive-web`
2. `omnidrive-worker`
3. `omnidrive-unified`

## 4. Error Handling & Limitations
- If either Nginx or Wrangler crashes, the unified container might not fully fail if not tracked properly. The entrypoint script should ideally exit if any background process fails (e.g., using `wait -n` command in Bash).

## 5. Testing Strategy
Build the `Dockerfile.unified` locally and verify that hitting port 80 serves the frontend and successfully routes API calls to the backend without CORS issues.
