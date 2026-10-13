import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { impactBase, statImpact, statHeld } from '../web/src/state/impact.mjs';
import { fxParts } from '../web/src/ui/impact-view.mjs';
import { placeTip } from '../web/src/ui/stat-tip.mjs';
import { STAT_KNEE, STAT_TOP, statValue } from '../src/chain.mjs';

// 능력치 팝업의 자. 훈련장과 내 정보의 칸 위에 마우스를 올리거나 키보드 초점을 두거나 손가락으로 길게 누르면
// 팝업 하나가 서고, 팝업은 화면 안에 있고, 설명하는 칸을 가리지 않고, 적힌 수가 제품이 같은 키퍼로 재는 수와 같고,
// Esc가 팝업만 닫는지를 가로 폰 셋과 태블릿과 데스크톱 둘에서 잰다. 한국어 판은 글자까지, 영어 판은 수와 한글 없음까지 같아야 한다.
// 표본 범위: 만렙 표본(preset=maxed, 성장 열다섯 칸 전부 10)에서 세 칸을 본다. 한 칸은 손으로 11까지 올려 소프트캡 위의 줄을 잰다.
// --plant는 팝업을 칸 위에 올려 겹침 축이 빨개지는지 보는 대조군이고 빨강으로 끝나는 것이 정상이다.
// --shots <절대경로>는 폭마다 팝업이 선 화면을 JPEG(긴 변 1600 이하)로 남긴다.
const PLANT = process.argv.includes('--plant');
const SHOTS = process.argv.includes('--shots') ? process.argv[process.argv.indexOf('--shots') + 1] : '';
// 판 하나가 열 개의 시나리오를 돈다. 부하가 큰 기계에서 이 값으로 모자라면 폭을 줄이지 말고 이 값을 올린다.
const t = setTimeout(() => { console.log('WATCHDOG'); process.exit(1); }, 280000);
t.unref();
const EXE = process.env.LOCALAPPDATA + '/ms-playwright/chromium-1228/chrome-win64/chrome.exe';
const fails = [], notes = [];
const check = (n, ok, d) => (ok ? notes : fails).push(n + ' ' + d);
const HANGUL = /[가-힣]/;
const nums = (s) => s.match(/\d+(?:\.\d+)?/g) || [];
/* 폰은 가로로 든다. 세로로 들면 판이 가로로 돌려 달라는 안내만 띄워서(index.html) 창이 열리지 않는다. 그래서 ALIGN의 390과 430은
   가로 폰의 짧은 변이고 mobile-gate가 쓰는 844x390과 같은 꼴이다. 740x360은 이 판이 알려진 가장 좁은 가로 폰이다.
   768은 태블릿 가로 1024x768이다. 폰은 손가락, 나머지는 마우스와 키보드로 연다. */
const VIEWS = [
  { w: 740, h: 360, touch: true }, { w: 844, h: 390, touch: true }, { w: 932, h: 430, touch: true },
  { w: 1024, h: 768, touch: false }, { w: 1280, h: 720, touch: false }, { w: 1920, h: 1080, touch: false }
];
// 한 폭에서 보는 능력치 셋. 올린 칸(소프트캡 위일 수 있다)과 그냥 칸 둘이다.
const STATS = ['diving', 'handling', 'focus'];
const hits = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;

// 배치 함수의 시험. 폭 다섯과 칸 위치를 훑어 어느 자리에서도 겹침이 없고 화면 안인지, 심은 겹침 판정이 잡히는지 본다.
function placement() {
  let bad = 0, total = 0;
  for (const v of VIEWS) {
    for (let y = 0; y + 60 <= v.h; y += 53) {
      for (let x = 0; x + 70 <= v.w; x += 47) {
        const cell = { left: x, top: y, right: x + 70, bottom: y + 60 };
        const size = { w: Math.min(280, v.w - 16), h: 200 };
        const p = placeTip(cell, size, { w: v.w, h: v.h });
        const box = { left: p.left, top: p.top, right: p.left + size.w, bottom: p.top + size.h };
        const inside = box.left >= 0 && box.top >= 0 && box.right <= v.w && box.bottom <= v.h;
        total += 1;
        if (hits(box, cell) || !inside) bad += 1;
      }
    }
  }
  check('placement:no-cell-position-overlaps-or-leaves-the-screen', bad === 0, bad + ' of ' + total + ' bad');
  const planted = { left: 100, top: 100, right: 170, bottom: 160 };
  check('placement:overlap-predicate-catches-a-planted-cover', hits({ left: 120, top: 110, right: 400, bottom: 300 }, planted) && !hits({ left: 182, top: 100, right: 460, bottom: 300 }, planted), 'planted rect');
}

const port = 20000 + Math.floor(Math.random() * 30000);
const server = spawn(process.execPath, ['tools/serve.mjs', String(port)], { cwd: new URL('../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'), stdio: 'ignore' });
const base = 'http://127.0.0.1:' + port;

async function session(browser, view, lang) {
  const ctx = await browser.newContext({ viewport: { width: view.w, height: view.h }, hasTouch: view.touch, isMobile: view.touch });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push(String(e)));
  await p.goto(base + '/web/index.html?seed=20&preset=maxed,veteran&lang=' + lang, { waitUntil: 'load' });
  await p.click('#go', { force: true });
  await p.waitForTimeout(1300);
  return { ctx, p, errs };
}

async function run(browser, view, lang, surface, stats) {
  const { ctx, p, errs } = await session(browser, view, lang);
  const tag = view.w + 'x' + view.h + (lang === 'en' ? 'en' : '') + ':' + surface + ':';
  try {
    const cdp = view.touch ? await ctx.newCDPSession(p) : null;
    const pull = async (x, y, ms) => {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
      await p.waitForTimeout(ms);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    };
    const sel = (s) => (surface === 'gym' ? '#gym .row button[data-k="' + s + '"]' : '#me .grid > span[data-k="' + s + '"]');
    await p.evaluate((f) => window[f](true), surface === 'gym' ? '__gym' : '__me');
    // 손으로 한 칸 올려 소프트캡 위의 값을 만든다. 만렙 표본이라 올린 칸은 10을 넘는다.
    if (surface === 'gym' && lang === 'ko' && view.w === 1280) {
      for (let i = 0; i < 5 && (await p.evaluate(() => window.__keeperStats().diving)) <= STAT_KNEE; i += 1) {
        await p.click(sel('diving'), { force: true });
        await p.waitForTimeout(80);
      }
      await p.evaluate(() => window.__gym(false));
      await p.evaluate(() => window.__gym(true));
    }
    await p.waitForFunction((b) => { const f = [...document.querySelectorAll(b + ' [data-fx]')]; return f.length && !f.some((e) => e.textContent.includes('…')); }, '#' + surface, { timeout: 60000 });
    const keeper = await p.evaluate(() => window.__keeperStats());
    const city = await p.evaluate(() => window.__gear().city);
    const base0 = impactBase(keeper, city);
    for (let i = 0; i < stats.length; i += 1) {
      const s = stats[i];
      const how = view.touch ? (surface === 'gym' ? 'press' : 'tap') : i === 1 ? 'focus' : 'hover';
      await p.locator(sel(s)).scrollIntoViewIfNeeded();
      await p.waitForTimeout(150);
      const box = await p.locator(sel(s)).boundingBox();
      const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
      if (how === 'press') await pull(cx, cy, 700);
      else if (how === 'tap') await pull(cx, cy, 60);
      else if (how === 'hover') await p.mouse.move(cx, cy);
      else { await p.keyboard.press('Shift'); await p.focus(sel(s)); }
      await p.waitForFunction(() => { const e = document.getElementById('statTip'); return e && !e.hidden && !e.textContent.includes('…'); }, null, { timeout: 15000 }).catch(() => {});
      await p.waitForTimeout(350);
      if (PLANT) {
        await p.evaluate((c) => { const e = document.getElementById('statTip'); const r = document.querySelector(c).getBoundingClientRect(); e.style.left = r.left + 'px'; e.style.top = r.top + 'px'; }, sel(s));
        await p.waitForTimeout(80);
      }
      const seen = await p.evaluate((c) => {
        const e = document.getElementById('statTip');
        const r = e.getBoundingClientRect(), q = document.querySelector(c).getBoundingClientRect();
        const rect = (x) => ({ left: x.left, top: x.top, right: x.right, bottom: x.bottom });
        const lines = (k) => [...e.querySelectorAll('[data-tip="' + k + '"] span')].map((x) => x.textContent);
        return { hidden: e.hidden, shown: getComputedStyle(e).display !== 'none' && r.width > 0 && r.height > 0, tip: rect(r), cell: rect(q),
          view: { w: document.documentElement.clientWidth, h: innerHeight }, held: lines('held'), next: lines('next'),
          knee: (e.querySelector('[data-tip="knee"]') || {}).textContent || '', head: (e.querySelector('h5') || {}).textContent || '',
          role: e.getAttribute('role'), described: document.querySelector(c).getAttribute('aria-describedby') };
      }, sel(s));
      const n = tag + s + ':' + how + ':';
      check(n + 'popup-visible', seen.shown && !seen.hidden, JSON.stringify(seen.tip));
      check(n + 'popup-inside-viewport', seen.tip.left >= 0 && seen.tip.top >= 0 && seen.tip.right <= seen.view.w && seen.tip.bottom <= seen.view.h, JSON.stringify(seen.tip) + ' in ' + seen.view.w + 'x' + seen.view.h);
      check(n + 'popup-clear-of-its-cell', !hits(seen.tip, seen.cell), 'tip ' + JSON.stringify(seen.tip) + ' cell ' + JSON.stringify(seen.cell));
      check(n + 'popup-is-a-described-tooltip', seen.role === 'tooltip' && seen.described === 'statTip', seen.role + ' ' + seen.described);
      // 수는 같은 키퍼를 노드에서 제품 함수로 잰 값이다. 화면의 두 줄과 소프트캡 줄이 그 값과 같은지 본다.
      const wantHeld = fxParts(statHeld(keeper, s, base0, city)), wantNext = fxParts(statImpact(keeper, s, base0, city));
      const v = keeper[s];
      if (lang === 'ko') {
        check(n + 'held-line-equals-product-measure', JSON.stringify(seen.held) === JSON.stringify(wantHeld), JSON.stringify(seen.held) + ' want ' + JSON.stringify(wantHeld));
        check(n + 'next-line-equals-product-measure', JSON.stringify(seen.next) === JSON.stringify(wantNext), JSON.stringify(seen.next) + ' want ' + JSON.stringify(wantNext));
      } else {
        check(n + 'held-numbers-equal-product-measure', JSON.stringify(nums(seen.held.join(' '))) === JSON.stringify(nums(wantHeld.join(' '))) && !HANGUL.test(seen.held.join('')), JSON.stringify(seen.held) + ' want numbers of ' + JSON.stringify(wantHeld));
        check(n + 'next-numbers-equal-product-measure', JSON.stringify(nums(seen.next.join(' '))) === JSON.stringify(nums(wantNext.join(' '))) && !HANGUL.test(seen.next.join('')), JSON.stringify(seen.next) + ' want numbers of ' + JSON.stringify(wantNext));
        check(n + 'whole-popup-has-no-hangul', !HANGUL.test(seen.head + seen.knee), seen.head + ' / ' + seen.knee);
      }
      const wantKnee = v > STAT_KNEE ? [STAT_KNEE, statValue(v).toFixed(1), STAT_TOP] : [STAT_KNEE, STAT_TOP];
      check(n + 'knee-line-equals-product-curve', JSON.stringify(nums(seen.knee)) === JSON.stringify(wantKnee.map(String)), JSON.stringify(nums(seen.knee)) + ' want ' + JSON.stringify(wantKnee) + ' at ' + v);
      check(n + 'head-shows-the-stat-value', nums(seen.head).join() === String(v), seen.head + ' want value ' + v);
      if (SHOTS && s === stats[0]) {
        mkdirSync(SHOTS, { recursive: true });
        await p.screenshot({ path: SHOTS + '/stattip-' + view.w + 'x' + view.h + '-' + surface + '-' + lang + '.jpg', type: 'jpeg', quality: 82,
          clip: { x: 0, y: 0, width: Math.min(view.w, 1600), height: Math.min(view.h, 1000) } });
      }
      await p.keyboard.press('Escape');
      await p.waitForTimeout(120);
      const after = await p.evaluate((f) => ({ tipHidden: document.getElementById('statTip').hidden, panelOpen: !document.getElementById(f).hidden }), surface);
      check(n + 'esc-closes-the-popup-and-keeps-the-window', after.tipHidden && after.panelOpen, JSON.stringify(after));
      if (!view.touch) await p.mouse.move(2, 2);
      else await p.evaluate(() => document.activeElement && document.activeElement.blur());
    }
    check(tag + 'console-no-errors', errs.length === 0, errs.slice(0, 2).join(' | ') || 'clean');
  } finally {
    await ctx.close();
  }
}

try {
  placement();
  for (let i = 0; i < 100; i += 1) {
    try { if ((await fetch(base + '/web/index.html')).ok) break; } catch { /* 서버가 아직 안 섰다 */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  const browser = await chromium.launch({ executablePath: EXE });
  try {
    for (const view of PLANT ? [VIEWS[4]] : VIEWS) {
      for (const surface of ['gym', 'me']) await run(browser, view, 'ko', surface, PLANT ? [STATS[0]] : STATS);
    }
    // 영어 판. 같은 수가 번역을 거쳐도 그대로이고 한글이 안 남는지는 데스크톱 한 폭과 폰 한 폭에서 본다.
    if (!PLANT) for (const view of [VIEWS[1], VIEWS[4]]) for (const surface of ['gym', 'me']) await run(browser, view, 'en', surface, STATS);
  } finally {
    await browser.close();
  }
} finally {
  server.kill();
}
for (const n of notes) console.log('  ok   ' + n);
for (const f of fails) console.log('  FAIL ' + f);
console.log(fails.length ? 'stattip FAIL ' + fails.length : 'stattip PASS ' + notes.length);
process.exitCode = fails.length ? 1 : 0;
