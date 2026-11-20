# Statusbericht: Tabellen, Formeln und Variablen

Stand: 2026-11-20 · Arbeit pausiert auf Wunsch der Nutzerin oder des Nutzers · Branch `main` · letzter Feature-Commit `03343ff`, danach ein WIP-Commit (siehe Abschnitt 9).

Dieser Bericht ist so geschrieben, dass jemand ohne Kenntnis der Unterhaltung weiterarbeiten kann. Er enthält: was gewollt ist, was entschieden wurde, was fertig ist, was fehlt (mit genauen Anweisungen), welche Probleme und Risiken bekannt sind und wie man alles prüft.

---

## 1. Kurzfassung

| Etappe | Inhalt | Stand |
|---|---|---|
| 1 | Zellen und Aussehen (Ausrichtung, Verbinden/Teilen, Stil B, zweigeteiltes Menü) | **fertig**, committet, getestet |
| 2 | Formeln (Engine, Ergebnisanzeige, Formelmodus mit Aufleuchten, Klick und Ziehen, Σ) | **fertig**, committet, getestet |
| 3 | Variablen, Zentralregister, Popup, Teilen-Rückfrage | **ca. 55 % fertig**: Logik, Datenmodell, Speicherung und Block-Knoten stehen und sind getestet; **Oberfläche und Verdrahtung fehlen** |

Gesamtfortschritt grob: **etwa 80 %** der Arbeit (nach Aufwand), **0 % der Oberfläche von Etappe 3** (Block-Ansicht, Popup, Teilen-Dialog, Seitenleisten-Eintrag) und **keine Prüfung im laufenden Browser** für irgendeine Etappe (nur automatisierte Tests im simulierten DOM).

Prüfstand beim Pausieren: `npx tsc --noEmit` sauber, `npm test` **318 Tests in 35 Dateien grün**, `npm run build` zuletzt nach Etappe 2 erfolgreich (nach den Änderungen in Etappe 3 noch nicht wiederholt).

**Wichtig vorab:** Es gibt eine offene Sicherheitsmeldung zum Register (Abschnitt 7, Punkt P1). Das Register ist noch **nicht** im Editor verdrahtet, die Lücke ist also nicht erreichbar. Sie muss vor der Verdrahtung behoben werden.

---

## 2. Was gewollt ist (Ziel in den Worten der Nutzerin oder des Nutzers, sinngemäß)

Zwei Vorhaben wurden besprochen. Dieser Bericht betrifft nur **Vorhaben 2** (Tabellen am PC). Vorhaben 1 (mobiler Kalender: Termin halten und verschieben, Doppeltipp-Entwurf, Zeitlinie an der echten Uhrzeit) läuft in einer anderen Sitzung und hat eigene Dokumente (`docs/superpowers/specs/…mobile-calendar…`, siehe `git log`: `2550337`, `33bdf0d`).

Vorhaben 2, die Anforderungen:
- Titel sind zentriert, Inhalte linksbündig, Zellen lassen sich nicht verbinden/teilen, Textausrichtung nicht einstellbar → verbessern, schöner machen.
- Formeln im Excel-Ansatz: Tippt man `=`, leuchten die Zellen samt Umrandung etwas auf und sind anklickbar, um sie in der Formel zu nutzen.
- Variablen für Alltagsrechnungen (heute: **Währungsumrechnung, Rückzahlungskosten, Zinsen**; später evtl. Steuern). Keine Programmiersprache mit Klassen oder Bibliotheken.
- **Zentrales Register** parallel zu den Notizen: Ändert man etwas in einer Notiz, wird die zentrale Referenz aktualisiert; ruft man eine Variable auf, wird nur der zentrale Speicher entschlüsselt/abgefragt.
- **Lokale und globale Variablen:** Was man in einer Notiz schreibt, ist standardmäßig lokal, kann aber global gemacht werden und landet dann im Register.
- Eine **Standard-Datei** mit globalen Funktionen und Variablen, überall verfügbar (z. B. `pi`).
- **Teilen:** Beim Teilen einer Notiz, die globale Variablen nutzt, wird gefragt, ob die Variablen mitgeteilt werden. Wenn nicht, kommen die Formeln mit, zeigen aber überall `#VAR`.
- Das Variablen-Popup soll **Größe und Breite wie das Einstellungs-Popup am PC** haben.
- Das Menü soll **hell** sein, nicht nur Klartext, mehr Icons, andere Gliederung, andere Schrift, **aufgeteilt**: Linksklick zeigt nur die schmale Zellen-Leiste, Rechtsklick zeigt zusätzlich das zweite Menü (Spalte · Zeile · Tabelle nebeneinander). Das bestehende (englische) Rechtsklick-Menü musste integriert/ersetzt werden.

## 3. Wichtige Dateien und Dokumente

### Dokumente
| Datei | Inhalt |
|---|---|
| `docs/superpowers/specs/2026-11-20-tables-formulas-variables-design.md` | Freigegebenes Design-Dokument (Ziele, Nicht-Ziele, Ansätze, Entscheidungen) |
| `docs/superpowers/plans/2026-11-20-tables-formulas-variables.md` | Umsetzungsplan mit 13 Tasks (Etappen 1 bis 3) |
| `docs/superpowers/reports/2026-11-20-tables-formulas-variables-status.md` | dieser Bericht |
| `web/docs/COMPONENTS.md` | Komponentenverzeichnis, in Etappe 1 und 2 ergänzt (Etappe 3 noch nicht) |

### Mockups (HTML, im Browser öffnen; jeweils die Entscheidung der Nutzerin oder des Nutzers)
Im Repo versioniert unter `docs/superpowers/mockups/tables/`:

| Pfad | Zeigt | Status |
|---|---|---|
| `docs/superpowers/mockups/tables/tabellen-look.html` | Tabellenstil **A (Linien)** und **B (leicht, Zebra)** sowie der **Formelmodus** (Aufleuchten, Farben pro Bezug) | **B gewählt**; der Formelmodus-Teil gilt |
| `docs/superpowers/mockups/tables/tabellen-menues-v4.html` | **Endgültige Menüs:** Linksklick = schmale Leiste, Rechtsklick = Leiste + Menü mit Spalte · Zeile · Tabelle nebeneinander | **gewählt** („sieht gut aus“) |
| `docs/superpowers/mockups/tables/variablen-v1.html` | (1) **Variablenblock** in der Notiz, (3) **Teilen-Dialog** und Ansicht ohne Variablen (`#VAR`) | (1) und (3) gelten; Abschnitt (2) ist durch das Popup-Mockup ersetzt |
| `docs/superpowers/mockups/tables/variablen-v2-popup.html` | **Variablen-Popup** in Einstellungs-Größe (1060 px breit, Seitenleiste 240 px, Inhalt höchstens 660 px) | **gewählt** |

Zwischenstände, nicht mehr gültig, nur lokal vorhanden (nicht versioniert, `.superpowers/` ist untracked):
`.superpowers/brainstorm/1847-1795171108/content/tabellen-menues-v2.html` (Menü mit Klartext, dunkle Leiste, verworfen) und `tabellen-menues-v3.html` (zwei Varianten: Icon-Palette und Griffe am Rand, verworfen zugunsten der Aufteilung in v4).

Hinweis: Die Mockups laden die Schriften DM Sans und DM Mono von Google Fonts; das ist nur für das Mockup. Im Produkt dürfen keine externen Fonts geladen werden (siehe P7).

---

## 4. Getroffene Entscheidungen (verbindlich, so von der Nutzerin oder dem Nutzer freigegeben)

| Thema | Entscheidung |
|---|---|
| Formel-Engine | **Eigene kleine Engine** ohne neue Abhängigkeit (nicht math.js) |
| Ort des Registers | **Spezielle verschlüsselte Datei** im bestehenden Datei-/Sync-System, keine Datenbankschema-Änderung |
| Speicherung einer Formel | **Der Zelltext ist die Formel** (`=B2*C2`); das Ergebnis wird beim Anzeigen berechnet und nie im Dokument gespeichert |
| Teilen | Beim Teilen fragen. **Ja:** genutzte globale Werte als eingefrorene Kopie in der Notiz (verschlüsselt im Notizinhalt); beim Öffnen durch den Besitzer wird die Kopie mit dem Register abgeglichen. **Nein:** keine Kopie, Formeln bleiben, andere sehen `#VAR` |
| Auflösungsreihenfolge | **lokal → global (Register) → Teilen-Kopie → Standard (Tide)**; lokal gewinnt, `pi` ist überschreibbar |
| Menüs | Zwei Menüs (Linksklick: Leiste; Rechtsklick: Leiste plus Menü mit Spalte · Zeile · Tabelle nebeneinander), hell, Icons, Deutsch; ersetzt das alte englische Menü |
| Stil | **Stil B** (nur Trennlinien, Zebra, Kopfzeile in Kapitälchen, Titel **linksbündig**) |
| Popup | Hülle und Maße wie `SettingsModal.tsx`; Seiten *Meine globalen*, *Funktionen*, *Standard (Tide)* |
| Reihenfolge | Etappe 1, dann 2, dann 3, jede einzeln committet |

## 5. Architektur im Überblick

```
web/src/lib/formula/                      reine Logik, keine React-/TipTap-Abhängigkeit (außer tableCalc: ProseMirror-Typen)
  types.ts        Value, ErrorValue, Expr, FormulaError, colToLetters/lettersToCol/refKey
  parser.ts       parseFormula, parseNumber (deutsche Zahlen, %, €)
  evaluate.ts     evaluate(expr, EvalContext) ; Fehler sind Werte, keine Exceptions
  functions.ts    BUILTINS (SUMME MITTELWERT MIN MAX ANZAHL RUNDEN ABS WURZEL POTENZ RMZ ZW BW), ALIASES, toNum
  format.ts       formatResult (de-DE, max. 4 Nachkommastellen)
  tableCalc.ts    CellGrid/PmGrid, gridFromPmTable (TableMap, verbundene Zellen), computeTable (Zykluserkennung)
  formulaRefs.ts  findRefs (Farben), canInsertRefAt, sumRangeFor
  scope.ts        Definition, parseDefinitions(+Lines), setGlobalAtLine, isDefinition, buildScope (Auflösung, Aufrufbudget)
  stdlib.ts       STDLIB_CONSTANTS (pi, e), STDLIB_ENTRIES (Liste für das Popup)

web/src/lib/
  variableRegistry.ts         VariableRegistry: lazy laden, Optimistic-Update, Read-Modify-Write, entprelltes Speichern
  variableRegistryStorage.ts  createApiRegistryStorage: verschlüsselte Datei (type "variables"), Muster wie searchIndex.ts
  variableRegistryInstance.ts getVariableRegistry(): Singleton je Nutzer (liest Schlüssel aus useDataStore)   [WIP-Commit]

web/src/components/extensions/
  TableCellAttrs.ts           Zellattribute textAlign/verticalAlign (Allowlist beim Parsen UND Rendern)
  TableFormulas.ts            ProseMirror-Plugin: Ergebnisse, Formelmodus, Klick/Ziehen, insertSumFormula, Option subscribe
  tableFormulaDecorations.ts  baut die Decorations (Ergebnis, Labels, Kandidaten, Bezugsfarben; Bereiche aufs Gitter begrenzt)
  tableFormulaUtils.ts        locateCell(doc,pos)
  VariablesBlockNode.ts       Knoten "variablesBlock" (Attribute code, snapshot), Option onDefinitionsChange, Command insertVariablesBlock
  variablesScope.ts           collectDocDefinitions, scopeForDoc

web/src/components/Editor/
  tableCommands.ts            setCellAlign, canMerge/canSplit, mergeSelectedCells, splitSelectedCell
  TableCellBar.tsx            schmale Leiste (Linksklick): Ausrichtung H/V, Verbinden, Teilen, Σ
  TableContextMenu.tsx        Rechtsklick-Menü Spalte · Zeile · Tabelle (ersetzt das gelöschte EditorToolbar.tsx)

web/src/app/globals.css       Abschnitte "Table style B" und "Table formulas: results, formula mode, reference colours"
```

Datenfluss der Formeln: Dokument → `TableFormulas` (Decorations, gecacht je Dokument und Auswahl) → pro Tabelle `gridFromPmTable` → `computeTable(grid, scope)` → `evaluate` → `formatResult` → `data-result`-Attribut, das per CSS (`::before`) angezeigt wird, während der Formeltext ausgeblendet ist. Befindet sich der Cursor in der Formelzelle, wird sie nicht ersetzt (Text sichtbar), und der Formelmodus aktiviert Labels, Leuchten und Farben.

Datenfluss der Variablen (Ziel, noch nicht durchgängig verdrahtet): Notiz enthält `variablesBlock`-Knoten (Zeilen `name = Ausdruck`, `@` = global). `scopeForDoc(doc, global)` baut den Scope: lokal aus allen Blöcken der Notiz, `global()` liest lazy aus dem Register, `snapshot` aus den Block-Attributen. Das Register lädt beim ersten Zugriff asynchron und löst über `subscribe` eine Neuberechnung aus.

## 6. Stand je Task des Plans

Commits (alle auf `main`, nicht gepusht):

| Commit | Inhalt |
|---|---|
| `8184ef2` | Task 1: Zellattribute; zusätzlich Design-Dokument und Plan |
| `f173821` | Tasks 2 bis 4: Stil B (CSS), `TableCellBar`, `TableContextMenu`, `tableCommands`, Doku; Härtung der Zellattribute (Sicherheitshinweis 1) |
| `9f4a2cd` | Tasks 5 bis 7: Parser, Evaluator, Funktionen, Format, Tabellenmodell mit Zyklenerkennung |
| `3388b91` | Task 8: `TableFormulas`-Plugin, Formelmodus, Klick/Ziehen, Σ-Button, CSS, Doku |
| `e4a7f88` | Task 9: Scope und Standardbibliothek; Begrenzung der Bezugs-Hervorhebung (Sicherheitshinweis 2) |
| `8003893` | Aufrufbudget in `buildScope` (Sicherheitshinweis 3) |
| `03343ff` | Variablenblock-Knoten, Scope aus dem Dokument, `VariableRegistry`, verschlüsselte Registerdatei |
| (WIP) | `VariablesBlockNode` mit Änderungsmeldung, `TableFormulas.subscribe`, `variableRegistryInstance.ts`, Bericht, Mockups |

| Task | Beschreibung | Stand | Tests |
|---|---|---|---|
| 1 | Zellattribute | ✅ | `extensions/__tests__/TableCellAttrs.test.ts` (4) |
| 2 | Stil B | ✅ (nicht im Browser angesehen) | Build |
| 3 | Zellen-Leiste | ✅ (nicht im Browser angesehen) | `Editor/__tests__/tableCommands.test.ts` (4) |
| 4 | Rechtsklick-Menü | ✅ (nicht im Browser angesehen) | nur Typecheck/Build |
| 5 | Parser | ✅ | `parser.test.ts` (14) |
| 6 | Evaluator, Funktionen, Format | ✅ | `evaluate.test.ts` (17) |
| 7 | Tabellenmodell, Zyklen | ✅ | `tableCalc.test.ts` (8) |
| 8 | Editor-Plugin | ✅ (nicht im Browser angesehen) | `extensions/__tests__/TableFormulas.test.ts` (12) |
| 9 | Scope und Standardbibliothek | ✅ | `scope.test.ts` (16) |
| 10 | Variablenblock | 🟡 **Knoten, Scope, Meldung der Änderungen fertig; Ansicht (React) und Einbindung fehlen** | `VariablesBlock.test.ts` (10) |
| 11 | Register-Dienst | 🟡 **Klasse, Speicherung, Singleton fertig und getestet; Verdrahtung und Sicherheitskorrektur fehlen** | `variableRegistry.test.ts` (10), `variableRegistryStorage.test.ts` (6) |
| 12 | Variablen-Popup | ⬜ nicht begonnen | – |
| 13 | Teilen-Rückfrage | ⬜ nicht begonnen | – |

Weitere Hilfstests: `formulaRefs.test.ts` (8). Gesamt im Projekt: 318 Tests grün (Stand Pause).

## 7. Bekannte Probleme, Risiken und offene Entscheidungen

**P1 – Sicherheit, vor der Verdrahtung beheben (offene Meldung des automatischen Reviews).**
`variableRegistryStorage.ts` wählt die Registerdatei mit `files.find((f) => f.type === 'variables')` aus der Dateiliste. Die Liste kann auch **mit mir geteilte** Dateien enthalten. Eine fremde Datei vom Typ `variables` könnte so als eigenes Register gelesen oder überschrieben werden.
Korrektur: nur Dateien des eigenen Kontos nehmen (`f.owner_id === keys.userId`, Feldname im Server-Antwortobjekt vorher prüfen: Go-Struktur in `cloud/internal/store`, Handler `cloud/internal/api/files.go`, `ListFiles`), in `findFile()` **und** vor dem Wählen von `fileId` in `doSave`. Test ergänzen: Liste mit fremder Datei und eigener Datei → es wird die eigene gewählt; nur fremde Datei vorhanden → es wird eine neue eigene angelegt. Besser zusätzlich einen Server-Parameter „nur eigene“ oder die Datei-ID in den Nutzereinstellungen merken (nicht umgesetzt).

**P2 – Nichts davon wurde im laufenden Browser geprüft.** Alle UI-Tests laufen in `happy-dom` ohne Layout. Ungeprüft: Position der `TableCellBar` (nutzt `coordsAtPos`/`getBoundingClientRect`), Aussehen von Stil B, Hell/Dunkel, die CSS-Technik für die Ergebnisanzeige (Formeltext mit `font-size:0` ausgeblendet, Ergebnis per `::before`), das Aufleuchten, Klick und Ziehen mit echten Mausereignissen. Bitte im Dev-Server (`cd web && npm run dev`, der Server braucht ein laufendes Backend und Anmeldung, siehe `AGENTS.md`: `cloud/.env`) durchklicken. Besonders: Klick in eine Formelzelle setzt den Cursor (Decoration verschwindet), `mouseup` beim Ziehen über das Dokument, Rechtsklick-Menü schließt bei Klick außerhalb.

**P3 – Registerdatei ist nur gegen eine Fake-Schnittstelle getestet.** Verschlüsselung (echte RSA/AES-Schlüssel) ist echt getestet, der Server nicht. Ungeprüft: (a) ob `GET /api/v1/files?type=variables&recursive=true` den Eintrag samt `content_ciphertext`, `access_keys`, `metadata` liefert (so ist es im `searchIndex.ts` mit `type=index`; als Vorbild verwendet), (b) ob `POST …/upload` und `PUT` bei Typ `variables` akzeptiert werden, (c) ob **andere Stellen** den Typ `variables` ungewollt anzeigen oder verarbeiten (Seitenleiste/Dateibaum, Suchindex, Bundle-Export `bundleImportExport.ts`, Papierkorb, Backups, Safes). Der Server hat keine Typ-Whitelist (`files.type` ist freier Text, Filter nur per `?type=`), aber das Client-Verhalten bei unbekanntem Typ im allgemeinen Verzeichnislisting wurde nicht geprüft. Die DDL (`sqlite.go`) wurde **nicht** verändert.

**P4 – Entscheidung offen: wann wird ins Register geschrieben?** Vorgeschlagen und im Code vorbereitet: nur wenn die Notiz bearbeitbar ist und **nicht** geteilt (`canEdit && !isShared` in `useTipTapConfig`), damit die Variablen einer fremden Notiz nicht in das eigene Register wandern. Nachteil: Der Besitzer einer geteilten Notiz synchronisiert dann auch nicht. Besser wäre ein echter Besitzer-Check (die Notiz gehört mir); Quelle dafür im Notiz-Datensatz suchen (`owner_id` vs. `myId`).

**P5 – Teilen-Dialog: Ort unbekannt.** Der Ablauf zum Teilen ist nicht gesichtet. Hinweise: `web/docs/crypto/SHARING_AND_RE_ENCRYPTION.md`; `grep -rn "share" web/src/components` (z. B. `Workspaces/NoteSettingsMenu.tsx`). Offene Teilfragen: Welche Namen gelten als „genutzte globale Variablen“? Es fehlt eine Funktion `usedGlobalNames(doc, scope)`, die alle Formeln der Notiz und Ausdrücke der lokalen Definitionen durchsucht und die Namen ermittelt, die erst im Register aufgelöst werden. „Nein“ muss einen vorhandenen `snapshot` im Block **entfernen** (er liegt im gemeinsamen Dokument und kann nicht pro Empfänger gefiltert werden).

**P6 – Bewusste Abweichungen vom Plan-Text (Rulings):**
- Text in **Bereichen** wird bei `SUMME` usw. übersprungen (wie Excel); nur **direkte** Textargumente ergeben `#WERT`. (Plan: „Text im Bereich → #WERT“.) Grund: Spaltenköpfe in Bereichen wären sonst ständig Fehler.
- Unbekannte **Funktion** ergibt `#NAME`, unbekannte **Variable** `#VAR`. (Plan nannte nur `#NAME`.)
- Zahlen mit Zusatz **`€`, `$`, `£`** am Ende und `%` werden als Zahl gelesen (damit „12.000,00 €“ rechenbar ist).
- Beim Löschen von `EditorToolbar.tsx` (nur `Editor.tsx` nutzte es) statt Re-Export.
- `font-menu`-Variable mit Fallback auf die App-Schrift statt `next/font` (siehe P7).
- Zellen außerhalb der Tabelle lesen sich als leer (kein `#BEZUG`).
- `Aufrufbudget` pro Scope: 20 000 Aufrufe, Tiefe 50; Bereiche in der Auswertung höchstens 10 000 Zellen.

**P7 – Schrift.** Gewünscht war eine andere Schrift (DM Sans, DM Mono im Mockup). Im Produkt ist noch **nichts** eingebunden. `globals.css` definiert `--font-menu: var(--font-sans)` als Platzhalter, die Menüs nutzen `fontFamily: 'var(--font-menu)'`. Einbinden über `next/font` in `web/src/app/layout.tsx`, **aber diese Datei ist laut `AGENTS.md` ohne ausdrückliche Anweisung tabu** (PWA-Metadaten). Rückfrage nötig. Alternativ lokale Schriftdateien über `@font-face` in `globals.css`.

**P8 – Kleinere bekannte Einschränkungen.**
- Argumenttrenner: `;` oder `,`. „Ziffer,Ziffer“ gilt als Dezimalkomma, `SUMME(1,2,3)` liest also `1,2` als 1,2. Empfehlung: `;` (so steht es in den Mockups und Beispielen).
- Bezugstext wird nur bei Zellen mit **einem einfachen Absatz** farbig; bei Zellen mit mehreren Absätzen oder Mentions bleibt nur das Zellen-Leuchten.
- Labels (A, B, 1, 2) erscheinen nur im Formelmodus und nur an der ersten Zeile/Spalte; in der Zelle A1 liegen Spalten- und Zeilenlabel gleichzeitig (Spalte oben links, Zeile unten rechts).
- Neuberechnung: Für jede Tabelle mit Formeln wird bei jeder Auswahl- oder Dokumentänderung neu gerechnet (gecacht je Dokument und Auswahl). Bei sehr großen Tabellen unbekannt, ob das reicht; Messung fehlt.
- Zeilenumbrüche: Auf Windows meldet Git „LF wird durch CRLF ersetzt“; reine Warnungen.
- `ANZAHL` zählt Direktargumente immer mit.
- Lint: `npm run lint` meldet jetzt 605 Fehler statt der in `AGENTS.md` genannten 557; die Dateien dieses Projekts sind lint-sauber (einzeln geprüft), die Differenz stammt aus anderen Änderungen im Arbeitsbaum.

**P9 – Arbeitsbaum und Zusammenarbeit.** In `main` arbeitet parallel eine andere Sitzung am mobilen Kalender. Nicht von mir und **nicht committet**: `.gitignore`, `web/src/components/Layout/MobileLayout.tsx`, `web/src/components/Layout/mobile/MobileAndroidBanner.tsx`, `cloud/tide-server-linux`. Alle Commits dieses Projekts haben nur eigene Dateien gestaged. `AGENTS.md` nennt `push: true`; es wurde **nichts gepusht**. `.superpowers/` (Mockup-Sitzungsordner) ist untracked und nicht in `.gitignore`; Vorschlag: eintragen.

---

## 8. Was zu tun bleibt (Anweisungen für die Weiterarbeit, in dieser Reihenfolge)

### 8.1 Sicherheitskorrektur P1 (zuerst)
Siehe P1. TDD: erst den Test mit fremder und eigener Datei, dann die Korrektur.

### 8.2 Task 10 fertigstellen: Ansicht des Variablenblocks
Datei neu: `web/src/components/extensions/VariablesBlock.tsx`.
- `export const VariablesBlock = VariablesBlockNode.extend({ addNodeView() { return ReactNodeViewRenderer(VariablesView); } })`.
- Ansicht nach `variablen-v1.html` Kasten 1: Kopf „Variablen dieser Notiz“ (Icon `Variable` oder `FunctionSquare` aus lucide-react), Umschalter Bearbeiten/Fertig. Bearbeiten: `<textarea>` mit `code` (Monospace, `spellCheck=false`, Platzhalter mit Beispielzeilen), `updateAttributes({ code })`. Ansicht: Zeilen aus `parseDefinitionLines(code)` mit Name, `=`, Ausdruck, Ergebnis und Schalter lokal/global (Weltkugel). Ergebnis: `scopeForDoc(editor.state.doc, extension.options.getGlobals).variable(name)` → `formatResult`; Funktionen zeigen „Funktion“. Schalter: `updateAttributes({ code: setGlobalAtLine(code, line, !def.global) })`.
- Start im Bearbeiten-Modus, wenn `code` leer ist. Farben nur über die `t2-*`-Tokens (siehe `MathBlock.tsx` als Vorbild für Aufbau und Klassen), keine fest codierten Farben.
- Slash-Befehl in `web/src/components/extensions/SlashCommand.tsx` ergänzen (Eintrag „Variablen“, `editor.chain().focus().deleteRange(range).insertVariablesBlock('zins = 3,9 %\n').run()`); optional Eintrag in `web/src/components/Editor/FormatSearch.tsx`.
- Test für die reinen Teile ist vorhanden; für die Ansicht mindestens einen Rendertest (Zeilen, Umschalter ändert `code`).

### 8.3 Task 11 verdrahten
In `web/src/components/Editor/useTipTapConfig.ts` (Erweiterungsliste um Zeile 248; Import oben ist bereits für `TableFormulas`):
- `VariablesBlock.configure({ getGlobals: () => registry.definitions(), onDefinitionsChange: (defs, prev) => … })`: Wenn die Notiz bearbeitbar ist und die Bedingung aus P4 gilt und `activeTabIdRef.current` gesetzt ist: `getVariableRegistry().syncNote(noteId, defs, { force: !!prev?.some(d => d.global) })`. Ref-Muster wie bei `onBlocksDeletedRef` verwenden (die Erweiterungsliste darf nicht bei jeder Änderung neu entstehen).
- `TableFormulas.configure({ getScope: (doc) => scopeForDoc(doc, () => getVariableRegistry().definitions()), subscribe: (cb) => getVariableRegistry().subscribe(cb) })`.
- Beim Schließen/Wechseln der Notiz `flush()` des Registers aufrufen, z. B. bei `beforeunload` und beim Tab-Wechsel.
- Beim Löschen einer Notiz `removeNote(noteId)` aufrufen (Löschstelle im DataStore suchen: `createNotesSlice`).
- Danach prüfen, dass die Erweiterungsliste nicht öfter als vorher neu gebaut wird.

### 8.4 Task 12: Variablen-Popup
Neu: `web/src/components/Settings/VariablesModal.tsx`. Hülle, Maße und Schließen-Symbol aus `web/src/components/Settings/SettingsModal.tsx` übernehmen (Zeilen ~104 bis 160: `max-w-[1060px]`, `h-[min(760px,92vh)]`, Seitenleiste `w-[240px]`, Inhalt `max-w-[660px]`). Seiten nach `variablen-v2-popup.html`: *Meine globalen* (Liste Name · Wert · Herkunftsnotiz als Link, Suche, „+ Neue Variable“ nur für Einträge ohne Notiz über `registry.setManual/removeManual`), *Funktionen*, *Standard (Tide)* (aus `STDLIB_ENTRIES`, schreibgeschützt). Werte über `buildScope` auswerten. Einstieg: Eintrag in `web/src/components/Layout/Sidebar.tsx` neben den Einstellungen (Muster: wie `SettingsModal` geöffnet wird, vermutlich über `useUiActions`/`GlobalModalsHost.tsx`). Herkunftsnotiz: Titel über den DataStore auflösen, Link über das vorhandene `tide:navigate`-Ereignis (siehe `useTipTapConfig.ts` um Zeile 421).

### 8.5 Task 13: Teilen-Rückfrage
Siehe P5. Dialog nach `variablen-v1.html` Kasten 3 (Checkbox „Variablen mitteilen“, Hinweis `#VAR`). Neue reine Funktion `usedGlobalNames(doc, scope)` mit Test. „Ja“ schreibt die genutzten Definitionen (aus dem Register) als `snapshot` in den (ggf. neu angelegten) `variablesBlock`; beim Öffnen durch den Besitzer wird `snapshot` mit dem Register abgeglichen (Wert aus Register hat Vorrang vor der Kopie, ist durch die Auflösungsreihenfolge bereits so). „Nein“: `snapshot` leeren. Mouseover-Text für `#VAR` existiert bereits (`title` im Ergebnis).

### 8.6 Abschluss
- `web/docs/COMPONENTS.md` um VariablesBlock, Register, Popup, Teilen-Dialog ergänzen (Regel 10 in `AGENTS.md`).
- `cd web && npx tsc --noEmit && npm test && npm run build`; Lint für die geänderten Dateien einzeln (`npx eslint <dateien>`).
- Handtest im Browser (P2 und P3), danach Commit pro Task.
- Abschließendes Review des gesamten Branchs (frischer Blick); Plan-Review-Fokus siehe Plan-Abschnitt „Review Focus“.

## 9. Prüfen und Weitermachen

```powershell
cd C:\Users\nicoh\projects\tide\web
npx tsc --noEmit
npm test
npx vitest run src/lib/formula          # Engine (64 Tests)
npx vitest run src/components/extensions # Erweiterungen (Zellen, Formeln, Variablenblock)
npm run build
```

Nützliche Einstiege zum Verstehen: `web/src/lib/formula/__tests__/*.test.ts` (Beispiele jeder Regel), `web/src/components/extensions/__tests__/TableFormulas.test.ts` (Formelmodus, Klick, Ziehen), `variableRegistryStorage.test.ts` (Fake-Server mit echter Verschlüsselung).

Git-Stand zum Pausieren: Feature-Commits siehe Abschnitt 6; ein weiterer WIP-Commit enthält die letzten Änderungen (alle Tests grün) sowie diesen Bericht und die Mockups.

## 10. Sicherheitsmeldungen des automatischen Reviews (erledigt und offen)

| # | Fundstelle | Meldung | Stand |
|---|---|---|---|
| 1 | `TableCellAttrs.ts` | CSS-Injection über ungeprüfte Attribute in `renderHTML` | ✅ behoben (Allowlist beim Rendern, Test `never renders attribute values outside the allowlist`) |
| 2 | `tableFormulaDecorations.ts` | unbegrenzte Schleife bei riesigen Bereichen (`A1:ZZ99999999`) | ✅ behoben (auf Gitter begrenzt, Zeit-Test) |
| 3 | `scope.ts` | exponentielle Funktionsaufrufe umgehen die Tiefengrenze | ✅ behoben (Aufrufbudget 20 000, Zeit-Test) |
| 4 | `variableRegistryStorage.ts` | fremde Datei vom Typ `variables` könnte als eigenes Register gelten | ⬜ **offen (P1)** |
