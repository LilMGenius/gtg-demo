// 킥 예고 자막. 한 문장뿐이면 예고가 배경음이 되고, 반전 직전의 긴장이 쌓이지 않는다.
// 키커의 성질이 예고에서 먼저 새어 나와야 플레이어가 무엇을 조심할지 미리 안다.

const BUCKETS = [
  // 악동은 flair로 갈린다. 판정에서 페이크를 굴리는 값이 그 값이라 예고와 결과가 같은 축을 본다.
  { key: 'flair', test: (k) => k.flair >= 9, lines: [
    (n) => n + ', 발장난부터 시작한다',
    (n) => n + ' 웃는다. 뭘 하려는 거다',
    (n) => n + ', 헛다리 세 번은 예약이다',
    (n) => n + ' 정직하게 찰 리가 없다'
  ] },
  // 침착성 하위는 자기가 먼저 무너진다. 실점보다 자책이 앞서는 구다.
  { key: 'shaky', test: (k) => k.composure <= 4, lines: [
    (n) => n + ', 벌써 손이 떨린다',
    (n) => n + ' 자기 발끝만 본다',
    (n) => n + ', 잔디부터 정리한다',
    (n) => n + ' 눈이 자꾸 골대 밖으로 간다'
  ] },
  // 파워는 막아도 아픈 구다. 예고에서 몸을 사릴 신호를 준다.
  { key: 'power', test: (k) => k.power >= 9, lines: [
    (n) => n + ', 열 걸음 물러난다',
    (n) => n + ' 발등에 힘 잔뜩 실렸다',
    (n) => n + ', 골대가 먼저 긴장한다',
    (n) => n + ' 이건 손목 나간다'
  ] },
  // 유명세는 팔로워 정산에 곱으로 들어간다. 예고가 판돈을 먼저 알린다.
  { key: 'fame', test: (k) => k.fame >= 9, lines: [
    (n) => n + ', 관중석이 통째로 일어난다',
    (n) => n + ' 등장. 카메라가 다 저쪽으로 돈다',
    (n) => n + ', 이름값 하러 나왔다',
    (n) => n + ' 한 방이면 내 팔로워가 정리된다'
  ] },
  { key: 'plain', test: () => true, lines: [
    (n) => n + ', 공 놓고 뒤로 물러난다',
    (n) => n + ' 조용히 각을 잰다',
    (n) => n + ', 숨 한 번 고른다',
    (n) => n + ' 그냥 세게 찰 생각이다'
  ] }
];

export function bucketOf(kicker) {
  return BUCKETS.find((b) => b.test(kicker));
}

export const CALLOUT_POOL = BUCKETS.reduce((n, b) => n + b.lines.length, 0);

// last를 받아 같은 문장을 연달아 내지 않는다. 한 칸만 기억하면 되는 이유는
// 사람이 지루함을 느끼는 단위가 직전 한 구이기 때문이다.
export function aimLine(kicker, rng, last) {
  const b = bucketOf(kicker);
  const pool = b.lines.map((f) => f(kicker.name));
  const fresh = pool.filter((s) => s !== last);
  const pick = fresh.length ? fresh : pool;
  return pick[Math.floor(rng() * pick.length) % pick.length];
}
