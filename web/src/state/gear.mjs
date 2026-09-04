// 장비. 스탯은 훈련으로만 오르고 장비는 그 위에 얇게 얹는다.
// 장비 한 칸이 스탯 한 칸보다 크면 훈련이 장식이 되고, 훈련이 장식인 방치형에는 남는 축이 없다.

// 장갑 선반. 0번은 파는 물건이 아니라 아무것도 안 산 사람이 이미 끼고 있는 것이다.
// 값은 카드깡 380 육수를 기준으로 잡았다. 첫 칸은 그보다 싸야 처음 지르는 자리가 되고,
// 마지막 칸은 그보다 비싸야 카드깡이 선반에서 밀려나지 않는다.
export const GLOVES = [
  { grip: 0, name: '장터 목장갑', cost: 0, tone: 0xf2d64b, note: '아무것도 안 샀을 때 끼고 있는 것' },
  { grip: 1, name: '고무코팅 목장갑', cost: 140, tone: 0xd9552f, note: '젖은 공을 한 번은 붙잡는다' },
  { grip: 2, name: '송진 범벅 장갑', cost: 360, tone: 0xbf8a2e, note: '손에서 공이 잘 안 떨어진다' },
  { grip: 3, name: '문어 빨판 장갑', cost: 820, tone: 0x8f4fd1, note: '안 떨어진다. 벗겨지지도 않는다' }
];

export const MAX_GRIP = GLOVES.length - 1;

// 축구화 선반. 손이 아니라 발이고, 깎는 것은 반경이 아니라 출발이다.
// 장갑과 같은 값 기준을 쓴다. 첫 칸은 카드깡 380 육수보다 싸고 마지막 칸은 그보다 비싸다.
export const BOOTS = [
  { studs: 0, name: '학교 앞 실내화', cost: 0, tone: 0x2a241c, note: '아무것도 안 샀을 때 신고 있는 것' },
  { studs: 1, name: '바닥 닳은 조기축구화', cost: 160, tone: 0x4a3b2a, note: '그래도 미끄러지지는 않는다' },
  { studs: 2, name: '스터드 여섯 개 축구화', cost: 400, tone: 0x1f4f8f, note: '흙을 물고 첫 발이 빨리 뜬다' },
  { studs: 3, name: '육상용 스파이크', cost: 880, tone: 0xd94f2a, note: '축구화는 아니다. 제일 빨리 뜬다' }
];

export const MAX_STUD = BOOTS.length - 1;

// 유니폼 선반. 손도 발도 아니라 몸이고, 깎는 것은 정면 강슛에 같이 밀려 들어가는 사고다.
// 값 기준은 앞의 둘과 같다. 첫 칸은 카드깡 380 육수보다 싸고 마지막 칸은 그보다 비싸다.
export const KITS = [
  { pads: 0, name: '아빠 옷장 면티', cost: 0, tone: 0x2f8f5b, note: '아무것도 안 샀을 때 입고 있는 것' },
  { pads: 1, name: '학교 체육복 상의', cost: 150, tone: 0x2f6f8f, note: '적어도 땀은 먹는다' },
  { pads: 2, name: '조기회 단체복', cost: 370, tone: 0x8f2f5b, note: '등에 동네 철물점 이름이 박혀 있다' },
  { pads: 3, name: '패드 박은 골키퍼 저지', cost: 850, tone: 0x1c1f2b, note: '어깨에 스펀지가 들었다. 밀려도 덜 밀린다' }
];

export const MAX_KIT = KITS.length - 1;

// 양말 선반. 손도 발도 몸도 아니라 착지고, 깎는 것은 흘린 뒤 못 일어나는 사고다.
// 값 기준은 앞의 셋과 같다. 첫 칸은 카드깡 380 육수보다 싸고 마지막 칸은 그보다 비싸다.
export const SOCKS = [
  { socks: 0, name: '목 늘어난 흰 양말', cost: 0, tone: 0x63d3e8, note: '아무것도 안 샀을 때 신고 있는 것' },
  { socks: 1, name: '축구 스타킹', cost: 130, tone: 0xe8d463, note: '적어도 흘러내리지는 않는다' },
  { socks: 2, name: '정강이 보호대 낀 스타킹', cost: 350, tone: 0xe86363, note: '까져도 덜 아파서 덜 눕는다' },
  { socks: 3, name: '미끄럼방지 그립 양말', cost: 830, tone: 0xf2f2f2, note: '발이 신발 안에서 안 논다. 넘어져도 금방 선다' }
];

export const MAX_SOCK = SOCKS.length - 1;

// 골대 선반. 몸에 걸치는 것이 아니라 뒤에 서 있는 것이고, 깎는 것은 흘린 공이 두 번째 슛까지 살아남는 사고다.
// 값 기준은 앞의 넷과 같다. 첫 칸은 카드깡 380 육수보다 싸고 마지막 칸은 그보다 비싸다.
//
// cell은 그물코 한 변의 미터, dim은 실의 진하기, sag는 가운데가 늘어지는 깊이다.
// 셋 다 렌더가 아니라 여기 있다. 색 상수를 렌더 파일에 두면 두 곳이 갈린다는 것과 같은 이유다.
// 0.50에서 0.30으로 좁히면 같은 폭에 실이 열여덟 줄에서 서른 줄이 되어 촘촘함이 눈에 보이고,
// 늘어짐 0.34에서 0.14로 줄면 팽팽하게 당겨 맨 그물로 읽힌다. 안 산 사람의 골대가 가장 성기다.
export const GOALS = [
  { frame: 0, name: '기울어진 동네 철골대', cost: 0, cell: 0.50, dim: 0.55, sag: 0.34, note: '아무것도 안 샀을 때 뒤에 서 있는 것' },
  { frame: 1, name: '구멍 기운 나일론 그물', cost: 145, cell: 0.44, dim: 0.62, sag: 0.28, note: '뚫린 데는 없다. 그게 전부다' },
  { frame: 2, name: '팽팽하게 당겨 맨 그물', cost: 385, cell: 0.36, dim: 0.70, sag: 0.22, note: '맞으면 팅 소리가 난다' },
  { frame: 3, name: '공을 먹는 촘촘한 겹그물', cost: 860, cell: 0.30, dim: 0.80, sag: 0.14, note: '들어간 공이 안 나온다. 튄 공도 안 나온다' }
];

export const MAX_FRAME = GOALS.length - 1;

// 동네 선반. 이건 버프가 아니라 교환이다. 사람이 많은 동네일수록 눈에 띄는 행인이 자주 지나가고,
// 그래서 한눈파는 구가 늘어난다. 대신 그 동네에서 막으면 소문이 더 빨리 퍼져 팔로워가 더 붙는다.
// 순수 상승이 아니므로 장비 한 칸이 스탯 한 칸을 넘지 않는다는 자와 부딪히지 않는다.
// 값 기준은 앞의 다섯과 같다. 첫 칸은 카드깡 380 육수보다 싸고 마지막 칸은 그보다 비싸다.
// sky는 하늘색, haze는 안개색이다. 골대의 그물 값과 같은 이유로 렌더가 아니라 여기 있다.
// 등급이 오를수록 하늘이 옅고 뿌예진다. 뒷산은 파랗고 번화가는 먼지가 낀다.
export const CITIES = [
  { city: 0, name: '동네 뒷산 공터', cost: 0, sky: 0x86aecb, haze: 0x9dbdd4, note: '아무것도 안 샀을 때 서 있는 곳. 지나가는 사람이 거의 없다' },
  { city: 1, name: '학교 앞 흙 운동장', cost: 145, sky: 0x8fb2c9, haze: 0xa6c0cf, note: '하교 시간에 사람이 지나간다. 가끔 고개가 돌아간다' },
  { city: 2, name: '역세권 풋살장', cost: 385, sky: 0x9ab3c2, haze: 0xb0c2c9, note: '유동인구가 많다. 막으면 소문이 빨리 난다' },
  { city: 3, name: '번화가 한복판 코트', cost: 860, sky: 0xa8b4ba, haze: 0xbcc5c4, note: '사방이 사람이다. 팔로워도 실점도 같이 는다' }
];

export const MAX_CITY = CITIES.length - 1;

// 헤어 선반. 판정에는 손대지 않는다. 세이브율을 건드리면 장비 한 칸이 스탯 한 칸을 넘는 자와 부딪히고,
// 순수 외형이면 화면에 없는 시스템이 된다. 그래서 축을 팔로워로 잡았다. 팔로워는 판정식 밖이다.
// tone은 머리 껍데기 정점색이다. 색 상수를 렌더 파일에 따로 두면 두 곳이 갈린다.
// cut은 그 머리의 형태다. 네 이름이 전부 색이 아니라 모양을 말하는데 색만 바꾸면
// 같은 물건이 네 값에 팔린다. wide는 좌우 배율, tall은 높이 배율,
// phi는 정수리 반구가 아래로 덮는 각의 배율이라 클수록 옆까지 덮는다.
// 값 기준은 앞의 여섯과 같다. 첫 칸은 카드깡 380 육수보다 싸고 마지막 칸은 그보다 비싸다.
export const HAIRS = [
  // 껍데기 반지름이 두개골의 1.05배라, wide와 tall이 1 아래로 내려가면 껍데기가 두개골 안으로
  // 들어가 그 등급만 대머리가 된다. 짧은 머리는 높이가 아니라 phi로 줄인다.
  // 집에서 깎은 머리라 한쪽이 더 눌렸다. tilt는 그 기울기다.
  { hair: 0, name: '엄마가 깎아준 머리', cost: 0, tone: 0x2b1d14, note: '아무것도 안 샀을 때 머리',
    cut: { wide: 1, tall: 1.02, phi: 0.46, tilt: 0.09 } },
  // 투블럭은 옆을 밀고 정수리만 남긴다. 덮는 각만 좁히고 배율은 안 건드린다.
  { hair: 1, name: '동네 미용실 투블럭', cost: 135, tone: 0x1b1410, note: '적어도 단정하다',
    cut: { wide: 1, tall: 1.03, phi: 0.28, tilt: 0 } },
  // 탈색은 기른 머리라 위아래로 부푼다.
  { hair: 2, name: '탈색한 노란 머리', cost: 375, tone: 0xd8b45c, note: '멀리서도 누군지 보인다',
    cut: { wide: 1.08, tall: 1.22, phi: 0.52, tilt: 0 } },
  // 모히칸은 가운데 볏 하나다. 좌우를 3분의 1로 죄고 높이를 1.8배로 세운다.
  { hair: 3, name: '불붙은 빨간 모히칸', cost: 840, tone: 0xc4402c, note: '관중석이 먼저 알아본다',
    cut: { wide: 0.34, tall: 1.8, phi: 0.6, tilt: 0 } }
];

export const MAX_HAIR = HAIRS.length - 1;

// 타투 선반. 헤어와 같은 축이고 보이는 자리만 다르다. ink는 소매 커프 색이라 팔에 드러난다.
// 값 기준은 앞의 일곱과 같다. 첫 칸은 카드깡 380 육수보다 싸고 마지막 칸은 그보다 비싸다.
// span은 그 잉크가 위팔을 덮는 비율이다. 색만 바꾸면 이름이 약속한 면적이 화면에 안 선다.
// 실측으로 색만 다른 2등급과 3등급의 그림 차이가 236화소였고, 그 둘은 사실상 같은 상품이었다.
export const TATTOOS = [
  { ink: 0, name: '맨살', cost: 0, ink_tone: 0x5f8f93, span: 0.16, note: '아무것도 안 새겼을 때 팔' },
  { ink: 1, name: '지워지는 문신 스티커', cost: 140, ink_tone: 0x3a4f7a, span: 0.22, note: '땀에 번진다. 그래도 있어 보인다' },
  { ink: 2, name: '팔뚝에 새긴 이름 석 자', cost: 380, ink_tone: 0x2a2f3a, span: 0.40, note: '누구 이름인지는 안 밝힌다' },
  { ink: 3, name: '어깨까지 채운 먹토시', cost: 870, ink_tone: 0x14161c, span: 0.72, note: '반팔을 입으면 소매가 하나 더 있다' }
];

export const MAX_INK = TATTOOS.length - 1;

export function newGear() {
  return { grip: 0, studs: 0, pads: 0, socks: 0, frame: 0, city: 0, hair: 0, ink: 0 };
}

/* 갈래 둘. 몸에 걸치는 것은 그 키퍼의 것이고, 서는 자리는 계정의 것이다.
   장갑을 낀 것은 그 사람이지만 골대와 동네는 누가 뛰든 같은 곳이라, 키퍼를 바꿨을 때
   앞의 여섯은 따라 바뀌고 뒤의 둘은 그대로여야 한다. */
export const WORN_FIELDS = ['grip', 'studs', 'pads', 'socks', 'hair', 'ink'];
export const PLACE_FIELDS = ['frame', 'city'];

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
  const t = inkAt(gear && gear.ink);
  return {
    hair: hairAt(gear && gear.hair).tone, hairCut: hairAt(gear && gear.hair).cut,
    ink: t.ink_tone, inkSpan: t.span,
    glove: gloveAt(gear && gear.grip).tone, boot: bootAt(gear && gear.studs).tone,
    shirt: kitAt(gear && gear.pads).tone, sock: sockAt(gear && gear.socks).tone
  };
}

// 팔로워 승수. 두 선반 최고 등급을 다 채워도 1.3배다. 동네 최고 등급(1.36배)을 넘기지 않게 잡았다.
// 넘기면 실점을 감수하는 동네 선택이 외형 구매로 무력화된다.
export function lookBoost(gear) {
  const rank = hairAt(gear && gear.hair).hair + inkAt(gear && gear.ink).ink;
  return 1 + 0.05 * rank;
}
