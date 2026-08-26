// 성장 트립와이어. 성장 선택지 어느 것을 골라도 다음 판 화면에서 달라지는 것이 있는가.
// 같은 씨드로 같은 구를 두 번 돌린다. 한 번은 그대로, 한 번은 칸 하나를 +1 해서.
// 화면에 나오는 것은 자막 순서와 재시작 대기 초다. 둘 중 하나라도 바뀌면 그 구는 다르게 보인다.
import { makeRng, buildSet, resolve, restartDelay, followerGain, keeperAtLevel, rollForm } from "../src/chain.mjs";
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
    out.push(r.events.map((e) => e.t).join(">") + "|" + restartDelay(k, r).toFixed(1) + "|" + followerGain(k, r));
  }
  return out;
}

function divergence(bump) {
  let differ = 0;
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
    for (let i = 0; i < a.length; i++) {
      balls++;
      if (a[i] !== b[i]) differ++;
    }
  }
  return { pct: (differ / balls) * 100, balls };
}

const rows = [];
for (const k of GROWABLE) {
  rows.push([CAUSE_LABEL[k] || k, divergence((g) => { if (g[k] < 10) g[k] += 1; else g[k] -= 1; }).pct]);
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
const controlOk = nullDelta === 0 && fakeDelta === 0;
console.log("");
if (dead.length) console.log("기준 " + BAR + "% 미달: " + dead.map(([n, v]) => n + " " + v.toFixed(2) + "%").join(", "));
if (!controlOk) console.log("대조군이 샬다. 계측기가 칸이 아닌 것을 재고 있다.");
const pass = dead.length === 0 && controlOk;
console.log("성장 트립와이어 " + (pass ? "PASS" : "FAIL"));
if (!pass) process.exit(1);
