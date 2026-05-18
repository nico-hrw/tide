# Chat-Redesign: Inline 3-Spalten-Layout Design Spec

**Date:** 2026-05-19  
**Status:** Approved

---

## 1. Scope

Die Chat-Funktion wird von einem Popup/Modal-Pattern (innerhalb von SocialHub) in ein inline 3-Spalten-Layout innerhalb der Social-Seite umgebaut. Der neue Chat-Modus ist über einen Toggle im SocialHub aktivierbar.

**Out of Scope:** Neue Chat-Funktionen, Echtzeit-Präsenz/Online-Status, Push-Benachrichtigungen, neue Backend-Endpoints.

---

## 2. Architektur

### Betroffene Dateien

| Datei | Änderungstyp |
|---|---|
| `web/src/components/Social/SocialHub.tsx` | Modify — Toggle-State, Layout-Switch, Compact-Modus |
| `web/src/components/Chat/ChatPanel.tsx` | Modify — Scroll-Callback nach oben weitergeben |
| `web/src/components/Chat/PartnerProfileHeader.tsx` | Create — neues Komponente |

`page.tsx` bleibt **unverändert**.

### Neuer State in SocialHub

```typescript
const [isChatMode, setIsChatMode] = useState(false);
```

`activeChatPartner` existiert bereits und steuert das rechte Panel.

### Layout-Logik

```
SocialHub (activeTabId === 'social')
├── [isChatMode = false]
│   Aktuelle Vollansicht (Suche, Kontakte, Vorschläge, Anfragen)
│
└── [isChatMode = true]   flex-row h-full
    ├── Linke Spalte (w-80, shrink-0, overflow-y-auto)
    │   Komprimierte SocialHub-Inhalte (Suche, Kontakte, Vorschläge)
    │   Aktiver Partner: highlighted row
    │
    └── Rechtes Panel (flex-1, flex-col, min-w-0)
        ├── PartnerProfileHeader   (collapsible, ~200px expanded / ~56px compact)
        └── ChatPanel              (flex-1, bestehende Komponente)
```

---

## 3. Toggle-Button

**Position:** SocialHub-Header, rechts neben dem Titel  
**Icon:** `MessageSquare` (Lucide, bereits importiert)  
**Farbe:** grau inaktiv / `text-indigo-500` aktiv  
**Verhalten:**
- Klick → `setIsChatMode(prev => !prev)`
- Im Chat-Mode ohne aktiven Partner → rechtes Panel zeigt leeren Zustand

---

## 4. PartnerProfileHeader-Komponente

**Datei:** `web/src/components/Chat/PartnerProfileHeader.tsx`

### Props

```typescript
interface PartnerProfileHeaderProps {
    partner: { id: string; username: string; avatar_seed?: string; avatar_salt?: string; avatar_style?: string };
    expanded: boolean;
    onOpenProfile: (userId: string, username: string) => void;
}
```

### Zwei Zustände

**Expanded** (Standard, max-height ~200px):
- Avatar (Größe 48px, zentriert)
- Name + Verifizierungsbadge
- Titel und Bio (lazy geladen, max 2 Zeilen, truncate)
- "Profil ansehen"-Button

**Compact** (~56px, flex-row):
- Avatar (Größe 28px)
- Name (truncate)
- Optionaler Online-Indikator (wenn später implementiert)

### Übergang

`transition-all duration-300 overflow-hidden` mit `max-height`-Wechsel zwischen expanded und compact. Kein Layout-Sprung.

### Datenladen

Profil-Details (Bio, Verifizierung, Titel) werden via `GET /api/v1/profiles/{userId}` geladen — nur wenn `partner.id` sich ändert. `useEffect([partner.id])`. Loading-State zeigt nur Avatar + Name (gleich wie compact).

---

## 5. Scroll-gesteuerte Collapse-Logik

`PartnerProfileHeader` ist **zustandslos** — `expanded: boolean` kommt als Prop von SocialHub (oder einem Wrapper).

**Implementierung in SocialHub (Chat-Mode):**

```typescript
const [profileExpanded, setProfileExpanded] = useState(true);

const handleChatScroll = useCallback((scrollTop: number, direction: 'up' | 'down') => {
    if (direction === 'down' && scrollTop > 40) setProfileExpanded(false);
    if (direction === 'up' || scrollTop < 10) setProfileExpanded(true);
}, []);
```

**In ChatPanel:** Ein neuer optionaler Prop `onScroll?: (scrollTop: number, direction: 'up' | 'down') => void` wird an den bestehenden Nachrichten-Container (`onScroll`-Event) gekoppelt. Wenn die Prop nicht übergeben wird (alter Verwendungskontext), passiert nichts.

---

## 6. Kontakt-Klick im Chat-Mode — kein neuer Tab

In `SocialHub.tsx` unterscheidet sich der Kontakt-Klick je nach Modus:

```typescript
const handleContactClick = (partner: UserBasic) => {
    if (isChatMode) {
        // Chat-Mode: nur lokalen Partner-State setzen, kein Tab
        setActiveChatPartner(partner);
        setProfileExpanded(true);
    } else {
        // Normal-Mode: altes Verhalten beibehalten
        setActiveChatPartner(partner);
    }
};
```

Der `onChatSelect`-Prop (von page.tsx) wird im Chat-Mode **nicht** aufgerufen. `page.tsx`'s `handleChatSelect`-Funktion und `chat-{id}`-Tab-Logik bleibt unverändert — sie wird nur nicht mehr aus dem Chat-Mode-Kontaktklick ausgelöst.

---

## 7. Kompakte Linkspalte (Chat-Mode)

Kein neues Unterkomponent — die bestehenden Render-Blöcke in `SocialHub.tsx` bekommen conditional className-Modifier.

**Compact-Modus-Klassen:**
- User-Cards: `flex items-center gap-2 p-2` statt großem Card-Layout
- Avatar: Größe 32px statt 48px
- Buttons: nur Symbol, kein Label
- Aktiver Partner: `bg-indigo-50 dark:bg-indigo-900/20 ring-1 ring-indigo-200 dark:ring-indigo-700 rounded-xl`

---

## 8. Leerer Zustand (kein Partner ausgewählt)

Wenn `isChatMode = true` und `activeChatPartner = null`:

```
flex-col items-center justify-center gap-3 text-gray-400
[MessageSquare icon, size 32]
"Wähle einen Kontakt"
"um zu chatten"
```

---

## 9. Verhalten beim Tab-Wechsel

SocialHub wird unmountet wenn der Nutzer den Social-Tab verlässt (`{activeTabId === 'social' && <SocialHub />}` in page.tsx). Das bedeutt:
- `isChatMode` und `activeChatPartner` werden beim Verlassen des Social-Tabs auf die Standardwerte zurückgesetzt (`false` / `null`).
- Beim Zurückkehren startet SocialHub immer in der normalen Vollansicht.
- Dies ist akzeptables Verhalten für die erste Version. Ein späteres Enhancement könnte den Zustand in sessionStorage persistieren.
