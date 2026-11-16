# Kalender-Kern Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Den Desktop-Kalender verlässlich machen (ein Wochenmodell, zwei Scroll-Modi, wählbarer Wochenstart), die Wochenansicht aufwerten und die Tagesansicht mit festem Detail-Panel neu bauen.

**Architecture:** `date` bleibt die einzige Zustandsgröße. Die Wochenliste (`loadedWeeks`) entfällt; im Modus „Unendlich“ rendert ein virtuelles Fenster nur Wochen um den Sichtbereich (Spacer links/rechts halten die Scrollbreite, kein Einfügen, keine `scrollLeft`-Korrektur). Reine Rechenlogik liegt in `lib/calendarWeeks.ts` und ist unit-getestet.

**Tech Stack:** Next.js 16 / React 19 / TypeScript, date-fns 4, Zustand, framer-motion, Vitest (happy-dom, bereits vorhanden: `cd web && npm test`).

**Spec:** `docs/superpowers/specs/2026-11-16-calendar-core-design.md` (Abschnitte 5, 5.5a, 8a gelten verbindlich).

## Global Constraints

- Scroll-Modus `'infinite' | 'fixed'`, Standard `'infinite'`; Wochenstart `0 | 1` (So | Mo), Standard `1`. localStorage-Keys `tide_calendar_scroll_mode`, `tide_calendar_week_start`. Muster wie `calendarOverlapMode` in `store/slices/createEventsSlice.ts`.
- Virtueller Bereich `WEEK_RANGE = 520` Wochen je Seite; gerendert wird Sichtbereich ± `RENDER_BUFFER_WEEKS = 2`; Re-Anchor bei programmatischem Sprung über `MAX_ANCHOR_OFFSET_WEEKS = 26` Wochen.
- Nutzer-Scrollen setzt `date` erst nach Ruhe (150 ms); programmatisches Scrollen wird nie in `date` zurückgespielt.
- Fester Modus: Wischen erst ab 80 px kumuliert, danach 400 ms Sperre; kein Wischen während eines Drags.
- Aktueller Termin: invertiert, `scale` zwischen 1.02 und 1.04 (gewählt: 1.03). Panel der Tagesansicht erst ab 900 px Containerbreite; kein `sticky`, kein `calc(100vh - …)`.
- Keine neue npm-Abhängigkeit. Nur Tokens/CSS-Variablen für Farben, keine neuen Hex-Werte oder Tailwind-Rohfarben in neuem Code (`AGENTS.md` Regel 7). Kein neues `any` (Regel 9).
- Jede inhaltlich umgebaute Datei endet unter 500 Zeilen. `DayColumn.tsx` und `CalendarEventItem.tsx` erhalten nur kleine Anschluss-Änderungen (< ca. 30 Zeilen).
- Texte nicht hart codiert: über `web/src/lib/i18n.ts` (de und en).
- Nach jeder Task: `cd web && npx tsc --noEmit` ist sauber. Commit-Stil `type(scope): Beschreibung`, Trailer `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Vor dem Commit Shell im Repo-Root.

## Review Focus

1. Sprung per `calendar:scroll-to`/Mini-Kalender auf ein Datum ±3 Jahre → exakt diese Woche, kein Nachspringen (Task 1, Task 4).
2. Wochenstart zur Laufzeit von Mo auf So wechseln, während eine Woche sichtbar ist → gleiches Datum bleibt im Bild, Spalten richten sich neu aus (Task 1, Task 3).
3. Sommerzeit-Umstellung (29.03.2026) und Jahreswechsel/KW 53: sieben verschiedene Tage, kein doppelter/fehlender Tag (Task 1).
4. Container-Breite 0 (Sidebar eingeklappt/Tab hidden) oder Fenster-Resize → keine NaN-Werte, keine Endlosschleife (Task 1, Task 4).
5. Termin per Drag an den Rand des gerenderten Fensters ziehen → landet auf dem richtigen Tag, obwohl Nachbarspalten noch nicht existieren (Task 4, manuell).

---

### Task 1: Reine Wochenrechnung (`calendarWeeks.ts`)

**Files:**
- Create: `web/src/lib/calendarWeeks.ts`
- Create: `web/src/lib/__tests__/calendarWeeks.test.ts`

**Interfaces:**
- Produces (alle exportiert):
  - `type WeekStart = 0 | 1`
  - `const WEEK_RANGE = 520; RENDER_BUFFER_WEEKS = 2; MAX_ANCHOR_OFFSET_WEEKS = 26; TIME_GUTTER_PX = 60`
  - `startOfCalendarWeek(date: Date, weekStartsOn: WeekStart): Date` (lokale Mitternacht)
  - `weekIndexOf(date: Date, anchorWeekStart: Date, weekStartsOn: WeekStart): number`
  - `weekStartAt(anchorWeekStart: Date, index: number): Date`
  - `dayColumnWidth(viewportWidth: number): number` (140 `<768`, 155 `<1024`, 185 `<1280`, sonst 210; entspricht den Klassen in `DayColumn.tsx:484`)
  - `visibleWeekRange(p: { scrollLeft: number; viewportWidth: number; weekWidth: number }): { first: number; last: number }` (Indizes relativ zum Anker, geklemmt auf ±`WEEK_RANGE`, inkl. Buffer)
  - `scrollLeftForDate(p: { date: Date; anchorWeekStart: Date; weekStartsOn: WeekStart; dayWidth: number; viewportWidth: number }): number`
  - `dateAtViewportCenter(p: { scrollLeft: number; viewportWidth: number; dayWidth: number; anchorWeekStart: Date; weekStartsOn: WeekStart }): Date`
  - `needsReanchor(date: Date, anchorWeekStart: Date, weekStartsOn: WeekStart): boolean`
  - `weeksForViewMode(date: Date, mode: 'month' | 'continuous', weekStartsOn: WeekStart): Date[]` (Monat: 6 Wochen ab Woche des Monatsersten; fortlaufend: 8 Wochen ab einer Woche vor `date`)
- Konvention: Scrollinhalt = `TIME_GUTTER_PX` + `(index + WEEK_RANGE) * 7 * dayWidth`; `weekWidth = 7 * dayWidth`.

- [ ] **Step 1: Lint-Ausgangswert festhalten.** `cd web && npm run lint 2>&1 | tail -5`; Zahl der Probleme in den Commit-Text der Task 1 schreiben (Referenz für Task 11).
- [ ] **Step 2: Tests schreiben** (`beforeAll(() => { process.env.TZ = 'Europe/Berlin'; })`). Namen und Assertions:
  - `startOfCalendarWeek`: Mi 2026-11-18, Wochenstart 1 → `2026-11-16`; Wochenstart 0 → `2026-11-15` (Sonntag).
  - `weekIndexOf`: Anker Mo 2026-12-28; `2027-01-04` → `1`; So `2026-12-27` → `-1`; Anker selbst → `0`.
  - `weekStartAt` über Sommerzeit: Anker Mo 2026-03-23, Indizes −3…3 → jedes Ergebnis `getHours() === 0` und aufeinanderfolgende Ergebnisse haben `differenceInCalendarDays === 7`.
  - `dayColumnWidth`: 767→140, 768→155, 1023→155, 1024→185, 1279→185, 1280→210.
  - `visibleWeekRange`: `weekWidth = 7*185`, `scrollLeft = TIME_GUTTER_PX + 520*weekWidth` → `first <= 0 <= last`, `last - first === 1 + 2*RENDER_BUFFER_WEEKS` (±1 für angeschnittene Wochen); extreme Werte klemmen auf `[-520, 520]`; `weekWidth: 0` → `{ first: 0, last: 0 }` ohne NaN.
  - Rundreise: für alle 7 Tage einer Woche und Indizes −500, 0, +500 gilt `isSameDay(dateAtViewportCenter({ scrollLeft: scrollLeftForDate(...), ... }), date)`.
  - `needsReanchor`: Abstand 26 Wochen → `false`, 27 Wochen → `true`.
  - `weeksForViewMode('month')` für Nov 2026 liefert 6 Wochen, erster Eintrag Mo 2026-10-26, jeweils 7 Tage Abstand.
- [ ] **Step 3: Tests laufen lassen, Fehlschlag prüfen.** `cd web && npx vitest run src/lib/__tests__/calendarWeeks.test.ts` → FAIL (Modul fehlt).
- [ ] **Step 4: Implementieren** gemäß Interfaces; Wochendifferenzen mit `differenceInCalendarWeeks`/`addWeeks` aus date-fns (nicht mit Millisekunden), damit Sommerzeit keine Rolle spielt.
- [ ] **Step 5: Tests laufen lassen** → PASS. `npx tsc --noEmit` sauber.
- [ ] **Step 6: Commit** `feat(web): add pure calendar week math with tests`.

---

### Task 2: Einstellungen (Scroll-Modus, Wochenstart)

**Files:**
- Modify: `web/src/store/slices/types.ts` (Slice-Typen bei `calendarOverlapMode`, ~Zeile 108/117)
- Modify: `web/src/store/slices/createEventsSlice.ts` (neben `calendarOverlapMode`, ~Zeile 49/94)
- Modify: `web/src/components/Settings/tabs/CalendarTab.tsx` (399 Zeilen; Optionskarten wie `OptionCard` bei `overlap`, ~Zeile 248)
- Modify: `web/src/lib/i18n.ts` (Abschnitt `calendar`, de und en)
- Test: `web/src/store/__tests__/calendarSettings.test.ts`

**Interfaces:**
- Consumes: `WeekStart` aus Task 1.
- Produces: im Store `calendarScrollMode: 'infinite' | 'fixed'`, `setCalendarScrollMode(mode)`, `weekStartsOn: WeekStart`, `setWeekStartsOn(w)`; Hilfen `export function getWeekStartsOn(): WeekStart` (nicht-reaktiv, `useDataStore.getState()`) und `export function useWeekStartsOn(): WeekStart` (Hook), beide in `createEventsSlice.ts` oder `useDataStore.ts` neben den bestehenden Exporten.

- [ ] **Step 1: Test schreiben** (`calendarSettings.test.ts`): ohne localStorage-Werte liefert der Store `calendarScrollMode === 'infinite'` und `weekStartsOn === 1`; nach `setWeekStartsOn(0)` ist `localStorage.getItem('tide_calendar_week_start') === '0'`; ungültiger gespeicherter Wert (`'7'`) fällt auf `1` zurück.
- [ ] **Step 2: Test laufen lassen** → FAIL.
- [ ] **Step 3: Store-Felder und Setter** wie `calendarOverlapMode` (try/catch um localStorage). Ungültige Werte validieren.
- [ ] **Step 4: UI** in `CalendarTab.tsx`: zwei `OptionCard`-Gruppen („Scrollen: Unendlich / Eine Woche“, „Woche beginnt: Montag / Sonntag“). Texte über i18n-Schlüssel (`calendar.scrollMode*`, `calendar.weekStart*`), de und en. Bleibt die Datei über 500 Zeilen, Optionsgruppen in `CalendarTabViewOptions.tsx` auslagern.
- [ ] **Step 5: Tests PASS, tsc sauber.**
- [ ] **Step 6: Commit** `feat(web): add calendar scroll-mode and week-start settings`.

---

### Task 3: Wochenstart überall über die Einstellung

**Files (nur `weekStartsOn: 1` ersetzen):**
- Modify: `components/Calendar/CalendarView.tsx` (3), `DesktopMonthView.tsx` (2), `MiniCalendar.tsx` (4), `WeekView.tsx` (1), `components/Layout/MobileLayout.tsx` (4), `components/extensions/smart_island/SmartIsland.tsx` (2), `SmartIslandCalendar.tsx` (4), `WeekStrip.tsx` (1) (alle unter `web/src/`)
- Test: `web/src/lib/__tests__/weekStartOptions.test.ts`

**Interfaces:**
- Consumes: `useWeekStartsOn`, `getWeekStartsOn` aus Task 2.

- [ ] **Step 1: Test schreiben:** `getWeekStartsOn()` liefert nach `useDataStore.getState().setWeekStartsOn(0)` den Wert `0`; Standard `1`.
- [ ] **Step 2: FAIL prüfen**, falls Task 2 `getWeekStartsOn` noch nicht exportiert.
- [ ] **Step 3: Alle 21 Stellen** ersetzen: in Komponenten `useWeekStartsOn()` als Wert in `{ weekStartsOn }`; in Funktionen außerhalb von React/`useMemo`-Rückgaben `getWeekStartsOn()`. In `MobileLayout.tsx` nur die Wochenberechnung, keine Layout-Änderung. Abschluss-Check: `Grep "weekStartsOn: 1"` unter `web/src` liefert nur noch Tests und `calendarWeeks.ts`.
- [ ] **Step 4: Prüfen:** tsc sauber; im Browser: Wochenstart auf Sonntag stellen → Mini-Kalender, Monatsansicht, Smart-Island-Wochenleiste und Mobile-Wochenraster beginnen mit Sonntag; zurück auf Montag stellt alles wieder her.
- [ ] **Step 5: Commit** `refactor(web): drive week start from calendar settings`.

---

### Task 4: Virtuelles Wochenfenster (Modus „Unendlich“)

**Files:**
- Create: `web/src/components/Calendar/useWeekWindow.ts`
- Modify: `web/src/components/Calendar/CalendarView.tsx` (691 Zeilen → Ziel < 500; `loadedWeeks`-State Zeile 70, Effekte Zeile 191–246 und 296–322 entfernen, `handleScrollTo` Zeile 144–180 behält nur Datum + vertikales Scrollen)
- Modify: `web/src/components/Calendar/useCalendarScroll.ts` (Parameter `loadedWeeks/setLoadedWeeks/isPrependingRef` und Zeile 183–250 sowie 363–414 entfernen; Heute-Button-Logik und Popover-Dismiss bleiben; `tide_calendar_scroll_x` wird nicht mehr geschrieben, `_y` bleibt)
- Modify: `web/src/components/Calendar/CalendarWeekTimeGrid.tsx` (Props `weeks`, `leftSpacerPx`, `rightSpacerPx`; Spacer-`div`s `shrink-0` links/rechts der Tagesspalten im `gridDaysRef`-Wrapper)
- Modify: `web/src/components/Calendar/useEventsByDay.ts` (Parameter `loadedWeeks: Date[]` → `range: { start: Date; end: Date }`)
- Test: `web/src/components/Calendar/__tests__/useWeekWindow.test.tsx`

**Interfaces:**
- Consumes: Task 1 (`visibleWeekRange`, `scrollLeftForDate`, `dateAtViewportCenter`, `needsReanchor`, `weekStartAt`, `startOfCalendarWeek`, `dayColumnWidth`, `weeksForViewMode`), Task 3 (`useWeekStartsOn`).
- Produces:
  ```ts
  interface WeekWindow { weeks: Date[]; leftSpacerPx: number; rightSpacerPx: number; range: { start: Date; end: Date } }
  function useWeekWindow(p: {
    scrollContainerRef: React.RefObject<HTMLDivElement | null>;
    date: Date;
    onDateChange: (d: Date) => void;
    weekStartsOn: WeekStart;
    enabled: boolean;
  }): WeekWindow
  ```
  `range.start` = Beginn der ersten gerenderten Woche, `range.end` = Ende der letzten (+7 Tage).

- [ ] **Step 1: Tests schreiben** (Hook mit `renderHook`-Ersatz via kleiner Testkomponente, `scrollContainerRef` mit fester `clientWidth = 1200`, `scrollLeft` per Property setzbar):
  - Beim Mount mit `date = 2026-11-18`: `weeks` enthält die Woche Mo 2026-11-16, und `leftSpacerPx === (weekIndexOf(weeks[0], startOfCalendarWeek(date, 1), 1) + 520) * 7 * dayWidth` (Anker = Woche von `date` beim Mount).
  - Programmatischer Datumswechsel (Prop `date` ändert sich auf +40 Wochen): `scrollLeft` springt auf `scrollLeftForDate(...)`, und `onDateChange` wird dabei **nicht** aufgerufen (Rückkopplungsschutz).
  - Nutzer-Scroll um 10 Wochen + 150 ms Ruhe (`vi.useFakeTimers`): `onDateChange` genau einmal mit dem Datum der Viewport-Mitte; bei laufendem Scroll (< 150 ms) nie.
  - Sprung auf +60 Wochen (> 26): Anker wird neu gesetzt (`weeks[0]` liegt rund um das Ziel), `scrollLeft` zeigt auf das Ziel.
  - Änderung von `weekStartsOn` 1→0 bei gleichem `date`: Datum bleibt im Fenster, `weeks[i].getDay() === 0`.
  - `clientWidth = 0` → keine NaN in `leftSpacerPx`/`rightSpacerPx`, `weeks.length >= 1`.
- [ ] **Step 2: FAIL prüfen** (`npx vitest run src/components/Calendar/__tests__/useWeekWindow.test.tsx`).
- [ ] **Step 3: `useWeekWindow` implementieren.** Zustand: `anchorWeekStart` und `range {first,last}` (nur setzen, wenn geändert). Scroll-Listener (passiv) → `requestAnimationFrame` → `visibleWeekRange`; Ruhe-Timer 150 ms → `dateAtViewportCenter` → `onDateChange`, wenn anderer Kalendertag; gesendeten Tag in `lastEmittedKeyRef` (`yyyy-MM-dd`) merken. Effekt auf `date`: ist `format(date) === lastEmittedKeyRef.current`, nichts tun; sonst programmatisch scrollen (bei `needsReanchor` zuerst Anker setzen und im `useLayoutEffect` sofort ohne Animation positionieren; sonst `scrollTo({ behavior: 'auto' })` für Sprünge > 4 Wochen, `'smooth'` darunter). Erstpositionierung im `useLayoutEffect`; vertikal: gespeichertes `tide_calendar_scroll_y`, sonst `max(0, nowMinutes − 120)` (bestehendes Verhalten). `dayWidth` aus `dayColumnWidth(window.innerWidth)`, bei `resize` neu.
- [ ] **Step 4: Verdrahten:** `CalendarView` nutzt `useWeekWindow` (nur wenn `viewMode === 'week'`), `weeksForViewMode` für `month`/`continuous`; übergibt `weeks`, Spacer und `range` an `CalendarWeekTimeGrid`/`useEventsByDay`. `useCalendarScroll` bekommt `weeks` statt `loadedWeeks`. `CalendarView` in Teile schneiden (Toolbar folgt in Task 5; Popover-/Scroll-Handler-Glue in `useCalendarScroll`), bis die Datei < 500 Zeilen hat.
- [ ] **Step 5: Tests PASS; tsc sauber; `npm run build` sauber.**
- [ ] **Step 6: Manuell im Dev-Server** (Wochenstart Mo und So): Spec Abschnitt 6, Punkte 1–6 (Neuladen, Sprung ±2 Jahre, 50 Wochen scrollen ohne Wand/Sprung, „Heute“, Verknüpfungs-Navigation, Ansichtswechsel, Drag/Resize/Erstellen auch am Rand des Fensters). Fehler → Task nicht abschließen.
- [ ] **Step 7: Commit** `fix(web): replace loadedWeeks with virtual week window`.

---

### Task 5: Modus „Eine Woche“ und Toolbar-Auslagerung

**Files:**
- Create: `web/src/components/Calendar/CalendarToolbar.tsx` (Zeilen 426–504 aus `CalendarView.tsx`)
- Create: `web/src/components/Calendar/swipeGate.ts`
- Create: `web/src/components/Calendar/useFixedWeekNavigation.ts`
- Modify: `web/src/components/Calendar/CalendarView.tsx`, `CalendarWeekTimeGrid.tsx`, `DayColumn.tsx` (Prop `fluid?: boolean`: Breitenklassen Zeile 484 und 612-Bereich `w-[140px] …` ersetzt durch `flex-1 min-w-0`, < 30 Zeilen)
- Test: `web/src/components/Calendar/__tests__/swipeGate.test.ts`

**Interfaces:**
- Consumes: `calendarScrollMode` (Task 2), `startOfCalendarWeek` (Task 1).
- Produces:
  - `createSwipeGate(opts: { threshold: number; lockMs: number }): { push(deltaX: number, nowMs: number): -1 | 0 | 1; reset(): void }`
  - `useFixedWeekNavigation(p: { containerRef: React.RefObject<HTMLElement | null>; date: Date; onDateChange: (d: Date) => void; enabled: boolean; isDragging: boolean }): void` (←/→ nur wenn Fokus nicht in Eingabefeld, Wheel/Trackpad über `createSwipeGate({ threshold: 80, lockMs: 400 })`).
  - `CalendarToolbar` Props: `{ date: Date; viewMode: CalendarViewMode; onViewModeChange(m): void; themes: CalendarViewProps['themes']; selectedGroupId: string | null; onSelectGroup(id: string | null): void; onImportClick(): void; fixedWeekNav?: { onPrev(): void; onNext(): void; onToday(): void } }`.

- [ ] **Step 1: Tests `swipeGate.test.ts`:** `push(40, 0)` → 0; `push(50, 10)` (kumuliert 90) → `1`; `push(-100, 200)` (innerhalb 400 ms Sperre) → 0; `push(-100, 500)` → `-1`; negative Richtung symmetrisch; `reset()` leert die Summe.
- [ ] **Step 2: FAIL**, dann `swipeGate.ts` implementieren, **PASS**.
- [ ] **Step 3: `CalendarToolbar` auslagern;** bei `fixedWeekNav` Pfeil-Buttons und „Heute“ anzeigen (Texte über i18n). 
- [ ] **Step 4: Fester Modus in `CalendarView`:** `calendarScrollMode === 'fixed'` und `viewMode === 'week'` → `CalendarWeekTimeGrid` mit `weeks=[startOfCalendarWeek(date, weekStartsOn)]`, Spacer 0, `fluid`-Spalten, Container `overflow-y-auto overflow-x-hidden`, `useWeekWindow` mit `enabled: false`. Pfeile/Heute/Mini-Kalender ändern `date` um ±7 Tage bzw. auf das Ziel. Wechsel per `transform: translateX` (150–200 ms), kein Layout-Animieren.
- [ ] **Step 5: Prüfen:** tsc/Tests sauber; manuell: Modus in Einstellungen umschalten ohne Neuladen; Mo–So und So–Sa; Wischen wechselt genau eine Woche pro Geste; Drag eines Termins löst keinen Wochenwechsel aus.
- [ ] **Step 6: Commit** `feat(web): add fixed one-week calendar mode and toolbar component`.

---

### Task 6: Kein Flackern, Platzhalter beim ersten Laden

**Files:**
- Modify: `web/src/components/Calendar/CalendarEventItem.tsx` (`initial` bei Zeile ~540)
- Modify: `web/src/components/Calendar/useEventsByDay.ts` (stabile Array-Identität pro Tag)
- Modify: `web/src/store/slices/createEventsSlice.ts`, `types.ts` (Flag `eventsLoaded`)
- Create: `web/src/components/Calendar/DayEventsSkeleton.tsx`
- Modify: `web/src/components/Calendar/DayColumn.tsx` (Skeleton einbinden, < 30 Zeilen)
- Test: `web/src/components/Calendar/__tests__/useEventsByDay.test.ts`

**Interfaces:**
- Produces: Store-Feld `eventsLoaded: boolean` (Standard `false`, `setEventsLoaded(v: boolean)`); `DayEventsSkeleton: React.FC<{ hourHeight: number }>`.

- [ ] **Step 1: Ursache bestätigen** (Dev-Server, DevTools/Browser-Tool): Wochen scrollen und beobachten, ob Termine mit `opacity 0 → 1` erneut einblenden. Kandidaten: (a) `initial={{ opacity: 0, scale: 0.98 }}` in `CalendarEventItem.tsx:~540` spielt bei jedem Mount; (b) `useEventsByDay` liefert pro Neuberechnung neue Arrays, DayColumn rendert alle Tage neu. Ergebnis in den Commit-Text schreiben.
- [ ] **Step 2: Test:** `useEventsByDay` mit zwei Aufrufen und gleichem Inhalt für einen unveränderten Tag liefert dasselbe Array-Objekt (`toBe`); ein Tag mit geändertem Termin liefert ein neues.
- [ ] **Step 3: FAIL; fixen:** `initial={false}`; im Hook einen `useRef<Map<dayKey, { sig: string; events: CalendarEvent[] }>>` führen, bei gleicher Signatur (Ids + start/end/is_cancelled/is_completed) altes Array zurückgeben.
- [ ] **Step 4: Platzhalter:** Dort, wo Termine vom Server geladen werden (`Grep "tide_offline_events"` und das `set(...)` der Termine in `useDataStore`/`page.tsx`), `setEventsLoaded(true)` nach der ersten Antwort. `DayColumn` zeigt, solange `!eventsLoaded && events.length === 0`, 2–3 graue Balken (Token `--hover-bg`, `rounded-[var(--radius)]`, `animate-pulse`). Beim Scrollen wird nichts nachgeladen (alle Termine sind im Speicher); zeigt der manuelle Test dennoch späte Termine, an dieser Stelle melden statt erweitern.
- [ ] **Step 5: Prüfen:** Test PASS, tsc sauber; manuell: 30 Wochen scrollen, kein Aufblitzen; Neuladen mit gekapptem Netz zeigt Platzhalter, danach Termine ohne Sprung.
- [ ] **Step 6: Commit** `fix(web): stop event flicker and add day skeleton while loading`.

---

### Task 7: Heute/Jetzt deutlicher

**Files:**
- Modify: `web/src/app/globals.css` (Tokens `--today-stripe`, `--today-now-line` in `:root`, `.dark` und dem `prefers-color-scheme`-Block)
- Modify: `web/src/components/Calendar/DayColumn.tsx` (Heute-Overlay Zeile ~620–627, Jetzt-Linie Zeile ~1042–1060, < 30 Zeilen)
- Modify: `web/src/components/Calendar/CalendarWeekTimeGrid.tsx` (Zeitmarke in der Zeitleiste)
- Modify: `web/src/lib/calendarUtils.ts`
- Test: `web/src/lib/__tests__/calendarUtils.test.ts`

**Interfaces:**
- Produces: `nowMarkerTop(now: Date, hourHeight: number): number` (Pixel ab Oberkante der Stundenliste).

- [ ] **Step 1: Test:** `nowMarkerTop(new Date(2026, 0, 1, 13, 30), 48) === 648`; `00:00 → 0`; `23:59 → 1151.2` (±0.01).
- [ ] **Step 2: FAIL; implementieren; PASS.**
- [ ] **Step 3: Optik:** Spalte des heutigen Tages bekommt gestreiften Hintergrund (`repeating-linear-gradient` mit `--today-stripe`, volle Spaltenhöhe unter dem Header); Jetzt-Linie 2 px in `--today-now-line` (bestehender Wert `--today-accent`) mit größerem Punkt; in der Zeitleiste links eine Marke (`HH:mm`, Hintergrund `--today-now-line`, Textfarbe Token) auf `nowMarkerTop`; die davon überdeckte volle Stunde (±8 px) wird ausgeblendet. Marke aktualisiert sich mit `currentTime` (alle 15 s, vorhanden).
- [ ] **Step 4: Prüfen:** tsc/Tests sauber; manuell Hell/Dunkel, in beiden Scroll-Modi und in der Tagesansicht (Marke nur dort, wo eine Zeitleiste existiert).
- [ ] **Step 5: Commit** `feat(web): make today column and current time more prominent`.

---

### Task 8: Klick bewegt den Kalender nicht, Popup bleibt im Fenster

**Files:**
- Create: `web/src/components/Calendar/popoverPosition.ts`
- Modify: `web/src/components/Calendar/EventPopover.tsx` (Positionslogik Zeile ~150 und ~260–276; Body scrollbar)
- Modify: `web/src/components/Calendar/CalendarView.tsx` (Layout-Effekt `editingEventId`, Zeile ~325–354)
- Test: `web/src/components/Calendar/__tests__/popoverPosition.test.ts`

**Interfaces:**
- Produces:
  - `computePopoverPosition(p: { rect: { top: number; left: number; right: number; bottom: number }; width: number; height: number; viewportWidth: number; viewportHeight: number; margin: number; minTop: number }): { top: number; left: number; maxHeight: number }`
  - `needsScrollIntoView(el: { top: number; bottom: number; left: number; right: number }, container: { top: number; bottom: number; left: number; right: number }, margin: number): boolean`

- [ ] **Step 1: Tests `popoverPosition.test.ts`:** Platz rechts → `left === rect.right + margin`; zu wenig Platz rechts → `left === rect.left - width - margin`; auch links kein Platz → `left === margin`; unten kein Platz → `top === viewportHeight - height - margin`; `height > viewportHeight - 2*margin` → `top === minTop` und `maxHeight === viewportHeight - minTop - margin`; `needsScrollIntoView`: Termin vollständig im Container → `false`, teilweise außerhalb → `true`.
- [ ] **Step 2: FAIL; implementieren; PASS.**
- [ ] **Step 3: Ursache des Mitscrollens bestätigen:** Im Dev-Server einen Termin anklicken und prüfen, ob der Layout-Effekt `[editingEventId]` in `CalendarView.tsx:325` feuert (Konsole/Breakpoint) und welcher Pfad `activeEventId` setzt (`page.tsx:3522`, `:636`, `:2944`). Ergebnis in den Commit-Text.
- [ ] **Step 4: Fix:** Der Effekt scrollt nur noch, wenn `needsScrollIntoView(eventRect, containerRect, 24)` wahr ist (Verknüpfungs-Navigation bleibt erhalten, ein Klick auf einen sichtbaren Termin bewegt nichts). `EventPopover` nutzt `computePopoverPosition`, misst per `ResizeObserver` neu (wachsende Inhalte), begrenzt Höhe mit `maxHeight` und lässt den Inhalt scrollen (`overflow-y-auto`); Footer-Buttons bleiben im Popup (`overflow-hidden` am Rahmen).
- [ ] **Step 5: Prüfen:** Tests PASS, tsc sauber; manuell: Termin am linken, rechten, unteren, oberen Rand anklicken, Beschreibung/Wiederholung aufklappen → kein Mitscrollen, alle Buttons sichtbar; Verknüpfung (`calendar:scroll-to`) scrollt weiterhin.
- [ ] **Step 6: Commit** `fix(web): keep calendar still on event click and clamp popover`.

---

### Task 9: Aktueller Termin invertiert und leicht vergrößert

**Files:**
- Modify: `web/src/app/globals.css` (`--event-live-bg`, `--event-live-text`, `--event-live-ring` in `:root`, `.dark`; Werte aus `components/Layout/mobile/MobileAgendaTimeline.tsx:57–63`: hell `#18181b`, dunkel `#09090b` + Ring `rgba(255,255,255,0.15)`, Text hell auf dunkel)
- Modify: `web/src/components/Calendar/CalendarEventItem.tsx` (`isLive`/`shouldGlow` Zeile ~526–550 und Ping-Punkt Zeile ~601–604, < 30 Zeilen)
- Test: `web/src/components/Calendar/__tests__/liveEvent.test.ts`

**Interfaces:**
- Produces: `isLiveEvent(p: { start: Date; end: Date; day: Date; now: Date; allDay?: boolean; cancelled?: boolean }): boolean` in `web/src/lib/calendarUtils.ts` (ersetzt die Inline-Prüfung).

- [ ] **Step 1: Test:** Termin 10:00–11:00 am selben Tag: `now` 10:30 → `true`; 11:30 → `false`; ganztägig → `false`; abgesagt → `false`; anderer Tag → `false`.
- [ ] **Step 2: FAIL; implementieren; PASS.**
- [ ] **Step 3: Optik:** Der Glow (`inset … glowColor`) und `animate-ping` entfallen. Live-Termin: `background: var(--event-live-bg)`, Textfarbe `var(--event-live-text)` (auch für untergeordnete Texte), `transform: scale(1.03)`, `zIndex: 65`, Schatten wie Mobile, `transition: transform 0.2s ease, box-shadow 0.2s ease`. Das Raster verschiebt sich nicht (nur `transform`).
- [ ] **Step 4: Prüfen:** tsc/Tests sauber; manuell mit einem laufenden Termin, Hell/Dunkel, Drag und Resize eines Live-Termins funktionieren.
- [ ] **Step 5: Commit** `feat(web): invert and enlarge the currently running event`.

---

### Task 10: Tagesansicht mit festem Detail-Panel

**Files:**
- Create: `web/src/components/Calendar/EventDetailPanel.tsx` (Inhalt aus `EventPopover.tsx` herausgelöst)
- Create: `web/src/components/Calendar/DayStatsPanel.tsx`
- Create: `web/src/components/Calendar/dayStats.ts`
- Modify: `web/src/components/Calendar/EventPopover.tsx` (nur noch Rahmen + Position, < 500 Zeilen)
- Modify: `web/src/components/Calendar/DesktopDayView.tsx` (453 Zeilen; Layout neu, Auswahl-State Zeile 70 und „Termindetails“-Karte Zeile ~235 ersetzen)
- Modify: `web/src/components/Calendar/CalendarView.tsx` (Tag-Zweig Zeile ~544–579; Ausnahme in `handleDayEventClick` Zeile ~388–393)
- Modify: `web/src/lib/i18n.ts`
- Test: `web/src/components/Calendar/__tests__/dayStats.test.ts`

**Interfaces:**
- Produces:
  - `const DAY_WINDOW = { startHour: 8, endHour: 22 }` und `computeDayStats(events: CalendarEvent[], now: Date, day: Date): { count: number; bookedMinutes: number; freeMinutes: number; current: CalendarEvent | null; next: CalendarEvent | null }` (`bookedMinutes` = Vereinigung der Termin-Intervalle innerhalb `DAY_WINDOW`, `freeMinutes` = Fenster − gebucht, abgesagte Termine zählen nicht, Ganztägige zählen in `count`, nicht in Zeiten)
  - `EventDetailPanel` Props: `{ event: CalendarEvent; themes: NonNullable<CalendarViewProps['themes']>; onEventSave: CalendarViewProps['onEventSave']; onEventDelete: CalendarViewProps['onEventDelete']; onClose(): void; enabledExtensions: string[]; variant: 'popover' | 'panel' }`
  - `DesktopDayView` neue Props: `scrollRef: React.RefObject<HTMLDivElement | null>` (Ref der Zeitleiste, wird von den Drag-Hooks als `scrollContainerRef` benutzt), `onPanelVisibleChange(visible: boolean): void`, `onEventSave`, `onEventDelete`, `enabledExtensions: string[]`.

- [ ] **Step 1: Tests `dayStats.test.ts`:** Termine 09:00–10:00 und 09:30–11:00 → `bookedMinutes === 120`, `freeMinutes === 720` (840 − 120); abgesagter Termin ändert nichts; Ganztägiger erhöht `count`, nicht `bookedMinutes`; `now` 09:45 → `current` ist der Termin um 09:00; `next` ist der nächste Start nach `now`.
- [ ] **Step 2: FAIL; `dayStats.ts` implementieren; PASS.**
- [ ] **Step 3: `EventDetailPanel` herauslösen:** Inhalt des Popovers 1:1 verschieben, `EventPopover` rendert nur Rahmen/Position (nutzt `computePopoverPosition` aus Task 8) und `EventDetailPanel variant="popover"`. Verhalten des Popovers bleibt identisch. Beide Dateien < 500 Zeilen.
- [ ] **Step 4: Layout:** Tag-Zweig in `CalendarView` ohne Scroll-Wrapper (`flex-1 min-h-0 flex`). `DesktopDayView`: `grid` mit `minmax(0,1fr)` links (Zeitleiste, eigener Scroll `overflow-y-auto`, `ref={scrollRef}`) und fester Spalte rechts (360 px, ab 1280 px Fensterbreite 400 px, gleiche Oberkante, `overflow-y-auto`), Sichtbarkeit per `ResizeObserver` an der Container-Breite (≥ 900 px) → `onPanelVisibleChange`. Kein `sticky`, kein `calc(100vh - …)`.
- [ ] **Step 5: Verhalten:** Ohne Auswahl `DayStatsPanel` (Anzahl, gebucht, frei, laufend/nächster Termin, Texte über i18n); Klick auf Termin → `EventDetailPanel variant="panel"` statt Popup; Rückkehr zur Statistik per Klick auf leere Fläche, erneuten Klick, Esc (Esc beendet nie einen laufenden Drag; Auswahl wird bei Datumswechsel zurückgesetzt). Unter 900 px Containerbreite greift das bisherige Popup (`handleDayEventClick` entfernt die Ausnahme nur, wenn das Panel sichtbar ist).
- [ ] **Step 6: Prüfen:** Tests PASS, tsc sauber, Build sauber; manuell: Fenster von 700 bis 1920 px ziehen, Panel bleibt bündig, nichts ragt heraus, Drag/Resize/Erstellen in der Tagesansicht funktionieren, Hell/Dunkel.
- [ ] **Step 7: Commit** `feat(web): rebuild desktop day view with fixed detail panel`.

---

### Task 11: Dokumentation und Abschluss

**Files:**
- Modify: `web/docs/COMPONENTS.md` (neue Dateien aus Task 1, 4–10 registrieren; `loadedWeeks`-Beschreibung ersetzen)
- Modify: ggf. `web/docs/calendar/*.md` (`Grep "loadedWeeks"` unter `web/docs`)
- Modify: `AGENTS.md` nur, falls die „Desktop calendar“-Zeile in „Where things live“ nicht mehr stimmt

- [ ] **Step 1: Docs aktualisieren:** Wochenmodell, beide Modi, Einstellungen, neue Komponenten; Hinweis, dass `WeekView.tsx` (842 Zeilen) von `CalendarView` nicht verwendet wird (`Grep "from.*WeekView"` prüfen; wenn ungenutzt, Entfernung im Abschlussbericht vorschlagen, nicht löschen).
- [ ] **Step 2: Vollständige Prüfung:** `cd web && npx tsc --noEmit && npm test && npm run build`; `npm run lint 2>&1 | tail -5` zeigt höchstens den Ausgangswert aus Task 1.
- [ ] **Step 3: Manuelle Checkliste** (Spec Abschnitt 6, Punkte 1–8) in beiden Scroll-Modi und beiden Wochenstarts; Ergebnis je Punkt im Abschlussbericht.
- [ ] **Step 4: Dateigrößen prüfen:** `wc -l` der angefassten Dateien; alle umgebauten < 500. Verbleibende Kandidaten (`DayColumn`, `CalendarEventItem`, `WeekView`) im Bericht nennen.
- [ ] **Step 5: Commit** `docs(web): document calendar week model and new components`.
