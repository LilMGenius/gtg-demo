/* 유틸 선반. 게임 판에는 아무것도 안 사고 계정의 일을 사는 물건이다. 전부 캐시로만 판다.
   골드로 열면 시간만 들이면 누구나 이름을 몇 번이고 갈아 랭킹의 얼굴이 흔들리고,
   유료 게임들이 이름 바꾸기를 유료 재화에만 거는 것도 그 까닭이다.
   값은 캐시 단위로 적는다. 골드 값에서 환산하면 골드로도 살 수 있는 물건처럼 읽힌다. */
export const UTILS = [
  // 닉네임 변경권. 사는 순간 쓴다. 들고 있다가 쓰는 권이면 쓰는 자리가 따로 있어야 하는데,
  // 이름을 바꾸려고 상점에 온 사람에게 그 자리는 한 번 더 찾아가야 하는 문이다.
  { id: 'rename', name: '닉네임 변경권', cash: 30 }
];

/* 닉네임 변경권의 값은 바꾼 횟수만큼 오른다. 첫 이름은 가입 때 공짜로 정하고, 그 뒤는 한 번마다 첫 값만큼 더 받는다.
   이름이 랭킹의 얼굴이라 자주 갈수록 비싸야 한 번의 변경이 신중해진다. 첫 값의 열 배에서 멈춘다. */
export function renamePrice(renames) {
  const base = UTILS[0].cash;
  return Math.min(base * 10, base * (1 + Math.max(0, Math.floor(Number(renames) || 0))));
}

export function utilAt(id) {
  return UTILS.find((u) => u.id === id) || null;
}

// 캐시로만 치른다. 모자라면 아무것도 안 빠진다.
export function payCash(wallet, cash) {
  const n = Math.max(0, Math.floor(Number(cash) || 0));
  if (!wallet || wallet.cash < n) return false;
  wallet.cash -= n;
  return true;
}

