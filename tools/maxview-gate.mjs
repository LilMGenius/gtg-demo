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

let b;
try {
  b = await chromium.launch({ executablePath: EXE });

  const sweep = async (q) => {
    const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } });
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
    for (const [name, open] of PANELS) {
      if (open) { await open(p); await p.waitForTimeout(320); }
      for (const hit of await p.evaluate(SCAN)) found.push({ panel: name, ...hit });
      if (open) await p.evaluate(() => { for (const id of ["shop", "roster", "gram", "me", "gym"]) { const e = document.getElementById(id); if (e) e.hidden = true; } });
    }
    await ctx.close();
    return { found, errs };
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
    await ctx.close();
    return { before, hit: after.some((h) => h.where.indexOf("div") === 0 && h.txt.indexOf("00000") === 0), count: after.length };
  })();
  check("instrument:the-scan-catches-a-planted-overflow", probe.before === 0 && probe.hit, "before " + probe.before + " after " + probe.count + " caught " + probe.hit);
  // 대조군. 신규 저장에서도 같은 자를 댄다. 여기서도 넘치면 만렙 탓이 아니라 화면 탓이다.
  const fresh = await sweep("");
  for (const h of fresh.found) console.log("  fresh " + h.panel + " " + h.where + " [" + h.txt + "] over " + h.over);
  check("control:a-fresh-save-clips-nothing", fresh.found.length === 0, fresh.found.length + " clipped");

  // 본시험. 스탯도 지갑도 팔로워도 전부 채운 화면이다.
  const maxed = await sweep("&preset=maxed,rich,famous");
  for (const h of maxed.found) console.log("  maxed " + h.panel + " " + h.where + " [" + h.txt + "] over " + h.over);
  check("maxed:no-text-is-clipped", maxed.found.length === 0, maxed.found.length + " clipped" + (maxed.found.length ? " worst " + Math.max(...maxed.found.map((h) => h.over)) : ""));
  check("console:no-errors", maxed.errs.length === 0 && fresh.errs.length === 0, (maxed.errs[0] || fresh.errs[0] || "clean"));

  if (notes.length) console.log(notes.map((x) => "  ok   " + x).join(LINE));
  if (fails.length) console.log(fails.map((x) => "  FAIL " + x).join(LINE));
  console.log(fails.length ? "maxview FAIL " + fails.length : "maxview PASS");
  if (fails.length) process.exitCode = 1;
} finally {
  clearTimeout(t);
  if (b) await b.close();
}
