import { chromium } from "playwright";
import { KEEPERS, keeperCost, PULL_COST, pullWeight, pullFrom } from "../src/roster.mjs";

// 이적시장은 상점에서 유일하게 값을 알고 이름을 모르는 축인데 아무도 재지 않았다.
// 뽑기가 값당 무엇을 사는지, 화면이 인쇄한 확률이 실제 뽑기 빈도와 같은지,
// 그리고 값만 치르고 아무것도 안 주는 경로가 없는지를 한 자리에서 잰다.
// 표본 범위: 이 게이트는 판정식을 부르지 않는다. 표본은 키퍼의 스탯 범위가 아니라
// 명단 전체이고, 화면 쪽 표본은 페이지가 스스로 말하는 지금의 풀이다.
// 읽는 화면: #shop details.odds. i 표시를 누르면 em 하나가 열리고 그 안에 span 네 줄이 선다.
// 머리줄은 .head이고 그 아래가 등급 셋이며, 줄마다 i 등급 이름, b 확률, u 남은 수다.

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
/* 화면이 가르는 등급 셋. 표가 이 이름을 그대로 인쇄하므로 확률만이 아니라 이름까지 잰다.
   셋은 서로 안 겹치고 명단을 전부 덮는다. 겹치면 남은 수를 더한 값이 풀보다 커져,
   표를 읽는 사람이 같은 카드를 두 번 센다. 가르는 자리는 화면이 쓰는 ODDS_BANDS와 같다. */
const BANDS = [
  { name: "명성 10", at: (f) => f >= 10 },
  { name: "명성 9", at: (f) => f === 9 },
  { name: "명성 8 이하", at: (f) => f <= 8 }
];
const share = (pool) => {
  let tot = 0;
  for (const k of pool) tot += pullWeight(k);
  return BANDS.map((band) => {
    const list = pool.filter((k) => band.at(Number(k.fame) || 0));
    let w = 0;
    for (const k of list) w += pullWeight(k);
    return { name: band.name, at: band.at, pct: w / tot * 100, cnt: list.length };
  });
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

/* 축의 출처는 roster.mjs의 PULL_COST 주석이다. 무작위 한 장이 이름을 찍는 것보다 비싸면
   뽑을 이유가 사라진다고 그 주석이 선언한다. 견줄 대상은 명단 최저가가 아니라 지금 살 수 있는
   최저가다. 명단 맨 아래는 첫 진입이 모두에게 주는 시작 키퍼라 아무도 그 이름을 못 산다.
   그 한 명을 세면 이 자는 존재하지 않는 선택지와 뽑기를 견준다. 아래에서 풀을 읽은 뒤에 잰다. */
const roster = KEEPERS.map((k) => ({ name: k.name, cost: keeperCost(k) })).sort((a, b) => a.cost - b.cost);

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
  /* 견줄 최저가. 풀은 지금 안 가진 카드이고, 그 안의 최저가가 뽑기 대신 고를 수 있는 유일한
     대안이다. 대조군은 명단 맨 아래가 이미 손에 있다는 것이다. 그 사람이 안 팔린 채 남아 있으면
     첫 진입이 준 것을 이 표본이 못 받은 것이라, 아래 축은 사람이 겪는 판을 재지 않는다. */
  const buyable = pool.map((k) => ({ name: k.name, cost: keeperCost(k) })).sort((a, b) => a.cost - b.cost);
  const cheapest = buyable[0].name;
  const floor = buyable[0].cost;
  check("instrument:the-starter-is-already-in-hand", owned.has(roster[0].name),
    roster[0].name + " at " + roster[0].cost + ", owned " + [...owned].join(","));
  check("pull:cheaper-than-naming", PULL_COST < floor,
    PULL_COST + " sweat vs cheapest name a player can still buy " + floor + " (" + cheapest + ")");
  /* 확률과 남은 장수는 카드 본문이 아니라 눌러야 열리는 칸에 산다. 접힌 칸의 줄은 글자가
     안 칠해져 innerText가 비고, 안 열고 읽으면 화면에 수가 없는 것과 구분이 안 된다.
     사람이 여는 자리를 그대로 눌러 열고 읽는다. 계기가 다른 문으로 들어가면 그 뒤로는
     화면이 바뀌어도 계기만 옛 자리를 계속 읽는다. */
  const readOdds = () => p.evaluate(() => {
    const em = document.querySelector("#shop details.odds em");
    if (!em) return [];
    const txt = (s, sel) => { const e = s.querySelector(sel); return e ? e.textContent.trim() : ""; };
    /* 칠해진 줄만 센다. 상자로는 못 가른다. em이 position:absolute라 접힌 칸에서도 자리를
       잡아, 실측으로 접었을 때와 폈을 때의 줄 상자가 둘 다 224px으로 같았다. 갈리는 것은
       칠해졌는가이므로 checkVisibility로 묻고, 폭은 그 위에 얹어 0px으로 선 줄을 걸러 낸다. */
    return [...em.querySelectorAll("span")].filter((s) => {
      const box = s.getBoundingClientRect();
      return s.checkVisibility({ contentVisibilityAuto: true, opacityProperty: true, visibilityProperty: true })
        && box.width > 0 && box.height > 0;
    }).map((s) => ({ head: s.classList.contains("head"), name: txt(s, "i"), pct: txt(s, "b"), cnt: txt(s, "u") }));
  });
  const openOdds = async () => {
    await p.evaluate(() => {
      const d = document.querySelector("#shop details.odds");
      if (d) d.querySelector("summary").click();
    });
    // 표는 눌린 다음 프레임에 칠해진다. 누르자마자 재면 아직 안 칠해진 표를 읽는다.
    await p.waitForFunction(() => {
      const em = document.querySelector("#shop details.odds em");
      return Boolean(em) && em.checkVisibility({ contentVisibilityAuto: true, opacityProperty: true, visibilityProperty: true });
    }, null, { timeout: 5000 });
    const rows = await readOdds();
    return rows.filter((r) => !r.head);
  };
  const closed = await readOdds();
  const shown = await openOdds();
  // 대조군. 접힌 칸은 한 줄도 안 그려야 한다. 접어도 같은 수가 읽히면 이 자는 여는 문이
  // 있다는 것을 증명하지 못하고, 다음에 그 문이 사라져도 초록을 낸다.
  check("instrument:the-shut-panel-reads-empty", closed.length === 0, closed.length + " rows painted while shut");
  check("pull:the-odds-panel-opens-where-a-player-clicks", shown.length > 0,
    shown.map((r) => r.name + " " + r.pct + " " + r.cnt).join(" | ") || "no row drawn");

  // 정규식 대신 문자로 훑는다. 이 레포에서 게이트 소스의 역슬래시는 전송 단계에서 사라진 적이 있다.
  const num = (s) => {
    let cur = "";
    for (const ch of s) if ((ch >= "0" && ch <= "9") || ch === ".") cur += ch;
    return cur === "" ? -1 : Number(cur);
  };
  /* 남은 수는 이제 한 자리가 아니라 등급마다 한 칸이다. 세 칸을 더해야 풀이 되고, 한 칸이라도
     수가 아니면 화면이 그 등급을 안 말한 것이라 옛 자리를 읽던 때와 같은 -1로 떨어뜨린다. */
  const stock = (rows) => rows.every((r) => num(r.cnt) >= 0)
    ? rows.reduce((a, r) => a + num(r.cnt), 0) : -1;
  const cnt = stock(shown);
  check("pull:count-on-screen-matches-pool", cnt === pool.length,
    "screen " + cnt + " (" + shown.map((r) => r.cnt).join("+") + "), pool " + pool.length + ", owned " + st.squad.length);

  const want = share(pool);
  /* 세 줄을 전부 맞춘다. 두 줄만 보면 나머지 한 줄은 무슨 수를 적어도 초록이고, 화면이 등급을
     다시 가른 날 이 자가 조용히 지나간다. 0.05는 화면이 소수 첫째 자리에서 반올림한 폭이라
     그보다 넓히면 반올림이 아니라 다른 수를 통과시킨다. */
  const okPrint = shown.length === want.length
    && want.every((w, i) => shown[i].name === w.name && Math.abs(num(shown[i].pct) - w.pct) <= 0.05);
  check("pull:printed-odds-match-the-pool", okPrint,
    "screen " + shown.map((r) => r.name + " " + r.pct).join(" / ")
    + " want " + want.map((w) => w.name + " " + w.pct.toFixed(1) + "%").join(" / "));

  /* 대조군. 표의 남은 수 한 칸을 다른 수로 갈아 끼우면 위의 두 축이 읽는 합이 따라 움직여야 한다.
     안 움직이면 이 자는 화면이 아니라 제 안의 상수를 읽는 것이고, 표가 사라진 날에도 초록을 낸다.
     7은 등급 셋 중 어느 칸의 값과도 안 겹치게 고른 폭이다. 읽은 뒤 원래 글자를 돌려놓는다. */
  const planted = await p.evaluate(() => {
    const u = document.querySelector("#shop details.odds em span:not(.head) u");
    if (!u) return -1;
    const was = u.textContent;
    u.textContent = String(Number(was) + 7);
    const now = [...document.querySelectorAll("#shop details.odds em span:not(.head) u")]
      .reduce((a, e) => a + Number(e.textContent), 0);
    u.textContent = was;
    return now;
  });
  check("instrument:a-planted-number-moves-the-count", planted === cnt + 7, "planted " + planted + " against screen " + cnt);

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
  const after = await openOdds();
  const afterCnt = stock(after);
  check("pull:owned-leaves-the-pool", bought !== null && afterCnt === cnt - 1,
    "bought " + String(bought) + ", screen " + cnt + " -> " + afterCnt);

  // 인쇄된 수와 실제 뽑기 빈도는 다른 명제다. 같은 풀에서 실제로 뽑아 빈도를 센다.
  const M = 200000;
  const r2 = mul32(7);
  const hit = want.map(() => 0);
  for (let i = 0; i < M; i++) {
    const f = Number(pullFrom(pool, r2).fame) || 0;
    for (let j = 0; j < want.length; j++) if (want[j].at(f)) hit[j]++;
  }
  const sd = (q) => Math.sqrt(q / 100 * (1 - q / 100) / M) * 100;
  const z = want.map((w, j) => (hit[j] / M * 100 - w.pct) / sd(w.pct));
  check("pull:draws-match-the-printed-odds", z.every((v) => Math.abs(v) < 4),
    "z " + z.map((v) => v.toFixed(2)).join("/") + " at " + hit.map((h) => (h / M * 100).toFixed(2)).join("/"));

  // 대조군. 가중치를 버리고 고르게 뽑으면 같은 축이 크게 어긋나야 한다.
  const r3 = mul32(11);
  let u10 = 0;
  for (let i = 0; i < M; i++) { if (want[0].at(Number(pool[Math.floor(r3() * pool.length)].fame) || 0)) u10++; }
  const zc = (u10 / M * 100 - want[0].pct) / sd(want[0].pct);
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
