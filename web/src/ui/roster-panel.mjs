import { thumbURL } from '../render/thumb.mjs';
import { lookOf } from '../state/gear.mjs';
import { KEEPERS, keeperCost, ROLES, KICKERS, kickerByName, FIELD, kickerCost } from '../../../src/roster.mjs';
import { POS_ICON } from './icons.mjs';

/* 선수단 창. 포지션 탭, 왼쪽 포메이션 판, 선발 토글, 영입. */
export function createRosterPanel({ state, el, affordable, PRICE, purchase, recruit, persist, pips, stage, shutOthers, clearFitting }) {

// 약어는 축구가 쓰는 그것을 그대로 쓴다. 한 글자로 줄이면 넷이 안 갈리고, 세 글자는 탭 폭을 먹는다.
const POS_ABBR = { gk: 'GK', '수비수': 'DF', '미드필더': 'MF', '공격수': 'FW' };

// 선수단. 명단 전체를 걸어놓고 보유한 것만 뛸 수 있다.
// 보유 판정은 이름으로 한다. 로스터 항목과 저장된 키퍼는 다른 객체이기 때문이다.
function renderRoster() {
  const box = el('roster');
  /* 골키퍼 칸. 지금 뛰는 사람은 밝은 카드 하나로 서고 나머지는 누르면 세운다. 상태 글자(출전, 교체)는 안 붙인다.
     밝기가 이미 그 말을 하고, 글자를 붙이면 같은 뜻이 두 번 선다(파운더 2026-09-28). */
  const mine = state.squad.map((k, i) => {
    const now = i === state.pick;
    return '<button data-at="' + i + '"' + (now ? ' class="here" aria-pressed="true" disabled' : ' aria-pressed="false"') + '>'
      + '<img alt="' + k.name + '" src="' + thumbURL('face', k, lookOf({}, k.name)) + '">'
      + '<span class="nm">' + k.name + '</span><em>Lv ' + k.level + '</em></button>';
  }).join('');
  // 아직 없는 사람만 영입 줄에 선다. 가진 사람이 값과 함께 다시 뜨면 두 번 살 수 있는 것처럼 읽힌다.
  const pool = KEEPERS.filter((e) => !state.squad.some((k) => k.name === e.name));
  const hire = pool.map((entry) => {
    const cost = keeperCost(entry);
    const off = !affordable(cost);
    return '<button data-n="' + entry.name + '"' + (off ? ' disabled' : '') + '>'
      + '<img alt="' + entry.name + '" src="' + thumbURL('face', entry, lookOf({}, entry.name)) + '">'
      + '<span class="nm">' + entry.name + '</span><em>' + PRICE(cost) + '</em></button>';
  }).join('');
  /* 포지션 탭. 탭마다 그 자리의 보유 수를 전체 풀과 함께 단다(1/12). 제목 옆에 지금 탭 하나의 수만 적으면
     다른 자리의 보유는 탭을 눌러야 보였다. 지금 어느 자리를 보는지는 aria-selected가 소유한다. */
  const tabs = '<div class="kinds" role="tablist">' + ['gk'].concat(ROLES)
    .map((id) => { const [have, all] = ownedOf(id); return '<button class="kind pos-' + POS_ABBR[id].toLowerCase() + '" role="tab" data-pos="' + id + '" aria-selected="'
      + (squadTab === id) + '">' + POS_ICON[id] + '<span>' + POS_ABBR[id] + '</span><small>보유 ' + have + '/' + all + '</small></button>'; }).join('') + '</div>';
  const pane = squadTab === 'gk'
    ? '<div class="row mine">' + mine + '</div>'
      + (hire ? '<h5>영입</h5><div class="row hire">' + hire + '</div>' : '')
    : kickerPane(squadTab);
  /* 창 뼈대. 창 이름은 맨 위 머리 띠에 붙박이로 서고 탭이 그 아래 공통 줄에 선다. 굴리는 것은 명단 몸 하나다.
     주전 수(11/11)는 안 적는다. 시작 때 열하나를 공짜로 주어 비는 일이 없고, 몇 명이 섰는지는 왼쪽 판이 그림으로 말한다. */
  box.innerHTML = '<h4 class="ptitle">선수단</h4>' + tabs + '<div class="rosterbody">' + formationBoard() + '<div class="rosterlist">' + pane + '</div></div>'
    + '<button class="close">닫기</button>';
  for (const b of box.querySelectorAll('.kind')) b.onclick = () => { squadTab = b.dataset.pos; renderRoster(); };
  bindKickerPane(box);
  box.querySelector('.close').onclick = closeRoster;
  /* 세우기. 이미 가진 사람이라 값이 안 나간다.
     골키퍼 칸에서만 건다. 키커 칸도 같은 .row.mine을 쓰므로 조건 없이 걸면 이 줄이 뒤에 돌면서
     키커 카드의 클릭을 덮어쓰고, 그 자리에서 swapTo(NaN)가 조용히 아무 일도 안 한다. */
  for (const b of box.querySelectorAll('.row.mine button[data-at]')) b.onclick = () => {
    if (b.disabled) return;
    swapTo(Number(b.dataset.at));
  };
  // 영입. 값을 치르고 명단 끝에 붙인 뒤 그 사람을 세운다. 여기도 골키퍼 칸의 것만 건다.
  for (const b of box.querySelectorAll('.row.hire button[data-n]')) b.onclick = () => {
    if (b.disabled) return;
    const entry = KEEPERS.find((k) => k.name === b.dataset.n);
    if (!entry) return;
    const cost = keeperCost(entry);
    if (!purchase(cost)) return;
    state.squad.push(recruit(entry));
    swapTo(state.squad.length - 1);
  };
}

// 한 자리의 보유 수와 그 자리의 전체 풀. 골키퍼는 명단 밖에서 시작한 첫 키퍼까지 센다.
function ownedOf(id) {
  if (id === 'gk') {
    const all = new Set(KEEPERS.map((k) => k.name).concat(state.squad.map((k) => k.name)));
    return [state.squad.length, all.size];
  }
  const inRole = KICKERS.filter((k) => k.role === id);
  return [inRole.filter((k) => state.kickers.indexOf(k.name) >= 0).length, inRole.length];
}

/* 포메이션 판. 선발 열하나를 포지션 색 점으로 경기장 위에 세운다. 골키퍼가 맨 아래, 공격이 맨 위다.
   포지션 색은 축구 UI의 관례다(GK 노랑, DF 파랑, MF 초록, FW 빨강; FIFA/EA FC 선수 카드와 포메이션 화면).
   4-3-3으로 못 박지 않는다. 한 자리에 선 수대로 줄을 세우고 한 줄은 다섯까지라 수비 열이면 파랑 두 줄이다. */
const LINE_MAX = 5;
function formationBoard() {
  const dot = (cls, name) => '<i class="dot pos-' + cls + '" title="' + name + '"></i>';
  const lines = [];
  for (const role of ROLES.slice().reverse()) {
    const names = state.eleven.filter((n) => kickerByName(n)?.role === role);
    const cls = POS_ABBR[role].toLowerCase();
    for (let i = names.length; i > 0; i -= LINE_MAX) lines.push('<div class="line">' + names.slice(Math.max(0, i - LINE_MAX), i).map((n) => dot(cls, n)).join('') + '</div>');
  }
  lines.push('<div class="line">' + dot('gk', state.keeper.name) + '</div>');
  return '<div class="pitch" role="img" aria-label="포메이션">' + lines.join('') + '</div>';
}

// 선수단 창에서 보고 있는 포지션. 창 수명만 사는 값이라 저장에 안 싣는다.
let squadTab = 'gk';

/* 한 포지션의 칸. 선발(밝은 카드)이 먼저, 가진 벤치가 다음, 영입이 마지막이다. 선발과 벤치는 한 격자에 서고
   누르면 토글된다. 머리(가진 사람)도 상태 글자(선발, 해제)도 안 단다. 밝기와 판 위의 점이 그 말을 한다.
   필드 열 명이 차면 벤치 카드는 흐려진다. 자리별 정원은 없다(파운더 2026-09-28: 4-3-3 고정 아님). */
function kickerPane(role) {
  const inRole = (n) => { const k = kickerByName(n); return k && k.role === role; };
  const starting = state.eleven.filter(inRole);
  const owned = state.kickers.filter((n) => inRole(n) && starting.indexOf(n) < 0);
  const full = state.eleven.length >= FIELD;
  const card = (n, on) => {
    const k = kickerByName(n);
    if (!k) return "";
    return '<button data-kick="' + n + '" aria-pressed="' + on + '"' + (on ? ' class="here"' : full ? ' class="full" aria-disabled="true"' : '') + '>'
      + '<img alt="' + n + '" src="' + thumbURL("face", k, lookOf({}, n)) + '">'
      + '<span class="nm">' + n + '</span><em>결정력 ' + k.finishing + '</em></button>';
  };
  const hire = KICKERS.filter((k) => k.role === role && state.kickers.indexOf(k.name) < 0).map((k) => {
    const cost = kickerCost(k);
    const off = !affordable(cost);
    return '<button data-buy="' + k.name + '"' + (off ? ' disabled' : '') + '>'
      + '<img alt="' + k.name + '" src="' + thumbURL("face", k, lookOf({}, k.name)) + '">'
      + '<span class="nm">' + k.name + '</span><em>' + PRICE(cost) + '</em></button>';
  }).join("");
  const mineRow = starting.map((n) => card(n, true)).join("") + owned.map((n) => card(n, false)).join("");
  return (mineRow ? '<div class="row mine">' + mineRow + '</div>' : '')
    + (hire ? '<h5>영입</h5><div class="row hire">' + hire + '</div>' : '');
}

/* 세우기와 내리기와 영입. 셋 다 한 곳에서 끝나야 정원 검사가 한 번만 적힌다.
   필드 열 명을 넘겨 세우는 것은 막는다. 넘긴 채로 판이 열리면 열둘이 도는 셈이 된다. */
function bindKickerPane(box) {
  for (const b of box.querySelectorAll("[data-kick]")) b.onclick = () => {
    const n = b.dataset.kick;
    if (!kickerByName(n)) return;
    const at = state.eleven.indexOf(n);
    if (at >= 0) state.eleven.splice(at, 1);
    else {
      if (state.eleven.length >= FIELD) return;
      state.eleven.push(n);
    }
    persist();
    renderRoster();
  };
  for (const b of box.querySelectorAll("[data-buy]")) b.onclick = () => {
    if (b.disabled) return;
    const k = kickerByName(b.dataset.buy);
    if (!k) return;
    const cost = kickerCost(k);
    if (!purchase(cost)) return;
    state.kickers.push(k.name);
    persist();
    pips();
    renderRoster();
  };
}

// 세우는 자리 하나. 영입과 교체가 같은 길로 끝나야 한 쪽만 고쳐지는 일이 없다.
function swapTo(at) {
  if (!(at >= 0 && at < state.squad.length)) return;
  // 참조 재대입이다. 값을 복사하면 훈련이 보유 목록에 안 남는다.
  state.pick = at;
  state.keeper = state.squad[at];
  // state.gear는 지금 뛰는 키퍼를 따라가므로, 교체한 뒤에 읽어야 그 사람이 걸친 것이 실린다.
  stage.setKeeper(state.keeper, lookOf(state.gear, state.keeper.name));
  // 걸쳐 보던 것은 사람이 바뀌면 버린다. 남겨 두면 다른 사람 몸에 얹혀 산 것처럼 보인다.
  clearFitting();
  persist();
  pips();
  renderRoster();
}
function openRoster() {
  if (!shutOthers('roster')) return;
  el('roster').hidden = false;
  renderRoster();
}

function closeRoster() {
  el('roster').hidden = true;
  /* 보던 포지션은 창과 함께 닫는다. 남겨 두면 다음에 연 사람이 공격수 칸을 먼저 보고
     자기 키퍼를 찾으러 탭을 눌러야 한다. 내 정보의 meTab과 상점 선반이 이미 쓰는 규칙이다. */
  squadTab = 'gk';
}


  return { openRoster, closeRoster };
}
