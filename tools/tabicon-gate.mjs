import { chromium } from "playwright";

// 상점 탭 아이콘의 자. 열한 칸이 글자로만 서 있으면 어느 칸이 무엇을 파는지 매번 읽어야 한다.
//
// 재는 것은 셋이다. 칸마다 아이콘이 하나씩 있는가, 그 그림이 칸마다 다른가, 그리고 DOM에만
// 있는 게 아니라 화소로 찍혔는가. 다름을 재는 축에는 같음을 재는 대조군이 붙는다.
// 같은 칸을 두 번 읽으면 같은 그림이어야 하고, 아이콘을 끄면 잉크 축이 잡아야 한다.
//
// 아이콘이 들어오면 칸이 넓어져 줄 수가 는다. 좁은 화면에서 탭이 화면 밖으로 나가는지는
// maxview가 소유하므로 여기서는 한 화면 안에 다 서 있는지만 본다.
const EXE = process.env.LOCALAPPDATA + "/ms-playwright/chromium-1228/chrome-win64/chrome.exe";
const BASE = "http://127.0.0.1:10310/web/index.html?seed=20&preset=rich,veteran";
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
  await p.goto(BASE, { waitUntil: "load" });
  await p.waitForSelector("#go", { timeout: 15000 });
  await p.click("#go", { force: true });
  await p.waitForTimeout(1300);
  await p.evaluate(() => window.__shop(true));
  await p.waitForTimeout(320);

  const scan = await p.evaluate(() => {
    const tabs = [...document.querySelectorAll("#shop .tab")];
    return tabs.map((e) => {
      const svg = e.querySelector("svg");
      const label = e.querySelector("span");
      const r = e.getBoundingClientRect();
      return {
        tab: e.dataset.tab,
        icons: e.querySelectorAll("svg").length,
        // 그림 자체를 지문으로 삼는다. 두 칸이 같은 사각형 묶음을 쓰면 같은 문자열이 나온다.
        ink: svg ? [...svg.querySelectorAll("rect")].map((q) => q.getAttribute("x") + "," + q.getAttribute("y") + "," + q.getAttribute("width") + "," + q.getAttribute("height")).join(" ") : "",
        named: svg ? (svg.getAttribute("aria-label") || "") : "",
        words: label ? label.textContent.trim() : "",
        onScreen: r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth
      };
    });
  });

  check("instrument:the-shop-showed-its-tabs", scan.length === 11, scan.length + " tabs");
  check("tabicon:every-tab-carries-exactly-one-icon", scan.every((s) => s.icons === 1),
    scan.filter((s) => s.icons !== 1).map((s) => s.tab + ":" + s.icons).join(", ") || "11 of 11");
  check("tabicon:every-tab-keeps-its-name-beside-the-icon", scan.every((s) => s.words.length > 0),
    scan.filter((s) => !s.words).map((s) => s.tab).join(", ") || scan.map((s) => s.words).join(" "));
  const shapes = new Set(scan.map((s) => s.ink));
  check("tabicon:no-two-tabs-draw-the-same-shape", shapes.size === scan.length, shapes.size + " distinct of " + scan.length);
  const names = new Set(scan.map((s) => s.named));
  check("tabicon:every-icon-names-itself-for-a-reader", names.size === scan.length && !names.has(""), names.size + " labels");
  check("tabicon:every-tab-is-inside-the-viewport", scan.every((s) => s.onScreen),
    scan.filter((s) => !s.onScreen).map((s) => s.tab).join(", ") || "11 on screen");

  // 대조군 하나. 같은 칸을 두 번 읽으면 같은 지문이 나와야 한다. 안 그러면 위의 다름은 잡음이다.
  const again = await p.evaluate(() => {
    const e = document.querySelector('#shop .tab[data-tab="glove"] svg');
    return [...e.querySelectorAll("rect")].map((q) => q.getAttribute("x") + "," + q.getAttribute("y") + "," + q.getAttribute("width") + "," + q.getAttribute("height")).join(" ");
  });
  const first = scan.find((s) => s.tab === "glove");
  check("control:the-same-tab-draws-the-same-shape", again === first.ink, again.slice(0, 28));

  // 잉크. 한 칸을 켜고 끄고 찍어 아이콘 상자 안이 실제로 잉크를 먹었는지 본다.
  // 창은 아이콘 제 상자다. 칸 전체를 창으로 쓰면 옆의 글자가 분모를 키운다. 문턱 8%는 ui-gate와 같다.
  const win = await p.evaluate(() => {
    const e = document.querySelector('#shop .tab[data-tab="frame"]');
    const g = e.querySelector("svg");
    const a = e.getBoundingClientRect(), c = g.getBoundingClientRect();
    return { x: (c.left - a.left) / a.width, y: (c.top - a.top) / a.height, w: c.width / a.width, h: c.height / a.height };
  });
  const one = p.locator('#shop .tab[data-tab="frame"]');
  const on = (await one.screenshot()).toString("base64");
  await p.evaluate(() => { document.querySelector('#shop .tab[data-tab="frame"] svg').style.visibility = "hidden"; });
  const off = (await one.screenshot()).toString("base64");
  await p.evaluate(() => { document.querySelector('#shop .tab[data-tab="frame"] svg').style.visibility = ""; });
  const cover = await p.evaluate(([a, c, box]) => {
    const load = (s) => new Promise((res) => {
      const im = new Image();
      im.onload = () => {
        const cv = document.createElement("canvas");
        cv.width = im.width; cv.height = im.height;
        const g = cv.getContext("2d");
        g.drawImage(im, 0, 0);
        res(g.getImageData(0, 0, im.width, im.height));
      };
      im.src = "data:image/png;base64," + s;
    });
    return Promise.all([load(a), load(c)]).then(([A, B]) => {
      const L = (d, i) => 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
      const x0 = Math.floor(box.x * A.width), y0 = Math.floor(box.y * A.height);
      const x1 = Math.ceil((box.x + box.w) * A.width), y1 = Math.ceil((box.y + box.h) * A.height);
      let hit = 0, n = 0;
      // 화소차 6 미만은 안티에일리어싱 잔파동과 구분되지 않으므로 세지 않는다.
      for (let y = y0; y < y1 && y < A.height; y += 1) {
        for (let x = x0; x < x1 && x < A.width; x += 1) {
          const i = (y * A.width + x) * 4;
          n += 1;
          if (Math.abs(L(A.data, i) - L(B.data, i)) >= 6) hit += 1;
        }
      }
      return hit / n;
    });
  }, [on, off, win]);
  check("tabicon:the-icon-is-drawn-over-8pct", cover >= 0.08, (cover * 100).toFixed(1) + "%");

  // 그림이 그 물건으로 읽히는가는 계기가 답하지 못한다. 채워진 면적의 겹침으로 재 봤더니
  // 눈에 거의 같던 옛 머리와 골대가 0.18이고, 눈에 확연히 다른 지금 빗과 봇이 0.69였다.
  // 그래서 판정은 사람 눈에 맡기고, 이 자는 그 눈이 볼 것을 굽는다. 열한 개를 120px로 키워 한 장에 눕힌다.
  await p.evaluate(() => {
    const board = document.createElement("div");
    board.id = "iconBoard";
    board.style.cssText = "position:fixed;inset:0;z-index:99999;background:#12180f;display:grid;grid-template-columns:repeat(4,1fr);align-content:start;gap:10px;padding:16px;color:#ffd83d";
    for (const e of document.querySelectorAll("#shop .tab")) {
      const cell = document.createElement("div");
      cell.style.cssText = "display:flex;flex-direction:column;align-items:center;gap:6px;font:400 22px sans-serif";
      const svg = e.querySelector("svg").cloneNode(true);
      svg.style.cssText = "width:120px;height:120px";
      cell.appendChild(svg);
      const t = document.createElement("span");
      t.textContent = e.querySelector("span").textContent;
      cell.appendChild(t);
      board.appendChild(cell);
    }
    document.body.appendChild(board);
  });
  await p.waitForTimeout(200);
  const BOARD = "tabicons.local.png";
  await p.screenshot({ path: BOARD });
  const cells = await p.evaluate(() => document.querySelectorAll("#iconBoard > div").length);
  check("instrument:a-board-for-the-eye-was-baked", cells === 11, cells + " icons at 120px in " + BOARD);

  check("console:no-errors", errs.length === 0, errs.slice(0, 2).join(" | ") || "clean");
  await ctx.close();

  if (notes.length) console.log(notes.map((x) => "  ok   " + x).join(LINE));
  if (fails.length) console.log(fails.map((x) => "  FAIL " + x).join(LINE));
  console.log(fails.length ? "tabicon FAIL " + fails.length : "tabicon PASS " + notes.length);
  if (fails.length) process.exitCode = 1;
} finally {
  clearTimeout(t);
  if (b) await b.close();
}
