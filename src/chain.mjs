// GTG 체인 판정 엔진.
// 롤이 먼저 굴러 결과를 확정하고, 연출은 확정된 결과를 연기한다.
// 물리엔진은 없다. 이유는 성능이 아니라 원인의 소유권이다.
// 모든 사고는 스탯 하나에 귀속된다. 원인 없는 난수는 이 파일에 없다.

import { LOCKED, GROWABLE } from "./ledger.mjs";
import { KICKERS } from "./roster.mjs";

export const GOAL_HALF_W = 2.2;
export const GOAL_H = 1.9;

// 서서 손을 뻗었을 때 닿는 기준선. 수직 반경은 여기서부터 잰다.
const SHOULDER = 0.90;

// 한 칸이 여유에 주는 몫. 둘의 비가 실점 원인 순위를 정하므로 함께 읽는다.
// 측정으로 고른 쌍이다. 둘 중 하나만 움직이면 한 칸이 전 구간 1위를 독점한다.
const K_LAT = 0.025;   // 오프더볼이 서 있는 자리에 주는 몫
const K_DIVE = 0.027;  // 다이빙이 수평 반경에 주는 몫
const HORIZ0 = 0.80;   // 서서 옆으로 뻗었을 때의 고정 반경
const W_FRONT = 0.003; // 정면 실루엣. 무거울수록 몸에 맞는 폭이 넓다
const W_MOVE = 1.2;    // 무게가 기동에 더하는 지연 ms/kg
const H_LOW = 3.6;     // 큰 키가 낮은 공에 몸을 접는 데 드는 지연 ms/cm
const W_BRACE = 0.45;  // 정면 강슛을 버티는 질량
// 장갑 등급 한 칸이 깎는 값. 벗겨지는 사고 쪽 4, 흘리는 쪽 5다.
// 핸들링 한 칸이 흘림에서 6을 깎으므로 장갑 한 칸은 스탯 한 칸보다 작다.
// 장비가 스탯보다 크면 훈련이 장식이 된다.
const GRIP_TEAR = 4;
const GRIP_SPILL = 5;
// 축구화 등급 한 칸이 깎는 출발 지연 ms. 민첩성 한 칸이 12ms를 깎으므로 한 칸은 그보다 작다.
// 세 칸을 다 신어도 21ms라 민첩성 두 칸에 못 미친다. 장비는 스탯 위에 얇게만 얹는다.
const STUD_MS = 7;
const WIN0 = 70;
const STREAK_K = 6.0;

export function makeRng(seed) {
  let s = seed >>> 0 || 1;
  return function () {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const pct = (rng, p) => rng() * 100 < p;

export function newKeeper() {
  return keeperAt({ diving: 3, handling: 3, reflex: 4, offball: 3, judgement: 3, agility: 3, balance: 3, strength: 3, mischief: 4, focus: 3, composure: 3, resilience: 3, goalKick: 3, throwing: 3, communication: 3 }, 188, 84, 5, 5);
}

function keeperAt(stats, height, weight, consistency, professionalism) {
  // 기복은 히든이다. 숫자로 안 뜨고 그날의 손끝으로만 드러난다.
  return Object.assign({ height, weight, level: 1, consistency, professionalism, form: 0, streak: 0 }, stats);
}

// 명단의 한 줄을 플레이어가 쓰는 키퍼로 바꾼다.
// 명단은 아홉 칸만 선언한다. 나머지 여섯 칸은 신인과 같은 3으로 채운다.
// 3으로 채우는 이유는 영입한 키퍼가 훈련 대상 칸을 갖고 시작해야 만렙 데드락이 안 나기 때문이다.
// 기복 5와 프로의식 5도 신인과 같다. 히든 차등은 아직 열지 않았다.
const ROSTER_FILL = ['focus', 'composure', 'resilience', 'goalKick', 'throwing', 'communication'];

export function keeperFromRoster(entry) {
  const stats = { diving: entry.diving, handling: entry.handling, reflex: entry.reflex, offball: entry.offball, judgement: entry.judgement, agility: entry.agility, balance: entry.balance, strength: entry.strength, mischief: entry.mischief };
  for (const f of ROSTER_FILL) stats[f] = 3;
  const k = keeperAt(stats, entry.height, entry.weight, 5, 5);
  k.name = entry.name;
  k.traits = Array.isArray(entry.traits) ? entry.traits.slice() : [];
  return k;
}

// 기복. 한 판이 시작할 때 한 번 굴러 그 판의 실효 칸을 흔든다.
// 구마다 흔들면 같은 판 안에서 사람이 손을 고칠 수가 없다.
export function rollForm(keeper, rng) {
  // 연속 실점은 판을 넘어가지 않는다. 판이 바뀌면 어제 먹힌 것은 끝난 일이다.
  keeper.streak = 0;
  const swing = (10 - (keeper.consistency || 5)) * 0.22;
  keeper.form = Math.round((rng() * 2 - 1) * swing * 10) / 10;
  return keeper.form;
}

// 레벨은 성장 포인트의 총량만 정한다. 어디에 붙는지는 성장 선택지가 정하므로 여기서는 무작위 배분이다.
// 배분을 고정하면 모든 레벨의 키퍼가 같은 약점을 갖고, 실점 원인 분포가 한 칸으로 쏠린다.
export function keeperAtLevel(level, rng) {
  const stats = {};
  for (const k of GROWABLE) stats[k] = 3;

  // 성장 선택지는 매번 셋만 뜬다. 그래서 실제 키퍼는 균등하지 않고, 그 편향이 그 키퍼의 약점이다.
  // 균등 배분으로 만든 표본은 모든 레벨이 같은 모양이 되고, 실점 원인 순위가 레벨을 따라 안 움직인다.
  let points = (level - 1) * 3;
  while (points > 0) {
    const offer = [];
    const pool = GROWABLE.filter((k) => stats[k] < 10);
    if (!pool.length) break;
    while (offer.length < 3 && pool.length) offer.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
    // 고르는 손도 사람마다 다르다. 낮은 칸을 메우는 손과 높은 칸을 더 밀어 올리는 손이 같이 있어야
    // 한 칸만 높은 키퍼와 고르게 퍼진 키퍼가 같은 표본 안에 산다.
    const greedy = rng() < 0.5;
    let pick = offer[0];
    for (const k of offer) {
      if (greedy ? stats[k] > stats[pick] : stats[k] < stats[pick]) pick = k;
    }
    stats[pick] += 1;
    points -= 1;
  }

  const height = 178 + Math.floor(rng() * 21);
  const weight = 74 + Math.floor(rng() * 21);
  const keeper = keeperAt(stats, height, weight, 2 + Math.floor(rng() * 8), 2 + Math.floor(rng() * 8));
  keeper.level = level;
  return keeper;
}


// 상대는 레벨을 따라 세진다. 안 세지면 성장한 키퍼가 전 구를 막고 실점 표본이 사라진다.
function scaleKicker(k, level) {
  const g = clamp((level - 3) * 0.32, 0, 3.2);
  return {
    name: k.name, role: k.role, fame: k.fame,
    finishing: clamp(k.finishing - 2 + g, 1, 10),
    power: clamp(k.power - 2 + g, 1, 10),
    composure: clamp(k.composure - 1 + g * 0.6, 1, 10),
    curve: k.curve, flair: k.flair
  };
}

function courseOf(aimX, aimY) {
  if (Math.abs(aimX) <= 0.55) return "정면";
  return aimY >= 1.15 ? "상단" : "하단";
}

// 한 판은 슛 다섯 개. 앞 두 개는 판독을 가르치고 마지막 한 개는 나가지 않으면 못 막는다.
export function buildSet(rng, level = 5) {
  const shots = [];
  for (let i = 0; i < 5; i++) {
    const k = scaleKicker(KICKERS[Math.floor(rng() * KICKERS.length)], level);
    let aimX, aimY, forced;
    if (i < 2) {
      aimX = (rng() < 0.5 ? -1 : 1) * (0.65 + rng() * 0.5);
      aimY = 0.35 + rng() * 1.15;
      forced = false;
    } else if (i === 4) {
      aimX = (rng() < 0.5 ? -1 : 1) * (1.45 + rng() * 0.6);
      aimY = 0.5 + rng() * 1.35;
      forced = true;
    } else {
      const side = rng() < 0.4 ? 0 : rng() < 0.5 ? -1 : 1;
      aimX = side * (1.0 + rng() * 0.9);
      aimY = 0.3 + rng() * 1.55;
      forced = false;
    }
    // 눈에 띄는 행인이 지나가는 구. 행인은 늘 걷고 있지만 고개가 돌아갈 만한 건 가끔이다.
    // 여기서 매 구 굴려야 같은 맵을 돌아도 언제 걸릴지 모른다.
    const gaze = pct(rng, 30);
    // 휘어들어오는 공. 마커가 서준 자리에서 끝에 빗나간다.
    // 배치를 맞춘 키퍼를 저격하는 항이므로 키커 칸이 소유한다.
    const bend = pct(rng, 8 + k.curve * 3.4) ? 0.02 + k.curve * 0.028 : 0;
    const chip = pct(rng, 6 + k.flair * 1.6);
    // 칩은 세게 차는 공이 아니다. 둘이 같이 서면 몸싸움 롤과 칩 롤이 한 구에 겹쳐 상한을 넘긴다.
    const strong = chip ? false : pct(rng, 20 + k.power * 6);
    shots.push({
      index: i, kicker: k, aimX, aimY, forced, strong, chip, gaze, bend,
      side: aimX < -0.55 ? -1 : aimX > 0.55 ? 1 : 0,
      course: courseOf(aimX, aimY),
      // 슛파워가 시간을 줄인다. 판정 창을 직접 압박하는 항이다.
      flight: clamp(1.05 - k.power * 0.05 - (strong ? 0.1 : 0), 0.55, 1.1)
    });
  }
  return shots;
}

// 0단 배치. 오프더볼이 소유한다.
// 서 있는 자리가 밀린 거리. 앞에서 한 칸이 크고 뒤에서 작다.
function lateralGap(offball) {
  const d = 10 - clamp(offball, 1, 10);
  return Math.sqrt(d) * K_LAT * 2.6;
}

function placement(keeper, shot) {
  return {
    lateral: lateralGap(keeper.offball),
    depth: 0.12,
    markerAt: shot.flight * 0.72
  };
}

// 1단 접촉의 여유. 양수면 닿는다.
// 각 항의 주인은 STATS 15절이 정한다. 여기서 계수를 발명하지 않는다.
function contactMargin(keeper, shot, input, over) {
  const form = keeper.form || 0;
  const s = (k) => clamp((over && k in over ? over[k] : keeper[k]) + form, 1, 10);
  const k = shot.kicker;
  const power = over && "kickerPower" in over ? over.kickerPower : k.power;
  // 프로브는 한 칸만 움직인다. 커브를 절반으로 줄이면 한 칸이 아니라 다섯 칸을 준 것이 된다.
  const bend = Math.max(0, (shot.bend || 0) - (over && "bendSub" in over ? over.bendSub : 0));
  const flight = clamp(1.05 - power * 0.05 - (shot.strong ? 0.1 : 0), 0.55, 1.1);

  const offball = s("offball");
  const lateral = lateralGap(offball);
  const depth = 0.12;
  const markerAt = flight * 0.72;

  const advance = input.advance;
  const forward = depth + advance;

  // 판정 창과 기동. 반응속도가 인지이고 민첩성이 기동이다.
  let windowMs = WIN0 + 13 * s("reflex") + 4 * s("composure");
  // 연속 실점은 다음 구를 좁힌다. 회복탄력성이 그 좁혀짐을 먹는다.
  const streak = Math.min(keeper.streak || 0, 3);
  if (streak > 0) windowMs -= streak * (10 - s("resilience")) * STREAK_K;
  // 강슛은 창을 좁힌다. 침착성이 그 좁혀짐을 막는다.
  if (shot.strong) windowMs -= (10 - s("composure")) * 10;
  const SCALE_MS = 200;
  // 무게는 기동을 늦춘다. 정면 공은 서 있는 자리로 오므로 기동이 없고, 그래서 이 항도 없다.
  let moveDelay = 104 - 12 * s("agility");
  if (shot.course !== "정면") moveDelay += (keeper.weight - 84) * W_MOVE;
  // 큰 키는 낮은 공까지 몸을 접어 내리는 데 시간이 더 든다.
  if (shot.course === "하단") moveDelay += (keeper.height - 188) * H_LOW;
  // 축구화. 흙을 무는 만큼 첫 발이 빨리 뜬다. 선반 밖의 값은 저장이 오염된 것이므로 잘라 넣는다.
  moveDelay -= Math.min(3, Math.max(0, Math.floor(Number(input.studs) || 0))) * STUD_MS;

  const reactBudget = (flight - markerAt) * 1000;
  const slack = windowMs + reactBudget - moveDelay - Math.abs(input.errMs);
  // 상한을 두지 않는다. 늦으면 늦은 만큼 손이 짧아져야 그 늦음이 원인으로 잡힌다.
  const timing = clamp(slack / SCALE_MS, -1.2, 1.35);

  // 도달 반경. 높은 공은 수직으로, 낮은 공은 수평으로 판정한다.
  const horiz = HORIZ0 + K_DIVE * s("diving");
  const vert = 0.40 + 0.06 * LOCKED.aerial + 0.05 * LOCKED.jump + (keeper.height - 188) * 0.004;

  const closing = clamp(1 - forward * 0.30 * (1 + LOCKED.oneOnOne * 0.04), 0.35, 1);
  const quality = clamp(0.55 + 0.33 * timing, 0.05, 1.05) * input.dirQuality;

  let margin;
  if (shot.course === "상단") {
    margin = vert * quality - (shot.aimY - SHOULDER + bend * 0.6) * closing;
  } else {
    const gap = (Math.abs(shot.aimX) + lateral + bend) * closing;
    margin = horiz * quality - gap;
  }
  // 정면 슛의 일부는 서 있기만 해도 몸에 맞는다. 무거울수록 넓다.
  if (shot.course === "정면") margin += 0.10 + (keeper.weight - 84) * W_FRONT;
  return margin;
}

// 손끝이 모자랐을 때 어느 칸이 모자랐는지 되짚는다.
// 한 칸을 최선값으로 올려봤을 때 여유가 가장 많이 회복되는 칸이 그 실점의 원인이다.
// 원인을 코드에 박아두면 그 칸이 전 구간 1위를 독점한다. 앞 빌드가 거기서 죽었다.
function attributeContact(keeper, shot, input) {
  const base = contactMargin(keeper, shot, input, null);
  // 코스가 주인을 정한다. 위로 온 공을 수평 반경으로 되짚으면 그 칸이 모든 코스의 원인이 된다.
  const probes = shot.course === "상단"
    ? [["reflex", { reflex: keeper.reflex + 1 }],
       ["agility", { agility: keeper.agility + 1 }],
       ["offball", { offball: keeper.offball + 1 }],
       ["composure", { composure: keeper.composure + 1 }],
       ["resilience", { resilience: keeper.resilience + 1 }],
       ["kickerPower", { kickerPower: shot.kicker.power - 1 }],
       ["kickerCurve", { bendSub: 0.028 }]]
    : [["diving", { diving: keeper.diving + 1 }],
       ["reflex", { reflex: keeper.reflex + 1 }],
       ["agility", { agility: keeper.agility + 1 }],
       ["offball", { offball: keeper.offball + 1 }],
       ["composure", { composure: keeper.composure + 1 }],
       ["resilience", { resilience: keeper.resilience + 1 }],
       ["kickerPower", { kickerPower: shot.kicker.power - 1 }],
       ["kickerCurve", { bendSub: 0.028 }]];
  let best = probes[0][0];
  let bestGain = -Infinity;
  for (const [cause, over] of probes) {
    const gain = contactMargin(keeper, shot, input, over) - base;
    if (gain > bestGain) { bestGain = gain; best = cause; }
  }
  return best;
}

// 자동 입력. 판단력이 품질을 소유한다.
// 손가락이 만든 실패와 스탯이 만든 실패를 갈라놓는 것이 공정성의 전부이므로,
// 여기서 나온 실패는 손가락 셋으로 귀속하고 스탯 원장에 섞지 않는다.
export function autoInput(keeper, shot, rng) {
  const j = keeper.judgement;
  const readP = 34 + j * 6.5;
  const read = pct(rng, readP);
  const dive = read ? shot.side : [-1, 0, 1][Math.floor(rng() * 3)];
  const spread = 200 - j * 12;
  const errMs = (rng() * 2 - 1) * spread;
  // 나갈 것인가. 강제 각도에서는 나가지 않으면 못 막고, 칩에 나가면 골대가 빈다.
  const wantOut = shot.forced || pct(rng, 16 + j * 2);
  const advance = wantOut ? clamp(0.6 + rng() * 0.9, 0, 1.3 + 0.19 * LOCKED.sweeping) : 0;
  return { dive, errMs, advance, auto: true };
}

function dirQualityOf(dive, shot) {
  if (dive === shot.side) return 1.0;
  if (dive === 0 || shot.side === 0) return 0.5;
  return 0.1;
}

export function resolve(input) {
  const keeper = input.keeper;
  const shot = input.shot;
  const rng = input.rng;
  const raw = input.input || autoInput(keeper, shot, rng);
  // 축구화는 손가락이 만든 값이 아니라 신고 나온 값이다. 프로브 전체가 같은 값을 쓰므로
  // 원인 귀속에서 이 항은 상쇄되고, 장비가 실점 원인으로 잡히는 일은 없다.
  const inp = Object.assign({}, raw, { dirQuality: dirQualityOf(raw.dive, shot), studs: input.studs });

  const events = [];
  const state = { stage: 1, rolls: 0 };
  const say = (t, line, cause) => events.push({ t, line, cause: cause || null });
  const roll = (p) => { state.rolls++; return pct(rng, p); };
  // 한 단계는 롤 하나를 쓴다. 같은 단계의 두 사고는 같은 난수를 구간으로 나눠 가른다.
  const draw = () => { state.rolls++; return rng() * 100; };
  const done = (conceded, cause) => {
    // 연속 실점은 상태로 남는다. 다음 구의 판정 창을 회복탄력성이 방어한다.
    keeper.streak = conceded ? (keeper.streak || 0) + 1 : 0;
    events.push({ t: "result", line: conceded ? "실점" : "세이브", cause: cause || null });
    // 유명한 키커를 막으면 더 오르고, 유명한 키커에게 먹히면 덜 오른다. STATS 4절의 M 경로다.
    return { events, conceded, cause: conceded ? cause : null, stage: state.stage, rolls: state.rolls, fame: shot.kicker.fame };
  };

  const place = placement(keeper, shot);

  // 0단 배치. 나가서 생긴 사고와 안 와도 될 공에 누운 사고는 같은 판단에서 나온다.
  // 한 단계는 롤 하나를 쓴다. 두 사고는 같은 난수를 구간으로 나눠 가른다.
  const centerish = shot.course === "정면" || shot.chip;
  const overP = shot.chip ? Math.max(0, (clamp(keeper.offball, 1, 10) - 3) * 7 + shot.kicker.flair * 4 + (place.depth + inp.advance > 1.0 ? 30 : 0)) : 0;
  const diveP = centerish && inp.dive !== 0 ? Math.max(0, keeper.diving * 4.2 - keeper.judgement * 3.4) : 0;
  // 한눈팔기. 행인이 지나가는 구에서만 열리고 집중력이 소유한다.
  // 같은 단계의 사고는 롤 하나를 구간으로 나눠 가른다. 새 롤을 뒤면 한 구가 일곱 번 굴러간다.
  const gazeP = shot.gaze ? Math.max(0, (10 - keeper.focus) * 2.6) : 0;
  // 말 걸기. 의사소통이 여는 사고다. 눈으로 따라가는 것과 입을 여는 것은 다른 사건이다.
  // 팔로워를 버는 칸이 같은 자리에서 골을 먹인다. 이 칸이 양날인 이유가 그것이다.
  const talkP = shot.gaze ? Math.max(0, keeper.communication * keeper.mischief * 0.55) : 0;
  if (overP > 0 || diveP > 0 || gazeP > 0 || talkP > 0) {
    const d = draw();
    if (d < overP) {
      say("emptyGoal", "뛰쳐나온 사이 넘겨 찼습니다. 골대는 비어 있었습니다.", "greed");
      return done(true, "greed");
    }
    if (d < overP + diveP * (100 - overP) / 100) {
      say("dived", "안 날아와도 될 공에 먼저 몸을 던졌습니다.", "judgement");
      return done(true, "judgement");
    }
    const before = overP + diveP * (100 - overP) / 100;
    if (d < before + gazeP * (100 - before) / 100) {
      say("distracted", "지나가던 행인을 봤습니다. 눈에 하트가 떴습니다.", "focus");
      return done(true, "focus");
    }
    const beforeTalk = before + gazeP * (100 - before) / 100;
    if (d < beforeTalk + talkP * (100 - beforeTalk) / 100) {
      say("talked", "행인에게 말을 걸었습니다. 번호는 받았고 골은 먹혔습니다.", "communication");
      return done(true, "communication");
    }
  }

  state.rolls++;
  const margin = contactMargin(keeper, shot, inp, null);
  if (margin <= 0) {
    if (inp.dirQuality <= 0.1) {
      say("miss", "완전히 역동작이었습니다.", "direction");
      return done(true, "direction");
    }
    const cause = attributeContact(keeper, shot, inp);
    const lines = {
      diving: "손끝을 스치고 지나갔습니다.",
      reflex: "반응이 한 박자 늦었습니다.",
      agility: "몸이 늦게 출발했습니다.",
      offball: "서 있던 자리가 틀렸습니다.",
      composure: "슛이 강하니까 손이 먼저 나갔습니다.",
      resilience: "직전에 먹힌 게 아직 안 풀렸습니다.",
      kickerPower: "손 쓸 시간을 안 줬습니다.",
      kickerCurve: "끝에서 휘었습니다. 손은 딴 데 가 있었습니다."
    };
    say("miss", lines[cause], cause);
    return done(true, cause);
  }
  say("contact", "닿았습니다.", null);

  // 2단 손. 몸싸움에 밀려 같이 들어가는 것도, 장갑이 딸려 가는 것도, 흘리는 것도
  // 공이 손에 닿은 뒤 한 번에 갈린다. 이 단계 역시 롤 하나다.
  state.stage = 2;
  // 정면 강슛은 몸으로 받는다. 질량이 버티는 자리는 여기다. 옆으로 날아간 몸에는 버틸 질량이 없다.
  const brace = shot.course === "정면" ? (keeper.weight - 84) * W_BRACE : 0;
  const carryP = shot.strong ? Math.max(0, 40 - keeper.strength * 4.4 - brace) : 0;
  // 장갑 등급. 선반은 0에서 3까지이고 그 밖의 값은 저장이 오염된 것이므로 잘라 넣는다.
  const grip = Math.min(3, Math.max(0, Math.floor(Number(input.grip) || 0)));
  const gloveP = keeper.handling <= 4 ? Math.max(0, (5 - keeper.handling) * 7 - grip * GRIP_TEAR) : 0;
  const spillP = Math.max(0, 100 - (34 + keeper.handling * 6 + grip * GRIP_SPILL + LOCKED.punching * -4));
  const d2 = draw();
  if (d2 < carryP) {
    say("carriedIn", "막았는데 몸이 공과 같이 골라인을 넘었습니다.", "strength");
    return done(true, "strength");
  }
  if (d2 < carryP + gloveP) {
    say("gloveGone", "장갑이 공에 딸려 골망까지 들어갔습니다.", "handling");
    return done(true, "handling");
  }
  const taken = carryP + gloveP;
  if (d2 < taken + spillP * (100 - taken) / 100) {
    say("spill", "흘렸습니다. 공이 아직 살아 있습니다.", "handling");

    // 3단 리바운드. 착지에 실패했으면 두 번째 창이 아예 없다.
    state.stage = 3;
    const landing = Math.max(0, (10 - keeper.balance) * 14 + keeper.diving * 2);
    const downed = inp.dive !== 0 && roll(landing);
    // 무거우면 일어나는 데 시간이 더 든다.
    const reboundWindow = (18 + keeper.reflex * 4.5) * (1 - (keeper.weight - 84) * 0.006);
    if (downed) {
      say("downed", "쳐냈는데 못 일어납니다.", "balance");
      state.rolls++;
      if (pct(rng, 60 + shot.kicker.finishing * 4)) {
        say("rebound", "다시 찬 슛이 빈 골대로 들어갔습니다.", "balance");
        return done(true, "balance");
      }
      say("reboundMiss", "누운 채로 지켜봤는데 빗나갔습니다. 세이브입니다.", null);
      return done(false, null);
    }
    if (roll(24 + shot.kicker.finishing * 5 - reboundWindow * 0.5)) {
      say("rebound", "리바운드를 밀어 넣었습니다.", "kickerFinishing");
      return done(true, "kickerFinishing");
    }
    say("reboundMiss", "다시 찬 슛이 빗나갔습니다. 세이브입니다.", null);
    return done(false, null);
  }
  say("catch", "잡았습니다.", null);

  // 4단 악동. 돌진이 잠긴 v0.2에서는 시행이 구마다 하나로 고정이다.
  // 돌진은 분모만 늘리는 칸이므로, 잠긴 동안 분모를 다른 칸에서 빌려 오면 두 칸이 한 칸이 된다.
  state.stage = 4;
  if (!roll(keeper.mischief * 4.6 * (1 + LOCKED.charge * 0.2))) {
    say("save", "잡고 끝냈습니다. 세이브입니다.", null);
    return done(false, null);
  }
  say("charge", "잡자마자 드리블하러 뛰쳐나갑니다.", "mischief");

  if (roll(26 + LOCKED.dribbling * 5 + keeper.judgement * 2)) {
    say("beat", "제꼈습니다. 하프라인까지 몰고 갑니다.", null);
    return done(false, null);
  }
  say("lost", "뺏겼습니다. 골대가 비어 있습니다.", "mischief");

  // 4b 빈 골대 슛. 마지막 롤이 열려 있어야 반전이 성립한다.
  if (roll(20 + (10 - shot.kicker.composure) * 6)) {
    say("skied", "빈 골대인데 하늘로 넘겼습니다. 세이브입니다.", null);
    return done(false, null);
  }
  say("openGoalScored", "빈 골대에 굴려 넣었습니다.", "mischief");
  return done(true, "mischief");
}

// 성장. 매번 다른 셋이 뜬다. 다섯을 다 보여주면 최적해가 하나로 굳는다.
export function ballInHand(result) {
  return result.events.some((e) => e.t === "catch" || e.t === "save" || e.t === "beat");
}

// 재시작 템포. 판 수가 시간당 수익과 성장을 정하므로 이 식이 회전율을 소유한다.
// 공이 손에 있으면 스로잉이, 그물이나 필드에 있으면 골킥이 임자다.
export function restartDelay(keeper, result) {
  const rise = result.events.some((e) => e.t === "downed") ? (10 - clamp(keeper.balance, 1, 10)) * 0.25 : 0;
  // 먹힌 뒤 고개를 드는 시간. 회복탄력성이 짧게 만든다.
  const shake = result.conceded ? (10 - clamp(keeper.resilience, 1, 10)) * 0.22 : 0;
  if (ballInHand(result)) return Math.max(1.6, 4.0 - 0.20 * keeper.throwing - 0.06 * LOCKED.pass) + rise + shake;
  return Math.max(2.4, 6.5 - 0.26 * keeper.goalKick - 0.09 * LOCKED.firstTouch) + rise + shake;
}

// 판 사이 대기는 회복이다. 스태미너와 호흡력은 잠겨 있어 지금은 상수로 선다.
export function followerGain(keeper, result) {
  const saved = !result.conceded;
  const flair = result.events.some((e) => e.t === "beat" || e.t === "charge" || e.t === "talked");
  const base = saved ? 40 : 8;
  const talk = 6 * clamp(keeper.communication, 1, 10) + 3 * clamp(keeper.mischief, 1, 10);
  const fame = clamp(result.fame || 1, 1, 10) * (saved ? 9 : 2);
  return Math.round((base + talk + fame) * (flair ? 2.2 : 1));
}

export function setBreak() {
  return Math.max(3.0, 8.0 - 0.20 * LOCKED.stamina - 0.15 * LOCKED.breathing);
}

// 프로의식. 같은 판을 돌아도 더 오른다. 히든이므로 화면은 오른 숫자만 보여준다.
export function growthGain(keeper, rng) {
  return pct(rng, (keeper.professionalism || 5) * 3.4) ? 2 : 1;
}

export function growthOffer(rng, keeper) {
  const pool = GROWABLE.filter((k) => keeper[k] < 10);
  const out = [];
  while (out.length < 3 && pool.length) out.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
  return out;
}
