import { population } from './product-population.mjs';
import { makeRng, buildSet, rollForm, resolve, positionInput } from './position-pop.mjs';
import { BOTS, botKeeper } from '../web/src/state/bot.mjs';

// product-pop의 시드·정책·훈련과 제품 botKeeper를 재사용한다. 표본마다 실제 제시된 등급만 비교한다.
export function botTierContract({ levels, balls, check, denseBalls = balls }) {
  for (const level of levels) for (const policy of ['reference', 'coach', 'lowest', 'random', 'greedy']) {
    // 기존 P28 제시 레벨은 정밀 표본, 사이 레벨은 회귀 표본이다. 두 분모를 모두 인쇄한다.
    const count = [1, 5, 13, 21].includes(level) ? denseBalls : balls;
    const tiers = [0, ...BOTS.filter(b => !b.condition || level >= b.condition.min).map(b => b.tier)];
    const modes = ['hand-react', 'hand-follow', 'planted-hand-bot', ...tiers.map(t => 'bot-' + t)];
    const saved = Object.fromEntries(modes.map(m => [m, 0]));
    for (let s = 0; s < count / 5; s++) {
      // 기존 제품 모집단의 소수 씨앗 간격과 다섯 슛 묶음을 그대로 쓴다.
      const source = makeRng(1000003 + s + level * 7919);
      const base = population(policy, level, source); rollForm(base, source);
      const keepers = Object.fromEntries(modes.map(m => [m, m.startsWith('bot-') ? botKeeper({ ...base }, { tier: Number(m.slice(4)) }) : { ...base }]));
      for (const shot of buildSet(makeRng(1000003 + s + level * 7919), level)) for (const mode of modes) {
        const seed = 1000003 + s * 7919 + level * 31 + shot.index, keeper = keepers[mode];
        const r = resolve({ keeper, shot, rng: makeRng(seed), input: positionInput(keeper, shot, makeRng(seed + 1), mode.startsWith('bot-') ? 'bot' : mode === 'planted-hand-bot' ? 'hand-follow' : mode) });
        if (!r.conceded && !r.untested) saved[mode]++;
      }
    }
    for (const tier of tiers) for (const hand of ['hand-react', 'hand-follow']) {
      const bot = saved['bot-' + tier];
      check('trade:bought-bot-below-hand', bot < saved[hand], `${policy} Lv${level} tier=${tier} ${hand} bot=${bot} hand=${saved[hand]} shots=${count}`);
    }
    // 손과 동일한 결과를 내는 봇을 심으면 엄격한 열위가 반드시 거부해야 한다.
    check('control:hand-equivalent-bot-is-rejected', !(saved['planted-hand-bot'] < saved['hand-follow']) && saved['hand-follow'] > 0, `${policy} Lv${level} positive-hand=${saved['hand-follow']}`);
  }
}
