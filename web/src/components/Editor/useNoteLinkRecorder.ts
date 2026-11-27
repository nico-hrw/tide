'use client';

import { useEffect } from 'react';
import type { Editor } from '@tiptap/react';
import { useNoteLinkStore } from '@/store/useNoteLinkStore';

const FIRST_READ_MS = 1800;
const EDIT_DEBOUNCE_MS = 1200;

/**
 * Feeds the on-device link index (store/useNoteLinkStore) from the open note: once shortly after it loaded
 * (so a link added later counts as new), and after edits. Only ids leave this hook, see lib/noteLinks.ts.
 */
export function useNoteLinkRecorder(editor: Editor | null, noteId: string | null | undefined, enabled: boolean): void {
    useEffect(() => {
        if (!editor || !noteId || !enabled) return;
        const read = () => {
            if (editor.isDestroyed) return;
            useNoteLinkStore.getState().record(noteId, editor.getJSON());
        };
        const first = setTimeout(read, FIRST_READ_MS);
        let edit: ReturnType<typeof setTimeout> | null = null;
        const onUpdate = () => {
            if (edit) clearTimeout(edit);
            edit = setTimeout(read, EDIT_DEBOUNCE_MS);
        };
        editor.on('update', onUpdate);
        return () => {
            clearTimeout(first);
            if (edit) clearTimeout(edit);
            editor.off('update', onUpdate);
        };
    }, [editor, noteId, enabled]);
}
