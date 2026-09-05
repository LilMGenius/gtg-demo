import { chromium } from "playwright";
import { pinClock } from "./clock.mjs";
import { GAZE_ACTS, gazeMood, lineKey, POOLS } from "../web/src/ui/lines.mjs";

// 눈맞음 두 사건이 아홉 갈래로 갈리는지 재는 자.
// 한 사건이 늘 같은 그림이면 두 번째부터 정보가 없다. 갈래마다 자막과 자세와
// 머리 위 하트가 같이 갈려야 하고, 셋 중 하나만 갈리면 나머지가 그 갈래를 배신한다.
//
// 실시간으로 사건을 걸면 채취 시점이 프레임마다 흔들려, 아무것도 안 바꾼 두 장이
// 0.309까지 벌어졌다. 갈래 간 최소 거리 0.384의 80%다. 그 자로는 갈래를 못 잰다.
// 고정 폭 시계에 프레임 번호로 걸고 멈춰서, 대조군이 0에 붙은 자로 바꾼다.
//
// 표본 범위: distracted를 아홉 갈래로 각각 한 번씩 세운다. 갈래는 화면 쪽 값이라
//            회차 편차의 대상이 아니고, 대조군이 0이면 한 번이 그 갈래의 전부다.
//            자막 풀은 브라우저 없이 distracted/talked 두 사건 열여덟 키를 전부 본다.
const EXE = process.env.LOCALAPPDATA + "/ms-playwright/chromium-1228/chrome-win64/chrome.exe";
// vary=0은 회차 편차를 가운데로 굳힌다. 켜 두면 같은 갈래를 두 번 세운 대조군이
// 0.138까지 벌어져, 갈래 간 최소 거리 0.370의 37%가 잡음이 된다.
const BASE = "http://127.0.0.1:10310/web/index.html?seed=20&vary=0";
const STEP = 1 / 60, LEAD = 90, DIVE = 42, TAIL = 31;
// 0.35는 pose 게이트가 열다섯 사건에 쓰는 바와 같다. 같은 자로 재야 두 표가 비교된다.
const BAR = 0.35;
const ACTS = GAZE_ACTS.map((a) => a.id);
const LINE = String.fromCharCode(10);
const t = setTimeout(() => { console.log("WATCHDOG"); process.exit(1); }, 600000);
t.unref();

const fails = [], notes = [];
const check = (n, ok, d) => (ok ? notes : fails).push(n + " " + d);

function dist(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) { const d = a[i] - b[i]; s += d * d; }
  return Math.sqrt(s);
}

// 자막은 판정 쪽 모듈에 그대로 있다. 화면을 띄우기 전에 먼저 센다.
for (const kind of ["distracted", "talked"]) {
  for (const act of ACTS) {
    const key = lineKey({ t: kind, act }, null);
    const pool = POOLS[key];
    check("line:" + key, Boolean(pool) && pool.length >= 2, pool ? pool.length + " lines" : "missing");
  }
}

let b;
try {
  b = await chromium.launch({ executablePath: EXE });
  const errs = [];

  async function stand(act) {
    /* 회차마다 새 컨텍스트를 연다. 한 컨텍스트를 나눠 쓰면 저장 자리도 나눠 쓴다. 첫 회차가
       손님 계정을 세우고 첫 판을 저장하면 다음 회차는 그 저장을 읽어 개봉 화면 없이 서고,
       그 갈래에서는 판정 rng의 소비가 달라 같은 시드가 다른 구를 낸다. 실측으로 대조군의
       두 회차가 advance 0.92와 0으로 갈렸고, 그 차이가 자세 거리 0.026으로 들어와 문턱 0.02를
       넘었다. 시계가 아니라 저장이 원인이었다. headroom이 같은 함정을 먼저 적어 두었다. */
    const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } });
    await pinClock(ctx, STEP);
    const p = await ctx.newPage();
    p.on("pageerror", (e) => errs.push(String(e)));
    p.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
    await p.goto(BASE, { waitUntil: "load" });
    await p.waitForSelector("#go", { timeout: 15000 });
    await p.click("#go", { force: true });
    const base = await p.evaluate(() => window.__frames());
    await p.waitForFunction((m) => window.__frames() >= m, base + LEAD, { timeout: 20000 });
    // 다이빙 입력은 실시간 프레임에 떨어져 그 프레임이 회차마다 다르다. 눈맞음 키퍼는
    // 제자리에 서서 고개만 돌리므로 다이빙이 자세에 실을 것이 없고, 빼면 채취가 전부 예약된다.
    const actAt = base + LEAD + DIVE;
    await p.evaluate(([a, k, s, f]) => window.__plan(a, k, s, f), [actAt, "distracted", actAt + TAIL, act]);
    await p.waitForFunction((m) => window.__frames() >= m, actAt + TAIL, { timeout: 20000 });
    const got = { pose: await p.evaluate(() => window.__poseVis()), gaze: await p.evaluate(() => window.__gazeVis()) };
    await ctx.close();
    return got;
  }

  const out = {};
  for (const a of ACTS) out[a] = await stand(a);
  // 대조군. 같은 갈래를 다시 세우면 같은 그림이어야 한다.
  // 여기가 0에서 멀면 아래 갈래 간 거리도 갈래가 아니라 잡음을 잰 것이다.
  const control = await stand("stare");
  const ctrl = dist(out.stare.pose.v, control.pose.v);
  check("control:the-same-branch-twice-is-one-picture", ctrl < 0.02, ctrl.toFixed(4));

  for (const a of ACTS) {
    const g = out[a].gaze;
    const want = gazeMood(a);
    const hearts = want === "heart" ? 3 : 0;
    check("act:" + a, g.act === a, String(g.act));
    check("mood:" + a, g.mood === want, g.mood + " want " + want);
    check("hearts:" + a, g.hearts === hearts, g.hearts + " want " + hearts);
  }

  const rows = [];
  for (let i = 0; i < ACTS.length; i++) {
    for (let j = i + 1; j < ACTS.length; j++) {
      rows.push([dist(out[ACTS[i]].pose.v, out[ACTS[j]].pose.v), ACTS[i], ACTS[j]]);
    }
  }
  rows.sort((x, y) => x[0] - y[0]);
  for (const r of rows.slice(0, 6)) console.log("  " + r[0].toFixed(3) + "  " + r[1] + " vs " + r[2]);
  check("pose:the-closest-pair-still-splits", rows[0][0] >= BAR, rows[0][0].toFixed(3) + " bar " + BAR);
  check("console:no-errors", errs.length === 0, errs.slice(0, 2).join(" | ") || "clean");

  if (notes.length) console.log(notes.map((x) => "  ok   " + x).join(LINE));
  if (fails.length) console.log(fails.map((x) => "  FAIL " + x).join(LINE));
  console.log(fails.length ? "gaze FAIL " + fails.length : "gaze PASS " + notes.length);
  if (fails.length) process.exitCode = 1;
} finally {
  clearTimeout(t);
  if (b) await b.close();
}
