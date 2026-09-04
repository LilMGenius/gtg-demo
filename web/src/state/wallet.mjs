// 재화는 처음부터 두 갈래다. 육수은 시간으로 벌고, 스폰은 결제로만 들어온다.
// 하나로 시작해 나중에 쪼개면 이미 나간 저장의 잔액을 어느 쪽으로 옮길지 정할 수 없고,
// 그 판단은 결제한 사람과 안 한 사람 중 한쪽을 반드시 손해 보게 만든다.

// 이 파일에 스폰을 올리는 함수는 없다. 없는 것이 이 랩의 산출물이다.
// 결제 경로는 상점이 열리는 칸에서 들어오고, 그때까지 스폰은 저장 자리만 지킨다.

// 한 구를 막았을 때. 5구 한 판을 다 막으면 60이고, 이 60이 육수 단가의 기준 단위다.
export const COIN_SAVE = 12;
// 먹혀도 0이 아니다. 0이면 못 막는 사람의 진행이 그 자리에서 멈추고,
// 방치형에서 멈춘 진행은 이탈이지 난이도가 아니다.
export const COIN_CONCEDED = 4;

// 유명한 키커 한 계단당 붙는 값. 로스터 fame은 1에서 10이므로 최상급 세이브는 30이고,
// 무명 세이브 12의 두 배 반이다. 세 배를 넘기면 무명 구간을 건너뛰는 것이 최적이 되고,
// 방치형에서 건너뛸 수 있는 구간은 콘텐츠가 아니라 대기시간이 된다.
export const COIN_FAME_STEP = 2;

// 전 스탯이 상한에 닿으면 훈련 한 회는 올릴 칸이 없어 사표가 된다.
// 그 한 회를 육수 24로 받는다. 무명 세이브 두 번 몫이고 완봉 한 판 60의 40이라,
// 성장이 남은 구간을 일부러 건너뛰는 것이 이득이 되지 않는다.
export const COIN_DRILL = 24;

// 어려운 키커일수록 막기는 어렵고 보상은 크다. 난이도는 세이브에만 붙는다.
// 실점에도 붙이면 유명한 키커에게 일부러 먹히는 것이 최적 전략이 되고,
// 그 순간 막는 행위가 게임에서 빠진다.
export function coinGain(conceded, fame = 1) {
  if (conceded) return COIN_CONCEDED;
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
