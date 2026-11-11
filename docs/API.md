# Tide REST API — Developer & Integration Guide

The Tide REST API enables external applications, third-party integrations (such as Obsidian sync, Raycast extensions, Apple Shortcuts, Home Assistant, Python/Node.js bots, LLM agents, CI/CD pipelines, and backup scripts) to programmatically interact with Tide Notes, Todos, and Calendar Events.

---

## Table of Contents

1. [Overview & Base URLs](#1-overview--base-urls)
2. [Authentication](#2-authentication)
3. [Scopes & Permissions](#3-scopes--permissions)
4. [Notes API](#4-notes-api)
   - [UI Shortcut: "API-Adresse kopieren"](#41-ui-shortcut-api-adresse-kopieren)
   - [Data Model](#42-note-data-model)
   - [List & Search Notes (`GET /external/notes`)](#43-list--search-notes)
   - [Create a Note (`POST /external/notes`)](#44-create-a-note)
   - [Get a Single Note (`GET /external/notes/{id}`)](#45-get-a-single-note)
   - [Update a Note (`PUT` / `PATCH /external/notes/{id}`)](#46-update-a-note)
   - [Delete a Note (`DELETE /external/notes/{id}`)](#47-delete-a-note)
5. [Todos API](#5-todos-api)
   - [Data Model](#51-todo-data-model)
   - [List & Filter Todos (`GET /todos`)](#52-list--filter-todos)
   - [Create a Todo (`POST /todos`)](#53-create-a-todo)
   - [Get Single Todo (`GET /todos/{id}`)](#54-get-single-todo)
   - [Update a Todo (`PUT` / `PATCH /todos/{id}`)](#55-update-a-todo)
   - [Delete a Todo (`DELETE /todos/{id}`)](#56-delete-a-todo)
6. [Calendar Events API](#6-calendar-events-api)
   - [Data Model](#61-event-data-model)
   - [List Events (`GET /external/events`)](#62-list-events)
   - [Get Single Event (`GET /external/events/{id}`)](#63-get-single-event)
7. [HTTP Status Codes & Error Handling](#7-http-status-codes--error-handling)

---

## 1. Overview & Base URLs

All API routes are served under the `/api/v1` namespace.

| Environment | Base URL |
|---|---|
| **Production** | `https://go-tide.app/api/v1` |
| **Local Development** | `http://localhost:8080/api/v1` |

### Route Prefix Summary

| Resource | Primary Endpoint | Aliases |
|---|---|---|
| **Notes** | `/api/v1/external/notes` | — |
| **Todos** | `/api/v1/todos` | `/api/v1/external/todos` |
| **Events** | `/api/v1/external/events` | — |

---

## 2. Authentication

External API calls are authenticated using **Personal Access Tokens (PATs)**.

### Token Format
Tokens start with the `tide_pat_` prefix followed by 64 hexadecimal characters:
```
tide_pat_a1b2c3d4e5f6...
```

### Managing Tokens in the Web UI
1. Open Tide and navigate to **Settings (gear icon) → API Access** (or **Zugriff**).
2. Click **Create New Token** (`Neuen Token erstellen`).
3. Enter a label (e.g., `Home Assistant`, `Raycast Extension`, `Backup Bot`).
4. Select the permissions / scopes required for your integration.
5. Choose an expiration duration (`30 days`, `60 days`, `90 days`, `1 year`, or `No expiration`).
6. Copy the generated token immediately. **Tide stores only a secure SHA-256 hash of the token on the server; the token plaintext cannot be retrieved after creation.**

### Supported Authentication Headers

Tide accepts tokens through three methods:

#### 1. Standard Bearer Authorization Header (Recommended)
```http
Authorization: Bearer tide_pat_a1b2c3d4...
```

#### 2. X-API-Key Header
```http
X-API-Key: tide_pat_a1b2c3d4...
```

#### 3. URL Query Parameter
Useful for webhooks, widgets, or environments where setting custom headers is constrained:
```http
https://go-tide.app/api/v1/todos?api_token=tide_pat_a1b2c3d4...
```

---

## 3. Scopes & Permissions

Tokens enforce granular permission scoping. Access is denied with `403 Forbidden` if an endpoint is called without an authorized scope.

### Core Permission Scopes

| Scope | Category | Description | Granted Endpoints |
|---|---|---|---|
| `todos:read` | Todos | Read and filter todos | `GET /api/v1/todos`, `GET /api/v1/todos/{id}` |
| `todos:create` | Todos | Add new todos | `POST /api/v1/todos` |
| `todos:edit` | Todos | Modify todos and update completion status | `PUT /api/v1/todos/{id}`, `PATCH /api/v1/todos/{id}` |
| `todos:delete` | Todos | Delete todos | `DELETE /api/v1/todos/{id}` |
| `todos:write` | Todos | Full todo management | All `POST`, `PUT`, `PATCH`, `DELETE` operations on todos |
| `notes:read` | Notes | Read-only access to list, search, and view notes | `GET /api/v1/external/notes`, `GET /api/v1/external/notes/{id}` |
| `notes:write` | Notes | Full note management (create, update, delete) | All methods on `/api/v1/external/notes` |
| `events:read` | Events | Read-only access to calendar events | `GET /api/v1/external/events`, `GET /api/v1/external/events/{id}` |
| `events:write` | Events | Create, modify, and delete calendar events *(in rollout)* | Write operations on events |
| `*` | Superuser | Full access to all API endpoints | All methods across all modules |

### Workspace & Safe Scoping (`safe:<name>`)

Tide supports workspace compartmentalization via **Safes** (e.g. `main`, `work`, `personal`). Tokens can be constrained to a specific safe:

- **Format**: `safe:<safe_name>` (e.g., `safe:work`, `safe:personal`, `safe:finance`)
- **Behavior**: When a token carries a `safe:<name>` scope, operations are restricted to resources within that vault or namespace. Notes or items created inherit this safe assignment automatically.
- **Combining Scopes**: Safe scopes can be combined with functional scopes:
  ```json
  ["notes:read", "notes:write", "safe:work"]
  ```

### Scope Error Response (`403 Forbidden`)

```json
{
  "error": "Forbidden",
  "message": "Token lacks required scope",
  "required_scopes": ["notes:read", "notes:write"],
  "token_scopes": ["events:read"]
}
```

---

## 4. Notes API

### 4.1 UI Shortcut: "API-Adresse kopieren"

For rapid integration with scripts or shortcuts:
1. In the Tide web UI, locate any note in the sidebar tree or list.
2. Click the **3-dot menu** (`...`) next to the note title.
3. Select **"API-Adresse kopieren"**.
4. The direct API URL (`https://go-tide.app/api/v1/external/notes/{id}`) is copied directly to your clipboard.

### 4.2 Note Data Model

| Field | Type | Description |
|---|---|---|
| `id` | `string` (UUID) | Unique identifier for the note |
| `title` | `string` | Title of the note |
| `content` | `string` | Full Markdown or plain text note content |
| `parent_id` | `string \| null` | UUID of the parent folder containing the note (or `null` if root) |
| `created_at` | `string` (RFC 3339) | Timestamp when the note was created |
| `updated_at` | `string` (RFC 3339) | Timestamp when the note was last modified |

---

### 4.3 List & Search Notes

- **Endpoint**: `GET /api/v1/external/notes`
- **Required Scope**: `notes:read` or `notes:write` (or `*`)

#### Query Parameters

| Parameter | Type | Default | Description |
|---|---|---|---|
| `q` or `search` | `string` | — | Case-insensitive title search query |
| `limit` | `integer` | `100` | Maximum results to return (max `500`) |

#### Example Request
```bash
curl -X GET "https://go-tide.app/api/v1/external/notes?q=architecture&limit=10" \
  -H "Authorization: Bearer tide_pat_YOUR_TOKEN"
```

#### Example Response (`200 OK`)
```json
{
  "count": 1,
  "notes": [
    {
      "id": "e304b8d7-740e-4364-bbcf-c3f2bb01c77f",
      "title": "System Architecture Overview",
      "content": "# System Architecture\n\nTide uses an end-to-end encrypted SQLite vault...",
      "parent_id": "4a7f05b8-d227-440f-90db-2b6214a1c5d9",
      "created_at": "2026-11-01T10:00:00Z",
      "updated_at": "2026-11-05T14:32:00Z"
    }
  ]
}
```

---

### 4.4 Create a Note

- **Endpoint**: `POST /api/v1/external/notes`
- **Required Scope**: `notes:write` (or `*`)
- **Headers**: `Content-Type: application/json`

#### Request Body Schema
```json
{
  "title": "String (optional, defaults to 'Untitled Note')",
  "content": "String (markdown or plain text content)",
  "parent_id": "UUID string (optional, parent folder ID)"
}
```

#### Example Request
```bash
curl -X POST "https://go-tide.app/api/v1/external/notes" \
  -H "Authorization: Bearer tide_pat_YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Weekly Standup Notes",
    "content": "## Agenda\n- Discuss cloud API token rollout\n- Review Smart Island improvements",
    "parent_id": "4a7f05b8-d227-440f-90db-2b6214a1c5d9"
  }'
```

#### Example Response (`201 Created`)
```json
{
  "id": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
  "title": "Weekly Standup Notes",
  "content": "## Agenda\n- Discuss cloud API token rollout\n- Review Smart Island improvements",
  "parent_id": "4a7f05b8-d227-440f-90db-2b6214a1c5d9",
  "created_at": "2026-11-11T15:30:00Z",
  "updated_at": "2026-11-11T15:30:00Z",
  "note": {
    "id": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
    "title": "Weekly Standup Notes",
    "content": "## Agenda\n- Discuss cloud API token rollout\n- Review Smart Island improvements",
    "parent_id": "4a7f05b8-d227-440f-90db-2b6214a1c5d9",
    "created_at": "2026-11-11T15:30:00Z",
    "updated_at": "2026-11-11T15:30:00Z"
  }
}
```

---

### 4.5 Get a Single Note

- **Endpoint**: `GET /api/v1/external/notes/{id}`
- **Required Scope**: `notes:read` or `notes:write` (or `*`)

#### Example Request
```bash
curl -X GET "https://go-tide.app/api/v1/external/notes/9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d" \
  -H "Authorization: Bearer tide_pat_YOUR_TOKEN"
```

#### Example Response (`200 OK`)
```json
{
  "id": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
  "title": "Weekly Standup Notes",
  "content": "## Agenda\n- Discuss cloud API token rollout\n- Review Smart Island improvements",
  "parent_id": "4a7f05b8-d227-440f-90db-2b6214a1c5d9",
  "created_at": "2026-11-11T15:30:00Z",
  "updated_at": "2026-11-11T15:30:00Z",
  "note": {
    "id": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
    "title": "Weekly Standup Notes",
    "content": "## Agenda\n- Discuss cloud API token rollout\n- Review Smart Island improvements",
    "parent_id": "4a7f05b8-d227-440f-90db-2b6214a1c5d9",
    "created_at": "2026-11-11T15:30:00Z",
    "updated_at": "2026-11-11T15:30:00Z"
  }
}
```

---

### 4.6 Update a Note

- **Endpoint**: `PUT /api/v1/external/notes/{id}` or `PATCH /api/v1/external/notes/{id}`
- **Required Scope**: `notes:write` (or `*`)
- **Headers**: `Content-Type: application/json`

Partial updates are supported. Only supplied fields are updated; omitted fields remain unchanged.

#### Request Body Schema
```json
{
  "title": "String (optional)",
  "content": "String (optional)",
  "parent_id": "UUID string | null (optional, pass null to move to root)"
}
```

#### Example Request
```bash
curl -X PUT "https://go-tide.app/api/v1/external/notes/9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d" \
  -H "Authorization: Bearer tide_pat_YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Weekly Standup Notes — Action Items",
    "content": "## Agenda\n- Discuss cloud API token rollout\n\n### Action Items\n- [x] Merge PR #42\n- [ ] Release docs"
  }'
```

#### Example Response (`200 OK`)
```json
{
  "id": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
  "title": "Weekly Standup Notes — Action Items",
  "content": "## Agenda\n- Discuss cloud API token rollout\n\n### Action Items\n- [x] Merge PR #42\n- [ ] Release docs",
  "parent_id": "4a7f05b8-d227-440f-90db-2b6214a1c5d9",
  "created_at": "2026-11-11T15:30:00Z",
  "updated_at": "2026-11-11T16:00:00Z"
}
```

---

### 4.7 Delete a Note

- **Endpoint**: `DELETE /api/v1/external/notes/{id}`
- **Required Scope**: `notes:write` (or `*`)

#### Example Request
```bash
curl -X DELETE "https://go-tide.app/api/v1/external/notes/9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d" \
  -H "Authorization: Bearer tide_pat_YOUR_TOKEN"
```

#### Example Response (`200 OK`)
```json
{
  "success": true,
  "message": "Note deleted successfully"
}
```

---

## 5. Todos API

The Todos API allows management of tasks, priorities, tags, due dates, and completion status.

### 5.1 Todo Data Model

| Field | Type | Description |
|---|---|---|
| `id` | `string` (UUID) | Unique task identifier |
| `user_id` | `string` (UUID) | Owner user UUID |
| `title` | `string` | Task title (*required*) |
| `description` | `string` | Markdown or plain text description |
| `status` | `string` | `"todo"`, `"in_progress"`, or `"completed"` |
| `priority` | `string` | `"low"`, `"medium"`, or `"high"` |
| `due_date` | `string \| null` | Target date in `YYYY-MM-DD` or RFC 3339 format |
| `scheduled_date` | `string \| null` | Planned work date in `YYYY-MM-DD` format |
| `tags` | `string[]` | Array of labels e.g. `["backend", "deploy"]` |
| `color` | `string` | Hex color code (e.g. `#ef4444`) or token |
| `is_completed` | `boolean` | `true` if completed, `false` otherwise |
| `completed_at` | `string \| null` | RFC 3339 timestamp when completed |
| `is_overdue` | `boolean` | Computed dynamically: `true` if uncompleted and `due_date < today` |
| `created_at` | `string` (RFC 3339) | Creation timestamp |
| `updated_at` | `string` (RFC 3339) | Last update timestamp |

---

### 5.2 List & Filter Todos

- **Endpoint**: `GET /api/v1/todos` (or alias `GET /api/v1/external/todos`)
- **Required Scope**: `todos:read` or `todos:write` (or `*`)

#### Query Parameters

| Parameter | Type | Example | Description |
|---|---|---|---|
| `date` | `string` | `2026-11-15` | Filters where `due_date` or `scheduled_date` matches this date |
| `prio` or `priority` | `string` | `high` | Filter by priority (`low`, `medium`, `high`) |
| `tag` | `string` | `work` | Filter by exact tag name within the `tags` array |
| `q`, `search`, `description` | `string` | `deploy` | Substring search across `title` and `description` |
| `overdue` | `boolean` | `true` | Filter for incomplete items with `due_date < today` |
| `status` | `string` | `todo` | Filter by status (`todo`, `in_progress`, `completed`) |
| `completed` | `boolean` | `false` | Filter by completion boolean (`true` or `false`) |
| `limit` | `integer` | `50` | Maximum items to return (default: `100`, max: `500`) |
| `offset` | `integer` | `0` | Pagination offset |

#### Example Request: List Incomplete High-Priority Todos
```bash
curl -X GET "https://go-tide.app/api/v1/todos?prio=high&completed=false" \
  -H "Authorization: Bearer tide_pat_YOUR_TOKEN"
```

#### Example Response (`200 OK`)
```json
[
  {
    "id": "e304b8d7-740e-4364-bbcf-c3f2bb01c77f",
    "user_id": "893d59a2-5b94-4dc4-8399-5ef6ee15c103",
    "title": "Deploy API Gateway updates",
    "description": "Apply token scopes validation to ingress proxy",
    "status": "todo",
    "priority": "high",
    "due_date": "2026-11-20",
    "scheduled_date": "2026-11-19",
    "tags": ["deploy", "cloud"],
    "color": "#ef4444",
    "is_completed": false,
    "completed_at": null,
    "is_overdue": false,
    "created_at": "2026-11-10T10:00:00Z",
    "updated_at": "2026-11-10T10:00:00Z"
  }
]
```

---

### 5.3 Create a Todo

- **Endpoint**: `POST /api/v1/todos`
- **Required Scope**: `todos:create` or `todos:write` (or `*`)
- **Headers**: `Content-Type: application/json`

#### Request Body Schema
```json
{
  "title": "String (required)",
  "description": "String (optional)",
  "priority": "low | medium | high (default: medium)",
  "status": "todo | in_progress | completed (default: todo)",
  "due_date": "YYYY-MM-DD or RFC 3339 (optional)",
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
    "title": "Review Q4 security audit report",
    "description": "Verify PAT hashing and rate limits",
    "priority": "high",
    "due_date": "2026-11-25",
    "scheduled_date": "2026-11-24",
    "tags": ["security", "audit"],
    "color": "#3b82f6"
  }'
```

#### Example Response (`201 Created`)
```json
{
  "id": "7df4ba62-a567-4e78-9584-f7b58c743bc1",
  "user_id": "893d59a2-5b94-4dc4-8399-5ef6ee15c103",
  "title": "Review Q4 security audit report",
  "description": "Verify PAT hashing and rate limits",
  "status": "todo",
  "priority": "high",
  "due_date": "2026-11-25",
  "scheduled_date": "2026-11-24",
  "tags": ["security", "audit"],
  "color": "#3b82f6",
  "is_completed": false,
  "completed_at": null,
  "is_overdue": false,
  "created_at": "2026-11-11T12:00:00Z",
  "updated_at": "2026-11-11T12:00:00Z"
}
```

---

### 5.4 Get Single Todo

- **Endpoint**: `GET /api/v1/todos/{id}`
- **Required Scope**: `todos:read` or `todos:write` (or `*`)

#### Example Request
```bash
curl -X GET "https://go-tide.app/api/v1/todos/7df4ba62-a567-4e78-9584-f7b58c743bc1" \
  -H "Authorization: Bearer tide_pat_YOUR_TOKEN"
```

#### Example Response (`200 OK`)
```json
{
  "id": "7df4ba62-a567-4e78-9584-f7b58c743bc1",
  "user_id": "893d59a2-5b94-4dc4-8399-5ef6ee15c103",
  "title": "Review Q4 security audit report",
  "description": "Verify PAT hashing and rate limits",
  "status": "todo",
  "priority": "high",
  "due_date": "2026-11-25",
  "scheduled_date": "2026-11-24",
  "tags": ["security", "audit"],
  "color": "#3b82f6",
  "is_completed": false,
  "completed_at": null,
  "is_overdue": false,
  "created_at": "2026-11-11T12:00:00Z",
  "updated_at": "2026-11-11T12:00:00Z"
}
```

---

### 5.5 Update a Todo

- **Endpoint**: `PUT /api/v1/todos/{id}` or `PATCH /api/v1/todos/{id}`
- **Required Scope**: `todos:edit` or `todos:write` (or `*`)
- **Headers**: `Content-Type: application/json`

Both `PUT` and `PATCH` support partial updates. Setting `is_completed: true` or `status: "completed"` automatically sets `completed_at` to the current timestamp.

#### Example Request: Mark Completed
```bash
curl -X PATCH "https://go-tide.app/api/v1/todos/7df4ba62-a567-4e78-9584-f7b58c743bc1" \
  -H "Authorization: Bearer tide_pat_YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "is_completed": true,
    "status": "completed"
  }'
```

#### Example Response (`200 OK`)
```json
{
  "id": "7df4ba62-a567-4e78-9584-f7b58c743bc1",
  "user_id": "893d59a2-5b94-4dc4-8399-5ef6ee15c103",
  "title": "Review Q4 security audit report",
  "description": "Verify PAT hashing and rate limits",
  "status": "completed",
  "priority": "high",
  "due_date": "2026-11-25",
  "scheduled_date": "2026-11-24",
  "tags": ["security", "audit"],
  "color": "#3b82f6",
  "is_completed": true,
  "completed_at": "2026-11-11T14:15:00Z",
  "is_overdue": false,
  "created_at": "2026-11-11T12:00:00Z",
  "updated_at": "2026-11-11T14:15:00Z"
}
```

---

### 5.6 Delete a Todo

- **Endpoint**: `DELETE /api/v1/todos/{id}`
- **Required Scope**: `todos:delete` or `todos:write` (or `*`)

#### Example Request
```bash
curl -X DELETE "https://go-tide.app/api/v1/todos/7df4ba62-a567-4e78-9584-f7b58c743bc1" \
  -H "Authorization: Bearer tide_pat_YOUR_TOKEN"
```

#### Example Response (`204 No Content`)
Returns HTTP status `204 No Content` with an empty response body.

---

## 6. Calendar Events API

The Calendar Events API provides external access to user calendar events, supporting scheduling dashboards, smart home integrations, and external calendar sync.

### 6.1 Event Data Model

| Field | Type | Description |
|---|---|---|
| `id` | `string` (UUID) | Unique event identifier |
| `title` | `string` | Event summary / title |
| `start` | `string` (ISO 8601) | Event start timestamp (e.g. `2026-11-15T09:00:00.000Z`) |
| `end` | `string` (ISO 8601) | Event end timestamp (e.g. `2026-11-15T10:00:00.000Z`) |
| `all_day` | `boolean` | `true` for all-day events |
| `color` | `string` | Hex color code (e.g. `#3b82f6`) |
| `description` | `string` | Event details or meeting links |
| `location` | `string` | Physical location or virtual link |
| `parent_id` | `string \| null` | Associated parent project or folder ID |
| `source` | `string` | Event source (e.g. `"tide"`) |
| `created_at` | `string` (RFC 3339) | Creation timestamp |
| `updated_at` | `string` (RFC 3339) | Last update timestamp |

---

### 6.2 List Events

- **Endpoint**: `GET /api/v1/external/events`
- **Required Scope**: `events:read` (or `*`)

Returns a list of events sorted chronologically by start time.

#### Query Parameters

| Parameter | Type | Example | Description |
|---|---|---|---|
| `start` or `from` | `string` (ISO 8601) | `2026-11-01` | Filter events ending on or after this date |
| `end` or `to` | `string` (ISO 8601) | `2026-11-30` | Filter events starting on or before this date |
| `q` or `search` | `string` | `standup` | Substring search across `title`, `description`, and `location` |
| `limit` | `integer` | `25` | Maximum number of events (default: `100`, max: `500`) |

#### Example Request: List Month's Events
```bash
curl -X GET "https://go-tide.app/api/v1/external/events?start=2026-11-01&end=2026-11-30&limit=50" \
  -H "Authorization: Bearer tide_pat_YOUR_TOKEN"
```

#### Example Response (`200 OK`)
```json
{
  "count": 1,
  "events": [
    {
      "id": "e4b3c9a0-1234-4567-89ab-cdef01234567",
      "title": "Sprint Planning",
      "start": "2026-11-16T10:00:00.000Z",
      "end": "2026-11-16T11:30:00.000Z",
      "all_day": false,
      "color": "#3b82f6",
      "description": "Review backlog and commit to sprint scope",
      "location": "Conference Room A / Hybrid",
      "parent_id": null,
      "source": "tide",
      "created_at": "2026-11-10T14:00:00Z",
      "updated_at": "2026-11-10T14:00:00Z"
    }
  ]
}
```

---

### 6.3 Get Single Event

- **Endpoint**: `GET /api/v1/external/events/{id}`
- **Required Scope**: `events:read` (or `*`)

#### Example Request
```bash
curl -X GET "https://go-tide.app/api/v1/external/events/e4b3c9a0-1234-4567-89ab-cdef01234567" \
  -H "Authorization: Bearer tide_pat_YOUR_TOKEN"
```

#### Example Response (`200 OK`)
```json
{
  "event": {
    "id": "e4b3c9a0-1234-4567-89ab-cdef01234567",
    "title": "Sprint Planning",
    "start": "2026-11-16T10:00:00.000Z",
    "end": "2026-11-16T11:30:00.000Z",
    "all_day": false,
    "color": "#3b82f6",
    "description": "Review backlog and commit to sprint scope",
    "location": "Conference Room A / Hybrid",
    "parent_id": null,
    "source": "tide",
    "created_at": "2026-11-10T14:00:00Z",
    "updated_at": "2026-11-10T14:00:00Z"
  }
}
```

---

## 7. HTTP Status Codes & Error Handling

Standard HTTP status codes are used throughout the API:

| Status Code | Reason | Description |
|---|---|---|
| `200 OK` | Success | The request succeeded and the requested payload is returned |
| `201 Created` | Created | A new resource was successfully created |
| `204 No Content` | Deleted | The resource was deleted successfully (empty body) |
| `400 Bad Request` | Validation Error | Missing required fields, invalid JSON, or malformed ID |
| `401 Unauthorized` | Authentication Failed | Missing, malformed, or expired API token |
| `403 Forbidden` | Missing Scope | The token lacks the scope required for this endpoint |
| `404 Not Found` | Not Found | The requested resource does not exist or does not belong to the user |
| `500 Internal Error` | Server Error | An unexpected server error occurred |

### Standard Error Body

```json
{
  "error": "Bad Request",
  "message": "Title is required"
}
```
