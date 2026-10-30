"use client";

import { useMemo, useEffect, useRef } from 'react';
import { useEditor, ReactNodeViewRenderer } from '@tiptap/react';
import { mergeAttributes } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { Bold as TiptapBold } from '@tiptap/extension-bold';
import { Strike as TiptapStrike } from '@tiptap/extension-strike';
import { Italic as TiptapItalic } from '@tiptap/extension-italic';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import { SlashCommand, slashCommandSuggestion } from '../extensions/SlashCommand';
import { TextStyle } from '@tiptap/extension-text-style';
import Color from '@tiptap/extension-color';
import Placeholder from '@tiptap/extension-placeholder';
import { Highlight } from '../extensions/Highlight';
import { FontSize } from '../extensions/FontSize';
import Mention from '@tiptap/extension-mention';
import mentionSuggestion from '../extensions/mentionSuggestion';
import { InlineCommentNode } from '../extensions/InlineCommentNode';
import { MathBlock, InlineMath } from '../extensions/MathBlock';
import { BlockId } from '../extensions/BlockId';
import { Anchor } from '../extensions/Anchor';
import { ResizableImage } from '../extensions/ResizableImage';
import { DateMentionExtension } from '../extensions/DateMentionExtension';
import { TaskMentionExtension } from '../extensions/TaskMentionExtension';
import { CalendarEventMentionExtension } from '../extensions/CalendarEventMentionExtension';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableHeader } from '@tiptap/extension-table-header';
import { TableCell } from '@tiptap/extension-table-cell';
import { ReferenceMark } from '../extensions/ReferenceMark';
import { ReferenceScannerMode, ReferenceAutopilotMode } from '../extensions/ReferenceModes';
import { PencilInkExtension, InkStroke, getEditorInkStrokes } from '../extensions/PencilInkExtension';
import Collaboration from '@tiptap/extension-collaboration';
import CollaborationCaret from '@tiptap/extension-collaboration-caret';
import * as Y from 'yjs';
import type { WebsocketProvider } from 'y-websocket';
import { useDataStore } from '@/store/useDataStore';
import { useReferenceStore } from '@/store/useReferenceStore';
import { useActiveNoteStore } from '@/store/activeNoteStore';
import { encryptAssetWithNewBEK } from '@/lib/assetCrypto';
import { apiFetch } from '@/lib/api';
import type { LinkTarget, UseTipTapConfigOptions } from './types';
import { MentionNodeView } from './MentionNodeView';
import { PLACELHODER_QUOTES, COLORS } from './editorConstants';
import { isDocEmpty, getCleanDocContent, uint8ArrayToBase64 } from './editorUtils';

export { isDocEmpty, getCleanDocContent, PLACELHODER_QUOTES };

function isFragmentEmpty(fragment: Y.XmlFragment): boolean {
    if (fragment.length === 0) return true;
    const str = fragment.length === 1 ? (fragment.get(0)?.toString() || '') : '';
    return str.startsWith('<paragraph') && str.endsWith('></paragraph>');
}

function copyFragment(src: Y.XmlFragment, dest: Y.XmlFragment, ydoc: Y.Doc) {
    ydoc.transact(() => {
        while (dest.length > 0) dest.delete(0, 1);
        const children: any[] = [];
        for (let i = 0; i < src.length; i++) children.push(src.get(i).clone());
        dest.insert(0, children);
    });
}

async function handleEncryptedImagePaste(
    file: File,
    noteId: string,
    view: any,
    ydoc?: Y.Doc | null
) {
    try {
        const { encryptedBlob, bekBase64, ivBase64, mimeType } = await encryptAssetWithNewBEK(file);
        const assetId = crypto.randomUUID();

        let uploaded = false;
        try {
            const res = await apiFetch(`/api/files/${encodeURIComponent(noteId)}/attachments?parent_file_id=${encodeURIComponent(noteId)}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/octet-stream',
                    'X-Asset-ID': assetId,
                    'X-Mime-Type': mimeType,
                },
                body: encryptedBlob,
            });
            if (res.ok) uploaded = true;
        } catch (_) {}

        if (!uploaded) {
            try {
                const res = await apiFetch(`/api/v1/files/${encodeURIComponent(noteId)}/attachments?parent_file_id=${encodeURIComponent(noteId)}`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/octet-stream',
                        'X-Asset-ID': assetId,
                        'X-Mime-Type': mimeType,
                    },
                    body: encryptedBlob,
                });
                if (res.ok) uploaded = true;
            } catch (_) {}
        }

        const effectiveDoc = ydoc || useActiveNoteStore.getState().activeYDoc;
        if (effectiveDoc) {
            const assetsMap = effectiveDoc.getMap<any>('assets');
            assetsMap.set(assetId, {
                assetId,
                bekBase64,
                ivBase64,
                mimeType,
            });
        }

        const objectUrl = URL.createObjectURL(file);
        const { state } = view;
        const imageType = state.schema.nodes.image;
        if (imageType) {
            const node = imageType.create({
                src: objectUrl,
                alt: file.name || 'Pasted image',
                width: 300,
            });
            const tr = state.tr.insert(state.selection.from, node);
            view.dispatch(tr);
        }
    } catch (err) {
        console.error('[Editor] Encrypted image paste failed:', err);
    }
}

export interface UseTipTapConfigProps extends UseTipTapConfigOptions {
    isSynced?: boolean;
    setInkStrokes?: (strokes: InkStroke[]) => void;
    userHasTypedRef?: React.MutableRefObject<boolean>;
    contentInitialized?: React.MutableRefObject<boolean>;
}

export function useTipTapConfig({
    initialContent, editable = true, isShared = false, provider, ydoc, isSynced = false,
    activeTabId, onBlocksDeleted, onChange, onLinkClick, onEventClick, setInkStrokes,
    userHasTypedRef: externalUserHasTypedRef, contentInitialized: externalContentInitialized,
    userProfile, myId,
}: UseTipTapConfigProps) {
    const internalUserHasTyped = useRef(false);
    const internalContentInit = useRef(false);
    const userHasTyped = externalUserHasTypedRef || internalUserHasTyped;
    const contentInit = externalContentInitialized || internalContentInit;

    const enabledExtensions = useDataStore((s) => s.enabledExtensions);
    const cleanInitial = useMemo(() => getCleanDocContent(initialContent), [initialContent]);
    const initialContentRef = useRef(initialContent); initialContentRef.current = initialContent;
    const activeTabIdRef = useRef(activeTabId); activeTabIdRef.current = activeTabId;
    const onChangeRef = useRef(onChange); onChangeRef.current = onChange;
    const onLinkClickRef = useRef(onLinkClick); onLinkClickRef.current = onLinkClick;
    const onEventClickRef = useRef(onEventClick); onEventClickRef.current = onEventClick;
    const onBlocksDeletedRef = useRef(onBlocksDeleted); onBlocksDeletedRef.current = onBlocksDeleted;
    const referencePreviewTimerRef = useRef<NodeJS.Timeout | null>(null);

    // BUG-13: Reactive userProfile awareness sync
    useEffect(() => {
        if (!provider?.awareness) return;
        const userId = myId || useDataStore.getState().myId || 'anonymous';
        const hash = Array.from(userId).reduce((acc: number, char: string) => acc + char.charCodeAt(0), 0);
        const color = COLORS[hash % COLORS.length] || '#3b82f6';

        provider.awareness.setLocalStateField('user', {
            id: userId,
            name: userProfile?.username || userProfile?.name || 'User',
            color: userProfile?.color || color,
            seed: userProfile?.avatar_seed || userId,
        });
    }, [provider, userProfile, myId]);

    const extensions = useMemo(() => {
        const base = [
            StarterKit.configure({ italic: false, bold: false, strike: false, undoRedo: (provider && ydoc) ? false : undefined }),
            TaskList.configure({ HTMLAttributes: { class: 'not-prose pl-0' } }), TaskItem.configure({ nested: true }),
            SlashCommand.configure({ suggestion: slashCommandSuggestion }),
            TiptapItalic.extend({ addInputRules: () => [], addPasteRules: () => [] }).configure({ HTMLAttributes: { class: 'italic' } }),
            TiptapBold.extend({ addInputRules: () => [], addPasteRules: () => [] }).configure({ HTMLAttributes: { class: 'font-bold' } }),
            TiptapStrike.extend({ addInputRules: () => [], addPasteRules: () => [] }).configure({ HTMLAttributes: { class: 'line-through' } }),
            TextStyle, Color, Highlight.configure({ multicolor: true }), FontSize,
            Mention.extend({
                addAttributes: () => ({
                    id: { default: null, parseHTML: el => el.getAttribute('data-id') },
                    label: { default: null, parseHTML: el => el.getAttribute('data-label') || el.innerText.replace(/^@/, '') },
                    isGhost: { default: false, parseHTML: el => el.getAttribute('data-is-ghost') === 'true' },
                    type: { default: 'note', parseHTML: el => el.getAttribute('data-type-link') || 'note' },
                    start: { default: null, parseHTML: el => el.getAttribute('data-start') }
                }),
                parseHTML: () => [{ tag: 'mark[data-type="mention"]' }, { tag: 'mark.mention' }, { tag: 'span[data-type="mention"]' }],
                renderHTML: ({ node, HTMLAttributes }) => {
                    const id = node.attrs.id || '';
                    const isGhost = node.attrs.isGhost === true || node.attrs.isGhost === 'true' || String(id).startsWith('ghost-');
                    const colorClass = isGhost ? 'bg-gray-100 dark:bg-slate-700 text-gray-500 dark:text-slate-400' : (node.attrs.type === 'event' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700');
                    return ['mark', mergeAttributes(HTMLAttributes, { 'data-type': 'mention', 'data-id': id, 'data-label': node.attrs.label || 'Unknown', 'data-is-ghost': String(isGhost), 'data-type-link': node.attrs.type || 'note', 'data-start': node.attrs.start, class: `px-1.5 py-0.5 rounded-md font-medium cursor-pointer mention transition-colors ${colorClass}` }), `@${node.attrs.label || 'Unknown'}`];
                },
                addNodeView: () => ReactNodeViewRenderer(MentionNodeView)
            }).configure({ suggestion: { ...mentionSuggestion, allowSpaces: true } }),
            InlineCommentNode, MathBlock, InlineMath,
            BlockId.configure({ onBlocksDeleted: (ids) => onBlocksDeletedRef.current?.(ids) }),
            Anchor, DateMentionExtension, TaskMentionExtension, CalendarEventMentionExtension, ResizableImage,
            Table.configure({ resizable: true, renderWrapper: true }), TableRow, TableHeader, TableCell,
            Placeholder.configure({ placeholder: () => PLACELHODER_QUOTES[Math.floor(Math.random() * PLACELHODER_QUOTES.length)] }),
            ReferenceMark, PencilInkExtension,
        ];

        // Universal collaboration: remove isShared gate
        if (provider && ydoc) {
            base.push(Collaboration.configure({ document: ydoc, field: 'prosemirror' }), CollaborationCaret.configure({
                provider, user: provider.awareness?.getLocalState()?.user || { id: 'guest', name: 'Guest', color: '#ffcc00', seed: 'guest' },
            }));
        }
        if (enabledExtensions.includes('references')) base.push(ReferenceScannerMode, ReferenceAutopilotMode);
        return base;
    }, [enabledExtensions, provider, ydoc]);

    const updateReferencePreviews = (editorInstance: any, activeId: string) => {
        const store = useReferenceStore.getState();
        const myRefs = store.references.filter(r => r.sourceNoteId === activeId);
        if (myRefs.length === 0) return;
        let changed = false;
        const newRefs = [...store.references], blocks: string[] = [];
        editorInstance.state.doc.forEach((n: any) => { if (n.textContent.trim()) blocks.push(n.textContent.trim()); });
        newRefs.forEach((r, idx) => {
            if (r.sourceNoteId !== activeId) return;
            for (let i = 0; i < blocks.length; i++) {
                if (blocks[i].includes(r.term)) {
                    let nextBlock = blocks[i];
                    for (let j = i + 1; j < blocks.length; j++) { if (blocks[j]) { nextBlock = blocks[j]; break; } }
                    if (newRefs[idx].previewText !== nextBlock && nextBlock) { newRefs[idx] = { ...r, previewText: nextBlock }; changed = true; }
                    break;
                }
            }
        });
        editorInstance.state.doc.nodesBetween(0, editorInstance.state.doc.content.size, (node: any) => {
            if (node.isText && node.marks) {
                for (const m of node.marks) {
                    if (m.type.name === 'reference' && m.attrs.referenceId) {
                        const refIdx = newRefs.findIndex(item => item.id === m.attrs.referenceId);
                        if (refIdx !== -1) {
                            const cur = newRefs[refIdx], c = m.attrs.color || undefined, em = m.attrs.emoji || undefined;
                            if ((c && c !== cur.color) || (em && em !== cur.emoji)) {
                                newRefs[refIdx] = { ...cur, ...(c ? { color: c } : {}), ...(em ? { emoji: em } : {}) };
                                changed = true;
                            }
                        }
                    }
                }
            }
        });
        if (changed) store.setReferences(newRefs);
    };

    const livePermission = useActiveNoteStore((s) => s.permission);
    const canEdit = editable && livePermission !== 'view';

    const editor = useEditor({
        extensions,
        content: (provider && ydoc) ? undefined : ((cleanInitial && !isDocEmpty(cleanInitial)) ? cleanInitial : undefined),
        editable: canEdit,
        immediatelyRender: false,
        onUpdate: ({ editor, transaction }) => {
            if (!transaction.docChanged || !contentInit.current) return;
            if (setInkStrokes) setInkStrokes(getEditorInkStrokes(editor));
            const content = editor.getJSON();
            if (isDocEmpty(content) && !isDocEmpty(initialContentRef.current) && !userHasTyped.current) return;

            if (onChangeRef.current) {
                if (provider && ydoc) {
                    onChangeRef.current(content, uint8ArrayToBase64(new Uint8Array(Y.encodeStateAsUpdate(ydoc))));
                } else onChangeRef.current(content);
            }

            if (enabledExtensions.includes('references')) {
                if (referencePreviewTimerRef.current) clearTimeout(referencePreviewTimerRef.current);
                referencePreviewTimerRef.current = setTimeout(() => {
                    if (activeTabIdRef.current) updateReferencePreviews(editor, activeTabIdRef.current);
                }, 2000);
            }

            // Zero-Knowledge / Datenschutz: Unverschlüsseltes Caching im LocalStorage ist untersagt.
            // Persistenz und Autosave laufen verschlüsselt über useDataStore und die Synchronisations-Pipeline.
        },
        onSelectionUpdate: ({ editor }) => {
            const activeId = activeTabIdRef.current;
            if (activeId && !activeId.startsWith('chat-') && activeId !== 'calendar') {
                const { from, to } = editor.state.selection;
                useDataStore.getState().setNoteCaretPosition(activeId, { from, to });
            }
        },
        editorProps: {
            handleKeyDown: () => { userHasTyped.current = true; return false; },
            handleTextInput: () => { userHasTyped.current = true; return false; },
            attributes: {
                class: 'prose max-w-none w-full max-w-full focus:outline-none min-h-[500px] pb-32 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6 [&_li]:mt-1 [&_ul[data-type="taskList"]]:list-none [&_ul[data-type="taskList"]]:pl-0 [&_li[data-type="taskItem"]]:flex [&_li[data-type="taskItem"]]:items-start [&_li[data-type="taskItem"]>label]:mr-2 [&_li[data-type="taskItem"]>label]:mt-1 [&_li[data-type="taskItem"]>div]:mt-[2px] [&_.tableWrapper]:overflow-x-auto [&_.tableWrapper]:max-w-full [&_.tableWrapper]:w-full [&_.tableWrapper]:my-4 [&_.tableWrapper]:overscroll-x-contain [&_table]:border-collapse [&_table]:table-fixed [&_table]:w-full [&_table]:my-4 [&_.tableWrapper_table]:my-0 [&_td]:border [&_td]:border-gray-300 dark:[&_td]:border-slate-600 [&_td]:p-2 [&_td]:relative [&_td]:min-w-[100px] [&_td]:break-words [&_th]:border [&_th]:border-gray-300 dark:[&_th]:border-slate-600 [&_th]:p-2 [&_th]:bg-gray-50 dark:[&_th]:bg-slate-800/50 [&_th]:relative [&_th]:min-w-[100px] [&_th]:font-semibold [&_th]:break-words [&_.column-resize-handle]:absolute [&_.column-resize-handle]:-right-1.5 [&_.column-resize-handle]:top-0 [&_.column-resize-handle]:bottom-[calc(-1px)] [&_.column-resize-handle]:w-3 [&_.column-resize-handle]:bg-blue-500/20 [&_.column-resize-handle]:cursor-col-resize hover:[&_.column-resize-handle]:bg-blue-500',
            },
            handleClick: (view, pos, event) => {
                const target = event.target as HTMLElement;
                const refMark = target.closest('[data-reference-id]');
                const refId = refMark?.getAttribute('data-reference-id');
                const ref = refId ? useReferenceStore.getState().references.find(r => r.id === refId) : null;
                if (ref?.sourceNoteId) {
                    event.preventDefault();
                    onLinkClickRef.current?.({ id: ref.sourceNoteId, type: 'file', title: ref.term });
                    useDataStore.getState().setActiveNoteId(ref.sourceNoteId);
                    window.dispatchEvent(new CustomEvent('tide:navigate', { detail: { noteId: ref.sourceNoteId } }));
                    window.dispatchEvent(new CustomEvent('tide:navigate-note', { detail: { noteId: ref.sourceNoteId } }));
                    return true;
                }
                const mentionNode = target.closest('.mention') || target.closest('[data-type="mention"]');
                if (mentionNode) {
                    event.preventDefault();
                    const targetId = mentionNode.getAttribute('data-id');
                    const isEvent = mentionNode.getAttribute('data-type-link') === 'event' || !!useDataStore.getState().events?.find((e: any) => e.id === targetId);
                    const ev = useDataStore.getState().events?.find((e: any) => e.id === targetId);
                    const eventStart = ev?.start || mentionNode.getAttribute('data-start');
                    if (targetId && isEvent) {
                        onEventClickRef.current?.(targetId);
                        window.dispatchEvent(new CustomEvent('calendar:scroll-to', { detail: { id: targetId, start: eventStart } }));
                        window.dispatchEvent(new CustomEvent('tide:select-event', { detail: { id: targetId, start: eventStart } }));
                        return true;
                    }
                    if (targetId) {
                        const realFile = useDataStore.getState().notes?.find((f: any) => f.id === targetId);
                        if (!realFile) return true;
                        onLinkClickRef.current?.({ id: targetId, type: 'file', title: realFile.title || mentionNode.textContent?.replace(/^@/, '') || '' });
                        useDataStore.getState().setActiveNoteId(targetId);
                        return true;
                    }
                }
                const linkHref = target.closest('a')?.getAttribute('href');
                if (linkHref) {
                    event.preventDefault();
                    window.open(linkHref, '_blank', 'noopener,noreferrer');
                    return true;
                }
                return false;
            },
            handleDrop: (view, event, slice, moved) => {
                const calEventData = event.dataTransfer?.getData('tide/calendar-event');
                if (calEventData) {
                    try {
                        const evData = JSON.parse(calEventData);
                        const coords = view.posAtCoords({ left: event.clientX, top: event.clientY });
                        view.dispatch(view.state.tr.insert(coords ? coords.pos : view.state.doc.content.size, view.state.schema.nodes.calendarEvent.create({ eventId: evData.id })));
                        event.preventDefault(); return true;
                    } catch (e) { console.warn('[CalendarEventDrop] Failed to parse event data', e); }
                }
                const collectorText = event.dataTransfer?.getData('tide/collector-text');
                if (collectorText) {
                    try {
                        const coords = view.posAtCoords({ left: event.clientX, top: event.clientY });
                        view.dispatch(view.state.tr.insert(coords ? coords.pos : view.state.doc.content.size, view.state.schema.text(collectorText)));
                        event.preventDefault(); return true;
                    } catch (e) { console.warn('[TextCollectorDrop] Failed to insert text', e); }
                }
                return (!moved && !!event.dataTransfer?.files?.length);
            },
            handleDOMEvents: {
                dragover: (view, event) => {
                    const e = event as DragEvent;
                    if (e.dataTransfer?.types.includes('tide/calendar-event') || e.dataTransfer?.types.includes('tide/collector-text')) {
                        e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; return true;
                    }
                    return false;
                }
            },
            handlePaste: (view, event) => {
                const items = Array.from(event.clipboardData?.items || []);
                const imageItem = items.find(item => item.type.startsWith('image/'));
                const files = Array.from(event.clipboardData?.files || []);
                const imageFile = imageItem ? imageItem.getAsFile() : files.find(f => f.type.startsWith('image/'));

                if (imageFile) {
                    event.preventDefault();
                    userHasTyped.current = true;
                    const noteId = activeTabIdRef.current;
                    if (noteId) {
                        void handleEncryptedImagePaste(imageFile, noteId, view, ydoc);
                    }
                    return true;
                }

                return files.length > 0;
            }
        }
    }, [provider, ydoc, editable]);

    useEffect(() => {
        if (!editor || editor.isDestroyed) return;
        if (editor.isEditable !== canEdit) {
            editor.setEditable(canEdit);
        }
    }, [editor, canEdit]);

    const prevProviderRef = useRef(provider);
    useEffect(() => {
        if (prevProviderRef.current !== provider) {
            prevProviderRef.current = provider;
            if (provider) {
                contentInit.current = false;
            }
        }
    }, [provider, contentInit]);

    const loadIntoYjsFragment = (docJson: any) => {
        if (!ydoc || !editor) return;
        const activeFragment = ydoc.getXmlFragment('prosemirror');
        try {
            const { prosemirrorToYXmlFragment } = require('@tiptap/y-tiptap');
            const doc = editor.schema.nodeFromJSON(docJson);
            // BUG-10 FIX: NEVER mutate client ID to a static value!
            prosemirrorToYXmlFragment(doc, activeFragment);
        } catch {
            if (!provider) {
                editor.commands.setContent(docJson, { emitUpdate: false });
            }
        }
    };

    useEffect(() => {
        if (!editor || !ydoc) return;
        if (contentInit.current) return;

        const active = ydoc.getXmlFragment('prosemirror');
        // If Yjs already has content, mark initialized and NEVER call setContent(initialContent)
        if (!isFragmentEmpty(active)) {
            contentInit.current = true;
            return;
        }

        const def = ydoc.getXmlFragment('default');
        if (!isFragmentEmpty(def)) {
            copyFragment(def, active, ydoc);
            contentInit.current = true;
            return;
        }

        if (provider) {
            // BUG-09: Wait for Yjs sync before seeding. NEVER call setContent after sync!
            if (isSynced) {
                if (isFragmentEmpty(active)) {
                    const seed = cleanInitial || initialContentRef.current;
                    if (seed && !isDocEmpty(seed)) {
                        loadIntoYjsFragment(seed);
                    }
                }
                contentInit.current = true;
            }
        } else {
            const seed = cleanInitial || initialContentRef.current;
            if (seed && !isDocEmpty(seed)) {
                loadIntoYjsFragment(seed);
            }
            contentInit.current = true;
        }
    }, [editor, cleanInitial, provider, isSynced, ydoc]);

    useEffect(() => {
        if (!editor || editor.isDestroyed || !cleanInitial || isDocEmpty(cleanInitial)) return;
        // Non-collaboration fallback only. NEVER overwrite collaborative document with setContent!
        if (!ydoc && isDocEmpty(editor.getJSON())) {
            editor.commands.setContent(cleanInitial, { emitUpdate: false });
            contentInit.current = true;
        }
    }, [editor, cleanInitial, ydoc]);

    return { editor, cleanInitial, userHasTypedRef: userHasTyped, contentInitialized: contentInit };
}
export default useTipTapConfig;
