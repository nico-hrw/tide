@echo off
setlocal
set RASPI_USER=nicoh
set RASPI_IP=192.168.178.31
set REMOTE_PATH=/home/nicoh/tide

set ROOT=%~dp0..\..

echo 🚀 Starte stabiles Deployment (IPv4 Force)...

:: 1. Backend Build
cd /d %ROOT%\cloud
set GOOS=linux
set GOARCH=arm64
set CGO_ENABLED=0
go build -o tide-server ./cmd/server/main.go

:: 2. Frontend Build
cd /d %ROOT%\web
set NEXT_DISABLE_TURBOPACK=1
if exist .next rmdir /s /q .next
call npx next build --webpack
tar -cf build.tar .next public

:: 3. Remote-Vorbereitung (Kill & Clean)
echo 🛑 Bereite Raspi vor...
ssh -4 %RASPI_USER%@%RASPI_IP% "sudo fuser -k 8080/tcp 2>/dev/null; pkill -9 tide-server 2>/dev/null; rm -f %REMOTE_PATH%/tide-server"

:: 4. Übertragen mit IPv4
echo 📤 Übertrage tide-server...
scp -4 %ROOT%\cloud\tide-server %RASPI_USER%@%RASPI_IP%:%REMOTE_PATH%/tide-server
del /f %ROOT%\cloud\tide-server 2>nul

echo 📤 Übertrage build.tar (314MB - hab Geduld)...
scp -4 %ROOT%\web\build.tar %RASPI_USER%@%RASPI_IP%:%REMOTE_PATH%/web/build.tar
del /f %ROOT%\web\build.tar 2>nul

:: 5. Finalisieren
echo 🛠️ Entpacken auf dem Raspi...
ssh -4 %RASPI_USER%@%RASPI_IP% "cd %REMOTE_PATH%/web && tar -xf build.tar && rm build.tar && chmod +x ../tide-server"

echo ✅ Fertig! Jetzt auf dem Raspi: ./tide.sh -s
pause