@echo off
setlocal EnableDelayedExpansion
rem Double-click this file in Windows Explorer to start SIKAS MUHIWA in PRODUCTION mode -
rem satu server ringan di port 4000 (frontend + API sekaligus), untuk dipakai staf sekolah
rem sehari-hari. Windows counterpart of Jalankan-SIKAS-Produksi.command.
rem Untuk kebutuhan development lanjutan, pakai Jalankan-SIKAS.bat (mode dev) sebagai
rem gantinya - file itu TIDAK berubah dan tetap berjalan seperti biasa.

cd /d "%~dp0"

echo ================================================================
echo  Memulai SIKAS MUHIWA (mode produksi), mohon tunggu...
echo ================================================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo node tidak ditemukan di komputer ini. Pastikan Node.js sudah terpasang.
  echo Unduh di https://nodejs.org/
  pause
  exit /b 1
)

if not exist "dist\index.html" (
  echo Belum ada hasil build frontend ^(folder dist\ tidak ditemukan atau kosong^).
  echo Developer perlu menjalankan "npm run build:production" dulu, baru coba lagi.
  pause
  exit /b 1
)

echo Membuat backup database...
call npm run backup
echo.

echo Menjalankan server produksi di jendela terpisah...
call npx kill-port 4000 >nul 2>nul
start "SIKAS MUHIWA - Server Produksi (JANGAN DITUTUP)" cmd /k "set NODE_ENV=production && node server\src\server.js"

set "API_PORT=4000"
set "MAX_WAIT=30"
set "ELAPSED=0"
set "READY=0"

:waitloop
curl -s -o nul --max-time 2 "http://localhost:%API_PORT%/api/health" >nul 2>nul
if errorlevel 1 goto notready
set "READY=1"
goto donewait

:notready
if !ELAPSED! geq %MAX_WAIT% goto donewait
timeout /t 2 /nobreak >nul
set /a ELAPSED+=2
goto waitloop

:donewait
if "!READY!"=="1" (
  echo.
  echo ================================================================
  echo  Aplikasi siap digunakan ^(mode produksi^).
  echo  Jendela server berjudul "SIKAS MUHIWA - Server Produksi" JANGAN
  echo  ditutup selama aplikasi masih digunakan.
  echo.
  echo  Catatan: demi keamanan, sesi login TIDAK tersimpan permanen -
  echo  Anda perlu login lagi setiap kali browser ditutup lalu dibuka
  echo  ulang ^(menyegarkan/refresh halaman saja tidak akan logout^).
  echo ================================================================
  start "" "http://localhost:%API_PORT%"
  echo.
  echo Jendela ini boleh ditutup. Server tetap berjalan di jendela terpisah.
  pause
  exit /b 0
) else (
  echo.
  echo ================================================================
  echo  Server gagal dijalankan.
  echo  Coba tutup jendela ini dan jendela server, lalu jalankan ulang.
  echo  Hubungi developer jika masalah berlanjut.
  echo ================================================================
  pause
  exit /b 1
)
