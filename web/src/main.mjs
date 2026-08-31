// 화면 조립. 판정은 chain.mjs가 하고 이 파일은 입력과 자막만 옮긴다.
import { makeRng, buildSet, resolve, newKeeper, autoInput, rollForm, ballInHand, restartDelay, setBreak, growthGain, followerGain } from '../../src/chain.mjs';
import { CAUSE_LABEL, GROWABLE } from '../../src/ledger.mjs';
import { createScene } from './render/scene.mjs';
import { mountBgm } from './audio/bgm.mjs';
import { mountTitle } from './ui/title.mjs';
import { aimLine } from './ui/callout.mjs';
import { eventLine, setEndLine } from './ui/lines.mjs';
import { load, save, offlineGain } from './state/save.mjs';
import { coinGain, readWallet } from './state/wallet.mjs';

const el = (id) => document.getElementById(id);
const stage = createScene(el('stage'));
// 계측 훅. 플레이테스트가 이 값을 읽고, 값이 없으면 게이트를 죽인다.
window.__ballProbe = stage.ballProbe;
window.__stageProbe = stage.stageProbe;
window.__shadowRect = stage.shadowRect;
window.__shadowPair = stage.shadowPair;
window.__goalFrame = stage.goalFrame;
window.__ballPos = stage.ballPos;
// 화면 한 점의 임자를 되묻는 훅. 어느 면이 그 화소를 차지했는지 모르면
// 화면이 죽었다는 말은 고칠 대상을 가리키지 못한다.
window.__pick = (nx, ny) => stage.ballProbe.pickAt(nx, ny);
const bgm = mountBgm();
// 선언값은 증거가 아니다. 게이트가 실제 베드 음량을 읽을 수 있어야 한다.
window.__bgm = bgm;

// 재현되지 않는 캐프처는 증거가 아니다. ?seed= 가 있으면 그 씨드로 고정한다.
const seedParam = new URLSearchParams(location.search).get('seed');
const rng = makeRng(seedParam === null ? ((Date.now() ^ 0x9e3779b9) >>> 0) : (Number(seedParam) >>> 0));
const saved = load();
const state = { keeper: Object.assign(newKeeper(), saved?.keeper || null), shots: [], i: 0, results: [], phase: 'idle', auto: Boolean(saved?.auto), points: 0 };
// 비운 시간은 훈련 선택권으로만 바뀌고, 그 선택은 손으로 한다.
// 이전 배포본 세이브에는 points가 없다. 없으면 0으로 읽고 게임은 그대로 이어진다.
state.points = (Number(saved?.points) || 0) + (saved ? offlineGain(saved.at, Date.now()) : 0);
// 아웃문그램 팔로워. 의사소통과 악동이 여기서 값을 낸다.
state.fans = Number(saved?.fans) || 0;
// 지갑은 두 갈래로 읽는다. 이전 배포본 저장에는 지갑이 없고, 그때 둘 다 0에서 시작한다.
state.wallet = readWallet(saved?.wallet);
window.__points = () => state.points;
// 두 갈래가 각각 어떻게 움직였는지 게이트가 직접 읽어야 한다. 화면 글자는 증거가 아니다.
window.__wallet = () => state.wallet;
// 사고 연출은 확률로만 나오므로 계측기가 불러낼 수 있어야 한다. 판정은 안 바뀐다.
window.__act = (kind) => stage.act(kind);
// 선언값은 증거가 아니다. 게이트가 실제 파형을 재려면 발화를 불러낼 수 있어야 한다.
window.__sfx = stage.sfx;
// 정지가 정말 정지인지 재려면 세계시계를 밖에서 읽을 수 있어야 한다.
window.__now = () => stage.now();
// 강제 재생 훅은 라운드 대기 타이머와 경쟁한다. 잠그지 않으면 타이머가 터져
// 자기 shot으로 덮어쓰고, 지정한 조준점이 무시된 것처럼 보인다.
// 실측: aimX 2.1을 넣었는데 비행 궤적이 aimX 0.72로 읽혔다.
// 'demo'는 commit이 요구하는 'wait'가 아니므로 그 경로가 통째로 막힌다.
window.__lockRound = () => { stage.cancel(timer); state.phase = 'demo'; return state.phase; };
// 잠근 판을 다시 굴린다. 하네스가 연출 구간을 끼워 넣고 이어서 촬영하려면 되돌릴 길이 있어야 한다.
window.__resumeRound = () => { state.phase = 'idle'; nextSet(); return state.phase; };
// 불러오기는 판이 시작되기 전에 끝난다. 첨 판을 기다려 그리면 그 사이에 숫자가 없다.

// 손가락 셋. 방향과 타이밍과 나갈지 여부.
// 여기서 나온 실패는 손가락 셋으로 귀속하고 스탯 원장에 섞지 않는다.
let pressAt = 0;
let advance = 0;
let timer = 0;
// 직전 예고 한 줄만 기억한다. 사람이 반복을 느끼는 단위가 직전 한 구다.
let lastAim = null;
// 세트 요약은 몇 분에 한 번 나온다. 그 사이 자막이 다 지나가도 사람은 이 줄끼리만 비교한다.
let lastSetEnd = null;

function say(line, cause) {
  // 매 줄이 새 요소여야 등장 애니메이션이 다시 돈다. 같은 노드에 글자만 갈면 조용히 바뀐다.
  el('caption').innerHTML = (cause ? '<b>' + (CAUSE_LABEL[cause] || cause) + '</b>' : '')
    + '<span>' + line + '</span>';
}

function pips() {
  el('pips').innerHTML = state.shots.map((_, i) => {
    const r = state.results[i];
    // 지금 굴리는 칸을 표시한다. 결과를 미리 칠하면 자막이 뒤집을 것을 먼저 말해버린다.
    const cls = r === undefined ? (i === state.i ? 'now' : '') : r ? 'gone' : 'save';
    return '<i class=\"' + cls + '\"></i>';
  }).join('');
  el('lv').textContent = 'Lv ' + state.keeper.level;
  el('fans').innerHTML = '아웃문그램 <b>' + state.fans.toLocaleString() + '</b>';
  // 코인과 캐시를 같은 줄에 붙여 둔다. 잔고가 하나로 보이면 상점에서 무엇으로 사는지가 새 정보가 된다.
  el('purse').innerHTML = '코인 <b>' + state.wallet.coin.toLocaleString() + '</b> 캐시 <i>'
    + state.wallet.cash.toLocaleString() + '</i>';
  // 남은 훈련 횟수는 버튼 위에 붙는다. 열어봐야 아는 숫자는 방치형에서 안 열린다.
  const badge = el('gymDot');
  badge.textContent = state.points > 9 ? '9+' : String(state.points);
  badge.hidden = state.points <= 0;
}

function setPad(on) {
  for (const b of document.querySelectorAll('.zone')) b.disabled = !on;
}

// 타이밍 자. 맞는 구간의 자리와 폭은 그 구의 비행시간이 정한다.
// 판정에 쓰는 값을 그대로 그리는 것이므로 여기서 새 규칙이 생기지 않는다.
function beatStart(shot) {
  const b = el('beat');
  const span = shot.flight * 1000 + 900;
  const center = (shot.flight * 720) / span;
  const width = 240 / span;
  b.hidden = false;
  b.classList.remove('hit');
  b.style.setProperty('--beat', span.toFixed(0) + 'ms');
  const lane = b.querySelector('.lane');
  lane.style.setProperty('--hot-l', ((center - width / 2) * 100).toFixed(2) + '%');
  lane.style.setProperty('--hot-w', (width * 100).toFixed(2) + '%');
  // 같은 노드에 시간만 갈면 애니메이션이 다시 돌지 않는다. 자막과 같은 이유다.
  const run = document.createElement('i');
  run.className = 'run';
  lane.querySelector('.run').replaceWith(run);
}

// 손가락이 친 자리에 바늘을 세워둔다. 어디서 눌렀는지가 남아야 다음 구에서 고칠 데가 보인다.
function beatStop(byHand) {
  const b = el('beat');
  if (!byHand) { b.hidden = true; return; }
  b.classList.add('hit');
  stage.after(0.8, () => { b.hidden = true; });
}

function nextSet() {
  // 기복은 판당 한 번 굴러서 그 판 내내 같은 값으로 선다.
  const form = rollForm(state.keeper, rng);
  el('form').textContent = form > 0.4 ? '오늘 몸 좋다' : form < -0.4 ? '오늘 몸 무겁다' : '';
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
  // 자막 종료 시점의 pips()는 state.i가 오르기 전에 돌아서 마커가 한 칸 뒤에 남는다.
  pips();
  setPad(true);
  beatStart(shot);
  stage.reset();
  pressAt = performance.now() + shot.flight * 1000 * 0.72;
  lastAim = aimLine(shot.kicker, rng, lastAim);
  say(lastAim, null);
  // 창이 닫히면 손가락 대신 자동 입력이 친다. 늦은 만큼은 스탯이 아니라 손가락 탓이다.
  stage.cancel(timer);
  // 자동은 손가락만 대신한다. 공은 같은 시간을 날고 대기시간은 그대로다.
  const wait = state.auto ? Math.max(0, pressAt - performance.now()) : shot.flight * 1000 + 900;
  timer = stage.after(wait / 1000, () => { if (state.phase === 'wait') commit(null); });
}

function commit(dive) {
  if (state.phase !== 'wait') return;
  state.phase = 'flying';
  stage.cancel(timer);
  setPad(false);
  beatStop(dive !== null);
  const shot = state.shots[state.i];
  const input = dive === null
    ? autoInput(state.keeper, shot, rng)
    : { dive, errMs: performance.now() - pressAt, advance, auto: false };
  stage.diving = state.keeper.diving;
  const result = resolve({ keeper: state.keeper, shot, rng, input });
  state.results[state.i] = result.conceded;
  // 비행 중에는 자막을 비운다. 자리표시자를 남기면 화면 위쪽에 말줄임표가 박힌 채 촬영된다.
  el('caption').innerHTML = '';
  stage.play(shot, input, result, () => rollCaptions(result));
}

// 자막은 체인 순서대로 한 줄씩 나온다. 반전이 반전을 덮으려면 한꺼번에 오면 안 된다.
function rollCaptions(result) {
  const lines = result.events.slice();
  state.phase = 'caption';
  // 같은 사건이 두 구 연속 같은 문장으로 나오면 굴림이 아니라 상수로 읽힌다.
  let lastCap = null;
  // reboundMiss는 누워서와 서서 두 자리에서 cause 없이 나온다. 문맥으로만 갈린다.
  const ctx = { downed: false };
  const step = () => {
    const e = lines.shift();
    if (!e) {
      state.skip = null;
      // 팔로워는 구마다 오른다. 먹혀도 오르고, 막으면 더 오른다.
      const gain = followerGain(state.keeper, result);
      state.fans += gain;
      // 코인은 구마다 들어온다. 먹혀도 들어오고, 막으면 더 들어온다.
      state.wallet.coin += coinGain(result.conceded);
      pips();
      state.i += 1;
      restart(result);
      return;
    }
    const line = eventLine(e, rng, lastCap, ctx);
    lastCap = line;
    if (e.t === 'downed') ctx.downed = true;
    say(line, e.cause);
    // 자막이 말한 사건을 화면도 같이 연기한다. 결과는 이미 확정됐고 여기서 바뀌지 않는다.
    if (e.t !== 'result') stage.act(e.t);
    stage.cancel(timer);
    timer = stage.after(e.t === 'result' ? 0.9 : 0.85, step);
    // 자막을 밀어놓는 것은 손가락이다. 스택으로 살 수 있는 것은 공이 다시 놀이는 시간뿐이다.
    state.skip = () => { stage.cancel(timer); step(); };
  };
  step();
}

// 공을 다시 세우는 시간. 스로잉과 골킥이 이 초를 줄이고, 줄어드는 것이 화면에 보여야 선택이 선택이 된다.
function countdown(sec, label, then) {
  // 실시간이 아니라 세계시간으로 센다. 히트스톱이 걸린 동안에도 초가 흐르면
  // 화면은 멈췄는데 숫자만 혼자 가고, 정지 프레임 두 장이 그 숫자 하나로 갈린다.
  const until = stage.now() + sec;
  // 공을 다시 세우는 몇 초가 통째로 무음이었다. 키퍼는 그동안 공을 바닥에 튀기고 있다.
  // 간격을 고정하면 메트로놈이 되어 사람 손이 아니라 기계로 들린다.
  let bounce = stage.now() + 0.38;
  // 자막은 세로 flex다. 라벨과 숫자를 형제로 넣으면 두 칸으로 갈리고, column-reverse라
  // 숫자가 실점 원인 배지 자리로 올라간다. 한 span 안에 넣어 한 줄로 붙인다.
  // 구조는 한 번만 만들고 숫자만 간다. 매 틱 새 span이면 등장 애니메이션이 0.1초마다 다시 돈다.
  el('caption').innerHTML = '<span>' + label + ' <b class="tick"></b></span>';
  const tickEl = el('caption').querySelector('.tick');
  const tick = () => {
    const now = stage.now();
    const left = until - now;
    if (left <= 0) { el('caption').textContent = ''; then(); return; }
    if (now >= bounce && left > 0.45) { stage.sfx.dribble(); bounce = now + 0.62 + Math.random() * 0.36; }
    tickEl.textContent = left.toFixed(1) + 's';
    timer = stage.after(0.1, tick);
  };
  tick();
}

function restart(result) {
  save(state.keeper, state.auto, state.fans, state.points, state.wallet);
  const hand = ballInHand(result);
  countdown(restartDelay(state.keeper, result), hand ? '공 던져주는 중' : '골킥 차주는 중', nextShot);
}

function endSet() {
  const conceded = state.results.filter(Boolean).length;
  // 세트 사이에 다른 자막이 끼어도 사람은 이 줄만 이어서 기억한다. 직전 요약을 따로 들고 금지한다.
  lastSetEnd = setEndLine(5 - conceded, rng, lastSetEnd);
  say(lastSetEnd, null);
  // 판이 끝나면 레벨이 오르고 훈련 한 번이 쌓인다. 쓰는 시점은 손이 정한다.
  // 자동 팝업이 없으므로 전 스탯 만렙이어도 다음 판이 그대로 온다.
  state.keeper.level += 1;
  state.points += 1;
  save(state.keeper, state.auto, state.fans, state.points, state.wallet);
  pips();
  timer = stage.after(0.9, () => countdown(setBreak(), '한숨 돌리는 중', nextSet));
}

// 훈련장. 열고 닫는 것은 손이고, 열려 있는 동안에도 판은 돈다.
// 포인트가 0이어도 열린다. 그때는 내 스탯을 보는 창이다.
function renderGym() {
  const box = el('gym');
  const head = state.points > 0 ? '훈련장 · 남은 훈련 ' + state.points + '회' : '훈련장 · 밀린 훈련 없다';
  box.innerHTML = '<h4>' + head + '</h4><div class=\"row\">' + GROWABLE.map((k) => {
    const v = state.keeper[k];
    // 10은 성장 상한이다. 상한에 닿은 칸을 눌리게 두면 포인트만 사라진다.
    const off = v >= 10 || state.points <= 0;
    const tail = v >= 10 ? 'MAX' : v + ' → ' + (v + 1);
    return '<button data-k=\"' + k + '\"' + (off ? ' disabled' : '') + '>' + CAUSE_LABEL[k] + '<em>' + tail + '</em></button>';
  }).join('') + '</div><button class=\"close\">닫기</button>';
  box.querySelector('.close').onclick = closeGym;
  for (const b of box.querySelectorAll('.row button')) {
    b.onclick = () => {
      if (b.disabled || state.points <= 0) return;
      // 프로의식은 히든이다. 숫자는 안 보이고 가끔 두 칸이 오른다.
      state.keeper[b.dataset.k] += growthGain(state.keeper, rng);
      state.points -= 1;
      save(state.keeper, state.auto, state.fans, state.points, state.wallet);
      stage.setKeeper(state.keeper);
      pips();
      renderGym();
    };
  }
}

function openGym() {
  el('gym').hidden = false;
  renderGym();
}

function closeGym() {
  el('gym').hidden = true;
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
  save(state.keeper, state.auto, state.fans, state.points, state.wallet);
};
el('gymBtn').onpointerdown = (e) => {
  e.stopPropagation();
  if (el('gym').hidden) openGym(); else closeGym();
};

// 소리. 끌 수 없는 소리는 소리가 아니라 사고다.
// 음소거는 음량을 건드리지 않는다. 둘을 섞어버리면 한 번 누른 사람은 다시 켜도 무음으로 남는다.
const MUTE_KEY = 'gtg.muted';
const muteBtn = el('mute');
function setMuted(on) {
  bgm.muted = on;
  stage.sfx.muted = on;
  muteBtn.setAttribute('aria-pressed', String(on));
  muteBtn.setAttribute('aria-label', on ? '소리 켜기' : '소리 끄기');
  localStorage.setItem(MUTE_KEY, on ? '1' : '0');
}
setMuted(localStorage.getItem(MUTE_KEY) === '1');
muteBtn.onpointerdown = (e) => {
  e.stopPropagation();
  setMuted(muteBtn.getAttribute('aria-pressed') !== 'true');
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
  stage.leaveTitle();
  stage.setKeeper(state.keeper);
  // 밀린 훈련이 있어도 공부터 온다. 쓸지 말지는 훈련장 버튼이 들고 있다.
  nextSet();
});
