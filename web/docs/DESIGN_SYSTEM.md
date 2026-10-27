# Tide Design System

> Umfassende Dokumentation des Designsystems für das Tide Web-Frontend.
> Dieses Dokument beschreibt die Architektur, Token-Hierarchien, die Komponenten-Matrix und die Vorgehensweise für Theming und Re-Designs.

---

## 1. Die drei Schaltzentralen

Das Designsystem basiert auf einer dreistufigen, synchronisierten Architektur. Änderungen am Look & Feel werden zentral an diesen drei Stellen gesteuert:

```
┌────────────────────────────────┐
│   1. web/src/app/globals.css   │  ◄── Single Source of Truth für CSS-Variablen
│       (:root & .dark Tokens)   │      (Farben, Radien, Schatten, Oberflächen)
└───────────────┬────────────────┘
                │
        ┌───────┴────────────────────────┐
        ▼                                ▼
┌──────────────────────────────┐  ┌───────────────────────────────────┐
│ 2. web/tailwind.config.js    │  │ 3. web/src/lib/designTokens.ts    │
│    (Semantische Utility-     │  │    (Typsichere TypeScript-        │
│     Klassen für Komponenten) │  │     Tokens für Canvas/Runtime-JS) │
└──────────────────────────────┘  └───────────────────────────────────┘
```

### 1. `web/src/app/globals.css` (CSS Custom Properties)
- **Rolle:** Single Source of Truth für alle dynamischen Styling-Werte.
- **Funktion:** Definiert alle Design-Variablen sowohl im Light Mode (`:root`) als auch im Dark Mode (`.dark`) sowie im SSR-Fallback (`@media (prefers-color-scheme: dark)`).
- **Vorteil:** Ermöglicht verzögerungsfreie Theme-Umschaltung ohne Re-Rendering von React-Komponenten.

### 2. `web/tailwind.config.js` (Semantische Utility-Klassen)
- **Rolle:** Brücke zwischen CSS-Variablen und Tailwind-Klassennamen.
- **Funktion:** Mappt semantische Bezeichner auf CSS-Variablen mit Fallbacks:
  - `colors.surface.modal` ➔ `var(--surface-modal, var(--background))`
  - `colors.surface.card` ➔ `var(--surface-card, var(--sidebar-bg))`
  - `colors.border.DEFAULT` ➔ `var(--border-color)`
  - `borderRadius.modal` ➔ `var(--radius-modal, 24px)`
  - `borderRadius.card` ➔ `var(--radius-lg, 14px)`
  - `borderRadius.ui` ➔ `var(--radius, 8px)`
  - `boxShadow.float` ➔ `var(--shadow-float)`
  - `boxShadow.modal` ➔ `var(--shadow-modal)`

### 3. `web/src/lib/designTokens.ts` (Programmatische Schnittstelle)
- **Rolle:** Typsichere Schnittstelle für TypeScript-Code, Canvas-Rendering und dynamische Styles.
- **Funktion:** Exportiert das Objekt `DT` (inkl. `glass()`, `chip()`, `status`, `modal`, `highlights`, etc.) zur Verwendung in Canvas-Tools (wie Apple Pencil / Ink Layer), tippy.js Tooltips oder Headless Modals.

---

## 2. Token-Katalog

### 2.1 Oberflächen & Surfaces
| Token (CSS Variable) | Tailwind Utility | Light Value | Dark Value | Beschreibung |
|---|---|---|---|---|
| `--background` | `bg-background` | `#FFFFFF` | `#0F172A` | Globaler Seitenhintergrund |
| `--foreground` | `text-foreground` | `#111827` | `#F8FAFC` | Primärer Textkontrast |
| `--surface-card` | `bg-surface-card` | `var(--sidebar-bg)` (`#F9FAFB`) | `var(--sidebar-bg)` (`#1E293B`) | Hintergründe von Kacheln, Sidebar & Cards |
| `--surface-modal` | `bg-surface-modal` | `var(--background)` (`#FFFFFF`) | `#18181b` | Dialoge, Modals und Popovers |
| `--hover-bg` | `bg-surface-hover` | `#F5F5F5` | `rgba(255,255,255,0.06)` | Interaktive Hover-Zustände |

### 2.2 Rahmen & Borders
| Token (CSS Variable) | Tailwind Utility | Light Value | Dark Value |
|---|---|---|---|
| `--border-color` | `border-border` | `#E5E7EB` | `#334155` |
| `--surface-modal-border` | `border-surface-modal` | `var(--border-color)` | `#27272a` |
| `--border-ui` | `border-border-ui` | `rgba(0, 0, 0, 0.08)` | `rgba(255, 255, 255, 0.10)` |
| `--border-grid` | `border-border-grid` | `rgba(0, 0, 0, 0.05)` | `rgba(255, 255, 255, 0.06)` |

### 2.3 Schatten & Elevation
| Token (CSS Variable) | Tailwind Utility | Light Value | Dark Value |
|---|---|---|---|
| `--shadow-sm` | `shadow-sm` | `0 1px 2px 0 rgb(0 0 0 / 0.05)` | `0 1px 2px 0 rgb(0 0 0 / 0.3)` |
| `--shadow-float` | `shadow-float` | `0px 8px 24px rgba(0, 0, 0, 0.08)` | `0px 8px 24px rgba(0, 0, 0, 0.3)` |
| `--shadow-modal` | `shadow-modal` | `0px 24px 64px rgba(0, 0, 0, 0.16)` | `0px 24px 64px rgba(0, 0, 0, 0.45)` |

### 2.4 Radien
| Token (CSS Variable) | Tailwind Utility | Wert | Verwendung |
|---|---|---|---|
| `--radius-sm` | `rounded-sm` | `6px` | Badges, Chips, kleine Icons |
| `--radius` | `rounded-ui` | `8px` | Buttons, Form-Inputs, Tabs |
| `--radius-lg` | `rounded-card` | `14px` | Kalenderkacheln, Notiz-Kacheln, Panels |
| `--radius-modal` | `rounded-modal` | `24px` | Modale Dialoge, Bestätigungsfenster |

### 2.5 Markierungen (Highlights)
Highlights für Text-Annotationen, Notizmarker und Kalender-Tags:

| Name | Background (Light) | Text (Light) | Background (Dark) | Text (Dark) |
|---|---|---|---|---|
| **yellow** | `#fef08a` | `#854d0e` | `rgba(234, 179, 8, 0.25)` | `#fef08a` |
| **green** | `#bbf7d0` | `#166534` | `rgba(34, 197, 94, 0.25)` | `#bbf7d0` |
| **blue** | `#bfdbfe` | `#1e40af` | `rgba(59, 130, 246, 0.25)` | `#bfdbfe` |
| **purple** | `#e9d5ff` | `#6b21a8` | `rgba(168, 85, 247, 0.25)` | `#e9d5ff` |
| **pink** | `#fbcfe8` | `#9d174d` | `rgba(236, 72, 153, 0.25)` | `#fbcfe8` |

---

## 3. Komponenten-Matrix

| Komponente / Element | Dateipfad | Eingesetzte Tokens | Beschreibung |
|---|---|---|---|
| **Modal Container** | `src/components/UI/Modal.tsx` | `rounded-modal`, `shadow-modal`, `border-border`, `bg-white dark:bg-[#18181b]` | Zentrales modales Dialogfenster |
| **Confirm Modal** | `src/components/Modals/ConfirmModal.tsx` | `rounded-modal`, `shadow-modal`, `border-border`, `rounded-ui` | Bestätigungs- und Löschdialoge |
| **Kalender Container** | `src/app/calendar/calendar.css`, `CalendarView.tsx` | `var(--foreground)`, `var(--border-grid)`, `shadow-float` | Desktop & Mobile Kalenderansichten |
| **Canvas & Ink Layers** | `src/components/Canvas/PencilInkLayer.tsx` | `DT.accent`, `DT.status`, `DT.radius` | Apple Pencil und Freihand-Skizzen |
| **Search & Overlays** | `src/components/Workspaces/SearchOverlay.tsx` | `DT.modal`, `shadow-modal`, `rounded-modal` | Volltextsuche und Schnellauswahl |
| **Form Inputs** | `src/app/globals.css` (`.glass-input`) | `var(--radius)`, `var(--border-color)`, `var(--input-text)` | Einheitliche Eingabefelder |

---

## 4. Anleitung für ein Re-Theming / Designwechsel

Ein Re-Theming erfordert durch die Token-Architektur keine manuellen Änderungen an Dutzenden JSX-Dateien.

### Schritt 1: CSS-Variablen in `globals.css` anpassen
Öffne `web/src/app/globals.css` und ändere die Werte in `:root` und `.dark`:
```css
:root {
  --font-sans: 'Plus Jakarta Sans', sans-serif; /* Neue Schrift */
  --radius-modal: 16px;                         /* Eckigere Modals */
  --radius-lg: 10px;                            /* Eckigere Cards */
  --shadow-modal: 0px 20px 50px rgba(0,0,0,0.1);
}
```

### Schritt 2: Dark Mode & SSR-Fallback angleichen
Passe in `globals.css` die `.dark` Sektion sowie den `@media (prefers-color-scheme: dark)` Block entsprechend an.

### Schritt 3: Tailwind Config & TypeScript Tokens prüfen
Falls neue Token-Kategorien hinzukommen, trage sie in `web/tailwind.config.js` ein und aktualisiere `web/src/lib/designTokens.ts`.

### Schritt 4: Verifikation
Führe nach allen Anpassungen die Standard-Verifikation aus:
```bash
cd web
npx tsc --noEmit
npm run lint 2>&1 | tail -5
npm run build
```
