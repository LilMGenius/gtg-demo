import { chromium } from "playwright";

// 장비 상점 게이트. 여덟 선반이 실제로 팔리는가.
// 파운더가 연 상점에 게이트가 하나도 없었다. 선반은 그려졌지만 사고 나서 무엇이 변하는지 아무도 본 적이 없다.
// 살 수 있는 상태는 주입 훅(?preset=rich)으로 앞당긴다. 판정식도 가격표도 건드리지 않는다.
//
// 라벨은 문장이 아니라 명사구다. 버튼은 모자란다고 안 적고 값 자리에 언제나 원값을 적으며,
// 산 등급과 지난 등급은 두 낱말이 받는다. 그래서 이 자는 낱말이 아니라 수와 상태를 읽는다.
// 정가는 부자 표본의 산 버튼에서 얻고, 가난한 지갑의 죽은 버튼이 그 정가를 그대로 적는지 본다.
const EXE = process.env.LOCALAPPDATA + "/ms-playwright/chromium-1228/chrome-win64/chrome.exe";
const BASE = "http://127.0.0.1:10310/web/index.html";
// 한 선반의 등급 수. gear.mjs의 각 배열 길이다.
const RANKS = 4;
// 최상급 등급 번호. MAX_GRIP 등 여덟 상한이 모두 이 값이다.
const TOP = 3;
// 여덟 선반 최상급 총액. RICH_COIN 8000이 이걸 덮어야 한 판에 다 살 수 있다.
const TOP_TOTAL = 6810;
// 선반 정의. main.mjs의 SHELVES와 같은 순서, 같은 머리글이어야 한다.
const SHELVES = [
  { tab: 'glove', head: '장갑', field: 'grip' },
  { tab: 'boot', head: '축구화', field: 'studs' },
  { tab: 'kit', head: '유니폼', field: 'pads' },
  { tab: 'sock', head: '양말', field: 'socks' },
  { tab: 'frame', head: '골대', field: 'frame' },
  { tab: 'city', head: '동네', field: 'city' },
  { tab: 'hair', head: '헤어', field: 'hair' },
  { tab: 'ink', head: '타투', field: 'ink' }
];
// 지금 낀 등급과 지나온 등급의 이름표. 선반마다 달랐던 여덟 쌍이 이 두 낱말로 모였으므로
// 선반 표에 여덟 번 적지 않는다. 여덟 줄에 같은 값을 적으면 한 줄만 어긋나도 계기가 조용하다.
const WORN = '착용';
const PAST = '보유';
// 잉여 훈련 환전으로 들어오는 돈. MAXED_POINTS 5 × COIN_DRILL 24다.
// 지갑이 0이면 모자란 값과 정가가 같은 수라, 버튼이 어느 쪽을 적었는지 화면으로 못 가른다.
// 가장 싼 1등급이 140이므로 이 돈으로는 여전히 아무것도 못 사고, 대조군의 뜻은 안 바뀐다.
const GYM_COIN = 120;
// 화소를 재는 등급. 2등급 카드는 rack의 세 번째라 .card.gear:nth-child(2n) 기울기를 안 받는다.
// 기울어진 카드를 재면 상자 밖 여백이 두 상태에서 같은 색으로 들어와 다시 칠해진 비율을 깎는다.
const PAINT_RANK = 2;
// 화소가 달라졌다고 볼 채널 합 거리. 죽은 버튼 배경 #141a12과 산 버튼 배경 #2b3a22의 거리가 71이고,
// 안티에일리어싱 잔파동은 한 자리 수라 18은 그 사이다.
const PIXEL_DELTA = 18;
// 버튼 한 장에서 다시 칠해져야 하는 비율. 값 표기는 버튼 넓이의 16%뿐이라 숫자만 바뀌면
// 이 비율을 절대 못 넘는다. 실측 78.7%가 나오므로 절반은 그 아래, 글자만 바뀐 경우 위다.
const DEAD_REPAINT = 0.5;

const t = setTimeout(() => { console.log("WATCHDOG"); process.exit(1); }, 180000);
t.unref();

const fails = [], notes = [];
const check = (n, ok, d) => (ok ? notes : fails).push(n + " " + d);
const shot = process.argv[2];

let b;
try {
  b = await chromium.launch({ executablePath: EXE });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } });
  const p = await ctx.newPage();
  const errs = [];
  p.on("pageerror", (e) => errs.push(String(e)));
  p.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });

  // 상점에는 전용 여는 버튼이 없다. __shop(true)가 유일한 입구다.
  const boot = async (q) => {
    await p.goto(BASE + q, { waitUntil: "load" });
    await p.evaluate(() => localStorage.clear());
    await p.reload({ waitUntil: "load" });
    await p.waitForTimeout(1200);
    await p.click("#go", { force: true });
    await p.waitForTimeout(1400);
    await p.evaluate(() => window.__shop(true));
    await p.waitForTimeout(300);
  };

  // 탭을 누르면 renderShop이 그 자리에서 다시 그린다. 클릭과 읽기를 한 번에 한다.
  const shelf = (tab) => p.evaluate((k) => {
    document.querySelector('.tab[data-tab="' + k + '"]').click();
    const box = document.getElementById("shop");
    // 사람이 보는 자리만 센다. 상자가 없거나 꺼진 것은 화면에 없는 것이다.
    const lit = (e) => {
      if (!e || !e.getClientRects().length) return false;
      const s = getComputedStyle(e);
      return s.display !== "none" && s.visibility !== "hidden";
    };
    return {
      head: box.querySelector("h4").textContent,
      // 값을 그린 자리 수. 다 산 선반은 살 게 없다는 말을 값의 부재로 한다.
      prices: [...box.querySelectorAll('.rack .px[data-coin]')].filter(lit).length,
      // 값은 버튼이 들고 있는 데이터에서 읽는다. 그려진 글자에는 쉼표와 아이콘 이름이 섞인다.
      rows: [...box.querySelectorAll('.buy[data-rank]')].map((x) => {
        const c = x.querySelector('.px[data-coin]');
        return {
          rank: Number(x.dataset.rank),
          text: x.textContent.trim(),
          coin: c ? Number(c.dataset.coin) : null,
          // 데이터의 수와 사람이 읽는 숫자가 같은가. 천 단위 쉼표만 뺀다.
          shown: c ? c.textContent.replace(/[^0-9]/g, "") : "",
          lit: lit(x),
          off: x.disabled,
          // 붉은 값 표식. 부족은 이 표식과 죽은 버튼으로만 말한다.
          bad: x.classList.contains('bad-price')
        };
      })
    };
  }, tab);

  const buyTop = () => p.evaluate((r) => document.querySelector('.buy[data-rank="' + r + '"]').click(), TOP);

  // 같은 선반 같은 등급의 버튼을 두 상태에서 한 장씩 찍는다. 상자 크기가 같아야 겹쳐 잴 수 있다.
  const paintShot = async (tab) => {
    await p.click('#shop .tab[data-tab="' + tab + '"]', { force: true });
    await p.waitForTimeout(180);
    const one = p.locator('#shop .buy[data-rank="' + PAINT_RANK + '"]').first();
    return (await one.screenshot({ timeout: 8000 })).toString("base64");
  };

  // 두 장이 실제로 다르게 칠해졌는가. 디코딩은 페이지의 캔버스가 한다.
  const repaint = (a, c) => p.evaluate(([x, y, delta]) => {
    const load = (s) => new Promise((res) => {
      const im = new Image();
      im.onload = () => {
        const cv = document.createElement("canvas");
        cv.width = im.width; cv.height = im.height;
        const g = cv.getContext("2d");
        g.drawImage(im, 0, 0);
        res(g.getImageData(0, 0, im.width, im.height));
      };
      im.src = "data:image/png;base64," + s;
    });
    return Promise.all([load(x), load(y)]).then(([A, B]) => {
      if (A.width !== B.width || A.height !== B.height) return -1;
      let hit = 0, n = 0;
      for (let i = 0; i < A.data.length; i += 4) {
        n += 1;
        const d = Math.abs(A.data[i] - B.data[i]) + Math.abs(A.data[i + 1] - B.data[i + 1])
          + Math.abs(A.data[i + 2] - B.data[i + 2]);
        if (d >= delta) hit += 1;
      }
      return hit / n;
    });
  }, [a, c, PIXEL_DELTA]);

  /* 대조군. 주입이 없으면 지갑이 비어 최상급 칸은 죽어 있다.
     이게 없으면 본시험의 녹색은 버튼이 원래 늘 살아 있는 것과 구분되지 않는다.
     maxed는 훈련장의 잉여 훈련 환전 줄을 여는 데 쓴다. 그 줄이 이 대조군의 지갑을 0에서 띄운다. */
  await boot("?seed=20&preset=maxed,veteran");
  const emptyCoin = await p.evaluate(() => window.__wallet().coin);
  let poorTop = 0;
  for (const s of SHELVES) {
    const v = await shelf(s.tab);
    const top = v.rows.find((r) => r.rank === TOP);
    if (top && top.off) poorTop += 1;
  }
  check("control:top-rank-is-dead-on-a-fresh-wallet", poorTop === SHELVES.length, poorTop + "/" + SHELVES.length);
  const deadPaint = await paintShot(SHELVES[0].tab);

  /* 지갑을 조금 채운다. 주입이 아니라 사람이 도는 경로다. 남은 훈련을 환전하면 값이 들어오고,
     그 뒤에도 버튼이 적는 수가 안 내려가야 그 수가 모자란 값이 아니라 값이다. */
  await p.evaluate(() => window.__shop(false));
  await p.waitForTimeout(160);
  // 훈련장 문은 pointerdown으로 열린다. click()은 그 문을 안 건드리므로 창을 여는 훅으로 연다.
  await p.evaluate(() => window.__gym(true));
  await p.waitForTimeout(320);
  const swapped = await p.evaluate(() => {
    const sw = document.querySelector("#gym .swap");
    if (!sw) return "no swap row";
    if (sw.disabled) return "swap row is dead";
    sw.click();
    return "";
  });
  await p.waitForTimeout(200);
  await p.evaluate(() => window.__gym(false));
  await p.waitForTimeout(160);
  await p.evaluate(() => window.__shop(true));
  await p.waitForTimeout(300);
  const shortCoin = await p.evaluate(() => window.__wallet().coin);
  check("instrument:the-control-wallet-left-zero-through-the-gym",
    emptyCoin === 0 && shortCoin === GYM_COIN && !swapped,
    emptyCoin + " -> " + shortCoin + " want 0 -> " + GYM_COIN + (swapped ? ", " + swapped : ""));

  let poorSaid = 0;
  const short = {};
  for (const s of SHELVES) {
    const v = await shelf(s.tab);
    const top = v.rows.find((r) => r.rank === TOP);
    // 죽은 버튼이 수를 하나 들고 있고, 그 수가 화면에도 같은 숫자로 찍혀 있으며, 붉은 값 표식을 달고 있는가.
    if (top && top.off && top.bad && top.lit && top.coin > 0 && top.shown === String(top.coin)) poorSaid += 1;
    short[s.tab] = top ? top.coin : null;
  }

  // 본시험. 지갑만 앞당긴 저장에서 여덟 선반을 끝까지 산다.
  await boot("?seed=20&preset=rich,veteran");
  const applied = await p.evaluate(() => window.__preset);
  check("preset:rich-was-applied", Array.isArray(applied) && applied.includes("rich"), JSON.stringify(applied));

  const coin0 = await p.evaluate(() => window.__wallet().coin);
  const livePaint = await paintShot(SHELVES[0].tab);
  let shaped = 0, live = 0, paid = 0, worn = 0, past = 0, done = 0, open = 0;
  const price = {};
  for (const s of SHELVES) {
    const pre = await shelf(s.tab);
    if (pre.head === s.head && pre.rows.length === RANKS) shaped += 1;
    const top = pre.rows.find((r) => r.rank === TOP);
    if (top && !top.off) live += 1;
    paid += top ? top.coin : 0;
    price[s.tab] = top ? top.coin : null;
    // 아직 다 안 산 선반. 아래의 다 산 읽기가 여기서도 참이면 그 축은 아무것도 안 재는 것이다.
    if (pre.prices > 0 && pre.rows.some((r) => !r.off)) open += 1;
    await buyTop();
    await p.waitForTimeout(120);
    const post = await shelf(s.tab);
    const bought = post.rows.find((r) => r.rank === TOP);
    if (bought && bought.off && bought.lit && bought.text === WORN) worn += 1;
    const lower = post.rows.filter((r) => r.rank < TOP);
    if (lower.length === RANKS - 1 && lower.every((r) => r.off && r.lit && r.text === PAST)) past += 1;
    /* 다 산 선반은 살 게 없다는 말을 값의 부재로 한다. 랙 안에 값이 하나도 없고,
       네 줄이 전부 죽은 채 보이고, 최상급만 착용이고 나머지는 지나온 등급이다. */
    if (post.prices === 0 && post.rows.length === RANKS && post.rows.every((r) => r.off && r.lit)
      && bought && bought.text === WORN && lower.every((r) => r.text === PAST)) done += 1;
  }
  const coin1 = await p.evaluate(() => window.__wallet().coin);
  const gear = await p.evaluate(() => window.__gear());
  // 값 자리에는 언제나 원값이 선다. 부족은 붉은 값과 죽은 버튼이 말한다. 파운더 결정이고 be0cb4c가 제품을 그리로 옮겼다.
  const stated = SHELVES.filter((s) => price[s.tab] !== null && short[s.tab] === price[s.tab]).length;
  const drawn = await repaint(deadPaint, livePaint);

  check("shop:eight-shelves-render-four-ranks-under-their-own-head", shaped === SHELVES.length, shaped + "/" + SHELVES.length);
  check("buy:top-rank-is-live-on-every-shelf", live === SHELVES.length, live + "/" + SHELVES.length);
  check("buy:price-on-the-button-matches-the-declared-total", paid === TOP_TOTAL, paid + " want " + TOP_TOTAL);
  check("buy:wallet-drops-by-exactly-what-the-buttons-asked", coin0 - coin1 === paid, coin0 + "-" + paid + " -> " + coin1);
  check("buy:every-gear-field-rose-to-the-top-rank", SHELVES.every((s) => gear[s.field] === TOP), JSON.stringify(gear));
  check("control:a-dead-button-still-states-the-price", poorSaid === SHELVES.length && stated === SHELVES.length,
    poorSaid + "/" + SHELVES.length + " read on screen at " + GYM_COIN + ", " + stated + "/" + SHELVES.length + " equal the rich-wallet price");
  check("control:the-dead-button-is-drawn-dead-not-just-disabled", drawn >= DEAD_REPAINT,
    (drawn * 100).toFixed(1) + "% of the button repainted, want " + (DEAD_REPAINT * 100) + "%");
  check("after:bought-row-says-it-is-being-worn", worn === SHELVES.length, worn + "/" + SHELVES.length);
  check("after:lower-rows-say-they-are-past", past === SHELVES.length, past + "/" + SHELVES.length);
  check("after:filled-shelf-declares-nothing-left", done === SHELVES.length, done + "/" + SHELVES.length);
  check("control:an-unfinished-shelf-does-not-read-as-finished", open === SHELVES.length, open + "/" + SHELVES.length);

  if (shot) await p.screenshot({ path: shot });
  check("console:no-errors", errs.length === 0, errs.slice(0, 3).join(" | ") || "clean");

  console.log("표본 범위: 여덟 선반 × 네 등급, 지갑 세 상태(0 / " + GYM_COIN + " / " + coin0 + ")");
  console.log(notes.map((s) => "  ok   " + s).join("\n"));
  if (fails.length) console.log(fails.map((s) => "  FAIL " + s).join("\n"));
  console.log(fails.length ? "gear FAIL " + fails.length : "gear PASS " + notes.length);
  if (fails.length) process.exitCode = 1;
} finally {
  clearTimeout(t);
  if (b) await b.close();
}
