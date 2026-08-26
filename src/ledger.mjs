// v0.2 원장. 실점 원인은 전부 이 안에 있다.
// 열한 칸은 PLAN.md 3절 개방표가 소유하고, 손가락 셋은 PLAN.md 2절이 소유한다.

export const STAT_CAUSES = [
  "diving", "handling", "reflex", "offball", "judgement",
  "agility", "balance", "strength", "mischief", "focus", "composure",
  "kickerFinishing", "kickerPower", "kickerCurve"
];

export const INPUT_CAUSES = ["direction", "timing", "greed"];

export const LEDGER = STAT_CAUSES.concat(INPUT_CAUSES);

// 화면에 뜨는 이름. 자막이 부르는 스탯 이름과 로그가 돌려주는 원인이 같아야 한다.
export const CAUSE_LABEL = {
  diving: "다이빙",
  handling: "핸들링",
  reflex: "반응속도",
  offball: "오프더볼",
  judgement: "판단력",
  agility: "민첩성",
  balance: "밸런스",
  strength: "맷집",
  mischief: "악동",
  focus: "집중력",
  composure: "침착성",
  kickerFinishing: "키커 골결정력",
  kickerPower: "키커 슛파워",
  kickerCurve: "키커 슛커브",
  direction: "방향",
  timing: "타이밍",
  greed: "욕심"
};

// 성장하는 칸. 체격 둘은 여기 없다. 올릴 수 없으므로 스탯이 아니다.
export const GROWABLE = [
  "diving", "handling", "reflex", "offball",
  "judgement", "agility", "balance", "strength", "mischief", "focus", "composure"
];

// v0.5부터 열리는 칸. 잠긴 동안 판정식에서 이 값이 상수로 선다.
// 0으로 두면 그 항이 사라지고, 사라진 항은 나중에 붙을 때 그 전 분포를 무효로 만든다.
export const LOCKED = {
  aerial: 4,      // 공중볼. 상단 코너와 코너킥에서 열린다
  jump: 4,        // 점프
  sweeping: 4,    // 수비범위
  pace: 4,        // 스피드
  oneOnOne: 4,    // 일대일마크
  punching: 0,    // 펀칭. 코너킥에서 열린다
  charge: 0,      // 돌진. 페널티에는 뛰쳐나갈 자리가 없다
  dribbling: 4,   // 드리블
  flair: 4        // 개인기
};

// 체격. 스탯이 아니라 그 선수가 태어난 모양이다.
export const PHYSIQUE = {
  heightMean: 188, heightMin: 165, heightMax: 205,
  weightMean: 84, weightMin: 58, weightMax: 105
};
