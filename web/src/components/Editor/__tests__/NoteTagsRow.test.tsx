import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { NoteTagsRow } from '../NoteTagsRow';
import { useDataStore } from '@/store/useDataStore';

const setNoteTags = vi.fn(async () => {});
vi.mock('@/hooks/dashboard/useNoteTags', () => ({
  useNoteTags: () => ({ setNoteTags }),
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const tag = (id: string, title: string) => ({ id, title, type: 'folder', isGroup: true, owner_id: 'me' });

let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  setNoteTags.mockClear();
  useDataStore.setState({
    myId: 'me',
    notes: [
      tag('a', 'Arbeit'),
      tag('b', 'Privat'),
      { id: 'n1', title: 'N', type: 'note', owner_id: 'me', tagIds: ['a', 'gone'] },
    ],
  } as never);
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const chips = () => Array.from(host.querySelectorAll('[data-tag-chip]')).map((c) => c.textContent?.trim());

describe('NoteTagsRow', () => {
  it('shows the known tags of the note as chips for the owner', () => {
    act(() => root.render(<NoteTagsRow noteId="n1" isOwner />));
    expect(chips()).toEqual(['Arbeit']);
    expect(host.querySelector('button[aria-label="Tag hinzufügen"]')).not.toBeNull();
  });

  it('adds a tag via the picker and drops unknown ids', () => {
    act(() => root.render(<NoteTagsRow noteId="n1" isOwner />));
    act(() => { (host.querySelector('button[aria-label="Tag hinzufügen"]') as HTMLButtonElement).click(); });
    act(() => {
      (Array.from(document.querySelectorAll('[role="option"]')).find((o) => o.textContent?.includes('Privat')) as HTMLElement).click();
    });
    expect(setNoteTags).toHaveBeenCalledWith('n1', ['a', 'b']);
  });

  it('removes a tag via the chip', () => {
    act(() => root.render(<NoteTagsRow noteId="n1" isOwner />));
    act(() => { (host.querySelector('button[aria-label="Tag entfernen: Arbeit"]') as HTMLButtonElement).click(); });
    expect(setNoteTags).toHaveBeenCalledWith('n1', []);
  });

  it('renders nothing for a non-owner', () => {
    act(() => root.render(<NoteTagsRow noteId="n1" isOwner={false} />));
    expect(host.innerHTML).toBe('');
  });
});
