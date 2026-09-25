import { chromium } from "playwright";
import fs from "node:fs";

// 같은 상태 A/B 캡처 드라이버. 화면 층을 건드린 랩은 승인된 빌드와 후보 빌드를 이 드라이버로 같은 장면에서 찍어
// 부위별로 나란히 놓는다. 결함 하나를 닫았다는 판정은 전체가 기준선에서 지지 않았다는 판정을 대신하지 못한다.
// 룩의 정체성 표지는 look 게이트가 계약으로 재고, 이 드라이버는 사람과 비평가가 볼 판을 굽는다.
//
// 빌드마다 git archive로 풀어 정적 서버를 띄운다. 예:
//   git archive --format=tar -o v08.tar e674af7 && tar -xf v08.tar -C <dir>
//   (dir에서) node <이 레포>/tools/serve.mjs 10411
//   node tools/ab-capture.mjs --label=v08 --port=10411 --out=.omo/ab/v08
// 두 빌드를 같은 씨드, 같은 프리셋, 같은 고정 시간 간격, 같은 프레임의 사건, 같은 화면 크기로 찍는다.
// 결과는 장면 이름의 JPEG와 capture.json(장면별 렌더 정보와 재질 분포)이다.
const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith("--" + k + "=")); return a ? a.slice(k.length + 3) : d; };
const label = arg("label", "head");
const port = arg("port", "10310");
const outDir = arg("out", ".omo/ab/" + label);
const only = arg("only", "");
const BASE = "http://127.0.0.1:" + port + "/web/index.html";
// 씨드 20과 두 프리셋은 기존 브라우저 게이트의 기준 판이다. rich는 상점의 값을, veteran은 개봉판 없는 첫 화면을 준다.
const Q = "?seed=20&preset=rich,veteran";
const EXE = process.env.LOCALAPPDATA + "/ms-playwright/chromium-1228/chrome-win64/chrome.exe";
// 사건 캡처의 프레임 약속은 facevis 게이트와 같다. 킥 준비 90프레임, 다이빙까지 42프레임, 사건 뒤 31프레임.
const LEAD = 90, DIVE = 42, TAIL = 31;
fs.mkdirSync(outDir, { recursive: true });
const wd = setTimeout(() => { console.log("WATCHDOG"); process.exit(1); }, 20 * 60 * 1000);
wd.unref();

const log = [];
const browser = await chromium.launch({ executablePath: EXE });

async function page(w, h) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  // 고정 폭 시계를 손잡이가 생기는 즉시 켠다(clock.mjs와 같은 방식). 두 빌드가 같은 세계시각을 걷는다.
  await ctx.addInitScript((s) => { const t = setInterval(() => { if (window.__fixedStep) { window.__fixedStep(s); clearInterval(t); } }, 0); }, 1 / 60);
  const p = await ctx.newPage();
  const errs = [];
  p.on("pageerror", (e) => errs.push(String(e.message || e)));
  return { ctx, p, errs };
}
async function boot(p, go) {
  await p.goto(BASE + Q, { waitUntil: "load" });
  await p.evaluate(() => localStorage.clear());
  await p.goto(BASE + Q, { waitUntil: "load" });
  await p.waitForSelector("#go", { timeout: 20000 });
  await p.waitForTimeout(1200);
  if (go) { await p.click("#go", { force: true }); await p.waitForTimeout(300); }
}
const frames = (p) => p.evaluate(() => window.__frames());
const until = (p, f) => p.waitForFunction((m) => window.__frames() >= m, f, { timeout: 30000 });
async function metrics(p) {
  return p.evaluate(() => {
    const out = { info: window.__renderInfo ? window.__renderInfo() : null, mats: {}, meshes: 0 };
    const root = window.__sceneRoot ? window.__sceneRoot() : null;
    if (root && root.traverse) root.traverse((o) => {
      if (!o.isMesh || !o.visible) return;
      out.meshes += 1;
      const ms = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of ms) if (m) out.mats[m.type] = (out.mats[m.type] || 0) + 1;
    });
    return out;
  });
}
async function shot(p, id, extra) {
  const file = outDir + "/" + id + ".jpg";
  // 렌더된 3D 장면이라 JPEG이다. 같은 장면의 PNG는 스무 배 무겁다.
  await p.screenshot({ path: file, type: "jpeg", quality: 90 });
  log.push({ id, file, ...extra });
  console.log(label, id, "ok");
}

// 장면은 한 판이 흐르는 순서, 사건, 상점, 메뉴 순이다.
const scenes = [];
const add = (id, w, h, run) => scenes.push({ id, w, h, run });
add("title", 1280, 720, async (p) => { await boot(p, false); await p.waitForTimeout(800); await shot(p, "title"); });
for (const [id, w, h] of [["pitch-idle", 1280, 720], ["pitch-idle-844", 844, 390]]) add(id, w, h, async (p) => {
  await boot(p, true);
  const target = await p.evaluate(() => { window.__lockRound(); if (window.__swayPin) window.__swayPin(0); const f = window.__frames(); window.__plan(f + 1, "", f + 90); return f + 90; });
  await until(p, target); await p.waitForTimeout(150);
  await shot(p, id, { metrics: await metrics(p) });
});
add("kick", 1280, 720, async (p) => {
  await boot(p, true); const base = await frames(p);
  const stopAt = base + LEAD + DIVE - 4;
  await p.evaluate((s) => window.__plan(0, "", s), stopAt);
  await until(p, base + LEAD); await p.keyboard.press("ArrowLeft");
  await until(p, stopAt); await p.waitForTimeout(150); await shot(p, "kick");
});
for (const [kind, off, id] of [["save", 12, "save-mid"], ["save", TAIL, "save"], ["catch", TAIL, "catch"], ["gloveGone", TAIL, "glove-gone"], ["downed", TAIL, "downed"], ["beat", TAIL, "goal-beat"], ["talked", TAIL, "talked"], ["distracted", TAIL, "distracted"]]) add(id, 1280, 720, async (p) => {
  await boot(p, true); const base = await frames(p);
  await until(p, base + LEAD); await p.keyboard.press("ArrowLeft");
  const actAt = base + LEAD + DIVE;
  await p.evaluate(([a, k, s]) => window.__plan(a, k, s), [actAt, kind, actAt + off]);
  await until(p, actAt + off); await p.waitForTimeout(150); await shot(p, id);
});
for (const [w, h, suffix, tabs] of [[1280, 720, "", null], [844, 390, "-844", ["pull", "glove", "hair"]]]) add("shop" + suffix, w, h, async (p) => {
  await boot(p, true); await p.waitForTimeout(1200);
  await p.evaluate(() => window.__shop(true)); await p.waitForTimeout(600);
  const all = await p.$$eval("#shop .tab", (ts) => ts.map((t) => t.dataset.tab));
  for (const t of tabs || all) {
    if (!all.includes(t)) continue;
    await p.evaluate((k) => document.querySelector("#shop .tab[data-tab=\"" + k + "\"]").click(), t);
    await p.waitForTimeout(700);
    await shot(p, "shop-" + t + suffix);
  }
});
for (const [id, w, h] of [["me", 1280, 720], ["gym", 1280, 720], ["roster", 1280, 720], ["gram", 1280, 720], ["wiki", 1280, 720], ["me-844", 844, 390]]) add(id, w, h, async (p) => {
  await boot(p, true); await p.waitForTimeout(1200);
  await p.evaluate((n) => { const f = window["__" + n]; if (typeof f === "function") f(true); }, id.replace("-844", ""));
  await p.waitForTimeout(900); await shot(p, id);
});

try {
  for (const s of scenes) {
    if (only && !only.split(",").includes(s.id)) continue;
    const { ctx, p, errs } = await page(s.w, s.h);
    try { await s.run(p); }
    catch (e) { const m = String(e.message || e).split("\n")[0]; console.log(label, s.id, "ERR", m); log.push({ id: s.id, error: m }); }
    if (errs.length) log.push({ id: s.id, pageErrors: errs.slice(0, 3) });
    await ctx.close();
  }
} finally {
  await browser.close();
}
fs.writeFileSync(outDir + "/capture.json", JSON.stringify({ label, port, at: new Date().toISOString(), log }, null, 2));
console.log(label, "done", log.length);
