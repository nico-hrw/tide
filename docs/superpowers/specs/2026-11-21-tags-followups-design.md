# Tags Follow-ups (7 Punkte) — Design

Stand: 2026-11-21 · Status: Entwurf, wartet auf Freigabe · baut auf `2026-11-21-tags-central-design.md` auf

## Intent

Nach dem ersten Einsatz des Tag-Features sind sieben Dinge aufgefallen: der Ansicht-Link ist zu mager, Schrift wirkt unscharf, Tabellen-Formeln sind zu starr, Untertodos sind zu karg, die Tag-Liste im Termin-Popup ist zu lang, `@` kann nicht nach Tags filtern und der Notiz-Kopf ist unübersichtlich. Ziel: dieselbe Arbeitsweise, nur bequemer. Anti-Ziel bleibt: kein Notion-Effekt (keine neuen Konfigurationsoberflächen, wo ein guter Default reicht).

## Ausgangslage (aus dem Code)

- Ansicht-Link (`ViewMentionExtension`, Listener `viewMention:click` in `useDashboardListeners.ts`) setzt nur `calendarTagFilter`; Todo-Tab/-Filter bleiben unberührt. Todo-Sprung existiert nur als Button im Ansichten-Menü.
- Schrift: `'Inter'` ist in `globals.css` gesetzt, wird aber nie geladen (kein `@font-face`/`next/font`), Fallback ist Segoe UI. 178× `text-[10px]`, 161× `text-[11px]`, 21× `text-[9px]`, Token `--t2-ink-3` hell `#9A9AA3` (≈2,7:1).
- Formeln (`web/src/lib/formula/`): String-Literale gehen, aber `+` ist rein numerisch (`toNum` wirft `#WERT`), `&` fehlt im Tokenizer. Ergebnis wird als `::before` (`attr(data-result)`) auf der Zelle gezeichnet, der Formeltext darin ist per `font-size:0` versteckt; Textmarks (fett/Farbe/Größe/Hervorhebung) hängen am versteckten Text und kommen nie beim Ergebnis an.
- Todos: `TaskItem` erlaubt `dueDate`/`description` bei Untertodos. In `TodoDesktopView`/`TodoDetailPane` und mobil (`MobileTodoDetail`) fehlen Felder, Untertodos sind nicht anklickbar, Beschreibung fehlt dort auch bei Haupt-Todos.
- `@`-Menü (`mentionSuggestion.tsx`, 1213 Zeilen): `items({query})` filtert nach Titel. Tags tragen heute Termine (`groupIds`) und Todos (`tags` = Ids). **Notizen und Dateien haben kein Tag-Feld.**
- Notiz-Kopf (`CanvasWorkspace.tsx`): Teilen, VarSheet, `NoteHistoryLabel` ("Zuletzt bearbeitet vor …"), `SaveStateIcon`, Optionen stehen in einer Reihe. Die "Zeitleiste" ist `NoteHistoryTimeline` (Versionsverlauf), erst nach Klick auf das Label sichtbar und nur für den Besitzer.

## Ziele (pro Punkt)

1. **Ansicht-Link mit zwei Zielen.** Der Chip der Ansicht in der Notiz bekommt zwei klickbare Teile: Name → Kalender gefiltert; kleiner "Todos"-Teil → Todo-Liste mit denselben Tags. Jeder Klick setzt beide Filter (`calendarTagFilter` und `todoTagFilter`, gleich bereinigt), der Tab wechselt nur zum jeweiligen Ziel. Mobil gleich.
2. **Schärfere Schrift.** Inter lokal einbinden (`next/font`, Variable, Latin), 9px/10px-Stellen auf 11px (siehe Klarstellung unten), `--t2-ink-3` (hell) dunkler auf Kontrast ≥ 4,5:1, `text-rendering: optimizeLegibility` und `-webkit-font-smoothing: antialiased` auf `body`. Zusätzlich die Weichzeichner-Stellen prüfen, die kleinen Text rastern (Glass-/Popover-Ebenen), nur wo Text darauf liegt.
3. **Tabellen.**
   - 3A: `&` als Verkettung; `+` verkettet, sobald ein Operand ein nichtnumerischer Text ist (rein numerisch bleibt Addition). Zahlen in Texten deutsch formatiert (wie `formatResult`). Fehler propagieren.
   - 3B: Die Marks des Formeltexts (fett, kursiv, Farbe, Schriftgröße, Hervorhebung) werden auf die Ergebniszeichnung übertragen (Decoration-Stil aus den Marks des ersten Textknotens der Zelle). **Kein** neues Zahlenformat-UI (bewusst nicht).
4. **Untertodos.** Desktop: Untertodo-Zeilen anklickbar, die Detailansicht zeigt für jedes Todo (auch Untertodos) Fälligkeit und **Beschreibung** (neues Feld); mobil dasselbe in `MobileTodoDetail`. Fälligkeit eines Untertodos max. = Fälligkeit des Eltern-Todos, wenn dieses eine hat (bestehende Regel aus `TodoTreeItem`).
5. **Tag-Auswahl im Popover kompakt.** `TagPicker` (Variante `compact`) wird zu: Zeile mit gewählten Tag-Chips + Button "+ Tag"; Klick öffnet eine Liste mit Suchfeld, Mehrfachauswahl und "Neu anlegen"; Escape/Außenklick schließt. Reihenfolge = Auswahlreihenfolge (erster Tag bestimmt Farbe), mit Hinweis. Gleiche Komponente für Todo-Karte, mobiles Feld und Plugin-Einstellung (Props bleiben).
6. **`@#Tag`-Filter und Notizen taggbar.**
   - **Notizen bekommen Tags** (`tags: string[]` Tag-Ids im Notiz-Metadatensatz, wie bei Events/Todos Ids), Auswahl im Notiz-Kopf über denselben kompakten Picker, ohne Pflicht-Abfrage beim Anlegen. Löschen eines Tags entfernt ihn auch aus Notizen (Erweiterung von `deleteTagEverywhere`).
   - `@`-Menü: Tokens `#Name` im Query (mehrere erlaubt, ODER-frei: **UND** bei mehreren, damit "weiter einengen" gilt) filtern Notizen, Termine und Todos auf Einträge mit allen genannten Tags; der Rest des Queries filtert danach per Titel. Tippt man nur `#NZ…`, werden passende Tags als Vorschlag-Zeilen angeboten (Enter übernimmt den Tag in den Query). Die "Neu anlegen"-Zeilen nutzen den bereinigten Query (ohne `#…`).
   - Ansichten (`SavedView`) bleiben unverändert (Tags für Kalender/Todos).
7. **Notiz-Kopf.** Zeile 1: Titel; rechts daneben/darüber "Zuletzt bearbeitet vor …" als Auslöser des Versionsverlaufs (nur für den Besitzer sichtbar, wie bisher). Darunter eine zweite Zeile mit den Icons **Teilen, VarSheet, Speicherstatus, Optionen**. Das Panel des Versionsverlaufs rückt weiter nach rechts (A4: größerer Abstand zum Blatt, nie über das Blatt) und bleibt beim Öffnen sichtbar; ein Klick auf das Label öffnet/schließt es wie bisher.

## Klarstellungen nach Builder-Check (meine Entscheidungen, bitte prüfen)

- **Punkt 2 (Schrift), korrigiert:** Statt "Minimum 12px" wird `text-[9px]` und `text-[10px]` auf 11px angehoben, `text-[11px]` bleibt. Der Haupthebel sind Inter, dunkleres Grau und die Schriftdarstellung. Danach Sichtprüfung der dichten Flächen (Wochenraster, Termin-Chips, Pills, Popover).
- **Punkt 7:** Das Label "Zuletzt bearbeitet vor …" und der Versionsverlauf bleiben nur für den Besitzer sichtbar (Widerspruch im Entwurf aufgelöst: kein Zugriff für Empfänger geteilter Notizen). Geändert werden nur Layout und Position.
- **Punkt 6, Speicherort:** Notizen sind Dateien mit `metadata` (frei erweiterbares JSON, `json.RawMessage`) und verschlüsseltem `secured_meta`; Termine speichern `groupIds` bereits so. Das Feld `tags` (Ids) kommt in dasselbe `metadata`, der Go-Server bleibt unverändert. Fehlendes Feld = keine Tags.
- **Geteilte Notizen:** Tags sind pro Benutzer. Unbekannte Tag-Ids (fremde oder gelöschte) werden in der Oberfläche ignoriert und zählen für Filter als "ohne Tag". Nur der Besitzer bearbeitet die Tags einer Notiz.
- **`@#Tag`:** Dateien/Anhänge ohne Tags erscheinen bei aktivem `#`-Filter nicht. Gleichung: Name wird ohne Leerzeichen als `#Name` getippt, Treffer unabhängig von Groß-/Kleinschreibung und über Präfix; bei mehrdeutigem Präfix werden die Tags als Vorschlagszeilen angeboten. Ein `#` ohne Tag-Treffer zählt als normaler Text.
- **Punkt 4:** Das Feld `description` existiert bereits im verschlüsselten Todo-Datensatz (`TaskItem`); "neu" meint nur das Eingabefeld in Desktop-Detail und Mobil-Detail (einfaches Textfeld, nicht in den Listenzeilen).
- **Punkt 1, mobil:** Es gibt einen mobilen Todo-Tab; der "Todos"-Teil des Chips wechselt dorthin (Filter wie bei der Ansicht bereinigt, unbekannte Tags fallen weg).
- **Punkt 3B:** Das Ergebnis erhält Stil als Attribute/Inline-Style an der Zelle (Decoration), den `::before` erbt. Ohne Marks am Formeltext gilt der normale Zellstil.

## Nicht-Ziele

- Kein Zahlenformat-/Dezimal-/Währungs-UI in Tabellen. Keine Schrift-Redesign, nur Laden/Größe/Kontrast.
- Keine geteilte Kalender+Todo-Ansicht.
- Kein Tag-Zwang beim Anlegen von Notizen. Keine Tag-Hierarchien.
- Der Server (Go) bleibt unverändert, solange das Notiz-Metadatenfeld frei erweiterbar ist.

## Anti-Ziele

- Notiz-Tags dürfen vorhandene Notizen/Verschlüsselung nicht gefährden (kein Umschreiben aller Notizen, nur Feld bei Bedarf).
- Die Schrift darf Layouts nicht kippen (Zeilenumbrüche, abgeschnittene Texte beim Wechsel auf größere Mindestgröße).

## Constraints

- AGENTS.md: kein Umgehen von `crypto.ts`/`cryptoV2.ts`, `apiFetch`, `designTokens`, keine neuen `any`, Dateien < 500 Zeilen (`mentionSuggestion.tsx` und `CanvasWorkspace.tsx` nicht weiter aufblähen: neue Logik in eigene Module), keine neuen Lint-Fehler, i18n-Parität bei Settings-Texten.
- Deployment danach wie zuletzt (WSL-Build, scp, `pm2 reload tide-frontend`), nach Backup.

## Meine Entscheidungen (Vorschlag, bitte prüfen)

- Mehrere `#Tags` im `@`-Query = UND (das erfüllt "weitere Tags ergänzen" als Einengen).
- Untertodo-Datum begrenzt auf Eltern-Fälligkeit (bestehendes Verhalten der Listenansicht).
- Sichtbarkeit des Versionsverlaufs für nicht-Besitzer: nur lesender Zugriff auf das Label wird **nicht** eingeführt (Besitzer bleibt Bedingung, da Backups dem Besitzer gehören); nur Layout/Position ändert sich.
- Schrift: Inter lokal bündeln (statt Systemschrift); 9px/10px werden 11px (siehe Klarstellung).
- Reihenfolge der Umsetzung: Schrift/Kopf (2, 7) → Tabellen (3) → Todos (4) → Tag-Bedienung (5, 1) → Notiz-Tags und `@#` (6).

## Dem Builder überlassen

Genaue Zeilenabstände/Positionen des Kopfes, Komponentenaufteilung, Tests, i18n-Schlüssel, Dateiname der Schrift, Notiz-Metadatenschlüssel im Detail (Vorgabe: Ids in einem `tags`-Array, tolerant gegenüber fehlendem Feld).
