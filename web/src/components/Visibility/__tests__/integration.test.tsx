import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { HighlightProvider } from '@/components/HighlightContext';
import { FileItem } from '@/components/Layout/sidebar/FileItem';
import SaveStatusMenu from '@/components/Editor/SaveStatusMenu';
import type { DecryptedFile } from '@/components/Layout/sidebar/types';
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

const noop = vi.fn();
function renderFile(file: Partial<DecryptedFile>, myId = 'me') {
  const full = { id: 'f1', title: 'Notiz', type: 'note', visibility: 'private', ...file } as DecryptedFile;
  act(() => root.render(
    <HighlightProvider>
      <FileItem file={full} level={0} myId={myId} onSelect={noop} onDelete={noop} onRename={noop}
        onVisibility={noop} onShare={noop} onDragStart={noop} onContextMenu={noop} />
    </HighlightProvider>,
  ));
}
const label = () => host.querySelector('[aria-label]')?.getAttribute('aria-label');

describe('FileItem visibility badge', () => {
  it('shows Privat for an own private note', () => {
    renderFile({ owner_id: 'me' });
    expect(label()).toBe('Privat');
  });
  it('shows Geteilt for an own shared note', () => {
    renderFile({ owner_id: 'me', share_status: 'shared' });
    expect(label()).toBe('Geteilt');
  });
  it('shows Mit mir geteilt for a recipient', () => {
    renderFile({ owner_id: 'other' });
    expect(label()).toBe('Mit mir geteilt');
  });
});

describe('SaveStatusMenu visibility badge', () => {
  it('shows the badge next to the share status text', () => {
    const props = { fileId: 'f1', saveStatus: 'saved' as const, isProtected: false, onClose: noop, onOpenShare: noop, onOpenSecurity: noop };
    act(() => root.render(<SaveStatusMenu {...props} visibility="private" isShared={false} isSharedByOwner={false} isRecipient={true} />));
    expect(host.querySelector('[aria-label="Mit mir geteilt"]')).not.toBeNull();
    expect(host.textContent).toContain('Geteilt mit dir');
  });
});

describe('badge colour and helper', () => {
  it('inherits colour by default and accepts a class override', async () => {
    const { VisibilityBadge } = await import('../VisibilityBadge');
    act(() => root.render(<VisibilityBadge kind="private" />));
    expect(host.querySelector('[aria-label]')?.className).toContain('text-current');
    act(() => root.render(<VisibilityBadge kind="private" className="text-t2-ink-2" />));
    expect(host.querySelector('[aria-label]')?.className).toContain('text-t2-ink-2');
  });
  it('isShared flag yields shared without a count', async () => {
    const { getVisibilityState } = await import('../visibilityState');
    expect(getVisibilityState({ isOwner: true, isShared: true })).toEqual({ kind: 'shared', count: 0 });
  });
});
