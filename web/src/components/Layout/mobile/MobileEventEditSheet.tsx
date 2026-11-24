'use client';

import React, { useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { X, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { CALENDAR_CATEGORIES, resolveCategory } from '@/lib/calendarColors';
import { paletteFor } from './eventPalette';
import { EventMentionField } from '@/components/Calendar/EventMentionField';
import { createMentionSession, discardMentionSession } from '@/lib/eventMentionShare';

type Freq = 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly';

/** Einheit im Dropdown → Wiederholungs-Frequenz. */
const UNITS: Array<{ value: Freq; label: string }> = [
  { value: 'none', label: 'Nie' },
  { value: 'daily', label: 'Tage' },
  { value: 'weekly', label: 'Wochen' },
  { value: 'monthly', label: 'Monate' },
  { value: 'yearly', label: 'Jahre' },
];

export interface MobileEditEventSheetProps {
  event: {
    id: string;
    title?: string;
    start: Date | string;
    end?: Date | string;
    color?: string;
    description?: string;
    parent_id?: string | null;
    groupIds?: string[];
    recurrence?: Freq;
    recurrence_rule?: string;
    recurrence_end?: string;
    is_task?: boolean;
    linkedTaskId?: string;
    is_completed?: boolean;
    private?: boolean;
  };
  onSave: (
    id: string,
    start: Date,
    end: Date,
    meta: {
      title: string;
      color: string;
      description?: string;
      parent_id?: string | null;
      groupIds?: string[];
      recurrence?: Freq;
      recurrence_rule?: string;
      recurrence_end?: string;
    }
  ) => void;
  onDismiss: () => void;
  onDelete?: (id: string) => void;
  themes?: Array<{ id: string; title: string; color?: string; effect?: string }>;
}

const pad = (n: number) => String(n).padStart(2, '0');
const hm = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

/** Liest Frequenz und Intervall aus Feld oder RRULE, z. B. „FREQ=WEEKLY;INTERVAL=3“. */
function parseRecurrence(event: MobileEditEventSheetProps['event']): { freq: Freq; interval: number } {
  const rule = event.recurrence_rule || '';
  const freqMatch = rule.match(/FREQ=(DAILY|WEEKLY|MONTHLY|YEARLY)/i);
  const intMatch = rule.match(/INTERVAL=(\d+)/i);
  const interval = intMatch ? Math.max(1, parseInt(intMatch[1], 10)) : 1;
  if (event.recurrence && event.recurrence !== 'none') return { freq: event.recurrence, interval };
  if (freqMatch) return { freq: freqMatch[1].toLowerCase() as Freq, interval };
  return { freq: 'none', interval: 1 };
}

/**
 * Termin bearbeiten am Handy: Vorschau oben in der Termin-Farbe, darunter die
 * Einstellungen. Wiederholung baut sich in der Zeile auf: erst Einheit, dann Zahl davor.
 */
export const MobileEditEventSheet = ({
  event,
  onSave,
  onDismiss,
  onDelete,
  themes,
}: MobileEditEventSheetProps) => {
  const initialStart = useMemo(() => {
    const d = new Date(event.start);
    return isNaN(d.getTime()) ? new Date() : d;
  }, [event.start]);
  const initialEnd = useMemo(() => {
    const d = event.end ? new Date(event.end) : new Date(initialStart.getTime() + 3_600_000);
    return isNaN(d.getTime()) ? new Date(initialStart.getTime() + 3_600_000) : d;
  }, [event.end, initialStart]);

  const isDraft = event.id === '';
  // Drafts pick their colour here (stored as the category hex, like the create modal stores a hex).
  const [color, setColor] = useState(event.color);
  const pal = paletteFor(isDraft ? color : event.color);
  const rec = parseRecurrence(event);
  // A draft is created on save; the sheet stays mounted during its exit animation, so it submits only once.
  const submittedRef = useRef(false);
  // Mentions share at the pick; closing without saving revokes those shares again.
  const mentionSession = useRef(createMentionSession()).current;
  const cancel = () => {
    if (!isDraft) void discardMentionSession(mentionSession, event.id, event.description || '');
    onDismiss();
  };

  const [title, setTitle] = useState(event.title || '');
  const [dateStr, setDateStr] = useState(() => format(initialStart, 'yyyy-MM-dd'));
  const [startTime, setStartTime] = useState(() => hm(initialStart));
  const [endTime, setEndTime] = useState(() => hm(initialEnd));
  const [allDay, setAllDay] = useState(false);
  const [description, setDescription] = useState(event.description || '');
  const [groupId, setGroupId] = useState<string>(event.groupIds?.[0] || event.parent_id || '');
  const [freq, setFreq] = useState<Freq>(rec.freq);
  const [every, setEvery] = useState<number>(rec.interval);

  const durationMin = useMemo(() => {
    const [sh, sm] = startTime.split(':').map(Number);
    const [eh, em] = endTime.split(':').map(Number);
    const m = ((isDraft && eh === 0 && em === 0 && sh * 60 + sm > 0) ? 24 * 60 : eh * 60 + em) - (sh * 60 + sm);
    return m > 0 ? m : 0;
  }, [startTime, endTime, isDraft]);

  const fmtDuration = (m: number) => (m >= 60 ? `${Math.floor(m / 60)} Std.${m % 60 ? ` ${m % 60} Min.` : ''}` : `${m} Min.`);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanTitle = title.trim();
    // A draft (empty id) may stay unnamed; the save path names it.
    if (!cleanTitle && !isDraft) return;
    if (isDraft && submittedRef.current) return;

    const [sH, sM] = startTime.split(':').map(Number);
    const [eH, eM] = endTime.split(':').map(Number);
    const start = new Date(dateStr);
    const end = new Date(dateStr);
    if (allDay) {
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 0, 0);
    } else {
      start.setHours(sH || 0, sM || 0, 0, 0);
      end.setHours(eH || 1, eM || 0, 0, 0);
      // A draft ending at 24:00 (grid end of day) ends at midnight of the next day.
      if (isDraft && endTime === '00:00' && start.getHours() * 60 + start.getMinutes() > 0) {
        end.setTime(start.getTime());
        end.setDate(end.getDate() + 1);
        end.setHours(0, 0, 0, 0);
      }
      if (end <= start) end.setTime(start.getTime() + 3_600_000);
    }
    if (isDraft) submittedRef.current = true;

    const recurrenceRule = freq !== 'none'
      ? `FREQ=${freq.toUpperCase()}${every > 1 ? `;INTERVAL=${every}` : ''}`
      : 'none';
    onSave(event.id, start, end, {
      title: cleanTitle,
      color: (isDraft ? color : event.color) || pal.bg,
      description: description.trim() || undefined,
      parent_id: groupId || null,
      groupIds: groupId ? [groupId] : [],
      recurrence: freq,
      recurrence_rule: recurrenceRule,
      recurrence_end: '',
    });
    onDismiss();
  };

  const rowClass = 'flex items-center gap-3 min-h-[52px] border-b border-t2-line-soft text-[14.5px]';
  const keyClass = 'w-[104px] shrink-0 text-[13px] text-t2-ink-3';
  const inputClass = 'bg-transparent text-right text-t2-ink font-medium outline-none';

  return (
    <div className="fixed inset-0 z-[65] pointer-events-auto">
      <motion.div
        key="edit-sheet-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[60]"
        style={{ background: 'rgba(0,0,0,0.35)' }}
        onClick={(e) => { e.stopPropagation(); cancel(); }}
      />
      <motion.div
        key="edit-sheet-content"
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 32, stiffness: 320 }}
        className="fixed left-0 right-0 z-[65] rounded-t-[26px] overflow-hidden flex flex-col bg-t2-bg"
        style={{ bottom: 0, maxHeight: '92vh', paddingBottom: 'max(20px, calc(env(safe-area-inset-bottom) + 12px))' }}
      >
        <div className="flex justify-center pt-2.5 pb-1 shrink-0">
          <div className="w-10 h-1 rounded-full bg-t2-line" />
        </div>
        <div className="flex items-center justify-between px-5 pb-2 shrink-0">
          <button type="button" onClick={cancel} aria-label="Schließen" className="grid h-9 w-9 place-items-center rounded-full text-t2-ink-2">
            <X size={18} />
          </button>
          <span className="text-[15px] font-bold text-t2-ink">Termin</span>
          <button type="submit" form="edit-event-form" className="px-1 py-1.5 text-[15px] font-bold text-t2-ink">Fertig</button>
        </div>

        <form id="edit-event-form" onSubmit={handleSubmit} className="flex-1 min-h-0 overflow-y-auto px-5 pb-4">
          {/* Vorschau: Termin in seiner Farbe */}
          <div className="rounded-[20px] px-4 py-4" style={{ background: pal.bg, color: pal.ink }}>
            <div className="text-[11px] font-bold uppercase tracking-[0.08em] opacity-75">
              {format(new Date(dateStr || initialStart), 'EEEE · d. MMMM')}
            </div>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              aria-label="Titel"
              placeholder="Titel"
              enterKeyHint="done"
              className="mt-1.5 block w-full bg-transparent text-[24px] font-bold leading-tight tracking-[-0.02em] outline-none placeholder:opacity-60"
              style={{ color: pal.ink }}
            />
            <div className="mt-2.5 text-[13px] opacity-85">
              {allDay ? 'Ganztägig' : `${startTime} – ${endTime} · ${fmtDuration(durationMin)}`}
            </div>
          </div>

          <div className="mt-3.5">
            <label className={rowClass}>
              <span className={keyClass}>Datum</span>
              <input type="date" value={dateStr} onChange={(e) => setDateStr(e.target.value)} className={`${inputClass} flex-1`} />
            </label>

            {/* Entweder ganztägig oder Uhrzeit */}
            <div className={rowClass}>
              <span className={keyClass}>Zeit</span>
              <div className="flex-1 flex justify-end">
                <div role="radiogroup" aria-label="Zeit" className="flex rounded-full bg-t2-sub p-[3px]">
                  <button
                    type="button"
                    role="radio"
                    aria-checked={allDay}
                    onClick={() => setAllDay(true)}
                    className={`rounded-full px-3 py-1.5 text-[13px] font-semibold ${allDay ? 'bg-t2-ink text-t2-bg' : 'text-t2-ink-3'}`}
                  >
                    Ganztägig
                  </button>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={!allDay}
                    onClick={() => setAllDay(false)}
                    className={`rounded-full px-3 py-1.5 text-[13px] font-semibold whitespace-nowrap ${!allDay ? 'bg-t2-ink text-t2-bg' : 'text-t2-ink-3'}`}
                  >
                    {startTime} – {endTime}
                  </button>
                </div>
              </div>
            </div>
            {!allDay && (
              <div className="flex items-center justify-end gap-2 py-2 border-b border-t2-line-soft text-[14px]">
                <span className="text-t2-ink-3">Beginn</span>
                <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} aria-label="Beginn" className={inputClass} />
                <span className="text-t2-ink-3">Ende</span>
                <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} aria-label="Ende" className={inputClass} />
              </div>
            )}

            {isDraft && (
              <div className={rowClass}>
                <span className={keyClass}>Farbe</span>
                <div role="radiogroup" aria-label="Farbe" className="flex-1 flex justify-end gap-2.5">
                  {CALENDAR_CATEGORIES.map((c) => {
                    const selected = resolveCategory(color).key === c.key;
                    return (
                      <button
                        key={c.key}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        aria-label={c.name}
                        onClick={() => setColor(c.hex)}
                        className={`h-6 w-6 rounded-full shrink-0 transition-transform active:scale-90 ${selected ? 'ring-2 ring-t2-ink ring-offset-2 ring-offset-t2-bg' : ''}`}
                        style={{ background: paletteFor(c.key).bg }}
                      />
                    );
                  })}
                </div>
              </div>
            )}

            <label className={rowClass}>
              <span className={keyClass}>Gruppe</span>
              <select value={groupId} onChange={(e) => setGroupId(e.target.value)} aria-label="Gruppe" className={`${inputClass} flex-1 appearance-none`}>
                <option value="">Keine</option>
                {(themes || []).map((t) => (
                  <option key={t.id} value={t.id}>{t.title}</option>
                ))}
              </select>
            </label>

            {/* Wiederholung: Auswahl in der Zeile, bei Einheit davor die Zahl */}
            <div className={rowClass}>
              <span className={keyClass}>Wiederholung</span>
              <div className="flex-1 flex items-center justify-end gap-2">
                {freq !== 'none' && <span className="text-t2-ink-2">alle</span>}
                {freq !== 'none' && (
                  <input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    value={every}
                    onChange={(e) => setEvery(Math.max(1, parseInt(e.target.value || '1', 10)))}
                    aria-label="Anzahl"
                    className="h-8 w-12 appearance-none rounded-[9px] bg-t2-sub text-center text-[15px] font-bold text-t2-ink outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                  />
                )}
                <select
                  value={freq}
                  onChange={(e) => setFreq(e.target.value as Freq)}
                  aria-label="Wiederholung"
                  className={`${inputClass} appearance-none`}
                >
                  {UNITS.map((u) => (
                    <option key={u.value} value={u.value}>{u.label}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="mt-4">
            <div className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.06em] text-t2-ink-3">Notiz</div>
            <EventMentionField
              key={event.id}
              eventId={isDraft ? '' : event.id}
              value={description}
              onChange={setDescription}
              isPrivate={!!event.private}
              toastZIndex={200}
              session={mentionSession}
              rows={3}
              ariaLabel="Notiz"
              className="w-full resize-none bg-transparent text-[14.5px] text-t2-ink-2 outline-none border-b border-t2-line-soft py-2"
            />
          </div>
        </form>

        {onDelete && (
          <div className="flex justify-center pt-3 shrink-0">
            <button
              type="button"
              aria-label="Termin löschen"
              onClick={() => { onDelete(event.id); onDismiss(); }}
              className="grid h-[52px] w-[52px] place-items-center rounded-full bg-t2-sub text-t2-late active:scale-95 transition-transform"
            >
              <Trash2 size={22} strokeWidth={1.7} />
            </button>
          </div>
        )}
      </motion.div>
    </div>
  );
};

export default MobileEditEventSheet;
