import { newKeeper, keeperAtLevel } from './position-pop.mjs';
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
