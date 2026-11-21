import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import NoteHeaderActions from '../NoteHeaderActions';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function render(isOwner: boolean, isA4 = false) {
  act(() => {
    root.render(
      <NoteHeaderActions
        isOwner={isOwner}
        isA4={isA4}
        historyLabel={<span>Zuletzt bearbeitet</span>}
        actions={<button type="button">Teilen</button>}
      />,
    );
  });
}

describe('NoteHeaderActions', () => {
  it('owner: history row comes before the actions row', () => {
    render(true);
    const history = container.querySelector('[data-testid="note-history-row"]');
    const actions = container.querySelector('[data-testid="note-actions-row"]');
    expect(history).not.toBeNull();
    expect(actions).not.toBeNull();
    expect(history!.compareDocumentPosition(actions!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('non-owner: no history row, actions row stays', () => {
    render(false);
    expect(container.querySelector('[data-testid="note-history-row"]')).toBeNull();
    expect(container.querySelector('[data-testid="note-actions-row"]')).not.toBeNull();
    expect(container.textContent).not.toContain('Zuletzt bearbeitet');
  });
});

describe('NoteHeaderActions wrapper classes', () => {
  it('A4 hangs in the top margin on desktop', () => {
    render(true, true);
    const cls = container.firstElementChild!.className;
    expect(cls).toContain('lg:absolute');
    expect(cls).toContain('lg:bottom-full');
    expect(cls).toContain('lg:right-0');
  });

  it('non-A4 stays in flow; non-owner A4 keeps the actions row only', () => {
    render(true, false);
    expect(container.firstElementChild!.className).not.toContain('lg:absolute');
    render(false, true);
    expect(container.querySelector('[data-testid="note-history-row"]')).toBeNull();
    expect(container.firstElementChild!.className).toContain('lg:right-0');
  });
});
