# TIDE Notiz- & Dokument-Spezifikation

> Vollständige Spezifikation des TIDE-Notizformats (TipTap 3 / ProseMirror Schema), der unterstützten Inline-Elemente, Mentions, Verlinkungen und des Bundle-Formats.

---

## 1. Übersicht & Architektur

Eine TIDE-Notiz wird intern als strukturierter **ProseMirror / TipTap JSON-AST** gespeichert.
Beim Speichern in der Cloud wird dieser AST mit einem clientseitigen **AES-256-GCM** Data Encryption Key (DEK) verschlüsselt.

Das Wurzelelement eines Notizinhalts ist immer ein Knoten vom Typ `doc`:
```json
{
  "type": "doc",
  "content": [
    {
      "type": "paragraph",
      "attrs": { "blockId": "550e8400-e29b-41d4-a716-446655440000" },
      "content": [
        { "type": "text", "text": "Hallo Welt! Dies ist eine TIDE-Notiz." }
      ]
    }
  ]
}
```

---

## 2. Block-Elemente (Nodes)

Jeder Block besitzt ein optionales oder automatisch generiertes Attribut `blockId` (UUIDv4). Dieses dient als stabiler Anker für Deep-Links (z. B. `#block-{uuid}`).

### A. Paragraphen (`paragraph`)
Standard-Textabsatz.
```json
{
  "type": "paragraph",
  "attrs": { "blockId": "..." },
  "content": [{ "type": "text", "text": "Mein Paragraph..." }]
}
```

### B. Überschriften (`heading`)
Ebenen 1 bis 3 (`level: 1 | 2 | 3`).
```json
{
  "type": "heading",
  "attrs": { "level": 1, "blockId": "..." },
  "content": [{ "type": "text", "text": "Kapitel 1: Grundlagen" }]
}
```

### C. Listen
- **Ungeordnete Listen (`bulletList`)**:
  ```json
  {
    "type": "bulletList",
    "content": [
      {
        "type": "listItem",
        "content": [{ "type": "paragraph", "content": [{ "type": "text", "text": "Erster Punkt" }] }]
      }
    ]
  }
  ```
- **Nummerierte Listen (`orderedList`)**:
  Identisch zu `bulletList`, jedoch mit `type: "orderedList"`.
- **Aufgaben-Listen (`taskList` & `taskItem`)**:
  ```json
  {
    "type": "taskList",
    "content": [
      {
        "type": "taskItem",
        "attrs": { "checked": false },
        "content": [{ "type": "paragraph", "content": [{ "type": "text", "text": "Zu erledigende Aufgabe" }] }]
      }
    ]
  }
  ```

### D. Zitate (`blockquote`) & Code-Blöcke (`codeBlock`)
- **Blockquote**:
  ```json
  {
    "type": "blockquote",
    "content": [{ "type": "paragraph", "content": [{ "type": "text", "text": "Ein wichtiges Zitat..." }] }]
  }
  ```
- **Code Block** mit Sprachangabe:
  ```json
  {
    "type": "codeBlock",
    "attrs": { "language": "typescript" },
    "content": [{ "type": "text", "text": "const greeting = 'Hallo Welt';" }]
  }
  ```

### E. LaTeX Mathe-Blöcke (`mathBlock`)
Rendert mathematische Formeln über KaTeX zentriert als Block.
```json
{
  "type": "mathBlock",
  "attrs": {
    "latex": "f(x) = \\int_{-\\infty}^{\\infty} \\hat{f}(\\xi)\\,e^{2 \\pi i \\xi x} \\, d\\xi"
  }
}
```

### F. Skalierbare Bilder (`resizableImage`)
Bilder mit flexibler Breitenanpassung (`width` in `%` oder `px`) und Ausrichtung (`align`).
```json
{
  "type": "resizableImage",
  "attrs": {
    "src": "https://example.com/diagramm.png",
    "alt": "Architektur-Diagramm",
    "width": "80%",
    "align": "center"
  }
}
```

---

## 3. Inline-Formatierung & Marks

Marks werden auf Textknoten im `marks`-Array angewendet:
```json
{
  "type": "text",
  "text": "Wichtiger hervorgehobener Text",
  "marks": [
    { "type": "bold" },
    { "type": "highlight", "attrs": { "color": "yellow" } }
  ]
}
```

### Unterstützte Marks:
| Mark | Attribute | Beschreibung |
|------|-----------|--------------|
| `bold` | — | Fetter Text |
| `italic` | — | Kursiver Text |
| `underline` | — | Unterstrichener Text |
| `strike` | — | Durchgestrichener Text |
| `code` | — | Inline-Monospace-Code |
| `fontSize` | `size: "12px" \| "14px" \| "18px" \| "24px"` | Schriftgrößen-Anpassung |
| `highlight` | `color: "yellow" \| "green" \| "blue" \| "purple" \| "orange" \| "red"` | Textmarker-Farbe |
| `link` | `href: string`, `target: "_blank"` | Hyperlink (Web oder interne Schemas) |
| `inlineMath` | `latex: string` | Inline LaTeX Formel, z. B. `$E = mc^2$` |

---

## 4. TIDE Mentions & Interne Verlinkungen

TIDE bietet spezielle semantische Inline-Knoten, die Verknüpfungen zwischen verschiedenen Teilen des Systems herstellen.

### A. Datum-Mention (`dateMention`)
Stellt ein interaktives Datum dar, das relative Zeitangaben (`@heute`, `@morgen`) auflöst.
```json
{
  "type": "dateMention",
  "attrs": {
    "date": "2026-10-15",
    "display": "15. Oktober 2026"
  }
}
```

### B. Kalender-Event-Mention (`calendarEventMention`)
Verknüpft die Notiz direkt mit einem bestehenden Kalender-Termin. Ein Klick öffnet das Termin-Modal.
```json
{
  "type": "calendarEventMention",
  "attrs": {
    "eventId": "event-uuid-1234",
    "title": "Klausur Software Engineering",
    "start": "2026-07-20T08:00:00Z",
    "end": "2026-07-20T10:00:00Z"
  }
}
```

### C. Aufgaben-Mention (`taskMention`)
Verknüpft eine Notiz mit einer globalen Aufgabe.
```json
{
  "type": "taskMention",
  "attrs": {
    "taskId": "task-uuid-5678",
    "title": "Übungsblatt 3 abgeben",
    "isCompleted": false
  }
}
```

### D. Backlinks & Referenzen (`referenceMark`)
Verknüpft eine Textstelle bidirektional mit einer anderen Notiz und optional einem spezifischen Block.
```json
{
  "type": "text",
  "text": "Siehe Kapitel 2 im Skript",
  "marks": [
    {
      "type": "referenceMark",
      "attrs": {
        "targetId": "note-uuid-abcd",
        "blockId": "block-uuid-ef01",
        "preview": "Kapitel 2: Vektorrechnung"
      }
    }
  ]
}
```

---

## 5. TIDE Bundle-Spezifikation (`.tide.json`)

Um komplexe Notizbäume, Lehrseiten und verknüpfte Termine zwischen Nutzern auszutauschen, nutzt TIDE das **Bundle-Format**:

```json
{
  "$schema": "https://tide.app/schemas/bundle-v1.json",
  "version": 1,
  "bundle_id": "bundle-mathe-1",
  "title": "Mathematik 1 - Vollständiges Lehrpaket",
  "description": "Vorlesungsnotizen, Übungsaufgaben und Klausurtermine",
  "created_at": "2026-09-22T20:00:00Z",
  "author": "Dozent Dr. Muster",
  "items": [
    {
      "id": "folder-mathe",
      "type": "folder",
      "title": "Mathematik 1",
      "parent_id": null
    },
    {
      "id": "note-kapitel-1",
      "type": "note",
      "title": "01 - Einführung",
      "parent_id": "folder-mathe",
      "content": { ... } // TipTap JSON
    },
    {
      "id": "event-vorlesung-1",
      "type": "event",
      "title": "Mathe 1 Vorlesung",
      "start": "2026-10-05T08:00:00Z",
      "end": "2026-10-05T09:30:00Z",
      "public_meta": {
        "color": "#3B82F6",
        "location": "Hörsaal A"
      }
    }
  ]
}
```

### Wie das ID-Mapping beim Import funktioniert:
1. Im Bundle verweisen Notizen (z. B. `note-kapitel-1`) über `calendarEventMention` auf `eventId: "event-vorlesung-1"`.
2. Der TIDE-Import-Mechanismus erzeugt für jedes Element eine neue UUID:
   - `folder-mathe` $\rightarrow$ `new-uuid-1`
   - `note-kapitel-1` $\rightarrow$ `new-uuid-2`
   - `event-vorlesung-1` $\rightarrow$ `new-uuid-3`
3. Während des Imports wird der AST von `note-kapitel-1` durchlaufen und alle Vorkommen von `event-vorlesung-1` werden automatisch auf `new-uuid-3` umgeschrieben.
4. Ebenso werden `parent_id`-Hierarchien und Notiz-zu-Notiz Backlinks (`referenceMark`) transparent auf die neuen IDs umgebogen.

---

## 6. Lesezugriff & Lehrseiten-Modus (`permission: 'view'`)

Wird eine Notiz mit `permission: 'view'` geteilt:
1. Der TipTap-Editor wird auf `editable={false}` gesetzt. Sämtliche schwebenden Bearbeitungs-Menüs (BubbleMenu, Floating Actions) werden deaktiviert.
2. Mentions (`calendarEventMention`, `dateMention`, `referenceMark`) bleiben anklickbar und erlauben die Navigation.
3. Ein Lese-Banner signalisiert den Schreibschutz.
4. Nutzer können mit einem Klick auf **"In eigene Notizen duplizieren"** eine eigene, voll editierbare Kopie des Dokuments samt aller internen Verknüpfungen anlegen.
