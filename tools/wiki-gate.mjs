import { chromium } from "playwright";
import { COIN_SAVE, COIN_CONCEDED, COIN_DRILL, COIN_FAME_STEP } from "../web/src/state/wallet.mjs";
import { BOTS } from "../web/src/state/bot.mjs";
import { BUFFS } from "../web/src/state/buff.mjs";
import { LIKE_BASE, LIKE_PER_CITY, MUTUAL_STEP, MUTUAL_CAP, SELFIE_BASE } from "../web/src/state/gram.mjs";
import { PULL_COST, PULL_BULK, PULL_BONUS, TICKET_CAP } from "../src/roster.mjs";

// 위키의 자. 도움말이 타이틀 패널 하나와 재화 클릭 하나로 갈려 있어서, 무엇이 어떻게 도는지를
// 물어볼 자리가 판 안에 없었다. 물음표 하나가 그 자리다.
//
// 재는 것은 여섯이다. 물음표가 진짜 버튼인가, 카테고리 여덟이 각각 표를 들고 서는가,
// 수를 싣는 여섯 칸의 숫자가 코드 상수와 같은가, 봇과 버프는 그 숫자가 제 줄에 서는가,
// 좁은 폭에서 글자가 상자를 넘거나 낱말 한가운데에서 끊기는가, 옛 도움말 표면 둘이 DOM에서 사라졌는가.
//
// 숫자 축은 화면 글자를 읽어 import한 상수와 맞댄다. 파생값은 이 파일이 식을 다시 적는다.
// 최상급은 wiki.mjs가 COIN_SAVE + COIN_FAME_STEP * 9로 굽고 여기서도 같은 식을 따로 적으므로,
// 한쪽의 9만 바뀌면 빨개진다. 상수 자체가 틀린 것은 그 모듈의 몫이지 이 자의 몫이 아니다.
const EXE = process.env.LOCALAPPDATA + "/ms-playwright/chromium-1228/chrome-win64/chrome.exe";
const BASE = "http://127.0.0.1:10310/web/index.html?seed=20&preset=veteran";
const LINE = String.fromCharCode(10);
// 카테고리 여덟. 키는 ASCII다. 화면 라벨로 찾으면 라벨을 다듬은 날 자가 같이 죽는다.
const KEYS = ["hand", "coin", "drill", "pull", "gram", "bot", "buff", "risk"];
/* 수를 싣는 여섯. hand와 risk는 자리와 이름만 싣는 표라 수가 0인 것이 정상이고,
   그래서 아래 계기 축이 요구하는 "수가 한 칸 이상"의 대상에서 빠진다. */
/* 신호가 옮겨야 하는 최소 화소 몫. 그늘이 DOM에만 있고 화면을 안 건드리면 위의 축은 빈 초록이다.
   실측 뒤에 정한다. */
const CUE_FLOOR = 0.12;
const GATED = ["coin", "drill", "pull", "gram", "bot", "buff"];
/* 화면에 찍힌 글자와 맞대므로 상수도 글자로 세운다. 수로 맞대면 0.03 같은 값이
   부동소수 비교가 되고, 천 단위 쉼표가 붙은 날 조용히 지나간다. 글자로 맞대면 서식이 바뀐 것도 잡힌다. */
const S = (v) => String(v);
const WANT = {
  coin: [COIN_SAVE, COIN_CONCEDED, COIN_DRILL, COIN_SAVE + COIN_FAME_STEP * 9].map(S),
  drill: [COIN_DRILL].map(S),
  pull: [PULL_COST, PULL_BULK, PULL_BONUS, TICKET_CAP].map(S),
  gram: [LIKE_BASE, LIKE_PER_CITY, MUTUAL_STEP, MUTUAL_CAP, SELFIE_BASE].map(S),
  bot: BOTS.flatMap((b) => [b.judge, b.minutes, b.cost]).map(S),
  buff: BUFFS.flatMap((b) => [b.shots, b.cost]).map(S)
};
/* 줄 단위로 맞대는 둘. 집합으로만 물으면 판단력 칸과 분 칸이 통째로 바뀌어도 같은 수가 다 있으니 통과한다.
   실측으로 봇 두 줄을 DOM에서 맞바꾼 대조군이 집합 비교는 통과하고 이 비교는 잡는다. */
const ROWS = {
  bot: BOTS.map((b) => [b.name, S(b.judge), S(b.minutes), S(b.cost)]),
  buff: BUFFS.map((b) => [b.name, b.note, S(b.shots), S(b.cost)])
};
const t = setTimeout(() => { console.log("WATCHDOG"); process.exit(1); }, 180000);
t.unref();

const fails = [], notes = [];
const check = (n, ok, d) => (ok ? notes : fails).push(n + " " + d);

/* 본문 한 칸을 읽는다. 표를 줄과 칸까지 펼쳐서 받아 오므로 집합 비교와 줄 비교가 같은 읽기를 쓴다.
   수를 고르는 정규식은 wiki.mjs가 num 칸을 고를 때 쓰는 것과 같은 모양이다. 자가 렌더러보다 좁으면
   렌더러가 수로 칠한 칸을 자가 못 보고, 그 칸은 영원히 안 재진다(실측: 0.03과 1.3 두 칸). */
const READ = () => {
  const box = document.querySelector("#wiki .body");
  if (!box) return null;
  const tables = [...box.querySelectorAll("table")].map((tb) =>
    [...tb.querySelectorAll("tbody tr")].map((r) => [...r.querySelectorAll("th,td")].map((c) => (c.textContent || "").trim())));
  const nums = [];
  for (const tb of tables) for (const r of tb) for (const c of r) if (/^[0-9][0-9,.]*$/.test(c)) nums.push(c);
  return { tables, nums, head: ((box.querySelector("h4") || {}).textContent || "").trim() };
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

/* 줄이 낱말 한가운데에서 끊기는지 본다. 상자를 넘지 않으므로 위의 넘침 자는 이것을 통과시킨다.
   글자를 하나씩 재서 윗변이 내려간 자리가 줄이 넘어간 자리이고, 그 앞 글자가 띄어쓰기가 아니면 낱말을 자른 것이다.
   tools/maxview-gate.mjs의 WRAP을 그대로 가져와 훑는 뿌리만 document.body에서 #wiki로 좁혔다.
   좁힌 이유는 이 자가 재려는 것이 판 전체가 아니라 위키 본문 여덟 칸이기 때문이다.
   이 화면은 이 앱에서 한글 산문이 가장 빽빽한 자리인데, 옛 조작법 패널이 들고 있던 같은 축이
   그 패널과 함께 사라지고 어느 자도 물려받지 않았다.
   끊긴 낱말 0은 훑은 글자 수를 같이 찍어야 뜻이 산다. 아무것도 안 훑은 자와 깨끗한 자는 0을 똑같이 낸다. */
const WRAP = function () {
  const box = document.getElementById("wiki");
  if (!box) return { bad: [], wrapped: 0 };
  const bad = [];
  let wrapped = 0, nodes = 0, chars = 0;
  const walk = document.createTreeWalker(box, NodeFilter.SHOW_TEXT);
  let n;
  while ((n = walk.nextNode())) {
    const s = n.nodeValue;
    if (!s || !s.trim()) continue;
    const host = n.parentElement;
    if (!host || !host.getClientRects().length) continue;
    nodes += 1;
    chars += s.length;
    const r = document.createRange();
    let prevTop = null;
    for (let i = 0; i < s.length; i += 1) {
      r.setStart(n, i);
      r.setEnd(n, i + 1);
      const box2 = r.getBoundingClientRect();
      if (!box2.width && !box2.height) continue;
      if (prevTop !== null && box2.top - prevTop > 1) {
        wrapped += 1;
        if (s[i - 1] !== " ") bad.push(s.slice(Math.max(0, i - 7), i) + "|" + s.slice(i, i + 4));
      }
      prevTop = box2.top;
    }
  }
  return { bad: bad, wrapped: wrapped, nodes: nodes, chars: chars };
};

// 한 칸을 연다. 라벨이 아니라 data-cat 키로 찾으므로 라벨을 다듬어도 자가 안 죽는다.
const OPEN_CAT = (key) => {
  const e = document.querySelector('#wiki .cats [data-cat="' + key + '"]');
  if (!e) return false;
  e.click();
  return true;
};

// 줄과 칸을 자리째 맞댄다. 첫 어긋난 자리를 그대로 돌려주므로 무엇이 어디서 틀렸는지가 실패 줄에 남는다.
const rowGap = (want, got) => {
  if (!got) return "no table";
  if (got.length !== want.length) return "rows " + got.length + " want " + want.length;
  for (let i = 0; i < want.length; i += 1) {
    const a = want[i], g = got[i] || [];
    if (g.length !== a.length) return "row " + i + " has " + g.length + " cells, want " + a.length;
    for (let j = 0; j < a.length; j += 1) {
      if (g[j] !== a[j]) return "row " + i + " cell " + j + " is " + g[j] + ", want " + a[j];
    }
  }
  return "";
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

  if (await p.evaluate(() => Boolean(document.getElementById("wikiBtn")))) {
    await p.click("#wikiBtn", { force: true });
    await p.waitForTimeout(320);
  }
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
  const bare = [], wrong = [], invented = [], headless = [], offRow = [];
  const tally = [];
  let read = 0;
  for (const k of KEYS) {
    if (!(await p.evaluate(OPEN_CAT, k))) { bare.push(k + " no tab"); tally.push(k + " none"); continue; }
    await p.waitForTimeout(180);
    const r = await p.evaluate(READ);
    if (!r) { bare.push(k + " no body"); tally.push(k + " none"); continue; }
    read += 1;
    tally.push(k + " " + r.tables.length + "t/" + r.nums.length + "n");
    if (r.tables.length < 1) bare.push(k + " " + r.tables.length);
    if (!r.head.length) headless.push(k);
    const want = WANT[k];
    if (want) {
      for (const n of want) if (!r.nums.includes(n)) wrong.push(k + " missing " + n);
      for (const n of r.nums) if (!want.includes(n)) invented.push(k + " has " + n);
    }
    const rows = ROWS[k];
    if (rows) {
      const gap = rowGap(rows, r.tables[0]);
      if (gap) offRow.push(k + " " + gap);
    }
  }
  check("wiki:every-category-body-carries-a-table", bare.length === 0, bare.join(", ") || KEYS.length + " bodies, every one tabled");
  check("wiki:every-category-body-names-itself", headless.length === 0, headless.join(",") || "every body carries a noun head");
  // 화면 숫자와 코드 상수를 맞댄다. 양쪽으로 묻는다. 빠진 수와 지어낸 수는 다른 결함이다.
  check("wiki:the-tables-carry-the-code-numbers", wrong.length === 0,
    wrong.slice(0, 3).join(", ") || GATED.length + " numeric bodies match the constants");
  check("wiki:the-tables-invent-no-number", invented.length === 0,
    invented.slice(0, 3).join(", ") || "no number outside the constants");
  check("wiki:the-bot-and-buff-tables-match-row-for-row", offRow.length === 0,
    offRow.slice(0, 2).join(", ") || (ROWS.bot.length + ROWS.buff.length) + " rows in place");
  /* 계기. 본문이 통째로 없으면 위의 네 축은 잴 것이 없어 조용히 초록이 된다. 실측으로 표면이 사라진
     f087b07에서 아홉이 빨개지는 동안 그 넷은 초록이었다. 무엇을 몇 개 읽었는지를 세어 찍는다.
     clip 게이트의 every-window-was-read, price 게이트의 every-label-surface-yielded-labels와 같은 자리다. */
  const numless = GATED.filter((k) => {
    const row = tally.find((x) => x.indexOf(k + " ") === 0);
    return !row || row.indexOf("/0n") >= 0 || row.indexOf(" none") >= 0;
  });
  check("instrument:every-category-body-was-read",
    read === KEYS.length && numless.length === 0,
    read + " of " + KEYS.length + " bodies read, " + tally.join(" ") + (numless.length ? ", numberless " + numless.join(",") : ""));

  /* 대조군. 봇 표의 두 줄을 DOM에서 맞바꾸고 같은 비교를 다시 돌린다. 집합으로만 묻는 자는 이것을 통과시키고
     줄 단위로 묻는 자만 잡는다. 잡지 못하면 위의 줄 축이 낸 초록은 아무것도 안 잰 초록이다.
     심은 자리는 다시 그려서 되돌린다. 카테고리를 다시 누르면 paintWiki가 본문을 새로 굽는다. */
  await p.evaluate(OPEN_CAT, "bot");
  await p.waitForTimeout(180);
  const planted = await p.evaluate(() => {
    const body = document.querySelector("#wiki .body tbody");
    if (!body || body.rows.length < 2) return false;
    body.insertBefore(body.rows[1], body.rows[0]);
    return true;
  });
  const swapped = await p.evaluate(READ);
  const caught = planted && swapped ? rowGap(ROWS.bot, swapped.tables[0]) : "";
  check("control:a-swapped-bot-row-is-caught", planted && caught.length > 0,
    planted ? (caught || "the swap passed the row compare") : "could not plant the swap");
  await p.evaluate(OPEN_CAT, "bot");
  await p.waitForTimeout(180);
  const restored = await p.evaluate(READ);
  check("control:the-planted-swap-was-put-back", restored ? rowGap(ROWS.bot, restored.tables[0]) === "" : false,
    restored ? (rowGap(ROWS.bot, restored.tables[0]) || "bot rows back in order") : "no body");

  /* 닫는 길은 둘이다. 닫기 버튼과 Escape.
     바깥을 눌러 닫는 길은 없고, 그것은 빠뜨린 것이 아니라 형제 창들과 맞춘 약속이다. 상점도 훈련장도
     내 정보도 배경을 눌러 닫히지 않는다. 위키 하나만 다르게 닫히면 창마다 닫는 법이 갈려서
     사람이 누를 때마다 지금 어느 창인지를 먼저 떠올려야 한다.
     옛 타이틀 조작법 패널은 바깥 클릭으로 닫혔지만 그것은 화면 귀퉁이의 작은 말풍선이었고
     이 화면은 화면 전체를 덮는 창이다. 그래서 그 축은 승계자 없이 닫혔고, 이 주석이 그 기록이다. */
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

  const spill = [], split = [];
  let narrowRead = 0, breaks = 0, scanNodes = 0, scanChars = 0;
  for (const k of KEYS) {
    if (!(await p.evaluate(OPEN_CAT, k))) continue;
    await p.waitForTimeout(160);
    narrowRead += 1;
    const away = await p.evaluate(OVER);
    if (away.length) spill.push(k + ": " + away.join("/"));
    const w = await p.evaluate(WRAP);
    breaks += w.wrapped;
    scanNodes += w.nodes;
    scanChars += w.chars;
    if (w.bad.length) split.push(k + ": " + w.bad.slice(0, 2).join(" "));
  }
  check("wiki:no-text-runs-off-the-narrow-screen", spill.length === 0,
    spill.slice(0, 3).join(", ") || "every line inside 740x360");
  check("wiki:no-word-is-cut-across-lines", narrowRead === KEYS.length && scanChars > 0 && split.length === 0,
    split.length ? split.slice(0, 2).join(", ")
      : narrowRead + " bodies scanned, " + scanNodes + " text nodes, " + scanChars + " chars, "
        + breaks + " line breaks, every one on a space");

  /* 대조군. 낱말을 자를 수밖에 없는 좁은 칸을 위키 안에 심고 같은 자를 다시 돌린다.
     못 잡으면 위의 초록은 훑지 않은 초록이다. maxview 게이트가 같은 방식으로 자기 자를 검증한다. */
  const probe = await p.evaluate(() => {
    const box = document.getElementById("wiki");
    if (!box) return false;
    const e = document.createElement("div");
    e.id = "wikiWrapProbe";
    e.style.cssText = "position:fixed;left:10px;top:60px;width:42px;font-size:14px;word-break:break-all;z-index:9";
    e.textContent = "가나다라마바사아자차카타파하가나다라";
    box.appendChild(e);
    return true;
  });
  await p.waitForTimeout(120);
  const probed = await p.evaluate(WRAP);
  check("instrument:the-wrap-scan-catches-a-planted-break", probe && probed.bad.length > 0,
    probe ? "planted, caught " + probed.bad.length : "could not plant the probe");
  await p.evaluate(() => { const e = document.getElementById("wikiWrapProbe"); if (e) e.remove(); });
  await p.waitForTimeout(80);
  const afterProbe = await p.evaluate(WRAP);
  check("control:the-planted-break-was-put-back", afterProbe.bad.length === 0,
    afterProbe.bad.slice(0, 2).join(" ") || "probe removed, scan clean again");

  /* 넘친다고 화면이 말하는가. 본문은 굴러가지만 굴러간다는 자국이 화면에 하나도 없었다.
     실측으로 740x360에서 여덟 칸이 전부 넘쳤고, 조작 칸은 187px 창에 317px을 담아 세 줄짜리
     자리/키 표에서 왼쪽 한 줄만 보였다. 옛 타이틀 조작법 패널이 세 줄을 다 보여 주던 자리다.
     신호는 문장이 아니라 본문 아래끝의 그늘이다. 문장은 여덟 칸에 여덟 번 서서 본문을 또 밀어낸다. */
  const CUE = () => {
    const body = document.querySelector("#wiki .body");
    if (!body) return null;
    const wrap = body.parentElement;
    const r = body.getBoundingClientRect();
    const seat = (sel) => {
      const e = wrap ? wrap.querySelector(sel) : null;
      if (!e) return null;
      const q = e.getBoundingClientRect();
      return { h: Math.round(q.height), w: Math.round(q.width), top: Math.round(q.top),
        bottom: Math.round(q.bottom), left: Math.round(q.left), op: Number(getComputedStyle(e).opacity) };
    };
    return { over: Math.round(body.scrollHeight - body.clientHeight), at: Math.round(body.scrollTop),
      top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), w: Math.round(r.width),
      down: seat(".cue.down"), up: seat(".cue.up") };
  };
  // 끝까지 굴린다. scrollTop을 코드로 밀면 scroll 이벤트가 안 오는 판이 있어 여기서 같이 친다.
  const SCROLL = (to) => {
    const body = document.querySelector("#wiki .body");
    if (!body) return -1;
    body.scrollTop = to < 0 ? body.scrollHeight : to;
    body.dispatchEvent(new Event("scroll"));
    return Math.round(body.scrollTop);
  };
  /* 화소로 묻는다. 신호가 DOM에만 있고 화소를 하나도 안 옮기면 위의 축들은 빈 초록이다.
     같은 자리를 두 번 찍는다. 한 번은 그대로, 한 번은 신호를 걷고. 세 채널 중 가장 큰 차가
     8을 넘은 화소를 센다. 8은 글자 가장자리가 배경과 섞이며 흔들리는 폭보다 크다
     (price 게이트가 같은 이유로 24를 쓰는데, 거기는 글자 심을 세고 여기는 면을 센다). */
  const PIX_TOL = 8;
  const shot = async (c) => (await p.screenshot({ clip: { x: c.left, y: c.bottom - c.down.h, width: c.w, height: c.down.h } })).toString("base64");
  const moved = async (a, z) => p.evaluate(([s1, s2, tol]) => new Promise((res) => {
    const load = (s) => new Promise((r2) => { const im = new Image(); im.onload = () => r2(im); im.src = "data:image/png;base64," + s; });
    Promise.all([load(s1), load(s2)]).then(([ia, ib]) => {
      const cv = document.createElement("canvas");
      cv.width = ia.width; cv.height = ia.height;
      const g = cv.getContext("2d");
      g.drawImage(ia, 0, 0);
      const da = g.getImageData(0, 0, ia.width, ia.height).data;
      g.clearRect(0, 0, cv.width, cv.height);
      g.drawImage(ib, 0, 0);
      const db = g.getImageData(0, 0, ia.width, ia.height).data;
      let n = 0;
      for (let i = 0; i < da.length; i += 4) {
        if (Math.max(Math.abs(da[i] - db[i]), Math.abs(da[i + 1] - db[i + 1]), Math.abs(da[i + 2] - db[i + 2])) > tol) n += 1;
      }
      res({ moved: n, all: da.length / 4 });
    });
  }), [a, z, PIX_TOL]);

  const cueless = [], offSeat = [], noFlip = [], flat = [];
  const overTally = [];
  let overflowing = 0, seated = 0, pixels = 0, flips = 0, worst = 1;
  for (const k of KEYS) {
    if (!(await p.evaluate(OPEN_CAT, k))) continue;
    await p.waitForTimeout(160);
    await p.evaluate(SCROLL, 0);
    await p.waitForTimeout(90);
    const c = await p.evaluate(CUE);
    if (!c) { cueless.push(k + " no body"); continue; }
    overTally.push(k + " " + c.over);
    if (c.over <= 1) continue;
    overflowing += 1;
    if (!c.down || c.down.h < 1 || c.down.op < 1) {
      cueless.push(k + " " + (c.down ? c.down.h + "px opacity " + c.down.op : "no .cue.down"));
      continue;
    }
    seated += 1;
    if (Math.abs(c.down.bottom - c.bottom) > 1 || Math.abs(c.down.w - c.w) > 2) {
      offSeat.push(k + " cue bottom " + c.down.bottom + " width " + c.down.w + ", body bottom " + c.bottom + " width " + c.w);
    }
    const on = await shot(c);
    await p.evaluate(() => { const e = document.querySelector("#wiki .cue.down"); if (e) e.style.display = "none"; });
    await p.waitForTimeout(70);
    const off = await shot(c);
    await p.evaluate(() => { const e = document.querySelector("#wiki .cue.down"); if (e) e.style.display = ""; });
    await p.waitForTimeout(70);
    const m = await moved(on, off);
    pixels += 1;
    const share = m.moved / m.all;
    if (share < worst) worst = share;
    if (share < CUE_FLOOR) flat.push(k + " " + (share * 100).toFixed(1) + "% of " + m.all + "px");
    await p.evaluate(SCROLL, -1);
    await p.waitForTimeout(120);
    const e2 = await p.evaluate(CUE);
    flips += 1;
    const turned = e2 && e2.down && e2.up && e2.down.op === 0 && e2.up.op === 1;
    if (!turned) noFlip.push(k + " " + (e2 && e2.down ? "down " + e2.down.op + " up " + (e2.up ? e2.up.op : "none") : "no cue"));
  }
  /* 셋 다 센 것을 같이 찍는다. 신호가 통째로 없으면 실패 목록이 비어서, 앞 축에서 걸러진 칸을
     뒤 축은 잰 적도 없이 초록으로 넘겼다(실측: 신호 0개인 판에서 자리 축과 뒤집기 축이 8을 찍었다). */
  check("wiki:an-overflowing-body-paints-a-bottom-cue", overflowing > 0 && cueless.length === 0,
    cueless.slice(0, 3).join(", ") || overflowing + " overflowing bodies at 740x360, every one cued");
  check("wiki:the-cue-sits-on-the-body-bottom-edge", overflowing > 0 && seated === overflowing && offSeat.length === 0,
    offSeat.slice(0, 2).join(", ") || seated + " of " + overflowing + " cues flush with the body box");
  check("wiki:the-cue-flips-when-the-body-hits-the-bottom", overflowing > 0 && flips === overflowing && noFlip.length === 0,
    noFlip.slice(0, 3).join(", ") || flips + " of " + overflowing + " bodies flip the cue to the top edge at max scroll");
  check("wiki:the-cue-moves-real-pixels", overflowing > 0 && pixels === overflowing && flat.length === 0,
    flat.slice(0, 3).join(", ") || pixels + " of " + overflowing + " strips compared, weakest "
      + (pixels ? (worst * 100).toFixed(1) + "%" : "nothing") + " of pixels moved, floor " + (CUE_FLOOR * 100).toFixed(0) + "%");
  check("instrument:every-narrow-body-was-measured-for-overflow", overTally.length === KEYS.length,
    overTally.length + " of " + KEYS.length + " bodies read, hidden px " + overTally.join(" "));

  /* 대조군. 넘치지 않는 본문은 신호를 안 켠다. 늘 켜 두는 그늘은 마지막 줄을 영원히 흐리게 두고,
     그때 이 신호는 더 있다는 뜻을 잃는다. 1280x720에서는 훈련만 넘치므로 나머지 일곱이 대조군이다. */
  await p.setViewportSize({ width: 1280, height: 720 });
  await p.waitForTimeout(400);
  const stuck = [], dimmed = [];
  let fitted = 0, wideOver = 0;
  for (const k of KEYS) {
    if (!(await p.evaluate(OPEN_CAT, k))) continue;
    await p.waitForTimeout(160);
    await p.evaluate(SCROLL, 0);
    await p.waitForTimeout(90);
    const c = await p.evaluate(CUE);
    if (!c) continue;
    if (c.over > 1) { wideOver += 1; if (!c.down || c.down.op < 1) dimmed.push(k + " " + (c.down ? "opacity " + c.down.op : "no cue")); }
    else { fitted += 1; if (!c.down) stuck.push(k + " no cue element"); else if (c.down.op > 0) stuck.push(k + " opacity " + c.down.op); }
  }
  check("control:a-body-that-fits-paints-no-cue", fitted > 0 && stuck.length === 0,
    stuck.slice(0, 3).join(", ") || fitted + " bodies fit at 1280x720 and none paints a cue");
  check("control:the-wide-viewport-still-cues-what-overflows", wideOver > 0 && dimmed.length === 0,
    dimmed.slice(0, 2).join(", ") || wideOver + " overflowing at 1280x720, every one cued");

  /* 살아 있는 창 크기 변화. 신호는 그릴 때와 굴릴 때만 다시 셌으므로, 창만 바뀌고 아무도 안 누르면
     옛 답이 화면에 남았다. 실측으로 조작 칸을 740x360에서 그린 뒤 1280x720으로 늘리면 넘침이 130에서
     0으로 주는데 그늘은 켜진 채였고, 줄이면 넘침이 다시 130인데 그늘은 꺼진 채였다. 뒤엣것이
     이 자가 막으려던 결함 그대로다. 그래서 다시 그리지 않고 폭만 바꿔서 묻는다.
     조작 칸을 쓰는 이유는 740에서 넘치고 1280에서 안 넘치는 칸이라 한 칸으로 양쪽을 다 묻기 때문이다. */
  await p.setViewportSize({ width: 740, height: 360 });
  await p.waitForTimeout(420);
  await p.evaluate(OPEN_CAT, "hand");
  await p.waitForTimeout(240);
  const drew = await p.evaluate(CUE);
  await p.setViewportSize({ width: 1280, height: 720 });
  await p.waitForTimeout(440);
  const grew = await p.evaluate(CUE);
  await p.setViewportSize({ width: 740, height: 360 });
  await p.waitForTimeout(440);
  const shrank = await p.evaluate(CUE);
  const say = (c) => (c && c.down ? "over " + c.over + " cue " + c.down.op : "no cue");
  const liveOk = Boolean(drew && grew && shrank && drew.down && grew.down && shrank.down)
    && drew.over > 1 && drew.down.op === 1
    && grew.over === 0 && grew.down.op === 0
    && shrank.over > 1 && shrank.down.op === 1;
  check("wiki:a-live-resize-recomputes-the-cue", liveOk,
    "painted at 740x360 " + say(drew) + ", grown to 1280x720 without a click " + say(grew)
      + ", back to 740x360 " + say(shrank));

  check("console:no-errors", errs.length === 0, errs.slice(0, 2).join(" | ") || "clean");
  await ctx.close();

  if (notes.length) console.log(notes.map((x) => "  ok   " + x).join(LINE));
  if (fails.length) console.log(fails.map((x) => "  FAIL " + x).join(LINE));
  console.log("표본 범위: 카테고리 8 전부 × 본문 표. 수를 싣는 6칸은 상수와 맞대고 봇과 버프는 줄 단위로 맞댄다. 뷰포트 1280x720과 740x360");
  console.log(fails.length ? "wiki FAIL " + fails.length : "wiki PASS " + notes.length);
  process.exit(fails.length ? 1 : 0);
} catch (e) {
  console.log("wiki ERROR " + String(e && e.message ? e.message : e));
  process.exit(1);
} finally {
  if (b) await b.close();
}
