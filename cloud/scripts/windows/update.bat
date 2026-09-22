@echo off
echo =========================================
echo  Tide Updater & Builder
echo =========================================

set ROOT=%~dp0..\..\..

echo [1/4] Pulling latest changes from GitHub...
cd /d %ROOT%
git pull origin main

echo [2/4] Building Go Backend...
cd /d %ROOT%\cloud
go build -o tide-server.exe ./cmd/server/main.go

echo [3/4] Installing Web Dependencies...
cd /d %ROOT%\web
call npm install

echo [4/4] Building Next.js Frontend...
call npm run build

echo =========================================
echo  Update and Build successful! 
echo  You can now run start.bat
echo =========================================
pause