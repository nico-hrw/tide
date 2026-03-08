# SYSTEM FLOW

## 1. High-Level Architecture
Tide is divided into a **Web (Next.js)** frontend and a **Cloud (Go)** backend, emphasizing End-to-End Encryption (E2E).

- **Web (Next.js):** Handles the UI, client-side encryption/decryption, and local state management (via Zustand). It connects to the Cloud via REST API calls and (if applicable) WebSocket subscriptions.
- **Cloud (Go):** Operates securely, storing mostly encrypted blobs and blind indexes. It acts as a zero-knowledge data store where possible. Built using SQLite and lightweight HTTP routers.

## 2. API Structure
The Cloud exposes REST endpoints structured under `/api/...` for modular resources:
- `/api/auth`: Registration, Login, Key Exchange.
- `/api/files`: Node-based file operations (creation, updates, deletes).
- `/api/shares`: Sharing mechanisms and link generation.

## 3. Encryption Flow (E2E)
Tide uses a secure encryption pipeline for user data:
1. **Registration:**
   - Client generates an encryption key, a public/private key-pair, and a PIN hash.
   - PII (email, username, phone) are securely hashed into "blind indexes" for backend lookups.
   - The private key is encrypted via the PIN in the frontend, and the public key is sent to the Cloud.
2. **Data Storage (Zero-Knowledge):**
   - When saving a note/file, the frontend symmetrically encrypts the content and the metadata (`secured_meta`).
   - The Cloud only receives non-sensitive `public_meta`, `id`, `parent_id`, and `blind_index` data. The `secured_meta` remains a black box to the server.
3. **Sharing:**
   - To share a file with User B, User A requests User B's `public_key`.
   - User A encrypts the symmetric file key using User B's public key and writes it to `file_shares`.
   - User B retrieves the share, decrypts the symmetric key using their private key, and accesses the file.

## 4. WebSocket Connections (Real-Time)
*(Where enabled)* WebSockets are used to stream real-time events to connected clients, allowing instantaneous sync of newly shared files, messages, or collaborative block updates. All payload content transferred over sockets remains E2E encrypted.

## 5. Global Calendar Layout & Drag System
The Calendar view (`CalendarView.tsx`) employs a highly decoupled drag-and-drop architecture to maintain 60fps performance without re-rendering the entire grid on every cursor move:
1. **Event Interception**: Instead of React synthetic `onDrag` events, it uses global `window.addEventListener('mousemove')` and `window.addEventListener('mouseup')` handlers.
2. **State Decoupling**: Visual dragging (`dragState`, `creationDrag`, `resizeDragState`) updates local coordinates. The true `start`/`end` timestamps are only calculated and committed on `mouseup`.
3. **Variable Snapping (Precise Mode)**: 
   - Uses `10-minute` interval blocks by default.
   - Global keystroke listeners (`Alt`, `Shift`) temporarily toggle `isPreciseMode`, switching the computation divisor to `1-minute` blocks.
   - A reactive Time Magnifier floating UI follows the cursor coordinates when Precise Mode is engaged to provide real-time `HH:mm` updates.
4. **DayColumn Reflector**: `DayColumn.tsx` behaves purely as a UI reflector, rendering floating overlay components absolutely positioned based on the parent's `snapInterval` calculations.
