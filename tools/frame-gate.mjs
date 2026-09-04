import { chromium } from "playwright";

// 한 장의 자. 판을 읽는 데 필요한 것이 한 프레임 안에 다 있는가를 묻는다.
// 골문과 공과 키퍼와 타이밍 자, 넷이다. 넷을 각각 재는 자는 이미 있지만 그 넷이
// 같은 순간 같은 화면에 있는지는 아무도 안 물었다. 한 장에 다 안 들어오면
// 플레이어는 눈을 옮겨야 하고, 그 사이에 공이 지나간다.
//
// 세로 화면은 애초에 이 게임의 판이 아니다. 골대는 좌우로 길고 입력도 좌우다.
// 그래서 가로인지부터 확인하고, 세로일 때 돌려 달라는 안내가 서는지를 대조군으로 둔다.
// 표본 범위: 판정을 안 부른다. 한 프레임의 배치만 재므로 키퍼 표본이 결론을 안 바꾼다.
const EXE = process.env.LOCALAPPDATA + "/ms-playwright/chromium-1228/chrome-win64/chrome.exe";
const BASE = "http://127.0.0.1:10310/web/index.html?seed=20";
const LINE = String.fromCharCode(10);
const W = 1280, H = 720;
const t = setTimeout(() => { console.log("WATCHDOG"); process.exit(1); }, 150000);
t.unref();

const fails = [], notes = [];
const check = (n, ok, d) => (ok ? notes : fails).push(n + " " + d);
const inside = (r) => r.left >= 0 && r.top >= 0 && r.right <= W && r.bottom <= H;

let b;
try {
  b = await chromium.launch({ executablePath: EXE });
  const ctx = await b.newContext({ viewport: { width: W, height: H } });
  const p = await ctx.newPage();
  const errs = [];
  p.on("pageerror", (e) => errs.push(String(e)));
  p.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
  await p.goto(BASE, { waitUntil: "load" });
  await p.waitForSelector("#go", { timeout: 15000 });
  await p.evaluate(() => window.__fixedStep(1 / 60));
  await p.click("#go", { force: true });

  // 결정의 순간에 세운다. 공이 날아오는 동안이라야 넷이 동시에 화면에 있다.
  // 착탄 뒤에 재면 자는 이미 사라져 있고, 킥 전에 재면 공이 발밑에 붙어 있다.
  /* 프레임 수로 세면 그날의 비행시간에 따라 착탄 뒤에 서기도 한다. 자가 떠 있는 동안을
     조건으로 걸어 그 창 안에서 세운다. 자는 킥과 함께 서고 착탄 260ms 뒤에 접힌다. */
  await p.waitForFunction(() => document.getElementById("beat").hidden === false, null, { timeout: 20000 });
  await p.waitForTimeout(120);
  await p.evaluate(() => window.__fixedStep(0.000001));
  await p.waitForTimeout(200);

  const seen = await p.evaluate(() => {
    const ball = window.__ballPos();
    const v = window.__project(ball.x, ball.y, ball.z);
    const goal = window.__goalFrame();
    const head = window.__headAt();
    const hv = window.__project(head.x, head.y, head.z);
    const lane = document.getElementById("beat");
    const hot = lane.querySelector(".hot");
    const r = (e) => { const q = e.getBoundingClientRect(); return { left: q.left, top: q.top, right: q.right, bottom: q.bottom, w: q.width, h: q.height }; };
    return { ball: v, goal, keeper: hv, laneHidden: lane.hidden, lane: r(lane), hot: r(hot),
      rotate: getComputedStyle(document.getElementById("rotate")).display,
      pad: [...document.querySelectorAll("#pad .zone")].map(r) };
  });

  check("instrument:the-frame-was-caught-mid-flight", seen.laneHidden === false,
    "lane " + (seen.laneHidden ? "hidden" : "up"));
  check("frame:the-goal-mouth-fills-the-shot", seen.goal.widthFrac >= 0.5 && seen.goal.widthFrac <= 1,
    (seen.goal.widthFrac * 100).toFixed(1) + "% of the width");
  // 골대 뒷기둥이 프레임 밖으로 나가는 것은 결함이 아니다. 문틀이 화면 안에 있으면 된다.
  check("frame:the-goal-mouth-is-not-cut", seen.goal.minY >= -1 && seen.goal.maxY <= 1,
    "y " + seen.goal.minY.toFixed(2) + ".." + seen.goal.maxY.toFixed(2));
  check("frame:the-ball-is-in-the-shot", Math.abs(seen.ball.x) <= 1 && Math.abs(seen.ball.y) <= 1 && seen.ball.z < 1,
    "ndc " + seen.ball.x.toFixed(2) + "," + seen.ball.y.toFixed(2));
  check("frame:the-keeper-is-in-the-shot", Math.abs(seen.keeper.x) <= 1 && Math.abs(seen.keeper.y) <= 1,
    "ndc " + seen.keeper.x.toFixed(2) + "," + seen.keeper.y.toFixed(2));
  check("frame:the-timing-lane-is-in-the-shot", inside(seen.lane) && seen.hot.w > 4,
    "lane " + Math.round(seen.lane.left) + ".." + Math.round(seen.lane.right) + ", band " + Math.round(seen.hot.w) + "px");
  // 자가 공이나 골문 위에 앉으면 한 장에 들어온 것이 아니라 서로를 가린 것이다.
  const ballPx = { x: (seen.ball.x * 0.5 + 0.5) * W, y: (-seen.ball.y * 0.5 + 0.5) * H };
  const over = ballPx.x >= seen.lane.left && ballPx.x <= seen.lane.right
    && ballPx.y >= seen.lane.top && ballPx.y <= seen.lane.bottom;
  check("frame:the-lane-does-not-sit-on-the-ball", !over,
    "ball at " + Math.round(ballPx.x) + "," + Math.round(ballPx.y) + " lane top " + Math.round(seen.lane.top));
  check("frame:the-three-zones-cover-the-width",
    seen.pad.length === 3 && Math.abs(seen.pad[0].left) < 2 && Math.abs(seen.pad[2].right - W) < 2,
    seen.pad.map((z) => Math.round(z.w)).join("+") + " over " + W);
  check("control:landscape-hides-the-turn-notice", seen.rotate === "none", seen.rotate);

  // 대조군. 세로로 돌리면 안내가 서야 한다. 안 서면 위의 초록은 가로를 잰 것이 아니다.
  await p.setViewportSize({ width: H, height: W });
  await p.waitForTimeout(300);
  const tall = await p.evaluate(() => getComputedStyle(document.getElementById("rotate")).display);
  check("control:portrait-asks-for-a-turn", tall !== "none", tall);
  await p.setViewportSize({ width: W, height: H });
  await p.waitForTimeout(200);

  // 사람이 볼 한 장. 게이트가 초록이어도 이 장을 눈으로 봐야 랩이 끝난다.
  await p.screenshot({ path: "frame.local.png" });
  check("console:no-errors", errs.length === 0, errs.slice(0, 2).join(" | ") || "clean");
  await ctx.close();

  if (notes.length) console.log(notes.map((x) => "  ok   " + x).join(LINE));
  if (fails.length) console.log(fails.map((x) => "  FAIL " + x).join(LINE));
  console.log(fails.length ? "frame FAIL " + fails.length : "frame PASS " + notes.length);
  if (fails.length) process.exitCode = 1;
} finally {
  clearTimeout(t);
  if (b) await b.close();
}
