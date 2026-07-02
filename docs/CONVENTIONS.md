# TIDE Conventions

Rules actually enforced in this codebase. Follow them in all new code.

## File & Directory Layout

```
web/src/
  app/          ← Next.js App Router pages only (no logic)
  components/   ← React components, grouped by domain
  lib/          ← Pure utilities and helpers (no React)
  store/        ← Zustand stores (use* prefix)
  hooks/        ← React hooks (use* prefix)
  types/        ← Shared TypeScript interfaces
```

- Save working files and tests to `src/`, `tests/`, `docs/`, `config/`, or `scripts/`. Never in the root.
- No more than **500 lines per file**. If growing beyond this, flag for extraction.
- Group by domain, not by type (e.g., `components/Calendar/` not `components/modals/CalendarModal`).

## Naming

| Thing | Convention | Example |
|-------|-----------|---------|
| React components | PascalCase | `MobileWeekGrid.tsx` |
| Hooks | camelCase with `use` prefix | `useMediaQuery.ts` |
| Stores | camelCase with `use` prefix | `useDataStore.ts` |
| Lib utilities | camelCase | `apiFetch`, `encryptData` |
| Constants | SCREAMING_SNAKE | `TIME_W`, `DEFAULT_HOUR_H` |
| CSS classes | kebab-case (Tailwind) | `flex-1`, `overflow-hidden` |
| Go packages | lowercase, single word | `api`, `store`, `gcal` |
| Go types | PascalCase | `FileNode`, `UserRecord` |

## TypeScript

- **No `any` in new code.** Use `unknown` and narrow, or define a proper interface.
- Use named exports from lib files; default exports only for React page components.
- Prefer `interface` over `type` for object shapes; `type` for unions/aliases.
- Keep component props interfaces inline in the same file unless shared across 3+ files.

## React Patterns

- All interactive components must have `"use client"` at the top.
- Use `useCallback` for event handlers passed as props; `useMemo` for expensive derivations.
- Use `flushSync` (from `react-dom`) when React state must be synchronous inside native event handlers (e.g., touchend). See `docs/COMPONENTS.md` drag pitfalls.
- Use `dynamic()` with `{ ssr: false }` for heavy client-only components (TipTap editor, canvas).
- Never call `fetch` directly in components — use `apiFetch` from `lib/api.ts`.
- Never hardcode colors, blur values, or border radii — use `designTokens.ts`.

## Commits

```
<type>(<scope>): <short imperative verb phrase>

type:  feat | fix | refactor | docs | chore | style | test
scope: web | cloud | tracker | docs  (optional)
```

Examples:
```
fix(web): clear evDrag with flushSync before calling onEventUpdate
docs: rewrite ARCHITECTURE.md to reflect SQLite data layer
chore: remove committed build artifacts from web/
```

- One logical change per commit.
- Do not commit `.env` files, build artifacts, log files, or `*.tsbuildinfo`.
- Run `npx tsc --noEmit` before committing web changes.

## CSS / Styling

- Tailwind utility classes for layout and spacing.
- Inline `style={{}}` for dynamic values (colors from tokens, computed positions).
- Never mix `border` shorthand with `borderTop`/`borderBottom` on the same element (React warns).
- `touchAction` is evaluated at touchstart; changing it mid-touch has no effect on the current sequence.

## Go

- Use `database/sql` directly; no ORM.
- All DB schema changes go in `sqlite.go:InitDB()` as `CREATE TABLE IF NOT EXISTS` or `ALTER TABLE` statements.
- Read `.env` from the binary's directory first, then fall back to CWD.
- HTTP handlers in `internal/api/`; DB logic in `internal/store/`.

## Documentation

- Update `docs/COMPONENTS.md` whenever a component's API or behavior changes.
- `docs/INDEX.md` is the navigation map — update it when adding files or renaming things.
- Short docs over long docs. Link rather than repeat. Every claim must match the code.
