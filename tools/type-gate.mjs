import { chromium } from "playwright";
import { readFileSync } from "node:fs";

// 서체가 역할로 갈리는지, 그리고 그 역할이 실제로 실린 글꼴로 떨어지는지 재는 자.
// 이전에는 var(--disp) 하나가 서른다섯 자리를 먹어 능력치도 피드도 대사도 제목용 굵은 획으로 나왔다.
// 본문용은 토큰도 없이 Pretendard 이름만 적혀 있었고 그 이름을 받치는 @font-face가 없어
// 윈도우에서는 맑은 고딕, 다른 기계에서는 각자의 기본 글꼴로 떨어졌다. 일관성이 선언으로만 있었다.
//
// 문턱을 지어내지 않는다. 축은 전부 참거짓이고, 근거는 계획서가 이미 인용한 규칙이다.
// 이름을 쓰면서 그 이름의 @font-face가 없으면 그것은 결함이다.
const EXE = process.env.LOCALAPPDATA + "/ms-playwright/chromium-1228/chrome-win64/chrome.exe";
const BASE = "http://127.0.0.1:10310/web/index.html?seed=20";
const LINE = String.fromCharCode(10);
const QUOTE = String.fromCharCode(39);
const t = setTimeout(() => { console.log("WATCHDOG"); process.exit(1); }, 120000);
t.unref();

const fails = [], notes = [];
const check = (n, ok, d) => (ok ? notes : fails).push(n + " " + d);

const css = ["web/src/ui/hud.css", "web/src/ui/title.css"].map((f) => readFileSync(f, "utf8")).join(LINE);
const html = readFileSync("web/index.html", "utf8");

// 토큰 정의 두 줄을 뺀 나머지 font-family 선언은 var()이거나 inherit이어야 한다.
const decls = [...css.matchAll(/font-family:([^;}]+)/g)].map((m) => m[1].trim());
const raw = decls.filter((d) => d.indexOf("var(") !== 0 && d !== "inherit");
check("roles:no-raw-font-stack-outside-the-tokens", raw.length === 0, raw.join(" | ") || String(decls.length) + " declarations, all tokens");

// 토큰이 부르는 이름마다 @font-face가 있어야 한다. 일반 계열 이름은 받침이 필요 없다.
const GENERIC = new Set(["sans-serif", "serif", "monospace", "system-ui", "cursive", "fantasy"]);
const tokenLines = [...css.matchAll(/--(disp|body):([^;]+);/g)];
const named = [];
for (const m of tokenLines) for (const part of m[2].split(",")) { const n = part.trim().replace(/^'|'$/g, ""); if (n && !GENERIC.has(n)) named.push(n); }
const faces = [...html.matchAll(/@font-face\{[^}]*font-family:'([^']+)'[^}]*\}/g)].map((m) => m[1]);
const orphan = named.filter((n) => faces.indexOf(n) < 0);
check("roles:every-named-family-has-a-font-face", named.length > 0 && orphan.length === 0, named.join(", ") + " vs faces " + faces.join(", "));

// 선언한 굵기마다 그 굵기의 face가 있어야 한다. 없으면 브라우저가 가짜 굵기를 합성한다.
const weights = [...new Set([...css.matchAll(/font-weight:(\d+)/g)].map((m) => m[1]))];
const faceWeights = [...new Set([...html.matchAll(/@font-face\{[^}]*font-weight:(\d+)[^}]*\}/g)].map((m) => m[1]))];
const unbacked = weights.filter((w) => faceWeights.indexOf(w) < 0);
check("roles:every-declared-weight-has-a-face", unbacked.length === 0, "declared " + weights.join(",") + " shipped " + faceWeights.join(","));

let b;
try {
  b = await chromium.launch({ executablePath: EXE });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } });
  const p = await ctx.newPage();
  const errs = [];
  p.on("pageerror", (e) => errs.push(String(e)));
  await p.goto(BASE, { waitUntil: "load" });
  await p.waitForSelector("#go", { timeout: 15000 });
  await p.click("#go", { force: true });
  await p.waitForTimeout(1200);
  await p.evaluate(() => document.fonts.ready);

  // 선언이 아니라 실제 로드를 묻는다. 파일이 404여도 CSS는 그대로 서 있고 화면만 조용히 떨어진다.
  const loaded = await p.evaluate(() => ({
    body400: document.fonts.check("400 16px " + String.fromCharCode(39) + "Pretendard GTG" + String.fromCharCode(39)),
    body700: document.fonts.check("700 16px " + String.fromCharCode(39) + "Pretendard GTG" + String.fromCharCode(39)),
    disp: document.fonts.check("400 16px " + String.fromCharCode(39) + "Black Han Sans" + String.fromCharCode(39))
  }));
  check("render:both-body-weights-actually-loaded", loaded.body400 && loaded.body700, JSON.stringify(loaded));
  check("render:the-display-face-actually-loaded", loaded.disp, String(loaded.disp));

  await p.click("#gymBtn", { force: true });
  await p.waitForTimeout(320);
  const used = await p.evaluate(() => {
    const face = (sel) => { const e = document.querySelector(sel); return e ? getComputedStyle(e).fontFamily.split(",")[0].replace(/["']/g, "") : "missing"; };
    return { row: face("#gym .row button"), title: face("#gym h4") };
  });
  // 대조군. 제목은 여전히 제목용이어야 한다. 둘 다 본문용이 되면 역할이 사라진 것이다.
  check("control:a-title-still-uses-the-display-face", used.title === "Black Han Sans", used.title);
  check("body:a-stat-row-uses-the-body-face", used.row === "Pretendard GTG", used.row);
  check("console:no-errors", errs.length === 0, errs.slice(0, 2).join(" | ") || "clean");
  await ctx.close();

  if (notes.length) console.log(notes.map((x) => "  ok   " + x).join(LINE));
  if (fails.length) console.log(fails.map((x) => "  FAIL " + x).join(LINE));
  console.log(fails.length ? "type FAIL " + fails.length : "type PASS " + notes.length);
  if (fails.length) process.exitCode = 1;
} finally {
  clearTimeout(t);
  if (b) await b.close();
}
