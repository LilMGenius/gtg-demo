// 저장. 탭을 닫으면 키퍼가 사라지는 게임은 방치형이 아니다.
// 자동은 손가락만 대신한다. 대기시간은 줄이지 않는다.
const KEY = 'gtg.save.v1';

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (!s || typeof s.keeper !== 'object' || !Number.isFinite(s.keeper.level)) return null;
    return s;
  } catch {
    return null;
  }
}

// 적립한 훈련 횟수도 같이 저장한다. 쓰지 않고 나간 포인트가 탭을 닫을 때
// 사라지면 방치형이 아니라 자리를 지키는 게임이 된다.
// 지갑은 두 갈래가 한 덩어리로 나가고 들어온다. 한 갈래만 쓰면 나머지가 다음 저장에서 지워진다.
export function save(keeper, auto, fans, points, wallet) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ keeper, auto, fans, points, wallet, at: Date.now() }));
  } catch {
    // 사파리 프라이빗 모드는 쓰기를 막는다. 저장이 안 되는 것과 게임이 죽는 것은 다른 일이다.
  }
}

// 자리를 비운 시간은 훈련 기회로만 쌓인다. 경기를 대신 뛰어주지는 않는다.
// 시계를 되돌린 사람과 몇 달 만에 돌아온 사람은 같은 상한을 받는다.
export const OFFLINE_MS = 20 * 60 * 1000;
export const OFFLINE_CAP = 12;

export function offlineGain(at, now) {
  if (!Number.isFinite(at) || !Number.isFinite(now)) return 0;
  const away = now - at;
  if (!(away > 0)) return 0;
  return Math.min(OFFLINE_CAP, Math.floor(away / OFFLINE_MS));
}

export function wipe() {
  try { localStorage.removeItem(KEY); } catch { /* 위와 같다 */ }
}
