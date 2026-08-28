// 사건마다 몸이 다르게 망가지는지 재는 자. 자막을 지웠을 때 두 컷이 같은 그림이면 여기서 걸린다.
// 15개 꼬리 연출의 관절 좌표를 뽑아 쌍별 L2 거리를 재고, 가장 가까운 쌍이 바를 넘는지 본다.
import { chromium } from "playwright";

const EXE = process.env.LOCALAPPDATA + "/ms-playwright/chromium-1228/chrome-win64/chrome.exe";
const KINDS = ["save", "catch", "carriedIn", "downed", "lost", "openGoalScored", "gloveGone", "spill", "rebound", "reboundMiss", "charge", "beat", "talked", "distracted", "skied"];
const t = setTimeout(() => { console.log("WATCHDOG"); process.exit(1); }, 300000);
t.unref();

function dist(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) { const d = a[i] - b[i]; s += d * d; }
  return Math.sqrt(s);
}

let b;
const out = {};
try {
  b = await chromium.launch({ executablePath: EXE });
  for (const k of KINDS) {
    const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } });
    const p = await ctx.newPage();
    await p.goto("http://127.0.0.1:10310/web/index.html?seed=20", { waitUntil: "load" });
    await p.waitForTimeout(1200);
    await p.click("#go", { force: true });
    await p.waitForTimeout(1500);
    await p.keyboard.press("ArrowLeft");
    await p.waitForTimeout(700);
    await p.evaluate((kk) => window.__act(kk), k);
    await p.waitForTimeout(520);
    out[k] = await p.evaluate(() => window.__poseVis());
    await ctx.close();
  }
  const rows = [];
  for (let i = 0; i < KINDS.length; i++) {
    for (let j = i + 1; j < KINDS.length; j++) {
      const a = KINDS[i], c = KINDS[j];
      const dv = dist(out[a].v, out[c].v);
      const drz = Math.abs(out[a].rz - out[c].rz);
      rows.push([dv, a, c, drz]);
    }
  }
  rows.sort((x, y) => x[0] - y[0]);
  for (const r of rows.slice(0, 30)) {
    console.log(r[0].toFixed(3) + "  " + r[1] + " vs " + r[2] + "  drz=" + r[3].toFixed(3));
  }
  const pass = rows[0][0] >= 0.35;
  console.log("MIN " + rows[0][0].toFixed(3) + "  BAR 0.35  " + (pass ? "PASS" : "FAIL"));
  if (!pass) process.exitCode = 1;
  for (const k of KINDS) console.log("rz " + k + " " + out[k].rz.toFixed(3));
} finally {
  clearTimeout(t);
  if (b) await b.close();
}
