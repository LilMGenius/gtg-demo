import { chromium } from "playwright";
import { GOALS, GOAL_SKINS, skinAt } from "../web/src/state/gear.mjs";

// 골대 등급의 자. 등급이 판정에만 들어가고 화면에는 안 나타나면, 그 상품은 값만 다른 같은 물건이다.
//
// 재는 것은 셋이다. 등급이 그물 실 수를 바꾸는가, 화면 화소가 실제로 갈리는가,
// 그리고 등급이 오를수록 촘촘해지는 방향이 지켜지는가.
//
// 대조군 둘이 붙는다. 같은 등급을 두 번 걸면 같은 화면이어야 하고, 그물을 통째로 감추면
// 화소차가 사라져야 한다. 앞의 것이 없으면 갈린 화소가 잡음과 구분되지 않고,
// 뒤의 것이 없으면 이 자가 그물이 아니라 다른 무엇을 재고 있을 수 있다.
const EXE = process.env.LOCALAPPDATA + "/ms-playwright/chromium-1228/chrome-win64/chrome.exe";
const LINE = String.fromCharCode(10);
const t = setTimeout(() => { console.log("WATCHDOG"); process.exit(1); }, 150000);
t.unref();

const fails = [], notes = [];
const check = (n, ok, d) => (ok ? notes : fails).push(n + " " + d);

// 데이터가 방향을 지키는지는 브라우저 없이 본다. 등급이 오르면 촘촘하고 진하고 덜 처져야 한다.
// 그 값은 등급 줄이 아니라 그 등급의 변형이 소유한다. 변형이 여럿이면 사다리는 변형 번호마다 따로 서야 하고,
// 한 변형만 보면 나머지 변형이 사다리를 깨도 이 자가 통과시킨다.
const widest = Math.max.apply(null, GOAL_SKINS.map((l) => l.length));
const looks = (at) => GOALS.map((g, r) => skinAt("frame", r, Math.min(at, GOAL_SKINS[r].length - 1)));
const ladder = (at, key, up) => {
  const v = looks(at).map((g) => g[key]);
  return { ok: v.every((x, i) => i === 0 || (up ? x > v[i - 1] : x < v[i - 1])), say: at + ": " + v.join(up ? " < " : " > ") };
};
const every = (key, up) => {
  const rows = [];
  for (let at = 0; at < widest; at += 1) rows.push(ladder(at, key, up));
  return { ok: rows.every((r) => r.ok), say: rows.map((r) => r.say).join(" | ") };
};
check("instrument:every-grade-declares-a-look",
  GOALS.every((g, r) => GOAL_SKINS[r].every((v) => v.cell > 0 && v.dim > 0 && v.sag >= 0 && v.post >= 0)),
  GOAL_SKINS.map((l) => l.length + " variants").join(", "));
const tight = every("cell", false);
const dark = every("dim", true);
const sag = every("sag", false);
check("goalskin:a-higher-grade-is-tighter", tight.ok, tight.say);
check("goalskin:a-higher-grade-is-darker-thread", dark.ok, dark.say);
check("goalskin:a-higher-grade-sags-less", sag.ok, sag.say);

const mean = (p, s) => p.evaluate((b64) => new Promise((res) => {
  const im = new Image();
  im.onload = () => {
    const cv = document.createElement("canvas");
    cv.width = im.width; cv.height = im.height;
    const g = cv.getContext("2d");
    g.drawImage(im, 0, 0);
    const d = g.getImageData(0, 0, im.width, im.height).data;
    const out = [];
    for (let i = 0; i < d.length; i += 4) out.push(0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]);
    res(out);
  };
  im.src = "data:image/png;base64," + b64;
}), s);

let b;
try {
  b = await chromium.launch({ executablePath: EXE });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } });
  const p = await ctx.newPage();
  const errs = [];
  p.on("pageerror", (e) => errs.push(String(e)));
  p.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
  await p.goto("http://127.0.0.1:10310/web/index.html?seed=20&preset=rich,veteran", { waitUntil: "load" });
  await p.waitForSelector("#go", { timeout: 15000 });
  await p.click("#go", { force: true });
  await p.waitForTimeout(1300);
  await p.evaluate(() => window.__lockRound());
  await p.waitForTimeout(200);
  // 세계시계를 세운다. 판정만 멈추면 바람과 행인이 계속 움직여 같은 등급 두 장도 갈린다.
  // 흔들리는 프레임끼리 비교하면 그 차가 그물 때문인지 시간 때문인지 이 자가 못 가른다.
  // 0은 실시간을 뜻하므로 정지가 아니다. 한 프레임에 백만분의 일 초만 흐르게 두면 사실상 멈춘다.
  await p.evaluate(() => window.__fixedStep(0.000001));
  await p.waitForTimeout(200);

  // 그물이 화면에서 차지하는 띠만 본다. 전체 프레임을 재면 하늘과 행인이 분모를 채운다.
  const band = { x: 300, y: 300, width: 680, height: 240 };
  const shot = async (rank) => {
    await p.evaluate((r) => window.__goalSkin(r), rank);
    await p.waitForTimeout(260);
    return (await p.screenshot({ clip: band })).toString("base64");
  };
  const diff = async (a, c) => {
    const A = await mean(p, a);
    const B = await mean(p, c);
    let hit = 0;
    // 화소차 6 미만은 안티에일리어싱 잔파동과 구분되지 않으므로 세지 않는다.
    for (let i = 0; i < A.length; i += 1) if (Math.abs(A[i] - B[i]) >= 6) hit += 1;
    return hit / A.length;
  };

  const g0 = await shot(0);
  const g0again = await shot(0);
  const same = await diff(g0, g0again);
  check("control:the-same-grade-draws-the-same-frame", same < 0.005, (same * 100).toFixed(2) + "% moved");

  const moved = [];
  for (let r = 1; r < GOALS.length; r += 1) moved.push(await diff(g0, await shot(r)));
  // 0.5%. 같은 등급을 두 번 찍었을 때의 잔파동이 실측 0에 가깝고, 그 열 배를 넘겨야 사람이 본다.
  check("goalskin:every-grade-changes-the-picture", moved.every((m) => m >= 0.005),
    moved.map((m, i) => "grade " + (i + 1) + " " + (m * 100).toFixed(2) + "%").join(", "));
  check("goalskin:the-top-grade-moves-the-most", moved[moved.length - 1] === Math.max.apply(null, moved),
    moved.map((m) => (m * 100).toFixed(2)).join(" "));

  // 대조군. 그물을 감추면 등급 사이의 차이가 사라진다. 안 사라지면 이 자는 그물을 안 재고 있었다.
  await p.evaluate(() => { window.__netHide(true); });
  await p.waitForTimeout(200);
  const h0 = await shot(0);
  const h3 = await shot(3);
  const hidden = await diff(h0, h3);
  await p.evaluate(() => { window.__netHide(false); });
  check("control:with-the-net-hidden-the-grades-look-alike", hidden < 0.005, (hidden * 100).toFixed(2) + "% moved");

  check("console:no-errors", errs.length === 0, errs.slice(0, 2).join(" | ") || "clean");
  await ctx.close();

  if (notes.length) console.log(notes.map((x) => "  ok   " + x).join(LINE));
  if (fails.length) console.log(fails.map((x) => "  FAIL " + x).join(LINE));
  console.log(fails.length ? "goalskin FAIL " + fails.length : "goalskin PASS " + notes.length);
  if (fails.length) process.exitCode = 1;
} finally {
  clearTimeout(t);
  if (b) await b.close();
}
