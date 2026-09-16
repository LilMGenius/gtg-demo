import { growthGain } from '../../../src/chain.mjs';
import { GROWABLE } from '../../../src/ledger.mjs';

/* tools/idle-gate.mjs의 같은 시드에서 능력 3과 6의 차이를 잰다. 레벨 13 내림차순이며 동률은 GROWABLE 순서다.
   handling: 레벨 5 7.48, 레벨 13 7.08 퍼센트포인트.
   strength: 레벨 5 1.59, 레벨 13 1.72 퍼센트포인트.
   reflex: 레벨 5 1.33, 레벨 13 1.52 퍼센트포인트.
   balance: 레벨 5 1.49, 레벨 13 1.35 퍼센트포인트.
   agility: 레벨 5 1.03, 레벨 13 1.00 퍼센트포인트.
   resilience: 레벨 5 0.58, 레벨 13 0.67 퍼센트포인트.
   diving: 레벨 5 0.99, 레벨 13 0.59 퍼센트포인트.
   composure: 레벨 5 0.57, 레벨 13 0.59 퍼센트포인트.
   focus: 레벨 5 0.31, 레벨 13 0.44 퍼센트포인트.
   judgement: 레벨 5 0.15, 레벨 13 0.17 퍼센트포인트.
   goalKick: 레벨 5 0.00, 레벨 13 0.00 퍼센트포인트.
   throwing: 레벨 5 0.00, 레벨 13 0.00 퍼센트포인트.
   communication: 레벨 5 -0.30, 레벨 13 -0.12 퍼센트포인트.
   offball: 레벨 5 -0.18, 레벨 13 -0.37 퍼센트포인트.
   mischief: 레벨 5 -0.82, 레벨 13 -0.69 퍼센트포인트. */
export const TRAINING_PRIORITY = ["handling","strength","reflex","balance","agility","resilience","diving","composure","focus","judgement","goalKick","throwing","communication","offball","mischief"];

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
