# 001: Precise Mode for Calendar Drag & Drop

## Changed Files
- `web/src/components/Calendar/CalendarView.tsx`
- `web/src/components/Calendar/DayColumn.tsx`

## Database Updates
- None

## Technical Reasoning
The user requested a "Pro" level scheduling experience where holding a modifier key (`Alt` or `Shift`) bypasses the standard 10-minute snap grid to allow precise 1-minute event scheduling.

To achieve this without blocking the React render cycle or causing lag:
1.  **State Tracking**: Implemented a global `keydown`/`keyup` listener effect in `CalendarView.tsx` tracking `Alt` and `Shift`. When held, `isPreciseMode` is set to true. We mirror this value iteratively to a `useRef` to ensure async drag handlers have instantaneous access.
2.  **Drag Handlers**: Inside the `onMouseMove` loop, we began recording `cursorCoords` to accurately position a floating frosted glass UI "Time Magnifier" element absolute to the document. Inside `handleGlobalMouseUp`, calculations utilizing `/ 15` divisors were refactored into dynamically scaling `/ snapInterval` variables based on `isPreciseMode`.
3.  **Visual Alignment**: Passed `snapInterval` to `DayColumn.tsx` to align the visual rendering of the dragged creation block accurately alongside the cursor, matching the time interval computed by the parent structure exactly.
