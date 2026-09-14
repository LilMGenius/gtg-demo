import { chromium } from "playwright";
import { pinClock } from "./clock.mjs";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const controlRef = process.argv.find((x) => x.startsWith("--control="))?.slice(10);

// 공 크기의 자. 크기는 두 가지가 곱해진 것이다. 거리에서 오는 배율과 발에 맞은 순간의 짜부라짐.
// 앞엣것은 이어져야 하고 뒤엣것은 튀어야 한다. 한 수로 재면 그 둘이 구분되지 않는다.
//
// 재는 것은 셋이다. 배율이 프레임 사이에서 안 튀는가, 다가오는 공의 화면 반지름이 커지는가,
// 짜부라짐은 여전히 한 프레임에 터지는가. 표본은 브라우저 안에서 프레임마다 모은다.
// 밖에서 폴링하면 프레임을 건너뛰고, 건너뛴 자리가 곧 튐이 숨는 자리다.
// 표본 범위: 판정을 안 부른다. 화면 크기만 재므로 키퍼 표본이 결론을 안 바꾼다.
// 표본 창을 벽시계로 끊으면 그 안에 든 프레임 수를 그날의 기계 부하가 정한다. 거리 배율은
// 프레임마다 걷는 값이라, 한 장이 빠진 자리에서는 이웃한 두 표본 사이에 세계가 두 걸음 간다.
// 실측(6c3fdb4 sweep): 프레임이 빠진 자리의 걸음이 0.082, 같은 판을 혼자 돌리면 0.036, 바는 0.08이다.
// 바를 넘은 것은 자가 무언가를 잰 것이 아니라 기계가 바빴던 것이고,
// 조용한 기계에서 두 번 초록인 것도 그래서 안정의 증거가 아니다.
// 그래서 세계시계를 1/60로 못 박고(clock.mjs pinClock) 창을 프레임 수로 끊는다.
// 걸음 폭이 고정되므로 0.08은 떨어진 프레임이 아니라 정해진 한 걸음에 대고 재는 바가 된다.
const EXE = process.env.LOCALAPPDATA + "/ms-playwright/chromium-1228/chrome-win64/chrome.exe";
const BASE = "http://127.0.0.1:10310/web/index.html?seed=20";
const LINE = String.fromCharCode(10);
const STEP = 1 / 60;
// Reuse flight-gate's source-derived floor, including for the served-parent control.
const source = readFileSync(new URL("../web/src/render/scene.mjs", import.meta.url), "utf8");
const constant = (name) => {
  const matches = [...source.matchAll(new RegExp("^const " + name + " = ([0-9.]+);$", "gm"))];
  if (matches.length !== 1 || !(Number(matches[0][1]) > 0)) throw new Error("Expected one positive " + name);
  return Number(matches[0][1]);
};
const BALL_REAL_D = constant("BALL_REAL_D");
const BALL_NEAR_X = constant("BALL_NEAR_X");
const BALL_MIN_H = constant("BALL_MIN_H");
const units = readFileSync(new URL("../web/src/render/units.mjs", import.meta.url), "utf8");
const radius = [...units.matchAll(/export const BALL_R = ([0-9.]+);/g)];
if (radius.length !== 1) throw new Error("Expected one BALL_R");
const BALL_R = Number(radius[0][1]);
// 창의 폭. 60프레임 시계에서 4.2초에 해당한다. 한 구가 통째로 들어와야 아래 두 계기 축이 선다.
const FRAMES = 252;
// 프레임으로 세는 자는 바쁜 기계에서 벽시계가 늘어난다. 여기서 죽으면 그 늘어남이 다시 판정에 섞인다.
const t = setTimeout(() => { console.log("WATCHDOG"); process.exit(1); }, 300000);
t.unref();

const fails = [], notes = [];
const check = (n, ok, d) => (ok ? notes : fails).push(n + " " + d);

let b;
try {
  b = await chromium.launch({ executablePath: EXE });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } });
  // 세계시계를 프레임에 못 박는다. 페이지가 열리기 전에 걸어야 손잡이가 생기는 그 틱에 켜진다.
  await pinClock(ctx, STEP);
  const p = await ctx.newPage();
  let served = 0;
  if (controlRef) {
    const body = execFileSync("git", ["show", controlRef + ":web/src/render/scene.mjs"], { encoding: "utf8" });
    await p.route("**/web/src/render/scene.mjs", (route) => {
      served += 1;
      return route.fulfill({ contentType: "text/javascript", body });
    });
  }
  const errs = [];
  p.on("pageerror", (e) => errs.push(String(e)));
  p.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
  await p.goto(BASE, { waitUntil: "load" });
  await p.evaluate(() => localStorage.clear());
  await p.goto(BASE, { waitUntil: "load" });
  await p.waitForSelector("#go", { timeout: 15000 });
  await p.click("#go", { force: true });
  await p.evaluate(() => {
    window.__rec = [];
    const tick = () => {
      const size = window.__ballSize();
      const flight = window.__flightVis();
      window.__rec.push({ ...size, screenRadius: flight.ballPx / 2, angularPx: flight.px,
        fov: window.__camDbg().fov, height: document.querySelector("#stage").clientHeight, approach: flight.cue });
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  // 창을 프레임으로 끊는다. 여기가 벽시계로 남으면 위의 못 박기가 아무것도 안 한다.
  await p.waitForFunction((n) => window.__rec.length >= n, FRAMES, { timeout: 240000, polling: "raf" });
  const rec = await p.evaluate(() => window.__rec);
  if (process.env.BALLSIZE_RECORD) writeFileSync(process.env.BALLSIZE_RECORD, JSON.stringify(rec, null, 2));

  const moved = Math.max.apply(null, rec.map((r) => r.z)) - Math.min.apply(null, rec.map((r) => r.z));
  check("instrument:the-recorder-saw-a-whole-shot", rec.length > 90 && moved > 3,
    rec.length + " frames, the ball crossed " + moved.toFixed(1) + "m");
  // 짜부라짐이 한 번도 안 걸린 표본은 발에 맞는 순간을 지나지 않은 것이다. 그러면 아래 축이 아무것도 안 잰다.
  const squash = Math.max.apply(null, rec.map((r) => r.x / Math.max(0.001, r.y)));
  check("instrument:the-window-covered-the-strike", squash > 1.15,
    "widest squash " + squash.toFixed(2));

  // 되돌아가는 프레임은 순간이동이다. 공이 골대에서 발밑으로 돌아갈 때 거리는 당연히 튄다.
  let worst = 0, at = -1;
  for (let i = 1; i < rec.length; i += 1) {
    if (Math.abs(rec[i].z - rec[i - 1].z) > 1) continue;
    const d = Math.abs(rec[i].gain - rec[i - 1].gain);
    if (d > worst) { worst = d; at = i; }
  }
  check("ballsize:the-distance-gain-never-jumps-between-frames", worst <= 0.08,
    "worst step " + worst.toFixed(3) + " at frame " + at + " (z " + (at > 0 ? rec[at].z.toFixed(1) : "-") + ")");
  // __flightVis의 screenR은 현재 카메라로 공 반지름을 투영한다. 짜부라짐은 아래에서 따로 잰다.
  const round = (r) => Math.abs(r.x / r.y - 1) < 0.001;
  const approach = rec.filter((r) => r.approach && r.z >= 0 && round(r));
  const far = approach.reduce((a, r) => r.z > a.z ? r : a, approach[0]);
  const near = approach.reduce((a, r) => r.z < a.z ? r : a, approach[0]);
  let steps = 0, decreases = 0, worstDrop = 0;
  for (let i = 1; i < rec.length; i += 1) {
    const a = rec[i - 1], r = rec[i];
    if (!a.approach || !r.approach || r.z < 0 || r.z >= a.z || Math.abs(r.z - a.z) > 1 || !round(a) || !round(r)) continue;
    steps += 1;
    const drop = a.screenRadius - r.screenRadius;
    if (drop > 1e-6) decreases += 1;
    worstDrop = Math.max(worstDrop, drop);
  }
  const ratio = near && far ? near.screenRadius / far.screenRadius : 0;
  const perspective = steps > 10 && decreases === 0 && ratio >= 1.5;
  const detail = steps + " approach steps, decreases " + decreases + ", worst drop " + worstDrop.toFixed(6)
    + "px, far/near radius " + (far?.screenRadius || 0).toFixed(3) + "/" + (near?.screenRadius || 0).toFixed(3)
    + "px, near/far ratio " + ratio.toFixed(3) + " (bar >=1.5)";
  check("ballsize:the-screen-radius-grows-as-the-ball-approaches", perspective, detail);
  // flight.px records the unscaled angular diameter at the live camera distance and FOV.
  const distance = near ? BALL_R * near.height / (near.angularPx * Math.tan(near.fov * Math.PI / 360)) : NaN;
  const realDiameter = BALL_REAL_D * near?.height / (2 * distance * Math.tan(near?.fov * Math.PI / 360));
  const multiple = 2 * near?.screenRadius / realDiameter;
  const nearOK = Number.isFinite(multiple) && multiple > 0 && multiple <= BALL_NEAR_X + 0.05;
  const nearAxis = "ballsize:the-near-ball-reads-as-at-most-BALL_NEAR_X-real-balls";
  const nearDetail = "diameter=" + (2 * near?.screenRadius).toFixed(3) + "px real=" + realDiameter.toFixed(3)
    + "px distance=" + distance.toFixed(3) + "m multiple=" + multiple.toFixed(4) + " bar<=" + (BALL_NEAR_X + 0.05);
  if (controlRef) {
    console.log("  parent " + controlRef + " " + nearAxis + " " + (nearOK ? "GREEN" : "RED") + " " + nearDetail);
    check("control:the-oversized-parent-reddens-the-near-axis", served > 0 && Number.isFinite(multiple) && multiple > 0 && !nearOK,
      nearDetail + " served=" + served);
  } else check(nearAxis, nearOK, nearDetail);
  const rest = rec.find((r) => r.z === 11 && round(r));
  const restDiameter = 2 * rest?.screenRadius;
  const floor = Math.floor(BALL_MIN_H * (rest?.height || 720)) - 1;
  check("ballsize:the-far-ball-keeps-the-readability-floor", restDiameter >= floor,
    "rest=" + restDiameter.toFixed(3) + "px bar>=" + floor);
  // 대조군. 이어져야 할 것과 튀어야 할 것이 같은 자에 안 걸린다는 증거다.
  let squashStep = 0;
  for (let i = 1; i < rec.length; i += 1) {
    if (Math.abs(rec[i].z - rec[i - 1].z) > 1) continue;
    squashStep = Math.max(squashStep, Math.abs(rec[i].x / Math.max(0.001, rec[i].y) - rec[i - 1].x / Math.max(0.001, rec[i - 1].y)));
  }
  check("control:the-impact-still-jumps-in-one-frame", squashStep > 0.2,
    "widest squash step " + squashStep.toFixed(2) + " against a gain step of " + worst.toFixed(3));

  check("console:no-errors", errs.length === 0, errs.slice(0, 2).join(" | ") || "clean");
  await ctx.close();

  if (notes.length) console.log(notes.map((x) => "  ok   " + x).join(LINE));
  if (fails.length) console.log(fails.map((x) => "  FAIL " + x).join(LINE));
  console.log(fails.length ? "ballsize FAIL " + fails.length : "ballsize PASS " + notes.length);
  if (fails.length) process.exitCode = 1;
} finally {
  clearTimeout(t);
  if (b) await b.close();
}
