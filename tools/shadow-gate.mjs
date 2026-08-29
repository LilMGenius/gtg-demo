import { chromium } from "playwright";

// 접지 그림자가 그림자로 읽히는지 잴다. 육안은 "어둡다"와 "구멍이 뚫렸다"를 구별하지 못한다.
// 이웃 흙과 비교하는 방식은 못 쓴다. 흙 면에는 흰 라인이 칠해져 있고 pick은 면 이름만 돌려준다.
// 그래서 같은 화소를 그림자만 끔 채로 한 번, 켜고 한 번 잴다. 그 사이에 시간은 흐르지 않는다.
// 쓰러진 키퍼가 그림자 중앙을 가리므로 상자 전체 중앙값은 의미가 없다.
// 두 프레임이 실제로 달라진 화소가 그림자다. 그 집합의 면적과 농도와 결을 각각 잴다.
const EXE = process.env.LOCALAPPDATA + "/ms-playwright/chromium-1228/chrome-win64/chrome.exe";
const OUT = "shadow-gate.local.png";
const DIFF_MIN = 6;
// 타원은 자기 AABB의 약 78%를 채운다. 몸에 가려 절반을 잃어도 39%가 남는다.
const COVER_MIN = 0.30;
const DARK_MARGIN = 18;
const VOID_FLOOR = 0.4;
const GRAIN_FLOOR = 0.45;
const CTRL_DRIFT_MAX = 1.5;

const t = setTimeout(() => { console.log("WATCHDOG"); process.exit(1); }, 90000);
t.unref();
let b;
let res;
try {
  b = await chromium.launch({ executablePath: EXE });
  const p = await (await b.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  const errs = [];
  p.on("pageerror", (e) => errs.push(String(e)));
  p.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
  await p.goto("http://127.0.0.1:10310/web/index.html?seed=20", { waitUntil: "load" });
  await p.waitForTimeout(1200);
  await p.click("#go", { force: true });
  await p.waitForTimeout(1500);
  await p.keyboard.press("ArrowLeft");
  await p.waitForTimeout(700);
  await p.evaluate(() => window.__act("carriedIn"));
  await p.waitForTimeout(520);
  res = await p.evaluate(() => {
    const W = 1280, H = 720;
    const r = window.__shadowRect(W, H);
    const cl = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    // 상자가 화면 밖으로 나가면 잘라내야 한다. 밀어 넣으면 그림자가 없는 줄이
    // 분모에 들어와 면적이 그만큼 낮게 나온다. 발밑 그림자는 화면 아래로 자주 걸친다.
    const sx = cl(r.x, 0, W - 8);
    const sy = cl(r.y, 0, H - 8);
    const w = cl(r.x + r.w, sx + 8, W) - sx;
    const h = cl(r.y + r.h, sy + 8, H) - sy;
    // 음성 대조군. 그림자가 안 닿는 자리라면 두 프레임이 완전히 같아야 한다.
    // 폭을 그림자 폭에 맞추면 안 된다. 그림자가 화면 폭의 40%를 넘는 순간
    // "옆으로 w만큼 밀기"가 화면 안에서 불가능해지고, 클램프가 대조군을
    // 그림자 위로 되돌려 놓는다. 그러면 대조군 안에서 그림자가 켜졌다 꺼지고
    // 게이트는 자기 계측기가 죽었다고 오판한다.
    const CW = 160, GAP = 24;
    const hit = (x) => x < sx + w + GAP && x + CW > sx - GAP;
    const cand = [0, W - CW, sx - GAP - CW, sx + w + GAP]
      .filter((x) => x >= 0 && x + CW <= W && !hit(x))
      .sort((a, bx) => Math.abs(bx + CW / 2 - (sx + w / 2)) - Math.abs(a + CW / 2 - (sx + w / 2)));
    const boxes = [{ x: sx, y: sy, w, h }];
    if (cand.length) boxes.push({ x: cand[0], y: sy, w: CW, h });
    return { r, boxes, ctrl: cand.length ? cand[0] : null, stat: boxes.length > 1 ? window.__shadowPair(boxes) : null };
  });
  await p.screenshot({ path: OUT });
  if (errs.length) console.log("console errors: " + JSON.stringify(errs));
} finally {
  clearTimeout(t);
  if (b) await b.close();
}

const f = (v) => v.toFixed(1);
if (res.ctrl === null) {
  console.log("판정 중단. 그림자가 화면 폭을 거의 다 먹어 대조군 자리가 없다. rect " + JSON.stringify(res.r) + " INSTRUMENT DEAD");
  process.exit(2);
}
const stat = (a) => {
  const s = a.slice().sort((p, q) => p - q);
  const at = (q) => s[Math.min(s.length - 1, Math.floor(s.length * q))];
  return { med: at(0.5), spread: at(0.95) - at(0.05) };
};

const off = res.stat.off[0], on = res.stat.on[0];
const cOff = stat(res.stat.off[1]), cOn = stat(res.stat.on[1]);
console.log("rect " + JSON.stringify(res.r) + " boxes " + JSON.stringify(res.boxes));
console.log("control off med=" + f(cOff.med) + "  on med=" + f(cOn.med));

const drift = Math.abs(cOn.med - cOff.med);
if (drift > CTRL_DRIFT_MAX) {
  console.log("판정 중단. 그림자 밖이 두 프레임 사이에 움직였다. drift=" + f(drift) + " INSTRUMENT DEAD");
  process.exit(2);
}

const selOn = [], selOff = [];
for (let i = 0; i < off.length; i++) {
  if (off[i] - on[i] >= DIFF_MIN) { selOn.push(on[i]); selOff.push(off[i]); }
}
const cover = selOn.length / off.length;
console.log("cover   " + (cover * 100).toFixed(1) + "% of " + off.length + " px  (>= " + (COVER_MIN * 100) + "%)");
if (!selOn.length) {
  console.log("SHADOW FAIL");
  process.exit(0);
}
const sOn = stat(selOn), sOff = stat(selOff);
console.log("shadowed off med=" + f(sOff.med) + " spread=" + f(sOff.spread) + "  on med=" + f(sOn.med) + " spread=" + f(sOn.spread));

const isSeen = cover >= COVER_MIN;
const isDark = sOn.med <= sOff.med - DARK_MARGIN;
const notVoid = sOn.med >= sOff.med * VOID_FLOOR;
const hasGrain = sOn.spread >= sOff.spread * GRAIN_FLOOR;
console.log("isSeen   " + (cover * 100).toFixed(1) + " >= " + (COVER_MIN * 100) + "  " + (isSeen ? "ok" : "no"));
console.log("isDark   " + f(sOn.med) + " <= " + f(sOff.med - DARK_MARGIN) + "  " + (isDark ? "ok" : "no"));
console.log("notVoid  " + f(sOn.med) + " >= " + f(sOff.med * VOID_FLOOR) + "  " + (notVoid ? "ok" : "no"));
console.log("hasGrain " + f(sOn.spread) + " >= " + f(sOff.spread * GRAIN_FLOOR) + "  " + (hasGrain ? "ok" : "no"));
console.log(isSeen && isDark && notVoid && hasGrain ? "SHADOW PASS" : "SHADOW FAIL");
