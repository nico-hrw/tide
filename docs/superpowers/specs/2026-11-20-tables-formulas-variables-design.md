# Tabellen, Formeln und Variablen — Design

Stand: 2026-11-20 · Status: zur Freigabe · Geltungsbereich: Desktop (PC) im TipTap-Editor. Mobile ist nicht Teil davon.

Mockups (Browser-Companion): `.superpowers/brainstorm/1847-1795171108/content/` — `tabellen-look.html` (Stil B), `tabellen-menues-v4.html` (Menüs), `variablen-v1.html` (Block, Teilen), `variablen-v2-popup.html` (Variablen-Popup).

## 1. Absicht

Tabellen in Notizen existieren, sind aber mühsam zu verwalten und wirken unfertig: Titel sind zentriert, Inhalte linksbündig, Zellen lassen sich weder verbinden noch teilen, und die Textausrichtung ist nicht einstellbar. Außerdem lässt sich nichts rechnen.

Ziel ist, dass man in Notizen alltägliche Rechnungen direkt in Tabellen erledigt. Heutiger Anlass: **Währungsumrechnung, Rückzahlungskosten, Zinsen**. Später evtl. mehr (z. B. Steuern). Gebraucht wird ein Excel-Gefühl (Formeln mit `=`, Zellen anklicken) mit einfachen, wiederverwendbaren Variablen und Funktionen, aber keine Programmiersprache.

## 2. Ziele / Nicht-Ziele / Anti-Ziele

**Ziele**
- Zellausrichtung (horizontal + vertikal), Zellen verbinden/teilen, Kopfzeile umschalten, neuer Tabellenstil „B".
- Formeln in Zellen mit Excel-ähnlicher Bedienung (Aufleuchten, Klick auf Zelle fügt Bezug ein, Bereiche per Ziehen).
- Variablen und einfache Funktionen: lokal pro Notiz, global über ein zentrales Register, plus eingebaute Standardfunktionen/-konstanten.
- Beim Teilen entscheiden, ob genutzte globale Variablen mitgegeben werden.

**Nicht-Ziele (v1)**
- Klassen, Schleifen, Bibliotheken, Module; Diagramme; Zellformate (Währung/Prozent als Zellattribut); CSV-/Excel-Import; Zellbezüge zwischen verschiedenen Notizen; Änderungen an der mobilen Tabellenbearbeitung.

**Anti-Ziele (wäre ein Fehlschlag, auch wenn es technisch läuft)**
- Bestehende Tabellen/Notizen gehen verloren, verschieben sich oder lassen sich nicht mehr öffnen.
- Der Server erfährt Variablenwerte oder Formelergebnisse im Klartext (Zero-Knowledge bleibt).
- Zusammenarbeit (Yjs) erzeugt abweichende Ergebnisse bei verschiedenen Personen.

## 3. Rahmenbedingungen

- Tide ist Ende-zu-Ende-verschlüsselt. Alles Rechnen und Auflösen von Variablen passiert im Browser.
- Tabellen basieren auf TipTap 3 mit `prosemirror-tables` 1.8.5 (`useTipTapConfig.ts`, `Table.configure({ resizable: true, renderWrapper: true })`). Verbinden/Teilen (`mergeCells`, `splitCell`) und `colspan`/`rowspan` sind dort schon vorhanden.
- `AGENTS.md`: Dateien < 500 Zeilen, kein neues `any`, keine hartkodierten Farben (Design-Tokens), HTTP nur über `apiFetch`, `web/docs/COMPONENTS.md` aktualisieren.
- **Nicht ändern ohne ausdrückliche Zustimmung:** `crypto.ts`, `cryptoV2.ts`, DDL in `sqlite.go`.

## 4. Ansätze (verglichen und entschieden)

| Thema | Gewählt | Verworfen und warum |
|---|---|---|
| Formel-Engine | **Eigene kleine Engine** in `web/src/lib/formula/`: A1-Bezüge, Bereiche, Operatoren, Prozent, Variablen, benutzerdefinierte Funktionen, deutsches Dezimalkomma. Keine neue Abhängigkeit. | math.js oder Excel-Parser: größer, Zellbezüge und Variablen müssten trotzdem selbst angebunden werden. |
| Ort des Zentralregisters | **Spezielle verschlüsselte Datei im bestehenden Datei-/Sync-System.** Keine Schemaänderung, vorhandene Verschlüsselung. | Neue Server-Tabelle: ändert die DDL, bringt nichts Zusätzliches. |
| Speicherung einer Formel | **Zelltext ist die Formel (`=B2*C2`)**, das Ergebnis wird beim Anzeigen als Decoration berechnet und gezeigt. Funktioniert mit Yjs, Versionsverlauf, Suche. | Formel als Attribut + Ergebnis als Inhalt: Ergebnis kann bei gemeinsamer Bearbeitung veralten. |
| Teilen mit globalen Variablen | **Beim Teilen fragen.** „Ja": genutzte globale Werte werden als eingefrorene Kopie verschlüsselt in der Notiz abgelegt; die andere Person kann damit rechnen. „Nein": Formeln bleiben, zeigen `#VAR`. | Nur Ergebnisse speichern oder immer `#VAR`: weniger nützlich. |
| Tabellenmenüs | **Zwei Menüs:** Linksklick auf eine Zelle zeigt eine schmale Leiste (Ausrichtung, Verbinden/Teilen, Σ); Rechtsklick zeigt zusätzlich ein zweites, breites Menü (Spalte · Zeile · Tabelle nebeneinander). | Große Icon-Palette (zu dicker Block); Griffe am Tabellenrand wie Notion (verworfen, später möglich). |

## 5. Design

### 5.1 Etappe 1 — Zellen und Aussehen

- `TableCell` und `TableHeader` werden um die Attribute `textAlign` (`left|center|right`) und `verticalAlign` (`top|middle|bottom`) erweitert. Die Werte werden als Inline-Style/`data-`-Attribut gerendert und geparst.
- **Stil B:** nur Trennlinien, Zebra-Streifen, Kopfzeile als kleine Kapitälchen, Titel **linksbündig** (statt zentriert), Zahlen standardmäßig rechtsbündig. Rahmen erscheinen beim Hover/Auswählen. CSS in `globals.css` (`.ProseMirror table/td/th`, Zeile ~974) über Tokens, auch im Dark Mode. Alle bestehenden Tabellen übernehmen den neuen Stil.
- **Linksklick auf Zelle** zeigt eine schwebende Leiste über der Zelle: horizontale Ausrichtung · vertikale Ausrichtung · Verbinden · Teilen · Σ (Summe einfügen). Hell, abgerundet, verdeckt keine Zellen. Bei Mehrfachauswahl wirken die Aktionen auf alle ausgewählten Zellen.
- **Rechtsklick** zeigt die Leiste plus ein zweites Menü mit drei nebeneinander stehenden Gruppen: **Spalte** (links/rechts einfügen, löschen), **Zeile** (oben/unten einfügen, löschen), **Tabelle** (Kopfzeile ein/aus, löschen). Es **ersetzt** das bestehende englische `TableContextMenu` in `EditorToolbar.tsx` und wird wie dieses über den vorhandenen `onContextMenu`-Hook in `Editor.tsx` geöffnet. Beschriftungen kurz, auf Deutsch, mit Icons. Details wie in `tabellen-menues-v4.html`.
- **Schrift:** DM Sans für Menüs, DM Mono für Variablen/Formeln, über das Projekt eingebunden (selbst gehostet über `next/font`), nicht über externe Google-Fonts-Links wie im Mockup.

### 5.2 Etappe 2 — Formeln

- **Erkennung:** Eine Zelle, deren Text mit `=` beginnt, ist eine Formel. Ist die Zelle nicht fokussiert, zeigt der Editor stattdessen das Ergebnis (Widget-Decoration); beim Fokus erscheint der Formeltext.
- **Syntax:** Zahlen mit Dezimalkomma (`3,9`), Prozent (`3,9 %` = 0,039), `+ − * / ^`, Klammern, Zellbezüge `B2`, Bereiche `B2:B9`, Variablen `zins`, Funktionsaufrufe `RMZ(...)`, Vergleichsoperatoren für `WENN`. Spalten A, B, … Zeilen 1, 2, … (die Kopfzeile ist Zeile 1). Bei verbundenen Zellen zählt die obere linke Zelle.
- **Funktionen (v1):** `SUMME`, `MITTELWERT`, `MIN`, `MAX`, `ANZAHL`, `RUNDEN`, `WENN`, `ABS`, `WURZEL`, `POTENZ`, `RMZ`, `ZW`, `BW`. Englische Aliase (`SUM`, `PMT` …) werden akzeptiert.
- **Fehler:** `#DIV/0`, `#WERT`, `#BEZUG`, `#NAME`, `#ZIRKEL` (Zirkelbezug, Abhängigkeitsgraph mit Zykluserkennung), `#VAR` (Variable nicht verfügbar). Mouseover erklärt den Fehler.
- **Formelmodus:** Sobald der Text einer fokussierten Zelle mit `=` beginnt, werden Spalten-/Zeilenköpfe (A, B, 1, 2) eingeblendet und alle Zellen mit Zahlen **leuchten schwach auf** und sind anklickbar; ein Klick fügt den Bezug in die Formel ein, Ziehen über mehrere Zellen ergibt einen Bereich. Jede genutzte Zelle bekommt eine eigene Farbe, die in der Formel dieselbe Farbe hat. Umsetzung als ProseMirror-Plugin mit Decorations; kein Eingriff in das Dokument außer dem eingefügten Text.
- **Neuberechnung:** Beim Dokument-Update nur die Formelzellen neu berechnen, die abhängig sind (Abhängigkeitsgraph pro Tabelle). Das Ergebnis liegt nie im Dokument.
- **Ergebnisanzeige:** Zahlen werden deutsch formatiert (`12.000,5`), höchstens 4 Nachkommastellen; keine Zellformate in v1 (siehe Nicht-Ziele). Wer Währung will, schreibt `RUNDEN(…, 2)` und tippt das Zeichen selbst dazu.
- **Kopieren:** Aus einer Tabelle kopierter Text enthält zunächst die Formeln; Einfügen als Werte ist ein späteres Thema.

### 5.3 Etappe 3 — Variablen, Register, Teilen

- **Variablenblock** (neue TipTap-Node, ähnlich `MathBlock`): eine Definition pro Zeile, `name = Ausdruck` oder `name(a, b) = Ausdruck`. Ausdrücke dürfen Variablen und Standardfunktionen nutzen. Rechts neben jeder Zeile zeigt ein Schalter „lokal/global", ob die Zeile ins Zentralregister übernommen wird. **Standard ist lokal.**
- **Auflösungsreihenfolge:** lokal (diese Notiz) → global (Register) → Kopie aus dem Teilen → Standard (Tide). Der erste Treffer gewinnt, so lässt sich auch `pi` überschreiben.
- **Zentralregister:** eine spezielle verschlüsselte Datei im bestehenden Datei-/Sync-System, gespeichert neben den Notizen. Eintrag: `{ name, art: wert|funktion, ausdruck, quelleNotizId }`. Wird in einer Notiz eine globale Zeile geändert, gelöscht oder auf lokal gestellt, aktualisiert der Client (entprellt) den Registereintrag. Beim Rechnen wird das Register nur entschlüsselt, wenn eine Formel einen Namen verwendet, der nicht lokal auflösbar ist; der Inhalt wird pro Sitzung im Speicher (DataStore) gehalten. Das Register selbst ist nur über die Notiz änderbar, zu der ein Eintrag gehört (ausgenommen Einträge ohne Notiz, siehe Popup).
- **Standarddatei (Tide):** fest im Code (`web/src/lib/formula/stdlib.ts`), schreibgeschützt: Konstanten (`pi`, `e`) und die Funktionen aus 5.2. Im Popup sichtbar.
- **Popup „Variablen“:** gleiche Hülle und Maße wie `SettingsModal.tsx` (max. 1060 × 760 px, Seitenleiste 240 px, Inhalt höchstens 660 px). Seiten: *Meine globalen* (Liste Name · Wert · Herkunftsnotiz als Link, Suche, „+ Neue Variable" für Einträge ohne Notiz, nur diese sind dort direkt bearbeitbar), *Funktionen*, *Standard (Tide)*.
- **Teilen:** Beim Teilen einer Notiz, die globale Variablen nutzt, fragt ein Dialog, ob diese mitgegeben werden sollen. „Ja": die genutzten Werte/Funktionen werden als Kopie im Variablenblock der Notiz abgelegt (verschlüsselt mit dem Notizinhalt); beim Öffnen durch die Besitzerin oder den Besitzer wird die Kopie mit dem Register abgeglichen. „Nein": keine Kopie, die Formeln bleiben erhalten und zeigen für andere überall `#VAR` (Mouseover: „Variable `zins` nicht verfügbar."). Die Besitzerin oder der Besitzer sieht weiterhin die echten Werte.

## 6. Offene Punkte für den Bauenden

- Welche Dateitypen/IDs das Datei-System für das Register erlaubt, ohne die DDL zu ändern. Falls das nicht geht: stoppen und nachfragen (siehe Rahmenbedingungen).
- Wo der Einstieg ins Variablen-Popup sitzt (Seitenleiste oder Befehlsmenü); Vorschlag: Eintrag in der Seitenleiste neben den Einstellungen.
- Der genaue Ort des Teilen-Dialogs im bestehenden Teilen-Ablauf (siehe `web/docs/crypto/SHARING_AND_RE_ENCRYPTION.md`).
- Tests: Die Formel-Engine ist reine Logik und wird mit Unit-Tests abgedeckt (Parser, Auswertung, Zyklen, Fehler, deutsche Zahlen). Der Editor-Teil wird per Handtest geprüft.

## 7. Reihenfolge und Abnahme

1. **Etappe 1** — Zellen und Aussehen (eigenständig nutzbar).
2. **Etappe 2** — Formeln (benötigt Etappe 1 nur für das Aussehen).
3. **Etappe 3** — Variablen, Register, Teilen (benötigt Etappe 2).

Nach jeder Etappe: `cd web && npx tsc --noEmit`, Lint ohne neue Fehler, `npm run build`, `web/docs/COMPONENTS.md` aktualisieren. Jede Etappe wird einzeln committet.
