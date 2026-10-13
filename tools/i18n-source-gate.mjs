import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { translate } from '../web/src/ui/i18n.mjs';

// Every Korean fragment the game can paint, read from source rather than from a short run: string and
// template literals in web/src and src (comments stripped, template slots cut out), every text and label
// in index.html, and every block of wiki body. Each must come out of translate() with no Hangul left.
// A run that only plays a minute misses captions behind rare branches; source does not.
// --selftest plants an untranslatable line in a copy of the corpus and requires it to turn the gate red.
const ROOT = new URL('../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const HANGUL = /[\uac00-\ud7a3]/;
const files = [];
const walk = (d) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (f.endsWith('.mjs') && !f.startsWith('i18n')) files.push(p); } };
walk(join(ROOT, 'web/src'));
walk(join(ROOT, 'src'));

export function fragments(src) {
  const out = [];
  const s = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"\x60\\])\/\/.*$/gm, '$1');
  const re = /'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|\x60((?:[^\x60\\]|\\.)*)\x60/g;
  let m;
  while ((m = re.exec(s))) {
    const v = m[1] ?? m[2] ?? m[3];
    for (const piece of v.split(/\$\{[^}]*\}|<[^>]*>|["<>]|\\n/)) if (HANGUL.test(piece)) out.push(piece.trim());
  }
  return out;
}

function corpus() {
  const list = [];
  for (const f of files) for (const s of fragments(readFileSync(f, 'utf8'))) list.push([f.slice(ROOT.length), s]);
  const html = readFileSync(join(ROOT, 'web/index.html'), 'utf8').replace(/<!--[\s\S]*?-->/g, '').replace(/<(script|style)[\s\S]*?<\/\1>/g, '');
  html.replace(/(?:aria-label|title|placeholder|alt|content)="([^"]*)"|>([^<>]+)</g, (_, a, b) => { const v = (a ?? b).trim(); if (HANGUL.test(v)) list.push(['web/index.html', v]); return ''; });
  const pages = JSON.parse(readFileSync(join(ROOT, 'web/wiki/dist/pages.json'), 'utf8'));
  JSON.stringify(pages).replace(/"((?:[^"\\]|\\.)*)"/g, (_, v) => {
    for (const b of v.replace(/\\n/g, '\n').split(/<[^>]+>|\n/)) if (HANGUL.test(b)) list.push(['wiki', b.trim()]);
    return '';
  });
  return list;
}

const run = (list) => {
  const bad = new Map();
  for (const [f, s] of list) { const t = translate(s); if (HANGUL.test(t)) bad.set(s, f); }
  return bad;
};
if (process.argv.includes('--selftest')) {
  const bad = run([...corpus(), ['planted', '이 줄은 사전에 없는 문장이다']]);
  const ok = bad.has('이 줄은 사전에 없는 문장이다');
  console.log((ok ? 'GREEN' : 'RED') + ' i18n-source:selftest planted line caught');
  process.exit(ok ? 0 : 1);
}
const list = corpus();
const bad = run(list);
if (process.argv.includes('--list')) { for (const [s, f] of bad) console.log(f + '\t' + s); process.exit(0); }
for (const [s, f] of [...bad].slice(0, 40)) console.log('RED ' + f + ' ' + s);
console.log((bad.size ? 'RED' : 'GREEN') + ' i18n-source:every-korean-fragment-translates fragments=' + list.length + ' untranslated=' + bad.size);
process.exit(bad.size ? 1 : 0);

