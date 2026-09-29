import { lookOf, skinsAt, isWorn } from '../state/gear.mjs';
import { pullWeight, pullKindOf, KEEPERS, KICKERS, pullYield, PULL_BULK, pullFrom, PULL_KINDS, poolFor, pullCostOf, pullBill, PULL_BONUS } from '../../../src/roster.mjs';
import { SHELVES, AXIS_UNIT, AXIS_WORD } from '../state/shelf.mjs';
import { GEAR_STEP } from '../../../src/chain.mjs';
import { botAt, BOTS, BOT_CAP } from '../state/bot.mjs';
import { buffAt, TONIC_FOCUS, HYPE_BOOST, BUFFS, BUFF_CAP, addBuff } from '../state/buff.mjs';
import { IC_TIME, IC_TICKET, TAB_ICON } from './icons.mjs';
import { thumbURL, stopSpin, startSpin } from '../render/thumb.mjs';
import { createUtilShelf } from './util-shelf.mjs';
import { createPullReveal, LONG_MS } from './pull-reveal.mjs';

/* 상점 창. 선반 열셋, 시착실, 뽑기 배너와 확률 표, 개봉 연출과 첫 진입 개봉. */
export function createShopPanel({ state, el, affordable, PRICE, purchase, persist, pips, stage, recruit, roll, shutOthers }) {
// 탭 차례. 뽑는 칸이 먼저 서고, 몸에 걸치는 여섯, 꾸미는 둘, 소모형 둘, 계정의 일을 사는 유틸이 뒤를 잇는다.
const SHOP_TABS = ['pull', 'glove', 'boot', 'kit', 'sock', 'frame', 'city', 'hair', 'beard', 'ink', 'bot', 'buff', 'util'];

// 상점. 선반은 이적시장과 장비 둘이다. 지목 구매는 값을 알고 이름을 사는 축이고
// 이적시장은 값을 알고 이름을 모르는 축이라 두 축이 겹치지 않는다.
// 장비는 이름도 값도 아는 대신 스탯 위에 얇게만 얹는 축이다.
// 결과 한 줄은 state에 넣지 않는다. 저장에 남을 값이 아니라 이 패널이 열려 있는 동안만 쓰는 글자다.

// 지금 보고 있는 선반. lastPull과 같이 패널 수명만 사는 값이라 저장에 싣지 않는다.
// 개봉 연출. 뽑은 카드와 단과 첫 진입 개봉을 따로 든다. 상점은 뽑은 목록을 넘기고 닫힐 때 끊기만 한다.
const reveal = createPullReveal({ state, el, persist, pips, stage, recruit, roll, packArt });

// 지금 보고 있는 선반. 패널 수명만 사는 값이라 저장에 싣지 않는다.
let shopTab = 'pull';
// 시착용 장부. 아직 안 산 채로 걸쳐 본 등급이 칸마다 하나씩 들어간다.
// 저장하지 않는다. 상점을 닫으면 벗는 것이 옷가게의 문법이고, 저장하면 안 산 옷을 입은 채로 판이 돈다.
let fitting = {};

// 지금 몸에 걸친 것과 걸쳐 본 것을 합친 모습. 탈의실 그림과 시착용 판정이 같은 값을 본다.
function fittedLook() {
  return lookOf(Object.assign({}, state.gear, fitting), state.keeper.name);
}

/* 확률은 명단이 아니라 지금 남은 풀에서 다시 센다. 뽑을수록 남은 풀이 바뀌므로
   고정 문구를 걸면 뒤로 갈수록 화면이 거짓말을 한다.
   등급은 셋으로 가르고 서로 안 겹치게 둔다. 겹치면 남은 수를 세로로 더했을 때 풀보다 커져,
   표를 읽는 사람이 같은 카드를 두 번 센다. */
const ODDS_BANDS = [
  { name: '명성 10', at: (f) => f >= 10 },
  { name: '명성 9', at: (f) => f === 9 },
  { name: '명성 8 이하', at: (f) => f <= 8 }
];

// 등급 한 줄에 확률과 남은 수. 세 칸이 한 줄에 서므로 문장으로 잇지 않는다.
function shopOdds(pool) {
  let total = 0;
  for (const k of pool) total += pullWeight(k);
  if (!total) return '';
  const rows = ODDS_BANDS.map((band) => {
    const list = pool.filter((k) => band.at(Number(k.fame) || 0));
    let w = 0;
    for (const k of list) w += pullWeight(k);
    return '<span><i>' + band.name + '</i><b>' + (w / total * 100).toFixed(1)
      + '%</b><u>' + list.length + '</u></span>';
  }).join('');
  return '<span class="head"><i>등급</i><b>확률</b><u>남은 수</u></span>' + rows;
}



/* 카드 하나가 파는 것을 문장으로 만든다. 수는 판정과 선반 데이터에서 꺼내고 문구만 여기서 짓는다.
   카드 본문에 다 적으면 격자가 다시 글자 벽이 되므로, 이 문장들은 왼쪽 기둥의 별도 칸이 받는다. */




/* 효과 한 줄을 항목과 값으로 가른다. 표는 칸이 둘이라 표이고, 이어 붙인 한 줄은 문장이다.
   가르는 자리를 여기 하나로 두어야 선반 카드가 쓰는 한 줄과 효과 표가 같은 수를 말한다. */
function specRows(kind, rank) {
  const n = Number(rank);
  const s = SHELVES[kind];
  if (s) {
    const steps = GEAR_STEP[s.field];
    // 외형 선반은 판정에 안 들어간다. 대신 소문에 붙는 승수가 있고, 그것도 값이다.
    if (!steps) {
      const gain = Math.round(0.05 * n * 100);
      return n > 0 ? [{ k: '소문 확산', v: '+' + gain + '%' }, { k: '외형 효과', v: '' }] : [{ k: '효과 없음', v: '' }];
    }
    if (n === 0) return [{ k: '효과 없음', v: '' }];
    return steps.map((st) => {
      const v = Math.round(st.per * n * 10) / 10;
      const u = AXIS_UNIT[st.axis] || '';
      return { k: AXIS_WORD[st.axis], v: (st.up ? '+' : '-') + v + u };
    });
  }
  if (kind === 'bot') {
    const b = botAt(rank);
    if (!b) return [];
    // 팔로워가 안 붙는다는 사실은 선반 머리글이 이미 말한다. 여기는 성능과 기간만 말한다.
    return [{ k: '판단력', v: String(b.judge) }];
  }
  if (kind === 'buff') {
    const b = buffAt(rank);
    if (!b) return [];
    // 카드 본문이 이미 든 문장을 여기서 되풀이하면 이 칸이 새 정보를 안 준다. 수로 말한다.
    const dose = { k: '지속', v: b.shots + '회' };
    if (b.kind === 'tonic') {
      const cut = Math.round((1 - TONIC_FOCUS) * 100);
      return [{ k: '한눈팔기', v: '-' + cut + '%' }, { k: '수다', v: '-' + cut + '%' }, dose];
    }
    if (b.kind === 'hype') return [{ k: '소문 확산', v: '+' + Math.round((HYPE_BOOST - 1) * 100) + '%' }, dose];
    // 송진은 장갑 한 등급을 더 얹는 물건이라, 장갑 선반이 파는 그 두 축을 그대로 쓴다.
    return GEAR_STEP.grip.map((st) => ({ k: AXIS_WORD[st.axis], v: '-' + st.per + (AXIS_UNIT[st.axis] || '') })).concat([dose]);
  }
  return [];
}

// 카드 한 줄이 쓰는 형태. 항목과 값을 한 칸에 이어 붙인다.
function specLines(kind, rank) {
  return specRows(kind, rank).map((r) => (r.v ? r.k + ' ' + r.v : r.k));
}

/* 장비 카드의 효과는 한 효과에 한 줄이다. 한 문장으로 이어 흘리면 둘째 효과가 첫 줄 끝에서 낱말 가운데로
   접혀 '손에서 흘리는 사...'처럼 이름이 말줄임에 먹혔다(1280x720 문어 빨판 장갑). 줄을 효과로 가르면
   효과 이름과 수가 늘 같은 줄에 서고, 줄바꿈이 쉼표를 대신한다. 폭이 모자라면 줄어드는 것은 이름이고 수는 늘 다 보인다.
   파는 것이 그 수라서다(실측: 1280x720 축구화 효과 238px이 205px 칸에서 수째로 잘렸다). */
/* 봇과 버프의 기간·횟수는 마지막 효과 줄 끝에 붙는다. 한 문장으로 이어 흘릴 때는 740x360 자양강장제의
   둘째 효과가 수째로 말줄임에 먹혔다('한눈팔기 -50%, 수다...'). */
function cardLines(kind, rank, tail) {
  const rows = specRows(kind, rank).filter((r) => r.v && !/[분회]$/.test(r.v));
  const end = tail ? '<small class="duration">' + IC_TIME + tail + '</small>' : '';
  if (!rows.length) return end;
  return rows.map((r, i) => '<span class="ln"><span class="k">' + r.k + '</span> <i class="v">' + r.v + '</i>'
    + (i === rows.length - 1 ? end : '') + '</span>').join('');
}

/* 카드 테두리가 말하는 등급. 선반이 스스로 매긴 순번을 그대로 쓴다. 장비는 0에서 3, 봇은 1에서 3이다.
   버프 셋은 값이 220에서 300까지 한 칸 안이라 매길 순번이 없어 같은 등급으로 선다. */
const BUFF_RARE = 1;

/* 왼쪽 기둥의 효과 칸. 카드에 손을 올린 것만 여기에 뜬다.
   표로 세운다. 항목과 값이 한 줄에 이어 붙으면 어디까지가 이름이고 어디부터가 수인지를
   줄마다 다시 갈라야 하고, 카드 넷을 훑는 동안 그 가르기를 네 번 한다. */
function showSpec(name, kind, rank) {
  const box = el('shop') && el('shop').querySelector('.spec');
  if (!box) return;
  const rows = specRows(kind, rank);
  box.innerHTML = '<b>' + name + '</b>'
    + rows.map((r) => '<i><em>' + r.v + '</em><span>' + r.k + '</span></i>').join('');
  box.dataset.at = kind + String(rank);
}

function clearSpec() {
  const box = el('shop') && el('shop').querySelector('.spec');
  if (!box) return;
  box.innerHTML = '';
  box.dataset.at = '';
}



// 탈의실. 지금 내 모습과 걸쳐 본 것을 한 자리에서 보여 준다.
// 값을 치르기 전에 자기 몸에서 확인할 수 있어야 꾸미는 재미가 산다.
// 초상과 온몸을 같이 세운다. 온몸 칸에서 머리는 그림 높이의 15%라, 방금 바꾼 머리와 문신이
// 그 크기에서는 색 한 점으로 뭉친다. 얼굴 한 장이 그 질문만 따로 받는다.
function fittingRoom() {
  const look = fittedLook();
  const url = thumbURL('body', state.keeper, look);
  const face = thumbURL('face', state.keeper, look);
  // 변형은 값이 없는 칸이라 청구서와 걸친 목록에서 빠진다. 값 0짜리 줄이 서면
  // 전부 사기 버튼이 0원을 부르며 켜지고, 벗기 목록에 이름 없는 줄이 하나 생긴다.
  const tried = Object.keys(fitting).filter((f) => shelfOfField(f));
  const bill = tried.reduce((n, f) => n + costOfField(f, fitting[f]), 0);
  /* 걸친 것은 칩으로 눕는다. 칩마다 벗는 자리를 달고 있어, 무엇을 걸쳤는지 아는 자리와
     그것을 무르는 자리가 안 갈린다. 세로로 쌓으면 여덟 칸을 걸쳤을 때 기둥이 여덟 줄 길어지고
     그만큼 아래 효과 표가 잘린다. */
  const chips = tried.map((f) => '<i data-off="' + f + '">' + nameOfField(f, fitting[f]) + '<b>X</b></i>').join('');
  // 합계에서 한 번 올림한다. 개별 캐시 값을 더하면 묶음과 단품의 환산 정책이 갈린다.
  const canAll = tried.length > 0 && affordable(bill);
  /* 합계 배지는 사는 버튼이 든다. 시착 게이트가 청구서를 이 버튼 안의 .px[data-coin]에서 읽으므로
     배지를 버튼 밖으로 빼면 값을 재는 자가 눈을 잃는다. 모자라도 합계는 같은 수다. */
  const badge = tried.length ? PRICE(bill) : '';
  const allClass = tried.length > 0 && bill > state.wallet.coin ? ' bad-price' : '';
  return '<div class="fitting">'
    + '<div class="who"><span class="face">' + (face ? '<img alt="" src="' + face + '">' : '') + '</span>'
    + '<b>' + state.keeper.name + '</b></div>'
    + '<div class="me">' + (url ? '<img alt="" src="' + url + '">' : '') + '</div>'
    + '<div class="tried">' + chips + '</div>'
    + '<div class="acts">'
    + '<button class="all' + allClass + '"' + (canAll ? '' : ' disabled') + '>구매' + badge + '</button>'
    + '<button class="strip"' + (tried.length ? '' : ' disabled') + '>벗기</button>'
    + '</div>'
    // 효과 칸. 카드 본문은 이름과 한 줄만 들고, 수치는 손을 올린 카드의 것만 여기 뜬다.
    + '<div class="spec"></div>'
    + '</div>';
}

// 값과 이름은 선반 데이터가 소유한다. 탈의실이 따로 적으면 선반이 바뀐 날 두 곳이 갈린다.
function shelfOfField(field) {
  for (const k of Object.keys(SHELVES)) if (SHELVES[k].field === field) return SHELVES[k];
  return null;
}

function costOfField(field, rank) {
  const s = shelfOfField(field);
  return s ? s.at(rank).cost : 0;
}

function nameOfField(field, rank) {
  const s = shelfOfField(field);
  return s ? s.at(rank).name : '';
}

function gearShelf(kind) {
  const s = SHELVES[kind];
  const have = state.gear[s.field];
  const rows = s.list.map((g) => {
    const rank = g[s.field];
    let label = PRICE(g.cost);
    let off = false;
    let bad = false;
    if (rank === have) {
      label = s.worn;
      off = true;
    } else if (rank < have) {
      label = s.past;
      off = true;
    } else if (state.wallet.coin < g.cost) {
      // 못 사는 것은 붉은 값과 비활성 버튼이 말한다. 모자란 액수를 적으면 같은 물건이 지갑마다 다른 수로 읽힌다.
      label = PRICE(g.cost);
      off = !affordable(g.cost);
      bad = true;
    }
    // 썸네일 자리는 마크업에서 비워 두고 그림은 bindGear가 굽는다. 굽는 데 렌더러가 필요해서
    // 문자열을 만드는 자리에서는 그릴 수 없다. 자리가 없으면 카드 높이가 그림을 받고 나서 뛴다.
    // 변형 조각. 등급 하나가 여러 모양을 들고 있으면 그 조각들을 값 버튼 위에 깐다.
    // 색 견본이 아니라 지금 고른 것이 무엇인지를 알려야 하므로 켜진 조각에 표시를 남긴다.
    let skins = '';
    const list = skinsAt(s.field, rank);
    if (list.length > 1) {
      const key = s.field + 'Skin';
      const pickedRank = fitting[s.field] !== undefined ? fitting[s.field] : state.gear[s.field];
      const picked = fitting[key] !== undefined ? fitting[key] : state.gear[key];
      skins = '<div class="skins">' + list.map((v, i) =>
        '<button class="skin' + (rank === pickedRank && i === picked ? ' on' : '') + '" data-field="' + s.field
        + '" data-rank="' + rank + '" data-skin="' + i + '" title="' + v.name
        + '" style="--sw:#' + v.tone.toString(16).padStart(6, '0') + '"></button>').join('') + '</div>';
    }
    /* 그림이 먼저 서고 이름과 효과 한 줄이 따라오며 값 배지가 오른쪽 아래를 받는다.
       변형 조각은 썸네일 위에 겹쳐 눕는다. 값 버튼 위에 한 줄로 깔면 그 줄만큼 카드가 길어지고,
       그림이 카드에서 차지하는 몫이 그만큼 줄어 다시 글자가 먼저 읽힌다. */
    return '<div class="card gear" data-spec="' + kind + '" data-at="' + rank + '" data-rare="' + rank + '">'
      + '<div class="pic"><div class="shot" data-kind="' + kind + '" data-rank="' + rank + '"></div>' + skins + '</div>'
      + '<b>' + g.name + '</b><em>' + cardLines(kind, rank) + '</em>'
      + '<div class="foot"><button class="buy' + (bad ? ' bad-price' : '') + '" data-kind="' + kind + '" data-rank="' + rank + '"' + (off ? ' disabled' : '') + '>' + label + '</button></div></div>';
  });
  return '<div class="rack">' + rows.join('') + '</div>';
}


/* 카드에 손을 올리면 효과 칸이 그 카드 것을 받는다. 손을 떼면 안내로 돌아간다.
   터치 기기에는 호버가 없어 pointerdown도 같이 받는다. 그 눌림은 시착용과 구매가 따로 처리한다. */
function bindSpec(box) {
  for (const c of box.querySelectorAll('.card[data-spec]')) {
    const kind = c.dataset.spec;
    const at = c.dataset.at;
    const title = c.querySelector('b');
    const name = title ? title.textContent : '';
    const on = () => showSpec(name, kind, at);
    c.addEventListener('pointerenter', on);
    c.addEventListener('pointerdown', on);
    c.addEventListener('pointerleave', clearSpec);
  }
}

/* 터치의 긴 누름. 손가락은 카드 위에 머물 수 없어서 호버가 없고, 터치의 pointerenter는 누르는
   순간에 한 번 오고 마는 것이라 회전을 여는 자리로 못 쓴다. 그 눌림은 시착용이 이미 쓰고 있어서,
   눌린 채로 흐른 시간으로 둘을 가른다. 짧은 누름은 그대로 걸쳐 보고, 문턱을 넘겨 붙들고 있으면
   그 카드가 돈다. 문턱은 뽑기 화면과 같은 LONG_MS다. 한 화면에서 긴 누름인 시간이 다른 화면에서
   아니면 손이 화면마다 다른 규칙을 외워야 한다.
   예약과 삼킬 표시를 뽑기 화면의 것과 같이 쓰지는 않는다. 그쪽은 판을 다시 그려 버튼이 새 것으로
   갈리는 것을 버티려고 모듈에 서 있고, 손을 떼는 순간 회전을 멈출 일도 손가락만 받을 일도 없다.
   한 자리에 담으면 한쪽의 규칙이 다른 쪽으로 새어 나간다. 도는 칸이 하나뿐이라 여기도 모듈이 든다. */
let holdTimer = 0;
// 삼킬 표시는 참이 아니라 붙들린 카드를 든다. 참이면 어느 카드의 click이 그것을 걷는지가 안 적혀
// 있어서, 걸쳐 볼 것이 없어 click을 안 듣는 카드를 붙들면 표시가 눌림 뒤에 그대로 남는다.
let holdSpun = null;
function holdDrop() {
  if (holdTimer) clearTimeout(holdTimer);
  holdTimer = 0;
}
/* 카드에 긴 누름을 건다. 손가락만 받아서 마우스의 호버는 그대로 두고, 값 버튼에서 시작한 누름은
   그 버튼 것이라 안 받는다. 효과 칸을 채우는 눌림은 bindSpec이 따로 듣고 있어서 여기서 안 덮인다.
   누름마다 앞의 예약과 표시를 먼저 걷는다. 안 걷으면 회전만 열고 카드 밖으로 나간 손의 표시가
   남아서, 그 카드를 다시 누를 때 걸쳐 보기가 대신 삼켜진다. */
function bindHold(card, run) {
  card.addEventListener('pointerdown', (e) => {
    holdDrop();
    holdSpun = null;
    if (e.pointerType !== 'touch' || e.target.closest('.buy')) return;
    holdTimer = setTimeout(() => { holdTimer = 0; holdSpun = card; run(); }, LONG_MS);
  });
  card.addEventListener('pointerup', (e) => {
    holdDrop();
    if (e.pointerType === 'touch') stopSpin();
  });
  card.addEventListener('pointercancel', (e) => {
    holdDrop();
    holdSpun = null;
    if (e.pointerType === 'touch') stopSpin();
  });
  /* 긴 누름이 회전을 연 손의 click은 붙들린 그 카드가 삼킨다. 안 삼키면 돌려 보려고 붙든 손이
     떼는 순간 걸쳐 보기로 넘어가서, 터치에는 회전만 보는 길이 다시 없어진다. 걸쳐 볼 것이 있는
     카드의 onclick에서만 걷으면 봇 선반이나 이미 가진 등급처럼 click을 안 듣는 카드가 표시를
     남기고, 뒤에 오는 click 하나가 엉뚱한 카드에서 대신 삼켜진다. 내려가는 길에서 잡는 것은
     변형 조각이 자기 click을 세워 막아서 올라오는 길에는 그 눌림이 카드까지 안 오기 때문이다. */
  card.addEventListener('click', (e) => {
    if (holdSpun !== card) return;
    holdSpun = null;
    e.stopImmediatePropagation();
    e.preventDefault();
  }, true);
}

function bindGear(box) {
  // 파는 물건을 그려서 건다. 등급마다 몸에 걸친 상태를 따로 만들어 굽기 때문에
  // 등급이 색을 안 바꾸면 네 장이 같은 그림이 되고, 그 사실이 화면에서 바로 드러난다.
  for (const shot of box.querySelectorAll('.shot[data-kind]')) {
    const s = SHELVES[shot.dataset.kind];
    if (!s) continue;
    const g = s.at(shot.dataset.rank);
    // 수염의 면도 카드가 다른 등급에 착용한 변형을 물려받으면 면도에도 수염이 보인다.
    const variant = fitting[s.field] === g[s.field] ? fitting[s.field + 'Skin']
      : state.gear[s.field] === g[s.field] ? state.gear[s.field + 'Skin'] : 0;
    const look = lookOf(Object.assign({}, state.gear, { [s.field]: g[s.field], [s.field + 'Skin']: variant }), state.keeper.name);
    // 골대와 동네는 몸이 아니라 장면이라 외형 묶음이 아니라 등급 자체를 받는다.
    // 장면 칸은 외형 묶음이 아니라 등급과 변형 둘을 받는다. 걸쳐 본 변형이 있으면 그것으로 굽는다.
    const pickSkin = fitting[s.field + 'Skin'] !== undefined ? fitting[s.field + 'Skin'] : state.gear[s.field + 'Skin'];
    const arg = (s.field === 'frame' || s.field === 'city')
      ? { rank: g[s.field], skin: fitting[s.field] === g[s.field] ? pickSkin : 0 }
      : look;
    const url = thumbURL(s.field, state.keeper, arg);
    if (!url) continue;
    shot.innerHTML = '<img alt="" src="' + url + '">';
    // 썸네일은 이제 변형 조각과 한 상자에 산다. 부모를 그대로 쓰면 카드가 아니라 그 상자에 손이 걸린다.
    const card = shot.closest('.card');
    // 마우스는 호버로 돈다. 터치의 pointerenter는 누름 한 번이라 여기서 걸러 내고 긴 누름이 받는다.
    card.onpointerenter = (e) => { if (e.pointerType === 'touch') return; startSpin(shot, s.field, state.keeper, arg); };
    card.onpointerleave = () => { holdDrop(); stopSpin(); };
    bindHold(card, () => startSpin(shot, s.field, state.keeper, arg));
    // 카드를 누르면 산 것이 아니라 걸쳐 본다. 값은 buy 버튼이 따로 받는다.
    // 이미 가진 등급이나 지나간 등급은 걸쳐 볼 것이 없다.
    const rank = g[s.field];
    if (rank > state.gear[s.field]) {
      card.onclick = (e) => {
        if (e.target.closest('.buy')) return;
        if (fitting[s.field] === rank) delete fitting[s.field];
        else fitting[s.field] = rank;
        stopSpin();
        renderShop();
      };
    }
    if (fitting[s.field] === rank) card.classList.add('fit');
  }
  // 변형 조각. 이미 가진 등급이면 눌러서 바로 바꾸고 값이 안 든다.
  // 아직 안 산 등급이면 그 등급을 걸쳐 보면서 그 변형으로 미리 본다.
  for (const sw of box.querySelectorAll('.skin[data-field]')) {
    sw.onclick = (e) => {
      e.stopPropagation();
      const field = sw.dataset.field;
      const rank = Number(sw.dataset.rank);
      const at = Number(sw.dataset.skin);
      if (rank <= state.gear[field]) {
        state.gear[field] = rank;
        state.gear[field + 'Skin'] = at;
        // 자리 칸은 몸이 아니라 장면이라 키퍼를 다시 세우는 것으로는 안 바뀐다.
        if (field === 'city') stage.setCity(state.gear.city, state.gear.citySkin);
        else if (field === 'frame') stage.setGoal(state.gear.frame, state.gear.frameSkin);
        else stage.setKeeper(state.keeper, lookOf(state.gear, state.keeper.name));
        persist();
      } else {
        fitting[field] = rank;
        fitting[field + 'Skin'] = at;
      }
      stopSpin();
      renderShop();
    };
  }
  for (const b of box.querySelectorAll('.buy[data-rank]')) {
    b.onclick = () => {
      if (b.disabled) return;
      const s = SHELVES[b.dataset.kind];
      const g = s.at(b.dataset.rank);
      if (!purchase(g.cost)) return;
      state.gear[s.field] = g[s.field];
      // 걸쳐 보던 변형이 있으면 그 변형으로 산다. 안 옮기면 미리 본 것과 산 것이 다르다.
      if (fitting[s.field + 'Skin'] !== undefined) {
        state.gear[s.field + 'Skin'] = fitting[s.field + 'Skin'];
        delete fitting[s.field + 'Skin'];
      }
      // 동네를 사면 상점을 닫기 전에 배경이 바뀐다. 재시작을 요구하면 산 것이 안 읽힌다.
      if (s.field === 'city') stage.setCity(state.gear.city, state.gear.citySkin);
      if (s.field === 'frame') stage.setGoal(state.gear.frame, state.gear.frameSkin);
      // 머리와 타투는 사면 그 자리에서 키퍼 껍데기 색이 바뀐다. 안 보이면 산 것이 아니다.
      // 머리와 잉크만 몸을 다시 세우고 있었다. 장갑과 축구화와 유니폼과 양말도
      // 이제 색을 가지므로 같이 다시 세운다. 골대와 동네는 몸이 아니라 빠진다.
      if (isWorn(s.field)) stage.setKeeper(state.keeper, lookOf(state.gear, state.keeper.name));
      // 산 것은 걸쳐 본 목록에서 빠진다. 안 빼면 이미 내 것이 장바구니에 남아 값이 두 번 잡힌다.
      if (fitting[s.field] !== undefined && fitting[s.field] <= state.gear[s.field]) delete fitting[s.field];
      persist();
      pips();
      renderShop();
    };
  }
}


/* 카드 한 장이 다섯 단을 지난다. 봉인, 등급 신호, 실루엣, 이름과 초상, 능력치 다섯 줄이고
   마지막 단이 끝나면 그 장은 아래 줄로 축소되며 확정된다. 한 프레임에 다 털어놓으면 뽑는 순간이
   결과 통보가 되는데, 이 장르에서 그 순간은 파는 물건 자체다. 급하면 눌러서 건너뛴다.
   봉인이 0.3초인 것은 카드가 놓이는 0.16초가 끝난 뒤에도 뒷면이 한 박자 서 있어야 덮인 것으로
   읽히기 때문이고, 실루엣이 0.34초로 가장 긴 것은 누구인지 묻는 자리이기 때문이다.
   합이 한 장에 쓰는 시간이라 보통 1.6초이고 열한 장이면 18초다. */

const titleOf = kind => kind.id === 'legend' ? '전설 선수 팩' : '동네 선수 팩';
let pullRole = 'keeper';
// 180×240은 봉투의 기준 좌표다. 나머지 좌표는 봉인 16, 중심 90, 문장 66폭과 대칭 주름을 정의한다.
// 브라우저 SVG 그라디언트·패턴을 사용하며 외부 그림이나 GPL 구현은 포함하지 않는다.
function packArt(kind) {
  const gold = kind.id === 'legend';
  const id = kind.id;
  const light = gold ? '#fff0aa' : '#bdf5de';
  const mid = gold ? '#bd8c30' : '#328975';
  const dark = gold ? '#423019' : '#153e36';
  const emblem = gold
    ? '<path d="M59 102 68 123 112 123 121 102 103 110 90 89 77 110Z" fill="url(#metal-legend)"/><path d="M68 130H112" stroke="#fff0aa" stroke-width="4"/>'
    : '<path d="M62 92H118V122Q112 144 90 151Q68 144 62 122Z" fill="url(#metal-town)"/><path d="M76 113 85 105 99 108 104 121 93 132 80 126Z" fill="#153e36"/>';
  return `<svg class="wrapper" viewBox="0 0 180 240" role="img" aria-label="${titleOf(kind)} 포일 포장">
    <defs><linearGradient id="metal-${id}" x2="1" y2=".4"><stop stop-color="${dark}"/><stop offset=".22" stop-color="${mid}"/><stop offset=".48" stop-color="${light}"/><stop offset=".56" stop-color="${mid}"/><stop offset=".9" stop-color="${dark}"/><stop offset="1" stop-color="${light}"/></linearGradient><pattern id="crimp-${id}" width="5" height="5" patternUnits="userSpaceOnUse"><path d="M1 0V5" stroke="${dark}" opacity=".6"/></pattern><pattern id="grain-${id}" width="9" height="9" patternUnits="userSpaceOnUse"><path d="M0 9 9 0" stroke="${light}" opacity=".08"/></pattern></defs>
    <path d="M7 1H173L179 9 175 231 169 239H11L5 231 1 9Z" fill="url(#metal-${id})" stroke="${light}"/>
    <path d="M8 18 172 18 169 222H11Z" fill="${dark}" opacity=".88"/>
    <path d="M8 18 172 18 169 222H11Z" fill="url(#grain-${id})"/>
    <path d="M8 18 42 72 18 180 10 220M172 18 144 89 165 197 170 222" fill="none" stroke="${light}" opacity=".3"/>
    <path d="M14 18 26 222M162 18 151 222" stroke="${light}" opacity=".12"/>
    <path d="M5 2H175V17H5ZM9 223H172V238H9Z" fill="url(#crimp-${id})"/>
    <path d="M23 59H157M23 181H157" stroke="${mid}"/>
    <text x="90" y="45" text-anchor="middle" fill="${light}" font-family="Black Han Sans" font-size="15">${gold?'전설':'동네'} 선수</text>
    <path d="M90 70 136 96 136 144 90 171 44 144 44 96Z" fill="none" stroke="${mid}"/>${emblem}
    <text x="90" y="204" text-anchor="middle" fill="${light}" font-family="Pretendard GTG" font-size="12">${gold?'명성 높은 선수들':'새로운 경기의 시작'}</text>
  </svg>`;
}


// 포장 뒤에 부채꼴로 서는 세 장. 그 팩에서 나올 수 있는 선수 중 명성이 높은 셋이다.
// 셋은 부채꼴이 양옆과 가운데를 채우는 최소 수이고, 넷부터는 포장이 가운데 장을 가린다.
const FAN = 3;
// 바닥이 없는 팩은 전설 바닥 아래에서만 고른다. 전설 얼굴을 걸면 이 팩에서 전설이 나온다고 약속하는 그림이 된다.
// 그 아래가 바닥나면 부채꼴은 줄거나 빈다. 남은 전설로 채우면 같은 약속을 거꾸로 한다.
function featured(pool, kind) {
  const top = PULL_KINDS.reduce((m, k) => Math.max(m, k.floor), 0);
  const shown = kind.floor ? pool : pool.filter((k) => (Number(k.fame) || 0) < top);
  return shown.slice().sort((a, b) => (Number(b.fame) || 0) - (Number(a.fame) || 0)).slice(0, FAN);
}

/* 뽑기 선반은 팩 하나를 고르게 하는 탭이 아니라 두 배너를 나란히 세운다. 가려진 탭 안의 팩은
   값도 확률도 약속도 안 보이므로 고를 수가 없다(EA FC와 Hearthstone 상점이 팩을 나란히 세운다,
   docs/gamedev economy.md 뽑기 진열). 전설 선수는 따로 여는 쇼케이스 화면 대신 전설 배너의 포장 뒤에
   선다. 보는 자리와 사는 자리가 한 화면이면 보고 나서 돌아올 길이 없어도 된다. */
function pullBanner(all, kind) {
  const pool = poolFor(all, kind.id);
  const cost = pullCostOf(kind.id);
  const held = kind.ticketable ? state.tickets : 0;
  const rows = [1, PULL_BULK].map((want) => {
    const bill = pullBill(want, held, state.wallet.coin, cost);
    const left = Math.min(want, pool.length);
    const off = !pool.length || !affordable(bill.cost) || left < want;
    const price = bill.cost > 0 ? PRICE(bill.cost) : IC_TICKET + bill.free;
    const why = !pool.length ? '품절' : (left < want ? '한도' : '');
    const bad = state.wallet.coin < bill.cost;
    // 회차와 보너스는 버튼 위 약속 줄 한 줄에 서고 버튼은 실제로 치르는 값만 든다. 줄이 접히면 두 버튼 높이가 어긋나므로 한 줄로 묶는다.
    return '<div class="pack-offer"><div class="promise-lines"><span>' + want + '회</span>'
      + (want === PULL_BULK ? '<span class="bonus">+' + PULL_BONUS + '장</span>' : '')
      + '</div><button class="buy pull' + (bad && bill.cost > 0 ? ' bad-price' : '') + '" data-kind="' + kind.id + '" data-want="' + want + '"' + (off ? ' disabled' : '') + '>'
      + (why ? '<u>' + why + '</u>' : '') + '<i>' + price + '</i></button></div>';
  }).join('');
  const odds = pool.length
    ? '<details class="odds"><summary class="odds-link" tabindex="0" aria-label="' + titleOf(kind) + ' 획득 확률">확률</summary><em>' + shopOdds(pool) + '</em></details>'
    : '';
  // 부채꼴은 얼굴 썸네일이다. 전신은 카드 한 장 폭에서 몸이 작아져 빈 액자로 읽힌다.
  const fan = featured(pool, kind).map((k, i) => '<figure class="f' + i + '"><img alt="' + k.name + '" src="' + thumbURL('face', k, lookOf({}, k.name)) + '"><figcaption>' + k.name + '</figcaption></figure>').join('');
  const promise = kind.floor ? '명성 ' + kind.floor + ' 이상 확정' : '아직 없는 선수만';
  return '<section class="banner kind ' + kind.id + (pool.length ? '' : ' empty') + '" data-kind="' + kind.id + '">'
    + '<div class="stage"><div class="fan">' + fan + '</div>'
    + '<button class="pack-art" data-kind="' + kind.id + '" aria-label="' + titleOf(kind) + ' 구매 선택">' + packArt(kind) + '<span class="foil"></span></button></div>'
    + '<div class="side"><h5>' + titleOf(kind) + '</h5><p class="guarantee">' + promise + '</p>' + odds
    + '<div class="buys">' + rows + '</div></div></section>';
}

function pullShelf(all) {
  /* 보유 이용권은 숫자다. 이용권을 받는 팩이 하나라도 있을 때만 세운다. */
  const bank = PULL_KINDS.some((k) => k.ticketable) ? '<span class="held" title="이용권">' + IC_TICKET + '<b>' + state.tickets + '</b></span>' : '';
  return '<div class="pull-bar"><div class="roles" role="group" aria-label="뽑을 자리">'
    + ['keeper', 'kicker'].map(role => '<button data-role="' + role + '" aria-pressed="' + (pullRole === role) + '">' + (role === 'keeper' ? '키퍼' : '키커') + '</button>').join('')
    + '</div>' + bank + '</div><div class="banners">' + PULL_KINDS.map((k) => pullBanner(all, k)).join('') + '</div>';
}// 봇은 소모형이라 SHELVES에 못 넣는다. 등급을 갖는 게 아니라 분을 갖는다.
function botShelf() {
  const cur = state.bot;
  const rows = BOTS.map((b) => {
    let label = PRICE(b.cost);
    let duration = b.minutes + '분';
    let off = false;
    let bad = state.wallet.coin < b.cost;
    if (!affordable(b.cost)) {
      // 못 사는 것은 붉은 값과 비활성 버튼이 말한다. 모자란 액수를 적으면 같은 물건이 지갑마다 다른 수로 읽힌다.
      label = PRICE(b.cost);
      off = !affordable(b.cost);
      bad = true;
    } else if (cur.ms > 0 && b.tier === cur.tier) {
      duration = '+' + b.minutes + '분';
    } else if (cur.ms > 0 && b.tier < cur.tier) {
      // 더 좋은 클론이 서 있는데 싼 걸 사면 등급이 내려간다. 산 사람은 그걸 산 줄 모른다.
      label = '상위 보유';
      off = true;
    }
    // 봇도 장비와 같은 카드다. 파는 것이 클론의 모습이므로 글자보다 그림이 먼저 선다.
    return '<div class="card gear" data-spec="bot" data-at="' + b.tier + '" data-rare="' + b.tier + '">'
      + '<div class="pic"><div class="shot" data-kind="bot" data-rank="' + b.tier + '"></div></div>'
      + '<b>' + b.name + '</b>'
      // 효과 문장만 접는다. 기간과 횟수는 그 접기 밖에 서야 안 잘린다.
      + '<em>' + cardLines('bot', b.tier, duration) + '</em>'
      + '<div class="foot"><button class="buy' + (bad ? ' bad-price' : '') + '" data-bot="' + b.tier + '"' + (off ? ' disabled' : '') + '>' + label + '</button></div></div>';
  });
  return '<div class="rack">' + rows.join('') + '</div>';
}

/* 봇과 버프 카드의 그림. 장비와 달리 몸에 걸치는 것이 아니라 등급 하나가 곧 그 그림이라
   걸친 모습을 지어낼 것이 없다. 걸쳐 보는 것도 없으므로 카드 누름은 효과 칸과 긴 누름의 회전만 받는다. */
function bindShots(box, kind) {
  for (const shot of box.querySelectorAll('.shot[data-kind="' + kind + '"]')) {
    const at = Number(shot.dataset.rank);
    const url = thumbURL(kind, state.keeper, at);
    if (!url) continue;
    shot.innerHTML = '<img alt="" src="' + url + '">';
    const card = shot.closest('.card');
    // 마우스는 호버로 돈다. 터치의 pointerenter는 누름 한 번이라 여기서 걸러 내고 긴 누름이 받는다.
    card.onpointerenter = (e) => { if (e.pointerType === 'touch') return; startSpin(shot, kind, state.keeper, at); };
    card.onpointerleave = () => { holdDrop(); stopSpin(); };
    bindHold(card, () => startSpin(shot, kind, state.keeper, at));
  }
}

function bindBot(box) {
  bindShots(box, 'bot');
  for (const b of box.querySelectorAll('.buy[data-bot]')) {
    b.onclick = () => {
      if (b.disabled) return;
      const spec = botAt(b.dataset.bot);
      if (!spec || !purchase(spec.cost)) return;
      state.bot.tier = spec.tier;
      state.coach = true;
      // 6시간 상한. 무한 적립이면 방치가 아니라 영구 봇이 된다.
      state.bot.ms = Math.min(BOT_CAP, state.bot.ms + spec.minutes * 60000);
      persist();
      pips();
      renderShop();
    };
  }
}

// 버프 선반. 소모형이라 SHELVES 한 덩어리에 안 들어간다. 봇과 같은 이유로 별도 렌더러다.
function buffShelf() {
  const cur = state.buff;
  const rows = BUFFS.map((b, at) => {
    let label = PRICE(b.cost);
    let duration = b.shots + '회';
    let off = false;
    let bad = state.wallet.coin < b.cost;
    if (!affordable(b.cost)) {
      // 못 사는 것은 붉은 값과 비활성 버튼이 말한다. 모자란 액수를 적으면 같은 물건이 지갑마다 다른 수로 읽힌다.
      label = PRICE(b.cost);
      off = !affordable(b.cost);
      bad = true;
    } else if (cur.shots > 0 && cur.kind === b.kind) {
      duration = '+' + b.shots + '회';
      // 상한에 닿으면 산 구가 그대로 버려진다. 사기 전에 알아야 한다.
      if (cur.shots >= BUFF_CAP) { label = '한도'; off = true; }
    } else if (cur.shots > 0) {
      // 슬롯이 하나라 다른 종류를 사면 지금 것이 덮인다. 산 사람은 그걸 산 줄 모른다.
      label = '보유';
      off = true;
    }
    // 그림은 목록 순번으로 굽는다. 종류 이름을 그림 쪽에 다시 적으면 목록이 바뀐 날 두 곳이 갈린다.
    return '<div class="card gear" data-spec="buff" data-at="' + b.kind + '" data-rare="' + BUFF_RARE + '">'
      + '<div class="pic"><div class="shot" data-kind="buff" data-rank="' + at + '"></div></div>'
      + '<b>' + b.name + '</b>'
      // 효과 문장만 접는다. 기간과 횟수는 그 접기 밖에 서야 안 잘린다.
      + '<em>' + cardLines('buff', b.kind, duration) + '</em>'
      + '<div class="foot"><button class="buy' + (bad ? ' bad-price' : '') + '" data-buff="' + b.kind + '"' + (off ? ' disabled' : '') + '>' + label + '</button></div></div>';
  });
  return '<div class="rack">' + rows.join('') + '</div>';
}

function bindBuff(box) {
  bindShots(box, 'buff');
  for (const b of box.querySelectorAll('.buy[data-buff]')) {
    b.onclick = () => {
      if (b.disabled) return;
      const spec = buffAt(b.dataset.buff);
      if (!spec || !affordable(spec.cost)) return;
      const next = addBuff(state.buff, spec.kind);
      // 다른 종류가 살아 있으면 addBuff가 원본을 그대로 돌려준다. 그때 값을 치르면 골드만 사라진다.
      if (next === state.buff) return;
      if (!purchase(spec.cost)) return;
      state.buff = next;
      persist();
      pips();
      renderShop();
    };
  }
}

/* 유틸 선반은 열린 폼과 안내를 스스로 든다. 상점은 지갑과 저장과 다시 그리기만 넘긴다. */
const utilPane = createUtilShelf({ state, persist, pips, rerender: () => renderShop(), root: () => el('shop') });

function renderShop() {
  const box = el('shop');
  const pool = pullRole === 'kicker' ? KICKERS.filter(k => !state.kickers.includes(k.name))
    : KEEPERS.filter((e) => !state.squad.some((k) => k.name === e.name));
  // 장비를 한 탭에 몰면 카드가 여덟 장이라 720p에서 닫기 버튼이 화면 밖으로 밀린다.
  // 이름은 선반 데이터가 소유하고 이적시장과 봇과 버프만 따로 적는다. 열한 줄을 손으로 늘어놓으면
  // 선반 이름을 고친 날 탭만 옛 이름을 부른다.
  const tabName = (k) => (SHELVES[k] ? SHELVES[k].head : { pull: '이적시장', bot: '봇', buff: '버프', util: '유틸' }[k]);
  // data-now는 세로가 짧은 화면에서 탭 줄 끝의 고정 칸이 지금 선반 이름을 그리는 데 쓴다.
  const tabs = '<div class="tabs" data-now="' + tabName(shopTab) + '">' + SHOP_TABS.map((k) =>
    '<button class="tab" data-tab="' + k + '"' + (shopTab === k ? ' aria-current="true"' : '') + '>'
    + TAB_ICON[k] + '<span>' + tabName(k) + '</span></button>').join('') + '</div>';
  const goods = SHELVES[shopTab] ? gearShelf(shopTab) : shopTab === 'bot' ? botShelf() : shopTab === 'buff' ? buffShelf() : shopTab === 'util' ? utilPane.html() : pullShelf(pool);
  /* 창의 뼈대는 탭 줄, 몸, 닫기 셋이고 선반이 바뀌어도 뼈대는 안 움직인다. 탭 줄이 선반 기둥 안에 있으면
     탈의실이 있는 선반과 없는 선반에서 기둥 폭이 달라 탭이 다르게 접히고, 닫기가 선반 높이를 따라 뛴다.
     탈의실은 입는 선반의 짝이라 뽑기 선반에서는 몸 안에서만 빠진다. */
  box.innerHTML = '<h4 class="ptitle">상점</h4>' + tabs + '<div class="shopbody' + (shopTab === 'pull' ? ' pulling' : '') + '">' + (shopTab === 'pull' || shopTab === 'util' ? '' : fittingRoom()) + '<div class="goods">' + goods + '</div></div>'
    + '<button class="close">닫기</button>';
  // 탭을 다시 그려도 선택한 선반이 가로 스크롤 밖으로 사라지지 않게 브라우저가 위치를 맞춘다.
  box.querySelector('.tab[aria-current]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  box.querySelector('.close').onclick = () => { pullRole = 'keeper'; closeShop(); };
  // 전부 사기. 걸쳐 본 것을 한 번에 치른다. 값이 모자라면 아무것도 안 산다.
  // 되는 것만 골라 사면 무엇이 빠졌는지를 화면이 안 말해 주고, 남은 잔고로 다시 계산하게 된다.
  const all = box.querySelector('.all');
  // 벗기는 값을 안 건드린다. 시착용은 애초에 치른 적이 없으므로 되돌릴 잔고도 없다.
  for (const off of box.querySelectorAll('.tried i[data-off]')) off.onclick = () => {
    delete fitting[off.dataset.off];
    renderShop();
  };
  const strip = box.querySelector('.strip');
  if (strip) strip.onclick = () => {
    fitting = {};
    renderShop();
  };
  if (all) all.onclick = () => {
    if (all.disabled) return;
    // 값이 붙는 칸만 청구서에 오르고, 옮기는 것은 걸쳐 본 전부다. 변형은 값이 없지만 같이 입는다.
    const tried = Object.keys(fitting).filter((f) => shelfOfField(f));
    const bill = tried.reduce((n, f) => n + costOfField(f, fitting[f]), 0);
    if (!purchase(bill)) return;
    for (const f of Object.keys(fitting)) state.gear[f] = fitting[f];
    fitting = {};
    if (state.gear.city !== undefined) stage.setCity(state.gear.city, state.gear.citySkin);
    if (state.gear.frame !== undefined) stage.setGoal(state.gear.frame, state.gear.frameSkin);
    stage.setKeeper(state.keeper, lookOf(state.gear, state.keeper.name));
    persist();
    pips();
    renderShop();
  };
  for (const t of box.querySelectorAll('.tab')) {
    t.onclick = () => { shopTab = t.dataset.tab; utilPane.close(); renderShop(); };
  }
  bindSpec(box);
  for (const role of box.querySelectorAll('[data-role]')) role.onclick = () => { pullRole = role.dataset.role; renderShop(); };
  /* 포장은 포인터를 따라 기운다. 8도는 글자가 읽히는 기울임 상한이고 0.75는 가장자리에서도
     그 안에 머물게 하는 몫이다. 감소 동작 설정에서는 CSS가 변환을 통째로 끈다. */
  const LEAN_MAX = 8 * 0.75;
  for (const art of box.querySelectorAll('.pack-art')) {
    art.onpointermove = (e) => {
      const r = art.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
      art.style.setProperty('--ry', (x * 2 * LEAN_MAX).toFixed(2) + 'deg');
      art.style.setProperty('--rx', (-y * 2 * LEAN_MAX).toFixed(2) + 'deg');
      art.style.setProperty('--mx', ((x + 0.5) * 100).toFixed(1) + '%');
    };
    art.onpointerleave = () => { art.style.removeProperty('--rx'); art.style.removeProperty('--ry'); art.style.removeProperty('--mx'); };
    // 포장을 누르면 그 배너의 첫 살 수 있는 버튼으로 간다. 포장은 고르는 자리이고 치르는 자리는 버튼이다.
    art.onclick = () => art.closest('.banner').querySelector('.buy.pull:not(:disabled)')?.focus();
  }
  if (SHELVES[shopTab]) return bindGear(box);
  if (shopTab === 'bot') return bindBot(box);
  if (shopTab === 'buff') return bindBuff(box);
  if (shopTab === 'util') return utilPane.bind(box);
  for (const buy of box.querySelectorAll('.buy[data-want]')) buy.onclick = () => {
    if (buy.disabled) return;
    const want = Number(buy.dataset.want);
    const kind = pullKindOf(buy.dataset.kind);
    const here = poolFor(pool, kind.id);
    const bill = pullBill(want, kind.ticketable ? state.tickets : 0, state.wallet.coin, pullCostOf(kind.id));
    if (!affordable(bill.cost) || want > here.length) return;
    // 값을 깎기 전에 뽑는다. 빈 풀에 값만 치르는 경로는 만렙 훈련 데드락과 같은 결함이다.
    // 뽑은 카드는 풀에서 즉시 빠진다. 안 빼면 한 묶음 안에서 같은 이름이 두 번 나온다.
    const left = here.slice();
    const drawn = [];
    /* 열 장 회차는 열한 장이 나온다. 값은 열 배 그대로이므로 이것이 묶음의 유일한 이득이고,
       그래서 한 장 자리가 안 죽는다. 뽑는 수는 판정이 소유하는 함수가 정한다. */
    const take = pullYield(want);
    for (let i = 0; i < take; i += 1) {
      const pick = pullFrom(left, roll);
      if (!pick) break;
      left.splice(left.indexOf(pick), 1);
      drawn.push(pick);
    }
    if (!drawn.length) return;
    if (!purchase(bill.cost)) return;
    state.tickets -= bill.free;
    for (const pick of drawn) {
      if (pullRole === 'kicker') state.kickers.push(pick.name);
      else state.squad.push(recruit(pick));
    }
    // 뽑은 카드로 자동 전환하지 않는다. 무작위 결과가 뛰던 키퍼를 임의로 강등시키면
    // 뽑기가 이득이 아니라 사고가 된다. 교체는 선수단에서 사람이 고른다.
    // 값은 여기서 이미 치러졌다. 뒤집기는 결과를 보여 주는 일이지 판정을 미루는 일이 아니다.
    // 첫 장은 기다리지 않고 바로 선다. 값을 치른 직후에 빈 화면을 보는 구간이 없어야 한다.
    reveal.start(drawn, kind.id, () => { persist(); pips(); renderShop(); });
  };
}

// 선반을 지정해 열 수 있다. 봇 크레딧이 없을 때 자동 버튼이 봇 선반으로 곧장 보낸다.
function openShop(tab) {
  if (tab) shopTab = tab;
  if (!shutOthers('shop')) return;
  el('shop').hidden = false;
  renderShop();
}

function closeShop() {
  el('shop').hidden = true;
  // 지난번 결과를 들고 다시 열면 방금 뽑은 것처럼 읽힌다. 예약도 같이 끊는다.
  reveal.stopReveal();
  // 선반도 처음 자리로 돌린다. 닫을 때 보던 탭이 남으면 다음에 연 사람이 이적시장을 못 찾는다.
  shopTab = 'pull';
  utilPane.close();
}


// 걸쳐 보던 것을 버린다. 선수단에서 키퍼를 바꾸면 부른다. 남겨 두면 다른 사람 몸에 얹혀 산 것처럼 보인다.
function clearFitting() {
  fitting = {};
}
  return { openShop, closeShop, clearFitting, stopReveal: reveal.stopReveal, revealAll: reveal.revealAll, onboardStep: reveal.onboardStep, revealState: reveal.revealState, setRevealPace: reveal.setRevealPace };
}
