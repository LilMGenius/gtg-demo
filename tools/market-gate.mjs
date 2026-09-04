import { chromium } from "playwright";

// 이적시장 선반의 자. 뽑기 칸이 카드깡이라는 이름을 달고 있었다.
// 그 말은 게임 밖 현금거래를 가리키는 은어라 선수를 데려오는 칸의 이름으로는 두 번 읽힌다.
// 이름 하나가 화면 세 자리(아이콘 라벨, 탭, 제목)에 걸려 있어서 한 곳만 고치면 나머지가 남는다.
//
// 축은 둘이다. 그 선반이 새 이름으로 서는가, 화면 어디에도 옛 이름이 안 남았는가.
// 못 찾는 자와 없는 것은 같은 답을 주므로, 옛 이름을 한 번 심어 잡히는지를 대조군으로 둔다.
const EXE = process.env.LOCALAPPDATA + "/ms-playwright/chromium-1228/chrome-win64/chrome.exe";
const BASE = "http://127.0.0.1:10310/web/index.html?seed=20&preset=rich";
const OLD = "\uce74\ub4dc\uae61";
const NEW = "\uc774\uc801\uc2dc\uc7a5";
const LINE = String.fromCharCode(10);
const t = setTimeout(() => { console.log("WATCHDOG"); process.exit(1); }, 120000);
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
  await p.waitForTimeout(1200);
  await p.evaluate(() => window.__shop(true));
  await p.waitForSelector("#shop .tab", { timeout: 8000 });

  const seen = await p.evaluate((words) => {
    const tab = [...document.querySelectorAll("#shop .tab")].find((e) => e.dataset.tab === "pull");
    const head = document.querySelector("#shop h4");
    /* 탭은 아이콘과 글자를 같이 담는다. textContent는 svg의 title까지 이어 붙여
       한 번 적힌 이름을 두 번 적힌 것으로 읽는다. 사람이 보는 글자만 세려면 글자 노드만 본다. */
    // 글자는 아이콘 옆 span이 담는다. 그 자리를 먼저 보고, 없으면 직계 글자 노드로 물러선다.
    const label = (e) => {
      if (!e) return null;
      const s = e.querySelector("span");
      if (s) return s.textContent.trim();
      return [...e.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join("").trim();
    };
    // 화면 전체에서 옛 이름을 쓰는 잎 노드를 센다. 라벨과 툴팁도 같이 본다.
    const hits = [];
    for (const el of document.querySelectorAll("body *")) {
      if (el.children.length === 0 && (el.textContent || "").includes(words.old)) hits.push(el.className || el.tagName);
      const a = el.getAttribute && el.getAttribute("aria-label");
      if (a && a.includes(words.old)) hits.push("aria:" + (el.id || el.tagName));
    }
    return { tab: label(tab), head: head ? head.textContent.trim() : null, hits };
  }, { old: OLD });

  check("instrument:the-draw-shelf-is-on-screen", Boolean(seen.tab && seen.head),
    "tab " + seen.tab + " head " + seen.head);
  check("market:the-shelf-carries-the-new-name",
    seen.tab === NEW && seen.head === NEW, "tab " + seen.tab + ", head " + seen.head);
  check("market:nothing-on-screen-still-says-the-old-name",
    seen.hits.length === 0, seen.hits.slice(0, 4).join(", ") || "clear");

  // 대조군. 같은 글자를 한 번 심어 위의 스캔이 찾을 줄 아는지 본다.
  const caught = await p.evaluate((words) => {
    const probe = document.createElement("div");
    probe.textContent = words.old;
    document.body.appendChild(probe);
    let hit = 0;
    for (const el of document.querySelectorAll("body *")) {
      if (el.children.length === 0 && (el.textContent || "").includes(words.old)) hit += 1;
    }
    probe.remove();
    return hit;
  }, { old: OLD });
  check("control:a-planted-copy-of-the-old-name-is-found", caught === 1, "planted 1, found " + caught);
  check("console:no-errors", errs.length === 0, errs.slice(0, 2).join(" | ") || "clean");
  await ctx.close();

  if (notes.length) console.log(notes.map((x) => "  ok   " + x).join(LINE));
  if (fails.length) console.log(fails.map((x) => "  FAIL " + x).join(LINE));
  console.log(fails.length ? "market FAIL " + fails.length : "market PASS " + notes.length);
  if (fails.length) process.exitCode = 1;
} finally {
  clearTimeout(t);
  if (b) await b.close();
}
