import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { cashPrice } from '../web/src/state/wallet.mjs';
import { CONDITION_ITEMS, auditConditions } from './condition-probe.mjs';

// 기존 가격 게이트의 브라우저와 저장 훅을 재사용해 실제 결제 경로를 검사한다.
const out = new URL('../.omo/evidence/p18-p17/', import.meta.url);
mkdirSync(out, { recursive: true });
const results = [];
function check(name, pass, detail = '') { results.push({ name, pass, detail }); console.log((pass ? 'PASS ' : 'FAIL ') + name, detail); }
// 각 조건의 경계와 저장 복원을 두 화면에서 순회할 시간을 확보한다.
const watchdog = setTimeout(() => process.exit(2), 240000);
const browser = await chromium.launch({ executablePath: process.env.LOCALAPPDATA + '/ms-playwright/chromium-1228/chrome-win64/chrome.exe', headless: true });
try {
  // 수락 기준의 데스크톱과 가로 휴대폰 크기를 그대로 검사한다.
  for (const [width, height] of [[1280, 720], [740, 360]]) {
    const context = await browser.newContext({ viewport: { width, height } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const base = 'http://127.0.0.1:10310/web/index.html?seed=20';
    async function ready() {
      await page.locator('#go').click({ force: true });
      await page.waitForFunction(() => typeof window.__shop === 'function');
      await page.evaluate(() => { window.__lockRound(); window.__persist(); window.__shop(true); });
    }
    async function snapshot() { return page.evaluate(() => { window.__persist(); return JSON.parse(localStorage.getItem(window.__saveKey())); }); }
    await page.goto(base + '&preset=rich,veteran');
    await ready();
    const baseline = await snapshot();
    async function restore(entry, met, cash = false) {
      const data = structuredClone(baseline);
      const keeper = data.squad[data.pick];
      // 경계 바로 아래와 경계값을 같은 저장 형식으로 만든다.
      const value = entry.item.condition.min - Number(!met);
      const key = entry.item.condition.key;
      if (key === 'fans') data.fans = value;
      else if (key === 'saves') data.record = { [data.kickers[0]]: { saved: value, conceded: 0 } };
      else keeper[key] = value;
      data.keeper = structuredClone(keeper);
      if (cash) data.wallet.coin = 0;
      await page.evaluate(data => localStorage.setItem(window.__saveKey(), JSON.stringify(data)), data);
      await page.goto(base);
      await ready();
      await page.locator('#shop .tab[data-tab="' + entry.tab + '"]').click({ force: true });
      return page.locator('#shop .card[data-spec="' + entry.tab + '"][data-at="' + entry.rank + '"]');
    }
    function rankOf(data, entry) { return entry.field === 'bot' ? data.bot.tier : entry.field === 'frame' ? data.gear.frame : data.squad[data.pick].worn[entry.field]; }
    for (const entry of CONDITION_ITEMS) {
      let card = await restore(entry, false);
      await card.locator('.condition').scrollIntoViewIfNeeded();
      const before = await snapshot();
      check(width + ':' + entry.tab + ':locked', await card.locator('.buy').isDisabled());
      await card.locator('.buy').evaluate(button => { button.disabled = false; button.click(); });
      let after = await snapshot();
      check(width + ':' + entry.tab + ':handler-blocked', rankOf(after, entry) === rankOf(before, entry) && JSON.stringify(after.wallet) === JSON.stringify(before.wallet));
      if (entry.field !== 'bot') {
        await card.evaluate(card => card.click());
        const all = page.locator('#shop .all');
        check(width + ':' + entry.tab + ':bundle-locked', await all.isDisabled());
        await all.evaluate(button => { button.disabled = false; button.click(); });
        after = await snapshot();
        check(width + ':' + entry.tab + ':bundle-blocked', rankOf(after, entry) === rankOf(before, entry) && JSON.stringify(after.wallet) === JSON.stringify(before.wallet));
      }
      await page.locator('#shop .card[data-spec="' + entry.tab + '"][data-at="' + entry.rank + '"] .condition').click({ force: true });
      const route = ['handling', 'agility'].includes(entry.item.condition.key) ? '#gym' : entry.item.condition.key === 'fans' ? '#gram' : null;
      check(width + ':' + entry.tab + ':route', route ? await page.locator(route).isVisible() : await page.locator('#shop').isHidden());
      card = await restore(entry, true);
      const paidBefore = await snapshot();
      await card.locator('.buy').click({ force: true });
      after = await snapshot();
      check(width + ':' + entry.tab + ':met-buys', rankOf(after, entry) === entry.rank && paidBefore.wallet.coin - after.wallet.coin === entry.item.cost);
      await page.reload(); await ready();
      check(width + ':' + entry.tab + ':reload', rankOf(await snapshot(), entry) === entry.rank);
    }
    // 지갑 갈래를 바꿔도 조건을 우회하지 못하고, 충족하면 기존 캐시 환산액만 낸다.
    const cashEntry = CONDITION_ITEMS[0];
    let cashCard = await restore(cashEntry, false, true);
    const cashBefore = await snapshot();
    await cashCard.locator('.buy').evaluate(button => { button.disabled = false; button.click(); });
    check(width + ':cash-blocked', JSON.stringify((await snapshot()).wallet) === JSON.stringify(cashBefore.wallet));
    cashCard = await restore(cashEntry, true, true);
    const metCash = await snapshot();
    await cashCard.locator('.buy').click({ force: true });
    const cashAfter = await snapshot();
    check(width + ':cash-met-buys', rankOf(cashAfter, cashEntry) === cashEntry.rank && metCash.wallet.cash - cashAfter.wallet.cash === cashPrice(cashEntry.item.cost));
    const bundleCard = await restore(cashEntry, true);
    const bundleBefore = await snapshot();
    await bundleCard.evaluate(card => card.click());
    await page.locator('#shop .all').click({ force: true });
    const bundleAfter = await snapshot();
    check(width + ':bundle-met-buys', rankOf(bundleAfter, cashEntry) === cashEntry.rank && bundleBefore.wallet.coin - bundleAfter.wallet.coin === cashEntry.item.cost);
    const audit = await auditConditions(page);
    check(width + ':text-progress-price', audit.pass, JSON.stringify(audit.rows));
    const card = await restore(CONDITION_ITEMS[0], false);
    await card.locator('.condition').scrollIntoViewIfNeeded();
    await page.evaluate(() => document.fonts.ready);
    // 패널 전환과 썸네일 렌더링이 끝난 상태를 포착한다.
    await page.waitForTimeout(1300);
    await page.screenshot({ path: new URL('condition-' + width + 'x' + height + '.jpg', out).pathname.replace(/^\/(\w:)/, '$1'), type: 'jpeg', quality: 85 });
    check(width + ':runtime', errors.length === 0, errors.join(';'));
    await context.close();
  }
} finally {
  clearTimeout(watchdog);
  await browser.close();
  writeFileSync(new URL('condition-results.json', out), JSON.stringify(results, null, 2));
}
console.log('condition ' + (results.every(row => row.pass) ? 'PASS ' : 'FAIL ') + results.length);
if (results.some(row => !row.pass)) process.exitCode = 1;
