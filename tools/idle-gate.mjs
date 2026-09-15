import { makeRng, buildSet, resolve, newKeeper, keeperAtLevel } from "../src/chain.mjs";

// 방치형에서 방치가 벌이면 안 된다. 훈련 없는 대조군은 손가락만 대신하므로,
// 켜 두고 자리를 비우면 레벨이 오르고 키커가 세지는데 스탯은 그대로 남는다.
// 그 상태가 실제로 어떻게 되는지는 스탯을 고정하고 레벨만 올려야 보인다.

import { autoTrain, trainStat, TRAINING_PRIORITY } from "../web/src/state/coach.mjs";
import { GROWABLE } from "../src/ledger.mjs";

/* 방치해도 나빠지지 않는다는 축은 제품의 자동 훈련 사다리를 읽는다.
   스탯을 고정한 사다리는 제품이 아니라 훈련 없는 대조군이다. 그 하락도 따로 확인해야
   자동의 초록이 평평한 성장 곡선 때문이 아니라 훈련에서 왔음을 안다.
   문턱은 그대로 두고 축이 이름 붙인 관측 대상만 바로잡는다. */
const SEEDS = 2000;
const fails = [], notes = [];
const check = (n, ok, d) => (ok ? notes : fails).push(n + " " + d);
const F = (x) => Number(x).toFixed(2);

const base = Object.freeze(Object.assign(newKeeper(), Object.fromEntries(GROWABLE.map((k) => [k, 3]))));
const first = autoTrain(base, 2, () => 0.99);
check("coach:save-priority-before-lowest", first.spent === 2 && first.keeper.judgement === 5 && first.lines.every(l => l.stat === "judgement"), JSON.stringify(first.lines));
check("coach:priority-covers-every-stat-once", TRAINING_PRIORITY.length === GROWABLE.length && new Set(TRAINING_PRIORITY).size === GROWABLE.length && GROWABLE.every(k => TRAINING_PRIORITY.includes(k)), TRAINING_PRIORITY.join(" -> "));
const next = autoTrain({ ...base, judgement: 10 }, 1, () => 0.99);
check("coach:capped-priority-advances", next.lines[0].stat === "reflex" && next.keeper.reflex === 4, JSON.stringify(next.lines));
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
   배분량은 실제 endSet처럼 레벨마다 한 포인트이고 성장 굴림도 손 훈련과 같다.
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
const at = (lv, grow) => {
  let saved = 0, shots = 0;
  for (let s = 0; s < SEEDS; s += 1) {
    const rng = makeRng(s + 90001);
    let k = grow === true ? keeperAtLevel(lv, makeRng(s + 7)) : Object.assign(newKeeper(), { level: lv });
    if (grow === "auto" || grow === "manual-one-point") {
      k = newKeeper();
      const trainingRng = makeRng(s + 7);
      for (let level = 2; level <= lv; level += 1) {
        k.level = level;
        k = grow === "auto" ? autoTrain(k, 1, trainingRng).keeper : manualOnePoint(k, trainingRng);
      }
    }
    for (const shot of buildSet(makeRng(s + 1), lv, 0)) {
      const r = resolve({ keeper: k, shot, rng, input: { dive: shot.side, errMs: 0, advance: 0, auto: false } });
      shots += 1;
      if (!r.conceded) saved += 1;
    }
  }
  return Number((saved / shots * 100).toFixed(2));
};

// 키커 강화는 레벨 13에서 상한에 닿는다. 그 너머는 난이도가 더 안 오르므로 13이 바닥이다.
const LEVELS = [1, 3, 5, 8, 13];
const idle = LEVELS.map((lv) => at(lv, false));
const trained = LEVELS.map((lv) => at(lv, true));
const auto = LEVELS.map((lv) => at(lv, "auto"));
const manualOne = LEVELS.map((lv) => at(lv, "manual-one-point"));

check("control", at(1, false) === idle[0], F(idle[0]));

// 세 포인트 참고선은 상승 여부만 본다. 실제 자동과 손 훈련은 같은 한 포인트로 비교한다.
check("reference:three-points-per-level-rises", trained[trained.length - 1] > trained[0],
  trained.map(F).join(" -> "));

// 훈련 없는 대조군은 하락해야 한다. 그래야 자동 훈련의 이득을 구분한다.
check("control:untrained-decays", idle[idle.length - 1] < idle[0],
  idle.map(F).join(" -> ") + " (drop " + F(idle[0] - idle[idle.length - 1]) + ")");

console.log("levels " + LEVELS.join(" -> "));
for (const [name, ladder] of [["idle", idle], ["trained-three-points", trained], ["auto", auto], ["manual-one-point", manualOne]]) console.log("ladder " + name + " " + ladder.map(F).join(" -> "));

check("idle:does-not-decay", auto.at(-1) >= auto[0], auto.map(F).join(" -> "));
check("idle:auto-tracks-manual", Math.abs(auto.at(-1) - manualOne.at(-1)) <= 3,
  F(auto.at(-1)) + " vs " + F(manualOne.at(-1)));

const LINE = String.fromCharCode(10);
if (notes.length) console.log(notes.map((x) => "  ok   " + x).join(LINE));
if (fails.length) console.log(fails.map((x) => "  FAIL " + x).join(LINE));
console.log(fails.length ? "idle FAIL " + fails.length : "idle PASS");
if (fails.length) process.exitCode = 1;
