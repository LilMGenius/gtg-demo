// 만남. 라포 3단계는 지금 종점이 없다. 한눈팔기가 30퍼센트 줄고 팔로워가 24퍼센트 오르는 데서 멈춘다.
// 그 자리에 한 번의 만남을 두어 얼굴을 튼 것이 어디로 가는지를 만든다.
// 판정식은 건드리지 않는다. 라포 숫자와 지갑과 팔로워만 움직인다.

import { RAPPORT_CAP, RAPPORT_STEPS, rapportKey, rapportTier } from "./rapport.mjs";

// 만남이 열리는 단계. RAPPORT_STEPS의 마지막 문턱이라 열다섯 번 말을 섞어야 닿는다.
// 그보다 낮은 단계에서 열면 라포를 쌓는 구간 자체가 건너뛰어진다.
export const DATE_TIER = RAPPORT_STEPS.length;

// 만남 비용. 완봉 한 판이 60이라 세 판 조금 넘게 모으면 한 번 나간다.
// 이적시장 380보다 싸야 라포를 쌓은 쪽이 뽑기보다 손해로 느껴지지 않는다.
export const DATE_COST = 200;

// 실패하면 마지막 문턱 바로 아래로 떨어진다. 0으로 밀면 열다섯 번이 통째로 사라져
// 아무도 만남을 시도하지 않는다. 한 단계만 잃고 다시 오를 수 있어야 도박이 성립한다.
export const DATE_FAIL_COUNT = RAPPORT_STEPS[RAPPORT_STEPS.length - 1] - 1;

// 성공 팔로워. 완봉 한 구가 40대이므로 이 수는 한 판을 통째로 이긴 것과 맞먹는다.
const WIN_FANS = 600;
// 실패 팔로워. 잃는 쪽을 작게 두어야 다시 시도한다. 버는 쪽의 6분의 1이다.
const LOSE_FANS = 100;

// 세 갈래. 각각 다른 스탯이 민다. 하나의 스탯만 쓰면 만렙 키퍼에게 선택이 사라진다.
// base는 그 갈래의 밑값이고 step은 스탯 한 칸이 밀어 올리는 폭이다.
export const MOVES = [
  { id: "talk", label: "그냥 말을 건다", stat: "communication", base: 22, step: 5.4, win: "말이 통했다. 번호를 받았다", lose: "무슨 말인지 모르겠다는 표정을 했다" },
  { id: "show", label: "선방 영상을 보여준다", stat: "mischief", base: 18, step: 5.8, win: "영상을 세 번 돌려 봤다. 웃었다", lose: "영상 속에서 골을 먹고 있었다" },
  { id: "gift", label: "붕어빵을 산다", stat: "composure", base: 26, step: 4.6, win: "봉투를 받아 들고 하나를 건네줬다", lose: "방금 먹었다고 했다" }
];

export function moveAt(id) {
  return MOVES.find((m) => m.id === id) || null;
}

// 성공 확률. 스탯 3이면 밑값 근처이고 10이면 상한에 붙는다.
// 92를 상한으로 두는 이유는 확실한 성공이 되면 만남이 버튼 하나로 줄기 때문이다.
export function dateOdds(keeper, moveId) {
  const m = moveAt(moveId);
  if (!m || !keeper) return 0;
  const v = Math.max(1, Math.min(10, Number(keeper[m.stat]) || 1));
  return Math.max(5, Math.min(92, Math.round(m.base + m.step * v)));
}

// 굴림은 화면 쪽 난수로 한다. 판정용 rng를 쓰면 그 뒤 모든 구가 밀려
// shot과 band와 save와 pose 게이트가 통째로 흔들린다.
export function dateOutcome(keeper, moveId, roll) {
  const m = moveAt(moveId);
  if (!m) return null;
  const odds = dateOdds(keeper, moveId);
  const won = Number(roll) < odds;
  return { won, odds, line: won ? m.win : m.lose, fans: won ? WIN_FANS : -LOSE_FANS };
}

// 만남이 끝난 자리의 라포. 성공은 상한까지 채우고 실패는 마지막 문턱 아래로 내린다.
export function applyDate(rapport, city, passer, won) {
  const key = rapportKey(city, passer);
  if (!key) return rapport || {};
  const next = Object.assign({}, rapport || {});
  next[key] = won ? RAPPORT_CAP : DATE_FAIL_COUNT;
  return next;
}

// 만남을 열 수 있는지. 단계와 지갑 둘 다 본다.
// 못 누르는 이유를 화면이 글자로 말해야 하므로 사유를 같이 낸다.
export function dateGate(rapport, city, passer, coin) {
  const tier = rapportTier(rapport, city, passer);
  if (tier < DATE_TIER) return { open: false, why: "아직 얼굴만 아는 사이다" };
  const short = DATE_COST - (Number(coin) || 0);
  // 값은 수로만 낸다. 여기서 재화 이름을 글자로 박으면 화면이 아이콘으로 그리는 표기와 갈린다.
  if (short > 0) return { open: false, short };
  return { open: true, cost: DATE_COST };
}
