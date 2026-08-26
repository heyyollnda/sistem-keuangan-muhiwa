@echo off
rem Double-click this file in Windows Explorer to stop SIKAS MUHIWA's production server
rem (port 4000 saja). Windows counterpart of Hentikan-SIKAS-Produksi.command.

cd /d "%~dp0"

echo ================================================================
echo  Menghentikan SIKAS MUHIWA (mode produksi)...
echo ================================================================
echo.

call npx kill-port 4000

echo.
echo ================================================================
echo  Aplikasi telah dihentikan. Jendela ini boleh ditutup.
echo  (Jendela server terpisah, jika masih terbuka, boleh ditutup juga.)
echo ================================================================
pause
