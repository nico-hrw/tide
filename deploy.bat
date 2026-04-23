@echo off
setlocal
:: --- KONFIGURATION ---
set REMOTE_PATH=/home/nicoh/tide

echo 🚀 Starte atomares Deployment...

:: 1. Backend Build (Cross-Compile)
echo 🏗️ Baue Backend...
cd cloud
set GOOS=linux
set GOARCH=arm64
set CGO_ENABLED=0
go build -o ../tide-server ./cmd/server/main.go
cd ..

:: 2. Frontend Build
echo 🏗️ Baue Frontend...
cd web
set NEXT_DISABLE_TURBOPACK=1
if exist .next rmdir /s /q .next
call npx next build --webpack
if %errorlevel% neq 0 (echo ❌ Build fehlgeschlagen! & exit /b 1)

:: 3. Packen (Verhindert scp-Pfad-Fehler)
echo 📦 Packe Build-Dateien...
:: Wir packen .next und public
tar -cf build.tar .next public
cd ..

:: 4. Übertragen
echo 📤 Übertrage Pakete...
scp -o StrictHostKeyChecking=no tide-server raspi:%REMOTE_PATH%/
scp -o StrictHostKeyChecking=no web/build.tar raspi:%REMOTE_PATH%/web/

:: 5. Remote-Befehle (Entpacken und Rechte setzen)
echo 🛠️ Finalisiere auf dem Raspi...
ssh -o StrictHostKeyChecking=no raspi "cd %REMOTE_PATH%/web && tar -xf build.tar && rm build.tar && chmod +x %REMOTE_PATH%/tide-server"

echo ✅ Alles fertig! Starte jetzt ./tide.sh -s auf dem Raspi.
pause