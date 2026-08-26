// 화면 조립. 판정은 chain.mjs가 하고 이 파일은 입력과 자막만 옮긴다.
import { makeRng, buildSet, resolve, growthOffer, newKeeper, autoInput } from '../../src/chain.mjs';
import { CAUSE_LABEL } from '../../src/ledger.mjs';
import { createScene } from './render/scene.mjs';
import { mountBgm } from './audio/bgm.mjs';
import { mountTitle } from './ui/title.mjs';
import { load, save } from './state/save.mjs';

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
const state = { keeper: saved?.keeper ?? newKeeper(), shots: [], i: 0, results: [], phase: 'idle', auto: Boolean(saved?.auto) };

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
}

function setPad(on) {
  for (const b of document.querySelectorAll('.zone')) b.disabled = !on;
}

function nextSet() {
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
  const step = () => {
    const e = lines.shift();
    if (!e) {
      pips();
      state.i += 1;
      setTimeout(nextShot, 700);
      return;
    }
    say(e.line, e.cause);
    // 체인이 드리블로 갔을 때만 공을 튕기는 소리가 붙는다. 자막과 소리가 같은 사건을 가리킨다.
    if (e.t === 'charge' || e.t === 'beat') stage.sfx.dribble();
    if (e.t === 'spill' || e.t === 'rebound') stage.sfx.kick(0.5);
    setTimeout(step, e.t === 'result' ? 900 : 850);
  };
  step();
}

function endSet() {
  state.phase = 'offer';
  const conceded = state.results.filter(Boolean).length;
  say('다섯 구 중 ' + (5 - conceded) + '개 막았습니다.', null);
  const offer = growthOffer(rng, state.keeper);
  const box = el('offer');
  box.hidden = false;
  box.innerHTML = '<h4>어디를 올릴까</h4><div class=\"row\">' + offer.map((k) =>
    '<button data-k=\"' + k + '\">' + CAUSE_LABEL[k] + '<em>' + state.keeper[k] + ' → ' + (state.keeper[k] + 1) + '</em></button>'
  ).join('') + '</div>';
  for (const b of box.querySelectorAll('button')) {
    b.onclick = () => {
      state.keeper[b.dataset.k] += 1;
      state.keeper.level += 1;
      save(state.keeper, state.auto);
      box.hidden = true;
      stage.setKeeper(state.keeper);
      nextSet();
    };
  }
}

for (const b of document.querySelectorAll('.zone')) {
  b.onpointerdown = () => commit(Number(b.dataset.dive));
}
const autoBtn = el('auto');
autoBtn.classList.toggle('on', state.auto);
autoBtn.onpointerdown = () => {
  state.auto = !state.auto;
  autoBtn.classList.toggle('on', state.auto);
  save(state.keeper, state.auto);
};

el('out').onpointerdown = () => {
  advance = advance > 0 ? 0 : 0.9;
  el('out').classList.toggle('on', advance > 0);
};
addEventListener('keydown', (e) => {
  if (e.key === 'ArrowLeft') commit(-1);
  if (e.key === 'ArrowRight') commit(1);
  if (e.key === 'ArrowUp' || e.key === ' ') commit(0);
});

mountTitle(() => {
  stage.setKeeper(state.keeper);
  nextSet();
});
