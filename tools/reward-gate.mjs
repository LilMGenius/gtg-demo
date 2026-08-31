import { COIN_SAVE, COIN_CONCEDED, COIN_FAME_STEP, coinGain } from "../web/src/state/wallet.mjs";

// 보상 게이트. 어려운 키커일수록 보상이 큰가.
// 모든 축의 출처는 파운더 선언이다. "어려운 키커일수록 막기는 어렵지만 그만큼 보상은 크게".
// 유추로 세운 축은 여기에 없다. 브라우저를 띄우지 않고 단가 함수만 직접 부른다.
const fails = [], notes = [];
const check = (n, ok, d) => (ok ? notes : fails).push(n + " " + d);

// 로스터 fame은 1에서 10이다. 무명 세이브가 기준 단위이고, 여기가 흔들리면 나머지 축이 전부 상대값이다.
check("save:unknown-kicker-is-the-baseline", coinGain(false, 1) === COIN_SAVE, String(coinGain(false, 1)));
// 최상급은 기준의 두 배 반이다. 세 배를 넘기면 무명 구간을 건너뛰는 것이 최적이 된다.
const top = coinGain(false, 10);
check("save:top-fame-is-the-declared-ceiling", top === COIN_SAVE + COIN_FAME_STEP * 9, String(top));
check("save:ceiling-stays-under-three-times-baseline", top < COIN_SAVE * 3, top + " vs " + COIN_SAVE * 3);

// 한 계단도 내려가지 않는다. 한 곳이라도 꺾이면 그 키커를 피하는 것이 이득이 된다.
let mono = true, prev = -1;
for (let f = 1; f <= 10; f++) { const g = coinGain(false, f); if (g < prev) mono = false; prev = g; }
check("save:gain-never-drops-as-fame-rises", mono, "f1=" + coinGain(false, 1) + " f10=" + top);

// 실점에는 난이도가 붙지 않는다. 붙이면 유명한 키커에게 일부러 먹히는 것이 최적이 된다.
let flat = true;
for (let f = 1; f <= 10; f++) if (coinGain(true, f) !== COIN_CONCEDED) flat = false;
check("conceded:difficulty-never-raises-the-loss-payout", flat, String(COIN_CONCEDED));

// 대조군. 어떤 fame에서도 먹히는 쪽이 막는 쪽보다 이득이 되는 지점이 없다.
check("control:conceded-max-stays-below-save-min", COIN_CONCEDED < coinGain(false, 1), COIN_CONCEDED + " vs " + coinGain(false, 1));

// 범위 밖 입력은 잘린다. 잘리지 않으면 로스터에 fame 0이나 99가 들어온 날 단가가 음수나 발산이 된다.
const lo = coinGain(false, -5), hi = coinGain(false, 99), nan = coinGain(false, NaN);
check("clamp:out-of-range-fame-lands-inside-the-declared-band", lo === COIN_SAVE && hi === top && nan === COIN_SAVE, [lo, hi, nan].join(","));

console.log(notes.map((s) => "  ok   " + s).join("\n"));
if (fails.length) console.log(fails.map((s) => "  FAIL " + s).join("\n"));
console.log(fails.length ? "reward FAIL " + fails.length : "reward PASS");
if (fails.length) process.exitCode = 1;
