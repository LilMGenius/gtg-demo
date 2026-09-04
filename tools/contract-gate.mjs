import { resolve, makeRng, buildSet, keeperAtLevel, rollForm } from "../src/chain.mjs";
import { LEDGER } from "../src/ledger.mjs";

// 판정 계약의 자. 체인이 무엇을 돌려주기로 약속했는지를 재는 것이지, 그 수가 좋은지를 재지 않는다.
// 약속은 넷이다. 단계 넷을 지나고, 한 구가 롤 여섯을 넘지 않고, 결과와 원인을 같이 돌려주고,
// 같은 시드가 같은 답을 낸다.
//
// 계약이 깨지면 위층 전부가 조용히 틀린다. 원인 원장은 원인이 있다는 것을 전제로 세워졌고
// 자막과 아웃문그램과 전적은 결과를 전제로 세워졌다.
// 표본 범위: 레벨 3부터 10까지 네 구간을 돈다. 계약은 능력치가 아니라 구조라 구간마다 같아야 한다.
const LEVELS = [3, 5, 7, 10];
const PER = 4000;
// 단계는 1부터 4까지 넷이다. 배치와 접촉과 리바운드와 빈 골대이고, 체인이 그 순서로 내려간다.
// 한 단계는 롤 하나를 쓰고 같은 단계의 두 사고는 그 하나를 나눠 갖는다.
// 리바운드 단계만 굴림이 늘어나 상한이 여섯이 된다.
const STAGES = [1, 2, 3, 4];
const ROLL_CAP = 6;
const LINE = String.fromCharCode(10);

const fails = [], notes = [];
const check = (n, ok, d) => (ok ? notes : fails).push(n + " " + d);

const seenStage = new Set();
let balls = 0, worstRolls = 0, sixes = 0;
const badShape = [], badCause = [], badRolls = [];

for (const level of LEVELS) {
  let seed = level * 7919 + 13;
  let n = 0;
  while (n < PER) {
    seed += 1;
    const rng = makeRng(seed);
    const keeper = keeperAtLevel(level, rng);
    rollForm(keeper, rng);
    for (const shot of buildSet(rng, level)) {
      if (n >= PER) break;
      const r = resolve({ keeper, shot, rng });
      n += 1;
      balls += 1;
      // 반환 모양. 하나라도 빠지면 위층이 undefined를 화면에 그린다.
      if (!Array.isArray(r.events) || typeof r.conceded !== "boolean"
        || !Number.isFinite(r.stage) || !Number.isFinite(r.rolls) || !Number.isFinite(r.fame)) {
        if (badShape.length < 3) badShape.push(JSON.stringify({ ev: Array.isArray(r.events), c: typeof r.conceded, s: r.stage, ro: r.rolls, f: r.fame }));
        continue;
      }
      seenStage.add(r.stage);
      worstRolls = Math.max(worstRolls, r.rolls);
      if (r.rolls === ROLL_CAP) sixes += 1;
      if (r.rolls > ROLL_CAP && badRolls.length < 3) badRolls.push(r.rolls + " rolls at level " + level);
      // 결과와 원인은 짝이다. 먹혔으면 원장 안의 원인이 있고, 막았으면 원인이 없다.
      const okCause = r.conceded ? (typeof r.cause === "string" && LEDGER.includes(r.cause)) : r.cause === null;
      if (!okCause && badCause.length < 3) badCause.push((r.conceded ? "conceded " : "saved ") + String(r.cause));
      // 마지막 줄은 언제나 결과다. 화면은 그 줄로 판을 닫는다.
      const last = r.events[r.events.length - 1];
      if (!last || last.t !== "result") badShape.push("last event " + (last && last.t));
    }
  }
}

check("instrument:the-sample-actually-ran", balls === PER * LEVELS.length, balls + " balls");
check("contract:every-round-returns-the-whole-shape", badShape.length === 0, badShape.join(" | ") || "events, conceded, cause, stage, rolls, fame");
check("contract:a-conceded-round-names-a-cause-in-the-ledger", badCause.length === 0, badCause.join(" | ") || "all pairs hold");
check("contract:no-round-spends-more-than-six-rolls", badRolls.length === 0 && worstRolls <= ROLL_CAP,
  "worst " + worstRolls + ", six-roll rounds " + sixes);
check("contract:all-four-stages-are-reachable", STAGES.every((s) => seenStage.has(s)),
  [...seenStage].sort().join(","));
// 롤 상한이 실제로 닿는가. 안 닿으면 여섯은 상한이 아니라 아무도 안 쓰는 수다.
check("instrument:the-deepest-chain-was-reached", sixes > 0, sixes + " rounds spent six rolls");

// 같은 시드는 같은 답이다. 이것이 깨지면 위의 초록은 그날의 난수를 잰 것이다.
const twice = (seed) => {
  const out = [];
  for (let i = 0; i < 2; i += 1) {
    const rng = makeRng(seed);
    const keeper = keeperAtLevel(7, rng);
    rollForm(keeper, rng);
    const rows = [];
    for (const shot of buildSet(rng, 7)) {
      const r = resolve({ keeper, shot, rng });
      rows.push(r.conceded + ":" + r.cause + ":" + r.stage + ":" + r.rolls);
    }
    out.push(rows.join("|"));
  }
  return out;
};
const [a1, a2] = twice(4242);
check("contract:the-same-seed-answers-the-same", a1 === a2, a1 === a2 ? a1.split("|").length + " balls identical" : "drift");
// 대조군. 다른 시드는 달라야 한다. 같으면 시드가 아무 일도 안 하고 있다.
const [b1] = twice(4243);
check("control:a-different-seed-answers-differently", b1 !== a1, b1 === a1 ? "identical" : "differs");

if (notes.length) console.log(notes.map((x) => "  ok   " + x).join(LINE));
if (fails.length) console.log(fails.map((x) => "  FAIL " + x).join(LINE));
console.log(fails.length ? "contract FAIL " + fails.length : "contract PASS " + notes.length);
if (fails.length) process.exitCode = 1;
