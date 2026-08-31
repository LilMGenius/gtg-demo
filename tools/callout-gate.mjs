import { KICKERS } from "../src/roster.mjs";
import { aimLine, bucketOf, CALLOUT_POOL } from "../web/src/ui/callout.mjs";

// 예고 자막 게이트. 한 문장짜리 예고가 매 구 반복되던 것을 고친 뒤,
// 그 수리가 살아 있는지를 로스터 전수와 난수 시행으로 다시 잰다.

const say = (ok, name, v) => console.log("  " + (ok ? "ok  " : "FAIL") + " " + name + " " + v);
let ok = true;
const check = (c, name, v) => { if (!c) ok = false; say(c, name, v); };

check(CALLOUT_POOL >= 12, "pool:at-least-twelve-lines", CALLOUT_POOL);

// 버킷이 코드에만 있고 로스터로는 아무도 못 닿으면 그 갈래는 없는 것과 같다.
const hit = new Map();
for (const k of KICKERS) {
  const key = bucketOf(k).key;
  hit.set(key, (hit.get(key) || 0) + 1);
}
const keys = ["flair", "shaky", "power", "fame", "plain"];
for (const key of keys) check((hit.get(key) || 0) > 0, "reach:" + key, hit.get(key) || 0);

// 대조군. 이름이 안 들어가면 누가 차는지 모르는 자막이다.
let named = 0;
let polite = 0;
let repeat = 0;
let distinct = new Set();
let seed = 1;
const rng = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
for (let i = 0; i < KICKERS.length * 40; i++) {
  const k = KICKERS[i % KICKERS.length];
  let last = null;
  for (let j = 0; j < 2; j++) {
    const line = aimLine(k, rng, last);
    if (line.includes(k.name)) named++;
    // 뉴스 리포트 존댓말은 병맛 톤과 어긋난다. 그 어미가 하나라도 있으면 회귀다.
    if (/습니다|합니다|입니다/.test(line)) polite++;
    if (last !== null && line === last) repeat++;
    distinct.add(line);
    last = line;
  }
}
const trials = KICKERS.length * 40 * 2;
check(named === trials, "line:every-line-names-the-kicker", named + "/" + trials);
check(polite === 0, "line:no-news-report-politeness", polite);
check(repeat === 0, "line:never-repeats-back-to-back", repeat);
check(distinct.size >= CALLOUT_POOL, "line:whole-pool-is-reachable", distinct.size);

// 대조군. 같은 문장을 금지하지 않으면 반복이 실제로 나오는지 확인한다.
// 안 나오면 위 검사가 통과한 이유가 금지 때문이 아니라 표본 탓이다.
let naive = 0;
for (let i = 0; i < 2000; i++) {
  const k = KICKERS[i % KICKERS.length];
  const a = aimLine(k, rng, null);
  const b = aimLine(k, rng, null);
  if (a === b) naive++;
}
check(naive > 0, "control:unguarded-draw-does-repeat", naive);

console.log("callout " + (ok ? "PASS " + CALLOUT_POOL : "FAIL"));
process.exit(ok ? 0 : 1);
