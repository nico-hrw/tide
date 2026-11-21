import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { TagPicker } from '../TagPicker';
import { NoTagConfirm } from '../NoTagConfirm';
import type { Tag } from '@/lib/tags';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const tag = (id: string, title: string, color?: string): Tag => ({ id, title, color } as Tag);
const TAGS = [tag('a', 'Arbeit', '#ff0000'), tag('b', 'Privat')];

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
});

function setInput(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  act(() => {
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
async function press(el: Element, key: string) {
  await act(async () => {
    el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
  });
}
const addButton = () => host.querySelector('button[aria-label="Tag hinzufügen"]') as HTMLButtonElement;
const listbox = () => document.querySelector('[role="listbox"]');
const searchInput = () => document.querySelector('[role="listbox"] input') as HTMLInputElement;
const options = () => Array.from(document.querySelectorAll('[role="option"]')) as HTMLElement[];
function open() {
  act(() => addButton().click());
}
type CreateFn = (title: string) => Promise<string | undefined>;
function render(props: { tags?: Tag[]; value?: string[]; onCreate?: CreateFn } = {}) {
  const onChange = vi.fn();
  const defaultCreate = vi.fn<CreateFn>(async () => undefined);
  const onCreate = props.onCreate ?? defaultCreate;
  act(() => root.render(
    <TagPicker tags={props.tags ?? TAGS} value={props.value ?? []} onChange={onChange} onCreate={onCreate} />,
  ));
  return { onChange, onCreate };
}

describe('TagPicker', () => {
  it('renders selected tags as chips in selection order with a remove button', () => {
    const { onChange } = render({ value: ['b', 'a'] });
    const chips = Array.from(host.querySelectorAll('[data-tag-chip]'));
    expect(chips.map((c) => c.textContent)).toEqual(['Privat', 'Arbeit']);
    const remove = host.querySelector('button[aria-label="Tag entfernen: Privat"]') as HTMLButtonElement;
    act(() => remove.click());
    expect(onChange).toHaveBeenCalledWith(['a']);
  });

  it('does not render unselected tags before opening', () => {
    render();
    expect(host.textContent).not.toContain('Arbeit');
    expect(listbox()).toBeNull();
  });

  it('+ Tag opens and closes the listbox', () => {
    render();
    expect(addButton().getAttribute('aria-expanded')).toBe('false');
    open();
    expect(listbox()).not.toBeNull();
    expect(addButton().getAttribute('aria-expanded')).toBe('true');
    expect(options().map((o) => o.textContent)).toEqual(['Arbeit', 'Privat']);
    open();
    expect(listbox()).toBeNull();
  });

  it('search filters the rows', () => {
    render();
    open();
    setInput(searchInput(), 'pri');
    expect(options().map((o) => o.textContent)).toEqual(['Privat', 'Neu anlegen »pri«']);
  });

  it('row click toggles in selection order and keeps the panel open', () => {
    const { onChange } = render({ value: ['b'] });
    open();
    act(() => options().find((o) => o.textContent === 'Arbeit')!.click());
    expect(onChange).toHaveBeenCalledWith(['b', 'a']);
    act(() => options().find((o) => o.textContent === 'Privat')!.click());
    expect(onChange).toHaveBeenLastCalledWith([]);
    expect(listbox()).not.toBeNull();
  });

  it('marks selected rows with aria-selected', () => {
    render({ value: ['a'] });
    open();
    expect(options().map((o) => o.getAttribute('aria-selected'))).toEqual(['true', 'false']);
  });

  it('create row appears only when canCreateTag', () => {
    render();
    open();
    setInput(searchInput(), 'Reise');
    expect(options().some((o) => o.textContent === 'Neu anlegen »Reise«')).toBe(true);
    setInput(searchInput(), ' arbeit ');
    expect(options().some((o) => o.textContent?.startsWith('Neu anlegen'))).toBe(false);
  });

  it('whitespace-only query never shows the create row nor calls onCreate', async () => {
    const { onCreate } = render();
    open();
    setInput(searchInput(), '   ');
    expect(options().some((o) => o.textContent?.startsWith('Neu anlegen'))).toBe(false);
    await press(searchInput(), 'Enter');
    expect(onCreate).not.toHaveBeenCalled();
  });

  it('"Reise" + Enter creates once and appends the returned id', async () => {
    const onCreate = vi.fn<CreateFn>(async () => 'new-id');
    const { onChange } = render({ value: ['a'], onCreate });
    open();
    setInput(searchInput(), ' Reise ');
    await press(searchInput(), 'Enter');
    expect(onCreate).toHaveBeenCalledTimes(1);
    expect(onCreate).toHaveBeenCalledWith('Reise');
    expect(onChange).toHaveBeenCalledWith(['a', 'new-id']);
    expect(searchInput().value).toBe('');
  });

  it('clicking the create row creates the tag', async () => {
    const onCreate = vi.fn<CreateFn>(async () => 'x');
    render({ onCreate });
    open();
    setInput(searchInput(), 'Reise');
    await act(async () => options().find((o) => o.textContent === 'Neu anlegen »Reise«')!.click());
    expect(onCreate).toHaveBeenCalledWith('Reise');
  });

  it('keeps the text when creation returns undefined', async () => {
    const { onChange } = render();
    open();
    setInput(searchInput(), 'Reise');
    await press(searchInput(), 'Enter');
    expect(onChange).not.toHaveBeenCalled();
    expect(searchInput().value).toBe('Reise');
  });

  it('two quick Enters call onCreate only once', async () => {
    let resolve: (id: string) => void = () => {};
    const onCreate = vi.fn<CreateFn>(() => new Promise<string | undefined>((r) => { resolve = r; }));
    render({ onCreate });
    open();
    setInput(searchInput(), 'Reise');
    await press(searchInput(), 'Enter');
    await press(searchInput(), 'Enter');
    expect(onCreate).toHaveBeenCalledTimes(1);
    await act(async () => resolve('id'));
  });

  it('arrow keys move the active option and Enter toggles it', async () => {
    const { onChange } = render();
    open();
    await press(searchInput(), 'ArrowDown');
    await press(searchInput(), 'ArrowDown');
    expect(options()[1].getAttribute('data-active')).toBe('true');
    await press(searchInput(), 'Enter');
    expect(onChange).toHaveBeenCalledWith(['b']);
  });

  it('Enter with a single filtered result and no active row toggles it', async () => {
    const { onChange } = render();
    open();
    setInput(searchInput(), 'arb');
    await press(searchInput(), 'Enter');
    expect(onChange).toHaveBeenCalledWith(['a']);
  });

  it('Escape closes and refocuses the button', async () => {
    render();
    open();
    await press(searchInput(), 'Escape');
    expect(listbox()).toBeNull();
    expect(document.activeElement).toBe(addButton());
  });

  it('mousedown outside closes', () => {
    render();
    open();
    act(() => {
      document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    });
    expect(listbox()).toBeNull();
  });

  it('mousedown inside the panel does not close', () => {
    render();
    open();
    act(() => {
      searchInput().dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    });
    expect(listbox()).not.toBeNull();
  });

  it('shows the empty hint when no tags exist and the query is empty', () => {
    render({ tags: [] });
    open();
    expect(document.body.textContent).toContain('Noch keine Tags – tippe einen Namen zum Anlegen');
  });

  it('has no "Ohne Tag" chip', () => {
    render();
    expect(host.textContent).not.toContain('Ohne Tag');
  });
});

describe('NoTagConfirm', () => {
  it('shows the exact text and fires both callbacks', () => {
    const onConfirm = vi.fn();
    const onChoose = vi.fn();
    act(() => root.render(<NoTagConfirm onConfirm={onConfirm} onChoose={onChoose} />));
    expect(host.textContent).toContain('Ohne Tag speichern?');
    const buttons = Array.from(host.querySelectorAll('button'));
    const confirm = buttons.find((b) => b.textContent === 'Ohne Tag speichern')!;
    const choose = buttons.find((b) => b.textContent === 'Tag wählen')!;
    act(() => confirm.click());
    act(() => choose.click());
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onChoose).toHaveBeenCalledTimes(1);
  });
});
