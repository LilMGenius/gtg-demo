import { makeRng, buildSet, resolve, keeperAtLevel, autoInput, rollForm } from "../src/chain.mjs";
import { POOLS, KEYLESS, lineKey, eventLine, LINE_POOL } from "../web/src/ui/lines.mjs";

// 결과 자막 게이트. 사건마다 문장이 하나뿐이라 방치형에서 로그처럼 읽히던 것을 고친 뒤,
// 그 수리가 실제 판정이 뱉는 사건 전부에 닿는지를 시뮬레이션으로 다시 잰다.
// 예고 자막과 달리 여기 존댓말 중계체는 의도다. 그래서 callout-gate의 어미 검사는 옮기지 않는다.

const say = (ok, name, v) => console.log("  " + (ok ? "ok  " : "FAIL") + " " + name + " " + v);
let ok = true;
const check = (c, name, v) => { if (!c) ok = false; say(c, name, v); };

// 사건당 세 줄 아래로 내려가면 두 번째 조우에서 이미 본 문장이 돌아온다.
let thin = [];
for (const k of Object.keys(POOLS)) if (POOLS[k].length < 3) thin.push(k + "(" + POOLS[k].length + ")");
check(thin.length === 0, "pool:three-lines-per-event", thin.length ? thin.join(",") : LINE_POOL);

// 도달성. 판정이 실제로 뱉는 키를 모아, 그 전부가 풀을 갖는지 본다.
// 폴백이 실전에서 쓰이면 그 사건은 여전히 한 문장짜리다.
const seen = new Map();
let repeat = 0;
const distinct = new Set();
// 자막 추첨이 판정과 같은 난수열을 쓰면 게이트가 재려는 대상을 게이트가 흔든다.
// 실측: 같은 씨앗에서 miss 원인 분포가 통째로 달라졌다. 추첨은 별도 난수열로 뺀다.
const lineRng = makeRng(0x5eed);
// 표본 세 겹. 원인 귀속이 strict 최대값이고 반응속도 13ms가 민첩성 12ms보다 크므로,
// 민첩성은 다른 후보가 상한에 닿아 이득이 0이 된 뒤에만 원인이 된다. 무작위 성장만
// 돌리면 900판에 1회라 네 줄짜리 풀이 다 안 나온다. 둘째 겹은 반응속도만, 셋째 겹은
// 민첩성을 뺀 나머지를 전부 상한에 붙인 키퍼다. 둘 다 성장으로 도달하는 상태다.
const CAPPED = ["diving", "reflex", "offball", "composure", "resilience"];
for (const mode of [0, 1, 2]) {
  for (let s = 1; s <= 900; s++) {
    const rng = makeRng(s >>> 0);
    const keeper = keeperAtLevel(1 + (s % 40), rng);
    if (mode === 1 && keeper.agility < 10) keeper.reflex = 10;
    if (mode === 2) { for (const k of CAPPED) keeper[k] = 10; keeper.agility = Math.min(keeper.agility, 5); }
    rollForm(keeper, rng);
    const shots = buildSet(rng, keeper.level);
    for (const shot of shots) {
      const input = autoInput(keeper, shot, rng);
      const result = resolve({ keeper, shot, rng, input });
      let last = null;
      const ctx = { downed: false };
      for (const e of result.events) {
        const key = lineKey(e, ctx);
        seen.set(key, (seen.get(key) || 0) + 1);
        const line = eventLine(e, lineRng, last, ctx);
        if (last !== null && line === last) repeat++;
        if (POOLS[key]) distinct.add(key + "|" + line);
        last = line;
        if (e.t === "downed") ctx.downed = true;
      }
    }
  }
}

const missing = [...seen.keys()].filter((k) => !POOLS[k] && !KEYLESS.includes(k));
check(missing.length === 0, "reach:every-emitted-event-has-a-pool", missing.length ? missing.join(",") : seen.size);

// 반대 방향. 풀만 있고 판정이 그 키를 안 뱉으면 죽은 문장이다.
const dead = Object.keys(POOLS).filter((k) => !seen.has(k));
check(dead.length === 0, "reach:no-pool-is-unreachable", dead.length ? dead.join(",") : Object.keys(POOLS).length);

check(repeat === 0, "line:never-repeats-back-to-back", repeat);
// 못 나온 줄을 세기만 하면 어느 줄이 죽었는지 다시 찾아야 한다. 이름을 같이 뱉는다.
const unseen = [];
for (const k of Object.keys(POOLS)) for (const l of POOLS[k]) if (!distinct.has(k + "|" + l)) unseen.push(k + ":" + l.slice(0, 14));
check(unseen.length === 0, "line:whole-pool-is-reachable", unseen.length ? distinct.size + "/" + LINE_POOL + " " + unseen.join(" | ") : distinct.size + "/" + LINE_POOL);

// 대조군. 직전 문장을 금지하지 않으면 반복이 실제로 나오는지 확인한다.
// 안 나오면 위 검사가 통과한 이유가 금지 때문이 아니라 표본 탓이다.
const rng2 = makeRng(9);
let naive = 0;
for (let i = 0; i < 4000; i++) {
  const e = { t: "spill", cause: "handling", line: "x" };
  const a = eventLine(e, rng2, null, null);
  const b = eventLine(e, rng2, null, null);
  if (a === b) naive++;
}
check(naive > 0, "control:unguarded-draw-does-repeat", naive);

console.log("lines " + (ok ? "PASS " + LINE_POOL : "FAIL"));
process.exit(ok ? 0 : 1);
