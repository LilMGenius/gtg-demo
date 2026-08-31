// 서브시스템 격리 프리뷰. 다섯 서브시스템이 겹친 한 장에서 결함을 고르면 파편을 그물로,
// 다리를 팔로 읽는다. 한 서브시스템만 남긴 컷을 따로 뽑아 그 오탐을 원천에서 없앤다.
// 스크래치가 아니라 정식 도구다. 겹친 화면에서 정체를 오독한 사고가 반복되었기 때문이다.
import { chromium } from 'playwright';

const EXE = process.env.LOCALAPPDATA + '/ms-playwright/chromium-1228/chrome-win64/chrome.exe';
const URL = 'http://127.0.0.1:10310/web/index.html?seed=20';
const OUT = 'preview.local';

// 한 호출도 90초를 넘기지 않는다는 원칙에 맞춘 상한. 컷 수가 늘어도 개별 컷은 수백 ms다.
const watchdog = setTimeout(() => { console.log('WATCHDOG'); process.exit(1); }, 100000);
watchdog.unref();

import { mkdirSync } from 'fs';
mkdirSync(OUT, { recursive: true });

let browser;
try {
  browser = await chromium.launch({ executablePath: EXE });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('ERR', String(e)));
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForTimeout(1400);
  await page.click('#go', { force: true });
  await page.waitForTimeout(1500);
  await page.keyboard.press('ArrowLeft');
  await page.waitForTimeout(700);
  // 임팩트가 살아 있는 순간에 세계를 멈춘다. 정지 상태에서도 가시성 토글은 다음 프레임에 반영된다.
  await page.evaluate(() => window.__act('charge'));
  await page.waitForTimeout(520);
  await page.evaluate(() => window.__freeze(true));
  await page.waitForTimeout(120);

  const inv = await page.evaluate(() => window.__subs());
  console.log('SUBS', JSON.stringify(inv));

  const before = await page.evaluate(() => {
    const m = {};
    window.__sceneRoot().children.forEach((c, i) => { if (!c.isLight) m[i] = c.visible; });
    return m;
  });

  await page.screenshot({ path: OUT + '/00-all.png' });
  for (const name of Object.keys(inv)) {
    await page.evaluate((n) => window.__solo(n), name);
    await page.waitForTimeout(120);
    await page.screenshot({ path: OUT + '/' + name + '.png' });
  }

  // 복원이 원래 가시성을 정확히 되돌리는지 확인한다. ribbon 계열은 숨겨진 채로 태어나므로
  // 복원 때 켜지면 버그다.
  await page.evaluate(() => window.__solo(null));
  await page.waitForTimeout(120);
  const after = await page.evaluate(() => {
    const m = {};
    window.__sceneRoot().children.forEach((c, i) => { if (!c.isLight) m[i] = c.visible; });
    return m;
  });
  const drift = Object.keys(before).filter((k) => before[k] !== after[k]);
  console.log(drift.length === 0 ? 'RESTORE OK' : 'RESTORE DRIFT ' + drift.join(','));
  console.log('CUTS ' + (Object.keys(inv).length + 1));
} finally {
  clearTimeout(watchdog);
  if (browser) await browser.close();
}
