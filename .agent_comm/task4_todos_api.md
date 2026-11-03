# Investigation & Architectural Design Report: Todos REST API with Token Authentication, Query Filtering & Scopes

## 1. Executive Summary

This report delivers a complete codebase investigation and architectural design for adding a comprehensive **Todos REST API** to Tide Cloud (`cloud/`). The API enables third-party services, scripts (e.g. Home Assistant, Shortcuts, Python/Node bots), and external tools to authenticate via Personal Access Tokens (`tide_pat_...`), query and filter todos (by date, priority, tag, description, overdue status), and perform full CRUD operations with granular permission scopes.

---

## 2. Deep-Dive Codebase Analysis

### 2.1 API Token Authentication & Scope System
- **Token Format & Storage**:
  - Personal Access Tokens have prefix `tide_pat_` followed by 32 cryptographically secure random bytes encoded in hexadecimal (64 characters, total 73 chars).
  - Stored in SQLite table `api_tokens`:
    ```sql
    CREATE TABLE IF NOT EXISTS api_tokens (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        name TEXT NOT NULL,
        token_hash TEXT NOT NULL UNIQUE,  -- SHA-256 hex string of the full token
        token_prefix TEXT NOT NULL,       -- e.g. "tide_pat_a1b2c3d4..."
        scopes TEXT NOT NULL,             -- JSON string array, e.g. '["events:read"]'
        created_at DATETIME NOT NULL,
        expires_at DATETIME,
        last_used_at DATETIME,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    ```
- **Scope Definitions (`cloud/internal/api/api_tokens.go`)**:
  - `SupportedScopes` currently defines:
    - `events:read`, `events:write`, `notes:read`, `notes:write`, `storage:expand`.
  - `ListScopes` returns a list of scopes with their `Implemented` status.
  - In frontend (`web/src/components/Settings/APIAccessSettings.tsx`), `SCOPE_DEFINITIONS` mirrors available scopes for user token creation.
- **Middleware & Scope Enforcement (`cloud/internal/api/external.go`)**:
  - `APITokenAuth(s *store.SQLiteStore, requiredScope string)` accepts a token via:
    1. Header: `Authorization: Bearer <token>`
    2. Header: `X-API-Key: <token>`
    3. Query parameter: `?api_token=<token>`
  - Computes `sha256.Sum256([]byte(tokenString))` and calls `s.GetAPITokenByHash(ctx, hash)`.
  - Validates expiration (`token.ExpiresAt`).
  - Checks if `token.Scopes` includes the `requiredScope` (returns 403 Forbidden if missing).
  - Updates `last_used_at` asynchronously in a background goroutine.
  - Populates `user_id` and `api_token_id` in request context: `context.WithValue(r.Context(), "user_id", apiToken.UserID)`.

### 2.2 Existing Task/Todo Storage Architecture
- **In SQLite Database (`cloud/internal/store/sqlite.go`)**:
  - There is a `tasks` table created on startup:
    ```sql
    CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        encrypted_vault BLOB NOT NULL,
        created_at DATETIME NOT NULL,
        updated_at DATETIME NOT NULL,
        FOREIGN KEY(user_id) REFERENCES users(id)
    );
    ```
  - `cloud/internal/api/tasks.go` exposes `/api/v1/tasks` (CRUD), which uses `AuthMiddleware` (JWT / user session cookie).
- **In Web Client (`web/src/store/slices/createTodosSlice.ts`)**:
  - Tasks in the web app are zero-knowledge end-to-end encrypted using the user's RSA-OAEP public key (`encryptMetadata(vaultPayload, publicKey)`).
  - The plaintext fields inside the encrypted payload are:
    `title`, `description`, `color`, `isCompleted`, `status` (`todo`|`in_progress`|`completed`), `linkedNoteId`, `scheduledDate`, `priority` (`low`|`medium`|`high`), `dueDate`, `recurrence`, `tags` (`string[]`), `folder`, `createdAt`, `completedAt`, `updatedAt`, `isArchived`, `parentId`, `order`.
  - When loading, `fsHelpers.ts:decryptTasks` decrypts each task with the user's private RSA key in the browser.
- **Why External API Clients Cannot Use Raw `encrypted_vault`**:
  - External API consumers (third-party scripts, curl, Home Assistant, Shortcuts) do NOT possess the user's private RSA key (which exists only inside the browser after passphrase unlock).
  - The server cannot decrypt `encrypted_vault`.
  - Therefore, for an external REST API with filtering by `date`, `prio`, `tag`, `description`, and `overdue`, todos MUST be stored with unencrypted, structured columns in the database (analogous to how `files` stores `metadata` and `public_meta` for external calendar events).

---

## 3. Architecture & Design of the Todos REST API

### 3.1 Database Migration: Dedicated `todos` Table
To ensure high performance, clean indexing, zero-risk backward compatibility, and clean data isolation, we introduce **Migration 10** in `cloud/internal/store/sqlite.go`:

```sql
CREATE TABLE IF NOT EXISTS todos (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'todo',       -- 'todo', 'in_progress', 'completed'
    priority TEXT NOT NULL DEFAULT 'medium',   -- 'low', 'medium', 'high'
    due_date TEXT NOT NULL DEFAULT '',         -- 'YYYY-MM-DD' or RFC3339
    scheduled_date TEXT NOT NULL DEFAULT '',   -- 'YYYY-MM-DD'
    tags TEXT NOT NULL DEFAULT '[]',           -- JSON array of strings e.g. ["work", "home"]
    color TEXT NOT NULL DEFAULT '',
    is_completed INTEGER NOT NULL DEFAULT 0,  -- 0 = false, 1 = true
    completed_at DATETIME,
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_todos_user ON todos(user_id);
CREATE INDEX IF NOT EXISTS idx_todos_due_date ON todos(due_date);
CREATE INDEX IF NOT EXISTS idx_todos_status ON todos(status);
CREATE INDEX IF NOT EXISTS idx_todos_priority ON todos(priority);
CREATE INDEX IF NOT EXISTS idx_todos_created ON todos(created_at);
```

### 3.2 Granular Token Scopes & Permission Hierarchy
The user explicitly asked: *"für alles aber bestimmte Rechte über das Token zuweisen"*.
We establish the following scope matrix:

| Scope | Description | Allowed Actions |
|---|---|---|
| `todos:read` | Read / filter todos | `GET /api/v1/todos`, `GET /api/v1/todos/{id}` |
| `todos:create` | Create new todos | `POST /api/v1/todos` |
| `todos:edit` | Edit existing todos & change status | `PUT /api/v1/todos/{id}`, `PATCH /api/v1/todos/{id}` |
| `todos:delete` | Delete todos | `DELETE /api/v1/todos/{id}` |
| `todos:write` | Full management access | Grants `todos:create`, `todos:edit`, and `todos:delete` |
| `*` | Full system access | Grants all actions |

#### Middleware Scope Evaluation (`RequireAnyScope`):
Instead of a rigid single-scope check, the middleware checks if the token contains any matching permission:
- `GET`: Token has `todos:read`, `todos:write`, or `*`
- `POST`: Token has `todos:create`, `todos:write`, or `*`
- `PUT` / `PATCH`: Token has `todos:edit`, `todos:write`, or `*`
- `DELETE`: Token has `todos:delete`, `todos:write`, or `*`

### 3.3 Endpoint Specification

Endpoints will be registered at:
- Primary: `/api/v1/todos`
- Alias / Integration: `/api/v1/external/todos`

#### 1. `GET /api/v1/todos` (List & Filter)
- **Scope**: `todos:read` (or `todos:write`)
- **Query Parameters**:
  - `date`: Matches `due_date` or `scheduled_date` (exact date e.g. `2026-11-02` or prefix)
  - `prio` or `priority`: Filter by priority (`low`, `medium`, `high`)
  - `tag`: Filter by tag name (searches JSON array `tags`)
  - `description` or `q` or `search`: Substring search in both `description` and `title` (case-insensitive)
  - `overdue`: Boolean (`true`, `1`). If true, filters for `is_completed = 0` AND `due_date != ''` AND `due_date < CURRENT_DATE`
  - `status`: Filter by status (`todo`, `in_progress`, `completed`)
  - `completed`: Boolean (`true`, `false`)
  - `limit`: Integer (default 100, max 500)
  - `offset`: Integer (default 0)
- **Response `200 OK`**:
  ```json
  {
    "count": 1,
    "todos": [
      {
        "id": "c7a8d29f-3d01-4475-816b-71510e1a1efb",
        "title": "API Dokumentation für Dritte",
        "description": "REST Endpunkte und Token-Scopes dokumentieren",
        "status": "todo",
        "priority": "high",
        "due_date": "2026-11-05",
        "scheduled_date": "2026-11-02",
        "tags": ["api", "docs"],
        "color": "#ef4444",
        "is_completed": false,
        "completed_at": null,
        "is_overdue": false,
        "created_at": "2026-11-02T14:00:00Z",
        "updated_at": "2026-11-02T14:00:00Z"
      }
    ]
  }
  ```

#### 2. `POST /api/v1/todos` (Create)
- **Scope**: `todos:create` (or `todos:write`)
- **Request Body**:
  ```json
  {
    "title": "Neue Aufgabe",
    "description": "Optionale Beschreibung",
    "priority": "high",
    "status": "todo",
    "due_date": "2026-11-10",
    "scheduled_date": "2026-11-02",
    "tags": ["work", "backend"],
    "color": "#3b82f6"
  }
  ```
- **Response `201 Created`**:
  ```json
  {
    "todo": {
      "id": "...",
      "title": "Neue Aufgabe",
      ...
    }
  }
  ```

#### 3. `GET /api/v1/todos/{id}` (Get Single)
- **Scope**: `todos:read` (or `todos:write`)
- **Response `200 OK`** or `404 Not Found`.

#### 4. `PUT /api/v1/todos/{id}` & `PATCH /api/v1/todos/{id}` (Update)
- **Scope**: `todos:edit` (or `todos:write`)
- Allows updating title, description, status, priority, due_date, scheduled_date, tags, color, is_completed.
- Automatically updates `completed_at` when `is_completed` becomes true or `status` becomes `completed`.
- **Response `200 OK`**: Updated todo object.

#### 5. `DELETE /api/v1/todos/{id}` (Delete)
- **Scope**: `todos:delete` (or `todos:write`)
- Deletes the record belonging to the authenticated token's `user_id`.
- **Response `200 OK`**:
  ```json
  {
    "message": "Todo deleted successfully",
    "id": "c7a8d29f-3d01-4475-816b-71510e1a1efb"
  }
  ```

---

## 4. Implementation Blueprint (Atomic Step-by-Step)

### Step 1: Database Models & Migration
1. **Model** (`cloud/internal/db/models.go`):
   Define `db.Todo`:
   ```go
   type Todo struct {
       ID            string     `json:"id" db:"id"`
       UserID        string     `json:"user_id" db:"user_id"`
       Title         string     `json:"title" db:"title"`
       Description   string     `json:"description" db:"description"`
       Status        string     `json:"status" db:"status"`
       Priority      string     `json:"priority" db:"priority"`
       DueDate       string     `json:"due_date" db:"due_date"`
       ScheduledDate string     `json:"scheduled_date" db:"scheduled_date"`
       Tags          []string   `json:"tags" db:"tags"`
       Color         string     `json:"color" db:"color"`
       IsCompleted   bool       `json:"is_completed" db:"is_completed"`
       CompletedAt   *time.Time `json:"completed_at,omitempty" db:"completed_at"`
       IsOverdue     bool       `json:"is_overdue"`
       CreatedAt     time.Time  `json:"created_at" db:"created_at"`
       UpdatedAt     time.Time  `json:"updated_at" db:"updated_at"`
   }
   ```
2. **Deterministic Migration 10** (`cloud/internal/store/sqlite.go`):
   Add version 10 `schemaMigration` creating the `todos` table and indices as specified above.

### Step 2: Store Operations (`cloud/internal/store/sqlite_todos.go`)
Create a new store file dedicated to todos:
- `CreateTodo(ctx context.Context, todo *db.Todo) error`
- `GetTodo(ctx context.Context, userID, id string) (*db.Todo, error)`
- `ListTodos(ctx context.Context, userID string, filter TodoFilter) ([]*db.Todo, error)`
  - SQL dynamic WHERE builder:
    - `user_id = ?`
    - Date filtering: checks `due_date = ? OR scheduled_date = ?` (or date range)
    - Priority: `LOWER(priority) = ?`
    - Description/search: `(LOWER(title) LIKE ? OR LOWER(description) LIKE ?)`
    - Tag: `tags LIKE ?` (e.g. `%"work"%` or `json_each`)
    - Overdue: `is_completed = 0 AND due_date != '' AND due_date < ?` (where `?` is today's date formatted as `2006-01-02`)
    - Status: `status = ?`
    - Completed: `is_completed = ?`
  - Dynamic sort: `ORDER BY CASE WHEN due_date != '' THEN 0 ELSE 1 END, due_date ASC, priority DESC, created_at DESC`
  - Calculates `IsOverdue = !todo.IsCompleted && todo.DueDate != "" && isBeforeToday(todo.DueDate)`
- `UpdateTodo(ctx context.Context, todo *db.Todo) error`
- `DeleteTodo(ctx context.Context, userID, id string) error`

### Step 3: Token Scopes & Middleware Extension
1. **Extend `SupportedScopes` (`cloud/internal/api/api_tokens.go`)**:
   ```go
   "todos:read":   "Aufgaben abfragen & filtern (Leserechte)",
   "todos:write":  "Aufgaben verwalten (Erstellen, Bearbeiten, Löschen)",
   "todos:create": "Aufgaben erstellen",
   "todos:edit":   "Aufgaben bearbeiten & Status ändern",
   "todos:delete": "Aufgaben löschen",
   ```
   Update `ListScopes` to mark all these scopes as `Implemented: true`.
2. **Update `APITokenAuth` / add `APITokenAuthAny` (`cloud/internal/api/external.go` or `cloud/internal/api/todos.go`)**:
   Allow validating against multiple valid scopes (e.g., `todos:read` or `todos:write` or `*`).

### Step 4: Todo API Handlers & Router Setup
1. **Create `cloud/internal/api/todos.go`**:
   - `TodoHandler` struct holding `Store *store.SQLiteStore`.
   - `RegisterRoutes(r chi.Router)` with sub-groups:
     - `GET /` -> `APITokenAuth(Store, "todos:read", "todos:write")` -> `ListTodos`
     - `POST /` -> `APITokenAuth(Store, "todos:create", "todos:write")` -> `CreateTodo`
     - `GET /{id}` -> `APITokenAuth(Store, "todos:read", "todos:write")` -> `GetTodo`
     - `PUT /{id}` & `PATCH /{id}` -> `APITokenAuth(Store, "todos:edit", "todos:write")` -> `UpdateTodo`
     - `DELETE /{id}` -> `APITokenAuth(Store, "todos:delete", "todos:write")` -> `DeleteTodo`
2. **Register in `cloud/cmd/server/main.go`**:
   ```go
   todoHandler := api.NewTodoHandler(sqliteStore)
   r.Route("/todos", todoHandler.RegisterRoutes)
   ```
   And in `externalHandler.RegisterRoutes` (`cloud/internal/api/external.go`):
   ```go
   r.Route("/todos", todoHandler.RegisterRoutes)
   ```

### Step 5: Web UI Token Creation Integration
In `web/src/components/Settings/APIAccessSettings.tsx`:
Add the new todo scopes to `SCOPE_DEFINITIONS`:
- `todos:read`: type `'todos'`, implemented: `true`
- `todos:write`: type `'todos'`, implemented: `true`
- `todos:create`: type `'todos'`, implemented: `true`
- `todos:edit`: type `'todos'`, implemented: `true`
- `todos:delete`: type `'todos'`, implemented: `true`

### Step 6: Comprehensive Documentation for Third Parties
Create `docs/API_TODOS.md` (and link from `cloud/docs/API.md`):
- Complete HTTP specification.
- Authentication instructions (Header formats: `Authorization: Bearer <token>`, `X-API-Key: <token>`).
- Permission table explaining which scope is required for each operation.
- Query parameters reference table (`date`, `prio`, `tag`, `description`, `overdue`, `status`, `completed`, `limit`, `offset`).
- Overdue logic explanation.
- cURL commands and JSON response examples for every operation.

### Step 7: Tests
Create `cloud/internal/api/todos_test.go`:
- Test token creation with `todos:read`, `todos:write`, and granular scopes (`todos:create`, `todos:edit`, `todos:delete`).
- Test unauthorized access (no token -> 401).
- Test forbidden access (token with `events:read` only -> 403).
- Test CRUD operations.
- Test query filters:
  - Filter by `date`
  - Filter by `prio=high`
  - Filter by `tag=work`
  - Filter by `description` (substring search)
  - Filter by `overdue=true`
- Test token revocation -> 401.

---

## 5. Summary of Files to be Modified / Created

| File | Action | Purpose |
|---|---|---|
| `cloud/internal/db/models.go` | Modify | Add `db.Todo` struct |
| `cloud/internal/store/sqlite.go` | Modify | Add deterministic migration 10 for `todos` table |
| `cloud/internal/store/sqlite_todos.go` | Create | Store methods for Todos CRUD & advanced filtering |
| `cloud/internal/api/api_tokens.go` | Modify | Register new todo scopes in `SupportedScopes` & `ListScopes` |
| `cloud/internal/api/todos.go` | Create | HTTP endpoints, scope authorization, JSON handlers |
| `cloud/internal/api/external.go` | Modify | Alias `/todos` inside `/external` router |
| `cloud/cmd/server/main.go` | Modify | Mount `/api/v1/todos` routes |
| `web/src/components/Settings/APIAccessSettings.tsx` | Modify | UI display of Todos scopes in Settings |
| `docs/API_TODOS.md` | Create | Exhaustive API documentation for third parties |
| `cloud/docs/API.md` | Modify | Register new Todos section |
| `cloud/internal/api/todos_test.go` | Create | Comprehensive unit & integration tests |
