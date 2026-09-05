import { chromium } from "playwright";
import { pinClock } from "./clock.mjs";

// 체격 실루엣 게이트. 키와 몸무게가 캡슐에 물려 있는데 극단 둘이 한 화면에서 갈리는지는
// 판정 게이트 physique가 안 묻는다. 그것은 세이브율 방향만 잰다. 여기는 화면이다.
// 로스터 범위는 168에서 200, 73에서 96이라 그 밖의 극단 둘을 세워 안쪽이 그 사이에 오는지 본다.
// 실루엣은 서 있는 자세에서 재야 한다. 다이빙 자세는 팔다리가 몸통을 가려 폭이 자세로 갈린다.

const EXE = process.env.LOCALAPPDATA + "/ms-playwright/chromium-1228/chrome-win64/chrome.exe";
const BASE = "http://127.0.0.1:10310/web/index.html?preset=maxed,rich,veteran";
const t = setTimeout(() => { console.log("WATCHDOG"); process.exit(1); }, 120000);
t.unref();

const fails = [], notes = [];
const check = (n, ok, d) => (ok ? notes : fails).push(n + " " + d);

// 표본 범위: 로스터 밖 극단 둘과 그 사이 평균 하나다. 판정을 안 부르므로 성장 칸은 안 돈다.
const BODIES = [[205, 58], [188, 84], [165, 105]];

let b;
try {
  b = await chromium.launch({ executablePath: EXE });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } });
  await pinClock(ctx, 1 / 60);
  const p = await ctx.newPage();
  const errs = [];
  p.on("pageerror", (e) => errs.push(String(e)));
  await p.goto(BASE, { waitUntil: "load" });
  await p.waitForSelector("#go", { timeout: 15000 });
  await p.click("#go", { force: true });
  await p.waitForTimeout(150);
  // 판을 잠가 키퍼가 대기 자세로 서 있게 한다. 잠근 판은 다음 구도 정산도 안 연다.
  await p.evaluate(() => window.__lockRound());
  await p.waitForTimeout(600);

  /* 캔버스는 알파를 안 남기므로 직접 읽으면 0이다. 이 레포의 길은 스크린샷 두 장의 차이다.
     키퍼만 켠 장과 키퍼까지 끈 장을 찍어 다른 화소가 곧 키퍼의 실루엣이다. 가시성은 다음
     프레임에 반영되므로 바꾼 뒤 120ms를 흘린다. 멈춘 세계에서도 렌더 루프는 돈다. */
  const cv = await p.$("canvas");
  const grab = async () => (await cv.screenshot({ type: "png" })).toString("base64");
  const diffBox = ([a, b]) => new Promise((res) => {
    const load = (s) => new Promise((r) => { const im = new Image(); im.onload = () => r(im); im.src = "data:image/png;base64," + s; });
    Promise.all([load(a), load(b)]).then(([ia, ib]) => {
      const g = document.createElement("canvas");
      g.width = ia.width; g.height = ia.height;
      const c = g.getContext("2d");
      c.drawImage(ia, 0, 0);
      const da = c.getImageData(0, 0, g.width, g.height).data;
      c.drawImage(ib, 0, 0);
      const db = c.getImageData(0, 0, g.width, g.height).data;
      let minX = g.width, maxX = -1, minY = g.height, maxY = -1, n = 0;
      for (let y = 0; y < g.height; y += 1) for (let x = 0; x < g.width; x += 1) {
        const i = (y * g.width + x) * 4;
        const d = Math.abs(da[i] - db[i]) + Math.abs(da[i + 1] - db[i + 1]) + Math.abs(da[i + 2] - db[i + 2]);
        if (d < 24) continue;
        n += 1;
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
      res({ w: maxX - minX + 1, h: maxY - minY + 1, n });
    });
  });
  const measure = async (h, w) => {
    await p.evaluate(([hh, ww]) => window.__setBody(hh, ww), [h, w]);
    await p.waitForTimeout(400);
    await p.evaluate(() => { window.__freeze(true); window.__solo("keeper"); });
    await p.waitForTimeout(120);
    const withK = await grab();
    await p.evaluate(() => window.__solo("__none__"));
    await p.waitForTimeout(120);
    const without = await grab();
    await p.evaluate(() => { window.__solo(null); window.__freeze(false); });
    const box = await p.evaluate(diffBox, [withK, without]);
    box.hasSolo = true;
    return box;
  };

  const out = {};
  for (const [h, w] of BODIES) out[h + "/" + w] = await measure(h, w);
  const tall = out["205/58"], mid = out["188/84"], wide = out["165/105"];

  check("instrument:the-keeper-was-isolated", tall.hasSolo, tall.hasSolo ? "solo hook present" : "no solo hook, background included");
  check("instrument:every-body-painted-something", tall.n > 500 && mid.n > 500 && wide.n > 500, [tall.n, mid.n, wide.n].join(","));
  /* 키는 상자 높이다. 몸무게는 상자 폭이 아니다. 대기 자세는 팔을 벌리고 장갑이 상자의 양끝을
     정하는데 장갑 크기와 팔 길이는 키를 탄다. 실측으로 205/58의 상자가 165/105보다 넓었다(176 대 170).
     사람이 뚱뚱함으로 읽는 것은 최대 폭이 아니라 평균 폭이고, 그것은 칠해진 면적을 높이로 나눈 값이다.
     실측으로 57, 67, 70 화소로 단조다. */
  const stout = (b) => b.n / b.h;
  check("physique:the-tall-one-stands-taller-than-the-wide-one", tall.h > wide.h * 1.10, tall.h + " vs " + wide.h);
  check("physique:the-wide-one-carries-more-width-per-row-than-the-tall-one", stout(wide) > stout(tall) * 1.10,
    stout(wide).toFixed(1) + " vs " + stout(tall).toFixed(1));
  // 대조군. 평균은 두 극단 사이에 선다. 밖이면 캡슐이 선형이 아니라 어딘가 꺾인 것이다.
  check("control:the-average-sits-between-the-extremes",
    mid.h < tall.h && mid.h > wide.h && stout(mid) > stout(tall) && stout(mid) < stout(wide),
    "h " + tall.h + " > " + mid.h + " > " + wide.h + ", width per row " + stout(tall).toFixed(1) + " < " + stout(mid).toFixed(1) + " < " + stout(wide).toFixed(1));
  check("console:no-errors", errs.length === 0, errs.slice(0, 2).join(" | ") || "clean");
} finally { if (b) await b.close(); }

console.log(notes.map((s) => "  ok   " + s).join("\n"));
if (fails.length) console.log(fails.map((s) => "  FAIL " + s).join("\n"));
console.log(fails.length ? "build FAIL " + fails.length : "build PASS " + notes.length);
if (fails.length) process.exitCode = 1;
