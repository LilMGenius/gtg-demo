import { chromium } from "playwright";

// 타이틀은 이 게임을 처음 여는 화면인데 계기가 하나도 없었다. 만렙 화면을 훑는 자도
// 시작 버튼을 누른 뒤부터 보므로 이 화면은 한 번도 안 훑렸다.
// 여기서 무너지면 뒤의 모든 것이 안 보인다. 접히는 조작법과 시작 한 번이 이 화면의 전부다.

const EXE = process.env.LOCALAPPDATA + "/ms-playwright/chromium-1228/chrome-win64/chrome.exe";
const BASE = "http://127.0.0.1:10310/web/index.html?seed=20";
const LINE = String.fromCharCode(10);
// 가로 두 폭. 넓은 쪽은 심사 화면이고 좁은 쪽은 손에 든 폰이다.
const SIZES = [[1280, 720], [844, 390]];
const t = setTimeout(() => { console.log("WATCHDOG"); process.exit(1); }, 120000);
t.unref();

const fails = [], notes = [];
const check = (n, ok, d) => (ok ? notes : fails).push(n + " " + d);

// 잎 노드만 본다. 자식을 품은 상자는 자식이 넘치면 같이 넘친 것으로 잡혀 원인을 못 가린다.
const SCAN = function () {
  const out = [];
  for (const el of document.querySelectorAll("#title *")) {
    if (el.childElementCount > 0) continue;
    const txt = (el.textContent || "").trim();
    if (!txt) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    const st = getComputedStyle(el);
    if (st.overflowX === "auto" || st.overflowX === "scroll") continue;
    if (el.scrollWidth - el.clientWidth > 1) out.push(el.tagName.toLowerCase() + "#" + el.id + " [" + txt.slice(0, 18) + "]");
  }
  return out;
};

// 줄이 단어 한가운데에서 끊기는지 본다. 상자를 넘지 않으므로 잘림 축은 이것을 통과시킨다.
// 글자를 하나씩 재서 윗변이 바뀌는 자리가 줄이 넘어간 자리이고,
// 그 앞 글자가 띄어쓰기가 아니면 단어를 자른 것이다.
const WRAP = function () {
  const bad = [];
  const walk = document.createTreeWalker(document.getElementById("title"), NodeFilter.SHOW_TEXT);
  let n;
  while ((n = walk.nextNode())) {
    const s = n.nodeValue;
    if (!s || !s.trim()) continue;
    const r = document.createRange();
    let prevTop = null;
    for (let i = 0; i < s.length; i += 1) {
      r.setStart(n, i);
      r.setEnd(n, i + 1);
      const box = r.getBoundingClientRect();
      if (!box.width && !box.height) continue;
      if (prevTop !== null && box.top - prevTop > 1 && s[i - 1] !== " ") {
        bad.push(s.slice(Math.max(0, i - 7), i) + "|" + s.slice(i, i + 4));
      }
      prevTop = box.top;
    }
  }
  return bad;
};

let b;
try {
  b = await chromium.launch({ executablePath: EXE });

  for (const [w, h] of SIZES) {
    const tag = w + "x" + h;
    const ctx = await b.newContext({ viewport: { width: w, height: h } });
    const p = await ctx.newPage();
    const errs = [];
    p.on("pageerror", (e) => errs.push(String(e)));
    p.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
    await p.goto(BASE, { waitUntil: "load" });
    await p.waitForSelector("#go", { timeout: 15000 });

    const up = await p.evaluate(() => !document.getElementById("title").hidden);
    check("title:" + tag + ":is-up-before-start", up, String(up));
    // 이름과 한 줄이 화면에 있어야 이 게임이 무엇인지가 첫 화면에서 읽힌다.
    const words = await p.evaluate(() => ({
      word: (document.getElementById("word").textContent || "").trim(),
      tag: (document.getElementById("tag").textContent || "").trim(),
      go: (document.getElementById("go").textContent || "").trim()
    }));
    check("title:" + tag + ":says-its-name-and-a-line", words.word.length >= 4 && words.tag.length >= 8 && words.go.length >= 1, words.word + " / " + words.tag.slice(0, 14) + " / " + words.go);
    const clipped = await p.evaluate(SCAN);
    check("title:" + tag + ":no-text-is-clipped", clipped.length === 0, clipped.join(", ") || "nothing overruns its box");

    // 조작법은 접혀 있다가 눌러야 열린다. 처음부터 펼쳐져 있으면 이름이 화면에서 밀린다.
    const folded = await p.evaluate(() => ({ hidden: document.getElementById("helpPanel").hidden, aria: document.getElementById("helpBtn").getAttribute("aria-expanded") }));
    check("help:" + tag + ":starts-folded", folded.hidden === true && folded.aria === "false", "hidden " + folded.hidden + " aria " + folded.aria);
    await p.click("#helpBtn");
    await p.waitForTimeout(120);
    const open = await p.evaluate(() => ({ hidden: document.getElementById("helpPanel").hidden, aria: document.getElementById("helpBtn").getAttribute("aria-expanded"), rows: document.querySelectorAll("#helpPanel li").length }));
    check("help:" + tag + ":opens-with-rows", open.hidden === false && open.aria === "true" && open.rows >= 2, "hidden " + open.hidden + " aria " + open.aria + " rows " + open.rows);
    const clippedOpen = await p.evaluate(SCAN);
    check("help:" + tag + ":open-panel-is-not-clipped", clippedOpen.length === 0, clippedOpen.join(", ") || "nothing overruns its box");
    const wrapped = await p.evaluate(WRAP);
    check("help:" + tag + ":no-word-is-cut-across-lines", wrapped.length === 0, wrapped.slice(0, 3).join(", ") || "every break falls on a space");

    // 바깥을 누르면 닫힌다. 닫는 길이 버튼 하나뿐이면 펼친 패널이 화면을 계속 가린다.
    await p.mouse.click(Math.floor(w * 0.5), Math.floor(h * 0.85));
    await p.waitForTimeout(120);
    const byOutside = await p.evaluate(() => document.getElementById("helpPanel").hidden);
    check("help:" + tag + ":outside-click-closes", byOutside === true, String(byOutside));
    // 키보드로도 닫힌다.
    await p.click("#helpBtn");
    await p.waitForTimeout(120);
    await p.keyboard.press("Escape");
    await p.waitForTimeout(120);
    const byEsc = await p.evaluate(() => ({ hidden: document.getElementById("helpPanel").hidden, aria: document.getElementById("helpBtn").getAttribute("aria-expanded") }));
    check("help:" + tag + ":escape-closes", byEsc.hidden === true && byEsc.aria === "false", "hidden " + byEsc.hidden + " aria " + byEsc.aria);

    // 시작하면 타이틀이 사라지고 몸통에 표시가 붙는다. 두 번 눌러도 한 번만 시작한다.
    await p.click("#go", { force: true });
    await p.waitForTimeout(400);
    const started = await p.evaluate(() => ({ hidden: document.getElementById("title").hidden, playing: document.body.classList.contains("playing") }));
    check("title:" + tag + ":hides-on-start", started.hidden === true && started.playing === true, "hidden " + started.hidden + " playing " + started.playing);
    await p.evaluate(() => document.getElementById("go").click());
    await p.waitForTimeout(200);
    const again = await p.evaluate(() => ({ hidden: document.getElementById("title").hidden, playing: document.body.classList.contains("playing") }));
    check("title:" + tag + ":starting-twice-changes-nothing", again.hidden === true && again.playing === true, "hidden " + again.hidden + " playing " + again.playing);

    check("console:" + tag + ":no-errors", errs.length === 0, errs.slice(0, 2).join(" | ") || "clean");
    await ctx.close();
  }

  if (notes.length) console.log(notes.map((x) => "  ok   " + x).join(LINE));
  if (fails.length) console.log(fails.map((x) => "  FAIL " + x).join(LINE));
  console.log(fails.length ? "title FAIL " + fails.length : "title PASS");
  if (fails.length) process.exitCode = 1;
} finally {
  clearTimeout(t);
  if (b) await b.close();
}
