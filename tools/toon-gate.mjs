// 카툰 렌더 층을 재는 자. 재질 이름도 조명 개수도 안 읽는다. 찍힌 화소만 읽는다.
// 유니폼 밴드는 키퍼만 남긴 화면에서, 그림자는 캐스터를 뺀 짝 프레임의 차분에서,
// 확대 배율은 같은 자리의 가로 런 길이에서 잰다.
// 표본 범위: 사건 셋(save, distracted, charge) x 두 모드(384 확대 기본, ?pix=0 풀해상)
import { chromium } from "playwright";
import { execFileSync } from "node:child_process";

const EXE = process.env.LOCALAPPDATA + "/ms-playwright/chromium-1228/chrome-win64/chrome.exe";
const BASE = "http://127.0.0.1:10310/web/index.html?seed=20";
// --was를 주면 렌더 층 네 파일만 HEAD 판으로 되돌려 같은 자를 댄다. 파일은 안 건드리고 요청만 가로챈다.
// 이 자가 무엇을 잡는지는 잡히는 화면을 한 번 보여야 말할 수 있고, 그 화면이 여기서 재현된다.
const WAS = process.argv.includes("--was");
const LAYER = ["web/src/render/scene.mjs", "web/src/render/units.mjs",
  "web/src/render/handmade.mjs", "web/src/render/objects/pitch.mjs"];
const W = 1280;
const H = 720;
// 사건 셋. 선방과 한눈팔기와 뛰쳐나가기는 자세도 서 있는 자리도 갈린다.
const EVENTS = ["save", "distracted", "charge"];
// 상의 초록만 고른다. 살갗과 장갑은 R이, 양말과 소매와 반바지는 B가 최대라 G가 최대인 화소는 상의뿐이다.
// 셰이더가 밝기만 끊고 색비는 그대로 곱하므로 이 부호는 조명과 포스터라이즈를 지나도 남는다.
const GREEN_R = 16;
const GREEN_B = 8;
// 한 면을 재려면 표본이 면이어야 한다. 실측: 키퍼만 남긴 화면에서 상의가 가진 화소가 사건별로 1791에서 4631이었다.
const UNIFORM_MIN = 300;
// 옷감 무늬를 걷는 반경. 상의 텍스처는 흰 바탕에 어두운 줄을 그은 것이라, 국소 최대값을 취하면
// 줄이 걷히고 조명 단만 남는다. 실측: 반경 4는 무늬와 함께 어두운 단까지 지웠고(봉 셋이 둘로),
// 2는 무늬만 걷었다. 줄 폭은 화면에서 두 화소 안쪽이다.
const CLOTH_R = 2;
// 그라데이션 맵이 세 단이므로 화면에도 세 봉이 서야 한다.
const MODES_WANT = 3;
// 봉 하나가 표본의 이만큼은 가져야 한다. 그 아래는 밴드 경계에 걸친 화소 몇 개다.
const PEAK_SHARE = 0.04;
// 봉 사이 최소 거리. 이보다 붙어 있으면 한 봉의 어깨다.
const PEAK_SEP = 10;
// 히스토그램을 이 폭으로 훑어 고른다. 낱값 요철을 봉으로 세지 않기 위한 창이다.
const SMOOTH = 3;
// 그림자 차분 문턱. 실측: 정지 프레임 두 장의 차이가 0화소라 잡음 바닥은 0이고, 한 단이 휘도 28이다.
const SHADOW_DROP = 8;
// 점점이 끊긴 차분을 잇는 반경. 그늘이 흙을 한 칸 내리는 폭은 휘도 21이고 한 칸이 28이라,
// 베이어 무늬가 어느 화소를 경계 너머로 밀었는지에 따라 넷 중 하나쯤은 같은 칸에 남는다.
// 그 구멍은 무늬 칸 하나만큼 크고, 384 타깃을 늘린 화면에서 한 칸은 네 텍셀 곱하기 1.87화소다.
// 실측: 반경 2로는 뛰쳐나간 키퍼의 그늘 582화소가 400 밑의 조각들로 끊겼다.
const SHADOW_LINK = 4;
// 키퍼 그림자 최소 면적. 이보다 작으면 발밑 얼룩과 구분이 안 된다.
const SHADOW_MIN = 400;
// 그 면적 중 한 덩이가 차지해야 하는 몫. 그늘은 덩어리이고 디더 잡음은 흩어진 점이라 이 비가 가른다.
// 한 덩이만으로 재면 그늘이 아니라 가림을 잰다. 실측: 선방은 그늘이 옆으로 누워 1396화소 중 974가
// 한 덩이인데, 뛰쳐나간 키퍼는 서 있는 몸이 제 그늘을 덮어 649화소가 조각으로 남는다.
const SHADOW_SOLID = 0.4;
// 확대 모드의 가로 런 길이 하한과 두 모드의 비. 384 타깃을 늘리면 같은 색이 옆으로 이어진다.
const RUN_MIN = 2.0;
const RUN_RATIO = 1.5;
// 조명을 다섯에서 셋으로 줄여도 흙 밝기는 그대로여야 한다. 흙은 재질을 안 바꾼 면이라 조명만 잰다.
// 실측: 리마스터 전 흙 화소 222칸의 휘도 p10/p50/p90이 64/93/148이었다(seed 20, save, 정지 프레임).
const DIRT_BEFORE = [64, 93, 148];
// 실측: 같은 프레임을 두 번 찍은 차이가 0화소였고 사건 진행에 따라 흙에 자국이 쌓인다. 그 폭만 연다.
const DIRT_TOL = 8;

const t = setTimeout(() => { console.log("WATCHDOG"); process.exit(1); }, 170000);
t.unref();

const rows = [];
const say = (name, pass, detail) => rows.push([pass, name, detail]);

// 봉 세기. 골짜기까지 내려가며 한 봉의 몸통을 통째로 걷어내고 다음 봉을 찾는다.
function modes(vals) {
  const hist = new Float64Array(256);
  for (const v of vals) hist[Math.max(0, Math.min(255, Math.round(v)))] += 1;
  const sm = new Float64Array(256);
  for (let i = 0; i < 256; i += 1) {
    let s = 0;
    for (let k = -SMOOTH; k <= SMOOTH; k += 1) {
      const j = i + k;
      if (j >= 0 && j <= 255) s += hist[j];
    }
    sm[i] = s;
  }
  const used = new Uint8Array(256);
  const peaks = [];
  for (let pass = 0; pass < 12; pass += 1) {
    let bi = -1;
    let bv = 0;
    for (let i = 0; i < 256; i += 1) if (!used[i] && sm[i] > bv) { bv = sm[i]; bi = i; }
    if (bi < 0) break;
    let lo = bi;
    while (lo > 0 && !used[lo - 1] && sm[lo - 1] <= sm[lo]) lo -= 1;
    let hi = bi;
    while (hi < 255 && !used[hi + 1] && sm[hi + 1] <= sm[hi]) hi += 1;
    let mass = 0;
    for (let i = lo; i <= hi; i += 1) { mass += hist[i]; used[i] = 1; }
    const near = peaks.some((p) => Math.abs(p.at - bi) < PEAK_SEP);
    if (!near && vals.length && mass / vals.length >= PEAK_SHARE) peaks.push({ at: bi, share: mass / vals.length });
  }
  peaks.sort((a, b) => a.at - b.at);
  return peaks;
}

const pct = (a, q) => {
  if (!a.length) return 0;
  const s = a.slice().sort((p, r) => p - r);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))];
};

// 아래 넷은 페이지 안에서 돈다. 화소 접근은 브라우저가, 통계는 노드가 한다.
async function greenLuma([b64, gr, gb, rad]) {
  const im = new Image();
  im.src = "data:image/png;base64," + b64;
  await im.decode();
  const cv = document.createElement("canvas");
  cv.width = im.width; cv.height = im.height;
  const c = cv.getContext("2d");
  c.drawImage(im, 0, 0);
  const g = c.getImageData(0, 0, im.width, im.height);
  const d = g.data;
  const w = g.width;
  const h = g.height;
  const lum = new Float32Array(w * h);
  const on = new Uint8Array(w * h);
  const raw = [];
  for (let s = 0; s < w * h; s += 1) {
    const i = s * 4;
    if (d[i + 1] - d[i] < gr || d[i + 1] - d[i + 2] < gb) continue;
    on[s] = 1;
    lum[s] = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
    raw.push(Math.round(lum[s]));
  }
  // 무늬를 걷는다. 같은 상의 화소들 안에서만 최대값을 본다. 바깥을 물면 배경 밝기가 딸려 들어온다.
  const out = [];
  for (let s = 0; s < w * h; s += 1) {
    if (!on[s]) continue;
    const cx = s % w;
    const cy = (s / w) | 0;
    let best = lum[s];
    for (let dy = -rad; dy <= rad; dy += 1) {
      const ny = cy + dy;
      if (ny < 0 || ny >= h) continue;
      for (let dx = -rad; dx <= rad; dx += 1) {
        const nx = cx + dx;
        if (nx < 0 || nx >= w) continue;
        const ni = ny * w + nx;
        if (on[ni] && lum[ni] > best) best = lum[ni];
      }
    }
    out.push(Math.round(best));
  }
  return { raw, flat: out };
}

async function darkerBlobs([A, B, drop, link]) {
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
  const w = a.width;
  const h = a.height;
  const L = (d, i) => 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
  const mask = new Uint8Array(w * h);
  let hits = 0;
  for (let s = 0; s < w * h; s += 1) {
    const i = s * 4;
    if (L(b.data, i) - L(a.data, i) >= drop) { mask[s] = 1; hits += 1; }
  }
  const seen = new Uint8Array(w * h);
  const out = [];
  for (let s = 0; s < mask.length; s += 1) {
    if (!mask[s] || seen[s]) continue;
    const q = [s];
    seen[s] = 1;
    let n = 0;
    let sx = 0;
    let sy = 0;
    let y1 = 0;
    while (q.length) {
      const c = q.pop();
      const cx = c % w;
      const cy = (c / w) | 0;
      n += 1; sx += cx; sy += cy;
      if (cy > y1) y1 = cy;
      for (let dy = -link; dy <= link; dy += 1) {
        for (let dx = -link; dx <= link; dx += 1) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const ni = ny * w + nx;
          if (mask[ni] && !seen[ni]) { seen[ni] = 1; q.push(ni); }
        }
      }
    }
    if (n >= 24) out.push({ px: n, cx: Math.round(sx / n), cy: Math.round(sy / n), y1 });
  }
  out.sort((p, r) => r.px - p.px);
  return { hits, blobs: out.slice(0, 6) };
}

async function runLength([b64, y0, y1, x0, x1]) {
  const im = new Image();
  im.src = "data:image/png;base64," + b64;
  await im.decode();
  const cv = document.createElement("canvas");
  cv.width = im.width; cv.height = im.height;
  cv.getContext("2d").drawImage(im, 0, 0);
  const g = cv.getContext("2d").getImageData(0, 0, im.width, im.height);
  const d = g.data;
  const sx = im.width / 1280;
  let runs = 0;
  let px = 0;
  for (let y = Math.round(y0 * sx); y < Math.round(y1 * sx); y += 4) {
    let prev = -1;
    for (let x = Math.round(x0 * sx); x < Math.round(x1 * sx); x += 1) {
      const i = (y * g.width + x) * 4;
      const v = d[i] * 65536 + d[i + 1] * 256 + d[i + 2];
      if (v !== prev) runs += 1;
      prev = v;
      px += 1;
    }
  }
  return runs ? px / runs : 0;
}

async function lumaAt([b64, cells, half]) {
  const im = new Image();
  im.src = "data:image/png;base64," + b64;
  await im.decode();
  const cv = document.createElement("canvas");
  cv.width = im.width; cv.height = im.height;
  cv.getContext("2d").drawImage(im, 0, 0);
  const g = cv.getContext("2d").getImageData(0, 0, im.width, im.height);
  const d = g.data;
  const out = [];
  for (const [px, py] of cells) {
    for (let y = py - half; y < py + half; y += 2) {
      for (let x = px - half; x < px + half; x += 2) {
        if (x < 0 || y < 0 || x >= g.width || y >= g.height) continue;
        const i = (y * g.width + x) * 4;
        out.push(Math.round(0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]));
      }
    }
  }
  return out;
}

// 흙이 차지한 화면 칸을 광선으로 되묻는다. 화소의 임자를 모르면 밝기 비교는 다른 면끼리의 비교다.
function dirtCells([w, h]) {
  const out = [];
  for (let y = 470; y < 700; y += 26) {
    for (let x = 120; x < 1160; x += 40) {
      const p = window.__pick((x / w) * 2 - 1, -((y / h) * 2 - 1));
      if (p && (p.name === "box" || p.name === "ground")) out.push([x, y]);
    }
  }
  return out;
}

let browser;
const shots = {};
try {
  browser = await chromium.launch({ executablePath: EXE, args: ["--use-gl=angle", "--enable-gpu"] });
  const errs = [];
  for (const mode of ["pix", "full"]) {
    const ctx = await browser.newContext({ viewport: { width: W, height: H } });
    const page = await ctx.newPage();
    page.on("pageerror", (e) => errs.push(String(e)));
    page.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
    if (WAS) {
      for (const f of LAYER) {
        const body = execFileSync("git", ["show", "HEAD:" + f], { encoding: "utf8", maxBuffer: 16000000 });
        await page.route("**/" + f, (route) => route.fulfill({ status: 200, contentType: "text/javascript; charset=utf-8", body }));
      }
    }
    await page.goto(BASE + (mode === "full" ? "&pix=0" : ""), { waitUntil: "load" });
    await page.waitForTimeout(1100);
    await page.click("#go", { force: true });
    await page.waitForTimeout(1200);
    // 첫 진입은 개봉 카드 두 마디를 지난다. 그 카드를 안 닫으면 화면 가운데를 카드가 덮고,
    // 유니폼을 잰다고 고른 초록 화소가 경기장의 키퍼가 아니라 카드 안의 썸네일이 된다.
    for (let i = 0; i < 6; i += 1) {
      const open = await page.evaluate(() => { const e = document.getElementById("pull"); return Boolean(e) && !e.hidden; });
      if (!open) break;
      await page.click("#pull", { force: true });
      await page.waitForTimeout(700);
    }
    await page.waitForTimeout(600);
    await page.evaluate(() => { document.getElementById("hud").style.display = "none"; });
    const covered = await page.evaluate(() => {
      const e = document.getElementById("pull");
      return Boolean(e) && !e.hidden;
    });
    say("control:the-pitch-is-not-behind-a-card " + mode, covered === false, covered ? "#pull still open" : "clear");
    // 표본은 이 모드의 사건 셋을 합친 면이다. 한 사건만 보면 단의 개수가 그 자세의 함수가 된다.
    // 실측: 한눈판 키퍼는 몸을 젖혀 등이 한 방향만 보이므로 그 컷의 유니폼에는 두 단만 선다.
    const pool = [];

    const state = await page.evaluate(() => (window.__pixState ? window.__pixState() : null));
    const rt = state ? state.rt.join("x") : "hook missing";
    if (mode === "pix") say("pix:the-default-target-stays-683x384", Boolean(state) && state.rt[0] === 683 && state.rt[1] === 384, rt);
    else say("pix:full-res-target-follows-the-canvas",
      Boolean(state) && state.rt[0] === state.canvas[0] && state.rt[1] === state.canvas[1] && state.canvas[0] === W * state.dpr,
      rt + " canvas " + (state ? state.canvas.join("x") + " dpr " + state.dpr : "hook missing"));

    for (const kind of EVENTS) {
      await page.keyboard.press(kind === "charge" ? "ArrowRight" : "ArrowLeft");
      await page.waitForTimeout(700);
      await page.evaluate((k) => window.__act(k), kind);
      await page.waitForTimeout(900);
      await page.evaluate(() => window.__freeze(true));
      await page.waitForTimeout(320);

      const A = (await page.screenshot()).toString("base64");
      const A2 = (await page.screenshot()).toString("base64");
      const off = await page.evaluate(() => (window.__castOff ? window.__castOff(true) : -1));
      await page.waitForTimeout(260);
      const B = (await page.screenshot()).toString("base64");
      await page.evaluate(() => { if (window.__castOff) window.__castOff(false); });

      const ctrl = await page.evaluate(darkerBlobs, [A, A2, SHADOW_DROP, SHADOW_LINK]);
      const cast = await page.evaluate(darkerBlobs, [A, B, SHADOW_DROP, SHADOW_LINK]);
      const top = cast.blobs[0] || null;
      const owner = top ? await page.evaluate(([x, y, w, h]) => {
        const p = window.__pick((x / w) * 2 - 1, -((y / h) * 2 - 1));
        return p ? { name: p.name, world: p.world } : null;
      }, [top.cx, Math.round((top.cy + top.y1) / 2), W, H]) : null;
      const tag = mode + "/" + kind;
      say("control:the-frozen-frame-repeats-itself " + tag, ctrl.blobs.length === 0 && off > 0,
        "ctrl blobs " + ctrl.blobs.length + " diff " + ctrl.hits + "px, casters " + off);
      say("shadow:the-keeper-drops-a-cast-shadow-on-the-floor " + tag,
        cast.hits >= SHADOW_MIN && Boolean(top) && top.px >= cast.hits * SHADOW_SOLID
        && Boolean(owner) && (owner.name === "box" || owner.name === "ground"),
        (top ? top.px + "px" : "no blob") + " of " + cast.hits + "px on the floor ("
        + (top ? Math.round((top.px / Math.max(1, cast.hits)) * 100) : 0) + "% in one piece) on "
        + (owner ? owner.name + " z" + owner.world[2].toFixed(1) : "nothing"));

      if (kind === "save" && mode === "pix") {
        const cells = await page.evaluate(dirtCells, [W, H]);
        const vals = await page.evaluate(lumaAt, [A, cells, 8]);
        const trio = [pct(vals, 0.1), pct(vals, 0.5), pct(vals, 0.9)];
        const set = DIRT_BEFORE.some((v) => v > 0);
        const ok = set && trio.every((v, i) => Math.abs(v - DIRT_BEFORE[i]) <= DIRT_TOL);
        say("light:the-dirt-keeps-the-brightness-it-had-before", ok,
          "p10/p50/p90 " + trio.join("/") + (set ? " vs " + DIRT_BEFORE.join("/") : " 기준 미기록") + " cells " + cells.length);
        console.log("  dirt histogram " + JSON.stringify(modes(vals).map((p) => p.at + ":" + p.share.toFixed(2))));
      }

      await page.evaluate(() => window.__solo("keeper"));
      await page.waitForTimeout(260);
      const S = (await page.screenshot()).toString("base64");
      shots[mode + "-" + kind] = S;
      await page.evaluate(() => window.__solo());
      const lum = await page.evaluate(greenLuma, [S, GREEN_R, GREEN_B, CLOTH_R]);
      const peaks = modes(lum.flat);
      const rawPeaks = modes(lum.raw);
      for (const v of lum.flat) pool.push(v);
      say("control:the-uniform-sample-is-a-face-not-a-speck " + tag, lum.flat.length >= UNIFORM_MIN,
        lum.flat.length + "px, 이 컷의 단 " + peaks.map((p) => p.at + "(" + (p.share * 100).toFixed(0) + "%)").join(" ")
        + ", 무늬 걷기 전 " + rawPeaks.map((p) => p.at).join(","));

      const run = await page.evaluate(runLength, [A, 470, 700, 200, 1080]);
      if (kind === "save") shots["run-" + mode] = run;
      await page.evaluate(() => window.__freeze(false));
      await page.waitForTimeout(200);
    }
    const bands = modes(pool);
    say("toon:the-uniform-reads-as-three-bands " + mode, bands.length === MODES_WANT,
      bands.length + " modes " + bands.map((p) => p.at + "(" + (p.share * 100).toFixed(0) + "%)").join(" ")
      + " of " + pool.length + "px over " + EVENTS.length + " events");
    await ctx.close();
  }

  const rp = shots["run-pix"] || 0;
  const rf = shots["run-full"] || 0;
  // DPR 1에서만 재면 캔버스 화소 수와 CSS 크기가 같은 수라 둘이 갈리는지 못 본다. 2로 한 번 더 연다.
  for (const mode of ["pix", "full"]) {
    const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    await page.goto(BASE + (mode === "full" ? "&pix=0" : ""), { waitUntil: "load" });
    await page.waitForTimeout(900);
    const st = await page.evaluate(() => (window.__pixState ? window.__pixState() : null));
    const want = mode === "full" ? [W * 2, H * 2] : [683, 384];
    say("pix:the-target-holds-at-dpr-2 " + mode,
      Boolean(st) && st.dpr === 2 && st.canvas[0] === W * 2 && st.canvas[1] === H * 2
      && st.rt[0] === want[0] && st.rt[1] === want[1],
      st ? "rt " + st.rt.join("x") + " canvas " + st.canvas.join("x") + " dpr " + st.dpr : "hook missing");
    await ctx.close();
  }
  say("pix:the-upscaled-frame-is-blockier-than-the-full-res-one",
    rp >= RUN_MIN && rf > 0 && rp / rf >= RUN_RATIO,
    "run " + rp.toFixed(2) + " vs " + rf.toFixed(2) + "px (ratio " + (rf ? rp / rf : 0).toFixed(2) + ")");
  say("console:no-errors", errs.length === 0, errs.length ? errs[0].slice(0, 120) : "clean");
} finally {
  clearTimeout(t);
  if (browser) await browser.close();
}

// 대조군 둘. 한 색으로 채운 표본은 한 봉, 세 단으로 나눈 표본은 세 봉이어야 이 자가 봉을 센다고 말할 수 있다.
const flatCtl = modes(new Array(4000).fill(137));
const trioCtl = modes([].concat(
  new Array(1200).fill(0).map((_, i) => 62 + (i % 3)),
  new Array(1200).fill(0).map((_, i) => 121 + (i % 3)),
  new Array(1200).fill(0).map((_, i) => 196 + (i % 3))));
say("control:a-flat-patch-reads-as-one-mode", flatCtl.length === 1, flatCtl.length + " modes");
say("control:a-three-step-patch-reads-as-three-modes", trioCtl.length === 3, trioCtl.length + " modes");

let bad = 0;
for (const [pass, name, detail] of rows) {
  if (!pass) bad += 1;
  console.log("  " + (pass ? "ok  " : "FAIL") + " " + name + " " + detail);
}
console.log("표본 범위: 사건 셋(save, distracted, charge) x 두 모드(384 확대 기본, ?pix=0 풀해상)");
console.log((WAS ? "toon(--was, HEAD 렌더 층) " : "toon ") + (bad ? "FAIL " + bad : "PASS " + rows.length));
process.exitCode = bad ? 1 : 0;
