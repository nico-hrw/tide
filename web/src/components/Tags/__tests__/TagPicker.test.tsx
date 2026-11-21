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
async function pressEnter(input: HTMLInputElement) {
  await act(async () => {
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  });
}

describe('TagPicker', () => {
  it('chip click selects the tag id', () => {
    const onChange = vi.fn();
    act(() => root.render(
      <TagPicker tags={TAGS} value={[]} onChange={onChange} onCreate={async () => undefined} />,
    ));
    const chip = Array.from(host.querySelectorAll('button')).find((b) => b.textContent?.includes('Arbeit'))!;
    act(() => chip.click());
    expect(onChange).toHaveBeenCalledWith(['a']);
  });

  it('chip click deselects a selected tag', () => {
    const onChange = vi.fn();
    act(() => root.render(
      <TagPicker tags={TAGS} value={['a', 'b']} onChange={onChange} onCreate={async () => undefined} />,
    ));
    const chip = Array.from(host.querySelectorAll('button')).find((b) => b.textContent?.includes('Arbeit'))!;
    act(() => chip.click());
    expect(onChange).toHaveBeenCalledWith(['b']);
  });

  it('whitespace input + Enter does not call onCreate', async () => {
    const onCreate = vi.fn(async () => 'x');
    act(() => root.render(
      <TagPicker tags={TAGS} value={[]} onChange={() => {}} onCreate={onCreate} />,
    ));
    const input = host.querySelector('input')!;
    setInput(input, '   ');
    await pressEnter(input);
    expect(onCreate).not.toHaveBeenCalled();
  });

  it('"Reise" + Enter creates the tag and adds the returned id', async () => {
    const onCreate = vi.fn(async () => 'new-id');
    const onChange = vi.fn();
    act(() => root.render(
      <TagPicker tags={TAGS} value={['a']} onChange={onChange} onCreate={onCreate} />,
    ));
    const input = host.querySelector('input')!;
    setInput(input, ' Reise ');
    await pressEnter(input);
    expect(onCreate).toHaveBeenCalledTimes(1);
    expect(onCreate).toHaveBeenCalledWith('Reise');
    expect(onChange).toHaveBeenCalledWith(['a', 'new-id']);
    expect(input.value).toBe('');
  });

  it('keeps the input text when creation returns undefined', async () => {
    const onChange = vi.fn();
    act(() => root.render(
      <TagPicker tags={TAGS} value={[]} onChange={onChange} onCreate={async () => undefined} />,
    ));
    const input = host.querySelector('input')!;
    setInput(input, 'Reise');
    await pressEnter(input);
    expect(onChange).not.toHaveBeenCalled();
    expect(input.value).toBe('Reise');
  });

  it('guards against double submit while in flight', async () => {
    let resolve: (id: string) => void = () => {};
    const onCreate = vi.fn(() => new Promise<string>((r) => { resolve = r; }));
    act(() => root.render(
      <TagPicker tags={TAGS} value={[]} onChange={() => {}} onCreate={onCreate} />,
    ));
    const input = host.querySelector('input')!;
    setInput(input, 'Reise');
    await pressEnter(input);
    await pressEnter(input);
    expect(onCreate).toHaveBeenCalledTimes(1);
    await act(async () => resolve('id'));
  });

  it('has no "Ohne Tag" chip', () => {
    act(() => root.render(
      <TagPicker tags={TAGS} value={[]} onChange={() => {}} onCreate={async () => undefined} />,
    ));
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
