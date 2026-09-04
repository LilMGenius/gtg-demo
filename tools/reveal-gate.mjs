import { chromium } from "playwright";
import { PULL_BULK } from "../src/roster.mjs";

// 뽑기 연출의 자. 열 장이 한 번에 결과 문자열로 뜨면 뽑은 것이 아니라 통보받은 것이다.
//
// 재는 것은 넷이다. 한 번에 다 안 열리는가, 열린 수가 늘기만 하는가, 끝나면 뽑은 수와 같아지는가,
// 그리고 눌렀을 때 남은 것이 즉시 열리는가.
//
// 연출이 판정을 미루면 안 된다. 카드가 아직 뒤집히는 중에도 지갑과 명단은 이미 치러져 있어야 하고,
// 그 대조군이 없으면 이 연출은 결과를 늦추는 장치와 구분되지 않는다.
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
  await p.goto("http://127.0.0.1:10310/web/index.html?seed=20&preset=rich,ticketed", { waitUntil: "load" });
  await p.waitForSelector("#go", { timeout: 15000 });
  await p.click("#go", { force: true });
  await p.waitForTimeout(1300);
  await p.evaluate(() => window.__shop(true));
  await p.waitForSelector("#shop .buy[data-want]", { timeout: 8000 });

  const before = await p.evaluate(() => ({ coin: window.__wallet().coin, t: window.__tickets(), squad: window.__squad().squad.length }));
  await p.click('#shop .buy[data-want="' + PULL_BULK + '"]', { force: true });

  /* 뒤집는 동안 몇 번 들여다본다. 부하가 걸리면 더 느려질 뿐이라 이 축은 느린 기계에서 더 안전하다.
     간격은 한 장에 쓰는 시간보다 짧고, 여섯 번을 합치면 두 장 넘게 지나야 한 장이 느는 것을 본다.
     60ms 여섯 번은 0.36초라 640ms짜리 한 장 안에서 끝나 아무것도 안 늘었다. */
  const walk = [];
  for (let i = 0; i < 6; i += 1) {
    walk.push(await p.evaluate(() => window.__reveal()));
    await p.waitForTimeout(400);
  }
  const mid = walk[0];
  check("instrument:the-draw-registered", mid.drawn === PULL_BULK, mid.drawn + " drawn");
  check("reveal:the-first-look-does-not-show-them-all", mid.shown < mid.drawn, mid.shown + " of " + mid.drawn + " up");
  const rising = walk.every((w, i) => i === 0 || w.shown >= walk[i - 1].shown);
  check("reveal:the-count-only-goes-up", rising, walk.map((w) => w.shown).join(" "));
  check("reveal:it-was-still-opening-partway-through", walk.some((w) => w.shown > mid.shown),
    walk.map((w) => w.shown).join(" "));

  // 연출이 도는 중에 이미 치러져 있어야 한다. 이것이 없으면 뒤집기는 결과를 늦추는 장치다.
  const during = await p.evaluate(() => ({ coin: window.__wallet().coin, t: window.__tickets(), squad: window.__squad().squad.length }));
  check("reveal:the-bill-was-settled-before-the-flip", during.squad - before.squad === PULL_BULK && during.t < before.t,
    "squad " + before.squad + " to " + during.squad + ", tickets " + before.t + " to " + during.t);

  // 눌러서 남은 것을 연다. 개봉은 상점 카드 안이 아니라 화면 전체를 덮는 자리로 옮겼다.
  await p.click("#pull", { force: true });
  await p.waitForTimeout(160);
  const tapped = await p.evaluate(() => window.__reveal());
  check("reveal:a-tap-opens-the-rest-at-once", tapped.shown === tapped.drawn, tapped.shown + " of " + tapped.drawn);
  const faces = await p.evaluate(() => {
    // 지금 서 있는 한 장과 이미 쌓인 줄을 합치면 열린 장 수다. 뒷면은 남아 있으면 안 된다.
    const stacked = [...document.querySelectorAll("#pull .done i")];
    const now = document.querySelector("#pull .now b");
    const up = stacked.concat(now ? [now] : []);
    return { up: up.length, named: up.filter((e) => e.textContent.trim().length > 0).length,
      down: document.querySelectorAll("#pull .now.back").length };
  });
  check("reveal:every-open-card-carries-a-name", faces.up === PULL_BULK && faces.named === faces.up && faces.down === 0,
    faces.up + " up, " + faces.named + " named, " + faces.down + " still down");

  // 대조군. 상점을 닫으면 개봉도 걷히고 다음에 열었을 때 지난 결과가 안 남는다.
  await p.evaluate(() => window.__shop(false));
  await p.waitForTimeout(150);
  await p.evaluate(() => window.__shop(true));
  await p.waitForTimeout(300);
  const reopened = await p.evaluate(() => ({ r: window.__reveal(), open: !document.getElementById("pull").hidden }));
  check("control:reopening-the-shop-shows-no-old-result", reopened.r.drawn === 0 && reopened.open === false,
    reopened.r.drawn + " drawn, reveal open " + reopened.open);

  check("console:no-errors", errs.length === 0, errs.slice(0, 2).join(" | ") || "clean");
  await ctx.close();

  if (notes.length) console.log(notes.map((x) => "  ok   " + x).join(LINE));
  if (fails.length) console.log(fails.map((x) => "  FAIL " + x).join(LINE));
  console.log(fails.length ? "reveal FAIL " + fails.length : "reveal PASS " + notes.length);
  if (fails.length) process.exitCode = 1;
} finally {
  clearTimeout(t);
  if (b) await b.close();
}
