@echo off
rem Double-click this file in Windows Explorer to stop SIKAS MUHIWA's web + api servers.
rem Windows counterpart of Hentikan-SIKAS.command.

cd /d "%~dp0"

echo ================================================================
echo  Menghentikan SIKAS MUHIWA...
echo ================================================================
echo.

call npx kill-port 5173 4000

echo.
echo ================================================================
echo  Aplikasi telah dihentikan. Jendela ini boleh ditutup.
echo  (Jendela server terpisah, jika masih terbuka, boleh ditutup juga.)
echo ================================================================
pause
