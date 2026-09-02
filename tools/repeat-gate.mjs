import { chromium } from "playwright";

// 같은 사건이 회차마다 같은 그림으로 끝나면 두 번째부터는 결과만 남고 사건은 안 보인다.
// pose 게이트는 사건 종류끼리 갈리는지만 잰다. 같은 종류를 여러 번 찍어 회차 사이를 재는 자는 없었다.
// 다양성만 걸면 무작위가 붕괴로 샌다. 회차끼리 달라야 하고, 각 회차가 여전히 그 사건으로 읽혀야 한다.

const EXE = process.env.LOCALAPPDATA + "/ms-playwright/chromium-1228/chrome-win64/chrome.exe";
const BASE = "http://127.0.0.1:10310/web/index.html?seed=20";
const KINDS = ["save", "catch", "carriedIn", "downed", "lost", "openGoalScored", "gloveGone", "spill", "rebound", "reboundMiss", "charge", "beat", "talked", "distracted", "skied"];
// 회차 셋이면 쌍이 셋이라 최솟값이 우연히 한 쌍만 가까운 경우를 걸러낸다. 둘이면 쌍이 하나라 그게 안 된다.
const ROUNDS = 3;
// 채취 시점은 잠이 아니라 프레임 수로 잡는다. 폭은 60분의 1초다.
// 다이빙 42프레임은 0.700초, 꼬리 31프레임은 0.517초로 이전의 잠과 거의 같은 자리다.
// 다른 것은 그 자리가 기계 사정과 무관하게 매번 같다는 점이다.
const STEP = 1 / 60;
const DIVE_STEPS = 42;
const TAIL_STEPS = 31;
// 바를 상수로 적으면 그 수가 무엇 위에 서 있는지를 아무도 모른다. 대조군에서 유도한다.
// 편차를 끈 상태로 같은 절차를 지나도 회차는 조금씩 벌어진다. 520ms는 연출이 아직 움직이는 중이라
// 프레임 타이밍이 몸과 공을 다른 자리에 놓기 때문이다. 그 최대치의 두 배를 바로 쓴다.
// 두 배인 이유는 대조군이 쌍 하나짜리 추정이라 한 번 더 뽑으면 그만큼 커질 수 있어서다.
const FLOOR = 2;
// 종류 간 분리는 pose 게이트의 바를 그대로 쓴다. 편차를 넣다가 이 선을 넘으면
// 다양성이 아니라 사건이 다른 사건으로 읽히기 시작한 것이다.
const KIND_BAR = 0.35;
// 열다섯 종류 곱하기 세 회차. 한 채취가 4초대이므로 넉넉히 잡는다.
const t = setTimeout(() => { console.log("WATCHDOG"); process.exit(1); }, 600000);
t.unref();

// 회차가 다른가를 물을 때의 주어는 사건마다 다르다. 선방과 실점은 키퍼가 주어이고,
// 리바운드와 넘긴 공은 공이 주어라 키퍼 관절만 보면 아무 일도 안 일어난 것으로 읽힌다.
// 그래서 편차는 관절에 키퍼 발밑과 공 좌표를 붙인 벡터로 잰다.
// 좌표는 미터이고 관절 벡터는 척추 길이로 나눈 무차원이라 자릿수가 다르다.
// 경기장 반폭 3미터로 나눠 같은 자릿수에 올린다.
const FIELD = 3;
const sceneVec = (s) => s.v.concat([s.pos[0] / FIELD, s.pos[1] / FIELD, s.pos[2] / FIELD, s.ball.x / FIELD, s.ball.y / FIELD, s.ball.z / FIELD]);

const dist = (a, b) => {
  let s = 0;
  for (let i = 0; i < a.length; i++) { const d = a[i] - b[i]; s += d * d; }
  return Math.sqrt(s);
};
const mean = (vs) => {
  const m = new Array(vs[0].length).fill(0);
  for (const v of vs) for (let i = 0; i < v.length; i++) m[i] += v[i] / vs.length;
  return m;
};

const fails = [], notes = [];
const check = (n, ok, d) => (ok ? notes : fails).push(n + " " + d);
const LINE = String.fromCharCode(10);

let b;
try {
  b = await chromium.launch({ executablePath: EXE });
  // 한 벌을 통째로 채취한다. 처치군과 대조군이 같은 절차를 지나야 둘의 차이가 편차 하나로 좁혀진다.
  const sample = async (q, rounds) => {
    const got = {};
    for (const k of KINDS) {
      got[k] = [];
      for (let r = 0; r < rounds; r++) {
        // 회차마다 새 페이지다. 한 페이지에서 이어 찍으면 앞 사건이 남긴 하트와 벗겨진 장갑이
        // 다음 회차의 몸을 바꾸고, 그 차이가 편차로 잡혀 거짓 초록이 된다.
        const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } });
        const p = await ctx.newPage();
        await p.goto(BASE + q, { waitUntil: "load" });
        await p.waitForTimeout(1200);
        await p.click("#go", { force: true });
        await p.waitForTimeout(1500);
        // 잠으로 시점을 잡으면 그 사이 몇 프레임이 지났는지가 그날의 부하로 정해진다.
        // 세계시계를 고정 폭으로 걷게 하고 프레임을 세면, 사건 이후 흐른 시간이 회차마다 같아진다.
        // 다이빙도 이 안에 넣는다. 꼬리가 시작할 때의 몸이 흔들리면 종점도 같이 흔들린다.
        await p.evaluate((s) => window.__fixedStep(s), STEP);
        const at = async (n) => p.waitForFunction((m) => window.__frames() >= m, n, { timeout: 20000 });
        const base = await p.evaluate(() => window.__frames());
        await p.keyboard.press("ArrowLeft");
        await at(base + DIVE_STEPS);
        await p.evaluate((kk) => window.__act(kk), k);
        await at(base + DIVE_STEPS + TAIL_STEPS);
        const shot = await p.evaluate(() => window.__poseVis());
        shot.ball = await p.evaluate(() => window.__ballPos());
        got[k].push(shot);
        await ctx.close();
      }
    }
    return got;
  };
  const low = (set, rounds) => {
    const out = {};
    for (const k of KINDS) {
      let lo = Infinity;
      for (let i = 0; i < rounds; i++) for (let j = i + 1; j < rounds; j++) lo = Math.min(lo, dist(sceneVec(set[k][i]), sceneVec(set[k][j])));
      out[k] = lo;
    }
    return out;
  };
  const shots = await sample("", ROUNDS);
  // 대조군은 쌍 하나면 충분하다. 편차를 끈 상태에서 두 회차가 얼마나 벌어지는지만 알면 된다.
  const ctl = await sample("&vary=0", 2);
  const ctlSpread = low(ctl, 2);
  const spread = low(shots, ROUNDS);
  const ctlMax = Math.max(...KINDS.map((k) => ctlSpread[k]));
  const ctlWho = KINDS.find((k) => ctlSpread[k] === ctlMax);
  // 계기가 먼저다. 편차를 끈 두 회차가 종류 간 분리보다 더 벌어지면 이 채취는 재현되지 않는 것이고,
  // 그 위에서 잰 편차는 설계가 아니라 프레임 타이밍이다. 표본 실패와 산출물 실패를 같은 빨간불로 내보내면
  // 다음 랩이 멀쩡한 연출을 고치러 간다. 그래서 계기가 죽었으면 여기서 끝낸다.
  const alive = ctlMax < KIND_BAR;
  check("instrument:capture-is-reproducible", alive, ctlMax.toFixed(3) + " worst " + ctlWho + " must stay under " + KIND_BAR);
  if (alive) {
    const SPREAD_BAR = ctlMax * FLOOR;
    console.log("  bar " + SPREAD_BAR.toFixed(4));
    // 편차를 켰을 때 실제로 더 벌어지는가. 한 종류라도 대조군보다 조용하면 그 종류에는 편차가 안 닿은 것이다.
    const deaf = KINDS.filter((k) => spread[k] <= ctlSpread[k]);
    check("control:variation-reaches-every-kind", deaf.length === 0, deaf.join(", ") || "all fifteen move more with it on");
    for (const k of KINDS) check("varies:" + k, spread[k] >= SPREAD_BAR, spread[k].toFixed(4));
  }



  // 회차 간 최소 거리. 0에 가까우면 그 사건은 매번 같은 그림으로 끝난다.
  for (const k of KINDS.slice().sort((a, c) => spread[a] - spread[c])) console.log("  spread " + k + " " + spread[k].toFixed(4));

  // 정합성. 회차를 흔들어도 각 회차가 여전히 그 사건으로 읽혀야 한다.
  // 바는 pose 게이트가 이미 쓰는 종류 간 분리 0.35다. 새 수를 지어내면 두 게이트가 서로 다른 것을 재게 된다.
  // 중심끼리가 아니라 회차끼리 잰다. 회차 셋으로 만든 평균은 제 점이 제 중심을 끌어당긴다.
  let near = Infinity, pair = "";
  for (const k of KINDS) for (const j of KINDS) {
    if (j === k) continue;
    for (const a of shots[k]) for (const c of shots[j]) {
      const d = dist(a.v, c.v);
      if (d < near) { near = d; pair = k + " vs " + j; }
    }
  }
  check("stays:events-still-separate", near >= KIND_BAR, near.toFixed(3) + " closest " + pair + " bar " + KIND_BAR);


  if (notes.length) console.log(notes.map((x) => "  ok   " + x).join(LINE));
  if (fails.length) console.log(fails.map((x) => "  FAIL " + x).join(LINE));
  console.log(fails.length ? "repeat FAIL " + fails.length : "repeat PASS");
  if (fails.length) process.exitCode = 1;
} finally {
  clearTimeout(t);
  if (b) await b.close();
}