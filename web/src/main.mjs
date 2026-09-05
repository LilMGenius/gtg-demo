// 화면 조립. 판정은 chain.mjs가 하고 이 파일은 입력과 자막만 옮긴다.
import { makeRng, buildSet, resolve, newKeeper, keeperFromRoster, autoInput, rollForm, ballInHand, restartDelay, setBreak, growthGain, followerGain, judgeWindow, GEAR_STEP } from '../../src/chain.mjs';
import { CAUSE_LABEL, GROWABLE, HIDDEN } from '../../src/ledger.mjs';
import { KEEPERS, KICKERS, keeperCost, kickerCost, kickerByName, ROLES, ROLE_SLOTS, ELEVEN, defaultEleven, TRAITS, PULL_COST, PULL_BULK, PULL_BONUS, pullYield, TICKET_CAP, PULL_KINDS, pullKindOf, poolFor, pullCostOf, pullBill, ticketGain, pullWeight, pullFrom } from '../../src/roster.mjs';
import { createScene } from './render/scene.mjs';
import { mountBgm } from './audio/bgm.mjs';
import { mountTitle } from './ui/title.mjs';
import { aimLine } from './ui/callout.mjs';
import { eventLine, setEndLine, postLine, commentLine, photoLine, selfieLine, dmLine, gazeAct } from './ui/lines.mjs';
import { load, save, readSquad, offlineGain, readRecord, readSquadKickers, useAccount } from './state/save.mjs';
import { currentId } from './state/account.mjs';
import { coinGain, readWallet, COIN_DRILL, COIN_SAVE, COIN_CONCEDED, COIN_FAME_STEP } from './state/wallet.mjs';
import { BOTS, BOT_CAP, readBot, botAt, botKeeper } from './state/bot.mjs';
import { GLOVES, MAX_GRIP, BOOTS, MAX_STUD, KITS, MAX_KIT, SOCKS, MAX_SOCK, GOALS, MAX_FRAME, CITIES, MAX_CITY, HAIRS, MAX_HAIR, TATTOOS, MAX_INK, WORN_FIELDS, PLACE_FIELDS, isWorn, readGear, gloveAt, bootAt, kitAt, sockAt, frameAt, cityAt, hairAt, skinsAt, inkAt, lookOf, lookBoost } from './state/gear.mjs';
import { BUFFS, BUFF_CAP, readBuff, buffAt, addBuff, spendBuff } from './state/buff.mjs';
import { readSocial, whoKey, isFollowing, isMutual, follow, mutualCount, mutualBoost, likesFor, commentOdds, photoOdds, selfieFans,
  DM_MOVES, dmOdds, dmOutcome, dmClock, dmWaiting, applyDm } from './state/gram.mjs';
import { readRapport, addRapport, rapportCount, rapportTier, rapportGazeAid, rapportBoost } from './state/rapport.mjs';
import { passerName } from './state/passer.mjs';
import { DATE_COST, MOVES, dateOdds, dateOutcome, applyDate, dateGate } from './state/date.mjs';
import { applyPreset, ONBOARD_KEEPER, ONBOARD_KICKERS, ONBOARD_DONE } from './state/inject.mjs';
import { thumbURL, startSpin, stopSpin } from './render/thumb.mjs';

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
state.keeper = state.squad[state.pick];
// 비운 시간은 훈련 선택권으로만 바뀌고, 그 선택은 손으로 한다.
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
/* 키커 보유와 주전 열하나. 지금까지 판에 나오는 키커는 명단 일흔일곱에서 매 구 무작위였고,
   플레이어가 상대를 고를 방법이 없었다. 잘 차는 키커는 막기 어렵지만 골대 밖으로 덜 차므로,
   주전을 고르는 것은 난도를 올려 보상 밀도를 사는 선택이다. */
{
  const names = KICKERS.map((k) => k.name);
  const got = readSquadKickers(saved, names, defaultEleven(), ELEVEN);
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
// 좋아요. 3px 격자에서 하트는 봉우리 둘과 아래로 좁아지는 세 단이면 선다.
// 24 격자의 가운데가 12라 마지막 단은 6폭이 하한이다. 3폭으로 좁히면 중심이 격자 밖으로 나간다.
const IC_LIKE = G('좋아요', R(6, 3, 3, 3) + R(15, 3, 3, 3) + R(3, 6, 18, 3) + R(3, 9, 18, 3)
  + R(6, 12, 12, 3) + R(9, 15, 6, 3));
// 육수. 시간으로 버는 재화다. 땀을 뺀 결과를 부르는 입말이라 물방울 하나가 그대로 단위로 읽히고,
// 뾰족한 위와 둥근 아래라 별 실루엣과 안 겹친다. 판을 세던 옛 단위 '구'와 글자가 안 겹친다.
const IC_SWEAT = G('육수', R(10.5, 3, 3, 3) + R(7.5, 6, 9, 3) + R(6, 9, 12, 3) + R(4.5, 12, 15, 3)
  + R(4.5, 15, 15, 3) + R(6, 18, 12, 3) + R(7.5, 21, 9, 3));
/* 값을 말하는 자리는 전부 이 함수를 지난다. 상단 잔고는 아이콘인데 상점 버튼만 '140 육수'처럼
   글자로 적으면 같은 재화가 두 표기로 갈리고, 어느 재화로 사는지를 글자를 읽어야 안다. */
// data-coin은 계기가 읽는 자리다. 그려진 숫자는 천 단위 쉼표가 붙고 아이콘 이름이 섞여 들어와,
// 글자를 파싱하면 계기가 값을 못 읽거나 잘못 읽는다. 값은 데이터에서 꺼내 쓴다.
const SW = (n) => '<span class="px" data-coin="' + Number(n) + '">' + IC_SWEAT
  + '<b>' + Number(n).toLocaleString() + '</b></span>';
// 스폰. 결제로만 들어오는 재화다. 별은 어느 게임에서든 유료 갈래로 읽힌다.
const IC_SPON = G('스폰', R(10.5, 3, 3, 3) + R(9, 6, 6, 3) + R(0, 9, 24, 3) + R(4.5, 12, 15, 3)
  + R(6, 15, 12, 3) + R(4.5, 18, 6, 3) + R(13.5, 18, 6, 3));
// 기복. 화살표 하나면 오늘 컨디션이 어느 쪽인지가 문장 없이 선다.
const IC_UP = G('컨디션 좋음', R(10.5, 3, 3, 3) + R(7.5, 6, 9, 3) + R(4.5, 9, 15, 3) + R(9, 12, 6, 12));
const IC_DOWN = G('컨디션 나쁨', R(9, 0, 6, 12) + R(4.5, 12, 15, 3) + R(7.5, 15, 9, 3) + R(10.5, 18, 3, 3));
// 버프. 목이 좁고 배가 넓은 병 하나면 마시는 물건인 것이 문장 없이 선다.
const IC_BUFF = G('버프', R(9, 0, 6, 3) + R(9, 3, 6, 3) + R(6, 6, 12, 3) + R(4.5, 9, 15, 12)
  + R(6, 21, 12, 3));
/* 이용권. 완봉으로만 들어오는 자원이라 육수와도 스폰과도 다른 그림이어야 한다.
   가로로 누운 테두리와 가운데 절취선이면 표로 읽히고, 물방울이나 별 실루엣과 안 겹친다. */
const IC_TICKET = G('이용권', R(3, 6, 18, 3) + R(3, 15, 18, 3) + R(3, 9, 3, 6) + R(18, 9, 3, 6)
  + R(12, 9, 3, 3) + R(12, 15, 3, 3));
/* 종류마다 다른 그림. 병 하나로 셋을 다 그리면 지금 무엇이 걸려 있는지가 상점을 열어야 아는 값이 된다.
   자양강장제는 마시는 물건이라 병을 그대로 쓴다. 나머지 둘은 3px 격자에서 실루엣이 안 겹치게 골랐다. */
const BUFF_ICON = {
  // 병 모양은 상점 탭이 쓰는 그것과 같다. 이름만 그 종류의 이름이라 배지가 무엇이 걸렸는지를 말한다.
  tonic: G('자양강장제', R(9, 0, 6, 3) + R(9, 3, 6, 3) + R(6, 6, 12, 3) + R(4.5, 9, 15, 12)
    + R(6, 21, 12, 3)),
  // 확성기. 소리가 아니라 소문이라 파동 둘을 오른쪽에 띄워 소리 버튼의 붙은 파동과 안 겹친다.
  hype: G('바이럴 떡밥', R(3, 9, 3, 6) + R(6, 6, 3, 12) + R(9, 3, 3, 18)
    + R(15, 9, 3, 3) + R(18, 6, 3, 9)),
  // 분무 캔. 몸통 위에 누름 버튼 하나와 흩어지는 방울 둘이면 뿌리는 물건으로 읽힌다.
  rosin: G('송진 스프레이', R(9, 0, 3, 3) + R(12, 3, 3, 3) + R(6, 6, 9, 18)
    + R(18, 3, 3, 3) + R(21, 0, 3, 3))
};
const buffIcon = (kind) => BUFF_ICON[kind] || IC_BUFF;

/* 상점 탭 아이콘. 열한 개가 글자로만 서 있으면 어느 칸이 무엇을 파는지 매번 읽어야 한다.
   위 칩과 우측 기둥이 쓰는 3px 격자 픽셀 SVG 관례를 그대로 쓴다. 손그림 톤이 갈리면 안 붙어 보인다. */
const TAB_ICON = {
  // 폭이 다른 카드 두 장. 사이를 3px 비워야 두 장으로 갈리고, 맞닿으면 한 덩어리로 뭉친다.
  pull: G('이적시장', R(3, 3, 9, 18) + R(15, 3, 6, 18)),
  // 벙어리장갑. 엄지가 옆으로 나와야 손 모양으로 읽힌다.
  glove: G('장갑', R(6, 6, 12, 15) + R(3, 9, 3, 6)),
  // 옆에서 본 축구화. 아래 두 칸이 스터드라 맨발이나 양말과 안 갈린다.
  boot: G('축구화', R(6, 3, 6, 9) + R(6, 12, 12, 6) + R(6, 18, 3, 3) + R(12, 18, 3, 3)),
  // 티셔츠. 어깨가 몸통보다 넓어야 옷으로 선다.
  kit: G('유니폼', R(3, 3, 18, 6) + R(6, 9, 12, 12)),
  // 축구 스타킹. 띄운 밴드 한 줄이 줄무늬로 읽혀 축구화와 갈리고, 발이 왼쪽으로 나가 방향도 반대다.
  sock: G('양말', R(6, 3, 12, 3) + R(6, 9, 9, 6) + R(3, 15, 12, 6)),
  // 골대 세 변. 그물은 이 크기에서 뭉치므로 뼈대만 남긴다.
  frame: G('골대', R(3, 6, 18, 3) + R(3, 9, 3, 12) + R(18, 9, 3, 12)),
  // 높이가 다른 건물 두 채. 동네는 사람이 아니라 스카이라인으로 읽힌다.
  city: G('동네', R(3, 9, 6, 12) + R(12, 3, 9, 18)),
  // 빗. 머리 실루엣은 이 크기에서 골대와 같은 뒤집힌 ㄷ자가 되어 둘이 안 갈린다.
  hair: G('머리', R(3, 6, 18, 6) + R(3, 12, 3, 6) + R(9, 12, 3, 6) + R(15, 12, 3, 6)),
  // 번개. 문신 도안 중 이 크기에서 형태가 안 뭉개지는 몇 안 되는 모양이다.
  ink: G('타투', R(12, 0, 6, 6) + R(9, 6, 6, 6) + R(6, 12, 6, 6) + R(9, 18, 3, 6)),
  // 안테나 달린 로봇 머리. 3px 격자에서 안테나를 가운데 세우면 폭 6이 최소라 뭉툭해지므로,
  // 오른쪽 위로 두 칸 계단을 놓아 가늘게 뻗은 것처럼 보이게 한다.
  bot: G('봇', R(15, 0, 3, 3) + R(12, 3, 3, 3) + R(3, 6, 18, 12)),
  buff: IC_BUFF
};

// 탭 차례. 뽑는 칸이 먼저 서고, 몸에 걸치는 여섯, 꾸미는 둘, 소모형 둘이 뒤를 잇는다.
const SHOP_TABS = ['pull', 'glove', 'boot', 'kit', 'sock', 'frame', 'city', 'hair', 'ink', 'bot', 'buff'];

/* 능력치 아이콘. 열다섯 칸이 글자로만 서면 훈련장도 내 정보도 이름을 읽어야 어느 칸인지 안다.
   탭과 조작이 쓰는 3px 격자 픽셀 관례를 그대로 쓴다. 키는 ledger의 이름이라 둘이 갈릴 수 없다. */
const STAT_ICON = {
  // 옆 아래로 몸을 던지는 화살표. 8칸 격자에서 누운 사람은 T자로 뭉쳐 몸으로 안 읽힌다.
  // 스로잉이 우상향 궤적이라 이쪽은 우하향으로 세워야 둘이 같은 대각으로 안 겹친다.
  diving: G('다이빙', R(3, 3, 3, 3) + R(6, 6, 3, 3) + R(9, 9, 3, 3) + R(12, 12, 3, 3)
    + R(15, 15, 6, 3) + R(18, 9, 3, 6)),
  // 장갑. 붙잡는 일이라 손이 맞고, 사각 공에 받침을 붙이면 공으로도 손으로도 안 읽힌다.
  handling: G('핸들링', R(6, 6, 12, 15) + R(3, 9, 3, 6)),
  // 스톱워치. 모서리를 깎아야 사각 판이 아니라 시계로 보인다.
  reflex: G('반응속도', R(9, 0, 6, 3) + R(6, 3, 12, 3) + R(3, 6, 18, 12) + R(6, 18, 12, 3)),
  // 걸어간 자리 셋과 도착점. 공 없이 자리를 잡는 일이다.
  offball: G('오프더볼', R(3, 18, 3, 3) + R(9, 15, 3, 3) + R(15, 12, 3, 3) + R(18, 3, 6, 6)),
  // 전구. 저울은 이 크기에서 접시가 기둥에 붙어 화살표로 읽힌다.
  judgement: G('판단력', R(6, 3, 12, 9) + R(9, 12, 6, 3) + R(9, 15, 6, 3) + R(9, 18, 6, 3)),
  // 오른쪽으로 꺾인 화살촉 하나. 작은 화살표 둘로 나누면 점 여섯 개로 흩어진다.
  agility: G('민첩성', R(3, 3, 3, 3) + R(6, 6, 3, 3) + R(9, 9, 3, 3) + R(12, 12, 3, 3)
    + R(9, 15, 3, 3) + R(6, 18, 3, 3) + R(3, 21, 3, 3)),
  // 시소. 한쪽에 얹힌 무게와 가운데 받침이 균형을 한 눈에 말한다.
  balance: G('밸런스', R(3, 3, 6, 3) + R(0, 6, 24, 3) + R(9, 9, 6, 6) + R(6, 15, 12, 3)),
  // 방패. 버티는 힘이라 때리는 그림이 아니라 막는 그림이다.
  strength: G('맷집', R(3, 3, 18, 9) + R(6, 12, 12, 6) + R(9, 18, 6, 3)),
  // 뿔 달린 얼굴. 뿔은 머리에 닿아 있어야 뿔이고, 떨어져 있으면 떠 있는 점 둘이다.
  mischief: G('악동', R(3, 3, 3, 6) + R(18, 3, 3, 6) + R(6, 6, 12, 12)),
  // 과녁. 한 점을 계속 보는 일이다.
  focus: G('집중력', R(3, 3, 18, 3) + R(3, 18, 18, 3) + R(3, 6, 3, 12) + R(18, 6, 3, 12) + R(9, 9, 6, 6)),
  // 잔잔한 파형. 흔들려도 크게 안 튀는 것이 침착성이다.
  composure: G('침착성', R(0, 12, 6, 3) + R(6, 9, 3, 3) + R(9, 12, 3, 3) + R(12, 15, 3, 3) + R(15, 12, 9, 3)),
  // 스프링. 눌려도 되돌아오는 모양이다.
  resilience: G('회복탄력성', R(6, 3, 15, 3) + R(3, 6, 15, 3) + R(6, 9, 15, 3)
    + R(3, 12, 15, 3) + R(6, 15, 15, 3) + R(3, 18, 15, 3)),
  // 축구화와 뜬 공. 발이 부츠 모양이라야 사각 둘이 아니라 차는 장면으로 읽힌다.
  goalKick: G('골킥', R(3, 9, 6, 9) + R(3, 18, 12, 3) + R(15, 3, 6, 6)),
  // 손을 떠나 날아가는 공. 궤적을 점으로 남겨야 던진 것인지 든 것인지가 갈린다.
  throwing: G('스로잉', R(3, 18, 6, 3) + R(6, 15, 3, 3) + R(9, 12, 3, 3) + R(12, 9, 3, 3)
    + R(15, 3, 6, 6)),
  // 말풍선. 부르고 지시하는 일이다.
  communication: G('의사소통', R(3, 3, 18, 12) + R(6, 15, 6, 3))
};

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
  el('fans').innerHTML = IC_FANS + '<b>' + state.fans.toLocaleString() + '</b>';
  // 육수와 스폰은 갈래가 다른 잔고다. 붙여 두면 한 줄의 숫자 띠로 읽혀 어느 것으로 사는지가
  // 상점을 열어야 아는 정보가 된다. 팔로워와 지갑을 가르는 것과 같은 세로선으로 둘을 가른다.
  el('purse').innerHTML = '<span class="cur">' + IC_SWEAT + '<b>' + state.wallet.coin.toLocaleString() + '</b></span>'
    + '<span class="cur">' + IC_SPON + '<i>' + state.wallet.cash.toLocaleString() + '</i></span>'
    // 남은 버프도 같은 줄에 선다. 몇 판 뒤에 꺼지는지를 상점을 열어야 알면 계획이 안 선다.
    + (state.buff.shots > 0 ? '<span class="cur">' + buffIcon(state.buff.kind) + '<u>' + state.buff.shots + '</u></span>' : '');
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
      + '<b>' + state.buff.shots + '</b><i>' + (spec ? spec.name : '') + '</i></span>');
  }
  box.innerHTML = rows.join('');
  box.hidden = rows.length === 0;
}

/* 컨디션의 유일한 자리. 0.4는 화살표를 세우는 문턱이고, 이 값을 읽는 곳이 여기 하나뿐이라
   두 자리가 다른 수를 쓸 일이 없다. */
function formChip() {
  el('form').innerHTML = state.form > 0.4 ? '<span class="up">' + IC_UP + '</span>'
    : state.form < -0.4 ? '<span class="dn">' + IC_DOWN + '</span>' : '';
}

function setPad(on) {
  for (const b of document.querySelectorAll('.zone')) b.disabled = !on;
}

/* 어느 쪽으로 떴는지를 화면에 남긴다. 세 버튼은 눌리는 순간에만 색이 변하고 그 뒤에는
   아무 표시가 없어서, 플레이어가 고른 방향과 안 눌러서 대신 굴려진 방향이 구별되지 않았다.
   안 누르면 판정이 알아서 한 쪽을 고르므로, 그 경우도 누구의 선택인지가 화면에 있어야 한다.
   dive가 null이면 셋 다 비운다. 다음 구가 시작될 때 부르는 자리다. */
function markDive(dive, mine) {
  for (const b of document.querySelectorAll('.zone')) {
    const on = dive !== null && Number(b.dataset.dive) === dive;
    b.classList.toggle('chose', on && mine);
    b.classList.toggle('drawn', on && !mine);
  }
}

// 저장은 항상 보유 목록 전체로 나간다. 뛰는 키퍼만 저장하면 나머지가 다음 저장에서 지워진다.
function persist() {
save(state.squad, state.pick, state.auto, state.fans, state.points, state.wallet, state.posts, state.record, state.gear, state.bot, state.buff, state.rapport, state.tickets, state.social, state.kickers, state.eleven, state.onboard);
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

// 이번 구에 들어온 육수를 잔고 옆에 한 번 띄운다.
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

/* 타이밍 자. 노란 구간은 판정이 쓰는 그 창이고, 폭은 judgeWindow가 소유한다.
   240ms 상수를 그리던 동안에는 반응속도 3인 키퍼와 10인 키퍼가 같은 창을 보고 있었다.
   꼬리 260ms. 900ms를 달 때는 창이 레인 왼쪽 38%에 몰리고 바늘이 창을 지나고도 한참 달려,
   이 자가 무엇을 세는지가 화면에서 안 읽혔다. */
const BEAT_TAIL_MS = 260;
let lastBeat = null;

function beatStart(shot) {
  const b = el('beat');
  const span = shot.flight * 1000 + BEAT_TAIL_MS;
  const w = judgeWindow(state.keeper, shot, { studs: state.gear.studs });
  const center = (w.markerAt * 1000) / span;
  // 창이 레인 앞뒤로 넘치면 잘라 그린다. 0.04는 가장 좁은 창도 한 칸으로는 보이게 하는 하한이다.
  const half = Math.min(center, Math.max(0.04, w.slackMs / span));
  const left = Math.max(0, center - half);
  const width = Math.min(1 - left, half * 2);
  b.hidden = false;
  b.classList.remove('hit');
  b.style.setProperty('--beat', span.toFixed(0) + 'ms');
  const lane = b.querySelector('.lane');
  lane.style.setProperty('--hot-l', (left * 100).toFixed(2) + '%');
  lane.style.setProperty('--hot-w', (width * 100).toFixed(2) + '%');
  lastBeat = { spanMs: span, markerAt: w.markerAt, slackMs: w.slackMs, flight: shot.flight,
    strong: Boolean(shot.strong), course: shot.course, studs: state.gear.studs,
    /* 그릴 때의 키퍼를 그대로 뜬다. 나중에 읽으면 그 사이에 연속 실점과 컨디션이 바뀌어,
       같은 구를 두 값으로 재게 된다. 실제로 이 자를 세우다 그렇게 48ms가 갈렸다. */
    keeper: { reflex: state.keeper.reflex, composure: state.keeper.composure, agility: state.keeper.agility,
      resilience: state.keeper.resilience, height: state.keeper.height, weight: state.keeper.weight,
      streak: state.keeper.streak || 0, form: state.keeper.form || 0 } };
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
  state.form = form;
  formChip();
  // 주전 열하나만 이 판에 선다. 명단 전체가 아니라 플레이어가 세운 사람들이 차야 그 선택이 값을 한다.
  state.shots = buildSet(rng, state.keeper.level, state.gear.city, state.eleven.map(kickerByName).filter(Boolean));
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
  // 지난 구의 표시를 지운다. 남겨 두면 이번 구를 안 눌렀을 때 지난 선택이 이번 것으로 읽힌다.
  markDive(null, false);
  beatStart(shot);
  stage.reset();
  pressAt = performance.now() + shot.flight * 1000 * 0.72;
  lastAim = aimLine(shot.kicker, rng, lastAim);
  say(lastAim, null);
  // 창이 닫히면 손가락 대신 자동 입력이 친다. 늦은 만큼은 스탯이 아니라 손가락 탓이다.
  stage.cancel(timer);
  // 자동은 손가락만 대신한다. 공은 같은 시간을 날고 대기시간은 그대로다.
  // 안 누르고 넘어가는 시간도 자와 같아야 한다. 바늘이 끝난 뒤에도 눌리면 자가 거짓말을 한 것이다.
  const wait = state.auto ? Math.max(0, pressAt - performance.now()) : shot.flight * 1000 + BEAT_TAIL_MS;
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
  // 판정이 고른 쪽까지 정해진 뒤에 표시한다. 누른 값으로 표시하면 안 누른 구가 빈 채로 남는다.
  markDive(input.dive, dive !== null);
  stage.diving = state.keeper.diving;
  const result = resolve({ keeper: state.keeper, shot, rng, input, grip: state.gear.grip, studs: state.gear.studs, pads: state.gear.pads, socks: state.gear.socks, frame: state.gear.frame, focusAid: state.buff.kind === 'tonic' ? TONIC_FOCUS : 1, rosin: state.buff.kind === 'rosin', gazeAid: rapportGazeAid(state.rapport, state.gear.city, shot.passer) });
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
  /* 눈맞음 갈래를 여기서 뽑는다. 판정 rng를 쓰면 그 뒤 모든 구가 밀려 게이트가 통째로 흔들리므로
     화면 쪽 난수를 쓴다. 한 구 안에서 한 번만 뽑아 자막과 자세가 같은 갈래를 본다. */
  for (const e of lines) {
    if (e.t === 'distracted' || e.t === 'talked') e.act = gazeAct(Math.random);
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
      const gain = state.botRan ? 0 : followerGain(state.keeper, result, state.gear.city, lookBoost(state.gear), state.buff.kind === 'hype' ? HYPE_BOOST : 1, rapportBoost(state.rapport, state.gear.city, state.shots[state.i].passer), mutualBoost(state.social));
      state.fans += gain;
      // 라포는 말을 섞은 구에서만 쌓인다. 스쳐 지나간 얼굴은 다음에도 남이다.
      // 봇이 뛴 구는 팔로워와 같은 규칙으로 0이다. 봇이 서 있었으니 얼굴이 익을 리 없다.
      if (!state.botRan && result.events.some((e) => e.t === 'talked')) state.rapport = addRapport(state.rapport, state.gear.city, state.shots[state.i].passer);
      // 육수는 구마다 들어온다. 먹혀도 들어오고, 막으면 더 들어온다.
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
        lb: gain, ct: state.gear.city, l: likesFor(gain, state.gear.city, Math.random()) };
      if (Math.random() * 100 < commentOdds(tier)) {
        post.cm = { city: state.gear.city, passer: seen, tier,
          who: passerName(state.gear.city, seen, tier), text: commentLine(result.conceded, tier, Math.random) };
      }
      state.posts.push(post);
      /* 그 구를 지켜본 사람이 나를 찍어 자기 계정에 올린다. 얼굴을 튼 사이라야 태그를 걸고,
         지나간 사람이 없던 구에는 찍은 사람도 없다. 사진은 저장에 이미지를 넣지 않는다.
         한 장이 47KB라 열두 장이면 저장 한도를 위협하고, 그림은 지금 차림에서 다시 구우면 된다. */
      if (state.shots[state.i].gaze && tier > 0 && Math.random() * 100 < photoOdds(tier)) {
        state.posts.push({ n: passerName(state.gear.city, seen, tier), c: result.conceded, g: 0,
          t: photoLine(result.conceded, tier, Math.random),
          lb: gain, ct: state.gear.city, l: likesFor(gain, state.gear.city, Math.random()),
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
  // 완봉이면 이적시장 이용권 한 장. 규칙은 판정이 소유하고 화면은 그 답을 받는다.
  state.tickets = ticketGain(state.results, state.tickets);
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
  // 제목과 수를 점으로 잇지 않는다. 창 이름은 제목이 갖고 수는 그 뒤 작은 줄이 갖는다.
  const head = '훈련장<small>' + (state.points > 0 ? '남은 훈련 ' + state.points + '회' : '밀린 훈련이 없다') + '</small>';
  // 못 누르는 버튼도 사유를 글자로 들고 있다. 빈 자리는 왜 못 쓰는지를 말하지 않는다.
  const swap = maxed
    ? '<button class="swap"' + (state.points <= 0 ? ' disabled' : '') + '>'
      + (state.points > 0 ? '남은 훈련 ' + state.points + '회를 ' + SW(state.points * COIN_DRILL) + '으로' : '바꿀 훈련이 없다')
      + '</button>'
    : '';
  box.innerHTML = '<h4>' + head + '</h4><div class="row">' + GROWABLE.map((k) => {
    const v = state.keeper[k];
    // 10은 성장 상한이다. 상한에 닿은 칸을 눌리게 두면 포인트만 사라진다.
    const off = v >= 10 || state.points <= 0;
    const tail = v >= 10 ? 'MAX' : v + ' → ' + (v + 1);
    return '<button data-k="' + k + '"' + (off ? ' disabled' : '') + '><span class="who">' + STAT_ICON[k]
      + CAUSE_LABEL[k] + '</span><em>' + tail + '</em></button>';
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
      stage.setKeeper(state.keeper, lookOf(state.gear, state.keeper.name));
      pips();
      renderGym();
    };
  }
}

// 창은 한 번에 하나만 선다. 닫기 전에 겹쳐 열리면 뒤엣것이 앞엣것을 덮고,
// 닫았을 때 무엇이 남는지가 닫아 봐야 안다. 만남만 예외다. 내 정보 안의 버튼으로만
// 열리고 닫으면 그 자리로 돌아가는 한 단계라 부모를 같이 닫으면 길이 끊긴다.
// 개봉은 창이 아니라 상점이 낳는 화면이라 다른 창을 닫지 않는다. 반대로 개봉이 서 있는 동안에는
// 어떤 창도 안 열린다. 개봉판은 화면 전체를 덮어 사람의 클릭을 이미 막고 있으므로, 열리는 창은
// 손잡이로만 열리는 창이고 그때 첫 진입 개봉이 조용히 걷힌다. 처음 오는 사람이 자기가 무엇을
// 들고 시작하는지를 못 보고 지나가는 자리이고, 계기가 사람이 못 가는 상태를 재게 되는 자리다.
const PANEL_SHUT = { gym: closeGym, roster: closeRoster, gram: closeGram, me: closeMe, date: closeDate, shop: closeShop, earn: closeEarn, pull: stopReveal };
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

// 선수단. 명단 전체를 걸어놓고 보유한 것만 뛸 수 있다.
// 보유 판정은 이름으로 한다. 로스터 항목과 저장된 키퍼는 다른 객체이기 때문이다.
function renderRoster() {
  const box = el('roster');
  const here = state.squad[state.pick];
  /* 가진 사람과 데려올 사람은 다른 질문이라 목록을 가른다. 명단 하나로 둘을 겸하면
     명단 밖에서 시작한 첫 키퍼는 어느 줄에도 없고, 다른 사람을 세우는 순간 못 돌아온다. */
  const mine = state.squad.map((k, i) => {
    const now = i === state.pick;
    const tail = now ? '지금 뛰는 중' : '세우기';
    return '<button data-at="' + i + '"' + (now ? ' class="here" disabled' : '') + '>'
      /* 이름만 늘어놓으면 명단이 글자 목록이라 누가 누군지가 이름을 읽어야 안다.
         얼굴을 앞에 세우면 세우려는 사람을 찾는 눈이 글자를 안 지난다. */
      + '<img alt="' + k.name + '" src="' + thumbURL('face', k, lookOf({}, k.name)) + '">'
      + k.name + '<em>Lv ' + k.level + ', ' + tail + '</em></button>';
  }).join('');
  // 아직 없는 사람만 영입 줄에 선다. 가진 사람이 값과 함께 다시 뜨면 두 번 살 수 있는 것처럼 읽힌다.
  const pool = KEEPERS.filter((e) => !state.squad.some((k) => k.name === e.name));
  const hire = pool.map((entry) => {
    const cost = keeperCost(entry);
    const off = state.wallet.coin < cost;
    return '<button data-n="' + entry.name + '"' + (off ? ' disabled' : '') + '>'
      + '<img alt="' + entry.name + '" src="' + thumbURL('face', entry, lookOf({}, entry.name)) + '">'
      + entry.name + '<em>' + SW(cost) + '</em></button>';
  }).join('');
  /* 포지션 줄. 골키퍼 한 명과 필드 열하나는 다른 질문이라 같은 목록에 못 섞는다.
     골키퍼는 세우는 사람이 하나뿐이고, 키커는 정원 안에서 열하나를 고른다. */
  const tabs = '<div class="kinds">' + [['gk', '골키퍼']].concat(ROLES.map((r) => [r, r]))
    .map(([id, label]) => '<button class="kind" data-pos="' + id + '"'
      + (squadTab === id ? ' aria-current="true"' : '') + '>' + label + '</button>').join('') + '</div>';
  const pane = squadTab === 'gk'
    ? '<div class="row mine">' + mine + '</div>'
      + '<h5>명단에서 데려오기</h5>'
      + (hire ? '<div class="row hire">' + hire + '</div>'
        : '<div class="note dim"><span>명단을 다 모았다</span></div>')
    : kickerPane(squadTab);
  const count = squadTab === 'gk' ? '보유 ' + state.squad.length + '명'
    : '주전 ' + state.eleven.length + ' / ' + ELEVEN + '명';
  box.innerHTML = '<h4>선수단<small>' + count + '</small></h4>' + tabs + pane
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
    if (state.wallet.coin < cost) return;
    state.wallet.coin -= cost;
    state.squad.push(recruit(entry));
    swapTo(state.squad.length - 1);
  };
}

// 세우는 자리 하나. 영입과 교체가 같은 길로 끝나야 한 쪽만 고쳐지는 일이 없다.

// 선수단 창에서 보고 있는 포지션. 창 수명만 사는 값이라 저장에 안 싣는다.
let squadTab = 'gk';

/* 한 포지션의 칸. 위는 지금 세운 사람, 아래는 데려올 사람이다. 정원이 차 있으면 새로 세우기 전에
   내려야 하므로, 정원과 지금 수를 칸 머리에 적어 누르기 전에 알 수 있게 한다. */
function kickerPane(role) {
  const slots = ROLE_SLOTS[role] || 0;
  const inRole = (n) => { const k = kickerByName(n); return k && k.role === role; };
  const starting = state.eleven.filter(inRole);
  const owned = state.kickers.filter((n) => inRole(n) && starting.indexOf(n) < 0);
  const card = (n, on) => {
    const k = kickerByName(n);
    if (!k) return "";
    return '<button data-kick="' + n + '"' + (on ? ' class="here"' : '') + '>'
      + '<img alt="' + n + '" src="' + thumbURL("face", k, lookOf({}, n)) + '">'
      + n + '<em>결정력 ' + k.finishing + ', ' + (on ? "내리기" : "세우기") + '</em></button>';
  };
  const hire = KICKERS.filter((k) => k.role === role && state.kickers.indexOf(k.name) < 0).map((k) => {
    const cost = kickerCost(k);
    const off = state.wallet.coin < cost;
    return '<button data-buy="' + k.name + '"' + (off ? ' disabled' : '') + '>'
      + '<img alt="' + k.name + '" src="' + thumbURL("face", k, lookOf({}, k.name)) + '">'
      + k.name + '<em>' + SW(cost) + '</em></button>';
  }).join("");
  return '<h5>주전 ' + starting.length + ' / ' + slots + '</h5>'
    + '<div class="row mine">' + (starting.map((n) => card(n, true)).join("")
      || '<span class="note dim">이 자리가 비었다</span>') + '</div>'
    + '<h5>가진 사람</h5>'
    + '<div class="row mine">' + (owned.map((n) => card(n, false)).join("")
      || '<span class="note dim">벤치가 비었다</span>') + '</div>'
    + '<h5>명단에서 데려오기</h5>'
    + (hire ? '<div class="row hire">' + hire + '</div>'
      : '<div class="note dim"><span>이 자리는 다 모았다</span></div>');
}

/* 세우기와 내리기와 영입. 셋 다 한 곳에서 끝나야 정원 검사가 한 번만 적힌다.
   정원을 넘겨 세우는 것은 막는다. 넘긴 채로 판이 열리면 열둘이 도는 셈이 된다. */
function bindKickerPane(box) {
  for (const b of box.querySelectorAll("[data-kick]")) b.onclick = () => {
    const n = b.dataset.kick;
    const k = kickerByName(n);
    if (!k) return;
    const at = state.eleven.indexOf(n);
    if (at >= 0) state.eleven.splice(at, 1);
    else {
      const here = state.eleven.filter((x) => { const e = kickerByName(x); return e && e.role === k.role; }).length;
      if (here >= (ROLE_SLOTS[k.role] || 0)) return;
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
    if (state.wallet.coin < cost) return;
    state.wallet.coin -= cost;
    state.kickers.push(k.name);
    persist();
    pips();
    renderRoster();
  };
}
function swapTo(at) {
  if (!(at >= 0 && at < state.squad.length)) return;
  // 참조 재대입이다. 값을 복사하면 훈련이 보유 목록에 안 남는다.
  state.pick = at;
  state.keeper = state.squad[at];
  // state.gear는 지금 뛰는 키퍼를 따라가므로, 교체한 뒤에 읽어야 그 사람이 걸친 것이 실린다.
  stage.setKeeper(state.keeper, lookOf(state.gear, state.keeper.name));
  // 걸쳐 보던 것은 사람이 바뀌면 버린다. 남겨 두면 다른 사람 몸에 얹혀 산 것처럼 보인다.
  fitting = {};
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
}

// 아웃문그램. 구가 끝날 때마다 쌓인 글을 최신 순으로 건다.
function renderGram() {
  const box = el('gram');
  /* 열려 있는 쪽지. 맞팔인 사람만 이 자리에 선다. 선팔은 내가 건 것이고 맞팔은 상대도 걸어 준 것이라,
     대화가 시작되는 자리는 뒤엣것이다. 미연시를 따로 열 필요가 없는 이유가 여기 있다. */
  if (dmOpen) return renderDm();
  /* 남이 올린 글. 그림은 저장에 안 들어 있고 그때의 차림만 남아 있어, 열 때마다 그 차림으로 다시 굽는다.
     한 장이 47KB라 열두 장을 저장에 실으면 한도를 위협하고, 굽는 비용은 상점이 이미 스물넉 장으로 치른다. */
  /* 내가 올린 셀카. 주어가 둘이라 상대 이름이 사진 위에 서고, 팔로워는 그 자리에서 이미 올랐다.
     사진은 남이 찍은 것과 같은 방식으로 그때의 차림에서 다시 굽는다. */
  const selfieCard = (p) => '<div class="post shot mine">'
    + '<div class="by"><b>' + p.n + '</b><span>님과 함께</span></div>'
    + '<img alt="' + p.n + '과 찍은 사진" src="' + thumbURL('body', { height: p.sf.h, weight: p.sf.w }, p.sf.look) + '">'
    + '<span>' + p.t + '</span>'
    + '<i>' + IC_FANS + ' +' + p.g + IC_LIKE + p.l + '</i></div>';
  const photoCard = (p) => {
    const key = whoKey(p.ph.city, p.ph.passer);
    const label = isMutual(state.social, key) ? '맞팔' : (isFollowing(state.social, key) ? '팔로우 중' : '선팔');
    const off = isFollowing(state.social, key) ? ' disabled' : '';
    return '<div class="post shot' + (p.c ? ' bad' : '') + '">'
      + '<div class="by"><b>' + p.n + '</b><span>님이 회원님을 태그했습니다</span>'
      + '<button class="fol" data-key="' + key + '" data-tier="' + p.ph.tier + '"' + off + '>' + label + '</button></div>'
      + '<img alt="' + p.n + '이 찍은 사진" src="' + thumbURL('body', { height: p.ph.h, weight: p.ph.w }, p.ph.look) + '">'
      + '<span>' + p.t + '</span>'
      + '<i>' + IC_LIKE + p.l + '</i></div>';
  };
  /* 글 한 장이 들고 있는 것 셋. 문장과 좋아요와 댓글이다. 문장 안에 이미 상대 이름이 박혀 있어
     앞에 한 번 더 걸면 같은 이름이 두 번 읽힌다. 옛 저장의 글에는 좋아요와 댓글 칸이 없고,
     그때는 그 자리를 비운다. 없는 것을 0으로 그리면 아무도 안 본 글로 읽힌다. */
  const cmtRow = (p) => {
    if (!p.cm) return '';
    const key = whoKey(p.cm.city, p.cm.passer);
    const state3 = isMutual(state.social, key) ? '맞팔' : (isFollowing(state.social, key) ? '팔로우 중' : '선팔');
    const off = isFollowing(state.social, key) ? ' disabled' : '';
    return '<div class="cmt"><b>' + p.cm.who + '</b><span>' + p.cm.text + '</span>'
      + '<button class="fol" data-key="' + key + '" data-tier="' + p.cm.tier + '"' + off + '>' + state3 + '</button></div>';
  };
  const feed = state.posts.length
    ? state.posts.slice().reverse().map((p) => (p.ph ? photoCard(p) : (p.sf ? selfieCard(p) : '<div class="post' + (p.c ? ' bad' : '') + '">'
      + '<span>' + p.t.replace(p.n, '<b>' + p.n + '</b>') + '</span>'
      + '<i>' + IC_FANS + ' +' + p.g + (p.l ? IC_LIKE + p.l : '') + '</i>'
      + cmtRow(p) + '</div>'))).join('')
    : '<div class="post empty"><span>아직 올린 글이 없다. 한 슛 막고 오면 생긴다</span></div>';
  // 계정 요약. 맞팔이 몇인지가 팔로워 증가에 곱해지므로 그 수가 화면에 있어야 한다.
  const mut = mutualCount(state.social);
  const head = 'Outmoongram<small>' + IC_FANS + ' ' + state.fans.toLocaleString()
    + ' 맞팔 ' + mut + '명, 팔로워 ' + Math.round((mutualBoost(state.social) - 1) * 100) + '% 더 붙는다</small>';
  /* 답장을 기다리는 사람. 맞팔이 된 뒤 세 판이 지나면 다시 이 줄에 선다.
     계정을 여는 이유가 글을 보는 것 하나뿐이면 그 창은 읽고 닫는 창으로 굳는다. */
  const clock = dmClock(state.record);
  const waiting = dmWaiting(state.social, clock);
  const inbox = waiting.length
    ? '<div class="inbox">' + waiting.map((key) => {
      const part = key.split(':');
      const city = Number(part[0]);
      const passer = Number(part[1]);
      const tier = rapportTier(state.rapport, city, passer);
      return '<button class="dmOpen" data-key="' + key + '">' + passerName(city, passer, tier) + '<em>새 쪽지</em></button>';
    }).join('') + '</div>'
    : '';
  /* 계정 머리에 프로필 사진을 세운다. SNS 화면에서 계정을 여는 첫 신호는 이름이 아니라 얼굴이고,
     그 자리가 비어 있으면 이 창이 누구의 계정인지가 글자로만 서 있다. */
  const avatar = '<img class="pfp" alt="' + state.keeper.name + '" src="'
    + thumbURL('face', state.keeper, lookOf(state.gear, state.keeper.name)) + '">';
  box.innerHTML = '<h4>' + avatar + head + '</h4>' + inbox + '<div class="feed">' + feed + '</div><button class="close">닫기</button>';
  for (const b of box.querySelectorAll('.dmOpen')) {
    b.onclick = () => { dmOpen = b.dataset.key; dmSaid = null; renderGram(); };
  }
  for (const b of box.querySelectorAll('.fol')) {
    b.onclick = () => {
      // 맞팔 여부는 여기서 한 번 굴린다. 열 때마다 다시 굴리면 같은 사람이 매번 다른 답을 준다.
      state.social = follow(state.social, b.dataset.key, Math.random() * 100, Number(b.dataset.tier) || 0);
      persist();
      renderGram();
    };
  }
  box.querySelector('.close').onclick = closeGram;
}

function openGram() {
  if (!shutOthers('gram')) return;
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
  if (!shutOthers('earn')) return;
  el('earn').hidden = false;
  renderEarn();
}

function closeEarn() {
  el('earn').hidden = true;
}

function closeGram() {
  el('gram').hidden = true;
  // 닫을 때 대화를 비운다. 남겨 두면 다음에 계정을 열었을 때 남의 대화가 먼저 뜬다.
  dmOpen = null;
  dmSaid = null;
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
  if (!names.length) return '<div class="note dim"><span>아직 상대 전적이 없다. 한 슛을 막거나 먹히면 여기 쌓인다</span></div>';
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

// 만남 버튼 글자. 문은 판정이 열고, 값을 어떻게 보여 줄지는 화면이 정한다.
function dateLabel(g) {
  if (g.open) return SW(g.cost) + ' 내고 만나러 간다';
  if (g.short > 0) return SW(g.short) + ' 모자라다';
  return g.why;
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
    return '<div class="note"><b>' + cityAt(city).name + '에서 마주친 ' + who + '</b><i>말 섞은 횟수 ' + n
      + '. ' + face + '. 한눈팔기 ' + aid + '% 감소, 팔로워 +' + fans + '%</i>'
      + '<button class="go" data-city="' + city + '" data-passer="' + passer + '"' + (g.open ? '' : ' disabled') + '>' + dateLabel(g) + '</button></div>';
  }).join('');
  return head + rows;
}

/* 내 정보는 성격이 다른 넷을 한 두루마리에 쌓고 있었다. 능력치를 보러 온 사람과 전적을
   보러 온 사람은 다른 질문을 들고 오는데 화면은 하나라, 아래로 계속 긁어야 답이 나왔다.
   세 칸으로 가른다. 초상화와 걸친 것은 어느 칸에서도 남는다. 그것은 칸의 내용이 아니라
   지금 누구를 보고 있는지이기 때문이다. */
const ME_TABS = [['stat', '능력치'], ['face', '아는 얼굴'], ['log', '전적']];
let meTab = 'stat';

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
    + '<div class="on"><h5>몸에 걸친 것</h5>' + ['glove', 'boot', 'kit', 'sock', 'hair', 'ink'].map(wearRow).join('')
    + '<h5>서 있는 자리</h5>' + ['frame', 'city'].map(wearRow).join('') + '</div></div>';
  const grid = GROWABLE.map((s) => {
    const v = k[s];
    // 10은 성장 상한이다. 훈련장과 같은 기준이어야 두 창이 어긋나지 않는다.
    return '<span class="' + (v >= 10 ? 'max' : '') + '"><span class="who">' + STAT_ICON[s] + CAUSE_LABEL[s]
      + '</span><b>' + (v >= 10 ? 'MAX' : v) + '</b></span>';
  }).join('');
  const traits = (k.traits && k.traits.length)
    ? k.traits.map((t) => '<div class="note"><b>' + t + '</b><i>' + (TRAITS[t] ? TRAITS[t].note : '') + '</i></div>').join('')
    : '<div class="note dim"><span>달린 특성이 없다. 명단에서 데려오면 붙어 온다</span></div>';
  const hidden = HIDDEN.map((h) => '<div class="note"><b>' + HIDDEN_LABEL[h] + '</b><i>' + hiddenBand(h, k[h]) + '</i></div>').join('');
  const pane = meTab === 'log' ? recordRows()
    : meTab === 'face' ? rapportRows()
      : '<div class="grid">' + grid + '</div>' + traits + hidden;
  const tabs = '<div class="tabs">' + ME_TABS.map(([id, label]) =>
    '<button class="tab" data-tab="' + id + '"' + (meTab === id ? ' aria-current="true"' : '') + '>' + label + '</button>').join('') + '</div>';
  box.innerHTML = '<h4>' + name + '<small><i>Lv ' + k.level + '</i><i>' + k.height + 'cm</i><i>' + k.weight + 'kg</i></small></h4>'
    + '<div class="card">' + wear + tabs + '<div class="pane">' + pane + '</div></div>'
    + '<button class="close">닫기</button>';
  box.querySelector('.close').onclick = closeMe;
  for (const b of box.querySelectorAll('.tab')) b.onclick = () => { meTab = b.dataset.tab; renderMe(); };
  for (const b of box.querySelectorAll('.note .go')) b.onclick = () => openDate(Number(b.dataset.city), Number(b.dataset.passer));
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

/* 지금 열어 둔 쪽지. 키는 도시와 행인 인덱스이고, 답장을 보내면 결과가 여기 남는다.
   창을 닫으면 비운다. 남겨 두면 다음에 계정을 열었을 때 남의 대화가 먼저 뜬다. */
let dmOpen = null;
let dmSaid = null;

// 쪽지 한 통. 맞팔이라야 오고, 답장하면 다음 말은 세 판 뒤에 온다.
function renderDm() {
  const box = el('gram');
  const part = dmOpen.split(':');
  const city = Number(part[0]);
  const passer = Number(part[1]);
  const tier = rapportTier(state.rapport, city, passer);
  const who = passerName(city, passer, tier);
  const said = dmSaid && dmSaid.key === dmOpen ? dmSaid : null;
  const body = said
    ? '<div class="line them">' + said.said + '</div><div class="line me">' + said.pick + '</div>'
      + '<div class="out ' + (said.won ? 'win' : 'lose') + '">' + said.line
      + (said.fans ? ' ' + IC_FANS + ' +' + said.fans : '') + '</div>'
    : '<div class="line them">' + dmSay(city, passer, tier) + '</div>'
      + '<div class="pick">' + DM_MOVES.map((m) => '<button data-dm="' + m.id + '">' + m.label
        + '<em>' + CAUSE_LABEL[m.stat] + ' ' + state.keeper[m.stat] + '로 성공 ' + dmOdds(state.keeper, m.id) + '%</em></button>').join('') + '</div>';
  box.innerHTML = '<h4>' + who + '<small>쪽지</small></h4><div class="dm">' + body + '</div>'
    + '<button class="close">계정으로</button>';
  box.querySelector('.close').onclick = () => { dmOpen = null; dmSaid = null; renderGram(); };
  for (const b of box.querySelectorAll('[data-dm]')) b.onclick = () => sendDm(city, passer, tier, b.dataset.dm);
}

/* 먼저 온 말은 한 번 뽑아 그 대화가 열려 있는 동안 고정한다. 매 렌더마다 다시 뽑으면
   답장 버튼을 보다가 상대의 말이 바뀐다. */
let dmHeld = null;
function dmSay(city, passer, tier) {
  if (!dmHeld || dmHeld.key !== dmOpen) dmHeld = { key: dmOpen, text: dmLine(tier, Math.random) };
  return dmHeld.text;
}

// 답장. 성공하면 라포가 한 칸 오르고 팔로워가 붙는다. 실패해도 잃는 것은 없고 다음 말이 밀린다.
function sendDm(city, passer, tier, moveId) {
  const out = dmOutcome(state.keeper, moveId, Math.random() * 100);
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

/* 셀카 한 장. 내 계정에 올라가고 팔로워가 그 자리에서 오른다.
   사진은 저장에 안 실린다. 행인이 찍은 사진과 같은 이유로 그때의 차림만 남기고 열 때 다시 굽는다.
   상대 이름을 글에 박는 것은 이 사진의 주어가 둘이기 때문이다. */
function takeSelfie(city, passer, tier) {
  const fans = selfieFans(tier, state.gear.city);
  state.fans += fans;
  state.posts.push({ n: passerName(city, passer, tier), c: false, g: fans,
    t: selfieLine(Math.random), lb: fans, ct: state.gear.city,
    l: likesFor(fans, state.gear.city, Math.random()),
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
    + '<em>' + CAUSE_LABEL[m.stat] + ' ' + state.keeper[m.stat] + '로 성공 ' + dateOdds(state.keeper, m.id) + '%</em></button>').join('');
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
  // 뒤에 열려 있는 내 정보도 같이 그린다. 안 그리면 방금 쓴 육수와 내려간 라포가
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

// 상점. 선반은 이적시장과 장비 둘이다. 지목 구매는 값을 알고 이름을 사는 축이고
// 이적시장은 값을 알고 이름을 모르는 축이라 두 축이 겹치지 않는다.
// 장비는 이름도 값도 아는 대신 스탯 위에 얇게만 얹는 축이다.
// 결과 한 줄은 state에 넣지 않는다. 저장에 남을 값이 아니라 이 패널이 열려 있는 동안만 쓰는 글자다.
// 방금 뽑은 카드. 한 장씩 뒤집히는 동안 이름이 여기 쌓이고, 상점을 닫으면 비워진다.
let lastPull = [];
// 몇 장까지 뒤집혔는가. 뽑기와 별개로 도는 값이라, 이 수가 늘어도 지갑은 이미 치러져 있다.
let shown = 0;
// 뒤집기를 예약한 타이머. 상점을 닫거나 다시 뽑으면 끊는다. 안 끊으면 닫은 창에 카드가 계속 뜬다.
let revealTimer = 0;

// 지금 보고 있는 선반. lastPull과 같이 패널 수명만 사는 값이라 저장에 싣지 않는다.
// 지금 고른 뽑기 갈래도 같다. 상점을 닫으면 동네로 돌아간다.
let pullTab = 'town';
let shopTab = 'pull';
// 시착용 장부. 아직 안 산 채로 걸쳐 본 등급이 칸마다 하나씩 들어간다.
// 저장하지 않는다. 상점을 닫으면 벗는 것이 옷가게의 문법이고, 저장하면 안 산 옷을 입은 채로 판이 돈다.
let fitting = {};

// 지금 몸에 걸친 것과 걸쳐 본 것을 합친 모습. 탈의실 그림과 시착용 판정이 같은 값을 본다.
function fittedLook() {
  return lookOf(Object.assign({}, state.gear, fitting), state.keeper.name);
}

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
  // 두 확률을 점으로 잇지 않는다. 화면에서 그 점은 목록 기호로 읽히고, 값 둘이 한 항목처럼 붙는다.
  return '명성 10이 나올 확률 ' + (top / total * 100).toFixed(1) + '%, 명성 9 이상은 ' + (high / total * 100).toFixed(1) + '%';
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


/* 카드 하나가 파는 것을 문장으로 만든다. 수는 판정과 선반 데이터에서 꺼내고 문구만 여기서 짓는다.
   카드 본문에 다 적으면 격자가 다시 글자 벽이 되므로, 이 문장들은 왼쪽 기둥의 별도 칸이 받는다. */

// 자양강장제가 한눈팔기와 수다에 곱하는 값. 절반이라 두 사고가 같이 반으로 준다.
// 화면이 이 수를 옮겨 적으면 버프를 손본 날 선반 문구가 거짓말을 한다.
const TONIC_FOCUS = 0.5;
// 바이럴 떡밥이 소문에 곱하는 값. 판정 밖 축이라 팔로워에만 붙는다.
const HYPE_BOOST = 1.5;

const AXIS_WORD = {
  tear: '장갑이 벗겨지는 사고',
  spill: '손에서 흘리는 사고',
  delay: '첫 발이 뜨는 데 걸리는 시간',
  carry: '정면 강슛에 같이 밀려 들어가는 사고',
  landing: '착지에 실패하는 사고',
  neteat: '그물이 공을 먼저 먹는 확률',
  gaze: '눈에 띄는 행인이 지나갈 확률',
  passer: '동네에 서 있는 행인 수',
  crowd: '소문이 퍼지는 배율'
};
// 축마다 단위가 다르다. 확률은 %p, 시간은 ms, 사람은 명이다.
const AXIS_UNIT = { delay: 'ms', passer: '명', crowd: '%', tear: '%p', spill: '%p', carry: '%p', landing: '%p', neteat: '%p' };

function specLines(kind, rank) {
  const n = Number(rank);
  const s = SHELVES[kind];
  if (s) {
    const steps = GEAR_STEP[s.field];
    // 외형 선반은 판정에 안 들어간다. 대신 소문에 붙는 승수가 있고, 그것도 값이다.
    if (!steps) {
      const gain = Math.round(0.05 * n * 100);
      return n > 0 ? ['소문이 ' + gain + '% 더 퍼진다', '판정은 안 바뀐다. 보이는 것만 바뀐다']
        : ['아무것도 안 바꾼다'];
    }
    if (n === 0) return ['아무것도 안 샀을 때 자리다'];
    return steps.map((st) => {
      const v = Math.round(st.per * n * 10) / 10;
      const u = AXIS_UNIT[st.axis] || '';
      return AXIS_WORD[st.axis] + (st.up ? ' +' : ' -') + v + u;
    });
  }
  if (kind === 'bot') {
    const b = botAt(rank);
    if (!b) return [];
    // 팔로워가 안 붙는다는 사실은 선반 머리글이 이미 말한다. 여기는 성능과 기간만 말한다.
    return ['판단력을 ' + b.judge + '로 대신 굴린다', b.minutes + '분 켜지고, 내 키퍼가 더 높으면 손해다'];
  }
  if (kind === 'buff') {
    const b = buffAt(rank);
    if (!b) return [];
    // 카드 본문이 이미 든 문장을 여기서 되풀이하면 이 칸이 새 정보를 안 준다. 수로 말한다.
    const dose = b.shots + '슛 동안만 간다';
    if (b.kind === 'tonic') {
      const cut = Math.round((1 - TONIC_FOCUS) * 100);
      return ['한눈팔기 확률 -' + cut + '%', '수다 확률 -' + cut + '%', dose];
    }
    if (b.kind === 'hype') return ['소문이 퍼지는 배율 +' + Math.round((HYPE_BOOST - 1) * 100) + '%', dose];
    // 송진은 장갑 한 등급을 더 얹는 물건이라, 장갑 선반이 파는 그 두 축을 그대로 쓴다.
    return GEAR_STEP.grip.map((st) => AXIS_WORD[st.axis] + ' -' + st.per + (AXIS_UNIT[st.axis] || '')).concat([dose]);
  }
  return [];
}

// 왼쪽 기둥의 효과 칸. 카드에 손을 올린 것만 여기에 뜬다.
function showSpec(name, kind, rank) {
  const box = el('shop') && el('shop').querySelector('.spec');
  if (!box) return;
  const lines = specLines(kind, rank);
  box.innerHTML = '<b>' + name + '</b>' + lines.map((t) => '<i>' + t + '</i>').join('');
  box.dataset.at = kind + String(rank);
}

function clearSpec() {
  const box = el('shop') && el('shop').querySelector('.spec');
  if (!box) return;
  box.innerHTML = '<i class="dim">카드에 손을 올리면 무엇을 사는지가 여기 뜬다</i>';
  box.dataset.at = '';
}

// 탈의실. 지금 내 모습과 걸쳐 본 것을 한 자리에서 보여 준다.
// 값을 치르기 전에 자기 몸에서 확인할 수 있어야 꾸미는 재미가 산다.
function fittingRoom() {
  const url = thumbURL('body', state.keeper, fittedLook());
  // 변형은 값이 없는 칸이라 청구서와 걸친 목록에서 빠진다. 값 0짜리 줄이 서면
  // 전부 사기 버튼이 0원을 부르며 켜지고, 벗기 목록에 이름 없는 줄이 하나 생긴다.
  const tried = Object.keys(fitting).filter((f) => shelfOfField(f));
  const bill = tried.reduce((n, f) => n + costOfField(f, fitting[f]), 0);
  // 걸친 줄마다 벗는 자리를 둔다. 다시 카드를 찾아 누르는 것이 유일한 길이면,
  // 무엇을 걸쳤는지 아는 자리와 그것을 무르는 자리가 갈려 있다.
  const lines = tried.length
    ? tried.map((f) => '<i data-off="' + f + '">' + nameOfField(f, fitting[f]) + '<b>X</b></i>').join('')
    : '<i class="dim">눌러서 걸쳐 본다</i>';
  const canAll = tried.length > 0 && bill <= state.wallet.coin;
  const allLabel = tried.length === 0 ? '고른 것이 없다'
    : (canAll ? '전부 사기 ' + SW(bill) : SW(bill - state.wallet.coin) + ' 모자라다');
  return '<div class="fitting">'
    + '<div class="me">' + (url ? '<img alt="" src="' + url + '">' : '') + '</div>'
    + '<b>' + state.keeper.name + '</b>'
    + '<div class="tried">' + lines + '</div>'
    + '<div class="acts">'
    + '<button class="all"' + (canAll ? '' : ' disabled') + '>' + allLabel + '</button>'
    + (tried.length ? '<button class="strip">전부 벗기</button>' : '')
    + '</div>'
    // 효과 칸. 카드 본문은 이름과 한 줄만 들고, 수치는 손을 올린 카드의 것만 여기 뜬다.
    + '<div class="spec"><i class="dim">카드에 손을 올리면 무엇을 사는지가 여기 뜬다</i></div>'
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
    let label = SW(g.cost);
    let off = false;
    if (rank === have) {
      label = s.worn;
      off = true;
    } else if (rank < have) {
      label = s.past;
      off = true;
    } else if (state.wallet.coin < g.cost) {
      // 못 누르는 사유를 버튼 글자로 적는다. 회색으로만 죽이면 이유를 알 수 없다.
      label = SW(g.cost - state.wallet.coin) + ' 모자라다';
      off = true;
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
    return '<div class="card gear" data-spec="' + kind + '" data-at="' + rank + '"><div class="shot" data-kind="' + kind + '" data-rank="' + rank + '"></div>'
      + '<b>' + g.name + '</b><em>' + g.note + '</em>' + skins
      + '<button class="buy" data-kind="' + kind + '" data-rank="' + rank + '"' + (off ? ' disabled' : '') + '>' + label + '</button></div>';
  });
  const top = have >= s.top ? '<span class="got">' + s.at(s.top).name + '까지 갔다. 더 살 게 없다</span>' : '';
  return '<h4>' + s.head + '</h4><div class="rack">' + rows.join('') + '</div>' + top;
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

function bindGear(box) {
  // 파는 물건을 그려서 건다. 등급마다 몸에 걸친 상태를 따로 만들어 굽기 때문에
  // 등급이 색을 안 바꾸면 네 장이 같은 그림이 되고, 그 사실이 화면에서 바로 드러난다.
  for (const shot of box.querySelectorAll('.shot[data-kind]')) {
    const s = SHELVES[shot.dataset.kind];
    if (!s) continue;
    const g = s.at(shot.dataset.rank);
    const look = lookOf(Object.assign({}, state.gear, { [s.field]: g[s.field] }), state.keeper.name);
    // 골대와 동네는 몸이 아니라 장면이라 외형 묶음이 아니라 등급 자체를 받는다.
    // 장면 칸은 외형 묶음이 아니라 등급과 변형 둘을 받는다. 걸쳐 본 변형이 있으면 그것으로 굽는다.
    const pickSkin = fitting[s.field + 'Skin'] !== undefined ? fitting[s.field + 'Skin'] : state.gear[s.field + 'Skin'];
    const arg = (s.field === 'frame' || s.field === 'city')
      ? { rank: g[s.field], skin: fitting[s.field] === g[s.field] ? pickSkin : 0 }
      : look;
    const url = thumbURL(s.field, state.keeper, arg);
    if (!url) continue;
    shot.innerHTML = '<img alt="" src="' + url + '">';
    const card = shot.parentNode;
    card.onpointerenter = () => startSpin(shot, s.field, state.keeper, arg);
    card.onpointerleave = () => stopSpin();
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
      if (state.wallet.coin < g.cost) return;
      state.wallet.coin -= g.cost;
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
      if (['hair', 'ink', 'grip', 'studs', 'pads', 'socks'].includes(s.field)) stage.setKeeper(state.keeper, lookOf(state.gear, state.keeper.name));
      // 산 것은 걸쳐 본 목록에서 빠진다. 안 빼면 이미 내 것이 장바구니에 남아 값이 두 번 잡힌다.
      if (fitting[s.field] !== undefined && fitting[s.field] <= state.gear[s.field]) delete fitting[s.field];
      persist();
      pips();
      renderShop();
    };
  }
}


/* 카드 한 장에 쓰는 시간. 뒤집기 0.34초가 끝나고도 앞면이 서 있어야 이름이 읽히므로
   그보다 길어야 한다. 열 장이면 6.4초다. 상점 안 칩이 1.3초에 끝나던 것보다 길지만,
   이 장르에서 뽑는 순간은 결과 통보가 아니라 파는 물건 자체다. 급하면 눌러서 건너뛴다.
   명성 9 이상은 한 박자 더 세워 둔다. 마흔여섯 중 여덟이라 그 멈춤이 자주 오지 않는다. */
const REVEAL_MS = 640;
const RARE_HOLD_MS = 420;
// 뒤집는 데 걸리는 시간. hud.css의 pullFlip과 같은 값이어야 앞면이 뒤집기 도중에 안 뜬다.
const FLIP_MS = 340;

// 한 장씩 연다. 예약을 하나만 들고 있으므로 다시 뽑으면 앞의 연출이 끊긴다.
function revealNext() {
  revealTimer = 0;
  if (shown >= lastPull.length) return;
  shown += 1;
  paintPull();
  if (shown < lastPull.length) {
    const rare = lastPull[shown - 1].fame >= 9;
    revealTimer = setTimeout(revealNext, REVEAL_MS + (rare ? RARE_HOLD_MS : 0));
  }
}

// 남은 것을 한 번에 연다. 기다리는 것이 연출이지 벌은 아니다.
function revealAll() {
  if (revealTimer) { clearTimeout(revealTimer); revealTimer = 0; }
  shown = lastPull.length;
  paintPull();
}

function stopReveal() {
  if (revealTimer) { clearTimeout(revealTimer); revealTimer = 0; }
  lastPull = [];
  shown = 0;
  el('pull').hidden = true;
}

/* 개봉 화면. 지금 서는 한 장과 이미 나온 줄과 남은 수를 그린다.
   상점을 다시 그리지 않는다. 뒤에서 선반이 다시 서면 뒤집는 도중에 화면이 한 번 튄다. */
function paintPull() {
  const box = el('pull');
  if (!lastPull.length) { box.hidden = true; return; }
  const at = Math.max(0, shown - 1);
  const k = lastPull[at];
  const rare = k.fame >= 9;
  const done = lastPull.slice(0, Math.max(0, shown - 1))
    .map((c) => '<i class="' + (c.fame >= 9 ? 'rare' : '') + '">' + c.name + '</i>').join('');
  // 마지막 장까지 열렸으면 넘길 것이 없다. 그때부터 이 화면은 닫는 화면이다.
  const over = shown >= lastPull.length;
  box.innerHTML = '<div class="count">' + shown + ' / ' + lastPull.length + '</div>'
    /* 카드 안에 사람이 없으면 이름을 적은 빈 판이다. 선수단과 상점이 이미 쓰는 전신 그림을
       그대로 굽는다. 걸친 것은 내 장비가 아니라 기본 차림이다. 아직 내 선수가 아니기 때문이다. */
    + '<div class="now' + (rare ? ' rare' : '') + '"><u>' + k.fame + '</u>'
    + '<img alt="' + k.name + '" src="' + thumbURL('card', k, lookOf({}, k.name)) + '">'
    + '<b>' + k.name + '</b></div>'
    + '<div class="done">' + done + '</div>'
    + '<div class="hint">' + (over ? '눌러서 닫기' : '눌러서 건너뛰기') + '</div>';
  box.hidden = false;
  // 애니메이션은 클래스를 다시 붙여야 다시 돈다. 같은 노드를 재사용하면 두 번째 장이 안 뒤집힌다.
  const now = box.querySelector('.now');
  void now.offsetWidth;
  now.classList.add('turn');
  box.onclick = () => {
    if (shown < lastPull.length) return revealAll();
    stopReveal();
    // 첫 진입은 두 마디다. 키퍼를 닫으면 그 자리에서 키커가 이어 열린다.
    onboardStep();
  };
}


/* 첫 진입. 가입 직후 아무것도 안 뽑고 시작하면 첫 키퍼와 주전 열하나가 조용히 배정된다.
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
    const pick = pullFrom(left, Math.random);
    if (!pick) break;
    left.splice(left.indexOf(pick), 1);
    drawn.push(pick);
  }
  if (!drawn.length) { state.onboard = ONBOARD_DONE; return false; }
  for (const k of drawn) state.kickers.push(k.name);
  /* 뽑은 사람으로 주전을 다시 세운다. 정원 안에서 뽑힌 사람을 먼저 넣고 모자란 자리는
     시작 열하나가 채운다. 뽑았는데 아무도 안 뛰면 그 열한 장이 무엇을 산 것인지 화면에 없다. */
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

function pullShelf(all) {
  const kind = pullKindOf(pullTab);
  const pool = poolFor(all, kind.id);
  const cost = pullCostOf(kind.id);
  // 갈래 줄. 하한이 다르면 다른 뽑기라, 값과 확률과 남은 장수가 통째로 갈린다.
  const tabs = '<div class="kinds">' + PULL_KINDS.map((k) =>
    '<button class="kind" data-kind="' + k.id + '"' + (k.id === kind.id ? ' aria-current="true"' : '') + '>'
    + k.name + '</button>').join('') + '</div>';
  // 이용권이 먼저 나가고 모자란 만큼만 값을 치른다. 두 자리가 같은 규칙을 쓰므로 판정이 소유한다.
  const held = kind.ticketable ? state.tickets : 0;
  const rows = [1, PULL_BULK].map((want) => {
    const bill = pullBill(want, held, state.wallet.coin, cost);
    const left = Math.min(want, pool.length);
    /* 뽑기 버튼은 장르가 오래 쓴 자리를 그대로 쓴다. 큰 글씨로 몇 회인지, 그 아래 값이다.
       내고 몇 장이라는 문장은 버튼이 할 말이 아니고, 못 사는 이유도 버튼 글자가 아니라
       비활성 상태가 이미 말한다. 사유는 버튼 위 배지가 한 마디로 받는다. */
    const off = !pool.length || !bill.afford || left < want;
    // 이용권으로 다 내는 회차는 값 대신 이용권 수를 적는다. 나가는 것이 다른 자원이다.
    const price = bill.cost > 0 ? SW(bill.cost) : IC_TICKET + bill.free;
    const why = !pool.length ? '품절' : (!bill.afford ? '잔고 부족' : (left < want ? '남은 카드 ' + left : ''));
    return '<button class="buy pull" data-want="' + want + '"' + (off ? ' disabled' : '') + '>'
      + (why ? '<u>' + why + '</u>' : '')
      // 보너스가 붙는 회차는 그 사실이 버튼에 있어야 한다. 눌러 봐야 아는 이득은 이득이 아니다.
      + (want === PULL_BULK ? '<s>+' + PULL_BONUS + '</s>' : '')
      + '<b>' + want + '회</b><i>' + price + '</i></button>';
  }).join('');
  /* 확률은 사는 자리가 아니라 확인하는 자리다. 본문에 두 줄로 깔면 살 것을 고르는 눈이
     매번 그 줄을 지나간다. 눌러야 열리는 칸으로 뺀다. */
  const odds = pool.length
    ? '<details class="odds"><summary>확률과 남은 카드</summary><em>' + shopOdds(pool)
      + '<br>남은 카드 ' + pool.length + '장</em></details>'
    : '';
  /* 보유 이용권은 문장이 아니라 숫자다. 지금 몇 장 있다고 말하는 대신 아이콘 옆에 수를 세운다.
     이 갈래가 이용권을 안 받으면 그 줄을 안 세운다. 없는 자원을 설명하는 줄은 읽을 것만 는다. */
  const bank = kind.ticketable ? '<span class="held">' + IC_TICKET + '<b>' + state.tickets + '</b></span>' : '';
  return '<h4>이적시장</h4>' + tabs + '<div class="card">'
    + '<div class="lede"><em>' + kind.note + '</em>' + bank + '</div>' + odds
    + '<div class="buys">' + rows + '</div>'
    + '</div>';
}// 봇은 소모형이라 SHELVES에 못 넣는다. 등급을 갖는 게 아니라 분을 갖는다.
function botShelf() {
  const cur = state.bot;
  const left = Math.ceil(cur.ms / 60000);
  const rows = BOTS.map((b) => {
    let label = SW(b.cost) + ' 내고 ' + b.minutes + '분';
    let off = false;
    if (state.wallet.coin < b.cost) {
      // 못 누르는 사유를 버튼 글자로 적는다. 회색으로만 죽이면 이유를 알 수 없다.
      label = SW(b.cost - state.wallet.coin) + ' 모자라다';
      off = true;
    } else if (cur.ms > 0 && b.tier === cur.tier) {
      label = '남은 ' + left + '분에 ' + b.minutes + '분 더';
    } else if (cur.ms > 0 && b.tier < cur.tier) {
      // 더 좋은 클론이 서 있는데 싼 걸 사면 등급이 내려간다. 산 사람은 그걸 산 줄 모른다.
      label = '더 좋은 클론이 남아 있다';
      off = true;
    }
    return '<div class="card gear" data-spec="bot" data-at="' + b.tier + '"><b>' + b.name + '</b><em>' + b.note + '</em>'
      + '<button class="buy" data-bot="' + b.tier + '"' + (off ? ' disabled' : '') + '>' + label + '</button></div>';
  });
  return '<h4>봇</h4><span class="got">봇이 대신 막은 슛에는 팔로워가 안 붙는다</span><div class="rack">' + rows.join('') + '</div>';
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
    let label = SW(b.cost) + ' 내고 ' + b.shots + '슛';
    let off = false;
    if (state.wallet.coin < b.cost) {
      // 못 누르는 사유를 버튼 글자로 적는다. 회색으로만 죽이면 이유를 알 수 없다.
      label = SW(b.cost - state.wallet.coin) + ' 모자라다';
      off = true;
    } else if (cur.shots > 0 && cur.kind === b.kind) {
      label = '남은 ' + cur.shots + '슛에 ' + b.shots + '슛 더';
      // 상한에 닿으면 산 구가 그대로 버려진다. 사기 전에 알아야 한다.
      if (cur.shots >= BUFF_CAP) { label = '더 못 담는다'; off = true; }
    } else if (cur.shots > 0) {
      // 슬롯이 하나라 다른 종류를 사면 지금 것이 덮인다. 산 사람은 그걸 산 줄 모른다.
      label = buffAt(cur.kind).name + '가 아직 ' + cur.shots + '슛 남았다';
      off = true;
    }
    return '<div class="card gear" data-spec="buff" data-at="' + b.kind + '"><b>' + b.name + '</b><em>' + b.note + '</em>'
      + '<button class="buy" data-buff="' + b.kind + '"' + (off ? ' disabled' : '') + '>' + label + '</button></div>';
  });
  return '<h4>버프</h4><span class="got">시간이 아니라 슛으로 닳는다. 한 번에 한 종류만 든다</span><div class="rack">' + rows.join('') + '</div>';
}

function bindBuff(box) {
  for (const b of box.querySelectorAll('.buy[data-buff]')) {
    b.onclick = () => {
      if (b.disabled) return;
      const spec = buffAt(b.dataset.buff);
      if (!spec || state.wallet.coin < spec.cost) return;
      const next = addBuff(state.buff, spec.kind);
      // 다른 종류가 살아 있으면 addBuff가 원본을 그대로 돌려준다. 그때 값을 치르면 육수만 사라진다.
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
  // 이름은 선반 데이터가 소유하고 이적시장과 봇과 버프만 따로 적는다. 열한 줄을 손으로 늘어놓으면
  // 선반 이름을 고친 날 탭만 옛 이름을 부른다.
  const tabName = (k) => (SHELVES[k] ? SHELVES[k].head : { pull: '이적시장', bot: '봇', buff: '버프' }[k]);
  const tabs = '<div class="tabs">' + SHOP_TABS.map((k) =>
    '<button class="tab" data-tab="' + k + '"' + (shopTab === k ? ' aria-current="true"' : '') + '>'
    + TAB_ICON[k] + '<span>' + tabName(k) + '</span></button>').join('') + '</div>';
  const goods = SHELVES[shopTab] ? gearShelf(shopTab) : shopTab === 'bot' ? botShelf() : shopTab === 'buff' ? buffShelf() : pullShelf(pool);
  box.innerHTML = '<div class="shopbody">' + fittingRoom() + '<div class="goods">' + tabs + goods + '</div></div>'
    + '<button class="close">닫기</button>';
  box.querySelector('.close').onclick = closeShop;
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
    if (bill > state.wallet.coin) return;
    state.wallet.coin -= bill;
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
    t.onclick = () => { shopTab = t.dataset.tab; renderShop(); };
  }
  bindSpec(box);
  // 갈래를 바꾸면 값과 확률과 남은 장수가 통째로 갈리므로 선반을 다시 그린다.
  for (const k of box.querySelectorAll('.kind')) k.onclick = () => {
    pullTab = k.dataset.kind;
    renderShop();
  };
  if (SHELVES[shopTab]) return bindGear(box);
  if (shopTab === 'bot') return bindBot(box);
  if (shopTab === 'buff') return bindBuff(box);
  for (const buy of box.querySelectorAll('.buy[data-want]')) buy.onclick = () => {
    if (buy.disabled) return;
    const want = Number(buy.dataset.want);
    const kind = pullKindOf(pullTab);
    const here = poolFor(pool, kind.id);
    const bill = pullBill(want, kind.ticketable ? state.tickets : 0, state.wallet.coin, pullCostOf(kind.id));
    if (!bill.afford || want > here.length) return;
    // 값을 깎기 전에 뽑는다. 빈 풀에 값만 치르는 경로는 만렙 훈련 데드락과 같은 결함이다.
    // 뽑은 카드는 풀에서 즉시 빠진다. 안 빼면 한 묶음 안에서 같은 이름이 두 번 나온다.
    const left = here.slice();
    const drawn = [];
    /* 열 장 회차는 열한 장이 나온다. 값은 열 배 그대로이므로 이것이 묶음의 유일한 이득이고,
       그래서 한 장 자리가 안 죽는다. 뽑는 수는 판정이 소유하는 함수가 정한다. */
    const take = pullYield(want);
    for (let i = 0; i < take; i += 1) {
      const pick = pullFrom(left, Math.random);
      if (!pick) break;
      left.splice(left.indexOf(pick), 1);
      drawn.push(pick);
    }
    if (!drawn.length) return;
    state.tickets -= bill.free;
    state.wallet.coin -= bill.cost;
    for (const pick of drawn) state.squad.push(recruit(pick));
    // 뽑은 카드로 자동 전환하지 않는다. 무작위 결과가 뛰던 키퍼를 임의로 강등시키면
    // 뽑기가 이득이 아니라 사고가 된다. 교체는 선수단에서 사람이 고른다.
    // 값은 여기서 이미 치러졌다. 뒤집기는 결과를 보여 주는 일이지 판정을 미루는 일이 아니다.
    stopReveal();
    lastPull = drawn.slice();
    persist();
    pips();
    renderShop();
    // 첫 장은 기다리지 않고 바로 선다. 값을 치른 직후에 빈 화면을 보는 구간이 없어야 한다.
    revealNext();
  };
}

function openShop() {
  if (!shutOthers('shop')) return;
  el('shop').hidden = false;
  renderShop();
}

function closeShop() {
  el('shop').hidden = true;
  // 지난번 결과를 들고 다시 열면 방금 뽑은 것처럼 읽힌다. 예약도 같이 끊는다.
  stopReveal();
  // 선반도 처음 자리로 돌린다. 닫을 때 보던 탭이 남으면 다음에 연 사람이 이적시장을 못 찾는다.
  shopTab = 'pull';
  pullTab = 'town';
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
window.__gym = (open) => { if (open) openGym(); else closeGym(); };
// 그린 창과 잰 창을 맞대는 자리. 화면이 읽은 값과 판정이 쓰는 값을 같이 돌려준다.
window.__beat = () => {
  const lane = el('beat').querySelector('.lane');
  const st = getComputedStyle(lane);
  return Object.assign({ hotL: st.getPropertyValue('--hot-l').trim(), hotW: st.getPropertyValue('--hot-w').trim() },
    lastBeat || {});
};
window.__gram = (open) => { if (open) openGram(); else closeGram(); };
window.__me = (open) => { if (open) openMe(); else closeMe(); };
// 만남은 내 정보 안의 버튼으로만 열린다. 게이트가 그 버튼까지 클릭해서 오게 하려면 좌표가 필요하다.
window.__date = (city, passer) => { if (city === undefined) closeDate(); else openDate(city, passer); };
window.__shop = (open) => { if (open) openShop(); else closeShop(); };
window.__earn = (open) => { if (open) openEarn(); else closeEarn(); };
// 이용권 잔고. 완봉 보상과 뽑기 차감을 계기가 데이터에서 읽는다.
window.__tickets = () => state.tickets;
// 주전 열하나. 계기는 화면 글자가 아니라 장부를 읽어야 마크업이 바뀌어도 판정이 안 흔들린다.
window.__eleven = () => state.eleven.slice();
// 계기가 심은 값을 저장까지 밀어 넣는 자리. 계정이 갈리는지는 저장에 닿아야 재진다.
window.__persist = () => { persist(); return true; };
window.__kickers = () => state.kickers.slice();
// 뒤집힌 카드 수와 뽑은 카드 수. 연출이 도는 동안 계기가 이 둘을 읽어 한 번에 안 열리는 것을 본다.
window.__reveal = () => ({ shown, drawn: lastPull.length });
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
window.__social = () => state.social;
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
  stage.setKeeper(state.keeper, lookOf(state.gear, state.keeper.name));
stage.setCity(state.gear.city, state.gear.citySkin);
stage.setGoal(state.gear.frame, state.gear.frameSkin);
  // 밀린 훈련이 있어도 공부터 온다. 쓸지 말지는 훈련장 버튼이 들고 있다.
  nextSet();
  /* 처음 온 사람은 공보다 카드가 먼저다. 판은 뒤에서 이미 돌고 있고 개봉 화면이 그 위를 덮으므로,
     닫는 순간 바로 첫 구가 온다. 이미 하던 사람에게는 아무 일도 안 일어난다. */
  onboardStep();
});
