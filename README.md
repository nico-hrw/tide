# TIDE

Minimalist, local-first, end-to-end encrypted productivity app.
Notes · Calendar · Canvas · Chat · Finance · Exams — all data encrypted before it leaves your device.

## Project Structure

```
tide/
├── web/      # Frontend: Next.js 16 PWA (Port 3000)
└── cloud/    # Backend: Go 1.24 REST API + SQLite + Blob storage (Port 8080)
```

## Quick Start

### 1. Web Frontend
```bash
cd web
npm install
npm run dev      # http://localhost:3000
```

### 2. Cloud Backend
```bash
cd cloud
go build -o tide-server ./cmd/server/main.go
./tide-server    # http://localhost:8080
```

Windows helper: `cloud\scripts\windows\dev.bat` starts both backend and frontend development servers.

## Documentation

Each part of the project has its own dedicated documentation:

- **Frontend Documentation (`web/docs/`)**:
  - [`web/docs/COMPONENTS.md`](web/docs/COMPONENTS.md) — Component register, design system tokens, and mobile touch pitfalls
  - [`web/docs/ARCHITECTURE.md`](web/docs/ARCHITECTURE.md) — Next.js architecture, Zustand state store, and client-side encryption
  - [`web/docs/CONVENTIONS.md`](web/docs/CONVENTIONS.md) — Coding rules, TypeScript guidelines, and styling conventions

- **Backend Documentation (`cloud/docs/`)**:
  - [`cloud/docs/ARCHITECTURE.md`](cloud/docs/ARCHITECTURE.md) — Go backend architecture, chi routing, and storage model
  - [`cloud/docs/DATABASE.md`](cloud/docs/DATABASE.md) — SQLite schema definitions and relations
  - [`cloud/docs/API.md`](cloud/docs/API.md) — REST & WebSocket API specification
  - [`cloud/docs/SYSTEM_FLOW.md`](cloud/docs/SYSTEM_FLOW.md) — End-to-end encryption protocols and key exchange

- **AI Contributors**:
  - [`AGENTS.md`](AGENTS.md) — Operating instructions, build/verify commands, and rules

## Deployment

Deployment scripts are located in `cloud/scripts/`:
- `cloud/scripts/deploy.bat` — Cross-compiles for Linux/arm64 and deploys to a Raspberry Pi server.
- `cloud/scripts/linux/start.sh` — Manages production background processes with PM2.
