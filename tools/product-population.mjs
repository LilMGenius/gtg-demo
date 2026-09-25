import { newKeeper, keeperAtLevel, makeRng, rollForm, buildSet, resolve, positionInput } from './position-pop.mjs';
import { GROWABLE } from '../src/ledger.mjs';
import { autoTrain, trainStat, TRAINING_PRIORITY } from '../web/src/state/coach.mjs';
// 기존 product-pop의 모집단을 공유한다. 기존 씨앗과 훈련 예산 및 몸 분포를 보존한다.
export function population(policy, level, rng) {
  if (policy === 'reference') return keeperAtLevel(level, rng);
  let keeper = newKeeper();
  for (let lv = 2; lv <= level; lv++) {
    keeper.level = lv;
    if (policy === 'untrained') continue;
    if (policy === 'coach') keeper = autoTrain(keeper, 2, rng).keeper;
    else for (let p = 0; p < 2; p++) {
      const pool = GROWABLE.filter(s => keeper[s] < 10);
      if (!pool.length) break;
      let pick = pool[0];
      if (policy === 'fixed-order') pick = TRAINING_PRIORITY.find(s => keeper[s] < 10);
      else if (policy === 'random') pick = pool[Math.floor(rng() * pool.length)];
      else for (const s of pool) if (policy === 'lowest' ? keeper[s] < keeper[pick] : keeper[s] > keeper[pick]) pick = s;
      keeper = trainStat(keeper, pick, rng).keeper;
    }
  }
  keeper.height = 178 + Math.floor(rng() * 21);
  keeper.weight = 74 + Math.floor(rng() * 21);
  return keeper;
}

// 인접 훈련 단계는 같은 현재 상대를 받는다. 몸과 기복도 고정해 훈련 이외의 차이를 제거한다.
export function pairedTrainingStep(policy, lower, upper, balls) {
  let tested = 0, before = 0, after = 0, n10 = 0, n01 = 0;
  // 기존 product-pop의 소수 간격과 다섯 슛 묶음을 그대로 쓴다.
  for (let s = 0; s < balls / 5; s++) {
    const seed = 1000003 + s + upper * 7919;
    const a = population(policy, lower, makeRng(seed));
    const b = population(policy, upper, makeRng(seed));
    rollForm(a, makeRng(seed)); Object.assign(b, { height: a.height, weight: a.weight, form: a.form });
    for (const shot of buildSet(makeRng(seed), upper)) {
      const shotSeed = 1000003 + s * 7919 + upper * 31 + shot.index;
      const play = keeper => resolve({ keeper, shot, rng: makeRng(shotSeed), input: positionInput(keeper, shot, makeRng(shotSeed + 1), 'hand-follow') });
      const low = play(a), high = play(b);
      if (low.untested !== high.untested) throw new Error('짝지은 시험받은 슛이 다르다');
      if (low.untested) continue;
      tested++;before += !low.conceded;after += !high.conceded;
      n10 += !low.conceded && high.conceded;n01 += low.conceded && !high.conceded;
    }
  }
  return { lower, upper, tested, before: 100 * before / tested, after: 100 * after / tested, delta: 100 * (after-before) / tested, n10, n01 };
}
