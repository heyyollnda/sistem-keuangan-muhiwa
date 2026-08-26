#!/bin/bash
# Double-click this file in Finder to start SIKAS MUHIWA (web + api) and open it in your browser.

PROJECT_DIR="/Users/linda/KKN/sekolah-keuangan"
WEB_PORT=5173
API_PORT=4000
APP_URL="http://localhost:${WEB_PORT}"
MAX_WAIT=30
INTERVAL=2

echo "================================================================"
echo " Memulai SIKAS MUHIWA, mohon tunggu..."
echo "================================================================"
echo ""

cd "$PROJECT_DIR" || {
  echo "Gagal membuka folder proyek di: $PROJECT_DIR"
  read -n 1 -s -r -p "Tekan tombol apa saja untuk menutup jendela ini..."
  exit 1
}

if ! command -v npm >/dev/null 2>&1; then
  echo "npm tidak ditemukan di komputer ini. Pastikan Node.js sudah terpasang."
  read -n 1 -s -r -p "Tekan tombol apa saja untuk menutup jendela ini..."
  exit 1
fi

cleanup() {
  echo ""
  echo "Menghentikan server..."
  # Killing this script alone doesn't reliably stop npm's child processes (vite/nodemon),
  # so free the ports directly the same way Hentikan-SIKAS.command does — this runs on every
  # exit path (normal shutdown, Ctrl+C, or the terminal window being closed).
  npx kill-port "$WEB_PORT" "$API_PORT" >/dev/null 2>&1
  echo "Server dihentikan."
}
trap cleanup EXIT

echo "Membuat backup database..."
npm run backup
echo ""

# npm run dev:all already runs predev:all (kill-port 5173 4000) first, so leftover
# processes from a previous session are cleared automatically before this starts.
npm run dev:all &
SERVER_PID=$!

is_ready() {
  curl -s -o /dev/null --max-time 2 "http://localhost:${WEB_PORT}" \
    && curl -s -o /dev/null --max-time 2 "http://localhost:${API_PORT}/api/health"
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
  echo " Aplikasi siap digunakan."
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

# Keep this window attached to the running servers — closing it (or Ctrl+C) stops them.
wait "$SERVER_PID"
