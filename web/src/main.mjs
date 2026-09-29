// 화면 조립. 판정은 chain.mjs가 하고 이 파일은 입력과 자막만 옮긴다.
import { HUD_LINKS, linkAttrs } from './ui/links.mjs';
import { makeRng, buildSet, resolve, newKeeper, keeperFromRoster, botPlan, X_MAX, moveSpeed, rollForm, ballInHand, restartDelay, setBreak, followerGain } from '../../src/chain.mjs';
import { aimAt, diveTrigger } from '../../src/chain.mjs';
import { CAUSE_LABEL, GROWABLE, HIDDEN } from '../../src/ledger.mjs';
import { KEY_MAP } from './ui/keys.mjs';
import { KEEPERS, KICKERS, kickerByName, FIELD, defaultEleven, TRAITS, TICKET_CAP, ticketGain } from '../../src/roster.mjs';
import { createScene } from './render/scene.mjs';
import { mountBgm } from './audio/bgm.mjs';
import { mountTitle } from './ui/title.mjs';
import { aimLine } from './ui/callout.mjs';
import { eventLine, setEndLine, postLine, commentLine, photoLine, gazeAct } from './ui/lines.mjs';
import { load, save, readSquad, offlineGain, readRecord, readSquadKickers, useAccount, saveKey } from './state/save.mjs';
import { autoTrain, trainStat } from './state/coach.mjs';
import { currentId } from './state/account.mjs';
import { createRankPane } from './ui/rank-pane.mjs';
import { coinGain, readWallet, cashPrice, pay } from './state/wallet.mjs';
import { readBot, botKeeper } from './state/bot.mjs';
import { WORN_FIELDS, PLACE_FIELDS, isWorn, readGear, cityAt, lookOf, lookBoost } from './state/gear.mjs';
import { SHELF_NOTES_FOR_WIKI, SHELVES } from './state/shelf.mjs';
export { SHELF_NOTES_FOR_WIKI };
import { TONIC_FOCUS, HYPE_BOOST, newBuff, readBuff, buffAt, spendBuff } from './state/buff.mjs';
import { readSocial, mutualBoost, likesFor, commentOdds, photoOdds } from './state/gram.mjs';
import { readRapport, addRapport, rapportCount, rapportTier, rapportGazeAid, rapportBoost, RAPPORT_STEPS } from './state/rapport.mjs';
import { passerName } from './state/passer.mjs';
import { DATE_COST, dateGate } from './state/date.mjs';
import { applyPreset, ONBOARD_DONE } from './state/inject.mjs';
import { thumbURL } from './render/thumb.mjs';
import * as wikiUI from './ui/wiki.mjs';
import { createImpact } from './ui/impact-view.mjs';
import { createGramPanel } from './ui/gram-panel.mjs';
import { createRosterPanel } from './ui/roster-panel.mjs';
import { createShopPanel } from './ui/shop-panel.mjs';
import { createDatePanel } from './ui/date-panel.mjs';
import { scrollCue } from './ui/scroll-cue.mjs';
import { IC_FANS, IC_NOFACE, IC_GOLD, IC_CASH, IC_UP, IC_DOWN, IC_MID, buffIcon, STAT_ICON, IC_CMT } from './ui/icons.mjs';

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
window.__ballSize = stage.ballSize;
window.__kickerPos = stage.kickerPos;
window.__keeperPos = stage.keeperPos;
window.__tailAge = stage.tailAge;
window.__tailKind = stage.tailKind;
window.__marks = stage.marks;
window.__project = stage.project;
// 화면 한 점의 임자를 되묻는 훅. 어느 면이 그 화소를 차지했는지 모르면
// 화면이 죽었다는 말은 고칠 대상을 가리키지 못한다.
window.__pick = (nx, ny) => stage.ballProbe.pickAt(nx, ny);
const bgm = mountBgm();
// 선언값은 증거가 아니다. 게이트가 실제 베드 음량을 읽을 수 있어야 한다.
window.__bgm = bgm;

// 재현되지 않는 캐프처는 증거가 아니다. ?seed= 가 있으면 그 씨드로 고정한다.
const seedParam = new URLSearchParams(location.search).get('seed');
const rng = makeRng(seedParam === null ? ((Date.now() ^ 0x9e3779b9) >>> 0) : (Number(seedParam) >>> 0));
/* 화면 쪽 굴림은 판정 스트림을 안 쓴다. 판정에 굴림을 하나 더 얹으면 그 뒤 모든 구가 밀려
   shot과 band와 save와 pose가 통째로 흔들린다. 그래서 여기는 Math.random이었는데, 그러면
   시드를 줘도 화면 사건이 매번 다르다. 실측으로 행인 사진 수가 같은 시드에서 1과 3 사이를 오갔고
   그 축은 확률 사건의 한 번 실현을 재고 있었다. 시드에서 파생한 둘째 스트림을 따로 세운다.
   0x85ebca6b는 murmur3의 섞기 상수라 첫 스트림과 겹치지 않고, 시드가 없으면 시간을 쓴다. */
const roll = makeRng(seedParam === null ? ((Date.now() ^ 0x85ebca6b) >>> 0) : ((Number(seedParam) ^ 0x85ebca6b) >>> 0));
/* 저장은 계정마다 갈리므로 읽기 전에 누구인지부터 정해야 한다. 이 모듈은 맨 위에서 한 번
   읽고 그 값으로 상태를 세우므로, 계정을 여기서 안 걸면 로그인 전 자리를 읽고 시작한다. */
useAccount(currentId());
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
// 크레딧은 손가락을 사는 것이고 코치는 번 포인트를 쓰는 것이다.
// 크레딧이 끝났다고 훈련이 멈추면 레벨은 오르는데 스탯이 3에 머무는 방치 결함이 다시 온다.
state.coach = Boolean(saved?.coach);
state.keeper = state.squad[state.pick];
// 호출 수는 로그가 아니라 실제 입력 자리를 세야 손 모드의 우회 호출을 놓치지 않는다.
window.__autoCalls = 0;
window.__lastInput = null;
// 비운 시간은 훈련 포인트로 쌓이고 자동이 켜져 있으면 선방 우선순위대로 쓴다.
// 이전 배포본 세이브에는 points가 없다. 없으면 0으로 읽고 게임은 그대로 이어진다.
state.points = (Number(saved?.points) || 0) + (saved ? offlineGain(saved.at, Date.now()) : 0);
// 아웃문그램 팔로워. 의사소통과 악동이 여기서 값을 낸다.
state.fans = Number(saved?.fans) || 0;
// 이적시장 이용권. 완봉으로만 들어오므로 시간이 아니라 실력에 붙는 자원이다.
state.tickets = Math.min(TICKET_CAP, Number(saved?.tickets) || 0);
/* 게시물 보관 수. 12장이던 시절에는 구마다 올라가는 내 글이 열두 자리를 다 먹어,
   가끔 오는 행인의 사진이 밀려 나가 타임라인이 다시 내 일기가 됐다. 18장이면 그 사진이 남는다. */
const FEED_CAP = 18;
state.posts = Array.isArray(saved?.posts) ? saved.posts.slice(-FEED_CAP) : [];
// 지갑은 두 갈래로 읽는다. 이전 배포본 저장에는 지갑이 없고, 그때 둘 다 0에서 시작한다.
state.wallet = readWallet(saved?.wallet);
// 상대 전적. 키커 이름을 열쇠로 막은 수와 먹힌 수를 따로 센다.
state.record = readRecord(saved);
/* eleven은 필드 열 명의 배열이고 골키퍼는 state.keeper에 선다. 선발 열하나는 이 둘의 합이다.
   지금까지 판에 나오는 키커는 명단 일흔일곱에서 매 구 무작위였고,
   플레이어가 상대를 고를 방법이 없었다. 잘 차는 키커는 막기 어렵지만 골대 밖으로 덜 차므로,
   주전을 고르는 것은 난도를 올려 보상 밀도를 사는 선택이다. */
{
  const names = KICKERS.map((k) => k.name);
  const got = readSquadKickers(saved, names, defaultEleven(), FIELD);
  state.kickers = got.kickers;
  state.eleven = got.eleven;
}
/* 첫 진입이 어디까지 왔는지. 옛 저장에는 이 칸이 없고, 그때는 이미 한참 한 판이므로
   끝난 것으로 읽는다. 이미 하던 사람에게 튜토리얼을 다시 열면 그 판이 뒤집힌다. */
state.onboard = Number.isFinite(saved?.onboard) ? saved.onboard : (saved ? 2 : 0);
// 장비. 몸에 걸치는 여섯은 그 키퍼가 들고, 서는 자리 둘은 계정이 든다.
// 저장에 실린 하나짜리 장비는 옛 판이므로 모든 키퍼에게 같은 것을 입혀 이어 붙인다.
const savedGear = readGear(saved?.gear);
for (const k of state.squad) {
  if (!k.worn || typeof k.worn !== 'object') k.worn = {};
  for (const f of WORN_FIELDS) {
    const v = Number(k.worn[f]);
    k.worn[f] = Number.isFinite(v) ? v : savedGear[f];
  }
}
state.place = {};
for (const f of PLACE_FIELDS) state.place[f] = savedGear[f];
/* 두 갈래를 한 자리에서 읽고 쓴다. 호출부 스물다섯이 state.gear를 그대로 쓰고,
   어느 칸이 누구 것인지는 이 자리 하나가 안다. 두 객체를 손으로 맞추면 그 둘이 갈린다. */
state.gear = new Proxy({}, {
  get: (_, f) => (isWorn(f) ? state.keeper.worn[f] : state.place[f]),
  set: (_, f, v) => { if (isWorn(f)) state.keeper.worn[f] = v; else state.place[f] = v; return true; },
  has: (_, f) => isWorn(f) || PLACE_FIELDS.indexOf(f) >= 0,
  ownKeys: () => WORN_FIELDS.concat(PLACE_FIELDS),
  getOwnPropertyDescriptor: (_, f) => ({
    value: isWorn(f) ? state.keeper.worn[f] : state.place[f],
    enumerable: true,
    configurable: true
  })
});
// 봇. 시간제 크레딧이라 남은 밀리초가 저장에 남는다.
state.bot = readBot(saved?.bot);
// 버프. 시간이 아니라 구로 닳는다. 탭을 닫아도 남은 구는 그대로 이어진다.
state.buff = readBuff(saved?.buff);
// 라포. 도시별 행인 인덱스마다 마주친 횟수가 저장에 남는다.
state.rapport = readRapport(saved?.rapport);
// 선팔과 맞팔. 라포가 얼굴을 아는 것이라면 이쪽은 계정으로 이어진 것이다.
state.social = readSocial(saved?.social);
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
window.__coach = () => state.coach;
// 기복은 판당 한 번 굴러서 계기가 원하는 쪽을 기다릴 수 없다. 값을 넣으면 그 값으로 다시 그린다.
window.__form = (v) => {
  if (v !== undefined) { state.form = Number(v); formChip(); aura(); }
  return state.form;
};
// 장비가 판정에 실제로 들어갔는지는 화면 글자가 아니라 상태로 재야 한다.
window.__gear = () => state.gear;
// 봇이 실제로 섰는지는 자막이 아니라 상태로만 확인된다.
window.__bot = () => state.bot;
// 사고 연출은 확률로만 나오므로 계측기가 불러낼 수 있어야 한다. 판정은 안 바뀐다.
// 갈래를 못 받으면 계기가 눈맞음 아홉 갈래 중 하나만 볼 수 있고, 그 하나로 아홉을 대변하게 된다.
window.__act = (kind, flavour) => stage.act(kind, flavour);
// 선언값은 증거가 아니다. 게이트가 실제 파형을 재려면 발화를 불러낼 수 있어야 한다.
window.__sfx = stage.sfx;
// 정지가 정말 정지인지 재려면 세계시계를 밖에서 읽을 수 있어야 한다.
window.__now = () => stage.now();
// 강제 재생 훅은 라운드 대기 타이머와 경쟁한다. 잠그지 않으면 타이머가 터져
// 자기 shot으로 덮어쓰고, 지정한 조준점이 무시된 것처럼 보인다.
// 실측: aimX 2.1을 넣었는데 비행 궤적이 aimX 0.72로 읽혔다.
// 'demo'는 commit이 요구하는 'wait'가 아니므로 그 경로가 통째로 막힌다.
/* 잠그는 순간의 단계가 wait면 타이머 하나로 끝나지만 flying이나 caption이면 자막 스텝이
   자기 타이머를 다시 걸고 restart를 거쳐 nextShot이 wait를 새로 세운다. 그 한 구가 잠근
   뒤에 완주해 잔고에 4를 넣었고, 두 시점의 잔고를 비교하던 축이 그 4를 뽑기 값으로 읽었다.
   실측으로 세 번 중 한 번이 7620 대신 7624였다. 열 게이트가 이 잠금 위에 서 있으므로
   잠금은 지금 단계와 무관하게 다음 wait까지 막아야 한다. nextShot이 문이다. */
let roundLocked = false;
window.__lockRound = () => { roundLocked = true; stage.cancel(timer); state.phase = 'demo'; return state.phase; };
// 잠근 판을 다시 굴린다. 하네스가 연출 구간을 끼워 넣고 이어서 촬영하려면 되돌릴 길이 있어야 한다.
window.__resumeRound = () => { roundLocked = false; state.phase = 'idle'; nextSet(); return state.phase; };
// 불러오기는 판이 시작되기 전에 끝난다. 첨 판을 기다려 그리면 그 사이에 숫자가 없다.

// 위치는 판정 단위로 보관하고 렌더 어댑터가 월드 단위로 바꾼다.
let keeperX = 0, keeperVx = 0;
const held = new Map();
let positioning = null;
let firstPositionHint = !saved;
// 준비 1.2초와 기존 도움닫기 0.55초를 합쳐 발 접촉까지 움직일 시간을 준다.
const SET_SECONDS = 1.2, RUN_SECONDS = 0.55;
// 키커의 가장 이른 읽기보다 긴 1초를 50ms 간격으로 전달한다(P15 입력 계약).
const TRACE_MS = 1000, SAMPLE_MS = 50;
const direction = () => Math.sign([...held.values()].reduce((a, b) => a + b, 0));
function paintMovement() {
  for (const b of document.querySelectorAll('.move-arrow')) {
    b.setAttribute('aria-pressed', String(direction() === Number(b.dataset.move)));
  }
}
function holdMovement(source, value) {
  if (value && (state.phase === 'wait' || held.has(source))) {
    held.set(source, value);
    if (positioning) positioning.manual = true;
  } else held.delete(source);
  paintMovement();
}
function traceX(trace, ms) {
  if (ms <= trace[0].ms) return trace[0].x;
  for (let i = 1; i < trace.length; i++) {
    const a = trace[i - 1], b = trace[i];
    if (ms <= b.ms) return a.x + (b.x - a.x) * (ms - a.ms) / (b.ms - a.ms);
  }
  return trace.at(-1).x;
}
// 장면의 세계시계를 같이 써야 정지 프레임과 느린 탭에서도 접촉이 앞서지 않는다.
stage.onPositionFrame((dt, now) => {
  const p = positioning;
  if (!p || state.phase !== 'wait' || !dt) return;
  const before = p.elapsed;
  p.elapsed = now - p.started;
  const elapsed = p.elapsed - before;
  const old = keeperX;
  if (p.manual || direction()) keeperX += direction() * moveSpeed(state.keeper) * elapsed;
  else {
    const ms = (p.elapsed - SET_SECONDS - RUN_SECONDS) * 1000;
    const target = traceX(p.plan, ms);
    keeperX += Math.sign(target - keeperX) * Math.min(Math.abs(target - keeperX), moveSpeed(p.keeper) * elapsed);
  }
  keeperX = Math.max(-X_MAX, Math.min(X_MAX, keeperX));
  keeperVx = elapsed ? (keeperX - old) / elapsed : 0;
  p.frames.push({ ms: (p.elapsed - SET_SECONDS - RUN_SECONDS) * 1000, x: keeperX });
  stage.setKeeperX(keeperX, keeperVx);
});
stage.onReturnHeld(() => Boolean(direction()));
window.__position = () => ({ x: keeperX, vx: keeperVx, speed: moveSpeed(state.keeper), max: X_MAX,
  phase: state.phase, elapsed: positioning?.elapsed, set: SET_SECONDS, runup: RUN_SECONDS,
  manual: positioning?.manual, plan: positioning?.plan, frames: positioning?.frames,
  resolved: positioning?.resolved || false, contacted: positioning?.contacted || false,
  contact: positioning?.contact, trigger: positioning?.trigger,
  aimCalls: positioning?.aimCalls || 0, resolveCalls: positioning?.resolveCalls || 0,
  held: direction() });
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

/* 값을 말하는 자리는 전부 이 함수를 지난다. 상단 잔고는 아이콘인데 상점 버튼만 '140 골드'처럼
   글자로 적으면 같은 재화가 두 표기로 갈리고, 어느 재화로 사는지를 글자를 읽어야 안다. */
// data-coin은 계기가 읽는 자리다. 그려진 숫자는 천 단위 쉼표가 붙고 아이콘 이름이 섞여 들어와,
// 글자를 파싱하면 계기가 값을 못 읽거나 잘못 읽는다. 값은 데이터에서 꺼내 쓴다.
const SW = (n) => '<span class="px" data-coin="' + Number(n) + '">' + IC_GOLD
  + '<b>' + Number(n).toLocaleString() + '</b></span>';
const affordable = (gold) => state.wallet.coin >= gold || state.wallet.cash >= cashPrice(gold);
const purchase = (gold) => pay(state.wallet, gold, state.wallet.coin >= gold ? 'coin' : 'cash');
const PRICE = (n) => '<span class="price" data-coin="' + n + '" data-cash="' + cashPrice(n) + '" title="골드 또는 캐시">'
  + SW(n).replace('class="px"', 'class="px' + (state.wallet.coin < n ? ' bad-price' : '') + '"')
  + '<i class="or">또는</i><span class="px cash' + (state.wallet.cash < cashPrice(n) ? ' bad-cash' : '')
  + '" data-cash="' + cashPrice(n) + '">' + IC_CASH + '<b>' + cashPrice(n) + '</b></span></span>';



function pips() {
  el('pips').innerHTML = state.shots.map((_, i) => {
    const r = state.results[i];
    // 지금 굴리는 칸을 표시한다. 결과를 미리 칠하면 자막이 뒤집을 것을 먼저 말해버린다.
    const cls = r === undefined ? (i === state.i ? 'now' : '') : r ? 'gone' : 'save';
    return '<i class=\"' + cls + '\"></i>';
  }).join('');
  el('lv').textContent = 'Lv ' + state.keeper.level;
  /* 초상화 자리에 실제 그 키퍼의 얼굴을 굽는다. 픽셀로 그린 사람 모양 하나면 누구를 눌러도
     같은 그림이라, 사람을 바꿔도 칩은 안 바뀐다. 뛰는 사람이 바뀌면 이 칸도 바뀌어야 한다.
     매 구 부르는 자리라 이름이 그대로면 다시 굽지 않는다. */
  const who = state.keeper.name;
  const btn = el('meBtn');
  if (btn.dataset.who !== who) {
    btn.dataset.who = who;
    btn.innerHTML = '<img alt="' + who + '" src="' + thumbURL('face', state.keeper, lookOf(state.gear, who)) + '">';
  }
  /* 재화 띠. 팔로워와 골드와 캐시가 한 줄에 선다. 세 값은 갈래가 달라도 등급이 같아서,
     따로 떨어져 있으면 지금 무엇을 얼마나 들고 있는지가 화면 두 자리를 읽어야 아는 값이 된다.
     갈래는 크기가 아니라 칩 사이에 선 세로선이 가른다. 팔로워는 아웃문그램을, 재화는
     위키의 재화 칸을 연다. */
  el('purse').innerHTML = '<button class="cur" id="fans" ' + linkAttrs('fans') + '>' + IC_FANS + '<b>' + state.fans.toLocaleString() + '</b></button>'
    + '<button class="cur" ' + linkAttrs('purse') + '>' + IC_GOLD + '<b>' + state.wallet.coin.toLocaleString() + '</b></button>'
    + '<button class="cur" ' + linkAttrs('purse') + '>' + IC_CASH + '<i>' + state.wallet.cash.toLocaleString() + '</i></button>'
    // 남은 버프도 같은 줄에 선다. 몇 판 뒤에 꺼지는지를 상점을 열어야 알면 계획이 안 선다.
    + (state.buff.shots > 0 ? '<button class="cur" ' + linkAttrs('purse') + '>' + buffIcon(state.buff.kind) + '<u>' + state.buff.shots + '</u></button>' : '');
  // 남은 훈련 횟수는 버튼 위에 붙는다. 열어봐야 아는 숫자는 방치형에서 안 열린다.
  const badge = el('gymDot');
  badge.textContent = state.points > 9 ? '9+' : String(state.points);
  badge.hidden = state.points <= 0;
  // 봇에 남은 분도 버튼 위에 붙는다. 언제 꺼지는지를 상점을 열어야 알면 방치형에서 안 열린다.
  const clone = el('autoDot');
  const left = Math.ceil(state.bot.ms / 60000);
  clone.textContent = left > 9 ? '9+' : String(left);
  clone.hidden = left <= 0;
  aura();
}

/* 지금 몸에 걸린 것. 잔고 줄의 숫자는 다음 판을 계획하는 값이고, 이 배지는 이번 판이 왜 이렇게
   굴러가는지다. 판을 보는 눈이 화면 아래에 있으므로 배지도 키퍼 옆에 선다.
   컨디션은 여기 없다. 상단 칩이 이미 같은 값을 화살표로 세우고 있어서, 한 값이 화면 두 자리에서
   두 번 말해졌다. 화면에도 한 사실은 한 곳이 소유한다. 소유자는 칩이다. */
function aura() {
  const box = el('aura');
  const rows = [];
  if (state.buff.shots > 0) {
    const spec = buffAt(state.buff.kind);
    rows.push('<span class="tag buff" data-kind="' + state.buff.kind + '">' + buffIcon(state.buff.kind)
      + '<b>' + state.buff.shots + '회</b><i>' + (spec ? spec.name : '') + '</i></span>');
  }
  box.innerHTML = rows.join('');
  box.hidden = rows.length === 0;
}

/* 이름이 바뀌는 것은 물어봐야 들린다. 칩은 초점을 안 받는 자리라 그 물음이 아예 안 오고, 묶음 이름은
   초점이 들어올 때 다시 읽히므로 판에 초점을 세운 채로 창이 열리고 닫히는 동안은 조용하다. 같은 말을
   살아 있는 자리에 적어야 그때 들린다. 같은 말을 다시 적으면 한 번 더 울리므로 바뀔 때만 적는다.
   자리는 하나만 둔다. 판이 바뀌는 순간 컨디션과 창이 한 호출 안에서 차례로 적히는데, 살아 있는 자리가
   둘이면 읽어 주는 자가 그 둘을 한 번에 받아 하나를 버릴 수 있고, 버려지는 쪽이 컨디션이다. 한 번에
   들어온 말은 그 말들이 이미 쓰는 쉼표로 이어 한 줄로 적는다. 무엇을 두고 하는 말인지는 부르는 자리에서
   따로 받는다. 같은 것을 두고 새 말이 오면 앞의 말을 밀어낸다. */
const SAY_JOIN = ', ';
const saidBy = new Map();
let sayQueue = [];
function hudSay(subject, line) {
  if (saidBy.get(subject) === line) return;
  saidBy.set(subject, line);
  const at = sayQueue.findIndex((q) => q.subject === subject);
  if (at >= 0) { sayQueue[at].line = line; return; }
  sayQueue.push({ subject, line });
  if (sayQueue.length === 1) queueMicrotask(saySpill);
}
function saySpill() {
  const line = sayQueue.map((q) => q.line).join(SAY_JOIN);
  sayQueue = [];
  el('padSay').textContent = line;
}

/* 컨디션의 유일한 자리. 0.4는 화살표를 세우는 문턱이고, 이 값을 읽는 곳이 여기 하나뿐이라
   두 자리가 다른 수를 쓸 일이 없다. */
function formChip() {
  const box = el('form');
  const up = state.form > 0.4;
  const dn = state.form < -0.4;
  box.innerHTML = up ? '<span class="up">' + IC_UP + '</span>'
    : dn ? '<span class="dn">' + IC_DOWN + '</span>'
    : '<span class="mid">' + IC_MID + '</span>';
  /* 아이콘만 서는 자리라 이름은 라벨이 맡는다. role은 마크업이 들고 있다. 이름 없는 덩어리에
     라벨만 붙이면 계산은 되어도 읽어 주는 자에게 간다는 보장이 없고, 실측으로 이 판이
     role=generic에 이름을 얹어 돌려줬다. title은 같은 이름을 마우스에 준다. */
  const name = '컨디션 ' + (up ? '좋음' : dn ? '나쁨' : '보통');
  box.setAttribute('aria-label', name + ': ' + HUD_LINKS.form.label);
  box.setAttribute('title', name + ': ' + HUD_LINKS.form.label);
  hudSay('form', name + ': ' + HUD_LINKS.form.label);
}

// 자동 다이빙이 시작되면 이동이 닫힌 상태를 눈과 읽어 주는 자에게 같이 알린다.
function setPad(on) {
  for (const b of document.querySelectorAll('.move-arrow')) b.classList.toggle('live', on);
  const name = on ? '좌우 이동 가능' : '슛 진행 중';
  el('movement').setAttribute('aria-label', name);
  hudSay('pad', name);
}

// 저장은 항상 보유 목록 전체로 나간다. 뛰는 키퍼만 저장하면 나머지가 다음 저장에서 지워진다.
function persist() {
save(state.squad, state.pick, state.auto, state.fans, state.points, state.wallet, state.posts, state.record, state.gear, state.bot, state.buff, state.rapport, state.tickets, state.social, state.kickers, state.eleven, state.onboard, undefined, state.coach);
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

// 이번 구에 들어온 골드를 잔고 옆에 한 번 띄운다.
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

function nextSet() {
  // 기복은 판당 한 번 굴러서 그 판 내내 같은 값으로 선다.
  const form = rollForm(state.keeper, rng);
  state.form = form;
  formChip();
  // 필드 열 명만 이 판에서 찬다. 명단 전체가 아니라 플레이어가 세운 사람들이 차야 그 선택이 값을 한다.
  state.shots = buildSet(rng, state.keeper.level, state.gear.city, state.eleven.map(kickerByName).filter(Boolean));
  state.i = 0;
  state.results = [];
  pips();
  nextShot();
}

function nextShot() {
  if (state.i >= state.shots.length) return endSet();
  if (roundLocked) { state.phase = 'demo'; return; }
  const shot = state.shots[state.i];
  state.phase = 'wait';
  pips();
  setPad(true);
  stage.reset();
  keeperX = stage.keeperX();
  keeperVx = 0;
  const keeper = state.auto && state.bot.ms > 0 ? botKeeper(state.keeper, state.bot) : state.keeper;
  positioning = { started: stage.positionTime(), elapsed: 0, keeper, plan: botPlan(keeper, shot, rng), manual: Boolean(direction()),
    frames: [{ ms: -(SET_SECONDS + RUN_SECONDS) * 1000, x: keeperX }], resolved: false };
  el('moveHint').hidden = !firstPositionHint;
  lastAim = aimLine(shot.kicker, rng, lastAim);
  say(lastAim, null);
  stage.cancel(timer);
  stage.prepareShot(shot, SET_SECONDS, positionTimeline, () => rollCaptions(positioning.result));
}

// 접촉에서 고정한 조준을 유지하고 최초 자동 다이빙 신호에서만 판정한다.
function positionTimeline(event) {
  const p = positioning;
  if (state.phase !== 'wait') return null;
  if (event === 'contact') {
    const pre = sampleTrace(0);
    p.aimed = aimAt(p.keeper, state.shots[state.i], pre);
    p.aimCalls = (p.aimCalls || 0) + 1;
    p.contacted = true;
    p.contact = p.elapsed;
    firstPositionHint = false;
    el('moveHint').hidden = true;
    el('caption').innerHTML = '';
    return { shot: p.aimed };
  }
  const ms = (p.elapsed - SET_SECONDS - RUN_SECONDS) * 1000;
  if (p.contacted && diveTrigger(p.keeper, p.aimed, keeperX, ms)) return commit();
  return null;
}

function sampleTrace(endMs) {
  const trace = [];
  for (let ms = -TRACE_MS; ms <= endMs; ms += SAMPLE_MS) trace.push({ ms, x: traceX(positioning.frames, ms) });
  if (trace.at(-1).ms < endMs) trace.push({ ms: endMs, x: keeperX });
  return trace;
}

function commit() {
  if (state.phase !== 'wait') return null;
  state.phase = 'flying';
  stage.cancel(timer);
  setPad(false);
  firstPositionHint = false;
  el('moveHint').hidden = true;
  const shot = positioning.aimed || state.shots[state.i];
  // 봇이 섰는지는 크레딧을 깎기 전에 정한다. 깎고 나서 재면 마지막 구가 사람으로 잡힌다.
  const ran = !positioning.manual && state.auto && state.bot.ms > 0;
  state.botRan = ran;
  botTick();
  // 이 구에 적용되는 버프를 먼저 읽고 그 뒤에 닳는다; 닳고 나서 읽으면 마지막 구가 효과 없이 굴러 판 만큼보다 하나 적다
  const applied = state.buff;
  shotBuff = applied;
  // 버프는 실제로 굴린 구에서만 닳는다. 시간으로 닳으면 상점에 둔 채로 증발한다.
  state.buff = spendBuff(state.buff);
  // 발동 때 소모한 슛 수를 배지에도 바로 반영한다.
  aura();
  const trace = sampleTrace((positioning.elapsed - SET_SECONDS - RUN_SECONDS) * 1000);
  const input = { x: keeperX, vx: keeperVx, trace, auto: ran };
  if (ran) window.__autoCalls += 1;
  // 실제 판정에 넘긴 한 덩어리를 남겨 계기가 표시나 로그가 아닌 입력을 읽는다.
  window.__lastInput = input;
  window.__lastBuff = { kind: applied.kind, shots: applied.shots };
  // 판정이 고른 쪽까지 정해진 뒤에 표시한다. 누른 값으로 표시하면 안 누른 구가 빈 채로 남는다.
  stage.diving = state.keeper.diving;
  const result = resolve({ keeper: ran ? positioning.keeper : state.keeper, shot, rng, input, grip: state.gear.grip, studs: state.gear.studs, pads: state.gear.pads, socks: state.gear.socks, frame: state.gear.frame, focusAid: applied.kind === 'tonic' ? TONIC_FOCUS : 1, rosin: applied.kind === 'rosin', gazeAid: rapportGazeAid(state.rapport, state.gear.city, shot.passer) });
  positioning.resolveCalls = (positioning.resolveCalls || 0) + 1;
  state.results[state.i] = result.conceded;
  // 판정 결과에는 키커 이름이 없다. 장부는 이 자리에서만 이름을 알 수 있다.
  tally(shot.kicker.name, result.conceded);
  // 비행 중에는 자막을 비운다. 자리표시자를 남기면 화면 위쪽에 말줄임표가 박힌 채 촬영된다.
  el('caption').innerHTML = '';
  positioning.resolved = true;
  positioning.trigger = positioning.elapsed;
  positioning.result = result;
  window.__lastInput = result.input;
  window.__positionResult = result;
  return result;
}

// 자막은 체인 순서대로 한 줄씩 나온다. 반전이 반전을 덮으려면 한꺼번에 오면 안 된다.
function rollCaptions(result) {
  /* 잠근 순간 공이 이미 날고 있으면 비행은 timer가 아니라 stage가 굴리므로 취소에 안 걸리고,
     착지해서 여기로 들어와 잔고를 정산한다. 실측으로 잠근 지 5초 뒤에 22가 들어왔고 그것이
     세 번 중 한 번 뽑기 값을 더럽혔다. 잠긴 판은 정산도 안 한다. 결과는 commit이 이미 적었다. */
  if (roundLocked) { state.phase = 'demo'; return; }
  const lines = result.events.slice();
  state.phase = 'caption';
  /* 눈맞음 갈래를 여기서 뽑는다. 판정 rng를 쓰면 그 뒤 모든 구가 밀려 게이트가 통째로 흔들리므로
     화면 쪽 난수를 쓴다. 한 구 안에서 한 번만 뽑아 자막과 자세가 같은 갈래를 본다. */
  for (const e of lines) {
    if (e.t === 'distracted' || e.t === 'talked') e.act = gazeAct(roll);
  }
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
      const gain = state.botRan ? 0 : followerGain(state.keeper, result, state.gear.city, lookBoost(state.gear), shotBuff.kind === 'hype' ? HYPE_BOOST : 1, rapportBoost(state.rapport, state.gear.city, state.shots[state.i].passer), mutualBoost(state.social));
      state.fans += gain;
      // 라포는 말을 섞은 구에서만 쌓인다. 스쳐 지나간 얼굴은 다음에도 남이다.
      // 봇이 뛴 구는 팔로워와 같은 규칙으로 0이다. 봇이 서 있었으니 얼굴이 익을 리 없다.
      if (!state.botRan && result.events.some((e) => e.t === 'talked')) state.rapport = addRapport(state.rapport, state.gear.city, state.shots[state.i].passer);
      // 골드는 구마다 들어온다. 먹혀도 들어오고, 막으면 더 들어온다.
      // 유명한 키커를 막을수록 더 들어온다. 팔로워와 같은 fame 값을 쓴다.
      const coin = coinGain(result.conceded, result.fame, result.untested);
      state.wallet.coin += coin;
      // 구가 끝나면 계정에 한 장 올라간다. 먹힌 구에도 올라가야 성적표가 아니라 사람으로 읽힌다.
      // 이름은 state.i를 올리기 전에 읽는다. result에는 키커 이름이 없다.
      const who = state.shots[state.i].kicker.name;
      /* 글에 반응이 붙는다. 좋아요는 그 구의 화제와 동네가 정하고, 댓글은 얼굴을 튼 사람만 단다.
         굴림은 화면 쪽 난수다. 판정용 rng를 쓰면 그 뒤 모든 구가 밀려 게이트가 통째로 흔들린다. */
      const seen = state.shots[state.i].passer;
      const tier = rapportTier(state.rapport, state.gear.city, seen);
      const post = { n: who, c: result.conceded, g: gain, t: postLine(who, result.conceded, rng),
        /* 좋아요의 밑값과 동네를 글에 박아 둔다. 남이 올린 사진은 내 팔로워가 안 오르므로 g가 0인데,
           그 0으로 좋아요를 되짚으면 화제가 없던 글로 읽힌다. 좋아요를 만든 수는 따로 남는다. */
        lb: gain, ct: state.gear.city, l: likesFor(gain, state.gear.city, roll()) };
      if (roll() * 100 < commentOdds(tier)) {
        post.cm = { city: state.gear.city, passer: seen, tier,
          who: passerName(state.gear.city, seen, tier), text: commentLine(result.conceded, tier, roll) };
      }
      state.posts.push(post);
      /* 그 구를 지켜본 사람이 나를 찍어 자기 계정에 올린다. 얼굴을 튼 사이라야 태그를 걸고,
         지나간 사람이 없던 구에는 찍은 사람도 없다. 사진은 저장에 이미지를 넣지 않는다.
         한 장이 47KB라 열두 장이면 저장 한도를 위협하고, 그림은 지금 차림에서 다시 구우면 된다. */
      if (state.shots[state.i].gaze && tier > 0 && roll() * 100 < photoOdds(tier)) {
        state.posts.push({ n: passerName(state.gear.city, seen, tier), c: result.conceded, g: 0,
          t: photoLine(result.conceded, tier, roll),
          lb: gain, ct: state.gear.city, l: likesFor(gain, state.gear.city, roll()),
          ph: { city: state.gear.city, passer: seen, tier,
            h: state.keeper.height, w: state.keeper.weight, look: lookOf(state.gear, state.keeper.name) } });
      }
      while (state.posts.length > FEED_CAP) state.posts.shift();
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
    // 눈맞음은 갈래가 있고 자막과 자세가 그 갈래를 같이 따라간다. 한쪽만 갈리면 둘이 서로를 배신한다.
    if (e.t !== 'result') stage.act(e.t, e.act);
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
  // 초읽기는 시간만 그린다. 화면에 없는 접촉을 메트로놈처럼 소리로 채우지 않는다.
  // 자막은 세로 flex다. 라벨과 숫자를 형제로 넣으면 두 칸으로 갈리고, column-reverse라
  // 숫자가 실점 원인 배지 자리로 올라간다. 한 span 안에 넣어 한 줄로 붙인다.
  // 구조는 한 번만 만들고 숫자만 간다. 매 틱 새 span이면 등장 애니메이션이 0.1초마다 다시 돈다.
  el('caption').innerHTML = '<span>' + label + ' <b class="tick"></b></span>';
  const tickEl = el('caption').querySelector('.tick');
  const tick = () => {
    const now = stage.now();
    const left = until - now;
    if (left <= 0) { el('caption').textContent = ''; then(); return; }
    tickEl.textContent = left.toFixed(1) + 's';
    timer = stage.after(0.1, tick);
  };
  tick();
}

function restart(result) {
  persist();
  const hand = ballInHand(result);
  countdown(restartDelay(state.keeper, result), hand ? CAUSE_LABEL.throwing : CAUSE_LABEL.goalKick, nextShot);
}

function endSet() {
  const conceded = state.results.filter(Boolean).length;
  // 세트 사이에 다른 자막이 끼어도 사람은 이 줄만 이어서 기억한다. 직전 요약을 따로 들고 금지한다.
  lastSetEnd = setEndLine(5 - conceded, rng, lastSetEnd);
  say(lastSetEnd, null);
  // 판이 끝나면 레벨이 오르고 훈련 두 번이 쌓인다. 자동은 바로 훈련한다.
  // 자동 팝업이 없으므로 전 스탯 만렙이어도 다음 판이 그대로 온다.
  state.keeper.level += 1;
  state.points += 2;
  // 완봉이면 이적시장 이용권 한 장. 규칙은 판정이 소유하고 화면은 그 답을 받는다.
  state.tickets = ticketGain(state.results, state.tickets);
  if (state.coach) trainKeeper();
  persist();
  pips();
  timer = stage.after(0.9, () => countdown(setBreak(), '한숨 돌리는 중', nextSet));
}

/* 관찰자 하나. 창 크기가 바뀌면 넘침이 다시 계산되므로, 그릴 때와 굴릴 때만 세면 옛 답이 남는다.
   내 정보와 위키가 각자 제 상자에 두고 있는 그것이고, 구르는 창 중에 훈련장만 없었다. */
let gymWatch = null;
let lastAutoTraining = '';
let shotBuff = newBuff();
// 능력치 효과 표시. 훈련장과 내 정보가 같은 기억을 나눈다.
const { fxText, fillImpact } = createImpact({ state, el });

// 손과 자동은 같은 성장 굴림과 저장, 외형 갱신을 쓴다. 예산은 쌓인 훈련 포인트뿐이다.
function trainKeeper(stat) {
  if (state.points <= 0) return;
  const result = stat === undefined ? autoTrain(state.keeper, state.points, rng) : trainStat(state.keeper, stat, rng);
  if (!result.spent) return;
  Object.assign(state.keeper, result.keeper);
  state.points -= result.spent;
  if (stat === undefined) {
    const line = result.lines.at(-1);
    lastAutoTraining = '자동 훈련: ' + CAUSE_LABEL[line.stat] + ' ' + line.before + ' → ' + line.after;
  }
  persist();
  stage.setKeeper(state.keeper, lookOf(state.gear, state.keeper.name));
  pips();
  renderGym();
}



// 훈련장. 열고 닫는 것은 손이고, 열려 있는 동안에도 판은 돈다.
// 포인트가 0이어도 열린다. 그때는 내 스탯을 보는 창이다.
function renderGym() {
  const box = el('gym');
  // 제목과 수를 점으로 잇지 않는다. 창 이름은 제목이 갖고 수는 그 뒤 작은 줄이 갖는다.
  // 남은 훈련이 없으면 작은 줄을 비운다. 없다는 문장은 빈 자리 위 라벨이고, 꺼진 칸들이 이미 그것을 말한다.
  const head = '훈련장' + (state.points > 0 ? '<small>남은 훈련 ' + state.points + '회</small>' : '') + (lastAutoTraining ? '<small class="auto-training">' + lastAutoTraining + '</small>' : '');
  box.innerHTML = '<h4>' + head + '</h4><div class="row">' + GROWABLE.map((k) => {
    const v = state.keeper[k];
    // 능력치에 상한이 없다. 남은 훈련이 없을 때만 꺼진다. 10을 넘는 몫은 판정이 체감 곡선으로 줄이고, 그 몫은 아래 줄이 말한다.
    const off = state.points <= 0;
    const tail = v + ' → ' + (v + 1);
    return '<button data-k="' + k + '"' + (off ? ' disabled' : '') + '><span class="who">' + STAT_ICON[k]
      + CAUSE_LABEL[k] + '</span><em>' + tail + '</em><small class="fx" data-fx="' + k + '">' + fxText(k) + '</small></button>';
  }).join('') + '</div><button class="close">닫기</button>'
    /* 굴러간다는 자국. 내 정보가 쓰는 그 겹을 같은 클래스로 둔다. 마지막에 두는 것은 칠하는 차례
       때문이다. 앞에 두면 자리를 잡은 칸들이 이 겹을 덮는다. */
    + '<div class="cue down" aria-hidden="true"></div>';
  box.querySelector('.close').onclick = closeGym;
  for (const b of box.querySelectorAll('.row button')) {
    b.onclick = () => {
      if (b.disabled || state.points <= 0) return;
      trainKeeper(b.dataset.k);
    };
  }
  /* 굴러가는 창이 제가 구른다는 사실을 화면에 하나도 안 적었다. 실측 740x360에서 성장 칸이 전부
     상한이면 환전 줄이 한 칸 더 붙어 기둥이 327px이 되고, 닫기는 402px에 서서 화면 밖에 남는다.
     내 정보가 쓰던 그 신호를 그대로 부른다. 구르는 것이 칸이 아니라 창이라 굴러가는 상자를 밖에서
     넘긴다. 안 넘기면 첫 자식인 제목 줄을 재게 되어 넘침이 늘 0이고 신호가 영영 안 켜진다. */
  box.onscroll = () => scrollCue(box, box);
  fillImpact('next', 'gym', (b) => scrollCue(b, b));
  /* 화면이 줄면 기둥은 그대로인데 접힘이 올라와 안 구르던 창이 구르기 시작한다. 그릴 때와 굴릴 때만
     세면 그 사이에 아무도 다시 안 세어, 자국이 꺼진 채로 닫기가 접힘 아래에 남는다. 실측 1280x720에서
     열어 두고 740x360으로 줄이면 넘침이 54인데 자국은 꺼진 채였고, 닫기는 402.45에 서서 화면 밖에
     42.45px 남았다. 되살리는 것은 첫 굴림인데, 굴리라고 부르는 것이 바로 그 자국이다.
     관찰자는 하나만 두고 그릴 때마다 도로 붙인다. 그릴 때마다 새로 만들면 같은 상자를 붙든 관찰자가
     그 수만큼 쌓인다. 창을 닫을 때 안 끊는 것도 둘과 같다. 상자가 숨으면 잰 값이 0이라 부를 일이 없다. */
  if (!gymWatch) gymWatch = new ResizeObserver(() => { const g = el('gym'); scrollCue(g, g); });
  gymWatch.disconnect();
  gymWatch.observe(box);
  scrollCue(box, box);
}

// 창은 한 번에 하나만 선다. 닫기 전에 겹쳐 열리면 뒤엣것이 앞엣것을 덮고,
// 닫았을 때 무엇이 남는지가 닫아 봐야 안다. 만남만 예외다. 내 정보 안의 버튼으로만
// 열리고 닫으면 그 자리로 돌아가는 한 단계라 부모를 같이 닫으면 길이 끊긴다.
// 개봉은 창이 아니라 상점이 낳는 화면이라 다른 창을 닫지 않는다. 반대로 개봉이 서 있는 동안에는
// 어떤 창도 안 열린다. 개봉판은 화면 전체를 덮어 사람의 클릭을 이미 막고 있으므로, 열리는 창은
// 손잡이로만 열리는 창이고 그때 첫 진입 개봉이 조용히 걷힌다. 처음 오는 사람이 자기가 무엇을
// 들고 시작하는지를 못 보고 지나가는 자리이고, 계기가 사람이 못 가는 상태를 재게 되는 자리다.
/* 상점과 개봉. 선반, 시착실, 뽑기 배너, 개봉 연출, 첫 진입 개봉을 한 창이 든다. 게임 상태와 지갑과 무대는 부르는 쪽이 넘긴다. */
const { openShop, closeShop, stopReveal, revealAll, onboardStep, revealState, clearFitting } = createShopPanel({ state, el, affordable, PRICE, purchase, persist, pips, stage, recruit, roll, shutOthers });
/* 선수단 창. 보는 포지션과 포메이션 판을 스스로 들고, 영입과 교체는 게임 상태와 지갑과 무대를 받아 한다. */
const { openRoster, closeRoster } = createRosterPanel({ state, el, affordable, PRICE, purchase, recruit, persist, pips, stage, shutOthers, clearFitting: () => clearFitting() });
/* 아웃문그램과 만남 창. 쪽지와 만남의 열린 자리를 스스로 들고, 게임 상태와 저장과 창 전환만 받는다. 창 닫기 표가 닫는 함수를 읽으므로 그 표보다 먼저 선다. */
const { openGram, closeGram } = createGramPanel({ state, el, roll, persist, pips, shutOthers });
const { openDate, closeDate } = createDatePanel({ state, el, roll, persist, pips, shutOthers, renderMe, purchase, FEED_CAP });
const PANEL_SHUT = { gym: closeGym, roster: closeRoster, gram: closeGram, me: closeMe, date: closeDate, shop: closeShop, wiki: closeWiki, pull: stopReveal };
const CATEGORY = { wiki: '.cats [data-cat]', roster: '.kind[data-pos]', me: '.tab[data-tab]', shop: '.tab[data-tab]' };
const panelStack = [];
const panelFocus = new Map();
const buttons = (box) => {
  for (const control of box.querySelectorAll('*')) {
    if (control.onclick && !control.matches('button, input, select, a[href], [tabindex]')) {
      control.tabIndex = 0;
      control.setAttribute('role', 'button');
    }
  }
  return [...box.querySelectorAll('button, input, select, a[href], [tabindex]')]
    .filter((b) => !b.disabled && b.tabIndex >= 0 && b.getClientRects().length);
};
const bookmark = (target) => {
  const panel = target?.closest?.(Object.keys(PANEL_SHUT).map((id) => '#' + id).join(','));
  return { target, panel, index: panel ? buttons(panel).indexOf(target) : -1 };
};
const restore = (mark) => {
  const target = mark?.target?.isConnected ? mark.target : mark?.panel && buttons(mark.panel)[mark.index];
  if (target?.getClientRects().length) target.focus({ preventScroll: true });
};
let lastFocus = bookmark(document.activeElement);
addEventListener('focusin', (e) => { lastFocus = bookmark(e.target); });
// Focus before pointerdown openers replace their content; native click still owns activation.
addEventListener('pointerdown', (e) => {
  const button = e.target.closest?.('button');
  button?.focus();
  if (button?.onpointerdown && !button.onclick) e.preventDefault();
}, true);
// MutationObserver covers every existing opener and renderer, including nested dates and reveals.
const panelObserver = new MutationObserver(() => {
  let returning;
  let opened = false;
  for (const id of [...panelStack].reverse()) {
    if (!el(id).hidden) continue;
    returning = panelFocus.get(id);
    panelFocus.delete(id);
    panelStack.splice(panelStack.indexOf(id), 1);
  }
  for (const id of Object.keys(PANEL_SHUT)) {
    if (el(id).hidden || panelStack.includes(id)) continue;
    panelFocus.set(id, lastFocus);
    panelStack.push(id);
    opened = true;
    (el(id).querySelector(CATEGORY[id] || '.close') || buttons(el(id))[0])?.focus({ preventScroll: true });
  }
  if (returning && !opened) restore(returning);
  else if (!lastFocus.target?.isConnected) restore(lastFocus);
});
for (const id of Object.keys(PANEL_SHUT)) panelObserver.observe(el(id), { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden'] });
function shutOthers(keep) {
  if (keep !== 'pull' && !el('pull').hidden) return false;
  const spare = keep === 'date' ? ['me', 'date'] : [keep];
  for (const id of Object.keys(PANEL_SHUT)) {
    if (spare.includes(id)) continue;
    if (!el(id).hidden) PANEL_SHUT[id]();
  }
  return true;
}

function openGym() {
  if (!shutOthers('gym')) return;
  el('gym').hidden = false;
  renderGym();
}

function closeGym() {
  el('gym').hidden = true;
}


/* 내 정보 창의 신호 둘. 칸이 구르는 화면과 창이 구르는 화면이 갈리므로 둘을 같이 다시 센다.
   scrollCue는 살아 있는 값만 읽어 몇 번 불러도 같은 답이라, 어느 쪽이 움직였는지는 안 물어도 된다. */
function meCues() {
  const box = el('me');
  if (!box) return;
  scrollCue(box.querySelector('.panebox'));
  const roll = meRoller();
  scrollCue(box, roll);
  /* 창 신호의 위끝. 카드가 구르면 굴림의 위끝은 화면 맨 위가 아니라 붙박이 머리(큰 수와 탭) 바로 아래다. */
  const up = box.querySelector(':scope > .cue.up');
  const head = roll !== box ? roll.querySelector('.mehead') : null;
  if (up) up.style.top = head ? Math.round(head.getBoundingClientRect().bottom) + 'px' : '';
}

/* 내 정보에서 실제로 구르는 상자. 넓은 화면은 창(칸이 제 스크롤을 가짐), 세로가 짧은 화면은 카드다. */
function meRoller() {
  const box = el('me');
  const card = box && box.querySelector('.card');
  return card && /auto|scroll/.test(getComputedStyle(card).overflowY) ? card : box;
}

// 위키. 물음표 하나가 여는 카테고리 가이드다. 재화 칩이 열던 버는 법도 이 안의 한 칸이다.
// 표의 수는 wiki.mjs가 상수에서 읽으므로 이 자리는 화면에 붙이는 일만 한다.
let wikiAt = wikiUI.WIKI_CATS[0].key;
let wikiWatch = null;
window.addEventListener('wiki-ready', () => { if (el('wiki') && !el('wiki').hidden) paintWiki(); });

function paintWiki() {
  const box = el('wiki');
  box.innerHTML = wikiUI.wikiHTML(wikiAt);
  box.querySelector('.body').innerHTML = wikiUI.wikiBody(wikiAt);
  wikiUI.mountWikiBuild?.(box);
  // 닫기는 모든 창이 같은 자리에 세우는 창의 부품이라 시트 격자 밖, 창의 직계로 옮긴다.
  box.append(box.querySelector('.close'));
  for (const b of box.querySelectorAll('.cats [data-cat]')) b.onclick = () => { wikiAt = b.dataset.cat; paintWiki(); };
  box.querySelector('.close').onclick = closeWiki;
  for (const link of box.querySelectorAll('.wiki-prose a')) link.onclick = (event) => {
    const id = link.getAttribute('href').replace(/^\.\//, '').replace(/\.html$/, '');
    if (box.querySelector('.cats [data-cat="' + id + '"]')) { event.preventDefault(); wikiAt = id; paintWiki(); }
  };
  const body = box.querySelector('.body');
  body.onscroll = () => scrollCue(box.querySelector('.bodybox'));
  /* 창 크기가 바뀌면 넘침이 다시 계산된다. 그릴 때와 굴릴 때만 세면 창만 바뀐 화면에 옛 답이 남는다.
     실측으로 조작 칸을 740x360에서 그린 뒤 1280x720으로 늘리면 넘침이 0인데 그늘은 켜진 채였고,
     줄이면 넘침이 130인데 그늘은 꺼진 채라 가린 줄이 다시 조용해졌다. 이 함수는 살아 있는 값만 읽어
     몇 번 불러도 같은 답이라 창이 움직일 때마다 그냥 다시 부르면 된다.
     관찰자는 하나만 두고 그릴 때마다 새 본문으로 옮겨 붙인다. 그릴 때마다 새로 만들면
     떨어져 나간 옛 본문을 붙든 관찰자가 그 수만큼 쌓인다. */
  if (!wikiWatch) wikiWatch = new ResizeObserver(() => scrollCue(el('wiki').querySelector('.bodybox')));
  wikiWatch.disconnect();
  wikiWatch.observe(body);
  scrollCue(box.querySelector('.bodybox'));
}

function openWiki(cat) {
  if (!shutOthers('wiki')) return;
  wikiAt = cat || wikiUI.WIKI_CATS[0].key;
  el('wiki').hidden = false;
  el('wikiBtn').setAttribute('aria-expanded', 'true');
  paintWiki();
}

function closeWiki() {
  el('wiki').hidden = true;
  el('wikiBtn').setAttribute('aria-expanded', 'false');
}


// 히든 둘은 숫자가 아니라 문구로 뜬다. 숫자를 걸면 훈련장에서 올릴 수 있는 칸으로 읽힌다.
const HIDDEN_LABEL = { consistency: '기복', professionalism: '프로의식' };
// 기본값이 5다. 5를 가운데로 두고 위아래 두 칸씩 벌려야 평범한 선수가 평범하게 읽힌다.
function hiddenBand(key, v) {
  if (key === 'consistency') return v >= 8 ? '한결' : v >= 6 ? '안정' : v >= 4 ? '변동' : '불안';
  return v >= 8 ? '성실' : v >= 6 ? '근면' : v >= 4 ? '적당' : '회피';
}

// 내 정보. 오른쪽 기둥이 찼으므로 좌상단 레벨 칩이 진입이다.
// 상대 전적. 만나본 키커만 올린다. 명단 77명을 다 깔면 읽을 것이 사라진다.
// 먹힌 수를 먼저 세워 누구한테 약한지가 맨 위에 오게 한다.
function recordRows() {
  /* 최근 열 판. 내가 선 판만 센다. 남이 찍어 올린 사진과 셀카는 판이 아니라 글이라,
     같이 세면 막지도 먹히지도 않은 줄이 전적에 섞인다. 최근이 위로 오게 뒤집는다. */
  const played = state.posts.filter((p) => !p.ph && !p.sf).slice(-10);
  const recent = played.length
    ? '<div class="log">' + played.map((p) => '<span>' + p.n
      + '<b class="' + (p.c ? 'gone' : 'save') + '"></b></span>').reverse().join('') + '</div>'
    : '<div class="note dim"><span></span></div>';
  const names = Object.keys(state.record);
  names.sort((a, b) => {
    const x = state.record[a];
    const y = state.record[b];
    return (y.conceded - x.conceded) || (y.saved + y.conceded - x.saved - x.conceded) || a.localeCompare(b);
  });
  /* 상대 전적은 표다. 줄로 깔면 이름 길이에 따라 수가 줄마다 다른 자리에 서서, 어느 칸이
     막은 수인지를 줄마다 다시 읽어야 한다. 얼굴이 첫 칸이라 누구한테 약한지가 글자 앞에 온다. */
  const rows = names.map((n) => {
    const r = state.record[n];
    const k = kickerByName(n);
    const face = k ? '<img alt="' + n + '" src="' + thumbURL('face', k, lookOf({}, n)) + '">' : '';
    return '<tr><td>' + face + '</td><td>' + n + '</td><td><em>' + r.saved
      + '</em></td><td><i>' + r.conceded + '</i></td></tr>';
  }).join('');
  const table = names.length
    ? '<table><thead><tr><th></th><th>이름</th><th>세이브</th><th>실점</th></tr></thead><tbody>'
      + rows + '</tbody></table>'
    : '<div class="note dim"><span></span></div>';
  /* 표가 먼저 선다. 이 칸을 여는 이유가 누구한테 약한지라, 그 답이 굴리기 전에 서야 한다. 실측
     1280x720에서 칸이 접히는 자리가 243px인데, 최근 열 판이 위에 서면 표의 첫 줄이 접힘 아래
     214px에 선다. 최근은 그 답을 받치는 줄이라 아래로 내려가고, 아래끝 그늘이 거기 더 있다고 말한다. */
  /* 비어 있는 갈래는 제목째 안 선다. 빈 표 위의 제목은 빈 상자 위 라벨이다(빈 칸은 비워 두거나 아이콘, 파운더 판정).
     둘 다 비면 아는 얼굴이 없을 때와 같은 얼굴 실루엣 하나만 선다. 막을 상대가 생겨야 채워질 자리라서다. */
  if (!names.length && !played.length) return '<div class="note dim">' + IC_NOFACE + '</div>';
  return (names.length ? table : '')
    + (played.length ? '<div class="note"><b>최근</b></div>' + recent : '');
}

// 만남 버튼 글자. 문은 판정이 열고, 값을 어떻게 보여 줄지는 화면이 정한다.
function dateLabel(g) {
  if (g.open) return PRICE(g.cost);
  // 못 사는 것은 붉은 값과 비활성 버튼이 말한다. 모자란 액수를 적으면 같은 물건이 지갑마다 다른 수로 읽힌다.
  if (g.short > 0) return PRICE(DATE_COST);
  return '만남';
}


// 명단에서 온 키퍼. 걸친 것은 사람마다 따로이므로 새로 온 사람은 맨몸에서 시작한다.
// 여기 한 곳에서만 만들면 이적시장과 영입이 서로 다른 상태의 키퍼를 밀어 넣을 수 없다.
function recruit(entry) {
  const k = keeperFromRoster(entry);
  k.worn = {};
  for (const f of WORN_FIELDS) k.worn[f] = 0;
  return k;
}

// 아는 얼굴. 라포는 이미 판정과 팔로워에 붙는데 화면 어디에도 없어서 플레이어가 늘어난 줄을 몰랐다.
/* 단계 바의 칸 수. 판정이 가진 문턱 수를 되물어 만든다. 여기 3을 적으면 문턱이 늘어난 날
   바가 조용히 짧아지고, 화면은 다 찼다고 말하는데 판정은 아직 한 칸 남았다고 센다. */
const TIER_TOP = rapportTier({ '0:0': 999 }, 0, 0);

function rapportRows() {
  const keys = Object.keys(state.rapport || {});
  /* 빈 칸이 받는 것은 빈 채로 두기와 아이콘 둘뿐이다. 파운더가 세운 규칙이고 열거형이라,
     안내 문장이든 명사구 한 줄이든 글자는 셋째 것이라 여기 안 선다. 둘 중 아이콘을 세운다.
     빈 띠 하나는 화면이 덜 그려진 것으로 읽혔고, 실루엣 하나면 이 자리에 설 것이 사람이라는
     것이 글자 없이 선다. 띠의 높이는 그대로 둔다. 아이콘이 띠를 밀면 빈 칸을 채운 일이
     아래 칸을 다 내리는 일이 된다.
     머리 카드는 줄과 함께 나간다. 아이콘을 띠에 세운 뒤에도 파운더가 본 것은 빈 상자 위에 선
     라벨 둘이었다. 위의 탭이 이미 아는 얼굴이라, 셀 것이 없는 칸에서 머리는 같은 말을 한 번 더
     하고 글자만 둘 남긴다. 머리는 줄을 세는 자리이므로 셀 줄이 있는 아래에만 선다. */
  if (!keys.length) return '<div class="note dim">' + IC_NOFACE + '</div>';
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
    // 다음 단계까지의 대화 수. 마지막 문턱을 넘으면 분모가 없다.
    const next = RAPPORT_STEPS.find((s) => s > n);
    // 만남은 이 사람에게 붙은 행동이라 그 줄 안에 둔다. 못 누르는 사유도 버튼이 직접 말한다.
    const g = dateGate(state.rapport, city, passer, state.wallet.coin, state.wallet.cash);
    /* 줄이 아니라 카드다. 실루엣과 동네와 단계 바와 만남 버튼이 한 장에 같이 서야 이 사람이
       지금 어디까지 왔는지가 수를 읽기 전에 보인다. 생김새는 저장에 없으므로 실루엣이다. */
    return '<div class="note met"><span class="ava anon">' + IC_FANS + '</span>'
      /* 게임 UI의 호감도 문법. 이름과 동네 태그, 단계 칸과 다음 단계까지의 대화 수(말풍선 n/다음),
         효과는 이름과 값의 칩이다. 문장(말 섞은 횟수 n. 2단계. 한눈팔기 x% 감소)은 수를 글 속에 숨겨 가독성이 나빴다(파운더 2026-09-28). */
      + '<b>' + who + '<small>' + cityAt(city).name + '</small></b>'
      + '<span class="bar" role="img" aria-label="' + tier + ' / ' + TIER_TOP + '">' + Array.from({ length: TIER_TOP }, (_, at) =>
        '<u' + (at < tier ? ' class="on"' : '') + '></u>').join('') + '<em class="cnt">' + IC_CMT.replace('댓글', '대화') + n + (next ? '/' + next : '') + '</em></span>'
      + (aid || fans ? '<i class="fx">' + (aid ? '<s>한눈팔기<b>-' + aid + '%</b></s>' : '') + (fans ? '<s>팔로워<b>+' + fans + '%</b></s>' : '') + '</i>' : '')
      + '<button class="go' + (g.short > 0 ? ' bad-price' : '') + '" data-city="' + city + '" data-passer="' + passer + '"' + (g.open ? '' : ' disabled') + '>' + dateLabel(g) + '</button></div>';
  }).join('');
  return rows;
}

/* 내 정보는 성격이 다른 넷을 한 두루마리에 쌓고 있었다. 능력치를 보러 온 사람과 전적을
   보러 온 사람은 다른 질문을 들고 오는데 화면은 하나라, 아래로 계속 긁어야 답이 나왔다.
   세 칸으로 가른다. 초상화와 걸친 것은 어느 칸에서도 남는다. 그것은 칸의 내용이 아니라
   지금 누구를 보고 있는지이기 때문이다. */
const ME_TABS = [['stat', '능력치'], ['face', '아는 얼굴'], ['log', '전적'], ['rank', '랭킹']];
let meTab = 'stat';

/* 랭킹 칸은 제 판과 서버 줄을 스스로 든다. 창은 게임 상태와 다시 그리기만 넘긴다. */
const rankPane = createRankPane({ state, isOpen: () => meTab === 'rank' && !el('me').hidden, rerender: () => renderMe() });
// 관찰자 하나. 창 크기가 바뀌면 넘침이 다시 계산되므로, 그릴 때와 굴릴 때만 세면 옛 답이 남는다.
let meWatch = null;

function renderMe() {
  const box = el('me');
  const k = state.keeper;
  const name = k.name || '무명';
  /* 지금 걸친 것. 이름은 선반 데이터에서 꺼낸다. 화면이 따로 적으면 선반이 바뀐 날 둘이 갈린다.
     갈래를 둘로 나눈다. 몸에 걸친 여섯은 이 키퍼의 것이고 골대와 동네는 계정의 것이라,
     사람을 바꾸면 앞의 여섯만 따라 바뀐다. 한 목록에 섞으면 그 차이가 화면에서 사라진다. */
  const wearRow = (key) => {
    const s = SHELVES[key];
    return '<i data-wear="' + s.field + '"><b>' + s.head + '</b>' + s.at(state.gear[s.field]).name + '</i>';
  };
  const wear = '<div class="wear"><span class="shot"><img alt="' + name + '" src="'
    + thumbURL('body', k, lookOf(state.gear, state.keeper.name)) + '"></span>'
    + '<div class="on"><h5>몸에 걸친 것</h5>' + ['glove', 'boot', 'kit', 'sock', 'hair', 'beard', 'ink'].map(wearRow).join('')
    + '<h5>서 있는 자리</h5>' + ['frame', 'city'].map(wearRow).join('') + '</div></div>';
  const grid = GROWABLE.map((s) => {
    const v = k[s];
    // 10은 성장 상한이다. 훈련장과 같은 기준이어야 두 창이 어긋나지 않는다.
    // 값 자리에는 값만 적는다. 상한에 닿은 것은 max 칸이 말한다.
    return '<span title="훈련 전(1)에 비해 지금 이 능력치가 버는 몫"><span class="who">' + STAT_ICON[s] + CAUSE_LABEL[s]
      + '</span><b>' + v + '</b><small class="fx" data-fx="' + s + '">' + fxText(s, 'held') + '</small></span>';
  }).join('');
  const traits = (k.traits && k.traits.length)
    ? k.traits.map((t) => '<div class="note"><b>' + t + '</b><i>' + (TRAITS[t] ? TRAITS[t].note : '') + '</i></div>').join('')
    : '';
  const hidden = HIDDEN.map((h) => '<div class="note"><b>' + HIDDEN_LABEL[h] + '</b><i>' + hiddenBand(h, k[h]) + '</i></div>').join('');
  const pane = meTab === 'log' ? recordRows()
    : meTab === 'rank' ? rankPane.html()
    : meTab === 'face' ? rapportRows()
      : '<div class="grid">' + grid + '</div>' + traits + hidden;
  const tabs = '<div class="tabs">' + ME_TABS.map(([id, label]) =>
    '<button class="tab" data-tab="' + id + '"' + (meTab === id ? ' aria-current="true"' : '') + '>' + label + '</button>').join('') + '</div>';
  /* 첫 단. 누구를 보고 있는지다. 초상이 이름 앞에 서야 사람이 먼저 읽힌다. 컨디션은 상단 칩이
     이미 판정한 값이라 칩이 낸 그림을 그대로 옮겨 온다. 여기서 다시 재면 문턱이 두 곳이 된다. */
  const cond = el('form').innerHTML;
  /* 둘째 단. 세이브율과 막은 수와 먹힌 수. 셋 다 장부를 그 자리에서 더해 만든다. 화면이 제 수를
     따로 세면 장부가 움직인 날 둘이 갈린다. 창을 여는 이유가 이 셋이라 탭 위에 선다. */
  const led = Object.keys(state.record).reduce((a, n) => {
    a.s += state.record[n].saved;
    a.c += state.record[n].conceded;
    return a;
  }, { s: 0, c: 0 });
  const rate = led.s + led.c > 0 ? Math.round((led.s / (led.s + led.c)) * 100) : 0;
  const big = '<div class="big"><span><b>' + rate + '%</b><i>세이브율</i></span>'
    + '<span><b>' + led.s + '</b><i>세이브</i></span>'
    + '<span><b>' + led.c + '</b><i>실점</i></span></div>';
  box.innerHTML = '<h4 class="ptitle">내 정보</h4>' + tabs + '<h4><img class="pfp" alt="' + name + '" src="'
    + thumbURL('face', k, lookOf(state.gear, state.keeper.name)) + '">' + name
    + '<small><i>Lv ' + k.level + '</i><i>' + k.height + 'cm</i><i>' + k.weight + 'kg</i>'
    + '<i class="cond">' + cond + '</i></small></h4>'
    /* 큰 수와 탭은 한 머리로 묶는다. 넓은 화면에서는 묶음이 없는 것처럼 서고(display:contents),
       세로가 짧은 화면에서는 카드가 구르는 동안 이 머리가 붙박이로 남는다. 상점과 선수단의 창 뼈대와 같다. */
    /* 걸친 것은 능력치 칸의 끝에 선다. 키퍼 자신의 것이라 얼굴과 전적 칸에는 안 선다. 칸 밖 띠로 세우면 탭이 창 위로 올라간 뒤
       칸이 모자랄 때 답 대신 띠가 자리를 지켰다(1280x720에서 능력치 열다섯 중 다섯만 보였다). */
    + '<div class="card"><div class="mehead">' + big + '</div><div class="panebox"><div class="pane">' + pane + (meTab === 'stat' ? wear : '') + '</div>'
    + '<div class="cue up" aria-hidden="true"></div><div class="cue down" aria-hidden="true"></div></div></div>'
    + '<button class="close">닫기</button>'
    /* 창이 구르는 화면에서 쓰는 신호. 칸의 것과 같은 클래스로 두어 그늘 규칙이 한 벌로 남는다.
       마지막에 두는 것은 칠하는 차례 때문이다. 앞에 두면 자리를 잡은 칸 상자가 이 겹을 덮는다. */
    + '<div class="cue up" aria-hidden="true"></div><div class="cue down" aria-hidden="true"></div>';
  box.querySelector('.close').onclick = closeMe;
  for (const b of box.querySelectorAll('.tab')) b.onclick = () => { meTab = b.dataset.tab; renderMe(); if (meTab === 'rank') rankPane.sync(); };
  if (meTab === 'rank') rankPane.bind(box);
  for (const b of box.querySelectorAll('.note .go')) b.onclick = () => openDate(Number(b.dataset.city), Number(b.dataset.passer));
  /* 칸이 넘치면 아래끝에 그늘 한 겹이 선다. 위키가 쓰던 그 함수를 그대로 부른다.
     관찰자는 하나만 두고 그릴 때마다 새 칸으로 옮겨 붙인다. 그릴 때마다 새로 만들면
     떨어져 나간 옛 칸을 붙든 관찰자가 그 수만큼 쌓인다. */
  const paneEl = box.querySelector('.pane');
  paneEl.onscroll = meCues;
  /* 창 자신이 구르는 화면에서는 손가락이 미는 것이 칸이 아니라 창이다. 여기를 안 이으면
     그 화면에서 신호가 그릴 때 한 번 서고 그대로 굳어, 끝까지 굴려도 안 뒤집힌다. */
  box.onscroll = meCues;
  box.querySelector('.card').onscroll = meCues;
  if (!meWatch) meWatch = new ResizeObserver(meCues);
  meWatch.disconnect();
  meWatch.observe(paneEl);
  /* 창도 같이 본다. 화면이 바뀌면 상한이 걷히거나 붙어 구르는 상자가 칸에서 창으로 넘어가는데,
     칸만 보면 그 순간 창의 넘침을 아무도 다시 안 센다. 관찰자는 그대로 하나다. */
  meWatch.observe(box);
  if (meTab === 'stat') fillImpact('held', 'me', () => meCues());
  meCues();
}

function openMe() {
  if (!shutOthers('me')) return;
  el('me').hidden = false;
  renderMe();
}

function closeMe() {
  el('me').hidden = true;
  // 닫을 때 보던 칸이 남으면 다음에 연 사람이 능력치를 찾아 탭을 눌러야 한다. 상점 선반과 같은 규칙이다.
  meTab = 'stat';
}




for (const b of document.querySelectorAll('.move-arrow')) {
  b.onpointerdown = (e) => {
    e.preventDefault();
    if (Number.isFinite(e.pointerId)) b.setPointerCapture(e.pointerId);
    holdMovement('pointer:' + e.pointerId, Number(b.dataset.move));
  };
  const release = (e) => holdMovement('pointer:' + e.pointerId, 0);
  b.onpointerup = release;
  b.onpointercancel = release;
  b.onlostpointercapture = release;
}
addEventListener('blur', () => { held.clear(); paintMovement(); });
addEventListener('keyup', (e) => holdMovement('key:' + e.key, 0));
const autoBtn = el('auto');
autoBtn.classList.toggle('on', state.auto);
autoBtn.onpointerdown = () => {
  // 크레딧이 없으면 켜지지 않는다. 대신 어디서 사는지를 연다.
  if (!state.auto && state.bot.ms <= 0) {
    openShop('bot');
    return;
  }
  state.auto = !state.auto;
  if (state.auto) state.coach = true;
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
el('wikiBtn').onpointerdown = (e) => {
  e.stopPropagation();
  if (el('wiki').hidden) openWiki(); else closeWiki();
};
for (const id of ['lv', 'form', 'pips']) {
  const button = el(id);
  button.dataset.hudLink = id;
  button.setAttribute('aria-label', HUD_LINKS[id].label);
  button.title = HUD_LINKS[id].label;
}
// Native buttons supply Enter/Space clicks, as in keys.mjs; delegation survives HUD repaint.
addEventListener('click', (e) => {
  const button = e.target.closest?.('button[data-hud-link]');
  const link = button && HUD_LINKS[button.dataset.hudLink];
  if (!link) return;
  e.stopPropagation();
  if (link.panel === 'gram') openGram();
  else openWiki(link.cat);
});
// 진단용. __pick은 화소 피킹이 이미 쓴다.
window.__squad = () => ({ squad: state.squad.map((k) => k.name), pick: state.pick, coin: state.wallet.coin });
window.__roster = (open) => { if (open) openRoster(); else closeRoster(); };
window.__gym = (open) => { if (open) openGym(); else closeGym(); };
// 그린 창과 잰 창을 맞대는 자리. 화면이 읽은 값과 판정이 쓰는 값을 같이 돌려준다.
window.__beat = () => ({ retired: true });
window.__gram = (open) => { if (open) openGram(); else closeGram(); };
window.__me = (open) => { if (open) openMe(); else closeMe(); };
window.__meRoller = () => meRoller();
// 만남은 내 정보 안의 버튼으로만 열린다. 게이트가 그 버튼까지 클릭해서 오게 하려면 좌표가 필요하다.
window.__date = (city, passer) => { if (city === undefined) closeDate(); else openDate(city, passer); };
window.__shop = (open) => { if (open) openShop(); else closeShop(); };
// 재화 칩이 열던 버는 법은 위키의 재화 칸이 가져갔다. 훅 이름은 계기 아흔 곳이 읽으므로 그대로 둔다.
window.__earn = (open) => { if (open) openWiki(HUD_LINKS.purse.cat); else closeWiki(); };
window.__wiki = (open, cat) => { if (open) openWiki(cat); else closeWiki(); };
// 이용권 잔고. 완봉 보상과 뽑기 차감을 계기가 데이터에서 읽는다.
window.__tickets = () => state.tickets;
// 필드 열 명. 계기는 화면 글자가 아니라 장부를 읽어야 마크업이 바뀌어도 판정이 안 흔들린다.
window.__eleven = () => state.eleven.slice();
// 계기가 심은 값을 저장까지 밀어 넣는 자리. 계정이 갈리는지는 저장에 닿아야 재진다.
window.__persist = () => { persist(); return true; };
// 저장이 사는 자리. 계기가 이 자리를 손으로 적으면 계정이 갈린 날 조용히 빈 자리를 읽는다.
window.__saveKey = () => saveKey();
window.__kickers = () => state.kickers.slice();
// 뒤집힌 카드 수와 뽑은 카드 수와 지금 선 단. 연출이 도는 동안 계기가 이 셋을 읽어 한 번에 안 열리는 것을 본다.
window.__reveal = () => { const r = revealState(); return { shown: r.shown, drawn: r.drawn, stage: r.stage, long: r.long }; };
// 누가 무엇을 걸쳤는가. 계기가 교체 전후로 이 둘을 읽어 착용이 사람을 따라가는지 본다.
window.__worn = () => ({ pick: state.pick, name: state.keeper.name,
  worn: Object.assign({}, state.keeper.worn), place: Object.assign({}, state.place),
  all: state.squad.map((k) => Object.assign({}, k.worn)) });
// 선수단 창의 두 목록. 가진 사람과 데려올 사람이 갈려 있는지를 계기가 데이터에서 읽는다.
window.__squadView = () => ({ mine: state.squad.map((k) => k.name), pick: state.pick,
  hire: KEEPERS.filter((e) => !state.squad.some((k) => k.name === e.name)).map((e) => e.name) });
// 게이트는 화면 글자 대신 장부를 직접 읽어야 판정이 마크업 변경에 흔들리지 않는다.
window.__record = () => state.record;
// 팔로워와 라포는 화면에 숫자 하나와 막대로만 나온다. 봇이 뛴 구가 정말 아무것도 안 남기는지는 장부를 직접 읽어야 안다.
window.__fans = () => state.fans;
window.__rapport = () => state.rapport;
// 계정 장부. 피드가 옮겨 그리는 원본이라, 화면이 말한 수와 이 수가 갈리면 화면이 거짓말한 것이다.
window.__posts = () => state.posts;
// 대화가 화면에 적은 확률과 판정 쪽 확률을 맞대려면 계기가 같은 키퍼를 들고 있어야 한다.
window.__keeperStats = () => Object.assign({}, state.keeper);
/* 체격을 갈아 세우는 손잡이. 키와 몸무게가 캡슐에 물려 있는데 극단 둘을 나란히 세워 본 사람이
   없었다. 로스터의 168에서 200까지가 한 화면에서 갈리는지는 판정이 아니라 눈이 답하는 질문이라
   계기가 이 손잡이로 세우고 사람이 본다. 세운 몸은 저장에 안 남는다. 이 판 한정이다. */
window.__setBody = (height, weight) => {
  state.keeper.height = height;
  state.keeper.weight = weight;
  stage.setKeeper(state.keeper, lookOf(state.gear, state.keeper.name));
  return { height, weight };
};
window.__social = () => state.social;
// 봇이 실제로 뛴 구였는지. 크레딧과 자동 상태만 보고 짐작하면 배선이 끊겨도 게이트가 초록으로 남는다.
window.__botRan = () => state.botRan;

// 소리. 끌 수 없는 소리는 소리가 아니라 사고다.
// 음소거는 음량을 건드리지 않는다. 둘을 섞어버리면 한 번 누른 사람은 다시 켜도 무음으로 남는다.
const MUTE_KEY = 'gtg.muted';
const fullscreenBtn = el('fullscreen');
window.__fsLog = [];
const fullscreenElement = () => document.fullscreenElement || document.webkitFullscreenElement;
const fullscreenSupported = Boolean(document.fullscreenEnabled || document.documentElement.webkitRequestFullscreen);
fullscreenBtn.hidden = !fullscreenSupported;
const reflectFullscreen = () => fullscreenBtn.setAttribute('aria-pressed', String(Boolean(fullscreenElement())));
document.addEventListener('fullscreenchange', reflectFullscreen);
document.addEventListener('webkitfullscreenchange', reflectFullscreen);
// Native Fullscreen API owns activation and state; keep orientation failure optional.
function enterFullscreen() {
  const root = document.documentElement;
  const request = root.requestFullscreen || root.webkitRequestFullscreen;
  if (!fullscreenSupported || !request || fullscreenElement()) return;
  window.__fsLog.push({ t: performance.now(), call: 'requestFullscreen' });
  try {
    Promise.resolve(request.call(root, { navigationUI: 'hide' }))
      .then(() => screen.orientation?.lock?.('landscape')).catch(() => {});
  } catch {}
}
fullscreenBtn.onclick = () => {
  if (!fullscreenSupported) return;
  if (!fullscreenElement()) return enterFullscreen();
  window.__fsLog.push({ t: performance.now(), call: 'exitFullscreen' });
  try { Promise.resolve((document.exitFullscreen || document.webkitExitFullscreen).call(document)).catch(() => {}); } catch {}
};
let startFullscreenTried = false;
const startFullscreen = () => {
  if (startFullscreenTried || navigator.maxTouchPoints === 0 || !matchMedia('(pointer: coarse)').matches) return;
  startFullscreenTried = true;
  enterFullscreen();
};
// A touch pointerdown need not grant activation; click does, before title startup.
el('go').addEventListener('click', startFullscreen, { capture: true, once: true });
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

addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (!el('title').hidden) return;
  const key = e.key.length === 1 && e.key !== ' ' ? e.key.toLowerCase() : e.key;
  const binding = KEY_MAP.find((b) => b.key === key || (b.keys && Object.hasOwn(b.keys, key)));
  const id = panelStack.at(-1);
  if (binding?.action === 'close') {
    e.preventDefault();
    /* 개봉 중의 Esc는 건너뛰기다. 남은 카드를 한 번에 열어 결과 판에 세우고, 결과 판에서 한 번 더 누르면 닫는다.
       바로 닫으면 값을 치르고 받은 것을 못 본 채 지나간다. 실측: 열 장을 사고 한 번 누른 뒤 Esc가 아무 일도 안 해,
       창을 닫는 키가 이 창에서만 죽어 있었다. */
    const done = revealState().done;
    if (id === 'pull' && !done) revealAll();
    // 첫 진입 개봉의 결과 판은 누름과 같은 걸음을 밟는다. 닫으면 키퍼 다음 키커가 이어 열리고, 끝났으면 닫힌다.
    else if (id === 'pull' && state.onboard < ONBOARD_DONE) { stopReveal(); onboardStep(); }
    else if (id) PANEL_SHUT[id]();
    return;
  }
  if (id && (binding?.action === 'category' || binding?.action === 'focus')) {
    e.preventDefault();
    const box = el(id);
    const cats = CATEGORY[id] && [...box.querySelectorAll(CATEGORY[id])];
    const cycle = binding.action === 'category' && cats?.length;
    const list = cycle ? cats : buttons(box);
    const at = cycle ? list.findIndex((b) => b.getAttribute('aria-current') === 'true' || b.getAttribute('aria-selected') === 'true') : list.indexOf(document.activeElement);
    const next = (at + (e.shiftKey ? -1 : 1) + list.length) % list.length;
    if (cycle) { list[next].click(); el(id).querySelectorAll(CATEGORY[id])[next]?.focus(); }
    else list[next]?.focus();
    return;
  }
  if (e.target.closest?.('input, textarea, select, [contenteditable="true"]')) return;
  if (binding?.action === 'confirm') {
    const button = e.target.closest?.('button, [role="button"]');
    if (button?.classList.contains('move-arrow')) { e.preventDefault(); holdMovement('key:' + e.key, Number(button.dataset.move)); return; }
    if (button) {
      if (button.onpointerdown && !button.onclick) { e.preventDefault(); button.onpointerdown(e); }
      else if (button.tagName !== 'BUTTON') { e.preventDefault(); button.click(); }
      return;
    }
    if (id) return;
  }
  if (id) return;
  if (binding?.action === 'move') { e.preventDefault(); holdMovement('key:' + e.key, binding.keys[key]); return; }
  if (binding?.action === 'fullscreen') { e.preventDefault(); if (!fullscreenBtn.hidden) fullscreenBtn.click(); return; }
  const action = binding?.action === 'open' ? binding.keys[key] : binding?.action;
  if (action && el(action)?.onpointerdown) {
    e.preventDefault();
    el(action).focus();
    el(action).onpointerdown(e);
    return;
  }
  if (state.phase === 'caption' && state.skip) state.skip();
});

if (state.coach) trainKeeper();
paintMovement();
pips();
/* 타이틀이 서 있는 동안 뒤의 경기 화면은 inert다. 안 막으면 첫 Tab이 보이지 않는 초상 버튼에 걸리고
   시작 버튼까지 Tab 18번이 걸렸다(QA 12th). 타이틀을 여닫는 자리가 여럿이라 hidden 속성을 지켜본다. */
const titleGate = () => { el('hud').inert = !el('title').hidden; };
new MutationObserver(titleGate).observe(el('title'), { attributes: true, attributeFilter: ['hidden'] });
titleGate();
mountTitle(() => {
  stage.leaveTitle();
  stage.setKeeper(state.keeper, lookOf(state.gear, state.keeper.name));
stage.setCity(state.gear.city, state.gear.citySkin);
stage.setGoal(state.gear.frame, state.gear.frameSkin);
  // 밀린 훈련이 있어도 공부터 온다. 쓸지 말지는 훈련장 버튼이 들고 있다.
  nextSet();
  /* 처음 온 사람은 공보다 카드가 먼저다. 판은 뒤에서 이미 돌고 있고 개봉 화면이 그 위를 덮으므로,
     닫는 순간 바로 첫 구가 온다. 이미 하던 사람에게는 아무 일도 안 일어난다. */
  /* veteran 표본은 그 절차를 카드 없이 끝까지 돌린 사람이다. 단계를 건너뛰는 것이 아니라
     다 돌리고 화면만 안 세우므로, 받는 것도 필드 열 명도 사람이 클릭했을 때와 같다. */
  if (state.onboardSkip) {
    while (onboardStep());
    stopReveal();
    stage.setKeeper(state.keeper, lookOf(state.gear, state.keeper.name));
    pips();
  } else {
    onboardStep();
  }
});
