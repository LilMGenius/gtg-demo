import { makeRng, buildSet, resolve, newKeeper } from "../src/chain.mjs";
import { GROWABLE } from "../src/ledger.mjs";

// 장비가 만렙 키퍼에게도 값을 하는지 잰다. 판정식 여러 곳이 스탯 상한에서 0으로 클램프되므로,
// 신규 키퍼에서만 재면 선반 전체가 초록인 채로 후반 소비처가 비어 있을 수 있다.
// 방치형에서 만렙 뒤에 살 것이 없으면 그 지점이 게임의 끝이다.

const SEEDS = 2000;
const fails = [], notes = [];
const check = (n, ok, d) => (ok ? notes : fails).push(n + " " + d);

const maxed = () => { const k = newKeeper(); for (const s of GROWABLE) k[s] = 10; return k; };

// 비율이 아니라 막아 낸 구 수를 센다. 백분율은 소수 둘째 자리에서 0으로 반올림되어
// 아무것도 안 사는 것과 아주 조금 사는 것이 같은 수로 보인다.
const sweep = (k, gear) => {
  let saved = 0, shots = 0;
  for (let s = 0; s < SEEDS; s += 1) {
    const rng = makeRng(s + 90001);
    for (const shot of buildSet(makeRng(s + 1), 5, 0)) {
      const r = resolve(Object.assign({ keeper: k, shot, rng, input: { dive: shot.side, errMs: 0, advance: 0, auto: false } }, gear));
      shots += 1;
      if (!r.conceded) saved += 1;
    }
  }
  return { saved, shots, rate: Number((saved / shots * 100).toFixed(2)) };
};

const FIELDS = ["grip", "studs", "pads", "socks", "frame"];
const fresh = newKeeper(), top = maxed();
const freshBase = sweep(fresh, {});
const topBase = sweep(top, {});

const c1 = sweep(top, {}), c2 = sweep(top, {});
check("control", c1.saved === c2.saved, String(c1.saved));

for (const f of FIELDS) {
  const a = sweep(fresh, { [f]: 3 });
  const b = sweep(top, { [f]: 3 });
  const gainFresh = a.saved - freshBase.saved;
  const gainTop = b.saved - topBase.saved;
  // 최상급을 사고 막아 낸 구가 한 구도 안 늘면 그 선반은 만렙에게 아무것도 팔지 않는다.
  check("lategear:" + f + "-still-pays", gainTop > 0,
    "saves gained fresh " + gainFresh + " maxed " + gainTop);
}

// 후반에 약해지는 것 자체는 설계일 수 있다. 완전히 0이 되는 것과는 다르다.
console.log("  note  base rate fresh " + freshBase.rate + " maxed " + topBase.rate);

const LINE = String.fromCharCode(10);
if (notes.length) console.log(notes.map((x) => "  ok   " + x).join(LINE));
if (fails.length) console.log(fails.map((x) => "  FAIL " + x).join(LINE));
console.log(fails.length ? "lategear FAIL " + fails.length : "lategear PASS");
if (fails.length) process.exitCode = 1;
