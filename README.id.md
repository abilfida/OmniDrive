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
