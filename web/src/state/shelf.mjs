// 선반 어휘. 상점 화면과 위키 둘 다 이 표를 읽는다. 화면 파일에 두면 위키를 짓는 node가 못 읽고,
// 위키 파일에 두면 상점이 위키를 import한다. DOM을 모르는 이 자리가 둘의 공통 조상이다.
import { GLOVES, BOOTS, KITS, SOCKS, GOALS, CITIES, HAIRS, BEARDS, TATTOOS } from './gear.mjs';
import { GEAR_STEP } from '../../../src/chain.mjs';

// 장비 칸 둘의 규칙이 같으므로 선반도 하나로 둔다. 선반을 칸마다 복제하면
// 버튼 글자 규칙이 한쪽에서만 바뀌어 같은 상점 안에서 말이 갈린다.
// 장갑은 손이라 판정식의 gloveP와 spillP로, 축구화는 발이라 출발 지연으로 들어간다.
// 라벨은 명사구다. 여기에 한 줄 더: 타투와 버프와 봇처럼 굳은 외래어와 EXP 같은 게임 용어는
// 우리말로 안 옮긴다. 옮긴 말이 더 낯설고, '머리'는 선반 이름이 아니라 몸의 부위로 읽혔다.
export const SHELF_WORDS = {
  glove: { head: '장갑', list: GLOVES, field: 'grip' },
  boot: { head: '축구화', list: BOOTS, field: 'studs' },
  kit: { head: '유니폼', list: KITS, field: 'pads' },
  sock: { head: '양말', list: SOCKS, field: 'socks' },
  frame: { head: '골대', list: GOALS, field: 'frame' },
  city: { head: '동네', list: CITIES, field: 'city' },
  hair: { head: '헤어', list: HAIRS, field: 'hair' },
  beard: { head: '수염', list: BEARDS, field: 'beard' },
  ink: { head: '타투', list: TATTOOS, field: 'ink' }
};

export const AXIS_WORD = {
  tear: '장갑 벗겨짐',
  spill: '흘림',
  delay: '첫발 지연',
  carry: '강슛 밀림',
  landing: '착지 실수',
  neteat: '그물 흡수',
  gaze: '행인 등장',
  passer: '행인 수',
  crowd: '팔로워 배율'
};
// 축마다 단위가 다르다. 확률은 %p, 시간은 ms, 사람은 명이다.
export const AXIS_UNIT = { delay: 'ms', passer: '명', crowd: '%', tear: '%p', spill: '%p', carry: '%p', landing: '%p', neteat: '%p' };

/* 사고를 깎는 선반. 축 이름과 선반 이름을 코드에서 맞대므로 위키가 짝을 옮겨 적지 않는다.
   오르는 축인 그물과 동네는 사고가 아니라 이득이라 빠지고, 남는 것은 다섯 줄이다. */
export const MISHAP_SHELF = Object.keys(SHELF_WORDS)
  .map((k) => [SHELF_WORDS[k].field, SHELF_WORDS[k].head])
  .filter((p) => GEAR_STEP[p[0]])
  .flatMap((p) => GEAR_STEP[p[0]].filter((st) => !st.up).map((st) => [AXIS_WORD[st.axis], p[1]]));

// 상점 안내문은 위키 화면이 가져가는 원문이다. 상점에는 안내문을 그리지 않는다.
export const SHOP_NOTICES_FOR_WIKI = ['봇이 대신 막은 슛에는 팔로워가 안 붙는다', '시간이 아니라 슛으로 닳는다. 한 번에 한 종류만 든다'];

/* 선반 카드가 들고 있던 설명 문장. 카드는 효과 한 줄만 들으므로 이 문장들은 화면에서 내려왔고,
   위의 상점 안내문과 같은 자리에 같은 형태로 선다. 주인은 위키 화면이다.
   문장을 여기 옮겨 적지 않고 선반 표에서 뽑는다. 옮겨 적으면 등급이 하나 늘어난 날
   선반은 늘고 이 줄은 옛 수를 말한다. rack 게이트의 축 하나가 선반 데이터와 이 값을 맞대 한 줄도 안 빠졌는지 센다. */
export const SHELF_NOTES_FOR_WIKI = Object.keys(SHELF_WORDS).map((k) => ({
  tab: k,
  head: SHELF_WORDS[k].head,
  rows: SHELF_WORDS[k].list.map((g) => ({ name: g.name, note: g.note }))
}));

