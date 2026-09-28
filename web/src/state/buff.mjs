// 소모형 버프. 봇과 같은 이유로 SHELVES에 못 들어간다. 등급을 사서 영구히 갖는 물건이 아니다.
// 단위는 실시간 분이 아니라 구다. 봇 크레딧이 botTick 호출 시점에만 깎여
// 탭을 방치한 동안에는 줄지 않는 미결을 여기서 반복하지 않는다. 구는 실제로 일한 구에서만 깎인다.

// 값 기준은 봇, 장비 선반과 같다. 전 칸이 이적시장 380 골드 미만이다. 소모형이라 다시 산다.
// 지속은 셋 다 두 판(한 판 다섯 구)이다. 종류마다 12, 8, 10으로 갈라 두었을 때 근거가 어디에도 없어
// 사는 사람이 횟수 차이를 읽으려 했다. 차이는 효과와 값이 말하고, 지속은 판 단위로 맞춘다.
export const BUFF_SHOTS = 10;
export const BUFFS = [
  { kind: 'tonic', name: '자양강장제', cost: 220, shots: BUFF_SHOTS, note: '한눈팔기와 수다가 반으로 준다. 수다로 버는 팔로워가 반으로 준다' },
  { kind: 'hype', name: '바이럴 떡밥', cost: 260, shots: BUFF_SHOTS, note: '소문이 1.5배로 퍼진다. 막는 실력과는 무관하다' },
  { kind: 'rosin', name: '송진 스프레이', cost: 300, shots: BUFF_SHOTS, note: '장갑 한 등급이 손에 더 붙는다. 3등급도 이득이다' }
];

// 무한 적립 금지. BOT_CAP 여섯 시간과 같은 이유로 구에도 천장을 둔다. 네 번 산 만큼이다.
export const BUFF_CAP = BUFF_SHOTS * 4;

export function newBuff() {
  return { kind: '', shots: 0 };
}

export function buffAt(kind) {
  return BUFFS.find((b) => b.kind === kind) || null;
}

export function readBuff(raw) {
  if (!raw || typeof raw !== 'object') return newBuff();
  const spec = buffAt(String(raw.kind || ''));
  const n = Number(raw.shots);
  const left = Number.isFinite(n) ? Math.min(BUFF_CAP, Math.max(0, Math.floor(n))) : 0;
  // 종류만 있고 구가 없거나 그 반대인 저장은 둘 다 죽인다. readBot과 같은 이유로 반쪽 상태는 배지가 거짓말을 한다.
  if (!spec || !left) return newBuff();
  return { kind: spec.kind, shots: left };
}

// 한 슬롯이다. 같은 종류를 사면 구가 더해지고, 다른 종류는 활성 중 못 산다.
export function addBuff(buff, kind) {
  const spec = buffAt(kind);
  if (!spec) return buff;
  const have = buff && buff.shots > 0 ? buff : newBuff();
  if (have.kind && have.kind !== spec.kind) return have;
  return { kind: spec.kind, shots: Math.min(BUFF_CAP, have.shots + spec.shots) };
}

// 구가 하나 끝날 때 부른다. 0이 되면 슬롯이 비어 다른 종류를 살 수 있다.
export function spendBuff(buff) {
  if (!buff || !buff.shots) return newBuff();
  const left = buff.shots - 1;
  return left > 0 ? { kind: buff.kind, shots: left } : newBuff();
}
