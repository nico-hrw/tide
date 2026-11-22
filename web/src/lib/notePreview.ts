'use client';

import * as Y from 'yjs';
import { decryptNotePayload } from '@/hooks/autoSaveHelpers';
import { useDataStore } from '@/store/useDataStore';

/**
 * Textauszüge der letzten Notizen für die mobile Liste.
 * Bewusst nur im Arbeitsspeicher: entschlüsselter Text landet nicht in localStorage.
 * Beim nächsten Start wird neu entschlüsselt.
 */
const previews = new Map<string, string>();
const seenStamp = new Map<string, string>();
const listeners = new Set<() => void>();
const MAX_CHARS = 2000;

const BLOCK_TYPES = new Set([
  'paragraph', 'heading', 'blockquote', 'listItem', 'taskItem', 'codeBlock', 'tableRow', 'tableCell', 'tableHeader', 'horizontalRule',
]);

/** Plain text of a ProseMirror JSON node, including mention labels and code blocks. */
function nodeText(node: unknown, out: string[]): void {
  if (!node || typeof node !== 'object') return;
  const n = node as { type?: string; text?: string; attrs?: Record<string, unknown>; content?: unknown[] };
  if (typeof n.text === 'string') out.push(n.text);
  else if (n.type === 'hardBreak') out.push('\n');
  else if (typeof n.attrs?.label === 'string') out.push(n.attrs.label);
  if (Array.isArray(n.content)) n.content.forEach((c) => nodeText(c, out));
  if (n.type && BLOCK_TYPES.has(n.type)) out.push('\n');
}

/** Text of a Yjs update (the `__yjs` part of a saved note), for notes whose JSON body is missing or empty. */
function yjsToPlainText(update: string): string {
  try {
    const doc = new Y.Doc();
    const bytes = Uint8Array.from(atob(update), (c) => c.charCodeAt(0));
    Y.applyUpdate(doc, bytes);
    const xml = doc.getXmlFragment('prosemirror').toString();
    doc.destroy();
    return xml.replace(/<\/(p|h[1-6]|li|blockquote|pre|tr)>/gi, '\n').replace(/<[^>]+>/g, '');
  } catch {
    return '';
  }
}

/** Light markdown clean-up for notes stored as raw text, so the preview shows words, not syntax. */
function stripMarkdown(text: string): string {
  return text
    .replace(/```[a-z]*\n?/gi, '')
    .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+\.|- \[[ xX]\])\s+/gm, '')
    .replace(/(\*\*|__|~~|`)/g, '')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1');
}

function tidy(text: string): string {
  return text.replace(/[ \t ]+/g, ' ').replace(/ ?\n ?/g, '\n').replace(/\n{2,}/g, '\n').trim();
}

/** Wandelt den gespeicherten Notizinhalt (TipTap-JSON, Yjs oder Rohtext/Markdown/HTML) in reinen Text um. */
export function docToPlainText(raw: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return tidy(stripMarkdown(raw.replace(/<\/(p|h[1-6]|li|div|br)>/gi, '\n').replace(/<[^>]+>/g, ' ')));
  }
  if (typeof parsed === 'string') return tidy(stripMarkdown(parsed));
  const parts: string[] = [];
  nodeText(parsed, parts);
  let text = tidy(parts.join(''));
  const yjs = (parsed as { __yjs?: unknown } | null)?.__yjs;
  if (!text && typeof yjs === 'string') text = tidy(yjsToPlainText(yjs));
  return text;
}

export function getNotePreview(id: string): string | undefined {
  return previews.get(id);
}

export function subscribeNotePreviews(cb: () => void): () => void {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

/** Gleiche Schutz-Prüfung wie in der mobilen Liste: geschützte Notizen werden nie vorab geladen. */
export function isProtectedFile(f: Record<string, unknown>): boolean {
  const meta = (f.metadata ?? {}) as Record<string, unknown>;
  const sec = (meta.security_settings ?? {}) as Record<string, unknown>;
  const title = typeof f.title === 'string' ? f.title : '';
  return Boolean(
    f.has_pin || f.is_locked || f.isLocked ||
    meta.has_custom_password || sec.has_custom_password ||
    title.startsWith('#'),
  );
}

/** Leert alle Vorschauen, z. B. beim Abmelden. */
export function clearNotePreviews(): void {
  previews.clear();
  seenStamp.clear();
  listeners.forEach((cb) => cb());
}

const DECRYPT_ERROR = /DECRYPTION ERROR/;
const inFlight = new Set<string>();

/** Entschlüsselt die übergebenen Notizen im Hintergrund und merkt sich den Text. Die ersten Einträge kommen zuerst dran. */
export async function preloadNotePreviews(files: Array<Record<string, unknown>>): Promise<void> {
  const { privateKey, myId } = useDataStore.getState();
  if (!privateKey) return;
  let changed = false;
  const todo: Array<{ f: Record<string, unknown>; id: string; stamp: string }> = [];
  for (const f of files) {
    const id = typeof f.id === 'string' ? f.id : '';
    if (!id || f.type === 'folder') continue;
    if (isProtectedFile(f)) {
      // Geschützt: nie vorab laden und eine evtl. alte Vorschau verwerfen.
      if (previews.delete(id)) changed = true;
      seenStamp.delete(id);
      continue;
    }
    const stamp = String(f.updated_at ?? f.updatedAt ?? '');
    if (previews.has(id) && seenStamp.get(id) === stamp) continue;
    if (inFlight.has(id)) continue;
    todo.push({ f, id, stamp });
  }
  const worker = async (item: (typeof todo)[number]) => {
    inFlight.add(item.id);
    try {
      const { contentText } = await decryptNotePayload({
        target: item.f,
        fileId: item.id,
        effectivePrivKey: privateKey,
        effectiveMyId: myId ?? '',
        onNotFound: () => {},
      });
      const text = DECRYPT_ERROR.test(contentText || '') ? '' : docToPlainText(contentText || '');
      previews.set(item.id, text.slice(0, MAX_CHARS));
      seenStamp.set(item.id, item.stamp);
      changed = true;
      listeners.forEach((cb) => cb());
    } catch {
      /* Notiz bleibt ohne Vorschau; der nächste Durchlauf versucht es erneut */
    } finally {
      inFlight.delete(item.id);
    }
  };
  // Three at a time keeps the newest notes fast without flooding the server.
  for (let i = 0; i < todo.length; i += 3) await Promise.all(todo.slice(i, i + 3).map(worker));
  if (changed) listeners.forEach((cb) => cb());
}
