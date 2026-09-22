@echo off
setlocal enabledelayedexpansion

:: =================================================================
:: Tide Management Script v4.0 (Windows Edition)
:: =================================================================

set ROOT=%~dp0
if "%ROOT:~-1%"=="\" set ROOT=%ROOT:~0,-1%
set CLOUD_DIR=%ROOT%\cloud
set WEB_DIR=%ROOT%\web
set OTP_FILE=%CLOUD_DIR%\data\otp.txt

if "%~1"=="" goto MENU
if /I "%~1"=="-a" goto ALL
if /I "%~1"=="--all" goto ALL
if /I "%~1"=="all" goto ALL

if /I "%~1"=="-b" goto BACKEND
if /I "%~1"=="--backend" goto BACKEND
if /I "%~1"=="backend" goto BACKEND

if /I "%~1"=="-f" goto FRONTEND
if /I "%~1"=="--frontend" goto FRONTEND
if /I "%~1"=="frontend" goto FRONTEND

if /I "%~1"=="-s" goto START
if /I "%~1"=="--start" goto START
if /I "%~1"=="start" goto START

if /I "%~1"=="-d" goto DEV
if /I "%~1"=="--dev" goto DEV
if /I "%~1"=="dev" goto DEV

if /I "%~1"=="-k" goto STOP
if /I "%~1"=="--stop" goto STOP
if /I "%~1"=="stop" goto STOP

if /I "%~1"=="-o" goto OTP
if /I "%~1"=="--otp" goto OTP
if /I "%~1"=="otp" goto OTP

goto USAGE

:MENU
cls
echo =======================================================
echo          TIDE MANAGEMENT MENU (Windows)
echo =======================================================
echo  [1] Development-Modus starten (Backend + Frontend Dev)
echo  [2] Alles neu bauen und starten (Production)
echo  [3] Nur Backend bauen und starten
echo  [4] Nur Frontend bauen und starten
echo  [5] Bestehende Builds starten (Start)
echo  [6] Prozesse auf Port 8080 ^& 3000 stoppen
echo  [7] OTP-Code anzeigen
echo  [8] Beenden
echo =======================================================
set /p CHOICE="Waehle eine Option [1-8]: "

if "%CHOICE%"=="1" goto DEV
if "%CHOICE%"=="2" goto ALL
if "%CHOICE%"=="3" goto BACKEND
if "%CHOICE%"=="4" goto FRONTEND
if "%CHOICE%"=="5" goto START
if "%CHOICE%"=="6" goto STOP
if "%CHOICE%"=="7" goto OTP
if "%CHOICE%"=="8" exit /b 0
goto MENU

:DEV
echo 🚀 Starte Tide Development Environment...
start "Tide Backend (Dev)" cmd /k "cd /d %CLOUD_DIR% && go run ./cmd/server/main.go"
start "Tide Frontend (Dev)" cmd /k "cd /d %WEB_DIR% && npm run dev"
echo ✅ Dev-Server gestartet!
exit /b 0

:CLEANUP
echo 🧹 Bereinige alte Prozesse (Port 8080 & 3000)...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :8080 ^| findstr LISTENING') do taskkill /f /pid %%a >nul 2>&1
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3000 ^| findstr LISTENING') do taskkill /f /pid %%a >nul 2>&1
exit /b 0

:BUILD_BACKEND
echo 🏗️  Baue Go Backend...
cd /d "%CLOUD_DIR%" || exit /b 1
call go mod tidy
call go build -o "%CLOUD_DIR%\tide-server.exe" ./cmd/server/main.go
if %ERRORLEVEL% neq 0 (
    echo ❌ FEHLER: Backend-Build fehlgeschlagen!
    exit /b 1
)
echo ✅ Backend erfolgreich gebaut!
exit /b 0

:BUILD_FRONTEND
echo 🏗️  Baue Next.js Frontend...
cd /d "%WEB_DIR%" || exit /b 1
if exist .next rmdir /s /q .next
call npm install
call npm run build
if %ERRORLEVEL% neq 0 (
    echo ❌ FEHLER: Frontend-Build fehlgeschlagen!
    exit /b 1
)
echo ✅ Frontend erfolgreich gebaut!
exit /b 0

:START_BACKEND
echo 🚀 Starte Backend...
start "Tide Backend" cmd /k "cd /d %CLOUD_DIR% && tide-server.exe"
exit /b 0

:START_FRONTEND
echo 🚀 Starte Frontend...
start "Tide Frontend" cmd /k "cd /d %WEB_DIR% && npm run start"
exit /b 0

:ALL
call :CLEANUP
call :BUILD_BACKEND
if %ERRORLEVEL% neq 0 exit /b 1
call :BUILD_FRONTEND
if %ERRORLEVEL% neq 0 exit /b 1
call :START_BACKEND
call :START_FRONTEND
echo 🎉 Tide ist online!
exit /b 0

:BACKEND
call :CLEANUP
call :BUILD_BACKEND
if %ERRORLEVEL% neq 0 exit /b 1
call :START_BACKEND
exit /b 0

:FRONTEND
call :CLEANUP
call :BUILD_FRONTEND
if %ERRORLEVEL% neq 0 exit /b 1
call :START_FRONTEND
exit /b 0

:START
call :CLEANUP
call :START_BACKEND
call :START_FRONTEND
echo 🎉 Tide gestartet!
exit /b 0

:STOP
call :CLEANUP
echo 🛑 Prozesse gestoppt.
exit /b 0

:OTP
if exist "%OTP_FILE%" (
    echo 🔑 OTP Code:
    type "%OTP_FILE%"
    echo.
) else if exist "%ROOT%\data\otp.txt" (
    echo 🔑 OTP Code:
    type "%ROOT%\data\otp.txt"
    echo.
) else (
    echo ❌ Kein OTP-Code gefunden.
)
exit /b 0

:USAGE
echo Verwendung: tide.bat [-a ^| -b ^| -f ^| -s ^| -d ^| -k ^| -o]
echo   -a, all      : Alles neu bauen und starten
echo   -b, backend  : Nur Backend neu bauen und starten
echo   -f, frontend : Nur Frontend neu bauen und starten
echo   -s, start    : System starten (ohne neu zu bauen)
echo   -d, dev      : Development Modus starten (Backend + Frontend)
echo   -k, stop     : Laufende Server-Prozesse beenden
echo   -o, otp      : OTP-Code anzeigen
exit /b 1
