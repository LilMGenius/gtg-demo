// 충돌이 세상에 흔적을 남기는지 재는 자. 몸이 흙에 처박혔는데 다음 구에 땅이 새 것이면 여기서 걸린다.
// 절차: 세계시간을 멈춘 두 컷으로 음성 대조군을 잡고, 몸이 닿는 사건 여섯 번을 친 뒤
// 카메라가 기준 자리로 돌아온 것을 확인하고 다시 멈춰서 같은 자리를 찍는다.
// 게임은 사건 사이에도 진행한다. 행인이 걷고 키커가 걸어와 공을 놓으며 카메라 shake 잔여가 남는다.
// 그래서 대기 시간만으로는 정지 화면이 만들어지지 않고, 대조군이 화면 전체의 변화를 자국으로 읽는다.
// 바: 대조군 클러스터 0, 본 측정에서 40px 이상 어두워진 클러스터 3개 이상.
import { chromium } from "playwright";

const EXE = process.env.LOCALAPPDATA + "/ms-playwright/chromium-1228/chrome-win64/chrome.exe";
const URL = "http://127.0.0.1:10310/web/index.html?seed=20";
const KINDS = ["downed", "reboundMiss", "carriedIn", "spill", "rebound", "save"];
const BAR = 3;
const t = setTimeout(() => { console.log("WATCHDOG"); process.exit(1); }, 180000);
t.unref();

// 자국은 박스 평면에만 칠해진다. 창을 화소로 못 박으면 프레이밍이 바뀔 때마다 계기가 엉뚱한 땅을 본다.
// 실측: 창을 640..720에 고정했더니 그 밴드는 골라인 뒤 ground였고, 자국은 한 개도 그 안에 없었다.
// 그래서 창은 광선으로 박스가 잡히는 화면 밴드에서 매 실행 유도한다.
const WIN = { drop: 8, minPx: 40, link: 2 };

// 두 컷은 흙만 남기고 찍는다. 몸과 그림자를 놔두면 자세가 바뀐 것을 자국으로 읽는다.
// 실측 음성 대조군: 붓을 막고 같은 사건을 쳤는데도 클러스터 8개가 나와 게이트가 통과했다.
// 그림자는 캐스터가 사라지면 함께 사라지므로, 박스만 남기면 남는 차이는 칠해진 그림뿐이다.
function bare(on) {
  const root = window.__sceneRoot();
  if (on) {
    window.__bareSaved = root.children.map((c) => [c, c.visible]);
    // 조명까지 끄면 흙이 두 컷 모두 검게 눌려 자국이 있어도 차분이 0으로 나온다.
    for (const c of root.children) if (c.name !== "box" && !c.isLight) c.visible = false;
  } else {
    for (const [c, v] of window.__bareSaved || []) c.visible = v;
    window.__bareSaved = null;
  }
  return root.children.filter((c) => c.visible).map((c) => c.name || c.type);
}

// 화면을 훑어 박스 평면이 차지한 격자를 되묻는다. 가림 판정과 같은 광선을 탄다.
function boxScan(step) {
  const pick = window.__ballProbe.pickAt;
  const hit = (sx, sy) => {
    const h = pick((sx / 1280) * 2 - 1, -((sy / 720) * 2 - 1));
    return Boolean(h && h.name === "box");
  };
  const cells = [];
  let y0 = -1, y1 = -1, x0 = 1e9, x1 = -1e9;
  for (let sy = 300; sy < 720; sy += step) {
    for (let sx = 40; sx < 1240; sx += step) {
      if (!hit(sx, sy)) continue;
      cells.push(sy * 2000 + sx);
      if (sx < x0) x0 = sx;
      if (sx > x1) x1 = sx;
      if (y0 < 0) y0 = sy;
      y1 = sy;
    }
  }
  if (y0 < 0) return null;
  return { step, cells, y0, y1: Math.min(y1 + step, 720), x0: Math.max(x0 - step, 0), x1: Math.min(x1 + step, 1280) };
}

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
  // 두 컷 모두에서 흙이 보이던 자리만 센다. 한쪽에서 몸에 가려졌던 화소는 자국의 증거가 아니다.
  const allow = new Set(W.allow);
  const st = W.step;
  const cell = (gx, gy) => (300 + Math.round((gy - 300) / st) * st) * 2000 + (40 + Math.round((gx - 40) / st) * st);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const gx = x + W.x0;
      if (!allow.has(cell(gx, y + W.y0))) continue;
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
  const freeze = (on) => p.evaluate((v) => window.__freeze(v), on);
  const camPos = () => p.evaluate(() => window.__ballProbe.camState().pos);

  // 세계시간만 멈추고 렌더는 계속 돌린다. 렌더까지 멈추면 대조군이 계기의 잡음 바닥을 못 잰다.
  await freeze(true);
  await p.waitForTimeout(300);
  const base = await camPos();
  console.log("BARE " + JSON.stringify(await p.evaluate(bare, true)));
  await p.waitForTimeout(200);
  const scanA = await p.evaluate(boxScan, 6);
  if (!scanA) { console.log("NOWINDOW  FAIL"); process.exit(1); }
  const A = await shot();
  await p.waitForTimeout(900);
  const A2 = await shot();
  await p.evaluate(bare, false);

  const winA = { ...scanA, ...WIN, allow: scanA.cells };
  console.log("WINDOW y " + scanA.y0 + ".." + scanA.y1 + " x " + scanA.x0 + ".." + scanA.x1 + " cells " + scanA.cells.length);
  const ctrlRes = await p.evaluate(cluster, [A, A2, winA]);
  console.log("CONTROL " + ctrlRes.length + " " + JSON.stringify(ctrlRes.slice(0, 3)));

  // 자국 붓을 막고 같은 사건을 치면 클러스터가 바 아래로 떨어져야 한다.
  // 떨어지지 않으면 이 게이트가 세는 것은 자국이 아니라 몸이거나 그림자다.
  if (process.env.GTG_NOMARK) {
    await p.evaluate(() => {
      const box = window.__sceneRoot().getObjectByName("box");
      box.userData.mark = () => {};
    });
    console.log("NOMARK on");
  }

  await freeze(false);
  for (let i = 0; i < KINDS.length; i += 1) {
    await p.keyboard.press(i % 2 ? "ArrowRight" : "ArrowLeft");
    await p.waitForTimeout(700);
    await p.evaluate((k) => window.__act(k), KINDS[i]);
    await p.waitForTimeout(2500);
  }

  // 두 컷의 카메라가 다르면 남는 차이는 자국이 아니라 시점 이동이다. 기준 자리 복귀를 기다린다.
  let back = false;
  for (let i = 0; i < 30 && !back; i += 1) {
    const now = await camPos();
    back = now.every((v, k) => Math.abs(v - base[k]) <= 0.02);
    if (!back) await p.waitForTimeout(100);
  }
  console.log("CAMBACK " + back + " " + JSON.stringify(await camPos()) + " base " + JSON.stringify(base));
  await freeze(true);
  await p.waitForTimeout(300);
  await p.evaluate(bare, true);
  await p.waitForTimeout(200);
  const B = await shot();
  const res = await p.evaluate(cluster, [A, B, winA]);
  for (const c of res) console.log("cluster px=" + c.px + " mean=" + c.mean.toFixed(1) + " x=" + c.x0 + ".." + c.x1);

  const ok = ctrlRes.length === 0 && res.length >= BAR;
  console.log("CLUSTERS " + res.length + "  CONTROL " + ctrlRes.length + "  BAR " + BAR + "  " + (ok ? "PASS" : "FAIL"));
  if (!ok) process.exitCode = 1;
} finally {
  clearTimeout(t);
  if (br) await br.close();
}
