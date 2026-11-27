import React from 'react';
import type { CalendarColorPalette } from '@/store/useDataStore';
import { getPaletteCategories } from '@/lib/calendarColors';
import { useT } from '../useT';

export interface CalendarEventPreviewProps {
    palette: CalendarColorPalette;
    overlap: 'stack' | 'overlap';
}

export function CalendarEventPreview({ palette, overlap }: CalendarEventPreviewProps) {
    const t = useT();
    const categories = getPaletteCategories(palette);
    const layered = overlap === 'overlap';

    const events: Array<{ title: string; time: string; catIndex: number; style: React.CSSProperties }> = [
        { title: t('cal.previewMeeting'), time: '09:00 - 10:30', catIndex: 1, style: layered ? { left: '0%', width: '80%', top: 15, height: 55 } : { left: '0%', width: '31%', top: 15, height: 55 } },
        { title: t('cal.previewLecture'), time: '09:30 - 11:00', catIndex: 4, style: layered ? { left: '15%', width: '70%', top: 40, height: 55 } : { left: '33%', width: '31%', top: 40, height: 55 } },
        { title: t('cal.previewSport'), time: '10:15 - 11:45', catIndex: 0, style: layered ? { left: '30%', width: '60%', top: 70, height: 55 } : { left: '66%', width: '31%', top: 70, height: 55 } },
    ];

    return (
        <div className="relative h-[150px] select-none overflow-hidden rounded-card bg-t2-bg ring-1 ring-t2-line" aria-label={t('cal.preview')} role="img">
            <div className="absolute inset-y-0 left-0 flex w-[46px] flex-col justify-between border-r border-t2-line-soft bg-t2-sub px-2 py-3 text-[11px] font-medium text-t2-ink-3">
                <span>09:00</span>
                <span>10:00</span>
                <span>11:00</span>
            </div>
            <div className="absolute inset-y-0 left-[46px] right-0">
                {events.map((ev) => {
                    const cat = categories[ev.catIndex] ?? categories[0];
                    return (
                        <div
                            key={ev.title}
                            className="absolute rounded-[8px] p-1.5 text-[11px] font-semibold shadow-sm transition-all duration-300"
                            style={{ ...ev.style, backgroundColor: cat.bg, color: cat.ink }}
                        >
                            {ev.title}
                            <div className="mt-0.5 text-[8.5px] opacity-70">{ev.time}</div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
