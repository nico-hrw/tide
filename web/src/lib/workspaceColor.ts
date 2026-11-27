import { CALENDAR_CATEGORIES, type CalendarCategory } from './calendarColors';

/** Each workspace keeps one calendar colour, picked from its name, so workspaces are told apart at a glance. */
export function workspaceTone(name: string): CalendarCategory {
    let h = 0;
    for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) | 0;
    return CALENDAR_CATEGORIES[Math.abs(h) % CALENDAR_CATEGORIES.length];
}

/** "main" is shown as "Standard". */
export function workspaceLabel(name: string): string {
    return name === 'main' ? 'Standard' : name;
}
