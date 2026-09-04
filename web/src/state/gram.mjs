// 아웃문그램의 사회. 글은 벽에 붙는 종이가 아니라 누가 보고 반응하는 자리다.
// 좋아요와 댓글은 그 구가 만들고, 팔로우는 사람이 건다. 셋 다 판정식 밖이고 팔로워 축에만 붙는다.

// 한 글에 붙는 좋아요. 화제가 클수록, 사람이 많은 동네일수록 많이 붙는다.
// 팔로워 증가분만 쓰면 초반 한 자리 수에서 0이 되어, 아무도 안 본 글이 계정을 채운다.
export const LIKE_BASE = 3;
export const LIKE_PER_FAN = 0.6;
export const LIKE_PER_CITY = 4;

// 회차마다 흔들려야 같은 성적의 두 글이 다른 글로 읽힌다. 0.7배에서 1.3배 사이다.
export function likesFor(gain, city, roll) {
  const mid = LIKE_BASE + Math.max(0, Number(gain) || 0) * LIKE_PER_FAN + Math.max(0, Number(city) || 0) * LIKE_PER_CITY;
  return Math.max(1, Math.round(mid * (0.7 + Math.min(1, Math.max(0, roll)) * 0.6)));
}

// 댓글은 얼굴을 튼 사람만 단다. 라포 단계가 그대로 댓글이 붙을 확률이다.
// 0단계가 0인 것이 이 시스템의 문이다. 스쳐 지나간 사람은 남의 계정에 글을 안 쓴다.
export const COMMENT_PCT = [0, 34, 58, 76];

export function commentOdds(tier) {
  const i = Math.min(COMMENT_PCT.length - 1, Math.max(0, Math.floor(Number(tier) || 0)));
  return COMMENT_PCT[i];
}

// 선팔에 대한 맞팔. 단계가 높을수록 잘 받아 준다. 0단계도 0이 아닌 이유는
// 모르는 사람의 선팔을 받아 주는 계정이 실제로 있기 때문이고, 그 낮은 확률이 반복의 이유가 된다.
export const BACK_PCT = [12, 40, 66, 88];

export function backOdds(tier) {
  const i = Math.min(BACK_PCT.length - 1, Math.max(0, Math.floor(Number(tier) || 0)));
  return BACK_PCT[i];
}

// 맞팔 한 명이 올리는 팔로워 배율. 동네 최고 등급 1.36을 안 넘게 상한을 둔다.
// 넘기면 실점을 감수하는 동네 선택이 계정 관리로 무력화된다.
export const MUTUAL_STEP = 0.03;
export const MUTUAL_CAP = 1.3;

export function newSocial() {
  return { follows: {}, dm: {} };
}

// 한 사람의 키. 동네가 다르면 다른 사람이다. 이름은 라포와 같은 규칙으로 만든다.
export function whoKey(city, passer) {
  return (Number(city) || 0) + ':' + (Number(passer) || 0);
}

// 저장에서 읽는다. 아는 모양만 받는다. 0은 선팔, 1은 맞팔이다.
export function readSocial(raw) {
  const out = newSocial();
  const src = raw && raw.follows;
  if (src && typeof src === 'object') {
    for (const key of Object.keys(src)) {
      if (!/^\d+:\d+$/.test(key)) continue;
      out.follows[key] = src[key] === 1 ? 1 : 0;
    }
  }
  // 쪽지 시각도 같이 읽는다. 답장한 시각이 사라지면 새 말이 늘 와 있는 상태가 된다.
  const dm = raw && raw.dm;
  if (dm && typeof dm === 'object') {
    out.dm = {};
    for (const key of Object.keys(dm)) {
      if (!(key in out.follows)) continue;
      const at = Number(dm[key] && dm[key].at);
      if (Number.isFinite(at) && at >= 0) out.dm[key] = { at: Math.floor(at) };
    }
  }
  return out;
}

export function isFollowing(social, key) {
  return social && social.follows && key in social.follows;
}

export function isMutual(social, key) {
  return Boolean(social && social.follows && social.follows[key] === 1);
}

// 선팔을 건다. 이미 건 사람에게 다시 걸 수는 없다. 맞팔 여부는 그 자리에서 한 번 굴린다.
// 굴림을 밖에서 받는 이유는 이 파일이 난수를 안 갖기 때문이다. 계기가 같은 수로 다시 돌린다.
export function follow(social, key, roll, tier) {
  const now = social && social.follows ? social : newSocial();
  if (key in now.follows) return now;
  const back = roll < backOdds(tier) ? 1 : 0;
  return { follows: Object.assign({}, now.follows, { [key]: back }) };
}

export function mutualCount(social) {
  const src = social && social.follows ? social.follows : {};
  return Object.keys(src).filter((k) => src[k] === 1).length;
}

// 맞팔이 팔로워 증가에 붙는 배율. 여기서 나온 수를 판정은 안 본다.
export function mutualBoost(social) {
  return Math.min(MUTUAL_CAP, 1 + MUTUAL_STEP * mutualCount(social));
}

// 행인이 찍은 사진. 그 구를 지켜본 사람만 찍는다. 얼굴을 튼 사이라야 남의 계정에 태그를 건다.
// 0단계가 0인 것은 댓글과 같은 이유다. 스쳐 지나간 사람은 남을 찍어 올리지 않는다.
// 얼굴을 튼 사람이 그 자리에 서서 보고 있었으면 대개 한 장 찍는다. 25/45/70으로 두었을 때는
// 열다섯 구를 돌아도 타임라인에 한 장이 남을까 말까였고, 그러면 계정은 다시 내 일기가 된다.
export const PHOTO_PCT = [0, 35, 60, 85];

export function photoOdds(tier) {
  const i = Math.min(PHOTO_PCT.length - 1, Math.max(0, Math.floor(Number(tier) || 0)));
  return PHOTO_PCT[i];
}

// 셀카. 눈이 맞은 사람과 한 장 찍어 내 계정에 올린다. 만남이 끝나는 자리에서만 열린다.
// 팔로워는 여기서만 한 번에 크게 오른다. 라포를 쌓아 만나러 간 값이 이 자리에서 회수된다.
export const SELFIE_BASE = 120;
export const SELFIE_PER_TIER = 90;
export const SELFIE_PER_CITY = 60;

export function selfieFans(tier, city) {
  const t = Math.min(3, Math.max(0, Math.floor(Number(tier) || 0)));
  const c = Math.min(3, Math.max(0, Math.floor(Number(city) || 0)));
  return SELFIE_BASE + SELFIE_PER_TIER * t + SELFIE_PER_CITY * c;
}

/* 쪽지. 맞팔이 된 사람과만 열린다. 선팔은 내가 건 것이고 맞팔은 상대도 걸어 준 것이라,
   대화가 시작되는 자리는 뒤엣것이다. 미연시를 따로 열 필요가 없는 이유가 여기 있다.
   만남이 한 번으로 끝나는 큰 도박이라면 쪽지는 여러 번 오가는 작은 굴림이다. */

// 답장한 뒤 이만큼 판이 지나야 새 말이 온다. 세 판은 한 세트를 조금 넘는 길이라
// 쪽지를 확인하러 계정을 여는 이유가 생기되 매 구마다 열 만큼 잦지는 않다.
export const DM_COOLDOWN = 3;
// 성공 팔로워. 만남 600의 15퍼센트다. 작게 두어야 만남이 여전히 그 관계의 종점이 된다.
export const DM_WIN_FANS = 90;

// 세 갈래. 만남과 같은 세 스탯이 민다. 다른 스탯을 쓰면 대화가 다른 게임이 된다.
export const DM_MOVES = [
  { id: "reply", label: "바로 답장한다", stat: "communication", base: 30, step: 5.2,
    win: "말이 계속 이어졌다", lose: "읽고 답이 없다" },
  { id: "clip", label: "오늘 영상 보낸다", stat: "mischief", base: 24, step: 5.6,
    win: "이거 진짜냐고 세 번 물었다", lose: "이미 봤다고 했다" },
  { id: "wait", label: "한 박자 두고 답한다", stat: "composure", base: 34, step: 4.4,
    win: "먼저 다음 약속을 물어 왔다", lose: "그새 다른 얘기로 넘어갔다" }
];

export function dmMoveAt(id) {
  return DM_MOVES.find((m) => m.id === id) || null;
}

// 성공 확률. 만남과 같은 모양이고 상한도 같다. 확실한 성공은 대화를 버튼 하나로 만든다.
export function dmOdds(keeper, moveId) {
  const m = dmMoveAt(moveId);
  if (!m || !keeper) return 0;
  const v = Math.max(1, Math.min(10, Number(keeper[m.stat]) || 1));
  return Math.max(5, Math.min(92, Math.round(m.base + m.step * v)));
}

// 굴림은 화면 쪽 난수로 받는다. 판정용 rng를 쓰면 그 뒤 모든 구가 밀린다.
export function dmOutcome(keeper, moveId, roll) {
  const m = dmMoveAt(moveId);
  if (!m) return null;
  const odds = dmOdds(keeper, moveId);
  const won = Number(roll) < odds;
  return { won, odds, line: won ? m.win : m.lose, fans: won ? DM_WIN_FANS : 0 };
}

// 시계는 지금까지 굴린 판 수다. 실시간을 쓰면 탭을 열어 둔 채 기다리는 것이 공략이 된다.
export function dmClock(record) {
  const src = record && typeof record === "object" ? record : {};
  let n = 0;
  for (const name of Object.keys(src)) {
    const row = src[name];
    if (!row) continue;
    n += (Number(row.saved) || 0) + (Number(row.conceded) || 0);
  }
  return n;
}

// 지금 새 말이 와 있는가. 맞팔이 아니면 대화 자체가 없다.
export function dmReady(social, key, clock) {
  if (!isMutual(social, key)) return false;
  const row = social && social.dm ? social.dm[key] : null;
  if (!row) return true;
  return (Number(clock) || 0) - (Number(row.at) || 0) >= DM_COOLDOWN;
}

// 답장을 보냈다. 다음 말이 오는 시각은 이 판 수에서 센다.
export function applyDm(social, key, clock) {
  const now = social && social.follows ? social : newSocial();
  const dm = Object.assign({}, now.dm || {});
  dm[key] = { at: Number(clock) || 0 };
  return { follows: Object.assign({}, now.follows), dm };
}

// 지금 답장을 기다리는 사람들. 화면은 이 목록만 그린다.
export function dmWaiting(social, clock) {
  const src = social && social.follows ? social.follows : {};
  return Object.keys(src).filter((k) => dmReady(social, k, clock));
}
