'use client';

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

/** Wandelt den TipTap-JSON-Inhalt in reinen Text um. Fällt auf Rohtext zurück. */
export function docToPlainText(raw: string): string {
  try {
    const doc = JSON.parse(raw);
    const parts: string[] = [];
    const walk = (node: unknown) => {
      if (!node || typeof node !== 'object') return;
      const n = node as { type?: string; text?: string; content?: unknown[] };
      if (n.type === 'text' && typeof n.text === 'string') parts.push(n.text);
      if (Array.isArray(n.content)) {
        n.content.forEach(walk);
        if (n.type !== 'doc' && n.type !== 'text') parts.push('\n');
      }
    };
    walk(doc);
    return parts.join('').replace(/[ \t]+/g, ' ').replace(/\n{2,}/g, '\n').trim();
  } catch {
    return raw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  }
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

/** Entschlüsselt die übergebenen Notizen im Hintergrund und merkt sich den Text. */
export async function preloadNotePreviews(files: Array<Record<string, unknown>>): Promise<void> {
  const { privateKey, myId } = useDataStore.getState();
  if (!privateKey) return;
  let changed = false;
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
    try {
      const { contentText } = await decryptNotePayload({
        target: f,
        fileId: id,
        effectivePrivKey: privateKey,
        effectiveMyId: myId ?? '',
        onNotFound: () => {},
      });
      previews.set(id, docToPlainText(contentText || '').slice(0, MAX_CHARS));
      seenStamp.set(id, stamp);
      changed = true;
    } catch {
      /* Notiz bleibt ohne Vorschau */
    }
  }
  if (changed) listeners.forEach((cb) => cb());
}
