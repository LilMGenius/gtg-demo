/* 랭킹 칸. 내 정보 창의 넷째 칸이다. 판 다섯은 칩으로 고르고 고른 판은 창을 닫아도 남는다.
   칸과 달리 판은 사람이 다시 찾아오는 자리라서다. 줄은 서버가 있으면 서버의 것, 없으면 이 기기의 이름 있는
   계정끼리다. 내 줄은 늘 지금 판에서 뽑는다. 저장된 줄은 방금 막은 공을 모른다.
   창의 상태와 다시 그리기는 부르는 쪽이 넘긴다. 이 칸은 그 둘 말고 게임 상태를 따로 들지 않는다. */
import { RANK_BOARDS, RANK_MIN_SHOTS, rankLine, sortBoard, rankValue, qualifies, sendRankLine, fetchLines } from '../state/rank.mjs';
import { currentId, nickOf, isGuest, namedAccounts } from '../state/account.mjs';
import { peek } from '../state/save.mjs';

export function createRankPane({ state, isOpen, rerender }) {
  let board = 'save';
  let net = null;
  const myLine = () => rankLine(nickOf(currentId()) || '', { record: state.record, keeper: state.keeper, fans: state.fans, rapport: state.rapport });
  const lines = () => {
    const me = currentId();
    const mine = isGuest(me) ? null : myLine();
    const others = net
      ? net.filter((l) => l.nick !== (mine && mine.nick))
      : namedAccounts().filter((a) => a.id !== me).map((a) => rankLine(a.nick, peek(a.id)));
    return { mine, rows: sortBoard(mine ? others.concat([mine]) : others, board) };
  };
  function html() {
    const { mine, rows } = lines();
    const chips = '<div class="boards" role="group" aria-label="랭킹 판">' + RANK_BOARDS.map((b) =>
      '<button data-board="' + b.id + '"' + (b.id === board ? ' aria-pressed="true"' : ' aria-pressed="false"') + '>' + b.label + '</button>').join('') + '</div>';
    const row = (l, me) => '<div class="note rank' + (me ? ' mine' : '') + '"><b class="no">' + (l.rank || '-') + '</b><b class="nick">' + l.nick + '</b>'
      + '<em>' + rankValue(board, l[board]) + '</em></div>';
    const list = rows.map((l) => row(l, mine && l.nick === mine.nick)).join('');
    /* 판에 못 선 내 줄. 손님은 이름이 없어 판에 안 서고, 세이브율은 규정 구수 밑이면 안 선다.
       둘 다 맨 아래 한 줄로 까닭을 수로 보인다. */
    let tail = '';
    if (!mine) tail = '<div class="note rank mine out"><b class="no">-</b><b class="nick">손님</b><em>닉네임을 정하면 오른다</em></div>';
    else if (!qualifies(mine, board)) tail = '<div class="note rank mine out"><b class="no">-</b><b class="nick">' + mine.nick + '</b><em>' + rankValue(board, mine[board]) + ' <small>' + mine.shots + '/' + RANK_MIN_SHOTS + ' 슈팅</small></em></div>';
    return chips + '<div class="ranks">' + list + tail + '</div>' + (net ? '' : '<small class="src">이 기기 기록</small>');
  }
  function bind(box) {
    for (const b of box.querySelectorAll('[data-board]')) b.onclick = () => { board = b.dataset.board; rerender(); };
  }
  // 칸을 열 때 한 번 서버에 내 줄을 올리고 판을 받아 온다. 서버가 없으면 이 기기의 판에 머문다.
  async function sync() {
    const me = currentId();
    if (me && !isGuest(me)) await sendRankLine(me, myLine());
    net = await fetchLines();
    if (isOpen()) rerender();
  }
  return { html, bind, sync };
}
