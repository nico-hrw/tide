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
        status?: string;
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

const MAX_IMPORT_JSON_DEPTH = 50;
const DANGEROUS_PROTO_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const RASTER_DATA_IMAGE_RE = /^data:image\/(png|jpeg|gif|webp);base64,[A-Za-z0-9+/=]+$/i;
const SAFE_CSS_COLOR_RE = /^(?:#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})|(?:rgb|hsl)a?\(\s*[0-9.%\s,/+-]+\)|var\(--[a-zA-Z0-9_-]+\)|[a-zA-Z]{1,32})$/;
const SAFE_FONT_SIZE_RE = /^(?:[0-9]+(?:\.[0-9]+)?(?:px|rem|em|pt|%)|(?:xx?-)?(?:small|large)|medium|smaller|larger|inherit)$/;

function isPlainRecord(val: unknown): val is Record<string, unknown> {
    return typeof val === 'object' && val !== null && !Array.isArray(val);
}

function isSafeLinkHref(raw: unknown): raw is string {
    if (typeof raw !== 'string') return false;
    const trimmed = raw.trim();
    if (!trimmed || /[\u0000-\u001F\u007F]/.test(trimmed)) return false;
    if (trimmed.startsWith('#')) return true;
    if (/^\/(?![/\\])/.test(trimmed)) return true;
    try {
        const parsed = new URL(trimmed);
        return parsed.protocol === 'https:' || parsed.protocol === 'http:' || parsed.protocol === 'mailto:';
    } catch {
        return false;
    }
}

function isSafeImageSrc(raw: unknown): raw is string {
    if (typeof raw !== 'string') return false;
    const trimmed = raw.trim();
    if (!trimmed || /[\u0000-\u001F\u007F]/.test(trimmed)) return false;
    if (/^\/(?![/\\])/.test(trimmed)) return true;
    if (RASTER_DATA_IMAGE_RE.test(trimmed)) return true;
    try {
        const parsed = new URL(trimmed);
        return parsed.protocol === 'https:' || parsed.protocol === 'http:' || parsed.protocol === 'blob:';
    } catch {
        return false;
    }
}

/**
 * Recursively sanitizes imported JSON (e.g. TipTap document ASTs) by stripping
 * prototype-pollution keys and unsafe link/image URLs or style attributes.
 */
export function sanitizeImportedJson(value: unknown, depth = 0): unknown {
    if (value === null || typeof value !== 'object') {
        return value;
    }
    if (depth > MAX_IMPORT_JSON_DEPTH) {
        return null;
    }
    if (Array.isArray(value)) {
        return value.map((item) => sanitizeImportedJson(item, depth + 1));
    }

    const source = value as Record<string, unknown>;
    const clean: Record<string, unknown> = {};
    for (const key of Object.keys(source)) {
        if (DANGEROUS_PROTO_KEYS.has(key)) continue;
        clean[key] = sanitizeImportedJson(source[key], depth + 1);
    }

    if (clean.type === 'link' && isPlainRecord(clean.attrs)) {
        if ('href' in clean.attrs && !isSafeLinkHref(clean.attrs.href)) {
            delete clean.attrs.href;
        }
    }

    if (clean.type === 'image' && isPlainRecord(clean.attrs)) {
        if ('src' in clean.attrs && !isSafeImageSrc(clean.attrs.src)) {
            delete clean.attrs.src;
        }
    }

    if ((clean.type === 'highlight' || clean.type === 'textStyle') && isPlainRecord(clean.attrs)) {
        if ('color' in clean.attrs) {
            const color = clean.attrs.color;
            if (typeof color !== 'string' || !SAFE_CSS_COLOR_RE.test(color.trim())) {
                delete clean.attrs.color;
            } else {
                clean.attrs.color = color.trim();
            }
        }
        if ('fontSize' in clean.attrs) {
            const fontSize = clean.attrs.fontSize;
            if (typeof fontSize !== 'string' || !SAFE_FONT_SIZE_RE.test(fontSize.trim())) {
                delete clean.attrs.fontSize;
            } else {
                clean.attrs.fontSize = fontSize.trim();
            }
        }
    }

    return clean;
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
        // Task mentions store their todo id as attrs.id (taskId: older exports)
        if (cloned.type === 'taskMention' && (cloned.attrs?.id || cloned.attrs?.taskId)) {
            const key = cloned.attrs.id ?? cloned.attrs.taskId;
            const mappedTaskId = idMap.get(key);
            if (mappedTaskId) {
                if (cloned.attrs.id) cloned.attrs.id = mappedTaskId;
                if (cloned.attrs.taskId) cloned.attrs.taskId = mappedTaskId;
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
            const rawStatus = t.task_meta?.status;
            const validStatus: 'todo' | 'in_progress' | 'completed' | undefined = 
                (rawStatus === 'todo' || rawStatus === 'in_progress' || rawStatus === 'completed')
                    ? rawStatus
                    : (t.task_meta?.isCompleted !== undefined ? (t.task_meta.isCompleted ? 'completed' : 'todo') : undefined);
            const taskDraft = {
                title: t.title,
                description: t.task_meta?.description || '',
                color: t.task_meta?.color || 'blue',
                isCompleted: t.task_meta?.isCompleted || false,
                status: validStatus,
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

            // Rewrite and sanitize content AST
            let docContent: unknown = n.content;
            if (docContent && typeof docContent === 'object') {
                docContent = rewriteTipTapReferences(sanitizeImportedJson(docContent), idMap);
            } else if (typeof docContent === 'string') {
                docContent = markdownToTipTap(docContent);
                docContent = rewriteTipTapReferences(docContent, idMap);
            } else {
                docContent = {
                    type: 'doc',
                    content: [{ type: 'paragraph', attrs: { blockId: crypto.randomUUID() }, content: [] }]
                };
            }
            docContent = sanitizeImportedJson(docContent);

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
    const { notes, events, tasks } = store;

    const bundleItems: TideBundleItem[] = [];
    const eventIdsToInclude = new Set<string>();
    const taskIdsToInclude = new Set<string>();

    for (const id of rootItemIds) {
        const item = notes.find(n => n.id === id);
        if (!item) {
            const task = tasks.find(t => t.id === id);
            if (task && !bundleItems.some(b => b.id === task.id)) {
                bundleItems.push({
                    id: task.id,
                    type: 'task',
                    title: task.title,
                    parent_id: task.linkedNoteId || null,
                    task_meta: {
                        description: task.description,
                        color: task.color,
                        isCompleted: task.isCompleted,
                        status: task.status,
                        scheduledDate: task.scheduledDate,
                    }
                });
            }
            continue;
        }

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
                const res = await apiFetch(`/api/v1/files/${encodeURIComponent(item.id)}/download`);
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

                    // Scan for linked events and tasks inside note
                    if (content) {
                        if (includeLinkedEvents) {
                            scanForEventIds(content, eventIdsToInclude);
                        }
                        scanForTaskIds(content, taskIdsToInclude);
                    }
                }
            } catch (e) {
                console.warn(`[exportTideBundle] Failed to decrypt note ${item.id}`, e);
            }

            // Also find tasks linked to this note
            const linkedTasks = tasks.filter(t => t.linkedNoteId === item.id);
            for (const lt of linkedTasks) {
                taskIdsToInclude.add(lt.id);
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

    // Include scanned / linked tasks
    for (const taskId of taskIdsToInclude) {
        const task = tasks.find(t => t.id === taskId);
        if (task && !bundleItems.some(b => b.id === task.id)) {
            bundleItems.push({
                id: task.id,
                type: 'task',
                title: task.title,
                parent_id: task.linkedNoteId || null,
                task_meta: {
                    description: task.description,
                    color: task.color,
                    isCompleted: task.isCompleted,
                    status: task.status,
                    scheduledDate: task.scheduledDate,
                }
            });
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

function scanForTaskIds(node: any, taskIds: Set<string>): void {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'taskMention' && (node.attrs?.id || node.attrs?.taskId)) {
        taskIds.add(node.attrs.id ?? node.attrs.taskId);
    }
    if (Array.isArray(node.content)) {
        node.content.forEach((c: any) => scanForTaskIds(c, taskIds));
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
            return `☑️ [${node.attrs?.label || node.attrs?.title || 'Aufgabe'}](task:${node.attrs?.id || node.attrs?.taskId || ''}) `;
        }

        if (node.type === 'mathBlock') {
            return `\n$$\n${node.attrs?.latex || ''}\n$$\n`;
        }

        if (node.type === 'inlineMath') {
            return `$${node.attrs?.latex || ''}$`;
        }

        if (node.type === 'hardBreak') {
            return '  \n';
        }

        if (node.type === 'horizontalRule') {
            return '\n---\n\n';
        }

        if (node.type === 'orderedList') {
            const start = typeof node.attrs?.start === 'number' ? node.attrs.start : 1;
            const items: unknown[] = Array.isArray(node.content) ? node.content : [];
            const rendered = items
                .map((item, idx) => {
                    const itemContent = isPlainRecord(item) && Array.isArray(item.content) ? item.content : [];
                    const itemInner = itemContent.map(renderNode).join('');
                    return `${start + idx}. ${itemInner}`;
                })
                .join('');
            return `${rendered}\n`;
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

export type TipTapMark = {
    type: string;
    attrs?: Record<string, string>;
};

export type TipTapInlineNode = {
    type: 'text';
    text: string;
    marks?: TipTapMark[];
};

export type TipTapBlockNode = {
    type: string;
    attrs?: Record<string, string | number | boolean>;
    content?: Array<TipTapBlockNode | TipTapInlineNode>;
};

export type TipTapDoc = {
    type: 'doc';
    content: TipTapBlockNode[];
};

const HORIZONTAL_RULE_RE = /^(?:(?:\*\s*){3,}|(?:-\s*){3,}|(?:_\s*){3,})$/;
const TASK_LIST_ITEM_RE = /^[-*+]\s+\[([ xX])\](?:\s+(.*))?$/;
const BULLET_LIST_ITEM_RE = /^[-*+]\s+(.*)$/;
const ORDERED_LIST_ITEM_RE = /^(\d+)\.\s+(.*)$/;
const HEADING_RE = /^(#{1,6})\s+(.*)$/;
const FENCE_OPEN_RE = /^```(.*)$/;
const FENCE_CLOSE_RE = /^```\s*$/;
const BLOCKQUOTE_RE = /^>(?:\s?(.*))?$/;

function marksEqual(a?: TipTapMark[], b?: TipTapMark[]): boolean {
    const lenA = a?.length ?? 0;
    const lenB = b?.length ?? 0;
    if (lenA !== lenB) return false;
    for (let i = 0; i < lenA; i++) {
        const ma = a![i];
        const mb = b![i];
        if (ma.type !== mb.type) return false;
        if (ma.attrs?.href !== mb.attrs?.href) return false;
    }
    return true;
}

function appendTextNode(nodes: TipTapInlineNode[], text: string, marks: TipTapMark[]): void {
    if (!text) return;
    const last = nodes[nodes.length - 1];
    if (last && marksEqual(last.marks, marks)) {
        last.text += text;
        return;
    }
    nodes.push(marks.length > 0 ? { type: 'text', text, marks: [...marks] } : { type: 'text', text });
}

function withMark(marks: TipTapMark[], next: TipTapMark): TipTapMark[] {
    if (marks.some((m) => m.type === next.type && m.attrs?.href === next.attrs?.href)) {
        return marks;
    }
    return [...marks, next];
}

function findClosingParen(input: string, start: number): number {
    let depth = 1;
    for (let j = start; j < input.length; j++) {
        const ch = input[j];
        if (ch === '\n' || ch === '\r') return -1;
        if (ch === '(') depth++;
        else if (ch === ')') {
            depth--;
            if (depth === 0) return j;
        }
    }
    return -1;
}

function findClosingDelimiter(
    input: string,
    start: number,
    delim: string,
    checkWordBoundary: boolean
): number {
    const ch = delim[0];
    const len = delim.length;
    for (let j = start; j < input.length; j++) {
        if (input[j] === '`') {
            const codeEnd = input.indexOf('`', j + 1);
            if (codeEnd !== -1) {
                j = codeEnd;
                continue;
            }
        }
        if (len === 1) {
            if (input[j] !== ch) continue;
            if (input[j + 1] === ch) {
                j++;
                continue;
            }
        } else {
            if (!input.startsWith(delim, j)) continue;
            while (input[j + len] === ch) {
                j++;
            }
        }
        if (j === start || /\s/.test(input[j - 1])) continue;
        if (checkWordBoundary && j + len < input.length && /[a-zA-Z0-9]/.test(input[j + len])) {
            continue;
        }
        return j;
    }
    return -1;
}

function parseInlineWithMarks(input: string, activeMarks: TipTapMark[]): TipTapInlineNode[] {
    const result: TipTapInlineNode[] = [];
    let plainStart = 0;
    let i = 0;

    const flushPlain = (end: number): void => {
        if (end > plainStart) {
            appendTextNode(result, input.slice(plainStart, end), activeMarks);
        }
    };

    while (i < input.length) {
        const ch = input[i];

        if (ch === '\\' && i + 1 < input.length && /[*_`~[\]\\]/.test(input[i + 1])) {
            flushPlain(i);
            appendTextNode(result, input[i + 1], activeMarks);
            i += 2;
            plainStart = i;
            continue;
        }

        if (ch === '`') {
            const closeIdx = input.indexOf('`', i + 1);
            if (closeIdx > i + 1) {
                flushPlain(i);
                appendTextNode(result, input.slice(i + 1, closeIdx), withMark(activeMarks, { type: 'code' }));
                i = closeIdx + 1;
                plainStart = i;
                continue;
            }
        }

        if (ch === '[') {
            const closeBracket = input.indexOf(']', i + 1);
            if (closeBracket > i + 1 && input[closeBracket + 1] === '(') {
                const closeParen = findClosingParen(input, closeBracket + 2);
                if (closeParen !== -1) {
                    const label = input.slice(i + 1, closeBracket);
                    const rawHref = input.slice(closeBracket + 2, closeParen).trim();
                    if (label && isSafeLinkHref(rawHref)) {
                        flushPlain(i);
                        const linkMarks = withMark(activeMarks, { type: 'link', attrs: { href: rawHref } });
                        for (const child of parseInlineWithMarks(label, linkMarks)) {
                            appendTextNode(result, child.text, child.marks ?? []);
                        }
                        i = closeParen + 1;
                        plainStart = i;
                        continue;
                    }
                }
            }
        }

        if (input.startsWith('~~', i) && i + 2 < input.length && !/\s/.test(input[i + 2])) {
            const closeIdx = input.indexOf('~~', i + 2);
            if (closeIdx > i + 2 && !/\s/.test(input[closeIdx - 1])) {
                flushPlain(i);
                const strikeMarks = withMark(activeMarks, { type: 'strike' });
                for (const child of parseInlineWithMarks(input.slice(i + 2, closeIdx), strikeMarks)) {
                    appendTextNode(result, child.text, child.marks ?? []);
                }
                i = closeIdx + 2;
                plainStart = i;
                continue;
            }
        }

        const isTripleStar = input.startsWith('***', i);
        const isTripleUnder = input.startsWith('___', i) && (i === 0 || !/[a-zA-Z0-9]/.test(input[i - 1]));
        if ((isTripleStar || isTripleUnder) && i + 3 < input.length && !/\s/.test(input[i + 3])) {
            const delim = input.slice(i, i + 3);
            const closeIdx = findClosingDelimiter(input, i + 3, delim, isTripleUnder);
            if (closeIdx !== -1) {
                flushPlain(i);
                const bothMarks = withMark(withMark(activeMarks, { type: 'bold' }), { type: 'italic' });
                for (const child of parseInlineWithMarks(input.slice(i + 3, closeIdx), bothMarks)) {
                    appendTextNode(result, child.text, child.marks ?? []);
                }
                i = closeIdx + 3;
                plainStart = i;
                continue;
            }
        }

        const isDoubleStar = input.startsWith('**', i);
        const isDoubleUnder = input.startsWith('__', i) && (i === 0 || !/[a-zA-Z0-9]/.test(input[i - 1]));
        if ((isDoubleStar || isDoubleUnder) && i + 2 < input.length && !/\s/.test(input[i + 2])) {
            const delim = input.slice(i, i + 2);
            const closeIdx = findClosingDelimiter(input, i + 2, delim, isDoubleUnder);
            if (closeIdx !== -1) {
                flushPlain(i);
                const boldMarks = withMark(activeMarks, { type: 'bold' });
                for (const child of parseInlineWithMarks(input.slice(i + 2, closeIdx), boldMarks)) {
                    appendTextNode(result, child.text, child.marks ?? []);
                }
                i = closeIdx + 2;
                plainStart = i;
                continue;
            }
        }

        const isSingleStar = ch === '*' && input[i + 1] !== '*';
        const isSingleUnder = ch === '_' && input[i + 1] !== '_' && (i === 0 || !/[a-zA-Z0-9]/.test(input[i - 1]));
        if ((isSingleStar || isSingleUnder) && i + 1 < input.length && !/\s/.test(input[i + 1])) {
            const closeIdx = findClosingDelimiter(input, i + 1, ch, isSingleUnder);
            if (closeIdx !== -1) {
                flushPlain(i);
                const italicMarks = withMark(activeMarks, { type: 'italic' });
                for (const child of parseInlineWithMarks(input.slice(i + 1, closeIdx), italicMarks)) {
                    appendTextNode(result, child.text, child.marks ?? []);
                }
                i = closeIdx + 1;
                plainStart = i;
                continue;
            }
        }

        i++;
    }

    flushPlain(input.length);
    return result;
}

/**
 * Parses inline Markdown formatting (`**bold**`, `*italic*`, `` `code` ``,
 * `~~strike~~`, and safe `[label](href)` links) into TipTap text nodes.
 */
export function parseInlineMarkdown(text: string): TipTapInlineNode[] {
    if (!text) return [];
    return parseInlineWithMarks(text, []);
}

/**
 * Converts Markdown text into a rich TipTap ProseMirror document structure.
 */
export function markdownToTipTap(md: string): TipTapDoc {
    const lines = md.split(/\r?\n/);
    const content: TipTapBlockNode[] = [];
    let i = 0;

    while (i < lines.length) {
        const rawLine = lines[i];
        const trimmed = rawLine.trim();

        if (!trimmed) {
            i++;
            continue;
        }

        const fenceMatch = trimmed.match(FENCE_OPEN_RE);
        if (fenceMatch) {
            const language = fenceMatch[1].trim();
            const codeLines: string[] = [];
            i++;
            while (i < lines.length && !FENCE_CLOSE_RE.test(lines[i].trim())) {
                codeLines.push(lines[i]);
                i++;
            }
            if (i < lines.length) i++;
            const codeText = codeLines.join('\n');
            content.push({
                type: 'codeBlock',
                attrs: { language, blockId: crypto.randomUUID() },
                content: codeText ? [{ type: 'text', text: codeText }] : []
            });
            continue;
        }

        if (HORIZONTAL_RULE_RE.test(trimmed)) {
            content.push({
                type: 'horizontalRule',
                attrs: { blockId: crypto.randomUUID() }
            });
            i++;
            continue;
        }

        const headingMatch = trimmed.match(HEADING_RE);
        if (headingMatch) {
            content.push({
                type: 'heading',
                attrs: { level: headingMatch[1].length, blockId: crypto.randomUUID() },
                content: parseInlineMarkdown(headingMatch[2].trim())
            });
            i++;
            continue;
        }

        if (BLOCKQUOTE_RE.test(trimmed)) {
            const quoteParagraphs: TipTapBlockNode[] = [];
            let currentParaLines: string[] = [];

            const flushQuoteParagraph = (): void => {
                if (currentParaLines.length === 0) return;
                quoteParagraphs.push({
                    type: 'paragraph',
                    attrs: { blockId: crypto.randomUUID() },
                    content: parseInlineMarkdown(currentParaLines.join(' '))
                });
                currentParaLines = [];
            };

            while (i < lines.length) {
                const quoteMatch = lines[i].trim().match(BLOCKQUOTE_RE);
                if (!quoteMatch) break;
                const innerLine = (quoteMatch[1] ?? '').trim();
                if (!innerLine) {
                    flushQuoteParagraph();
                } else {
                    currentParaLines.push(innerLine);
                }
                i++;
            }
            flushQuoteParagraph();

            if (quoteParagraphs.length === 0) {
                quoteParagraphs.push({
                    type: 'paragraph',
                    attrs: { blockId: crypto.randomUUID() },
                    content: []
                });
            }

            content.push({
                type: 'blockquote',
                attrs: { blockId: crypto.randomUUID() },
                content: quoteParagraphs
            });
            continue;
        }

        if (TASK_LIST_ITEM_RE.test(trimmed)) {
            const taskItems: TipTapBlockNode[] = [];
            while (i < lines.length) {
                const match = lines[i].trim().match(TASK_LIST_ITEM_RE);
                if (!match) break;
                taskItems.push({
                    type: 'taskItem',
                    attrs: { checked: match[1].toLowerCase() === 'x' },
                    content: [{
                        type: 'paragraph',
                        attrs: { blockId: crypto.randomUUID() },
                        content: parseInlineMarkdown((match[2] ?? '').trim())
                    }]
                });
                i++;
            }
            content.push({
                type: 'taskList',
                content: taskItems
            });
            continue;
        }

        if (BULLET_LIST_ITEM_RE.test(trimmed)) {
            const listItems: TipTapBlockNode[] = [];
            while (i < lines.length) {
                const lineTrimmed = lines[i].trim();
                if (HORIZONTAL_RULE_RE.test(lineTrimmed) || TASK_LIST_ITEM_RE.test(lineTrimmed)) break;
                const match = lineTrimmed.match(BULLET_LIST_ITEM_RE);
                if (!match) break;
                listItems.push({
                    type: 'listItem',
                    content: [{
                        type: 'paragraph',
                        attrs: { blockId: crypto.randomUUID() },
                        content: parseInlineMarkdown(match[1].trim())
                    }]
                });
                i++;
            }
            content.push({
                type: 'bulletList',
                content: listItems
            });
            continue;
        }

        if (ORDERED_LIST_ITEM_RE.test(trimmed)) {
            const orderedItems: TipTapBlockNode[] = [];
            let firstNum = 1;
            while (i < lines.length) {
                const match = lines[i].trim().match(ORDERED_LIST_ITEM_RE);
                if (!match) break;
                if (orderedItems.length === 0) {
                    firstNum = parseInt(match[1], 10) || 1;
                }
                orderedItems.push({
                    type: 'listItem',
                    content: [{
                        type: 'paragraph',
                        attrs: { blockId: crypto.randomUUID() },
                        content: parseInlineMarkdown(match[2].trim())
                    }]
                });
                i++;
            }
            content.push({
                type: 'orderedList',
                ...(firstNum !== 1 ? { attrs: { start: firstNum } } : {}),
                content: orderedItems
            });
            continue;
        }

        content.push({
            type: 'paragraph',
            attrs: { blockId: crypto.randomUUID() },
            content: parseInlineMarkdown(trimmed)
        });
        i++;
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
