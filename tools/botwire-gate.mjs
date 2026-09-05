import { chromium } from "playwright";
import { pinClock } from "./clock.mjs";

// 봇이 뛴 구는 성장은 남기고 화제는 안 남긴다. 그 교환이 실제로 배선돼 있는지는
// 시드 시뮬로 못 잰다. state.botRan 하나가 팔로워와 라포 둘을 지배하고,
// 그 플래그는 화면이 아니라 브라우저 안의 장부에만 있기 때문이다.

const EXE = process.env.LOCALAPPDATA + "/ms-playwright/chromium-1228/chrome-win64/chrome.exe";
const BASE = "http://127.0.0.1:10310/web/index.html";

// 봇 랩과 사람 랩을 합쳐 두 분 가까이 돈다. 워치독은 그보다 넉넉해야 한다.
const t = setTimeout(() => { console.log("WATCHDOG"); process.exit(1); }, 600000);
t.unref();

// 봇은 자동으로 도니 구가 빨리 넘어가고, 사람은 대기창을 다 쓴다. 관측 창이 다르다.
// 이 수는 상한이지 목표가 아니다. 사람 랩은 라포가 오르는 순간 끝난다.
// 창을 실시간으로 재면 기계가 바쁜 날 같은 창에 구가 덜 돌아 표본이 비고,
// 그러면 축이 아니라 부하가 빨간불을 낸다. 이 게이트는 그 이유로 세 번 빨갰다.
// 그래서 세계시계를 고정 폭으로 걷게 하고 창을 프레임 수로 센다. 창 안에 도는 구의 수가
// 기계 사정과 무관해진다. 대신 기계가 느리면 같은 창이 실시간으로는 더 오래 걸리므로
// 워치독을 그만큼 넉넉히 잡는다.
const STEP = 1 / 60;
const BOT_FRAMES = 48 * 60;
// 사람 랩은 라포가 오르면 끝난다. 그것은 확률이므로 창을 시간으로 잡으면 판 수가 그날의 몫이 된다.
// 실측으로 110 세계초에 여섯에서 일곱 판이었고, 게이즈 48퍼센트에 말걸기 55퍼센트면
// 일곱 판에서 한 번도 안 나올 확률이 12퍼센트다. 그만큼 이 게이트가 산출물과 무관하게 붉었다.
// 그래서 창을 판 수로 센다. 스무다섯 판이면 못 볼 확률이 0.05퍼센트다.
// 프레임 상한은 워치독을 위한 마지막 방패일 뿐이다.
const HAND_FRAMES = 400 * 60;
const HAND_ROUNDS = 25;
const POLL = 250;

const fails = [], notes = [];
const check = (n, ok, d) => (ok ? notes : fails).push(n + " " + d);
const sum = (o) => Object.values(o || {}).reduce((a, b) => a + b, 0);

let b;
try {
  b = await chromium.launch({ executablePath: EXE });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } });
  await pinClock(ctx, STEP);
  const p = await ctx.newPage();
  const errs = [];
  p.on("pageerror", (e) => errs.push(String(e)));
  p.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });

  // 의사소통과 악동이 만렙이라야 talked가 관측 가능한 빈도로 열린다. 3짜리 신규 저장으로는
  // 라포 축이 한 시간을 돌려도 한 번 안 뜬다. 주입은 판정식을 안 건드리고 도달 가능한 상태만 앞당긴다.
  const q = "?preset=maxed,veteran";
  await p.goto(BASE + q, { waitUntil: "load" });
  await p.evaluate(() => localStorage.clear());
  await p.reload({ waitUntil: "load" });
  await p.waitForTimeout(1200);
  await p.click("#go", { force: true });
  await p.waitForTimeout(1400);

  // 행인이 지나가야 말을 걸 수 있다. 도시 3이 gaze를 가장 자주 연다.
  await p.evaluate(() => { window.__gear().city = 3; });

  // 여기서부터 세계시계가 실시간을 안 본다. 창은 프레임 수로 센다.

  // 한 랩을 도는 동안 장부를 계속 읽는다. 구 경계를 따로 잡지 않아도 델타는 정확하다.
  // armOn은 표본이 열리는 상태다. 자동을 켜거나 끈 직후에는 직전 구의 값이 남아 있고,
  // 그것이 뒤집히는 순간이 새 랩의 첫 구가 커밋됐다는 유일한 증거다. 시계로 끊으면
  // 기계가 바쁜 날 구가 느려져 직전 랩의 값이 이번 랩의 표본으로 섞인다.
  const watch = async (span, clickPad, until, armOn, maxRounds) => {
    const startF = await p.evaluate(() => window.__frames());
    const base = await p.evaluate(() => ({ fans: window.__fans(), rap: window.__rapport() }));
    const rounds0 = await p.evaluate(() => Object.values(window.__record()).reduce((a, r) => a + r.saved + r.conceded, 0));
    /* 델타의 기준선은 표본이 열리는 순간에 다시 잡는다. 창을 열 때 잡으면 직전 랩의 마지막 구가
       아직 커밋되는 중이라 그 구의 몫이 이번 랩의 델타로 들어온다. 실측으로 봇 랩의 팔로워 증가가
       604로 잡혔는데 그것은 자동을 켜기 직전 사람 구의 몫이었다. */
    let ranTrue = 0, ranFalse = 0, stale = 0, armed = false, mark = null;
    while ((await p.evaluate(() => window.__frames())) - startF < span) {
      if (maxRounds) {
        const now = await p.evaluate(() => Object.values(window.__record()).reduce((a, r) => a + r.saved + r.conceded, 0));
        if (now - rounds0 >= maxRounds) break;
      }
      if (until) {
        const now = await p.evaluate(() => ({ fans: window.__fans(), rap: window.__rapport() }));
        if (until(base, now)) break;
      }
      if (clickPad) {
        const z = await p.$(".zone:not([disabled])");
        if (z) await z.click({ force: true });
      }
      const r = await p.evaluate(() => window.__botRan());
      if (!armed && r === armOn) {
        armed = true;
        mark = await p.evaluate(() => ({ fans: window.__fans(), rap: window.__rapport() }));
      }
      if (armed) { if (r === true) ranTrue += 1; else ranFalse += 1; } else stale += 1;
      await p.waitForTimeout(POLL);
    }
    const end = await p.evaluate(() => ({ fans: window.__fans(), rap: window.__rapport() }));
    const rounds1 = await p.evaluate(() => Object.values(window.__record()).reduce((a, r) => a + r.saved + r.conceded, 0));
    const from = mark || base;
    return { ranTrue, ranFalse, stale, armed, rounds: rounds1 - rounds0, dFans: end.fans - from.fans, dRap: 0, endRap: end.rap, baseRap: from.rap };
  };

  // 봇 랩. 크레딧을 먼저 채워야 자동 버튼이 상점 대신 자동을 켠다.
  await p.evaluate(() => { const bot = window.__bot(); bot.tier = 3; bot.ms = 3600000; });
  await p.click("#auto", { force: true });
  const bot = await watch(BOT_FRAMES, false, null, true);
  bot.dRap = sum(bot.endRap) - sum(bot.baseRap);

  // 표본이 한 번도 안 열렸으면 아래 세 축은 0을 재고 조용히 통과한다. 표본 0은 통과가 아니라 계기 사망이다.
  check("instrument:bot-sample-armed", bot.armed, "discarded " + bot.stale + " polls before the first bot round");
  check("bot-ran-observed", bot.ranTrue >= 3, "true " + bot.ranTrue + " false " + bot.ranFalse + " stale " + bot.stale);
  check("bot-ran-pure", bot.ranFalse === 0, "false " + bot.ranFalse);
  check("bot-fans-zero", bot.dFans === 0, "dFans " + bot.dFans);
  check("bot-rapport-zero", bot.dRap === 0, "dRapport " + bot.dRap);

  // 사람 랩. 자동을 끄고 같은 판을 손으로 친다. 대조군이 없으면 위 세 축은
  // 배선이 끊겨 아무것도 안 오르는 상태와 구분되지 않는다.
  await p.click("#auto", { force: true });
  // 라포는 talked가 나야 오르고 talked는 확률이다. 그것이 한 번 관측되면 표본이 찬 것이라
  // 더 돌 이유가 없다. 상한까지 못 채우면 계기가 표본을 못 모은 것이고 그때는 빨간불이 맞다.
  const hand = await watch(HAND_FRAMES, true, (b, n) => sum(n.rap) > sum(b.rap), false, HAND_ROUNDS);
  hand.dRap = sum(hand.endRap) - sum(hand.baseRap);

  check("instrument:hand-sample-armed", hand.armed, "discarded " + hand.stale + " polls before the first hand round");
  check("hand-ran-false", hand.ranFalse >= 3 && hand.ranTrue === 0, "true " + hand.ranTrue + " false " + hand.ranFalse + " stale " + hand.stale);
  check("hand-fans-positive", hand.dFans > 0, "dFans " + hand.dFans);
  // 라포는 행인이 지나가는 구에서만 오른다. 그 문이 열리는 빈도는 판 수가 정하므로,
  // 몇 판을 돌았는지를 먼저 적는다. 판이 없었으면 라포가 안 오른 것은 배선이 아니라 표본이다.
  check("instrument:hand-lap-played-enough-rounds", hand.rounds >= 8 || hand.dRap > 0, hand.rounds + " rounds in the window");
  check("hand-rapport-positive", hand.dRap > 0, "dRapport " + hand.dRap);

  check("console:no-errors", errs.length === 0, errs.slice(0, 3).join(" | ") || "clean");

  const LINE = String.fromCharCode(10);
  if (notes.length) console.log(notes.map((s) => "  ok   " + s).join(LINE));
  if (fails.length) console.log(fails.map((s) => "  FAIL " + s).join(LINE));
  console.log(fails.length ? "botwire FAIL " + fails.length : "botwire PASS");
  if (fails.length) process.exitCode = 1;
} finally {
  clearTimeout(t);
  if (b) await b.close();
}
