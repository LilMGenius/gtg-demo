// 재화는 처음부터 두 갈래다. 코인은 시간으로 벌고, 캐시는 결제로만 들어온다.
// 하나로 시작해 나중에 쪼개면 이미 나간 저장의 잔액을 어느 쪽으로 옮길지 정할 수 없고,
// 그 판단은 결제한 사람과 안 한 사람 중 한쪽을 반드시 손해 보게 만든다.

// 이 파일에 캐시를 올리는 함수는 없다. 없는 것이 이 랩의 산출물이다.
// 결제 경로는 상점이 열리는 칸에서 들어오고, 그때까지 캐시는 저장 자리만 지킨다.

// 한 구를 막았을 때. 5구 한 판을 다 막으면 60이고, 이 60이 코인 단가의 기준 단위다.
export const COIN_SAVE = 12;
// 먹혀도 0이 아니다. 0이면 못 막는 사람의 진행이 그 자리에서 멈추고,
// 방치형에서 멈춘 진행은 이탈이지 난이도가 아니다.
export const COIN_CONCEDED = 4;

// 이번 칸의 적립은 결과 두 갈래로만 갈린다. 키커 난이도에 비례시키는 것은 다음 칸이고,
// 둘을 같이 열면 코인 잔고가 움직인 이유가 결과인지 난이도인지 안 갈린다.
export function coinGain(conceded) {
  return conceded ? COIN_CONCEDED : COIN_SAVE;
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
