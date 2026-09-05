import { chromium } from "playwright";
import { pinClock } from "./clock.mjs";

// 사건마다 정해 둔 표정이 렌즈에 닿는지 재는 자.
// FACE_MOOD가 열다섯 사건에 표정을 하나씩 배정하고, applyFace가 섞음량 a > 0.25일 때
// 그 표정을 얼굴에 올린다. 그런데 a는 안식 자세에서 렌즈 자세로 가는 보간 비율이지
// 얼굴이 실제로 렌즈를 향한 정도가 아니다. 안식 자세는 포즈마다 다르므로 같은 a가
// 사건마다 다른 노출을 낸다. 실측으로 제꼈다는 a 0.5에 노출 0.043이었다. 옆얼굴이다.
// 표정을 그려 놓고 아무도 못 보는 상태이고, 정지 화면에서 그 사건의 절반이 사라진다.
//
// 문턱은 코드가 이미 선언한 0.25를 쓴다. 지어낸 수가 아니라, 그 수가 원래 말하려던
// 양으로 옮겨 붙인 것이다. applyFace는 0.25 아래를 표정을 올릴 값어치가 없는 구간으로
// 선언해 두었고, 그 판단의 대상은 섞음량이 아니라 노출이어야 한다.
const EXE = process.env.LOCALAPPDATA + "/ms-playwright/chromium-1228/chrome-win64/chrome.exe";
const BASE = "http://127.0.0.1:10310/web/index.html?seed=20";
const STEP = 1 / 60, LEAD = 90, DIVE = 42, TAIL = 31;
const BAR = 0.25;
const ROUNDS = 3;
const KINDS = ["save", "catch", "carriedIn", "downed", "lost", "openGoalScored", "gloveGone", "spill", "rebound", "reboundMiss", "charge", "beat", "talked", "distracted", "skied"];
const LINE = String.fromCharCode(10);
const t = setTimeout(() => { console.log("WATCHDOG"); process.exit(1); }, 600000);
t.unref();

const fails = [], notes = [];
const check = (n, ok, d) => (ok ? notes : fails).push(n + " " + d);

let b;
try {
  b = await chromium.launch({ executablePath: EXE });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } });
  await pinClock(ctx, STEP);
  const p = await ctx.newPage();
  const errs = [];
  p.on("pageerror", (e) => errs.push(String(e)));
  p.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
  let ctlDone = false;

  for (const kind of KINDS) {
    const got = [];
    for (let r = 0; r < ROUNDS; r += 1) {
      await p.goto(BASE, { waitUntil: "load" });
      await p.waitForSelector("#go", { timeout: 15000 });
      await p.click("#go", { force: true });
      const base = await p.evaluate(() => window.__frames());
      await p.waitForFunction((m) => window.__frames() >= m, base + LEAD, { timeout: 20000 });
      // 대조군 둘. 사건 전 대기 자세는 키커를 보고 서 있으므로 렌즈에 등을 준다.
      // 여기서 양수가 나오면 이 자는 방향을 안 보고 있는 것이다.
      if (!ctlDone) {
        const rest = await p.evaluate(() => window.__faceVis());
        check("control:the-ready-stance-faces-away", rest < 0, rest.toFixed(3));
      }
      await p.keyboard.press("ArrowLeft");
      const actAt = base + LEAD + DIVE;
      await p.evaluate(([a, k, s]) => window.__plan(a, k, s), [actAt, kind, actAt + TAIL]);
      await p.waitForFunction((m) => window.__frames() >= m, actAt + TAIL, { timeout: 20000 });
      const now = await p.evaluate(() => window.__faceVis());
      // 심어서 증명한다. 몸을 반 바퀴 돌리면 같은 자가 얼굴을 잃어야 한다.
      // 0을 돌린 경우는 원래 값과 같아야 한다. 손잡이가 상태를 망가뜨리지 않았다는 뜻이다.
      if (!ctlDone) {
        const same = await p.evaluate(() => window.__faceProbe(0));
        const flipped = await p.evaluate(() => window.__faceProbe(Math.PI));
        const after = await p.evaluate(() => window.__faceVis());
        check("control:a-zero-turn-reads-the-same", Math.abs(same - now) < 0.002, same.toFixed(3) + " vs " + now.toFixed(3));
        check("control:a-half-turn-loses-the-face", flipped < now - 0.5, flipped.toFixed(3) + " from " + now.toFixed(3));
        check("control:the-probe-puts-the-body-back", Math.abs(after - now) < 0.002, after.toFixed(3) + " vs " + now.toFixed(3));
        ctlDone = true;
      }
      got.push(now);
    }
    const worst = Math.min(...got);
    console.log("  " + kind.padEnd(15) + " worst " + worst.toFixed(3) + "  rounds " + got.map((n) => n.toFixed(2)).join(" "));
    check("sampled:" + kind, got.length === ROUNDS, got.length + " of " + ROUNDS);
    check("faces:" + kind, worst >= BAR, worst.toFixed(3) + " toward the lens, bar " + BAR);
  }
  check("console:no-errors", errs.length === 0, errs.slice(0, 2).join(" | ") || "clean");
  await ctx.close();

  if (notes.length) console.log(notes.map((x) => "  ok   " + x).join(LINE));
  if (fails.length) console.log(fails.map((x) => "  FAIL " + x).join(LINE));
  console.log(fails.length ? "facevis FAIL " + fails.length : "facevis PASS " + notes.length);
  if (fails.length) process.exitCode = 1;
} finally {
  clearTimeout(t);
  if (b) await b.close();
}
