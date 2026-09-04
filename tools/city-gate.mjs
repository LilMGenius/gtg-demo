import { chromium } from "playwright";

// 동네 등급이 화면을 바꾸는지 재는 자.
// 이름은 공터와 학교 운동장과 풋살장과 번화가인데, 등급이 실제로 바꾸던 것은 하늘색과 행인 수뿐이라
// 네 곳이 같은 흙바닥에 같은 지평선이었다. 860 육수를 내고 산 자리가 산 것으로 안 보였다.
//
// 축은 둘이다. 경기장 프레임이 등급마다 다른가, 상점 썸네일이 등급마다 다른가.
// 다름을 재는 축에는 같음을 재는 대조군이 붙는다. 같은 등급을 두 번 세우면 같은 그림이어야 한다.
// 그 대조군이 없으면 위의 다름이 장소의 차이인지 매번 다르게 그려지는 잡음인지 안 갈린다.
// 하늘만 갈려도 프레임 전체는 달라지므로, 하늘을 뺀 아래쪽 절반을 따로 한 번 더 잰다.
const EXE = process.env.LOCALAPPDATA + "/ms-playwright/chromium-1228/chrome-win64/chrome.exe";
const BASE = "http://127.0.0.1:10310/web/index.html?seed=20";
const GRADES = [0, 1, 2, 3];
const LINE = String.fromCharCode(10);
const t = setTimeout(() => { console.log("WATCHDOG"); process.exit(1); }, 180000);
t.unref();

const fails = [], notes = [];
const check = (n, ok, d) => (ok ? notes : fails).push(n + " " + d);

let b;
try {
  b = await chromium.launch({ executablePath: EXE });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } });
  const p = await ctx.newPage();
  const errs = [];
  p.on("pageerror", (e) => errs.push(String(e)));
  p.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
  await p.goto(BASE, { waitUntil: "load" });
  await p.waitForSelector("#go", { timeout: 15000 });
  await p.click("#go", { force: true });
  await p.waitForTimeout(1200);
  /* 판이 도는 동안 찍으면 공과 행인이 매 프레임 움직여 같은 등급을 두 번 찍어도 바이트가 갈린다.
     실측으로 대조군이 그 이유로 빨갰다. 판을 멈추고 세계시계를 얼린 뒤에 찍는다. */
  await p.evaluate(() => window.__lockRound());
  await p.evaluate(() => window.__freeze(true));
  await p.waitForTimeout(300);

  // 경기장. 하늘이 위쪽을 먹으므로 아래 절반만 잘라 밟는 면과 지평선 아랫도리를 본다.
  const arena = async (c) => {
    await p.evaluate((n) => window.__crowd(n), c);
    await p.waitForTimeout(320);
    const png = await p.screenshot({ clip: { x: 0, y: 360, width: 1280, height: 360 } });
    return png.toString("base64");
  };
  // 썸네일. 선반이 굽는 함수를 페이지 안에서 직접 부른다. 상점을 열지 않아도 같은 그림이다.
  const thumb = (c) => p.evaluate(async (n) => {
    const m = await import("/web/src/render/thumb.mjs");
    return m.thumbURL("city", {}, n);
  }, c);

  const shots = [], thumbs = [];
  for (const c of GRADES) { shots.push(await arena(c)); thumbs.push(await thumb(c)); }
  const twice = { arena: await arena(GRADES[0]), thumb: await thumb(GRADES[0]) };

  const uniq = (a) => new Set(a).size;
  check("instrument:every-grade-produced-a-picture",
    shots.every((s) => s.length > 1000) && thumbs.every((s) => s && s.length > 1000),
    shots.map((s) => s.length).join("/") + " and " + thumbs.map((s) => (s || "").length).join("/"));
  check("control:the-same-grade-twice-draws-the-same-arena",
    twice.arena === shots[0], twice.arena === shots[0] ? "identical" : "drifted");
  check("control:the-same-grade-twice-draws-the-same-thumbnail",
    twice.thumb === thumbs[0], twice.thumb === thumbs[0] ? "identical" : "drifted");
  check("city:every-grade-stands-somewhere-else",
    uniq(shots) === GRADES.length, uniq(shots) + " of " + GRADES.length + " arenas differ");
  check("city:every-grade-sells-a-different-picture",
    uniq(thumbs) === GRADES.length, uniq(thumbs) + " of " + GRADES.length + " thumbnails differ");
  check("console:no-errors", errs.length === 0, errs.slice(0, 2).join(" | ") || "clean");
  await ctx.close();

  if (notes.length) console.log(notes.map((x) => "  ok   " + x).join(LINE));
  if (fails.length) console.log(fails.map((x) => "  FAIL " + x).join(LINE));
  console.log(fails.length ? "city FAIL " + fails.length : "city PASS " + notes.length);
  if (fails.length) process.exitCode = 1;
} finally {
  clearTimeout(t);
  if (b) await b.close();
}
