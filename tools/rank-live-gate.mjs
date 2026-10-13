// Setup: npm ci --prefix server; npm --prefix server exec -- playwright install chromium
// Local: node tools/rank-live-gate.mjs [--no-unique]
// Preview: RANK_API=https://<preview>/api node tools/rank-live-gate.mjs --preview
// Protected Preview: supply VERCEL_OIDC_TOKEN from vercel env pull; never disable protection.
// PGlite (Apache-2.0) runs real PostgreSQL locally: https://pglite.dev/docs/
// The same adapter and migration run here; local PASS does not claim a Neon deployment.
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { spawn, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, appendFileSync, openSync, closeSync } from 'node:fs';
import { resolve } from 'node:path';
import { once } from 'node:events';
import { createRankStore } from '../server/rank.mjs';
import { handleRankFetch } from '../server/rank-http.mjs';
import { createRankFunction } from '../server/rank-function.mjs';
import { createPostgresRankStore } from '../server/postgres-rank.mjs';

const serverRequire = createRequire(new URL('../server/package.json', import.meta.url));
const { chromium } = serverRequire('playwright');
const local = !process.argv.includes('--preview');
const control = process.argv.includes('--no-unique');
const out = resolve(process.env.RANK_EVIDENCE_DIR || '.omo/evidence/rank-worker', (control ? 'postgres-control-' : local ? 'postgres-local-' : 'preview-') + Date.now());
mkdirSync(out, { recursive: true });
let database, apiServer;
const remoteFetch = globalThis.fetch;
const previewOrigin = process.env.RANK_API ? new URL(process.env.RANK_API).origin : null;
const fetch = (url, options = {}) => remoteFetch(url, { ...options, headers: { ...options.headers, ...(previewOrigin && new URL(url).origin === previewOrigin && process.env.VERCEL_OIDC_TOKEN ? { 'x-vercel-trusted-oidc-idp-token': process.env.VERCEL_OIDC_TOKEN } : {}) } });
const children = new Set(), contexts = [], checks = [];
let staticServer;
function check(name, ok, detail) {
  const row = { name, ok, detail };
  checks.push(row);
  const text = `${ok ? 'PASS' : 'FAIL'} rank-live:${name} ${JSON.stringify(detail)}`;
  console.log(text);
  appendFileSync(out + '/checks.log', text + String.fromCharCode(10));
  return ok;
}
async function freePort() {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = server.address().port;
  await new Promise((done) => server.close(done));
  return port;
}
async function stop(child) {
  if (!child || child.exitCode !== null) return;
  if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true });
  else { try { process.kill(-child.pid, 'SIGTERM'); } catch {} }
  children.delete(child);
}
function start(command, args, label) {
  const fd = openSync(out + '/' + label + '.log', 'a');
  const child = spawn(command, args, { stdio: ['ignore', fd, fd], windowsHide: true, detached: process.platform !== 'win32', env: process.env });
  closeSync(fd);
  children.add(child);
  child.on('error', (error) => check(label, false, error.message));
  return child;
}
async function ready(url) {
  const until = Date.now() + 60000;
  while (Date.now() < until) {
    try { if ((await fetch(url, { signal: AbortSignal.timeout(1000) })).ok) return; } catch {}
    await new Promise((done) => setTimeout(done, 200));
  }
  throw new Error('Server readiness timed out: ' + url);
}
const watchdog = setTimeout(() => {
  console.error('FAIL rank-live:WATCHDOG');
  for (const child of children) if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F']);
  process.exit(1);
}, 240000);
watchdog.unref();
try {
  if (!local && (control || !process.env.RANK_API)) throw new Error('Preview requires RANK_API=https://<preview>/api; --no-unique is local only');
  const manifest = JSON.parse(readFileSync('server/package.json', 'utf8'));
  const versions = Object.fromEntries(['@neondatabase/serverless', '@electric-sql/pglite', 'vercel', 'playwright'].map((name) => [name, JSON.parse(readFileSync(resolve('server/node_modules', name, 'package.json'), 'utf8')).version]));
  check('pinned-toolchain', Object.entries(versions).every(([name, version]) => (manifest.dependencies[name] || manifest.devDependencies[name]) === version), { versions, node: process.version, playwright: serverRequire('playwright/package.json').version });
  const gamePort = await freePort();
  let api = process.env.RANK_API?.replace(/[/]+$/, '');
  if (local) {
    const { PGlite } = serverRequire('@electric-sql/pglite');
    database = new PGlite(out + '/postgres');
    const sql = readFileSync('server/migrations/0001_rank.sql', 'utf8');
    const migration = control ? sql.replace('nick_key TEXT NOT NULL UNIQUE', 'nick_key TEXT NOT NULL') : sql;
    if (control && migration === sql) throw new Error('UNIQUE control anchor missing');
    writeFileSync(out + '/migration.sql', migration);
    await database.exec(migration);
    const store = createPostgresRankStore({ query: async (...args) => (await database.query(...args)).rows });
    apiServer = createServer(createRankFunction(store));
    apiServer.listen(0, '127.0.0.1');
    await once(apiServer, 'listening');
    api = 'http://127.0.0.1:' + apiServer.address().port + '/api';
  }
  const base = 'http://127.0.0.1:' + gamePort + '/web/index.html?seed=20&lang=en';
  writeFileSync(out + '/invocation.json', JSON.stringify({ command: 'node tools/rank-live-gate.mjs', local, control, api, base }, null, 2));
  staticServer = start(process.execPath, ['tools/serve.mjs', String(gamePort)], 'game');
  await ready(api + '/lines');
  await ready(base);
  const post = (path, body, origin = 'https://lilmgenius.github.io') => fetch(api + path, {
    method: 'POST', headers: { 'content-type': 'application/json', origin }, body: JSON.stringify(body)
  });
  const preflight = await fetch(api + '/nick', { method: 'OPTIONS', headers: { origin: 'https://lilmgenius.github.io', 'access-control-request-method': 'POST', 'access-control-request-headers': 'content-type' } });
  check('pages-cors', preflight.status === 200 && preflight.headers.get('access-control-allow-origin') === 'https://lilmgenius.github.io' && preflight.headers.get('access-control-allow-headers') === 'Content-Type', { status: preflight.status, headers: Object.fromEntries(preflight.headers) });
  const denied = await post('/nick', { id: 'outside', nick: 'Outside' }, 'https://example.org');
  check('foreign-origin-refused', denied.status === 403 && !denied.headers.has('access-control-allow-origin'), denied.status);
  const cases = [
    ['/nick', {}, 400], ['/nick', { id: 'x', nick: 'x'.repeat(13) }, 400],
    ['/line', { id: 'unknown', line: {} }, 403]
  ];
  const memory = createRankStore();
  for (const [path, body, expected] of cases) {
    const live = await post(path, body);
    const local = await handleRankFetch(new Request('http://localhost/api' + path, { method: 'POST', body: JSON.stringify(body) }), memory);
    check('status-' + expected + '-' + path, live.status === expected && local.status === expected, { postgres: live.status, memory: local.status });
  }
  const malformed = await fetch(api + '/nick', { method: 'POST', body: '{' });
  check('malformed-json', malformed.status === 400, malformed.status);
  const malformedJson = await fetch(api + '/nick', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{' });
  check('malformed-json-content-type', malformedJson.status === 400, malformedJson.status);
  let parsedStatus;
  const throwingRequest = { method: 'POST', url: '/api/nick', headers: { 'content-type': 'application/json' }, get body() { throw new SyntaxError('Invalid JSON'); } };
  await createRankFunction(memory)(throwingRequest, { writeHead(status) { parsedStatus = status; }, end() {} });
  check('vercel-body-parser-error', parsedStatus === 400, parsedStatus);
  const suffix = Date.now().toString(36).slice(-4);
  const names = ['Café ' + suffix, 'Other ' + suffix];
  const pages = [];
  const errors = [];
  const exe = chromium.executablePath();
  for (let i = 0; i < 2; i++) {
    const context = await chromium.launchPersistentContext(out + '/profile-' + i, { executablePath: exe, headless: true, viewport: { width: 1280, height: 800 } });
    contexts.push(context);
    if (!local && process.env.VERCEL_OIDC_TOKEN) await context.route(new URL(api).origin + '/**', (route) => route.continue({ headers: { ...route.request().headers(), 'x-vercel-trusted-oidc-idp-token': process.env.VERCEL_OIDC_TOKEN } }));
    await context.grantPermissions(['local-network-access'], { origin: new URL(base).origin });
    await context.route('**/web/index.html*', async (route) => {
      const response = await route.fetch();
      const html = await response.text();
      if (!html.includes('<meta name="gtg-api" content="">')) throw new Error('API meta missing');
      await route.fulfill({ response, body: html.replace('<meta name="gtg-api" content="">', `<meta name="gtg-api" content="${api}">`) });
    });
    const page = context.pages()[0];
    page.on('pageerror', (error) => { errors.push(error.message); check('pageerror', false, error.message); });
    pages.push(page);
    page.on('requestfailed', (r) => appendFileSync(out + '/network.log', r.url() + ' ' + r.failure()?.errorText + String.fromCharCode(10)));
    page.on('console', (m) => { if (m.type() === 'error') appendFileSync(out + '/console.log', m.text() + String.fromCharCode(10)); });
    await page.goto(base);
    await page.click('#aup');
    await page.fill('#aid', 'same_login');
    await page.fill('#apw', 'test-password');
    await page.fill('#anick', names[i]);
    const claimed = page.waitForResponse((r) => r.url() === api + '/nick' && r.request().method() === 'POST');
    await page.click('#ain');
    check('signup-profile-' + i, (await claimed).status() === 200, names[i]);
    await page.waitForFunction(() => localStorage.getItem('gtg.session.v1') === 'same_login');
    await page.waitForSelector('#gate .who:not([hidden])');
    await page.click('#go', { force: true });
    await page.waitForFunction(() => document.getElementById('title').hidden);
    for (let pack = 0; pack < 2; pack++) {
      await page.waitForSelector('#pull:not([hidden]) .tap');
      await page.keyboard.press('Escape');
      await page.locator('#pull .tap').click();
    }
    await page.waitForSelector('#pull', { state: 'hidden' });
    await page.click('#meBtn');
    await page.click('#me [data-tab="rank"]');
    await page.click('#me [data-board="fans"]');
    await page.waitForFunction(() => !document.querySelector('#me .src'));
  }
  await pages[0].click('#me [data-tab="rank"]');
  for (let i = 0; i < 2; i++) {
    await pages[i].waitForFunction((names) => names.every((name) => [...document.querySelectorAll('#me .rank .nick')].some((e) => e.textContent === name && e.getBoundingClientRect().height > 0)), names);
    const rows = await pages[i].locator('#me .rank .nick').allTextContents();
    check('both-visible-profile-' + i, names.every((n) => rows.includes(n)), rows);
    await pages[i].screenshot({ path: out + '/board-' + i + '.jpg', type: 'jpeg', quality: 75 });
  }
  const markup = '<b>' + suffix + '</b>';
  await post('/nick', { id: 'markup-' + suffix, nick: markup });
  await post('/line', { id: 'markup-' + suffix, line: { fans: 999999 } });
  await pages[0].click('#me [data-tab="rank"]');
  await pages[0].waitForFunction((nick) => [...document.querySelectorAll('#me .rank .nick')].some((e) => e.textContent === nick), markup);
  const inert = await pages[0].locator('#me .rank .nick').evaluateAll((nodes, nick) => nodes.some((e) => e.textContent === nick && e.children.length === 0), markup);
  check('nickname-is-text', inert, markup);
  await pages[0].screenshot({ path: out + '/nickname-text.jpg', type: 'jpeg', quality: 75 });
  const secrets = await Promise.all(pages.map((p) => p.evaluate(() => localStorage.getItem('gtg.rank.secret.v1:same_login'))));
  check('secret-identities', secrets.every((s) => /^[0-9a-f-]{36}$/.test(s)) && secrets[0] !== secrets[1], { random: secrets.every((s) => s && s !== 'same_login'), distinct: secrets[0] !== secrets[1] });
  const publicBoard = await (await fetch(api + '/lines')).text();
  check('no-secret-in-board', secrets.every((s) => !publicBoard.includes(s)), JSON.parse(publicBoard));
  if (local) {
    await database.close();
    const { PGlite } = serverRequire('@electric-sql/pglite');
    database = new PGlite(out + '/postgres');
  }
  const persisted = await (await fetch(api + '/lines')).json();
  check('stored-board-readback', names.every((n) => persisted.lines.some((l) => l.nick === n)), persisted);
  await pages[0].reload();
  const stable = await pages[0].evaluate(() => localStorage.getItem('gtg.rank.secret.v1:same_login'));
  check('secret-survives-reload', stable === secrets[0], { unchanged: stable === secrets[0] });
  const page = pages[1];
  await page.reload();
  await page.click('#ain');
  await page.fill('#aid', 'duplicate');
  await page.fill('#apw', 'test-password');
  for (const nick of [names[0].toUpperCase(), ' ' + names[0].replace(' ', '  ') + ' ', names[0].normalize('NFD')]) {
    await page.fill('#anick', nick);
    const response = page.waitForResponse((r) => r.url() === api + '/nick' && r.request().method() === 'POST');
    await page.click('#ain');
    const status = (await response).status();
    if (!check('duplicate-refused', status === 409, { nick, status })) break;
    await page.waitForSelector('#asay:not([hidden])');
    const rolledBack = await page.evaluate(() => !JSON.parse(localStorage.getItem('gtg.accounts.v1')).some((a) => a.id === 'duplicate'));
    check('duplicate-account-rolled-back', rolledBack && await page.locator('#asay').isVisible(), await page.locator('#asay').textContent());
  }
  await page.screenshot({ path: out + '/duplicate.jpg', type: 'jpeg', quality: 75 });
  const race = await Promise.all(['race-a', 'race-b'].map((id) => post('/nick', { id: id + suffix, nick: 'R' + suffix }).then((r) => r.status)));
  check('atomic-unique', race.sort().join(',') === '200,409', race);
  const contract = 'c' + suffix, renamed = 'N' + suffix;
  const file = out + '/rank.local.json';
  const fileStore = createRankStore(file);
  const dirtyLine = { nick: 'spoof', shots: '60', save: 5, fans: 'bad', charm: 2, level: 3, stat: 'Infinity' };
  fileStore.claim(contract, contract);
  fileStore.post(contract, dirtyLine);
  await post('/nick', { id: contract, nick: contract });
  const posted = await post('/line', { id: contract, line: dirtyLine });
  const expected = { nick: contract, shots: 60, save: 1, fans: 0, charm: 2, level: 3, stat: 0 };
  const stored = (await (await fetch(api + '/lines')).json()).lines.find((l) => l.nick === contract);
  const disk = createRankStore(file).lines()[0];
  check('shared-sanitizer-and-file-persistence', posted.status === 200 && JSON.stringify(stored) === JSON.stringify(expected) && JSON.stringify(disk) === JSON.stringify(expected), { postgres: stored, file: disk });
  const rename = await post('/nick', { id: contract, nick: renamed });
  const released = await post('/nick', { id: 'next-' + suffix, nick: contract });
  const clash = await post('/nick', { id: contract, nick: contract });
  const after = (await (await fetch(api + '/lines')).json()).lines;
  check('rename-is-atomic', rename.status === 200 && released.status === 200 && clash.status === 409 && after.some((l) => l.nick === renamed), { rename: rename.status, released: released.status, clash: clash.status });
  const guessed = await post('/line', { id: 'same_login', line: dirtyLine });
  check('login-name-is-not-a-credential', guessed.status === 403, guessed.status);
  await pages[0].route(api + '/nick', (route) => route.abort());
  const unavailable = await pages[0].evaluate(async () => (await import('./src/state/rank.mjs')).claimNick('offline', 'Offline'));
  check('configured-outage-refuses-claim', unavailable?.ok === false, unavailable);
  await pages[0].unroute(api + '/nick');
  await pages[0].route(api + '/nick', (route) => route.fulfill({ status: 500, contentType: 'application/json', body: '{}' }));
  const outage = await pages[0].evaluate(async () => (await import('./src/state/rank.mjs')).claimNick('db-down', 'Database'));
  check('server-error-is-not-a-duplicate', outage?.ok === false && outage.why === unavailable.why, outage);
  await pages[0].unroute(api + '/nick');
  await contexts[0].unroute('**/web/index.html*');
  await pages[0].reload();
  const fallbackNick = 'Local' + Date.now().toString(36).slice(-6);
  const fallback = await pages[0].evaluate(async (nick) => {
    const rank = await import('./src/state/rank.mjs');
    const claim = await rank.claimNick('fallback', nick);
    const posted = await rank.sendRankLine('fallback', { nick, fans: 7 });
    return { claim, posted, rows: await rank.fetchLines() };
  }, fallbackNick);
  check('empty-meta-uses-same-origin', fallback.claim?.ok && fallback.posted && fallback.rows.some((l) => l.nick === fallbackNick), fallback);
  check('no-browser-errors', errors.length === 0, errors);
} catch (error) {
  for (let i = 0; i < contexts.length; i++) {
    const p = contexts[i].pages()[0];
    if (p) { await p.screenshot({ path: out + '/failure-' + i + '.jpg', type: 'jpeg', quality: 75 }).catch(() => {}); writeFileSync(out + '/failure-' + i + '.html', await p.content()); }
  }
  check('scenario', false, error.stack);
} finally {
  for (const context of contexts) await context.close().catch(() => {});
  if (apiServer) { apiServer.closeAllConnections(); await new Promise((done) => apiServer.close(done)); }
  if (database) await database.close();
  for (const child of [...children]) await stop(child);
  clearTimeout(watchdog);
  writeFileSync(out + '/result.json', JSON.stringify({ local, control, checks, passed: checks.every((c) => c.ok) }, null, 2));
  console.log('EVIDENCE ' + out);
}
const failed = checks.filter((c) => !c.ok).length;
console.log(failed ? `rank-live FAIL ${failed}` : `rank-live PASS ${checks.length}`);
process.exitCode = failed ? 1 : 0;
