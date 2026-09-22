# TIDE Frontend Architecture (`web/`)

> Architecture, state management, encryption integration, and rendering pipeline for the Next.js 16 PWA.

## 1. Tech Stack

| Layer | Technology | Role |
|-------|------------|------|
| Framework | Next.js 16 (App Router), React 19, TypeScript | Client-rendered PWA, dynamic imports, Turbopack |
| Styling | Vanilla CSS + Tailwind CSS | Layout utilities + design tokens (`DT`) |
| State | Zustand (`store/useDataStore.ts`, `store/useReferenceStore.ts`) | Optimistic CRUD for notes, events, tasks, backlinks |
| Rich Text | TipTap 3 (ProseMirror) | Block-based rich text, mentions, LaTeX math, images |
| Canvas | XYFlow (React Flow) | Infinite whiteboard canvas with sidecar style files |
| Bundles & Formats | `.tide.json` + Markdown (`bundleImportExport.ts`) | Cross-network bundle import/export with reference rewriting |
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
│   ├── Editor.tsx        # TipTap rich text editor (solo & collaborative modes)
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
├── lib/                  # Pure utilities: api.ts, crypto.ts, cryptoV2.ts, designTokens.ts, bundleImportExport.ts
├── store/                # Zustand global stores: useDataStore.ts, useSocialStore.ts, useReferenceStore.ts
└── types/                # Shared TypeScript models (canvas, note, event, sync, bundle)
```

## 3. Key Concepts & Patterns

### State Management & Optimistic Updates
- `useDataStore.ts` owns the active file list, calendar events, search indexes, and active note/tab states.
- Mutative operations (renaming, dragging, creating) perform optimistic UI updates and sync asynchronously via `apiFetch`.
- Metadata caching: Decrypted `secured_meta` is maintained in `metaCache` within `useDataStore` so that files are not redundantly decrypted during scrolling.

### Note Editor Execution Modes (Solo vs. Collaborative)
- **Solo Mode (`isShared=false`)**:
  - Activated for all private user notes.
  - Zero WebSocket connection overhead, zero Yjs document manipulation.
  - TipTap initializes synchronously with clean JSON content via the `content` prop.
  - Full native undo/redo history via TipTap `StarterKit`.
- **Collaborative Mode (`isShared=true`)**:
  - Activated when a note is shared with other collaborators or accessed via shared links.
  - Yjs document pre-seeded with the authoritative database content before connecting to the WebSocket room (`/{fileID}/ws`).
  - Awareness states and live collaboration carets (`CollaborationCaret`) rendered dynamically.
- **Safety Guards**:
  - `isDocEmpty` checks and `userHasTypedRef` prevent accidental empty document overwrites from saving blank states to the backend or local storage.

### Bundle Import & Export Engine (`bundleImportExport.ts`)
- **`.tide.json` Format**: Encapsulates folders, notes, calendar events, and tasks into a portable bundle.
- **Reference Rewriting**: When importing a bundle, new UUIDs are assigned to all items, and references within TipTap documents (`calendarEventMention`, `taskMention`, `referenceMark`, and custom URL schemes) are automatically remapped to the newly generated IDs.
- **Markdown Interoperability**: Bi-directional conversion between Markdown and TipTap ProseMirror AST.

### Lehrseiten & Read-Only Access
- When viewing a note with `permission === 'view'`, the editor activates read-only presentation.
- Title editing is locked to prevent 403 Forbidden write errors.
- Top banner offers one-click **"In eigene Notizen duplizieren"** (clone to user's notes tree) and **"Als Markdown herunterladen"**.

### Client-Side Encryption Integration
1. **Zero-Knowledge Upload**: Content and title/metadata are encrypted using an AES-256-GCM Data Encryption Key (DEK) in the browser before being sent to the Cloud.
2. **Key Storage & Recovery**: The user's RSA private key is protected by a PIN-derived KEK stored in the browser's encrypted vault.
3. **Sharing**: Re-encrypts the file's DEK with the recipient's RSA public key using RSA-OAEP.

### Touch Calendar Performance & Pitfalls
- `MobileWeekGrid.tsx` uses a decoupled DOM overlay for event dragging to avoid React re-renders during high-frequency touchmove events.
- See detailed pitfalls and solutions in [`COMPONENTS.md`](COMPONENTS.md).

## 4. Documentation References
- [`COMPONENTS.md`](COMPONENTS.md) — Component register and mobile touch pitfalls
- [`NOTE_SPECIFICATION.md`](NOTE_SPECIFICATION.md) — Complete TipTap ProseMirror specification & bundle schema
- [`CONVENTIONS.md`](CONVENTIONS.md) — Coding rules, TypeScript guidelines, and styling conventions
