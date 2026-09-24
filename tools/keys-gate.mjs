import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { KEY_MAP } from '../web/src/ui/keys.mjs';

// Reuses the repo's wiki-gate browser and preset mechanism; this measures keyboard input.
const BASE = 'http://127.0.0.1:10310/web/index.html';
const EXE = process.env.LOCALAPPDATA + '/ms-playwright/chromium-1228/chrome-win64/chrome.exe';
const ROOT = new URL('../', import.meta.url);
const evidence = new URL('.omo/evidence/', ROOT);
mkdirSync(evidence, { recursive: true });
const timer = setTimeout(() => { console.log('WATCHDOG'); process.exit(1); }, 90000);
timer.unref();
const failures = [];
const check = (name, ok, detail) => {
  console.log((ok ? 'GREEN ' : 'RED ') + name + ' ' + JSON.stringify(detail));
  if (!ok) failures.push(name);
};
const selectors = { wiki: '.cats [data-cat]', roster: '.kind[data-pos]', me: '.tab[data-tab]', shop: '.tab[data-tab]' };
const selected = (p, id) => p.locator('#' + id + ' ' + selectors[id]).evaluateAll((bs) => bs.findIndex((b) => b.getAttribute('aria-current') === 'true' || b.getAttribute('aria-selected') === 'true'));
const hidden = (p, id) => p.locator('#' + id).evaluate((b) => b.hidden);
// 현재 입력 표면에서 닫기 배선만 끊어 양성 대조군을 만든다.
const parent = execFileSync('node', ['-e', "process.stdout.write(require('fs').readFileSync('web/src/main.mjs','utf8'))"], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1024 * 1024 }).replace("binding?.action === 'close'", "binding?.action === 'withheld-close'");
let browser;
try {
  browser = await chromium.launch({ executablePath: EXE });
  console.log('BINARY chromium=' + browser.version() + ' executable=' + EXE + ' node=' + process.version);
  const errors = [];
  const fresh = async (control = false, preset = 'rich,famous,veteran') => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const p = await context.newPage();
    p.on('pageerror', (e) => errors.push(e.message));
    if (control) await p.route('**/web/src/main.mjs', (route) => route.fulfill({ contentType: 'text/javascript', body: parent }));
    await p.goto(BASE + '?seed=20&preset=' + preset);
    await p.waitForSelector('#go');
    // Start by navigating native tab order, never assigning focus or clicking.
    for (let i = 0; i < 30 && !(await p.locator('#go').evaluate((b) => b === document.activeElement)); i++) await p.keyboard.press('Tab');
    await p.keyboard.press('Enter');
    await p.waitForFunction(() => document.getElementById('title').hidden);
    await p.waitForFunction(() => getComputedStyle(document.getElementById('hud')).opacity === '1');
    await p.evaluate(() => document.fonts.ready);
    return p;
  };
  const p = await fresh();
  for (const id of ['gym', 'roster', 'gram', 'me', 'shop', 'wiki', 'date']) {
    let opener = '#' + id + 'Btn';
    if (id === 'date') {
      await p.evaluate(() => { window.__rapport()['0:2'] = 15; window.__wallet().coin = 100000; });
      await p.click('#meBtn');
      await p.click('#me .tab[data-tab="face"]');
      opener = '#me .go[data-passer="2"]';
    }
    await p.click(opener);
    const opened = !(await hidden(p, id));
    const focused = await p.locator('#' + id).evaluate((b) => b.contains(document.activeElement));
    await p.keyboard.press('Escape');
    const restored = await p.locator(opener).evaluate((b) => b === document.activeElement);
    check('keys:escape-closes-every-window:' + id, opened && focused && await hidden(p, id) && restored, { opened, focused, restored });
    if (id === 'date') { check('keys:date-keeps-parent', !(await hidden(p, 'me')), 'me visible'); await p.keyboard.press('Escape'); }
  }
  for (const id of Object.keys(selectors)) {
    await p.click('#' + id + 'Btn');
    const n = await p.locator('#' + id + ' ' + selectors[id]).count();
    const initial = await selected(p, id);
    const visits = [];
    for (let i = 1; i <= n; i++) { await p.keyboard.press('Tab'); visits.push(await selected(p, id)); }
    const reverse = [];
    for (let i = 1; i <= n; i++) { await p.keyboard.press('Shift+Tab'); reverse.push(await selected(p, id)); }
    check('keys:tab-cycles-the-categories:' + id, n > 1 && visits.every((v, i) => v === (initial + i + 1) % n) && reverse.every((v, i) => v === (initial - i - 1 + n * 2) % n), { n, initial, visits, reverse });
    await p.keyboard.press('F6');
    check('keys:panel-buttons-reachable:' + id, await p.locator('#' + id).evaluate((b) => b.contains(document.activeElement)), 'F6 focus inside');
    await p.keyboard.press('Escape');
  }
  await p.context().close();
  const k = await fresh();
  await k.keyboard.press('s');
  const shopOpen = !(await hidden(k, 'shop'));
  await k.keyboard.press('Tab');
  const shopTab = await selected(k, 'shop');
  await k.keyboard.press('Escape');
  await k.keyboard.press('w');
  const wikiOpen = !(await hidden(k, 'wiki'));
  await k.locator('#wiki .cats [data-cat="hand"]').click();
  const rows = await k.locator('#wiki .body table').first().locator('tbody tr').evaluateAll((rs) => rs.map((r) => [...r.cells].map((c) => c.textContent.trim())));
  const expected = KEY_MAP.map(({ label, note }) => [label, note]);
  check('keys:the-wiki-table-matches-the-map', JSON.stringify([...rows].sort()) === JSON.stringify([...expected].sort()), { rows, expected });
  await k.locator('#wiki .body table').first().waitFor({ state: 'visible' });
  await k.screenshot({ path: new URL('p4-keys-wiki.png', evidence).pathname.replace(/^\/(\w:)/, '$1') });
  await k.keyboard.press('Escape');
  await k.waitForFunction(() => window.__position().phase === 'wait');
  await k.keyboard.down('ArrowLeft');
  const dive = await k.locator('.move-arrow[data-move="-1"]').evaluate((b) => ({ selected: b.getAttribute('aria-pressed'), className: b.className }));
  check('keys:the-game-plays-without-a-mouse', shopOpen && shopTab === 1 && wikiOpen && await hidden(k, 'shop') && await hidden(k, 'wiki') && dive.selected === 'true', { shopOpen, shopTab, wikiOpen, dive });
  await k.keyboard.up('ArrowLeft');
  await k.keyboard.press('s');
  for (let i = 0; i < 100 && !(await k.locator('#shop .buy[data-want="1"]').evaluate((b) => b === document.activeElement)); i++) await k.keyboard.press('F6');
  await k.keyboard.press('Enter');
  await k.waitForSelector('#pull .tap');
  await k.keyboard.press('Escape');
  check('keys:unfinished-reveal-stays-open', !(await hidden(k, 'pull')), 'Escape preserves card stages');
  for (let i = 0; i < 10 && (await k.locator('#pull .tap').textContent()).trim() !== '닫기'; i++) await k.keyboard.press('Enter');
  await k.keyboard.press('Escape');
  check('keys:completed-reveal-closes-to-shop', await hidden(k, 'pull') && !(await hidden(k, 'shop')) && await k.locator('#shop .buy[data-want="1"]').evaluate((b) => b === document.activeElement), 'Escape closes final reveal and restores purchase button');
  await k.context().close();
  const c = await fresh(true);
  await c.click('#gymBtn');
  const before = !(await hidden(c, 'gym'));
  await c.keyboard.press('Escape');
  const red = before && !(await hidden(c, 'gym'));
  console.log('CONTROL served-parent 323ec93 escape gym ' + (red ? 'RED' : 'GREEN'));
  check('keys:served-parent-control', red, { before, hiddenAfterEscape: await hidden(c, 'gym') });
  await c.context().close();
  const first = await fresh(false, '');
  await first.waitForSelector('#pull .tap');
  await first.keyboard.press('Escape');
  check('keys:onboarding-does-not-skip', !(await hidden(first, 'pull')), 'Escape preserves first reveal');
  for (let i = 0; i < 100 && !(await hidden(first, 'pull')); i++) await first.keyboard.press('Enter');
  check('keys:onboarding-keyboard-completes', await hidden(first, 'pull'), 'Enter traverses keeper and kicker reveals');
  await first.context().close();
  check('keys:no-browser-errors', errors.length === 0, errors);
} catch (e) { check('keys:exception', false, e.stack); }
finally { if (browser) await browser.close(); clearTimeout(timer); }
console.log('keys ' + (failures.length ? 'FAIL ' + failures.length : 'PASS'));
process.exitCode = failures.length ? 1 : 0;
