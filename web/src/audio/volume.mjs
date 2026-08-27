// 저장된 음량 읽기. BGM과 효과음이 같은 규칙을 쓴다.
// Number(null)은 0이다. 저장값이 없는 첫 방문자가 이 한 줄 때문에 음량 0으로 시작했다.
// 저장된 적이 없다는 것과 저장된 값이 0이라는 것은 다른 말이다. 숫자로 바꾸기 전에 갈라야 한다.
export function readVolume(key, fallback) {
  const raw = localStorage.getItem(key);
  if (raw === null || raw === '') return fallback;
  const v = Number(raw);
  return Number.isFinite(v) && v >= 0 && v <= 1 ? v : fallback;
}
