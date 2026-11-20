# Tabellen, Formeln und Variablen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bessere Desktop-Tabellen (Ausrichtung, Verbinden/Teilen, Stil B), Formeln mit Excel-Bedienung und lokale/globale Variablen samt Register und Teilen-Rückfrage.

**Architecture:** Zellattribute und Menüs sind TipTap-Erweiterungen auf `prosemirror-tables`. Formeln sind Zelltext mit `=`; eine reine Engine in `web/src/lib/formula/` rechnet, ein ProseMirror-Plugin zeigt Ergebnisse als Decorations. Variablen kommen aus Scope-Kette lokal → global (Register als verschlüsselte Datei) → Teilen-Kopie → Standard.

**Tech Stack:** TipTap 3.20, prosemirror-tables 1.8.5, React 19, Vitest (happy-dom), Next.js.

**Spec:** `docs/superpowers/specs/2026-11-20-tables-formulas-variables-design.md`

## Global Constraints

- Dateien < 500 Zeilen, kein neues `any`, Farben nur über Tokens/CSS-Variablen (kein Hardcode in Komponenten), HTTP nur über `apiFetch`.
- `crypto.ts`, `cryptoV2.ts`, DDL in `cloud/internal/store/sqlite.go` nicht ändern. Geht das Register nicht ohne DDL-Änderung: stoppen und nachfragen.
- Formeln: Zelltext beginnt mit `=`; deutsches Dezimalkomma; `3,9 %` = 0,039; Ergebnis nie im Dokument speichern.
- Auflösung: lokal → global → Teilen-Kopie → Standard.
- Funktionen v1: `SUMME, MITTELWERT, MIN, MAX, ANZAHL, RUNDEN, WENN, ABS, WURZEL, POTENZ, RMZ, ZW, BW` (+ englische Aliase).
- Fehler: `#DIV/0, #WERT, #BEZUG, #NAME, #ZIRKEL, #VAR`.
- Nach jeder Etappe: `cd web && npx tsc --noEmit`, `npm test`, `npm run build`, `web/docs/COMPONENTS.md` aktualisieren, eigener Commit. Nur eigene Dateien stagen (Arbeitsbaum enthält fremde Änderungen).

## Review Focus

- Bestehende Tabellen ohne neue Attribute laden unverändert (Test in Task 1).
- Verbundene Zellen (`colspan/rowspan`) in Formelbezügen: obere linke Zelle zählt (Task 6).
- Leere Zelle, Text in Zahlenbereich, Division durch 0: definierte Fehler/Werte statt Absturz (Task 5).
- Zirkelbezüge `A1 → B1 → A1` hängen den Editor nicht auf (Task 6).
- `3,9`, `1.234,5`, `12 %` werden richtig gelesen; `1.5` ist kein Dezimalpunkt-Zahlenformat (Task 4).

---

## Etappe 1 — Zellen und Aussehen

### Task 1: Zellattribute `textAlign` / `verticalAlign`

**Files:**
- Create: `web/src/components/extensions/TableCellAttrs.ts`
- Modify: `web/src/components/Editor/useTipTapConfig.ts:33-36,248` (Import und Registrierung)
- Test: `web/src/components/extensions/__tests__/TableCellAttrs.test.ts`

**Interfaces:**
- Produces: `export const TableCellAligned` und `export const TableHeaderAligned` (erweitern `TableCell`/`TableHeader` um Attribute `textAlign: 'left'|'center'|'right'|null` und `verticalAlign: 'top'|'middle'|'bottom'|null`, Default `null`); Rendering als `style="text-align:…;vertical-align:…"`; Parsing aus denselben Style-Werten.

- [ ] **Step 1: Write the failing test** — `parses and renders alignment attrs`: Editor mit `[Document, Paragraph, Text, Table, TableRow, TableHeaderAligned, TableCellAligned]` und HTML `<table><tr><td style="text-align:right;vertical-align:middle">1</td></tr></table>` → `getJSON()` Zelle hat `attrs.textAlign === 'right'`, `attrs.verticalAlign === 'middle'`; `getHTML()` enthält `text-align: right`. Zweiter Test `old documents without attrs stay unchanged`: Zelle ohne Style hat beide Attribute `null` und `getHTML()` enthält kein `text-align`.
- [ ] **Step 2: Run** `cd web && npx vitest run src/components/extensions/__tests__/TableCellAttrs.test.ts` → FAIL (Modul fehlt).
- [ ] **Step 3: Implement** beide Extensions mit `TableCell.extend({ addAttributes() { return { ...this.parent?.(), textAlign: {...}, verticalAlign: {...} } } })`; `parseHTML` liest `element.style.textAlign`/`verticalAlign`, `renderHTML` gibt nur gesetzte Werte aus.
- [ ] **Step 4: Run** Test → PASS.
- [ ] **Step 5: Register** in `useTipTapConfig.ts` statt `TableHeader, TableCell`; `npx tsc --noEmit` sauber.
- [ ] **Step 6: Commit** `feat(web): cell alignment attributes for tables`

### Task 2: Stil B (CSS)

**Files:**
- Modify: `web/src/app/globals.css:973-998` (Block „Table Redesign")

- [ ] **Step 1:** Block ersetzen: Zellen ohne Seitenränder, `border-bottom` als Trennlinie, `tbody tr:nth-child(even) td` leicht abgesetzt, `th` linksbündig (kein `text-align:center`), Kapitälchen (`font-size:11px; text-transform:uppercase; letter-spacing:.04em`), `border-bottom:2px` unter der Kopfzeile, Hover zeigt Zellrand, `.selectedCell` mit violettem Rand (`--t2-accent` falls vorhanden, sonst bestehende Accent-Variable), Zahlen bleiben nach `textAlign`. Dark Mode über vorhandene Variablen.
- [ ] **Step 2:** `cd web && npm run build` fehlerfrei; Sichtprüfung im Dev-Server (neue Tabelle per `/table`).
- [ ] **Step 3: Commit** `style(web): table style B`

### Task 3: Zellen-Befehle und schmale Leiste

**Files:**
- Create: `web/src/components/Editor/tableCommands.ts`
- Create: `web/src/components/Editor/TableCellBar.tsx`
- Modify: `web/src/components/Editor.tsx` (Leiste einbinden, nahe `EditorBubbleMenu`)
- Test: `web/src/components/Editor/__tests__/tableCommands.test.ts`

**Interfaces:**
- Produces: `setCellAlign(editor: Editor, h?: 'left'|'center'|'right', v?: 'top'|'middle'|'bottom'): boolean` (wirkt auf die ausgewählte Zelle oder alle Zellen der CellSelection); `canMerge(editor): boolean`, `canSplit(editor): boolean`; `<TableCellBar editor={Editor} />` rendert nur, wenn `editor.isActive('table')`, schwebend über der Auswahl.

- [ ] **Step 1: Write failing tests** (Editor wie Task 1, 2×2-Tabelle): `setCellAlign aligns the selected cell` (Selektion in Zelle 0, `setCellAlign(editor,'right')` → Attr `right`); `setCellAlign applies to a CellSelection` (alle vier Zellen); `canMerge is false for a single cell`, `merge then split restores cell count`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** `tableCommands.ts` mit `editor.chain().focus().setCellAttribute(...)`, `mergeCells`, `splitCell`.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Implement `TableCellBar.tsx`** nach Mockup `tabellen-menues-v4.html` Kasten 1: Gruppen H-Ausrichtung (3), V-Ausrichtung (3), Verbinden, Teilen, Σ (`SUMME`-Formel in nächste leere Zelle erst in Etappe 2, hier deaktiviert ausgeblendet). Positionierung per `editor.view.coordsAtPos`. Icons: lucide-react (`AlignLeft/Center/Right`, `AlignVerticalJustify*`, `Merge`, `Split`). Aktiver Zustand per Attribut.
- [ ] **Step 6:** `npx tsc --noEmit`, Handtest: Linksklick in Zelle zeigt Leiste, Ausrichten wirkt.
- [ ] **Step 7: Commit** `feat(web): table cell bar with alignment, merge and split`

### Task 4: Neues Rechtsklick-Menü

**Files:**
- Create: `web/src/components/Editor/TableContextMenu.tsx`
- Modify: `web/src/components/Editor/EditorToolbar.tsx` (Alt-Menü entfernen, Re-Export von `TableContextMenu`), `web/src/components/Editor.tsx:15,648` (Import)

**Interfaces:**
- Consumes: `TableMenuPosition` aus `Editor/types.ts`.
- Produces: `<TableContextMenu editor position />` — zeigt `<TableCellBar>` nicht selbst (die ist ohnehin sichtbar), sondern ein breites Menü mit drei Gruppen nebeneinander: Spalte (links/rechts einfügen, löschen), Zeile (oben/unten einfügen, löschen), Tabelle (Kopfzeile ein/aus via `toggleHeaderRow`, löschen). Deutsche Beschriftungen, Icons, schließt bei Klick außerhalb und Escape (`setTableMenuData(null)` per `onClose`-Prop).

- [ ] **Step 1:** Komponente nach Mockup `tabellen-menues-v4.html` Kasten 2 bauen; Positionierung wie bisher (an Fenstergrenzen geklemmt).
- [ ] **Step 2:** Altes Menü und `TableActionItem` aus `EditorToolbar.tsx` entfernen, falls nirgends sonst genutzt (`grep`).
- [ ] **Step 3:** `npx tsc --noEmit` sauber, Handtest: Rechtsklick in Tabelle, jede Aktion wirkt, Menü schließt.
- [ ] **Step 4:** Schrift: DM Sans/DM Mono über `next/font/google` in `web/src/app/layout.tsx` **nicht** ändern (nicht anfassen) — stattdessen CSS-Variablen `--font-menu` in `globals.css` mit Fallback auf `--font-sans`; `next/font`-Anbindung ist ein eigener Schritt nach Rückfrage.
- [ ] **Step 5:** `COMPONENTS.md` aktualisieren; `npm run build`; **Commit** `feat(web): two-part table menu`

---

## Etappe 2 — Formeln

### Task 5: Parser

**Files:**
- Create: `web/src/lib/formula/parser.ts`, `web/src/lib/formula/types.ts`
- Test: `web/src/lib/formula/__tests__/parser.test.ts`

**Interfaces:**
- Produces: `parseFormula(src: string): Expr` (wirft `FormulaError` mit Code `#WERT`); `type Expr = {k:'num',v:number} | {k:'ref',col:number,row:number} | {k:'range',from:Ref,to:Ref} | {k:'var',name:string} | {k:'call',name:string,args:Expr[]} | {k:'bin',op:string,l:Expr,r:Expr} | {k:'neg',e:Expr} | {k:'pct',e:Expr}`. `parseNumber(text: string): number | null` (deutsche Schreibweise).

- [ ] **Step 1: Failing tests** `parses 3,9 as 3.9`, `parses 1.234,5 as 1234.5`, `parses 12 % as pct`, `parses B2:B9 as range`, `precedence: 1+2*3^2`, `parses rate(B2, zins, 48)`, `rejects unclosed paren with #WERT`, `parseNumber("1.5") is null`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** Tokenizer + rekursiver Abstieg (`^` rechtsassoziativ, Prozent als Postfix). Spaltenbuchstaben A…ZZ → Index.
- [ ] **Step 4: Run** → PASS. **Commit** `feat(web): formula parser`

### Task 6: Evaluator und Funktionen

**Files:**
- Create: `web/src/lib/formula/evaluate.ts`, `functions.ts`, `format.ts`
- Test: `web/src/lib/formula/__tests__/evaluate.test.ts`

**Interfaces:**
- Consumes: `Expr` aus Task 5.
- Produces: `evaluate(expr: Expr, ctx: EvalContext): Value` mit `type Value = number | string | FormulaErrorValue`, `interface EvalContext { cell(col:number,row:number): Value; lookup(name:string): Variable | undefined; callFn(name:string,args:Value[]): Value }`, `formatResult(v: Value): string` (de-DE, höchstens 4 Nachkommastellen, Fehler als Code), `export const BUILTINS: Record<string, (args: Value[]) => Value>`.

- [ ] **Step 1: Failing tests:** `SUMME over range ignores empty cells`, `text in numeric range gives #WERT`, `1/0 gives #DIV/0`, `RMZ(0,5%/12... )` gegen bekannten Wert (z. B. `RMZ(0,039/12; 48; -12000)` ≈ 270,6 — Wert vor dem Test mit unabhängiger Rechnung bestimmen), `WENN(1>0;"a";"b")`, `unknown name gives #NAME`, `formatResult(12000.5) === "12.000,5"`.
- [ ] **Step 2–4:** Run (FAIL) → implementieren → PASS.
- [ ] **Step 5: Commit** `feat(web): formula evaluator and builtin functions`

### Task 7: Tabellenmodell, Abhängigkeiten, Zyklen

**Files:**
- Create: `web/src/lib/formula/tableCalc.ts`
- Test: `web/src/lib/formula/__tests__/tableCalc.test.ts`

**Interfaces:**
- Consumes: `parseFormula`, `evaluate`, `EvalContext`.
- Produces: `computeTable(cells: CellGrid, scope: Scope): Map<string, Value>` mit `type CellGrid = { rows: number; cols: number; text(col:number,row:number): string }` (Schlüssel `"B2"`); verbundene Zellen: Text steht an der oberen linken Koordinate, überdeckte Koordinaten sind leer. Zirkel → `#ZIRKEL` für alle beteiligten Zellen.
- Produces: `gridFromPmTable(tableNode: Node): CellGrid` (nutzt `TableMap`).

- [ ] **Step 1: Failing tests:** `computes dependent chain`, `A1=B1, B1=A1 gives #ZIRKEL`, `merged cell address is top-left`, `range over merged cells counts once`.
- [ ] **Step 2–4:** FAIL → implementieren (Memoisierung + Besuchsmarkierung) → PASS. **Commit** `feat(web): table calculation with cycle detection`

### Task 8: Editor-Plugin `TableFormulas`

**Files:**
- Create: `web/src/components/extensions/TableFormulas.ts`, `TableFormulaHighlight.css` (oder Block in `globals.css`)
- Modify: `useTipTapConfig.ts` (Registrierung), `TableCellBar.tsx` (Σ aktivieren)

**Interfaces:**
- Consumes: `computeTable`, `gridFromPmTable`, `formatResult`.
- Produces: TipTap-Extension `TableFormulas` (ProseMirror `Plugin` mit `props.decorations`): (a) für nicht fokussierte Zellen mit Text `=…` ein Widget mit dem Ergebnis und ausgeblendeter Zeltext-Inline-Decoration; (b) im Formelmodus (Cursor in Zelle, deren Text mit `=` beginnt): Spaltenköpfe/Zeilennummern, Leuchten der Zellen mit Zahlen, Farbe pro Bezug; `handleDOMEvents.mousedown` fügt auf anklickbare Zelle den Bezug (`B2`) bzw. beim Ziehen den Bereich (`B2:B9`) in den Zelltext ein.

- [ ] **Step 1:** Plugin-Zustand mit `computeTable` pro Tabelle, Neuberechnung nur bei `docChanged`.
- [ ] **Step 2:** Handtest mit Mockup-Beispiel: `=B2*C2/12`, Aufleuchten, Klick fügt ein, Fokusverlust zeigt Ergebnis, Zirkel zeigt `#ZIRKEL`.
- [ ] **Step 3:** Σ in der Leiste fügt `=SUMME(<Bereich darüber>)` in die ausgewählte Zelle ein.
- [ ] **Step 4:** `tsc`, `npm test`, `npm run build`; `COMPONENTS.md`; **Commit** `feat(web): table formulas with highlight and click-to-reference`

---

## Etappe 3 — Variablen, Register, Teilen

### Task 9: Scope und Standardbibliothek

**Files:**
- Create: `web/src/lib/formula/scope.ts`, `stdlib.ts`
- Test: `web/src/lib/formula/__tests__/scope.test.ts`

**Interfaces:**
- Produces: `parseDefinitions(text: string): Definition[]` (`name = expr` / `name(a,b) = expr`), `interface Definition { name: string; params?: string[]; expr: string; global: boolean }`, `buildScope(layers: { local: Definition[]; global: () => Definition[]; snapshot: Definition[] }): Scope` mit `lookup(name)` in Reihenfolge lokal → global → snapshot → `STDLIB` (`pi`, `e`); `global` wird nur aufgerufen, wenn lokal nichts gefunden wurde (lazy).
- [ ] **Step 1: Failing tests:** `local wins over global`, `global is not called when local resolves`, `user function rate(b,z,n)`, `pi can be overridden`, `unknown gives #VAR`.
- [ ] **Step 2–4:** FAIL → implementieren (Rekursionsgrenze gegen Funktionszyklen) → PASS. **Commit** `feat(web): variable scope and stdlib`

### Task 10: Variablenblock

**Files:**
- Create: `web/src/components/extensions/VariablesBlock.tsx`
- Modify: `useTipTapConfig.ts`, `SlashCommand.tsx` (Eintrag „Variablen")
- Produces: Node `variablesBlock` mit Attributen `code: string`, `snapshot: Definition[]` (Default `[]`); Zeilen mit lokal/global-Schalter (`global`-Flag steht als Präfix `@` im Text, z. B. `@zins = 3,9 %`, damit es im Dokument liegt); registriert beim Registry-Dienst die globalen Zeilen.

- [ ] Handtest + `COMPONENTS.md`; **Commit** `feat(web): variables block`

### Task 11: Register-Dienst

**Files:**
- Create: `web/src/lib/variableRegistry.ts`
- Test: `web/src/lib/__tests__/variableRegistry.test.ts` (Merge-/Entprell-Logik gegen Mock-Speicher)

**Interfaces:**
- Produces: `loadRegistry(): Promise<RegistryEntry[]>` (lazy, pro Sitzung gecacht), `syncNoteDefinitions(noteId: string, defs: Definition[]): void` (entprellt, ersetzt alle Einträge der Notiz), `removeNote(noteId: string): void`; `RegistryEntry = { name; params?; expr; sourceNoteId: string | null }`.
- **Erst prüfen:** wie das Datei-System Dateien anlegt (`useDataStore.ts`, `api.ts`, Typ `files.type`); Register als versteckte Datei mit `type: 'registry'`, aus Notizlisten gefiltert. Geht das nicht ohne DDL-Änderung → **stoppen und nachfragen**.
- [ ] **Commit** `feat(web): global variable registry`

### Task 12: Variablen-Popup

**Files:**
- Create: `web/src/components/Settings/VariablesModal.tsx`
- Modify: Seitenleiste (`Sidebar.tsx`) — Eintrag neben Einstellungen

- [ ] Hülle und Maße von `SettingsModal.tsx` (1060 × 760, Seitenleiste 240, Inhalt 660); Seiten Meine globalen / Funktionen / Standard (Tide); „+ Neue Variable" nur für Einträge ohne Notiz; Link zur Herkunftsnotiz. **Commit** `feat(web): variables popup`

### Task 13: Teilen-Rückfrage

**Files:**
- Modify: Teilen-Ablauf (Ort per `grep` nach `share` in `web/src/components`, vgl. `docs/crypto/SHARING_AND_RE_ENCRYPTION.md`)
- Produces: Dialog nach Mockup `variablen-v1.html` Kasten 3; „Ja" schreibt die genutzten Definitionen in `variablesBlock.snapshot`; „Nein" lässt `snapshot` leer; Auflösung fällt dann auf `#VAR` (Mouseover-Text „Variable `x` nicht verfügbar.").
- [ ] Test: `scope` mit leerem Snapshot liefert `#VAR`. **Commit** `feat(web): ask to share variables`
