# Tide – Performance-Audit (24.11.2026)

> **Datum:** 24.11.2026  
> **Ziel-Commit:** `ab07e53` (Merge `origin/main` inkl. `d56ff3f` & `77e3296`)  
> **Vergleichs-Baseline:** [`docs/audit/2026-11-23-performance-audit.html`](./2026-11-23-performance-audit.html) (23.11.2026, Commit `9cd3b21`)  
> **Testumgebung:**
> - **Backend:** Go-Server auf `http://localhost:8081` (SQLite WAL + BlobStore)
> - **Frontend Dev:** Next.js 16.4.6 (Turbopack, unminifiziert, React StrictMode) auf `http://localhost:3001`
> - **Frontend Prod:** Next.js `next build` + `next start` auf `http://localhost:3099`
> - **Browser-Harness:** Chrome Headless via Chrome DevTools Protocol (CDP `Performance.getMetrics`, `PerformanceObserver`, `requestAnimationFrame`-Sampler, Network & WebSocket-Tracing)
> - **Test-Accounts:** `Einmal-Gast` (frischer Wegwerf-Dev-Account) & `Dev Alice` (Returning User mit Bestandsdaten)
> - **Umgebungshinweis (`SERVER_MASTER_KEY`):** Für den Login bestehender Dev-Accounts (`Dev Alice` / `Dev Bob`) muss im Go-Backend der `SERVER_MASTER_KEY=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef` aus `docker-compose.yml` gesetzt sein. Ohne diesen Key schlägt `POST /api/v1/auth/dev-login` für `Dev Alice` mit HTTP `500` (`"Failed to decrypt pepper"`) fehl (beobachtet in Lauf `31` vor Nachkonfiguration; im Gap-Closer-Lauf mit gesetztem Key erfolgreich verifiziert).

---

## 1. Executive Summary & Gesamt-Score

| Kennzahl | 23.11.2026 (`9cd3b21`) | 24.11.2026 (`ab07e53`) | Delta |
|---|---:|---:|---:|
| **Gesamt-Score** | **55 / 100** | **74 / 100** | **+19 Punkte** |
| **Gesamtbewertung** | Ausbaufähig (kritische Leaks & Request-Stürme) | Solide verbessert; zentrale Leaks & Kompression behoben, UI-Hauptthread & `fetchDirectory`-Kaskaden offen | +34,5 % relativ |

### Kernaussagen
1. **Die drei kritischsten Lecks vom 23.11. sind behoben:**
   - Die per-Tastendruck-Compaction-Kaskade (`330–334` Requests für 81 Zeichen) fiel auf **2 Requests während des Tippens** (bzw. **16 Requests** inkl. Nachlauf/Autosave; **−95 % bis −99,4 %**).
   - Das `YjsE2EEProvider`-Lifecycle-Leak unter React StrictMode wurde geschlossen: Fenster-Fokus erzeugt **0 statt 23 `crdt-state`-Refetches (−100 %)**; das Listener-Delta beim Titel-Umbenennen sank von `+7.800` auf `+26` netto (in der Einzelmessung der Gap-Verifikation; Hinweis zur Dev-StrictMode-Streuung siehe Abschnitt 6).
   - `apiFetch` dedupliziert gleichzeitige identische `GET`-Anfragen per `inflightGets`-Map (`web/src/lib/api.ts:210-227`).
2. **Produktions-Erstladen & Netzwerk-Wire-Größe massiv verbessert:**
   - Gzip-Kompression (`middleware.Compress(5)` in `cloud/cmd/server/main.go:250`) reduziert JSON-Payloads auf der Leitung um **80 % bis 90 %** (z. B. `N=150` Dateiliste: `70 KB` roh → gzip-komprimiert; `N=10`: `4.660 B → 707 B`, `N=50` Events: `11.693 B → 1.207 B`).
   - Lazy Loading (`next/dynamic` in `DashboardDesktopContent.tsx` & `DashboardModals.tsx`) verkleinerte die Top-3-Produktions-Chunks um **−27,2 %** (`2,76 MB → 2,01 MB`).
   - Mobiles Produktions-Erstladen (`/auth`, 4× CPU-Drosselung) sank bei FCP/LCP von **3.236 ms auf 204 ms (−93,7 %)** und bei TBT von **140 ms auf 87 ms (−37,9 %)**.
3. **Neues Hauptproblem identifiziert (`fetchDirectory`-Viererpack):**
   - Nach jeder Todo- oder Kalender-Mutation (über `useRealtimeSync` / Store-Refreshes) feuert das Frontend einen ungedrosselten Viererpack (`GET /api/v1/files`, `GET /api/v1/files?type=event`, `GET /api/v1/tasks`, `GET /api/v1/todos?limit=500&include_archived=true`). Bei 8 Kalendereinträgen (`C4`) entstehen **22× Viererpacks = 88 redundante GETs**; bei 10–12 Todos (`22`/`C9`) **10–11× Viererpacks = 40–44 redundante GETs**.
4. **Hauptthread-Arbeit im Editor und Kalender bremst weiterhin FPS:**
   - Tippen im Editor verursacht weiterhin Long Tasks (`37` Long Tasks / `3.647 ms` in `05`, p50 Taste-zu-Bild `73,4 ms`, p95 `210 ms`, `39,6 FPS`), und Notiz-Wechsel (`09`) remountet `<CollaborativeEditor key={props.activeTabId}>` komplett (`23,6 FPS`, `71` Requests).

---

## 2. Health Scorecard (Bereichs-Scores Vorher vs. Nachher)

| Bereich | 23.11.2026 (`9cd3b21`) | 24.11.2026 (`ab07e53`) | Delta | Bewertung / Treiber |
|---|---:|---:|---:|---|
| **Backend-API** | 92 | **95** | **+3** | Gzip aktiv (`Compress(5)`), neue DB-Indizes (`idx_files_owner_type`, Soft-Delete), p50 `0,5–3,4 ms` |
| **Erstladen (Produktion)** | 75 | **92** | **+17** | Mobile FCP/LCP `3.236 ms → 204 ms` (−93,7 %), Desktop `260 ms → 196 ms` (−24,6 %), Top-3-Chunks −27,2 % |
| **Suche / Einstellungen** | 80 | **88** | **+8** | Fuse-Index lazy bei geöffnetem Overlay (`isOpen`), Settings per `next/dynamic`, 8 Tabs je `70–250 ms` |
| **Todos** | 78 | **76** | **−2** | Solide Einzellatenz, aber `fetchDirectory`-Viererpack bei jeder Mutation (`40–44` redundante GETs in `22`/`C9`) |
| **Speicher / Listener** | 25 | **75** | **+50** | Provider-Leak & StrictMode-Doppelinstanzen behoben; 0 geleakte Fokus-Refetches |
| **Netzwerk-Effizienz** | 25 | **70** | **+45** | Per-Keystroke-Sturm (−95–99 %) & `crdt-state`-Fokus-Sturm (−100 %) behoben; Gzip aktiv; Viererpack offen |
| **Kalender** | 55 | **64** | **+9** | `useCalendarDragResize`-Listener stabilisiert (`C7` Drag `53,3–54,1 FPS`), aber `C4` hat `22×` Viererpacks & `9.340` Nodes in `C6` |
| **Mobile (390×844 @ 4× CPU)** | 40 | **58** | **+18** | Prod `/auth` FCP massiv schneller (`204 ms`), aber Dev-Hydration & Tab/Subview-Wechsel (`320–526 ms`) noch schwer |
| **Notiz-Editor (Tippen & Wechsel)** | 42 | **52** | **+10** | Netzwerk sauber, aber `editorContent`/`editorVersion` im Root-State, `BlockId`/Decoration-Rebuilds & Editor-Remount bremsen |
| **Gesamt-Score** | **55** | **74** | **+19** | |

---

## 3. Top-KPI-Vergleichstabelle (23.11. vs. 24.11.)

| KPI | 23.11.2026 (`9cd3b21`) | 24.11.2026 (`ab07e53`) | Veränderung |
|---|---:|---:|---|
| **Tippen 81 Zeichen — HTTP-Requests** (`05`) | 330–334 | **2** während Tippen / **16** inkl. Nachlauf | **−95 % bis −99,4 %** |
| **Paste 4.373 Zeichen + 40 Tasten — HTTP-Requests** (`06`) | 169 | **2** während Tippen / **6** gesamt | **−96,4 % bis −98,8 %** |
| **Listener-Delta beim Titel-Rename** (`04`) | +7.800 | **+26 netto** *(nach Cleanup; Dev-StrictMode-Zwischenspitze in `04`: +7.170 vor GC/Cleanup)* | **−99,7 % netto** |
| **Window Focus `crdt-state` Refetches** (`29`) | 23 | **0** | **−100 %** |
| **Window Focus Gesamt-Requests** (`29`) | 26–33 | **13–16** | **−50 % bis −52 %** |
| **API Gzip-Kompression** | 0 % (aus) | **Aktiv** (`Compress(5)`) | **−80 % bis −90 % Wire-Payload** |
| **Prod `/auth` Mobile (4× CPU) FCP / LCP** (`P2`) | 3.236 ms | **204 ms** | **−93,7 %** |
| **Prod `/auth` Mobile (4× CPU) TBT** (`P2`) | 140 ms | **87 ms** | **−37,9 %** |
| **Prod `/auth` Desktop (1× CPU) FCP / LCP** (`P1`) | 260 ms | **196 ms** | **−24,6 %** |
| **Prod Bundle (`.next/static/chunks`)** | 4,81 MB roh / 1,44 MB gz (52 Dateien, Top 3: 2,76 MB) | **4,51 MB roh / 1,38 MB gz** (64 Dateien, Top 3: **2,01 MB** = 1.079 KB + 556 KB + 370 KB)* | **Top 3: −27,2 %** |

*\*Hinweis zum Produktions-Build-Stand: In den Build-Scans vor/nach Finalisierung zeigten die reinen App-Chunks `4,51 MB roh / 1,38 MB gz` (64 Dateien; Top 3 = `1.079 KB + 556 KB + 370 KB = 2,01 MB`). In der späteren Gesamtzählung über sämtliche Dateien unter `web/.next/static/chunks` inkl. CSS (`6` CSS-Dateien = `183,4 KB`) liegen insgesamt `68` JS-Dateien (`4.624 KB` / `4,52 MB`) bzw. `70` Dateien (`4,69 MB` inkl. Runtime-Manifests) vor; die Top-3-JS-Chunks bleiben identisch (`1.079,4 KB + 556,2 KB + 370,2 KB = 2.005,8 KB ≈ 2,01 MB`).*

---

## 4. Vollständige Messwert-Tabellen (Vorher → Jetzt)

### 4.1 Desktop: Auth, Notizen, Todos, Suche, Einstellungen, Focus (`01`–`11`, `20`–`29`, `31`)

Messungen gegen `http://localhost:3001` (Dev-Server, Viewport `1440×900`, Chrome Headless via CDP).

| ID | Aktion | Dauer (23.11. → 24.11.) | Requests (23.11. → 24.11.) | API-Breakdown (24.11., ohne `OPTIONS`) | FPS (23. → 24.) | Long Tasks (24.11.) | Heap / DOM-Nodes / Listener-Delta (24.11.) |
|---|---|---|---|---|---|---|---|
| `01` | Cold-Load `/auth` (Dev) | 1,17–1,80 s → **1.194 ms** | 14 → **13** | `0` API-Calls (nur Assets, `4,57 MB` Dev-Transfer) | – → **–** | 1 (260 ms) | 30,61 MB / 292 / +788 |
| `02` | Dev-Login Einmal-Gast → Shell | 2,0–3,0 s → **4.243 ms** *(Shell 1.716 ms)* | 40 → **49** *(A0: 63)* | `2× dev-login`, `3× tasks`, `3× todos`, `2× files?recursive`, `2× event?recursive`, `settings`, `workspaces`, `profiles`, `views`, `index`, `heartbeat`, `events` SSE, `version` | 53 → **50,5** | 7 (715 ms) | 67,09 MB / 2.314 / +1.789 |
| `31` | Dev-Login `Dev Alice` (Returning) | 1,3 s bis Shell (55 Reqs) → **5.487 ms** *(Shell 1.350 ms)* | 55 → **64** *(9,61 MB Dev-Transfer)* | `1× dev-login`, `1× files`, `1× event`, `3× tasks`, `3× todos`, `2× files?recursive`, `2× event?recursive`, `settings`, `workspaces`, `profiles`, `views`, `index`, `heartbeat`, `version`, `1× PUT files/:id` | – → **–** | 9 (1.089 ms) | 73,10 MB / 2.454 / +2.976 |
| `03` | Erste Notiz anlegen + TipTap/WS | 1,9–2,0 s → **2.769 ms** | 24 → **33** | `2× POST files`, `2× upload`, `3× download`, `2× ws-ticket`, `1× crdt-state`, `3× variables`, `2×` Viererpack | 48 → **37,2** | 11 (1.307 ms) | 70,88 MB / 2.253 / −731 |
| `04` | Titel umbenennen (21 Zeichen) | p50 62–74 ms → **p50 80,2 ms** *(p95 182 ms; 3.683 ms ges.)* | 11 → **14** | `1× POST files`, `1× upload`, `1× download`, `1× PUT files/:id`, `2×` Viererpack | 50 → **47,3** | 9 (784 ms) | 88,48 MB / 2.392 / +26 netto *(Dev-Spitze +7.170)* |
| `05` | 81 Zeichen tippen | p50 59 ms / p95 117–149 ms → **p50 73,4 ms / p95 210 ms** *(9.518 ms ges.)* | 330–334 → **2 / 16** | `2× compact`, `2× PUT files/:id`, `2× index`, `2×` Viererpack | 50 → **39,6** | 37 (3.647 ms) | 145,39 MB / 2.607 / +12.442 |
| `06` | 4.230 Z. einfügen + 40 Tasten (4.373 Z.) | p50 55 ms / p95 118–158 ms → **p50 87,5 ms / p95 181,5 ms** *(5.773 ms ges.)* | 169 → **2 / 6** | `1× PUT files/:id`, `1× index`, `1×` Viererpack | 50 → **35,6** | 29 (2.699 ms) | 155,00 MB / 2.921 / +6.322 |
| `07` | Speichern-Button (Kompaktierung) | 1,6 s → **1.632 ms** | 2–3 → **0** | `0` Requests (kein Dirty-State nach vorherigem Autosave) | 57–60 → **58,0** | 1 (55 ms) | 162,43 MB / 2.978 / +209 |
| `08` | 8 Notizen anlegen (Batch) | p50 500–580 ms → **p50 934 ms** *(max 1.587 ms; 8.680 ms ges.)* | 170–173 → **150** | `5× POST files`, `5× upload`, `14× PUT`, `15× download`, `10× ws-ticket`, `6× crdt-state`, `10× variables`, `1× compact`, `1× backups`, `12×` Viererpack | 36 → **20,5** | 32 (3.682 ms) | 81,15 MB / 2.616 / −24.250 |
| `09` | Notiz wechseln (Sidebar / Tab) | 480 / 310 ms → **p50 583 / 408 ms** *(4.456 ms ges.)* | 72–82 → **71** | `6× crdt-state`, `12× ws-ticket`, `7× download`, `6× variables`, `5× PUT`, `6×` Viererpack, `1× DELETE` | 35 → **23,6** | 16 (2.136 ms) | 114,75 MB / 4.098 / +15.082 |
| `10` | Ordner anlegen (`Neuer Ordner`) | – → **übersprungen** *(9 ms)* | – → **0** | Button im aktuellen View nicht sichtbar | – → **–** | 0 (0 ms) | 114,92 MB / 4.098 / 0 |
| `11` | Notiz löschen | 1,5 s → **1.543 ms** | 6 → **7** | `1× PUT files/:id`, `1× download`, `1× variables`, `1×` Viererpack | 53 → **52,0** | 2 (178 ms) | 116,55 MB / 4.209 / +981 |
| `20` | Todos öffnen | 0,49–0,56 s → **561 ms** | 0 → **12** | `1× download`, `1× PUT`, `1× variables`, `2×` Viererpack | 41 → **48,0** | 1 (62 ms) | 92,34 MB / 2.764 / +1.393 |
| `21` | Todo anlegen (einzeln) | 0,56–1,16 s → **653 ms** | 6–7 → **9** | `1× POST todos`, `1× POST files`, `1× variables`, `1×` Viererpack | 50–56 → **44,6** | 2 (221 ms) | 99,22 MB / 2.963 / +690 |
| `22` | 10 Todos anlegen (Batch) | p50 296 ms (max 439 ms) → **p50 367 ms** *(max 539 ms; 4.137 ms ges.)* | 11 → **56** | `10× POST todos`, `11×` Viererpack (`44` GETs), `1× download`, `1× PUT` | 52 → **38,8** | 18 (1.584 ms) | 102,42 MB / 3.579 / +1.716 |
| `23` | Todo Detail-Pane öffnen & editieren | 1,0 s → **1.430 ms** | 9 → **14** | `3× PUT todos/:id`, `1× PUT files/:id`, `2×` Viererpack | 45–60 → **34,6** | 5 (514 ms) | 100,98 MB / 3.683 / +2.447 |
| `24` | 3 Subtasks anlegen | 1,9 s → **p50 684 ms/Subtask** *(2.073 ms ges.)* | 3 → **16** | `3× POST todos`, `1× PUT files/:id`, `3×` Viererpack | 45–60 → **37,9** | 6 (748 ms) | 80,21 MB / 2.775 / −5.735 |
| `25` | Todo abhaken (`Toggle Complete`) | 0,76 s → **771 ms** | 5 → **10** | `1× PUT todos/:id`, `1× PUT files/:id`, `2×` Viererpack | 45–60 → **21,4** | 4 (455 ms) | 86,44 MB / 2.782 / +1.982 |
| `26` | Todo löschen | 0,91 s → **967 ms** | 3 → **13** | `1× DELETE todos/:id`, `1× DELETE tasks/:id`, `1× heartbeat`, `2×` Viererpack | 45–60 → **36,7** | 3 (364 ms) | 82,92 MB / 2.918 / +1.361 |
| `27` | Suche (`Ctrl+K`, tippen) | p50 17–41 ms → **p50 34,7–40,4 ms** *(max 48,4 ms; 1.817 ms ges.)* | 0–2 → **1** | `1× GET files?type=index&recursive=true` | 50–56 → **54,4** | 2 (228 ms) | 93,05 MB / 3.269 / +586 |
| `28` | Einstellungen (8 Reiter) | 78–120 ms/Tab → **70–250 ms/Tab** *(2.625 ms ges.; C10: 1.948 ms)* | 5 → **3–4** | `1× GET api-tokens`, `1× PUT files/:id` | 48 → **48,7** *(C10: 43,4)* | 2 (335 ms) | 90,35 MB / 4.526 / +576 |
| `29` | Fokus / Sichtbarkeit (`visibilitychange` + `focus`) | 2,5 s → **2.409 ms** | 26–33 → **16** *(13 Focus-triggered)* | **`0× crdt-state` Refetch**, `2×` Viererpack (`files`, `event`, `tasks`, `todos`), `1× variables`, `1× download`, `1× PUT` *(+1× `crdt-state`/`2× ws-ticket` im Setup)* | 44–56 → **43,0** | 5 (631 ms) | 80,54 MB / 3.006 / −4.036 |

*Anmerkung zu `22` vs. `C9` (Todos Batch): Im isolierten Kalender+Prod-Lauf (`C9_Todos_BatchCreate_10`) betrug die Latenz `p50 488,4 ms` (max `596,9 ms`, `5.959 ms` gesamt, `53` Requests mit `10×` Viererpack = `40` redundante GETs, `35,8 FPS`, `21` Long Tasks / `2.625 ms`).*  
*Anmerkung zu `C10` (Settings Tab-Einzelzeiten): Account `250,0 ms`, Appearance `99,6 ms`, Calendar `95,1 ms`, Notes `70,0 ms`, Todos `99,4 ms`, Extensions `152,5 ms`, Access `122,6 ms`, About Tide `183,5 ms`.*

---

### 4.2 Kalender (`C1`–`C8`) inkl. neu geschlossener Lücken (`C7`, `C8`)

Hinweis: In `perf_browser_e2e.mjs` schlugen `12`–`19` wegen eines geänderten Kalender-Selektors fehl; die dedizierte Kalender-Suite (`perf_calendar_and_prod_results.json` + Gap-Closer `perf_gap_results.json`) deckt `C1`–`C8` vollständig ab, inklusive der am 23.11. noch ungemessenen Szenarien **`C7`** und **`C8`**.

| ID | Aktion | Dauer (23.11. → 24.11.) | Requests (23.11. → 24.11.) | API-Breakdown (24.11.) | FPS (23. → 24.) | Long Tasks (24.11.) | Heap / Nodes / Listener-Delta (24.11.) |
|---|---|---|---|---|---|---|---|
| `C1` | Kalender öffnen (Woche, 42 Spalten) | 0,33–0,59 s → **398 ms** | 0 → **0** | `–` | 38–59 → **33,8** | 3 (243 ms) | 64,72 MB / 3.761 / +714 |
| `C2` | Termin anlegen + Popover | 0,56 s → **367 ms** | 9 → **7** | `1× POST files`, `1× PUT files/:id`, `1×` Viererpack (`+1 OPTIONS`) | 30 → **44,4** | 1 (112 ms) | 81,54 MB / 3.881 / +892 |
| `C3` | Termin bearbeiten (Auto-Save) | 1,26 s → **1.349 ms** | 2 → **6** | `2× PUT files/:id` (`14,3 ms` & `40,5 ms`), `1×` Viererpack | 52 → **51,2** | 3 (228 ms) | 79,43 MB / 3.892 / +1.635 |
| `C4` | 8 Termine anlegen (Batch) | p50 1,26 s → **p50 1.402 ms** *(min 1.042, max 1.778 ms; 11.623 ms ges.)* | 96 → **120** | `8× POST files`, `16× PUT files/:id`, **`22×` Viererpack = `88` GETs** (`+8 OPTIONS`) | 40 → **38,8** | 40 (3.877 ms, Script 7.437 ms) | 110,60 MB / 3.157 / +7.470 |
| `C5a` | Ansicht → `Tag` | 710 ms → **732 ms** | 0–3 → **4** | `1×` Viererpack | 41–55 → **39,9** | 2 (180 ms) | 95,35 MB / 3.496 / +722 |
| `C5b` | Ansicht → `Monat` | 560 ms → **574 ms** | 0–3 → **4** | `1×` Viererpack | 41–55 → **52,4** | 2 (110 ms) | 115,61 MB / 3.904 / +569 |
| `C5c` | Ansicht → `Fortlaufend` (Agenda) | 550 ms → **634 ms** | 0–3 → **4** | `1×` Viererpack | 41–55 → **34,1** | 3 (272 ms) | 117,98 MB / 4.810 / +624 |
| `C5d` | Ansicht → `Woche` | 650 ms → **593 ms** | 0–3 → **0** | `–` | 41–55 → **51,8** | 1 (68 ms) | 100,07 MB / 6.488 / +605 |
| `C6` | Wochen-Navigation (9 Schritte) | 2,06 s → **2.477 ms** *(p50 214 ms/Schritt, max 485 ms)* | 7 → **8** | `1× POST files`, `1× upload`, `1× index`, `1×` Viererpack | 49 → **36,9** | 6 (920 ms, Script 1.252 ms) | 122,43 MB / **9.340 (+2.852)** / +3.083 |
| `C7` | **NEU:** Termin Drag-Move (`+120px`, 20 Steps) | *nicht gemessen* → **1.194–1.649 ms** | *–* → **1** | **`1× PUT /api/v1/files/:id` in `9,4–11,1 ms`** (kein Listen-Refetch während Drag) | *–* → **53,3–54,1** | 3 (169 ms) | 81,56 MB / 3.020 / +1.343 |
| `C8` | **NEU:** Termin löschen (`#active-event-popover`) | *nicht gemessen* → **634–1.133 ms** | *–* → **5** | **`1× DELETE /api/v1/files/:id` (`204` in `12–17 ms`)** + `1×` Viererpack (`files`, `event`, `tasks`, `todos`) | *–* → **48,7–54,8** | 2 (161 ms) | 75,06 MB / 3.146 / +1.070 |

---

### 4.3 Mobile (`390×844` @ 4× CPU-Drosselung: `30`, `P2`) & Prod vs. Dev (`P1`, `P2`)

#### Produktion (`next start` auf `:3099`, `/auth` Cold-Load)

| Szenario | Metrik | 23.11.2026 (`9cd3b21`) | 24.11.2026 (`ab07e53`) | Delta |
|---|---|---:|---:|---|
| **`P1` Desktop (1× CPU, `1440×900`)** | TTFB | 4,9 ms | **5,3 ms** | +0,4 ms |
| | FCP / LCP | 260 ms | **196 ms** | **−24,6 %** |
| | CLS / Long Tasks / TBT | 0 / 0 / 0 ms | **0 / 0 / 0 ms** | stabil ideal |
| | Transfer / Requests | 753 KB (21 Reqs) | **770,9 KB** (21 Reqs) | +2,4 % |
| | Script-Zeit / DOM / Heap | – / 131 Nodes / 3,5 MB | **43,2 ms** / 131 Nodes / 3,50 MB | sauber |
| **`P2` Mobile (4× CPU, `390×844`)** | TTFB | 3,4 ms | **3,4 ms** | ±0 ms |
| | **FCP / LCP** | **3.236 ms** | **204 ms** | **−93,7 %** |
| | Long Tasks / TBT | 2 (240 ms) / **140 ms** | 2 (187 ms) / **87 ms** | **−37,9 % TBT** |
| | Script-Zeit | 278 ms | **158,3 ms** | **−43,1 %** |
| | Transfer / DOM / Heap | 753 KB / – / – | 770,9 KB / 130 Nodes / 3,51 MB | – |

#### Mobile Dev-Interaktionen (`390×844`, 4× CPU-Drosselung)

| Messung | Ergebnis 24.11.2026 | Details / Anmerkungen |
|---|---|---|
| **Mobile Shell Hydration (`30`)** | `3.573 ms` (Hauptlauf) / `2.954 ms` (Gap-Lauf) | `14–21` Requests (`3,21 MB` Transfer), `2–3` Long Tasks (`2.084–2.179 ms`), Heap `99,9–104,4 MB`, DOM `4.567–4.655` Nodes |
| **Bottom-Nav Tab-Wechsel** | **Notizen: `526 ms`**, **Todos: `439 ms`**, **Kalender: `431 ms`** | Erstwechsel auf Notizen/Todos löst Lazy-Chunk-Nachladen + Render-Spike aus |
| **Kalender-Subviews (Mobile)** | **Tag: `320 ms`**, **Woche: `350 ms`**, **Agenda: `335 ms`**, **Monat: `321 ms`** | Gleichmäßiges ~`320–350 ms` Fenster unter 4× CPU-Drosselung |
| **Mobile FAB öffnen** | **`422 ms`** | Öffnet Quick-Action-Overlay unter 4× CPU mit leichtem Script-Overhead |

*(Hinweis: Im ersten Lauf `30_Mobile_390x844_CPU4x` griffen die Selektoren wegen `pointer-events` / Nav-Markup noch nicht; die tab/subview/FAB-Zeiten stammen aus dem gezielten Mobile-Interaktionslauf gegen denselben Stand `ab07e53`.)*

---

### 4.4 Backend Direkt (`http://localhost:8081`, 33 Endpunkt-Gruppen) + WebCrypto Microbenchmarks

#### Go-API Endpunkte (`perf_api_results.json`, 24.11. vs. 23.11.)

| Endpunkt-Gruppe | `n` | 23.11. p50 | **24.11. p50** | **24.11. p95 / max** | Payload roh → **Wire (24.11.)** | Encoding / Headers |
|---|---:|---:|---:|---:|---:|---|
| `GET /health` | 20 | 0,83 ms | **0,50 ms** | 1,61 / 3,91 ms | 2 B → **2 B** | `(none)`, `CL: 2` |
| `GET /auth/me` | 20 | 0,88 ms | **1,75 ms** | 7,85 / 8,87 ms | 823 B → **688 B** | `gzip`, `no-store` |
| `POST /auth/ws-ticket` | 10 | 0,99 ms | **0,88 ms** | 4,63 / 4,63 ms | 94 B → **109–110 B** | `gzip`, `no-store` |
| `POST /files` (Notiz) | 10 | 1,91 ms | **2,44 ms** | 16,18 / 16,18 ms | 404 B → **404 B** | `(none)`, `CL: 404` |
| `PUT /files/:id` | 10 | 1,81 ms | **3,18 ms** | 9,46 / 9,46 ms | 414 B → **414 B** | `(none)`, `CL: 414` |
| `GET /files/:id/crdt-state` | 10 | 1,94 ms | **3,35 ms** | 8,77 / 8,77 ms | 45 B → **69 B** | `gzip`, `no-store` |
| Upload 10 KB (Initial / Overwrite) | 5 / 5 | 5,49 / 11,14 ms | **7,40 / 6,70 ms** | max 15,68 / 8,69 ms | 0 B | `(none)`, `CL: 0` |
| Upload 10 KB (kombiniert) | 10 | 5,76 ms | **7,29 ms** | 15,68 / 15,68 ms | 0 B | `(none)` |
| Upload 250 KB (Initial / Overwrite) | 3 / 3 | 19,80 / 19,08 ms | **6,26 / 7,21 ms** | max 6,53 / 8,59 ms | 0 B | `(none)` |
| Upload 250 KB (kombiniert) | 6 | 19,08 ms | **6,53 ms** | 8,59 / 8,59 ms | 0 B | `(none)` |
| Upload 2 MB (Initial / Overwrite) | 2 / 2 | 13,47 / 22,31 ms | **15,12 / 22,30 ms** | max 18,03 / **81,24 ms** *(mean 51,77)* | 0 B | `(none)` |
| Upload 2 MB (kombiniert) | 4 | 22,31 ms | **18,03 ms** | 81,24 / 81,24 ms | 0 B | `(none)` |
| Download 250 KB | 5 | 2,46 ms | **3,54 ms** | 7,60 / 7,60 ms | 256.000 B | `(none)`, **kein `CL` / `ETag`** |
| Download 2 MB | 5 | 9,11 ms | **9,41 ms** | 60,60 / 60,60 ms | 2.097.152 B | `(none)`, **kein `CL` / `ETag`** |
| `GET /files` N=10 (all / events) | 10 / 10 | 1,46 / 1,57 ms | **2,94 / 2,51 ms** | max 6,42 / 11,28 ms | 4.660 → **707 B** / 2.335 → **471 B** | `gzip` (**−84,8 % / −79,8 %**) |
| `GET /files` N=50 (all / events) | 10 / 10 | 1,63 / 1,23 ms | **3,75 / 2,66 ms** | max 5,95 / 5,66 ms | 23.336 B / 11.693 → **1.207 B** | `gzip` (**−89,7 %** bei Events) |
| `GET /files` N=150 (all / events) | 10 / 10 | 5,07 / 2,85 ms | **7,57 / 4,76 ms** | max 12,42 / 7,94 ms | 70.062 B / 35.100 B (roh) | `gzip` (chunked, ohne `CL`) |
| 20 parallele Writes | 20 | p50 45,2 / p95 116,3 ms | **64,4 ms** | **71,0 / 71,3 ms** | 411 B → **410 B** | 0 Fehler, Single-Writer p95 **−38,9 %** |
| 20 parallele Reads (N=150) | 20 | p50 32,7 / p95 80,3 ms | **29,5 ms** | **50,2 / 50,3 ms** | 70.222 B (roh) | `gzip`, WAL-Pool, p95 **−37,5 %** |
| Tasks CRUD (`POST`/`GET`/`PUT`/`DELETE`) | 15/10/10/10 | 1,09 / 0,83 / 1,00 / 0,48 ms | **0,78 / 1,25 / 1,53 / 0,55 ms** | max 9,03 / 2,13 / 4,03 / 1,32 ms | `GET` 4.080 → **690 B** | `gzip` auf `GET`/`PUT` (**−83,1 %**) |
| Todos CRUD (`POST`/`GET`/`PATCH`/`DELETE`) | 10 je | 0,81 / 1,13 / 0,93 / 1,61 ms | **1,41 / 2,06 / 1,89 / 0,81 ms** | max 6,20 / 6,19 / 4,12 / 2,00 ms | `GET` 4.652 → **661 B** | `gzip` auf `POST`/`GET`/`PATCH` (**−85,8 %**) |

*(Alle 33 Endpunkt-Gruppen hatten **0 Fehler** (`error_count: 0`).)*

#### WebCrypto Microbenchmarks (Node v24.21.0)

| Operation | 23.11.2026 | **24.11.2026** | Bewertung |
|---|---:|---:|---|
| RSA-4096 Keygen | 905,95 ms | **831,53 ms** | Einmalig bei Registrierung |
| PBKDF2 (600k Iterationen) `deriveKey` | 260,19 ms | **268,43 ms** | ~268 ms pro Ableitung |
| AES-256-GCM Vault Encrypt / Decrypt | 0,41 / 0,30 ms | **6,23 / 2,75 ms** | Warmup/JIT-Streuung, weiterhin < 7 ms |
| RSA-4096 Encrypt / Decrypt (32 B DEK) | 0,83 / 12,86 ms | **1,33 / 14,22 ms** | Durch Parallelisierung (`Promise.all` in `createFsSlice.ts:362`) nicht mehr seriell blockierend |
| AES-256-GCM Encrypt / Decrypt (64 KB) | 1,00 / 0,49 ms | **2,29 / 0,96 ms** | < 2,3 ms |

---

## 5. Detaillierte Analyse der Problemquellen

### 5.1 Behobene Befunde (`d56ff3f` & `77e3296`)

1. **Per-Keystroke-Compaction-Kaskade gestoppt (`d56ff3f`)**:
   - `web/src/app/page.tsx:165-174` stabilisiert `switchTab` über `switchTabRef` und `handleAutoSaveSwitchTab` (`useCallback` ohne wechselnde Dependencies).
   - `web/src/hooks/useAutoSaveSync.ts` triggert `triggerCompaction` nicht mehr bei jedem Re-Render über den Effect-Cleanup und setzt `activeDEK` nicht mehr vorzeitig auf `null`. Ergebnis: **−95 % bis −99,4 % Requests beim Tippen** (`330–334 → 2 / 16`).
2. **YjsE2EEProvider-Lifecycle & Fokus-Sturm behoben (`d56ff3f`, `77e3296`)**:
   - `web/src/components/Editor.tsx:94-113, 172-183` setzt und bereinigt `providerRef.current` imperativ beim Erzeugen/Unmount.
   - `web/src/lib/yjsE2EEProvider.ts:54, 125-131, 174, 211-212` prüft `this.destroyed` konsequent und zerstört den Provider bei HTTP `404` selbst. Ergebnis: **0 statt 23 `crdt-state`-Refetches bei Window-Focus (`29`)**.
3. **In-Flight-GET-Deduplizierung (`d56ff3f`)**:
   - `web/src/lib/api.ts:210-227` bündelt gleichzeitige identische `GET`-Aufrufe über `inflightGets`.
4. **Lazy Loading von Modals & schweren Dashboard-Views (`77e3296`)**:
   - `web/src/components/Dashboard/DashboardDesktopContent.tsx:4, 25-34` lädt `ProfilePage`, `SocialHub`, `JobsWorkspace`, `TodoList` und `TrashPanel` per `next/dynamic(..., { ssr: false })`.
   - `web/src/components/Layout/DashboardModals.tsx:4, 10-17` lädt `ShareModal`, `SecuritySettingsModal`, `SettingsModal`, `ScheduleModal` und `VariablesModal` per `next/dynamic`.
   - `web/src/components/Workspaces/SearchOverlay.tsx:111-112` baut den `Fuse`-Index nur noch bei `isOpen === true`.
   - Ergebnis: Top-3-Prod-Chunks **−27,2 %** (`2,76 MB → 2,01 MB`), Mobile `/auth` FCP **−93,7 %** (`3.236 ms → 204 ms`).
5. **Parallelisierte RSA-Metadaten-Entschlüsselung (`77e3296`)**:
   - `web/src/store/slices/createFsSlice.ts:362` entschlüsselt Verzeichnis-Einträge parallel via `Promise.all` statt sequentiell (bei 150 Dateien statt ~2 s Blockade nur noch ein Bruchteil).
6. **Kalender Drag-Listener stabilisiert (`77e3296`)**:
   - `web/src/components/Calendar/useCalendarDragResize.ts:144, 382-402` verhindert das Re-Attaching der `window`-Listener pro `mousemove`-Frame. Ergebnis: `C7` Drag läuft mit **53,3–54,1 FPS** und **1× `PUT`**.
7. **Backend Gzip & SQLite-Indizes (`77e3296`)**:
   - `cloud/cmd/server/main.go:250` aktiviert `r.Use(middleware.Compress(5))`.
   - `cloud/internal/store/sqlite.go:330-335` ergänzt Indizes (u. a. `files` Indizes auf `owner_id`, `parent_id`, `visibility`, `blob_path`).

---

### 5.2 Verbleibende & neu entdeckte Befunde

#### 1. **NEU (Hoch) · `fetchDirectory(null, true)`-Viererpack nach jeder Todo- & Kalender-Mutation**
- **Messbeleg:**
  - `C4_Calendar_BatchCreate_8Events`: 8 Termine lösen **22× den kompletten Viererpack** (`GET /api/v1/files`, `GET /api/v1/files?type=event`, `GET /api/v1/tasks`, `GET /api/v1/todos?limit=500&include_archived=true`) aus = **88 redundante GETs** in einem 11,6-s-Lauf (`120` Requests gesamt).
  - `22_Todos_BatchCreate_12Todos` / `C9_Todos_BatchCreate_10`: 10 Todos lösen **10–11× Viererpacks** = **40–44 redundante GETs** aus (`53–56` Requests gesamt, davon `516 KB` Transfer in `C9`).
  - Auch in `20`, `23`, `24`, `25`, `26`, `C5a`–`C5c`, `C8` und `29` erscheint derselbe Viererpack (`1–3×` pro Aktion). Zusätzlich treten während Todo-Aktionen (`20`, `22`, `23`, `24`, `25`) Hintergrund-`PUT /api/v1/files/:id`-Saves/Compactions der aktiven Notiz auf.
- **Ursache:** `fetchDirectory` in `web/src/store/slices/createFsSlice.ts:249-315, 474` führt via `Promise.allSettled` (`:277`) pauschal alle vier Endpunkte aus, und SSE-/Realtime-Sync-Events nach jeder Mutation triggern `fetchDirectory(null, true)` ohne Debounce oder ressourcenspezifische Teilaktualisierung (z. B. nur `/todos` bei Todo-Änderung bzw. optimistisches State-Update).

#### 2. **Kritisch / Hoch · Editor-Tastendruck-Hauptthread-Arbeit (`04`, `05`, `06`)**
- **Messbeleg:** `05_Note_Type_ShortParagraph` (81 Zeichen): Taste-zu-Bild **p50 73,4 ms / p95 210,0 ms / max 385,4 ms**, **37 Long Tasks (3.647 ms)**, **39,6 FPS**. `06_Note_Type_LargeDoc_Stress` (4.373 Zeichen): **p50 87,5 ms / p95 181,5 ms**, **29 Long Tasks (2.699 ms)**, **35,6 FPS**.
- **Code-Ursachen:**
  - `web/src/app/page.tsx:94, 170, 205, 235`: `editorContent` und `editorVersion` liegen im Root-State von `Dashboard` und erzwingen bei jedem Zeichen ein Re-Render des Dashboard-Baums.
  - `web/src/components/extensions/BlockId.ts:18-20, 117-156`: Durchläuft bei jeder Transaktion `newState.doc.descendants(...)` in `appendTransaction` (`:117`) **plus** zweimal `collectIds()` (`prevState.doc` und `view.state.doc` in `view().update()` `:144-145`) = **3 vollständige Dokument-Traversierungen pro Tastendruck**.
  - `web/src/components/extensions/InlineFormulas.ts:141, 165-172` & `web/src/components/extensions/AnimatedEmoji.ts:39, 51`: Bauen bei jeder `docChanged`- (bei `InlineFormulas` zusätzlich bei jeder `selectionSet`!) Transaktion das komplette `DecorationSet.create(...)` neu auf statt inkrementelles `old.map(tr.mapping, tr.doc)`.
  - `web/src/components/Editor/useTipTapConfig.ts:396`: Synchrones `editor.getJSON()` bei Update-Transaktionen serialisiert das gesamte Dokument auf dem Hauptthread.

#### 3. **Hoch · Vollständiger `<CollaborativeEditor>`-Remount bei jedem Notiz-Wechsel (`09`)**
- **Messbeleg:** `09_Note_Switch_Tabs_And_Sidebar`: **4.456 ms**, **71 Requests**, **23,6 FPS** (p95 Frame `150,1 ms`), **16 Long Tasks (2.136 ms)**, Sidebar-Wechsel **p50 583 ms** (max `669 ms`), Tab-Wechsel **p50 408 ms** (max `609 ms`).
- **Code-Ursache:** `web/src/components/Editor.tsx:47` rendert `<CollaborativeEditor key={props.activeTabId || 'editor-default'} {...props} />`. Durch das `key`-Attribut werden TipTap-Editor, ProseMirror-Plugins, Yjs-Doc und WebSocket-Verbindung bei jedem Notiz-Wechsel komplett zerstört (`:94-100`) und neu initialisiert (`crdt-state` + `2× ws-ticket` + `download` + `variables`).

#### 4. **Mittel · Kalender 42-Spalten-DOM-Wachstum & `DayColumn`-Memo-Invalidierung (`C4`, `C6`)**
- **Messbeleg:** In `C6_Calendar_WeekNavigation` (9 Navigationsschritte) wächst der DOM um **+2.852 Nodes auf 9.340 Nodes** (`p50 213,8 ms / Schritt`, `max 485,1 ms`, `36,9 FPS`, `920 ms` Long Tasks). In `C4` entstehen **40 Long Tasks (`3.877 ms`)** und `7.437 ms` Script-Zeit.
- **Code-Ursache:** `web/src/components/Calendar/CalendarWeekTimeGrid.tsx:226-264` übergibt allen 42 gemounteten `<DayColumn>`-Instanzen `allEvents={events}` (`:230`). Bei jeder Event-Änderung wird die `React.memo`-Grenze aller 42 Spalten invalidiert, anstatt jeder Spalte nur ihren vorgefilterten Tages-Slice (bzw. per stabilem Selector) zu übergeben.

#### 5. **Mittel · Backend-Caching, Overwrite-Read, verbleibende statische Imports & Tote Dependencies**
- **Fehlende `ETag` & `Content-Length` bei Blob-Downloads (`cloud/internal/api/files_blobs.go:149-205`):** Im API-Benchmark weisen `file_download_250kb` und `file_download_2mb` sowohl `etag: (none)` als auch `content-length: (none)` auf (`io.Copy(w, rc)` ohne Größen-Header und ohne `304 Not Modified`-Unterstützung).
- **Synchrones `oldBlobBytes`-Read vor Overwrite (`cloud/internal/api/files.go:438-460`):** Vor dem Überschreiben eines Blobs bis `10 MB` liest der Request-Handler synchron den kompletten alten Blob per `io.ReadAll(io.LimitReader(...))` in den Speicher, bevor `go h.handleBackupCascade(...)` asynchron startet. Folge: 2-MB-Overwrite-Uploads erreichen bis zu **81,2 ms max / 51,8 ms mean** vs. **16,6 ms mean** beim Erst-Upload (**3,1× langsamer**).
- **Modals/Overlay & Suche:** In `web/src/components/Layout/DashboardModals.tsx` sind `ShareModal` (`:10`) bis `VariablesModal` (`:17`) bereits dynamisch geladen; `ConfirmModal` (`:6`) ist noch statisch. In `web/src/components/Workspaces/SearchOverlay.tsx:6` wird `fuse.js` noch statisch importiert (statt `import('fuse.js')` erst beim Öffnen von `SearchOverlay` — dadurch landet `fuse.js` im übergeordneten Chunk; ebenso wäre ein dynamischer Import von `SearchOverlay` selbst im Dashboard-Shell-Baum konsequent).
- **Ungenutzte Dependencies & Assets in `web/`:** `web/package.json` enthält weiterhin `@xyflow/react`, `recharts` und `iconsax-react` (0 Imports in `web/src`); zudem liegen `43 MB` Emoji-SVGs, `tide.apk` (`23,5 MB`) und `favicon.png` (`367 KB`, wird pro Load 2–4× angefordert) in `web/public`.

---

## 6. Priorisierte Roadmap (74 → 90+ Punkte)

| Priorität | Maßnahme | Ziel-Dateien | Erwarteter Effekt | Geschätzter Score-Gewinn | Aufwand |
|---:|---|---|---|---|---|
| **P0** | **`fetchDirectory`-Viererpack entkoppeln & debouncen:** Granulare Updates (`refreshTodos`, `refreshEvents`, `refreshFiles`) statt pauschales `Promise.allSettled([files, events, tasks, todos])`; SSE-Refreshes um `150–300 ms` coalescen und bei eigener Mutation lokal/optimistisch patchen | `createFsSlice.ts`, `createTodosSlice.ts`, `createEventsSlice.ts`, `useRealtimeSync.ts` | **−75 % bis −90 % API-Requests** in Todo- & Kalender-Batches (`C4`: `120 → ~25`, `C9`: `53 → ~12`), höhere FPS | **+5–6 Pkt.** (Todos, Kalender, Netzwerk) | mittel |
| **P1** | **Editor-Tastendruck entlasten:** `editorContent`/`editorVersion` aus Root-`Dashboard` in Zustand-Slice/Ref verlagern; `BlockId.ts` auf geänderte Node-Ranges (`tr.steps`) beschränken statt 3× `descendants()`; `InlineFormulas` & `AnimatedEmoji` per `old.map(tr.mapping, tr.doc)` inkrementell updaten; `getJSON()` debouncen | `page.tsx`, `BlockId.ts`, `InlineFormulas.ts`, `AnimatedEmoji.ts`, `useTipTapConfig.ts` | **Tipp-p50 < 25 ms, p95 < 50 ms**, Long Tasks im Editor **−70 %**, **55+ FPS** | **+5–6 Pkt.** (Editor, Mobile) | mittel |
| **P2** | **Kein Voll-Remount bei Notiz-Wechsel:** `key={props.activeTabId}` auf `<CollaborativeEditor>` entfernen und stattdessen Editor-Content/Yjs-Doc/Provider kontrolliert im Hook swappen | `Editor.tsx:47`, `useTipTapConfig.ts` | Tab-/Sidebar-Wechsel **< 150 ms** statt `408–583 ms`, **50+ FPS** statt `23,6 FPS` | **+3–4 Pkt.** (Editor) | hoch |
| **P3** | **Kalender `DayColumn`-Slice & Node-Cleanup:** `eventsByDay`-Map im Parent berechnen und jeder `<DayColumn>` nur ihr Tages-Array übergeben; unsichtbare Offscreen-Wochen in der Infinite-Scroll-Karussell-Logik bereinigen | `CalendarWeekTimeGrid.tsx`, `DayColumn.tsx` | DOM-Nodes in `C6` von `9.340` auf `< 4.500`, `C4` Long Tasks **−50 %** | **+2–3 Pkt.** (Kalender) | mittel |
| **P4** | **Backend Blob `ETag`/`Content-Length` & Backup-Read entkoppeln:** `Content-Length` + `ETag` (`w.Header().Set` via `BlobStore.GetSize`/Hash) in `DownloadFile` setzen; Backup-Copy in `HandleBackupCascade` komplett asynchron (oder via Hardlink/File-Copy) statt synchronem `io.ReadAll` im Upload-Pfad | `files_blobs.go:149-205`, `files.go:438-460` | 2-MB-Overwrite **~3× schneller** (`52 ms → ~17 ms`), Browser-Cache/304 für Blobs | **+1–2 Pkt.** (Backend, Netzwerk) | klein |
| **P5** | **Bundle-Hygiene & Lazy `fuse.js`:** `@xyflow/react`, `recharts`, `iconsax-react` aus `web/package.json` entfernen; `fuse.js` dynamisch beim Öffnen von `SearchOverlay` laden; `favicon.png` komprimieren (`< 20 KB`) & `Cache-Control` setzen | `web/package.json`, `SearchOverlay.tsx`, `web/public/favicon.png` | Kleinerer Initial-/Search-Chunk, sauberer Deploy | **+1 Pkt.** (Erstladen, Mobile) | klein |

---

## 7. Methodik & Reproduzierbarkeit

- **Browser-Läufe (`3001` & `3099`):** Chrome Headless via CDP. Drei komplementäre Läufe wurden gegen `ab07e53` ausgeführt:
  1. `perf_browser_e2e.mjs` (Desktop `01`–`11`, `20`–`31`, Mobile `30`)
  2. `perf_calendar_and_prod.mjs` (`A0`, `C1`–`C10`, Prod `P1` & `P2`)
  3. `perf_gap_closer.mjs` (gezielt mit `SERVER_MASTER_KEY` für `31` `Dev Alice`, sowie `C7` Drag-Move, `C8` Delete und Mobile-Interaktionen)
- **Backend-Lauf (`8081`):** `perf_api_bench.mjs` gegen einen frischen Einmal-Account (`user-temp-7d3d0c05`), 33 Endpunkt-Gruppen + WebCrypto-Microbenchmarks unter Node `v24.21.0`, ohne Veränderung produktiver Nutzerdaten.
- **Streuungshinweis:** Dev-Server-Werte (`:3001`) enthalten React StrictMode und unminifizierte Bundles; Produktions-Werte (`:3099`) spiegeln das reale Ladeverhalten für Endnutzer wider.
