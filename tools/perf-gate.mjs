// 프레임 예산 계측기. 선언값을 읽지 않고 실제로 프레임을 돌린다.
// p50만 보면 못 잡는다. 정지 카메라에서 94fps가 나오는 동안 게임이 멈춰 있을 수 있다.
// 그래서 p50/p95/p99와 최악 프레임, 그리고 드로우콜과 삼각형을 같이 남긴다.
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { clearDraw } from './draw.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';

const EVIDENCE = new URL('../.omo/evidence/p29/', import.meta.url);
mkdirSync(EVIDENCE, { recursive: true });
const LOAD_MS = 35; // 기존 20ms 예산을 확실히 넘는 실제 작업을 심어 하강 축을 검증한다.
const LOAD_SPAN = 7000; // 네 단계 하강 뒤에도 부하를 유지해 하한에서 멈추는지 잰다.
const RECOVER_WAIT = 22000; // 네 단계의 느린 회복 창과 공유 기계 여유를 포함한다.
const SETTLE_WAIT = 20000; // 기본 화면으로 돌아온 뒤 배율이 안정될 때까지 기다리는 상한이다.
const STABLE_MS = 3000; // 세 판단 창 동안 같은 배율이어야 기존 프레임 계측을 시작한다.
const HEADROOM = { width: 320, height: 180 }; // 실제 그리기 면적을 줄여 회복 축에 GPU 여유를 제공한다.

const EXE = process.env.LOCALAPPDATA + '/ms-playwright/chromium-1228/chrome-win64/chrome.exe';
const PAGE_URL = 'http://127.0.0.1:10310/web/index.html?seed=11';

const die = setTimeout(() => { console.log('WATCHDOG'); process.exit(1); }, 150000); // 부하·회복·안정화와 기존 프레임 표본을 모두 수집할 실행 시간이다.
die.unref();

function pct(sorted, p) {
  if (!sorted.length) return 0;
  const i = Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p));
  return sorted[i];
}

let browser;
try {
  let cpu = 'unread', foreignChrome = 'unread';
  try {
    const load = JSON.parse(execFileSync('powershell', ['-NoProfile', '-Command',
      '[pscustomobject]@{ cpu = ((Get-CimInstance Win32_Processor -ErrorAction Stop | Measure-Object -Property LoadPercentage -Average).Average); foreignChrome = @(Get-Process chrome -ErrorAction SilentlyContinue).Count } | ConvertTo-Json -Compress',
    ], { encoding: 'utf8', timeout: 2500, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }));
    if (Number.isFinite(load.cpu) && Number.isFinite(load.foreignChrome)) {
      cpu = load.cpu;
      foreignChrome = load.foreignChrome;
    }
  } catch {}
  const machineLoad = 'cpu=' + cpu + (typeof cpu === 'number' ? '%' : '') + ' foreign-chrome=' + foreignChrome;
  browser = await chromium.launch({ executablePath: EXE, args: ['--use-gl=angle', '--enable-gpu'] });
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2 })).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

  await page.goto(PAGE_URL, { waitUntil: 'load' });
  await page.waitForTimeout(900);
  await page.click('#go', { force: true });
  // 개봉 카드를 닫은 실제 경기에서 프레임과 기하 예산을 함께 잰다.
  if (!await clearDraw(page)) throw Error('개봉 판이 닫히지 않아 경기를 측정할 수 없음');
  await page.waitForTimeout(1200);

  // 합성 시간값을 주입하지 않는다. 실제 rAF 작업으로 느리게 만들고 실제 캔버스로 하강과 복원을 읽는다.
  await page.setViewportSize(HEADROOM);
  if (await page.evaluate(() => Boolean(window.__resolutionState))) {
    await page.waitForFunction(() => window.__resolutionState().scale === 1, null, { timeout: RECOVER_WAIT }); // 시작 화면의 부하가 남아 있으면 양성 대조군 전에 실제 여유로 복원한다.
  }
  const adaptive = await page.evaluate(async ({ loadMs, span }) => {
    if (!window.__resolutionState) return { missing: true };
    const before = window.__resolutionState(), samples = [];
    const start = performance.now();
    await new Promise(resolve => {
      function heavy() {
        const tick = performance.now();
        while (performance.now() - tick < loadMs) { /* 해상도 하강을 유발할 실제 작업이다. */ }
        samples.push(window.__resolutionState());
        if (performance.now() - start < span) requestAnimationFrame(heavy);
        else resolve();
      }
      requestAnimationFrame(heavy);
    });
    return { before, samples, loaded: window.__resolutionState() };
  }, { loadMs: LOAD_MS, span: LOAD_SPAN });
  if (!adaptive.missing) {
    try {
      await page.waitForFunction(() => window.__resolutionState().scale === 1, null, { timeout: RECOVER_WAIT });
      adaptive.recovered = await page.evaluate(() => window.__resolutionState());
    } catch (error) { adaptive.recoveryError = String(error); }
  }
  await page.setViewportSize({ width: 1280, height: 720 });
  try {
    await page.waitForFunction(stable => {
      const state = window.__resolutionState?.();
      return state && state.mean !== null && performance.now() - state.lastChange >= stable;
    }, STABLE_MS, { timeout: SETTLE_WAIT });
    adaptive.settled = await page.evaluate(() => window.__resolutionState());
  } catch (error) { adaptive.settleError = String(error); }
  writeFileSync(new URL('adaptive.json', EVIDENCE), JSON.stringify(adaptive, null, 2));

  const out = await page.evaluate(() => new Promise((resolve) => {
    const frames = [];
    // 실제 걷는 행인의 정점 버전은 0회 변해야 한다. 배치 행렬 갱신은 이 버전에 포함되지 않는다.
    const walkers = window.__sceneRoot().children.filter(o => o.visible && o.userData.walker);
    const attributes = new Set();
    let batches = 0;
    for (const walker of walkers) walker.traverse(o => {
      if (o.isBatchedMesh) batches += 1;
      if (o.isMesh) attributes.add(o.geometry.attributes.position);
    });
    const snapshot = [...attributes].map(a => ({a,version:a.version}));
    let last = performance.now();
    let n = 0;
    function tick() {
      const now = performance.now();
      frames.push(now - last);
      last = now;
      n += 1;
      if (n < 420) requestAnimationFrame(tick);
      else {
        const info = window.__renderInfo ? window.__renderInfo() : null;
        // 같은 버전 자에 갱신을 한 번 심어 0회라는 판정이 끊긴 계기가 아님을 확인한다.
        const plant = snapshot[0]?.a.clone();
        const initial = plant?.version;
        if (plant) plant.needsUpdate = true;
        resolve({ frames: frames.slice(30), info, walkers:walkers.length, batches,
          buffers:snapshot.length, writes:snapshot.reduce((n,{a,version})=>n+a.version-version,0),
          plantedWrites:plant ? plant.version-initial : 0 });
      }
    }
    requestAnimationFrame(tick);
  }));

  const sorted = out.frames.slice().sort((a, b) => a - b);
  const p50 = pct(sorted, 0.5);
  const p95 = pct(sorted, 0.95);
  const p99 = pct(sorted, 0.99);
  const worst = sorted[sorted.length - 1];
  const rows = [[true, 'instrument:machine-load-at-measurement', machineLoad]];
  const ok = (name, pass, detail) => rows.push([pass, name,
    !pass && name.startsWith('frame:') && (cpu >= 50 || foreignChrome > 0)
      ? detail + ' under load (' + machineLoad + '): rerun standalone before reading as product'
      : detail,
  ]);

  ok('resolution:heavy-load-lowers-the-actual-buffer', !adaptive.missing
    && adaptive.loaded.scale < adaptive.before.scale
    && adaptive.loaded.canvas[0] < adaptive.before.canvas[0], JSON.stringify(adaptive.loaded ?? adaptive));
  ok('resolution:sustained-load-reaches-and-keeps-the-quality-floor', !adaptive.missing
    && adaptive.samples.length > 0 && adaptive.loaded.scale === adaptive.loaded.floor
    && adaptive.samples.every(s => s.scale >= s.floor && s.dpr >= Math.min(1, s.baseDpr)),
    JSON.stringify({ samples: adaptive.samples?.length, floor: adaptive.loaded?.floor, scale: adaptive.loaded?.scale }));
  ok('resolution:headroom-restores-the-full-buffer', Boolean(adaptive.recovered)
    && adaptive.recovered.scale === 1 && adaptive.recovered.dpr === adaptive.before.baseDpr
    && adaptive.recovered.canvas[0] === adaptive.before.canvas[0], JSON.stringify(adaptive.recovered ?? adaptive.recoveryError));
  ok('resolution:frame-budget-was-measured-after-settling', Boolean(adaptive.settled), JSON.stringify(adaptive.settled ?? adaptive.settleError));

  // 대조군. 계측기가 실제로 시간을 재는지부터 증명한다.
  const stall = await page.evaluate(() => {
    const t0 = performance.now();
    while (performance.now() - t0 < 120) { /* deliberate stall */ }
    return performance.now() - t0;
  });
  ok('control:the-meter-sees-a-deliberate-120ms-stall', stall >= 110 && stall < 400, stall.toFixed(1) + 'ms');
  ok('control:frames-were-actually-collected', out.frames.length >= 350, String(out.frames.length));

  ok('instrument:animated-walker-batches-were-measured', out.walkers > 0 && out.batches >= out.walkers,
    out.walkers + ' walkers, ' + out.batches + ' batches');
  ok('draw:walking-keeps-vertex-buffers-immutable', out.buffers > 0 && out.writes === 0,
    out.writes + ' writes across ' + out.buffers + ' buffers');
  ok('control:a-vertex-upload-reddens-the-immutable-axis', out.plantedWrites > 0,
    out.plantedWrites + ' planted writes');

  ok('frame:p50-under-20ms', p50 < 20, p50.toFixed(2) + 'ms');
  ok('frame:p95-under-33ms', p95 < 33, p95.toFixed(2) + 'ms');
  ok('frame:p99-under-50ms', p99 < 50, p99.toFixed(2) + 'ms');
  ok('frame:no-single-frame-over-200ms', worst < 200, worst.toFixed(1) + 'ms');

  if (out.info) {
    ok('draw:calls-under-120', out.info.calls < 120, String(out.info.calls));
    ok('draw:triangles-under-60k', out.info.triangles < 60000, String(out.info.triangles));
    ok('draw:programs-under-24', out.info.programs < 24, String(out.info.programs));
  } else {
    ok('draw:renderer-info-exposed', false, 'window.__renderInfo missing');
  }
  ok('console:no-errors', errors.length === 0, errors.length ? errors[0].slice(0, 140) : 'clean');

  let bad = 0;
  for (const [pass, name, detail] of rows) {
    if (!pass) bad += 1;
    console.log('  ' + (pass ? 'ok  ' : 'FAIL') + ' ' + name + ' ' + detail);
  }
  console.log('perf ' + (bad ? 'FAIL ' + bad : 'PASS ' + rows.length));
  writeFileSync(new URL('perf.json', EVIDENCE), JSON.stringify({ invocation: 'node tools/perf-gate.mjs', machineLoad, adaptive,
    p50, p95, p99, worst, rows, errors, out, pass: bad === 0 }, null, 2));
  process.exitCode = bad ? 1 : 0;
} finally {
  clearTimeout(die);
  if (browser) await browser.close();
}
