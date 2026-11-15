# Cross-Layer Parity & Interoperability Specification

## 1. Interoperability Philosophy

Tide is architected around an uncompromising **Zero-Knowledge (ZK)** privacy posture coupled with high-performance multi-platform synchronization. The system comprises three tier implementations:
- **`web/`**: TypeScript (Next.js 14, Zustand, Web Crypto API, TipTap/ProseMirror, Yjs CRDT).
- **`cloud/`**: Go (`cmd/server`, `internal/api`, `internal/store`, `internal/db`, modernc.org/sqlite, gorilla/websocket).
- **`core/`**: Rust (`tide-core`, `tide-daemon`, Rusqlite / SQLCipher, Tokio, `aes-gcm`, `rsa`, `sha2`, `pbkdf2`).

### Core Invariants
1. **Zero-Knowledge Trust Boundary**: The server (`cloud/`) must never possess plaintext user content, unencrypted Data Encryption Keys (DEKs), or raw user master PINs/passwords. All indexing for query dispatch must rely on deterministic Blind Indexing (HMAC-SHA256) evaluated on client devices using salts/peppers negotiated out-of-band or held in zero-knowledge vaults.
2. **Byte-Level Determinism**: Encrypted envelopes, binary frame layouts, and cryptographic derivation trees must be identical whether processed by the Web Crypto API, Go's standard `crypto/cipher`, or Rust's `ring`/`RustCrypto` primitives.
3. **Lossless Synchronization**: Sync states, document revisions, CRDT updates, and database records must round-trip across any layer without data mutation, semantic drift, or subtle timestamp/casing inconsistencies.

---

## 2. Cryptographic Parity Matrix

All layers must adhere strictly to identical cryptographic algorithms, parameter sizes, framing structures, and byte encodings.

| Cryptographic Primitive | Web (`web/src/lib/`) | Cloud (`cloud/internal/`) | Core (`core/crates/tide-core/`) | Exact Parameter Specification |
| :--- | :--- | :--- | :--- | :--- |
| **KEK Derivation (PBKDF2)** | `PBKDF2` via Web Crypto API | `pbkdf2.Key` (golang.org/x/crypto) | `pbkdf2::pbkdf2_hmac` (`sha2::Sha256`) | **Digest**: SHA-256<br>**Iterations**: 600,000 (Default), 100,000 (Legacy fallback)<br>**Key Length**: 32 bytes (256-bit)<br>**Salt**: 16–32 random bytes (Base64) |
| **Symmetric Encryption (AEAD)** | `AES-GCM` via Web Crypto API | `aes.NewCipher` + `cipher.NewGCM` | `aes_gcm::Aes256Gcm` | **Key**: 256 bits (32 bytes)<br>**IV / Nonce**: 96 bits (12 bytes)<br>**Auth Tag**: 128 bits (16 bytes, appended to ciphertext)<br>**AAD**: Enforced on frames & snapshots |
| **Asymmetric Vault (RSA-OAEP)** | `RSA-OAEP` via Web Crypto API | `rsa.DecryptOAEP` (`crypto/rsa`) | `rsa::Oaep::new::<sha2::Sha256>()` | **Modulus**: 4096-bit<br>**Public Exponent**: 65537 ($F_4$)<br>**Hash Function**: SHA-256<br>**Label**: Empty / Nil |
| **Blind Indexing (Lookup Hash)** | HMAC-SHA256 via Web Crypto | HMAC-SHA256 (`crypto/hmac`) | `hmac::Hmac<sha2::Sha256>` | **Algorithm**: HMAC-SHA256<br>**Key**: Server/User Pepper (Base64 decoded)<br>**Input**: Normalized lowercased identifier (e.g., trimmed lowercase email) |

### 2.1 Binary Framing Parity (`e2eeFraming.ts`)

For real-time WebSocket collaborative editing and encrypted document storage, binary frames and CRDT snapshots conform to the wire protocols detailed below.

#### WebSocket Collaborative Frame Layout
Every collaborative WebSocket frame carries authenticated header metadata in big-endian byte order:

```
+---------------+------------------------+-------------------+-----------------------------------+
| msgType (1 B) |   keyEpoch (4 Bytes)   |    IV (12 Bytes)  |       Ciphertext + Tag (N Bytes)   |
|  0x01 | 0x02  | uint32 Big-Endian (BE) |  AES-GCM Nonce    |      AES-256-GCM + 16B Tag         |
+---------------+------------------------+-------------------+-----------------------------------+
 0               1                        5                   17                                  17+N
```

- **Header Offset**:
  - Offset `0` (1 byte): `msgType` (`0x01` = CRDT update, `0x02` = Awareness/presence, `0x03` = Control message).
  - Offset `1..5` (4 bytes): `keyEpoch` (unsigned 32-bit integer, Big-Endian).
  - Offset `5..17` (12 bytes): AES-256-GCM initialization vector (`IV`).
  - Offset `17..end`: Ciphertext with appended 16-byte authentication tag.
- **Minimum Length**: 17 bytes (header) + 16 bytes (authentication tag) = **33 bytes** (`MIN_ENCRYPTED_FRAME_LEN`). Any frame below 33 bytes must be rejected immediately.
- **Associated Authenticated Data (AAD)**:
  ```
  AAD = UTF8Encode(fileId) || msgType (1 byte) || keyEpoch (4 bytes uint32 Big-Endian)
  ```
  All implementations (TypeScript, Go WebSocket forwarder, Rust daemon) must verify or supply this exact byte sequence as AEAD Additional Data.

#### CRDT Document Snapshot Wire Format
Document snapshots persisted to SQLite blobs or object storage use the magic header format:

```
+--------------------+--------------+------------------------+---------------+--------------------------+
| Magic 'TSNP' (4 B) | Version (1B) |   keyEpoch (4 Bytes)   | IV (12 Bytes) | Ciphertext + Tag (N B)   |
| 0x54 0x53 0x4E 0x50|     0x01     | uint32 Big-Endian (BE) | AES-GCM Nonce |   AES-256-GCM + 16B Tag  |
+--------------------+--------------+------------------------+---------------+--------------------------+
 0                    4              5                        9               21                         21+N
```

- **Magic Prefix**: `0x54, 0x53, 0x4E, 0x50` (`"TSNP"` in ASCII).
- **Snapshot Version**: `0x01`.
- **AAD for Snapshots**:
  ```
  AAD = UTF8Encode(fileId) || 0x01 (FRAME_TYPE_CRDT) || keyEpoch (4 bytes uint32 Big-Endian)
  ```

---

## 3. Data Model Parity Matrix

The system exchanges records across HTTP REST endpoints, WebSocket control events, SQLite databases, and local file caches.

### 3.1 Entity Mapping Table

| Logical Field | TypeScript (`web/src/store/`) | Go Struct (`cloud/internal/db/`) | Rust Struct (`core/crates/tide-core/db.rs`) | Wire/DB Type | Notes / Nullable Semantics |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Note Identifier** | `id: string` | `ID string` (`db:"id"`) | `id: String` | `TEXT` / UUIDv4 | Primary key, never null |
| **Note Title** | `title: string` | `Title string` (`db:"title"`) | `title: String` | `TEXT` | Default `""` |
| **Folder / Parent** | `parentId?: string \| null` | `ParentID *string` (`db:"parent_id"`) | `folder_id: Option<String>` | `TEXT` (NULL) | `null` or `undefined` maps to `None`/`nil` |
| **Note Body** | `content?: string` | `Content []byte` (`db:"content"`) | `content_markdown: String` | `BLOB` / `TEXT` | Markdown or ProseMirror JSON string |
| **Encryption Flag** | `isEncrypted?: boolean` | Derived from `SecuredMeta != nil` | `is_encrypted: bool` | `INTEGER` | `0` or `1` boolean representation |
| **Note Tags** | `tags?: string[]` | `Tags []string` / JSON array | `tags: Option<String>` | `TEXT` | Comma-delimited or JSON string array |
| **Updated Timestamp** | `updatedAt?: string` (ISO 8601) | `UpdatedAt time.Time` | `updated_at: i64` | `INTEGER` / `TEXT` | Unix epoch milliseconds in SQLite (`i64`) |
| **Sync Timestamp** | `syncedAt?: string` | `SyncedAt *time.Time` | `synced_at: Option<i64>` | `INTEGER` (NULL) | Nullable Unix epoch milliseconds |
| **Local Dirty Status** | In-memory sync queue | N/A (Server is authoritative) | `dirty: bool` | `INTEGER` | Client-only synchronization flag |
| **Todo / Task ID** | `TaskItem.id: string` | `Todo.ID: string` | `LocalTodo.id: String` | `TEXT` / UUIDv4 | Consistent ID across all layers |
| **Task Completion** | `isCompleted: boolean` | `IsCompleted bool` | `completed: bool` | `INTEGER` | `0` = pending, `1` = done |
| **Task Due Date** | `dueDate?: string` | `DueDate string` | `due_date: Option<String>` | `TEXT` (ISO Date) | Format `YYYY-MM-DD` |
| **Task Priority** | `'low'\|'medium'\|'high'` | `Priority string` | `priority: Option<String>` | `TEXT` | Enum values: `"low"`, `"medium"`, `"high"` |

### 3.2 JSON Serialization & Formatting Conventions
1. **Case Standard**:
   - **External REST API / WebSocket JSON payloads**: Use strict `camelCase` for client-facing TypeScript compatibility (or `snake_case` in Go models explicitly tagged with `json:"field_name"`).
   - **Go JSON Marshaling**: Struct tags define wire properties (`json:"parent_id,omitempty"`).
   - **Rust Serde**: Configured with `#[serde(rename_all = "camelCase")]` or explicit rename tags where wire parity demands camelCase.
2. **Nullable & Optional Semantics**:
   - Missing fields, `null`, and `undefined` must deserialize into `None` in Rust, `nil` pointers in Go, and `undefined | null` in TypeScript.
   - `omitempty` in Go and `skip_serializing_if = "Option::is_none"` in Rust must omit non-existent values rather than sending empty strings or zeroes.
3. **Timestamps**:
   - **REST APIs**: Strict ISO 8601 UTC representation: `YYYY-MM-DDTHH:mm:ssZ` (e.g., `2026-11-15T20:30:00Z`).
   - **Local SQLite / Daemon IPC**: Unix millisecond epoch integers (`i64`) for high-speed indexing, zero-alloc comparison, and local sorting.

---

## 4. TipTap / ProseMirror AST Schema Parity

Rich text editing in Tide is powered by ProseMirror / TipTap node trees. While `web/` renders these via React DOM, `core/` and `cloud/` must parse, traverse, and sanitize the AST.

### 4.1 Document Schema Definition

A standard Tide document AST adheres to the following structural JSON tree:

```json
{
  "type": "doc",
  "content": [
    {
      "type": "paragraph",
      "attrs": {
        "blockId": "blk-9f8e7d6c-5b4a",
        "textAlign": "left"
      },
      "content": [
        {
          "type": "text",
          "text": "Meeting notes for "
        },
        {
          "type": "mention",
          "attrs": {
            "id": "usr-1234-5678",
            "label": "Alice Smith",
            "mentionType": "user"
          }
        },
        {
          "type": "text",
          "text": " discussing "
        },
        {
          "type": "noteLink",
          "attrs": {
            "noteId": "not-abcd-ef01",
            "title": "Architecture Roadmap"
          }
        }
      ]
    }
  ]
}
```

### 4.2 Block ID Conventions
- Every top-level node (paragraphs, headings, code blocks, task lists, tables) must include a unique `blockId` attribute in its `attrs` map:
  ```json
  "attrs": {
    "blockId": "blk-<uuidv4-or-nanoid>"
  }
  ```
- **Preservation Rule**: Block IDs are immutable anchors used for comments, deep links, and selective CRDT block diffs. Transformations in Go or Rust must never strip or regenerate existing `blockId` attributes.

### 4.3 Node Conventions & Mention Representations

| Node Type | Required Attributes | Content Model | Wire Semantics & Serialization |
| :--- | :--- | :--- | :--- |
| **`paragraph`** | `blockId: string` (optional: `textAlign`) | `inline*` | Standard text container |
| **`heading`** | `blockId: string`, `level: 1..6` | `inline*` | Markdown equivalent: `#` to `######` |
| **`taskItem`** | `blockId: string`, `checked: boolean` | `paragraph inline*` | Interactive todo checkbox |
| **`mention`** | `id: string`, `label: string`, `mentionType: "user" \| "event" \| "date"` | Empty (atomic leaf) | Renders as inline chip pill |
| **`noteLink`** | `noteId: string`, `title: string` | Empty (atomic leaf) | Bi-directional wiki-link reference |
| **`codeBlock`** | `blockId: string`, `language?: string` | `text*` | Syntax-highlighted code container |

---

## 5. Automated Parity Testing Strategy

To eliminate regressions across runtime boundaries, Tide employs deterministic cross-platform test vectors executed against all three tiers during CI.

```
+-------------------------------------------------------------+
|             Central Test Vectors (test_vectors.json)        |
+-------------------------------------------------------------+
        |                              |              |
        v                              v              v
+---------------+             +---------------+ +---------------+
|  TypeScript   |             |     Go        | |     Rust      |
|  (Web Vitest) |             | (Cloud GoTest)| | (Core Cargo)  |
+---------------+             +---------------+ +---------------+
```

### 5.1 Cryptographic Test Vectors
Golden test fixtures (`vectors/crypto_vectors.json`) assert deterministic parity across:
1. **PBKDF2 Key Derivation**:
   - Input: PIN `"948201"`, Salt `base64("dGlkZS1zYWx0LTE2Ynl0")`, Iterations `600000`.
   - Expected Output: Exact 32-byte hex-encoded KEK.
2. **AES-256-GCM Frame Encryption & Decryption**:
   - Input: Fixed DEK (32 bytes), IV (12 bytes), AAD (`fileId="doc-123"`, `msgType=0x01`, `keyEpoch=4`), Plaintext.
   - Expected Output: Exact ciphertext with authentication tag.
3. **Binary Frame Deserializer**:
   - Encoded 33+ byte slice parsed by Web (`e2eeFraming.ts`), Go (`e2ee.go`), and Rust (`crypto.rs`). All must yield identical `msgType`, `keyEpoch`, and decrypted payload.

### 5.2 Serialization & Schema Test Vectors
1. **TipTap Document Round-Trip**:
   - Parse complex JSON AST containing mentions, note links, and block IDs in Rust (`tide-core`).
   - Extract plain markdown and wiki-links (`NoteLink` table).
   - Verify extracted links match the reference entities produced by TipTap extensions in TypeScript.
2. **Database Sync State Vectors**:
   - SQLite migrations verified against identical schema fixtures in Go (`sqlite.go`) and Rust (`db.rs`).
   - Test synchronization conflict resolution: Last-Write-Wins (LWW) resolution based on `(updated_at, device_id)` tuple.

### 5.3 CI Verification Command Pipeline
Every PR must execute the complete cross-layer test suite:

```bash
# 1. Web verification (Typecheck & Unit Tests)
cd web && npx tsc --noEmit && npm run test

# 2. Cloud verification (Go Unit Tests & Static Analysis)
cd cloud && go test -v ./... && go vet ./...

# 3. Core verification (Rust Cargo Tests & Clippy)
cd core && cargo test --workspace && cargo clippy --workspace -- -D warnings
```
