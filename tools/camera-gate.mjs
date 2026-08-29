// 사건마다 렌즈가 실제로 자리를 옮겼는지 재는 자. 표를 읽지 않고 카메라를 읽는다.
// 표에 값이 적혀 있는 것과 화면이 그 값으로 움직이는 것은 다른 주장이다.
// 세 가지를 잰다. 움직였는가, 사건마다 다르게 움직였는가, 끝나고 제자리로 왔는가.
import { chromium } from 'playwright';

const EXE = process.env.LOCALAPPDATA + '/ms-playwright/chromium-1228/chrome-win64/chrome.exe';
// 렌더 루프가 카메라를 되돌리는 기준. 여기서 얼마나 벗어났는지가 사건 카메라의 크기다.
// 상수로 박으면 프레이밍을 옮긴 날 자가 먼저 죽고, 죽은 자가 내는 빨간불은 전부 거짓이다.
// 사건이 하나도 걸리지 않은 정지 상태의 카메라를 페이지에 직접 물어서 기준으로 삼는다.
let BASE = [0, 3.3, -5.1];
let FOV = 46;
// 흔들림 최대 진폭은 0.062다. 그보다 크게 벗어나야 사건이 렌즈를 옮긴 것이다.
const MOVED = 0.2;
const FOV_MOVED = 1.0;
// 사건이 끝난 뒤 남아도 되는 양. 흔들림도 이때는 이미 끝나 있다.
const HOME = 0.09;
const FOV_HOME = 0.35;
// 두 사건의 최대 이탈 지점이 이보다 가까우면 둘은 같은 그림이다.
const APART = 0.2;

const KINDS = ['save', 'catch', 'carriedIn', 'gloveGone', 'downed', 'charge', 'spill'];
// 음성 대조군. 표에 없는 사건이다. 이것까지 움직이면 사건 카메라가 아니라 다른 것을 잰 것이다.
const CONTROL = 'talked';

const t = setTimeout(() => { console.log('WATCHDOG'); process.exit(1); }, 80000);
t.unref();

function dist(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

let b;
let bad = 0;
try {
  b = await chromium.launch({ executablePath: EXE });
  const p = await (await b.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  await p.goto('http://127.0.0.1:10310/web/index.html?seed=20', { waitUntil: 'load' });
  await p.waitForTimeout(1200);
  await p.click('#go', { force: true });
  await p.waitForTimeout(1500);

  const rest = await p.evaluate(() => window.__ballProbe.camState());
  BASE = rest.pos.slice();
  FOV = rest.fov;
  console.log('REST base=' + BASE.map((v) => v.toFixed(2)).join(',') + ' fov=' + FOV.toFixed(1));

  const peaks = {};
  for (const kind of KINDS.concat([CONTROL])) {
    const r = await p.evaluate(async ([k, base]) => {
      const cs = () => window.__ballProbe.camState();
      window.__act(k);
      const t0 = performance.now();
      let peak = null;
      let peakD = -1;
      let peakFov = 0;
      // 1.6초는 표의 가장 긴 지속(1.1초)에 여유를 얹은 값이다.
      while (performance.now() - t0 < 1600) {
        await new Promise((res) => requestAnimationFrame(res));
        const s = cs();
        const d = Math.hypot(s.pos[0] - base[0], s.pos[1] - base[1], s.pos[2] - base[2]);
        if (d > peakD) { peakD = d; peak = s.pos; peakFov = s.fov; }
      }
      // 지속이 끝나고도 남는 잔여를 잰다. 흔들림도 여기서는 이미 끝났다.
      await new Promise((res) => setTimeout(res, 400));
      const end = cs();
      return { peak, peakD, peakFov, end };
    }, [kind, BASE]);
    peaks[kind] = r;
    const home = dist(r.end.pos, BASE);
    const fovHome = Math.abs(r.end.fov - FOV);
    if (kind === CONTROL) {
      const ok = r.peakD <= HOME;
      if (!ok) bad += 1;
      console.log('CONTROL ' + kind + ' peak=' + r.peakD.toFixed(3) + ' (must stay under ' + HOME + ')  ' + (ok ? 'ok' : 'FAIL'));
      continue;
    }
    const movedOk = r.peakD >= MOVED;
    const fovOk = Math.abs(r.peakFov - FOV) >= FOV_MOVED;
    const homeOk = home <= HOME && fovHome <= FOV_HOME;
    if (!(movedOk && fovOk && homeOk)) bad += 1;
    console.log(
      kind.padEnd(10) +
      ' peak=' + r.peakD.toFixed(3) + (movedOk ? '' : ' MOVE-FAIL') +
      ' fov=' + r.peakFov.toFixed(1) + (fovOk ? '' : ' FOV-FAIL') +
      ' home=' + home.toFixed(3) + '/' + fovHome.toFixed(2) + (homeOk ? '' : ' HOME-FAIL')
    );
  }

  let minPair = Infinity;
  let minName = '';
  for (let i = 0; i < KINDS.length; i += 1) {
    for (let j = i + 1; j < KINDS.length; j += 1) {
      const d = dist(peaks[KINDS[i]].peak, peaks[KINDS[j]].peak);
      if (d < minPair) { minPair = d; minName = KINDS[i] + ' vs ' + KINDS[j]; }
    }
  }
  const apartOk = minPair >= APART;
  if (!apartOk) bad += 1;
  console.log('CLOSEST ' + minName + ' ' + minPair.toFixed(3) + '  BAR ' + APART + (apartOk ? '' : '  APART-FAIL'));
  console.log(bad === 0 ? 'camera PASS' : 'camera FAIL ' + bad);
  if (bad) process.exitCode = 2;
} finally {
  clearTimeout(t);
  if (b) await b.close();
}
