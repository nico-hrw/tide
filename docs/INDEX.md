<!-- AI NAVIGATION INDEX — scan this first, then jump to specific files -->
# TIDE — Master Index

## What Is TIDE
Minimalist local-first E2E-encrypted productivity app. Web (Next.js) + Cloud (Go/SQLite). Modules: Notes, Calendar, Canvas, Chat, Finance, Social.

## Doc Map

| Doc | Path | Contents |
|-----|------|----------|
| This index | `docs/INDEX.md` | Master navigation |
| Architecture | `docs/ARCHITECTURE.md` | Tech stack, modules, security model, API surface |
| Conventions | `docs/CONVENTIONS.md` | Naming, structure, coding rules |
| System flow | `docs/architecture/SYSTEM_FLOW.md` | E2E encryption flow, API structure, calendar drag |
| Database | `docs/architecture/DATABASE.md` | All SQLite tables + column descriptions |
| Components | `docs/COMPONENTS.md` | Component index by domain → file paths |
| Changelogs | `docs/architecture/changelogs/` | Sequential change records (001_*.md, 002_*.md …) |

## Key Source Paths

| Area | Path |
|------|------|
| Web app root | `web/src/` |
| App pages | `web/src/app/` |
| All components | `web/src/components/` |
| Zustand stores | `web/src/store/` |
| Utility libs | `web/src/lib/` |
| TypeScript types | `web/src/types/` |
| React hooks | `web/src/hooks/` |
| Cloud (Go) root | `cloud/` |
| Go API handlers | `cloud/internal/api/` |
| Go DB + store | `cloud/internal/store/` + `cloud/internal/db/` |
| Go entry point | `cloud/cmd/server/main.go` |

## Domain → Primary Files (quick jump)

| Domain | Web components | Store | Go API |
|--------|---------------|-------|--------|
| Notes / Editor | `components/Editor.tsx`, `components/extensions/` | `store/useDataStore.ts` | `api/files.go` |
| Canvas | `components/Canvas/` | `store/useDragGhost.ts` | `api/files.go` (blob) |
| Calendar | `components/Calendar/` | `store/useDataStore.ts` (events) | `api/events.go` |
| Chat | `components/Chat/` | `store/useSocialStore.ts` | `api/messages.go`, `api/websocket.go` |
| Auth | `app/auth/page.tsx`, `components/AuthGuard.tsx` | — | `api/auth.go` |
| Finance (ext) | `components/Finance/` | — | `api/finance.go` |
| Social | `components/Social/` | `store/useSocialStore.ts` | `api/contacts.go`, `api/profiles.go` |
| Layout | `components/Layout/` | — | — |
| Sharing | `components/ShareModal.tsx`, `components/ShareManagementPanel.tsx` | — | `api/files.go` (shares) |

## Critical Cross-Cutting Files

| File | Role |
|------|------|
| `web/src/app/page.tsx` | Root orchestrator — mounts all views, manages active note/tab state |
| `web/src/lib/crypto.ts` + `cryptoV2.ts` | All E2E encryption (AES-GCM, RSA wrap/unwrap) |
| `web/src/lib/api.ts` | Central `apiFetch` + `getApiBase` — all HTTP calls go through here |
| `web/src/store/useDataStore.ts` | Global notes/events/tasks state + CRUD actions |
| `cloud/internal/store/sqlite.go` | SQLite DB init, all table DDL, primary data access layer |
| `cloud/internal/store/blob.go` | Encrypted blob storage (local FS) |
| `web/src/types/canvas.ts` | Canvas element + StyleFile types (sidecar JSON schema) |

## Encryption Model (summary)
Server is zero-knowledge on content. `public_meta` (dates, type, sharing) unencrypted. `secured_meta` (title, tags, preview, content key) AES-GCM encrypted client-side. File blobs encrypted before upload. See `docs/architecture/SYSTEM_FLOW.md §3`.

## Extension System
Extensions (Finance, Calendar, Exams) lazy-loaded via `dynamic()`. Enabled per-user in `users.enabled_extensions` JSON column. Extension-specific DB tables prefixed `ext_`.
