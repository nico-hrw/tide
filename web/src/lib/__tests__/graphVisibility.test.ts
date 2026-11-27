import { describe, expect, it } from 'vitest';
import { isGraphVisible, isVisibleEvent, linkableIds } from '../graphVisibility';
import type { DataItem } from '@/store/slices/types';

const item = (extra: Partial<DataItem> & { id: string }): DataItem => ({ title: 'T', type: 'note', ...extra });

describe('what may appear in the graph', () => {
    it('lets notes and canvases in', () => {
        expect(isGraphVisible(item({ id: 'a' }))).toBe(true);
        expect(isGraphVisible(item({ id: 'c', type: 'canvas' }))).toBe(true);
    });

    it('keeps everything else out of the note list: folders, tags, attachments, events, helper files, deleted notes', () => {
        expect(isGraphVisible(item({ id: 'f', type: 'folder' }))).toBe(false);
        expect(isGraphVisible(item({ id: 'g', isGroup: true }))).toBe(false);
        expect(isGraphVisible(item({ id: 'x', type: 'file' }))).toBe(false);
        expect(isGraphVisible(item({ id: 'e', type: 'event' }))).toBe(false);
        expect(isGraphVisible(item({ id: 'h', role: 'helper' }))).toBe(false);
        expect(isGraphVisible(item({ id: 'd', deleted_at: '2026-01-01' }))).toBe(false);
    });

    it('hides a note locked by a PIN', () => {
        const locked = item({ id: 'p', metadata: { security_settings: { has_custom_password: true, pwd_salt: 's', pin_hash: 'h', frequency: 'always' } } });
        expect(isGraphVisible(locked)).toBe(false);
    });

    it('treats events like notes for hiding (deleted, tags, locked)', () => {
        expect(isVisibleEvent(item({ id: 'e', type: 'event' }))).toBe(true);
        expect(isVisibleEvent(item({ id: 'e', type: 'event', isGroup: true }))).toBe(false);
        expect(isVisibleEvent(item({ id: 'e', type: 'event', deleted_at: 'x' }))).toBe(false);
    });

    it('linkableIds separates notes (link sources) from everything a link may point to', () => {
        const { noteIds, allIds } = linkableIds([item({ id: 'a' }), item({ id: 'f', type: 'folder' })], [item({ id: 'e', type: 'event' })]);
        expect([...noteIds]).toEqual(['a']);
        expect([...allIds].sort()).toEqual(['a', 'e']);
    });
});
