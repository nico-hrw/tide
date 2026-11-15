# Personal Access Tokens (PAT) & External Automation Architecture

This specification provides an exhaustive technical analysis and developer reference for the **Personal Access Token (PAT)** subsystem and the **External Scoped API** implemented in Tide Cloud (`cloud/internal/api/api_tokens.go`, `cloud/internal/api/external.go`, `cloud/internal/api/todos.go`, and `cloud/internal/db/models.go`).

---

## 1. Architectural Overview & Threat Model

### 1.1 The Role of Personal Access Tokens
Tide Cloud utilizes Personal Access Tokens (PATs) to enable secure programmatic automation. Automated consumers include:
- Command-line interfaces (CLI tools)
- Background daemons and cron jobs
- Model Context Protocol (MCP) servers (e.g., Tide MCP integrations for AI agents)
- External scripts, webhooks, and third-party workflow orchestrators

```
+-----------------------------------------------------------------------------------------+
|                                CLIENT / CONSUMER LAYER                                  |
|                                                                                         |
|   +-------------------+    +--------------------+    +-------------------------------+  |
|   |   Tide Desktop    |    | Tide CLI / Daemon  |    |     Tide MCP Server (Agent)   |  |
|   |  (Interactive)    |    |   (Automation)     |    |         (Automation)          |  |
|   +-------------------+    +--------------------+    +-------------------------------+  |
|             |                        |                               |                  |
|       JWT Session             PAT (Bearer / X-API-Key)        PAT (Bearer / X-API-Key)  |
|             v                        v                               v                  |
+-------------|------------------------|-------------------------------|------------------+
              |                        +---------------+---------------+
              |                                        |
              v                                        v
+------------------------------------+   +------------------------------------------------+
|     INTERACTIVE USER ROUTES        |   |              EXTERNAL SCOPED API               |
|  `/api/v1/files`, `/api/v1/tabs`   |   |           `/api/v1/external/...`               |
|                                    |   |                                                |
|  - Full user session context       |   |  - Scope evaluation middleware (APITokenAuth)  |
|  - Manages encrypted vaults        |   |  - Granular permissions (read/write/scopes)    |
|  - Can generate / revoke PATs      |   |  - Zero master PIN / zero password exposure    |
+------------------------------------+   +------------------------------------------------+
                                                       |
                                                       v
                                         +----------------------------+
                                         |      SQLITE DATA STORE     |
                                         |    `api_tokens` (Hashed)   |
                                         |    `todos`, `events`       |
                                         |    `files` (Unencrypted)   |
                                         +----------------------------+
```

### 1.2 Credential Decoupling & Vault Isolation
PATs are architecturally decoupled from interactive user credentials:
1. **Zero Credential Exposure**:
   - Automation clients **never** require or receive the user's master password, login code, Argon2id PIN hash, or raw cryptographic seeds.
   - If a script or MCP server configuration is compromised, user account login credentials remain unbreached.
2. **Vault Isolation Boundary**:
   - Tide's Zero-Knowledge Vault encrypts personal user notes, event blobs, and sensitive files client-side using authenticated encryption (AES-256-GCM / XChaCha20-Poly1305).
   - Because the server never possesses the client's private encryption key, PAT-authenticated requests to the external API **cannot** decrypt client-side encrypted notes or vaults.
   - External API endpoints explicitly differentiate between:
     - **Unencrypted / Public content**: Full plain-text read and write access is granted.
     - **End-to-End Encrypted (E2EE) content**: The server returns structural metadata and status indicators (`"encrypted": true`), refusing plaintext manipulation to maintain cryptographic safety.

### 1.3 Threat Model & Mitigations
| Threat Vector | Mitigation in Tide PAT Architecture |
|---|---|
| **Database Dump / Data Leak** | PATs are **never** stored in plaintext. The database only retains a one-way SHA-256 cryptographic digest (`token_hash`). Leaked hashes cannot be converted back into active tokens. |
| **Over-Privileged Integration** | Principle of Least Privilege is enforced via granular permission scopes (`events:read`, `todos:create`, `folder:<id>`, etc.). Compromised tokens cannot access unrelated domains. |
| **Forgotten / Abandoned Tokens** | Optional automatic expiration (`expires_at`) and access tracking (`last_used_at`) allow detection and automated cleanup of dormant credentials. |
| **UI Shoulder Surfing / History Logging** | The full plaintext token is returned **strictly once** upon creation. Subsequent queries only expose masked prefixes (`tide_pat_xxxx...`). |
| **Access Log / URL Interception** | Tokens are passed primarily via the HTTP `Authorization: Bearer <token>` or `X-API-Key: <token>` request headers rather than URL query parameters. |

---

## 2. Token Format, Generation & Cryptographic Hashing

### 2.1 Plaintext Token Format
A Tide Personal Access Token is formatted as:

$$\texttt{tide\_pat\_} + \langle 32 \text{ random bytes in hex or base62}\rangle$$

In the canonical Go implementation (`cloud/internal/api/api_tokens.go`), 32 cryptographically secure random bytes are drawn from the operating system CSPRNG (`crypto/rand`) and hex-encoded to generate a 64-character lowercase hex string:

```
tide_pat_4a9e2f6c91a78345d820bf0123c5e89a4a9e2f6c91a78345d820bf0123c5e89a
\_______/ \________________________________________________________________/
 Prefix                     64 hex characters (256 bits entropy)
```

- **Prefix (`tide_pat_`)**: Enables automated secret scanning, GitHub token leakage detection, and regex matching in CI/CD pipelines.
- **Entropy (256 bits)**: Prevents brute-force or collision attacks across the entire token lifetime.

### 2.2 Token Display Prefix
To enable users to identify which token is configured in an external script or MCP server without exposing the secret token string, the server computes a display prefix:

```go
tokenPrefix := "tide_pat_" + rawHex[:8] + "..."
// Example: "tide_pat_4a9e2f6c..."
```

- Exactly the first 17 characters (`tide_pat_` + 8 hex characters + `...`) or the first 12 identifier characters are stored in `api_tokens.token_prefix`.
- The user interface uses this prefix to label the token in management lists.

### 2.3 One-Way Cryptographic Hashing
The server calculates the SHA-256 hash of the entire token string (including the `tide_pat_` prefix):

$$\text{TokenHash} = \text{hex}(\text{SHA-256}(\text{RawToken}))$$

```go
// Generation and Hashing in api_tokens.go
randomBytes := make([]byte, 32)
if _, err := rand.Read(randomBytes); err != nil {
    return nil, err
}
rawHex := hex.EncodeToString(randomBytes)
fullToken := "tide_pat_" + rawHex
tokenPrefix := "tide_pat_" + rawHex[:8] + "..."

hashBytes := sha256.Sum256([]byte(fullToken))
tokenHash := hex.EncodeToString(hashBytes[:])
```

- **Database Storage**: The database only stores `token_hash`.
- **Zero Plaintext Storage**: The plaintext `fullToken` is returned **once** in the HTTP response of `POST /api/v1/api-tokens` and is immediately discarded from server memory.

---

## 3. Database Schema & Data Models

### 3.1 Relational Schema (`api_tokens` Table)
In SQLite (`cloud/internal/store/sqlite.go`), the tokens table is defined as follows:

```sql
CREATE TABLE IF NOT EXISTS api_tokens (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    token_prefix TEXT NOT NULL,
    scopes TEXT NOT NULL,           -- JSON array of strings: '["events:read","notes:write"]'
    created_at TIMESTAMP NOT NULL,
    expires_at TIMESTAMP NULL,
    last_used_at TIMESTAMP NULL,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_api_tokens_token_hash ON api_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_api_tokens_user_id ON api_tokens(user_id);
```

### 3.2 Go Data Structs
Defined in `cloud/internal/db/models.go` and `cloud/internal/api/api_tokens.go`:

```go
type APIToken struct {
    ID          string     `json:"id" db:"id"`
    UserID      string     `json:"user_id" db:"user_id"`
    Name        string     `json:"name" db:"name"`
    TokenHash   string     `json:"-" db:"token_hash"`       // Never serialized to JSON
    TokenPrefix string     `json:"token_prefix" db:"token_prefix"`
    Scopes      []string   `json:"scopes" db:"scopes"`
    CreatedAt   time.Time  `json:"created_at" db:"created_at"`
    ExpiresAt   *time.Time `json:"expires_at" db:"expires_at"`
    LastUsedAt  *time.Time `json:"last_used_at" db:"last_used_at"`
}
```

---

## 4. Scope Taxonomy & Permission Matrix

### 4.1 Granular Scopes Definition
Tide implements a scoped authorization matrix allowing tokens to be confined to specific domains, actions, workspaces, or folders:

| Scope Identifier | Human-Readable Description | Implemented | Permitted Actions |
|---|---|---|---|
| `events:read` | Read calendar events | Yes | `GET /api/v1/external/events`, `GET /api/v1/external/events/{id}` |
| `events:write` | Create & modify calendar events | Partial | Create, update, and remove calendar events |
| `notes:read` | Read unencrypted notes & metadata | Yes | `GET /api/v1/external/notes`, `GET /api/v1/external/notes/{id}` |
| `notes:write` | Create, edit & delete notes | Yes | `POST /api/v1/external/notes`, `PUT/PATCH/DELETE /api/v1/external/notes/{id}` |
| `todos:read` | Query & filter todos | Yes | `GET /api/v1/external/todos`, `GET /api/v1/external/todos/{id}` |
| `todos:write` | Full administrative todo management | Yes | Create, read, update, complete, and delete todos |
| `todos:create` | Create new todos | Yes | `POST /api/v1/external/todos` |
| `todos:edit` | Edit todos & change completion status | Yes | `PUT /api/v1/external/todos/{id}`, `PATCH /api/v1/external/todos/{id}` |
| `todos:delete` | Delete todos | Yes | `DELETE /api/v1/external/todos/{id}` |
| `storage:expand` | Upload storage expansion (>250MB) | Yes | Authorizes large media/file uploads in storage handlers |
| `*` | Superuser / Full access wildcard | Yes | Matches **all** endpoint scopes across the entire external API |
| `safe:<workspace>` | Workspace-scoped note confinement | Yes | Confines `notes:read` and `notes:write` to notes belonging to `<workspace>` (e.g. `safe:work`, `safe:main`) |
| `folder:<folder_id>`| Folder-scoped note confinement | Yes | Confines `notes:read` and `notes:write` to notes inside `<folder_id>` or its subfolders (up to 5 levels) |

### 4.2 Endpoint Permission Matrix
The following matrix shows required scopes per external API route:

| HTTP Method | Route | Minimum Required Scope(s) |
|---|---|---|
| `GET` | `/api/v1/external/events` | `events:read` or `*` |
| `GET` | `/api/v1/external/events/{id}` | `events:read` or `*` |
| `GET` | `/api/v1/external/notes` | `notes:read` or `notes:write` or `*` (filtered by `safe:` / `folder:`) |
| `GET` | `/api/v1/external/notes/{id}` | `notes:read` or `notes:write` or `*` (filtered by `safe:` / `folder:`) |
| `POST` | `/api/v1/external/notes` | `notes:write` or `*` (parent constrained by `safe:` / `folder:`) |
| `PUT` / `PATCH` | `/api/v1/external/notes/{id}` | `notes:write` or `*` (target constrained by `safe:` / `folder:`) |
| `DELETE` | `/api/v1/external/notes/{id}` | `notes:write` or `*` (target constrained by `safe:` / `folder:`) |
| `GET` | `/api/v1/external/todos` | `todos:read` or `todos:write` or `*` |
| `POST` | `/api/v1/external/todos` | `todos:create` or `todos:write` or `*` |
| `GET` | `/api/v1/external/todos/{id}` | `todos:read` or `todos:write` or `*` |
| `PUT` / `PATCH` | `/api/v1/external/todos/{id}` | `todos:edit` or `todos:write` or `*` |
| `DELETE` | `/api/v1/external/todos/{id}` | `todos:delete` or `todos:write` or `*` |
| `POST` | `/api/v1/files/upload` (>250MB) | `storage:expand` or `*` |

---

## 5. Scope Evaluation Middleware

Two primary middleware functions evaluate Personal Access Tokens:
1. `APITokenAuth` (`cloud/internal/api/external.go`): Protects `/api/v1/external/...` endpoints.
2. `RequireScopes` (`cloud/internal/api/todos.go`): Protects `/todos` endpoints (accepting either PATs or interactive session JWTs).

### 5.1 The `APITokenAuth` Middleware Flow

```
+-----------------------------------------------------------------------------------------+
|                               INCOMING HTTP REQUEST                                     |
+-----------------------------------------------------------------------------------------+
                                           |
                                           v
           1. Extract token: Authorization: Bearer <token>
              Fallback 1: Header `X-API-Key: <token>`
              Fallback 2: Query Param `?api_token=<token>`
                                           |
                                  Token Present?
                                 /              \
                               No                Yes
                              /                    \
            HTTP 401 Unauthorized                   v
                                           2. Compute SHA-256 Hash
                                              `hash = SHA256(token)`
                                                    |
                                                    v
                                           3. Query DB by `token_hash`
                                              `GetAPITokenByHash(hash)`
                                                    |
                                              Token Valid?
                                             /            \
                                           No              Yes
                                          /                  \
                        HTTP 401 Unauthorized                v
                                                    4. Expiration Check
                                                       `Now() > ExpiresAt?`
                                                       /                  \
                                                     Yes                   No
                                                     /                      \
                                    HTTP 401 Unauthorized                    v
                                                            5. Scope Evaluation
                                                               `Check Scopes against Required`
                                                               /                             \
                                                             No                               Yes
                                                            /                                   \
                                            HTTP 403 Forbidden                                   v
                                                                             6. Async LastUsedAt Update
                                                                                `go UpdateAPITokenLastUsed()`
                                                                                         |
                                                                                         v
                                                                             7. Inject Request Context
                                                                                - `user_id`
                                                                                - `api_token_id`
                                                                                - `token_scopes`
                                                                                         |
                                                                                         v
                                                                                `next.ServeHTTP(w, r)`
```

### 5.2 Scope Matching Algorithm
In `cloud/internal/api/external.go`:
```go
hasScope := false
for _, sc := range apiToken.Scopes {
    // 1. Wildcard matches everything
    if sc == "*" {
        hasScope = true
        break
    }
    for _, req := range requiredScopes {
        // 2. Direct string equality match
        if sc == req {
            hasScope = true
            break
        }
        // 3. Note sub-scoping rule: safe:... or folder:... qualifies for notes access
        if strings.HasPrefix(req, "notes:") && (strings.HasPrefix(sc, "safe:") || strings.HasPrefix(sc, "folder:")) {
            hasScope = true
            break
        }
    }
    if hasScope {
        break
    }
}
```

### 5.3 Asynchronous `LastUsedAt` Background Update
To avoid adding database write latency to every authenticated API request, the last-used timestamp is updated asynchronously in a background goroutine:

```go
go func(tokenID string) {
    ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
    defer cancel()
    _ = s.UpdateAPITokenLastUsed(ctx, tokenID, time.Now())
}(apiToken.ID)
```

---

## 6. Token Management Endpoints Reference

All token management routes are mounted under `/api/v1/api-tokens` (accessible also via user settings routes) and require an active user session authenticated via `AuthMiddleware`.

### 6.1 Discover Available Scopes
Returns the list of scopes supported by the platform.

```http
GET /api/v1/api-tokens/scopes
```

#### Response: `200 OK`
```json
[
  {
    "key": "events:read",
    "description": "Termine abfragen (Leserechte)",
    "implemented": true
  },
  {
    "key": "events:write",
    "description": "Termine erstellen & bearbeiten (Schreibrechte)",
    "implemented": false
  },
  {
    "key": "notes:read",
    "description": "Notizen abfragen (Leserechte)",
    "implemented": true
  },
  {
    "key": "notes:write",
    "description": "Notizen erstellen & bearbeiten (Schreibrechte)",
    "implemented": true
  },
  {
    "key": "todos:read",
    "description": "Aufgaben abfragen & filtern (Leserechte)",
    "implemented": true
  },
  {
    "key": "todos:write",
    "description": "Aufgaben verwalten (Erstellen, Bearbeiten, Löschen)",
    "implemented": true
  },
  {
    "key": "todos:create",
    "description": "Aufgaben erstellen",
    "implemented": true
  },
  {
    "key": "todos:edit",
    "description": "Aufgaben bearbeiten & Status ändern",
    "implemented": true
  },
  {
    "key": "todos:delete",
    "description": "Aufgaben löschen",
    "implemented": true
  }
]
```

---

### 6.2 List User Tokens
Returns all tokens issued by the authenticated user. Plaintext tokens are **never** returned; only prefixes are included.

```http
GET /api/v1/api-tokens
```

#### Response: `200 OK`
```json
[
  {
    "id": "e6a2542a-2a13-48b4-934d-17688220f162",
    "user_id": "772f9d6a-5431-4172-b7ca-4f5139031ef6",
    "name": "Local MCP Server",
    "token_prefix": "tide_pat_4a9e2f6c...",
    "scopes": [
      "notes:read",
      "notes:write",
      "todos:write",
      "events:read"
    ],
    "created_at": "2026-11-15T18:00:00Z",
    "expires_at": "2027-11-15T18:00:00Z",
    "last_used_at": "2026-11-15T19:45:12Z"
  }
]
```

---

### 6.3 Create New Token
Issues a new Personal Access Token. **The plaintext token is returned once in this response and cannot be retrieved again.**

```http
POST /api/v1/api-tokens
Content-Type: application/json
```

#### Request Body
```json
{
  "name": "CLI Sync Daemon",
  "scopes": [
    "notes:read",
    "todos:read",
    "todos:write"
  ],
  "expires_in_days": 90
}
```
*Note: Setting `expires_in_days: 0` creates a token with no expiration.*

#### Response: `201 Created`
```json
{
  "id": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
  "name": "CLI Sync Daemon",
  "token": "tide_pat_4a9e2f6c91a78345d820bf0123c5e89a4a9e2f6c91a78345d820bf0123c5e89a",
  "token_prefix": "tide_pat_4a9e2f6c...",
  "scopes": [
    "notes:read",
    "todos:read",
    "todos:write"
  ],
  "created_at": "2026-11-15T19:42:00Z",
  "expires_at": "2027-02-13T19:42:00Z"
}
```

---

### 6.4 Revoke / Delete Token
Immediately revokes a token by deleting it from the database. Any subsequent requests using this token fail with `401 Unauthorized`.

```http
DELETE /api/v1/api-tokens/{tokenID}
```

#### Response: `200 OK`
```json
{
  "message": "Token revoked successfully"
}
```

---

## 7. External Scoped API Reference (`cloud/internal/api/external.go`)

The external API is mounted under `/api/v1/external` and is specifically tailored for token-authenticated programmatic access.

### 7.1 Calendar Events API

#### List Events
```http
GET /api/v1/external/events?start=2026-11-01T00:00:00Z&end=2026-11-30T23:59:59Z&limit=50
Authorization: Bearer <tide_pat_...>
```

- **Required Scope**: `events:read` (or `*`)
- **Query Parameters**:
  - `start` or `from`: ISO 8601 / RFC 3339 datetime or `YYYY-MM-DD`.
  - `end` or `to`: ISO 8601 / RFC 3339 datetime or `YYYY-MM-DD`.
  - `search` or `q`: Case-insensitive substring search in event title/description.
  - `limit`: Number of results (default 100, maximum 500).

##### Response: `200 OK`
```json
{
  "count": 1,
  "events": [
    {
      "id": "c1f7b029-7c42-4f05-8e43-e96b3ad4f391",
      "title": "Quarterly Architecture Review",
      "start": "2026-11-20T10:00:00Z",
      "end": "2026-11-20T11:30:00Z",
      "all_day": false,
      "color": "var(--accent)",
      "description": "Reviewing PAT and Cloud Sync Specifications",
      "location": "Virtual Room Alpha",
      "source": "manual",
      "created_at": "2026-11-10T14:22:00Z",
      "updated_at": "2026-11-10T14:22:00Z"
    }
  ]
}
```

#### Get Event Details
```http
GET /api/v1/external/events/{id}
Authorization: Bearer <tide_pat_...>
```

---

### 7.2 Notes API

#### Unencrypted Notes vs Zero-Knowledge E2EE Notes
Tide Cloud handles two categories of notes:
1. **Unencrypted Notes** (`unencrypted: true` in metadata):
   - Created via the external API, webhooks, or public exports.
   - Text/markdown content is stored directly in `BlobStore` or `file.Content`.
   - Full read and update support is available via the external API.
2. **End-to-End Encrypted Notes** (`unencrypted: false` or omitted):
   - Encrypted client-side with the user's master key.
   - The server only possesses ciphertext blobs.
   - External `GET /api/v1/external/notes/{id}` returns structural metadata with `"encrypted": true` and a clear notice:
     ```json
     {
       "id": "...",
       "title": "Encrypted Note Title",
       "encrypted": true,
       "message": "This note is end-to-end encrypted and cannot be decrypted without the user's private key"
     }
     ```
   - Attempting to update content of an encrypted note returns HTTP `400 Bad Request`:
     ```json
     {
       "error": "Bad Request",
       "message": "Cannot update content of an end-to-end encrypted note via external API. Note content is protected with client-side encryption.",
       "encrypted": true
     }
     ```

#### List Notes
```http
GET /api/v1/external/notes?search=architecture&limit=50
Authorization: Bearer <tide_pat_...>
```
- **Required Scope**: `notes:read` or `notes:write` (or `*`).
- Automatically filters results according to token workspace (`safe:<name>`) and folder (`folder:<id>`) scopes.

##### Response: `200 OK`
```json
{
  "count": 1,
  "notes": [
    {
      "id": "e44d3121-7243-41bb-98bc-bceecdbdb1a1",
      "title": "Server Architecture Specification",
      "parent_id": "f55c2192-3101-44bb-99cc-adebcbbba2b2",
      "updated_at": "2026-11-15T19:30:00Z"
    }
  ]
}
```

#### Get Note Content
```http
GET /api/v1/external/notes/{id}
Authorization: Bearer <tide_pat_...>
```

##### Response: `200 OK` (Unencrypted Note)
```json
{
  "id": "e44d3121-7243-41bb-98bc-bceecdbdb1a1",
  "title": "Server Architecture Specification",
  "content": "# Architecture Specification\n\nDetailed system overview...",
  "parent_id": null,
  "encrypted": false,
  "created_at": "2026-11-15T18:00:00Z",
  "updated_at": "2026-11-15T19:30:00Z"
}
```

#### Create Note
```http
POST /api/v1/external/notes
Authorization: Bearer <tide_pat_...>
Content-Type: application/json
```

```json
{
  "title": "Automated Agent Report",
  "content": "## Analysis Summary\n- All integration tests completed successfully.",
  "parent_id": null
}
```

- Notes created via the external API are automatically marked `"unencrypted": true` and `"author": "external_api"`.
- If the token contains a `safe:<name>` scope, the note is automatically assigned to that workspace.

#### Update Note
```http
PATCH /api/v1/external/notes/{id}
Authorization: Bearer <tide_pat_...>
Content-Type: application/json
```

```json
{
  "title": "Automated Agent Report (Updated)",
  "content": "## Analysis Summary\n- All integration tests completed successfully.\n- Build artifacts verified."
}
```

#### Delete Note
```http
DELETE /api/v1/external/notes/{id}
Authorization: Bearer <tide_pat_...>
```

---

### 7.3 Todos REST API

The Todos subsystem (`cloud/internal/api/todos.go`) is mounted under `/api/v1/external/todos` and provides full CRUD capabilities with granular scopes.

| Method | Endpoint | Required Scope | Description |
|---|---|---|---|
| `GET` | `/api/v1/external/todos` | `todos:read` or `todos:write` | List/filter todos (supports `status`, `priority`, `search`, `due_before`, `due_after`, `tags`, `limit`, `offset`) |
| `POST` | `/api/v1/external/todos` | `todos:create` or `todos:write` | Create a new todo item |
| `GET` | `/api/v1/external/todos/{id}` | `todos:read` or `todos:write` | Get a specific todo item |
| `PUT` | `/api/v1/external/todos/{id}` | `todos:edit` or `todos:write` | Replace a todo item |
| `PATCH` | `/api/v1/external/todos/{id}` | `todos:edit` or `todos:write` | Partially update a todo item (e.g. toggle completion) |
| `DELETE` | `/api/v1/external/todos/{id}` | `todos:delete` or `todos:write` | Permanently remove a todo item |

#### Create Todo Example
```http
POST /api/v1/external/todos
Authorization: Bearer <tide_pat_...>
Content-Type: application/json
```

```json
{
  "title": "Review PAT Implementation Docs",
  "description": "Verify that all cryptographic flows and endpoints match cloud/internal/api/api_tokens.go",
  "priority": "high",
  "due_date": "2026-11-18",
  "tags": ["security", "documentation", "audit"]
}
```

---

## 8. Security Best Practices & Token Lifecycle

### 8.1 Header vs Query Parameter Transmission
Tide Cloud supports three authentication mechanisms in `APITokenAuth`:
1. `Authorization: Bearer <token>` (**Recommended / Best Practice**)
2. `X-API-Key: <token>` (**Recommended for legacy webhook clients**)
3. `?api_token=<token>` (**Discouraged fallback**)

> [!WARNING]
> Transmitting tokens via query parameters (`?api_token=...`) exposes secrets to web server access logs, proxy caches, browser histories, and `Referer` headers. Query parameter authentication should only be used in restricted environments where custom HTTP headers cannot be configured (e.g. basic image/stream embedding).

### 8.2 Expiration Policies
- **Interactive Automation (CLI / MCP Tools)**: Recommend maximum 90-day lifespans (`expires_in_days: 90`).
- **Production Daemons & Infrastructure**: 180 or 365 days with proactive automated rotation schedules.
- **Never Expiring**: Permitted (`expires_in_days: 0`), but should be reserved for isolated sandbox or private local setups.

### 8.3 Zero-Downtime Token Rotation Protocol
For production services and daemons that must maintain continuous uptime:
1. Issue a new replacement token:
   ```bash
   curl -X POST https://tide.example.com/api/v1/api-tokens \
     -H "Authorization: Bearer <USER_SESSION_JWT>" \
     -H "Content-Type: application/json" \
     -d '{"name": "Daemon Worker (2027)", "scopes": ["notes:write", "todos:write"], "expires_in_days": 180}'
   ```
2. Update the environment variable or secrets store (`TIDE_API_TOKEN`) on the daemon service.
3. Reload or restart the daemon service.
4. Verify via `GET /api/v1/api-tokens` that the new token has recorded a recent `last_used_at` timestamp.
5. Revoke the old token via `DELETE /api/v1/api-tokens/{oldTokenID}`.

### 8.4 Secret Scanning & Leakage Detection
Because all Personal Access Tokens begin with the explicit prefix `tide_pat_`, organizations can configure git hooks, GitHub Secret Scanning, and automated DLP filters:

```regex
\btide_pat_[a-f0-9]{64}\b
```

Any commit or log entry matching this regular expression should immediately trigger:
1. Automated invocation of `DELETE /api/v1/api-tokens/{tokenID}`.
2. Security team alerting.
3. Invalidation of any pending jobs using the compromised token.

### 8.5 Compromise Response Protocol
If an API token is suspected of being compromised:
1. Identify the token ID using the prefix via `GET /api/v1/api-tokens`.
2. Immediately invoke `DELETE /api/v1/api-tokens/{tokenID}`.
3. Review audit logs and the `last_used_at` timestamp to determine the window of exposure.
4. Because PATs have **zero access** to the user's client-side encryption key, end-to-end encrypted notes and vault contents remain cryptographically protected and uncompromised.
