// 화면 아래쪽이 죽은 흙인지 재는 자. 먼저 그 화소의 임자를 광선으로 묻고, 그 다음에 디테일을 잰다.
// 순서를 바꾸면 어느 면을 고쳐야 하는지 모르는 채로 숫자만 남는다.
// 바: 가까운 밴드는 카메라에 더 붙어 있으므로 화면 디테일이 중간 밴드보다 작으면 안 된다. NEAR >= MID.
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
const t = setTimeout(() => { console.log("WATCHDOG"); process.exit(1); }, 120000);
t.unref();

const cols = [];
for (let x = COL0; x <= COL1; x += COLSTEP) cols.push(x);
const rows = [];
for (let y = ROW0; y <= ROW1; y += ROWSTEP) rows.push(y);

// 격자 한 점마다 무엇이 그 화소를 차지했는지 되묻는다. 가림 판정과 같은 광선을 탄다.
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

// 국소 디테일. 화소와 오른쪽 3칸, 아래 3칸 사이 휘도 차의 합을 셀 안에서 모으고 중앙값을 쓴다.
// 평균은 흰 선 몇 줄에 통째로 끌려간다. 중앙값은 면 자체가 무엇을 하고 있는지를 답한다.
async function energy([b64, cs, rs, half]) {
  const im = new Image();
  im.src = "data:image/png;base64," + b64;
  await im.decode();
  const cv = document.createElement("canvas");
  cv.width = im.width; cv.height = im.height;
  cv.getContext("2d").drawImage(im, 0, 0);
  const g = cv.getContext("2d").getImageData(0, 0, im.width, im.height);
  const d = g.data;
  const L = (i) => 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
  const cell = (px, py) => {
    const v = [];
    let sr = 0, sg = 0, sb = 0, n = 0;
    for (let y = py - half; y < py + half; y += 1) {
      for (let x = px - half; x < px + half; x += 1) {
        const i = (y * g.width + x) * 4;
        const a = L(i);
        v.push(Math.abs(a - L(i + 12)) + Math.abs(a - L(i + g.width * 12)));
        sr += d[i]; sg += d[i + 1]; sb += d[i + 2]; n += 1;
      }
    }
    v.sort((p, q) => p - q);
    return { med: v[v.length >> 1], rgb: [sr / n, sg / n, sb / n] };
  };
  const out = [];
  for (const y of rs) {
    const line = [];
    for (const x of cs) line.push(cell(x, y));
    out.push(line);
  }
  return out;
}

// 음성 대조군. 밴드 평균색으로 채운 균일 판에 같은 자를 대면 0이 나와야 한다.
// 이게 0이 아니면 이 자는 죽음과 살아있음을 구분한다고 말할 수 없다.
async function flatControl([rgb, half]) {
  const cv = document.createElement("canvas");
  cv.width = 64; cv.height = 64;
  const c = cv.getContext("2d");
  c.fillStyle = "rgb(" + rgb.map((v) => Math.round(v)).join(",") + ")";
  c.fillRect(0, 0, 64, 64);
  const g = c.getImageData(0, 0, 64, 64);
  const d = g.data;
  const L = (i) => 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
  const v = [];
  for (let y = 32 - half; y < 32 + half; y += 1) {
    for (let x = 32 - half; x < 32 + half; x += 1) {
      const i = (y * 64 + x) * 4;
      const a = L(i);
      v.push(Math.abs(a - L(i + 12)) + Math.abs(a - L(i + 64 * 12)));
    }
  }
  v.sort((p, q) => p - q);
  return v[v.length >> 1];
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
  await p.goto(URL, { waitUntil: "load" });
  await p.waitForTimeout(1200);
  await p.click("#go", { force: true });
  await p.waitForTimeout(1800);

  const owners = await p.evaluate(ownGrid, [cols, rows, W, H]);
  const shot = (await p.screenshot()).toString("base64");
  const cells = await p.evaluate(energy, [shot, cols, rows, HALF]);

  // 밴드마다 누가 몇 칸을 가졌는지 먼저 말한다. 격차의 주어는 여기서 확정된다.
  const tally = {};
  for (let r = 0; r < rows.length; r += 1) {
    const cnt = {};
    for (const n of owners[r]) { cnt[n] = (cnt[n] || 0) + 1; tally[n] = (tally[n] || 0) + 1; }
    const top = Object.entries(cnt).sort((a, b) => b[1] - a[1]).slice(0, 3);
    const med = median(cells[r].map((c) => c.med));
    console.log("y=" + String(rows[r]).padStart(3) + "  det=" + med.toFixed(2).padStart(6) + "  " + top.map(([n, c]) => n + ":" + c).join(" "));
  }
  const target = Object.entries(tally).sort((a, b) => b[1] - a[1])[0][0];
  console.log("TARGET " + target + " cells=" + tally[target]);

  // 같은 면끼리만 비교한다. 다른 재질을 견주면 밝기 차이를 디테일 차이로 읽는다.
  const band = (from, to) => {
    const v = [];
    const rgb = [0, 0, 0];
    let n = 0;
    for (let r = from; r < to; r += 1) {
      for (let c = 0; c < cols.length; c += 1) {
        if (owners[r][c] !== target) continue;
        v.push(cells[r][c].med);
        rgb[0] += cells[r][c].rgb[0]; rgb[1] += cells[r][c].rgb[1]; rgb[2] += cells[r][c].rgb[2];
        n += 1;
      }
    }
    return { med: median(v), n, rgb: n ? rgb.map((x) => x / n) : [0, 0, 0] };
  };
  const owned = rows.map((_, r) => owners[r].filter((n) => n === target).length);
  const lo = owned.findIndex((c) => c > 0);
  let hi = owned.length - 1;
  while (hi >= 0 && owned[hi] === 0) hi -= 1;
  const mid = band(lo, lo + 3);
  const near = band(hi - 2, hi + 1);
  console.log("MID  rows " + rows[lo] + ".." + rows[lo + 2] + "  det=" + mid.med.toFixed(2) + "  cells=" + mid.n);
  console.log("NEAR rows " + rows[hi - 2] + ".." + rows[hi] + "  det=" + near.med.toFixed(2) + "  cells=" + near.n);

  const ctrl = await p.evaluate(flatControl, [near.rgb, HALF]);
  console.log("CONTROL flat=" + ctrl.toFixed(3) + "  (must be 0)");

  const ok = ctrl < 0.5 && mid.med >= 1 && near.med >= mid.med;
  console.log("NEAR " + near.med.toFixed(2) + " >= MID " + mid.med.toFixed(2) + "  " + (ok ? "PASS" : "FAIL"));
  if (!ok) process.exitCode = 1;
} finally {
  clearTimeout(t);
  if (br) await br.close();
}

