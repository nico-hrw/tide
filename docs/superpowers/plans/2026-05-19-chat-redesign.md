# Chat-Redesign: Inline 3-Spalten-Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Chat aus dem Popup-Pattern in ein inline 3-Spalten-Layout innerhalb der Social-Seite umbauen — Toggle im SocialHub-Header, Kontaktliste links, Chat mit zusammenklappbarem Partner-Profil rechts.

**Architecture:** Nur `SocialHub.tsx` und `ChatPanel.tsx` werden geändert plus ein neues `PartnerProfileHeader.tsx`. `page.tsx` bleibt unberührt. Toggle-State (`isChatMode`) + Scroll-State (`profileExpanded`) leben in `SocialHub`. ChatPanel bekommt einen optionalen `onScroll`-Prop.

**Tech Stack:** Next.js, React, TypeScript, Tailwind CSS, Lucide React, bestehende Avatar-Komponente, bestehende `apiFetch`.

---

## File Map

| Datei | Änderung |
|---|---|
| `web/src/components/Chat/PartnerProfileHeader.tsx` | **Neu erstellen** |
| `web/src/components/Chat/ChatPanel.tsx` | Modify — optionaler `onScroll`-Prop + Wire an Messages-Container |
| `web/src/components/Social/SocialHub.tsx` | Modify — Toggle-State, Layout-Switch, Compact-Spalte, Profil-Scroll |

---

## Task 1: PartnerProfileHeader-Komponente erstellen

**Files:**
- Create: `web/src/components/Chat/PartnerProfileHeader.tsx`

- [ ] **Step 1: Datei erstellen**

```tsx
// web/src/components/Chat/PartnerProfileHeader.tsx
"use client";
import { useState, useEffect } from 'react';
import Avatar from '@/components/Profile/Avatar';
import { CheckCircle2, ExternalLink } from 'lucide-react';
import { apiFetch } from '@/lib/api';

interface Partner {
    id: string;
    username: string;
    avatar_seed?: string;
    avatar_salt?: string;
    avatar_style?: string;
}

interface ProfileDetails {
    bio?: string;
    title?: string;
    is_verified?: boolean;
}

interface PartnerProfileHeaderProps {
    partner: Partner;
    expanded: boolean;
    onOpenProfile: (userId: string, username: string) => void;
}

export default function PartnerProfileHeader({ partner, expanded, onOpenProfile }: PartnerProfileHeaderProps) {
    const [details, setDetails] = useState<ProfileDetails | null>(null);

    useEffect(() => {
        setDetails(null);
        apiFetch(`/api/v1/profiles/${partner.id}`)
            .then(r => r.ok ? r.json() : null)
            .then(d => { if (d) setDetails({ bio: d.bio, title: d.title, is_verified: d.is_verified }); })
            .catch(() => {});
    }, [partner.id]);

    const seed = (partner.avatar_seed || partner.id) + (partner.avatar_salt || '');

    return (
        <div
            className="overflow-hidden transition-all duration-300 border-b border-gray-100 dark:border-white/10 bg-white dark:bg-[#1a1c1e]"
            style={{ maxHeight: expanded ? '200px' : '56px' }}
        >
            {/* Compact view — always visible */}
            <div className="flex items-center gap-3 px-4 h-14 shrink-0">
                <Avatar seed={seed} style={partner.avatar_style as any} size={28} />
                <span className="font-semibold text-sm text-gray-900 dark:text-white truncate flex-1">
                    {partner.username}
                    {details?.is_verified && <CheckCircle2 className="inline w-3.5 h-3.5 fill-green-500 text-white ml-1 mb-0.5" />}
                </span>
                <button
                    onClick={() => onOpenProfile(partner.id, partner.username)}
                    className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 text-gray-400 transition-colors shrink-0"
                    title="Profil ansehen"
                >
                    <ExternalLink size={14} />
                </button>
            </div>

            {/* Expanded extra content — only visible when expanded */}
            <div className="px-4 pb-4 flex flex-col items-center gap-2">
                <Avatar seed={seed} style={partner.avatar_style as any} size={48} />
                {details?.title && (
                    <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">{details.title}</p>
                )}
                {details?.bio && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 text-center line-clamp-2">{details.bio}</p>
                )}
            </div>
        </div>
    );
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd web && npx tsc --noEmit 2>&1 | grep "PartnerProfileHeader"
```
Expected: keine Ausgabe (keine Fehler).

- [ ] **Step 3: Commit**

```bash
git add web/src/components/Chat/PartnerProfileHeader.tsx
git commit -m "feat: add PartnerProfileHeader component with collapse animation"
```

---

## Task 2: ChatPanel — optionaler onScroll-Prop

**Files:**
- Modify: `web/src/components/Chat/ChatPanel.tsx:33-42` (Props-Interface)
- Modify: `web/src/components/Chat/ChatPanel.tsx:985` (Messages-Container)

- [ ] **Step 1: onScroll zum Props-Interface hinzufügen**

Finde das Interface `ChatPanelProps` (Zeile ~33) und ergänze:

```typescript
interface ChatPanelProps {
    privateKey: CryptoKey | null;
    onOpenFile: (fileId: string, title: string, fileData?: any) => void;
    onFileCreated?: (file: any) => void;
    activePartner?: { id: string; username: string; email: string };
    onChatSelect?: (partnerId: string, partnerName: string, partnerEmail: string) => void;
    onAccept?: () => void;
    onOpenCalendar?: () => void;
    onOpenProfile?: (userId: string, username: string) => void;
    onScroll?: (scrollTop: number, direction: 'up' | 'down') => void;  // ← neu
}
```

- [ ] **Step 2: onScroll-Prop destructuren**

In der Funktionssignatur von `ChatPanel` (Zeile ~100), `onScroll` ergänzen:

```typescript
export default function ChatPanel({ privateKey, onOpenFile, onFileCreated, activePartner, onChatSelect, onAccept, onOpenCalendar, onOpenProfile, onScroll }: ChatPanelProps) {
```

- [ ] **Step 3: Scroll-Handler in Messages-Container verdrahten**

Füge einen `useRef` und den onScroll-Handler hinzu. Suche die Messages-Container-div (Zeile ~985: `<div className="flex-1 overflow-y-auto px-4 py-3 bg-transparent">`).

Direkt über dem `return` der Komponente (oder bei den anderen Refs), einen `lastScrollTop`-Ref hinzufügen:

```typescript
const lastScrollTopRef = useRef(0);
```

Dann die div um einen `onScroll`-Handler erweitern:

```tsx
<div
    className="flex-1 overflow-y-auto px-4 py-3 bg-transparent"
    onScroll={onScroll ? (e) => {
        const el = e.currentTarget;
        const direction = el.scrollTop > lastScrollTopRef.current ? 'down' : 'up';
        lastScrollTopRef.current = el.scrollTop;
        onScroll(el.scrollTop, direction);
    } : undefined}
>
```

- [ ] **Step 4: Verify TypeScript**

```bash
cd web && npx tsc --noEmit 2>&1 | grep "ChatPanel"
```
Expected: keine Ausgabe.

- [ ] **Step 5: Commit**

```bash
git add web/src/components/Chat/ChatPanel.tsx
git commit -m "feat: add optional onScroll prop to ChatPanel for profile collapse"
```

---

## Task 3: SocialHub — isChatMode-State, Toggle-Button, Layout-Switch

**Files:**
- Modify: `web/src/components/Social/SocialHub.tsx`

- [ ] **Step 1: Imports ergänzen**

Finde die Import-Zeile mit den Lucide-Icons (Zeile ~4) und ergänze `MessageSquare`:

```typescript
import { Search, Loader2, UserPlus, Check, ChevronRight, CheckCircle2, X, EyeOff, Users, MessageSquare } from 'lucide-react';
```

Ergänze den Import für `PartnerProfileHeader`:

```typescript
import PartnerProfileHeader from '@/components/Chat/PartnerProfileHeader';
```

- [ ] **Step 2: Neue State-Variablen hinzufügen**

Im Komponenten-Body direkt nach dem bestehenden `activeChatPartner`-State (Zeile ~37):

```typescript
const [isChatMode, setIsChatMode] = useState(false);
const [profileExpanded, setProfileExpanded] = useState(true);
```

- [ ] **Step 3: handleChatScroll-Callback hinzufügen**

Nach den `useEffect`-Hooks, vor `handleSearch`:

```typescript
const handleChatScroll = (scrollTop: number, direction: 'up' | 'down') => {
    if (direction === 'down' && scrollTop > 40) setProfileExpanded(false);
    if (direction === 'up' || scrollTop < 10) setProfileExpanded(true);
};
```

- [ ] **Step 4: Toggle-Button in den Header einfügen**

Finde die Header-Row-div (Zeile ~163: `<div className="flex flex-col md:flex-row md:items-start justify-between gap-8 mb-8">`).

Ergänze einen Toggle-Button am Ende der inneren `<div className="flex-1">` (nach dem `searchForm`-Element und vor dem schließenden `</div>`):

```tsx
<div className="flex-1">
    <div className="flex items-center justify-between mb-6">
        <h1 className="text-4xl font-black text-gray-900 dark:text-white">Social</h1>
        <button
            onClick={() => setIsChatMode(prev => !prev)}
            className={`p-2 rounded-xl transition-colors ${isChatMode ? 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400' : 'text-gray-400 hover:bg-gray-100 dark:hover:bg-white/10 hover:text-gray-600'}`}
            title={isChatMode ? 'Zur Übersicht' : 'Chat öffnen'}
        >
            <MessageSquare size={20} />
        </button>
    </div>
    {!compact && searchForm}
</div>
```

Dazu die ursprüngliche `<h1>` entfernen (sie war direkt in `<div className="flex-1">`).

- [ ] **Step 5: Verify TypeScript**

```bash
cd web && npx tsc --noEmit 2>&1 | grep "SocialHub"
```
Expected: keine Ausgabe.

- [ ] **Step 6: Commit**

```bash
git add web/src/components/Social/SocialHub.tsx
git commit -m "feat: add isChatMode toggle button and state to SocialHub"
```

---

## Task 4: SocialHub — Chat-Mode Layout (3 Spalten)

**Files:**
- Modify: `web/src/components/Social/SocialHub.tsx`

Die Hauptlogik: Das äußerste `<div>` der SocialHub-Komponente und der Content-Bereich werden so umstrukturiert, dass im Chat-Mode ein Flex-Row-Layout mit zwei Spalten entsteht.

- [ ] **Step 1: Äußere div anpassen**

Finde das äußerste `return`-div (Zeile ~160):
```tsx
// Vorher:
<div className={compact ? 'flex flex-col min-h-full' : 'max-w-5xl mx-auto py-12 px-8 min-h-screen'}>

// Nachher:
<div className={isChatMode ? 'flex h-full overflow-hidden' : compact ? 'flex flex-col min-h-full' : 'max-w-5xl mx-auto py-12 px-8 min-h-screen'}>
```

- [ ] **Step 2: Chat-Mode Layout-Block hinzufügen**

Unmittelbar nach dem `return (` und dem äußeren div, BEVOR die bisherigen Header-Blöcke, einen konditionalen Block einfügen:

```tsx
{isChatMode ? (
    <>
        {/* Linke Kontaktspalte */}
        <div className="w-80 shrink-0 flex flex-col border-r border-gray-100 dark:border-white/10 overflow-y-auto">
            {/* Suchfeld kompakt */}
            <div className="p-3 border-b border-gray-100 dark:border-white/10">
                {searchForm}
            </div>

            {/* Kontaktanfragen-Badge */}
            {pendingRequests.length > 0 && (
                <div className="px-3 py-2">
                    <div className="relative" ref={requestsRef}>
                        <button
                            onClick={() => setShowRequests(!showRequests)}
                            className="w-full flex items-center gap-2 p-2 rounded-xl bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm font-medium hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
                        >
                            <Users size={14} />
                            {pendingRequests.length} Kontaktanfrage{pendingRequests.length !== 1 ? 'n' : ''}
                        </button>
                        {showRequests && (
                            <div className="absolute top-full left-0 mt-1 w-72 bg-white dark:bg-[#1a1c1e] border border-gray-100 dark:border-white/10 rounded-2xl shadow-2xl p-4 z-50">
                                <div className="space-y-3 max-h-[280px] overflow-y-auto">
                                    {pendingRequests.map((req) => (
                                        <div key={req.id} className="flex items-center gap-3">
                                            <Avatar seed={(req.avatar_seed || req.user_id) + (req.avatar_salt || '')} style={req.avatar_style as any} size={32} />
                                            <div className="flex-1 min-w-0">
                                                <p className="font-semibold text-sm text-gray-900 dark:text-white truncate">{req.username || 'Neuer Kontakt'}</p>
                                            </div>
                                            <div className="flex gap-1 shrink-0">
                                                <button onClick={async () => { await acceptRequest(req.id); }} className="p-1.5 bg-green-500 text-white rounded-lg hover:bg-green-600"><Check className="w-3.5 h-3.5" /></button>
                                                <button onClick={async () => { await declineRequest(req.id); }} className="p-1.5 bg-gray-100 dark:bg-white/10 text-gray-400 rounded-lg hover:bg-gray-200"><X className="w-3.5 h-3.5" /></button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Kontaktliste — kompakte Rows */}
            <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
                {contacts.length === 0 && !query.trim() && (
                    <div className="text-center py-8 text-gray-400 text-sm">
                        <Users className="w-8 h-8 mx-auto mb-2 opacity-30" />
                        Keine Kontakte
                    </div>
                )}
                {(query.trim() ? results.filter(r => contacts.some(c => c.partner.id === (r.owner_id || r.id))) : contacts.map(c => ({ ...c.partner, owner_id: c.partner.id }))).map((item: any, i: number) => {
                    const partner = contacts.find(c => c.partner.id === (item.id || item.owner_id))?.partner;
                    if (!partner) return null;
                    const isActive = activeChatPartner?.id === partner.id;
                    return (
                        <button
                            key={i}
                            onClick={() => { setActiveChatPartner({ id: partner.id, username: partner.username, email: partner.email, public_key: partner.public_key, avatar_seed: partner.avatar_seed, avatar_salt: partner.avatar_salt, avatar_style: partner.avatar_style }); setProfileExpanded(true); }}
                            className={`w-full flex items-center gap-3 p-2.5 rounded-xl transition-colors text-left ${isActive ? 'bg-indigo-50 dark:bg-indigo-900/20 ring-1 ring-indigo-200 dark:ring-indigo-700' : 'hover:bg-gray-100 dark:hover:bg-white/5'}`}
                        >
                            <Avatar seed={(partner.avatar_seed || partner.id) + (partner.avatar_salt || '')} style={partner.avatar_style as any} size={32} />
                            <span className={`text-sm font-medium truncate ${isActive ? 'text-indigo-700 dark:text-indigo-300' : 'text-gray-700 dark:text-gray-300'}`}>
                                {partner.username}
                            </span>
                        </button>
                    );
                })}
            </div>
        </div>

        {/* Rechtes Chat-Panel */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
            {activeChatPartner ? (
                <>
                    <PartnerProfileHeader
                        partner={activeChatPartner}
                        expanded={profileExpanded}
                        onOpenProfile={onOpenProfile}
                    />
                    <div className="flex-1 min-h-0 overflow-hidden">
                        <ChatPanel
                            privateKey={privateKey}
                            onOpenFile={onOpenFile}
                            onOpenCalendar={onOpenCalendar}
                            onOpenProfile={onOpenProfile}
                            onFileCreated={() => {}}
                            activePartner={activeChatPartner}
                            onChatSelect={() => {}}
                            onScroll={handleChatScroll}
                        />
                    </div>
                </>
            ) : (
                <div className="flex-1 flex flex-col items-center justify-center gap-3 text-gray-400">
                    <MessageSquare size={32} className="opacity-30" />
                    <p className="text-sm font-medium">Wähle einen Kontakt</p>
                    <p className="text-xs opacity-70">um zu chatten</p>
                </div>
            )}
        </div>
    </>
) : (
    /* ── Bestehende SocialHub-Vollansicht (UNVERÄNDERT) ── */
    /* Alles was bisher im return stand — der Header-Block, die Profile-Card, die Suche, Kontakte, BottomSheet etc. */
    /* HINWEIS: Dieser Block enthält den kompletten bisherigen JSX von SocialHub. Nicht kürzen, nur einwickeln. */
    <>
        {/* ... bestehender Code hierhin verschieben ... */}
    </>
)}
```

**WICHTIG:** Der `else`-Zweig enthält den KOMPLETTEN bisherigen Inhalt des `return`-Blocks unverändert. Die Änderung ist strukturell:

```tsx
// VORHER: return-Block beginnt mit
return (
    <div className={...}>
        {/* Header Row */}
        <div className="flex flex-col ...">
            ...
        </div>
        {/* Profile Hidden Notice */}
        ...
        {/* Content Area */}
        {compact ? ( ... ) : activeChatPartner ? ( ... ) : ( ... )}
    </div>
);

// NACHHER: return-Block beginnt mit
return (
    <div className={isChatMode ? 'flex h-full overflow-hidden' : compact ? 'flex flex-col min-h-full' : 'max-w-5xl mx-auto py-12 px-8 min-h-screen'}>
        {isChatMode ? (
            <>
                {/* Linke Kontaktspalte */}
                ...  // ← der neue Code aus dem Schritt oben
                {/* Rechtes Chat-Panel */}
                ...
            </>
        ) : (
            <>
                {/* Header Row */}   ← unverändert aus dem Original
                <div className="flex flex-col ...">...</div>
                {/* Profile Hidden Notice */}
                ...
                {/* Content Area (compact/chat-popup/normal) */}
                {compact ? ( ... ) : activeChatPartner ? ( ... ) : ( ... )}
            </>
        )}
    </div>
);
```

Das heißt konkret: Den bisherigen Inhalt der `return`-div (alles von `{/* Header Row */}` bis zum Ende) in ein `<>...</>` einwickeln und als else-Zweig des `isChatMode`-Ternary einfügen.

- [ ] **Step 3: Verify — App öffnen, Social-Tab anklicken**

1. Social-Tab öffnen — normale Ansicht erscheint.
2. MessageSquare-Icon klicken — Chat-Mode erscheint mit Kontaktspalte links.
3. Kontakt anklicken — ChatPanel erscheint rechts mit PartnerProfileHeader oben.
4. Im Chat nach unten scrollen — Profil klappt zusammen (kompakte Zeile).
5. Nach oben scrollen — Profil klappt aus.
6. Zurück auf normalen Modus — Toggle-Icon erneut klicken.

- [ ] **Step 4: Commit**

```bash
git add web/src/components/Social/SocialHub.tsx
git commit -m "feat: inline 3-column chat layout in SocialHub with collapsible partner profile"
```

---

## Task 5: SocialHub — bestehende Popup-Logik entfernen/bereinigen

Sobald das neue Layout funktioniert, den alten Popup-Code aufräumen.

**Files:**
- Modify: `web/src/components/Social/SocialHub.tsx`

- [ ] **Step 1: BottomSheet-Import entfernen (wenn nicht mehr benötigt)**

Prüfe ob `BottomSheet` noch an anderer Stelle verwendet wird:

```bash
grep -n "BottomSheet" web/src/components/Social/SocialHub.tsx
```

Wenn `BottomSheet` nur für den alten Chat-Popup genutzt wurde, Import entfernen:
```typescript
// Entfernen:
import BottomSheet from '@/components/Layout/BottomSheet';
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd web && npx tsc --noEmit 2>&1 | grep "error TS" | head -10
```
Expected: keine Ausgabe.

- [ ] **Step 3: Commit**

```bash
git add web/src/components/Social/SocialHub.tsx
git commit -m "chore: remove BottomSheet popup chat from SocialHub after inline redesign"
```
