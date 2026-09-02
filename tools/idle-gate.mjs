import { makeRng, buildSet, resolve, newKeeper, keeperAtLevel } from "../src/chain.mjs";

// 방치형에서 방치가 벌이면 안 된다. 자동은 손가락만 대신하고 훈련은 안 대신하므로,
// 켜 두고 자리를 비우면 레벨이 오르고 키커가 세지는데 스탯은 그대로 남는다.
// 그 상태가 실제로 어떻게 되는지는 스탯을 고정하고 레벨만 올려야 보인다.

const SEEDS = 2000;
const fails = [], notes = [];
const check = (n, ok, d) => (ok ? notes : fails).push(n + " " + d);
const F = (x) => Number(x).toFixed(2);

// grow가 거짓이면 훈련을 한 번도 안 쓴 사람이다. 레벨만 오르고 칸은 3에 머문다.
const at = (lv, grow) => {
  let saved = 0, shots = 0;
  for (let s = 0; s < SEEDS; s += 1) {
    const rng = makeRng(s + 90001);
    const k = grow ? keeperAtLevel(lv, makeRng(s + 7)) : Object.assign(newKeeper(), { level: lv });
    for (const shot of buildSet(makeRng(s + 1), lv, 0)) {
      const r = resolve({ keeper: k, shot, rng, input: { dive: shot.side, errMs: 0, advance: 0, auto: false } });
      shots += 1;
      if (!r.conceded) saved += 1;
    }
  }
  return Number((saved / shots * 100).toFixed(2));
};

// 키커 강화는 레벨 13에서 상한에 닿는다. 그 너머는 난이도가 더 안 오르므로 13이 바닥이다.
const LEVELS = [1, 3, 5, 8, 13];
const idle = LEVELS.map((lv) => at(lv, false));
const trained = LEVELS.map((lv) => at(lv, true));

check("control", at(1, false) === idle[0], F(idle[0]));

// 훈련을 쓰면 오른다. 이쪽이 무너지면 성장 자체가 값을 안 하는 것이다.
check("trained:rises", trained[trained.length - 1] > trained[0],
  trained.map(F).join(" -> "));

// 훈련을 안 쓰고 켜 두기만 해도 나빠지지는 않아야 한다. 방치형에서 시간은 벌이 아니다.
check("idle:does-not-decay", idle[idle.length - 1] >= idle[0],
  idle.map(F).join(" -> ") + " (drop " + F(idle[0] - idle[idle.length - 1]) + ")");

// 훈련한 쪽이 안 한 쪽보다 나아야 한다. 이건 성립해야 훈련이 선택지가 된다.
check("trained:beats-idle", trained[trained.length - 1] > idle[idle.length - 1],
  F(trained[trained.length - 1]) + " vs " + F(idle[idle.length - 1]));

const LINE = String.fromCharCode(10);
if (notes.length) console.log(notes.map((x) => "  ok   " + x).join(LINE));
if (fails.length) console.log(fails.map((x) => "  FAIL " + x).join(LINE));
console.log(fails.length ? "idle FAIL " + fails.length : "idle PASS");
if (fails.length) process.exitCode = 1;
