import { resolve, buildSet, makeRng, newKeeper, statValue, STAT_KNEE, STAT_TOP } from "../src/chain.mjs";
import { GROWABLE } from "../src/ledger.mjs";
import { SAVE_PATH } from "../web/src/state/coach.mjs";

// 상한 없는 능력치의 자. 저장된 값은 끝없이 오르고 판정은 statValue를 지난 실효값을 읽는다.
// 묻는 것은 넷이다. 무릎(10)까지는 값이 그대로라 지금까지 잰 밸런스가 안 움직이는가. 무릎 너머는 오르되
// 한 칸의 몫이 줄고 STAT_TOP 아래에 머무는가. 세이브 칸을 함께 올린 키퍼의 세이브율이 오르되 오름폭이 주는가.
// 한 칸만 10에서 20으로 올려 세이브율이 떨어지는 칸이 없는가(위험 항이 무릎에서 멈추는가).
// 대조군은 직선 곡선이다. 같은 축에 넣으면 상한 축이 빨개져야 이 자가 곡선을 본다.
const fails = [], notes = [];
const check = (n, ok, d) => (ok ? notes : fails).push(n + " " + d);
const SETS = 3000;
const rate = (k, lv = 13) => {
  let s = 0, n = 0;
  for (let i = 0; i < SETS; i++) {
    const rng = makeRng(i + 90001);
    const kk = { ...k };
    for (const shot of buildSet(makeRng(i + 1), lv, 0)) { const r = resolve({ keeper: kk, shot, rng }); n++; if (!r.conceded) s++; }
  }
  return s / n * 100;
};
const curveOk = (f) => {
  const knee = [...Array(STAT_KNEE)].every((_, i) => f(i + 1) === i + 1);
  const vs = [10, 11, 12, 15, 20, 40, 100, 1e6].map(f);
  const rising = vs.every((v, i) => i === 0 || v > vs[i - 1]);
  const steps = [11, 12, 13, 20, 40].map((v) => f(v) - f(v - 1));
  const shrinking = steps.every((d, i) => i === 0 || d < steps[i - 1]);
  const bounded = vs.every((v) => v < STAT_TOP);
  return { knee, rising, shrinking, bounded, sample: vs.slice(0, 6).map((v) => v.toFixed(3)).join(" ") };
};
const live = curveOk(statValue);
check("curve:values-up-to-the-knee-are-unchanged", live.knee, "1.." + STAT_KNEE + " map to themselves");
check("curve:past-the-knee-it-keeps-rising", live.rising, live.sample);
check("curve:each-point-past-the-knee-buys-less", live.shrinking, live.sample);
check("curve:it-stays-under-the-top", live.bounded, "top " + STAT_TOP);
const linear = curveOk((v) => v);
check("control:a-straight-line-fails-the-top-axis", !linear.bounded && !linear.shrinking, "linear bounded=" + linear.bounded + " shrinking=" + linear.shrinking);

const at = (v) => { const k = { ...newKeeper(), level: 13 }; for (const g of SAVE_PATH) k[g] = v; return k; };
const r10 = rate(at(10)), r20 = rate(at(20)), r40 = rate(at(40));
check("save:training-past-ten-still-raises-the-save-rate", r20 > r10 && r40 > r20, [r10, r20, r40].map((x) => x.toFixed(2)).join(" -> "));
check("save:the-rise-slows", r40 - r20 < r20 - r10, (r20 - r10).toFixed(2) + " then " + (r40 - r20).toFixed(2));
// 모든 칸을 무릎에 세운 키퍼다. 세이브 칸만 10이면 악동과 의사소통이 4와 3에서 올라가며 무릎 아래의 원래 대가를 치러, 무릎 너머를 재는 축이 그 대가를 잰다.
const base = { ...newKeeper(), level: 13 };
for (const g of GROWABLE) base[g] = 10;
const rb = rate(base);
const drops = GROWABLE.map((st) => [st, rate({ ...base, [st]: 20 }) - rb]).filter(([, d]) => d < -0.3);
check("save:no-single-stat-past-ten-lowers-saves", drops.length === 0, drops.map(([s, d]) => s + " " + d.toFixed(2)).join(", ") || GROWABLE.length + " stats, none below -0.3");

for (const n of notes) console.log("  ok   " + n);
for (const f of fails) console.log("  FAIL " + f);
console.log(fails.length ? "statcurve FAIL " + fails.length : "statcurve PASS " + notes.length);
process.exitCode = fails.length ? 1 : 0;
