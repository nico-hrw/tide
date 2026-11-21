/** Marker attribute on the portaled TagPicker panel so host popovers can treat it as "inside". */
export const TAG_PICKER_PANEL_ATTR = 'data-tag-picker-panel';

/** True when the event target lies within a TagPicker panel (which is portaled to document.body). */
export function isInsideTagPickerPanel(target: EventTarget | null): boolean {
  const el = target as Element | null;
  return typeof el?.closest === 'function' && el.closest(`[${TAG_PICKER_PANEL_ATTR}]`) !== null;
}
