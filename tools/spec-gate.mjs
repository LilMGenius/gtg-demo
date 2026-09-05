import { chromium } from "playwright";

// 효과 칸의 자. 상점 카드가 이름과 한 줄만 들고, 수치는 손을 올린 카드의 것만 별도 칸이 받는가.
//
// 카드 본문에 다 적으면 격자가 글자 벽이 되고, 별도 칸에 아무것도 안 오면 무엇을 사는지 모른다.
// 그래서 둘을 같이 잰다. 본문에 수치가 없다와 칸이 카드마다 다른 것을 말한다.
//
// 다름을 재는 축에는 같음을 재는 대조군이 붙는다. 같은 카드에 두 번 손을 올리면 같은 문장이 와야
// 하고, 손을 떼면 안내로 돌아가야 한다. 그 둘이 없으면 달라진 문장이 카드 때문인지 잡음인지 모른다.
const EXE = process.env.LOCALAPPDATA + "/ms-playwright/chromium-1228/chrome-win64/chrome.exe";
const BASE = "http://127.0.0.1:10310/web/index.html?seed=20&preset=rich,veteran";
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
    return e ? { text: e.innerText.trim(), at: e.dataset.at || "", rows: e.querySelectorAll("i").length, seen: e.getClientRects().length > 0 } : null;
  });

  // 탭 줄의 세로 위치. 카드에 손을 올렸다고 이것이 움직이면 손이 다른 곳을 누른다.
  const tabTop = () => p.evaluate(() => {
    const e = document.querySelector("#shop .tabs");
    return e ? Math.round(e.getBoundingClientRect().top) : -1;
  });
  const tops = [], clipped = [];
  const idle = await spec();
  check("instrument:the-panel-exists-and-is-on-screen", Boolean(idle && idle.seen), idle ? "visible" : "missing");
  check("spec:the-panel-starts-as-an-invitation", Boolean(idle) && idle.at === "" && idle.rows === 1, idle ? JSON.stringify(idle.text) : "missing");

  // 효과를 갖는 선반 넷을 돈다. 판정에 들어가는 것, 외형만 바꾸는 것, 소모형 둘을 섞는다.
  const tabs = ["glove", "hair", "bot", "buff"];
  const seen = [];
  let empty = [], wall = [], stuck = [];
  for (const tab of tabs) {
    await p.click('#shop .tab[data-tab="' + tab + '"]', { force: true });
    // 탭 이름으로 못 박는다. 아무 카드나 세면 아직 안 갈린 앞 탭의 카드를 세고 인덱스가 어긋난다.
    const sel = '#shop .card[data-spec="' + tab + '"]';
    await p.waitForSelector(sel, { timeout: 8000 }).catch(() => {});
    const cards = await p.evaluate((q) => document.querySelectorAll(q).length, sel);
    if (cards === 0) { empty.push(tab); continue; }
    for (let i = 0; i < cards; i += 1) {
      const card = p.locator(sel).nth(i);
      await card.hover();
      await p.waitForTimeout(120);
      const s = await spec();
      if (!s || s.rows === 0 || s.at === "") { stuck.push(tab + "#" + i); continue; }
      seen.push(tab + "#" + i + " " + s.text.replace(/\n/g, " / "));
      tops.push(await tabTop());
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
      // 이 칸이 카드 본문을 되풀이하면 별도 칸을 둔 이유가 사라진다. 카드는 한 줄, 칸은 수치다.
      const echoed = await card.evaluate((e, lines) => {
        const em = e.querySelector("em");
        const body = em ? em.textContent.trim() : "";
        return body.length > 0 && lines.some((t) => t.trim() === body);
      }, s.text.split("\n"));
      if (echoed) wall.push(tab + "#" + i);
    }
  }
  check("instrument:every-shelf-had-cards", empty.length === 0, empty.join(", ") || tabs.length + " shelves, " + seen.length + " cards");
  check("spec:every-card-fills-the-panel", stuck.length === 0, stuck.join(", ") || seen.length + " cards filled it");
  // 문장이 전부 같으면 칸이 카드를 안 보고 있다는 뜻이다.
  const uniq = new Set(seen.map((s) => s.slice(s.indexOf(" ") + 1)));
  check("spec:the-panel-says-something-different-per-card", uniq.size === seen.length, uniq.size + " distinct of " + seen.length);
  check("spec:the-panel-does-not-repeat-the-card-body", wall.length === 0, wall.join(", ") || "no card had its own line read back to it");
  // 문장 길이에 따라 기둥이 자라면 상점 상자가 통째로 뛰고, 그 순간 눌린 탭은 원하던 탭이 아니다.
  const spread = tops.length ? Math.max.apply(null, tops) - Math.min.apply(null, tops) : -1;
  check("spec:filling-the-panel-does-not-move-the-tabs", spread === 0, spread + "px of travel over " + tops.length + " cards");
  check("spec:no-line-is-cut-off-inside-the-panel", clipped.length === 0, clipped.join(", ") || "every line fits");

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

  // 대조군 둘. 손을 떼면 안내로 돌아간다.
  await p.mouse.move(4, 4);
  await p.waitForTimeout(160);
  const off = await spec();
  check("control:leaving-the-card-returns-the-invitation", off.at === "" && off.text === idle.text, JSON.stringify(off.text));

  check("console:no-errors", errs.length === 0, errs.slice(0, 2).join(" | ") || "clean");
  await ctx.close();

  if (notes.length) console.log(notes.map((x) => "  ok   " + x).join(LINE));
  if (fails.length) console.log(fails.map((x) => "  FAIL " + x).join(LINE));
  console.log(fails.length ? "spec FAIL " + fails.length : "spec PASS " + notes.length);
  if (fails.length) process.exitCode = 1;
} finally {
  clearTimeout(t);
  if (b) await b.close();
}
