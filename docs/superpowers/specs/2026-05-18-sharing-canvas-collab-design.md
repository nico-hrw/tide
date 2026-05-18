# Design Spec: Canvas Fixes, Sharing Fixes & Folder/Note Collaboration

**Date:** 2026-05-18  
**Status:** Approved

---

## 1. Scope

This spec covers:
1. Bug fixes for the Canvas (Leinwand) feature
2. Bug fixes for Calendar layout
3. Bug fixes for note and event sharing (frontend state)
4. New feature: Folder sharing (snapshot & live)
5. New feature: Real-time collaborative note editing (Yjs CRDT)
6. Seamless real-time directory updates via SSE

---

## 2. Bug Fixes

### 2.1 Canvas — Click-to-Type

**Problem:** Clicking on an empty area of the canvas does nothing; no text input is possible.

**Fix:** Add a click handler to the empty canvas surface in `CanvasNoteEditor.tsx`. When the user clicks on a position that does not hit an existing `CanvasNoteItem`, a new `CanvasTextItem` is created at the click coordinates (corrected for current pan offset and zoom scale) and immediately placed into edit/focus mode (autofocus). The existing edit-mode logic in `CanvasNoteItem.tsx` is reused.

### 2.2 Canvas — Image Upload Creates Two Encrypted Files

**Problem:** Inserting an image into a canvas note creates two unintended "Locked Note (Decrypting...)" entries in the file list.

**Fix:** Investigate `useCanvasImageUpload.ts`. The hook likely calls `POST /api/v1/files` twice (once for file metadata creation, once for blob upload) or calls a wrong endpoint that triggers a note creation. The correct flow is:
1. Generate a fresh AES-GCM DEK for the image blob
2. Encrypt the image blob client-side
3. `POST /api/v1/files` with `type: 'blob'` (or attach directly to the canvas file) — **once**
4. `POST /api/v1/files/{id}/upload` with the encrypted blob
5. Store the resulting blob file ID + wrapped DEK in the canvas item data

No new note-type file should be created. The blob file must be created with `parent_id` set to the canvas note's file ID and `type: 'blob'` so it does not appear as a standalone file in the directory listing.

### 2.3 Canvas Icon Color

**Problem:** Canvas notes display a teal `Layout` icon in the sidebar instead of the grey used by all other file types.

**Fix:** In `Sidebar.tsx`, find the icon rendering for `type === 'canvas'` and replace the teal color class with the standard grey icon class used for notes/folders.

### 2.4 Calendar — Button Overlap with Profile Avatar

**Problem:** The "Schedule Themes" and "Bulk Schedule Events" buttons in `CalendarView.tsx` overlap the user's profile avatar.

**Fix:** Adjust the flex layout / add `margin-left` or `gap` to the button group so that the buttons sit clearly to the left of the avatar with sufficient spacing. No functional change.

### 2.5 Note Sharing — No Immediate Directory Update

**Problem:** After sharing a note the recipient must reload the page for the file to appear in their sidebar.

**Fix:** Two-part fix:
- **Sender side:** After a successful `POST /api/v1/files/{fileId}/share`, optimistically update the local store — call `fetchDirectory()` or insert the metadata entry directly into `metadataCache`.
- **Recipient side:** The SSE stream (see Section 5) delivers a `file_shared` event; the frontend handler inserts the file into the sidebar immediately without reload.

### 2.6 Event Sharing — Investigation & Fix

**Problem:** Sharing calendar events works worse than notes; exact failure mode unknown.

**Investigation steps:**
1. Trace `onEventShare` callback in `CalendarView.tsx` / `EventPopover.tsx`
2. Confirm the event file ID passed to `ShareModal` is the correct UUID (not a display ID)
3. Confirm `shareLogic.ts` handles `type: 'event'` files the same as notes
4. Confirm the success path triggers a store update (same fix as 2.5)

---

## 3. Folder Sharing — New Feature

### 3.1 Share Types

| Type | Behaviour |
|---|---|
| **Snapshot (Aktueller Zustand)** | All files in the folder are copied to the recipient's account (via existing copy/share mechanism). One-time operation. Recipient owns their copies independently. |
| **Live** | Recipient gets ongoing access to the folder and its contents. New files added are auto-shared. Deleted/moved files lose recipient access. No copy — recipient accesses owner's originals. |

### 3.2 Permissions

A default permission level is set at folder level: `view`, `edit`, or `share`. This applies to all files in the folder. Individual files can have their permission overridden via the existing per-file share controls. For live sharing, new files inherit the folder's default permission.

### 3.3 Server-Side Changes (New Endpoints)

```
POST   /api/v1/folders/{folderId}/share
       Body: { recipient_user_id, permission, share_type: 'live'|'snapshot' }
       → For snapshot: triggers the copy flow for all current files
       → For live: stores sharing record + shares all current files (no copy)

GET    /api/v1/folders/{folderId}/sharing
       → Returns list of { user_id, permission, share_type } records

DELETE /api/v1/folders/{folderId}/sharing/{userId}
       → Revokes live access; server removes recipient's access_keys from all files in folder

PATCH  /api/v1/folders/{folderId}/sharing/{userId}
       → Update permission for an existing live-share recipient
```

The server stores folder sharing records as metadata only (no crypto). It does not have access to any DEKs.

**Auto-revocation:** When a file is deleted or moved out of a live-shared folder, the server automatically removes the recipient's `access_keys` entry for that file.

### 3.4 Client-Side — Snapshot Flow

1. User opens ShareModal on a folder, selects "Aktueller Zustand"
2. Client fetches all files in folder recursively (`GET /api/v1/files?parent_id={folderId}`, repeat for subfolders)
3. For each file: unwrap DEK with owner's private key → rewrap with recipient's public key → `POST /api/v1/files/{fileId}/copy`
4. Modal shows inline progress bar ("3 / 12 Dateien...")
5. On completion: modal closes, SSE delivers `file_shared` events to recipient

### 3.5 Client-Side — Live Sharing Setup Flow

1. User selects "Live" in ShareModal
2. `POST /api/v1/folders/{folderId}/share` with `share_type: 'live'`
3. Same as snapshot but without copy: share all currently existing files recursively (including subfolders) — use `POST /api/v1/files/{fileId}/share` instead of `/copy`
4. Folder sharing record stored on server
5. Recipient's client receives `folder_shared` SSE event → folder appears in sidebar immediately

### 3.6 Client-Side — New File in Live-Shared Folder

After `createNote`, `createCanvasNote`, or any file creation in a folder:
1. Client calls `GET /api/v1/folders/{parentId}/sharing`
2. If any live-sharing records exist: for each recipient, wrap new file's DEK + `POST /api/v1/files/{newFileId}/share`
3. SSE delivers `file_shared` to each recipient → file appears in their sidebar immediately

This check is lightweight (one GET, cached) and only runs when the parent folder has sharing records.

### 3.7 UI

**ShareModal extension:**
- When target is a folder: show radio group "Aktueller Zustand / Live" above the contact selector
- Below: permission selector (Ansehen / Bearbeiten / Teilen) — applies to all files
- Progress bar for snapshot operations

**Sidebar indicator:**
- Live-shared folders display a small `Users` icon (Lucide) next to the folder name, same pattern as shared files

**Manage sharing:**
- Folder context menu: "Teilen verwalten" → list of current recipients with permission label and "Entfernen" button per entry
- Removing a recipient calls `DELETE /api/v1/folders/{folderId}/sharing/{userId}`

---

## 4. Real-Time Collaborative Note Editing

### 4.1 Stack

- **CRDT:** [Yjs](https://github.com/yjs/yjs)
- **Editor integration:** `@tiptap/extension-collaboration` + `@tiptap/extension-collaboration-cursor`
- **P2P transport (primary):** `y-webrtc` — direct browser-to-browser via WebRTC (DTLS-encrypted). Server only handles signaling (offer/answer exchange), not document content.
- **Server relay (fallback):** `y-websocket` — encrypted Yjs ops relayed through server when WebRTC fails (NAT, corporate firewalls). Server sees only opaque encrypted binary, not note content.

### 4.2 Security

- All Yjs document updates are encrypted with the note's AES-GCM DEK before transmission
- WebRTC transport adds its own DTLS layer on top → double-encrypted in transit
- Server never sees plaintext regardless of transport layer
- No additional security risk compared to the existing share-and-save model

### 4.3 Sync Behaviour

| Setting | Behaviour |
|---|---|
| Default | Every Yjs op sent immediately (character-by-character) |
| Throttled | Ops debounced at configurable interval (e.g. 2000ms) |

The throttle is a per-user setting (configurable in app settings), not per-document. The CRDT correctly merges ops regardless of arrival order or timing, so mixing throttled and unthrottled clients is safe.

### 4.4 Cursor Awareness

Yjs Awareness protocol broadcasts cursor position + user name/color to all connected peers. This enables live colored cursors (like Google Docs) at no extra cost. Enabled by default when `@tiptap/extension-collaboration-cursor` is loaded.

### 4.5 Session Lifecycle

- Yjs session starts when a shared-editable note is opened
- `y-webrtc` uses the note's `fileId` as the room name for peer discovery (via signaling server)
- On close: Yjs doc is destroyed; final state is saved via the normal encrypted save flow
- Offline edits: Yjs persists local ops in IndexedDB (`y-indexeddb`); on reconnect ops are merged automatically

---

## 5. Seamless Real-Time Directory Updates (SSE)

The existing SSE connection is extended with new event types. No reload is ever required.

| Event | Payload | Frontend Action |
|---|---|---|
| `file_shared` | `{ fileId, metadata }` | Insert file into sidebar at correct parent |
| `folder_shared` | `{ folderId, contents[] }` | Insert folder + contents into sidebar |
| `file_updated` | `{ fileId }` | If file open and not actively edited: reload content |
| `file_access_revoked` | `{ fileId }` | Remove from sidebar; close if open |
| `folder_access_revoked` | `{ folderId }` | Remove folder + contents from sidebar |

All metadata payloads are encrypted (existing pattern). The client decrypts and inserts into `metadataCache` + Zustand store directly.

---

## 6. Out of Scope

- Conflict resolution beyond Last-Write-Wins for non-Yjs saves
- Public/anonymous folder sharing (no auth)
- Folder-level encryption key (each file keeps its own DEK)
- Version history for collaborative edits
