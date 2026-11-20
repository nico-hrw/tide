# Mobile Kalender: Schnellbearbeitung Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mobile Tagesansicht bekommt maßstäbliche Termine, eine Zeitlinie auf der echten Uhrzeit, ein Overlay-Raster zum Schnellbearbeiten (Halten) und Entwürfe per Doppeltipp.

**Architecture:** Reine, getestete Mathematik (`timelineMath.ts`, `quickEditMath.ts`) und ein reiner Gesten-Detektor (`listGestures.ts`) tragen die Logik. `DbTimelineDay` wird auf explizite Höhen umgestellt und liefert Segment-Metadaten (`data-seg-*`) für die Tipp-Zuordnung. Ein neues Overlay `QuickEditGrid` zeigt das Raster. `MobileCalendarTab` hält den Zustand und öffnet für Entwürfe das vorhandene `MobileEditEventSheet`.

**Tech Stack:** Next.js/React 19, TypeScript, Vitest 2 (`npm test`), framer-motion, date-fns, bestehende Stores und Callbacks.

**Spec:** `web/docs/superpowers/specs/2026-11-20-mobile-calendar-quick-edit-design.md`

## Global Constraints

- Verhalten außerhalb der beschriebenen Änderungen bleibt gleich (AGENTS.md Regel 1). Wochen-, Monats- und Desktop-Kalender bleiben unberührt.
- `cd web && npx tsc --noEmit` muss 0 Fehler liefern. Kein neues `any`. Keine hartkodierten Farben, Radien oder Blur-Werte, sondern `designTokens` und die vorhandenen CSS-Variablen/`paletteFor`.
- HTTP nur über `apiFetch` (hier nicht nötig, es gibt keine neuen Aufrufe).
- Dateien unter 500 Zeilen. `MobileAgendaTimeline.tsx` (562 Zeilen) darf nicht wachsen, neue Logik geht in neue Dateien.
- Nicht anfassen: `crypto.ts`, `cryptoV2.ts`, `sqlite.go`, `layout.tsx`, `manifest.json`.
- Raster rastet auf **10 min** (`SNAP_MIN = 10`), Standarddauer eines Entwurfs **60 min**, Mindestdauer im Raster **10 min**, Halten **450 ms**, Doppeltipp-Fenster **300 ms**, feste Pause **34 px**.
- `setEvDrag(null)`-artige Zustände in Touch-Handlern mit `flushSync` beenden, `touchAction` ändert sich nicht mitten in einer Berührung (`docs/calendar/MOBILE_TOUCH_GESTURES.md`).
- Nur eigene Dateien stagen (`git add <Pfad>`), nie `git add -A`: im Arbeitsverzeichnis liegen fremde Änderungen (`MobileLayout.tsx`, `.gitignore`, `MobileAndroidBanner.tsx`).
- `web/docs/COMPONENTS.md` aktualisieren (Regel 10).

## Review Focus

- Termin über Mitternacht oder ohne `end`: Länge als 60 min annehmen, Anzeige und Zuordnung dürfen nicht abstürzen.
- Doppeltipp nahe 23:xx: Entwurf wird so begrenzt, dass Start ≥ 00:00 und Ende ≤ 24:00 desselben Tages.
- Doppeltipp auf Ganztags-Pillen, Todo-Zeilen oder Datumskopf: kein Entwurf an falscher Stelle, nächstes Segment per Abstand wählen. Auf Buttons in Karten (Löschen, Abhaken) kein Entwurf.
- Leerer Tag: Doppeltipp erzeugt Entwurf um 09:00 (heute: nächste volle Stunde).
- Termin mit Wiederholung (ID mit `_`-Suffix): Halten verschiebt wie das bestehende Ziehen in der Wochenansicht (gleicher Speicherpfad), kein Duplikat.
- Horizontales Wischen (Tageswechsel) darf kein Halten oder Doppeltippen auslösen.

---

### Task 0: Basis abgleichen

**Files:** keine

- [ ] **Step 1:** `git fetch` und `git log HEAD..origin/main --stat -- web/src/components/Layout` ansehen. Auf dem Remote liegt mindestens `24087f0` ("calendar overlap readable, …"), das `MobileAgendaTimeline.tsx` berühren kann.
- [ ] **Step 2:** Den Nutzer fragen, ob die ungesicherten Änderungen (`MobileLayout.tsx`, `.gitignore`) zuerst committet werden sollen. Danach `git pull --rebase --autostash`. Bei Konflikten in Dateien dieses Plans anhalten und fragen.
- [ ] **Step 3:** `cd web && npx tsc --noEmit && npm test` ausführen. Erwartet: tsc 0 Fehler, Tests grün (Ausgangslage notieren).

### Task 1: Mockups

**Files:**
- Create: `web/docs/design/mockups/mobile-quick-edit.html` (statisch, ohne Build, öffnet im Browser, Handybreite 390 px)

- [ ] **Step 1:** Vier Bildschirme nebeneinander: (a) Liste mit maßstäblichen Terminen, festen Pausen und der Zeitlinie in der aktiven, gewachsenen Pause; (b) Liste mit Zeitlinie in einer laufenden Karte; (c) Raster-Overlay mit aktivem Block (Griffe oben und unten, Zeit-Anzeige, ✓/✕, blasse Kontext-Termine); (d) Entwurf-Ablauf: Doppeltipp, Raster, danach das Formular. Farben aus den bestehenden CSS-Variablen und der Palette in `eventPalette.ts`.
- [ ] **Step 2:** Nutzer die Datei ansehen lassen, Änderungswünsche einarbeiten, erst nach Freigabe weiter zu Task 2. Commit: `docs(web): mockups for mobile quick edit`.

### Task 2: Zeitmathematik (rein)

**Files:**
- Create: `web/src/components/Layout/mobile/timelineMath.ts`
- Test: `web/src/components/Layout/mobile/__tests__/timelineMath.test.ts`

**Interfaces:**
- Produces:
  - `export const SNAP_MIN = 10; export const GAP_PX = 34; export const DEFAULT_DURATION_MIN = 60; export const DAY_PX_PER_MIN = 0.8; export const DAY_MIN_BLOCK_PX = 56;`
  - `export interface SegRect { start: number; end: number; top: number; height: number }` (start/end in ms, top/height in px relativ zur Liste)
  - `export function blockHeightPx(startMs: number, endMs: number, pxPerMin?: number, minPx?: number): number`
  - `export function gapHeightPx(gapStartMs: number, gapEndMs: number, nowMs: number | null, pxPerMin?: number): number` (aktiv = `gapStart <= now < gapEnd` → echte Länge, mindestens `GAP_PX`; sonst `GAP_PX`)
  - `export type NowPlacement = { kind: 'before-first' } | { kind: 'after-last' } | { kind: 'in-block'; index: number; fraction: number } | { kind: 'in-gap'; index: number; fraction: number }` (`index` zählt Blöcke, bei `in-gap` ist es der Block davor)
  - `export function nowPlacement(blocks: Array<{ start: number; end: number }>, nowMs: number): NowPlacement`
  - `export function timeFromTap(segs: SegRect[], y: number, pxPerMin?: number): number`
  - `export function roundToStep(ms: number, stepMin?: number): number`
  - `export function draftRangeFromTime(rawMs: number, dayStartMs: number): { start: Date; end: Date }`

- [ ] **Step 1: Failing tests** in `timelineMath.test.ts` (Vitest, `describe/it/expect`), mit `const H = 3600000`:
  - `gapHeightPx(0, 3*H, null) === GAP_PX`, `gapHeightPx(0, 3*H, 1*H) === 180*0.8` (3 h × 60 × 0.8 = 144), `gapHeightPx(0, 10*60000, 5*60000) === GAP_PX` (nie kleiner als fest).
  - `blockHeightPx(0, 15*60000) === DAY_MIN_BLOCK_PX`, `blockHeightPx(0, 2*H) === 96`.
  - `nowPlacement([{start:H,end:2*H},{start:4*H,end:5*H}], 1.5*H)` → `{kind:'in-block', index:0, fraction:0.5}`; bei `3*H` → `{kind:'in-gap', index:0, fraction:0.5}`; bei `0` → `before-first`; bei `6*H` → `after-last`.
  - `timeFromTap` mit zwei Segmenten (Block 9–10 Uhr top 0 height 48, Pause 10–13 Uhr top 48 height 34, Block 13–14 top 82 height 48): `y=24` → 9:30; `y=65` (Mitte der Pause) → 11:30; `y=-30` → 9:00 minus `30/pxPerMin` Minuten; `y=200` → 14:00 plus Abstand; `y` zwischen Segmenten (Lücke ohne Segment) → Zeit des nächsten Segmentrands.
  - `roundToStep(9:04)` → 9:00, `9:05` → 9:10, `9:55` → 10:00.
  - `draftRangeFromTime(23:50 des Tages, dayStart)` → Start 23:00, Ende 24:00; `00:01 minus 30 min` (vor Tagesbeginn) → Start 00:00; normaler Fall 9:04 → 9:00–10:00.
- [ ] **Step 2:** `cd web && npx vitest run src/components/Layout/mobile/__tests__/timelineMath.test.ts`. Erwartet: FAIL (Modul fehlt).
- [ ] **Step 3: Implementieren** der oben genannten Signaturen. `timeFromTap`: Segment unter `y` suchen und linear interpolieren; sonst nächstgelegenen Segmentrand wählen; außerhalb der Liste Abstand mit `pxPerMin` in Zeit umrechnen. `draftRangeFromTime`: auf 10 min runden, Start in `[dayStart, dayStart + 24 h − 60 min]` klammern, Ende = Start + 60 min.
- [ ] **Step 4:** Test erneut ausführen. Erwartet: PASS.
- [ ] **Step 5:** Commit `feat(web): pure timeline math for mobile day view` (nur die zwei Dateien).

### Task 3: Maßstäbliche Liste und Zeitlinie

**Files:**
- Modify: `web/src/components/Layout/mobile/MobileAgendaTimeline.tsx` (Funktionen `NowLine`, `TimelineEventItem`, `DbTimelineDay`; nur so viel ändern wie nötig, Zeilenzahl nicht erhöhen)
- Modify: `web/src/components/Layout/mobile/AgendaParts.tsx` (`FreeGap` bekommt Prop `height?: number`, Standard 34, mit weicher Höhen-Transition)
- Create: `web/src/components/Layout/mobile/useNowTick.ts` nur falls `now` nicht ohnehin jede Minute aktualisiert wird (zuerst prüfen)

**Interfaces:**
- Consumes: `blockHeightPx`, `gapHeightPx`, `nowPlacement`, `DAY_PX_PER_MIN`, `DAY_MIN_BLOCK_PX`, `GAP_PX` aus Task 2.
- Produces: Jedes Block- und Pausen-Element trägt `data-seg-start`, `data-seg-end` (ms). `data-seg` markiert beide. Einzelne Karten haben `height = blockHeightPx(...)` (Karte füllt, Inhalt wird abgeschnitten, ausgeklappt wächst sie wie bisher); Cluster haben `height = max(blockHeightPx(clusterStart, clusterEnd), bisherige Lane-Höhe)`.

- [ ] **Step 1: Test** `__tests__/dayLayoutFlow.test.tsx` (React-Harness wie in `useEventsByDay.test.ts`, `createRoot` + `act`): `DbTimelineDay` mit `isToday`, Termine 9–10 und 14–15, `now` 11:00. Erwartung: genau ein `[data-seg]`-Pausen-Element hat eine Höhe über `GAP_PX` (die aktive Pause 10–14), das Element der Zeitlinie (`[aria-label="Jetzt"]`) liegt innerhalb dieser Pause; bei `now` 9:30 liegt es innerhalb der Karte 9–10 und alle Pausen haben `GAP_PX`; bei `now` 16:00 steht die Linie nach der letzten Karte.
- [ ] **Step 2:** Test ausführen. Erwartet: FAIL.
- [ ] **Step 3: Umbauen.** Einzelne Karte und Cluster auf explizite Höhe stellen, vertikale Außenabstände (`my-1`) durch Innenabstand ersetzen, damit Maße und Höhen übereinstimmen. Pausen mit `gapHeightPx(prevEnd, nextStart, isToday ? now : null)` und `data-seg-*`. Zeitlinie aus `nowPlacement` ableiten und absolut im Segment bei `top: fraction × 100 %` zeichnen (`in-block`, `in-gap`), bei `before-first` vor dem ersten, bei `after-last` nach dem letzten Segment (wie bisher am Rand). Das alte `nowIdx` entfällt. `now` muss sich mindestens jede Minute ändern.
- [ ] **Step 4:** Test PASS, dazu `npx tsc --noEmit`.
- [ ] **Step 5:** Auf dem Gerät/Emulator (`mcp__Claude_Browser__resize_window` preset mobile) prüfen: Linie wandert, aktive Pause wächst und schrumpft beim Start des nächsten Termins, lesbare Titel bei kurzen Terminen. Maßstab `DAY_PX_PER_MIN` und `DAY_MIN_BLOCK_PX` bei Bedarf anpassen. Commit `fix(web): proportional day list and true now-line`.

### Task 4: Raster-Mathematik und Overlay

**Files:**
- Create: `web/src/components/Layout/mobile/quickEditMath.ts`
- Create: `web/src/components/Layout/mobile/QuickEditGrid.tsx`
- Test: `web/src/components/Layout/mobile/__tests__/quickEditMath.test.ts`

**Interfaces:**
- Produces in `quickEditMath.ts`:
  - `export interface Range { start: number; end: number }` (ms)
  - `export function moveRange(r: Range, deltaMin: number, dayStartMs: number): Range` (Länge bleibt, auf 10 min gerastert, im Tag begrenzt)
  - `export function resizeStart(r: Range, deltaMin: number, dayStartMs: number): Range`
  - `export function resizeEnd(r: Range, deltaMin: number, dayStartMs: number): Range` (Mindestdauer `SNAP_MIN`, Ende ≤ Tagesende)
  - `export function pxToMin(px: number, hourHeightPx: number): number`
- Produces in `QuickEditGrid.tsx`:
  `export interface QuickEditTarget { id: string | null; title: string; color?: string; start: Date; end: Date }`
  `export interface QuickEditGridProps { day: Date; context: Array<{ id: string; title: string; color?: string; start: Date; end: Date }>; target: QuickEditTarget; mode: 'edit' | 'draft'; onConfirm: (start: Date, end: Date) => void; onCancel: () => void }`

- [ ] **Step 1: Failing tests** (`quickEditMath.test.ts`, Tag 00:00 = `dayStart`): `moveRange` 9:00–10:00 um +37 min → 9:40–10:40; um −600 min → 0:00–1:00; um +2000 min → 23:00–24:00. `resizeEnd` mit −120 min bei 9:00–10:00 → 9:00–9:10; `resizeStart` mit +120 → 9:50–10:00; `resizeStart` mit −9999 → 0:00–10:00. `pxToMin(48, 48) === 60`.
- [ ] **Step 2:** Ausführen, erwartet FAIL. **Step 3:** implementieren. **Step 4:** PASS.
- [ ] **Step 5: `QuickEditGrid`** als Overlay mit `position: fixed; inset: 0; z-index` über der Liste, abgedunkelter Hintergrund, Tagesraster (Stunden-Beschriftung links, Stundenhöhe 56 px) in einem scrollbaren Container, der beim Öffnen auf den aktiven Termin scrollt. Aktiver Block: Körper verschiebt (`moveRange`), obere und untere Kante (Griffe mindestens 44 px hoch) ändern Start/Ende. Touch-Handler mit `touchAction: 'none'` auf Block und Griffen, `preventDefault` beim Ziehen, nach dem Ende `flushSync` und die iOS-Scroll-Korrektur (`scrollTop ± 1`) wie in `MobileWeekGrid.tsx`. Kontext-Termine blass und nicht bedienbar. Anzeige der Zeiten beim Ziehen. ✓ → `onConfirm(start, end)`, ✕ → `onCancel`. Farben über `paletteFor(target.color)`. Mobile-Vorschau im Browser testen.
- [ ] **Step 6:** `npx tsc --noEmit`; Commit `feat(web): quick edit grid overlay for mobile day view`.

### Task 5: Gesten (Halten, Doppeltipp)

**Files:**
- Create: `web/src/components/Layout/mobile/listGestures.ts`
- Test: `web/src/components/Layout/mobile/__tests__/listGestures.test.ts`
- Modify: `web/src/components/Layout/mobile/MobileAgendaTimeline.tsx` (`DbTimelineDay`: neue optionale Props, Handler am Wurzel-`div`)

**Interfaces:**
- Produces in `listGestures.ts`:
  ```ts
  export interface GestureOptions { holdMs?: number; doubleTapMs?: number; moveTolerancePx?: number;
    onHold: (x: number, y: number, target: EventTarget | null) => void;
    onDoubleTap: (x: number, y: number, target: EventTarget | null) => void }
  export function createListGestures(o: GestureOptions): {
    start(x: number, y: number, target: EventTarget | null): void;
    move(x: number, y: number): void; end(): void; cancel(): void }
  ```
  Standard `holdMs = 450`, `doubleTapMs = 300`, `moveTolerancePx = 10`.
- Produces: neue optionale Props von `DbTimelineDayProps`: `onQuickEdit?: (ev: any) => void` und `onDraftAt?: (start: Date, end: Date) => void`.

- [ ] **Step 1: Failing tests** (`vi.useFakeTimers()`): Halten ohne Bewegung 450 ms → `onHold` einmal, danach kein Tipp-Ereignis beim Loslassen. Bewegung über 10 px vor 450 ms → kein `onHold`. Zwei kurze Tipps im Abstand von 200 ms an fast gleicher Stelle (≤ 24 px) → `onDoubleTap` einmal mit den Koordinaten des zweiten Tipps. Zweiter Tipp nach 400 ms → kein Doppeltipp. Ein Tipp mit Bewegung über 10 px zählt nicht als Tipp (Wischen).
- [ ] **Step 2:** Ausführen, FAIL. **Step 3:** implementieren (Timer, Zustand in einer Closure). **Step 4:** PASS.
- [ ] **Step 5: Einbinden in `DbTimelineDay`:** Touch-Handler am Wurzel-`div` (nur aktiv, wenn `onQuickEdit` oder `onDraftAt` übergeben). Ziel unter dem Finger: bei `onHold` das nächstgelegene Element `closest('[id^="ev-"]')` → Termin suchen, `onQuickEdit(ev)` (nur echte Termine, keine Todos). Bei Ereignissen auf `button, a, input` (Löschen, Abhaken, Aufklappen) nur das Halten erlauben, keinen Doppeltipp. Bei `onDoubleTap`: `SegRect[]` aus allen `[data-seg]` im Wurzel-`div` per `getBoundingClientRect()` bilden, `timeFromTap` → `draftRangeFromTime(raw, startOfDay(day))` → `onDraftAt(start, end)`. Der Doppeltipp macht ein davor ausgelöstes Aufklappen rückgängig (vorherigen `expandedEventId` in einem Ref merken). Leerer Tag: Start 09:00 (heute: nächste volle Stunde, aber höchstens 23:00).
- [ ] **Step 6:** `npx tsc --noEmit`, Commit `feat(web): hold and double-tap gestures for mobile day list`.

### Task 6: Zusammenschalten und Entwurfs-Formular

**Files:**
- Modify: `web/src/components/Layout/mobile/MobileCalendarTab.tsx` (Zustand `quickEdit`, Overlay rendern, nur im Modus `'day'` Handler übergeben)
- Modify: `web/src/components/Layout/mobile/MobileOverlaysAndModals.tsx` (Entwurf speichern: `editingEvent.id === ''` → `onNewEvent`, kein Löschen, keine Store-Aktualisierung, keine Notiz-Umbenennung)
- Modify: `web/src/components/Layout/MobileLayout.tsx` (nur Typ von `onNewEvent`-Meta und Durchreichen von `onNewEvent` an die Overlays; Achtung: Datei hat fremde, ungesicherte Änderungen, nur gezielt editieren)
- Modify: `web/src/app/page.tsx:433,436` (nur Typ des `meta`-Parameters erweitern, Logik unverändert)

**Interfaces:**
- Consumes: `QuickEditGrid`, `QuickEditTarget` (Task 4), `onQuickEdit`, `onDraftAt` (Task 5).
- Produces: `onNewEvent` und `MobileCalendarTabProps.onNewEvent` bekommen den Meta-Typ `{ title?: string; color?: string; description?: string; recurrence?: 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly'; recurrence_rule?: string; recurrence_end?: string; parent_id?: string | null; groupIds?: string[] }`. `handleEventCreate` verteilt `extraMeta` bereits unverändert (`useCalendarActions.ts:163`), dafür muss nichts geändert werden.

- [ ] **Step 1:** Bearbeiten: `onQuickEdit(ev)` setzt `quickEdit = { mode: 'edit', target: {id, title, color, start, end}, context: restliche Termine des Tages }`. ✓ ruft `onEventUpdate(id, start, end)` (gleicher Pfad wie das Ziehen in `MobileWeekGrid`), ✕ und ✓ schließen das Overlay.
- [ ] **Step 2:** Entwurf: `onDraftAt(start, end)` setzt `quickEdit = { mode: 'draft', target: { id: null, title: '', … } }`. ✓ im Entwurf ruft `onEditEvent({ id: '', start, end, title: '', color: <Standardfarbe>, recurrence: 'none' })`, was das vorhandene Formular öffnet. Speichern im Formular ruft `onNewEvent(start, end, meta)`; leerer Titel wird zu `'Neuer Termin'`. Abbrechen im Formular verwirft den Entwurf (nichts angelegt).
- [ ] **Step 3:** Manuell prüfen (Browser-Pane, Handybreite): Halten → Raster → Verschieben/Kanten ziehen → ✓ speichert und ✕ nicht. Doppeltipp in Pause, auf Karte, vor dem ersten und nach dem letzten Termin, auf leerem Tag → Entwurf an erwarteter Zeit → Formular mit Wiederholung → neuer Termin erscheint in der Liste. Wischen zum Tageswechsel löst nichts aus. Todo abhaken per Tipp bleibt möglich.
- [ ] **Step 4:** Commit `feat(web): wire quick edit grid and double-tap drafts into mobile day view` (nur die geänderten Dateien einzeln stagen, bei `MobileLayout.tsx` nur gezielt mit `git add -p`).

### Task 7: Doku und Abschlussprüfung

**Files:**
- Modify: `web/docs/COMPONENTS.md`, `web/docs/calendar/MOBILE_TOUCH_GESTURES.md` (Abschnitt "Tagesliste: Halten und Doppeltipp")

- [ ] **Step 1:** `QuickEditGrid`, `timelineMath`, `quickEditMath`, `listGestures` im Komponentenregister und die neuen Gesten dokumentieren.
- [ ] **Step 2:** `cd web && npx tsc --noEmit && npm test && npm run lint 2>&1 | tail -5 && npm run build`. Erwartet: tsc 0 Fehler, Tests grün, keine neuen Lint-Fehler (Basis 557), Build erfolgreich.
- [ ] **Step 3:** Commit `docs(web): document mobile quick edit`. Push nur nach Rückfrage, da der Remote-Stand abweicht (Task 0).
