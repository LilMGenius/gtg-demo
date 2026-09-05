import { chromium } from "playwright";

// 배경음 지연 게이트. 소리를 켜 본 적 없는 방문자에게 배경음 4MB가 내려가는가.
// 방문 한 번에서 소리가 60에서 62퍼센트를 쓰는데 브라우저는 어차피 첫 입력 전 재생을 막는다.
// 받는 시점을 그 입력에 맞추면 듣는 사람만 그 무게를 낸다. 실측으로 고치기 전에는 입력 861ms 전에
// 요청이 나갔고, 고친 뒤에는 첫 입력 뒤에만 나간다.

const EXE = process.env.LOCALAPPDATA + "/ms-playwright/chromium-1228/chrome-win64/chrome.exe";
const BASE = "http://127.0.0.1:10310/web/index.html?preset=veteran";
const t = setTimeout(() => { console.log("WATCHDOG"); process.exit(1); }, 60000);
t.unref();

const fails = [], notes = [];
const check = (n, ok, d) => (ok ? notes : fails).push(n + " " + d);

let b;
try {
  b = await chromium.launch({ executablePath: EXE });
  const ctx = await b.newContext();
  const p = await ctx.newPage();
  const errs = [];
  p.on("pageerror", (e) => errs.push(String(e)));
  const audio = [];
  p.on("request", (r) => { if (/assets\/audio\//.test(r.url())) audio.push(r.url().split("/").pop()); });
  await p.goto(BASE, { waitUntil: "load" });
  await p.waitForSelector("#go", { timeout: 15000 });
  // 2.5초는 preload auto가 요청을 내보내던 861ms의 세 배다. 그 안에 안 나갔으면 안 나가는 것이다.
  await p.waitForTimeout(2500);
  const before = audio.slice();
  check("idle:no-audio-file-is-fetched-before-the-first-input", before.length === 0, before.join(",") || "none");

  // 대조군. 첫 입력 뒤에는 나가야 한다. 안 나가면 위 0은 지연이 아니라 배경음이 죽은 것이다.
  await p.click("#go", { force: true });
  await p.waitForTimeout(1500);
  const after = audio.filter((u) => /^bgm\./.test(u));
  check("control:the-first-input-fetches-exactly-one-bgm-file", after.length === 1, after.join(",") || "none");

  // 소리가 실제로 서는지. 요소는 문서에 안 붙어 있어 querySelector로는 못 찾고 손잡이로 읽는다.
  // 음량이 코드 기본값과 같으면 마운트가 정상이고, 요청이 나간 뒤라 재생 경로는 열려 있다.
  const mounted = await p.evaluate(async () => {
    const m = await import("/web/src/audio/bgm.mjs");
    return { vol: window.__bgm ? window.__bgm.volume : -1, bed: m.BED };
  });
  check("control:the-bgm-handle-is-live-after-input", mounted.vol === mounted.bed, JSON.stringify(mounted));
  check("console:no-errors", errs.length === 0, errs.slice(0, 2).join(" | ") || "clean");
} finally { if (b) await b.close(); }

console.log(notes.map((s) => "  ok   " + s).join("\n"));
if (fails.length) console.log(fails.map((s) => "  FAIL " + s).join("\n"));
console.log(fails.length ? "lazybgm FAIL " + fails.length : "lazybgm PASS " + notes.length);
if (fails.length) process.exitCode = 1;
