// 재화는 처음부터 두 갈래다. 골드는 시간으로 벌고, 캐시는 결제로만 들어온다.
// 하나로 시작해 나중에 쪼개면 이미 나간 저장의 잔액을 어느 쪽으로 옮길지 정할 수 없고,
// 그 판단은 결제한 사람과 안 한 사람 중 한쪽을 반드시 손해 보게 만든다.

// 캐시 충전은 별도 경로다. 선반에서는 골드와 캐시 중 한 갈래만 지출한다.

// 한 구를 막았을 때. 5구 한 판을 다 막으면 60이고, 이 60이 골드 단가의 기준 단위다.
export const COIN_SAVE = 12;
// 시험값, 1 캐시 = 10 골드, 가장 싼 장비 150 골드가 15 캐시로 읽히는 소액 팩 관행; 실측이 갱신한다.
export const CASH_RATE = 10;
// 캐시는 정수이고 올림이라 캐시로 사는 쪽이 골드보다 싸지지 않는다.
export const cashPrice = (gold) => Math.ceil(gold / CASH_RATE);

export function pay(wallet, gold, currency) {
  const key = currency === 'cash' ? 'cash' : 'coin';
  const amount = key === 'cash' ? cashPrice(gold) : gold;
  if (wallet[key] < amount) return false;
  wallet[key] -= amount;
  return true;
}
// 먹혀도 0이 아니다. 0이면 못 막는 사람의 진행이 그 자리에서 멈추고,
// 방치형에서 멈춘 진행은 이탈이지 난이도가 아니다.
export const COIN_CONCEDED = 4;

// 유명한 키커 한 계단당 붙는 값. 로스터 fame은 1에서 10이므로 최상급 세이브는 30이고,
// 무명 세이브 12의 두 배 반이다. 세 배를 넘기면 무명 구간을 건너뛰는 것이 최적이 되고,
// 방치형에서 건너뛸 수 있는 구간은 콘텐츠가 아니라 대기시간이 된다.
export const COIN_FAME_STEP = 2;

// 전 스탯이 상한에 닿으면 훈련 한 회는 올릴 칸이 없어 사표가 된다.
// 판당 두 회를 각각 골드 12로 받는다. 판당 환전은 골드 24로 유지하므로,
// 성장이 남은 구간을 일부러 건너뛰는 것이 이득이 되지 않는다.
export const COIN_DRILL = 12;

// 어려운 키커일수록 막기는 어렵고 보상은 크다. 난이도는 세이브에만 붙는다.
// 실점에도 붙이면 유명한 키커에게 일부러 먹히는 것이 최적 전략이 되고,
// 그 순간 막는 행위가 게임에서 빠진다.
/* 헛구는 실점과 세이브 사이다. 골문은 지켜졌으니 실점보다 낫고, 막아 낸 것이 아니니
   세이브보다 낮다. 명성 배수도 안 붙는다. 유명한 키커가 헛발질한 것은 그 사람의 일이지
   이 키퍼가 한 일이 아니다. */
// 실점 4보다 위, 세이브 12보다 아래다. 순서가 이 셋의 전부다. 3으로 두면 헛구가 실점보다
// 나쁜 결과가 되어, 차라리 먹히는 쪽이 이득이라는 말이 된다.
export const COIN_WIDE = 6;
export function coinGain(conceded, fame = 1, untested = false) {
  if (conceded) return COIN_CONCEDED;
  if (untested) return COIN_WIDE;
  const f = Number.isFinite(fame) ? Math.min(10, Math.max(1, Math.floor(fame))) : 1;
  return COIN_SAVE + COIN_FAME_STEP * (f - 1);
}

export function newWallet() {
  return { coin: 0, cash: 0 };
}

// 이전 배포본 저장에는 지갑이 없다. 없으면 두 갈래 모두 0에서 시작한다.
// 한 갈래만 살아나면 나머지 한 갈래는 다음 저장에서 조용히 사라진다.
export function readWallet(raw) {
  const w = newWallet();
  if (!raw || typeof raw !== 'object') return w;
  if (Number.isFinite(raw.coin) && raw.coin >= 0) w.coin = Math.floor(raw.coin);
  if (Number.isFinite(raw.cash) && raw.cash >= 0) w.cash = Math.floor(raw.cash);
  return w;
}
