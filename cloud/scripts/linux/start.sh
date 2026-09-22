#!/bin/bash

# =================================================================
# Tide Management Script v3.1 (Cloud & PM2 Edition)
# =================================================================

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
CLOUD_DIR="$ROOT_DIR/cloud"
WEB_DIR="$ROOT_DIR/web"
OTP_FILE="$CLOUD_DIR/data/otp.txt"

# 1. Pfad-Fehler beheben: Stelle sicher, dass der Datenordner existiert
mkdir -p "$CLOUD_DIR/data"

echo "🔄 Prüfe auf Code-Updates..."
git pull origin main

# --- 1. Umgebungsvariablen laden ---
load_env() {
    if [ -f "$ROOT_DIR/.env" ]; then
        echo "✅ .env geladen"
        set -a; source "$ROOT_DIR/.env"; set +a
    elif [ -f "$CLOUD_DIR/.env" ]; then
        echo "✅ .env in cloud geladen"
        set -a; source "$CLOUD_DIR/.env"; set +a
    else
        echo "❌ Fehler: Keine .env gefunden!"
        exit 1
    fi
}

# --- 2. Alte Prozesse säubern ---
cleanup() {
    echo "🧹 Räume alte Prozesse auf..."
    pm2 delete tide-backend tide-frontend 2>/dev/null

    fuser -k 8080/tcp 2>/dev/null
    fuser -k 3000/tcp 2>/dev/null
    sleep 2
}

# --- 3. Build-Funktionen ---
build_backend() {
    echo "🏗️ Baue Go Backend..."
    cd "$CLOUD_DIR" || exit
    go build -o tide-server ./cmd/server/main.go
    if [ $? -ne 0 ]; then
        echo "❌ FEHLER: Der Backend-Build ist fehlgeschlagen!"
        exit 1
    fi
    cd "$ROOT_DIR"
}

build_frontend() {
    echo "🏗️ Baue Next.js Frontend (1GB RAM Safe Mode)..."
    cd "$WEB_DIR" || exit
    rm -rf .next
    npm install
    NEXT_DISABLE_TURBOPACK=1 NODE_ENV=production npx next build --webpack
    if [ $? -ne 0 ]; then
        echo "❌ FEHLER: Der Frontend-Build ist fehlgeschlagen!"
        exit 1
    fi
    echo "💾 Synchronisiere Dateisystem..."
    sync
    cd "$ROOT_DIR"
}

# --- 4. Start-Logik mit PM2 ---
start_system() {
    echo "🚀 Starte Tide-Gesamtsystem via PM2..."

    cd "$CLOUD_DIR"
    pm2 start "$CLOUD_DIR/tide-server" --name "tide-backend"
    echo "✅ Backend gestartet (Port 8080)"

    cd "$WEB_DIR"
    pm2 start npm --name "tide-frontend" -- start
    echo "✅ Frontend gestartet (Port 3000)"

    pm2 save

    echo "------------------------------------------------------"
    echo "🎉 Tide ist online und läuft im Hintergrund!"
    echo "👉 Logs ansehen:   pm2 logs"
    echo "👉 Status ansehen: pm2 status"
    echo "------------------------------------------------------"
}

# --- Main Ausführung ---
load_env

case "$1" in
    -a|--all)
        cleanup
        build_backend
        build_frontend
        start_system
        ;;
    -b|--backend)
        cleanup
        build_backend
        start_system
        ;;
    -f|--frontend)
        cleanup
        build_frontend
        start_system
        ;;
    -s|--start)
        cleanup
        start_system
        ;;
    -o|--otp)
        echo "🔑 OTP: $(cat $OTP_FILE 2>/dev/null || echo 'Kein Code gefunden')"
        exit 0
        ;;
    *)
        echo "Verwendung: ./start.sh [-a | -b | -f | -s | -o]"
        echo "  -a : Alles neu bauen und starten"
        echo "  -b : Nur Backend neu bauen und starten"
        echo "  -f : Nur Frontend neu bauen und starten"
        echo "  -s : System starten (ohne neu zu bauen)"
        echo "  -o : OTP Code anzeigen"
        exit 1
        ;;
esac
