import { chromium } from "playwright";

// 프레이밍 게이트. 판정이 맞아도 화면에서 안 보이면 게임은 없는 것과 같다.
// 이 게이트는 선언값을 안 읽는다. 공은 광선으로, 배우는 바운딩 박스로, 골대는 투영으로 잰다.
// 대조군 넷이 붙어 있다. 보이는 자리 하나가 통과하고, 안 보이는 자리 셋이 거부돼야
// 이 계측기가 무엇을 보고 있는지 안다고 말할 수 있다.
const EXE = process.env.LOCALAPPDATA + "/ms-playwright/chromium-1228/chrome-win64/chrome.exe";
const SEED = process.argv[2] || 7;
const URL = "http://127.0.0.1:10310/web/index.html?seed=" + SEED;
const t = setTimeout(() => { console.log("WATCHDOG"); process.exit(1); }, 85000);
t.unref();

const fails = [];
const notes = [];
function check(name, ok, detail) {
  (ok ? notes : fails).push(name + " " + detail);
}

let b;
try {
  b = await chromium.launch({ executablePath: EXE });
  const p = await (await b.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  const errs = [];
  p.on("pageerror", (e) => errs.push(String(e)));
  p.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });

  await p.goto(URL, { waitUntil: "load" });
  await p.waitForTimeout(1200);
  await p.click("#go", { force: true });
  await p.waitForTimeout(1400);

  // 대조군. 같은 probeAt를 타야 한다. 다른 코드로 재면 게이트에 대해 아무것도 증명하지 못한다.
  const ctrl = await p.evaluate(() => ({
    front: window.__ballProbe.probeAt(0, 1.0, 6).visible,
    behind: window.__ballProbe.probeAt(0, 3.3, -9).visible,
    far: window.__ballProbe.probeAt(-40, 1.0, 6).visible,
    under: window.__ballProbe.probeAt(0, -3.0, 6).visible,
  }));
  check("control:visible-spot-passes", ctrl.front === true, String(ctrl.front));
  check("control:three-fake-spots-rejected",
    ctrl.behind === false && ctrl.far === false && ctrl.under === false,
    JSON.stringify(ctrl));

  // 여덟 구를 실제로 친다. 한 구는 우연이고 여덟 구는 분포다.
  await p.evaluate(() => { window.__ballProbe.reset(); window.__stageProbe.reset(); });
  for (let i = 0; i < 8; i += 1) {
    await p.keyboard.press(i % 2 ? "ArrowRight" : "ArrowLeft");
    await p.waitForTimeout(3200);
  }

  const ball = await p.evaluate(() => {
    const s = window.__ballProbe.stats;
    return { frames: s.frames, visible: s.visible, longest: s.longestStreak, blockers: s.blockers, worst: s.worstRun };
  });
  const frac = ball.frames ? ball.visible / ball.frames : 0;
  check("ball:visible-frames-over-86pct", frac >= 0.86, (frac * 100).toFixed(1) + "% of " + ball.frames);
  // 가린 물건만 알면 어디서 가렸는지를 몰라 고칠 자리를 못 찾는다. 공의 시작과 끝 좌표까지 찍는다.
  const w = ball.worst;
  const at = w && w.ballFrom
    ? " in " + (w.phase || "?") + " from [" + w.ballFrom.map((n) => n.toFixed(2)) + "] to [" + w.ballTo.map((n) => n.toFixed(2)) + "]"
    : "";
  check("ball:longest-blackout-under-24-frames", ball.longest <= 24,
    ball.longest + " by " + JSON.stringify(w ? w.by : {}) + at);

  const stage = await p.evaluate(() => JSON.parse(JSON.stringify(window.__stageProbe.worst)));
  // 발은 땅에 붙는다. 다이빙과 점프로 뜨는 만큼만 허용한다.
  const LIFT = { keeper: 0.5, kicker: 0.06 };
  for (const k of ["keeper", "kicker"]) {
    const w = stage[k];
    check(k + ":feet-on-the-ground", w.minFootY >= -0.06 && w.maxFootY <= LIFT[k],
      w.minFootY.toFixed(2) + ".." + w.maxFootY.toFixed(2));
    check(k + ":never-clipped-by-the-frame",
      w.minInside === 8 && w.maxAbsX <= 0.96 && w.maxAbsY <= 0.96,
      "inside" + w.minInside + " x" + w.maxAbsX.toFixed(2) + " y" + w.maxAbsY.toFixed(2) + " " + JSON.stringify(w.peak || {}));
    check(k + ":does-not-eat-the-screen", w.maxWidthFrac < 0.45, (w.maxWidthFrac * 100).toFixed(1) + "%");
  }

  // 골대. 공이 어느 쪽으로 들어갔는지 보려면 골대가 화면을 채워야 한다.
  const goal = await p.evaluate(() => window.__goalFrame());
  check("goal:fills-62-to-100pct-of-the-width",
    goal.widthFrac >= 0.62 && goal.widthFrac <= 1.0, (goal.widthFrac * 100).toFixed(1) + "%");
  check("goal:crossbar-inside-the-top-edge", goal.maxY <= 0.92, goal.maxY.toFixed(2));
  check("goal:goal-line-inside-the-bottom-edge", goal.minY >= -0.95, goal.minY.toFixed(2));

  // 자막이 조작을 덮으면 반전을 읽는 동안 다음 구를 막을 수 없다.
  // 세 칸은 화면 전체를 덮는 투명 영역이라 사각형이 겹치는 것은 정상이다.
  // 그래서 겹침이 아니라 손가락이 실제로 무엇에 닿는지를 잰다.
  const touch = await p.evaluate(() => {
    const cap = document.getElementById("caption");
    const capRect = cap.getBoundingClientRect();
    const targets = [...document.querySelectorAll(".zone svg"), document.getElementById("out"), document.getElementById("auto")];
    let boxHit = 0;
    let stolen = 0;
    for (const el of targets) {
      const r = el.getBoundingClientRect();
      const w = Math.min(capRect.right, r.right) - Math.max(capRect.left, r.left);
      const h = Math.min(capRect.bottom, r.bottom) - Math.max(capRect.top, r.top);
      if (w > 2 && h > 2) boxHit += 1;
      const top = document.elementFromPoint((r.left + r.right) / 2, (r.top + r.bottom) / 2);
      if (top === cap || cap.contains(top)) stolen += 1;
    }
    return { boxHit, stolen, pe: getComputedStyle(cap).pointerEvents };
  });
  check("caption:does-not-cover-the-controls", touch.boxHit === 0, String(touch.boxHit));
  check("caption:never-takes-a-tap", touch.stolen === 0 && touch.pe === "none", JSON.stringify(touch));

  check("console:no-errors", errs.length === 0, errs.slice(0, 3).join(" | ") || "clean");

  console.log(notes.map((s) => "  ok   " + s).join("\n"));
  if (fails.length) console.log(fails.map((s) => "  FAIL " + s).join("\n"));
  console.log(fails.length ? "shot FAIL " + fails.length : "shot PASS");
  if (fails.length) process.exitCode = 1;
} finally {
  clearTimeout(t);
  if (b) await b.close();
}
