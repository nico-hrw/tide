# TIDE Database Schema (`cloud/`)

> SQLite relational database schema managed via `cloud/internal/store/sqlite.go`.

## 1. Overview
The database uses SQLite via `modernc.org/sqlite` (pure Go, CGO-free). All tables and migrations are initialized in `sqlite.go:InitDB()`.

---

## 2. Active Tables

### `users`
Core user identity and cryptographic key store.
- `id` (TEXT, PRIMARY KEY): Unique UUID.
- `email_blind_index` (TEXT, UNIQUE): HMAC-SHA256 hash for email lookups.
- `username_blind_index` (TEXT): Blind index for username lookup.
- `phone_blind_index` (TEXT, UNIQUE): Blind index for phone lookups.
- `encrypted_vault` (BLOB, NOT NULL): Client RSA private key, encrypted by the user's PIN-derived KEK.
- `encrypted_pepper` (BLOB, NOT NULL): AES-GCM encrypted server pepper.
- `public_key` (TEXT, NOT NULL): Base64-encoded RSA public key for E2EE sharing.
- `enabled_extensions` (TEXT, DEFAULT `'[]'`): JSON array of active user extensions (e.g. `["finance"]`).
- `pin_hash` (TEXT): Salted hash of user PIN for unlocking.
- `login_code` (TEXT): Temporary OTP for magic link login.
- `username` (TEXT): Plaintext display username.
- `is_verified` (INTEGER, DEFAULT `0`): Boolean flag (0/1) for email/phone verification.
- `created_at` (DATETIME, NOT NULL): Registration timestamp.

### `files`
Hierarchical node-based document & event tree.
- `id` (TEXT, PRIMARY KEY): Unique file/node identifier.
- `owner_id` (TEXT, FOREIGN KEY → `users.id`): Creator/owner.
- `parent_id` (TEXT, nullable): Parent folder ID.
- `type` (TEXT, NOT NULL): Node type (`folder`, `file`, `note`, `event`, `canvas`).
- `mime_type` (TEXT, nullable): Optional MIME type.
- `size` (INTEGER, NOT NULL): Size in bytes.
- `created_at` (DATETIME, NOT NULL): Creation timestamp.
- `updated_at` (DATETIME, NOT NULL): Last update timestamp.
- `blob_path` (TEXT, nullable): Relative path in `data/blobs/`.
- `visibility` (TEXT, DEFAULT `'private'`): `private`, `public`, `shared`.
- `public_meta` (JSON/TEXT): Unencrypted metadata (e.g. event start/end, type, color, title for public files).
- `secured_meta` (BLOB): Client-encrypted metadata (title, tags).
- `version` (INTEGER, DEFAULT `1`): Format version (V1 vs V2 envelope encryption).
- `metadata` (TEXT): Plaintext metadata fallback (e.g. folder attributes).
- `access_keys` (TEXT): JSON map of wrapped DEKs per user ID for V2 envelope encryption.

### `file_backups`
Revision snapshots and delta line-patch history.
- `id` (TEXT, PRIMARY KEY): Unique backup snapshot ID.
- `file_id` (TEXT, FOREIGN KEY → `files.id`): Target file.
- `slot_name` (TEXT, NOT NULL): Backup slot name (`"1 week"` base copy, or delta slots: `"10 minutes"`, `"30 minutes"`, `"1 hour"`, `"1 day"`, `"2 days"`).
- `encrypted_blob` (TEXT, NOT NULL): Encrypted content backup (base snapshot or line-patch JSON).
- `secured_meta` (BLOB): Encrypted metadata backup.
- `access_keys` (TEXT, DEFAULT `'{}'`): Wrapped DEKs map per user ID.
- `version` (INTEGER, DEFAULT `1`): Schema version (1 = V1 raw ciphertext, 2 = V2 {data, iv} payload).
- `updated_at` (DATETIME, NOT NULL): Backup timestamp.
*(UNIQUE: `file_id`, `slot_name`)*

### `file_shares`
Access control and key exchange records for sharing.
- `file_id` (TEXT, FOREIGN KEY → `files.id`): Shared file.
- `user_id` (TEXT, FOREIGN KEY → `users.id`): Recipient user.
- `secured_meta` (BLOB): Legacy V1 encrypted file DEK wrapped with recipient's public key.
- `status` (TEXT, DEFAULT `'pending'`): `pending`, `accepted`.
- `permission` (TEXT, NOT NULL, DEFAULT `'view'`): `view`, `edit`, `share`.
- `created_at` (DATETIME, NOT NULL): Share timestamp.
*(PRIMARY KEY: `file_id`, `user_id`)*

### `links`
Bidirectional links between documents (graph backlinks).
- `source_id` (TEXT, FOREIGN KEY → `files.id`): Source document.
- `target_id` (TEXT, FOREIGN KEY → `files.id`): Linked document.
- `type` (TEXT, NOT NULL): Relationship type (e.g. `reference`, `mention`).
- `created_at` (DATETIME, NOT NULL): Link creation timestamp.
*(PRIMARY KEY: `source_id`, `target_id`)*

### `messages`
End-to-end encrypted direct messages between contacts.
- `id` (TEXT, PRIMARY KEY): Message ID.
- `sender_id` (TEXT, FOREIGN KEY → `users.id`): Sender.
- `recipient_id` (TEXT, FOREIGN KEY → `users.id`): Recipient.
- `content` (TEXT, NOT NULL): Encrypted message payload.
- `status` (TEXT, DEFAULT `'pending'`): `pending`, `delivered`, `read`.
- `created_at` (DATETIME, NOT NULL): Sent timestamp.

### `contacts`
Friendship and communication relationships.
- `id` (TEXT, PRIMARY KEY): Relationship ID.
- `user_id` (TEXT, FOREIGN KEY → `users.id`): Initiator.
- `contact_id` (TEXT, FOREIGN KEY → `users.id`): Target contact.
- `status` (TEXT, NOT NULL): `pending`, `accepted`.
- `created_at` (DATETIME, NOT NULL): Request timestamp.
*(UNIQUE: `user_id`, `contact_id`)*

### `profiles`
Public discovery profile information.
- `user_id` (TEXT, PRIMARY KEY, FOREIGN KEY → `users.id`): User ID.
- `avatar_seed` (TEXT, NOT NULL): Seed string for generative avatar.
- `avatar_style` (TEXT, NOT NULL, DEFAULT `'notionists'`): Avatar style variant.
- `avatar_salt` (TEXT, NOT NULL, DEFAULT `''`): Salt for avatar generation.
- `bio` (TEXT, NOT NULL): User description/bio.
- `title` (TEXT, NOT NULL): Job or role title.
- `profile_status` (INTEGER, NOT NULL, DEFAULT `0`): Status flag (0 = default/online, etc.).

### `tokens`
Active session tokens.
- `token` (TEXT, PRIMARY KEY): Authentication token.
- `user_id` (TEXT, FOREIGN KEY → `users.id`): Authenticated user.
- `expires_at` (DATETIME, NOT NULL): Token expiration timestamp.

### `tasks`
Encrypted personal tasks list.
- `id` (TEXT, PRIMARY KEY): Task ID.
- `user_id` (TEXT, FOREIGN KEY → `users.id`): Owner.
- `encrypted_vault` (BLOB, NOT NULL): Encrypted task blob.
- `created_at` (DATETIME, NOT NULL): Creation timestamp.
- `updated_at` (DATETIME, NOT NULL): Last update timestamp.

### Extension Tables: `ext_finance_*`
- `ext_finance_accounts`: Double-entry finance accounts (`id`, `user_id`, `name`, `type`, `linked_account_id`, `created_at`).
- `ext_finance_transactions`: Financial transactions (`id`, `user_id`, `date`, `description`, `created_at`).
- `ext_finance_entries`: Individual ledger entries linking accounts and amounts (`id`, `transaction_id`, `account_id`, `amount`).

---

## 3. Client-Side Stored State (Not in Database)
- **Editor Tabs**: Stored in client `sessionStorage` (`tide_open_tabs`, `tide_active_tab_id`) per window. Validated on startup against accessible files via `POST /api/v1/tabs/validate`.
