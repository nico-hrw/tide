# Tags als zentrales Ordnungsprinzip — Design

Stand: 2026-11-21 · Status: Entwurf, wartet auf Freigabe

## Intent und Warum

Termine und Todos sollen sich thematisch klar voneinander unterscheiden lassen,
ohne aus dem Kontext der anderen gerissen zu werden (alles bleibt im Kalender
bzw. in der Todo-Liste). Heute werden Tags kaum beachtet: man legt einen Termin
oder ein Todo an, fertig. Künftig ist ein Tag der Normalfall und erlaubt
Übersichten, z. B. für eine bevorstehende Reise: ein Tag, ein gefilterter
Kalender, ein Link dorthin aus einer Notiz.

## Ausgangslage (Ist)

- **Termine** haben `groupIds` (+ `parent_id` als erste Gruppe) und separat bis
  zu 3 freie `tags` (drei Textfelder im Popover, `EventPopover.tsx`).
- **Gruppen** sind verschlüsselte "Dateien" vom Typ `folder` mit `isGroup: true`
  und Metadaten `title`, `color`, `effect` (`app/calendar/page.tsx`
  `handleCreateEventGroup`). Verwaltung in `CalendarGroupsSection.tsx`.
- **Todos** haben `tags: string[]` (reine Strings) plus `folder`; Tag-Filter und
  Gruppierung nach Tag existieren in `TodoList.tsx` / `TodoFilterBar.tsx`.
- **Arbeit/Studium-Plugin** erkennt seine Termine über eine feste Gruppen-ID
  und hartkodierte Tag-Namen (`job`, `arbeit`, `uni`, `studium`) in
  `DesktopMonthView.tsx`, `PlannerWeekCalendar.tsx`, `PlannerTermStatus.tsx`.
- Notizen (TipTap) haben `@`-Erwähnungen für Termine/Todos/Daten
  (`CalendarEventMentionExtension.tsx` u. a.).

## Ziele

1. Ein einziges Konzept **Tag** (Name, Farbe, Muster) ersetzt Gruppen und freie
   Tag-Strings, für Termine **und** Todos.
2. Beim Anlegen von Termin/Todo wird nach mindestens einem Tag gefragt. "Ohne
   Tag" ist eine bewusste, ablehnbare Option, aber deutlich abgefragt.
3. Der Kalender kann nach einem oder mehreren Tags gefiltert werden.
4. Eine Filterkonfiguration (Tags + Kalenderansicht) lässt sich als **benannte
   Ansicht** speichern und per `@` in Notizen verlinken; Klick öffnet den
   Kalender so gefiltert.
5. Das Arbeit/Studium-Plugin läuft über denselben Mechanismus (Tag statt
   fester Namen).

## Nicht-Ziele

- Keine Auflistung von Terminen/Todos innerhalb von Notizen (bewusst gestrichen).
- Keine Einstellungsseite für Ansichten; Verwaltung nur im Filter-Dropdown
  (umbenennen, löschen).
- Keine Tag-Hierarchien, keine Tag-Regeln/Automationen, keine Dashboards.
- `folder` bei Todos bleibt unverändert (separates Thema).

## Anti-Ziele

- Das Feature darf nicht zu "Notion" werden: mehr Konfigurieren als Arbeiten.
  Jede neue Oberfläche muss sich an diesem Maßstab messen lassen.
- Der Tag-Prompt darf das schnelle Anlegen nicht spürbar bremsen.
- Kein Datenverlust bei der Migration; bestehende Termine behalten Farbe/Muster.

## Constraints

- Verschlüsselte Daten: Migration läuft clientseitig. `crypto.ts`/`cryptoV2.ts`
  und das DDL in `sqlite.go` werden nicht angefasst.
- AGENTS.md: `apiFetch` für HTTP, `designTokens` für Visuelles, keine neuen
  `any`, Dateien < 500 Zeilen, `docs/COMPONENTS.md` aktualisieren.
- Verhalten außerhalb des Features bleibt erhalten.

## Approaches

Gewählt wurde **Weg A**; Alternativen nur zur Nachvollziehbarkeit.

- **A — Benannte Ansichten (gewählt).** Ansicht = {Name, Tag-IDs, Kalender-
  ansicht}, gespeichert, per `@` verlinkbar; eine Änderung wirkt auf alle Links.
  Kosten: ein neues kleines Objekt plus Dropdown-Verwaltung. Warum: ruhiger im
  Alltag, eine Pflegestelle.
- **B — Link trägt die Konfiguration selbst.** Kein Objekt, keine Verwaltung,
  aber Änderungen müssen an jedem Link nachgezogen werden und Links haben
  keinen Namen. Abgelehnt.
- **Gruppen und Tags getrennt lassen.** Weniger Aufwand, behält aber das
  doppelte System und die unterschiedliche Darstellung von Terminen und Todos.
  Abgelehnt zugunsten der Verschmelzung.

## Entscheidungen (von dir getroffen)

- Gruppen und Tags werden zu einem Konzept **Tag** verschmolzen.
- Gefilterte Kalenderansicht + verlinkbare Filter-Presets statt Notiz-Liste.
- Weg A (benannte Ansichten).

## Meine Entscheidungen (als Vorschlag, bitte prüfen)

- **Migration:** Bestehende Gruppen werden Tags (Farbe/Muster bleiben). Freie
  Tag-Strings bei Terminen und Todos werden Tags mit Standardfarbe; gleiche
  Namen (case-insensitive) werden zusammengeführt.
- **Plugin:** Arbeit/Studium bekommt in den Einstellungen ein zuweisbares Tag
  statt fester Namen/Gruppen-ID; bis zur Zuweisung greift die bisherige Logik
  als Fallback.
- **Undatierte Todos:** Im gefilterten Kalender nicht sichtbar. Stattdessen
  springt die Ansicht zur Todo-Liste mit demselben Tag-Filter (existiert dort
  schon). Kein neues Listen-Feature.
- **Tag-Abfrage beim Anlegen:** Tag-Auswahl im bestehenden Anlege-Flow mit
  "Ohne Tag" als sichtbarer Option; genaue Gestaltung wird nach dem
  Datenmodell festgelegt.
- **Umsetzung in Phasen,** jede für sich nutzbar: (1) Tag-Modell + Migration,
  (2) Tag-Auswahl beim Anlegen, (3) Kalenderfilter, (4) benannte Ansichten +
  `@`-Link, (5) Plugin-Umstellung.

## Tag-Abfrage beim Anlegen (von dir entschieden: Inline + Rückfrage)

- Tag-Chips stehen direkt im Anlege-Fenster (Kalender-Ziehen, Mobil-Anlegen,
  Todo anlegen). Ist im Kalender ein Tag-Filter aktiv, ist dieser Tag
  vorausgewählt.
- Speichern ohne Tag zeigt einmalig die Rückfrage "Ohne Tag speichern?".
- Importe und wiederkehrende Kopien fragen nicht (mein Call).
- Verworfen: eigener Pflichtschritt nach dem Titel (ein Extra-Schritt pro Eintrag).

## Weitere Entscheidungen nach Builder-Check (meine Calls, bitte prüfen)

- **Identität/Speicherung:** Tags bleiben verschlüsselte, synchronisierte
  `folder`-Dateien mit `isGroup`. Bestehende Gruppen-IDs werden unverändert
  Tag-IDs (so bleibt die feste Plugin-Gruppen-ID gültig). Freie Tag-Strings
  werden zu neuen Tags; Gruppe "Uni" und String "uni" verschmelzen
  (case-insensitive) zu einem Tag, die Plugin-Zuordnung zeigt dann auf dieses.
- **Felder:** Termine speichern Tag-IDs weiter in `groupIds` (+ `parent_id` =
  erstes Tag, bleibt für Alt-Clients beschrieben); das alte `tags`-String-Feld
  wird nach der Migration nicht mehr geschrieben. Todos speichern Tag-IDs statt
  Strings. Migration einmalig clientseitig beim Start, idempotent.
- **Ein Register:** Termine und Todos teilen dieselben Tags. Das 3-Tag-Limit
  bei Terminen entfällt. Die Farbe eines Termins kommt vom ersten Tag, wie
  heute von `parent_id`.
- **Kalenderfilter:** Mehrere Tags wirken als ODER; "Ohne Tag" ist filterbar.
- **Ansicht:** speichert nur Tag-IDs und Kalenderansicht (kein Datum).
  `@`-Link wendet den Filter an, ersetzt den aktuellen, und ein Chip erlaubt
  das Zurücksetzen. Gelöschte Ansicht: Link ausgegraut. Gelöschtes Tag wird aus
  Ansichten entfernt.
- **Tag-Verwaltung:** Anlegen inline in der Tag-Auswahl; Umbenennen, Umfärben,
  Löschen in der bestehenden `CalendarGroupsSection` (umbenannt zu "Tags", keine
  neue Seite). Löschen entfernt das Tag von allen Einträgen, mit Bestätigung.
- **Plugin:** Fallback auf die alte Logik gilt nur bis zur ersten Zuweisung;
  mehrere Tags zuweisbar.

## Dem Builder überlassen

Konkretes Datenformat der Tags im Store, UI-Details des Filters und der
Tag-Auswahl (Desktop und Mobil), Namensgebung, Tests.
