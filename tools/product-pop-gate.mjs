import { resolution } from './seed-resolution.mjs';
import { population, pairedTrainingStep } from './product-population.mjs';
import { botTierContract } from './bot-tier-contract.mjs';
// 위치 경로의 네 입력 모드에서 기존 문턱을 그대로 재며, 옛 완벽/자동/저장 방향은 모집단에서 제외한다.
import { makeRng, newKeeper, keeperAtLevel, rollForm, buildSet, resolve, positionInput, MODES } from './position-pop.mjs';
import { GROWABLE } from '../src/ledger.mjs';
import { autoTrain, trainStat, TRAINING_PRIORITY } from '../web/src/state/coach.mjs';
import { coinGain } from '../web/src/state/wallet.mjs';
import { GLOVES, BOOTS, KITS, SOCKS, GOALS, CITIES, HAIRS, TATTOOS } from '../web/src/state/gear.mjs';
import { PULL_COST } from '../src/roster.mjs';
import { BOTS } from '../web/src/state/bot.mjs';
import { BUFFS } from '../web/src/state/buff.mjs';

// Reuses this repository's product-pop.local.mjs population/seed mechanism and
// corr-gate sampling; paired shot replay replaces independent bump reruns.
// Training and adjudication remain owned by the shipped product modules.
const WATCHDOG = 230000;
const started = Date.now();
setTimeout(() => { console.error('product-pop FAIL watchdog'); process.exit(1); }, WATCHDOG).unref();
const args = process.argv.slice(2);
const BALLS = args.length === 0 ? 12000 : args.length === 2 && args[0] === '--balls' ? Number(args[1]) : NaN;
if (!Number.isSafeInteger(BALLS) || BALLS < 5 || BALLS % 5 !== 0) {
  console.error('Usage: node tools/product-pop-gate.mjs [--balls positive-multiple-of-5]');
  process.exit(2);
}
// HOTL hypothesis 2026-09-18
const TOLERANCE = 1.5, HORIZONS = [5, 13, 21], N_SETS = 10, LADDER_FLOOR = 1;
const DEAD_UPPER = 0.1;
// "designed 2.2-2.8x price step over flattening income, recoverable slowdown at the end of the ladder, not a dead end"
const ACCEPTED_ASYMMETRIES = [
  // 교정된 위치 표본의 고가 제시를 전부 구매한 실측 상한이다. N=10과 저가 제시의 트리거는 보존한다(U3e 라운드 8).
  { row: 'deadend:the-next-purchase-or-unlock-is-within-N-sets', mode: 'hand-follow', where: 'terminal high-cost offers', bound: 13, record: '.omo/evidence/u3e/round-8/brief.md' },
  // 봇도 모든 구매에 도달했고 최장 간격은 15세트였다. 이 경계를 넘으면 다시 실패한다(U3e 라운드 8).
  { row: 'deadend:the-next-purchase-or-unlock-is-within-N-sets', mode: 'bot', where: 'terminal high-cost offers', bound: 15, record: '.omo/evidence/u3e/round-8/brief.md' }
];
const LEVELS = [1, ...HORIZONS];
const MANUAL = ['lowest', 'random', 'greedy'];
const POLICIES = ['reference', 'coach', ...MANUAL];
const PATH = GROWABLE.filter(s => !['goalKick', 'throwing', 'mischief', 'communication'].includes(s));
const f = n => Number.isFinite(n) ? n.toFixed(2) : 'unavailable';
const unresolved = g => !g.tested || g.d - g.hw <= 0 && g.d + g.hw >= 0;
const counts = { FAIL: 0, PASS: 0, 'INSUFFICIENT EVIDENCE': 0, HITL: 0, ACCEPTED: 0, DIAGNOSTIC: 0 };
function verdict(name, status, detail) {
  counts[status]++;
  console.log(`${status} ${name} ${detail}`);
}


function measure(policy, level, mode, contrast = null, coupledShots = false) {
  const gains = (policy === 'fixed-order' ? [] : contrast ? [contrast] : PATH).map(stat => ({ stat, eligible: 0, tested: 0, baseSaved: 0, bumpSaved: 0, n10: 0, n01: 0, samples: [] }));
  let conceded = 0, tested = 0, gold = 0;
  const causes = {}, goldSamples = [];
  for (let s = 0; s < BALLS / 5; s++) {
    if (Date.now() - started >= WATCHDOG) { console.error('product-pop FAIL watchdog'); process.exit(1); }
    const source = makeRng(1000003 + s + level * 7919);
    const keeper = population(policy, level, source);
    rollForm(keeper, source);
    // 훈련 정책의 난수 소비가 상대 표본을 바꾸지 않게 기존 셀 시드를 별도로 재생한다. 결합 경로는 음성 대조에만 남긴다.
    const shots = buildSet(coupledShots ? source : makeRng(1000003 + s + level * 7919), level);
    const variants = gains.map(g => {
      if (keeper[g.stat] >= 10) return null;
      g.eligible++;
      return { ...keeper, [g.stat]: contrast ? 10 : Math.min(10, keeper[g.stat] + 1) };
    });
    const before = gains.map(g=>({n10:g.n10,n01:g.n01,tested:g.tested}));
    const goldBefore = gold;
    for (const shot of shots) {
      // 한 구마다 정책과 판정의 씨앗을 고정해 스탯 변화가 다음 구를 밀지 않는다.
      const shotSeed = 1000003 + s * 7919 + level * 31 + shot.index;
      const play = who => resolve({ keeper: who, shot, rng: makeRng(shotSeed), input: positionInput(who, shot, makeRng(shotSeed + 1), mode) });
      const base = play(keeper);
      if (policy === 'coach' && !contrast) gold += coinGain(base.conceded, base.fame, base.untested);
      if (!base.untested) tested++;
      if (base.conceded) { conceded++; causes[base.cause] = (causes[base.cause] || 0) + 1; }
      for (let i = 0; i < gains.length; i++) {
        const grown = variants[i];
        if (!grown) continue;
        const bump = play(grown);
        if (base.untested !== bump.untested) throw new Error('Paired tested-shot membership changed');
        if (base.untested) continue;
        const g = gains[i];
        g.tested++;
        g.baseSaved += Number(!base.conceded);
        g.bumpSaved += Number(!bump.conceded);
        if (!base.conceded && bump.conceded) g.n10++;
        if (base.conceded && !bump.conceded) g.n01++;
      }
    }
    gains.forEach((g,i)=>g.samples.push([g.n01-before[i].n01-g.n10+before[i].n10,g.tested-before[i].tested]));
    // 분모 1은 같은 다섯 슛 세트 하나다. 구매 간격의 수입 표본을 별도 난수 없이 보존한다.
    if (policy === "coach" && !contrast) goldSamples.push([gold-goldBefore,1]);
  }
  for (const g of gains) {
    g.eligibility = g.eligible / (BALLS / 5);
    g.d = g.tested ? 100 * (g.n01 - g.n10) / g.tested : NaN;
    // McNemar normal approximation: paired 95% half-width =
    // 1.96 * sqrt(n10 + n01) / tested * 100 (discordant tested balls).
    g.hw = g.tested ? 1.96 * Math.sqrt(g.n10 + g.n01) / g.tested * 100 : NaN;
    if (g.tested) resolution(`product-pop/${mode}/${policy}/L${level}/${g.stat}/${contrast ? "contrast" : "one"}${coupledShots ? "/coupled-control" : ""}`,g.samples);
  }
  if (goldSamples.length) resolution(`product-pop/${mode}/${policy}/L${level}/gold${coupledShots ? "/coupled-control" : ""}`,goldSamples,1);
  return { goldSamples, policy, level, mode, conceded, tested, nonconcession: 100 * (BALLS - conceded) / BALLS, testedSave: 100 * (tested - conceded) / tested, gains, causes, goldPerSet: gold / (BALLS / 5) };
}

console.log(`product-pop balls=${BALLS}/cell keepers=${BALLS / 5} shots/keeper=5 seed=1000003 + s + level*7919; s starts at 0`);
console.log('population: newKeeper; 2 points/set; 1 set/level; level raised before training; coach=autoTrain; manual=lowest/random/greedy; uncapped only; ties=GROWABLE order; random=seeded uniform');
console.log(`GROWABLE order: ${GROWABLE.join(',')}; body=178-198 / 74-94; no gear/recruitment`);
console.log(`coach fixed TRAINING_PRIORITY order: ${TRAINING_PRIORITY.join(',')}`);
console.log('reference=keeperAtLevel, three-of-N, 3 pts/level; kicker ramp=buildSet(rng, level), follows keeper level (balance-gate uses level 5)');
console.log('pairing: four position modes x reference/coach/lowest/random/greedy; hand-centre x untrained is the untouched-browser control');
console.log('input: hand-centre x=0; hand-follow p_read=0.9 starts -500ms; hand-bait x=0.3 starts -600ms toward larger side; bot=botPlan; all use trace and stat-owned auto dive');
console.log('denominators: nonconcession=100*(balls-conceded)/balls; tested-save=100*(tested-conceded)/tested; tested excludes r.untested');
console.log('marginals: eligible keeper stat<10; baseline restricted to same keepers; paired common shot/input/resolution streams; set streak evolves separately; tested membership asserted identical');
console.log('eligibility: stats capped in more than 50% of keepers are excluded from ranking and dead verdicts; marginals are still printed with their eligibility');
console.log(`HOTL hypothesis 2026-09-18: tolerance=${TOLERANCE}pp horizons=${HORIZONS} N=${N_SETS} sets ladder floor=${LADDER_FLOOR}pp/5 levels; N milestone timing uses the purchase walk; human intended experience is not measured here`);
console.log(`HOTL hypothesis 2026-09-18 instrument choices: DEAD_UPPER=${DEAD_UPPER}pp; 50% majority eligibility filter`);
const rows = [];
for (const mode of MODES) {
  for (const level of LEVELS) for (const policy of mode === 'hand-centre' ? [...POLICIES, 'untrained'] : POLICIES) {
    const r = measure(policy, level, mode);
    rows.push(r);
    console.log(`CELL ${mode} Lv${level} ${policy} nonconcession=${f(r.nonconcession)} tested-save=${f(r.testedSave)} balls=${BALLS} tested=${r.tested} conceded=${r.conceded}`);
    for (const g of r.gains) console.log(`  marginal ${g.stat} eligibility=${g.eligible}/${BALLS / 5} (${f(100 * g.eligibility)}%) tested=${g.tested} baseSaved=${g.baseSaved} bumpSaved=${g.bumpSaved} n10=${g.n10} n01=${g.n01} delta=${f(g.d)} +/-${f(g.hw)}pp ${unresolved(g) ? 'unresolved' : 'resolved'}${mode.startsWith('pref:') ? ' input-limited diagnostic' : ''}`);
  }
}

// 1.5%p는 기존 허용 오차다. 손 우위도 그보다 커야 눈에 보이는 이득으로 판정한다.
for (const level of LEVELS) for (const policy of POLICIES) {
  const follow = rows.find(r => r.mode === 'hand-follow' && r.level === level && r.policy === policy);
  const centre = rows.find(r => r.mode === 'hand-centre' && r.level === level && r.policy === policy);
  const bot = rows.find(r => r.mode === 'bot' && r.level === level && r.policy === policy);
  verdict('skill:follow-beats-centre', follow.testedSave - centre.testedSave > TOLERANCE ? 'PASS' : 'FAIL', policy + ' Lv' + level + ' delta=' + f(follow.testedSave - centre.testedSave));
  verdict('trade:bot-below-follow', bot.testedSave < follow.testedSave ? 'PASS' : 'FAIL', policy + ' Lv' + level + ' bot=' + f(bot.testedSave) + ' hand=' + f(follow.testedSave));
}
botTierContract({ levels: LEVELS, balls: BALLS, check: (name, ok, detail) => verdict(name, ok ? 'PASS' : 'FAIL', detail) });
const precision = [];
for (const mode of MODES) {
  for (const policy of mode === 'hand-centre' ? [...POLICIES, 'untrained'] : POLICIES) {
    const group = HORIZONS.map(level => rows.find(r => r.mode === mode && r.policy === policy && r.level === level));
    const tops = group.map(r => r.gains.filter(g => g.eligibility >= 0.5).sort((a, b) => b.d - a.d));
    const uncertain = tops.some(rank => rank.length < 2 || unresolved(rank[0]) || unresolved(rank[1]));
    const dominant = !uncertain && tops.every(rank => rank[0].stat === tops[0][0].stat && rank[0].d - rank[1].d > TOLERANCE);
    // The two marginals share the baseline, so the gap's uncertainty is bounded
    // by the sum of their half-widths (variance by its square): conservative, not exact.
    const gapWidths = tops.map((rank, i) => {
      const hw = rank[0]?.hw + rank[1]?.hw;
      precision.push({ row: `dominance ${mode}/${policy} Lv${HORIZONS[i]}`, hw });
      return hw;
    });
    verdict('dominance:the-same-eligible-stat-is-not-best-at-every-horizon', uncertain ? 'INSUFFICIENT EVIDENCE' : dominant ? 'FAIL' : 'PASS', `${mode}/${policy} ` + tops.map((rank, i) => `Lv${HORIZONS[i]} ${rank[0]?.stat}/${rank[1]?.stat} gap=${f(rank[0]?.d - rank[1]?.d)} +/-${f(gapWidths[i])}pp (conservative)`).join('; '));
    // The canon's offered cells are stats the growth screen offers and a policy
    // can buy. Saved-direction populations buy nothing; fixed input disables
    // branches (center disables balance's landing branch; a wrong side makes
    // diving's reach irrelevant). A zero there describes the input, not the stat.
    const inputLimited = policy === 'untrained';
    let dead = false, unknown = false;
    const details = [];
    for (const stat of PATH) {
      const eligible = group.map(r => ({ r, g: r.gains.find(g => g.stat === stat) })).filter(({ g }) => g.eligibility >= 0.5);
      if (!eligible.length) { details.push(`${stat}=not-offered`); continue; }
      const candidate = eligible.every(({ g }) => g.d + g.hw < DEAD_UPPER);
      if (candidate) {
        const contrasts = eligible.map(({ r }) => measure(policy, r.level, mode, stat).gains[0]);
        for (let i = 0; i < contrasts.length; i++) {
          const g = contrasts[i];
          console.log(`CONTRAST 3->10 (population value->10) ${mode}/${policy} Lv${eligible[i].r.level} ${stat} eligibility=${g.eligible}/${BALLS / 5} tested=${g.tested} baseSaved=${g.baseSaved} bumpSaved=${g.bumpSaved} n10=${g.n10} n01=${g.n01} delta=${f(g.d)} +/-${f(g.hw)}pp`);
        }
        if (inputLimited) continue;
        const confirmed = contrasts.every(g => g.d + g.hw < DEAD_UPPER);
        dead ||= confirmed;
        unknown ||= !confirmed && !contrasts.some(g => g.d - g.hw >= DEAD_UPPER);
        details.push(`${stat}=${confirmed ? 'dead' : 'contrast-not-dead'}`);
      } else if (!inputLimited && !eligible.some(({ g }) => g.d - g.hw >= DEAD_UPPER)) {
        unknown = true;
        details.push(`${stat}=unresolved`);
      }
    }
    verdict('dead:every-offered-save-path-stat-pays-at-some-horizon', inputLimited ? 'DIAGNOSTIC' : dead ? 'FAIL' : unknown ? 'INSUFFICIENT EVIDENCE' : 'PASS', inputLimited ? `${mode}/${policy} not applicable: points unspent, nothing is offered on this population; marginals are input-limited` : `${mode}/${policy} ${details.join(',') || 'all eligible stats pay'}`);
  }
}
for (const mode of ['hand-follow', 'bot']) for (const level of HORIZONS) {
  const group = rows.filter(r => r.mode === mode && r.level === level);
  const coach = group.find(r => r.policy === 'coach');
  const best = group.filter(r => MANUAL.includes(r.policy)).sort((a, b) => b.nonconcession - a.nonconcession)[0];
  const p1 = best.nonconcession / 100, p2 = coach.nonconcession / 100;
  const hw = 1.96 * Math.sqrt((p1 * (1 - p1) + p2 * (1 - p2)) / BALLS) * 100;
  const regret = best.nonconcession - coach.nonconcession;
  precision.push({ row: `coach ${mode} Lv${level}`, hw });
  verdict('coach:regret-vs-best-manual-policy-is-inside-tolerance', regret > TOLERANCE && regret - hw > 0 ? 'FAIL' : regret + hw <= TOLERANCE ? 'PASS' : 'INSUFFICIENT EVIDENCE', `${mode} Lv${level} best=${best.policy} best=${f(best.nonconcession)} coach=${f(coach.nonconcession)} regret=${f(regret)} +/-${f(hw)}pp`);
}
const ladder = HORIZONS.map(level => rows.find(r => r.mode === 'hand-follow' && r.policy === 'coach' && r.level === level));
// deadend:the-next-meaningful-decision-is-within-N-sets has ladder and economy halves.
// AUTONOMY, Gate axis correction: the ramped roster sits inside nonconcession;
// tested-save is the keeper's rate against that same ramp. Keep floor and horizons.
// 실제 상대 램프를 포함한 성적은 감시로 남기고, 훈련 바닥은 동일 상대의 인과 차로 잰다.
verdict('diagnostic:live-coach-ladder', 'DIAGNOSTIC', ladder.map(r => 'Lv' + r.level + '=' + f(r.testedSave)).join(' -> '));
for (let i = 1; i < HORIZONS.length; i++) {
  const lower = HORIZONS[i-1], upper = HORIZONS[i];
  const paired = pairedTrainingStep('coach', lower, upper, BALLS);
  const control = pairedTrainingStep('untrained', lower, upper, BALLS);
  const floor = LADDER_FLOOR * (upper-lower) / 5;
  verdict('deadend:coach-training-gains-at-the-floor-on-paired-opponents', paired.delta >= floor ? 'PASS' : 'FAIL', JSON.stringify({ ...paired, floor }));
  verdict('control:untrained-paired-ladder-is-rejected', control.delta === 0 && control.delta < floor && paired.delta > 0 ? 'PASS' : 'FAIL', JSON.stringify({ ...control, floor }));
}
const control = HORIZONS.map(level => measure('fixed-order', level, 'hand-follow'));
console.log(`control:the-fixed-order-coach-on-the-same-column perfect Lv${HORIZONS.join('/')} tested-save ${control.map(r => f(r.testedSave)).join(' -> ')}; gains ${control.slice(1).map((r, i) => f(r.testedSave - control[i].testedSave)).join(',')}pp; first uncapped TRAINING_PRIORITY, 2 points/set; informative second population, not a verdict`);

// Reuses tools/deadend.local.mjs's cheapest-unbought walk, with shipped prices
// and base-cell gold instead of fresh per-level simulations. Each offer is bought
// once; purchases do not change the coach population or its measured earnings.
const purchases = [
  ...Object.entries({ GLOVES, BOOTS, KITS, SOCKS, GOALS, CITIES, HAIRS, TATTOOS }).flatMap(([shelf, ranks]) => ranks.filter(r => r.cost > 0).map((r, i) => ({ name: `${shelf}/rank${i + 1}`, cost: r.cost }))),
  { name: 'pull', cost: PULL_COST },
  ...BOTS.map(b => ({ name: `bot/${b.tier}`, cost: b.cost })),
  ...BUFFS.map(b => ({ name: `buff/${b.kind}`, cost: b.cost }))
].sort((a, b) => a.cost - b.cost);
function purchaseWalk(anchors, mode, incomeScale = 1, maxSets = 400) {
  let gold = 0, bought = 0, lastBuySet = 0, longest = null;
  const gaps = [];
  for (let set = 1; set <= maxSets && bought < purchases.length; set++) {
    const level = Math.min(set + 1, 30);
    const upper = anchors.findIndex(r => r.level >= level);
    const i = upper < 0 ? anchors.length - 1 : Math.max(1, upper);
    const lo = anchors[i - 1], hi = anchors[i];
    gold += incomeScale * (lo.goldPerSet + (hi.goldPerSet - lo.goldPerSet) * (level - lo.level) / (hi.level - lo.level));
    while (bought < purchases.length && gold >= purchases[bought].cost) {
      const purchase = purchases[bought++];
      gold -= purchase.cost;
      const gap = set - lastBuySet;
      gaps.push(gap);
      if (!longest || gap > longest.gap) longest = { gap, from: lastBuySet, set, purchase };
      lastBuySet = set;
    }
  }
  const exception = ACCEPTED_ASYMMETRIES.find(e => e.row === 'deadend:the-next-purchase-or-unlock-is-within-N-sets' && e.mode === mode);
  const status = bought < purchases.length ? 'INSUFFICIENT EVIDENCE' : longest.gap <= N_SETS ? 'PASS'
    : exception && gaps.every((gap, i) => gap <= N_SETS || purchases[i].cost >= 800) && longest.gap <= exception.bound ? 'ACCEPTED' : 'FAIL';
  return { bought, gaps, longest, status, exception };
}
for (const mode of ['hand-follow', 'bot']) {
  const anchors = LEVELS.map(level => rows.find(r => r.mode === mode && r.policy === 'coach' && r.level === level));
  console.log(`gold-per-set: ${mode}/coach ${anchors.map(r => `L${r.level}=${f(r.goldPerSet)}`).join(' ')}; linear between anchors, last slope extended to L30; coinGain(conceded,fame,untested) over 5 shots`);
  const { bought, gaps, longest, status, exception } = purchaseWalk(anchors, mode);
  // HOTL 가설: 각 레벨의 같은 시드 블록을 함께 재표집해 수입→구매 간격의 전파 오차를 잰다.
  // 열 두 개는 수입 합과 세트 수의 짝이고 배율 1은 원 단위인 세트 간격을 유지한다.
  resolution(`product-pop/${mode}/purchase-gap`,anchors[0].goldSamples.map((_,i)=>anchors.flatMap(a=>a.goldSamples[i])),1,
    sums=>purchaseWalk(anchors.map((a,i)=>({...a,goldPerSet:sums[i*2]/sums[i*2+1]})),mode).longest.gap);
  verdict('deadend:the-next-purchase-or-unlock-is-within-N-sets', status, status === 'ACCEPTED'
    ? `${mode} longest=${longest.gap} <= bound ${exception.bound} at ${exception.where}; accepted asymmetry, ${exception.record}; N=${N_SETS} remains the trigger elsewhere`
    : `${mode} N=${N_SETS} sets; purchases=${bought}/${purchases.length} within 400 sets; gaps=${gaps.join(',')}; longest=${longest?.gap ?? 'unavailable'} sets${longest ? ` at sets ${longest.from}->${longest.set} ${longest.purchase.name} cost=${longest.purchase.cost}` : ''}; HOTL hypothesis, lap record decides the red`);
}
// 수입 절반 대조는 수락한 두 입력 모드를 모두 검사한다. 수락 예외가 실제 진행 손실까지 가려서는 안 된다.
for (const mode of ['hand-follow', 'bot']) {
  // 수입 절반은 기존 400세트 관측 지평도 같은 비율로 늘려 완주 후 간격을 잰다. 제품 지평은 바꾸지 않는다.
  const halvedIncome = purchaseWalk(LEVELS.map(level => rows.find(r => r.mode === mode && r.policy === 'coach' && r.level === level)), mode, 0.5, 400 / 0.5);
  verdict('control:a-halved-income-walk-still-fails-the-N-sets-row', halvedIncome.status === 'FAIL' ? 'PASS' : 'FAIL', `${mode} income=0.5 longest=${halvedIncome.longest?.gap ?? 'unavailable'} sets; N-sets verdict=${halvedIncome.status}`);
}
verdict('experience:intended-experience-is-human-judged', 'HITL', 'absent; recorded 2026-09-18; a play session is scheduled by the loop and the row never blocks a lap');
const imprecise = precision.filter(({ hw }) => !(hw < TOLERANCE));
verdict('precision:every-verdict-row-resolves-the-tolerance', imprecise.length ? 'INSUFFICIENT EVIDENCE' : 'PASS', `max half-width=${f(Math.max(...precision.map(({ hw }) => hw)))}pp tolerance=${TOLERANCE}pp balls=${BALLS}/cell; ` + (imprecise.length ? imprecise.map(({ row, hw }) => `${row} +/-${f(hw)}pp`).join('; ') : 'all dominance conservative gaps and coach independent-sample intervals resolve the tolerance'));
for (const r of rows.filter(r => r.policy === 'coach')) {
  const top = Object.entries(r.causes).sort((a, b) => b[1] - a[1])[0];
  verdict('cause:the-concession-label-is-not-one-stat-on-the-coach-population', 'DIAGNOSTIC', `${r.mode} Lv${r.level} top=${top?.[0] || 'none'} share=${f(100 * (top?.[1] || 0) / r.conceded)}%`);
}
// 같은 상대와 결과 난수에서는 미시험 슛도 같아야 두 분모의 순서를 비교할 수 있다.
const sameOrder = group => group.every(a => group.every(b => Math.sign(a.nonconcession - b.nonconcession) === Math.sign(a.testedSave - b.testedSave)));
for (const mode of ['hand-bait-react', 'hand-bait']) {
  const legacy = POLICIES.map(policy => measure(policy, LEVELS[0], mode, null, true));
  verdict('control:policy-coupled-shots-break-denominator-order', !sameOrder(legacy) ? 'PASS' : 'FAIL', `${mode} Lv${LEVELS[0]} old-order-verdict=${sameOrder(legacy) ? 'PASS' : 'FAIL'} tested=${legacy.map(r => r.tested).join(',')}`);
}
for (const mode of MODES) for (const level of LEVELS) {
  const group = rows.filter(r => r.mode === mode && r.level === level);
  verdict('instrument:policies-share-tested-shot-population', group.every(r => r.tested === group[0].tested) ? 'PASS' : 'FAIL', `${mode} Lv${level} tested=${group.map(r => r.tested).join(',')}`);
  const ordered = key => [...group].sort((a, b) => b[key] - a[key]).map(r => r.policy).join('>');
  // Compare pairwise signs too: a tie in only one denominator is disagreement.
  const agrees = sameOrder(group);
  verdict('instrument:both-denominators-agree-in-ordering', agrees ? 'PASS' : 'FAIL', `${mode} Lv${level} nonconcession=${ordered('nonconcession')} tested-save=${ordered('testedSave')}`);
}
console.log(`product-pop ${Object.entries(counts).map(([status, count]) => `${status} ${count}`).join('; ')}; elapsed=${f((Date.now() - started) / 1000)}s`);
process.exitCode = counts.FAIL ? 1 : 0;
