// 위키 사실 파일. 패널과 사이트가 같은 표를 그리려면 표가 코드 상수에서 한 번 뽑혀 한 파일에 서야 한다.
// 이 파일이 그 한 번이다. 수를 옮겨 적지 않고 상수를 읽으므로 상수가 바뀐 날 npm run wiki가 두 출력을 같이 바꾼다.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { COIN_SAVE, COIN_CONCEDED, COIN_DRILL, COIN_FAME_STEP, CASH_RATE } from '../web/src/state/wallet.mjs';
import { BOTS } from '../web/src/state/bot.mjs';
import { conditionLabel } from '../web/src/state/condition.mjs';
import { SHELF_WORDS } from '../web/src/state/shelf.mjs';
import { KEY_MAP } from '../web/src/ui/keys.mjs';
import { BUFFS } from '../web/src/state/buff.mjs';
import { PULL_COST, PULL_BULK, PULL_BONUS, TICKET_CAP, PULL_KINDS } from '../src/roster.mjs';
import { CAUSE_LABEL, INPUT_CAUSES } from '../src/ledger.mjs';
import { LIKE_BASE, LIKE_PER_CITY, MUTUAL_STEP, MUTUAL_CAP, SELFIE_BASE } from '../web/src/state/gram.mjs';
import { MISHAP_SHELF, SHELF_NOTES_FOR_WIKI } from '../web/src/state/shelf.mjs';

const values = {
  'coin-save': COIN_SAVE, 'coin-conceded': COIN_CONCEDED, 'cash-rate': CASH_RATE, drill: COIN_DRILL,
  'pull-cost': PULL_COST, 'pull-bulk': PULL_BULK, 'pull-bonus': PULL_BONUS, 'ticket-cap': TICKET_CAP,
  'like-base': LIKE_BASE, 'like-per-city': LIKE_PER_CITY, 'mutual-step': MUTUAL_STEP, 'mutual-cap': MUTUAL_CAP, 'selfie-base': SELFIE_BASE
};
const kv = (rows) => ({ columns: ['자리', '값'], rows });
const tables = {
  hand: [
    { columns: ['키', '하는 일'], rows: KEY_MAP.map(({ label, note }) => [label, note]) },
    { columns: ['버튼', '하는 일'], rows: [['돌진', '각을 좁히러 나간다. 뚫리면 골대가 빈다']] }
  ],
  coin: [kv([['막으면', COIN_SAVE], ['최상급', COIN_SAVE + COIN_FAME_STEP * 9], ['먹혀도', COIN_CONCEDED], ['훈련 대신', COIN_DRILL], ['캐시 한 단위', CASH_RATE]])],
  drill: [kv([['훈련 대신', COIN_DRILL]])],
  gear: SHELF_NOTES_FOR_WIKI.map((s) => ({ head: s.head, columns: ['이름', '효과', '구매 조건'], rows: s.rows.map((g, i) => [g.name, g.note, conditionLabel(SHELF_WORDS[s.tab].list[i].condition) || '없음']) })),
  pull: [kv([['한 장', PULL_COST], ['묶음', PULL_BULK], ['묶음 보상', PULL_BONUS], ['이용권 한도', TICKET_CAP]]),
    { columns: ['종류', '설명'], rows: PULL_KINDS.map((k) => [k.name, k.note]) }],
  gram: [kv([['좋아요', LIKE_BASE], ['동네 한 등급', LIKE_PER_CITY], ['맞팔 한 명', MUTUAL_STEP], ['맞팔 한도', MUTUAL_CAP], ['같이 한 장', SELFIE_BASE]])],
  bot: [{ columns: ['이름', '판단력', '분', '값', '구매 조건'], rows: BOTS.map((b) => [b.name, b.judge, b.minutes, b.cost, conditionLabel(b.condition) || '없음']) }],
  buff: [{ columns: ['이름', '효과', '슛', '값'], rows: BUFFS.map((b) => [b.name, b.note, b.shots, b.cost]) }],
  risk: [
    { columns: ['입력', '무엇'], rows: [[CAUSE_LABEL[INPUT_CAUSES[0]], '고른 자리'], [CAUSE_LABEL[INPUT_CAUSES[1]], '누른 때'], [CAUSE_LABEL[INPUT_CAUSES[2]], '나간 거리']] },
    { columns: ['사고', '깎는 선반'], rows: MISHAP_SHELF }
  ]
};
const out = fileURLToPath(new URL('../web/wiki/facts.json', import.meta.url));
writeFileSync(out, JSON.stringify({ values, tables }, null, 2) + '\n');
console.log('facts ' + Object.keys(values).length + ' values, ' + Object.keys(tables).length + ' table sets');

