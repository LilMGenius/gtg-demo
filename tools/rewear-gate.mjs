import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { COSMETIC_FIELDS, cosmeticTiers, ownsCosmetic, HAIRS, BEARDS, TATTOOS } from '../web/src/state/gear.mjs';

// 기존 저장 훅과 실제 구매 버튼을 재사용해 보유와 착용을 따로 검사한다.
const out = new URL('../.omo/evidence/p18-p17/', import.meta.url);
mkdirSync(out, { recursive: true });
const rows = [];
const check = (name, pass, data = '') => { rows.push({ name, pass, data }); console.log((pass ? 'PASS ' : 'FAIL ') + name, data); };
// 세 외형 선반의 왕복과 두 화면의 재시작을 마칠 시간이다.
const timer = setTimeout(() => { console.log('WATCHDOG'); process.exit(1); }, 240000);
const browser = await chromium.launch({ executablePath: process.env.LOCALAPPDATA + '/ms-playwright/chromium-1228/chrome-win64/chrome.exe' });
try {
  // 옛 저장은 보유로 표시하던 아래 등급을 이어받고, 새 저장의 구입하지 않은 중간 등급은 열지 않는다.
  check('legacy:lower-tiers-remain-owned', BEARDS.every(item => ownsCosmetic({ beard: BEARDS.at(-1).beard }, 'beard', item.beard)));
  check('control:unbought-tier-is-not-owned', !ownsCosmetic({ beard: 3, beardOwned: [0, 3] }, 'beard', 2));
  check('control:invalid-owned-ranks-are-rejected', cosmeticTiers({ beard: 0, beardOwned: [-1, 99, '1'] }, 'beard').length === 1);
  // 수락 기준에 쓰는 넓은 화면과 짧은 가로 화면이다.
  for (const [width, height] of [[1280, 720], [740, 360]]) {
    const ctx = await browser.newContext({ viewport: { width, height } });
    const p = await ctx.newPage();
    const errors = [];
    p.on('pageerror', error => errors.push(error.message));
    const base = 'http://127.0.0.1:10310/web/index.html?seed=20';
    async function ready() {
      await p.locator('#go').click({ force: true });
      await p.waitForFunction(() => typeof window.__shop === 'function');
      await p.evaluate(() => { window.__lockRound(); window.__shop(true); });
    }
    const snapshot = () => p.evaluate(() => { window.__persist(); return JSON.parse(localStorage.getItem(window.__saveKey())); });
    await p.goto(base + '&preset=rich,veteran'); await ready();
    const initial = await snapshot();
    initial.fans = TATTOOS.at(-1).condition.min;
    await p.evaluate(data => localStorage.setItem(window.__saveKey(), JSON.stringify(data)), initial);
    await p.goto(base); await ready();
    const catalogue = { hair: HAIRS, beard: BEARDS, ink: TATTOOS };
    for (const field of COSMETIC_FIELDS) {
      const list = catalogue[field];
      const tab = () => p.locator('#shop .tab[data-tab="' + field + '"]').click({ force: true });
      const card = rank => p.locator('#shop .card[data-spec="' + field + '"][data-at="' + rank + '"]');
      const buy = rank => card(rank).locator('.buy').click({ force: true });
      await tab();
      if (field === 'beard') {
        // 첫 유료 수염, 마지막 색, 미구매 수염의 시착 색, 무료 면도의 순서로 G2 인계 사례를 재현한다.
        await buy(1);
        await card(1).locator('.skin').last().click({ force: true });
        await card(2).locator('.skin').last().click({ force: true });
        const before = await snapshot();
        await buy(0);
        const after = await snapshot(), worn = after.squad[after.pick].worn;
        check(width + ':shave:free-and-clean', worn.beard === 0 && worn.beardSkin === 0 && JSON.stringify(before.wallet) === JSON.stringify(after.wallet));
        check(width + ':shave:no-swatches', await card(0).locator('.skin').count() === 0);
        check(width + ':shave:wearing-state', (await card(0).locator('.buy').innerText()) === '착용' && await card(0).locator('.buy').isDisabled());
        await p.reload(); await ready(); await tab();
        const restored = await snapshot();
        check(width + ':shave:reload', restored.squad[restored.pick].worn.beard === 0 && restored.squad[restored.pick].worn.beardSkin === 0);
        // 기존 진입 대기와 같은 시간 뒤에 면도와 다시 입을 유료 수염이 함께 보이는 화면을 저장한다.
        await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(1300);
        await p.screenshot({ path: fileURLToPath(new URL('b-shave-' + width + 'x' + height + '.jpg', out)), type: 'jpeg', quality: 85 });
      }
      const top = list.at(-1)[field];
      const beforeTop = await snapshot();
      await buy(top);
      let saved = await snapshot();
      check(width + ':' + field + ':new-item-costs-price', beforeTop.wallet.coin - saved.wallet.coin === list.at(-1).cost);
      // 최고 등급을 먼저 사도 실제로 사지 않은 중간 등급에는 가격이 남는다.
      check(width + ':' + field + ':unbought-middle-has-price', await card(2).locator('.price').count() === 1);
      for (const item of list) {
        if (ownsCosmetic(saved.squad[saved.pick].worn, field, item[field])) continue;
        const before = await snapshot(); await buy(item[field]); saved = await snapshot();
        check(width + ':' + field + ':buy-' + item[field], before.wallet.coin - saved.wallet.coin === item.cost);
      }
      const paid = await snapshot();
      for (const item of list) {
        if ((await snapshot()).squad[paid.pick].worn[field] === item[field]) continue;
        check(width + ':' + field + ':equip-button-' + item[field], (await card(item[field]).locator('.buy').innerText()) === '장착');
        await buy(item[field]);
        const after = await snapshot();
        check(width + ':' + field + ':free-rewear-' + item[field], after.squad[after.pick].worn[field] === item[field] && JSON.stringify(after.wallet) === JSON.stringify(paid.wallet));
      }
      await buy(0); await p.reload(); await ready(); await tab();
      const beforeReturn = await snapshot(); await buy(top); const returned = await snapshot();
      check(width + ':' + field + ':owned-survives-reload', returned.squad[returned.pick].worn[field] === top && JSON.stringify(returned.wallet) === JSON.stringify(beforeReturn.wallet));
    }
    await p.locator('#shop .tab[data-tab="glove"]').click({ force: true });
    await p.locator('#shop .card[data-at="1"] .buy').click({ force: true });
    check(width + ':stats:lower-button-rule-preserved', await p.locator('#shop .card[data-at="0"] .buy').isDisabled());
    check(width + ':runtime', errors.length === 0, errors.join(';'));
    await ctx.close();
  }
} finally {
  clearTimeout(timer); await browser.close();
  writeFileSync(new URL('b-rewear-results.json', out), JSON.stringify(rows, null, 2));
}
console.log('rewear ' + (rows.every(row => row.pass) ? 'PASS ' : 'FAIL ') + rows.length);
if (rows.some(row => !row.pass)) process.exitCode = 1;
