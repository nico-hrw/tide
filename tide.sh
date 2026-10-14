#!/bin/bash

# =================================================================
# Tide Management Script v4.0 (Cloud & PM2 Edition)
# =================================================================

# NVM laden, falls vorhanden (stellt Node >= 20.9 für Next.js sicher)
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLOUD_DIR="$ROOT_DIR/cloud"
WEB_DIR="$ROOT_DIR/web"
OTP_FILE="$CLOUD_DIR/data/otp.txt"

# 1. Stelle sicher, dass der Datenordner existiert
mkdir -p "$CLOUD_DIR/data"

echo "🔄 Prüfe auf Code-Updates..."
git pull origin main

# --- 1. Umgebungsvariablen laden ---
load_env() {
    if [ -f "$ROOT_DIR/.env" ]; then
        echo "✅ .env aus Root geladen"
        set -a; source "$ROOT_DIR/.env"; set +a
    elif [ -f "$CLOUD_DIR/.env" ]; then
        echo "✅ .env aus cloud geladen"
        set -a; source "$CLOUD_DIR/.env"; set +a
    else
        echo "❌ Fehler: Keine .env Datei gefunden!"
        exit 1
    fi
}

# --- 2. Backup-Funktion ---
backup_data() {
    local backup_root="$HOME/tide_backup"
    local timestamp
    timestamp="$(date +'%Y-%m-%d_%H-%M-%S')"
    local backup_dir="$backup_root/$timestamp"

    echo "📦 Starte Datensicherung der Nutzerdaten..."
    mkdir -p "$backup_dir"

    # Ermittle den aktuellen Datenordner (Root oder Cloud)
    local active_data_dir=""
    if [ -d "$ROOT_DIR/data" ] && [ -f "$ROOT_DIR/data/tide.db" ]; then
        active_data_dir="$ROOT_DIR/data"
    elif [ -d "$CLOUD_DIR/data" ] && [ -f "$CLOUD_DIR/data/tide.db" ]; then
        active_data_dir="$CLOUD_DIR/data"
    fi

    if [ -n "$active_data_dir" ]; then
        # WAL-Checkpoint anstoßen falls sqlite3 CLI verfügbar ist
        if command -v sqlite3 >/dev/null 2>&1; then
            sqlite3 "$active_data_dir/tide.db" "PRAGMA wal_checkpoint(TRUNCATE);" 2>/dev/null || true
        fi

        # Vollständiges Archiv im Backup-Verzeichnis erzeugen
        tar -czf "$backup_dir/data.tar.gz" -C "$(dirname "$active_data_dir")" "$(basename "$active_data_dir")" 2>/dev/null
        # Schnellzugriff auf die DB für direkte Inspektion/Wiederherstellung
        cp -a "$active_data_dir/tide.db"* "$backup_dir/" 2>/dev/null || true

        # Symlink auf latest aktualisieren
        ln -sfn "$backup_dir" "$backup_root/latest"

        # Behalte die letzten 30 Backups auf dem Server
        find "$backup_root" -maxdepth 1 -mindepth 1 -type d ! -name "latest" | sort -r | tail -n +31 | xargs -r rm -rf

        echo "✅ Sicherung erfolgreich gespeichert in: $backup_dir"
        echo "📌 'latest'-Zeiger aktualisiert: $backup_root/latest"
    else
        echo "⚠️ Kein aktives Datenverzeichnis mit Nutzerdaten gefunden, überspringe Backup."
    fi
}

# --- 3. Alte Prozesse säubern ---
cleanup() {
    echo "🧹 Räume alte Prozesse auf..."
    pm2 delete tide-backend tide-frontend 2>/dev/null

    fuser -k 8080/tcp 2>/dev/null
    fuser -k 3000/tcp 2>/dev/null
    sleep 2
}

# --- 4. Build-Funktionen ---
build_backend() {
    echo "🏗️ Baue Go Backend..."
    cd "$CLOUD_DIR" || exit
    go mod tidy
    go build -o "$ROOT_DIR/tide-server" ./cmd/server/main.go
    if [ $? -ne 0 ]; then
        echo "❌ FEHLER: Der Backend-Build ist fehlgeschlagen!"
        exit 1
    fi
    echo "💾 Synchronisiere Dateisystem..."
    sync
    cd "$ROOT_DIR"
}

build_frontend() {
    echo "🏗️ Baue Next.js Frontend (1GB RAM Safe Mode)..."
    cd "$WEB_DIR" || exit
    rm -rf .next
    npm install
    NEXT_DISABLE_TURBOPACK=1 NODE_ENV=production NODE_OPTIONS="--max-old-space-size=1536" npx next build --webpack
    if [ $? -ne 0 ]; then
        echo "❌ FEHLER: Der Frontend-Build ist fehlgeschlagen!"
        exit 1
    fi
    echo "💾 Synchronisiere Dateisystem..."
    sync
    cd "$ROOT_DIR"
}

# --- 5. Start-Logik mit PM2 ---
start_system() {
    echo "🚀 Starte Tide-Gesamtsystem via PM2..."

    cd "$ROOT_DIR"
    pm2 start "$ROOT_DIR/tide-server" --name "tide-backend"
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
        backup_data
        cleanup
        build_backend
        build_frontend
        start_system
        ;;
    -b|--backend)
        backup_data
        cleanup
        build_backend
        cd "$ROOT_DIR"
        pm2 start "$ROOT_DIR/tide-server" --name "tide-backend"
        pm2 save
        ;;
    -f|--frontend)
        cleanup
        build_frontend
        cd "$WEB_DIR"
        pm2 start npm --name "tide-frontend" -- start
        pm2 save
        ;;
    -s|--start)
        backup_data
        cleanup
        start_system
        ;;
    -c|--backup)
        backup_data
        ;;
    -k|--stop)
        cleanup
        echo "🛑 Tide gestoppt."
        ;;
    -o|--otp)
        echo "🔑 OTP: $(cat $OTP_FILE 2>/dev/null || cat "$ROOT_DIR/data/otp.txt" 2>/dev/null || echo 'Kein Code gefunden')"
        exit 0
        ;;
    status)
        pm2 status
        ;;
    logs)
        pm2 logs
        ;;
    *)
        echo "Verwendung: ./tide.sh [-a | -b | -f | -s | -c | -k | -o | status | logs]"
        echo "  -a, --all      : Alles sichern, neu bauen und starten"
        echo "  -b, --backend  : Sichern, nur Backend neu bauen und starten"
        echo "  -f, --frontend : Nur Frontend neu bauen und starten"
        echo "  -s, --start    : Sichern und System starten (ohne neu zu bauen)"
        echo "  -c, --backup   : Manuelles Daten-Backup erstellen"
        echo "  -k, --stop     : System stoppen"
        echo "  -o, --otp      : OTP Code anzeigen"
        echo "  status         : PM2 Prozess-Status anzeigen"
        echo "  logs           : Live-Logs anzeigen"
        exit 1
        ;;
esac
