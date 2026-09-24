import { chromium } from 'playwright';
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PULL_KINDS, PULL_BULK, PULL_BONUS, KEEPERS, KICKERS, poolFor } from '../src/roster.mjs';
import { clearDraw } from './draw.mjs';

// 요청한 데스크톱·세로 폰 크기이며 배율 1과 JPEG 85는 원본 글자를 유지하면서 증거 용량을 줄인다.
const SIZES = [[1280, 720], [390, 844]], QUALITY = 85;
// CSS 응답 160ms 뒤의 안정 프레임을 읽는 여유다. 8도는 PORT의 기울임 상한이다.
const SETTLE = 220, MAX_TILT = 8;
// 부족분과 정가가 서로 다른 양수 표본이며 충분 잔고는 기존 rich 프리셋과 같은 규모다.
const SHORT = 24, RICH = 1000000;
// 전체 계측은 여러 브라우저를 순차 사용하므로 180초에 강제 종료한다.
const timer = setTimeout(() => process.exit(1), 180000); timer.unref();
const root = fileURLToPath(new URL('../.omo/evidence/s2/', import.meta.url));
mkdirSync(root, { recursive: true });
const require = createRequire(import.meta.url);
const exe = process.env.LOCALAPPDATA + '/ms-playwright/chromium-1228/chrome-win64/chrome.exe';
const base = 'http://127.0.0.1:10310/web/index.html?seed=20&preset=rich,veteran';
const report = { invocation: 'node tools/pack-gate.mjs', capturedAt: new Date().toISOString(), node: process.version, nodePath: process.execPath, playwright: require('playwright/package.json').version, playwrightPath: require.resolve('playwright'), exe, checks: [], shots: [] };
const check = (scenario, pass, observed) => { report.checks.push({ scenario, pass, observed }); console.log(pass ? 'PASS' : 'FAIL', scenario, JSON.stringify(observed)); };
const response = await fetch(base); check('서버 HTTP 200', response.status === 200, response.status);
const browser = await chromium.launch({ executablePath: exe, headless: true });
report.chrome = await browser.version();
try {
  for (const [width, height] of SIZES) {
    // 경기는 가로 시작 계약을 따르고 상점을 연 뒤 세로로 돌리는 실제 경로를 잰다.
    const page = await browser.newPage({ viewport: { width: Math.max(width, height), height: Math.min(width, height) }, deviceScaleFactor: 1 });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(base); await page.locator('#go').click({ force: true }); await clearDraw(page);
    await page.evaluate(() => window.__shop(true));
    await page.setViewportSize({ width, height });
    await page.evaluate(() => document.fonts.ready);
    // 0은 다음 이벤트 회차에 고장을 발생시켜 실제 브라우저 오류 수집 배선을 확인한다.
    const errorControl = page.waitForEvent('pageerror');
    await page.evaluate(() => setTimeout(() => { throw new Error('팩 계기 양성 대조'); }, 0));
    const caught = await errorControl;
    check(width + ':콘솔 계기 양성 대조', caught.message === '팩 계기 양성 대조' && errors.includes(caught.message), caught.message);
    errors.splice(errors.indexOf(caught.message), 1);
    const shot = async name => { const path = root + `${width}x${height}-${name}.jpg`; await page.screenshot({ path, type: 'jpeg', quality: QUALITY }); report.shots.push({ name, width, height, path }); };
    const inspect = () => page.locator('.pack-card').evaluate(e => {
      const art = e.querySelector('.pack-art'), svg = art.querySelector('svg'), odds = e.querySelector('.odds-link');
      const a = art.getBoundingClientRect(), o = odds.getBoundingClientRect();
      const visible = n => { const r = n.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(n).visibility !== 'hidden'; };
      return { art: visible(svg), svg: svg.outerHTML, below: o.top >= a.bottom, odds: visible(odds), a: a.toJSON(), o: o.toJSON(),
        offers: [...e.querySelectorAll('.pack-offer')].map(offer => ({
          lines: [...offer.querySelector('.promise-lines').children].map(n => ({ text: n.innerText, y: n.getBoundingClientRect().y, height: n.getBoundingClientRect().height, visible: visible(n) })),
          want: +offer.querySelector('button').dataset.want, bonus: offer.querySelector('.bonus')?.innerText,
          floor: offer.querySelector('.guarantee')?.innerText, disabled: offer.querySelector('button').disabled,
          prices: [...offer.querySelectorAll('.px')].map(n => ({ shown: n.innerText, coin: n.dataset.coin, cash: n.dataset.cash, color: getComputedStyle(n.querySelector('b')).color })) })) };
    });
    const motion = () => page.locator('.pack-art').evaluate(e => {
      const s = getComputedStyle(e), matrix = new DOMMatrix(s.transform);
      // 회전행렬 대각합에서 총 각도를 읽는다. 180/π는 라디안을 도로 환산한다.
      const angle = Math.acos(Math.max(-1, Math.min(1, (matrix.m11 + matrix.m22 + matrix.m33 - 1) / 2))) * 180 / Math.PI;
      return { transform: s.transform, angle, outline: s.outlineStyle, outlineWidth: parseFloat(s.outlineWidth), animation: getComputedStyle(e.querySelector('.foil'), '::before').animationName, active: e.getAnimations({ subtree: true }).filter(a => a.playState === 'running').length };
    });
    const artKeys = [];
    for (const kind of PULL_KINDS) {
      await page.locator(`.kind[data-kind="${kind.id}"]`).click();
      await page.locator('.pack-card').scrollIntoViewIfNeeded();
      await page.mouse.move(0, 0);
      const prefix = `${width}:${kind.id}`;
      const rich = await inspect(); artKeys.push(rich.svg);
      check(prefix + ':포장·확률 좌표', rich.art && rich.odds && rich.below && rich.o.bottom <= height && rich.a.top >= 0, rich);
      // 기울어진 부모에서는 같은 줄의 y도 다르므로 글자 높이만큼 떨어져야 다른 줄이다.
      check(prefix + ':약속의 분리', rich.offers.every(o => o.lines.every((l, i) => l.visible && (!i || Math.abs(l.y - o.lines[i - 1].y) >= Math.min(l.height, o.lines[i - 1].height))) && o.bonus === (o.want === PULL_BULK ? `${PULL_BONUS}장 더` : undefined) && o.floor === (kind.floor ? `명성 ${kind.floor} 이상 확정` : undefined)), rich.offers);
      check(prefix + ':충분 잔고 양성 대조', rich.offers.every(o => !o.disabled), rich.offers.map(o => o.disabled));
      await shot(kind.id + '-idle');
      const idle = await motion(); check(prefix + ':대기 반사 양성 대조', idle.active > 0 && idle.animation === 'shop-foil', idle);
      await page.locator('.pack-art svg').evaluate(e => e.style.visibility = 'hidden');
      check(prefix + ':SVG 숨김 검출', !(await inspect()).art, await inspect());
      await page.locator('.pack-art svg').evaluate(e => e.style.visibility = '');
      await page.locator('.odds').evaluate(e => e.parentElement.prepend(e));
      check(prefix + ':확률 위치 고장 검출', !(await inspect()).below, await inspect());
      await page.locator('.odds').evaluate(e => e.parentElement.querySelector('.pack-stage').after(e));
      await page.locator('.promise-lines').last().evaluate(e => e.style.flexDirection = 'row');
      const merged = (await inspect()).offers.at(-1).lines;
      check(prefix + ':약속 합침 검출', merged.some((l, i) => i && Math.abs(l.y - merged[i - 1].y) < Math.min(l.height, merged[i - 1].height)), merged);
      await page.locator('.promise-lines').last().evaluate(e => e.style.flexDirection = '');
      await page.locator('.odds-link').click();
      const odds = await page.locator('.odds em').innerText();
      check(prefix + ':클릭 확률표', await page.locator('.odds').evaluate(e => e.open) && odds.includes('%'), odds);
      const held = await page.evaluate(() => window.__squad().squad);
      const expectedPool = poolFor(KEEPERS.filter(k => !held.includes(k.name)), kind.id);
      const stock = await page.locator('.odds em span:not(.head) u').evaluateAll(es => es.reduce((sum, e) => sum + Number(e.innerText), 0));
      check(prefix + ':확률표 실제 미보유 풀', stock === expectedPool.length && stock > 0, { stock, expected: expectedPool.length });
      await page.locator('.odds-link').press('Enter');
      await page.locator('.odds-link').press('Enter');
      check(prefix + ':키보드 확률표', await page.locator('.odds').evaluate(e => e.open), odds);
      await page.locator('.odds-link').press('Enter');
      await page.locator('.pack-art').hover(); await page.waitForTimeout(SETTLE);
      const hover = await motion(); check(prefix + ':기울임·조작 빛', hover.angle > 0 && hover.angle <= MAX_TILT && hover.active > 0 && hover.animation === 'shop-sweep', hover);
      await shot(kind.id + '-hover');
      // 20도는 허용 상한 밖의 양성 고장 표본이다.
      await page.locator('.pack-art').evaluate(e => { e.style.transition = 'none'; e.style.transform = 'rotate3d(1,0,0,20deg)'; });
      check(prefix + ':기울임 상한 고장 검출', (await motion()).angle > MAX_TILT, await motion());
      await page.locator('.pack-art').evaluate(e => { e.style.transition = ''; e.style.transform = ''; });
      await page.mouse.move(0, 0); await page.locator('.odds-link').focus(); await page.keyboard.press('Shift+F6'); await page.waitForTimeout(SETTLE);
      const focused = await motion(); check(prefix + ':키보드 초점', focused.outline !== 'none' && focused.outlineWidth > 0, focused); await shot(kind.id + '-focus');
      await page.emulateMedia({ reducedMotion: 'reduce' }); await page.waitForTimeout(SETTLE); await page.locator('.pack-art').hover();
      const reduced = await motion(); check(prefix + ':감소 동작 정지', reduced.active === 0 && reduced.transform === 'none' && reduced.animation === 'none', reduced); await shot(kind.id + '-reduced');
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      await page.evaluate(n => { window.__wallet().coin = n; window.__wallet().cash = n; window.__shop(true); }, SHORT);
      await page.locator('.pack-card').scrollIntoViewIfNeeded(); const poor = await inspect();
      const values = rows => rows.map(o => o.prices.map(({ shown, coin, cash }) => ({ shown, coin, cash })));
      check(prefix + ':부족 잔고 정가·빨강·비활성', JSON.stringify(values(rich.offers)) === JSON.stringify(values(poor.offers)) && poor.offers.every(o => o.disabled && o.prices.every(p => p.color === 'rgb(224, 86, 63)')), poor.offers); await shot(kind.id + '-short');
      await page.locator('.pack-offer .px b').first().evaluate((e, short) => e.textContent = String(Number(e.textContent.replaceAll(',', '')) - short), SHORT);
      check(prefix + ':부족분 표시 고장 검출', JSON.stringify(values(rich.offers)) !== JSON.stringify(values((await inspect()).offers)), (await inspect()).offers);
      await page.evaluate(n => { window.__wallet().coin = n; window.__wallet().cash = n; window.__shop(true); }, RICH);
      for (const funded of ['coin', 'cash']) {
        await page.evaluate(({ funded, rich, short }) => { const w = window.__wallet(); w.coin = short; w.cash = short; w[funded] = rich; window.__shop(true); }, { funded, rich: RICH, short: SHORT });
        const mixed = await inspect();
        check(prefix + ':' + funded + '만 충분해도 활성', mixed.offers.every(o => !o.disabled && o.prices.some(p => p.color === 'rgb(224, 86, 63)') && o.prices.some(p => p.color !== 'rgb(224, 86, 63)')), mixed.offers);
      }
      await page.evaluate(n => { window.__wallet().coin = n; window.__wallet().cash = n; window.__shop(true); }, RICH);
    }
    check(width + ':갈래별 다른 문장·색', new Set(artKeys).size === PULL_KINDS.length, artKeys.length);
    await page.locator('.show-legends').click(); await page.locator('.legend-showcase').scrollIntoViewIfNeeded();
    const players = await page.locator('.legend-showcase .player').evaluateAll(es => es.map(e => ({ name: e.querySelector('h3').innerText, stats: e.querySelector('.stats').innerText, image: e.querySelector('img').naturalWidth, bounds: e.getBoundingClientRect().toJSON() })));
    check(width + ':실제 전설 명단·능력치·그림', players.length > 0 && players.every(p => { const k = poolFor(KICKERS, 'legend').find(k => k.name === p.name); return k && p.stats.includes(String(k.finishing)) && p.stats.includes(String(k.power)) && p.image > 0 && p.bounds.width > 0 && p.bounds.height > 0; }), players);
    await page.locator('.legend-showcase h4').scrollIntoViewIfNeeded(); await shot('showcase-idle'); await page.locator('.legend-showcase .market').hover(); await shot('showcase-hover');
    await page.locator('.legend-showcase .market').focus(); await page.keyboard.press('F6'); await page.keyboard.press('Shift+F6'); await shot('showcase-focus');
    const rim = () => page.locator('.legend-showcase').evaluate(e => e.getAnimations({ subtree: true }).filter(a => a.playState === 'running').length);
    check(width + ':금테 움직임 양성 대조', await rim() > 0, await rim());
    await page.emulateMedia({ reducedMotion: 'reduce' }); await page.waitForTimeout(SETTLE); const stoppedRim = await rim(); check(width + ':금테 감소 동작', stoppedRim === 0, stoppedRim); await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.evaluate(n => { window.__wallet().coin = n; window.__wallet().cash = n; window.__shop(true); }, SHORT); await page.locator('.legend-showcase h4').scrollIntoViewIfNeeded(); await shot('showcase-short');
    await page.evaluate(n => { window.__wallet().coin = n; window.__wallet().cash = n; }, RICH);
    const before = await page.evaluate(() => ({ keepers: window.__squad().squad, kickers: window.__kickers() }));
    await page.locator('.market').click();
    check(width + ':이적시장 복귀는 전설 키커', await page.locator('[data-role="kicker"]').getAttribute('aria-pressed') === 'true' && await page.locator('.kind[data-kind="legend"]').getAttribute('aria-current') === 'true', await page.locator('.pack-card').innerText());
    await page.locator('.buy.pull').first().click();
    const after = await page.evaluate(() => ({ keepers: window.__squad().squad, kickers: window.__kickers(), reveal: window.__reveal() }));
    check(width + ':키커 결제·개봉 계약', after.kickers.length === before.kickers.length + 1 && JSON.stringify(after.keepers) === JSON.stringify(before.keepers) && after.reveal.drawn === 1, { before, after });
    check(width + ':콘솔 오류 없음', errors.length === 0, errors);
    await page.close();
  }
} catch (error) { check('실행 완료', false, String(error)); }
finally { await browser.close(); clearTimeout(timer); writeFileSync(root + 'pack.json', JSON.stringify(report, null, 2)); }
const failed = report.checks.filter(c => !c.pass);
console.log(failed.length ? `pack FAIL ${failed.length}` : `pack PASS ${report.checks.length}`);
process.exitCode = failed.length ? 1 : 0;
