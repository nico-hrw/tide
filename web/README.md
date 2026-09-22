# TIDE — Web

Next.js 16 PWA. The main user-facing application.

## Commands

```bash
npm install          # install dependencies
npm run dev          # dev server → http://localhost:3000
npm run build        # production build
npm run lint         # ESLint (557 pre-existing errors are grandfathered)
npx tsc --noEmit     # typecheck (must be clean)
```

## Key files

| File | Role |
|------|------|
| `src/app/page.tsx` | Root orchestrator — mounts all views |
| `src/lib/designTokens.ts` | **All visual constants** — never hardcode colors/radii |
| `src/lib/api.ts` | `apiFetch` — **all HTTP calls go here** |
| `src/lib/crypto.ts` | Encryption v1 (AES-GCM, base64 helpers) |
| `src/lib/cryptoV2.ts` | Encryption v2 (DEK wrap/unwrap, RSA-OAEP) |
| `src/lib/bundleImportExport.ts` | TIDE Bundle & Markdown import/export engine |
| `src/store/useDataStore.ts` | Global Zustand store — notes, events, tasks |

## Structure

```
src/
  app/          ← Next.js App Router pages
  components/   ← React components by domain
  lib/          ← Pure utilities (crypto, api, tokens, bundles)
  store/        ← Zustand stores
  hooks/        ← Custom React hooks
  types/        ← Shared TypeScript types
```

## Documentation

- [`docs/COMPONENTS.md`](docs/COMPONENTS.md) — Component register, design system tokens, and mobile touch pitfalls
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — Next.js architecture, Zustand state store, and client-side encryption
- [`docs/NOTE_SPECIFICATION.md`](docs/NOTE_SPECIFICATION.md) — Note element specification, TipTap AST, and `.tide.json` schema
- [`docs/CONVENTIONS.md`](docs/CONVENTIONS.md) — Coding rules, TypeScript guidelines, and styling conventions
