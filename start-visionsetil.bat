@echo off
title VisionSetil - arranque estable
cd /d "%~dp0"
echo.
echo  ============================================
echo   VisionSetil - arranque con watchdog
echo  ============================================
echo.
echo  Liberando puertos 5173 / 5174 / 8000...
for %%P in (5173 5174 8000) do (
  for /f "tokens=5" %%A in ('netstat -ano ^| findstr :%%P ^| findstr LISTENING') do (
    taskkill /F /PID %%A >nul 2>&1
  )
)
timeout /t 2 /nobreak >nul

echo  Arrancando watchdog (mantiene API+App+Web vivos)...
wscript.exe "%~dp0scripts\start-watchdog.vbs"

echo  Esperando servicios (10s)...
timeout /t 10 /nobreak >nul

echo  Abriendo http://127.0.0.1:5173/
start "" "http://127.0.0.1:5173/"

echo.
echo  LISTO. El watchdog reinicia solo si algo se cae.
echo  Log: logs\dev-watchdog.log
echo  URLs:
echo    App  http://127.0.0.1:5173/
echo    Web  http://127.0.0.1:5174/
echo    API  http://127.0.0.1:8000/health
echo.
echo  NO uses https. Si falla: F5 o vuelve a ejecutar este .bat
echo.
pause
