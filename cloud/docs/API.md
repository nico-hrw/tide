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
| `GET`    | `/files` | List all files/folders belonging to or shared with the authenticated user |
| `POST`   | `/files` | Create a new file, folder, note, or calendar event |
| `GET`    | `/files/{fileID}` | Get metadata for a file |
| `PUT`    | `/files/{fileID}` | Update file metadata, hierarchy (`parent_id`), visibility, or properties |
| `DELETE` | `/files/{fileID}` | Soft-delete / move file to trash |
| `POST`   | `/files/{fileID}/upload` | Upload encrypted binary content / note blob |
| `GET`    | `/files/{fileID}/download` | Download encrypted binary content / note blob |
| `POST`   | `/files/{fileID}/copy` | Duplicate a file or note into user's own directory |
| `POST`   | `/files/{fileID}/share` | Create a share record for another user with wrapped DEK |
| `POST`   | `/files/{fileID}/accept` | Accept a pending share invitation |
| `GET`    | `/files/{fileID}/shares` | List active shares and collaborator permissions for this file |
| `PATCH`  | `/files/{fileID}/shares/{userID}` | Update collaborator permissions (`view`, `edit`) |
| `DELETE` | `/files/{fileID}/shares/{userID}` | Revoke file share |
| `POST`   | `/files/{fileID}/restore` | Restore file from trash |
| `GET`    | `/files/{fileID}/backups` | List backup slots for a file (lightweight, blob omitted) |
| `GET`    | `/files/{fileID}/backups/{slotName}` | Get specific backup slot with encrypted blob and access keys |
| `PUT`    | `/files/{fileID}/backups/{slotName}` | Save or update a backup slot (base copy or line patch delta) |
| `PUT`    | `/files/visibility` | Bulk update file visibility (`private`, `public`) |
| `POST`   | `/files/purge` | Permanently purge trashed files |
| `GET`    | `/files/public/{userID}` | List public files published by a user |
| `GET`    | `/files/public/{userID}/download/{fileID}` | Download a public file without authentication |
| `GET`    | `/files/{fileID}/ws` | WebSocket room for real-time document and awareness collaboration |

### 3. Links & Backlinks (`/api/v1/links`)
| Method | Route | Description |
|--------|-------|-------------|
| `GET`    | `/links?source_id={id}` | List outlinks originating from a file |
| `GET`    | `/links?target_id={id}` | List backlinks referencing a target file |
| `POST`   | `/links` | Create a directional backlink between two files |
| `DELETE` | `/links` | Remove a link between two files |

### 4. Direct Messaging (`/api/v1/messages`)
| Method | Route | Description |
|--------|-------|-------------|
| `GET`    | `/messages?partner_id={id}` | List encrypted messages exchanged with a contact |
| `POST`   | `/messages` | Send an encrypted message |
| `GET`    | `/messages/conversations` | List conversation summaries and unread counts |
| `PATCH`  | `/messages/{messageID}` | Update message status (`delivered`, `read`) |
| `DELETE` | `/messages/conversation` | Delete message history with a partner |

### 5. Contacts & Social (`/api/v1/contacts`)
| Method | Route | Description |
|--------|-------|-------------|
| `GET`    | `/contacts` | List accepted contacts |
| `POST`   | `/contacts/request` | Send contact request by target user ID |
| `POST`   | `/contacts/{contactID}` | Direct alias to send request to a contact ID |
| `GET`    | `/contacts/requests` | List incoming and outgoing pending contact requests |
| `POST`   | `/contacts/accept/{contactID}` | Accept incoming contact request |
| `POST`   | `/contacts/decline/{contactID}` | Decline incoming contact request |
| `DELETE` | `/contacts/{contactRowID}` | Remove an existing contact |
| `POST`   | `/contacts/search` | Exact search for user by email hash blind index |

### 6. Public Profiles (`/api/v1/profiles`)
| Method | Route | Description |
|--------|-------|-------------|
| `GET` | `/profiles/{userID}` | Fetch public profile and public key |
| `PUT` | `/profiles` | Update own public profile (avatar_seed, style, bio, title, status) |
| `GET` | `/profiles/search` (or `/search`) | Search public profiles by username |
| `GET` | `/profiles/suggestions` | Suggested users for discovery |

### 7. User Extensions (`/api/v1/user/extensions`)
| Method | Route | Description |
|--------|-------|-------------|
| `GET` | `/user/extensions` | Get list of enabled extensions (e.g. `["finance"]`) |
| `PUT` | `/user/extensions` | Enable/disable user extensions |

### 8. Tabs & Tasks (`/api/v1/tabs`, `/api/v1/tasks`)
| Method | Route | Description |
|--------|-------|-------------|
| `POST`   | `/tabs/validate` | Validate client open tab IDs against accessible database files |
| `GET`    | `/tasks` | List all encrypted personal tasks |
| `POST`   | `/tasks` | Create an encrypted personal task |
| `GET`    | `/tasks/{taskID}` | Retrieve specific task |
| `PUT`    | `/tasks/{taskID}` | Update an encrypted task |
| `DELETE` | `/tasks/{taskID}` | Delete a task |

### 9. Finance Extension (`/api/v1/finance`)
| Method | Route | Description |
|--------|-------|-------------|
| `GET`    | `/finance/accounts` | List financial accounts |
| `POST`   | `/finance/accounts` | Create an account |
| `DELETE` | `/finance/accounts/{id}` | Delete an account |
| `GET`    | `/finance/transactions` | List transactions with ledger entries |
| `POST`   | `/finance/transactions` | Create transaction with balanced ledger entries |

### 10. Realtime Push Events (`/api/v1/events`)
| Method | Route | Description |
|--------|-------|-------------|
| `GET` | `/events` | Server-Sent Events (SSE) stream for instant sync notifications |
