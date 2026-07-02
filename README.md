# TIDE

Minimalist, local-first, end-to-end encrypted productivity app.
Notes · Calendar · Canvas · Chat · Finance · Exams — all data encrypted before it leaves your device.

## What's here

| Directory | What it is |
|-----------|------------|
| `web/` | Next.js 16 PWA — the main app (port 3000) |
| `cloud/` | Go 1.24 backend — REST API + SQLite + blob storage (port 8080) |
| `tracker/` | Standalone Next.js fitness tracker (port 3001) |
| `docs/` | Architecture, component index, conventions |

## Quick start

```bash
# Web (main app)
cd web && npm install && npm run dev        # http://localhost:3000

# Cloud backend
cd cloud && go build -o tide-server ./cmd/server/main.go
cp .env.dev .env                            # edit with your values
./tide-server                               # http://localhost:8080

# Tracker (optional)
cd tracker && npm install && npm run dev   # http://localhost:3001
```

## Common commands

```bash
# Web
npm run dev       # dev server
npm run build     # production build
npm run lint      # ESLint
npx tsc --noEmit  # typecheck

# Cloud
go build ./...    # compile
go vet ./...      # static analysis
go test ./...     # tests (none yet)
```

## Deploy

`deploy.bat` — Windows script that cross-compiles the Go binary for Linux/arm64 and
rsync-deploys to a Raspberry Pi. Edit the `RASPI_USER`/`RASPI_IP` variables at the top.

## Mental model

1. The browser encrypts everything (AES-GCM) before sending to the server.
2. The Go server stores opaque blobs — it cannot read titles, content, or keys.
3. `public_meta` (timestamps, type, share status) stays unencrypted for sorting/filtering.
4. `secured_meta` (title, tags, preview, file key) is an encrypted blob.
5. Sharing works by re-wrapping the file's DEK with the recipient's public key.

## Docs

- [`docs/INDEX.md`](docs/INDEX.md) — master navigation map, where to find everything
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — modules, data layer, security model
- [`docs/COMPONENTS.md`](docs/COMPONENTS.md) — component index by domain
- [`docs/CONVENTIONS.md`](docs/CONVENTIONS.md) — naming, structure, rules
- [`AGENTS.md`](AGENTS.md) — operating manual for AI/automated contributors
