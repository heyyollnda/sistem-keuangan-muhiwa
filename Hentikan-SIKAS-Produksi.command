#!/bin/bash
# Double-click this file in Finder to stop SIKAS MUHIWA's production server (port 4000 saja).

PROJECT_DIR="/Users/linda/KKN/sekolah-keuangan"
API_PORT=4000

echo "================================================================"
echo " Menghentikan SIKAS MUHIWA (mode produksi)..."
echo "================================================================"
echo ""

cd "$PROJECT_DIR" || {
  echo "Gagal membuka folder proyek di: $PROJECT_DIR"
  read -n 1 -s -r -p "Tekan tombol apa saja untuk menutup jendela ini..."
  exit 1
}

npx kill-port "$API_PORT"

echo ""
echo "================================================================"
echo " Aplikasi telah dihentikan. Jendela ini boleh ditutup."
echo "================================================================"
read -n 1 -s -r -p "Tekan tombol apa saja untuk menutup jendela ini..."
