// 위치 모집단: 수동은 hand-react(p_read=0.9), 자동은 botPlan 자취다. tools/position-pop.mjs가 난수 경계를 짝짓는다.
import { modifierContract } from "./modifier-contract.mjs";
import { makeRng, buildSet, resolve, newKeeper, positionInput } from "./position-pop.mjs";
import { GROWABLE } from "../src/ledger.mjs";
import { BOTS, botKeeper } from "../web/src/state/bot.mjs";

// 봇 선반 효과 게이트. 클론 세 등급이 값을 치른 만큼 실제로 대신 막아주는가.
// 상거래도 효과도 어떤 게이트도 이 선반을 안 봤다. 등급과 가격이 있으면 사다리와 값당을 잰다.
// 브라우저를 안 띄운다. 판정은 src/chain.mjs 순수 함수고 봇은 judgement 한 칸만 갈아끼운다.
// main.mjs의 위치 경로는 botKeeper를 입력과 resolve 양쪽에 쓴다. 이전 입력 전용 모집단은 음성 대조로 남긴다.

// 2000시드 x 5구 = 10000구. gear-effect-gate와 같은 표본이라 수치를 나란히 읽을 수 있다.
const SEEDS = 2000;

const fails = [], notes = [];
const check = (n, ok, d) => (ok ? notes : fails).push(n + " " + d);

// 저 judgement 신인 한 명으로 고정한다. 봇이 갈아끼우는 칸이 바로 그 칸이라 차이가 보인다.
const base = newKeeper();

// tier 0은 봇 없이 도는 자동이다. 사람이 안 누를 때의 바닥이 사다리의 첫 칸이다.
// hand는 공유 손 반응 정책이다. 봇과 같은 정보로 움직이는 손의 성과를 잰다.
function sweep(opt) {
  const o = opt || {};
  // 표본을 밖에서 넘길 수 있어야 한다. 고정되어 있으면 만렘 축을 붙여도 신인만 재고 조용히 초록을 낸다.
  const who = o.keeper || base;
  const inputKeeper = o.tier ? botKeeper(who, { tier: o.tier }) : who;
  const keeper = o.oldPopulation ? who : inputKeeper;
  let saved = 0, shots = 0;
  for (let s = 0; s < SEEDS; s++) {
    const set = buildSet(makeRng(s + 1), 5, 0);
    const rng = makeRng(s + 90001);
    for (const shot of set) {
      const arg = { keeper, shot, rng };
      // 손은 공유 반응 정책을 쓰고 전진과 다이빙은 제품 판정이 결정한다.
      if (o.centre) arg.input = positionInput(who, shot, rng, "hand-centre");
      else if (o.hand) arg.mode = 'hand-react';
      else arg.input = positionInput(inputKeeper, shot, rng, 'bot');
      const r = resolve(arg);
      shots++;
      if (!r.conceded) saved++;
    }
  }
  return { rate: saved / shots * 100, shots };
}

const F = (x) => x.toFixed(2);

// 판단력 하한 1, 중간 5, 상한 10만 바꿔 등급 효과와 분리한 세이브 사다리를 잰다.
const judgementRungs = [1, 5, 10].map(judgement => sweep({ keeper: { ...base, judgement } }).rate);
check("judgement:save-rate-rises", judgementRungs.every((rate, i) => !i || rate > judgementRungs[i - 1]), judgementRungs.map(F).join(" -> "));
// 판단력 상한 10의 봇이 같은 키퍼의 중앙 대기보다 나아야 방치 제어에 의미가 있다.
const centreAtMax = sweep({ keeper: { ...base, judgement: 10 }, centre: true }).rate;
check("judgement:high-bot-beats-centre", judgementRungs.at(-1) > centreAtMax, F(judgementRungs.at(-1)) + " > " + F(centreAtMax));

// 대조군. 같은 조건 두 번이 완전히 같아야 나머지 차이가 봇 몫으로 읽힌다.
const c1 = sweep({});
const c2 = sweep({});
check("control", c1.rate === c2.rate, "rate " + F(c1.rate) + " vs " + F(c2.rate));

const RANKS = [0, 1, 2, 3];
const rungs = RANKS.map((t) => sweep({ tier: t }));
const rate = RANKS.map((t) => Number(rungs[t].rate.toFixed(4)));
const line = rate.map(F).join(" -> ");
const oldRate = RANKS.map(t => sweep({ tier: t, oldPopulation: true }).rate);
console.log("ladder live " + line);
console.log("ladder old-population " + oldRate.map(F).join(" -> "));
check("control:the-old-population-omitted-live-bot-judgement",
  Math.abs(oldRate[3] - rungs[3].rate) > 0,
  "tier3 old " + F(oldRate[3]) + " live " + F(rungs[3].rate));

// tier 0과 tier 1은 judgement가 둘 다 3이다. 코드 사실이라 동률을 허용한다.
// 문턱을 내린 것이 아니라 1등급 봇이 맨몸 자동과 같은 판단력이라는 사실을 그대로 적은 것이다.
check("mono-bot-save-floor", rate[1] >= rate[0], line);
// 값이 오르는 구간은 1에서 3이다. 여기서는 동률을 허용하지 않는다.
check("mono-bot-save", rate[2] > rate[1] && rate[3] > rate[2], line);

// 값당. 1골드가 사는 자동 세이브량은 등급 길이까지 곱한다. 90분짜리는 20분짜리보다 오래 서 있다.
const spec = (t) => BOTS.find((b) => b.tier === t);
const VALUE_FLOOR = 0.4;
// 기준선은 rate[0]이 아니라 rate[t] 전체다. 봇이 파는 물건은 세이브율 증분이 아니라 그 시간 동안 서 있어 주는 것 자체다.
// 1등급은 맨몸 자동과 판단력이 같아 증분이 0이고, 증분 기준으로는 분모가 0이 되어 축 자체가 성립하지 않는다.
const per = (t) => spec(t).minutes * rate[t] / spec(t).cost;
const p1 = per(1), p3 = per(3);
const ratio = p3 / p1;
check("value-bot-save", p1 > 0 && ratio >= VALUE_FLOOR,
  "r1 " + p1.toExponential(2) + " r3 " + p3.toExponential(2) + " ratio " + ratio.toFixed(2));

// 선반의 첫 등급도 값을 해야 한다. 1등급이 맨몸 자동과 같은 수를 내면 그 150 골드가 사는 것은
// 성능이 아니라 자동 접근권뿐이고, 접근권은 크레딧이 파는 것이지 등급이 파는 것이 아니다.
// 위 값당 축은 이 동률을 분모 0 문제로 우회했다. 우회는 사실을 설명할 뿐 고치지 않는다.
check("tier1:buys-something", rate[1] > rate[0], F(rate[0]) + " -> " + F(rate[1]));

// botKeeper는 판단력을 대입한다. 최대값이 아니라 덮어쓰기라, 키퍼 판단력이 봇보다 높으면
// 봇을 켜는 순간 그만큼 내려간다. 만렙 키퍼는 판단력이 10이고 최상급 봇도 9라 모든 등급이 손해가 된다.
// 이 축이 없으면 선반 전체가 후반에 함정이 되는 것을 신인 표본만으로는 영영 못 본다.
const top = newKeeper();
for (const s of GROWABLE) top[s] = 10;
const topBare = sweep({ keeper: top }).rate;
const worst = [];
for (const b of BOTS) {
  const r = sweep({ keeper: top, tier: b.tier }).rate;
  if (r < topBare) worst.push("t" + b.tier + " " + F(r));
}
check("bot:never-downgrades-at-max", worst.length === 0,
  "bare " + F(topBare) + " but " + (worst.join(", ") || "no tier falls below"));

// 라이브 봇의 판단력 보정까지 적용한 최상급 클론도 숙련 손 아래여야 한다.
const hand = sweep({ hand: true });
check("bot-below-hand", rate[3] < hand.rate, "bot3 " + F(rate[3]) + " hand " + F(hand.rate));

modifierContract({ gate: "bot-effect", fields: ["bot1","bot2","bot3"], engine: { makeRng, buildSet, resolve, newKeeper }, growable: GROWABLE, botKeeper, check });

for (const n of notes) console.log("ok  " + n);
for (const n of fails) console.log("BAD " + n);
console.log("bot-effect " + (fails.length ? "FAIL " + fails.length : "PASS"));
process.exitCode = fails.length ? 1 : 0;
