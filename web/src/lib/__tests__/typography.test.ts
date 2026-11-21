import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const SRC = path.join(process.cwd(), 'src');

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === '__tests__' || e.name === 'node_modules') continue;
      walk(p, out);
    } else if (/\.(tsx?|css)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) {
      out.push(p);
    }
  }
  return out;
}

function lum(hex: string): number {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
function readSrc(rel: string): string {
  return fs.readFileSync(path.join(SRC, rel), 'utf8');
}
/** Hex value of --t2-ink-3 / --t2-bg inside the n-th block that defines it. */
function varOf(css: string, name: string, n: number): string {
  const re = new RegExp(`${name}:\\s*(#[0-9A-Fa-f]{6})`, 'g');
  const m = [...css.matchAll(re)];
  return m[n][1];
}

describe('typography', () => {
  it('uses no text sizes below 11px', () => {
    const offenders = walk(SRC).filter((f) =>
      /text-\[(8|9|10)px\]/.test(fs.readFileSync(f, 'utf8'))
      || (f.endsWith('.css') && /font-size:\s*(8|9|10)px/.test(fs.readFileSync(f, 'utf8'))));
    expect(offenders.map((f) => path.relative(SRC, f))).toEqual([]);
  });

  it('uses no inline font sizes below 11px in ts/tsx', () => {
    const re = /fontSize:\s*['"]?(8|9|10)(px)?\b|font-size:\s*(8|9|10)px/;
    const offenders = walk(SRC)
      .filter((f) => /\.tsx?$/.test(f) && re.test(fs.readFileSync(f, 'utf8')));
    expect(offenders.map((f) => path.relative(SRC, f))).toEqual([]);
  });

  it('light --t2-ink-3 has >= 4.5:1 contrast on white', () => {
    const css = readSrc('app/globals.css');
    expect(contrast(varOf(css, '--t2-ink-3', 0), '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
  });

  it('dark --t2-ink-3 has >= 4.5:1 contrast on its surfaces', () => {
    const css = readSrc('app/globals.css');
    const ink = varOf(css, '--t2-ink-3', 1);
    expect(contrast(ink, varOf(css, '--t2-bg', 1))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(ink, varOf(css, '--t2-surface', 1))).toBeGreaterThanOrEqual(4.5);
  });

  it('palette --t2-ink-3 overrides have >= 4.5:1 contrast on their bg and surface', () => {
    const css = readSrc('app/palettes.css');
    for (let i = 0; i < 4; i++) {
      const ink = varOf(css, '--t2-ink-3', i);
      expect(contrast(ink, varOf(css, '--t2-bg', i))).toBeGreaterThanOrEqual(4.5);
      expect(contrast(ink, varOf(css, '--t2-surface', i))).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('layout loads Inter via next/font/google and attaches the variable to <html>', () => {
    const layout = readSrc('app/layout.tsx');
    expect(layout).toMatch(/from\s+["']next\/font\/google["']/);
    expect(layout).toMatch(/Inter\s*\(/);
    expect(layout).toMatch(/variable:\s*["']--font-inter["']/);
    expect(layout).toMatch(/<html[^>]*className=\{[^}]*\.variable/);
  });

  it('--font-sans starts with the loaded Inter variable and body smooths fonts', () => {
    const css = readSrc('app/globals.css');
    expect(css).toMatch(/--font-sans:\s*var\(--font-inter\)/);
    expect(css).toMatch(/-webkit-font-smoothing:\s*antialiased/);
    expect(css).toMatch(/text-rendering:\s*optimizeLegibility/);
  });
});
