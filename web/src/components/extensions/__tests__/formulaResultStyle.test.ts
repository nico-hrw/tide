import { describe, it, expect } from 'vitest';
import { resultStyleFromMarks } from '../formulaResultStyle';

const m = (name: string, attrs: Record<string, unknown> = {}) => ({ type: { name }, attrs });

describe('resultStyleFromMarks', () => {
  it('maps bold and italic', () => {
    expect(resultStyleFromMarks([m('bold')])).toBe('font-weight:700');
    expect(resultStyleFromMarks([m('italic')])).toBe('font-style:italic');
  });

  it('maps textStyle color and fontSize', () => {
    expect(resultStyleFromMarks([m('textStyle', { color: '#d33', fontSize: '14px' })])).toBe('color:#d33;font-size:14px');
  });

  it('maps highlight color, with a default for a bare highlight', () => {
    expect(resultStyleFromMarks([m('highlight', { color: '#ff0' })])).toBe('background-color:#ff0');
    expect(resultStyleFromMarks([m('highlight', { color: null })])).toBe('background-color:#ffff00');
  });

  it('combines underline and strike into one text-decoration', () => {
    expect(resultStyleFromMarks([m('underline')])).toBe('text-decoration:underline');
    expect(resultStyleFromMarks([m('strike')])).toBe('text-decoration:line-through');
    expect(resultStyleFromMarks([m('strike'), m('underline')])).toBe('text-decoration:underline line-through');
  });

  it('drops unsafe colors', () => {
    for (const bad of ['red;background:url(x)', 'url(javascript:alert(1))', 'expression(alert(1))', '#fff;position:fixed']) {
      expect(resultStyleFromMarks([m('textStyle', { color: bad })])).toBe('');
      expect(resultStyleFromMarks([m('highlight', { color: bad })])).toBe('');
    }
  });

  it('drops unsafe font sizes', () => {
    expect(resultStyleFromMarks([m('textStyle', { fontSize: '14px;color:red' })])).toBe('');
    expect(resultStyleFromMarks([m('textStyle', { fontSize: 'calc(1px)' })])).toBe('');
    expect(resultStyleFromMarks([m('textStyle', { fontSize: '1.5rem' })])).toBe('font-size:1.5rem');
  });

  it('returns empty for no or unknown marks', () => {
    expect(resultStyleFromMarks([])).toBe('');
    expect(resultStyleFromMarks([m('link', { href: 'x' }), m('code')])).toBe('');
  });

  it('has a stable order: weight, style, decoration, color, size, background', () => {
    const style = resultStyleFromMarks([
      m('highlight', { color: '#ff0' }),
      m('textStyle', { color: '#d33', fontSize: '14px' }),
      m('underline'),
      m('italic'),
      m('bold'),
    ]);
    expect(style).toBe('font-weight:700;font-style:italic;text-decoration:underline;color:#d33;font-size:14px;background-color:#ff0');
  });
});
