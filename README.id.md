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
- **🔄 Sinkronisasi Real-Time** — Sinkronisasi otomatis via Google Drive Changes API (cron setiap 30 menit)
- **🌙 Mode Gelap** — UI tema gelap modern dengan sidebar workspace hierarkis ala Notion

## Keamanan

Omnidrive mengimplementasikan model keamanan yang tangguh untuk melindungi file dan data kamu:
- **Enkripsi Token**: Token Google OAuth dienkripsi saat istirahat (at rest) menggunakan AES-256-GCM.
- **Proteksi CSRF & SSRF**: Semua endpoint mutasi dilindungi dari Cross-Site Request Forgery, dan webhook divalidasi untuk mencegah Server-Side Request Forgery.
- **Rate Limiting**: Rate limiter bawaan dengan sliding window melindungi autentikasi dan endpoint publik dari serangan brute-force.
- **OAuth PKCE**: Alur autentikasi menggunakan Proof Key for Code Exchange (S256) untuk keamanan tambahan.
- **Kontrol Akses Ketat**: Pencegahan eskalasi peran RBAC dan pencegahan IDOR (Insecure Direct Object Reference) pada semua akses sumber daya.


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

### 1. Clone dan Install

```bash
git clone https://github.com/abilfida/omnidrive.git
cd omnidrive
npm install
```

### 2. Konfigurasi Worker

```bash
# Salin contoh konfigurasi
cp packages/worker/wrangler.example.toml packages/worker/wrangler.toml

# Buat database D1
npx wrangler d1 create omnidrive
# Salin database_id dari output ke wrangler.toml

# Buat KV namespace
npx wrangler kv namespace create KV
# Salin namespace id dari output ke wrangler.toml

# Terapkan skema database
npx wrangler d1 execute omnidrive --local --file=packages/worker/src/db/schema.sql
```

### 3. Siapkan Kredensial Google OAuth

```bash
# Salin template secrets
cp packages/worker/.dev.vars.example packages/worker/.dev.vars
```

Edit `packages/worker/.dev.vars` dan isi kredensial Google OAuth:

1. Buka [Google Cloud Console](https://console.cloud.google.com/) → APIs & Services → Credentials
2. Buat **OAuth 2.0 Client ID** (tipe Web application)
3. Tambahkan `http://localhost:8787/api/auth/google/callback` sebagai authorized redirect URI
4. Salin Client ID dan Client Secret ke `.dev.vars`

### 4. Konfigurasi Frontend

```bash
cp packages/web/.env.example packages/web/.env
```

Untuk development lokal, biarkan `VITE_API_URL` kosong — dev server Vite otomatis mem-proxy panggilan API.

### 5. Jalankan

```bash
npm run dev
```

Ini menjalankan Worker (port 8787) dan web app (port 5173) secara bersamaan. Buka [http://localhost:5173](http://localhost:5173) di browser.

## Manajemen Database

Jika kamu perlu melakukan factory reset total atas seluruh data (menghapus semua tabel di D1 dan membersihkan semua sesi di KV), kamu bisa menggunakan perintah reset bawaan. Perintah ini sudah dioptimalkan untuk menangani strict foreign key constraints pada D1.

```bash
# Reset database dan KV untuk development lokal
make reset-local

# Reset database dan KV untuk production (remote)
# PERINGATAN: Ini menghapus SELURUH data production! Memerlukan konfirmasi 'YES' secara eksplisit.
make reset-remote
```

## Deployment

### Backend (Cloudflare Workers)

```bash
# Set secrets untuk production
npx wrangler secret put GOOGLE_CLIENT_ID
npx wrangler secret put GOOGLE_CLIENT_SECRET

# Update FRONTEND_URL dan WORKER_URL di wrangler.toml [vars] ke URL production

# Deploy
make deploy-worker
```

### Frontend (Cloudflare Pages)

```bash
# Set VITE_API_URL di packages/web/.env.production ke URL Worker kamu
make deploy-web
```

Atau gunakan [dashboard Cloudflare Pages](https://dash.cloudflare.com/?to=/:account/pages) untuk deployment otomatis dari repo Git.

## Variabel Environment

### Secrets Worker (set via `wrangler secret put` atau `.dev.vars`)

| Variabel | Deskripsi |
|----------|-----------|
| `GOOGLE_CLIENT_ID` | Google OAuth 2.0 Client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth 2.0 Client Secret |
| `JWT_SECRET` | Kunci khusus untuk menandatangani JWT link yang dibagikan (minimal 32 karakter) |
| `TOKEN_ENCRYPTION_KEY` | Kunci AES-256-GCM untuk mengenkripsi token OAuth saat istirahat (32 karakter) |

### Konfigurasi Worker (set di `wrangler.toml` `[vars]`)

| Variabel | Deskripsi | Default |
|----------|-----------|---------|
| `FRONTEND_URL` | Origin frontend untuk CORS dan redirect | `http://localhost:5173` |
| `WORKER_URL` | URL Worker untuk OAuth callback | `http://localhost:8787` |

### Binding Worker (set di `wrangler.toml`)

| Binding | Tipe | Deskripsi |
|---------|------|-----------|
| `DB` | D1 Database | Database SQLite untuk semua data aplikasi |
| `KV` | KV Namespace | Penyimpanan sesi dan cache token OAuth |

### Environment Web (set di `.env` atau `.env.production`)

| Variabel | Deskripsi | Default |
|----------|-----------|---------|
| `VITE_API_URL` | URL base API Worker (kosongkan untuk dev lokal) | `""` |

## Lisensi

[MIT](LICENSE) © 2026 abilfida
