import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// English is a dictionary over painted Korean. A value that still carries Hangul, a value that drops or
// invents a number slot, or a fixed label in index.html with no entry would each ship Korean or a broken
// number to an English player, so all three fail here without a browser. --selftest plants one of each.
const ROOT = new URL('../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const HANGUL = /[\uac00-\ud7a3]/;
const NUM = /\d+(?:[.,]\d+)*/g;
const keyOf = (s) => { let i = 0; return s.replace(/\s+/g, ' ').trim().replace(NUM, () => '{' + i++ + '}'); };
const slots = (s) => (s.match(/\{\d+\}/g) || []).sort().join(',');

export function check(dict, html) {
  const bad = [];
  for (const [k, v] of Object.entries(dict)) {
    if (typeof v !== 'string') bad.push('not-a-string ' + k);
    else if (HANGUL.test(v)) bad.push('hangul-in-value ' + k + ' => ' + v);
    else if (slots(k) !== slots(v)) bad.push('slots ' + k + ' => ' + v);
  }
  const fixed = new Set();
  html.replace(/<!--[\s\S]*?-->/g, '').replace(/<(script|style)[\s\S]*?<\/\1>/g, '')
    .replace(/(?:aria-label|title|placeholder|alt)="([^"]*)"/g, (_, v) => { if (HANGUL.test(v)) fixed.add(keyOf(v)); return ''; })
    .replace(/>([^<>]+)</g, (_, v) => { if (HANGUL.test(v)) fixed.add(keyOf(v)); return ''; });
  for (const k of fixed) if (!(k in dict)) bad.push('missing ' + k);
  return { bad, entries: Object.keys(dict).length, fixed: fixed.size };
}

const dict = JSON.parse(readFileSync(join(ROOT, 'web/src/ui/i18n-en.json'), 'utf8'));
const html = readFileSync(join(ROOT, 'web/index.html'), 'utf8');
if (process.argv.includes('--selftest')) {
  const planted = { ...dict, '골드 {0}': '골드 {0}', '세이브 {0}': 'Saves', };
  const red = check(planted, html + '<b>없는 말 하나</b>');
  const kinds = new Set(red.bad.map((b) => b.split(' ')[0]));
  const ok = ['hangul-in-value', 'slots', 'missing'].every((k) => kinds.has(k));
  console.log((ok ? 'GREEN' : 'RED') + ' i18n:selftest ' + [...kinds].join(','));
  process.exit(ok ? 0 : 1);
}
const r = check(dict, html);
for (const b of r.bad.slice(0, 40)) console.log('RED ' + b);
console.log((r.bad.length ? 'RED' : 'GREEN') + ' i18n:dictionary entries=' + r.entries + ' fixed-labels=' + r.fixed + ' problems=' + r.bad.length);
process.exit(r.bad.length ? 1 : 0);

