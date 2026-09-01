// 행인 라포. 같은 동네에서 같은 사람을 반복해서 마주치면 눈이 익는다.
// 판정 안으로 새 롤을 넣지 않는다. resolve의 gazeP 식은 그대로 두고 밖에서 승수만 곱한다.
// 새 rng() 호출을 하나라도 늘리면 이후 모든 구가 밀려 shot/band/save/pose 네 게이트가 통째로 흔들린다.

// 도시마다 행인 풀이 다르다. 키는 city:passerIndex.
// 등급을 올려 새 동네로 가면 라포는 처음부터다. 아는 얼굴은 동네에 묶인다.
export function rapportKey(city, passer) {
  const c = Math.max(0, Math.min(3, Math.floor(Number(city) || 0)));
  const p = Math.floor(Number(passer));
  if (!Number.isFinite(p) || p < 0) return '';
  return c + ':' + p;
}

// 단계 문턱. talked 누계다.
// 3은 한 세트(5구)에서 운이 좋으면 닿는 수, 8과 15는 그 위로 두 배씩 벌린다.
// 뒤로 갈수록 같은 한 칸을 얻는 데 더 오래 걸려야 마지막 단계가 값을 갖는다.
export const RAPPORT_STEPS = [3, 8, 15];

// 최고 단계에 닿은 뒤로는 세지 않는다. BUFF_CAP과 같은 이유로 무한 적립을 막는다.
export const RAPPORT_CAP = 30;

// 단계당 gazeP를 10%씩 좁힌다. 하한 0.7은 resolve의 클램프와 같은 값이다.
// 완전히 없애지 않는 이유는 한눈팔기가 이 게임의 웃음 축이기 때문이다. 줄이되 끄지 않는다.
const AID_STEP = 0.1;
const AID_FLOOR = 0.7;

// 단계당 팔로워 8%. 3단계 1.24는 followerGain의 rapport 클램프 상한 1.25 바로 아래다.
// 상한을 넘겨 잘리면 마지막 단계가 아무것도 안 준 것처럼 보인다.
const FANS_STEP = 0.08;

export function newRapport() {
  return {};
}

// 저장 복원은 방어적으로 클램프한다. readBuff와 같은 이유로 반쪽 상태를 살려두지 않는다.
export function readRapport(raw) {
  if (!raw || typeof raw !== 'object') return newRapport();
  const out = {};
  for (const key of Object.keys(raw)) {
    const m = /^([0-3]):(\d{1,2})$/.exec(key);
    if (!m) continue;
    const n = Number(raw[key]);
    if (!Number.isFinite(n) || n < 1) continue;
    out[key] = Math.min(RAPPORT_CAP, Math.floor(n));
  }
  return out;
}

// talked가 난 구에서만 부른다. distracted는 0이다.
// 눈으로 따라간 것은 상대가 모르고, 말을 건 것만 상대에게 남는다.
export function addRapport(rapport, city, passer) {
  const key = rapportKey(city, passer);
  if (!key) return rapport || newRapport();
  const have = rapport && typeof rapport === 'object' ? rapport : newRapport();
  const next = Object.assign({}, have);
  next[key] = Math.min(RAPPORT_CAP, (Number(have[key]) || 0) + 1);
  return next;
}

export function rapportCount(rapport, city, passer) {
  const key = rapportKey(city, passer);
  if (!key || !rapport) return 0;
  const n = Number(rapport[key]);
  return Number.isFinite(n) && n > 0 ? Math.min(RAPPORT_CAP, Math.floor(n)) : 0;
}

export function rapportTier(rapport, city, passer) {
  const n = rapportCount(rapport, city, passer);
  let tier = 0;
  for (const step of RAPPORT_STEPS) if (n >= step) tier += 1;
  return tier;
}

// resolve의 input.gazeAid로 들어간다.
export function rapportGazeAid(rapport, city, passer) {
  const tier = rapportTier(rapport, city, passer);
  return Math.max(AID_FLOOR, 1 - AID_STEP * tier);
}

// followerGain의 일곱 번째 인자로 들어간다.
export function rapportBoost(rapport, city, passer) {
  return 1 + FANS_STEP * rapportTier(rapport, city, passer);
}