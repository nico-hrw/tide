import type { CalendarShareRules } from '@/lib/calendarShare';

/** Where a person's access to an item comes from (shown as the second line of a person row). */
export type ShareOrigin =
    | { kind: 'mention' }
    | { kind: 'calendar'; groupId: string; name: string | undefined };

/**
 * Origins of one person's access: a stored @-mention entry, and every calendar rule (of a group the
 * item belongs to) that lists the person. Mention first. Empty = no addition to show.
 */
export function getShareOrigins(args: {
    userId: string;
    groupIds: string[];
    rules: CalendarShareRules;
    mentionOrigin?: 'mention';
    groupTitles?: Record<string, string>;
}): ShareOrigin[] {
    const out: ShareOrigin[] = [];
    if (args.mentionOrigin === 'mention') out.push({ kind: 'mention' });
    for (const groupId of args.groupIds) {
        const rule = args.rules[groupId];
        if (rule?.recipients.some((r) => r.userId === args.userId)) {
            out.push({ kind: 'calendar', groupId, name: args.groupTitles?.[groupId] });
        }
    }
    return out;
}
