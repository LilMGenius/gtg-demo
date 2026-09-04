import { makeRng, buildSet, resolve, keeperAtLevel, newKeeper } from "../src/chain.mjs";

// 성장 곡선을 감시한다. 판정 상수 하나가 움직이면 세이브율 전체가 따라 움직이는데,
// 지금까지는 그 이동을 아무도 보지 않았다. 어느 랩이 밸런스를 바꿨는지 나중에 알 수 없었다.
// 목표 대비 판정은 여기 없다. 목표는 아직 파운더가 확정하지 않았고,
// 확정되지 않은 수를 문턱으로 세우면 그 문턱이 매일 협상 대상이 된다. 간극은 매번 인쇄만 한다.

const SEEDS = 2000;

// 실측으로 박은 기준선. 판정이나 로스터를 건드리면 여기가 먼저 빨개진다.
// 그때 할 일은 이 수를 고치는 것이 아니라, 그 이동이 의도였는지 먼저 답하는 것이다.
const BASE = { new: 19.97, 1: 19.47, 3: 22.83, 5: 25.16, 7: 27.44, 10: 30.55, 15: 35.01, 20: 38.49, 30: 44.00 };

// 시드가 고정이라 결과는 결정적이다. 0.3은 부동소수 반올림만 흡수하는 폭이고,
// 스탯 한 칸이나 계수 하나가 움직이면 그보다 훨씬 크게 벌어진다.
const TOL = 0.3;

// 성장이 화면에서 의미를 가지려면 처음과 나중이 충분히 갈려야 한다.
// 24.5가 실측이므로 20은 그 아래에서 회귀만 잡는 자리다.
const MIN_RANGE = 20;

const fails = [], notes = [];
const check = (n, ok, d) => (ok ? notes : fails).push(n + " " + d);

const at = (lv) => {
  let saved = 0, shots = 0;
  for (let s = 0; s < SEEDS; s += 1) {
    const rng = makeRng(s + 90001);
    // 레벨 표본은 성장 씨앗을 따로 쓴다. 판정 rng와 같은 씨앗을 쓰면 키퍼와 슛이 상관을 갖는다.
    const k = lv === null ? newKeeper() : keeperAtLevel(lv, makeRng(s + 7));
    for (const shot of buildSet(makeRng(s + 1), 5, 0)) {
      const r = resolve({ keeper: k, shot, rng, input: { dive: shot.side, errMs: 0, advance: 0, auto: false } });
      /* 키커가 골문 밖으로 찬 구는 키퍼의 성적이 아니다. 그런 구를 분모에 넣으면 못 차는 키커를
         만난 것이 키퍼의 성장으로 읽히고, 이 곡선이 재는 것이 실력에서 상대 수준으로 바뀐다.
         축의 문장은 그대로다. 세이브율은 언제나 시험받은 구 중 막아 낸 비율이었고,
         시험받지 않는 구가 없던 동안에는 전체 구와 같은 수였을 뿐이다. */
      if (r.untested) continue;
      shots += 1;
      if (!r.conceded) saved += 1;
    }
  }
  return Number((saved / shots * 100).toFixed(2));
};

const LEVELS = [1, 3, 5, 7, 10, 15, 20, 30];
const now = { new: at(null) };
for (const lv of LEVELS) now[lv] = at(lv);

for (const key of Object.keys(BASE)) {
  const drift = Math.abs(now[key] - BASE[key]);
  check("curve:" + key, drift <= TOL, now[key] + " vs " + BASE[key] + " drift " + drift.toFixed(2));
}

// 레벨이 오르면 세이브율도 오른다. 안 오르면 성장에 값을 치를 이유가 없다.
const seq = LEVELS.map((lv) => now[lv]);
const rises = seq.every((v, i) => i === 0 || v > seq[i - 1]);
check("curve:monotone", rises, seq.join(" -> "));

const range = now[30] - now[1];
check("growth:range", range >= MIN_RANGE, range.toFixed(2) + " over " + MIN_RANGE);

const LINE = String.fromCharCode(10);
if (notes.length) console.log(notes.map((x) => "  ok   " + x).join(LINE));
if (fails.length) console.log(fails.map((x) => "  FAIL " + x).join(LINE));
// 목표는 아직 문턱이 아니다. 매번 눈에 보이게 두어야 잊히지 않는다.
console.log("  note  early " + now[1] + " and late " + now[30] + " against an unconfirmed target of 60 and 85");
console.log(fails.length ? "balance FAIL " + fails.length : "balance PASS");
if (fails.length) process.exitCode = 1;
