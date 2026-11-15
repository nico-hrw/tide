# Deployment & Operational Verification Guide

This guide covers operational architecture, deployment targets, configuration, backup strategies, and verification procedures for the **Tide Cloud Go backend**.

---

## 1. Deployment Architecture

Tide Cloud is built as a self-contained, highly performant single Go binary.

```
+-------------------------------------------------------------+
|                      Host / Container                       |
|                                                             |
|   +-----------------------------------------------------+   |
|   |                  tide-server (Go)                   |   |
|   |                                                     |   |
|   |  - HTTP / REST API (Chi Router)                     |   |
|   |  - SSE Broker (/api/v1/events)                      |   |
|   |  - WebSockets (/api/ws/notes, /api/ws/quicknotes)   |   |
|   |  - Background GC Worker (Purge trash > 7 days)      |   |
|   +--------------------------+--------------------------+   |
|                              |                              |
|                              v                              |
|   +-----------------------------------------------------+   |
|   |              DATA_DIR (Default: ./data)             |   |
|   |                                                     |   |
|   |  - SQLite Database: tide.db (WAL Mode)              |   |
|   |  - Encrypted Blobs: blobs/<file-id>                 |   |
|   |  - Local Dev OTPs:  otp.txt                         |   |
|   +-----------------------------------------------------+   |
+-------------------------------------------------------------+
```

### Core Architectural Characteristics
- **Pure Go / CGO-Free:** Uses `modernc.org/sqlite` (pure Go SQLite translation). No GCC or native toolchain is required for compilation or runtime execution.
- **Minimal Footprint:** Idles at ~20–30 MB RAM and requires negligible CPU when idle. It runs smoothly on a Raspberry Pi 4, low-end VPS (512 MB – 1 GB RAM), or hardened container environments.
- **Embedded Dependencies:** Static assets and schemas are handled internally; only the executable and a persistent data directory are required.
- **Concurrency & WAL Mode:** SQLite runs in Write-Ahead Logging (`WAL`) mode with busy timeout handling, enabling high concurrent read throughput alongside non-blocking writes.

---

## 2. Deployment Options

### Option 1: Systemd Service (Production Linux)

For bare-metal Linux servers, virtual private servers (Debian, Ubuntu, Rocky Linux), or Raspberry Pi systems.

#### 1. Setup User and Directories
```bash
# Create dedicated system user
sudo useradd -r -s /bin/false -d /opt/tide tide

# Create folder structure
sudo mkdir -p /opt/tide/bin /opt/tide/data
sudo chown -R tide:tide /opt/tide
sudo chmod 700 /opt/tide/data
```

#### 2. Install Binary & Environment
Copy the compiled Linux binary `tide-server` to `/opt/tide/bin/tide-server` and create `/opt/tide/.env`:

```bash
sudo chmod +x /opt/tide/bin/tide-server
sudo chown tide:tide /opt/tide/bin/tide-server
```

Create `/opt/tide/.env` with strict permissions:
```ini
ENV=production
PORT=8080
DATA_DIR=/opt/tide/data
SERVER_MASTER_KEY=your-32-byte-secret-master-key!
JWT_SECRET=your-random-generated-jwt-secret-string
ALLOWED_ORIGINS=https://go-tide.app,https://yourdomain.com
```

```bash
sudo chown tide:tide /opt/tide/.env
sudo chmod 600 /opt/tide/.env
```

#### 3. Systemd Unit File
Create `/etc/systemd/system/tide-cloud.service`:

```ini
[Unit]
Description=Tide Cloud Backend Service
After=network.target network-online.target
Wants=network-online.target

[Service]
Type=simple
User=tide
Group=tide
WorkingDirectory=/opt/tide
ExecStart=/opt/tide/bin/tide-server
Restart=always
RestartSec=5s

# Security Hardening
NoNewPrivileges=true
ProtectSystem=full
ProtectHome=true
PrivateTmp=true
PrivateDevices=true

# Resource Limits
LimitNOFILE=65535

[Install]
WantedBy=multi-user.target
```

#### 4. Enable and Start
```bash
sudo systemctl daemon-reload
sudo systemctl enable tide-cloud
sudo systemctl start tide-cloud
sudo systemctl status tide-cloud
```

---

### Option 2: Docker & Docker Compose

#### Multi-Stage Dockerfile
Create `cloud/Dockerfile`:

```dockerfile
# Stage 1: Build binary
FROM golang:1.24-alpine AS builder

WORKDIR /src

# Copy dependency definitions
COPY go.mod go.sum ./
RUN go mod download

# Copy source
COPY . .

# Build pure Go binary without CGO
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build \
    -trimpath \
    -ldflags="-s -w" \
    -o /app/tide-server ./cmd/server/main.go

# Stage 2: Minimal runtime image
FROM alpine:3.20

RUN apk add --no-cache ca-certificates tzdata sqlite curl

# Run as non-root
RUN addgroup -S tide && adduser -S tide -G tide

WORKDIR /app
COPY --from=builder /app/tide-server /app/tide-server

RUN mkdir -p /app/data && chown -R tide:tide /app

USER tide
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:8080/health || exit 1

ENTRYPOINT ["/app/tide-server"]
```

#### Docker Compose Configuration
Create `docker-compose.yml`:

```yaml
version: "3.8"

services:
  tide-cloud:
    build:
      context: ./cloud
      dockerfile: Dockerfile
    container_name: tide-cloud
    restart: unless-stopped
    ports:
      - "8080:8080"
    environment:
      - ENV=production
      - PORT=8080
      - DATA_DIR=/app/data
      - SERVER_MASTER_KEY=${SERVER_MASTER_KEY}
      - JWT_SECRET=${JWT_SECRET}
      - ALLOWED_ORIGINS=https://go-tide.app,http://localhost:3000
    volumes:
      - ./data:/app/data
    security_opt:
      - no-new-privileges:true
```

Run container:
```bash
docker compose up -d
docker compose logs -f tide-cloud
```

---

### Option 3: Windows Batch & Windows Service

For local Windows testing, CI staging, or running as a Windows background task.

#### 1. Interactive Scripts
Tide provides automated batch helpers in `cloud/scripts/windows/`:
- **Development Mode:** `cloud/scripts/windows/dev.bat`
  Launches both Go backend (`go run ./cmd/server/main.go`) and Next.js frontend (`npm run dev`) in separate console windows.
- **Production Local Execution:** `cloud/scripts/windows/start.bat`
  Compiles and launches `tide-server.exe` together with `npm run start`.

#### 2. Running as a Native Windows Service (NSSM)
To run `tide-server.exe` as a persistent background Windows service using NSSM (Non-Sucking Service Manager):

```cmd
:: 1. Build the production executable
cd cloud
go build -o tide-server.exe ./cmd/server/main.go

:: 2. Install service via NSSM
nssm install TideCloud "C:\Users\nicoh\projects\tide\cloud\tide-server.exe"
nssm set TideCloud AppDirectory "C:\Users\nicoh\projects\tide\cloud"
nssm set TideCloud AppEnvironmentExtra ENV=production^
PORT=8080^
DATA_DIR=C:\Users\nicoh\projects\tide\cloud\data^
SERVER_MASTER_KEY=your-32-byte-secret-master-key!^
JWT_SECRET=your-random-generated-jwt-secret-string

:: 3. Start the service
nssm start TideCloud
```

---

## 3. Environment Configuration Reference

The backend loads configuration from `.env` in the working directory (or binary directory), falling back to system environment variables.

| Variable | Required | Default | Description |
|:---|:---:|:---|:---|
| `PORT` | No | `8080` | Port on which the HTTP server listens. |
| `DATA_DIR` | No | `./data` (relative to binary or working dir) | Directory where `tide.db` SQLite database and `blobs/` directory reside. |
| `ENV` | No | `development` | Operating mode. Set to `production` in live environments. When `production`, `SERVER_MASTER_KEY` length and `JWT_SECRET` presence are strictly validated. |
| `SERVER_MASTER_KEY` | **Yes** (Prod) | `12345678901234567890123456789012` (dev fallback) | **Minimum 32 characters**. AES-256 master key used for server-side encryption of user secrets, blind index salts, and sensitive records. |
| `JWT_SECRET` | **Yes** | *None* | Secret key used to sign and verify authentication JWTs. If missing, the server terminates immediately at startup. |
| `ENABLE_REGISTRATION`| No | `true` | Allows or restricts registration of new user accounts. Set to `false` on private or invite-only instances. |
| `APP_URL` | No | *Empty* | Fully qualified frontend base URL (e.g. `https://go-tide.app`) automatically permitted by CORS middleware. |
| `ALLOWED_ORIGINS` | No | *Empty* | Comma-separated list of additional allowed CORS origins (e.g. `https://app.example.com,https://tide.local`). |
| `APP_VERSION` | No | `0.2.0` | Overrides the version returned by `GET /api/v1/version`. |

### Built-in Rate Limits (Token Bucket)
Rate limiters operate per IP address to safeguard the service from brute-force attacks:
- **Authentication (`/api/v1/auth/register`, `/request-otp`):** 0.1 req/s (1 req every 10s), burst 5.
- **OTP Verification (`/api/v1/auth/verify-otp`):** 0.166 req/s (1 req every 6s), burst 5.
- **Search (`/api/v1/search`):** 20 requests per minute, burst 20.
- **Quicknotes (`/api/v1/quicknotes`):** 5.0 req/s, burst 30.

---

## 4. Backup & Disaster Recovery

The Tide data layer comprises two interdependent assets inside `DATA_DIR`:
1. **Metadata & Vaults:** `tide.db` (SQLite database with WAL journal files `tide.db-wal` and `tide.db-shm`).
2. **Encrypted Blobs:** `blobs/` directory containing encrypted note bodies, attachments, and files named by their UUIDs.

> [!CAUTION]
> Never copy `tide.db` directly using standard `cp` or `copy` while the server is running. In WAL mode, doing so can result in corrupted backups that miss uncommitted checkpoint transactions.

### 1. Database Online Backup
Always use the official SQLite backup API or online backup tool:

```bash
# Using SQLite CLI online backup (safe while server is writing)
sqlite3 /opt/tide/data/tide.db ".backup /backup/tide-$(date +%Y%m%d%H%M%S).db"
```

Or via SQL `VACUUM INTO`:
```bash
sqlite3 /opt/tide/data/tide.db "VACUUM INTO '/backup/tide-vacuum-$(date +%Y%m%d%H%M%S).db';"
```

### 2. Blobs Directory Synchronization
Sync the blob store using `rsync` with archival preservation:

```bash
rsync -av --delete /opt/tide/data/blobs/ /backup/blobs/
```

### 3. Automated Daily Backup Script
Save as `/opt/tide/scripts/backup.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

BACKUP_ROOT="/var/backups/tide"
DATA_DIR="/opt/tide/data"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
DEST_DIR="${BACKUP_ROOT}/${TIMESTAMP}"

mkdir -p "${DEST_DIR}"

# 1. Consistent SQLite backup
sqlite3 "${DATA_DIR}/tide.db" ".backup '${DEST_DIR}/tide.db'"

# 2. Sync blobs
rsync -a "${DATA_DIR}/blobs" "${DEST_DIR}/"

# 3. Compress snapshot
tar -czf "${BACKUP_ROOT}/tide_backup_${TIMESTAMP}.tar.gz" -C "${BACKUP_ROOT}" "${TIMESTAMP}"
rm -rf "${DEST_DIR}"

# 4. Retain last 7 days of backups
find "${BACKUP_ROOT}" -name "tide_backup_*.tar.gz" -mtime +7 -delete

echo "Backup complete: ${BACKUP_ROOT}/tide_backup_${TIMESTAMP}.tar.gz"
```

---

## 5. Operational Verification

### 1. Health & Liveness Endpoints

#### Liveness Probe: `GET /health`
```bash
curl -i http://localhost:8080/health
```
**Expected Response:**
```http
HTTP/1.1 200 OK
Content-Type: text/plain; charset=utf-8

OK
```

#### Version Check: `GET /api/v1/version`
```bash
curl -s http://localhost:8080/api/v1/version | jq .
```
**Expected Response:**
```json
{
  "version": "0.2.0",
  "timestamp": 1740000000
}
```

#### Root Status: `GET /`
```bash
curl -i http://localhost:8080/
```
**Expected Response:** `200 OK` with body `Tide Cloud Server Running`.

---

### 2. Verification Scripts (`cloud/scripts/verify/`)

Tide includes automated PowerShell test suites to verify system functionality against a live instance:

| Script | Purpose |
|:---|:---|
| `cloud/scripts/verify/verify_api.ps1` | Full registration, login, note metadata creation, blob upload, and blob download round-trip. |
| `cloud/scripts/verify/verify_db.ps1` | Direct SQLite schema integrity, tables presence, and blind index queries. |
| `cloud/scripts/verify/verify_messaging.ps1` | Contact requests, end-to-end encrypted messaging, and message queue checks. |
| `cloud/scripts/verify/verify_sharing.ps1` | Shared file permissions, public links, and access-token validation. |
| `cloud/scripts/verify/verify_sharing_live.ps1` | Real-time multi-user collaborative access and sharing flow. |

#### Running Verification on Windows:
```powershell
cd cloud\scripts\verify
pwsh -File .\verify_api.ps1
pwsh -File .\verify_db.ps1
```

#### Running Verification on Linux / macOS:
Ensure PowerShell Core (`pwsh`) is installed:
```bash
cd cloud/scripts/verify
pwsh ./verify_api.ps1
```

---

## 6. Logging, Telemetry & Monitoring

### 1. HTTP Request Logging
Tide Cloud utilizes Chi's standard structured middleware logger (`middleware.Logger`). Every incoming request logs:
- Method and URL path
- Request ID (`middleware.RequestID`)
- Remote IP (honoring `X-Forwarded-For` and `X-Real-IP` via `middleware.RealIP`)
- Response status code, byte size, and duration

Example log line:
```text
[chi] 2026/11/15 20:30:12 "GET http://localhost:8080/api/v1/files HTTP/1.1" from 127.0.0.1:54321 - 200 482B in 1.42ms
```

### 2. Monitoring Real-Time Connections (SSE & WebSockets)
- **SSE Broker (`/api/v1/events`):** Clients maintain a continuous HTTP streaming connection. Check active connections via:
  ```bash
  # Linux: Count active connections to port 8080 on /api/v1/events
  ss -tan state established '( dport = :8080 or sport = :8080 )' | wc -l
  ```
- **Collaborative Note WebSockets (`/api/ws/notes/{fileID}`):** Each open note tab with active collaborative editing holds an open WebSocket.

### 3. Database Size & WAL Monitoring
Monitor SQLite database growth and WAL checkpoint health:
```bash
ls -lh /opt/tide/data/tide.db*
```
If `tide.db-wal` grows excessively large (e.g. > 100 MB), a long-running transaction may be preventing checkpointing. You can trigger an explicit checkpoint:
```bash
sqlite3 /opt/tide/data/tide.db "PRAGMA wal_checkpoint(PASSIVE);"
```

### 4. Background Garbage Collection
The server runs an hourly background worker (`PurgeOldTrashedFiles`) that automatically removes files and blobs that have remained in the trash for longer than 7 days. Watch for GC logs:
```text
[GC] Purged X expired trashed files from database and blob storage.
```
