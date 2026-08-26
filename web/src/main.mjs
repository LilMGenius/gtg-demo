// 화면 조립. 판정은 chain.mjs가 하고 이 파일은 입력과 자막만 옮긴다.
import { makeRng, buildSet, resolve, growthOffer, newKeeper, autoInput, rollForm, ballInHand, restartDelay, setBreak, growthGain, followerGain } from '../../src/chain.mjs';
import { CAUSE_LABEL } from '../../src/ledger.mjs';
import { createScene } from './render/scene.mjs';
import { mountBgm } from './audio/bgm.mjs';
import { mountTitle } from './ui/title.mjs';
import { load, save, offlineGain } from './state/save.mjs';

const el = (id) => document.getElementById(id);
const stage = createScene(el('stage'));
// 계측 훅. 플레이테스트가 이 값을 읽고, 값이 없으면 게이트를 죽인다.
window.__ballProbe = stage.ballProbe;
window.__stageProbe = stage.stageProbe;
window.__goalFrame = stage.goalFrame;
mountBgm();

// 재현되지 않는 캐프처는 증거가 아니다. ?seed= 가 있으면 그 씨드로 고정한다.
const seedParam = new URLSearchParams(location.search).get('seed');
const rng = makeRng(seedParam === null ? ((Date.now() ^ 0x9e3779b9) >>> 0) : (Number(seedParam) >>> 0));
const saved = load();
const state = { keeper: Object.assign(newKeeper(), saved?.keeper || null), shots: [], i: 0, results: [], phase: 'idle', auto: Boolean(saved?.auto), picks: 0 };
// 비운 시간은 훈련 선택권으로만 바뀌고, 그 선택은 손으로 한다.
state.picks = saved ? offlineGain(saved.at, Date.now()) : 0;
// 아웃문그램 팔로워. 의사소통과 악동이 여기서 값을 낸다.
state.fans = Number(saved?.fans) || 0;
window.__picks = () => state.picks;
// 사고 연출은 확률로만 나오므로 계측기가 불러낼 수 있어야 한다. 판정은 안 바뀐다.
window.__act = (kind) => stage.act(kind);
// 불러오기는 판이 시작되기 전에 끝난다. 첨 판을 기다려 그리면 그 사이에 숫자가 없다.

// 손가락 셋. 방향과 타이밍과 나갈지 여부.
// 여기서 나온 실패는 손가락 셋으로 귀속하고 스탯 원장에 섞지 않는다.
let pressAt = 0;
let advance = 0;
let timer = 0;

function say(line, cause) {
  el('caption').innerHTML = cause
    ? '<b>' + (CAUSE_LABEL[cause] || cause) + '</b>' + line
    : line;
}

function pips() {
  el('pips').innerHTML = state.shots.map((_, i) => {
    const r = state.results[i];
    return '<i class=\"' + (r === undefined ? '' : r ? 'gone' : 'save') + '\"></i>';
  }).join('');
  el('lv').textContent = 'Lv ' + state.keeper.level;
  el('fans').innerHTML = '아웃문그램 <b>' + state.fans.toLocaleString() + '</b>';
}

function setPad(on) {
  for (const b of document.querySelectorAll('.zone')) b.disabled = !on;
}

function nextSet() {
  // 기복은 판당 한 번 굴러서 그 판 내내 같은 값으로 선다.
  const form = rollForm(state.keeper, rng);
  el('form').textContent = form > 0.4 ? '컨디션 좋음' : form < -0.4 ? '컨디션 난조' : '';
  state.shots = buildSet(rng, state.keeper.level);
  state.i = 0;
  state.results = [];
  pips();
  nextShot();
}

function nextShot() {
  if (state.i >= state.shots.length) return endSet();
  const shot = state.shots[state.i];
  state.phase = 'wait';
  advance = 0;
  el('out').classList.remove('on');
  setPad(true);
  stage.reset();
  pressAt = performance.now() + shot.flight * 1000 * 0.72;
  say(shot.kicker.name + ' 준비합니다.', null);
  // 창이 닫히면 손가락 대신 자동 입력이 친다. 늦은 만큼은 스탯이 아니라 손가락 탓이다.
  clearTimeout(timer);
  // 자동은 손가락만 대신한다. 공은 같은 시간을 날고 대기시간은 그대로다.
  const wait = state.auto ? Math.max(0, pressAt - performance.now()) : shot.flight * 1000 + 900;
  timer = setTimeout(() => { if (state.phase === 'wait') commit(null); }, wait);
}

function commit(dive) {
  if (state.phase !== 'wait') return;
  state.phase = 'flying';
  clearTimeout(timer);
  setPad(false);
  const shot = state.shots[state.i];
  const input = dive === null
    ? autoInput(state.keeper, shot, rng)
    : { dive, errMs: performance.now() - pressAt, advance, auto: false };
  stage.diving = state.keeper.diving;
  const result = resolve({ keeper: state.keeper, shot, rng, input });
  state.results[state.i] = result.conceded;
  say('...', null);
  stage.play(shot, input, result, () => rollCaptions(result));
}

// 자막은 체인 순서대로 한 줄씩 나온다. 반전이 반전을 덮으려면 한꺼번에 오면 안 된다.
function rollCaptions(result) {
  const lines = result.events.slice();
  state.phase = 'caption';
  const step = () => {
    const e = lines.shift();
    if (!e) {
      state.skip = null;
      // 팔로워는 구마다 오른다. 먹혀도 오르고, 막으면 더 오른다.
      const gain = followerGain(state.keeper, result);
      state.fans += gain;
      pips();
      state.i += 1;
      restart(result);
      return;
    }
    say(e.line, e.cause);
    // 자막이 말한 사건을 화면도 같이 연기한다. 결과는 이미 확정됐고 여기서 바뀌지 않는다.
    if (e.t !== 'result') stage.act(e.t);
    // 체인이 드리블로 갔을 때만 공을 튕기는 소리가 붙는다. 자막과 소리가 같은 사건을 가리킨다.
    if (e.t === 'charge' || e.t === 'beat') stage.sfx.dribble();
    if (e.t === 'spill' || e.t === 'rebound') stage.sfx.kick(0.5);
    clearTimeout(timer);
    timer = setTimeout(step, e.t === 'result' ? 900 : 850);
    // 자막을 밀어놓는 것은 손가락이다. 스택으로 살 수 있는 것은 공이 다시 놀이는 시간뿐이다.
    state.skip = () => { clearTimeout(timer); step(); };
  };
  step();
}

// 공을 다시 세우는 시간. 스로잉과 골킱이 이 초를 줄이고, 줄어드는 것이 화면에 보여야 선택이 선택이 된다.
function countdown(sec, label, then) {
  const until = performance.now() + sec * 1000;
  const tick = () => {
    const left = (until - performance.now()) / 1000;
    if (left <= 0) { el('caption').textContent = ''; then(); return; }
    el('caption').innerHTML = label + ' <b>' + left.toFixed(1) + 's</b>';
    timer = setTimeout(tick, 100);
  };
  tick();
}

function restart(result) {
  save(state.keeper, state.auto, state.fans);
  const hand = ballInHand(result);
  countdown(restartDelay(state.keeper, result), hand ? '손으로 던져준다' : '골킥을 차준다', nextShot);
}

function endSet() {
  const conceded = state.results.filter(Boolean).length;
  say('다섯 구 중 ' + (5 - conceded) + '개 막았습니다.', null);
  setTimeout(() => countdown(setBreak(), '숨 고르는 중', showOffer), 900);
}

function showOffer() {
  state.phase = 'offer';
  const offer = growthOffer(rng, state.keeper);
  const box = el('offer');
  box.hidden = false;
  const head = state.picks > 0 ? '자리 비운 사이 훈련 ' + state.picks + '회 남음' : '어디를 올릴까';
  box.innerHTML = '<h4>' + head + '</h4><div class=\"row\">' + offer.map((k) =>
    '<button data-k=\"' + k + '\">' + CAUSE_LABEL[k] + '<em>' + state.keeper[k] + ' → ' + (state.keeper[k] + 1) + '</em></button>'
  ).join('') + '</div>';
  for (const b of box.querySelectorAll('button')) {
    b.onclick = () => {
      // 프로의식은 히든이다. 숫자는 안 보이고 가끔 두 칸이 오른다.
      state.keeper[b.dataset.k] += growthGain(state.keeper, rng);
      state.keeper.level += 1;
      save(state.keeper, state.auto, state.fans);
      box.hidden = true;
      stage.setKeeper(state.keeper);
      if (state.picks > 0) {
        state.picks -= 1;
        save(state.keeper, state.auto, state.fans);
        showOffer();
        return;
      }
      nextSet();
    };
  }
}

for (const b of document.querySelectorAll('.zone')) {
  b.onpointerdown = () => {
    if (state.phase === 'caption') return state.skip && state.skip();
    commit(Number(b.dataset.dive));
  };
}
const autoBtn = el('auto');
autoBtn.classList.toggle('on', state.auto);
autoBtn.onpointerdown = () => {
  state.auto = !state.auto;
  autoBtn.classList.toggle('on', state.auto);
  save(state.keeper, state.auto, state.fans);
};

el('out').onpointerdown = () => {
  advance = advance > 0 ? 0 : 0.9;
  el('out').classList.toggle('on', advance > 0);
};
addEventListener('keydown', (e) => {
  if (state.phase === 'caption' && state.skip) return state.skip();
  if (e.key === 'ArrowLeft') commit(-1);
  if (e.key === 'ArrowRight') commit(1);
  if (e.key === 'ArrowUp' || e.key === ' ') commit(0);
});

pips();
mountTitle(() => {
  stage.setKeeper(state.keeper);
  // 돌아오자마자 밀린 훈련부터 쓴다. 그 다음에 공이 날아온다.
  if (state.picks > 0) {
    state.picks -= 1;
    showOffer();
    return;
  }
  nextSet();
});
