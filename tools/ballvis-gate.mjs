import { chromium } from "playwright";
import { writeFileSync } from "node:fs";

// 사건의 주어가 결정적 순간에 보이는지 재는 자.
// 크리틱이 i-save 프리즈 프레임 중앙에서 축구공 무늬를 한 픽셀도 못 찾았다.
// 임팩트 층 다섯 개가 depthTest:false라 깊이와 무관하게 공 위에 그려진다.
// 그러니 월드 오프셋으로는 증명이 안 되고, 공이 있어야 할 화소를 직접 세야 한다.
//
// 재는 법: 임팩트를 켠 프레임 A와 끈 프레임 B를 공 화면 원반 안에서만 비교한다.
// 달라진 화소 = 이펙트가 공을 덮은 화소다.
//
// 바(먼저 정하고 낮추지 않는다).
//   1. 덮인 비율 35% 미만. 원반의 삼분의 일을 넘게 가리면 오각형 무늬가 안 읽힌다.
//   2. 원반 중심 반지름 절반 안쪽은 20% 미만. 가장자리 스침과 정면 가림은 다른 사건이다.
// 대조군: 임팩트를 끈 프레임 두 장(B, B2)을 같은 자로 잰다. 여기서 화소가 나오면 자가 고장난 것이다.
const EXE = process.env.LOCALAPPDATA + "/ms-playwright/chromium-1228/chrome-win64/chrome.exe";
const URL = "http://127.0.0.1:10310/web/index.html?preset=veteran&seed=" + (process.argv[2] || 7);
// 사건을 걸 프레임. 라운드가 열린 프레임에서 센다. 잠으로 세면 세계가 고정 폭으로 도는 동안
// 그날의 부하가 위상을 정하고, 공이 회차마다 다른 자리에 선다. 실측으로 세 회차의 공 화면
// 좌표가 403,517과 405,508과 595,441로 갈렸고 덮임이 32.0%에서 1.0%까지 흔들렸다.
const LEAD = 90;
const DIVE = 42;
/* 수명 위에서 잡을 자리. 예전에는 0.02를 처음 넘는 프레임이었고 그 자리는 폭발이 거의 안
   자란 그림이라 축이 떨어질 수가 없었다. 링과 베일은 u를 따라 커지므로 뒤로 갈수록 공을
   더 덮는다. 한 번의 폭발에서 여러 자리를 잡으려면 얼렸다 풀어야 하는데 그 왕복이 실시간
   1초쯤이라 그 사이에 수명이 끝난다. 그래서 한 사건에 한 자리만 잡고, 그 자리를 폭발이
   충분히 자란 0.45에 둔다. 여러 자리를 재려면 자리마다 사건을 새로 걸어야 한다. */
const U_POINTS = [0.45];
const W = 1280;
const H = 720;
const KINDS = ["save", "carriedIn", "gloveGone", "downed"];
const BAR_DISC = 0.35;
const BAR_CORE = 0.20;
const BAR_CONTROL = 0.02;
// 포스트가 384줄로 줄였다 늘리므로 한 화소가 약 1.9화소로 번진다. 그 계단까지 차이로 세면
// 아무것도 안 덮인 프레임에서도 테두리가 잡힌다. 채널 합 24는 그 계단 위, 이펙트 아래다.
const LUM = 24;
const t = setTimeout(() => { console.log("WATCHDOG"); process.exit(1); }, 220000);
t.unref();

/* 폭발이 수명 u의 어느 자리에 왔을 때 잡을지를 부르는 쪽이 정한다. 예전에는 0.02를 처음
   넘는 프레임에서 멈췄는데, 그 자리는 폭발이 가장 작을 때라 축이 떨어질 수가 없었다.
   링과 베일은 u를 따라 커지므로(0.46+0.72u, 0.5+0.95u) 공을 가장 많이 덮는 자리는 뒤쪽이다.
   가장 작은 자리만 재고 통과시키면 그 통과는 아무 말도 안 한다. 수명 위 세 자리를 잡아
   가장 나쁜 것으로 판정한다. */
const waitU = (target) => new Promise((res) => {
  const t0 = performance.now();
  const tick = () => {
    const s = window.__impactVis();
    if (s.life > 0 && s.u >= target) { window.__freeze(true); res(s); return; }
    if (performance.now() - t0 > 2500) { res(null); return; }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
});

// 공의 화면 반지름. 월드 반지름을 카메라 위쪽으로 밀어 투영한 거리다.
// 카메라가 내려다보므로 가로로 재면 원근이 섞인다.
const ballDisc = () => {
  const b = window.__ballPos();
  const R = 0.14;
  const c = window.__proj(b.x, b.y, b.z);
  const u = window.__proj(b.x, b.y + R, b.z);
  return { cx: c[0], cy: c[1], r: Math.hypot(u[0] - c[0], u[1] - c[1]), z: b.z };
};

async function discDiff([A, B, disc, lum]) {
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
  // 스크린샷 화소와 CSS 화소가 다를 수 있다. 원반도 같은 배율로 옮긴다.
  const s = a.width / window.innerWidth;
  const cx = disc.cx * s;
  const cy = disc.cy * s;
  const r = Math.max(2, disc.r * s);
  let all = 0, hitAll = 0, core = 0, hitCore = 0;
  const y0 = Math.max(0, Math.floor(cy - r));
  const y1 = Math.min(a.height - 1, Math.ceil(cy + r));
  const x0 = Math.max(0, Math.floor(cx - r));
  const x1 = Math.min(a.width - 1, Math.ceil(cx + r));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const d2 = (x - cx) * (x - cx) + (y - cy) * (y - cy);
      if (d2 > r * r) continue;
      const i = (y * a.width + x) * 4;
      const d = Math.abs(a.data[i] - b.data[i]) + Math.abs(a.data[i + 1] - b.data[i + 1]) + Math.abs(a.data[i + 2] - b.data[i + 2]);
      const on = d >= lum;
      all++; if (on) hitAll++;
      if (d2 <= r * r * 0.25) { core++; if (on) hitCore++; }
    }
  }
  return { all, hitAll, core, hitCore, r, cx, cy, onScreen: cx >= 0 && cx < a.width && cy >= 0 && cy < a.height };
}

let br;
let fail = 0;
try {
  br = await chromium.launch({ executablePath: EXE });
  /* 채취 시점은 폭발이 u 0.02를 처음 넘는 프레임이다. 세계시계가 실시간을 보면 한 프레임이
     밀어 올리는 u가 그날의 부하를 따라 달라지고, 문턱을 넘는 순간의 u가 회차마다 다른 자리에
     선다. 폭발은 그 사이에도 자라므로 늦게 잡힌 회차일수록 공을 더 덮는다. 실측으로 단독
     실행은 통과하고 쓸기 안에서는 같은 사건이 덮음 49.7%로 죽었다. 고정 폭 시계를 손잡이가
     생기는 즉시 켜면 한 프레임이 올리는 u가 상수가 되고, 문턱을 넘는 자리가 회차마다 같아진다. */
  const ctx = await br.newContext({ viewport: { width: W, height: H } });
  await ctx.addInitScript(() => {
    const t = setInterval(() => { if (window.__fixedStep) { window.__fixedStep(1 / 60); clearInterval(t); } }, 0);
  });
  const p = await ctx.newPage();
  const errs = [];
  p.on("pageerror", (e) => errs.push(String(e)));
  const cv = p.locator("#stage");
  const grab = async () => (await cv.screenshot({ type: "png" })).toString("base64");

  for (const kind of KINDS) {
    await p.goto(URL, { waitUntil: "load" });
    await p.waitForSelector("#go", { timeout: 15000 });
    await p.click("#go", { force: true });
    const base = await p.evaluate(() => window.__frames());
    const at = (n) => p.waitForFunction((m) => window.__frames() >= m, n, { timeout: 20000 });
    await at(base + LEAD);
    await p.keyboard.press("ArrowLeft");
    await at(base + LEAD + DIVE);
    await p.evaluate((k) => window.__act(k), kind);
    let worst = null;
    let a = null, b = null;
    for (const target of U_POINTS) {
      const live = await p.evaluate(waitU, target);
      if (!live) break;
      const disc = await p.evaluate(ballDisc);
      const shotA = await grab();
      await p.evaluate(() => window.__impactHide(true));
      await p.waitForTimeout(120);
      const shotB = await grab();
      await p.waitForTimeout(120);
      const shotB2 = await grab();
      await p.evaluate(() => window.__impactHide(false));
      const mm = await p.evaluate(discDiff, [shotA, shotB, disc, LUM]);
      const cc = await p.evaluate(discDiff, [shotB, shotB2, disc, LUM]);
      const row = { u: live.u, m: mm, ctrl: cc.all ? cc.hitAll / cc.all : 1 };
      row.cover = mm.all ? mm.hitAll / mm.all : 1;
      row.core = mm.core ? mm.hitCore / mm.core : 1;
      if (!worst || row.cover > worst.cover) { worst = row; a = shotA; b = shotB; }
      // 다음 자리를 보려면 세계를 다시 굴려야 한다. 얼린 채로 기다리면 u가 안 자란다.
      await p.evaluate(() => window.__freeze(false));
    }
    if (!worst) { console.log(kind + ": NO BURST"); fail++; continue; }
    const m = worst.m;
    const cover = worst.cover;
    const coreCover = worst.core;
    const ctrl = worst.ctrl;
    const bad = !m.onScreen || cover >= BAR_DISC || coreCover >= BAR_CORE || ctrl >= BAR_CONTROL;
    if (bad) fail++;
    console.log(
      kind + ": " + (bad ? "FAIL" : "ok") +
      " cover " + (cover * 100).toFixed(1) + "% (bar " + (BAR_DISC * 100) + ")" +
      " core " + (coreCover * 100).toFixed(1) + "% (bar " + (BAR_CORE * 100) + ")" +
      " control " + (ctrl * 100).toFixed(2) + "%" +
      " at u " + worst.u.toFixed(2) +
      " r " + m.r.toFixed(1) + "px at " + m.cx.toFixed(0) + "," + m.cy.toFixed(0) +
      " px " + m.all
    );
    if (bad) {
      writeFileSync("ballvis-" + kind + "-a.local.png", Buffer.from(a, "base64"));
      writeFileSync("ballvis-" + kind + "-b.local.png", Buffer.from(b, "base64"));
    }
  }
  if (errs.length) { console.log("ERRORS " + errs.length + ": " + errs[0]); fail++; }
  console.log(fail ? "BALLVIS FAIL " + fail : "BALLVIS PASS");
} finally {
  if (br) await br.close();
}
process.exit(fail ? 1 : 0);
