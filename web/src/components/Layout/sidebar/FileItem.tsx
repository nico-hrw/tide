import { Plus, Folder, FolderOpen, Trash, Edit2, Share, Eye, EyeOff, ChevronRight, ChevronDown, MessageSquare, User, Lock, Pin, Users, Puzzle, Globe, Check, Loader2, X, FileText, Layout } from "lucide-react";
import NoteIcon from '@/components/Icons/NoteIcon';
import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { Tab } from '@/components/Layout/TabList';
import { useHighlight } from "@/components/HighlightContext";
import { useDataStore } from "@/store/useDataStore";
import { useDragGhost } from "@/store/useDragGhost";
import { apiFetch } from "@/lib/api";
import { getSafeColor } from "@/lib/designTokens";
import { VisibilityBadge } from "@/components/Visibility/VisibilityBadge";
import { getVisibilityState } from "@/components/Visibility/visibilityState";
import type { DecryptedFile, ContextMenuEvent } from "./types";

export const isTouchDevice = typeof window !== 'undefined' && Boolean(window.matchMedia?.('(pointer: coarse) and (hover: none)')?.matches);

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

/** Title while a link target is being chosen: plain text (no glow or weight change, so the row never changes width). */
export const AnimatedLinkingText = ({ text }: { text: string; index?: number }) => (
    <span className="inline-block truncate w-full">{text}</span>
);

export const FileItem = ({ file, level, onSelect, onDelete, onRename, onVisibility, onShare, editingId, onRenameSubmit, onDragStart, onContextMenu, enabledExtensions, myId, index, activeTabId, openTabs }: FileItemProps) => {
    const { isHighlighted, highlight } = useHighlight();
    const startGhost = useDragGhost(s => s.startGhost);
    const [isCalendarDropTarget, setIsCalendarDropTarget] = useState(false);
    const activeNoteId = useDataStore(s => s.activeNoteId);
    const theme = useDataStore(s => s.theme);
    const isDark = theme === 'dark';
    const safeColor = getSafeColor(file.safe || file.metadata?.safe, isDark);

    // Active state and Open tabs state
    const isActive = activeTabId === file.id || activeNoteId === file.id;
    const isOpen = !!openTabs?.some(t => t.id === file.id);
    const isLocked = Boolean(file.metadata?.has_custom_password || file.metadata?.security_settings?.has_custom_password || (typeof file.title === 'string' && file.title.startsWith('#')));

    const isOwner = !file.owner_id || !myId || file.owner_id === myId;
    // The recipient list is not available here; share_status only tells us "shared", so no count is shown.
    const visibilityState = getVisibilityState({
        visibility: file.visibility,
        isOwner,
        isShared: file.share_status === 'shared',
    });

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
            onDragStart={(e: any) => {
                try {
                    e.dataTransfer.setData("text/plain", file.id);
                    e.dataTransfer.effectAllowed = "move";
                } catch {}
                onDragStart(e, file.id);
            }}
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
                ${isCalendarDropTarget ? 'ring-2 ring-t2-accent bg-t2-sub ' : ''}
                ${highlight.isSelectingLink ? 'cursor-crosshair bg-t2-sub shadow-[inset_0_0_0_1px_var(--t2-line)] hover:bg-t2-hover hover:shadow-[inset_0_0_0_1.5px_var(--t2-ink)]' : ''}
                ${isActive
                    ? 'bg-t2-stage  text-t2-ink  font-semibold ring-1 ring-t2-line '
                    : isOpen
                        ? 'bg-t2-hover  text-t2-ink  font-medium'
                        : 'hover:bg-[var(--hover-bg)] dark:hover:bg-white/[0.06] interactive-hover text-t2-ink '
                }`}
        >
            <div className="flex items-center gap-2 truncate flex-1 flex-shrink-0">
                <div className="relative shrink-0 flex items-center justify-center">
                    {file.type === 'canvas' ? (
                        <Layout
                            size={15}
                            className={`shrink-0 ${
                                isActive
                                    ? 'text-t2-ink '
                                    : isOpen
                                        ? 'text-t2-ink '
                                        : ''
                            }`}
                            style={!isActive && !isOpen ? { color: safeColor } : undefined}
                        />
                    ) : (
                        <NoteIcon
                            size={15}
                            className={`shrink-0 ${
                                isActive
                                    ? 'text-t2-ink '
                                    : isOpen
                                        ? 'text-t2-ink '
                                        : ''
                            }`}
                            style={!isActive && !isOpen ? { color: safeColor } : undefined}
                        />
                    )}
                    {isLocked && (
                        <span title="PIN-geschützt" className="absolute -bottom-1 -right-1 flex items-center justify-center p-[1px] bg-t2-surface  rounded-full shadow-xs">
                            <Lock size={8} className="text-t2-ink " strokeWidth={2.5} />
                        </span>
                    )}
                </div>
                {editingId === file.id ? (
                    <input
                        autoFocus
                        onFocus={(e) => e.target.select()}
                        defaultValue={file.title}
                        onClick={(e) => e.stopPropagation()}
                        onBlur={(e) => onRenameSubmit?.(file.id, e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && onRenameSubmit?.(file.id, e.currentTarget.value)}
                        className="w-full bg-t2-surface  border border-t2-line  rounded px-1 text-sm outline-none text-t2-ink "
                    />
                ) : (
                    <span className={`text-sm truncate transition-colors ${
                        isActive
                            ? 'text-t2-ink  font-semibold'
                            : isOpen
                                ? 'text-t2-ink  font-medium'
                                : 'text-t2-ink  font-medium group-hover:text-t2-ink '
                    } ${file.owner_id && myId && file.owner_id !== myId ? 'purple-shimmer-text' : ''}`}>
                        {(highlight.isSelectingLink || isHighlighted(file.id, 'file')) ? <AnimatedLinkingText text={file.title.startsWith('#') ? file.title.slice(1).trim() : file.title} index={index} /> : (file.title.startsWith('#') ? file.title.slice(1).trim() : file.title)}
                    </span>
                )}
            </div>
            <span className="shrink-0 ml-1 flex items-center">
                <VisibilityBadge kind={visibilityState.kind} size={12} className="text-t2-ink-2" hideWhenPrivate />
            </span>
        </motion.div>
    );
};

