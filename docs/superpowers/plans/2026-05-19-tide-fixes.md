# Tide — Bug Fixes & UI Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 6 issues: PWA theme color, sidebar drag/drop, @-mention timing, social tab inline layout, iMessage-style chat bubbles, and data-package card redesign.

**Architecture:** All changes are isolated to existing files. No new components except minor expansions of PartnerProfileHeader. No shared state changes — each fix is self-contained.

**Tech Stack:** Next.js 14, TypeScript, Tailwind CSS, Framer Motion, Zustand, TipTap

---

## File Map

| File | What changes |
|------|-------------|
| `web/src/app/layout.tsx` | themeColor → `#FFFFFF` |
| `web/public/manifest.json` | theme_color + background_color → `#FFFFFF` |
| `web/src/components/Layout/Sidebar.tsx` | Drop indicator rewrite, dragEnd, auto-scroll, p-1.5 |
| `web/src/app/page.tsx` | Call `loadAllMetadata()` unconditionally on startup |
| `web/src/components/Social/SocialHub.tsx` | Contact click → setIsChatMode(true), layoutId animation, back button |
| `web/src/components/Chat/PartnerProfileHeader.tsx` | Expanded view with public files, click-to-toggle |
| `web/src/components/Chat/ChatPanel.tsx` | iMessage bubbles + data-package card redesign |

---

## Task 1: PWA Theme Color

**Files:**
- Modify: `web/src/app/layout.tsx:7-9`
- Modify: `web/public/manifest.json`

- [ ] **Step 1: Update layout.tsx viewport**

In `web/src/app/layout.tsx`, change:
```ts
export const viewport = {
  themeColor: "#FFFFFF",
};
```

Also update `appleWebApp.statusBarStyle` — it already says `"default"` which is correct (dark text on white bar). No change needed there.

- [ ] **Step 2: Update manifest.json**

Replace the full contents of `web/public/manifest.json` with:
```json
{
  "name": "Tide",
  "short_name": "Tide",
  "description": "Minimalist. Local-First. Encrypted. Notes & Calendar.",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#FFFFFF",
  "theme_color": "#FFFFFF",
  "orientation": "portrait",
  "icons": [
    {
      "src": "/favicon.png",
      "sizes": "192x192",
      "type": "image/png"
    },
    {
      "src": "/favicon.png",
      "sizes": "512x512",
      "type": "image/png"
    }
  ]
}
```

- [ ] **Step 3: Verify**

Open the app in Chrome on Android (or use Chrome DevTools → Application → Manifest). Confirm `theme_color` shows `#ffffff`. On iOS PWA the status bar area should now be white.

---

## Task 2: Sidebar — Drop Indicator Rewrite (No Layout Shift)

**Files:**
- Modify: `web/src/components/Layout/Sidebar.tsx`

**Problem:** The current 40px animated `<motion.div>` drop zones insert into document flow, shifting item bounding boxes and triggering onDragLeave → flicker loop.

**Fix:** Use CSS border highlights on the target item itself instead of inserting elements. No layout shift, no hit-box movement.

- [ ] **Step 1: Remove the 40px drop-zone elements**

In `Sidebar.tsx`, find the `orderedItems.map(...)` block. Remove these two blocks that appear inside each `<motion.div>`:

```tsx
// REMOVE this block (top indicator):
{dropIndicator?.id === item.id && dropIndicator.zone === 'top' && (
    <motion.div layout initial={{ height: 0 }} animate={{ height: 40 }} className="bg-blue-50/50 rounded-lg border-2 border-dashed border-blue-300" />
)}

// REMOVE this block (bottom indicator):
{dropIndicator?.id === item.id && dropIndicator.zone === 'bottom' && (
    <motion.div layout initial={{ height: 0 }} animate={{ height: 40 }} className="bg-blue-50/50 rounded-lg border-2 border-dashed border-blue-300 mt-1" />
)}
```

- [ ] **Step 2: Add border-based indicator to each draggable motion.div wrapper**

Each top-level item in `orderedItems.map(...)` is wrapped in a `<motion.div layout key={item.id} ...>`. Add a dynamic `className` to this wrapper based on `dropIndicator`:

```tsx
<motion.div
    layout
    key={item.id}
    transition={{ layout: { type: 'spring', stiffness: 350, damping: 40, mass: 0.8 } }}
    className={
        dropIndicator?.id === item.id && dropIndicator.zone === 'top'
            ? 'border-t-2 border-blue-400 rounded-t'
            : dropIndicator?.id === item.id && dropIndicator.zone === 'bottom'
            ? 'border-b-2 border-blue-400 rounded-b'
            : ''
    }
    onDragOver={(e: React.DragEvent) => {
        // ... existing code unchanged ...
    }}
    // ... rest of props unchanged ...
>
```

The `ring-2 ring-blue-500 bg-blue-50/50 rounded-lg` for the `middle` (folder drop) zone is already handled inline on the FolderItem wrapper — leave that as-is.

- [ ] **Step 3: Verify**

Run `cd web && npm run dev`. Drag a note. Confirm:
- Thin blue top/bottom border appears on target item (no flickering)
- No items shift position during drag
- Blue ring appears on folders when hovering over middle zone

---

## Task 3: Sidebar — DragEnd Handler + Auto-Scroll

**Files:**
- Modify: `web/src/components/Layout/Sidebar.tsx`

- [ ] **Step 1: Add scrollContainerRef and scrollInterval ref**

At the top of the `Sidebar` component function (alongside existing `useRef` declarations), add:

```tsx
const scrollContainerRef = useRef<HTMLDivElement>(null);
const scrollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

const clearScrollInterval = () => {
    if (scrollIntervalRef.current !== null) {
        clearInterval(scrollIntervalRef.current);
        scrollIntervalRef.current = null;
    }
};
```

- [ ] **Step 2: Attach ref to the scrollable notes container**

Find the `overflow-y-auto` div that wraps the notes list (it has `style={{ flex: '1 1 0', minHeight: 0, paddingBottom: '32px' }}`). Add `ref={scrollContainerRef}` and the following event handlers:

```tsx
<div
    ref={scrollContainerRef}
    className="overflow-y-auto overflow-x-visible px-2 no-scrollbar"
    style={{ flex: '1 1 0', minHeight: 0, paddingBottom: '32px' }}
    onDragOver={(e) => {
        e.preventDefault();
        const container = scrollContainerRef.current;
        if (!container) return;
        const rect = container.getBoundingClientRect();
        const ZONE = 60;
        const SPEED = 6;
        if (e.clientY < rect.top + ZONE) {
            if (scrollIntervalRef.current === null) {
                scrollIntervalRef.current = setInterval(() => container.scrollBy(0, -SPEED), 16);
            }
        } else if (e.clientY > rect.bottom - ZONE) {
            if (scrollIntervalRef.current === null) {
                scrollIntervalRef.current = setInterval(() => container.scrollBy(0, SPEED), 16);
            }
        } else {
            clearScrollInterval();
        }
    }}
    onDragLeave={(e) => {
        const container = scrollContainerRef.current;
        if (!container || !container.contains(e.relatedTarget as Node)) {
            clearScrollInterval();
        }
    }}
    onDrop={(e) => {
        clearScrollInterval();
        // existing drop handler content below:
        e.preventDefault();
        const id = e.dataTransfer.getData("text/plain");
        if (id && e.target === e.currentTarget) {
            onMoveItem?.(id, null);
        }
        setDropIndicator(null);
    }}
    // keep remaining existing handlers (onDoubleClick, onContextMenu)
    onDoubleClick={(e) => {
        if (e.target === e.currentTarget) onNewNote();
    }}
    onContextMenu={(e) => {
        if (e.target === e.currentTarget) {
            e.preventDefault();
            setSidebarContextMenu({ x: e.clientX, y: e.clientY });
        }
    }}
>
```

- [ ] **Step 3: Add onDragEnd to clear indicator on cancel**

Add a `useEffect` that listens for the global `dragend` event (fires when any drag ends, including cancelled ones):

```tsx
useEffect(() => {
    const handleDragEnd = () => {
        setDropIndicator(null);
        clearScrollInterval();
    };
    document.addEventListener('dragend', handleDragEnd);
    return () => document.removeEventListener('dragend', handleDragEnd);
}, []);
```

Place this `useEffect` near the other `useEffect` calls in the `Sidebar` component (after the profile-load effect).

- [ ] **Step 4: Verify**

Run the dev server. Test:
1. Drag a note near the top edge of the sidebar → list scrolls up automatically
2. Drag near the bottom edge → list scrolls down
3. Press Escape during drag → drop indicator disappears immediately
4. Drop outside any item → drop indicator disappears

---

## Task 4: Sidebar — Item Spacing

**Files:**
- Modify: `web/src/components/Layout/Sidebar.tsx`

- [ ] **Step 1: Reduce FileItem padding**

In the `FileItem` component's `motion.div`, change `p-2` to `p-1.5`:

```tsx
// Find this className (around line 813):
className={`group flex items-center justify-between p-2 rounded-lg cursor-pointer transition-all duration-200
```
Change to:
```tsx
className={`group flex items-center justify-between p-1.5 rounded-lg cursor-pointer transition-all duration-200
```

- [ ] **Step 2: Reduce FolderItem padding**

In the `FolderItem` component's `motion.div`, change `p-2` to `p-1.5`:

```tsx
// Find this className (around line 918):
className={`group flex items-center justify-between p-2 rounded-lg cursor-pointer transition-all duration-200 hover:bg-[var(--hover-bg)] interactive-hover`}
```
Change to:
```tsx
className={`group flex items-center justify-between p-1.5 rounded-lg cursor-pointer transition-all duration-200 hover:bg-[var(--hover-bg)] interactive-hover`}
```

- [ ] **Step 3: Verify**

Reload the app. Confirm the sidebar shows ~20% more items in the same vertical space.

---

## Task 5: "@" Mention — Eager loadAllMetadata

**Files:**
- Modify: `web/src/app/page.tsx`

**Problem:** `loadAllMetadata()` is only called when the search index is empty. Returning users who have a cached search index never get `state.notes` populated with subfolder notes. When they type `@`, only root-level notes appear.

- [ ] **Step 1: Add unconditional loadAllMetadata call**

In `page.tsx`, find the "Data Load Effect" `useEffect` (around line 1277). After `fetchDirectory(null, true)`, add:

```tsx
useEffect(() => {
    if (privateKey && publicKey && myId) {
        setKeys(privateKey, publicKey, myId);
        fetchDirectory(null, true);

        // Eagerly load all note metadata so @-mentions find notes in subfolders
        useDataStore.getState().loadAllMetadata().catch(console.error);

        import('@/lib/searchIndex').then(({ loadSearchIndex, rebuildIndex }) => {
            // ... existing code unchanged ...
        });
    }
}, [privateKey, publicKey, myId, setKeys, fetchDirectory]);
```

- [ ] **Step 2: Verify**

1. Create a note inside a folder (e.g. "Projekt" → "Aufgaben")
2. Reload the page
3. Open any note, type `@Auf`
4. Confirm "Aufgaben" appears in the suggestion list (not just "Create File 'Auf'")

---

## Task 6: Social Hub — Contact Click → Auto Chat Mode

**Files:**
- Modify: `web/src/components/Social/SocialHub.tsx`

**Changes:**
1. In the non-chat-mode contact list (both compact and non-compact views), clicking a contact now sets `isChatMode(true)` as well.
2. Remove the `activeChatPartner && !isChatMode` full-screen popup branch (non-compact only).
3. Add a back button in the chat-mode left column.

- [ ] **Step 1: Update contact click handlers in the non-compact contacts grid**

In `SocialHub.tsx`, find the "My Contacts" section inside the non-compact `!isChatMode` branch (around line 711). The `onClick` handler currently only sets `activeChatPartner`. Change it:

```tsx
onClick={() => {
    setActiveChatPartner({
        id: c.partner.id,
        username: c.partner.username,
        email: c.partner.email,
        public_key: c.partner.public_key,
        avatar_seed: c.partner.avatar_seed,
        avatar_salt: c.partner.avatar_salt,
        avatar_style: c.partner.avatar_style
    });
    setProfileExpanded(true);
    setIsChatMode(true);
}}
```

- [ ] **Step 2: Remove the standalone chat popup branch**

In the non-compact `!isChatMode` section, find the ternary that renders a full-screen chat when `activeChatPartner` is set (the `activeChatPartner ? <div className="... h-[600px] ..."> ... </div> : <div>` block around line 579). Replace it so it only ever renders the contacts content (no popup):

Find:
```tsx
) : activeChatPartner ? (
    <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 bg-white dark:bg-[#1a1c1e] border border-gray-100 dark:border-white/10 rounded-[2.5rem] overflow-hidden h-[600px] flex flex-col shadow-xl relative">
        <button
            onClick={() => setActiveChatPartner(null)}
            className="absolute top-4 left-4 z-50 p-2 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 rounded-xl transition-colors"
        >
            <X className="w-5 h-5 text-gray-700 dark:text-gray-300" />
        </button>
        <ChatPanel
            privateKey={privateKey}
            onOpenFile={onOpenFile}
            onOpenCalendar={onOpenCalendar}
            onOpenProfile={onOpenProfile}
            onFileCreated={() => {}}
            activePartner={activeChatPartner}
            onChatSelect={() => {}}
        />
    </div>
) : (
```

Replace with just:
```tsx
) : (
```

(The `activeChatPartner` state will now trigger `isChatMode=true` instead of showing a popup.)

- [ ] **Step 3: Add a back button in the chat-mode left column**

In the `isChatMode` branch, find the left column div (the one with `className="w-80 shrink-0 flex flex-col border-r ..."`). Inside it, above the search form, add a back button:

```tsx
{/* Back button */}
<div className="px-3 pt-3 pb-1 shrink-0">
    <button
        onClick={() => { setIsChatMode(false); setActiveChatPartner(null); }}
        className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
    >
        <ChevronLeft size={16} />
        <span className="font-medium">Zurück</span>
    </button>
</div>
```

Add `ChevronLeft` to the import from `lucide-react` at the top of the file.

- [ ] **Step 4: Verify**

1. Open the Social tab. Contacts show in grid/list view.
2. Click a contact → layout switches to 3-column (left: contact list, right: profile+chat).
3. Click "← Zurück" → returns to grid view.
4. The MessageSquare toggle button still works as before.

---

## Task 7: Social Hub — Framer Motion Grid-to-List Animation

**Files:**
- Modify: `web/src/components/Social/SocialHub.tsx`

**Goal:** Contacts animate from their grid position into the left-column list when chat mode activates.

- [ ] **Step 1: Add LayoutGroup import**

Ensure `LayoutGroup` is imported from `framer-motion`. Add at the top of `SocialHub.tsx`:

```tsx
import { motion, AnimatePresence, LayoutGroup } from 'framer-motion';
```

- [ ] **Step 2: Wrap the whole component return in a LayoutGroup**

In `SocialHub.tsx`, the outermost returned `<div>` — wrap it with `<LayoutGroup>`:

```tsx
return (
    <LayoutGroup>
        <div className={isChatMode ? 'flex h-full overflow-hidden' : ...}>
            {/* existing content */}
        </div>
    </LayoutGroup>
);
```

- [ ] **Step 3: Add layoutId to contacts in the non-chat-mode "My Contacts" list**

In the non-compact, non-chat-mode "My Contacts" section, wrap each contact `<div>` with a `motion.div`:

```tsx
{contacts.map((c, i) => (
    <motion.div key={c.partner.id} layoutId={`contact-${c.partner.id}`}>
        <div
            onClick={() => {
                setActiveChatPartner({ ... });
                setProfileExpanded(true);
                setIsChatMode(true);
            }}
            className="bg-white dark:bg-white/5 border border-gray-100 ... rounded-2xl p-4 flex items-center gap-4 ..."
        >
            {/* existing card content */}
        </div>
    </motion.div>
))}
```

- [ ] **Step 4: Add layoutId to contacts in the chat-mode left column**

In the `isChatMode` branch, contacts list (around line 220), wrap each contact `<button>` with `motion.div` using the same `layoutId` pattern:

```tsx
{contacts.map((c, i) => {
    const isActive = activeChatPartner?.id === c.partner.id;
    return (
        <motion.div key={c.partner.id} layoutId={`contact-${c.partner.id}`}>
            <button
                onClick={() => {
                    setActiveChatPartner({
                        id: c.partner.id,
                        username: c.partner.username,
                        email: c.partner.email,
                        public_key: c.partner.public_key,
                        avatar_seed: c.partner.avatar_seed,
                        avatar_salt: c.partner.avatar_salt,
                        avatar_style: c.partner.avatar_style
                    });
                    setProfileExpanded(true);
                }}
                className={`w-full flex items-center gap-3 p-2.5 rounded-xl transition-colors text-left ${isActive ? 'bg-indigo-50 dark:bg-indigo-900/20 ring-1 ring-indigo-200 dark:ring-indigo-700' : 'hover:bg-gray-100 dark:hover:bg-white/5'}`}
            >
                <Avatar ... />
                <span ...>{c.partner.username}</span>
            </button>
        </motion.div>
    );
})}
```

- [ ] **Step 5: Verify**

Click a contact in grid view → contacts animate (slide/scale) from their grid positions into the left column. The animation should be smooth (~300ms).

---

## Task 8: PartnerProfileHeader — Expanded Content with Public Files

**Files:**
- Modify: `web/src/components/Chat/PartnerProfileHeader.tsx`
- Modify: `web/src/components/Social/SocialHub.tsx` (add `onToggleProfile` prop call)

- [ ] **Step 1: Add state for lazy-loaded data and hasFetched flag**

In `PartnerProfileHeader.tsx`, add these state variables after the existing `details` state:

```tsx
const [publicFiles, setPublicFiles] = useState<Array<{ id: string; title: string; type: string }>>([]);
const [hasFetched, setHasFetched] = useState(false);
```

Also reset when partner changes:
```tsx
useEffect(() => {
    setDetails(null);
    setPublicFiles([]);
    setHasFetched(false);
    apiFetch(`/api/v1/profiles/${partner.id}`)
        .then(r => r.ok ? r.json() : null)
        .then(d => { if (d) setDetails({ bio: d.bio, title: d.title, is_verified: d.is_verified }); })
        .catch(() => {});
}, [partner.id]);
```

- [ ] **Step 2: Fetch public files when expanded for the first time**

Add a separate `useEffect` that triggers on `expanded`:

```tsx
useEffect(() => {
    if (expanded && !hasFetched) {
        setHasFetched(true);
        apiFetch(`/api/v1/files/public/${partner.id}`)
            .then(r => r.ok ? r.json() : [])
            .then((data: any[]) => {
                if (!Array.isArray(data)) return;
                setPublicFiles(
                    data.slice(0, 5).map(f => ({
                        id: f.id,
                        title: (typeof f.public_meta === 'object' ? f.public_meta?.title : null) || f.title || 'Untitled',
                        type: f.type || 'note',
                    }))
                );
            })
            .catch(() => {});
    }
}, [expanded, hasFetched, partner.id]);
```

- [ ] **Step 3: Add onToggle prop and click handler**

Update the component's interface and add a click-to-toggle to the compact row:

```tsx
interface PartnerProfileHeaderProps {
    partner: Partner;
    expanded: boolean;
    onOpenProfile: (userId: string, username: string) => void;
    onToggle?: () => void;
}

export default function PartnerProfileHeader({ partner, expanded, onOpenProfile, onToggle }: PartnerProfileHeaderProps) {
```

On the compact row `div`, add `onClick={onToggle} className="... cursor-pointer"`:

```tsx
<div
    className="flex items-center gap-3 px-4 h-14 shrink-0 cursor-pointer hover:bg-gray-50 dark:hover:bg-white/5 transition-colors"
    onClick={onToggle}
>
```

- [ ] **Step 4: Expand maxHeight and add public files section**

Change `maxHeight: expanded ? '200px' : '56px'` to `maxHeight: expanded ? '360px' : '56px'`.

Update the expanded content section:

```tsx
{/* Expanded extra content */}
<div className="px-4 pb-4 flex flex-col gap-3">
    <div className="flex flex-col items-center gap-1.5">
        <Avatar seed={seed} style={partner.avatar_style as any} size={52} />
        {details?.title && (
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">{details.title}</p>
        )}
        {details?.bio && (
            <p className="text-xs text-gray-500 dark:text-gray-400 text-center line-clamp-2">{details.bio}</p>
        )}
    </div>

    {publicFiles.length > 0 && (
        <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1.5">Öffentliche Notizen</p>
            <div className="flex flex-col gap-0.5">
                {publicFiles.map(f => (
                    <button
                        key={f.id}
                        onClick={(e) => { e.stopPropagation(); onOpenProfile(partner.id, partner.username); }}
                        className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 transition-colors text-left w-full"
                    >
                        <FileText size={12} className="text-gray-400 shrink-0" />
                        <span className="text-xs text-gray-700 dark:text-gray-300 truncate">{f.title}</span>
                    </button>
                ))}
            </div>
        </div>
    )}

    {publicFiles.length === 0 && hasFetched && (
        <p className="text-[11px] text-gray-400 text-center">Keine öffentlichen Notizen</p>
    )}
</div>
```

Add `FileText` to the imports from `lucide-react`.

- [ ] **Step 5: Pass onToggle from SocialHub**

In `SocialHub.tsx`, find where `PartnerProfileHeader` is rendered:

```tsx
<PartnerProfileHeader
    partner={activeChatPartner}
    expanded={profileExpanded}
    onOpenProfile={onOpenProfile}
    onToggle={() => setProfileExpanded(p => !p)}
/>
```

- [ ] **Step 6: Verify**

1. Click a contact to enter chat mode.
2. Click on the compact profile header row → profile expands to show avatar, bio/title, and public notes list.
3. Click again → collapses back to 56px.
4. Scrolling the chat down still collapses the profile (existing behavior via `handleChatScroll`).

---

## Task 9: ChatPanel — iMessage Bubbles + Data Package Cards

**Files:**
- Modify: `web/src/components/Chat/ChatPanel.tsx`

### Part A: iMessage-style message bubbles

- [ ] **Step 1: Replace bubble styling in the messages.map() render**

Find the message bubble `<div>` with the `className` containing `rounded-3xl shadow-float-sm` (around line 1064). Replace the entire outer bubble div and its content for non-share-request messages:

**Before** (the outer bubble div):
```tsx
<div
    className={`rounded-3xl shadow-float-sm ${isMe
        ? 'accent-gradient-primary text-gray-900 dark:text-gray-100 rounded-br-sm'
        : 'bg-white/60 dark:bg-black/40 backdrop-blur-md border border-white/50 dark:border-white/10 text-gray-900 dark:text-gray-100 rounded-bl-sm'
        } ${isShareRequest ? 'max-w-[280px] w-full overflow-hidden flex flex-col' : 'max-w-[75%] px-5 py-3'}`}
>
```

**After:**
```tsx
<div
    className={`
        ${isShareRequest
            ? 'w-[260px] overflow-hidden rounded-2xl'
            : `max-w-[72%] px-4 py-2.5 rounded-2xl ${isMe ? 'rounded-br-sm' : 'rounded-bl-sm'}`
        }
        ${isMe
            ? 'bg-blue-500 text-white'
            : 'bg-gray-100 dark:bg-white/10 text-gray-900 dark:text-white'
        }
    `}
>
```

- [ ] **Step 2: Remove the old standalone timestamp div**

Find the old timestamp div near the bottom of the bubble (around line 1192), the one with `text-[9px] mt-1.5 font-bold uppercase tracking-wider`:

```tsx
{!isShareRequest && (
    <div className={`text-[9px] mt-1.5 font-bold uppercase tracking-wider ${isMe ? 'text-white/60 text-right' : 'text-gray-400 dark:text-gray-500 pr-4'}`}>
        {mDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
    </div>
)}
```

**Delete this entire block.** The timestamp will live inside the else-branch of the share-request ternary (Step 3 below).

### Part B: Data package card redesign

- [ ] **Step 3: Replace the isShareRequest render block**

Find the `{isShareRequest && shareData ? (` block (around line 1069). Replace the entire block content with:

```tsx
{isShareRequest && shareData ? (
    <>
        {/* Card */}
        <div className={`m-2 rounded-xl p-3 flex flex-col gap-2.5 ${isMe ? 'bg-black/15' : 'bg-white dark:bg-black/30'}`}>
            <div className="flex items-center gap-3">
                <div className={`p-2 rounded-xl shrink-0 ${shareData.file_type === 'event' ? 'bg-amber-100 dark:bg-amber-900/40' : 'bg-indigo-100 dark:bg-indigo-900/40'}`}>
                    {shareData.file_type === 'event'
                        ? <Calendar size={20} className="text-amber-600 dark:text-amber-400" />
                        : <FileText size={20} className="text-indigo-600 dark:text-indigo-400" />
                    }
                </div>
                <div className="flex-1 min-w-0">
                    <div className={`font-bold text-sm truncate ${isMe ? 'text-white' : 'text-gray-900 dark:text-white'}`}>
                        {shareData.file_name}
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                        <span className={`text-[9px] uppercase tracking-wider font-extrabold ${isMe ? 'text-white/60' : 'text-gray-400'}`}>
                            {shareData.file_type === 'event' ? 'Termin' : (shareData.file_type || 'Notiz').toUpperCase()}
                        </span>
                        {shareData.permission && (
                            <span className={`text-[9px] uppercase tracking-wider font-extrabold px-1.5 py-0.5 rounded-md ${
                                shareData.permission === 'view' ? 'bg-gray-200/70 text-gray-600 dark:bg-white/10 dark:text-gray-300'
                                : 'bg-blue-200/70 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200'
                            }`}>
                                {shareData.permission === 'view' ? 'Ansehen' : 'Bearbeiten'}
                            </span>
                        )}
                    </div>
                </div>
            </div>

            {shareData.file_preview && (
                <p className={`text-[11px] italic line-clamp-2 leading-relaxed ${isMe ? 'text-white/70' : 'text-gray-500 dark:text-gray-400'}`}>
                    "{shareData.file_type === 'event' && shareData.file_preview.start
                        ? new Date(shareData.file_preview.start).toLocaleString('de-DE', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
                        : (typeof shareData.file_preview === 'string' ? shareData.file_preview : shareData.file_preview.description || '')
                    }"
                </p>
            )}
        </div>

        {/* Actions */}
        <div className="px-3 pb-3">
            {isMe ? (
                <p className={`text-[10px] text-center uppercase tracking-widest font-bold ${isMe ? 'text-white/40' : 'text-gray-400'}`}>
                    Gesendet
                </p>
            ) : (() => {
                const currentStatus = m.status || processedRequests[shareData.file_id];
                if (currentStatus === 'accepted') return (
                    <div className="flex items-center justify-center gap-1.5 py-1.5 text-green-600 dark:text-green-400 text-xs font-bold">
                        <CheckCircle size={13} /> Gespeichert
                    </div>
                );
                if (currentStatus === 'declined') return (
                    <div className="flex items-center justify-center gap-1.5 py-1.5 text-red-500 dark:text-red-400 text-xs font-bold">
                        <XCircle size={13} /> Abgelehnt
                    </div>
                );
                return (
                    <div className="flex gap-1.5">
                        <button
                            onClick={() => shareData && handleAccept(shareData.file_id, m.id, shareData.file_type, shareData.file_name)}
                            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-white dark:bg-white/10 text-gray-900 dark:text-white text-xs font-bold hover:bg-gray-50 dark:hover:bg-white/15 transition-colors"
                        >
                            {shareData.file_type === 'event' ? <Calendar size={12} /> : <FileText size={12} />}
                            Öffnen
                        </button>
                        <button
                            onClick={() => shareData && handleClone(shareData.file_id, m.id, shareData.file_name)}
                            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-white/60 dark:bg-white/5 text-gray-700 dark:text-gray-300 text-xs font-bold hover:bg-white dark:hover:bg-white/10 transition-colors"
                        >
                            Klonen
                        </button>
                        <button
                            onClick={() => shareData && handleDecline(shareData.file_id, m.id)}
                            className="px-3 py-2 rounded-xl bg-rose-100 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400 text-xs font-bold hover:bg-rose-200 transition-colors"
                        >
                            <X size={12} />
                        </button>
                    </div>
                );
            })()}
        </div>
    </>
) : (
    <>
        <div className="text-[15px] leading-snug font-medium break-words whitespace-pre-wrap">
            {m.content}
        </div>
        {!isShareRequest && (
            <div className={`text-[10px] mt-1 font-medium ${isMe ? 'text-blue-100/80 text-right' : 'text-gray-400'}`}>
                {mDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </div>
        )}
    </>
)}
```

- [ ] **Step 4: Verify**

1. Open a chat. Confirm own messages appear as blue bubbles on the right.
2. Confirm received messages appear as gray bubbles on the left.
3. Send/receive a file share → compact card appears with icon, name, type badge.
4. Received card shows 3 action buttons (Öffnen, Klonen, ✕).
5. After accepting, card shows "✓ Gespeichert".
