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
- `username` (TEXT): Plaintext username.
- `created_at` (DATETIME): Creation timestamp.
- `is_verified` (INTEGER): Boolean flag (0/1) for account verification.

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
- `version` (INTEGER): Version number for file content/metadata.
- `metadata` (TEXT): JSON metadata.
- `access_keys` (TEXT): JSON map of per-user wrapped DEKs.

### `file_backups`
- `id` (TEXT, PRIMARY KEY)
- `file_id` (TEXT, FOREIGN KEY to `files(id)`)
- `slot_name` (TEXT)
- `encrypted_blob` (TEXT)
- `secured_meta` (BLOB)
- `access_keys` (TEXT)
- `version` (INTEGER)
- `updated_at` (DATETIME)
*(Unique: `file_id`, `slot_name`)*

### `file_shares`
Access control list for shared files.
- `file_id` (TEXT, FOREIGN KEY to `files(id)`)
- `user_id` (TEXT, FOREIGN KEY to `users(id)`)
- `secured_meta` (BLOB): Encrypted symmetric key or metadata specific to this share.
- `status` (TEXT): `pending` or `accepted`.
- `permission` (TEXT): `view`, `edit`, or `share`.
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

### `tasks`
- `id` (TEXT, PRIMARY KEY)
- `user_id` (TEXT, FOREIGN KEY to `users(id)`)
- `encrypted_vault` (BLOB)
- `created_at` (DATETIME)
- `updated_at` (DATETIME)

### `profiles`
- `user_id` (TEXT, PRIMARY KEY, FOREIGN KEY to `users(id)`)
- `avatar_seed` (TEXT)
- `avatar_style` (TEXT)
- `avatar_salt` (TEXT)
- `bio` (TEXT)
- `title` (TEXT)
- `profile_status` (INTEGER)

### Tracker Extension Tables (Ext)
- `ext_tracker_exercises`: `id`, `user_id`, `name`, `category`, `default_tracking_type`, `muscles`, `primary_muscles`, `secondary_muscles`, `created_at`
- `ext_tracker_workouts`: `id`, `user_id`, `name`, `notes`, `started_at`, `finished_at`
- `ext_tracker_workout_exercises`: `id`, `workout_id`, `exercise_id`, `sort_order`
- `ext_tracker_sets`: `id`, `workout_exercise_id`, `sort_order`, `reps`, `weight_kg`, `distance_meters`, `duration_seconds`, `is_warmup`, `completed`, `rir`, `rpe`
