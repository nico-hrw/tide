import { describe, it, expect } from 'vitest';
import { parseFormula } from '../parser';
import { evaluate, type EvalContext } from '../evaluate';
import { formatResult } from '../format';
import { isErr, type Value } from '../types';

function ctxOf(cells: Record<string, Value> = {}, vars: Record<string, Value> = {}): EvalContext {
  const key = (c: number, r: number) => `${String.fromCharCode(65 + c)}${r + 1}`;
  return {
    cell: (c, r) => cells[key(c, r)] ?? '',
    variable: (name) => vars[name],
    userFunction: () => undefined,
  };
}

const run = (src: string, cells?: Record<string, Value>, vars?: Record<string, Value>) =>
  evaluate(parseFormula(src), ctxOf(cells, vars));

describe('evaluate', () => {
  it('does arithmetic with precedence and percent', () => {
    expect(run('=1+2*3^2')).toBe(19);
    expect(run('=200*10 %')).toBe(20);
    expect(run('=-2^2')).toBe(-4);
  });

  it('SUMME over a range ignores empty and text cells', () => {
    const cells = { B1: 'Betrag', B2: 10, B3: '', B4: 5 };
    expect(run('=SUMME(B1:B4)', cells)).toBe(15);
  });

  it('a non-numeric direct argument gives #WERT', () => {
    expect(run('=SUMME("abc")')).toEqual(expect.objectContaining({ error: '#WERT' }));
    expect(run('="abc"-1')).toEqual(expect.objectContaining({ error: '#WERT' }));
  });

  it('1/0 gives #DIV/0', () => {
    expect(run('=1/0')).toEqual(expect.objectContaining({ error: '#DIV/0' }));
  });

  it('errors propagate from referenced cells', () => {
    const e = run('=A1+1', { A1: { error: '#BEZUG' } });
    expect(isErr(e) && e.error).toBe('#BEZUG');
  });

  it('RMZ matches the annuity formula', () => {
    expect(run('=RMZ(0,039/12; 48; -12000)')).toBeCloseTo(270.412, 2);
    expect(run('=RMZ(0; 10; -1000)')).toBeCloseTo(100, 6);
  });

  it('ZW and BW are inverse to RMZ', () => {
    expect(run('=ZW(0,05; 10; 0; -1000)')).toBeCloseTo(1628.8946, 3);
    const pmt = run('=RMZ(0,039/12; 48; -12000)') as number;
    expect(run(`=BW(0,039/12; 48; ${String(pmt).replace('.', ',')})`)).toBeCloseTo(-12000, 2);
  });

  it('WENN only evaluates the chosen branch', () => {
    expect(run('=WENN(1>0; 5; 1/0)')).toBe(5);
    expect(run('=WENN(1<0; 5; 7)')).toBe(7);
  });

  it('RUNDEN rounds half away from zero', () => {
    expect(run('=RUNDEN(2,345; 2)')).toBe(2.35);
    expect(run('=RUNDEN(-2,5; 0)')).toBe(-3);
  });

  it('english aliases work', () => {
    expect(run('=SUM(1;2;3)')).toBe(6);
    expect(run('=ROUND(1,5)')).toBe(2);
  });

  it('MITTELWERT of nothing gives #DIV/0', () => {
    expect(run('=MITTELWERT(A1:A3)')).toEqual(expect.objectContaining({ error: '#DIV/0' }));
  });

  it('unknown function gives #NAME, unknown variable gives #VAR', () => {
    expect(run('=FOO(1)')).toEqual(expect.objectContaining({ error: '#NAME' }));
    expect(run('=zins*2')).toEqual(expect.objectContaining({ error: '#VAR' }));
  });

  it('resolves variables from context', () => {
    expect(run('=zins*100', {}, { zins: 0.039 })).toBeCloseTo(3.9, 10);
  });

  it('WURZEL of a negative gives #WERT', () => {
    expect(run('=WURZEL(-4)')).toEqual(expect.objectContaining({ error: '#WERT' }));
  });

  it('a huge range gives #BEZUG instead of hanging', () => {
    expect(run('=SUMME(A1:ZZ99999)')).toEqual(expect.objectContaining({ error: '#BEZUG' }));
  });
});

describe('formatResult', () => {
  it('formats numbers German style with up to 4 decimals', () => {
    expect(formatResult(12000.5)).toBe('12.000,5');
    expect(formatResult(0.123456)).toBe('0,1235');
    expect(formatResult(3)).toBe('3');
    expect(formatResult(-0)).toBe('0');
  });
  it('shows error codes and strings', () => {
    expect(formatResult({ error: '#VAR' })).toBe('#VAR');
    expect(formatResult('abc')).toBe('abc');
    expect(formatResult(NaN)).toBe('#WERT');
  });

  it('concatenates with & (left-associative, numbers German-formatted)', () => {
    expect(run('="hallo"&" "&"welt"')).toBe('hallo welt');
    expect(run('=2&3')).toBe('23');
    expect(run('=1,5&"€"')).toBe('1,5€');
  });

  it('& binds weaker than + and stronger than comparisons', () => {
    expect(run('="a"&1+2')).toBe('a3');
    expect(run('="a"&"b"="ab"')).toBe(1);
  });

  it('+ concatenates when an operand is non-numeric text, else adds', () => {
    expect(run('="a"+SUMME(1;2)')).toBe('a3');
    expect(run('="x"+1')).toBe('x1');
    expect(run('=1+2')).toBe(3);
    expect(run('="5"+3')).toBe(8);
  });

  it('empty cells concatenate as empty text', () => {
    expect(run('=A1&"x"')).toBe('x');
    expect(run('=A1+"x"')).toBe('x');
  });

  it('errors propagate through concatenation', () => {
    expect(run('="a"&(1/0)')).toEqual(expect.objectContaining({ error: '#DIV/0' }));
    const e = run('="a"&A1', { A1: { error: '#BEZUG' } });
    expect(isErr(e) && e.error).toBe('#BEZUG');
  });

  it('string comparison is unchanged', () => {
    expect(run('="a"="a"')).toBe(1);
    expect(run('="a"="b"')).toBe(0);
  });

  it('other operators stay numeric only', () => {
    expect(run('="a"-1')).toEqual(expect.objectContaining({ error: '#WERT' }));
    expect(run('="a"*2')).toEqual(expect.objectContaining({ error: '#WERT' }));
  });

  it('blank cells keep + numeric', () => {
    expect(run('=A1+B1')).toBe(0);
    expect(run('=A1+5')).toBe(5);
    expect(run('=A1+1/3')).toBeCloseTo(1 / 3, 10);
    expect(run('=A1+"x"')).toBe('x');
    // both operands empty text: numeric path exactly as before
    expect(run('=""+""')).toBe(0);
  });

  it('caps concatenated text at 32767 characters', () => {
    const big = 'a'.repeat(20000);
    expect(run('=A1&A1', { A1: big })).toEqual(expect.objectContaining({ error: '#WERT', detail: 'Text zu lang' }));
    expect(run('=A1+A1', { A1: big })).toEqual(expect.objectContaining({ error: '#WERT', detail: 'Text zu lang' }));
    const ok = run('=A1&B1', { A1: 'a'.repeat(32000), B1: 'b'.repeat(767) });
    expect(typeof ok === 'string' && ok.length).toBe(32767);
    expect(run('=A1&B1', { A1: 'a'.repeat(32000), B1: 'b'.repeat(768) })).toEqual(expect.objectContaining({ error: '#WERT' }));
  });
});
