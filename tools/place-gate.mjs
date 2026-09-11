/* 동네와 행인과 문신을 재는 자. 선언을 안 읽는다. 찍힌 화소와 화면에 선 몸만 읽는다.

   동네. 경기 화면 중앙 띠(세로 30~60%)의 화소 차이로 잰다. 그 띠만 보는 이유는 하늘과 밟는
   면이 이미 등급마다 다른 색이기 때문이다. 실측으로 지평선 아래 첫 바닥 행이 y 160(22%)이고
   골대 윗변이 y 350(49%)이라, 30~60%는 하늘을 안 물고 골문 안쪽 바닥만 문다.
   그래도 색이 남으므로 재기 전에 팔레트를 한 벌로 눕힌다. 하늘과 안개와 밟는 면과 철망을
   네 동네에서 같은 색으로 칠하고, 지평선 높이 배율도 1로 되돌리고, 행인은 감춘다.
   행인 수는 등급이 정하는 다른 축이라 같이 세면 이 자가 재는 것이 땅인지 사람인지 안 갈린다.
   그렇게 눕히고 남는 차이는 그 자리에 선 물건의 차이뿐이다. 색을 갈아 봐야 안 늘어난다는 것은
   --was가 부모 판에서 같은 절차를 밟아 증명한다.

   행인. 실루엣 높이/폭 비다. 화면 화소로 재되 경기 카메라가 아니라 정사 투영으로 잰다.
   원근으로 재면 같은 몸이 앞줄에서 크고 뒷줄에서 작아 비가 자리의 함수가 된다.
   자가 비를 잰다는 주장은 답을 아는 상자 둘(0.4x1.6, 0.8x0.8)이 같은 자를 지나 4.0과 1.0을
   낼 때만 선다. 화면에 실제로 선 행인과 이 격리 측정이 같은 몸인지는 아래 arena 축이 되묻는다.

   문신. 상점 잉크 칸이 굽는 팔 확대 한 장의 화소 분산이다. 겨냥이 등급마다 같으므로 같은 자리를
   재고, 몸통 화소는 등급이 안 바꾸니 분산이 움직였다면 그것은 팔이 움직인 것이다.
   대조군 둘. 0등급(맨살)이 아래에 있어야 하고, 고리 방식(부모 판)보다 위에 있어야 한다.

   진행은 벽시계가 아니라 프레임이다. 시계를 고정 폭으로 못 박고 판을 잠근 뒤 __plan으로
   멈출 프레임을 페이지에 맡긴다. 그러면 회차마다 같은 프레임이 언다(toon-gate와 같은 이유).

   표본 범위: 동네 4 x 페르소나 4. 동네는 경기 화면 넷의 여섯 쌍, 페르소나는 화면에 선 행인
   열하나를 종류로 묶은 넷의 여섯 쌍, 문신은 등급 넷(0등급이 대조군)이다. 1280x720, seed 20. */
import { chromium } from "playwright";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { pinClock } from "./clock.mjs";
import { personaKindAt, passerCountAt, passerAt } from "../web/src/state/passer.mjs";
import { clearDraw } from "./draw.mjs";

const ROOT = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const EXE = process.env.LOCALAPPDATA + "/ms-playwright/chromium-1228/chrome-win64/chrome.exe";
// vary는 꼬리 연출의 회차 편차다. 켜 두면 같은 사건이 회차마다 다른 몸이 된다.
const BASE = "http://127.0.0.1:10310/web/index.html?seed=20&vary=0";
const W = 1280;
const H = 720;
const STEP = 1 / 60;
/* 세계를 멈출 절대 프레임. 프레임 수가 곧 세계시간이므로 이 수가 정지 프레임의 세계시각을
   못 박는다. 상대로 걸면 그 지금이 개봉 카드가 몇 프레임에 눌렸는지를 따라 회차마다 달라진다.
   실측: 카드 두 마디를 지나는 프레임이 150 언저리라 240은 1.5초 여유다. */
const ANCHOR = 240;
const TOWNS = [0, 1, 2, 3];
const GRADES = [0, 1, 2, 3];
// 페르소나 넷을 대표하는 번호. passer.mjs가 번호에 몸을 붙이므로 0~3이 넷을 한 번씩 덮는다.
const REPR = [0, 1, 2, 3];

/* 되돌릴 판. HEAD로 걸면 이 게이트를 담은 커밋이 들어오는 순간 대조군이 자기 자신을 자기와
   맞대고 조용히 초록이 된다. 그래서 판을 못 박는다. --was=<rev>로 덮어쓸 수 있고, 어느 rev든
   살아 있는 파일과 같으면 아래에서 계측 사망으로 끊는다. --live-only는 고치는 동안만 쓰는
   갈래라 마지막 줄에 이름이 남는다. 대조군 없는 초록은 초록이 아니다. */
/* 13de5f5는 이 일이 얹히는 바로 앞 판이다. 454fa8d부터 여기까지는 게이트만 고친 커밋 셋이고,
   아래 LAYER 세 파일은 그 구간에서 바이트가 같다(실측: git diff 454fa8d 13de5f5 -- 세 경로가 빈 출력).
   그래서 어느 쪽에 못 박아도 대조군 수치는 같고, 앞 판을 가리키는 쪽이 다음 랩에서 안 헷갈린다. */
const WAS_REV = (process.argv.find((a) => a.startsWith("--was=")) || "--was=13de5f5").slice(6);
const LIVE_ONLY = process.argv.includes("--live-only");
const SHOTS = process.argv.includes("--shots");
const LAYER = ["web/src/render/objects/pitch.mjs", "web/src/render/objects/actors.mjs",
  "web/src/render/texture.mjs"];

// 중앙 띠. 화면 세로의 30에서 60퍼센트다.
const BAND_Y0 = 0.3;
const BAND_Y1 = 0.6;
// 동네 둘이 이 띠에서 달라야 하는 몫. 계획이 준 바다.
const BAND_MIN = 0.15;
// 두 화소가 다르다고 할 최소 채널 차이. skin 게이트가 같은 이유로 쓰는 값이다.
const PIX_TOL = 12;
// 팔레트를 눕힐 한 벌. 흙색을 고른 이유는 세울 물건이 대부분 회색과 초록이라 대비가 남기 때문이다.
const FLAT_SKY = 0x86aecb;
const FLAT_HAZE = 0x9dbdd4;
const FLAT_GROUND = 0x9c7a4a;
const FLAT_FENCE = 0x3f6b4a;
// 실루엣 비가 페르소나끼리 벌어져야 하는 몫. 계획이 준 바다.
const RATIO_MIN = 0.08;
// 격리 렌더의 판. 가로 1.8m를 256화소로, 세로 3.6m를 512화소로 잡아 두 축의 미터/화소가 같다.
// 같아야 화소로 잰 비가 곧 미터로 잰 비가 된다.
const RIG_W = 256;
const RIG_H = 512;
// 문신 팔 표본의 하한. 이보다 적으면 재는 것이 팔이 아니라 점 몇 개다.
// 실측: 위팔 상자 안에서 불투명한 화소가 등급마다 8000대였다.
const INK_MIN = 2000;

const t = setTimeout(() => { console.log("WATCHDOG"); process.exit(1); }, 260000);
t.unref();

const rows = [];
const notes = [];
const say = (name, pass, detail) => rows.push([pass, name, detail]);
const pc = (v) => (v * 100).toFixed(1) + "%";

// 아래 넷은 페이지 안에서 돈다. 화소 접근은 브라우저가, 판정은 노드가 한다.
function levelPalette([sky, haze, ground, fence]) {
  const s = window.__sceneRoot();
  s.background.setHex(sky);
  if (s.fog) s.fog.color.setHex(haze);
  let painted = 0;
  s.traverse((o) => {
    if (!o.material || !o.material.color) return;
    if (o.isLineSegments) { o.material.color.setHex(fence); painted += 1; return; }
    if (o.name === "ground" || o.name === "box") { o.material.color.setHex(ground); painted += 1; }
  });
  let hidden = 0;
  for (const c of s.children) {
    if (c.name === "skyline" || c.name === "skyline-back") c.scale.y = 1;
    if (c.userData.sub === "passers" || c.userData.sub === "shadow") { c.visible = false; hidden += 1; }
  }
  return { painted, hidden };
}

async function bandDiff([X, Y, y0, y1, tol]) {
  const read = async (b) => {
    const im = new Image();
    im.src = "data:image/png;base64," + b;
    await im.decode();
    const cv = document.createElement("canvas");
    cv.width = im.width;
    cv.height = im.height;
    cv.getContext("2d").drawImage(im, 0, 0);
    return cv.getContext("2d").getImageData(0, 0, im.width, im.height);
  };
  const a = await read(X);
  const b = await read(Y);
  const r0 = Math.round(a.height * y0);
  const r1 = Math.round(a.height * y1);
  let n = 0;
  let total = 0;
  for (let y = r0; y < r1; y += 1) {
    for (let x = 0; x < a.width; x += 1) {
      const i = (y * a.width + x) * 4;
      total += 1;
      const d = Math.max(Math.abs(a.data[i] - b.data[i]), Math.abs(a.data[i + 1] - b.data[i + 1]),
        Math.abs(a.data[i + 2] - b.data[i + 2]));
      if (d > tol) n += 1;
    }
  }
  return { n, total, pct: total ? n / total : 0, rows: [r0, r1] };
}

async function personaRig([idx, rw, rh]) {
  const T = await import("/web/vendor/three.module.min.js");
  const P = await import("/web/src/render/objects/pitch.mjs");
  const cv = document.createElement("canvas");
  cv.width = rw;
  cv.height = rh;
  const R = new T.WebGLRenderer({ canvas: cv, alpha: true, antialias: false, preserveDrawingBuffer: true });
  R.setSize(rw, rh, false);
  const sc = new T.Scene();
  sc.add(new T.HemisphereLight(0xffffff, 0x888888, 1.4));
  const hold = new T.Group();
  sc.add(hold);
  const who = P.buildPassers(hold, 11);
  for (const g of who) { g.position.set(0, 0, 0); g.visible = false; }
  // 답을 아는 상자 둘. 자가 비를 잰다는 주장이 여기서 먼저 서야 아래 수가 뜻을 갖는다.
  const ctl = [];
  for (const [bw, bh] of [[0.4, 1.6], [0.8, 0.8]]) {
    const m = new T.Mesh(new T.BoxGeometry(bw, bh, 0.3), new T.MeshBasicMaterial({ color: 0x101010 }));
    m.position.y = bh / 2;
    m.visible = false;
    hold.add(m);
    ctl.push(m);
  }
  // 경기 카메라는 골대 뒤 z -8에서 +z를 본다. 행인은 z 27 너머라 화면에 서는 것은 그 뒷모습이다.
  // 같은 면을 봐야 이 자가 재는 실루엣이 화면에 선 실루엣이 된다.
  const cam = new T.OrthographicCamera(-0.9, 0.9, 3.5, -0.1, 0.1, 40);
  cam.position.set(0, 0, -6);
  cam.lookAt(0, 0, 0);
  const flat = document.createElement("canvas");
  flat.width = rw;
  flat.height = rh;
  const fc = flat.getContext("2d");
  const measure = (o) => {
    o.visible = true;
    R.render(sc, cam);
    o.visible = false;
    fc.clearRect(0, 0, rw, rh);
    fc.drawImage(cv, 0, 0);
    const d = fc.getImageData(0, 0, rw, rh).data;
    let x0 = rw;
    let x1 = -1;
    let y0 = rh;
    let y1 = -1;
    let on = 0;
    for (let y = 0; y < rh; y += 1) {
      for (let x = 0; x < rw; x += 1) {
        if (d[(y * rw + x) * 4 + 3] < 16) continue;
        on += 1;
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
    const bw = x1 - x0 + 1;
    const bh = y1 - y0 + 1;
    return { on, w: bw, h: bh, ratio: bw > 0 ? bh / bw : 0 };
  };
  const out = { people: [], control: [] };
  for (const i of idx) out.people.push(Object.assign({ i }, measure(who[i])));
  for (const m of ctl) out.control.push(measure(m));
  R.dispose();
  R.forceContextLoss();
  return out;
}

/* 잉크 등급마다 팔 한 장을 굽고 위팔 상자 안의 화소만 잰다. 온 프레임을 재면 몸통과 장갑과
   빈 배경이 같이 들어와 팔에서 일어난 일이 그 넓이에 묻힌다. 실측: 온 프레임 분산이 0등급
   1145와 2등급 1159로 1퍼센트만 움직였다. 상자는 thumb.armBox가 그림 몫으로 돌려준다.
   부모 판에는 armBox가 없다. 없으면 그 회차는 상자를 못 받은 것이고, 조용히 온 프레임으로
   물러나는 대신 없다고 적어 위에서 계측 사망으로 끊는다. */
async function inkStats([grades, minA]) {
  const G = await import("/web/src/state/gear.mjs");
  const TH = await import("/web/src/render/thumb.mjs");
  if (!TH.armBox) return null;
  const out = [];
  for (const g of grades) {
    const look = G.lookOf({ ink: g }, undefined);
    const box = TH.armBox("ink", { height: 188, weight: 84 }, look);
    const im = new Image();
    im.src = box.url;
    await im.decode();
    const cv = document.createElement("canvas");
    cv.width = im.width;
    cv.height = im.height;
    const c = cv.getContext("2d");
    c.drawImage(im, 0, 0);
    const d = c.getImageData(0, 0, im.width, im.height).data;
    const x0 = Math.max(0, Math.floor(box.x0 * im.width));
    const x1 = Math.min(im.width, Math.ceil(box.x1 * im.width));
    const y0 = Math.max(0, Math.floor(box.y0 * im.height));
    const y1 = Math.min(im.height, Math.ceil(box.y1 * im.height));
    let n = 0;
    let s1 = 0;
    let s2 = 0;
    for (let y = y0; y < y1; y += 1) {
      for (let x = x0; x < x1; x += 1) {
        const i = (y * im.width + x) * 4;
        if (d[i + 3] < minA) continue;
        const l = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
        n += 1;
        s1 += l;
        s2 += l * l;
      }
    }
    const mean = n ? s1 / n : 0;
    out.push({ grade: g, n, mean, v: n ? s2 / n - mean * mean : 0,
      box: [x0, y0, x1 - x0, y1 - y0], parts: box.parts });
  }
  return out;
}

async function arenaPassers() {
  const T = await import("/web/vendor/three.module.min.js");
  const s = window.__sceneRoot();
  const out = [];
  for (const c of s.children) {
    if (c.userData.sub !== "passers") continue;
    c.updateMatrixWorld(true);
    const b = new T.Box3().setFromObject(c);
    out.push({ persona: c.userData.persona || null, w: b.max.x - b.min.x, h: b.max.y - b.min.y });
  }
  return out;
}

/* 부모 판을 라우트에 실어 둔다. 되돌린 파일이 살아 있는 파일과 같으면 대조군이 no-op이다.
   그 판정은 아래에서 빌림 줄을 붙이기 전의 바이트로 한다. 붙인 뒤로 재면 어떤 파일이든 항상
   달라 보여서 이 끊는 자리가 조용히 무너진다.

   빌림 줄이 필요한 이유. 라우트는 아래 세 파일만 되돌리고 나머지는 살아 있는 판이 그대로 선다.
   그래서 살아 있는 scene.mjs가 부모 판에 없는 이름을 가져오면 링크가 깨지고 모듈 그래프가
   통째로 안 선다. 실측: 이 자가 얹힌 뒤에 들어온 커밋이 actors.mjs에 이름 여섯을 더했고
   scene.mjs가 그중 셋을 가져오면서, 그날부터 대조군 판이 한 번도 안 섰다.
   그래서 부모 판에 없는 이름만 골라 살아 있는 파일에서 빌려 온다.
   빌린 이름은 대조군이 아니다. 다만 부모 파일은 제 안에 없던 이름을 부를 수 없으므로 부모 쪽
   코드 길은 이 줄을 안 쓴다. 팔에 걸리는 고리와 places 없는 pitch가 그대로 서는 것이 그 증거다. */
const routed = new Map();
// 빌려 줄 살아 있는 바이트. 주소는 디스크에 없고 아래 lap이 그 자리에 세운다.
const lent = new Map();
const exportsOf = (src) => new Set([...src.matchAll(/^export\s+(?:async\s+)?(?:function|const|let|var|class)\s+([A-Za-z_$][\w$]*)/gm)].map((m) => m[1]));
if (!LIVE_ONLY) {
  for (const f of LAYER) {
    const was = execFileSync("git", ["show", WAS_REV + ":" + f], { encoding: "utf8", maxBuffer: 16000000, cwd: ROOT });
    const live = readFileSync(ROOT + f, "utf8");
    if (was.replace(/\r/g, "") === live.replace(/\r/g, "")) {
      console.log("판정 중단. " + f + "이 " + WAS_REV + "와 같아 대조군이 no-op이다. INSTRUMENT DEAD");
      process.exit(2);
    }
    /* 위 한 줄만 읽는 자라 export {a, b}와 export default는 못 센다. 하나라도 있으면 빠진 이름을
       덜 세고 빌림이 반쪽이 된다. 반쪽은 링크가 깨진 뒤에야 드러나므로 여기서 끊는다. */
    if (/^export\s*[{*]/m.test(live) || /^export\s+default/m.test(live)) {
      console.log("판정 중단. " + f + "의 수출 형태를 이 자가 못 읽는다. INSTRUMENT DEAD");
      process.exit(2);
    }
    const had = exportsOf(was);
    const lack = [...exportsOf(live)].filter((n) => !had.has(n));
    const url = f.replace(/\.mjs$/, ".live.mjs");
    routed.set(f, lack.length === 0 ? was
      : was + "\n// 빌림. 부모 판에 없는 이름만 살아 있는 파일에서 가져다 다시 내보낸다.\n"
        + "export { " + lack.join(", ") + " } from \"./" + url.split("/").pop() + "\";\n");
    if (lack.length) {
      lent.set(url, live);
      notes.push("shim " + f + " borrows " + lack.join(",") + " from live, parent code paths untouched");
    }
  }
}

// 한 판을 세우고 동네 넷을 찍는다. lane이 live면 살아 있는 파일, was면 부모 판이다.
async function lap(browser, lane, errs) {
  const ctx = await browser.newContext({ viewport: { width: W, height: H } });
  // 시계는 손잡이가 생기는 틱에 못 박힌다. evaluate로 켜면 그 전에 흐른 실시간이 세계시각에 쌓인다.
  await pinClock(ctx, STEP);
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errs.push(lane + ": " + String(e)));
  page.on("console", (m) => { if (m.type() === "error") errs.push(lane + ": " + m.text()); });
  if (lane === "was") {
    for (const [f, body] of routed) {
      await page.route("**/" + f, (route) => route.fulfill({ status: 200, contentType: "text/javascript; charset=utf-8", body }));
    }
    // 빌림 줄이 가리키는 주소. 디스크에 없는 파일이라 여기서만 산다.
    for (const [f, body] of lent) {
      await page.route("**/" + f, (route) => route.fulfill({ status: 200, contentType: "text/javascript; charset=utf-8", body }));
    }
  }
  await page.goto(BASE, { waitUntil: "load" });
  await page.waitForSelector("#go", { timeout: 15000 });
  await page.click("#go", { force: true });
  /* 그래프가 실제로 섰는지 먼저 묻는다. 라우트로 되돌린 판이 살아 있는 판의 가져오기를 못 채우면
     모듈이 통째로 안 서고 main.mjs가 손잡이를 하나도 안 건다. 그때 아래 첫 손잡이 호출이
     "is not a function"으로 터지는데, 그것은 판정이 아니라 죽음이라 빨간 줄로도 안 남는다.
     그래서 손잡이 유무를 축으로 세우고, 없으면 그 자리에서 빠진 이름을 들고 끊는다. */
  const cold = await page.evaluate(() => ["__lockRound", "__plan", "__frames", "__crowd", "__sceneRoot", "__camDbg"]
    .filter((k) => typeof window[k] !== "function"));
  // 링크가 깨진 자리는 브라우저가 빠진 이름을 대고 말해 준다. 그 줄을 먼저 집는다.
  const mine = errs.filter((e) => e.startsWith(lane + ":"));
  say("control:the-module-graph-evaluated " + lane, cold.length === 0,
    cold.length === 0 ? "six page hooks installed, __lockRound among them"
      : "window." + cold.join(", window.") + " never installed. "
        + (mine.find((e) => /export named/.test(e)) || mine[0] || "no page error captured").slice(0, 200));
  if (cold.length) {
    await ctx.close();
    return null;
  }
  const at = (n) => page.waitForFunction((m) => window.__frames() >= m, n, { timeout: 20000 });
  // 첫 진입은 개봉 카드 두 마디를 지난다. 안 닫으면 화면 가운데를 카드가 덮는다.
  await clearDraw(page);
  // 판을 잠근다. 안 잠그면 대기 타이머가 제 슛을 쏘고 그 슛이 정지 프레임 위에 얹힌다.
  await page.evaluate(() => window.__lockRound());
  const planned = await page.evaluate((a) => { const f = window.__frames(); window.__plan(0, null, a); return f; }, ANCHOR);
  say("control:the-world-is-planned-before-the-anchor " + lane, planned < ANCHOR,
    "planned at frame " + planned + ", anchor " + ANCHOR);
  await at(ANCHOR);
  await page.evaluate(() => { document.getElementById("hud").style.display = "none"; });
  /* 멈춤이 진짜인지 먼저 묻는다. 세계시각이 그대로이고 프레임은 늘어야 정지 프레임이다.
     프레임 번호는 멈춘 동안에도 벽시계를 따라 늘어나므로 지문은 세계시각이다. */
  const t0 = await page.evaluate(() => ({ v: window.__camDbg().vnow, f: window.__frames() }));
  await page.waitForTimeout(250);
  const t1 = await page.evaluate(() => ({ v: window.__camDbg().vnow, f: window.__frames() }));
  say("control:the-world-stopped-at-the-planned-frame " + lane, t0.v === t1.v && t1.f > t0.f,
    "vnow " + t1.v.toFixed(4) + " held while frames kept ticking");

  const town = async (n) => {
    await page.evaluate((k) => window.__crowd(k), n);
    const flat = await page.evaluate(levelPalette, [FLAT_SKY, FLAT_HAZE, FLAT_GROUND, FLAT_FENCE]);
    await page.waitForTimeout(240);
    return { png: (await page.screenshot()).toString("base64"), flat };
  };
  const shots = {};
  let flat0 = null;
  for (const n of TOWNS) {
    const r = await town(n);
    shots[n] = r.png;
    if (flat0 === null) flat0 = r.flat;
  }
  say("control:the-palette-was-actually-levelled " + lane, flat0 && flat0.painted >= 3 && flat0.hidden >= 6,
    flat0 ? flat0.painted + " surfaces repainted, " + flat0.hidden + " crowd and shadow groups hidden" : "hook missing");
  // 같은 동네를 한 바퀴 뒤에 다시 찍는다. 여기서 벌어지면 아래 수는 전부 시간이다.
  const again = (await town(TOWNS[0])).png;
  say("control:the-same-town-twice-draws-the-same-frame " + lane, again === shots[TOWNS[0]],
    again === shots[TOWNS[0]] ? "identical bytes" : "drifted");

  const band = [];
  for (let i = 0; i < TOWNS.length; i += 1) {
    for (let j = i + 1; j < TOWNS.length; j += 1) {
      const d = await page.evaluate(bandDiff, [shots[TOWNS[i]], shots[TOWNS[j]], BAND_Y0, BAND_Y1, PIX_TOL]);
      band.push({ a: TOWNS[i], b: TOWNS[j], pct: d.pct, n: d.n, total: d.total, rows: d.rows });
    }
  }
  const ink = await page.evaluate(inkStats, [GRADES, 16]);
  const rig = lane === "live" ? await page.evaluate(personaRig, [REPR, RIG_W, RIG_H]) : null;
  const arena = lane === "live" ? await page.evaluate(arenaPassers) : null;
  if (SHOTS && lane === "live") {
    for (const n of TOWNS) writeFileSync(ROOT + "tools/place-shot-" + n + ".local.png", Buffer.from(shots[n], "base64"));
  }
  await ctx.close();
  return { band, ink, rig, arena };
}

let browser;
try {
  browser = await chromium.launch({ executablePath: EXE, args: ["--use-gl=angle", "--enable-gpu"] });
  const errs = [];
  const live = await lap(browser, "live", errs);
  const was = LIVE_ONLY ? null : await lap(browser, "was", errs);

  /* 한 판이라도 안 섰으면 그 판이 낸 수는 없다. 위에서 빨간 줄이 이미 섰으므로 여기서는 잴 수
     있는 축만 재고 판정 줄까지 간다. 예외로 죽으면 줄이 한 개도 안 찍혀 랩 전체가 안 읽힌다. */
  // 동네. 여섯 쌍이 전부 바를 넘어야 넷이 서로 다른 자리다. 한 쌍만 넘으면 셋이 같은 자리다.
  for (const p of (live ? live.band : [])) {
    const old = was ? was.band.find((q) => q.a === p.a && q.b === p.b) : null;
    say("place:town-" + p.a + "-and-town-" + p.b + "-stand-on-different-ground", p.pct >= BAND_MIN,
      pc(p.pct) + " of the band (" + p.n + " of " + p.total + "px, rows " + p.rows.join("-") + ")"
      + (old ? ", parent " + pc(old.pct) : ""));
  }
  if (was) {
    const worst = was.band.reduce((m, p) => Math.max(m, p.pct), 0);
    say("control:the-parent-revision-fails-the-same-axis", worst < BAND_MIN,
      "parent worst pair " + pc(worst) + " against a bar of " + pc(BAND_MIN)
      + " over " + was.band.length + " pairs at " + WAS_REV);
  }

  // 행인. 자를 먼저 세운다. 답을 아는 상자 둘이 4.0과 1.0을 내야 아래 수가 뜻을 갖는다.
  if (live && live.rig) {
    const c = live.rig.control;
    say("control:the-silhouette-rule-reads-a-known-pair",
      c.length === 2 && Math.abs(c[0].ratio - 4) < 0.25 && Math.abs(c[1].ratio - 1) < 0.15,
      c.map((x) => x.ratio.toFixed(2)).join(" and ") + " for boxes of 4.00 and 1.00");
    for (const p of live.rig.people) {
      say("control:persona-" + personaKindAt(p.i) + "-is-a-body-not-a-speck", p.on >= 400,
        p.on + "px drawn, box " + p.w + "x" + p.h);
    }
    for (let i = 0; i < live.rig.people.length; i += 1) {
      for (let j = i + 1; j < live.rig.people.length; j += 1) {
        const a = live.rig.people[i];
        const b = live.rig.people[j];
        const gap = Math.abs(a.ratio - b.ratio) / Math.max(a.ratio, b.ratio);
        say("persona:" + personaKindAt(a.i) + "-and-" + personaKindAt(b.i) + "-have-different-builds",
          gap >= RATIO_MIN,
          a.ratio.toFixed(2) + " vs " + b.ratio.toFixed(2) + ", " + pc(gap) + " apart against a bar of " + pc(RATIO_MIN));
      }
    }
  }

  /* 격리해서 잰 몸이 화면에 선 몸인지 되묻는다. 경기장 행인을 월드 상자로 재서 순서를 맞댄다.
     상자는 원근을 안 타므로 비의 절대값은 다르지만, 넷을 세운 순서는 같아야 한다.
     여기서 어긋나면 위의 수는 화면에 없는 몸을 잰 것이다. */
  if (live && live.arena) {
    const seen = new Set(live.arena.map((p) => p.persona));
    const want = new Set(REPR.map((i) => personaKindAt(i)));
    say("arena:the-pitch-stands-all-four-personas", want.size === 4 && [...want].every((k) => seen.has(k)),
      live.arena.length + " passers built, kinds " + [...seen].join(","));
    const byKind = {};
    for (const p of live.arena) if (!byKind[p.persona]) byKind[p.persona] = p.h / p.w;
    const rigOrder = live.rig.people.slice().sort((a, b) => b.ratio - a.ratio).map((p) => personaKindAt(p.i));
    const armOrder = Object.keys(byKind).sort((a, b) => byKind[b] - byKind[a]);
    say("arena:the-isolated-bodies-rank-like-the-ones-on-screen",
      rigOrder.join(",") === armOrder.join(","),
      "rig " + rigOrder.join(">") + " vs pitch " + armOrder.join(">"));
  }

  // 문신. 0등급이 아래에 있어야 하고 고리 방식보다 위에 있어야 한다.
  /* 부모 판에는 armBox가 없어 같은 상자로 못 잰다. 그러면 고리와 무늬를 맞대는 축이 서지 않으므로
     조용히 넘기는 대신 여기서 끊는다. 계기가 반쪽인 채로 낸 초록은 초록이 아니다. */
  if (live && (!live.ink || (was && !was.ink))) {
    console.log("판정 중단. armBox 손잡이가 " + (live.ink ? WAS_REV : "살아 있는 판") + "에 없다. INSTRUMENT DEAD");
    process.exit(2);
  }
  const bare = live && live.ink ? live.ink.find((x) => x.grade === 0) : null;
  say("control:the-ink-sample-is-an-arm-not-a-speck", bare && bare.n >= INK_MIN,
    bare ? bare.n + "px opaque inside the upper-arm box " + bare.box.join(",") + " over " + bare.parts + " meshes" : "no bake");
  for (const x of (live && live.ink ? live.ink : [])) {
    if (x.grade === 0) continue;
    say("ink:grade-" + x.grade + "-has-more-texture-than-bare-skin", x.v > bare.v,
      "variance " + x.v.toFixed(1) + " vs bare " + bare.v.toFixed(1));
    if (!was) continue;
    const old = was.ink.find((y) => y.grade === x.grade);
    say("ink:grade-" + x.grade + "-beats-the-ring-method", old && x.v > old.v,
      old ? "variance " + x.v.toFixed(1) + " vs ring " + old.v.toFixed(1) + " at " + WAS_REV : "no parent bake");
  }

  say("console:no-errors", errs.length === 0, errs.length ? errs[0].slice(0, 140) : "clean");
} finally {
  clearTimeout(t);
  if (browser) await browser.close();
}

// 이름표가 도시마다 같은 번호에 같은 몸을 붙이는지. 경기장은 도시를 모른 채 번호로만 몸을 짓는다.
let drift = 0;
for (let c = 0; c <= 3; c += 1) {
  for (let i = 0; i < passerCountAt(c); i += 1) if (passerAt(c, i).kind !== personaKindAt(i)) drift += 1;
}
say("control:every-town-gives-the-same-number-the-same-body", drift === 0, drift + " names disagree with their index");

let bad = 0;
for (const n of notes) console.log("  " + n);
for (const [pass, name, detail] of rows) {
  if (!pass) bad += 1;
  console.log("  " + (pass ? "ok  " : "FAIL") + " " + name + " " + detail);
}
console.log("표본 범위: 동네 4(여섯 쌍) x 페르소나 4(여섯 쌍) x 잉크 등급 4, 1280x720, seed 20, 시계 1/60 고정");
console.log((LIVE_ONLY ? "place(live-only, no control) " : "place(--was " + WAS_REV + ") ") + (bad ? "FAIL " + bad : "PASS " + rows.length));
process.exitCode = bad ? 1 : 0;
