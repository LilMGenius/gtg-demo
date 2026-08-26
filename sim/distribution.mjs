// C2 귀속과 C3 비독점을 같이 잰다.
// C2: 모든 실점 원인이 v0.2 원장 안에 있는가.
// C3: 레벨 3, 5, 7, 10 네 구간에서 한 원인이 전 구간 1위를 독점하지 않는가.

import { resolve, makeRng, buildSet, keeperAtLevel, rollForm } from "../src/chain.mjs";
import { LEDGER, CAUSE_LABEL } from "../src/ledger.mjs";

const args = process.argv.slice(2);
function arg(name, fallback) {
  const i = args.indexOf("--" + name);
  return i === -1 ? fallback : Number(args[i + 1]);
}

const TOTAL = arg("balls", 20000);
const LEVELS = [3, 5, 7, 10];
const perLevel = Math.floor(TOTAL / LEVELS.length);

const table = new Map();
const orphans = [];
let conceded = 0;
let balls = 0;

for (const level of LEVELS) {
  const counts = new Map();
  let levelConceded = 0;
  let levelBalls = 0;
  let seed = level * 1000003 + 7 + arg("seed", 0);
  while (levelBalls < perLevel) {
    seed += 1;
    const rng = makeRng(seed);
    const keeper = keeperAtLevel(level, rng);
    rollForm(keeper, rng);
    for (const shot of buildSet(rng, level)) {
      if (levelBalls >= perLevel) break;
      const r = resolve({ keeper, shot, rng });
      levelBalls++;
      balls++;
      if (!r.conceded) continue;
      levelConceded++;
      conceded++;
      if (!LEDGER.includes(r.cause)) orphans.push(r.cause);
      counts.set(r.cause, (counts.get(r.cause) || 0) + 1);
    }
  }
  table.set(level, { counts, levelConceded, levelBalls });
}

const seen = [...new Set([...table.values()].flatMap((v) => [...v.counts.keys()]))];
seen.sort();

const pad = (s, n) => String(s).padEnd(n, " ");
const padL = (s, n) => String(s).padStart(n, " ");

console.log("구 " + balls + "  실점 " + conceded + "  실점률 " + (conceded / balls * 100).toFixed(1) + "%");
console.log("");
console.log(pad("실점률", 16) + LEVELS.map((l) => { const v = table.get(l); return padL((v.levelConceded / v.levelBalls * 100).toFixed(1) + "%", 9); }).join(""));
console.log("");
console.log(pad("원인", 16) + LEVELS.map((l) => padL("Lv" + l, 9)).join(""));
for (const cause of seen) {
  const row = LEVELS.map((l) => {
    const v = table.get(l);
    const c = v.counts.get(cause) || 0;
    return padL((c / v.levelConceded * 100).toFixed(1) + "%", 9);
  }).join("");
  console.log(pad(CAUSE_LABEL[cause] || cause, 16) + row);
}

const tops = LEVELS.map((l) => {
  const counts = table.get(l).counts;
  let best = null;
  let bestN = -1;
  for (const [k, n] of counts) if (n > bestN) { best = k; bestN = n; }
  return best;
});

console.log("");
console.log("구간별 1위: " + tops.map((t, i) => "Lv" + LEVELS[i] + "=" + (CAUSE_LABEL[t] || t)).join("  "));

const distinctTops = new Set(tops).size;
const c2 = orphans.length === 0;
const c3 = distinctTops >= 2;

console.log("");
console.log("C2 귀속   " + (c2 ? "PASS" : "FAIL") + "  원장 밖 원인 " + orphans.length + "건");
console.log("C3 비독점 " + (c3 ? "PASS" : "FAIL") + "  1위 원인 " + distinctTops + "종");

if (!c2 || !c3) process.exit(1);
