use std::path::Path;
use anyhow::{Context, Result};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct LocalNote {
    pub id: String,
    pub title: String,
    #[serde(default)]
    pub folder_id: Option<String>,
    pub content_markdown: String,
    #[serde(default)]
    pub is_encrypted: bool,
    #[serde(default)]
    pub tags: Option<String>,
    pub updated_at: i64,
    #[serde(default)]
    pub synced_at: Option<i64>,
    #[serde(default = "default_dirty")]
    pub dirty: bool,
}

fn default_dirty() -> bool {
    true
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct NoteSnippet {
    pub id: String,
    pub title: String,
    pub snippet: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct NoteLink {
    pub source_note_id: String,
    #[serde(default)]
    pub target_note_id: Option<String>,
    #[serde(default)]
    pub link_text: Option<String>,
    pub url_or_slug: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct LocalTodo {
    pub id: String,
    pub title: String,
    #[serde(default)]
    pub description: Option<String>,
    pub status: String,
    #[serde(default)]
    pub priority: Option<String>,
    #[serde(default)]
    pub due_date: Option<i64>,
    #[serde(default)]
    pub scheduled_date: Option<i64>,
    #[serde(default)]
    pub tags: Option<String>,
    #[serde(default)]
    pub is_completed: bool,
    pub updated_at: i64,
    #[serde(default = "default_dirty")]
    pub dirty: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct SyncQueueItem {
    #[serde(default)]
    pub queue_id: Option<i64>,
    pub entity_type: String,
    pub entity_id: String,
    pub action: String,
    #[serde(default)]
    pub payload: Option<String>,
    #[serde(default)]
    pub attempts: i32,
    pub created_at: i64,
}

pub struct Database {
    conn: Connection,
}

impl Database {
    pub fn open(path: &Path) -> Result<Database> {
        let conn = Connection::open(path)
            .with_context(|| format!("Failed to open SQLite database at {:?}", path))?;
        let db = Database { conn };
        db.init_schema()?;
        Ok(db)
    }

    pub fn in_memory() -> Result<Database> {
        let conn = Connection::open_in_memory()
            .context("Failed to open SQLite in-memory database")?;
        let db = Database { conn };
        db.init_schema()?;
        Ok(db)
    }

    pub fn conn(&self) -> &Connection {
        &self.conn
    }

    pub fn conn_mut(&mut self) -> &mut Connection {
        &mut self.conn
    }

    fn init_schema(&self) -> Result<()> {
        self.conn.execute_batch(
            "PRAGMA journal_mode = WAL;
             PRAGMA foreign_keys = ON;
             PRAGMA busy_timeout = 5000;

             CREATE TABLE IF NOT EXISTS local_notes (
                 id TEXT PRIMARY KEY,
                 title TEXT NOT NULL,
                 folder_id TEXT,
                 content_markdown TEXT NOT NULL,
                 is_encrypted BOOLEAN NOT NULL DEFAULT 0,
                 tags TEXT,
                 updated_at INTEGER NOT NULL,
                 synced_at INTEGER,
                 dirty BOOLEAN NOT NULL DEFAULT 1
             );

             CREATE VIRTUAL TABLE IF NOT EXISTS fts_notes USING fts5(
                 title,
                 content_markdown,
                 content='local_notes',
                 content_rowid='rowid'
             );

             CREATE TRIGGER IF NOT EXISTS local_notes_ai AFTER INSERT ON local_notes BEGIN
                 INSERT INTO fts_notes(rowid, title, content_markdown) VALUES (new.rowid, new.title, new.content_markdown);
             END;

             CREATE TRIGGER IF NOT EXISTS local_notes_ad AFTER DELETE ON local_notes BEGIN
                 INSERT INTO fts_notes(fts_notes, rowid, title, content_markdown) VALUES('delete', old.rowid, old.title, old.content_markdown);
             END;

             CREATE TRIGGER IF NOT EXISTS local_notes_au AFTER UPDATE ON local_notes BEGIN
                 INSERT INTO fts_notes(fts_notes, rowid, title, content_markdown) VALUES('delete', old.rowid, old.title, old.content_markdown);
                 INSERT INTO fts_notes(rowid, title, content_markdown) VALUES (new.rowid, new.title, new.content_markdown);
             END;

             CREATE TABLE IF NOT EXISTS note_links (
                 source_note_id TEXT NOT NULL,
                 target_note_id TEXT,
                 link_text TEXT,
                 url_or_slug TEXT NOT NULL,
                 PRIMARY KEY (source_note_id, url_or_slug)
             );

             CREATE TABLE IF NOT EXISTS local_todos (
                 id TEXT PRIMARY KEY,
                 title TEXT NOT NULL,
                 description TEXT,
                 status TEXT NOT NULL,
                 priority TEXT,
                 due_date INTEGER,
                 scheduled_date INTEGER,
                 tags TEXT,
                 is_completed BOOLEAN NOT NULL DEFAULT 0,
                 updated_at INTEGER NOT NULL,
                 dirty BOOLEAN NOT NULL DEFAULT 1
             );

             CREATE TABLE IF NOT EXISTS sync_queue (
                 queue_id INTEGER PRIMARY KEY AUTOINCREMENT,
                 entity_type TEXT NOT NULL,
                 entity_id TEXT NOT NULL,
                 action TEXT NOT NULL,
                 payload TEXT,
                 attempts INTEGER NOT NULL DEFAULT 0,
                 created_at INTEGER NOT NULL
             );"
        ).context("Failed to initialize database schema and migrations")?;

        Ok(())
    }

    pub fn upsert_note(&self, note: &LocalNote) -> Result<()> {
        self.conn.execute(
            "INSERT INTO local_notes (
                 id, title, folder_id, content_markdown, is_encrypted, tags, updated_at, synced_at, dirty
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
             ON CONFLICT(id) DO UPDATE SET
                 title = excluded.title,
                 folder_id = excluded.folder_id,
                 content_markdown = excluded.content_markdown,
                 is_encrypted = excluded.is_encrypted,
                 tags = excluded.tags,
                 updated_at = excluded.updated_at,
                 synced_at = excluded.synced_at,
                 dirty = excluded.dirty",
            params![
                note.id,
                note.title,
                note.folder_id,
                note.content_markdown,
                note.is_encrypted,
                note.tags,
                note.updated_at,
                note.synced_at,
                note.dirty,
            ],
        ).context("Failed to upsert local note")?;

        Ok(())
    }

    pub fn get_note_by_id(&self, id: &str) -> Result<Option<LocalNote>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, title, folder_id, content_markdown, is_encrypted, tags, updated_at, synced_at, dirty
             FROM local_notes
             WHERE id = ?1",
        )?;

        let note = stmt.query_row(params![id], |row| {
            Ok(LocalNote {
                id: row.get(0)?,
                title: row.get(1)?,
                folder_id: row.get(2)?,
                content_markdown: row.get(3)?,
                is_encrypted: row.get(4)?,
                tags: row.get(5)?,
                updated_at: row.get(6)?,
                synced_at: row.get(7)?,
                dirty: row.get(8)?,
            })
        }).optional().context("Failed to get local note by id")?;

        Ok(note)
    }

    pub fn search_notes(&self, query: &str, limit: usize) -> Result<Vec<NoteSnippet>> {
        let clean = query.trim();
        if clean.is_empty() {
            return Ok(Vec::new());
        }

        let mut stmt = self.conn.prepare(
            "SELECT n.id, n.title, snippet(fts_notes, 1, '', '', '...', 32) AS snippet
             FROM fts_notes
             JOIN local_notes n ON n.rowid = fts_notes.rowid
             WHERE fts_notes MATCH ?1
             ORDER BY rank
             LIMIT ?2",
        )?;

        let mut run_query = |q: &str| -> rusqlite::Result<Vec<NoteSnippet>> {
            let rows = stmt.query_map(params![q, limit as i64], |row| {
                Ok(NoteSnippet {
                    id: row.get(0)?,
                    title: row.get(1)?,
                    snippet: row.get::<_, Option<String>>(2)?.unwrap_or_default(),
                })
            })?;
            let mut results = Vec::new();
            for r in rows {
                results.push(r?);
            }
            Ok(results)
        };

        match run_query(clean) {
            Ok(results) => Ok(results),
            Err(_) => {
                let escaped = format!("\"{}\"", clean.replace('"', "\"\""));
                let results = run_query(&escaped)
                    .context("Failed to execute FTS5 search query")?;
                Ok(results)
            }
        }
    }

    pub fn list_todos(&self, status_filter: Option<&str>) -> Result<Vec<LocalTodo>> {
        let mut todos = Vec::new();

        if let Some(status) = status_filter {
            let mut stmt = self.conn.prepare(
                "SELECT id, title, description, status, priority, due_date, scheduled_date, tags, is_completed, updated_at, dirty
                 FROM local_todos
                 WHERE status = ?1
                 ORDER BY updated_at DESC",
            )?;
            let rows = stmt.query_map(params![status], Self::map_todo_row)?;
            for row in rows {
                todos.push(row?);
            }
        } else {
            let mut stmt = self.conn.prepare(
                "SELECT id, title, description, status, priority, due_date, scheduled_date, tags, is_completed, updated_at, dirty
                 FROM local_todos
                 ORDER BY updated_at DESC",
            )?;
            let rows = stmt.query_map([], Self::map_todo_row)?;
            for row in rows {
                todos.push(row?);
            }
        }

        Ok(todos)
    }

    fn map_todo_row(row: &rusqlite::Row) -> rusqlite::Result<LocalTodo> {
        Ok(LocalTodo {
            id: row.get(0)?,
            title: row.get(1)?,
            description: row.get(2)?,
            status: row.get(3)?,
            priority: row.get(4)?,
            due_date: row.get(5)?,
            scheduled_date: row.get(6)?,
            tags: row.get(7)?,
            is_completed: row.get(8)?,
            updated_at: row.get(9)?,
            dirty: row.get(10)?,
        })
    }

    pub fn patch_todo_status(&self, id: &str, is_completed: bool, status: &str) -> Result<()> {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as i64;

        let rows_affected = self.conn.execute(
            "UPDATE local_todos
             SET is_completed = ?1, status = ?2, updated_at = ?3, dirty = 1
             WHERE id = ?4",
            params![is_completed, status, now, id],
        ).context("Failed to patch todo status")?;

        if rows_affected == 0 {
            anyhow::bail!("Todo with id '{}' not found", id);
        }

        Ok(())
    }

    pub fn get_note_links(&self, note_id: &str) -> Result<Vec<NoteLink>> {
        let mut stmt = self.conn.prepare(
            "SELECT source_note_id, target_note_id, link_text, url_or_slug
             FROM note_links
             WHERE source_note_id = ?1
             ORDER BY url_or_slug ASC",
        )?;

        let rows = stmt.query_map(params![note_id], |row| {
            Ok(NoteLink {
                source_note_id: row.get(0)?,
                target_note_id: row.get(1)?,
                link_text: row.get(2)?,
                url_or_slug: row.get(3)?,
            })
        })?;

        let mut links = Vec::new();
        for r in rows {
            links.push(r?);
        }
        Ok(links)
    }

    pub fn upsert_note_link(&self, link: &NoteLink) -> Result<()> {
        self.conn.execute(
            "INSERT INTO note_links (source_note_id, target_note_id, link_text, url_or_slug)
             VALUES (?1, ?2, ?3, ?4)
             ON CONFLICT(source_note_id, url_or_slug) DO UPDATE SET
                 target_note_id = excluded.target_note_id,
                 link_text = excluded.link_text",
            params![
                link.source_note_id,
                link.target_note_id,
                link.link_text,
                link.url_or_slug,
            ],
        ).context("Failed to upsert note link")?;

        Ok(())
    }

    pub fn upsert_todo(&self, todo: &LocalTodo) -> Result<()> {
        self.conn.execute(
            "INSERT INTO local_todos (
                 id, title, description, status, priority, due_date, scheduled_date, tags, is_completed, updated_at, dirty
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
             ON CONFLICT(id) DO UPDATE SET
                 title = excluded.title,
                 description = excluded.description,
                 status = excluded.status,
                 priority = excluded.priority,
                 due_date = excluded.due_date,
                 scheduled_date = excluded.scheduled_date,
                 tags = excluded.tags,
                 is_completed = excluded.is_completed,
                 updated_at = excluded.updated_at,
                 dirty = excluded.dirty",
            params![
                todo.id,
                todo.title,
                todo.description,
                todo.status,
                todo.priority,
                todo.due_date,
                todo.scheduled_date,
                todo.tags,
                todo.is_completed,
                todo.updated_at,
                todo.dirty,
            ],
        ).context("Failed to upsert local todo")?;

        Ok(())
    }
}
