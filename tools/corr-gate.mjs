import { resolve, makeRng, buildSet, keeperAtLevel, rollForm, newKeeper } from "../src/chain.mjs";
import { GROWABLE } from "../src/ledger.mjs";

/* 상관계수 표의 자. 한 칸을 올리면 세이브율이 얼마나 움직이는지를 칸마다 잰다.
   설계 문서가 그 표를 인용하므로, 표를 만드는 코드가 문서 옆이 아니라 여기 있어야 한다.

   기준선은 신규 키퍼다. 만렙 근처에서 재면 클램프에 눌려 모든 칸이 0으로 수렴한다.
   변종끼리 같은 시드를 써서 같은 구를 받는다. 다른 구를 받으면 그 차이가 칸의 효과와 섞인다.
   입력은 완벽 수동이다. 자동 입력을 쓰면 손가락의 오판이 칸의 효과 위에 얹힌다.

   재는 것은 셋이다. 표본이 선언한 만큼인가, 재시작 칸이 세이브율에 안 붙는가,
   세이브 경로 칸이 양수인가. 순위와 크기는 재지 않는다. 그것은 20번 항목이 소유한 열린 질문이고,
   여기서 문턱으로 굳히면 그 답이 오는 날 이 자가 개선을 결함으로 읽는다.
   표본 범위: 레벨 1 신규 키퍼. 계약이 아니라 계수를 재므로 기준선 하나로 족하다. */
const args = process.argv.slice(2);
const argN = (name, fallback) => {
  const i = args.indexOf("--" + name);
  return i === -1 ? fallback : Number(args[i + 1]);
};
const BALLS = argN("balls", 20000);
const SET = 5;
const SEEDS = Math.ceil(BALLS / SET);
// 재시작에 붙은 칸. 세이브 경로가 아니므로 0이어야 한다. 회전율 표가 이 둘의 존재 이유다.
const RESTART = ["goalKick", "throwing"];
// 팔로워 경로에 붙은 칸. 세이브율을 파는 대신 클립과 소문을 산다. 음수가 설계다.
const FAME = ["mischief", "communication"];
const LINE = String.fromCharCode(10);

const fails = [], notes = [];
const check = (n, ok, d) => (ok ? notes : fails).push(n + " " + d);

// 한 변종의 세이브율. 시드마다 키퍼를 새로 만들고 그 자리에서 한 칸만 올린다.
function rate(bump) {
  let saved = 0;
  let balls = 0;
  for (let s = 0; s < SEEDS; s += 1) {
    const rng = makeRng(1000003 + s);
    const keeper = keeperAtLevel(1, rng);
    rollForm(keeper, rng);
    if (bump) keeper[bump] = Math.min(10, (Number(keeper[bump]) || 1) + 1);
    for (const shot of buildSet(rng, 1)) {
      if (balls >= BALLS) break;
      // 완벽 수동. 방향은 맞고 타이밍은 정확하다. 손가락을 상수로 고정해야 칸만 남는다.
      const input = { dive: shot.side, errMs: 0, advance: 0, auto: false };
      const r = resolve({ keeper, shot, rng, input });
      balls += 1;
      if (!r.conceded) saved += 1;
    }
    if (balls >= BALLS) break;
  }
  return { pct: 100 * saved / balls, balls };
}

const base = rate(null);
const rows = GROWABLE.map((k) => ({ k, d: rate(k).pct - base.pct }));
rows.sort((a, b) => b.d - a.d);

const pad = (s, n) => String(s).padEnd(n, " ");
console.log("기준 세이브율 " + base.pct.toFixed(2) + "%  표본 " + base.balls + "구  변종 " + rows.length);
for (const r of rows) console.log("  " + pad(r.k, 14) + (r.d >= 0 ? "+" : "") + r.d.toFixed(2));

check("instrument:the-sample-is-the-declared-size", base.balls === BALLS, base.balls + " of " + BALLS);
check("instrument:every-growable-slot-was-measured", rows.length === GROWABLE.length, rows.length + " of " + GROWABLE.length);
const flat = RESTART.map((k) => rows.find((r) => r.k === k));
check("corr:the-restart-slots-do-not-touch-the-save-rate", flat.every((r) => r && Math.abs(r.d) < 0.02),
  flat.map((r) => r.k + " " + r.d.toFixed(2)).join(", "));
// 세이브 경로 칸. 재시작과 소문 경로를 뺀 나머지는 올리면 더 막아야 한다.
const path = rows.filter((r) => !RESTART.includes(r.k) && !FAME.includes(r.k));
const sunk = path.filter((r) => r.d < 0);
check("corr:every-save-path-slot-pays-something", sunk.length === 0,
  sunk.map((r) => r.k + " " + r.d.toFixed(2)).join(", ") || path.length + " slots positive");
// 소문 경로 칸이 세이브율을 파는 것이 설계다. 양수면 그 교환이 사라진 것이다.
const fame = FAME.map((k) => rows.find((r) => r.k === k));
check("corr:the-fame-slots-sell-save-rate", fame.every((r) => r && r.d <= 0),
  fame.map((r) => r.k + " " + r.d.toFixed(2)).join(", "));
// 쏠림은 재기만 하고 문턱을 안 건다. 20번 항목이 그 답을 소유한다.
const top = rows[0];
const second = rows[1];
console.log("쏠림 " + top.k + " " + top.d.toFixed(2) + " against " + second.k + " " + second.d.toFixed(2)
  + "  ratio " + (second.d === 0 ? "inf" : (top.d / second.d).toFixed(2)));

if (notes.length) console.log(notes.map((x) => "  ok   " + x).join(LINE));
if (fails.length) console.log(fails.map((x) => "  FAIL " + x).join(LINE));
console.log(fails.length ? "corr FAIL " + fails.length : "corr PASS " + notes.length);
if (fails.length) process.exitCode = 1;
