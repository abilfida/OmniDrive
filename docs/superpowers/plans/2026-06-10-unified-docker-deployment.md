# Unified Docker Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Unified Docker Image build that runs both the React frontend and Cloudflare Worker backend in a single container.

**Architecture:** A multi-stage Docker build utilizing `node:20-alpine` as base, installing `nginx` for serving the frontend and proxying API requests to a locally running Wrangler dev server.

**Tech Stack:** Docker, Nginx, Node.js, GitHub Actions

---

### Task 1: Nginx Configuration for Unified Image

**Files:**
- Create: `nginx-unified.conf`

- [ ] **Step 1: Write the failing test**

```bash
echo 'if [ ! -f nginx-unified.conf ]; then exit 1; fi' > test_nginx_unified.sh
chmod +x test_nginx_unified.sh
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./test_nginx_unified.sh`
Expected: FAIL (Exit code 1)

- [ ] **Step 3: Write minimal implementation**

Create `nginx-unified.conf`:
```nginx
server {
    listen 80;
    server_name _;

    root /usr/share/nginx/html;
    index index.html;

    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_min_length 10240;
    gzip_proxied expired no-cache no-store private auth;
    gzip_types text/plain text/css text/xml text/javascript application/x-javascript application/xml;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:8787/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./test_nginx_unified.sh`
Expected: PASS (Exit code 0). Clean up the test file: `rm test_nginx_unified.sh`.

- [ ] **Step 5: Commit**

```bash
git add nginx-unified.conf
git commit -m "feat: add nginx config for unified docker image"
```

---

### Task 2: Entrypoint Script

**Files:**
- Create: `start-unified.sh`

- [ ] **Step 1: Write the failing test**

```bash
echo 'if [ ! -f start-unified.sh ]; then exit 1; fi' > test_start_script.sh
chmod +x test_start_script.sh
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./test_start_script.sh`
Expected: FAIL (Exit code 1)

- [ ] **Step 3: Write minimal implementation**

Create `start-unified.sh`:
```bash
#!/bin/sh

echo "Starting Wrangler Backend..."
cd /app/packages/worker
# Initialize D1 SQLite directory if not exists
mkdir -p .wrangler/state/v3/d1
npm run dev -- --ip 127.0.0.1 --port 8787 &

echo "Waiting for Wrangler to initialize..."
sleep 2

echo "Starting Nginx Frontend..."
nginx -g 'daemon off;'
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./test_start_script.sh`
Expected: PASS. Clean up: `rm test_start_script.sh`.

- [ ] **Step 5: Commit**

```bash
git add start-unified.sh
git commit -m "feat: add entrypoint script for unified docker image"
```

---

### Task 3: Unified Dockerfile

**Files:**
- Create: `Dockerfile.unified`

- [ ] **Step 1: Write the failing test**

```bash
# Docker file build test
```

- [ ] **Step 2: Run test to verify it fails**

Run: `docker build -t omnidrive-unified:test -f Dockerfile.unified .`
Expected: FAIL with "path Dockerfile.unified not found"

- [ ] **Step 3: Write minimal implementation**

Create `Dockerfile.unified`:
```dockerfile
# Stage 1: Build the React application
FROM node:20-alpine AS builder

WORKDIR /app

# Copy root package.json and workspace definition
COPY package.json package-lock.json* ./
COPY tsconfig.base.json ./

# Copy packages
COPY packages/web ./packages/web
COPY packages/worker/package.json ./packages/worker/package.json

# Install dependencies
RUN npm ci

# Build web package
RUN npm run build:web

# Stage 2: Serve with Nginx and run Worker
FROM node:20-alpine

# Install nginx
RUN apk add --no-cache nginx

WORKDIR /app

# Copy custom nginx config
COPY nginx-unified.conf /etc/nginx/conf.d/default.conf

# Copy built assets
COPY --from=builder /app/packages/web/dist /usr/share/nginx/html

# Copy root package.json and tsconfig
COPY package.json package-lock.json* ./
COPY tsconfig.base.json ./

# Copy worker package and web package.json (needed for workspace install)
COPY packages/worker ./packages/worker
COPY packages/web/package.json ./packages/web/package.json

# Install dependencies for runner
RUN npm ci

# Copy entrypoint script
COPY start-unified.sh /start-unified.sh
RUN chmod +x /start-unified.sh

# Create Nginx run directory
RUN mkdir -p /run/nginx

EXPOSE 80

CMD ["/start-unified.sh"]
```

- [ ] **Step 4: Run test to verify it passes**

Run: `docker build -t omnidrive-unified:test -f Dockerfile.unified .`
Expected: PASS (Successfully built)

- [ ] **Step 5: Commit**

```bash
git add Dockerfile.unified
git commit -m "feat: add unified dockerfile for frontend and backend"
```

---

### Task 4: GitHub Action Update

**Files:**
- Modify: `.github/workflows/docker-publish.yml`

- [ ] **Step 1: Write the failing test**

We will verify that the YAML file does not contain the unified image env variable yet.
Run: `grep "IMAGE_NAME_UNIFIED" .github/workflows/docker-publish.yml || exit 1`
Expected: FAIL

- [ ] **Step 2: Run test to verify it fails**

Run: `grep "IMAGE_NAME_UNIFIED" .github/workflows/docker-publish.yml || exit 1`
Expected: FAIL (Exit code 1)

- [ ] **Step 3: Write minimal implementation**

Modify `.github/workflows/docker-publish.yml`.
Find the `env` block and append `IMAGE_NAME_UNIFIED`:
```yaml
env:
  REGISTRY: ghcr.io
  IMAGE_NAME_WEB: ${{ github.repository_owner }}/omnidrive-web
  IMAGE_NAME_WORKER: ${{ github.repository_owner }}/omnidrive-worker
  IMAGE_NAME_UNIFIED: ${{ github.repository_owner }}/omnidrive-unified
```

Find the end of the `Build and push Worker image` step and append the Unified image steps before `Release docker-compose.yml`:
```yaml
      - name: Extract metadata (tags, labels) for Unified
        id: meta-unified
        uses: docker/metadata-action@v5
        with:
          images: ${{ env.REGISTRY }}/${{ env.IMAGE_NAME_UNIFIED }}
          tags: type=semver,pattern={{version}}

      - name: Build and push Unified image
        uses: docker/build-push-action@v5
        with:
          context: .
          file: Dockerfile.unified
          push: true
          tags: ${{ steps.meta-unified.outputs.tags }}
          labels: ${{ steps.meta-unified.outputs.labels }}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `grep "IMAGE_NAME_UNIFIED" .github/workflows/docker-publish.yml`
Expected: PASS (Finds the line)

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/docker-publish.yml
git commit -m "ci: add unified image build to docker publish workflow"
```
