// 봇. 클론이 대신 서고 그 경기 데이터가 실제 키퍼에게 전수된다는 설정이라
// 성장은 남지만 화제는 안 남는다. 봇이 뛴 구는 팔로워가 0이다.
// 순수 상승이 아니라 교환이다. 잘 막는 대신 사고가 안 나서 아무도 안 본다.

// 시간제 크레딧으로 판다. 등급을 사서 영구히 갖는 물건이면 한 번 사고 축이 죽는다.
// 값 기준은 장비 선반과 같다. 첫 칸은 카드깡 380 땀보다 싸고 마지막 칸은 그보다 비싸다.
export const BOTS = [
  { tier: 1, name: '중고 훈련용 더미', cost: 150, minutes: 20, judge: 3, note: '판단력 3짜리 고철. 서 있기는 한다' },
  { tier: 2, name: '동네 공업사 클론', cost: 390, minutes: 45, judge: 6, note: '판단력 6. 사람 흉내는 낸다' },
  { tier: 3, name: '연구소 유출 피지컬 AI', cost: 840, minutes: 90, judge: 9, note: '판단력 9. 어디서 나왔는지 묻지 않는다' }
];

export const MAX_BOT = BOTS.length;

// 저장에 들어온 큰 수를 믿으면 영구 자동이 된다. 여섯 시간이 상한이다.
export const BOT_CAP = 6 * 60 * 60 * 1000;

export function newBot() {
  return { tier: 0, ms: 0 };
}

export function readBot(raw) {
  if (!raw || typeof raw !== 'object') return newBot();
  const tier = Math.min(MAX_BOT, Math.max(0, Math.floor(Number(raw.tier) || 0)));
  const ms = Number(raw.ms);
  const left = Number.isFinite(ms) ? Math.min(BOT_CAP, Math.max(0, ms)) : 0;
  // 등급만 있고 시간이 없거나 그 반대인 저장은 둘 다 죽인다. 반쪽 상태는 배지가 거짓말을 한다.
  if (!tier || !left) return newBot();
  return { tier, ms: left };
}

export function botAt(tier) {
  return BOTS.find((b) => b.tier === Number(tier)) || null;
}

// 봇이 서면 판단력만 봇 값으로 바꾼 얕은 복사를 돌려준다.
// autoInput은 keeper.judgement 하나만 읽으므로 chain.mjs를 건드리지 않는다.
export function botKeeper(keeper, bot) {
  const spec = botAt(bot && bot.tier);
  if (!spec) return keeper;
  return { ...keeper, judgement: spec.judge };
}
