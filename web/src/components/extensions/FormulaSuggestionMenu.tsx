'use client';

import { useEffect, useRef } from 'react';
import { Globe, Sigma, Variable } from 'lucide-react';
import type { VariableSuggestionItem } from '@/lib/formula/variableSuggestions';

export type FormulaSuggestionCategory = 'all' | 'local' | 'global' | 'system';

export interface FormulaSuggestionMenuProps {
    items: VariableSuggestionItem[];
    selectedIndex: number;
    onSelect: (item: VariableSuggestionItem) => void;
    activeCategory: FormulaSuggestionCategory;
    onCategoryChange: (cat: FormulaSuggestionCategory) => void;
}

const CATEGORY_TABS: ReadonlyArray<{ id: FormulaSuggestionCategory; label: string }> = [
    { id: 'all', label: 'Alle' },
    { id: 'local', label: 'Lokal' },
    { id: 'global', label: 'Global' },
    { id: 'system', label: 'System' },
];

const CATEGORY_BADGE_LABEL: Record<VariableSuggestionItem['category'], string> = {
    local: 'Lokal',
    global: 'Global',
    system: 'System',
};

function CategoryIcon({ category }: { category: VariableSuggestionItem['category'] }) {
    if (category === 'local') {
        return <Variable className="w-3.5 h-3.5" />;
    }
    if (category === 'global') {
        return <Globe className="w-3.5 h-3.5" />;
    }
    return <Sigma className="w-3.5 h-3.5" />;
}

function SuggestionBadge({ item }: { item: VariableSuggestionItem }) {
    const label = CATEGORY_BADGE_LABEL[item.category];
    const originTooltip =
        item.category === 'global' && item.originNoteTitle
            ? item.originFolderPath
                ? `${item.originFolderPath} > ${item.originNoteTitle}`
                : item.originNoteTitle
            : undefined;

    return (
        <div
            className="shrink-0 flex flex-col items-end gap-0.5 max-w-[140px]"
            title={originTooltip}
        >
            <span className="px-1.5 py-0.5 rounded text-[11px] font-medium bg-t2-sub text-t2-ink-2 border border-t2-line-soft leading-none">
                {label}
            </span>
            {item.category === 'global' && item.originNoteTitle && (
                <span className="text-[11px] text-t2-ink-2 truncate max-w-full leading-tight">
                    {item.originNoteTitle}
                </span>
            )}
            {item.category === 'global' && item.originFolderPath && (
                <span className="text-[11px] text-t2-ink-3 truncate max-w-full leading-tight">
                    {item.originFolderPath}
                </span>
            )}
        </div>
    );
}

/**
 * Autocomplete popup menu for formula variables and stdlib functions with category filter tabs.
 */
export function FormulaSuggestionMenu({
    items,
    selectedIndex,
    onSelect,
    activeCategory,
    onCategoryChange,
}: FormulaSuggestionMenuProps) {
    const selectedRowRef = useRef<HTMLButtonElement | null>(null);

    useEffect(() => {
        selectedRowRef.current?.scrollIntoView({ block: 'nearest' });
    }, [selectedIndex, items]);

    return (
        <div
            className="w-[min(380px,calc(100vw-24px))] max-h-[340px] flex flex-col bg-t2-surface border border-t2-line shadow-modal rounded-xl overflow-hidden backdrop-blur-md text-[13px] text-t2-ink select-none z-[9999]"
            role="listbox"
            aria-label="Variablen- und Funktionsvorschläge"
        >
            <div className="flex items-center gap-1 p-1.5 border-b border-t2-line-soft bg-t2-sub shrink-0">
                {CATEGORY_TABS.map((tab) => {
                    const isActive = activeCategory === tab.id;
                    return (
                        <button
                            key={tab.id}
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => onCategoryChange(tab.id)}
                            className={`px-2.5 py-1 rounded-lg text-xs transition-colors ${
                                isActive
                                    ? 'bg-t2-accent text-t2-accent-ink font-semibold'
                                    : 'text-t2-ink-2 hover:bg-t2-hover'
                            }`}
                        >
                            {tab.label}
                        </button>
                    );
                })}
            </div>

            <div className="flex-1 overflow-y-auto p-1 divide-y divide-t2-line-soft">
                {items.length === 0 ? (
                    <div className="p-4 text-center text-xs text-t2-ink-3 italic">
                        Keine Variablen gefunden
                    </div>
                ) : (
                    items.map((item, index) => {
                        const isSelected = index === selectedIndex;
                        const subtitle = item.description || item.expr;

                        return (
                            <button
                                key={item.id}
                                ref={isSelected ? selectedRowRef : undefined}
                                type="button"
                                role="option"
                                aria-selected={isSelected}
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => onSelect(item)}
                                className={`w-full flex items-center gap-2.5 px-2.5 py-2 text-left rounded-lg transition-colors ${
                                    isSelected ? 'bg-t2-hover' : 'hover:bg-t2-hover'
                                }`}
                            >
                                <div className="shrink-0 flex items-center justify-center w-6 h-6 rounded-md bg-t2-sub text-t2-ink-2">
                                    <CategoryIcon category={item.category} />
                                </div>

                                <div className="flex-1 min-w-0">
                                    <div className="font-mono text-[13px] font-semibold text-t2-ink truncate">
                                        {item.signature || item.name}
                                    </div>
                                    {subtitle && (
                                        <div className="text-xs text-t2-ink-2 truncate">
                                            {subtitle}
                                        </div>
                                    )}
                                </div>

                                <SuggestionBadge item={item} />
                            </button>
                        );
                    })
                )}
            </div>
        </div>
    );
}

export default FormulaSuggestionMenu;
