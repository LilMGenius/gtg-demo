// 화면 조립. 판정은 chain.mjs가 하고 이 파일은 입력과 자막만 옮긴다.
import { makeRng, buildSet, resolve, newKeeper, keeperFromRoster, autoInput, rollForm, ballInHand, restartDelay, setBreak, growthGain, followerGain } from '../../src/chain.mjs';
import { CAUSE_LABEL, GROWABLE, HIDDEN } from '../../src/ledger.mjs';
import { KEEPERS, keeperCost, TRAITS, PULL_COST, pullWeight, pullFrom } from '../../src/roster.mjs';
import { createScene } from './render/scene.mjs';
import { mountBgm } from './audio/bgm.mjs';
import { mountTitle } from './ui/title.mjs';
import { aimLine } from './ui/callout.mjs';
import { eventLine, setEndLine, postLine } from './ui/lines.mjs';
import { load, save, readSquad, offlineGain, readRecord } from './state/save.mjs';
import { coinGain, readWallet, COIN_DRILL, COIN_SAVE, COIN_CONCEDED, COIN_FAME_STEP } from './state/wallet.mjs';
import { BOTS, BOT_CAP, readBot, botAt, botKeeper } from './state/bot.mjs';
import { GLOVES, MAX_GRIP, BOOTS, MAX_STUD, KITS, MAX_KIT, SOCKS, MAX_SOCK, GOALS, MAX_FRAME, CITIES, MAX_CITY, HAIRS, MAX_HAIR, TATTOOS, MAX_INK, readGear, gloveAt, bootAt, kitAt, sockAt, frameAt, cityAt, hairAt, inkAt, lookOf, lookBoost } from './state/gear.mjs';
import { BUFFS, BUFF_CAP, readBuff, buffAt, addBuff, spendBuff } from './state/buff.mjs';
import { readRapport, addRapport, rapportCount, rapportTier, rapportGazeAid, rapportBoost } from './state/rapport.mjs';
import { passerName } from './state/passer.mjs';
import { DATE_COST, MOVES, dateOdds, dateOutcome, applyDate, dateGate } from './state/date.mjs';
import { applyPreset } from './state/inject.mjs';

const el = (id) => document.getElementById(id);
const stage = createScene(el('stage'));
// 계측 훅. 플레이테스트가 이 값을 읽고, 값이 없으면 게이트를 죽인다.
window.__ballProbe = stage.ballProbe;
window.__stageProbe = stage.stageProbe;
window.__shadowRect = stage.shadowRect;
window.__shadowPair = stage.shadowPair;
window.__goalFrame = stage.goalFrame;
// 골대 실물 형상. 판정이 쓰는 폭과 높이를 그림이 지키는지는 화면 밖에서 물어야 잡힌다.
window.__goalShape = stage.goalShape;
// 동네 등급별 행인 수. 인자를 주면 그 등급으로 바꾸고 센다.
window.__crowd = stage.crowd;
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
const restored = readSquad(saved);
// 이전 배포본 저장에는 없던 칸이 있다. 신인 위에 덮어 읽어야 그 칸이 0이 아닌 3에서 시작한다.
const squad = (restored.squad.length ? restored.squad : [null]).map((k) => {
  const one = Object.assign(newKeeper(), k || null);
  if (!one.name) one.name = '무명';
  if (!Array.isArray(one.traits)) one.traits = [];
  return one;
});
// state.keeper와 state.squad[state.pick]은 같은 객체다. 값을 복사하면 성장이 보유 목록에 안 남는다.
const state = { squad, pick: Math.min(restored.pick, squad.length - 1), shots: [], i: 0, results: [], phase: 'idle', auto: Boolean(saved?.auto), points: 0 };
state.keeper = state.squad[state.pick];
// 비운 시간은 훈련 선택권으로만 바뀌고, 그 선택은 손으로 한다.
// 이전 배포본 세이브에는 points가 없다. 없으면 0으로 읽고 게임은 그대로 이어진다.
state.points = (Number(saved?.points) || 0) + (saved ? offlineGain(saved.at, Date.now()) : 0);
// 아웃문그램 팔로워. 의사소통과 악동이 여기서 값을 낸다.
state.fans = Number(saved?.fans) || 0;
// 게시물은 한 화면 분량만 남긴다. 12장은 패널 스크롤 한 번에 끝나는 길이다.
state.posts = Array.isArray(saved?.posts) ? saved.posts.slice(-12) : [];
// 지갑은 두 갈래로 읽는다. 이전 배포본 저장에는 지갑이 없고, 그때 둘 다 0에서 시작한다.
state.wallet = readWallet(saved?.wallet);
// 상대 전적. 키커 이름을 열쇠로 막은 수와 먹힌 수를 따로 센다.
state.record = readRecord(saved);
// 장비. 상점에서 산 장갑 등급이 여기 남고 판정식에 그대로 들어간다.
state.gear = readGear(saved?.gear);
// 봇. 시간제 크레딧이라 남은 밀리초가 저장에 남는다.
state.bot = readBot(saved?.bot);
// 버프. 시간이 아니라 구로 닳는다. 탭을 닫아도 남은 구는 그대로 이어진다.
state.buff = readBuff(saved?.buff);
// 라포. 도시별 행인 인덱스마다 마주친 횟수가 저장에 남는다.
state.rapport = readRapport(saved?.rapport);
// 게이트 표본 주입. 모든 read가 끝난 뒤라야 저장에서 올라온 값을 덮어쓴다.
// 자동 판정보다는 앞이어야 주입된 지갑이 그 판정에 반영된다.
window.__preset = applyPreset(new URLSearchParams(location.search).get('preset'), state);
// 크레딧 없이 켜진 자동은 공짜 봇이다. 저장에서 올라온 자동은 크레딧이 있을 때만 산다.
if (state.bot.ms <= 0) state.auto = false;
window.__points = () => state.points;
// 두 갈래가 각각 어떻게 움직였는지 게이트가 직접 읽어야 한다. 화면 글자는 증거가 아니다.
window.__wallet = () => state.wallet;
// 버프가 몇 구 남아 판정에 들어갔는지도 상태로 재야 한다. 배지 숫자는 증거가 아니다.
window.__buff = () => state.buff;
// 장비가 판정에 실제로 들어갔는지는 화면 글자가 아니라 상태로 재야 한다.
window.__gear = () => state.gear;
// 봇이 실제로 섰는지는 자막이 아니라 상태로만 확인된다.
window.__bot = () => state.bot;
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

/* 상단 세 칸은 문장이 아니라 값이다. '아웃문그램 1,200'처럼 이름을 매번 읽히면
   글자 폭이 숫자를 밀어내고, 한 판에 수십 번 지나가는 자리라 이름은 첫 회에만 새 정보다.
   3px 격자 픽셀 SVG는 #pad와 우측 기둥이 이미 쓰는 관례라 손그림 톤이 안 갈린다. */
const G = (t, body) => '<svg viewBox="0 0 24 24" fill="currentColor" shape-rendering="crispEdges"'
  + ' role="img" aria-label="' + t + '"><title>' + t + '</title>' + body + '</svg>';
const R = (x, y, w, h) => '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '"/>';
// 팔로워. 이름 대신 사람 하나를 세운다. Outmoongram이라는 이름은 관리창 안에서만 쓴다.
const IC_FANS = G('팔로워', R(9, 3, 6, 6) + R(6, 12, 12, 3) + R(3, 15, 18, 6));
// 땀. 시간으로 버는 재화라 땀방울이다. 뾰족한 위와 둥근 아래라 별 실루엣과 안 겹친다.
const IC_SWEAT = G('땀', R(10.5, 3, 3, 3) + R(7.5, 6, 9, 3) + R(6, 9, 12, 3) + R(4.5, 12, 15, 3)
  + R(4.5, 15, 15, 3) + R(6, 18, 12, 3) + R(7.5, 21, 9, 3));
// 스폰. 결제로만 들어오는 재화다. 별은 어느 게임에서든 유료 갈래로 읽힌다.
const IC_SPON = G('스폰', R(10.5, 3, 3, 3) + R(9, 6, 6, 3) + R(0, 9, 24, 3) + R(4.5, 12, 15, 3)
  + R(6, 15, 12, 3) + R(4.5, 18, 6, 3) + R(13.5, 18, 6, 3));
// 기복. 화살표 하나면 오늘 컨디션이 어느 쪽인지가 문장 없이 선다.
const IC_UP = G('컨디션 좋음', R(10.5, 3, 3, 3) + R(7.5, 6, 9, 3) + R(4.5, 9, 15, 3) + R(9, 12, 6, 12));
const IC_DOWN = G('컨디션 나쁨', R(9, 0, 6, 12) + R(4.5, 12, 15, 3) + R(7.5, 15, 9, 3) + R(10.5, 18, 3, 3));
// 버프. 목이 좁고 배가 넓은 병 하나면 마시는 물건인 것이 문장 없이 선다.
const IC_BUFF = G('버프', R(9, 0, 6, 3) + R(9, 3, 6, 3) + R(6, 6, 12, 3) + R(4.5, 9, 15, 12)
  + R(6, 21, 12, 3));

function pips() {
  el('pips').innerHTML = state.shots.map((_, i) => {
    const r = state.results[i];
    // 지금 굴리는 칸을 표시한다. 결과를 미리 칠하면 자막이 뒤집을 것을 먼저 말해버린다.
    const cls = r === undefined ? (i === state.i ? 'now' : '') : r ? 'gone' : 'save';
    return '<i class=\"' + cls + '\"></i>';
  }).join('');
  el('lv').textContent = 'Lv ' + state.keeper.level;
  el('fans').innerHTML = IC_FANS + '<b>' + state.fans.toLocaleString() + '</b>';
  // 땀과 스폰은 갈래가 다른 잔고다. 붙여 두면 한 줄의 숫자 띠로 읽혀 어느 것으로 사는지가
  // 상점을 열어야 아는 정보가 된다. 팔로워와 지갑을 가르는 것과 같은 세로선으로 둘을 가른다.
  el('purse').innerHTML = '<span class="cur">' + IC_SWEAT + '<b>' + state.wallet.coin.toLocaleString() + '</b></span>'
    + '<span class="cur">' + IC_SPON + '<i>' + state.wallet.cash.toLocaleString() + '</i></span>'
    // 남은 버프도 같은 줄에 선다. 몇 판 뒤에 꺼지는지를 상점을 열어야 알면 계획이 안 선다.
    + (state.buff.shots > 0 ? '<span class="cur">' + IC_BUFF + '<u>' + state.buff.shots + '</u></span>' : '');
  // 남은 훈련 횟수는 버튼 위에 붙는다. 열어봐야 아는 숫자는 방치형에서 안 열린다.
  const badge = el('gymDot');
  badge.textContent = state.points > 9 ? '9+' : String(state.points);
  badge.hidden = state.points <= 0;
  // 봇에 남은 분도 버튼 위에 붙는다. 언제 꺼지는지를 상점을 열어야 알면 방치형에서 안 열린다.
  const clone = el('autoDot');
  const left = Math.ceil(state.bot.ms / 60000);
  clone.textContent = left > 9 ? '9+' : String(left);
  clone.hidden = left <= 0;
}

function setPad(on) {
  for (const b of document.querySelectorAll('.zone')) b.disabled = !on;
}

// 저장은 항상 보유 목록 전체로 나간다. 뛰는 키퍼만 저장하면 나머지가 다음 저장에서 지워진다.
function persist() {
  save(state.squad, state.pick, state.auto, state.fans, state.points, state.wallet, state.posts, state.record, state.gear, state.bot, state.buff, state.rapport);
}

// 봇 크레딧은 실시간으로 줄어든다. 구 수로 세면 탭을 열어두고 안 누르는 쪽이 이득이 된다.
let botStamp = performance.now();
function botTick() {
  const now = performance.now();
  const dt = now - botStamp;
  botStamp = now;
  if (!state.auto || state.bot.ms <= 0) return;
  state.bot.ms = Math.max(0, state.bot.ms - dt);
  if (state.bot.ms > 0) return;
  // 크레딧이 끝나면 자동도 같이 꺼진다. 켜둔 채로 두면 봇 없는 자동이 공짜가 된다.
  state.bot.tier = 0;
  state.auto = false;
  autoBtn.classList.remove('on');
  persist();
  pips();
}

// 한 구가 끝날 때마다 그 키커 칸에 한 줄을 더한다.
// 세트가 끝날 때 몰아 세면 중간에 탭을 닫은 구가 통째로 빠진다.
function tally(name, conceded) {
  if (!name) return;
  const row = state.record[name] || (state.record[name] = { saved: 0, conceded: 0 });
  if (conceded) row.conceded += 1;
  else row.saved += 1;
}

// 이번 구에 들어온 땀을 잔고 옆에 한 번 띄운다.
// 총액만 갱신하면 유명한 키커를 막아 더 벌었다는 사실이 화면에 남지 않는다.
// pips()가 지갑 칸을 통째로 다시 그리므로 반드시 그 뒤에 붙인다.
function coinPop(n) {
  const host = el('purse');
  const old = host.querySelector('.pop');
  if (old) old.remove();
  const s = document.createElement('span');
  s.className = 'pop';
  s.textContent = '+' + n;
  host.appendChild(s);
  // 애니메이션이 끝난 노드를 남기면 다음 구의 등장이 이미 끝난 상태에서 시작한다.
  s.addEventListener('animationend', () => s.remove());
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
  el('form').innerHTML = form > 0.4 ? '<span class="up">' + IC_UP + '</span>'
    : form < -0.4 ? '<span class="dn">' + IC_DOWN + '</span>' : '';
  state.shots = buildSet(rng, state.keeper.level, state.gear.city);
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
  // 봇이 섰는지는 크레딧을 깎기 전에 정한다. 깎고 나서 재면 마지막 구가 사람으로 잡힌다.
  const ran = dive === null && state.auto && state.bot.ms > 0;
  state.botRan = ran;
  botTick();
  // 버프는 실제로 굴린 구에서만 닳는다. 시간으로 닳으면 상점에 둔 채로 증발한다.
  state.buff = spendBuff(state.buff);
  const input = dive === null
    ? autoInput(ran ? botKeeper(state.keeper, state.bot) : state.keeper, shot, rng)
    : { dive, errMs: performance.now() - pressAt, advance, auto: false };
  stage.diving = state.keeper.diving;
  const result = resolve({ keeper: state.keeper, shot, rng, input, grip: state.gear.grip, studs: state.gear.studs, pads: state.gear.pads, socks: state.gear.socks, frame: state.gear.frame, focusAid: state.buff.kind === 'tonic' ? 0.5 : 1, rosin: state.buff.kind === 'rosin', gazeAid: rapportGazeAid(state.rapport, state.gear.city, shot.passer) });
  state.results[state.i] = result.conceded;
  // 판정 결과에는 키커 이름이 없다. 장부는 이 자리에서만 이름을 알 수 있다.
  tally(shot.kicker.name, result.conceded);
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
      // 봇이 뛴 구는 사고가 안 나서 아무도 안 본다. 성장은 남고 화제만 안 남는다.
      const gain = state.botRan ? 0 : followerGain(state.keeper, result, state.gear.city, lookBoost(state.gear), state.buff.kind === 'hype' ? 1.5 : 1, rapportBoost(state.rapport, state.gear.city, state.shots[state.i].passer));
      state.fans += gain;
      // 라포는 말을 섞은 구에서만 쌓인다. 스쳐 지나간 얼굴은 다음에도 남이다.
      // 봇이 뛴 구는 팔로워와 같은 규칙으로 0이다. 봇이 서 있었으니 얼굴이 익을 리 없다.
      if (!state.botRan && result.events.some((e) => e.t === 'talked')) state.rapport = addRapport(state.rapport, state.gear.city, state.shots[state.i].passer);
      // 땀은 구마다 들어온다. 먹혀도 들어오고, 막으면 더 들어온다.
      // 유명한 키커를 막을수록 더 들어온다. 팔로워와 같은 fame 값을 쓴다.
      const coin = coinGain(result.conceded, result.fame);
      state.wallet.coin += coin;
      // 구가 끝나면 계정에 한 장 올라간다. 먹힌 구에도 올라가야 성적표가 아니라 사람으로 읽힌다.
      // 이름은 state.i를 올리기 전에 읽는다. result에는 키커 이름이 없다.
      const who = state.shots[state.i].kicker.name;
      state.posts.push({ n: who, c: result.conceded, g: gain, t: postLine(who, result.conceded, rng) });
      if (state.posts.length > 12) state.posts.shift();
      pips();
      coinPop(coin);
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
  persist();
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
  persist();
  pips();
  timer = stage.after(0.9, () => countdown(setBreak(), '한숨 돌리는 중', nextSet));
}

// 훈련장. 열고 닫는 것은 손이고, 열려 있는 동안에도 판은 돈다.
// 포인트가 0이어도 열린다. 그때는 내 스탯을 보는 창이다.
function renderGym() {
  const box = el('gym');
  // 성장 칸이 전부 상한이면 훈련은 더 쌓여도 쓸 곳이 없다. 그때만 환전 줄이 열린다.
  const maxed = GROWABLE.every((k) => state.keeper[k] >= 10);
  const head = state.points > 0 ? '훈련장 · 남은 훈련 ' + state.points + '회' : '훈련장 · 밀린 훈련 없다';
  // 못 누르는 버튼도 사유를 글자로 들고 있다. 빈 자리는 왜 못 쓰는지를 말하지 않는다.
  const swap = maxed
    ? '<button class="swap"' + (state.points <= 0 ? ' disabled' : '') + '>'
      + (state.points > 0 ? '남은 훈련 ' + state.points + '회를 땀 ' + state.points * COIN_DRILL + '으로' : '바꿀 훈련이 없다')
      + '</button>'
    : '';
  box.innerHTML = '<h4>' + head + '</h4><div class="row">' + GROWABLE.map((k) => {
    const v = state.keeper[k];
    // 10은 성장 상한이다. 상한에 닿은 칸을 눌리게 두면 포인트만 사라진다.
    const off = v >= 10 || state.points <= 0;
    const tail = v >= 10 ? 'MAX' : v + ' → ' + (v + 1);
    return '<button data-k="' + k + '"' + (off ? ' disabled' : '') + '>' + CAUSE_LABEL[k] + '<em>' + tail + '</em></button>';
  }).join('') + '</div>' + swap + '<button class="close">닫기</button>';
  box.querySelector('.close').onclick = closeGym;
  const sw = box.querySelector('.swap');
  if (sw) sw.onclick = () => {
    if (state.points <= 0) return;
    state.wallet.coin += state.points * COIN_DRILL;
    state.points = 0;
    persist();
    pips();
    renderGym();
  };
  for (const b of box.querySelectorAll('.row button')) {
    b.onclick = () => {
      if (b.disabled || state.points <= 0) return;
      // 프로의식은 히든이다. 숫자는 안 보이고 가끔 두 칸이 오른다.
      state.keeper[b.dataset.k] += growthGain(state.keeper, rng);
      state.points -= 1;
      persist();
      stage.setKeeper(state.keeper, lookOf(state.gear));
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

// 선수단. 명단 전체를 걸어놓고 보유한 것만 뛸 수 있다.
// 보유 판정은 이름으로 한다. 로스터 항목과 저장된 키퍼는 다른 객체이기 때문이다.
function renderRoster() {
  const box = el('roster');
  const here = state.squad[state.pick];
  const cards = KEEPERS.map((entry) => {
    const owned = state.squad.some((k) => k.name === entry.name);
    const now = here && here.name === entry.name;
    const cost = keeperCost(entry);
    let tail = '';
    let off = false;
    let cls = '';
    if (now) {
      tail = '출전 중';
      off = true;
      cls = ' class="here"';
    } else if (owned) {
      tail = '교체';
    } else {
      tail = cost + ' 땀';
      off = state.wallet.coin < cost;
    }
    return '<button data-n="' + entry.name + '"' + cls + (off ? ' disabled' : '') + '>' + entry.name + '<em>' + tail + '</em></button>';
  }).join('');
  box.innerHTML = '<h4>선수단 · 보유 ' + state.squad.length + '명</h4><div class="row">' + cards + '</div><button class="close">닫기</button>';
  box.querySelector('.close').onclick = closeRoster;
  for (const b of box.querySelectorAll('.row button')) {
    b.onclick = () => {
      if (b.disabled) return;
      const name = b.dataset.n;
      let at = state.squad.findIndex((k) => k.name === name);
      if (at < 0) {
        const entry = KEEPERS.find((k) => k.name === name);
        const cost = keeperCost(entry);
        if (state.wallet.coin < cost) return;
        state.wallet.coin -= cost;
        state.squad.push(keeperFromRoster(entry));
        at = state.squad.length - 1;
      }
      // 참조 재대입이다. 값을 복사하면 훈련이 보유 목록에 안 남는다.
      state.pick = at;
      state.keeper = state.squad[at];
      stage.setKeeper(state.keeper, lookOf(state.gear));
      persist();
      pips();
      renderRoster();
    };
  }
}

function openRoster() {
  el('roster').hidden = false;
  renderRoster();
}

function closeRoster() {
  el('roster').hidden = true;
}

// 아웃문그램. 구가 끝날 때마다 쌓인 글을 최신 순으로 건다.
function renderGram() {
  const box = el('gram');
  // 문장 안에 이미 상대 이름이 박혀 있다. 앞에 한 번 더 걸면 같은 이름이 두 번 읽힌다.
  const feed = state.posts.length
    ? state.posts.slice().reverse().map((p) => `<div class="post${p.c ? ' bad' : ''}"><span>${p.t.replace(p.n, `<b>${p.n}</b>`)}</span><i>${IC_FANS} +${p.g}</i></div>`).join('')
    : '<div class="post empty"><span>아직 올린 글이 없다. 한 구 막고 오면 생긴다</span></div>';
  box.innerHTML = `<h4>Outmoongram</h4><div class="feed">${feed}</div><button class="close">닫기</button>`;
  box.querySelector('.close').onclick = closeGram;
}

function openGram() {
  el('gram').hidden = false;
  renderGram();
}

// 재화를 눌렀을 때 여는 창. 파는 곳이 아니라 버는 곳이다.
// 값은 원장에서 그대로 읽는다. 여기에 숫자를 다시 적으면 원장이 바뀐 날 화면이 거짓말을 한다.
function renderEarn() {
  const box = el('earn');
  const top = COIN_SAVE + COIN_FAME_STEP * 9;
  const ways = [
    [IC_SWEAT, '막으면 ' + COIN_SAVE, '유명한 키커일수록 더 준다. 명단 최상급을 막으면 ' + top + '이다'],
    [IC_SWEAT, '먹혀도 ' + COIN_CONCEDED, '못 막는 날에도 진행이 멈추지 않는다'],
    [IC_SWEAT, '훈련 대신 ' + COIN_DRILL, '올릴 칸이 없을 때 훈련 한 회를 이 값으로 바꿔 받는다'],
    [IC_SPON, '스폰은 결제로만', '결제 경로는 아직 안 열렸다. 지금은 저장 자리만 지킨다']
  ];
  const rows = ways.map((w) => '<div class="way">' + w[0] + '<b>' + w[1] + '</b><i>' + w[2] + '</i></div>').join('');
  box.innerHTML = '<h4>버는 법</h4><div class="ways">' + rows + '</div><button class="close">닫기</button>';
  box.querySelector('.close').onclick = closeEarn;
}

function openEarn() {
  el('earn').hidden = false;
  renderEarn();
}

function closeEarn() {
  el('earn').hidden = true;
}

function closeGram() {
  el('gram').hidden = true;
}

// 히든 둘은 숫자가 아니라 문구로 뜬다. 숫자를 걸면 훈련장에서 올릴 수 있는 칸으로 읽힌다.
const HIDDEN_LABEL = { consistency: '기복', professionalism: '프로의식' };
// 기본값이 5다. 5를 가운데로 두고 위아래 두 칸씩 벌려야 평범한 선수가 평범하게 읽힌다.
function hiddenBand(key, v) {
  if (key === 'consistency') return v >= 8 ? '한결같다' : v >= 6 ? '기복이 적다' : v >= 4 ? '들쭉날쭉하다' : '오늘 뭐가 나올지 모른다';
  return v >= 8 ? '훈련을 거르지 않는다' : v >= 6 ? '성실하다' : v >= 4 ? '적당히 한다' : '훈련장을 싫어한다';
}

// 내 정보. 오른쪽 기둥이 찼으므로 좌상단 레벨 칩이 진입이다.
// 상대 전적. 만나본 키커만 올린다. 명단 77명을 다 깔면 읽을 것이 사라진다.
// 먹힌 수를 먼저 세워 누구한테 약한지가 맨 위에 오게 한다.
function recordRows() {
  const names = Object.keys(state.record);
  if (!names.length) return '<div class="note dim"><span>아직 상대 전적이 없다. 한 구를 막거나 먹히면 여기 쌓인다</span></div>';
  names.sort((a, b) => {
    const x = state.record[a];
    const y = state.record[b];
    return (y.conceded - x.conceded) || (y.saved + y.conceded - x.saved - x.conceded) || a.localeCompare(b);
  });
  const rows = names.map((n) => {
    const r = state.record[n];
    return '<span>' + n + '<b><em>' + r.saved + '</em><i>-</i>' + r.conceded + '</b></span>';
  }).join('');
  return '<div class="note"><b>상대 전적</b><i>막은 수 - 먹힌 수</i></div><div class="log">' + rows + '</div>';
}

// 아는 얼굴. 라포는 이미 판정과 팔로워에 붙는데 화면 어디에도 없어서 플레이어가 늘어난 줄을 몰랐다.
function rapportRows() {
  const keys = Object.keys(state.rapport || {});
  const head = '<div class="note"><b>아는 얼굴</b><i>말 섞은 만큼 한눈을 덜 판다</i></div>';
  if (!keys.length) return head + '<div class="note dim"><span>아직 얼굴을 튼 사람이 없다</span></div>';
  // 많이 마주친 순. 같으면 키 순이라 같은 동네가 흩어지지 않는다.
  keys.sort((a, b) => (state.rapport[b] - state.rapport[a]) || a.localeCompare(b));
  const rows = keys.map((key) => {
    const part = key.split(':');
    const city = Number(part[0]);
    const passer = Number(part[1]);
    const n = rapportCount(state.rapport, city, passer);
    const tier = rapportTier(state.rapport, city, passer);
    // 수치는 상수를 다시 적지 않고 판정에 들어가는 함수에서 되뽑는다. 두 자리가 어긋날 여지를 없앤다.
    const aid = Math.round((1 - rapportGazeAid(state.rapport, city, passer)) * 100);
    const fans = Math.round((rapportBoost(state.rapport, city, passer) - 1) * 100);
    // 이름은 라포 1단계부터 열린다. 그 전에는 차림새로만 부른다.
    const who = passerName(city, passer, tier);
    const face = tier > 0 ? tier + '단계' : '얼굴만 익었다';
    // 만남은 이 사람에게 붙은 행동이라 그 줄 안에 둔다. 못 누르는 사유도 버튼이 직접 말한다.
    const g = dateGate(state.rapport, city, passer, state.wallet.coin);
    return '<div class="note"><b>' + cityAt(city).name + ' · ' + who + '</b><i>말 섞은 횟수 ' + n
      + ' · ' + face + ' · 한눈팔기 ' + aid + '% 감소 · 팔로워 +' + fans + '%</i>'
      + '<button class="go" data-city="' + city + '" data-passer="' + passer + '"' + (g.open ? '' : ' disabled') + '>' + g.why + '</button></div>';
  }).join('');
  return head + rows;
}

function renderMe() {
  const box = el('me');
  const k = state.keeper;
  const name = k.name || '무명';
  const grid = GROWABLE.map((s) => {
    const v = k[s];
    // 10은 성장 상한이다. 훈련장과 같은 기준이어야 두 창이 어긋나지 않는다.
    return '<span class="' + (v >= 10 ? 'max' : '') + '">' + CAUSE_LABEL[s] + '<b>' + (v >= 10 ? 'MAX' : v) + '</b></span>';
  }).join('');
  const traits = (k.traits && k.traits.length)
    ? k.traits.map((t) => '<div class="note"><b>' + t + '</b><i>' + (TRAITS[t] ? TRAITS[t].note : '') + '</i></div>').join('')
    : '<div class="note dim"><span>달린 특성이 없다. 명단에서 데려오면 붙어 온다</span></div>';
  const hidden = HIDDEN.map((h) => '<div class="note"><b>' + HIDDEN_LABEL[h] + '</b><i>' + hiddenBand(h, k[h]) + '</i></div>').join('');
  box.innerHTML = '<h4>' + name + '<small>Lv ' + k.level + ' · ' + k.height + 'cm · ' + k.weight + 'kg</small></h4>'
    + '<div class="card"><div class="grid">' + grid + '</div>' + traits + hidden + rapportRows() + recordRows() + '</div>'
    + '<button class="close">닫기</button>';
  box.querySelector('.close').onclick = closeMe;
  for (const b of box.querySelectorAll('.note .go')) b.onclick = () => openDate(Number(b.dataset.city), Number(b.dataset.passer));
}

function openMe() {
  el('me').hidden = false;
  renderMe();
}

function closeMe() {
  el('me').hidden = true;
}

// 만남. 세 갈래를 한 번에 보여주고 하나를 고르면 그 자리에서 끝난다.
// 무르기는 없다. 다시 열려면 라포를 다시 쌓아야 한다.
function renderDate(city, passer, done) {
  const box = el('date');
  const who = passerName(city, passer, rapportTier(state.rapport, city, passer));
  if (done) {
    box.innerHTML = '<h4>' + who + '</h4>'
      + '<div class="out">' + done.line + '<i class="' + (done.won ? 'win' : 'lose') + '">'
      + '팔로워 ' + (done.fans > 0 ? '+' : '') + done.fans + ' · '
      + (done.won ? '이 동네에서는 이제 눈이 안 흔들린다' : '처음부터 다시 말을 섞어야 한다')
      + '</i></div><button class="close">닫기</button>';
    box.querySelector('.close').onclick = closeDate;
    return;
  }
  const moves = MOVES.map((m) => '<button data-move="' + m.id + '">' + m.label
    + '<em>' + CAUSE_LABEL[m.stat] + ' ' + state.keeper[m.stat] + ' · 성공 ' + dateOdds(state.keeper, m.id) + '%</em></button>').join('');
  box.innerHTML = '<h4>' + who + '</h4><div class="card">' + moves + '</div><button class="close">그냥 지나간다</button>';
  box.querySelector('.close').onclick = closeDate;
  for (const b of box.querySelectorAll('[data-move]')) b.onclick = () => commitDate(city, passer, b.dataset.move);
}

// 굴림은 화면 쪽 난수다. 판정용 rng를 쓰면 그 뒤 모든 구가 밀려 네 게이트가 통째로 흔들린다.
function commitDate(city, passer, moveId) {
  const out = dateOutcome(state.keeper, moveId, Math.random() * 100);
  if (!out) return;
  state.wallet.coin = Math.max(0, state.wallet.coin - DATE_COST);
  state.fans = Math.max(0, state.fans + out.fans);
  state.rapport = applyDate(state.rapport, city, passer, out.won);
  persist();
  pips();
  renderDate(city, passer, out);
  // 뒤에 열려 있는 내 정보도 같이 그린다. 안 그리면 방금 쓴 땀과 내려간 라포가
  // 반투명 배경 너머에서 옛 값으로 남아 만남 버튼이 아직 열린 것처럼 보인다.
  renderMe();
}

function openDate(city, passer) {
  el('date').hidden = false;
  renderDate(city, passer, null);
}

// 닫을 때 내 정보를 다시 그린다. 라포와 지갑이 방금 바뀌었는데 뒤 화면이 옛 값이면
// 같은 사람에게 만남 버튼이 아직 열린 것처럼 보인다.
function closeDate() {
  el('date').hidden = true;
  renderMe();
}

// 상점. 선반은 카드깡과 장비 둘이다. 지목 구매는 값을 알고 이름을 사는 축이고
// 카드깡은 값을 알고 이름을 모르는 축이라 두 축이 겹치지 않는다.
// 장비는 이름도 값도 아는 대신 스탯 위에 얇게만 얹는 축이다.
// 결과 한 줄은 state에 넣지 않는다. 저장에 남을 값이 아니라 이 패널이 열려 있는 동안만 쓰는 글자다.
let lastPull = '';

// 지금 보고 있는 선반. lastPull과 같이 패널 수명만 사는 값이라 저장에 싣지 않는다.
let shopTab = 'pull';

// 확률은 명단이 아니라 지금 남은 풀에서 다시 센다. 뽑을수록 남은 풀이 바뀌므로
// 고정 문구를 걸면 뒤로 갈수록 화면이 거짓말을 한다.
function shopOdds(pool) {
  let total = 0;
  let top = 0;
  let high = 0;
  for (const k of pool) {
    const w = pullWeight(k);
    total += w;
    if (k.fame >= 10) top += w;
    if (k.fame >= 9) high += w;
  }
  if (!total) return '';
  return '명성 10 ' + (top / total * 100).toFixed(1) + '% · 명성 9 이상 ' + (high / total * 100).toFixed(1) + '%';
}

// 장비 칸 둘의 규칙이 같으므로 선반도 하나로 둔다. 선반을 칸마다 복제하면
// 버튼 글자 규칙이 한쪽에서만 바뀌어 같은 상점 안에서 말이 갈린다.
// 장갑은 손이라 판정식의 gloveP와 spillP로, 축구화는 발이라 출발 지연으로 들어간다.
const SHELVES = {
  glove: { head: '장갑', list: GLOVES, field: 'grip', worn: '끼는 중', past: '지난 장갑', top: MAX_GRIP, at: gloveAt },
  boot: { head: '축구화', list: BOOTS, field: 'studs', worn: '신는 중', past: '지난 축구화', top: MAX_STUD, at: bootAt },
  kit: { head: '유니폼', list: KITS, field: 'pads', worn: '입는 중', past: '지난 유니폼', top: MAX_KIT, at: kitAt },
  sock: { head: '양말', list: SOCKS, field: 'socks', worn: '신는 중', past: '지난 양말', top: MAX_SOCK, at: sockAt },
  frame: { head: '골대', list: GOALS, field: 'frame', worn: '쓰는 중', past: '지난 골대', top: MAX_FRAME, at: frameAt },
  city: { head: '동네', list: CITIES, field: 'city', worn: '뛰는 중', past: '지난 동네', top: MAX_CITY, at: cityAt },
  hair: { head: '머리', list: HAIRS, field: 'hair', worn: '자른 머리', past: '지난 머리', top: MAX_HAIR, at: hairAt },
  ink: { head: '타투', list: TATTOOS, field: 'ink', worn: '새긴 것', past: '지운 타투', top: MAX_INK, at: inkAt }
};

function gearShelf(kind) {
  const s = SHELVES[kind];
  const have = state.gear[s.field];
  const rows = s.list.map((g) => {
    const rank = g[s.field];
    let label = g.cost + ' 땀';
    let off = false;
    if (rank === have) {
      label = s.worn;
      off = true;
    } else if (rank < have) {
      label = s.past;
      off = true;
    } else if (state.wallet.coin < g.cost) {
      // 못 누르는 사유를 버튼 글자로 적는다. 회색으로만 죽이면 이유를 알 수 없다.
      label = '땀 ' + (g.cost - state.wallet.coin) + ' 모자라다';
      off = true;
    }
    return '<div class="card gear"><b>' + g.name + '</b><em>' + g.note + '</em>'
      + '<button class="buy" data-kind="' + kind + '" data-rank="' + rank + '"' + (off ? ' disabled' : '') + '>' + label + '</button></div>';
  });
  const top = have >= s.top ? '<span class="got">' + s.at(s.top).name + '까지 갔다. 더 살 게 없다</span>' : '';
  return '<h4>' + s.head + '</h4>' + rows.join('') + top;
}

function bindGear(box) {
  for (const b of box.querySelectorAll('.buy[data-rank]')) {
    b.onclick = () => {
      if (b.disabled) return;
      const s = SHELVES[b.dataset.kind];
      const g = s.at(b.dataset.rank);
      if (state.wallet.coin < g.cost) return;
      state.wallet.coin -= g.cost;
      state.gear[s.field] = g[s.field];
      // 동네를 사면 상점을 닫기 전에 배경이 바뀐다. 재시작을 요구하면 산 것이 안 읽힌다.
      if (s.field === 'city') stage.setCity(state.gear.city);
      // 머리와 타투는 사면 그 자리에서 키퍼 껍데기 색이 바뀐다. 안 보이면 산 것이 아니다.
      // 머리와 잉크만 몸을 다시 세우고 있었다. 장갑과 축구화와 유니폼과 양말도
      // 이제 색을 가지므로 같이 다시 세운다. 골대와 동네는 몸이 아니라 빠진다.
      if (['hair', 'ink', 'grip', 'studs', 'pads', 'socks'].includes(s.field)) stage.setKeeper(state.keeper, lookOf(state.gear));
      persist();
      pips();
      renderShop();
    };
  }
}

function pullShelf(pool) {
  const short = PULL_COST - state.wallet.coin;
  let label = PULL_COST + ' 땀 · 한 장';
  let off = false;
  // 못 누르는 사유를 버튼 글자로 적는다. 회색으로만 죽이면 값이 모자란 것인지 살 것이 없는 것인지 모른다.
  if (!pool.length) {
    label = '명단을 다 모았다';
    off = true;
  } else if (short > 0) {
    label = '땀 ' + short + ' 모자라다';
    off = true;
  }
  const odds = pool.length ? '<em>' + shopOdds(pool) + '<br>남은 카드 ' + pool.length + '장</em>' : '';
  const got = lastPull ? '<span class="got">' + lastPull + '</span>' : '';
  return '<h4>카드깡</h4><div class="card">아직 없는 키퍼 중 한 장이 나온다. 한 장에 <b>'
    + PULL_COST + ' 땀</b>' + odds
    + '<button class="buy"' + (off ? ' disabled' : '') + '>' + label + '</button>' + got
    + '</div>';
}

// 봇은 소모형이라 SHELVES에 못 넣는다. 등급을 갖는 게 아니라 분을 갖는다.
function botShelf() {
  const cur = state.bot;
  const left = Math.ceil(cur.ms / 60000);
  const rows = BOTS.map((b) => {
    let label = b.cost + ' 땀 · ' + b.minutes + '분';
    let off = false;
    if (state.wallet.coin < b.cost) {
      // 못 누르는 사유를 버튼 글자로 적는다. 회색으로만 죽이면 이유를 알 수 없다.
      label = '땀 ' + (b.cost - state.wallet.coin) + ' 모자라다';
      off = true;
    } else if (cur.ms > 0 && b.tier === cur.tier) {
      label = '남은 ' + left + '분에 ' + b.minutes + '분 더';
    } else if (cur.ms > 0 && b.tier < cur.tier) {
      // 더 좋은 클론이 서 있는데 싼 걸 사면 등급이 내려간다. 산 사람은 그걸 산 줄 모른다.
      label = '더 좋은 클론이 남아 있다';
      off = true;
    }
    return '<div class="card gear"><b>' + b.name + '</b><em>' + b.note + '</em>'
      + '<button class="buy" data-bot="' + b.tier + '"' + (off ? ' disabled' : '') + '>' + label + '</button></div>';
  });
  return '<h4>봇</h4><span class="got">봇이 뛴 구는 팔로워가 안 붙는다</span>' + rows.join('');
}

function bindBot(box) {
  for (const b of box.querySelectorAll('.buy[data-bot]')) {
    b.onclick = () => {
      if (b.disabled) return;
      const spec = botAt(b.dataset.bot);
      if (!spec || state.wallet.coin < spec.cost) return;
      state.wallet.coin -= spec.cost;
      state.bot.tier = spec.tier;
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
  const rows = BUFFS.map((b) => {
    let label = b.cost + ' 땀 · ' + b.shots + '구';
    let off = false;
    if (state.wallet.coin < b.cost) {
      // 못 누르는 사유를 버튼 글자로 적는다. 회색으로만 죽이면 이유를 알 수 없다.
      label = '땀 ' + (b.cost - state.wallet.coin) + ' 모자라다';
      off = true;
    } else if (cur.shots > 0 && cur.kind === b.kind) {
      label = '남은 ' + cur.shots + '구에 ' + b.shots + '구 더';
      // 상한에 닿으면 산 구가 그대로 버려진다. 사기 전에 알아야 한다.
      if (cur.shots >= BUFF_CAP) { label = '더 못 담는다'; off = true; }
    } else if (cur.shots > 0) {
      // 슬롯이 하나라 다른 종류를 사면 지금 것이 덮인다. 산 사람은 그걸 산 줄 모른다.
      label = buffAt(cur.kind).name + '가 아직 ' + cur.shots + '구 남았다';
      off = true;
    }
    return '<div class="card gear"><b>' + b.name + '</b><em>' + b.note + '</em>'
      + '<button class="buy" data-buff="' + b.kind + '"' + (off ? ' disabled' : '') + '>' + label + '</button></div>';
  });
  return '<h4>버프</h4><span class="got">시간이 아니라 구로 닳는다. 한 번에 한 종류만 든다</span>' + rows.join('');
}

function bindBuff(box) {
  for (const b of box.querySelectorAll('.buy[data-buff]')) {
    b.onclick = () => {
      if (b.disabled) return;
      const spec = buffAt(b.dataset.buff);
      if (!spec || state.wallet.coin < spec.cost) return;
      const next = addBuff(state.buff, spec.kind);
      // 다른 종류가 살아 있으면 addBuff가 원본을 그대로 돌려준다. 그때 값을 치르면 땀만 사라진다.
      if (next === state.buff) return;
      state.wallet.coin -= spec.cost;
      state.buff = next;
      persist();
      pips();
      renderShop();
    };
  }
}

function renderShop() {
  const box = el('shop');
  const pool = KEEPERS.filter((e) => !state.squad.some((k) => k.name === e.name));
  // 장비를 한 탭에 몰면 카드가 여덟 장이라 720p에서 닫기 버튼이 화면 밖으로 밀린다.
  const tabs = '<div class="tabs">'
    + '<button class="tab" data-tab="pull"' + (shopTab === 'pull' ? ' aria-current="true"' : '') + '>카드깡</button>'
    + '<button class="tab" data-tab="glove"' + (shopTab === 'glove' ? ' aria-current="true"' : '') + '>장갑</button>'
    + '<button class="tab" data-tab="boot"' + (shopTab === 'boot' ? ' aria-current="true"' : '') + '>축구화</button>'
    + '<button class="tab" data-tab="kit"' + (shopTab === 'kit' ? ' aria-current="true"' : '') + '>유니폼</button>'
    + '<button class="tab" data-tab="sock"' + (shopTab === 'sock' ? ' aria-current="true"' : '') + '>양말</button>'
    + '<button class="tab" data-tab="frame"' + (shopTab === 'frame' ? ' aria-current="true"' : '') + '>골대</button>'
    + '<button class="tab" data-tab="city"' + (shopTab === 'city' ? ' aria-current="true"' : '') + '>동네</button>'
    + '<button class="tab" data-tab="hair"' + (shopTab === 'hair' ? ' aria-current="true"' : '') + '>머리</button>'
    + '<button class="tab" data-tab="ink"' + (shopTab === 'ink' ? ' aria-current="true"' : '') + '>타투</button>'
    + '<button class="tab" data-tab="bot"' + (shopTab === 'bot' ? ' aria-current="true"' : '') + '>봇</button>'
    + '<button class="tab" data-tab="buff"' + (shopTab === 'buff' ? ' aria-current="true"' : '') + '>버프</button>'
    + '</div>';
  box.innerHTML = tabs + (SHELVES[shopTab] ? gearShelf(shopTab) : shopTab === 'bot' ? botShelf() : shopTab === 'buff' ? buffShelf() : pullShelf(pool)) + '<button class="close">닫기</button>';
  box.querySelector('.close').onclick = closeShop;
  for (const t of box.querySelectorAll('.tab')) {
    t.onclick = () => { shopTab = t.dataset.tab; renderShop(); };
  }
  if (SHELVES[shopTab]) return bindGear(box);
  if (shopTab === 'bot') return bindBot(box);
  if (shopTab === 'buff') return bindBuff(box);
  const buy = box.querySelector('.buy');
  buy.onclick = () => {
    if (buy.disabled) return;
    // 값을 깎기 전에 뽑는다. 빈 풀에 값만 치르는 경로는 만렙 훈련 데드락과 같은 결함이다.
    const pick = pullFrom(pool, Math.random);
    if (!pick) return;
    state.wallet.coin -= PULL_COST;
    state.squad.push(keeperFromRoster(pick));
    // 뽑은 카드로 자동 전환하지 않는다. 무작위 결과가 뛰던 키퍼를 임의로 강등시키면
    // 뽑기가 이득이 아니라 사고가 된다. 교체는 선수단에서 사람이 고른다.
    lastPull = pick.name + ' 영입';
    persist();
    pips();
    renderShop();
  };
}

function openShop() {
  document.body.classList.add('panelOpen');
  el('shop').hidden = false;
  renderShop();
}

function closeShop() {
  document.body.classList.remove('panelOpen');
  el('shop').hidden = true;
  // 지난번 결과를 들고 다시 열면 방금 뽑은 것처럼 읽힌다.
  lastPull = '';
  // 선반도 처음 자리로 돌린다. 닫을 때 보던 탭이 남으면 다음에 연 사람이 카드깡을 못 찾는다.
  shopTab = 'pull';
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
  // 크레딧이 없으면 켜지지 않는다. 대신 어디서 사는지를 연다.
  if (!state.auto && state.bot.ms <= 0) {
    shopTab = 'bot';
    openShop();
    return;
  }
  state.auto = !state.auto;
  // 켠 순간부터 재야 한다. 꺼져 있던 시간까지 차감되면 산 분이 사라진다.
  if (state.auto) botStamp = performance.now();
  autoBtn.classList.toggle('on', state.auto);
  persist();
};
el('gymBtn').onpointerdown = (e) => {
  e.stopPropagation();
  if (el('gym').hidden) openGym(); else closeGym();
};
el('rosterBtn').onpointerdown = (e) => {
  e.stopPropagation();
  if (el('roster').hidden) openRoster(); else closeRoster();
};
el('gramBtn').onpointerdown = (e) => {
  e.stopPropagation();
  if (el('gram').hidden) openGram(); else closeGram();
};
el('meBtn').onpointerdown = (e) => {
  // 막지 않으면 화면 전체를 덮은 #pad가 이 눌림을 방향 입력으로 먹는다.
  e.stopPropagation();
  if (el('me').hidden) openMe(); else closeMe();
};
el('shopBtn').onpointerdown = (e) => {
  e.stopPropagation();
  if (el('shop').hidden) openShop(); else closeShop();
};
el('purse').onpointerdown = (e) => {
  e.stopPropagation();
  if (el('earn').hidden) openEarn(); else closeEarn();
};
// 진단용. __pick은 화소 피킹이 이미 쓴다.
window.__squad = () => ({ squad: state.squad.map((k) => k.name), pick: state.pick, coin: state.wallet.coin });
window.__roster = (open) => { if (open) openRoster(); else closeRoster(); };
window.__gram = (open) => { if (open) openGram(); else closeGram(); };
window.__me = (open) => { if (open) openMe(); else closeMe(); };
// 만남은 내 정보 안의 버튼으로만 열린다. 게이트가 그 버튼까지 클릭해서 오게 하려면 좌표가 필요하다.
window.__date = (city, passer) => { if (city === undefined) closeDate(); else openDate(city, passer); };
window.__shop = (open) => { if (open) openShop(); else closeShop(); };
window.__earn = (open) => { if (open) openEarn(); else closeEarn(); };
// 게이트는 화면 글자 대신 장부를 직접 읽어야 판정이 마크업 변경에 흔들리지 않는다.
window.__record = () => state.record;
// 팔로워와 라포는 화면에 숫자 하나와 막대로만 나온다. 봇이 뛴 구가 정말 아무것도 안 남기는지는 장부를 직접 읽어야 안다.
window.__fans = () => state.fans;
window.__rapport = () => state.rapport;
// 봇이 실제로 뛴 구였는지. 크레딧과 자동 상태만 보고 짐작하면 배선이 끊겨도 게이트가 초록으로 남는다.
window.__botRan = () => state.botRan;

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
  stage.setKeeper(state.keeper, lookOf(state.gear));
  stage.setCity(state.gear.city);
  // 밀린 훈련이 있어도 공부터 온다. 쓸지 말지는 훈련장 버튼이 들고 있다.
  nextSet();
});
