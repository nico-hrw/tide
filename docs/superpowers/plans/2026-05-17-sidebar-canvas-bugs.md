# Sidebar-Umbau, Canvas-Leinwand, Bug-Fixes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sidebar von Nav-Buttons befreien, Avatar-Dropdown zu page.tsx verschieben, Canvas-Notiz als neuen Typ implementieren, und drei konkrete Bugs beheben.

**Architecture:** Bugs zuerst (isoliert, kein Risiko), dann Sidebar-Umbau, dann Canvas von innen nach außen (Types → CanvasNoteItem → CanvasNoteEditor → Integration). Canvas-Notizen sind `type: 'canvas'` File-Records, deren Inhalt ein verschlüsseltes `CanvasNoteData`-JSON ist — kein TipTap-Dokument. Sidebar-Umbau entfernt Buttons direkt aus `Sidebar.tsx` und ergänzt einen Avatar-Dropdown in `page.tsx`.

**Tech Stack:** Next.js 14, React 18, TypeScript, Tailwind CSS, Framer Motion, Lucide Icons, Zustand

---

## File Map

| Aktion | Pfad |
|--------|------|
| Modify | `web/src/components/Layout/Sidebar.tsx` |
| Modify | `web/src/app/page.tsx` |
| Modify | `web/src/store/useDataStore.ts` |
| Create | `web/src/types/canvasNote.ts` |
| Create | `web/src/components/Canvas/CanvasNoteItem.tsx` |
| Create | `web/src/components/Canvas/CanvasNoteEditor.tsx` |
| Modify | `web/src/components/Canvas/CanvasLayer.tsx` (extract upload hook) |
| Create | `web/src/components/Canvas/useCanvasImageUpload.ts` |

---

## Task 1: Bug C — Drag & Drop in Sidebar fixieren

**Files:**
- Modify: `web/src/components/Layout/Sidebar.tsx:476-530`

Das Problem: `onDragLeave` feuert wenn die Maus von einem Parent-Div in ein Kind-Element wechselt, weil das `relatedTarget` dann ein Kind ist. Resultat: `dropIndicator` springt auf `null`.

- [ ] **Step 1: `onDragLeave` aller `motion.div`s in der orderedItems-Map patchen**

In `Sidebar.tsx`, suche alle `onDragLeave={() => setDropIndicator(null)}` Aufrufe in der orderedItems-Map und ersetze durch:

```tsx
onDragLeave={(e: React.DragEvent) => {
    if ((e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) return;
    setDropIndicator(null);
}}
```

- [ ] **Step 2: Zonen-Berechnung für Ordner auf den Header-Row begrenzen**

In der `onDragOver` in der `orderedItems.map()`, suche den Block der die `zone` berechnet:

```tsx
// VORHER:
const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
const y = e.clientY - rect.top;
let zone: 'top' | 'middle' | 'bottom' = 'middle';
if (item.type === 'folder') {
    if (y < rect.height * 0.25) zone = 'top';
    else if (y > rect.height * 0.75) zone = 'bottom';
} else {
    zone = y < rect.height / 2 ? 'top' : 'bottom';
}
```

Ersetze durch (benutzt feste 32px für den Folder-Header statt die gesamte expandierte Höhe):

```tsx
// NACHHER:
const rowHeight = 32; // Feste Höhe einer Item-Row
const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
const y = e.clientY - rect.top;
let zone: 'top' | 'middle' | 'bottom' = 'middle';
if (item.type === 'folder') {
    if (y < rowHeight * 0.3) zone = 'top';
    else if (y > rowHeight * 0.7) zone = 'bottom';
} else {
    zone = y < rowHeight / 2 ? 'top' : 'bottom';
}
```

- [ ] **Step 3: Manuell testen** — Notiz über einen Ordner ziehen, prüfen ob die blaue Markierung ruhig bleibt und beim Loslassen in den richtigen Ordner landet.

- [ ] **Step 4: Commit**

```
git add web/src/components/Layout/Sidebar.tsx
git commit -m "fix: stabilize sidebar drag-drop indicator (relatedTarget + fixed row height)"
```

---

## Task 2: Bug B — Magic Link benennt Zielnotiz um

**Files:**
- Modify: `web/src/app/page.tsx:684`

Das Problem: `performSave` liest `fileNameRef.current` für den zu speichernden Titel. Diese Ref wird über einen `useEffect` nach dem nächsten Render aktualisiert. Beim Tab-Wechsel per Magic-Link wird `setFileName(noteB_title)` aufgerufen bevor `performSave` seinen ersten `await` abschließt. Dadurch liest `performSave` beim Fortsetzen nach dem await den Titel von Note B, obwohl es Note A speichert — Note A wird mit dem Titel von Note B überschrieben.

- [ ] **Step 1: `performSave` so ändern dass der Titel aus dem Store gelesen wird**

In `page.tsx` bei ca. Zeile 684, suche:

```typescript
const title = fileNameRef.current || 'Untitled';
```

Ersetze durch (der Store hat zu diesem Zeitpunkt bereits den fresh state durch `freshState` auf Zeile 625):

```typescript
const fileRecord = allFiles.find(f => f.id === fileId);
const title = fileRecord?.title || fileNameRef.current || 'Untitled';
```

`allFiles` ist bereits auf Zeile 634 definiert (`const allFiles = [...freshState.notes, ...freshState.events] as any[]`), also kein neuer Code nötig.

- [ ] **Step 2: Verhalten prüfen**

1. Note A öffnen (mit einem einzigartigen Namen)
2. Etwas schreiben → saveStatus = unsaved
3. Link zu Note B anklicken
4. Note A in der Sidebar prüfen — darf seinen Namen nicht verloren haben
5. Note B prüfen — darf Note A's Namen nicht bekommen haben

- [ ] **Step 3: Commit**

```
git add web/src/app/page.tsx
git commit -m "fix: performSave reads title from store record, not stale fileNameRef (magic-link race)"
```

---

## Task 3: Sidebar — Buttons entfernen

**Files:**
- Modify: `web/src/components/Layout/Sidebar.tsx`

- [ ] **Step 1: Import-List bereinigen**

In `Sidebar.tsx` Zeile 3, entferne aus dem Lucide-Import: `Calendar` (wird nicht mehr gebraucht wenn kein Calendar-Button da ist).  
Behalte: `Upload`, `FolderPlus`, `Plus` (werden ins Context-Menü verschoben, brauchen Import dort).

- [ ] **Step 2: Die gesamte Kopfzeile (Avatar + Buttons) ersetzen**

Suche den Block von `<div className="flex-shrink-0 p-2 pb-0">` bis zum schließenden `</div>` der `{/* Navigation Icons */}` Sektion (ca. Zeilen 214–333). Ersetze durch nichts (komplett löschen). Die Sidebar beginnt danach direkt mit dem RECENT-Abschnitt.

Der RECENT-Abschnitt (ca. Zeile 334 ff.) bekommt zusätzliches Top-Padding:

```tsx
{/* RECENT Section */}
<div className="flex-shrink-0 p-2 pt-3 pb-0">
    <p className="text-[11px] font-medium uppercase tracking-[1px] text-[var(--text-subtle)] px-2 mb-1">
        Recent
    </p>
    ...
```

- [ ] **Step 3: Import-Handler für ".md Importieren" ins globale Sidebar-Context-Menü verschieben**

Der Upload-Handler (Zeilen 235–274) wird aus dem Button herausgelöst und als separate Funktion `handleImport` definiert (vor dem `return` Statement):

```typescript
const handleImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.md';
    input.onchange = async (e: any) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (event) => {
            const rawContent = event.target?.result as string;
            const title = file.name.replace(/\.md$/, '');
            const lines = rawContent.split('\n');
            const contentNodes = lines
                .map((line: string) => line.trimEnd())
                .filter((line: string) => line.length > 0)
                .map((line: string) => ({
                    type: 'paragraph',
                    attrs: { blockId: crypto.randomUUID() },
                    content: [{ type: 'text', text: line }]
                }));
            const tiptapDoc = {
                type: 'doc',
                content: contentNodes.length > 0 ? contentNodes : [
                    { type: 'paragraph', attrs: { blockId: crypto.randomUUID() } }
                ]
            };
            const newId = await useDataStore.getState().createNote(title, tiptapDoc);
            useDataStore.getState().fetchDirectory(null, true);
            onFileSelect(newId, title);
        };
        reader.readAsText(file);
    };
    input.click();
};
```

- [ ] **Step 4: Globales Context-Menü für leere Sidebar-Fläche hinzufügen**

Direkt über dem schließenden `</div>` der ganzen Sidebar-Komponente, füge einen `onContextMenu`-Handler auf dem scrollbaren Notes-Container hinzu:

```tsx
<div
    className="overflow-y-auto overflow-x-visible px-2 no-scrollbar"
    style={{ flex: '1 1 0', minHeight: 0, paddingBottom: '32px' }}
    onDoubleClick={(e) => {
        if (e.target === e.currentTarget) onNewNote();
    }}
    onContextMenu={(e) => {
        if (e.target === e.currentTarget) {
            e.preventDefault();
            setSidebarContextMenu({ x: e.clientX, y: e.clientY });
        }
    }}
    onDragOver={(e) => e.preventDefault()}
    onDrop={.../* unverändert */}
>
```

Füge neuen State hinzu (neben den anderen useState-Aufrufen):

```typescript
const [sidebarContextMenu, setSidebarContextMenu] = useState<{ x: number; y: number } | null>(null);
```

Füge das neue globale Context-Menü am Ende des Returns (neben dem bestehenden `contextMenu`) hinzu:

```tsx
{sidebarContextMenu && (
    <div
        className="context-menu fixed z-[200] w-56 bg-white border border-gray-200 rounded-xl shadow-2xl py-1 animate-in fade-in zoom-in-95 duration-100"
        style={{ left: sidebarContextMenu.x, top: sidebarContextMenu.y }}
    >
        <div className="px-2 py-1.5 flex flex-col gap-0.5">
            <button
                onClick={() => { setSidebarContextMenu(null); onNewNote(); }}
                className="w-full flex items-center gap-3 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg transition-colors group"
            >
                <Plus size={16} className="text-gray-400 group-hover:text-blue-500" />
                <span className="font-medium">Neue Notiz</span>
            </button>
            <button
                onClick={() => { setSidebarContextMenu(null); onCreateFolder && onCreateFolder(null); }}
                className="w-full flex items-center gap-3 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg transition-colors group"
            >
                <FolderPlus size={16} className="text-gray-400 group-hover:text-blue-500" />
                <span className="font-medium">Neuer Ordner</span>
            </button>
            <div className="h-px bg-gray-100 my-1" />
            <button
                onClick={() => { setSidebarContextMenu(null); handleImport(); }}
                className="w-full flex items-center gap-3 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg transition-colors group"
            >
                <Upload size={16} className="text-gray-400 group-hover:text-blue-500" />
                <span className="font-medium">Importieren (.md)</span>
            </button>
        </div>
    </div>
)}
```

Füge den Click-outside-Handler für `sidebarContextMenu` im bestehenden `handleClickOutside`-Effect hinzu:

```typescript
if (sidebarContextMenu && !(event.target as HTMLElement).closest('.context-menu')) {
    setSidebarContextMenu(null);
}
```

- [ ] **Step 5: Canvas-Notiz-Eintrag ins globale Context-Menü hinzufügen** (kommt nach Task 12, aber der Slot bleibt reserviert — füge jetzt schon den Prop `onNewCanvasNote` zur SidebarProps-Interface hinzu):

```typescript
onNewCanvasNote?: () => void;
```

Und im globalen Context-Menü (nach "Neue Notiz"):

```tsx
{onNewCanvasNote && (
    <button
        onClick={() => { setSidebarContextMenu(null); onNewCanvasNote(); }}
        className="w-full flex items-center gap-3 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg transition-colors group"
    >
        <Layout size={16} className="text-gray-400 group-hover:text-blue-500" />
        <span className="font-medium">Neue Leinwand</span>
    </button>
)}
```

Füge `Layout` zu den Lucide-Imports hinzu.

- [ ] **Step 6: Commit**

```
git add web/src/components/Layout/Sidebar.tsx
git commit -m "feat: remove nav buttons from sidebar, move actions to right-click menu"
```

---

## Task 4: Avatar-Dropdown in page.tsx

**Files:**
- Modify: `web/src/app/page.tsx`

- [ ] **Step 1: Avatar + Dropdown State hinzufügen**

Im `page.tsx`, suche die anderen `useState`-Deklarationen und füge hinzu:

```typescript
const [isAvatarMenuOpen, setIsAvatarMenuOpen] = useState(false);
const avatarMenuRef = useRef<HTMLDivElement>(null);
```

Füge `useRef` zum Import hinzu falls nicht vorhanden (ist schon dabei).

- [ ] **Step 2: Click-outside-Handler für Avatar-Menü**

Füge in einem `useEffect` hinzu:

```typescript
useEffect(() => {
    const handleClick = (e: MouseEvent) => {
        if (avatarMenuRef.current && !avatarMenuRef.current.contains(e.target as Node)) {
            setIsAvatarMenuOpen(false);
        }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
}, []);
```

- [ ] **Step 3: Avatar-Button ins Desktop-Layout einfügen**

Im Desktop-Layout in `page.tsx`, suche den äußeren Container des rechten Workspace-Bereichs (nach der Sidebar, gibt es als `<div className="flex-1 flex flex-col ...">` oder ähnlich). Füge direkt darunter (als erstes Kind) ein, bevor der Editor-Content kommt:

```tsx
{/* Avatar-Button oben rechts */}
<div ref={avatarMenuRef} className="absolute top-4 right-4 z-[150]">
    <button
        onClick={() => setIsAvatarMenuOpen(o => !o)}
        className="w-8 h-8 rounded-full overflow-hidden hover:ring-2 hover:ring-blue-400 transition-all hover:scale-105 active:scale-95"
        title="Profil"
    >
        <Avatar
            seed={(userProfile?.avatar_seed || userProfile?.user_id || userProfile?.id || myId || 'default') + (userProfile?.avatar_salt || '')}
            size={32}
        />
    </button>

    {isAvatarMenuOpen && (
        <div className="absolute right-0 top-10 w-48 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-2xl py-1 animate-in fade-in zoom-in-95 duration-100">
            <div className="px-3 py-2 border-b border-gray-100 dark:border-gray-800">
                <p className="text-xs font-semibold text-gray-900 dark:text-gray-100 truncate">{userProfile?.username || 'User'}</p>
                <p className="text-xs text-gray-400 truncate">{userProfile?.email || ''}</p>
            </div>
            <div className="py-1 px-1">
                <button
                    onClick={() => { setIsAvatarMenuOpen(false); setActiveTabId('social'); }}
                    className="w-full flex items-center gap-3 px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
                >
                    <Users size={15} className="text-gray-400" />
                    <span>Social</span>
                </button>
                <button
                    onClick={() => { setIsAvatarMenuOpen(false); useDataStore.getState().setSettingsModalOpen(true); }}
                    className="w-full flex items-center gap-3 px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
                >
                    <Settings size={15} className="text-gray-400" />
                    <span>Einstellungen</span>
                </button>
                <div className="h-px bg-gray-100 dark:bg-gray-800 my-1" />
                <button
                    onClick={() => {
                        setIsAvatarMenuOpen(false);
                        sessionStorage.clear();
                        localStorage.removeItem('tide_user_email');
                        localStorage.removeItem('tide_user_id');
                        localStorage.removeItem('tide_session_token');
                        window.location.reload();
                    }}
                    className="w-full flex items-center gap-3 px-3 py-2 text-sm text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-lg transition-colors"
                >
                    <LogOut size={15} className="text-rose-400" />
                    <span>Abmelden</span>
                </button>
            </div>
        </div>
    )}
</div>
```

Füge `Settings`, `LogOut`, `Users` zu den Lucide-Imports hinzu (falls nicht vorhanden — prüfe ob sie schon importiert sind).
Stelle sicher dass `Avatar` importiert ist: `import Avatar from '@/components/Profile/Avatar'`.

Der äußere Container braucht `relative`: falls nicht vorhanden, `className="relative flex-1 flex flex-col h-full"`.

- [ ] **Step 4: Commit**

```
git add web/src/app/page.tsx
git commit -m "feat: add avatar dropdown top-right with social/settings/logout"
```

---

## Task 5: Canvas Note — Typen definieren

**Files:**
- Create: `web/src/types/canvasNote.ts`

- [ ] **Step 1: Typ-Datei erstellen**

```typescript
// web/src/types/canvasNote.ts

export type CanvasNoteItemType = 'text' | 'image';

interface CanvasNoteItemBase {
    id: string;
    type: CanvasNoteItemType;
    x: number;
    y: number;
    width: number;
    zIndex: number;
    rotation?: number;
}

export interface CanvasTextItem extends CanvasNoteItemBase {
    type: 'text';
    content: string;
    fontSize?: number;
    color?: string;
}

export interface CanvasImageItem extends CanvasNoteItemBase {
    type: 'image';
    height?: number;
    blobId: string;
    encryptedKey: string;
    iv: string;
    mimeType: string;
}

export type CanvasNoteItem = CanvasTextItem | CanvasImageItem;

export interface CanvasNoteData {
    version: 1;
    noteId: string;
    canvasWidth: number;
    canvasHeight: number;
    items: CanvasNoteItem[];
}

export function createEmptyCanvasNote(noteId: string): CanvasNoteData {
    return {
        version: 1,
        noteId,
        canvasWidth: 4000,
        canvasHeight: 3000,
        items: [],
    };
}

export function isCanvasTextItem(item: CanvasNoteItem): item is CanvasTextItem {
    return item.type === 'text';
}

export function isCanvasImageItem(item: CanvasNoteItem): item is CanvasImageItem {
    return item.type === 'image';
}

export function isCanvasNoteData(data: unknown): data is CanvasNoteData {
    return (
        typeof data === 'object' && data !== null &&
        (data as any).version === 1 &&
        Array.isArray((data as any).items) &&
        typeof (data as any).canvasWidth === 'number'
    );
}
```

- [ ] **Step 2: Commit**

```
git add web/src/types/canvasNote.ts
git commit -m "feat: add CanvasNoteData type definitions"
```

---

## Task 6: `useCanvasImageUpload` Hook extrahieren

**Files:**
- Create: `web/src/components/Canvas/useCanvasImageUpload.ts`
- Modify: `web/src/components/Canvas/CanvasLayer.tsx` (import aus neuem Hook, alte Logik entfernen)

Dieser Hook kapselt die verschlüsselte Bild-Upload-Logik, damit sowohl `CanvasLayer` als auch `CanvasNoteEditor` sie nutzen können.

- [ ] **Step 1: Hook erstellen**

```typescript
// web/src/components/Canvas/useCanvasImageUpload.ts
"use client";

import { useCallback, useRef } from 'react';
import { apiFetch } from '@/lib/api';
import * as cryptoLib from '@/lib/crypto';
import { CanvasImageItem } from '@/types/canvasNote';

export interface UploadedImage {
    id: string;
    type: 'image';
    blobId: string;
    encryptedKey: string;
    iv: string;
    mimeType: string;
    width: number;
}

export function useCanvasImageUpload(
    publicKey: CryptoKey | null,
    userId: string,
    imageBlobCache: React.MutableRefObject<Map<string, string>>,
) {
    const upload = useCallback(async (
        file: File,
        onStart: (placeholderId: string) => void,
        onDone: (placeholderId: string, result: UploadedImage) => void,
        onError: (placeholderId: string) => void,
    ) => {
        if (!publicKey || !userId) return;

        const placeholderId = crypto.randomUUID();
        onStart(placeholderId);

        try {
            const fileKey = await cryptoLib.generateFileKey();
            const fileKeyJwk = await window.crypto.subtle.exportKey('jwk', fileKey);
            const { iv, ciphertext } = await cryptoLib.encryptFile(file, fileKey);
            const encryptedMeta = await cryptoLib.encryptMetadata(
                { title: `.canvas-img-${placeholderId}`, fileKey: fileKeyJwk, iv },
                publicKey
            );

            const createRes = await apiFetch('/api/v1/files', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    type: 'canvas-asset',
                    size: ciphertext.size,
                    public_meta: {},
                    secured_meta: encryptedMeta,
                    visibility: 'private',
                }),
            });
            if (!createRes.ok) throw new Error('Failed to create image record');
            const newFile = await createRes.json() as { id: string };
            await apiFetch(`/api/v1/files/${newFile.id}/upload`, { method: 'POST', body: ciphertext });

            const result: UploadedImage = {
                id: crypto.randomUUID(),
                type: 'image',
                blobId: newFile.id,
                encryptedKey: encryptedMeta,
                iv,
                mimeType: file.type,
                width: 300,
            };
            onDone(placeholderId, result);
        } catch (err) {
            console.error('[Canvas] Image upload failed:', err);
            onError(placeholderId);
        }
    }, [publicKey, userId]);

    return { upload };
}
```

Hinweis: `type: 'canvas-asset'` statt `'note'` damit Backend-Cleanup-Jobs Canvas-Bilder nicht löschen (Fix für Bug A). Prüfe ob das Backend diesen Typ unterstützt — falls nicht, nutze `'note'` als Fallback, aber das sollte geklärt werden.

- [ ] **Step 2: CanvasLayer.tsx auf den neuen Hook umstellen** (optional, für DRY — `CanvasLayer` behält seine interne `uploadImage`-Funktion bis Canvas-Note fertig ist, um Regressions zu vermeiden. Dieser Schritt kann nach Task 10 gemacht werden.)

- [ ] **Step 3: Commit**

```
git add web/src/components/Canvas/useCanvasImageUpload.ts
git commit -m "feat: extract canvas image upload to reusable hook (type: canvas-asset)"
```

---

## Task 7: `CanvasNoteItem` Komponente

**Files:**
- Create: `web/src/components/Canvas/CanvasNoteItem.tsx`

Einzelnes Element auf der Leinwand. Rendert Text-Box oder Bild. Kann gezogen werden.

- [ ] **Step 1: Komponente erstellen**

```tsx
// web/src/components/Canvas/CanvasNoteItem.tsx
"use client";

import { useRef, useState, useCallback, useEffect } from 'react';
import { X } from 'lucide-react';
import { CanvasNoteItem as CanvasNoteItemType, CanvasTextItem, CanvasImageItem, isCanvasTextItem, isCanvasImageItem } from '@/types/canvasNote';
import * as cryptoLib from '@/lib/crypto';
import { apiFetch } from '@/lib/api';

// ── Image Widget ──────────────────────────────────────────────────────────────

function ImageWidget({
    item,
    privateKey,
    imageBlobCache,
}: {
    item: CanvasImageItem;
    privateKey: CryptoKey | null;
    imageBlobCache: React.MutableRefObject<Map<string, string>>;
}) {
    const [src, setSrc] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!privateKey) return;
        const cached = imageBlobCache.current.get(item.blobId);
        if (cached) { setSrc(cached); setLoading(false); return; }

        let cancelled = false;
        (async () => {
            try {
                const meta = await cryptoLib.decryptMetadata(item.encryptedKey, privateKey);
                const fileKey = await window.crypto.subtle.importKey('jwk', meta.fileKey as JsonWebKey, { name: 'AES-GCM' }, false, ['decrypt']);
                const res = await apiFetch(`/api/v1/files/${item.blobId}/download`);
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const dec = await cryptoLib.decryptFile(await res.blob(), meta.iv as string, fileKey);
                const url = URL.createObjectURL(new Blob([await dec.arrayBuffer()], { type: item.mimeType }));
                imageBlobCache.current.set(item.blobId, url);
                if (!cancelled) { setSrc(url); setLoading(false); }
            } catch (e: any) {
                console.error('[CanvasNote] decrypt image:', e);
                if (!cancelled) { setError(e?.message || 'Fehler'); setLoading(false); }
            }
        })();
        return () => { cancelled = true; };
    }, [item.blobId, item.encryptedKey, privateKey, imageBlobCache]);

    if (loading) return (
        <div style={{ width: item.width, height: 120 }} className="flex items-center justify-center rounded-xl bg-black/5 border border-black/10">
            <div className="w-5 h-5 rounded-full border-2 border-indigo-400 border-t-transparent animate-spin" />
        </div>
    );
    if (error || !src) return (
        <div style={{ width: item.width, height: 60 }} className="flex items-center justify-center rounded-lg bg-red-50 border border-red-200 text-red-400 text-xs px-2">
            Bild konnte nicht geladen werden
        </div>
    );
    return (
        <img src={src} alt="" draggable={false} className="rounded-lg block select-none"
            style={{ width: item.width, maxWidth: 600, objectFit: 'contain' }} />
    );
}

// ── Text Widget ───────────────────────────────────────────────────────────────

function TextWidget({
    item,
    isEditing,
    onUpdate,
    onStartEdit,
}: {
    item: CanvasTextItem;
    isEditing: boolean;
    onUpdate: (content: string) => void;
    onStartEdit: () => void;
}) {
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (isEditing && ref.current) {
            ref.current.focus();
            // Place cursor at end
            const range = document.createRange();
            const sel = window.getSelection();
            range.selectNodeContents(ref.current);
            range.collapse(false);
            sel?.removeAllRanges();
            sel?.addRange(range);
        }
    }, [isEditing]);

    return (
        <div
            ref={ref}
            contentEditable={isEditing}
            suppressContentEditableWarning
            onDoubleClick={onStartEdit}
            onBlur={(e) => {
                const text = e.currentTarget.innerText;
                onUpdate(text);
            }}
            onKeyDown={(e) => {
                if (e.key === 'Escape') {
                    (e.currentTarget as HTMLElement).blur();
                }
                e.stopPropagation();
            }}
            style={{
                minWidth: 80,
                width: item.width,
                fontSize: item.fontSize ?? 14,
                color: item.color ?? '#111',
                padding: '6px 10px',
                outline: 'none',
                borderRadius: 6,
                cursor: isEditing ? 'text' : 'default',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                userSelect: isEditing ? 'text' : 'none',
                lineHeight: 1.5,
                background: isEditing ? 'rgba(99,102,241,0.04)' : 'transparent',
                boxShadow: isEditing ? '0 0 0 1.5px rgba(99,102,241,0.4)' : undefined,
            }}
        >
            {item.content || (isEditing ? '' : <span style={{ color: '#aaa' }}>Text…</span>)}
        </div>
    );
}

// ── Main CanvasNoteItem ────────────────────────────────────────────────────────

export interface CanvasNoteItemProps {
    item: CanvasNoteItemType;
    zoom: number;
    privateKey: CryptoKey | null;
    imageBlobCache: React.MutableRefObject<Map<string, string>>;
    isEditingId: string | null;
    onStartEdit: (id: string) => void;
    onUpdate: (id: string, updates: Partial<CanvasNoteItemType>) => void;
    onRemove: (id: string) => void;
    onMoveEnd: (id: string, x: number, y: number) => void;
}

export default function CanvasNoteItemComponent({
    item, zoom, privateKey, imageBlobCache,
    isEditingId, onStartEdit, onUpdate, onRemove, onMoveEnd,
}: CanvasNoteItemProps) {
    const elRef = useRef<HTMLDivElement>(null);
    const [hovered, setHovered] = useState(false);
    const isEditing = isEditingId === item.id;
    const dragState = useRef<{ startX: number; startY: number; initX: number; initY: number } | null>(null);

    const onMouseDown = useCallback((e: React.MouseEvent) => {
        if (isEditing || e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        dragState.current = { startX: e.clientX, startY: e.clientY, initX: item.x, initY: item.y };

        const onMove = (me: MouseEvent) => {
            if (!dragState.current || !elRef.current) return;
            const dx = (me.clientX - dragState.current.startX) / zoom;
            const dy = (me.clientY - dragState.current.startY) / zoom;
            elRef.current.style.transform = `translate(${dx}px, ${dy}px) rotate(${item.rotation ?? 0}deg)`;
        };
        const onUp = (me: MouseEvent) => {
            if (!dragState.current) return;
            if (elRef.current) elRef.current.style.transform = '';
            const dx = (me.clientX - dragState.current.startX) / zoom;
            const dy = (me.clientY - dragState.current.startY) / zoom;
            const wasDrag = Math.abs(dx) > 3 || Math.abs(dy) > 3;
            onMoveEnd(item.id, dragState.current.initX + dx, dragState.current.initY + dy);
            dragState.current = null;
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
        };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
    }, [item.id, item.x, item.y, item.rotation, zoom, isEditing, onMoveEnd]);

    const resizeState = useRef<{ startX: number; initWidth: number } | null>(null);
    const onResizeMouseDown = useCallback((e: React.MouseEvent) => {
        e.preventDefault(); e.stopPropagation();
        resizeState.current = { startX: e.clientX, initWidth: item.width };
        const onMove = (me: MouseEvent) => {
            if (!resizeState.current) return;
            const dx = (me.clientX - resizeState.current.startX) / zoom;
            const newW = Math.max(80, resizeState.current.initWidth + dx);
            if (elRef.current) {
                const inner = elRef.current.querySelector('[data-resize-target]') as HTMLElement;
                if (inner) inner.style.width = `${newW}px`;
            }
        };
        const onUp = (me: MouseEvent) => {
            if (!resizeState.current) return;
            const dx = (me.clientX - resizeState.current.startX) / zoom;
            onUpdate(item.id, { width: Math.max(80, resizeState.current.initWidth + dx) });
            resizeState.current = null;
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
        };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
    }, [item.id, item.width, zoom, onUpdate]);

    return (
        <div
            ref={elRef}
            className="canvas-note-item group absolute"
            style={{
                left: item.x,
                top: item.y,
                zIndex: item.zIndex,
                transform: item.rotation ? `rotate(${item.rotation}deg)` : undefined,
                transformOrigin: 'center center',
                cursor: isEditing ? 'text' : 'grab',
            }}
            onMouseDown={onMouseDown}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            onDoubleClick={() => isCanvasTextItem(item) && onStartEdit(item.id)}
        >
            {/* Delete button */}
            {hovered && !isEditing && (
                <button
                    className="absolute -top-6 right-0 p-0.5 bg-gray-900/80 rounded text-white/70 hover:text-red-400 z-10"
                    onMouseDown={(e) => { e.stopPropagation(); onRemove(item.id); }}
                >
                    <X size={12} />
                </button>
            )}

            <div data-resize-target>
                {isCanvasTextItem(item) && (
                    <TextWidget
                        item={item}
                        isEditing={isEditing}
                        onUpdate={(content) => onUpdate(item.id, { content })}
                        onStartEdit={() => onStartEdit(item.id)}
                    />
                )}
                {isCanvasImageItem(item) && (
                    <ImageWidget item={item} privateKey={privateKey} imageBlobCache={imageBlobCache} />
                )}
            </div>

            {/* Resize handle */}
            {hovered && !isEditing && (
                <div
                    className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize z-10 opacity-0 group-hover:opacity-100 transition-opacity"
                    onMouseDown={onResizeMouseDown}
                    style={{ background: 'linear-gradient(135deg, transparent 50%, rgba(99,102,241,0.7) 50%)', borderRadius: '0 0 4px 0' }}
                />
            )}
        </div>
    );
}
```

- [ ] **Step 2: Commit**

```
git add web/src/components/Canvas/CanvasNoteItem.tsx
git commit -m "feat: add CanvasNoteItem component with drag, resize, text edit"
```

---

## Task 8: `CanvasNoteEditor` Komponente

**Files:**
- Create: `web/src/components/Canvas/CanvasNoteEditor.tsx`

- [ ] **Step 1: Komponente erstellen**

```tsx
// web/src/components/Canvas/CanvasNoteEditor.tsx
"use client";

import { useState, useRef, useCallback, useEffect } from 'react';
import { CanvasNoteData, CanvasNoteItem, CanvasTextItem, CanvasImageItem, isCanvasNoteData, createEmptyCanvasNote } from '@/types/canvasNote';
import CanvasNoteItemComponent from './CanvasNoteItem';
import { useCanvasImageUpload } from './useCanvasImageUpload';
import { ZoomIn, ZoomOut } from 'lucide-react';

const CANVAS_W = 4000;
const CANVAS_H = 3000;
const MIN_ZOOM = 0.2;
const MAX_ZOOM = 2.0;
const GRID_SIZE = 24;

interface CanvasNoteEditorProps {
    noteId: string;
    initialData: CanvasNoteData | null;
    publicKey: CryptoKey | null;
    privateKey: CryptoKey | null;
    userId: string;
    onChange: (data: CanvasNoteData) => void;
}

export default function CanvasNoteEditor({
    noteId, initialData, publicKey, privateKey, userId, onChange,
}: CanvasNoteEditorProps) {
    const data = initialData ?? createEmptyCanvasNote(noteId);

    const [items, setItems] = useState<CanvasNoteItem[]>(data.items);
    const [zoom, setZoom] = useState(0.5);
    const [pan, setPan] = useState({ x: 0, y: 0 });
    const [isEditingId, setIsEditingId] = useState<string | null>(null);
    const imageBlobCache = useRef(new Map<string, string>());
    const viewportRef = useRef<HTMLDivElement>(null);
    const worldRef = useRef<HTMLDivElement>(null);
    const isPanning = useRef(false);
    const panStart = useRef({ mouseX: 0, mouseY: 0, panX: 0, panY: 0 });

    // Propagate changes up
    useEffect(() => {
        onChange({ ...data, items });
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [items]);

    // ── Image upload ──────────────────────────────────────────────────────────
    const { upload } = useCanvasImageUpload(publicKey, userId, imageBlobCache);

    const handleImageDrop = useCallback(async (e: React.DragEvent) => {
        e.preventDefault();
        const files = Array.from(e.dataTransfer.items ?? [])
            .map(i => i.getAsFile())
            .filter((f): f is File => !!f && f.type.startsWith('image/'));
        if (!files.length) return;

        const viewport = viewportRef.current;
        if (!viewport) return;
        const vr = viewport.getBoundingClientRect();
        const canvasX = (e.clientX - vr.left - pan.x) / zoom;
        const canvasY = (e.clientY - vr.top - pan.y) / zoom;

        for (const file of files) {
            await upload(
                file,
                (pid) => setItems(prev => [...prev, {
                    id: pid, type: 'image', x: canvasX, y: canvasY,
                    width: 300, zIndex: 1,
                    blobId: '__pending__', encryptedKey: '', iv: '', mimeType: file.type,
                } as CanvasImageItem]),
                (pid, result) => setItems(prev => prev.map(it =>
                    it.id === pid ? { ...result, x: canvasX, y: canvasY, zIndex: 1 } as CanvasImageItem : it
                )),
                (pid) => setItems(prev => prev.filter(it => it.id !== pid)),
            );
        }
    }, [upload, pan, zoom]);

    useEffect(() => {
        const handlePaste = async (e: ClipboardEvent) => {
            if (!e.clipboardData) return;
            const files: File[] = [];
            for (const item of Array.from(e.clipboardData.items)) {
                const f = item.getAsFile();
                if (f?.type.startsWith('image/')) files.push(f);
            }
            if (!files.length) return;
            e.preventDefault();
            const cx = CANVAS_W / 2;
            const cy = CANVAS_H / 2;
            for (const file of files) {
                await upload(
                    file,
                    (pid) => setItems(prev => [...prev, {
                        id: pid, type: 'image', x: cx, y: cy,
                        width: 300, zIndex: 1,
                        blobId: '__pending__', encryptedKey: '', iv: '', mimeType: file.type,
                    } as CanvasImageItem]),
                    (pid, result) => setItems(prev => prev.map(it =>
                        it.id === pid ? { ...result, x: cx, y: cy, zIndex: 1 } as CanvasImageItem : it
                    )),
                    (pid) => setItems(prev => prev.filter(it => it.id !== pid)),
                );
            }
        };
        window.addEventListener('paste', handlePaste);
        return () => window.removeEventListener('paste', handlePaste);
    }, [upload]);

    // ── Click on empty canvas → new text box ─────────────────────────────────
    const handleCanvasClick = useCallback((e: React.MouseEvent) => {
        if (e.target !== worldRef.current) return; // nur Klicks direkt auf Canvas, nicht auf Items
        if (isEditingId) { setIsEditingId(null); return; }
        const viewport = viewportRef.current;
        if (!viewport) return;
        const vr = viewport.getBoundingClientRect();
        const x = (e.clientX - vr.left - pan.x) / zoom;
        const y = (e.clientY - vr.top - pan.y) / zoom;
        const newId = crypto.randomUUID();
        const newItem: CanvasTextItem = {
            id: newId, type: 'text', x, y,
            width: 200, zIndex: 1, content: '',
        };
        setItems(prev => [...prev, newItem]);
        setIsEditingId(newId);
    }, [isEditingId, pan, zoom]);

    // ── Zoom via wheel ────────────────────────────────────────────────────────
    const handleWheel = useCallback((e: WheelEvent) => {
        e.preventDefault();
        const viewport = viewportRef.current;
        if (!viewport) return;
        const vr = viewport.getBoundingClientRect();
        const mouseX = e.clientX - vr.left;
        const mouseY = e.clientY - vr.top;

        const delta = -e.deltaY * 0.001;
        setZoom(prev => {
            const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, prev + delta * prev));
            // Zoom around mouse position
            setPan(p => ({
                x: mouseX - (mouseX - p.x) * (next / prev),
                y: mouseY - (mouseY - p.y) * (next / prev),
            }));
            return next;
        });
    }, []);

    useEffect(() => {
        const viewport = viewportRef.current;
        if (!viewport) return;
        viewport.addEventListener('wheel', handleWheel, { passive: false });
        return () => viewport.removeEventListener('wheel', handleWheel);
    }, [handleWheel]);

    // ── Pan via middle mouse or Space+drag ────────────────────────────────────
    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        if (e.button === 1 || (e.button === 0 && e.target === worldRef.current && false)) {
            // Middle mouse: pan
            isPanning.current = true;
            panStart.current = { mouseX: e.clientX, mouseY: e.clientY, panX: pan.x, panY: pan.y };
            e.preventDefault();
        }
    }, [pan]);

    useEffect(() => {
        const onMove = (e: MouseEvent) => {
            if (!isPanning.current) return;
            const dx = e.clientX - panStart.current.mouseX;
            const dy = e.clientY - panStart.current.mouseY;
            setPan({ x: panStart.current.panX + dx, y: panStart.current.panY + dy });
        };
        const onUp = () => { isPanning.current = false; };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
        return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
    }, []);

    // ── Item operations ───────────────────────────────────────────────────────
    const handleUpdate = useCallback((id: string, updates: Partial<CanvasNoteItem>) => {
        setItems(prev => prev.map(it => it.id === id ? { ...it, ...updates } as CanvasNoteItem : it));
    }, []);

    const handleRemove = useCallback((id: string) => {
        setItems(prev => prev.filter(it => it.id !== id));
        if (isEditingId === id) setIsEditingId(null);
    }, [isEditingId]);

    const handleMoveEnd = useCallback((id: string, x: number, y: number) => {
        setItems(prev => prev.map(it => it.id === id ? { ...it, x, y } : it));
    }, []);

    // ── Render ────────────────────────────────────────────────────────────────
    return (
        <div
            ref={viewportRef}
            className="relative w-full h-full overflow-hidden bg-[var(--bg-page,#f8f8f8)] select-none"
            onDrop={handleImageDrop}
            onDragOver={(e) => e.preventDefault()}
            onMouseDown={handleMouseDown}
        >
            {/* Canvas world */}
            <div
                ref={worldRef}
                className="absolute"
                style={{
                    width: CANVAS_W,
                    height: CANVAS_H,
                    transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                    transformOrigin: '0 0',
                    backgroundImage: `radial-gradient(circle, #d1d5db 1px, transparent 1px)`,
                    backgroundSize: `${GRID_SIZE}px ${GRID_SIZE}px`,
                }}
                onClick={handleCanvasClick}
            >
                {items.map(item => (
                    <CanvasNoteItemComponent
                        key={item.id}
                        item={item}
                        zoom={zoom}
                        privateKey={privateKey}
                        imageBlobCache={imageBlobCache}
                        isEditingId={isEditingId}
                        onStartEdit={setIsEditingId}
                        onUpdate={handleUpdate}
                        onRemove={handleRemove}
                        onMoveEnd={handleMoveEnd}
                    />
                ))}
            </div>

            {/* Zoom controls */}
            <div className="absolute bottom-4 right-4 flex items-center gap-1 bg-white/90 dark:bg-gray-900/90 border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1 shadow-sm z-10">
                <button onClick={() => setZoom(z => Math.max(MIN_ZOOM, z - 0.1))} className="p-1 hover:bg-gray-100 rounded transition-colors">
                    <ZoomOut size={14} className="text-gray-500" />
                </button>
                <span className="text-xs text-gray-500 w-10 text-center">{Math.round(zoom * 100)}%</span>
                <button onClick={() => setZoom(z => Math.min(MAX_ZOOM, z + 0.1))} className="p-1 hover:bg-gray-100 rounded transition-colors">
                    <ZoomIn size={14} className="text-gray-500" />
                </button>
            </div>
        </div>
    );
}
```

- [ ] **Step 2: Commit**

```
git add web/src/components/Canvas/CanvasNoteEditor.tsx
git commit -m "feat: add CanvasNoteEditor with text boxes, images, zoom, pan"
```

---

## Task 9: Canvas Note erstellen — `useDataStore` erweitern

**Files:**
- Modify: `web/src/store/useDataStore.ts`

- [ ] **Step 1: `createCanvasNote` zur Store-Interface hinzufügen**

In `useDataStore.ts`, suche das Interface (wo `createNote` definiert ist) und füge hinzu:

```typescript
createCanvasNote: (title: string) => Promise<string>;
```

- [ ] **Step 2: Implementierung hinzufügen**

Nach der `createNote` Implementierung, füge `createCanvasNote` hinzu:

```typescript
createCanvasNote: async (title: string) => {
    const state = get();
    if (!state.privateKey || !state.publicKey) {
        const fallbackId = crypto.randomUUID();
        set(s => ({ notes: [...s.notes, { id: fallbackId, title, type: 'canvas' }] }));
        return fallbackId;
    }
    try {
        const cryptoV2 = await import('@/lib/cryptoV2');
        const cryptoLib = await import('@/lib/crypto');

        const emptyCanvas = JSON.stringify({
            version: 1,
            noteId: 'placeholder', // wird nach dem PUT ersetzt
            canvasWidth: 4000,
            canvasHeight: 3000,
            items: [],
        });

        const v2Result = await cryptoV2.encryptFileV2(emptyCanvas, state.publicKey);
        const accessKeysMap = { [state.myId!]: v2Result.encrypted_dek };
        const securedMeta = await cryptoLib.encryptMetadata({ title }, state.publicKey);

        const res = await apiFetch('/api/v1/files', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                type: 'canvas',
                parent_id: state.activeParentId || null,
                size: new Blob([v2Result.content_ciphertext]).size,
                public_meta: {},
                secured_meta: securedMeta,
                visibility: 'private',
                version: 2,
                metadata: v2Result.metadata,
                access_keys: accessKeysMap,
            }),
        });
        if (!res.ok) throw new Error('Backend failed to create canvas note');
        const newFile = await res.json();

        await apiFetch(`/api/v1/files/${newFile.id}/upload`, {
            method: 'POST',
            body: v2Result.content_ciphertext,
        });

        const newNote = { id: newFile.id, title, type: 'canvas', parent_id: state.activeParentId || null };
        set(s => ({ notes: [...s.notes, newNote], metadataCache: { ...s.metadataCache, [newFile.id]: { title } } }));
        return newFile.id;
    } catch (e) {
        console.error('Failed to create canvas note on server', e);
        const fallbackId = crypto.randomUUID();
        set(s => ({ notes: [...s.notes, { id: fallbackId, title, type: 'canvas' }] }));
        return fallbackId;
    }
},
```

- [ ] **Step 3: Commit**

```
git add web/src/store/useDataStore.ts
git commit -m "feat: add createCanvasNote to data store"
```

---

## Task 10: Canvas Note in Sidebar einbinden

**Files:**
- Modify: `web/src/components/Layout/Sidebar.tsx`

- [ ] **Step 1: `FileItem` Canvas-Icon hinzufügen**

In `Sidebar.tsx`, importiere `Layout` aus lucide-react (falls noch nicht vorhanden durch Task 3 Step 5).

In der `FileItem`-Komponente, suche die Icon-Zeile:

```tsx
{file.title.startsWith('#') ? <Lock size={15} .../> : <FileText size={15} .../>}
```

Ersetze durch:

```tsx
{file.title.startsWith('#')
    ? <Lock size={15} className="shrink-0 text-gray-400" />
    : file.type === 'canvas'
        ? <Layout size={15} className="shrink-0 text-teal-400" />
        : <FileText size={15} className="shrink-0 text-gray-400" />}
```

- [ ] **Step 2: `onNewCanvasNote` in `SidebarProps` verdrahten** (der Prop wurde in Task 3 bereits definiert — jetzt wird er in `page.tsx` befüllt, was in Task 11 erfolgt).

- [ ] **Step 3: Commit**

```
git add web/src/components/Layout/Sidebar.tsx
git commit -m "feat: show teal Layout icon for canvas notes in sidebar"
```

---

## Task 11: Canvas Note in `page.tsx` integrieren

**Files:**
- Modify: `web/src/app/page.tsx`

- [ ] **Step 1: `CanvasNoteEditor` dynamisch importieren**

Füge neben dem anderen `dynamic()`-Import hinzu:

```typescript
const CanvasNoteEditor = dynamic(() => import('@/components/Canvas/CanvasNoteEditor'), { ssr: false });
```

- [ ] **Step 2: `canvasNoteData`-State hinzufügen**

```typescript
const [canvasNoteData, setCanvasNoteData] = useState<import('@/types/canvasNote').CanvasNoteData | null>(null);
```

- [ ] **Step 3: Canvas-Notiz in `loadNoteContent` erkennen und routen**

Am Ende von `loadNoteContent`, nach `contentText` gesetzt wurde, füge vor `setEditorContent(parsed)` ein:

```typescript
// Detect canvas note content
if (contentText) {
    try {
        const parsed = JSON.parse(contentText);
        if (parsed?.version === 1 && Array.isArray(parsed?.items) && typeof parsed?.canvasWidth === 'number') {
            // Canvas note
            setCanvasNoteData(parsed);
            setEditorContent(null);
            return; // skip setEditorContent below
        }
        setEditorContent(parsed);
        ...
```

Alternativ: prüfe den File-Typ aus dem Store BEVOR der Inhalt geladen wird, um frühzeitig zu routen. Beide Ansätze funktionieren; die Content-Prüfung ist robuster.

- [ ] **Step 4: `handleNewCanvasNote` Funktion hinzufügen**

```typescript
const handleNewCanvasNote = async () => {
    const title = 'Neue Leinwand';
    const newId = await useDataStore.getState().createCanvasNote(title);
    useDataStore.getState().fetchDirectory(null, true);
    switchTab(newId, 'file', title);
};
```

- [ ] **Step 5: Canvas-Note-Render in den Editor-Slot einsetzen**

An beiden Stellen in `page.tsx` wo `<Editor key={...} />` gerendert wird, füge eine Condition davor ein:

```tsx
{/* Determine active note type */}
{(() => {
    const activeFile = files.find(f => f.id === activeNoteId) || 
                       useDataStore.getState().notes.find(f => f.id === activeNoteId);
    const isCanvas = activeFile?.type === 'canvas';

    if (isCanvas) {
        return (
            <div className="flex-1 h-full overflow-hidden">
                <CanvasNoteEditor
                    noteId={activeNoteId || ''}
                    initialData={canvasNoteData}
                    publicKey={publicKey}
                    privateKey={privateKey}
                    userId={myId}
                    onChange={(data) => {
                        setCanvasNoteData(data);
                        setSaveStatus('unsaved');
                        // Debounce save via existing mechanism:
                        // store data as editorContent-like trigger
                        // Canvas data stored as JSON string
                    }}
                />
            </div>
        );
    }
    return <Editor key={activeTabId} ... />;
})()}
```

- [ ] **Step 6: Canvas-Save in `triggerSave` unterstützen**

`performSave` erwartet `content` als JSON (TipTap oder CanvasNoteData). Da `CanvasNoteData` auch ein serialisierbares Objekt ist, funktioniert `performSave` unverändert. Einzige Anpassung: das `initialContentRef.current`-Tracking (das verhindert, dass der initiale Content als "geändert" gilt). Beim Laden einer Canvas-Notiz muss `initialContentRef.current = canvasNoteDataJson` gesetzt werden.

Konkret: am Ende von `loadNoteContent`, wo Canvas-Daten gesetzt werden:

```typescript
setCanvasNoteData(parsed);
initialContentRef.current = parsed; // für Change-Detection
setEditorContent(null);
return;
```

Der `onChange`-Callback in `CanvasNoteEditor` setzt `saveStatus = 'unsaved'`, was den bestehenden Debounce-Timer auslöst. Der Debounce ruft dann `triggerSave(activeNoteId, activeFileKey, canvasNoteData)` auf. Dafür muss der Debounce-Effect `canvasNoteData` als Content-Quelle kennen:

```typescript
// Existing debounce effect (ca. Zeile 454):
useEffect(() => {
    if (saveStatus !== 'unsaved') return;
    const content = editorContent ?? canvasNoteData;
    if (!content) return;
    ...
    saveTimerRef.current = setTimeout(() => {
        triggerSave(activeNoteId, activeFileKey, content);
    }, 3000);
}, [saveStatus, editorContent, canvasNoteData]);
```

- [ ] **Step 7: `onNewCanvasNote` Prop an Sidebar übergeben**

```tsx
<Sidebar
    ...
    onNewCanvasNote={handleNewCanvasNote}
/>
```

- [ ] **Step 8: Commit**

```
git add web/src/app/page.tsx
git commit -m "feat: integrate CanvasNoteEditor into page.tsx, canvas notes save/load"
```

---

## Task 12: Bug A — Image-Lade-Fehler besser loggen

**Files:**
- Modify: `web/src/components/Canvas/CanvasElement.tsx:218`

Kurzfristig: besseres Error-Logging damit wir sehen warum das Laden fehlschlägt.

- [ ] **Step 1: HTTP-Status im Error-State speichern**

In `ImageWidget` in `CanvasElement.tsx`, suche:

```typescript
const res = await apiFetch(`/api/v1/files/${element.blobId}/download`);
if (!res.ok) throw new Error(`HTTP ${res.status}`);
```

Ersetze durch:

```typescript
const res = await apiFetch(`/api/v1/files/${element.blobId}/download`);
if (!res.ok) {
    const msg = `HTTP ${res.status} for blob ${element.blobId}`;
    console.error('[Canvas] Image download failed:', msg);
    if (!cancelled) { setError(true); setErrorMsg(msg); setLoading(false); }
    return;
}
```

Füge `const [errorMsg, setErrorMsg] = useState<string | null>(null)` hinzu.

Im Error-State:
```tsx
if (error || !src) return (
    <div ...>
        Bild konnte nicht geladen werden
        {errorMsg && <span className="block text-[10px] opacity-50 mt-1">{errorMsg}</span>}
    </div>
);
```

Dasselbe für `CanvasNoteItem.tsx`'s `ImageWidget` — gleiche Änderung dort einfügen.

- [ ] **Step 2: Commit**

```
git add web/src/components/Canvas/CanvasElement.tsx web/src/components/Canvas/CanvasNoteItem.tsx
git commit -m "fix: log HTTP status for image download failures (Bug A diagnostic)"
```

---

## Self-Review

**Spec coverage:**
- [x] Sidebar: Buttons entfernen (Task 3)
- [x] Avatar rechts mit Dropdown (Task 4)
- [x] Calendar entfällt (Task 3 — Button entfernt)
- [x] Social im Avatar-Dropdown (Task 4)
- [x] Canvas als eigener Typ (Task 5, 9)
- [x] Klicken → Textbox erstellen (Task 8: `handleCanvasClick`)
- [x] Bestehenden Text anklicken → Edit-Modus (Task 7: `onDoubleClick`, `isEditingId`)
- [x] Textboxen verschieben (Task 7: `onMouseDown` Drag)
- [x] Bilder per Drop/Paste (Task 8: `handleImageDrop`, paste handler)
- [x] Zoom (Task 8: `handleWheel`, Zoom-Controls)
- [x] 3–4× größer als Notiz (4000×3000px, Task 8)
- [x] Kein Markdown (separates CanvasNoteData JSON, Task 5)
- [x] Canvas-Icon in Sidebar (Task 10)
- [x] Erstellen über Rechtsklick-Menü (Task 3 + Task 11)
- [x] Bug A: Logging (Task 12)
- [x] Bug B: Race Condition Fix (Task 2)
- [x] Bug C: DragLeave Fix (Task 1)

**Offen:** Bug A Backend-Ursache (ob Cleanup-Job Canvas-Bilder löscht) kann erst nach Deployment mit dem neuen Logging-Code untersucht werden. Kein Placeholder — explizit als diagnostischer Schritt dokumentiert.
