"use client";

import React, { useState } from 'react';
import { format } from 'date-fns';
import { CalendarDays, Clock, Eye, EyeOff, Layers, Tag as TagIcon, Trash2 } from 'lucide-react';
import { WorkspacePicker } from '@/components/Todo/TodoWorkspacePicker';
import { isFromOtherWorkspace, todoSafe } from '@/lib/todoSafes';
import { useHiddenExternal } from '@/lib/hiddenExternal';
import { useDataStore } from '@/store/useDataStore';
import TagPicker from '@/components/Tags/TagPicker';
import { useTagCreate } from '@/components/Tags/useTagCreate';
import { CALENDAR_CATEGORIES, categoryVar, resolveCategory } from '@/lib/calendarColors';
import { getEventGroupIds } from '@/lib/calendarUtils';
import type { CalendarEvent } from './types';

type Theme = { id: string; title: string; effect?: string; color?: string };

interface CalendarEventEditorProps {
    event: CalendarEvent;
    themes: Theme[];
    /** Saves changes right away (like the todo detail pane: no extra "edit" step). */
    onUpdate: (updates: Partial<CalendarEvent> & Record<string, unknown>) => void;
    onDelete?: () => void;
}

const Row: React.FC<{ label: string; icon: React.ReactNode; children: React.ReactNode }> = ({ label, icon, children }) => (
    <div className="flex items-center gap-3 py-2 text-[14px] text-t2-ink">
        <span className="w-[92px] shrink-0 text-[13px] text-t2-ink-3">{label}</span>
        <span className="shrink-0 text-t2-ink-3">{icon}</span>
        <div className="min-w-0 flex-1">{children}</div>
    </div>
);

const toIso = (date: string, time: string) => new Date(`${date}T${time}:00`).toISOString();

/** Editable details of one event. Mount it with `key={event.id}` so the fields reset when another event is picked. */
export default function CalendarEventEditor({ event, themes, onUpdate, onDelete }: CalendarEventEditorProps) {
    const createTag = useTagCreate();
    const activeSafes = useDataStore((s) => s.activeSafes);
    const { hiddenIds: hiddenEventIds, hide: hideExternalEvent, unhide: unhideExternalEvent } = useHiddenExternal('event');
    const baseEventId = event.id.includes('_') ? event.id.split('_')[0] : event.id;
    const isExternalEvent = isFromOtherWorkspace(event, activeSafes ?? []);
    const isHiddenExternal = hiddenEventIds.has(baseEventId);
    const [title, setTitle] = useState(event.title ?? '');
    const [description, setDescription] = useState(event.description ?? '');

    const start = new Date(event.start);
    const end = new Date(event.end);
    const dateStr = format(start, 'yyyy-MM-dd');
    const startStr = format(start, 'HH:mm');
    const endStr = format(end, 'HH:mm');
    const groupIds = getEventGroupIds(event).filter((id) => themes.some((t) => t.id === id));
    const category = resolveCategory(event.color);

    const commitTitle = () => {
        const t = title.trim();
        if (!t) { setTitle(event.title ?? ''); return; }
        if (t !== event.title) onUpdate({ title: t });
    };

    // Keeps the duration when the start moves; an end before the start is pushed to the start.
    const changeTimes = (nextDate: string, nextStart: string, nextEnd: string) => {
        if (!nextDate || !nextStart || !nextEnd) return;
        const s = toIso(nextDate, nextStart);
        let e = toIso(nextDate, nextEnd);
        if (new Date(e).getTime() < new Date(s).getTime()) e = s;
        onUpdate({ start: s, end: e });
    };

    const inputCls = 'bg-transparent outline-none text-[14px] text-t2-ink cursor-pointer';

    return (
        <div className="flex flex-col gap-5">
            <div>
                <div className="mb-3 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5" role="radiogroup" aria-label="Farbe">
                        {CALENDAR_CATEGORIES.map((c) => (
                            <button
                                key={c.key}
                                type="button"
                                role="radio"
                                aria-checked={category.key === c.key}
                                title={c.name}
                                onClick={() => onUpdate({ color: c.key })}
                                className={`h-5 w-5 rounded-full transition-transform hover:scale-110 ${category.key === c.key ? 'ring-2 ring-t2-ink ring-offset-2 ring-offset-t2-bg' : ''}`}
                                style={{ background: categoryVar(c.key) }}
                            />
                        ))}
                    </div>
                    <div className="flex items-center gap-1">
                        {isExternalEvent && (
                            <button
                                type="button"
                                onClick={() => (isHiddenExternal ? unhideExternalEvent(baseEventId) : hideExternalEvent(baseEventId))}
                                aria-label={isHiddenExternal ? 'In diesem Workspace einblenden' : 'In diesem Workspace ausblenden'}
                                title={isHiddenExternal ? 'In diesem Workspace einblenden' : 'In diesem Workspace ausblenden'}
                                className="rounded-md p-1.5 text-t2-ink-3 hover:bg-t2-hover hover:text-t2-ink"
                            >
                                {isHiddenExternal ? <Eye size={15} /> : <EyeOff size={15} />}
                            </button>
                        )}
                        {onDelete && (
                            <button
                                type="button"
                                onClick={onDelete}
                                aria-label="Termin löschen"
                                className="rounded-md p-1.5 text-t2-ink-3 hover:bg-t2-hover hover:text-t2-ink"
                            >
                                <Trash2 size={15} />
                            </button>
                        )}
                    </div>
                </div>
                <input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    onBlur={commitTitle}
                    onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                    aria-label="Titel"
                    className="w-full bg-transparent text-[28px] font-bold leading-[1.15] tracking-tight text-t2-ink outline-none"
                />
            </div>

            <div>
                <Row label="Datum" icon={<CalendarDays size={15} />}>
                    <input type="date" value={dateStr} aria-label="Datum" className={inputCls} onChange={(e) => changeTimes(e.target.value, startStr, endStr)} />
                </Row>
                {event.allDay ? (
                    <Row label="Zeit" icon={<Clock size={15} />}><span>Ganztägig</span></Row>
                ) : (
                    <Row label="Zeit" icon={<Clock size={15} />}>
                        <span className="inline-flex items-center gap-2">
                            <input type="time" value={startStr} aria-label="Beginn" className={inputCls} onChange={(e) => changeTimes(dateStr, e.target.value, endStr)} />
                            <span className="text-t2-ink-3">–</span>
                            <input type="time" value={endStr} aria-label="Ende" className={inputCls} onChange={(e) => changeTimes(dateStr, startStr, e.target.value)} />
                        </span>
                    </Row>
                )}
                <Row label="Workspace" icon={<Layers size={15} />}>
                    <WorkspacePicker
                        safe={todoSafe(event)}
                        linkedSafes={event.linkedSafes ?? []}
                        onChange={(next) => onUpdate(next)}
                    />
                </Row>
                <Row label="Tags" icon={<TagIcon size={15} />}>
                    <TagPicker
                        tags={themes}
                        value={groupIds}
                        // The first tag decides the colour and the group, like in the popup
                        onChange={(ids) => onUpdate({ groupIds: ids, parent_id: ids[0] || null })}
                        onCreate={createTag}
                        compact
                    />
                </Row>
            </div>

            <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                onBlur={() => { if (description !== (event.description ?? '')) onUpdate({ description }); }}
                placeholder="Beschreibung"
                aria-label="Beschreibung"
                rows={4}
                className="w-full resize-y rounded-md border border-t2-line bg-transparent px-3 py-2 text-sm text-t2-ink outline-none placeholder:text-t2-ink-3"
            />
        </div>
    );
}
