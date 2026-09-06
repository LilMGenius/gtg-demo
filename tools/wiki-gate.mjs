import { chromium } from "playwright";
import { COIN_SAVE, COIN_CONCEDED, COIN_DRILL, COIN_FAME_STEP } from "../web/src/state/wallet.mjs";
import { BOTS } from "../web/src/state/bot.mjs";
import { BUFFS } from "../web/src/state/buff.mjs";

// 위키의 자. 도움말이 타이틀 패널 하나와 재화 클릭 하나로 갈려 있어서, 무엇이 어떻게 도는지를
// 물어볼 자리가 판 안에 없었다. 물음표 하나가 그 자리다.
//
// 재는 것은 넷이다. 물음표가 진짜 버튼인가, 카테고리 여덟이 각각 표를 들고 서는가,
// 그 표의 숫자가 코드 상수와 같은가, 옛 도움말 표면 둘이 DOM에서 사라졌는가.
// 숫자 축은 화면 글자를 읽어 import한 상수와 맞댄다. 화면에 숫자를 다시 적으면
// 상수가 바뀐 날 이 자가 그 차이를 잡는다.
const EXE = process.env.LOCALAPPDATA + "/ms-playwright/chromium-1228/chrome-win64/chrome.exe";
const BASE = "http://127.0.0.1:10310/web/index.html?seed=20&preset=veteran";
const LINE = String.fromCharCode(10);
// 카테고리 여덟. 키는 ASCII다. 화면 라벨로 찾으면 라벨을 다듬은 날 자가 같이 죽는다.
const KEYS = ["hand", "coin", "drill", "pull", "gram", "bot", "buff", "risk"];
// 표에 서야 하는 숫자. 상수에서 뽑으므로 이 파일에는 수를 적지 않는다.
// 최상급은 명성 10단이라 COIN_SAVE에 아홉 계단이 붙는다.
const WANT = {
  coin: [COIN_SAVE, COIN_CONCEDED, COIN_DRILL, COIN_SAVE + COIN_FAME_STEP * 9],
  bot: BOTS.flatMap((b) => [b.cost, b.minutes, b.judge]),
  buff: BUFFS.flatMap((b) => [b.cost, b.shots])
};
const t = setTimeout(() => { console.log("WATCHDOG"); process.exit(1); }, 150000);
t.unref();

const fails = [], notes = [];
const check = (n, ok, d) => (ok ? notes : fails).push(n + " " + d);

// 본문 한 칸을 읽는다. 표가 몇 개인지와 그 표에 찍힌 숫자가 무엇인지를 같이 받아 온다.
const READ = () => {
  const box = document.querySelector("#wiki .body");
  if (!box) return { tables: 0, nums: [], head: "" };
  const cells = [...box.querySelectorAll("td,th")].map((c) => (c.textContent || "").trim());
  const nums = [];
  for (const c of cells) if (/^[0-9][0-9,]*$/.test(c)) nums.push(Number(c.replace(/,/g, "")));
  return {
    tables: box.querySelectorAll("table").length,
    nums,
    head: ((box.querySelector("h4") || {}).textContent || "").trim()
  };
};

// 글자가 제 상자를 넘는가. 긁을 수 있는 칸 안에 있는 글자는 넘은 것이 아니라 아직 안 보인 것이다.
const OVER = () => {
  const box = document.getElementById("wiki");
  if (!box) return [];
  const scroller = (e) => {
    for (let n = e.parentElement; n && n !== box.parentElement; n = n.parentElement) {
      if (n.scrollHeight > n.clientHeight + 2 && /auto|scroll/.test(getComputedStyle(n).overflowY)) return n;
      if (n.scrollWidth > n.clientWidth + 2 && /auto|scroll/.test(getComputedStyle(n).overflowX)) return n;
    }
    return null;
  };
  return [...box.querySelectorAll("*")]
    .filter((e) => e.children.length === 0 && (e.textContent || "").trim() && !scroller(e))
    .filter((e) => {
      const q = e.getBoundingClientRect();
      return q.width > 0 && q.height > 0 && (q.bottom > innerHeight + 1 || q.top < -1 || q.right > innerWidth + 1 || q.left < -1);
    })
    .map((e) => (e.textContent || "").trim().slice(0, 12))
    .slice(0, 3);
};

let b;
try {
  b = await chromium.launch({ executablePath: EXE });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } });
  const p = await ctx.newPage();
  const errs = [];
  p.on("pageerror", (e) => errs.push(String(e)));
  await p.goto(BASE, { waitUntil: "load" });
  await p.waitForSelector("#go", { timeout: 15000 });

  // 옛 도움말 표면 둘. 재화 창과 타이틀 조작법 패널은 이 화면이 가져갔으므로 DOM에 남으면 안 된다.
  // 남겨 두면 같은 사실을 말하는 자리가 셋이 되고, 그중 둘은 아무도 안 고친다.
  const ghosts = await p.evaluate(() => ["earn", "helpPanel"].filter((i) => document.getElementById(i)));
  check("wiki:the-old-help-surfaces-are-gone", ghosts.length === 0, ghosts.join(",") || "earn and helpPanel absent");

  await p.click("#go", { force: true });
  await p.waitForTimeout(1200);

  // 물음표는 button이어야 한다. 글자에 클릭을 붙이면 누를 수 있다는 신호가 화면에 없다.
  const btn = await p.evaluate(() => {
    const e = document.getElementById("wikiBtn");
    return e ? { tag: e.tagName, aria: e.getAttribute("aria-expanded"), label: e.getAttribute("aria-label") || "" } : null;
  });
  check("wiki:the-question-mark-is-a-button", Boolean(btn) && btn.tag === "BUTTON" && btn.label.length > 0,
    btn ? btn.tag + " label " + btn.label : "#wikiBtn missing");
  const folded = await p.evaluate(() => { const e = document.getElementById("wiki"); return e ? e.hidden : null; });
  check("wiki:starts-folded", folded === true && (btn ? btn.aria === "false" : false),
    "hidden " + folded + " aria " + (btn ? btn.aria : "none"));

  const opened = await p.evaluate(() => Boolean(document.getElementById("wikiBtn")));
  if (opened) { await p.click("#wikiBtn", { force: true }); await p.waitForTimeout(320); }
  const up = await p.evaluate(() => {
    const e = document.getElementById("wiki");
    const q = document.getElementById("wikiBtn");
    return { shown: Boolean(e) && !e.hidden, aria: q ? q.getAttribute("aria-expanded") : "none" };
  });
  check("wiki:the-question-mark-opens-the-guide", up.shown === true && up.aria === "true",
    "shown " + up.shown + " aria " + up.aria);

  // 카테고리 여덟. 하나라도 비면 그 주제는 화면 어디에도 답이 없다.
  const cats = await p.evaluate(() => [...document.querySelectorAll("#wiki .cats [data-cat]")]
    .map((e) => ({ key: e.dataset.cat, tag: e.tagName, label: (e.textContent || "").trim() })));
  const keys = cats.map((c) => c.key);
  const missing = KEYS.filter((k) => !keys.includes(k));
  const mute = cats.filter((c) => !c.label.length || c.tag !== "BUTTON").map((c) => c.key);
  check("wiki:eight-categories-stand", cats.length === KEYS.length && missing.length === 0 && mute.length === 0,
    cats.length + " categories, missing " + (missing.join(",") || "none") + ", unnamed " + (mute.join(",") || "none"));

  // 본문마다 표가 하나 이상. 표 없는 본문은 문장만 남은 자리이고, 수치를 물으러 온 눈이 빈손으로 나간다.
  const bare = [], wrong = [], invented = [], headless = [];
  for (const k of KEYS) {
    const hit = await p.evaluate((key) => {
      const e = document.querySelector('#wiki .cats [data-cat="' + key + '"]');
      if (!e) return false;
      e.click();
      return true;
    }, k);
    if (!hit) { bare.push(k); continue; }
    await p.waitForTimeout(180);
    const r = await p.evaluate(READ);
    if (r.tables < 1) bare.push(k + " " + r.tables);
    if (!r.head.length) headless.push(k);
    const want = WANT[k];
    if (want) {
      for (const n of want) if (!r.nums.includes(n)) wrong.push(k + " missing " + n);
      for (const n of r.nums) if (!want.includes(n)) invented.push(k + " has " + n);
    }
  }
  check("wiki:every-category-body-carries-a-table", bare.length === 0, bare.join(", ") || KEYS.length + " bodies, every one tabled");
  check("wiki:every-category-body-names-itself", headless.length === 0, headless.join(",") || "every body carries a noun head");
  // 화면 숫자와 코드 상수를 맞댄다. 양쪽으로 묻는다. 빠진 수와 지어낸 수는 다른 결함이다.
  check("wiki:the-tables-carry-the-code-numbers", wrong.length === 0,
    wrong.slice(0, 3).join(", ") || Object.keys(WANT).length + " tables match the constants");
  check("wiki:the-tables-invent-no-number", invented.length === 0,
    invented.slice(0, 3).join(", ") || "no number outside the constants");

  // 닫는 길이 둘이다. 버튼 하나뿐이면 펼친 판이 화면을 계속 가린다.
  await p.keyboard.press("Escape");
  await p.waitForTimeout(220);
  const byEsc = await p.evaluate(() => { const e = document.getElementById("wiki"); return e ? e.hidden : null; });
  check("wiki:escape-closes", byEsc === true, String(byEsc));
  if (await p.evaluate(() => Boolean(document.getElementById("wikiBtn")))) await p.click("#wikiBtn", { force: true });
  await p.waitForTimeout(260);
  const closer = await p.evaluate(() => { const c = document.querySelector("#wiki .close"); if (c) c.click(); return Boolean(c); });
  await p.waitForTimeout(220);
  const byBtn = await p.evaluate(() => { const e = document.getElementById("wiki"); return e ? e.hidden : null; });
  check("wiki:the-close-button-closes", closer && byBtn === true, closer ? String(byBtn) : "no close button");

  /* 좁은 폭. 740x360에서 카테고리는 옆 기둥이 아니라 위 가로 탭이다. 기둥으로 두면 360px 높이에서
     여덟 칸이 본문을 아래로 밀어내고, 본문 첫 줄이 화면 밖에서 시작한다. */
  await p.setViewportSize({ width: 740, height: 360 });
  await p.waitForTimeout(400);
  if (await p.evaluate(() => Boolean(document.getElementById("wikiBtn")))) await p.click("#wikiBtn", { force: true });
  await p.waitForTimeout(320);
  const strip = await p.evaluate(() => {
    const c = document.querySelector("#wiki .cats");
    if (!c) return null;
    const s = getComputedStyle(c);
    const kids = [...c.children].map((e) => e.getBoundingClientRect());
    const rows = new Set(kids.map((r) => Math.round(r.top)));
    return { dir: s.flexDirection, rows: rows.size, scroll: s.overflowX };
  });
  check("wiki:narrow-width-lays-the-categories-in-one-strip",
    Boolean(strip) && strip.rows === 1 && /auto|scroll/.test(strip.scroll),
    strip ? strip.rows + " rows, overflow-x " + strip.scroll : "no .cats");
  const spill = [];
  for (const k of KEYS) {
    const hit = await p.evaluate((key) => {
      const e = document.querySelector('#wiki .cats [data-cat="' + key + '"]');
      if (!e) return false;
      e.click();
      return true;
    }, k);
    if (!hit) continue;
    await p.waitForTimeout(160);
    const away = await p.evaluate(OVER);
    if (away.length) spill.push(k + ": " + away.join("/"));
  }
  check("wiki:no-text-runs-off-the-narrow-screen", spill.length === 0,
    spill.slice(0, 3).join(", ") || "every line inside 740x360");

  check("console:no-errors", errs.length === 0, errs.slice(0, 2).join(" | ") || "clean");
  await ctx.close();

  if (notes.length) console.log(notes.map((x) => "  ok   " + x).join(LINE));
  if (fails.length) console.log(fails.map((x) => "  FAIL " + x).join(LINE));
  console.log("표본 범위: 카테고리 8 전부 × 본문 표, 뷰포트 1280x720과 740x360");
  console.log(fails.length ? "wiki FAIL " + fails.length : "wiki PASS " + notes.length);
  process.exit(fails.length ? 1 : 0);
} catch (e) {
  console.log("wiki ERROR " + String(e && e.message ? e.message : e));
  process.exit(1);
} finally {
  if (b) await b.close();
}
