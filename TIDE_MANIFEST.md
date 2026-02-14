# TIDE MANIFEST (Project State)

## 0. Current Phase
**Phase 2: Auth & Crypto**
*Objective*: Implement Login Flow and Client-Side Encryption.

## 1. API Contract Hash
**Hash**: AUTH_PROTO_v1
*Status*: Active Implementation
*Changes*: Added Auth Endpoints

### Auth Endpoints (Instance 2)
1.  `POST /api/v1/auth/register`
    *   Input: `{ "email": "...", "public_key": "...", "enc_private_key": "..." }`
    *   Output: `{ "user_id": "...", "status": "created" }`
2.  `POST /api/v1/auth/login`
    *   Input: `{ "email": "..." }`
    *   Output: `{ "message": "Magic link sent" }` (or Challenge)
3.  `POST /api/v1/auth/verify`
    *   Input: `{ "token": "..." }` (Magic Link Token)
    *   Output: `{ "session_token": "JWT...", "enc_private_key": "..." }`

## 2. Data Schema Snapshot
### Database Strategy: Split-Brain Metadata

## 2. Data Schema Snapshot
### Database Strategy: Split-Brain Metadata
*Philosophy*: The server knows *structure* but not *content*.

#### Table: `users`
| Column | Type | Nullable | Description |
|---|---|---|---|
| `id` | UUID | NO | Primary Key |
| `email` | VARCHAR(255) | NO | Unique, for Magic Link/Auth |
| `public_key` | TEXT | NO | Public Key for asymmetric encryption (User Identity) |
| `enc_private_key` | TEXT | NO | Private Key encrypted with user's password/passkey |
| `created_at` | TIMESTAMPTZ | NO | Default NOW() |

#### Table: `files`
| Column | Type | Nullable | Description |
|---|---|---|---|
| `id` | UUID | NO | Primary Key |
| `owner_id` | UUID | NO | Foreign Key -> users.id |
| `parent_id` | UUID | YES | Foreign Key -> files.id (Folder structure) |
| `type` | VARCHAR(20) | NO | Enum: 'file', 'folder', 'note', 'event' |
| `mime_type` | VARCHAR(100)| YES | e.g. 'application/pdf', 'text/markdown' |
| `size` | BIGINT | NO | File size in bytes (encrypted size) |
| `created_at` | TIMESTAMPTZ | NO | Default NOW() |
| `updated_at` | TIMESTAMPTZ | NO | Default NOW() |
| `blob_path` | TEXT | YES | Path to the encrypted content blob in Object Storage |
| **`public_meta`** | JSONB | NO | **UNENCRYPTED**. Server-readable metadata. <br>Ex: `{"time_start": "2023-10-27T10:00:00Z", "sharing": "private"}` |
| **`secured_meta`** | BYTEA | NO | **ENCRYPTED**. Client-only metadata. <br>Contains: Title, Tags, Preview, Thumbnail, ContentKey. |

#### Table: `links` (Graph Connections)
| Column | Type | Nullable | Description |
|---|---|---|---|
| `source_id` | UUID | NO | FK -> files.id |
| `target_id` | UUID | NO | FK -> files.id |
| `created_at` | TIMESTAMPTZ | NO | |

## 3. Pending Decisions
- [Refine] Specific encryption algorithms (likely AES-GCM for content, RSA/ECC for keys).
- [Refine] WebSocket message protocol (JSON structure for chat/sync).
- [Refine] "Magic Link" exact implementation steps.

## 4. Next Step (Immediate)
**Target**: Instance 2 (Cloud / Backend)
**Instruction**:
1.  Initialize a new Go module: `go mod init github.com/nicoh/tide`
2.  Create directory structure:
    - `cmd/server/main.go`
    - `internal/db/models.go` (Implement the structs for `User` and `File` based on the schema above)
3.  Set up a basic HTTP server listening on port 8080.
4.  Commit to Git.
