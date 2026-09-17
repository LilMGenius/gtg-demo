import { chromium } from 'playwright';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { HUD_LINKS } from '../web/src/ui/links.mjs';

// Reuses keys-gate's Playwright browser, presets and served-parent route control.
const ROOT = new URL('../', import.meta.url);
const BASE = 'http://127.0.0.1:10310/web/index.html';
const EXE = process.env.LOCALAPPDATA + '/ms-playwright/chromium-1228/chrome-win64/chrome.exe';
const evidence = new URL(process.env.GTG_EVIDENCE_DIR || '.omo/evidence/', ROOT);
mkdirSync(evidence, { recursive: true });
const timer = setTimeout(() => { console.log('WATCHDOG'); process.exit(1); }, 90000);
timer.unref();
const failures = [];
const check = (name, ok, detail) => {
  console.log((ok ? 'GREEN ' : 'RED ') + name + ' ' + JSON.stringify(detail));
  if (!ok) failures.push(name);
};
const parent = (path, ref = '1e46fcd') => execFileSync('git', ['show', ref + ':' + path], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1024 * 1024 });
const hidden = (p, id) => p.locator('#' + id).evaluate((e) => e.hidden);
const target = async (p, row) => await p.locator('#' + row.panel).isVisible()
  && (!row.cat || await p.locator('#wiki [aria-current="true"]').getAttribute('data-cat') === row.cat);
const selector = (id) => '[data-hud-link="' + id + '"]';
const rects = (p) => p.evaluate(() => Object.fromEntries(['meBtn', 'lv', 'form', 'pips', 'purse', 'fans'].map((id) => {
  const r = document.getElementById(id).getBoundingClientRect();
  return [id, { x: r.x, y: r.y, width: r.width, height: r.height }];
})));
let browser;
try {
  browser = await chromium.launch({ executablePath: EXE });
  console.log('BINARY node=' + process.version + ' chromium=' + browser.version() + ' executable=' + EXE);
  console.log('TABLE ' + JSON.stringify(HUD_LINKS));
  const errors = [];
  const fresh = async (mode = '', viewport = { width: 1280, height: 720 }) => {
    const context = await browser.newContext({ viewport });
    const p = await context.newPage();
    p.setDefaultTimeout(8000);
    p.on('pageerror', (e) => errors.push(e.message));
    if (mode) {
      const paths = mode === 'baseline' ? ['web/index.html', 'web/src/main.mjs', 'web/src/ui/hud.css'] : ['web/src/main.mjs'];
      for (const path of paths) {
        // The 24px target floor owns geometry; the older routing failure remains the behavior control.
        const body = parent(path, mode === 'baseline' ? 'e373e2f' : '1e46fcd');
        await p.route('**/' + path + (path.endsWith('.html') ? '*': ''), (route) => route.fulfill({
          contentType: path.endsWith('.html') ? 'text/html' : path.endsWith('.css') ? 'text/css' : 'text/javascript', body
        }));
      }
    }
    await p.goto(BASE + '?seed=20&preset=rich,famous,veteran');
    await p.click('#go', { force: true });
    await p.waitForFunction(() => document.getElementById('title').hidden && getComputedStyle(document.getElementById('hud')).opacity === '1');
    await p.evaluate(() => { window.__lockRound(); return document.fonts.ready; });
    return p;
  };
  for (const viewport of [{ width: 1280, height: 720 }, { width: 740, height: 360 }]) {
    const beforePage = await fresh('baseline', viewport);
    const before = await rects(beforePage);
    await beforePage.context().close();
    const p = await fresh('', viewport);
    const after = await rects(p);
    const deltas = Object.fromEntries(Object.keys(before).map((id) => [id, Math.max(...Object.keys(before[id]).map((key) => Math.abs(after[id][key] - before[id][key])))]));
    check('hudlink:chip-rects-stayed-within-one-pixel', Object.values(deltas).every((n) => n <= 1), { viewport, before, after, deltas });
    await p.context().close();
  }
  const p = await fresh();
  const hud = Object.entries(HUD_LINKS);
  const visits = [];
  for (const [id, row] of hud) {
    if (id.startsWith('gram')) await p.click('#fans');
    const buttons = p.locator(selector(id));
    const count = await buttons.count();
    check('hudlink:row-has-a-button:' + id, count > 0, count);
    for (let i = 0; i < count; i++) {
      const button = buttons.nth(i);
      const accessible = await button.evaluate((e) => e.tagName === 'BUTTON' && e.tabIndex >= 0 && !!e.title && !!e.getAttribute('aria-label'));
      await button.click();
      const landed = await target(p, row);
      visits.push({ id, i, accessible, landed });
      if (id === 'fans') await p.screenshot({ path: fileURLToPath(new URL('p5-followers-gram.png', evidence)) });
      if (id === 'lv') await p.screenshot({ path: fileURLToPath(new URL('p5-level-wiki.png', evidence)) });
      await p.keyboard.press('Escape');
      check('hudlink:escape:' + id, await hidden(p, row.panel), row.panel);
    }
  }
  check('hudlink:every-chip-lands-on-its-own-entry', visits.length >= hud.length && visits.every((v) => v.accessible && v.landed), visits);
  const figures = [];
  for (const [id, row] of Object.entries(HUD_LINKS).filter(([id]) => id.startsWith('gram'))) {
    await p.click('#fans');
    await p.click(selector(id));
    figures.push({ id, landed: await target(p, row) });
    await p.keyboard.press('Escape');
  }
  check('hudlink:the-gram-figures-link-to-the-wiki', figures.length === 2 && figures.every((v) => v.landed), figures);
  for (const [id, row] of Object.entries(HUD_LINKS)) {
    for (const key of ['Enter', 'Space']) {
      if (id.startsWith('gram')) await p.click('#fans');
      const button = p.locator(selector(id)).first();
      await button.focus();
      await p.keyboard.press(key);
      check('hudlink:keyboard:' + id + ':' + key, await target(p, row), row);
      await p.keyboard.press('Escape');
    }
  }
  await p.context().close();
  const c = await fresh('control');
  await c.click('#fans');
  const controlRed = await hidden(c, 'gram') && await c.locator('#wiki').isVisible();
  console.log('CONTROL served-parent 1e46fcd followers-to-gram ' + (controlRed ? 'RED' : 'GREEN'));
  check('hudlink:served-parent-control', controlRed, { gramHidden: await hidden(c, 'gram'), wikiVisible: await c.locator('#wiki').isVisible() });
  await c.context().close();
  const source = readFileSync(new URL('web/src/main.mjs', ROOT), 'utf8');
  const pattern = /openWiki\(\s*['"]coin['"]\s*\)/g;
  const hardcodes = [...source.matchAll(pattern)].length;
  const oldHardcodes = [...parent('web/src/main.mjs').matchAll(pattern)].length;
  const scan = spawnSync('rg', ['--count-matches', pattern.source, fileURLToPath(new URL('web/src/main.mjs', ROOT))], { encoding: 'utf8' });
  const rgCount = scan.status === 1 ? 0 : Number(scan.stdout?.trim());
  check('hudlink:no-chip-still-hardcodes-coin', hardcodes === 0 && scan.status === 1 && rgCount === 0, { hardcodes, oldHardcodes, rgCount, rgExit: scan.status, stderr: scan.stderr });
  check('hudlink:hardcode-control', oldHardcodes > 0, oldHardcodes);
  check('hudlink:no-browser-errors', errors.length === 0, errors);
} catch (e) { check('hudlink:exception', false, e.stack); }
finally { if (browser) await browser.close(); clearTimeout(timer); }
console.log('hudlink ' + (failures.length ? 'FAIL ' + failures.length : 'PASS'));
process.exitCode = failures.length ? 1 : 0;
