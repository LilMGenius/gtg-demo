// 사건마다 몸이 다르게 망가지는지, 킥이 종류마다 다르게 감기는지, 착지에 무게가 있는지 재는 자.
// 자막을 지웠을 때 두 컷이 같은 그림이면 여기서 걸린다.
//
// 셋을 한 자에 두는 이유는 셋이 같은 채취를 쓰기 때문이다. 관절의 월드 좌표를 뽑아 쌍별 L2 거리를
// 재는 절차 하나가 키퍼 사건 열다섯과 킥 종류 넷을 같이 잰다. 착지 눌림만 좌표가 아니라
// 몸통 배율이라, 같은 판에서 프레임마다 그 수를 적어 둔 뒤 사건이 끝난 다음에 센다.
//
// 진행은 벽시계가 아니라 프레임이다. 시계를 1/60로 못 박고(clock.mjs pinClock) 사건을 걸 프레임과
// 세계를 멈출 프레임을 페이지에 한 번에 맡긴다(window.__plan). 잠으로 기다리면 회차마다 다른 프레임이
// 얼고, 60밀리초짜리 착지 눌림은 그 어긋남 하나로 통째로 빠진다.
// 판 안의 회차 편차는 ?vary=0으로 끈다. 편차가 있는지는 repeat 게이트가 재는 축이고,
// 여기서는 종류가 갈리는지만 묻는다.
//
// 표본 범위: 키퍼 사건 열다섯(그중 세이브 열둘이 착지 축의 표본) x 킥 종류 넷, 1280x720, 프레임 폭 1/60.
import { chromium } from "playwright";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { pinClock } from "./clock.mjs";

const ROOT = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const EXE = process.env.LOCALAPPDATA + "/ms-playwright/chromium-1228/chrome-win64/chrome.exe";
const BASE = "http://127.0.0.1:10310/web/index.html?seed=20&vary=0";
const W = 1280;
const H = 720;
const KINDS = ["save", "catch", "carriedIn", "downed", "lost", "openGoalScored", "gloveGone", "spill", "rebound", "reboundMiss", "charge", "beat", "talked", "distracted", "skied"];
/* 세이브 열둘. 키퍼 몸이 공에 반응해 무너지는 사건만 고른다. 남는 셋은 몸이 공을 안 만난 사건이다.
   빈 골대는 공이 그냥 들어갔고, 눈맞음 둘은 시선이 딴 데 있어 그 자세를 gaze 게이트가 따로 소유한다. */
const SAVES = KINDS.filter((k) => k !== "openGoalScored" && k !== "talked" && k !== "distracted");
/* 킥 종류 넷. src/chain.mjs에는 shot.kind가 없고 chip과 strong과 kicker.power만 있다(rg -n "kind" src/chain.mjs).
   그래서 화면이 그 세 값으로 종류를 고르고, 이 표는 종류마다 그 값을 세워 실제 고르는 길을 지나게 한다.
   이름을 직접 넣는 손잡이를 두면 고르는 길은 한 번도 안 지나고 표만 초록이 된다. */
const KICKS = [["inside", 3, false, false], ["instep", 9, false, false],
  ["chip", 5, false, true], ["power", 9, true, false]];

// 종류 간 실루엣 거리의 바. 기존 값이고 낮추지 않는다.
const BAR = 0.35;
/* 킥 예비의 바. 키퍼 사건은 온몸이 갈리지만 킥 예비는 디딤발과 차는 다리와 상체만 갈린다.
   같은 자에서 잰 키퍼 열다섯의 가장 닮은 쌍이 0.520이므로 그 절반을 밑돌지 않는 선으로 0.2를 잡는다. */
const KICK_BAR = 0.2;
// 착지 눌림의 바. 몸통이 이 아래로 눌린 프레임이 사건마다 하나 이상 있어야 착지에 무게가 있다.
const SQUASH_BAR = 0.9;
// 눌린 만큼 옆으로 퍼졌는가. 0.85 x 1.08 x 1.08 = 0.991이라 부피가 1퍼센트 안에서 보존된다.
const WIDE_BAR = 1.05;
// 고정 폭 시계. 60분의 1이면 프레임 수가 곧 세계시간이다.
const STEP = 1 / 60;
// 시작을 누르고 판이 자리를 잡기까지. 90프레임은 1.5초이고 repeat 게이트가 쓰는 값과 같다.
const LEAD_STEPS = 90;
// 방향을 누르고 사건을 걸기까지. 42프레임은 0.700초로 다이빙이 자리를 잡은 자리다.
const DIVE_STEPS = 42;
// 사건을 걸고 채취까지. 31프레임은 0.517초이고, 크리틱이 정지 프레임을 보는 자리다.
const TAIL_STEPS = 31;
/* 킥 예비를 채취하는 프레임. 화면은 t < 0.55 - 0.13 = 0.42초를 예비 구간으로 쓰므로(scene.mjs swing)
   24프레임 0.400초는 그 구간 안이고, 자세 수렴이 1 - 0.9^24 = 0.92라 목표 각도에 거의 도착해 있다. */
const KICK_STEPS = 24;
// 사건 열다섯에 킥 넷. 한 채취가 5초대라 넉넉히 잡는다.
const t = setTimeout(() => { console.log("WATCHDOG"); process.exit(1); }, 600000);
t.unref();

/* 되돌릴 판. HEAD로 걸면 이 게이트를 담은 커밋이 들어오는 순간 대조군이 자기 자신을 자기와 맞대고
   조용히 초록이 된다. 그래서 판을 못 박고, 어느 rev든 살아 있는 파일과 같으면 계측 사망으로 끊는다. */
const WAS_REV = (process.argv.find((a) => a.startsWith("--was=")) || "--was=bed01e8").slice(6);
const WAS = process.argv.some((a) => a === "--was" || a.startsWith("--was="));
const LAYER = ["web/src/render/scene.mjs", "web/src/render/objects/actors.mjs"];

function dist(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) { const d = a[i] - b[i]; s += d * d; }
  return Math.sqrt(s);
}

const rows = [];
const notes = [];
const say = (name, ok, detail) => rows.push([ok, name, detail]);

const routed = new Map();
if (WAS) {
  for (const f of LAYER) {
    const was = execFileSync("git", ["show", WAS_REV + ":" + f], { encoding: "utf8", maxBuffer: 32000000, cwd: ROOT });
    const live = readFileSync(ROOT + f, "utf8");
    if (was.replace(/\r/g, "") === live.replace(/\r/g, "")) {
      console.log("판정 중단. " + f + "이 " + WAS_REV + "와 같아 대조군이 no-op이다. INSTRUMENT DEAD");
      process.exit(2);
    }
    routed.set(f, was);
  }
}

// 판 하나를 여는 자리. 되돌린 판도 여기서만 물려야 사건 채취와 킥 채취가 같은 판을 본다.
async function open(browser) {
  const ctx = await browser.newContext({ viewport: { width: W, height: H } });
  await pinClock(ctx, STEP);
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
  for (const [f, body] of routed) {
    await page.route("**/" + f, (r) => r.fulfill({ status: 200, contentType: "text/javascript; charset=utf-8", body }));
  }
  await page.goto(BASE, { waitUntil: "load" });
  await page.waitForSelector("#go", { timeout: 15000 });
  await page.click("#go", { force: true });
  return { ctx, page, errs };
}

const at = (page, n) => page.waitForFunction((m) => window.__frames() >= m, n, { timeout: 30000 });

/* 멈춤이 진짜인지 먼저 묻는다. 세계시각이 그대로이고 프레임은 늘어야 정지 프레임이다.
   프레임 번호는 멈춘 동안에도 벽시계를 따라 늘어나므로 지문은 세계시각이다. */
async function frozen(page) {
  const t0 = await page.evaluate(() => ({ v: window.__camDbg().vnow, f: window.__frames() }));
  await page.waitForTimeout(200);
  const t1 = await page.evaluate(() => ({ v: window.__camDbg().vnow, f: window.__frames() }));
  return { held: t0.v === t1.v && t1.f > t0.f, v: t1.v, f0: t0.f, f1: t1.f };
}

let b;
const out = {};
const squash = {};
const kicks = {};
const errAll = [];
try {
  b = await chromium.launch({ executablePath: EXE });
  for (const k of KINDS) {
    const { ctx, page, errs } = await open(b);
    const base = await page.evaluate(() => window.__frames());
    await at(page, base + LEAD_STEPS);
    await page.keyboard.press("ArrowLeft");
    /* 몸통 배율은 60밀리초만 산다. 밖에서 폴링하면 그 창을 통째로 지나치므로 페이지 안에서
       프레임마다 적는다. 렌더 루프가 먼저 등록돼 있어 이 콜백은 같은 프레임의 쓰기 다음에 돈다. */
    await page.evaluate(() => {
      window.__w15 = [];
      const tick = () => {
        const s = window.__squashVis ? window.__squashVis() : null;
        window.__w15.push([window.__frames(), window.__tailKind(), s ? s.y : -1, s ? s.x : -1]);
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    const actAt = base + LEAD_STEPS + DIVE_STEPS;
    const stopAt = actAt + TAIL_STEPS;
    await page.evaluate(([a, kk, s]) => window.__plan(a, kk, s), [actAt, k, stopAt]);
    await at(page, stopAt);
    const fz = await frozen(page);
    say("control:the-world-stopped-at-the-planned-frame " + k, fz.held,
      "vnow " + fz.v.toFixed(4) + " held while frames ran " + fz.f0 + "->" + fz.f1);
    out[k] = await page.evaluate(() => window.__poseVis());
    const rec = await page.evaluate(() => window.__w15);
    const mine = rec.filter((r) => r[1] === k && r[0] <= stopAt);
    const under = mine.filter((r) => r[2] >= 0 && r[2] < SQUASH_BAR);
    const lo = mine.length ? mine.reduce((m, r) => (r[2] >= 0 && r[2] < m[2] ? r : m), mine[0]) : null;
    const last = mine.length ? mine[mine.length - 1] : null;
    squash[k] = { n: mine.length, under: under.length, lo, last, hook: mine.some((r) => r[2] >= 0) };
    for (const e of errs) errAll.push(e);
    await ctx.close();
  }

  for (const [name, power, strong, chip] of KICKS) {
    const { ctx, page, errs } = await open(b);
    // 판을 잠근다. 안 잠그면 대기 타이머가 제 슛을 쏘고 그 구가 이 구 위에 얹힌다.
    await page.evaluate(() => window.__lockRound());
    const plan = await page.evaluate(([pw, st, ch, n]) => {
      const f = window.__frames();
      // 사건은 안 걸고 멈출 프레임만 맡긴다. 구는 그 다음에 세워야 두 수가 같은 프레임을 가리킨다.
      window.__plan(0, "", f + n);
      const ok = window.__frameShot ? Boolean(window.__frameShot(0.4, 0.3, false, pw, st, ch)) : false;
      return { f, stop: f + n, ok };
    }, [power, strong, chip, KICK_STEPS]);
    await at(page, plan.stop);
    const fz = await frozen(page);
    say("control:the-world-stopped-at-the-planned-frame kick/" + name, fz.held,
      "vnow " + fz.v.toFixed(4) + " held while frames ran " + fz.f0 + "->" + fz.f1);
    kicks[name] = await page.evaluate(() => (window.__kickVis ? window.__kickVis() : null));
    for (const e of errs) errAll.push(e);
    await ctx.close();
  }
} finally {
  clearTimeout(t);
  if (b) await b.close();
}

// 사건 열다섯의 쌍별 거리. 가장 닮은 쌍이 바를 넘어야 자막 없이도 열다섯이 서로 다른 그림이다.
const pairs = [];
for (let i = 0; i < KINDS.length; i++) {
  for (let j = i + 1; j < KINDS.length; j++) {
    const a = KINDS[i], c = KINDS[j];
    pairs.push([dist(out[a].v, out[c].v), a, c, Math.abs(out[a].rz - out[c].rz)]);
  }
}
pairs.sort((x, y) => x[0] - y[0]);
for (const r of pairs.slice(0, 12)) {
  notes.push("pair " + r[0].toFixed(3) + "  " + r[1] + " vs " + r[2] + "  drz=" + r[3].toFixed(3));
}
say("pose:the-closest-pair-still-splits", pairs[0][0] >= BAR,
  "min " + pairs[0][0].toFixed(3) + " (" + pairs[0][1] + " vs " + pairs[0][2] + ") bar " + BAR);
for (const k of KINDS) notes.push("rz " + k + " " + out[k].rz.toFixed(3));

// 착지 눌림. 세이브 열둘 각각에서 몸통이 눌린 프레임이 하나 이상 있어야 한다.
for (const k of SAVES) {
  const s = squash[k];
  const loY = s.lo ? s.lo[2] : -1;
  const loX = s.lo ? s.lo[3] : -1;
  say("squash:the-landing-presses-the-torso " + k, s.hook && s.under >= 1,
    (s.hook ? s.under + " of " + s.n + " frames under " + SQUASH_BAR + ", lowest y " + loY.toFixed(3)
      + " with x " + loX.toFixed(3) : "window.__squashVis missing on this layer"));
}
// 눌림은 지나가야 한다. 배율이 안 돌아오면 몸집이 바뀐 것이고, 옆으로 안 퍼지면 부피가 준 것이다.
const wide = SAVES.filter((k) => squash[k].lo && squash[k].lo[3] >= WIDE_BAR);
const back = SAVES.filter((k) => squash[k].last && squash[k].last[2] >= 0.99);
say("squash:the-press-keeps-the-volume", wide.length === SAVES.length,
  wide.length + "/" + SAVES.length + " widened to " + WIDE_BAR + " or more at the lowest frame");
say("control:the-press-is-over-before-the-capture", back.length === SAVES.length,
  back.length + "/" + SAVES.length + " back to 1 at frame " + TAIL_STEPS + " after the event");

// 킥 예비. 종류 넷이 서로 다른 몸에서 출발해야 칩과 강슛이 같은 그림에서 시작하지 않는다.
const named = KICKS.filter(([n]) => kicks[n] && kicks[n].kind === n).map(([n]) => n);
say("kick:the-shot-fields-pick-the-kick-kind", named.length === KICKS.length,
  KICKS.map(([n]) => n + "=" + (kicks[n] ? kicks[n].kind : "no-hook")).join(" "));
const kp = [];
for (let i = 0; i < KICKS.length; i++) {
  for (let j = i + 1; j < KICKS.length; j++) {
    const a = KICKS[i][0], c = KICKS[j][0];
    kp.push([kicks[a] && kicks[c] ? dist(kicks[a].v, kicks[c].v) : -1, a, c]);
  }
}
kp.sort((x, y) => x[0] - y[0]);
for (const r of kp) notes.push("windup " + r[0].toFixed(3) + "  " + r[1] + " vs " + r[2]);
say("kick:every-windup-splits-from-every-other", kp[0][0] >= KICK_BAR,
  "min " + kp[0][0].toFixed(3) + " (" + kp[0][1] + " vs " + kp[0][2] + ") bar " + KICK_BAR);
say("console:no-errors", errAll.length === 0, errAll.slice(0, 2).join(" | ") || "clean");

for (const n of notes) console.log("  " + n);
let bad = 0;
for (const [ok, name, detail] of rows) {
  if (!ok) bad += 1;
  console.log("  " + (ok ? "ok   " : "FAIL ") + name + " " + detail);
}
console.log("표본 범위: 키퍼 사건 " + KINDS.length + "(세이브 " + SAVES.length + ") x 킥 종류 " + KICKS.length
  + ", 1280x720, 프레임 폭 " + STEP.toFixed(4) + "초");
if (WAS) {
  // 부모 판 대조군. 킥 예비와 착지 축이 그 판에서 빨개져야 이 자가 무언가를 가른 것이다.
  const red = rows.filter((r) => !r[0] && (r[1].startsWith("kick:") || r[1].startsWith("squash:"))).length;
  console.log(red > 0 ? "pose CONTROL PASS " + red + " kick and squash axes red on " + WAS_REV
    : "pose CONTROL FAIL 0 kick and squash axes red on " + WAS_REV);
  process.exitCode = red > 0 ? 0 : 1;
} else {
  console.log(bad ? "pose FAIL " + bad : "pose PASS " + rows.length);
  process.exitCode = bad ? 1 : 0;
}
