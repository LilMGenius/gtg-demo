import { chromium } from "playwright";
import { MAXED_POINTS, RICH_COIN, RICH_CASH, START_FANS } from "../web/src/state/inject.mjs";

// 주입은 게이트 스물 몇 개가 공유하는 표본 공급기인데 그 층 자체를 재는 자가 없었다.
// 주입이 조용히 안 먹으면 그 게이트는 만렙을 재는 줄 알고 신인을 재고 초록을 낸다.
// maxed의 천장은 gym 게이트가 훈련장 화면으로 이미 재므로 여기서 다시 재지 않는다.
// 여기가 재는 것은 아무도 안 보던 세 가지다. 모르는 이름이 소리를 내는가,
// rich와 famous가 선언한 칸만 움직이는가, 페이지가 무엇을 적용했다고 말하는가.

const EXE = process.env.LOCALAPPDATA + "/ms-playwright/chromium-1228/chrome-win64/chrome.exe";
const BASE = "http://127.0.0.1:10310/web/index.html";
const LINE = String.fromCharCode(10);
const t = setTimeout(() => { console.log("WATCHDOG"); process.exit(1); }, 90000);
t.unref();

const fails = [], notes = [];
const check = (n, ok, d) => (ok ? notes : fails).push(n + " " + d);

let b;
try {
  b = await chromium.launch({ executablePath: EXE });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } });
  const p = await ctx.newPage();
  let errs = [];
  p.on("pageerror", (e) => errs.push(String(e)));
  p.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });

  // 저장을 지우고 같은 자리에서 다시 연다. 앞 판의 저장이 남으면 주입이 아니라 저장을 재게 된다.
  const boot = async (q) => {
    errs = [];
    await p.goto(BASE + q, { waitUntil: "load" });
    await p.evaluate(() => localStorage.clear()).catch(() => {});
    await p.reload({ waitUntil: "load" });
    await p.waitForTimeout(900);
  };
  const purse = async () => p.evaluate(() => ({
    coin: window.__wallet().coin, cash: window.__wallet().cash,
    fans: window.__fans(), points: window.__points(), applied: window.__preset
  }));

  // 대조군. 주입이 없으면 지갑도 팔로워도 신규 저장 값이다. 이게 없으면 아래 축들은
  // 주입이 채운 것과 원래 그랬던 것을 구분하지 못한다.
  await boot("");
  const fresh = await purse();
  check("control:fresh-save-is-poor", fresh.coin < RICH_COIN && fresh.cash < RICH_CASH && fresh.fans < START_FANS, "coin " + fresh.coin + " cash " + fresh.cash + " fans " + fresh.fans);
  check("control:no-preset-reports-nothing", Array.isArray(fresh.applied) && fresh.applied.length === 0, JSON.stringify(fresh.applied));
  check("control:fresh-save-is-quiet", errs.length === 0, errs.slice(0, 2).join(" | ") || "clean");

  // rich는 지갑 두 갈래만 채운다고 선언한다. 스탯을 같이 움직이면 어느 쪽이 화면을 바꿨는지 못 가린다.
  await boot("?preset=rich");
  const rich = await purse();
  check("rich:fills-both-purses", rich.coin === RICH_COIN && rich.cash === RICH_CASH, "coin " + rich.coin + " cash " + rich.cash);
  check("rich:reports-itself", JSON.stringify(rich.applied) === JSON.stringify(["rich"]), JSON.stringify(rich.applied));

  // famous는 팔로워만 채운다. 팔로워는 0에서 시작해 아래로 안 내려가므로,
  // 잃는 쪽을 재는 게이트는 이 주입이 없으면 감소를 아예 관측하지 못한다.
  await boot("?preset=famous");
  const famous = await purse();
  check("famous:fills-followers", famous.fans === START_FANS, String(famous.fans));
  check("famous:leaves-the-purse-alone", famous.coin === fresh.coin && famous.cash === fresh.cash, "coin " + famous.coin + " cash " + famous.cash);

  // 이 한 줄은 분리 주장도 같이 잰다. rich가 팔로워를 덮었으면 5000이 남지 않는다.
  // 이름을 이어 붙이면 둘 다 걸려야 한다. 하나만 걸리면 뒤에 적은 쪽이 조용히 버려진 것이다.
  await boot("?preset=rich,famous");
  const both = await purse();
  check("names:compose-in-order", both.coin === RICH_COIN && both.fans === START_FANS, "coin " + both.coin + " fans " + both.fans);
  check("names:report-in-order", JSON.stringify(both.applied) === JSON.stringify(["rich", "famous"]), JSON.stringify(both.applied));

  // 분리 주장은 상대 칸이 0이 아닐 때라야 갈린다. 신규 저장은 팔로워도 훈련도 0이라
  // 그 자리에서 잰 "안 건드린다"는 두 0을 맞대는 것과 같다. 상대 칸을 먼저 채우고 잰다.
  await boot("?preset=maxed,rich");
  const withStats = await purse();
  check("rich:does-not-spend-training", withStats.points === MAXED_POINTS && withStats.coin === RICH_COIN, "points " + withStats.points + " coin " + withStats.coin);

  // 오타 하나가 표본을 통째로 바꾼다. 조용히 지나가면 그 게이트는 신인을 만렙으로 믿고
  // 초록을 내고, 그 초록은 결함이 없다는 뜻이 아니라 아무것도 안 쟀다는 뜻이다.
  await boot("?preset=maxxed");
  const loud = errs.join(" | ");
  check("unknown:name-is-loud", loud.includes("unknown preset name") && loud.includes("maxxed"), loud.slice(0, 90) || "silent");
  const dead = await p.evaluate(() => typeof window.__wallet).catch(() => "gone");
  check("unknown:page-does-not-continue", dead !== "function", "window.__wallet is " + dead);

  // 부분 오타도 같다. 앞의 이름이 걸렸다고 뒤의 오타가 용서되면 표본은 반만 주입된다.
  await boot("?preset=rich,maxxed");
  const half = errs.join(" | ");
  check("unknown:one-bad-name-stops-the-rest", half.includes("unknown preset name"), half.slice(0, 90) || "silent");

  if (notes.length) console.log(notes.map((x) => "  ok   " + x).join(LINE));
  if (fails.length) console.log(fails.map((x) => "  FAIL " + x).join(LINE));
  console.log(fails.length ? "preset FAIL " + fails.length : "preset PASS");
  if (fails.length) process.exitCode = 1;
} finally {
  clearTimeout(t);
  if (b) await b.close();
}
