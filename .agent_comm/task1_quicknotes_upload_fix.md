# Quicknotes Upload Failure Analysis & Comprehensive Fix Plan

**Date:** 2026-11-02  
**Target:** Quicknotes upload failure analysis  
**Investigated Files:**
- `web/src/lib/quicknotesApi.ts`
- `web/src/app/notes/[slug]/page.tsx`
- `web/src/lib/api.ts`
- `web/src/lib/syncQueue.ts`
- `web/next.config.ts`
- `cloud/internal/api/quicknotes.go`
- `cloud/cmd/server/main.go`
- `cloud/internal/api/api_tokens.go`

---

## 1. Executive Summary & Root Causes

The user reported: *"der upload funktioniert immer noch nicht"* despite `proxyClientMaxBodySize: '250mb'` being configured in `next.config.ts`.

Our code-level investigation revealed **5 concrete root causes** spanning the deployment reverse proxy, client-side UI, error handling, Next.js rewrite engine, and backend CORS configuration:

| # | Layer | Root Cause | Impact |
|---|---|---|---|
| **1** | **Host Proxy (Nginx)** | Production Nginx (`go-tide.app`) default `client_max_body_size` is **1MB** | HTTP 413 issued by Nginx before request ever reaches Next.js or Go |
| **2** | **Frontend UI** | `page.tsx` has **no file input (`<input type="file" />`) or upload button** | Users on mobile/tablet or users trying to click the attachment area cannot upload files at all |
| **3** | **Next.js Engine** | `proxyTimeout` defaults to **30,000ms (30s)** in Next.js `http-proxy` | Large uploads (>20MB) on normal broadband abort with socket hang-up |
| **4** | **Frontend Core** | `apiFetch` in `web/src/lib/api.ts` catches network errors and **returns synthetic 200 OK** | Network/proxy failures are silently masked as fake "offline queue" items |
| **5** | **Backend CORS** | `Access-Control-Allow-Headers` in `cloud/cmd/server/main.go:165` lacks `X-Access-Token` | Direct API / dev uploads with access tokens fail CORS preflight |

---

## 2. Detailed Technical Findings

### 2.1. Request Flow & URLs (`quicknotesApi.ts` & `api.ts`)
- **Upload Invocation:**
  In `web/src/app/notes/[slug]/page.tsx:345-366`, `handleUpload` is called strictly from desktop `onDrop` (`page.tsx:447-453`). It calls `uploadQuicknoteFile(slug, file)`.
- **URL Resolution (`web/src/lib/api.ts:3-50`):**
  - **In Production (`go-tide.app`):** `window.location.origin` -> `https://go-tide.app/api/v1/quicknotes/:slug/files`.
  - **On Localhost (`web/.env.local`):** `NEXT_PUBLIC_API_URL=http://localhost:8080` -> directly hits Go server `http://localhost:8080/api/v1/quicknotes/:slug/files`. Next.js rewrites are **bypassed completely**.
- **FormData Construction (`web/src/lib/quicknotesApi.ts:198-202`):**
  ```ts
  const formData = new FormData();
  formData.append('file', file);
  if (token) formData.append('token', token);
  ```
  `fetch` automatically computes the boundary for `multipart/form-data`.

### 2.2. Next.js 15/16 Configuration Validation
- We inspected `web/node_modules/next/dist/server/config.js:669` and verified via runtime test:
  `experimental.proxyClientMaxBodySize` **IS valid** and normalizes `'250mb'` to `262144000` bytes.
- It applies to `getCloneableBody()` in Next.js internal rewrite proxying (`router-server.js:377` and `body-streams.js:85`).
- **However:**
  1. Next.js rewrite proxy uses `HttpProxy` with a default `proxyTimeout` of `30000` (30 seconds) (`node_modules/next/dist/server/lib/router-utils/proxy-request.js:33`). Without `experimental.proxyTimeout: 120_000`, large uploads abort.
  2. If traffic passes through Nginx in production, Nginx enforces its own `client_max_body_size` independently of Next.js.

### 2.3. The Masking Bug in `apiFetch` (`web/src/lib/api.ts:90-180`)
When Nginx returns HTTP 413 or resets the socket during an oversized upload:
1. `fetch(fullUrl)` throws a `TypeError: fetch failed` or network abort error.
2. In `web/src/lib/api.ts:125-180`, `apiFetch` catches this error in its generic offline fallback.
3. Because `/api/v1/quicknotes/...` does not start with `/api/v1/auth`, `apiFetch` calls `addToSyncQueue(...)` and **returns a synthetic HTTP 200 OK**:
   ```json
   { "offline": true, "queued": true, "message": "Offline change queued for synchronization" }
   ```
4. `uploadQuicknoteFile` sees `res.ok === true`, parses this JSON as a `QuicknoteAttachment`, and returns it.
5. `loadAttachments()` runs, but the file does not exist on the server. The user sees an empty file list or a broken state without any clear error message!

### 2.4. Backend Checks (`cloud/internal/api/quicknotes.go:322-416`)
- `r.ParseMultipartForm(32 << 20)`: Allocates 32MB RAM buffer, spools remainder to temp files on disk. (Does **not** limit body size).
- Quota check (`maxStorage = 250 * 1024 * 1024`): Only triggers if cumulative quicknote storage exceeds 250MB. Returns **HTTP 403** (`storage_limit_exceeded`), never 413.
- `MaxBytesReader`: **None exists** anywhere in the Go codebase.
- `UploadQuicknoteFile` never returns 413. Any 413 comes 100% from Nginx or Next.js proxy.

---

## 3. Concrete Fix Plan

### Fix 1: Frontend UI (`web/src/app/notes/[slug]/page.tsx`)
1. Add a hidden `<input type="file" ref={fileInputRef} multiple className="hidden" onChange={...} />`.
2. Add an upload button / click handler in the "Dateien" section header (`+ Datei hinzufügen`) and on the empty state drop zone so users can click to select files on mobile, tablet, and desktop.
3. Connect the file input's `onChange` directly to `handleUpload`.

### Fix 2: Frontend Network Client (`web/src/lib/api.ts` & `quicknotesApi.ts`)
1. In `web/src/lib/api.ts`: Exclude multipart file uploads and quicknotes uploads from the offline sync queue fallback (or check if `options.body instanceof FormData`). File uploads cannot and should not be serialized into offline JSON sync queues. Rethrow network errors immediately so the caller knows the upload failed.
2. In `web/src/lib/quicknotesApi.ts`: In `uploadQuicknoteFile`, add proper error parsing for non-JSON responses (e.g. Nginx HTML 413 / 502 / 504 pages) so the user gets a clear toast: `"Datei zu groß für den Server (HTTP 413)."` instead of a silent failure or crash.

### Fix 3: Next.js Configuration (`web/next.config.ts`)
Add `proxyTimeout` under `experimental` to allow up to 5 minutes for large 250MB transfers:
```ts
experimental: {
  proxyClientMaxBodySize: '250mb',
  proxyTimeout: 300_000, // 5 minutes for 250MB uploads
},
```

### Fix 4: Backend CORS (`cloud/cmd/server/main.go:165`)
Add `X-Access-Token` to `Access-Control-Allow-Headers`:
```go
w.Header().Set("Access-Control-Allow-Headers", "Content-Type, X-User-ID, Authorization, X-Requested-With, Accept, Origin, Cache-Control, X-Access-Token")
```

### Fix 5: Production Host Nginx Configuration (`/etc/nginx/sites-available/tide`)
On the deployment server (`go-tide.app`):
```nginx
server {
    server_name go-tide.app;
    client_max_body_size 250M;

    # Optimal route: stream /api/ directly to Go (port 8080), bypassing Next.js Node.js proxy
    location /api/ {
        proxy_pass http://localhost:8080/api/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        client_max_body_size 250M;
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
    }

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        client_max_body_size 250M;
    }
}
```
*(This Nginx `/api/` bypass also eliminates Node.js streaming overhead, memory pressure, and proxy timeouts).*
