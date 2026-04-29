# Calendar ↔ Notes Workflow — Design Spec

**Status:** Draft for review
**Date:** 2026-04-28
**Scope:** Feature B (Calendar↔Notes) only. Feature A (Sharing) gets a separate spec.

## Problem

Tide currently treats Calendar and Notes as separate views. The user must mentally context-switch between them, even though they often relate ("I'll plan this in a note, schedule it in the calendar"). Two specific friction points:

1. **No way to drop a calendar event into a note as a live, clickable reference.** Users currently re-type or copy-paste, which loses fidelity and can't update if the event is rescheduled.
2. **No automatic recognition of dates in note text.** A user writing "Freitag 15 Uhr Mensa" must manually open the schedule modal, fill in fields, and create the event. This breaks flow.

## Goals

- Drag a calendar event onto a note → event is inserted as a live mention that auto-updates if the source event changes.
- Detect German date/time phrases in note text → SmartIsland proposes creating a calendar event with one click.
- Keep both features togglable; respect users on low-spec devices (manual `/date` mode).

## Non-Goals (V1)

- English / multi-language support for the date parser.
- Recurring-event detection ("jeden Freitag").
- Cross-language date phrases ("morgen 3pm").
- Detecting events from Markdown-rendered text (we only run on the user's editing paragraph).
- Live cross-sync between two notes that reference the same event (each note's mention reads from the same store, so this just works for free — no special wiring needed).

## Architecture Overview

```
┌────────────────────────────────────────────────────────────┐
│                     PAGE.TSX (root)                         │
│   ┌──────────┐   ┌────────────────────────────────────┐    │
│   │ Sidebar  │   │ Editor / CalendarView / Tabs       │    │
│   └──────────┘   └────────────────────────────────────┘    │
│         ↑                       ↑                           │
│   drop target              edit area                        │
└────────────────────────────────────────────────────────────┘
                              │
                  ┌───────────┴───────────┐
                  │  useDragGhost (new)    │
                  │  — phase tracker       │
                  │  — eventSnapshot       │
                  └────────────────────────┘
                              │
                       Portal: <DragGhost />
                       (z-index 9999, follows mouse)


SmartIsland queue ← useDateDetection (new) ← useIslandStore
                              ↑
                     parseGermanDate (new pure fn)
                              ↑
                     editor's onUpdate (debounced)
```

Two independent subsystems share only the `CalendarEventMentionExtension` (already exists, extended in this work).

---

## B1: Event → Note Drag (Two-Phase Ghost)

### User Story

The user is in the Calendar view. They want to reference a specific event inside their note "Project planning". They grab the event card, drag it over to "Project planning" in the sidebar — the note opens. A semi-transparent pill follows their cursor. They click somewhere in the note's text — the pill snaps into place as a `@Meeting 28.04 15:00` mention. ESC at any time aborts.

### Phase 1 — Drag from Calendar to Sidebar File

**Reuse existing infrastructure.** `CalendarEventItem.tsx` already implements HTML5 `draggable` on a small handle that sets `dataTransfer.setData('tide/calendar-event', JSON.stringify({...}))`. Phase 1 keeps this:

- Native HTML5 drag is used because the browser handles the drag-image z-index correctly (renders above sidebar/calendar without effort).
- During drag, every `Sidebar` file row registers `onDragOver` / `onDrop` handlers that check for `dataTransfer.types.includes('tide/calendar-event')`. If matched, the row gets a highlight class (e.g., `ring-2 ring-violet-400`).
- On drop:
  - Read `tide/calendar-event` payload (eventId, title, start, end, color)
  - Open the dropped-on note: `switchTab(fileId, 'file', title)`
  - Trigger Phase 2 by setting a global drag-ghost state via `useDragGhost.startGhost({ eventId, snapshot })`

### Phase 2 — Ghost Following Cursor in Editor

After Phase 1 ends, the user is in the editor with a "pending insert". The ghost cursor is rendered via React Portal so z-index issues do not bite us:

- New file: `web/src/components/Canvas/DragGhost.tsx` — uses `createPortal(...,document.body)`, listens to `mousemove` on `window` and updates `style.left` / `style.top` directly (no React state per move; ref + RAF for smooth 60fps).
- The ghost displays the same chip as the final mention: `📌 @Meeting 28.04 15:00`. Pointer-events `none` so the user can drop "through" it.
- The ghost is gated behind `useDragGhost.active`. The hook exposes:
  ```ts
  {
    active: boolean,
    snapshot: { eventId, title, start, end, color } | null,
    startGhost(snapshot),
    consumeAt(pos: ProseMirrorPos),  // inserts mention, clears ghost
    cancel(),
  }
  ```
- Editor adds a click handler (capture phase) that, when `useDragGhost.active`, intercepts the click, computes the ProseMirror position from the click coords, and calls `consumeAt(pos)`.
- ESC key on `window` (when active) calls `cancel()`.

### The CalendarEventMention Node

Extend the existing `CalendarEventMentionExtension`:

- Stored attribute: `eventId: string` only. No cached title/date.
- React node-view reads `useDataStore(s => s.events.find(e => e.id === eventId))`.
  - If found: render `@<title> dd.MM HH:mm` using the live event data.
  - If not found (deleted): render `@<deleted event>` with a subtle strikethrough style.
- Click handler: dispatches `tide:navigate` (or similar existing event) to switch to calendar tab + scroll to that event date.

### Z-Index Note

The user reported that during in-calendar drags the event element disappears under the sidebar. This is a separate pre-existing issue and not strictly part of B1 (Phase 1 uses HTML5 drag-image which the browser handles). However, since the implementation work is in the same area, we will:

- Audit z-index of `Sidebar`, `Calendar`, and the existing in-calendar drag-overlay (`DragGhost.tsx` already exists for in-calendar drags — different component).
- If needed, lift any custom-rendered ghost or drag indicators to a Portal at `z-index: 9999`.

---

## B2: Smart Date Detection

### User Story

The user types `"Freitag 15 Uhr Mensa zum Mittagessen"` in their note. ~600ms after they stop typing, SmartIsland gently slides in a card: _"Möchtest du am Fr 01.05. um 15:00 (bis 16:00) den Termin „Mensa" erstellen?"_ with three buttons — green checkmark, yellow pen, gray cross. Green: event is created and `@Mensa 01.05 15:00` is appended after the sentence. Yellow pen: card flips to edit mode where date/time/title fields become clickable. Cross: card dismisses; same span won't re-trigger.

### Module: `web/src/lib/dateParser.ts`

A pure function with no side effects. Easy to unit-test.

```ts
export type DetectedToken =
  | { type: 'date'; span: [number, number]; date: Date }
  | { type: 'time'; span: [number, number]; hour: number; minute: number };

export type ParseResult = {
  // The contiguous span the proposal would replace if we replaced (we don't — append instead).
  // Used for visualization in SmartIsland and for dedup keys.
  span: [number, number];

  // Default proposal values — based on first date + first two times.
  proposedDate: Date;
  proposedStart: Date;
  proposedEnd: Date;          // = start + 60min if no second time

  // For Smart Cycling: all date/time tokens in this block.
  allTokens: DetectedToken[];

  // Heuristic title — capitalized nouns near the date span.
  titleHint: string;
};

export function parseGermanDate(text: string, baseDate: Date): ParseResult[];
```

Supported patterns (V1):

| Category | Examples |
|---|---|
| Weekdays | `Freitag`, `Fr`, `Fr.`, `nächster Freitag`, `kommenden Freitag` |
| Relative | `heute`, `morgen`, `übermorgen`, `in 3 Tagen`, `nächste Woche` |
| Explicit dates | `1.5.`, `01.05.2026`, `1. Mai`, `15.03.` |
| Times | `15 Uhr`, `15:00`, `15:30` |
| Time ranges | `15-17 Uhr`, `15:00-17:00`, `von 15 bis 17 Uhr` |

**Future consideration (out of V1 scope):**
- Migrate to [chrono-node](https://github.com/wanasit/chrono) once we need multilanguage / fuzzy parsing. The interface (`parseGermanDate(text, baseDate) → ParseResult[]`) is designed to be a thin adapter; chrono-node integration would replace the implementation without touching callers.
- Add a personal "known event titles" index (encrypted, per-user). Parser would prefer exact matches from this index over the generic noun heuristic for title extraction.

### Hook: `useDateDetection`

```ts
useDateDetection({
  editor: TipTapEditor,
  enabled: boolean,           // Settings: smart_date_detection.enabled
  mode: 'auto' | 'manual',    // Settings: smart_date_detection.mode
});
```

**Auto mode:** subscribes to editor's `onUpdate` event, debounced 600ms. On fire, parses **only the currently focused block** (one paragraph), pushes results onto SmartIsland queue.

**Manual mode:** registers `/date` slash command. When invoked, parses the current block immediately.

**Per-block dedup:** the hook maintains a `Map<blockId, Set<spanKey>>` of already-handled suggestions. `spanKey = parseResult.span[0] + ':' + parseResult.span[1] + ':' + spanText`. When a suggestion is accepted (✓) or dismissed (✗), the key is added. Re-parsing the same block skips spans whose key is in the set.

If the user edits the text inside a handled span, the span content (and therefore the key) changes → new detection allowed. This is the intended behavior.

When the block content is wiped (length 0) or the block is deleted, the Map entry is cleared.

### SmartIsland Card: `event_suggestion`

New card type pushed to `useIslandStore`:

```ts
{
  type: 'event_suggestion',
  payload: {
    blockId: string,
    parseResult: ParseResult,
  }
}
```

The card renders:

```
Möchtest du am Fr 01.05.  um  15:00  (bis  16:00)  den Termin  „Mensa"  erstellen?
                  [date]   [start]    [end]                    [title]

   [✓ green check]   [✏️ yellow pen]   [✗ gray cross]
```

- **✓** → calls `handleEventCreate({ title, start, end })` (existing flow), then inserts a `CalendarEventMention` node at the end of the block (after a space). Marks span as handled.
- **✏️** → flips card into edit mode. Each underlined field becomes clickable.
- **✗** → dismisses, marks span as handled.

### Edit Mode + Smart Cycling

When the user clicks ✏️, fields become interactive:

1. **Date / Start / End** → click activates "cycling mode" for that field:
   - The corresponding original token in the editor gets a `<mark>`-style highlight. This is a **transient ProseMirror decoration** (not a permanent mark) — it disappears when cycling exits.
   - **Right Arrow** moves selection to the next token of same type (date or time) found in the block.
   - **Left Arrow** moves to previous.
   - **Number keys** type a new value directly (e.g., `1`, `7` produces `17`).
   - **Enter** or click outside the field commits and exits cycling mode.
   - If selecting an end-time that is ≤ start, the system clamps end = start + 5min (so the event has visible duration).

2. **Title** → click turns it into an inline `<input>` for direct text editing. Blur or Enter commits.

ProseMirror decorations are managed via a temporary plugin `temporaryHighlight` that the hook installs and removes per-cycling-session.

### Multi-Match Behavior (Per-Line Naivety)

We assume "one event per line". Parser may find multiple date/time tokens, but:

- Only the **first ParseResult** is offered as a SmartIsland suggestion.
- Smart Cycling lets the user navigate to other tokens if the first guess was wrong.
- After ✓ or ✗, the next ParseResult (if any) becomes eligible — still subject to the dedup set.

### Append Position

After ✓:

- If the detected span ends at character N in the block's text, the mention node is inserted at the end of the **containing sentence** (after the next `.`/`!`/`?`/end-of-block).
- A space is inserted before the mention if the preceding character is not whitespace.
- Example: `"... zum Mittagessen."` → `"... zum Mittagessen. @Mensa 01.05 15:00"`.

### Settings

New section in `SettingsModal.tsx`: **Smart Date Detection**

| Field | Type | Default | Description |
|---|---|---|---|
| Enabled | toggle | `true` | Master switch. When off, neither auto nor `/date` works. |
| Mode | radio: `Auto` / `Manuell` | `Auto` | Auto runs on debounced edit; manual only on `/date`. |

Persisted via existing settings mechanism (extension config or new key in user preferences).

---

## Data Model Changes

### TipTap Schema

`CalendarEventMention` node already exists. Confirmed/updated attributes:
- `eventId: string` (only attribute)
- Render: `<span class="calendar-event-mention" data-event-id="…">`

### Zustand Store

No new top-level state. `useDragGhost` is its own small store; `useDateDetection` keeps its dedup map in a local `useRef`.

### Settings

```ts
// New keys
{
  smart_date_detection: {
    enabled: boolean,
    mode: 'auto' | 'manual',
  }
}
```

Stored under existing user preferences.

---

## Out of Scope (this spec)

- Sharing/Access Control (Feature A) — separate spec.
- Recurring date detection ("jeden Freitag", "monatlich am 15.").
- Multilingual parser.
- "Known titles" index for parser.
- Inline date edit modal (`ScheduleModal` reuse) — yellow pen triggers in-card edit only.
- Cross-paragraph event detection.

## Future Considerations (Backlog)

- **chrono-node migration** for richer parsing and English support.
- **Known-titles index:** encrypted per-user list of recurring event names; parser prefers matches.
- **Smart cycling for dates:** currently described for times; extend to dates with the same UX.
- **Inline preview snapshot:** when hovering a `CalendarEventMention`, show a small popover with description + parent theme.
- **Multi-event-per-line:** if a user really writes "10:00 Sport, 14:00 Mathe" in one line, future versions could split.

## Testing Strategy

- **Pure parser unit tests** (`dateParser.test.ts`) — exhaustive table of input → expected `ParseResult[]`.
- **Component test** for `SmartIsland event_suggestion card`: render, ✓/✏️/✗ interactions.
- **Integration test** in editor: type a phrase, expect SmartIsland card after debounce; accept; expect mention inserted.
- **DragGhost manual test:** drag from calendar to sidebar; ghost appears; click in editor; mention inserted.

## Open Questions

(none at design time — all clarified during brainstorming)
