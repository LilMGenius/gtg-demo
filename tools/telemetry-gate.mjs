import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { webcrypto } from 'node:crypto';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { chromium } from 'playwright';
import { VERSION } from '../web/src/build.mjs';
import { createTelemetry, TELEMETRY_ENDPOINT, STORAGE_KEY, OPT_OUT_KEY, DNT_KEY,
  DAILY_LIMIT, RING_LIMIT, BATCH_BYTES } from '../web/src/telemetry.mjs';

// 빈 표본과 첫 배열 위치를 같은 영점으로 읽는다.
const ZERO = 0;
// 사건 하나씩의 증가와 양성 대조군의 최소 표본이다.
const ONE = 1;
// 재로드 전후와 손/봇을 구분하는 최소 짝이다.
const PAIR = 2;
// 구현 상수를 기대값으로 재사용하지 않고 계약의 하루 상한을 독립적으로 고정한다.
const EXPECTED_DAILY = 500;
// P24-T1의 유입 길이 상한을 독립적으로 고정한다.
const EXPECTED_SOURCE_LENGTH = 32;
// 고리의 실제 교체를 확인할 최소 초과분이다.
const OVERFLOW = 3;
// 방치 합산 대조군은 서로 다른 두 양과 기간으로 덮어쓰기를 검출한다.
const IDLE_A = { amount: 7, duration_ms: 1000 };
// 첫 표본과 다른 수를 써야 마지막 틱만 남기는 결함이 드러난다.
const IDLE_B = { amount: 11, duration_ms: 2000 };
// 실제 화면 폭은 봉투에 실리지 않는지 확인할 대표 폰 폭이다.
const PHONE = 390;
// 두 번째 기기 구간을 확인할 대표 태블릿 폭이다.
const TABLET = 768;
// 세 번째 구간과 비터치를 확인할 대표 데스크톱 폭이다.
const DESKTOP = 1440;
// build.mjs의 배포 계약이 요구하는 전체 Git SHA 길이다.
const SHA_LENGTH = 40;
// build.mjs의 화면 식별자가 요구하는 축약 Git SHA 길이다.
const SHORT_LENGTH = 7;
// 자정 전후를 재현하기 위한 현지 달력 시각이며 실제 실행 날짜에 의존하지 않는다.
const BEFORE_MIDNIGHT = '2026-09-25T23:59:59';
// 현지 날짜가 바뀌었을 때만 일일 예산이 다시 열려야 한다.
const AFTER_MIDNIGHT = '2026-09-26T00:00:01';
const evidenceDir = fileURLToPath(new URL('../.omo/evidence/u4b/telemetry/', import.meta.url));
mkdirSync(evidenceDir, { recursive: true });
const invocation = 'node tools/telemetry-gate.mjs';
const results = [];
const clients = [];
const originalFetch = globalThis.fetch;
const fetches = [];
globalThis.fetch = async url => {
  fetches.push(String(url));
  return { ok: true, json: async () => ({ version: VERSION,
    commit: 'a'.repeat(SHA_LENGTH), short: 'a'.repeat(SHORT_LENGTH) }) };
};

class Storage {
  values = new Map();
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}

function fixture({ storage = new Storage(), search = '', width = PHONE, touch = true } = {}) {
  const listeners = new Map();
  const beacons = [];
  const host = {
    localStorage: storage, crypto: webcrypto, location: { search }, innerWidth: width,
    navigator: { maxTouchPoints: touch ? ONE : ZERO,
      sendBeacon(endpoint, payload) { beacons.push({ endpoint, payload }); return true; } },
    addEventListener(name, fn) {
      if (!listeners.has(name)) listeners.set(name, new Set());
      listeners.get(name).add(fn);
    },
    removeEventListener(name, fn) { listeners.get(name)?.delete(fn); },
  };
  return { host, beacons, hide: () => listeners.get('pagehide')?.forEach(fn => fn()) };
}

async function client(f, options = {}) {
  const telemetry = await createTelemetry({ window: f.host, ...options });
  clients.push(telemetry);
  return telemetry;
}

async function axis(name, scenario, run) {
  try {
    const observable = await run();
    results.push({ name, scenario, invocation, pass: true, observable });
    console.log('  ok   ' + name);
  } catch (error) {
    results.push({ name, scenario, invocation, pass: false, error: error.stack });
    console.log('  FAIL ' + name + ' ' + error.message);
  }
}

try {
  await axis('identity', '동일 저장소 재로드와 독립 설치의 무작위 정체', async () => {
    const shared = new Storage();
    const first = await client(fixture({ storage: shared }));
    const reload = await client(fixture({ storage: shared }));
    const fresh = await client(fixture());
    for (const c of [first, reload, fresh]) assert.equal(c.record('first_playable', { mode: 'hand' }), true);
    const [a, b, c] = [first, reload, fresh].map(t => t.snapshot()[ZERO]);
    assert.equal(a.install_id, b.install_id);
    assert.notEqual(a.install_id, c.install_id);
    assert.notEqual(a.session_id, b.session_id);
    assert.notEqual(a.event_id, b.event_id);
    return { sameInstall: true, differentInstall: true, differentSession: true, samples: [a, b, c] };
  });

  await axis('envelope-modes', '핵심 여정 전 이벤트를 손과 봇 각각 기록', async () => {
    const c = await client(fixture({ search: '?src=%20reddit%20' }));
    const names = ['first_playable', 'first_contact', 'set_complete', 'second_set_start',
      'training_spent', 'bot_on', 'bot_off', 'return_visit', 'error'];
    for (const name of names) for (const mode of ['hand', 'bot']) {
      assert.equal(c.record(name, { mode, amount: ONE, category: 'save' }), true);
    }
    const events = c.snapshot();
    assert.equal(events.length, names.length * PAIR);
    for (const name of names) {
      assert.deepEqual(events.filter(event => event.event === name).map(event => event.mode), ['hand', 'bot']);
    }
    for (const [index, event] of events.entries()) {
      for (const key of ['schema', 'event_id', 'event', 'install_id', 'session_id', 'sequence',
        'occurred_at', 'local_day', 'build_id', 'source', 'device', 'mode', 'data']) assert.ok(key in event);
      assert.equal(event.sequence, index + ONE);
      assert.equal(event.build_id, VERSION + '+g' + 'a'.repeat(SHORT_LENGTH));
      assert.equal(event.source, 'reddit');
      assert.ok(Number.isFinite(Date.parse(event.occurred_at)));
    }
    assert.equal(c.record('first_contact'), false);
    assert.equal(c.record('first_contact', { mode: 'automatic' }), false);
    assert.equal(c.record('arbitrary', { mode: 'hand' }), false);
    return { events, rejectedInvalidModeAndName: true };
  });

  await axis('daily-cap', '두 클라이언트와 재로드를 합쳐 500회 수락, 501회 거부, 현지 자정 후 수락', async () => {
    assert.equal(DAILY_LIMIT, EXPECTED_DAILY);
    const storage = new Storage();
    let date = new Date(BEFORE_MIDNIGHT);
    const a = await client(fixture({ storage }), { now: () => date });
    const b = await client(fixture({ storage }), { now: () => date });
    let accepted = ZERO;
    for (let i = ZERO; i < EXPECTED_DAILY; i += ONE) {
      accepted += Number((i % PAIR ? a : b).record('first_contact', { mode: 'hand' }));
    }
    assert.equal(accepted, EXPECTED_DAILY);
    assert.equal(a.record('first_contact', { mode: 'hand' }), false);
    const reload = await client(fixture({ storage }), { now: () => date });
    assert.equal(reload.record('first_contact', { mode: 'bot' }), false);
    assert.equal(JSON.parse(storage.getItem(STORAGE_KEY)).count, EXPECTED_DAILY);
    date = new Date(AFTER_MIDNIGHT);
    assert.equal(reload.record('return_visit', { mode: 'hand' }), true);
    assert.equal(JSON.parse(storage.getItem(STORAGE_KEY)).count, ONE);
    return { accepted, rejected501: true, rejectedReload: true, nextLocalDayAccepted: true };
  });

  await axis('offline-ring', '수집기 없는 고리 초과와 pagehide는 전송하지 않음', async () => {
    assert.equal(TELEMETRY_ENDPOINT, '');
    const f = fixture();
    const c = await client(f);
    for (let i = ZERO; i < RING_LIMIT + OVERFLOW; i += ONE) c.record('first_contact', { mode: 'hand' });
    f.hide();
    assert.equal(c.flush(), false);
    assert.equal(f.beacons.length, ZERO);
    assert.equal(c.snapshot().length, RING_LIMIT);
    assert.equal(c.snapshot()[ZERO].sequence, OVERFLOW + ONE);
    const copy = c.snapshot();
    copy[ZERO].source = 'mutated';
    assert.equal(c.snapshot()[ZERO].source, 'direct');
    assert.ok(fetches.every(url => url.endsWith('/web/build.json')));
    return { beaconCount: f.beacons.length, ringSize: c.snapshot().length, buildMetadataReadsOnly: fetches };
  });

  await axis('beacon-positive-control', '시험 수집기에서 용량 경계와 pagehide의 JSON 배치 관측', async () => {
    const f = fixture();
    const c = await client(f, { endpoint: '/telemetry-test' });
    for (let i = ZERO; i < EXPECTED_DAILY; i += ONE) assert.equal(c.record('first_contact', { mode: 'bot' }), true);
    assert.ok(f.beacons.length > ZERO);
    f.hide();
    const delivered = f.beacons.flatMap(b => JSON.parse(b.payload).events);
    assert.equal(delivered.length, EXPECTED_DAILY);
    assert.equal(new Set(delivered.map(e => e.event_id)).size, EXPECTED_DAILY);
    assert.ok(f.beacons.every(b => b.endpoint === '/telemetry-test' && Buffer.byteLength(b.payload) <= BATCH_BYTES));
    const sent = f.beacons.length;
    f.hide();
    assert.equal(f.beacons.length, sent);
    return { delivered: delivered.length, batches: f.beacons };
  });

  await axis('beacon-retry', '큐 거절과 예외 뒤 배치를 보존하고 수락 후 중복 없음', async () => {
    const f = fixture();
    const send = f.host.navigator.sendBeacon;
    const c = await client(f, { endpoint: '/telemetry-test' });
    c.record('first_playable', { mode: 'hand' });
    f.host.navigator.sendBeacon = () => false;
    assert.equal(c.flush(), false);
    f.host.navigator.sendBeacon = () => { throw new Error('offline'); };
    assert.equal(c.flush(), false);
    f.host.navigator.sendBeacon = send;
    assert.equal(c.flush(), true);
    assert.equal(JSON.parse(f.beacons[ZERO].payload).events.length, ONE);
    assert.equal(c.flush(), false);
    return { retryAccepted: true, beacons: f.beacons };
  });

  await axis('privacy-opt-out', '저장소 거부 표지와 브라우저 DNT, 실행 중 거부가 기록과 대기 전송을 차단', async () => {
    const observations = [];
    const blockers = [f => f.host.localStorage.setItem(OPT_OUT_KEY, 'true'),
      f => f.host.localStorage.setItem(DNT_KEY, '1'),
      f => { f.host.navigator.doNotTrack = '1'; },
      f => { f.host.doNotTrack = 'yes'; },
      f => { f.host.navigator.globalPrivacyControl = true; }];
    for (const block of blockers) {
      const f = fixture();
      const c = await client(f, { endpoint: '/telemetry-test' });
      assert.equal(c.record('first_playable', { mode: 'hand' }), true);
      block(f);
      assert.equal(c.record('first_contact', { mode: 'hand' }), false);
      assert.equal(c.accrueIdle(IDLE_A), false);
      f.hide();
      assert.equal(c.snapshot().length, ZERO);
      assert.equal(f.beacons.length, ZERO);
      const blockedReload = await client(f);
      assert.equal(blockedReload.record('return_visit', { mode: 'hand' }), false);
      observations.push({ acceptedBeforeBlock: true, recordsAfterBlock: ZERO, beacons: ZERO });
    }
    return observations;
  });

  await axis('idle-aggregate', '방치 틱 둘은 flush 시 합계 하나이고 재호출은 중복 없음', async () => {
    const f = fixture();
    const c = await client(f, { endpoint: '/telemetry-test' });
    assert.equal(c.accrueIdle(IDLE_A), true);
    assert.equal(c.accrueIdle(IDLE_B), true);
    assert.equal(c.snapshot().length, ZERO);
    f.hide();
    const events = JSON.parse(f.beacons[ZERO].payload).events;
    assert.equal(events.length, ONE);
    assert.equal(events[ZERO].event, 'idle_accrual');
    assert.equal(events[ZERO].mode, 'bot');
    assert.deepEqual(events[ZERO].data, { amount: IDLE_A.amount + IDLE_B.amount,
      duration_ms: IDLE_A.duration_ms + IDLE_B.duration_ms });
    f.hide();
    assert.equal(f.beacons.length, ONE);
    assert.equal(JSON.parse(f.host.localStorage.getItem(STORAGE_KEY)).count, ONE);
    return { events, beacons: f.beacons.length };
  });

  await axis('source-device', '허용 키와 값만 유입으로 남고 화면 크기는 세 구간으로만 남음', async () => {
    const samples = [];
    for (const [search, expected] of [['?src=%20reddit%20', 'reddit'],
      ['?utm_source=discord', 'discord'], ['?email=reddit', 'direct'],
      ['?src=' + 'x'.repeat(EXPECTED_SOURCE_LENGTH + ONE), 'direct']]) {
      const c = await client(fixture({ search }));
      c.record('first_playable', { mode: 'hand' });
      assert.equal(c.snapshot()[ZERO].source, expected);
      samples.push(c.snapshot()[ZERO].source);
    }
    const devices = [];
    for (const [width, touch, viewport, input] of [[PHONE, true, 'phone', 'touch'],
      [TABLET, true, 'tablet', 'touch'], [DESKTOP, false, 'desktop', 'non-touch']]) {
      const c = await client(fixture({ width, touch }));
      c.record('first_playable', { mode: 'hand' });
      assert.deepEqual(c.snapshot()[ZERO].device, { viewport, input });
      devices.push(c.snapshot()[ZERO].device);
    }
    return { sources: samples, devices };
  });

  await axis('personal-denylist', '개인 패턴을 모든 자유 입력에 심고 탐지기의 양성 대조군 확인', async () => {
    const patterns = ['person@example.test', '+82-10-1234-5678', '203.0.113.42',
      'https://private.example/profile', 'Bearer secret-token', '홍길동', 'private-user-name'];
    const leaks = value => patterns.filter(pattern => JSON.stringify(value).includes(pattern));
    assert.equal(leaks(patterns).length, patterns.length);
    const recorded = [];
    for (const personal of patterns) {
      const f = fixture({ search: '?src=' + encodeURIComponent(personal) + '&utm_source=' + encodeURIComponent(personal) });
      const c = await client(f, { endpoint: '/telemetry-test' });
      assert.equal(c.record('error', { mode: 'hand', category: personal, message: personal,
        stack: personal, user: personal, install_id: personal }), true);
      assert.equal(c.record(personal, { mode: 'hand' }), false);
      assert.equal(c.record('training_spent', { mode: 'hand', amount: personal }), false);
      c.flush();
      assert.deepEqual(leaks(c.snapshot()), []);
      assert.deepEqual(leaks(f.beacons), []);
      recorded.push(...c.snapshot());
    }
    return { positiveDetections: patterns.length, outputDetections: ZERO, recorded };
  });

  await axis('storage-disposal', '저장소 고장과 변조는 수집을 닫고 dispose는 이벤트 청취를 제거', async () => {
    for (const broken of ['read', 'write', 'corrupt']) {
      const f = fixture();
      if (broken === 'read') f.host.localStorage.getItem = () => { throw new Error('denied'); };
      if (broken === 'write') f.host.localStorage.setItem = () => { throw new Error('quota'); };
      if (broken === 'corrupt') f.host.localStorage.setItem(STORAGE_KEY, '{invalid');
      const c = await client(f);
      assert.equal(c.record('first_playable', { mode: 'hand' }), false);
      assert.equal(c.snapshot().length, ZERO);
    }
    const f = fixture();
    const c = await client(f, { endpoint: '/telemetry-test' });
    assert.equal(c.record('first_playable', { mode: 'hand' }), true);
    c.dispose();
    f.hide();
    assert.equal(c.record('first_contact', { mode: 'hand' }), false);
    assert.equal(f.beacons.length, ZERO);
    return { blockedStorageCases: ['read', 'write', 'corrupt'], disposedBeacons: ZERO };
  });
} finally {
  clients.forEach(c => c.dispose());
  globalThis.fetch = originalFetch;
}

// 기존 봇 계기가 쓰는 브라우저와 같은 실행 파일로 실제 화면 배선을 잰다.
const executablePath = process.env.LOCALAPPDATA + '/ms-playwright/chromium-1228/chrome-win64/chrome.exe';
const base = 'http://127.0.0.1:10310/web/index.html';
// 호출자가 지정한 데스크톱 수용 시나리오다.
const viewport = { width: 1280, height: 720 };
// 신인 한 세트의 재시작과 자막을 모두 기다리는 상한이다. 타이머를 건너뛰지 않는다.
const JOURNEY_MS = 180000;
// 요청 수집을 비동기 Beacon 큐가 서버까지 전달할 때까지 기다리는 짧은 폴링이다.
const POLL_MS = 100;
// JPEG는 증거 화면을 읽을 수 있으면서 세션의 이미지 바이트를 제한한다.
const JPEG_QUALITY = 80;
// HTTP 성공 응답 코드로 죽은 정적 서버를 브라우저 실패와 구분한다.
const HTTP_OK = 200;
const plantedName = 'private-user-name';
const batches = [];
const server = createServer((req, res) => {
  let body = '';
  req.on('data', chunk => { body += chunk; });
  req.on('end', () => { batches.push(JSON.parse(body)); res.end('ok'); });
});
let browser;
let browserVersion;
try {
  assert.equal((await fetch(base)).status, HTTP_OK);
  await new Promise(resolve => server.listen(ZERO, '127.0.0.1', resolve));
  const endpoint = 'http://127.0.0.1:' + server.address().port + '/batch';
  browser = await chromium.launch({ executablePath });
  browserVersion = browser.version();
  for (const mode of ['hand', 'bot']) {
    await axis('browser-journey-' + mode, '실제 한 세트와 둘째 시작, 훈련, 봇 전환, 재방문 및 오류 범주', async () => {
      const context = await browser.newContext({ viewport });
      const page = await context.newPage();
      const requests = [], errors = [];
      page.on('request', request => {
        if (new URL(request.url()).origin !== new URL(base).origin) requests.push(request.url());
      });
      page.on('pageerror', error => errors.push(error.message));
      // 제품 기본값은 유지한다. 봇 대조군만 모듈 응답에서 시험 수집기를 주입한다.
      await page.route('**/web/src/telemetry.mjs', async route => {
        let source = (await (await route.fetch()).text()).replaceAll('\r\n', '\n');
        if (mode === 'bot') source = source.replace("TELEMETRY_ENDPOINT = ''", 'TELEMETRY_ENDPOINT = ' + JSON.stringify(endpoint));
        assert.ok(source.includes('return {\n    record, accrueIdle, flush,'));
        source = source.replace('return {\n    record, accrueIdle, flush,', 'return window.__testTelemetry = {\n    record, accrueIdle, flush,');
        await route.fulfill({ body: source, contentType: 'text/javascript' });
      });
      try {
        await page.goto(base + '?seed=20&preset=veteran&src=' + plantedName);
        await page.waitForFunction(() => window.__telemetry && window.__bot);
        assert.deepEqual(await page.evaluate(() => window.__telemetry()), []);
        if (mode === 'bot') {
          // 크레딧은 구입 가능한 첫 봇의 한 판 이상분으로 넣고 실제 전환 버튼을 누른다.
          await page.evaluate(async () => {
            const { BOTS } = await import('/web/src/state/bot.mjs');
            // 분 단위 상품을 저장소의 밀리초 단위로 바꾸는 환산이다.
            const MINUTE_MS = 60000;
            const [first] = BOTS;
            Object.assign(window.__bot(), { tier: first.tier, ms: first.minutes * MINUTE_MS });
          });
          await page.locator('#auto').dispatchEvent('pointerdown');
        }
        await page.locator('#go').click({ force: true });
        // waitForFunction은 Promise 자체를 참으로 볼 수 있어 동기 고리만 폴링한다.
        await page.waitForFunction(() => window.__testTelemetry.snapshot().some(e => e.event === 'second_set_start'), null, { timeout: JOURNEY_MS });
        await page.evaluate(() => window.__lockRound());
        if (mode === 'hand') {
          await page.locator('#gymBtn').dispatchEvent('pointerdown');
          await page.locator('#gym .row button:not([disabled])').first().click();
          await page.locator('#gym .close').click();
        } else await page.locator('#auto').dispatchEvent('pointerdown');
        const beforeError = await page.evaluate(() => window.__telemetry());
        assert.deepEqual(errors, []);
        // 자유 문자열을 가진 오류도 범주만 남고 허용 목록 밖 사건은 떨어져야 한다.
        const rejected = await page.evaluate(name => {
          const rejected = window.__testTelemetry.record(name, { mode: 'hand' });
          dispatchEvent(new ErrorEvent('error', { message: name }));
          return rejected;
        }, plantedName);
        assert.equal(rejected, false);
        await page.evaluate(() => dispatchEvent(new PageTransitionEvent('pagehide')));
        const events = await page.evaluate(() => window.__telemetry());
        const journey = events.filter(e => ['first_playable', 'first_contact', 'set_complete', 'second_set_start'].includes(e.event));
        assert.deepEqual(journey.map(e => e.event), ['first_playable', 'first_contact', 'set_complete', 'second_set_start']);
        assert.ok(journey.every(e => e.mode === mode));
        assert.ok(events.some(e => e.event === 'training_spent' && e.data.amount > ZERO && e.mode === mode));
        assert.equal(events.at(-ONE).event, 'error');
        assert.deepEqual(events.at(-ONE).data, { category: 'runtime' });
        assert.ok(events.every((e, index) => e.sequence === index + ONE && e.source === 'direct'));
        const leaks = value => JSON.stringify(value).includes(plantedName);
        assert.equal(leaks({ source: plantedName }), true);
        assert.equal(leaks(events), false);
        if (mode === 'hand') assert.equal(requests.length, ZERO);
        else {
          const until = Date.now() + JOURNEY_MS;
          while (!batches.length && Date.now() < until) await new Promise(resolve => setTimeout(resolve, POLL_MS));
          assert.ok(requests.includes(endpoint));
          assert.deepEqual(batches.flatMap(batch => batch.events), events);
          assert.equal(leaks(batches), false);
          assert.ok(events.some(e => e.event === 'bot_on' && e.mode === 'bot'));
          assert.ok(events.some(e => e.event === 'bot_off' && e.mode === 'hand'));
        }
        const screenshot = evidenceDir + mode + '-second-set.jpg';
        await page.screenshot({ path: screenshot, type: 'jpeg', quality: JPEG_QUALITY });
        await page.evaluate(() => window.__persist());
        await page.reload();
        await page.waitForFunction(() => window.__testTelemetry?.snapshot().some(e => e.event === 'return_visit'));
        const returned = await page.evaluate(() => window.__telemetry());
        assert.equal(returned.filter(e => e.event === 'return_visit').length, ONE);
        assert.equal(returned[ZERO].install_id, events[ZERO].install_id);
        assert.notEqual(returned[ZERO].session_id, events[ZERO].session_id);
        return { events, beforeError, returned, rejected, crossOriginRequests: requests, batches: structuredClone(batches), screenshot };
      } finally { await context.close(); }
    });
  }
} catch (error) {
  results.push({ name: 'browser-setup', scenario: '서버와 Chromium 실행', invocation, pass: false, error: error.stack });
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}

const failed = results.filter(result => !result.pass);
const report = { invocation, captured_at: new Date().toISOString(),
  binary: { path: process.execPath, version: process.version,
    declaredEngines: JSON.parse(readFileSync(new URL('../package.json', import.meta.url))).engines ?? null,
    playwright: createRequire(import.meta.url)('playwright/package.json').version, executablePath, browserVersion },
  pass: !failed.length, results };
const artifact = evidenceDir + 'gate.json';
writeFileSync(artifact, JSON.stringify(report, null, PAIR) + '\n');
console.log('telemetry ' + (failed.length ? 'FAIL' : 'PASS') + ' ' + results.length + ' axes');
console.log('evidence ' + artifact);
if (failed.length) process.exitCode = ONE;
