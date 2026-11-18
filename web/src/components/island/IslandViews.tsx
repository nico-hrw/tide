'use client';

import React from 'react';
import { Bell, X } from 'lucide-react';
import { paletteFor } from '@/components/Layout/mobile/eventPalette';
import { useIslandSettingsStore } from '@/store/useIslandSettingsStore';
import type { IslandModel } from './useIslandModel';
import type { IslandEvent } from './islandLogic';
import { useIslandText, type IslandText } from './islandText';

/** Kleine Überschrift der Karten (Großbuchstaben, ruhig). */
export function CardLabel({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
    return (
        <div className="flex items-center justify-between text-[10.5px] font-semibold uppercase tracking-[0.09em] text-t2-ink-3">
            <span>{children}</span>
            {right}
        </div>
    );
}

export function CloseButton({ label, onClick }: { label: string; onClick: () => void }) {
    return (
        <button
            type="button"
            aria-label={label}
            onClick={(e) => { e.stopPropagation(); onClick(); }}
            className="-my-1 -mr-1.5 grid h-[22px] w-[22px] place-items-center rounded-[7px] text-t2-ink-3 hover:bg-t2-hover hover:text-t2-ink"
        >
            <X size={15} strokeWidth={1.8} />
        </button>
    );
}

/** Eventfarbe als dünner senkrechter Strich. */
function Stripe({ color }: { color?: string }) {
    return <i className="block self-stretch rounded-[2px]" style={{ background: paletteFor(color).bg }} />;
}

function BigNumber({ value, unit }: { value: string; unit: string }) {
    return (
        <div className="my-3.5 flex items-baseline gap-1.5">
            <b className="text-[40px] font-semibold leading-none tracking-[-0.045em]">{value}</b>
            <span className="text-[13px] font-medium text-t2-ink-3">{unit}</span>
        </div>
    );
}

export function RunningView({ model, text }: { model: IslandModel; text: IslandText }) {
    const r = model.running;
    if (!r) return null;
    const f = model.following;
    const sub = [
        text.range(r.event.start, r.event.end),
        f ? text.tr('thenNext', { title: f.title || text.tr('untitledEvent'), time: text.time(f.start) }) : '',
    ].filter(Boolean).join(' · ');
    return (
        <div className="px-4 pb-4 pt-3.5">
            <CardLabel right={<span className="h-[7px] w-[7px] rounded-full" style={{ background: paletteFor(r.event.color).bg }} />}>
                {text.tr('runningNow')}
            </CardLabel>
            <BigNumber value={r.countdown.text} unit={text.tr(r.countdown.unit === 'hrs' ? 'hoursLeft' : 'minutesLeft')} />
            <div className="grid grid-cols-[3px_1fr] gap-[11px]">
                <Stripe color={r.event.color} />
                <div className="min-w-0">
                    <b className="block text-[15px] font-semibold leading-tight tracking-[-0.01em]">{r.event.title || text.tr('untitledEvent')}</b>
                    <small className="mt-px block truncate text-[12px] text-t2-ink-3">{sub}</small>
                </div>
            </div>
            <div className="mt-4 h-0.5 overflow-hidden rounded-[1px] bg-t2-line">
                <i
                    className="block h-full origin-left"
                    style={{ background: paletteFor(r.event.color).bg, transform: `scaleX(${r.progress})` }}
                />
            </div>
        </div>
    );
}

export function NextView({ model, text }: { model: IslandModel; text: IslandText }) {
    const n = model.next;
    if (!n) return null;
    const sub = [text.range(n.event.start, n.event.end), n.event.description].filter(Boolean).join(' · ');
    return (
        <div className="px-4 pb-4 pt-3.5">
            <CardLabel>{text.tr('nextEvent')}</CardLabel>
            <BigNumber value={n.countdown.text} unit={text.tr(n.countdown.unit === 'hrs' ? 'untilStartHrs' : 'untilStartMin')} />
            <div className="grid grid-cols-[3px_1fr] gap-[11px]">
                <Stripe color={n.event.color} />
                <div className="min-w-0">
                    <b className="block text-[15px] font-semibold leading-tight tracking-[-0.01em]">{n.event.title || text.tr('untitledEvent')}</b>
                    <small className="mt-px block truncate text-[12px] text-t2-ink-3">{sub}</small>
                </div>
            </div>
        </div>
    );
}

function AgendaItem({ e, text, now }: { e: IslandEvent; text: IslandText; now: Date }) {
    const past = !e.allDay && (e.done || e.end.getTime() <= now.getTime());
    return (
        <div className={`grid grid-cols-[3px_1fr] gap-[11px] py-2 ${past ? 'opacity-45' : ''}`}>
            <Stripe color={e.color} />
            <div className="min-w-0">
                <div className="flex items-baseline justify-between gap-2.5">
                    <b className="truncate text-[13px] font-semibold tracking-[-0.005em]">{e.title || text.tr('untitledEvent')}</b>
                    <span className="shrink-0 text-[12px] text-t2-ink-2">{e.allDay ? text.tr('allDay') : text.time(e.start)}</span>
                </div>
                {e.description && <small className="mt-px block truncate text-[12px] text-t2-ink-3">{e.description}</small>}
            </div>
        </div>
    );
}

/** Tagesübersicht: Wochenzeile mit Heute, darunter die Termine des Tages. */
export function DayView({ model, text }: { model: IslandModel; text: IslandText }) {
    return (
        <div className="px-4 pb-3.5 pt-3.5">
            <CardLabel right={<span>{text.weekLabel(model.now)}</span>}>{text.longDay(model.now)}</CardLabel>
            <div className="mb-1 mt-2.5 grid grid-cols-7 text-center">
                {model.week.map((d) => (
                    <span key={d.key} className="relative flex flex-col items-center gap-[3px] pb-1.5">
                        <small className="text-[10.5px] font-semibold text-t2-ink-3">{text.weekdayShort(d.date)}</small>
                        <b
                            className={`grid h-6 w-6 place-items-center rounded-full text-[12.5px] ${
                                d.isToday ? 'bg-t2-now font-bold text-t2-bg' : 'font-medium text-t2-ink-2'
                            }`}
                        >
                            {d.date.getDate()}
                        </b>
                        {d.hasEvents && <span className="absolute bottom-0 h-[3px] w-[3px] rounded-full bg-t2-ink-3" />}
                    </span>
                ))}
            </div>
            <div className="mt-1 max-h-[34vh] overflow-y-auto border-t border-t2-line-soft pt-1.5">
                {model.agenda.length === 0 ? (
                    <p className="py-3 text-[13px] text-t2-ink-3">{text.tr('noEventsToday')}</p>
                ) : (
                    model.agenda.map((e) => <AgendaItem key={e.id} e={e} text={text} now={model.now} />)
                )}
            </div>
        </div>
    );
}

/** Ruhige Benachrichtigung bzw. Bestätigung nach dem Anlegen. */
export function NoticeView({ model, text }: { model: IslandModel; text: IslandText }) {
    const n = model.notice;
    const compact = useIslandSettingsStore((s) => s.fileShareDisplay) === 'compact' && n?.kind === 'file';
    if (!n) return null;
    const isConfirm = n.kind === 'confirm';
    const heading = isConfirm
        ? text.tr(n.resultKind === 'note' ? 'createdNote' : n.resultKind === 'todo' ? 'createdTodo' : 'createdEvent')
        : n.title || text.tr(n.labelKey ?? 'noticeNew');
    const body = isConfirm
        ? [n.title, n.when ? (n.resultKind === 'event' ? `${text.shortDay(n.when)}, ${text.time(n.when)}` : text.shortDay(n.when)) : '']
              .filter(Boolean).join(' · ')
        : n.body;
    return (
        <div className={compact ? 'px-4 py-3' : 'px-4 pb-4 pt-3.5'}>
            <CardLabel right={<CloseButton label={text.tr('close')} onClick={model.close} />}>
                {text.tr(n.labelKey ?? 'noticeNew')}
            </CardLabel>
            <div className={`${compact ? 'mt-1.5' : 'mt-2.5'} grid grid-cols-[3px_1fr] gap-[11px]`}>
                <Stripe color={n.color} />
                <div className="min-w-0">
                    <b className="block text-[14px] font-semibold leading-tight tracking-[-0.01em]">{heading}</b>
                    {body && <p className={`mt-px text-[13px] text-t2-ink-2 ${compact ? 'truncate' : 'line-clamp-3'}`}>{body}</p>}
                </div>
            </div>
            {n.onAction && !compact && (
                <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); n.onAction?.(); model.dismissNotice(); }}
                    className="mt-3 w-full rounded-[10px] px-2.5 py-2 text-[13px] font-semibold shadow-[inset_0_0_0_1px_var(--t2-line)] hover:bg-t2-hover"
                >
                    {text.tr('open')}
                </button>
            )}
        </div>
    );
}

/** Kompakter Hinweis im Quadrat, wenn Benachrichtigungen nicht automatisch aufgehen. */
export function BellMark({ text }: { text: IslandText }) {
    return (
        <div className="flex h-full flex-col items-center justify-center gap-1 text-t2-ink-2">
            <Bell size={22} strokeWidth={1.8} />
            <small className="text-[9.5px] font-bold uppercase tracking-[0.08em]">{text.tr('noticeBadge', { n: 1 })}</small>
        </div>
    );
}

export { useIslandText };
