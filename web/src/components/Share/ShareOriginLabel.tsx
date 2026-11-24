'use client';

import React from 'react';
import { useT } from '@/components/Settings/useT';
import { useMentionShareStore } from '@/store/useMentionShareStore';
import { useCalendarShareRules } from '@/store/useCalendarShareStore';
import { useDataStore } from '@/store/useDataStore';
import { getEventGroupIds } from '@/lib/calendarUtils';
import { getShareOrigins } from './shareOrigins';

/** Calendar groups an item belongs to (events only; notes have none). Derived from the event list. */
export function useItemGroupIds(fileId: string): string[] {
    const events = useDataStore((s) => s.events);
    const event = (events as unknown as { id: string; groupIds?: string[]; parent_id?: string | null }[]).find((e) => e.id === fileId);
    return React.useMemo(() => (event ? getEventGroupIds(event) : []), [event]);
}

/** "Über @-Erwähnung · Aus Kalender „Arbeit“" for one person, or nothing. */
export function useShareOriginText({ fileId, userId, groupIds, groupTitles }: {
    fileId: string;
    userId: string;
    groupIds: string[];
    groupTitles?: Record<string, string>;
}): string {
    const t = useT();
    const rules = useCalendarShareRules();
    const mentionOrigin = useMentionShareStore((s) => (s.origin(fileId, userId)));
    return getShareOrigins({ userId, groupIds, rules, mentionOrigin, groupTitles })
        .map((o) => o.kind === 'mention'
            ? t('share.originMention')
            : o.name ? t('share.originCalendar', { name: o.name }) : t('share.originCalendarAnon'))
        .join(' · ');
}

/** Origin line as an element; renders nothing when there is no origin. */
export function ShareOriginLabel(props: { fileId: string; userId: string; groupIds: string[]; groupTitles?: Record<string, string> }) {
    const text = useShareOriginText(props);
    return text ? <span data-share-origin>{text}</span> : null;
}
