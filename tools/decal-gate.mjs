// 충돌이 세상에 흔적을 남기는지 재는 자. 몸이 흙에 처박혔는데 다음 구에 땅이 새 것이면 여기서 걸린다.
// 절차: 세계시간을 멈춘 두 컷으로 음성 대조군을 잡고, 몸이 닿는 사건 여섯 번을 친 뒤
// 카메라가 기준 자리로 돌아온 것을 확인하고 다시 멈춰서 같은 자리를 찍는다.
// 게임은 사건 사이에도 진행한다. 행인이 걷고 키커가 걸어와 공을 놓으며 카메라 shake 잔여가 남는다.
// 그래서 대기 시간만으로는 정지 화면이 만들어지지 않고, 대조군이 화면 전체의 변화를 자국으로 읽는다.
// 바: 대조군 클러스터 0, 본 측정에서 40px 이상 어두워진 클러스터 3개 이상, 붓을 막은 바퀴에서 3개 미만.
//
// 대조군 0은 계기가 없는 자국을 지어내지 않는다는 것만 말한다. 제품이 칠하기를 그만둬도 그 줄은 0 그대로라서,
// 기본 회차만 도는 한 이 축은 한쪽 방향으로만 잰다. 반대쪽은 붓을 막고 세는 것이고, 그 길은 손으로만 켤 수 있어
// 한 번도 안 돌았다. 실측(64ffa12): 같은 사건을 치고 붓만 막으면 클러스터 5가 0으로 떨어진다.
// 그래서 한 실행이 두 바퀴를 돈다. 붓이 살아 있는 컨텍스트에서 세고 붓만 막은 컨텍스트에서 다시 세서,
// 두 방향이 다 맞아야 통과한다. 손으로 켜야 하는 대조군은 잊히는 대조군이다.
//
// 기다림을 벽시계로 끊으면 그 사이에 세계가 몇 걸음 갔는지를 그날의 기계 부하가 정한다.
// 사건 여섯 번이 모두 그 기다림 위에 서 있어서, 프레임이 빠진 회차는 흙이 덜 파인 채로 두 번째 컷을 찍는다.
// 실측(1d02a4e sweep): 부하 아래서 클러스터가 바 3에 못 미치는 2, 같은 판을 혼자 돌리면 5다.
// 그래서 세계시계를 1/60로 못 박고(clock.mjs pinClock) 기다림을 프레임 수로 센다.
// window.__frames()는 세계가 멈춘 동안에도 올라간다. 그래서 대조군의 두 컷 사이도 같은 자로 끊는다.
// 누른 뒤의 DOM 정착만 짧은 벽시계로 두고, 측정을 가르는 기다림은 하나도 거기 안 남긴다.
// 시계를 못 박아도 판 안의 회차 편차가 남으면 같은 사건이 회차마다 다른 자리를 판다. 그것까지 ?vary=0으로 끈다.
import { chromium } from "playwright";
import { pinClock } from "./clock.mjs";

const EXE = process.env.LOCALAPPDATA + "/ms-playwright/chromium-1228/chrome-win64/chrome.exe";
// vary는 꼬리 연출의 회차 편차다. 판정 rng가 아니라 Math.random을 세 번 돌려 뽑으므로(scene.mjs:1143)
// 같은 씨드를 줘도 그 세 값은 회차마다 다르다. 그 값이 키퍼가 뛰어가 서는 자리와 몸의 진폭을 흔든다.
// 흙을 파는 자리는 그 순간 장갑의 월드 좌표라(scene.mjs:1573 gloveWorld), 편차가 켜져 있으면
// 사건 여섯 번이 회차마다 다른 자리를 파고, 클러스터 수가 바에 대고 흔들린다.
// 실측(05b9db4): 같은 바이트를 세 번 돌려 3, 5, 7로 갈렸고 부하가 가장 큰 회차가 가장 많이 셌다.
// 부하 순서가 거꾸로 달려 있으므로 그 흔들림은 기계가 아니라 판 안의 무작위다.
const URL = "http://127.0.0.1:10310/web/index.html?seed=20&vary=0&preset=veteran";
const KINDS = ["downed", "reboundMiss", "carriedIn", "spill", "rebound", "save"];
const BAR = 3;
const STEP = 1 / 60;
// 기다림의 폭. 세계는 프레임마다 STEP만큼 걷고, 아래 수는 예전 벽시계 자리를 60프레임으로 옮긴 것이다.
const BOOT = 72;    // 시작을 누르기 전 판이 자리를 잡는 동안. 1.2초 자리다.
const OPEN = 108;   // 판이 서는 동안. 1.8초 자리다.
const SETTLE = 18;  // 세계를 멈춘 뒤 렌더가 자리를 잡는 동안. 0.3초 자리다.
const BARED = 12;   // 몸을 숨기고 다시 그려질 때까지. 0.2초 자리다.
const CTRL = 54;    // 대조군 두 컷 사이. 0.9초 자리다.
const PRE = 42;     // 방향키를 누르고 사건을 걸 때까지. 0.7초 자리다.
const POST = 150;   // 사건이 끝나고 흙이 남을 때까지. 2.5초 자리다.
const CAM = 6;      // 카메라 복귀를 되묻는 간격. 0.1초 자리다.
// 프레임으로 세는 자는 바쁜 기계에서 벽시계가 늘어난다. 여기서 죽으면 그 늘어남이 다시 판정에 섞인다.
const t = setTimeout(() => { console.log("WATCHDOG"); process.exit(1); }, 540000);
t.unref();

/* 프레임으로 기다린다. 벽시계로 기다리면 부하가 걸린 기계에서 세계가 덜 간 채로 다음 줄이 실행된다.
   세계가 멈춘 구간에서도 렌더 프레임은 계속 도므로 이 자는 두 구간 모두에 쓴다. */
const waitFrames = (page, n) => page.evaluate((k) => new Promise((done) => {
  const f0 = window.__frames();
  const tick = () => (window.__frames() >= f0 + k ? done(window.__frames()) : requestAnimationFrame(tick));
  requestAnimationFrame(tick);
}), n);

/* 방향키는 대기 마디에서만 먹는다(main.mjs setPad가 .zone을 잠갔다 연다). 닫힌 프레임에 누르면
   그 누름이 판정에 안 들어가고, 키퍼가 제자리에 선 채로 여섯 사건이 같은 흙에 겹쳐 칠해진다.
   실측: 패드를 안 보고 누르면 클러스터가 회차마다 1과 3으로 갈렸다. walkback-gate.mjs의 padOpen과 같은 자다. */
const padOpen = (page) => page.waitForFunction(() => {
  const z = document.querySelector(".zone");
  return Boolean(z) && !z.disabled;
}, null, { timeout: 120000, polling: "raf" });

/* 사건을 프레임에 맡긴다(scene.mjs planAct). 바깥에서 __act를 부르면 왕복이 한두 프레임을 먹고,
   그 사이 다이빙 중인 몸은 다른 자세로 흙에 닿아 같은 사건이 회차마다 다른 넓이의 자국을 남긴다.
   누름이 판정에 들어간 프레임을 페이지 안에서 읽고 거기서 lead 프레임 뒤를 예약하면,
   사건이 걸리는 순간의 자세가 기계 부하와 무관하게 같다. 실측: 예약 없이 부른 회차가 8과 5로 갈렸다.
   멈출 프레임은 -1이라 세계는 안 멈춘다. 사건 사이에도 판이 돌아야 이 자의 전제가 선다. */
const planAfterDive = (page, side, kind, lead) => page.evaluate(([s, k, n]) => new Promise((done) => {
  let left = 240;
  const tick = () => {
    if (window.__lastInput && window.__lastInput.dive === s) {
      const f = window.__frames() + n;
      window.__plan(f, k, -1);
      done(f);
    } else if ((left -= 1) <= 0) done(-1);
    else requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}), [side, kind, lead]);

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

// 한 바퀴가 한 방향을 잰다. nomark를 켜면 자국 붓만 막고 나머지 길은 그대로 간다.
// 바퀴마다 컨텍스트를 새로 열고 끝나면 닫는다. 앞 바퀴의 페이지를 열어둔 채 뒤 바퀴를 돌리면
// 그 페이지의 rAF가 계속 돌아 뒤 바퀴가 앞 바퀴를 부하로 안고 달린다. 부하가 이 계기를 흔든다는 것은 05b9db4에서 이미 쟀다.
// 저장 상태도 컨텍스트에 남으므로, 같은 컨텍스트를 다시 쓰면 두 바퀴가 같은 판을 보지 않는다.
async function lap(br, nomark, tag) {
  const ctx = await br.newContext({ viewport: { width: 1280, height: 720 } });
  // 세계시계를 프레임에 못 박는다. 페이지가 열리기 전에 걸어야 손잡이가 생기는 그 틱에 켜진다.
  await pinClock(ctx, STEP);
  const p = await ctx.newPage();
  await p.goto(URL, { waitUntil: "load" });
  await p.waitForSelector("#go", { timeout: 15000 });
  await p.waitForFunction(() => typeof window.__frames === "function", null, { timeout: 15000, polling: "raf" });
  // 누르기 전에도 세계는 걷는다. 그 걸음 수를 기계에 맡기면 누른 순간의 세계가 회차마다 달라진다.
  await waitFrames(p, BOOT);
  await p.click("#go", { force: true });
  await waitFrames(p, OPEN);

  const shot = async () => (await p.screenshot()).toString("base64");
  const freeze = (on) => p.evaluate((v) => window.__freeze(v), on);
  const camPos = () => p.evaluate(() => window.__ballProbe.camState().pos);

  // 세계시간만 멈추고 렌더는 계속 돌린다. 렌더까지 멈추면 대조군이 계기의 잡음 바닥을 못 잰다.
  await freeze(true);
  await waitFrames(p, SETTLE);
  const base = await camPos();
  console.log(tag + "BARE " + JSON.stringify(await p.evaluate(bare, true)));
  await waitFrames(p, BARED);
  const scanA = await p.evaluate(boxScan, 6);
  if (!scanA) { console.log(tag + "NOWINDOW  FAIL"); process.exit(1); }
  const A = await shot();
  await waitFrames(p, CTRL);
  const A2 = await shot();
  await p.evaluate(bare, false);

  const winA = { ...scanA, ...WIN, allow: scanA.cells };
  console.log(tag + "WINDOW y " + scanA.y0 + ".." + scanA.y1 + " x " + scanA.x0 + ".." + scanA.x1 + " cells " + scanA.cells.length);
  const ctrl = await p.evaluate(cluster, [A, A2, winA]);
  console.log(tag + "CONTROL " + ctrl.length + " " + JSON.stringify(ctrl.slice(0, 3)));

  // 자국 붓을 막고 같은 사건을 치면 클러스터가 바 아래로 떨어져야 한다.
  // 떨어지지 않으면 이 게이트가 세는 것은 자국이 아니라 몸이거나 그림자다.
  if (nomark) {
    await p.evaluate(() => {
      const box = window.__sceneRoot().getObjectByName("box");
      box.userData.mark = () => {};
    });
    console.log(tag + "on");
  }

  await freeze(false);
  for (let i = 0; i < KINDS.length; i += 1) {
    // 누름은 대기 마디에서만 먹고, 그 누름이 판정에 들어가야 키퍼가 움직인다.
    const side = i % 2 ? 1 : -1;
    let at = -1;
    for (let k = 0; k < 8 && at < 0; k += 1) {
      await padOpen(p);
      await p.keyboard.press(side > 0 ? "ArrowRight" : "ArrowLeft");
      at = await planAfterDive(p, side, KINDS[i], PRE);
    }
    if (at < 0) { console.log(tag + "NODIVE " + KINDS[i] + "  FAIL"); process.exit(1); }
    await p.waitForFunction((n) => window.__frames() >= n, at + POST, { timeout: 300000, polling: "raf" });
  }

  // 두 컷의 카메라가 다르면 남는 차이는 자국이 아니라 시점 이동이다. 기준 자리 복귀를 기다린다.
  let back = false;
  for (let i = 0; i < 30 && !back; i += 1) {
    const now = await camPos();
    back = now.every((v, k) => Math.abs(v - base[k]) <= 0.02);
    if (!back) await waitFrames(p, CAM);
  }
  console.log(tag + "CAMBACK " + back + " " + JSON.stringify(await camPos()) + " base " + JSON.stringify(base));
  await freeze(true);
  await waitFrames(p, SETTLE);
  await p.evaluate(bare, true);
  await waitFrames(p, BARED);
  const B = await shot();
  const res = await p.evaluate(cluster, [A, B, winA]);
  for (const c of res) console.log(tag + "cluster px=" + c.px + " mean=" + c.mean.toFixed(1) + " x=" + c.x0 + ".." + c.x1);
  await ctx.close();
  return { ctrl, res };
}

let br;
try {
  br = await chromium.launch({ executablePath: EXE });
  // 산 바퀴가 먼저다. 이 바퀴의 길은 예전 한 바퀴짜리 게이트와 같고, 다섯 자국도 같은 자리에 남는다.
  const live = await lap(br, false, "");
  // 막은 바퀴. 같은 사건을 치되 붓만 막으므로, 여기서 세지는 것이 있다면 그것은 자국이 아니다.
  const nom = await lap(br, true, "NOMARK ");
  console.log("NOMARK CLUSTERS " + nom.res.length + "  under BAR " + BAR + "  " + (nom.res.length < BAR ? "ok" : "no"));

  // 두 방향이 다 맞아야 통과다. 하나라도 어긋나면 어느 쪽이 깨졌는지 이름을 붙여 말한다.
  const broke = [];
  if (live.ctrl.length !== 0) broke.push("control");
  if (live.res.length < BAR) broke.push("live");
  if (nom.res.length >= BAR) broke.push("nomark");
  console.log("CLUSTERS " + live.res.length + "  NOMARK " + nom.res.length + "  CONTROL " + live.ctrl.length + "  BAR " + BAR + "  " + (broke.length ? "FAIL " + broke.join(",") : "PASS"));
  if (broke.length) process.exitCode = 1;
} finally {
  clearTimeout(t);
  if (br) await br.close();
}
