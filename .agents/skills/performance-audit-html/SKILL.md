---
name: performance-audit-html
description: Conducts a comprehensive live E2E browser, frontend bundle, and backend API performance audit of the Tide app on localhost with open exploratory testing, and generates BOTH a detailed Markdown audit document (docs/audit/YYYY-MM-DD-performance-audit.md) AND a self-contained visual HTML overview dashboard (docs/audit/YYYY-MM-DD-performance-audit.html) with side-by-side delta comparisons against the previous audit in docs/audit/.
---

# Tide Performance Audit (Markdown + HTML Dashboard)

Execute a rigorous, reproducible, and exploratory end-to-end performance audit of Tide (`web/` Next.js frontend + `cloud/` Go/SQLite backend) on localhost, **always comparing every metric and finding against the most recent audit in `docs/audit/`**, and producing **two synchronized deliverables**:

1. **`docs/audit/YYYY-MM-DD-performance-audit.md`** — Full technical audit report with root-cause `file:line` references, raw & aggregated tables, delta analysis, backend/bundle deep-dives, and prioritized fixes.
2. **`docs/audit/YYYY-MM-DD-performance-audit.html`** — Self-contained HTML5 visual executive & engineering dashboard overview (zero external dependencies) using the standardized CSS design system and comparison blueprint below.

---

## Phase 0: Load Previous Audit Baseline (Mandatory)

Before launching browsers or benchmarks:

1. Scan `docs/audit/` for the most recent `YYYY-MM-DD-performance-audit.html` and/or `YYYY-MM-DD-performance-audit.md` (e.g., `docs/audit/2026-11-23-performance-audit.html`).
2. Extract and record the baseline snapshot:
   - Overall score (`XX / 100`) and every domain score (`Backend-API`, `Todos`, `Suche / Einstellungen`, `Erstladen (Produktion)`, `Kalender`, `Notiz-Editor (Tippen)`, `Mobile (4× CPU)`, `Netzwerk-Effizienz`, `Speicher / Listener`).
   - Headline KPIs (typing request storm, listener delta, focus `crdt-state` count, event creation p50, FPS, API compression %, prod `/auth` FCP/transfer desktop & mobile).
   - Every table metric (`Desktop`, `Kalender`, `Mobile`, `Produktion vs. Dev`, `Bundle`, `Backend :8081`).
   - Every open finding (Kritisch / Hoch / Mittel / Gut) so you can explicitly verify whether each item is **Behoben**, **Teilweise behoben**, **Unverändert**, or **Regrediert**.
3. Capture current git state (`git rev-parse --short HEAD`, branch/worktree, dirty status) and note if the running server differs from HEAD.

---

## Phase 1: Localhost Environment Setup

Run Tide locally on isolated audit ports so nothing interferes with regular dev ports:

| Service | Port | Startup & Required Environment |
|---|---|---|
| **Go Backend (`cloud/`)** | `:8081` | `PORT=8081`<br>`JWT_SECRET=dev-audit-jwt-secret-change-me-32bytes-min`<br>`SERVER_MASTER_KEY=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef` *(64 hex chars / 32 bytes)*<br>`ALLOWED_ORIGINS=http://localhost:3001,http://localhost:3099`<br>Start: `cd cloud && go run ./cmd/server` (verify `GET http://localhost:8081/health`) |
| **Next.js Dev (`web/`)** | `:3001` | `NEXT_PUBLIC_API_URL=http://localhost:8081`<br>Start: `cd web && npx next dev -p 3001 --webpack` |
| **Next.js Prod (`web/`)** | `:3099` | `NEXT_PUBLIC_API_URL=http://localhost:8081`<br>Build & Start: `cd web && npm run build && npx next start -p 3099` |

### Environment Rules
- **Dev vs. Prod clarity:** `next dev` runs unminified bundles with React StrictMode (`web/next.config.ts`). Always measure cold-load / bundle / mobile FCP/LCP on **Production (`:3099`)** as well as Dev (`:3001`), and clearly separate architectural bugs (present in both) from StrictMode/unminified-Dev amplification.
- **Browser instrumentation:** Drive Chromium/Chrome headless via CDP or Playwright (`1440×900` Desktop @ 1× CPU, `390×844` Mobile @ 4× CPU throttling). Collect `Performance.getMetrics` (`JSHeapUsedSize`, `JSEventListeners`, `Nodes`, `ScriptDuration`), `PerformanceObserver` (`paint` FCP, `largest-contentful-paint`, `layout-shift`, `longtask`), `requestAnimationFrame` FPS, and full HTTP + WebSocket request logs.
- **Warm-up & multi-run stability:** Warm up Next.js dev routes once before timing; run interactive benchmarks multiple passes where noisy and report `p50` / `p95` / `max` (note which run numbers were used).
- **Cleanup:** Delete any synthetic notes, calendar events, tasks/todos, or files created during backend/E2E runs, and shut down temporary test processes when finished.

---

## Phase 2: Dev-Login Guide (`/auth`)

In Dev Mode (`isDevMode`), `/auth` (`web/src/app/auth/page.tsx`) renders the **`🛠️ Dev / Demo Schnellzugriff`** box with three 1-click buttons (no OTP/PIN needed):

| Account | Trigger / Purpose | Usage Rules |
|---|---|---|
| **`⚡ Einmal-Gast`** | `handleDevQuickLogin('disposable')` | **Primary benchmark account.** Use for all write-heavy E2E flows (notes, typing, calendar batches, todos) and `:8081` backend micro-benchmarks. Clean up created items afterward. |
| **`👤 Dev Alice`** | `handleDevQuickLogin('persistent', 'Dev Alice')` | **Returning-user benchmark only.** Has realistic existing files/metadata. Use to measure returning-user login, directory hydration, and RSA decryption cost. **Never mutate or spam data.** |
| **`👥 Dev Bob`** | `handleDevQuickLogin('persistent', 'Dev Bob')` | **Secondary persistent user.** Use only for read-only or carefully cleaned exploratory multi-user / chat / collaboration checks. |

---

## Phase 3: Test Execution Strategy (70% Core Baseline + 30% Open Exploratory)

Allocate ~70% of audit effort to the reproducible baseline matrix and ~30% to open, hypothesis-driven exploration.

### Part A — 70% Core Baseline Test Catalog

1. **Cold Load & Initial Render (`/auth` Dev `:3001` vs. Prod `:3099`)**
   - Desktop `1440×900` (1× CPU) & Mobile `390×844` (4× CPU).
   - Measure: TTFB, FCP, LCP, CLS, Long Tasks (count & ms), TBT, Transfer KB, Request count, DOM Nodes, JS Heap, Script Duration.
2. **Auth & Shell Hydration**
   - `Einmal-Gast` login -> full interactive shell (duration, requests, FPS, initial `/files` / `/tasks` / profile fetches).
   - `Dev Alice` returning login -> detect duplicate `files?recursive=true` or `profiles/*` calls and metadata decryption time.
3. **Notes & TipTap Editor**
   - Create note (single + 8-note batch).
   - Rename title (e.g., 21 chars) -> keystroke latency + listener delta + requests.
   - Type 81 chars -> keystroke-to-paint `p50`/`p95`/`max`, FPS, HTTP request count by endpoint (`crdt-state`, `compact`, `backups`, `backups/10 minutes`).
   - Paste large document (~4,230 chars) + 40 keystrokes -> latency, requests, listener delta.
   - Manual Save / Compaction button -> wait window & requests.
   - Switch notes (Sidebar vs. Tabs) -> duration, requests, FPS, full remount vs. reuse.
   - Delete note -> duration, requests.
   - **Window Focus / Visibility Refetch Check:** Trigger `focus` & `visibilitychange` after editing/switching/deleting multiple notes -> count `crdt-state` bursts and verify whether deleted notes still refetch.
4. **Calendar (`1440×900` Desktop)**
   - Open Calendar (week view, column count).
   - Create event + popover interaction (handle `"Ohne Tag speichern"` if prompted).
   - Edit event (auto-save latency + `PUT` duration).
   - Create 8 events in a batch -> `p50`, Long Tasks, FPS, Script Duration, requests.
   - View switches: Day / Month / Continuous / Week.
   - Week navigation (9 steps forward/back, respecting `useWeekWindow` settle) -> duration, requests, FPS, DOM node delta.
   - Drag-move event & delete event (ensure a visible event is targeted in the active window).
5. **Todos, Search & Settings**
   - Open Todos; create 1 todo & batch 10 todos (`p50`/`max`, requests, FPS); edit, add subtask, check off, delete.
   - Search (`Ctrl+K` + typing query) -> open & keystroke `p50`.
   - Settings modal -> switch across all 8 tabs, measure per-tab latency & requests.
6. **Mobile E2E (`390×844` @ 4× CPU)**
   - Dev & Prod initial load (`LCP`, `TBT`, Long Tasks, Transfer).
   - Mobile Bottom Nav switching (Notes / Calendar / Todos / Search) and Mobile Calendar view switches (Day / Week / Month).
7. **Production Build & Asset Audit (`web/`)**
   - `npm run build` -> total `.next/static/chunks` raw & gzip bytes, chunk count, top 3 largest chunks.
   - Inspect `web/public/` size hotspots (e.g., emoji SVGs, APK binaries, oversized `favicon.png`).
   - Check `web/package.json` dependencies against `web/src/` imports for unused heavy packages (e.g., `recharts`, `@xyflow/react`, `iconsax-react`).
8. **Backend API Micro-Benchmark (`http://localhost:8081`)**
   - Direct Node/HTTP script with `Einmal-Gast` token (always delete created test records afterward):
     - `GET /health`, `GET /auth/me` (`p50`, `p95`).
     - `POST /files` (note creation).
     - Upload `10 KB` & `2 MB` (first upload vs. overwrite) -> verify backup-cascade overhead.
     - Download `2 MB` -> latency + inspect `Content-Encoding`, `Content-Length`, `ETag` headers.
     - File list scaling (`N=10`, `N=50`, `N=150`) -> latency, payload KB, compression check.
     - Concurrency: 20 parallel writes (`MaxOpenConns(1)` contention) & 20 parallel reads (`N=150`), error rate.
     - Tasks / Todos CRUD (`GET`/`POST`/`PATCH`/`DELETE`).

### Part B — 30% Open Exploratory Discovery Phase

Do **not** stop once the baseline script finishes. Spend ~30% of your test budget probing unscripted, realistic, and adversarial scenarios:
- **Re-test prior hotspots & edge cases:** Rapid note-tab thrashing, focus/blur storms after deleting 5+ notes, large documents with KaTeX formulas, tables, mentions, or emojis.
- **Inspect unmeasured or tricky surfaces:** Drag-resizing/moving calendar events, password-protected V2 notes (PBKDF2 600k cost), SearchOverlay index rebuilds on mutation, Chat/SocialHub open/close, WebSocket disconnect/reconnect, offline behavior, heap retention after closing heavy views.
- **Trace symptoms to code:** Whenever a measurement spikes (Long Task, request burst, listener leak, memory climb), inspect the exact `web/src/` or `cloud/` lines so every finding includes concrete `Ursache`, `Beleg`, and `Fix`.
- **Log everything explored:** Even clean/healthy exploratory checks must be recorded in `Methodik & Explorative Befunde` so the reader knows what was verified.

---

## Known Gotchas (Tide-Specific Test Pitfalls)

| Gotcha | What Happens | How to Handle in Audit Scripts |
|---|---|---|
| **`pointer-events: none` ancestors** (`MobileBottomNav`, `SettingsModal`, `globals.css`) | Ancestor containers or overlay layers carry `pointer-events: none` (while inner buttons have `pointer-events: auto`), causing naive Playwright/CDP container clicks or overlay checks to fail or misreport interception. | Target the actual interactive `<button>`/`<a>` element inside the nav/modal, verify hit-testing via `document.elementFromPoint(x, y)` on bounding-box centers, and distinguish selector issues from real user click-blocking bugs. |
| **`"Ohne Tag speichern"` dialog** (`EventPopover.tsx`, `useNoTagPrompt.ts`) | Creating or saving a calendar event without assigning a tag triggers a confirmation prompt `"Ohne Tag speichern"`. | Either select a tag or explicitly detect and click `"Ohne Tag speichern"` in calendar creation/edit flows. |
| **`useWeekWindow` 1500ms scroll settle** (`useWeekWindow.ts`) | Programmatic smooth scrolling in the infinite week calendar defers emitting the settled active date for up to ~1500ms. | Wait for scroll settle (~1500ms or network/DOM idle) after week navigation steps before reading active date or DOM node counts. |
| **429 Auth Rate Limiter** (`cloud` auth middleware) | Auth endpoints enforce strict rate limiting (`0.1 req/s`, burst `5`). Rapid parallel logins or repeated Dev-Login clicks return HTTP `429`. | Reuse tokens across tests within a role, pace sequential Dev-Logins, and implement retry/backoff on `429` (note any `429` hits in Methodology). |

---

## Phase 4: Dual Deliverables & Scoring Rules

### Deliverable 1: `docs/audit/YYYY-MM-DD-performance-audit.md`
Write a comprehensive engineering Markdown report containing:
1. **Executive Summary & Score Delta** (Overall score `Vorher -> Jetzt`, domain score breakdown, key improvements & regressions).
2. **Environment & Methodology** (Commit/worktree, Dev `:3001`, Prod `:3099`, Backend `:8081`, Chrome/Playwright version, 70% Baseline + 30% Exploratory scope, caveats).
3. **Comparison Against Previous Audit** (Status tracking of every prior finding: Behoben / Teilweise behoben / Offen / Regrediert).
4. **Detailed Findings by Severity** (`Kritisch`, `Hoch`, `Mittel`, `Behoben / Gut`), each with measured evidence, exact `file:line` root cause, and concrete fix recommendation.
5. **Measurement Tables (`Vorher` | `Jetzt` | `Delta / Bewertung`)**:
   - Desktop Actions (`1440×900`)
   - Calendar Metrics
   - Mobile (`390×844 @ 4× CPU`)
   - Production vs. Dev & Bundle/Asset Audit
   - Backend Direct Benchmark (`:8081`)
   - Code Hotspots (static/unmeasured observations)
6. **Exploratory Discovery Log** (scenarios tested, observations, new issues or confirmed clean areas).
7. **Prioritized Action Plan** (impact, effort, target files).

### Deliverable 2: `docs/audit/YYYY-MM-DD-performance-audit.html`
Generate a **self-contained HTML5 visual dashboard** (no external CSS/JS/font CDNs required; inline `<style>` only) strictly adhering to the blueprint below.

#### HTML Dashboard Checklist (Must Include All Sections)
- **`.card.hero`**: Conic-gradient `.ring` (`style="--p:XX%"`, `--ok` for ≥75, `--warn` for 50–74, `--bad` for <50) with **Current Score**, `von 100`, **Previous Score & `+X / -X Punkte` delta badge** (`.tag.t-ok|t-warn|t-bad`), and concise executive summary.
- **`Score je Bereich`**: `.card` containing `.bar` rows with `.track` / `.fill.ok|.mid|.bad` (`ok` ≥70, `mid` 45–69, `bad` <45) and explicit **`Vorher → Jetzt (±Delta)`** right-hand column.
- **`Wichtigste Zahlen`**: `.grid.g4` of `.card.kpi` showing current KPI value, description, and **`Vorher: ... · Δ ...`** comparison line.
- **`Befunde nach Schwere`**:
  - `.find` (`<span class="tag t-bad">Kritisch</span>` or `Hoch`)
  - `.find.w` (`<span class="tag t-warn">Mittel</span>` or `Hoch`)
  - `.find.o` (`<span class="tag t-ok">Behoben</span>` / `<span class="tag t-ok">Gut</span>` for resolved findings since last audit & healthy areas)
  - Every finding card must clearly include **`Ursache:`**, **`Beleg:`**, and **`Fix:`** (or **`Status:`** for resolved/good items).
- **Delta Comparison Tables** (all featuring `Vorher`, `Jetzt`, and `Delta / Bewertung` with `.tag.t-ok`, `.tag.t-warn`, `.tag.t-bad`):
  1. `Gemessene Aktionen Desktop (1440×900)`
  2. `Kalender`
  3. `Mobile 390×844 @ 4× CPU`
  4. `Produktion vs. Dev & Bundle`
  5. `Backend-Messung :8081`
  6. `Empfohlene Maßnahmen`
- **`Methodik & Explorative Befunde`**: Documents both the standardized 70% benchmark run (environment, runs, cleanup, limitations) and what the agent uncovered during the 30% free exploration phase.

---

## Complete HTML Dashboard Blueprint & CSS Design System

Use this exact HTML5 + inline CSS template when generating `docs/audit/YYYY-MM-DD-performance-audit.html`. Replace bracketed placeholders (`{{...}}`) with real measured values and delta comparisons; never invent or extrapolate unmeasured numbers.

```html
<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Tide – Performance-Audit {{DATE_DE}}</title>
<style>
:root{--bg:#fff;--surface:#f6f6f7;--ink:#0e0e10;--ink2:#52525b;--ink3:#a1a1aa;--line:#e4e4e7;--accent:#2f3138;
--ok:#2e7d32;--okbg:#e8f5e9;--warn:#8a4b00;--warnbg:#fff3e0;--bad:#b42318;--badbg:#fdecea;--r:14px}
*{box-sizing:border-box}
body{margin:0;background:var(--surface);color:var(--ink);font:15px/1.55 'Inter',system-ui,-apple-system,sans-serif;-webkit-font-smoothing:antialiased}
.wrap{max-width:1080px;margin:0 auto;padding:40px 24px 80px}
h1{font-size:30px;margin:0 0 4px;letter-spacing:-.02em}
h2{font-size:20px;margin:44px 0 14px;letter-spacing:-.01em;border-bottom:2px solid var(--ink);padding-bottom:6px}
h3{font-size:15px;margin:0 0 6px}
.sub{color:var(--ink2);margin:0 0 24px}
.card{background:var(--bg);border:1px solid var(--line);border-radius:var(--r);padding:20px;box-shadow:0 4px 16px rgba(17,24,39,.06)}
.grid{display:grid;gap:16px}.g2{grid-template-columns:repeat(auto-fit,minmax(300px,1fr))}.g4{grid-template-columns:repeat(auto-fit,minmax(200px,1fr))}
.mono,.num{font-family:'JetBrains Mono',ui-monospace,monospace;font-variant-numeric:tabular-nums}
.hero{display:grid;grid-template-columns:200px 1fr;gap:24px;align-items:center}
@media(max-width:640px){.hero{grid-template-columns:1fr}}
.ring{width:180px;height:180px;border-radius:50%;display:grid;place-items:center;background:conic-gradient(var(--ring-color,var(--warn)) 0 var(--p),var(--line) var(--p) 100%)}
.ring div{width:140px;height:140px;border-radius:50%;background:#fff;display:grid;place-items:center;text-align:center}
.ring b{font-size:44px;line-height:1}.ring span{font-size:12px;color:var(--ink2)}
.kpi b{display:block;font-size:26px;letter-spacing:-.02em}.kpi span{color:var(--ink2);font-size:13px;display:block}
.kpi .delta{margin-top:6px;font-size:12px;color:var(--ink2)}
.bar{display:grid;grid-template-columns:200px 1fr 150px;gap:10px;align-items:center;margin:8px 0;font-size:14px}
.bar .num{text-align:right;white-space:nowrap;font-size:13px}
@media(max-width:640px){.bar{grid-template-columns:1fr;gap:4px}.bar .num{text-align:left}}
.track{height:12px;background:var(--line);border-radius:6px;overflow:hidden}.fill{height:100%;border-radius:6px}
.ok{background:#2e7d32}.mid{background:#d98a00}.bad{background:#b42318}
table{width:100%;border-collapse:collapse;font-size:13.5px}
th,td{text-align:left;padding:8px 10px;border-bottom:1px solid var(--line);vertical-align:top}
th{font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:var(--ink2)}
td.r,th.r{text-align:right}
.tag{display:inline-block;padding:1px 9px;border-radius:99px;font-size:12px;font-weight:600;white-space:nowrap}
.t-ok{background:var(--okbg);color:var(--ok)}.t-warn{background:var(--warnbg);color:var(--warn)}.t-bad{background:var(--badbg);color:var(--bad)}
.find{border-left:4px solid var(--bad);padding:14px 16px;background:#fff;border-radius:0 var(--r) var(--r) 0;border:1px solid var(--line);border-left-width:4px;margin-bottom:12px}
.find.w{border-left-color:#d98a00}.find.o{border-left-color:var(--ok)}
.find p{margin:4px 0;color:var(--ink2)}code{background:var(--surface);padding:1px 6px;border-radius:5px;font-size:12.5px}
.note{background:var(--warnbg);color:var(--warn);padding:12px 16px;border-radius:10px;font-size:13.5px;margin:12px 0}
footer{margin-top:48px;color:var(--ink3);font-size:12.5px}
@media print{body{background:#fff}.card{box-shadow:none}}
</style>
</head>
<body><div class="wrap">

<h1>Tide – Performance-Audit</h1>
<p class="sub">{{DATE_DE}} · Vergleich gegen {{PREV_DATE_DE}} · Dev (:3001) &amp; Prod (:3099) gegen Go-Backend (:8081) · Headless Chromium · Commit <code>{{COMMIT_SHA}}</code></p>

<div class="card hero">
  <!-- Set --ring-color to var(--ok) >=75, var(--warn) 50-74, var(--bad) <50 -->
  <div class="ring" style="--p:{{SCORE_NOW}}%;--ring-color:{{RING_COLOR}}"><div><b>{{SCORE_NOW}}</b><span>von 100</span></div></div>
  <div>
    <h3>Gesamtbewertung: {{VERDICT_LABEL}} <span class="tag {{DELTA_TAG_CLASS}} num">Vorher {{SCORE_PREV}} → {{SCORE_NOW}} ({{SCORE_DELTA_SIGNED}} Punkte)</span></h3>
    <p style="margin:6px 0 0;color:var(--ink2)">{{HERO_SUMMARY}}</p>
  </div>
</div>

<div class="note"><b>Hinweise zur Vergleichbarkeit:</b> {{ENVIRONMENT_CAVEATS}}</div>

<h2>Score je Bereich</h2>
<div class="card">
  <!-- Repeat .bar per domain; .fill uses ok (>=70), mid (45-69), bad (<45) -->
  <div class="bar"><span>Backend-API</span><div class="track"><div class="fill ok" style="width:{{S_API_NOW}}%"></div></div><b class="num">{{S_API_PREV}} → {{S_API_NOW}} ({{S_API_DELTA}})</b></div>
  <div class="bar"><span>Todos</span><div class="track"><div class="fill ok" style="width:{{S_TODO_NOW}}%"></div></div><b class="num">{{S_TODO_PREV}} → {{S_TODO_NOW}} ({{S_TODO_DELTA}})</b></div>
  <div class="bar"><span>Suche / Einstellungen</span><div class="track"><div class="fill ok" style="width:{{S_SEARCH_NOW}}%"></div></div><b class="num">{{S_SEARCH_PREV}} → {{S_SEARCH_NOW}} ({{S_SEARCH_DELTA}})</b></div>
  <div class="bar"><span>Erstladen (Produktion)</span><div class="track"><div class="fill ok" style="width:{{S_PROD_NOW}}%"></div></div><b class="num">{{S_PROD_PREV}} → {{S_PROD_NOW}} ({{S_PROD_DELTA}})</b></div>
  <div class="bar"><span>Kalender</span><div class="track"><div class="fill mid" style="width:{{S_CAL_NOW}}%"></div></div><b class="num">{{S_CAL_PREV}} → {{S_CAL_NOW}} ({{S_CAL_DELTA}})</b></div>
  <div class="bar"><span>Notiz-Editor (Tippen)</span><div class="track"><div class="fill mid" style="width:{{S_NOTE_NOW}}%"></div></div><b class="num">{{S_NOTE_PREV}} → {{S_NOTE_NOW}} ({{S_NOTE_DELTA}})</b></div>
  <div class="bar"><span>Mobile (4× CPU)</span><div class="track"><div class="fill mid" style="width:{{S_MOB_NOW}}%"></div></div><b class="num">{{S_MOB_PREV}} → {{S_MOB_NOW}} ({{S_MOB_DELTA}})</b></div>
  <div class="bar"><span>Netzwerk-Effizienz</span><div class="track"><div class="fill bad" style="width:{{S_NET_NOW}}%"></div></div><b class="num">{{S_NET_PREV}} → {{S_NET_NOW}} ({{S_NET_DELTA}})</b></div>
  <div class="bar"><span>Speicher / Listener</span><div class="track"><div class="fill bad" style="width:{{S_MEM_NOW}}%"></div></div><b class="num">{{S_MEM_PREV}} → {{S_MEM_NOW}} ({{S_MEM_DELTA}})</b></div>
</div>

<h2>Wichtigste Zahlen</h2>
<div class="grid g4">
  <div class="card kpi"><b class="num">{{KPI_1_NOW}}</b><span>{{KPI_1_LABEL}}</span><div class="delta">Vorher: <span class="num">{{KPI_1_PREV}}</span> · <span class="tag {{KPI_1_TAG}} num">{{KPI_1_PCT}}</span></div></div>
  <div class="card kpi"><b class="num">{{KPI_2_NOW}}</b><span>{{KPI_2_LABEL}}</span><div class="delta">Vorher: <span class="num">{{KPI_2_PREV}}</span> · <span class="tag {{KPI_2_TAG}} num">{{KPI_2_PCT}}</span></div></div>
  <div class="card kpi"><b class="num">{{KPI_3_NOW}}</b><span>{{KPI_3_LABEL}}</span><div class="delta">Vorher: <span class="num">{{KPI_3_PREV}}</span> · <span class="tag {{KPI_3_TAG}} num">{{KPI_3_PCT}}</span></div></div>
  <div class="card kpi"><b class="num">{{KPI_4_NOW}}</b><span>{{KPI_4_LABEL}}</span><div class="delta">Vorher: <span class="num">{{KPI_4_PREV}}</span> · <span class="tag {{KPI_4_TAG}} num">{{KPI_4_PCT}}</span></div></div>
  <div class="card kpi"><b class="num">{{KPI_5_NOW}}</b><span>{{KPI_5_LABEL}}</span><div class="delta">Vorher: <span class="num">{{KPI_5_PREV}}</span> · <span class="tag {{KPI_5_TAG}} num">{{KPI_5_PCT}}</span></div></div>
  <div class="card kpi"><b class="num">{{KPI_6_NOW}}</b><span>{{KPI_6_LABEL}}</span><div class="delta">Vorher: <span class="num">{{KPI_6_PREV}}</span> · <span class="tag {{KPI_6_TAG}} num">{{KPI_6_PCT}}</span></div></div>
  <div class="card kpi"><b class="num">{{KPI_7_NOW}}</b><span>{{KPI_7_LABEL}}</span><div class="delta">Vorher: <span class="num">{{KPI_7_PREV}}</span> · <span class="tag {{KPI_7_TAG}} num">{{KPI_7_PCT}}</span></div></div>
  <div class="card kpi"><b class="num">{{KPI_8_NOW}}</b><span>{{KPI_8_LABEL}}</span><div class="delta">Vorher: <span class="num">{{KPI_8_PREV}}</span> · <span class="tag {{KPI_8_TAG}} num">{{KPI_8_PCT}}</span></div></div>
</div>

<h2>Befunde nach Schwere</h2>

<div class="find"><h3><span class="tag t-bad">Kritisch</span> 1 · {{FINDING_TITLE}}</h3>
<p>{{FINDING_SUMMARY}}</p>
<p><b>Ursache:</b> {{ROOT_CAUSE_WITH_FILE_LINE}}</p>
<p><b>Beleg:</b> {{MEASURED_EVIDENCE_AND_DELTA}}</p>
<p><b>Fix:</b> {{ACTIONABLE_FIX}}</p></div>

<div class="find w"><h3><span class="tag t-warn">Mittel</span> 2 · {{FINDING_TITLE}}</h3>
<p>{{FINDING_SUMMARY}}</p>
<p><b>Ursache:</b> {{ROOT_CAUSE_WITH_FILE_LINE}}</p>
<p><b>Beleg:</b> {{MEASURED_EVIDENCE_AND_DELTA}}</p>
<p><b>Fix:</b> {{ACTIONABLE_FIX}}</p></div>

<div class="find o"><h3><span class="tag t-ok">Behoben / Gut</span> 3 · {{RESOLVED_OR_HEALTHY_TITLE}}</h3>
<p>{{WHAT_CHANGED_SINCE_PREV_AUDIT}}</p>
<p><b>Ursache:</b> {{WHY_IT_IMPROVED_OR_IS_HEALTHY}}</p>
<p><b>Beleg:</b> {{BEFORE_AFTER_NUMBERS}}</p>
<p><b>Fix:</b> {{NONE_OR_FOLLOWUP}}</p></div>

<h2>Gemessene Aktionen Desktop (1440×900)</h2>
<div class="card" style="overflow-x:auto"><table>
<thead><tr><th>Aktion</th><th class="r">Vorher</th><th class="r">Jetzt</th><th class="r">Requests (Vorher → Jetzt)</th><th class="r">FPS</th><th>Delta / Bewertung</th></tr></thead><tbody>
<tr><td>{{ACTION_NAME}}</td><td class="r num">{{PREV_VAL}}</td><td class="r num">{{NOW_VAL}}</td><td class="r num">{{PREV_REQ}} → {{NOW_REQ}}</td><td class="r num">{{FPS_NOW}}</td><td><span class="tag {{TAG_CLASS}}">{{DELTA_OR_STATUS}}</span></td></tr>
</tbody></table></div>

<h2>Kalender</h2>
<div class="card" style="overflow-x:auto"><table>
<thead><tr><th>Szenario (Desktop &amp; Ansichtswechsel)</th><th class="r">Vorher</th><th class="r">Jetzt</th><th class="r">Requests / Long Tasks</th><th class="r">FPS</th><th>Delta / Bewertung</th></tr></thead><tbody>
<tr><td>{{CAL_ACTION}}</td><td class="r num">{{PREV_VAL}}</td><td class="r num">{{NOW_VAL}}</td><td class="r num">{{REQ_LT}}</td><td class="r num">{{FPS_NOW}}</td><td><span class="tag {{TAG_CLASS}}">{{DELTA_OR_STATUS}}</span></td></tr>
</tbody></table></div>

<h2>Mobile 390×844 @ 4× CPU</h2>
<div class="card" style="overflow-x:auto"><table>
<thead><tr><th>Metrik / Interaktion</th><th class="r">Vorher</th><th class="r">Jetzt</th><th>Delta / Bewertung</th></tr></thead><tbody>
<tr><td>{{MOBILE_METRIC}}</td><td class="r num">{{PREV_VAL}}</td><td class="r num">{{NOW_VAL}}</td><td><span class="tag {{TAG_CLASS}}">{{DELTA_OR_STATUS}}</span></td></tr>
</tbody></table></div>

<h2>Produktion vs. Dev &amp; Bundle</h2>
<div class="card" style="overflow-x:auto"><table>
<thead><tr><th>Messpunkt (:3099 Prod / :3001 Dev / Build)</th><th class="r">Vorher</th><th class="r">Jetzt</th><th>Delta / Bewertung</th></tr></thead><tbody>
<tr><td>{{BUNDLE_OR_PROD_METRIC}}</td><td class="r num">{{PREV_VAL}}</td><td class="r num">{{NOW_VAL}}</td><td><span class="tag {{TAG_CLASS}}">{{DELTA_OR_STATUS}}</span></td></tr>
</tbody></table></div>

<h2>Backend-Messung :8081</h2>
<div class="card" style="overflow-x:auto"><table>
<thead><tr><th>Endpunkt / Lasttest</th><th class="r">Vorher</th><th class="r">Jetzt</th><th>Delta / Bewertung</th></tr></thead><tbody>
<tr><td>{{ENDPOINT_NAME}}</td><td class="r num">{{PREV_P50_P95}}</td><td class="r num">{{NOW_P50_P95}}</td><td><span class="tag {{TAG_CLASS}}">{{DELTA_OR_STATUS}}</span></td></tr>
</tbody></table></div>

<h2>Empfohlene Maßnahmen</h2>
<div class="card" style="overflow-x:auto"><table>
<thead><tr><th>#</th><th>Maßnahme</th><th>Vorher (Status)</th><th>Jetzt / Ziel-Effekt</th><th>Aufwand / Priorität</th></tr></thead><tbody>
<tr><td>1</td><td>{{ACTION_ITEM}}</td><td>{{PREV_STATUS}}</td><td>{{EXPECTED_IMPACT}}</td><td><span class="tag {{TAG_CLASS}}">{{EFFORT_PRIO}}</span></td></tr>
</tbody></table></div>

<h2>Methodik &amp; Explorative Befunde</h2>
<div class="card" style="font-size:14px">
<ul style="margin:0;padding-left:20px;color:var(--ink2)">
<li><b>Standardisierter Benchmark (70 %):</b> {{BASELINE_METHODOLOGY}}</li>
<li><b>Explorative Entdeckungsphase (30 %):</b> {{EXPLORATORY_SCENARIOS_AND_FINDINGS}}</li>
<li><b>Testdaten &amp; Hygiene:</b> {{ACCOUNT_USAGE_AND_CLEANUP}}</li>
<li><b>Bekannte Messbesonderheiten &amp; Grenzen:</b> {{GOTCHAS_AND_LIMITATIONS}}</li>
</ul></div>

<footer>Erstellt am {{DATE_DE}} · Markdown-Vollbericht: <code>docs/audit/{{DATE_ISO}}-performance-audit.md</code> · Vorheriger Stand: <code>{{PREV_AUDIT_FILE}}</code></footer>
</div></body></html>
```

---

## Final Verification Before Completing the Audit

1. Verify both `docs/audit/YYYY-MM-DD-performance-audit.md` and `docs/audit/YYYY-MM-DD-performance-audit.html` exist and contain identical, consistent numbers.
2. Confirm every number in both deliverables matches observed tool output (never fill gaps with estimates; mark unmeasured items explicitly as `nicht gemessen`).
3. Confirm all synthetic test data on `:8081` is deleted and `Dev Alice` / `Dev Bob` were left clean.
4. Note whether `docs/audit/` files should be committed per `AGENTS.md` (`~ commit` / `~ push` rules).
