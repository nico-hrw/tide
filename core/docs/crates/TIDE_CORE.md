# `tide-core` Crate Deep-Dive

**Crate Path:** [`core/crates/tide-core`](file:///C:/Users/nicoh/projects/tide/core/crates/tide-core)  
**Rust Edition:** 2021  
**Version:** `0.1.0`

---

## 1. Crate Purpose

`tide-core` is the foundational, shared domain and infrastructure library within the Tide core workspace. It provides the core abstractions for:
- **Offline-First SQLite Storage:** Fast local persistence, full-text search (FTS5), schema migrations, and sync queuing.
- **Zero-Knowledge End-to-End Encryption (E2EE):** Cryptographic parity with Tide's web client (`cryptoV2.ts`), supporting PBKDF2 key derivation, AES-256-GCM authenticated encryption, and RSA-OAEP private key unwrap operations.
- **Bi-directional Cloud Synchronization Protocol:** An asynchronous HTTP engine communicating with the Tide Go backend (`https://hrw.rocks/api/v1`), performing session orchestration (OTP), file/note synchronization with DEK unwrapping, and task/todo synchronization.

`tide-core` is consumed by downstream crates such as `tide-mcp` (Model Context Protocol server) and CLI interfaces.

---

## 2. Module Architecture

```
tide-core
├── crypto (Zero-knowledge E2EE primitives, KDF, RSA-OAEP, AES-256-GCM)
├── db     (SQLite storage engine, schema, FTS5 virtual tables, triggers, domain entities)
└── sync   (HTTP sync client, Bearer auth, OTP flow, note & todo sync pipelines)
```

### 2.1 `crypto` Module (`src/crypto.rs`)

The `crypto` module implements cryptographic operations that mirror the browser's Web Crypto API (`SubtleCrypto`) implementation used in Tide's frontend (`web/src/lib/cryptoV2.ts`):

- **Key Derivation Function (PBKDF2):**
  - Uses `pbkdf2::pbkdf2_hmac` with `Sha256`.
  - Standard iteration count is `600_000` (`DEFAULT_PBKDF2_ITERATIONS`), with fallback compatibility to legacy `100_000` iterations.
  - Derives a 256-bit Key Encryption Key (KEK) from the user's PIN and salt (or pepper).
- **Authenticated Symmetric Encryption (AES-256-GCM):**
  - Implements 256-bit AES-GCM via the `aes-gcm` crate.
  - Expects a 12-byte initialization vector (nonce) and appends a 16-byte Poly1305/GCM authentication tag (`ciphertext_with_tag`).
  - Strict verification: tampering with ciphertext or tag results in an authentication error.
- **Vault Unlocking & RSA Private Key Recovery:**
  - `unlock_vault`: Parses the JSON envelope `{ salt, iv, ciphertext, iterations? }`.
  - Resolves salt/pepper, derives the KEK, decrypts the ciphertext containing the PKCS#8 DER (or PEM) encoded RSA private key, and parses it into `rsa::RsaPrivateKey`.
- **Document Encryption Key (DEK) Unwrapping:**
  - `unwrap_dek`: Decrypts a 256-bit AES DEK that was encrypted with the user's RSA public key using RSA-OAEP with SHA-256 padding (`rsa::Oaep::new::<sha2::Sha256>()`).
- **Note Content Decryption:**
  - `decrypt_note_content`: Decrypts AES-256-GCM payloads with the unwrapped DEK and 12-byte IV, returning a valid UTF-8 Markdown string.

### 2.2 `db` Module (`src/db.rs`)

The `db` module encapsulates SQLite operations using `rusqlite`:

- **Connection Management:**
  - `Database::open(path)`: Opens a file-backed SQLite database.
  - `Database::in_memory()`: Initializes an ephemeral in-memory database for unit tests and isolated sessions.
  - Configures SQLite pragmas on initialization:
    - `PRAGMA journal_mode = WAL;` (Write-Ahead Logging for high concurrency)
    - `PRAGMA foreign_keys = ON;` (Strict referential integrity)
    - `PRAGMA busy_timeout = 5000;` (5-second timeout for locking contention)
- **Schema & Migrations:**
  - `local_notes`: Stores note metadata, Markdown content, sync timestamps, and `dirty` tracking flag.
  - `fts_notes`: FTS5 external content virtual table referencing `local_notes` (`content='local_notes'`, `content_rowid='rowid'`).
  - Automated triggers keep the FTS5 index in sync with `local_notes`:
    - `local_notes_ai`: After insert trigger.
    - `local_notes_ad`: After delete trigger.
    - `local_notes_au`: After update trigger (deletes old rowid, inserts new rowid).
  - `note_links`: Stores outgoing wikilinks/hyperlinks extracted from notes (`source_note_id`, `url_or_slug`, `target_note_id`, `link_text`).
  - `local_todos`: Stores todo items with title, priority, due date, scheduled date, completed status, tags, and dirty tracking.
  - `sync_queue`: Queue tracking mutations intended for upstream synchronization (`queue_id`, `entity_type`, `entity_id`, `action`, `payload`, `attempts`, `created_at`).
- **Full-Text Search Engine:**
  - `search_notes(query, limit)`: Uses SQLite FTS5 `MATCH` and the `snippet(...)` auxiliary function to locate relevant notes with extracted match fragments. Automatically handles query syntax escaping if unescaped tokens fail.

### 2.3 `sync` Module (`src/sync.rs`)

The `sync` module coordinates upstream communication with the Tide Go server:

- **Session Management:**
  - Stored at `~/.tide/session.json` (`session_file_path()`).
  - Contains authentication token, user ID, user email, custom base URL, encrypted vault JSON, and optional pepper.
  - `save_session` and `load_session` provide persistence across CLI / tool invocations.
- **Authentication Lifecycle:**
  - `request_otp(email)`: Triggers OTP dispatch via `POST /auth/request-otp`.
  - `verify_otp(email, otp)`: Verifies one-time password via `POST /auth/verify-otp`, saving the JWT bearer token, user ID, and encrypted vault payload.
- **Bi-directional Pull & Push Workers:**
  - `sync_notes_and_todos(private_key, db)`:
    1. Fetches `/files?recursive=true` with Bearer auth.
    2. Iterates over note records, extracts `access_keys[user_id].wrapped_key`, unwraps DEK using RSA-OAEP.
    3. Fetches note content (inline or via `/files/{id}/download`), decrypts AES-256-GCM ciphertext, parses Markdown, and upserts into `local_notes` with `dirty = 0`.
    4. Fetches `/tasks` (encrypted RSA-OAEP payloads), decrypts task JSON, and upserts into `local_todos` with `dirty = 0`.
    5. Falls back to `/todos` endpoint if `/tasks` yielded no records.

### 2.4 Domain Models (`models` in `src/db.rs` & `src/sync.rs`)

Domain entities are serialized/deserialized with `serde`:

```rust
// LocalNote
pub struct LocalNote {
    pub id: String,
    pub title: String,
    pub folder_id: Option<String>,
    pub content_markdown: String,
    pub is_encrypted: bool,
    pub tags: Option<String>,
    pub updated_at: i64,
    pub synced_at: Option<i64>,
    pub dirty: bool,
}

// LocalTodo
pub struct LocalTodo {
    pub id: String,
    pub title: String,
    pub description: Option<String>,
    pub status: String,
    pub priority: Option<String>,
    pub due_date: Option<i64>,
    pub scheduled_date: Option<i64>,
    pub tags: Option<String>,
    pub is_completed: bool,
    pub updated_at: i64,
    pub dirty: bool,
}

// NoteLink
pub struct NoteLink {
    pub source_note_id: String,
    pub target_note_id: Option<String>,
    pub link_text: Option<String>,
    pub url_or_slug: String,
}

// NoteSnippet
pub struct NoteSnippet {
    pub id: String,
    pub title: String,
    pub snippet: String,
}

// SyncQueueItem
pub struct SyncQueueItem {
    pub queue_id: Option<i64>,
    pub entity_type: String,
    pub entity_id: String,
    pub action: String,
    pub payload: Option<String>,
    pub attempts: i32,
    pub created_at: i64,
}

// SessionInfo
pub struct SessionInfo {
    pub token: String,
    pub user_id: String,
    pub email: Option<String>,
    pub base_url: Option<String>,
    pub encrypted_vault: Option<String>,
    pub pepper: Option<String>,
}
```

---

## 3. Public API Surface

Root re-exports in `src/lib.rs`:

```rust
pub use db::{Database, LocalNote, LocalTodo, NoteLink, NoteSnippet};
pub use sync::{load_session, save_session, session_file_path, SessionInfo, TideClient};
```

### Module API Catalog

| Module | Item | Signature | Description |
|---|---|---|---|
| `crypto` | `DEFAULT_PBKDF2_ITERATIONS` | `pub const: u32 = 600_000` | Standard PBKDF2 iterations matching cryptoV2 |
| `crypto` | `derive_kek` | `(pin: &str, salt: &[u8], iterations: u32) -> Result<[u8; 32]>` | Derives 256-bit AES key via PBKDF2-HMAC-SHA256 |
| `crypto` | `encrypt_aes_gcm` | `(plaintext: &[u8], key: &[u8; 32], iv: &[u8; 12]) -> Result<Vec<u8>>` | AES-256-GCM encryption with 16-byte auth tag |
| `crypto` | `decrypt_aes_gcm` | `(ciphertext_with_tag: &[u8], key: &[u8; 32], iv: &[u8; 12]) -> Result<Vec<u8>>` | AES-256-GCM decryption and tag validation |
| `crypto` | `unlock_vault` | `(pin: &str, pepper_base64: Option<&str>, encrypted_vault_json: &str) -> Result<RsaPrivateKey>` | Unlocks vault JSON and returns RSA private key |
| `crypto` | `unwrap_dek` | `(wrapped_dek_bytes: &[u8], private_key: &RsaPrivateKey) -> Result<[u8; 32]>` | Decrypts wrapped DEK via RSA-OAEP SHA-256 |
| `crypto` | `decrypt_rsa_oaep` | `(ciphertext: &[u8], private_key: &RsaPrivateKey) -> Result<Vec<u8>>` | Decrypts arbitrary payload with RSA-OAEP SHA-256 |
| `crypto` | `decrypt_note_content` | `(ciphertext: &[u8], iv: &[u8; 12], dek: &[u8; 32]) -> Result<String>` | Decrypts ciphertext and parses as UTF-8 string |
| `db` | `Database::open` | `(path: &Path) -> Result<Database>` | Opens SQLite database file & ensures schema |
| `db` | `Database::in_memory` | `() -> Result<Database>` | Opens temporary in-memory database |
| `db` | `Database::conn` | `(&self) -> &rusqlite::Connection` | Borrows inner rusqlite connection |
| `db` | `Database::conn_mut` | `(&mut self) -> &mut rusqlite::Connection` | Mutably borrows inner connection |
| `db` | `upsert_note` | `(&self, note: &LocalNote) -> Result<()>` | Inserts or updates a local note |
| `db` | `get_note_by_id` | `(&self, id: &str) -> Result<Option<LocalNote>>` | Fetches note by primary key |
| `db` | `search_notes` | `(&self, query: &str, limit: usize) -> Result<Vec<NoteSnippet>>` | Performs FTS5 match query on title and markdown |
| `db` | `list_todos` | `(&self, status_filter: Option<&str>) -> Result<Vec<LocalTodo>>` | Retrieves todos filtered by status |
| `db` | `patch_todo_status` | `(&self, id: &str, is_completed: bool, status: &str) -> Result<()>` | Updates completion and status flags |
| `db` | `get_note_links` | `(&self, note_id: &str) -> Result<Vec<NoteLink>>` | Returns outbound links for note |
| `db` | `upsert_note_link` | `(&self, link: &NoteLink) -> Result<()>` | Upserts an extracted link |
| `db` | `upsert_todo` | `(&self, todo: &LocalTodo) -> Result<()>` | Inserts or updates a local todo item |
| `sync` | `session_file_path` | `() -> Result<PathBuf>` | Path to `~/.tide/session.json` |
| `sync` | `save_session` | `(session: &SessionInfo) -> Result<()>` | Serializes session to disk |
| `sync` | `load_session` | `() -> Result<Option<SessionInfo>>` | Loads session if present |
| `sync` | `TideClient::new` | `(base_url: Option<String>) -> Self` | Instantiates sync client |
| `sync` | `TideClient::with_auth` | `(self, token: impl Into<String>, user_id: impl Into<String>) -> Self` | Fluent builder setting token and user_id |
| `sync` | `request_otp` | `(&self, email: &str) -> Result<()>` | Initiates email OTP |
| `sync` | `verify_otp` | `(&mut self, email: &str, otp: &str) -> Result<(String, String, Option<String>)>` | Validates OTP and updates client credentials |
| `sync` | `sync_notes_and_todos`| `(&self, private_key: &RsaPrivateKey, db: &Database) -> Result<(usize, usize)>` | Pulls files & tasks, decrypts and updates DB |

---

## 4. Error Handling Philosophy

`tide-core` employs standard idiomatic Rust error handling combining `anyhow` and `thiserror`:

1. **Context Enrichment (`anyhow::Context`):**
   - Public and internal functions use `.with_context(|| ...)` or `.context(...)` to annotate errors with runtime parameters (e.g., file paths, note IDs, API endpoints, HTTP status codes).
   ```rust
   db.upsert_note(&local_note)
       .with_context(|| format!("Failed to upsert note {} into local db", local_note.id))?;
   ```
2. **Dynamic Anyhow vs Strong Types (`thiserror`):**
   - `anyhow::Result` is used across application boundaries (`db`, `sync`, `crypto`) where diverse error conditions (I/O, SQLite errors, Base64 decode errors, JSON parse errors, network timeouts) are propagated and presented to CLI tools or higher-level consumers.
   - Cryptographic mismatches (tag verification, invalid IV lengths, corrupted keys) produce explicit descriptive messages (`anyhow::bail!("Invalid IV length: expected 12 bytes...")`).
3. **Graceful Fallbacks:**
   - In FTS5 search: if user input contains special search operators that cause a syntax error, the engine catches the error, escapes double quotes, and re-executes safely.
   - In key derivation: if derivation with 600,000 iterations fails decryption, it falls back to 100,000 iterations before failing.

---

## 5. Concurrency & Thread Safety

- **SQLite Thread Affinity:**
  - `rusqlite::Connection` implements `Send` (when compiled with standard thread-safe SQLite), but does not implement `Sync`.
  - In multi-threaded asynchronous runtimes (`tokio`), access to `Database` must be synchronized via an `Arc<tokio::sync::Mutex<Database>>` or isolated using `tokio::task::spawn_blocking`.
- **HTTP Client Re-use:**
  - `TideClient` holds a `reqwest::Client`, which wraps an internal connection pool protected by `Arc`. It is safe and optimal to share or clone across asynchronous worker tasks.
- **Crypto Thread Safety:**
  - All cryptographic routines (`derive_kek`, `encrypt_aes_gcm`, `decrypt_aes_gcm`, `unwrap_dek`) operate purely on memory buffers and immutable references, making them fully `Send + Sync`. CPU-heavy operations (e.g. 600,000 PBKDF2 iterations) can be run on rayon or `tokio::task::spawn_blocking` without thread contention.

---

## 6. Cargo Configuration & Dependencies

From [`Cargo.toml`](file:///C:/Users/nicoh/projects/tide/core/crates/tide-core/Cargo.toml):

```toml
[package]
name = "tide-core"
version = "0.1.0"
edition = "2021"

[dependencies]
tokio.workspace = true       # Async runtime primitives
rusqlite.workspace = true    # Embedded SQLite driver (bundled with FTS5)
serde.workspace = true       # Serialization framework
serde_json.workspace = true  # JSON support
aes-gcm.workspace = true     # Authenticated AES-256-GCM
rsa.workspace = true         # RSA key operations, PKCS#8, OAEP padding
sha2.workspace = true        # SHA-256 hash function
pbkdf2.workspace = true      # PBKDF2 key derivation
base64.workspace = true      # Base64 encoding/decoding
anyhow.workspace = true      # Context-rich error propagation
thiserror.workspace = true   # Domain-specific error enums
reqwest.workspace = true     # Asynchronous HTTP client
tracing.workspace = true     # Structured diagnostics and logging
```

---

## 7. Verification & Testing

Unit tests in `src/crypto.rs` cover:
- Deterministic PBKDF2 KEK derivation.
- AES-256-GCM encryption/decryption roundtrip and payload authentication.
- Auth tag corruption rejection.
- Note content markdown decryption.
- Vault payload validation (invalid base64, missing keys, malformed IVs).

To execute tests for `tide-core`:
```bash
cargo test -p tide-core
```
