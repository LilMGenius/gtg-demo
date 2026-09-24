// 호출자가 준 엔진으로 짝 표본을 잰다. 부모 대조는 부모 소스와 그 입력 계약을 함께 제공한다.
export function modifierContract({ gate, fields, engine, growable, botKeeper, check }) {
  const { makeRng, buildSet, resolve, newKeeper } = engine;
  const measure = (level, field) => {
    let saved = 0;
    const keeper = newKeeper();
    for (const stat of growable) keeper[stat] = level;
    const bot = field?.startsWith('bot') ? Number(field.slice(3)) : 0;
    const who = bot ? botKeeper(keeper, { tier: bot }) : keeper;
    for (let seed = 0; seed < 2000; seed++) {
      const rng = makeRng(seed + 90001);
      for (const shot of buildSet(makeRng(seed + 1), 5, 0)) {
        const arg = { keeper: who, shot, rng };
        arg.mode = gate === 'bot-effect' ? 'bot' : 'hand-react';
        if (field === 'rapport') arg.gazeAid = 0.7;
        else if (field === 'rosin') arg.rosin = true;
        else if (field && !bot) arg[field] = 3;
        if (!resolve(arg).conceded) saved++;
      }
    }
    return saved;
  };
  const low = measure(1), high = measure(10), trained = high - low;
  for (const field of fields) {
    const lowGain = measure(1, field) - low;
    const gain = measure(10, field) - high;
    const detail = `f0 ${lowGain} f1 ${gain} training ${trained} saves / 10000`;
    check(`${gate}:${field}-gains-at-max-f`, gain > 0, detail);
    check(`${gate}:${field}-gain-at-max-is-below-trained-gain`, gain > 0 && gain < trained, detail);
  }
}
