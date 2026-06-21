# Omnidrive

**Gateway penyimpanan multi-Google Drive terpadu yang dibangun di atas Cloudflare Workers.**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg)](https://www.typescriptlang.org/)
[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-orange.svg)](https://workers.cloudflare.com/)

> 🌐 *Read in [English](README.md)*

---

## Apa itu Omnidrive?

Omnidrive memungkinkan kamu menghubungkan beberapa akun Google Drive dan mengelola semua file dari satu dashboard. Semuanya berjalan di jaringan edge Cloudflare — Workers untuk API, D1 untuk database, dan KV untuk penyimpanan sesi — sehingga tidak perlu server tradisional.

## Fitur

- **🔗 Multi-Akun Drive** — Hubungkan beberapa akun Google Drive via OAuth atau Service Account JSON
- **🏢 Enterprise Workspaces** — Workspace tim menggantikan folder virtual, dengan RBAC, Kuota, Kebijakan Retensi Data, dan Audit Logging
- **📁 Browsing File Terpadu** — Jelajahi file dari semua drive yang terhubung dalam satu tampilan gabungan
- **🔍 Pencarian Global & Metadata** — Pencarian global terpadu dengan penyaringan metadata, properti metadata file kustom, dan lencana visual
- **⬆️ Upload Cerdas & Aksi Massal** — Drag-and-drop upload, pemilihan drive otomatis, dan operasi massal (Pindah, Hapus)
- **🔒 Shared Links** — Bagikan file dengan proteksi password, tanggal kadaluarsa, dan batas download
- **⚡ Aturan Automasi** — Pindahkan atau hapus file otomatis berdasarkan pola nama atau ekstensi
- **🔄 Sinkronisasi Latar Belakang Tangguh** — Sinkronisasi otomatis via Google Drive Changes API (cron setiap 30 menit). Dilengkapi pemrosesan chunk yang aman dari OOM (OOM-safe) menggunakan generator, sinkronisasi yang dapat dilanjutkan (resume-able) setelah restart via `next_page_token`, upsert atomik untuk performa tinggi, dan penanganan graceful shutdown (SIGTERM) untuk mencegah sinkronisasi berjalan bersamaan.
- **🌙 Mode Gelap** — UI tema gelap modern dengan sidebar workspace hierarkis ala Notion
- **☁️ S3 Object Storage API** — API kompatibel S3 yang memungkinkan klien seperti rclone, aws-cli, dan boto3 terhubung langsung ke workspace Omnidrive sebagai bucket S3

## Keamanan

Omnidrive mengimplementasikan model keamanan yang tangguh untuk melindungi file dan data kamu:
- **Enkripsi Token**: Token Google OAuth dienkripsi saat istirahat (at rest) menggunakan AES-256-GCM.
- **Proteksi CSRF & SSRF**: Semua endpoint mutasi dilindungi dari Cross-Site Request Forgery, dan webhook divalidasi untuk mencegah Server-Side Request Forgery.
- **Rate Limiting**: Rate limiter bawaan dengan sliding window melindungi autentikasi dan endpoint publik dari serangan brute-force.
- **OAuth PKCE**: Alur autentikasi menggunakan Proof Key for Code Exchange (S256) untuk keamanan tambahan.
- **Kontrol Akses Ketat**: Pencegahan eskalasi peran RBAC dan pencegahan IDOR (Insecure Direct Object Reference) pada semua akses sumber daya.


## S3 Object Storage API

Omnidrive menyediakan API kompatibel S3 Object Storage. Klien S3 apa pun (rclone, aws-cli, boto3, AWS SDK) dapat terhubung menggunakan path-style access.

**Cara kerja:**
- Setiap **Workspace** dipetakan sebagai satu **Bucket**
- File di dalam workspace menjadi **Object**, dengan path folder sebagai prefix key
- Buat kredensial per-user dari **Pengaturan → Kredensial S3**

**Endpoint:** `https://<url-worker-kamu>/s3`

**Contoh konfigurasi rclone:**
```ini
[omnidrive]
type = s3
provider = Other
access_key_id = OMNI...
secret_access_key = ...
endpoint = https://<url-worker-kamu>/s3
force_path_style = true
```

**Operasi yang didukung:** ListBuckets, ListObjectsV2, GetObject, PutObject (single-part), HeadObject, DeleteObject, dan Multipart Upload lengkap (Initiate, UploadPart, CompleteMultipartUpload, AbortMultipartUpload).


## Tech Stack

| Layer | Teknologi |
|-------|-----------|
| **Backend** | [Hono](https://hono.dev/) di [Cloudflare Workers](https://workers.cloudflare.com/) |
| **Database** | [Cloudflare D1](https://developers.cloudflare.com/d1/) (SQLite) |
| **Session Store** | [Cloudflare KV](https://developers.cloudflare.com/kv/) |
| **Frontend** | [React 19](https://react.dev/) + [Vite](https://vite.dev/) |
| **State Management** | [Zustand](https://zustand.docs.pmnd.rs/) |
| **Bahasa** | [TypeScript](https://www.typescriptlang.org/) |
| **Auth** | Google OAuth 2.0 |

## Arsitektur

```
omnidrive/
├── packages/
│   ├── worker/          # Cloudflare Worker (API backend)
│   │   ├── src/
│   │   │   ├── routes/      # Handler rute API
│   │   │   ├── services/    # Logika bisnis (Google Drive, sync, auth)
│   │   │   ├── middleware/  # Auth guard, CORS, error handling
│   │   │   ├── db/          # Skema D1
│   │   │   └── types/       # Tipe TypeScript
│   │   └── tests/           # Unit test Vitest
│   └── web/             # React SPA (frontend)
│       └── src/
│           ├── components/  # Komponen UI
│           ├── pages/       # Halaman rute
│           ├── stores/      # State store Zustand
│           ├── hooks/       # Custom React hooks
│           ├── lib/         # API client, utilitas
│           └── types/       # Tipe TypeScript
├── docs/                # Spesifikasi desain dan rencana implementasi
├── Makefile             # Automasi deployment
└── package.json         # Root monorepo (npm workspaces)
```

Backend dan frontend berkomunikasi via REST API. Saat development, dev server Vite mem-proxy request `/api/*` ke Worker lokal di port 8787.

## Prasyarat

- [Node.js](https://nodejs.org/) 18+ dan npm
- Akun [Cloudflare](https://dash.cloudflare.com/sign-up) (tier gratis cukup)
- [Google Cloud project](https://console.cloud.google.com/) dengan Google Drive API yang sudah diaktifkan
- OAuth 2.0 Client ID (tipe Web application) dari Google Cloud Console

## Memulai

### 1. Siapkan Kredensial Google OAuth

Sebelum menjalankan wizard instalasi, pastikan kamu sudah mengonfigurasi Google OAuth App:
1. Buka [Google Cloud Console](https://console.cloud.google.com/) → APIs & Services → Credentials
2. Buat **OAuth 2.0 Client ID** (tipe Web application)
3. Tambahkan `http://localhost:8787/api/auth/google/callback` sebagai authorized redirect URI (jika lokal) atau callback domain production kamu.
4. Simpan Client ID dan Client Secret.

### 2. Jalankan Setup Interaktif (Quickstart)

Omnidrive dilengkapi dengan wizard instalasi otomatis yang mengatur environment, menyiapkan database, dan menjalankan aplikasi untuk kamu. Kamu dapat menjalankannya langsung melalui remote script:

```bash
curl -fsSL https://raw.githubusercontent.com/abilfida/omnidrive/main/deploy.sh | bash
```

*(Script ini akan secara otomatis mengkloning repositori jika belum ada di direktori saat ini).*

Ikuti panduan di layar untuk memilih target deployment kamu:
- **💻 Local Development**: Otomatis menyiapkan database D1/KV lokal, menghasilkan secret, dan menjalankan `npm run dev`.
- **🐳 Docker Compose (Self-hosted)**: Menghasilkan file `.env`, mengatur port pilihan kamu, dan menjalankan `docker compose up -d`.
- **☁️ Cloudflare (Production)**: Menyiapkan sumber daya D1/KV remote, mengirimkan secrets ke Cloudflare, dan mendeploy API serta Frontend langsung ke edge.

Atau gunakan [dashboard Cloudflare Pages](https://dash.cloudflare.com/?to=/:account/pages) untuk deployment otomatis dari repo Git jika kamu lebih memilih menggunakan CI/CD.

### 3. Deploy Manual ke Cloudflare

Jika kamu tidak menggunakan script `deploy.sh`, kamu bisa mendeploy secara manual:

1. **Login ke Cloudflare via Wrangler**
   ```bash
   npx wrangler login
   ```
2. **Buat Database D1**
   ```bash
   npx wrangler d1 create omnidrive
   ```
   *Perbarui file `wrangler.toml` di dalam `packages/worker/wrangler.toml` dengan `database_id` yang didapat.*
3. **Buat KV Namespace**
   ```bash
   npx wrangler kv:namespace create OMNIDRIVE_SESSIONS
   ```
   *Perbarui file `wrangler.toml` dengan `id` KV yang didapat.*
4. **Terapkan Migrasi Database**
   ```bash
   npm run db:migrate:remote -w packages/worker
   ```
5. **Set Secrets (Variabel Lingkungan yang Aman)**
   Jalankan perintah ini satu per satu dan masukkan nilainya:
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
   *Catat URL Worker yang diberikan setelah proses deploy selesai.*
7. **Deploy Pages (Frontend)**
   Pastikan kamu telah mengonfigurasi `packages/web/.env.production` dengan domain Worker yang baru saja dideploy.
   ```bash
   npm run build -w packages/web
   npx wrangler pages deploy packages/web/dist --project-name=omnidrive-web
   ```

## Variabel Environment

Omnidrive menggunakan **satu file `.env` terpusat** di root project untuk mengelola konfigurasi Web dan Worker secara bersamaan.

### Konfigurasi Global (set di `/.env`)

Salin `/.env.example` menjadi `/.env` dan isi dengan nilai yang sesuai. File ini secara otomatis akan dibaca oleh Vite maupun Wrangler selama local development.

| Variabel | Deskripsi | Default |
|----------|-----------|---------|
| `WEB_PORT` | Port untuk frontend React | `8999` |
| `WORKER_PORT` | Port untuk Cloudflare Worker API | `8888` |
| `FRONTEND_URL` | Origin frontend untuk CORS dan redirect | `http://localhost:8999` |
| `WORKER_URL` | URL Worker untuk OAuth callback | `http://localhost:8888` |
| `VITE_API_URL` | URL base API Worker untuk frontend | `http://localhost:8888` |
| `GOOGLE_CLIENT_ID` | Google OAuth 2.0 Client ID | |
| `GOOGLE_CLIENT_SECRET` | Google OAuth 2.0 Client Secret | |
| `JWT_SECRET` | Kunci khusus penanda tangan JWT (minimal 32 karakter) | |
| `TOKEN_ENCRYPTION_KEY` | Kunci enkripsi token OAuth saat istirahat (32 karakter) | |

*Catatan: Untuk production di Cloudflare, secrets backend harus diset via `wrangler secret put`, dan variabel biasa di `wrangler.toml` bagian `[vars]`. Frontend menggunakan `packages/web/.env.production`.*

## Lisensi

[MIT](LICENSE) © 2026 abilfida
