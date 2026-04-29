# Sharing & Access Control — Design Spec

**Status:** Draft for review
**Date:** 2026-04-28
**Scope:** Feature A. Real-time collaborative editing (Yjs/CRDT) is **out of V1 scope** and gets its own follow-up spec.

## Problem

Tide is end-to-end encrypted but has no usable sharing flow. The backend has `ShareFile`, `AcceptShare`, and `file_share_request`/`event_share` message types, but the UI does not surface them — users cannot share, accept, or revoke. There is also no permission model: a share is binary (accepted or not), with no view/edit distinction. Finally, sharing is invisible in the messenger where users actually communicate.

## Goals (V1)

1. Owner can share a note or event with another tide user from the sidebar context menu, picking a permission level (`view`, `edit`, `share`).
2. Recipient sees the share immediately in a sidebar folder "Geteilt mit mir" (status: pending) AND as a card in the chat with the sender.
3. Recipient can `Open`, `Clone`, or `Decline` directly from the chat card.
4. Owner can list all shares for a file in a management modal and revoke individual recipients or change their permission level.
5. Recipient can always clone — clone is a separate file with its own DEK, optionally remaining linked to the original for pull-updates.
6. Public read-only links: owner can generate a tokenized URL anyone can open without a tide account.
7. Concurrent edits are last-write-wins (existing behavior), but the editor shows a clear "Lukas is currently editing" badge so users can avoid stomping each other.

## Non-Goals (V1)

- Real-time collaborative editing (CRDT). Tracked as separate V2 spec.
- Granular per-block / per-field permissions.
- Permission expiration / time-limited shares.
- Audit log of accesses ("who viewed when").
- Inviting non-tide users (only public read-only link enables external access).

## Architecture Overview

```
                  ┌────────── Backend ──────────┐
                  │  files.go ShareFile()        │ ← already exists, add `permission` field
                  │  files.go RevokeShare()      │ ← already exists, expose to UI
                  │  files.go UpdateSharePerms() │ ← new
                  │  files.go GenerateLink()     │ ← new (public read-only)
                  │  files.go ResolveLink()      │ ← new (token → file)
                  │  messages.go file_share msg  │ ← already exists
                  └──────────────────────────────┘
                                ▲
                                │ REST / SSE
                                │
   ┌────────── Frontend ───────────────────────────────┐
   │  ShareModal (existing, extend with permission UI) │
   │  ShareManagementModal (new)                       │
   │  ChatShareCard (new)                              │
   │  PublicLinkPanel (new in ShareModal)              │
   │  Sidebar "Geteilt mit mir" folder (existing       │
   │    share_status="pending"|"accepted" → folder UI) │
   │  EditingIndicator (new in editor header)          │
   │  /api/v1/files/public/[token] route (new)         │
   └────────────────────────────────────────────────────┘
```

---

## Components

### 1. Permission Model

Three levels, stored as a single string field per share:

| Level | Read | Write | Re-share | Clone |
|---|---|---|---|---|
| `view`  | ✓ | ✗ | ✗ | ✓ |
| `edit`  | ✓ | ✓ | ✗ | ✓ |
| `share` | ✓ | ✓ | ✓ | ✓ |

**Always-clone:** every recipient can clone regardless of level. The clone is a separate file with a freshly generated DEK; the cloner becomes its owner.

Backend stores the permission in `file_shares.permission` (new column, defaults to `"view"`). Backend enforces it on every PUT/PATCH path:

- `view` → `403` on write endpoints (`UpdateFile`, `UploadFile`)
- `edit` → write allowed, but `403` on `ShareFile`
- `share` → all allowed except deletion (only owner can delete)
- Owner has implicit full access including delete + revoke

### 2. Share Initiation Flow

**Entry point:** sidebar right-click (existing context menu) on a note or event → "Teilen mit…" → opens `ShareModal`.

**ShareModal v2** (extends existing component):
- Recipient input: search by username/email (existing search infrastructure)
- Permission radio: `Nur ansehen` / `Bearbeiten` / `Bearbeiten + Teilen`
- "Teilen"-Button → calls `POST /api/v1/files/{id}/share` with `{ recipient_user_id, permission, secured_meta }` where `secured_meta` is the recipient's wrapped DEK
- Public Link section (collapsible): "Öffentlichen Link erstellen" → calls `POST /api/v1/files/{id}/public-link` → returns URL + Copy-Button. Below: list of active links with revoke buttons.
- "Bereits geteilt mit"-Liste am Ende (read-only preview + link to ShareManagementModal)

**Send chat card alongside:** when share succeeds, automatically post a `file_share_request` message to the recipient via existing messages.go endpoint with payload:

```json
{
  "type": "file_share_request",
  "file_id": "...",
  "title": "...",         // public meta or "Untitled"
  "icon": "note" | "event",
  "permission": "view",
  "preview": "first 120 chars...", // optional, plain text
  "event_meta": { "start": "...", "end": "..." } // only for events
}
```

### 3. Chat Share Card

New component `ChatShareCard.tsx` rendered inline in `ChatPanel.tsx` whenever a message has `content.type === "file_share_request"`:

```
┌─────────────────────────────────────────────┐
│ 📝  Quartalsplanung                          │
│      [Berechtigung: Bearbeiten]              │
│      "Q3 Goals - finalize before sprint…"   │
│                                              │
│  [ Öffnen ]  [ Klonen ]  [ Ablehnen ]       │
└─────────────────────────────────────────────┘
```

- **Öffnen** → `accept` API call if pending → switch to file tab
- **Klonen** → `clone` API call → resulting file appears in own sidebar
- **Ablehnen** → `decline` API call → server-side: removes share, posts ack message

Card is rendered for both sender and recipient; sender sees a slightly different state (no action buttons, just "Mit Lukas geteilt"). For events, the preview is replaced with date/time.

### 4. "Geteilt mit mir" Sidebar Folder

The Sidebar already groups files by parent_id. Introduce a synthetic folder at the top of the file list:

- **Folder ID:** virtual, not in DB. Sidebar component computes it.
- **Inclusion rule:** any file where `share_status === "pending"` OR `share_status === "accepted"` AND owner !== myId.
- **Visual:** folder icon, badge with count of pending items (e.g., "Geteilt mit mir (2 neu)").
- **Pending items** show a small dot indicator and an "accept/decline" inline action in the row.
- **Accepted items** behave like normal files (clickable, openable).

This needs no backend change — share rows already exist in the DB, the API already returns them with `share_status`. We just expose them in the sidebar UI.

### 5. Share Management Modal

Reachable via sidebar context menu → "Shares verwalten..." (only on files I own).

```
┌──────────────────────────────────────────────────┐
│  Shares von "Quartalsplanung"             [X]    │
├──────────────────────────────────────────────────┤
│  Lukas Heller       [Bearbeiten ▾]      🗑       │
│  Anna Wegner        [Nur ansehen ▾]     🗑       │
│  Tim Krüger         [Bearbeiten + Teilen ▾]  🗑  │
│                                                   │
│  + Person hinzufügen                              │
├──────────────────────────────────────────────────┤
│  Öffentliche Links:                               │
│  https://tide.app/p/aBc123…   [Kopieren] [🗑]    │
│  + Neuen Link erstellen                           │
└──────────────────────────────────────────────────┘
```

API calls:
- Permission change: `PATCH /api/v1/files/{id}/shares/{userId}` `{ permission }`
- Revoke: `DELETE /api/v1/files/{id}/shares/{userId}`
- Add: same flow as initial share

### 6. Linked Clone with Pull

When recipient clicks "Klonen":

- New file created in recipient's space, `parent_id = null` (root) or recipient's selected location
- Fresh DEK generated, content re-encrypted with new DEK and recipient's RSA public key
- New row in DB carries a soft pointer: `cloned_from_file_id` (new column) → original's UUID
- Recipient becomes owner of the clone. Original owner has no access to the clone.

**Pull updates:**
- When the original is updated AND I have a clone of it AND `pull_enabled === true`, an SSE `clone_pull_available` event fires for me.
- A small "Updates verfügbar" badge appears on the cloned file in sidebar.
- Click → modal "Original wurde am DD.MM. um HH:mm geändert. Übernehmen? [Ja] [Nein] [Verbindung trennen]"
- "Ja" → server fetches original (recipient must still have at least `view` access on original — this is a normal share check), re-encrypts with clone's DEK, replaces clone content. New `last_pulled_at`.
- "Verbindung trennen" → `cloned_from_file_id` set to null. Clone is now standalone, no more pull notifications.

**Original deletion:** if original is deleted, all its clones get `cloned_from_file_id = null` automatically. Clones survive standalone. (Already implemented via FK SET NULL or via app-level cleanup.)

**Pull toggle in clone settings:** in the file context menu of a clone, "Updates automatisch erhalten" toggle (`pull_enabled`). Defaults to true on creation.

### 7. Public Read-Only Links

New table `public_links`:

```sql
CREATE TABLE public_links (
    token TEXT PRIMARY KEY,        -- 22-char URL-safe random
    file_id TEXT NOT NULL,
    file_dek_wrapped BYTEA,        -- DEK wrapped with a public-link symmetric key
    created_at TIMESTAMP,
    revoked_at TIMESTAMP NULL
);
```

Key insight for E2EE: public links can't be private. To make content readable without a tide account, we wrap the DEK with a key embedded in the URL fragment (after `#`). Server never sees this key — fragment is client-only.

**Generation:**
1. Client generates ephemeral 256-bit symmetric key K.
2. Client wraps file's DEK with K → `wrapped_dek`.
3. Client `POST /api/v1/files/{id}/public-link` with `{ wrapped_dek }`. Server stores it, returns `token`.
4. Final URL: `https://tide.app/p/{token}#{base64(K)}`

**Resolution (anonymous viewer):**
1. Browser opens `https://tide.app/p/{token}` — Next.js page reads URL.
2. JS reads `window.location.hash.slice(1)` to get K.
3. JS calls `GET /api/v1/public-link/{token}` → returns `{ wrapped_dek, file_metadata, content_ciphertext }`.
4. JS unwraps DEK with K, decrypts content, renders read-only.
5. No editing, no commenting, no auth.

**Security considerations:**
- Token + key pair gives view access. Anyone with URL can read.
- Server logs token-resolution events with IP for abuse detection (no content access leaks).
- Owner can revoke; revoked-state means server returns 410 Gone before content is sent.
- Public URLs do **not** appear in any cleartext store of the server — only `wrapped_dek` is stored, which is useless without K.

**Out of scope V1:** password-protected public links, expiration dates. (Trivial extension later.)

### 8. Concurrent Edit Indicator (V1 — non-CRDT)

Until CRDT lands, last-write-wins remains the conflict resolution. To minimize damage:

- New SSE event `file_editing_started { file_id, user_id, user_display_name }` broadcasted when someone opens a file with `edit` or higher permission. Heartbeat every 30s. Stop signal when the editor unmounts.
- Frontend collects active editors per file in a Zustand slice.
- In editor header, render a chip "📝 Lukas bearbeitet gerade…" if anyone other than self is active.
- Chip is **non-blocking** — user can still edit, but is informed.
- On save, server's last-write-wins remains. Existing localStorage backup catches lost edits (already implemented).

**Future (separate spec):** replace this with Yjs/y-prosemirror for true real-time merge.

---

## Backend Changes

### Schema

```sql
-- File shares: add permission column
ALTER TABLE file_shares ADD COLUMN permission TEXT NOT NULL DEFAULT 'view'
    CHECK(permission IN ('view', 'edit', 'share'));

-- Files: add clone-tracking and pull settings
ALTER TABLE files ADD COLUMN cloned_from_file_id TEXT NULL REFERENCES files(id) ON DELETE SET NULL;
ALTER TABLE files ADD COLUMN pull_enabled BOOLEAN NOT NULL DEFAULT 1;
ALTER TABLE files ADD COLUMN last_pulled_at TIMESTAMP NULL;

-- Public links table
CREATE TABLE public_links (
    token TEXT PRIMARY KEY,
    file_id TEXT NOT NULL REFERENCES files(id) ON DELETE CASCADE,
    wrapped_dek BLOB NOT NULL,
    created_at TIMESTAMP NOT NULL,
    revoked_at TIMESTAMP NULL,
    created_by TEXT NOT NULL REFERENCES users(id)
);
CREATE INDEX idx_public_links_file ON public_links(file_id);
```

### New / Updated Endpoints

| Method | Path | Purpose |
|---|---|---|
| POST   | `/api/v1/files/{id}/share`                | Share with user. **Add `permission` to body.** |
| PATCH  | `/api/v1/files/{id}/shares/{userId}`      | Change permission. (new) |
| DELETE | `/api/v1/files/{id}/shares/{userId}`      | Revoke. (existing as RemoveShare; expose) |
| GET    | `/api/v1/files/{id}/shares`               | List shares of a file (owner only). (new) |
| POST   | `/api/v1/files/{id}/clone`                | Clone with pull link. (new) |
| POST   | `/api/v1/files/{id}/pull`                 | Pull latest from original. (new) |
| PATCH  | `/api/v1/files/{id}/pull-enabled`         | Toggle pull. (new) |
| POST   | `/api/v1/files/{id}/public-link`          | Create. (new) |
| DELETE | `/api/v1/public-link/{token}`             | Revoke. (new) |
| GET    | `/api/v1/public-link/{token}`             | Resolve (no auth). (new) |

### SSE Events

- `share_received` — recipient gets when a share lands
- `share_revoked` — recipient gets when access is revoked
- `share_permission_changed` — both parties
- `clone_pull_available` — clone-owner gets when original updates
- `file_editing_started` / `file_editing_stopped` — broadcast to all current viewers/editors of a file

---

## Data Model Changes

Frontend Zustand additions:

```ts
// In useDataStore
sharedWithMeFolder: { id: 'shared-with-me', virtual: true }, // computed, not persisted
activeEditors: Map<fileId, Array<{ userId, displayName, lastHeartbeat }>>,  // ephemeral
publicLinks: Map<fileId, Array<{ token, url, createdAt, revokedAt }>>,
```

`DataItem` (file) gets new optional fields:
- `permission?: 'view' | 'edit' | 'share' | 'owner'`
- `cloned_from_file_id?: string | null`
- `pull_enabled?: boolean`
- `pull_available?: boolean`  (computed from SSE events)

---

## UI File Plan

| File | New / Modified |
|---|---|
| `web/src/components/ShareModal.tsx`             | extend with permission radio + public link panel |
| `web/src/components/ShareManagementModal.tsx`   | NEW |
| `web/src/components/Chat/ChatShareCard.tsx`     | NEW |
| `web/src/components/Chat/ChatPanel.tsx`         | render share cards inline |
| `web/src/components/Layout/Sidebar.tsx`         | add "Geteilt mit mir" virtual folder, badges |
| `web/src/components/Editor.tsx`                 | add EditingIndicator chip in header |
| `web/src/components/EditingIndicator.tsx`       | NEW |
| `web/src/app/p/[token]/page.tsx`                | NEW (public-link viewer) |
| `web/src/lib/publicLink.ts`                     | NEW (key wrap/unwrap helpers) |
| `web/src/store/useDataStore.ts`                 | new fields + SSE handlers |

---

## Out of Scope (V1)

- Yjs/CRDT real-time collaboration
- Granular per-block permissions
- Public link password / expiration
- Audit log
- Inviting non-tide users by email
- Change history / version diff between owner and clone
- Bidirectional clone sync (clone → original push)

## Future Considerations / Backlog

- **V2 Spec: Real-time collaborative editing.** Yjs + y-prosemirror integration. Each Yjs update encrypted with file DEK before transit. WebSocket relay (extend existing SSE broker or new channel).
- **Smart pull conflict resolution** for clones: when both original and clone have edits, show 3-way diff before pull.
- **Public link analytics:** view counts, geolocation, abuse detection.
- **Permission templates:** "Alle Mitglieder von Team X können bearbeiten."
- **External invitation flow:** non-tide user receives email with magic link to create account + see share.

## Testing Strategy

- **Backend integration tests** for each new endpoint (permission enforcement matrix, revoke, public-link resolve before/after revoke).
- **Frontend unit tests** for `publicLink.ts` (wrap/unwrap roundtrip).
- **Component tests** for `ChatShareCard` (rendering, action callbacks).
- **End-to-end manual test plan**:
  - Owner shares note with `view` to Lukas; Lukas opens, attempts to edit → blocked with toast.
  - Owner upgrades Lukas to `edit`; Lukas refreshes, can now edit.
  - Owner revokes; Lukas sees file disappear from sidebar with toast "Zugriff entfernt".
  - Lukas clones; Lukas's clone shows "Updates erhalten" badge after owner edits.
  - Owner deletes original → Lukas's clone survives, badge shows "Original gelöscht — eigenständig".
  - Owner generates public link → opens in incognito → can read, no edit UI.
  - Two users edit same file → second user sees "Lukas bearbeitet gerade…" chip.

## Open Questions

(none at design time — all clarified during brainstorming)
