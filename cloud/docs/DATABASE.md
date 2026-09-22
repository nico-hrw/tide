# TIDE Database Schema (`cloud/`)

> SQLite relational database schema managed via `cloud/internal/store/sqlite.go`.

## 1. Overview
The database uses SQLite via `modernc.org/sqlite` (pure Go, CGO-free). All tables are initialized in `sqlite.go:InitDB()`.

---

## 2. Active Tables

### `users`
Core user identity and cryptographic key store.
- `id` (TEXT, PRIMARY KEY): Unique UUID.
- `email_blind_index` (TEXT, UNIQUE): HMAC-SHA256 hash for email lookups.
- `username_blind_index` (TEXT, UNIQUE): Blind index for username uniqueness.
- `phone_blind_index` (TEXT, UNIQUE): Blind index for phone lookups.
- `encrypted_vault` (BLOB): Client RSA private key, encrypted by the user's PIN-derived KEK.
- `encrypted_pepper` (BLOB): AES-GCM encrypted server pepper.
- `public_key` (TEXT): Base64-encoded RSA public key for E2EE sharing.
- `enabled_extensions` (TEXT): JSON array of active user extensions (e.g. `["finance"]`).
- `pin_hash` (TEXT): Salted hash of user PIN for unlocking.
- `login_code` (TEXT): Temporary OTP for magic link login.
- `username` (TEXT): Plaintext display username.
- `created_at` (DATETIME): Registration timestamp.
- `is_verified` (INTEGER): Boolean flag (0/1) for email/phone verification.

### `files`
Hierarchical node-based document & event tree.
- `id` (TEXT, PRIMARY KEY): Unique file/node identifier.
- `owner_id` (TEXT, FOREIGN KEY → `users.id`): Creator/owner.
- `parent_id` (TEXT, nullable): Parent folder ID.
- `type` (TEXT): `folder`, `file`, `event`, etc.
- `mime_type` (TEXT): MIME type for file storage.
- `size` (INTEGER): Size in bytes.
- `created_at` (DATETIME): Creation timestamp.
- `updated_at` (DATETIME): Last update timestamp.
- `blob_path` (TEXT): Relative path in `data/blobs/`.
- `visibility` (TEXT): `private`, `public`, `shared`.
- `public_meta` (JSON/TEXT): Unencrypted metadata (e.g. event start/end, type, color).
- `secured_meta` (BLOB): Client-encrypted metadata (title, tags, preview).
- `version` (INTEGER): Format version (V1 vs V2).
- `metadata` (TEXT): Plaintext metadata fallback (for folders).
- `access_keys` (TEXT): JSON map of wrapped DEKs per user ID.

### `file_backups`
Revision snapshots and backup history.
- `id` (TEXT, PRIMARY KEY): Unique backup snapshot ID.
- `file_id` (TEXT, FOREIGN KEY → `files.id`): Target file.
- `slot_name` (TEXT): Backup slot name.
- `encrypted_blob` (TEXT): Encrypted content backup.
- `secured_meta` (BLOB): Encrypted metadata backup.
- `access_keys` (TEXT): Wrapped keys map.
- `version` (INTEGER): Schema version.
- `updated_at` (DATETIME): Backup timestamp.
*(UNIQUE: `file_id`, `slot_name`)*

### `file_shares`
Access control and key exchange records for sharing.
- `file_id` (TEXT, FOREIGN KEY → `files.id`): Shared file.
- `user_id` (TEXT, FOREIGN KEY → `users.id`): Recipient.
- `secured_meta` (BLOB): Encrypted file DEK wrapped with recipient's public key.
- `status` (TEXT): `pending`, `accepted`.
- `permission` (TEXT): `view`, `edit`, `share`.
- `created_at` (DATETIME): Share timestamp.
*(PRIMARY KEY: `file_id`, `user_id`)*

### `links`
Bidirectional links between documents (graph backlinks).
- `source_id` (TEXT, FOREIGN KEY → `files.id`): Source document.
- `target_id` (TEXT, FOREIGN KEY → `files.id`): Linked document.
- `type` (TEXT): Relationship type.
- `created_at` (DATETIME): Link creation timestamp.
*(PRIMARY KEY: `source_id`, `target_id`)*

### `messages`
End-to-end encrypted direct messages between contacts.
- `id` (TEXT, PRIMARY KEY): Message ID.
- `sender_id` (TEXT, FOREIGN KEY → `users.id`): Sender.
- `recipient_id` (TEXT, FOREIGN KEY → `users.id`): Recipient.
- `content` (TEXT): Encrypted message payload.
- `status` (TEXT): `pending`, `delivered`, `read`.
- `created_at` (DATETIME): Sent timestamp.

### `contacts`
Friendship and communication relationships.
- `id` (TEXT, PRIMARY KEY): Relationship ID.
- `user_id` (TEXT, FOREIGN KEY → `users.id`): Initiator.
- `contact_id` (TEXT, FOREIGN KEY → `users.id`): Target contact.
- `status` (TEXT): `pending`, `accepted`.
- `created_at` (DATETIME): Request timestamp.
*(UNIQUE: `user_id`, `contact_id`)*

### `profiles`
Public discovery profile information.
- `user_id` (TEXT, PRIMARY KEY, FOREIGN KEY → `users.id`): User ID.
- `avatar_seed` (TEXT): Seed string for generative avatar.
- `avatar_style` (TEXT): Avatar style variant.
- `avatar_salt` (TEXT): Salt for avatar generation.
- `bio` (TEXT): User description/bio.
- `title` (TEXT): Job or role title.
- `profile_status` (INTEGER): Status flag (online, busy, etc.).

### `tokens`
Active session tokens.
- `token` (TEXT, PRIMARY KEY): Authentication token.
- `user_id` (TEXT, FOREIGN KEY → `users.id`): Authenticated user.
- `expires_at` (DATETIME): Token expiration timestamp.

### `tabs`
Persisted open editor tab sessions.
- `id` (TEXT, PRIMARY KEY): Tab session ID.
- `user_id` (TEXT, FOREIGN KEY → `users.id`): Owner.
- `data` (TEXT): Serialized open tab state.
- `updated_at` (DATETIME): Last sync timestamp.

### `tasks`
Encrypted personal tasks list.
- `id` (TEXT, PRIMARY KEY): Task ID.
- `user_id` (TEXT, FOREIGN KEY → `users.id`): Owner.
- `encrypted_vault` (BLOB): Encrypted task list blob.
- `created_at` (DATETIME): Creation timestamp.
- `updated_at` (DATETIME): Last update timestamp.

### Extension Tables: `ext_finance_*`
- `ext_finance_accounts`: Double-entry finance accounts.
- `ext_finance_transactions`: Financial transactions.
- `ext_finance_entries`: Individual ledger entries linking accounts and amounts.
