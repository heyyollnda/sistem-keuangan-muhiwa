#!/bin/bash
# Double-click this file in Finder to start SIKAS MUHIWA in PRODUCTION mode — satu server
# ringan di port 4000 (frontend + API sekaligus), untuk dipakai staf sekolah sehari-hari.
# Untuk kebutuhan development lanjutan, pakai Jalankan-SIKAS.command (mode dev) sebagai
# gantinya — file itu TIDAK berubah dan tetap berjalan seperti biasa.

PROJECT_DIR="/Users/linda/KKN/sekolah-keuangan"
API_PORT=4000
APP_URL="http://localhost:${API_PORT}"
MAX_WAIT=30
INTERVAL=2

echo "================================================================"
echo " Memulai SIKAS MUHIWA (mode produksi), mohon tunggu..."
echo "================================================================"
echo ""

cd "$PROJECT_DIR" || {
  echo "Gagal membuka folder proyek di: $PROJECT_DIR"
  read -n 1 -s -r -p "Tekan tombol apa saja untuk menutup jendela ini..."
  exit 1
}

if ! command -v node >/dev/null 2>&1; then
  echo "node tidak ditemukan di komputer ini. Pastikan Node.js sudah terpasang."
  read -n 1 -s -r -p "Tekan tombol apa saja untuk menutup jendela ini..."
  exit 1
fi

if [ ! -f "dist/index.html" ]; then
  echo "Belum ada hasil build frontend (folder dist/ tidak ditemukan atau kosong)."
  echo "Developer perlu menjalankan 'npm run build:production' dulu, baru coba lagi."
  read -n 1 -s -r -p "Tekan tombol apa saja untuk menutup jendela ini..."
  exit 1
fi

cleanup() {
  echo ""
  echo "Menghentikan server..."
  # Killing this script alone doesn't reliably stop the backgrounded node process's own
  # children (there are none here, but this mirrors Jalankan-SIKAS.command's proven-safe
  # approach) — free the port directly so this runs on every exit path (normal shutdown,
  # Ctrl+C, or the terminal window being closed).
  npx kill-port "$API_PORT" >/dev/null 2>&1
  echo "Server dihentikan."
}
trap cleanup EXIT

echo "Membuat backup database..."
npm run backup
echo ""

# npx kill-port first, same as dev's predev:all — clears a leftover process from a previous
# session before this starts. No nodemon in production: code changes only take effect after
# a manual 'npm run build:production' + restarting this launcher.
npx kill-port "$API_PORT" >/dev/null 2>&1
echo "Menjalankan server produksi..."
NODE_ENV=production node server/src/server.js &
SERVER_PID=$!

is_ready() {
  curl -s -o /dev/null --max-time 2 "http://localhost:${API_PORT}/api/health"
}

elapsed=0
ready=false
while [ "$elapsed" -lt "$MAX_WAIT" ]; do
  if is_ready; then
    ready=true
    break
  fi
  sleep "$INTERVAL"
  elapsed=$((elapsed + INTERVAL))
done

if [ "$ready" = true ]; then
  echo ""
  echo "================================================================"
  echo " Aplikasi siap digunakan (mode produksi)."
  echo " Jendela ini bisa diminimize tapi JANGAN ditutup selama"
  echo " aplikasi masih digunakan."
  echo ""
  echo " Catatan: demi keamanan, sesi login TIDAK tersimpan permanen —"
  echo " Anda perlu login lagi setiap kali browser ditutup lalu dibuka"
  echo " ulang (menyegarkan/refresh halaman saja tidak akan logout)."
  echo "================================================================"
  open "$APP_URL"
else
  echo ""
  echo "================================================================"
  echo " Server gagal dijalankan."
  echo " Coba tutup jendela ini dan jalankan ulang, atau hubungi"
  echo " developer jika masalah berlanjut."
  echo "================================================================"
  kill "$SERVER_PID" >/dev/null 2>&1
  read -n 1 -s -r -p "Tekan tombol apa saja untuk menutup jendela ini..."
  exit 1
fi

# Keep this window attached to the running server — closing it (or Ctrl+C) stops it.
wait "$SERVER_PID"
