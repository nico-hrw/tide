# TIDE Architecture

> Short orientation. For deep details: `DATABASE.md`, `SYSTEM_FLOW.md`, `COMPONENTS.md`.

## Stack

| Layer | Technology | Role |
|-------|-----------|------|
| Frontend | Next.js 16, React 19, TypeScript | PWA, all UI, client-side encryption |
| State | Zustand | Global notes/events/tasks (`useDataStore`) |
| Editor | TipTap 3 (ProseMirror) | Block-based rich-text editing |
| Backend | Go 1.24, chi router | REST API, auth, WebSocket |
| Database | SQLite (`modernc.org/sqlite`) | All relational data |
| Blob storage | Local FS (`cloud/data/blobs/`) | Encrypted file content |
| Realtime | Go WebSocket (`gorilla/websocket`) | Chat + live sync |
| Deploy | Raspberry Pi (arm64) or any Linux | `deploy.bat` cross-compiles + rsync |

## Module Map

```
web/src/
  app/page.tsx          ← root orchestrator; mounts all views, owns active-note state
  components/Layout/    ← MobileLayout (shell), MobileWeekGrid (touch calendar)
  components/Calendar/  ← CalendarView (desktop week grid), WeekView, MiniCalendar
  components/Canvas/    ← Infinite canvas (XYFlow), note cards, style files
  components/Chat/      ← E2EE messaging, partner profile
  components/Finance/   ← Finance extension (accounts, transactions)
  components/Exams/     ← Exam planner extension
  components/Social/    ← Social hub, contacts
  components/extensions/← TipTap extensions + SmartIsland panel
  lib/crypto.ts         ← v1: base64, AES-GCM helpers, key derivation
  lib/cryptoV2.ts       ← v2: DEK generate/wrap/unwrap (RSA-OAEP)
  lib/api.ts            ← apiFetch — all HTTP calls route here
  lib/designTokens.ts   ← single source for all visual constants
  store/useDataStore.ts ← notes, events, tasks, calendar state

cloud/
  cmd/server/main.go    ← entry point, port 8080, loads .env
  internal/api/         ← HTTP handlers per domain
  internal/store/       ← sqlite.go (DDL + queries), blob.go
  internal/db/          ← model structs, link queries
  internal/gcal/        ← Google Calendar sync
```

## Security Model

```
┌─────────────────────────────────────────────┐
│  Browser (trusted)                          │
│  ┌──────────┐  encrypt  ┌────────────────┐  │
│  │ plaintext│ ────────► │ AES-GCM cipher │  │
│  └──────────┘           └───────┬────────┘  │
│                                 │           │
└─────────────────────────────────┼───────────┘
                                  ▼ HTTPS
┌─────────────────────────────────────────────┐
│  Go Server (zero-knowledge on content)      │
│  stores: public_meta  (unencrypted)         │
│           secured_meta (opaque blob)        │
│           blob        (encrypted content)   │
└─────────────────────────────────────────────┘
```

**Server can see:** file IDs, parent folder, timestamps, type, share status, size.

**Server cannot see:** titles, tags, note content, canvas data, event descriptions, file names.

### Encryption layers

| Layer | Algorithm | What it protects |
|-------|-----------|-----------------|
| Content | AES-GCM, 256-bit DEK | Note body, file blobs |
| Metadata | AES-GCM | Title, tags, preview, thumbnail |
| Key wrapping | RSA-OAEP (4096-bit) | Per-file DEK wrapped for each recipient |
| Auth key | AES-GCM + PIN-derived KEK | Private key in `encrypted_vault` |
| Blind index | HMAC-SHA256 | Email/username lookups without revealing values |

### Sharing flow

1. User A requests User B's `public_key` from the server.
2. User A wraps the file's DEK with B's public key → writes a `file_shares` row.
3. User B fetches the share, unwraps the DEK with their private key, decrypts file.

## Extension System

Extensions (Finance, Calendar, Exams) are lazy-loaded via Next.js `dynamic()`.
Enabled per-user in `users.enabled_extensions` (JSON array in SQLite).
Extension-specific DB tables are prefixed `ext_` (e.g. `ext_finance_accounts`).

## API Surface

All routes under `/api/v1/`. Auth via `X-User-ID` header (JWT session token).

| Prefix | Handler | Domain |
|--------|---------|--------|
| `/auth` | `api/auth.go` | Register, login, verify magic link |
| `/files` | `api/files.go` | CRUD notes/folders, blob upload/download |
| `/events` | `api/events.go` | Calendar events |
| `/messages` | `api/messages.go` | Chat messages |
| `/contacts` | `api/contacts.go` | Social contacts |
| `/links` | `api/links.go` | Note backlinks |
| `/tasks` | `api/tasks.go` | Task items |
| `/tabs` | `api/tabs.go` | Open tab state |
| `/integrations/gcal` | `api/gcal_handler.go` | Google Calendar OAuth + sync |
| `/ws` | `api/websocket.go` | WebSocket hub |

## Data Layer

SQLite via `cloud/internal/store/sqlite.go`. Full schema in [`architecture/DATABASE.md`](architecture/DATABASE.md).

Key tables: `users`, `files` (notes + folders + events), `file_shares`, `links`, `messages`, `contacts`, `tokens`, `ext_finance_*`.

No ORM — plain SQL with `database/sql`. Migrations are manual DDL additions in `sqlite.go:InitDB()`.

## Known Architectural Debt

| Item | Impact | Notes |
|------|--------|-------|
| `page.tsx` — 3900 lines | High | Mixes routing, state, crypto, API calls; candidate for splitting |
| Dual crypto libs (`crypto.ts` + `cryptoV2.ts`) | Medium | Both in active use; long-term goal: consolidate into one |
| No test suite | Medium | Neither web nor cloud has automated tests |
| ESLint 557 pre-existing errors | Low | All `any` types; grandfathered — do not add more |
