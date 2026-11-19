// Fills gaps in index.json with Twemoji static SVGs (no animation): flags and emoji Fluent does not have.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
const require = createRequire(import.meta.url);
const emojibase = require('emojibase-data/en/data.json');
const outDir = process.argv[2];
const twDir = path.join(path.dirname(require.resolve('@twemoji/svg/package.json')));
const indexPath = path.join(outDir, 'index.json');
const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
const cpName = (glyph) => [...glyph.replace(/\uFE0F/g, '')].map((c) => c.codePointAt(0).toString(16)).join('-');
const staticDir = path.join(outDir, 'static');
let added = 0, missing = [];
for (const e of emojibase.flatMap((x) => [x, ...(x.skins || [])])) {
  if (!e.emoji || index[e.emoji]) continue; // skin tones and ZWJ sequences included
  const name = cpName(e.emoji);
  const src = path.join(twDir, `${name}.svg`);
  if (!fs.existsSync(src)) { missing.push(e.label); continue; }
  fs.copyFileSync(src, path.join(staticDir, `${name}.svg`));
  index[e.emoji] = { n: e.label, s: `twemoji/${name}.svg` };
  added++;
}
fs.writeFileSync(indexPath, JSON.stringify(index));
console.log('added', added, 'total', Object.keys(index).length, 'no svg', missing.length, missing.slice(0, 10).join(' | '));
