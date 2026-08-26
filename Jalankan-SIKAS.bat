@echo off
setlocal EnableDelayedExpansion
rem Double-click this file in Windows Explorer to start SIKAS MUHIWA (web + api) and
rem open it in your default browser. Windows counterpart of Jalankan-SIKAS.command.

cd /d "%~dp0"

echo ================================================================
echo  Memulai SIKAS MUHIWA, mohon tunggu...
echo ================================================================
echo.

where npm >nul 2>nul
if errorlevel 1 (
  echo npm tidak ditemukan di komputer ini. Pastikan Node.js sudah terpasang.
  echo Unduh di https://nodejs.org/
  pause
  exit /b 1
)

echo Membuat backup database...
call npm run backup
echo.

echo Menjalankan server web dan api di jendela terpisah...
start "SIKAS MUHIWA - Server (JANGAN DITUTUP)" cmd /k npm run dev:all

set "WEB_PORT=5173"
set "API_PORT=4000"
set "MAX_WAIT=30"
set "ELAPSED=0"
set "READY=0"

:waitloop
curl -s -o nul --max-time 2 "http://localhost:%WEB_PORT%" >nul 2>nul
if errorlevel 1 goto notready
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
  echo  Aplikasi siap digunakan.
  echo  Jendela server berjudul "SIKAS MUHIWA - Server" JANGAN ditutup
  echo  selama aplikasi masih digunakan.
  echo.
  echo  Catatan: demi keamanan, sesi login TIDAK tersimpan permanen -
  echo  Anda perlu login lagi setiap kali browser ditutup lalu dibuka
  echo  ulang ^(menyegarkan/refresh halaman saja tidak akan logout^).
  echo ================================================================
  start "" "http://localhost:%WEB_PORT%"
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
