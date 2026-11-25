package store

import (
	"context"
	"database/sql"
	"errors"
	"time"
)

// WebAuthnCredential is one registered passkey. CredentialJSON is the serialized go-webauthn
// credential record; it contains only public data (public key, flags, sign counter, AAGUID).
type WebAuthnCredential struct {
	CredentialID   string // base64url (raw, no padding)
	UserID         string
	PublicKey      []byte
	SignCount      uint32
	Transports     string // JSON array
	AAGUID         string
	Name           string
	CredentialJSON string
	CreatedAt      time.Time
	LastUsedAt     time.Time // zero if never used
}

const webauthnColumns = `credential_id, user_id, public_key, sign_count, transports, aaguid, name, credential_json, created_at, last_used_at`

func scanWebAuthnCredential(row interface{ Scan(...any) error }) (*WebAuthnCredential, error) {
	var c WebAuthnCredential
	var created int64
	var lastUsed sql.NullInt64
	var signCount int64
	if err := row.Scan(&c.CredentialID, &c.UserID, &c.PublicKey, &signCount, &c.Transports, &c.AAGUID, &c.Name, &c.CredentialJSON, &created, &lastUsed); err != nil {
		return nil, err
	}
	c.SignCount = uint32(signCount)
	c.CreatedAt = time.Unix(created, 0)
	if lastUsed.Valid && lastUsed.Int64 > 0 {
		c.LastUsedAt = time.Unix(lastUsed.Int64, 0)
	}
	return &c, nil
}

// ListWebAuthnCredentials returns all passkeys of a user, oldest first.
func (s *SQLiteStore) ListWebAuthnCredentials(ctx context.Context, userID string) ([]WebAuthnCredential, error) {
	rows, err := s.readDB().QueryContext(ctx, `SELECT `+webauthnColumns+` FROM webauthn_credentials WHERE user_id = ? ORDER BY created_at, credential_id`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []WebAuthnCredential{}
	for rows.Next() {
		c, err := scanWebAuthnCredential(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *c)
	}
	return out, rows.Err()
}

// GetWebAuthnCredential returns one passkey by id.
func (s *SQLiteStore) GetWebAuthnCredential(ctx context.Context, credentialID string) (*WebAuthnCredential, error) {
	c, err := scanWebAuthnCredential(s.readDB().QueryRowContext(ctx, `SELECT `+webauthnColumns+` FROM webauthn_credentials WHERE credential_id = ?`, credentialID))
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	return c, err
}

// AddWebAuthnCredentialWithRecovery inserts a passkey and stores the matching recovery vault (old one
// moves to recovery_vault_prev) in one transaction, refusing when the user already has maxPerUser.
func (s *SQLiteStore) AddWebAuthnCredentialWithRecovery(ctx context.Context, c WebAuthnCredential, recoveryVault string, maxPerUser int) error {
	tx, err := s.DB.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	var count int
	if err := tx.QueryRowContext(ctx, `SELECT COUNT(*) FROM webauthn_credentials WHERE user_id = ?`, c.UserID).Scan(&count); err != nil {
		return err
	}
	if count >= maxPerUser {
		return ErrTooManyCredentials
	}
	if _, err := tx.ExecContext(ctx, `INSERT INTO webauthn_credentials (`+webauthnColumns+`) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
		c.CredentialID, c.UserID, c.PublicKey, int64(c.SignCount), c.Transports, c.AAGUID, c.Name, c.CredentialJSON, c.CreatedAt.Unix()); err != nil {
		return err
	}
	res, err := tx.ExecContext(ctx, `
		UPDATE users
		SET recovery_vault_prev = CASE WHEN recovery_vault IS NOT NULL AND recovery_vault != '' THEN recovery_vault ELSE recovery_vault_prev END,
		    recovery_vault = ?
		WHERE id = ?`, recoveryVault, c.UserID)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrNotFound
	}
	return tx.Commit()
}

// DeleteWebAuthnCredentialWithRecovery removes a user's passkey and stores the recovery vault without
// its envelope (old one moves to recovery_vault_prev) in one transaction.
func (s *SQLiteStore) DeleteWebAuthnCredentialWithRecovery(ctx context.Context, userID, credentialID string, recoveryVault *string) error {
	tx, err := s.DB.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	res, err := tx.ExecContext(ctx, `DELETE FROM webauthn_credentials WHERE credential_id = ? AND user_id = ?`, credentialID, userID)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrNotFound
	}
	if recoveryVault != nil {
		if _, err := tx.ExecContext(ctx, `
			UPDATE users
			SET recovery_vault_prev = CASE WHEN recovery_vault IS NOT NULL AND recovery_vault != '' THEN recovery_vault ELSE recovery_vault_prev END,
			    recovery_vault = NULLIF(?, '')
			WHERE id = ?`, *recoveryVault, userID); err != nil {
			return err
		}
	}
	return tx.Commit()
}

// UpdateWebAuthnCredentialUse stores the new sign counter / record after a successful login.
func (s *SQLiteStore) UpdateWebAuthnCredentialUse(ctx context.Context, credentialID string, signCount uint32, credentialJSON string, usedAt time.Time) error {
	_, err := s.DB.ExecContext(ctx, `UPDATE webauthn_credentials SET sign_count = ?, credential_json = ?, last_used_at = ? WHERE credential_id = ?`,
		int64(signCount), credentialJSON, usedAt.Unix(), credentialID)
	return err
}

// ErrTooManyCredentials means the per-user passkey limit is reached.
var ErrTooManyCredentials = errors.New("too many passkeys")
