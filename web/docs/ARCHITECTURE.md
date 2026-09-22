# TIDE Frontend Architecture (`web/`)

> Architecture, state management, encryption integration, and rendering pipeline for the Next.js 16 PWA.

## 1. Tech Stack

| Layer | Technology | Role |
|-------|------------|------|
| Framework | Next.js 16 (App Router), React 19, TypeScript | Client-rendered PWA, dynamic imports |
| Styling | Vanilla CSS + Tailwind CSS | Layout utilities + design tokens (`DT`) |
| State | Zustand (`store/useDataStore.ts`) | Optimistic CRUD for notes, events, tasks, tabs |
| Rich Text | TipTap 3 (ProseMirror) | Block-based rich text, mentions, math, images |
| Canvas | XYFlow (React Flow) | Infinite whiteboard canvas with sidecar style files |
| Client Crypto | Web Crypto API (`crypto.ts` & `cryptoV2.ts`) | AES-GCM (DEK) + RSA-OAEP (key wrapping) |
| API Client | `lib/api.ts` (`apiFetch`) | JWT-authenticated HTTP & SSE client |

## 2. Directory Structure

```
web/src/
├── app/                  # Next.js App Router (page.tsx, layout.tsx, auth/, files/, calendar/)
├── components/           # React Components grouped by domain
│   ├── Calendar/         # Desktop week/month views, DayColumn, event modals
│   ├── Canvas/           # XYFlow infinite canvas & card components
│   ├── Chat/             # E2EE chat messages & partner profiles
│   ├── Editor/           # TipTap rich text editor & bubble menu
│   ├── Exams/            # Exam planner extension
│   ├── Finance/          # Finance tracker extension
│   ├── Layout/           # MobileLayout, MobileWeekGrid, Sidebar, TabList, BottomSheet
│   ├── Modals/           # ShareModal, ShareManagementPanel, SettingsModal
│   ├── Profile/          # User avatar & profile editor
│   ├── Security/         # Passkey / PIN vault unlock screens
│   ├── Settings/         # App settings & extension manager
│   ├── Social/           # Contacts & user discovery
│   └── extensions/       # TipTap editor extensions + SmartIsland
├── hooks/                # Custom React hooks (useMediaQuery, etc.)
├── lib/                  # Pure utilities: api.ts, crypto.ts, cryptoV2.ts, designTokens.ts
├── store/                # Zustand global stores: useDataStore.ts, useSocialStore.ts
└── types/                # Shared TypeScript models (canvas, note, event, sync)
```

## 3. Key Concepts & Patterns

### State Management & Optimistic Updates
- `useDataStore.ts` owns the active file list, calendar events, search indexes, and active tab states.
- Mutative operations (renaming, dragging, creating) perform optimistic UI updates and sync asynchronously via `apiFetch`.
- Metadata caching: Decrypted `secured_meta` is maintained in `metaCache` within `useDataStore` so that files are not redundantly decrypted during scrolling.

### Client-Side Encryption Integration
1. **Zero-Knowledge Upload**: Content and title/metadata are encrypted using an AES-256-GCM Data Encryption Key (DEK) in the browser before being sent to the Cloud.
2. **Key Storage & Recovery**: The user's RSA private key is protected by a PIN-derived KEK stored in the browser's encrypted vault.
3. **Sharing**: Re-encrypts the file's DEK with the recipient's RSA public key using RSA-OAEP.

### Touch Calendar Performance & Pitfalls
- `MobileWeekGrid.tsx` uses a decoupled DOM overlay for event dragging to avoid React re-renders during high-frequency touchmove events.
- See detailed pitfalls and solutions in [`COMPONENTS.md`](COMPONENTS.md).

## 4. Coding Conventions
- Refer to [`CONVENTIONS.md`](CONVENTIONS.md) for styling, TypeScript rules, and architectural constraints.
