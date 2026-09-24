import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { CITY_SKINS } from '../web/src/state/gear.mjs';

// lipis/flag-icons의 MIT SVG를 수정 없이 쓴다. 국기 직접 제작 대신 원본 해시와 고정 커밋을 검증한다.
const root = new URL('../web/assets/', import.meta.url);
const ledger = JSON.parse(readFileSync(new URL('ledger.json', root)));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const rows = [];
for (const code of new Set(CITY_SKINS.flat().map(host => host.flag))) {
  const path = 'flags/' + code + '.svg';
  const entry = ledger.find(row => row.path === path);
  assert.ok(entry && entry.license === 'MIT' && entry.rights === 'MIT');
  assert.match(entry.commit, /^[a-f0-9]{40}$/);
  assert.ok(entry.source.includes('/' + entry.commit + '/flags/4x3/' + code + '.svg'));
  const bytes = readFileSync(new URL(path, root));
  assert.ok(bytes.length > 0);
  assert.equal(hash(bytes), entry.sha256);
  assert.notEqual(hash(Buffer.concat([bytes, Buffer.from('corruption')])), entry.sha256);
  const svg = bytes.toString('utf8');
  assert.match(svg, /<svg/);
  assert.ok(!/<script|onload=|onerror=/.test(svg));
  rows.push({ path, sha256: entry.sha256, commit: entry.commit, verified: true });
}
assert.match(readFileSync(new URL('flags/LICENSE', root), 'utf8'), /The MIT License/);
const out = new URL('../.omo/evidence/p16/', import.meta.url);
mkdirSync(out, { recursive: true });
writeFileSync(new URL('flags.json', out), JSON.stringify(rows, null, 2));
console.log('flag PASS ' + rows.length + ' pinned SVGs and corruption controls');
