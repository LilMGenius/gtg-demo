import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// title.css의 가로 전용 계약을 모든 창과 상점 갈래에서 같은 방식으로 읽는다.
const out = new URL('../.omo/evidence/p18-p17/', import.meta.url);
mkdirSync(out, { recursive: true });
const rows = [];
const check = (name, pass, observed) => { rows.push({ name, pass, observed }); console.log((pass ? 'PASS ' : 'FAIL ') + name, JSON.stringify(observed)); };
// 세 화면에서 모든 창을 열고 스크린샷까지 남길 시간이다.
const timer = setTimeout(() => { console.log('WATCHDOG'); process.exit(1); }, 120000);
const browser = await chromium.launch({ executablePath: process.env.LOCALAPPDATA + '/ms-playwright/chromium-1228/chrome-win64/chrome.exe' });
try {
  // 세로 회전 안내와 요청된 두 가로 휴대폰 크기를 직접 대조한다.
  for (const [width, height] of [[390, 844], [844, 390], [740, 360]]) {
    const ctx = await browser.newContext({ viewport: { width: Math.max(width, height), height: Math.min(width, height) } });
    const p = await ctx.newPage();
    const errors = []; p.on('pageerror', error => errors.push(error.message));
    // 가격 게이트와 같은 씨앗과 첫 진입 완료 프리셋을 사용한다.
    await p.goto('http://127.0.0.1:10310/web/index.html?seed=20&preset=rich,veteran');
    await p.locator('#go').click({ force: true });
    await p.waitForFunction(() => typeof window.__shop === 'function');
    await p.evaluate(() => window.__lockRound());
    await p.setViewportSize({ width, height });
    const inspect = () => p.evaluate(() => {
      const e = document.getElementById('rotate'), r = e.getBoundingClientRect();
      const visible = getComputedStyle(e).display !== 'none' && r.width > 0 && r.height > 0;
      // 화면 중앙의 실제 적중 대상까지 읽어 표시만 되고 다른 창 밑에 깔린 안내를 잡는다.
      const front = Boolean(document.elementFromPoint(innerWidth / 2, innerHeight / 2)?.closest('#rotate'));
      return { visible, front };
    });
    const expect = width < height;
    const assertSurface = async name => { const got = await inspect(); check(width + ':' + name, expect ? got.visible && got.front : !got.visible && !got.front, got); };
    const shot = async name => {
      await p.evaluate(() => document.fonts.ready);
      // 기존 진입 전환 대기와 JPEG 85를 재사용해 검토할 화면만 압축 저장한다.
      await p.waitForTimeout(1300);
      await p.screenshot({ path: fileURLToPath(new URL('c-' + name + '-' + width + 'x' + height + '.jpg', out)), type: 'jpeg', quality: 85 });
    };
    await assertSurface('pitch');
    await p.evaluate(() => window.__shop(true));
    const tabs = await p.locator('#shop .tab').evaluateAll(es => es.map(e => e.dataset.tab));
    for (const tab of tabs) {
      // 세로 상태에서는 안내 뒤의 갈래를 준비할 뿐, 사용자가 안내를 뚫고 클릭했다고 주장하지 않는다.
      await p.locator('#shop .tab[data-tab="' + tab + '"]').evaluate(e => e.click());
      await assertSurface('shop-' + tab);
    }
    await p.locator('#shop .tab[data-tab="pull"]').evaluate(e => e.click());
    await assertSurface('pack'); await shot('pack');
    await p.locator('#shop .show-legends').evaluate(e => e.click());
    await assertSurface('legend');
    if (expect) await shot('legend');
    await p.evaluate(() => window.__shop(false));
    for (const hook of ['__roster', '__gym', '__gram', '__me', '__wiki']) {
      await p.evaluate(hook => window[hook](true), hook); await assertSurface(hook);
      await p.evaluate(hook => window[hook](false), hook);
    }
    if (expect) {
      const hide = await p.addStyleTag({ content: '#rotate{display:none!important}' });
      check(width + ':control:hidden-prompt-is-rejected', !(await inspect()).visible, await inspect());
      await hide.evaluate(e => e.remove()); await assertSurface('control-restored');
    }
    check(width + ':runtime', errors.length === 0, errors);
    await ctx.close();
  }
} finally { clearTimeout(timer); await browser.close(); writeFileSync(new URL('c-orientation-results.json', out), JSON.stringify(rows, null, 2)); }
console.log('orientation ' + (rows.every(row => row.pass) ? 'PASS ' : 'FAIL ') + rows.length);
if (rows.some(row => !row.pass)) process.exitCode = 1;
