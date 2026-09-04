import { chromium } from "playwright";

// 한 사실이 화면 두 자리에서 말해지는지 재는 자.
// 문서에는 한 사실이 한 곳에만 있어야 한다는 규칙이 있는데 화면에는 그 규칙을 재는 자가 없었다.
// 컨디션이 좌상단 칩의 화살표와 키퍼 옆 배지의 문장으로 동시에 떠 있었고, 어느 게이트도
// 둘 다 뜬 것을 결함으로 읽지 않았다. 각자는 맞았고 틀린 것은 둘이 같이 있다는 사실이다.
//
// 축은 짝으로 선다. 소유자 한 곳에는 떠야 하고 나머지 어디에도 없어야 한다.
// 한쪽만 재면 지우기만 해도 통과하므로, 지워진 것과 옮겨진 것이 안 갈린다.
const EXE = process.env.LOCALAPPDATA + "/ms-playwright/chromium-1228/chrome-win64/chrome.exe";
const BASE = "http://127.0.0.1:10310/web/index.html?seed=20";
// 0.4는 화면이 화살표를 세우는 문턱이다. 양쪽 극단과 그 사이를 다 본다.
const CASES = [
  { form: 0.9, sign: "up" },
  { form: -0.9, sign: "dn" },
  { form: 0, sign: "" }
];
// 컨디션을 말하던 두 문장. 소유자가 칩으로 정해졌으므로 화면 어디에도 이 글자가 있으면 안 된다.
const SPOKEN = ["몸이 가볍다", "몸이 무겁다"];
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

  const got = [];
  for (const c of CASES) {
    const set = await p.evaluate((v) => window.__form(v), c.form);
    await p.waitForTimeout(120);
    const r = await p.evaluate((words) => {
      const chip = document.getElementById("form");
      // 화살표는 색 클래스로 선다. 그 클래스가 소유자 자리에 실제로 그려졌는지를 읽는다.
      const mark = chip.querySelector(".up") ? "up" : (chip.querySelector(".dn") ? "dn" : "");
      // 칩 밖에서 같은 사실을 말하는 자리. 글자로 한 번, 표식으로 한 번 센다.
      const spoken = [];
      for (const el of document.querySelectorAll("body *")) {
        if (chip.contains(el) || el.contains(chip)) continue;
        if (el.children.length) continue;
        const txt = (el.textContent || "").trim();
        if (words.some((w) => txt.includes(w))) spoken.push(el.id || el.className || el.tagName);
      }
      const kinds = [...document.querySelectorAll("[data-kind^=form-]")].map((e) => e.dataset.kind);
      return { mark, spoken, kinds };
    }, SPOKEN);
    got.push({ ...c, set, ...r });
  }

  check("instrument:the-form-hook-took-the-value",
    got.every((r) => Math.abs(r.set - r.form) < 1e-6),
    got.map((r) => r.form + " -> " + r.set).join(", "));
  check("dupe:the-status-chip-owns-the-condition",
    got.every((r) => r.mark === r.sign),
    got.map((r) => r.form + " chip " + (r.mark || "none") + " want " + (r.sign || "none")).join(", "));
  check("dupe:nothing-else-on-screen-says-it",
    got.every((r) => r.spoken.length === 0 && r.kinds.length === 0),
    got.map((r) => r.form + " " + (r.spoken.concat(r.kinds).join("/") || "clear")).join(", "));
  /* 못 찾는 자와 없는 것은 같은 답을 준다. 같은 문장을 화면에 한 번 심어 보고 잡히는지 본다.
     이 대조군이 없으면 위의 축은 스캐너가 죽어도 초록이다. */
  const caught = await p.evaluate((words) => {
    const probe = document.createElement("div");
    probe.id = "dupeProbe";
    probe.textContent = words[1];
    document.body.appendChild(probe);
    const chip = document.getElementById("form");
    let hit = 0;
    for (const el of document.querySelectorAll("body *")) {
      if (chip.contains(el) || el.contains(chip)) continue;
      if (el.children.length) continue;
      if (words.some((w) => (el.textContent || "").trim().includes(w))) hit += 1;
    }
    probe.remove();
    return hit;
  }, SPOKEN);
  check("control:a-planted-copy-is-found", caught === 1, "planted 1, found " + caught);
  check("console:no-errors", errs.length === 0, errs.slice(0, 2).join(" | ") || "clean");
  await ctx.close();

  if (notes.length) console.log(notes.map((x) => "  ok   " + x).join(LINE));
  if (fails.length) console.log(fails.map((x) => "  FAIL " + x).join(LINE));
  console.log(fails.length ? "dupe FAIL " + fails.length : "dupe PASS " + notes.length);
  if (fails.length) process.exitCode = 1;
} finally {
  clearTimeout(t);
  if (b) await b.close();
}
