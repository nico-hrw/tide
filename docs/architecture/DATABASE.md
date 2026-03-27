# DATABASE SCHEMA

The application uses **SQLite** as its primary data store, managed via the `modernc.org/sqlite` driver in the Go backend.

## Tables

### `users`
- `id` (TEXT, PRIMARY KEY): Unique identifier.
- `email_blind_index` (TEXT, UNIQUE): Blind index for email lookups.
- `username_blind_index` (TEXT, UNIQUE): Blind index for username lookups.
- `phone_blind_index` (TEXT, UNIQUE): Blind index for phone lookups.
- `encrypted_vault` (BLOB): RSA private key encrypted by KEK.
- `encrypted_pepper` (BLOB): AES-GCM encrypted server pepper.
- `public_key` (TEXT): User's public key for e2e encryption purposes.
- `enabled_extensions` (TEXT): JSON array of enabled extensions (e.g. `["finance", "calendar"]`).
- `pin_hash` (TEXT): Hashed PIN for lockscreen/auth.
- `login_code` (TEXT): Temporary login code.
- `created_at` (DATETIME): Creation timestamp.

### `files`
Node-based file system structure.
- `id` (TEXT, PRIMARY KEY): Unique identifier.
- `owner_id` (TEXT, FOREIGN KEY to `users(id)`): User who owns the file.
- `parent_id` (TEXT): ID of the parent folder/file (null for root).
- `type` (TEXT): Type of file (`folder`, `file`, `event`, etc.).
- `mime_type` (TEXT): MIME type for blobs.
- `size` (INTEGER): Size in bytes.
- `created_at` (DATETIME): Creation timestamp.
- `updated_at` (DATETIME): Last updated timestamp.
- `blob_path` (TEXT): Path to actual binary data in object storage.
- `visibility` (TEXT): `private`, `public`, etc.
- `public_meta` (JSON): Unencrypted metadata.
- `secured_meta` (BLOB): Encrypted metadata (e.g. filename, theme, properties).
- `is_task` (INTEGER): Boolean flag (0/1) for task items.
- `is_completed` (INTEGER): Boolean flag (0/1) for task completion status.

### `file_shares`
Access control list for shared files.
- `file_id` (TEXT, FOREIGN KEY to `files(id)`)
- `user_id` (TEXT, FOREIGN KEY to `users(id)`)
- `secured_meta` (BLOB): Encrypted symmetric key or metadata specific to this share.
- `status` (TEXT): `pending` or `accepted`.
- `created_at` (DATETIME)
*(Primary Key: `file_id`, `user_id`)*

### `links`
Bidirectional links between files (e.g. backlinks in notes).
- `source_id` (TEXT, FOREIGN KEY to `files(id)`)
- `target_id` (TEXT, FOREIGN KEY to `files(id)`)
- `type` (TEXT): Type of link.
- `created_at` (DATETIME)
*(Primary Key: `source_id`, `target_id`)*

### `tokens`
Session/Authentication tokens.
- `token` (TEXT, PRIMARY KEY): Bearer token.
- `user_id` (TEXT): Associated user ID.
- `expires_at` (DATETIME): Expiry timestamp.

### `messages`
- `id` (TEXT, PRIMARY KEY)
- `sender_id` (TEXT, FOREIGN KEY to `users(id)`)
- `recipient_id` (TEXT, FOREIGN KEY to `users(id)`)
- `content` (TEXT): Encrypted content.
- `status` (TEXT): `pending`, etc.
- `created_at` (DATETIME)

### `contacts`
- `id` (TEXT, PRIMARY KEY)
- `user_id` (TEXT, FOREIGN KEY to `users(id)`)
- `contact_id` (TEXT, FOREIGN KEY to `users(id)`)
- `status` (TEXT): `pending`, `accepted`
- `created_at` (DATETIME)
*(Unique: `user_id`, `contact_id`)*

### Finance Extension Tables (Ext)
- `ext_finance_accounts`
- `ext_finance_transactions`
- `ext_finance_entries`
