import { chromium } from "playwright";

// 공을 눈이 붙잡을 수 있는지 재는 자. 화소가 있느냐(shot-gate)와 읽히느냐는 다른 주장이다.
// 원칙: 실루엣 경계가 바로 옆 배경 잡음보다 강해야 눈이 그것을 하나의 물체로 뽑아낸다.
// 그물 격자가 만드는 엣지가 공 외곽선만큼 세면 공은 격자의 한 칸이 된다.
// 절차: 공이 멈춘 순간에만 찍는다. 움직이는 공을 찍으면 좌표를 읽은 시각과 화소가 어긋난다.
// 바: 실루엣 링의 엣지 중앙값 > 인근 배경 엣지 95퍼센타일.
// 대조군: 공이 없는 자리에 같은 자를 대면 링이 배경 수준으로 붕괴해야 한다. 통과하면 자가 고장난 것이다.
const EXE = process.env.LOCALAPPDATA + "/ms-playwright/chromium-1228/chrome-win64/chrome.exe";
const SEED = process.argv[2] || 7;
const URL = "http://127.0.0.1:10310/web/index.html?seed=" + SEED;
const W = 1280;
const H = 720;
const ROUNDS = 8;
const BALL_R = 0.14;
const CTRL_DX = 170;
const t = setTimeout(() => { console.log("WATCHDOG"); process.exit(1); }, 150000);
t.unref();

// 페이지 안에서 공의 화면 좌표와 화면 반지름을 구한다.
// 반지름은 상수로 넣지 않는다. 거리에 따라 변하고, 틀린 반지름은 실루엣이 아닌 속을 재게 만든다.
function ballScreen([w, h, r]) {
  const c = window.__ballProbe.sample();
  if (!c || !c.ndc) return null;
  const p = window.__ballPos();
  const o = window.__ballProbe.probeAt(p.x + r, p.y, p.z);
  const rad = Math.hypot(o.ndc[0] - c.ndc[0], o.ndc[1] - c.ndc[1]);
  const px = (c.ndc[0] * 0.5 + 0.5) * w;
  const py = (-c.ndc[1] * 0.5 + 0.5) * h;
  return { world: p, x: px, y: py, r: Math.max(2, rad * 0.5 * w), onScreen: c.onScreen, visible: c.visible };
}

// 배경의 임자를 링 바깥에서 되묻는다. 다른 재질끼리 견주면 밝기 차를 판독성 차로 읽는다.
function bgOwner([x, y, r, w, h]) {
  const cnt = {};
  for (let i = 0; i < 12; i += 1) {
    const a = (i / 12) * Math.PI * 2;
    const sx = x + Math.cos(a) * r * 3.2;
    const sy = y + Math.sin(a) * r * 3.2;
    const p = window.__pick((sx / w) * 2 - 1, -((sy / h) * 2 - 1));
    const n = p ? p.name : "sky";
    cnt[n] = (cnt[n] || 0) + 1;
  }
  return Object.entries(cnt).sort((a, b) => b[1] - a[1])[0][0];
}

// 한 컷에서 링과 배경을 같은 엣지 연산으로 잰다.
// 링: 각도마다 반지름을 훑어 최대값을 취한다. 반지름이 조금 틀려도 실루엣을 놓치지 않는다.
// 배경: 링 바깥 고리에서 95퍼센타일. 평균을 쓰면 격자의 가장 센 줄이 숨는다.
async function measure([b64, spots]) {
  const im = new Image();
  im.src = "data:image/png;base64," + b64;
  await im.decode();
  const cv = document.createElement("canvas");
  cv.width = im.width; cv.height = im.height;
  cv.getContext("2d").drawImage(im, 0, 0);
  const g = cv.getContext("2d").getImageData(0, 0, im.width, im.height);
  const d = g.data;
  const L = (i) => 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
  const edge = (x, y) => {
    const px = Math.round(x), py = Math.round(y);
    if (px < 4 || py < 4 || px >= g.width - 4 || py >= g.height - 4) return null;
    const i = (py * g.width + px) * 4;
    const a = L(i);
    return Math.abs(a - L(i + 12)) + Math.abs(a - L(i + g.width * 12));
  };
  const pct = (v, q) => {
    if (!v.length) return 0;
    const s = v.slice().sort((p, r) => p - r);
    return s[Math.min(s.length - 1, Math.floor(q * s.length))];
  };
  const ring = (cx, cy, r) => {
    const v = [];
    for (let k = 0; k < 64; k += 1) {
      const a = (k / 64) * Math.PI * 2;
      let best = null;
      for (let dr = -3; dr <= 3; dr += 1) {
        const e = edge(cx + Math.cos(a) * (r + dr), cy + Math.sin(a) * (r + dr));
        if (e !== null && (best === null || e > best)) best = e;
      }
      if (best !== null) v.push(best);
    }
    return { med: pct(v, 0.5), n: v.length };
  };
  const around = (cx, cy, r) => {
    const v = [];
    for (let k = 0; k < 160; k += 1) {
      const a = (k / 160) * Math.PI * 2;
      for (let dr = 8; dr <= 22; dr += 2) {
        const e = edge(cx + Math.cos(a) * (r + dr), cy + Math.sin(a) * (r + dr));
        if (e !== null) v.push(e);
      }
    }
    return { p95: pct(v, 0.95), med: pct(v, 0.5), n: v.length };
  };
  return spots.map((s) => ({ ring: ring(s.x, s.y, s.r), bg: around(s.x, s.y, s.r) }));
}

const median = (a) => {
  const s = a.slice().sort((p, q) => p - q);
  return s.length ? s[s.length >> 1] : 0;
};

let br;
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

  const samples = [];
  for (let i = 0; i < ROUNDS; i += 1) {
    await p.keyboard.press(i % 2 ? "ArrowRight" : "ArrowLeft");
    await p.waitForTimeout(3000);

    // 멈춘 것을 확인하고 찍는다. 움직이는 중이면 이 라운드를 버린다.
    const a = await p.evaluate(ballScreen, [W, H, BALL_R]);
    await p.waitForTimeout(120);
    const b = await p.evaluate(ballScreen, [W, H, BALL_R]);
    if (!a || !b) continue;
    const drift = Math.hypot(b.x - a.x, b.y - a.y);
    if (drift > 1.5 || !b.visible) { console.log("skip round " + i + " drift=" + drift.toFixed(2) + " vis=" + b.visible); continue; }

    const owner = await p.evaluate(bgOwner, [b.x, b.y, b.r, W, H]);
    const side = b.x > W / 2 ? -1 : 1;
    const ctrl = { x: b.x + side * CTRL_DX, y: b.y, r: b.r };
    const shot = (await p.screenshot()).toString("base64");
    const [real, fake] = await p.evaluate(measure, [shot, [{ x: b.x, y: b.y, r: b.r }, ctrl]]);
    samples.push({ i, owner, x: b.x, y: b.y, r: b.r, z: b.world.z, real, fake });
    console.log("round " + i + " bg=" + owner + " r=" + b.r.toFixed(1) + "px z=" + b.world.z.toFixed(2)
      + "  ring=" + real.ring.med.toFixed(2) + " bgP95=" + real.bg.p95.toFixed(2)
      + "  ctrl ring=" + fake.ring.med.toFixed(2) + " bgP95=" + fake.bg.p95.toFixed(2));
  }

  if (!samples.length) {
    console.log("read FAIL no static sample");
    process.exitCode = 1;
  } else {
    // 배경이 같은 것끼리만 모은다. 가장 표본이 많은 배경이 이 격차의 주어다.
    const buckets = {};
    for (const s of samples) (buckets[s.owner] = buckets[s.owner] || []).push(s);
    const main = Object.entries(buckets).sort((a, b) => b[1].length - a[1].length)[0];
    for (const [k, v] of Object.entries(buckets)) console.log("bucket " + k + " n=" + v.length);
    const set = main[1];
    const ringMed = median(set.map((s) => s.real.ring.med));
    const bgP95 = median(set.map((s) => s.real.bg.p95));
    const cRing = median(set.map((s) => s.fake.ring.med));
    const cBg = median(set.map((s) => s.fake.bg.p95));
    console.log("TARGET bg=" + main[0] + " n=" + set.length);
    console.log("CONTROL ring=" + cRing.toFixed(2) + " vs bgP95=" + cBg.toFixed(2)
      + "  (ring must NOT exceed)  " + (cRing > cBg ? "INSTRUMENT BROKEN" : "ok"));
    console.log("BALL    ring=" + ringMed.toFixed(2) + " vs bgP95=" + bgP95.toFixed(2)
      + "  ratio=" + (bgP95 ? ringMed / bgP95 : 0).toFixed(2));
    console.log("errors " + (errs.slice(0, 2).join(" | ") || "clean"));
    const ok = cRing <= cBg && ringMed > bgP95 && errs.length === 0;
    console.log(ok ? "read PASS" : "read FAIL");
    if (!ok) process.exitCode = 1;
  }
} finally {
  clearTimeout(t);
  if (br) await br.close();
}

