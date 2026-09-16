import { growthGain } from '../../../src/chain.mjs';
import { GROWABLE } from '../../../src/ledger.mjs';

/* tools/idle-gate.mjs의 완전 입력 표본에서 능력 한 칸을 3에서 6으로 올린 세이브율 차이다.
   레벨마다 2000 시드와 다섯 슛을 쓰며 나머지는 newKeeper 그대로다. 반응속도와 장난기도 대조값은 3이다.
   레벨 13의 차이 내림차순으로 훈련하고 동률은 GROWABLE 순서로 푼다.
   handling: 레벨 5 7.17, 레벨 13 6.78 퍼센트포인트.
   strength: 레벨 5 1.47, 레벨 13 1.65 퍼센트포인트.
   balance: 레벨 5 1.46, 레벨 13 1.29 퍼센트포인트.
   reflex: 레벨 5 1.45, 레벨 13 1.19 퍼센트포인트.
   agility: 레벨 5 0.93, 레벨 13 0.91 퍼센트포인트.
   resilience: 레벨 5 0.66, 레벨 13 0.67 퍼센트포인트.
   composure: 레벨 5 0.46, 레벨 13 0.51 퍼센트포인트.
   diving: 레벨 5 0.76, 레벨 13 0.48 퍼센트포인트.
   focus: 레벨 5 0.22, 레벨 13 0.37 퍼센트포인트.
   judgement: 레벨 5 0.15, 레벨 13 0.12 퍼센트포인트.
   goalKick: 레벨 5 0.00, 레벨 13 0.00 퍼센트포인트.
   throwing: 레벨 5 0.00, 레벨 13 0.00 퍼센트포인트.
   communication: 레벨 5 -0.28, 레벨 13 -0.15 퍼센트포인트.
   offball: 레벨 5 -0.40, 레벨 13 -0.63 퍼센트포인트.
   mischief: 레벨 5 -0.76, 레벨 13 -0.70 퍼센트포인트. */
export const TRAINING_PRIORITY = ["handling","strength","balance","reflex","agility","resilience","composure","diving","focus","judgement","goalKick","throwing","communication","offball","mischief"];

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
