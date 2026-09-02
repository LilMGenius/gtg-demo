import { chromium } from "playwright";
import { KEEPERS, keeperCost, PULL_COST, pullWeight, pullFrom } from "../src/roster.mjs";

// \uce74\ub4dc\uae61\uc740 \uc0c1\uc810\uc5d0\uc11c \uc720\uc77c\ud558\uac8c \uac12\uc744 \uc54c\uace0 \uc774\ub984\uc744 \ubaa8\ub974\ub294 \ucd95\uc778\ub370 \uc544\ubb34\ub3c4 \uc7ac\uc9c0 \uc54a\uc558\ub2e4.
// \ubf51\uae30\uac00 \uac12\ub2f9 \ubb34\uc5c7\uc744 \uc0ac\ub294\uc9c0, \ud654\uba74\uc774 \uc778\uc1c4\ud55c \ud655\ub960\uc774 \uc2e4\uc81c \ubf51\uae30 \ube48\ub3c4\uc640 \uac19\uc740\uc9c0,
// \uadf8\ub9ac\uace0 \uac12\ub9cc \uce58\ub974\uace0 \uc544\ubb34\uac83\ub3c4 \uc548 \uc8fc\ub294 \uacbd\ub85c\uac00 \uc5c6\ub294\uc9c0\ub97c \ud55c \uc790\ub9ac\uc5d0\uc11c \uc7b0\ub2e4.
// \ud45c\ubcf8 \ubc94\uc704: \uc774 \uac8c\uc774\ud2b8\ub294 \ud310\uc815\uc2dd\uc744 \ubd80\ub974\uc9c0 \uc54a\ub294\ub2e4. \ud45c\ubcf8\uc740 \ud0a4\ud37c\uc758 \uc2a4\ud0ef \ubc94\uc704\uac00 \uc544\ub2c8\ub77c
// \uba85\ub2e8 \uc804\uccb4\uc774\uace0, \ud654\uba74 \ucabd \ud45c\ubcf8\uc740 \ud398\uc774\uc9c0\uac00 \uc2a4\uc2a4\ub85c \ub9d0\ud558\ub294 \uc9c0\uae08\uc758 \ud480\uc774\ub2e4.

// \ubf51\uae30 \ube48\ub3c4\ub97c \uc7ac\ub824\uba74 \ub09c\uc218\uac00 \uacc4\uae30\uac00 \ub41c\ub2e4. \ucc98\uc74c\uc5d0 \uc798\ub77c \uc4f4 LCG\ub85c \uc7c0\ub354\ub2c8 \uac19\uc740 \ucd95\uc774
// 8\uc2dc\uadf8\ub9c8\ub85c \uc5b4\uae0b\ub0ac\uace0 \uc6d0\uc778\uc740 \ubf51\uae30\uac00 \uc544\ub2c8\ub77c \ub09c\uc218\uc600\ub2e4. \uc800\ud488\uc9c8 \ub09c\uc218\ub294 \uc0b0\ucd9c\ubb3c\uc758 \uacb0\ud568\ucc98\ub7fc \ubcf4\uc778\ub2e4.
const mul32 = (a) => () => {
  a |= 0; a = (a + 0x6D2B79F5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const EXE = process.env.LOCALAPPDATA + "/ms-playwright/chromium-1228/chrome-win64/chrome.exe";
const BASE = "http://127.0.0.1:10310/web/index.html?preset=rich";
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

// \uac00\uc911\uce58\uac00 0\uc778 \uce74\ub4dc\ub294 \uac12\uc744 \uc544\ubb34\ub9ac \uce58\ub7ec\ub3c4 \uc601\uc601 \uc548 \ub098\uc628\ub2e4. \uba85\ub2e8\uc5d0 \uc788\ub294\ub370 \ubabb \ubf51\ub294 \uce74\ub4dc\ub294
// \uc0c1\uc810\uc774 \ud30c\ub294 \ucc99\ub9cc \ud558\ub294 \uac83\uc774\ub2e4. fame 11\uc774\uba74 (11-f)^2\uc774 0\uc774 \ub418\ubbc0\ub85c \uadf8 \uc790\ub9ac\uac00 \ub300\uc870\uad70\uc774\ub2e4.
const dead = pullWeight({ fame: 11 });
check("instrument:reachability-control", dead === 0, "fame 11 weight " + dead);
const weights = KEEPERS.map(pullWeight);
const minW = Math.min(...weights);
check("pull:every-card-is-reachable", minW > 0, KEEPERS.length + " cards, min weight " + minW);

// \uac12\ub9cc \uae4e\uace0 \uc544\ubb34\uac83\ub3c4 \uc548 \uc8fc\ub294 \uacbd\ub85c\ub294 \ub9cc\ub819 \ud6c8\ub828 \ub370\ub4dc\ub77d\uacfc \uac19\uc740 \uacb0\ud568\uc774\ub2e4.
// \ube48 \ud480\uc774 null\uc744 \ub3cc\ub824\uc8fc\ub294 \uac83\ub9cc\uc73c\ub85c\ub294 \ubd80\uc871\ud558\uace0, \uc548 \ube48 \ud480\uc774 \uce74\ub4dc\ub97c \ub3cc\ub824\uc8fc\ub294 \uac83\uae4c\uc9c0 \ubd10\uc57c \ucd95\uc774\ub2e4.
const rng = mul32(20260903);
const empty = pullFrom([], rng);
const single = pullFrom([KEEPERS[0]], rng);
check("pull:empty-pool-refuses", empty === null && single === KEEPERS[0], "empty " + String(empty) + ", single " + (single && single.name));

// \ubf51\uc740 \uce74\ub4dc\uc758 \uc9c0\ubaa9 \uad6c\ub9e4\uac00\uac00 \ubf51\uae30 \uac12\ubcf4\ub2e4 \ub0ae\uc73c\uba74 \uce74\ub4dc\uae61\uc740 \uac12\uc744 \ud0dc\uc6b0\ub294 \ucc3d\uad6c\ub2e4.
const N = 40000;
let sum = 0;
for (let i = 0; i < N; i++) sum += keeperCost(pullFrom(KEEPERS, rng));
const mean = sum / N;
check("pull:buys-more-than-it-costs", mean >= PULL_COST, mean.toFixed(0) + " value per " + PULL_COST + " sweat, x" + (mean / PULL_COST).toFixed(2));

// \ucd95\uc758 \ucd9c\ucc98\ub294 roster.mjs\uc758 PULL_COST \uc8fc\uc11d\uc774\ub2e4. \ubb34\uc791\uc704 \ud55c \uc7a5\uc774 \uc774\ub984\uc744 \ucc0d\ub294 \uac83\ubcf4\ub2e4 \ube44\uc2f8\uba74
// \ubf51\uc744 \uc774\uc720\uac00 \uc0ac\ub77c\uc9c4\ub2e4\uace0 \uadf8 \uc8fc\uc11d\uc774 \uc120\uc5b8\ud558\uace0, \uadf8 \uac12\uc744 \uba85\ub2e8 \ucd5c\uc800\uac00 \uc544\ub798\uc5d0 \ub450\uc5c8\ub2e4\uace0 \uc801\ud600 \uc788\ub2e4.
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

  // \ud480\uc740 \uba85\ub2e8\uc774 \uc544\ub2c8\ub77c \uc9c0\uae08 \uc548 \uac00\uc9c4 \uce74\ub4dc\ub2e4. \uba85\ub2e8\uc73c\ub85c \uc7ac\uba74 \ubcf4\uc720\ubd84\ub9cc\ud07c \ud654\uba74\uacfc \uc5b4\uae0b\ub09c\ub2e4.
  const st = await p.evaluate(() => window.__squad());
  const owned = new Set(st.squad);
  const pool = KEEPERS.filter((k) => !owned.has(k.name));
  const shown = await p.evaluate(() => {
    const e = document.querySelector("#shop .card em");
    return e ? e.innerText : "";
  });

  // \uc815\uaddc\uc2dd \ub300\uc2e0 \ubb38\uc790\ub85c \ud6d1\ub294\ub2e4. \uc774 \ub808\ud3ec\uc5d0\uc11c \uac8c\uc774\ud2b8 \uc18c\uc2a4\uc758 \uc5ed\uc2ac\ub798\uc2dc\ub294 \uc804\uc1a1 \ub2e8\uacc4\uc5d0\uc11c \uc0ac\ub77c\uc9c4 \uc801\uc774 \uc788\ub2e4.
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
  const after = parse(await p.evaluate(() => {
    const e = document.querySelector("#shop .card em");
    return e ? e.innerText : "";
  }));
  check("pull:owned-leaves-the-pool", bought !== null && after.cnt === cnt - 1, "bought " + String(bought) + ", screen " + cnt + " -> " + after.cnt);

  // \uc778\uc1c4\ub41c \uc218\uc640 \uc2e4\uc81c \ubf51\uae30 \ube48\ub3c4\ub294 \ub2e4\ub978 \uba85\uc81c\ub2e4. \uac19\uc740 \ud480\uc5d0\uc11c \uc2e4\uc81c\ub85c \ubf51\uc544 \ube48\ub3c4\ub97c \uc13c\ub2e4.
  const M = 200000;
  const r2 = mul32(7);
  let h10 = 0, h9 = 0;
  for (let i = 0; i < M; i++) { const k = pullFrom(pool, r2); if (k.fame >= 10) h10++; if (k.fame >= 9) h9++; }
  const sd = (q) => Math.sqrt(q / 100 * (1 - q / 100) / M) * 100;
  const z10 = (h10 / M * 100 - want.top) / sd(want.top);
  const z9 = (h9 / M * 100 - want.high) / sd(want.high);
  check("pull:draws-match-the-printed-odds", Math.abs(z10) < 4 && Math.abs(z9) < 4, "z " + z10.toFixed(2) + "/" + z9.toFixed(2) + " at " + (h10 / M * 100).toFixed(2) + "/" + (h9 / M * 100).toFixed(2));

  // \ub300\uc870\uad70. \uac00\uc911\uce58\ub97c \ubc84\ub9ac\uace0 \uace0\ub974\uac8c \ubf51\uc73c\uba74 \uac19\uc740 \ucd95\uc774 \ud06c\uac8c \uc5b4\uae0b\ub098\uc57c \ud55c\ub2e4.
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
