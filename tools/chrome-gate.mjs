import { chromium } from "playwright";

// 화면 위 조작 한 벌의 자. 조작 하나가 다른 그림 언어나 다른 색이나 다른 크기를 쓰면
// 그 하나가 남의 화면처럼 보이고, 덮개 밖에 남으면 창이 열린 동안에도 눌린다.
//
// 재는 것은 넷이다. 아이콘이 전부 같은 격자 픽셀로 그려졌는가, 색이 한 토큰인가,
// 판때기 크기가 서로 맞는가, 창을 열면 전부 덮개 아래로 들어가는가.
//
// 덮임은 선언이 아니라 화소로 잰다. z-index를 읽으면 쌓임 맥락이 갈리는 자리를 못 본다.
// 대조군으로 창을 닫은 프레임을 같이 재서, 어두워진 것이 창 때문임을 갈라 놓는다.
const EXE = process.env.LOCALAPPDATA + "/ms-playwright/chromium-1228/chrome-win64/chrome.exe";
const BASE = "http://127.0.0.1:10310/web/index.html?seed=20&preset=rich";
const LINE = String.fromCharCode(10);
const t = setTimeout(() => { console.log("WATCHDOG"); process.exit(1); }, 150000);
t.unref();

const fails = [], notes = [];
const check = (n, ok, d) => (ok ? notes : fails).push(n + " " + d);

// 화면 위 조작 전부. 상태 칩 #top은 조작이 아니라 표시라 여기 안 들어간다.
const IDS = ["mute", "out", "auto", "gymBtn", "rosterBtn", "gramBtn", "shopBtn"];

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

  const scan = await p.evaluate((ids) => {
    const out = [];
    for (const id of ids) {
      const e = document.getElementById(id);
      if (!e) { out.push({ id, missing: true }); continue; }
      const svg = e.querySelector("svg");
      const r = e.getBoundingClientRect();
      const s = getComputedStyle(e);
      out.push({
        id,
        // 격자 픽셀이 아닌 그림. path나 circle이 있으면 손그림 한 벌에서 튄다.
        strays: svg ? svg.querySelectorAll("path,circle,ellipse,polygon,line").length : -1,
        rects: svg ? svg.querySelectorAll("rect").length : -1,
        filled: svg ? svg.getAttribute("fill") : "",
        // 3px 격자에 안 맞는 좌표. 하나라도 있으면 그 아이콘만 다른 눈금 위에 있다.
        offGrid: svg ? [...svg.querySelectorAll("rect")].filter((q) =>
          ["x", "y", "width", "height"].some((k) => Number(q.getAttribute(k)) % 3 !== 0)).length : -1,
        color: s.color,
        // 판때기는 CSS 상자로 잰다. 조작마다 기울기가 달라 getBoundingClientRect는
        // 회전된 상자를 돌려주고, 같은 66x40이 67x42와 68x43으로 갈려 읽힌다.
        w: e.offsetWidth,
        h: e.offsetHeight,
        onScreen: r.top >= 0 && r.bottom <= innerHeight
      });
    }
    const top = document.getElementById("top").getBoundingClientRect();
    const mute = document.getElementById("mute").getBoundingClientRect();
    const lift = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--lift")) || 0;
    return { out, chipGap: Math.round(mute.top - top.bottom), lift };
  }, IDS);

  check("instrument:every-control-was-found", scan.out.every((s) => !s.missing),
    scan.out.filter((s) => s.missing).map((s) => s.id).join(", ") || IDS.length + " controls");
  check("chrome:every-icon-is-drawn-on-the-same-grid", scan.out.every((s) => s.strays === 0 && s.rects > 0 && s.offGrid === 0),
    scan.out.filter((s) => s.strays !== 0 || s.offGrid !== 0).map((s) => s.id + " strays " + s.strays + " offGrid " + s.offGrid).join(", ") || "all rects on 3px");
  const tones = new Set(scan.out.map((s) => s.color));
  check("chrome:every-control-wears-one-colour", tones.size === 1, [...tones].join(" | "));
  const widths = new Set(scan.out.map((s) => s.w));
  const heights = new Set(scan.out.map((s) => s.h));
  // 자동은 판을 여는 큰 버튼이라 혼자 크고, 소리는 정사각 토글이다. 나머지 다섯은 같은 판때기다.
  const row = scan.out.filter((s) => s.id !== "auto" && s.id !== "mute");
  check("chrome:the-column-buttons-share-one-plate", new Set(row.map((s) => s.w + "x" + s.h)).size === 1,
    row.map((s) => s.id + " " + s.w + "x" + s.h).join(", "));
  check("instrument:the-plates-were-not-all-identical-by-accident", widths.size > 1 || heights.size > 1,
    widths.size + " widths, " + heights.size + " heights across all " + scan.out.length);
  // 칩과 버튼은 갈래가 다른 조작이라 gap 게이트가 안 본다. 여기서 본다.
  check("chrome:the-sound-toggle-clears-the-status-chip", scan.chipGap >= scan.lift,
    scan.chipGap + "px against " + scan.lift + "px");

  // 덮임. 창을 연 프레임과 닫은 프레임의 밝기를 조작마다 잰다.
  const lum = async () => p.evaluate((ids) => ids.map((id) => {
    const e = document.getElementById(id);
    const s = getComputedStyle(e);
    return { id, o: Number(s.opacity), f: s.filter };
  }), IDS);
  const shot = async (id) => (await p.locator("#" + id).screenshot()).toString("base64");
  const mean = (a) => p.evaluate((s) => new Promise((res) => {
    const im = new Image();
    im.onload = () => {
      const cv = document.createElement("canvas");
      cv.width = im.width; cv.height = im.height;
      const g = cv.getContext("2d");
      g.drawImage(im, 0, 0);
      const d = g.getImageData(0, 0, im.width, im.height).data;
      let sum = 0;
      for (let i = 0; i < d.length; i += 4) sum += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
      res(sum / (d.length / 4));
    };
    im.src = "data:image/png;base64," + s;
  }), a);

  const before = {};
  for (const id of IDS) before[id] = await mean(await shot(id));
  await p.evaluate(() => window.__shop(true));
  await p.waitForTimeout(400);
  const after = {};
  for (const id of IDS) after[id] = await mean(await shot(id));
  await p.evaluate(() => window.__shop(false));
  await p.waitForTimeout(250);
  const back = {};
  for (const id of IDS) back[id] = await mean(await shot(id));

  // 덮개가 얹히면 밝기가 내려간다. 10%는 배경 #080b07c4가 판때기 위에 앉을 때의 실측 하한이다.
  const lit = IDS.filter((id) => after[id] > before[id] * 0.9);
  check("chrome:opening-a-panel-veils-every-control", lit.length === 0,
    lit.map((id) => id + " " + before[id].toFixed(1) + " to " + after[id].toFixed(1)).join(", ")
    || IDS.map((id) => id + " " + (100 - 100 * after[id] / before[id]).toFixed(0) + "%").join(" "));
  // 대조군. 창을 닫으면 밝기가 돌아와야 한다. 안 돌아오면 위의 하락은 창 때문이 아니다.
  const stuck = IDS.filter((id) => Math.abs(back[id] - before[id]) > before[id] * 0.05);
  check("control:closing-the-panel-restores-every-control", stuck.length === 0,
    stuck.map((id) => id + " " + before[id].toFixed(1) + " to " + back[id].toFixed(1)).join(", ") || "all restored");

  check("console:no-errors", errs.length === 0, errs.slice(0, 2).join(" | ") || "clean");

  // 소리 아이콘을 다시 그렸으니 토글이 그 그림 위에서도 도는지 본다. 파동이 사라지고 사선이 서야 한다.
  const seeSlash = () => p.evaluate(() => {
    const on = [...document.querySelectorAll("#mute .slash")].filter((e) => Number(getComputedStyle(e).opacity) > 0).length;
    const wave = [...document.querySelectorAll("#mute .wave")].filter((e) => Number(getComputedStyle(e).opacity) > 0).length;
    return { on, wave, pressed: document.getElementById("mute").getAttribute("aria-pressed") };
  });
  const loud = await seeSlash();
  await p.click("#mute", { force: true });
  await p.waitForTimeout(200);
  const quiet = await seeSlash();
  await p.click("#mute", { force: true });
  await p.waitForTimeout(200);
  const loudAgain = await seeSlash();
  check("chrome:muting-swaps-the-waves-for-the-slash",
    loud.wave > 0 && loud.on === 0 && quiet.wave === 0 && quiet.on > 0,
    "loud " + loud.wave + "/" + loud.on + " muted " + quiet.wave + "/" + quiet.on);
  check("control:unmuting-puts-the-waves-back", loudAgain.wave === loud.wave && loudAgain.on === 0,
    loudAgain.wave + "/" + loudAgain.on + " pressed " + loudAgain.pressed);
  await ctx.close();

  if (notes.length) console.log(notes.map((x) => "  ok   " + x).join(LINE));
  if (fails.length) console.log(fails.map((x) => "  FAIL " + x).join(LINE));
  console.log(fails.length ? "chrome FAIL " + fails.length : "chrome PASS " + notes.length);
  if (fails.length) process.exitCode = 1;
} finally {
  clearTimeout(t);
  if (b) await b.close();
}
