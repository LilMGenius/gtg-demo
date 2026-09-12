import { chromium } from "playwright";
import { PULL_BULK, pullYield } from "../src/roster.mjs";
import { STAGE_LAST } from "./draw.mjs";

// 뽑기 연출의 자. 열 장이 한 번에 결과 문자열로 뜨면 뽑은 것이 아니라 통보받은 것이다.
//
// 재는 것은 다섯이다. 한 번에 다 안 열리는가, 열린 수가 늘기만 하는가, 끝나면 뽑은 수와 같아지는가,
// 짧게 누르면 한 단만 오르는가, 길게 누르면 남은 것이 한 번에 열리는가.
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
  await p.goto("http://127.0.0.1:10310/web/index.html?seed=20&preset=rich,ticketed,veteran", { waitUntil: "load" });
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
  /* 열 장 회차는 보너스가 붙어 열한 장이 나온다. 값은 열 배 그대로이므로 이 수는 판정이 정하고,
     계기가 열이라고 적으면 묶음 보너스가 결함으로 읽힌다. */
  const yields = pullYield(PULL_BULK);
  check("instrument:the-draw-registered", mid.drawn === yields, mid.drawn + " drawn of " + yields);
  check("reveal:the-first-look-does-not-show-them-all", mid.shown < mid.drawn, mid.shown + " of " + mid.drawn + " up");
  const rising = walk.every((w, i) => i === 0 || w.shown >= walk[i - 1].shown);
  check("reveal:the-count-only-goes-up", rising, walk.map((w) => w.shown).join(" "));
  check("reveal:it-was-still-opening-partway-through", walk.some((w) => w.shown > mid.shown),
    walk.map((w) => w.shown).join(" "));

  // 연출이 도는 중에 이미 치러져 있어야 한다. 이것이 없으면 뒤집기는 결과를 늦추는 장치다.
  const during = await p.evaluate(() => ({ coin: window.__wallet().coin, t: window.__tickets(), squad: window.__squad().squad.length }));
  check("reveal:the-bill-was-settled-before-the-flip", during.squad - before.squad === yields && during.t < before.t,
    "squad " + before.squad + " to " + during.squad + ", tickets " + before.t + " to " + during.t);

  /* 누름이 둘로 갈린다. 짧게 누르면 한 단만 오르고, 길게 누르면 남은 것이 전부 열린다.
     개봉은 상점 카드 안이 아니라 화면 전체를 덮는 자리로 옮겼고, 누름은 그 위를 덮는 버튼이 받는다.
     자동 사다리가 같은 창에서 또 올리면 이 축이 무엇을 잰 것인지 갈리므로, 누른 순간의 상태를
     브라우저 안에서 잡아 그 짝과 비교한다. 누름이 사슬을 다시 걸어 가장 짧은 단이 0.24초 뒤에
     오므로, 누른 직후에 읽으면 자동 전환은 아직 안 온 자리다. */
  await p.evaluate(() => {
    window.__tapAt = null;
    document.addEventListener("pointerup", () => { window.__tapAt = window.__reveal(); }, true);
  });
  let tap = null;
  for (let i = 0; i < 6 && !tap; i += 1) {
    /* 판이 이미 걷혔으면 여기서 그친다. 없는 자리를 누르면 그 기다림이 결과 줄을 통째로 삼켜
       무엇이 빨간지 못 읽는다. 누를 자리가 있고 아직 올릴 단이 남은 창만 이 손을 쓴다. */
    const live = await p.waitForFunction((last) => {
      const e = document.getElementById("pull");
      if (!e || e.hidden) return { gone: true };
      const r = window.__reveal();
      return (r.drawn > 0 && r.shown > 0 && r.shown < r.drawn && r.stage < last) ? { gone: false } : null;
    }, STAGE_LAST, { timeout: 8000, polling: "raf" }).then((h) => h.jsonValue()).catch(() => ({ gone: true }));
    if (live.gone) break;
    await p.evaluate(() => { window.__tapAt = null; });
    await p.click("#pull", { force: true });
    const seen = await p.evaluate(() => ({ pre: window.__tapAt, post: window.__reveal() }));
    if (seen.pre && seen.pre.stage < STAGE_LAST && seen.pre.shown < seen.pre.drawn) tap = seen;
  }
  check("instrument:a-tap-landed-while-a-stage-was-still-left", Boolean(tap),
    tap ? "pressed at stage " + tap.pre.stage + ", " + tap.pre.shown + " of " + tap.pre.drawn
      : "no press landed below the last stage");
  check("reveal:a-tap-opens-one-stage",
    Boolean(tap) && tap.post.shown === tap.pre.shown && tap.post.stage === tap.pre.stage + 1,
    tap ? "stage " + tap.pre.stage + " to " + tap.post.stage + ", shown " + tap.pre.shown
      + " to " + tap.post.shown + " of " + tap.post.drawn : "unmeasured");

  /* 길게 누르면 남은 것이 한 번에 열린다. 손가락이 아직 내려가 있는 동안 열려야 하므로 누름과 뗌을
     따로 보내고 뗌 이전의 상태를 읽는다. 뗌에서야 열리면 그것은 짧은 누름과 같은 물건이다.
     문턱은 제품이 들고 오고 이 자는 그 수를 마주 든다. 뗌이 뒤따라 보내는 누름은 제품이 삼켜야 하므로
     떼고 나서도 화면이 서 있는지 같이 읽는다.
     이 손은 draw.mjs의 pressOpen으로 안 바꾼다. 그것은 돌아오기 전에 손을 떼므로 이 축의 증거인
     손이 내려가 있는 동안의 상태를 아무에게도 안 남기고, 상한도 제품이 말한 문턱에서 뽑는 여기와
     달리 제 상수에서 뽑는다. 재는 물건을 계기가 빌려 쓰면 그 축은 제 자신을 재게 된다.
     사본으로 남는 것은 이 손뿐이고, 마지막 단 번호는 그 파일에서 받는다. */
  const longMs = await p.evaluate(() => Number(window.__reveal().long) || 0);
  check("instrument:the-product-carries-its-own-long-press-threshold", longMs > 0, longMs + "ms");
  const spot = await p.locator("#pull .tap").boundingBox();
  await p.mouse.move(spot.x + spot.width / 2, spot.y + spot.height / 2);
  await p.mouse.down();
  await p.waitForFunction((last) => {
    const r = window.__reveal();
    return r.drawn > 0 && r.shown === r.drawn && r.stage === last;
  }, STAGE_LAST, { timeout: longMs + 4000, polling: "raf" }).catch(() => {});
  const pressed = await p.evaluate(() => window.__reveal());
  await p.mouse.up();
  await p.waitForTimeout(160);
  const let_go = await p.evaluate(() => !document.getElementById("pull").hidden);
  check("reveal:a-long-press-opens-the-rest-at-once",
    pressed.shown === pressed.drawn && pressed.stage === STAGE_LAST && let_go === true,
    pressed.shown + " of " + pressed.drawn + " at stage " + pressed.stage
      + " with the finger still down, still standing after the release " + let_go);
  const faces = await p.evaluate(() => {
    // 지금 서 있는 한 장과 이미 쌓인 줄을 합치면 열린 장 수다. 뒷면은 남아 있으면 안 된다.
    const stacked = [...document.querySelectorAll("#pull .done i")];
    const now = document.querySelector("#pull .now b");
    const up = stacked.concat(now ? [now] : []);
    return { up: up.length, named: up.filter((e) => e.textContent.trim().length > 0).length,
      down: document.querySelectorAll("#pull .now.back").length };
  });
  check("reveal:every-open-card-carries-a-name", faces.up === yields && faces.named === faces.up && faces.down === 0,
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
