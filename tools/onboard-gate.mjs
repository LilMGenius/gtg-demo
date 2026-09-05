import { chromium } from "playwright";
import { PULL_BULK, PULL_BONUS, pullYield, ELEVEN, ROLES, ROLE_SLOTS, kickerByName } from "../src/roster.mjs";

// 첫 진입의 자. 가입 직후 아무것도 안 뽑고 판이 열렸다. 첫 키퍼와 주전 열하나가 조용히 배정돼서
// 플레이어는 자기가 무엇을 들고 시작하는지를 본 적이 없었고, 이 장르가 파는 첫 순간이 통째로 없었다.
//
// 축은 넷이다. 처음 온 사람에게 카드가 열리는가, 첫 키퍼가 못 박혀 있는가,
// 이어서 키커 열한 장이 오는가, 그 열한 장이 실제로 주전에 서는가.
// 대조군은 이미 하던 사람이다. 그 사람에게 이 화면이 다시 열리면 판이 뒤집힌다.
const EXE = process.env.LOCALAPPDATA + "/ms-playwright/chromium-1228/chrome-win64/chrome.exe";
const BASE = "http://127.0.0.1:10310/web/index.html?seed=20";
const LINE = String.fromCharCode(10);
const t = setTimeout(() => { console.log("WATCHDOG"); process.exit(1); }, 180000);
t.unref();

const fails = [], notes = [];
const check = (n, ok, d) => (ok ? notes : fails).push(n + " " + d);

check("instrument:the-bulk-draw-yields-one-more-than-it-charges",
  pullYield(PULL_BULK) === PULL_BULK + PULL_BONUS && pullYield(1) === 1,
  pullYield(1) + " for one, " + pullYield(PULL_BULK) + " for " + PULL_BULK);

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
  await p.waitForSelector("#pull .now", { timeout: 10000 });
  await p.waitForTimeout(500);

  const first = await p.evaluate(() => ({
    open: !document.getElementById("pull").hidden,
    n: window.__reveal().drawn,
    name: (document.querySelector("#pull .now b") || {}).textContent || ""
  }));
  check("onboard:a-new-player-opens-a-card-before-a-ball", first.open && first.n === 1,
    "open " + first.open + ", cards " + first.n);
  // 첫 키퍼는 못 박혀 있다. 처음 오는 사람마다 다른 게임을 시작하면 튜토리얼이 설 자리가 없다.
  check("onboard:the-first-keeper-is-the-same-for-everyone", first.name === "동네형", first.name);
  const wearing = await p.evaluate(() => window.__squad().squad[window.__squad().pick]);
  check("onboard:the-card-that-opened-is-the-one-standing-in-goal", wearing === first.name,
    "card " + first.name + ", in goal " + wearing);

  /* 닫으면 키커가 이어 열린다. 두 마디가 한 흐름이라 사이에 판을 굴리지 않는다.
     한 장짜리는 이미 다 열려 있으므로 한 번 누르면 닫히고 그 자리에서 다음 마디가 선다.
     상태를 안 보고 두 번 누르면 두 번째가 이미 열린 키커를 통째로 까 버린다. */
  await p.click("#pull", { force: true });
  await p.waitForFunction(() => window.__reveal().drawn > 1, { timeout: 8000 });
  await p.waitForTimeout(300);
  const second = await p.evaluate(() => ({
    open: !document.getElementById("pull").hidden,
    n: window.__reveal().drawn
  }));
  check("onboard:the-keeper-is-followed-by-the-kickers",
    second.open && second.n === PULL_BULK + PULL_BONUS,
    "open " + second.open + ", cards " + second.n);

  // 열한 장은 한 번 눌러 전부 열고 한 번 더 눌러 닫는다.
  await p.click("#pull", { force: true });
  await p.waitForTimeout(300);
  await p.click("#pull", { force: true });
  await p.waitForTimeout(400);
  const after = await p.evaluate(() => ({
    kickers: window.__kickers(),
    eleven: window.__eleven(),
    open: !document.getElementById("pull").hidden
  }));
  check("onboard:the-cards-drawn-are-the-players-owned",
    after.kickers.length >= PULL_BULK + PULL_BONUS,
    after.kickers.length + " owned");
  // 뽑았는데 아무도 안 뛰면 그 열한 장이 무엇을 산 것인지 화면에 없다.
  const mineInEleven = after.eleven.filter((n) => after.kickers.indexOf(n) >= 0).length;
  check("onboard:the-drawn-kickers-actually-take-the-field", mineInEleven > 0 && after.eleven.length === ELEVEN,
    mineInEleven + " of " + after.eleven.length + " starters came from the draw");
  const perRole = {};
  for (const n of after.eleven) { const k = kickerByName(n); if (k) perRole[k.role] = (perRole[k.role] || 0) + 1; }
  check("onboard:the-quota-still-holds-after-the-draw",
    ROLES.every((r) => perRole[r] === ROLE_SLOTS[r]),
    ROLES.map((r) => r + " " + (perRole[r] || 0) + "/" + ROLE_SLOTS[r]).join(", "));
  check("onboard:the-flow-ends-and-the-ball-comes", after.open === false, "reveal open " + after.open);

  // 대조군. 다시 들어와도 이 화면은 안 열린다. 이미 하던 사람에게 튜토리얼이 다시 열리면 판이 뒤집힌다.
  await p.reload({ waitUntil: "load" });
  await p.waitForSelector("#go", { timeout: 15000 });
  await p.click("#go", { force: true });
  await p.waitForTimeout(1500);
  const again = await p.evaluate(() => !document.getElementById("pull").hidden);
  check("control:a-returning-player-is-not-shown-it-again", again === false, "reveal open " + again);

  check("console:no-errors", errs.length === 0, errs.slice(0, 2).join(" | ") || "clean");
  await ctx.close();
} finally {
  clearTimeout(t);
  if (b) await b.close();
}

if (notes.length) console.log(notes.map((x) => "  ok   " + x).join(LINE));
if (fails.length) console.log(fails.map((x) => "  FAIL " + x).join(LINE));
console.log(fails.length ? "onboard FAIL " + fails.length : "onboard PASS " + notes.length);
if (fails.length) process.exitCode = 1;
