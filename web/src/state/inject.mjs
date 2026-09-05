// 게이트와 하네스는 1레벨 신규 저장만 본다. 만렙이나 부자 상태를 재려면 매번 손으로
// 저장을 갈아끼워야 하고, 그 절차가 게이트마다 복사되면 표본이 서로 달라진다.
// 여기서 한 번만 정의하고 모든 게이트가 같은 표본을 쓴다.
//
// 판정식은 건드리지 않는다. 저장이 정상적으로 도달할 수 있는 상태를 앞당길 뿐이다.
// 도달 불가능한 값을 넣으면 그 표본으로 잰 수치는 게임의 수치가 아니다.

import { GROWABLE } from '../../../src/ledger.mjs';

// 스탯 상한. main.mjs 훈련장의 만렙 판정과 같은 값이어야 주입된 표본이 실제 만렙이 된다.
const STAT_MAX = 10;

// 만렙 표본에 훈련을 5회 남긴다. 0이면 올릴 칸도 없고 쓸 훈련도 없어
// 잉여 훈련 환전 경로가 화면에 아예 안 뜬다. 그 경로까지 재려면 남은 훈련이 있어야 한다.
export const MAXED_POINTS = 5;

/* 첫 진입이 어디까지 왔는가. 0은 키퍼 한 장, 1은 키커 열 장, 2는 끝난 상태다.
   저장에 실리는 칸이라 그 뜻은 상태 쪽이 소유하고, main의 개봉 단계가 이 수를 읽는다.
   단계를 소유한 쪽과 저장을 읽는 쪽이 각자 상수를 적으면 단계를 하나 늘린 날 한쪽만 바뀐다. */
export const ONBOARD_KEEPER = 0;
export const ONBOARD_KICKERS = 1;
export const ONBOARD_DONE = 2;

// 상점 8선반의 최상급 합이 6810이고 이적시장 한 번이 380이다. 8000이면 그 둘을 다 하고도
// 남아, 장비 표본이 살 수 있는 등급 하나에 묶이지 않는다. 완봉 한 판 60 기준 약 133판 몫이다.
export const RICH_COIN = 8000;

// 스폰은 결제로만 들어오고 이 빌드에는 결제 경로가 없다. 게이트가 스폰 칸을 읽으려면
// 주입 말고는 방법이 없다. 1000은 두 갈래가 화면에서 서로 구분되는지 보는 데 쓴다.
export const RICH_CASH = 1000;

// 만남 한 번의 실패가 100을 깎는다. 5000이면 그 오십 배라 한 번의 감소가 바닥에 안 닿는다.
// 완봉 한 구가 40대 팔로워이므로 이 수는 백 구 남짓 쌓은 자리와 같다.
export const START_FANS = 5000;

// 주입할 이용권 수. 열두 장이면 열 장 묶음 한 번을 치르고도 둘이 남아,
// 이용권이 먼저 나가고 모자란 만큼만 값이 나가는 규칙을 한 표본에서 양쪽 다 볼 수 있다.
export const TICKETS_HELD = 12;

// 프리셋은 상태를 바꾸는 함수다. 값 덩어리로 두면 어느 칸이 정본인지가 호출부로 샌다.
const PRESETS = {
  // 성장 칸 전부 상한. 체격 둘과 히든은 GROWABLE 밖이라 손대지 않는다.
  maxed(state) {
    // 정본은 squad[pick]이다. keeper는 같은 객체이므로 한쪽만 쓰면 된다.
    const head = state.squad[state.pick];
    for (const k of GROWABLE) head[k] = STAT_MAX;
    state.points = MAXED_POINTS;
  },
  // 지갑 두 갈래를 채운다. 스탯은 건드리지 않는다. 돈과 성장은 다른 축이고,
  // 한 프리셋이 둘 다 움직이면 어느 쪽이 화면을 바꿨는지 게이트가 못 가른다.
  rich(state) {
    state.wallet.coin = RICH_COIN;
    state.wallet.cash = RICH_CASH;
  },
  // 팔로워만 채운다. 팔로워는 0에서 시작하고 아래로 안 내려가므로,
  // 잃는 쪽을 재는 게이트는 신규 저장에서 감소가 0으로 보여 관측 자체가 안 된다.
  famous(state) {
    state.fans = START_FANS;
  },
  // 이적시장 이용권을 채운다. 완봉으로만 들어오므로 주입 말고는 계기가 이 칸을 만들 방법이 없다.
  // 열 장 묶음 한 번과 낱장 둘이 되는 수라, 두 자리가 서로 다르게 동작하는 것을 한 표본에서 볼 수 있다.
  ticketed(state) {
    state.tickets = TICKETS_HELD;
  },
  /* 첫 진입 개봉을 이미 마친 사람. 개봉판은 화면 전체를 덮고 그동안 어떤 창도 안 열리므로,
     창을 재는 계기가 신규 저장에서 시작하면 첫 화면에서 문이 잠긴 채로 잰다.

     끝났다고 적기만 하면 개봉이 주는 것을 안 준 사람이 되고, 그 사람은 아무도 도달 못 하는
     자리에 있다. 실측으로 시작 키퍼 동네형이 명단에 안 팔린 채 남아, 뽑기 값을 재는 자가
     아무도 살 수 없는 259짜리 이름과 380을 견주고 있었다. 그래서 표시를 바꾸는 대신
     사람이 도는 절차를 그대로 돌린다. 이 칸은 개봉을 카드 없이 끝까지 돌리라는 부탁이고,
     실행은 그 절차를 소유한 main이 한다. 값을 여기서 흉내 내면 두 경로가 갈린다. */
  veteran(state) {
    state.onboardSkip = true;
  }
};

// ?preset=maxed 처럼 주소로만 켜진다. 쉼표로 여러 개를 이어 붙일 수 있다.
// 모르는 이름은 즉시 멈춘다. 조용히 지나가면 그 게이트는 만렙을 재는 줄 알고 신인을 재고,
// 표본이 안 바뀐 채 나온 초록은 결함이 없다는 뜻이 아니라 아무것도 안 쟀다는 뜻이다.
// 이 세션에서만 표본이 고정된 채 통과한 거짓 초록이 넷이었다.
export function applyPreset(raw, state) {
  if (!raw) return [];
  const used = [];
  for (const name of String(raw).split(",")) {
    const key = name.trim();
    if (!key) continue;
    const fn = PRESETS[key];
    if (!fn) throw new Error("unknown preset name: " + key + ". known: " + Object.keys(PRESETS).join(", "));
    fn(state);
    used.push(key);
  }
  return used;
}
