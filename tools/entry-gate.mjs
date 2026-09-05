import { chromium } from "playwright";

// 진입점이 장르 표준을 따르는지 재는 자.
// 자기 정보는 초상화로 열고, 재화를 누르면 버는 법이 열리고, 상점은 제 버튼을 갖는다.
// 지금은 레벨 글자가 내 정보를 열고 재화 칩이 상점을 연다. 둘 다 button 요소가 아니라
// 글자라서 누를 수 있다는 신호가 화면에 없다. 열린다는 것과 누를 생각이 든다는 것은 다른 주장이다.
//
// 문턱을 지어내지 않는다. 축은 전부 참거짓이다. 무엇이 무엇을 여는가와,
// 누름을 받는 것이 button 요소인가만 묻는다.
const EXE = process.env.LOCALAPPDATA + "/ms-playwright/chromium-1228/chrome-win64/chrome.exe";
const BASE = "http://127.0.0.1:10310/web/index.html?seed=20&preset=veteran";
const LINE = String.fromCharCode(10);
const t = setTimeout(() => { console.log("WATCHDOG"); process.exit(1); }, 120000);
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
  await p.goto(BASE, { waitUntil: "load" });
  await p.waitForSelector("#go", { timeout: 15000 });
  await p.click("#go", { force: true });
  await p.waitForTimeout(1200);

  const shown = (id) => p.evaluate((i) => { const e = document.getElementById(i); return Boolean(e) && !e.hidden; }, id);
  const shut = async () => { await p.evaluate(() => { for (const i of ["me", "shop", "gym", "roster", "gram", "earn"]) { const e = document.getElementById(i); if (e) e.hidden = true; } document.body.classList.remove("panelOpen"); }); await p.waitForTimeout(120); };
  const tap = async (sel) => { await shut(); const e = await p.$(sel); if (!e) return false; await e.click({ force: true }); await p.waitForTimeout(260); return true; };

  // 대조군. 이미 button인 훈련장이 훈련장을 연다. 여기가 거짓이면 이 자의 클릭이 안 닿는 것이다.
  const ctlHit = await tap("#gymBtn");
  check("control:a-known-button-opens-its-panel", ctlHit && (await shown("gym")), String(ctlHit));
  // 대조군. 빈 자리를 눌러도 아무 창이 안 열려야 한다. 열리면 이 자가 클릭이 아니라 시간을 재고 있는 것이다.
  await shut();
  await p.mouse.click(640, 400);
  await p.waitForTimeout(200);
  const stray = [];
  for (const id of ["me", "shop", "gym", "roster", "gram", "earn"]) if (await shown(id)) stray.push(id);
  check("control:an-empty-spot-opens-nothing", stray.length === 0, stray.join(",") || "none");

  const hitMe = await tap("#meBtn");
  check("entry:a-portrait-button-opens-my-page", hitMe && (await shown("me")), hitMe ? "opened " + (await shown("me")) : "#meBtn missing");
  const hitShop = await tap("#shopBtn");
  check("entry:the-shop-has-its-own-button", hitShop && (await shown("shop")), hitShop ? "opened " + (await shown("shop")) : "#shopBtn missing");
  const hitPurse = await tap("#purse");
  check("entry:currency-does-not-open-the-shop", hitPurse && !(await shown("shop")), hitPurse ? "shop " + (await shown("shop")) : "#purse missing");
  check("entry:currency-opens-how-to-earn", hitPurse && (await shown("earn")), hitPurse ? "earn " + (await shown("earn")) : "#purse missing");

  // 누름을 받는 것은 button이어야 한다. 글자 조각에 붙은 핸들러는 누를 수 있다는 신호를 화면에 안 낸다.
  const handlers = await p.evaluate(() => { const bad = []; for (const el of document.querySelectorAll("#hud *")) { if (!el.onclick && !el.onpointerdown) continue; if (el.tagName !== "BUTTON") bad.push((el.id || el.className || el.tagName) + ":" + el.tagName.toLowerCase()); } return bad; });
  check("affordance:every-hud-click-target-is-a-button", handlers.length === 0, handlers.join(", ") || "all buttons");
  check("console:no-errors", errs.length === 0, errs.slice(0, 2).join(" | ") || "clean");
  await ctx.close();

  if (notes.length) console.log(notes.map((x) => "  ok   " + x).join(LINE));
  if (fails.length) console.log(fails.map((x) => "  FAIL " + x).join(LINE));
  console.log(fails.length ? "entry FAIL " + fails.length : "entry PASS " + notes.length);
  if (fails.length) process.exitCode = 1;
} finally {
  clearTimeout(t);
  if (b) await b.close();
}
