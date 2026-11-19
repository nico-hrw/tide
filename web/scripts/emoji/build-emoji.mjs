// Builds web/public/emoji/index.json (glyph -> Fluent names and paths) and downloads the static SVGs.
// Sources: emojibase-data (glyphs + CLDR names), microsoft/fluentui-emoji (Color SVG),
// microsoft/fluentui-emoji-animated (APNG). Run from the scratchpad folder: node build-emoji.mjs <webPublicEmojiDir>
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
const emojibase = require('emojibase-data/en/data.json');
const outDir = process.argv[2];
if (!outDir) throw new Error('usage: node build-emoji.mjs <publicEmojiDir>');

const gh = async (url) => {
  const res = await fetch(url, { headers: { 'User-Agent': 'emoji-index-build' } });
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  return res.json();
};

async function tree(repo) {
  const data = await gh(`https://api.github.com/repos/${repo}/git/trees/main?recursive=1`);
  if (data.truncated) console.warn(`${repo}: tree truncated`);
  return data.tree.filter((t) => t.type === 'blob').map((t) => t.path);
}

const staticFiles = await tree('microsoft/fluentui-emoji');
const animatedFiles = await tree('microsoft/fluentui-emoji-animated');

// Folder name (e.g. "Thumbs up") -> file paths
const byName = new Map();
const add = (p, kind) => {
  const parts = p.split('/');
  if (parts[0] !== 'assets' || parts.length < 4) return;
  const name = parts[1];
  const key = name.toLowerCase();
  const entry = byName.get(key) ?? { name };
  // Default look only: assets/<Name>/Color/<file> (or Default/Color). Skin tones and dark variants are skipped.
  const seg = parts[2];
  const inDefault = seg === 'Color' || seg === 'animated' || (seg === 'Default' && (parts[3] === 'Color' || parts[3] === 'animated'));
  if (kind === 'static' && inDefault && parts.includes('Color') && p.endsWith('.svg') && !entry.s) entry.s = p;
  if (kind === 'anim' && inDefault && parts.includes('animated') && p.endsWith('.png') && !entry.a) entry.a = p;
  byName.set(key, entry);
};
staticFiles.forEach((p) => add(p, 'static'));
animatedFiles.forEach((p) => add(p, 'anim'));

const cpName = (glyph) => [...glyph.replace(/️/g, '')].map((c) => c.codePointAt(0).toString(16)).join('-');

const index = {};
let matched = 0;
for (const e of emojibase) {
  if (!e.emoji || e.skin) continue; // skip skin-tone variants; the base emoji is indexed
  const hit = byName.get(String(e.label).toLowerCase());
  if (!hit || !hit.s) continue;
  index[e.emoji] = { n: hit.name, s: hit.s, ...(hit.a ? { a: hit.a } : {}) };
  matched++;
}
console.log(`matched ${matched} of ${emojibase.length} entries`);

// Keep the previous entries too, so nothing that worked before is lost.
const oldPath = path.join(outDir, 'index.json');
const old = fs.existsSync(oldPath) ? JSON.parse(fs.readFileSync(oldPath, 'utf8')) : {};
const merged = { ...old, ...index };
fs.writeFileSync(oldPath, JSON.stringify(merged));
console.log(`index entries: ${Object.keys(merged).length}`);

// Download every static SVG that is missing locally.
const staticDir = path.join(outDir, 'static');
fs.mkdirSync(staticDir, { recursive: true });
const jobs = Object.entries(index)
  .map(([glyph, e]) => ({ file: path.join(staticDir, `${cpName(glyph)}.svg`), src: e.s }))
  .filter((j) => !fs.existsSync(j.file));
console.log(`to download: ${jobs.length}`);

let done = 0;
let failed = 0;
async function worker(queue) {
  while (queue.length) {
    const job = queue.shift();
    const url = 'https://raw.githubusercontent.com/microsoft/fluentui-emoji/main/' + job.src.split('/').map(encodeURIComponent).join('/');
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(String(res.status));
      fs.writeFileSync(job.file, Buffer.from(await res.arrayBuffer()));
      done++;
    } catch (err) {
      failed++;
      console.warn('failed', job.src, err.message);
    }
  }
}
const queue = [...jobs];
await Promise.all(Array.from({ length: 12 }, () => worker(queue)));
console.log(`downloaded ${done}, failed ${failed}`);
