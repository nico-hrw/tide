
"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { X, Minus, Pin, Calendar, Folder, ChevronDown } from "lucide-react";
import { useHighlight, LinkTarget } from "../HighlightContext";

interface DecryptedFile {
    id: string;
    title: string;
    type: string;
    color?: string;
    effect?: string;
}

interface CalendarEvent {
    id: string;
    title: string;
    start: string;
    end: string;
    description?: string;
    color?: string;
    share_status?: string;
    effect?: string;
    shading?: number;
    tags?: string[];
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
    const [isDescFocused, setIsDescFocused] = useState(false);
    const [shading, setShading] = useState<number>(event.shading ?? 0);
    const [tags, setTags] = useState<string[]>(event.tags ?? ['', '', '']);

    const { highlight, startLinkSelection, cancelLinkSelection } = useHighlight();

    // Refs to hold latest values for cleanup/debounce closures (avoids stale state)
    const titleRef = useRef(title);
    const descriptionRef = useRef(description);
    const selectedThemeIdRef = useRef(selectedThemeId);
    const shadingRef = useRef(shading);
    const tagsRef = useRef(tags);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const eventIdRef = useRef(event.id);
    const onSaveRef = useRef(onSave);

    // Keep refs in sync with state
    useEffect(() => { titleRef.current = title; }, [title]);
    useEffect(() => { descriptionRef.current = description; }, [description]);
    useEffect(() => { selectedThemeIdRef.current = selectedThemeId; }, [selectedThemeId]);
    useEffect(() => { shadingRef.current = shading; }, [shading]);
    useEffect(() => { tagsRef.current = tags; }, [tags]);
    useEffect(() => { eventIdRef.current = event.id; }, [event.id]);
    useEffect(() => { onSaveRef.current = onSave; }, [onSave]);

    // Color Logic
    const getEventTheme = (evt: CalendarEvent) => {
        let effect = 'none';
        if (selectedThemeId) {
            const themeNode = themes.find(t => t.id === selectedThemeId);
            if (themeNode?.effect) {
                effect = themeNode.effect;
            }
        } else {
            effect = evt.effect || 'none';
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

    // Debounced save — fires 500ms after last change
    const scheduleSave = useCallback(() => {
        if (debounceTimer.current) clearTimeout(debounceTimer.current);
        debounceTimer.current = setTimeout(() => {
            const activeTags = tagsRef.current.filter(t => t.trim() !== '');
            onSaveRef.current(eventIdRef.current, {
                title: titleRef.current,
                description: descriptionRef.current,
                parent_id: selectedThemeIdRef.current,
                shading: shadingRef.current,
                tags: activeTags,
            });
        }, 500);
    }, []);

    // CRITICAL: Flush save on unmount so closing the popup never loses data
    useEffect(() => {
        return () => {
            if (debounceTimer.current) clearTimeout(debounceTimer.current);
            const activeTags = tagsRef.current.filter(t => t.trim() !== '');
            onSaveRef.current(eventIdRef.current, {
                title: titleRef.current,
                description: descriptionRef.current,
                parent_id: selectedThemeIdRef.current,
                shading: shadingRef.current,
                tags: activeTags,
            });
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleDescriptionChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const val = e.target.value;
        const prevVal = descriptionRef.current;
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

                        setTimeout(() => {
                            onSaveRef.current(eventIdRef.current, { title: titleRef.current, description: finalDesc, parent_id: selectedThemeIdRef.current });
                        }, 0);

                        return finalDesc;
                    });
                }, { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
                return; // Don't schedule debounce for link selection
            } else {
                if (!val.includes('--')) {
                    cancelLinkSelection();
                }
            }
        }

        scheduleSave();
    };

    const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setTitle(e.target.value);
        scheduleSave();
    };

    // Sync local state if the event changes externally (e.g. calendar drag)
    useEffect(() => {
        if (event.description !== descriptionRef.current) setDescription(event.description || "");
        if (event.title !== titleRef.current) setTitle(event.title);
        if ((event.shading ?? 0) !== shadingRef.current) setShading(event.shading ?? 0);
        if (JSON.stringify(event.tags ?? []) !== JSON.stringify(tagsRef.current.filter(t => t.trim() !== ''))) {
            const incoming = event.tags ?? [];
            setTags([incoming[0] ?? '', incoming[1] ?? '', incoming[2] ?? '']);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [event.id, event.title, event.description, event.shading, event.tags]);

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
                        onFocus={(e) => { e.target.select(); }}
                        type="text"
                        value={title}
                        onChange={handleTitleChange}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                e.preventDefault();
                                textareaRef.current?.focus();
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

                {/* Time Display */}
                <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-900/50 p-2 rounded-lg">
                    <Calendar size={14} />
                    <span>
                        {new Date(event.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - {new Date(event.end).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                </div>

                {/* Theme Selector */}
                <div className="relative group flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 bg-transparent px-2">
                    <Folder size={14} className="flex-shrink-0" />
                    <select
                        className="flex-1 bg-transparent border-none py-1 appearance-none focus:ring-0 outline-none cursor-pointer text-gray-700 dark:text-gray-300"
                        value={selectedThemeId || ""}
                        onChange={(e) => {
                            const newVal = e.target.value || null;
                            setSelectedThemeId(newVal);
                            selectedThemeIdRef.current = newVal;

                            const selectedTheme = themes.find(t => t.id === newVal);
                            const newColor = selectedTheme?.color;

                            // Theme change is immediate — no debounce
                            if (debounceTimer.current) clearTimeout(debounceTimer.current);
                            const activeTags = tagsRef.current.filter(t => t.trim() !== '');
                            onSaveRef.current(event.id, {
                                title: titleRef.current,
                                description: descriptionRef.current,
                                parent_id: newVal,
                                shading: shadingRef.current,
                                tags: activeTags,
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

                {/* Shading */}
                <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-400 font-semibold w-16 shrink-0">Shading</span>
                    <div className="flex items-center gap-1.5">
                        {[0, 1, 2, 3, 4].map(level => (
                            <button
                                key={level}
                                onClick={() => {
                                    setShading(level);
                                    scheduleSave();
                                }}
                                title={level === 0 ? 'None' : `Level ${level}`}
                                className={`w-5 h-5 rounded border transition-all ${shading === level ? 'ring-2 ring-indigo-500 ring-offset-1 scale-110' : 'hover:scale-105'}`}
                                style={{
                                    background: level === 0
                                        ? 'transparent'
                                        : `rgba(90,90,90,${level * 0.22})`,
                                    borderColor: level === 0 ? '#d1d5db' : `rgba(90,90,90,${0.3 + level * 0.15})`
                                }}
                            >
                                {level === 0 && <span className="text-[8px] text-gray-400 leading-none flex items-center justify-center w-full h-full">✕</span>}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Hints / Tags */}
                <div className="flex flex-col gap-1">
                    <span className="text-xs text-gray-400 font-semibold">Hinweise</span>
                    {[0, 1, 2].map(idx => (
                        <input
                            key={idx}
                            type="text"
                            value={tags[idx] ?? ''}
                            onChange={(e) => {
                                const next = [...tags];
                                next[idx] = e.target.value;
                                setTags(next);
                                scheduleSave();
                            }}
                            placeholder={`Hinweis ${idx + 1}...`}
                            className="w-full bg-transparent border border-dashed border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-indigo-400 text-gray-700 dark:text-gray-300 placeholder:text-gray-300 dark:placeholder:text-gray-600"
                        />
                    ))}
                </div>

                {/* Description */}
                <div
                    className="flex-1 min-h-[80px]"
                    onClick={() => { if (!isDescFocused) { setIsDescFocused(true); } }}
                >
                    {isDescFocused || !description ? (
                        <textarea
                            autoFocus={isDescFocused}
                            ref={textareaRef}
                            value={description}
                            onChange={handleDescriptionChange}
                            onBlur={() => { setIsDescFocused(false); }}
                            placeholder="Add details..."
                            className="w-full h-full bg-transparent border-none p-0 text-sm px-2 focus:ring-0 outline-none text-gray-700 dark:text-gray-300 resize-none placeholder:text-gray-400 leading-relaxed"
                        />
                    ) : (
                        <div className="w-full h-full text-sm px-2 text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-wrap cursor-text">
                            {description.split(/(\[[^\[\]]+\]\(tide:\/\/[^/]+\/[^)]+\))/g).map((part, i) => {
                                const match = part.match(/\[([^\[\]]+)\]\(tide:\/\/([^/]+)\/([^)]+)\)/);
                                if (match) {
                                    const [, matchTitle, type, targetId] = match;
                                    return (
                                        <span
                                            key={i}
                                            onClick={(e) => { e.stopPropagation(); onLinkClick({ id: targetId, type, title: matchTitle }); }}
                                            className="text-purple-500 bg-purple-500/10 px-1 rounded cursor-pointer hover:bg-purple-500/20 font-medium z-50 relative"
                                        >
                                            @{matchTitle}
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
