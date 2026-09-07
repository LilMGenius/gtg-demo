// 사건마다 몸이 다르게 망가지는지, 킥이 종류마다 다르게 감기는지, 착지에 무게가 있는지 재는 자.
// 자막을 지웠을 때 두 컷이 같은 그림이면 여기서 걸린다.
//
// 넷을 한 자에 두는 이유는 넷이 같은 채취를 쓰기 때문이다. 관절의 월드 좌표를 프레임마다 뽑아 두면
// 그 한 벌에서 사건 간 실루엣 거리도, 몸이 언제 도착했는지도, 몸이 얼마나 누웠는지도 나온다.
// 눌림만 좌표가 아니라 몸통 배율이고, 그 배율이 도착한 프레임에 걸렸는지가 이 자의 물음이다.
//
// 착지는 화면이 뭐라고 하는지 안 묻는다. 그린 관절만 보고 이 자가 따로 센다.
// 도착은 월드 좌표가 마지막 자세에 얼마나 다가왔는지(convW)로, 누움은 목과 두 무릎의 수평 거리로 잰다.
// 화면이 내놓는 conv와 lie는 같은 뜻의 각도 공간 값이라, 두 길이 따로 서야 맞댈 값이 생긴다.
//
// 진행은 벽시계가 아니라 프레임이다. 시계를 1/60로 못 박고(clock.mjs pinClock) 사건을 걸 프레임과
// 세계를 멈출 프레임을 페이지에 한 번에 맡긴다(window.__plan). 잠으로 기다리면 회차마다 다른 프레임이
// 얼고, 60밀리초짜리 착지 눌림은 그 어긋남 하나로 통째로 빠진다.
// 판 안의 회차 편차는 ?vary=0으로 끈다. 편차가 있는지는 repeat 게이트가 재는 축이다.
//
// 표본 범위: 키퍼 사건 열다섯(그중 세이브 열둘) x 킥 종류 넷, 1280x720, 프레임 폭 1/60, 사건당 70프레임.
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
const SAVES = KINDS.filter((k) => k !== "openGoalScored" && k !== "talked" && k !== "distracted");
/* 킥 종류 넷. src/chain.mjs에는 shot.kind가 없고 chip과 strong과 kicker.power만 있다.
   그래서 화면이 그 셋으로 종류를 고르고, 이 표는 종류마다 그 값을 세워 실제 고르는 길을 지나게 한다. */
const KICKS = [["inside", 3, false, false], ["instep", 9, false, false],
  ["chip", 5, false, true], ["power", 9, true, false]];

// 종류 간 실루엣 거리의 바. 기존 값이고 낮추지 않는다.
const BAR = 0.35;
// 킥 예비의 바. 기존 값이고 낮추지 않는다.
const KICK_BAR = 0.2;
// 착지 눌림의 깊이 바. 몸통이 이 아래로 눌린 프레임이 착지마다 하나 이상 있어야 한다.
const SQUASH_BAR = 0.9;
// 눌린 만큼 옆으로 퍼졌는가. 0.85 x 1.08 x 1.08 = 0.991이라 부피가 1퍼센트 안에서 보존된다.
const WIDE_BAR = 1.05;
/* 눌림이 착지에 맞았다고 볼 프레임 차이. 화면은 미래를 못 보므로 지난 프레임의 속도로 판단하고,
   그래서 구조적으로 한 프레임 늦는다. 실측 편차는 착지 다섯 사건에서 0, 1, 1, 1, 1프레임이라
   그 위에 한 프레임만 얹는다. 셋으로 두면 예비 경계에 걸던 옛 판이 빠른 사건에서 통과한다
   (실측 --was=ad86e19에서 열 줄이 -3으로 초록이었다). */
const PHASE_BAR = 2;
// 눌림이 살아 있는 세계시간. 계획서가 적은 60밀리초이고 한 프레임(16.7밀리초)까지 어긋나도 된다.
const DUR_MS = 60;
const DUR_TOL = 1000 / 60;
const STEP = 1 / 60;
const LEAD_STEPS = 90;
const DIVE_STEPS = 42;
// 사건을 걸고 실루엣을 채취하기까지. 31프레임은 0.517초이고 크리틱이 정지 프레임을 보는 자리다.
const TAIL_STEPS = 31;
/* 사건을 걸고 세계를 멈추기까지. 착지는 실측으로 사건 뒤 7에서 21프레임에 오고, 도착을 재려면
   그 뒤로 몸이 가라앉은 자세가 필요하다. 70프레임은 1.17초로 잔여 진동이 처음의 22퍼센트로 줄어든 뒤다. */
const WINDOW = 70;
/* 킥 예비를 채취하는 프레임. 화면은 t < 0.55 - 0.13 = 0.42초를 예비 구간으로 쓰므로
   24프레임 0.400초는 그 구간 안이고, 자세 수렴이 1 - 0.9^24 = 0.92라 목표 각도에 거의 도착해 있다. */
const KICK_STEPS = 24;
const t = setTimeout(() => { console.log("WATCHDOG"); process.exit(1); }, 900000);
t.unref();

/* 되돌릴 판. HEAD로 걸면 이 게이트를 담은 커밋이 들어오는 순간 대조군이 자기 자신을 자기와 맞대고
   조용히 초록이 된다. 그래서 판을 못 박고, 어느 rev든 살아 있는 파일과 같으면 계측 사망으로 끊는다.
   --was=ad86e19는 손잡이는 다 있고 눌림만 예비 경계에 걸리던 판이라, 없는 기능이 아니라
   틀린 기능을 상대로 이 자가 빨개지는지를 본다. */
const WAS_REV = (process.argv.find((a) => a.startsWith("--was=")) || "--was=bed01e8").slice(6);
const WAS = process.argv.some((a) => a === "--was" || a.startsWith("--was="));
const LAYER = ["web/src/render/scene.mjs", "web/src/render/objects/actors.mjs"];

function dist(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) { const d = a[i] - b[i]; s += d * d; }
  return Math.sqrt(s);
}
/* 누움. 목이 두 무릎에서 수평으로 얼마나 벗어났는가. 서 있으면 0에 가깝고 누우면 몸길이만큼이다.
   화면이 그늘에 쓰는 수와 같은 뜻이고, 여기서는 척추 길이로 나눈 무차원 좌표에서 잰다. */
function lieOf(v) {
  const nx = v[3], nz = v[5];
  const kx = (v[21] + v[27]) / 2, kz = (v[23] + v[29]) / 2;
  return Math.hypot(nx - kx, nz - kz);
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

/* 박자 표의 규칙을 소스에서 되짚는다. 표가 스스로 적어 둔 순서는 대기 자세에서 떨어진 관절 각
   거리이고, 그 거리는 POSES에서 다시 계산할 수 있다. 표만 고치고 규칙을 안 고치면 여기서 걸린다.
   되돌린 판을 볼 때는 그 판의 소스를 읽는다. 살아 있는 파일을 읽으면 대조군이 이 축만 초록이 된다. */
function beatOrder() {
  const rel = "web/src/render/objects/actors.mjs";
  const src = routed.get(rel) || readFileSync(ROOT + rel, "utf8");
  const J = ["spine", "neck", "shL", "elL", "shR", "elR", "hipL", "knL", "hipR", "knR"];
  const cut = src.indexOf("// 좌우를 뒤집는다");
  const body = src.slice(src.indexOf("export const POSES = {"), cut > 0 ? cut : undefined);
  const P = {};
  const re = /(\w+):\s*\{([^}]*?)\n\s*\}/g;
  let m;
  while ((m = re.exec(body))) {
    const o = {};
    const jre = /(\w+):\s*\[([^\]]+)\]/g;
    let j;
    while ((j = jre.exec(m[2]))) o[j[1]] = j[2].split(",").map(Number);
    if (J.every((k) => o[k])) P[m[1]] = o;
  }
  const beatSrc = src.slice(src.indexOf("export const POSE_BEAT = {"));
  const B = [];
  const bre = /(\w+):\s*\{\s*ant:\s*([0-9.]+),\s*per:\s*([0-9.]+)\s*\}/g;
  while ((m = bre.exec(beatSrc.slice(0, beatSrc.indexOf("};") + 2)))) B.push([m[1], Number(m[2]), Number(m[3])]);
  if (!P.ready || B.length === 0) return null;
  const d = (a, b) => {
    let s = 0;
    for (const k of J) for (let i = 0; i < 3; i += 1) { const x = a[k][i] - b[k][i]; s += x * x; }
    return Math.sqrt(s);
  };
  return B.map(([n, ant, per]) => ({ n, ant, per, d: P[n] ? d(P[n], P.ready) : -1 }));
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

const at = (page, n) => page.waitForFunction((m) => window.__frames() >= m, n, { timeout: 40000 });

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
const land = {};
const kicks = {};
const errAll = [];
try {
  b = await chromium.launch({ executablePath: EXE });
  for (const k of KINDS) {
    const { ctx, page, errs } = await open(b);
    const base = await page.evaluate(() => window.__frames());
    await at(page, base + LEAD_STEPS);
    await page.keyboard.press("ArrowLeft");
    /* 프레임마다 적는다. 몸통 배율은 60밀리초만 살고 도착은 사건마다 다른 프레임에 오므로,
       밖에서 폴링하면 둘 다 놓친다. 렌더 루프가 먼저 등록돼 있어 이 콜백은 같은 프레임의 쓰기 다음에 돈다. */
    await page.evaluate(() => {
      window.__w15 = [];
      const tick = () => {
        const s = window.__squashVis ? window.__squashVis() : null;
        const p = window.__poseVis();
        // 머리 월드 높이. 어느 판에도 있는 손잡이라, 되돌린 판에서도 이 자가 착지를 직접 셀 수 있다.
        window.__w15.push([window.__frames(), window.__tailKind(), s ? s.y : -1, s ? s.x : -1,
          s ? s.z : -1, window.__camDbg().vnow, p.v, p.rz, window.__headAt().y]);
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    const actAt = base + LEAD_STEPS + DIVE_STEPS;
    const stopAt = actAt + WINDOW;
    await page.evaluate(([a, kk, s]) => window.__plan(a, kk, s), [actAt, k, stopAt]);
    await at(page, stopAt);
    const fz = await frozen(page);
    say("control:the-world-stopped-at-the-planned-frame " + k, fz.held,
      "vnow " + fz.v.toFixed(4) + " held while frames ran " + fz.f0 + "->" + fz.f1);
    const rec = await page.evaluate(() => window.__w15);
    const mine = rec.filter((r) => r[0] >= actAt && r[0] <= stopAt);
    // 실루엣 거리는 예전과 같은 프레임에서 뽑는다. 세계가 그 프레임에 멈춰 있지 않을 뿐이다.
    const shot = mine.find((r) => r[0] >= actAt + TAIL_STEPS) || mine[mine.length - 1];
    out[k] = { v: shot[6], rz: shot[7] };
    /* 착지. 떨어지던 몸이 멈춘 프레임이다. 머리 월드 높이의 하강 속도를 세계시간으로 미분해서
       가장 빠른 프레임을 찾고, 그 뒤로 속도가 그 최고값의 10퍼센트 아래로 처음 꺾이는 자리를 쓴다.
       바닥에 닿는 것은 내려감이 끊기는 것이고, 그 뒤의 느린 가라앉음과 잔여 진동은 이미 닿은
       몸이 하는 일이다. 화면은 절대 속도 문턱으로 고르고 이 자는 최고값 대비 비율로 고른다.
       두 길이 따로 서야 맞댄 프레임 차이에 뜻이 생긴다. */
    const vEnd = mine[mine.length - 1][6];
    const head = mine.map((r) => r[8]);
    const spd = [0];
    for (let i = 1; i < mine.length; i += 1) {
      const dt = mine[i][5] - mine[i - 1][5];
      spd.push(dt > 0 ? (head[i - 1] - head[i]) / dt : 0);
    }
    const peak = Math.max(...spd);
    const fall = Math.max(...head) - Math.min(...head);
    let arrive = -1;
    for (let i = spd.indexOf(peak); i < spd.length; i += 1) if (spd[i] <= peak * 0.10) { arrive = i; break; }
    const press = mine.findIndex((r) => r[2] >= 0 && r[2] < 1);
    let back = -1;
    if (press >= 0) for (let i = press; i < mine.length; i += 1) if (mine[i][2] >= 1) { back = i; break; }
    const under = mine.filter((r) => r[2] >= 0 && r[2] < SQUASH_BAR);
    const deep = mine.reduce((m, r) => (r[2] >= 0 && r[2] < m[2] ? r : m), mine[0]);
    land[k] = {
      hook: mine.some((r) => r[2] >= 0),
      fall,
      // 누움은 착지 프레임에서 잰다. 창 끝에서 재면 이미 다음 연출로 넘어간 몸을 재게 된다.
      lie: lieOf(mine[arrive > 0 ? arrive : mine.length - 1][6]),
      arrive, press, delta: press >= 0 && arrive > 0 ? press - arrive : null,
      under: under.length,
      dur: press >= 0 && back > 0 ? (mine[back][5] - mine[press][5]) * 1000 : -1,
      deepY: deep[2], deepX: deep[3], deepZ: deep[4]
    };
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
for (const r of pairs.slice(0, 12)) notes.push("pair " + r[0].toFixed(3) + "  " + r[1] + " vs " + r[2] + "  drz=" + r[3].toFixed(3));
say("pose:the-closest-pair-still-splits", pairs[0][0] >= BAR,
  "min " + pairs[0][0].toFixed(3) + " (" + pairs[0][1] + " vs " + pairs[0][2] + ") bar " + BAR);

// 착지. 어느 사건이 눌렸고 그 사건들이 정말 누운 몸인가.
const hooked = KINDS.filter((k) => land[k].hook);
const pressed = KINDS.filter((k) => land[k].press >= 0);
const stood = KINDS.filter((k) => land[k].hook && land[k].press < 0);
for (const k of KINDS) {
  const L = land[k];
  notes.push("land " + k.padEnd(15) + " lie " + L.lie.toFixed(3) + " fall " + L.fall.toFixed(3)
    + " arrive " + (L.arrive > 0 ? L.arrive : -1)
    + " press " + L.press + " delta " + (L.delta === null ? "-" : L.delta)
    + " under " + L.under + " dur " + (L.dur >= 0 ? L.dur.toFixed(1) + "ms" : "-")
    + " y " + (L.deepY >= 0 ? L.deepY.toFixed(3) : "-"));
}
const loPress = pressed.length ? Math.min(...pressed.map((k) => land[k].lie)) : -1;
const hiStand = stood.length ? Math.max(...stood.map((k) => land[k].lie)) : -1;
say("squash:only-the-body-that-lies-down-gets-pressed",
  hooked.length === KINDS.length && pressed.length >= 1 && stood.length >= 1 && loPress > hiStand,
  hooked.length < KINDS.length ? "window.__squashVis missing on this layer"
    : pressed.length + " pressed (lowest lie " + loPress.toFixed(3) + "), " + stood.length
    + " stood (highest lie " + hiStand.toFixed(3) + "), gap " + (loPress - hiStand).toFixed(3)
    + "; pressed " + pressed.join(" "));
const deepest = hooked.length ? hooked.reduce((m, k) => (land[k].lie > land[m].lie ? k : m), hooked[0]) : null;
say("squash:the-deepest-fall-is-one-of-them", Boolean(deepest) && land[deepest].press >= 0,
  deepest ? "deepest lie is " + deepest + " at " + land[deepest].lie.toFixed(3)
    + " and it " + (land[deepest].press >= 0 ? "presses" : "does not press") : "no hook");
for (const k of pressed) {
  const L = land[k];
  say("squash:the-press-lands-with-the-body " + k, L.delta !== null && Math.abs(L.delta) <= PHASE_BAR,
    "press at frame " + L.press + ", body arrived at " + L.arrive + ", delta "
    + (L.delta === null ? "no arrival" : L.delta) + " frames against " + PHASE_BAR);
}
const durBad = pressed.filter((k) => Math.abs(land[k].dur - DUR_MS) > DUR_TOL);
say("squash:the-press-lasts-sixty-milliseconds", pressed.length >= 1 && durBad.length === 0,
  pressed.length ? (pressed.length - durBad.length) + "/" + pressed.length + " within " + DUR_MS + "+-"
    + DUR_TOL.toFixed(1) + "ms, min " + Math.min(...pressed.map((k) => land[k].dur)).toFixed(1)
    + " max " + Math.max(...pressed.map((k) => land[k].dur)).toFixed(1)
    + "ms, under " + SQUASH_BAR + " for " + pressed.map((k) => land[k].under).join("/") + " frames"
    : "nothing pressed");
const volBad = pressed.filter((k) => land[k].deepX < WIDE_BAR || land[k].deepZ < WIDE_BAR
  || Math.abs(land[k].deepX - land[k].deepZ) > 0.001);
say("squash:the-press-keeps-the-volume-on-x-and-z", pressed.length >= 1 && volBad.length === 0,
  pressed.length ? (pressed.length - volBad.length) + "/" + pressed.length + " widened both axes past "
    + WIDE_BAR + ", deepest y " + Math.min(...pressed.map((k) => land[k].deepY)).toFixed(3)
    + " with x " + land[pressed[0]].deepX.toFixed(3) + " z " + land[pressed[0]].deepZ.toFixed(3)
    : "nothing pressed");
const deepBad = pressed.filter((k) => land[k].under < 1);
say("squash:the-landing-presses-the-torso", pressed.length >= 1 && deepBad.length === 0,
  pressed.length ? (pressed.length - deepBad.length) + "/" + pressed.length
    + " reach under " + SQUASH_BAR : "nothing pressed");

// 박자 표. 표가 스스로 적어 둔 순서가 소스에서 다시 나오는가.
const beats = beatOrder();
if (!beats) say("beat:the-period-rises-with-the-distance-from-ready", false, "POSE_BEAT not on this layer");
else {
  const sorted = beats.slice().sort((a, c) => a.d - c.d);
  const bad = [];
  for (let i = 1; i < sorted.length; i += 1) {
    if (sorted[i].per < sorted[i - 1].per) bad.push(sorted[i - 1].n + ">" + sorted[i].n + " per");
    if (sorted[i].ant < sorted[i - 1].ant) bad.push(sorted[i - 1].n + ">" + sorted[i].n + " ant");
  }
  notes.push("beat " + sorted.map((r) => r.n + " " + r.d.toFixed(2) + "/" + r.per.toFixed(2)).join("  "));
  say("beat:the-period-rises-with-the-distance-from-ready", bad.length === 0 && sorted.length === 12,
    sorted.length + " rows from " + sorted[0].n + " " + sorted[0].d.toFixed(2) + " to "
    + sorted[sorted.length - 1].n + " " + sorted[sorted.length - 1].d.toFixed(2)
    + (bad.length ? ", out of order: " + bad.join(" ") : ", ant and per both rise with it"));
}

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
  + ", 1280x720, 프레임 폭 " + STEP.toFixed(4) + "초, 사건당 " + WINDOW + "프레임");
if (WAS) {
  // 부모 판 대조군. 킥과 착지와 박자 축이 그 판에서 빨개져야 이 자가 무언가를 가른 것이다.
  const red = rows.filter((r) => !r[0] && (r[1].startsWith("kick:") || r[1].startsWith("squash:") || r[1].startsWith("beat:"))).length;
  console.log(red > 0 ? "pose CONTROL PASS " + red + " kick, squash and beat axes red on " + WAS_REV
    : "pose CONTROL FAIL 0 kick, squash and beat axes red on " + WAS_REV);
  process.exitCode = red > 0 ? 0 : 1;
} else {
  console.log(bad ? "pose FAIL " + bad : "pose PASS " + rows.length);
  process.exitCode = bad ? 1 : 0;
}
