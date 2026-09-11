import { chromium } from "playwright";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { pinClock } from "./clock.mjs";

// 막은 뒤 골문 한가운데로 돌아오는 몸을 재는 자. 좌표만 보면 미끄러진 것과 걸어온 것이 같은 곡선이라,
// 위치와 관절을 한 궤적에서 같이 읽는다. 다리가 교대로 오르내리지 않으면 그 이동은 걸음이 아니다.
//
// 진행은 벽시계가 아니라 프레임이다. 시계를 1/60로 못 박고(clock.mjs pinClock) 사건을 건 프레임을
// 닻으로 삼으면 표본 k번째의 세계시각이 회차와 무관하게 k/60이 된다. 잠으로 채취하면 그 사이에 몇
// 프레임이 지났는지를 그날의 부하가 정해, 안 바꾼 코드가 다른 궤적을 낸다. 판 안의 편차는 ?vary=0으로,
// 대기 흔들림의 위상은 __swayPin(0)으로 같이 못 박는다.
//
// 대조군은 셋이다. 걷기 계수를 0으로 둔 정지 폴백(?walk=0)에서 키퍼가 막은 자리에 남는가, 멈춘
// 프레임 두 장이 같은 세계를 내는가, --was로 부모 판을 라우팅하면 걷기 축이 빨개지는가.
// 마지막은 --was=<rev>로 켠다. 부모 판이 살아 있는 판과 같으면 대조군이 no-op이라 그 자리에서 끊는다.
//
// 표본 범위: 사건 셋(save, catch, spill) x 좌우 두 방향 + 정지 폴백 하나, 1280x720, seed 20.
const EXE = process.env.LOCALAPPDATA + "/ms-playwright/chromium-1228/chrome-win64/chrome.exe";
const BASE = "http://127.0.0.1:10310/web/index.html?seed=20&vary=0";
const LINE = String.fromCharCode(10);
const W = 1280;
const H = 720;
const STEP = 1 / 60;
// 개봉 카드 한 장을 넘기고 다음 마디가 설 때까지. 0.7초를 프레임으로 옮긴 값이다.
const CARD_STEPS = 42;
// 개봉 한 장의 단 수. main.mjs STAGE_LAST와 같은 수이고 여기서 다시 정하지 않고 받아 적는다.
const STAGE_LAST = 4;
// 긴 누름을 붙들고 있는 상한. main.mjs LONG_MS 450보다 넉넉해야 문턱을 넘는다.
const PRESS_MS = 3000;
// 사건을 건 프레임에서 이만큼 뒤에 세계를 멈춘다. 6.67초이고 복귀 예산(3.6+0.5+2.0=6.1초)보다 길어서
// 멈춘 프레임은 이미 도착한 뒤의 한 컷이다.
const STOP_FRAMES = 400;
const EVENTS = ["save", "catch", "spill"];
const SIDES = [-1, 1];
// 골문 앞 키퍼의 제자리. scene.mjs KEEPER_Z와 같은 값이고 여기서 다시 정하지 않고 받아 적는다.
const KEEPER_Z = 0.9;
// 다리 교대 횟수의 바. 계획이 정한 수다.
const FLIP_BAR = 3;
// 도착으로 치는 폭. 0.05m는 골문 반폭 3.66의 1.4퍼센트라 화면에서 제자리로 읽힌다.
const HOME_TOL = 0.05;
// 도착한 몸이 서 있는가. 계획이 정한 수다. 0.02라디안은 1.1도다.
const RZ_BAR = 0.02;
// 발을 떼기 전에 몸이 준비 자세로 얼마나 다가와야 하는가. 사건 순간 거리의 이 비율 아래여야 한다.
// 절대값을 쓰면 실루엣 자의 단위를 여기서 다시 정하는 셈이라 같은 표본 안의 비로 묻는다.
const RISE_CLOSE = 0.35;
// 발을 뗀 것으로 치는 폭. 0.01m는 정지한 몸의 프레임 간 이동량 위다.
const STEP_OFF = 0.01;
// 뒷걸음 허용 폭. 이보다 되돌아가면 단조가 아니다.
const BACK_TOL = 0.02;
// 이만큼도 안 움직인 표본은 복귀를 아예 안 잰 것이다. 실측 다이빙 착지가 1.2m대다.
const MIN_TRAVEL = 0.6;
/* 걸음마다 몸통이 무게를 실은 다리 쪽으로 옮겨 가는가. 두 다리는 서로 반대 위상이라 어느 다리를
   기준으로 잡느냐로 부호가 뒤집힌다. 그래서 이름이 아니라 더 펴진 다리, 곧 무릎이 낮은 쪽을 기준으로
   묻는다. 그 쪽과 목의 좌우 오프셋이 같은 부호로 붙어야 하고 상관계수가 이 이상이어야 한다.
   상관계수 하나로는 못 묻는다. 두 신호가 각각 한 방향으로만 가도 계수는 1이 나온다(실측: 안 걷는
   판에서 여섯 표본 중 넷이 -1.00으로 이 축을 통과했다). 그래서 몸통이 실제로 진동했는지를 같이 센다. */
const CORR_BAR = 0.5;
// 몸통 진동의 죽은 띠 바닥. 목 좌우 오프셋의 보행 진폭이 0.0951이라 이 값은 그 열아홉 분의 일이다.
const TORSO_DEAD = 0.005;
// 걷기 전에 몸이 준비 자세에 얼마나 붙어야 하는가의 절대 바. 0.35는 pose 게이트가 서로 다른 사건을
// 가르는 거리다(tools/pose-gate.mjs). 그보다 멀면 그 몸은 준비 자세가 아니라 다른 사건 하나만큼 떨어져 있다.
const READY_NEAR = 0.35;
/* 잠그지 않은 판. 위의 칸들은 판을 잠그고 세계를 멈춰 리셋이 복귀 도중에 오는 길을 한 번도 안 지난다.
   여기서는 아무것도 잠그지 않고 다음 구가 스스로 서게 둔다.
   손 모드는 누른 구를 그 자리에서 판정하고 누른 시각의 오차를 같이 싣는다. 안 누르고 넘긴 구는
   저장된 선호 방향이 오차 0으로 판정에 들어간다(web/src/main.mjs commit). 그래서 한 번만 눌러
   선호를 놓고 그 뒤 구는 손을 뗀다. 그래야 공을 손에 쥐는 판이 나오고, 그 판만 재시작이
   1.6초 하한으로 짧아져 리셋이 복귀보다 먼저 오거나 복귀 도중에 온다.
   만렙 프리셋인 이유도 그것이다. 신인 키퍼는 골킥 재시작이라 실측 리셋이 꼬리 나이 8.7초에 오고,
   그때 키퍼는 이미 3.7초 전에 집에 서 있어서 이 절을 아예 안 지난다. */
const CARRY_PRESET = "maxed";
// 리셋이 왔을 때 이만큼 밖에 서 있어야 그 표본이 이 절을 실제로 지난 것이다.
// 0.25미터는 homing 게이트가 제자리로 읽는 폭과 같은 수다(tools/homing-gate.mjs NEAR).
const AWAY_BAR = 0.25;
/* 한 프레임에 몸이 지날 수 있는 폭. 실측 정상 보폭은 만렙이 프레임당 0.0292미터이고,
   구현이 스스로 거는 가속 상한은 그 4배(0.117미터)다. 이 바는 6배로, 구현의 상한 위에 있고
   순간이동 아래에 있다. 고친 적 없는 판의 실측 순간이동은 한 프레임에 1.650미터, 곧 56배였다. */
const STEP_CAP = 0.18;
// 화면이 거는 복귀 속도 상한과 같은 수(scene.mjs CARRY_MPS_MAX). 어느 거리가 누름 전에 닿을 수
// 있는지를 이 속도로 가른다. 게이트가 여기서 다른 수를 쓰면 두 자가 서로 다른 몸을 이야기한다.
const CARRY_MPS_BAR = 7.0;
// 선호 방향을 놓는 누름. 오른쪽이어야 실측 seed 20에서 공을 손에 쥔 판이 나온다.
const CARRY_DIR = 1;
/* 방향을 한 번도 안 누르는 칸. 선호 기본값이 0이라 아무것도 안 누른 사람은 매 구 가운데로 판정되고,
   그 몸은 x가 정확히 0이고 전진 토글만큼 z로 나간다(main.mjs advance 0.9, scene.mjs 다이빙 절).
   방향을 누르는 칸 둘은 x가 1.65라 이 깊이축 복귀를 한 번도 안 뽑는다. */
const CARRY_CENTRE = 0;
// 잠그지 않은 판을 이만큼 지켜본다. 실측으로 한 판이 12초에서 18초라 판 셋에서 넷이 들어오고,
// 공을 손에 쥐어 재시작이 짧은 판이 그 안에 하나는 있어야 리셋 갈래를 뽑을 수 있다.
const CARRY_MS = 52000;

// 되돌릴 판. HEAD로 걸면 이 게이트를 담은 커밋이 들어오는 순간 대조군이 자기를 자기와 맞대고 초록이 된다.
// 기본값은 복귀 동작이 들어오기 직전 판이다. 바로 앞 커밋으로 걸면 걷기 축은 이미 초록이라
// 이 자가 무엇을 갈랐는지 한 줄로 못 읽는다. 이 판에서는 일어서기와 걷기와 복귀 가속이 다 빨갛다.
const WAS_REV = (process.argv.find((a) => a.startsWith("--was=")) || "--was=40352dd").slice(6);
const WAS = process.argv.some((a) => a === "--was" || a.startsWith("--was="));
/* 심은 대조군. BOB_Y만 0으로 둔 판을 라우팅한다. --was는 걷기 자체가 없던 판이라
   상하 진동 축이 그 판에서 빨개져도 그것이 이 상수 때문인지를 말하지 못한다. */
const BOB0 = process.argv.some((a) => a === "--bob0");
const LAYER = ["web/src/render/scene.mjs"];
const ROOT = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");

const t = setTimeout(() => { console.log("WATCHDOG"); process.exit(1); }, 420000);
t.unref();

const rows = [];
const say = (name, pass, detail) => rows.push([pass, name, detail]);

// JOINTS = [spine, neck, shL, elL, shR, elR, hipL, knL, hipR, knR]. 관절 하나가 세 수를 차지한다.
const KNL_Y = 7 * 3 + 1;
const KNR_Y = 9 * 3 + 1;
const KNL_X = 7 * 3;
const KNR_X = 9 * 3;
/* 몸통이 어느 쪽으로 옮겨 갔는지는 목의 좌우 오프셋에 있다. 척추를 z축으로 굴리는 각이라 목은 x로 간다.
   앞뒤인 z를 읽으면 진폭 0.0012의 잡음을 읽고, 그 잡음이 상관계수 -0.67을 낸다. 같은 표본에서 x는
   진폭 0.0951에 부호가 네 번 갈린다. 위아래인 y는 걸음마다 한 번 뜨는 성분이 지나는 채널이라 아래가 따로 묻는다. */
const NECK_X = 1 * 3;
/* 걸음마다 한 번 몸이 뜨는가. 척추 마디를 올리는 항이라 목의 상하 오프셋에 그대로 얹힌다.
   루트는 안 움직인다. 접지 보정이 몸의 최저점을 땅에 붙여 두므로 이 항으로는 발이 뜨지 않는다.
   정규화 인자가 루트에서 척추까지의 거리라 상체가 뜨면 이 채널의 값은 오히려 내려간다.
   묻는 것은 방향이 아니라 다리의 두 배로 도는 진동이 있느냐다. */
const NECK_Y = 1 * 3 + 1;

const mean = (a) => a.reduce((s, v) => s + v, 0) / Math.max(1, a.length);
const amp = (a) => { const m = mean(a); return Math.max(0, ...a.map((v) => Math.abs(v - m))); };
const dist = (a, b) => { let s = 0; for (let i = 0; i < a.length; i += 1) { const d = a[i] - b[i]; s += d * d; } return Math.sqrt(s); };

// 부호 교대. 죽은 띠 안의 값은 안 센다. 띠는 도착 뒤 선 몸에서 잰 잡음 바닥의 두 배다.
function flips(sig, dead) {
  let last = 0;
  let n = 0;
  for (const s of sig) {
    if (Math.abs(s) < dead) continue;
    const sgn = s > 0 ? 1 : -1;
    if (last && sgn !== last) n += 1;
    last = sgn;
  }
  return n;
}

function corr(a, b) {
  const ma = mean(a);
  const mb = mean(b);
  let sab = 0;
  let sa = 0;
  let sb = 0;
  for (let i = 0; i < a.length; i += 1) {
    const da = a[i] - ma;
    const db = b[i] - mb;
    sab += da * db; sa += da * da; sb += db * db;
  }
  return sa > 0 && sb > 0 ? sab / Math.sqrt(sa * sb) : 0;
}

// 한 표본의 궤적을 수로 옮긴다. 프레임 번호가 아니라 사건에서 흐른 프레임 수로 읽는다.
function analyse(rec, ref) {
  const x0 = rec[0].x;
  const z0 = rec[0].z;
  const travel = Math.hypot(x0, z0 - KEEPER_Z);
  let off = -1;
  let home = -1;
  for (let i = 1; i < rec.length; i += 1) {
    if (off < 0 && (Math.abs(rec[i].x - x0) > STEP_OFF || Math.abs(rec[i].z - z0) > STEP_OFF)) off = i;
    if (home < 0 && off > 0 && Math.hypot(rec[i].x, rec[i].z - KEEPER_Z) <= HOME_TOL) home = i;
  }
  if (off < 0) off = rec.length - 1;
  if (home < 0) home = rec.length - 1;
  const win = rec.slice(off, home + 1);
  const rest = rec.slice(Math.min(rec.length - 1, home + 6));
  const leg = win.map((r) => r.v[KNL_Y] - r.v[KNR_Y]);
  const legRest = rest.map((r) => r.v[KNL_Y] - r.v[KNR_Y]);
  const torso = win.map((r) => r.v[NECK_X]);
  const torsoRest = rest.map((r) => r.v[NECK_X]);
  const bob = win.map((r) => r.v[NECK_Y]);
  const bobRest = rest.map((r) => r.v[NECK_Y]);
  /* 어느 다리가 +x 쪽에 서는지를 표본에서 받아 적는다. 왼오 이름을 뒤집으면 무릎 차의 부호와 이 곱이
     같이 뒤집히므로 판정이 이름 짓기에 안 걸린다. 곱한 신호는 낮은 무릎이 +x 쪽일 때 양수다. */
  const side = mean(win.map((r) => r.v[KNR_X])) >= mean(win.map((r) => r.v[KNL_X])) ? 1 : -1;
  const low = leg.map((v) => v * side);
  const m = mean(leg);
  let back = 0;
  for (let i = off + 1; i <= home; i += 1) back = Math.max(back, Math.abs(rec[i].x) - Math.abs(rec[i - 1].x));
  return {
    travel, off, home, x0, xEnd: rec[home].x, ageOff: rec[off].a, ageHome: rec[home].a, age0: rec[0].a, zEnd: rec[home].z,
    rzEnd: rec[home].rz, rzOff: rec[off].rz,
    flips: flips(leg.map((v) => v - m), Math.max(0.01, 2 * amp(legRest))),
    legAmp: amp(leg), legFloor: amp(legRest), lean: corr(low, torso), side, back,
    tflips: flips(torso.map((v) => v - mean(torso)), Math.max(TORSO_DEAD, 2 * amp(torsoRest))),
    bobAmp: amp(bob), bobFloor: amp(bobRest),
    bflips: flips(bob.map((v) => v - mean(bob)), Math.max(TORSO_DEAD, 2 * amp(bobRest))),
    d0: dist(rec[0].v, ref), dOff: dist(rec[off].v, ref)
  };
}

// 한 표본을 뽑는다. 실제 슛으로 키퍼를 다이빙시킨 뒤 그 착지점에서 원하는 사건을 건다.
async function sample(browser, routed, kind, side, walkOff) {
  const ctx = await browser.newContext({ viewport: { width: W, height: H } });
  await pinClock(ctx, STEP);
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
  for (const [f, body] of routed) {
    await page.route("**/" + f, (r) => r.fulfill({ status: 200, contentType: "text/javascript; charset=utf-8", body }));
  }
  await page.goto(BASE + (walkOff ? "&walk=0" : ""), { waitUntil: "load" });
  await page.waitForSelector("#go", { timeout: 15000 });
  await page.click("#go", { force: true });
  await clearPull(page);
  // 흔들림 위상을 못 박는다. 안 박으면 같은 프레임의 몸이 회차마다 조금 다른 자리에 선다.
  const pinned = await page.evaluate(() => (window.__swayPin ? window.__swayPin(0) : -1));
  // 준비 자세의 기준 실루엣. 일어서기가 끝났는지는 이 벡터와의 거리로만 물을 수 있다.
  const ref = await page.evaluate(() => window.__poseVis().v);
  /* 방향키는 대기 마디에서만 먹고 그 자리에서 구를 날린다. 정해진 횟수만 누르면 누르는 동안 판이
     비행이나 자막이던 회차에서 아무 구도 안 뛰고, 그 표본은 x가 0인 채로 복귀를 잰다(실측 travel 0.00).
     그래서 횟수가 아니라 판정에 들어간 입력을 보고 멈춘다. */
  let dove = false;
  for (let i = 0; i < 40 && !dove; i += 1) {
    await padOpen(page);
    await page.keyboard.press(side < 0 ? "ArrowLeft" : "ArrowRight");
    await waitFrames(page, 12);
    dove = await page.evaluate((s) => Boolean(window.__lastInput) && window.__lastInput.dive === s, side);
  }
  // 그 구의 사건이 열리는 프레임을 기다린다. 그 프레임의 키퍼는 다이빙을 마치고 착지해 있다.
  await page.waitForFunction(() => window.__tailKind() !== null, null, { timeout: 40000, polling: "raf" });
  const open = await page.evaluate(([k, stop]) => {
    const age = window.__tailAge();
    const seen = window.__tailKind();
    // 판을 잠가 뒤따르는 자막이 내 사건을 덮지 않게 한다. 그다음에 원하는 사건을 같은 프레임에 건다.
    window.__lockRound();
    window.__act(k);
    const f = window.__frames();
    window.__plan(0, null, f + stop);
    window.__w14 = [];
    const tick = () => {
      const p = window.__poseVis();
      window.__w14.push({ f: window.__frames(), a: window.__tailAge(), x: p.pos[0], z: p.pos[2], rz: p.rz, v: p.v });
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    return { f, age, seen, dive: window.__lastInput ? window.__lastInput.dive : 0 };
  }, [kind, STOP_FRAMES]);
  await page.waitForFunction((n) => window.__frames() >= n, open.f + STOP_FRAMES + 20, { timeout: 40000 });
  // 멈춘 프레임 대조군. 세계시각은 그대로이고 프레임만 늘어야 멈춘 것이다.
  const t0 = await page.evaluate(() => ({ v: window.__camDbg().vnow, f: window.__frames() }));
  await page.waitForTimeout(250);
  const t1 = await page.evaluate(() => ({ v: window.__camDbg().vnow, f: window.__frames(), k: window.__keeperPos() }));
  const rec = await page.evaluate(() => window.__w14);
  await ctx.close();
  return { rec, ref, open, errs, pinned, dove, frozen: { t0, t1 } };
}

/* 프레임으로 기다린다. 벽시계로 기다리면 부하가 걸린 기계에서 대기 마디를 통째로 지나친다.
   실측으로 노드 프로세스 122개에 CPU 72퍼센트인 기계에서 여섯 칸 중 셋이 다이빙을 못 걸었고,
   그 셋은 travel 0.00으로 빨개졌다. pinClock이 세계를 프레임으로 돌리므로 기다림도 프레임이어야
   같은 판이 같은 수를 낸다. */
const waitFrames = (page, n) => page.evaluate((k) => new Promise((done) => {
  const f0 = window.__frames();
  const tick = () => (window.__frames() >= f0 + k ? done(window.__frames()) : requestAnimationFrame(tick));
  requestAnimationFrame(tick);
}), n);

/* 방향키는 대기 마디에서만 먹는다. 그 마디가 열렸는지는 다이브 패드의 zone 단추가 살아 있는지로
   읽는다(main.mjs setPad). 패드가 열린 프레임에 눌러야 그 누름이 판정에 들어간다. */
const padOpen = (page) => page.waitForFunction(() => {
  const z = document.querySelector(".zone");
  return Boolean(z) && !z.disabled;
}, null, { timeout: 60000, polling: "raf" });

/* 개봉 자리를 치운다. 짧은 누름은 한 단만 올리므로(main.mjs LONG_MS 450) 정해진 횟수만 두드리면
   열한 장이 안 열린 채로 남고 개봉 자리가 화면에 그대로 선다. 실측으로 700밀리초 간격 여섯 번이
   열한 장 중 셋을 2단에 남겼다. 길게 눌러 남은 것을 한 번에 열고 그다음 한 번 두드려 닫는다.
   손가락이 내려가 있는 동안 열리는 물건이라 누름과 뗌을 따로 보내고, 열린 것을 보고 뗀다.
   긴 누름이 만든 click은 화면이 스스로 삼키므로(main.mjs longDone) 닫는 두드림은 따로 보내야 한다. */
async function clearPull(page) {
  for (let i = 0; i < 6; i += 1) {
    const open = await page.evaluate(() => { const e = document.getElementById("pull"); return Boolean(e) && !e.hidden; });
    if (!open) return;
    const spot = await page.locator("#pull .tap").boundingBox();
    if (!spot) return;
    await page.mouse.move(spot.x + spot.width / 2, spot.y + spot.height / 2);
    await page.mouse.down();
    await page.waitForFunction((last) => {
      const r = window.__reveal();
      return r.drawn > 0 && r.shown === r.drawn && r.stage === last;
    }, STAGE_LAST, { timeout: PRESS_MS, polling: "raf" }).catch(() => {});
    await page.mouse.up();
    await page.click("#pull", { force: true });
    await page.waitForFunction((n) => window.__frames() >= n, (await page.evaluate(() => window.__frames())) + CARD_STEPS, { timeout: 20000 });
  }
}

/* 잠그지 않은 한 판. 선호를 놓고 손을 뗀 뒤, 리셋이 복귀 도중이나 그 전에 오는 판 하나를 고른다.
   세계를 안 멈추므로 프레임이 아니라 공과 꼬리가 시각을 알려 준다. */
async function carrySample(browser, routed, seed, dir, home) {
  const ctx = await browser.newContext({ viewport: { width: W, height: H } });
  await pinClock(ctx, STEP);
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
  for (const [f, body] of routed) {
    await page.route("**/" + f, (r) => r.fulfill({ status: 200, contentType: "text/javascript; charset=utf-8", body }));
  }
  await page.goto("http://127.0.0.1:10310/web/index.html?seed=" + seed + "&vary=0&preset=" + CARRY_PRESET
    + (home ? "&home=" + home : ""), { waitUntil: "load" });
  await page.waitForSelector("#go", { timeout: 15000 });
  await page.click("#go", { force: true });
  await clearPull(page);
  await page.evaluate(() => (window.__swayPin ? window.__swayPin(0) : -1));
  let pref = dir === 0;
  for (let i = 0; i < 40 && !pref; i += 1) {
    await padOpen(page);
    await page.keyboard.press(dir < 0 ? "ArrowLeft" : "ArrowRight");
    await waitFrames(page, 12);
    pref = await page.evaluate((d) => Boolean(window.__lastInput) && window.__lastInput.dive === d, dir);
  }
  await page.evaluate((centre) => {
    window.__w14c = [];
    /* 전진 토글은 nextShot이 매 구 0으로 되돌린다(main.mjs advance = 0). 가운데 칸은 판마다 대기
       마디가 열린 뒤에 다시 켜야 몸이 깊이로 나간다. 방향은 한 번도 안 누른다. */
    let armed = false;
    const tick = () => {
      const k = window.__keeperPos();
      const b = window.__ballPos();
      const zone = document.querySelector(".zone");
      const open = Boolean(zone) && !zone.disabled;
      if (centre && open && !armed) {
        const out = document.getElementById("out");
        if (out && !out.classList.contains("on")) out.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
        armed = true;
      }
      if (!open) armed = false;
      const bv = window.__backVis ? window.__backVis() : null;
      window.__w14c.push({ f: window.__frames(), k: window.__tailKind(), a: window.__tailAge(), x: k.x, z: k.z, bz: b.z,
        t: window.__camDbg().vnow, w: window.__backVis ? (bv || {}).why || null : "no-hook",
        // 일어서기 진행률. 복귀는 두 단이고 걷기는 이 값이 1에 닿은 뒤에 시작한다.
        r: bv ? bv.r : null });
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, dir === 0);
  await page.waitForTimeout(CARRY_MS);
  const rec = await page.evaluate(() => window.__w14c);
  await ctx.close();
  return { rec, errs, pref };
}

// 한 판의 궤적을 수로 옮긴다. 리셋 프레임과 다음 구의 발 떠나는 프레임이 이 표본의 두 경계다.
function analyseCarry(rec, branch) {
  const off = (r) => Math.hypot(r.x, r.z - KEEPER_Z);
  const rounds = [];
  let open = -1;
  for (let i = 1; i < rec.length; i += 1) {
    if (!rec[i - 1].k && rec[i].k) open = i;
    if (rec[i - 1].k && !rec[i].k && open > 0) { rounds.push([open, i]); open = -1; }
  }
  /* 리셋 순간에 집을 비웠고 그때 원하는 갈래로 복귀가 열린 판을 고른다. 거리만 보고 고르면
     판 시각이 조금 밀렸을 때 다른 갈래의 판이 뽑히고, 이 랩이 낸 갈래는 아무도 안 지나는데
     게이트는 초록이 된다(실측: 채취를 프레임으로 바꾸자 앞 칸이 3.54초 판에서 5.38초 판으로 옮겨 갔다).
     그런 판이 없으면 거리로만 고른 판을 내고, 갈래 축이 그 사실을 빨갛게 말한다. */
  const okAway = ([, r0]) => off(rec[r0 - 1]) >= AWAY_BAR;
  const okBranch = ([, r0]) => rec[Math.min(rec.length - 1, r0 + 1)].w === branch;
  let pick = rounds.find((r) => okAway(r) && okBranch(r)) || rounds.find(okAway) || rounds[rounds.length - 1];
  if (!pick) return null;
  const [o, r0] = pick;
  let strike = -1, arrive = -1, home = -1, worst = 0, worstAt = -1;
  for (let i = r0; i < rec.length; i += 1) if (rec[i].bz < 10.6) { strike = i; break; }
  if (strike > 0) for (let i = strike; i < rec.length; i += 1) if (rec[i].bz <= KEEPER_Z) { arrive = i; break; }
  for (let i = r0; i < rec.length; i += 1) if (off(rec[i]) <= HOME_TOL) { home = i; break; }
  /* 일어서기가 끝난 프레임. 리셋이 연 복귀는 일어서기부터 시작하고, 꼬리가 이미 열어 둔 복귀는
     그 단을 지나 있어 0이 나온다. 두 갈래의 남은 일을 같은 자로 재려면 이 단을 따로 알아야 한다. */
  let rose = -1;
  for (let i = r0; i < rec.length; i += 1) { if (rec[i].r === null || rec[i].r === undefined || rec[i].r >= 1) { rose = i; break; } }
  const last = strike > 0 ? strike : rec.length - 1;
  const steps = [];
  for (let i = o + 1; i <= last; i += 1) {
    const d = off(rec[i - 1]) - off(rec[i]);
    if (d > 0.002) steps.push(d);
  }
  steps.sort((a, b) => a - b);
  /* 최악 프레임은 고른 판이 아니라 기록 전체에서 찾는다. 순간이동은 어느 판에서 나든 순간이동이다.
     새 꼬리가 열리는 프레임만 뺀다. 그 프레임은 이동이 아니라 컷이고, 새 꼬리의 연출이 몸을
     자기 시작 자세로 다시 세운다(실측: 잡기에서 돌진으로 넘어가며 z가 한 프레임에 0.9미터 줄었다).
     그 컷은 이 절이 아니라 꼬리 연출의 문제이고 이 랩에서 안 건드린다. */
  for (let i = 1; i < rec.length; i += 1) {
    if (rec[i].k && rec[i].k !== rec[i - 1].k) continue;
    const d = off(rec[i - 1]) - off(rec[i]);
    if (d > worst) { worst = d; worstAt = i; }
  }
  // 다음 구를 손가락이 눌러야 하는 순간. main.mjs가 비행의 72퍼센트에 둔다.
  const flight = arrive > 0 && strike > 0 ? rec[arrive].t - rec[strike].t : -1;
  return {
    rounds: rounds.length, kind: rec[o].k, landed: off(rec[o]), resetAge: rec[r0 - 1].a, awayAtReset: off(rec[r0 - 1]),
    afterReset: off(rec[r0]), worst, worstAt: worstAt > 0 ? rec[worstAt].f : -1,
    median: steps.length ? steps[Math.floor(steps.length / 2)] : 0, n: steps.length,
    why: rec[Math.min(rec.length - 1, r0 + 1)].w,
    homeIn: home > 0 ? rec[home].t - rec[r0].t : -1,
    riseIn: rose >= 0 ? rec[rose].t - rec[r0].t : -1,
    strikeIn: strike > 0 ? rec[strike].t - rec[r0].t : -1,
    pressIn: flight > 0 ? 0.72 * flight : -1
  };
}

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
if (BOB0) {
  if (WAS) { console.log("--was and --bob0 route the same file. INSTRUMENT DEAD"); process.exit(2); }
  const f = LAYER[0];
  const live = readFileSync(ROOT + f, "utf8");
  const hits = live.match(/const BOB_Y = [0-9.]+;/g) || [];
  if (hits.length !== 1) { console.log("BOB_Y " + hits.length + ". INSTRUMENT DEAD"); process.exit(2); }
  routed.set(f, live.replace(hits[0], "const BOB_Y = 0;"));
}

let browser;
const errAll = [];
try {
  browser = await chromium.launch({ executablePath: EXE });
  const cells = [];
  for (const kind of EVENTS) for (const side of SIDES) cells.push([kind, side, false]);
  cells.push(["save", -1, true]);
  for (const [kind, side, walkOff] of cells) {
    const tag = kind + (side < 0 ? " L" : " R") + (walkOff ? " walk0" : "");
    const s = await sample(browser, routed, kind, side, walkOff);
    for (const e of s.errs) errAll.push(e);
    const a = analyse(s.rec, s.ref);
    console.log("  " + tag + " land " + a.x0.toFixed(2) + " travel " + a.travel.toFixed(2)
      + "m off@" + a.off + "f/" + a.ageOff.toFixed(2) + "s home@" + a.home + "f/" + a.ageHome.toFixed(2) + "s age0 " + a.age0.toFixed(2) + " flips " + a.flips + " legAmp " + a.legAmp.toFixed(3)
      + " floor " + a.legFloor.toFixed(3) + " bob " + a.bobAmp.toFixed(4) + "/" + a.bflips + " lean " + a.lean.toFixed(2) + "/" + a.tflips + "/" + a.side + " rz " + a.rzOff.toFixed(3)
      + "->" + a.rzEnd.toFixed(3) + " ready " + a.d0.toFixed(2) + "->" + a.dOff.toFixed(2));
    if (walkOff) {
      say("control:the-stop-fallback-keeps-him-where-he-landed",
        Math.abs(a.xEnd - a.x0) <= HOME_TOL && a.travel >= MIN_TRAVEL,
        "landed " + a.x0.toFixed(2) + ", last " + a.xEnd.toFixed(2) + " after " + s.rec.length + " frames");
      continue;
    }
    say("instrument:the-shot-took-him-off-his-line " + tag, a.travel >= MIN_TRAVEL && s.pinned >= 0 && s.dove,
      "dive " + s.open.dive + " opened on " + s.open.seen + " at age " + s.open.age.toFixed(2)
      + ", travel " + a.travel.toFixed(2) + "m, sway phase " + s.pinned);
    say("rise:he-stands-up-on-the-spot-before-the-first-step " + tag,
      a.off > 0 && a.dOff <= a.d0 * RISE_CLOSE && a.dOff <= READY_NEAR && Math.abs(a.rzOff) <= HOME_TOL,
      "ready distance " + a.d0.toFixed(2) + " -> " + a.dOff.toFixed(2) + " (bar "
      + (a.d0 * RISE_CLOSE).toFixed(2) + "), tilt " + a.rzOff.toFixed(3) + " at the step off frame " + a.off);
    say("walk:the-legs-alternate-on-the-way-home " + tag, a.flips >= FLIP_BAR,
      a.flips + " sign changes of the knee height gap, amplitude " + a.legAmp.toFixed(3)
      + " over a standing floor of " + a.legFloor.toFixed(3));
    say("walk:the-torso-leans-over-the-planted-leg " + tag, a.lean >= CORR_BAR && a.tflips >= FLIP_BAR,
      "lean " + a.lean.toFixed(2) + " between the lower knee side and the neck offset over " + a.tflips
      + " torso sign changes, +x leg " + (a.side > 0 ? "R" : "L"));
    say("walk:the-body-rises-once-per-step " + tag,
      a.bobAmp >= TORSO_DEAD && a.bflips >= 2 * FLIP_BAR && a.bflips > a.flips,
      a.bflips + " sign changes of the neck height over " + a.flips + " of the legs, amplitude "
      + a.bobAmp.toFixed(4) + " over a standing floor of " + a.bobFloor.toFixed(4)
      + " and a dead band of " + TORSO_DEAD);
    say("walk:the-return-is-monotone " + tag, a.back <= BACK_TOL, "worst back step " + a.back.toFixed(3) + "m");
    say("walk:he-arrives-home-standing " + tag,
      Math.hypot(a.xEnd, a.zEnd - KEEPER_Z) <= HOME_TOL && Math.abs(a.rzEnd) < RZ_BAR,
      "ended at " + a.xEnd.toFixed(3) + "," + a.zEnd.toFixed(3) + " tilt " + a.rzEnd.toFixed(4) + " on frame " + a.home);
    say("control:the-frozen-frame-holds-the-world " + tag,
      s.frozen.t0.v === s.frozen.t1.v && s.frozen.t1.f > s.frozen.t0.f,
      "vnow " + s.frozen.t1.v.toFixed(4) + " held while frames ran " + s.frozen.t0.f + "->" + s.frozen.t1.f
      + ", keeper x " + s.frozen.t1.k.x.toFixed(4));
  }
  /* 잠그지 않은 칸 셋. 하나는 리셋이 복귀가 열리기 전에 오고(실측 꼬리 나이 3.54초, 복귀는 3.6초),
     하나는 걷는 도중에 온다(실측 5.33초에 1.13미터 남음). 두 자리가 이 절의 두 갈래다. */
  /* 앞 칸은 복귀를 8초로 밀어 다음 구가 반드시 먼저 서게 한다. 실측 재시작이 5.38초라 여유가
     2.6초이고, 밀지 않으면 3.63초와 3.6초 사이 0.03초에 갈래가 걸린다.
     마지막 칸도 복귀를 8초로 밀되 방향을 한 번도 안 눌러 x가 정확히 0인 몸을 리셋 갈래로 보낸다.
     변위 가드가 x와 z를 함께 묻는 자리는 그 갈래뿐이라, 꼬리 갈래로 두면 깊이축 복귀를 아무도 안 지난다. */
  for (const [tag, seed, dir, branch, home] of [["carry-before-the-walk", 20, CARRY_DIR, "reset", 8],
    ["carry-mid-walk", 7, CARRY_DIR, "tail", 0], ["carry-centre-depth", 20, CARRY_CENTRE, "reset", 8]]) {
    const s = await carrySample(browser, routed, seed, dir, home);
    for (const e of s.errs) errAll.push(e);
    const a = analyseCarry(s.rec, branch);
    if (!a) { say("instrument:the-next-ball-arrived-while-he-was-off-his-line " + tag, false, "no round closed in " + s.rec.length + " frames"); continue; }
    console.log("  " + tag + " seed " + seed + " tail " + a.kind + " landed " + a.landed.toFixed(2)
      + "m reset@" + a.resetAge.toFixed(2) + "s away " + a.awayAtReset.toFixed(3) + "->" + a.afterReset.toFixed(3)
      + " worst " + a.worst.toFixed(4) + "m/f at " + a.worstAt + " median " + a.median.toFixed(4) + " n " + a.n + " branch " + a.why
      + " home +" + a.homeIn.toFixed(2) + "s rise +" + a.riseIn.toFixed(2)
      + "s press +" + a.pressIn.toFixed(2) + "s strike +" + a.strikeIn.toFixed(2) + "s");
    say("instrument:the-next-ball-arrived-while-he-was-off-his-line " + tag, a.awayAtReset >= AWAY_BAR && s.pref,
      a.kind + " restarted at tail age " + a.resetAge.toFixed(2) + "s with him " + a.awayAtReset.toFixed(2) + "m off his line");
    say("carry:no-frame-crosses-more-than-the-walk-can-step " + tag, a.worst <= STEP_CAP,
      "worst homeward frame " + a.worst.toFixed(3) + "m against a " + STEP_CAP + "m cap, walking median "
      + a.median.toFixed(4) + "m over " + a.n + " frames");
    /* 손가락이 누르는 순간까지 걸어올 수 있는 거리인가부터 묻는다. 상한 속도로도 못 닿는 거리면
       그 판은 공이 발을 떠나는 순간을 기준으로 묻는다. 한눈판 복귀 3.29미터는 0.46초에 초속 7미터로도
       못 오고, 그 거리를 그 안에 오게 만들면 그것이 다시 미끄러짐이다. */
    /* 누름까지 닿을 수 있는 거리인가. 복귀는 일어서기와 걷기 두 단이고 가속 상한은 둘을 같이 나눈다.
       걷는 거리만 상한으로 나누면 일어서는 동안 쓴 시간이 공짜가 되어, 실측 3.29미터 판이 걷기만으로
       0.470초를 쓰는데 0.48초 창을 통과했다고 읽혔다. 그 판의 일어서기는 0.10초였고 집에 든 것은
       0.58초다. 일어서기를 같이 세면 그 판은 창 밖으로 나가고 판정 기준이 공이 발을 떠나는 순간이 된다. */
    const reach = a.pressIn >= a.riseIn + a.awayAtReset / CARRY_MPS_BAR;
    say("carry:he-is-home-before-the-next-ball-needs-a-press " + tag,
      a.homeIn >= 0 && a.pressIn > 0 && a.homeIn <= (reach ? a.pressIn : a.strikeIn),
      "home " + a.homeIn.toFixed(2) + "s after the restart (stand-up " + a.riseIn.toFixed(2)
      + "s), press window at " + a.pressIn.toFixed(2)
      + "s, ball struck at " + a.strikeIn.toFixed(2) + "s, " + a.awayAtReset.toFixed(2) + "m "
      + (reach ? "is" : "is not") + " reachable inside the press window");
    /* 어느 갈래를 지났는지를 못 박는다. 이것이 없으면 판 시각이 60밀리초만 밀려도 앞 칸이
       걷는 도중 갈래로 조용히 옮겨 가고, 이 랩이 새로 낸 갈래는 아무도 안 지나는데 게이트는 초록이다.
       갈래 이름은 화면이 직접 낸다(scene.mjs __backVis). 게이트가 상수를 베껴 쓰면 그 베낌이 또 낡는다. */
    say("branch:the-cell-ran-the-expected-return-branch " + tag, a.why === branch,
      "opened by " + a.why + ", expected " + branch + ", restart at tail age " + a.resetAge.toFixed(2)
      + "s over " + a.rounds + " rounds");
  }
  say("console:no-errors", errAll.length === 0, errAll.slice(0, 2).join(" | ") || "clean");
} finally {
  clearTimeout(t);
  if (browser) await browser.close();
}

const fails = rows.filter((r) => !r[0]);
const oks = rows.filter((r) => r[0]);
if (oks.length) console.log(oks.map((r) => "  ok   " + r[1] + " " + r[2]).join(LINE));
if (fails.length) console.log(fails.map((r) => "  FAIL " + r[1] + " " + r[2]).join(LINE));
console.log("표본 범위: 사건 " + EVENTS.length + " x 좌우 " + SIDES.length + " + 정지 폴백 1, 프레임 폭 " + STEP.toFixed(4) + "초");
if (WAS) {
  // 부모 판 대조군. 걷기와 일어서기 축이 그 판에서 빨개져야 이 자가 무언가를 가른 것이다.
  const red = fails.filter((r) => r[1].startsWith("walk:") || r[1].startsWith("rise:") || r[1].startsWith("carry:")
    || r[1].startsWith("branch:")).length;
  console.log(red > 0 ? "walkback CONTROL PASS " + red + " walk axes red on " + WAS_REV
    : "walkback CONTROL FAIL 0 walk axes red on " + WAS_REV);
  process.exitCode = red > 0 ? 0 : 1;
} else if (BOB0) {
  // 심은 대조군. 상하 진동 축만 빨개져야 그 축이 BOB_Y를 재고 있는 것이다.
  const red = fails.filter((r) => r[1].startsWith("walk:the-body-rises-once-per-step")).length;
  console.log(red > 0 ? "walkback CONTROL PASS " + red + " bob axes red on BOB_Y 0"
    : "walkback CONTROL FAIL 0 bob axes red on BOB_Y 0");
  process.exitCode = red > 0 ? 0 : 1;
} else {
  console.log(fails.length ? "walkback FAIL " + fails.length : "walkback PASS " + oks.length);
  if (fails.length) process.exitCode = 1;
}
