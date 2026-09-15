import { growthGain } from '../../../src/chain.mjs';
import { GROWABLE } from '../../../src/ledger.mjs';

/* chain.mjs의 판정 항을 따라 우선 훈련한다. 판단력은 autoInput의 readP와 spread,
   resolve의 diveP를, 반응속도는 judgeWindow의 windowMs를, 다이빙은 contactMargin의
   horiz를, 핸들링은 gloveP와 spillP를, 민첩성은 moveDelay를 맡는다.
   앞의 다섯 칸 뒤에는 GROWABLE 순서를 지키며, 한 칸이 상한이면 다음 칸으로 간다. */
const SAVE_FIRST = ['judgement', 'reflex', 'diving', 'handling', 'agility'];
export const TRAINING_PRIORITY = [...SAVE_FIRST, ...GROWABLE.filter(stat => !SAVE_FIRST.includes(stat))];

// 손 훈련의 growthGain을 그대로 쓴다. 한 번 굴릴 때 한 포인트만 쓴다.
export function trainStat(keeper, stat, rng) {
  if (!GROWABLE.includes(stat) || keeper[stat] >= 10) return { keeper, spent: 0, lines: [] };
  const before = keeper[stat];
  const after = Math.min(10, before + growthGain(keeper, rng));
  return { keeper: { ...keeper, [stat]: after }, spent: 1, lines: [{ stat, before, after }] };
}

export function autoTrain(keeper, points, rng) {
  let trained = keeper;
  const lines = [];
  for (let spent = 0; spent < Math.floor(points); spent += 1) {
    const stat = TRAINING_PRIORITY.find(stat => trained[stat] < 10);
    if (stat === undefined) break;
    const result = trainStat(trained, stat, rng);
    trained = result.keeper;
    lines.push(...result.lines);
  }
  return { keeper: trained, spent: lines.length, lines };
}
