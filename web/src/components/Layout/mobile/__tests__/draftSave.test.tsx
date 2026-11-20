import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MobileOverlaysAndModals, type MobileOverlaysAndModalsProps } from '../MobileOverlaysAndModals';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const at = (h: number, m = 0) => new Date(2026, 10, 20, h, m);
const noop = () => {};

function baseProps(overrides: Partial<MobileOverlaysAndModalsProps>): MobileOverlaysAndModalsProps {
  return {
    isEditingNote: false, activeNoteId: null, activeNoteTitle: '', onCloseEditor: noop,
    isExamsOpen: false, onCloseExams: noop, isSurveysOpen: false, onCloseSurveys: noop,
    isSearchOpen: false, onCloseSearch: noop, searchQuery: '', onSearchQueryChange: noop,
    searchEvents: [], searchTodos: [], searchNotes: [], expandedEvents: [], onSwitchToTodos: noop, onOpenNote: noop,
    isFilterOpen: false, onCloseFilter: noop, selectedPriority: null, onPriorityChange: noop,
    selectedStatus: null, onStatusChange: noop, dateFilter: 'all', onDateFilterChange: noop,
    allTags: [], selectedTag: null, onTagChange: noop,
    selectedEvent: null, onSelectEvent: noop, editingEvent: null, onEditEvent: noop, now: at(11), resolvedThemes: [],
    contextMenu: null, onCloseContextMenu: noop, onNewNote: noop, onStartEditingNote: noop, onStartRename: noop,
    renamingId: null, renameValue: '', onRenameValueChange: noop, onCloseRename: noop,
    isCreateModalOpen: false, createModalMode: 'event', newEventDefaultDate: at(11), activeDate: at(11), onCloseCreateModal: noop,
    isNewEventSheetOpen: false, onCloseNewEventSheet: noop, pinPromptItem: null, onClosePinPrompt: noop,
    ...overrides,
  };
}

const draft = {
  id: '', title: '', color: '#8b5cf6', start: at(14, 10).toISOString(), end: at(15, 10).toISOString(), recurrence: 'none' as const,
};

function setValue(el: HTMLInputElement | HTMLSelectElement, value: string) {
  const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(el, value);
  el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }));
}

describe('saving a draft from the edit form', () => {
  let root: Root;
  let host: HTMLDivElement;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    document.body.innerHTML = '';
  });

  it('creates the event via onNewEvent with recurrence, names it "Neuer Termin" and never calls onEventSave', () => {
    const onNewEvent = vi.fn();
    const onEventSave = vi.fn();
    const onEventUpdate = vi.fn();
    const onNoteRename = vi.fn();
    const onEditEvent = vi.fn();
    act(() => {
      root.render(<MobileOverlaysAndModals {...baseProps({ editingEvent: draft, onNewEvent, onEventSave, onEventUpdate, onNoteRename, onEditEvent, onEventDelete: vi.fn() })} />);
    });

    expect(document.querySelector('[aria-label="Termin löschen"]')).toBeNull();

    const freq = document.querySelector<HTMLSelectElement>('select[aria-label="Wiederholung"]')!;
    act(() => setValue(freq, 'weekly'));
    const form = document.getElementById('edit-event-form') as HTMLFormElement;
    act(() => { form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });

    expect(onEventSave).not.toHaveBeenCalled();
    expect(onEventUpdate).not.toHaveBeenCalled();
    expect(onNoteRename).not.toHaveBeenCalled();
    expect(onNewEvent).toHaveBeenCalledTimes(1);
    const [start, end, meta] = onNewEvent.mock.calls[0];
    expect(start).toEqual(at(14, 10));
    expect(end).toEqual(at(15, 10));
    expect(meta).toMatchObject({ title: 'Neuer Termin', color: '#8b5cf6', recurrence: 'weekly', recurrence_rule: 'FREQ=WEEKLY' });
    expect(onEditEvent).toHaveBeenCalledWith(null);
  });

  it('cancel closes the draft without creating anything', () => {
    const onNewEvent = vi.fn();
    const onEditEvent = vi.fn();
    act(() => { root.render(<MobileOverlaysAndModals {...baseProps({ editingEvent: draft, onNewEvent, onEditEvent })} />); });
    const close = document.querySelector<HTMLButtonElement>('[aria-label="Schließen"]')!;
    act(() => { close.click(); });
    expect(onEditEvent).toHaveBeenCalledWith(null);
    expect(onNewEvent).not.toHaveBeenCalled();
  });
});
