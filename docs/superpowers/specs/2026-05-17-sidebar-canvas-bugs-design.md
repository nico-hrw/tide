# Design: Sidebar-Umbau, Canvas-Leinwand, Bug-Fixes

**Datum:** 2026-05-17  
**Status:** Approved

---

## 1. Sidebar-Umbau

### Ziel
Die Sidebar wird von Navigations-Buttons befreit. Der Avatar zieht an den rechten Bildschirmrand. Die Notes-Liste hat damit mehr Platz.

### Änderungen in `Sidebar.tsx`
- Avatar-Button oben links entfernen
- FolderPlus-, Plus- und Upload-Button aus der Top-Row entfernen
- Calendar-Button aus der Nav-Row entfernen
- Social-Button aus der Nav-Row entfernen
- Finance-Button bleibt (oder entfällt je nach Nutzerpräferenz — vorerst behalten)
- Die Nav-Row entfällt damit komplett
- Die Kopfzeile (flex-row mit Avatar + Buttons) entfällt; die Sidebar beginnt direkt mit "Recent"
- Rechtsklick auf leeren Sidebar-Hintergrund öffnet ein globales Kontextmenü mit: Neue Notiz, Neuer Ordner, Importieren (.md)

### Neuer Avatar-Button in `page.tsx`
- Festes Element oben rechts im Haupt-Layout (absolute oder fixed, top-4 right-4)
- Zeigt denselben `<Avatar>` wie bisher
- Klick öffnet ein Dropdown-Menü mit: Social, Settings, Abmelden
- Das Dropdown schließt sich bei Klick außerhalb (clickOutside-Handler)

### SidebarProps-Änderungen
- `onOpenCalendar` und `onOpenSocial` Props bleiben erhalten (werden vom Avatar-Dropdown in page.tsx genutzt)
- Import-Logik (bisher im Upload-Button) wird in das neue globale Sidebar-Kontextmenü verschoben

---

## 2. Canvas-Leinwand

### Konzept
Canvas-Notizen sind ein eigenständiger Notiztyp (`type: 'canvas'`). Sie haben keinen TipTap-Editor. Der Nutzer sieht eine große Fläche (4000×3000px), auf der er klicken kann um Text-Boxen zu erstellen, zu verschieben und zu bearbeiten. Bilder können per Drag & Drop oder Paste hinzugefügt werden. Zoom (0.25×–2×) und Pan werden unterstützt.

### Datenmodell

```typescript
// Gespeichert als verschlüsselter JSON-Blob, analog zu StyleFile
interface CanvasNoteData {
  version: 1;
  noteId: string;
  canvasWidth: number;   // 4000
  canvasHeight: number;  // 3000
  items: CanvasNoteItem[];
}

interface CanvasNoteItemBase {
  id: string;
  type: 'text' | 'image';
  x: number;         // absolut auf der Canvas, px
  y: number;
  width: number;
  zIndex: number;
  rotation?: number;
}

interface CanvasTextItem extends CanvasNoteItemBase {
  type: 'text';
  content: string;
  fontSize?: number;
  color?: string;
}

interface CanvasImageItem extends CanvasNoteItemBase {
  type: 'image';
  height?: number;
  blobId: string;
  encryptedKey: string;
  iv: string;
  mimeType: string;
}

type CanvasNoteItem = CanvasTextItem | CanvasImageItem;
```

Gespeichert: als Hauptinhalt der Notiz (verschlüsselt), kein separates TipTap-Dokument. Der `type`-Field der File-Record ist `'canvas'`.

### Neue Datei: `CanvasNoteEditor.tsx`

Eigenständige Komponente, kein Dependency auf `Editor.tsx` oder `CanvasLayer.tsx`.

**Rendering-Schichten:**
```
<div class="canvas-viewport">          ← overflow: hidden, Fenster-Größe
  <div class="canvas-world"            ← transform: scale(zoom) translate(panX, panY)
    style="width:4000px; height:3000px"
  >
    {items.map(item => <CanvasNoteItem />)}
    <canvas-background-grid />         ← leichtes Punkt-Raster
  </div>
  <canvas-toolbar />                   ← Zoom +/-, evtl. Modus-Anzeige
</div>
```

**Interaktion:**
- Klick auf leere Fläche → neue TextItem an dieser Position, sofort im Edit-Modus
- Klick auf bestehende TextItem → selektieren; zweiter Klick → Edit-Modus (`contenteditable`)
- Blur einer TextItem → Inhalt speichern; leere TextItem wird gelöscht
- Drag einer TextItem (per Mousedown auf Rand/Grip) → Position aktualisieren
- Scroll/Wheel → Zoom (um Mausposition zentriert)
- Middle-Mouse-Drag oder Space+Drag → Pan
- Bilder: Drag & Drop / Paste → gleiche Upload-Pipeline wie `CanvasLayer.tsx` (Verschlüsselung via `cryptoLib`)
- Rechtsklick auf Item → Kontextmenü: Löschen, In Vordergrund/Hintergrund

**Zoom-Implementierung:**
CSS `transform: scale(zoom) translate(panX, panY)` auf `.canvas-world`. Koordinaten beim Klick werden mit `1/zoom` zurückgerechnet.

### Sidebar-Integration
- Canvas-Notizen zeigen `<Layout size={15} />` Icon (statt `<FileText />`) in FileItem
- Optional: leichte Teal-Färbung des Icons

### Erstellen einer Canvas-Notiz
- Rechtsklick-Menü in der Sidebar bekommt Eintrag "Neue Leinwand"
- `onNewCanvasNote` Callback analog zu `onNewNote`
- Backend: `createNote` mit `type: 'canvas'`, Initialinhalt = `JSON.stringify({ version: 1, noteId, canvasWidth: 4000, canvasHeight: 3000, items: [] })`

### Anzeige in page.tsx
- Wenn aktive Notiz `type === 'canvas'` → `<CanvasNoteEditor>` statt `<Editor>`

---

## 3. Bug-Fixes

### Bug A — Bilder laden nach 1–2 Tagen nicht mehr

**Diagnose:**  
Die `imageBlobCache` in `CanvasLayer.tsx` ist ein `useRef` und lebt nur für die Session. Bei jedem neuen Laden muss das Bild vom Server geholt und entschlüsselt werden. Da das Symptom persistent ist (auch nach Neuladen), deutet es auf einen Server-seitigen Fehler hin: wahrscheinlich gibt `/api/v1/files/{blobId}/download` nach einiger Zeit 404 zurück. Mögliche Ursachen: ein Cleanup-Job löscht "verwaiste" Note-Dateien (Canvas-Bilder werden als `type: 'note'` ohne eigenen Eintrag gespeichert), oder der Download-Endpoint prüft nach Token-Rotation die Berechtigung anders.

**Fix-Ansatz:**
1. Error-Handling in `ImageWidget` verbessern: HTTP-Status-Code loggen und anzeigen
2. Im Backend prüfen: werden Canvas-Bild-Dateien durch Cleanup-Jobs gelöscht?
3. Falls Cleanup der Grund: Canvas-Bilder als `type: 'canvas-asset'` markieren oder in den StyleFile-Metadaten referenzieren damit sie nicht als verwaist gelten

### Bug B — Magic-Link-Klick benennt Zielnotiz um

**Diagnose:**  
Der `MentionNodeView` in `Editor.tsx` speichert den Titel im `label`-Attribut zum Zeitpunkt der Erstellung. Wenn auf den Link geklickt wird, wird `onFileSelect(id, label)` aufgerufen. In `page.tsx` wird der zweite Parameter (`title`) möglicherweise als `onRenameSubmit` weitergeleitet oder in der Tab-Verwaltung fälschlicherweise als neuer Titel der Zieldatei gesetzt. Der Effekt (beide Notizen gleicher Name) passt zu einem unbeabsichtigten `renameNote(targetId, sourceTitle)`-Aufruf.

**Fix-Ansatz:**
1. In `page.tsx` den `onFileSelect`-Handler prüfen: wird der `title`-Parameter zum Umbenennen verwendet?
2. Wenn ja: beim Navigieren per Magic-Link keinen `title` übergeben oder explizit `null` als Titel-Update-Signal kennzeichnen

### Bug C — Drag & Drop in Sidebar instabil

**Diagnose:**  
Klassisches "dragLeave fires on child"-Problem. Wenn die Maus von einem `motion.div` in ein Kind-Element fährt, feuert `onDragLeave` auf dem Parent, obwohl die Maus noch im Bereich ist — dadurch springt `dropIndicator` auf `null`. Zusätzlich: die Zonen-Berechnung (`top/middle/bottom`) basiert auf `rect.height` des äußeren Wrappers, nicht des Ordner-Headers, was bei geöffneten Ordnern zu falschen Zonen führt.

**Fix-Ansatz:**
1. In `onDragLeave`: `e.relatedTarget` prüfen — wenn `relatedTarget` noch Kind des Elements ist, `setDropIndicator(null)` unterdrücken
2. Zonen-Berechnung auf den Folder-Header-Row begrenzen (ersten `div.p-2` statt des gesamten expandierten Ordners)
3. `e.stopPropagation()` in `FolderItem`'s `onDragOver` auch für Level-0-Folder setzen

---

## Implementierungsreihenfolge

1. Bug C (Drag & Drop) — unabhängig, schnell, sofort spürbar
2. Bug B (Magic Links) — unabhängig, lokalisierter Fix
3. Sidebar-Umbau — isolierter UI-Change
4. Bug A (Bilder) — erfordert Backend-Untersuchung, parallel möglich
5. Canvas-Leinwand — größtes Feature, baut auf sauberem Sidebar auf
