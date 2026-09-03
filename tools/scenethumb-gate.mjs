import { chromium } from "playwright";

// 장면 선반의 썸네일 자. 골대와 동네는 몸에 안 걸치는 두 칸이라 진열에서 빠져 있었고,
// 네 칸이 그림 없이 글자만 들고 서 있었다.
//
// 재는 것은 셋이다. 두 선반이 그림을 갖는가, 등급마다 그림이 다른가, 그림이 실제 화소인가.
// 다름을 재는 축에는 같음을 재는 대조군이 붙는다. 같은 등급을 두 번 구우면 같은 그림이어야 한다.
const EXE = process.env.LOCALAPPDATA + "/ms-playwright/chromium-1228/chrome-win64/chrome.exe";
const LINE = String.fromCharCode(10);
const t = setTimeout(() => { console.log("WATCHDOG"); process.exit(1); }, 150000);
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
  await p.goto("http://127.0.0.1:10310/web/index.html?seed=20&preset=rich", { waitUntil: "load" });
  await p.waitForSelector("#go", { timeout: 15000 });
  await p.click("#go", { force: true });
  await p.waitForTimeout(1300);
  await p.evaluate(() => window.__shop(true));
  await p.waitForTimeout(320);

  for (const tab of ["frame", "city"]) {
    await p.click('#shop .tab[data-tab="' + tab + '"]', { force: true });
    await p.waitForSelector('#shop .card[data-spec="' + tab + '"]', { timeout: 8000 });
    await p.waitForTimeout(500);
    const shots = await p.evaluate((q) => [...document.querySelectorAll(q)].map((e) => {
      const im = e.querySelector("img");
      return im ? im.src.length : 0;
    }), '#shop .card[data-spec="' + tab + '"] .shot');
    check("scenethumb:" + tab + "-every-card-carries-a-picture", shots.length === 4 && shots.every((s) => s > 1000),
      shots.join(", "));
    const uniq = await p.evaluate((q) => new Set([...document.querySelectorAll(q)].map((e) => {
      const im = e.querySelector("img");
      return im ? im.src : "";
    })).size, '#shop .card[data-spec="' + tab + '"] .shot');
    check("scenethumb:" + tab + "-every-grade-bakes-a-different-picture", uniq === shots.length,
      uniq + " distinct of " + shots.length);
  }

  // 그림이 실제 화소인가. 데이터 URL이 길다는 것과 무엇이 그려졌다는 것은 다른 주장이다.
  const ink = await p.evaluate(() => new Promise((res) => {
    const im0 = document.querySelector('#shop .card[data-spec="city"] .shot img');
    const im = new Image();
    im.onload = () => {
      const cv = document.createElement("canvas");
      cv.width = im.width; cv.height = im.height;
      const g = cv.getContext("2d");
      g.drawImage(im, 0, 0);
      const d = g.getImageData(0, 0, im.width, im.height).data;
      let lit = 0;
      // 알파가 있는 화소만 센다. 빈 캔버스는 전부 알파 0이라 이 수가 0이 된다.
      for (let i = 3; i < d.length; i += 4) if (d[i] > 8) lit += 1;
      res(lit / (d.length / 4));
    };
    im.src = im0.src;
  }));
  check("scenethumb:the-picture-is-actually-drawn", ink > 0.2, (ink * 100).toFixed(1) + "% of the tile is painted");

  // 대조군. 같은 등급을 두 번 구우면 같은 그림이다. 안 그러면 위의 다름은 잡음이다.
  const twice = await p.evaluate(async () => {
    const m = await import("/web/src/render/thumb.mjs");
    const a = m.thumbURL("frame", window.__squad ? {} : {}, 0);
    const c = m.thumbURL("frame", {}, 0);
    const d = m.thumbURL("frame", {}, 3);
    return { same: a === c, moved: a !== d, len: a.length };
  });
  check("control:the-same-grade-bakes-the-same-picture", twice.same, twice.same ? "identical" : "drifted");
  check("control:a-different-grade-bakes-a-different-picture", twice.moved, twice.moved ? "moved" : "same bytes");

  check("console:no-errors", errs.length === 0, errs.slice(0, 2).join(" | ") || "clean");
  await ctx.close();

  if (notes.length) console.log(notes.map((x) => "  ok   " + x).join(LINE));
  if (fails.length) console.log(fails.map((x) => "  FAIL " + x).join(LINE));
  console.log(fails.length ? "scenethumb FAIL " + fails.length : "scenethumb PASS " + notes.length);
  if (fails.length) process.exitCode = 1;
} finally {
  clearTimeout(t);
  if (b) await b.close();
}

