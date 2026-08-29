// 충돌이 세상에 흔적을 남기는지 재는 자. 몸이 흙에 처박혔는데 다음 구에 땅이 새 것이면 여기서 걸린다.
// 절차: 정지 화면 두 컷으로 음성 대조군을 먼저 잡고, 몸이 닿는 사건 여섯 번을 친 뒤 같은 자리를 다시 찍는다.
// 바: 대조군 클러스터 0, 본 측정에서 40px 이상 어두워진 클러스터 3개 이상.
import { chromium } from "playwright";

const EXE = process.env.LOCALAPPDATA + "/ms-playwright/chromium-1228/chrome-win64/chrome.exe";
const URL = "http://127.0.0.1:10310/web/index.html?seed=20";
const KINDS = ["downed", "reboundMiss", "carriedIn", "spill", "rebound", "save"];
const BAR = 3;
const t = setTimeout(() => { console.log("WATCHDOG"); process.exit(1); }, 180000);
t.unref();

// 측정 창은 화면 아래 흙 밴드 전체. 사건이 없으면 이 밴드는 화소 단위로 정지하므로 대조군이 0을 낸다.
const WIN = { y0: 640, y1: 720, x0: 100, x1: 1180, drop: 8, minPx: 40, link: 2 };

// 페이지 안에서 두 컷을 디코드하고 어두워진 화소를 잇는다.
// 포스터라이즈와 디더 때문에 자국은 점점이 끊겨 찍힌다. 그래서 이웃 반경을 2로 잡는다.
async function cluster([A, B, W]) {
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
  const w = W.x1 - W.x0, h = W.y1 - W.y0;
  const lum = (d, i) => 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
  const mask = new Int16Array(w * h);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const gx = x + W.x0;
      const i = ((y + W.y0) * a.width + gx) * 4;
      const d = lum(a.data, i) - lum(b.data, i);
      if (d >= W.drop) mask[y * w + x] = Math.round(d);
    }
  }
  const seen = new Uint8Array(w * h);
  const out = [];
  for (let s = 0; s < mask.length; s += 1) {
    if (!mask[s] || seen[s]) continue;
    const q = [s]; seen[s] = 1;
    let n = 0, sum = 0, minx = 1e9, maxx = -1e9;
    while (q.length) {
      const c = q.pop();
      const cx = c % w, cy = (c / w) | 0;
      n += 1; sum += mask[c];
      if (cx < minx) minx = cx;
      if (cx > maxx) maxx = cx;
      for (let dy = -W.link; dy <= W.link; dy += 1) {
        for (let dx = -W.link; dx <= W.link; dx += 1) {
          const nx = cx + dx, ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const ni = ny * w + nx;
          if (mask[ni] && !seen[ni]) { seen[ni] = 1; q.push(ni); }
        }
      }
    }
    if (n >= W.minPx) out.push({ px: n, mean: sum / n, x0: minx + W.x0, x1: maxx + W.x0 });
  }
  out.sort((p, r) => r.px - p.px);
  return out.slice(0, 12);
}

let br;
try {
  br = await chromium.launch({ executablePath: EXE });
  const ctx = await br.newContext({ viewport: { width: 1280, height: 720 } });
  const p = await ctx.newPage();
  await p.goto(URL, { waitUntil: "load" });
  await p.waitForTimeout(1200);
  await p.click("#go", { force: true });
  await p.waitForTimeout(1800);

  const shot = async () => (await p.screenshot()).toString("base64");
  const A = await shot();
  await p.waitForTimeout(900);
  const A2 = await shot();

  const ctrlRes = await p.evaluate(cluster, [A, A2, WIN]);
  console.log("CONTROL " + ctrlRes.length + " " + JSON.stringify(ctrlRes.slice(0, 3)));

  for (let i = 0; i < KINDS.length; i += 1) {
    await p.keyboard.press(i % 2 ? "ArrowRight" : "ArrowLeft");
    await p.waitForTimeout(700);
    await p.evaluate((k) => window.__act(k), KINDS[i]);
    await p.waitForTimeout(2500);
  }
  await p.waitForTimeout(600);
  const B = await shot();
  const res = await p.evaluate(cluster, [A, B, WIN]);
  for (const c of res) console.log("cluster px=" + c.px + " mean=" + c.mean.toFixed(1) + " x=" + c.x0 + ".." + c.x1);

  const ok = ctrlRes.length === 0 && res.length >= BAR;
  console.log("CLUSTERS " + res.length + "  CONTROL " + ctrlRes.length + "  BAR " + BAR + "  " + (ok ? "PASS" : "FAIL"));
  if (!ok) process.exitCode = 1;
} finally {
  clearTimeout(t);
  if (br) await br.close();
}
