import * as chain from '../src/chain.mjs';
import { PENALTY_RULE } from '../src/reality.mjs';

// 접촉 전 골라인 대조는 기존 이천 시드와 수동·봇 양쪽 표본 수를 유지한다.
const SEEDS = 2000;
const failures = [];
function check(axis, ok, detail) {
  console.log(`${ok ? 'PASS' : 'FAIL'} move:${axis} ${detail}`);
  if (!ok) failures.push(axis);
}
// 옛 방향 입력과 생략 입력은 거절하고 실제 봇 자취는 받아야 계약 검사가 살아 있다.
// 시드 1의 첫 구를 거절 입력과 수락 입력에 똑같이 쓴다.
const keeper = chain.newKeeper(), rng = chain.makeRng(1);
const shot = chain.buildSet(rng)[0];
const rejected = input => {
  try { chain.resolve({ keeper: { ...keeper }, shot, rng: chain.makeRng(1), input }); return false; }
  catch (error) { return error instanceof TypeError && error.message.includes('trace'); }
};
check('trace-required', rejected(undefined), '입력 생략을 거절한다');
// 방향 0과 오차 0은 종전 정면 완벽 입력 양성 대조다.
check('old-direction-positive-control', rejected({ dive: 0, errMs: 0 }), '옛 방향 입력을 거절한다');
check('empty-trace-refused', rejected({ trace: [] }), '빈 자취를 거절한다');
// 시드 1은 거절 대조와 같은 한 구를 재현한다.
const trace = chain.botPlan(keeper, shot, chain.makeRng(1));
const accepted = chain.resolve({ keeper, shot, rng: chain.makeRng(1), input: { trace, auto: true } });
check('trace-accepted-control', Array.isArray(accepted.input.trace), '실제 봇 자취는 판정된다');
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

// 고정 슛에서 1ms 간격으로 최초 발동을 관측해 프레임 오차를 제한한다.
const first = (k, shot, x) => {
  if (!chain.diveTrigger) return NaN;
  for (let t = 0; t <= shot.flight * 1000; t++) if (chain.diveTrigger(k, shot, x, t)) return t;
  return NaN;
};
// 느린 낮은 공은 반응 하한에 붙지 않아 마지막 도달 시각의 단조를 드러낸다.
const fixed = { ...chain.buildSet(chain.makeRng(71))[0], aimX: 1, aimY: 0.6, side: 1, sideU: undefined, course: '하단', flight: 1, chip: false, bend: 0, strong: false };
// 시드 71은 고정 재현용이며 1단위/높이 0.6/비행 1초는 낮은 도달 경계를 격리한다.
const k = chain.newKeeper();
const reflexTimes = [1, 5, 10].map(reflex => first({ ...k, reflex }, fixed, 0));
check('reflex-widens-the-window', reflexTimes.every((t, i) => Number.isFinite(t) && (!i || t > reflexTimes[i - 1])), JSON.stringify(reflexTimes));
const distanceTimes = [0.6, 1, 1.4].map(dist => first(k, fixed, 1 - dist));
const divingTimes = [1, 5, 10].map(diving => first({ ...k, diving }, fixed, 0));
const boundary = chain.diveNeed && distanceTimes.every((t, i) => {
  const dist = [0.6, 1, 1.4][i];
  const slack = fixed.flight * 1000 - t - chain.diveNeed(k, dist);
  return slack <= 60 - 4 * k.reflex && slack > 60 - 4 * k.reflex - 1;
});
check('dive-leaves-at-the-last-reachable-moment', boundary && distanceTimes.every((t,i) => !i || t < distanceTimes[i-1]) && divingTimes.every((t,i) => !i || t > divingTimes[i-1]), JSON.stringify({ distanceTimes, divingTimes }));
const powers = [1, 5, 10].map(power => first(k, { ...fixed, flight: Math.max(0.55, 1.05 - power * 0.05) }, 0));
check('faster-shots-leave-less-reaction', powers.every((t,i) => Number.isFinite(t) && (!i || t < powers[i-1])), JSON.stringify(powers));
const botStarts = [1, 5, 10].map(judgement => {
  const trace = chain.botPlan({ ...k, judgement }, fixed, chain.makeRng(71));
  const index = trace.findIndex((p,i) => i && p.ms > 0 && p.x !== trace[i-1].x);
  return index > 0 ? trace[index-1].ms : NaN;
});
// 인간 기준 250ms보다 늦으며 판단이 높을수록 빨라지는 동작을 잰다. 특정 계수 복제는 하지 않는다.
check('bot-reacts-with-judgement', botStarts.every((t,i) => Number.isFinite(t) && t > 250 && (!i || t < botStarts[i-1])), JSON.stringify(botStarts));
// 4000개 시드의 다섯 슛을 짝지어 95% McNemar 구간을 재사용한다.
const reactIntervals = [];
for (const level of [1, 5, 13, 21]) {
  let up = 0, down = 0, n = 0;
  for (let seed = 1; seed <= 4000; seed++) {
    const who = chain.keeperAtLevel(level, chain.makeRng(seed));
    // 같은 생성 스트림의 슛 다섯 개 뒤를 정책 롤로 써 연속 시드의 첫 xorshift 값 편향을 피한다.
    const policyRng = chain.makeRng(seed);
    const shots = chain.buildSet(policyRng, level);
    for (const shot of shots) {
      const pre = [{ ms: -1000, x: 0 }, { ms: 0, x: 0 }];
      const aimed = chain.aimAt ? chain.aimAt(who, shot, pre) : shot;
      // 인간 반응 250ms와 90% 방향 적중은 P15-U1b의 HOTL 정책이다.
      const direction = policyRng() < 0.9 ? Math.sign(aimed.aimX) : -Math.sign(aimed.aimX);
      const target = direction * Math.min(Math.abs(aimed.aimX), chain.X_MAX);
      const finish = 250 + Math.abs(target) / chain.moveSpeed(who) * 1000;
      const end = aimed.flight * 1000;
      const trace = [...pre, { ms: 250, x: 0 }];
      if (finish > 250 && finish < end) trace.push({ ms: finish, x: target });
      trace.push({ ms: end, x: direction * Math.min(Math.abs(target), chain.moveSpeed(who)*(end-250)/1000) });
      const play = trace => chain.resolve({ keeper: { ...who }, shot: aimed, input: { trace, x: 0, vx: 0, auto: false }, rng: chain.makeRng(seed + 90001) });
      const a = play(pre), b = play(trace);
      const saved = r => Number(!r.conceded && !r.untested);
      up += Number(saved(b) > saved(a)); down += Number(saved(a) > saved(b)); n++;
    }
  }
  reactIntervals.push({ level, n, up, down, delta: (up-down)/n, hw: 1.96*Math.sqrt(up+down)/n });
}
check('reacting-beats-standing', reactIntervals.every(r => r.delta > r.hw), JSON.stringify(reactIntervals));

// 반응 1/5/10은 스탯 양끝과 중간이다. 같은 이동 정책에서 실제 발동까지 허용된 시간이 늘어야 한다.
const movingTimes = chain.reactTrace ? [1, 5, 10].map(reflex => chain.reactTrace({ ...k, reflex }, fixed, [{ ms: -1000, x: 0 }, { ms: 0, x: 0 }], 250).at(-1).ms) : [];
check('reflex-adds-movement-time', movingTimes.length === 3 && movingTimes.every((t,i) => !i || t > movingTimes[i-1]), JSON.stringify(movingTimes));
// 1200개 궤적은 서기 경계 양쪽, 역방향 이동, 빠른/느린 다이빙을 겹친다. 1ms 독립 전수 탐색이 교점 풀이를 검사한다.
let triggerErrors = 0, earlierControl = 0;
if (chain.diveTrigger) for (let seed = 1; seed <= 1200; seed++) {
  const rng = chain.makeRng(seed);
  const who = chain.keeperAtLevel(1 + seed % 21, rng);
  const shot = chain.buildSet(rng)[seed % 5];
  const x = (rng()*2-1)*chain.X_MAX;
  const target = (rng()*2-1)*chain.X_MAX;
  const end = shot.flight*1000;
  const trace = [{ ms: -1000, x }, { ms: 0, x }, { ms: end, x: x + Math.sign(target-x)*Math.min(Math.abs(target-x),chain.moveSpeed(who)*end/1000) }];
  const aimed = chain.aimAt(who,shot,trace);
  const result = chain.resolve({keeper:{...who},shot:aimed,input:{trace,x},rng:chain.makeRng(seed)});
  const at = t => x+(trace.at(-1).x-x)*Math.min(t,end)/end;
  let firstMs = aimed.flight*1000;
  for(let t=0;t<=aimed.flight*1000;t++) if(chain.diveTrigger(who,aimed,at(t),t)){firstMs=t;break;}
  // 1ms는 독립 전수 탐색의 해상도이고 1e-6은 교점의 부동소수 오차다.
  triggerErrors += Number(Math.abs(firstMs-result.input.triggerMs)>1+1e-6 || !chain.diveTrigger(who,aimed,result.input.x,result.input.triggerMs));
  earlierControl += Number(!chain.diveTrigger(who,aimed,at(0),0));
}
check('trace-trigger-matches-independent-scan', Boolean(chain.diveTrigger) && triggerErrors===0 && earlierControl>0, JSON.stringify({triggerErrors,earlierControl}));
// 조문은 reality의 확인된 IFAB 원문에서 읽는다. 오차는 세계의 선 폭이 아닌 보간의 부동소수 허용치다.
const LINE_EPS = 1e-9;
const contact = PENALTY_RULE.values.contactMs, line = PENALTY_RULE.values.lineDepth;
const lawAxis = inp => inp.depthTrace.length > 0
  && inp.depthTrace.some(p => p.ms === contact)
  && inp.depthTrace.filter(p => p.ms <= contact).every(p => Math.abs(p.depth - line) <= LINE_EPS)
  && Math.abs(chain.keeperDepthAt(inp, contact) - line) <= LINE_EPS;
let depthSamples = 0, depthViolations = 0, earlyAdvanceControls = 0, postKickRush = 0;
// 옛 경로 가드와 같은 이천 시드에서 손과 봇의 모든 슛을 재며 실제 전진도 양수여야 한다.
for (let seed = 1; seed <= SEEDS; seed++) for (const bot of [false, true]) {
  const rng = chain.makeRng(seed), keeper = chain.keeperAtLevel(1 + seed % 30, rng);
  for (const shot of chain.buildSet(rng, keeper.level)) {
    const trace = bot ? chain.botPlan(keeper, shot, rng) : [{ ms: -1000, x: 0 }, { ms: 0, x: 0 }];
    const result = chain.resolve({ keeper: { ...keeper }, shot, rng, input: { trace, x: trace.at(-1).x, auto: bot } });
    const inp = result.input;
    depthSamples++;
    depthViolations += Number(!lawAxis(inp));
    postKickRush += Number(inp.advance > 0 && inp.depthTrace.at(-1).depth > line);
    // 실제 판정의 마지막 전진 깊이를 접촉 표본에 심으면 같은 축이 반드시 거부해야 한다.
    const planted = { ...inp, depthTrace: inp.depthTrace.map(p => ({ ...p, depth: p.ms === contact ? inp.depthTrace.at(-1).depth : p.depth })) };
    earlyAdvanceControls += Number(!lawAxis(planted));
  }
}
check('law14:keeper-depth-at-contact-on-line', depthSamples > 0 && depthViolations === 0,
  JSON.stringify({ depthSamples, depthViolations, contact, line, tolerance: LINE_EPS, source: PENALTY_RULE.source.name }));
check('law14:pre-kick-advance-positive-control', earlyAdvanceControls === depthSamples && postKickRush > 0,
  JSON.stringify({ earlyAdvanceControls, depthSamples, postKickRush }));
console.log(`move ${failures.length ? 'FAIL' : 'PASS'} ${failures.length}`);
process.exitCode = Number(failures.length > 0);
