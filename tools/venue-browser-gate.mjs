import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { CITIES, CITY_SKINS } from '../web/src/state/gear.mjs';

// 기존 condition 게이트의 저장 복원과 실제 구매 경로를 경기장의 복합 조건에 적용한다.
const out = new URL('../.omo/evidence/p16/', import.meta.url);
mkdirSync(out, { recursive: true });
const rows = [];
const check = (name, pass, detail) => { rows.push({ name, pass, detail }); console.log((pass ? 'PASS ' : 'FAIL ') + name, JSON.stringify(detail)); };
// 두 가로 화면에서 모든 개최지와 조건 경계를 재는 시간 예산이다.
const WATCHDOG = setTimeout(() => process.exit(2), 240000);
const browser = await chromium.launch({ executablePath: process.env.LOCALAPPDATA + '/ms-playwright/chromium-1228/chrome-win64/chrome.exe', headless: true });
try {
  // 수락 기준의 데스크톱과 작은 가로 휴대폰을 그대로 쓴다.
  for (const [width, height] of [[1280, 720], [740, 360]]) {
    const context = await browser.newContext({ viewport: { width, height } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const base = 'http://127.0.0.1:10310/web/index.html?seed=20';
    async function ready() {
      await page.locator('#go').click({ force: true });
      await page.waitForFunction(() => typeof window.__shop === 'function');
      await page.evaluate(() => { window.__lockRound(); window.__shop(true); });
      await page.locator('#shop .tab[data-tab="city"]').click();
    }
    await page.goto(base + '&preset=rich,veteran');
    await ready();
    const baseline = await page.evaluate(() => { window.__persist(); return JSON.parse(localStorage.getItem(window.__saveKey())); });
    async function restore(item, missing) {
      const data = structuredClone(baseline);
      data.gear.city = 0;
      data.gear.citySkin = 0;
      data.gear.venueUnlocked = [0];
      data.wallet = { coin: item.cost, cash: 0 };
      const keeper = data.squad[data.pick];
      for (const condition of item.conditions) {
        const value = condition.min - Number(condition.key === missing);
        if (condition.key === 'level') keeper.level = value;
        if (condition.key === 'saves') data.record = { [data.kickers[0]]: { saved: value, conceded: 0 } };
        if (condition.key === 'fans') data.fans = value;
      }
      data.keeper = structuredClone(keeper);
      await page.evaluate(data => localStorage.setItem(window.__saveKey(), JSON.stringify(data)), data);
      await page.goto(base);
      await ready();
    }
    for (const item of CITIES) {
      const card = page.locator('#shop .card[data-spec="city"][data-at="' + item.city + '"]');
      for (const [variant, host] of CITY_SKINS[item.city].entries()) {
        await card.locator('.skin[data-skin="' + variant + '"]').click();
        await card.locator('.venue-flag').evaluate(img => img.decode());
        const flag = await card.locator('.venue-flag').evaluate(img => ({ label: img.getAttribute('aria-label'), src: img.getAttribute('src'), loaded: img.complete && img.naturalWidth > 0, width: img.getBoundingClientRect().width, height: img.getBoundingClientRect().height, top: getComputedStyle(img).top, right: getComputedStyle(img).right, parent: img.parentElement.dataset.spec }));
        check('flag:' + width + ':' + item.city + ':' + variant, flag.label === '개최국 ' + host.country && flag.src.endsWith('/' + host.flag + '.svg') && flag.loaded && Math.abs(flag.width - 24) < 1 && Math.abs(flag.height - 18) < 1 && flag.top === '8px' && flag.right === '8px' && flag.parent === 'city', flag);
        check('name:' + width + ':' + item.city + ':' + variant, await card.locator(':scope > b').evaluate(el => el.firstChild.textContent) === item.name && await card.locator(':scope > b .venue-subtitle').textContent() === host.city, host.name);
      }
    }
    for (const item of CITIES.filter(row => row.conditions.length)) {
      for (const condition of item.conditions) {
        await restore(item, condition.key);
        const card = page.locator('#shop .card[data-spec="city"][data-at="' + item.city + '"]');
        const before = await page.evaluate(() => ({ city: window.__gear().city, coin: window.__squad().coin }));
        check('blocked:' + width + ':' + item.city + ':' + condition.key, await card.locator('.buy').isDisabled() && await card.getAttribute('data-state') === 'locked', condition);
        // 비활성을 인위적으로 풀어도 실제 핸들러가 돈을 쓰지 않는지 대조한다.
        await card.locator('.buy').evaluate(button => { button.disabled = false; button.click(); });
        const after = await page.evaluate(() => ({ city: window.__gear().city, coin: window.__squad().coin }));
        check('handler:' + width + ':' + item.city + ':' + condition.key, after.city === before.city && after.coin === before.coin, { before, after });
        const button = card.locator('.condition[data-value="' + (condition.min - 1) + '"][data-min="' + condition.min + '"]');
        await button.click();
        check('destination:' + width + ':' + item.city + ':' + condition.key, await page.locator('#shop').isHidden() && (condition.key !== 'fans' || await page.locator('#gram').isVisible()), condition.key);
      }
      await restore(item);
      const card = page.locator('#shop .card[data-spec="city"][data-at="' + item.city + '"]');
      await card.locator('.buy').click();
      const bought = await page.evaluate(() => { window.__persist(); const saved = JSON.parse(localStorage.getItem(window.__saveKey())); return { city: saved.gear.city, coin: saved.wallet.coin, opened: saved.gear.venueUnlocked }; });
      check('purchase:' + width + ':' + item.city, bought.city === item.city && bought.coin === 0 && bought.opened.includes(item.city), bought);
    }
    await restore(CITIES[1], 'saves');
    const modes = page.locator('#shop .mode-coming');
    check('coming:population:' + width, await modes.count() === CITIES.flatMap(row => row.coming).length, await modes.count());
    for (let index = 0; index < await modes.count(); index++) {
      const mode = modes.nth(index);
      await mode.click();
      const result = await mode.evaluate(button => ({ label: button.textContent, progress: button.querySelectorAll('progress').length, destination: !button.parentElement.querySelector('.mode-preview').hidden && button.parentElement.querySelector('.mode-preview').textContent.includes(button.dataset.preview), expanded: button.getAttribute('aria-expanded') }));
      check('coming:destination:' + width + ':' + index, result.label.includes('업데이트 예정') && result.progress === 0 && result.destination && result.expanded === 'true', result);
    }
    const states = await page.locator('#shop .card[data-spec="city"][data-at="1"]').evaluate(card => ({
      state: card.dataset.state,
      condition: card.querySelectorAll('.condition progress').length,
      coming: getComputedStyle(card.querySelector('.mode-coming')).borderTopStyle,
      locked: getComputedStyle(card.querySelector('.shot')).filter
    }));
    check('locked-coming-distinct:' + width, states.state === 'locked' && states.condition > 0 && states.coming === 'dashed' && states.locked.includes('saturate'), states);
    const tile = modes.first();
    await tile.evaluate(button => button.appendChild(document.createElement('progress')));
    check('control:unshipped-progress-is-detected:' + width, await tile.locator('progress').count() > 0, '심은 진행도');
    await tile.locator('progress').evaluate(node => node.remove());
    await restore(CITIES[1], 'saves');
    await page.evaluate(() => { document.querySelector('#shop').scrollTop = 0; document.querySelector('#shop .rack').scrollLeft = 0; });
    const prices=await page.evaluate(()=>{
      const read=button=>{const r=button.getBoundingClientRect();return {top:r.top,bottom:r.bottom,left:r.left,right:r.right,visible:r.width>0&&r.height>0&&r.top>=0&&r.bottom<=innerHeight&&r.left>=0&&r.right<=innerWidth};};
      const buttons=[...document.querySelectorAll('#shop .card[data-spec="city"] .buy')];
      // 480픽셀 이하는 CSS의 가로 카드 갈래다. 첫 카드는 바로 보이고 뒤 카드는 좌우 스크롤로 읽는다.
      const shown=innerHeight<innerWidth&&innerHeight<=480?buttons.slice(0,1):buttons;
      const actual=shown.map(read),first=shown[0],before=first.style.cssText;
      // 비활성 버튼의 변형 규칙과 전환에도 대조군이 반드시 화면 밖에 서도록 위치를 직접 고정한다.
      first.style.cssText+=';position:fixed!important;top:100vh!important;left:0!important;transform:none!important;transition:none!important';
      const rejected=!read(first).visible;first.style.cssText=before;
      return {actual,rejected};
    });
    check('price:initial-viewport:'+width,prices.actual.length>0&&prices.actual.every(row=>row.visible),prices.actual);
    check('control:price-below-viewport:'+width,prices.rejected,'심은 화면 밖 가격');
    await page.screenshot({ path: new URL('venue-shelf-' + width + 'x' + height + '.jpg', out).pathname.replace(/^\/(\w:)/, '$1'), type: 'jpeg', quality: 85 });
    check('console:' + width, errors.length === 0, errors);
    await context.close();
  }
} finally {
  await browser.close();
  clearTimeout(WATCHDOG);
  writeFileSync(new URL('venue-browser.json', out), JSON.stringify(rows, null, 2));
}
console.log('venue-browser ' + (rows.every(row => row.pass) ? 'PASS ' : 'FAIL ') + rows.length);
if (!rows.every(row => row.pass)) process.exitCode = 1;
