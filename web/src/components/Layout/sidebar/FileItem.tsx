import { Plus, Folder, FolderOpen, Trash, Edit2, Share, Eye, EyeOff, ChevronRight, ChevronDown, MessageSquare, User, Lock, Pin, Users, Puzzle, Globe, Check, Loader2, X, FileText, Layout } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { Tab } from '@/components/Layout/TabList';
import { useHighlight } from "@/components/HighlightContext";
import { useDataStore } from "@/store/useDataStore";
import { useDragGhost } from "@/store/useDragGhost";
import { apiFetch } from "@/lib/api";
import type { DecryptedFile, ContextMenuEvent } from "./types";

export const isTouchDevice = typeof window !== 'undefined' && ('ontouchstart' in window || (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0));

export interface FileItemProps {
    file: DecryptedFile;
    level: number;
    onSelect: (id: string, title: string) => void;
    onDelete: (e: React.MouseEvent, id: string) => void;
    onRename: (e: React.MouseEvent, id: string, currentTitle: string) => void;
    onVisibility: (e: React.MouseEvent, id: string, currentVisibility: string) => void;
    onShare: (e: React.MouseEvent, id: string) => void;
    editingId?: string | null;
    onRenameSubmit?: (id: string, newTitle: string) => void;
    onDragStart: (e: React.DragEvent, id: string) => void;
    onContextMenu: (e: ContextMenuEvent, id: string, type: 'file' | 'folder') => void;
    enabledExtensions?: string[];
    myId?: string;
    index?: number;
    activeTabId?: string;
    openTabs?: Tab[];
}

export const AnimatedLinkingText = ({ text, index = 0 }: { text: string, index?: number }) => {
    return (
        <motion.span
            initial={{ color: 'inherit', textShadow: 'none', fontWeight: 500 }}
            animate={{
                color: ['inherit', '#a855f7', '#a855f7', 'inherit'],
                textShadow: ['none', '0 0 12px rgba(168,85,247,0.7)', '0 0 12px rgba(168,85,247,0.7)', 'none'],
                fontWeight: [500, 700, 700, 500]
            }}
            transition={{
                duration: 2.5,
                repeat: 3, // Don't animate continuously
                delay: (index * 0.15), // Wave effect
                ease: "easeInOut",
                times: [0, 0.3, 0.7, 1]
            }}
            className="inline-block truncate w-full"
        >
            {text}
        </motion.span>
    );
};

export const FileItem = ({ file, level, onSelect, onDelete, onRename, onVisibility, onShare, editingId, onRenameSubmit, onDragStart, onContextMenu, enabledExtensions, myId, index, activeTabId, openTabs }: FileItemProps) => {
    const { isHighlighted, highlight } = useHighlight();
    const startGhost = useDragGhost(s => s.startGhost);
    const [isCalendarDropTarget, setIsCalendarDropTarget] = useState(false);
    const activeNoteId = useDataStore(s => s.activeNoteId);

    // Active state and Open tabs state
    const isActive = activeTabId === file.id || activeNoteId === file.id;
    const isOpen = !!openTabs?.some(t => t.id === file.id);
    const isLocked = Boolean(file.metadata?.has_custom_password || file.metadata?.security_settings?.has_custom_password || (typeof file.title === 'string' && file.title.startsWith('#')));

    // Touch long-press handling
    const touchStartRef = useRef<{ x: number; y: number } | null>(null);
    const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const isLongPressTriggeredRef = useRef(false);

    useEffect(() => {
        return () => {
            if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
        };
    }, []);

    // Custom-drag detection: the calendar's main drag uses mousedown/mousemove,
    // not HTML5 DnD, so onDragOver never fires. We listen for the global custom
    // events emitted by CalendarView and decide whether the cursor is over our
    // own bounding rect.
    const tileRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const onMove = (ev: Event) => {
            const detail = (ev as CustomEvent).detail;
            if (!detail || !tileRef.current) return;
            const r = tileRef.current.getBoundingClientRect();
            const inside = detail.x >= r.left && detail.x <= r.right && detail.y >= r.top && detail.y <= r.bottom;
            if (inside && !isCalendarDropTarget) {
                setIsCalendarDropTarget(true);
                onSelect(file.id, file.title);
            } else if (!inside && isCalendarDropTarget) {
                setIsCalendarDropTarget(false);
            }
        };
        const onDrop = (ev: Event) => {
            const detail = (ev as CustomEvent).detail;
            if (!detail || detail.consumed || !tileRef.current) return;
            const r = tileRef.current.getBoundingClientRect();
            const inside = detail.x >= r.left && detail.x <= r.right && detail.y >= r.top && detail.y <= r.bottom;
            if (!inside) return;
            // Mark this drop as consumed so CalendarView skips its own time-move logic.
            detail.consumed = true;
            detail.targetNoteId = file.id;
            setIsCalendarDropTarget(false);
            onSelect(file.id, file.title);
            setTimeout(() => {
                startGhost({
                    eventId: detail.eventId,
                    title: detail.title || 'Untitled',
                    start: detail.start || '',
                    end: detail.end || '',
                    color: detail.color || undefined,
                    targetNoteId: file.id,
                });
            }, 80);
        };
        window.addEventListener('tide:event-drag-move', onMove);
        window.addEventListener('tide:event-drag-drop', onDrop);
        return () => {
            window.removeEventListener('tide:event-drag-move', onMove);
            window.removeEventListener('tide:event-drag-drop', onDrop);
        };
    }, [file.id, file.title, isCalendarDropTarget, onSelect, startGhost]);

    return (
        <motion.div
            ref={tileRef}
            data-note-tile={file.id}
            layout
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ type: 'spring', stiffness: 350, damping: 40, mass: 0.8, delay: (index || 0) * 0.03 }}
            draggable={!isTouchDevice}
            style={{
                WebkitTouchCallout: 'none',
                userSelect: 'none',
            }}
            onTouchStart={(e) => {
                if (e.touches.length !== 1) return;
                const touch = e.touches[0];
                touchStartRef.current = { x: touch.clientX, y: touch.clientY };
                isLongPressTriggeredRef.current = false;
                if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
                longPressTimerRef.current = setTimeout(() => {
                    isLongPressTriggeredRef.current = true;
                    onContextMenu({
                        clientX: touch.clientX,
                        clientY: touch.clientY,
                        preventDefault: () => {},
                        stopPropagation: () => {},
                    }, file.id, 'file');
                }, 450);
            }}
            onTouchMove={(e) => {
                if (!touchStartRef.current || !longPressTimerRef.current) return;
                const touch = e.touches[0];
                const dx = touch.clientX - touchStartRef.current.x;
                const dy = touch.clientY - touchStartRef.current.y;
                if (Math.hypot(dx, dy) > 10) {
                    clearTimeout(longPressTimerRef.current);
                    longPressTimerRef.current = null;
                }
            }}
            onTouchEnd={(e) => {
                if (longPressTimerRef.current) {
                    clearTimeout(longPressTimerRef.current);
                    longPressTimerRef.current = null;
                }
                if (isLongPressTriggeredRef.current) {
                    e.preventDefault();
                    setTimeout(() => {
                        isLongPressTriggeredRef.current = false;
                    }, 150);
                }
            }}
            onTouchCancel={() => {
                if (longPressTimerRef.current) {
                    clearTimeout(longPressTimerRef.current);
                    longPressTimerRef.current = null;
                }
                isLongPressTriggeredRef.current = false;
            }}
            onDragStart={(e: any) => onDragStart(e, file.id)}
            onContextMenu={(e: any) => onContextMenu(e, file.id, 'file')}
            onDragOver={(e) => {
                if (e.dataTransfer.types.includes('tide/calendar-event')) {
                    e.preventDefault();
                    e.stopPropagation();
                    e.dataTransfer.dropEffect = 'copy';
                    if (!isCalendarDropTarget) {
                        setIsCalendarDropTarget(true);
                        // Open the note when hovering over it
                        onSelect(file.id, file.title);
                    }
                }
            }}
            onDragLeave={() => setIsCalendarDropTarget(false)}
            onDrop={(e) => {
                const payload = e.dataTransfer.getData('tide/calendar-event');
                if (!payload) return;
                e.preventDefault();
                e.stopPropagation();
                setIsCalendarDropTarget(false);
                try {
                    const ev = JSON.parse(payload);
                    onSelect(file.id, file.title);
                    // Defer slightly so the editor has time to mount before the click handler arms.
                    setTimeout(() => {
                        startGhost({
                            eventId: ev.id,
                            title: ev.title || 'Untitled',
                            start: ev.start || '',
                            end: ev.end || '',
                            color: ev.color || undefined,
                            targetNoteId: file.id,
                        });
                    }, 80);
                } catch (err) {
                    console.error('[Sidebar] Bad calendar-event drop payload', err);
                }
            }}
            onClick={(e) => {
                if (isLongPressTriggeredRef.current) {
                    e.preventDefault();
                    e.stopPropagation();
                    return;
                }
                if (highlight.isSelectingLink && highlight.onLinkSelect) {
                    e.stopPropagation();
                    highlight.onLinkSelect({ id: file.id, title: file.title, type: 'file', rect: e.currentTarget.getBoundingClientRect() });
                } else {
                    onSelect(file.id, file.title);
                }
            }}
            className={`group flex items-center justify-between w-full px-2 py-1 min-h-[28px] rounded-lg cursor-pointer transition-all duration-150
                ${isCalendarDropTarget ? 'ring-2 ring-violet-400 bg-violet-50 dark:bg-violet-900/20' : ''}
                ${isActive
                    ? 'bg-blue-100/90 dark:bg-blue-950/60 text-blue-900 dark:text-blue-100 font-semibold ring-1 ring-blue-400/40'
                    : isOpen
                        ? 'bg-blue-50/75 dark:bg-blue-950/30 text-blue-800 dark:text-blue-200 font-medium'
                        : 'hover:bg-[var(--hover-bg)] dark:hover:bg-white/[0.06] interactive-hover text-gray-700 dark:text-gray-300'
                }`}
        >
            <div className="flex items-center gap-2 truncate flex-1 flex-shrink-0">
                <div className="relative shrink-0 flex items-center justify-center">
                    {file.type === 'canvas' ? (
                        <Layout size={15} className={`shrink-0 ${isActive || isOpen ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400 dark:text-slate-500'}`} />
                    ) : (
                        <FileText size={15} className={`shrink-0 ${isActive || isOpen ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400 dark:text-slate-500'}`} />
                    )}
                    {isLocked && (
                        <span title="PIN-geschützt" className="absolute -bottom-1 -right-1 flex items-center justify-center p-[1px] bg-white dark:bg-slate-900 rounded-full shadow-xs">
                            <Lock size={8} className="text-amber-500" strokeWidth={2.5} />
                        </span>
                    )}
                </div>
                {(file as any).share_status === 'shared' && (
                    <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-sky-400" title="Geteilte Notiz" />
                )}
                {editingId === file.id ? (
                    <input
                        autoFocus
                        onFocus={(e) => e.target.select()}
                        defaultValue={file.title}
                        onClick={(e) => e.stopPropagation()}
                        onBlur={(e) => onRenameSubmit?.(file.id, e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && onRenameSubmit?.(file.id, e.currentTarget.value)}
                        className="w-full bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded px-1 text-sm outline-none text-gray-900 dark:text-gray-100"
                    />
                ) : (
                    <span className={`text-sm truncate transition-colors ${
                        isActive
                            ? 'text-blue-950 dark:text-blue-100 font-semibold'
                            : isOpen
                                ? 'text-blue-800 dark:text-blue-200 font-medium'
                                : 'text-gray-700 dark:text-gray-300 font-medium group-hover:text-gray-900 dark:group-hover:text-gray-100'
                    } ${file.owner_id && myId && file.owner_id !== myId ? 'purple-shimmer-text' : ''}`}>
                        {(highlight.isSelectingLink || isHighlighted(file.id, 'file')) ? <AnimatedLinkingText text={file.title.startsWith('#') ? file.title.slice(1).trim() : file.title} index={index} /> : (file.title.startsWith('#') ? file.title.slice(1).trim() : file.title)}
                    </span>
                )}
            </div>
        </motion.div>
    );
};

