# Tide Local SQLite Storage Specification

**Document Version:** 1.0.0  
**Target Module:** `crates/tide-core/src/db.rs`  
**Database File:** `~/.tide/local.db`  
**Status:** Canonical Reference

---

## 1. Overview & Architectural Role

The Tide desktop and CLI ecosystem is built around an **offline-first, zero-knowledge architecture**. The local database managed in `crates/tide-core/src/db.rs` serves as the authoritative, low-latency, transactional source of truth on the client device. 

All user mutations (creating notes, toggling todos, linking documents, modifying tags) are committed directly to local storage within atomic transactions prior to network dispatch. Remote synchronization operates asynchronously via an outbox queue (`sync_queue`), ensuring that user workflows are fully decoupled from network latency and cloud availability.

```
┌────────────────────────────────────────────────────────┐
│                   Tide Core Client                     │
│  (crates/tide-core - Tokio Async Runtime & Rusqlite)   │
└───────────┬────────────────────────────────┬───────────┘
            │                                │
      Read / Write                     Background Sync
            ▼                                ▼
┌───────────────────────┐        ┌───────────────────────┐
│     Local SQLite      │        │      Tide Cloud       │
│  (~/.tide/local.db)   │◄───────┤    API (/api/v1)      │
│  - WAL Journaling     │  Pull  └───────────────────────┘
│  - FTS5 Full-Text     │
│  - Outbox Sync Queue  │
└───────────────────────┘
```

---

## 2. Database Location & Connection Pragmas

### 2.1 File Location & Permissions

The database file is located in the platform-standard user directory:
- **Default Path:** `~/.tide/local.db`
- **Auxiliary WAL Files:** `~/.tide/local.db-wal`, `~/.tide/local.db-shm`
- **Filesystem Permissions:** The parent directory `~/.tide` and the database files must be secured with restricted permissions (`0700` directory, `0600` files on Unix-like operating systems) to preserve local zero-knowledge privacy.

### 2.2 Connection Initialization PRAGMAs

Every Rusqlite connection opened by `crates/tide-core/src/db.rs` must execute the following connection-level PRAGMAs immediately upon initialization:

```sql
-- Enforce referential integrity for foreign keys
PRAGMA foreign_keys = ON;

-- Enable Write-Ahead Logging for high-concurrency read/write operations
PRAGMA journal_mode = WAL;

-- Safe durability balance: sync at critical checkpoints, fast writes
PRAGMA synchronous = NORMAL;

-- Wait up to 5000ms if another thread or process holds a lock
PRAGMA busy_timeout = 5000;

-- Additional performance tunings
PRAGMA cache_size = -64000;       -- Allocate ~64MB memory for page cache
PRAGMA temp_store = MEMORY;       -- Keep temporary tables and indices in RAM
PRAGMA mmap_size = 268435456;     -- Memory-map up to 256MB of database file
```

### 2.3 PRAGMA Justifications

| PRAGMA | Setting | Rationale |
| :--- | :--- | :--- |
| `foreign_keys` | `ON` | SQLite disables foreign key enforcement by default. Setting to `ON` guarantees relational cascades and prevents orphaned links or todos. |
| `journal_mode` | `WAL` | Permits concurrent non-blocking readers alongside a single active writer. Prevents UI read lockouts during bulk import or sync operations. |
| `synchronous` | `NORMAL` | In WAL mode, `NORMAL` guarantees data integrity across application crashes without issuing an `fsync` after every single write transaction, yielding dramatic write throughput improvements. |
| `busy_timeout` | `5000` | Eliminates immediate `SQLITE_BUSY` contention errors by instructing SQLite to sleep and retry up to 5 seconds during transient lock contention. |

---

## 3. Relational Schema Definitions

### 3.1 `notes` Table

Stores core note metadata, document attributes, and encrypted or plaintext content envelopes.

```sql
CREATE TABLE IF NOT EXISTS notes (
    id TEXT PRIMARY KEY NOT NULL,                -- UUID v4
    title TEXT NOT NULL DEFAULT '',              -- Plaintext or decrypted title
    content TEXT NOT NULL DEFAULT '',            -- Decrypted content (Markdown / TipTap JSON)
    encrypted_payload BLOB,                      -- Serialized ciphertext envelope (for cloud sync)
    dek_salt TEXT,                               -- Salt for note-specific Data Encryption Key
    is_pinned INTEGER NOT NULL DEFAULT 0,        -- 0 = false, 1 = true
    is_archived INTEGER NOT NULL DEFAULT 0,      -- 0 = false, 1 = true
    is_deleted INTEGER NOT NULL DEFAULT 0,       -- 0 = active, 1 = tombstone (soft delete)
    tags TEXT NOT NULL DEFAULT '[]',             -- JSON array of strings: '["work", "rust"]'
    created_at INTEGER NOT NULL,                 -- Unix epoch milliseconds
    updated_at INTEGER NOT NULL                  -- Unix epoch milliseconds
);

-- Indices for rapid UI filtering and ordering
CREATE INDEX IF NOT EXISTS idx_notes_updated_at 
    ON notes (is_deleted, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_notes_pinned_updated 
    ON notes (is_deleted, is_pinned DESC, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_notes_archived 
    ON notes (is_deleted, is_archived);
```

### 3.2 `todos` Table

Maintains hierarchical or standalone actionable tasks linked to notes or standalone project spaces.

```sql
CREATE TABLE IF NOT EXISTS todos (
    id TEXT PRIMARY KEY NOT NULL,                -- UUID v4
    note_id TEXT,                                -- Optional foreign key to parent note
    title TEXT NOT NULL,                         -- Todo item description
    status TEXT NOT NULL DEFAULT 'pending',      -- Workflow status
    priority TEXT NOT NULL DEFAULT 'medium',     -- Priority level
    position INTEGER NOT NULL DEFAULT 0,         -- Sorter order within list
    due_date INTEGER,                            -- Optional Unix epoch timestamp (ms)
    completed_at INTEGER,                        -- Timestamp when status changed to completed
    created_at INTEGER NOT NULL,                 -- Unix epoch milliseconds
    updated_at INTEGER NOT NULL,                 -- Unix epoch milliseconds
    
    -- Integrity constraints
    CONSTRAINT fk_todos_note_id 
        FOREIGN KEY (note_id) 
        REFERENCES notes (id) 
        ON DELETE CASCADE,
        
    CONSTRAINT chk_todos_status 
        CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled')),
        
    CONSTRAINT chk_todos_priority 
        CHECK (priority IN ('low', 'medium', 'high', 'urgent'))
);

CREATE INDEX IF NOT EXISTS idx_todos_note_position 
    ON todos (note_id, position ASC);

CREATE INDEX IF NOT EXISTS idx_todos_status_due 
    ON todos (status, due_date ASC);
```

### 3.3 `note_links` Table

Maintains directional edges between notes to power bi-directional linking, backlink panels, and knowledge graph visualization.

```sql
CREATE TABLE IF NOT EXISTS note_links (
    source_note_id TEXT NOT NULL,                -- Originating note containing the link
    target_note_id TEXT NOT NULL,                -- Referenced destination note
    link_text TEXT NOT NULL DEFAULT '',          -- Anchor text / WikiLink title override
    created_at INTEGER NOT NULL,                 -- Unix epoch milliseconds
    
    PRIMARY KEY (source_note_id, target_note_id),
    
    CONSTRAINT fk_note_links_source 
        FOREIGN KEY (source_note_id) 
        REFERENCES notes (id) 
        ON DELETE CASCADE,
        
    CONSTRAINT fk_note_links_target 
        FOREIGN KEY (target_note_id) 
        REFERENCES notes (id) 
        ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_note_links_target 
    ON note_links (target_note_id, source_note_id);
```

### 3.4 `sync_queue` Table

The persistent transactional outbox queue recording client-side mutations that need to be pushed upstream to the Tide Cloud API.

```sql
CREATE TABLE IF NOT EXISTS sync_queue (
    id TEXT PRIMARY KEY NOT NULL,                -- UUID v4 mutation entry identifier
    entity_type TEXT NOT NULL,                   -- 'note' | 'todo' | 'link'
    entity_id TEXT NOT NULL,                     -- Target resource UUID
    action TEXT NOT NULL,                        -- 'CREATE' | 'UPDATE' | 'DELETE'
    payload TEXT,                                -- JSON-serialized snapshot or patch
    retry_count INTEGER NOT NULL DEFAULT 0,      -- Monotonic attempt counter
    last_error TEXT,                             -- Diagnostic failure reason from last push
    created_at INTEGER NOT NULL,                 -- Unix epoch milliseconds
    updated_at INTEGER NOT NULL,                 -- Unix epoch milliseconds
    status TEXT NOT NULL DEFAULT 'PENDING',      -- 'PENDING' | 'IN_FLIGHT' | 'FAILED'
    
    CONSTRAINT chk_sync_queue_action 
        CHECK (action IN ('CREATE', 'UPDATE', 'DELETE')),
        
    CONSTRAINT chk_sync_queue_status 
        CHECK (status IN ('PENDING', 'IN_FLIGHT', 'FAILED'))
);

CREATE INDEX IF NOT EXISTS idx_sync_queue_status_created 
    ON sync_queue (status, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_sync_queue_entity 
    ON sync_queue (entity_id, status);
```

### 3.5 `sync_meta` Table

Maintains high-water mark cursors, timestamps, and etags for downstream pull synchronization.

```sql
CREATE TABLE IF NOT EXISTS sync_meta (
    entity_key TEXT PRIMARY KEY NOT NULL,        -- e.g., 'notes_cursor', 'todos_cursor'
    last_synced_at INTEGER NOT NULL DEFAULT 0,   -- Unix epoch milliseconds cursor
    server_cursor TEXT,                          -- Server-provided pagination cursor / opaque token
    last_etag TEXT                               -- HTTP ETag of last fetched collection
);
```

---

## 4. Full-Text Search (FTS5) Engine

### 4.1 FTS5 Virtual Table Architecture

Tide implements fast, fuzzy-capable local full-text search using SQLite's FTS5 extension. The index indexes decrypted title, content, and tag fields.

```sql
CREATE VIRTUAL TABLE IF NOT EXISTS note_snippets_fts USING fts5(
    id UNINDEXED,                                -- Matches notes.id (unindexed for space efficiency)
    title,                                       -- Searchable note title
    content,                                     -- Searchable decrypted text / markdown
    tags,                                        -- Searchable concatenated tags
    tokenize = 'porter unicode61 remove_diacritics 2 tokenchars ''-.''',
    prefix = '2 3'                               -- Prefix indices for fast autocomplete
);
```

*Note on Tokenizer Configuration:*
- `porter unicode61`: Chained tokenizers. `unicode61` normalizes Unicode codepoints and case folding, while the `porter` stemming algorithm folds English grammatical variants (e.g., `searching`, `searched` -> `search`).
- `remove_diacritics 2`: Standardizes accents and umlauts (e.g., `café` matches `cafe`).
- `tokenchars '-.'`: Preserves hyphens and dots within technical terms (e.g., `tide-core` or `v1.2.0`).

### 4.2 Automated Synchronization Triggers

Automated database triggers guarantee that any write operation on the `notes` table is synchronously reflected in `note_snippets_fts`:

```sql
-- 1. Insert Trigger
CREATE TRIGGER IF NOT EXISTS trg_notes_fts_insert 
AFTER INSERT ON notes 
WHEN NEW.is_deleted = 0 
BEGIN
    INSERT INTO note_snippets_fts (id, title, content, tags)
    VALUES (NEW.id, NEW.title, NEW.content, NEW.tags);
END;

-- 2. Delete Trigger
CREATE TRIGGER IF NOT EXISTS trg_notes_fts_delete 
AFTER DELETE ON notes 
BEGIN
    DELETE FROM note_snippets_fts WHERE id = OLD.id;
END;

-- 3. Update Trigger (handles soft-delete transitions)
CREATE TRIGGER IF NOT EXISTS trg_notes_fts_update 
AFTER UPDATE ON notes 
BEGIN
    DELETE FROM note_snippets_fts WHERE id = OLD.id;
    INSERT INTO note_snippets_fts (id, title, content, tags)
    SELECT NEW.id, NEW.title, NEW.content, NEW.tags
    WHERE NEW.is_deleted = 0;
END;
```

### 4.3 Search Query Strategies

#### 4.3.1 BM25 Relevance Ranking & Column Weighting
Search results use the SQLite FTS5 `bm25` auxiliary function with column weightings emphasizing matches in the title over matches in the body:

```sql
SELECT 
    n.id,
    n.title,
    n.updated_at,
    snippet(note_snippets_fts, 2, '<mark>', '</mark>', '...', 15) AS content_snippet,
    bm25(note_snippets_fts, 0.0, 5.0, 1.0, 3.0) AS rank
FROM note_snippets_fts fts
JOIN notes n ON n.id = fts.id
WHERE note_snippets_fts MATCH :query
  AND n.is_deleted = 0
ORDER BY rank ASC
LIMIT :limit OFFSET :offset;
```
*Weight breakdown:* `id` (0.0), `title` (5.0), `content` (1.0), `tags` (3.0).

#### 4.3.2 Snippet Extraction
Contextual match highlighting is extracted using SQLite FTS5's built-in `snippet()` auxiliary function:
```sql
snippet(note_snippets_fts, -1, '<b>', '</b>', '...', 10)
```
- Parameters:
  - Column index: `-1` (automatically selects the column with the highest-density match, or specify column `2` to constrain strictly to note body content)
  - Prefix delimiter: `'<b>'`
  - Suffix delimiter: `'</b>'`
  - Ellipsis marker: `'...'`
  - Max token count: `10` tokens per snippet window

#### 4.3.3 Query Parsing & Escaping Strategies
The query builder in `crates/tide-core/src/db.rs` sanitizes user input and applies the following token patterns:

1. **Prefix / Autocomplete Matching:**
   For typing queries such as `"arch"`, the engine queries `arch*`:
   ```sql
   SELECT id, title FROM note_snippets_fts WHERE note_snippets_fts MATCH 'arch*' LIMIT 5;
   ```
2. **Exact Phrase Matching:**
   Terms enclosed in quotes are treated as atomic sequence tokens:
   ```sql
   SELECT id, title FROM note_snippets_fts WHERE note_snippets_fts MATCH '"offline first"' LIMIT 10;
   ```
3. **Compound Boolean Filtering:**
   ```sql
   SELECT id, title FROM note_snippets_fts WHERE note_snippets_fts MATCH 'rust AND (storage OR sqlite)' LIMIT 20;
   ```

---

## 5. Concurrency & Threading Model

SQLite supports concurrent readers but only **one writer** at any given moment. In a multi-threaded Rust application powered by Tokio, naive connection sharing causes lock starvation and thread blocking.

```
                      Tokio Worker Threads
                 ┌─────────────┬─────────────┐
                 │             │             │
                 ▼             ▼             ▼
          spawn_blocking  spawn_blocking  spawn_blocking
          (Read Request)  (Read Request)  (Write Request)
                 │             │             │
                 ▼             ▼             │
          ┌─────────────┬─────────────┐      │
          │ Reader Conn │ Reader Conn │      │
          │  (Pool #1)  │  (Pool #2)  │      │
          └──────┬──────┴──────┬──────┘      │
                 │             │             │
                 │   Shared    │             ▼
                 │  Database   │     ┌──────────────┐
                 │    Locks    │     │  Mutex-Guard │
                 │             │     │  Writer Conn │
                 ▼             ▼     └───────┬──────┘
             ┌────────────────────────────────┐
             │       ~/.tide/local.db         │
             │       (WAL Mode Store)         │
             └────────────────────────────────┘
```

### 5.1 Rusqlite in Async Context: `spawn_blocking`

Rusqlite uses synchronous OS system calls. Invoking Rusqlite methods directly inside a Tokio async task will block the Tokio worker threads. Therefore, all database invocations must be dispatched through `tokio::task::spawn_blocking`:

```rust
pub async fn get_note_by_id(&self, id: String) -> Result<Option<NoteRecord>, DbError> {
    let pool = self.reader_pool.clone();
    tokio::task::spawn_blocking(move || {
        let conn = pool.get()?;
        let mut stmt = conn.prepare(
            "SELECT id, title, content, is_pinned, is_archived, updated_at 
             FROM notes WHERE id = ?1 AND is_deleted = 0"
        )?;
        // Execute query and map rows...
    })
    .await
    .map_err(|e| DbError::JoinError(e.to_string()))?
}
```

### 5.2 Connection Management Architecture

`tide-core` employs a dual-connection pattern:

1. **Reader Pool (`r2d2::Pool<SqliteConnectionManager>`):**
   - Size: Scaled based on available CPU cores (typically `num_cpus * 2`, minimum 4).
   - Read-only queries execute concurrently across multiple connection handles without interfering with one another.
2. **Dedicated Single Writer (`Arc<tokio::sync::Mutex<rusqlite::Connection>>`):**
   - Exactly one dedicated connection handle executes all `INSERT`, `UPDATE`, `DELETE`, and `BEGIN TRANSACTION` operations.
   - Guarantees sequential write serialization at the Rust application layer, completely avoiding `SQLITE_BUSY` errors between competing local threads.

### 5.3 Busy Timeout & WAL Flush Dynamics

- With `PRAGMA busy_timeout = 5000;`, SQLite automatically retries if a reader and writer transiently compete during checkpoint operations.
- Background passive WAL checkpoints are run periodically:
  ```sql
  PRAGMA wal_checkpoint(PASSIVE);
  ```
  This prevents WAL log files (`local.db-wal`) from unbounded growth during long-running sessions.

---

## 6. Schema Migration Engine

Database schema upgrades are managed via an embedded, forward-only transactional migration runner using SQLite's built-in `PRAGMA user_version`.

### 6.1 Version Tracking Principles

1. **Monotonic Versioning:** Every migration step is represented by an integer counter ($v = 1, 2, 3, \dots$).
2. **Atomic Upgrades:** Every migration script runs inside an immediate transaction:
   ```sql
   BEGIN IMMEDIATE TRANSACTION;
   -- Schema modifications here
   PRAGMA user_version = <new_version>;
   COMMIT;
   ```
3. **Rollback on Failure:** If any migration step fails, the transaction is automatically rolled back, leaving the database intact at the previous valid version.

### 6.2 Migration Engine Implementation

```rust
pub struct Migration {
    pub version: u32,
    pub description: &'static str,
    pub sql: &'static str,
}

pub const MIGRATIONS: &[Migration] = &[
    Migration {
        version: 1,
        description: "Initial schema: notes, todos, note_links, sync tables, and FTS5",
        sql: include_str!("migrations/0001_initial.sql"),
    },
    Migration {
        version: 2,
        description: "Add dek_salt and encrypted_payload columns to notes",
        sql: include_str!("migrations/0002_encryption_fields.sql"),
    },
];

pub fn run_migrations(conn: &mut rusqlite::Connection) -> Result<(), DbError> {
    let current_version: u32 = conn.query_row(
        "PRAGMA user_version", 
        [], 
        |row| row.get(0)
    )?;

    for migration in MIGRATIONS {
        if migration.version > current_version {
            log::info!(
                "Executing migration v{}: {}", 
                migration.version, 
                migration.description
            );
            
            let tx = conn.transaction_with_behavior(
                rusqlite::TransactionBehavior::Immediate
            )?;
            
            tx.execute_batch(migration.sql)?;
            tx.pragma_update(None, "user_version", migration.version)?;
            tx.commit()?;
        }
    }
    
    Ok(())
}
```

---

## 7. Error Handling & Recovery Strategies

1. **Disk Contention & `SQLITE_BUSY`:**
   Mitigated by `PRAGMA busy_timeout = 5000` combined with the dedicated single-writer mutex.
2. **Database Corruption Detection:**
   On startup, `crates/tide-core/src/db.rs` issues a quick integrity check:
   ```sql
   PRAGMA quick_check;
   ```
   If the check returns anything other than `"ok"`, the connection manager halts initialization, preserves a timestamped snapshot (`~/.tide/local.db.corrupt.<timestamp>`), and notifies the application to trigger cloud re-hydration.
3. **Graceful Shutdown & WAL Checkpoint:**
   Upon application shutdown, connections are cleanly dropped after executing `PRAGMA wal_checkpoint(TRUNCATE)` to flush remaining transactions into `local.db` and eliminate disk overhead.
