# Tags als zentrales Ordnungsprinzip Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gruppen und freie Tags werden ein gemeinsames Tag-Konzept für Termine und Todos, mit Tag-Abfrage beim Anlegen, Kalenderfilter und per `@` verlinkbaren, benannten Ansichten.

**Architecture:** Ein Tag bleibt eine verschlüsselte `folder`-Datei mit `isGroup: true` (bestehende Gruppen-IDs werden Tag-IDs). Termine halten Tag-IDs in `groupIds` (+ `parent_id` = erstes), Todos in `tags` (jetzt IDs statt Namen). Die Migration ist ein einmaliger, idempotenter Client-Lauf aus reinen Funktionen. Ansichten liegen in einer eigenen verschlüsselten Datei (Muster `variableRegistryStorage.ts`).

**Tech Stack:** Next.js/React, TypeScript, zustand (`useDataStore` Slices), TipTap, vitest + happy-dom (`cd web && npx vitest run <datei>`).

**Spec:** `docs/superpowers/specs/2026-11-21-tags-central-design.md`

## Global Constraints

- Verschlüsselung (`web/src/lib/crypto.ts`, `cryptoV2.ts`) und DDL in `cloud/internal/store/sqlite.go` werden nicht angefasst.
- `apiFetch` für HTTP, `designTokens` für Visuelles, keine neuen `any`, Dateien < 500 Zeilen, `web/docs/COMPONENTS.md` bei neuen Komponenten ergänzen.
- Rückfrage-Text exakt: `Ohne Tag speichern?`; Option im Picker: `Ohne Tag`.
- Mehrere Tags im Filter = ODER; "Ohne Tag" ist filterbar; leerer Filter = alles.
- Eine Ansicht speichert nur `tagIds`, `untagged`, `viewMode` (kein Datum).
- Tag-Abfrage nur bei manuellem Anlegen (Kalender-Ziehen, Mobil-Anlegen, Todo anlegen), nicht bei Import oder wiederkehrenden Kopien.
- Kein 3-Tag-Limit mehr; Termin-Farbe kommt vom ersten Tag (`getEventGroupIds(e)[0]`).
- Nach jedem Task: `cd web && npx tsc --noEmit` sauber; Commit-Stil `feat(web): ...`, danach `git push`.

## Review Focus

1. Migration läuft zweimal oder auf zwei Geräten: keine doppelten Tags, keine doppelten IDs (Test in Task 1).
2. Namen, die sich nur in Groß-/Kleinschreibung oder Leerzeichen unterscheiden (`"Uni"`, `" uni "`): ein Tag (Task 1).
3. Gelöschtes Tag, auf das Termin, Todo, Ansicht oder Plugin noch verweisen: kein Absturz, Eintrag zählt als "Ohne Tag" (Tasks 1, 8, 9, 12).
4. Wiederkehrende Termine: Filter und Migration wirken über die Serie (Master-ID, Vorkommen `id_timestamp`) (Tasks 2, 7).
5. Leerer oder nur aus Leerzeichen bestehender Tag-Name beim Inline-Anlegen wird abgelehnt (Task 5).

---

### Task 1: Tag-Modell und Migrationslogik (rein)

**Files:**
- Create: `web/src/lib/tags.ts`, `web/src/lib/__tests__/tags.test.ts`

**Interfaces:**
- Produces:
  - `interface Tag { id: string; title: string; color?: string; effect?: string }`
  - `selectTags(items: DataItem[]): Tag[]` (nur `type==='folder' && isGroup`)
  - `normalizeTagName(name: string): string` (trim, Leerzeichen zusammenfassen, lowercase)
  - `missingTagNames(events: CalendarEvent[], tasks: TaskItem[], tags: Tag[]): string[]` (Namen aus Event-`tags` und Todo-`tags`, die weder eine Tag-ID noch ein bekannter Name sind; dedupliziert nach `normalizeTagName`, Originalschreibweise der ersten Vorkommens)
  - `buildTagPatches(events, tasks, tags): { eventPatches: { id: string; groupIds: string[] }[]; taskPatches: { id: string; tags: string[] }[] }` (löst Namen und IDs auf; Event: bestehende `groupIds` zuerst, dann aufgelöste Namen, ohne Duplikate; nur Einträge mit Änderung)

- [ ] **Step 1: Tests schreiben** in `tags.test.ts`: `selectTags` ignoriert Notizen/Events; `missingTagNames` liefert `[]` für Event-Tag `"uni"` bei vorhandenem Tag `"Uni"`; für `[" Reise ","reise"]` genau `["Reise"]`; `buildTagPatches` Event mit `groupIds:["g1"]`, `tags:["Uni"]` (Tag `g1="Uni"`) ergibt `groupIds:["g1"]` ohne Duplikat; Todo mit `tags:["g1","Reise"]` ergibt IDs beider; zweiter Lauf mit bereits migrierten Daten ergibt leere Patch-Listen.
- [ ] **Step 2:** `npx vitest run src/lib/__tests__/tags.test.ts` schlägt fehl.
- [ ] **Step 3:** Funktionen oben in `tags.ts` implementieren.
- [ ] **Step 4:** Test läuft grün.
- [ ] **Step 5:** Commit `feat(web): tag model and migration planner`.

### Task 2: Migrations-Runner

**Files:**
- Create: `web/src/hooks/dashboard/useTagMigration.ts`, `web/src/hooks/dashboard/__tests__/useTagMigration.test.ts`
- Modify: `web/src/app/page.tsx` (Hook einhängen, gezielt per Suche nach `useCalendarActions`)

**Interfaces:**
- Consumes: Task 1; `handleCreateEventGroup(title?, color?, effect?) => Promise<string|undefined>` (`useFolderAndGroupActions.ts:160`); `handleEventSave(id, updates)` (`useCalendarActions.ts:271`); `updateTask(id, updates)`.
- Produces: `useTagMigration(deps: { ready: boolean; events: CalendarEvent[]; tasks: TaskItem[]; tags: Tag[]; createTag: (title: string) => Promise<string | undefined>; saveEvent: (id: string, u: { groupIds: string[]; parent_id: string | null; tags: string[] }) => Promise<void> | void; saveTask: (id: string, u: { tags: string[] }) => Promise<void> }): void` und die reine Hilfe `runTagMigration(deps): Promise<void>` (ohne React, testbar).

- [ ] **Step 1:** Test für `runTagMigration` mit Fakes: legt für fehlende Namen genau einmal je Name an, schreibt Event-Patches mit `tags: []` und `parent_id = groupIds[0]`, Todo-Patches; ein zweiter Aufruf mit dem Ergebnis des ersten ruft nichts mehr auf; schlägt `saveEvent` für ein Element fehl, laufen die übrigen weiter und ein erneuter Lauf holt es nach.
- [ ] **Step 2:** Test schlägt fehl.
- [ ] **Step 3:** `runTagMigration` und Hook implementieren. Der Hook läuft nur bei `ready` (Dateien, Events und Tasks geladen) und höchstens einmal pro Sitzung (Ref). Migrierte Todo-Tags aus `tide_todo_custom_tags` werden nicht gesondert angelegt, nur tatsächlich verwendete.
- [ ] **Step 4:** Test grün, `tsc` sauber.
- [ ] **Step 5:** Commit `feat(web): one-shot tag migration runner`.

### Task 3: Todos arbeiten mit Tag-IDs

**Files:**
- Modify: `web/src/components/Todo/TodoList.tsx`, `TodoCreateCard.tsx`, `TodoFilterBar.tsx`, `TodoTreeItem.tsx`, `TodoFocusedGroupView.tsx`, `TodoSplitModal.tsx`, `web/src/store/slices/createUiSlice.ts`
- Test: `web/src/components/Todo/__tests__/todoTagFilter.test.ts`
- Create: `web/src/lib/tagFilter.ts`

**Interfaces:**
- Produces:
  - `interface TagFilter { tagIds: string[]; untagged: boolean }`
  - `matchesTagFilter(tagIdsOfItem: string[], filter: TagFilter, knownTagIds: Set<string>): boolean` (leerer Filter → `true`; ODER; unbekannte IDs zählen als "ohne Tag")
  - Ui-Slice: `todoTagFilter: TagFilter`, `setTodoTagFilter(f: TagFilter): void` (nicht persistiert)

- [ ] **Step 1:** Tests für `matchesTagFilter`: leerer Filter `true`; ein Tag trifft; zwei Tags ODER; `untagged:true` trifft Item ohne Tags und Item nur mit unbekannter ID; Item mit Tag aber Filter nur `untagged` → `false`.
- [ ] **Step 2:** Test schlägt fehl.
- [ ] **Step 3:** `tagFilter.ts` und Ui-Slice-Felder anlegen.
- [ ] **Step 4:** `TodoList` ersetzt `customTags`/`allTags`/`selectedTag` durch die Tags aus dem Register (`selectTags(useDataStore notes)`) und `todoTagFilter`; Filter bei `TodoList.tsx:654` über `matchesTagFilter`; Sortierung nach Tag und Suche lösen ID → `title`. `TodoCreateCard` und `TodoFilterBar` zeigen Register-Tags (Farbpunkt), Filterleiste mit Mehrfachauswahl und "Ohne Tag". Die localStorage-Schlüssel `tide_todo_custom_tags` wird nicht mehr gelesen. Untertask-Vererbung (`TodoList.tsx:~834`, `TodoTreeItem.tsx:267`, `TodoSplitModal.tsx:92`) kopiert IDs unverändert. Die Anzeigestellen in `TodoFocusedGroupView.tsx`, `TodoSplitModal.tsx` und `TodoTreeItem.tsx` zeigen den Titel statt der ID.
- [ ] **Step 5:** Tests grün, `tsc` sauber; Commit `feat(web): todos use shared tag ids`.

### Task 4: Termine: ein Tag-System im Popover und in der Anzeige

**Files:**
- Modify: `web/src/components/Calendar/EventPopover.tsx` (Bereich Gruppen-Chips ~429-475, Hinweis-Felder ~621-657), `EventPreview.tsx`, `CalendarEventItem.tsx` (`displayBadges` ~244-284), `CalendarDetailPanel.tsx` (~72, 123-127), `web/src/hooks/dashboard/useCalendarActions.ts`

**Interfaces:**
- Consumes: nichts Neues. Die bestehenden Gruppen-Chips bleiben hier erhalten, Task 7 ersetzt sie durch `TagPicker`.

- [ ] **Step 1:** Die drei Freitext-Felder "Hinweis 1…3" in Popover und Preview entfernen; die Gruppen-Chips heißen "Tags", erster Chip bestimmt die Farbe, beliebig viele wählbar.
- [ ] **Step 2:** `CalendarEventItem.displayBadges` bildet Badges nur aus `getEventGroupIds(event).slice(1)`, nicht mehr aus `event.tags`; `CalendarDetailPanel` zeigt Tag-Titel statt `#tag`-Strings.
- [ ] **Step 3:** `useCalendarActions` schreibt `tags` nicht mehr (Schlüssel `"tags"` aus `FALLBACK_META_KEYS` bleibt nur lesend für Alt-Daten); `handleEventSave` hält `parent_id = groupIds[0]` weiterhin bei.
- [ ] **Step 4:** Bestehende Tests `npx vitest run src/components/Calendar` grün, `tsc` sauber.
- [ ] **Step 5:** Commit `refactor(web): events use tags via groupIds only`.

### Task 5: `TagPicker` und `NoTagConfirm`

**Files:**
- Create: `web/src/components/Tags/TagPicker.tsx`, `web/src/components/Tags/NoTagConfirm.tsx`, `web/src/components/Tags/__tests__/TagPicker.test.tsx`
- Modify: `web/docs/COMPONENTS.md`

**Interfaces:**
- Produces:
  - `TagPicker(props: { tags: Tag[]; value: string[]; onChange: (ids: string[]) => void; onCreate: (title: string) => Promise<string | undefined>; compact?: boolean })` (Chips mit Farbpunkt, Mehrfachauswahl, "+"-Feld zum Anlegen, Titel wird getrimmt, leerer Titel wird ignoriert; kein "Ohne Tag"-Chip im Picker, die Option erscheint erst in der Rückfrage)
  - `NoTagConfirm(props: { onConfirm: () => void; onChoose: () => void })` (Inline-Zeile: Text `Ohne Tag speichern?`, Buttons `Ohne Tag speichern` und `Tag wählen`)
  - `useTagCreate(): (title: string) => Promise<string | undefined>` (nutzt `handleCreateEventGroup`-Logik; vorhandener Name, case-insensitiv, liefert die bestehende ID statt zu duplizieren)

- [ ] **Step 1:** Tests (`createRoot` + `act`, Stil `useEventsByDay.test.ts`): Klick auf Chip ruft `onChange` mit ID; Eingabe `"   "` + Enter ruft `onCreate` nicht auf; Eingabe `"Reise"` ruft `onCreate("Reise")` und fügt die zurückgegebene ID zu `value` hinzu; `NoTagConfirm` zeigt den exakten Text.
- [ ] **Step 2:** Tests schlagen fehl.
- [ ] **Step 3:** Komponenten und `useTagCreate` mit `designTokens` implementieren.
- [ ] **Step 4:** Tests grün; Komponentenregister aktualisiert.
- [ ] **Step 5:** Commit `feat(web): TagPicker and NoTagConfirm`.

### Task 6: Tag-Abfrage Todo und Mobil

**Files:**
- Modify: `web/src/components/Todo/TodoCreateCard.tsx`, `TodoList.tsx` (`handleAddTask` ~510), `web/src/components/Layout/mobile/MobileCreateModal.tsx` (`themes` wird bisher nicht destrukturiert, `handleSubmit` 157-248), `MobileOverlaysAndModals.tsx` (`NewEventMeta` um nichts erweitern, `groupIds` nutzen), `MobileBottomSheets.tsx`, `MobileEventEditSheet.tsx`, `web/src/app/page.tsx` (`themes` an `MobileLayout` durchreichen; heute leer weil Gruppen aus `files` gefiltert werden)
- Test: `web/src/components/Todo/__tests__/tagPrompt.test.ts`
- Create: `web/src/lib/tagPrompt.ts`

**Interfaces:**
- Produces: `needsNoTagConfirm(tagIds: string[], confirmed: boolean): boolean` (`true`, wenn `tagIds` leer und noch nicht bestätigt) und `defaultTagIds(filter: TagFilter): string[]` (aktive Filter-Tags vorauswählen).

- [ ] **Step 1:** Tests: `needsNoTagConfirm([],false)` true; `([ "t1" ],false)` false; `([],true)` false; `defaultTagIds({tagIds:["a"],untagged:false})` → `["a"]`, bei `untagged:true` ohne Tags → `[]`.
- [ ] **Step 2:** Tests schlagen fehl, dann `tagPrompt.ts` implementieren.
- [ ] **Step 3:** `TodoCreateCard` zeigt `TagPicker` (vorbelegt mit `defaultTagIds(todoTagFilter)`); `handleAddTask` zeigt beim ersten Speichern ohne Tag `NoTagConfirm` und speichert erst nach Bestätigung.
- [ ] **Step 4:** `MobileCreateModal` (Event- und Todo-Modus): `themes` verwenden, `TagPicker` statt Freitext-`tagsInput`, gleiche Rückfrage; Event-Meta enthält `groupIds` und `parent_id`. `page.tsx` übergibt `themes` an `MobileLayout`.
- [ ] **Step 5:** `npx vitest run src/components/Todo src/components/Layout/mobile` grün (`draftSave.test.tsx` muss weiter kompilieren), `tsc` sauber; Commit `feat(web): tag prompt on todo and mobile create`.

### Task 7: Tag-Abfrage Kalender (Desktop)

**Files:**
- Modify: `web/src/components/Calendar/CalendarView.tsx` (`handleCreateNow` 89-97), `DesktopMonthView.tsx` (`handleCreateOnDay`), `DesktopAgendaView.tsx`, `useCalendarDragResize.ts` (~312-366), `EventPopover.tsx` (Schließen-Pfad, `TagPicker` einbinden), `web/src/hooks/dashboard/useCalendarActions.ts`
- Test: `web/src/components/Calendar/__tests__/newEventTag.test.ts`

**Interfaces:**
- Produces: `newEventMeta(filter: TagFilter): { groupIds: string[]; parent_id: string | null }` in `tagPrompt.ts` (leer → `{groupIds:[],parent_id:null}`).

- [ ] **Step 1:** Test `newEventMeta({tagIds:["a","b"],untagged:false})` → `groupIds:["a","b"], parent_id:"a"`; leerer Filter → leer.
- [ ] **Step 2:** Test fehlschlagen lassen, dann implementieren.
- [ ] **Step 3:** Die vier Anlegepfade (Ziehen, Toolbar "+", Monat, Agenda) übergeben `newEventMeta(calendarTagFilter)` als `extraMeta`. Der neu angelegte Termin öffnet wie bisher das Popover mit `TagPicker`. Schließt der Nutzer das Popover eines Termins, der in dieser Sitzung angelegt wurde und keinen Tag hat, erscheint einmal `NoTagConfirm` im Popover; "Ohne Tag speichern" schließt, "Tag wählen" bleibt offen. Importe, `handleScheduleApply`, Plugin- und Wiederholungs-Kopien umgehen die Rückfrage.
- [ ] **Step 4:** Tests grün, `tsc` sauber; manuell im Browser prüfen: Ziehen im Wochenraster, Tag wählen, ohne Tag schließen.
- [ ] **Step 5:** Commit `feat(web): tag prompt when creating calendar events`.

### Task 8: Kalenderfilter (Desktop und Mobil)

**Files:**
- Modify: `web/src/store/slices/createUiSlice.ts` (`calendarTagFilter`, `setCalendarTagFilter`), `web/src/app/page.tsx` (`filteredCalendarEvents` 158-168), `web/src/components/Calendar/CalendarToolbar.tsx` (138-151, Einzel-Pills werden Mehrfach-Pills mit "Ohne Tag"), `CalendarView.tsx` (lokales `selectedGroupId` entfällt), `useEventsByDay.ts` (47-49), `web/src/components/Layout/MobileLayout.tsx`, `mobile/MobileCalendarTab.tsx`
- Test: `web/src/components/Calendar/__tests__/useEventsByDay.test.ts` (erweitern)

**Interfaces:**
- Consumes: `TagFilter`, `matchesTagFilter` (Task 3).
- Produces: `filterEventsByTags(events: CalendarEvent[], filter: TagFilter, tags: Tag[]): CalendarEvent[]` in `lib/calendarUtils.ts` (nutzt `getEventGroupIds`, unbekannte IDs = ohne Tag, Vorkommen `id_timestamp` folgen den Tags des Events).

- [ ] **Step 1:** Tests für `filterEventsByTags`: leerer Filter alle; `tagIds:["a"]` nur Treffer; ODER über zwei Tags; `untagged:true` nur ungetaggte plus Event mit gelöschter Tag-ID; Event mit `groupIds:["a","b"]` trifft Filter `["b"]`.
- [ ] **Step 2:** Tests fehlschlagen lassen, dann implementieren.
- [ ] **Step 3:** `useEventsByDay` und `filteredCalendarEvents` nutzen `filterEventsByTags`; das Auge-Verstecken der Einstellungen (`hiddenThemeIds`) bleibt zusätzlich bestehen. `CalendarToolbar` zeigt Mehrfach-Pills inklusive `Ohne Tag`. Mobil: `MobileLayout` filtert `events` mit demselben Filter und `MobileCalendarTab` zeigt eine Pill-Zeile.
- [ ] **Step 4:** `npx vitest run src/components/Calendar src/lib` grün, `tsc` sauber; manuell: Tag wählen, Woche zeigt nur dessen Termine.
- [ ] **Step 5:** Commit `feat(web): calendar tag filter`.

### Task 9: Ansichten speichern (Speicher und Slice)

**Files:**
- Create: `web/src/lib/viewsStorage.ts`, `web/src/store/slices/createViewsSlice.ts`, `web/src/store/__tests__/viewsSlice.test.ts`
- Modify: `web/src/store/useDataStore.ts` (Slice einbinden), `web/src/store/slices/fsHelpers.ts` (~294: Dateityp `views` wie `index` überspringen), `web/src/store/slices/types.ts`

**Interfaces:**
- Produces:
  - `interface SavedView { id: string; name: string; tagIds: string[]; untagged: boolean; viewMode: 'day'|'week'|'month'|'continuous' }`
  - `createApiViewsStorage(getKeys)` mit `load(): Promise<SavedView[]>` und `save(views: SavedView[]): Promise<void>`; Aufbau und Konfliktverhalten wie `variableRegistryStorage.ts` (Dateityp `'views'`)
  - Slice: `views: SavedView[]`, `loadViews(): Promise<void>`, `addView(v: Omit<SavedView,'id'>): Promise<string>`, `renameView(id: string, name: string): Promise<void>`, `removeView(id: string): Promise<void>`, `pruneTagFromViews(tagId: string): Promise<void>`

- [ ] **Step 1:** Tests mit In-Memory-Storage: `addView` vergibt ID und speichert; `renameView` trimmt, leerer Name wird ignoriert; `removeView` entfernt; `pruneTagFromViews("t1")` entfernt die ID aus allen Ansichten (Ansicht bleibt bestehen).
- [ ] **Step 2:** Tests fehlschlagen lassen, dann implementieren.
- [ ] **Step 3:** Slice in den Store einhängen; `loadViews` beim Start neben den anderen Ladeschritten aufrufen.
- [ ] **Step 4:** Tests grün, `tsc` sauber; Commit `feat(web): saved calendar views storage`.

### Task 10: Ansichten-Dropdown und Todo-Sprung

**Files:**
- Create: `web/src/components/Calendar/CalendarViewsMenu.tsx`
- Modify: `web/src/components/Calendar/CalendarToolbar.tsx`, `web/src/components/Layout/mobile/MobileCalendarTab.tsx`, `web/docs/COMPONENTS.md`
- Test: `web/src/components/Calendar/__tests__/viewsMenu.test.tsx`

**Interfaces:**
- Consumes: Slice aus Task 9; `calendarTagFilter`, `todoTagFilter`, `handleToggleTodos` (`useWorkspaceTabs.ts:270`).
- Produces: `CalendarViewsMenu(props: { viewMode: CalendarViewMode; onViewModeChange: (m: CalendarViewMode) => void })` (Liste der Ansichten, Klick wendet Filter und Modus an; "Aktuellen Filter speichern" fragt nur den Namen; je Ansicht umbenennen und löschen; Button "Todos zu diesen Tags" setzt `todoTagFilter` aus dem Kalenderfilter und wechselt zur Todo-Liste) und `applyView(view: SavedView, deps: { setFilter: (f: TagFilter) => void; setViewMode: (m: CalendarViewMode) => void }): void`.

- [ ] **Step 1:** Tests: `applyView` setzt Filter `{tagIds, untagged}` und Modus; Menü zeigt gespeicherte Namen; "Speichern" ohne Namen ist deaktiviert.
- [ ] **Step 2:** Tests fehlschlagen lassen, dann Komponente bauen und in die Toolbar (Desktop) und `MobileCalendarTab` einhängen. Zusätzlich ein "Filter zurücksetzen"-Chip neben den Pills, sobald ein Filter aktiv ist.
- [ ] **Step 3:** Tests grün, `tsc` sauber; manuell: Ansicht speichern, anwenden, löschen. Commit `feat(web): views menu and todo jump`.

### Task 11: `@`-Link auf eine Ansicht in Notizen

**Files:**
- Create: `web/src/components/extensions/ViewMentionExtension.tsx`, `web/src/components/extensions/__tests__/viewMention.test.ts`
- Modify: `web/src/components/Editor/useTipTapConfig.ts` (Zeile ~266, neben `CalendarEventMentionExtension`), `web/src/components/extensions/mentionSuggestion.tsx` (`items()` ~584-968, `command` ~970-1056, `MentionList`-Renderer ~452-552), `web/src/hooks/dashboard/useDashboardListeners.ts` (Listener neben `dateMention:click`, ~410-422), `web/docs/COMPONENTS.md`

**Interfaces:**
- Produces: TipTap-Node `viewMention` (inline, atom, Attribut `{ viewId: string }`, HTML `span[data-view-mention]`); Window-Event `viewMention:click` mit `detail: { viewId: string }`; `resolveViewMention(viewId: string, views: SavedView[]): SavedView | null` (rein, in `ViewMentionExtension.tsx` exportiert); Suggestion-Item `{ id: string; label: string; type: 'view' }`.

- [ ] **Step 1:** Tests: `resolveViewMention("v1",[{id:"v1",…}])` liefert die Ansicht; unbekannte ID liefert `null`; Suggestion-Filter findet "reise" in Ansichtsname (`items`-Hilfsfunktion `matchViews(query, views)` exportieren).
- [ ] **Step 2:** Tests fehlschlagen lassen, dann Node-Extension (Farbpunkt + Name, ausgegraut bei `null`), Registrierung, `@`-Eintrag und Click-Event bauen. Der Listener wechselt zum Kalender-Tab (`switchTab("calendar","calendar")`), ruft `applyView` auf und tut bei gelöschter Ansicht nichts. Mobil: Listener setzt Kalender-Tab, Filter und Modus (`continuous` → `agenda`).
- [ ] **Step 3:** Tests grün, `tsc` sauber; manuell: Notiz, `@Reise`, Klick öffnet gefilterten Kalender. Commit `feat(web): @ link to saved calendar views`.

### Task 12: Tag-Verwaltung in den Einstellungen

**Files:**
- Modify: `web/src/components/Settings/calendar/CalendarGroupsSection.tsx`, `web/src/components/Settings/pages/CalendarPage.tsx`, `web/src/components/Dashboard/DashboardModals.tsx` (`handleDeleteGroup` 177-190), `web/src/lib/i18n/settingsCore.de.ts` und `settingsCore.en.ts` (`cal.groups*`-Texte zu "Tags")
- Test: `web/src/lib/__tests__/tagDelete.test.ts`
- Modify: `web/src/lib/tags.ts`

**Interfaces:**
- Produces: `removeTagFromItems(tagId: string, events: CalendarEvent[], tasks: TaskItem[]): { eventPatches: { id: string; groupIds: string[]; parent_id: string | null }[]; taskPatches: { id: string; tags: string[] }[] }`.

- [ ] **Step 1:** Tests: Event `groupIds:["a","b"]` ohne `a` → `groupIds:["b"], parent_id:"b"`; nur `["a"]` → `[]`, `parent_id:null`; Todo-Patch entfernt die ID; unbeteiligte Einträge erzeugen keine Patches.
- [ ] **Step 2:** Tests fehlschlagen lassen, implementieren.
- [ ] **Step 3:** Bereich heißt "Tags" (de und en, Paritätstest `i18nSettings.test.ts` muss grün bleiben). Löschen fragt per Bestätigung "Tag aus allen Terminen und Todos entfernen?", wendet die Patches an, ruft `pruneTagFromViews` und löscht die Datei; das Plugin-Tag bleibt geschützt (Schloss).
- [ ] **Step 4:** `npx vitest run src/lib src/components/Settings` grün, `tsc` sauber; Commit `feat(web): tag management in settings`.

### Task 13: Arbeit/Studium-Plugin über Tags

**Files:**
- Modify: `web/src/store/useJobPlannerStore.ts` (Feld `pluginTagIds: string[]`, Setter), `DesktopMonthView.tsx` (31-54), `JobPlanner/PlannerWeekCalendar.tsx` (~81), `JobPlanner/PlannerTermStatus.tsx` (~32), `Settings/extensions/configs/JobPlannerConfig.tsx`
- Create: `web/src/lib/jobTags.ts`, `web/src/lib/__tests__/jobTags.test.ts`

**Interfaces:**
- Produces: `isJobEvent(event: { groupIds?: string[]; parent_id?: string | null; tags?: string[] }, pluginTagIds: string[], legacyGroupId: string | null): boolean` (sobald `pluginTagIds` nicht leer ist, zählt nur der Tag-Treffer; sonst die bisherige Logik mit `legacyGroupId` und `['job','arbeit','uni','studium']`).

- [ ] **Step 1:** Tests: ohne Zuweisung bleibt altes Verhalten (Gruppen-ID und Namensliste); nach Zuweisung zählt nur noch Tag-Treffer; Event mit anderem Tag, aber Namen `"uni"` im alten `tags`-Feld → `false` nach Zuweisung.
- [ ] **Step 2:** Tests fehlschlagen lassen, `jobTags.ts` implementieren, die drei Stellen auf `isJobEvent` umstellen (die drei heutigen Listen entfallen).
- [ ] **Step 3:** `JobPlannerConfig` bekommt eine Mehrfachauswahl der Tags für das Plugin; Planner-erstellte Termine tragen weiter `parent_id: pluginGroupId`.
- [ ] **Step 4:** Tests grün, `tsc` sauber; Commit `feat(web): job planner uses assigned tags`.

### Task 14: Gesamtprüfung und Doku

**Files:**
- Modify: `web/docs/COMPONENTS.md`

- [ ] **Step 1:** `cd web && npx tsc --noEmit && npx vitest run && npm run lint 2>&1 | tail -5` (keine neuen Lint-Fehler über die bekannten 557) und `npm run build` laufen sauber.
- [ ] **Step 2:** Manuell im Browser (lokaler Dev-Login): Migration mit einem Konto, das alte Gruppen und freie Tags hat; Termin ziehen und taggen; Todo mit und ohne Tag; Filter; Ansicht speichern und aus einer Notiz öffnen; Tag löschen.
- [ ] **Step 3:** Commit `docs(web): document tag components`, danach `git push`.
