/* 유틸 선반. 상점의 열셋째 탭이다. 캐시로만 판다. 값 자리에 골드가 없으니 또는 칸도 없다.
   닉네임 변경권은 사는 자리에서 새 이름을 받는다. 권을 들고 있다가 다른 창에서 쓰게 하면
   이름을 바꾸러 온 사람이 문을 하나 더 찾아가야 한다.
   지갑과 저장과 다시 그리기는 부르는 쪽이 넘긴다. */
import { UTILS, utilAt, payCash, renamePrice } from '../state/util.mjs';
import { currentId, nickOf, isGuest, nickProblem, setNick, renamesOf } from '../state/account.mjs';
import { claimNick, nickKey } from '../state/rank.mjs';
import { IC_CASH, TAB_ICON } from './icons.mjs';

export function createUtilShelf({ state, persist, pips, rerender, root }) {
  let open = null;
  let say = '';
  const cashOnly = (n) => '<span class="price" data-cash="' + n + '" title="캐시"><span class="px cash' + (state.wallet.cash < n ? ' bad-cash' : '')
    + '" data-cash="' + n + '">' + IC_CASH + '<b>' + n + '</b></span></span>';
  function html() {
    const me = currentId();
    const named = me && !isGuest(me);
    const rows = UTILS.map((u) => {
      const cost = u.id === 'rename' ? renamePrice(renamesOf(me)) : u.cash;
      const off = !named || state.wallet.cash < cost;
      const form = open === u.id
        ? '<form class="rename" data-util="' + u.id + '"><input name="nick" maxlength="12" autocomplete="off" aria-label="새 닉네임" value="' + (nickOf(me) || '') + '">'
          + '<button class="buy" type="submit">' + cashOnly(cost) + '</button></form>'
          + (say ? '<small class="say" role="status">' + say + '</small>' : '')
        : '<button class="buy' + (state.wallet.cash < cost ? ' bad-price' : '') + '" data-util="' + u.id + '"' + (off ? ' disabled' : '') + '>' + cashOnly(cost) + '</button>';
      return '<div class="card gear util" data-spec="util" data-at="' + u.id + '" data-rare="1">'
        + '<div class="pic"><div class="shot icon">' + TAB_ICON.util + '</div></div>'
        + '<b>' + u.name + '</b>'
        + '<em><span class="ln"><span class="k">' + (named ? nickOf(me) : '닉네임 없음') + '</span></span></em>'
        + '<div class="foot">' + form + '</div></div>';
    });
    return '<div class="rack">' + rows.join('') + '</div>';
  }
  const close = () => { open = null; say = ''; };
  function bind(box) {
    for (const b of box.querySelectorAll('.buy[data-util]')) {
      b.onclick = () => {
        if (b.disabled) return;
        open = b.dataset.util;
        say = '';
        rerender();
        const input = root().querySelector('form.rename input');
        if (input) { input.focus(); input.select(); }
      };
    }
    for (const f of box.querySelectorAll('form.rename')) {
      f.onsubmit = async (e) => {
        e.preventDefault();
        const u = utilAt(f.dataset.util);
        const me = currentId();
        const nick = f.querySelector('input').value.trim();
        if (!u || !me || isGuest(me)) return;
        // 같은 이름이면 값을 안 받는다. 판 얼굴이 그대로인데 캐시만 빠진다.
        if (nick === nickOf(me)) { say = '지금 닉네임과 같다'; return rerender(); }
        const bad = nickProblem(nick, me);
        if (bad) { say = bad; return rerender(); }
        /* 판이 같은 이름으로 읽는 표기 고침은 값을 안 받는다. 판의 이름이 그대로인데 캐시와 다음 값만 움직이면
           변경권이 아무것도 안 판 것이 된다. */
        if (nickKey(nick) === nickKey(nickOf(me))) {
          setNick(me, nick);
          await claimNick(me, nick);
          close();
          return rerender();
        }
        const cost = renamePrice(renamesOf(me));
        if (state.wallet.cash < cost) return rerender();
        // 서버가 있으면 이름을 먼저 건다. 서버가 거절하면 캐시를 안 받는다.
        const held = await claimNick(me, nick);
        if (held && !held.ok) { say = held.why; return rerender(); }
        if (!payCash(state.wallet, cost)) return rerender();
        setNick(me, nick);
        close();
        persist();
        pips();
        rerender();
      };
    }
  }
  return { html, bind, close };
}
