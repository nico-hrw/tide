# TIDE Frontend Conventions (`web/`)

> Rules enforced for all frontend code in `web/`.

## 1. File & Directory Rules

- **Max 500 lines per file**: If a component grows beyond 500 lines, extract subcomponents or custom hooks.
- **Group by domain**: Place components under `components/<Domain>/` (e.g. `components/Calendar/`), not generic buckets.
- **Client components**: Add `"use client"` at the top of every interactive component.
- **No new `any`**: Existing `any` are grandfathered; all new code must use typed interfaces or `unknown`.

## 2. API & Data Access

- **Always use `apiFetch`**: Never call standard `fetch` directly from components. All HTTP calls must route through `lib/api.ts` to ensure consistent header injection, authentication, and error handling.
- **Store updates**: Update state through Zustand actions in `store/useDataStore.ts`. Do not maintain parallel duplicate states across different component hierarchies.

## 3. Styling & Design Tokens

- **Single source of truth**: Visual constants (colors, border-radii, backdrop-blur, chip styling) **must** be imported from `lib/designTokens.ts` (`DT`).
- **Never mix border shorthand**: Do not mix `border` with `borderTop`/`borderBottom` on the same element (triggers React hydration warnings).
- **CSS classes vs inline styles**: Use Tailwind classes for structural layout and padding/margins; use inline `style={{}}` only for dynamic positions and token-driven color opacities.

## 4. Mobile & Touch Handling

- **Touch gestures**: `touchAction` is evaluated at `touchstart`. Changing it mid-touch has no effect on the current touch sequence.
- **Synchronous state**: In touchend handlers where DOM state must match before layout recalculations, wrap state resets in `flushSync` from `react-dom`.
- **iOS scroll unlock**: If calling `preventDefault()` during a touch drag sequence, jiggle `scrollTop ± 1` on touchend to re-enable UIScrollView.
