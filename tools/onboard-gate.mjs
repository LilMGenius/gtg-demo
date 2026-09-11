import { chromium } from "playwright";
import { PULL_BULK, PULL_BONUS, pullYield, ELEVEN, ROLES, ROLE_SLOTS, kickerByName } from "../src/roster.mjs";

// 첫 진입의 자. 가입 직후 아무것도 안 뽑고 판이 열렸다. 첫 키퍼와 주전 열하나가 조용히 배정돼서
// 플레이어는 자기가 무엇을 들고 시작하는지를 본 적이 없었고, 이 장르가 파는 첫 순간이 통째로 없었다.
//
// 축은 다섯이다. 처음 온 사람에게 카드가 열리는가, 봉인된 채로 짧게 누르면 닫히지 않고 한 단이 오르는가,
// 첫 키퍼가 못 박혀 있는가, 이어서 키커 열한 장이 오는가, 그 열한 장이 실제로 주전에 서는가.
// 대조군은 이미 하던 사람이다. 그 사람에게 이 화면이 다시 열리면 판이 뒤집힌다.
const EXE = process.env.LOCALAPPDATA + "/ms-playwright/chromium-1228/chrome-win64/chrome.exe";
const BASE = "http://127.0.0.1:10310/web/index.html?seed=20";
// 카드가 지나는 다섯 단의 마지막 번호. 길이는 판정의 STAGE_MS가 정하고 계기는 그 수를 마주 든다.
const STAGE_LAST = 4;
/* 길게 누름이 남은 것을 여는 것을 기다리는 상한. 제품 문턱이 0.45초라 여섯 배가 넘고,
   문턱이 아니라 상한이므로 초록 회차에서는 0.5초 언저리에 풀린다. */
const PRESS_MS = 3000;
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
  /* 닫힌 판은 누를 자리가 없다. 빨간 자에서 한 번 더 누르면 거기서 오류로 끝나 결과 줄이
     아예 안 남고, 무엇이 빨간지 못 읽는다. 누름 수가 갈리는 자리에서만 이 손을 쓴다. */
  const tap = async () => {
    if (await p.evaluate(() => document.getElementById("pull").hidden)) return false;
    await p.click("#pull", { force: true });
    return true;
  };
  /* 길게 누르면 남은 것이 전부 열린다. 짧은 누름은 한 단만 올리므로 열한 장을 그것으로 끝내려면
     쉰다섯 번을 눌러야 하고, 그 사이에 이 자가 보려던 두 마디가 지나간다. 손가락이 내려가 있는 동안
     열리는 물건이라 누름과 뗌을 따로 보내고, 열린 것을 보고 뗀다. */
  const press = async () => {
    if (await p.evaluate(() => document.getElementById("pull").hidden)) return false;
    const spot = await p.locator("#pull .tap").boundingBox();
    if (!spot) return false;
    await p.mouse.move(spot.x + spot.width / 2, spot.y + spot.height / 2);
    await p.mouse.down();
    await p.waitForFunction((last) => {
      const r = window.__reveal();
      return r.drawn > 0 && r.shown === r.drawn && r.stage === last;
    }, STAGE_LAST, { timeout: PRESS_MS, polling: "raf" }).catch(() => {});
    await p.mouse.up();
    return true;
  };
  await p.goto(BASE, { waitUntil: "load" });
  await p.waitForSelector("#go", { timeout: 15000 });
  await p.click("#go", { force: true });
  await p.waitForSelector("#pull .now", { timeout: 10000 });
  /* 봉인 단에서 바로 읽는다. 첫 단이 0.3초라 여기서 재야 사람이 처음 보는 화면을 그대로 본다.
     반 초를 기다리고 읽으면 이미 지나간 화면을 재게 되고, 급해서 누른 사람이 겪는 자리가 통째로 빠진다. */
  /* 누른 순간의 상태를 브라우저 안에서 잡아 둔다. 밖에서 누르기 전에 한 번 읽고 누른 뒤에 또 읽으면
     그 사이에 자동 사다리가 한 단을 올릴 수 있고, 그러면 이 축이 누름의 몫을 못 가른다. */
  await p.evaluate(() => {
    window.__tapAt = null;
    document.addEventListener("pointerup", () => { window.__tapAt = window.__reveal(); }, true);
  });
  const first = await p.evaluate(() => ({
    open: !document.getElementById("pull").hidden,
    n: window.__reveal().drawn,
    stage: window.__reveal().stage,
    label: (document.querySelector("#pull .tap") || {}).textContent || "",
    name: (document.querySelector("#pull .now b") || {}).textContent || ""
  }));
  check("onboard:a-new-player-opens-a-card-before-a-ball", first.open && first.n === 1,
    "open " + first.open + ", cards " + first.n);
  // 첫 키퍼는 못 박혀 있다. 처음 오는 사람마다 다른 게임을 시작하면 튜토리얼이 설 자리가 없다.
  check("onboard:the-first-keeper-is-the-same-for-everyone", first.name === "동네형", first.name);
  const wearing = await p.evaluate(() => window.__squad().squad[window.__squad().pick]);
  check("onboard:the-card-that-opened-is-the-one-standing-in-goal", wearing === first.name,
    "card " + first.name + ", in goal " + wearing);

  /* 아직 봉인이다. 이 자리에서 누름이 하는 일은 한 단을 올리는 것이므로 버튼은 다음이라고 적혀 있어야 한다.
     닫기라고 적어 두면 사람은 그 글자를 읽고 누르고, 자기 키퍼를 못 본 채 화면을 넘긴다. */
  check("onboard:the-close-button-said-next-while-the-card-was-sealed",
    first.label === "다음" && first.stage < STAGE_LAST,
    "label " + first.label + ", stage " + first.stage);

  /* 봉인된 채로 눌러 본다. 급한 사람의 첫 누름이라 이것이 닫으면 첫 키퍼는 한 번도 안 열린다.
     짧은 누름은 한 단만 올리므로 봉인에서 누르면 등급 신호로 올라서고 화면은 그대로 있어야 한다. */
  await p.click("#pull", { force: true });
  const sealedTap = await p.evaluate(() => ({
    open: !document.getElementById("pull").hidden,
    pre: window.__tapAt,
    r: window.__reveal(),
    label: (document.querySelector("#pull .tap") || {}).textContent || ""
  }));
  check("onboard:a-tap-on-a-sealed-keeper-opens-it-first",
    sealedTap.open && Boolean(sealedTap.pre) && sealedTap.pre.stage === 0 && sealedTap.r.stage === 1
      && sealedTap.r.shown === 1 && sealedTap.r.drawn === 1 && sealedTap.label === "다음",
    "open " + sealedTap.open + ", stage " + (sealedTap.pre ? sealedTap.pre.stage : "none")
      + " to " + sealedTap.r.stage + ", " + sealedTap.r.shown + " of " + sealedTap.r.drawn
      + ", label " + sealedTap.label);

  /* 길게 눌러 마지막 단까지 세우고 그 다음 누름이 닫는다. 닫으면 키커가 이어 열린다.
     두 마디가 한 흐름이라 사이에 판을 굴리지 않는다. */
  await press();
  await tap();
  await p.waitForFunction(() => window.__reveal().drawn > 1, { timeout: 8000 });
  await p.waitForTimeout(300);
  const second = await p.evaluate(() => ({
    open: !document.getElementById("pull").hidden,
    n: window.__reveal().drawn
  }));
  check("onboard:the-keeper-is-followed-by-the-kickers",
    second.open && second.n === PULL_BULK + PULL_BONUS,
    "open " + second.open + ", cards " + second.n);

  // 열한 장은 길게 눌러 전부 열고 한 번 눌러 닫는다.
  await press();
  await p.waitForTimeout(300);
  await tap();
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
