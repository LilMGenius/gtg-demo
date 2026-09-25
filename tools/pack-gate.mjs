import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PULL_KINDS, PULL_BULK, KEEPERS, KICKERS, poolFor } from '../src/roster.mjs';
import { clearDraw } from './draw.mjs';

// 뽑기 선반의 자. 팩 갈래마다 배너 하나가 나란히 서고, 배너마다 포장과 그 팩에서 나올 수 있는 선수 셋과
// 약속과 확률과 두 회차 버튼이 한 판에 선다(docs/gamedev economy.md 뽑기 진열).
// 가로 두 크기는 경기가 도는 폭이라 버튼이 굴리지 않고 보여야 한다. 세로 폰은 상점을 연 뒤 돌린 경로라 굴림을 허용한다.
const SIZES = [[1280, 720, true], [844, 390, true], [390, 844, false]];
// 8도는 포장 글자가 읽히는 기울임 상한이다. 220ms는 160ms 응답 전이 뒤의 안정 프레임이다.
const MAX_TILT = 8, SETTLE = 220;
// 부족 잔고 표본과 넉넉한 잔고. 둘 다 기존 rich 프리셋 규모에서 고른 서로 다른 양수다.
const SHORT = 24, RICH = 1000000;
const RED = 'rgb(224, 86, 63)';
const t = setTimeout(() => { console.log('WATCHDOG'); process.exit(1); }, 240000); t.unref();
const shots = fileURLToPath(new URL('../.omo/evidence/s2/', import.meta.url));
mkdirSync(shots, { recursive: true });
const EXE = process.env.LOCALAPPDATA + '/ms-playwright/chromium-1228/chrome-win64/chrome.exe';
const BASE = 'http://127.0.0.1:10310/web/index.html?seed=20&preset=rich,veteran';
const fails = [], notes = [];
const check = (n, ok, d) => (ok ? notes : fails).push(n + ' ' + (typeof d === 'string' ? d : JSON.stringify(d)));
const top = Math.max(...PULL_KINDS.map((k) => k.floor));
const fameOf = (name) => ([...KEEPERS, ...KICKERS].find((k) => k.name === name) || {}).fame || 0;

const b = await chromium.launch({ executablePath: EXE });
try {
  for (const [W, H, fixed] of SIZES) {
    const p = await b.newPage({ viewport: { width: Math.max(W, H), height: Math.min(W, H) } });
    const errs = []; p.on('pageerror', (e) => errs.push(e.message));
    await p.goto(BASE); await p.locator('#go').click({ force: true }); await clearDraw(p);
    await p.evaluate(() => window.__shop(true));
    await p.setViewportSize({ width: W, height: H });
    await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(500);
    const tag = W + 'x' + H;
    const read = () => p.evaluate(() => [...document.querySelectorAll('#shop .banner.kind')].map((e) => {
      const vis = (n) => { if (!n) return false; const r = n.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(n).visibility !== 'hidden'; };
      return { id: e.dataset.kind, art: vis(e.querySelector('.pack-art svg')), guarantee: (e.querySelector('.guarantee') || {}).innerText || '',
        odds: vis(e.querySelector('.odds summary')), fan: [...e.querySelectorAll('.fan figure')].map((f) => ({ name: f.querySelector('figcaption').innerText.trim(), img: f.querySelector('img').naturalWidth, seen: vis(f) })),
        buys: [...e.querySelectorAll('.buy.pull')].map((x) => { const r = x.getBoundingClientRect(); return { want: +x.dataset.want, kind: x.dataset.kind, bottom: Math.round(r.bottom), top: Math.round(r.top), off: x.disabled,
          prices: [...x.querySelectorAll('.px')].map((n) => ({ coin: n.dataset.coin, cash: n.dataset.cash, color: getComputedStyle(n.querySelector('b') || n).color })) }; }),
        times: [...e.querySelectorAll('.promise-lines > span:first-child')].map((n) => n.innerText) };
    }));
    const rich = await read();
    check(tag + ':instrument:every-kind-stands-as-a-banner', rich.map((r) => r.id).join() === PULL_KINDS.map((k) => k.id).join(), rich.map((r) => r.id));
    check(tag + ':banner:art-guarantee-odds-and-two-draws-on-each', rich.every((r) => r.art && r.odds && r.guarantee && r.buys.length === 2 && r.times.join() === '1회,' + PULL_BULK + '회'), rich.map((r) => [r.id, r.art, r.odds, r.guarantee, r.times]));
    const inView = (list) => list.every((r) => r.buys.every((x) => x.top >= 0 && x.bottom <= H));
    const scrolled = await p.evaluate(() => document.getElementById('shop').scrollTop);
    if (fixed) check(tag + ':banner:every-draw-button-shows-without-scrolling', inView(rich) && scrolled === 0, rich.map((r) => r.buys.map((x) => x.top + '-' + x.bottom)).join(' ') + ' of ' + H);
    // 부채꼴은 그 팩에서 나올 수 있는 선수다. 바닥 없는 팩이 전설 얼굴을 걸면 전설이 나온다고 약속하는 그림이 된다.
    const honest = (list) => list.every((r) => r.fan.length <= 3 && r.fan.every((f) => f.img > 0 && f.name) && (r.id === 'legend' ? r.fan.every((f) => fameOf(f.name) >= top) : r.fan.every((f) => fameOf(f.name) < top)));
    check(tag + ':banner:the-fan-shows-only-what-that-pack-can-give', honest(rich), rich.map((r) => r.id + ' ' + r.fan.map((f) => f.name + '(' + fameOf(f.name) + ')').join(' ')));
    check(tag + ':banner:enough-money-enables-both-draws', rich.every((r) => r.buys.every((x) => !x.off)), rich.map((r) => r.buys.map((x) => x.off)));
    await p.screenshot({ path: shots + tag + '-banners.jpg', type: 'jpeg', quality: 80 });

    // 포인터를 따라 기우는 포장. 모서리에 두면 두 축이 다 서고 합성 각이 상한 안이어야 한다.
    const motion = (id) => p.locator('.banner[data-kind="' + id + '"] .pack-art').evaluate((e) => {
      const m = new DOMMatrix(getComputedStyle(e).transform);
      // 회전행렬 대각합에서 총 각도를 읽는다. 180/π는 라디안을 도로 바꾼다.
      const angle = Math.acos(Math.max(-1, Math.min(1, (m.m11 + m.m22 + m.m33 - 1) / 2))) * 180 / Math.PI;
      const s = getComputedStyle(e);
      return { angle, outline: s.outlineStyle, sweep: getComputedStyle(e.querySelector('.foil'), '::before').animationName,
        running: e.closest('.banner').getAnimations({ subtree: true }).filter((a) => a.playState === 'running').length };
    });
    for (const k of PULL_KINDS) {
      const box = await p.locator('.banner[data-kind="' + k.id + '"] .pack-art').boundingBox();
      await p.mouse.move(box.x + box.width * 0.95, box.y + box.height * 0.05); await p.waitForTimeout(SETTLE);
      const hov = await motion(k.id);
      check(tag + ':' + k.id + ':the-pack-leans-toward-the-pointer-within-the-cap', hov.angle > 1 && hov.angle <= MAX_TILT && hov.sweep === 'shop-sweep' && hov.running > 0, hov);
      await p.mouse.move(1, 1); await p.waitForTimeout(SETTLE);
      // 키보드로 옮겨 온 초점만 초점 표시를 켠다. Tab은 이 게임에서 상점 선반을 넘기는 키라 Shift로 키보드 조작 상태를 만든다.
      await p.keyboard.press('Shift'); await p.locator('.banner[data-kind="' + k.id + '"] .pack-art').focus(); await p.waitForTimeout(SETTLE);
      const foc = await motion(k.id);
      check(tag + ':' + k.id + ':keyboard-focus-shows-and-leans', foc.outline !== 'none' && foc.angle > 1 && foc.angle <= MAX_TILT, foc);
    }
    if (W === 1280) await p.screenshot({ path: shots + tag + '-focus.jpg', type: 'jpeg', quality: 80 });

    // 확률은 배너 안의 링크 하나 아래에 접혀 있고 표의 남은 수는 그 팩의 실제 미보유 풀이다.
    await p.click('.banner[data-kind="legend"] .odds summary', { force: true }); await p.waitForTimeout(SETTLE);
    const odds = await p.locator('.banner[data-kind="legend"] .odds').evaluate((e) => ({ open: e.open, text: e.innerText, stock: [...e.querySelectorAll('em span:not(.head) u')].reduce((n, u) => n + Number(u.innerText), 0) }));
    const owned = await p.evaluate(() => window.__squad().squad.slice());
    const want = poolFor(KEEPERS.filter((k) => !owned.includes(k.name)), 'legend').length;
    check(tag + ':banner:odds-open-as-a-table-of-the-remaining-pool', odds.open && odds.text.includes('%') && odds.stock === want, { stock: odds.stock, want });
    await p.click('.banner[data-kind="legend"] .odds summary', { force: true });

    // 확률 표의 칸마다 한가운데를 누르면 그 표가 받아야 한다. 옆 배너가 덮으면 표가 있어도 못 읽는다.
    const occluded = (id) => p.evaluate((id) => {
      const det = document.querySelector('.banner[data-kind="' + id + '"] .odds');
      return [...det.querySelectorAll('em span:not(.head) > *')].filter((c) => { const r = c.getBoundingClientRect(); const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return !det.contains(hit); }).length;
    }, id);
    for (const k of PULL_KINDS) {
      await p.click('.banner[data-kind="' + k.id + '"] .odds summary', { force: true }); await p.mouse.move(1, 1); await p.waitForTimeout(SETTLE);
      check(tag + ':' + k.id + ':the-open-odds-are-not-covered-by-the-other-banner', (await occluded(k.id)) === 0, (await occluded(k.id)) + ' covered cells');
      if (k.id === 'town' && fixed) {
        const lift = await p.addStyleTag({ content: '#shop .banner:has(.odds[open]){z-index:auto}' }); await p.waitForTimeout(SETTLE);
        check(tag + ':control:an-unlifted-banner-reddens-the-cover-axis', (await occluded('town')) > 0 || W < 1000, (await occluded('town')) + ' covered');
        await lift.evaluate((n) => n.remove());
      }
      await p.click('.banner[data-kind="' + k.id + '"] .odds summary', { force: true });
    }
    // 닫기도 가로 두 크기에서 굴리지 않고 보여야 한다. 상점을 여는 사람은 닫는 길부터 찾는다.
    if (fixed) { const c = await p.locator('#shop .close').boundingBox(); check(tag + ':banner:close-shows-without-scrolling', c && c.y >= 0 && c.y + c.height <= H, c); }

    // 감소 동작 설정에서는 대기 빛, 금빛 회전, 기울임이 다 멈춘다.
    await p.emulateMedia({ reducedMotion: 'reduce' });
    const fanAt = () => p.evaluate(() => [...document.querySelectorAll('.banner.legend .fan figure')].map((f) => getComputedStyle(f).rotate + ' ' + getComputedStyle(f).translate).join('|'));
    const fanRest = await fanAt();
    const box = await p.locator('.banner[data-kind="legend"] .pack-art').boundingBox();
    await p.mouse.move(box.x + box.width * 0.95, box.y + 2); await p.waitForTimeout(SETTLE);
    const still = await p.evaluate(() => ({ running: document.querySelector('#shop .banners').getAnimations({ subtree: true }).filter((a) => a.playState === 'running').length,
      transform: getComputedStyle(document.querySelector('.banner.legend .pack-art')).transform }));
    const fanHover = await fanAt();
    check(tag + ':banner:reduced-motion-stops-everything', still.running === 0 && still.transform === 'none' && fanHover === fanRest, { ...still, fan: fanHover === fanRest ? 'still' : fanRest + ' -> ' + fanHover });
    await p.emulateMedia({ reducedMotion: 'no-preference' }); await p.mouse.move(1, 1);

    // 모자란 잔고는 값을 바꾸지 않고 붉게 칠하고 버튼을 끈다. 같은 물건이 지갑마다 다른 수로 읽히면 안 된다.
    await p.evaluate((n) => { window.__wallet().coin = n; window.__wallet().cash = n; window.__shop(true); }, SHORT); await p.waitForTimeout(SETTLE);
    const poor = await read();
    const values = (l) => l.map((r) => r.buys.map((x) => x.prices.map((q) => q.coin + '/' + q.cash).join()).join('|')).join(' ');
    check(tag + ':banner:short-money-keeps-the-price-reddens-and-disables', values(rich) === values(poor) && poor.every((r) => r.buys.every((x) => x.off && x.prices.every((q) => q.color === RED))), values(poor));
    if (W === 1280) await p.screenshot({ path: shots + tag + '-short.jpg', type: 'jpeg', quality: 80 });
    await p.evaluate((n) => { window.__wallet().coin = n; window.__wallet().cash = n; window.__shop(true); }, RICH); await p.waitForTimeout(SETTLE);

    // 대조군 둘. 버튼을 화면 밖으로 밀어낸 판과 전설 얼굴을 동네 배너에 건 판이 각 축을 붉혀야 계기가 산다.
    if (fixed) {
      const planted = await p.addStyleTag({ content: '#shop .banner{--pack-h:600px}' }); await p.waitForTimeout(SETTLE);
      const pushed = await read();
      check(tag + ':control:a-pushed-down-button-reddens-the-view-axis', !inView(pushed), pushed.map((r) => r.buys.map((x) => x.bottom)).join(' '));
      // 심은 규칙을 걷는다. 남겨 두면 뒤의 클릭이 부풀린 배치 위에서 다른 버튼을 누른다.
      await planted.evaluate((n) => n.remove());
      await p.evaluate(() => window.__shop(true));
    }
    await p.evaluate((name) => { document.querySelector('.banner[data-kind="town"] .fan figcaption').innerText = name; }, poolFor(KEEPERS, 'legend')[0].name);
    check(tag + ':control:a-legend-face-on-the-open-pack-reddens-the-honesty-axis', !honest(await read()), 'planted');
    await p.evaluate(() => window.__shop(true)); await p.waitForTimeout(SETTLE);


    // 동네 풀을 열 장씩 비운다. 전설 아래가 바닥나도 부채꼴이 전설 얼굴로 채워지면 안 되고,
    // 한도와 품절 글자는 값을 덮지 않는다(버튼 안 두 글자 상자가 겹치지 않는가).
    if (W === 1280) {
      for (let i = 0; i < 6; i += 1) {
        const open = await p.locator('.banner[data-kind="town"] .buy[data-want="10"]:not(:disabled)').count();
        if (!open) break;
        await p.click('.banner[data-kind="town"] .buy[data-want="10"]', { force: true }); await p.waitForTimeout(200);
        await p.evaluate(() => { document.getElementById('pull').hidden = true; window.__shop(true); }); await p.waitForTimeout(SETTLE);
      }
      const drained = await read();
      const town = drained.find((r) => r.id === 'town');
      check(tag + ':banner:a-drained-open-pack-never-borrows-a-legend-face', honest(drained), town.fan.map((f) => f.name + '(' + fameOf(f.name) + ')').join(' ') || 'empty fan');
      const clash = await p.evaluate(() => [...document.querySelectorAll('.banner .buy.pull')].filter((x) => { const u = x.querySelector('u'); const i = x.querySelector('i'); if (!u || !i) return false; const a = u.getBoundingClientRect(), b = i.getBoundingClientRect(); return a.bottom > b.top + 1 && a.top < b.bottom - 1 && a.right > b.left && a.left < b.right; }).map((x) => x.dataset.kind + x.dataset.want));
      const labels = await p.evaluate(() => [...document.querySelectorAll('.banner .buy.pull u')].map((u) => u.innerText));
      check(tag + ':banner:a-limit-label-never-covers-the-price', labels.length > 0 && clash.length === 0, { labels, clash });
      await p.screenshot({ path: shots + tag + '-drained.jpg', type: 'jpeg', quality: 80 });
    }


    // 개봉. 봉인은 산 팩의 포장이고, 두 장 이상이면 보이는 전부 열기가 서며, 쌓인 장은 얼굴을 든다.
    if (W === 1280) {
      // 앞 절이 동네 풀을 비웠으므로 새로 연 판에서 잰다. 저장이 새로 고침을 넘어 살아남으므로 저장부터 지운다.
      await p.evaluate(() => localStorage.clear()); await p.goto(BASE); await p.locator('#go').click({ force: true }); await clearDraw(p);
      await p.evaluate(() => window.__shop(true)); await p.waitForTimeout(SETTLE);
      const sealOf = () => p.evaluate(() => (document.querySelector('#pull .now .seal svg') || {}).getAttribute?.('aria-label') || '');
      await p.click('.banner[data-kind="legend"] .buy[data-want="10"]', { force: true }); await p.waitForTimeout(120);
      const legendSeal = await sealOf();
      const skipSeen = await p.locator('#pull .skip').isVisible().catch(() => false);
      await p.click('#pull .skip', { force: true }); await p.waitForTimeout(300);
      const opened = await p.evaluate(() => ({ r: window.__reveal(), faces: [...document.querySelectorAll('#pull .done i img')].map((i) => i.naturalWidth), skip: document.querySelectorAll('#pull .skip').length }));
      check(tag + ':reveal:the-seal-is-the-pack-that-was-bought', /전설/.test(legendSeal), legendSeal);
      check(tag + ':reveal:a-visible-skip-opens-every-card', skipSeen && opened.r.shown === opened.r.drawn && opened.skip === 0, { skipSeen, ...opened.r, skipAfter: opened.skip });
      check(tag + ':reveal:every-stacked-card-shows-a-face', opened.faces.length === opened.r.drawn - 1 && opened.faces.every((n) => n > 0), opened.faces.length + ' faces of ' + (opened.r.drawn - 1));
      await p.evaluate(() => { document.getElementById('pull').hidden = true; window.__shop(true); }); await p.waitForTimeout(SETTLE);
      await p.click('.banner[data-kind="town"] .buy[data-want="1"]', { force: true }); await p.waitForTimeout(120);
      const townSeal = await sealOf();
      const single = await p.evaluate(() => document.querySelectorAll('#pull .skip').length);
      // 대조군. 다른 팩을 사면 봉인의 글자가 바뀌어야 봉인 축이 산 팩을 읽고 있는 것이다. 한 장은 건너뛸 것이 없다.
      check(tag + ':control:another-pack-changes-the-seal-and-one-card-has-no-skip', /동네/.test(townSeal) && single === 0, { townSeal, single });
      await p.evaluate(() => { document.getElementById('pull').hidden = true; window.__shop(true); }); await p.waitForTimeout(SETTLE);
    }
    // 키커 자리에서 전설 한 장. 값이 나가고 키커가 하나 늘고 개봉이 열린다.
    if (W === 1280) {
      await p.click('[data-role="kicker"]', { force: true }); await p.waitForTimeout(SETTLE);
      const before = await p.evaluate(() => ({ ...window.__squad(), kickers: window.__kickers() }));
      await p.click('.banner[data-kind="legend"] .buy[data-want="1"]', { force: true });
      await p.waitForTimeout(400);
      const after = await p.evaluate(() => ({ ...window.__squad(), kickers: window.__kickers(), shown: !document.getElementById('pull').hidden }));
      check(tag + ':banner:a-kicker-legend-draw-pays-and-opens', after.kickers.length === before.kickers.length + 1 && after.squad.length === before.squad.length && after.shown, { before: before.kickers.length, after: after.kickers.length, shown: after.shown });
    }
    check(tag + ':console:no-errors', errs.length === 0, errs.slice(0, 2).join(' | ') || 'clean');
    await p.close();
  }
} catch (e) { check('instrument:run-completed', false, String(e).slice(0, 300)); }
await b.close();
if (notes.length) console.log(notes.map((x) => '  ok   ' + x).join('\n'));
if (fails.length) console.log(fails.map((x) => '  FAIL ' + x).join('\n'));
console.log(fails.length ? 'pack FAIL ' + fails.length : 'pack PASS ' + notes.length);
process.exit(fails.length ? 1 : 0);
