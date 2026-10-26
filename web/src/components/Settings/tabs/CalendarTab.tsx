import React, { useState, useEffect } from 'react';
import { Check, Plus, Share, Lock } from 'lucide-react';
import {
    useDataStore,
    type CalendarColorPalette,
    type CalendarHolidayPackage,
} from '@/store/useDataStore';
import { useJobPlannerStore } from '@/store/useJobPlannerStore';

export interface CalendarGroup {
    id: string;
    title: string;
    effect?: string;
    color?: string;
}

export interface GroupItemProps {
    group: CalendarGroup;
    hiddenGroupIds?: string[];
    onToggleVisibility?: (id: string) => void;
    onUpdate?: (id: string, updates: Partial<CalendarGroup>) => void;
    onShare?: (e: React.MouseEvent, id: string) => void;
    onDelete?: (e: React.MouseEvent, id: string) => void;
    isProtected?: boolean;
}

const EFFECT_OPTIONS = [
    { id: 'none', label: 'Solid' }, { id: 'stripes', label: 'Streifen' }, { id: 'waves', label: 'Wellen' },
    { id: 'dots', label: 'Punkte' }, { id: 'chess', label: 'Karo' }, { id: 'diamonds', label: 'Diamant' },
    { id: 'gradient', label: 'Verlauf' }, { id: 'bars', label: 'Balken' }, { id: 'dimmed', label: 'Gedimmt' },
] as const;

const COLOR_SWATCHES = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#6366f1', '#ec4899', '#64748b'];

const PALETTE_COLORS: Record<string, Record<string, string>> = {
    'soft-pastels': { blue: '#E2E8F0', pink: '#EDE9FE', green: '#D1FAE5', text: '#1F2937' },
    'classic-tide': { blue: '#3B82F6', pink: '#6366F1', green: '#10B981', text: '#FFFFFF' },
    'modern-dark':  { blue: '#0284C7', pink: '#7C3AED', green: '#059669', text: '#FFFFFF' },
};

const PALETTE_OPTIONS = [
    { id: 'modern-dark' as CalendarColorPalette, label: 'Modern Dark', desc: 'Richer solid colors with white text' },
    { id: 'soft-pastels' as CalendarColorPalette, label: 'Soft Pastels', desc: 'Pale backgrounds with dark text' },
    { id: 'classic-tide' as CalendarColorPalette, label: 'Classic Tide', desc: 'Tide classic colors with white text' },
];

function OptionCard<T extends string>({
    id, label, desc, active, onClick,
}: { id: T; label: string; desc: string; active: boolean; onClick: (id: T) => void }) {
    return (
        <button
            type="button"
            onClick={() => onClick(id)}
            className={`flex flex-col p-3 rounded-[8px] border text-left transition-all cursor-pointer ${
                active
                    ? 'bg-[#111827] border-[#111827] text-white dark:bg-white dark:text-zinc-900 shadow-sm'
                    : 'bg-white dark:bg-white/5 border-[#e5e7eb] dark:border-zinc-800 text-gray-600 dark:text-gray-400 hover:border-gray-200 dark:hover:border-zinc-700'
            }`}
        >
            <div className={`text-sm font-semibold ${active ? 'text-white dark:text-zinc-900' : 'text-gray-900 dark:text-white'}`}>{label}</div>
            <div className="text-[10px] opacity-80 mt-1">{desc}</div>
        </button>
    );
}

export function GroupItem({
    group, hiddenGroupIds, onToggleVisibility, onUpdate, onShare, onDelete, isProtected,
}: GroupItemProps) {
    const [localTitle, setLocalTitle] = useState(group.title);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setLocalTitle(group.title);
    }, [group.title]);

    const handleBlur = () => {
        if (localTitle !== group.title && onUpdate) onUpdate(group.id, { title: localTitle });
    };

    return (
        <div className="group relative flex flex-col gap-2 p-3 rounded-xl bg-gray-50 dark:bg-white/5 border border-gray-100 dark:border-white/5 hover:bg-white dark:hover:bg-white/10 hover:shadow-sm transition-all">
            <div className="flex items-center gap-2">
                <input
                    type="checkbox"
                    checked={!(hiddenGroupIds || []).includes(group.id)}
                    onChange={() => onToggleVisibility?.(group.id)}
                    className="w-4 h-4 rounded border-gray-300 dark:border-zinc-700 text-[#111827] focus:ring-2 focus:ring-[#111827] focus:ring-offset-2 dark:focus:ring-zinc-400 bg-white dark:bg-zinc-800 cursor-pointer"
                    title="Toggle Visibility"
                />
                <input
                    type="text"
                    value={localTitle}
                    onChange={(e) => setLocalTitle(e.target.value)}
                    onBlur={handleBlur}
                    onKeyDown={(e) => e.key === 'Enter' && handleBlur()}
                    className="bg-transparent border-none p-0 text-[13px] font-bold focus:ring-0 outline-none text-gray-800 dark:text-white flex-1 placeholder:text-gray-400"
                    placeholder="Group name..."
                />
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all shrink-0">
                    <button type="button" onClick={(e) => onShare?.(e, group.id)} className="p-1 hover:bg-gray-100 dark:hover:bg-white/10 rounded text-gray-400 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 transition-all cursor-pointer" title="Share Group">
                        <Share size={11} />
                    </button>
                    {isProtected ? (
                        <span className="p-1 text-blue-500/80 cursor-not-allowed font-semibold" title="Vom Job Planner Plugin geschützt (nicht löschbar)"><Lock size={12} /></span>
                    ) : (
                        <button type="button" onClick={(e) => onDelete?.(e, group.id)} className="p-1 hover:bg-rose-50 dark:hover:bg-rose-500/20 rounded text-gray-400 dark:text-gray-300 hover:text-rose-500 transition-all font-semibold cursor-pointer" title="Delete Group">✗</button>
                    )}
                </div>
            </div>

            <div className="flex flex-col gap-2 pl-6">
                <div className="flex flex-wrap gap-1">
                    {EFFECT_OPTIONS.map(({ id, label }) => {
                        const active = (group.effect || 'none') === id;
                        return (
                            <button
                                key={id}
                                type="button"
                                onClick={() => onUpdate?.(group.id, { effect: id })}
                                title={label}
                                className={`flex flex-col items-center gap-0.5 p-0.5 rounded border transition-all cursor-pointer ${
                                    active ? 'border-[#111827] dark:border-white scale-105 shadow-sm' : 'border-transparent hover:border-gray-300 dark:hover:border-zinc-700'
                                }`}
                            >
                                <div
                                    className={`w-6 h-3 rounded-sm ${id !== 'none' ? `effect-${id}` : ''}`}
                                    style={{ backgroundColor: group.color || '#3b82f6', opacity: id === 'dimmed' ? 0.55 : 1 }}
                                />
                                <span className="text-[6.5px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wide">{label}</span>
                            </button>
                        );
                    })}
                </div>

                <div className="flex flex-wrap gap-1 mt-0.5">
                    {COLOR_SWATCHES.map((c) => (
                        <button
                            key={c}
                            type="button"
                            onClick={() => onUpdate?.(group.id, { color: c })}
                            className={`w-3.5 h-3.5 rounded-full border transition-all cursor-pointer ${
                                group.color === c ? 'border-gray-900 dark:border-white scale-110 shadow-sm' : 'border-transparent hover:scale-105'
                            }`}
                            style={{ backgroundColor: c }}
                        />
                    ))}
                </div>
            </div>
        </div>
    );
}

export interface CalendarTabProps {
    groups?: CalendarGroup[];
    hiddenGroupIds?: string[];
    onToggleGroupVisibility?: (id: string) => void;
    onUpdateGroup?: (id: string, updates: Partial<CalendarGroup>) => void;
    onShareGroup?: (e: React.MouseEvent, id: string) => void;
    onDeleteGroup?: (e: React.MouseEvent, id: string) => void;
    onCreateGroup?: (title: string, color?: string, effect?: string) => Promise<string | undefined>;
    enabledExtensions?: string[];
}

export const CalendarTab: React.FC<CalendarTabProps> = ({
    groups = [], hiddenGroupIds = [], onToggleGroupVisibility, onUpdateGroup,
    onShareGroup, onDeleteGroup, onCreateGroup, enabledExtensions = [],
}) => {
    const {
        calendarColorPalette,
        setCalendarColorPalette,
        calendarOverlapMode,
        setCalendarOverlapMode,
        calendarHolidaysEnabled,
        setCalendarHolidaysEnabled,
        calendarHolidayPackage,
        setCalendarHolidayPackage,
        eventMentionStyle,
        setEventMentionStyle,
        eventMentionPreview,
        setEventMentionPreview,
    } = useDataStore();

    const plannerGroupId = useJobPlannerStore((state) => state.pluginGroupId);
    const isJobPlannerActive = enabledExtensions.includes('job_planner');
    const [newGroupName, setNewGroupName] = useState('');

    const handleCreateGroupLocal = async () => {
        if (!newGroupName.trim() || !onCreateGroup) return;
        await onCreateGroup(newGroupName.trim());
        setNewGroupName('');
    };

    const palette = calendarColorPalette;
    const overlap = calendarOverlapMode;

    const getDummyStyle = (color: 'blue' | 'pink' | 'green') => ({
        backgroundColor: (PALETTE_COLORS[palette] || PALETTE_COLORS['modern-dark'])[color],
        color: (PALETTE_COLORS[palette] || PALETTE_COLORS['modern-dark']).text,
        border: 'none',
        boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
    });

    const layout1: React.CSSProperties = overlap === 'overlap' ? { left: '0%', width: '80%', top: '15px', height: '55px' } : { left: '0%', width: '31%', top: '15px', height: '55px' };
    const layout2: React.CSSProperties = overlap === 'overlap' ? { left: '15%', width: '70%', top: '40px', height: '55px' } : { left: '33%', width: '31%', top: '40px', height: '55px' };
    const layout3: React.CSSProperties = overlap === 'overlap' ? { left: '30%', width: '60%', top: '70px', height: '55px' } : { left: '66%', width: '31%', top: '70px', height: '55px' };

    const liveEvents = [
        { title: 'Meeting', time: '09:00 - 10:30', style: { ...layout1, ...getDummyStyle('blue') } },
        { title: 'Vorlesung', time: '09:30 - 11:00', style: { ...layout2, ...getDummyStyle('pink') } },
        { title: 'Sport', time: '10:15 - 11:45', style: { ...layout3, ...getDummyStyle('green') } },
    ];

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="space-y-6">
                    <div className="p-4 bg-gray-50 dark:bg-black/20 border border-gray-100 dark:border-white/5 rounded-2xl">
                        <h4 className="text-sm font-bold text-gray-900 dark:text-white mb-1">Color Palette</h4>
                        <p className="text-xs text-gray-500 mb-3">Choose the appearance theme for calendar events.</p>
                        <div className="flex flex-col gap-2">
                            {PALETTE_OPTIONS.map((p) => (
                                <button
                                    key={p.id}
                                    type="button"
                                    onClick={() => setCalendarColorPalette(p.id)}
                                    className={`flex items-center justify-between p-3 rounded-[8px] border text-left transition-all cursor-pointer ${
                                        palette === p.id
                                            ? 'bg-[#111827] border-[#111827] text-white dark:bg-white dark:text-zinc-900 shadow-sm'
                                            : 'bg-white dark:bg-white/5 border-[#e5e7eb] dark:border-zinc-800 text-gray-600 dark:text-gray-400 hover:border-gray-200 dark:hover:border-zinc-700'
                                    }`}
                                >
                                    <div>
                                        <div className={`text-sm font-semibold ${palette === p.id ? 'text-white dark:text-zinc-900' : 'text-gray-900 dark:text-white'}`}>{p.label}</div>
                                        <div className="text-[10px] opacity-80 mt-0.5">{p.desc}</div>
                                    </div>
                                    {palette === p.id && <Check className="w-4 h-4 shrink-0 text-white dark:text-zinc-900" />}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="p-4 bg-gray-50 dark:bg-black/20 border border-gray-100 dark:border-white/5 rounded-2xl">
                        <h4 className="text-sm font-bold text-gray-900 dark:text-white mb-1">Event Arrangement</h4>
                        <p className="text-xs text-gray-500 mb-3">Decide how overlapping events are displayed.</p>
                        <div className="grid grid-cols-2 gap-3">
                            <OptionCard id="stack" label="Side-by-Side" desc="Equal split width" active={overlap === 'stack'} onClick={setCalendarOverlapMode} />
                            <OptionCard id="overlap" label="Overlap / Stacking" desc="Layered cards" active={overlap === 'overlap'} onClick={setCalendarOverlapMode} />
                        </div>
                    </div>

                    <div className="p-4 bg-gray-50 dark:bg-black/20 border border-gray-100 dark:border-white/5 rounded-2xl">
                        <h4 className="text-sm font-bold text-gray-900 dark:text-white mb-1">Darstellung von Terminen in Notizen</h4>
                        <p className="text-xs text-gray-500 mb-3">Wähle, ob Termine in Notizen im einheitlichen Blau oder in der jeweiligen Kalenderfarbe hervorgehoben werden.</p>
                        <div className="grid grid-cols-2 gap-3">
                            <OptionCard id="blue" label="Blau" desc="Einheitlicher blauer Stil" active={eventMentionStyle === 'blue'} onClick={setEventMentionStyle} />
                            <OptionCard id="calendar" label="Kalenderfarbe" desc="Farbe der jeweiligen Kategorie" active={eventMentionStyle === 'calendar'} onClick={setEventMentionStyle} />
                        </div>
                    </div>

                    <div className="p-4 bg-gray-50 dark:bg-black/20 border border-gray-100 dark:border-white/5 rounded-2xl">
                        <h4 className="text-sm font-bold text-gray-900 dark:text-white mb-1">Vorschau anzeigen</h4>
                        <p className="text-xs text-gray-500 mb-3">Steuert die Terminvorschau: &apos;Immer&apos; bettet einen Terminkasten ein, &apos;Hovern&apos; zeigt einen Tooltip beim Überfahren, &apos;Aus&apos; zeigt nur den Textlink.</p>
                        <div className="grid grid-cols-3 gap-2">
                            <OptionCard id="always" label="Immer" desc="Terminkasten" active={eventMentionPreview === 'always'} onClick={setEventMentionPreview} />
                            <OptionCard id="hover" label="Hovern" desc="Tooltip beim Überfahren" active={eventMentionPreview === 'hover'} onClick={setEventMentionPreview} />
                            <OptionCard id="off" label="Aus" desc="Nur Textlink" active={eventMentionPreview === 'off'} onClick={setEventMentionPreview} />
                        </div>
                    </div>

                    <div className="p-4 bg-gray-50 dark:bg-black/20 border border-gray-100 dark:border-white/5 rounded-2xl">
                        <div className="flex items-center justify-between mb-3">
                            <div>
                                <h4 className="text-sm font-bold text-gray-900 dark:text-white mb-0.5">Gesetzliche Feiertage</h4>
                                <p className="text-xs text-gray-500">Feiertage im Kalender und in der Suche anzeigen.</p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setCalendarHolidaysEnabled(!calendarHolidaysEnabled)}
                                className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 cursor-pointer ${calendarHolidaysEnabled ? 'bg-[#111827] dark:bg-white' : 'bg-gray-200 dark:bg-gray-700'}`}
                            >
                                <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full ${calendarHolidaysEnabled ? 'bg-white dark:bg-zinc-900 translate-x-5' : 'bg-white translate-x-0'} shadow transition duration-200`} />
                            </button>
                        </div>

                        {calendarHolidaysEnabled && (
                            <div className="pt-3 border-t border-gray-200/50 dark:border-white/5 flex items-center justify-between">
                                <span className="text-xs font-bold text-gray-700 dark:text-gray-300">Feiertagspaket (Land)</span>
                                <select
                                    value={calendarHolidayPackage}
                                    onChange={(e) => setCalendarHolidayPackage(e.target.value as CalendarHolidayPackage)}
                                    className="bg-white dark:bg-black/40 border border-gray-200 dark:border-white/10 rounded-lg px-2.5 py-1 text-xs font-bold text-gray-900 dark:text-white outline-none cursor-pointer"
                                >
                                    <option value="DE">Deutschland (DE)</option>
                                    <option value="AT">Österreich (AT)</option>
                                    <option value="CH">Schweiz (CH)</option>
                                    <option value="US">United States (US)</option>
                                </select>
                            </div>
                        )}
                    </div>
                </div>

                <div className="flex flex-col border border-gray-100 dark:border-white/5 rounded-2xl p-4 bg-gray-50/50 dark:bg-white/[0.02]">
                    <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Live Preview</h4>
                    <div className="relative border border-gray-200 dark:border-white/10 rounded-xl bg-white dark:bg-slate-900 h-[170px] overflow-hidden select-none mb-4">
                        <div className="absolute left-0 top-0 bottom-0 w-[45px] border-r border-gray-100 dark:border-white/5 bg-gray-50 dark:bg-black/10 flex flex-col justify-between py-3 text-[9px] text-gray-400 font-semibold px-2">
                            <span>09:00</span>
                            <span>10:00</span>
                            <span>11:00</span>
                        </div>

                        <div className="absolute left-[45px] right-0 top-0 bottom-0">
                            <div className="absolute top-[15px] left-0 right-0 border-b border-dashed border-gray-100 dark:border-white/5" />
                            <div className="absolute top-[70px] left-0 right-0 border-b border-dashed border-gray-100 dark:border-white/5" />

                            {liveEvents.map((ev) => (
                                <div key={ev.title} className="absolute rounded-[8px] p-1.5 text-[9px] font-bold transition-all duration-300" style={ev.style}>
                                    {ev.title}
                                    <div className="text-[7.5px] opacity-70 mt-0.5">{ev.time}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            <div className="pt-6 border-t border-gray-100 dark:border-white/5">
                <div className="flex items-center justify-between mb-4">
                    <div>
                        <h3 className="text-sm font-bold text-gray-900 dark:text-white">Calendar Groups</h3>
                        <p className="text-xs text-gray-500 mt-0.5">Manage event categories and styles.</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <input
                            type="text"
                            value={newGroupName}
                            onChange={(e) => setNewGroupName(e.target.value)}
                            placeholder="New group name..."
                            className="bg-white dark:bg-black/40 text-xs text-gray-900 dark:text-white outline-none border border-gray-200 dark:border-white/10 focus:ring-2 focus:ring-[#111827] focus:ring-offset-2 dark:focus:ring-zinc-400 transition-colors rounded-[8px] px-3 py-1.5 w-40"
                            onKeyDown={(e) => e.key === 'Enter' && handleCreateGroupLocal()}
                        />
                        <button
                            type="button"
                            onClick={handleCreateGroupLocal}
                            className="p-1.5 bg-[#111827] hover:bg-[#2c2c2c] text-white dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-100 rounded-[8px] transition-colors cursor-pointer"
                            title="Create Group"
                        >
                            <Plus size={14} />
                        </button>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[220px] overflow-y-auto pr-1">
                    {groups.map((group) => (
                        <GroupItem
                            key={group.id}
                            group={group}
                            hiddenGroupIds={hiddenGroupIds}
                            onToggleVisibility={onToggleGroupVisibility}
                            onUpdate={onUpdateGroup}
                            onShare={onShareGroup}
                            onDelete={onDeleteGroup}
                            isProtected={isJobPlannerActive && Boolean(plannerGroupId && group.id === plannerGroupId)}
                        />
                    ))}
                    {groups.length === 0 && (
                        <p className="text-xs text-gray-400 italic col-span-2 text-center py-4">No custom groups created yet.</p>
                    )}
                </div>
            </div>
        </div>
    );
};

export default CalendarTab;
