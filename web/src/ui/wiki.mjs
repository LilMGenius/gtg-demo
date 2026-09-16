// 위키. 도움말이 타이틀 패널 하나와 재화 칩 하나로 갈려 있었다. 두 자리 다 판 밖이라
// 판을 굴리는 중에는 무엇이 어떻게 도는지 물어볼 곳이 없었다. 물음표 아래 주제별 칸이 그 자리다.
//
// 표의 수는 전부 코드 상수에서 읽는다. 화면에 수를 옮겨 적으면 상수가 바뀐 날 화면만 옛 수를 말하고,
// 그 거짓말은 아무도 안 고친다. 그래서 이 파일에는 판정에 쓰이는 수가 하나도 없다.
import { VERSION, buildId } from '../build.mjs';
import { COIN_SAVE, COIN_CONCEDED, COIN_DRILL, COIN_FAME_STEP, CASH_RATE } from '../state/wallet.mjs';
import { BOTS } from '../state/bot.mjs';
import { KEY_MAP } from './keys.mjs';
import { BUFFS } from '../state/buff.mjs';
import { PULL_COST, PULL_BULK, PULL_BONUS, TICKET_CAP, PULL_KINDS } from '../../../src/roster.mjs';
import { CAUSE_LABEL, INPUT_CAUSES } from '../../../src/ledger.mjs';
import { LIKE_BASE, LIKE_PER_CITY, MUTUAL_STEP, MUTUAL_CAP, SELFIE_BASE } from '../state/gram.mjs';

// 카테고리 순서가 첫 진입과 키보드 순서를 정한다. 키는 ASCII고 화면에 서는 것은 라벨이다. 라벨로 찾으면 라벨을 다듬은 날 계기가 죽는다.
export const WIKI_CATS = [
  { key: 'game', label: '이 게임' },
  { key: 'hand', label: '조작' },
  { key: 'coin', label: '재화' },
  { key: 'drill', label: '훈련' },
  { key: 'gear', label: '장비' },
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
// gamewiki (MIT), https://github.com/DaedalGames/gamewiki: reuse its GFM renderer.
// JSON modules provide a synchronous built fallback; one fetch refreshes the pages.
import builtPages from '../../wiki/dist/pages.json' with { type: 'json' };
import entities from '../../wiki/dist/entities.json' with { type: 'json' };
const CONSTANTS = {
  wallet: { COIN_SAVE, COIN_CONCEDED, COIN_DRILL, CASH_RATE },
  roster: { PULL_COST, PULL_BULK, PULL_BONUS, TICKET_CAP },
  gram: { LIKE_BASE, LIKE_PER_CITY, MUTUAL_STEP, MUTUAL_CAP, SELFIE_BASE }
};
const value = (id) => {
  const ref = entities.find(e => e.id === id)?.valueFrom;
  const [module, name] = (ref || '').split('.');
  const number = CONSTANTS[module]?.[name];
  if (typeof number !== 'number') throw new Error('Unknown wiki valueFrom: ' + ref);
  return number;
};
let pages = builtPages;
export const wikiReady = typeof window === 'undefined' ? Promise.resolve() : fetch(new URL('../../wiki/dist/pages.json', import.meta.url))
  .then(response => { if (!response.ok) throw new Error('Wiki HTTP ' + response.status); return response.json(); })
  .then(data => {
    if (!Array.isArray(data) || !WIKI_CATS.every(c => data.some(p => p.id === c.key && typeof p.bodyHtml === 'string'))) throw new Error('Invalid wiki pages');
    pages = data;
    window.dispatchEvent(new Event('wiki-ready'));
  }).catch(() => {});

const TABLES = {
  game: () => [table(['자리', '값'], [['버전', 'v' + VERSION], ['빌드', 'v' + VERSION + '+…']]),
    '<button class="copy" type="button">복사</button>'],
  hand: (ctx) => [
      (typeof document !== 'undefined' && !document.fullscreenEnabled && !document.documentElement.webkitRequestFullscreen) ? '<p>iPhone에서는 공유 메뉴에서 홈 화면에 추가한 뒤 실행하면 전체 화면으로 플레이할 수 있다.</p>' : '',
      table(['키', '하는 일'], KEY_MAP.map(({ label, note }) => [label, note])),
      table(['버튼', '하는 일'], [['돌진', '각을 좁히러 나간다. 뚫리면 골대가 빈다']])
    ],
  coin: (ctx) => [table(['자리', '값'], [
      ['막으면', value('coin-save')],
      ['최상급', value('coin-save') + COIN_FAME_STEP * 9],
      ['먹혀도', value('coin-conceded')],
      ['훈련 대신', value('drill')],
      ['캐시 한 단위', value('cash-rate')]
    ])],
  drill: (ctx) => [table(['자리', '값'], [['훈련 대신', value('drill')]])],
  gear: (ctx) => (ctx.shelves || []).map((s) => '<h5>' + esc(s.head) + '</h5>'
      + table(['이름', '효과'], (s.rows || []).map((g) => [g.name, g.note]))),
  pull: (ctx) => [table(['자리', '값'], [
      ['한 장', value('pull-cost')],
      ['묶음', value('pull-bulk')],
      ['묶음 보상', value('pull-bonus')],
      ['이용권 한도', value('ticket-cap')]
    ]), table(['종류', '설명'], PULL_KINDS.map(k => [k.name, k.note]))],
  gram: (ctx) => [table(['자리', '값'], [
      ['좋아요', value('like-base')],
      ['동네 한 등급', value('like-per-city')],
      ['맞팔 한 명', value('mutual-step')],
      ['맞팔 한도', value('mutual-cap')],
      ['같이 한 장', value('selfie-base')]
    ])],
  bot: (ctx) => [table(['이름', '판단력', '분', '값'],
      BOTS.map((b) => [b.name, b.judge, b.minutes, b.cost]))],
  buff: (ctx) => [table(['이름', '효과', '슛', '값'],
      BUFFS.map((b) => [b.name, b.note, b.shots, b.cost]))],
  risk: (ctx) => [
      table(['입력', '무엇'], [
        [CAUSE_LABEL[INPUT_CAUSES[0]], '고른 자리'],
        [CAUSE_LABEL[INPUT_CAUSES[1]], '누른 때'],
        [CAUSE_LABEL[INPUT_CAUSES[2]], '나간 거리']
      ]),
      table(['사고', '깎는 선반'], ctx.mishaps || [])
    ]
};

// 복사 결과를 읽을 시간을 주되 다음 복사를 오래 가리지 않는다.
const COPY_FEEDBACK_MS = 1200;

export function mountWikiBuild(box) {
  // 다른 카테고리에는 좌표 표가 없으므로 그릴 때의 버튼으로 범위를 묶는다.
  const button = box.querySelector('.copy');
  if (!button) return;
  // 표의 빌드 행만 바꿔 본문이나 현재 스크롤을 다시 그리지 않는다.
  const cell = box.querySelector('tbody tr:last-child td');
  let full;
  let feedback;
  button.disabled = true;
  void buildId().then(id => {
    full = 'v' + id;
    cell.textContent = full;
    button.disabled = false;
  });
  // 플랫폼 API를 재사용한다. MDN writeText/execCommand의 선택 복사 경로를 권한 거절 때만 쓴다.
  // https://developer.mozilla.org/en-US/docs/Web/API/Clipboard/writeText
  // https://developer.mozilla.org/en-US/docs/Web/API/Document/execCommand
  button.onclick = async () => {
    try {
      try { await navigator.clipboard.writeText(full); }
      catch {
        // 선택 가능한 임시 입력만 두고 복사 직후 원래 버튼으로 초점을 돌린다.
        const input = document.createElement('textarea');
        input.value = full;
        input.style.cssText = 'position:fixed;left:-9999px;top:0';
        document.body.append(input);
        input.select();
        try { if (!document.execCommand('copy')) throw new Error('Copy rejected'); }
        finally { input.remove(); button.focus({ preventScroll: true }); }
      }
      clearTimeout(feedback);
      button.textContent = '복사됨';
      feedback = setTimeout(() => { button.textContent = '복사'; }, COPY_FEEDBACK_MS);
    } catch { button.textContent = '복사'; }
  };
}

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
  const cat = WIKI_CATS.some(c => c.key === key) ? key : WIKI_CATS[0].key;
  const page = pages.find(p => p.id === cat);
  const html = page.bodyHtml.replaceAll('{{value}}', () => esc(value(cat)));
  return '<h4>' + esc(page.title) + '</h4><div class="wiki-prose" data-wiki-id="' + cat + '">' + html + '</div>'
    + TABLES[cat](ctx || {}).join('');
}
