import { chromium } from "playwright";

// 룩 계약 게이트. 파운더가 승인한 룩의 정체성 표지가 기본 주소의 경기 대기 장면에 그대로 서 있는지 잰다.
// 표지는 다섯이다. 기본 경로의 픽셀 패스, 툰 램프 재질의 몫, 캐릭터 외곽선 껍데기, 안개의 거리, 흙 질감의 명도 편차.
// 계약 값은 승인 기준 빌드 e674af7(버전 0.8.0)의 같은 장면에서 잰 값이다. 2026-09-25 15:38 파운더 판정이
// 그 빌드의 셰이더, 구름 배경, 머티리얼, 에셋, 모델링이 그 뒤 빌드보다 전부 낫다고 했다. 원문은 기록 레포
// docs/gtg/snapshots/prompts/PROMPT-20260925-003054.md, 부위별 A/B는 docs/gtg/ab/README.md가 갖는다.
// 표지를 바꾸는 것은 룩의 정체성을 바꾸는 것이라 브랜드 결정(HITL)이다. 계약 값을 고치는 커밋은 본문에 파운더 판정 파일을 인용한다.
// 이 게이트가 빨가면 게이트를 다시 읽을 일이 아니라 제품이 룩을 잃은 것이다. 측정을 기본 주소 밖(?pix=1 같은 스위치)으로
// 옮기는 수리는 룩 회귀를 가리는 수리라 금지하고, 아래 instrument 축이 그것을 잡는다.
// 표지 다섯은 파운더 판정이 짚은 층을 코드가 읽을 수 있는 양으로 옮긴 것이다. 블라인드 LLM 비평가 둘은 같은 A/B에서
// 뒤 빌드를 골랐으므로(기록 레포 docs/gtg/ab/README.md 블라인드 판정 절) 룩의 선후는 비평가가 아니라 이 계약이 지킨다.

const PORT = (process.argv.find((a) => a.startsWith("--port=")) || "--port=10310").slice(7);
const URL_DEFAULT = "http://127.0.0.1:" + PORT + "/web/index.html?seed=20&preset=rich,veteran";
const EXE = process.env.LOCALAPPDATA + "/ms-playwright/chromium-1228/chrome-win64/chrome.exe";
// 승인 빌드는 683x384 타깃에 그린 뒤 확대한다. 높이 384가 도트 한 칸의 크기를 정한다.
const RT_H = 384;
// 승인 빌드의 조명 받는 메시 67개 중 63개가 툰 램프를 쓴다(0.94). 새 메시가 몇 개 끼어도 넘도록 0.85로 둔다.
const TOON_SHARE_MIN = 0.85;
// 승인 빌드의 같은 장면에 어두운 뒷면 외곽선 껍데기가 23개다. 인물 수가 조금 달라져도 넘도록 8할인 18로 둔다.
const HULLS_MIN = 18;
// 외곽선 껍데기의 색은 거의 검정이다. 승인 빌드는 0x14100c(명도 약 0.06)를 쓴다. 0.1 아래를 외곽선으로 센다.
const HULL_LUMA_MAX = 0.1;
// 승인 빌드의 안개는 34에서 시작해 96에서 끝난다. 더 가까이 당기면 배경이 옅은 띠로 씻긴다. 더 먼 것은 허용한다.
const FOG_NEAR_MIN = 34;
const FOG_FAR_MIN = 96;
// 승인 빌드의 흙 질감(256x256)은 명도 표준편차가 18.3이고, 뒤 빌드의 무늬 없는 흙은 0이다. 약 4분의 3인 14를 바닥으로 둔다.
const GROUND_STD_MIN = 14;
// 개봉판과 첫 진입 연출이 걷히고 장면이 서는 데 필요한 대기. 다른 브라우저 게이트와 같은 값이다.
const SETTLE_MS = 1500;
const t = setTimeout(() => { console.log("WATCHDOG"); process.exit(1); }, 120000);
t.unref();

const fails = [], notes = [];
const check = (n, ok, d) => (ok ? notes : fails).push(n + " " + d);

// 장면을 읽는다. 재질 이름이 아니라 재질 종류와 램프와 뒷면과 색과 질감의 화소를 읽는다.
const read = () => {
  const root = window.__sceneRoot();
  const pix = window.__pixState ? window.__pixState() : null;
  const LIT = new Set(["MeshToonMaterial", "MeshLambertMaterial", "MeshStandardMaterial", "MeshPhysicalMaterial", "MeshPhongMaterial"]);
  let lit = 0, toon = 0, hulls = 0, ground = null;
  root.traverse((o) => {
    if (!o.isMesh || !o.visible) return;
    if (o.name === "ground") ground = o;
    const m = Array.isArray(o.material) ? o.material[0] : o.material;
    if (!m) return;
    if (LIT.has(m.type)) { lit += 1; if (m.gradientMap) toon += 1; }
    if (m.type === "MeshBasicMaterial" && m.side === 1 && m.color) {
      const c = m.color;
      if (0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b < window.__lookHullLuma) hulls += 1;
    }
  });
  let groundStd = null;
  const img = ground && ground.material && ground.material.map ? ground.material.map.image : null;
  if (img && img.width) {
    const cv = document.createElement("canvas");
    cv.width = img.width; cv.height = img.height;
    const g = cv.getContext("2d");
    g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, cv.width, cv.height).data;
    let s = 0, s2 = 0, n = 0;
    for (let i = 0; i < d.length; i += 4) { const l = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]; s += l; s2 += l * l; n += 1; }
    const mean = s / n;
    groundStd = Math.sqrt(Math.max(0, s2 / n - mean * mean));
  }
  return {
    pixOn: !!(pix && pix.on), rtH: pix && pix.rt ? pix.rt[1] : null,
    toonShare: lit ? toon / lit : 0, lit, toon, hulls,
    fog: root.fog ? { near: root.fog.near, far: root.fog.far } : null,
    groundStd
  };
};
const verdicts = (m) => ({
  pixel: m.pixOn && m.rtH === RT_H,
  toon: m.toonShare >= TOON_SHARE_MIN,
  hulls: m.hulls >= HULLS_MIN,
  fog: !!m.fog && m.fog.near >= FOG_NEAR_MIN && m.fog.far >= FOG_FAR_MIN,
  ground: m.groundStd !== null && m.groundStd >= GROUND_STD_MIN
});

async function boot(browser, url) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  await ctx.addInitScript((luma) => { window.__lookHullLuma = luma; }, HULL_LUMA_MAX);
  const p = await ctx.newPage();
  const errs = [];
  p.on("pageerror", (e) => errs.push(String(e)));
  await p.goto(url, { waitUntil: "load" });
  await p.evaluate(() => localStorage.clear());
  await p.goto(url, { waitUntil: "load" });
  await p.waitForSelector("#go", { timeout: 20000 });
  await p.waitForTimeout(1200);
  await p.click("#go", { force: true });
  await p.waitForTimeout(SETTLE_MS);
  await p.evaluate(() => window.__lockRound());
  return { ctx, p, errs };
}

let b;
try {
  b = await chromium.launch({ executablePath: EXE });
  // 계기 축. 룩은 플레이어가 받는 기본 주소에서만 잰다. 스위치를 붙인 주소는 룩 계약의 표본이 아니다.
  check("instrument:the-default-address-carries-no-look-switch", !new URL(URL_DEFAULT).searchParams.has("pix"), URL_DEFAULT);
  const { ctx, p, errs } = await boot(b, URL_DEFAULT);
  const m = await p.evaluate(read);
  const v = verdicts(m);
  console.log("MEASURED " + JSON.stringify(m));
  check("look:pixel-pass-is-the-default", v.pixel, "on=" + m.pixOn + " target height " + m.rtH + ", want on at " + RT_H);
  check("look:toon-ramp-carries-the-lit-meshes", v.toon, m.toon + "/" + m.lit + " = " + m.toonShare.toFixed(3) + ", want >= " + TOON_SHARE_MIN);
  check("look:characters-keep-outline-hulls", v.hulls, m.hulls + " hulls, want >= " + HULLS_MIN);
  check("look:fog-no-heavier-than-approved", v.fog, JSON.stringify(m.fog) + ", want near >= " + FOG_NEAR_MIN + " and far >= " + FOG_FAR_MIN);
  check("look:ground-texture-keeps-its-grain", v.ground, "luminance std " + (m.groundStd === null ? "none" : m.groundStd.toFixed(2)) + ", want >= " + GROUND_STD_MIN);

  // 심은 표본. 같은 판에서 표지 하나씩을 깎아 같은 자가 빨개지는지 본다. 깎은 뒤 되돌린다.
  const planted = await p.evaluate((read0) => {
    const read = new Function("return (" + read0 + ")")();
    const root = window.__sceneRoot();
    const out = {};
    const fog = root.fog ? { near: root.fog.near, far: root.fog.far } : null;
    if (root.fog) { root.fog.near = 26; root.fog.far = 60; }
    out.fog = read().fog;
    if (root.fog) { root.fog.near = fog.near; root.fog.far = fog.far; }
    const ramps = [];
    root.traverse((o) => { if (o.isMesh) { const ms = Array.isArray(o.material) ? o.material : [o.material]; for (const mm of ms) if (mm && mm.gradientMap) { ramps.push([mm, mm.gradientMap]); mm.gradientMap = null; } } });
    out.toonShare = read().toonShare;
    for (const [mm, g] of ramps) mm.gradientMap = g;
    const hidden = [];
    root.traverse((o) => { if (o.isMesh && o.visible) { const mm = Array.isArray(o.material) ? o.material[0] : o.material; if (mm && mm.type === "MeshBasicMaterial" && mm.side === 1) { hidden.push(o); o.visible = false; } } });
    out.hulls = read().hulls;
    for (const o of hidden) o.visible = true;
    let ground = null; root.traverse((o) => { if (o.isMesh && o.name === "ground") ground = o; });
    if (ground && ground.material.map) {
      const img = ground.material.map.image;
      const flat = document.createElement("canvas"); flat.width = 4; flat.height = 4;
      const g = flat.getContext("2d"); g.fillStyle = "#b08a5a"; g.fillRect(0, 0, 4, 4);
      ground.material.map.image = flat;
      out.groundStd = read().groundStd;
      ground.material.map.image = img;
    }
    out.restored = read();
    return out;
  }, read.toString());
  check("control:closer-fog-reddens-the-fog-axis", !(planted.fog && planted.fog.near >= FOG_NEAR_MIN && planted.fog.far >= FOG_FAR_MIN), JSON.stringify(planted.fog));
  check("control:stripped-ramps-redden-the-toon-axis", planted.toonShare < TOON_SHARE_MIN, String(planted.toonShare));
  check("control:hidden-hulls-redden-the-outline-axis", planted.hulls < HULLS_MIN, String(planted.hulls));
  check("control:a-flat-ground-reddens-the-grain-axis", planted.groundStd !== undefined && planted.groundStd < GROUND_STD_MIN, String(planted.groundStd));
  check("control:the-plants-were-put-back", JSON.stringify(planted.restored) === JSON.stringify(m), JSON.stringify(planted.restored));
  check("console:no-errors", errs.length === 0, errs.slice(0, 2).join(" | ") || "clean");
  await ctx.close();

  // 스위치를 끈 주소는 픽셀 축을 빨갛게 해야 한다. 같은 자가 기본 경로와 스위치 경로를 가르는지 보는 대조다.
  const off = await boot(b, URL_DEFAULT + "&pix=0");
  const mOff = await off.p.evaluate(read);
  check("control:the-switched-off-address-reddens-the-pixel-axis", !verdicts(mOff).pixel, "on=" + mOff.pixOn + " height " + mOff.rtH);
  await off.ctx.close();
} catch (e) {
  fails.push("exception " + String(e.message || e).split("\n")[0]);
} finally {
  if (b) await b.close();
}
const LINE = String.fromCharCode(10);
if (notes.length) console.log(notes.map((x) => "  ok   " + x).join(LINE));
if (fails.length) console.log(fails.map((x) => "  FAIL " + x).join(LINE));
console.log(fails.length ? "look FAIL " + fails.length : "look PASS " + notes.length);
process.exit(fails.length ? 1 : 0);
