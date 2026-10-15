import React, { useState, useEffect } from 'react';
import { Share } from 'lucide-react';

export interface ThemePattern {
    id: string;
    label: string;
}

export const THEME_PATTERNS: readonly ThemePattern[] = [
    { id: 'none',    label: 'Solid'   },
    { id: 'stripes', label: 'Streifen' },
    { id: 'waves',   label: 'Wellen'  },
    { id: 'dots',    label: 'Punkte'  },
    { id: 'chess',   label: 'Karo'    },
    { id: 'diamonds',label: 'Diamant' },
    { id: 'gradient',label: 'Verlauf' },
    { id: 'bars',    label: 'Balken'  },
    { id: 'dimmed',  label: 'Gedimmt' },
] as const;

export type ThemePatternId = typeof THEME_PATTERNS[number]['id'];

export interface ThemeGroup {
    id: string;
    title: string;
    effect?: string;
    color?: string;
    [key: string]: any;
}

export interface ThemeItemProps {
    group: ThemeGroup;
    hiddenThemeIds?: string[];
    onToggleVisibility: (id: string) => void;
    onUpdate: (id: string, updates: Partial<ThemeGroup>) => void;
    onShare: (e: React.MouseEvent, id: string) => void;
    onDelete: (e: React.MouseEvent, id: string, title?: string) => void;
}

export const ThemeItem: React.FC<ThemeItemProps> = ({
    group,
    hiddenThemeIds = [],
    onToggleVisibility,
    onUpdate,
    onShare,
    onDelete,
}) => {
    const [localTitle, setLocalTitle] = useState(group.title);

    useEffect(() => {
        setLocalTitle(group.title);
    }, [group.title]);

    const handleBlur = () => {
        if (localTitle !== group.title) {
            onUpdate(group.id, { title: localTitle });
        }
    };

    return (
        <div className="group relative flex flex-col gap-2.5 p-3 rounded-xl bg-gray-50/50 hover:bg-white hover:shadow-sm border border-transparent hover:border-gray-100 transition-all">
            <div className="flex items-center gap-2">
                <input
                    type="checkbox"
                    checked={!(hiddenThemeIds || []).includes(group.id)}
                    onChange={() => onToggleVisibility(group.id)}
                    className="w-4 h-4 rounded-md border-gray-300 text-indigo-600 focus:ring-indigo-500/20 bg-white cursor-pointer"
                    title="Toggle Visibility"
                />
                <input
                    type="text"
                    value={localTitle}
                    onChange={(e) => setLocalTitle(e.target.value)}
                    onBlur={handleBlur}
                    onKeyDown={(e) => e.key === 'Enter' && handleBlur()}
                    className="bg-transparent border-none p-0 text-[13px] font-semibold focus:ring-0 outline-none text-gray-800 flex-1 placeholder:text-gray-400"
                    placeholder="Theme name..."
                />
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all shrink-0">
                    <button
                        onClick={(e) => onShare(e, group.id)}
                        className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-indigo-600 transition-all"
                        title="Share Theme"
                    >
                        <Share size={12} />
                    </button>
                    <button
                        onClick={(e) => onDelete(e, group.id, group.title)}
                        className="p-1.5 hover:bg-rose-50 rounded-lg text-gray-400 hover:text-rose-500 transition-all font-semibold"
                        title="Delete Theme"
                    >
                        ✗
                    </button>
                </div>
            </div>
            <div className="flex flex-col gap-2.5 pl-6">
                {/* Pattern picker — themes convey texture/pattern only, not individual color */}
                <div className="flex flex-wrap gap-1.5">
                    {THEME_PATTERNS.map(({ id, label }) => {
                        const active = (group.effect || 'none') === id;
                        const swatchColor = (group as any).color || '#6366f1';
                        return (
                            <button
                                key={id}
                                onClick={() => onUpdate(group.id, { effect: id })}
                                title={label}
                                className={`flex flex-col items-center gap-0.5 p-0.5 rounded-lg border-2 transition-all ${active ? 'border-indigo-500 scale-105 shadow-sm' : 'border-transparent hover:border-gray-300'}`}
                            >
                                <div
                                    className={`w-8 h-5 rounded-md ${id !== 'none' ? `effect-${id}` : ''}`}
                                    style={{
                                        backgroundColor: swatchColor,
                                        opacity: id === 'dimmed' ? 0.55 : 1,
                                    }}
                                />
                                <span className="text-[8px] font-bold text-gray-400 uppercase tracking-wide">{label}</span>
                            </button>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};

export default ThemeItem;
