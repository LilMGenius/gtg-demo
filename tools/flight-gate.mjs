import { chromium } from "playwright";

// 날아오는 공이 읽히는지 재는 자. 화소가 있느냐(shot-gate)도, 정지한 공의 실루엣이 서느냐(read-gate)도 아니다.
// 카메라가 공의 진행축 위에 서 있으므로 비행은 화면에서 크기 변화로만 나타난다.
// 그 크기가 프레임 폭의 1퍼센트대에 머물면 관객은 공이 오는 것을 못 보고, 그 안에 넣은 잔상도 같이 죽는다.
// 바: 비행 중 공의 최소 지름 30px, 잔상은 비행 프레임 전부에서 여덟 장 전부 켜짐,
//     잔상 링이 공 반지름의 1.5배 밖까지 나감.
// 대조군: 비행이 아닐 때 같은 자를 대면 링이 0으로 무너져야 한다. 통과하면 자가 고장난 것이다.
const EXE = process.env.LOCALAPPDATA + "/ms-playwright/chromium-1228/chrome-win64/chrome.exe";
const URL = "http://127.0.0.1:10310/web/index.html?seed=" + (process.argv[2] || 7);
const W = 1280;
const H = 720;
const ROUNDS = 6;
const GHOSTS = 8;
const BAR_BALL = 30;
const BAR_RATIO = 1.5;
const t = setTimeout(() => { console.log("WATCHDOG"); process.exit(1); }, 150000);
t.unref();

const sampleFlight = () => new Promise((res) => {
  const out = [];
  const t0 = performance.now();
  const tick = () => {
    out.push(window.__flightVis());
    if (performance.now() - t0 < 2600) requestAnimationFrame(tick); else res(out);
  };
  requestAnimationFrame(tick);
});

const median = (a) => {
  const s = a.slice().sort((p, q) => p - q);
  return s.length ? s[s.length >> 1] : 0;
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

  const ballPx = [];
  const ratios = [];
  let frames = 0;
  let lit = 0;
  for (let i = 0; i < ROUNDS; i += 1) {
    await p.keyboard.press(i % 2 ? "ArrowRight" : "ArrowLeft");
    const rows = await p.evaluate(sampleFlight);
    // 실제로 공이 이동한 프레임만 비행이다. 발밑에 서 있는 프레임을 섞으면 최솟값이 그 자리에서 결정된다.
    const fly = rows.filter((r) => r.cue && r.step > 0.05);
    if (fly.length < 10) { console.log("skip round " + i + " flyFrames=" + fly.length); await p.waitForTimeout(2600); continue; }
    frames += fly.length;
    lit += fly.filter((r) => r.opacity > 0 && r.shown === GHOSTS).length;
    for (const r of fly) {
      ballPx.push(r.ballPx);
      ratios.push(r.ringPx / Math.max(1e-6, r.ballPx * 0.5));
    }
    console.log("round " + i + " fly=" + fly.length
      + " ballPx " + Math.min(...fly.map((r) => r.ballPx)).toFixed(1) + ".." + Math.max(...fly.map((r) => r.ballPx)).toFixed(1)
      + " ratio=" + median(fly.map((r) => r.ringPx / Math.max(1e-6, r.ballPx * 0.5))).toFixed(2)
      + " shown=" + median(fly.map((r) => r.shown)));
    await p.waitForTimeout(2600);
  }

  if (!frames) { console.log("INSTRUMENT DEAD: no flight frames"); process.exit(1); }

  // 대조군. 비행이 끝난 정지 상태에서 같은 자를 댄다.
  await p.waitForTimeout(600);
  const idle = await p.evaluate(() => window.__flightVis());

  const minBall = Math.min(...ballPx);
  const ratio = median(ratios);
  const litRate = lit / frames;
  console.log("MIN_BALL " + minBall.toFixed(1) + "px (bar " + BAR_BALL + ")");
  console.log("RING_RATIO " + ratio.toFixed(2) + " (bar " + BAR_RATIO + ")");
  console.log("TRAIL_LIT " + (litRate * 100).toFixed(1) + "% of " + frames + " flight frames (bar 100%)");
  console.log("CONTROL idle ring=" + idle.ringPx.toFixed(2) + " opacity=" + idle.opacity.toFixed(2));
  console.log("ERRORS " + errs.length);

  if (idle.ringPx > 0.01 || idle.opacity > 0) { console.log("INSTRUMENT DEAD: control lit"); process.exit(1); }
  if (minBall < BAR_BALL) fail += 1;
  if (ratio < BAR_RATIO) fail += 1;
  if (litRate < 1) fail += 1;
  if (errs.length) fail += 1;
  console.log(fail ? "FAIL" : "PASS");
} finally {
  if (br) await br.close();
}
process.exit(fail ? 1 : 0);
