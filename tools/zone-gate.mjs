import { chromium } from "playwright";

// 세 다이빙 버튼 중 무엇이 골라졌는지를 화면이 말하는지 재는 자.
// 누르는 순간에만 색이 변하고 뜬 뒤에는 아무 표시가 없었다. 안 누르면 판정이 대신 한 쪽을 고르므로,
// 플레이어는 자기가 안 눌렀는데 키퍼가 뜨는 것을 보고도 그것이 누구의 선택인지 알 수 없었다.
// 선택지가 셋인데 선택 상태가 화면에 없으면 그 조작은 있는 것이 아니다.
//
// 축은 셋이다. 누른 쪽이 표시되는가, 안 눌렀을 때 판정이 고른 쪽이 다른 모습으로 표시되는가,
// 다음 구가 열릴 때 지워지는가. 마지막이 없으면 지난 구의 표시가 이번 구의 것으로 읽힌다.
// 표시는 클래스가 아니라 화소로 잰다. 클래스가 붙었다는 것과 사람이 다르게 본다는 것은 다른 주장이다.
const EXE = process.env.LOCALAPPDATA + "/ms-playwright/chromium-1228/chrome-win64/chrome.exe";
const BASE = "http://127.0.0.1:10310/web/index.html?seed=20&preset=veteran";
const LINE = String.fromCharCode(10);
const t = setTimeout(() => { console.log("WATCHDOG"); process.exit(1); }, 180000);
t.unref();

const fails = [], notes = [];
const check = (n, ok, d) => (ok ? notes : fails).push(n + " " + d);

/* 판때기 하나의 화소를 평균 밝기로 줄인다. 버튼 상자를 통째로 찍으면 대부분이 투명한 여백이라
   표시가 붙어도 평균이 0.3밖에 안 움직였다. 색이 칠해지는 것은 svg 판이므로 그것만 찍는다. */
const lum = async (p, i) => {
  const png = (await p.locator(".zone svg").nth(i).screenshot()).toString("base64");
  return p.evaluate((s) => new Promise((res) => {
    const im = new Image();
    im.onload = () => {
      const cv = document.createElement("canvas");
      cv.width = im.width; cv.height = im.height;
      const g = cv.getContext("2d");
      g.drawImage(im, 0, 0);
      const d = g.getImageData(0, 0, im.width, im.height).data;
      let sum = 0;
      for (let i = 0; i < d.length; i += 4) sum += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
      res(sum / (d.length / 4));
    };
    im.src = "data:image/png;base64," + s;
  }), png);
};
const marks = (p) => p.evaluate(() => [...document.querySelectorAll(".zone")]
  .map((b) => (b.classList.contains("chose") ? "chose" : (b.classList.contains("drawn") ? "drawn" : ""))));

/* 구가 날아가는 중에 재면 지난 구의 표시가 기준선이 된다. 실측으로 대기 1.4초 뒤에 재려다
   이미 한 구가 끝난 화면을 기준선으로 삼았다. 재는 구간의 시작을 재는 대상의 시작에 맞춘다. */
const waitForRest = (p) => p.waitForFunction(() => {
  const zs = [...document.querySelectorAll(".zone")];
  return zs.length === 3 && zs.every((b) => !b.disabled && !b.classList.contains("chose") && !b.classList.contains("drawn"));
}, { timeout: 30000 });

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
  // 아무것도 안 누른 대기 상태. 아래 두 경우의 기준선이다.
  await waitForRest(p);
  const restMarks = await marks(p);
  const rest = [await lum(p, 0), await lum(p, 1), await lum(p, 2)];

  // 가운데를 누른다. 그 판만 달라져야 하고 나머지 둘은 기준선 그대로여야 한다.
  await p.locator(".zone").nth(1).dispatchEvent("pointerdown");
  await p.waitForFunction(() => document.querySelectorAll(".zone.chose").length === 1, { timeout: 5000 })
    .catch(() => {});
  const pressedMarks = await marks(p);
  const pressed = [await lum(p, 0), await lum(p, 1), await lum(p, 2)];

  // 안 누르고 기다린다. 판정이 한 쪽을 고르고 그 쪽이 다른 모습으로 서야 한다.
  await waitForRest(p);
  await p.waitForFunction(() => [...document.querySelectorAll(".zone")].some((b) => b.classList.contains("drawn")),
    { timeout: 25000 });
  const autoMarks = await marks(p);
  const drawnAt = autoMarks.indexOf("drawn");
  const auto = await lum(p, drawnAt);

  // 다음 구가 열리면 지워진다.
  await p.waitForFunction(() => [...document.querySelectorAll(".zone")]
    .every((b) => !b.classList.contains("chose") && !b.classList.contains("drawn")), { timeout: 25000 });
  const clearedMarks = await marks(p);

  check("instrument:nothing-is-marked-before-a-ball-is-played",
    restMarks.every((m) => m === ""), restMarks.join("/") || "empty");
  check("zone:the-pressed-side-is-marked",
    pressedMarks[1] === "chose" && pressedMarks[0] === "" && pressedMarks[2] === "",
    pressedMarks.join("/"));
  check("zone:the-pressed-side-actually-looks-different",
    Math.abs(pressed[1] - rest[1]) > 3,
    "pressed " + pressed[1].toFixed(1) + " against rest " + rest[1].toFixed(1));
  /* 대조군을 기준선과의 차로 잡았다가 한 번 틀렸다. 구를 커밋하면 세 버튼이 전부 비활성으로
     흐려지므로 안 누른 둘도 기준선에서 13만큼 내려간다. 그 하락은 표시가 아니라 비활성의 것이다.
     안 누른 둘은 서로 같은 처지이므로 둘 사이의 차가 대조군이고, 그 차보다 누른 쪽의 이탈이 커야 한다. */
  const idle = Math.abs(pressed[0] - pressed[2]);
  check("control:the-two-untouched-sides-match-each-other",
    idle < 5, "left " + pressed[0].toFixed(1) + " right " + pressed[2].toFixed(1) + " apart " + idle.toFixed(1));
  check("zone:the-marked-side-departs-from-the-untouched-ones",
    Math.abs(pressed[1] - pressed[0]) > idle * 4,
    "chose " + pressed[1].toFixed(1) + " against " + pressed[0].toFixed(1) + " and " + pressed[2].toFixed(1));
  check("zone:an-unpressed-ball-marks-the-side-the-game-chose",
    drawnAt >= 0 && autoMarks.filter((m) => m === "drawn").length === 1 && !autoMarks.includes("chose"),
    autoMarks.join("/"));
  check("zone:the-two-marks-do-not-look-the-same",
    Math.abs(auto - rest[drawnAt]) > 3 && Math.abs(auto - pressed[1]) > 3,
    "drawn " + auto.toFixed(1) + " rest " + rest[drawnAt].toFixed(1) + " chose " + pressed[1].toFixed(1));
  check("zone:the-next-ball-clears-the-mark",
    clearedMarks.every((m) => m === ""), clearedMarks.join("/") || "empty");
  check("console:no-errors", errs.length === 0, errs.slice(0, 2).join(" | ") || "clean");
  await ctx.close();

  if (notes.length) console.log(notes.map((x) => "  ok   " + x).join(LINE));
  if (fails.length) console.log(fails.map((x) => "  FAIL " + x).join(LINE));
  console.log(fails.length ? "zone FAIL " + fails.length : "zone PASS " + notes.length);
  if (fails.length) process.exitCode = 1;
} finally {
  clearTimeout(t);
  if (b) await b.close();
}
