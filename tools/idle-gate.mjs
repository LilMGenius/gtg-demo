import { makeRng, buildSet, resolve, newKeeper, keeperAtLevel } from "../src/chain.mjs";

// 방치형에서 방치가 벌이면 안 된다. 훈련 없는 대조군은 손가락만 대신하므로,
// 켜 두고 자리를 비우면 레벨이 오르고 키커가 세지는데 스탯은 그대로 남는다.
// 그 상태가 실제로 어떻게 되는지는 스탯을 고정하고 레벨만 올려야 보인다.

import { autoTrain, trainStat, TRAINING_PRIORITY } from "../web/src/state/coach.mjs";
import { GROWABLE } from "../src/ledger.mjs";
import { readFileSync } from "node:fs";
import { COIN_DRILL } from "../web/src/state/wallet.mjs";

/* 방치해도 나빠지지 않는다는 축은 제품의 자동 훈련 사다리를 읽는다.
   스탯을 고정한 사다리는 제품이 아니라 훈련 없는 대조군이다. 그 하락도 따로 확인해야
   자동의 초록이 평평한 성장 곡선 때문이 아니라 훈련에서 왔음을 안다.
   문턱은 그대로 두고 축이 이름 붙인 관측 대상만 바로잡는다. */
/* 밸런스 계약: 판당 한 포인트로는 레벨 비례 키커를 따라가지 못한다.
   후보는 판당 2와 3이며 통과하는 가장 작은 값을 채택한다. 오프라인 적립은 고정한다.
   주 지표: 레벨 13의 자동과 같은 예산 손 훈련은 각각 레벨 1 이상이다.
   가드 A: 자동 마지막 값은 손 마지막 값보다 3 넘게 낮지 않다.
   가드 B: 자동 레벨 13은 balance BASE 레벨 30의 44.00 이하이다.
   가드 C: 인접 표본 변화량을 레벨 차이로 나눈다. 레벨당 하락 1.0 이하, 상승 8.0 이하이다.
   표본 레벨은 1, 3, 5, 8, 13이므로 간격은 2, 2, 3, 5다. 표본당 변화와 레벨당 변화는 다르다.
   가드 D: balance BASE 감시 결과 불변, growth와 tempo와 cause와 gym 초록.
   가드 E: COIN_DRILL은 24/N으로 나누어 만렙의 판당 환전을 24 골드로 유지한다.
   레벨마다 2000 시드와 다섯 슛, 기존 완전 입력을 사용한다.
   공통 대조군: 25.60 → 25.60 → 24.09 → 21.32 → 17.49.
   공통 세 포인트 참고선: 25.77 → 28.46 → 28.64 → 29.05 → 29.88.
   첫 연쇄 순서 후보 2 자동: 25.60 → 25.90 → 25.75 → 25.55 → 39.92.
   첫 연쇄 순서 후보 3 자동: 25.60 → 26.30 → 26.97 → 39.35 → 43.84.
   한계 효과 순서 후보 2 자동: 25.60 → 35.37 → 37.79 → 37.87 → 40.58.
   후보 2 손: 25.60 → 28.30 → 28.14 → 27.64 → 27.40.
   후보 3 자동: 25.60 → 37.35 → 39.91 → 41.01 → 43.10.
   후보 3 손: 25.60 → 29.01 → 29.46 → 29.80 → 31.99.
   손 사다리는 두 실행에서 같다. 첫 상승은 각각 레벨당 4.885와 5.875이므로 가드 C를 통과한다.
   두 후보 중 가장 작은 판당 두 포인트를 채택한다. */
const SEEDS = 2000;
const live = readFileSync(new URL("../web/src/main.mjs", import.meta.url), "utf8");
const reward = [...live.matchAll(/state\.points \+= (\d+);/g)];
if (reward.length !== 1) throw new Error("Ambiguous endSet reward");
const POINTS_PER_SET = Number(reward[0][1]);
const fails = [], notes = [];
const check = (n, ok, d) => (ok ? notes : fails).push(n + " " + d);
const F = (x) => Number(x).toFixed(2);

const base = Object.freeze(Object.assign(newKeeper(), Object.fromEntries(GROWABLE.map((k) => [k, 3]))));
const first = autoTrain(base, 2, () => 0.99);
check("coach:save-priority-before-lowest", first.spent === 2 && first.keeper[TRAINING_PRIORITY[0]] === 5 && first.lines.every(l => l.stat === TRAINING_PRIORITY[0]), JSON.stringify(first.lines));
check("coach:priority-covers-every-stat-once", TRAINING_PRIORITY.length === GROWABLE.length && new Set(TRAINING_PRIORITY).size === GROWABLE.length && GROWABLE.every(k => TRAINING_PRIORITY.includes(k)), TRAINING_PRIORITY.join(" -> "));
const next = autoTrain({ ...base, [TRAINING_PRIORITY[0]]: 10 }, 1, () => 0.99);
check("coach:capped-priority-advances", next.lines[0].stat === TRAINING_PRIORITY[1] && next.keeper[TRAINING_PRIORITY[1]] === 4, JSON.stringify(next.lines));
check("coach:input-is-unchanged", GROWABLE.every((k) => base[k] === 3), "frozen input retains all stats at 3");
const capped = Object.freeze(Object.assign({}, base, Object.fromEntries(GROWABLE.map((k) => [k, 10])), { diving: 9 }));
const finish = autoTrain(capped, 5, () => 0);
check("coach:cap-retains-unused-budget", finish.spent === 1 && finish.keeper.diving === 10, JSON.stringify(finish.lines) + ", remaining=" + (5 - finish.spent));
let emptyRolls = 0;
const empty = autoTrain(base, 0, () => { emptyRolls += 1; return 0; });
check("coach:zero-budget-does-not-roll", empty.spent === 0 && emptyRolls === 0 && empty.keeper === base, "spent=" + empty.spent + ", rolls=" + emptyRolls);
const manual = trainStat(base, TRAINING_PRIORITY[0], makeRng(19));
const automatic = autoTrain(base, 1, makeRng(19));
check("coach:manual-and-auto-share-growth", JSON.stringify(manual) === JSON.stringify(automatic), JSON.stringify(automatic.lines));

/* keeperAtLevel의 세 후보와 절반씩 나뉜 높은 칸/낮은 칸 선택을 재사용한다.
   배분량은 실제 endSet의 판당 보상을 읽으며 한 포인트마다 손 훈련과 같은 성장 굴림을 쓴다.
   세 포인트짜리 trained는 예산이 다른 참고선으로만 남긴다. */
function manualOnePoint(keeper, rng) {
  const pool = GROWABLE.filter(k => keeper[k] < 10);
  if (!pool.length) return keeper;
  const offer = [];
  while (offer.length < 3 && pool.length) offer.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
  const greedy = rng() < 0.5;
  let pick = offer[0];
  for (const k of offer) if (greedy ? keeper[k] > keeper[pick] : keeper[k] < keeper[pick]) pick = k;
  return trainStat(keeper, pick, rng).keeper;
}

// grow가 거짓이면 훈련 없는 대조군이다. 시작 스탯을 고정하고 레벨만 올린다.
const at = (lv, grow, stats) => {
  let saved = 0, shots = 0;
  for (let s = 0; s < SEEDS; s += 1) {
    const rng = makeRng(s + 90001);
    let k = grow === true ? keeperAtLevel(lv, makeRng(s + 7)) : Object.assign(newKeeper(), { level: lv });
    if (grow === "auto" || grow === "manual-one-point") {
      k = newKeeper();
      const trainingRng = makeRng(s + 7);
      for (let level = 2; level <= lv; level += 1) {
        k.level = level;
        for (let point = 0; point < POINTS_PER_SET; point += 1)
          k = grow === "auto" ? autoTrain(k, 1, trainingRng).keeper : manualOnePoint(k, trainingRng);
      }
    }
    if (stats) Object.assign(k, stats);
    for (const shot of buildSet(makeRng(s + 1), lv, 0)) {
      const r = resolve({ keeper: k, shot, rng, input: { dive: shot.side, errMs: 0, advance: 0, auto: false } });
      shots += 1;
      if (!r.conceded) saved += 1;
    }
  }
  return Number((saved / shots * 100).toFixed(2));
};

// 키커 강화는 레벨 13에서 상한에 닿는다. 그 너머는 난이도가 더 안 오르므로 13이 바닥이다.
const marginalAt = (level) => GROWABLE.map((stat, order) => {
  const before = at(level, false, { [stat]: 3 });
  const after = at(level, false, { [stat]: 6 });
  return { stat, order, before, after, delta: Number((after - before).toFixed(2)) };
}).sort((a, b) => b.delta - a.delta || a.order - b.order);
const marginal5 = marginalAt(5);
const marginal13 = marginalAt(13);
console.log('marginal level5 ' + JSON.stringify(marginal5));
console.log('marginal level13 ' + JSON.stringify(marginal13));
const measuredPriority = marginal13.map(row => row.stat);
check('coach:priority-matches-measured-marginal-value', JSON.stringify(TRAINING_PRIORITY) === JSON.stringify(measuredPriority), measuredPriority.join(' -> '));

const LEVELS = [1, 3, 5, 8, 13];
const idle = LEVELS.map((lv) => at(lv, false));
const trained = LEVELS.map((lv) => at(lv, true));
const auto = LEVELS.map((lv) => at(lv, "auto"));
const manualOne = LEVELS.map((lv) => at(lv, "manual-one-point"));

check("control", at(1, false) === idle[0], F(idle[0]));

// 세 포인트 참고선은 상승 여부만 본다. 실제 자동과 손 훈련은 같은 판당 예산으로 비교한다.
check("reference:three-points-per-level-rises", trained[trained.length - 1] > trained[0],
  trained.map(F).join(" -> "));

// 훈련 없는 대조군은 하락해야 한다. 그래야 자동 훈련의 이득을 구분한다.
check("control:untrained-decays", idle[idle.length - 1] < idle[0],
  idle.map(F).join(" -> ") + " (drop " + F(idle[0] - idle[idle.length - 1]) + ")");

console.log("levels " + LEVELS.join(" -> "));
for (const [name, ladder] of [["idle", idle], ["trained-three-points", trained], ["auto", auto], ["manual-one-point", manualOne]]) console.log("ladder " + name + " " + ladder.map(F).join(" -> "));

check("idle:does-not-decay", auto.at(-1) >= auto[0], auto.map(F).join(" -> "));
check("idle:auto-tracks-manual", auto.at(-1) >= manualOne.at(-1) - 3,
  F(auto.at(-1)) + " vs " + F(manualOne.at(-1)));

check("manual:does-not-decay", manualOne.at(-1) >= manualOne[0], manualOne.map(F).join(" -> "));
check("idle:ceiling", auto.at(-1) <= 44, F(auto.at(-1)) + " <= 44.00");
const steps = auto.slice(1).map((v, i) => ({ gap: LEVELS[i + 1] - LEVELS[i], delta: Number((v - auto[i]).toFixed(2)), perLevel: (v - auto[i]) / (LEVELS[i + 1] - LEVELS[i]) }));
check("idle:smoothness", steps.every(s => s.perLevel >= -1 && s.perLevel <= 8), "delta / levelGap in [-1, 8]: " + JSON.stringify(steps));
check("economy:training-gold-per-set", POINTS_PER_SET === 2 && POINTS_PER_SET * COIN_DRILL === 24, POINTS_PER_SET + " * " + COIN_DRILL + " = " + POINTS_PER_SET * COIN_DRILL);
const LINE = String.fromCharCode(10);
if (notes.length) console.log(notes.map((x) => "  ok   " + x).join(LINE));
if (fails.length) console.log(fails.map((x) => "  FAIL " + x).join(LINE));
console.log(fails.length ? "idle FAIL " + fails.length : "idle PASS");
if (fails.length) process.exitCode = 1;
