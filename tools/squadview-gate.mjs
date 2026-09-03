import { chromium } from "playwright";

// 선수단 창의 자. 가진 사람과 데려올 사람이 한 목록을 나눠 쓰면, 명단 밖에서 시작한 첫 키퍼는
// 어느 줄에도 없고 다른 사람을 세우는 순간 영영 못 돌아온다.
//
// 재는 것은 셋이다. 가진 사람이 전부 서 있는가, 지금 뛰는 사람이 표시되는가,
// 명단 밖 키퍼로 돌아갈 수 있는가.
//
// 대조군은 값이다. 가진 사람을 세우는 데는 값이 안 나가고 명단에서 데려오는 데는 나간다.
// 그 둘이 같은 줄에 있으면 화면에서 구분되지 않으므로, 두 경로의 잔고를 각각 잰다.
const EXE = process.env.LOCALAPPDATA + "/ms-playwright/chromium-1228/chrome-win64/chrome.exe";
const LINE = String.fromCharCode(10);
const t = setTimeout(() => { console.log("WATCHDOG"); process.exit(1); }, 150000);
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
  p.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
  await p.goto("http://127.0.0.1:10310/web/index.html?seed=20&preset=rich", { waitUntil: "load" });
  await p.waitForSelector("#go", { timeout: 15000 });
  await p.click("#go", { force: true });
  await p.waitForTimeout(1300);

  const view = () => p.evaluate(() => window.__squadView());
  const rows = () => p.evaluate(() => ({
    mine: [...document.querySelectorAll("#roster .row.mine button")].map((e) => e.textContent.trim()),
    hire: document.querySelectorAll("#roster .row.hire button").length,
    standing: [...document.querySelectorAll("#roster .row.mine button.here")].length
  }));

  await p.evaluate(() => window.__roster(true));
  await p.waitForSelector("#roster .row.mine button", { timeout: 8000 });
  const first = await view();
  const shown = await rows();
  check("instrument:the-game-starts-with-one-keeper-off-the-roster", first.mine.length === 1
    && first.hire.indexOf(first.mine[0]) < 0, first.mine.join(", "));
  check("squadview:everyone-owned-has-a-row", shown.mine.length === first.mine.length,
    shown.mine.length + " rows for " + first.mine.length + " owned");
  check("squadview:the-one-standing-is-marked", shown.standing === 1, shown.standing + " marked");
  check("squadview:the-hire-list-holds-only-what-is-missing", shown.hire === first.hire.length,
    shown.hire + " hire rows, " + first.hire.length + " unowned");

  // 명단에서 한 명 데려온다. 값이 나가야 한다.
  const before = await p.evaluate(() => window.__wallet().coin);
  const hired = await p.evaluate(() => {
    const b = [...document.querySelectorAll("#roster .row.hire button")].find((e) => !e.disabled);
    if (!b) return "";
    const n = b.textContent.trim();
    b.click();
    return n;
  });
  await p.waitForTimeout(500);
  const after = await p.evaluate(() => window.__wallet().coin);
  const two = await view();
  check("squadview:hiring-adds-the-keeper-and-stands-them-up", two.mine.length === 2 && two.pick === 1,
    two.mine.join(", ") + " standing " + two.pick);
  check("control:hiring-costs-money", after < before, before + " to " + after);

  // 첫 키퍼로 돌아간다. 이것이 이 랩이 여는 문이다.
  await p.evaluate(() => window.__roster(true));
  await p.waitForSelector("#roster .row.mine button", { timeout: 8000 });
  const backRow = await p.evaluate(() => {
    const b = [...document.querySelectorAll("#roster .row.mine button")].find((e) => !e.disabled);
    if (!b) return "";
    const n = b.textContent.trim();
    b.click();
    return n;
  });
  await p.waitForTimeout(500);
  const back = await view();
  const paid = await p.evaluate(() => window.__wallet().coin);
  check("squadview:a-keeper-off-the-roster-can-be-stood-up-again", back.pick === 0 && back.mine[0] === first.mine[0],
    "standing " + back.pick + " " + back.mine[back.pick]);
  check("control:standing-someone-you-own-costs-nothing", paid === after, after + " then " + paid);
  check("instrument:the-row-that-was-clicked-named-the-first-keeper", backRow.indexOf(first.mine[0]) >= 0,
    JSON.stringify(backRow.slice(0, 24)));

  // 가진 사람은 명단 줄에 다시 뜨지 않는다. 두 번 살 수 있는 것처럼 읽히면 안 된다.
  await p.evaluate(() => window.__roster(true));
  await p.waitForTimeout(300);
  const dup = await p.evaluate((names) => [...document.querySelectorAll("#roster .row.hire button")]
    .filter((e) => names.some((n) => e.textContent.indexOf(n) >= 0)).length, back.mine);
  check("control:an-owned-keeper-never-appears-in-the-hire-list", dup === 0, dup + " duplicates");

  check("console:no-errors", errs.length === 0, errs.slice(0, 2).join(" | ") || "clean");
  await ctx.close();

  if (notes.length) console.log(notes.map((x) => "  ok   " + x).join(LINE));
  if (fails.length) console.log(fails.map((x) => "  FAIL " + x).join(LINE));
  console.log(fails.length ? "squadview FAIL " + fails.length : "squadview PASS " + notes.length);
  if (fails.length) process.exitCode = 1;
} finally {
  clearTimeout(t);
  if (b) await b.close();
}

