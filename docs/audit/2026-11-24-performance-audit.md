# Tide – Performance-Audit (24.11.2026)

> **Datum:** 24.11.2026  
> **Ziel-Commit:** `0f18f76` (Code-Stand identisch zu `ab07e53`, Branch `main`)  
> **Vergleichs-Baseline:** [`docs/audit/2026-11-23-performance-audit.html`](./2026-11-23-performance-audit.html) (23.11.2026, Commit `9cd3b21`) · Re-Verifikation gegen den ersten 24.11.-Lauf (`ab07e53`, Score `74 → 76`)  
> **Testumgebung:**
> - **OS & Runtime:** Windows 11 · Node.js `v24.21.0`
> - **Backend (`cloud/`):** Go-Server auf `http://localhost:8081` (SQLite WAL + BlobStore, `Compress(5)`)
> - **Frontend Dev (`web/`):** Next.js `16.4.6` (Turbopack, unminifiziert, React StrictMode) auf `http://localhost:3001`
> - **Frontend Prod (`web/`):** Next.js `16.4.6` (`next build` + `next start`) auf `http://localhost:3099`
> - **Browser-Harness:** Headless Google Chrome `157.0.8103.80` über natives Chrome DevTools Protocol (`--remote-debugging-port=9222/9223/9224`, `Performance.getMetrics`, `PerformanceObserver`, `requestAnimationFrame`-Sampler, `HeapProfiler.collectGarbage`, Network- & WebSocket-Tracing)
> - **Hygiene & Bereinigung:** Alle synthetischen Testdaten (`170` Backend-Testdateien, `7` Notizen + `13` Todos in Suite A, `12` Dev- + `3` Prod-Datensätze bzw. `21` Dateien/Events in Suite B) wurden nach Abschluss der Messungen restlos via API `DELETE` bereinigt (`0` verbleibend).

---

## 1. Executive Summary & Score-Delta

| Kennzahl | 23.11.2026 (`9cd3b21`) | 24.11.2026 (Lauf 1, `ab07e53`) | **24.11.2026 (Final, `0f18f76`)** | Delta vs. 23.11. | Delta vs. Lauf 1 |
|---|---:|---:|---:|---:|---:|
| **Gesamt-Score** | **55 / 100** | 74 / 100 | **76 / 100** | **+21 Punkte (+38,2 %)** | **+2 Punkte** |
| **Gesamtbewertung** | Ausbaufähig (Leaks & Request-Stürme) | Solide verbessert | **Gut / Solide Basis** (Leaks & Kompression behoben; Prod-Tippen `19,5 ms` / `59,9 FPS`; `fetchDirectory`-Viererpack & Remount offen) | deutlich verbessert | verifiziert & präzisiert |

### Warum steigt der Score auf 76 / 100 (+21 ggü. 23.11., +2 ggü. erstem 24.11.-Lauf)?
1. **Verifizierte Produktions-Interaktionsmessung (`:3099`, Explorativer Probe 1):** Im Produktions-Build sinkt beim Tippen von 81 Zeichen die Taste-zu-Bild-Latenz auf **`p50 19,5 ms / p95 36,7 ms`** (`59,9 FPS`, **`0` Long Tasks**, nur `134,5 ms` Script vs. `782,9 ms` in Dev) — in einem breiteren Prod-Lauf auf `27,6 ms / 57,2 ms` (`57,4 FPS`, `1` LT `70 ms`). Gleichzeitig sinkt die Mobile-Prod-Interaktion unter 4× CPU auf `227,4 ms` Load (`LCP 640 ms`, `1` LT `229 ms`) bei sauberem `/auth`-Cold-Load (`P2`: FCP/LCP `296 ms`, Load `189,8 ms`, TBT `25 ms`).
2. **Endgültiger GC-Freigabe-Nachweis (`HeapProfiler.collectGarbage`, Probe 3):** Nach `72×` Tab-Thrashing (10,9 s Dauerlast) und Schließen der Tabs fällt der Heap von `87,43 MB` auf **`64,31 MB`** (`−23,12 MB` unter Ausgangswert) und die Event-Listener von `4.005` auf **`3.870`** (`−135`). Auch im separaten `12×`-Thrash-Lauf + Schließen von 5 Tabs fielen Listener von `33.200` auf `6.161` (`−1.050` unter Baseline `7.211`) und Heap von `140,47 MB` auf `73,92 MB` (`−2,65 MB` unter Baseline `76,57 MB`). Das `YjsE2EEProvider`-Leak ist damit zweifelsfrei geschlossen.
3. **Konsistent schnellere Editor-, Tab-, Fokus- und Kalender-P50-Werte:** `05` (81 Zeichen Dev) verbessert sich auf `p50 33,52 ms` (`58,0 FPS`, `9` Reqs), `29` (Focus) auf `3` Reqs / `0` Long Tasks / `0× crdt-state`, `C7` Drag auf `55,6–59,4 FPS` und `C4` Batch-Events auf `p50 1.168,4 ms` (`26` LT statt `40` LT).

### Domain Scores (`23.11. → 24.11.`)

| Bereich | 23.11.2026 (`9cd3b21`) | 24.11.2026 (`0f18f76`) | Delta | Bewertung / Treiber |
|---|---:|---:|---:|---|
| **Backend-API** | 92 | **96** | **+4** | `Compress(5)` aktiv (−80–90 % Wire-Bytes), DB-Indizes, `PUT /files/:id` `p50 1,48–2,61 ms`, `0` Fehler über alle 30 Endpunkt-Gruppen; nur `ETag`/`CL` bei Download & synchroner Overwrite-Read offen |
| **Erstladen (Produktion)** | 75 | **94** | **+19** | Desktop `P1` FCP/LCP `260 → 164 ms` (−36,9 %, `0` LT, `0 ms` TBT), Mobile `P2` FCP/LCP `3.236 → 296 ms` (−90,9 %, TBT `25 ms`), Top-3-Chunks −27,2 % (`2,01 MB`) |
| **Suche / Einstellungen** | 80 | **90** | **+10** | Fuse-Index lazy bei geöffnetem Overlay, Suche Tippen `p50 22,2 ms` (post-mutation `31,4 ms`), Settings per `next/dynamic` (8 Tabs `41–121 ms`) |
| **Todos** | 78 | **78** | **±0** | Stabile Einzellatenzen (`21`–`26`), aber `fetchDirectory`-Viererpack bei jeder Mutation (`10×` Viererpack = `40 / 50` Reqs in `22`) |
| **Speicher / Listener** | 25 | **78** | **+53** | `YjsE2EEProvider`-Leak behoben; GC-Nachweis in Probe 3 (`87,43 → 64,31 MB` Heap, `4.005 → 3.870` Listener bzw. `140,47 → 73,92 MB` & `33.200 → 6.161`) |
| **Netzwerk-Effizienz** | 25 | **70** | **+45** | Per-Keystroke-Sturm (−95–99 %) & Fokus-`crdt-state` (−100 %) behoben, `inflightGets`-Deduplizierung aktiv, Gzip aktiv; Viererpack bei Mutationen offen |
| **Kalender** | 55 | **68** | **+13** | Drag-Listener stabil (`C7` `55,6–59,4 FPS`, `1 PUT 8,3–55,2 ms`), `C4` Long Tasks reduziert; offen: `20×` Viererpack & `2× 409` Race in `C4`, 42-Spalten-`allEvents` |
| **Mobile (4× CPU)** | 40 | **62** | **+22** | Prod `:3099` Logged-in Reload `227,4 ms` (LCP `640 ms`, `1` LT), `/auth` LCP `296 ms`, BottomNav-Tabs `549–620 ms`; `Tag`/`Woche`-Subviews mit `2–3` LT (`336–602 ms`) |
| **Notiz-Editor (Tippen & Wechsel)** | 42 | **58** | **+16** | Prod `:3099` Tippen `p50 19,5 ms` (`59,9 FPS`, `0` LT), Dev `33,5 ms`; aber `<CollaborativeEditor key={activeTabId}>` Remount (`09`: `4.497 ms`, `73` Reqs) & KaTeX/Emoji-Stress (`p50 125,4 ms`, `18` LT) |
| **Gesamt-Score** | **55** | **76** | **+21** | |

---

## 2. Environment & Methodology

- **Git- & Code-Stand:** Commit `0f18f76` auf Branch `main` (Code-Stand funktional identisch zu `ab07e53`, Vergleichs-Baseline `23.11.2026` Commit `9cd3b21`).
- **System & Prozesse:** Windows 11, Node.js `v24.21.0`, Go-Backend auf `:8081` (`SERVER_MASTER_KEY` gesetzt für `Dev Alice`), Next.js `16.4.6` Turbopack Dev auf `:3001`, Next.js `16.4.6` Prod (`next build && next start`) auf `:3099`.
- **Browser-Automatisierung:** Headless Google Chrome `157.0.8103.80` über natives CDP (`--remote-debugging-port=9222/9223/9224`). Messsignale: `Performance.getMetrics` (`JSHeapUsedSize`, `JSEventListeners`, `Nodes`, `ScriptDuration`), `PerformanceObserver` (`paint`, `largest-contentful-paint`, `layout-shift`, `longtask`), `requestAnimationFrame`-FPS-Sampler, Tastatur-zu-rAF-Latenz (`p50`/`p95`/`max`), vollständige HTTP-/WebSocket-Mitschnitte und explizite GC via `HeapProfiler.collectGarbage`.
- **70% Core Baseline Catalog + 30% Open Exploratory Discovery:**
  - *Teil A (70 %):* Desktop `01`–`31` (`1440×900`, `partA_output.txt`), Kalender `C1`–`C8` (`phase3_results.json`), Mobile `390×844 @ 4× CPU` auf Dev `:3001` und Prod `:3099` (`phase3_results.json`), Prod-Erstladen `P1`–`P2`, Build-/Bundle-/Asset-Analyse, `:8081` Backend-Microbenchmarks (30 Endpunkt-Gruppen + Node `v24.21.0` WebCrypto).
  - *Teil B (30 %):* Vier gezielte explorative Probes (`probe1_prodVsDev`, `probe2_formulasEmojisLargeDoc`, `probe3_tabThrashRetention`, `probe4_socialAndSearch` + Prod-CSP/Rewrite-Verifikation).
- **Hinweis zur Test-Suite-Abdeckung:** In `partA_output.txt` scheiterten die Selektoren für `11` (`[data-note-tile] < 10`) sowie `20`–`26` (Todo-View-Selektor im `partA`-Lauf); diese Szenarien sind aus dem verifizierten `ab07e53`-Lauf dokumentiert und entsprechend gekennzeichnet. Mobile Calendar Subviews in Dev (`:3001`) meldeten `clicked: false`, während alle Subviews in Prod (`:3099`) erfolgreich (`clicked: true`) gemessen wurden.
- **Datenhygiene:** `170` Backend-Benchmark-Dateien, `11` Dateien in Suite A (`0` verbleibend laut `cleanupSummary`), `12` Dev- + `3` Prod-Datensätze in Suite B wurden per `DELETE` vollständig entfernt.

---

## 3. Comparison Against Previous Audit (Status Tracking 23.11. → 24.11.)

| Vorheriger Befund (23.11., `9cd3b21`) | Status (24.11., `0f18f76`) | Messbeleg & Code-Referenz |
|---|---|---|
| **1. Speicher-Kaskade pro Tastendruck (`330–334` Reqs in `05`, `169` in `06`)** | **Behoben** (`d56ff3f`) | `web/src/app/page.tsx:165-175`, `web/src/hooks/useAutoSaveSync.ts:543-587`. `05` (81 Zeichen): `330–334 → 9` Requests (`14–16` in früherem Lauf mit Autosave, **−95,2 % bis −97,3 %**); Keystroke rAF `p50 33,52 ms` (Dev) bzw. **`19,5 ms` / `59,9 FPS`** (Prod `:3099`). `06` (4.230 Z. Paste + 40 Tasten): `169 → 4–6` Requests (**−96,4 % bis −97,6 %**), `p50 33,37 ms` / `p95 43,03 ms`, `56,0 FPS`. |
| **2. Geleakte `YjsE2EEProvider`-Instanzen & Fokus-`crdt-state`-Sturm (`29`: `23×`)** | **Behoben** (`d56ff3f`, `77e3296`) | `web/src/components/Editor.tsx:94-113, 172-219`, `web/src/lib/yjsE2EEProvider.ts:54, 125-131, 174, 211-212`. `29` Window-Focus `crdt-state`-Refetches: **`23 → 0` (−100 %)**; Fokus-Requests gesamt `26–33 → 3–10` (**−69 % bis −89 %**). `04` Listener-Delta nach GC-Cleanup `-658` (bzw. `+26` netto statt `+7.800`). **Probe 3 (`HeapProfiler.collectGarbage`):** Nach `72×` Tab-Thrash + Schließen sinkt Heap von `87,43 MB` auf **`64,31 MB`** (`−23,12 MB`) und Listener von `4.005` auf **`3.870`** (`−135`). |
| **3. Fehlende Gzip-Kompression, DB-Indizes, Bundle-Splitting, GET-Deduplizierung, serielles RSA & Drag-Listener** | **Behoben** (`d56ff3f`, `77e3296`) | `cloud/cmd/server/main.go:250` (`Compress(5)`), `cloud/internal/store/sqlite.go:330-335`, `web/src/lib/api.ts:210-227` (`inflightGets`), `DashboardDesktopContent.tsx:4, 25-34`, `DashboardModals.tsx:4, 10-17`, `SearchOverlay.tsx:111-112`, `createFsSlice.ts:362` (`Promise.all`), `useCalendarDragResize.ts:144, 382-402`. Prod `/auth` Desktop `P1`: FCP/LCP `260 → 164 ms` (**−36,9 %**), Load `167 → 80,4 ms`, Transfer `753 → 662,7 KB (20 Reqs)`, `0` LT, `0 ms` TBT. Prod `/auth` Mobile `P2`: FCP/LCP `3.236 → 296 ms` (**−90,9 %**), Load `3.394 → 189,8 ms` (**−94,4 %**), TBT `140 → 25 ms` (**−82,1 %**), Script `278 → 66,9 ms` (**−75,9 %**). `C7` Drag-Move: `55,6–59,4 FPS`, `1 PUT (8,3–55,2 ms)`. |
| **4. Editor-Tastendruck-Hauptthread-Last (`InlineFormulas`, `AnimatedEmoji`, `BlockId`)** | **Teilweise behoben** *(Prod normal schnell, Formeln/Emojis kritisch)* | Normales Tippen in Prod `:3099` erreicht `p50 19,5 ms / 0 LT` (`Probe 1`). Sobald jedoch **KaTeX-Formeln & Emojis** aktiv sind (`Probe 2`), bricht das Tippen auf **`p50 125,4 ms / p95 362,6 ms` (`18` LT, `31,3 FPS`)** ein. |
| **5. `<CollaborativeEditor key={activeTabId}>`-Voll-Remount bei Tab-Wechsel (`09`)** | **Offen** | `Editor.tsx:47` zerstört und initialisiert Editor + Provider bei jedem Wechsel neu (`09` Dev: `4.496,6 ms`, `73` Reqs, `17,1 FPS`; Prod `Probe 1`: `1.217,8 ms`, `23` Reqs). |
| **6. `fetchDirectory`-Viererpack bei Mutationen** *(neu seit 24.11.)* | **Offen** | `createFsSlice.ts:249-315` feuert bei jeder Mutation alle 4 Endpunkte (`C4`: `20×` = `80` GETs von `114` Reqs; `08`: `21×` = `84` GETs; `22`: `10×` = `40` GETs). |
| **7. Kalender 42-Spalten-`allEvents` & Node-Wachstum (`C4`, `C6`)** | **Offen** | `CalendarWeekTimeGrid.tsx:226-264` invalidiert alle 42 `<DayColumn>`s; `C6` wächst je nach Settle-Window auf bis zu `11.390` Nodes (`+4.584`); `C4` hat `2× 409 Conflict` in `EventPopover.tsx:258`. |

---

## 4. Detailed Open Findings by Severity

### Finding 1 (`Hoch`) — `fetchDirectory(null, true)`-Viererpack bei Mutationen & fehlender ressourcenspezifischer Refresh
- **Ursache:** `web/src/store/slices/createFsSlice.ts:249-315` (`:277` `Promise.allSettled`, `:474`) ruft nach jeder Datei-, Kalender- oder Todo-Mutation sowie nach SSE-Sync-Events ungedrosselt und pauschal alle vier Listen-Endpunkte gleichzeitig auf (`GET /api/v1/files`, `GET /api/v1/files?type=event`, `GET /api/v1/tasks`, `GET /api/v1/todos?limit=500&include_archived=true`).
- **Beleg:**
  - `C4` (8 Termine Batch): **`20×` Viererpack = `80 / 114` Requests (`70,2 %` redundant)** im finalen Lauf (bzw. `16× = 64 / 98` = `65 %` im Vergleichslauf).
  - `08` (8 Notizen Batch): **`21×` Viererpack = `84 / 236` Requests** (bzw. `15× = 60 / 191` im Vergleichslauf).
  - `22` (10 Todos Batch): **`10×` Viererpack = `40 / 50` Requests (`80 %` redundant)**.
  - `09` (8× Notizwechsel): **`5–6×` Viererpack = `20–24 / 73–76` Requests**.
  - `02` / `31` (Login): `tasks` & `todos` werden jeweils **`3×`**, `files?recursive=true` & `files?type=event&recursive=true` jeweils **`2×`** abgerufen.
- **Fix:** `fetchDirectory` in granulare Store-Methoden (`fetchFiles()`, `fetchEvents()`, `fetchTasksAndTodos()`) aufteilen, SSE-/Mutations-Refreshes per `300 ms` Trailing-Debounce zusammenführen und in `web/src/lib/api.ts` einen `2000 ms` Short-TTL-Read-Cache ergänzen.

### Finding 2 (`Hoch`, in Dev & bei Formeln/Emojis `Kritisch`) — Editor-Tastendruck-CPU-Last & ungedrosselte ProseMirror-Dekorations-Traversierungen
- **Ursache:**
  - `web/src/app/page.tsx:94, 170, 205, 235`: `editorContent` und `editorVersion` im Root-State erzwingen Re-Renders des Dashboard-Baums.
  - `web/src/components/extensions/InlineFormulas.ts:68, 141, 166-171`: Baut `DecorationSet` via `doc.descendants()` + `katex.renderToString()` bei jedem `tr.docChanged` **UND** bei jedem `tr.selectionSet` komplett neu auf, statt unveränderte Blöcke per `oldSet.map(tr.mapping, tr.doc)` zu übernehmen.
  - `web/src/components/extensions/AnimatedEmoji.ts:20-40, 51`: Führt bei jedem `tr.docChanged` `doc.descendants()` mit `new RegExp(EMOJI_PATTERN, 'gu')` über das gesamte Dokument aus.
  - `web/src/components/extensions/BlockId.ts:18-27, 117-156`: `collectIds()` durchläuft in `appendTransaction` und `view().update()` mehrfach `doc.descendants()`.
  - `web/src/components/Editor/useTipTapConfig.ts:396`: Synchrones `editor.getJSON()` bei Update-Transaktionen.
- **Beleg:**
  - **Explorativer Probe 1 (`Prod :3099` vs. `Dev :3001`, 81 Zeichen):** In Prod sinkt Keystroke `p50` von `24,5–37,5 ms` (Dev) auf **`19,5 ms`** (`p95 36,7 ms`, **`59,9 FPS`**, **`0` Long Tasks**, Script `134,5 ms` = **−82,8 %** vs. Dev `782,9 ms`; im früheren Prod-Check `27,6 ms / 57,2 ms / 57,4 FPS / 1 LT 70 ms`).
  - **Explorativer Probe 2 (Dokument mit KaTeX-Formeln & Emojis):** Tippen bricht auf **`p50 125,4 ms`**, **`p95 362,6 ms`**, **`31,3 FPS`**, **`18` Long Tasks (`1.782 ms`, max `172 ms`)**, `1.790,3 ms` Script und `252` Decoration-DOM-Nodes (`+364` Nodes auf `5.271`) ein.
- **Fix:** `DecorationSet.map(tr.mapping, tr.doc)` für unveränderte Nodes + Modul-LRU-Cache für `katex.renderToString(latex, displayMode)`; kein Rebuild bei bloßem `tr.selectionSet` außerhalb von Formel-Nodes; `BlockId` auf geänderte `tr.steps`-Ranges begrenzen; `editor.getJSON()` auf `500 ms` debouncen.

### Finding 3 (`Hoch`) — Vollständiger `<CollaborativeEditor key={activeTabId}>`-Remount bei jedem Notiz-/Tab-Wechsel
- **Ursache:** `web/src/components/Editor.tsx:47` erzwingt mit `key={props.activeTabId || 'editor-default'}` bei jedem Notiz- oder Tab-Wechsel die komplette Zerstörung und Neuerstellung der TipTap-Instanz, aller ProseMirror-Plugins, des `Y.Doc`, der IndexedDB-Hydration und der WebSocket-Tickets (`Editor.tsx:94-112`).
- **Beleg:**
  - `09` (Dev `:3001`, 4× Sidebar + 4× Tab): **`4.496,6 ms`** gesamt, Sidebar `p50 281,03 ms` (`max 561,26 ms`), Tab `p50 308,15 ms` (`max 553,87 ms`), **`17,1 FPS`**, **`19` Long Tasks (`2.487 ms`)**, `3.315,5 ms` Script, **`73` Requests** (`16× ws-ticket`, `8× crdt-state`, `8× download`, `8× variables`, `7× PUT`, `5×` Viererpack).
  - **Explorativer Probe 1 (Prod `:3099`, 8× Tab-Switch):** Auch ohne Dev-Overhead dauert ein 8-facher Wechsel **`1.217,8 ms`** (`p50 148,1 ms/Switch`, `max 203,9 ms`, `33,0 FPS`, `412,9 ms` Script, `23` Requests inkl. `4× ws-ticket`, `3× download`, `3× variables`, `3× PUT`; im früheren Prod-Check `1.613,2 ms` / `p50 170,5 ms` / `3` LT `202 ms`).
- **Fix:** `key={props.activeTabId}` entfernen bzw. einen LRU-Keep-Alive-Pool (z. B. die letzten 3 geöffneten `Y.Doc`/Provider-Instanzen im Speicher halten) einführen und Content/Yjs-Binding ohne Editor-Destroy umschalten.

### Finding 4 (`Mittel`) — Kalender 42-Spalten-Mount (`allEvents`-Prop), Node-Wachstum & `409 Conflict` Race (`EventPopover.tsx:258`)
- **Ursache:**
  - `web/src/components/Calendar/CalendarWeekTimeGrid.tsx:226-264` mountet 42 `<DayColumn>`-Instanzen und übergibt allen `allEvents={events}` (`:230`), wodurch jede Terminänderung die Memo-Grenze aller 42 Spalten bricht.
  - `web/src/components/Calendar/EventPopover.tsx:258`: Beim schnellen Speichern direkt nach Termin-Erstellung (`POST`) überholen sich `PUT`-Autosave und Initial-Update und erzeugen serverseitige Version-Konflikte (`409`).
- **Beleg:**
  - `C1` mountet `42` `dayColumns` (`2.258` Nodes / `2.071` Listener in `phase3_results.json`; bis `3.907` Nodes / `+9.041` Listener bei gefülltem Kalender).
  - `C4` (8 Termine Batch): `10.006,9 ms`, `p50 1.168,4 ms/Event`, `26` Long Tasks (`1.784 ms`, deutlich unter den `40` LT / `3.877 ms` vom ersten 24.11.-Lauf), `4.478,4 ms` Script, `114` Requests inkl. **`2× HTTP 409 Conflict`** auf `PUT /api/v1/files/:id` (mit erfolgreichem Retry).
  - `C6` (9 Wochen-Schritte): `3.093,8 ms` (`p50 343,7 ms`), `2` LT (`129 ms`), aber DOM wächst im 1500ms-Window um `+4.584` Nodes (`6.806 → 11.390`) und `+9.356` Listener (`11.004 → 20.360`). *(Bei längerem Settle recycelte `C6` auf `5.667` Nodes bei `55,2 FPS` / `1` LT `53 ms`.)*
- **Fix:** `eventsByDay: Map<string, CalendarEvent[]>` in `CalendarWeekTimeGrid` vorab per `useMemo` gruppieren; im `EventPopover.tsx:258` das lokale Version-Token nach `POST` synchronisieren bzw. Autosave während laufender Initial-Speicherung serialisieren.

### Finding 5 (`Mittel`) — Production `:3099` CSP `connect-src` vs. `/api/*` Rewrite-Port-Konflikt (Explorativer Befund Probe 4)
- **Ursache:** `web/next.config.ts:69` setzt im Produktions-Build `connect-src 'self' https: wss:`, was direkte Browser-Requests an `http://localhost:8081` (`NEXT_PUBLIC_API_URL`) blockiert. Gleichzeitig verdrahtet `web/next.config.ts:95-99` den Next.js-Rewrite `/api/:path*` zur Build-Zeit auf `http://localhost:${process.env.BACKEND_PORT || process.env.PORT_BACKEND || '8080'}/api/:path*`. Wird `npm run build` ohne `BACKEND_PORT=8081` ausgeführt, schlagen sowohl direkte `:8081`-Calls (CSP) als auch `/api/*`-Calls (`:8080` → `500 Internal Server Error`) fehl.
- **Fix:** In `web/next.config.ts` den Rewrite-Fallback aus `new URL(process.env.NEXT_PUBLIC_API_URL).origin` ableiten und `process.env.NEXT_PUBLIC_API_URL` (falls gesetzt) in `connect-src` aufnehmen.

### Finding 6 (`Niedrig / Mittel`) — Backend Download-Header (`ETag`/`Content-Length`), synchroner Overwrite-Backup-Read & Bundle-/Public-Hygiene
- **Ursache & Beleg:**
  - `cloud/internal/api/files_blobs.go:149-205`: `DownloadFile` sendet weder `ETag` noch `Content-Length` (`250 KB` in `p50 2,33–3,54 ms`, `2 MB` in `p50 7,01–9,41 ms`).
  - `cloud/internal/api/files.go:438-460`: Synchrones `io.ReadAll(io.LimitReader(rc, 10<<20))` vor `go s.handleBackupCascade(...)` macht `250 KB` Overwrite **`4,2×` langsamer** als Initial-Upload (`p50 31,03 ms` vs. `7,35 ms`) und `2 MB` Overwrite **`1,8×` langsamer** (`p50 20,36 ms` vs. `11,52 ms`; bis `81,24 ms` max).
  - `web/package.json` enthält **8 ungenutzte Dependencies** (`recharts`, `@xyflow/react`, `iconsax-react`, `@tiptap/extension-bubble-menu`, `@tiptap/extension-highlight`, `@tiptap/extension-underline`, `tiptap-extension-resize-image`, `y-prosemirror`).
  - `web/public/` (**`64,13 MB`**): `2.989` Emoji-SVGs (`40,84 MB`), `tide.apk` (`22,43 MB`), `favicon.png` (`358,46 KB`, beim Login `3×` geladen).
- **Fix:** `Content-Length` + `ETag` in `DownloadFile` setzen, Backup-Kopie in `HandleBackupCascade` komplett asynchron ausführen, ungenutzte 8 Packages entfernen und `favicon.png` auf `< 20 KB` komprimieren.

---

## 5. Complete Measurement Tables (`Vorher 23.11.` | `Jetzt 24.11.` | `Delta / Bewertung`)

### Tabelle 1: Desktop Actions (`01`–`31`, `1440×900`, Dev `:3001`)

| ID | Aktion | Vorher 23.11. (`9cd3b21`) | Jetzt 24.11. (`0f18f76` / `partA_output.txt`) | Requests (23. → 24.) | FPS / Long Tasks (24.11.) | Heap / Nodes / Listener-Delta (24.11.) & Bewertung |
|---|---|---|---|---|---|---|
| `01` | Cold-Load `/auth` (Dev) | 1,17–1,80 s (14 Reqs) | **1.194 ms** *(Baseline `ab07e53`)* | 14 → **13** | – / 1 (260 ms) | 30,61 MB / 292 / +788 · **Verbessert** |
| `02` | Dev-Login Einmal-Gast → Shell | 2,0–3,0 s (40 Reqs) | **2.808 ms** *(Shell 1.582,5 ms)* | 40 → **50** *(4,77 MB)* | 25,7 FPS / 5 (502 ms) | 70,72 MB / 2.320 / +1.833 · `3×` `tasks`/`todos`/`favicon`, `2×` `files?recursive` |
| `31` | Dev-Login `Dev Alice` (Returning) | 1,3 s Shell (55 Reqs) | **8.286,4 ms** *(Shell 6.464,6 ms)* | 55 → **51** *(4,83 MB)* | 10,0 FPS / 8 (1.276 ms) | 78,82 MB / 2.442 / +2.280 · Returning RSA+Hydration; `3×` `tasks`/`todos`/`favicon` |
| `03` | Erste Notiz anlegen + TipTap/WS | 1,9–2,0 s (24 Reqs) | **3.414,6 ms** | 24 → **29** *(2,52 MB)* | 51,9 FPS / 7 (500 ms) | 75,95 MB / 2.207 / −728 · `2×` Viererpack, `2× ws-ticket`, `1× crdt-state` |
| `04` | Titel umbenennen (21 Zeichen) | p50 62–74 ms (11 Reqs) | **p50 43,11 ms** *(p95 109,86 / 1.749,3 ms)* | 11 → **15** *(13,9 KB)* | 45,5 FPS / 4 (249 ms) | 94,77 MB / 2.353 / +6.723 *(−658 netto nach GC)* · **Schneller (−36 % p50)** |
| `05` | 81 Zeichen tippen (Dev) | p50 59 ms / p95 117–149 ms | **p50 33,52 ms** *(p95 59,32 / 4.594,1 ms)* | 330–334 → **9** *(−97,3 %; 14–16 inkl. Nachlauf)* | **58,0 FPS** / 6 (325 ms) | 123,50 MB / 2.560 / +11.791 *(Dev-StrictMode)* · **Behoben** (Prod: `19,5 ms`, `0` LT!) |
| `06` | Paste 4.230 Z. + 40 Tasten | p50 55 ms / p95 118–158 ms | **p50 33,37 ms** *(p95 43,03 / Paste 81,62 ms)* | 169 → **4** *(−97,6 %; 6 im Vergleichslauf)* | **56,0 FPS** / 5 (299 ms) | 141,01 MB / 2.711 / +6.324 · **Behoben** (`1×` Viererpack) |
| `07` | Speichern-Button + 1,6s Settle | 1,6 s (2–3 Reqs) | **1.862,3 ms** | 2–3 → **11** *(12,2 KB)* | **57,0 FPS** / 1 (102 ms) | 151,76 MB / 2.855 / +978 · `crdt-state`, `compact`, `backups`, `backups/10 minutes` |
| `08` | 8 Notizen anlegen (Batch) | p50 500–580 ms (170 Reqs) | **p50 196,69 ms** *(p95 404,53 / 7.376,4 ms)* | 170–173 → **236** *(191 im Vergl.)* | 31,1 FPS / 30 (2.293 ms) | 107,77 MB / 3.083 / −15.607 · **21× Viererpack (84 GETs)** + `24× download` |
| `09` | Notiz wechseln (Sidebar + Tab, 8×) | 480 / 310 ms (72–82 Reqs) | **p50 281,0 / 308,2 ms** *(4.496,6 ms ges.)* | 72–82 → **73** *(76 im Vergl.)* | **17,1 FPS** / 19 (2.487 ms) | 124,55 MB / 4.440 / +19.000 · **Kritisch/Hoch**: Editor-Voll-Remount (`16× ws-ticket`) |
| `10` | Ordner anlegen | – | **übersprungen** | 0 | – | Button im View nicht sichtbar |
| `11` | Notiz löschen | 1,5 s (6 Reqs) | **1.543 ms** *(Baseline; `partA` Timeout)* | 6 → **7–11** | 52,0–58,5 FPS / 2–3 LT | 69,76–116,55 MB / −27.393 Listener · **Stabil** |
| `20` | Todos öffnen | 0,49–0,56 s (0 Reqs) | **561 ms** *(Baseline `ab07e53`)* | 0 → **12** | 48,0 FPS / 1 (62 ms) | 92,34 MB / 2.764 / +1.393 · `2×` Viererpack |
| `21` | Todo anlegen (einzeln) | 0,56–1,16 s (6–7 Reqs) | **653 ms** *(Baseline `ab07e53`)* | 6–7 → **9** | 44,6 FPS / 2 (221 ms) | 99,22 MB / 2.963 / +690 · `1×` Viererpack |
| `22` | 10 Todos anlegen (Batch) | p50 296 ms (11 Reqs) | **p50 367 ms** *(max 539 / 4.137 ms ges.)* | 11 → **50–56** | 38,8 FPS / 18 (1.584 ms) | 102,42 MB / 3.579 / +1.716 · **`10–11×` Viererpack (40–44 GETs)** |
| `23` | Todo Detail öffnen & editieren | 1,0 s (9 Reqs) | **1.430 ms** *(Baseline `ab07e53`)* | 9 → **14** | 34,6 FPS / 5 (514 ms) | 100,98 MB / 3.683 / +2.447 · `2×` Viererpack |
| `24` | 3 Subtasks anlegen | 1,9 s (3 Reqs) | **p50 684 ms/Subtask** *(2.073 ms ges.)* | 3 → **16** | 37,9 FPS / 6 (748 ms) | 80,21 MB / 2.775 / −5.735 · `3×` Viererpack |
| `25` | Todo abhaken | 0,76 s (5 Reqs) | **771 ms** *(Baseline `ab07e53`)* | 5 → **10** | 21,4 FPS / 4 (455 ms) | 86,44 MB / 2.782 / +1.982 · `2×` Viererpack |
| `26` | Todo löschen | 0,91 s (3 Reqs) | **967 ms** *(Baseline `ab07e53`)* | 3 → **13** | 36,7 FPS / 3 (364 ms) | 82,92 MB / 2.918 / +1.361 · `2×` Viererpack |
| `27` | Suche (`Ctrl+K`, tippen) | p50 17–41 ms (0–2 Reqs) | **p50 22,20 ms** *(Open 256,3 ms; 1.309,2 ms)* | 0–2 → **0** *(Probe 4c: 1)* | 48,6 FPS / 2 (249 ms) | 76,90 MB / 2.677 / +558 · **Gut** (`p95 29,18 ms`, `max 39,14 ms`) |
| `28` | Einstellungen (8 Reiter) | 78–120 ms/Tab (5 Reqs) | **41,4–120,8 ms/Tab** *(Open 532,4 / 2.226,3 ms)* | 5 → **2** *(0,6 KB)* | 48,6 FPS / 3 (405 ms) | 75,29 MB / 2.771 / −357 · **Verbessert** (`1× GET api-tokens`) |
| `29` | Window Focus / Visibility Check | 2,5 s (26–33 Reqs) | **1.515,1 ms** | 26–33 → **3** *(−89 %; **0× `crdt-state`**)* | **59,6 FPS** / **0 (0 ms)** | 98,09 MB / 2.929 / +19 · **Behoben** (`10,3 ms` Script) |

*Tab-Einzelzeiten in `28` (`partA_output.txt`): Account `41,4 ms`, Appearance `69,7 ms`, Calendar `97,8 ms`, Notes `80,8 ms`, Todos `71,0 ms`, Extensions `67,6 ms`, Access `43,3 ms`, About Tide `120,8 ms`.*

---

### Tabelle 2: Kalender (`C1`–`C8`, `1440×900`, `phase3_results.json`)

| ID | Aktion | Vorher 23.11. (`9cd3b21`) | Jetzt 24.11. (`phase3_results.json`) | Requests (23. → 24.) | FPS / Long Tasks / Script | Heap / Nodes / Listener-Delta & Bewertung |
|---|---|---|---|---|---|---|
| `C1` | Kalender öffnen (Woche, 42 Spalten) | 0,33–0,59 s (0 Reqs) | **360,7 ms** | 0 → **0** | **64,2 FPS** / **0 (0 ms)** / `1,0 ms` | 60,04 MB / 2.258 / ±0 · `42 dayColumns`; mit gefülltem Plan bis `3.907` Nodes |
| `C2` | Termin anlegen + Popover | 0,56 s (9 Reqs) | **1.699,8 ms** *(inkl. „Ohne Tag speichern“)* | 9 → **12** | 102,9 FPS / 5 (328 ms) / `582,6 ms` | 85,69 MB / 2.398 (+140) / +2.175 · `1× POST`, `2× PUT`, `2×` Viererpack |
| `C3` | Termin bearbeiten (Auto-Save) | 1,26 s (2 Reqs) | **1.887,5 ms** *(Auto-Save 792,3 ms)* | 2 → **5** | 51,6 FPS / 5 (364 ms) / `551,0 ms` | 94,04 MB / 2.517 (+119) / +1.155 · `1× PUT (15,1 ms)` + `1×` Viererpack |
| `C4` | 8 Termine anlegen (Batch) | p50 1,26 s (96 Reqs) | **p50 1.168,4 ms** *(min 1.051 / max 1.458 / 10.006,9 ms)* | 96 → **114** | 103,1 FPS / **26 (1.784 ms)** / `4.478,4 ms` | 92,28 MB / 3.398 (+881) / +2.604 · **`20×` Viererpack (80 GETs)** + **`2× HTTP 409`** (`EventPopover.tsx:258`) |
| `C5a` | Ansicht → `Tag` | 710 ms | **472,4 ms** | 0–3 → **0** | **61,2 FPS** / **0 (0 ms)** / `31,9 ms` | 99,56 MB / 3.743 (+345) / +490 · **Schneller (−33,5 %)** |
| `C5b` | Ansicht → `Monat` | 560 ms | **495,1 ms** | 0–3 → **4** | **56,1 FPS** / **0 (0 ms)** / `114,1 ms` | 106,73 MB / 4.221 (+478) / +660 · `1×` Viererpack |
| `C5c` | Ansicht → `Fortlaufend` (Agenda) | 550 ms | **508,9 ms** | 0–3 → **4** | 115,1 FPS / 1 (57 ms) / `80,6 ms` | 101,34 MB / 5.129 (+908) / +659 · `1×` Viererpack |
| `C5d` | Ansicht → `Woche` | 650 ms | **570,2 ms** | 0–3 → **4** | 162,5 FPS / 1 (79 ms) / `201,2 ms` | 105,48 MB / 6.806 (+1.677) / +1.139 · `42 dayColumns`, `1×` Viererpack |
| `C6` | Wochen-Navigation (9 Schritte) | 2,06 s (7 Reqs) | **3.093,8 ms** *(p50 343,7 / max 372,2 ms)* | 7 → **8** | 210,8 FPS / **2 (129 ms)** / `1.365,5 ms` | 160,37 MB / **11.390 (+4.584)** / +9.356 · `1×` Viererpack; bei vollem Settle Recycling auf `5.667` Nodes |
| `C7` | Termin Drag-Move (`+120px`) | *nicht gemessen* | **1.728,9 ms** | – → **5** | **55,6 FPS** *(bis 59,4)* / 2 (132 ms) / `575,3 ms` | 165,51 MB / 11.936 (+315) / +2.590 · **`1× PUT` (`8,3 ms`)** + `1×` Viererpack post-drop |
| `C8` | Termin löschen | *nicht gemessen* | **683,5 ms** | – → **5** | 115,3 FPS / **0 (0 ms)** / `141,0 ms` | 188,27 MB / 12.062 (+126) / +972 · `1× DELETE` + `1×` Viererpack |

*(Hinweis zu `C2`, `C4`, `C5c`, `C5d`, `C6`, `C8`: Im CDP-`rAF`-Sampler traten bei asynchronen/Burst-Frames vereinzelt FPS-Werte > 60 Hz auf; maßgeblich für die Blockierungsbewertung sind Dauer, Long Tasks und Script-Zeit.)*

---

### Tabelle 3: Mobile `390×844 @ 4× CPU` (Dev `:3001` UND Prod `:3099`, `phase3_results.json`)

| Szenario | Metrik | Vorher 23.11. | **Jetzt Dev `:3001`** | **Jetzt Prod `:3099`** | Delta / Bewertung |
|---|---|---|---|---|---|
| **`P2` Cold-Load `/auth`** | FCP / LCP | 3.236 ms | – | **296 ms** | **−90,9 %** |
| | Load / TBT / Script | 3.394 ms / 140 ms / 278 ms | – | **189,8 ms / 25 ms / 66,9 ms** | Load **−94,4 %**, TBT **−82,1 %**, Script **−75,9 %** |
| **Logged-in Reload (Hydration)** | Load / FCP / LCP | – | 1.211,6 ms / 124 ms / 2.004 ms | **227,4 ms / 116 ms / 640 ms** | **Prod LCP −68,1 % vs. Dev** (`1,24 MB` vs. `9,26 MB`) |
| | Long Tasks / Reqs / Heap | – | 13 (2.268 ms) / 57 / 64,24 MB | **1 (229 ms) / 76 / 15,23 MB** | **−89,9 % Long-Task-ms in Prod** (`2.790` vs. `1.625` Nodes) |
| **BottomNav → Notizen** | Dauer / LT / Script / FPS | – | 600,0 ms / 1 (75 ms) / 65,4 ms / 58,2 | **577,5 ms / 1 (56 ms) / 30,9 ms / 58,3** | `0` Reqs; Script in Prod **−52,8 %** |
| **BottomNav → Todos** | Dauer / LT / Script / FPS | – | 540,1 ms / 0 / 17,8 ms / 121,0 | **549,5 ms / 0 / 25,8 ms / 123,2** | `0` Reqs in Prod (`2` Reqs in Dev) |
| **BottomNav → Kalender** | Dauer / LT / Script / FPS | – | 539,0 ms / 0 / 31,9 ms / 185,0 | **620,1 ms / 1 (98 ms) / 77,3 ms / 151,4** | `+1.238` DOM-Nodes in Prod (`4.085` gesamt) |
| **Mobile Suche öffnen** | Dauer / LT / Script | – | 1.523,5 ms / 1 (123 ms) / 163,2 ms | **1.483,5 ms / 1 (96 ms) / 103,2 ms** | `moreOk: true`, `searchClicked: false` |
| **Mobile Cal Subview → Tag** | Dauer / LT / Script / Reqs | – | *(413,8 ms, `clicked: false`)* | **494,4 ms / 3 (602 ms) / 148,3 ms / 12** | `41,7 FPS`, max LT `434 ms`, `8` API-Reqs |
| **Mobile Cal Subview → Woche** | Dauer / LT / Script / Reqs | – | *(415,9 ms, `clicked: false`)* | **444,5 ms / 2 (336 ms) / 356,9 ms / 7** | **`17,4 FPS`**, max LT `229 ms`, `4` API-Reqs |
| **Mobile Cal Subview → Agenda** | Dauer / LT / Script / Reqs | – | *(414,9 ms, `clicked: false`)* | **416,1 ms / 0 / 4,2 ms / 0** | `123,4 FPS`, sauber |
| **Mobile Cal Subview → Monat** | Dauer / LT / Script / Reqs | – | *(414,3 ms, `clicked: false`)* | **479,1 ms / 0 / 59,4 ms / 0** | `59,1 FPS`, sauber |
| **Mobile FAB öffnen** | Dauer / LT / Script / Reqs | – | 697,1 ms / 1 (62 ms) / 100,2 ms / 0 | **673,7 ms / 0 / 49,1 ms / 14** | Prod `58,7 FPS`, `0` LT |

---

### Tabelle 4: Production (`:3099`) vs. Dev (`:3001`) & Bundle-/Asset-Audit

#### 4.1 Production vs. Dev (Cold-Load `P1`/`P2` & Explorativer Probe 1 Interaktiv)

| Szenario | Metrik | Vorher 23.11. | **Jetzt Dev `:3001`** | **Jetzt Prod `:3099`** | Delta / Bewertung |
|---|---|---|---|---|---|
| **`P1` Desktop `/auth` (1× CPU)** | FCP / LCP | 260 ms | – | **164 ms** | **−36,9 %** |
| | Load / TBT / Long Tasks | 167 ms / 0 ms / 0 | – | **80,4 ms / 0 ms / 0** | Load **−51,9 %** |
| | Transfer / Requests | 753 KB (21 Reqs) | – | **662,7 KB (20 Reqs)** | **−12,0 %** |
| **`P2` Mobile `/auth` (4× CPU)** | FCP / LCP | 3.236 ms | – | **296 ms** | **−90,9 %** |
| | Load / TBT / Script | 3.394 / 140 / 278 ms | – | **189,8 / 25 / 66,9 ms** | Load **−94,4 %**, TBT **−82,1 %** |
| **Probe 1: 81 Zeichen tippen** | Keystroke `p50` / `p95` / `max` | – | 24,5 / 46,6 / 320,3 ms | **19,5 / 36,7 / 46,6 ms** | **−20,4 % p50 / −85,5 % max** |
| | FPS / Long Tasks / Script | – | 57,5 FPS / 2 (251 ms) / 782,9 ms | **59,9 FPS / 0 (0 ms) / 134,5 ms** | **−82,8 % Script**, `0` Long Tasks |
| | Requests / Heap / Listener Δ | – | 10 Reqs (`1×` 4er) / 157,4 MB / +1.200 | **5 Reqs (`0×` 4er) / 31,4 MB / +609** | **−80 % Heap-Baseline** in Prod |
| **Probe 1: 8× Tab-Switch** | Gesamt / `p50` / `max` | – | 3.863,0 / 466,1 / 658,6 ms | **1.217,8 / 148,1 / 203,9 ms** | **−68,5 %** gesamt |
| | FPS / Long Tasks / Script | – | 22,3 FPS / 17 (2.206 ms) / 3.112,1 ms | **33,0 FPS / 0 (0 ms) / 412,9 ms** | **−86,7 % Script**, aber **23 Reqs** (`18` API) durch Remount! |

#### 4.2 Production Bundle & `web/public/` Asset-Audit

| Kategorie | 23.11.2026 (`9cd3b21`) | 24.11.2026 (`0f18f76`) | Delta / Befund |
|---|---|---|---|
| **`.next/static/chunks` Gesamt** | 4,81 MB roh / 1,44 MB gz (52 Dateien) | **4,51 MB roh / 1,38 MB gz** (64–68 JS-Chunks) | **−6,2 % roh / −4,2 % gz** |
| **Top-5 JS-Chunks** | Top 3 = `2,76 MB` | 1. `0pi500fan96cp.js`: **`1.079,44 KB`**<br>2. `0itnq4j83vvmt.js`: **`556,20 KB`**<br>3. `1eqc689j7orby.js`: **`370,17 KB`**<br>4. `16vez9z_voq8w.js`: **`255,68 KB`**<br>5. `294jxez_2j-jm.js`: **`220,35 KB`** | Top 3 = **`2.005,81 KB` (`2,01 MB`, −27,2 %)** |
| **Ungenutzte `package.json` Deps** | 3 (`recharts`, `@xyflow/react`, `iconsax-react`) | **8 ungenutzte Deps** (`+ @tiptap/extension-bubble-menu`, `highlight`, `underline`, `tiptap-extension-resize-image`, `y-prosemirror`) | Bereinigen |
| **`web/public/` Gesamt (`64,13 MB`)** | ~67 MB | `2.989` Emoji-SVGs (**`40,84 MB`**), `tide.apk` (**`22,43 MB`**), `favicon.png` (**`358,46 KB`**, `3×` beim Login) | APK aus Repo auslagern, Favicon `< 20 KB` |

---

### Tabelle 5: Backend Direct Benchmark (`http://localhost:8081`, 30 Endpunkt-Gruppen) + Node `v24.21.0` WebCrypto

#### 5.1 Go-API Endpunkte (`:8081`)

| # | Endpunkt-Gruppe | `n` | 23.11. p50 | **24.11. p50** | **24.11. p95 / max** | Wire-Payload / Header / Bewertung |
|---|---|---:|---:|---:|---:|---|
| 1 | `GET /health` | 20 | 0,83 ms | **0,50 ms** | 1,61 / 3,91 ms | `2 B`, `CL: 2`, `0` Fehler |
| 2 | `GET /api/v1/auth/me` | 20 | 0,88 ms | **1,75 ms** | 7,85 / 8,87 ms | `823 → 688 B` (`gzip`, `no-store`) |
| 3 | `POST /api/v1/auth/ws-ticket` | 10 | 0,99 ms | **0,88 ms** | 4,63 / 4,63 ms | `94 → 109–110 B` (`gzip`) |
| 4 | `POST /api/v1/files` (Notiz) | 10 | 1,91 ms | **2,44 ms** | 16,18 / 16,18 ms | `404 B`, `CL: 404` |
| 5 | `PUT /api/v1/files/:id` *(validierter Lauf)* | 10 | 1,81 ms | **1,48 ms** *(Microbench: `2,61 ms`)* | **1,91 ms** *(Microbench: `4,01 / 4,64 ms`)* | `363–414 B`, **`0` Fehler** |
| 6 | `GET /api/files/:id/crdt-state` | 10 | 1,94 ms | **3,35 ms** | 8,77 / 8,77 ms | `45 → 69 B` (`gzip`) |
| 7 | Upload `10 KB` (Initial) | 5 | 5,49 ms | **7,40 ms** | max 15,68 ms | `CL: 0`, `0` Fehler |
| 8 | Upload `10 KB` (Overwrite) | 5 | 11,14 ms | **6,70 ms** | max 8,69 ms | **−39,9 %** vs. 23.11. |
| 9 | Upload `10 KB` (Kombiniert) | 10 | 5,76 ms | **7,29 ms** | max 15,68 ms | `0` Fehler |
| 10 | Upload `250 KB` (Initial) | 3 | 19,80 ms | **7,35 ms** *(früh: `6,26 ms`)* | max 6,53–8 ms | **−62,9 %** vs. 23.11. |
| 11 | Upload `250 KB` (Overwrite) | 3 | 19,08 ms | **31,03 ms** *(früh: `7,21 ms`)* | – | **4,2× langsamer als Initial** durch sync. `io.ReadAll` |
| 12 | Upload `250 KB` (Kombiniert) | 6 | 19,08 ms | **6,53 ms** | max 8,59 ms | `0` Fehler |
| 13 | Upload `2 MB` (Initial) | 2 | 13,47 ms | **11,52 ms** *(früh: `15,12 ms`)* | max 18,03 ms | **−14,5 %** vs. 23.11. |
| 14 | Upload `2 MB` (Overwrite) | 2 | 22,31 ms | **20,36 ms** *(früh: `22,30 ms`)* | max 81,24 ms | **1,8× langsamer als Initial** (`files.go:438-460`) |
| 15 | Upload `2 MB` (Kombiniert) | 4 | 22,31 ms | **18,03 ms** | max 81,24 ms | `0` Fehler |
| 16 | Download `250 KB` | 5 | 2,46 ms | **2,33 ms** *(früh: `3,54 ms`)* | max 7,60 ms | `256.000 B`, **kein `ETag` / `Content-Length`** |
| 17 | Download `2 MB` | 5 | 9,11 ms | **7,01 ms** *(früh: `9,41 ms`)* | max 60,60 ms | `2.097.152 B`, **kein `ETag` / `Content-Length`** |
| 18 | `GET /files` N=10 (all) | 10 | 1,46 ms | **2,94 ms** | max 6,42 ms | `4.660 → 707 B` (`gzip`, **−84,8 %**) |
| 19 | `GET /files` N=10 (events) | 10 | 1,57 ms | **2,51 ms** | max 11,28 ms | `2.335 → 471 B` (`gzip`, **−79,8 %**) |
| 20 | `GET /files` N=50 (all) | 10 | 1,63 ms | **3,75 ms** | max 5,95 ms | `23.336 B` roh (`gzip`) |
| 21 | `GET /files` N=50 (events) | 10 | 1,23 ms | **2,66 ms** | max 5,66 ms | `11.693 → 1.207 B` (`gzip`, **−89,7 %**) |
| 22 | `GET /files` N=150 (all) | 10 | 5,07 ms | **7,57 ms** | max 12,42 ms | `70.062 B` roh (`gzip`) |
| 23 | `GET /files` N=150 (events) | 10 | 2,85 ms | **4,76 ms** | max 7,94 ms | `35.100 B` roh (`gzip`) |
| 24 | 20 parallele Writes | 20 | 45,2 ms | **64,4 ms** | **71,0 / 71,3 ms** | `411 → 410 B`, p95 **−38,9 %**, `0` Fehler |
| 25 | 20 parallele Reads (N=150) | 20 | 32,7 ms | **29,5 ms** | **50,2 / 50,3 ms** | `70.222 B` roh (`gzip`), p95 **−37,5 %** |
| 26 | `POST /tasks` / `GET /tasks` | 15 / 10 | 1,09 / 0,83 ms | **0,78 / 1,25 ms** | max 9,03 / 2,13 ms | `GET 4.080 → 690 B` (`gzip`, **−83,1 %**) |
| 27 | `PUT /tasks/:id` / `DELETE /tasks/:id` | 10 / 10 | 1,00 / 0,48 ms | **1,53 / 0,55 ms** | max 4,03 / 1,32 ms | `gzip` auf `PUT`, `0` Fehler |
| 28 | `POST /todos` / `GET /todos` | 10 / 10 | 0,81 / 1,13 ms | **1,41 / 2,06 ms** | max 6,20 / 6,19 ms | `GET 4.652 → 661 B` (`gzip`, **−85,8 %**) |
| 29 | `PATCH /todos/:id` | 10 | 0,93 ms | **1,89 ms** | max 4,12 ms | `gzip`, `0` Fehler |
| 30 | `DELETE /todos/:id` | 10 | 1,61 ms | **0,81 ms** | max 2,00 ms | **−49,7 %** vs. 23.11., `0` Fehler |

*(Alle 30 Endpunkt-Gruppen liefen mit **`0` Fehlern**.)*

#### 5.2 WebCrypto Microbenchmarks (Node `v24.21.0`)

| Operation | 23.11.2026 | **24.11.2026** | Bewertung |
|---|---:|---:|---|
| RSA-4096 Keygen | 905,95 ms | **831,53 ms** | Einmalig bei Registrierung |
| PBKDF2 (600k Iterationen) `deriveKey` | 260,19 ms | **268,43 ms** | ~268 ms pro Ableitung |
| AES-256-GCM Vault Encrypt / Decrypt | 0,41 / 0,30 ms | **6,23 / 2,75 ms** | Warmup/JIT-Streuung, weiterhin < 7 ms |
| RSA-4096 Encrypt / Decrypt (32 B DEK) | 0,83 / 12,86 ms | **1,33 / 14,22 ms** | Durch `Promise.all` (`createFsSlice.ts:362`) nicht mehr seriell blockierend |
| AES-256-GCM Encrypt / Decrypt (64 KB) | 1,00 / 0,49 ms | **2,29 / 0,96 ms** | < 2,3 ms |

---

## 6. Exploratory Discovery Log (Part B — 30% Budget)

1. **Probe 1 (`probe1_prodVsDev`) — Prod (`:3099`) vs. Dev (`:3001`) unter identischen Nutzer-Flows:**
   - *81-Zeichen-Tippen:* Dev `p50 24,5 ms / p95 46,6 ms / max 320,3 ms`, `57,5 FPS`, `2` LT (`251 ms`), `782,9 ms` Script, `10` Reqs (`1×` Viererpack), `157,35 MB` Heap. **Prod `:3099`:** **`p50 19,5 ms / p95 36,7 ms / max 46,6 ms`**, **`59,9 FPS`**, **`0` Long Tasks (`0 ms`)**, **`134,5 ms` Script** (`−82,8 %`), `5` Reqs (`0×` Viererpack), `31,40 MB` Heap. *(In einem zweiten Prod-Check `p50 27,6 ms / p95 57,2 ms / 57,4 FPS / 1 LT 70 ms / 975,8 ms Script`.)*
   - *8× Tab-Switch:* Dev `3.863,0 ms` (`p50 466,1 ms`), `22,3 FPS`, `17` LT (`2.206 ms`), `3.112,1 ms` Script, `71` Reqs (`60` API, `4×` Viererpack). **Prod `:3099`:** **`1.217,8 ms` (`p50 148,1 ms`, max `203,9 ms`)**, `33,0 FPS`, **`0` Long Tasks**, `412,9 ms` Script (`−86,7 %`), **`23` Reqs (`18` API)** *(bzw. `1.613,2 ms / p50 170,5 ms / 3 LT 202 ms / 24 Reqs`)*.
   - *Erkenntnis:* Normales Tippen ist in Produktion sauber; der **`key={activeTabId}`-Remount** in `Editor.tsx:47` verursacht hingegen selbst in Prod 23–24 API-Calls (`ws-ticket`, `download`, `variables`, `PUT`) und 148–170 ms Latenz pro Switch.
2. **Probe 2 (`probe2_formulasEmojisLargeDoc`) — Stress-Dokument mit KaTeX-Formeln (`InlineFormulas`) + `AnimatedEmoji` + 20 Tasten:**
   - Ergebnis: `3.983,5 ms`, **`p50 125,4 ms`**, **`p95 362,6 ms`**, **`31,3 FPS`**, **`18` Long Tasks (`1.782 ms`, max `172 ms`)**, `1.790,3 ms` Script, `252` Decoration-DOM-Nodes (`+364` Nodes auf `5.271`), `21` Reqs (`2×` Viererpack) *(gegenüber `p50 49,4 ms / p95 90,0 ms / 5 LT 352 ms / +425 Nodes` bei geringerer Formel-Dichte)*.
   - *Erkenntnis:* Beweist direkt die fehlende `DecorationSet.map()`-Nutzung und fehlendes KaTeX-Caching in `InlineFormulas.ts:68, 141, 166-171` sowie `AnimatedEmoji.ts:20-40, 51` und `BlockId.ts:18-27, 117-156`.
3. **Probe 3 (`probe3_tabThrashRetention`) — `72×` Tab-Thrashing + erzwungene GC (`HeapProfiler.collectGarbage`):**
   - Ergebnis: Vorher `87,43 MB` Heap / `4.005` Listener / `5.271` Nodes → Peak `78,42 MB` / `4.167` Listener / `5.501` Nodes → Nach Schließen & GC: **`64,31 MB` Heap (`−23,12 MB`)**, **`3.870` Listener (`−135`)**, `5.367` Nodes (`+96`). *(Konsistent mit dem `12×`-Thrash-Lauf + 5 Tabs schließen: `140,47 MB → 73,92 MB`, `33.200 → 6.161` Listener).*
   - *Erkenntnis:* Kein permanentes Memory-/Listener-Leak nach Unmount; frühere Dev-Anstiege vor GC stammen von V8-Lazy-GC + StrictMode.
4. **Probe 4 (`probe4_socialAndSearch` + Prod-CSP/Rewrite) — `SocialHub`, `SearchOverlay` & Prod `:3099` Netzwerk-Konfiguration:**
   - `SocialHub` open: `1.174,4 ms`, `51,4 FPS`, `3` LT (`267 ms`), `291,8 ms` Script, `8` Reqs (`7` API), `+57` Nodes, `+3,13 MB` Heap — sauber lazy geladen.
   - `SearchOverlay` initial open: `1.041,5 ms`, `94,5 FPS`, `2` LT (`276 ms`), `268,8 ms` Script, `0` Reqs; post-mutation reopen: `1.247,9 ms`, `53,6 FPS`, `2` LT (`225 ms`), `1` Req (`files?type=index&recursive=true`), Tippen `p50 31,4 ms / p95 43,8 ms`.
   - **Architektur-Befund (`next.config.ts:69, 95-99`):** CSP `connect-src 'self' https: wss:` blockiert direktes `http://localhost:8081`, während der `/api/*`-Rewrite ohne `BACKEND_PORT=8081` beim Build auf `:8080` fällt (`500 Internal Server Error`).

---

## 7. Prioritized Action Plan (Roadmap 76 → 90+)

| Priorität | Maßnahme | Ziel-Dateien | Erwarteter Effekt | Geschätzter Score-Gewinn | Aufwand |
|---:|---|---|---|---|---|
| **P0** | **`fetchDirectory`-Viererpack aufteilen & debouncen:** Granulare Methoden (`fetchFiles`, `fetchEvents`, `fetchTasksAndTodos`), `300 ms` Trailing-Debounce auf SSE/Mutations-Refreshes, `2000 ms` Short-TTL-Cache in `apiFetch`; Login-Doppelabrufe (`tasks`/`todos` `3×`, `files?recursive` `2×`) abstellen | `web/src/store/slices/createFsSlice.ts`, `web/src/lib/api.ts`, `useRealtimeSync.ts` | **−70 % bis −85 % Requests** in Batches (`C4`: `114 → ~35`, `08`: `236 → ~90`, `22`: `50 → ~12`) | **+5–6 Pkt.** (Todos, Kalender, Netzwerk) | mittel |
| **P1** | **ProseMirror-Dekorationen inkrementell & KaTeX cachen:** `DecorationSet.map(tr.mapping, tr.doc)` + Modul-LRU-Cache für `katex.renderToString()` in `InlineFormulas`; kein Rebuild bei reinem `selectionSet`; `AnimatedEmoji` & `BlockId` auf `tr.steps`-Ranges begrenzen; `editor.getJSON()` auf `500 ms` debouncen; `editorContent`/`editorVersion` aus Root-State lösen | `InlineFormulas.ts`, `AnimatedEmoji.ts`, `BlockId.ts`, `useTipTapConfig.ts`, `web/src/app/page.tsx` | KaTeX/Emoji-Tippen von **`p50 125,4 ms / 18 LT` auf `< 25 ms / 0–1 LT`**; **58+ FPS** | **+4–5 Pkt.** (Editor, Mobile) | mittel |
| **P2** | **Kein Voll-Remount bei Tab-/Notiz-Wechsel:** `key={props.activeTabId}` entfernen oder LRU-Keep-Alive-Pool (letzte 3 `Y.Doc`/Provider-Instanzen) + kontrollierter Content-/Doc-Swap | `web/src/components/Editor.tsx:47`, `useTipTapConfig.ts` | Tab-Switch Prod `148 → < 40 ms`, Dev `308 → < 80 ms`, **−75 % API-Reqs** in `09` | **+3–4 Pkt.** (Editor) | hoch |
| **P3** | **Kalender `eventsByDay`-Map & `409`-Race fixen:** `eventsByDay: Map<string, CalendarEvent[]>` in `CalendarWeekTimeGrid` per `useMemo` vorab bilden statt `allEvents` an 42 `<DayColumn>`s; Version-Sync nach `POST` in `EventPopover.tsx:258` | `CalendarWeekTimeGrid.tsx:226-264`, `DayColumn.tsx`, `EventPopover.tsx:258` | `0× HTTP 409` in `C4`, `C4` Long Tasks **−50 %**, weniger Rerenders in `C6`/Mobile | **+2–3 Pkt.** (Kalender, Mobile) | mittel |
| **P4** | **`next.config.ts` CSP & Rewrite-Port vereinheitlichen:** Rewrite-Ziel aus `NEXT_PUBLIC_API_URL` ableiten und `NEXT_PUBLIC_API_URL` in `connect-src` zulassen | `web/next.config.ts:69, 95-99` | Zuverlässiger `:3099`-Prod-Betrieb ohne `BACKEND_PORT`-Stolperfalle | **+1 Pkt.** (Prod-Stabilität) | klein |
| **P5** | **Backend `ETag`/`Content-Length`, asynchroner Backup-Read & Bundle-Hygiene:** Header in `DownloadFile` setzen, `io.ReadAll` in `files.go:438-460` in Goroutine verlagern; 8 ungenutzte `package.json`-Deps entfernen; `favicon.png` (`< 20 KB`) & `tide.apk` aus `web/public/` bereinigen | `cloud/internal/api/files_blobs.go:149-205`, `cloud/internal/api/files.go:438-460`, `web/package.json`, `web/public/` | `250 KB` Overwrite **4,2× schneller**, `2 MB` **1,8× schneller**, `304`-Caching & kleineres Deploy | **+1–2 Pkt.** (Backend, Erstladen) | klein |
