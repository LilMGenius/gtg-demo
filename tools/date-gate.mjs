import { chromium } from "playwright";
import { newKeeper } from "../src/chain.mjs";
import { RAPPORT_CAP, rapportTier } from "../web/src/state/rapport.mjs";
import { DATE_TIER, DATE_COST, DATE_FAIL_COUNT, MOVES, dateOdds, dateOutcome, applyDate, dateGate } from "../web/src/state/date.mjs";

// 라포 3단계에 도달점이 생겼는지를 잰다. 만남은 지갑과 팔로워와 라포 셋을 한 번에 움직이므로
// 하나만 재면 나머지 둘이 끊겨도 초록으로 남는다.

// 표본 범위: 만렙 키퍼를 따로 두지 않는다. dateOdds가 스탯을 인자로 직접 받으므로 이 게이트는 스탯 1과 10을 양쪽 다 밟고, 그 사이는 선형이라 중간 표본이 새 정보를 주지 않는다.
const EXE = process.env.LOCALAPPDATA + "/ms-playwright/chromium-1228/chrome-win64/chrome.exe";
const BASE = "http://127.0.0.1:10310/web/index.html";
const t = setTimeout(() => { console.log("WATCHDOG"); process.exit(1); }, 120000);
t.unref();

const fails = [], notes = [];
const check = (n, ok, d) => (ok ? notes : fails).push(n + " " + d);

// 확률은 스탯을 타야 한다. 안 타면 세 갈래가 이름만 다른 같은 버튼이다.
const low = newKeeper();
for (const m of MOVES) {
  const hi = Object.assign({}, low);
  hi[m.stat] = 10;
  const a = dateOdds(low, m.id), b = dateOdds(hi, m.id);
  check("odds:" + m.id + "-rises", b > a, a + " -> " + b);
  check("odds:" + m.id + "-capped", b <= 92 && a >= 5, a + ".." + b);
}
const ids = new Set(MOVES.map((m) => m.id));
const stats = new Set(MOVES.map((m) => m.stat));
check("moves:distinct-stats", ids.size === MOVES.length && stats.size === MOVES.length, "moves " + ids.size + " stats " + stats.size);

// 굴림 경계. 확률보다 낮으면 성공이고 같거나 크면 실패다.
const odds = dateOdds(low, "talk");
check("roll:below-wins", dateOutcome(low, "talk", odds - 0.01).won === true, "roll " + (odds - 0.01));
check("roll:at-loses", dateOutcome(low, "talk", odds).won === false, "roll " + odds);
check("outcome:fans-split", dateOutcome(low, "talk", 0).fans > 0 && dateOutcome(low, "talk", 100).fans < 0,
  dateOutcome(low, "talk", 0).fans + " / " + dateOutcome(low, "talk", 100).fans);

// 라포 종점. 성공은 상한이고 실패는 마지막 문턱 바로 아래다.
const won = applyDate({ "0:1": 15 }, 0, 1, true), lost = applyDate({ "0:1": 15 }, 0, 1, false);
check("rapport:win-caps", won["0:1"] === RAPPORT_CAP, String(won["0:1"]));
check("rapport:lose-drops-one-tier", lost["0:1"] === DATE_FAIL_COUNT && rapportTier(lost, 0, 1) === DATE_TIER - 1,
  lost["0:1"] + " tier " + rapportTier(lost, 0, 1));

// 문. 단계와 지갑 둘 다 걸려야 하고 못 여는 이유가 글자로 나와야 한다.
const g0 = dateGate({ "0:1": 3 }, 0, 1, 9999);
const g1 = dateGate({ "0:1": 15 }, 0, 1, 0);
const g2 = dateGate({ "0:1": 15 }, 0, 1, DATE_COST);
check("gate:low-tier-shut", g0.open === false && g0.why.length > 0, g0.why);
check("gate:broke-shut", g1.open === false && g1.why.indexOf(String(DATE_COST)) >= 0, g1.why);
check("gate:open", g2.open === true, g2.why);

let b;
try {
  b = await chromium.launch({ executablePath: EXE });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } });
  const p = await ctx.newPage();
  const errs = [];
  p.on("pageerror", (e) => errs.push(String(e)));
  p.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
  // 팔로워는 0에서 시작하고 아래로 안 내려간다. 잃는 쪽을 재려면 쌓인 자리에서 시작해야 한다.
  await p.goto(BASE + "?preset=famous", { waitUntil: "load" });
  await p.evaluate(() => localStorage.clear());
  await p.goto(BASE + "?preset=famous", { waitUntil: "load" });
  await p.waitForTimeout(1200);
  await p.click("#go", { force: true });
  await p.waitForTimeout(1400);
  // 1번은 문턱 아래, 2번은 문턱 위. 한쪽만 두면 버튼이 늘 열려 있어도 초록이 된다.
  await p.evaluate((cost) => {
    const r = window.__rapport();
    r["0:1"] = 3;
    r["0:2"] = 15;
    window.__wallet().coin = cost;
    window.__me(true);
  }, DATE_COST);
  await p.waitForTimeout(500);
  const shut = await p.getAttribute('#me .go[data-passer="1"]', "disabled");
  const open = await p.getAttribute('#me .go[data-passer="2"]', "disabled");
  check("screen:low-tier-disabled", shut !== null, "disabled " + shut);
  check("screen:ready-enabled", open === null, "disabled " + open);
  const before = await p.evaluate(() => ({ coin: window.__wallet().coin, fans: window.__fans(), rap: window.__rapport()["0:2"] }));
  await p.click('#me .go[data-passer="2"]');
  await p.waitForTimeout(400);
  const moves = await p.$$("#date [data-move]");
  check("screen:three-moves", moves.length === MOVES.length, "buttons " + moves.length);
  await moves[0].click();
  await p.waitForTimeout(400);
  const after = await p.evaluate(() => ({ coin: window.__wallet().coin, fans: window.__fans(), rap: window.__rapport()["0:2"] }));
  const outTxt = await p.textContent("#date .out");
  check("screen:outcome-shown", !!outTxt && outTxt.length > 0, (outTxt || "").slice(0, 30));
  check("screen:coin-spent", before.coin - after.coin === DATE_COST, before.coin + " -> " + after.coin);
  check("screen:fans-moved", after.fans !== before.fans, before.fans + " -> " + after.fans);
  check("screen:rapport-settled", after.rap === RAPPORT_CAP || after.rap === DATE_FAIL_COUNT, before.rap + " -> " + after.rap);
  check("console:no-errors", errs.length === 0, errs.slice(0, 3).join(" | ") || "clean");
  const LINE = String.fromCharCode(10);
  if (notes.length) console.log(notes.map((s) => "  ok   " + s).join(LINE));
  if (fails.length) console.log(fails.map((s) => "  FAIL " + s).join(LINE));
  console.log(fails.length ? "date FAIL " + fails.length : "date PASS");
  if (fails.length) process.exitCode = 1;
} finally {
  clearTimeout(t);
  if (b) await b.close();
}
