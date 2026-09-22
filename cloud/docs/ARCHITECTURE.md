# TIDE Backend Architecture (`cloud/`)

> Go 1.24 HTTP REST API, SQLite data store, encrypted blob storage, and realtime services.

## 1. Tech Stack

| Layer | Technology | Role |
|-------|------------|------|
| Language | Go 1.24 | High performance, memory-efficient compiled backend |
| HTTP Router | `github.com/go-chi/chi/v5` | Lightweight middleware-compatible routing |
| Database | SQLite via `modernc.org/sqlite` | Pure Go, CGO-free relational storage |
| Object Store | Local Filesystem (`data/blobs/`) | Encrypted client files & large binary assets |
| Realtime | SSE (Server-Sent Events) + WebSocket | Push notifications, live file sync, chat |
| Auth & Crypto | JWT + Argon2 / SHA-256 blind indexing | Stateless session validation & zero-knowledge search |

## 2. Directory Structure

```
cloud/
├── cmd/
│   └── server/
│       └── main.go       # Server entry point, router setup, background GC worker
├── internal/
│   ├── api/              # HTTP REST handlers (auth, files, contacts, finance, etc.)
│   ├── db/               # Model structs & database helper queries
│   ├── extensions/       # Extension-specific business logic (e.g. finance)
│   └── store/            # SQLite schema initialization (sqlite.go) & blob store (blob.go)
├── scripts/              # Deployment, start, dev, and verification scripts
│   ├── deploy.bat        # Remote deployment to Raspberry Pi
│   ├── windows/          # dev.bat, start.bat, update.bat
│   ├── linux/            # start.sh, update.sh
│   └── verify/           # verify_*.ps1 integration test scripts
├── data/                 # SQLite database file (tide.db) and blob store (gitignored)
└── docs/                 # Backend documentation (ARCHITECTURE, DATABASE, API, SYSTEM_FLOW)
```

## 3. Server Startup & Configuration

1. **Environment Variables**:
   - Loaded from `.env` in binary dir or root.
   - `PORT`: HTTP port (defaults to `8080`).
   - `SERVER_MASTER_KEY`: 32-byte secret key.
   - `JWT_SECRET`: Mandatory secret for token validation (`api.ValidateJWTSecret()` fails startup if missing).

2. **Zero-Knowledge Principle**:
   - The server has zero knowledge of sensitive user content.
   - Content and private metadata (`secured_meta`) are stored as opaque encrypted binary blobs.
   - Blind indexes (HMAC-SHA256) are used for user discovery and account uniqueness checks without revealing raw emails or usernames.

3. **Background Garbage Collection**:
   - Every hour, a background goroutine in `main.go` calls `PurgeOldTrashedFiles()` to permanently remove files in the trash older than 7 days.
