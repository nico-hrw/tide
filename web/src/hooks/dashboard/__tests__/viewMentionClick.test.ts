import { describe, it, expect, vi } from 'vitest';
import { handleViewMentionClick, type ViewMentionClickDeps } from '../viewMentionClick';
import type { SavedView } from '@/lib/viewsStorage';

const view: SavedView = { id: 'v1', name: 'V', tagIds: ['a', 'gone'], untagged: true, viewMode: 'week' };

function makeDeps(views: SavedView[] = [view]) {
    const deps = {
        getView: vi.fn((id: string) => views.find((v) => v.id === id)),
        knownTagIds: new Set(['a']),
        setCalendarTagFilter: vi.fn(),
        setTodoTagFilter: vi.fn(),
        switchTab: vi.fn(),
        navigateTodos: vi.fn(),
        setCalendarViewMode: vi.fn(),
        dispatchMobile: vi.fn(),
    } satisfies ViewMentionClickDeps;
    return deps;
}

describe('handleViewMentionClick', () => {
    it('calendar target: sets both pruned filters, switches to calendar and applies the mode', () => {
        const deps = makeDeps();
        handleViewMentionClick({ viewId: 'v1', target: 'calendar' }, deps);
        const expected = { tagIds: ['a'], untagged: true };
        expect(deps.setCalendarTagFilter).toHaveBeenCalledWith(expected);
        expect(deps.setTodoTagFilter).toHaveBeenCalledWith(expected);
        expect(deps.switchTab).toHaveBeenCalledWith('calendar', 'calendar');
        expect(deps.setCalendarViewMode).toHaveBeenCalledWith('week');
        expect(deps.dispatchMobile).toHaveBeenCalledWith('mobile_apply_view_mode', { mode: 'week' });
        expect(deps.navigateTodos).not.toHaveBeenCalled();
    });

    it('defaults to the calendar target when none is given', () => {
        const deps = makeDeps();
        handleViewMentionClick({ viewId: 'v1' }, deps);
        expect(deps.switchTab).toHaveBeenCalledWith('calendar', 'calendar');
    });

    it('todos target: sets both filters and opens todos without switching the calendar tab', () => {
        const deps = makeDeps();
        handleViewMentionClick({ viewId: 'v1', target: 'todos' }, deps);
        const expected = { tagIds: ['a'], untagged: true };
        expect(deps.setCalendarTagFilter).toHaveBeenCalledWith(expected);
        expect(deps.setTodoTagFilter).toHaveBeenCalledWith(expected);
        expect(deps.navigateTodos).toHaveBeenCalledTimes(1);
        expect(deps.dispatchMobile).toHaveBeenCalledWith('mobile_open_todos');
        expect(deps.switchTab).not.toHaveBeenCalled();
        expect(deps.setCalendarViewMode).not.toHaveBeenCalled();
    });

    it('does nothing for a missing view', () => {
        const deps = makeDeps([]);
        handleViewMentionClick({ viewId: 'v1', target: 'todos' }, deps);
        handleViewMentionClick({ viewId: 'v1', target: 'calendar' }, deps);
        handleViewMentionClick({}, deps);
        expect(deps.setCalendarTagFilter).not.toHaveBeenCalled();
        expect(deps.setTodoTagFilter).not.toHaveBeenCalled();
        expect(deps.switchTab).not.toHaveBeenCalled();
        expect(deps.navigateTodos).not.toHaveBeenCalled();
        expect(deps.dispatchMobile).not.toHaveBeenCalled();
    });
});
