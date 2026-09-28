/* 능력치 효과 표시. 훈련장(한 칸 올림)과 내 정보(1에 견준 지금 값)가 같은 계산과 같은 기억을 쓴다.
   게임 상태와 창 찾기는 부르는 쪽이 넘긴다. */
import { GROWABLE } from '../../../src/ledger.mjs';
import { impactBase, statImpact, statHeld } from '../state/impact.mjs';

/* 한 칸 올림의 몫. 숫자만 오르는 훈련은 무엇을 산 것인지가 안 읽혀, 올린 능력치가 성능 어디에 붙는지를
   위키에서만 알 수 있었다. 봇 입력으로 같은 시드를 짝지어 잰 값을 칸 아래에 세운다. 키퍼와 레벨과 동네가
   같으면 같은 값이라 한 번 잰 것을 들고 있다. 창을 먼저 그리고 칸마다 한 박자씩 쉬어 가며 채운다. */
export function createImpact({ state, el }) {
let impactKey = '', impactBaseline = null;
// 두 물음의 답을 따로 든다. next는 한 칸 올림(훈련장), held는 지금 값이 1에 비해 버는 몫(내 정보)이다.
const impactMemo = { next: {}, held: {} };
function impactStateKey() {
  const k = state.keeper;
  return GROWABLE.map((s) => k[s]).join(',') + '|' + k.level + '|' + state.gear.city;
}
function fxText(stat, kind = 'next') {
  const r = impactKey === impactStateKey() ? impactMemo[kind][stat] : undefined;
  if (r === undefined) return '<span>…</span>';
  if (!r) return '';
  const parts = [];
  if (r.save) parts.push('세이브 ' + (r.save > 0 ? '+' : '') + r.save.toFixed(1) + '%p');
  if (r.fans) parts.push('팔로워 ' + (r.fans > 0 ? '+' : '') + Math.round(r.fans) + '%');
  return parts.length ? parts.map((x) => '<span>' + x + '</span>').join('') : '<span>변화 없음</span>';
}
let impactTimer = 0;
function fillImpact(kind = 'next', boxId = 'gym', after = null) {
  clearTimeout(impactTimer);
  const key = impactStateKey();
  if (impactKey !== key) {
    impactKey = key;
    impactBaseline = null;
    impactMemo.next = {};
    impactMemo.held = {};
  }
  const memo = impactMemo[kind];
  const todo = GROWABLE.filter((s) => !(s in memo));
  if (!todo.length) return;
  const step = () => {
    const box = el(boxId);
    if (!box || box.hidden || impactKey !== impactStateKey() || !box.querySelector('[data-fx]')) return;
    const city = state.gear.city;
    if (!impactBaseline) impactBaseline = impactBase(state.keeper, city);
    else {
      const stat = todo.shift();
      memo[stat] = kind === 'held' ? statHeld(state.keeper, stat, impactBaseline, city)
        : statImpact(state.keeper, stat, impactBaseline, city);
      const slot = box.querySelector('[data-fx="' + stat + '"]');
      if (slot) slot.innerHTML = fxText(stat, kind);
      // 칸이 한 줄씩 자라면 창이 접힘 아래로 넘친다. 굴러간다는 자국을 다시 잰다.
      if (after) after(box);
    }
    if (todo.length) impactTimer = setTimeout(step, 0);
  };
  impactTimer = setTimeout(step, 30);
}
return { fxText, fillImpact };
}
