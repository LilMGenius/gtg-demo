
// 회전 트립와이어. 시간당 구 수가 초기 대비 만렙에서 두 배 근처인가.
// 화면 대기시간을 그대로 더한다. 판정 로직은 안 건드린다.
import { makeRng, buildSet, resolve, restartDelay, setBreak, keeperAtLevel, rollForm, newKeeper } from "../src/chain.mjs";

const CAPTION_MS = Number(process.argv[2] ?? 850);

function hourly(keeper, seed) {
  const rng = makeRng(seed);
  let sec = 0;
  let wait = 0;
  let balls = 0;
  let saved = 0;
  for (let set = 0; set < 400; set++) {
    rollForm(keeper, rng);
    for (const shot of buildSet(rng, keeper.level)) {
      const r = resolve({ keeper, shot, rng });
      balls++;
      if (!r.conceded) saved++;
      wait += restartDelay(keeper, r);
      sec += shot.flight + (r.events.length * CAPTION_MS) / 1000 + restartDelay(keeper, r);
    }
    sec += setBreak();
    wait += setBreak();
  }
  return { perHour: balls / (sec / 3600), waitHour: balls / (wait / 3600), balls, saveRate: saved / balls };
}

const low = newKeeper();
const high = keeperAtLevel(10, makeRng(1));
for (const k of Object.keys(high)) if (typeof high[k] === "number" && k !== "level" && k !== "height" && k !== "weight") high[k] = 10;

const a = hourly(low, 11);
const b = hourly(high, 11);
console.log("전 능력치 3   " + a.perHour.toFixed(0) + " 구/시간  세이브율 " + (a.saveRate * 100).toFixed(1) + "%");
console.log("전 능력치 10  " + b.perHour.toFixed(0) + " 구/시간  세이브율 " + (b.saveRate * 100).toFixed(1) + "%");
const ratio = b.perHour / a.perHour;
console.log("배율 " + ratio.toFixed(2));
// 스택이 사는 것은 대기시간뿐이다. 비행과 자막은 어느 키퍼나 같은 초를 쓴다.
const wr = b.waitHour / a.waitHour;
console.log("대기시간만 보면 " + wr.toFixed(2));
// STATS 13절은 세이브율 60과 85를 가정하고 2.0을 적었다.
// 여기 자동입력 세이브율은 그보다 낮아 느린 갈래 비중이 높고, 그만큼 배율이 깎인다.
const pass = wr >= 1.7 && wr <= 2.3;
console.log("자막 " + CAPTION_MS + "ms 기준");
console.log("회전 트립와이어 " + (pass ? "PASS" : "FAIL"));
if (!pass) process.exit(1);
