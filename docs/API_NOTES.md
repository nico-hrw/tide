# Tide Notes REST API — Third-Party Developer Documentation

The Tide Notes REST API enables external applications, automated workflows, third-party integrations (such as Obsidian sync, Raycast extensions, Apple Shortcuts, Python/Node.js bots, LLM agents, and backup scripts) to query, create, read, update, and manage notes directly.

---

## 1. Authentication & Base URLs

### Base URLs
- Primary Endpoint: `https://go-tide.app/api/v1/external/notes`
- Local Development: `http://localhost:8080/api/v1/external/notes`

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
   https://go-tide.app/api/v1/external/notes?api_token=tide_pat_a1b2c3d4...
   ```

---

## 2. Token Scopes & Permissions

Tide enforces granular permission scopes. When creating or configuring an API token, select the appropriate scopes for your integration:

| Scope | Name | Description | Allowed Actions |
|---|---|---|---|
| `notes:read` | Read Notes | Read-only access to view and search notes | `GET /api/v1/external/notes`, `GET /api/v1/external/notes/{id}` |
| `notes:write` | Full Note Management | Create, edit, and delete notes | `POST /api/v1/external/notes`, `PUT /api/v1/external/notes/{id}`, `DELETE /api/v1/external/notes/{id}` |
| `*` | Full Account Access | Grants all permissions across Tide | All methods across all endpoints |

> **Note:** If a token lacks the required scope, the API responds with `403 Forbidden`:
> ```json
> {
>   "error": "Forbidden",
>   "message": "Token lacks required scope",
>   "required_scopes": ["notes:read", "notes:write"],
>   "token_scopes": ["events:read"]
> }
> ```

---

## 3. Web UI Shortcut: "API-Adresse kopieren"

For quick integrations and webhook/shortcut setup, Tide provides a direct shortcut in the web interface:
1. Open or hover over any note in the note list or folder tree.
2. Click the **3-dot menu** (`...`) next to the note title.
3. Select **"API-Adresse kopieren"**.
4. The full direct API URL for that specific note (`https://go-tide.app/api/v1/external/notes/{id}`) is copied directly to your clipboard.

---

## 4. Data Model

An External Note entity consists of the following attributes:

| Field | Type | Description |
|---|---|---|
| `id` | `string` | Unique UUID identifier of the note |
| `title` | `string` | Note title |
| `content` | `string` | Full Markdown or plain text note content |
| `parent_id` | `string \| null` | UUID of the parent folder containing the note (or `null` if root) |
| `created_at` | `string` | RFC 3339 creation timestamp (UTC) |
| `updated_at` | `string` | RFC 3339 last modification timestamp (UTC) |

---

## 5. Endpoints & Operations

### 5.1 List & Search Notes

- **Method**: `GET /api/v1/external/notes`
- **Required Scope**: `notes:read` or `notes:write`
- **Response**: `200 OK` with JSON object containing total count and array of notes

#### Query Parameters

| Parameter | Type | Example | Description |
|---|---|---|---|
| `search` or `q` | `string` | `meeting` | Case-insensitive search across note titles |
| `limit` | `integer` | `50` | Maximum number of notes to return (default: `100`, max: `500`) |

#### Example Request: List Notes with Search Query
```bash
curl -X GET "https://go-tide.app/api/v1/external/notes?q=architecture&limit=25" \
  -H "Authorization: Bearer tide_pat_YOUR_TOKEN"
```

#### Example Response: `200 OK`
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

### 5.2 Create a Note

- **Method**: `POST /api/v1/external/notes`
- **Required Scope**: `notes:write`
- **Response**: `201 Created` with created note object

#### Request Body Schema
```json
{
  "title": "String (optional, defaults to 'Untitled Note')",
  "content": "String (markdown or plain text content)",
  "parent_id": "UUID string (optional, folder ID to place the note in)"
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

#### Example Response: `201 Created`
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

### 5.3 Get a Single Note

- **Method**: `GET /api/v1/external/notes/{id}`
- **Required Scope**: `notes:read` or `notes:write`
- **Response**: `200 OK` with note details, or `404 Not Found`

#### Example Request
```bash
curl -X GET "https://go-tide.app/api/v1/external/notes/9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d" \
  -H "Authorization: Bearer tide_pat_YOUR_TOKEN"
```

#### Example Response: `200 OK`
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

### 5.4 Update Note Title & Content

- **Method**: `PUT /api/v1/external/notes/{id}` or `PATCH /api/v1/external/notes/{id}`
- **Required Scope**: `notes:write`
- **Response**: `200 OK` with updated note object

Both `PUT` and `PATCH` support partial updates. Only the provided fields (`title`, `content`, `parent_id`) will be changed; omitted fields remain untouched.

#### Request Body Schema
```json
{
  "title": "String (optional)",
  "content": "String (optional)",
  "parent_id": "UUID string | null (optional, pass null or \"\" to move to root)"
}
```

#### Example Request
```bash
curl -X PUT "https://go-tide.app/api/v1/external/notes/9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d" \
  -H "Authorization: Bearer tide_pat_YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Weekly Standup Notes — Action Items Added",
    "content": "## Agenda\n- Discuss cloud API token rollout\n- Review Smart Island improvements\n\n### Action Items\n- [x] Merge PR #42\n- [ ] Update documentation"
  }'
```

#### Example Response: `200 OK`
```json
{
  "id": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
  "title": "Weekly Standup Notes — Action Items Added",
  "content": "## Agenda\n- Discuss cloud API token rollout\n- Review Smart Island improvements\n\n### Action Items\n- [x] Merge PR #42\n- [ ] Update documentation",
  "parent_id": "4a7f05b8-d227-440f-90db-2b6214a1c5d9",
  "created_at": "2026-11-11T15:30:00Z",
  "updated_at": "2026-11-11T16:00:00Z",
  "note": {
    "id": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
    "title": "Weekly Standup Notes — Action Items Added",
    "content": "## Agenda\n- Discuss cloud API token rollout\n- Review Smart Island improvements\n\n### Action Items\n- [x] Merge PR #42\n- [ ] Update documentation",
    "parent_id": "4a7f05b8-d227-440f-90db-2b6214a1c5d9",
    "created_at": "2026-11-11T15:30:00Z",
    "updated_at": "2026-11-11T16:00:00Z"
  }
}
```

---

### 5.5 Delete a Note

- **Method**: `DELETE /api/v1/external/notes/{id}`
- **Required Scope**: `notes:write`
- **Response**: `200 OK` on success, or `404 Not Found`

#### Example Request
```bash
curl -X DELETE "https://go-tide.app/api/v1/external/notes/9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d" \
  -H "Authorization: Bearer tide_pat_YOUR_TOKEN"
```

#### Example Response: `200 OK`
```json
{
  "success": true,
  "message": "Note deleted successfully"
}
```

---

## 6. Ready-to-Use Examples

### Quick Note Ingestion via Shell Script
```bash
#!/usr/bin/env bash
TOKEN="tide_pat_YOUR_TOKEN"
TITLE="Quick Thought $(date +'%Y-%m-%d %H:%M')"
BODY="Meeting takeaways captured from terminal."

curl -s -X POST "https://go-tide.app/api/v1/external/notes" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "$(jq -n --arg t "$TITLE" --arg c "$BODY" '{title: $t, content: $c}')"
```

### Search Notes by Keyword
```bash
curl -G "https://go-tide.app/api/v1/external/notes" \
  -H "Authorization: Bearer tide_pat_YOUR_TOKEN" \
  --data-urlencode "q=roadmap"
```

### Using X-API-Key Header
```bash
curl -X GET "https://go-tide.app/api/v1/external/notes" \
  -H "X-API-Key: tide_pat_YOUR_TOKEN"
```

---

## 7. HTTP Status Code Reference

| Status Code | Meaning | Description |
|---|---|---|
| `200 OK` | Success | Request succeeded and returned requested data |
| `201 Created` | Resource Created | New note successfully created |
| `400 Bad Request` | Validation Error | Missing note ID, invalid JSON payload, or invalid parent folder |
| `401 Unauthorized` | Invalid Authentication | Missing, malformed, or expired API token |
| `403 Forbidden` | Missing Scope or Permission | Token lacks `notes:read` or `notes:write`, or write permission denied on parent |
| `404 Not Found` | Not Found | Note ID does not exist or does not belong to the user |
| `500 Internal Error`| Server Error | Unexpected server error processing the note |
