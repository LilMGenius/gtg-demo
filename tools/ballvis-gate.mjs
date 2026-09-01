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
const URL = "http://127.0.0.1:10310/web/index.html?seed=" + (process.argv[2] || 7);
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
  const ctx = await br.newContext({ viewport: { width: W, height: H } });
  const p = await ctx.newPage();
  const errs = [];
  p.on("pageerror", (e) => errs.push(String(e)));
  const cv = p.locator("#stage");
  const grab = async () => (await cv.screenshot({ type: "png" })).toString("base64");

  for (const kind of KINDS) {
    await p.goto(URL, { waitUntil: "load" });
    await p.waitForTimeout(1400);
    await p.click("#go", { force: true });
    await p.waitForTimeout(1500);
    await p.keyboard.press("ArrowLeft");
    await p.waitForTimeout(700);
    await p.evaluate((k) => window.__act(k), kind);
    const live = await p.evaluate(waitBurst);
    if (!live) { console.log(kind + ": NO BURST"); fail++; continue; }
    await p.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    const disc = await p.evaluate(ballDisc);
    const a = await grab();
    await p.evaluate(() => window.__impactHide(true));
    await p.waitForTimeout(120);
    const b = await grab();
    await p.waitForTimeout(120);
    const b2 = await grab();
    await p.evaluate(() => window.__impactHide(false));

    const m = await p.evaluate(discDiff, [a, b, disc, LUM]);
    const c = await p.evaluate(discDiff, [b, b2, disc, LUM]);
    const cover = m.all ? m.hitAll / m.all : 1;
    const coreCover = m.core ? m.hitCore / m.core : 1;
    const ctrl = c.all ? c.hitAll / c.all : 1;
    const bad = !m.onScreen || cover >= BAR_DISC || coreCover >= BAR_CORE || ctrl >= BAR_CONTROL;
    if (bad) fail++;
    console.log(
      kind + ": " + (bad ? "FAIL" : "ok") +
      " cover " + (cover * 100).toFixed(1) + "% (bar " + (BAR_DISC * 100) + ")" +
      " core " + (coreCover * 100).toFixed(1) + "% (bar " + (BAR_CORE * 100) + ")" +
      " control " + (ctrl * 100).toFixed(2) + "%" +
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
