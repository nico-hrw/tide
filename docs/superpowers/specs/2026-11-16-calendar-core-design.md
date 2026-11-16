# Kalender-Kern: Wochenmodell und Tagesansicht (Desktop)

Stand: 2026-11-16 · Status: Entwurf zur Freigabe · Teilprojekt 1 von 4
(2 Todos am Desktop, 3 Smart Island, 4 Designsystem folgen jeweils mit eigenem Entwurf.)

## 1. Worum es geht und warum

Der Desktop-Kalender ist das Hauptwerkzeug des Nutzers (Nico) am Laptop und wird geliebt, ist aber
im Alltag nicht verlässlich: Es wird oft die falsche Woche geladen, die Tagesansicht wirkt
unfertig, die Wochenansicht hat Macken. Solange der Kalender nicht zuverlässig ist, hält das
von der Nutzung der ganzen App ab. Ziel dieses Teilprojekts ist ein **stabiler, verständlicher
Kalender-Kern**, auf dem später das neue Design aufsetzt.

Grundsatz des Gesamtvorhabens: bis der Kern repariert ist, **keine oder kaum neue Features**.

## 2. Ist-Zustand und Ursachen (aus dem Code gelesen, nicht live reproduziert)

**Falsche Woche.** Die Wochenansicht ist eine horizontal scrollbare Liste (`loadedWeeks`
in `CalendarView.tsx`). Mehrere Mechanismen schreiben gegeneinander:
- Ein Effekt (`[date, viewMode, loadedWeeks]`, per `setTimeout(0)`) setzt `loadedWeeks` neu,
  wenn `date` außerhalb liegt.
- `useCalendarScroll.ts` leitet `date` aus der Scrollposition ab, fügt links/rechts Wochen
  ein und korrigiert `scrollLeft` von Hand (`isPrependingRef`, Zeilen ~368–408).
- Der Initial-Scroll arbeitet mit Timern (0/50/60/100/150 ms) und Flags (`hasInitializedScroll`).
Ergebnis: Welche Woche am Ende sichtbar ist, hängt von der Reihenfolge von Renderings und Timern ab.

**Tagesansicht.** Das Seitenfenster in `DesktopDayView.tsx` (~Zeile 235) ist
`sticky top-4 self-start max-h-[calc(100vh-210px)]` innerhalb eines scrollenden Containers.
Daher sitzt es nicht fest, ragt nach oben heraus und passt nur zufällig zur Höhe. Die
Terminspalte ist zu schmal. Details eines Termins öffnen als Popup (`EventPopover`).

**Wochenstart.** `weekStartsOn: 1` ist an ~21 Stellen in 8 Dateien hart codiert
(CalendarView, DesktopMonthView, MiniCalendar, WeekView, MobileLayout, SmartIsland,
SmartIslandCalendar, WeekStrip).

**Dateigrößen.** `CalendarView` 691, `DayColumn` 1085, `CalendarEventItem` 950, `WeekView` 842,
`EventPopover` 694 Zeilen (Regel in `AGENTS.md`: unter 500).

## 3. Ziele

1. **Ein Wochenmodell, eine Wahrheit.** Die sichtbare Woche ist ein einziger Wert. Es gibt keine
   gegenseitig rückkoppelnden Effekte, keine Timer-Choreografie.
2. **Zwei Scroll-Modi, in den Einstellungen wählbar:**
   - *Unendlich* (bisheriges Verhalten, **Standard**): man scrollt beliebig weit, Wochen erscheinen
     automatisch.
   - *Eine Woche* (neu): genau eine Woche sichtbar, Wechsel per Pfeilen, Tastatur, „Heute“, Mini-Kalender
     und Wischgeste.
3. **Wochenstart wählbar:** Mo–So (Standard) oder So–Sa, in den Einstellungen; gilt für die feste
   Wochenansicht und überall dort, wo heute `weekStartsOn: 1` steht.
4. **Tagesansicht neu:** zwei feste Spalten. Links die Termine des Tages (deutlich breiter),
   rechts ein statisches Panel ohne Sticky-Hack: Tagesstatistik; nach Klick auf einen Termin
   dessen Details **statt eines Popups**.
5. **Dateien klein:** Jede in diesem Teilprojekt angefasste Datei endet unter 500 Zeilen.
6. Das Ganze ist sofort im Look der künftigen Design-Basis gebaut (nur Tokens, keine neuen
   Hex-Farben/Tailwind-Rohfarben, siehe `AGENTS.md` Regel 7).

## 4. Nicht-Ziele und Anti-Ziele

Nicht-Ziele (kommen später oder gar nicht):
- Mobile- und Tablet-Kalender ändern ihr Verhalten nicht (außer der Wochenstart-Einstellung, siehe 5.4).
- Kein neues Designsystem, keine Umfärbung der gesamten App (Teilprojekt 4).
- Keine Änderungen an Todos, Smart Island, Notizen, Krypto, Backend.
- Keine neuen Kalender-Features (z. B. „7 Tage ab heute“, Mehrtagesansichten).
- Drag/Resize/Erstellen-per-Ziehen werden nicht neu erfunden, nur an das neue Modell angeschlossen.

Anti-Ziele (wäre ein Fehlschlag, selbst wenn es „funktioniert“):
- Sichtbares Springen oder Nachkorrigieren beim Scrollen.
- Regression bei Drag, Resize, Erstellen, Popover, Verknüpfungs-Navigation (`calendar:scroll-to`,
  `editingEventId`) oder Zeitzeiger/Heute-Button.
- Neue Abhängigkeit nur für Virtualisierung (eigene, einfache Rechnung genügt).
- Neue Feste Texte ohne i18n-Weg (siehe 5.5).

## 5. Entwurf

### 5.1 Wochenmodell
- Einzige Zustandsgröße: `date` (kommt wie bisher aus `page.tsx` per Props). Die Wochennummer ist
  daraus berechnet (`weekIndex = Differenz in Wochen zum Ankerdatum`, abhängig von `weekStartsOn`).
- `loadedWeeks` als State **entfällt**. Wochen für die Darstellung werden aus Scrollposition bzw.
  `date` berechnet (reine Funktionen, in `web/src/lib/calendarWeeks.ts`, unit-getestet).
- **Regel gegen Rückkopplung:** Programmatisches Scrollen (Navigation, Heute, Sprung) setzt `date`
  vorab selbst und wird vom Scroll-Handler ignoriert, bis es beendet ist. Nur *Nutzer*-Scrollen
  setzt `date`, und zwar erst nach Ruhe (Debounce), nicht während des Scrollens.

### 5.2 Modus „Unendlich“
- Fester virtueller Bereich um das Ankerdatum (Vorschlag ±520 Wochen ≈ ±10 Jahre). Jede Woche hat
  eine feste Position (`left = weekIndex * weekWidth`), nur Wochen im/um den Sichtbereich
  (Sichtbereich ± 2 Wochen) werden gerendert. Dadurch gibt es **kein Einfügen links und keine
  `scrollLeft`-Korrektur** mehr.
- Die Breite des Scrollbereichs wird durch einen Platzhalter bestimmt; die Spaltenbreiten bleiben wie heute.
- Wiederherstellung nach Neuladen: `tide_calendar_date` (existiert). `tide_calendar_scroll_x` entfällt
  (X ist aus dem Datum ableitbar), `tide_calendar_scroll_y` bleibt.

### 5.3 Modus „Eine Woche“
- Rendert genau eine Woche (Mo–So oder So–Sa), kein horizontales Scrollen.
- Navigation: Pfeile in der Kopfzeile, Tastatur (←/→), „Heute“, Mini-Kalender, Trackpad-/Touch-Wischen.
  Wechselanimation nur über `transform` (günstig), nicht über Layout.
- Dieselben Tageskomponenten (`DayColumn`) und dasselbe Datenmodell wie im Unendlich-Modus.

### 5.4 Einstellungen und Wochenstart
- Zwei Einstellungen im bestehenden Muster (`createEventsSlice.ts` + `localStorage`):
  `calendarScrollMode: 'infinite' | 'fixed'` (Standard `infinite`),
  `weekStartsOn: 0 | 1` (Standard `1`). UI in `Settings/tabs/CalendarTab.tsx`.
- Ein Helfer (`calendarWeekOptions()` bzw. Hook) ersetzt alle ~21 `weekStartsOn: 1`. Da der Standard
  `1` bleibt, ändert sich ohne Einstellung nichts. *(Meine Annahme:* gilt auch für Mobile, Mini-Kalender
  und Smart Island, damit die App nicht widersprüchliche Wochen zeigt.*)*

### 5.5 Tagesansicht
- Layout: Zwei Spalten in einem Container mit fester Höhe (Flex-Kette bis zur Seitenhöhe, `min-h-0`).
  Links Terminzeitleiste mit eigenem Scroll, rechts Panel mit eigener Breite (ca. 360–400 px),
  gleiche Oberkante wie die Zeitleiste, bei langem Inhalt eigener Scroll. Kein `sticky`, kein `calc(100vh - …)`.
- Panel ohne Auswahl: Tagesstatistik (Anzahl Termine, gebuchte Zeit, freie Zeit, nächster Termin,
  laufender Termin). Vorhandene Logik in `DesktopDayView.tsx` und `DailySummary.tsx` wird wiederverwendet.
- Panel mit Auswahl: Termin-Details und Bearbeiten **inline statt Popup**. Der Inhalt von `EventPopover`
  wird in eine wiederverwendbare Komponente (`EventDetailPanel`) herausgelöst. Der Popover bleibt für
  Wochen- und Monatsansicht. Zurück zur Statistik: Klick auf leere Fläche, erneuter Klick, Esc.
- Schmale Fenster (< ca. 1100 px): Panel entfällt, es gilt das bisherige Popup-Verhalten.
- Texte: nicht hart codiert, über den bestehenden i18n-Weg (`web/src/lib/i18n.ts`); keine zentrale
  Textsammlung nötig, Texte dürfen lokal zur Komponente liegen.

### 5.6 Dateien
Bei Berührung enden unter 500 Zeilen: `CalendarView` (→ Gerüst, Kopfzeile/Toolbar, Wochen-Scroller,
Hook für das Wochenmodell), `DesktopDayView`, `useCalendarScroll`, ggf. `DayColumn`,
`CalendarEventItem`, `EventPopover`, falls sie geändert werden müssen. Nicht berührte Dateien werden
in diesem Teilprojekt nicht gesplittet. `web/docs/COMPONENTS.md` wird aktualisiert (Regel 10).
`WeekView.tsx` (842 Zeilen) wird von `CalendarView` offenbar nicht verwendet: Der Builder klärt, ob die
Datei tot ist; wenn ja, Entfernung vorschlagen (nicht stillschweigend löschen).

## 6. Prüfung (wann ist es fertig?)

Automatisch (Vitest): Wochenindex/Wochenstart (Mo und So), Fenster um den Sichtbereich, Datum↔Scroll-Umrechnung,
Sonderfälle (Jahreswechsel, Sommerzeit-Umstellung, KW 53).

Manuell im Browser (Dev-Server), jeweils in beiden Scroll-Modi und beiden Wochenstarts:
1. Neuladen auf einer beliebigen Woche → gleiche Woche bleibt sichtbar.
2. Sprung per Mini-Kalender auf ein Datum ±2 Jahre → exakt diese Woche, kein Nachspringen.
3. 50 Wochen am Stück scrollen → Datumsanzeige folgt, keine Sprünge, keine Flackerfläche.
4. „Heute“, Termin-Verknüpfung (`calendar:scroll-to`), `editingEventId` landen an der richtigen Stelle.
5. Wechsel Woche → Tag → Monat → Woche behält das Datum.
6. Drag, Resize, Erstellen-per-Ziehen, Popover wie vorher (auch am Rand der gerenderten Wochen).
7. Tagesansicht: Panel bündig, nichts ragt heraus, Fenster verkleinern/vergrößern, Dark Mode.
8. `npx tsc --noEmit`, Lint ohne neue Fehler, `npm run build`.

## 7. Ansätze, die ich verglichen habe

| | Ansatz | Vor-/Nachteil |
|---|---|---|
| **A (gewählt, meine Entscheidung)** | Virtueller fester Bereich, Wochen an festen Positionen, nur Sichtbares rendern | Beseitigt Einfügen und `scrollLeft`-Korrektur an der Wurzel. Größerer Umbau, Bereich ist technisch begrenzt (±10 Jahre). |
| B | Bestehende Liste behalten, Effekte und Timer reparieren | Kleiner Eingriff, aber die Rückkopplung bleibt strukturell. Erfahrungsgemäß kehren die Fehler zurück. |
| C | 3-Folien-Karussell wie auf Mobile (Mitte neu zentrieren) | Bekannter Weg, aber in `AGENTS.md` ist der sichtbare „Snap“ beim Zentrieren als offenes Problem notiert. |

Die Wahl von A ist **mein Vorschlag**. Der Nutzer hat der Richtung zugestimmt („ein Modell, zwei Modi“),
die konkrete Technik wurde nicht einzeln besprochen.

## 8. Dem Builder überlassen

Konkrete Komponentenschnitte, Namen, Breite des Panels, Animationsdetails, Debounce-Zeiten,
genaue Größe des virtuellen Bereichs, i18n-Schlüssel, Aufteilung in Commits.

## 8a. Entscheidungen des Autors nach dem Builder-Check (meine Annahmen, nicht vom Nutzer bestätigt)

1. **Geltungsbereich des Scroll-Modus:** Er betrifft nur `viewMode === 'week'`. `continuous` behält sein
   eigenes Rendering (8 Wochen), bekommt aber statt `loadedWeeks`-State dieselbe berechnete Wochenliste
   aus `calendarWeeks.ts`. Tag und Monat bleiben unberührt.
2. **Grenze des virtuellen Bereichs:** Kein harter Stopp. Der Anker (Mitte des Bereichs) ist die Woche
   von `date` beim Laden und wird bei einem programmatischen Sprung über ±26 Wochen hinaus neu gesetzt
   (ohne Animation). Damit funktionieren `calendar:scroll-to`, alte Termine und `tide_calendar_date`
   unabhängig vom Abstand zu heute.
3. **Wochenstart global:** Die Einstellung gilt überall, wo heute `weekStartsOn: 1` steht (inkl. Mobile,
   Mini-Kalender, Smart Island). Nur die Wochenberechnung ändert sich, keine Layouts. Standard bleibt `1`,
   ohne Einstellung ändert sich nichts. **Vom Nutzer zu prüfen.**
4. **500-Zeilen-Regel:** Wird eine Datei inhaltlich umgebaut, endet sie unter 500 Zeilen.
   `DayColumn` und `CalendarEventItem` erhalten voraussichtlich nur kleine Anschluss-Änderungen
   (unter ca. 30 Zeilen); sie werden in diesem Teilprojekt nicht gesplittet, aber im Abschlussbericht
   als nächste Kandidaten genannt.
5. **Wischen im Modus „Eine Woche“:** Horizontales Trackpad-/Touch-Wischen wechselt die Woche erst ab
   einer Mindestdistanz, danach kurze Sperre (ca. 400 ms) gegen Doppelwechsel. Während eines
   Termin-Drags ist Wischen deaktiviert.
6. **Panel-Bearbeitung und Esc:** Das Panel speichert wie der bisherige Popover (gleiche Speicherlogik,
   wiederverwendet). Esc schließt zuerst nur Eingabefelder/Auswahl, bricht nie einen laufenden Drag ab.
   Beim Datumswechsel wird die Auswahl zurückgesetzt.
7. **Tests:** Vitest ist bereits vorhanden (`npm test`), keine neue Abhängigkeit.
8. **Schwelle für das Panel:** Gemessen an der Breite des Tagesansicht-Containers (nicht des Fensters),
   Panel erst ab ca. 900 px Containerbreite.

## 9. Offen (muss der Nutzer klären)

- **Fortlaufende Ansicht (`continuous`)**: Der Nutzer findet ihr Design „nicht gut“. Was genau stört
  (Layout, Breite, Navigation)? Bis dahin bekommt sie nur das gemeinsame Wochenmodell, keine Neugestaltung.
