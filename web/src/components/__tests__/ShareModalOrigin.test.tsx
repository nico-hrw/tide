import { describe, it, expect, beforeEach, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

vi.mock('@/lib/api', () => ({ apiFetch: vi.fn() }));
vi.mock('@/lib/feedback', () => ({ notify: vi.fn(), notifyError: vi.fn(), askConfirm: vi.fn() }));

import { useDataStore } from '@/store/useDataStore';
import { useMentionShareStore } from '@/store/useMentionShareStore';
import { useCalendarShareStore } from '@/store/useCalendarShareStore';
import { SharePeopleList, type SharePerson } from '../Share/SharePeopleList';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const people: SharePerson[] = [
    { user_id: 'anna', status: 'accepted', permission: 'view', username: 'Anna' },
    { user_id: 'ben', status: 'accepted', permission: 'edit', username: 'Ben' },
    { user_id: 'cy', status: 'pending', permission: 'share', username: 'Cy' },
    { user_id: 'eli', status: 'accepted', permission: 'edit', can_reshare: true, username: 'Eli' },
    { user_id: 'dora', status: 'accepted', permission: 'view', username: 'Dora' },
];

function render(props: Partial<React.ComponentProps<typeof SharePeopleList>> = {}) {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    const onRoleChange = vi.fn();
    act(() => root.render(
        <SharePeopleList
            fileId="f1"
            shares={people}
            isOwner
            groupIds={['g1']}
            groupTitles={{ g1: 'Arbeit' }}
            onRoleChange={onRoleChange}
            onRevoke={vi.fn()}
            {...props}
        />,
    ));
    return { host, onRoleChange };
}
const row = (name: string) => [...document.querySelectorAll('li')].find((li) => li.textContent?.includes(name)) as HTMLElement;

beforeEach(() => {
    document.body.innerHTML = '';
    localStorage.clear();
    useDataStore.setState({ myId: 'me', language: 'de' } as never);
    useMentionShareStore.setState({ userId: null, entries: {} } as never);
    useMentionShareStore.getState().record('f1', 'anna');
    useCalendarShareStore.setState({
        userId: 'me', status: 'ready', loadedAt: Date.now(),
        rules: { g1: { groupId: 'g1', recipients: [{ userId: 'ben', permission: 'edit' }, { userId: 'anna', permission: 'view' }], autoShareNew: true } },
    });
});

describe('SharePeopleList origin', () => {
    it('shows the mention origin and the calendar origin joined, and nothing for others', () => {
        render();
        expect(row('Anna').textContent).toContain('Über @-Erwähnung · Aus Kalender „Arbeit“');
        expect(row('Ben').textContent).toContain('Aus Kalender „Arbeit“');
        expect(row('Ben').textContent).not.toContain('@-Erwähnung');
        expect(row('Dora').textContent).not.toContain('Über');
        expect(row('Dora').textContent).not.toContain('Aus Kalender');
    });
    it('does not use a calendar rule when the item is not in that group', () => {
        render({ groupIds: [] });
        expect(row('Ben').textContent).not.toContain('Aus Kalender');
    });
    it('lists the owner first', () => {
        render();
        expect(document.querySelectorAll('li')[0].textContent).toContain('Du · Besitzer');
    });
});

describe('SharePeopleList rights', () => {
    it('offers only Ansehen and Bearbeiten for normal rows', () => {
        render();
        const select = row('Anna').querySelector('select') as HTMLSelectElement;
        expect([...select.options].map((o) => o.textContent)).toEqual(['Ansehen', 'Bearbeiten']);
    });
    it('keeps a legacy share row visible as Vollzugriff, not checked, without any reshare control', () => {
        const { onRoleChange } = render();
        const select = row('Cy').querySelector('select') as HTMLSelectElement;
        expect(select.value).toBe('share');
        expect([...select.options].map((o) => o.textContent)).toEqual(['Ansehen', 'Bearbeiten', 'Vollzugriff']);
        expect(row('Cy').querySelector('input[type=checkbox]')).toBeNull();
        expect(onRoleChange).not.toHaveBeenCalled();
    });
    it('maps the dropdown to the existing permission values', () => {
        const { onRoleChange } = render();
        const select = row('Cy').querySelector('select') as HTMLSelectElement;
        act(() => { select.value = 'view'; select.dispatchEvent(new Event('change', { bubbles: true })); });
        expect(onRoleChange).toHaveBeenCalledWith('cy', 'view');
    });
    it('shows can_reshare read-only: checked, disabled, with the invite hint', () => {
        const { onRoleChange } = render();
        const box = row('Eli').querySelector('input[type=checkbox]') as HTMLInputElement;
        expect(box.checked).toBe(true);
        expect(box.disabled).toBe(true);
        expect(row('Eli').textContent).toContain('Wurde beim Einladen festgelegt');
        expect(onRoleChange).not.toHaveBeenCalled();
    });
    it('plain edit row has no reshare control and never sends permission share', () => {
        const { onRoleChange } = render();
        expect(row('Ben').querySelector('input[type=checkbox]')).toBeNull();
        expect(row('Ben').textContent).not.toContain('Darf weiterteilen');
        expect(onRoleChange).not.toHaveBeenCalledWith('ben', 'share');
    });
    it('non-owner sees no editing controls', () => {
        render({ isOwner: false });
        expect(document.querySelector('select')).toBeNull();
        expect(document.querySelector('input')).toBeNull();
        expect(document.querySelector('button')).toBeNull();
        expect(row('Anna').textContent).toContain('Ansehen');
    });
});
