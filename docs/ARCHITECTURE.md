# Tide Architecture

## Core Philosophy
**Minimalist | Modular | Local-First | End-to-End Encrypted**

## Tech Stack
*   **Web (Instance 1)**: Next.js. Handles UI, Client-Side Encryption, Local State, Plugin Management.
*   **Cloud (Instance 2)**: Go (Golang). Handles REST/gRPC API, WebSocket (Chat), Object Storage Auth, Token Management.
*   **Database**: PostgreSQL (Relations/Metadata) + Redis (Hot Data/Chat Queue).

## Storage Concept: Detached Metadata
We do *not* wrap files in containers.
1.  **Blob**: Encrypted file content in Object Storage (or local FS).
2.  **Meta**: Metadata stored in PostgreSQL.

## Modules

### 1. Editor (GoodNotes-like)
*   **Tech**: Block-based (Tiptap/ProseMirror).
*   **Logic**: "Everything is a block".
*   **Storage**: Client-side encrypted JSON.

### 2. Networking (Notion-like)
*   **Linking**: UUID-based references, not paths.
*   **Relation**: Cloud maintains `links` table (SourceID -> TargetID) for efficient backlink queries.

### 3. Time Management (Google-Calendar-like)
*   **Data**: Events are standard objects with specific metadata.
*   **Interop**: Go service handles .ics parsing/generation.
*   **Views**: Week/Month views driven by "Public Metadata".

### 4. Modular UI (Obsidian-like)
*   **Extensions**: Features (Chat, Calendar) are loadable extensions.
*   **Lazy Loading**: Disabled modules are never loaded.

### 5. Communication (WhatsApp-like)
*   **Protocol**: WebSockets via Go.
*   **Security**: Double Ratchet or similar E2EE. Server stores only encrypted blobs for recipients.

### 6. Social (Instagram-like)
*   **Identity**: Public Keys.
*   **Access**: Granular ACL ("User A reads File X").
*   **Feed**: Updates stream based on shared/public note changes.

### 7. Synchronization (OneDrive-like)
*   **Hybrid**: Web Mode (API-driven) vs App Mode (Local Sync).
*   **Offline**: "Detached Metadata" replicated locally (e.g., SQLite).

## Security Strategy: Split-Brain Metadata

### Public Meta (Unencrypted on Server)
*   **Purpose**: Sorting, Filtering, Calendar Views, Permissions.
*   **Fields**: `UUID`, `OwnerID`, `CreatedAt/UpdatedAt`, `Type`, `TimeStart` (Date/Time only), `Size`, `SharingStatus`.

### Secured Meta (Encrypted on Server)
*   **Purpose**: Privacy. Only readable by Client with key.
*   **Fields**: `Title`, `Tags`, `PreviewText`, `Thumbnail`, `ExactDescription`, `FileEncryptionKey`.

## Authentication
*   **Method**: Magic Link or Passkey.
*   **Key Derivation**: Login unlocks private key in browser (derived from password or Secure Storage).
