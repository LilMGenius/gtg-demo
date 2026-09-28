import { thumbURL } from '../render/thumb.mjs';
import { lookOf } from '../state/gear.mjs';
import { mutualCount, mutualBoost, whoKey, isMutual, isFollowing, dmWaiting, dmClock, follow, DM_MOVES, dmOdds, dmOutcome, applyDm } from '../state/gram.mjs';
import { linkAttrs } from './links.mjs';
import { IC_FANS, IC_MUTUAL, IC_LIKE, IC_CMT, IC_NOPOST } from './icons.mjs';
import { rapportTier, addRapport } from '../state/rapport.mjs';
import { passerName } from '../state/passer.mjs';
import { CAUSE_LABEL } from '../../../src/ledger.mjs';
import { withRo } from './josa.mjs';
import { dmLine } from './lines.mjs';

/* 아웃문그램 창. 피드와 맞팔과 쪽지를 한 창에 그린다. 게임 상태와 저장과 창 전환은 부르는 쪽이 넘긴다. */
export function createGramPanel({ state, el, roll, persist, pips, shutOthers }) {
// 아웃문그램. 계정 머리 아래로 글이 카드로 쌓인다. 최신 순이다.
function renderGram() {
  const box = el('gram');
  /* 계정 머리. 초상과 계정명과 숫자 두 칸이다. 계정을 여는 첫 신호는 이름이 아니라 얼굴이라
     48px 판때기가 먼저 서고(명단 한 줄의 얼굴은 38px이다. 여기는 계정 주인의 자리라 더 크다),
     맞팔 수가 팔로워 증가에 곱해지므로 그 배율은 맞팔 칸의 배지로 붙는다. 배율을 설명하는 문장은
     그 칸의 title과 aria-label이 갖는다. 머리에 서는 것은 숫자고, 문장은 손을 얹은 사람에게만 온다. */
  const myFace = thumbURL('face', state.keeper, lookOf(state.gear, state.keeper.name));
  const mut = mutualCount(state.social);
  const boost = Math.round((mutualBoost(state.social) - 1) * 100);
  const tip = '맞팔 ' + mut + '명이면 팔로워가 ' + boost + '% 더 붙는다';
  const head = '<img class="pfp" alt="' + state.keeper.name + '" src="' + myFace + '">'
    + '<span class="who">' + state.keeper.name + '</span>'
    + '<small><button class="stat" id="gramFollowers" ' + linkAttrs('gramFollowers') + '>' + IC_FANS + '<em>' + state.fans.toLocaleString() + '</em></button>'
    + '<button class="stat" id="gramEffect" ' + linkAttrs('gramEffect') + ' aria-description="' + tip + '">' + IC_MUTUAL
    + '<em>' + mut + '</em><i>+' + boost + '%</i></button></small>';
  /* 작성자 초상. img가 아니라 판때기 배경으로 깐다. img로 세우면 사진 글의 첫 그림이 초상이 되고,
     사진을 화소로 재는 자들이 얼굴을 그 글의 사진으로 읽는다. 행인은 생김새가 저장에 없어 실루엣이다. */
  const plate = (face) => (face
    ? '<span class="ava" style="background-image:url(' + face + ')"></span>'
    : '<span class="ava anon">' + IC_FANS + '</span>');
  // 선팔 버튼. 카드 우측 상단의 작은 판때기다. 관계가 바뀌는 자리라 지금 상태가 글자로 서 있다.
  const folBtn = (city, passer, tier) => {
    const key = whoKey(city, passer);
    const label = isMutual(state.social, key) ? '맞팔' : (isFollowing(state.social, key) ? '팔로우 중' : '선팔');
    const off = isFollowing(state.social, key) ? ' disabled' : '';
    return '<button class="fol" data-key="' + key + '" data-tier="' + tier + '"' + off + '>' + label + '</button>';
  };
  /* 반응 줄. 아이콘이 먼저 서고 수가 따라온다. 옛 저장의 글에는 좋아요 칸이 아예 없는데,
     그때 줄을 통째로 비우면 한 장은 반응 줄이 서고 한 장은 안 서서 아이콘과 수의 자리가 흔들린다.
     없는 수는 0으로 세운다. 팔로워는 오른 글에만 붙는다. */
  const react = (p) => {
    const seen = '<i class="like">' + IC_LIKE + '<em>' + (Number(p.l) > 0 ? p.l : 0) + '</em></i>'
      + '<i class="talk">' + IC_CMT + '<em>' + (p.cm ? 1 : 0) + '</em></i>';
    const fans = p.g > 0 ? '<i class="fans">' + IC_FANS + '<em>+' + p.g + '</em></i>' : '';
    return '<div class="react">' + seen + fans + '</div>';
  };
  /* 굵게 서는 이름은 남의 이름이다. 내 계정에서 내 이름은 담담하게 서고, 내가 올린 글에서 굵은 것은
     그 판의 키커다. 앞에 내 이름을 굵게 세우면 그 글이 부르는 이름이 바뀐다. */
  const mineBy = plate(myFace) + '<span class="nm">' + state.keeper.name + '</span>';
  /* 내가 올린 셀카. 주어가 둘이라 상대 이름이 작성자 줄 끝에 서고, 팔로워는 그 자리에서 이미 올랐다.
     사진은 저장에 안 들어 있고 그때의 차림만 남아 있어, 열 때마다 그 차림으로 다시 굽는다. */
  const selfieCard = (p) => '<article class="post shot mine">'
    + '<div class="by">' + mineBy + '<b class="tag">' + p.n + '</b></div>'
    + '<img class="pic" alt="' + p.n + '과 찍은 사진" src="' + thumbURL('body', { height: p.sf.h, weight: p.sf.w }, p.sf.look) + '">'
    + '<p class="txt">' + p.t + '</p>' + react(p) + '</article>';
  /* 남이 올린 사진. 그림은 저장에 안 들어 있고 그때의 차림만 남아 있어 열 때마다 다시 굽는다.
     한 장이 47KB라 열두 장을 저장에 실으면 한도를 위협하고, 굽는 비용은 상점이 이미 스물넉 장으로 치른다. */
  const photoCard = (p) => '<article class="post shot' + (p.c ? ' bad' : '') + '">'
    + '<div class="by">' + plate('') + '<b class="nm">' + p.n + '</b>'
    + folBtn(p.ph.city, p.ph.passer, p.ph.tier) + '</div>'
    + '<img class="pic" alt="' + p.n + '이 찍은 사진" src="' + thumbURL('body', { height: p.ph.h, weight: p.ph.w }, p.ph.look) + '">'
    + '<p class="txt">' + p.t + '</p>' + react(p) + '</article>';
  // 댓글. 카드 안에 있되 한 칸 들여써야 남이 쓴 줄로 읽힌다. 그 사람도 선팔이 걸리는 사람이다.
  const cmtRow = (p) => (p.cm
    ? '<div class="cmt"><b>' + p.cm.who + '</b><span>' + p.cm.text + '</span>'
      + folBtn(p.cm.city, p.cm.passer, p.cm.tier) + '</div>'
    : '');
  const myCard = (p) => '<article class="post' + (p.c ? ' bad' : '') + '">'
    + '<div class="by">' + mineBy + '</div>'
    + '<p class="txt">' + p.t.replace(p.n, '<b>' + p.n + '</b>') + '</p>'
    + react(p) + cmtRow(p) + '</article>';
  const feed = state.posts.length
    ? state.posts.slice().reverse().map((p) => (p.ph ? photoCard(p) : (p.sf ? selfieCard(p) : myCard(p)))).join('')
    /* 빈 칸은 비워 두거나 아이콘 하나다(파운더 판정). 글자 한 줄은 판을 상자 위 라벨로 바꾼다.
       아는 얼굴의 빈 칸과 같은 문법으로 빈 사진틀 하나만 세운다. */
    : '<article class="post empty">' + IC_NOPOST + '</article>';
  /* 쪽지는 피드 아래에 접혀 있다가 이름을 누르면 그 자리에서 펴진다. 예전에는 창을 통째로 덮어서
     계정을 연 사람이 제 글보다 남의 대화를 먼저 봤다. 대화는 계정의 일부지 계정의 첫 화면이 아니다.
     맞팔이 된 뒤 세 판이 지나면 그 사람이 다시 이 줄에 선다. */
  const keys = dmWaiting(state.social, dmClock(state.record));
  // 답장을 보낸 사람은 대기 목록에서 빠진다. 펴 둔 대화가 그 자리에서 사라지지 않게 손잡이를 남긴다.
  if (dmOpen && keys.indexOf(dmOpen) < 0) keys.unshift(dmOpen);
  const dms = keys.length
    ? '<section class="dms">' + keys.map((key) => {
      const part = key.split(':');
      const city = Number(part[0]);
      const passer = Number(part[1]);
      const tier = rapportTier(state.rapport, city, passer);
      const on = key === dmOpen;
      return '<button class="dmOpen' + (on ? ' on' : '') + '" data-key="' + key + '">' + IC_CMT
        + '<span>' + passerName(city, passer, tier) + '</span>'
        + (on ? '' : '<em>새 쪽지</em>') + '</button>'
        + (on ? renderDm(city, passer, tier) : '');
    }).join('') + '</section>'
    : '';
  box.innerHTML = '<h4>' + head + '</h4><div class="feed">' + feed + '</div>' + dms
    + '<button class="close">닫기</button>';
  for (const b of box.querySelectorAll('.dmOpen')) {
    b.onclick = () => { dmOpen = dmOpen === b.dataset.key ? null : b.dataset.key; dmSaid = null; renderGram(); };
  }
  for (const b of box.querySelectorAll('.fol')) {
    b.onclick = () => {
      // 맞팔 여부는 여기서 한 번 굴린다. 열 때마다 다시 굴리면 같은 사람이 매번 다른 답을 준다.
      state.social = follow(state.social, b.dataset.key, roll() * 100, Number(b.dataset.tier) || 0);
      persist();
      renderGram();
    };
  }
  if (dmOpen) {
    const part = dmOpen.split(':');
    const city = Number(part[0]);
    const passer = Number(part[1]);
    const tier = rapportTier(state.rapport, city, passer);
    for (const b of box.querySelectorAll('[data-dm]')) b.onclick = () => sendDm(city, passer, tier, b.dataset.dm);
    const fold = box.querySelector('.close.fold');
    if (fold) fold.onclick = () => { dmOpen = null; dmSaid = null; renderGram(); };
  }
  // 접기 버튼도 .close라 첫 번째를 잡으면 창이 아니라 대화가 닫힌다. 창을 닫는 것은 뒤엣것이다.
  box.querySelector('.close:not(.fold)').onclick = closeGram;
}

function openGram() {
  if (!shutOthers('gram')) return;
  el('gram').hidden = false;
  renderGram();
}

function closeGram() {
  el('gram').hidden = true;
  // 닫을 때 대화를 비운다. 남겨 두면 다음에 계정을 열었을 때 남의 대화가 먼저 뜬다.
  dmOpen = null;
  dmSaid = null;
}

/* 지금 열어 둔 쪽지. 키는 도시와 행인 인덱스이고, 답장을 보내면 결과가 여기 남는다.
   창을 닫으면 비운다. 남겨 두면 다음에 계정을 열었을 때 남의 대화가 먼저 뜬다. */
let dmOpen = null;
let dmSaid = null;

/* 쪽지 한 통. 맞팔이라야 오고, 답장하면 다음 말은 세 판 뒤에 온다.
   피드 아래 접힌 자리에서 펴지므로 이 함수는 창을 갈아 끼우지 않고 그 자리에 들어갈 조각을 돌려준다. */
function renderDm(city, passer, tier) {
  const said = dmSaid && dmSaid.key === dmOpen ? dmSaid : null;
  const body = said
    ? '<div class="line them">' + said.said + '</div><div class="line me">' + said.pick + '</div>'
      + '<div class="out ' + (said.won ? 'win' : 'lose') + '">' + said.line
      + (said.fans ? ' ' + IC_FANS + ' +' + said.fans : '') + '</div>'
    : '<div class="line them">' + dmSay(city, passer, tier) + '</div>'
      + '<div class="pick">' + DM_MOVES.map((m) => '<button data-dm="' + m.id + '">' + m.label
        + '<em>' + CAUSE_LABEL[m.stat] + ' ' + withRo(state.keeper[m.stat]) + ' 성공 ' + dmOdds(state.keeper, m.id) + '%</em></button>').join('') + '</div>';
  return '<div class="dm">' + body + '</div><button class="close fold">접기</button>';
}

/* 먼저 온 말은 한 번 뽑아 그 대화가 열려 있는 동안 고정한다. 매 렌더마다 다시 뽑으면
   답장 버튼을 보다가 상대의 말이 바뀐다. */
let dmHeld = null;
function dmSay(city, passer, tier) {
  if (!dmHeld || dmHeld.key !== dmOpen) dmHeld = { key: dmOpen, text: dmLine(tier, roll) };
  return dmHeld.text;
}

// 답장. 성공하면 라포가 한 칸 오르고 팔로워가 붙는다. 실패해도 잃는 것은 없고 다음 말이 밀린다.
function sendDm(city, passer, tier, moveId) {
  const out = dmOutcome(state.keeper, moveId, roll() * 100);
  if (!out) return;
  const move = DM_MOVES.find((m) => m.id === moveId);
  state.social = applyDm(state.social, dmOpen, dmClock(state.record));
  if (out.won) {
    state.fans += out.fans;
    state.rapport = addRapport(state.rapport, city, passer);
  }
  dmSaid = { key: dmOpen, said: dmSay(city, passer, tier), pick: move ? move.label : '', won: out.won, line: out.line, fans: out.fans };
  persist();
  pips();
  renderGram();
}
  return { openGram, closeGram, renderGram };
}
