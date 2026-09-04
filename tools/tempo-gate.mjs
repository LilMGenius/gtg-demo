
// 회전 트립와이어. 시간당 구 수가 초기 대비 만렙에서 두 배 근처인가.
// 화면 대기시간을 그대로 더한다. 판정 로직은 안 건드린다.
import { makeRng, buildSet, resolve, restartDelay, setBreak, keeperAtLevel, rollForm, newKeeper } from "../src/chain.mjs";

const CAPTION_MS = Number(process.argv[2] ?? 850);

function hourly(keeper, seed) {
  const rng = makeRng(seed);
  let sec = 0;
  let wait = 0;
  let flight = 0;
  let caption = 0;
  let brk = 0;
  let balls = 0;
  let saved = 0;
  for (let set = 0; set < 400; set++) {
    rollForm(keeper, rng);
    for (const shot of buildSet(rng, keeper.level)) {
      const r = resolve({ keeper, shot, rng });
      balls++;
      if (!r.conceded) saved++;
      flight += shot.flight;
      caption += (r.events.length * CAPTION_MS) / 1000;
      wait += restartDelay(keeper, r);
      sec += shot.flight + (r.events.length * CAPTION_MS) / 1000 + restartDelay(keeper, r);
    }
    sec += setBreak();
    wait += setBreak();
    brk += setBreak();
  }
  return { perHour: balls / (sec / 3600), waitHour: balls / (wait / 3600), balls, saveRate: saved / balls,
    per: { flight: flight / balls, caption: caption / balls, wait: wait / balls, brk: brk / balls, total: sec / balls } };
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

/* 체감 배율과 그 분해. 지금까지 이 자는 대기시간만 문턱에 걸었다.
   계수가 직접 움직이는 양이라 그쪽이 재려야 하는 것은 맞지만,
   플레이어가 겪는 것은 비행과 자막과 세트 휴식까지 더한 시간이다.
   그 수를 인쇄만 하고 문턱을 안 걸면, 이 자는 플레이어가 안 느끼는 양을 지키고 있는 것이다.
   1.3은 계획서의 죽는 조건 표가 이미 선언한 수다. 그 아래로 내려가면 재시작 템포가
   성장 동기를 못 만든다고 적어 둔 자리라, 여기서 지어낸 수가 아니다. */

/* 어느 상수가 배율을 묶고 있는지를 같이 인쇄한다. 대기만 보면 2.0을 넘는데
   체감은 1.45에서 멈추는 이유가 이 분해에 그대로 나온다.
   자막과 세트 휴식은 능력치를 안 보고, 만렙 키퍼는 살리는 구가 많아 자막 줄이 오히려 길다.
   만렙의 대기가 0이어도 체감 배율은 아래 상한을 못 넘는다. */
const wear = (n, x) => console.log("  " + n + " 구당 " + x.per.total.toFixed(2) + "초 = 비행 " + x.per.flight.toFixed(2)
  + " + 자막 " + x.per.caption.toFixed(2) + " + 대기 " + (x.per.wait - x.per.brk).toFixed(2) + " + 휴식 " + x.per.brk.toFixed(2));
wear("초기", a);
wear("만렙", b);
console.log("대기가 0이어도 체감 상한 " + (a.per.total / (b.per.total - (b.per.wait - b.per.brk))).toFixed(2));
const EXP_BAR = 1.3;
const expPass = ratio >= EXP_BAR;
console.log("체감 배율 " + ratio.toFixed(2) + "  바 " + EXP_BAR);

const pass = wr >= 1.7 && wr <= 2.3;
console.log("자막 " + CAPTION_MS + "ms 기준");
console.log("회전 트립와이어 " + (pass && expPass ? "PASS" : "FAIL"));
if (!pass || !expPass) process.exit(1);
