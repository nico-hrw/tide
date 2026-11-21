# Tags Follow-ups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sieben Nachbesserungen am Tag-Feature umsetzen: schärfere Schrift, Notiz-Kopf, Tabellenformeln (Verkettung + Ergebnisstil), Untertodo-Details, kompakte Tag-Auswahl, Ansicht-Link mit zwei Zielen, Notiz-Tags mit `@#Tag`-Suche.

**Architecture:** Kleine, reine Logikmodule mit Tests (Formel-Evaluator, Tag-Query, Stil aus Marks, Datumsgrenzen) plus dünne UI-Anbindung in neuen Komponenten, damit große Dateien (`mentionSuggestion.tsx`, `CanvasWorkspace.tsx`, `TodoList.tsx`) nicht wachsen. Notiz-Tags liegen als Id-Array `tags` im frei erweiterbaren `metadata` der Notiz-Datei (wie `groupIds` bei Terminen), der Go-Server bleibt unverändert.

**Tech Stack:** Next.js/React, TypeScript, zustand, TipTap/ProseMirror, vitest + happy-dom (`cd web && npx vitest run <datei>`).

**Spec:** `docs/superpowers/specs/2026-11-21-tags-followups-design.md` (baut auf `2026-11-21-tags-central-design.md` und dem Stand `main` @ 1548b30 auf)

## Global Constraints

- AGENTS.md: `apiFetch` für HTTP, `designTokens`/t2-Klassen für Visuelles, keine neuen `any`, neue Dateien < 500 Zeilen, `crypto.ts`/`cryptoV2.ts` und `sqlite.go` DDL nicht anfassen, `web/docs/COMPONENTS.md` bei neuen Komponenten ergänzen.
- Keine neuen Lint-Fehler (Vergleich pro geänderter Datei gegen Stand vor dem Task); i18n-Paritätstest `web/src/lib/__tests__/i18nSettings.test.ts` bleibt grün.
- Zeilenenden pro Datei beibehalten: vor jedem Commit `git diff --stat` und `git diff --stat --ignore-space-at-eol` müssen übereinstimmen.
- `mentionSuggestion.tsx` (1213 Z.) und `CanvasWorkspace.tsx`: nur Glue-Code (≤ 40 Zeilen), neue Logik in eigene Module.
- Schrift: `text-[9px]`/`text-[10px]` werden `text-[11px]`; `text-[11px]` bleibt; `--t2-ink-3` hell Kontrast ≥ 4.5:1 auf Weiß.
- Mehrere `#Tags` im `@`-Query = UND; Untertodo-Datum ≤ Eltern-Fälligkeit, wenn der Eltern-Todo eine hat.
- Nach jedem Task: `cd web && npx tsc --noEmit` sauber; Commit-Stil `feat(web): …`/`fix(web): …`, Zeile `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`, kein Push durch Implementierer.

## Review Focus

1. Formel `+`/`&` mit leeren Zellen, Zahlentext und Fehlern: leere Zelle zählt als Text `""` bei Verkettung, `#DIV/0` etc. propagieren (Task 3).
2. Stil aus Marks darf kein CSS einschleusen: Werte wie `red;background:url(x)` werden verworfen (Task 4).
3. Bestehende Notizen ohne `tags`-Feld und geteilte Notizen mit fremden/gelöschten Tag-Ids: kein Absturz, zählen als "ohne Tag" (Tasks 9, 11, 12).
4. `#` im normalen Titel (`Meeting #3`, `C#`) ist Text, solange kein Tag passt (Task 11).
5. Untertodo ohne/mit späterem Datum als Eltern: Grenze greift nur, wenn der Eltern-Todo ein Datum hat; Beschreibung mit Zeilenumbrüchen bleibt erhalten (Tasks 5, 6).

---

### Task 1: Schrift (Inter, Kontrast, Größen)

**Files:**
- Modify: `web/src/app/layout.tsx`, `web/src/app/globals.css` (`--font-sans` ~l.104, body ~l.341-349, `--t2-ink-3` ~l.128 und dunkel ~l.218), `web/src/app/palettes.css` (ink-3 Überschreibungen ~l.25/41/59/75), alle `web/src/**/*.tsx|css` mit `text-[9px]`/`text-[10px]`/`text-[8px]`
- Create: `web/src/lib/__tests__/typography.test.ts`

**Interfaces:** keine neuen Exporte.

- [ ] **Step 1: Test schreiben** (`typography.test.ts`, liest Dateien per `fs`): (a) in `web/src` kommt `text-[9px]`, `text-[10px]`, `text-[8px]` nicht mehr vor (Ausnahmen nur in Testdateien); (b) der Hex-Wert von `--t2-ink-3` im Light-Block von `globals.css` hat Kontrast ≥ 4.5 zu `#FFFFFF` (WCAG-Formel im Test); (c) `layout.tsx` importiert `next/font/google` mit `Inter` und setzt dessen CSS-Variable am `<html>`/`<body>`.
- [ ] **Step 2:** `npx vitest run src/lib/__tests__/typography.test.ts` → FAIL.
- [ ] **Step 3:** (1) `layout.tsx`: `Inter` aus `next/font/google` (`subsets:['latin','latin-ext']`, `display:'swap'`, `variable:'--font-inter'`), Variable an `html` hängen; `--font-sans` in `globals.css` auf `var(--font-inter), system-ui, …` stellen. (2) `body`: `-webkit-font-smoothing: antialiased; text-rendering: optimizeLegibility;`. (3) `--t2-ink-3` (hell) auf einen Grauton mit Kontrast ≥ 4.5:1 zu Weiß; dunkler Wert und `palettes.css`-Werte so anpassen, dass ihr Kontrast zur jeweiligen Fläche (`--t2-bg`/`--t2-surface` im selben Block, falls vorhanden) ebenfalls ≥ 4.5:1 ist, Farbton beibehalten. (4) Alle `text-[9px]`/`[10px]`/`[8px]` → `text-[11px]` (mechanisch, per Skript), danach `globals.css`-Stellen mit `font-size: 9px/10px` (~l.1110/1116) ebenfalls auf 11px.
- [ ] **Step 4:** Test grün, `tsc` sauber, `npm run build` läuft (der Google-Font-Download passiert im Build; falls offline, Fehler melden).
- [ ] **Step 5:** Im Bericht je eine Zeile zu den dichten Flächen (Wochenraster, Termin-Chips, Pills, Popover), ob 11px dort Umbrüche/Abschneiden verursacht (Code-Lektüre, keine Screenshots nötig). Commit `feat(web): load Inter, raise tiny type sizes, darker secondary gray`.

### Task 2: Notiz-Kopf (Icons unter "Zuletzt bearbeitet", Verlauf weiter rechts)

**Files:**
- Create: `web/src/components/Workspaces/NoteHeaderActions.tsx`, `web/src/components/Workspaces/__tests__/NoteHeaderActions.test.tsx`
- Modify: `web/src/components/Workspaces/CanvasWorkspace.tsx` (Icon-Cluster ~l.562-680 ersetzen durch die neue Komponente; Verlauf ~l.337-360/419), `web/src/components/Editor/NoteHistoryTimeline.tsx` (Position ~l.94/97), `web/src/components/Editor/noteChrome.css`

**Interfaces:**
- Produces: `NoteHeaderActions(props: { isOwner: boolean; historyLabel: React.ReactNode; actions: React.ReactNode; isA4: boolean })` rendert zwei Zeilen rechts ausgerichtet: Zeile 1 = `historyLabel` (nur wenn `isOwner`), Zeile 2 = `actions` (Teilen, VarSheet, Speicherstatus, Optionen, unverändert als Kinder von CanvasWorkspace übergeben).

- [ ] **Step 1: Test:** Rendert mit `isOwner=true`: `data-testid="note-history-row"` steht im DOM vor `data-testid="note-actions-row"`; mit `isOwner=false`: keine History-Zeile, Actions-Zeile bleibt.
- [ ] **Step 2:** fehlschlagen lassen. **Step 3:** Komponente bauen; in `CanvasWorkspace` die bisherigen Buttons (Teilen, VarSheet-Sigma, `SaveStateIcon`-Wrapper, Optionen) als `actions` übergeben und `NoteHistoryLabel` als `historyLabel`; A4-Variante: Cluster bleibt `lg:absolute lg:bottom-full lg:right-0`, mit ausreichend `mb`, damit zwei Zeilen Titel/Breadcrumb nicht überdecken. Verlaufspanel (`NoteHistoryTimeline`): A4 `lg:ml-6` → `lg:ml-10` und die innere Box so ausrichten, dass Punkte/Linie nicht am rechten Rand der 224px-Box kleben (Linie links der Einträge), Panel liegt nie über dem Blatt; nicht-A4 `lg:pr-[300px]`/`right-4` so anpassen, dass das Panel sichtbar rechts bleibt. Panel bleibt nach Klick auf das Label sichtbar (kein Auto-Schließen).
- [ ] **Step 4:** Test grün, `tsc` sauber; Hinweis im Bericht, dass die Optik im Browser zu prüfen ist. Commit `feat(web): note header actions in second row, history panel further right`.

### Task 3: Formeln: Verkettung (`&`, `+` mit Text)

**Files:**
- Modify: `web/src/lib/formula/parser.ts` (`OPS` ~l.12, Parser `cmp()` ~l.121, neue `cat()`-Ebene zwischen `cmp()` und `add()`), `web/src/lib/formula/evaluate.ts` (`case 'bin'` ~l.60-79), `web/src/lib/formula/functions.ts` (nur falls Hilfsfunktion nötig)
- Test: `web/src/lib/formula/__tests__/evaluate.test.ts`, `parser.test.ts`

**Interfaces:**
- Produces: Operator `'&'` in `Expr` (`{k:'bin', op:'&'}`), Typ bleibt `Value = number | string | ErrorValue`; neue interne Hilfe `toText(v: number | string): string` in `evaluate.ts` (Zahlen über `formatResult(n)` aus `format.ts`, Text unverändert).

- [ ] **Step 1: Tests** (Auswertung per `evaluate(parseFormula(src), ctx)` wie in den bestehenden Tests): `="hallo"&" "&"welt"` → `"hallo welt"`; `="a"+SUMME(1;2)` → `"a3"`; `=1+2` → `3`; `="x"+1` → `"x1"`; `=2&3` → `"23"`; `=1,5&"€"` → `"1,5€"`; Präzedenz `="a"&1+2` → `"a3"`; Zahlentext bleibt numerisch: `="5"+3` → `8`; Fehler propagieren: `="a"&(1/0)` → `#DIV/0`; leere Zelle (Ref auf Zelle mit `""`) `=A1&"x"` → `"x"` und `=A1+"x"` → `"x"`; Vergleiche unverändert: `="a"="a"` → wahr wie bisher; Parser-Test: `&` wird getokent (kein "Unerwartetes Zeichen").
- [ ] **Step 2:** fehlschlagen lassen. **Step 3:** `&` zu `OPS`, `cat()` im Parser (links-assoziativ, Präzedenz niedriger als `+/-`, höher als Vergleiche); in `evaluate`: bei `&` immer verketten; bei `+` verketten, wenn mindestens ein Operand ein String ist, den `toNum` nicht als Zahl liest (leerer String zählt als Text für `+`); sonst numerisch wie bisher; Fehlerwerte vor allem anderen propagieren.
- [ ] **Step 4:** `npx vitest run src/lib/formula src/components/extensions/__tests__/TableFormulas.test.ts` grün. Commit `feat(web): text concatenation in table formulas`.

### Task 4: Formelergebnis übernimmt Stil des Formeltexts

**Files:**
- Create: `web/src/components/extensions/formulaResultStyle.ts`, `web/src/components/extensions/__tests__/formulaResultStyle.test.ts`
- Modify: `web/src/components/extensions/tableFormulaDecorations.ts` (~l.95-105, `Decoration.node` an der Zelle), `web/src/app/globals.css` (~l.1093-1104 nur falls `::before` Stil nicht erbt)

**Interfaces:**
- Produces: `resultStyleFromMarks(marks: readonly { type: { name: string }; attrs: Record<string, unknown> }[]): string` → CSS-String für das `style`-Attribut (z. B. `font-weight:700;color:#d33;font-size:14px;background-color:#ff0`), `''` wenn nichts zutrifft.

- [ ] **Step 1: Tests:** `bold` → `font-weight:700`; `italic` → `font-style:italic`; `textStyle` mit `color`/`fontSize` → `color:…;font-size:…`; `highlight` mit `color` → `background-color:…`; `underline`/`strike` → `text-decoration:…`; unsichere Werte (`red;background:url(x)`, `url(javascript:…)`, `expression(…)`) werden verworfen (leerer Beitrag); keine Marks → `''`; unbekannte Marks ignoriert. Farben nur Hex/`rgb(a)`/`hsl(a)`/Namen aus `[a-z]+` (gleiche Strenge wie `sanitizeBgColor` in `TableCellAttrs.ts`: dessen Prüfung wiederverwenden), Größen nur `^\d+(\.\d+)?(px|rem|em|%)$`.
- [ ] **Step 2:** fehlschlagen lassen. **Step 3:** Helfer implementieren (Mark-Namen im Editor-Setup `useTipTapConfig.ts` prüfen: `bold`, `italic`, `underline`, `strike`, `textStyle`, `highlight` oder die dort tatsächlich registrierten Namen); in `tableFormulaDecorations.ts` die Marks des ersten Textknotens der Zelle lesen und das Ergebnis als `style` am `Decoration.node` der Zelle setzen (zusammen mit bestehenden Klassen/`data-result`); ohne Marks bleibt der Zellstil unverändert.
- [ ] **Step 4:** Tests + `npx vitest run src/components/extensions` grün; Commit `feat(web): formula results inherit the formula text styling`.

### Task 5: Untertodos Desktop: anklickbar, Fälligkeit, Beschreibung

**Files:**
- Create: `web/src/lib/subtaskDate.ts`, `web/src/lib/__tests__/subtaskDate.test.ts`
- Modify: `web/src/components/Todo/TodoDesktopView.tsx` (`selectedId`/`activate()` ~l.94-106, Untertodo-Zeilen ~l.130-143), `web/src/components/Todo/TodoDetailPane.tsx` (Date-Row ~l.83-89, neue Beschreibung)
- Test: `web/src/components/Todo/__tests__/todoDetailPane.test.tsx`

**Interfaces:**
- Produces: `subtaskDateMax(task: { parentId?: string | null }, parent: { dueDate?: string } | undefined): string | undefined` (liefert Eltern-`dueDate` nur für Untertodos mit Eltern-Datum) und `clampSubtaskDate(date: string, max: string | undefined): string` (Datum > max → max; sonst unverändert; leeres Datum bleibt leer).

- [ ] **Step 1: Tests:** `subtaskDate.test.ts`: kein Eltern-Datum → `undefined`/unverändert; Datum nach Eltern → auf Eltern-Datum geklemmt; Datum davor/gleich unverändert; Haupt-Todo (kein `parentId`) → keine Grenze. `todoDetailPane.test.tsx` (createRoot + act): `TodoDetailPane` zeigt für ein Todo (auch Untertodo) ein Textfeld `data-testid="todo-description"` mit Wert aus `task.description`; `blur` ruft `onUpdate(task.id, { description })` mit dem Text inkl. Zeilenumbruch; Untertodo mit Elterndatum: Datumsfeld hat `max` = Elterndatum, Änderung darüber wird geklemmt an `onUpdate`.
- [ ] **Step 2:** fehlschlagen lassen. **Step 3:** Helfer implementieren; in `TodoDesktopView` Untertodo-Zeilen klickbar machen (Titel öffnet die Detailansicht des Untertodos, Checkbox/Löschen wie bisher), `selectedId` darf ein Untertodo sein, die linke Liste hebt dann den Eltern-Todo hervor; `TodoDetailPane` zeigt bei Untertodos "Untertodo von «Eltern»" mit Link zurück, ein Beschreibungsfeld (Textarea, speichert bei Blur) für alle Todos, Fälligkeitsfeld mit `max` und Klemmung über `clampSubtaskDate`. `scheduledDate` wird wie bisher mit `dueDate` gesetzt.
- [ ] **Step 4:** Tests grün, `tsc` sauber. Commit `feat(web): subtask details with date and description on desktop`.

### Task 6: Untertodos mobil

**Files:**
- Modify: `web/src/components/Todo/MobileTodoDetail.tsx` (Subtask-Liste ~l.141-152, Fakten ~l.85-97, neues Beschreibungsfeld), `web/src/components/Todo/MobileTodoView.tsx` (Detail-Navigation ~l.252)
- Test: `web/src/components/Todo/__tests__/mobileTodoDetail.test.tsx`

**Interfaces:**
- Consumes: `subtaskDateMax`, `clampSubtaskDate` aus Task 5.

- [ ] **Step 1: Test:** `MobileTodoDetail` zeigt ein Beschreibungsfeld; Blur speichert via `updateTask(id,{description})`; Datumsänderung bei Untertodo wird geklemmt; Antippen des Titels einer Untertodo-Zeile ruft `onOpenSubtask(child.id)`, Antippen der Checkbox toggelt wie bisher (kein Öffnen).
- [ ] **Step 2–4:** fehlschlagen lassen; implementieren (`MobileTodoView` hält `detailId`, öffnet bei `onOpenSubtask` das Untertodo-Detail; Zurück führt zum Eltern-Detail); Tests grün, `tsc` sauber. Commit `feat(web): subtask details on mobile`.

### Task 7: Kompakte Tag-Auswahl (Dropdown mit Suche)

**Files:**
- Modify: `web/src/components/Tags/TagPicker.tsx`, `web/src/components/Tags/__tests__/TagPicker.test.tsx`, `web/src/lib/tags.ts` (zwei reine Helfer)
- Test: `web/src/lib/__tests__/tags.test.ts`

**Interfaces:**
- Produces in `tags.ts`: `filterTagsByQuery(tags: Tag[], query: string): Tag[]` (case-insensitiv, Teilstring auf `normalizeTagName`, leerer Query → alle, Reihenfolge erhalten) und `canCreateTag(tags: Tag[], query: string): boolean` (Query getrimmt nicht leer und kein Tag mit gleichem normalisiertem Namen).
- `TagPicker`-Props bleiben `{ tags, value, onChange, onCreate, compact? }`; `compact` wird ignoriert (neue Form für alle Verwendungen: `EventPopover`, `MobileTagField`, `TodoCreateCard`, `JobPlannerConfig`).

- [ ] **Step 1: Tests:** `tags.test.ts`: `filterTagsByQuery` (leer → alle; "nz" findet "NZ Reise"; kein Treffer → []); `canCreateTag` (leer/Leerzeichen → false; vorhandener Name in anderer Schreibweise → false; neuer Name → true). `TagPicker.test.tsx` anpassen: gewählte Tags erscheinen als Chips in einer Zeile mit Entfernen-Knopf (`onChange` ohne die Id); Knopf `+ Tag` öffnet Liste (`role="listbox"`), Suchfeld filtert, Klick auf Zeile toggelt (`onChange` mit/ohne Id, Reihenfolge = Auswahlreihenfolge), `Neu anlegen »Reise«` erscheint nur bei `canCreateTag` und ruft `onCreate('Reise')` einmal (Doppel-Enter bei laufender Anlage ignoriert), die zurückgegebene Id wird angehängt, bei `undefined` bleibt der Text; Escape schließt; Außenklick schließt.
- [ ] **Step 2–4:** fehlschlagen lassen; implementieren (Chips + Popover-Liste mit `max-h` und Scroll, Tastatur: Pfeile, Enter, Escape; Farbpunkt je Tag; bestehende Guards aus der alten Version übernehmen); `npx vitest run src/components/Tags src/lib` grün, `tsc` sauber. Commit `feat(web): compact searchable tag picker`.

### Task 8: Ansicht-Link mit zwei Zielen (Kalender | Todos)

**Files:**
- Modify: `web/src/components/extensions/ViewMentionExtension.tsx` (NodeView ~l.16-55), `web/src/lib/applyView.ts`, `web/src/hooks/dashboard/useDashboardListeners.ts` (Listener `viewMention:click` ~l.430-450), `web/src/components/Layout/MobileLayout.tsx` (neues Window-Event, nur additive Zeilen; die lokale uncommitted Änderung des Nutzers in dieser Datei nicht anfassen: Arbeit geschieht im Worktree auf einem sauberen Stand)
- Test: `web/src/lib/__tests__/applyView.test.ts`, `web/src/components/extensions/__tests__/viewMention.test.tsx`

**Interfaces:**
- Produces: `viewFilters(view: SavedView, knownTagIds: Set<string>): TagFilter` in `applyView.ts` (gleich bereinigt für beide Ziele); Event `viewMention:click` bekommt `detail: { viewId: string; target: 'calendar' | 'todos' }`; neues Window-Event `mobile_open_todos` (Mobil: Todo-Tab öffnen, Notiz schließen).

- [ ] **Step 1: Tests:** `viewFilters` bereinigt unbekannte Tag-Ids (bekannt/unbekannt gemischt, nur `untagged`); NodeView-Test: Klick auf den Namen dispatcht `{viewId, target:'calendar'}`, Klick auf den "Todos"-Teil `{viewId, target:'todos'}`; fehlende Ansicht → beide Teile ausgegraut, kein Dispatch.
- [ ] **Step 2–4:** fehlschlagen lassen; NodeView als Chip mit zwei Buttons (Name + kleines "Todos"); Listener setzt für **jedes** Target `calendarTagFilter` und `todoTagFilter` auf `viewFilters(...)`; `calendar` → `switchTab("calendar","calendar")` + `applyView`-Modus; `todos` → `tide:navigate {tab:'todos'}` (Desktop) bzw. `mobile_open_todos` (Mobil, MobileLayout hört darauf). Tests grün, `tsc` sauber. Commit `feat(web): view link opens calendar or todos with the same tags`.

### Task 9: Notiz-Tags: Datenmodell, Speichern, Löschen

**Files:**
- Modify: `web/src/store/slices/fsHelpers.ts` (`decryptAndNormalizeFileItem`: `tags` aus `metaData` übernehmen, Array von Strings, sonst `[]`), `web/src/store/slices/types.ts` (`DataItem.tags?: string[]`), `web/src/lib/tags.ts` (`removeTagFromItems` um optionalen 5. Parameter erweitern), `web/src/lib/deleteTag.ts`, `web/src/components/Dashboard/DashboardModals.tsx` (nur Verdrahtung)
- Create: `web/src/hooks/dashboard/useNoteTags.ts`
- Test: `web/src/lib/__tests__/tagDelete.test.ts`, `web/src/store/__tests__/noteTags.test.ts`

**Interfaces:**
- Produces: `setNoteTags(noteId: string, tagIds: string[], options?: { strict?: boolean }): Promise<void>` (Hook `useNoteTags()` liefert es): speichert `metadata.tags` der Notiz per `PUT /api/v1/files/:id` mit Versions-Konflikt-Retry nach dem Muster von `handleUpdateEventGroup` in `useFolderAndGroupActions.ts` (bestehende `metadata` und verschlüsselte Inhalte bleiben unberührt; nur `tags` kommt hinzu; optimistisches Store-Update); `removeTagFromItems(tagId, events, tasks, myId?, notes?)` liefert zusätzlich `notePatches: { id: string; tags: string[] }[]` (nur eigene Notizen, Besitzer = `myId` oder `owner_id` fehlt); `deleteTagEverywhere` bekommt Dependency `saveNote(id, tags)` und wendet `notePatches` mit denselben Fehlerregeln an.

- [ ] **Step 1: Tests:** `noteTags.test.ts`: Normalisierung einer Datei mit `metadata.tags = ['a','b']` → `tags:['a','b']`; ohne Feld → `[]`; mit Nicht-Array/Nicht-Strings → `[]`; `setNoteTags` sendet `metadata` mit vorhandenen Schlüsseln plus `tags` (mocked `apiFetch`), 409 wird einmal mit neuer Version wiederholt, strict wirft bei Fehler. `tagDelete.test.ts`: `notePatches` entfernt die Id nur aus eigenen Notizen (fremde Notiz `owner_id≠myId` → kein Patch), unbeteiligte Notizen kein Patch; `deleteTagEverywhere`: schlägt `saveNote` fehl → `deleteFile` nicht aufgerufen, `ok=false`.
- [ ] **Step 2–4:** fehlschlagen lassen; implementieren; `npx vitest run src/store src/lib` grün, `tsc` sauber. Commit `feat(web): notes carry tag ids`.

### Task 10: Notiz-Tags im Notiz-Kopf

**Files:**
- Create: `web/src/components/Editor/NoteTagsRow.tsx`, `web/src/components/Editor/__tests__/NoteTagsRow.test.tsx`
- Modify: `web/src/components/Workspaces/CanvasWorkspace.tsx` (eine Zeile Einbindung unter dem Titel, nur Besitzer), `web/docs/COMPONENTS.md`

**Interfaces:**
- Consumes: `TagPicker` (Task 7), `useNoteTags()` (Task 9), `useTagCreate()`, `selectTags(notes)`.
- Produces: `NoteTagsRow(props: { noteId: string; isOwner: boolean })`.

- [ ] **Step 1: Test:** Besitzer sieht den Picker, Auswahl ruft `setNoteTags(noteId, ids)`; Nicht-Besitzer: Komponente rendert nichts; unbekannte Tag-Ids in `note.tags` werden nicht angezeigt und beim nächsten Speichern entfernt (nur bekannte bleiben).
- [ ] **Step 2–4:** fehlschlagen lassen; implementieren; Tests grün, `tsc` sauber. Commit `feat(web): tag picker in the note header`.

### Task 11: `@#Tag` Query-Logik (rein)

**Files:**
- Create: `web/src/components/extensions/tagQuery.ts`, `web/src/components/extensions/__tests__/tagQuery.test.ts`

**Interfaces:**
- Produces:
  - `parseTagQuery(query: string, tags: Tag[]): { tagIds: string[]; text: string; ambiguous: { token: string; candidates: Tag[] } | null }` — Tokens `#wort` (kein Leerzeichen, `#` am Wortanfang). Pro Token: exakter Name (case-insensitiv, über `normalizeTagName`) gewinnt, sonst eindeutiger Präfix-Treffer; mehrere Präfix-Treffer → `ambiguous` (nur das erste mehrdeutige Token, nicht angewendet), kein Treffer → Token bleibt Teil von `text`. `text` ist der Query ohne angewendete Tokens, getrimmt, Mehrfachleerzeichen zusammengefasst. `tagIds` ohne Duplikate in Eingabereihenfolge.
  - `matchesAllTags(itemTagIds: readonly string[] | undefined, tagIds: readonly string[], knownTagIds: ReadonlySet<string>): boolean` — UND über `tagIds`; unbekannte Ids im Item zählen nicht; `tagIds` leer → `true`.

- [ ] **Step 1: Tests:** `@#NZ` mit Tags [NZ] → `tagIds:[nz]`, `text:''`; `#nz reise` → `text:'reise'`; zwei Tokens `#NZ #Reise foo` → beide Ids, `text:'foo'`; Präfix `#re` bei einem Treffer → angewendet, bei zwei Treffern (Reise, Recht) → `ambiguous.candidates` beide, nichts angewendet; `Meeting #3` (kein Tag `3`) → `tagIds:[]`, `text:'Meeting #3'`; `C#` bleibt Text; Duplikat `#NZ #nz` → eine Id; `matchesAllTags`: Item mit [a,b] passt auf [a], [a,b], nicht auf [a,c]; Item ohne Tags/`undefined` passt nicht auf nicht-leeres Filter, passt auf leeres; gelöschte Id im Item zählt nicht.
- [ ] **Step 2–4:** fehlschlagen lassen; implementieren; Tests grün, `tsc` sauber. Commit `feat(web): tag token parsing for the @ menu`.

### Task 12: `@#Tag` im `@`-Menü anbinden

**Files:**
- Create: `web/src/components/extensions/tagSuggestion.ts`, `web/src/components/extensions/__tests__/tagSuggestion.test.ts`
- Modify: `web/src/components/extensions/mentionSuggestion.tsx` (Glue ≤ 40 Zeilen in `items()` ~l.798-982 und `command()`/`MentionList`-Zeilenrenderer für Typ `'tag'`), `web/src/components/extensions/viewSuggestion.ts` (Typ-Union nur falls nötig)

**Interfaces:**
- Consumes: `parseTagQuery`, `matchesAllTags` (Task 11), `selectTags`, `getEventGroupIds`, Notiz-`tagIds` (Task 9), Todo-`tags`.
- Produces: `applyTagFilter<T>(items: T[], getTagIds: (item: T) => readonly string[] | undefined, tagIds: readonly string[], knownTagIds: ReadonlySet<string>): T[]` und `buildTagRows(ambiguous: { token: string; candidates: Tag[] } | null): MentionSuggestionItem[]` (Zeilen `{ id: 'TAG:<tagId>', label: Tagname, type: 'tag', color }`).

- [ ] **Step 1: Tests:** `applyTagFilter`: UND-Filter auf Termine (`groupIds`/Legacy-`parent_id`), Todos (`tags`), Notizen (`tags`), Items ohne Tags fallen bei aktivem Filter weg, leerer Filter lässt alles durch; `buildTagRows` liefert eine Zeile je Kandidat, `null` → `[]`; Test, dass der bereinigte `text` (ohne `#…`) für die "Create File/Create Todo"-Zeilen genutzt werden kann (Hilfsfunktion `cleanActionLabelQuery(parsed)` oder gleichwertig).
- [ ] **Step 2–4:** fehlschlagen lassen; in `items()` direkt nach dem Quicknote-Zweig `parseTagQuery(query, selectTags(files))` aufrufen: bei `tagIds.length>0` Notizen, Termine und Todos nach `applyTagFilter` einschränken, Dateien/Anhänge und Ansichten ausblenden, Titelsuche mit `text`; bei `ambiguous` die Tag-Zeilen oben anzeigen; die "Create …"-Zeilen nutzen `text`. `command()` für Typ `'tag'`: ersetzt den Query-Bereich durch `@#Tagname ` (der Suggestion-Plugin triggert weiter; mit einem Test oder einer klaren Anmerkung im Bericht verifizieren, dass das Menü nach dem Einfügen offen bleibt/neu öffnet). `capSuggestionItems` bleibt unverändert. Keine Änderung am Verhalten ohne `#`.
- [ ] **Step 5:** `npx vitest run src/components/extensions` grün, `tsc` sauber. Commit `feat(web): filter the @ menu by #tags`.

### Task 13: Gesamtprüfung und Doku

**Files:** `web/docs/COMPONENTS.md`

- [ ] **Step 1:** `cd web && npx tsc --noEmit && npx vitest run && npm run build` laufen sauber (3× `vitest run` hintereinander grün); Lint nur für geänderte Dateien gegen die Basis vergleichen (keine neuen Fehler).
- [ ] **Step 2:** `COMPONENTS.md` listet `NoteHeaderActions`, `NoteTagsRow`, die neue Form von `TagPicker` und `tagQuery`/`tagSuggestion`. Commit `docs(web): document follow-up components`.
