import { readFileSync, readdirSync, statSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve, relative, extname, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { crc32, inflateSync } from 'node:zlib';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { KEEPERS, pullWeight } from '../src/roster.mjs';

// Repository gate shape; WCAG formula: https://www.w3.org/TR/WCAG22/#dfn-relative-luminance
// Node fs/URL/zlib own traversal, resolution, PNG CRC and decompression; no dependencies.
const ROOT = fileURLToPath(new URL('../', import.meta.url));
const read = p => readFileSync(resolve(ROOT, p), 'utf8');
const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8', timeout: 5000 }).trim();
const artifact = resolve(ROOT, '.omo/evidence/readiness-' + head.slice(0, 7) + '.txt');
const lines = [`HEAD ${head}`, `BINARY ${process.execPath} ${process.version}; package.json has no Node engine pin`, 'INVOCATION node tools/readiness-gate.mjs', `ARTIFACT ${artifact}`];
const rows = [];
const row = (name, layer, status, owner, detail) => { rows.push([name, layer, status, owner]); lines.push(`${status} ${name}: ${detail}`); };
const axis = (name, test) => { try { row(name, '결정론', 'GREEN', 'readiness gate', test()); } catch (e) { row(name, '결정론', 'RED', 'readiness gate', e.message); } };
const pending = (name, owner, detail, layer = 'HOOTL') => row(name, layer, '대기', owner, detail);
const walk = folder => readdirSync(resolve(ROOT, folder), { withFileTypes: true }).flatMap(e => e.name.includes('.local') ? [] : e.isDirectory() ? walk(join(folder, e.name)) : [join(folder, e.name)]);
const html = read('web/index.html'), css = read('web/src/ui/hud.css').replace(/\/\*[\s\S]*?\*\//g, '');
const manifest = JSON.parse(read('web/manifest.webmanifest'));
const main = read('web/src/main.mjs');
const source = p => read(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
let largest;

// URL은 만들어졌다는 이유만으로 내려받지 않는다. const 값의 모든 소비가
// <a href> 문자열인 경우만 탐색으로 제외하고, fetch나 알 수 없는 소비가 섞이면 예산에 남긴다.
// 기존 정적 import/URL 워커와 Node URL 해석을 재사용하며 파일명·확장자로 탐색을 추정하지 않는다.
function moduleUrls(text) {
  return [...text.matchAll(/new URL\(\s*['"]([^'"]+)['"]\s*,\s*import\.meta\.url\s*\)/g)].map(match => {
    const prefix = text.slice(0, match.index);
    const binding = prefix.match(/(?:^|[;\n])\s*const\s+([A-Za-z_$][\w$]*)\s*=\s*$/);
    let navigation = false;
    if (binding && /^(?:\.href)?\s*;/.test(text.slice(match.index + match[0].length))) {
      const name = binding[1];
      const declaration = match.index - binding[0].length;
      const uses = [...text.matchAll(new RegExp('\\b' + name.replaceAll('$', '\\$') + '\\b', 'g'))]
        .filter(use => use.index < declaration || use.index >= match.index + match[0].length);
      navigation = uses.length > 0 && uses.every(use =>
        /<a\b[^<>]*\bhref\s*=\s*["']["']\s*\+\s*$/i.test(text.slice(0, use.index))
        && /^\s*\+\s*["']["']/.test(text.slice(use.index + name.length)));
    }
    return { ref: match[1], navigation };
  });
}

function bootstrapPath(ref, parent) {
  if (/^(data:|#)/.test(ref)) return null;
  assert(!/^(https?:|\/\/)/.test(ref), 'Unmeasured remote bootstrap resource: ' + ref);
  const file = fileURLToPath(new URL(ref, pathToFileURL(parent)));
  assert(!relative(ROOT, file).startsWith('..'), 'Resource escaped repository: ' + file);
  return file;
}

axis('bootstrap-url-consumer-controls', () => {
  const parent = resolve(ROOT, 'web/src/control.mjs');
  const nav = 'const target = new URL("../../../outside.html", import.meta.url).href; const link = \'<a href="\' + target + \'">열기</a>\';';
  const collect = text => moduleUrls(text).filter(row => !row.navigation).map(row => bootstrapPath(row.ref, parent));
  assert.deepEqual(collect(nav), []);
  assert.throws(() => collect('fetch(new URL("../../../outside.json", import.meta.url));'), /escaped repository/);
  assert.throws(() => collect(nav + ' fetch(target);'), /escaped repository/);
  assert.equal(collect('fetch(new URL("../build.json", import.meta.url));')[0], resolve(ROOT, 'web/build.json'));
  return '탐색 전용 제외; 저장소 밖 직접 fetch와 탐색/fetch 겸용 거부; 내부 fetch 포함';
});

axis('initial-byte-budget', () => {
  const files = new Map(), queue = [resolve(ROOT, 'web/index.html')];
  const add = (ref, parent) => {
    const file = bootstrapPath(ref, parent);
    if (file) queue.push(file);
  };
  while (queue.length) {
    const file = queue.shift();
    if (files.has(file)) continue;
    files.set(file, statSync(file).size);
    if (!['.html', '.css', '.mjs', '.js'].includes(extname(file))) continue;
    const text = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    if (extname(file) === '.html') for (const tag of text.matchAll(/<(?:script|link|img)\b[^>]*>/gi)) {
      const ref = tag[0].match(/\b(?:src|href)=["']([^"']+)["']/i); if (ref) add(ref[1], file);
    }
    // Static module graph includes vendor dependencies and JSON modules. Dynamic imports fail closed.
    if (/\.(?:mjs|js)$/.test(file)) {
      assert(!/\bimport\s*\(/.test(text), 'Dynamic import needs an explicit budget owner: ' + relative(ROOT, file));
      for (const m of text.matchAll(/\b(?:import|export)\s+(?:[^;"']*?\sfrom\s*)?["']([^"']+)["']/g)) add(m[1], file);
      for (const url of moduleUrls(text)) {
        if (url.navigation) lines.push('NAVIGATION_ONLY ' + relative(ROOT, file) + ' -> ' + url.ref);
        else add(url.ref, file);
      }
      for (const m of text.matchAll(/loadDecor\(\s*\w+\s*,\s*['"]([^'"]+)['"]/g)) add('assets/models/' + m[1] + '.glb', resolve(ROOT, 'web/index.html'));
    }
    if (/\.(?:html|css)$/.test(file)) for (const m of text.matchAll(/url\(\s*['"]?([^)'"\s]+)['"]?\s*\)/g)) add(m[1], file);
  }
  const ordered = [...files].map(([p, bytes]) => ({ path: relative(ROOT, p).replaceAll('\\', '/'), bytes })).sort((a, b) => b.bytes - a.bytes);
  const total = ordered.reduce((n, f) => n + f.bytes, 0);
  largest = ordered[0];
  lines.push('BOOTSTRAP_INVENTORY ' + JSON.stringify(ordered));
  lines.push(`LARGEST_ASSET ${ordered[0].path} ${ordered[0].bytes} bytes`);
  lines.push('BUDGET_SCOPE raw on-disk bytes, deduplicated; includes bootstrap modules, CSS/font URLs, JSON fetches and loadDecor GLBs; conservative pre-gesture upper bound, not measured transfer bytes');
  const bgm = source('web/src/audio/bgm.mjs');
  assert(/el\.preload\s*=\s*'none'/.test(bgm) && /const kick = [\s\S]*?el\.src = src/.test(bgm), 'Deferred audio assumption changed');
  lines.push('DEFERRED BGM codecs are excluded: preload=none and src assigned by gesture kick; procedural textures/portraits have no file payload');
  assert(total <= 20_000_000, `${total} bytes > 20000000`);
  return `${total} bytes / 20000000; ${ordered.length} resources; largest ${ordered[0].path} ${ordered[0].bytes} bytes`;
});
axis('largest-single-asset', () => { assert(largest && largest.bytes > 0); return `${largest.path} ${largest.bytes} bytes (reported, no universal per-file cap)`; });

for (const field of ['name', 'short_name', 'start_url', 'display']) axis('manifest:' + field, () => {
  assert.equal(typeof manifest[field], 'string'); assert(manifest[field].trim());
  if (field === 'start_url') assert(statSync(resolve(ROOT, 'web', manifest[field])).isFile());
  if (field === 'display') assert(['fullscreen', 'standalone', 'minimal-ui'].includes(manifest[field]));
  return manifest[field];
});
for (const size of [192, 512]) axis('manifest:icon-' + size, () => {
  const icon = manifest.icons.find(i => i.sizes === `${size}x${size}` && i.type === 'image/png');
  assert(icon, 'Missing ' + size + 'x' + size + ' PNG');
  const png = readFileSync(resolve(ROOT, 'web', icon.src));
  assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  assert.equal(png.readUInt32BE(16), size); assert.equal(png.readUInt32BE(20), size);
  const data = []; let ended = false;
  for (let offset = 8; offset < png.length;) {
    const n = png.readUInt32BE(offset), type = png.toString('ascii', offset + 4, offset + 8);
    assert.equal(crc32(png.subarray(offset + 4, offset + 8 + n)), png.readUInt32BE(offset + 8 + n));
    if (type === 'IDAT') data.push(png.subarray(offset + 8, offset + 8 + n));
    if (type === 'IEND') ended = true;
    offset += n + 12;
  }
  assert(ended && inflateSync(Buffer.concat(data)).length > size * size);
  return `${icon.src} ${size}x${size}, ${png.length} bytes, CRC and decompression valid`;
});
axis('apple-touch-icon', () => { assert(/<link\b[^>]*rel="apple-touch-icon"[^>]*href="assets\/icon-192.png"/.test(html)); return '192px link'; });
axis('orientation', () => { assert.equal(manifest.orientation, 'landscape'); return manifest.orientation; });
axis('refresh-independent-judgement', () => {
  const scene = source('web/src/render/scene.mjs');
  assert(/let dt = Math\.min\(0\.05, Math\.max\(0, real - realLast\)\)/.test(scene));
  assert(/if \(fixedDt > 0\) dt = fixedDt/.test(scene));
  const judges = walk('src').filter(p => /\.mjs$/.test(p));
  const touched = judges.filter(p => /\bdt\b/.test(source(p)));
  const control = [...scene.matchAll(/\bdt\b/g)].length;
  assert(judges.length > 0 && control > 0, 'The dt scan needs judgement modules and a positive renderer control');
  assert.equal(touched.length, 0, touched.join(', ')); return `render clamp=0.05s; fixedDt override; ${judges.length} judgement modules, dt reads=0; renderer positive control=${control}`;
});
axis('storage-denied-and-persistence', storageScenario);
function storageScenario() {
  // A fresh Node child isolates the storage stub and imports the actual save module.
  const program = `import assert from 'node:assert/strict'; import * as s from ${JSON.stringify(pathToFileURL(resolve(ROOT, 'web/src/state/save.mjs')).href)};
    let reads=0,writes=0,removes=0; globalThis.localStorage={getItem(){reads++;throw Error('denied')},setItem(){writes++;throw Error('denied')},removeItem(){removes++;throw Error('denied')}};
    assert.equal(s.load(),null); assert.deepEqual(s.readSquad(s.load()),{squad:[],pick:0});s.save([{level:1}],0);s.wipe();assert(reads===2&&writes===1&&removes===1);
    let raw;globalThis.localStorage={getItem(){return raw},setItem(k,v){raw=v}};const args=[[{level:1}],0,false,0,0,{},[],{},{},{},{},{},0,{},[],[],2,-1];s.save(...args);let saved=s.load();assert.equal(saved.onboard,2);assert.equal(Object.hasOwn(saved,'pref'),false);assert.equal(saved.squad[0].level,1);saved.pref=-1;raw=JSON.stringify(saved);assert.equal(s.load().pref,-1);s.save(...args);assert.equal(Object.hasOwn(s.load(),'pref'),false);console.log('denied reads=2 writes=1 removes=1; defaults returned; onboard=2 level=1; legacy pref loads and is dropped on save');`;
  return execFileSync(process.execPath, ['--input-type=module', '-e', program], { cwd: ROOT, encoding: 'utf8', timeout: 10000 }).trim();
}
axis('audio-resume-hooks-source-only', () => {
  const bgm = source('web/src/audio/bgm.mjs');
  assert(/visibilitychange[\s\S]*?resume\(\)/.test(bgm));
  assert(/const kick[\s\S]*?resume\(\)/.test(bgm));
  assert(/\['pointerdown', 'keydown', 'touchstart'\]\) document.addEventListener\(ev, kick\)/.test(bgm));
  return 'visibilitychange + pointerdown/keydown/touchstart; source registration only, iOS recovery awaits device test';
});

axis('hud-touch-minimum', () => {
  const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)];
  const selectors = ['#meBtn', '#lv', '#form', '#pips', '#purse button', '#auto', '#mute', '#fullscreen', '#wikiBtn', '#gymBtn', '#rosterBtn', '#gramBtn', '#shopBtn', '.move-arrow'];
  const minimum = selector => {
    const blocks = rules.filter(r => r[1].split(',').map(s => s.trim()).includes(selector)).map(r => r[2]);
    const defaults = selector === '.move-arrow' ? [] : rules.filter(r => r[1].split(',').map(s => s.trim()).join(',') === '#hud > button,#top button').map(r => r[2]);
    return ['width', 'height'].map(d => {
      const values = [...blocks, ...defaults].flatMap(b => [...b.matchAll(new RegExp('(?:^|;)\\s*(?:min-)?' + d + ':\\s*(\\d+(?:\\.\\d+)?)px', 'g'))].map(m => Number(m[1])));
      return values.length ? Math.max(...values) : 0;
    });
  };
  const measured = selectors.map(s => ({ selector: s, px: minimum(s) }));
  lines.push('TOUCH_DECLARATIONS ' + JSON.stringify(measured));
  assert(measured.every(m => m.px.every(v => v >= 24)), 'Missing >=24px declarations: ' + JSON.stringify(measured.filter(m => m.px.some(v => v < 24))));
  assert.equal([...html.matchAll(/data-move="-?1"/g)].length, 2);
  return 'HUD minimum >=24 CSS px; movement arrows 48x48; declaration audit, rendered bounds owned by mobile gate';
});
const tokens = Object.fromEntries([...css.match(/:root\s*\{([^}]+)\}/)[1].matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})\b/gi)].map(m => [m[1], m[2]]));
const luminance = hex => hex.slice(1).match(/../g).map(v => parseInt(v, 16) / 255).map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4).reduce((n, v, i) => n + v * [0.2126, 0.7152, 0.0722][i], 0);
const contrast = (a, b) => { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
axis('contrast-instrument-control', () => { assert.equal(contrast('#000000', '#ffffff'), 21); assert.equal(contrast('#161c14', '#161c14'), 1); return 'black/white=21, identical=1 (rejects 4.5 and 3)'; });
for (const fg of ['ink', 'dim', 'bad', 'good']) for (const bg of ['panel', 'edge']) axis(`contrast:${fg}/${bg}`, () => {
  const bar = ['ink', 'dim'].includes(fg) ? 4.5 : 3;
  assert(tokens[fg] && tokens[bg]); const value = contrast(tokens[fg], tokens[bg]);
  assert(value >= bar, `${value.toFixed(3)} < ${bar}`); return `${tokens[fg]}/${tokens[bg]}=${value.toFixed(3)}:1 >= ${bar}:1; opaque root tokens, not composited pixels`;
});
axis('reduced-motion', () => { assert(/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[\s\S]*?transition-duration:\s*(?:0|0?\.01)ms/.test(css)); return 'reduce query shortens panel transitions to <=0.01ms'; });
axis('ftue-ordered-ids', () => {
  const ids = [...source('web/src/state/inject.mjs').matchAll(/export const (ONBOARD_\w+) = (\d+);/g)].map(m => [m[1], Number(m[2])]);
  assert.deepEqual(ids, [['ONBOARD_KEEPER', 0], ['ONBOARD_KICKERS', 1], ['ONBOARD_DONE', 2]]);
  assert(ids.every(([id]) => main.includes(id))); assert(/onboard:\s*Number\(onboard\)/.test(source('web/src/state/save.mjs')));
  return JSON.stringify(ids) + '; ordered declarations in inject.mjs, persisted denominator; not a measured funnel';
});
axis('wiki-searchable-odds', () => {
  const pages = JSON.parse(read('web/wiki/dist/pages.json'));
  const page = pages.find(p => p.id === 'pull' && p.categories.includes('pull'));
  assert(page);
  // 숫자 전체는 가격·묶음 수·이용권 한도·명성 조건까지 거부하는 잘못된 대리 지표다.
  // 퍼센트 표기와 계산된 풀 확률만 금지한다. shopOdds의 기존 실물 검증은 아래에 그대로 둔다.
  const poolOdds = new Set();
  for (const pool of [KEEPERS, KEEPERS.slice(1)]) {
    const total = pool.reduce((sum, keeper) => sum + pullWeight(keeper), 0);
    // 아래 기존 계약과 같은 명성 세 구간이며 100은 비율을 퍼센트로 바꾸는 환산이다.
    for (const matches of [k => k.fame >= 10, k => k.fame === 9, k => k.fame <= 8]) {
      const odd = pool.filter(matches).reduce((sum, keeper) => sum + pullWeight(keeper), 0) / total * 100;
      poolOdds.add(odd);
      // 현재 표시 한 자리와 과거 위키의 두 자리 모두 복사 확률로 검출한다.
      for (const digits of [1, 2]) poolOdds.add(Number(odd.toFixed(digits)));
    }
  }
  const noCopiedOdds = body => {
    const text = body.replace(/<[^>]*>/g, ' ').replace(/&#(?:0*37|x0*25);|&percnt;/gi, '%');
    assert(!/[%％]|퍼센트|\bpercent\b/i.test(text), 'Wiki contains a copied percentage');
    const figures = [...text.matchAll(/\d+(?:\.\d+)?/g)].map(match => Number(match[0]));
    assert(!figures.some(value => poolOdds.has(value)), 'Wiki contains a computed pool odd');
  };
  noCopiedOdds(page.bodyHtml);
  // 실제 빌드의 가격·묶음·이용권·명성 숫자는 확률이 아니라는 허용 대조군이다.
  noCopiedOdds('<p>가격 380, 묶음 10, 이용권 1, 명성 40, 명성 9</p>');
  // 양성 표본의 50%는 풀 변화와 무관하게 복사 확률 표기를 거부하는지 검증한다.
  assert.throws(() => noCopiedOdds(page.bodyHtml + '<p>확률 50%</p>'), /copied percentage/);
  assert.throws(() => noCopiedOdds(page.bodyHtml + '<p>확률 50&#37;</p>'), /copied percentage/);
  assert(poolOdds.size > 0);
  for (const odd of poolOdds) assert.throws(() => noCopiedOdds(page.bodyHtml + '<p>' + odd + '</p>'), /computed pool odd/);
  lines.push('WIKI_ODDS_CONTROLS prices=accepted; percentage=REJECTED; encoded-percentage=REJECTED; computed-odds=REJECTED ' + JSON.stringify([...poolOdds]));
  // Execute the product's pure HTML formatter with Node vm; browser visibility remains pull-gate's axis.
  const bands = [...main.matchAll(/const ODDS_BANDS = \[[\s\S]*?\n\];/g)];
  const formatters = [...main.matchAll(/function shopOdds\(pool\) \{[\s\S]*?\n\}/g)];
  assert.equal(bands.length, 1); assert.equal(formatters.length, 1);
  assert(main.includes("+ shopOdds(pool) + '</em></details>'"));
  for (const pool of [KEEPERS, KEEPERS.slice(1)]) {
    const rendered = runInNewContext(bands[0][0] + '\n' + formatters[0][0] + '\nshopOdds(pool)', { pool, pullWeight }, { timeout: 1000 });
    const parsed = [...rendered.matchAll(/<span><i>([^<]+)<\/i><b>([\d.]+%)<\/b><u>(\d+)<\/u><\/span>/g)].map(m => [m[2], Number(m[3])]);
    const total = pool.reduce((n, k) => n + pullWeight(k), 0);
    const expected = [k => k.fame >= 10, k => k.fame === 9, k => k.fame <= 8].map(f => {
      const group = pool.filter(f);
      return [(group.reduce((n, k) => n + pullWeight(k), 0) / total * 100).toFixed(1) + '%', group.length];
    });
    assert.deepEqual(parsed, expected); assert(!/<canvas\b/i.test(rendered));
    lines.push('POOL_ODDS ' + JSON.stringify({ population: pool.length, totalWeight: total, odds: parsed, text: rendered.replace(/<[^>]*>/g, ' ') }));
  }
  return 'actual shopOdds HTML text matches full and reduced pools; wiki has no copied odds; browser visibility owned by pull gate';
});
axis('currency-placeholder', () => {
  assert(read('web/wiki/src/cash-rate.md').includes('[[coin]]'));
  const sentence = '골드와 캐시는 나중에 바꿀 수 있는 임시 일반 재화 이름이다.';
  assert(read('web/wiki/src/coin.md').includes(sentence));
  assert(JSON.parse(read('web/wiki/dist/pages.json')).find(p => p.id === 'coin').bodyHtml.includes(sentence)); return 'cash-rate -> coin; placeholder sentence exists in source and built text';
});
axis('payment-sdk-scan', () => {
  const files = [...walk('web/src'), ...walk('src'), 'web/index.html', 'package.json'].filter(p => /\.(mjs|js|html|json)$/.test(p));
  const sdk = /['"`][^'"`\n]*(?:stripe|toss|iamport|play[ -]?billing)/i;
  const hits = files.filter(p => sdk.test(source(p)) || /\b(?:Stripe|TossPayments|Iamport)\s*\(/.test(source(p)));
  const raw = files.filter(p => /stripe|toss|iamport|play[ -]?billing/i.test(read(p)));
  lines.push('PAYMENT_RAW_MATCHES ' + JSON.stringify(raw) + '; pitch.mjs stripe is the local field-marking geometry helper, not an SDK');
  assert(sdk.test("import Stripe from 'stripe'")); assert(sdk.test("load('https://js.tosspayments.com/v2')"));
  assert.equal(hits.length, 0, hits.join(', '));
  assert(/이 빌드에는 결제 경로가 없다/.test(read('web/src/state/inject.mjs')));
  return `${files.length} product files; payment SDK matches=0; cash is injected only, no real-money sale path at this HEAD`;
});
axis('hosting-declaration', () => { const url = read('tools/live-gate.mjs').match(/const LIVE = "([^"]+)"/)[1]; assert(new URL(url).hostname.endsWith('.github.io')); return url + '; live gate target, not a deployment verification; R25 sale trigger absent'; });

// 시장 시험 준비물의 존재는 결정론이고 외부인의 결과와 게시 승인은 HITL이다.
const marketFiles = ['README.md', 'observer.md', 'observation.csv', 'posts.md', 'clip.md', 'collectors.md', 'report.md'];
const requireMarketFile = (load, name) => {
  const body = load('market-test/' + name);
  assert(body.trim(), '빈 시장 시험 파일: ' + name);
  return body;
};
for (const name of marketFiles) axis('market-test:package:' + name, () => {
  const body = requireMarketFile(read, name);
  return name + ' ' + Buffer.byteLength(body) + ' bytes; 존재만 측정, 내용과 사람의 결과는 별도 검토';
});
axis('market-test:presence-controls', () => {
  assert.throws(() => requireMarketFile(() => { throw new Error('ENOENT'); }, 'missing.md'));
  assert.throws(() => requireMarketFile(() => '  ', 'empty.md'));
  assert.equal(requireMarketFile(() => '준비물', 'present.md'), '준비물');
  return '누락·빈 파일 거부, 비어 있지 않은 대조군 수락';
});
axis('market-test:observation-sheet', () => {
  const csv = requireMarketFile(read, 'observation.csv').trim().split(/\r?\n/).map(line => line.split(','));
  const [header, ...people] = csv;
  // P24가 지정한 코칭 없는 외부인 표본 수다.
  const expectedPeople = 5;
  assert.equal(people.length, expectedPeople);
  assert.equal(new Set(people.map(person => person.at(0))).size, expectedPeople);
  assert(people.every(person => person.length === header.length && person.at(0) && person.slice(1).every(cell => cell === '')));
  return '외부인 ' + people.length + '행, ' + header.length + '열; 결과 칸은 미관측';
});
axis('market-test:source-links', () => {
  const posts = requireMarketFile(read, 'posts.md');
  const telemetry = read('web/src/telemetry.mjs');
  const allowed = [...telemetry.match(/const SOURCES = new Set\(\[([\s\S]*?)\]\)/)[1].matchAll(/'([^']+)'/g)].map(match => match[1]);
  const root = new URL(read('README.md').match(/^플레이:\s*(https:\/\/\S+)/m)[1]);
  const entry = new URL('web/index.html', root);
  const channels = ['reddit', 'discord', 'itch', 'youtube', 'crazygames', 'poki'];
  const links = [...posts.matchAll(/^https:\/\/\S+/gm)].map(match => new URL(match[0]));
  const valid = link => link.origin === entry.origin && link.pathname === entry.pathname
    && allowed.includes(link.searchParams.get('src'));
  assert(links.every(valid));
  for (const channel of channels) {
    // 한국어와 영어 초안 각각에 하나씩 있어야 하므로 채널마다 두 링크다.
    assert.equal(links.filter(link => link.searchParams.get('src') === channel).length, 2);
  }
  assert(!valid(new URL('?src=reddit', root)), '쿼리를 잃는 루트 주소가 통과함');
  assert(!valid(new URL('?src=unknown', entry)), '허용 목록 밖 유입이 통과함');
  return links.length + '개 링크의 실제 진입 경로·허용 유입 확인; 루트·알 수 없는 채널 거부';
});
row('market-test:수집기 계정·모집·게시·지출·결과 전환', 'HITL', 'HITL', 'founder', 'market-test/README.md 결정표; 실계정·외부인·시장 판정은 미측정');

// Existing browser owners are references, never recycled PASS reports.
for (const [name, owner, marker] of [
  ['HUD native buttons', 'entry', 'affordance:every-hud-click-target-is-a-button'],
  ['condition name and icon', 'entry', 'entry:the-condition-slot-paints-an-icon-in-every-band'],
  ['keyboard ESC Tab no-mouse', 'keys', 'keys:the-game-plays-without-a-mouse'],
  ['two movement arrows rendered size', 'mobile', ':arrows-take-a-finger'],
  ['fullscreen optional and unsupported hidden', 'fullscreen', 'unsupported:hidden-and-home-screen-help'],
  ['in-game odds match current pool', 'pull', 'pull:printed-odds-match-the-pool']
]) {
  axis('owner-registration:' + owner + ':' + name, () => { assert(read(`tools/${owner}-gate.mjs`).includes(marker)); return `node tools/${owner}-gate.mjs -> ${marker}; not rerun by readiness gate`; });
  pending(name, owner + ' gate lap', 'Existing axis referenced; no prior runtime PASS claimed');
}
for (const name of ['frame p50/p95/p99 and draw calls', 'field p75 LCP<2.5s INP<200ms CLS<0.1 (mobile/desktop)', 'Lighthouse >=90', 'minimum device 30FPS', '30min soak / 20 scene changes without OOM or context loss']) pending(name, 'perf gate lap', 'Browser/device measurement required');
pending('cold first-playable p75 <10s', 'perf gate lap', 'Throttled cold-cache browser run required', 'HOTL');
for (const name of ['HTTPS installation interaction and 30s dwell', 'touch selection/context menu and safe areas', 'iOS audio after background and a new gesture', 'focus loss does not send gameplayStop', 'ad-blocker playability', 'one-click play and skippable intro', 'parent page does not scroll', 'host-owned fullscreen hides game button']) pending(name, 'fullscreen / keys gate lap', 'Portal/browser scenario required');
for (const name of ['visible focus and no trap', 'drag alternatives', '<3 flashes/second', 'non-text contrast and composited text contrast', 'no sound-only information and dialogue captions', 'separate audio channels and saved volumes']) pending(name, 'keys / entry gate lap', 'Rendered accessibility measurement required');
pending('200% zoom', 'keys gate lap', 'Browser measurement');
row('actual phone Korean legibility and platform acceptance', 'HITL', 'HITL', 'founder', 'Physical device acceptance');
for (const name of ['play conversion >=65%', 'one-minute survival >=80%', 'FTUE completion >=80% of FTUE starts', 'D1 investigate <10%, continue 10-15%, good >15%', 'D7 >=10%', 'D30 >=2% (hypothesis)', 'average session 10min; Poki 5min/management 10min', '7-day 500-play test', 'calendar-day versus elapsed-day retention', 'exact-date versus rolling retention', 'tutorial/play/payment conversion separately', 'daily versus cohort payment conversion', 'ads versus IAP ARPDAU', '<=500 events/user/day', 'design 15000 / progression 8000 / resource 4000 combinations', 'aggregate idle accrual, ordered journey and explained resource changes']) pending(name, 'telemetry lap', 'External collector required; balance.md 최소 텔레메트리 owns schema', 'HOTL/HOOTL');
for (const name of [
  '한국의 확률형 아이템 표시 의무(게임산업법 33조)는 직접과 간접 유상 획득을 덮고 온전히 무상인 아이템만 제외하며, 구매와 조회와 사용 화면에 표시하고 문자열로 검색되는 홈페이지에도 두며, 변경은 사전 고지한다.',
  '중소기업 예외는 사업자마다 3년 평균 매출 1억 원 이하와 중소기업 지위를 요구한다(R19, R20, R21).',
  'EU CPC 원칙(2025-03-21)은 유료 가상 화폐에만 붙고 실제 화폐 가격을 옆에 표시하며 미사용 유료 화폐의 14일 철회를 지원하고 아이에게 직접 구매를 권하지 않는다(R22).',
  'Apple 3.1.1과 Google은 유료 확률 아이템의 확률을 구매 전에 보이고 Google은 백엔드 검증을 권한다(R23, R24).',
  'GitHub Pages는 상거래를 주로 하는 사이트를 금지하므로 현금이 팔리기 전에 호스팅을 옮긴다(R25).',
  'Poki는 인앱 구매를 받지 않고 Yandex는 구매가 있는 게임에 서버 저장을 요구한다(R2, R26).',
  '구매 게이트(구매가 정확히 한 번 반영, 취소는 반영 없음, 환불 정합)',
  '다섯 외부인이 첫 판을 마친 뒤의 전환은 파운더 손이다.'
]) row(name, 'HITL', 'HITL', 'founder', 'readiness.md canon; business/legal acceptance remains human-owned');
pending('Poki / CrazyGames featuring and submission', 'founder', 'Business decision; retention/conversion/quality/uniqueness required', 'HITL');
const reds = rows.filter(r => r[2] === 'RED').length;
row('전환 규칙', 'HOOTL', reds ? 'RED' : 'GREEN', 'readiness gate', `deterministic RED=${reds}; pending/HITL have owners; this is not a launch declaration`);
lines.push('', 'row | 층 | status | owner', ...rows.map(r => r.join(' | ')), '', `readiness ${reds ? 'FAIL' : 'PASS'} deterministic RED=${reds}`);
mkdirSync(dirname(artifact), { recursive: true });
writeFileSync(artifact, lines.join('\n') + '\n');
console.log(lines.join('\n'));
process.exitCode = reds ? 1 : 0;
