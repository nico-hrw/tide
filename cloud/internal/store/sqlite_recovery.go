package store

import (
	"context"
	"database/sql"
	"errors"
	"time"
)

// --- Vault recovery ---
//
// recovery_vault holds a client-encrypted second wrapping of the user's private key (JSON, opaque to
// the server). encrypted_vault_prev / recovery_vault_prev keep the previous generation, and
// vault_replaced_at (unix seconds) the time of the last vault replacement, so a replaced vault can be
// rolled back by an operator and is not lost by a quick second replacement.

// ErrVaultReplaceCooldown means the vault was replaced too recently to replace it again.
var ErrVaultReplaceCooldown = errors.New("vault was replaced too recently")

func (s *SQLiteStore) nullableUserString(ctx context.Context, column, userID string) (string, error) {
	var v sql.NullString
	// column is always one of the fixed names used below, never user input.
	err := s.readDB().QueryRowContext(ctx, `SELECT `+column+` FROM users WHERE id = ?`, userID).Scan(&v)
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

// GetRecoveryVault returns the stored recovery vault or "" when none is set.
func (s *SQLiteStore) GetRecoveryVault(ctx context.Context, userID string) (string, error) {
	return s.nullableUserString(ctx, "recovery_vault", userID)
}

// GetRecoveryVaultPrev returns the previous recovery vault or "".
func (s *SQLiteStore) GetRecoveryVaultPrev(ctx context.Context, userID string) (string, error) {
	return s.nullableUserString(ctx, "recovery_vault_prev", userID)
}

// GetEncryptedVaultPrev returns the previous vault generation or "" when none is kept.
func (s *SQLiteStore) GetEncryptedVaultPrev(ctx context.Context, userID string) (string, error) {
	return s.nullableUserString(ctx, "encrypted_vault_prev", userID)
}

// GetVaultReplacedAt returns the time of the last vault replacement (zero time if never).
func (s *SQLiteStore) GetVaultReplacedAt(ctx context.Context, userID string) (time.Time, error) {
	var v sql.NullInt64
	err := s.readDB().QueryRowContext(ctx, `SELECT vault_replaced_at FROM users WHERE id = ?`, userID).Scan(&v)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return time.Time{}, ErrNotFound
		}
		return time.Time{}, err
	}
	if !v.Valid || v.Int64 == 0 {
		return time.Time{}, nil
	}
	return time.Unix(v.Int64, 0), nil
}

// SetRecoveryVault stores (or replaces) the recovery vault; an existing one moves to recovery_vault_prev.
func (s *SQLiteStore) SetRecoveryVault(ctx context.Context, userID, recoveryVault string) error {
	res, err := s.DB.ExecContext(ctx, `
		UPDATE users
		SET recovery_vault_prev = CASE WHEN recovery_vault IS NOT NULL AND recovery_vault != '' THEN recovery_vault ELSE recovery_vault_prev END,
		    recovery_vault = ?
		WHERE id = ?`, recoveryVault, userID)
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
// It refuses with ErrVaultReplaceCooldown when the last replacement is newer than cooldown, so the
// kept previous generation is never silently overwritten. recoveryVault is only written when non-nil
// (the old one then moves to recovery_vault_prev).
func (s *SQLiteStore) ReplaceEncryptedVault(ctx context.Context, userID string, newVault []byte, recoveryVault *string, now time.Time, cooldown time.Duration) error {
	res, err := s.DB.ExecContext(ctx, `
		UPDATE users
		SET encrypted_vault_prev = CAST(encrypted_vault AS TEXT),
		    encrypted_vault = ?,
		    recovery_vault_prev = CASE WHEN ? IS NOT NULL AND recovery_vault IS NOT NULL AND recovery_vault != '' THEN recovery_vault ELSE recovery_vault_prev END,
		    recovery_vault = COALESCE(?, recovery_vault),
		    vault_replaced_at = ?
		WHERE id = ? AND (vault_replaced_at IS NULL OR vault_replaced_at <= ?)`,
		newVault, recoveryVault, recoveryVault, now.Unix(), userID, now.Add(-cooldown).Unix())
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		if _, err := s.GetVaultReplacedAt(ctx, userID); err != nil {
			return err
		}
		return ErrVaultReplaceCooldown
	}
	return nil
}
