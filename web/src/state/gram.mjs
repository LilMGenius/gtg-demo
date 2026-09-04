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
  return { follows: {} };
}

// 한 사람의 키. 동네가 다르면 다른 사람이다. 이름은 라포와 같은 규칙으로 만든다.
export function whoKey(city, passer) {
  return (Number(city) || 0) + ':' + (Number(passer) || 0);
}

// 저장에서 읽는다. 아는 모양만 받는다. 0은 선팔, 1은 맞팔이다.
export function readSocial(raw) {
  const out = newSocial();
  const src = raw && raw.follows;
  if (!src || typeof src !== 'object') return out;
  for (const key of Object.keys(src)) {
    if (!/^\d+:\d+$/.test(key)) continue;
    out.follows[key] = src[key] === 1 ? 1 : 0;
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
