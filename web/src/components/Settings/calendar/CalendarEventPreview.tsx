import React from 'react';
import type { CalendarColorPalette } from '@/store/useDataStore';
import { useT } from '../useT';

/** Beispielfarben der Termin-Paletten (Termin-Farben gehoeren nicht zur App-Palette). */
const PALETTE_COLORS: Record<string, Record<'blue' | 'pink' | 'green' | 'text', string>> = {
    balsam: { blue: '#A6B7A8', pink: '#A9623F', green: '#5C6E6C', text: '#FFFFFF' },
    'soft-pastels': { blue: '#E2E8F0', pink: '#EDE9FE', green: '#D1FAE5', text: '#1F2937' },
    'classic-tide': { blue: '#3B82F6', pink: '#6366F1', green: '#10B981', text: '#FFFFFF' },
    'modern-dark': { blue: '#0284C7', pink: '#7C3AED', green: '#059669', text: '#FFFFFF' },
};

export interface CalendarEventPreviewProps {
    palette: CalendarColorPalette;
    overlap: 'stack' | 'overlap';
}

export function CalendarEventPreview({ palette, overlap }: CalendarEventPreviewProps) {
    const t = useT();
    const colors = PALETTE_COLORS[palette] || PALETTE_COLORS['modern-dark'];
    const layered = overlap === 'overlap';

    const events: Array<{ title: string; time: string; color: 'blue' | 'pink' | 'green'; style: React.CSSProperties }> = [
        { title: t('cal.previewMeeting'), time: '09:00 - 10:30', color: 'blue', style: layered ? { left: '0%', width: '80%', top: 15, height: 55 } : { left: '0%', width: '31%', top: 15, height: 55 } },
        { title: t('cal.previewLecture'), time: '09:30 - 11:00', color: 'pink', style: layered ? { left: '15%', width: '70%', top: 40, height: 55 } : { left: '33%', width: '31%', top: 40, height: 55 } },
        { title: t('cal.previewSport'), time: '10:15 - 11:45', color: 'green', style: layered ? { left: '30%', width: '60%', top: 70, height: 55 } : { left: '66%', width: '31%', top: 70, height: 55 } },
    ];

    return (
        <div className="relative h-[150px] select-none overflow-hidden rounded-card bg-t2-bg ring-1 ring-t2-line" aria-label={t('cal.preview')} role="img">
            <div className="absolute inset-y-0 left-0 flex w-[46px] flex-col justify-between border-r border-t2-line-soft bg-t2-sub px-2 py-3 text-[10px] font-medium text-t2-ink-3">
                <span>09:00</span>
                <span>10:00</span>
                <span>11:00</span>
            </div>
            <div className="absolute inset-y-0 left-[46px] right-0">
                {events.map((ev) => (
                    <div
                        key={ev.title}
                        className="absolute rounded-[8px] p-1.5 text-[10px] font-semibold shadow-sm transition-all duration-300"
                        style={{ ...ev.style, backgroundColor: colors[ev.color], color: colors.text }}
                    >
                        {ev.title}
                        <div className="mt-0.5 text-[8.5px] opacity-70">{ev.time}</div>
                    </div>
                ))}
            </div>
        </div>
    );
}
