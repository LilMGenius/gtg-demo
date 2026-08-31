import { chromium } from "playwright";
import { writeFileSync } from "node:fs";

// 사건이 일어난 순간이 그림으로 남는지 재는 자.
// critic 28은 아홉 장의 스크린샷을 보고 히트스톱도 셰이크도 흙도 없다고 판정했다.
// 코드에는 셋 다 있다. 그러면 갈릴 것은 하나다: 언제 찍었느냐.
// 그래서 두 시점에서 잰다. 임팩트가 터진 직후(PEAK)와 스크린샷이 실제로 찍히는 시점(LATE, 사건 뒤 520ms).
// PEAK만 초록이고 LATE가 0이면 렌더러가 아니라 캡처 타이밍이 거짓말을 한 것이다.
// 둘 다 낮으면 연출 자체가 안 읽히는 것이다. 이 자가 그 둘을 갈라준다.
//
// 화소는 차분으로만 말한다. 같은 프레임을 임팩트를 켠 것과 끈 것으로 두 번 그리고,
// 그 차분이 임팩트의 화소다. 세 번째 장으로 잡음 바닥을 같이 잰다.
// 세계시계 정지는 화소로 못 잰다. __now()와 performance.now()의 증가 비율로 잰다.
// 렌즈 밀림과 공 찌그러짐은 프레임 사이로 피크가 빠져나가므로 그리는 쪽이 최고값을 적고 여기서 읽는다.

const EXE = process.env.LOCALAPPDATA + "/ms-playwright/chromium-1228/chrome-win64/chrome.exe";
const URL = "http://127.0.0.1:10310/web/index.html?seed=" + (process.argv[2] || 7);
const W = 1280;
const H = 720;
// 손이 닿은 사건 넷. 이 넷이 전부 히트스톱과 버스트를 선언하는 사건이다.
const KINDS = ["save", "gloveGone", "carriedIn", "downed"];
// 임팩트가 화면을 덮는 화소. 별 일곱 선 + 흙 여섯 장 + 글자 한 장이 1280x720에서 차지하는 값이다.
const BAR_PEAK = 1200;
// 스크린샷이 찍히는 시점에도 남아 있어야 하는 화소. 피크의 절반은 과한 요구라 1/4로 둔다.
const BAR_LATE = 300;
// 히트스톱 구간에서 세계시계가 실시간의 몇 배로 흐르는가. HIT_SCALE이 0.08이므로 0.25는 넉넉한 바다.
const BAR_STALL = 0.25;
// 렌즈가 밀린 최고 거리(월드 단위). SHK 표의 최소 진폭이 0.03이므로 그 절반을 바로 둔다.
const BAR_CAM = 0.015;
// 공이 찌그러진 최고 비율. 1.3/0.7이면 0.85가 나온다. 눈에 읽히는 하한을 0.15로 둔다.
const BAR_SQUASH = 0.15;
const BAR_NOISE = 50;
const LUM = 12;
const SHOT_DELAY = 520;
const t = setTimeout(() => { console.log("WATCHDOG"); process.exit(1); }, 280000);
t.unref();

const waitCue = () => new Promise((res) => {
  const t0 = performance.now();
  const tick = () => {
    if (window.__flightVis().cue) { res(true); return; }
    if (performance.now() - t0 > 14000) { res(false); return; }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
});

// 히트스톱 구간의 세계시계와 실시간을 같이 적는다. 페이지 안에서 재야 왕복 지연이 안 섞인다.
// 사건 선언 직후 90ms 동안 세계가 얼마나 갔는지가 정지의 증거다.
const measureStall = (ms) => new Promise((res) => {
  const w0 = window.__now();
  const r0 = performance.now();
  const tick = () => {
    if (performance.now() - r0 >= ms) {
      const dr = performance.now() - r0;
      const dw = window.__now() - w0;
      res({ real: dr, world: dw, ratio: dr > 0 ? dw / dr : 1 });
      return;
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
});

// 임팩트가 살아 있는 프레임까지 기다린다. 죽은 뒤에 멈추면 잴 것이 없다.
const waitBurst = () => new Promise((res) => {
  const t0 = performance.now();
  const tick = () => {
    const s = window.__impactVis();
    if (s.life > 0 && s.u > 0.02) { window.__freeze(true); res(s); return; }
    if (performance.now() - t0 > 2500) { res(null); return; }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
});

async function diff([A, B, lum]) {
  const read = async (b64) => {
    const im = new Image();
    im.src = "data:image/png;base64," + b64;
    await im.decode();
    const cv = document.createElement("canvas");
    cv.width = im.width; cv.height = im.height;
    cv.getContext("2d").drawImage(im, 0, 0);
    return cv.getContext("2d").getImageData(0, 0, im.width, im.height);
  };
  const a = await read(A);
  const b = await read(B);
  let n = 0;
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  for (let y = 0; y < a.height; y += 1) {
    for (let x = 0; x < a.width; x += 1) {
      const i = (y * a.width + x) * 4;
      const d = Math.abs(a.data[i] - b.data[i]) + Math.abs(a.data[i + 1] - b.data[i + 1]) + Math.abs(a.data[i + 2] - b.data[i + 2]);
      if (d < lum * 3) continue;
      n += 1;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  return { n, x0, x1, y0, y1 };
}

// HUD는 CSS 시간으로 움직여 __freeze가 못 세운다. 측정면은 캔버스다.
const shots = async (p) => {
  const cv = p.locator("#stage");
  // 정지를 건 프레임은 아직 정지 전 값으로 그려진다. camEvLeft는 amt를 쓴 뒤에 줄어들어
  // 정지 직후 한 프레임이 amt 한 칸을 더 밟는다(계측: fov가 idle0에서 idle1로 갈 때만 움직인다).
  // 그 한 프레임을 흘려보내고 재야 a와 a2가 같은 그림이 된다.
  await p.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const grab = async () => (await cv.screenshot({ type: "png" })).toString("base64");
  const cam = () => p.evaluate(() => ({ c: window.__ballProbe.camState(), d: window.__camDbg() }));
  const c0 = await cam();
  const a = await grab();
  await p.evaluate(() => window.__impactHide(true));
  await p.waitForTimeout(120);
  const b = await grab();
  await p.evaluate(() => window.__impactHide(false));
  await p.waitForTimeout(120);
  const a2 = await grab();
  const c1 = await cam();
  return { a, b, a2, c0, c1 };
};

const dump = (tag, s) => {
  for (const k of ["a", "b", "a2"]) {
    writeFileSync("impact-" + tag + "-" + k + ".local.png", Buffer.from(s[k], "base64"));
  }
  console.log("  wrote impact-" + tag + "-{a,b,a2}.local.png");
};

let br;
let fail = 0;
try {
  br = await chromium.launch({ executablePath: EXE });
  const ctx = await br.newContext({ viewport: { width: W, height: H } });
  const p = await ctx.newPage();
  const errs = [];
  p.on("pageerror", (e) => errs.push(String(e)));
  await p.goto(URL, { waitUntil: "load" });
  await p.waitForTimeout(1200);
  await p.click("#go", { force: true });
  await p.waitForTimeout(1800);

  const rows = [];
  for (const kind of KINDS) {
    let row = null;
    for (let a = 0; a < 3 && !row; a += 1) {
      const armed = await p.evaluate(waitCue);
      if (!armed) { console.log(kind + " retry " + a + ": no kick within 14s"); continue; }
      await p.keyboard.press("ArrowLeft");
      await p.waitForTimeout(700);
      await p.evaluate((k) => window.__act(k), kind);
      const stall = await p.evaluate(measureStall, 90);
      const live = await p.evaluate(waitBurst);
      if (!live) { console.log(kind + " retry " + a + ": burst never lit"); continue; }
      const peakShots = await shots(p);
      await p.evaluate(() => window.__freeze(false));
      const peak = await p.evaluate(diff, [peakShots.a, peakShots.b, LUM]);
      const noise = await p.evaluate(diff, [peakShots.a, peakShots.a2, LUM]);

      // 스크린샷이 실제로 찍히는 시점. 사건 선언에서 520ms 뒤다.
      await p.waitForTimeout(Math.max(0, SHOT_DELAY - 400));
      const lateState = await p.evaluate(() => { window.__freeze(true); return window.__impactVis(); });
      const lateShots = await shots(p);
      await p.evaluate(() => window.__freeze(false));
      const late = await p.evaluate(diff, [lateShots.a, lateShots.b, LUM]);

      // 셰이크와 찌그러짐의 최고값은 사건이 다 지나간 뒤에 읽어야 잘린 값이 아니다.
      await p.waitForTimeout(700);
      const vis = await p.evaluate(() => window.__impactVis());
      // 강제 선언한 사건 뒤에 그 구의 진짜 사건이 따라오면 act가 최고값을 0으로 되돌린다.
      // 계측: save만 cam과 squash가 동시에 0이고 나머지 셋은 정상이었다.
      // 두 시점의 최고값을 취하면 덮이기 전 표본이 남는다.
      const camOff = Math.max(vis.camOff, lateState.camOff);
      const squash = Math.max(vis.squash, lateState.squash);
      row = { kind, peak: peak.n, late: late.n, noise: noise.n, stall: stall.ratio,
        cam: camOff, squash, u: live.u, lateU: lateState.u };
      rows.push(row);
      console.log(kind + " peakPx=" + peak.n + " latePx=" + late.n + " noise=" + noise.n
        + " stall=" + stall.ratio.toFixed(3) + " cam=" + camOff.toFixed(4)
        + " squash=" + squash.toFixed(3) + " u=" + live.u.toFixed(2) + " lateU=" + lateState.u.toFixed(2));
      if (peak.n < BAR_PEAK || late.n < BAR_LATE || noise.n >= BAR_NOISE) dump(kind, peakShots);
      if (noise.n >= BAR_NOISE) {
        console.log("  cam0=" + JSON.stringify(peakShots.c0) + " cam1=" + JSON.stringify(peakShots.c1));
      }
      await p.waitForTimeout(900);
    }
    if (!row) console.log("skip " + kind + " after 3 retries");
  }
  if (rows.length < KINDS.length) { console.log("INSTRUMENT DEAD: missing events"); process.exit(1); }

  // 대조군. 사건이 없는 정지 프레임에 같은 자를 댄다. 임팩트 화소는 0이어야 한다.
  await p.waitForTimeout(1500);
  await p.evaluate(() => window.__freeze(true));
  const idleShots = await shots(p);
  await p.evaluate(() => window.__freeze(false));
  const idle = await p.evaluate(diff, [idleShots.a, idleShots.b, LUM]);
  const idleNoise = await p.evaluate(diff, [idleShots.a, idleShots.a2, LUM]);
  if (idle.n > 0) dump("idle", idleShots);

  const minPeak = Math.min(...rows.map((r) => r.peak));
  const minLate = Math.min(...rows.map((r) => r.late));
  const maxStall = Math.max(...rows.map((r) => r.stall));
  const minCam = Math.min(...rows.map((r) => r.cam));
  const minSquash = Math.min(...rows.map((r) => r.squash));
  const maxNoise = Math.max(...rows.map((r) => r.noise), idleNoise.n);
  console.log("MIN_PEAK " + minPeak + "px (bar " + BAR_PEAK + ")");
  console.log("MIN_LATE " + minLate + "px (bar " + BAR_LATE + ")");
  console.log("MAX_STALL " + maxStall.toFixed(3) + " (bar <" + BAR_STALL + ")");
  console.log("MIN_CAM " + minCam.toFixed(4) + " (bar " + BAR_CAM + ")");
  console.log("MIN_SQUASH " + minSquash.toFixed(3) + " (bar " + BAR_SQUASH + ")");
  console.log("NOISE " + maxNoise + " (bar <" + BAR_NOISE + ")");
  console.log("CONTROL idle impactPx=" + idle.n);
  console.log("ERRORS " + errs.length);

  if (maxNoise >= BAR_NOISE) { console.log("INSTRUMENT DEAD: noise floor"); process.exit(1); }
  if (idle.n > 0) { console.log("INSTRUMENT DEAD: control impact lit"); process.exit(1); }
  if (minPeak < BAR_PEAK) fail += 1;
  if (minLate < BAR_LATE) fail += 1;
  if (maxStall >= BAR_STALL) fail += 1;
  if (minCam < BAR_CAM) fail += 1;
  if (minSquash < BAR_SQUASH) fail += 1;
  if (errs.length) fail += 1;
  console.log(fail ? "FAIL" : "PASS");
} finally {
  if (br) await br.close();
}
process.exit(fail ? 1 : 0);
