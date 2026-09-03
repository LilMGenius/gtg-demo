import { chromium } from "playwright";

// 하네스가 매 컷 앞에서 저장을 지운다. 그래서 모든 촬영이 1레벨 신규 저장에서만 이루어졌고,
// 만렙 뒤의 화면은 백 랩을 돌고도 한 번도 만들어지지 않았다. 게이트는 자기가 만든 상태만 본다.
// 만렙에서 달라지는 것은 수의 자릿수다. 팔로워가 백만 단위가 되고 지갑이 네 자리가 되며
// 훈련 줄이 전부 MAX가 된다. 글자가 제 상자를 넘으면 화면은 열리는데 읽히지 않는다.

const EXE = process.env.LOCALAPPDATA + "/ms-playwright/chromium-1228/chrome-win64/chrome.exe";
const BASE = "http://127.0.0.1:10310/web/index.html?seed=20";
const LINE = String.fromCharCode(10);
const t = setTimeout(() => { console.log("WATCHDOG"); process.exit(1); }, 180000);
t.unref();

const fails = [], notes = [];
const check = (n, ok, d) => (ok ? notes : fails).push(n + " " + d);

// 잎 노드만 본다. 자식을 품은 상자는 자식이 넘치면 같이 넘친 것으로 잡혀 원인을 못 가린다.
// 스스로 스크롤을 갖도록 만든 상자는 넘치는 것이 설계이므로 뺀다.
const SCAN = function () {
  const out = [];
  for (const el of document.querySelectorAll("body *")) {
    if (el.childElementCount > 0) continue;
    const txt = (el.textContent || "").trim();
    if (!txt) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    const st = getComputedStyle(el);
    if (st.overflowX === "auto" || st.overflowX === "scroll") continue;
    if (st.visibility === "hidden" || st.display === "none") continue;
    const over = el.scrollWidth - el.clientWidth;
    if (over > 1) out.push({ where: el.tagName.toLowerCase() + "." + (el.className || ""), txt: txt.slice(0, 20), over });
  }
  return out;
};


// 줄이 낱말 한가운데에서 끊기는지 본다. 상자를 넘지 않으므로 위의 잘림 자는 이것을 통과시킨다.
// 글자를 하나씩 재서 윗변이 내려간 자리가 줄이 넘어간 자리이고, 그 앞 글자가 띄어쓰기가 아니면 낱말을 자른 것이다.
// 타이틀에서 같은 자를 세워 "손이 안 닿|는다"를 잡았고, 게임 안 화면에는 그 자가 없었다.
const WRAP = function () {
  const bad = [];
  let wrapped = 0;
  const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let n;
  while ((n = walk.nextNode())) {
    const s = n.nodeValue;
    if (!s || !s.trim()) continue;
    const host = n.parentElement;
    if (!host || !host.getClientRects().length) continue;
    const r = document.createRange();
    let prevTop = null;
    for (let i = 0; i < s.length; i += 1) {
      r.setStart(n, i);
      r.setEnd(n, i + 1);
      const box = r.getBoundingClientRect();
      if (!box.width && !box.height) continue;
      if (prevTop !== null && box.top - prevTop > 1) wrapped += 1;
      if (prevTop !== null && box.top - prevTop > 1 && s[i - 1] !== " ") {
        bad.push(s.slice(Math.max(0, i - 7), i) + "|" + s.slice(i, i + 4));
      }
      prevTop = box.top;
    }
  }
  return { bad: bad, wrapped: wrapped };
};
// 열리는 창 다섯. 각 창에서 글자가 상자를 넘는지 따로 본다.
// 창을 안 열고 HUD만 재면 만렙에서 자릿수가 늘어나는 자리 대부분을 안 보게 된다.
const PANELS = [
  ["hud", null],
  ["shop", (p) => p.evaluate(() => window.__shop(true))],
  ["roster", (p) => p.evaluate(() => window.__roster(true))],
  ["gram", (p) => p.evaluate(() => window.__gram(true))],
  ["me", (p) => p.evaluate(() => window.__me(true))],
  ["gym", (p) => p.click("#gymBtn", { force: true })]
];


// 패널은 여섯인데 가림을 재던 자는 상점 탭만 봤다. 나머지도 같은 자리에 같은 HUD를 이고 있다.
// 누를 수 있는 것이 덮여 있으면 그 버튼은 화면에 있으나 손에 안 잡힌다.

// 덮임을 재는 자 하나. 심는 자리와 재는 자리가 같은 함수를 써야 심어서 증명한 것이 실제로 도는 자다.
// 스크롤 목록은 접힌 줄을 감추는 것이 설계다. 잘려 나간 카드의 중심점은 목록 상자 밖에 있고
// 그 자리에 무엇이 그려져 있든 그것은 덮은 것이 아니다. 선수단 마흔여섯 중 서른하나가 그렇게 접혀 있었고
// 그중 하나의 중심이 목록 아래 닫기 버튼 위로 떨어져 덮임 하나로 잡혔다. 화면이 아니라 자가 틀린 것이다.
const COVER = function (pid) {
  const box = document.getElementById(pid);
  if (!box) return { total: 0, seen: 0, hits: [] };
  const clipOf = function (el) {
    for (var n = el.parentElement; n && n !== document.body; n = n.parentElement) {
      var st = getComputedStyle(n);
      if (/auto|scroll|hidden/.test(st.overflowY) || /auto|scroll|hidden/.test(st.overflowX)) return n.getBoundingClientRect();
    }
    return null;
  };
  const all = box.querySelectorAll("button");
  const hits = [];
  let seen = 0;
  for (const el of all) {
    const q = el.getBoundingClientRect();
    if (q.width < 2 || q.height < 2) continue;
    const cx = Math.round(q.left + q.width / 2);
    const cy = Math.round(q.top + q.height / 2);
    const clip = clipOf(el);
    if (clip && (cy < clip.top || cy > clip.bottom || cx < clip.left || cx > clip.right)) continue;
    seen += 1;
    const at = document.elementFromPoint(cx, cy);
    // 닿는 것이 그 버튼의 조상이면 덮인 것이 아니라 자린 것이다. 조상도 후손도 아닌 것이 닿을 때만 덮인 것이다.
    if (!at || at === el || el.contains(at) || at.contains(el)) continue;
    hits.push(el.textContent.trim().slice(0, 8) + " under " + (at.id || at.className || at.tagName.toLowerCase()));
  }
  return { total: all.length, seen: seen, hits: hits };
};
const panelCover = async (w, h) => {
  const ctx = await b.newContext({ viewport: { width: w, height: h } });
  const p = await ctx.newPage();
  await p.goto(BASE + "&preset=rich", { waitUntil: "load" });
  await p.evaluate(() => localStorage.clear());
  await p.reload({ waitUntil: "load" });
  await p.waitForSelector("#go", { timeout: 15000 });
  await p.click("#go", { force: true });
  await p.waitForTimeout(1300);
  const out = [];
  const panels = [["shop", null], ["roster", null], ["gram", null], ["me", null], ["gym", "#gymBtn"]];
  for (const [id, btn] of panels) {
    if (btn) await p.click(btn, { force: true });
    else await p.evaluate((k) => window["__" + k](true), id);
    await p.waitForTimeout(300);
    const r = await p.evaluate(COVER, id);
    out.push({ id, total: r.total, seen: r.seen, hits: r.hits });
    await p.evaluate((k) => { const e = document.getElementById(k); if (e) e.hidden = true; document.body.classList.remove("panelOpen"); }, id);
    await p.waitForTimeout(120);
  }
  await ctx.close();
  return out;
};

// 접힌 줄을 빼고 나면 이 자는 아무것도 안 잡을 수 있고, 그 0은 화면이 멀쩡하다는 뜻이 아니라
// 자가 눈을 감았다는 뜻이다. 보이는 카드 하나 위에 뚜껑을 덮어 그 뚜껑을 잡는지 먼저 본다.
const plantedLid = async (w, h) => {
  const ctx = await b.newContext({ viewport: { width: w, height: h } });
  const p = await ctx.newPage();
  await p.goto(BASE + "&preset=rich", { waitUntil: "load" });
  await p.evaluate(() => localStorage.clear());
  await p.reload({ waitUntil: "load" });
  await p.waitForSelector("#go", { timeout: 15000 });
  await p.click("#go", { force: true });
  await p.waitForTimeout(1300);
  await p.evaluate(() => window.__roster(true));
  await p.waitForTimeout(300);
  const before = (await p.evaluate(COVER, "roster")).hits.length;
  const victim = await p.evaluate(() => {
    const row = document.querySelector("#roster .row");
    const rr = row.getBoundingClientRect();
    const card = [...row.querySelectorAll("button")].find((e) => {
      const q = e.getBoundingClientRect();
      const cy = q.top + q.height / 2;
      return cy > rr.top && cy < rr.bottom;
    });
    if (!card) return "";
    const q = card.getBoundingClientRect();
    const lid = document.createElement("button");
    lid.id = "lidProbe";
    lid.style.cssText = "position:fixed;z-index:99;left:" + (q.left | 0) + "px;top:" + (q.top | 0) + "px;width:" + (q.width | 0) + "px;height:" + (q.height | 0) + "px";
    document.getElementById("roster").appendChild(lid);
    return card.textContent.trim().slice(0, 8);
  });
  const after = (await p.evaluate(COVER, "roster")).hits.length;
  await ctx.close();
  return { before: before, after: after, victim: victim };
};
// 탭이 모두 화면 안에 서 있는가. 잃은 탭은 없는 탭과 같다.
const tabScan = async (w, h) => {
  const ctx = await b.newContext({ viewport: { width: w, height: h } });
  const p = await ctx.newPage();
  await p.goto(BASE + "&preset=rich", { waitUntil: "load" });
  await p.evaluate(() => localStorage.clear());
  await p.reload({ waitUntil: "load" });
  await p.waitForSelector("#go", { timeout: 15000 });
  await p.click("#go", { force: true });
  await p.waitForTimeout(1300);
  await p.evaluate(() => window.__shop(true));
  await p.waitForTimeout(320);
  const r = await p.evaluate((vw) => {
    const tabs = [...document.querySelectorAll("#shop .tab")];
    let out = 0;
    let hidden = 0;
    const names = [];
    for (const t of tabs) {
      const r = t.getBoundingClientRect();
      if (r.left < -1 || r.right > vw + 1) out += 1;
      // 사각형이 화면 안에 있다는 것과 사람 눈에 보인다는 것은 다른 명제다.
      // 가운데 점을 누를 때 닿는 것이 그 탭이 아니면 위에 무언가가 덮어 있는 것이다.
      const cx = Math.round(r.left + r.width / 2);
      const cy = Math.round(r.top + r.height / 2);
      const at = document.elementFromPoint(cx, cy);
      if (!at || !(at === t || t.contains(at))) { hidden += 1; names.push(t.textContent.trim() + " under " + (at ? (at.id || at.tagName.toLowerCase() + "." + at.className) : "nothing")); }
    }
    return { out, hidden, names, total: tabs.length };
  }, w);
  await ctx.close();
  return r;
};
let b;
try {
  b = await chromium.launch({ executablePath: EXE });

  const sweep = async (q, w, h) => {
    const ctx = await b.newContext({ viewport: { width: w, height: h } });
    const p = await ctx.newPage();
    const errs = [];
    p.on("pageerror", (e) => errs.push(String(e)));
    p.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
    await p.goto(BASE + q, { waitUntil: "load" });
    await p.evaluate(() => localStorage.clear());
    await p.reload({ waitUntil: "load" });
    await p.waitForSelector("#go", { timeout: 15000 });
    await p.click("#go", { force: true });
    await p.waitForTimeout(1400);
    const found = [];
    const cut = [];
    let lines = 0;
    for (const [name, open] of PANELS) {
      if (open) { await open(p); await p.waitForTimeout(320); }
      for (const hit of await p.evaluate(SCAN)) found.push({ panel: name, ...hit });
      const wr = await p.evaluate(WRAP);
      for (const w of wr.bad) cut.push(name + " " + w);
      lines += wr.wrapped;
      if (open) await p.evaluate(() => { for (const id of ["shop", "roster", "gram", "me", "gym"]) { const e = document.getElementById(id); if (e) e.hidden = true; } });
    }
    await ctx.close();
    return { found, cut, lines, errs };
  };


  // 이 자가 실제로 넘치는 글자를 잡는지 먼저 증명한다. 아무것도 안 잡는 자도 0을 내고,
  // 그 0은 화면이 멀쩡하다는 뜻이 아니라 자가 눈을 감고 있다는 뜻이다.
  const probe = await (async () => {
    const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } });
    const p = await ctx.newPage();
    await p.goto(BASE, { waitUntil: "load" });
    await p.waitForSelector("#go", { timeout: 15000 });
    const before = (await p.evaluate(SCAN)).length;
    await p.evaluate(() => {
      const el = document.createElement("div");
      el.id = "clipProbe";
      el.style.cssText = "position:fixed;left:10px;top:10px;width:40px;height:20px;overflow:hidden;white-space:nowrap;font-size:14px";
      el.textContent = "0000000000000000000000";
      document.body.appendChild(el);
    });
    const after = await p.evaluate(SCAN);
    // 줄바꿈 자도 같은 방법으로 증명한다. 낱말이 쪼개지는 상자를 하나 심어 그 자가 잡는지 본다.
    // 자연히 넘어가는 줄에 기대면, 화면을 고쳐 넘어가는 줄이 사라진 날 이 자가 눈을 감았는지
    // 화면이 좋아졌는지 구분할 수 없다.
    const wrapBefore = (await p.evaluate(WRAP)).bad.length;
    await p.evaluate(() => {
      const el = document.createElement("div");
      el.id = "wrapProbe";
      el.style.cssText = "position:fixed;left:10px;top:60px;width:44px;font-size:14px;word-break:break-all";
      el.textContent = "가나다라마바사아자차카타파하";
      document.body.appendChild(el);
    });
    const wrapAfter = await p.evaluate(WRAP);
    await ctx.close();
    return { before, hit: after.some((h) => h.where.indexOf("div") === 0 && h.txt.indexOf("00000") === 0), count: after.length, wrapBefore, wrapHit: wrapAfter.bad.length > wrapBefore, wrapCount: wrapAfter.bad.length };
  })();
  check("instrument:the-scan-catches-a-planted-overflow", probe.before === 0 && probe.hit, "before " + probe.before + " after " + probe.count + " caught " + probe.hit);
  check("instrument:the-scan-catches-a-planted-word-break", probe.wrapBefore === 0 && probe.wrapHit, "before " + probe.wrapBefore + " after " + probe.wrapCount);
  // 대조군. 신규 저장에서도 같은 자를 댄다. 여기서도 넘치면 만렙 탓이 아니라 화면 탓이다.
  const fresh = await sweep("", 1280, 720);
  for (const h of fresh.found) console.log("  fresh " + h.panel + " " + h.where + " [" + h.txt + "] over " + h.over);
  check("control:a-fresh-save-clips-nothing", fresh.found.length === 0, fresh.found.length + " clipped");
  check("control:a-fresh-save-cuts-no-word", fresh.cut.length === 0, fresh.cut.length + " words split" + (fresh.cut.length ? " first " + fresh.cut[0] : ""));

  // 본시험. 스탯도 지갑도 팔로워도 전부 채운 화면이다.
  const maxed = await sweep("&preset=maxed,rich,famous", 1280, 720);
  for (const h of maxed.found) console.log("  maxed " + h.panel + " " + h.where + " [" + h.txt + "] over " + h.over);
  check("maxed:no-text-is-clipped", maxed.found.length === 0, maxed.found.length + " clipped" + (maxed.found.length ? " worst " + Math.max(...maxed.found.map((h) => h.over)) : ""));
  for (const w of maxed.cut.slice(0, 6)) console.log("  cut " + w);
  // 넘어가는 줄이 하나도 없으면 낱말 쪼개짐을 묻는 축은 0을 재고 조용히 통과한다.
  // 실측으로 넓은 폭에서는 모든 줄이 한 줄에 들어가 넘어가는 줄이 0이었다.
  // 그래서 글이 실제로 넘어가는 손에 든 폭에서 다시 재고, 거기서 넘어간 줄이 있었는지를 묻는다.
  const narrow = await sweep("&preset=maxed,rich,famous", 844, 390);
  const narrowTabs = tabScan(844, 390);
  for (const w of narrow.cut.slice(0, 6)) console.log("  narrow cut " + w);
  check("narrow:no-word-is-cut-across-lines", narrow.cut.length === 0, narrow.cut.length + " words split" + (narrow.cut.length ? " first " + narrow.cut[0] : ""));
  check("narrow:no-text-is-clipped", narrow.found.length === 0, narrow.found.length + " clipped");
  // 탭은 상자를 안 넘치고도 화면 밖으로 나갈 수 있다. 그것은 잔림이 아니라 밀림이다.
  // 눈으로 보고 알았다. 지금 서 있는 탭이 왼쪽으로 나가 있으면 어느 선반인지를 화면이 안 말한다.
  const tabsOut = await narrowTabs;
  check("narrow:every-shop-tab-is-on-screen", tabsOut.out === 0, tabsOut.out + " of " + tabsOut.total + " tabs off screen");
  check("narrow:no-shop-tab-is-covered", tabsOut.hidden === 0, tabsOut.hidden + " of " + tabsOut.total + " tabs covered" + (tabsOut.hidden ? ": " + tabsOut.names.join(", ") : ""));
  const panels = await panelCover(844, 390);
  const coverProbe = await plantedLid(844, 390);
  for (const pn of panels) console.log("  panel " + pn.id + " " + pn.total + " buttons, " + pn.seen + " on the visible box, " + pn.hits.length + " covered" + (pn.hits.length ? ": " + pn.hits.join(", ") : ""));
  // 접힌 줄을 뺀 뒤 남은 표본이 몇인지 같이 인쇄한다. 0이면 통과가 아니라 무응답이다.
  for (const pn of panels) check("narrow:" + pn.id + "-controls-are-not-covered", pn.seen > 0 && pn.hits.length === 0, pn.hits.length + " covered of " + pn.seen + " seen, " + pn.total + " total" + (pn.hits.length ? ": " + pn.hits[0] : ""));
  check("instrument:the-cover-scan-catches-a-planted-lid", coverProbe.before === 0 && coverProbe.after > 0, "before " + coverProbe.before + " after " + coverProbe.after + " over [" + coverProbe.victim + "]");
  check("maxed:no-word-is-cut-across-lines", maxed.cut.length === 0, maxed.cut.length + " words split" + (maxed.cut.length ? " first " + maxed.cut[0] : ""));
  check("console:no-errors", maxed.errs.length === 0 && fresh.errs.length === 0, (maxed.errs[0] || fresh.errs[0] || "clean"));

  if (notes.length) console.log(notes.map((x) => "  ok   " + x).join(LINE));
  if (fails.length) console.log(fails.map((x) => "  FAIL " + x).join(LINE));
  console.log(fails.length ? "maxview FAIL " + fails.length : "maxview PASS");
  if (fails.length) process.exitCode = 1;
} finally {
  clearTimeout(t);
  if (b) await b.close();
}
