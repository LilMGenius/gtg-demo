import { chromium } from "playwright";

// 능력치 아이콘의 자. 열다섯 칸이 훈련장과 내 정보 두 화면에 서는데, 이름만 있으면
// 어느 칸인지 매번 읽어야 하고 같은 칸이 두 화면에서 다르게 보여도 아무도 모른다.
//
// 재는 것은 다섯이다. 두 화면 모두 칸마다 아이콘이 하나씩 있는가, 같은 칸이 두 화면에서
// 같은 그림인가, 그림이 칸마다 다른가, 격자 위에 있는가, 화소로 찍혔는가.
//
// 그림이 그 능력치로 읽히는지는 계기가 답하지 못한다. 겹침으로 재면 눈과 반대로 나오는 것을
// 탭 아이콘 랩에서 이미 확인했다. 그래서 판정은 눈에 맡기고 이 자는 그 눈이 볼 판을 굽는다.
const EXE = process.env.LOCALAPPDATA + "/ms-playwright/chromium-1228/chrome-win64/chrome.exe";
const BASE = "http://127.0.0.1:10310/web/index.html?seed=20&preset=rich";
const LINE = String.fromCharCode(10);
const t = setTimeout(() => { console.log("WATCHDOG"); process.exit(1); }, 150000);
t.unref();

const fails = [], notes = [];
const check = (n, ok, d) => (ok ? notes : fails).push(n + " " + d);

const print = (sel) => {
  const out = [];
  for (const e of document.querySelectorAll(sel)) {
    const svg = e.querySelector("svg");
    out.push({
      name: svg ? (svg.getAttribute("aria-label") || "") : "",
      icons: e.querySelectorAll("svg").length,
      ink: svg ? [...svg.querySelectorAll("rect")].map((q) => q.getAttribute("x") + "," + q.getAttribute("y") + "," + q.getAttribute("width") + "," + q.getAttribute("height")).join(" ") : "",
      offGrid: svg ? [...svg.querySelectorAll("rect")].filter((q) =>
        ["x", "y", "width", "height"].some((k) => Number(q.getAttribute(k)) % 3 !== 0)).length : -1,
      strays: svg ? svg.querySelectorAll("path,circle,ellipse,polygon,line").length : -1
    });
  }
  return out;
};

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

  await p.click("#gymBtn", { force: true });
  await p.waitForSelector("#gym .row button", { timeout: 8000 });
  const gym = await p.evaluate(print, "#gym .row button");
  await p.click("#gym .close", { force: true });
  await p.waitForTimeout(200);

  await p.evaluate(() => window.__me(true));
  // 직계만 센다. 칸 안에 이름과 아이콘을 묶는 span이 하나 더 있어, 후손을 세면 칸이 두 배로 읽힌다.
  await p.waitForSelector("#me .grid > span", { timeout: 8000 });
  const me = await p.evaluate(print, "#me .grid > span");

  check("instrument:both-screens-listed-the-same-count", gym.length === me.length && gym.length > 0,
    gym.length + " in the gym, " + me.length + " in the profile");
  for (const [where, rows] of [["gym", gym], ["profile", me]]) {
    check("staticon:" + where + "-gives-every-stat-one-icon", rows.every((r) => r.icons === 1),
      rows.filter((r) => r.icons !== 1).map((r) => r.name + ":" + r.icons).join(", ") || rows.length + " of " + rows.length);
    check("staticon:" + where + "-draws-every-icon-on-the-grid", rows.every((r) => r.strays === 0 && r.offGrid === 0),
      rows.filter((r) => r.strays !== 0 || r.offGrid !== 0).map((r) => r.name).join(", ") || "all rects on 3px");
    const shapes = new Set(rows.map((r) => r.ink));
    check("staticon:" + where + "-draws-a-different-shape-per-stat", shapes.size === rows.length,
      shapes.size + " distinct of " + rows.length);
  }
  // 같은 칸이 두 화면에서 같은 그림인가. 한쪽만 고치면 같은 능력치가 두 얼굴을 갖는다.
  const drift = gym.filter((g, i) => !me[i] || me[i].ink !== g.ink || me[i].name !== g.name);
  check("staticon:the-two-screens-agree-on-every-stat", drift.length === 0,
    drift.map((g) => g.name).join(", ") || gym.length + " stats match across both");

  // 잉크. 칸 하나를 켜고 끄고 아이콘 상자 안에서만 잰다. 문턱 8%는 ui-gate와 같은 창이다.
  const win = await p.evaluate(() => {
    const e = document.querySelector("#me .grid > span");
    const g = e.querySelector("svg");
    const a = e.getBoundingClientRect(), c = g.getBoundingClientRect();
    return { x: (c.left - a.left) / a.width, y: (c.top - a.top) / a.height, w: c.width / a.width, h: c.height / a.height };
  });
  const one = p.locator("#me .grid > span").first();
  const on = (await one.screenshot()).toString("base64");
  await p.evaluate(() => { document.querySelector("#me .grid > span svg").style.visibility = "hidden"; });
  const off = (await one.screenshot()).toString("base64");
  await p.evaluate(() => { document.querySelector("#me .grid > span svg").style.visibility = ""; });
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
  check("staticon:the-icon-is-drawn-over-8pct", cover >= 0.08, (cover * 100).toFixed(1) + "%");

  // 눈이 볼 판. 열다섯을 110px로 키워 이름과 함께 한 장에 눕힌다.
  await p.evaluate(() => {
    const board = document.createElement("div");
    board.id = "statBoard";
    board.style.cssText = "position:fixed;inset:0;z-index:99999;background:#12180f;display:grid;grid-template-columns:repeat(5,1fr);align-content:start;gap:8px;padding:14px;color:#9aa495";
    for (const e of document.querySelectorAll("#me .grid > span")) {
      const cell = document.createElement("div");
      cell.style.cssText = "display:flex;flex-direction:column;align-items:center;gap:4px;font:400 17px sans-serif";
      const svg = e.querySelector("svg").cloneNode(true);
      svg.style.cssText = "width:110px;height:110px";
      cell.appendChild(svg);
      const t = document.createElement("span");
      t.textContent = svg.getAttribute("aria-label");
      cell.appendChild(t);
      board.appendChild(cell);
    }
    document.body.appendChild(board);
  });
  await p.waitForTimeout(200);
  const BOARD = "staticons.local.png";
  await p.screenshot({ path: BOARD });
  const cells = await p.evaluate(() => document.querySelectorAll("#statBoard > div").length);
  check("instrument:a-board-for-the-eye-was-baked", cells === me.length, cells + " icons at 110px in " + BOARD);

  check("console:no-errors", errs.length === 0, errs.slice(0, 2).join(" | ") || "clean");
  await ctx.close();

  if (notes.length) console.log(notes.map((x) => "  ok   " + x).join(LINE));
  if (fails.length) console.log(fails.map((x) => "  FAIL " + x).join(LINE));
  console.log(fails.length ? "staticon FAIL " + fails.length : "staticon PASS " + notes.length);
  if (fails.length) process.exitCode = 1;
} finally {
  clearTimeout(t);
  if (b) await b.close();
}
