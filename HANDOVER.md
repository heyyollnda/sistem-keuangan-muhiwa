# HANDOVER — SIKAS MUHIWA

Dokumen serah terima teknis untuk developer/kontak teknis berikutnya. Untuk instruksi
instalasi dan menjalankan aplikasi sehari-hari, lihat [README.md](README.md). Untuk staf
non-teknis yang butuh panduan darurat sederhana, lihat
[PANDUAN-DARURAT.md](PANDUAN-DARURAT.md).

## 1. Ringkasan Sistem

**SIKAS MUHIWA** (Sistem Informasi Kas) adalah aplikasi pencatatan keuangan sekolah untuk
**SMK Muhammadiyah 1 Wates** — mencatat pembayaran SPP dan biaya lain per siswa, melacak
tunggakan per kelas/program keahlian, dan menghasilkan rekap laporan untuk pihak sekolah
maupun wali murid.

**Teknologi:**
- **Frontend:** React 19 + TypeScript, dibangun dengan Vite, styling Tailwind CSS.
- **Backend:** Node.js + Express.
- **Database:** SQLite (lewat `better-sqlite3`) — satu file database lokal, tanpa server
  database terpisah.

**Repository:** https://github.com/heyyollnda/sistem-keuangan-muhiwa

**Kontak teknis jangka panjang:** Sistem ini dikembangkan oleh **Linda Fitriani** sebagai
bagian dari program KKN. Meskipun masa KKN sudah selesai, Linda tetap menjadi kontak
teknis untuk sistem ini — lihat [bagian 4](#4-cara-meminta-perubahanfitur-baru) untuk detail
kontak dan alur permintaan perubahan.

## 2. Struktur Project Singkat

Peta orientasi cepat — bukan dokumentasi API lengkap (lihat README.md untuk daftar endpoint):

| Folder/File | Isi |
|---|---|
| `src/` | Kode frontend React — halaman (Dashboard, Data Siswa, Transaksi, Rekap Laporan, Pengaturan Nominal), komponen, dan logika perhitungan keuangan (`src/lib/finance.ts`). |
| `server/src/routes/` | Endpoint API (`/api/students`, `/api/transactions`, `/api/auth`, dst). |
| `server/db/` | Skema database (`schema.sql`), data contoh (`seed.js`), script backup & migrasi, dan file database sungguhan `sekolah-keuangan.db` (tidak di-commit ke Git — data sekolah asli, bukan kode). |
| `backups/` | Salinan otomatis database, dibuat setiap kali aplikasi dijalankan lewat launcher (tidak di-commit ke Git — lihat [bagian 5](#5-checklist-pemulihan-darurat)). |
| `dist/` | Hasil build frontend untuk mode production, dibuat manual lewat `npm run build:production` (tidak di-commit ke Git). |
| `Jalankan-SIKAS*` / `Hentikan-SIKAS*` (root) | Launcher `.command` (Mac) / `.bat` (Windows) — versi dev (developer) dan versi Produksi (staf sekolah). |
| `README.md` | Instruksi instalasi, menjalankan aplikasi, dan pengembangan. |

## 3. Masalah yang Pernah Terjadi & Solusinya

Referensi cepat berdasarkan riwayat pengembangan nyata proyek ini.

### Port bentrok (`EADDRINUSE`)

**Gejala:** Error `EADDRINUSE` saat menjalankan server dev atau production — biasanya
karena sesi sebelumnya belum benar-benar berhenti.

**Solusi:** Sudah ditangani otomatis — setiap launcher dan script npm (`predev:all`,
`predev`, langkah awal `Jalankan-SIKAS*`) membersihkan port yang relevan lebih dulu lewat
`kill-port` sebelum start. Kalau masih terjadi: jalankan file `Hentikan-SIKAS*` yang sesuai
mode, tunggu beberapa detik, lalu jalankan lagi. Manual: `npx kill-port 4000` (tambah
`5173` untuk mode dev).

### `NODE_ENV` tidak ter-set dengan benar di launcher Windows (sudah diperbaiki)

**Gejala:** Mode production berjalan tapi berperilaku seperti hanya API saja — frontend
tidak ikut disajikan, refresh di halaman manapun selain awal bisa gagal.

**Penyebab:** Baris lama menulis `set NODE_ENV=production && node ...` dalam satu baris.
Ini gotcha klasik `cmd.exe`: perintah `set VAR=value` menangkap **semua karakter** setelah
`=`, termasuk spasi, sampai bertemu pemisah command yang sesungguhnya — jadi spasi sebelum
`&&` ikut tertangkap sebagai bagian nilai, membuat `NODE_ENV` menjadi `"production "`
(ada spasi di akhir) alih-alih persis `"production"`. Akibatnya pengecekan
`process.env.NODE_ENV === 'production'` di `server/src/app.js` bernilai salah.

**Solusi (sudah diterapkan & teruji langsung di Windows sungguhan, 26 Agustus 2026):**
tulis tanpa spasi sama sekali di sekitar `&&` — `set NODE_ENV=production&&node ...` —
supaya tidak ada spasi yang ikut tertangkap sebagai bagian nilai `NODE_ENV`. Lihat baris
`start "..." cmd /k "set NODE_ENV=production&&node server\src\server.js"` di
`Jalankan-SIKAS-Produksi.bat`.

### Instalasi `better-sqlite3` gagal di Windows dengan Node.js versi sangat baru

**Gejala:** `npm install` di folder `server/` gagal khusus untuk package `better-sqlite3`
di komputer Windows yang memakai Node.js versi "Current"/paling baru (bukan LTS).

**Penyebab:** `better-sqlite3` adalah native addon (dikompilasi dari C++) yang menyediakan
prebuilt binary hanya untuk versi Node.js yang sudah stabil/LTS. Versi Node.js yang sangat
baru sering belum punya prebuilt binary yang cocok, sehingga npm mencoba compile dari
source — dan gagal kalau build tools (Visual Studio Build Tools, dsb) belum lengkap di
komputer tersebut.

**Solusi:** Install Node.js versi **LTS** dari [nodejs.org](https://nodejs.org/), bukan
versi "Current". Kalau sudah terlanjur pakai versi non-LTS, uninstall dan ganti ke LTS,
lalu `npm install` ulang di folder `server/`.

### File project di folder yang tersinkronisasi cloud (iCloud Drive / OneDrive)

**Gejala:** Error `ETIMEDOUT`, atau proses jadi sangat lambat/hang, saat development
(`npm install`, server dev, dst) ketika folder project berada di dalam folder yang
disinkronkan otomatis ke cloud — iCloud Drive di Mac, atau OneDrive Desktop/Documents di
Windows.

**Penyebab:** Layanan sinkronisasi cloud terus memindai dan mengunci file yang sedang
berubah — termasuk file database SQLite yang sering ditulis, dan folder `node_modules/`
yang berisi ribuan file kecil — bentrok dengan proses Node.js yang membaca/menulis file
yang sama di waktu bersamaan.

**Solusi:** Pindahkan folder project ke lokasi lokal yang **tidak** disinkronkan cloud
(mis. folder biasa di luar iCloud Drive/OneDrive). `.gitignore` sudah mengecualikan
`node_modules/`, `server/db/*.db`, dan `backups/` dari Git — tapi itu untuk Git, bukan
untuk sinkronisasi cloud yang bekerja di level filesystem, jadi pemindahan folder tetap
perlu dilakukan secara manual.

### Git repository root yang salah tempat

**Gejala:** `git status` menampilkan path yang aneh (menunjuk ke folder di luar folder
project ini, mis. `Documents/...`), atau perubahan file di project ini tidak muncul di
`git status` seperti yang diharapkan.

**Penyebab:** `git init` pernah dijalankan di folder yang lebih tinggi dari folder project
(mis. di folder Home `~`), sehingga seluruh folder Home menjadi satu repository Git
raksasa, bukan hanya folder project ini.

**Cara mengecek:**
```bash
git rev-parse --show-toplevel
```
Kalau hasilnya **bukan** path folder project ini (`.../sekolah-keuangan`), berarti root
repo ada di tempat yang salah.

**Cara memperbaiki:**
1. **Cara paling aman** — buat repository Git baru khusus di dalam folder project ini saja
   (`cd` ke folder project, lalu `git init` di situ, hubungkan ulang ke remote GitHub yang
   sudah ada dengan `git remote add origin <url>`), tanpa mengubah/menghapus repo Git lama
   di folder Home supaya file-file lain di luar project tidak terpengaruh.
2. **Alternatif** — pindahkan folder project ke lokasi yang benar-benar terpisah dari repo
   Git manapun, lalu `git init` di situ.

## 4. Cara Meminta Perubahan/Fitur Baru

Developer menggunakan **Claude Code** untuk mengembangkan fitur pada sistem ini. Alur
kerja standarnya:

1. Perubahan kode dikembangkan dan diuji dulu di **lingkungan development lokal**
   (mode Development — `Jalankan-SIKAS.command`/`.bat`, port 5173 + 4000 terpisah,
   auto-reload).
2. Setelah teruji, perubahan di-`git push` ke repository GitHub.
3. Di komputer sekolah (production): `git pull` untuk mengambil kode terbaru, lalu
   `npm run build:production` ulang — baru perubahan itu benar-benar terlihat oleh staf
   lewat `Jalankan-SIKAS-Produksi`.

Lihat README.md bagian "Cara Menjalankan Aplikasi" untuk detail perbedaan kedua mode.

**Kontak developer:**
- **Nama:** Linda Fitriani
- **WhatsApp:** 085794824132
- **Email:** lindafitrianii004@gmail.com

## 5. Checklist Pemulihan Darurat

### Database rusak/korup — pulihkan dari backup

1. Hentikan aplikasi (`Hentikan-SIKAS-Produksi.command`/`.bat`, atau `Hentikan-SIKAS`
   kalau sedang di mode dev).
2. Buka folder `backups/` di root project. Pilih file backup dengan tanggal & waktu yang
   sesuai (paling baru sebelum masalah terjadi, atau backup bertanda `sebelum-reset`/
   `sebelum-migrasi-...` kalau relevan).
3. Ganti nama file database yang bermasalah dulu sebagai cadangan — jangan langsung
   dihapus (mis. `server/db/sekolah-keuangan.db` → `sekolah-keuangan.db.rusak`).
4. Salin (copy) file backup yang dipilih ke `server/db/`, lalu ganti namanya menjadi
   persis `sekolah-keuangan.db`.
5. Jalankan aplikasi seperti biasa, verifikasi data sudah kembali normal (cek Dashboard
   dan Data Siswa).

### Komputer sekolah rusak/diganti — instalasi ulang dari nol

Lihat README.md bagian **"Cara Memindahkan Aplikasi ke Komputer Baru (Sekolah)"** untuk
langkah lengkap instalasi Node.js, clone repository, install dependency, dan konfigurasi
`server/.env`. Kalau ada backup terakhir dari komputer lama, ikut disalin sesuai langkah
opsional di bagian tersebut supaya data tidak perlu diinput ulang dari awal.

## 6. Keterbatasan Sistem Saat Ini & Rekomendasi Pengembangan Lanjutan

### Backup masih tersimpan di komputer yang sama dengan database asli

Mekanisme backup otomatis (folder `backups/`, lihat README.md bagian "Backup database")
melindungi dari kesalahan/korupsi data di level file, tapi **tidak** melindungi dari
kerusakan atau kehilangan fisik komputer itu sendiri — backup dan database asli sama-sama
ada di hard disk yang sama. Kalau komputer sekolah rusak total, hilang, atau dicuri,
backup ikut hilang bersamaan dengan database aslinya.

Mitigasi sementara: PANDUAN-DARURAT.md bagian "Menjaga Data Tetap Aman" mengarahkan staf
menyalin folder `backups/` secara manual ke flashdisk/Google Drive setiap minggu.

**Rekomendasi pengembangan lanjutan:** bangun mekanisme backup otomatis ke lokasi
terpisah dari komputer sekolah — misalnya upload otomatis ke layanan cloud (Google Drive
API, atau storage serupa) setiap kali backup lokal dibuat, supaya tidak lagi bergantung
pada staf mengingat untuk menyalin manual.

### Belum ada fitur export data ke Excel/CSV dari dalam aplikasi

Saat ini, mengambil data mentah (daftar siswa, riwayat transaksi) di luar tampilan Rekap
Laporan yang sudah ada memerlukan membuka file `server/db/sekolah-keuangan.db` langsung
pakai software khusus (mis. "DB Browser for SQLite") — tidak praktis untuk staf non-teknis,
dan berisiko kalau file diedit langsung secara tidak sengaja.

**Rekomendasi pengembangan lanjutan:** tambahkan tombol export (ke Excel/CSV) di halaman
Rekap Laporan — untuk daftar siswa, riwayat transaksi, dan rekap tunggakan — supaya staf
bisa mengambil salinan data sendiri tanpa alat tambahan, mirip pola yang sudah ada untuk
fitur Import Siswa (`src/lib/studentImport.ts`) tapi arah sebaliknya.
