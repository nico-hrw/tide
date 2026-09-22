# TIDE API Documentation (`cloud/`)

> REST API and Realtime endpoints exposed under `/api/v1/`.

## Authentication
Protected routes require the `X-User-ID` header (containing the user ID) and a valid `Authorization: Bearer <token>` session token.

---

## Endpoints

### 1. Authentication (`/api/v1/auth`)
| Method | Route | Description |
|--------|-------|-------------|
| `POST` | `/auth/register` | Register a new account with blind index & encrypted vault |
| `POST` | `/auth/request-otp` | Request a magic link / OTP code |
| `POST` | `/auth/verify-otp` | Verify OTP code and return session token |
| `GET`  | `/auth/me` | Retrieve authenticated user metadata & public key |
| `PUT`  | `/auth/me` | Update user metadata & public key |

### 2. Files & Nodes (`/api/v1/files`)
| Method | Route | Description |
|--------|-------|-------------|
| `GET`    | `/files` | List all files/folders belonging to the authenticated user |
| `POST`   | `/files` | Create a new file, folder, or calendar event |
| `GET`    | `/files/{id}` | Get metadata and download link for a file |
| `PUT`    | `/files/{id}` | Update file metadata, hierarchy (`parent_id`), or properties |
| `DELETE` | `/files/{id}` | Soft-delete / move file to trash |
| `POST`   | `/files/{id}/blob` | Upload encrypted binary content |
| `GET`    | `/files/{id}/blob` | Download encrypted binary content |
| `POST`   | `/files/{id}/share` | Create a share record for another user with wrapped DEK |
| `GET`    | `/files/{id}/shares` | List active shares for this file |
| `DELETE` | `/files/{id}/shares/{targetUserId}` | Revoke file share |
| `GET`    | `/files/trash` | List trashed files |
| `POST`   | `/files/{id}/restore` | Restore file from trash |
| `DELETE` | `/files/{id}/permanent` | Permanently delete file from DB & blob storage |
| `GET`    | `/files/{id}/backups` | List historical backups for a file |
| `POST`   | `/files/{id}/backups` | Save a backup snapshot |
| `GET`    | `/files/{id}/ws` | WebSocket connection for real-time document collaboration |

### 3. Links & Backlinks (`/api/v1/links`)
| Method | Route | Description |
|--------|-------|-------------|
| `GET`    | `/links` | List all links for the user |
| `POST`   | `/links` | Create a directional backlink between two files |
| `DELETE` | `/links` | Remove a link |

### 4. Direct Messaging (`/api/v1/messages`)
| Method | Route | Description |
|--------|-------|-------------|
| `GET`    | `/messages` | List messages between contacts |
| `POST`   | `/messages` | Send an encrypted message |
| `PUT`    | `/messages/{id}/status` | Update message status (`delivered`, `read`) |

### 5. Contacts & Social (`/api/v1/contacts`)
| Method | Route | Description |
|--------|-------|-------------|
| `GET`    | `/contacts` | List contacts and incoming/outgoing friend requests |
| `POST`   | `/contacts/request` | Send contact request by blind index |
| `POST`   | `/contacts/{id}/accept` | Accept incoming contact request |
| `DELETE` | `/contacts/{id}` | Remove contact or reject request |

### 6. Public Profiles (`/api/v1/profiles`)
| Method | Route | Description |
|--------|-------|-------------|
| `GET` | `/profiles/{userId}` | Fetch public profile and public key |
| `PUT` | `/profiles` | Update own public profile avatar, bio, and title |
| `GET` | `/search` | Search users by username or blind index |

### 7. User Extensions (`/api/v1/user/extensions`)
| Method | Route | Description |
|--------|-------|-------------|
| `GET` | `/user/extensions` | Get list of enabled extensions |
| `PUT` | `/user/extensions` | Enable/disable extensions (Finance, etc.) |

### 8. Tabs & Tasks (`/api/v1/tabs`, `/api/v1/tasks`)
| Method | Route | Description |
|--------|-------|-------------|
| `GET` | `/tabs` | Retrieve saved editor tab session |
| `PUT` | `/tabs` | Save active editor tab session |
| `GET` | `/tasks` | Retrieve encrypted personal tasks |
| `PUT` | `/tasks` | Update encrypted personal tasks |

### 9. Finance Extension (`/api/v1/finance`)
| Method | Route | Description |
|--------|-------|-------------|
| `GET`    | `/finance/accounts` | List financial accounts |
| `POST`   | `/finance/accounts` | Create account |
| `GET`    | `/finance/transactions` | List transactions |
| `POST`   | `/finance/transactions` | Create transaction with balanced ledger entries |

### 10. Realtime Push Events (`/api/v1/events`)
| Method | Route | Description |
|--------|-------|-------------|
| `GET` | `/events` | Server-Sent Events (SSE) stream for instant sync notifications |
