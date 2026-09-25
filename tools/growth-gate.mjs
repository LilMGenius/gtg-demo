import { resolution } from './seed-resolution.mjs';
// 위치 모집단: 수동은 hand-react(p_read=0.9), 자동은 botPlan 자취다. tools/position-pop.mjs가 난수 경계를 짝짓는다.
// 이 게이트의 모집단은 keeperAtLevel 기준 모집단(N칸 중 셋, 레벨당 3포인트)이며 제품 모집단은 tools/product-pop-gate.mjs가 잰다.
// 성장 트립와이어. 성장 선택지 어느 것을 골라도 다음 판 화면에서 달라지는 것이 있는가.
// 같은 씨드로 같은 구를 두 번 돌린다. 한 번은 그대로, 한 번은 칸 하나를 +1 해서.
// 자막의 사건·원인, 재시작 대기, 팬 수와 렌더 입력의 위치·다이빙 발동을 비교한다. 사람의 지각 판정은 별도다.
import { makeRng, buildSet, resolve, restartDelay, followerGain, keeperAtLevel, rollForm } from "./position-pop.mjs";
import { GROWABLE, CAUSE_LABEL } from "../src/ledger.mjs";

const SETS = Number(process.argv[2] ?? 3000);
const LEVEL = 5;

// 한 구를 화면에 보이는 모양으로 줌인다.
function playSet(keeper, shots, seed) {
  // 판을 통으로 굴린다. 연속 실점은 다음 구로 넘어간다.
  // 구를 띄어놓으면 회복탄력성 항은 아예 안 읽힌다.
  const k = Object.assign({}, keeper);
  k.streak = 0;
  const rng = makeRng(seed);
  const out = [];
  for (const shot of shots) {
    const r = resolve({ keeper: k, shot, rng });
    // 자막은 사건 종류뿐 아니라 원인 풀로 문장을 고른다. 위치 경로는 실제 출발 위치와 발동 시각도 렌더한다.
    // 좌표 소수 둘째 자리와 정수 ms는 부동소수 잡음만 버린다. 가시성의 사람 판독을 대신하는 문턱은 아니다.
    const old = r.events.map(e => e.t).join(">") + "|" + restartDelay(k, r).toFixed(1) + "|" + followerGain(k, r);
    const screen = JSON.stringify([r.events.map(e => [e.t, e.cause]), restartDelay(k, r).toFixed(1), followerGain(k, r),
      r.input.x.toFixed(2), Math.round(r.input.triggerMs), r.input.dive, r.input.advance.toFixed(2)]);
    out.push({ old, screen });
  }
  return out;
}

function divergence(bump) {
  const samples = [];
  let differ = 0, oldDiffer = 0;
  let balls = 0;
  for (let s = 0; s < SETS; s++) {
    const seed = 900001 + s * 7919;
    const base = keeperAtLevel(LEVEL, makeRng(seed));
    rollForm(base, makeRng(seed + 1));
    const grown = Object.assign({}, base);
    bump(grown);
    grown.form = base.form;
    const shots = buildSet(makeRng(seed + 2), LEVEL);
    const a = playSet(base, shots, seed * 31);
    const b = playSet(grown, shots, seed * 31);
    const before = differ;
    for (let i = 0; i < a.length; i++) {
      balls++;
      if (a[i].screen !== b[i].screen) differ++;
      if (a[i].old !== b[i].old) oldDiffer++;
    }
    samples.push([differ - before, a.length]);
  }
  return { pct: (differ / balls) * 100, oldPct: (oldDiffer / balls) * 100, balls, samples };
}

const rows = [];
for (const k of GROWABLE) {
  const measured = divergence((g) => { if (g[k] < 10) g[k] += 1; else g[k] -= 1; });
  rows.push([CAUSE_LABEL[k] || k, measured.pct]);
  resolution("growth/" + k, measured.samples);
  console.log("axis " + k + " old=" + measured.oldPct.toFixed(2) + "% screen=" + measured.pct.toFixed(2) + "%");
}

// 대조군. 아무것도 안 올리면 화면은 같아야 한다.
const nullDelta = divergence(() => {}).pct;
// 대조군. 판정이 안 읽는 칸을 올려도 화면은 같아야 한다.
const fakeDelta = divergence((g) => { g.nonsense = (g.nonsense || 0) + 1; }).pct;

const pad = (s, n) => String(s).padEnd(n, " ");
const padL = (s, n) => String(s).padStart(n, " ");
console.log("구 " + divergence(() => {}).balls + "  레벨 " + LEVEL);
console.log("");
console.log(pad("칸", 16) + padL("화면이 달라진 구", 16));
for (const [name, v] of rows) console.log(pad(name, 16) + padL(v.toFixed(2) + "%", 16));
console.log("");
console.log(pad("대조군 무변화", 16) + padL(nullDelta.toFixed(2) + "%", 16));
console.log(pad("대조군 가짜칸", 16) + padL(fakeDelta.toFixed(2) + "%", 16));

const BAR = 1.0;
const dead = rows.filter(([, v]) => v < BAR);
// 같은 문턱으로 가짜 성장과 끊긴 성장 배선을 거부해야 축 확장이 완화가 아니다.
const controlOk = nullDelta === 0 && fakeDelta === 0 && nullDelta < BAR && fakeDelta < BAR;
console.log("control:unchanged-and-disconnected-growth " + (controlOk ? "PASS" : "FAIL") + " planted axes FAIL at unchanged BAR=" + BAR);
console.log("");
if (dead.length) console.log("기준 " + BAR + "% 미달: " + dead.map(([n, v]) => n + " " + v.toFixed(2) + "%").join(", "));
if (!controlOk) console.log("대조군이 샬다. 계측기가 칸이 아닌 것을 재고 있다.");
const pass = dead.length === 0 && controlOk;
console.log("성장 트립와이어 " + (pass ? "PASS" : "FAIL"));
if (!pass) process.exit(1);
