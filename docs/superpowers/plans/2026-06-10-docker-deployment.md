# Docker Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create independent Docker containers for the Web and Worker packages, linked via Docker Compose, and establish a GitHub Actions pipeline to publish them to GHCR.

**Architecture:** A multi-stage Docker build for the React frontend served via Nginx, a Node-based Docker build for running the Cloudflare Worker via `wrangler dev --local`, a `docker-compose.yml` to stitch them together with a volume for SQLite D1 emulation, and a GitHub workflow for CI/CD triggered by version tags.

**Tech Stack:** Docker, Docker Compose, Nginx, GitHub Actions.

---

### Task 1: Root .dockerignore

**Files:**
- Create: `.dockerignore`

- [ ] **Step 1: Write the failing test**

We will verify the absence of the file.
```bash
# This is a simple bash script to check for file existence
echo 'if [ ! -f .dockerignore ]; then exit 1; fi' > test_dockerignore.sh
chmod +x test_dockerignore.sh
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./test_dockerignore.sh`
Expected: FAIL (Exit code 1)

- [ ] **Step 3: Write minimal implementation**

Create `.dockerignore`:
```text
node_modules
.git
.wrangler
dist
build
.env
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./test_dockerignore.sh`
Expected: PASS (Exit code 0). Clean up the test file: `rm test_dockerignore.sh`.

- [ ] **Step 5: Commit**

```bash
git add .dockerignore
git commit -m "chore: add root dockerignore"
```

---

### Task 2: Web Container Setup

**Files:**
- Create: `packages/web/nginx.conf`
- Create: `packages/web/Dockerfile`

- [ ] **Step 1: Write the failing test**

For Docker, the test is attempting to build the image.

- [ ] **Step 2: Run test to verify it fails**

Run: `docker build -t omnidrive-web:test -f packages/web/Dockerfile .`
Expected: FAIL with "unable to prepare context: path "packages/web/Dockerfile" not found"

- [ ] **Step 3: Write minimal implementation**

Create `packages/web/nginx.conf`:
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
}
```

Create `packages/web/Dockerfile`:
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

# Stage 2: Serve with Nginx
FROM nginx:alpine

# Copy custom nginx config
COPY packages/web/nginx.conf /etc/nginx/conf.d/default.conf

# Copy built assets
COPY --from=builder /app/packages/web/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
```

- [ ] **Step 4: Run test to verify it passes**

Run: `docker build -t omnidrive-web:test -f packages/web/Dockerfile .`
Expected: PASS (Successfully built)

- [ ] **Step 5: Commit**

```bash
git add packages/web/nginx.conf packages/web/Dockerfile
git commit -m "feat: add web dockerfile and nginx config"
```

---

### Task 3: Worker Container Setup

**Files:**
- Create: `packages/worker/Dockerfile`

- [ ] **Step 1: Write the failing test**

We will test the docker build.

- [ ] **Step 2: Run test to verify it fails**

Run: `docker build -t omnidrive-worker:test -f packages/worker/Dockerfile .`
Expected: FAIL with "path "packages/worker/Dockerfile" not found"

- [ ] **Step 3: Write minimal implementation**

Create `packages/worker/Dockerfile`:
```dockerfile
FROM node:20-alpine

WORKDIR /app

# Copy root package.json and workspace definition
COPY package.json package-lock.json* ./
COPY tsconfig.base.json ./

# Copy packages
COPY packages/worker ./packages/worker
COPY packages/web/package.json ./packages/web/package.json

# Install dependencies
RUN npm ci

# Expose wrangler local port
EXPOSE 8787

WORKDIR /app/packages/worker

# Initialize D1 SQLite database (Optional pre-creation step to ensure the dir exists)
RUN mkdir -p .wrangler/state/v3/d1

# Run the worker via wrangler dev
CMD ["npm", "run", "dev", "--", "--ip", "0.0.0.0", "--port", "8787"]
```

- [ ] **Step 4: Run test to verify it passes**

Run: `docker build -t omnidrive-worker:test -f packages/worker/Dockerfile .`
Expected: PASS (Successfully built)

- [ ] **Step 5: Commit**

```bash
git add packages/worker/Dockerfile
git commit -m "feat: add worker dockerfile for local runtime"
```

---

### Task 4: Docker Compose Setup

**Files:**
- Create: `docker-compose.yml`

- [ ] **Step 1: Write the failing test**

We use `docker compose config` to validate the file without running it.

- [ ] **Step 2: Run test to verify it fails**

Run: `docker compose config`
Expected: FAIL (no configuration file provided)

- [ ] **Step 3: Write minimal implementation**

Create `docker-compose.yml`:
```yaml
version: '3.8'

services:
  web:
    image: ghcr.io/${GITHUB_REPOSITORY_OWNER:-abilfida}/omnidrive-web:${APP_VERSION:-latest}
    build:
      context: .
      dockerfile: packages/web/Dockerfile
    ports:
      - "8080:80"
    restart: unless-stopped
    depends_on:
      - worker

  worker:
    image: ghcr.io/${GITHUB_REPOSITORY_OWNER:-abilfida}/omnidrive-worker:${APP_VERSION:-latest}
    build:
      context: .
      dockerfile: packages/worker/Dockerfile
    ports:
      - "8787:8787"
    environment:
      - GOOGLE_CLIENT_ID=${GOOGLE_CLIENT_ID}
      - GOOGLE_CLIENT_SECRET=${GOOGLE_CLIENT_SECRET}
    volumes:
      - worker-data:/app/packages/worker/.wrangler
    restart: unless-stopped

volumes:
  worker-data:
```

- [ ] **Step 4: Run test to verify it passes**

Run: `docker compose config`
Expected: PASS (Prints the parsed configuration)

- [ ] **Step 5: Commit**

```bash
git add docker-compose.yml
git commit -m "feat: add docker-compose for unified deployment"
```

---

### Task 5: GitHub Actions Pipeline

**Files:**
- Create: `.github/workflows/docker-publish.yml`

- [ ] **Step 1: Write the failing test**

We will write a simple script to validate YAML syntax using python.
```bash
echo 'import yaml, sys; yaml.safe_load(sys.stdin)' > test_yaml.py
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cat .github/workflows/docker-publish.yml | python3 test_yaml.py`
Expected: FAIL (No such file or directory)

- [ ] **Step 3: Write minimal implementation**

Create `.github/workflows/docker-publish.yml`:
```yaml
name: Publish Docker Images

on:
  push:
    tags:
      - 'v*'

env:
  REGISTRY: ghcr.io
  IMAGE_NAME_WEB: ${{ github.repository_owner }}/omnidrive-web
  IMAGE_NAME_WORKER: ${{ github.repository_owner }}/omnidrive-worker

jobs:
  build-and-push:
    runs-on: ubuntu-latest
    permissions:
      contents: write
      packages: write

    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Log in to the Container registry
        uses: docker/login-action@v3
        with:
          registry: ${{ env.REGISTRY }}
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Extract metadata (tags, labels) for Web
        id: meta-web
        uses: docker/metadata-action@v5
        with:
          images: ${{ env.REGISTRY }}/${{ env.IMAGE_NAME_WEB }}
          tags: type=semver,pattern={{version}}

      - name: Build and push Web image
        uses: docker/build-push-action@v5
        with:
          context: .
          file: packages/web/Dockerfile
          push: true
          tags: ${{ steps.meta-web.outputs.tags }}
          labels: ${{ steps.meta-web.outputs.labels }}

      - name: Extract metadata (tags, labels) for Worker
        id: meta-worker
        uses: docker/metadata-action@v5
        with:
          images: ${{ env.REGISTRY }}/${{ env.IMAGE_NAME_WORKER }}
          tags: type=semver,pattern={{version}}

      - name: Build and push Worker image
        uses: docker/build-push-action@v5
        with:
          context: .
          file: packages/worker/Dockerfile
          push: true
          tags: ${{ steps.meta-worker.outputs.tags }}
          labels: ${{ steps.meta-worker.outputs.labels }}

      - name: Release docker-compose.yml
        uses: softprops/action-gh-release@v1
        with:
          files: docker-compose.yml
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `mkdir -p .github/workflows && cat .github/workflows/docker-publish.yml | python3 test_yaml.py`
Expected: PASS (No output). Clean up test script: `rm test_yaml.py`.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/docker-publish.yml
git commit -m "ci: add github actions for docker publish and release"
```
