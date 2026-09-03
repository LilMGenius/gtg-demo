import { chromium } from "playwright";

// 선반이 화면 폭을 쓰는지 재는 자.
// 상품을 한 열로 세우면 폭의 대부분이 비고 넷째 장은 스크롤 뒤로 숨는다. 눌러 볼 생각이 들려면
// 상품이 먼저 눈에 들어와야 하는데, 한 열은 목록이지 진열이 아니다.
//
// 칸 수는 offsetTop으로 센다. 카드마다 rotate가 걸려 있어 getBoundingClientRect는 회전된
// 바깥 상자를 돌려주고, 그러면 같은 줄에 선 카드의 top이 서로 달라져 한 줄이 두 줄로 읽힌다.
// 실측으로 이 착오가 900px에서 세 칸을 두 칸으로 보고했다. offsetTop은 배치 좌표라 변형에 안 흔들린다.
//
// 문턱은 지어내지 않는다. 축은 폭이 넓어지면 칸이 늘어나는가와, 좁아져도 상품이 사라지지 않는가다.
// 둘 다 같은 화면을 두 폭에서 재서 비교하는 것이라 절대값을 고를 일이 없다.
const EXE = process.env.LOCALAPPDATA + "/ms-playwright/chromium-1228/chrome-win64/chrome.exe";
const BASE = "http://127.0.0.1:10310/web/index.html?seed=20&preset=rich";
const WIDE = 1280;
const NARROW = 620;
const LINE = String.fromCharCode(10);
const t = setTimeout(() => { console.log("WATCHDOG"); process.exit(1); }, 180000);
t.unref();

const fails = [], notes = [];
const check = (n, ok, d) => (ok ? notes : fails).push(n + " " + d);

const COUNT = () => { const out = {}; for (const tab of [...document.querySelectorAll("#shop .tab")]) { tab.click(); const rack = document.querySelector("#shop .rack"); const cards = rack ? [...rack.querySelectorAll(".card")] : []; const tops = {}; for (const c of cards) tops[c.offsetTop] = (tops[c.offsetTop] || 0) + 1; const cols = Object.keys(tops).length ? Math.max.apply(null, Object.values(tops)) : 0; const tracks = rack ? getComputedStyle(rack).gridTemplateColumns.split(" ").filter((s) => s).length : 0; out[tab.dataset.tab] = { cards: cards.length, cols, tracks }; } return out; };

let b;
try {
  b = await chromium.launch({ executablePath: EXE });
  const errs = [];
  const at = async (w) => {
    const ctx = await b.newContext({ viewport: { width: w, height: 720 } });
    const p = await ctx.newPage();
    p.on("pageerror", (e) => errs.push(String(e)));
    await p.goto(BASE, { waitUntil: "load" });
    await p.waitForSelector("#go", { timeout: 15000 });
    await p.click("#go", { force: true });
    await p.waitForTimeout(1300);
    await p.evaluate(() => window.__shop(true));
    await p.waitForTimeout(300);
    const r = await p.evaluate(COUNT);
    await ctx.close();
    return r;
  };
  const wide = await at(WIDE);
  const narrow = await at(NARROW);

  const racks = Object.keys(wide).filter((k) => wide[k].cards > 0);
  check("instrument:some-shelf-had-cards", racks.length > 0, racks.length + " shelves with cards");
  // 대조군. 줄을 세는 두 방법이 같은 답을 내야 한다. 하나는 카드의 배치 좌표를 묶은 것이고
  // 하나는 그리드가 선언한 트랙 수다. 둘이 갈리면 세는 쪽이 틀린 것이다.
  const disagree = racks.filter((k) => wide[k].cards >= wide[k].tracks && wide[k].cols !== wide[k].tracks);
  check("control:two-ways-of-counting-columns-agree", disagree.length === 0, disagree.map((k) => k + " " + wide[k].cols + " vs " + wide[k].tracks).join(", ") || "agree on " + racks.length);

  const single = racks.filter((k) => wide[k].cards >= 2 && wide[k].cols < 2);
  check("rack:a-wide-screen-puts-cards-side-by-side", single.length === 0, single.join(", ") || "widest shelf " + Math.max.apply(null, racks.map((k) => wide[k].cols)) + " columns");

  const lost = racks.filter((k) => !narrow[k] || narrow[k].cards !== wide[k].cards);
  check("rack:a-narrow-screen-keeps-every-card", lost.length === 0, lost.join(", ") || "all shelves keep their cards");

  const stuck = racks.filter((k) => wide[k].cards >= 4 && narrow[k].cols >= wide[k].cols);
  check("rack:columns-follow-the-viewport", stuck.length === 0, stuck.map((k) => k + " " + wide[k].cols + "->" + narrow[k].cols).join(", ") || WIDE + "px vs " + NARROW + "px differ on every full shelf");
  check("console:no-errors", errs.length === 0, errs.slice(0, 2).join(" | ") || "clean");

  for (const k of racks) console.log("  " + k.padEnd(7) + " cards " + wide[k].cards + "  columns " + wide[k].cols + " at " + WIDE + "px, " + narrow[k].cols + " at " + NARROW + "px");
  if (notes.length) console.log(notes.map((x) => "  ok   " + x).join(LINE));
  if (fails.length) console.log(fails.map((x) => "  FAIL " + x).join(LINE));
  console.log(fails.length ? "rack FAIL " + fails.length : "rack PASS " + notes.length);
  if (fails.length) process.exitCode = 1;
} finally {
  clearTimeout(t);
  if (b) await b.close();
}
