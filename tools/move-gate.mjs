import { createHash } from 'node:crypto';
import * as chain from '../src/chain.mjs';

// 최소 이천 시드의 다섯 슛을 자동과 수동 양쪽에서 고정한다.
const SEEDS = 2000;
const PIN = '6cc9c59dc3205ff3d49362a7e4f493c97e22031328a957c1422fba14932d4182';
const failures = [];
function check(axis, ok, detail) {
  console.log(`${ok ? 'PASS' : 'FAIL'} move:${axis} ${detail}`);
  if (!ok) failures.push(axis);
}
function legacyChecksum(perturb = false) {
  const hash = createHash('sha256');
  for (let seed = 1; seed <= SEEDS; seed++) {
    for (const manual of [false, true]) {
      const rng = chain.makeRng(seed);
      // 서른 레벨의 성장 표본을 반복해 신인과 성장 뒤 입력을 같이 묶는다.
      const keeper = chain.keeperAtLevel(1 + seed % 30, rng);
      chain.rollForm(keeper, rng);
      for (const shot of chain.buildSet(rng, keeper.level)) {
        const input = manual ? { dive: shot.side, errMs: 0, advance: 0, auto: false } : undefined;
        const r = chain.resolve({ keeper, shot, rng, input });
        hash.update(JSON.stringify([perturb ? !r.conceded : r.conceded, r.cause, r.rolls, r.stage]));
      }
    }
  }
  return hash.digest('hex');
}
const checksum = legacyChecksum();
console.log(`PIN seeds=${SEEDS} shots=5 modes=2 sha256=${checksum}`);
if (process.argv.includes('--pin')) process.exit(0);
check('old-path-unchanged', checksum === PIN, checksum);
check('checksum-positive-control', legacyChecksum(true) !== checksum, '결과 반전은 해시를 바꾼다');
check('position-api', typeof chain.botPlan === 'function' && typeof chain.moveSpeed === 'function', '위치 경로 공개 함수');
if (typeof chain.botPlan === 'function') {
  // 만이천 쌍은 방향 확률의 95% 오차를 약 1%p 안으로 좁힌다.
  const N = 12000;
  // 중간 훈련 표본에서 손과 집중 사고를 줄여 자리 차이를 읽는다.
  const keeper = { ...chain.newKeeper(), judgement: 6, reflex: 6, agility: 6, composure: 6, handling: 8, strength: 8, balance: 8, focus: 10, mischief: 1, communication: 1 };
  const stationary = x => ({ x, vx: 0, trace: [{ ms: -1000, x }, { ms: 0, x }] });
  const run = (k, shot, input, seed) => chain.resolve({ keeper: { ...k }, shot, input, rng: chain.makeRng(seed) });
  const saved = r => Number(!r.conceded && !r.untested);
  // 낮은 공의 도달 경계 양쪽 다섯 구간을 같은 슛과 난수로 비교한다.
  const gaps = [0.95, 0.8, 0.65, 0.5, 0.35];
  const bins = gaps.map(() => 0);
  let nearLow = 0, farHigh = 0, wrongBody = 0, wrongFar = 0, different = 0, controlDifferent = 0;
  let positionCauses = 0, statCauses = 0;
  // 편위가 작은 곳부터 큰 곳까지 같은 균등 난수로 키커 선택을 잰다.
  const offsets = [0, 0.06, 0.12, 0.3, 0.6];
  const bias = offsets.map(() => 0);
  const baitWins = [0, 0], centerWins = [0, 0];
  // 판단력 네 계단을 같은 샷과 위치/판정 난수로 비교한다.
  const judgements = [1, 4, 7, 10], ladder = judgements.map(() => 0);
  const discord = judgements.slice(1).map(() => ({ up: 0, down: 0 }));
  for (let i = 1; i <= N; i++) {
    // 서로 다른 소수 오프셋은 샷 생성과 판정 스트림을 분리한다.
    const seed = i + 90001;
    const original = chain.buildSet(chain.makeRng(i + 1000003))[i % 5];
    // 방향 재조준 없는 낮은 공 대조군은 거리와 도달만 시험한다.
    const fixed = { ...original, aimX: 1, aimY: 0.6, side: 1, sideU: undefined, course: '하단', chip: false, gaze: false, strong: false, bend: 0 };
    gaps.forEach((gap, b) => { bins[b] += saved(run(keeper, fixed, stationary(1 - gap), seed)); });
    nearLow += saved(run({ ...keeper, diving: 1 }, fixed, stationary(0.8), seed));
    farHigh += saved(run({ ...keeper, diving: 10 }, fixed, stationary(0), seed));
    const body = run(keeper, fixed, stationary(1), seed);
    const far = run(keeper, fixed, stationary(-1), seed);
    wrongBody += Number(body.input.dive !== 0 || body.input.dirQuality !== 1);
    wrongFar += Number(far.input.dirQuality < 1);
    positionCauses += Number(far.cause === 'position');
    statCauses += Number(run(keeper, fixed, { ...stationary(-1), auto: true }, seed).cause === 'judgement');
    different += Number(JSON.stringify(body) !== JSON.stringify(run(keeper, fixed, stationary(1), seed)));
    controlDifferent += Number(JSON.stringify(body) !== JSON.stringify(run(keeper, fixed, stationary(1), seed + 1)));
    // 중앙 선행 롤과 칩을 제외한 실제 buildSet 방향 롤만 편향 분모에 넣는다.
    if (Number.isFinite(original.sideU) && !original.chip) {
      offsets.forEach((offset, b) => { bias[b] += Number(run(keeper, original, stationary(offset), seed).shot.side === -1); });
      bias.total = (bias.total || 0) + 1;
    }
    // 미끼는 +0.3에 섰다가 접촉 600ms 전부터 큰 쪽으로 실제 옆걸음 속도로 이동한다.
    const speed = chain.moveSpeed(keeper);
    const bait = { x: 0.3 - speed * 0.6, vx: -speed, trace: [{ ms: -1000, x: 0.3 }, { ms: -600, x: 0.3 }, { ms: 0, x: 0.3 - speed * 0.6 }] };
    [2, 10].forEach((composure, b) => {
      const shot = { ...original, kicker: { ...original.kicker, composure } };
      baitWins[b] += saved(run(keeper, shot, bait, seed));
      centerWins[b] += saved(run(keeper, shot, stationary(0), seed));
    });
    const outcomes = judgements.map((judgement, b) => {
      const k = { ...keeper, judgement };
      const trace = chain.botPlan(k, original, chain.makeRng(seed));
      const last = trace.at(-1), prev = trace.at(-2);
      // 마지막 구간의 밀리초 기울기를 초당 속도로 환산한다.
      const input = { x: last.x, vx: (last.x - prev.x) * 1000 / (last.ms - prev.ms), trace, auto: true };
      const outcome = saved(run(k, original, input, seed));
      ladder[b] += outcome;
      return outcome;
    });
    discord.forEach((d, b) => { d.up += Number(outcomes[b + 1] > outcomes[b]); d.down += Number(outcomes[b + 1] < outcomes[b]); });
  }
  const rates = counts => counts.map(n => (100 * n / N).toFixed(3)).join(',');
  check('closer-saves-more', bins.every((n, i) => !i || n > bins[i - 1]), `gap=${gaps} saved%=${rates(bins)} N=${N}`);
  check('low-diving-near-beats-high-diving-far', nearLow > farHigh, `near=${nearLow} far=${farHigh} N=${N}`);
  const biasRates = bias.map(n => n / bias.total);
  // 약 59%의 허용폭은 ±3%p다. 표본 오차보다 넓지만 64.6%라는 다른 가설은 통과시키지 않는다.
  check('larger-side-bias-rises-with-offset', bias.every((n, i) => !i || n > bias[i - 1]) && Math.abs(biasRates[1] - 0.59) <= 0.03, `offset=${offsets} rates=${biasRates.map(n => n.toFixed(4))} N=${bias.total}`);
  check('late-readers-punish-early-movers', baitWins[0] > centerWins[0] && baitWins[1] < centerWins[1], `composure=2,10 bait=${rates(baitWins)} center=${rates(centerWins)}`);
  // McNemar 짝표본 정규근사의 95% 하한이 양수여야 사다리가 오른다(product-pop 방식 재사용).
  const intervals = discord.map(d => ({ delta: (d.up - d.down) / N, hw: 1.96 * Math.sqrt(d.up + d.down) / N }));
  check('bot-ladder-rises-with-judgement', intervals.every(d => d.delta - d.hw > 0), `j=${judgements} saved%=${rates(ladder)} intervals=${JSON.stringify(intervals)}`);
  check('no-wrong-way-dive-at-the-body', wrongBody === 0 && wrongFar > 0, `body=${wrongBody} far-positive-control=${wrongFar} N=${N}`);
  check('deterministic', different === 0 && controlDifferent > 0, `mismatch=${different} different-seed-positive-control=${controlDifferent} N=${N}`);
  check('position-and-stat-causes', positionCauses > 0 && statCauses > 0, `manual-position=${positionCauses} bot-judgement=${statCauses}`);
}
console.log(`move ${failures.length ? 'FAIL' : 'PASS'} ${failures.length}`);
process.exitCode = Number(failures.length > 0);
