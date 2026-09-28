import { selfieFans, likesFor } from '../state/gram.mjs';
import { passerName } from '../state/passer.mjs';
import { selfieLine } from './lines.mjs';
import { lookOf } from '../state/gear.mjs';
import { rapportTier } from '../state/rapport.mjs';
import { IC_FANS } from './icons.mjs';
import { MOVES, dateOdds, dateOutcome, DATE_COST, applyDate } from '../state/date.mjs';
import { CAUSE_LABEL } from '../../../src/ledger.mjs';
import { withRo } from './josa.mjs';

/* 만남 창. 라포를 끝까지 채운 행인과 한 번 만나 셋 중 하나를 고르고, 이기면 셀카 한 장을 올린다. */
export function createDatePanel({ state, el, roll, persist, pips, shutOthers, renderMe, purchase, FEED_CAP }) {
/* 셀카 한 장. 내 계정에 올라가고 팔로워가 그 자리에서 오른다.
   사진은 저장에 안 실린다. 행인이 찍은 사진과 같은 이유로 그때의 차림만 남기고 열 때 다시 굽는다.
   상대 이름을 글에 박는 것은 이 사진의 주어가 둘이기 때문이다. */
function takeSelfie(city, passer, tier) {
  const fans = selfieFans(tier, state.gear.city);
  state.fans += fans;
  state.posts.push({ n: passerName(city, passer, tier), c: false, g: fans,
    t: selfieLine(roll), lb: fans, ct: state.gear.city,
    l: likesFor(fans, state.gear.city, roll()),
    sf: { city, passer, tier, h: state.keeper.height, w: state.keeper.weight, look: lookOf(state.gear, state.keeper.name) } });
  while (state.posts.length > FEED_CAP) state.posts.shift();
  persist();
  pips();
  return fans;
}

// 만남. 세 갈래를 한 번에 보여주고 하나를 고르면 그 자리에서 끝난다.
// 무르기는 없다. 다시 열려면 라포를 다시 쌓아야 한다.
function renderDate(city, passer, done) {
  const box = el('date');
  const who = passerName(city, passer, rapportTier(state.rapport, city, passer));
  if (done) {
    /* 눈이 맞았으면 한 장 찍는다. 라포를 쌓아 값을 치르고 만나러 간 것이 여기서 회수된다.
       진 만남에는 이 자리가 없다. 있으면 져도 얻는 것이 있어 만남의 결과가 화면에서 사라진다.
       한 번 찍으면 버튼이 닫힌다. 이 화면이 열려 있는 동안 두 번 누르면 같은 사진이 두 장 올라간다. */
    const tier = rapportTier(state.rapport, city, passer);
    const shoot = done.won && !done.shot
      ? '<button class="selfie">같이 한 장 찍는다<em>' + IC_FANS + ' +' + selfieFans(tier, state.gear.city) + '</em></button>'
      : (done.shot ? '<div class="took">' + IC_FANS + ' +' + done.shot + ' 올렸다</div>' : '');
    box.innerHTML = '<h4>' + who + '</h4>'
      + '<div class="out">' + done.line + '<i class="' + (done.won ? 'win' : 'lose') + '">'
      + '팔로워 ' + (done.fans > 0 ? '+' : '') + done.fans + '. '
      + (done.won ? '이 동네에서는 이제 눈이 안 흔들린다' : '처음부터 다시 말을 섞어야 한다')
      + '</i></div>' + shoot + '<button class="close">닫기</button>';
    box.querySelector('.close').onclick = closeDate;
    const cam = box.querySelector('.selfie');
    if (cam) cam.onclick = () => { done.shot = takeSelfie(city, passer, tier); renderDate(city, passer, done); };
    return;
  }
  const moves = MOVES.map((m) => '<button data-move="' + m.id + '">' + m.label
    + '<em>' + CAUSE_LABEL[m.stat] + ' ' + withRo(state.keeper[m.stat]) + ' 성공 ' + dateOdds(state.keeper, m.id) + '%</em></button>').join('');
  box.innerHTML = '<h4>' + who + '</h4><div class="card">' + moves + '</div><button class="close">그냥 지나간다</button>';
  box.querySelector('.close').onclick = closeDate;
  for (const b of box.querySelectorAll('[data-move]')) b.onclick = () => commitDate(city, passer, b.dataset.move);
}

// 굴림은 화면 쪽 난수다. 판정용 rng를 쓰면 그 뒤 모든 구가 밀려 네 게이트가 통째로 흔들린다.
function commitDate(city, passer, moveId) {
  const out = dateOutcome(state.keeper, moveId, roll() * 100);
  if (!out) return;
  if (!purchase(DATE_COST)) return;
  state.fans = Math.max(0, state.fans + out.fans);
  state.rapport = applyDate(state.rapport, city, passer, out.won);
  persist();
  pips();
  renderDate(city, passer, out);
  // 뒤에 열려 있는 내 정보도 같이 그린다. 안 그리면 방금 쓴 골드와 내려간 라포가
  // 반투명 배경 너머에서 옛 값으로 남아 만남 버튼이 아직 열린 것처럼 보인다.
  renderMe();
}

function openDate(city, passer) {
  if (!shutOthers('date')) return;
  el('date').hidden = false;
  renderDate(city, passer, null);
}

// 닫을 때 내 정보를 다시 그린다. 라포와 지갑이 방금 바뀌었는데 뒤 화면이 옛 값이면
// 같은 사람에게 만남 버튼이 아직 열린 것처럼 보인다.
function closeDate() {
  el('date').hidden = true;
  renderMe();
}
  return { openDate, closeDate };
}
