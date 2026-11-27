import { describe, expect, it } from 'vitest';
import { selectTags, splitTagsByWorkspace, tagSafe } from '@/lib/tags';
import { workspaceBadgeText } from '@/lib/workspaceBadge';
import type { DataItem } from '@/store/slices/types';

describe('workspace tags and badges', () => {
    it('reads safe from item or metadata and defaults to main', () => {
        const items = [
            { id: '1', title: 'Alltag', type: 'folder', isGroup: true },
            { id: '2', title: 'Vorlesung', type: 'folder', isGroup: true, safe: 'Uni' },
            { id: '3', title: 'Labor', type: 'folder', isGroup: true, metadata: { safe: 'Standard' } },
        ] as unknown as DataItem[];
        expect(selectTags(items).map((t) => [t.id, tagSafe(t)])).toEqual([
            ['1', 'main'],
            ['2', 'Uni'],
            ['3', 'main'],
        ]);
    });

    it('splits tags into active-workspace local and external lists', () => {
        const tags = [
            { id: '1', title: 'Alltag', safe: 'main' },
            { id: '2', title: 'Klausur', safe: 'Uni' },
            { id: '3', title: 'Sport', safe: 'Privat' },
        ];
        const split = splitTagsByWorkspace(tags, ['Uni']);
        expect(split.local.map((t) => t.id)).toEqual(['2']);
        expect(split.external.map((t) => t.id)).toEqual(['1', '3']);
    });

    it('uses custom icon when configured and falls back to initial letter', () => {
        expect(workspaceBadgeText('main')).toBe('S');
        expect(workspaceBadgeText('Uni')).toBe('U');
        expect(workspaceBadgeText('Uni', { Uni: '🎓' })).toBe('🎓');
        expect(workspaceBadgeText('main', { main: '🏠' })).toBe('🏠');
        expect(workspaceBadgeText('Uni', { Uni: '   ' })).toBe('U');
    });
});
