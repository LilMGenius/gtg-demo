// 위키. 도움말이 타이틀 패널 하나와 재화 칩 하나로 갈려 있었다. 두 자리 다 판 밖이라
// 판을 굴리는 중에는 무엇이 어떻게 도는지 물어볼 곳이 없었다. 물음표 하나 아래 여덟 칸이 그 자리다.
//
// 표의 수는 전부 코드 상수에서 읽는다. 화면에 수를 옮겨 적으면 상수가 바뀐 날 화면만 옛 수를 말하고,
// 그 거짓말은 아무도 안 고친다. 그래서 이 파일에는 판정에 쓰이는 수가 하나도 없다.
import { COIN_SAVE, COIN_CONCEDED, COIN_DRILL, COIN_FAME_STEP } from '../state/wallet.mjs';
import { BOTS } from '../state/bot.mjs';
import { BUFFS } from '../state/buff.mjs';
import { PULL_COST, PULL_BULK, PULL_BONUS, TICKET_CAP, PULL_KINDS } from '../../../src/roster.mjs';
import { CAUSE_LABEL, INPUT_CAUSES } from '../../../src/ledger.mjs';
import { LIKE_BASE, LIKE_PER_CITY, MUTUAL_STEP, MUTUAL_CAP, SELFIE_BASE } from '../state/gram.mjs';

// 카테고리 여덟. 키는 ASCII고 화면에 서는 것은 라벨이다. 라벨로 찾으면 라벨을 다듬은 날 계기가 죽는다.
export const WIKI_CATS = [
  { key: 'hand', label: '조작' },
  { key: 'coin', label: '재화' },
  { key: 'drill', label: '훈련' },
  { key: 'pull', label: '이적시장' },
  { key: 'gram', label: '아웃문그램' },
  { key: 'bot', label: '봇' },
  { key: 'buff', label: '버프' },
  { key: 'risk', label: '사고' }
];

const esc = (v) => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// 표 한 장. 첫 칸은 이름이라 th이고 나머지가 값이다. 값 칸이 이름 칸과 같은 요소면
// 훑어 비교하는 눈이 어느 칸이 값인지를 매 줄 다시 고른다.
// 값 칸. 수인 칸만 수치 등급을 받는다. 효과 한 줄이 같은 등급으로 서면 문장이 값으로 읽힌다.
const cell = (c) => (/^[0-9][0-9,.]*$/.test(String(c)) ? '<td class="num">' : '<td>') + esc(c) + '</td>';
const table = (heads, list) => '<table><thead><tr>'
  + heads.map((h) => '<th>' + esc(h) + '</th>').join('')
  + '</tr></thead><tbody>'
  + list.map((r) => '<tr>' + r.map((c, i) => (i ? cell(c) : '<th scope="row">' + esc(c) + '</th>')).join('') + '</tr>').join('')
  + '</tbody></table>';
const says = (list) => list.filter((s) => s).map((s) => '<p>' + esc(s) + '</p>').join('');

/* 본문 여덟. 제목은 명사구, 그 아래 두세 줄, 그리고 표다. 문장만 있는 칸은 수치를 물으러 온 눈이
   빈손으로 나가고, 표만 있는 칸은 그 수가 무엇의 수인지가 안 적힌다. */
const BODY = {
  hand: () => ({
    head: '세 칸과 타이밍',
    text: ['화면 세 칸을 누른다. 공이 올 곳을 찍는다',
      '너무 빠르면 역동작, 너무 늦으면 손이 안 닿는다',
      '마우스도 같은 세 칸이고 키보드도 된다'],
    tables: [
      table(['자리', '키'], [['왼쪽', '←'], ['가운데', '↑'], ['오른쪽', '→']]),
      table(['버튼', '하는 일'], [['돌진', '각을 좁히러 나간다. 뚫리면 골대가 빈다']])
    ]
  }),
  coin: () => ({
    head: '버는 법',
    text: ['막은 슛과 먹힌 슛이 모두 값을 남긴다',
      '유명한 키커일수록 막았을 때 더 붙는다',
      '스폰은 결제로만 들어온다'],
    tables: [table(['자리', '값'], [
      ['막으면', COIN_SAVE],
      ['최상급', COIN_SAVE + COIN_FAME_STEP * 9],
      ['먹혀도', COIN_CONCEDED],
      ['훈련 대신', COIN_DRILL],
      ['스폰', '결제']
    ])]
  }),
  drill: (ctx) => ({
    head: '능력과 선반',
    text: ['훈련은 능력 한 칸을 올린다',
      '올릴 칸이 없으면 훈련 한 회가 값으로 바뀐다',
      '선반은 등급마다 판정을 조금씩 민다'],
    tables: [table(['자리', '값'], [['훈련 대신', COIN_DRILL]])].concat(
      (ctx.shelves || []).map((s) => '<h5>' + esc(s.head) + '</h5>'
        + table(['이름', '효과'], (s.rows || []).map((g) => [g.name, g.note]))))
  }),
  pull: () => ({
    head: '이적시장',
    text: (PULL_KINDS || []).map((k) => k.note).concat(['이용권은 완봉으로 쌓인다']),
    tables: [table(['자리', '값'], [
      ['한 장', PULL_COST],
      ['묶음', PULL_BULK],
      ['묶음 보상', PULL_BONUS],
      ['이용권 한도', TICKET_CAP]
    ])]
  }),
  gram: () => ({
    head: '팔로워와 맞팔',
    text: ['막은 슛이 소문이 되어 팔로워가 붙는다',
      '맞팔은 소문을 조금씩 넓힌다',
      '동네 등급이 오르면 같은 슛에 더 붙는다'],
    tables: [table(['자리', '값'], [
      ['좋아요', LIKE_BASE],
      ['동네 한 등급', LIKE_PER_CITY],
      ['맞팔 한 명', MUTUAL_STEP],
      ['맞팔 한도', MUTUAL_CAP],
      ['같이 한 장', SELFIE_BASE]
    ])]
  }),
  bot: (ctx) => ({
    head: '봇',
    text: [(ctx.notices || [])[0],
      '판단력만 봇 값으로 바뀐다',
      '크레딧은 여섯 시간까지만 쌓인다'],
    tables: [table(['이름', '판단력', '분', '값'],
      BOTS.map((b) => [b.name, b.judge, b.minutes, b.cost]))]
  }),
  buff: (ctx) => ({
    head: '버프',
    text: [(ctx.notices || [])[1],
      '한 종류를 다 쓰기 전에는 다른 종류를 못 산다',
      '쌓아 둘 수 있는 슛에는 한도가 있다'],
    tables: [table(['이름', '효과', '슛', '값'],
      BUFFS.map((b) => [b.name, b.note, b.shots, b.cost]))]
  }),
  risk: (ctx) => ({
    head: '사고',
    text: ['막을 수 있었는데 안 막히는 자리가 있다',
      '입력 셋이 어긋나면 그 슛은 거기서 갈린다',
      '선반은 이 사고들을 조금씩 깎는다'],
    tables: [
      table(['입력', '무엇'], [
        [CAUSE_LABEL[INPUT_CAUSES[0]], '고른 자리'],
        [CAUSE_LABEL[INPUT_CAUSES[1]], '누른 때'],
        [CAUSE_LABEL[INPUT_CAUSES[2]], '나간 거리']
      ]),
      table(['사고', '깎는 선반'], ctx.mishaps || [])
    ]
  })
};

export function wikiHTML(cur) {
  const tabs = WIKI_CATS.map((c) => '<button type="button" data-cat="' + c.key + '"'
    + (c.key === cur ? ' aria-current="true"' : '') + '>' + esc(c.label) + '</button>').join('');
  return '<div class="sheet"><nav class="cats">' + tabs + '</nav>'
    // 본문을 감싸는 칸. 신호는 본문 밖에 서야 본문과 같이 안 굴러간다.
    + '<div class="bodybox"><div class="body"></div>'
    + '<div class="cue up" aria-hidden="true"></div><div class="cue down" aria-hidden="true"></div></div>'
    + '<button class="close">닫기</button></div>';
}

export function wikiBody(key, ctx) {
  const make = BODY[key] || BODY.hand;
  const b = make(ctx || {});
  return '<h4>' + esc(b.head) + '</h4>' + says(b.text) + b.tables.join('');
}
