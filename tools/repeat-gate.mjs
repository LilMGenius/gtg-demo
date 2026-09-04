import { chromium } from "playwright";

// 같은 사건이 회차마다 같은 그림으로 끝나면 두 번째부터는 결과만 남고 사건은 안 보인다.
// pose 게이트는 사건 종류끼리 갈리는지만 잰다. 같은 종류를 여러 번 찍어 회차 사이를 재는 자는 없었다.
// 다양성만 걸면 무작위가 붕괴로 샌다. 회차끼리 달라야 하고, 각 회차가 여전히 그 사건으로 읽혀야 한다.

const EXE = process.env.LOCALAPPDATA + "/ms-playwright/chromium-1228/chrome-win64/chrome.exe";
const BASE = "http://127.0.0.1:10310/web/index.html?seed=20";
const KINDS = ["save", "catch", "carriedIn", "downed", "lost", "openGoalScored", "gloveGone", "spill", "rebound", "reboundMiss", "charge", "beat", "talked", "distracted", "skied"];
/* 회차 다섯이면 쌍이 열이다. 셋일 때는 쌍이 셋뿐이라 최솟값도 중앙값도 실행마다 흔들렸고,
   산출물이 그대로인데 빨간 종류가 실행마다 갈렸다. 실측으로 한 실행은 save와 beat,
   다음 실행은 catch였고 그 사이 코드는 안 바뀌었다. 바를 만드는 대조군 중앙값도 두 배 움직였다.
   쌍을 늘리는 것은 문턱을 낮추는 것이 아니다. 처치군은 최솟값이라 쌍이 늘수록 낮아져 더 엄해지고,
   대조군은 중앙값이라 쌍이 늘수록 잡음을 더 잘 대표한다. */
const ROUNDS = 5;
// 채취 시점은 잠이 아니라 프레임 수로 잡는다. 폭은 60분의 1초다.
// 다이빙 42프레임은 0.700초, 꼬리 31프레임은 0.517초로 이전의 잠과 거의 같은 자리다.
// 다른 것은 그 자리가 기계 사정과 무관하게 매번 같다는 점이다.
const STEP = 1 / 60;
// 시작 버튼을 누르고 판이 자리를 잡기까지. 90프레임은 1.5초로, 이전에 잠으로 기다리던 값과 같다.
const LEAD_STEPS = 90;
const DIVE_STEPS = 42;
const TAIL_STEPS = 31;
// 바는 대조군 중앙값의 이 배수다. 근거는 아래 대조군 계산 자리에 적혀 있다.
const FLOOR = 3;
// 종류 간 분리는 pose 게이트의 바를 그대로 쓴다. 편차를 넣다가 이 선을 넘으면
// 다양성이 아니라 사건이 다른 사건으로 읽히기 시작한 것이다.
const KIND_BAR = 0.35;
// 열다섯 종류 곱하기 세 회차. 한 채취가 4초대이므로 넉넉히 잡는다.
// 열다섯 종류에 처치군과 대조군 다섯 회차씩. 한 채취가 4초대라 앞의 600초로는 중간에 끊긴다.
const t = setTimeout(() => { console.log("WATCHDOG"); process.exit(1); }, 900000);
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
        // 시작 버튼이 생겼는지를 기다린다. 잠으로 기다리면 안 뜬 날 클릭이 조용히 흘러간다.
        await p.waitForSelector("#go", { timeout: 15000 });
        // 세계시계는 판이 시작되기 전에 고정한다. 시작 뒤에 고정하면 그 사이 몇 프레임이
        // 지났는지가 실시간으로 정해져, 사건을 거는 순간 공이 비행 어디쯤인지가 회차마다 달라진다.
        // 그 차이는 tail.from으로 들어가 종점을 흔든다. 실측으로 흘린 공의 대조군 잡음이
        // 0.056이었고 나머지 사건의 중앙값은 0.0059였다.
        await p.evaluate((s) => window.__fixedStep(s), STEP);
        const at = async (n) => p.waitForFunction((m) => window.__frames() >= m, n, { timeout: 20000 });
        await p.click("#go", { force: true });
        const base = await p.evaluate(() => window.__frames());
        await at(base + LEAD_STEPS);
        await p.keyboard.press("ArrowLeft");
        // 사건을 걸 프레임과 멈출 프레임을 페이지에 맡긴다. 밖에서 폴링해 걸면 한두 프레임 늦고,
        // 그 순간 빠르게 흔들리는 값은 그만큼 어긋나 설계된 편차와 섞인다.
        const actAt = base + LEAD_STEPS + DIVE_STEPS;
        const stopAt = actAt + TAIL_STEPS;
        await p.evaluate(([a, kk, s]) => window.__plan(a, kk, s), [actAt, k, stopAt]);
        await at(stopAt);
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
  // 처치군은 최솟값을 쓴다. 가장 닮은 두 회차가 바를 넘어야 그 사건이 매번 다르다고 말할 수 있다.
  // 대조군은 중앙값을 쓴다. 잡음을 대표해야 하는데 쌍 하나짜리 추정은 한 번 튀면 바가 같이 튄다.
  // 실측: 리바운드가 한 실행에서 0.1283 대 필요 0.0936으로 통과하고 다음 실행에서
  // 0.0902 대 0.0935로 떨어졌다. 산출물은 그대로였고 움직인 것은 대조군 한 쌍이었다.
  const mid = (set, rounds) => {
    const out = {};
    for (const k of KINDS) {
      const ds = [];
      for (let i = 0; i < rounds; i++) for (let j = i + 1; j < rounds; j++) ds.push(dist(sceneVec(set[k][i]), sceneVec(set[k][j])));
      ds.sort((a, c) => a - c);
      out[k] = ds[(ds.length - 1) >> 1];
    }
    return out;
  };
  const shots = await sample("", ROUNDS);
  /* 대조군도 같은 회차 수를 쓰고 같은 통계를 쓴다. 처치군은 가장 닮은 쌍을 보는데
     대조군만 중앙값을 보면 두 수가 같은 것을 안 재고, 회차를 늘릴수록 처치군만 낮아져
     산출물이 그대로인데 바가 저절로 높아진다. 실측으로 회차를 셋에서 다섯으로 늘리자
     같은 코드에서 빨간 종류가 둘에서 아홉으로 늘었다. 둘 다 가장 닮은 쌍으로 맞댄다. */
  const ctl = await sample("&vary=0", ROUNDS);
  const ctlSpread = low(ctl, ROUNDS);
  const spread = low(shots, ROUNDS);
  const ctlMax = Math.max(...KINDS.map((k) => ctlSpread[k]));
  const ctlWho = KINDS.find((k) => ctlSpread[k] === ctlMax);
  // 바는 대조군에서 유도한다. 다만 열다섯 개의 최댓값은 극단값이라 실행마다 크게 튄다.
  // 실측으로 0.031과 0.056과 0.067이 나왔고 그때마다 바가 0.062에서 0.133까지 움직여,
  // 산출물이 그대로인데 판정이 바뀌었다. 중앙값은 한 쌍이 튀어도 안 흔들린다.
  // 세 배인 이유는 대조군이 쌍 하나짜리 추정이고, 그 두 배까지는 잡음이 닿을 수 있어서다.
  const ctlSorted = KINDS.map((k) => ctlSpread[k]).sort((a, c) => a - c);
  const ctlMid = ctlSorted[(ctlSorted.length - 1) >> 1];
  for (const k of KINDS) console.log("  control " + k + " " + ctlSpread[k].toFixed(4));
  console.log("  control median " + ctlMid.toFixed(4) + "  max " + ctlMax.toFixed(4));
  // 계기가 먼저다. 편차를 끈 두 회차가 종류 간 분리보다 더 벌어지면 이 채취는 재현되지 않는 것이고,
  // 그 위에서 잰 편차는 설계가 아니라 프레임 타이밍이다. 표본 실패와 산출물 실패를 같은 빨간불로 내보내면
  // 다음 랩이 멀쩡한 연출을 고치러 간다. 그래서 계기가 죽었으면 여기서 끝낸다.
  const alive = ctlMax < KIND_BAR;
  check("instrument:capture-is-reproducible", alive, ctlMax.toFixed(3) + " worst " + ctlWho + " must stay under " + KIND_BAR);
  if (alive) {
    // 잡음은 사건마다 다르다. 실측으로 catch는 0.0000이고 spill은 0.0461이라 사십 배 차이다.
    // 전역 바 하나로 재면 조용한 사건에는 너무 높고 시끄러운 사건에는 너무 낮다.
    // 각 사건을 제 잡음과 맞댄다. 다만 대조군이 0에 가까운 사건은 어떤 움직임도 통과하므로
    // 중앙값에서 나온 바닥을 같이 건다.
    const floorAll = ctlMid * FLOOR;
    console.log("  floor " + floorAll.toFixed(4));
    // 편차를 켰을 때 실제로 더 벌어지는가. 한 종류라도 대조군보다 조용하면 그 종류에는 편차가 안 닿은 것이다.
    const deaf = KINDS.filter((k) => spread[k] <= ctlSpread[k]);
    check("control:variation-reaches-every-kind", deaf.length === 0, deaf.join(", ") || "all fifteen move more with it on");
    for (const k of KINDS) {
      const need = Math.max(ctlSpread[k] * FLOOR, floorAll);
      check("varies:" + k, spread[k] >= need, spread[k].toFixed(4) + " need " + need.toFixed(4));
    }
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
