#!/bin/bash

# =================================================================
# Tide Management Script v5.0 (Zero-Downtime & Staging Edition)
# =================================================================

# NVM laden, falls vorhanden (stellt Node >= 20.9 fuer Next.js sicher)
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLOUD_DIR="$ROOT_DIR/cloud"
WEB_DIR="$ROOT_DIR/web"
OTP_FILE="$CLOUD_DIR/data/otp.txt"

# Standard-Ports & Pfade
PROD_BACKEND_PORT=8080
PROD_FRONTEND_PORT=3000
STAGING_BACKEND_PORT=8082
STAGING_FRONTEND_PORT=3002

# 1. Stelle sicher, dass der Datenordner existiert
mkdir -p "$CLOUD_DIR/data"

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

    # Ermittle den aktuellen Datenordner
    local active_data_dir=""
    if [ -n "$DATA_DIR" ] && [ -d "$DATA_DIR" ]; then
        active_data_dir="$DATA_DIR"
    elif [ -d "$ROOT_DIR/data" ] && [ -f "$ROOT_DIR/data/tide.db" ]; then
        active_data_dir="$ROOT_DIR/data"
    elif [ -d "$CLOUD_DIR/data" ] && [ -f "$CLOUD_DIR/data/tide.db" ]; then
        active_data_dir="$CLOUD_DIR/data"
    fi

    if [ -n "$active_data_dir" ]; then
        # WAL-Checkpoint anstoßen falls sqlite3 CLI verfügbar ist
        if command -v sqlite3 >/dev/null 2>&1 && [ -f "$active_data_dir/tide.db" ]; then
            sqlite3 "$active_data_dir/tide.db" "PRAGMA wal_checkpoint(TRUNCATE);" 2>/dev/null || true
        fi

        # Archiv erzeugen
        tar -czf "$backup_dir/data.tar.gz" -C "$(dirname "$active_data_dir")" "$(basename "$active_data_dir")" 2>/dev/null
        cp -a "$active_data_dir/tide.db"* "$backup_dir/" 2>/dev/null || true

        ln -sfn "$backup_dir" "$backup_root/latest"
        find "$backup_root" -maxdepth 1 -mindepth 1 -type d ! -name "latest" | sort -r | tail -n +31 | xargs -r rm -rf

        echo "✅ Sicherung erfolgreich: $backup_dir"
    else
        echo "⚠️ Kein aktives Datenverzeichnis gefunden, ueberspringe Backup."
    fi
}

# --- 3. Build-Funktionen (Zero-Downtime Safe) ---
build_backend() {
    echo "🏗️ Baue Go Backend..."
    cd "$CLOUD_DIR" || exit 1
    go mod tidy
    # In temporäre Datei kompilieren, damit laufende Binary nicht blockiert wird
    go build -o "$ROOT_DIR/tide-server.tmp" ./cmd/server/main.go
    if [ $? -ne 0 ]; then
        echo "❌ FEHLER: Der Backend-Build ist fehlgeschlagen! Laufender Server bleibt unberuehrt."
        exit 1
    fi
    mv -f "$ROOT_DIR/tide-server.tmp" "$ROOT_DIR/tide-server"
    chmod +x "$ROOT_DIR/tide-server"
    echo "💾 Backend erfolgreich gebaut!"
    cd "$ROOT_DIR" || exit 1
}

build_frontend() {
    echo "🏗️ Baue Next.js Frontend..."
    cd "$WEB_DIR" || exit 1
    
    # Automatische Aktualisierung der Browser-Kompatibilitaetsdatenbank
    echo "🌐 Aktualisiere Browserslist..."
    npx update-browserslist-db@latest --yes 2>/dev/null || true

    npm install
    NEXT_DISABLE_TURBOPACK=1 NODE_ENV=production NODE_OPTIONS="--max-old-space-size=1536" npx next build --webpack
    if [ $? -ne 0 ]; then
        echo "❌ FEHLER: Der Frontend-Build ist fehlgeschlagen! Laufender Server bleibt unberuehrt."
        exit 1
    fi
    echo "💾 Frontend erfolgreich gebaut!"
    cd "$ROOT_DIR" || exit 1
}

# --- 4. Zero-Downtime Reload / Start fuer Production ---
reload_or_start_prod() {
    echo "🚀 Uebertrage neue Version in Produktion (Zero Downtime)..."
    cd "$ROOT_DIR" || exit 1

    # Backend
    if pm2 describe tide-backend >/dev/null 2>&1; then
        echo "🔄 Reloade tide-backend..."
        pm2 reload tide-backend
    else
        echo "▶️ Starte tide-backend neu auf Port $PROD_BACKEND_PORT..."
        PORT=$PROD_BACKEND_PORT pm2 start "$ROOT_DIR/tide-server" --name "tide-backend"
    fi

    # Frontend
    cd "$WEB_DIR" || exit 1
    if pm2 describe tide-frontend >/dev/null 2>&1; then
        echo "🔄 Reloade tide-frontend..."
        pm2 reload tide-frontend
    else
        echo "▶️ Starte tide-frontend neu auf Port $PROD_FRONTEND_PORT..."
        PORT=$PROD_FRONTEND_PORT BACKEND_PORT=$PROD_BACKEND_PORT pm2 start npm --name "tide-frontend" -- start
    fi

    pm2 save
    echo "------------------------------------------------------"
    echo "🎉 Produktion aktualisiert ohne Downtime!"
    echo "👉 Status: pm2 status"
    echo "------------------------------------------------------"
}

# --- 5. Staging / Test Environment ---
start_staging() {
    echo "🧪 Starte / Aktualisiere Staging-Testumgebung..."
    local staging_data_dir="$ROOT_DIR/data_staging"
    mkdir -p "$staging_data_dir"

    # Falls keine Staging-DB existiert, kopiere die Produktions-DB als Startbasis
    if [ ! -f "$staging_data_dir/tide.db" ] && [ -f "$ROOT_DIR/data/tide.db" ]; then
        echo "📋 Initialisiere Staging-DB mit Kopie der aktuellen Daten..."
        cp "$ROOT_DIR/data/tide.db"* "$staging_data_dir/" 2>/dev/null || true
    fi

    cd "$ROOT_DIR" || exit 1
    if pm2 describe tide-staging-backend >/dev/null 2>&1; then
        echo "🔄 Reloade tide-staging-backend..."
        PORT=$STAGING_BACKEND_PORT DATA_DIR="$staging_data_dir" pm2 reload tide-staging-backend --update-env
    else
        echo "▶️ Starte tide-staging-backend auf Port $STAGING_BACKEND_PORT..."
        PORT=$STAGING_BACKEND_PORT DATA_DIR="$staging_data_dir" pm2 start "$ROOT_DIR/tide-server" --name "tide-staging-backend"
    fi

    cd "$WEB_DIR" || exit 1
    if pm2 describe tide-staging-frontend >/dev/null 2>&1; then
        echo "🔄 Reloade tide-staging-frontend..."
        PORT=$STAGING_FRONTEND_PORT BACKEND_PORT=$STAGING_BACKEND_PORT pm2 reload tide-staging-frontend --update-env
    else
        echo "▶️ Starte tide-staging-frontend auf Port $STAGING_FRONTEND_PORT..."
        PORT=$STAGING_FRONTEND_PORT BACKEND_PORT=$STAGING_BACKEND_PORT pm2 start npm --name "tide-staging-frontend" -- start
    fi

    pm2 save
    echo "------------------------------------------------------"
    echo "🧪 Staging-Umgebung ist online!"
    echo "👉 Frontend Port: $STAGING_FRONTEND_PORT"
    echo "👉 Backend Port:  $STAGING_BACKEND_PORT"
    echo "👉 Datenordner:   $staging_data_dir"
    echo "------------------------------------------------------"
}

stop_staging() {
    echo "🛑 Stoppe Staging-Umgebung..."
    pm2 delete tide-staging-backend tide-staging-frontend 2>/dev/null || true
    fuser -k ${STAGING_BACKEND_PORT}/tcp 2>/dev/null || true
    fuser -k ${STAGING_FRONTEND_PORT}/tcp 2>/dev/null || true
    pm2 save
    echo "✅ Staging gestoppt."
}

cleanup_prod() {
    echo "🧹 Stoppe und raeume Produktions-Prozesse auf..."
    pm2 delete tide-backend tide-frontend 2>/dev/null || true
    fuser -k ${PROD_BACKEND_PORT}/tcp 2>/dev/null || true
    fuser -k ${PROD_FRONTEND_PORT}/tcp 2>/dev/null || true
    sleep 1
    pm2 save
}

# --- Main Ausfuehrung ---
load_env

case "$1" in
    -a|--all)
        echo "🔄 Pruefe auf Code-Updates..."
        git pull origin main 2>/dev/null || true
        backup_data
        build_backend
        build_frontend
        reload_or_start_prod
        ;;
    -b|--backend)
        backup_data
        build_backend
        cd "$ROOT_DIR" || exit 1
        PORT=$PROD_BACKEND_PORT pm2 restart tide-backend 2>/dev/null || PORT=$PROD_BACKEND_PORT pm2 start "$ROOT_DIR/tide-server" --name "tide-backend"
        pm2 save
        ;;
    -f|--frontend)
        build_frontend
        cd "$WEB_DIR" || exit 1
        PORT=$PROD_FRONTEND_PORT BACKEND_PORT=$PROD_BACKEND_PORT pm2 restart tide-frontend 2>/dev/null || PORT=$PROD_FRONTEND_PORT BACKEND_PORT=$PROD_BACKEND_PORT pm2 start npm --name "tide-frontend" -- start
        pm2 save
        ;;
    -t|--test|--staging)
        backup_data
        build_backend
        build_frontend
        start_staging
        ;;
    --stop-staging)
        stop_staging
        ;;
    -r|--reload)
        reload_or_start_prod
        ;;
    -s|--start)
        backup_data
        reload_or_start_prod
        ;;
    -c|--backup)
        backup_data
        ;;
    -k|--stop)
        cleanup_prod
        echo "🛑 Tide Produktion gestoppt."
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
        echo "Verwendung: ./tide.sh [Option]"
        echo "  -a, --all           : Sichern, neu bauen und Produktion ZERO-DOWNTIME aktualisieren"
        echo "  -b, --backend       : Sichern, nur Backend bauen und aktualisieren"
        echo "  -f, --frontend      : Nur Frontend bauen und aktualisieren"
        echo "  -t, --test          : Sichern, bauen und STAGING/TEST-Umgebung starten (Ports 3002/8082)"
        echo "  --stop-staging      : Staging-Umgebung stoppen"
        echo "  -r, --reload        : Laufende PM2 Produktion ohne Rebuild sofort neu laden"
        echo "  -s, --start         : System starten"
        echo "  -c, --backup        : Manuelles Daten-Backup erstellen"
        echo "  -k, --stop          : Produktion stoppen"
        echo "  -o, --otp           : OTP Code anzeigen"
        echo "  status              : PM2 Prozess-Status anzeigen"
        echo "  logs                : Live-Logs anzeigen"
        exit 1
        ;;
esac
