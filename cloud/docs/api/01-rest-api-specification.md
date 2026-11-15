# Tide Cloud — REST API Specification

> **Version:** 0.2.0  
> **Base Path:** `/api/v1`  
> **Server Implementation:** Go Chi Router (`cloud/cmd/server/main.go`, `cloud/internal/api/`)

This document provides the exhaustive specification for all HTTP REST and Realtime endpoints exposed by the Tide Cloud Go backend service.

---

## Table of Contents

1. [Global API Conventions](#1-global-api-conventions)
   - [Base URL & Versioning](#base-url--versioning)
   - [Authentication & Headers](#authentication--headers)
   - [Standard Request & Response Envelopes](#standard-request--response-envelopes)
   - [Error Handling & Error Envelopes](#error-handling--error-envelopes)
   - [Rate Limiting](#rate-limiting)
2. [Module 1: Authentication & User Management](#2-module-1-authentication--user-management)
3. [Module 2: Files, Hierarchy & Blob Storage](#3-module-2-files-hierarchy--blob-storage)
4. [Module 3: Realtime Events & SSE](#4-module-3-realtime-events--sse)
5. [Module 4: Collaboration, Shares & CRDT State](#5-module-4-collaboration-shares--crdt-state)
6. [Module 5: Personal Access Tokens (PAT)](#6-module-5-personal-access-tokens-pat)
7. [Module 6: External Integrations API](#7-module-6-external-integrations-api)
8. [Module 7: Todos & Task Management](#8-module-7-todos--task-management)
9. [Module 8: Direct Messages (E2EE)](#9-module-8-direct-messages-e2ee)
10. [Module 9: Contacts & Social Relations](#10-module-9-contacts--social-relations)
11. [Module 10: Profiles, Presence & User State](#11-module-10-profiles-presence--user-state)
12. [Module 11: Quicknotes & Binary Attachments](#12-module-11-quicknotes--binary-attachments)
13. [Module 12: Surveys & Telemetry](#13-module-12-surveys--telemetry)

---

## 1. Global API Conventions

### Base URL & Versioning

All API routes are grouped under the `/api/v1` prefix, except for legacy aliases or root-level diagnostics:
- **Base URL:** `https://<domain>/api/v1` (Production) or `http://localhost:8080/api/v1` (Local Development)
- **Health check:** `GET /health` (`200 OK`)
- **Version info:** `GET /api/v1/version`

### Authentication & Headers

Requests are authenticated using JSON Web Tokens (JWT) for interactive user sessions, or Personal Access Tokens (PAT) for external integrations and automated agents.

#### Headers
- **`Authorization: Bearer <jwt_or_pat>`**: Standard RFC 6750 bearer authentication.
- **`X-API-Key: <pat_token>`**: Alternative authentication header for Personal Access Tokens.
- **`X-User-ID: <uuid>`**: Context identification (injected or passed where permitted).
- **`Content-Type: application/json`**: Required for all endpoints receiving a JSON request body.
- **`Accept: application/json`**: Standard MIME type requested.

### Standard Request & Response Envelopes

Endpoints return JSON standard UTF-8 text unless streaming or delivering raw binary blobs (`application/octet-stream`).

#### Success Response Envelope (Collections / Entities)
```json
{
  "data": { ... },
  "message": "Operation completed successfully"
}
```
*Note: Many high-performance endpoints return the target object or array directly at top-level for low overhead.*

### Error Handling & Error Envelopes

When a request fails, the API responds with a standard HTTP status code and an error envelope:

```json
{
  "error": "Unauthorized",
  "message": "Token expired or signature invalid",
  "code": 401
}
```

#### Standard Status Codes
- `200 OK`: Request succeeded.
- `201 Created`: Resource created successfully.
- `204 No Content`: Resource deleted or state applied with no payload returned.
- `400 Bad Request`: Validation failure or malformed JSON payload.
- `401 Unauthorized`: Missing or invalid Bearer token / API token.
- `403 Forbidden`: Insufficient scopes, or access denied to specific resource.
- `404 Not Found`: Target entity does not exist.
- `409 Conflict`: Resource state conflict (e.g., duplicate slug, concurrently edited item).
- `429 Too Many Requests`: Rate limiter triggered.
- `500 Internal Server Error`: Server failure.

### Rate Limiting

The API uses token-bucket IP rate limiters:
- **Auth endpoints (`/auth/register`, `/auth/request-otp`):** 0.1 req/s, burst 5.
- **OTP verification (`/auth/verify-otp`):** 0.166 req/s, burst 5.
- **Search endpoints (`/search`):** 20 req/min, burst 20.
- **Quicknote actions (`/quicknotes`):** 5 req/s, burst 30.

---

## 2. Module 1: Authentication & User Management

Handles user onboarding, passwordless email OTP authentication, session token refresh, and user account metadata.

### 2.1 Register User
- **Method:** `POST`
- **URL:** `/api/v1/auth/register`
- **Auth:** None (Rate-limited)
- **Request Body:**
```json
{
  "email": "user@example.com",
  "display_name": "Alice Developer",
  "public_key": "base64_encoded_ed25519_or_curve25519_key"
}
```
- **Response:** `200 OK`
```json
{
  "id": "u_83d21e84-...",
  "email": "user@example.com",
  "display_name": "Alice Developer",
  "created_at": "2026-11-15T12:00:00Z"
}
```

### 2.2 Request Login OTP
- **Method:** `POST`
- **URL:** `/api/v1/auth/request-otp`
- **Auth:** None (Rate-limited)
- **Request Body:**
```json
{
  "email": "user@example.com"
}
```
- **Response:** `200 OK`
```json
{
  "message": "OTP sent to user email",
  "expires_in_seconds": 600
}
```

### 2.3 Verify OTP
- **Method:** `POST`
- **URL:** `/api/v1/auth/verify-otp`
- **Auth:** None (Rate-limited)
- **Request Body:**
```json
{
  "email": "user@example.com",
  "otp": "492018"
}
```
- **Response:** `200 OK`
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "u_83d21e84-...",
    "email": "user@example.com",
    "display_name": "Alice Developer"
  }
}
```

### 2.4 Get Current User (`Me`)
- **Method:** `GET`
- **URL:** `/api/v1/auth/me`
- **Auth:** `Bearer <jwt>`
- **Response:** `200 OK`
```json
{
  "id": "u_83d21e84-...",
  "email": "user@example.com",
  "display_name": "Alice Developer",
  "public_key": "...",
  "storage_used_bytes": 14205830,
  "storage_quota_bytes": 262144000
}
```

### 2.5 Update Current User
- **Method:** `PUT`
- **URL:** `/api/v1/auth/me`
- **Auth:** `Bearer <jwt>`
- **Request Body:**
```json
{
  "display_name": "Alice D.",
  "avatar_url": "https://..."
}
```
- **Response:** `200 OK`

### 2.6 Dev Login (Development Only)
- **Method:** `POST`
- **URL:** `/api/v1/auth/dev-login`
- **Auth:** None (Disabled in production mode)
- **Request Body:**
```json
{
  "email": "dev@tide.local"
}
```
- **Response:** `200 OK` with JWT token.

---

## 3. Module 2: Files, Hierarchy & Blob Storage

Manages encrypted notes, folders, hierarchies, file backups, and blob uploads/downloads.

### 3.1 List Files Tree
- **Method:** `GET`
- **URL:** `/api/v1/files`
- **Auth:** `Bearer <jwt>`
- **Query Parameters:**
  - `parent_id` (optional): Filter by parent directory UUID.
  - `type` (optional): `note`, `folder`, `blob`.
  - `trashed` (optional, boolean): Set to `true` to view trash bin items.
- **Response:** `200 OK`
```json
[
  {
    "id": "f_110e8400-e29b-11d4-a716-446655440000",
    "owner_id": "u_83d21e84-...",
    "parent_id": null,
    "name": "Projects",
    "is_directory": true,
    "size_bytes": 0,
    "created_at": "2026-10-01T08:00:00Z",
    "updated_at": "2026-10-01T08:00:00Z",
    "trashed": false
  },
  {
    "id": "f_9a68-d802352b6f08",
    "owner_id": "u_83d21e84-...",
    "parent_id": "f_110e8400-e29b-11d4-a716-446655440000",
    "name": "Q4 Architecture.md",
    "is_directory": false,
    "size_bytes": 4812,
    "mime_type": "text/markdown",
    "created_at": "2026-10-05T09:12:00Z",
    "updated_at": "2026-11-15T19:30:00Z",
    "trashed": false
  }
]
```

### 3.2 Create File or Folder
- **Method:** `POST`
- **URL:** `/api/v1/files`
- **Auth:** `Bearer <jwt>`
- **Request Body:**
```json
{
  "parent_id": "f_110e8400-e29b-11d4-a716-446655440000",
  "name": "Meeting Notes.md",
  "is_directory": false,
  "encrypted_dek": "base64_wrapped_key_payload",
  "client_created_at": "2026-11-15T19:40:00Z"
}
```
- **Response:** `201 Created`

### 3.3 Get File Metadata
- **Method:** `GET`
- **URL:** `/api/v1/files/{fileID}`
- **Auth:** `Bearer <jwt>`
- **Response:** `200 OK`
```json
{
  "id": "f_9a68-d802352b6f08",
  "name": "Q4 Architecture.md",
  "size_bytes": 4812,
  "owner_id": "u_83d21e84-...",
  "encrypted_dek": "...",
  "updated_at": "2026-11-15T19:30:00Z",
  "is_public": false
}
```

### 3.4 Update File Metadata
- **Method:** `PUT` or `PATCH`
- **URL:** `/api/v1/files/{fileID}`
- **Auth:** `Bearer <jwt>`
- **Request Body:**
```json
{
  "name": "Q4 Architecture Review (Final).md",
  "parent_id": "f_220e8400-..."
}
```
- **Response:** `200 OK`

### 3.5 Delete / Trash File
- **Method:** `DELETE`
- **URL:** `/api/v1/files/{fileID}`
- **Auth:** `Bearer <jwt>`
- **Query Parameters:**
  - `permanent` (boolean, optional): If `true`, purges blob and metadata immediately. Defaults to soft-delete (trashed).
- **Response:** `200 OK` or `204 No Content`

### 3.6 Restore Trashed File
- **Method:** `POST`
- **URL:** `/api/v1/files/{fileID}/restore`
- **Auth:** `Bearer <jwt>`
- **Response:** `200 OK`

### 3.7 Upload Blob Payload
- **Method:** `POST`
- **URL:** `/api/v1/files/{fileID}/upload`
- **Auth:** `Bearer <jwt>`
- **Content-Type:** `application/octet-stream` or `multipart/form-data`
- **Response:** `200 OK`
```json
{
  "file_id": "f_9a68-d802352b6f08",
  "size_bytes": 1048576,
  "blob_hash": "sha256:3a1f9e..."
}
```

### 3.8 Download Blob Payload
- **Method:** `GET`
- **URL:** `/api/v1/files/{fileID}/download`
- **Auth:** `Bearer <jwt>`
- **Response:** Binary Stream (`application/octet-stream`)

### 3.9 File Backups & Slots
- **Method:** `GET` / `PUT`
- **URL:** `/api/v1/files/{fileID}/backups` and `/api/v1/files/{fileID}/backups/{slotName}`
- Manages snapshots (`hourly`, `daily`, `pre-sync`) of note state.

### 3.10 Purge Expired Trash
- **Method:** `POST`
- **URL:** `/api/v1/files/purge`
- **Auth:** `Bearer <jwt>`
- Permanently frees blob storage for items trashed for > 7 days.

---

## 4. Module 3: Realtime Events & SSE

Realtime push notification bus for sync triggers, file tree changes, incoming messages, and collaborator status changes.

### 4.1 Subscribe to Server-Sent Events (SSE)
- **Method:** `GET`
- **URL:** `/api/v1/events`
- **Auth:** `Bearer <jwt>` (passed in `Authorization` header or query param `?token=...` for browser EventSource)
- **Headers:**
  - `Accept: text/event-stream`
  - `Cache-Control: no-cache`
  - `Connection: keep-alive`
- **Response:** Continuous SSE event stream (`200 OK`)

#### SSE Message Formats:
```
event: ping
data: {"timestamp": 1731698000}

event: file_update
data: {"file_id": "f_9a68-...", "action": "update", "updated_by": "u_83d21e84-..."}

event: message
data: {"message_id": "m_112233...", "sender_id": "u_998877...", "created_at": "2026-11-15T19:45:00Z"}

event: contact_request
data: {"request_id": "c_554433...", "from_user": "u_998877..."}
```

---

## 5. Module 4: Collaboration, Shares & CRDT State

Supports end-to-end encrypted collaborative editing, Yjs state vector updates, and compacting CRDT transaction logs.

### 5.1 Share File With User
- **Method:** `POST`
- **URL:** `/api/v1/files/{fileID}/share`
- **Auth:** `Bearer <jwt>`
- **Request Body:**
```json
{
  "target_user_id": "u_102938...",
  "permission": "write",
  "encrypted_dek_for_user": "base64_rsa_or_ecdh_payload"
}
```
- **Response:** `200 OK`

### 5.2 List Shares For File
- **Method:** `GET`
- **URL:** `/api/v1/files/{fileID}/shares`
- **Auth:** `Bearer <jwt>`
- **Response:** `200 OK`
```json
[
  {
    "user_id": "u_102938...",
    "permission": "write",
    "shared_at": "2026-11-10T14:20:00Z"
  }
]
```

### 5.3 Update / Revoke Share Permission
- **Update:** `PATCH /api/v1/files/{fileID}/shares/{userID}` (Body: `{"permission": "read"}`)
- **Revoke:** `DELETE /api/v1/files/{fileID}/shares/{userID}`

### 5.4 Fetch CRDT State Vector & Updates
- **Method:** `GET`
- **URL:** `/api/v1/files/{fileID}/crdt-state`
- **Auth:** `Bearer <jwt>`
- **Response:** `200 OK` (binary Yjs document snapshot or JSON state wrapper)

### 5.5 Compact CRDT Write-Ahead Log
- **Method:** `POST`
- **URL:** `/api/v1/files/{fileID}/compact`
- **Auth:** `Bearer <jwt>`
- **Request Body:**
```json
{
  "snapshot": "base64_compacted_yjs_state"
}
```
- **Response:** `200 OK`

### 5.6 WebSocket Realtime Sync
- **Protocol:** `WSS`
- **URL:** `/api/v1/files/{fileID}/ws` (Alias: `/api/ws/notes/{fileID}`)
- Full duplex binary Yjs synchronization (Step 1 sync, Step 2 update, Awareness states).

---

## 6. Module 5: Personal Access Tokens (PAT)

Manages scoped machine API tokens for headless agents, CLI tools, and background daemons.

### Supported Permission Scopes:
- `*`: Full access (Administrator).
- `events:read`, `events:write`: Calendar event queries and modifications.
- `notes:read`, `notes:write`: Notes access and manipulation.
- `todos:read`, `todos:write`, `todos:create`, `todos:edit`, `todos:delete`: Granular task management.
- `storage:expand`: Quota authorization override (>250MB).

### 6.1 List Active API Tokens
- **Method:** `GET`
- **URL:** `/api/v1/api-tokens`
- **Auth:** `Bearer <jwt>`
- **Response:** `200 OK`
```json
[
  {
    "id": "pat_e39f28...",
    "name": "Raycast Extension",
    "scopes": ["todos:read", "todos:create"],
    "created_at": "2026-10-12T00:00:00Z",
    "last_used_at": "2026-11-15T18:22:10Z",
    "expires_at": null
  }
]
```

### 6.2 Create API Token
- **Method:** `POST`
- **URL:** `/api/v1/api-tokens`
- **Auth:** `Bearer <jwt>`
- **Request Body:**
```json
{
  "name": "CLI Sync Agent",
  "scopes": ["notes:read", "todos:write"],
  "expires_in_days": 90
}
```
- **Response:** `201 Created`
```json
{
  "id": "pat_e39f28...",
  "name": "CLI Sync Agent",
  "scopes": ["notes:read", "todos:write"],
  "token": "tide_pat_89ab32c81726354890abcdef...",
  "expires_at": "2027-02-13T12:00:00Z"
}
```
> [!IMPORTANT]
> The plain-text `token` string is only returned once upon creation. Store it securely.

### 6.3 Revoke API Token
- **Method:** `DELETE`
- **URL:** `/api/v1/api-tokens/{tokenID}`
- **Auth:** `Bearer <jwt>`
- **Response:** `204 No Content`

### 6.4 List Available Scopes
- **Method:** `GET`
- **URL:** `/api/v1/api-tokens/scopes`
- **Auth:** `Bearer <jwt>`
- **Response:** `200 OK` (key-value map of scope identifiers and descriptions).

---

## 7. Module 6: External Integrations API

External programmatic interface optimized for third-party consumers, LLM assistants, and mobile widgets via PAT.

### 7.1 Query External Calendar Events
- **Method:** `GET`
- **URL:** `/api/v1/external/events`
- **Auth:** `Bearer <pat_token>` or `X-API-Key: <pat_token>` (Scope: `events:read`)
- **Query Parameters:**
  - `start` / `from` (ISO 8601 or `YYYY-MM-DD`): Lower boundary.
  - `end` / `to` (ISO 8601 or `YYYY-MM-DD`): Upper boundary.
- **Response:** `200 OK`
```json
[
  {
    "id": "evt_99182",
    "title": "Design Systems Sync",
    "start_time": "2026-11-16T10:00:00Z",
    "end_time": "2026-11-16T11:00:00Z",
    "location": "Virtual / Meet",
    "all_day": false
  }
]
```

### 7.2 Get External Calendar Event by ID
- **Method:** `GET`
- **URL:** `/api/v1/external/events/{id}`
- **Auth:** Scope `events:read`
- **Response:** `200 OK`

### 7.3 List External Notes
- **Method:** `GET`
- **URL:** `/api/v1/external/notes`
- **Auth:** Scope `notes:read`
- **Query Parameters:**
  - `search`: Full text or title search term.
  - `folder_id`: Specific folder constraint.
- **Response:** `200 OK`
```json
[
  {
    "id": "n_44321",
    "title": "Weekly Standup Notes",
    "created_at": "2026-11-15T09:00:00Z",
    "updated_at": "2026-11-15T09:30:00Z"
  }
]
```

### 7.4 Get External Note Content
- **Method:** `GET`
- **URL:** `/api/v1/external/notes/{id}`
- **Auth:** Scope `notes:read`
- **Response:** `200 OK` (Note metadata and decrypted or raw plain markdown).

### 7.5 Create External Note
- **Method:** `POST`
- **URL:** `/api/v1/external/notes`
- **Auth:** Scope `notes:write`
- **Request Body:**
```json
{
  "title": "Automated Deployment Log",
  "content": "# Deploy 4.9.1\n\nAll migrations applied successfully.",
  "folder_id": "f_110e8400..."
}
```
- **Response:** `201 Created`

### 7.6 Update External Note
- **Method:** `PUT` or `PATCH`
- **URL:** `/api/v1/external/notes/{id}`
- **Auth:** Scope `notes:write`
- **Request Body:**
```json
{
  "content": "# Updated Content..."
}
```
- **Response:** `200 OK`

### 7.7 Delete External Note
- **Method:** `DELETE`
- **URL:** `/api/v1/external/notes/{id}`
- **Auth:** Scope `notes:write`
- **Response:** `204 No Content`

---

## 8. Module 7: Todos & Task Management

Exhaustive REST endpoints for personal and project task tracking, available under `/api/v1/todos` and `/api/v1/external/todos`.

### 8.1 List Todos
- **Method:** `GET`
- **URL:** `/api/v1/todos`
- **Auth:** JWT or PAT (Scope: `todos:read` or `todos:write`)
- **Query Parameters:**
  - `status`: `open`, `in_progress`, `completed`, `cancelled`.
  - `priority`: `low`, `medium`, `high`, `urgent`.
  - `due_before`: ISO 8601 timestamp.
  - `due_after`: ISO 8601 timestamp.
  - `tag`: Filter by tag name.
  - `search`: Text query searching title and description.
  - `limit`: Default `50`, max `250`.
  - `offset`: Pagination offset.
- **Response:** `200 OK`
```json
[
  {
    "id": "t_98234",
    "title": "Complete SQLite index tuning",
    "description": "Add index on (owner_id, trashed, parent_id)",
    "status": "in_progress",
    "priority": "high",
    "due_date": "2026-11-20T18:00:00Z",
    "tags": ["backend", "database"],
    "created_at": "2026-11-14T10:00:00Z",
    "updated_at": "2026-11-15T14:00:00Z"
  }
]
```

### 8.2 Create Todo
- **Method:** `POST`
- **URL:** `/api/v1/todos`
- **Auth:** JWT or PAT (Scope: `todos:create` or `todos:write`)
- **Request Body:**
```json
{
  "title": "Prepare release notes for v0.2.0",
  "description": "Document all REST endpoints and SSE brokers.",
  "priority": "medium",
  "due_date": "2026-11-18T12:00:00Z",
  "tags": ["documentation", "release"]
}
```
- **Response:** `201 Created`

### 8.3 Get Todo
- **Method:** `GET`
- **URL:** `/api/v1/todos/{id}`
- **Auth:** Scope `todos:read` or `todos:write`
- **Response:** `200 OK`

### 8.4 Update Todo
- **Method:** `PUT` or `PATCH`
- **URL:** `/api/v1/todos/{id}`
- **Auth:** JWT or PAT (Scope: `todos:edit` or `todos:write`)
- **Request Body:**
```json
{
  "status": "completed",
  "priority": "high"
}
```
- **Response:** `200 OK`

### 8.5 Delete Todo
- **Method:** `DELETE`
- **URL:** `/api/v1/todos/{id}`
- **Auth:** JWT or PAT (Scope: `todos:delete` or `todos:write`)
- **Response:** `204 No Content`

---

## 9. Module 8: Direct Messages (E2EE)

End-to-end encrypted messaging channels between connected contacts. The server stores only ciphertext payloads.

### 9.1 Send Direct Message
- **Method:** `POST`
- **URL:** `/api/v1/messages`
- **Auth:** `Bearer <jwt>`
- **Request Body:**
```json
{
  "recipient_id": "u_998877...",
  "ciphertext": "base64_encrypted_payload",
  "nonce": "base64_24byte_nonce",
  "algorithm": "xchacha20poly1305"
}
```
- **Response:** `201 Created`
```json
{
  "id": "m_112233...",
  "sender_id": "u_83d21e84-...",
  "recipient_id": "u_998877...",
  "created_at": "2026-11-15T19:55:00Z",
  "status": "sent"
}
```

### 9.2 Fetch Messages
- **Method:** `GET`
- **URL:** `/api/v1/messages`
- **Auth:** `Bearer <jwt>`
- **Query Parameters:**
  - `partner_id`: User ID of conversation partner.
  - `since`: ISO timestamp to retrieve only new messages.
  - `limit`: Number of messages (default 50).
- **Response:** `200 OK` array of message objects.

### 9.3 List Conversations
- **Method:** `GET`
- **URL:** `/api/v1/messages/conversations`
- **Auth:** `Bearer <jwt>`
- **Response:** `200 OK`
```json
[
  {
    "partner": {
      "id": "u_998877...",
      "display_name": "Bob Architect",
      "avatar_url": "..."
    },
    "last_message": {
      "id": "m_112233...",
      "created_at": "2026-11-15T19:55:00Z",
      "is_read": false
    },
    "unread_count": 3
  }
]
```

### 9.4 Update Message Status
- **Method:** `PATCH`
- **URL:** `/api/v1/messages/{messageID}`
- **Auth:** `Bearer <jwt>`
- **Request Body:**
```json
{
  "status": "read"
}
```
- **Response:** `200 OK`

### 9.5 Delete Entire Conversation
- **Method:** `DELETE`
- **URL:** `/api/v1/messages/conversation?partner_id=u_998877...`
- **Auth:** `Bearer <jwt>`
- **Response:** `204 No Content`

---

## 10. Module 9: Contacts & Social Relations

Handles relationship requests, approvals, denials, blind hashed searches, and user connections.

### 10.1 Send Contact Request
- **Method:** `POST`
- **URL:** `/api/v1/contacts/request` (or `/api/v1/contacts/{contactID}`)
- **Auth:** `Bearer <jwt>`
- **Request Body:**
```json
{
  "target_id": "u_998877..."
}
```
- **Response:** `200 OK`

### 10.2 List Contact Requests
- **Method:** `GET`
- **URL:** `/api/v1/contacts/requests`
- **Auth:** `Bearer <jwt>`
- **Response:** `200 OK` (arrays of `incoming` and `outgoing` requests).

### 10.3 Accept Contact Request
- **Method:** `POST`
- **URL:** `/api/v1/contacts/accept/{contactID}`
- **Auth:** `Bearer <jwt>`
- **Response:** `200 OK`

### 10.4 Decline Contact Request
- **Method:** `POST`
- **URL:** `/api/v1/contacts/decline/{contactID}`
- **Auth:** `Bearer <jwt>`
- **Response:** `200 OK`

### 10.5 Delete / Remove Contact
- **Method:** `DELETE`
- **URL:** `/api/v1/contacts/{contactRowID}`
- **Auth:** `Bearer <jwt>`
- **Response:** `204 No Content`

### 10.6 Blind Search User
- **Method:** `POST`
- **URL:** `/api/v1/contacts/search`
- **Auth:** `Bearer <jwt>`
- **Request Body:**
```json
{
  "email": "friend@tide.local"
}
```
- **Response:** `200 OK` (User public record if exact blind hash match).

### 10.7 List All Accepted Contacts
- **Method:** `GET`
- **URL:** `/api/v1/contacts`
- **Auth:** `Bearer <jwt>`
- **Response:** `200 OK` list of connected profiles.

---

## 11. Module 10: Profiles, Presence & User State

### 11.1 Search Profiles
- **Method:** `GET`
- **URL:** `/api/v1/search?q={searchTerm}`
- **Auth:** `Bearer <jwt>` (Rate-limited to 20 req/min)
- **Response:** `200 OK`

### 11.2 Update User Presence Status
- **Method:** `PUT`
- **URL:** `/api/v1/user/status`
- **Auth:** `Bearer <jwt>`
- **Request Body:**
```json
{
  "status": "online",
  "custom_message": "Working on REST specs"
}
```
- **Response:** `200 OK`

### 11.3 Presence Heartbeat
- **Method:** `POST`
- **URL:** `/api/v1/user/heartbeat`
- **Auth:** `Bearer <jwt>`
- **Response:** `200 OK`

---

## 12. Module 11: Quicknotes & Binary Attachments

Quicknotes provide lightweight, slug-based collaborative scratchpads with nesting, CRDT support, and file attachments.

### 12.1 Get Quicknote by Slug
- **Method:** `GET`
- **URL:** `/api/v1/quicknotes/{slug}`
- **Auth:** Public / Anonymous with optional access key.
- **Response:** `200 OK`
```json
{
  "slug": "release-plan",
  "parent_slug": null,
  "title": "Release Plan 2026",
  "content": "# Roadmap\n- Complete documentation\n- Verify tests",
  "created_at": "2026-11-10T12:00:00Z",
  "updated_at": "2026-11-15T19:30:00Z"
}
```

### 12.2 Save / Update Quicknote
- **Method:** `PUT`
- **URL:** `/api/v1/quicknotes/{slug}`
- **Request Body:**
```json
{
  "title": "Release Plan 2026",
  "content": "# Updated Roadmap...",
  "parent_slug": null
}
```
- **Response:** `200 OK`

### 12.3 Get Quicknote Hierarchy Tree
- **Method:** `GET`
- **URL:** `/api/v1/quicknotes/{slug}/tree`
- **Response:** `200 OK` (Tree of nested quicknotes rooted at `{slug}`).

### 12.4 Get Quicknote CRDT State
- **Method:** `GET`
- **URL:** `/api/v1/quicknotes/{slug}/crdt-state`
- **Response:** `200 OK` (Base64 Yjs updates).

### 12.5 Compact Quicknote CRDT Log
- **Method:** `POST`
- **URL:** `/api/v1/quicknotes/{slug}/compact`
- **Request Body:**
```json
{
  "snapshot": "base64_snapshot"
}
```
- **Response:** `200 OK`

### 12.6 Quicknote Binary Files
- **List Files:** `GET /api/v1/quicknotes/{slug}/files`
- **Upload File:** `POST /api/v1/quicknotes/{slug}/files` (multipart or raw binary)
- **Download File:** `GET /api/v1/quicknotes/{slug}/files/{fileID}`
- **Delete File:** `DELETE /api/v1/quicknotes/{slug}/files/{fileID}`

### 12.7 Quicknote WebSocket Collaboration
- **Protocol:** `WSS`
- **URL:** `/api/v1/quicknotes/{slug}/ws` or `/api/ws/quicknotes/{slug}`
- Supports Yjs binary protocol and live editing without authentication requirements.

---

## 13. Module 12: Surveys & Telemetry

User feedback collection and platform performance metrics.

### 13.1 Submit Survey Response
- **Method:** `POST`
- **URL:** `/api/v1/surveys`
- **Auth:** Optional / JWT session
- **Request Body:**
```json
{
  "survey_id": "onboarding_satisfaction_v1",
  "score": 5,
  "feedback": "The desktop and mobile sync works seamlessly.",
  "metadata": {
    "app_version": "0.2.0",
    "platform": "windows"
  }
}
```
- **Response:** `201 Created`
```json
{
  "status": "recorded",
  "id": "srv_88712"
}
```

### 13.2 List Survey Submissions (Admin)
- **Method:** `GET`
- **URL:** `/api/v1/surveys`
- **Auth:** `Bearer <jwt>` (Admin only)
- **Response:** `200 OK` array of responses.
