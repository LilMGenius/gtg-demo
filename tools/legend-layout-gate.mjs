import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// pack 게이트의 실제 쇼케이스 진입을 재사용하고 화면·금테 안쪽 경계를 함께 잰다.
const out = new URL('../.omo/evidence/p16/', import.meta.url);
mkdirSync(out, { recursive: true });
const rows = [];
const check = (name, pass, detail) => { rows.push({ name, pass, detail }); console.log(pass ? 'PASS' : 'FAIL', name, JSON.stringify(detail)); };
// 두 가로 화면과 잘림 대조군을 처리할 최대 대기 시간이다.
const WATCHDOG = setTimeout(() => process.exit(2), 120000);
const browser = await chromium.launch({ executablePath: process.env.LOCALAPPDATA + '/ms-playwright/chromium-1228/chrome-win64/chrome.exe', headless: true });
try {
  // 수락 기준의 두 가로 휴대폰 크기를 그대로 검사한다.
  for (const [width, height] of [[844, 390], [740, 360]]) {
    const page = await browser.newPage({ viewport: { width, height } });
    await page.goto('http://127.0.0.1:10310/web/index.html?seed=20&preset=rich,veteran');
    await page.locator('#go').click({ force: true });
    await page.evaluate(() => { window.__lockRound(); window.__shop(true); });
    await page.locator('#shop .tab[data-tab="pull"]').click();
    await page.locator('#shop .show-legends').click();
    await page.locator('.legend-showcase img').evaluateAll(images => Promise.all(images.map(image => image.decode())));
    await page.locator('.legend-showcase').scrollIntoViewIfNeeded();
    const measure = () => page.locator('.legend-showcase .player').evaluateAll(cards => cards.map(card => {
      const frame = card.getBoundingClientRect();
      const parts = [...card.querySelectorAll('img,h3,.stats span,.fame')].map(part => {
        const box = part.getBoundingClientRect();
        const inside = box.left >= frame.left && box.right <= frame.right && box.top >= frame.top && box.bottom <= frame.bottom;
        const visible = box.left >= 0 && box.right <= innerWidth && box.top >= 0 && box.bottom <= innerHeight;
        return { text: part.textContent || part.alt, inside, visible, box: box.toJSON() };
      });
      return { parts, image: card.querySelector('img').naturalWidth, frame: frame.toJSON() };
    }));
    const actual = await measure();
    check('figure-name-stats:' + width, actual.length > 0 && actual.every(card => card.image > 0 && card.parts.every(part => part.inside && part.visible)), actual);
    // 이름을 프레임 밖으로 옮긴 대조군이 같은 측정에서 반드시 실패해야 한다.
    await page.locator('.legend-showcase h3').first().evaluate(node => { node.style.transform = 'translateY(100vh)'; });
    check('control:clipped-name:' + width, (await measure()).some(card => card.parts.some(part => !part.inside || !part.visible)), '화면 한 높이 아래로 옮긴 이름');
    await page.locator('.legend-showcase h3').first().evaluate(node => node.style.removeProperty('transform'));
    // JPEG 품질 85는 글자를 보존하면서 대화 이미지의 무게를 제한한다.
    await page.screenshot({ path: fileURLToPath(new URL('legend-' + width + 'x' + height + '.jpg', out)), type: 'jpeg', quality: 85 });
    await page.locator('.legend-showcase .market').click();
    check('market-destination:' + width, await page.locator('.pack-card.legend').isVisible(), '전설 키커 이적시장');
    await page.close();
  }
} finally {
  await browser.close();
  clearTimeout(WATCHDOG);
  writeFileSync(new URL('legend-layout.json', out), JSON.stringify(rows, null, 2));
}
console.log('legend-layout ' + (rows.every(row => row.pass) ? 'PASS ' : 'FAIL ') + rows.length);
if (!rows.every(row => row.pass)) process.exitCode = 1;
