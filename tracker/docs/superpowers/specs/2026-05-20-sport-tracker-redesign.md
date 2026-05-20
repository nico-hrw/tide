# Sport Tracker UI Redesign — Design Spec
**Date:** 2026-05-20  
**Status:** Approved via visual companion session

---

## 1. Design System

### 1.1 Colors

| Token | Value | Usage |
|---|---|---|
| `bg-base` | `#1E1E24` | App background |
| `bg-card` | `#27272F` | Cards, list items |
| `bg-card-elevated` | `#2E2E38` | Modals, bottom sheets |
| `bg-nav` | `#18181F` | Bottom navigation |
| `border` | `#2E2E38` | Dividers, borders |
| `accent-orange` | `#FF6B3D` | Primary CTA, Streak widget, active states |
| `accent-blue` | `#5BB8FF` | Secondary accent, Friends widget, info chips |
| `text-primary` | `#F9FAFB` | Headlines, values |
| `text-secondary` | `#9CA3AF` | Labels, timestamps |
| `text-muted` | `#6B7280` | Placeholders, disabled |
| `text-on-orange` | `#FFFFFF` | Text on orange backgrounds |
| `text-on-blue` | `#0D1117` | Text on blue backgrounds |

### 1.2 Typography

**Font:** [Outfit](https://fonts.google.com/specimen/Outfit) — variable weight 100–900  
**Integration:** `next/font/google` (zero layout shift, self-hosted)

```ts
// app/layout.tsx
import { Outfit } from 'next/font/google'
const outfit = Outfit({ subsets: ['latin'], variable: '--font-outfit' })
```

| Role | Size | Weight |
|---|---|---|
| Hero number (Streak) | 52–54px | 900 |
| Friend stat | 32–34px | 900 |
| Screen title | 26–28px | 900 |
| Section heading | 11–12px | 700 |
| Card title | 11–12px | 700 |
| Body / label | 9–10px | 500 |
| Caption / timestamp | 7–8px | 400–500 |
| Uppercase label | 7–8px | 600, tracking 0.08em |

### 1.3 Spacing & Radius

- Screen horizontal padding: `16px`
- Card gap: `9px`
- Widget internal padding: `14px`
- Card border radius: `13–16px`
- Button border radius: `15px`
- Pill radius: `20px` (full)

### 1.4 Shadows & Glows

- CTA button: `box-shadow: 0 4px 20px rgba(255,107,61,0.4)`
- Card elevation: none (color contrast handles separation)

---

## 2. Navigation

**3 tabs** — Home, Verlauf, Stats  
Home and Workout are **one screen** with state-based transitions.

```
[ Home ]  [ Verlauf ]  [ Stats ]
```

- Active icon: `accent-orange`, weight 2.5
- Inactive icon: `#4B5563`, weight 1.8
- Nav background: `bg-nav` (`#18181F`), 1px top border `#2E2E38`
- Height: `50px` including safe area bottom padding

**Removed tab:** "Workout" tab deleted — workout starts directly from Home CTA.

---

## 3. Home Screen

### 3.1 Layout (static — no scroll)

```
┌─────────────────────────────┐
│ 22:11                  73%  │  ← status bar
├─────────────────────────────┤
│ Guten Abend 👋              │  ← 11px/500, muted
│ Nico                        │  ← 28px/900, primary
│                             │  ← generous padding (16px bottom)
├──────────────┬──────────────┤
│  STREAK      │  [friends]   │  ← 120px tall each
│  7 🔥        │  Jim         │
│  (orange)    │  6 km        │
│              │  gelaufen 🏃 │
│              │  vor 2 Std.  │
│              │  (blue)      │
├──────────────┴──────────────┤
│  AKTIVITÄT DIESE WOCHE      │  ← white card
│  ▓▓▓▓ ▓▓▓  ░  ░  ░  ░  ░  │
│  Mo  Di  Mi  Do  Fr  Sa  So │
│              - - Ø - - - -  │  ← dashed avg line
├─────────────────────────────┤
│  LETZTES WORKOUT            │
│  Push Day          [SVG]    │
│  Di · 45 Min                │
│  [Brust] [Trizeps]          │
├─────────────────────────────┤
│  flex:1 spacer              │
├─────────────────────────────┤
│  ██ Worauf wartest du? 💪 ██│  ← sticky CTA, orange
├─────────────────────────────┤
│  Home    Verlauf    Stats   │  ← nav
└─────────────────────────────┘
```

### 3.2 Streak Widget

- Background: `accent-orange`
- Label: "STREAK", 8px/600, `rgba(255,255,255,0.6)`, uppercase
- Number: 52px/900, white
- Fire emoji: 40px, vertically centered alongside number
- Layout: label top-left, number+fire filling remaining space

### 3.3 Friends Widget

- Background: `accent-blue`
- **No label text** — content fills the entire widget (watch-face philosophy)
- Name: 13px/700, `rgba(0,0,0,0.45)` — dimmed, subordinate
- Stat (number + unit): 32–34px/900, `#0D1117` — dominates the widget
- Action: 11px/600, `rgba(0,0,0,0.6)`
- Timestamp: 9px/400, `rgba(0,0,0,0.35)`
- Dot indicators (3 dots) bottom-right for swipe hint
- Auto-rotates between friend activities every 4s (`setInterval` in `useEffect`)
- Empty state: "Noch keine Freunde aktiv heute 🤫"
- Data source: **initially static mock data** (array of hardcoded friend activities). Real API integration (from main `web/` app's social layer) is out of scope for this iteration — see section 11.

### 3.4 Weekly Activity Chart

- Background: **white** (`#FFFFFF`)
- 7 bars, Mo–So, today highlighted with dashed orange border
- Bar fill: `linear-gradient(to top, #FF6B3D, #FF9A7A)`
- Empty days: `#F3F4F6`
- Average line: `1.5px dashed #D1D5DB`, horizontal at average bar height
- Ø label: small tag right-aligned at avg line
- Bar height represents workout duration in minutes (relative to max of the week)

### 3.5 Letztes Workout Card

- Background: `bg-card` (`#27272F`)
- **No colored left border stripe**
- Muscle chips: orange for primary muscles, blue for secondary
- Mini MuscleSVG (front only, `sm` size) right-aligned
- If no previous workouts: card is hidden entirely

### 3.6 CTA Button (sticky)

- `position: absolute; bottom: 50px` (sits directly above nav, never clipped)
- Gradient fade above: `linear-gradient(to top, #1E1E24 65%, transparent)`
- Background: `accent-orange`, `border-radius: 15px`, `padding: 16px`
- Glow: `box-shadow: 0 4px 20px rgba(255,107,61,0.4)`
- Text: 14px/800, white

**Motivational phrases** (random on mount, not on re-render):

```ts
const PHRASES = [
  'Los geht\'s! 💪',
  'Worauf wartest du?',
  'Jetzt oder nie 💪',
  'Mach es. Jetzt.',
  'Dein besseres Ich wartet.',
  'Heute zählt. 🔥',
  'Kein Aufschub mehr.',
  'Eine Einheit. Mehr nicht.',
  'Du weißt, dass du es willst.',
  'Stärker als gestern.',
  'Keine Ausreden. 💪',
  'Die beste Zeit ist jetzt.',
]
// useMemo(() => PHRASES[Math.floor(Math.random() * PHRASES.length)], [])
```

---

## 4. Workout Start Flow (Fly-Up Transition)

Home and workout view live in the same page component. Transition when CTA is tapped:

### 4.1 Animation

```
Home widgets → translateY(-40px) + opacity(0), duration 250ms, ease-in
Workout view → translateY(40px)→0 + opacity(0)→1, duration 300ms, ease-out, delay 100ms
```

Use `useState<'idle' | 'starting' | 'active'>` to drive CSS class transitions.

### 4.2 Workout Name Input

Shown as part of the workout start screen (after fly-up). Clean dark input, large placeholder text.

### 4.3 Muscle Selection

**Layout:** Front SVG + Back SVG side by side as live preview (non-interactive display), grouped pills below for selection.

```
[Front SVG]  [Back SVG]    ← display only, highlights selected muscles
                            
OBERKÖRPER
[Brust] [Schulter v.] [Schulter h.] [Trizeps] [Bizeps]

RÜCKEN & CORE
[Oberer Rücken] [Latissimus] [Trapez] [Bauch]

UNTERKÖRPER
[Quadrizeps] [Hamstrings] [Gesäß] [Waden] [Unterarme]
```

Pills: inactive = `bg-card` + `border` border + muted text; active = `accent-orange` fill, white text.

**Code comment to add in `MuscleSVG.tsx`:**
```tsx
{/* TODO: Interactive muscle selection — replace pills with direct SVG tap targets.
    Each <path> can receive onClick + visual highlight when interactive=true.
    Also: consider replacing SVG paths with high-quality anatomical images (PNG/WebP)
    per muscle group for a premium feel. The interactive prop and onToggle callback
    are already wired — swap the SVG content when assets are ready. */}
```

### 4.4 Start Button

Same sticky orange CTA style. Text: "Starten →".

---

## 5. Active Workout View

Replaces home content after fly-up transition (same tab, no navigation).

### 5.1 Header

Orange card (`accent-orange`), `border-radius: 14px`:
- Left: workout name (14px/800, white) + elapsed timer (10px/700, `rgba(255,255,255,0.7)`, tabular nums)
- Right: timer display with dark pill background

### 5.2 Exercise List

Each exercise row in `bg-card`, `border-radius: 12px`:
- Category dot (6px circle): blue for strength, orange for cardio, purple for flexibility
- Exercise name (11px/600) + set count below (8px, muted)
- Right: checkmark icon (green, if any sets completed) + mini MuscleSVG
- Active exercise: `border: 1px solid accent-orange`
- Tap row → opens SetLogger bottom sheet

### 5.3 Add Exercise Button

Dashed border `#2A2A35`, `border-radius: 12px`, muted text.

### 5.4 Finish / Cancel

- "Workout beenden": `bg-card`, `border: 1px solid #374151`, muted text
- Confirm state: inline confirmation (no modal needed)

---

## 6. Exercise Picker (Bottom Sheet)

- Background: `bg-card-elevated` (`#2E2E38`)
- Drag handle: `4px` pill, `#4B5563`
- Search input: `bg-base`, `border-radius: 12px`, Outfit font
- Category filter pills: inactive = `bg-card`, active = color-coded (strength=blue, cardio=green, flexibility=purple)
- Exercise rows: `bg-card`, `border-radius: 10px`
- Category dot left, name + muscles below
- "Neue Übung" button: dark pill top-right

---

## 7. Set Logger (Bottom Sheet)

- Background: `bg-card-elevated`
- Exercise title: 18–20px/800, category color bar left (1px, 6px tall)
- SpinnerInput: dark background, large touch targets
- Completed sets list: `bg-card` rows, `border-radius: 10px`
- Warmup toggle + RIR/RPE: pill-style toggles
- "Satz hinzufügen" CTA: full-width orange, sticky bottom

---

## 8. History Screen (Verlauf)

- Header: "Verlauf" 24px/900
- Workout cards: `bg-card`, accordion expand/collapse
- Expanded state: muscle SVG (md size, front+back) + muscle chip list + set details
- Delete: small red text button inside expanded state (no prominent UI)
- Empty state: centered icon + text

---

## 9. Stats Screen

- Header: "Statistiken" 24px/900
- Summary grid: 2×2, `bg-card` — Streak (orange value), Workouts/Woche, Ø Dauer, Sätze gesamt
- Per-exercise charts: horizontal swipe cards, full-width minus padding
  - Line chart stroke: `accent-orange` for volume, `accent-blue` for 1RM
  - Recharts CartesianGrid: `stroke="#2E2E38"`
  - Axis ticks: `#6B7280`, 9px
  - Tooltip: dark background `#27272F`

---

## 10. Global Styles (`globals.css`)

```css
@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@100..900&display=swap');

html, body {
  background-color: #1E1E24;
  color: #F9FAFB;
  max-width: 430px;
  margin: 0 auto;
  min-height: 100dvh;
  font-family: 'Outfit', system-ui, sans-serif;
  -webkit-font-smoothing: antialiased;
}
```

---

## 11. Out of Scope (this iteration)

- Interactive MuscleSVG tap targets (placeholder comment added)
- Replacing SVG with anatomical images
- Social data API (Friends widget uses static mock data initially)
- Dark/light mode toggle
- Onboarding flow

---

## 12. File Impact Summary

| File | Change |
|---|---|
| `globals.css` | Dark bg, Outfit font |
| `app/layout.tsx` | next/font/google Outfit, remove Workout tab |
| `components/BottomNav.tsx` | 3 tabs, dark styled |
| `app/page.tsx` | Full redesign: static layout, widgets, fly-up |
| `components/ActiveWorkoutView.tsx` | Dark theme, orange header, transition |
| `components/ExercisePicker.tsx` | Dark bottom sheet |
| `components/SetLogger.tsx` | Dark bottom sheet, sticky CTA |
| `components/MuscleSVG.tsx` | Add TODO comment, adjust highlight colors |
| `components/StatCard.tsx` | Replaced by inline widget code on Home |
| `app/workout/page.tsx` | Can be removed (merged into Home) |
| `app/history/page.tsx` | Dark theme pass |
| `app/stats/page.tsx` | Dark theme, recharts restyled |
