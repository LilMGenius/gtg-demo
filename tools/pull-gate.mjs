import { chromium } from "playwright";
import { KEEPERS, keeperCost, PULL_COST, pullWeight, pullFrom } from "../src/roster.mjs";

// 이적시장은 상점에서 유일하게 값을 알고 이름을 모르는 축인데 아무도 재지 않았다.
// 뽑기가 값당 무엇을 사는지, 화면이 인쇄한 확률이 실제 뽑기 빈도와 같은지,
// 그리고 값만 치르고 아무것도 안 주는 경로가 없는지를 한 자리에서 잰다.
// 표본 범위: 이 게이트는 판정식을 부르지 않는다. 표본은 키퍼의 스탯 범위가 아니라
// 명단 전체이고, 화면 쪽 표본은 페이지가 스스로 말하는 지금의 풀이다.

// 뽑기 빈도를 재려면 난수가 계기가 된다. 처음에 잘라 쓴 LCG로 쟀더니 같은 축이
// 8시그마로 어긋났고 원인은 뽑기가 아니라 난수였다. 저품질 난수는 산출물의 결함처럼 보인다.
const mul32 = (a) => () => {
  a |= 0; a = (a + 0x6D2B79F5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const EXE = process.env.LOCALAPPDATA + "/ms-playwright/chromium-1228/chrome-win64/chrome.exe";
const BASE = "http://127.0.0.1:10310/web/index.html?preset=rich,veteran";
const LINE = String.fromCharCode(10);
const t = setTimeout(() => { console.log("WATCHDOG"); process.exit(1); }, 90000);
t.unref();

const fails = [], notes = [];
const check = (n, ok, d) => (ok ? notes : fails).push(n + " " + d);
const share = (pool) => {
  let tot = 0, top = 0, high = 0;
  for (const k of pool) { const w = pullWeight(k); tot += w; if (k.fame >= 10) top += w; if (k.fame >= 9) high += w; }
  return { top: top / tot * 100, high: high / tot * 100 };
};

// 가중치가 0인 카드는 값을 아무리 치러도 영영 안 나온다. 명단에 있는데 못 뽑는 카드는
// 상점이 파는 척만 하는 것이다. fame 11이면 (11-f)^2이 0이 되므로 그 자리가 대조군이다.
const dead = pullWeight({ fame: 11 });
check("instrument:reachability-control", dead === 0, "fame 11 weight " + dead);
const weights = KEEPERS.map(pullWeight);
const minW = Math.min(...weights);
check("pull:every-card-is-reachable", minW > 0, KEEPERS.length + " cards, min weight " + minW);

// 값만 깎고 아무것도 안 주는 경로는 만렙 훈련 데드락과 같은 결함이다.
// 빈 풀이 null을 돌려주는 것만으로는 부족하고, 안 빈 풀이 카드를 돌려주는 것까지 봐야 축이다.
const rng = mul32(20260903);
const empty = pullFrom([], rng);
const single = pullFrom([KEEPERS[0]], rng);
check("pull:empty-pool-refuses", empty === null && single === KEEPERS[0], "empty " + String(empty) + ", single " + (single && single.name));

// 뽑은 카드의 지목 구매가가 뽑기 값보다 낮으면 이적시장은 값을 태우는 창구다.
const N = 40000;
let sum = 0;
for (let i = 0; i < N; i++) sum += keeperCost(pullFrom(KEEPERS, rng));
const mean = sum / N;
check("pull:buys-more-than-it-costs", mean >= PULL_COST, mean.toFixed(0) + " value per " + PULL_COST + " sweat, x" + (mean / PULL_COST).toFixed(2));

// 축의 출처는 roster.mjs의 PULL_COST 주석이다. 무작위 한 장이 이름을 찍는 것보다 비싸면
// 뽑을 이유가 사라진다고 그 주석이 선언하고, 그 값을 명단 최저가 아래에 두었다고 적혀 있다.
const costs = KEEPERS.map(keeperCost);
const floor = Math.min(...costs);
const cheapest = KEEPERS[costs.indexOf(floor)].name;
check("pull:cheaper-than-naming", PULL_COST < floor, PULL_COST + " sweat vs cheapest name " + floor + " (" + cheapest + ")");

let b;
try {
  b = await chromium.launch({ executablePath: EXE });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } });
  const p = await ctx.newPage();
  const errs = [];
  p.on("pageerror", (e) => errs.push(String(e)));
  p.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
  await p.goto(BASE, { waitUntil: "load" });
  await p.evaluate(() => localStorage.clear());
  await p.goto(BASE, { waitUntil: "load" });
  await p.waitForTimeout(1200);
  await p.click("#go", { force: true });
  await p.waitForTimeout(1400);
  await p.evaluate(() => window.__shop(true));
  await p.waitForTimeout(400);

  // 풀은 명단이 아니라 지금 안 가진 카드다. 명단으로 재면 보유분만큼 화면과 어긋난다.
  const st = await p.evaluate(() => window.__squad());
  const owned = new Set(st.squad);
  const pool = KEEPERS.filter((k) => !owned.has(k.name));
  /* 확률과 남은 장수는 카드 본문이 아니라 눌러야 열리는 칸에 산다. 닫힌 details 안의
     innerText는 빈 문자열이라, 안 열고 읽으면 화면에 수가 없는 것과 구분이 안 된다.
     사람이 여는 자리를 그대로 눌러 열고 읽는다. 계기가 다른 문으로 들어가면 그 뒤로는
     화면이 바뀌어도 계기만 옛 자리를 계속 읽는다. */
  const openOdds = async () => p.evaluate(() => {
    const d = document.querySelector("#shop details.odds");
    if (!d) return "";
    d.querySelector("summary").click();
    const e = d.querySelector("em");
    return e ? e.innerText : "";
  });
  const closedText = await p.evaluate(() => {
    const e = document.querySelector("#shop details.odds em");
    return e ? e.innerText : "";
  });
  const shown = await openOdds();
  // 대조군. 닫힌 칸은 아무것도 안 읽혀야 한다. 닫아도 같은 수가 읽히면 이 자는 여는 문이
  // 있다는 것을 증명하지 못하고, 다음에 그 문이 사라져도 초록을 낸다.
  check("instrument:the-shut-panel-reads-empty", closedText.trim() === "", JSON.stringify(closedText.slice(0, 24)));
  check("pull:the-odds-panel-opens-where-a-player-clicks", shown.trim() !== "", JSON.stringify(shown.slice(0, 40)));

  // 정규식 대신 문자로 훑는다. 이 레포에서 게이트 소스의 역슬래시는 전송 단계에서 사라진 적이 있다.
  const parse = (s) => {
    const out = { pct: [], cnt: -1 };
    let cur = "";
    for (const ch of s) {
      if ((ch >= "0" && ch <= "9") || ch === ".") { cur += ch; continue; }
      if (ch === "%" && cur) out.pct.push(Number(cur));
      if (ch === "장" && cur) out.cnt = Number(cur);
      cur = "";
    }
    return out;
  };
  const first = parse(shown);
  const pct = first.pct, cnt = first.cnt;
  check("pull:count-on-screen-matches-pool", cnt === pool.length, "screen " + cnt + ", pool " + pool.length + ", owned " + st.squad.length);

  const want = share(pool);
  const okPrint = pct.length === 2 && Math.abs(pct[0] - want.top) <= 0.05 && Math.abs(pct[1] - want.high) <= 0.05;
  check("pull:printed-odds-match-the-pool", okPrint, "screen " + pct.join("/") + " want " + want.top.toFixed(1) + "/" + want.high.toFixed(1));

  // 보유분이 풀에서 빠지는지는 보유가 실제로 생겨야 갈린다. 시작 키퍼는 명단 밖이라
  // 처음 읽은 수는 필터를 한 번도 통과시키지 않은 수다. 명단에서 한 명을 사서 다시 센다.
  await p.evaluate(() => window.__shop(false));
  await p.evaluate(() => window.__roster(true));
  await p.waitForTimeout(220);
  const bought = await p.evaluate((name) => {
    const b = [...document.querySelectorAll("#roster .row button")].find((x) => x.dataset.n === name);
    if (!b || b.disabled) return null;
    b.click();
    return name;
  }, cheapest);
  await p.evaluate(() => window.__roster(false));
  await p.evaluate(() => window.__shop(true));
  await p.waitForTimeout(320);
  const after = parse(await openOdds());
  check("pull:owned-leaves-the-pool", bought !== null && after.cnt === cnt - 1, "bought " + String(bought) + ", screen " + cnt + " -> " + after.cnt);

  // 인쇄된 수와 실제 뽑기 빈도는 다른 명제다. 같은 풀에서 실제로 뽑아 빈도를 센다.
  const M = 200000;
  const r2 = mul32(7);
  let h10 = 0, h9 = 0;
  for (let i = 0; i < M; i++) { const k = pullFrom(pool, r2); if (k.fame >= 10) h10++; if (k.fame >= 9) h9++; }
  const sd = (q) => Math.sqrt(q / 100 * (1 - q / 100) / M) * 100;
  const z10 = (h10 / M * 100 - want.top) / sd(want.top);
  const z9 = (h9 / M * 100 - want.high) / sd(want.high);
  check("pull:draws-match-the-printed-odds", Math.abs(z10) < 4 && Math.abs(z9) < 4, "z " + z10.toFixed(2) + "/" + z9.toFixed(2) + " at " + (h10 / M * 100).toFixed(2) + "/" + (h9 / M * 100).toFixed(2));

  // 대조군. 가중치를 버리고 고르게 뽑으면 같은 축이 크게 어긋나야 한다.
  const r3 = mul32(11);
  let u10 = 0;
  for (let i = 0; i < M; i++) { if (pool[Math.floor(r3() * pool.length)].fame >= 10) u10++; }
  const zc = (u10 / M * 100 - want.top) / sd(want.top);
  check("instrument:odds-control-splits", Math.abs(zc) > 10, "uniform draw z " + zc.toFixed(0) + " at " + (u10 / M * 100).toFixed(2));

  check("console:no-errors", errs.length === 0, errs.slice(0, 3).join(" | ") || "clean");
  if (notes.length) console.log(notes.map((x) => "  ok   " + x).join(LINE));
  if (fails.length) console.log(fails.map((x) => "  FAIL " + x).join(LINE));
  console.log(fails.length ? "pull FAIL " + fails.length : "pull PASS");
  if (fails.length) process.exitCode = 1;
} finally {
  clearTimeout(t);
  if (b) await b.close();
}
