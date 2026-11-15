# Testing Strategy & Verification Guide

This document outlines the testing architecture, methodology, and verification procedures for the Tide Rust Core workspaces (`tide-core` and `tide-daemon`).

---

## 1. Testing Philosophy

The Tide Rust Core is engineered around local-first durability, deterministic execution, and cryptographic security. The testing strategy reflects these priorities:

1. **Deterministic Unit Tests**: Tests must produce identical results across environments and architectures (x86_64, aarch64, Windows, macOS, Linux). Flaky tests, time-dependent assertions without mock clocks, and unseeded randomness are strictly prohibited.
2. **Zero-Network Mock Testing**: Unit and integration test suites must execute offline with zero live network dependencies. External HTTP APIs (such as Tide Cloud REST endpoints) are mocked at the transport level.
3. **Cryptographic Parity & Test Vectors**: Cryptographic primitives in `tide-core` must remain 100% byte-for-byte compatible with Web Crypto API implementations in the TypeScript frontend (`web/src/lib/crypto.ts` and `web/src/lib/cryptoV2.ts`). Verified golden test vectors are checked into the test suite.
4. **Isolated Ephemeral State**: Database and filesystem operations in test suites run in isolated memory spaces (`:memory:` SQLite databases, `tempfile::TempDir` sandboxes) to prevent disk pollution or cross-test interference.

---

## 2. Test Categories & Implementation

### 2.1 Cryptographic Parity Tests (`tide-core::crypto`)

The cryptographic layer handles Master Key derivation, Data Encryption Key (DEK) wrapping/unwrapping, and symmetric payload encryption. Tests must ensure interoperability with Web Crypto implementations.

- **PBKDF2 Key Derivation**:
  - Validates key stretching using HMAC-SHA-256.
  - Tests standard rounds:
    - **600,000 iterations** (current default for master key derivation).
    - **100,000 iterations** (legacy / backward compatibility mode).
  - Uses fixed golden vectors: `(passphrase, salt, iterations, expected_derived_key_hex)`.
- **AES-256-GCM AEAD Encryption / Decryption**:
  - Tests 256-bit symmetric encryption with 96-bit (12-byte) initialization vectors (IVs) and 128-bit authentication tags.
  - Verifies round-trip integrity: `decrypt(encrypt(plaintext, key, iv), key, iv) == plaintext`.
  - Verifies tamper rejection: modifying a single bit in the ciphertext or authentication tag must fail decryption with an explicit authentication error (`CryptoError::AeadDecryptionFailed`).
  - Verifies Additional Authenticated Data (AAD) binding when contextual authentication is used.
- **RSA-OAEP 4096-bit Key Wrapping**:
  - Tests public key wrapping and private key unwrapping of 256-bit symmetric DEKs.
  - Verifies OAEP padding with SHA-256 digest matching Web Crypto `SubtleCrypto.wrapKey` and `SubtleCrypto.unwrapKey`.
- **Golden Vector Verification**:
  - Cryptographic test vectors exported from the TypeScript / Web test harness are embedded in `tide-core/tests/crypto_vectors.rs` to guarantee cross-language interoperability.

```rust
#[test]
fn test_pbkdf2_derivation_parity_600k() {
    let passphrase = "test-passphrase-alpha";
    let salt = hex::decode("0123456789abcdef0123456789abcdef").unwrap();
    let rounds = 600_000;
    let expected_key = hex::decode("...").unwrap();

    let derived = derive_master_key(passphrase, &salt, rounds).expect("Derivation failed");
    assert_eq!(derived.as_bytes(), expected_key.as_slice());
}
```

---

### 2.2 In-Memory SQLite Tests (`tide-core::storage`)

Database tests exercise the relational schema, FTS5 full-text indexing triggers, cascade deletions, and the offline sync queue.

- **In-Memory Mode**: Tests instantiate Rusqlite connections with `Connection::open_in_memory()`.
- **Schema Migration Execution**: Every test runs the full set of schema migrations from version 0 to ensure migration idempotency.
- **Foreign Key Cascades**: `PRAGMA foreign_keys = ON;` is enforced. Tests verify that deleting an entity (e.g., a note or calendar event) cascades or updates associated metadata and queue tables appropriately.
- **FTS5 Triggers & Search Index**:
  - Tests insert, update, and delete operations on entities and verify corresponding records in the FTS5 virtual table.
  - Full-text search queries (including tokenization, prefixes, and boolean operators) are tested for accurate match ranking.
- **Offline Sync Queue Operations**:
  - Tests enqueueing changes (`INSERT`, `UPDATE`, `DELETE`) with monotonic client versioning.
  - Tests queue draining, deduplication (coalescing multiple rapid updates into a single sync delta), and conflict resolution status transitions.

```rust
#[test]
fn test_sync_queue_coalescing() {
    let conn = Connection::open_in_memory().unwrap();
    init_schema(&conn).unwrap();

    let repo = StorageEngine::new(conn);
    repo.enqueue_mutation("note-1", MutationType::Update, b"payload v1").unwrap();
    repo.enqueue_mutation("note-1", MutationType::Update, b"payload v2").unwrap();

    let pending = repo.get_pending_mutations().unwrap();
    assert_eq!(pending.len(), 1);
    assert_eq!(pending[0].payload, b"payload v2");
}
```

---

### 2.3 MCP Server Stdio Tests (`tide-daemon::mcp`)

The Model Context Protocol (MCP) daemon interface communicates over standard I/O using JSON-RPC 2.0. Stdio testing simulates client-daemon interactions without spawning external processes.

- **Mock Transport**: Uses `tokio::io::duplex` or asynchronous piped buffers (`tokio::io::AsyncRead` / `AsyncWrite`) in place of actual OS stdin/stdout.
- **JSON-RPC Handshake & Protocol Lifecycle**:
  - Verifies `initialize` negotiation and protocol version exchange.
  - Verifies graceful handling of client shutdown notifications.
- **`tools/list` Verification**:
  - Sends a JSON-RPC request for `tools/list`.
  - Asserts that all registered tools (`read_notes`, `search_notes`, `create_event`, `list_calendar_events`, etc.) are exposed with valid JSON Schema descriptors.
- **`tools/call` Verification**:
  - Sends valid tool invocations with strongly-typed arguments and asserts structured result outputs.
  - Injects invalid arguments, malformed JSON, and unknown tool names; verifies standardized JSON-RPC error codes (`-32600 Invalid Request`, `-32601 Method Not Found`, `-32602 Invalid Params`).

```rust
#[tokio::test]
async fn test_mcp_tools_list() {
    let (client_io, server_io) = tokio::io::duplex(4096);
    let server = McpServer::new(server_io);
    tokio::spawn(server.serve());

    let (mut client_read, mut client_write) = tokio::io::split(client_io);
    let request = r#"{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}"#;
    client_write.write_all(format!("{}\n", request).as_bytes()).await.unwrap();

    let mut response_raw = String::new();
    let mut reader = tokio::io::BufReader::new(client_read);
    reader.read_line(&mut response_raw).await.unwrap();

    let resp: serde_json::Value = serde_json::from_str(&response_raw).unwrap();
    assert_eq!(resp["id"], 1);
    assert!(resp["result"]["tools"].as_array().unwrap().len() > 0);
}
```

---

### 2.4 Sync Engine Tests (`tide-core::sync`)

The synchronization engine reconciles local database state with the Tide Cloud REST API. All network interactions are simulated locally.

- **HTTP Mocking with `wiremock`**:
  - Spawns a local HTTP server using `wiremock::MockServer`.
  - Mocks sync handshake: `POST /api/v1/sync/pull` and `POST /api/v1/sync/push`.
- **Scenario Verification**:
  - **Clean Fast-Forward**: Remote changes pull down cleanly and apply to local storage.
  - **Batch Push**: Pending queue mutations are batched, serialized, and marked committed upon HTTP 200 responses.
  - **Conflict Resolution**: Tests divergent edits (simultaneous local and remote updates to the same entity). Verifies Last-Write-Wins (LWW) or custom deterministic resolution heuristics.
  - **Exponential Backoff & Retries**: Simulates HTTP 500, 503, and network dropouts to verify retry schedules and error escalation.
  - **Authentication Expiration**: Simulates HTTP 401 Unauthorized to ensure tokens are refreshed or caller notifications are triggered without panic.

```rust
#[tokio::test]
async fn test_sync_push_retries_on_503() {
    let mock_server = wiremock::MockServer::start().await;

    wiremock::Mock::given(wiremock::matchers::method("POST"))
        .and(wiremock::matchers::path("/api/v1/sync/push"))
        .respond_with(wiremock::ResponseTemplate::new(503))
        .expect(2)
        .mount(&mock_server)
        .await;

    let sync_client = SyncEngine::new(mock_server.uri(), mock_storage());
    let result = sync_client.push_pending_with_retry(2).await;
    assert!(result.is_err());
}
```

---

## 3. Cargo Test Commands & Workflow

### 3.1 Workspace-Wide Testing
Run all tests across all crates in the workspace:
```bash
cargo test --workspace
```

Run tests with console output uncaptured:
```bash
cargo test --workspace -- --nocapture
```

### 3.2 Package-Targeted Testing
Run tests exclusively in `tide-core`:
```bash
cargo test -p tide-core
```

Run tests exclusively in `tide-daemon`:
```bash
cargo test -p tide-daemon
```

### 3.3 Target Specific Subsystems & Modules
Run the cryptographic test suite:
```bash
cargo test -p tide-core --lib crypto
```

Run storage and SQLite integration tests:
```bash
cargo test -p tide-core --test storage_tests
```

Run MCP protocol tests:
```bash
cargo test -p tide-daemon --test mcp_tests
```

### 3.4 Running Single Test Cases
Run a specific test by name:
```bash
cargo test -p tide-core --lib crypto::tests::test_pbkdf2_derivation_parity_600k
```

Run tests matching a substring filter:
```bash
cargo test -p tide-core aes_256_gcm
```

---

## 4. Continuous Integration & Code Coverage

### 4.1 CI Verification Pipeline
Every pull request and merge commit runs the verification matrix:

1. **Format Check**:
   ```bash
   cargo fmt --all -- --check
   ```
2. **Clippy (Linter)**:
   ```bash
   cargo clippy --workspace --all-targets -- -D warnings
   ```
3. **Compilation & Typecheck**:
   ```bash
   cargo check --workspace --all-targets
   ```
4. **Unit & Integration Tests**:
   ```bash
   cargo test --workspace --all-targets
   ```

### 4.2 Code Coverage Recommendations
- **Tooling**: Use [`cargo-llvm-cov`](https://github.com/taiki-e/cargo-llvm-cov) for accurate, source-based branch and line coverage.
- **Coverage Execution**:
  ```bash
  # Generate summary report in terminal
  cargo llvm-cov --workspace

  # Generate LCOV report for CI / Codecov
  cargo llvm-cov --workspace --lcov --output-path lcov.info

  # Generate interactive HTML report for local inspection
  cargo llvm-cov --workspace --html
  ```
- **Coverage Thresholds**:
  - `tide-core::crypto`: **100% line coverage** required. Every failure mode, malformed payload, and edge case must be covered.
  - `tide-core::storage`: **>= 90% line coverage** required. All migration scripts, schema constraints, and triggers must be tested.
  - Overall workspace target: **>= 85% line coverage**.
