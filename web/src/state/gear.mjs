// 장비. 스탯은 훈련으로만 오르고 장비는 그 위에 얇게 얹는다.
// 장비 한 칸이 스탯 한 칸보다 크면 훈련이 장식이 되고, 훈련이 장식인 방치형에는 남는 축이 없다.

// 장갑 선반. 0번은 파는 물건이 아니라 아무것도 안 산 사람이 이미 끼고 있는 것이다.
// 값은 이적시장 380 육수를 기준으로 잡았다. 첫 칸은 그보다 싸야 처음 지르는 자리가 되고,
// 마지막 칸은 그보다 비싸야 이적시장이 선반에서 밀려나지 않는다.
//
// 등급은 이름과 값만 소유한다. 색과 형태는 아래 변형 목록이 소유한다.
export const GLOVES = [
  { grip: 0, name: '장터 목장갑', cost: 0, note: '아무것도 안 샀을 때 끼고 있는 것' },
  { grip: 1, name: '고무코팅 목장갑', cost: 140, note: '젖은 공을 한 번은 붙잡는다' },
  { grip: 2, name: '송진 범벅 장갑', cost: 360, note: '손에서 공이 잘 안 떨어진다' },
  { grip: 3, name: '문어 빨판 장갑', cost: 820, note: '안 떨어진다. 벗겨지지도 않는다' }
];

/* 장갑 변형. bulk는 손 전체 배율, cuff는 손목밴드 길이 배율, pips는 손바닥 빨판 수다.
   네 번째 등급의 이름이 빨판을 말하므로 그 돌기는 이름이 이미 선언한 것이다.
   목장갑은 얇고 손목이 짧아 손이 드러나고, 고무는 손바닥이 두꺼워지고,
   송진은 손목까지 감아 올린다. 등급 안에서는 그 성질을 지키면서 색과 두께만 갈린다. */
export const GLOVE_SKINS = [
  [{ name: '장터 목장갑', tone: 0xf2d64b, cut: { bulk: 0.88, cuff: 0.62, pips: 0 } },
   { name: '흙때 낀 목장갑', tone: 0x8f8f5b, cut: { bulk: 0.92, cuff: 0.7, pips: 0 } },
   { name: '빨아 놓은 흰 목장갑', tone: 0xe8e4d4, cut: { bulk: 0.84, cuff: 0.55, pips: 0 } }],
  [{ name: '주황 고무코팅', tone: 0xd9552f, cut: { bulk: 1, cuff: 1, pips: 0 } },
   { name: '파랑 고무코팅', tone: 0x2f6fd9, cut: { bulk: 1.04, cuff: 0.92, pips: 0 } },
   { name: '초록 고무코팅', tone: 0x2f8f5b, cut: { bulk: 0.96, cuff: 1.12, pips: 0 } }],
  [{ name: '송진 범벅', tone: 0xbf8a2e, cut: { bulk: 1.14, cuff: 1.55, pips: 0 } },
   { name: '굳은 송진', tone: 0x8f6a1e, cut: { bulk: 1.2, cuff: 1.72, pips: 0 } },
   { name: '테이프까지 감은 손', tone: 0xe0dccc, cut: { bulk: 1.1, cuff: 1.4, pips: 0 } }],
  [{ name: '보라 빨판', tone: 0x8f4fd1, cut: { bulk: 1.22, cuff: 1.9, pips: 5 } },
   { name: '붉은 빨판', tone: 0xd14f6f, cut: { bulk: 1.26, cuff: 1.75, pips: 5 } },
   { name: '먹색 빨판', tone: 0x2a2f4f, cut: { bulk: 1.18, cuff: 2.05, pips: 5 } }]
];

export const MAX_GRIP = GLOVES.length - 1;

// 축구화 선반. 손이 아니라 발이고, 깎는 것은 반경이 아니라 출발이다.
// 장갑과 같은 값 기준을 쓴다. 첫 칸은 이적시장 380 육수보다 싸고 마지막 칸은 그보다 비싸다.
//
export const BOOTS = [
  { studs: 0, name: '학교 앞 실내화', cost: 0, note: '아무것도 안 샀을 때 신고 있는 것' },
  { studs: 1, name: '바닥 닳은 조기축구화', cost: 160, note: '그래도 미끄러지지는 않는다' },
  { studs: 2, name: '스터드 여섯 개 축구화', cost: 400, note: '흙을 물고 첫 발이 빨리 뜬다' },
  { studs: 3, name: '육상용 스파이크', cost: 880, note: '축구화는 아니다. 제일 빨리 뜬다' }
];

/* 축구화 변형. pips는 바닥에 박힌 돌기 수, sole은 밑창 두께 배율,
   long과 wide는 갑피의 길이와 폭 배율, pip은 돌기 길이 배율, girth는 돌기 굵기 배율이다.
   세 번째 등급의 이름이 돌기 수를 대놓고 말하므로 그 수는 이름이 이미 선언한 값이고,
   한 등급의 변형은 그 수를 지킨다. 실내화는 바닥이 평평해 안 산 사람이 흙에서 미끄러지고,
   닳은 축구화는 셋만 남았고, 스파이크는 수보다 길이다.
   수만 바꾸면 세 개짜리와 여섯 개짜리가 같은 밑창이 되므로 등급 사이는 길이와 굵기까지 갈라 둔다. */
export const BOOT_SKINS = [
  [{ name: '흰 실내화', tone: 0x2a241c, cut: { sole: 0.7, long: 0.88, wide: 0.92, pips: 0, pip: 0, girth: 1 } },
   { name: '뒤축 꺾어 신은 실내화', tone: 0x4a4438, cut: { sole: 0.64, long: 0.8, wide: 0.96, pips: 0, pip: 0, girth: 1 } },
   { name: '남의 실내화', tone: 0x1c2a2a, cut: { sole: 0.76, long: 0.96, wide: 0.86, pips: 0, pip: 0, girth: 1 } }],
  [{ name: '갈색 조기축구화', tone: 0x4a3b2a, cut: { sole: 1, long: 1, wide: 1, pips: 3, pip: 0.5, girth: 1 } },
   { name: '검은 조기축구화', tone: 0x22201c, cut: { sole: 1.06, long: 0.96, wide: 1.04, pips: 3, pip: 0.58, girth: 1.1 } },
   { name: '흰 줄 두 개', tone: 0xd8d2c2, cut: { sole: 0.96, long: 1.06, wide: 0.96, pips: 3, pip: 0.44, girth: 0.9 } }],
  [{ name: '파란 스터드', tone: 0x1f4f8f, cut: { sole: 1.28, long: 1.08, wide: 1.1, pips: 6, pip: 1.05, girth: 1.2 } },
   { name: '형광 스터드', tone: 0xb8d92f, cut: { sole: 1.2, long: 1.14, wide: 1.04, pips: 6, pip: 1.15, girth: 1.1 } },
   { name: '먹색 스터드', tone: 0x1a1c22, cut: { sole: 1.34, long: 1.02, wide: 1.16, pips: 6, pip: 0.95, girth: 1.3 } }],
  [{ name: '주황 스파이크', tone: 0xd94f2a, cut: { sole: 0.8, long: 1.2, wide: 0.86, pips: 8, pip: 1.9, girth: 0.6 } },
   { name: '은색 스파이크', tone: 0xc2c6cc, cut: { sole: 0.74, long: 1.28, wide: 0.8, pips: 8, pip: 2.05, girth: 0.54 } },
   { name: '검은 스파이크', tone: 0x24262c, cut: { sole: 0.86, long: 1.12, wide: 0.92, pips: 8, pip: 1.75, girth: 0.68 } }]
];

export const MAX_STUD = BOOTS.length - 1;

// 유니폼 선반. 손도 발도 아니라 몸이고, 깎는 것은 정면 강슛에 같이 밀려 들어가는 사고다.
// 값 기준은 앞의 둘과 같다. 첫 칸은 이적시장 380 육수보다 싸고 마지막 칸은 그보다 비싸다.
//
export const KITS = [
  { pads: 0, name: '아빠 옷장 면티', cost: 0, note: '아무것도 안 샀을 때 입고 있는 것' },
  { pads: 1, name: '학교 체육복 상의', cost: 150, note: '적어도 땀은 먹는다' },
  { pads: 2, name: '조기회 단체복', cost: 370, note: '등에 동네 철물점 이름이 박혀 있다' },
  { pads: 3, name: '패드 박은 골키퍼 저지', cost: 850, note: '어깨에 스펀지가 들었다. 밀려도 덜 밀린다' }
];

/* 상의 변형. girth는 품 배율, len은 기장 배율, pad는 어깨에 박힌 스펀지 두께다.
   아빠 옷은 품도 기장도 남고, 단체복은 어깨선이 각지고, 저지는 어깨에 스펀지가 든다.
   마지막 등급의 이름이 그 스펀지를 말하므로 그 등급의 변형은 전부 두께를 지킨다. */
export const KIT_SKINS = [
  [{ name: '초록 면티', tone: 0x2f8f5b, cut: { girth: 1.3, len: 1.26, pad: 0 } },
   { name: '누런 러닝', tone: 0xd8cfa8, cut: { girth: 1.22, len: 1.34, pad: 0 } },
   { name: '늘어난 검정 면티', tone: 0x24262a, cut: { girth: 1.38, len: 1.18, pad: 0 } }],
  [{ name: '파란 체육복', tone: 0x2f6f8f, cut: { girth: 1, len: 1, pad: 0 } },
   { name: '빨간 체육복', tone: 0x9f2f2f, cut: { girth: 1.06, len: 0.96, pad: 0 } },
   { name: '흰 체육복', tone: 0xdcdcd2, cut: { girth: 0.94, len: 1.06, pad: 0 } }],
  [{ name: '자주 단체복', tone: 0x8f2f5b, cut: { girth: 1.14, len: 0.78, pad: 0.8 } },
   { name: '주황 단체복', tone: 0xcf7a2f, cut: { girth: 1.08, len: 0.84, pad: 1 } },
   { name: '남색 단체복', tone: 0x25355f, cut: { girth: 1.2, len: 0.74, pad: 0.7 } }],
  [{ name: '검은 저지', tone: 0x1c1f2b, cut: { girth: 0.88, len: 1.04, pad: 2.1 } },
   { name: '형광 저지', tone: 0xc8e02f, cut: { girth: 0.92, len: 0.98, pad: 2.3 } },
   { name: '보라 저지', tone: 0x4a2b6f, cut: { girth: 0.84, len: 1.1, pad: 1.9 } }]
];

export const MAX_KIT = KITS.length - 1;

// 양말 선반. 손도 발도 몸도 아니라 착지고, 깎는 것은 흘린 뒤 못 일어나는 사고다.
// 값 기준은 앞의 셋과 같다. 첫 칸은 이적시장 380 육수보다 싸고 마지막 칸은 그보다 비싸다.
//
export const SOCKS = [
  { socks: 0, name: '목 늘어난 흰 양말', cost: 0, note: '아무것도 안 샀을 때 신고 있는 것' },
  { socks: 1, name: '축구 스타킹', cost: 130, note: '적어도 흘러내리지는 않는다' },
  { socks: 2, name: '정강이 보호대 낀 스타킹', cost: 350, note: '까져도 덜 아파서 덜 눕는다' },
  { socks: 3, name: '미끄럼방지 그립 양말', cost: 830, note: '발이 신발 안에서 안 논다. 넘어져도 금방 선다' }
];

/* 양말 변형. girth는 정강이를 감는 두께 배율, guard는 정강이 앞 보호대 두께,
   band는 발목 그립 밴드 두께다. 목이 늘어난 양말은 종아리에 안 붙어 얇게 남는다.
   세 번째와 네 번째 이름이 보호대와 그립을 말하므로 그 등급의 변형은 전부 그것을 지킨다. */
export const SOCK_SKINS = [
  [{ name: '늘어난 흰 양말', tone: 0x63d3e8, cut: { girth: 0.78, guard: 0, band: 0 } },
   { name: '짝짝이 양말', tone: 0xd863b0, cut: { girth: 0.74, guard: 0, band: 0 } },
   { name: '구멍 난 양말', tone: 0xcfd8c8, cut: { girth: 0.82, guard: 0, band: 0 } }],
  [{ name: '노란 스타킹', tone: 0xe8d463, cut: { girth: 1.06, guard: 0, band: 0 } },
   { name: '검은 스타킹', tone: 0x22242a, cut: { girth: 1.1, guard: 0, band: 0 } },
   { name: '줄무늬 스타킹', tone: 0x2f8f7a, cut: { girth: 1.02, guard: 0, band: 0 } }],
  [{ name: '붉은 보호대', tone: 0xe86363, cut: { girth: 1.2, guard: 1.5, band: 0 } },
   { name: '검은 보호대', tone: 0x2a2c32, cut: { girth: 1.24, guard: 1.7, band: 0 } },
   { name: '흰 보호대', tone: 0xe4e4dc, cut: { girth: 1.16, guard: 1.35, band: 0 } }],
  [{ name: '흰 그립 양말', tone: 0xf2f2f2, cut: { girth: 0.92, guard: 0, band: 1.3 } },
   { name: '검은 그립 양말', tone: 0x1e2024, cut: { girth: 0.88, guard: 0, band: 1.45 } },
   { name: '주황 그립 양말', tone: 0xe08a2f, cut: { girth: 0.96, guard: 0, band: 1.2 } }]
];

export const MAX_SOCK = SOCKS.length - 1;

// 골대 선반. 몸에 걸치는 것이 아니라 뒤에 서 있는 것이고, 깎는 것은 흘린 공이 두 번째 슛까지 살아남는 사고다.
// 값 기준은 앞의 넷과 같다. 첫 칸은 이적시장 380 육수보다 싸고 마지막 칸은 그보다 비싸다.
//
export const GOALS = [
  { frame: 0, name: '기울어진 동네 철골대', cost: 0, note: '아무것도 안 샀을 때 뒤에 서 있는 것' },
  { frame: 1, name: '구멍 기운 나일론 그물', cost: 145, note: '뚫린 데는 없다. 그게 전부다' },
  { frame: 2, name: '팽팽하게 당겨 맨 그물', cost: 385, note: '맞으면 팅 소리가 난다' },
  { frame: 3, name: '공을 먹는 촘촘한 겹그물', cost: 860, note: '들어간 공이 안 나온다. 튄 공도 안 나온다' }
];

/* 골대 변형. cell은 그물코 한 변의 미터, dim은 실의 진하기, sag는 가운데가 늘어지는 깊이,
   post는 기둥 색이다. 0.50에서 0.30으로 좁히면 같은 폭에 실이 열여덟 줄에서 서른 줄이 되어
   촘촘함이 눈에 보이고, 늘어짐 0.34에서 0.14로 줄면 팽팽하게 당겨 맨 그물로 읽힌다.
   안 산 사람의 골대가 가장 성기다. 한 등급의 변형은 그 성김을 지키고 기둥 색과 늘어짐만 갈린다. */
export const GOAL_SKINS = [
  [{ name: '녹슨 철골대', tone: 0x8a7a68, cell: 0.50, dim: 0.55, sag: 0.34, post: 0x8a7a68 },
   { name: '페인트 벗겨진 골대', tone: 0xd8d4c8, cell: 0.52, dim: 0.5, sag: 0.38, post: 0xd8d4c8 },
   { name: '파란 철골대', tone: 0x3f6f9f, cell: 0.48, dim: 0.6, sag: 0.3, post: 0x3f6f9f }],
  [{ name: '흰 나일론', tone: 0xf2f4f0, cell: 0.44, dim: 0.62, sag: 0.28, post: 0xf2f4f0 },
   { name: '누런 나일론', tone: 0xd8c88a, cell: 0.46, dim: 0.58, sag: 0.31, post: 0xd8c88a },
   { name: '초록 기둥 나일론', tone: 0x3f8f5f, cell: 0.42, dim: 0.66, sag: 0.25, post: 0x3f8f5f }],
  [{ name: '팽팽한 흰 그물', tone: 0xf6f8f4, cell: 0.36, dim: 0.70, sag: 0.22, post: 0xf6f8f4 },
   { name: '팽팽한 검은 그물', tone: 0x2a2c30, cell: 0.34, dim: 0.76, sag: 0.2, post: 0x2a2c30 },
   { name: '팽팽한 붉은 그물', tone: 0xb84a3a, cell: 0.38, dim: 0.68, sag: 0.24, post: 0xb84a3a }],
  [{ name: '검은 겹그물', tone: 0x1e2024, cell: 0.30, dim: 0.80, sag: 0.14, post: 0x1e2024 },
   { name: '은색 겹그물', tone: 0xc8ccd2, cell: 0.28, dim: 0.86, sag: 0.12, post: 0xc8ccd2 },
   { name: '형광 겹그물', tone: 0xc8e02f, cell: 0.32, dim: 0.78, sag: 0.16, post: 0xc8e02f }]
];

export const MAX_FRAME = GOALS.length - 1;

// 동네 선반. 이건 버프가 아니라 교환이다. 사람이 많은 동네일수록 눈에 띄는 행인이 자주 지나가고,
// 그래서 한눈파는 구가 늘어난다. 대신 그 동네에서 막으면 소문이 더 빨리 퍼져 팔로워가 더 붙는다.
// 순수 상승이 아니므로 장비 한 칸이 스탯 한 칸을 넘지 않는다는 자와 부딪히지 않는다.
// 값 기준은 앞의 다섯과 같다. 첫 칸은 이적시장 380 육수보다 싸고 마지막 칸은 그보다 비싸다.
// sky는 하늘색, haze는 안개색이다. 골대의 그물 값과 같은 이유로 렌더가 아니라 여기 있다.
// 등급이 오를수록 하늘이 옅고 뿌예진다. 뒷산은 파랗고 번화가는 먼지가 낀다.
export const CITIES = [
  { city: 0, name: '동네 뒷산 공터', cost: 0, note: '아무것도 안 샀을 때 서 있는 곳. 지나가는 사람이 거의 없다',
    ground: 0x9c7a4a, fence: 0x3f6b4a, rise: 0.55 },
  { city: 1, name: '학교 앞 흙 운동장', cost: 145, note: '하교 시간에 사람이 지나간다. 가끔 고개가 돌아간다',
    ground: 0xa8763f, fence: 0x6b6f5a, rise: 0.8 },
  { city: 2, name: '역세권 풋살장', cost: 385, note: '유동인구가 많다. 막으면 소문이 빨리 난다',
    ground: 0x4a7a46, fence: 0x8a9099, rise: 1.1 },
  { city: 3, name: '번화가 한복판 코트', cost: 860, note: '사방이 사람이다. 팔로워도 실점도 같이 는다',
    ground: 0x585d64, fence: 0xb0b6bd, rise: 1.55 }
];

/* 등급이 소유하는 자리의 생김새. 이름이 말하는 장소가 화면에서도 그 장소여야 한다.
   그동안 등급이 바꾼 것은 하늘색과 행인 수뿐이라 공터와 번화가가 같은 흙바닥에 같은 지평선이었다.
   ground는 밟는 면이다. 마른 흙에서 붉은 운동장 흙으로, 인조잔디로, 아스팔트 코트로 간다.
   fence는 두르는 철망이고, rise는 지평선 건물 높이 배율이다. 뒷산은 낮게 깔리고 번화가는 솟는다.
   경기장과 상점 썸네일이 같은 값을 읽어야 산 것과 보이는 것이 안 갈린다. */
export function placeAt(rank) {
  return CITIES[Math.max(0, Math.min(CITIES.length - 1, Math.floor(Number(rank) || 0)))];
}

/* 동네 변형. sky는 하늘색, haze는 안개색이다. 등급이 정하는 것은 행인 수라
   변형이 그 수를 안 건드리고 시간대만 바꾼다. 낮과 노을과 흐린 날이다.
   등급이 오를수록 하늘이 옅고 뿌옇다는 규칙은 각 변형의 낮 하늘이 지킨다. */
export const CITY_SKINS = [
  [{ name: '맑은 낮', tone: 0x86aecb, sky: 0x86aecb, haze: 0x9dbdd4 },
   { name: '노을 지는 저녁', tone: 0xd88f5f, sky: 0xd88f5f, haze: 0xe0ac86 },
   { name: '비 오기 직전', tone: 0x6f7a84, sky: 0x6f7a84, haze: 0x8d959c }],
  [{ name: '맑은 낮', tone: 0x8fb2c9, sky: 0x8fb2c9, haze: 0xa6c0cf },
   { name: '노을 지는 저녁', tone: 0xd4956a, sky: 0xd4956a, haze: 0xdfb08d },
   { name: '비 오기 직전', tone: 0x757f88, sky: 0x757f88, haze: 0x929aa0 }],
  [{ name: '맑은 낮', tone: 0x9ab3c2, sky: 0x9ab3c2, haze: 0xb0c2c9 },
   { name: '노을 지는 저녁', tone: 0xd09a74, sky: 0xd09a74, haze: 0xdcb495 },
   { name: '비 오기 직전', tone: 0x7b848c, sky: 0x7b848c, haze: 0x969ea4 }],
  [{ name: '맑은 낮', tone: 0xa8b4ba, sky: 0xa8b4ba, haze: 0xbcc5c4 },
   { name: '노을 지는 저녁', tone: 0xcc9f7d, sky: 0xcc9f7d, haze: 0xd9b89c },
   { name: '비 오기 직전', tone: 0x81888e, sky: 0x81888e, haze: 0x9aa1a6 }]
];

export const MAX_CITY = CITIES.length - 1;

// 헤어 선반. 판정에는 손대지 않는다. 세이브율을 건드리면 장비 한 칸이 스탯 한 칸을 넘는 자와 부딪히고,
// 순수 외형이면 화면에 없는 시스템이 된다. 그래서 축을 팔로워로 잡았다. 팔로워는 판정식 밖이다.
// 등급은 이름과 값만 소유한다. 색과 형태는 그 등급의 변형 목록이 소유하고,
// 변형이 없으면 목록의 0번이 그 등급의 기본이다. 두 곳에 적으면 갈린다.
// 값 기준은 앞의 여섯과 같다. 첫 칸은 이적시장 380 육수보다 싸고 마지막 칸은 그보다 비싸다.
export const HAIRS = [
  { hair: 0, name: '엄마가 깎아준 머리', cost: 0, note: '아무것도 안 샀을 때 머리' },
  { hair: 1, name: '동네 미용실 투블럭', cost: 135, note: '적어도 단정하다' },
  { hair: 2, name: '탈색한 노란 머리', cost: 375, note: '멀리서도 누군지 보인다' },
  { hair: 3, name: '불붙은 빨간 모히칸', cost: 840, note: '관중석이 먼저 알아본다' }
];

export const MAX_HAIR = HAIRS.length - 1;

/* 선반 길이가 등급 수에 묶여 있었다. 등급을 늘리면 값 사다리와 팔로워 승수가 같이 늘어나
   그 둘을 여는 결정이 날 때까지 콘텐츠 수가 넷에서 멈춘다.
   변형은 그 매듭 밖이다. 같은 등급, 같은 값, 같은 승수에 모양과 색만 다르다.
   등급을 사면 그 등급의 변형이 전부 열리고 바꾸는 데 값이 안 든다.
   목록의 0번이 그 등급의 기본이다.

   껍데기 반지름이 두개골의 1.05배라, wide와 tall이 1 아래로 내려가면 껍데기가 두개골 안으로
   들어가 그 등급만 대머리가 된다. 짧은 머리는 높이가 아니라 phi로 줄인다.
   wide는 좌우 배율, tall은 높이 배율, phi는 정수리 반구가 덮는 각의 배율, tilt는 기울기다. */
export const HAIR_SKINS = [
  [{ name: '엄마 손 그대로', tone: 0x2b1d14, cut: { wide: 1, tall: 1.02, phi: 0.46, tilt: 0.09 } },
   { name: '한쪽만 눌린 자국', tone: 0x3b2a1a, cut: { wide: 1.04, tall: 1, phi: 0.5, tilt: -0.14 } },
   { name: '가위 안 든 날', tone: 0x241a12, cut: { wide: 1.08, tall: 1.08, phi: 0.58, tilt: 0.05 } }],
  [{ name: '기본 투블럭', tone: 0x1b1410, cut: { wide: 1, tall: 1.03, phi: 0.28, tilt: 0 } },
   { name: '올백 투블럭', tone: 0x2a2018, cut: { wide: 0.92, tall: 1.12, phi: 0.24, tilt: 0.11 } },
   { name: '반삭 투블럭', tone: 0x141010, cut: { wide: 1.06, tall: 1, phi: 0.18, tilt: 0 } }],
  [{ name: '탈색 노랑', tone: 0xd8b45c, cut: { wide: 1.08, tall: 1.22, phi: 0.52, tilt: 0 } },
   { name: '물 빠진 은발', tone: 0xd6d8d2, cut: { wide: 1.14, tall: 1.16, phi: 0.56, tilt: 0 } },
   { name: '탈색 실패 주황', tone: 0xd9762f, cut: { wide: 1.02, tall: 1.3, phi: 0.48, tilt: 0.06 } }],
  [{ name: '빨간 모히칸', tone: 0xc4402c, cut: { wide: 0.34, tall: 1.8, phi: 0.6, tilt: 0 } },
   { name: '파란 모히칸', tone: 0x2f6fd9, cut: { wide: 0.28, tall: 2.1, phi: 0.66, tilt: 0 } },
   { name: '쓰러진 모히칸', tone: 0x8f2fd1, cut: { wide: 0.42, tall: 1.55, phi: 0.56, tilt: 0.24 } }]
];

/* 잉크 변형. 머리와 같은 형식이다. span은 위팔을 덮는 비율, girth는 감는 두께 배율이다. */
export const INK_SKINS = [
  [{ name: '맨살', tone: 0x5f8f93, cut: { span: 0.14, girth: 1 } },
   { name: '햇볕에 탄 자국', tone: 0x8f6f53, cut: { span: 0.2, girth: 1.02 } },
   { name: '붕대 감은 팔', tone: 0xd8d4c6, cut: { span: 0.24, girth: 1.06 } }],
  [{ name: '문신 스티커', tone: 0x3a4f7a, cut: { span: 0.26, girth: 1.03 } },
   { name: '번진 스티커', tone: 0x4f3a7a, cut: { span: 0.34, girth: 1.01 } },
   { name: '반쯤 뜯긴 스티커', tone: 0x2f5f4a, cut: { span: 0.2, girth: 1.08 } }],
  [{ name: '이름 석 자', tone: 0x2a2f3a, cut: { span: 0.38, girth: 1.04 } },
   { name: '등번호 하나', tone: 0x7a2a2f, cut: { span: 0.32, girth: 1.1 } },
   { name: '알아볼 수 없는 글씨', tone: 0x1f3a2a, cut: { span: 0.44, girth: 1.02 } }],
  [{ name: '검은 먹토시', tone: 0x14161c, cut: { span: 0.98, girth: 1.2 } },
   { name: '푸른 먹토시', tone: 0x14263c, cut: { span: 0.9, girth: 1.26 } },
   { name: '붉은 먹토시', tone: 0x3c1418, cut: { span: 1, girth: 1.14 } }]
];

/* 변형을 파는 선반 표. 여기 든 칸만 변형이 있고, 칸 이름에 Skin을 붙인 것이 그 선택을 담는 자리다.
   선반마다 다른 함수를 두면 새 선반이 늘 때마다 상점과 게이트가 그 이름을 손으로 들어야 한다. */
export const SKINS = { grip: GLOVE_SKINS, studs: BOOT_SKINS, pads: KIT_SKINS, socks: SOCK_SKINS, hair: HAIR_SKINS, ink: INK_SKINS, frame: GOAL_SKINS, city: CITY_SKINS };
export const SKIN_FIELDS = Object.keys(SKINS);

export function skinsAt(field, rank) {
  const table = SKINS[field];
  if (!table) return [];
  return table[Math.min(table.length - 1, Math.max(0, Math.floor(Number(rank) || 0)))];
}

// 등급이 바뀌면 변형 번호가 그 등급의 범위를 넘을 수 있다. 넘으면 그 등급의 기본으로 돌아간다.
export function skinAt(field, rank, skin) {
  const list = skinsAt(field, rank);
  const n = Math.floor(Number(skin) || 0);
  return list[n >= 0 && n < list.length ? n : 0];
}

// 타투 선반. 헤어와 같은 축이고 보이는 자리만 다르다. ink는 소매 커프 색이라 팔에 드러난다.
// 값 기준은 앞의 일곱과 같다. 첫 칸은 이적시장 380 육수보다 싸고 마지막 칸은 그보다 비싸다.
// 머리와 같다. 등급은 이름과 값만 들고, 색과 형태는 변형 목록이 소유한다.
// 색만 바꾸면 이름이 약속한 면적이 화면에 안 선다.
// 실측으로 색만 다른 2등급과 3등급의 그림 차이가 236화소였고, 그 둘은 사실상 같은 상품이었다.
export const TATTOOS = [
  { ink: 0, name: '맨살', cost: 0, note: '아무것도 안 새겼을 때 팔' },
  { ink: 1, name: '지워지는 문신 스티커', cost: 140, note: '땀에 번진다. 그래도 있어 보인다' },
  { ink: 2, name: '팔뚝에 새긴 이름 석 자', cost: 380, note: '누구 이름인지는 안 밝힌다' },
  // 먹토시는 위팔을 통째로 덮는다. 소매가 하나 더 있다는 이름이 그 뜻이다.
  { ink: 3, name: '어깨까지 채운 먹토시', cost: 870, note: '반팔을 입으면 소매가 하나 더 있다' }
];

export const MAX_INK = TATTOOS.length - 1;

export function newGear() {
  const g = { grip: 0, studs: 0, pads: 0, socks: 0, frame: 0, city: 0, hair: 0, ink: 0 };
  for (const f of SKIN_FIELDS) g[f + 'Skin'] = 0;
  return g;
}

/* 갈래 둘. 몸에 걸치는 것은 그 키퍼의 것이고, 서는 자리는 계정의 것이다.
   장갑을 낀 것은 그 사람이지만 골대와 동네는 누가 뛰든 같은 곳이라, 키퍼를 바꿨을 때
   앞의 여섯은 따라 바뀌고 뒤의 둘은 그대로여야 한다. */
const WORN_BASE = ['grip', 'studs', 'pads', 'socks', 'hair', 'ink'];
const PLACE_BASE = ['frame', 'city'];
// 변형 칸은 그 등급 칸을 따라간다. 몸에 걸치는 것의 변형은 키퍼의 것이고 자리의 변형은 계정의 것이라,
// 이 둘이 갈리지 않으면 키퍼를 바꿀 때 하늘색이 같이 따라 바뀐다.
export const WORN_FIELDS = WORN_BASE.concat(SKIN_FIELDS.filter((f) => WORN_BASE.indexOf(f) >= 0).map((f) => f + 'Skin'));
export const PLACE_FIELDS = PLACE_BASE.concat(SKIN_FIELDS.filter((f) => PLACE_BASE.indexOf(f) >= 0).map((f) => f + 'Skin'));

export function isWorn(field) {
  return WORN_FIELDS.indexOf(field) >= 0;
}

// 이전 배포본 저장에는 장비 칸이 없다. 없으면 0번 장갑에서 시작한다.
// 선반 밖의 값은 버린다. 저장에 들어온 숫자를 그대로 믿으면 판정식이 오염된다.
export function readGear(raw) {
  const g = newGear();
  if (!raw || typeof raw !== 'object') return g;
  if (Number.isFinite(raw.grip)) g.grip = Math.min(MAX_GRIP, Math.max(0, Math.floor(raw.grip)));
  if (Number.isFinite(raw.studs)) g.studs = Math.min(MAX_STUD, Math.max(0, Math.floor(raw.studs)));
  if (Number.isFinite(raw.pads)) g.pads = Math.min(MAX_KIT, Math.max(0, Math.floor(raw.pads)));
  if (Number.isFinite(raw.socks)) g.socks = Math.min(MAX_SOCK, Math.max(0, Math.floor(raw.socks)));
  if (Number.isFinite(raw.frame)) g.frame = Math.min(MAX_FRAME, Math.max(0, Math.floor(raw.frame)));
  if (Number.isFinite(raw.city)) g.city = Math.min(MAX_CITY, Math.max(0, Math.floor(raw.city)));
  if (Number.isFinite(raw.hair)) g.hair = Math.min(MAX_HAIR, Math.max(0, Math.floor(raw.hair)));
  if (Number.isFinite(raw.ink)) g.ink = Math.min(MAX_INK, Math.max(0, Math.floor(raw.ink)));
  // 변형은 그 등급의 목록 안에서만 산다. 범위 밖 숫자는 기본으로 접는다.
  for (const f of SKIN_FIELDS) {
    const v = raw[f + 'Skin'];
    if (Number.isFinite(v)) g[f + 'Skin'] = Math.max(0, Math.min(skinsAt(f, g[f]).length - 1, Math.floor(v)));
  }
  return g;
}

export function gloveAt(grip) {
  return GLOVES[Math.min(MAX_GRIP, Math.max(0, Math.floor(Number(grip) || 0)))];
}

export function bootAt(studs) {
  return BOOTS[Math.min(MAX_STUD, Math.max(0, Math.floor(Number(studs) || 0)))];
}

export function kitAt(pads) {
  return KITS[Math.min(MAX_KIT, Math.max(0, Math.floor(Number(pads) || 0)))];
}

export function sockAt(socks) {
  return SOCKS[Math.min(MAX_SOCK, Math.max(0, Math.floor(Number(socks) || 0)))];
}

export function frameAt(frame) {
  return GOALS[Math.min(MAX_FRAME, Math.max(0, Math.floor(Number(frame) || 0)))];
}

export function cityAt(city) {
  return CITIES[Math.min(MAX_CITY, Math.max(0, Math.floor(Number(city) || 0)))];
}

export function hairAt(hair) {
  return HAIRS[Math.min(MAX_HAIR, Math.max(0, Math.floor(Number(hair) || 0)))];
}

export function inkAt(ink) {
  return TATTOOS[Math.min(MAX_INK, Math.max(0, Math.floor(Number(ink) || 0)))];
}

// 장비 네 선반은 지금까지 판정만 바꾸고 키퍼 몸에는 아무것도 남기지 않았다.
// 880 땅짜리 상품을 사도 그림이 같으면 그 선반은 숫자만 팔고 있는 것이다.
// 0등급은 지금 색 그대로라 신규 저장의 그림은 안 바뀐다.
// 렌더가 읽는 두 색을 한 곳에서 뽑는다. buildKeeper 인자와 상점 미리보기가 같은 값을 쓴다.
export function lookOf(gear) {
  const t = skinAt('ink', gear && gear.ink, gear && gear.inkSkin);
  const h = skinAt('hair', gear && gear.hair, gear && gear.hairSkin);
  const gl = skinAt('grip', gear && gear.grip, gear && gear.gripSkin);
  const bo = skinAt('studs', gear && gear.studs, gear && gear.studsSkin);
  const ki = skinAt('pads', gear && gear.pads, gear && gear.padsSkin);
  const so = skinAt('socks', gear && gear.socks, gear && gear.socksSkin);
  return {
    hair: h.tone, hairCut: h.cut,
    ink: t.tone, inkSpan: t.cut.span, inkGirth: t.cut.girth,
    glove: gl.tone, gloveCut: gl.cut,
    boot: bo.tone, bootCut: bo.cut,
    shirt: ki.tone, kitCut: ki.cut,
    sock: so.tone, sockCut: so.cut
  };
}

// 팔로워 승수. 두 선반 최고 등급을 다 채워도 1.3배다. 동네 최고 등급(1.36배)을 넘기지 않게 잡았다.
// 넘기면 실점을 감수하는 동네 선택이 외형 구매로 무력화된다.
export function lookBoost(gear) {
  const rank = hairAt(gear && gear.hair).hair + inkAt(gear && gear.ink).ink;
  return 1 + 0.05 * rank;
}
