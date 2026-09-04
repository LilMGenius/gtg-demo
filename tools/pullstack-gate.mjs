import { chromium } from "playwright";
import { PULL_COST, PULL_BULK, TICKET_CAP, TICKET_PER_CLEAN, pullBill, ticketGain } from "../src/roster.mjs";
import { TICKETS_HELD } from "../web/src/state/inject.mjs";

// 이적시장 이용권과 두 자리의 자. 한 장만 뽑을 수 있으면 모아서 지르는 자리가 없고,
// 뽑기가 값을 고르는 일이 아니라 값이 될 때까지 기다리는 일이 된다.
//
// 재는 것은 넷이다. 두 자리가 서 있는가, 이용권이 값보다 먼저 나가는가,
// 묶음이 한 번에 그 수만큼 들어오는가, 그리고 같은 이름이 한 묶음에서 두 번 안 나오는가.
//
// 값과 잔고는 데이터에서 읽는다. 버튼 글자를 파싱하면 표기가 바뀐 날 자가 값을 못 읽는다.
const EXE = process.env.LOCALAPPDATA + "/ms-playwright/chromium-1228/chrome-win64/chrome.exe";
const LINE = String.fromCharCode(10);
const t = setTimeout(() => { console.log("WATCHDOG"); process.exit(1); }, 150000);
t.unref();

const fails = [], notes = [];
const check = (n, ok, d) => (ok ? notes : fails).push(n + " " + d);

// 계산은 판정이 소유한다. 계기가 같은 식을 다시 쓰면 두 곳이 갈린 날 자가 틀린 답을 옳다고 한다.
const b0 = pullBill(1, 0, 9999);
const b1 = pullBill(PULL_BULK, 3, 9999);
const b2 = pullBill(PULL_BULK, TICKETS_HELD, 9999);
check("bill:with-no-ticket-every-card-is-paid", b0.free === 0 && b0.cost === PULL_COST, b0.cost + " for one");
check("bill:tickets-go-first-then-money", b1.free === 3 && b1.cost === (PULL_BULK - 3) * PULL_COST,
  b1.free + " free, " + b1.cost + " paid");
check("bill:enough-tickets-costs-nothing", b2.free === PULL_BULK && b2.cost === 0, b2.free + " free, " + b2.cost + " paid");

// 완봉 보상. 다섯을 다 막았을 때만 나오고, 한 슛만 먹혀도 안 나온다.
const clean = [false, false, false, false, false];
const leaky = [false, false, true, false, false];
check("earn:a-clean-sheet-pays-a-ticket", ticketGain(clean, 4) === 4 + TICKET_PER_CLEAN, String(ticketGain(clean, 4)));
check("control:one-goal-pays-nothing", ticketGain(leaky, 4) === 4, String(ticketGain(leaky, 4)));
check("earn:the-cap-stops-the-count", ticketGain(clean, TICKET_CAP) === TICKET_CAP, String(ticketGain(clean, TICKET_CAP)));
// 판이 안 끝난 자리에서 부르면 아무 일도 없어야 한다. 빈 배열을 완봉으로 읽으면 매 판이 공짜 한 장이다.
check("control:an-unplayed-set-pays-nothing", ticketGain([], 4) === 4, String(ticketGain([], 4)));

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
  const applied = await p.evaluate(() => window.__preset);
  check("preset:ticketed-was-applied", Array.isArray(applied) && applied.includes("ticketed"), JSON.stringify(applied));

  await p.evaluate(() => window.__shop(true));
  await p.waitForSelector("#shop .buy[data-want]", { timeout: 8000 });
  const wants = await p.evaluate(() => [...document.querySelectorAll("#shop .buy[data-want]")].map((e) => Number(e.dataset.want)));
  check("pullstack:both-sizes-stand", wants.length === 2 && wants[0] === 1 && wants[1] === PULL_BULK, wants.join(" and "));
  const shown = await p.evaluate(() => {
    const e = document.querySelector("#shop .card .held");
    return e ? e.textContent.trim() : "";
  });
  check("pullstack:the-shelf-says-how-many-tickets-are-left", shown.indexOf(String(TICKETS_HELD)) >= 0, JSON.stringify(shown));
  check("instrument:the-injected-balance-reached-the-state", await p.evaluate(() => window.__tickets()) === TICKETS_HELD,
    String(await p.evaluate(() => window.__tickets())));

  const before = await p.evaluate(() => ({ t: window.__tickets(), coin: window.__wallet().coin, squad: window.__squad().squad.length }));
  await p.click('#shop .buy[data-want="' + PULL_BULK + '"]', { force: true });
  await p.waitForTimeout(500);
  const after = await p.evaluate(() => ({ t: window.__tickets(), coin: window.__wallet().coin, squad: window.__squad().squad.slice() }));
  const want = pullBill(PULL_BULK, before.t, before.coin);
  check("pullstack:a-bulk-draw-lands-that-many-keepers", after.squad.length - before.squad === PULL_BULK,
    before.squad + " to " + after.squad.length);
  check("pullstack:tickets-are-spent-before-money", before.t - after.t === want.free && before.coin - after.coin === want.cost,
    "tickets " + before.t + " to " + after.t + ", coin " + before.coin + " to " + after.coin);
  // 같은 이름이 두 번 나오면 뽑은 카드가 풀에서 안 빠진 것이다. 열 장 묶음에서만 드러나는 결함이다.
  const names = after.squad.slice(before.squad);
  check("pullstack:no-name-comes-out-twice-in-one-draw", new Set(names).size === names.length,
    new Set(names).size + " distinct of " + names.length);

  // 낱장은 남은 이용권으로 돌아간다. 값이 안 나가야 이용권이 먼저 쓰인 것이다.
  const mid = await p.evaluate(() => ({ t: window.__tickets(), coin: window.__wallet().coin }));
  await p.click('#shop .buy[data-want="1"]', { force: true });
  await p.waitForTimeout(400);
  const one = await p.evaluate(() => ({ t: window.__tickets(), coin: window.__wallet().coin }));
  check("pullstack:a-single-draw-uses-the-leftover-ticket", mid.t - one.t === 1 && one.coin === mid.coin,
    "tickets " + mid.t + " to " + one.t + ", coin unchanged " + (one.coin === mid.coin));

  // 대조군. 이용권이 바닥나면 같은 자리가 값을 치른다. 안 그러면 위의 0원은 공짜 뽑기다.
  await p.evaluate(() => { while (window.__tickets() > 0) document.querySelector('#shop .buy[data-want="1"]').click(); });
  await p.waitForTimeout(600);
  const dry = await p.evaluate(() => ({ t: window.__tickets(), coin: window.__wallet().coin }));
  await p.click('#shop .buy[data-want="1"]', { force: true });
  await p.waitForTimeout(400);
  const paid = await p.evaluate(() => ({ t: window.__tickets(), coin: window.__wallet().coin }));
  check("control:with-no-ticket-left-the-same-button-charges", dry.t === 0 && dry.coin - paid.coin === PULL_COST,
    "tickets " + dry.t + ", coin " + dry.coin + " to " + paid.coin);

  check("pullstack:the-cap-holds", await p.evaluate(() => window.__tickets()) <= TICKET_CAP, "under " + TICKET_CAP);
  check("console:no-errors", errs.length === 0, errs.slice(0, 2).join(" | ") || "clean");
  await ctx.close();

  if (notes.length) console.log(notes.map((x) => "  ok   " + x).join(LINE));
  if (fails.length) console.log(fails.map((x) => "  FAIL " + x).join(LINE));
  console.log(fails.length ? "pullstack FAIL " + fails.length : "pullstack PASS " + notes.length);
  if (fails.length) process.exitCode = 1;
} finally {
  clearTimeout(t);
  if (b) await b.close();
}
