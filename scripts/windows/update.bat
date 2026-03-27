@echo off
echo =========================================
echo  Tide Updater & Builder
echo =========================================

echo [1/4] Pulling latest changes from GitHub...
git pull origin main

echo [2/4] Building Go Backend...
cd cloud
go build -o tide-server.exe ./cmd/server/main.go
cd ..

echo [3/4] Installing Web Dependencies...
cd web
call npm install

echo [4/4] Building Next.js Frontend...
call npm run build
cd ..

echo =========================================
echo  Update and Build successful! 
echo  You can now run start.bat
echo =========================================
pause