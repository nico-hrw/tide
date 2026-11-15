# Tide Daemon (`tide-daemon`) CLI Reference Manual

> **Target Binary:** `tide-daemon`  
> **Source Location:** `core/crates/tide-daemon/src/main.rs`  
> **Target Version:** `0.1.0`  
> **Runtime Target:** Cross-platform (`x86_64` / `aarch64` on Linux, macOS, Windows)

---

## 1. Binary Overview

`tide-daemon` is the high-performance local daemon and command-line harness for the Tide personal knowledge workspace. It provides:
- **Local Persistence & SQLite FTS5**: Manages local SQLite storage (`~/.tide/local.db`) with full-text search and bidirectional link indexing.
- **Zero-Knowledge Cryptography**: Derives Key Encryption Keys (KEK) via PBKDF2 (HMAC-SHA256, 600,000 iterations), decrypts RSA-4096 / RSA-2048 private vaults, and unwraps AES-256-GCM data encryption keys (DEKs).
- **Bidirectional Cloud Sync**: Replicates notes, folders, and todos against the Tide Cloud API (`https://hrw.rocks/api/v1` or custom endpoints).
- **Model Context Protocol (MCP)**: Implements a token-efficient JSON-RPC 2.0 stdio server (`2024-11-05` spec) enabling autonomous AI coding agents (Claude Desktop, Cursor, Antigravity, Windsurf) to query, link, and patch knowledge graphs without context bloat.

### Compilation & Release Options

Build the binary from the root of the `core` workspace:

```bash
# Debug build (fast compilation, debug symbols enabled)
cargo build --bin tide-daemon

# Optimized release build (LTO, stripped symbols, maximum runtime performance)
cargo build --release --bin tide-daemon

# Cross-platform release targets
cargo build --release --target x86_64-unknown-linux-gnu --bin tide-daemon
cargo build --release --target aarch64-apple-darwin --bin tide-daemon
cargo build --release --target x86_64-pc-windows-msvc --bin tide-daemon
```

### Binary Path

- Debug: `core/target/debug/tide-daemon` (or `tide-daemon.exe` on Windows)
- Release: `core/target/release/tide-daemon` (or `tide-daemon.exe` on Windows)

### Logging & Diagnostics

Logging is controlled via standard Rust logging directives using the `RUST_LOG` environment variable:

```bash
# Default / Info output
RUST_LOG=info tide-daemon run

# Verbose debugging across tide-daemon and tide-core crates
RUST_LOG=tide_daemon=debug,tide_core=debug tide-daemon sync

# Trace logging for low-level HTTP and SQLite execution
RUST_LOG=trace tide-daemon mcp --db-path ~/.tide/local.db
```

---

## 2. Global CLI Syntax & Conventions

```
tide-daemon [OPTIONS] [COMMAND]
```

When invoked without subcommands (`tide-daemon`), the binary launches an interactive Terminal User Interface (TUI) menu:
```
=============================================
          TIDE LOCAL HARNESS & MCP           
=============================================
[1] Login & Sync Notes (Email -> Code -> PIN)
[2] Sync Notes & Todos (with saved session)
[3] Start Stdio MCP Server (for AI agents)
[4] Exit

Select an option [1-4]:
```

### Global Options
- `-h, --help`: Print comprehensive CLI help information.
- `-V, --version`: Print binary version string (`0.1.0`).

---

## 3. Command Catalog

### 3.1 `init`

Initializes the local Tide environment, directories, and SQLite database schema.

```bash
tide-daemon init [OPTIONS]
```

#### Flags & Options
| Flag / Option | Type | Default | Description |
|---|---|---|---|
| `--db-path <PATH>` | String | `~/.tide/local.db` | Filesystem path to the local SQLite database. Expands `~` to the active user home directory. |

#### Behavior
1. Verifies and creates parent directories (e.g. `~/.tide/` or custom directory paths).
2. Initializes the SQLite database file with WAL (`Write-Ahead Logging`) mode, synchronous flags, and foreign keys.
3. Applies SQL schema migrations:
   - `local_notes`: Stores decrypted local notes, metadata, pinned state, version timestamps.
   - `fts_notes`: Virtual table with SQLite FTS5 for sub-millisecond full-text searches.
   - Triggers (`local_notes_ai`, `local_notes_ad`, `local_notes_au`): Synchronizes FTS5 index automatically.
   - `note_links`: Stores parsed bidirectional wikilinks (`[[link]]`) and markdown anchors.
   - `local_todos`: Stores task titles, completion state, due dates, and note associations.
   - `sync_queue`: Tracks pending local mutations for offline-first push sync.

#### Example
```bash
tide-daemon init --db-path ~/.tide/local.db
```

---

### 3.2 `login`

Authenticates against the Tide Cloud API, derives vault keys using PBKDF2, unwraps user encryption credentials, and persists active session state to `~/.tide/session.json`.

```bash
tide-daemon login [OPTIONS]
```

#### Flags & Options
| Flag / Option | Type | Default | Description |
|---|---|---|---|
| `--email <EMAIL>` | String | *Interactive prompt* | Account email address for OTP request. |
| `--code <CODE>` | String | *Interactive prompt* | 6-digit one-time confirmation code dispatched to the account email. |
| `--pin <PIN>` | String | *Interactive prompt* | User vault security PIN used to derive KEK via PBKDF2. |
| `--token <JWT>` | String | *Optional* | Pre-existing authentication bearer token (bypasses OTP verification flow). |
| `--server-url <URL>` | String | `https://hrw.rocks/api/v1` | Custom Tide API endpoint URL. |
| `--db-path <PATH>` | String | `~/.tide/local.db` | Path to the local database file. |

#### Authentication & Key Derivation Flow
1. **OTP Dispatch**: POST to `/auth/request-otp` with `{"email": "<EMAIL>"}`.
2. **OTP Verification**: POST to `/auth/verify-otp` with `{"email": "<EMAIL>", "code": "<CODE>"}`.
   - Receives JWT bearer token, user UUID, `encrypted_vault` payload, and optional `pepper` salt.
3. **Master Key Derivation (Zero-Knowledge)**:
   - Derives Key Encryption Key (`KEK`) using `PBKDF2-HMAC-SHA256` with 600,000 iterations over the PIN.
   - Unwraps the encrypted vault envelope to extract the user's PKCS#8 RSA Master Private Key and root Data Encryption Keys.
4. **Session Persistence**: Writes session metadata and encrypted vault envelope to `~/.tide/session.json`.
5. **Initial Ingestion**: Automatically executes an initial cloud sync, pulling notes and todos into `local.db`.

#### Examples
```bash
# Fully non-interactive script login:
tide-daemon login --email user@example.com --code 849201 --pin 1234 --db-path ~/.tide/local.db

# Interactive login (prompts for email, code, and PIN with masked/secure input):
tide-daemon login
```

---

### 3.3 `sync`

Performs an on-demand, synchronous bidirectional synchronization between the local SQLite database and the Tide Cloud service.

```bash
tide-daemon sync [OPTIONS]
```

#### Flags & Options
| Flag / Option | Type | Default | Description |
|---|---|---|---|
| `--pin <PIN>` | String | *Interactive prompt* | User vault PIN required to unlock RSA master private key for decrypting pulled notes. |
| `--db-path <PATH>` | String | `~/.tide/local.db` | Local SQLite database destination path. |
| `--full` | Flag | `false` | Forces a full re-sync, pulling all remote entities regardless of local `updated_at` markers. |
| `--dry-run` | Flag | `false` | Computes sync differentials and conflicts without committing writes to disk or cloud. |
| `--verbose` | Flag | `false` | Prints detailed per-note decryption status and timing metrics. |

#### Execution Details
1. Reads `~/.tide/session.json` to extract user credentials and encrypted vault envelope.
2. Unlocks the RSA Master Key using the supplied PIN.
3. **Push Phase**: Inspects `sync_queue` table; serializes dirty local notes and todos; encrypts note bodies with generated AES-256-GCM DEKs; wraps DEKs with the RSA Public Key; transmits to `POST /notes` and `POST /todos`.
4. **Pull Phase**: Queries `GET /notes` and `GET /todos` for changes since the last recorded sync watermark; unwraps note DEKs via RSA-OAEP; decrypts AES-256-GCM payloads; updates SQLite tables and FTS5 indices.

#### Example
```bash
tide-daemon sync --pin 1234 --db-path ~/.tide/local.db
```

---

### 3.4 `run`

Launches `tide-daemon` as a long-running background daemon service. Continuously monitors local file changes, coordinates scheduled cloud synchronization, and listens for process termination signals.

```bash
tide-daemon run [OPTIONS]
```

#### Flags & Options
| Flag / Option | Type | Default | Description |
|---|---|---|---|
| `--db-path <PATH>` | String | `~/.tide/local.db` | Path to the local database file. |
| `--interval <SECS>` | Integer | `300` (5 min) | Background synchronization interval in seconds. |
| `--foreground` | Flag | `true` | Runs directly attached to the terminal standard output/error stream. |
| `--daemonize` | Flag | `false` | Detaches and forks process into an operating system background daemon (UNIX platforms). |

#### Lifecycle & Signal Handling
- Gracefully handles `SIGINT` (Ctrl+C), `SIGTERM`, and Windows break events.
- Ensures all ongoing SQLite write transactions and WAL checkpoints finish flushing before process exit.

#### Example
```bash
tide-daemon run --db-path ~/.tide/local.db
```

---

### 3.5 `mcp`

Invokes the Stdio JSON-RPC 2.0 Model Context Protocol server. This mode allows external AI agents and IDEs to communicate with Tide over standard input (`stdin`) and standard output (`stdout`).

```bash
tide-daemon mcp [OPTIONS]
```

#### Flags & Options
| Flag / Option | Type | Default | Description |
|---|---|---|---|
| `--db-path <PATH>` | String | `~/.tide/local.db` | Local SQLite database file path queried by MCP tools. |
| `--debug` | Flag | `false` | Emits internal MCP protocol frame logs to stderr. |
| `--log-file <PATH>` | String | *None* | Redirects debug diagnostics to an external log file (keeping stdout clean for JSON-RPC). |

> [!IMPORTANT]
> The MCP server protocol strictly requires that `stdout` be reserved exclusively for JSON-RPC messages. Do not write arbitrary debug logs to `stdout`. All diagnostic logs must be routed to `stderr` or an external file specified by `--log-file`.

#### Supported MCP Tools
- `tide_search`: Full-text search over indexed notes via SQLite FTS5. Returns note ID, title, and matched snippet excerpts.
- `tide_get_note_outline`: Extracts headings (`#`, `##`, `###`) and structural topology from a note without loading the full body text.
- `tide_get_note_section`: Retrieves only a specific section under a given heading, minimizing token consumption.
- `tide_get_note_graph`: Returns bidirectional link graph for a note (inbound and outbound wikilinks).
- `tide_list_todos`: Lists todos filtered by status (`pending`, `completed`), priority, or tag.
- `tide_patch_todo`: Updates status or details of a specific todo item.
- `tide_get_block`: Retrieves an atomic block or paragraph by block UUID.
- `tide_patch_block`: Replaces or edits an atomic block without overwriting the entire document.

#### Example
```bash
tide-daemon mcp --db-path ~/.tide/local.db
```

---

## 4. Environment Variables

The daemon reads several configuration options from environment variables. CLI flags take precedence over environment variables.

| Variable | Type | Default | Description |
|---|---|---|---|
| `TIDE_HOME` | Path | `~/.tide` | Root directory for Tide local configuration, session storage, and database. |
| `TIDE_SERVER_URL` | URL | `https://hrw.rocks/api/v1` | Base URL of the Tide Cloud API service. |
| `TIDE_LOG_LEVEL` | String | `info` | Logging verbosity (`error`, `warn`, `info`, `debug`, `trace`). |
| `RUST_LOG` | String | *Unset* | Rust standard env_logger directive (`tide_daemon=debug,tide_core=info`). |
| `TIDE_SESSION_TOKEN` | String | *Unset* | Overrides stored session bearer token for headless continuous integration. |

---

## 5. Configuration File Formats

All persistent runtime configuration files reside under `~/.tide/` (or the directory referenced by `TIDE_HOME`).

### 5.1 `~/.tide/session.json`

Stores authentication tokens, user identification, and the client-side encrypted vault envelope.

```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IlRpZGUgVXNlciJ9...",
  "user_id": "usr_94b1a207-6c2e-4b2e-a58d-71b56dae0349",
  "email": "user@example.com",
  "base_url": "https://hrw.rocks/api/v1",
  "encrypted_vault": "{\"encrypted_rsa_private_key\":\"v1:aes-gcm:salt:nonce:ciphertext:tag\",\"salt\":\"dGVzdHNhbHQ=\",\"iterations\":600000}",
  "pepper": "optional_device_specific_pepper_string"
}
```

#### Field Annotations:
- `token`: Bearer JWT token passed in `Authorization: Bearer <token>` HTTP headers.
- `user_id`: Unique identifier for the account in Tide Cloud.
- `email`: Authenticated user email address.
- `base_url`: Target Tide API endpoint.
- `encrypted_vault`: Serialized JSON payload containing the encrypted RSA private key, iteration count (600,000), and salt for PBKDF2 derivation.
- `pepper`: Optional device-bound salt value for multi-factor derivation.

---

### 5.2 `~/.tide/config.toml`

General daemon configuration file for tuning synchronization intervals, database settings, and logging.

```toml
# Tide Daemon Global Configuration (~/.tide/config.toml)

[server]
url = "https://hrw.rocks/api/v1"
request_timeout_secs = 30

[database]
path = "~/.tide/local.db"
wal_mode = true
busy_timeout_ms = 5000

[sync]
auto_sync = true
interval_secs = 300
batch_size = 50

[mcp]
log_level = "error"
token_budget_per_call = 4096
```

---

## 6. AI Agent Integration Examples

`tide-daemon mcp` communicates via the standard JSON-RPC 2.0 stdio protocol. Below are standard configuration snippets for popular AI agents and developer tools.

### 6.1 Claude Desktop (`claude_desktop_config.json`)

On macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`  
On Windows: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "tide": {
      "command": "tide-daemon",
      "args": ["mcp", "--db-path", "~/.tide/local.db"],
      "env": {
        "RUST_LOG": "error"
      }
    }
  }
}
```

### 6.2 Cursor (`.cursor/mcp.json` or Global MCP Settings)

```json
{
  "mcpServers": {
    "tide-knowledge": {
      "command": "tide-daemon",
      "args": ["mcp"],
      "env": {
        "TIDE_HOME": "~/.tide"
      }
    }
  }
}
```

### 6.3 Custom Terminal Pipes / Debugging

Direct interaction via Unix pipes for testing JSON-RPC tool availability:

```bash
# Query MCP tool list via standard stdio pipe
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | tide-daemon mcp

# Execute note search query
echo '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"tide_search","arguments":{"query":"architecture"}}}' | tide-daemon mcp
```

---

## 7. Exit Codes & Troubleshooting

### Process Exit Codes

| Code | Status | Description |
|---|---|---|
| `0` | `SUCCESS` | Command completed successfully, or clean shutdown on `SIGINT` / `SIGTERM`. |
| `1` | `RUNTIME_ERROR` | Unhandled error during database operation, network request, or CLI parameter validation. |
| `2` | `AUTH_FAILURE` | Invalid session token, expired OTP code, or incorrect vault PIN. |
| `3` | `IO_ERROR` | File permission denied, disk full, or corrupted SQLite database header. |
| `4` | `NETWORK_TIMEOUT`| Cloud server unreachable or gateway timeout during sync operation. |

### Common Troubleshooting Procedures

#### 1. "Failed to unlock vault. Check your PIN."
- **Cause**: The derived KEK failed the AES-GCM tag verification when attempting to decrypt the RSA private key payload.
- **Resolution**: Verify that the PIN entered matches the PIN configured in the Tide Web App. If forgotten, reset the PIN in the web app under Account Settings > Vault Security.

#### 2. "No saved session found. Please run login first."
- **Cause**: The file `~/.tide/session.json` does not exist or does not contain a valid `token` and `user_id`.
- **Resolution**: Run `tide-daemon login` to authenticate and create a new session.

#### 3. Database is locked (`sqlite3: database is locked (5)`)
- **Cause**: Another process or background worker holds an exclusive write lock on `local.db`.
- **Resolution**: Ensure multiple `tide-daemon sync` commands are not executing simultaneously. WAL mode allows concurrent readers with a single writer. Check for hanging processes with `ps aux | grep tide-daemon` (Linux/macOS) or Task Manager (Windows).

#### 4. Claude Desktop / Cursor MCP Server fails to connect
- **Cause**: Extraneous output on `stdout` breaks the JSON-RPC parser.
- **Resolution**: Ensure `RUST_LOG=error` or `RUST_LOG=off` is set in the client's `env` section so only pure JSON-RPC frames are output to `stdout`.
