import { useDataStore, DataItem, TaskItem } from '@/store/useDataStore';
import { apiFetch } from '@/lib/api';
import { encryptFileV2 } from '@/lib/cryptoV2';
import { encryptMetadata } from '@/lib/crypto';

export interface TideBundleItem {
    id: string; // The relative or reference ID inside the bundle
    type: 'note' | 'event' | 'folder' | 'task';
    title: string;
    parent_id?: string | null;
    content?: any; // TipTap ProseMirror JSON or text
    event_meta?: {
        start: string;
        end: string;
        allDay?: boolean;
        color?: string;
        location?: string;
        description?: string;
    };
    task_meta?: {
        description?: string;
        color?: string;
        isCompleted?: boolean;
        scheduledDate?: string;
    };
    metadata?: Record<string, any>;
}

export interface TideBundle {
    version: number;
    bundle_id?: string;
    title: string;
    description?: string;
    created_at?: string;
    author?: string;
    items: TideBundleItem[];
}

export interface ImportResult {
    success: boolean;
    notesCount: number;
    eventsCount: number;
    foldersCount: number;
    tasksCount: number;
    idMap: Record<string, string>;
    importedNoteIds: string[];
    error?: string;
}

/**
 * Traverses a TipTap document AST and updates all internal references (event mentions,
 * task mentions, note backlink marks, and links) according to the provided idMap.
 */
export function rewriteTipTapReferences(node: any, idMap: Map<string, string>): any {
    if (!node || typeof node !== 'object') return node;

    // Clone to prevent mutating input
    const cloned = Array.isArray(node) ? [...node] : { ...node };

    // 1. Rewrite node attributes
    if (cloned.attrs) {
        cloned.attrs = { ...cloned.attrs };
        
        // Calendar Event Mention
        if (cloned.type === 'calendarEventMention' && cloned.attrs.eventId) {
            const mappedEventId = idMap.get(cloned.attrs.eventId);
            if (mappedEventId) {
                cloned.attrs.eventId = mappedEventId;
            }
        }

        // Task Mention
        if (cloned.type === 'taskMention' && cloned.attrs.taskId) {
            const mappedTaskId = idMap.get(cloned.attrs.taskId);
            if (mappedTaskId) {
                cloned.attrs.taskId = mappedTaskId;
            }
        }

        // Generic linkedNoteId
        if (cloned.attrs.linkedNoteId && idMap.has(cloned.attrs.linkedNoteId)) {
            cloned.attrs.linkedNoteId = idMap.get(cloned.attrs.linkedNoteId);
        }
    }

    // 2. Rewrite marks (ReferenceMarks, Links)
    if (Array.isArray(cloned.marks)) {
        cloned.marks = cloned.marks.map((mark: any) => {
            if (!mark || typeof mark !== 'object') return mark;
            const clonedMark = { ...mark, attrs: { ...(mark.attrs || {}) } };

            // Backlink / Reference Mark
            if (clonedMark.type === 'referenceMark' && clonedMark.attrs.targetId) {
                const mappedTargetId = idMap.get(clonedMark.attrs.targetId);
                if (mappedTargetId) {
                    clonedMark.attrs.targetId = mappedTargetId;
                }
            }

            // Generic link containing an old ID
            if (clonedMark.type === 'link' && typeof clonedMark.attrs.href === 'string') {
                let href = clonedMark.attrs.href;
                for (const [oldId, newId] of idMap.entries()) {
                    if (href.includes(oldId)) {
                        href = href.replaceAll(oldId, newId);
                    }
                }
                clonedMark.attrs.href = href;
            }

            return clonedMark;
        });
    }

    // 3. Recurse down children
    if (Array.isArray(cloned.content)) {
        cloned.content = cloned.content.map((child: any) => rewriteTipTapReferences(child, idMap));
    }

    return cloned;
}

/**
 * Imports a TIDE bundle, generating fresh collision-free IDs and automatically
 * rewriting all internal inter-document and calendar-event references.
 */
export async function importTideBundle(
    bundle: TideBundle,
    targetParentFolderId: string | null = null
): Promise<ImportResult> {
    const store = useDataStore.getState();
    const { publicKey, privateKey, myId } = store;

    if (!publicKey || !privateKey || !myId) {
        return {
            success: false,
            notesCount: 0,
            eventsCount: 0,
            foldersCount: 0,
            tasksCount: 0,
            idMap: {},
            importedNoteIds: [],
            error: 'Benutzer ist nicht authentifiziert oder Krypto-Schlüssel fehlen.'
        };
    }

    const idMap = new Map<string, string>();
    for (const item of bundle.items) {
        idMap.set(item.id, crypto.randomUUID());
    }

    let notesCount = 0;
    let eventsCount = 0;
    let foldersCount = 0;
    let tasksCount = 0;

    try {
        // Group items by category to import in proper topological order:
        // 1. Folders first
        // 2. Events & Tasks second
        // 3. Notes last (with rewritten ASTs)
        const folders = bundle.items.filter(i => i.type === 'folder');
        const events = bundle.items.filter(i => i.type === 'event');
        const tasks = bundle.items.filter(i => i.type === 'task');
        const notes = bundle.items.filter(i => i.type === 'note');

        // Step 1: Create folders
        for (const f of folders) {
            const newFolderId = idMap.get(f.id)!;
            const parentId = f.parent_id && idMap.has(f.parent_id) 
                ? idMap.get(f.parent_id)! 
                : targetParentFolderId;

            const res = await apiFetch("/api/v1/files", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    id: newFolderId,
                    type: "folder",
                    parent_id: parentId,
                    visibility: "private",
                    metadata: { title: f.title },
                    public_meta: {}
                })
            });

            if (res.ok) {
                foldersCount++;
                store.appendFiles([{ id: newFolderId, title: f.title, type: 'folder', parent_id: parentId } as DataItem], []);
            }
        }

        // Step 2: Create Events
        for (const ev of events) {
            const newEventId = idMap.get(ev.id)!;
            const meta = ev.event_meta || {
                start: new Date().toISOString(),
                end: new Date(Date.now() + 3600000).toISOString()
            };

            const contentString = JSON.stringify({
                title: ev.title,
                description: meta.description || ""
            });

            const v2Result = await encryptFileV2(contentString, publicKey);
            const securedMeta = await encryptMetadata({ title: ev.title }, publicKey);

            const res = await apiFetch("/api/v1/files", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    id: newEventId,
                    type: "event",
                    parent_id: null,
                    version: 2,
                    metadata: { ...v2Result.metadata, title: ev.title },
                    public_meta: {
                        start: meta.start,
                        end: meta.end,
                        allDay: meta.allDay || false,
                        color: meta.color || '#3B82F6',
                        location: meta.location || ''
                    },
                    secured_meta: securedMeta,
                    access_keys: { [myId]: v2Result.encrypted_dek },
                    content_ciphertext: v2Result.content_ciphertext,
                    visibility: "private"
                })
            });

            if (res.ok) {
                eventsCount++;
                const newEvItem: DataItem = {
                    id: newEventId,
                    title: ev.title,
                    type: 'event',
                    start: meta.start,
                    end: meta.end,
                    allDay: meta.allDay || false,
                    color: meta.color || '#3B82F6',
                    public_meta: {
                        start: meta.start,
                        end: meta.end,
                        allDay: meta.allDay || false,
                        color: meta.color || '#3B82F6'
                    }
                };
                store.appendFiles([], [newEvItem]);
            }
        }

        // Step 3: Create Tasks
        for (const t of tasks) {
            const taskDraft = {
                title: t.title,
                description: t.task_meta?.description || '',
                color: t.task_meta?.color || 'blue',
                isCompleted: t.task_meta?.isCompleted || false,
                scheduledDate: t.task_meta?.scheduledDate,
                linkedNoteId: t.parent_id && idMap.has(t.parent_id) ? idMap.get(t.parent_id) : undefined
            };
            const newTaskId = await store.addTask(taskDraft);
            idMap.set(t.id, newTaskId);
            tasksCount++;
        }

        const importedNoteIds: string[] = [];
        // Step 4: Create Notes with rewritten AST references
        for (const n of notes) {
            const parentId = n.parent_id && idMap.has(n.parent_id) 
                ? idMap.get(n.parent_id)! 
                : targetParentFolderId;

            // Rewrite content AST
            let docContent = n.content;
            if (docContent && typeof docContent === 'object') {
                docContent = rewriteTipTapReferences(docContent, idMap);
            } else if (typeof docContent === 'string') {
                docContent = markdownToTipTap(docContent);
                docContent = rewriteTipTapReferences(docContent, idMap);
            } else {
                docContent = {
                    type: 'doc',
                    content: [{ type: 'paragraph', attrs: { blockId: crypto.randomUUID() }, content: [] }]
                };
            }

            const newNoteId = await store.createNote(n.title, docContent, parentId);
            idMap.set(n.id, newNoteId);
            importedNoteIds.push(newNoteId);
            notesCount++;
        }

        // Refresh folder and file lists
        if (targetParentFolderId) {
            await store.fetchDirectory(targetParentFolderId, true);
        } else {
            await store.fetchDirectory(null, true);
        }

        const idMapRecord: Record<string, string> = {};
        idMap.forEach((v, k) => { idMapRecord[k] = v; });

        return {
            success: true,
            notesCount,
            eventsCount,
            foldersCount,
            tasksCount,
            idMap: idMapRecord,
            importedNoteIds
        };
    } catch (err: any) {
        console.error('[importTideBundle] Error:', err);
        return {
            success: false,
            notesCount,
            eventsCount,
            foldersCount,
            tasksCount,
            idMap: {},
            importedNoteIds: [],
            error: err.message || 'Unbekannter Fehler beim Importieren'
        };
    }
}

/**
 * Exports a set of notes, folders, and associated events into a TideBundle object.
 */
export async function exportTideBundle(
    rootItemIds: string[],
    includeLinkedEvents: boolean = true
): Promise<TideBundle> {
    const store = useDataStore.getState();
    const { notes, events } = store;

    const bundleItems: TideBundleItem[] = [];
    const eventIdsToInclude = new Set<string>();

    for (const id of rootItemIds) {
        const item = notes.find(n => n.id === id);
        if (!item) continue;

        if (item.type === 'folder') {
            bundleItems.push({
                id: item.id,
                type: 'folder',
                title: item.title,
                parent_id: item.parent_id || null
            });
        } else {
            // Note: fetch or read content
            let content = null;
            try {
                // If content is cached or we can fetch the blob
                const res = await apiFetch(`/api/v1/files/${item.id}/download`);
                if (res.ok) {
                    const ciphertext = await res.text();
                    const { decryptFileV2 } = await import('@/lib/cryptoV2');
                    const accessKeys = typeof (item as any).access_keys === 'string'
                        ? JSON.parse((item as any).access_keys)
                        : ((item as any).access_keys || {});
                    const decryptedBlob = await decryptFileV2({
                        content_ciphertext: ciphertext,
                        access_keys: accessKeys,
                        metadata: (item as any).metadata || { has_custom_password: false },
                        masterKey: store.privateKey!,
                        userID: store.myId!
                    });
                    const decrypted = await decryptedBlob.text();
                    content = JSON.parse(decrypted);

                    // Scan for linked events inside note
                    if (includeLinkedEvents && content) {
                        scanForEventIds(content, eventIdsToInclude);
                    }
                }
            } catch (e) {
                console.warn(`[exportTideBundle] Failed to decrypt note ${item.id}`, e);
            }

            bundleItems.push({
                id: item.id,
                type: 'note',
                title: item.title,
                parent_id: item.parent_id || null,
                content: content || { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: item.title }] }] }
            });
        }
    }

    // Include scanned events
    if (includeLinkedEvents) {
        for (const evId of eventIdsToInclude) {
            const ev = events.find(e => e.id === evId);
            if (ev) {
                const pm = (ev as any).public_meta || {};
                bundleItems.push({
                    id: ev.id,
                    type: 'event',
                    title: ev.title,
                    event_meta: {
                        start: (ev as any).start || pm.start || new Date().toISOString(),
                        end: (ev as any).end || pm.end || new Date(Date.now() + 3600000).toISOString(),
                        allDay: (ev as any).allDay || pm.allDay || false,
                        color: (ev as any).color || pm.color || '#3B82F6',
                        location: pm.location || ''
                    }
                });
            }
        }
    }

    return {
        version: 1,
        title: bundleItems.length === 1 ? bundleItems[0].title : 'TIDE Export Bundle',
        created_at: new Date().toISOString(),
        items: bundleItems
    };
}

function scanForEventIds(node: any, eventIds: Set<string>): void {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'calendarEventMention' && node.attrs?.eventId) {
        eventIds.add(node.attrs.eventId);
    }
    if (Array.isArray(node.content)) {
        node.content.forEach((c: any) => scanForEventIds(c, eventIds));
    }
}

/**
 * Converts a TipTap document AST into clean Markdown with frontmatter.
 */
export function tipTapToMarkdown(arg1: any, arg2?: any): string {
    let title = '';
    let doc = arg1;
    if (typeof arg1 === 'string' && arg2 && typeof arg2 === 'object') {
        title = arg1;
        doc = arg2;
    } else if (typeof arg2 === 'string') {
        title = arg2;
        doc = arg1;
    }

    if (!doc || !doc.content || !Array.isArray(doc.content)) {
        return title ? `# ${title}\n` : '';
    }

    const lines: string[] = title ? [`# ${title}\n`] : [];

    function renderNode(node: any): string {
        if (!node) return '';
        if (node.type === 'text') {
            let t = node.text || '';
            if (node.marks) {
                for (const m of node.marks) {
                    if (m.type === 'bold') t = `**${t}**`;
                    if (m.type === 'italic') t = `*${t}*`;
                    if (m.type === 'code') t = `\`${t}\``;
                    if (m.type === 'strike') t = `~~${t}~~`;
                    if (m.type === 'highlight') t = `<mark>${t}</mark>`;
                    if (m.type === 'link') t = `[${t}](${m.attrs?.href || ''})`;
                    if (m.type === 'referenceMark') t = `[[${m.attrs?.targetId}|${t}]]`;
                }
            }
            return t;
        }

        if (node.type === 'dateMention') {
            return `📅 @${node.attrs?.date || ''} `;
        }

        if (node.type === 'calendarEventMention') {
            return `🗓️ [${node.attrs?.title || 'Event'}](event:${node.attrs?.eventId || ''}) `;
        }

        if (node.type === 'taskMention') {
            return `☑️ [${node.attrs?.title || 'Aufgabe'}](task:${node.attrs?.taskId || ''}) `;
        }

        if (node.type === 'mathBlock') {
            return `\n$$\n${node.attrs?.latex || ''}\n$$\n`;
        }

        if (node.type === 'inlineMath') {
            return `$${node.attrs?.latex || ''}$`;
        }

        const inner = Array.isArray(node.content) ? node.content.map(renderNode).join('') : '';

        if (node.type === 'heading') {
            const prefix = '#'.repeat(node.attrs?.level || 1);
            return `\n${prefix} ${inner}\n`;
        }

        if (node.type === 'paragraph') {
            return `${inner}\n\n`;
        }

        if (node.type === 'bulletList') {
            return `${inner}\n`;
        }

        if (node.type === 'listItem') {
            return `- ${inner}`;
        }

        if (node.type === 'taskItem') {
            const check = node.attrs?.checked ? 'x' : ' ';
            return `- [${check}] ${inner}`;
        }

        if (node.type === 'codeBlock') {
            return `\n\`\`\`${node.attrs?.language || ''}\n${inner}\n\`\`\`\n`;
        }

        if (node.type === 'blockquote') {
            return `> ${inner}\n\n`;
        }

        return inner;
    }

    for (const child of doc.content) {
        lines.push(renderNode(child));
    }

    return lines.join('');
}

/**
 * Converts basic Markdown text into a TipTap ProseMirror document structure.
 */
export function markdownToTipTap(md: string): any {
    const lines = md.split(/\r?\n/);
    const content: any[] = [];

    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        if (trimmed.startsWith('# ')) {
            content.push({
                type: 'heading',
                attrs: { level: 1, blockId: crypto.randomUUID() },
                content: [{ type: 'text', text: trimmed.slice(2).trim() }]
            });
        } else if (trimmed.startsWith('## ')) {
            content.push({
                type: 'heading',
                attrs: { level: 2, blockId: crypto.randomUUID() },
                content: [{ type: 'text', text: trimmed.slice(3).trim() }]
            });
        } else if (trimmed.startsWith('### ')) {
            content.push({
                type: 'heading',
                attrs: { level: 3, blockId: crypto.randomUUID() },
                content: [{ type: 'text', text: trimmed.slice(4).trim() }]
            });
        } else if (trimmed.startsWith('- [ ] ') || trimmed.startsWith('- [x] ')) {
            const isChecked = trimmed.startsWith('- [x] ');
            content.push({
                type: 'taskList',
                content: [{
                    type: 'taskItem',
                    attrs: { checked: isChecked },
                    content: [{
                        type: 'paragraph',
                        attrs: { blockId: crypto.randomUUID() },
                        content: [{ type: 'text', text: trimmed.slice(6).trim() }]
                    }]
                }]
            });
        } else if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
            content.push({
                type: 'bulletList',
                content: [{
                    type: 'listItem',
                    content: [{
                        type: 'paragraph',
                        attrs: { blockId: crypto.randomUUID() },
                        content: [{ type: 'text', text: trimmed.slice(2).trim() }]
                    }]
                }]
            });
        } else {
            content.push({
                type: 'paragraph',
                attrs: { blockId: crypto.randomUUID() },
                content: [{ type: 'text', text: trimmed }]
            });
        }
    }

    if (content.length === 0) {
        content.push({
            type: 'paragraph',
            attrs: { blockId: crypto.randomUUID() },
            content: []
        });
    }

    return {
        type: 'doc',
        content
    };
}
