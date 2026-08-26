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

export function save(keeper, auto) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ keeper, auto, at: Date.now() }));
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
