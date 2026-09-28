import { chromium } from "playwright";
// 좌우 이동 판의 자. 모바일 액션 게임의 가상 버튼은 엄지 하나를 다 덮는 크기이고, 옛 64px 판은 그 반도 안 됐다(파운더 2026-09-28, 가로세로 세 배).
// 재는 것은 셋이다. 판이 큰가(넓은 화면 192px, 짧은 화면은 세로 40퍼센트 이상), 바탕이 비어 경기장이 비치는가, HUD 버튼과 안 겹치는가.
// 대조군은 옛 규칙(64px, 판때기 바탕)을 심은 판이다. 셋 중 둘이 빨개져야 자가 판을 보고 있다.
const EXE = process.env.LOCALAPPDATA + "/ms-playwright/chromium-1228/chrome-win64/chrome.exe";
const URL = "http://127.0.0.1:10310/web/index.html?seed=20&preset=rich,veteran";
const SIZES = [[1920, 1080], [1280, 720], [844, 390], [740, 360]];
const fails = [], notes = [];
const check = (n, ok, d) => (ok ? notes : fails).push(n + " " + d);
setTimeout(() => { console.log("pad FAIL watchdog"); process.exit(1); }, 240000).unref();
const read = (p) => p.evaluate(() => {
  const R = (e) => { const b = e.getBoundingClientRect(); return { l: b.left, r: b.right, t: b.top, b: b.bottom, w: b.width, h: b.height }; };
  const arr = [...document.querySelectorAll(".move-arrow")];
  const boxes = arr.map(R);
  const others = [...document.querySelectorAll("#hud > button, #top")].filter((e) => e.getClientRects().length && !e.hidden).map((e) => ({ id: e.id, ...R(e) }));
  const hit = [];
  for (const a of boxes) for (const o of others) if (a.l < o.r - 1 && o.l < a.r - 1 && a.t < o.b - 1 && o.t < a.b - 1) hit.push(o.id);
  const bg = arr.map((e) => getComputedStyle(e).backgroundColor);
  const clear = bg.every((c) => c === "transparent" || /rgba\(.*,\s*0(\.\d+)?\)$/.test(c) && Number(c.match(/,\s*([\d.]+)\)$/)[1]) <= 0.3);
  return { n: arr.length, side: Math.min(...boxes.map((b) => Math.min(b.w, b.h))), vh: innerHeight, clear, bg: bg[0], hit };
});
const b = await chromium.launch({ executablePath: EXE });
try {
  for (const [W, H] of SIZES) {
    const p = await (await b.newContext({ viewport: { width: W, height: H } })).newPage();
    await p.goto(URL, { waitUntil: "load" });
    await p.waitForTimeout(700);
    await p.click("#go", { force: true });
    await p.waitForTimeout(1400);
    const s = await read(p);
    const big = (v) => v.side >= Math.min(192, 0.4 * v.vh);
    const tag = W + "x" + H;
    check(tag + ":pad:two-arrows-a-thumb-covers", s.n === 2 && big(s), s.side.toFixed(0) + "px of " + s.vh);
    check(tag + ":pad:the-pitch-shows-through", s.clear, s.bg);
    check(tag + ":pad:no-hud-button-under-an-arrow", s.hit.length === 0, s.hit.join(",") || "clear");
    if (W === 1280) {
      await p.addStyleTag({ content: ".move-arrow{width:64px!important;height:64px!important;background:#1b2318!important}" });
      const o = await read(p);
      check(tag + ":control:the-old-64px-panel-is-caught", !big(o) && !o.clear, o.side + "px " + o.bg);
    }
    await p.close();
  }
} catch (e) { check("instrument:run-completed", false, String(e).slice(0, 200)); }
await b.close();
for (const n of notes) console.log("  ok   " + n);
for (const f of fails) console.log("  FAIL " + f);
console.log(fails.length ? "pad FAIL " + fails.length : "pad PASS " + notes.length);
process.exitCode = fails.length ? 1 : 0;
