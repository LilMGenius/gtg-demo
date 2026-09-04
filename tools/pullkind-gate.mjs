import { chromium } from "playwright";
import { KEEPERS, PULL_COST, PULL_KINDS, pullKindOf, poolFor, pullCostOf, pullBill, keeperCost, pullWeight } from "../src/roster.mjs";

// 뽑기 갈래의 자. 갈래가 하나뿐이면 뽑을 이유도 하나뿐이고, 모아서 지를 자리가 없다.
//
// 재는 것은 넷이다. 갈래마다 풀이 다른가, 하한 아래 카드가 새어 들어오지 않는가,
// 값이 지어낸 수가 아니라 명단에서 유도되는가, 그리고 이용권이 받는 갈래에서만 쓰이는가.
//
// 값 유도는 계기가 같은 식을 다시 쓰지 않는다. 판정이 내는 수를 명단의 실제 분포와 맞대고,
// 유도가 살아 있는지는 명단을 바꿔 넣어 값이 따라 움직이는지로 본다.
const EXE = process.env.LOCALAPPDATA + "/ms-playwright/chromium-1228/chrome-win64/chrome.exe";
const LINE = String.fromCharCode(10);
const t = setTimeout(() => { console.log("WATCHDOG"); process.exit(1); }, 150000);
t.unref();

const fails = [], notes = [];
const check = (n, ok, d) => (ok ? notes : fails).push(n + " " + d);

check("instrument:the-roster-has-more-than-one-kind", PULL_KINDS.length > 1, PULL_KINDS.length + " kinds");
const sizes = PULL_KINDS.map((k) => poolFor(KEEPERS, k.id).length);
check("pullkind:every-kind-draws-from-a-different-pool", new Set(sizes).size === sizes.length,
  PULL_KINDS.map((k, i) => k.id + " " + sizes[i]).join(", "));
// 하한 아래가 한 장이라도 들어오면 그 갈래는 갈래가 아니다.
const leaks = PULL_KINDS.filter((k) => poolFor(KEEPERS, k.id).some((x) => (x.fame || 0) < k.floor));
check("pullkind:no-card-below-the-floor-slips-in", leaks.length === 0, leaks.map((k) => k.id).join(", ") || "every pool respects its floor");
// 대조군. 하한 0인 갈래에는 낮은 명성이 실제로 들어 있어야 한다. 안 그러면 위의 초록은 빈 필터다.
const town = poolFor(KEEPERS, "town");
check("control:the-open-kind-still-holds-low-fame", town.some((k) => (k.fame || 0) < 9), Math.min.apply(null, town.map((k) => k.fame || 0)) + " is the lowest");

// 값이 명단에서 나오는가. 명단을 좁혀 넣으면 값이 따라 움직여야 한다.
const costs = PULL_KINDS.map((k) => pullCostOf(k.id));
check("pullkind:a-narrower-pool-costs-more", costs[1] > costs[0], PULL_KINDS.map((k, i) => k.id + " " + costs[i]).join(", "));
// 동네 갈래는 하한이 0이라 자기 풀이 곧 명단이다. 비가 1이므로 어떤 명단을 줘도 기준값 그대로다.
// 그것이 이 유도의 정의이고, 움직여야 하는 것은 하한을 가진 갈래다.
const half = KEEPERS.filter((k) => (k.fame || 0) >= 8);
check("pullkind:the-base-kind-is-the-anchor-and-does-not-drift", pullCostOf("town", half) === PULL_COST,
  "town stays at " + pullCostOf("town", half) + " on a fame-8 roster");
const moved = pullCostOf("legend", half);
check("pullkind:the-price-follows-the-roster-it-is-given", moved !== costs[1] && moved > 0,
  "legend on the full roster " + costs[1] + ", on a fame-8 roster " + moved);
// 값이 그 풀 최저 지목가보다 낮아야 뽑을 이유가 남는다. 동네 갈래의 위반은 OPEN.md가 소유한다.
const floorCost = Math.min.apply(null, poolFor(KEEPERS, "legend").map(keeperCost));
check("pullkind:the-legend-draw-undercuts-naming-in-its-own-pool", costs[1] < floorCost,
  costs[1] + " against the cheapest legend name " + floorCost);

// 이용권은 받는 갈래에서만 나간다.
const b1 = pullBill(3, 5, 99999, pullCostOf("town"));
const b2 = pullBill(3, 0, 99999, pullCostOf("legend"));
check("pullkind:the-ticket-kind-spends-tickets", b1.free === 3 && b1.cost === 0, b1.free + " free");
check("pullkind:the-other-kind-charges-in-full", b2.free === 0 && b2.cost === 3 * costs[1], b2.cost + " for three");

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
  await p.waitForSelector("#shop .kind", { timeout: 8000 });
  const shown = await p.evaluate(() => [...document.querySelectorAll("#shop .kind")].map((e) => e.dataset.kind));
  check("pullkind:the-shelf-offers-every-kind", shown.length === PULL_KINDS.length, shown.join(", "));

  // 갈래를 바꾸면 화면이 통째로 갈린다. 안 갈리면 버튼만 있고 갈래는 없는 것이다.
  const read = () => p.evaluate(() => {
    const card = document.querySelector("#shop .card");
    return {
      cur: (document.querySelector("#shop .kind[aria-current]") || {}).dataset?.kind || "",
      coin: Number((card.querySelector(".px[data-coin]") || {}).dataset?.coin || 0),
      /* 이용권이 값을 다 덮는 회차는 육수 칩 대신 이용권 칩을 세운다. 그때 값은 0이 맞고,
         선반이 값을 안 적은 것이 아니다. 열 장 버튼은 이용권으로 다 못 덮으므로 육수를 든다.
         값 축은 그 버튼에서 읽어야 이용권 보유량이 판정을 흔들지 않는다. */
      bulkCoin: Number(([...card.querySelectorAll(".buy.pull .px[data-coin]")].pop() || {}).dataset?.coin || 0),
      // 이 갈래가 이용권을 받는지는 이제 문장이 아니라 칩의 유무가 말한다.
      ticketChip: Boolean(card.querySelector(".held")),
      text: card.innerText.replace(/\n/g, " ")
    };
  });
  const a = await read();
  await p.click('#shop .kind[data-kind="legend"]', { force: true });
  await p.waitForTimeout(300);
  const c = await read();
  check("pullkind:choosing-a-kind-changes-the-shelf", a.cur === "town" && c.cur === "legend" && c.coin !== a.coin,
    a.cur + " at " + a.coin + " then " + c.cur + " at " + c.coin);
  /* 화면에 선 값이 판정이 계산한 청구서와 같은가. 이용권이 값을 다 덮는 회차는 육수가 0인 것이
     맞는 답이라, 원가와 비교하면 계기가 이용권 보유량을 결함으로 읽는다.
     지금 보유한 이용권을 넣어 청구서를 다시 세우고 그 육수와 대조한다. */
  const held = await p.evaluate(() => window.__tickets());
  const wantTown = pullBill(10, held, 9e9, costs[0]).cost;
  const wantLegend = pullBill(10, 0, 9e9, costs[1]).cost;
  check("pullkind:the-shown-price-is-the-one-the-judgement-derived",
    a.bulkCoin === wantTown && c.bulkCoin === wantLegend,
    a.bulkCoin + " and " + c.bulkCoin + " against " + wantTown + " and " + wantLegend + " with " + held + " tickets");
  check("pullkind:only-the-kind-that-takes-tickets-shows-the-ticket-chip",
    a.ticketChip === true && c.ticketChip === false,
    "town chip " + a.ticketChip + ", legend chip " + c.ticketChip);

  // 전설 갈래에서 열 장. 나온 이름이 전부 하한 위여야 한다.
  const before = await p.evaluate(() => window.__squad().squad.slice());
  await p.click('#shop .buy[data-want="10"]', { force: true });
  await p.waitForTimeout(500);
  const after = await p.evaluate(() => window.__squad().squad.slice());
  const drawn = after.slice(before.length);
  const fameOf = (n) => (KEEPERS.find((k) => k.name === n) || {}).fame || 0;
  check("pullkind:a-legend-draw-returns-only-legends", drawn.length === 10 && drawn.every((n) => fameOf(n) >= 9),
    drawn.length + " drawn, lowest fame " + (drawn.length ? Math.min.apply(null, drawn.map(fameOf)) : "none"));

  check("console:no-errors", errs.length === 0, errs.slice(0, 2).join(" | ") || "clean");
  await ctx.close();

  if (notes.length) console.log(notes.map((x) => "  ok   " + x).join(LINE));
  if (fails.length) console.log(fails.map((x) => "  FAIL " + x).join(LINE));
  console.log(fails.length ? "pullkind FAIL " + fails.length : "pullkind PASS " + notes.length);
  if (fails.length) process.exitCode = 1;
} finally {
  clearTimeout(t);
  if (b) await b.close();
}
