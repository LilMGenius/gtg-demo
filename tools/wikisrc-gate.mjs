import { chromium } from 'playwright';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as wallet from '../web/src/state/wallet.mjs';
import * as roster from '../src/roster.mjs';
import * as gram from '../web/src/state/gram.mjs';

// gamewiki (MIT), https://github.com/DaedalGames/gamewiki: use its compiled CLI
// for both clean and mutated builds. Browser setup follows this repo's wiki-gate.
const ROOT = fileURLToPath(new URL('../', import.meta.url));
const BASE = 'http://127.0.0.1:10310/web/index.html?seed=20&preset=veteran';
const EXE = process.env.LOCALAPPDATA + '/ms-playwright/chromium-1228/chrome-win64/chrome.exe';
const CLI = join(ROOT, 'node_modules/gamewiki/dist/cli.js');
const SOURCE = join(ROOT, 'web/wiki/src');
const DIST = join(ROOT, 'web/wiki/dist');
const EVIDENCE = join(ROOT, '.omo/evidence');
const KEYS = ['hand', 'coin', 'drill', 'gear', 'pull', 'gram', 'bot', 'buff', 'risk'];
const modules = { wallet, roster, gram };
const report = { started: new Date().toISOString(), invocation: process.argv, axes: [], builds: [], bodies: [] };
mkdirSync(EVIDENCE, { recursive: true });
const check = (name, ok, detail) => {
  report.axes.push({ name, ok, detail });
  console.log((ok ? 'GREEN ' : 'RED ') + name + ' ' + JSON.stringify(detail));
};
const files = dir => readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? files(join(dir, e.name)) : [join(dir, e.name)]).sort();
const hashes = dir => Object.fromEntries(files(dir).map(f => [relative(dir, f).replaceAll('\\', '/'), createHash('sha256').update(readFileSync(f)).digest('hex')]));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const embed = (source, out) => {
  const args = [CLI, 'embed', source, '--out', out];
  const stdout = execFileSync(process.execPath, args, { cwd: ROOT, encoding: 'utf8', windowsHide: true, timeout: 20000 });
  report.builds.push({ invocation: [process.execPath, ...args], exitCode: 0, stdout, hashes: hashes(out) });
  return hashes(out);
};
const temp = mkdtempSync(join(ROOT, 'tools/p6b-wikisrc.local-'));
const watchdog = setTimeout(() => { console.error('wikisrc WATCHDOG'); process.exit(1); }, 90000);
watchdog.unref();
let browser;
try {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json')));
  const installed = JSON.parse(readFileSync(join(ROOT, 'node_modules/gamewiki/package.json')));
  report.binary = { node: process.version, executable: process.execPath, cli: realpathSync(CLI), version: installed.version, declared: pkg.devDependencies.gamewiki };
  console.log('BINARY ' + JSON.stringify(report.binary));
  const tracked = hashes(DIST);
  const fresh = embed(SOURCE, join(temp, 'fresh'));
  report.trackedHashes = tracked;
  check('wikisrc:the-tracked-output-matches-a-fresh-build', same(tracked, fresh) && Object.keys(tracked).length === 4, { tracked, fresh });
  const entities = JSON.parse(readFileSync(join(DIST, 'entities.json')));
  const pages = JSON.parse(readFileSync(join(DIST, 'pages.json')));
  const counts = Object.fromEntries(KEYS.map(k => [k, entities.filter(e => e.categories.includes(k)).length]));
  check('wikisrc:every-category-has-a-source-entry', Object.values(counts).every(n => n > 0) && KEYS.every(k => pages.some(p => p.id === k)), counts);
  const markdown = files(SOURCE).filter(f => f.endsWith('.md')).map(f => {
    const text = readFileSync(f, 'utf8').replaceAll('\r\n', '\n');
    const lines = text.split('\n');
    const end = lines.indexOf('---', 1);
    if (lines[0] !== '---' || end < 0) throw Error('Missing frontmatter: ' + f);
    const body = lines.slice(end + 1).join('\n');
    return { file: relative(ROOT, f), digits: [...body.matchAll(/[0-9]/g)].length, bytes: Buffer.byteLength(body) };
  });
  report.sourceTree = files(SOURCE).map(f => relative(ROOT, f));
  check('wikisrc:no-number-lives-in-the-markdown', markdown.length >= KEYS.length && markdown.every(f => f.digits === 0), markdown);
  report.valueFrom = entities.filter(e => e.valueFrom).map(e => {
    const [module, key] = e.valueFrom.split('.');
    const value = modules[module]?.[key];
    if (typeof value !== 'number') throw Error('Unresolved valueFrom ' + e.id);
    return { id: e.id, valueFrom: e.valueFrom, value };
  });
  const substituted = p => p.bodyHtml.replaceAll('{{value}}', () => {
    const fact = report.valueFrom.find(e => e.id === p.id);
    if (!fact) throw Error('Missing token binding ' + p.id);
    return String(fact.value);
  });
  cpSync(SOURCE, join(temp, 'mutant'), { recursive: true });
  const mutatedFile = join(temp, 'mutant/coin.md');
  const original = readFileSync(mutatedFile, 'utf8');
  const anchor = original.split('\n---\n')[1].trim().split('\n')[0];
  if (!anchor || original.split(anchor).length !== 2) throw Error('Mutation anchor');
  writeFileSync(mutatedFile, original.replace(anchor, anchor + ' Changed sentence.'), 'utf8');
  const mutated = embed(join(temp, 'mutant'), join(temp, 'mutated-output'));
  check('control:a-source-sentence-reddens-the-tracked-output-axis', !same(tracked, mutated) && tracked['pages.json'] !== mutated['pages.json'], { mutatedFile, mutated, matchAxis: same(tracked, mutated) });
  browser = await chromium.launch({ executablePath: EXE });
  report.binary.chromium = browser.version();
  report.binary.chromiumExecutable = EXE;
  const errors = [];
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(BASE);
  await page.click('#go', { force: true });
  await page.click('#wikiBtn', { force: true });
  await page.evaluate(() => import('./src/ui/wiki.mjs').then(m => m.wikiReady));
  for (const key of KEYS) {
    await page.locator('#wiki .cats [data-cat="' + key + '"]').click();
    const expected = pages.find(p => p.id === key);
    const result = await page.evaluate(({ html, title }) => {
      const template = document.createElement('template');
      template.innerHTML = html;
      const prose = document.querySelector('#wiki .wiki-prose');
      const body = document.querySelector('#wiki .body');
      return { expected: template.content.textContent, actual: prose?.textContent, expectedTitle: title,
        title: body.querySelector('h4').textContent, visible: !document.querySelector('#wiki').hidden && body.getBoundingClientRect().height > 0,
        tables: body.querySelectorAll('table').length };
    }, { html: substituted(expected), title: expected.title });
    report.bodies.push({ key, ...result });
    if (key === 'coin' || key === 'gear') {
      await page.screenshot({ path: join(EVIDENCE, 'p6b-wiki-' + key + '.png') });
    }
  }
  check('wikisrc:the-panel-renders-the-built-body', report.bodies.length === KEYS.length && report.bodies.every(r => r.actual === r.expected && r.title === r.expectedTitle && r.visible && r.tables > 0), report.bodies);
  await page.locator('#wiki .cats [data-cat="drill"]').click();
  const link = page.locator('#wiki .wiki-prose a');
  await link.click();
  check('wikisrc:wikilinks-stay-in-the-panel', await page.locator('#wiki .cats [aria-current="true"]').getAttribute('data-cat') === 'drill' && page.url() === BASE, { href: await link.getAttribute('href'), url: page.url() });

  // A functioning parent is not a negative control for source ownership.
  const parent = execFileSync('git', ['show', '71ac803:web/src/ui/wiki.mjs'], { cwd: ROOT, encoding: 'utf8' });
  const parentPage = await context.newPage();
  await parentPage.route('**/src/ui/wiki.mjs', r => r.fulfill({ contentType: 'text/javascript', body: parent }));
  await parentPage.goto(BASE);
  await parentPage.click('#go', { force: true });
  await parentPage.click('#wikiBtn', { force: true });
  const parentRows = [];
  for (const key of KEYS) {
    await parentPage.locator('#wiki .cats [data-cat="' + key + '"]').click();
    parentRows.push({ key, visible: await parentPage.locator('#wiki').isVisible(), tables: await parentPage.locator('#wiki table').count() });
  }
  check('control:the-served-parent-still-renders', parentRows.every(r => r.visible && r.tables > 0), { source: 'git show 71ac803:web/src/ui/wiki.mjs', rows: parentRows });
  await parentPage.close();

  const delayed = await context.newPage();
  let release;
  let fetches = 0;
  const held = new Promise(resolve => { release = resolve; });
  const marker = 'Fetched body control';
  await delayed.route('**/wiki/dist/pages.json', async route => {
    if (route.request().resourceType() !== 'fetch') return route.continue();
    fetches += 1;
    await held;
    const changed = pages.map(p => p.id === 'coin' ? { ...p, bodyHtml: p.bodyHtml + '<p>' + marker + '</p>' } : p);
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(changed) });
  });
  await delayed.goto(BASE);
  await delayed.click('#go', { force: true });
  await delayed.click('#wikiBtn', { force: true });
  await delayed.locator('#wiki .cats [data-cat="coin"]').click();
  const before = await delayed.locator('#wiki .wiki-prose').textContent();
  const expectedCoin = report.bodies.find(r => r.key === 'coin').expected;
  check('wikisrc:the-built-fallback-opens-before-fetch-returns', before === expectedCoin && fetches === 1, { expected: expectedCoin, before, fetches });
  release();
  await delayed.waitForFunction(text => document.querySelector('#wiki .wiki-prose')?.textContent.includes(text), marker);
  check('control:changed-fetched-body-repaints-the-open-panel', fetches === 1 && (await delayed.locator('#wiki .wiki-prose').textContent()).includes(marker), { fetches, marker });
  await delayed.close();
  check('console:no-errors', errors.length === 0, errors);
  await context.close();
} catch (error) {
  check('wikisrc:execution', false, String(error.stack || error));
} finally {
  if (browser) await browser.close();
  // Only the directory created by this invocation is disposable.
  if (dirname(temp) !== join(ROOT, 'tools') || !temp.includes('p6b-wikisrc.local-')) throw Error('Unexpected temp path');
  rmSync(temp, { recursive: true, force: true });
  clearTimeout(watchdog);
  report.finished = new Date().toISOString();
  report.ok = report.axes.length > 0 && report.axes.every(a => a.ok);
  writeFileSync(join(EVIDENCE, 'p6b-wikisrc-gate.json'), JSON.stringify(report, null, 2) + '\n');
  console.log('wikisrc ' + (report.ok ? 'PASS ' : 'FAIL ') + report.axes.length);
  process.exitCode = report.ok ? 0 : 1;
}
