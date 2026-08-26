# React + TypeScript + Vite

## Cara Menjalankan Aplikasi

Ada **dua mode** yang terpisah sama sekali — dipakai oleh dua orang berbeda untuk tujuan
berbeda:

| | Mode Production | Mode Development |
|---|---|---|
| Dipakai oleh | **Staf sekolah**, sehari-hari | **Developer** (Linda), lewat Claude Code |
| Launcher | `Jalankan-SIKAS-Produksi.command` / `.bat` | `Jalankan-SIKAS.command` / `.bat` |
| Port | Satu port saja: **4000** | Dua port: 5173 (web) + 4000 (api) |
| Kecepatan | Lebih cepat & ringan (file sudah di-build) | Lebih lambat booting |
| Auto-reload saat kode berubah | **Tidak** — perlu build ulang manual | Ya, otomatis |

**Penting:** setelah developer selesai memberi instruksi baru ke Claude Code dan ingin
perubahannya terlihat oleh staf sekolah, jalankan `npm run build:production` dari root
proyek dulu — baru perubahan itu muncul di `Jalankan-SIKAS-Produksi`. Tanpa langkah ini,
staf tetap akan melihat versi lama.

### Mode Production — Untuk Staf Sekolah

**Di Mac:**

1. Buka folder proyek ini di Finder.
2. Klik dua kali file **`Jalankan-SIKAS-Produksi.command`**. Sebuah jendela Terminal akan
   terbuka otomatis — biarkan saja, itu normal. Tunggu sampai muncul pesan "Aplikasi siap
   digunakan", lalu browser akan otomatis terbuka ke `http://localhost:4000`.
3. Jendela Terminal tersebut boleh diminimize, tapi **jangan ditutup** selama aplikasi
   masih digunakan — menutupnya akan ikut menghentikan server.
4. Selesai bekerja? Klik dua kali file **`Hentikan-SIKAS-Produksi.command`** untuk
   mematikan server dengan rapi (atau cukup tutup jendela Terminal-nya).

**Di Windows (komputer sekolah):**

1. Buka folder proyek ini di File Explorer.
2. Klik dua kali file **`Jalankan-SIKAS-Produksi.bat`**. Sebuah jendela Command Prompt
   akan terbuka otomatis untuk membuat backup database, lalu jendela KEDUA berjudul
   "SIKAS MUHIWA - Server Produksi" akan terbuka untuk menjalankan server — biarkan saja,
   itu normal. Tunggu sampai muncul pesan "Aplikasi siap digunakan", lalu browser akan
   otomatis terbuka ke `http://localhost:4000`.
3. Jendela berjudul **"SIKAS MUHIWA - Server Produksi"** JANGAN ditutup selama aplikasi
   masih digunakan — menutupnya akan ikut menghentikan server. Jendela peluncur yang
   pertama boleh ditutup setelah browser terbuka.
4. Selesai bekerja? Klik dua kali file **`Hentikan-SIKAS-Produksi.bat`** untuk mematikan
   server dengan rapi (atau tutup jendela "SIKAS MUHIWA - Server Produksi").

### Mode Development — Untuk Developer

Dipakai untuk melanjutkan pengembangan lewat Claude Code — auto-reload saat kode berubah,
tapi dua port terpisah (5173 untuk web, 4000 untuk api) dan sedikit lebih berat/lambat
dibanding mode production.

**Di Mac:**

1. Buka folder proyek ini di Finder.
2. Klik dua kali file **`Jalankan-SIKAS.command`**. Sebuah jendela Terminal akan terbuka
   secara otomatis — biarkan saja, itu normal. Tunggu sampai muncul pesan "Aplikasi siap
   digunakan", lalu browser akan otomatis terbuka ke halaman aplikasi.
3. Jendela Terminal tersebut boleh diminimize, tapi **jangan ditutup** selama aplikasi
   masih digunakan — menutupnya akan ikut menghentikan server.
4. Selesai bekerja? Klik dua kali file **`Hentikan-SIKAS.command`** untuk mematikan
   server dengan rapi (atau cukup tutup jendela Terminal-nya).

**Di Windows:**

1. Buka folder proyek ini di File Explorer.
2. Klik dua kali file **`Jalankan-SIKAS.bat`**. Sebuah jendela Command Prompt akan terbuka
   otomatis untuk membuat backup database, lalu jendela KEDUA berjudul
   "SIKAS MUHIWA - Server" akan terbuka untuk menjalankan server — biarkan saja, itu
   normal. Tunggu sampai muncul pesan "Aplikasi siap digunakan", lalu browser akan
   otomatis terbuka ke halaman aplikasi.
3. Jendela berjudul **"SIKAS MUHIWA - Server"** JANGAN ditutup selama aplikasi masih
   digunakan — menutupnya akan ikut menghentikan server. Jendela peluncur yang pertama
   boleh ditutup setelah browser terbuka.
4. Selesai bekerja? Klik dua kali file **`Hentikan-SIKAS.bat`** untuk mematikan server
   dengan rapi (atau tutup jendela "SIKAS MUHIWA - Server").

## Cara Memindahkan Aplikasi ke Komputer Baru (Sekolah)

Langkah-langkah untuk memasang aplikasi ini di komputer sekolah (Windows) untuk pertama kali:

1. **Install Node.js** dari [nodejs.org](https://nodejs.org/) — unduh versi LTS, lalu jalankan
   installer-nya seperti aplikasi Windows pada umumnya.
2. **Clone repository** dari GitHub:
   ```
   git clone https://github.com/heyyollnda/sistem-keuangan-muhiwa.git
   ```
   (Kalau Git belum terpasang, install dulu dari [git-scm.com](https://git-scm.com/), atau
   unduh repository-nya sebagai file ZIP langsung dari halaman GitHub-nya.)
3. **Masuk ke folder project**, lalu install dependency di root DAN di folder `server/`:
   ```
   cd sistem-keuangan-muhiwa
   npm install
   cd server
   npm install
   cd ..
   ```
4. **Salin `server/.env.example` menjadi `server/.env`**, lalu isi kredensial staf
   (`STAFF_USERNAME` dan `STAFF_PASSWORD`) di dalamnya.
5. **(Opsional)** Kalau ingin membawa data yang sudah ada dari komputer lama, salin file
   `server/db/sekolah-keuangan.db` dari komputer lama ke lokasi yang sama di komputer baru.
   Kalau tidak, database baru yang kosong akan otomatis dibuat saat server pertama kali
   dijalankan.
6. **Build frontend-nya sekali** (folder `dist/` belum ada di clone yang baru):
   ```
   npm run build:production
   ```
7. **Jalankan `Jalankan-SIKAS-Produksi.bat`** untuk memulai — ini yang dipakai staf
   sehari-hari (satu port 4000, lebih ringan). Lihat bagian
   "[Cara Menjalankan Aplikasi → Mode Production → Di Windows](#mode-production--untuk-staf-sekolah)"
   di atas untuk detailnya.

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend enabling type-aware lint rules by installing `oxlint-tsgolint` and editing `.oxlintrc.json`:

```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "plugins": ["react", "typescript", "oxc"],
  "options": {
    "typeAware": true
  },
  "rules": {
    "react/rules-of-hooks": "error",
    "react/only-export-components": ["warn", { "allowConstantExport": true }]
  }
}
```

See the [Oxlint rules documentation](https://oxc.rs/docs/guide/usage/linter/rules) for the full list of rules and categories.

## Backend (server/)

A standalone Node.js + Express + SQLite (`better-sqlite3`) backend lives in [server/](server/). At
this stage it is **not yet wired up to the React frontend** — the frontend still keeps all its
data in `localStorage`, exactly as before. The backend exists so data persistence can be added in
a later stage without losing work in between.

### Setup

```bash
cd server
npm install
cp .env.example .env   # lalu isi STAFF_USERNAME/STAFF_PASSWORD di server/.env
```

`server/.env` menyimpan kredensial login staf (`STAFF_USERNAME`, `STAFF_PASSWORD`) yang
divalidasi oleh `POST /api/auth/login` — file ini berisi rahasia asli dan **tidak pernah**
di-commit ke Git (lihat `.gitignore`). `server/.env.example` adalah templatenya dan aman
untuk di-commit.

### Running the backend alone

```bash
cd server
npm run dev     # starts the API on http://localhost:4000 with auto-reload (nodemon)
```

The SQLite database file is created automatically at `server/db/sekolah-keuangan.db` the first
time the server starts — `server/db/schema.sql` runs on every startup (it's just `CREATE TABLE /
INDEX IF NOT EXISTS` statements, so it's always safe to re-run). Only `schema.sql` and `seed.js`
are committed to the repo; the actual `.db` file is git-ignored since it will hold real data.

### Seeding sample data

```bash
cd server
npm run seed
```

This wipes and repopulates the database with the same illustrative students/fee categories/
transactions used by the frontend's mock data, so every endpoint can be exercised immediately.

### Backup database

Setiap kali aplikasi dijalankan lewat `Jalankan-SIKAS.command` (Mac) atau `Jalankan-SIKAS.bat`
(Windows), sebuah salinan `server/db/sekolah-keuangan.db` otomatis dibuat di folder
**`backups/`** di root proyek, dengan nama menyertakan tanggal & waktu (misalnya
`sekolah-keuangan-2026-08-25-143000.db`). Hanya 14 backup terbaru yang disimpan — backup yang
lebih lama otomatis dihapus. Bisa juga dijalankan manual kapan saja dengan `npm run backup` dari
root proyek.

Folder `backups/` ini murni salinan lokal di komputer sekolah itu sendiri — kalau komputernya
rusak atau hilang, backup ini ikut hilang juga. **Sesekali salin folder `backups/` secara manual
ke flashdisk atau layanan cloud (Google Drive, dsb.)** sebagai lapisan pengamanan tambahan di
luar komputer sekolah.

### Menghapus data dummy sebelum serah terima

> **Ini BUKAN operasi rutin harian** — hanya dijalankan **sekali**, tepat sebelum data siswa
> asli sekolah mulai diimpor untuk pertama kali (biasanya menjelang serah terima sistem ke
> sekolah).

```bash
npm run reset-data   # dari root proyek, atau dari folder server/ — keduanya sama
```

Script ini menghapus **seluruh** isi tabel `students`, `transactions`, dan `transaction_items`
(data siswa & transaksi contoh/dummy), lalu mengembalikan penomoran ID ke awal lagi (siswa
berikutnya yang ditambahkan akan kembali menjadi `STU-001`). Tabel `fee_categories`
(Pengaturan Nominal — SPP, HW/Kemah, Registrasi, dst.) **tidak disentuh sama sekali**, karena
itu konfigurasi asli sekolah, bukan data contoh.

Karena ini operasi permanen, script akan meminta konfirmasi dengan mengetik `HAPUS` sebelum
benar-benar menghapus apa pun, dan otomatis membuat satu backup terakhir ke `backups/`
(bertanda `sebelum-reset`, dikecualikan dari penghapusan otomatis 14-backup-terbaru di atas)
sebagai jaring pengaman kalau ternyata dijalankan keliru.

### Running frontend + backend together

From the project root:

```bash
npm run dev:all
```

This runs the Vite dev server (port 5173) and the API server (port 4000) concurrently, each with
its own colored log prefix.

Before starting, it automatically frees ports 5173 and 4000 (via `kill-port`), so a leftover
process from a previous session won't cause an `EADDRINUSE` error.

### Production build (single server, one port)

```bash
npm run build:production   # tsc -b && vite build — outputs to dist/
NODE_ENV=production node server/src/server.js
```

This is what `Jalankan-SIKAS-Produksi.command`/`.bat` runs. With `NODE_ENV=production`,
`server/src/app.js` also serves the built frontend (`dist/`) as static files and falls back
to `dist/index.html` for any other `GET` request that isn't `/api/*` — this is what lets a
browser refresh work anywhere in the single-page app (no client-side router, but the
mechanism is there regardless) instead of 404ing. Route order matters: `/api/*` routes are
registered first, so an unmatched `/api/...` request still gets a proper JSON 404 instead of
being swallowed by the SPA fallback.

`npm run build:production` is **manual only** — nothing rebuilds it automatically on
startup (that would make every staff launch slow). After changing any frontend code, re-run
it before staff will see the change; `Jalankan-SIKAS-Produksi` refuses to start with a clear
message if `dist/` doesn't exist yet.

Dev mode (`npm run dev:all` / `Jalankan-SIKAS.command`) never touches this — port 4000
there only ever answers `/api/*`, and the Vite dev server on port 5173 serves the frontend
with HMR instead.

### API overview

All responses are JSON, shaped as `{ "success": true, "data": ... }` or
`{ "success": false, "error": { "message": "..." } }`.

| Method | Path                     | Description                                            |
| ------ | ------------------------ | -------------------------------------------------------|
| GET    | `/api/health`            | Liveness check                                         |
| POST   | `/api/auth/login`        | Validate `{ username, password }` against `server/.env`|
| GET    | `/api/students`          | List students (`?grade=&status=&programKeahlian=&q=`)  |
| GET    | `/api/students/:id`      | Get one student                                        |
| POST   | `/api/students`          | Create a student                                       |
| PUT    | `/api/students/:id`      | Update a student                                       |
| DELETE | `/api/students/:id`      | Delete a student (blocked if they have transactions)   |
| GET    | `/api/fee-categories`    | List fee categories (`?grade=&programKeahlian=`)       |
| GET    | `/api/fee-categories/:id`| Get one fee category                                   |
| POST   | `/api/fee-categories`    | Create a fee category                                  |
| PUT    | `/api/fee-categories/:id`| Update a fee category                                  |
| DELETE | `/api/fee-categories/:id`| Delete a fee category                                  |
| GET    | `/api/transactions`      | List transactions (`?studentId=&grade=&date=`)         |
| GET    | `/api/transactions/:id`  | Get one transaction (with its line items)               |
| POST   | `/api/transactions`      | Record a new transaction                                |

See `server/db/schema.sql` for the full table design (`students`, `fee_categories`,
`transactions`, `transaction_items`).
