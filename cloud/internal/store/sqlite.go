package store

import (
	"context"
	"database/sql"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/nicoh/tide/internal/db"
	_ "modernc.org/sqlite" // Register modernc.org/sqlite driver
)

// SQLiteStore implements the database interface using SQLite.
type SQLiteStore struct {
	DB *sql.DB
}

// NewSQLiteStore initializes the SQLite database and runs migrations.
func NewSQLiteStore(dataDir string) (*SQLiteStore, error) {
	if err := os.MkdirAll(dataDir, 0755); err != nil {
		return nil, fmt.Errorf("failed to create data dir: %w", err)
	}

	dbPath := filepath.Join(dataDir, "tide.db")
	dsn := fmt.Sprintf("file:%s?_pragma=busy_timeout(5000)&_pragma=journal_mode(WAL)&_pragma=synchronous(NORMAL)", dbPath)

	conn, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, fmt.Errorf("failed to open db: %w", err)
	}

	// SQLite-specific optimizations for concurrency
	conn.SetMaxOpenConns(1)
	conn.SetMaxIdleConns(1)
	conn.SetConnMaxLifetime(time.Hour)

	if err := conn.Ping(); err != nil {
		return nil, fmt.Errorf("failed to ping db: %w", err)
	}

	s := &SQLiteStore{DB: conn}
	if err := s.migrate(); err != nil {
		return nil, fmt.Errorf("migration failed: %w", err)
	}

	return s, nil
}

func (s *SQLiteStore) migrate() error {
	// 1. Create Tables
	tables := `
	CREATE TABLE IF NOT EXISTS users (
		id TEXT PRIMARY KEY,
		email_blind_index TEXT UNIQUE,
		username_blind_index TEXT,
		phone_blind_index TEXT UNIQUE,
		encrypted_vault BLOB NOT NULL,
		encrypted_pepper BLOB NOT NULL,
		public_key TEXT NOT NULL,
		enabled_extensions TEXT DEFAULT '[]',
		pin_hash TEXT,
		login_code TEXT,
		username TEXT,
		created_at DATETIME NOT NULL
	);

	CREATE TABLE IF NOT EXISTS files (
		id TEXT PRIMARY KEY,
		owner_id TEXT NOT NULL,
		parent_id TEXT,
		type TEXT NOT NULL,
		mime_type TEXT,
		size INTEGER NOT NULL,
		created_at DATETIME NOT NULL,
		updated_at DATETIME NOT NULL,
		blob_path TEXT,
		-- visibility column might be missing in old DBs, handled below
		public_meta JSON,
		secured_meta BLOB,
		FOREIGN KEY(owner_id) REFERENCES users(id)
	);

	CREATE TABLE IF NOT EXISTS file_backups (
		id TEXT PRIMARY KEY,
		file_id TEXT NOT NULL,
		slot_name TEXT NOT NULL,
		encrypted_blob TEXT NOT NULL,
		secured_meta BLOB,
		updated_at DATETIME NOT NULL,
		FOREIGN KEY(file_id) REFERENCES files(id),
		UNIQUE(file_id, slot_name)
	);

    CREATE TABLE IF NOT EXISTS file_shares (
		file_id TEXT NOT NULL,
		user_id TEXT NOT NULL,
		secured_meta BLOB,
		status TEXT DEFAULT 'pending',
		created_at DATETIME NOT NULL,
		PRIMARY KEY (file_id, user_id),
		FOREIGN KEY(file_id) REFERENCES files(id),
		FOREIGN KEY(user_id) REFERENCES users(id)
	);

    CREATE TABLE IF NOT EXISTS tokens (
		token TEXT PRIMARY KEY,
		user_id TEXT NOT NULL,
		expires_at DATETIME NOT NULL
	);

	CREATE TABLE IF NOT EXISTS links (
		source_id TEXT NOT NULL,
		target_id TEXT NOT NULL,
		type TEXT NOT NULL,
		created_at DATETIME NOT NULL,
		PRIMARY KEY (source_id, target_id),
		FOREIGN KEY(source_id) REFERENCES files(id),
		FOREIGN KEY(target_id) REFERENCES files(id)
	);

	CREATE TABLE IF NOT EXISTS messages (
		id TEXT PRIMARY KEY,
		sender_id TEXT NOT NULL,
		recipient_id TEXT NOT NULL,
		content TEXT NOT NULL,
		status TEXT DEFAULT 'pending',
		created_at DATETIME NOT NULL,
		FOREIGN KEY(sender_id) REFERENCES users(id),
		FOREIGN KEY(recipient_id) REFERENCES users(id)
	);

	CREATE TABLE IF NOT EXISTS contacts (
		id TEXT PRIMARY KEY,
		user_id TEXT NOT NULL,
		contact_id TEXT NOT NULL,
		status TEXT NOT NULL, -- 'pending', 'accepted'
		created_at DATETIME NOT NULL,
		FOREIGN KEY(user_id) REFERENCES users(id),
		FOREIGN KEY(contact_id) REFERENCES users(id),
		UNIQUE(user_id, contact_id)
	);

	CREATE TABLE IF NOT EXISTS ext_finance_accounts (
		id TEXT PRIMARY KEY,
		user_id TEXT NOT NULL,
		name TEXT NOT NULL,
		type TEXT NOT NULL,
		created_at DATETIME NOT NULL,
		FOREIGN KEY(user_id) REFERENCES users(id)
	);

	CREATE TABLE IF NOT EXISTS ext_finance_transactions (
		id TEXT PRIMARY KEY,
		user_id TEXT NOT NULL,
		date DATETIME NOT NULL,
		description TEXT NOT NULL,
		created_at DATETIME NOT NULL,
		FOREIGN KEY(user_id) REFERENCES users(id)
	);

	CREATE TABLE IF NOT EXISTS ext_finance_entries (
		id TEXT PRIMARY KEY,
		transaction_id TEXT NOT NULL,
		account_id TEXT NOT NULL,
		amount REAL NOT NULL,
		FOREIGN KEY(transaction_id) REFERENCES ext_finance_transactions(id),
		FOREIGN KEY(account_id) REFERENCES ext_finance_accounts(id)
	);

	CREATE TABLE IF NOT EXISTS tasks (
		id TEXT PRIMARY KEY,
		user_id TEXT NOT NULL,
		encrypted_vault BLOB NOT NULL,
		created_at DATETIME NOT NULL,
		updated_at DATETIME NOT NULL,
		FOREIGN KEY(user_id) REFERENCES users(id)
	);

	CREATE TABLE IF NOT EXISTS profiles (
		user_id TEXT PRIMARY KEY,
		avatar_seed TEXT NOT NULL,
		avatar_style TEXT NOT NULL DEFAULT 'notionists',
		avatar_salt TEXT NOT NULL DEFAULT '',
		bio TEXT NOT NULL,
		title TEXT NOT NULL,
		profile_status INTEGER NOT NULL DEFAULT 0,
		FOREIGN KEY(user_id) REFERENCES users(id)
	);
	`
	if _, err := s.DB.Exec(tables); err != nil {
		return err
	}

	// 2. Robust Migrations (Handle legacy encrypted_data column by recreation)
	if err := s.handleUserSchemaMigration(); err != nil {
		return fmt.Errorf("failed to migrate users table: %w", err)
	}

	// 3. Additional safely added columns for other tables
	// Ignore errors if column already exists
	_, _ = s.DB.Exec("ALTER TABLE files ADD COLUMN visibility TEXT DEFAULT 'private'")
	_, _ = s.DB.Exec("ALTER TABLE file_shares ADD COLUMN secured_meta BLOB")
	_, _ = s.DB.Exec("ALTER TABLE file_shares ADD COLUMN status TEXT DEFAULT 'pending'")
	_, _ = s.DB.Exec("ALTER TABLE messages ADD COLUMN status TEXT DEFAULT 'pending'")
	_, _ = s.DB.Exec("ALTER TABLE ext_finance_accounts ADD COLUMN linked_account_id TEXT")
	_, _ = s.DB.Exec("ALTER TABLE files ADD COLUMN is_task INTEGER DEFAULT 0")
	_, _ = s.DB.Exec("ALTER TABLE files ADD COLUMN is_completed INTEGER DEFAULT 0")
	_, _ = s.DB.Exec("ALTER TABLE files ADD COLUMN exdates TEXT DEFAULT '[]'")
	_, _ = s.DB.Exec("ALTER TABLE files ADD COLUMN completed_dates TEXT DEFAULT '[]'")
	_, _ = s.DB.Exec("ALTER TABLE files ADD COLUMN version INTEGER DEFAULT 1")
	_, _ = s.DB.Exec("ALTER TABLE files ADD COLUMN metadata TEXT")
	_, _ = s.DB.Exec("ALTER TABLE files ADD COLUMN access_keys TEXT")
	_, _ = s.DB.Exec("ALTER TABLE users ADD COLUMN is_verified INTEGER DEFAULT 0")
	_, _ = s.DB.Exec("ALTER TABLE profiles ADD COLUMN avatar_salt TEXT NOT NULL DEFAULT ''")
	_, _ = s.DB.Exec("ALTER TABLE file_backups ADD COLUMN secured_meta BLOB")

	// 4. Create Indices (Now that columns exist)
	indices := `
	CREATE INDEX IF NOT EXISTS idx_files_parent ON files(parent_id);
	CREATE INDEX IF NOT EXISTS idx_files_owner ON files(owner_id);
	CREATE INDEX IF NOT EXISTS idx_files_visibility ON files(visibility);
	
	CREATE INDEX IF NOT EXISTS idx_links_source ON links(source_id);
	CREATE INDEX IF NOT EXISTS idx_links_target ON links(target_id);
	`
	if _, err := s.DB.Exec(indices); err != nil {
		return err
	}

	return nil
}

func (s *SQLiteStore) handleUserSchemaMigration() error {
	// Check if legacy column exists
	rows, err := s.DB.Query("PRAGMA table_info(users)")
	if err != nil {
		// Table might not exist yet if this is first run, handled by tables creation above
		return nil
	}
	defer rows.Close()

	hasLegacy := false
	hasEncryptedData := false
	hasLegacyVault := false

	for rows.Next() {
		var cid int
		var name, dtype string
		var notnull, pk int
		var dfltValue interface{}
		if err := rows.Scan(&cid, &name, &dtype, &notnull, &dfltValue, &pk); err != nil {
			return err
		}
		if name == "encrypted_data" {
			hasEncryptedData = true
			hasLegacy = true
		}
		if name == "encrypted_vault" {
			hasLegacyVault = true
		}
	}

	// Check if the table still has the old UNIQUE constraint on username
	var tableSQL string
	err = s.DB.QueryRow("SELECT sql FROM sqlite_schema WHERE type='table' AND name='users'").Scan(&tableSQL)
	if err == nil && strings.Contains(tableSQL, "username_blind_index TEXT UNIQUE") {
		log.Println("CRITICAL MIGRATION: Legacy UNIQUE constraint detected on username_blind_index.")
		hasLegacy = true
	}

	if !hasLegacy {
		// Still try to add new columns if they don't exist (ALTER TABLE is safer for small updates)
		_, _ = s.DB.Exec("ALTER TABLE users ADD COLUMN encrypted_vault BLOB")
		_, _ = s.DB.Exec("ALTER TABLE users ADD COLUMN encrypted_pepper BLOB")
		_, _ = s.DB.Exec("ALTER TABLE users ADD COLUMN enabled_extensions TEXT DEFAULT '[]'")
		_, _ = s.DB.Exec("ALTER TABLE users ADD COLUMN pin_hash TEXT")
		_, _ = s.DB.Exec("ALTER TABLE users ADD COLUMN login_code TEXT")
		_, _ = s.DB.Exec("ALTER TABLE users ADD COLUMN username TEXT")
		return nil
	}

	log.Println("CRITICAL MIGRATION: Legacy 'encrypted_data' column detected in 'users' table. Recreating table to ensure schema consistency.")

	// Standard SQLite table recreation pattern
	tx, err := s.DB.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	// 1. Rename existing table
	if _, err := tx.Exec("ALTER TABLE users RENAME TO users_old"); err != nil {
		return err
	}

	// 2. Create new table (same as in tables definition)
	newTable := `
	CREATE TABLE users (
		id TEXT PRIMARY KEY,
		email_blind_index TEXT UNIQUE,
		username_blind_index TEXT,
		phone_blind_index TEXT UNIQUE,
		encrypted_vault BLOB NOT NULL,
		encrypted_pepper BLOB NOT NULL,
		public_key TEXT NOT NULL,
		enabled_extensions TEXT DEFAULT '[]',
		pin_hash TEXT,
		login_code TEXT,
		username TEXT,
		created_at DATETIME NOT NULL
	);`
	if _, err := tx.Exec(newTable); err != nil {
		return err
	}

	// 3. Move data (Mapping old fields, initializing new ones with empty values since they are broken anyway)
	var copyData string
	if hasLegacyVault && !hasEncryptedData {
		log.Println("CRITICAL MIGRATION: Preserving existing encrypted_vault and encrypted_pepper data.")
		copyData = `
		INSERT INTO users (id, email_blind_index, username_blind_index, phone_blind_index, encrypted_vault, encrypted_pepper, public_key, enabled_extensions, pin_hash, login_code, username, created_at, is_verified)
		SELECT id, email_blind_index, username_blind_index, phone_blind_index, encrypted_vault, encrypted_pepper, public_key, COALESCE(enabled_extensions, '[]'), pin_hash, login_code, '', created_at, 0
		FROM users_old;`
	} else {
		log.Println("CRITICAL MIGRATION: Initializing empty vaults for legacy encrypted_data users.")
		copyData = `
		INSERT INTO users (id, email_blind_index, username_blind_index, phone_blind_index, encrypted_vault, encrypted_pepper, public_key, enabled_extensions, pin_hash, login_code, username, created_at, is_verified)
		SELECT id, email_blind_index, username_blind_index, phone_blind_index, '', '', public_key, COALESCE(enabled_extensions, '[]'), pin_hash, login_code, '', created_at, 0
		FROM users_old;`
	}
	if _, err := tx.Exec(copyData); err != nil {
		return err
	}

	// 4. Drop old table
	if _, err := tx.Exec("DROP TABLE users_old"); err != nil {
		return err
	}

	return tx.Commit()
}

// --- User Operations ---

func (s *SQLiteStore) CreateUser(ctx context.Context, user *db.User) error {
	query := `
		INSERT INTO users (id, email_blind_index, username_blind_index, phone_blind_index, encrypted_vault, encrypted_pepper, public_key, enabled_extensions, pin_hash, login_code, username, created_at, is_verified)
		VALUES (?, ?, ?, ?, ?, ?, ?, COALESCE(?, '[]'), ?, ?, ?, ?, ?)
	`
	_, err := s.DB.ExecContext(ctx, query,
		user.ID,
		user.EmailHash,
		user.UsernameHash,
		user.PhoneHash,
		user.EncryptedVault,
		user.EncryptedPepper,
		user.PublicKey,
		user.EnabledExtensions,
		user.PinHash,
		user.LoginCode,
		user.Username,
		user.CreatedAt,
		user.IsVerified,
	)
	if err != nil {
		// Detect unique constraint violation
		// modernc/sqlite error handling might vary, simplifying
		return err
	}
	return nil
}

func (s *SQLiteStore) GetUser(ctx context.Context, id string) (*db.User, error) {
		query := `SELECT id, email_blind_index, username_blind_index, phone_blind_index, encrypted_vault, encrypted_pepper, public_key, COALESCE(enabled_extensions, '[]') as enabled_extensions, COALESCE(pin_hash, '') as pin_hash, COALESCE(login_code, '') as login_code, COALESCE(username, '') as username, created_at, COALESCE(is_verified, 0) as is_verified FROM users WHERE id = ?`
	row := s.DB.QueryRowContext(ctx, query, id)

	var user db.User
	var ext string
	err := row.Scan(
		&user.ID,
		&user.EmailHash,
		&user.UsernameHash,
		&user.PhoneHash,
		&user.EncryptedVault,
		&user.EncryptedPepper,
		&user.PublicKey,
		&ext,
		&user.PinHash,
		&user.LoginCode,
		&user.Username,
		&user.CreatedAt,
		&user.IsVerified,
	)
	if err == nil {
		user.EnabledExtensions = []byte(ext)
	}
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return &user, nil
}

// GetUserExtensions returns the unmarshalled array of enabled extensions for a user
func (s *SQLiteStore) GetUserExtensions(ctx context.Context, id string) ([]string, error) {
	user, err := s.GetUser(ctx, id)
	if err != nil {
		return nil, err
	}
	if user == nil { // GetUser returns ErrNotFound, so user would be nil if not found
		return nil, ErrNotFound
	}

	var extensions []string
	if len(user.EnabledExtensions) > 0 {
		if err := json.Unmarshal(user.EnabledExtensions, &extensions); err != nil {
			return nil, err
		}
	} else {
		extensions = []string{}
	}

	return extensions, nil
}

func (s *SQLiteStore) GetUserByEmailHash(ctx context.Context, emailHash string) (*db.User, error) {
	// We query by the Blind Index
		query := `SELECT id, email_blind_index, username_blind_index, phone_blind_index, encrypted_vault, encrypted_pepper, public_key, COALESCE(enabled_extensions, '[]') as enabled_extensions, COALESCE(pin_hash, '') as pin_hash, COALESCE(login_code, '') as login_code, COALESCE(username, '') as username, created_at, COALESCE(is_verified, 0) as is_verified FROM users WHERE email_blind_index = ?`
	row := s.DB.QueryRowContext(ctx, query, emailHash)

	var user db.User
	var ext string
	err := row.Scan(
		&user.ID,
		&user.EmailHash,
		&user.UsernameHash,
		&user.PhoneHash,
		&user.EncryptedVault,
		&user.EncryptedPepper,
		&user.PublicKey,
		&ext,
		&user.PinHash,
		&user.LoginCode,
		&user.Username,
		&user.CreatedAt,
		&user.IsVerified,
	)
	if err == nil {
		user.EnabledExtensions = []byte(ext)
	}
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return &user, nil
}

func (s *SQLiteStore) UpdateUserUsername(ctx context.Context, id string, username string) error {
	// Update both the plaintext username and the blind index
	h := sha256.Sum256([]byte(username))
	usernameHash := hex.EncodeToString(h[:])

	query := `UPDATE users SET username = ?, username_blind_index = ? WHERE id = ?`
	_, err := s.DB.ExecContext(ctx, query, username, usernameHash, id)
	return err
}

func (s *SQLiteStore) SetLoginCode(ctx context.Context, userID, code string) error {
	query := `UPDATE users SET login_code = ? WHERE id = ?`
	_, err := s.DB.ExecContext(ctx, query, code, userID)
	return err
}

func (s *SQLiteStore) UpdateUserPin(ctx context.Context, id string, pinHash string) error {
	query := `UPDATE users SET pin_hash = ? WHERE id = ?`
	_, err := s.DB.ExecContext(ctx, query, pinHash, id)
	return err
}

func (s *SQLiteStore) UpdateUserExtensions(ctx context.Context, id string, extensions []byte) error {
	query := `UPDATE users SET enabled_extensions = ? WHERE id = ?`
	_, err := s.DB.ExecContext(ctx, query, string(extensions), id)
	return err
}

// --- File Operations ---

func (s *SQLiteStore) CreateFile(ctx context.Context, file *db.File) error {
	query := `
		INSERT INTO files (id, owner_id, parent_id, type, mime_type, size, 
created_at, updated_at, blob_path, visibility, public_meta, secured_meta, is_task, is_completed, exdates, completed_dates, version, metadata, access_keys)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`
	exd := string(file.Exdates)
	if exd == "" {
		exd = "[]"
	}
	cd := string(file.CompletedDates)
	if cd == "" {
		cd = "[]"
	}
	md := string(file.Metadata)
	if md == "" {
		md = "{}"
	}
	ak := string(file.AccessKeys)
	if ak == "" {
		ak = "{}"
	}
	_, err := s.DB.ExecContext(ctx, query,
		file.ID,
		file.OwnerID,
		file.ParentID,
		file.Type,
		file.MIMEType,
		file.Size,
		file.CreatedAt,
		file.UpdatedAt,
		file.BlobPath,
		file.Visibility,
		file.PublicMeta,
		file.SecuredMeta,
		file.IsTask,
		file.IsCompleted,
		exd,
		cd,
		file.Version,
		md,
		ak,
	)
	return err
}

func (s *SQLiteStore) GetFile(ctx context.Context, id string) (*db.File, error) {
		query := `SELECT id, owner_id, parent_id, type, mime_type, size, created_at, updated_at, blob_path, COALESCE(visibility, 'private') as visibility, public_meta, COALESCE(secured_meta, x'') as secured_meta, COALESCE(is_task, 0) as is_task, COALESCE(is_completed, 0) as is_completed, COALESCE(NULLIF(exdates, ''), '[]') as exdates, COALESCE(NULLIF(completed_dates, ''), '[]') as completed_dates, COALESCE(version, 1) as version, COALESCE(NULLIF(metadata, ''), '{}') as metadata, COALESCE(NULLIF(access_keys, ''), '{}') as access_keys FROM files WHERE id = ?`
	row := s.DB.QueryRowContext(ctx, query, id)

	var file db.File
	var exd, cd, md, ak string
	err := row.Scan(
		&file.ID,
		&file.OwnerID,
		&file.ParentID,
		&file.Type,
		&file.MIMEType,
		&file.Size,
		&file.CreatedAt,
		&file.UpdatedAt,
		&file.BlobPath,
		&file.Visibility,
		&file.PublicMeta,
		&file.SecuredMeta,
		&file.IsTask,
		&file.IsCompleted,
		&exd,
		&cd,
		&file.Version,
		&md,
		&ak,
	)
	if err == nil {
		file.Exdates = json.RawMessage(exd)
		file.CompletedDates = json.RawMessage(cd)
		file.Metadata = json.RawMessage(md)
		file.AccessKeys = json.RawMessage(ak)
	}
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return &file, nil
}

// GetAccessibleFile returns a file if it's owned by, shared with, or public to the viewer.
func (s *SQLiteStore) UserHasFileAccess(ctx context.Context, userID, fileID string) (bool, error) {
	// First check if they own the file directly
	var count int
	err := s.DB.QueryRowContext(ctx, "SELECT COUNT(1) FROM files WHERE id = ? AND owner_id = ?", fileID, userID).Scan(&count)
	if err != nil {
		return false, err
	}
	if count > 0 {
		return true, nil
	}

	// Then check if it has been shared with them
	// Join with users to handle legacy/draft shares vs accepted invitations
	err = s.DB.QueryRowContext(ctx, "SELECT COUNT(1) FROM file_shares WHERE file_id = ? AND recipient_id = ? AND status = 'accepted'", fileID, userID).Scan(&count)
	if err != nil {
		return false, err
	}

	// If it's a public file, technically they also have access
	if count == 0 {
		var visibility string
		err = s.DB.QueryRowContext(ctx, "SELECT visibility FROM files WHERE id = ?", fileID).Scan(&visibility)
		if err == nil && visibility == "public" {
			return true, nil
		}
	}

	return count > 0, nil
}

// GetAccessibleFile returns a file if it's owned by, shared with, or public to the viewer.
// Crucially, it returns the viewable SecuredMeta (joining from shares if needed).
func (s *SQLiteStore) GetAccessibleFile(ctx context.Context, id string, viewerID string) (*db.File, error) {
	query := `
		SELECT f.id, f.owner_id, f.parent_id, f.type, f.mime_type, f.size, f.created_at, f.updated_at, f.blob_path, COALESCE(f.visibility, 'private') as visibility, f.public_meta,
			   COALESCE(fs.secured_meta, f.secured_meta, x'') as secured_meta,
			   COALESCE(fs.status, 'owner') as share_status,
			   COALESCE(f.is_task, 0) as is_task,
			   COALESCE(f.is_completed, 0) as is_completed,
			   COALESCE(NULLIF(f.exdates, ''), '[]') as exdates,
			   COALESCE(NULLIF(f.completed_dates, ''), '[]') as completed_dates,
			   COALESCE(f.version, 1) as version,
			   COALESCE(NULLIF(f.metadata, ''), '{}') as metadata,
			   COALESCE(NULLIF(f.access_keys, ''), '{}') as access_keys
		FROM files f
		LEFT JOIN file_shares fs ON f.id = fs.file_id AND fs.user_id = ?
		WHERE f.id = ? AND (
			f.owner_id = ? 
			OR fs.user_id = ?
			OR COALESCE(f.visibility, 'private') = 'public'
			OR json_extract(f.access_keys, '$.' || ?) IS NOT NULL
		)
	`
	row := s.DB.QueryRowContext(ctx, query, viewerID, id, viewerID, viewerID, viewerID)

	var f db.File
	var exd, cd, md, ak string
	err := row.Scan(
		&f.ID,
		&f.OwnerID,
		&f.ParentID,
		&f.Type,
		&f.MIMEType,
		&f.Size,
		&f.CreatedAt,
		&f.UpdatedAt,
		&f.BlobPath,
		&f.Visibility,
		&f.PublicMeta,
		&f.SecuredMeta,
		&f.ShareStatus,
		&f.IsTask,
		&f.IsCompleted,
		&exd,
		&cd,
		&f.Version,
		&md,
		&ak,
	)
	if err == nil {
		f.Exdates = json.RawMessage(exd)
		f.CompletedDates = json.RawMessage(cd)
		f.Metadata = json.RawMessage(md)
		f.AccessKeys = json.RawMessage(ak)
	}
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return &f, nil
}

func (s *SQLiteStore) UpdateFile(ctx context.Context, file *db.File) error {
	query := `
		UPDATE files
		SET owner_id=?, parent_id=?, type=?, mime_type=?, size=?, updated_at=?, 
blob_path=?, visibility=?, public_meta=?, secured_meta=?, is_task=?, is_completed=?, exdates=?, completed_dates=?, version=?, metadata=?, access_keys=?
		WHERE id=?
	`
	exd := string(file.Exdates)
	if exd == "" {
		exd = "[]"
	}
	cd := string(file.CompletedDates)
	if cd == "" {
		cd = "[]"
	}
	md := string(file.Metadata)
	if md == "" {
		md = "{}"
	}
	ak := string(file.AccessKeys)
	if ak == "" {
		ak = "{}"
	}
	_, err := s.DB.ExecContext(ctx, query,
		file.OwnerID,
		file.ParentID,
		file.Type,
		file.MIMEType,
		file.Size,
		file.UpdatedAt,
		file.BlobPath,
		file.Visibility,
		file.PublicMeta,
		file.SecuredMeta,
		file.IsTask,
		file.IsCompleted,
		exd,
		cd,
		file.Version,
		md,
		ak,
		file.ID,
	)
	return err
}

func (s *SQLiteStore) DeleteFile(ctx context.Context, id string) error {
	query := `DELETE FROM files WHERE id = ?`
	res, err := s.DB.ExecContext(ctx, query, id)
	if err != nil {
		return err
	}
	rows, _ := res.RowsAffected()
	if rows == 0 {
		return ErrNotFound
	}
	return nil
}
func (s *SQLiteStore) SetVisibility(ctx context.Context, fileID string, visibility string) error {
	query := `UPDATE files SET visibility = ?, updated_at = ? WHERE id = ?`
	_, err := s.DB.ExecContext(ctx, query, visibility, time.Now(), fileID)
	return err
}

func (s *SQLiteStore) SetVisibilityRecursive(ctx context.Context, folderID string, visibility string) error {
	// 1. Find all descendants using recursive CTE
	// 2. Update their visibility
	// We can do this in a single query if SQLite version is recent (3.8.3+)
	query := `
		WITH RECURSIVE descendants(id) AS (
			SELECT id FROM files WHERE id = ?
			UNION ALL
			SELECT f.id FROM files f JOIN descendants d ON f.parent_id = d.id
		)
		UPDATE files 
		SET visibility = ?, updated_at = ?
		WHERE id IN (SELECT id FROM descendants)
	`
	_, err := s.DB.ExecContext(ctx, query, folderID, visibility, time.Now())
	return err
}

func (s *SQLiteStore) RemoveShare(ctx context.Context, fileID, userID string) error {
	query := `DELETE FROM file_shares WHERE file_id = ? AND user_id = ?`
	res, err := s.DB.ExecContext(ctx, query, fileID, userID)
	if err != nil {
		return err
	}
	rows, _ := res.RowsAffected()
	if rows == 0 {
		return ErrNotFound
	}
	return nil
}

func (s *SQLiteStore) ShareFile(ctx context.Context, fileID string, userID string, securedMeta []byte) error {
	query := `INSERT OR REPLACE INTO file_shares (file_id, user_id, secured_meta, status, created_at) VALUES (?, ?, ?, ?, ?)`
	_, err := s.DB.ExecContext(ctx, query, fileID, userID, securedMeta, "pending", time.Now())
	return err
}

func (s *SQLiteStore) AcceptShare(ctx context.Context, fileID string, userID string) error {
	query := `UPDATE file_shares SET status = 'accepted' WHERE file_id = ? AND user_id = ?`
	_, err := s.DB.ExecContext(ctx, query, fileID, userID)

	// Auto-accept children shares if this is a folder (like an Event Theme)
	queryChildren := `
		UPDATE file_shares 
		SET status = 'accepted' 
		WHERE user_id = ? AND file_id IN (SELECT id FROM files WHERE parent_id = ?)
	`
	s.DB.ExecContext(ctx, queryChildren, userID, fileID)

	return err
}

func (s *SQLiteStore) ListAccessibleFiles(ctx context.Context, viewerID string, parentID *string, filterType *string, recursive bool) ([]*db.File, error) {
	var rows *sql.Rows
	var err error

	typeFilter := ""
	args := []interface{}{}
	args = append(args, viewerID) // for COALESCE join

	if filterType != nil {
		typeFilter = " AND f.type = ? "
	}

	if recursive {
		// Flat list of EVERYTHING accessible (Owned, Shared, Public)
		query := `
			SELECT f.id, f.owner_id, f.parent_id, f.type, f.mime_type, f.size, f.created_at, f.updated_at, f.blob_path, COALESCE(f.visibility, 'private') as visibility, f.public_meta, 
			       COALESCE(fs.secured_meta, f.secured_meta, x'') as secured_meta,
			       COALESCE(fs.status, 'owner') as share_status,
			       COALESCE(f.is_task, 0) as is_task,
			       COALESCE(f.is_completed, 0) as is_completed,
			       COALESCE(NULLIF(f.exdates, ''), '[]') as exdates,
			       COALESCE(NULLIF(f.completed_dates, ''), '[]') as completed_dates,
			       COALESCE(f.version, 1) as version,
			       COALESCE(NULLIF(f.metadata, ''), '{}') as metadata,
			       COALESCE(NULLIF(f.access_keys, ''), '{}') as access_keys
			FROM files f
			LEFT JOIN file_shares fs ON f.id = fs.file_id AND fs.user_id = ?
			WHERE (
				f.owner_id = ? 
				OR fs.user_id = ?
				OR COALESCE(f.visibility, 'private') = 'public'
				OR json_extract(f.access_keys, '$.' || ?) IS NOT NULL
			) ` + typeFilter

		args = append(args, viewerID, viewerID, viewerID)
		if filterType != nil {
			args = append(args, *filterType)
		}
		rows, err = s.DB.QueryContext(ctx, query, args...)
	} else if parentID != nil {
		query := `
			SELECT f.id, f.owner_id, f.parent_id, f.type, f.mime_type, f.size, f.created_at, f.updated_at, f.blob_path, COALESCE(f.visibility, 'private') as visibility, f.public_meta, 
			       COALESCE(fs.secured_meta, f.secured_meta, x'') as secured_meta,
			       COALESCE(fs.status, 'owner') as share_status,
			       COALESCE(f.is_task, 0) as is_task,
			       COALESCE(f.is_completed, 0) as is_completed,
			       COALESCE(NULLIF(f.exdates, ''), '[]') as exdates,
			       COALESCE(NULLIF(f.completed_dates, ''), '[]') as completed_dates,
			       COALESCE(f.version, 1) as version,
			       COALESCE(NULLIF(f.metadata, ''), '{}') as metadata,
			       COALESCE(NULLIF(f.access_keys, ''), '{}') as access_keys
			FROM files f
			LEFT JOIN file_shares fs ON f.id = fs.file_id AND fs.user_id = ?
			WHERE f.parent_id = ? ` + typeFilter + ` AND (
				f.owner_id = ? 
				OR fs.user_id = ?
				OR COALESCE(f.visibility, 'private') = 'public'
				OR json_extract(f.access_keys, '$.' || ?) IS NOT NULL
			)
		`
		args = append(args, *parentID)
		if filterType != nil {
			args = append(args, *filterType)
		}
		args = append(args, viewerID, viewerID, viewerID)
		rows, err = s.DB.QueryContext(ctx, query, args...)
	} else {
		// Root (Traditional)
		if filterType != nil && *filterType == "event" {
			// Special case for Calendar: Fetch global events if type=event
			query := `
			SELECT f.id, f.owner_id, f.parent_id, f.type, f.mime_type, f.size, f.created_at, f.updated_at, f.blob_path, COALESCE(f.visibility, 'private') as visibility, f.public_meta,
			       COALESCE(fs.secured_meta, f.secured_meta, x'') as secured_meta,
			       COALESCE(fs.status, 'owner') as share_status,
			       COALESCE(f.is_task, 0) as is_task,
			       COALESCE(f.is_completed, 0) as is_completed,
			       COALESCE(NULLIF(f.exdates, ''), '[]') as exdates,
			       COALESCE(NULLIF(f.completed_dates, ''), '[]') as completed_dates,
			       COALESCE(f.version, 1) as version,
			       COALESCE(NULLIF(f.metadata, ''), '{}') as metadata,
			       COALESCE(NULLIF(f.access_keys, ''), '{}') as access_keys
			FROM files f
			LEFT JOIN file_shares fs ON f.id = fs.file_id AND fs.user_id = ?
			WHERE f.type = ? AND (f.owner_id = ? OR fs.user_id = ? OR json_extract(f.access_keys, '$.' || ?) IS NOT NULL)
			`
			rows, err = s.DB.QueryContext(ctx, query, viewerID, *filterType, viewerID, viewerID, viewerID)
		} else {
			// Normal folder listing
			query := `
			SELECT f.id, f.owner_id, f.parent_id, f.type, f.mime_type, f.size, f.created_at, f.updated_at, f.blob_path, COALESCE(f.visibility, 'private') as visibility, f.public_meta,
			       COALESCE(fs.secured_meta, f.secured_meta, x'') as secured_meta,
			       COALESCE(fs.status, 'owner') as share_status,
			       COALESCE(f.is_task, 0) as is_task,
			       COALESCE(f.is_completed, 0) as is_completed,
			       COALESCE(NULLIF(f.exdates, ''), '[]') as exdates,
			       COALESCE(NULLIF(f.completed_dates, ''), '[]') as completed_dates,
			       COALESCE(f.version, 1) as version,
			       COALESCE(NULLIF(f.metadata, ''), '{}') as metadata,
			       COALESCE(NULLIF(f.access_keys, ''), '{}') as access_keys
			FROM files f
			LEFT JOIN file_shares fs ON f.id = fs.file_id AND fs.user_id = ?
			WHERE (f.owner_id = ? AND f.parent_id IS NULL)
			OR fs.user_id = ?
			OR json_extract(f.access_keys, '$.' || ?) IS NOT NULL
			`
			rows, err = s.DB.QueryContext(ctx, query, viewerID, viewerID, viewerID, viewerID)
		}
	}

	if err != nil {
		return nil, err
	}
	defer rows.Close()

	results := make([]*db.File, 0)
	var exd, cd, md, ak string
	for rows.Next() {
		var f db.File
		if err := rows.Scan(
			&f.ID,
			&f.OwnerID,
			&f.ParentID,
			&f.Type,
			&f.MIMEType,
			&f.Size,
			&f.CreatedAt,
			&f.UpdatedAt,
			&f.BlobPath,
			&f.Visibility,
			&f.PublicMeta,
			&f.SecuredMeta,
			&f.ShareStatus,
			&f.IsTask,
			&f.IsCompleted,
			&exd,
			&cd,
			&f.Version,
			&md,
			&ak,
		); err != nil {
			return nil, err
		}
		f.Exdates = json.RawMessage(exd)
		f.CompletedDates = json.RawMessage(cd)
		f.Metadata = json.RawMessage(md)
		f.AccessKeys = json.RawMessage(ak)
		results = append(results, &f)
	}
	return results, nil
}

// SetLoginCode ... (remaining code)
// SetLoginCode ... (remaining code)

// Legacy ListFiles (update or remove? Update to point to ListAccessibleFiles wrapper)
func (s *SQLiteStore) ListFiles(ctx context.Context, ownerID string, parentID *string) ([]*db.File, error) {
	// Re-route to AccessibleFiles assuming viewer is owner
	return s.ListAccessibleFiles(ctx, ownerID, parentID, nil, false)
}

// --- Token Operations ---

func (s *SQLiteStore) SetToken(ctx context.Context, token string, userID string, ttl time.Duration) error {
	query := `INSERT INTO tokens (token, user_id, expires_at) VALUES (?, ?, ?)`
	expiresAt := time.Now().Add(ttl)
	_, err := s.DB.ExecContext(ctx, query, token, userID, expiresAt)
	return err
}

func (s *SQLiteStore) GetToken(ctx context.Context, token string) (string, error) {
	query := `SELECT user_id, expires_at FROM tokens WHERE token = ?`
	row := s.DB.QueryRowContext(ctx, query, token)
	var userID string
	var expiresAt time.Time
	if err := row.Scan(&userID, &expiresAt); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return "", ErrNotFound
		}
		return "", err
	}
	if time.Now().After(expiresAt) {
		_ = s.DeleteToken(ctx, token)
		return "", ErrNotFound
	}
	return userID, nil
}

func (s *SQLiteStore) DeleteToken(ctx context.Context, token string) error {
	query := `DELETE FROM tokens WHERE token = ?`
	_, err := s.DB.ExecContext(ctx, query, token)
	return err
}

// --- Link Operations ---

func (s *SQLiteStore) CreateLink(ctx context.Context, link db.Link) error {
	query := `INSERT INTO links (source_id, target_id, type, created_at) VALUES (?, ?, ?, ?)`
	_, err := s.DB.ExecContext(ctx, query, link.SourceID, link.TargetID, link.Type, link.CreatedAt)
	return err
}

func (s *SQLiteStore) DeleteLink(ctx context.Context, sourceID, targetID string) error {
	query := `DELETE FROM links WHERE source_id = ? AND target_id = ?`
	res, err := s.DB.ExecContext(ctx, query, sourceID, targetID)
	if err != nil {
		return err
	}
	rows, _ := res.RowsAffected()
	if rows == 0 {
		return ErrNotFound
	}
	return nil
}

func (s *SQLiteStore) GetOutlinks(ctx context.Context, sourceID string) ([]db.Link, error) {
	query := `SELECT source_id, target_id, type, created_at FROM links WHERE source_id = ?`
	rows, err := s.DB.QueryContext(ctx, query, sourceID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var results []db.Link
	for rows.Next() {
		var l db.Link
		if err := rows.Scan(&l.SourceID, &l.TargetID, &l.Type, &l.CreatedAt); err != nil {
			return nil, err
		}
		results = append(results, l)
	}
	return results, nil
}

func (s *SQLiteStore) GetBacklinks(ctx context.Context, targetID string) ([]db.Link, error) {
	query := `SELECT source_id, target_id, type, created_at FROM links WHERE target_id = ?`
	rows, err := s.DB.QueryContext(ctx, query, targetID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var results []db.Link
	for rows.Next() {
		var l db.Link
		if err := rows.Scan(&l.SourceID, &l.TargetID, &l.Type, &l.CreatedAt); err != nil {
			return nil, err
		}
		results = append(results, l)
	}
	return results, nil
}

// --- Message Operations ---

func (s *SQLiteStore) GetConversations(ctx context.Context, userID string) ([]*db.User, error) {
	query := `
		SELECT u.id, u.email_blind_index, u.username_blind_index, u.phone_blind_index, u.encrypted_vault, u.encrypted_pepper, u.public_key, COALESCE(u.enabled_extensions, '[]') as enabled_extensions, u.created_at, COALESCE(u.is_verified, 0) as is_verified
		FROM users u
		JOIN (
			SELECT 
				CASE WHEN sender_id = ? THEN recipient_id ELSE sender_id END AS partner_id,
				MAX(created_at) as last_activity
			FROM messages
			WHERE sender_id = ? OR recipient_id = ?
			GROUP BY partner_id
		) m ON u.id = m.partner_id
		ORDER BY m.last_activity DESC
	`
	rows, err := s.DB.QueryContext(ctx, query, userID, userID, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var results []*db.User
	for rows.Next() {
		var u db.User
		var ext string
		if err := rows.Scan(
			&u.ID,
			&u.EmailHash,
			&u.UsernameHash,
			&u.PhoneHash,
			&u.EncryptedVault,
			&u.EncryptedPepper,
			&u.PublicKey,
			&ext,
			&u.CreatedAt,
			&u.IsVerified,
		); err != nil {
			return nil, err
		}
		u.EnabledExtensions = []byte(ext)
		results = append(results, &u)
	}
	return results, nil
}

func (s *SQLiteStore) CreateMessage(ctx context.Context, msg *Message) error {
	query := `INSERT INTO messages (id, sender_id, recipient_id, content, status, created_at) VALUES (?, ?, ?, ?, ?, ?)`
	_, err := s.DB.ExecContext(ctx, query, msg.ID, msg.SenderID, msg.RecipientID, msg.Content, msg.Status, msg.CreatedAt)
	return err
}

func (s *SQLiteStore) UpdateMessageStatus(ctx context.Context, id string, status string) error {
	query := `UPDATE messages SET status = ? WHERE id = ?`
	_, err := s.DB.ExecContext(ctx, query, status, id)
	return err
}

func (s *SQLiteStore) GetMessage(ctx context.Context, id string) (*Message, error) {
	query := `SELECT id, sender_id, recipient_id, content, status, created_at FROM messages WHERE id = ?`
	row := s.DB.QueryRowContext(ctx, query, id)
	var m Message
	if err := row.Scan(&m.ID, &m.SenderID, &m.RecipientID, &m.Content, &m.Status, &m.CreatedAt); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return &m, nil
}

func (s *SQLiteStore) GetMessages(ctx context.Context, user1, user2 string) ([]*Message, error) {
	// Fetch conversation between user1 AND user2 (both directions)
	query := `
		SELECT id, sender_id, recipient_id, content, status, created_at 
		FROM messages 
		WHERE (sender_id = ? AND recipient_id = ?) 
		   OR (sender_id = ? AND recipient_id = ?)
		ORDER BY created_at ASC
	`
	rows, err := s.DB.QueryContext(ctx, query, user1, user2, user2, user1)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var results []*Message
	for rows.Next() {
		var m Message
		if err := rows.Scan(&m.ID, &m.SenderID, &m.RecipientID, &m.Content, &m.Status, &m.CreatedAt); err != nil {
			return nil, err
		}
		results = append(results, &m)
	}
	return results, nil
}

func (s *SQLiteStore) DeleteConversation(ctx context.Context, user1, user2 string) error {
	query := `DELETE FROM messages WHERE (sender_id = ? AND recipient_id = ?) OR (sender_id = ? AND recipient_id = ?)`
	_, err := s.DB.ExecContext(ctx, query, user1, user2, user2, user1)
	return err
}

// --- Contact Operations ---

func (s *SQLiteStore) CreateContact(ctx context.Context, c *Contact) error {
	query := `INSERT OR IGNORE INTO contacts (id, user_id, contact_id, status, created_at) VALUES (?, ?, ?, ?, ?)`
	_, err := s.DB.ExecContext(ctx, query, c.ID, c.UserID, c.ContactID, c.Status, c.CreatedAt)
	return err
}

func (s *SQLiteStore) GetContactRequests(ctx context.Context, userID string) ([]*Contact, error) {
	// Incoming pending requests (where I am the contact_id)
	query := `
		SELECT c.id, c.user_id, c.contact_id, c.status, c.created_at, COALESCE(p.avatar_seed, u.id), COALESCE(p.avatar_style, 'notionists'), COALESCE(u.username, '')
		FROM contacts c
		LEFT JOIN profiles p ON c.user_id = p.user_id
		LEFT JOIN users u ON c.user_id = u.id
		WHERE c.contact_id = ? AND c.status = 'pending'
	`
	rows, err := s.DB.QueryContext(ctx, query, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var results []*Contact
	for rows.Next() {
		var c Contact
		if err := rows.Scan(&c.ID, &c.UserID, &c.ContactID, &c.Status, &c.CreatedAt, &c.AvatarSeed, &c.AvatarStyle, &c.Username); err != nil {
			log.Printf("Error scanning GetContactRequests: %v", err)
			return nil, err
		}
		results = append(results, &c)
	}
	return results, nil
}

func (s *SQLiteStore) AcceptContact(ctx context.Context, id string) error {
	query := `UPDATE contacts SET status = 'accepted' WHERE id = ?`
	_, err := s.DB.ExecContext(ctx, query, id)
	return err
}

func (s *SQLiteStore) DeleteContact(ctx context.Context, id string) error {
	query := `DELETE FROM contacts WHERE id = ?`
	_, err := s.DB.ExecContext(ctx, query, id)
	return err
}

func (s *SQLiteStore) GetContacts(ctx context.Context, userID string) ([]*Contact, error) {
	// Return accepted contacts where user is either initiator or receiver
	// We want to return the PARTNER's ID as ContactID in the result for easy frontend use
	query := `
		SELECT 
			c.id, 
			c.user_id, 
			CASE WHEN c.user_id = ? THEN c.contact_id ELSE c.user_id END as contact_partner_id,
			c.status, 
			c.created_at,
			COALESCE(p.avatar_seed, u.id),
			COALESCE(p.avatar_style, 'notionists'),
			COALESCE(u.username, '')
		FROM contacts c
		LEFT JOIN users u ON u.id = (CASE WHEN c.user_id = ? THEN c.contact_id ELSE c.user_id END)
		LEFT JOIN profiles p ON p.user_id = (CASE WHEN c.user_id = ? THEN c.contact_id ELSE c.user_id END)
		WHERE (c.user_id = ? OR c.contact_id = ?) AND c.status = 'accepted'
	`
	rows, err := s.DB.QueryContext(ctx, query, userID, userID, userID, userID, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var results []*Contact
	for rows.Next() {
		var c Contact
		if err := rows.Scan(&c.ID, &c.UserID, &c.ContactID, &c.Status, &c.CreatedAt, &c.AvatarSeed, &c.AvatarStyle, &c.Username); err != nil {
			log.Printf("Error scanning GetContacts: %v", err)
			return nil, err
		}
		results = append(results, &c)
	}
	return results, nil
}

func (s *SQLiteStore) GetContact(ctx context.Context, user1, user2 string) (*Contact, error) {
	query := `SELECT id, user_id, contact_id, status, created_at FROM contacts WHERE (user_id = ? AND contact_id = ?) OR (user_id = ? AND contact_id = ?)`
	row := s.DB.QueryRowContext(ctx, query, user1, user2, user2, user1)
	var c Contact
	if err := row.Scan(&c.ID, &c.UserID, &c.ContactID, &c.Status, &c.CreatedAt); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return &c, nil
}

// --- Profiles & Social ---

func (s *SQLiteStore) GetProfile(ctx context.Context, userID string) (*db.Profile, error) {
	query := `SELECT user_id, avatar_seed, COALESCE(avatar_style, 'notionists') as avatar_style, COALESCE(avatar_salt, '') as avatar_salt, bio, title, profile_status FROM profiles WHERE user_id = ?`
	row := s.DB.QueryRowContext(ctx, query, userID)
	
	var p db.Profile
	if err := row.Scan(&p.UserID, &p.AvatarSeed, &p.AvatarStyle, &p.AvatarSalt, &p.Bio, &p.Title, &p.ProfileStatus); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			// Return a default profile instead of 404 so we can at least show name/verified status if they exist
			p.UserID = userID
			p.AvatarSeed = userID
			p.ProfileStatus = 1 // Default new users to PUBLIC so they can be found and banner doesn't show
		} else {
			return nil, err
		}
	}
	return &p, nil
}

func (s *SQLiteStore) UpsertProfile(ctx context.Context, profile *db.Profile) error {
	query := `
	INSERT INTO profiles (user_id, avatar_seed, avatar_style, avatar_salt, bio, title, profile_status)
		VALUES (?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(user_id) DO UPDATE SET
			avatar_seed = excluded.avatar_seed,
			avatar_style = excluded.avatar_style,
			avatar_salt = excluded.avatar_salt,
			bio = excluded.bio,
			title = excluded.title,
			profile_status = excluded.profile_status
	`
	_, err := s.DB.ExecContext(ctx, query, 
		profile.UserID, profile.AvatarSeed, profile.AvatarStyle, profile.AvatarSalt, profile.Bio, profile.Title, profile.ProfileStatus,
	)
	return err
}

func (s *SQLiteStore) GetRandomProfiles(ctx context.Context, limit int, skipUserID string) ([]*db.SearchResult, error) {
	query := `
		SELECT 'profile' as type, u.id, u.username, COALESCE(p.title, '') as title, u.id as owner_id, COALESCE(u.is_verified, 0) as owner_is_verified, COALESCE(p.bio, '') as bio, COALESCE(p.avatar_seed, u.id) as avatar_seed, COALESCE(p.avatar_style, 'notionists') as avatar_style, COALESCE(p.avatar_salt, '') as avatar_salt
		FROM users u
		LEFT JOIN profiles p ON p.user_id = u.id
		WHERE (COALESCE(p.profile_status, 0) > 0 OR COALESCE(u.is_verified, 0) = 1) AND u.id != ?
		ORDER BY RANDOM()
		LIMIT ?
	`
	rows, err := s.DB.QueryContext(ctx, query, skipUserID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var results []*db.SearchResult
	for rows.Next() {
		var r db.SearchResult
		var isVerified int
		if err := rows.Scan(&r.Type, &r.ID, &r.Username, &r.Title, &r.OwnerID, &isVerified, &r.Bio, &r.AvatarSeed, &r.AvatarStyle, &r.AvatarSalt); err != nil {
			return nil, err
		}
		r.OwnerIsVerified = (isVerified == 1)
		results = append(results, &r)
	}
	return results, nil
}

// ListPublicFiles returns public and contact-shared files owned by specific user.
func (s *SQLiteStore) ListPublicFiles(ctx context.Context, ownerID string, viewerID string) ([]*db.File, error) {
	// Check if viewer is a contact of the owner
	isContact := false
	if viewerID != "" && viewerID != ownerID {
		c, err := s.GetContact(ctx, ownerID, viewerID)
		if err == nil && c != nil && c.Status == "accepted" {
			isContact = true
		}
	}

	query := `
		SELECT f.id, f.owner_id, f.parent_id, f.type, f.mime_type, f.size, f.created_at, f.updated_at, f.blob_path, COALESCE(f.visibility, 'private') as visibility, f.public_meta, COALESCE(f.secured_meta, x'') as secured_meta, 
			       COALESCE(fs.status, 'owner') as share_status,
			       COALESCE(f.is_task, 0), COALESCE(f.is_completed, 0),
			       COALESCE(NULLIF(f.exdates, ''), '[]') as exdates, COALESCE(NULLIF(f.completed_dates, ''), '[]') as completed_dates,
				   COALESCE(f.version, 1) as version, COALESCE(NULLIF(f.metadata, ''), '{}') as metadata, COALESCE(NULLIF(f.access_keys, ''), '{}') as access_keys
		FROM files f
		LEFT JOIN file_shares fs ON f.id = fs.file_id AND fs.user_id = ?
		WHERE f.owner_id = ? AND (
			COALESCE(f.visibility, 'private') = 'public' 
			OR (? = 1 AND COALESCE(f.visibility, 'private') = 'contacts')
			OR f.owner_id = ?
		)
	`
	isContactVal := 0
	if isContact {
		isContactVal = 1
	}

	rows, err := s.DB.QueryContext(ctx, query, viewerID, ownerID, isContactVal, viewerID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var results []*db.File
	for rows.Next() {
		var f db.File
		var exd, cd, md, ak string
		if err := rows.Scan(
			&f.ID,
			&f.OwnerID,
			&f.ParentID,
			&f.Type,
			&f.MIMEType,
			&f.Size,
			&f.CreatedAt,
			&f.UpdatedAt,
			&f.BlobPath,
			&f.Visibility,
			&f.PublicMeta,
			&f.SecuredMeta,
			&f.ShareStatus,
			&f.IsTask,
			&f.IsCompleted,
			&exd,
			&cd,
			&f.Version,
			&md,
			&ak,
		); err != nil {
			return nil, err
		}
		f.Exdates = json.RawMessage(exd)
		f.CompletedDates = json.RawMessage(cd)
		f.Metadata = json.RawMessage(md)
		f.AccessKeys = json.RawMessage(ak)
		results = append(results, &f)
	}
	return results, nil
}

func (s *SQLiteStore) SearchPublicData(ctx context.Context, searchQuery string, skipUserID string) ([]*db.SearchResult, error) {
	likeQuery := "%" + searchQuery + "%"
	
	// Create blind index hash for exact email search
	h := sha256.Sum256([]byte(searchQuery))
	emailHash := hex.EncodeToString(h[:])

	// Search Profiles and Notes
	query := `
		SELECT 'profile' as type, u.id, COALESCE(u.username, '') as username, COALESCE(p.title, '') as title, u.id as owner_id, COALESCE(u.is_verified, 0) as owner_is_verified, COALESCE(p.bio, '') as bio, COALESCE(p.avatar_seed, u.id) as avatar_seed, COALESCE(p.avatar_style, 'notionists') as avatar_style, COALESCE(p.avatar_salt, '') as avatar_salt
		FROM users u
		LEFT JOIN profiles p ON p.user_id = u.id
		WHERE (COALESCE(u.username, '') LIKE ? OR u.email_blind_index = ? OR COALESCE(p.title, '') LIKE ?) AND u.id != ?
		
		UNION ALL
		
		SELECT 'note' as type, f.id, COALESCE(u.username, '') as username, json_extract(f.metadata, '$.title') as title, f.owner_id as owner_id, COALESCE(u.is_verified, 0) as owner_is_verified, '' as bio, '' as avatar_seed, 'notionists' as avatar_style, '' as avatar_salt
		FROM files f
		JOIN users u ON f.owner_id = u.id
		WHERE (json_extract(f.metadata, '$.is_public') = 1 OR json_extract(f.metadata, '$.is_public') = 'true' OR json_extract(f.metadata, '$.is_public') = true)
		AND json_extract(f.metadata, '$.title') LIKE ?
		AND u.id != ?
	`
	
	rows, err := s.DB.QueryContext(ctx, query, likeQuery, emailHash, likeQuery, skipUserID, likeQuery, skipUserID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var results []*db.SearchResult
	for rows.Next() {
		r := &db.SearchResult{}
		var isVerified int
		if err := rows.Scan(&r.Type, &r.ID, &r.Username, &r.Title, &r.OwnerID, &isVerified, &r.Bio, &r.AvatarSeed, &r.AvatarStyle, &r.AvatarSalt); err != nil {
			return nil, err
		}
		r.OwnerIsVerified = (isVerified == 1)
		results = append(results, r)
	}
	return results, nil
}

// FileBackup Methods

func (s *SQLiteStore) GetFileBackups(ctx context.Context, fileID string) ([]db.FileBackup, error) {
		query := `SELECT id, file_id, slot_name, COALESCE(secured_meta, x'') as secured_meta, updated_at FROM file_backups WHERE file_id = ? ORDER BY updated_at DESC`
	rows, err := s.DB.QueryContext(ctx, query, fileID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var backups []db.FileBackup
	for rows.Next() {
		var b db.FileBackup
		if err := rows.Scan(&b.ID, &b.FileID, &b.SlotName, &b.SecuredMeta, &b.UpdatedAt); err != nil {
			return nil, err
		}
		backups = append(backups, b)
	}
	return backups, nil
}

func (s *SQLiteStore) GetFileBackup(ctx context.Context, fileID, slotName string) (*db.FileBackup, error) {
		query := `SELECT id, file_id, slot_name, encrypted_blob, COALESCE(secured_meta, x'') as secured_meta, updated_at FROM file_backups WHERE file_id = ? AND slot_name = ?`
	row := s.DB.QueryRowContext(ctx, query, fileID, slotName)
	var b db.FileBackup
	if err := row.Scan(&b.ID, &b.FileID, &b.SlotName, &b.EncryptedBlob, &b.SecuredMeta, &b.UpdatedAt); err != nil {
		if err == sql.ErrNoRows {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return &b, nil
}

func (s *SQLiteStore) UpsertFileBackup(ctx context.Context, b *db.FileBackup) error {
	query := `
		INSERT INTO file_backups (id, file_id, slot_name, encrypted_blob, secured_meta, updated_at)
		VALUES (?, ?, ?, ?, ?, ?)
		ON CONFLICT(file_id, slot_name) DO UPDATE SET
			encrypted_blob = excluded.encrypted_blob,
			secured_meta = excluded.secured_meta,
			updated_at = excluded.updated_at
	`
	_, err := s.DB.ExecContext(ctx, query, b.ID, b.FileID, b.SlotName, b.EncryptedBlob, b.SecuredMeta, b.UpdatedAt)
	return err
}




