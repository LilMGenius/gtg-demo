import { chromium } from "playwright";

// 장비 상점 게이트. 여덟 선반이 실제로 팔리는가.
// 파운더가 연 상점에 게이트가 하나도 없었다. 선반은 그려졌지만 사고 나서 무엇이 변하는지 아무도 본 적이 없다.
// 살 수 있는 상태는 주입 훅(?preset=rich)으로 앞당긴다. 판정식도 가격표도 건드리지 않는다.
const EXE = process.env.LOCALAPPDATA + "/ms-playwright/chromium-1228/chrome-win64/chrome.exe";
const BASE = "http://127.0.0.1:10310/web/index.html";
// 한 선반의 등급 수. gear.mjs의 각 배열 길이다.
const RANKS = 4;
// 최상급 등급 번호. MAX_GRIP 등 여덟 상한이 모두 이 값이다.
const TOP = 3;
// 여덟 선반 최상급 총액. RICH_COIN 8000이 이걸 덮어야 한 판에 다 살 수 있다.
const TOP_TOTAL = 6810;
// 선반 정의. main.mjs의 SHELVES와 같은 순서, 같은 문구여야 한다.
const SHELVES = [
  { tab: 'glove', head: '장갑', field: 'grip', worn: '끼는 중', past: '지난 장갑' },
  { tab: 'boot', head: '축구화', field: 'studs', worn: '신는 중', past: '지난 축구화' },
  { tab: 'kit', head: '유니폼', field: 'pads', worn: '입는 중', past: '지난 유니폼' },
  { tab: 'sock', head: '양말', field: 'socks', worn: '신는 중', past: '지난 양말' },
  { tab: 'frame', head: '골대', field: 'frame', worn: '쓰는 중', past: '지난 골대' },
  { tab: 'city', head: '동네', field: 'city', worn: '뛰는 중', past: '지난 동네' },
  { tab: 'hair', head: '머리', field: 'hair', worn: '자른 머리', past: '지난 머리' },
  { tab: 'ink', head: '타투', field: 'ink', worn: '새긴 것', past: '지운 타투' }
];

const t = setTimeout(() => { console.log("WATCHDOG"); process.exit(1); }, 180000);
t.unref();

const fails = [], notes = [];
const check = (n, ok, d) => (ok ? notes : fails).push(n + " " + d);
const shot = process.argv[2];

let b;
try {
  b = await chromium.launch({ executablePath: EXE });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } });
  const p = await ctx.newPage();
  const errs = [];
  p.on("pageerror", (e) => errs.push(String(e)));
  p.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });

  // 상점에는 전용 여는 버튼이 없다. __shop(true)가 유일한 입구다.
  const boot = async (q) => {
    await p.goto(BASE + q, { waitUntil: "load" });
    await p.evaluate(() => localStorage.clear());
    await p.reload({ waitUntil: "load" });
    await p.waitForTimeout(1200);
    await p.click("#go", { force: true });
    await p.waitForTimeout(1400);
    await p.evaluate(() => window.__shop(true));
    await p.waitForTimeout(300);
  };

  // 탭을 누르면 renderShop이 그 자리에서 다시 그린다. 클릭과 읽기를 한 번에 한다.
  const shelf = (tab) => p.evaluate((k) => {
    document.querySelector('.tab[data-tab="' + k + '"]').click();
    const box = document.getElementById("shop");
    const got = box.querySelector('.got');
    return {
      head: box.querySelector("h4").textContent,
      // 값은 버튼이 들고 있는 데이터에서 읽는다. 그려진 글자에는 쉼표와 아이콘 이름이 섞인다.
      rows: [...box.querySelectorAll('.buy[data-rank]')].map((x) => { const c = x.querySelector('.px[data-coin]'); return { rank: Number(x.dataset.rank), text: x.textContent, coin: c ? Number(c.dataset.coin) : NaN, off: x.disabled }; }),
      got: got ? got.textContent : null
    };
  }, tab);

  const buyTop = () => p.evaluate((r) => document.querySelector('.buy[data-rank="' + r + '"]').click(), TOP);

  // 대조군. 주입이 없으면 지갑이 비어 최상급 칸은 사유를 적은 채 죽어 있다.
  // 이게 없으면 본시험의 녹색은 버튼이 원래 늘 살아 있는 것과 구분되지 않는다.
  await boot("?seed=20&preset=veteran");
  let poorTop = 0, poorSaid = 0;
  for (const s of SHELVES) {
    const v = await shelf(s.tab);
    const top = v.rows.find((r) => r.rank === TOP);
    if (top && top.off) poorTop += 1;
    if (top && top.text.includes('모자라다')) poorSaid += 1;
  }
  check("control:top-rank-is-dead-on-a-fresh-wallet", poorTop === SHELVES.length, poorTop + "/" + SHELVES.length);
  check("control:dead-button-states-the-shortfall", poorSaid === SHELVES.length, poorSaid + "/" + SHELVES.length);

  // 본시험. 지갑만 앞당긴 저장에서 여덟 선반을 끝까지 산다.
  await boot("?seed=20&preset=rich,veteran");
  const applied = await p.evaluate(() => window.__preset);
  check("preset:rich-was-applied", Array.isArray(applied) && applied.includes("rich"), JSON.stringify(applied));

  const coin0 = await p.evaluate(() => window.__wallet().coin);
  let shaped = 0, live = 0, paid = 0, worn = 0, past = 0, done = 0;
  for (const s of SHELVES) {
    const pre = await shelf(s.tab);
    if (pre.head === s.head && pre.rows.length === RANKS) shaped += 1;
    const top = pre.rows.find((r) => r.rank === TOP);
    if (top && !top.off) live += 1;
    paid += top ? top.coin : 0;
    await buyTop();
    await p.waitForTimeout(120);
    const post = await shelf(s.tab);
    const bought = post.rows.find((r) => r.rank === TOP);
    if (bought && bought.off && bought.text === s.worn) worn += 1;
    if (post.rows.filter((r) => r.rank < TOP).every((r) => r.off && r.text === s.past)) past += 1;
    if (post.got && post.got.includes('더 살 게 없다')) done += 1;
  }
  const coin1 = await p.evaluate(() => window.__wallet().coin);
  const gear = await p.evaluate(() => window.__gear());

  check("shop:eight-shelves-render-four-ranks-under-their-own-head", shaped === SHELVES.length, shaped + "/" + SHELVES.length);
  check("buy:top-rank-is-live-on-every-shelf", live === SHELVES.length, live + "/" + SHELVES.length);
  check("buy:price-on-the-button-matches-the-declared-total", paid === TOP_TOTAL, paid + " want " + TOP_TOTAL);
  check("buy:wallet-drops-by-exactly-what-the-buttons-asked", coin0 - coin1 === paid, coin0 + "-" + paid + " -> " + coin1);
  check("buy:every-gear-field-rose-to-the-top-rank", SHELVES.every((s) => gear[s.field] === TOP), JSON.stringify(gear));
  check("after:bought-row-says-it-is-being-worn", worn === SHELVES.length, worn + "/" + SHELVES.length);
  check("after:lower-rows-say-they-are-past", past === SHELVES.length, past + "/" + SHELVES.length);
  check("after:filled-shelf-declares-nothing-left", done === SHELVES.length, done + "/" + SHELVES.length);

  if (shot) await p.screenshot({ path: shot });
  check("console:no-errors", errs.length === 0, errs.slice(0, 3).join(" | ") || "clean");

  console.log(notes.map((s) => "  ok   " + s).join("\n"));
  if (fails.length) console.log(fails.map((s) => "  FAIL " + s).join("\n"));
  console.log(fails.length ? "gear FAIL " + fails.length : "gear PASS");
  if (fails.length) process.exitCode = 1;
} finally {
  clearTimeout(t);
  if (b) await b.close();
}
