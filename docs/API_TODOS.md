# Tide Todos REST API — Third-Party Developer Documentation

The Tide Todos REST API enables external applications, automated workflows, third-party integrations (such as Home Assistant, Apple Shortcuts, Raycast, Python/Node.js bots, or CI/CD pipelines) to query, create, filter, update, and manage todos directly.

---

## 1. Authentication & Base URLs

### Base URLs
- Primary Endpoint: `https://go-tide.app/api/v1/todos`
- External Alias: `https://go-tide.app/api/v1/external/todos`
- Local Development: `http://localhost:8080/api/v1/todos`

### Token Format
Personal Access Tokens (PATs) start with the prefix `tide_pat_` followed by 64 hexadecimal characters:
```
tide_pat_a1b2c3d4e5f6...
```
Tokens can be generated and managed directly within Tide under **Settings → API Access**.

### Supported Authentication Headers
The API supports three authentication methods:

1. **Standard Bearer Header (Recommended)**
   ```http
   Authorization: Bearer tide_pat_a1b2c3d4...
   ```

2. **API Key Header**
   ```http
   X-API-Key: tide_pat_a1b2c3d4...
   ```

3. **Query Parameter (Alternative for environments where custom headers are restricted)**
   ```http
   https://go-tide.app/api/v1/todos?api_token=tide_pat_a1b2c3d4...
   ```

---

## 2. Token Scopes & Permissions

Tide enforces granular permission scopes. When generating a token, select only the scopes your integration needs:

| Scope | Name | Description | Allowed Actions |
|---|---|---|---|
| `todos:read` | Read Todos | View and filter todos | `GET /api/v1/todos`, `GET /api/v1/todos/{id}` |
| `todos:create` | Create Todos | Add new todos | `POST /api/v1/todos` |
| `todos:edit` | Edit Todos | Modify existing todos & statuses | `PUT /api/v1/todos/{id}`, `PATCH /api/v1/todos/{id}` |
| `todos:delete` | Delete Todos | Delete todos | `DELETE /api/v1/todos/{id}` |
| `todos:write` | Full Todo Management | Grants full create, edit, and delete rights | All write operations (`POST`, `PUT`, `PATCH`, `DELETE`) |
| `*` | Full Account Access | Grants all permissions across Tide | All methods |

> **Note:** If a token lacks the required scope, the API responds with `403 Forbidden` and details about the missing scopes:
> ```json
> {
>   "error": "Forbidden",
>   "message": "Token lacks required scope",
>   "required_scopes": ["todos:read", "todos:write"],
>   "token_scopes": ["events:read"]
> }
> ```

---

## 3. Data Model

A Todo item consists of the following attributes:

| Field | Type | Description |
|---|---|---|
| `id` | `string` | Unique UUID identifier |
| `user_id` | `string` | Owner user UUID |
| `title` | `string` | Title / summary of the task (*required*) |
| `description` | `string` | Extended markdown or plain text details |
| `status` | `string` | Status: `"todo"`, `"in_progress"`, or `"completed"` |
| `priority` | `string` | Priority level: `"low"`, `"medium"`, or `"high"` |
| `due_date` | `string` | Target date/time in `YYYY-MM-DD` or RFC 3339 format |
| `scheduled_date`| `string` | Planned working date in `YYYY-MM-DD` format |
| `tags` | `string[]` | Array of label tags e.g. `["work", "project-x"]` |
| `color` | `string` | Hex color code or design token color string |
| `is_completed` | `boolean` | `true` if completed, `false` otherwise |
| `completed_at` | `string \| null` | RFC 3339 timestamp when completed |
| `is_overdue` | `boolean` | Computed dynamically: `true` if uncompleted and `due_date < today` |
| `created_at` | `string` | RFC 3339 creation timestamp |
| `updated_at` | `string` | RFC 3339 last update timestamp |

---

## 4. Endpoints & Operations

### 4.1 List & Filter Todos

- **Method**: `GET /api/v1/todos`
- **Required Scope**: `todos:read` or `todos:write`
- **Response**: `200 OK` with JSON array of todos (`Todo[]`)

#### Query Parameters

| Parameter | Type | Example | Description |
|---|---|---|---|
| `date` | `string` | `2026-11-05` | Matches tasks where `due_date` or `scheduled_date` equals or starts with this date |
| `prio` or `priority` | `string` | `high` | Filter by priority (`low`, `medium`, `high`) |
| `tag` | `string` | `work` | Filter by exact tag name within the tags array |
| `description` or `q` or `search` | `string` | `deploy` | Case-insensitive substring search in both `title` and `description` |
| `overdue` | `boolean` | `true` or `1` | Filters for uncompleted tasks whose `due_date` is before today's date |
| `status` | `string` | `todo` | Filter by status (`todo`, `in_progress`, `completed`) |
| `completed` | `boolean` | `false` | Filter by completion state (`true` or `false`) |
| `limit` | `integer` | `50` | Maximum items to return (default: `100`, max: `500`) |
| `offset` | `integer` | `0` | Pagination offset |

#### Example Request: List High-Priority Overdue Todos
```bash
curl -X GET "https://go-tide.app/api/v1/todos?prio=high&overdue=true" \
  -H "Authorization: Bearer tide_pat_YOUR_TOKEN"
```

#### Example Response: `200 OK`
```json
[
  {
    "id": "e304b8d7-740e-4364-bbcf-c3f2bb01c77f",
    "user_id": "893d59a2-5b94-4dc4-8399-5ef6ee15c103",
    "title": "Release v2.4.0 to production",
    "description": "Deploy backend migrations and cloud services",
    "status": "todo",
    "priority": "high",
    "due_date": "2026-11-01",
    "scheduled_date": "2026-11-01",
    "tags": ["deploy", "cloud"],
    "color": "#ef4444",
    "is_completed": false,
    "completed_at": null,
    "is_overdue": true,
    "created_at": "2026-10-30T10:00:00Z",
    "updated_at": "2026-10-30T10:00:00Z"
  }
]
```

---

### 4.2 Create a Todo

- **Method**: `POST /api/v1/todos`
- **Required Scope**: `todos:create` or `todos:write`
- **Response**: `201 Created` with created todo object

#### Request Body Schema
```json
{
  "title": "String (required)",
  "description": "String (optional)",
  "priority": "low | medium | high (default: medium)",
  "status": "todo | in_progress | completed (default: todo)",
  "due_date": "YYYY-MM-DD or RFC3339 (optional)",
  "scheduled_date": "YYYY-MM-DD (optional)",
  "tags": ["String"] (optional),
  "color": "String hex code (optional)",
  "is_completed": false (optional)
}
```

#### Example Request
```bash
curl -X POST "https://go-tide.app/api/v1/todos" \
  -H "Authorization: Bearer tide_pat_YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Prepare quarterly review",
    "description": "Gather metrics from Prometheus and SQLite telemetry",
    "priority": "high",
    "due_date": "2026-11-15",
    "scheduled_date": "2026-11-14",
    "tags": ["planning", "management"],
    "color": "#3b82f6"
  }'
```

#### Example Response: `201 Created`
```json
{
  "id": "7df4ba62-a567-4e78-9584-f7b58c743bc1",
  "user_id": "893d59a2-5b94-4dc4-8399-5ef6ee15c103",
  "title": "Prepare quarterly review",
  "description": "Gather metrics from Prometheus and SQLite telemetry",
  "status": "todo",
  "priority": "high",
  "due_date": "2026-11-15",
  "scheduled_date": "2026-11-14",
  "tags": ["planning", "management"],
  "color": "#3b82f6",
  "is_completed": false,
  "completed_at": null,
  "is_overdue": false,
  "created_at": "2026-11-02T15:00:00Z",
  "updated_at": "2026-11-02T15:00:00Z"
}
```

---

### 4.3 Get Single Todo

- **Method**: `GET /api/v1/todos/{id}`
- **Required Scope**: `todos:read` or `todos:write`
- **Response**: `200 OK` with todo object, or `404 Not Found`

#### Example Request
```bash
curl -X GET "https://go-tide.app/api/v1/todos/7df4ba62-a567-4e78-9584-f7b58c743bc1" \
  -H "X-API-Key: tide_pat_YOUR_TOKEN"
```

---

### 4.4 Update a Todo (Full or Partial)

- **Method**: `PUT /api/v1/todos/{id}` or `PATCH /api/v1/todos/{id}`
- **Required Scope**: `todos:edit` or `todos:write`
- **Response**: `200 OK` with updated todo object

Both `PUT` and `PATCH` support partial updates. Only supplied fields are updated. If `is_completed: true` or `status: "completed"` is submitted, `completed_at` is automatically populated with the current timestamp.

#### Example Request: Mark Task Completed
```bash
curl -X PATCH "https://go-tide.app/api/v1/todos/7df4ba62-a567-4e78-9584-f7b58c743bc1" \
  -H "Authorization: Bearer tide_pat_YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "is_completed": true,
    "status": "completed"
  }'
```

#### Example Response: `200 OK`
```json
{
  "id": "7df4ba62-a567-4e78-9584-f7b58c743bc1",
  "user_id": "893d59a2-5b94-4dc4-8399-5ef6ee15c103",
  "title": "Prepare quarterly review",
  "description": "Gather metrics from Prometheus and SQLite telemetry",
  "status": "completed",
  "priority": "high",
  "due_date": "2026-11-15",
  "scheduled_date": "2026-11-14",
  "tags": ["planning", "management"],
  "color": "#3b82f6",
  "is_completed": true,
  "completed_at": "2026-11-02T15:30:00Z",
  "is_overdue": false,
  "created_at": "2026-11-02T15:00:00Z",
  "updated_at": "2026-11-02T15:30:00Z"
}
```

---

### 4.5 Delete a Todo

- **Method**: `DELETE /api/v1/todos/{id}`
- **Required Scope**: `todos:delete` or `todos:write`
- **Response**: `204 No Content` on success, or `404 Not Found`

#### Example Request
```bash
curl -X DELETE "https://go-tide.app/api/v1/todos/7df4ba62-a567-4e78-9584-f7b58c743bc1" \
  -H "Authorization: Bearer tide_pat_YOUR_TOKEN"
```

---

## 5. Ready-to-Use Examples

### Search by Keyword Across Title & Description
```bash
curl -G "https://go-tide.app/api/v1/todos" \
  -H "Authorization: Bearer tide_pat_YOUR_TOKEN" \
  --data-urlencode "q=database"
```

### Filter by Scheduled Date
```bash
curl -G "https://go-tide.app/api/v1/todos" \
  -H "Authorization: Bearer tide_pat_YOUR_TOKEN" \
  --data-urlencode "date=2026-11-02"
```

### Filter by Specific Tag
```bash
curl -G "https://go-tide.app/api/v1/todos" \
  -H "X-API-Key: tide_pat_YOUR_TOKEN" \
  --data-urlencode "tag=backend"
```

### Get Open (Incomplete) High-Priority Tasks
```bash
curl -G "https://go-tide.app/api/v1/todos" \
  -H "Authorization: Bearer tide_pat_YOUR_TOKEN" \
  --data-urlencode "prio=high" \
  --data-urlencode "completed=false"
```

---

## 6. HTTP Status Code Reference

| Status Code | Meaning | Description |
|---|---|---|
| `200 OK` | Success | Request succeeded and returned requested data |
| `201 Created` | Resource Created | New todo successfully created |
| `204 No Content` | Deleted | Todo successfully deleted |
| `400 Bad Request` | Validation Error | Missing required title or invalid JSON body |
| `401 Unauthorized` | Invalid Authentication | Missing or expired token |
| `403 Forbidden` | Missing Scope | Token does not have permission for the requested action |
| `404 Not Found` | Not Found | Todo item does not exist or does not belong to the user |
| `500 Internal Error`| Server Error | Unexpected server error |
