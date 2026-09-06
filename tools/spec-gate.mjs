import { chromium } from "playwright";

// 효과 칸의 자. 상점 카드가 이름과 한 줄만 들고, 수치는 손을 올린 카드의 것만 별도 칸이 받는가.
//
// 카드 본문에 다 적으면 격자가 글자 벽이 되고, 별도 칸에 아무것도 안 오면 무엇을 사는지 모른다.
// 그래서 둘을 같이 잰다. 본문에 수치가 없다와 칸이 카드마다 다른 것을 말한다.
//
// 다름을 재는 축에는 같음을 재는 대조군이 붙는다. 같은 카드에 두 번 손을 올리면 같은 문장이 와야
// 하고, 손을 떼면 칸이 다시 비어야 한다. 그 둘이 없으면 달라진 문장이 카드 때문인지 잡음인지 모른다.
//
// 잘림은 칸의 아래변에서만 일어나지 않는다. 줄이 스스로 줄어들면 잘림이 줄 안으로 옮겨 가고,
// 마지막 줄의 아래끝만 재는 자는 그것을 못 본다(실측: 줄 하나가 clientHeight 31에 scrollHeight 50,
// DOM에는 '장갑이 벗겨지는 사고'가 있는데 화면은 '장갑이'까지만 보여 주었다).
// 그래서 줄마다 제 글자를 다 보여 주는지를 따로 묻고, 좁은 폭에서도 같은 것을 묻는다.
const EXE = process.env.LOCALAPPDATA + "/ms-playwright/chromium-1228/chrome-win64/chrome.exe";
const BASE = "http://127.0.0.1:10310/web/index.html?seed=20&preset=rich,veteran";
// 계획이 정한 두 폭. 좁은 쪽은 모바일 하한이다.
const VIEWS = [[1280, 720], [740, 360]];
// 효과 표를 든 네 선반. 판정에 드는 것, 외형만 바꾸는 것, 소모형 둘을 섞는다.
const SHELVES = ["glove", "hair", "bot", "buff"];
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
  await p.goto(BASE, { waitUntil: "load" });
  await p.waitForSelector("#go", { timeout: 15000 });
  await p.click("#go", { force: true });
  await p.waitForTimeout(1300);
  await p.evaluate(() => window.__shop(true));
  await p.waitForTimeout(320);

  const spec = () => p.evaluate(() => {
    const e = document.querySelector("#shop .fitting .spec");
    return e ? { text: e.innerText.trim(), at: e.dataset.at || "", rows: e.querySelectorAll("i").length,
      seen: e.getClientRects().length > 0, h: Math.round(e.getBoundingClientRect().height) } : null;
  });

  // 탭 줄의 세로 위치. 카드에 손을 올렸다고 이것이 움직이면 손이 다른 곳을 누른다.
  const tabTop = () => p.evaluate(() => {
    const e = document.querySelector("#shop .tabs");
    return e ? Math.round(e.getBoundingClientRect().top) : -1;
  });
  const shelfTops = [], allTops = [], clipped = [];
  const idle = await spec();
  check("instrument:the-panel-exists-and-is-on-screen", Boolean(idle && idle.seen), idle ? "visible" : "missing");
  /* 손을 올리라는 안내 문장은 지워졌고 빈 칸이 그 자리를 대신한다. 그래서 묻는 것이 둘로 갈린다.
     어느 카드에도 안 묶여 있는가, 그리고 비어 있어도 칸이 제 높이를 들고 있는가.
     칸이 접히면 왼쪽 기둥이 짧아지고 그만큼 탭 줄이 뛴다. 빈 칸과 없는 칸은 다르다. */
  const IDLE_BOX = 120; // hud.css가 이 칸에 준 flex 기준 높이. 빈 상태로 잰 값은 선반별 120/128/154px이었다
  check("spec:the-panel-starts-empty-and-holds-its-box",
    Boolean(idle) && idle.at === "" && idle.rows === 0 && idle.h >= IDLE_BOX,
    idle ? JSON.stringify(idle.text) + " box " + idle.h + "px" : "missing");

  // 효과를 갖는 선반 넷을 돈다. 판정에 들어가는 것, 외형만 바꾸는 것, 소모형 둘을 섞는다.
  const tabs = SHELVES;
  const seen = [];
  let empty = [], wall = [], stuck = [], squeezed = [];
  for (const tab of tabs) {
    await p.click('#shop .tab[data-tab="' + tab + '"]', { force: true });
    // 탭 이름으로 못 박는다. 아무 카드나 세면 아직 안 갈린 앞 탭의 카드를 세고 인덱스가 어긋난다.
    const sel = '#shop .card[data-spec="' + tab + '"]';
    await p.waitForSelector(sel, { timeout: 8000 }).catch(() => {});
    const cards = await p.evaluate((q) => document.querySelectorAll(q).length, sel);
    if (cards === 0) { empty.push(tab); continue; }
    // 이 선반의 빈 칸 자리부터 잰다. 채우기 전과 후가 한 통에 있어야 채움이 민 거리가 나온다.
    await p.mouse.move(4, 4);
    await p.waitForTimeout(140);
    const mine = [await tabTop()];
    for (let i = 0; i < cards; i += 1) {
      const card = p.locator(sel).nth(i);
      await card.hover();
      await p.waitForTimeout(120);
      const s = await spec();
      if (!s || s.rows === 0 || s.at === "") { stuck.push(tab + "#" + i); continue; }
      seen.push(tab + "#" + i + " " + s.text.replace(/\n/g, " / "));
      mine.push(await tabTop());
      // 칸이 잘리면 마지막 줄이 반만 남는다. 그 줄은 화면에 있지만 읽을 수 없다.
      // scrollHeight로 재면 padding-bottom이 초과분으로 잡혀 잘리지 않은 칸도 빨개진다.
      // 마지막 줄의 아래끝이 칸의 안쪽 아래끝을 넘는지 직접 잰다.
      const cut = await p.evaluate(() => {
        const e = document.querySelector("#shop .fitting .spec");
        if (!e) return -1;
        const rows = e.querySelectorAll("i");
        if (!rows.length) return 0;
        const last = rows[rows.length - 1].getBoundingClientRect();
        const box = e.getBoundingClientRect();
        const pad = parseFloat(getComputedStyle(e).paddingBottom) || 0;
        return Math.round(last.bottom - (box.bottom - pad));
      });
      if (cut > 0) clipped.push(tab + "#" + i + " by " + cut + "px");
      /* 줄이 제 글자를 다 보여 주는가. 줄이 flex 항목이면 칸이 모자랄 때 늘어나는 대신 줄어들고,
         줄 자신의 overflow가 나머지를 감춘다. 위의 자는 마지막 줄의 아래끝만 보므로 그때 아무것도 안 본다. */
      const tight = await p.evaluate(() => [...document.querySelectorAll("#shop .fitting .spec i")]
        .map((r) => [r.scrollHeight, r.clientHeight, (r.textContent || "").trim().slice(0, 12)]));
      for (const [sh, ch, txt] of tight) if (sh > ch) squeezed.push(tab + "#" + i + " " + sh + "/" + ch + " " + JSON.stringify(txt));
      // 이 칸이 카드 본문을 되풀이하면 별도 칸을 둔 이유가 사라진다. 카드는 한 줄, 칸은 수치다.
      const echoed = await card.evaluate((e, lines) => {
        const em = e.querySelector("em");
        const body = em ? em.textContent.trim() : "";
        return body.length > 0 && lines.some((t) => t.trim() === body);
      }, s.text.split("\n"));
      if (echoed) wall.push(tab + "#" + i);
    }
    shelfTops.push({ tab: tab, travel: Math.max.apply(null, mine) - Math.min.apply(null, mine), n: mine.length });
    allTops.push.apply(allTops, mine);
  }
  check("instrument:every-shelf-had-cards", empty.length === 0, empty.join(", ") || tabs.length + " shelves, " + seen.length + " cards");
  check("spec:every-card-fills-the-panel", stuck.length === 0, stuck.join(", ") || seen.length + " cards filled it");
  // 문장이 전부 같으면 칸이 카드를 안 보고 있다는 뜻이다.
  const uniq = new Set(seen.map((s) => s.slice(s.indexOf(" ") + 1)));
  check("spec:the-panel-says-something-different-per-card", uniq.size === seen.length, uniq.size + " distinct of " + seen.length);
  check("spec:the-panel-does-not-repeat-the-card-body", wall.length === 0, wall.join(", ") || "no card had its own line read back to it");
  /* 문장 길이에 따라 기둥이 자라면 상점 상자가 통째로 뛰고, 그 순간 눌린 탭은 원하던 탭이 아니다.
     옛 축은 네 선반의 표본을 한 통에 넣고 최대-최소를 쟀다. 선반마다 진열 높이가 달라
     (goods 460/434/334/360px) 상자가 매번 다시 가운데로 서므로, 그 통에는 칸을 채운 이동과
     선반을 바꾼 이동이 섞인다. 이 축이 묻는 것은 앞쪽 하나다. 그래서 선반 안에서만 재고,
     선반 사이 이동은 판정에서 빼되 수로 남긴다. 빈 칸 자리를 표본에 넣었으므로 문턱은 그대로 0px이고,
     표본이 하나뿐인 선반은 0px이 공짜로 나오므로 같이 막는다. */
  const worst = shelfTops.reduce((a, s) => (s.travel > a.travel ? s : a), { tab: "none", travel: -1, n: 0 });
  const thin = shelfTops.filter((s) => s.n < 2).map((s) => s.tab);
  const across = allTops.length ? Math.max.apply(null, allTops) - Math.min.apply(null, allTops) : -1;
  check("spec:filling-the-panel-does-not-move-the-tabs",
    worst.travel === 0 && thin.length === 0 && shelfTops.length === tabs.length,
    (thin.length ? "thin shelf " + thin.join(", ") + ", " : "") + worst.travel + "px inside a shelf (worst "
    + worst.tab + ", " + shelfTops.length + " shelves), " + across + "px across the shelf switches");
  check("spec:no-line-is-cut-off-inside-the-panel", clipped.length === 0, clipped.join(", ") || "every line fits");
  check("spec:every-row-shows-its-whole-text", squeezed.length === 0,
    squeezed.length ? squeezed.length + " squeezed rows; first " + squeezed[0] : seen.length + " cards, no row hides its own text");

  // 대조군 하나. 같은 카드에 두 번 손을 올리면 같은 문장이어야 한다.
  await p.click('#shop .tab[data-tab="glove"]', { force: true });
  await p.waitForSelector('#shop .card[data-spec="glove"]', { timeout: 8000 });
  const first = p.locator('#shop .card[data-spec="glove"]').nth(1);
  await first.hover();
  await p.waitForTimeout(120);
  const a1 = await spec();
  await p.locator('#shop .card[data-spec="glove"]').nth(3).hover();
  await p.waitForTimeout(120);
  await first.hover();
  await p.waitForTimeout(120);
  const a2 = await spec();
  check("control:the-same-card-says-the-same-thing", a1.text === a2.text && a1.text.length > 0, JSON.stringify(a1.text.slice(0, 40)));

  /* 대조군 둘. 손을 떼면 카드에 묶인 상태가 풀리고 칸이 빈다. 빈 문자열 둘을 맞대면
     칸이 죽어 있어도 통과하므로, 직전에 차 있었다는 것과 칸이 남아 있다는 것을 같이 본다. */
  await p.mouse.move(4, 4);
  await p.waitForTimeout(160);
  const off = await spec();
  check("control:leaving-the-card-empties-the-panel",
    a2.rows > 0 && off.at === "" && off.rows === 0 && off.text === "" && off.h >= IDLE_BOX,
    "filled " + a2.rows + " rows -> " + JSON.stringify(off.text) + " box " + off.h + "px");

  check("console:no-errors", errs.length === 0, errs.slice(0, 2).join(" | ") || "clean");
  await ctx.close();

  /* 좁은 폭 한 판. 계획의 모바일 하한에서 같은 표를 다시 읽는다. 글자 크기가 폭을 따라 줄어들어
     줄 수가 갈리므로, 넓은 폭에서 안 잘린 줄이 좁은 폭에서 잘릴 수 있고 그 반대도 된다.
     기둥이 뷰포트보다 길어지는 것 자체는 결함이 아니다. 상점이 통째로 구르면 손이 닿는다.
     결함은 구를 길이 없이 감춰지는 것이라, 그 둘을 갈라서 묻는다. */
  const narrow = VIEWS[1];
  const nctx = await b.newContext({ viewport: { width: narrow[0], height: narrow[1] } });
  const np = await nctx.newPage();
  const nerrs = [];
  np.on("pageerror", (e) => nerrs.push(String(e)));
  np.on("console", (m) => { if (m.type() === "error") nerrs.push(m.text()); });
  await np.goto(BASE, { waitUntil: "load" });
  await np.waitForSelector("#go", { timeout: 15000 });
  await np.click("#go", { force: true });
  await np.waitForTimeout(1300);
  await np.evaluate(() => window.__shop(true));
  await np.waitForTimeout(320);
  const nSqueezed = [], nHidden = [];
  let nCards = 0;
  for (const tab of SHELVES) {
    await np.click('#shop .tab[data-tab="' + tab + '"]', { force: true });
    const sel = '#shop .card[data-spec="' + tab + '"]';
    await np.waitForSelector(sel, { timeout: 8000 }).catch(() => {});
    const cards = await np.evaluate((q) => document.querySelectorAll(q).length, sel);
    for (let i = 0; i < cards; i += 1) {
      await np.locator(sel).nth(i).hover();
      await np.waitForTimeout(120);
      const read = await np.evaluate(() => {
        const e = document.querySelector("#shop .fitting .spec");
        if (!e) return null;
        const rows = [...e.querySelectorAll("i")];
        return { rows: rows.map((r) => [r.scrollHeight, r.clientHeight, (r.textContent || "").trim().slice(0, 12)]),
          panel: [e.scrollHeight, e.clientHeight] };
      });
      if (!read || read.rows.length === 0) continue;
      nCards += 1;
      for (const [sh, ch, txt] of read.rows) if (sh > ch) nSqueezed.push(tab + "#" + i + " " + sh + "/" + ch + " " + JSON.stringify(txt));
      if (read.panel[0] > read.panel[1]) nHidden.push(tab + "#" + i + " panel " + read.panel[0] + "/" + read.panel[1]);
    }
  }
  const room = await np.evaluate(() => {
    const col = document.querySelector("#shop .fitting");
    const shop = document.querySelector("#shop");
    const c = col.getBoundingClientRect();
    const s = shop.getBoundingClientRect();
    return { col: Math.round(c.height), view: window.innerHeight,
      bottomInside: Math.round(c.bottom - s.top + shop.scrollTop) <= shop.scrollHeight,
      scrolls: /auto|scroll/.test(getComputedStyle(shop).overflowY),
      shopScroll: shop.scrollHeight, shopClient: shop.clientHeight };
  });
  await nctx.close();
  check("instrument:the-narrow-pass-filled-the-panel", nCards > 0, nCards + " cards at " + narrow[0] + "x" + narrow[1]);
  check("spec:narrow:every-row-shows-its-whole-text", nSqueezed.length === 0,
    nSqueezed.length ? nSqueezed.length + " squeezed rows; first " + nSqueezed[0] : nCards + " cards, no row hides its own text");
  check("spec:narrow:the-panel-hides-no-row", nHidden.length === 0,
    nHidden.join(", ") || nCards + " cards, panel content inside its box");
  check("spec:narrow:the-column-is-reachable", room.bottomInside && room.scrolls,
    "column " + room.col + "px in a " + room.view + "px viewport, shop scrolls " + room.shopScroll + "/" + room.shopClient
    + ", column bottom inside the scroll content " + room.bottomInside);
  check("console:no-errors-at-" + narrow[0] + "x" + narrow[1], nerrs.length === 0, nerrs.slice(0, 2).join(" | ") || "clean");

  if (notes.length) console.log(notes.map((x) => "  ok   " + x).join(LINE));
  if (fails.length) console.log(fails.map((x) => "  FAIL " + x).join(LINE));
  console.log(fails.length ? "spec FAIL " + fails.length : "spec PASS " + notes.length);
  if (fails.length) process.exitCode = 1;
} finally {
  clearTimeout(t);
  if (b) await b.close();
}
