import { ReactRenderer } from '@tiptap/react';
import tippy from 'tippy.js';
import { useDataStore } from '@/store/useDataStore';
import { useLinkStore } from '@/store/useLinkStore';
import { forwardRef, useEffect, useImperativeHandle, useState, useRef } from 'react';
import { FileText, Calendar as CalendarIcon, CheckSquare, Plus, ChevronRight, ArrowLeft, Paperclip } from 'lucide-react';
import { getKnownQuicknotes, saveKnownQuicknote } from '@/lib/quicknotesApi';
import { format } from 'date-fns';

export function ensureSafeIsActive(safeName?: string | null) {
    if (!safeName) return;
    try {
        const store = useDataStore.getState();
        const normSafe = safeName === 'Standard' ? 'main' : safeName;
        const currentActive: string[] = Array.isArray(store.activeSafes) ? store.activeSafes : [];
        const isAlreadyActive =
            currentActive.includes('all') ||
            currentActive.some((s: string) => s.toLowerCase() === normSafe.toLowerCase() || (normSafe === 'main' && s.toLowerCase() === 'standard'));

        if (!isAlreadyActive) {
            const nextActive = currentActive.length === 0
                ? Array.from(new Set(['main', normSafe]))
                : Array.from(new Set([...currentActive, normSafe]));

            if (typeof store.setActiveSafes === 'function') {
                store.setActiveSafes(nextActive);
            } else if (typeof store.toggleSafe === 'function') {
                store.toggleSafe(normSafe);
            } else if (typeof (store as unknown as Record<string, unknown>).toggleActiveSafe === 'function') {
                ((store as unknown as Record<string, unknown>).toggleActiveSafe as (s: string) => void)(normSafe);
            } else {
                useDataStore.setState({ activeSafes: nextActive });
            }

            try {
                if (typeof window !== 'undefined') {
                    localStorage.setItem('tide_active_safes', JSON.stringify(nextActive));
                }
            } catch (_) {}
        }
    } catch (err) {
        console.warn('ensureSafeIsActive error:', err);
    }
}

export async function setNoteSafeInStore(noteId: string, safeName: string) {
    if (!noteId || !safeName) return;
    try {
        const store = useDataStore.getState();
        if (typeof store.setNoteSafe === 'function') {
            await store.setNoteSafe(noteId, safeName);
            return;
        }

        if (typeof store.createSafe === 'function') {
            const knownSafes: string[] = Array.isArray(store.availableSafes)
                ? store.availableSafes
                : [];
            if (!knownSafes.some((s: string) => s.toLowerCase() === safeName.toLowerCase())) {
                store.createSafe(safeName);
            }
        }

        if (typeof store.updateFile === 'function') {
            const currentNote = (store.notes || []).find((n) => n.id === noteId);
            const currentMeta = (currentNote?.metadata as Record<string, unknown> | undefined) || {};
            await store.updateFile(noteId, {
                safe: safeName,
                metadata: { ...currentMeta, safe: safeName }
            });
        } else {
            useDataStore.setState((s) => ({
                notes: (s.notes || []).map((n) =>
                    n.id === noteId ? { ...n, safe: safeName, metadata: { ...((n.metadata as Record<string, unknown> | undefined) || {}), safe: safeName } } : n
                )
            }));
        }
    } catch (err) {
        console.warn('setNoteSafeInStore error:', err);
    }
}

interface EventItem {
    id: string;
    title: string;
    label: string;
    type: 'event';
    start?: string;
    color: string;
    formattedDate: string;
    isGhost: boolean;
    safe?: string;
}

interface EventGroupItem {
    id: string;
    title: string;
    label: string;
    isGroup: true;
    count: number;
    events: EventItem[];
    color: string;
    type: 'event';
}

type MentionSuggestionItem =
    | EventItem
    | EventGroupItem
    | {
          id: string;
          label: string;
          title?: string;
          type?: string;
          query?: string;
          isGhost?: boolean;
          isGroup?: boolean;
          count?: number;
          start?: string;
          color?: string;
          formattedDate?: string;
          isCompleted?: boolean;
          priority?: string;
          dueDate?: string;
          scheduledDate?: string;
          pathSegments?: string[];
          cleanNoteTitle?: string;
          safe?: string;
      };

const MentionList = forwardRef((props: any, ref) => {
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [activeGroup, setActiveGroup] = useState<EventGroupItem | null>(null);
    const prevGroupIndexRef = useRef(0);
    const isCreatingRef = useRef(false);
    const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

    const currentList = activeGroup ? activeGroup.events : (props.items || []);

    useEffect(() => {
        setSelectedIndex(0);
        setActiveGroup(null);
        prevGroupIndexRef.current = 0;
    }, [props.items]);

    useEffect(() => {
        itemRefs.current[selectedIndex]?.scrollIntoView({ block: 'nearest' });
    }, [selectedIndex, activeGroup]);

    const selectItem = async (item: MentionSuggestionItem, index?: number) => {
        if (!item) return;

        if ('isGroup' in item && item.isGroup) {
            prevGroupIndexRef.current = index !== undefined ? index : selectedIndex;
            setActiveGroup(item as EventGroupItem);
            setSelectedIndex(0);
            return;
        }

        if (item.id === 'NEW') {
            if (isCreatingRef.current) return;
            isCreatingRef.current = true;
            try {
                // Sanitize title - strip any leading ! prefix, explicitly using props.query
                const itemQuery = 'query' in item ? item.query : undefined;
                const cleanTitle = (props.query || itemQuery || item.label || 'Untitled')
                    .replace(/^!+/, '').trim() || 'Untitled';

                if (typeof window !== 'undefined' && window.location.pathname.startsWith('/notes/')) {
                    const parentSlug = window.location.pathname.replace('/notes/', '').split('/')[0];
                    const childSlug = cleanTitle.toLowerCase().trim().replace(/[^a-z0-9äöüß_-]+/gi, '-').replace(/^-+|-+$/g, '') || ('note-' + Date.now().toString(36));
                    try {
                        const { saveQuicknote } = (await import('@/lib/quicknotesApi')) as {
                            saveQuicknote: (slug: string, title: string, content?: string, parentSlug?: string) => Promise<void>;
                        };
                        await saveQuicknote(childSlug, cleanTitle, undefined, parentSlug);
                        saveKnownQuicknote({ slug: childSlug, title: cleanTitle, parent_slug: parentSlug });
                    } catch (err: unknown) {
                        console.error('Failed to initialize quicknote:', err);
                    }
                    props.command({ id: childSlug, label: cleanTitle, type: 'note' });
                } else {
                    // We immediately get the UUID so Tiptap can insert the node.
                    const newId = await useDataStore.getState().createNote(cleanTitle);

                    // Insert as a real (non-ghost) link immediately with correct title.
                    props.command({ ...item, id: newId, label: cleanTitle, type: 'note', isGhost: false });
                }
            } finally {
                isCreatingRef.current = false;
            }
        } else if (item.id === 'NEW_TASK') {
            if (isCreatingRef.current) return;
            isCreatingRef.current = true;
            try {
                const itemQuery = 'query' in item ? item.query : undefined;
                const rawTitle = props.query || itemQuery || (item.label && !item.label.startsWith('Create ') ? item.label : '') || 'New Todo';
                const cleanTitle = rawTitle.replace(/^!+/, '').trim() || 'New Todo';
                const newId = await useDataStore.getState().addTask({ title: cleanTitle, isCompleted: false });
                props.command({
                    ...item,
                    id: newId,
                    label: cleanTitle,
                    type: 'task',
                    isGhost: false,
                    isCompleted: false,
                    priority: undefined,
                    dueDate: undefined,
                    color: undefined,
                });
            } finally {
                isCreatingRef.current = false;
            }
        } else if (item.id === 'NEW_PATH_NOTE') {
            if (isCreatingRef.current) return;
            isCreatingRef.current = true;
            try {
                const pathSegments: string[] = (item as any).pathSegments || [];
                const cleanNoteTitle: string =
                    (item as any).cleanNoteTitle ||
                    ('title' in item ? item.title : undefined) ||
                    'Untitled';

                let currentParentId: string | null = null;
                for (const segment of pathSegments) {
                    const currentNotes = useDataStore.getState().notes || [];
                    const existingFolder = currentNotes.find(
                        (f: any) =>
                            f &&
                            f.type === 'folder' &&
                            !f.isGroup &&
                            (f.parent_id || null) === (currentParentId || null) &&
                            f.title?.trim().toLowerCase() === segment.trim().toLowerCase()
                    );

                    if (existingFolder) {
                        currentParentId = existingFolder.id;
                    } else {
                        const createFolder = useDataStore.getState().createFolder;
                        if (typeof createFolder === 'function') {
                            currentParentId = await createFolder(segment, currentParentId);
                        }
                    }
                }

                const finalFolderId = currentParentId;
                const newNoteId = await useDataStore.getState().createNote(cleanNoteTitle, undefined, finalFolderId);

                props.command({ id: newNoteId, label: cleanNoteTitle, type: 'note', isGhost: false });
            } catch (err) {
                console.error('Failed to create path note:', err);
            } finally {
                isCreatingRef.current = false;
            }
        } else if (item.id === 'NEW_SAFE_NOTE') {
            if (isCreatingRef.current) return;
            isCreatingRef.current = true;
            try {
                let targetSafe = (item as any).safe || 'main';
                if (targetSafe === 'Standard') targetSafe = 'main';
                const cleanTitle =
                    (item as any).cleanNoteTitle ||
                    ('title' in item ? item.title : undefined) ||
                    'Untitled';

                const newId = await useDataStore.getState().createNote(cleanTitle);
                await setNoteSafeInStore(newId, targetSafe);

                const store = useDataStore.getState();
                const activeNoteId = store.activeNoteId;
                const currentNote = store.notes?.find((n) => n.id === activeNoteId);
                const rawCurrentSafe = currentNote?.safe || currentNote?.metadata?.safe || store.activeSafes?.[0] || 'main';
                const currentSafe = rawCurrentSafe === 'Standard' ? 'main' : rawCurrentSafe;

                if (targetSafe !== currentSafe && typeof store.linkNoteToSafe === 'function') {
                    store.linkNoteToSafe(newId, currentSafe);
                }

                props.command({
                    id: newId,
                    label: `${targetSafe}:${cleanTitle}`,
                    type: 'note',
                    safe: targetSafe,
                    isGhost: false,
                });
            } catch (err) {
                console.error('Failed to create cross-safe note:', err);
            } finally {
                isCreatingRef.current = false;
            }
        } else if ('safe' in item && item.safe && item.type === 'note') {
            const itemSafe = item.safe === 'Standard' ? 'main' : item.safe;
            const store = useDataStore.getState();
            const activeNoteId = store.activeNoteId;
            const currentNote = store.notes?.find((n) => n.id === activeNoteId);
            const rawCurrentSafe = currentNote?.safe || currentNote?.metadata?.safe || store.activeSafes?.[0] || 'main';
            const currentSafe = rawCurrentSafe === 'Standard' ? 'main' : rawCurrentSafe;

            if (itemSafe !== currentSafe && typeof store.linkNoteToSafe === 'function') {
                store.linkNoteToSafe(item.id, currentSafe);
            }

            const noteTitle = ('title' in item && item.title) ? item.title : item.label;
            props.command({
                ...item,
                id: item.id,
                label: `${itemSafe}:${noteTitle}`,
                type: 'note',
                safe: itemSafe,
                isGhost: false,
            });
        } else {
            const title = 'title' in item ? item.title : undefined;
            const store = useDataStore.getState();
            const realNote = store.notes?.find((n) => n.id === item.id);
            if (realNote && item.type === 'note') {
                const noteSafeRaw = realNote.safe || realNote.metadata?.safe || 'main';
                const noteSafe = noteSafeRaw === 'Standard' ? 'main' : noteSafeRaw;
                const activeNoteId = store.activeNoteId;
                const currentNote = store.notes?.find((n) => n.id === activeNoteId);
                const rawCurrentSafe = currentNote?.safe || currentNote?.metadata?.safe || store.activeSafes?.[0] || 'main';
                const currentSafe = rawCurrentSafe === 'Standard' ? 'main' : rawCurrentSafe;

                if (noteSafe !== currentSafe && typeof store.linkNoteToSafe === 'function') {
                    store.linkNoteToSafe(item.id, currentSafe);
                }

                props.command({
                    ...item,
                    safe: noteSafe,
                    label: noteSafe !== currentSafe ? `${noteSafe}:${title || item.label}` : (title || item.label),
                });
            } else {
                props.command({ ...item, label: title || item.label });
            }
        }
        useLinkStore.getState().setPendingLinkSource(null);
    };

    useImperativeHandle(ref, () => ({
        handleEscape: () => {
            if (activeGroup) {
                setActiveGroup(null);
                setSelectedIndex(prevGroupIndexRef.current);
                return true;
            }
            return false;
        },
        onKeyDown: ({ event }: { event: KeyboardEvent }) => {
            if (!currentList || currentList.length === 0) return false;

            if (event.key === 'ArrowUp') {
                setSelectedIndex((selectedIndex + currentList.length - 1) % currentList.length);
                return true;
            }
            if (event.key === 'ArrowDown') {
                setSelectedIndex((selectedIndex + 1) % currentList.length);
                return true;
            }
            if (event.key === 'ArrowRight') {
                if (!activeGroup) {
                    const item = currentList[selectedIndex];
                    if (item && 'isGroup' in item && item.isGroup) {
                        selectItem(item, selectedIndex);
                        return 'prevent_close';
                    }
                }
                return false;
            }
            if (event.key === 'ArrowLeft') {
                if (activeGroup) {
                    setActiveGroup(null);
                    setSelectedIndex(prevGroupIndexRef.current);
                    return true;
                }
                return false;
            }
            if (event.key === 'Enter' || event.key === 'Tab') {
                const item = currentList[selectedIndex];
                if (item) {
                    if ('isGroup' in item && item.isGroup) {
                        selectItem(item, selectedIndex);
                        return 'prevent_close';
                    }
                    selectItem(item);
                    return true;
                }
                return false;
            }
            return false;
        },
    }));

    return (
        <div className="flex flex-col p-1 w-[290px] max-h-[340px] overflow-y-auto bg-white/90 dark:bg-[#1a1a1a]/90 backdrop-blur-md border border-gray-200 dark:border-white/10 shadow-lg rounded-xl text-sm z-[9999]">
            {activeGroup ? (
                <>
                    <div className="p-1 border-b border-gray-100 dark:border-white/10 mb-1">
                        <button
                            type="button"
                            onMouseDown={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setActiveGroup(null);
                                setSelectedIndex(prevGroupIndexRef.current);
                            }}
                            className="flex items-center gap-1.5 text-xs text-blue-600 dark:text-blue-400 hover:underline font-medium w-full px-1.5 py-1 rounded cursor-pointer"
                        >
                            <ArrowLeft size={13} />
                            <span className="truncate">Zurück zu allen Ergebnissen</span>
                        </button>
                        <div className="flex items-center gap-1.5 px-1.5 py-0.5 text-[11px] text-gray-500 dark:text-gray-400 font-semibold truncate">
                            <span
                                className="w-2 h-2 rounded-full flex-shrink-0"
                                style={{ backgroundColor: activeGroup.color || '#3b82f6' }}
                            />
                            <span className="truncate">{activeGroup.title} ({activeGroup.events.length})</span>
                        </div>
                    </div>
                    {activeGroup.events.length ? (
                        activeGroup.events.map((eventItem: EventItem, index: number) => (
                            <button
                                key={eventItem.id || index}
                                ref={(el) => { itemRefs.current[index] = el; }}
                                className={`flex items-center gap-2 px-2 py-1.5 text-left rounded-lg transition-colors w-full ${
                                    index === selectedIndex
                                        ? 'bg-black/5 dark:bg-white/10 text-black dark:text-white'
                                        : 'text-gray-600 dark:text-gray-400 hover:bg-black/5 dark:hover:bg-white/5'
                                }`}
                                onMouseDown={(e) => {
                                    e.preventDefault();
                                    selectItem(eventItem);
                                }}
                            >
                                <span
                                    className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                                    style={{ backgroundColor: eventItem.color || '#3b82f6' }}
                                />
                                <div className="flex-1 font-medium text-xs truncate">
                                    {eventItem.formattedDate || 'Kein Datum'}
                                </div>
                                <CalendarIcon size={13} className="text-gray-400 dark:text-gray-500 flex-shrink-0" />
                            </button>
                        ))
                    ) : (
                        <div className="px-2 py-2 text-gray-500 text-xs">Keine Termine</div>
                    )}
                </>
            ) : (
                <>
                    {props.items.length ? (
                        props.items.map((item: any, index: number) => (
                            <button
                                key={item.id || index}
                                ref={(el) => { itemRefs.current[index] = el; }}
                                className={`flex items-center gap-2 px-2 py-1.5 text-left rounded-lg transition-colors w-full ${
                                    index === selectedIndex
                                        ? 'bg-black/5 dark:bg-white/10 text-black dark:text-white'
                                        : 'text-gray-600 dark:text-gray-400 hover:bg-black/5 dark:hover:bg-white/5'
                                }`}
                                onMouseDown={(e) => {
                                    e.preventDefault();
                                    selectItem(item, index);
                                }}
                            >
                                {item.isGroup ? (
                                    <>
                                        <span
                                            className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                                            style={{ backgroundColor: item.color || '#3b82f6' }}
                                        />
                                        <div className="flex items-center justify-between min-w-0 flex-1 gap-1.5">
                                            <span className="font-medium truncate">{item.title || item.label}</span>
                                            <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-blue-500/10 text-blue-600 dark:text-blue-400 font-medium flex-shrink-0">
                                                {item.count} Termine
                                            </span>
                                        </div>
                                        <ChevronRight size={15} className="text-gray-500 dark:text-gray-400 flex-shrink-0 ml-0.5" />
                                    </>
                                ) : item.type === 'event' ? (
                                    <>
                                        <span
                                            className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                                            style={{ backgroundColor: item.color || '#3b82f6' }}
                                        />
                                        <div className="flex items-center justify-between min-w-0 flex-1 gap-1.5">
                                            <span className="font-medium truncate">{item.label || item.title}</span>
                                            {item.formattedDate && (
                                                <span className="text-[11px] text-gray-400 dark:text-gray-500 flex-shrink-0 font-normal">
                                                    {item.formattedDate}
                                                </span>
                                            )}
                                        </div>
                                        <CalendarIcon size={14} className="text-gray-400 dark:text-gray-500 flex-shrink-0" />
                                    </>
                                ) : item.type === 'task' ? (
                                    <>
                                        <CheckSquare
                                            size={14}
                                            className="text-blue-500 dark:text-blue-400 flex-shrink-0"
                                            style={item.color ? { color: item.color } : undefined}
                                        />
                                        <div className="flex items-center justify-between min-w-0 flex-1 gap-1.5">
                                            <span className={`font-medium truncate ${item.isCompleted ? 'line-through text-gray-400 dark:text-gray-500' : ''}`}>
                                                <span className="text-xs text-gray-400 dark:text-gray-500 font-normal mr-1.5 no-underline">Todo:</span>
                                                {item.label || item.title}
                                            </span>
                                            <div className="flex items-center gap-1.5 flex-shrink-0">
                                                {item.formattedDate && (
                                                    <span className="text-[11px] text-gray-400 dark:text-gray-500 font-normal">
                                                        {item.formattedDate}
                                                    </span>
                                                )}
                                                {item.isCompleted && (
                                                    <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-green-500/10 text-green-600 dark:text-green-400 font-medium flex-shrink-0">
                                                        Erledigt
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </>
                                ) : item.id === 'NEW_TASK' ? (
                                    <>
                                        <CheckSquare size={14} className="text-blue-500 dark:text-blue-400 flex-shrink-0" />
                                        <div className="font-medium truncate flex-1">{item.label || item.title}</div>
                                        <Plus size={14} className="text-gray-400 dark:text-gray-500 flex-shrink-0" />
                                    </>
                                ) : item.safe && item.type === 'note' ? (
                                    <>
                                        <div className="flex items-center gap-1.5 truncate flex-1 min-w-0">
                                            <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-purple-500/10 text-purple-600 dark:text-purple-400 font-semibold tracking-wide shrink-0">
                                                {item.safe}
                                            </span>
                                            <span className="font-medium truncate">{item.title || item.label}</span>
                                        </div>
                                        <FileText size={14} className="text-gray-400 dark:text-gray-500 shrink-0" />
                                    </>
                                ) : (
                                    <>
                                        <div className="font-medium truncate flex-1">{item.label || item.title}</div>
                                        {item.type && (
                                            <div className="flex-shrink-0 text-gray-400 dark:text-gray-500">
                                                {item.type === 'note' && <FileText size={14} />}
                                                {item.type === 'file' && <Paperclip size={14} />}
                                                {item.type === 'action' && <Plus size={14} />}
                                            </div>
                                        )}
                                    </>
                                )}
                            </button>
                        ))
                    ) : (
                        <div className="px-2 py-2 text-gray-500 text-xs">No results</div>
                    )}
                </>
            )}
        </div>
    );
});

MentionList.displayName = 'MentionList';

export default {
    items: ({ query }: { query: string }) => {
        const isQuicknote = typeof window !== 'undefined' && window.location.pathname.startsWith('/notes/');
        if (isQuicknote) {
            const currentSlug = window.location.pathname.replace('/notes/', '').split('/')[0].split('?')[0];
            const cleanQuery = query.trim().toLowerCase();
            const results: MentionSuggestionItem[] = [];

            // 1. Suggest known quicknotes (from tree / cache)
            const knownNotes = getKnownQuicknotes();
            const matchingNotes = knownNotes
                .filter(n => n.slug !== currentSlug && (n.title.toLowerCase().includes(cleanQuery) || n.slug.toLowerCase().includes(cleanQuery)))
                .slice(0, 5);

            for (const n of matchingNotes) {
                results.push({
                    id: n.slug,
                    label: n.title || n.slug,
                    title: n.title || n.slug,
                    type: 'note',
                    isGhost: false,
                });
            }

            // 2. Suggest active file attachments
            const activeFiles: Array<{ id: string; name: string; size?: number }> =
                (typeof window !== 'undefined' && (window as any).__tide_active_attachments) || [];
            const matchingFiles = activeFiles
                .filter(f => f.name.toLowerCase().includes(cleanQuery))
                .slice(0, 5);

            for (const f of matchingFiles) {
                results.push({
                    id: f.id,
                    label: f.name,
                    title: f.name,
                    type: 'file',
                    isGhost: false,
                });
            }

            // 3. Option to create a new child quicknote
            if (cleanQuery && !matchingNotes.some(n => n.title.toLowerCase() === cleanQuery)) {
                results.push({
                    id: 'NEW',
                    label: `Notiz '${query.trim()}' erstellen`,
                    query: query.trim(),
                    type: 'action',
                    isGhost: false,
                });
            }

            return results;
        }

        const state = useDataStore.getState();
        const files = state.notes || []; // App uses 'notes' for files

        // 1. Ghost Link Logic
        if (query.startsWith('!')) {
            const cleanQuery = query.substring(1);
            return [{ id: 'GHOST', label: cleanQuery, query: cleanQuery, isGhost: true }];
        }

        // 2. Strict Aggressive Filtering
        const filteredFiles = files.filter((f: any) => {
            if (!f || !f.title) return false;
            if (f.isGroup || f.type === 'folder') return false; // Exclude folders and groups
            const titleLower = String(f.title).toLowerCase();

            // AGGRESSIVE BLOCKLIST:
            if (titleLower.includes('_style') || titleLower.includes('canva') || titleLower.startsWith('.')) {
                return false;
            }
            // [FIX] Exclude locked/ghost notes — these are corrupted, deleted, or still decrypting.
            // They would cause a 404 or decryption error when opened via mention link.
            if (f.isLocked || titleLower.startsWith('locked note')) return false;
            return true;
        });

        // 2.4 Cross-Safe @-Links (@safeName:query)
        if (query.includes(':')) {
            const colonIdx = query.indexOf(':');
            let targetSafe = query.substring(0, colonIdx).trim();
            if (targetSafe.toLowerCase() === 'standard') {
                targetSafe = 'main';
            }
            const subQuery = query.substring(colonIdx + 1).trim();

            if (targetSafe) {
                const safeFilteredFiles = filteredFiles.filter((f: any) => {
                    const noteSafe = (f.safe || f.metadata?.safe || 'main').trim();
                    const normNoteSafe = noteSafe.toLowerCase() === 'standard' ? 'main' : noteSafe.toLowerCase();
                    return normNoteSafe === targetSafe.toLowerCase();
                });

                const lowSub = subQuery.toLowerCase();
                const matchedNotes = lowSub
                    ? safeFilteredFiles.filter((f: any) => (f.title || f.id).toLowerCase().includes(lowSub))
                    : safeFilteredFiles;

                const suggestionItems: MentionSuggestionItem[] = matchedNotes.slice(0, 6).map((f: any) => ({
                    id: f.id,
                    label: `[Workspace: ${targetSafe}] ${f.title || f.id}`,
                    title: f.title || f.id,
                    safe: targetSafe,
                    type: 'note',
                    isGhost: false,
                }));

                const hasExactMatch = matchedNotes.some(
                    (f: any) => (f.title || '').trim().toLowerCase() === lowSub
                );

                if (!hasExactMatch) {
                    suggestionItems.push({
                        id: 'NEW_SAFE_NOTE',
                        label: `[+] In "${targetSafe}" erstellen: ${subQuery || 'Neue Notiz'}`,
                        title: subQuery || 'Neue Notiz',
                        cleanNoteTitle: subQuery || 'Neue Notiz',
                        safe: targetSafe,
                        type: 'action',
                        isGhost: false,
                    });
                }

                return suggestionItems;
            }
        }

        // 2.5 Path Support in Links (Feature B)
        if (query.includes('/')) {
            const cleanPath = query.trim().replace(/^\/+/, '');
            const parts = cleanPath.split('/');
            const cleanNoteTitle = parts[parts.length - 1].trim();
            const folderSegments = parts.slice(0, -1).map(s => s.trim()).filter(Boolean);

            const allFolders = files.filter((f: any) => f && f.type === 'folder' && !f.isGroup);
            const folderMap = new Map<string, any>(allFolders.map((f: any) => [f.id, f]));

            const getFolderPathSegments = (parentId?: string | null): string[] => {
                const segs: string[] = [];
                let cur = parentId;
                const seen = new Set<string>();
                while (cur && folderMap.has(cur) && !seen.has(cur)) {
                    seen.add(cur);
                    const folder = folderMap.get(cur);
                    if (folder?.title) {
                        segs.unshift(folder.title);
                    }
                    cur = folder?.parent_id || null;
                }
                return segs;
            };

            const matchedPathNotes = filteredFiles
                .filter((f: any) => {
                    const noteFolderSegs = getFolderPathSegments(f.parent_id);
                    const notePathString = '/' + [...noteFolderSegs, f.title].join('/');
                    const matchBySegments =
                        folderSegments.length === 0 ||
                        (noteFolderSegs.length >= folderSegments.length &&
                            folderSegments.every((seg, idx) =>
                                noteFolderSegs[idx]?.toLowerCase().includes(seg.toLowerCase())
                            ));
                    const matchByTitle =
                        !cleanNoteTitle || (f.title || '').toLowerCase().includes(cleanNoteTitle.toLowerCase());
                    return (
                        (matchBySegments && matchByTitle) ||
                        notePathString.toLowerCase().includes(cleanPath.toLowerCase())
                    );
                })
                .slice(0, 5)
                .map((f: any) => {
                    const noteFolderSegs = getFolderPathSegments(f.parent_id);
                    const displayPath = '/' + [...noteFolderSegs, f.title].join('/');
                    return {
                        id: f.id,
                        label: displayPath,
                        title: f.title,
                        type: 'note',
                        isGhost: false,
                    };
                });

            const displayCreateTitle = cleanNoteTitle || 'Untitled';
            const normalizedCreatePath = '/' + [...folderSegments, displayCreateTitle].join('/');
            const createItem: MentionSuggestionItem = {
                id: 'NEW_PATH_NOTE',
                label: `[+] Erstellen: ${normalizedCreatePath}`,
                title: displayCreateTitle,
                query: query,
                type: 'action',
                isGhost: false,
                pathSegments: folderSegments,
                cleanNoteTitle: displayCreateTitle,
            };

            return [...matchedPathNotes, createItem];
        }

        // 3. Search Matching
        const lowQuery = query.toLowerCase();
        let matched = filteredFiles.filter((f: any) => (f.title || f.id).toLowerCase().includes(lowQuery));
        
        // 4. Search Matching for Events
        const events = state.events || [];
        let matchedEvents = events.filter((e: any) => {
            if (!e || !e.title) return false;
            return e.title.toLowerCase().includes(lowQuery);
        });

        // 4.5 Search Matching for Tasks — all active (non-archived) tasks
        const tasks = state.tasks || [];
        const matchedTasks = tasks.filter((t: any) => {
            if (!t || !t.title) return false;
            if (t.isArchived) return false;
            return t.title.toLowerCase().includes(lowQuery);
        });

        const MONTHS_DE = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
        const formatTaskDate = (dateStr?: string) => {
            try {
                if (!dateStr) return '';
                let d: Date;
                if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
                    const [y, m, day] = dateStr.split('-').map(Number);
                    d = new Date(y, m - 1, day);
                } else {
                    d = new Date(dateStr);
                }
                if (isNaN(d.getTime())) return '';
                const shortDate = `${d.getDate()}. ${MONTHS_DE[d.getMonth()]}`;
                if (dateStr.includes('T') && !dateStr.endsWith('T00:00:00') && !dateStr.endsWith('T00:00:00.000Z')) {
                    return `${shortDate} ${format(d, 'HH:mm')}`;
                }
                return shortDate;
            } catch {
                return '';
            }
        };

        matchedTasks.sort((a: any, b: any) => {
            if (Boolean(a.isCompleted) !== Boolean(b.isCompleted)) {
                return a.isCompleted ? 1 : -1;
            }
            return 0;
        });

        const taskIdSet = new Set(tasks.map((t: any) => t.id));

        // Format event date helper
        const formatEventDate = (startIso: string, allDay?: boolean) => {
            try {
                if (!startIso) return '';
                const d = new Date(startIso);
                if (isNaN(d.getTime())) return '';
                if (allDay) {
                    return format(d, 'dd.MM.yyyy');
                }
                return format(d, 'dd.MM.yyyy HH:mm');
            } catch {
                return '';
            }
        };

        // Sort matchedEvents descending by start date
        matchedEvents.sort((a: any, b: any) => {
            const timeA = a.start ? new Date(a.start).getTime() : 0;
            const timeB = b.start ? new Date(b.start).getTime() : 0;
            return timeB - timeA;
        });

        // OPTIMIZATION: Filter empty queries (recent notes, upcoming/recent events)
        if (!lowQuery) {
            matched = matched
                .sort((a: any, b: any) => (new Date(b.updated_at).getTime() || 0) - (new Date(a.updated_at).getTime() || 0))
                .slice(0, 4);
            const now = Date.now();
            const upcomingOrRecent = matchedEvents.filter((e: any) => {
                const t = e.start ? new Date(e.start).getTime() : 0;
                return t >= now - 86400000;
            });
            if (upcomingOrRecent.length > 0) {
                upcomingOrRecent.sort((a: any, b: any) => {
                    const timeA = a.start ? new Date(a.start).getTime() : 0;
                    const timeB = b.start ? new Date(b.start).getTime() : 0;
                    return timeA - timeB;
                });
                matchedEvents = upcomingOrRecent;
            }
        }

        // Group events by title
        const groupsMap = new Map<string, EventItem[]>();
        for (const e of matchedEvents) {
            const title = (e.title || 'Untitled').trim();
            if (!groupsMap.has(title)) {
                groupsMap.set(title, []);
            }
            groupsMap.get(title)!.push({
                id: e.id,
                title,
                label: title,
                type: 'event',
                start: e.start,
                color: e.color || '#3b82f6',
                formattedDate: formatEventDate(e.start, e.all_day || e.allDay),
                isGhost: false,
            });
        }

        // Sort events inside each group chronologically (earliest first)
        for (const groupList of groupsMap.values()) {
            groupList.sort((a, b) => {
                const timeA = a.start ? new Date(a.start).getTime() : 0;
                const timeB = b.start ? new Date(b.start).getTime() : 0;
                return timeA - timeB;
            });
        }

        const formattedEventItems: (EventItem | EventGroupItem)[] = [];
        for (const [title, groupList] of groupsMap.entries()) {
            if (groupList.length > 1) {
                formattedEventItems.push({
                    id: 'group-' + title,
                    title,
                    label: title,
                    isGroup: true,
                    count: groupList.length,
                    events: groupList,
                    color: groupList[0].color || '#3b82f6',
                    type: 'event',
                });
            } else {
                formattedEventItems.push(groupList[0]);
            }
        }

        const activeFiles: Array<{ id: string; name: string; size?: number }> =
            (typeof window !== 'undefined' && (window as any).__tide_active_attachments) || [];
        const fileItems = activeFiles
            .filter(f => f.name.toLowerCase().includes(lowQuery))
            .slice(0, 5)
            .map(f => ({
                id: f.id,
                label: f.name,
                title: f.name,
                type: 'file',
                isGhost: false,
            }));

        const noteItems = matched
            .filter((f: any) => !taskIdSet.has(f.id))
            .slice(0, 5)
            .map((f: any) => ({ id: f.id, label: f.title || f.id, type: 'note', isGhost: false }));

        const eventItems = formattedEventItems.slice(0, 6);

        const taskItems = matchedTasks.slice(0, 3).map((t: any) => {
            const taskDate = t.dueDate || t.scheduledDate;
            return {
                id: t.id,
                title: t.title,
                label: t.title || t.id,
                type: 'task',
                isGhost: false,
                isCompleted: !!t.isCompleted,
                priority: t.priority,
                dueDate: taskDate,
                scheduledDate: t.scheduledDate,
                color: t.color,
                formattedDate: formatTaskDate(taskDate),
            };
        });

        // 5. Return formatted
        return [
            ...noteItems,
            ...fileItems,
            ...eventItems,
            ...taskItems,
            { id: 'NEW', label: `Create File '${query}'`, query: query, type: 'action', isGhost: false },
            { id: 'NEW_TASK', label: `Create Todo '${query}'`, query: query, type: 'action', isGhost: false }
        ].slice(0, 10);
    },

    command: ({ editor, range, props }: any) => {
        useLinkStore.getState().setIsLinkingMode(false);
        useLinkStore.getState().setPendingLinkSource(null);
        if ((window as any).cancelLinkSelection) (window as any).cancelLinkSelection();

        if (props.isGroup) {
            return;
        }

        if (props.type === 'file') {
            editor
                .chain()
                .focus()
                .deleteRange(range)
                .insertContent({
                    type: 'mention',
                    attrs: {
                        id: props.id,
                        label: props.label,
                        type: 'file',
                        isGhost: false,
                    },
                })
                .run();
            return;
        }
        if (props.isGhost || props.id === 'GHOST') {
            editor.chain().focus().deleteRange(range).insertContent({
                type: 'mention',
                attrs: { id: `ghost-${props.query || props.label}`, label: props.label, isGhost: true }
            }).run();
            return;
        } else if (props.id === 'NEW') {
            const label = props.label || props.query || 'Untitled';
            editor.chain().focus().deleteRange(range).insertContent({
                type: 'mention',
                attrs: { id: props.id, label: label, type: 'note', isGhost: false, safe: props.safe }
            }).run();
        } else if (props.id === 'NEW_PATH_NOTE') {
            const label = props.cleanNoteTitle || props.label || 'Untitled';
            editor.chain().focus().deleteRange(range).insertContent({
                type: 'mention',
                attrs: { id: props.id, label: label, type: 'note', isGhost: false }
            }).run();
        } else if (props.id === 'NEW_SAFE_NOTE') {
            const label = props.label || 'Untitled';
            editor.chain().focus().deleteRange(range).insertContent({
                type: 'mention',
                attrs: { id: props.id, label: label, type: 'note', isGhost: false, safe: props.safe }
            }).run();
        } else if (props.type === 'task' || props.id === 'NEW_TASK') {
            editor.chain().focus().deleteRange(range).insertContent({
                type: 'taskMention',
                attrs: {
                    id: props.id,
                    label: props.label || props.query || 'New Todo',
                    isCompleted: props.isCompleted,
                    priority: props.priority,
                    dueDate: props.dueDate,
                    color: props.color,
                }
            }).run();
        } else if (props.type === 'event') {
            editor.chain().focus().deleteRange(range).insertContent({
                type: 'mention',
                attrs: { 
                    id: props.id, 
                    label: props.title || props.label, 
                    isGhost: false,
                    type: 'event',
                    start: props.start 
                }
            }).run();
        } else {
            editor.chain().focus().deleteRange(range).insertContent({
                type: 'mention',
                attrs: { 
                    id: props.id, 
                    label: props.label, 
                    isGhost: false,
                    type: props.type === 'action' ? 'note' : (props.type || 'note'),
                    start: props.start,
                    safe: props.safe,
                }
            }).run();
        }
    },

    render: () => {
        let component: ReactRenderer | null = null;
        let popup: any | null = null;

        return {
            onStart: (props: any) => {
                const isQuicknote = typeof window !== 'undefined' && window.location.pathname.startsWith('/notes/');

                if (!isQuicknote) {
                    // 1. Fetch all metadata for comprehensive discovery (Task 3)
                    useDataStore.getState().loadAllMetadata().catch(console.error);

                    // 2. TRIGGER VISUAL MODE INSTANTLY (Task 4)
                    const startId = useDataStore.getState().activeNoteId;
                    useLinkStore.getState().setPendingLinkSource(startId);
                    useLinkStore.getState().setIsLinkingMode(true);

                    // Start Visual Highlight with SVG line support
                    const rect = props.clientRect?.();
                    if (rect && (window as any).startLinkSelection) {
                        (window as any).startLinkSelection((target: any) => {
                            // User clicked something in Sidebar or Calendar
                            props.editor.chain().focus().deleteRange(props.range).insertContent({
                                type: 'mention',
                                attrs: { 
                                    id: target.id, 
                                    label: target.title || target.label, 
                                    isGhost: false,
                                    type: target.type,
                                    start: target.start 
                                }
                            }).run();
                            useLinkStore.getState().setIsLinkingMode(false);
                        }, { x: rect.left, y: rect.top });
                    }
                }

                component = new ReactRenderer(MentionList, {
                    props,
                    editor: props.editor,
                });

                if (!props.clientRect) {
                    return;
                }

                popup = tippy('body', {
                    getReferenceClientRect: props.clientRect,
                    appendTo: () => document.body,
                    content: component.element,
                    showOnCreate: true,
                    interactive: true,
                    trigger: 'manual',
                    placement: 'bottom-start',
                    theme: 'headless',
                });
                
                if (props.items && props.items.length > 0) {
                    const topItem = props.items[0];
                    const label = topItem.label || topItem.title || '';
                    const q = props.query || '';
                    if (q && label.toLowerCase().startsWith(q.toLowerCase())) {
                        document.documentElement.style.setProperty('--suggestion-remainder', `"${label.slice(q.length)}"`);
                    } else {
                        document.documentElement.style.setProperty('--suggestion-remainder', '""');
                    }
                } else {
                    document.documentElement.style.setProperty('--suggestion-remainder', '""');
                }
            },

            onUpdate(props: any) {
                component?.updateProps(props);

                if (!props.clientRect) {
                    return;
                }

                popup?.[0]?.setProps({
                    getReferenceClientRect: props.clientRect,
                });
                
                if (props.items && props.items.length > 0) {
                    const topItem = props.items[0];
                    const label = topItem.label || topItem.title || '';
                    const q = props.query || '';
                    if (q && label.toLowerCase().startsWith(q.toLowerCase())) {
                        document.documentElement.style.setProperty('--suggestion-remainder', `"${label.slice(q.length)}"`);
                    } else {
                        document.documentElement.style.setProperty('--suggestion-remainder', '""');
                    }
                } else {
                    document.documentElement.style.setProperty('--suggestion-remainder', '""');
                }
            },

            onKeyDown(props: any) {
                if (props.event.key === 'Escape') {
                    if ((component?.ref as any)?.handleEscape?.()) {
                        return true;
                    }
                    useLinkStore.getState().setPendingLinkSource(null);
                    useLinkStore.getState().setIsLinkingMode(false);
                    if ((window as any).cancelLinkSelection) (window as any).cancelLinkSelection();
                    if (popup) popup[0].destroy();
                    popup = null;
                    // Ensure focus returns to the editor
                    props.editor?.commands?.focus?.();
                    return false;
                }

                const handled = (component?.ref as any)?.onKeyDown(props);
                if (handled === true && (props.event.key === 'Enter' || props.event.key === 'Tab')) {
                    if (popup) {
                        popup[0].destroy();
                        popup = null;
                    }
                }
                return !!handled;
            },

            onExit() {
                useLinkStore.getState().setPendingLinkSource(null);
                useLinkStore.getState().setIsLinkingMode(false);
                if ((window as any).cancelLinkSelection) (window as any).cancelLinkSelection();
                if (popup) {
                    popup[0].destroy();
                    popup = null;
                }
                component?.destroy();
                component = null;
                document.documentElement.style.setProperty('--suggestion-remainder', '""');
            },
        };
    },
};
