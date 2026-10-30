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
import { isDocEmpty, getCleanDocContent } from './editorUtils';

export { isDocEmpty, getCleanDocContent, PLACELHODER_QUOTES };

function isFragmentEmpty(fragment: Y.XmlFragment): boolean {
    if (!fragment || fragment.length === 0) return true;
    if (fragment.length > 1) return false;
    const firstNode = fragment.get(0) as any;
    if (!firstNode) return true;

    // Check if it's XmlText
    if (firstNode instanceof Y.XmlText) {
        return firstNode.toString().trim() === '';
    }

    // In Yjs, XmlElement has nodeName. If it's not a paragraph, it is non-empty content
    const nodeName = firstNode.nodeName || (firstNode instanceof Y.XmlElement ? firstNode.nodeName : null);
    if (nodeName && nodeName !== 'paragraph') {
        return false;
    }

    // If it's an XmlElement
    if (typeof firstNode.length === 'number') {
        if (firstNode.length === 0) {
            if (typeof firstNode.toString === 'function') {
                const str = firstNode.toString().trim();
                return str === '' || str === '<paragraph></paragraph>' || /^<paragraph[^>]*>\s*<\/paragraph>$/.test(str);
            }
            return true;
        }
        if (firstNode.length === 1) {
            const child = firstNode.get ? firstNode.get(0) : null;
            if (child && typeof child.toString === 'function') {
                return child.toString().trim() === '';
            }
        }
        // More than 1 child means it has non-empty text/nodes
        return false;
    }

    const str = typeof firstNode.toString === 'function' ? firstNode.toString().trim() : '';
    return str === '' || str === '<paragraph></paragraph>' || /^<paragraph[^>]*>\s*<\/paragraph>$/.test(str);
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
    }, [provider, userProfile?.username, userProfile?.avatar_seed, myId]);

    const extensions = useMemo(() => {
        const base = [
            StarterKit.configure({ italic: false, bold: false, strike: false, undoRedo: (provider && ydoc && isSynced) ? false : undefined }),
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

        // Universal collaboration: only register when provider, ydoc AND isSynced
        if (provider && ydoc && isSynced) {
            base.push(Collaboration.configure({ document: ydoc, field: 'prosemirror' }), CollaborationCaret.configure({
                provider,
                user: provider.awareness?.getLocalState()?.user || { id: 'guest', name: 'Guest', color: '#ffcc00', seed: 'guest' },
                render: (user: Record<string, any>) => {
                    const cursor = document.createElement('span');
                    cursor.classList.add('collaboration-carets__caret');
                    cursor.setAttribute('style', `border-color: ${user.color || '#a855f7'}; pointer-events: none !important; user-select: none !important; -webkit-user-select: none !important;`);

                    const label = document.createElement('div');
                    label.classList.add('collaboration-carets__label');
                    label.setAttribute('style', `background-color: ${user.color || '#a855f7'}; display: inline-flex; align-items: center; gap: 4px; padding: 2px 6px; border-radius: 4px; font-size: 11px; font-weight: 500; color: white; white-space: nowrap; line-height: 1; pointer-events: none; user-select: none;`);

                    const seed = user.seed || user.id || 'guest';
                    const avatarSrc = user.avatar || `https://api.dicebear.com/7.x/notionists/svg?seed=${encodeURIComponent(seed)}&backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5dc,ffdfbf`;

                    const img = document.createElement('img');
                    img.src = avatarSrc;
                    img.alt = user.name || 'User';
                    img.style.cssText = 'width: 13px; height: 13px; border-radius: 50%; object-fit: cover; flex-shrink: 0;';
                    label.appendChild(img);

                    const nameSpan = document.createElement('span');
                    nameSpan.textContent = user.name || 'User';
                    label.appendChild(nameSpan);

                    cursor.appendChild(label);
                    return cursor;
                },
            }));
        }
        if (enabledExtensions.includes('references')) base.push(ReferenceScannerMode, ReferenceAutopilotMode);
        return base;
    }, [enabledExtensions, provider, ydoc, isSynced]);

    const updateReferencePreviews = (editorInstance: any, activeId: string) => {
        if (!editorInstance || editorInstance.isDestroyed) return;
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
        content: ydoc ? undefined : ((cleanInitial && !isDocEmpty(cleanInitial)) ? cleanInitial : undefined),
        editable: canEdit,
        immediatelyRender: false,
        onUpdate: ({ editor, transaction }) => {
            if (!editor || editor.isDestroyed || !transaction.docChanged || !contentInit.current) return;
            if (setInkStrokes) setInkStrokes(getEditorInkStrokes(editor));
            const content = editor.getJSON();
            if (isDocEmpty(content) && !isDocEmpty(initialContentRef.current) && !userHasTyped.current) return;

            if (onChangeRef.current) {
                onChangeRef.current(content);
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
            if (!editor || editor.isDestroyed) return;
            const activeId = activeTabIdRef.current;
            if (activeId && !activeId.startsWith('chat-') && activeId !== 'calendar') {
                try {
                    const { from, to } = editor.state.selection;
                    useDataStore.getState().setNoteCaretPosition(activeId, { from, to });
                } catch (_) {}
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
    }, [provider, ydoc, editable, isSynced]);

    useEffect(() => {
        if (!editor || editor.isDestroyed) return;
        try {
            if (editor.isEditable !== canEdit) {
                editor.setEditable(canEdit);
            }
        } catch (_) {}
    }, [editor, canEdit]);

    const hasReceivedRemoteUpdatesRef = useRef(false);
    useEffect(() => {
        if (!ydoc) return;
        hasReceivedRemoteUpdatesRef.current = false;
        const onDocUpdate = (_update: Uint8Array, origin: any) => {
            if (origin === 'remote' || origin === 'server') {
                hasReceivedRemoteUpdatesRef.current = true;
            }
        };
        ydoc.on('update', onDocUpdate);
        return () => {
            ydoc.off('update', onDocUpdate);
        };
    }, [ydoc]);

    const prevProviderRef = useRef(provider);
    useEffect(() => {
        if (prevProviderRef.current !== provider) {
            prevProviderRef.current = provider;
            if (provider) {
                const active = ydoc?.getXmlFragment('prosemirror');
                if (active && !isFragmentEmpty(active)) {
                    contentInit.current = true;
                } else {
                    contentInit.current = false;
                }
            }
        }
    }, [provider, ydoc, contentInit]);

    const loadIntoYjsFragment = (docJson: any) => {
        if (!ydoc || !editor || editor.isDestroyed) return;
        const fragment = ydoc.getXmlFragment('prosemirror');
        // If provider is present AND ydoc already has content from server snapshot/WAL, server is authority.
        if (provider && fragment.length > 0) return;

        try {
            const { prosemirrorToYXmlFragment } = require('@tiptap/y-tiptap');
            const doc = editor.schema.nodeFromJSON(docJson);
            ydoc.transact(() => {
                while (fragment.length > 0) {
                    fragment.delete(0, 1);
                }
                prosemirrorToYXmlFragment(doc, fragment);
            }, 'initial-seed');
        } catch {
            if (!editor.isDestroyed) {
                try {
                    editor.commands.setContent(docJson, { emitUpdate: false });
                } catch (_) {}
            }
        }
    };

    useEffect(() => {
        if (!editor || editor.isDestroyed || !ydoc) return;
        if (contentInit.current) return;

        if (provider) {
            // Wait until isSynced === true
            if (!isSynced) return;

            const fragment = ydoc.getXmlFragment('prosemirror');
            if (fragment && fragment.length === 0) {
                // Server had NO CRDT snapshot/WAL (solo/legacy/REST note).
                if (cleanInitial && !isDocEmpty(cleanInitial)) {
                    loadIntoYjsFragment(cleanInitial);
                }
                contentInit.current = true;
            } else if (fragment && fragment.length > 0) {
                // Server already had CRDT state.
                contentInit.current = true;
            }
        } else {
            // Non-collaborative fallback (e.g. chat, calendar, offline/solo mode without provider)
            // If collaboration is expected for this tab, wait for provider rather than seeding prematurely!
            const isCollabExpected = Boolean(
                activeTabId &&
                !activeTabId.startsWith('chat-') &&
                !activeTabId.startsWith('profile:') &&
                !['calendar', 'messages', 'social', 'ext_finance'].includes(activeTabId)
            );
            if (!isCollabExpected) {
                const seed = cleanInitial || initialContentRef.current;
                if (seed && !isDocEmpty(seed)) {
                    loadIntoYjsFragment(seed);
                }
                contentInit.current = true;
            }
        }
    }, [editor, cleanInitial, provider, isSynced, ydoc, activeTabId]);

    useEffect(() => {
        if (!editor || editor.isDestroyed || !cleanInitial || isDocEmpty(cleanInitial)) return;
        // Non-collaboration fallback only. NEVER overwrite collaborative document with setContent!
        try {
            if (!ydoc && isDocEmpty(editor.getJSON())) {
                editor.commands.setContent(cleanInitial, { emitUpdate: false });
                contentInit.current = true;
            }
        } catch (_) {}
    }, [editor, cleanInitial, ydoc]);

    return { editor, cleanInitial, userHasTypedRef: userHasTyped, contentInitialized: contentInit };
}
export default useTipTapConfig;
