---
name: performance-audit
description: Conducts a comprehensive live E2E browser, frontend bundle, and backend API performance audit of the Tide app on localhost, writes a structured Markdown audit report in docs/audit/YYYY-MM-DD-performance-audit.md, and compares all metrics and scores against the previous audit report in docs/audit/. Guides the agent with a proven baseline catalog while encouraging open exploratory testing.
---

# Tide Performance Audit Skill

This skill guides you through running a reproducible, live end-to-end performance audit of **Tide** (Next.js frontend + Go/SQLite backend) on `localhost`, comparing results side-by-side against the previous report in `docs/audit/`, and discovering new bottlenecks through targeted exploratory testing.

---

## Core Philosophy: Guardrails, Not a Straitjacket

You must balance **comparability** with **discovery**:

- **Do NOT start from zero.** Every server startup flag, environment override, dev-login flow, CDP telemetry pattern, and known DOM/scroll gotcha is documented below so you spend zero steps fighting setup quirks.
- **Do NOT blindly follow a rigid script.** Real performance regressions hide in newly landed commits, complex user workflows, multi-user sync, and sustained usage.
- **70% Core Baseline Benchmark Catalog:** Run the standardized scenarios in Section 4 so every metric (`Vorher -> Jetzt -> Delta`) and area score is apples-to-apples comparable with the previous audit in `docs/audit/`.
- **30% Open Exploratory Discovery:** Dedicate real effort to probing recent git commits, edge cases, `Dev Alice` + `Dev Bob` live collaboration, memory/listener retention over sustained loops, and deep CPU/React hotspot inspection (Section 6).

---

## Step 0 — Baseline & Git Diff Discovery

Before booting servers or writing probes:

1. **Read the previous audit report:**
   ```powershell
   ls docs/audit/
   ```
   Open the latest `*-performance-audit.md` (or `.html`, e.g., `docs/audit/2026-11-23-performance-audit.html`) and extract:
   - The **baseline commit SHA** / branch / environment notes.
   - All **9 Area Scores**, **Overall Score (0–100)**, and **key KPIs** (`Dauer`, `Requests`, `FPS`, `p50/p95`, `Nodes`, `JSEventListeners`, `JSHeapUsedSize`, bundle sizes).
   - Any **open / unmeasured items** or **previously recommended fixes** that need verification.

2. **Inspect what changed since the baseline:**
   ```powershell
   git status -sb
   git log --oneline <baseline-commit>..HEAD
   git diff --stat <baseline-commit>..HEAD
   ```
   Use this diff to plan your **30% Exploratory Phase** (e.g., verify claimed perf fixes actually dropped request counts, and probe newly touched components/handlers for unintended regressions).

---

## Step 1 — Backend Setup (`localhost:8081`, `DEV_MODE=true`)

### How `.env` & Secrets Work (`cloud/cmd/server/main.go`)
- `main.go` loads `.env` via `godotenv.Load()` from `<exeDir>/.env` or `./.env`. Existing shell environment variables take precedence over `.env`.
- **`JWT_SECRET` is mandatory:** `api.ValidateJWTSecret()` calls `log.Fatal` on startup if `JWT_SECRET` is missing or invalid.
- **`SERVER_MASTER_KEY` is critical for persisted dev accounts:** If `SERVER_MASTER_KEY` is omitted in dev mode, `main.go` falls back to `12345678901234567890123456789012` — which **cannot decrypt** the existing `Dev Alice` and `Dev Bob` key peppers stored in `cloud/data/tide.db`! Always pass the `docker-compose.yml` key when running against `cloud/data`:
  ```powershell
  $env:PORT = "8081"
  $env:ENV = "development"
  $env:DEV_MODE = "true"
  $env:JWT_SECRET = "dev-secret-super-secure-jwt-key-for-local-development-123456789"
  $env:SERVER_MASTER_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
  $env:DATA_DIR = "C:\Users\nicoh\projects\tide\cloud\data"
  ```

### Start & Verify `:8081` (Never Audit a Stale Binary!)
1. Check if something is already listening on `:8081` (e.g., `netstat -ano | findstr :8081` or `Get-Process`). If an old binary or worktree process is running, stop it or verify its build path/commit before trusting results.
2. Build and launch fresh from `cloud/`:
   ```powershell
   cd C:\Users\nicoh\projects\tide\cloud
   go build -o tide-server-audit.exe ./cmd/server
   .\tide-server-audit.exe
   ```
   *(Clean up `tide-server-audit.exe` after the audit, or run `go run ./cmd/server`.)*
3. Verify health and `HEAD` match:
   ```powershell
   Invoke-RestMethod http://localhost:8081/health
   ```

---

## Step 2 — Frontend Setup (`:3001` Dev & `:3099` Prod)

### Critical `web/.env.local` Override Warning
`web/.env.local` contains:
```env
NEXT_PUBLIC_API_URL=http://localhost:8080
```
Because the audit backend runs on **`:8081`**, you **MUST** override `NEXT_PUBLIC_API_URL` and `BACKEND_PORT` via shell environment variables (Next.js prioritizes process env over `.env.local`).

### 2A. Dev Server (`http://localhost:3001`)
Use for interactive debugging, React DevTools/Profiler inspection, and direct comparison against prior Dev-mode baselines:
```powershell
cd C:\Users\nicoh\projects\tide\web
$env:PORT = "3001"
$env:BACKEND_PORT = "8081"
$env:NEXT_PUBLIC_DEV_MODE = "true"
$env:NEXT_PUBLIC_API_URL = "http://localhost:8081"
npx next dev -p 3001
```

### 2B. Production Build & Server (`http://localhost:3099`)
Required for accurate **bundle sizes**, **code-splitting verification**, and **cold-load FCP / LCP / TBT / Script-Time** measurements without React StrictMode double-invocations or unminified Dev JS:
```powershell
cd C:\Users\nicoh\projects\tide\web
$env:PORT = "3099"
$env:BACKEND_PORT = "8081"
$env:NEXT_PUBLIC_DEV_MODE = "true"
$env:NEXT_PUBLIC_API_URL = "http://localhost:8081"
npm run build
npx next start -p 3099
```
Also inspect `.next/static/chunks/` (raw + gzipped sizes, top 5 chunks), `web/public/` asset weight, and unused heavy dependencies in `web/package.json`.

---

## Step 3 — Dev Login Mechanics (`/auth`)

With `DEV_MODE=true` + `NEXT_PUBLIC_DEV_MODE=true`, `/auth` renders the `"🛠️ Dev / Demo Schnellzugriff"` section (`web/src/app/auth/page.tsx`) backed by `POST /api/v1/auth/dev-login`:

| Button Label | Payload | Purpose in Audit |
|---|---|---|
| `⚡ Einmal-Gast` | `{ "type": "disposable" }` | **Primary mutation account.** Ephemeral isolated vault for creating/editing/deleting notes, events, todos, and API load tests without polluting persistent accounts. |
| `👤 Dev Alice` | `{ "type": "persistent", "username": "Dev Alice" }` | **Returning-user & large-vault benchmark.** Measures login-to-shell startup, RSA metadata decryption scaling, and realistic multi-item directory loads. Do not leave stray test artifacts behind. |
| `👥 Dev Bob` | `{ "type": "persistent", "username": "Dev Bob" }` | **Multi-user / Yjs collaboration partner.** Pair with `Dev Alice` in two separate browser contexts to test live shared-note CRDT sync and WebSocket overhead. |

---

## Step 4 — Core Baseline Test Catalog (70% Effort)

### Telemetry & Browser Instrumentation
Launch headless Chrome via CDP (or Playwright attached via CDP):
```text
"C:\Program Files\Google\Chrome\Application\chrome.exe" --headless=new --remote-debugging-port=0 --no-first-run --no-default-browser-check
```
Capture the following metrics per scenario using CDP (`Performance`, `Network`, `Runtime`, `Emulation`) and injected `PerformanceObserver` / `requestAnimationFrame` probes:
- **Timing & Paint:** Action wall-clock duration (`ms`), TTFB, FCP, LCP, CLS (`PerformanceObserver`).
- **Frame Rate & Main Thread:** rAF FPS, p95/max frame duration (`ms`), Long Tasks (`entryType: "longtask"`, count + total ms + TBT).
- **Network & WebSocket:** Request count, grouped endpoint breakdown, duplicate `GET` calls, wire/encoded bytes, `Content-Encoding` (`gzip`), `ETag`, `Content-Length`, and `Network.webSocketFrameSent` / `webSocketFrameReceived`.
- **DOM & Memory (`Performance.getMetrics`):** Delta of `JSEventListeners`, `Nodes`, and `JSHeapUsedSize` before/after each test block (and after `HeapProfiler.collectGarbage` where applicable).

### Baseline Areas 1–7

1. **Auth & Startup**
   - Cold-load `/auth` in **Dev (`:3001`)** and **Prod (`:3099`)** at **Desktop (`1440×900`, `1× CPU`)** and **Mobile (`390×844`, `4× CPU`)**.
   - `⚡ Einmal-Gast` login-to-shell duration, total requests, transfer bytes, FPS.
   - `👤 Dev Alice` returning-user login-to-shell duration, duplicate `/files` or `/profiles` checks, RSA decryption time.

2. **Notes & TipTap Editor**
   - Create new note (duration, requests, FPS).
   - Rename title (~20+ chars) and measure input latency + request count + listener delta.
   - Type **80+ characters** into TipTap editor: measure keystroke-to-paint latency (`p50`, `p95`, `max`), FPS, and background HTTP requests (`compact`, `crdt-state`, `backups`).
   - Paste **4,000+ characters** + type 40 more characters: measure latency, listener delta, and requests.
   - Trigger manual/auto save & compaction; observe idle compaction delay vs immediate cascade.
   - Batch-create **8 notes**, measure p50/max per note, Long Tasks, FPS, and `/files` request storm.
   - Switch between notes via **Sidebar** and **Tabs** (`p50` duration, requests, remount cost).
   - Delete note cleanly.

3. **Calendar**
   - Open Calendar (Week view — verify column count, e.g., 42-day window, render time, FPS).
   - Create event + edit via popover (handle `"Ohne Tag speichern"` modal if closing without a tag — see Section 5).
   - Batch-create **8 events**, measure `p50` duration, Long Tasks, Script Time, and FPS.
   - Switch views: **Tag → Monat → Fortlaufend (Agenda) → Woche** (duration, requests, FPS).
   - Navigate weeks (`Vor` / `Zurück` / `Heute`, e.g., 9 steps) — **wait `1600ms`** for `useWeekWindow` smooth scroll to settle, then record duration, requests, and `Nodes` delta.
   - **Drag-move** an existing `[data-event-id]` event (20-step mouse move) and **resize handle** drag (measure FPS, `mousemove` Long Tasks, and `PUT` completion).
   - Delete event.

4. **Todos**
   - Open Todos view (duration, requests, FPS).
   - Create single todo (handle `"Ohne Tag speichern"` if applicable).
   - Batch-create **10 todos** (`p50`, `max`, requests, FPS).
   - Edit detail pane, add & toggle **3 subtasks**, toggle completion, delete todo.
   - Monitor background requests triggered per todo mutation (e.g., encrypted search index re-upload, `/tasks` refetches).

5. **Search, Settings & Focus Refetch**
   - Open **Search (`Ctrl+K`)**, type query, measure keystroke latency (`p50`) and network calls.
   - Cycle through all **8 Settings tabs** (`78–120ms` baseline check; verify lazy-loading / listener cleanup on close).
   - **Window `focus` / `visibilitychange` test:** After opening, switching, and deleting several notes, dispatch `focus` and `visibilitychange` events on `window`/`document` and count `crdt-state` and `/files` (`fetchDirectory`) requests (verify zero leaked Yjs providers for closed/deleted notes!).

6. **Mobile (`390×844` @ `4× CPU` Throttling)**
   - Load shell and measure LCP, Long Tasks, TBT, and Script Time.
   - Navigate via `MobileBottomNav` tabs (`Kalender`, `Notizen`, `Todos`), test calendar subviews, and open the FAB (`aria-label="Neues Element erstellen"`).

7. **Direct Backend API (`:8081`) & WebCrypto Benchmarks**
   Run a direct HTTP script against `http://localhost:8081` (using a single `Einmal-Gast` token):
   - Latency `p50` / `p95` / `max` for `GET /health`, `GET /api/v1/auth/me`, `POST /api/v1/files`, `GET/POST/PATCH/DELETE /api/v1/tasks`.
   - Blob upload & download for **`10 KB`**, **`250 KB`**, and **`2 MB`** — measure **first upload vs overwrite** separately (to expose synchronous backup cascade cost).
   - Check response headers on `/files` and `/download`: `Content-Encoding: gzip`, `ETag`, `Content-Length`.
   - File-list scaling at **`N = 10`**, **`N = 50`**, **`N = 150`** files (latency + compressed/uncompressed payload size).
   - Concurrency stress: **20 parallel writes** and **20 parallel reads** (at `N = 150`), checking `p50`/`p95` and error count.
   - WebCrypto microbenchmark (RSA-4096 encrypt/decrypt, PBKDF2 600k iterations, AES-GCM 64 KB) to contextualize browser decryption bottlenecks.
   - **MANDATORY CLEANUP:** Delete every test file, task, and todo created during the API benchmark before finishing!

---

## Step 5 — Known Gotchas & Pitfalls (Save Your Steps)

| Area | Gotcha / Symptom | Exact Solution |
|---|---|---|
| **DOM Clickability** (`SettingsModal.tsx`, `MobileBottomNav.tsx`) | Ancestor layout wrappers have `pointer-events: none` while child buttons have `pointer-events: auto`. | Inspect `getComputedStyle(el).pointerEvents` on the **target button element itself**, never reject elements because an ancestor has `pointer-events: none`. |
| **Untagged Save Modal** (Calendar & Todos) | Dismissing or saving an untagged new event/todo opens an inline confirmation dialog: `"Ohne Tag speichern?"`. | Either select a tag before saving, or detect and click the `"Ohne Tag speichern"` confirm button. |
| **Calendar Week Scroll & Card Width** | `useWeekWindow` runs a smooth scroll lasting ~`1500ms` after clicking `Heute`/`Vor`/`Zurück`. Overlapping 09:00 cards can collapse or sit off-viewport. | Wait **`1600ms`** after week navigation before measuring `Nodes` or querying bounding boxes. Filter `[data-event-id]` candidates for visible width **`> 8px`** before dragging. |
| **Dev-Login Rate Limit** | `/api/v1/auth/dev-login` is rate-limited (`0.1 req/s`, `burst 5`). | **Reuse** the acquired JWT/session across sub-tests in the API benchmark, and add exponential backoff / retry on HTTP `429` in browser runs. |
| **Port / Worktree Drift** | `web/.env.local` defaults to `:8080`, or a stale server process is still bound to `:8081`/`:3001`. | Always set `NEXT_PUBLIC_API_URL=http://localhost:8081` explicitly in the process env and confirm running PIDs match current `HEAD`. |

---

## Step 6 — Open Exploratory Phase (30% Effort — Mandatory)

Do **not** stop once the baseline table is filled. Use ~30% of your audit budget to investigate what changed and what the baseline doesn't cover:

1. **Verify Recent Commits & Regression Checks:**
   - Pick the top performance commits from `git log <baseline>..HEAD` and verify their specific mechanisms live (e.g., lazy-loaded chunks actually stay unloaded until opened; gzip headers appear on large JSON; parallel RSA decryption speeds up `Dev Alice`).
2. **Multi-User Live Collaboration (`Dev Alice` + `Dev Bob`):**
   - Open two isolated browser contexts logged in as `Dev Alice` and `Dev Bob` on a shared note. Type concurrently and measure WebSocket frame frequency, CRDT merge latency, awareness/cursor traffic, and frame drops.
3. **Sustained Interaction & Leak Stress Test:**
   - Run a 50-step interaction loop (create/open/type/switch/delete notes + calendar view switches + modal open/close) and plot the slope of `JSEventListeners`, `Nodes`, and `JSHeapUsedSize` (after GC) to catch slow leaks that 1-shot tests miss.
4. **Untested / Rich Features:**
   - Probe Canvas notes, password-protected V2 notes (`PBKDF2 600k` re-derivation cost), large folder trees, or IndexedDB/offline sync serialization under load.
5. **CPU Flamegraph / React Profiler Hotspot Hunt:**
   - If any interaction still shows Long Tasks (`>50ms`) or `<45 FPS`, attach CDP `Profiler.start()` / `Profiler.stop()` during that exact interaction and trace the top self-time JS functions to exact `file:line` locations.

---

## Step 7 — Report Specification (`docs/audit/YYYY-MM-DD-performance-audit.md`)

Write the final report to `docs/audit/YYYY-MM-DD-performance-audit.md` (using today's date). Every report **must** include:

1. **Header & Executive Summary**
   - Date, tested commit SHA (`HEAD`), baseline commit SHA & previous report link, environment specs (Dev `:3001`, Prod `:3099`, Backend `:8081`, Chrome version, CPU throttling), and **Overall Score (`0–100`)** with delta (`Vorher -> Jetzt -> Delta`).
2. **9-Area Scorecard Comparison Table**
   Include all 9 standardized areas with `Vorher | Jetzt | Delta | Bewertung`:
   - `Backend-API`
   - `Todos`
   - `Suche / Einstellungen`
   - `Erstladen (Produktion)`
   - `Kalender`
   - `Notiz-Editor (Tippen)`
   - `Mobile (4× CPU)`
   - `Netzwerk-Effizienz`
   - `Speicher / Listener`
3. **Core Benchmark Comparison Tables (`Vorher -> Jetzt -> Delta`)**
   - Desktop Interactions (`1440×900`): Duration, Requests, FPS/p95, Listeners/Nodes delta.
   - Production vs Dev Cold Load (`/auth` Desktop `1×` & Mobile `4×`): TTFB, FCP, LCP, CLS, TBT, Transfer KB.
   - Production Bundle & `web/public` Asset Breakdown.
   - Direct Backend API (`:8081`) & WebCrypto Scaling Table.
4. **Exploratory Findings Section**
   - Dedicated subsection documenting every exploratory experiment (what was tested, how, raw numbers, and any newly uncovered bottlenecks or confirmed fixes).
5. **Findings by Severity (`Kritisch` / `Hoch` / `Mittel` / `Verbessert`)**
   - Each finding must cite exact measured evidence and clickable root-cause code links (`[file.ts#L123-L145](file:///C:/Users/nicoh/projects/tide/...)`).
6. **Prioritized Action Roadmap**
   - Ranked table: `# | Maßnahme | Betroffene Dateien | Erwarteter Effekt | Aufwand`.
7. **Methodology, Test Cleanup & Limitations**
   - Document browser/script methodology, rate-limit handling, confirmation that test data on `:8081` was cleaned up, and any remaining blind spots.
