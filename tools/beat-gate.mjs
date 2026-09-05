import { chromium } from "playwright";
import { judgeWindow } from "../src/chain.mjs";

// 타이밍 자의 자. 게이지가 상수를 그리면 그것은 이 구에 대해 아무 말도 안 하는 장식이다.
// 노란 구간이 판정 창과 같은 자리 같은 폭인지, 키퍼와 구가 달라지면 같이 달라지는지를 잰다.
//
// 화면이 읽은 값과 판정이 쓰는 값을 같은 자리에서 맞댄다. 판정 쪽은 이 파일이 chain을 직접 불러
// 다시 구하므로, 화면이 제 값을 옮겨 적었으면 두 수가 갈린다.
// 표본 범위: 라이브 한 구와 그 구에서 파생한 대조군이다. 창의 폭은 세이브율이 아니라 능력치의
// 직접 함수라 레벨을 순회할 이유가 없고, 대신 반응속도 1과 10을 같은 구에 넣어 폭이 따라 움직이는지 본다.
const EXE = process.env.LOCALAPPDATA + "/ms-playwright/chromium-1228/chrome-win64/chrome.exe";
const BASE = "http://127.0.0.1:10310/web/index.html?seed=20&preset=veteran";
const LINE = String.fromCharCode(10);
const t = setTimeout(() => { console.log("WATCHDOG"); process.exit(1); }, 120000);
t.unref();

const fails = [], notes = [];
const check = (n, ok, d) => (ok ? notes : fails).push(n + " " + d);
const pct = (s) => Number(String(s).replace("%", ""));

let b;
try {
  b = await chromium.launch({ executablePath: EXE });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } });
  const p = await ctx.newPage();
  const errs = [];
  p.on("pageerror", (e) => errs.push(String(e)));
  p.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
  await p.goto(BASE, { waitUntil: "load" });
  await p.evaluate(() => localStorage.clear());
  await p.goto(BASE, { waitUntil: "load" });
  await p.waitForSelector("#go", { timeout: 15000 });
  await p.click("#go", { force: true });
  await p.waitForTimeout(1400);

  const beat = await p.evaluate(() => window.__beat());
  check("instrument:the-lane-reported-its-own-numbers",
    beat.spanMs > 0 && beat.hotW.length > 0 && beat.slackMs > 0,
    "span " + Math.round(beat.spanMs) + "ms, band " + beat.hotL + " " + beat.hotW);

  // 같은 키퍼와 같은 구로 판정 쪽에서 다시 구한다. 두 수가 갈리면 화면이 제 규칙을 만든 것이다.
  const shot = { kicker: { power: (1.05 - beat.flight - (beat.strong ? 0.1 : 0)) / 0.05 },
    strong: beat.strong, course: beat.course };
  const want = judgeWindow(beat.keeper, shot, { studs: beat.studs });
  check("instrument:the-two-sides-were-fed-the-same-shot", Math.abs(want.flight - beat.flight) < 1e-6,
    want.flight.toFixed(4) + " against " + beat.flight.toFixed(4));
  check("beat:the-band-is-the-window-the-judge-uses", Math.abs(want.slackMs - beat.slackMs) < 0.5,
    want.slackMs.toFixed(1) + "ms judged against " + beat.slackMs.toFixed(1) + "ms drawn");

  const center = (beat.markerAt * 1000) / beat.spanMs;
  const half = Math.min(center, Math.max(0.04, beat.slackMs / beat.spanMs));
  check("beat:the-band-sits-on-the-marker",
    Math.abs(pct(beat.hotL) - Math.max(0, center - half) * 100) < 0.05
    && Math.abs(pct(beat.hotW) - Math.min(1 - Math.max(0, center - half), half * 2) * 100) < 0.05,
    "drawn " + beat.hotL + " wide " + beat.hotW + ", marker at " + (center * 100).toFixed(2) + "%");
  // 900ms 꼬리를 달던 시절의 증상. 창이 레인 왼쪽에 몰려 오른쪽 절반이 통째로 죽은 자리였다.
  check("beat:the-needle-stops-soon-after-the-window-shuts",
    beat.spanMs - (beat.markerAt * 1000 + beat.slackMs) < 400,
    Math.round(beat.spanMs - (beat.markerAt * 1000 + beat.slackMs)) + "ms of dead tail");
  check("beat:the-band-is-not-pinned-to-the-left-half", pct(beat.hotL) + pct(beat.hotW) / 2 > 45,
    "band centre at " + (pct(beat.hotL) + pct(beat.hotW) / 2).toFixed(1) + "%");

  // 대조군 둘. 창은 키퍼의 것이므로 반응속도를 흔들면 폭이 따라 움직이고, 안 움직이면 상수다.
  const widthFor = (over) => {
    const w = judgeWindow(Object.assign({}, beat.keeper, over), shot, { studs: beat.studs });
    return w.slackMs;
  };
  check("control:a-slower-keeper-gets-a-narrower-band", widthFor({ reflex: 1 }) < widthFor({ reflex: 10 }) - 30,
    widthFor({ reflex: 1 }).toFixed(0) + "ms against " + widthFor({ reflex: 10 }).toFixed(0) + "ms");
  check("control:boots-widen-the-band",
    judgeWindow(beat.keeper, shot, { studs: 0 }).slackMs < judgeWindow(beat.keeper, shot, { studs: 3 }).slackMs,
    judgeWindow(beat.keeper, shot, { studs: 0 }).slackMs.toFixed(0) + "ms against "
    + judgeWindow(beat.keeper, shot, { studs: 3 }).slackMs.toFixed(0) + "ms");

  // 화면에서도 달라지는가. 판정 쪽 계산만 갈리면 그린 것은 그대로일 수 있다.
  const drawn = [];
  for (const rank of [0, 3]) {
    await p.evaluate((r) => { window.__gear().studs = r; }, rank);
    await p.evaluate(() => { window.__lockRound(); window.__resumeRound(); });
    await p.waitForTimeout(700);
    drawn.push(await p.evaluate(() => window.__beat()));
  }
  check("beat:the-drawn-band-follows-the-gear", pct(drawn[1].hotW) > pct(drawn[0].hotW),
    "bare " + drawn[0].hotW + " against studded " + drawn[1].hotW);

  check("console:no-errors", errs.length === 0, errs.slice(0, 2).join(" | ") || "clean");
  await ctx.close();

  if (notes.length) console.log(notes.map((x) => "  ok   " + x).join(LINE));
  if (fails.length) console.log(fails.map((x) => "  FAIL " + x).join(LINE));
  console.log(fails.length ? "beat FAIL " + fails.length : "beat PASS " + notes.length);
  if (fails.length) process.exitCode = 1;
} finally {
  clearTimeout(t);
  if (b) await b.close();
}
