# Sprint F — Navigation Polish + Social Tab
**Date:** 2026-05-14 | Status: Approved

## F1: Swipe animation direction fix
Use `useRef` instead of `useState` for `swipeDir` so value is synchronous at render time.
`swipeDirRef.current = 1` when going forward (swipe left), `-1` when going back (swipe right).
`getTabAnim()` reads `swipeDirRef.current`. Delete `swipeDir` state.

## F2: Remove event card swipe, put actions in expanded panel
Delete: swipe container div, left/right reveal backgrounds, motion.div drag on card, all drag* props, onDragEnd.
Restore: plain card div (`<div className="pl-4 pb-2 pt-2 pr-3 rounded-xl ...">` with backgroundColor style, no drag).
In expanded panel, keep Trash2 delete + add "Abschließen" button (only if is_task) that calls `onTaskComplete(id, true)`.
No more `editingDescId` or description textarea — too complex for panel space.

## F3: Dots get frosted background
Wrap the 4 dots in a frosted pill: `bg-white/60 backdrop-blur-sm rounded-full px-4 py-2`.

## F4: Tracker circle — bigger + centered + frosted
Change from `fixed bottom-3 right-4 w-44 h-44` to `fixed inset-0 flex items-center justify-center z-50` with a white/80 frosted container:
```tsx
<div className="fixed inset-0 flex items-center justify-center z-50 pointer-events-none">
  <div className="flex flex-col items-center gap-3 bg-white/80 backdrop-blur-md rounded-3xl p-8 shadow-xl">
    <svg width="80" height="80">... SVG with r=34 ...</svg>
    <span style={{ color: T.accent, fontWeight: 700 }}>{Math.round(trackerProgress * 100)}%</span>
  </div>
</div>
```

## F5: Month/week smooth transition (height animation)
Render both MiniCalendar and week strip simultaneously. Outer `motion.div` animates height:
- `isMonthExpanded = true`: height = 290
- `isMonthExpanded = false`: height = 68
Each child crossfades with `animate={{ opacity, y }}`.
Remove `AnimatePresence mode="wait"` (no longer needed).

## F6: Profile → Social tab
1. MobileLayoutProps: add `socialHubElement?: React.ReactNode`, change Tab type to include `'social'`
2. MobileLayout: tab 'profile' → 'social'. Tab header says "Social". Content = `{socialHubElement}`.
3. Profile accessible: small own-avatar button in social tab header → `setIsProfileOpen(true)` state.
   `isProfileOpen`: if true, show existing profile content (avatar card + menu) as overlay.
4. Icon in nav dots: no change (dots are generic).
5. page.tsx: pass `socialHubElement={<SocialHub onOpenProfile={...} onOpenFile={...} onOpenCalendar={...} userProfile={userProfile} privateKey={privateKey} />}` to MobileLayout.
   `onOpenProfile` for mobile: if `userId === myId` → no-op (user taps own avatar in SocialHub = handled by MobileLayout's own avatar button). Other profiles: no-op for mobile MVP.
   `onOpenFile(fileId, title, parentId)` → calls `handleFileSelect(fileId, title); setIsEditingNote(true)` via mobile's existing `onNoteSelect`.
   `onOpenCalendar()` → window.dispatchEvent(new CustomEvent('mobile_switch_calendar')).

## Files changed
- `web/src/components/Layout/MobileLayout.tsx`
- `web/src/app/page.tsx`
