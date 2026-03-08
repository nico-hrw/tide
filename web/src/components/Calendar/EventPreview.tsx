
"use client";

import React, { useState, useEffect } from "react";
import { X, Minus, Pin, Calendar, AlignLeft, Folder, ChevronDown, Check } from "lucide-react";
import { useHighlight, LinkTarget } from "../HighlightContext";

interface DecryptedFile {
    id: string;
    title: string;
    type: string;
    color?: string;
}

interface CalendarEvent {
    id: string;
    title: string;
    start: string;
    end: string;
    description?: string;
    color?: string;
    share_status?: string;
}

interface EventPreviewProps {
    event: CalendarEvent;
    themes: DecryptedFile[];
    currentThemeId?: string | null;
    isPinned: boolean;
    isMinimized: boolean;
    onClose: () => void;
    onMinimize: () => void;
    onMaximize: () => void;
    onPin: () => void;
    onSave: (id: string, updates: Partial<CalendarEvent> & { parent_id?: string | null }) => Promise<void>;
    onLinkClick: (target: { id: string, type: string, title?: string }) => void;
}

export default function EventPreview({
    event,
    themes,
    currentThemeId,
    isPinned,
    isMinimized,
    onClose,
    onMinimize,
    onMaximize,
    onPin,
    onSave,
    onLinkClick
}: EventPreviewProps) {
    const [title, setTitle] = useState(event.title);
    const [description, setDescription] = useState(event.description || "");
    const [selectedThemeId, setSelectedThemeId] = useState<string | null>(currentThemeId || null);
    const [isTitleFocused, setIsTitleFocused] = useState(false);
    const [isDescFocused, setIsDescFocused] = useState(false);

    const { highlight, startLinkSelection, cancelLinkSelection } = useHighlight();

    // Color Logic
    const getEventTheme = (evt: CalendarEvent) => {
        // Find if parent theme applies
        let effect = 'none';
        if (selectedThemeId) {
            const themeNode = themes.find(t => t.id === selectedThemeId);
            // event.effect comes from parent. If we have a selectedThemeId (which means it's assigned to a group),
            // we should ideally read the effect from the group. Since EventPreview gets `themes`, we can look it up.
            // Wait, does EventPreview have access to `effect` on the theme? We mapped `effect` in page.tsx for `themes` which are DecryptedFiles.
            // In DecryptedFile interface the effect is present.
            if (themeNode && (themeNode as any).effect) {
                effect = (themeNode as any).effect;
            }
        } else {
            effect = (evt as any).effect || 'none';
        }

        const effectMap: Record<string, { bg: string; text: string; border: string }> = {
            'sky': { bg: 'var(--event-sky-bg)', text: 'var(--event-sky-text)', border: 'var(--event-sky-border)' },
            'green': { bg: 'var(--event-green-bg)', text: 'var(--event-green-text)', border: 'var(--event-green-border)' },
            'orange': { bg: 'var(--event-orange-bg)', text: 'var(--event-orange-text)', border: 'var(--event-orange-border)' },
            'none': { bg: 'var(--event-default-bg)', text: 'var(--event-default-text)', border: 'var(--event-default-border)' }
        };
        return effectMap[effect] || effectMap['none'];
    };

    const theme = getEventTheme(event);

    const descriptionRef = React.useRef<HTMLTextAreaElement>(null);

    // Auto-save debounce could be added here, or save on blur/change
    // For now, let's trigger save on blur of inputs to keep it responsive but persistent
    const handleSave = async () => {
        await onSave(event.id, {
            title,
            description,
            parent_id: selectedThemeId
        });
    };

    const handleDescriptionChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const val = e.target.value;
        const prevVal = description;
        setDescription(val);

        if (!highlight.isSelectingLink) {
            const currentCount = (val.match(/--/g) || []).length;
            const prevCount = (prevVal.match(/--/g) || []).length;
            const typedTrigger = currentCount > prevCount;

            if (typedTrigger) {
                const triggerCursorPos = e.target.selectionEnd;
                const rect = e.target.getBoundingClientRect();
                startLinkSelection((target: LinkTarget) => {
                    setDescription(current => {
                        const searchSegment = current.substring(0, triggerCursorPos);
                        const idx = searchSegment.lastIndexOf('--');
                        let finalDesc = current;

                        if (idx !== -1) {
                            finalDesc = current.substring(0, idx) + `[${target.title}](tide://${target.type}/${target.id}) ` + current.substring(idx + 2);
                        } else {
                            const fallbackIdx = current.lastIndexOf('--');
                            if (fallbackIdx !== -1) {
                                finalDesc = current.substring(0, fallbackIdx) + `[${target.title}](tide://${target.type}/${target.id}) ` + current.substring(fallbackIdx + 2);
                            }
                        }

                        // Force an explicit save of the final generated string to backend
                        setTimeout(() => {
                            onSave(event.id, { title, description: finalDesc, parent_id: selectedThemeId });
                        }, 0);

                        return finalDesc;
                    });
                }, { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
            }
        } else {
            if (!val.includes('--')) {
                cancelLinkSelection();
            }
        }
    };

    // Update local state if event changes externally (e.g. from calendar drag)
    useEffect(() => {
        // Only update if ID changed or if we are not editing (to avoid race conditions)
        // Actually, for "real-time" feeling we usually want to sync, but if the save is async...
        // Let's just trust the prop, but maybe the prop is coming in stale?

        // Fix: If descriptions match, do nothing. 
        if (event.description !== description) {
            setDescription(event.description || "");
        }
        if (event.title !== title) {
            setTitle(event.title);
        }
    }, [event.id, event.title, event.description]);

    // Update theme selection when prop changes
    useEffect(() => {
        setSelectedThemeId(currentThemeId || null);
    }, [currentThemeId]);

    if (isMinimized) {
        return (
            <div
                className="w-[200px] h-[40px] bg-white dark:bg-gray-800 rounded-t-xl shadow-[0_-4px_20px_rgba(0,0,0,0.1)] border border-b-0 border-gray-200 dark:border-gray-700 flex items-center justify-between px-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                onClick={onMaximize}
            >
                <div className="flex items-center gap-2 truncate">
                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: theme.bg }} />
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-200 truncate">{title}</span>
                </div>
                <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                    <button onClick={onClose} className="p-1 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-full text-gray-400 hover:text-gray-600">
                        <X size={12} />
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="w-[320px] bg-white dark:bg-gray-800 rounded-t-2xl shadow-[0_-8px_30px_rgba(0,0,0,0.15)] border border-b-0 border-gray-200 dark:border-gray-700 flex flex-col animate-in slide-in-from-bottom-10 duration-300 relative overflow-hidden">

            {/* Colored Header Bar (Title + Controls) */}
            <div className="p-4 flex items-start justify-between gap-2 border-b border-black/5" style={{ backgroundColor: theme.bg, color: theme.text }}>
                <div className="flex-1 min-w-0">
                    <input
                        autoFocus
                        onFocus={(e) => { e.target.select(); setIsTitleFocused(true); }}
                        type="text"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        onBlur={(e) => { setIsTitleFocused(false); handleSave(); }}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                e.preventDefault();
                                descriptionRef.current?.focus();
                            }
                        }}
                        style={{ color: theme.text }}
                        className="w-full text-lg font-bold bg-transparent border-none p-0 focus:ring-0 outline-none placeholder:opacity-60 relative"
                        placeholder="Event Title"
                    />
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                        onClick={onPin}
                        className={`p-1.5 rounded-lg transition-colors ${isPinned ? 'bg-black/10' : 'opacity-70 hover:bg-black/10 hover:opacity-100'}`}
                        title={isPinned ? "Unpin" : "Pin"}
                    >
                        <Pin size={14} className={isPinned ? "fill-current" : ""} />
                    </button>
                    <button
                        onClick={onMinimize}
                        className="p-1.5 opacity-70 hover:opacity-100 hover:bg-black/10 rounded-lg transition-colors"
                        title="Minimize"
                    >
                        <Minus size={14} />
                    </button>
                    <button
                        onClick={onClose}
                        className="p-1.5 opacity-70 hover:opacity-100 hover:bg-black/10 rounded-lg transition-colors"
                        title="Close"
                    >
                        <X size={14} />
                    </button>
                </div>
            </div>

            <div className="p-4 flex flex-col h-full gap-4 relative z-10">

                {/* Time Display - Moved out of header */}
                <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-900/50 p-2 rounded-lg">
                    <Calendar size={14} />
                    <span>
                        {new Date(event.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - {new Date(event.end).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                </div>

                {/* Theme Selector - Clean Borderless Design */}
                <div className="relative group flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 bg-transparent px-2">
                    <Folder size={14} className="flex-shrink-0" />
                    <select
                        className="flex-1 bg-transparent border-none py-1 appearance-none focus:ring-0 outline-none cursor-pointer text-gray-700 dark:text-gray-300"
                        value={selectedThemeId || ""}
                        onChange={(e) => {
                            const newVal = e.target.value || null;
                            setSelectedThemeId(newVal);

                            // Find theme color and update event color
                            const theme = themes.find(t => t.id === newVal);
                            const newColor = theme?.color;

                            onSave(event.id, {
                                title,
                                description,
                                parent_id: newVal,
                                ...(newColor ? { color: newColor } : {})
                            });
                        }}
                    >
                        <option value="">General</option>
                        {themes.map(t => (
                            <option key={t.id} value={t.id}>{t.title}</option>
                        ))}
                    </select>
                    <ChevronDown size={14} className="pointer-events-none flex-shrink-0" />
                </div>



                {/* Description */}
                <div
                    className="flex-1 min-h-[80px]"
                    onClick={() => { if (!isDescFocused) setIsDescFocused(true); }}
                >
                    {isDescFocused || !description ? (
                        <textarea
                            autoFocus={isDescFocused}
                            ref={descriptionRef}
                            value={description}
                            onChange={handleDescriptionChange}
                            onBlur={() => { handleSave(); setIsDescFocused(false); }}
                            placeholder="Add details..."
                            className="w-full h-full bg-transparent border-none p-0 text-sm px-2 focus:ring-0 outline-none text-gray-700 dark:text-gray-300 resize-none placeholder:text-gray-400 leading-relaxed"
                        />
                    ) : (
                        <div className="w-full h-full text-sm px-2 text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-wrap cursor-text">
                            {description.split(/(\[[^[\]]+\]\(tide:\/\/[^/]+\/[^)]+\))/g).map((part, i) => {
                                const match = part.match(/\[([^[\]]+)\]\(tide:\/\/([^/]+)\/([^)]+)\)/);
                                if (match) {
                                    const [, title, type, targetId] = match;
                                    return (
                                        <span
                                            key={i}
                                            onClick={(e) => { e.stopPropagation(); onLinkClick({ id: targetId, type, title }); }}
                                            className="text-purple-500 bg-purple-500/10 px-1 rounded cursor-pointer hover:bg-purple-500/20 font-medium z-50 relative"
                                        >
                                            @{title}
                                        </span>
                                    );
                                }
                                return <span key={i}>{part}</span>;
                            })}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

