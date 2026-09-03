import { chromium } from "playwright";

// 사건마다 공이 보이는지 재는 자.
// shot-gate가 같은 축을 이미 갖고 있다. 다만 여덟 구를 실제로 쳐서 나온 모든 프레임을
// 한 덩어리로 묻는다. 그러면 한 사건이 통째로 사라져도 전체 비율에 묻히고, 여덟 구 안에
// 안 나온 사건은 아예 안 물어본다. 흘림은 공 원반의 8.7%만 남은 채로 초록을 통과했다.
// 그래서 같은 축을 사건 하나 단위로 다시 묻는다. 문턱은 shot-gate가 선언한 값 그대로다.
//
// 광선으로 묻는다. 화소 색으로 물으면 가림과 대비가 한 수에 섞인다. 흰 공이 흰 골라인 위에
// 있으면 안 가려졌는데도 안 보이는 것으로 읽힌다. 대비는 read-gate가 따로 맡는다.
// 그물은 가림으로 안 센다. ball-probe의 opaqueBlocker가 투명 재질을 빼므로
// 그물 너머의 공은 보이는 것으로 잡힌다. 사람 눈에도 그렇게 보인다.
const EXE = process.env.LOCALAPPDATA + "/ms-playwright/chromium-1228/chrome-win64/chrome.exe";
const BASE = "http://127.0.0.1:10310/web/index.html?seed=20";
const STEP = 1 / 60, LEAD = 90, DIVE = 42, TAIL = 31;
// 축은 사건이 멈춘 프레임에서 공의 중심이 막혔는가다. 참과 거짓이라 지어낼 문턱이 없다.
// shot-gate의 86%와 24프레임은 여덟 구를 통째로 묻는 자리의 값이라 서른한 프레임짜리
// 창에 그대로 옮기면 뜻이 달라진다. 날아가는 도중 크로스바를 스치는 것은 눈이 따라가고,
// 멈춘 자리에서 안 보이는 것은 사건이 안 읽힌 것이다. 둘은 다른 주장이다.
// 비율과 최장 암전은 진단용으로 인쇄만 한다. 고칠 자리를 찾을 때 쓰는 수다.
// 꼬리마다 tail.vary가 종점을 흔든다. 매번 읽혀야 한다는 주장이므로 통계는 최악의 회차다.
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
  const p = await ctx.newPage();
  const errs = [];
  p.on("pageerror", (e) => errs.push(String(e)));
  p.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });

  await p.goto(BASE, { waitUntil: "load" });
  await p.waitForSelector("#go", { timeout: 15000 });
  await p.click("#go", { force: true });
  await p.waitForTimeout(1400);
  // 대조군. 게이트와 같은 probeAt를 탄다. 보이는 자리 하나가 통과하고 안 보이는 자리 셋이
  // 거부돼야 이 자가 무엇을 보고 있다고 말할 수 있다. shot-gate와 같은 네 좌표다.
  const ctrl = await p.evaluate(() => ({
    front: window.__ballProbe.probeAt(0, 0.6, 6).visible,
    behind: window.__ballProbe.probeAt(0, 3.3, -9).visible,
    far: window.__ballProbe.probeAt(-40, 1.0, 6).visible,
    under: window.__ballProbe.probeAt(0, -3.0, 6).visible
  }));
  check("control:a-visible-spot-passes", ctrl.front === true, String(ctrl.front));
  check("control:three-hidden-spots-are-rejected",
    ctrl.behind === false && ctrl.far === false && ctrl.under === false, JSON.stringify(ctrl));

  for (const kind of KINDS) {
    const rounds = [];
    for (let r = 0; r < ROUNDS; r += 1) {
      await p.goto(BASE, { waitUntil: "load" });
      await p.waitForSelector("#go", { timeout: 15000 });
      // 채취를 프레임으로 못 박는다. 잠으로 기다리면 사건을 거는 순간 공이 비행 어디쯤인지가 달라진다.
      await p.evaluate((s) => window.__fixedStep(s), STEP);
      await p.click("#go", { force: true });
      const base = await p.evaluate(() => window.__frames());
      await p.waitForFunction((m) => window.__frames() >= m, base + LEAD, { timeout: 20000 });
      await p.keyboard.press("ArrowLeft");
      const actAt = base + LEAD + DIVE;
      await p.evaluate(([a, k, s]) => window.__plan(a, k, s), [actAt, kind, actAt + TAIL]);
      // 사건이 걸린 뒤에 장부를 연다. 비행 프레임까지 세면 날아오는 동안 잘 보이던 것이
      // 사건이 사라진 것을 덮어 준다. 이 축이 묻는 것은 사건의 프레임이다.
      await p.waitForFunction((m) => window.__frames() >= m, actAt, { timeout: 20000 });
      await p.evaluate(() => window.__ballProbe.reset());
      await p.waitForFunction((m) => window.__frames() >= m, actAt + TAIL, { timeout: 20000 });
      rounds.push(await p.evaluate(() => {
        const s = window.__ballProbe.stats;
        return { frames: s.frames, visible: s.visible, longest: s.longestStreak, blockers: s.blockers, endVisible: Boolean(s.last && s.last.visible), endOn: Boolean(s.last && s.last.onScreen) };
      }));
    }
    const fracs = rounds.map((s) => (s.frames ? s.visible / s.frames : 0));
    const worst = Math.min(...fracs);
    const longest = Math.max(...rounds.map((s) => s.longest));
    const frames = Math.min(...rounds.map((s) => s.frames));
    const endBad = rounds.filter((s) => !s.endVisible).length;
    const offEnd = rounds.filter((s) => !s.endOn).length;
    const who = {};
    for (const s of rounds) for (const k of Object.keys(s.blockers)) who[k] = (who[k] || 0) + s.blockers[k];
    const names = Object.keys(who).sort((a, c) => who[c] - who[a]).slice(0, 2).join(", ");
    console.log("  " + kind.padEnd(15) + " end hidden " + endBad + "/" + ROUNDS + "  (frames visible " + (worst * 100).toFixed(1) + "%, blackout " + longest + " of " + frames + (names ? ", by " + names : "") + ")");
    // 표본이 비면 통과가 아니라 무응답이다. 사건이 안 걸렸는데 0으로 초록을 내면 안 된다.
    check("sampled:" + kind, frames > 0, frames + " frames over " + ROUNDS + " rounds");
    check("onscreen:" + kind, offEnd === 0, offEnd + " of " + ROUNDS + " ended off screen");
    check("reads:" + kind, endBad === 0, endBad + " of " + ROUNDS + " ended with the ball centre blocked" + (endBad && names ? ", by " + names : ""));
  }
  check("console:no-errors", errs.length === 0, errs.slice(0, 2).join(" | ") || "clean");
  await ctx.close();

  if (notes.length) console.log(notes.map((x) => "  ok   " + x).join(LINE));
  if (fails.length) console.log(fails.map((x) => "  FAIL " + x).join(LINE));
  console.log(fails.length ? "ballkind FAIL " + fails.length : "ballkind PASS " + notes.length);
  if (fails.length) process.exitCode = 1;
} finally {
  clearTimeout(t);
  if (b) await b.close();
}
