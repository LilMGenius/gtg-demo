import { mkdirSync, writeFileSync } from 'node:fs';
import { makeRng, newKeeper, buildSet, resolve, followerGain } from '../src/chain.mjs';
import { trainStat } from '../web/src/state/coach.mjs';
import { positionInput } from './position-pop.mjs';
import { GROWABLE } from '../src/ledger.mjs';
import { CITIES } from '../web/src/state/gear.mjs';
// 첫 세션은 스무 판, 각 판은 제품의 다섯 슛이다. 이백 씨앗으로 초기 난수 편차를 포함한다.
const sessionSets = 20, seeds = 200;
const [levelDoor, saveDoor, fanDoor] = CITIES[1].conditions.map(row => row.min);
const rows = [];
for (let seed = 1; seed <= seeds; seed++) {
  const rng = makeRng(seed);
  let keeper = newKeeper(), saved = 0, fans = 0;
  for (let sets = 1; sets <= sessionSets; sets++) {
    for (const shot of buildSet(rng, keeper.level, 0)) {
      const result = resolve({ keeper, shot, rng, input: positionInput(keeper, shot, rng, 'hand-react') });
      if (!result.conceded && !result.untested) saved++;
      fans += followerGain(keeper, result);
    }
    keeper.level++;
    // 제품은 세트마다 두 훈련 포인트를 지급하고 능력 상한은 10이다.
    for (let p = 0; p < 2; p++) {
      const pool = GROWABLE.filter(key => keeper[key] < 10);
      pool.sort((a, b) => keeper[a] - keeper[b]);
      if (pool.length) keeper = trainStat(keeper, pool[0], rng).keeper;
    }
    if (keeper.level >= levelDoor && saved >= saveDoor && fans >= fanDoor) { rows.push({ seed, sets, saved, fans, level: keeper.level }); break; }
    if (sets === sessionSets) rows.push({ seed, sets, saved, fans, level: keeper.level, missed: true });
  }
}
// 가능한 전체 슛 수보다 세이브를 하나 더 요구하면 같은 도달 판정이 반드시 실패한다.
const impossibleSaves = sessionSets * buildSet(makeRng(1), 1, 0).length + 1;
const controlRejected = rows.every(row => !(row.level >= levelDoor && row.saved >= impossibleSaves && row.fans >= fanDoor));
const summary = { count: rows.length, missed: rows.filter(r=>r.missed).length, medianSets: rows.map(r=>r.sets).sort((a,b)=>a-b)[Math.floor(seeds / 2)], maxSets: Math.max(...rows.map(r=>r.sets)), impossibleSaves, controlRejected };
const out = new URL('../.omo/evidence/p16/', import.meta.url);
mkdirSync(out, { recursive: true });
writeFileSync(new URL('calibration.json', out), JSON.stringify({ summary, rows }, null, 2));
console.log('venue-session ' + (summary.missed || !controlRejected ? 'FAIL ' : 'PASS ') + JSON.stringify(summary));
if (summary.missed || !controlRejected) process.exitCode = 1;
