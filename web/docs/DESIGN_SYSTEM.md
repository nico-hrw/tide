# Tide Design System

> Umfassende Dokumentation des Designsystems für das Tide Web-Frontend.
> Dieses Dokument beschreibt die Architektur, Token-Hierarchien, die Komponenten-Matrix und die Vorgehensweise für Theming und Re-Designs.

---

## 0. Tide 2: Paletten (aktuelle Architektur)

Die Farben der App kommen aus **einem Satz Tokens** (`--t2-*`), der pro **Palette** und pro **Modus** (hell/dunkel) überschrieben wird. Komponenten benutzen nur die Tailwind-Klassen dieser Tokens und enthalten keine `dark:`-Varianten für Neutrale.

| Token | Tailwind | Rolle |
|---|---|---|
| `--t2-bg` | `bg-t2-bg` | Seitenhintergrund |
| `--t2-surface` | `bg-t2-surface` | Karten, Modals, Popover |
| `--t2-sub` | `bg-t2-sub` | Leise Flächen, Eingabefelder, aktive Segmente |
| `--t2-hover` | `bg-t2-hover` | Hover-Zustand |
| `--t2-stage` | `bg-t2-stage` | Bühne hinter Seiten |
| `--t2-ink` / `-2` / `-3` | `text-t2-ink`, `-ink-2`, `-ink-3` | Text: primär, sekundär, leise |
| `--t2-line` / `--t2-line-soft` | `border-t2-line`, `-line-soft` | Linien |
| `--t2-accent` / `--t2-accent-ink` | `bg-t2-accent text-t2-accent-ink` | **Akzent** für aktive Zustände, Hervorhebung, Fokus. Ersetzt jedes harte Blau/Indigo/Violett. |
| `--t2-blue` | `text-t2-blue` | Alias auf `--t2-accent` (Altname, nicht mehr neu verwenden) |
| `--t2-now`, `--t2-late` | `text-t2-now`, `-late` | "Jetzt"-Linie, überfällig |

**Abgeleitet (nie direkt setzen):** `--background`, `--foreground`, `--sidebar-bg`, `--border-color`, `--muted-text`, `--surface-modal*`, `--input-*` zeigen in `globals.css` auf die `--t2-*` Tokens, damit auch Altcode die Palette mitmacht.

**Nicht Teil der Palette:** Termin-Farben (`--cal-*`, Einstellung `calendarColorPalette`), vom Nutzer gewählte Farben (Referenzen, Ereignisse, Kollaborations-Cursor) und semantische Farben (Erfolg grün, Gefahr rot).

### Paletten-Mechanik
- Standard (`tide`): `:root` (hell) und `.dark` in `web/src/app/globals.css`.
- Weitere Paletten: `web/src/app/palettes.css`, je ein Block `:root[data-palette="name"]` (hell) und `:root[data-palette="name"].dark` (dunkel).
- Das Attribut `data-palette` auf `<html>` setzt `lib/palette.ts` (`applyPalette`). Beim Start passiert das im Store (`appPalette` in `createUiSlice.ts`), vor dem ersten Paint zusätzlich durch ein kleines Inline-Skript in `layout.tsx` (`PALETTE_BOOT_SCRIPT`).
- Gespeichert in `localStorage` unter `tide_app_palette`. Hell/Dunkel bleibt getrennt (`themePreference`).
- Auswahl in den Einstellungen unter Appearance, vorschauchips aus `PALETTE_PREVIEW` in `designTokens.ts`.

### Neue Palette hinzufügen
1. In `palettes.css` ein Blockpaar kopieren und die Werte ändern (alle Tokens der Tabelle oben, hell und dunkel).
2. Id in `AppPalette` und `PALETTES` (`lib/palette.ts`) ergänzen, bei Bedarf in `PALETTE_BOOT_SCRIPT`.
3. Vorschau in `PALETTE_PREVIEW` (`designTokens.ts`) eintragen.
4. Prüfen: Kalender, Todos, Notiz, Sidebar in Hell und Dunkel.

### Regeln für Komponenten
- Neutrale Farben nur über `t2-*`-Klassen, nie `gray-*`, `slate-*`, `zinc-*` oder Hex.
- Akzent nur über `t2-accent`. Auf Akzentflächen `text-t2-accent-ink`. Kein `blue-*`, `indigo-*`, `violet-*`, `purple-*`.
- Halbtransparente Akzent-Töne in CSS mit `color-mix(in srgb, var(--t2-accent) 14%, transparent)` (Tailwind-Deckkraft funktioniert mit den Variablen nicht).
- Keine `dark:`-Klassen für Farben, die ein Token abdeckt.

> Die folgenden Abschnitte beschreiben das ältere Token-Modell (bleibt für Radien, Schatten und Highlights gültig).

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
