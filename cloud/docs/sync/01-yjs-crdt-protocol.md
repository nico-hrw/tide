# Yjs CRDT Real-Time Collaboration Protocol Specification

## 1. Executive Summary & Architecture Overview

Tide employs a hybrid, end-to-end encrypted (E2EE) Conflict-free Replicated Data Type (CRDT) architecture powered by [Yjs](https://github.com/yjs/yjs) and WebSockets. The cloud server acts as an **authenticated, untrusted zero-knowledge relay and write-ahead log (WAL) persistence coordinator**. The server never possesses plaintext document contents or decryption keys; instead, it enforces authorization, allocates strict monotonically increasing sequence numbers, buffers changes in SQLite, and fans out binary updates and ephemeral awareness states to active peers in real time.

### Core Architectural Tenets
1. **Zero-Knowledge Server:** All document CRDT updates and snapshots are encrypted client-side using AES-GCM-256 before transmission.
2. **Deterministic Sequence Allocation:** The server orders updates sequentially using an append-only WAL (`yjs_wal`), guaranteeing total causal ordering across concurrent writers.
3. **Hybrid Snapshot + WAL Bootstrapping:** Clients initialize via a consolidated document snapshot combined with subsequent delta updates, preventing unbounded memory and bandwidth bloat.
4. **Immediate Ephemeral Presence:** Awareness states (cursors, selections, active collaborators) are multiplexed over the same WebSocket connection with in-memory relaying and zero database writes.
5. **Role-Based Real-Time Enforcement:** Live role downgrades or share revocations trigger instant WebSocket session termination and cryptographic key rotation.

---

## 2. Protocol Foundation & Binary Framing

All real-time communication occurs over WebSockets at the path `/api/ws/notes/{fileID}` (aliased under `/api/files/{fileID}/ws`).

### 2.1 Binary Frame Structure

To minimize framing overhead and enforce cryptographic integrity, client and server exchange binary frames conforming to Tide Contract 1.1. Every encrypted frame has a minimum size of **33 bytes** (`MinEncryptedFrameLen`):

```
+-------------------+---------------------+--------------------+------------------------+
| Message Type (1B) | Key Epoch (4B, BE)  | IV / Nonce (12B)   | AES-GCM Ciphertext +   |
|                   |                     |                    | Auth Tag (>= 16B)      |
+-------------------+---------------------+--------------------+------------------------+
```

| Field | Size (Bytes) | Offset | Description |
| :--- | :--- | :--- | :--- |
| `MessageType` | 1 | 0 | Frame identifier enum (`0x01`, `0x02`, `0x03`). |
| `KeyEpoch` | 4 | 1–4 | Big-endian 32-bit unsigned integer representing the document encryption key version. |
| `IV` | 12 | 5–16 | Cryptographically secure random initialization vector (AES-GCM nonce). |
| `Ciphertext + Tag` | Variable (>= 16) | 17+ | Encrypted Yjs payload or awareness record + 16-byte GCM authentication tag. |

### 2.2 Frame Types

```go
const (
    FrameTypeCRDTUpdate byte = 0x01 // Encrypted incremental Yjs update
    FrameTypeAwareness  byte = 0x02 // Encrypted ephemeral awareness/presence update
    FrameTypeControl    byte = 0x03 // Unencrypted JSON control frame
    MinEncryptedFrameLen     = 1 + 4 + 12 + 16 // 33 Bytes
)
```

1. **`0x01` (`FrameTypeCRDTUpdate`):**
   - Contains an encrypted binary Yjs update block produced by `Y.encodeStateAsUpdate(ydoc)`.
   - Subject to strict permission verification (`canWrite`).
   - Appended atomically to SQLite `yjs_wal`.
   - Broadcasted to all other room participants.
2. **`0x02` (`FrameTypeAwareness`):**
   - Contains encrypted awareness protocol bytes (user profile, cursor positions, selections).
   - Relayed strictly in-memory.
   - Never written to disk or the WAL.
   - Permitted for all connected clients with read permissions (including `view`).
3. **`0x03` (`FrameTypeControl`):**
   - Framing: Byte `0x03` followed immediately by a UTF-8 encoded JSON payload:
     `[0x03, '{"action":"COMPACT_REQUEST"}']`
   - Used for administrative, synchronization, and coordination signals between server and client.

---

## 3. Client Connection Handshake & Authentication

### 3.1 Connection Initiation
Clients establish a WebSocket connection to:
```
GET /api/ws/notes/{fileID}?yClientId={yClientId}&token={jwt}
```
Query parameters:
- `fileID`: UUID of the target file/note.
- `yClientId`: Unsigned 32-bit integer representing the local Yjs Client ID. Used for cursor identity and tracking.
- `token`: (Optional if cookie is supplied) Bearer JWT.

### 3.2 Cross-Site WebSocket Hijacking (CSWSH) Mitigation
The server validates the `Origin` header via `checkOrigin` (SEC-08):
- Empty `Origin` headers are permitted (native desktop apps, tests, CLI clients).
- Same-host origins (`http(s)://{Host}`) are permitted.
- Configured local development origins (`localhost:3000`, `127.0.0.1:5173`, etc.) are permitted.
- Production hostnames (`go-tide.app`, `www.go-tide.app`, `hrw.rocks`, `track.hrw.rocks`) and environment overrides (`APP_URL`, `ALLOWED_ORIGINS`) are validated.
- Any unauthorized origin is rejected immediately before upgrade with HTTP 403.

### 3.3 Authentication & Authorization
Authentication resolves the `userID` using three sequential strategies:
1. Context value `user_id` (if injected by upstream middleware).
2. HTTP `Authorization: Bearer <token>` header.
3. Query parameter `?token=<jwt>`.
4. HTTP cookie `tide_session`.

The JWT is cryptographically verified against `JWT_SECRET` using HMAC-SHA256. If invalid or missing, the handshake aborts with `HTTP 401 Unauthorized`.

### 3.4 File Permission Verification
The server invokes `h.Store.GetAccessibleFile(ctx, fileID, userID)` to establish permission:
```go
func canRead(perm string) bool {
    return perm == "owner" || perm == "share" || perm == "edit" || perm == "view"
}

func canWrite(perm string) bool {
    return perm == "owner" || perm == "share" || perm == "edit"
}
```
- If the file does not exist or `canRead(permission)` is false: Handshake aborts with `HTTP 403 Forbidden`.
- The connection is upgraded to WebSocket protocol via `upgrader.Upgrade`.
- A `Client` object is instantiated and registered in `GlobalHub.rooms[fileID]`.
- Two concurrent goroutines are spawned per client: `writePump()` and `readPump(h)`.

---

## 4. Synchronization Lifecycle (Sync Step 1 & Sync Step 2)

Tide implements a two-stage initialization protocol combining an optimized HTTP REST bootstrap with WebSocket incremental updates.

```
+-------------+                 +---------------+                 +--------------+
|   Client    |                 |  Tide Server  |                 | SQLite Store |
+-------------+                 +---------------+                 +--------------+
       |                                |                                |
       | 1. GET /api/files/{id}/crdt-state                              |
       |------------------------------->|                                |
       |                                | Query snapshot + WAL (seq > n) |
       |                                |------------------------------->|
       |                                |<-------------------------------|
       | 2. 200 OK (Snapshot + WAL deltas)                               |
       |<-------------------------------|                                |
       | (Decrypt & apply to local YDoc)|                                |
       |                                |                                |
       | 3. WS Connect (/api/ws/notes)  |                                |
       |------------------------------->|                                |
       | 4. WS Upgrade Success          |                                |
       |<-------------------------------|                                |
       |                                |                                |
       | 5. Binary Frame: SyncStep1     |                                |
       |    (Local State Vector)        |                                |
       |------------------------------->| (Broadcast to peers in room)   |
       |                                |-------------------------------> (Peers)
       |                                |                                |
       | 6. Binary Frame: SyncStep2     |                                |
       |    (Missing deltas from peers) |                                |
       |<-------------------------------|                                |
       |                                |                                |
```

### 4.1 Step 1: Initial Bootstrap via REST (`GetCRDTState`)
Before or upon connecting via WebSocket, the client fetches the baseline state:
```http
GET /api/files/{fileID}/crdt-state HTTP/1.1
Authorization: Bearer <token>
```

The server returns:
```json
{
  "snapshot_seq_id": 1450,
  "key_epoch": 2,
  "snapshot_iv": "dGVzdGl2MTIzNDU2",
  "snapshot_ciphertext": "ZXhhbXBsZWNpcGhlcnRleHQ...",
  "wal": [
    {
      "seq_id": 1451,
      "key_epoch": 2,
      "iv": "aXYxMjM0NTY3ODk=",
      "ciphertext": "Y3JkdHVwZGF0ZTE..."
    }
  ]
}
```
1. **Snapshot Decryption:** The client decrypts `snapshot_ciphertext` using the file's Document Encryption Key (DEK) corresponding to `key_epoch`.
2. **Snapshot Ingestion:** The decrypted bytes are applied to the local `Y.Doc` using `Y.applyUpdate(ydoc, snapshotBytes)`.
3. **Sequential WAL Replay:** The client iterates through `wal` entries in strictly ascending order by `seq_id`, decrypting each and applying them: `Y.applyUpdate(ydoc, walUpdateBytes)`.
4. **State Marker:** The client sets its local sync baseline to `last_synced_seq_id = max(seq_id)`.

### 4.2 Step 2: WebSocket State Vector Exchange (`SyncStep1` & `SyncStep2`)
Once connected to the WebSocket room:
1. **SyncStep1:** The client encodes its state vector: `vector = Y.encodeStateVector(ydoc)`.
   - The vector is encrypted using current `KeyEpoch` and wrapped in `FrameTypeCRDTUpdate` (`0x01`).
   - The server broadcasts the frame to all other room participants.
2. **SyncStep2:** Active peers in the room compute missing updates using `Y.encodeStateAsUpdate(ydoc, peerVector)`.
   - The peer encrypts this delta and emits it back over WebSocket (`0x01`).
   - The server logs it in the WAL and relays it to the requesting client.
   - The requesting client applies missing updates, achieving full convergence.

---

## 5. Write-Ahead Log (`yjs_wal`) Storage Engine

The server persists all CRDT mutations to ensure that offline clients or newly joining peers can reconstruct identical document states without requiring persistent active server memory.

### 5.1 Database Schema
```sql
CREATE TABLE IF NOT EXISTS yjs_wal (
    seq_id INTEGER PRIMARY KEY AUTOINCREMENT,
    file_id TEXT NOT NULL,
    key_epoch INTEGER NOT NULL,
    iv BLOB NOT NULL,
    ciphertext BLOB NOT NULL,
    created_at INTEGER NOT NULL,
    FOREIGN KEY(file_id) REFERENCES files(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_yjs_wal_file_seq ON yjs_wal(file_id, seq_id);
```

### 5.2 Atomic Sequence Allocation
When a client submits a `FrameTypeCRDTUpdate` frame:
1. The server checks write permissions (`canWrite`). If the client is a viewer (`view`), the frame is dropped and logged as a security violation (BUG-01).
2. The server unpacks the binary header:
   ```go
   keyEpoch := binary.BigEndian.Uint32(payload[1:5])
   iv := payload[5:17]
   ciphertext := payload[17:]
   ```
3. The server executes `AppendYjsWAL`:
   ```sql
   INSERT INTO yjs_wal (file_id, key_epoch, iv, ciphertext, created_at)
   VALUES (?, ?, ?, ?, ?);
   ```
   SQLite's single-writer architecture and `AUTOINCREMENT` guarantees strict monotonic sequence numbering (`seq_id`).
4. The server relays the unaltered binary frame to all other clients in the room:
   ```go
   c.hub.broadcast(c, payload)
   ```
5. **SSE Pulse:** The server dispatches throttled Server-Sent Events (`NOTE_ACTIVITY_PULSE` and `NOTE_WAL_APPENDED`) to alert dashboard file listings of live changes (max 1 event per 5 seconds per file).

---

## 6. Awareness & Ephemeral Presence Subsystem

The awareness subsystem synchronizes ephemeral state that must not be permanently stored in the document CRDT history:
- Cursor coordinates (line, column, anchor, head).
- Text/block selections.
- User presence metadata (display name, avatar, cursor accent color, active device).

### 6.1 Awareness Framing & Relaying
- Frame Type: `0x02` (`FrameTypeAwareness`).
- Min Length: 33 bytes (encrypted with file DEK).
- Permissions: All authenticated room participants may transmit and receive awareness frames, including users with read-only (`view`) access.
- In-Memory Pipeline:
  ```go
  case FrameTypeAwareness: // 0x02
      if len(payload) < MinEncryptedFrameLen {
          continue
      }
      c.hub.broadcast(c, payload)
  ```
- Awareness frames bypass SQLite entirely. They are dropped if a receiving client's write buffer is full, preventing slow clients from stalling the room.

### 6.2 Zero-Latency Ghost Cursor Removal (`PEER_LEFT`)
When a WebSocket client closes, disconnects abruptly, or encounters a network partition:
1. `readPump` terminates and enters its `defer` cleanup block.
2. The client is deregistered from `GlobalHub.rooms[fileID]`.
3. The server immediately broadcasts an unencrypted `FrameTypeControl` frame:
   ```json
   {
     "action": "PEER_LEFT",
     "yClientId": 182948274
   }
   ```
4. All surviving clients handle `PEER_LEFT` by removing `yClientId` from their local Yjs `Awareness` instance in 0ms, eliminating lingering ghost cursors without waiting for timeout expiration.

---

## 7. Snapshot Compaction Protocol

As collaborative edits occur, the WAL accumulates entries. Unbounded WAL growth degrades bootstrap performance and increases database storage. Tide utilizes client-driven snapshot compaction.

### 7.1 Compaction Triggers
1. **Server Modulo Trigger:** During WAL insertion, if `seqID > 0 && seqID % 50 == 0`, the server transmits a control message to the active writer:
   ```json
   {
     "action": "COMPACT_REQUEST"
   }
   ```
2. **Document Close / Explicit Save:** When an editor unloads or saves locally.
3. **Key Rotation:** Upon revoking access from a collaborator.

### 7.2 Client-Side Compaction Procedure
Upon receiving `COMPACT_REQUEST`:
1. The client captures its local `Y.Doc` state:
   ```typescript
   const snapshotBytes = Y.encodeStateAsUpdate(ydoc);
   ```
2. The client encrypts `snapshotBytes` using AES-GCM-256 with the active DEK (`KeyEpoch`), producing `snapshot_iv` and `snapshot_ciphertext`.
3. The client sends an HTTP request:
   ```http
   POST /api/files/{fileID}/compact HTTP/1.1
   Content-Type: application/json
   Authorization: Bearer <token>

   {
     "up_to_seq_id": 1500,
     "key_epoch": 2,
     "snapshot_iv": "<base64>",
     "snapshot_ciphertext": "<base64>"
   }
   ```

### 7.3 Atomic Server Compaction Transaction
The server executes `CompactYjsWAL` inside a single SQLite transaction:
```sql
BEGIN IMMEDIATE;

-- 1. Update file record with consolidated snapshot
UPDATE files
SET snapshot_seq_id = ?, key_epoch = ?, snapshot_iv = ?, content = ?, updated_at = ?
WHERE id = ?;

-- 2. Purge superseded WAL entries up to up_to_seq_id
DELETE FROM yjs_wal
WHERE file_id = ? AND seq_id <= ?;

COMMIT;
```
Any subsequent WAL entries with `seq_id > 1500` remain intact. New clients fetching `/crdt-state` now receive the consolidated snapshot at sequence 1500 plus only the minimal remaining delta entries.

---

## 8. Cryptographic Key Rotation & Real-Time Eviction

When an owner removes a user's access, forward secrecy must be preserved. Revoked users must not be capable of reading future updates.

```
Owner Client                    Tide Server                 Evicted Client
     |                               |                             |
     | 1. POST /revoke-and-rotate    |                             |
     |------------------------------>|                             |
     |                               | 2. SQLite Transaction:      |
     |                               |    - Delete share           |
     |                               |    - Increment key_epoch    |
     |                               |    - Purge entire yjs_wal   |
     |                               |                             |
     |                               | 3. Send Control: REVOKED    |
     |                               |---------------------------->|
     |                               |                             | (Disconnect & close)
     |                               | 4. Send Control: KEY_ROTATED|
     |<------------------------------| (to remaining peers)        |
```

### 8.1 Eviction Sequence (`RevokeShareAndRotateKey`)
1. **Client Action:** The owner generates a new DEK (`key_epoch + 1`), re-encrypts the document snapshot, wraps the new DEK for remaining authorized collaborators (`access_keys`), and calls:
   ```http
   POST /api/files/{fileID}/revoke-and-rotate
   ```
2. **Database Mutation:**
   - Deletes record in `file_shares` for `targetUserID`.
   - Updates `files.key_epoch = newKeyEpoch`, `files.access_keys`, `files.snapshot_iv`, `files.content`.
   - Purges all historical rows in `yjs_wal` for this `file_id`.
3. **Live WebSocket Eviction:**
   - Calls `Hub.EnforcePermissionChange(fileID, targetUserID, "revoked")`:
     - Dispatches `{"action":"REVOKED"}` control frame to targeted client.
     - Closes the WebSocket connection immediately.
     - Emits `PEER_LEFT` to room peers.
4. **Key Rotation Notification:**
   - Calls `Hub.BroadcastKeyRotation(fileID, newKeyEpoch)`:
     - Dispatches `{"action":"KEY_ROTATED", "keyEpoch": newKeyEpoch}` control frame to remaining connected clients.
     - Surviving clients fetch their newly wrapped DEK from the server and continue syncing with the new epoch.

---

## 9. Reconnection & Network Disruption Handling

### 9.1 Connection Health Monitoring
- **Ping / Pong Tickers:**
  - Server sends WebSocket `Ping` every 15 seconds (`writePump`).
  - Read deadline is set to 30 seconds (`readPump`).
  - When client answers with `Pong`, read deadline extends by 30 seconds.
  - If a ping is dropped or network stalls, `readPump` times out and initiates clean teardown.

### 9.2 Fast Reconnection Without Full Reload
When a client reconnects after temporary network loss:
1. Re-establishes WebSocket: `/api/ws/notes/{fileID}?yClientId=...`.
2. Queries missing WAL rows via `GET /api/files/{fileID}/crdt-state`.
3. The server selects only delta updates where `seq_id > client_last_seq_id`:
   ```sql
   SELECT seq_id, key_epoch, iv, ciphertext
   FROM yjs_wal
   WHERE file_id = ? AND seq_id > ?
   ORDER BY seq_id ASC;
   ```
4. Client decrypts and applies missing deltas without re-downloading or re-parsing the complete snapshot.
5. Client broadcasts its updated Yjs state vector (`SyncStep1`) over the WebSocket to synchronize any concurrent edits made by peers during the disconnect window.

---

## 10. Complete Protocol Flow Diagram

```mermaid
sequenceDiagram
    autonumber
    actor A as Editor Alice (Writer)
    actor B as Editor Bob (Writer)
    participant S as Tide Cloud Server
    participant DB as SQLite (Store + WAL)

    Note over A,DB: Phase 1: Authentication & Connection Handshake
    A->>S: GET /api/files/{id}/crdt-state
    S->>DB: Query Snapshot + WAL
    DB-->>S: Return Snapshot (seq: 100) + 0 WAL
    S-->>A: 200 OK (Snapshot seq 100)
    A->>A: Decrypt & initialize Y.Doc

    A->>S: WS Connect /api/ws/notes/{id}?yClientId=101&token=JWT
    S->>S: checkOrigin() & Verify JWT
    S->>DB: GetAccessibleFile (Check permission: edit)
    DB-->>S: Permission: "edit" (canRead=true, canWrite=true)
    S-->>A: 101 Switching Protocols
    S->>S: Add Alice to Hub Room {id}

    B->>S: WS Connect /api/ws/notes/{id}?yClientId=202&token=JWT
    S-->>B: 101 Switching Protocols
    S->>S: Add Bob to Hub Room {id}

    Note over A,B: Phase 2: Ephemeral Awareness Synchronization
    A->>S: Binary 0x02 [Awareness: Alice Cursor (Ln 5, Col 12)]
    S-->>B: Relay Binary 0x02 (No DB writes)
    B->>B: Render Alice Cursor on screen

    Note over A,DB: Phase 3: Collaborative CRDT Mutation
    A->>A: User types "Hello World" -> Y.Doc updates
    A->>S: Binary 0x01 [KeyEpoch: 1 | IV | Encrypted CRDT Update]
    S->>S: Verify canWrite(Alice) == true
    S->>DB: AppendYjsWAL(file_id, epoch: 1, iv, ciphertext)
    DB-->>S: Returns seq_id: 101
    par Real-Time Fanout
        S-->>B: Broadcast Binary 0x01 (Unaltered encrypted frame)
        B->>B: Decrypt & Y.applyUpdate()
    and SSE Notification
        S->>S: Trigger SSE Pulse (NOTE_WAL_APPENDED)
    end

    Note over A,DB: Phase 4: Snapshot Compaction (at seq_id % 50 == 0)
    S-->>A: Binary 0x03 {"action": "COMPACT_REQUEST"}
    A->>A: ydoc.encodeStateAsUpdate() & Encrypt with DEK
    A->>S: POST /api/files/{id}/compact {up_to_seq_id: 150, snapshot}
    S->>DB: BEGIN TX; UPDATE files SET content=snapshot; DELETE FROM yjs_wal WHERE seq_id <= 150; COMMIT;
    DB-->>S: Success
    S-->>A: 200 OK

    Note over B,S: Phase 5: Peer Disconnect
    B->>S: Connection Closes (TCP FIN / Network Drop)
    S->>S: Remove Bob from Hub Room {id}
    S-->>A: Binary 0x03 {"action": "PEER_LEFT", "yClientId": 202}
    A->>A: Remove Bob Cursor immediately (0ms ghost clearance)
```
