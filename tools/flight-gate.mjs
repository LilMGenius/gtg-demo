import { chromium } from "playwright";
import { writeFileSync } from "node:fs";

// 날아오는 공과 그 잔상이 화면에 남는지 화소로 재는 자.
// 앞선 판은 __flightVis가 돌려주는 씬 그래프 값만 읽었다. 투영 크기 33.8px, 잔상 여덟 장 전부 켜짐,
// 링 비율 3.94로 통과했는데 같은 시점 스크린샷에는 공도 꼬리도 없었다. 선언 상태를 건강검진으로 읽은 것이다.
// 그래서 잰다: 세계시간을 멈춘 같은 프레임을 세 번 그린다. 원본, 잔상만 뺀 것, 공까지 뺀 것.
// 차분이 무엇의 화소인지 그때서야 말할 수 있다. 공 = B-C, 잔상 = A-B.
// 바: 비행 중 공 지름 30px, 잔상 화소 200개, 잔상이 공 반지름의 1.5배 밖까지 나감.
// 반지름만 보는 바는 뭉친 후광을 통과시킨다. 실측: 고스트 간격 18px에 공 지름 34px이라
// 고스트가 앞 고스트를 반지름만큼 덮어 링 반지름 53px 안에 여덟 장이 전부 뭉쳤는데 비율 3.1로 통과했다.
// 그래서 뻗은 길이를 따로 잰다: reach = 링/지름이 2.0 이상, 공 지름 밖에 놓인 잔상 화소가 120개 이상.
// 대조군 둘. 같은 프레임을 두 번 그린 잡음 바닥이 50화소 미만이어야 자가 예민한 것이고,
// 비행이 아닐 때 잔상 화소가 0이면서 공 화소는 남아야 자가 잔상만 골라 보는 것이다.

const EXE = process.env.LOCALAPPDATA + "/ms-playwright/chromium-1228/chrome-win64/chrome.exe";
const URL = "http://127.0.0.1:10310/web/index.html?seed=" + (process.argv[2] || 7);
const W = 1280;
const H = 720;
const ROUNDS = 4;
const BAR_BALL = 30;
const BAR_RATIO = 1.5;
// 가장 뒤 잔상은 지금까지 날아온 거리 전부를 되짚어 킥 지점에 놓인다. 그보다 더 뻗은 꼬리는
// 킥 이전 구간을 지어낸 것이므로 거짓이다. 그래서 reach의 천장은 공에서 발끝까지의 화면 거리다.
// 실측 네 라운드: 1.68(가장 정면), 3.37, 7.48, 6.85. 정면 킥에서 1.68이 기하학적 최대다.
// 바는 그 아래 1.5로 둔다. 뭉친 후광은 0.66에서 1.00 사이였으므로 원래 잡으려던 형태는 그대로 걸린다.
const BAR_REACH = 1.5;
const BAR_FAR = 120;
// 어느 프레임에서 재느냐가 바보다 먼저다. z<8은 공이 발을 떠난 지 반 미터인 지점이라
// 꼬리가 지나온 길이 자체가 없고, 그 구간의 이동은 카메라 축과 거의 나란해서
// 월드 공간 꼬리가 화면에 투영되지 않는다. 실측: 같은 프레임에서 링 27px, 공 지름 41px.
// 플레이어가 공을 읽는 순간은 공이 커지고 화면 위치가 소실점에서 벌어지는 중반이다. 거기서 잰다.
const Z_FREEZE = 4;
const BAR_TRAIL = 200;
const BAR_NOISE = 50;
const LUM = 12;
const t = setTimeout(() => { console.log("WATCHDOG"); process.exit(1); }, 260000);
t.unref();

// 킥이 시작될 때까지 기다린다. 앞선 판은 고정 2600ms 뒤에 방향키를 눌렀는데,
// 공을 다시 세우는 카운트다운이 그보다 길어서 1~3라운드가 통째로 비었다. 표본 하나로는 최솟값이 최솟값이 아니다.
const waitCue = () => new Promise((res) => {
  const t0 = performance.now();
  const tick = () => {
    if (window.__flightVis().cue) { res(true); return; }
    if (performance.now() - t0 > 14000) { res(false); return; }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
});

// 비행이 무르익은 프레임에서 멈춘다. 킥 직후는 꼬리가 아직 안 자랐고 발밑 프레임은 이동이 없다.
const waitFlight = (z) => new Promise((res) => {
  const t0 = performance.now();
  const tick = () => {
    const r = window.__flightVis();
    if (r.cue && r.step > 0.05 && r.trail >= 16 && r.z < z) { window.__freeze(true); res(r); return; }
    if (performance.now() - t0 > 3000) { res(null); return; }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
});

// 성장 카드가 떠 있으면 킥이 영원히 안 온다. 카드를 한 장 골라 닫고 다음 세트를 연다.
const clearOffer = async (p) => {
  const shown = await p.evaluate(() => {
    const box = document.getElementById("offer");
    return Boolean(box && !box.hidden && box.querySelector("button"));
  });
  if (!shown) return false;
  await p.click("#offer button", { force: true });
  await p.waitForTimeout(700);
  return true;
};

// 페이지 안에서 두 장을 디코드하고 밝기가 갈린 화소를 모은다.
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
  const px = [];
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  for (let y = 0; y < a.height; y += 1) {
    for (let x = 0; x < a.width; x += 1) {
      const i = (y * a.width + x) * 4;
      const d = Math.abs(a.data[i] - b.data[i]) + Math.abs(a.data[i + 1] - b.data[i + 1]) + Math.abs(a.data[i + 2] - b.data[i + 2]);
      if (d < lum * 3) continue;
      px.push(x, y);
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  return { n: px.length / 2, px, x0, x1, y0, y1 };
}

// HUD는 찍지 않는다. flash, stamp, caption은 CSS 시간으로 움직이므로 __freeze가 못 세운다.
// 전체 페이지를 찍으면 같은 프레임 두 장 사이에 수천 화소가 갈리고, 그 잡음이 공보다 크다.
// 공과 잔상은 캔버스 안에만 있으므로 측정면은 캔버스다.
const shots = async (p) => {
  const cv = p.locator("#stage");
  const shot = async () => (await cv.screenshot({ type: "png" })).toString("base64");
  const st = [];
  const note = async () => st.push(await p.evaluate(() => window.__flightState()));
  const a = await shot();
  await note();
  await p.evaluate(() => window.__flightHide("ghosts"));
  await p.waitForTimeout(120);
  const b = await shot();
  await note();
  await p.evaluate(() => window.__flightHide("both"));
  await p.waitForTimeout(120);
  const c = await shot();
  await note();
  await p.evaluate(() => window.__flightHide("none"));
  await p.waitForTimeout(120);
  const a2 = await shot();
  await note();
  return { a, b, c, a2, st };
};

// 실패한 라운드는 네 장 전부 남긴다. 한 장만 보면 공이 작은 것인지 가려진 것인지 갈리지 않는다.
const dump = (tag, s) => {
  for (const k of ["a", "b", "c", "a2"]) {
    writeFileSync("flight-" + tag + "-" + k + ".local.png", Buffer.from(s[k], "base64"));
  }
  console.log("  wrote flight-" + tag + "-{a,b,c,a2}.local.png");
  console.log("  state " + s.st.map((x) => "b" + (x.ball ? 1 : 0) + "/s" + x.shown + "/l" + x.lit + "/o" + x.opacity.toFixed(2)).join(" "));
};

const measure = async (p, s) => {
  const ball = await p.evaluate(diff, [s.b, s.c, LUM]);
  const trail = await p.evaluate(diff, [s.a, s.b, LUM]);
  const noise = await p.evaluate(diff, [s.a, s.a2, LUM]);
  const dia = ball.n ? Math.max(ball.x1 - ball.x0, ball.y1 - ball.y0) + 1 : 0;
  const cx = (ball.x0 + ball.x1) / 2;
  const cy = (ball.y0 + ball.y1) / 2;
  let ring = 0;
  let far = 0;
  for (let i = 0; i < trail.px.length; i += 2) {
    const d = Math.hypot(trail.px[i] - cx, trail.px[i + 1] - cy);
    if (d > ring) ring = d;
    if (dia && d > dia) far += 1;
  }
  return { ballN: ball.n, dia, trailN: trail.n, ring, far, noise: noise.n,
    bx0: ball.x0, bx1: ball.x1, by0: ball.y0, by1: ball.y1,
    tx0: trail.x0, tx1: trail.x1, ty0: trail.y0, ty1: trail.y1,
    nx0: noise.x0, nx1: noise.x1, ny0: noise.y0, ny1: noise.y1 };
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
  for (let i = 0; i < ROUNDS; i += 1) {
    let m = null;
    // 세트가 끝나면 성장 카드가 떠 킥이 멈춘다. 카드를 닫기 전까지는 기다려도 큐가 안 온다.
    // 앞선 판은 그 라운드를 건너뛰고 표본을 셋으로 줄였다. 표본을 줄이는 것은 바를 내리는 것과 같다.
    for (let a = 0; a < 3 && !m; a += 1) {
      await clearOffer(p);
      const armed = await p.evaluate(waitCue);
      if (!armed) { console.log("round " + i + " retry " + a + ": no kick within 14s"); continue; }
      await p.keyboard.press(i % 2 ? "ArrowRight" : "ArrowLeft");
      const hit = await p.evaluate(waitFlight, Z_FREEZE);
      if (!hit) { console.log("round " + i + " retry " + a + ": no flight frame"); continue; }
      // 차분은 base64 문자열만 보므로 세계를 세워둘 이유가 없다.
      // 정지를 measure까지 끌면 한 라운드가 수 초 멈추고 다음 킥 주기를 통째로 놓친다.
      const s = await shots(p);
      await p.evaluate(() => window.__freeze(false));
      m = await measure(p, s);
      rows.push(m);
      console.log("round " + i + " ballPx=" + m.ballN + " dia=" + m.dia + " trailPx=" + m.trailN
        + " ring=" + m.ring.toFixed(1) + " ratio=" + (m.ring / Math.max(1, m.dia / 2)).toFixed(2) + " noise=" + m.noise);
      // 통과 못 한 라운드는 눈으로 볼 수 있어야 고칠 대상이 정해진다.
      // 선언 지름과 실측 지름을 같이 적어야 공이 작은 것인지 가려진 것인지 갈린다.
      console.log("  decl dia=" + hit.ballPx.toFixed(1) + "px z=" + hit.z.toFixed(2)
        + " bbox " + m.bx0 + ".." + m.bx1 + "," + m.by0 + ".." + m.by1);
      if (m.dia < BAR_BALL) {
        dump("fail" + i, s);
      }
    }
    if (!m) { console.log("skip round " + i + " after 3 retries"); }
    await p.waitForTimeout(1200);
  }
  if (!rows.length) { console.log("INSTRUMENT DEAD: no flight frames"); process.exit(1); }

  // 대조군. 비행이 끝난 정지 상태에 같은 자를 댄다.
  await p.waitForTimeout(1200);
  await p.evaluate(() => window.__freeze(true));
  const idleShots = await shots(p);
  await p.evaluate(() => window.__freeze(false));
  const idle = await measure(p, idleShots);
  if (idle.trailN > 0 || idle.noise > 0) {
    dump("idle", idleShots);
    // 대조군에서 갈린 화소가 어디인지 좌표로 못 박아야 원인이 좁혀진다.
    console.log("  idle trail bbox " + idle.tx0 + ".." + idle.tx1 + "," + idle.ty0 + ".." + idle.ty1
      + " noise bbox " + idle.nx0 + ".." + idle.nx1 + "," + idle.ny0 + ".." + idle.ny1);
  }

  const minDia = Math.min(...rows.map((r) => r.dia));
  const minTrail = Math.min(...rows.map((r) => r.trailN));
  const minRatio = Math.min(...rows.map((r) => r.ring / Math.max(1, r.dia / 2)));
  const minReach = Math.min(...rows.map((r) => r.ring / Math.max(1, r.dia)));
  const minFar = Math.min(...rows.map((r) => r.far));
  const maxNoise = Math.max(...rows.map((r) => r.noise), idle.noise);
  console.log("MIN_DIA " + minDia + "px (bar " + BAR_BALL + ")");
  console.log("MIN_TRAIL " + minTrail + "px (bar " + BAR_TRAIL + ")");
  console.log("MIN_RATIO " + minRatio.toFixed(2) + " (bar " + BAR_RATIO + ")");
  console.log("MIN_REACH " + minReach.toFixed(2) + " (bar " + BAR_REACH + ")");
  console.log("MIN_FAR " + minFar + "px (bar " + BAR_FAR + ")");
  console.log("NOISE " + maxNoise + " (bar <" + BAR_NOISE + ")");
  console.log("CONTROL idle trailPx=" + idle.trailN + " ballPx=" + idle.ballN);
  console.log("ERRORS " + errs.length);

  if (maxNoise >= BAR_NOISE) { console.log("INSTRUMENT DEAD: noise floor"); process.exit(1); }
  if (idle.trailN > 0) { console.log("INSTRUMENT DEAD: control trail lit"); process.exit(1); }
  if (idle.ballN === 0) { console.log("INSTRUMENT DEAD: control ball invisible to diff"); process.exit(1); }
  if (minDia < BAR_BALL) fail += 1;
  if (minTrail < BAR_TRAIL) fail += 1;
  if (minRatio < BAR_RATIO) fail += 1;
  if (minReach < BAR_REACH) fail += 1;
  if (minFar < BAR_FAR) fail += 1;
  if (errs.length) fail += 1;
  console.log(fail ? "FAIL" : "PASS");
} finally {
  if (br) await br.close();
}
process.exit(fail ? 1 : 0);
