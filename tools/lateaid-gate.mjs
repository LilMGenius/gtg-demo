import { makeRng, buildSet, resolve, newKeeper, followerGain } from "../src/chain.mjs";
import { GROWABLE } from "../src/ledger.mjs";

// 보조 수단이 만렙에서 어떻게 되는지는 그것이 판정식의 어느 자리에 얹혔는지가 정한다.
// 감산항에 얹힌 것은 스탯이 그 항을 0으로 밀면 같이 죽고, 승산항에 얹힌 것은 스탯이 클수록 같이 커진다.
// 장비는 감산항이라 만렙에서 시들고, 버프와 동네는 승산항이라 만렙에서 오히려 세진다.
// 이 게이트는 그 구조가 유지되는지를 지킨다. 승산 쪽이 시들면 후반 소비처가 통째로 사라진다.

const SEEDS = 2000;
const fails = [], notes = [];
const check = (n, ok, d) => (ok ? notes : fails).push(n + " " + d);

const maxed = () => { const k = newKeeper(); for (const s of GROWABLE) k[s] = 10; return k; };

const sweep = (k, opt) => {
  let saved = 0, shots = 0, fans = 0;
  const city = opt.city || 0;
  for (let s = 0; s < SEEDS; s += 1) {
    const rng = makeRng(s + 90001);
    for (const shot of buildSet(makeRng(s + 1), 5, city)) {
      const r = resolve({ keeper: k, shot, rng, input: { dive: shot.side, errMs: 0, advance: 0, auto: false },
        focusAid: opt.focusAid || 1, rosin: !!opt.rosin });
      shots += 1;
      if (!r.conceded) saved += 1;
      fans += followerGain(k, r, city, 1, opt.boost || 1, 1);
    }
  }
  return { saved, fans };
};

const fresh = newKeeper(), top = maxed();
const fb = sweep(fresh, {}), tb = sweep(top, {});

const c1 = sweep(top, {}), c2 = sweep(top, {});
check("control", c1.saved === c2.saved && c1.fans === c2.fans, c1.saved + "/" + c1.fans);

// 자양강장제는 focusAid 승수다. 만렙 키퍼는 의사소통과 악동이 10이라 수다를 더 많이 당하고,
// 그래서 그 승수가 깎아 주는 몫도 커진다. 초반보다 후반에 더 값을 하는 것이 정상이다.
const tonicF = sweep(fresh, { focusAid: 0.5 }).saved - fb.saved;
const tonicT = sweep(top, { focusAid: 0.5 }).saved - tb.saved;
check("tonic:alive-at-max", tonicT > 0, "saves gained fresh " + tonicF + " maxed " + tonicT);
check("tonic:grows-with-stats", tonicT > tonicF, tonicF + " -> " + tonicT);

// 송진은 장갑과 같은 감산항에 얹혀 있어 만렙에서 시든다. 0이 되지만 않으면 후반 상품으로 남는다.
const rosinF = sweep(fresh, { rosin: true }).saved - fb.saved;
const rosinT = sweep(top, { rosin: true }).saved - tb.saved;
check("rosin:not-dead-at-max", rosinT > 0, "saves gained fresh " + rosinF + " maxed " + rosinT);

// 바이럴 떡밥과 동네는 팔로워 배수다. 판정 밖이라 스탯 상한에 안 걸린다.
const hypeF = sweep(fresh, { boost: 1.5 }).fans - fb.fans;
const hypeT = sweep(top, { boost: 1.5 }).fans - tb.fans;
check("hype:grows-with-stats", hypeT > hypeF, hypeF + " -> " + hypeT);

const cityT = sweep(top, { city: 3 });
check("city:still-trades-at-max", cityT.fans > tb.fans && cityT.saved < tb.saved,
  "fans +" + (cityT.fans - tb.fans) + " saves " + (cityT.saved - tb.saved));

const LINE = String.fromCharCode(10);
if (notes.length) console.log(notes.map((x) => "  ok   " + x).join(LINE));
if (fails.length) console.log(fails.map((x) => "  FAIL " + x).join(LINE));
console.log(fails.length ? "lateaid FAIL " + fails.length : "lateaid PASS");
if (fails.length) process.exitCode = 1;
