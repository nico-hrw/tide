# AGENTS — Operating Manual for AI Contributors

> Also valid for Claude Code: this file doubles as `CLAUDE.md` context.
> Read `docs/INDEX.md` next to locate any specific file or module.

## Build / verify commands (run these after every change)

```bash
# Web — typecheck (must be clean before committing)
cd web && npx tsc --noEmit

# Web — lint (557 pre-existing errors tolerated; do not add new ones)
cd web && npm run lint 2>&1 | tail -5

# Web — build
cd web && npm run build

# Cloud — compile + static analysis
cd cloud && go build ./... && go vet ./...
```

One-liner: `cd web && npx tsc --noEmit && cd ../cloud && go build ./... && go vet ./...`

## Where things live

| Want to change… | Go here |
|-----------------|---------|
| Any page/route | `web/src/app/` |
| Root app state, note/event CRUD | `web/src/app/page.tsx` (3900 L — be targeted) |
| Mobile calendar UI | `web/src/components/Layout/MobileLayout.tsx` + `MobileWeekGrid.tsx` |
| Desktop calendar | `web/src/components/Calendar/CalendarView.tsx` |
| TipTap editor | `web/src/components/Editor.tsx` + `web/src/components/extensions/` |
| Design tokens (colors, radii, blur) | `web/src/lib/designTokens.ts` — **single source, never hardcode** |
| All HTTP calls | `web/src/lib/api.ts` — use `apiFetch`, never raw `fetch` |
| Encryption (v1 utils) | `web/src/lib/crypto.ts` |
| Encryption (DEK wrap/unwrap) | `web/src/lib/cryptoV2.ts` |
| Global state (notes, events, tasks) | `web/src/store/useDataStore.ts` |
| Go API handlers | `cloud/internal/api/` |
| Go DB schema + queries | `cloud/internal/store/sqlite.go` |
| Go blob storage | `cloud/internal/store/blob.go` |
| Go entry point | `cloud/cmd/server/main.go` |

## Rules (enforced — do not break)

1. **Behavior-preserving by default.** No runtime behavior changes unless explicitly requested.
2. **Read before editing.** Always read a file before modifying it.
3. **No new files unless necessary.** Prefer editing existing files.
4. **No secrets committed.** Never commit `.env`, tokens, or credentials.
5. **Typecheck must stay clean.** `tsc --noEmit` must return 0 errors.
6. **`apiFetch` for all HTTP.** Never call `fetch` directly in components.
7. **`designTokens` for all visuals.** Never hardcode colors, blur values, or radii.
8. **Keep files under 500 lines.** If a file grows past this, flag it for splitting.
9. **No `any` in new code.** Existing `any` errors are grandfathered; don't add more.
10. **Update docs when changing components.** `docs/COMPONENTS.md` is the component register.

## Known gotchas

- **`page.tsx` is 3900 lines.** Read only the relevant section. Use grep/search to locate the function you need before reading.
- **Dual crypto libs:** `crypto.ts` (v1, base64/AES helpers) and `cryptoV2.ts` (v2, DEK wrap/unwrap) are both in active use. Do not remove either. The long-term plan is to consolidate but it is not done yet.
- **ESLint has 557 pre-existing errors** (all `any` types and unused vars). These are grandfathered. The linter exits 0 — do not be surprised. Do not add new `any` usages.
- **Mobile drag flushSync:** `setEvDrag(null)` must be wrapped in `flushSync` in touchend handlers or ghost events appear. See `docs/COMPONENTS.md` for the full pitfall table.
- **TouchAction evaluated at touchstart:** Changing `touchAction` mid-touch has no effect on the current touch sequence.
- **iOS scroll freeze:** After calling `preventDefault()` during a drag, jiggle `scrollRef.scrollTop ± 1` on touchend to unlock UIScrollView.
- **Infinite scroll snap:** The 3-slide carousel re-centers with a visible snap. The untried fix is `flushSync(() => setActiveDate(...))` in `handleInfScroll` before setting `scrollLeft`. See `docs/COMPONENTS.md`.
- **Cloud `.env` required:** Server reads `.env` at startup. Without it, it will not start. Copy `cloud/.env.dev` as a template.

## What NOT to touch (without explicit instruction)

- `web/src/lib/crypto.ts` and `cryptoV2.ts` — encryption is load-bearing; any change can silently corrupt user data.
- `cloud/internal/store/sqlite.go` DDL — schema migrations must be backward compatible.
- `web/src/app/layout.tsx` PWA metadata — `apple-mobile-web-app-capable` and `viewport-fit=cover` are required for iOS home-screen mode.
- `web/public/manifest.json` — PWA install manifest.

## Commit style

```
<type>(<scope>): <short imperative description>

Types: feat, fix, refactor, docs, chore, style
Scope: web, cloud, tracker, docs (optional but helpful)

Examples:
  fix(web): clear evDrag before calling onEventUpdate
  docs: update ARCHITECTURE.md to reflect SQLite data layer
  chore: remove committed build artifacts from web/
```
