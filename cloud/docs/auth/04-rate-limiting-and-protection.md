# Rate Limiting, Abuse Prevention & HTTP Security Policies

This document specifies the technical architecture and implementation details for rate limiting, brute-force protection, and HTTP security policies in Tide Cloud (`cloud/internal/api/ratelimit.go`, `cloud/internal/api/middleware.go`, and `cloud/cmd/server/main.go`).

---

## 1. Rate Limiting Philosophy & Threat Model

Tide Cloud operates as an encrypted synchronization and real-time collaboration hub. The system must defend against malicious automation without degrading the high-frequency interactive performance expected by active users.

```
                    INCOMING HTTP/WEBSOCKET TRAFFIC
                                   │
                                   ▼
        ┌─────────────────────────────────────────────────────┐
        │       Chi Global Middleware Pipeline                │
        │  Logger ➔ Recoverer ➔ RequestID ➔ RealIP ➔ CORS    │
        └──────────────────────────┬──────────────────────────┘
                                   │
                                   ▼
        ┌─────────────────────────────────────────────────────┐
        │            Route-Specific IPRateLimiter             │
        │           (Token Bucket Algorithm)                  │
        │                                                     │
        │   Allowed? ─────────── NO ─────────┐                │
        │      │                             ▼                │
        │     YES               HTTP 429 Too Many Requests    │
        │      ▼                Header: Retry-After: 10       │
        │   Handler / Service   Body: {"error":"too_many..."} │
        └─────────────────────────────────────────────────────┘
```

### Core Security Objectives
1. **Brute-Force & Credential Stuffing Defense**:
   - Prevent automated guessing attacks against blind-indexed user accounts, login challenges, and 6-digit numeric One-Time Passwords (OTP).
2. **Denial-of-Service (DoS) & Resource Exhaustion Mitigation**:
   - Guard compute-heavy and I/O-intensive endpoints (e.g. multi-field blind index queries, file chunk uploads, and full-text search) against request flooding.
3. **Namespace & Resource Squatting Prevention**:
   - Prohibit automated scripts from exhausting human-readable quicknote slugs and public share aliases.
4. **Preserving Real-Time Collaborative Responsiveness**:
   - Allow bursty synchronization traffic (e.g., rapid keystroke batching, tab synchronizations, contact pings) from genuine authenticated clients without artificial throttling.

---

## 2. Token Bucket Algorithm Implementation

Tide Cloud implements an in-memory, thread-safe token bucket rate limiter (`IPRateLimiter`) in `cloud/internal/api/ratelimit.go`.

### 2.1 Algorithmic Model & Math

The token bucket model allows smooth continuous replenishment rather than coarse fixed-window resetting, preventing the boundary-burst vulnerability:

$$\text{Tokens}_{\text{new}} = \min\left(\text{Burst},\; \text{Tokens}_{\text{previous}} + \Delta t \times \text{Rate}\right)$$

Where:
- $\text{Rate}$ ($r$): Floating-point tokens added to the bucket per second.
- $\text{Burst}$ ($b$): Maximum capacity of the token bucket.
- $\Delta t$: Elapsed seconds since the client IP's previous request ($t_{\text{now}} - t_{\text{lastSeen}}$).
- **Consumption**: Each HTTP request consumes exactly $1.0$ token. If $\text{Tokens}_{\text{new}} \ge 1.0$, the request is permitted and $1.0$ token is deducted. Otherwise, the request is rejected with HTTP 429.

### 2.2 Data Structures

```go
type ipEntry struct {
    tokens   float64
    lastSeen time.Time
}

type IPRateLimiter struct {
    mu       sync.Mutex
    ips      map[string]*ipEntry
    rate     float64 // tokens added per second
    burst    int     // maximum burst capacity
    stopCh   chan struct{}
    stopOnce sync.Once
}
```

### 2.3 Client IP Resolution & Normalization

Client IPs are resolved using `net.SplitHostPort` with safe fallbacks and bracket trimming to support IPv4 and IPv6:

```go
ip, _, err := net.SplitHostPort(r.RemoteAddr)
if err != nil {
    ip = r.RemoteAddr
}
ip = strings.Trim(strings.TrimSpace(ip), "[]")
if ip == "" {
    ip = "unknown"
}
```

Combined with `chi/middleware.RealIP` upstream, `r.RemoteAddr` is reliably populated from `X-Forwarded-For` or `X-Real-IP` when deployed behind trusted reverse proxies (e.g., Nginx, Cloudflare, Traefik).

### 2.4 Thread Safety & State Eviction

- **Concurrency**: State access (`ips` map lookup and mutation) is protected by `sync.Mutex` per limiter instance. Lock hold times are strictly $O(1)$, performing basic math and map assignment.
- **Reaper Goroutine**: An active server may observe thousands of unique client IPs. To prevent unbounded memory growth, `IPRateLimiter` runs an automated background reaper:
  ```go
  func (l *IPRateLimiter) cleanupLoop() {
      ticker := time.NewTicker(time.Minute)
      defer ticker.Stop()
      for {
          select {
          case <-ticker.C:
              l.CleanupOlderThan(10 * time.Minute)
          case <-l.stopCh:
              return
          }
      }
  }
  ```
  Entries inactive for $>10\text{ minutes}$ are purged from memory. Calling `Stop()` closes `stopCh` via `sync.Once`, ensuring leak-free shutdown during unit tests and service recycling.

---

## 3. Account Lockout & Failed Attempt Tracker

For sensitive operations where standard rate limiting alone is insufficient (e.g., credential verification and cryptographic handshakes), `FailedAttemptTracker` provides stateful lockout enforcement across sliding temporal windows.

```
                  Client Attempt Recorded
                             │
                             ▼
                    ┌──────────────────┐
                    │ RecordFailure()  │
                    └────────┬─────────┘
                             │
            FailCount >= maxAttempts?
                   ├─── YES ───► LockedUntil = now + lockoutDur (Locked out!)
                   └─── NO  ───► Returns remaining attempts allowed
```

### 3.1 Lockout Structure

```go
type LockoutEntry struct {
    FailCount   int
    LockedUntil time.Time
    LastAttempt time.Time
}

type FailedAttemptTracker struct {
    mu          sync.Mutex
    entries     map[string]*LockoutEntry
    maxAttempts int
    lockoutDur  time.Duration
}
```

- `IsLocked(key string) (bool, time.Duration)`: Inspects whether the entity (keyed by IP or identifier hash) is locked and returns the remaining time penalty.
- `RecordFailure(key string) (locked bool, remaining int)`: Increments failure count, triggering lockouts when thresholds are exceeded.
- `RecordSuccess(key string)`: Resets lockout status upon successful authentication.
- **Eviction**: A 10-minute ticker clears expired entries older than 30 minutes.

---

## 4. Endpoint Quota Taxonomy

Different endpoints have vastly differing threat profiles and bandwidth characteristics. Tide Cloud configures distinct `IPRateLimiter` tiers in `cloud/cmd/server/main.go`:

| Limiter | Target Endpoints | Rate ($r$) | Burst ($b$) | Effective Limit | Purpose |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`authLimiter`** | `/api/v1/auth/register`<br>`/api/v1/auth/request-otp` | `0.1` tokens/sec | `5` | 1 req / 10s (Burst 5) | Thwarts automated registration spam & email relay abuse |
| **`otpVerifyLimiter`** | `/api/v1/auth/verify-otp` | `0.166` tokens/sec | `5` | 1 req / 6s (Burst 5) | Prevents brute-forcing 6-digit numeric OTP authentication |
| **`searchLimiter`** | `/api/v1/search` | `20.0 / 60.0` tokens/sec | `20` | 20 req / min (Burst 20) | Guards database against expensive full-text search sweeps |
| **`quicknoteLimiter`**| `/api/v1/quicknotes/*` | `5.0` tokens/sec | `30` | 5 req / sec (Burst 30) | Prevents slug exhaustion while supporting fast note typing |
| **General REST API** | `/files`, `/messages`, `/tasks`, `/todos`, `/tabs` | High Capacity | `200` | High throughput | Dynamic sync and CRDT state synchronizations |
| **WebSocket / SSE** | `/events`<br>`/api/ws/notes/{fileID}`<br>`/api/ws/quicknotes/{slug}` | Connection-level | N/A | Auth gated | Connection handshake guarded by token verification |

### 4.1 Rate Limit Violation Response
When a client exhausts its quota, `RateLimitMiddleware` halts execution and responds with standard HTTP 429 semantics:

```http
HTTP/1.1 429 Too Many Requests
Content-Type: application/json
Retry-After: 10

{
  "error": "too_many_requests",
  "message": "Too many requests. Please wait before trying again."
}
```

### 4.2 File Update Write Brake (`PUT`/`PATCH /api/v1/files/{id}`)

`cloud/internal/api/files_update_guard.go`, wired into `FileHandler.UpdateFile` after the access check (unknown file stays 404, missing write permission stays 403, both without using a token). Background: two stale browser tabs once rewrote six calendar entries 100-270 times a minute (versions ~75 000).

**No-op detection.** The server cannot compare encrypted content, only metadata. A PUT is a no-op when it carries no `content_ciphertext` and every field it sends equals the stored state: `parent_id` (`"__none__"`/`""` = NULL), `visibility`, `secured_meta` (byte-identical, owner only; a collaborator's `secured_meta` lives in the share row and always counts as a change), `public_meta`, `metadata` and, for the owner, `access_keys`. JSON is compared normalised: key order ignored; `null`, `""`, `false`, `{}`, `[]` equal a missing key; array order and number spelling kept. A no-op writes nothing, keeps the version, sends no SSE `file_updated`, runs no backup cascade, and answers `200` with the stored file (same JSON as a normal PUT, plus header `X-Tide-Noop: 1`). This also holds with a stale `version`: the server already holds what the client wants, so nothing is overwritten and the client learns the current version. Any real change with a stale version still gets `409` exactly as before.

Note: calendar entry saves always send fresh `secured_meta` and `content_ciphertext` (random IVs), so they are never no-ops; for them only the rate limit applies.

**Rate limit.** Token bucket per `user|file`: 90 updates/min, burst 30 (no-ops count too). Highest legitimate rates measured in the web client: calendar entries 20/min per tab (`eventWriteGuard.ts`: burst 3, then one per 2 s), search index one write per 2 s debounce per tab, note metadata only after 15 s idle (3 s for overlays). The daemon under `core/` only reads. Exceeding the limit:

```http
HTTP/1.1 429 Too Many Requests
Content-Type: application/json
Retry-After: <seconds until the next token, at least 1>

{"error":"too_many_requests","message":"Too many updates for this file. Please wait before trying again.","retry_after":1}
```

A refused write sends no broadcast, which also breaks refresh-driven ping-pong chains. The server logs at most one warning per file and minute. Web clients do not retry on 429: `apiFetch` returns it unchanged, `eventWriteGuard` reports the save as failed, the offline `syncQueue` keeps 429 items for its next flush.

---

## 5. HTTP Security & CORS Policies

### 5.1 Router Middleware Pipeline

HTTP requests pass through a layered Chi middleware chain in `main.go`:

```
Incoming Request
  └── middleware.Logger         (Structured request logging)
      └── middleware.Recoverer  (Catches panics, writes 500 error)
          └── middleware.RequestID  (Generates/propagates X-Request-Id)
              └── middleware.RealIP (Parses X-Forwarded-For / X-Real-IP)
                  └── middleware.RedirectSlashes (Normalizes URL path slashes)
                      └── CORS Middleware (Origin validation & headers)
                          └── Route Rate Limiters (IPRateLimiter)
                              └── AuthMiddleware (JWT verification)
                                  └── Application Controller
```

### 5.2 Cross-Origin Resource Sharing (CORS)

The server enforces an explicit origin whitelist. Wildcard (`*`) origins are disallowed when credentials are supported.

```go
trustedOrigins := map[string]bool{
    "http://localhost:3000":   true,
    "http://localhost:5173":   true,
    "http://127.0.0.1:3000":   true,
    "http://127.0.0.1:5173":   true,
    "https://go-tide.app":     true,
    "https://www.go-tide.app": true,
    "https://hrw.rocks":       true,
    "https://www.hrw.rocks":   true,
    "https://track.hrw.rocks": true,
}
```

1. **Environment Configuration**: Additional origins can be injected via `APP_URL` and comma-separated `ALLOWED_ORIGINS`.
2. **Development Mode**: In non-production environments (`ENV != "production"`), origins matching `http://localhost*` or `http://127.0.0.1*` are dynamically permitted for developer flexibility.
3. **Response Headers Applied**:
   - `Access-Control-Allow-Origin: <exact_request_origin>` (reflects only trusted origins).
   - `Access-Control-Allow-Credentials: true` (permits session cookie and authorization header transmission).
   - `Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS, PATCH`.
   - `Access-Control-Allow-Headers: Content-Type, X-User-ID, Authorization, X-Requested-With, Accept, Origin, Cache-Control, X-Access-Token, X-API-Key`.
   - `Access-Control-Max-Age: 3600` (preflight responses cached by browser for 1 hour).
4. **OPTIONS Short-Circuit**: Preflight `OPTIONS` requests terminate with `200 OK` immediately without progressing through downstream handlers.

### 5.3 Distributed Tracing & Request ID Injection

Tide uses Chi's `middleware.RequestID` to correlate client transactions with backend service logs:
- Injects a unique `X-Request-Id` into request context and response headers.
- If the incoming client provides an existing tracing ID, it is preserved and propagated.
- Downstream handlers include this identifier in log lines for end-to-end incident investigation.

### 5.4 Mandatory HTTP Security Headers

In production deployments, the gateway and application ensure standard defense-in-depth security headers:
- `X-Content-Type-Options: nosniff`: Prevents MIME-type sniffing of uploaded blobs and encrypted user files.
- `X-Frame-Options: DENY`: Protects client interfaces from clickjacking attacks.
- `Referrer-Policy: strict-origin-when-cross-origin`: Restricts referrer leakage on outbound navigation.

### 5.5 Startup Fail-Fast Security Assertions

To guarantee security invariants, the server executes strict sanity checks during startup:
- `ValidateJWTSecret()` (`cloud/internal/api/middleware.go`): Terminates execution immediately (`log.Fatal`) if `JWT_SECRET` is unset or empty. No insecure fallbacks are permitted.
- `SERVER_MASTER_KEY` Check (`cloud/cmd/server/main.go`): When running in `ENV=production`, the master encryption key must be set and at least 32 characters in length.

---

## 6. Real-Time Protocol Protection (SSE & WebSockets)

### 6.1 Server-Sent Events (SSE) `/api/v1/events`
The SSE notification broker (`api.Broker`) streams real-time vault modifications, contact presence, and message alerts:
- **Authentication**: Gated behind `AuthMiddleware`. Accepts session JWT via `Authorization: Bearer <token>`, `?token=<token>` query string (for standard `EventSource` clients that cannot send custom headers), or `tide_session` cookie.
- **Connection Heartbeats**: Clients periodically receive ping frames to keep connection state alive and detect zombie sockets.

### 6.2 Collaborative WebSockets
- **Notes CRDT Hub** (`/api/ws/notes/{fileID}`): Authenticates client ownership before upgrading HTTP connection to WebSocket.
- **Quicknotes Hub** (`/api/ws/quicknotes/{slug}`): WebSocket upgrade endpoint protected by slug validation and origin verification.
- **Rate-Limited Presence**: Frequent updates (e.g. `/user/heartbeat` and `/user/status`) verify user IDs and prevent presence floods through lightweight in-memory broker state updates.

---

## 7. Operational Recommendations & Troubleshooting

### Investigating 429 Errors
1. Check `Retry-After` header value in response to determine client sleep interval.
2. In proxy environments, ensure `X-Forwarded-For` is configured properly so the server rate-limits individual clients rather than the entire load balancer IP pool.
3. For automated CLI or test integrations, use authenticated PAT tokens with appropriate retry-backoff algorithms.
