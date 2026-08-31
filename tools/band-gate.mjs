// 죽은 흙을 재는 자. 디테일 세기가 아니라 그 면이 밝기 단을 몇 개나 쓰는지 센다.
// 화면은 일곱 단으로 끊긴다. 한 면이 한두 단만 차지하면 무엇을 칠했든 색종이 한 장으로 읽힌다.
// 바: 발밑 면은 최소 세 단을 쓴다. 그리고 중간 밴드보다 적으면 안 된다.
import { chromium } from "playwright";

const EXE = process.env.LOCALAPPDATA + "/ms-playwright/chromium-1228/chrome-win64/chrome.exe";
const URL = "http://127.0.0.1:10310/web/index.html?seed=20";
const W = 1280;
const H = 720;
const COL0 = 140;
const COL1 = 1140;
const COLSTEP = 40;
const ROW0 = 380;
const ROW1 = 700;
const ROWSTEP = 24;
const HALF = 10;
const MIN_SHARE = 0.02;
const MERGE = 3;
const t = setTimeout(() => { console.log("WATCHDOG"); process.exit(1); }, 120000);
t.unref();

const cols = [];
for (let x = COL0; x <= COL1; x += COLSTEP) cols.push(x);
const rows = [];
for (let y = ROW0; y <= ROW1; y += ROWSTEP) rows.push(y);

function ownGrid([cs, rs, w, h]) {
  const out = [];
  for (const y of rs) {
    const line = [];
    for (const x of cs) {
      const p = window.__pick((x / w) * 2 - 1, -((y / h) * 2 - 1));
      line.push(p ? p.name : "sky");
    }
    out.push(line);
  }
  return out;
}

// 고른 칸의 화소 휘도를 그대로 모아 돌려준다. 단 세기는 노드에서 한다.
async function lumaOf([b64, picks, half]) {
  const im = new Image();
  im.src = "data:image/png;base64," + b64;
  await im.decode();
  const cv = document.createElement("canvas");
  cv.width = im.width; cv.height = im.height;
  const c = cv.getContext("2d");
  c.drawImage(im, 0, 0);
  const g = c.getImageData(0, 0, im.width, im.height);
  const d = g.data;
  const out = [];
  for (const [px, py] of picks) {
    for (let y = py - half; y < py + half; y += 1) {
      for (let x = px - half; x < px + half; x += 1) {
        const i = (y * g.width + x) * 4;
        out.push(Math.round(0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]));
      }
    }
  }
  return out;
}

// 휘도 목록에서 단의 개수를 센다. 붙어 있는 값을 먼저 한 덩이로 묶고, 그 덩이의 지분으로 거른다.
// 순서가 중요하다. 낱값 지분으로 먼저 거르면 디더로 넓게 퍼진 단은 낱값마다 문턱 아래로
// 떨어져 통째로 사라지고, 반대로 한 단의 디더 양끝(120과 124처럼 MERGE보다 벌어진 짝)은
// 서로 다른 두 단으로 세어진다. 묶고 나서 재면 둘 다 사라진다.
function bands(vals) {
  if (!vals.length) return { n: 0, levels: [] };
  const hist = new Map();
  for (const v of vals) hist.set(v, (hist.get(v) || 0) + 1);
  const keys = [...hist.keys()].sort((a, b) => a - b);
  const clusters = [];
  let cur = null;
  for (const v of keys) {
    const c = hist.get(v);
    if (cur && v - cur.last <= MERGE) {
      cur.sum += c;
      cur.last = v;
      if (c > cur.peakC) { cur.peakC = c; cur.peak = v; }
    } else {
      cur = { sum: c, last: v, peak: v, peakC: c };
      clusters.push(cur);
    }
  }
  const kept = clusters.filter((c) => c.sum / vals.length >= MIN_SHARE);
  return { n: kept.length, levels: kept.map((c) => c.peak) };
}

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

  const owners = await p.evaluate(ownGrid, [cols, rows, W, H]);
  const shot = (await p.screenshot()).toString("base64");

  const tally = {};
  for (const line of owners) for (const n of line) tally[n] = (tally[n] || 0) + 1;
  const target = Object.entries(tally).sort((a, b) => b[1] - a[1])[0][0];

  const owned = rows.map((_, r) => owners[r].filter((n) => n === target).length);
  const lo = owned.findIndex((c) => c > 0);
  let hi = owned.length - 1;
  while (hi >= 0 && owned[hi] === 0) hi -= 1;

  const pick = (from, to) => {
    const out = [];
    for (let r = from; r < to; r += 1) {
      for (let c = 0; c < cols.length; c += 1) {
        if (owners[r][c] === target) out.push([cols[c], rows[r]]);
      }
    }
    return out;
  };
  const midPicks = pick(lo, lo + 3);
  const nearPicks = pick(hi - 2, hi + 1);

  const midVals = await p.evaluate(lumaOf, [shot, midPicks, HALF]);
  const nearVals = await p.evaluate(lumaOf, [shot, nearPicks, HALF]);
  const mid = bands(midVals);
  const near = bands(nearVals);

  // 음성 대조군. 한 가지 색으로 채운 화소 목록은 반드시 한 단으로 세어져야 한다.
  const ctrl = bands(new Array(4000).fill(137));

  console.log("TARGET " + target + " cells=" + tally[target]);
  console.log("MID  rows " + rows[lo] + ".." + rows[lo + 2] + "  bands=" + mid.n + "  levels=" + mid.levels.join(","));
  console.log("NEAR rows " + rows[hi - 2] + ".." + rows[hi] + "  bands=" + near.n + "  levels=" + near.levels.join(","));
  console.log("CONTROL bands=" + ctrl.n + "  (must be 1)  " + (ctrl.n === 1 ? "ok" : "INSTRUMENT BROKEN"));
  console.log("errors " + (errs.length ? errs.join(" | ") : "clean"));

  const ok = ctrl.n === 1 && errs.length === 0 && near.n >= 3 && near.n >= mid.n;
  console.log("band " + (ok ? "PASS" : "FAIL"));
  if (!ok) process.exitCode = 1;
} finally {
  clearTimeout(t);
  if (br) await br.close();
}
