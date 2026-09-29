import { lookOf } from '../state/gear.mjs';
import { pullKindOf, KEEPERS, keeperCost, KICKERS, pullYield, PULL_BULK, pullFrom, ROLES, ROLE_SLOTS, defaultEleven, kickerByName } from '../../../src/roster.mjs';
import { thumbURL } from '../render/thumb.mjs';
import { CAUSE_LABEL } from '../../../src/ledger.mjs';
import { ONBOARD_DONE, ONBOARD_KEEPER, ONBOARD_KICKERS, applyPreset } from '../state/inject.mjs';

/* 짧은 누름과 긴 누름을 가르는 문턱. 이보다 먼저 손가락이 올라오면 한 단만 오르고, 넘겨서 붙들고
   있으면 남은 것이 그 자리에서 전부 열린다. 0.45초는 넘기려고 스쳐 누르는 손가락보다 한참 길고
   답답해서 붙들고 있는 손가락보다는 짧아서, 둘 중 어느 쪽도 상대의 뜻으로 안 읽힌다. 
   상점 카드의 길게 눌러 돌리기도 같은 문턱을 쓴다. */
export const LONG_MS = 450;

/* 개봉 연출. 뽑은 카드를 한 장씩 다섯 단으로 뒤집고, 첫 진입에는 키퍼 팩과 키커 팩을 차례로 연다. */
export function createPullReveal({ state, el, persist, pips, stage, recruit, roll, packArt }) {
// 방금 뽑은 카드. 한 장씩 뒤집히는 동안 이름이 여기 쌓이고, 상점을 닫으면 비워진다.
let lastPull = [];
// 방금 연 팩의 갈래. 봉인 단의 뒷면이 그 팩의 포장이라, 산 팩과 여는 팩이 같은 물건으로 읽힌다.
let pullKindNow = 'town';
// 몇 장까지 뒤집혔는가. 뽑기와 별개로 도는 값이라, 이 수가 늘어도 지갑은 이미 치러져 있다.
let shown = 0;
// 뒤집기를 예약한 타이머. 상점을 닫거나 다시 뽑으면 끊는다. 안 끊으면 닫은 창에 카드가 계속 뜬다.
let revealTimer = 0;

const STAGE_MS = [300, 400, 340, 240, 320];
/* 등급 단만 카드마다 갈린다. 명성 9 이상은 0.4초에 0.8초를 더해 1.2초를 서고 나머지는 0.4초다.
   마흔여섯 중 여덟이라 그 멈춤이 자주 안 오고, 세 배 차이라야 길어진 빛이 지연이 아니라 신호로 읽힌다. */
const RARE_HOLD_MS = 800;
// 등급 단의 번호. 위 표에서 두 번째 자리다.
const BEAM_STAGE = 1;
// 마지막 단의 번호. 다섯 단이므로 4다.
const STAGE_LAST = STAGE_MS.length - 1;

/* 단의 길이에 곱하는 배수. 사람 손에는 늘 1이다. 화면을 찍는 계기가 봉인 단처럼 0.3초짜리 창을 바쁜 기계에서
   놓치지 않게 넓힐 때만 바뀐다. 순서와 비율은 그대로라 등급 단이 더 오래 서는 것도 그대로다. */
let revealPace = 1;
// 지금 카드가 선 단. 화면은 이 수 하나를 읽어 어느 층까지 보여 줄지 정한다.
let pullStage = 0;
/* 길게 누름의 예약과, 그 예약이 이미 제 일을 했는지. 전부 열리면 판을 다시 그리느라 버튼이 새 것으로
   갈리므로, 이 둘은 버튼이 아니라 모듈이 들고 있어야 누름 하나가 두 번 읽히지 않는다. */
let longTimer = 0;
let longDone = false;

// 한 장씩 연다. 예약을 하나만 들고 있으므로 다시 뽑으면 앞의 연출이 끊긴다.
function revealNext() {
  revealTimer = 0;
  if (shown >= lastPull.length) return;
  shown += 1;
  pullStage = 0;
  paintPull();
  holdStage();
}

/* 한 단이 서 있는 시간만큼 기다렸다가 다음 단으로 올린다. 마지막 단이 끝나면 그 장은 확정이고,
   남은 것이 있으면 다음 장이 온다. 예약이 하나라 건너뛰기가 이 사슬을 통째로 끊는다. */
function holdStage() {
  if (revealTimer) { clearTimeout(revealTimer); revealTimer = 0; }
  const k = lastPull[Math.max(0, shown - 1)];
  const rare = Boolean(k) && k.fame >= 9;
  revealTimer = setTimeout(() => {
    revealTimer = 0;
    if (pullStage < STAGE_LAST) {
      pullStage += 1;
      paintStage();
      holdStage();
      return;
    }
    revealNext();
  }, (STAGE_MS[pullStage] + (rare && pullStage === BEAM_STAGE ? RARE_HOLD_MS : 0)) * revealPace);
}

/* 단만 바꾼다. 판을 다시 그리면 그림이 단마다 다시 디코딩되고 카드가 놓이는 동작이 처음부터 돈다.
   층은 이미 전부 서 있고 무엇이 보이는지는 hud.css가 이 수를 읽어 정한다. */
function paintStage() {
  const now = el('pull').querySelector('.now');
  if (!now) return;
  now.dataset.stage = String(pullStage);
  // 마지막 단에 서면 버튼 글자도 같이 바뀐다. 여는 버튼이 닫기라고 적혀 있으면 그 말대로 눌러 카드를 못 본 채 닫는다.
  if (shown >= lastPull.length && pullStage === STAGE_LAST) {
    const tap = el('pull').querySelector('.tap');
    if (tap) tap.textContent = '닫기';
  }
}

// 남은 것을 한 번에 연다. 기다리는 것이 연출이지 벌은 아니다. 서 있던 장도 마지막 단까지 같이 열린다.
function revealAll() {
  if (revealTimer) { clearTimeout(revealTimer); revealTimer = 0; }
  shown = lastPull.length;
  pullStage = STAGE_LAST;
  paintPull();
}

function stopReveal() {
  if (revealTimer) { clearTimeout(revealTimer); revealTimer = 0; }
  lastPull = [];
  pullKindNow = 'town';
  shown = 0;
  pullStage = 0;
  el('pull').hidden = true;
}

/* 카드 마지막 단에 서는 능력치 다섯 줄. 키퍼와 키커는 판정이 읽는 칸이 다르므로 표도 둘이다.
   열다섯 칸을 다 세우면 카드가 아니라 명세서가 되므로, 그 사람을 고를 때 보는 칸만 올린다. */
const PULL_STATS = {
  keeper: ['diving', 'handling', 'reflex', 'judgement', 'agility'],
  kicker: ['finishing', 'power', 'composure', 'curve', 'flair']
};
// 키커 칸 이름. 키퍼 쪽은 ledger의 CAUSE_LABEL이 이미 소유하므로 여기 다시 적지 않는다.
const KICKER_LABEL = { finishing: '결정력', power: '슛파워', composure: '침착성', curve: '슛커브', flair: '개인기' };

// 카드가 든 사람의 능력치 줄. 키퍼 칸이 없으면 키커다.
function pullStatRows(k) {
  const keys = k.diving === undefined ? PULL_STATS.kicker : PULL_STATS.keeper;
  return keys.map((s) => '<span><i>' + (CAUSE_LABEL[s] || KICKER_LABEL[s]) + '</i><b>'
    + (k[s] === undefined ? 0 : k[s]) + '</b></span>').join('');
}

/* 개봉 화면. 지금 서는 한 장과 이미 나온 줄과 남은 수를 그린다.
   상점을 다시 그리지 않는다. 뒤에서 선반이 다시 서면 카드가 놓이는 도중에 화면이 한 번 튄다. */
function paintPull() {
  const box = el('pull');
  if (!lastPull.length) { box.hidden = true; return; }
  const at = Math.max(0, shown - 1);
  const k = lastPull[at];
  const rare = k.fame >= 9;
  /* 이미 나온 줄. 이름만 적힌 칩은 열한 장을 연 뒤에 누가 왔는지를 다시 읽게 하므로 얼굴을 같이 세운다.
     열어 둔 줄이 곧 회차의 요약판이다. 마지막 칸만 방금 확정된 장이라 제자리로 축소되는 동작을 한 번 받는다. */
  const done = lastPull.slice(0, at)
    .map((c, i) => '<i class="' + (c.fame >= 9 ? 'rare' : '') + (i === at - 1 ? ' just' : '')
      + '"><img alt="" src="' + thumbURL('face', c, lookOf({}, c.name)) + '"><b>' + c.name + '</b></i>').join('');
  // 마지막 장이 마지막 단까지 서면 넘길 것이 없다. 그때부터 이 화면은 닫는 화면이다.
  const over = shown >= lastPull.length && pullStage === STAGE_LAST;
  box.innerHTML = '<div class="count">' + shown + ' / ' + lastPull.length + '</div>'
    /* 카드 안에 사람이 없으면 이름을 적은 빈 판이다. 선수단과 상점이 이미 쓰는 전신 그림을
       그대로 굽는다. 걸친 것은 내 장비가 아니라 기본 차림이다. 아직 내 선수가 아니기 때문이다.
       층은 봉인부터 능력치까지 한 번에 세우고, 어느 층이 보이는지는 data-stage가 정한다. */
    + '<div class="now' + (rare ? ' rare' : '') + '" data-stage="' + pullStage + '">'
    // 봉인은 산 팩의 포장이다. 줄무늬 뒷면은 어느 팩을 열고 있는지를 말하지 않았다.
    + '<span class="seal">' + packArt(pullKindOf(pullKindNow)) + '</span>'
    // 등급 신호는 테두리 안쪽을 도는 빛이고, 서 있는 길이를 카드가 직접 들고 온다.
    + '<span class="beam" style="--beam-ms:'
    + (STAGE_MS[BEAM_STAGE] + (rare ? RARE_HOLD_MS : 0)) + 'ms"></span>'
    + '<u>' + k.fame + '</u>'
    + '<img alt="' + k.name + '" src="' + thumbURL('card', k, lookOf({}, k.name)) + '">'
    + '<div class="foot"><b>' + k.name + '</b>'
    + '<div class="stats">' + pullStatRows(k) + '</div></div></div>'
    /* 이미 나온 줄은 두 장 이상인 회차에만 세운다. 한 장짜리 회차는 쌓일 카드가 영영 안 와서 이 줄이
       빈 채로 34, 기둥 사이 12를 더해 46을 카드 아래에 잡고 섰고, 아무것도 안 그리는 자리라
       여백이 아니라 사라진 물건으로 읽혔다. 걷으면 카드 위가 146에서 169로 23만큼 내려와
       남은 수 한 줄과 카드가 한 기둥으로 가운데에 선다. 두 장 이상인 회차는 그대로 둔다.
       34는 첫 장이 설 때 자리를 미리 잡아 두 번째 칩이 앉을 때 카드가 안 뛰게 하는 자라,
       실측으로 첫 장과 두 번째 장 모두 카드 위가 146이었다. */
    + (lastPull.length === 1 ? '' : '<div class="done">' + done + '</div>')
    /* 누름을 받는 것은 판이 아니라 버튼이다. div에 핸들러를 걸면 누를 수 있다는 신호가
       화면에 안 남고 키보드로는 닿지도 않는다. 판 전체를 덮는 투명 버튼이 그 자리를 맡는다.
       글자는 둘이다. 누름 하나가 하는 일이 앞에 서고, 붙들면 남은 것이 전부 열린다는 것이 뒤에 선다.
       봉인 단이 까만 판이라 손이 먼저 두드리는데 두드림은 한 단씩이라, 뒤 마디가 없으면 급한 사람이
       다섯 번을 눌러 놓고도 붙드는 길을 못 배운다. 뒤 마디는 굵기와 짙기가 한 단 아래다. */
    + '<button class="tap">' + (over ? '닫기' : '다음<i>· 길게 누르면 전부</i>') + '</button>'
    /* 전부 열기. 길게 누름은 배워야 아는 손이라, 두 장 이상인 회차에는 같은 일을 하는 버튼이 눈에 보이게 선다.
       판 가운데를 누르는 손과 안 겹치게 왼쪽 위 귀에 둔다. */
    + (lastPull.length > 1 && !over ? '<button class="skip">전부 열기</button>' : '');
  box.hidden = false;
  // 놓이는 동작은 클래스를 다시 붙여야 다시 돈다. 같은 노드를 재사용하면 두 번째 장이 안 움직인다.
  const now = box.querySelector('.now');
  void now.offsetWidth;
  now.classList.add('turn');
  const btn = box.querySelector('.tap');
  const skip = box.querySelector('.skip');
  if (skip) skip.onclick = (e) => { e.stopPropagation(); revealAll(); };
  /* 짧은 누름은 한 단만 올린다. 올릴 단이 없으면 다음 장으로 가고, 그것도 없을 때에야 닫는다.
     누름 하나가 회차를 통째로 털어 가면 다섯 단을 세운 이유가 없어진다. 급한 사람의 손은 아래 긴 누름이다.
     예약을 먼저 걷는 것은, revealNext가 제 손잡이를 안 걷고 0으로 덮어써서 남은 예약이 뒤에 한 단을
     더 올리기 때문이다. */
  const step = () => {
    if (revealTimer) { clearTimeout(revealTimer); revealTimer = 0; }
    if (pullStage < STAGE_LAST) { pullStage += 1; paintStage(); holdStage(); return; }
    if (shown < lastPull.length) return revealNext();
    stopReveal();
    // 첫 진입은 두 마디다. 키퍼를 닫으면 그 자리에서 키커가 이어 열린다.
    onboardStep();
  };
  /* 붙들고 있는 동안 문턱을 넘으면 그 자리에서 전부 열린다. 떼는 것을 기다렸다가 길이를 재면 긴 누름이
     짧은 누름과 같은 순간에 일어나서, 사람은 자기가 무엇을 하고 있는지 손을 떼기 전에는 못 본다.
     손가락을 이 버튼에 묶는 것은, 안 묶으면 누른 채로 창 밖으로 나간 손의 예약이 살아남아 0.45초 뒤에
     화면이 혼자 열리기 때문이다. 끌려 나간 손가락은 pointercancel이 그 예약을 걷는다. */
  btn.onpointerdown = (e) => {
    if (longTimer) clearTimeout(longTimer);
    longDone = false;
    if (btn.setPointerCapture) btn.setPointerCapture(e.pointerId);
    longTimer = setTimeout(() => { longTimer = 0; longDone = true; revealAll(); }, LONG_MS);
  };
  const drop = () => { if (longTimer) { clearTimeout(longTimer); longTimer = 0; } };
  btn.onpointerup = drop;
  btn.onpointercancel = () => { drop(); longDone = false; };
  /* 손가락이 만든 click은 손이 올라오고 나서 한 번 더 오므로, 이미 제 일을 한 긴 누름의 것은 여기서 삼킨다.
     키보드는 포인터를 안 쓴다. Enter와 Space는 click으로만 오고 그 click은 detail이 0이라
     손가락이 만든 것과 갈리고, 삼킬 것이 남아 있어도 키보드 누름은 안 먹힌다. */
  btn.onclick = (e) => {
    if (e.detail > 0 && longDone) { longDone = false; return; }
    longDone = false;
    step();
  };
}

/* 첫 진입. 가입 직후 아무것도 안 뽑고 시작하면 첫 키퍼와 필드 열 명이 조용히 배정된다.
   플레이어는 자기가 무엇을 들고 시작하는지를 본 적이 없고, 이 장르가 파는 첫 순간을 건너뛴다.
   그래서 직접 눌러 연다. 0은 키퍼 한 장, 1은 키커 열 장(보너스로 열한 장), 2는 끝난 상태다.
   키퍼 한 장은 결과가 동네형으로 못 박혀 있다. 첫 판이 무작위로 갈리면 처음 오는 사람마다
   다른 게임을 하게 되고, 튜토리얼이 설 자리가 사라진다. 뒤집는 손맛은 그대로 남는다. */
function onboardStep() {
  if (state.onboard >= ONBOARD_DONE) return false;
  if (state.onboard === ONBOARD_KEEPER) {
    // 첫 키퍼. 명단의 가장 싼 이름이고 그 사람이 이 게임의 출발점이다.
    const first = KEEPERS.slice().sort((a, b) => keeperCost(a) - keeperCost(b))[0];
    stopReveal();
    lastPull = [first];
    state.onboard = ONBOARD_KICKERS;
    /* 명단에서 온 사람으로 갈아 세운다. 처음 세워지는 무명 키퍼를 그대로 두면 방금 뽑은 카드가
       판에 안 서고, 뽑기가 결과를 안 바꾸는 연출이 된다. */
    state.squad[0] = recruit(first);
    state.pick = 0;
    state.keeper = state.squad[0];
    /* 갈아 세운 사람은 맨몸 신인이라 앞서 주입한 표본이 통째로 지워진다. 실측으로 maxed가
       개봉을 지나며 사라져 계기가 만렙 대신 신인을 쟀고, 스물여섯 초에 닿는 구가 여덟 중
       하나뿐이었다. 주입은 절대값이라 다시 얹어도 같은 자리이고, 순서상 개봉이 먼저 일어난
       일이므로 그 위에 얹는 것이 사람이 겪는 순서와도 같다. 갈아 세우는 자리가 여기 하나라
       여기서 얹어야 개봉을 눌러 넘긴 경로와 건너뛴 경로가 같은 상태로 끝난다. */
    applyPreset(new URLSearchParams(location.search).get('preset'), state);
    stage.setKeeper(state.keeper, lookOf(state.gear, state.keeper.name));
    persist();
    pips();
    revealNext();
    return true;
  }
  // 키커 열 장. 묶음 보너스가 붙어 열한 장이고, 나온 사람이 그대로 주전을 채운다.
  const pool = KICKERS.filter((k) => state.kickers.indexOf(k.name) < 0);
  const left = pool.slice();
  const drawn = [];
  for (let i = 0; i < pullYield(PULL_BULK); i += 1) {
    const pick = pullFrom(left, roll);
    if (!pick) break;
    left.splice(left.indexOf(pick), 1);
    drawn.push(pick);
  }
  if (!drawn.length) { state.onboard = ONBOARD_DONE; return false; }
  for (const k of drawn) state.kickers.push(k.name);
  /* 뽑은 사람으로 주전을 다시 세운다. 정원 안에서 뽑힌 사람을 먼저 넣고 모자란 자리는
     시작 필드 열 명이 채운다. 뽑았는데 아무도 안 뛰면 그 열한 장이 무엇을 산 것인지 화면에 없다. */
  const filled = [];
  for (const role of ROLES) {
    const want = ROLE_SLOTS[role];
    const mine = drawn.filter((k) => k.role === role).map((k) => k.name);
    const rest = defaultEleven().filter((n) => { const e = kickerByName(n); return e && e.role === role; });
    for (const n of mine.concat(rest)) {
      if (filled.filter((x) => kickerByName(x).role === role).length >= want) break;
      if (filled.indexOf(n) < 0) filled.push(n);
    }
  }
  state.eleven = filled;
  state.onboard = ONBOARD_DONE;
  stopReveal();
  lastPull = drawn.slice();
  persist();
  revealNext();
  return true;
}

// 시안 packs.mjs의 SVG와 플랫폼 그라디언트를 재사용한다. 외부 라이브러리 없이 포장만 이식한다.
// 뽑은 목록을 받아 연출을 연다. 앞의 연출은 끊고, 저장과 선반 다시 그리기를 끼운 뒤 첫 장을 바로 세운다.
function start(drawn, kindId, redraw) {
  stopReveal();
  lastPull = drawn.slice();
  pullKindNow = kindId;
  if (redraw) redraw();
  revealNext();
}

function setRevealPace(k) {
  revealPace = Number(k) > 0 ? Number(k) : 1;
}


// 개봉 연출의 지금 자리. 키보드와 계기가 읽는다. 값을 바꾸는 쪽은 이 창뿐이다.

function revealState() {
  return { shown, drawn: lastPull.length, stage: pullStage, long: LONG_MS, done: shown >= lastPull.length && pullStage === STAGE_LAST };
}


  return { start, stopReveal, revealAll, onboardStep, revealState, setRevealPace };
}
