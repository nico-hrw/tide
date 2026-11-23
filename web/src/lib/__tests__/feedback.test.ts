import { beforeEach, describe, expect, it } from 'vitest';
import { askConfirm, notify, notifyUndo } from '../feedback';
import { useFeedbackStore } from '@/store/useFeedbackStore';

describe('feedback', () => {
    beforeEach(() => useFeedbackStore.setState({ toasts: [], confirm: null, queue: [] }));

    it('resolves askConfirm with the answer and shows the next question afterwards', async () => {
        const first = askConfirm({ title: 'A?', tone: 'danger' });
        const second = askConfirm({ title: 'B?' });
        expect(useFeedbackStore.getState().confirm?.title).toBe('A?');
        expect(useFeedbackStore.getState().queue).toHaveLength(1);

        useFeedbackStore.getState().resolveConfirm(false);
        await expect(first).resolves.toBe(false);
        expect(useFeedbackStore.getState().confirm?.title).toBe('B?');

        useFeedbackStore.getState().resolveConfirm(true);
        await expect(second).resolves.toBe(true);
        expect(useFeedbackStore.getState().confirm).toBeNull();
    });

    it('keeps at most three toasts and gives undo messages more time than plain ones', () => {
        for (let i = 0; i < 5; i++) notify(`m${i}`);
        expect(useFeedbackStore.getState().toasts.map((t) => t.message)).toEqual(['m2', 'm3', 'm4']);
        useFeedbackStore.setState({ toasts: [] });
        notify('plain');
        notifyUndo('gelöscht', () => undefined);
        const [plain, undo] = useFeedbackStore.getState().toasts;
        expect(undo.duration).toBeGreaterThan(plain.duration);
        expect(undo.action?.label).toBe('Rückgängig');
    });
});
