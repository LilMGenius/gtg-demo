import { chromium } from "playwright";
import { MOUTH_X } from "../web/src/render/units.mjs";

// 먹힌 공은 키커가 노린 자리에서 끝나야 한다. 종점을 0으로 모으면 어느 코너로 찼든
// 공이 매번 골문 한가운데에 서고, 그러면 그 구가 어디로 들어갔는지 화면이 말하지 않는다.
// 소스 주석이 그 규칙을 선언하고 tail.aimX로 구현해 두었는데 재는 자가 없었다.
// 골 게이트는 공이 골문 안에 보이는지만 잰다. 어느 자리인지는 묻지 않는다.

const EXE = process.env.LOCALAPPDATA + "/ms-playwright/chromium-1228/chrome-win64/chrome.exe";
// veteran은 첫 진입 개봉을 마친 저장이다. 개봉판이 화면을 덮은 채로는 이 자가
// 재려는 종점이 덮개 뒤에서 굴러 아무도 못 본다.
const BASE = "http://127.0.0.1:10310/web/index.html?preset=veteran&seed=";
const SEEDS = [11, 20, 33, 47, 58];
// 주어가 다르면 축도 다르다. 공이 혼자 골문으로 가는 갈래는 겨냥을 따라야 하고,
// 몸이 공을 데리고 들어가거나 몸 위로 굴려 보내는 갈래는 몸을 따라야 한다.
// 겨냥 축을 몸 갈래에 대면 그것은 유추로 만든 축이고, 멀쩡한 연출이 빨간불을 낸다.
const BALL_KINDS = ["talked", "distracted", "openGoalScored"];
const BODY_KINDS = ["carriedIn", "downed"];
const KINDS = BALL_KINDS.concat(BODY_KINDS).concat(["gloveGone"]);
// 채취는 잠이 아니라 프레임으로 잡는다. 잠으로 잡으면 그날의 부하가 시점을 정한다.
const STEP = 1 / 60;
const TAIL_STEPS = 31;
/* 서른 판을 각각 새 컨텍스트에서 연다. 여섯 사건에 다섯 시드이고 판마다 페이지를 띄우고
   다이빙이 실제로 몸을 내보낼 때까지 기다린다. 300초는 그 일의 실측 소요와 같은 자리라
   기계가 조금만 바빠도 자기 사망 시각에 먼저 닿았다. 재는 양을 줄이면 축이 약해지므로
   자에게 시간을 준다. 러너는 이 수를 소스에서 읽어 여유를 얹는다. */
const t = setTimeout(() => { console.log("WATCHDOG"); process.exit(1); }, 600000);
t.unref();

const fails = [], notes = [];
const check = (n, ok, d) => (ok ? notes : fails).push(n + " " + d);
const LINE = String.fromCharCode(10);

let b;
try {
  b = await chromium.launch({ executablePath: EXE });
  const rows = {};
  for (const k of KINDS) {
    rows[k] = [];
    for (const seed of SEEDS) {
      const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } });
      const p = await ctx.newPage();
      await p.goto(BASE + seed, { waitUntil: "load" });
      await p.waitForTimeout(1200);
      await p.click("#go", { force: true });
      await p.waitForTimeout(1400);
      await p.evaluate((s) => window.__fixedStep(s), STEP);
      const at = async (n) => p.waitForFunction((m) => window.__frames() >= m, n, { timeout: 20000 });
      // 다이빙은 대기 상태에서만 먹는다. 잠으로 그 순간을 맞추려 하면 그날의 부하가 맞추고,
      // 안 맞은 날은 키가 조용히 무시되어 키퍼가 가운데 선 채로 측정된다.
      await p.waitForSelector(".zone:not([disabled])", { timeout: 15000 });
      await p.keyboard.press("ArrowLeft");
      // 다이빙은 대기창이 열린 순간이 아니라 런업과 비행의 앞부분이 지난 뒤에 시작한다.
      // 프레임 수로 끊으면 그 전에 사건을 걸어 키퍼가 가운데 선 채로 채취된다. 실측으로
      // 42프레임 뒤 키퍼 x가 다섯 시드 모두 0.00이었다. 몸이 실제로 나갔는지를 기다린다.
      // 문턱 0.8은 뻗는 폭의 하한 1.05의 3분의 2다. 0.2로 두면 넘자마자 찍혀 뻗기 초반이 잡힌다.
      await p.waitForFunction(() => Math.abs(window.__poseVis().pos[0]) > 0.8, null, { timeout: 20000 });
      const pre = await p.evaluate(() => window.__poseVis());
      // 꼬리 창은 사건이 걸린 프레임에서 센다. 라운드 시작에서 세면 다이빙을 기다린 만큼 꼬리가 짧아진다.
      const actF = await p.evaluate(() => window.__frames());
      await p.evaluate((kk) => window.__act(kk), k);
      await at(actF + TAIL_STEPS);
      const aim = await p.evaluate(() => window.__aim());
      const ball = await p.evaluate(() => window.__ballPos());
      const pose = await p.evaluate(() => window.__poseVis());
      rows[k].push({ seed, aim, x: ball.x, kx: pose.pos[0], dive: pre.pos[0] });
      await ctx.close();
    }
  }

  // 대조군. 시드마다 겨냥이 실제로 갈리지 않으면 아래 축들은 아무것도 안 잰다.
  const aims = rows[KINDS[0]].map((r) => r.aim);
  const span = Math.max(...aims) - Math.min(...aims);
  check("control:aims-actually-differ", span > 0.5, "aim span " + span.toFixed(2) + " over " + SEEDS.length + " seeds");

  // 다이빙이 실제로 일어나지 않았으면 아래 몸 축은 산출물이 아니라 채취 절차를 재는 것이다.
  const dived = Math.max(...KINDS.map((k) => Math.max(...rows[k].map((r) => Math.abs(r.dive)))));
  check("control:the-dive-actually-moved-the-keeper", dived > 0.3, "farthest keeper before the event " + dived.toFixed(2));

  for (const k of KINDS) {
    for (const r of rows[k]) console.log("  " + k + " seed " + r.seed + " aim " + r.aim.toFixed(2) + " ball " + r.x.toFixed(2) + " keeper " + r.kx.toFixed(2) + " dive " + r.dive.toFixed(2));
  }

  for (const k of BALL_KINDS) {
    const set = rows[k];
    const far = Math.max(...set.map((r) => Math.abs(r.x)));
    // 한가운데로 모이지 않는다. 종점이 0으로 굳으면 여기서 걸린다.
    check("aim:" + k + "-is-not-collapsed-to-centre", far > 0.5, "farthest " + far.toFixed(2));
    // 노린 쪽으로 간다. 반대쪽에서 끝나면 어느 코너로 갔는지가 거꾸로 읽힌다.
    const wrong = set.filter((r) => Math.abs(r.aim) > 0.3 && Math.sign(r.x) !== Math.sign(r.aim));
    check("aim:" + k + "-keeps-the-side", wrong.length === 0, wrong.map((r) => r.seed).join(", ") || "every side matches");
    // 더 바깥을 노린 구가 더 바깥에서 끝난다. 다만 회차마다 종점에 편차를 넣었으므로,
    // 겨냥 차이가 그 편차보다 작은 두 시드는 순서를 물을 수 없다. 실측으로 겨냥이 0.08 떨어진
    // 두 시드에서 공이 0.22 어긋났고, 그것은 순서가 뒤집힌 것이 아니라 분해능 밖이다.
    // 겨냥이 0.4 넘게 벌어진 쌍만 묻는다.
    const byAim = set.slice().sort((a, c) => a.aim - c.aim);
    let breaks = 0, pairs = 0;
    for (let i = 0; i < byAim.length; i++) for (let j = i + 1; j < byAim.length; j++) {
      if (byAim[j].aim - byAim[i].aim <= 0.4) continue;
      pairs += 1;
      if (byAim[j].x < byAim[i].x) breaks += 1;
    }
    check("aim:" + k + "-keeps-the-order", breaks === 0 && pairs > 0, breaks + " inversions over " + pairs + " resolvable pairs");
  }

  for (const k of BODY_KINDS) {
    const set = rows[k];
    // 몸을 따라간다는 것은 몸 곁에서 끝난다는 뜻이다. 1.0은 키퍼 반폭에 공 지름을 더한 정도다.
    const gap = Math.max(...set.map((r) => Math.abs(r.x - r.kx)));
    check("body:" + k + "-ball-rests-by-the-keeper", gap < 1.0, "farthest gap " + gap.toFixed(2));
    // 그리고 그 몸이 가운데 서 있으면 안 된다. 뛴 쪽으로 누워 있어야 어느 쪽 구였는지가 읽힌다.
    const mid = Math.max(...set.map((r) => Math.abs(r.kx)));
    check("body:" + k + "-keeper-is-not-at-centre", mid > 0.3, "farthest keeper " + mid.toFixed(2));
  }

  // 먹힌 공은 어느 갈래로 들어갔든 골망 안에 서야 한다. 자막만 먹혔다고 말하고 그림이
  // 아니라고 말하면 그 한 장은 사건을 증명하지 못한다. 입구 한계는 units.mjs가 소유한다.
  for (const k of KINDS) {
    const out = rows[k].filter((r) => Math.abs(r.x) > MOUTH_X);
    const far = Math.max(...rows[k].map((r) => Math.abs(r.x)));
    check("frame:" + k + "-ball-stays-inside-the-mouth", out.length === 0, "farthest " + far.toFixed(2) + " limit " + MOUTH_X + (out.length ? " seeds " + out.map((r) => r.seed).join(",") : ""));
  }

  if (notes.length) console.log(notes.map((x) => "  ok   " + x).join(LINE));
  if (fails.length) console.log(fails.map((x) => "  FAIL " + x).join(LINE));
  console.log(fails.length ? "aim FAIL " + fails.length : "aim PASS");
  if (fails.length) process.exitCode = 1;
} finally {
  clearTimeout(t);
  if (b) await b.close();
}
