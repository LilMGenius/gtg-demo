import { chromium } from "playwright";

// \uc7a5\ube44 \uc0c1\uc810 \uac8c\uc774\ud2b8. \uc5ec\ub35f \uc120\ubc18\uc774 \uc2e4\uc81c\ub85c \ud314\ub9ac\ub294\uac00.
// \ud30c\uc6b4\ub354\uac00 \uc5f0 \uc0c1\uc810\uc5d0 \uac8c\uc774\ud2b8\uac00 \ud558\ub098\ub3c4 \uc5c6\uc5c8\ub2e4. \uc120\ubc18\uc740 \uadf8\ub824\uc84c\uc9c0\ub9cc \uc0ac\uace0 \ub098\uc11c \ubb34\uc5c7\uc774 \ubcc0\ud558\ub294\uc9c0 \uc544\ubb34\ub3c4 \ubcf8 \uc801\uc774 \uc5c6\ub2e4.
// \uc0b4 \uc218 \uc788\ub294 \uc0c1\ud0dc\ub294 \uc8fc\uc785 \ud6c5(?preset=rich)\uc73c\ub85c \uc55e\ub2f9\uae34\ub2e4. \ud310\uc815\uc2dd\ub3c4 \uac00\uaca9\ud45c\ub3c4 \uac74\ub4dc\ub9ac\uc9c0 \uc54a\ub294\ub2e4.
const EXE = process.env.LOCALAPPDATA + "/ms-playwright/chromium-1228/chrome-win64/chrome.exe";
const BASE = "http://127.0.0.1:10310/web/index.html";
// \ud55c \uc120\ubc18\uc758 \ub4f1\uae09 \uc218. gear.mjs\uc758 \uac01 \ubc30\uc5f4 \uae38\uc774\ub2e4.
const RANKS = 4;
// \ucd5c\uc0c1\uae09 \ub4f1\uae09 \ubc88\ud638. MAX_GRIP \ub4f1 \uc5ec\ub35f \uc0c1\ud55c\uc774 \ubaa8\ub450 \uc774 \uac12\uc774\ub2e4.
const TOP = 3;
// \uc5ec\ub35f \uc120\ubc18 \ucd5c\uc0c1\uae09 \ucd1d\uc561. RICH_COIN 8000\uc774 \uc774\uac78 \ub36e\uc5b4\uc57c \ud55c \ud310\uc5d0 \ub2e4 \uc0b4 \uc218 \uc788\ub2e4.
const TOP_TOTAL = 6810;
// \uc120\ubc18 \uc815\uc758. main.mjs\uc758 SHELVES\uc640 \uac19\uc740 \uc21c\uc11c, \uac19\uc740 \ubb38\uad6c\uc5ec\uc57c \ud55c\ub2e4.
const SHELVES = [
  { tab: 'glove', head: '\uc7a5\uac11', field: 'grip', worn: '\ub07c\ub294 \uc911', past: '\uc9c0\ub09c \uc7a5\uac11' },
  { tab: 'boot', head: '\ucd95\uad6c\ud654', field: 'studs', worn: '\uc2e0\ub294 \uc911', past: '\uc9c0\ub09c \ucd95\uad6c\ud654' },
  { tab: 'kit', head: '\uc720\ub2c8\ud3fc', field: 'pads', worn: '\uc785\ub294 \uc911', past: '\uc9c0\ub09c \uc720\ub2c8\ud3fc' },
  { tab: 'sock', head: '\uc591\ub9d0', field: 'socks', worn: '\uc2e0\ub294 \uc911', past: '\uc9c0\ub09c \uc591\ub9d0' },
  { tab: 'frame', head: '\uace8\ub300', field: 'frame', worn: '\uc4f0\ub294 \uc911', past: '\uc9c0\ub09c \uace8\ub300' },
  { tab: 'city', head: '\ub3d9\ub124', field: 'city', worn: '\ub6f0\ub294 \uc911', past: '\uc9c0\ub09c \ub3d9\ub124' },
  { tab: 'hair', head: '\uba38\ub9ac', field: 'hair', worn: '\uc790\ub978 \uba38\ub9ac', past: '\uc9c0\ub09c \uba38\ub9ac' },
  { tab: 'ink', head: '\ud0c0\ud22c', field: 'ink', worn: '\uc0c8\uae34 \uac83', past: '\uc9c0\uc6b4 \ud0c0\ud22c' }
];

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

  // \uc0c1\uc810\uc5d0\ub294 \uc804\uc6a9 \uc5ec\ub294 \ubc84\ud2bc\uc774 \uc5c6\ub2e4. __shop(true)\uac00 \uc720\uc77c\ud55c \uc785\uad6c\ub2e4.
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

  // \ud0ed\uc744 \ub204\ub974\uba74 renderShop\uc774 \uadf8 \uc790\ub9ac\uc5d0\uc11c \ub2e4\uc2dc \uadf8\ub9b0\ub2e4. \ud074\ub9ad\uacfc \uc77d\uae30\ub97c \ud55c \ubc88\uc5d0 \ud55c\ub2e4.
  const shelf = (tab) => p.evaluate((k) => {
    document.querySelector('.tab[data-tab="' + k + '"]').click();
    const box = document.getElementById("shop");
    const got = box.querySelector('.got');
    return {
      head: box.querySelector("h4").textContent,
      rows: [...box.querySelectorAll('.buy[data-rank]')].map((x) => ({ rank: Number(x.dataset.rank), text: x.textContent, off: x.disabled })),
      got: got ? got.textContent : null
    };
  }, tab);

  const buyTop = () => p.evaluate((r) => document.querySelector('.buy[data-rank="' + r + '"]').click(), TOP);

  // \ub300\uc870\uad70. \uc8fc\uc785\uc774 \uc5c6\uc73c\uba74 \uc9c0\uac11\uc774 \ube44\uc5b4 \ucd5c\uc0c1\uae09 \uce78\uc740 \uc0ac\uc720\ub97c \uc801\uc740 \ucc44 \uc8fd\uc5b4 \uc788\ub2e4.
  // \uc774\uac8c \uc5c6\uc73c\uba74 \ubcf8\uc2dc\ud5d8\uc758 \ub179\uc0c9\uc740 \ubc84\ud2bc\uc774 \uc6d0\ub798 \ub298 \uc0b4\uc544 \uc788\ub294 \uac83\uacfc \uad6c\ubd84\ub418\uc9c0 \uc54a\ub294\ub2e4.
  await boot("?seed=20");
  let poorTop = 0, poorSaid = 0;
  for (const s of SHELVES) {
    const v = await shelf(s.tab);
    const top = v.rows.find((r) => r.rank === TOP);
    if (top && top.off) poorTop += 1;
    if (top && top.text.includes('\ubaa8\uc790\ub77c\ub2e4')) poorSaid += 1;
  }
  check("control:top-rank-is-dead-on-a-fresh-wallet", poorTop === SHELVES.length, poorTop + "/" + SHELVES.length);
  check("control:dead-button-states-the-shortfall", poorSaid === SHELVES.length, poorSaid + "/" + SHELVES.length);

  // \ubcf8\uc2dc\ud5d8. \uc9c0\uac11\ub9cc \uc55e\ub2f9\uae34 \uc800\uc7a5\uc5d0\uc11c \uc5ec\ub35f \uc120\ubc18\uc744 \ub05d\uae4c\uc9c0 \uc0b0\ub2e4.
  await boot("?seed=20&preset=rich");
  const applied = await p.evaluate(() => window.__preset);
  check("preset:rich-was-applied", Array.isArray(applied) && applied.includes("rich"), JSON.stringify(applied));

  const coin0 = await p.evaluate(() => window.__wallet().coin);
  let shaped = 0, live = 0, paid = 0, worn = 0, past = 0, done = 0;
  for (const s of SHELVES) {
    const pre = await shelf(s.tab);
    if (pre.head === s.head && pre.rows.length === RANKS) shaped += 1;
    const top = pre.rows.find((r) => r.rank === TOP);
    if (top && !top.off) live += 1;
    paid += top ? parseInt(top.text, 10) : 0;
    await buyTop();
    await p.waitForTimeout(120);
    const post = await shelf(s.tab);
    const bought = post.rows.find((r) => r.rank === TOP);
    if (bought && bought.off && bought.text === s.worn) worn += 1;
    if (post.rows.filter((r) => r.rank < TOP).every((r) => r.off && r.text === s.past)) past += 1;
    if (post.got && post.got.includes('\ub354 \uc0b4 \uac8c \uc5c6\ub2e4')) done += 1;
  }
  const coin1 = await p.evaluate(() => window.__wallet().coin);
  const gear = await p.evaluate(() => window.__gear());

  check("shop:eight-shelves-render-four-ranks-under-their-own-head", shaped === SHELVES.length, shaped + "/" + SHELVES.length);
  check("buy:top-rank-is-live-on-every-shelf", live === SHELVES.length, live + "/" + SHELVES.length);
  check("buy:price-on-the-button-matches-the-declared-total", paid === TOP_TOTAL, paid + " want " + TOP_TOTAL);
  check("buy:wallet-drops-by-exactly-what-the-buttons-asked", coin0 - coin1 === paid, coin0 + "-" + paid + " -> " + coin1);
  check("buy:every-gear-field-rose-to-the-top-rank", SHELVES.every((s) => gear[s.field] === TOP), JSON.stringify(gear));
  check("after:bought-row-says-it-is-being-worn", worn === SHELVES.length, worn + "/" + SHELVES.length);
  check("after:lower-rows-say-they-are-past", past === SHELVES.length, past + "/" + SHELVES.length);
  check("after:filled-shelf-declares-nothing-left", done === SHELVES.length, done + "/" + SHELVES.length);

  if (shot) await p.screenshot({ path: shot });
  check("console:no-errors", errs.length === 0, errs.slice(0, 3).join(" | ") || "clean");

  console.log(notes.map((s) => "  ok   " + s).join("\n"));
  if (fails.length) console.log(fails.map((s) => "  FAIL " + s).join("\n"));
  console.log(fails.length ? "gear FAIL " + fails.length : "gear PASS");
  if (fails.length) process.exitCode = 1;
} finally {
  clearTimeout(t);
  if (b) await b.close();
}

