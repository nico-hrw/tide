import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { VisibilityBadge } from '../VisibilityBadge';
import { useDataStore } from '@/store/useDataStore';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  useDataStore.setState({ language: 'de' });
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe('VisibilityBadge', () => {
  it('shows count and label for shared', () => {
    act(() => root.render(<VisibilityBadge kind="shared" count={2} />));
    expect(host.textContent).toContain('2');
    expect(host.querySelector('[aria-label]')?.getAttribute('aria-label')).toContain('Geteilt');
  });
  it('shows no number for private', () => {
    act(() => root.render(<VisibilityBadge kind="private" count={3} />));
    expect(host.textContent).toBe('');
    expect(host.querySelector('[aria-label]')?.getAttribute('aria-label')).toBe('Privat');
  });
});
