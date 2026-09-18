import { makeRng, newKeeper, keeperAtLevel, rollForm, buildSet, resolve, autoInput } from '../src/chain.mjs';
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
const LEVELS = [1, ...HORIZONS];
const MANUAL = ['lowest', 'random', 'greedy'];
const POLICIES = ['reference', 'coach', ...MANUAL];
const PATH = GROWABLE.filter(s => !['goalKick', 'throwing', 'mischief', 'communication'].includes(s));
const f = n => Number.isFinite(n) ? n.toFixed(2) : 'unavailable';
const unresolved = g => !g.tested || g.d - g.hw <= 0 && g.d + g.hw >= 0;
const counts = { FAIL: 0, PASS: 0, 'INSUFFICIENT EVIDENCE': 0, HITL: 0, DIAGNOSTIC: 0 };
function verdict(name, status, detail) {
  counts[status]++;
  console.log(`${status} ${name} ${detail}`);
}

function population(policy, level, rng) {
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

function measure(policy, level, mode, contrast = null) {
  const gains = (policy === 'fixed-order' ? [] : contrast ? [contrast] : PATH).map(stat => ({ stat, eligible: 0, tested: 0, baseSaved: 0, bumpSaved: 0, n10: 0, n01: 0 }));
  let conceded = 0, tested = 0, gold = 0;
  const causes = {};
  for (let s = 0; s < BALLS / 5; s++) {
    if (Date.now() - started >= WATCHDOG) { console.error('product-pop FAIL watchdog'); process.exit(1); }
    const source = makeRng(1000003 + s + level * 7919);
    const keeper = population(policy, level, source);
    rollForm(keeper, source);
    const shots = buildSet(source, level);
    // A cached stream lets counterfactuals look ahead without moving the base.
    // Reset at each shot and at the autoInput/resolve boundary: conditional
    // input draws must not change whether the kicker missed the goal.
    const tape = [];
    const at = i => { while (tape.length <= i) tape.push(source()); return tape[i]; };
    let cursor = 0;
    const rng = () => at(cursor++);
    const variants = gains.map(g => {
      if (keeper[g.stat] >= 10) return null;
      g.eligible++;
      return { ...keeper, [g.stat]: contrast ? 10 : Math.min(10, keeper[g.stat] + 1) };
    });
    for (const shot of shots) {
      const start = cursor;
      const input = mode === 'auto' ? undefined : { dive: mode === 'perfect' ? shot.side : Number(mode.slice(5)), errMs: 0, advance: 0, auto: false };
      const base = resolve({ keeper, shot, rng, input });
      if (policy === 'coach' && !contrast) gold += coinGain(base.conceded, base.fame, base.untested);
      if (!base.untested) tested++;
      if (base.conceded) { conceded++; causes[base.cause] = (causes[base.cause] || 0) + 1; }
      let chainStart = start;
      if (mode === 'auto') autoInput(keeper, shot, () => at(chainStart++));
      for (let i = 0; i < gains.length; i++) {
        const grown = variants[i];
        if (!grown) continue;
        let pos = start;
        const bumpedInput = mode === 'auto' ? autoInput(grown, shot, () => at(pos++)) : input;
        pos = chainStart;
        const bump = resolve({ keeper: grown, shot, rng: () => at(pos++), input: bumpedInput });
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
  }
  for (const g of gains) {
    g.eligibility = g.eligible / (BALLS / 5);
    g.d = g.tested ? 100 * (g.n01 - g.n10) / g.tested : NaN;
    // McNemar normal approximation: paired 95% half-width =
    // 1.96 * sqrt(n10 + n01) / tested * 100 (discordant tested balls).
    g.hw = g.tested ? 1.96 * Math.sqrt(g.n10 + g.n01) / g.tested * 100 : NaN;
  }
  return { policy, level, mode, conceded, tested, nonconcession: 100 * (BALLS - conceded) / BALLS, testedSave: 100 * (tested - conceded) / tested, gains, causes, goldPerSet: gold / (BALLS / 5) };
}

console.log(`product-pop balls=${BALLS}/cell keepers=${BALLS / 5} shots/keeper=5 seed=1000003 + s + level*7919; s starts at 0`);
console.log('population: newKeeper; 2 points/set; 1 set/level; level raised before training; coach=autoTrain; manual=lowest/random/greedy; uncapped only; ties=GROWABLE order; random=seeded uniform');
console.log(`GROWABLE order: ${GROWABLE.join(',')}; body=178-198 / 74-94; no gear/recruitment`);
console.log(`coach fixed TRAINING_PRIORITY order: ${TRAINING_PRIORITY.join(',')}`);
console.log('reference=keeperAtLevel, three-of-N, 3 pts/level; kicker ramp=buildSet(rng, level), follows keeper level (balance-gate uses level 5)');
console.log('pairing: perfect x manual policies + coach; auto x coach; pref {-1,0,+1} x untrained (points unspent); auto x manual and reference are comparison controls');
console.log('input: perfect={dive:shot.side,errMs:0,advance:0,auto:false}; auto=resolve without input, bare autoInput bot floor, not botKeeper; pref={dive:state.pref,errMs:0,advance:0,auto:false}');
console.log('denominators: nonconcession=100*(balls-conceded)/balls; tested-save=100*(tested-conceded)/tested; tested excludes r.untested');
console.log('marginals: eligible keeper stat<10; baseline restricted to same keepers; paired common shot/input/resolution streams; set streak evolves separately; tested membership asserted identical');
console.log('eligibility: stats capped in more than 50% of keepers are excluded from ranking and dead verdicts; marginals are still printed with their eligibility');
console.log(`HOTL hypothesis 2026-09-18: tolerance=${TOLERANCE}pp horizons=${HORIZONS} N=${N_SETS} sets ladder floor=${LADDER_FLOOR}pp/5 levels; N milestone timing uses the purchase walk; human intended experience is not measured here`);
console.log(`HOTL hypothesis 2026-09-18 instrument choices: DEAD_UPPER=${DEAD_UPPER}pp; 50% majority eligibility filter`);
const rows = [];
for (const mode of ['perfect', 'auto', 'pref:-1', 'pref:0', 'pref:1']) {
  for (const level of LEVELS) for (const policy of mode.startsWith('pref:') ? ['untrained'] : POLICIES) {
    const r = measure(policy, level, mode);
    rows.push(r);
    console.log(`CELL ${mode} Lv${level} ${policy} nonconcession=${f(r.nonconcession)} tested-save=${f(r.testedSave)} balls=${BALLS} tested=${r.tested} conceded=${r.conceded}`);
    for (const g of r.gains) console.log(`  marginal ${g.stat} eligibility=${g.eligible}/${BALLS / 5} (${f(100 * g.eligibility)}%) tested=${g.tested} baseSaved=${g.baseSaved} bumpSaved=${g.bumpSaved} n10=${g.n10} n01=${g.n01} delta=${f(g.d)} +/-${f(g.hw)}pp ${unresolved(g) ? 'unresolved' : 'resolved'}${mode.startsWith('pref:') ? ' input-limited diagnostic' : ''}`);
  }
}

const precision = [];
for (const mode of ['perfect', 'auto', 'pref:-1', 'pref:0', 'pref:1']) {
  for (const policy of mode.startsWith('pref:') ? ['untrained'] : POLICIES) {
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
    const inputLimited = mode.startsWith('pref:');
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
for (const mode of ['perfect', 'auto']) for (const level of HORIZONS) {
  const group = rows.filter(r => r.mode === mode && r.level === level);
  const coach = group.find(r => r.policy === 'coach');
  const best = group.filter(r => MANUAL.includes(r.policy)).sort((a, b) => b.nonconcession - a.nonconcession)[0];
  const p1 = best.nonconcession / 100, p2 = coach.nonconcession / 100;
  const hw = 1.96 * Math.sqrt((p1 * (1 - p1) + p2 * (1 - p2)) / BALLS) * 100;
  const regret = best.nonconcession - coach.nonconcession;
  precision.push({ row: `coach ${mode} Lv${level}`, hw });
  verdict('coach:regret-vs-best-manual-policy-is-inside-tolerance', regret > TOLERANCE && regret - hw > 0 ? 'FAIL' : regret + hw <= TOLERANCE ? 'PASS' : 'INSUFFICIENT EVIDENCE', `${mode} Lv${level} best=${best.policy} best=${f(best.nonconcession)} coach=${f(coach.nonconcession)} regret=${f(regret)} +/-${f(hw)}pp`);
}
const ladder = HORIZONS.map(level => rows.find(r => r.mode === 'perfect' && r.policy === 'coach' && r.level === level));
// deadend:the-next-meaningful-decision-is-within-N-sets has ladder and economy halves.
// AUTONOMY, Gate axis correction: the ramped roster sits inside nonconcession;
// tested-save is the keeper's rate against that same ramp. Keep floor and horizons.
verdict('deadend:coach-ladder-gains-at-least-the-floor-per-five-levels', ladder.slice(1).every((r, i) => r.testedSave - ladder[i].testedSave >= LADDER_FLOOR * (r.level - ladder[i].level) / 5) ? 'PASS' : 'FAIL', `perfect Lv${HORIZONS.join('/')} tested-save ${ladder.map(r => f(r.testedSave)).join(' -> ')}; nonconcession ${ladder.map(r => f(r.nonconcession)).join(' -> ')}; floor=1.60pp per 8 levels`);
const control = HORIZONS.map(level => measure('fixed-order', level, 'perfect'));
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
for (const mode of ['perfect', 'auto']) {
  const anchors = LEVELS.map(level => rows.find(r => r.mode === mode && r.policy === 'coach' && r.level === level));
  console.log(`gold-per-set: ${mode}/coach ${anchors.map(r => `L${r.level}=${f(r.goldPerSet)}`).join(' ')}; linear between anchors, last slope extended to L30; coinGain(conceded,fame,untested) over 5 shots`);
  let gold = 0, bought = 0, lastBuySet = 0, longest = null;
  const gaps = [];
  for (let set = 1; set <= 400 && bought < purchases.length; set++) {
    const level = Math.min(set + 1, 30);
    const upper = anchors.findIndex(r => r.level >= level);
    const i = upper < 0 ? anchors.length - 1 : Math.max(1, upper);
    const lo = anchors[i - 1], hi = anchors[i];
    gold += lo.goldPerSet + (hi.goldPerSet - lo.goldPerSet) * (level - lo.level) / (hi.level - lo.level);
    while (bought < purchases.length && gold >= purchases[bought].cost) {
      const purchase = purchases[bought++];
      gold -= purchase.cost;
      const gap = set - lastBuySet;
      gaps.push(gap);
      if (!longest || gap > longest.gap) longest = { gap, from: lastBuySet, set, purchase };
      lastBuySet = set;
    }
  }
  const status = bought < purchases.length ? 'INSUFFICIENT EVIDENCE' : gaps.every(gap => gap <= N_SETS) ? 'PASS' : 'FAIL';
  verdict('deadend:the-next-purchase-or-unlock-is-within-N-sets', status, `${mode} N=${N_SETS} sets; purchases=${bought}/${purchases.length} within 400 sets; gaps=${gaps.join(',')}; longest=${longest?.gap ?? 'unavailable'} sets${longest ? ` at sets ${longest.from}->${longest.set} ${longest.purchase.name} cost=${longest.purchase.cost}` : ''}; HOTL hypothesis, lap record decides the red`);
}
verdict('experience:intended-experience-is-human-judged', 'HITL', 'absent; recorded 2026-09-18; a play session is scheduled by the loop and the row never blocks a lap');
const imprecise = precision.filter(({ hw }) => !(hw < TOLERANCE));
verdict('precision:every-verdict-row-resolves-the-tolerance', imprecise.length ? 'INSUFFICIENT EVIDENCE' : 'PASS', `max half-width=${f(Math.max(...precision.map(({ hw }) => hw)))}pp tolerance=${TOLERANCE}pp balls=${BALLS}/cell; ` + (imprecise.length ? imprecise.map(({ row, hw }) => `${row} +/-${f(hw)}pp`).join('; ') : 'all dominance conservative gaps and coach independent-sample intervals resolve the tolerance'));
for (const r of rows.filter(r => r.policy === 'coach')) {
  const top = Object.entries(r.causes).sort((a, b) => b[1] - a[1])[0];
  verdict('cause:the-concession-label-is-not-one-stat-on-the-coach-population', 'DIAGNOSTIC', `${r.mode} Lv${r.level} top=${top?.[0] || 'none'} share=${f(100 * (top?.[1] || 0) / r.conceded)}%`);
}
for (const mode of ['perfect', 'auto', 'pref:-1', 'pref:0', 'pref:1']) for (const level of LEVELS) {
  const group = rows.filter(r => r.mode === mode && r.level === level);
  const ordered = key => [...group].sort((a, b) => b[key] - a[key]).map(r => r.policy).join('>');
  // Compare pairwise signs too: a tie in only one denominator is disagreement.
  const agrees = group.every(a => group.every(b => Math.sign(a.nonconcession - b.nonconcession) === Math.sign(a.testedSave - b.testedSave)));
  verdict('instrument:both-denominators-agree-in-ordering', agrees ? 'PASS' : 'FAIL', `${mode} Lv${level} nonconcession=${ordered('nonconcession')} tested-save=${ordered('testedSave')}`);
}
console.log(`product-pop ${Object.entries(counts).map(([status, count]) => `${status} ${count}`).join('; ')}; elapsed=${f((Date.now() - started) / 1000)}s`);
process.exitCode = counts.FAIL ? 1 : 0;
