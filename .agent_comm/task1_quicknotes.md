# Scout Investigation Report: Quicknotes Upload 413 Error & Token Handling

**Date:** 2026-11-02  
**Target:** Quicknotes upload file size limit (HTTP 413) & Token handling  
**Status:** Investigation Complete

---

## 1. Quicknotes Upload Implementation Map

### Frontend (`web/`)
- **[web/src/app/notes/[slug]/page.tsx](file:///C:/Users/nicoh/projects/tide/web/src/app/notes/[slug]/page.tsx)**:
  - Lines 348–375: `handleUpload` callback for dropped or selected files.
  - Lines 511–570: Attachment sidebar displaying file list, total storage usage `MB / 250 MB`, and the `<Key />` button.
  - Lines 710–761: `showTokenModal` dialog with plaintext input for `tide_pat_...` tokens.
- **[web/src/lib/quicknotesApi.ts](file:///C:/Users/nicoh/projects/tide/web/src/lib/quicknotesApi.ts)**:
  - Lines 197–231: `uploadQuicknoteFile(slug: string, file: File, token?: string)`: executes `POST /api/v1/quicknotes/:slug/files` via `apiFetch`.
  - Lines 174–184: `fetchQuicknoteFiles(slug: string)`: `GET /api/v1/quicknotes/:slug/files`.
  - Lines 233–235: `getQuicknoteFileDownloadUrl(slug: string, fileId: string)`.
  - Lines 237–246: `deleteQuicknoteFile(slug: string, fileId: string)`.
- **[web/src/components/Editor/useTipTapConfig.ts](file:///C:/Users/nicoh/projects/tide/web/src/components/Editor/useTipTapConfig.ts)**:
  - Lines 452 & 501: Image drop and paste handlers calling `uploadQuicknoteFile(slug, file)` (without token).
- **[web/next.config.ts](file:///C:/Users/nicoh/projects/tide/web/next.config.ts)**:
  - Lines 89–105: Next.js rewrites proxying `/api/:path*` to `http://localhost:8080/api/:path*`.

### Backend (`cloud/`)
- **[cloud/cmd/server/main.go](file:///C:/Users/nicoh/projects/tide/cloud/cmd/server/main.go)**:
  - Lines 226–229: Mounts `/api/v1/quicknotes` sub-router with rate limiting.
- **[cloud/internal/api/quicknotes.go](file:///C:/Users/nicoh/projects/tide/cloud/internal/api/quicknotes.go)**:
  - Lines 58–60: Route registration (`/{slug}/files`).
  - Lines 322–416: `UploadQuicknoteFile(w, r)`:
    - `r.ParseMultipartForm(32 << 20)`: 32MB RAM buffer, overflows to temp disk files.
    - Quota check: `const maxStorage = 250 * 1024 * 1024 // 250MB`.
    - Check: `if currentStorage + header.Size > maxStorage { ... }`.
    - Returns HTTP 403 with `storage_limit_exceeded` if quota exceeded.
    - Stores file via `h.blobStore.Put(...)` and metadata via `h.store.CreateQuicknoteFile(...)`.
- **[cloud/internal/store/sqlite.go](file:///C:/Users/nicoh/projects/tide/cloud/internal/store/sqlite.go)**:
  - Methods `GetQuicknoteTotalStorage`, `CreateQuicknoteFile`, `GetQuicknoteFiles`, `DeleteQuicknoteFile`.

---

## 2. Root Cause for HTTP 413 (Payload Too Large) on ~13MB Uploads

Even though the Go backend has a **250MB** limit configured in `cloud/internal/api/quicknotes.go:351`, uploads of ~13MB fail with HTTP 413 because of intermediate proxy layers:

### Primary Cause: Next.js Internal Rewrites Body Size Cap
1. In `web/src/lib/api.ts:3-19`, `apiFetch` routes requests on `go-tide.app` or `localhost` to `window.location.origin` (the Next.js server).
2. In `web/next.config.ts:89-95`, Next.js rewrites `/api/:path*` to `http://localhost:8080/api/:path*`.
3. In Next.js 16 (`node_modules/next/dist/server/lib/router-utils/resolve-routes.js:6168` and `node_modules/next/dist/server/body-streams.js:34`), Next.js wraps incoming rewrite requests with `getCloneableBody(req, bodySizeLimit)`.
4. The default `bodySizeLimit` is `config.experimental.proxyClientMaxBodySize`, which defaults to **10,485,760 bytes (10MB)** (`DEFAULT_BODY_CLONE_SIZE_LIMIT = 10 * 1024 * 1024`).
5. When a 13MB file is uploaded, the stream exceeds 10MB. Next.js cuts off the stream (`limitExceeded = true; p1.push(null); p2.push(null);`), aborting the proxy request and returning an HTTP error / connection termination.

### Secondary Cause: Host Reverse Proxy (Nginx)
1. On the VPS / production host (`go-tide.app`), Nginx terminates SSL and proxies to the Next.js frontend (port 3000) or Go backend (port 8080).
2. The default Nginx `client_max_body_size` is **1MB** (or if raised, often 10M–12M).
3. If an upload exceeds Nginx's `client_max_body_size`, **Nginx directly issues an HTTP 413 (Request Entity Too Large)** response before the payload ever reaches Next.js or Go.

### Concrete Fix to Allow 250MB Uploads:
1. **Next.js (`web/next.config.ts`)**:
   Add `proxyClientMaxBodySize` under `experimental`:
   ```ts
   experimental: {
     proxyClientMaxBodySize: '250mb',
   },
   ```
2. **Nginx (`/etc/nginx/sites-available/...` or `nginx.conf`)**:
   Add or update in the `server` or `http` block:
   ```nginx
   client_max_body_size 250M;
   ```
3. **Optional / Recommended Architecture Polish**:
   In Nginx, route `/api/` directly to Go `http://localhost:8080/api/` instead of proxying through Next.js. This eliminates Node.js streaming overhead for file uploads.

---

## 3. Token Handling in Quicknotes

### Where is the token entered / stored / displayed?
1. **Entered**: In `web/src/app/notes/[slug]/page.tsx:727-734`, inside a popup modal (`showTokenModal`) in a plaintext `<input type="text" value={tokenInput} placeholder="tide_pat_..." />`.
2. **Stored**: In browser `localStorage` under key `"tide_quicknote_token"` (`page.tsx:748`).
3. **Displayed**:
   - As a Key icon button `<Key className="w-3 h-3" />` in the outline file header next to `"MB / 250 MB"` (`page.tsx:522-535`).
   - In plaintext in the modal input field when opened (`setTokenInput(localStorage.getItem('tide_quicknote_token') || '')`).

### Why doesn't the token help right now?
1. **Mismatched Error Layer**:
   - The ~13MB upload failure is an **HTTP 413** at the proxy layer (Next.js 10MB cap / Nginx 1M–10M cap).
   - The token validation in Go backend (`cloud/internal/api/quicknotes.go:358-373`) is ONLY triggered when cumulative storage exceeds **250MB** (which returns HTTP 403 `storage_limit_exceeded`).
   - Because the 13MB request is blocked at the proxy before Go evaluates it, entering a token has zero effect on the 413 error!
2. **Misleading Error Dialog Trigger**:
   - In `page.tsx:357-369`, if an upload fails with 413, `res.json()` fails or is not a `storage_limit_exceeded` error, so it shows a toast "Upload failed with status 413". The user sees the Key icon, enters a token hoping it helps, and it fails again.
3. **API Scopes Not Exposed**:
   - In `cloud/internal/api/api_tokens.go:70-75`, `ListScopes` does NOT include `storage:expand`.
4. **Logged-in Session JWTs Are Incompatible**:
   - The error message in `quicknotes.go:380` says: *"Speicherlimit von 250MB pro Notiz überschritten. Bitte melde dich an oder gib ein Zugriffs-Token ein."*
   - But `ValidateStorageExpandToken` ONLY checks the hash against `api_tokens` (PATs). A logged-in user whose browser sends `Authorization: Bearer <jwt>` fails validation because the JWT cannot be found in `api_tokens`!
5. **TipTap Ignores Stored Token**:
   - Pasting or dropping images into TipTap (`useTipTapConfig.ts:452, 501`) calls `uploadQuicknoteFile(slug, file)` without passing any token.

### Recommendations to Ensure the Token is No Longer Visible in Quicknotes:
1. **Remove Key Icon**: Remove the `<Key className="w-3 h-3" />` button from `web/src/app/notes/[slug]/page.tsx:522-535`.
2. **Remove Token Modal**: Delete the entire `showTokenModal` state and modal JSX (`web/src/app/notes/[slug]/page.tsx:710-761`).
3. **Clean Storage Quota Handling**:
   - In `handleUpload` catch block, replace `setShowTokenModal(true)` with a friendly error toast: `"Speicherlimit von 250MB für diese Notiz erreicht."`
4. **Remove `tide_quicknote_token` and `tokenInput`**:
   - Clean up `tokenInput`, `showTokenModal`, and `localStorage.getItem('tide_quicknote_token')` from `page.tsx`.
   - Remove unused `token` parameter from `uploadQuicknoteFile` calls in `page.tsx`.
   - Result: Quicknotes UI is clean, minimalistic, and free of developer/API token clutter.
