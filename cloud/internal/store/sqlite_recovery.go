package store

import (
	"context"
	"database/sql"
	"errors"
)

// --- Vault recovery ---
//
// recovery_vault holds a client-encrypted second wrapping of the user's private key (JSON, opaque to
// the server). encrypted_vault_prev keeps exactly one previous generation of encrypted_vault so a
// faulty replacement can be rolled back by an operator.

// GetRecoveryVault returns the stored recovery vault or "" when none is set.
func (s *SQLiteStore) GetRecoveryVault(ctx context.Context, userID string) (string, error) {
	var v sql.NullString
	err := s.readDB().QueryRowContext(ctx, `SELECT recovery_vault FROM users WHERE id = ?`, userID).Scan(&v)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return "", ErrNotFound
		}
		return "", err
	}
	if !v.Valid {
		return "", nil
	}
	return v.String, nil
}

// SetRecoveryVault stores (or replaces) the recovery vault of one user.
func (s *SQLiteStore) SetRecoveryVault(ctx context.Context, userID, recoveryVault string) error {
	res, err := s.DB.ExecContext(ctx, `UPDATE users SET recovery_vault = ? WHERE id = ?`, recoveryVault, userID)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrNotFound
	}
	return nil
}

// ReplaceEncryptedVault copies the current encrypted_vault into encrypted_vault_prev and stores the
// new one in a single UPDATE (atomic in SQLite; the right-hand sides see the old row values).
// recoveryVault is only written when non-nil.
func (s *SQLiteStore) ReplaceEncryptedVault(ctx context.Context, userID string, newVault []byte, recoveryVault *string) error {
	res, err := s.DB.ExecContext(ctx, `
		UPDATE users
		SET encrypted_vault_prev = CAST(encrypted_vault AS TEXT),
		    encrypted_vault = ?,
		    recovery_vault = COALESCE(?, recovery_vault)
		WHERE id = ?`, newVault, recoveryVault, userID)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrNotFound
	}
	return nil
}

// GetEncryptedVaultPrev returns the previous vault generation or "" when none is kept.
func (s *SQLiteStore) GetEncryptedVaultPrev(ctx context.Context, userID string) (string, error) {
	var v sql.NullString
	err := s.readDB().QueryRowContext(ctx, `SELECT encrypted_vault_prev FROM users WHERE id = ?`, userID).Scan(&v)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return "", ErrNotFound
		}
		return "", err
	}
	if !v.Valid {
		return "", nil
	}
	return v.String, nil
}
