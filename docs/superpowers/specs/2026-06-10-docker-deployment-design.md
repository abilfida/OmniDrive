# OmniDrive Docker Deployment & CI/CD Design

## 1. Goal
Menyediakan mekanisme deployment mandiri menggunakan Docker untuk proyek OmniDrive (yang awalnya didesain untuk Cloudflare Workers) tanpa bergantung pada layanan eksternal Cloudflare secara langsung. Selain itu, menyediakan CI/CD pipeline untuk melakukan build dan push Docker image secara otomatis, dengan tag version yang sinkron dengan GitHub Release.

## 2. Architecture: Independent Containers + Docker Compose
Kita akan menggunakan dua container yang independen dan digabungkan dengan `docker-compose.yml` agar mudah dijalankan oleh pengguna akhir.

1.  **Frontend (`web`)**: Berisi React frontend, akan di-*serve* menggunakan Nginx.
2.  **Backend (`worker`)**: Berisi Hono API, dijalankan menggunakan Cloudflare Wrangler secara lokal (emulasi).
3.  **Data Persistence**: Cloudflare D1 (Database) dan Cloudflare KV akan diemulasikan dengan SQLite secara lokal oleh Wrangler. Data ini akan disimpan di direktori `.wrangler/` dan akan di-*mount* ke dalam Docker Volume agar data persisten di-restart container.

## 3. Container Specs

### 3.1. Web Container (`packages/web/Dockerfile`)
-   **Base Image (Build)**: `node:18-alpine` atau `node:20-alpine`.
-   **Build Step**: Menjalankan `rtk npm install` dan `rtk npm run build:web` dari root, atau dari context package.
-   **Base Image (Serve)**: `nginx:alpine`.
-   **Konfigurasi Tambahan**: Membutuhkan `nginx.conf` atau konfigurasi default untuk merutekan semua *traffic* (fallback) ke `index.html` guna mengakomodasi sistem routing dari React Router (Client-Side Routing).

### 3.2. Worker Container (`packages/worker/Dockerfile`)
-   **Base Image**: `node:18-alpine` atau `node:20-alpine`.
-   **Build Step**: Menyalin file proyek, menjalankan `rtk npm install`.
-   **Runtime**: Menjalankan perintah `rtk wrangler dev --local --ip 0.0.0.0 --port 8787`.
-   **Environment Variables**: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, dsb. akan di-pass melalui `docker-compose.yml`.

## 4. CI/CD & Versioning
-   **Trigger**: Pipeline GitHub Actions (`.github/workflows/docker-publish.yml`) akan berjalan ketika ada push *tag* baru yang diawali dengan `v` (misal: `v1.0.0`, `v0.1.0`).
-   **Build & Push**:
    -   Mengekstrak versi dari Tag (e.g., `v1.0.0`).
    -   Mem-build image `web` dan `worker`.
    -   Push image tersebut ke GitHub Container Registry (`ghcr.io/abilfida/omnidrive-web:<tag>` dan `ghcr.io/abilfida/omnidrive-worker:<tag>`).
-   **Release Artifacts**: Pipeline juga akan melampirkan file `docker-compose.yml` yang siap pakai ke GitHub Release, sehingga user cukup mengunduh file ini dan menjalankan `docker compose up -d`.

## 5. Persistent Volume
Docker akan memiliki satu *named volume* (contoh: `worker-data`). Volume ini akan di-*mount* pada direktori tempat Wrangler menyimpan emulasi D1 dan KV: `/app/packages/worker/.wrangler`. Dengan begini, auth session, token, quota (KV) dan struktur database (D1) akan tetap aman saat container diperbarui.
