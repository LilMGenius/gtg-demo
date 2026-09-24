import { MODES, positionInput, resolve, makeRng, newKeeper, buildSet, moveSpeed, X_MAX } from './position-pop.mjs';
import { GROWABLE } from '../src/ledger.mjs';
import { resolve as productResolve } from '../src/chain.mjs';

// 이백 시드의 다섯 슛에서 네 정책과 열다섯 스탯을 교차해 난수 분기와 자취 배선을 검사한다.
const SEEDS = 200;
let pairs = 0, membershipDrift = 0, noTrace = 0, speedErrors = 0, replayDrift = 0, changed = 0, moving = 0, changedMembership = 0, rejectedNoTrace = 0, speedControl = 0;
// 1e-9는 선형 보간의 부동소수 오차만 흡수한다. 밀리초를 초로 환산한다.
const tooFast = (a, b, keeper) => Math.abs(b.x) > X_MAX || Math.abs(b.x - a.x) * 1000 / (b.ms - a.ms) > moveSpeed(keeper) + 1e-9;
for (let seed = 1; seed <= SEEDS; seed++) {
  const keeper = newKeeper();
  for (const shot of buildSet(makeRng(seed))) for (const mode of MODES) {
    const play = (who, delta = 0) => resolve({ keeper: { ...who }, shot, rng: makeRng(seed + delta), input: positionInput(who, shot, makeRng(seed), mode) });
    const base = play(keeper), again = play(keeper);
    replayDrift += Number(JSON.stringify(base) !== JSON.stringify(again));
    const different = play(keeper, 1);
    changed += Number(JSON.stringify(base) !== JSON.stringify(different));
    changedMembership += Number(base.untested !== different.untested);
    try { productResolve({ keeper: { ...keeper }, shot, rng: makeRng(seed) }); }
    catch (error) { rejectedNoTrace += Number(error instanceof TypeError && error.message.includes('trace')); }
    noTrace += Number(!Array.isArray(base.input.trace));
    const trace = base.input.trace;
    for (let i = 1; i < trace.length; i++) {
      const a = trace[i - 1], b = trace[i];
      speedErrors += Number(tooFast(a, b, keeper));
      // 같은 이동을 1ms로 압축한 자취는 속도 위반을 실제로 검출하는 양성 대조군이다.
      speedControl += Number(tooFast(a, { ...b, ms: a.ms + 1 }, keeper));
      moving += Number(b.x !== a.x);
    }
    for (const stat of GROWABLE) {
      const bumped = play({ ...keeper, [stat]: keeper[stat] + 1 });
      membershipDrift += Number(base.untested !== bumped.untested);
      pairs++;
    }
  }
}
const checks = {
  'trace-and-speed': noTrace === 0 && rejectedNoTrace > 0 && speedErrors === 0 && speedControl > 0 && moving > 0,
  'paired-tested-membership': membershipDrift === 0 && changedMembership > 0 && pairs > 0,
  'deterministic-with-positive-control': replayDrift === 0 && changed > 0
};
console.log(JSON.stringify({ pairs, membershipDrift, changedMembership, noTrace, rejectedNoTrace, speedErrors, speedControl, replayDrift, changed, moving }));
for (const [name, ok] of Object.entries(checks)) console.log(`${ok ? 'PASS' : 'FAIL'} position-pop:${name}`);
const pass = Object.values(checks).every(Boolean);
console.log(`position-pop ${pass ? 'PASS' : 'FAIL'}`);
process.exitCode = Number(!pass);
