import { readFileSync, readdirSync, statSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve, relative, extname, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { crc32, inflateSync } from 'node:zlib';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { KEEPERS, pullWeight, PULL_KINDS, poolFor, poolOdds } from '../src/roster.mjs';

// Repository gate shape; WCAG formula: https://www.w3.org/TR/WCAG22/#dfn-relative-luminance
// Node fs/URL/zlib own traversal, resolution, PNG CRC and decompression; no dependencies.
const ROOT = fileURLToPath(new URL('../', import.meta.url));
const read = p => readFileSync(resolve(ROOT, p), 'utf8');
const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8', timeout: 5000 }).trim();
const artifact = resolve(ROOT, '.omo/evidence/readiness-' + head.slice(0, 7) + '.txt');
const lines = [`HEAD ${head}`, `BINARY ${process.execPath} ${process.version}; package.json has no Node engine pin`, 'INVOCATION node tools/readiness-gate.mjs', `ARTIFACT ${artifact}`];
const rows = [];
const row = (name, layer, status, owner, detail) => { rows.push([name, layer, status, owner]); lines.push(`${status} ${name}: ${detail}`); };
/* 메시지 없는 assert가 새로 들어오면 "The expression evaluated to a falsy value"만 남아 원인을 못 읽는다. 그 문구는 실패한 줄을 붙여 적고,
   아래 self-check가 그 경로를 빨강 대신 원인 있는 빨강으로 두는지 매번 잰다. */
const BARE = /^The expression evaluated to a falsy value/;
const cause = (e) => BARE.test(e.message) ? 'assert without a message at ' + ((String(e.stack).match(/readiness-gate\.mjs:(\d+)/) || [])[1] ? 'tools/readiness-gate.mjs line ' + String(e.stack).match(/readiness-gate\.mjs:(\d+)/)[1] : 'unknown line') + '; ' + e.message.split('\n')[1]?.trim() : e.message;
const axis = (name, test) => { try { row(name, '결정론', 'GREEN', 'readiness gate', test()); } catch (e) { row(name, '결정론', 'RED', 'readiness gate', cause(e)); } };
const pending = (name, owner, detail, layer = 'HOOTL') => row(name, layer, '대기', owner, detail);
const walk = folder => readdirSync(resolve(ROOT, folder), { withFileTypes: true }).flatMap(e => e.name.includes('.local') ? [] : e.isDirectory() ? walk(join(folder, e.name)) : [join(folder, e.name)]);
const html = read('web/index.html'), css = read('web/src/ui/hud.css').replace(/\/\*[\s\S]*?\*\//g, '');
const manifest = JSON.parse(read('web/manifest.webmanifest'));
/* 제품 화면 코드 전부. main 하나만 읽으면 창을 컴포넌트로 떼어 낸 날 그 창의 선언이 이 자 밖으로 나가
   아무 것도 안 바뀐 축이 빨개진다(첫 진입 개봉 id가 상점 모듈로 옮겨 간 날 ftue 축). */
const main = ['web/src/main.mjs', ...readdirSync(resolve(ROOT, 'web/src/ui')).filter((n) => n.endsWith('.mjs')).sort().map((n) => 'web/src/ui/' + n)].map(read).join('\n');
const source = p => read(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
let largest;

axis('initial-byte-budget', () => {
  const files = new Map(), queue = [resolve(ROOT, 'web/index.html')];
  const add = (ref, parent) => {
    if (/^(data:|#)/.test(ref)) return;
    assert(!/^(https?:|\/\/)/.test(ref), 'Unmeasured remote bootstrap resource: ' + ref);
    const file = fileURLToPath(new URL(ref, pathToFileURL(parent)));
    assert(!relative(ROOT, file).startsWith('..'), 'Resource escaped repository: ' + file);
    queue.push(file);
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
      /* wiki.mjs의 SITE_URL은 눌러야 새 탭으로 여는 링크라 첫 판 전에 받는 바이트가 아니다. 이걸 자원으로 세면
         사이트 html이 절대 경로 /gtg-demo/web/wiki/site/...(Pages 배포 기준)를 달고 있어 파일 URL이 드라이브 뿌리로
         풀리며 저장소 밖으로 샌다. 사이트의 본문 바이트는 wikisite 게이트가 잰다. 다른 new URL은 그대로 센다. */
      for (const m of text.matchAll(/new URL\(\s*['"]([^'"]+)['"]\s*,\s*import\.meta\.url\s*\)/g)) {
        if (!/(?:^|\/)wiki\/site\//.test(m[1])) { add(m[1], file); continue; }
        // 제외는 이 주소가 링크로만 쓰일 때 선다. 받아 오는 쪽으로 바뀌면 첫 판 바이트라 이 줄이 빨개진다.
        assert(/href="'\s*\+\s*SITE_URL\b/.test(text) && !/fetch\([^)]*SITE_URL/.test(text), 'wiki/site must stay an opened link, not a bootstrap fetch: ' + relative(ROOT, file));
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
  assert(/el\.preload\s*=\s*'none'/.test(bgm) && /const kick = [\s\S]*?el\.src = src/.test(bgm), 'bgm.mjs no longer defers audio (preload none, src set in kick), so the budget must count the codecs');
  lines.push('DEFERRED BGM codecs are excluded: preload=none and src assigned by gesture kick; procedural textures/portraits have no file payload');
  assert(total <= 20_000_000, `${total} bytes > 20000000`);
  return `${total} bytes / 20000000; ${ordered.length} resources; largest ${ordered[0].path} ${ordered[0].bytes} bytes`;
});
// 이 줄은 initial-byte-budget가 만든 목록의 맨 위를 읽을 뿐이라, 그쪽 순회가 던지면 목록이 없다. 말 없는 거짓 대신 까닭을 이름으로 적는다.
axis('largest-single-asset', () => {
  assert(largest, 'no bootstrap inventory: initial-byte-budget threw before listing assets, fix that row first');
  assert(largest.bytes > 0, largest.path + ' is the largest bootstrap resource and it is empty');
  return `${largest.path} ${largest.bytes} bytes (reported, no universal per-file cap)`;
});

for (const field of ['name', 'short_name', 'start_url', 'display']) axis('manifest:' + field, () => {
  assert.equal(typeof manifest[field], 'string', 'manifest.' + field + ' is not a string'); assert(manifest[field].trim(), 'manifest.' + field + ' is empty');
  if (field === 'start_url') assert(statSync(resolve(ROOT, 'web', manifest[field])).isFile(), 'manifest start_url ' + manifest[field] + ' is not a file under web/');
  if (field === 'display') assert(['fullscreen', 'standalone', 'minimal-ui'].includes(manifest[field]), 'manifest display ' + manifest[field] + ' is not fullscreen, standalone or minimal-ui');
  return manifest[field];
});
for (const size of [192, 512]) axis('manifest:icon-' + size, () => {
  const icon = manifest.icons.find(i => i.sizes === `${size}x${size}` && i.type === 'image/png');
  assert(icon, 'Missing ' + size + 'x' + size + ' PNG');
  const png = readFileSync(resolve(ROOT, 'web', icon.src));
  assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', icon.src + ' lacks the PNG signature');
  assert.equal(png.readUInt32BE(16), size, icon.src + ' width is not ' + size); assert.equal(png.readUInt32BE(20), size, icon.src + ' height is not ' + size);
  const data = []; let ended = false;
  for (let offset = 8; offset < png.length;) {
    const n = png.readUInt32BE(offset), type = png.toString('ascii', offset + 4, offset + 8);
    assert.equal(crc32(png.subarray(offset + 4, offset + 8 + n)), png.readUInt32BE(offset + 8 + n), icon.src + ' has a bad chunk CRC at byte ' + offset);
    if (type === 'IDAT') data.push(png.subarray(offset + 8, offset + 8 + n));
    if (type === 'IEND') ended = true;
    offset += n + 12;
  }
  assert(ended, icon.src + ' has no IEND chunk'); assert(inflateSync(Buffer.concat(data)).length > size * size, icon.src + ' pixel data is smaller than ' + size + 'x' + size);
  return `${icon.src} ${size}x${size}, ${png.length} bytes, CRC and decompression valid`;
});
axis('apple-touch-icon', () => { assert(/<link\b[^>]*rel="apple-touch-icon"[^>]*href="assets\/icon-192.png"/.test(html), 'web/index.html has no apple-touch-icon link to assets/icon-192.png'); return '192px link'; });
axis('orientation', () => { assert.equal(manifest.orientation, 'landscape', 'manifest orientation is ' + manifest.orientation + ', not landscape'); return manifest.orientation; });
axis('refresh-independent-judgement', () => {
  const scene = source('web/src/render/scene.mjs');
  assert(/let dt = Math\.min\(0\.05, Math\.max\(0, real - realLast\)\)/.test(scene), 'scene.mjs no longer clamps the render dt to 0.05s');
  assert(/if \(fixedDt > 0\) dt = fixedDt/.test(scene), 'scene.mjs lost the fixedDt override');
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
  assert(/visibilitychange[\s\S]*?resume\(\)/.test(bgm), 'bgm.mjs does not resume audio on visibilitychange');
  assert(/const kick[\s\S]*?resume\(\)/.test(bgm), 'bgm.mjs kick does not resume audio');
  assert(/\['pointerdown', 'keydown', 'touchstart'\]\) document.addEventListener\(ev, kick\)/.test(bgm), 'bgm.mjs does not register kick on pointerdown, keydown and touchstart');
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
  assert.equal([...html.matchAll(/data-move="-?1"/g)].length, 2, 'web/index.html must hold exactly two data-move arrows');
  return 'HUD minimum >=24 CSS px; movement arrows 48x48; declaration audit, rendered bounds owned by mobile gate';
});
const tokens = Object.fromEntries([...css.match(/:root\s*\{([^}]+)\}/)[1].matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})\b/gi)].map(m => [m[1], m[2]]));
const luminance = hex => hex.slice(1).match(/../g).map(v => parseInt(v, 16) / 255).map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4).reduce((n, v, i) => n + v * [0.2126, 0.7152, 0.0722][i], 0);
const contrast = (a, b) => { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
axis('contrast-instrument-control', () => { assert.equal(contrast('#000000', '#ffffff'), 21, 'contrast() no longer gives 21 for black on white'); assert.equal(contrast('#161c14', '#161c14'), 1, 'contrast() no longer gives 1 for identical colors'); return 'black/white=21, identical=1 (rejects 4.5 and 3)'; });
for (const fg of ['ink', 'dim', 'bad', 'good']) for (const bg of ['panel', 'edge']) axis(`contrast:${fg}/${bg}`, () => {
  const bar = ['ink', 'dim'].includes(fg) ? 4.5 : 3;
  assert(tokens[fg] && tokens[bg], 'hud.css :root lacks the --' + (tokens[fg] ? bg : fg) + ' color token'); const value = contrast(tokens[fg], tokens[bg]);
  assert(value >= bar, `${value.toFixed(3)} < ${bar}`); return `${tokens[fg]}/${tokens[bg]}=${value.toFixed(3)}:1 >= ${bar}:1; opaque root tokens, not composited pixels`;
});
axis('reduced-motion', () => { assert(/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[\s\S]*?transition-duration:\s*(?:0|0?\.01)ms/.test(css), 'hud.css has no prefers-reduced-motion block that cuts transition-duration to 0.01ms or less'); return 'reduce query shortens panel transitions to <=0.01ms'; });
axis('ftue-ordered-ids', () => {
  const ids = [...source('web/src/state/inject.mjs').matchAll(/export const (ONBOARD_\w+) = (\d+);/g)].map(m => [m[1], Number(m[2])]);
  assert.deepEqual(ids, [['ONBOARD_KEEPER', 0], ['ONBOARD_KICKERS', 1], ['ONBOARD_DONE', 2]], 'inject.mjs ONBOARD ids changed order or value');
  assert(ids.every(([id]) => main.includes(id)), 'an ONBOARD id is no longer used by the screen code: ' + ids.filter(([id]) => !main.includes(id)).map(x => x[0]).join(', ')); assert(/onboard:\s*Number\(onboard\)/.test(source('web/src/state/save.mjs')), 'save.mjs no longer persists onboard as a number');
  return JSON.stringify(ids) + '; ordered declarations in inject.mjs, persisted denominator; not a measured funnel';
});
axis('wiki-searchable-odds', () => {
  const pages = JSON.parse(read('web/wiki/dist/pages.json'));
  const page = pages.find(p => p.id === 'pull' && p.categories.includes('pull'));
  assert(page, 'wiki has no pull page');
  /* 손으로 쓴 원본과 표 밖 글에는 숫자도 백분율도 없다. 풀이 줄면 거짓이 되는 베낀 확률이 서는 자리이기 때문이다.
     표의 수는 wiki-facts가 코드에서 뽑으므로 표만 수를 든다. "본문 전체에 숫자 없음"은 그 상수 표까지 거짓 빨강으로 읽었다. */
  const source = read('web/wiki/src/pull.md').replace(/^---[\s\S]*?\n---/, '');
  const prose = page.bodyHtml.replace(/<table\b[\s\S]*?<\/table>/gi, ' ').replace(/<[^>]*>/g, ' ');
  for (const [where, body] of [['pull.md', source], ['built pull prose', prose]]) assert(!/[0-9%％]/.test(body), where + ' copies a number by hand: ' + (body.match(/.{0,12}[0-9%％].{0,12}/) || [''])[0].trim());
  assert(/확률/.test(prose) && /상점/.test(prose), 'wiki pull page no longer points searchable text at the live shop odds');
  // Execute the product's pure HTML formatter with Node vm; browser visibility remains pull-gate's axis.
  const formatters = [...main.matchAll(/function shopOdds\(pool\) \{[\s\S]*?\n\}/g)];
  assert.equal(formatters.length, 1, 'expected exactly one function shopOdds(pool) in the product UI code, found ' + formatters.length);
  assert(main.includes("+ shopOdds(pool) + '</em></details>'"), 'the shop banner no longer renders shopOdds(pool) inside details.odds');
  const render = pool => runInNewContext(formatters[0][0] + '\nshopOdds(pool)', { pool, poolOdds }, { timeout: 1000 });
  const parse = rendered => [...rendered.matchAll(/<span><i>([^<]+)<\/i><b>([\d.]+%)<\/b><u>(\d+)<\/u><\/span>/g)].map(m => [m[1], m[2], Number(m[3])]);
  for (const pool of [KEEPERS, KEEPERS.slice(1)]) {
    const rendered = render(pool);
    const parsed = parse(rendered).map(([, pct, n]) => [pct, n]);
    const total = pool.reduce((n, k) => n + pullWeight(k), 0);
    const expected = [k => k.fame >= 10, k => k.fame === 9, k => k.fame <= 8].map(f => {
      const group = pool.filter(f);
      return [(group.reduce((n, k) => n + pullWeight(k), 0) / total * 100).toFixed(1) + '%', group.length];
    });
    assert.deepEqual(parsed, expected, 'shopOdds prints odds that differ from the pool math for a pool of ' + pool.length); assert(!/<canvas\b/i.test(rendered), 'shopOdds renders a canvas, so the odds are not searchable text');
    lines.push('POOL_ODDS ' + JSON.stringify({ population: pool.length, totalWeight: total, odds: parsed, text: rendered.replace(/<[^>]*>/g, ' ') }));
  }
  // 위키는 갈래마다 전체 명단 기준 확률 표를 글자로 든다. 상점이 인쇄하는 그 식을 같은 명단에 돌린 줄과 한 줄도 다르면 안 된다.
  const tables = [...page.bodyHtml.matchAll(/<table\b[\s\S]*?<\/table>/gi)].map(t => [...t[0].matchAll(/<tr\b[\s\S]*?<\/tr>/gi)]
    .map(r => [...r[0].matchAll(/<t[hd]\b[^>]*>([\s\S]*?)<\/t[hd]>/gi)].map(c => c[1].replace(/<[^>]*>/g, '').trim())));
  const wiki = [];
  for (const kind of PULL_KINDS) {
    const want = parse(render(poolFor(KEEPERS, kind.id))).map(([name, pct]) => [name, pct]);
    assert.equal(want.length, 3, kind.name + ' has no printed odds');
    const found = tables.find(rows => JSON.stringify(rows[0]) === '["등급","확률"]' && JSON.stringify(rows.slice(1)) === JSON.stringify(want));
    assert(found, 'wiki pull page lacks the searchable full-roster odds table of ' + kind.name + ': ' + JSON.stringify(want));
    wiki.push(kind.name + ' ' + want.map(r => r.join(' ')).join(', '));
  }
  return 'actual shopOdds HTML text matches full and reduced pools; wiki pull tables carry the same full-roster odds as text (' + wiki.join('; ') + '); wiki prose copies no number; browser visibility owned by pull gate';
});
axis('currency-placeholder', () => {
  assert(read('web/wiki/src/cash-rate.md').includes('[[coin]]'), 'cash-rate.md no longer links [[coin]]');
  const sentence = '골드와 캐시는 나중에 바꿀 수 있는 임시 일반 재화 이름이다.';
  // 임시 이름이라는 기록은 재화를 정의하는 코드 곁에 선다. 플레이어 도움말에 두면 개발 메모가 게임 화면에 뜬다.
  assert(read('web/src/state/wallet.mjs').includes(sentence), 'wallet.mjs no longer records that the currency names are placeholders');
  assert(!JSON.parse(read('web/wiki/dist/pages.json')).find(p => p.id === 'coin').bodyHtml.includes('임시'), 'the player wiki coin page shows the development note about placeholder names'); return 'cash-rate -> coin; placeholder record sits beside the currency code and stays out of the player wiki';
});
axis('payment-sdk-scan', () => {
  const files = [...walk('web/src'), ...walk('src'), 'web/index.html', 'package.json'].filter(p => /\.(mjs|js|html|json)$/.test(p));
  /* 결제 SDK는 패키지 이름이나 도메인으로만 들어온다. 낱말 stripe가 아니라 js.stripe.com, @stripe/, stripe-js,
     from 'stripe'로 잡는 까닭은 영어 사전의 "Striped socks"와 "stripes"가 낱말 stripe를 품어 SDK로 읽히기 때문이다. */
  const sdk = /['"`][^'"`\n]*(?:\bjs\.stripe\.com|@stripe\/|\bstripe-js\b|tosspayments|\btoss\.im\b|iamport|portone|play[ -]?billing|billingclient)|(?:\bfrom|require\(|import\()\s*['"`](?:stripe|tosspayments)\b/i;
  const hits = files.filter(p => sdk.test(source(p)) || /\b(?:Stripe|TossPayments|Iamport)\s*\(/.test(source(p)));
  const raw = files.filter(p => /stripe|toss|iamport|play[ -]?billing/i.test(read(p)));
  lines.push('PAYMENT_RAW_MATCHES ' + JSON.stringify(raw) + '; pitch.mjs stripe is the local field-marking geometry helper and i18n-en.json holds the English words Striped/stripes, neither is an SDK');
  assert(sdk.test("import Stripe from 'stripe'"), 'scan control: import Stripe is no longer detected'); assert(sdk.test("load('https://js.tosspayments.com/v2')"), 'scan control: the tosspayments script is no longer detected');
  // 영어 낱말은 SDK가 아니라는 음성 대조군. 위 두 양성 대조군과 짝으로 서야 범위를 좁힌 정규식이 아무것도 못 잡는 식이 되지 않는다.
  assert(!sdk.test('"Striped socks"') && !sdk.test('"Two white stripes"') && !sdk.test('"A white stripe"'), 'scan control: an English stripe word is detected as a payment SDK');
  assert.equal(hits.length, 0, hits.join(', '));
  assert(/이 빌드에는 결제 경로가 없다/.test(read('web/src/state/inject.mjs')), 'inject.mjs lost the statement that this build has no payment path');
  return `${files.length} product files; payment SDK matches=0; cash is injected only, no real-money sale path at this HEAD`;
});
axis('hosting-declaration', () => { const url = read('tools/live-gate.mjs').match(/const LIVE = "([^"]+)"/)[1]; assert(new URL(url).hostname.endsWith('.github.io'), 'live gate target ' + url + ' is not on github.io, so the hosting declaration and R25 need review'); return url + '; live gate target, not a deployment verification; R25 sale trigger absent'; });

// Existing browser owners are references, never recycled PASS reports.
for (const [name, owner, marker] of [
  ['HUD native buttons', 'entry', 'affordance:every-hud-click-target-is-a-button'],
  ['condition name and icon', 'entry', 'entry:the-condition-slot-paints-an-icon-in-every-band'],
  ['keyboard ESC Tab no-mouse', 'keys', 'keys:the-game-plays-without-a-mouse'],
  ['two movement arrows rendered size', 'mobile', ':arrows-take-a-finger'],
  ['fullscreen optional and unsupported hidden', 'fullscreen', 'unsupported:hidden-and-home-screen-help'],
  ['in-game odds match current pool', 'pull', 'pull:printed-odds-match-the-pool']
]) {
  axis('owner-registration:' + owner + ':' + name, () => { assert(read(`tools/${owner}-gate.mjs`).includes(marker), 'tools/' + owner + '-gate.mjs no longer holds the axis marker ' + marker); return `node tools/${owner}-gate.mjs -> ${marker}; not rerun by readiness gate`; });
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
