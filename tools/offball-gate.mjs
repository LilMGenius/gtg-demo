import { makeRng, buildSet, resolve, newKeeper, followerGain } from "../src/chain.mjs";
import { GROWABLE } from "../src/ledger.mjs";

// 성장 칸은 올리면 나아져야 한다. 훈련장에 서 있는 칸 중 하나가 올릴수록 손해라면
// 그것은 난이도가 아니라 함정이고, 플레이어는 그것을 알아낼 방법이 없다.
// 오프더볼은 좌우 커버를 주고 칩 취약을 대가로 낸다. 교환 자체는 설계지만,
// 그 교환의 합이 마이너스면 성장 칸으로서 실격이다. 이 게이트는 합을 잰다.

const SEEDS = 2000;
const fails = [], notes = [];
const check = (n, ok, d) => (ok ? notes : fails).push(n + " " + d);

const sweep = (stat, v) => {
  const k = Object.assign(newKeeper(), { [stat]: v });
  let saved = 0, shots = 0, empty = 0, fans = 0;
  const cause = {};
  for (let s = 0; s < SEEDS; s += 1) {
    const rng = makeRng(s + 90001);
    for (const shot of buildSet(makeRng(s + 1), 5, 0)) {
      const r = resolve({ keeper: k, shot, rng, input: { dive: shot.side, errMs: 0, advance: 0, auto: false } });
      shots += 1;
      if (!r.conceded) saved += 1;
      else cause[r.cause || "none"] = (cause[r.cause || "none"] || 0) + 1;
      if (r.events.some((e) => e.t === "emptyGoal")) empty += 1;
      // 세이브율을 내주고 화제를 사는 칸이 있다. 팬도 같이 재야 그 교환을 볼 수 있다.
      fans += followerGain(k, r, 0, 1, 1, 1);
    }
  }
  return { rate: Number((saved / shots * 100).toFixed(2)), empty, fans, cause };
};

const c1 = sweep("offball", 3), c2 = sweep("offball", 3);
check("control", c1.rate === c2.rate && c1.empty === c2.empty, c1.rate + " " + c1.empty);

const lo = sweep("offball", 1);
const hi = sweep("offball", 10);

// 이 칸이 실제로 무언가를 사 준다. 다이빙으로 잡히던 실점이 줄어야 좌우 커버가 값을 한 것이다.
check("offball:buys-lateral-cover", (hi.cause.diving || 0) < (lo.cause.diving || 0),
  "diving conceded " + (lo.cause.diving || 0) + " -> " + (hi.cause.diving || 0));

// 대가도 실재한다. 앞으로 나오면 넘겨 차이는 공이 늘어난다.
check("offball:costs-chips", hi.empty > lo.empty, "emptyGoal " + lo.empty + " -> " + hi.empty);

// 합. 훈련장에 선 칸을 열 칸까지 올린 사람이 안 올린 사람보다 나빠지면 안 된다.
check("offball:net-not-negative", hi.rate >= lo.rate,
  "save rate " + lo.rate + " -> " + hi.rate + " (cover saved " + ((lo.cause.diving || 0) - (hi.cause.diving || 0)) + ", chips cost " + (hi.empty - lo.empty) + ")");

// 나머지 성장 칸도 같은 규칙을 받는다. 다만 값을 하는 축이 세이브율 하나는 아니다.
// 악동과 의사소통은 수다를 열어 세이브율을 내주고 화제를 사는 칸이므로, 두 축을 같이 본다.
// 어느 축에서도 안 오르는 칸만 함정이다. 올리면 나빠지기만 하는 칸을 훈련장에 세울 수는 없다.
const trap = [];
for (const stat of GROWABLE) {
  const a = sweep(stat, 1), b = sweep(stat, 10);
  if (b.rate < a.rate && b.fans <= a.fans) trap.push(stat + " rate " + a.rate + "->" + b.rate + " fans " + a.fans + "->" + b.fans);
}
check("growable:every-stat-buys-something", trap.length === 0, trap.join(" | ") || "all fifteen pay in save rate or in reach");

const LINE = String.fromCharCode(10);
if (notes.length) console.log(notes.map((x) => "  ok   " + x).join(LINE));
if (fails.length) console.log(fails.map((x) => "  FAIL " + x).join(LINE));
console.log(fails.length ? "offball FAIL " + fails.length : "offball PASS");
if (fails.length) process.exitCode = 1;
