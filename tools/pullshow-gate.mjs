import { chromium } from "playwright";

// 개봉 연출의 자. 뽑은 열 장이 상점 카드 안 58x34 칩으로 1.3초에 스쳐 지나갔다.
// 이 장르에서 뽑는 순간은 결과 통보가 아니라 파는 물건 자체인데, 화면이 그것을 결과 통보로 다뤘다.
//
// 재는 것은 넷이다. 화면을 덮는가, 한 장씩 사람을 보여 주는가, 눌러서 건너뛸 수 있는가,
// 등급이 다르면 카드가 다른가. 대조군은 뽑기 전이다. 거기서 이 화면이 서 있으면
// 아래의 어떤 축도 뽑기가 만든 것이 아니다.
const EXE = process.env.LOCALAPPDATA + "/ms-playwright/chromium-1228/chrome-win64/chrome.exe";
const BASE = "http://127.0.0.1:10310/web/index.html?seed=20&preset=rich";
const LINE = String.fromCharCode(10);
const t = setTimeout(() => { console.log("WATCHDOG"); process.exit(1); }, 180000);
t.unref();

const fails = [], notes = [];
const check = (n, ok, d) => (ok ? notes : fails).push(n + " " + d);

let b;
try {
  b = await chromium.launch({ executablePath: EXE });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } });
  const p = await ctx.newPage();
  const errs = [];
  p.on("pageerror", (e) => errs.push(String(e)));
  p.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
  await p.goto(BASE, { waitUntil: "load" });
  await p.waitForSelector("#go", { timeout: 15000 });
  await p.click("#go", { force: true });
  await p.waitForTimeout(900);
  /* 처음 온 계정은 카드부터 연다. 그 흐름을 안 닫고 상점을 열면 이 자의 판정이
     첫 진입 개봉과 상점 개봉을 섞어 읽는다. 사람도 똑같이 닫고 나서 상점에 간다. */
  for (let i = 0; i < 6; i += 1) {
    if (await p.evaluate(() => document.getElementById("pull").hidden)) break;
    await p.click("#pull", { force: true });
    await p.waitForTimeout(350);
  }
  await p.evaluate(() => window.__shop(true));
  await p.waitForSelector("#shop .buy.pull", { timeout: 8000 });

  // 대조군. 아직 아무것도 안 뽑았으므로 개봉 화면은 없다.
  const before = await p.evaluate(() => document.getElementById("pull").hidden);
  check("control:the-reveal-is-absent-until-something-is-drawn", before === true, "hidden " + before);

  await p.locator("#shop .buy.pull").nth(1).click();
  await p.waitForSelector("#pull .now img", { timeout: 8000 });
  await p.waitForTimeout(420);

  const cover = await p.evaluate(() => {
    const r = document.getElementById("pull").getBoundingClientRect();
    const now = document.querySelector("#pull .now");
    const nr = now.getBoundingClientRect();
    const img = now.querySelector("img");
    return { w: r.width, h: r.height, vw: innerWidth, vh: innerHeight,
      cardH: nr.height, cards: document.querySelectorAll("#pull .now").length,
      // 그림이 실제 화소인지. src만 있고 못 굽는 경우와 갈린다.
      nat: img ? img.naturalWidth : 0, name: (now.querySelector("b") || {}).textContent || "" };
  });
  check("instrument:the-reveal-stands-with-one-card", cover.cards === 1 && cover.name.length > 0,
    cover.cards + " cards, name " + cover.name);
  check("pullshow:the-reveal-takes-the-whole-screen",
    cover.w >= cover.vw - 1 && cover.h >= cover.vh - 1, cover.w + "x" + cover.h + " of " + cover.vw + "x" + cover.vh);
  // 카드가 화면 높이의 3분의 1을 넘어야 상점 안 칩(34px)과 다른 물건으로 읽힌다.
  check("pullshow:the-card-is-big-enough-to-be-the-point",
    cover.cardH > cover.vh / 3, cover.cardH.toFixed(0) + "px of " + cover.vh);
  check("pullshow:the-card-carries-a-baked-portrait", cover.nat > 0, "natural width " + cover.nat);

  /* 등급 연출. 명성 9 이상이 올 때 판이 달라야 한다. 열 장을 도는 동안 희귀와 보통을 한 장씩
     잡아 카드 화소를 비교한다. 한 회차에 둘 다 안 나오면 비교할 것이 없으므로 그 사실을 적는다. */
  const shot = async () => (await p.locator("#pull .now").screenshot()).toString("base64");
  const mean = (s) => p.evaluate((x) => new Promise((res) => {
    const im = new Image();
    im.onload = () => {
      const cv = document.createElement("canvas");
      cv.width = im.width; cv.height = im.height;
      const g = cv.getContext("2d");
      g.drawImage(im, 0, 0);
      const d = g.getImageData(0, 0, im.width, im.height).data;
      let r = 0, gg = 0, bb = 0;
      for (let i = 0; i < d.length; i += 4) { r += d[i]; gg += d[i + 1]; bb += d[i + 2]; }
      const n = d.length / 4;
      res([r / n, gg / n, bb / n]);
    };
    im.src = "data:image/png;base64," + x;
  }), s);
  let rare = null, plain = null;
  for (let i = 0; i < 24; i += 1) {
    const st = await p.evaluate(() => ({ r: window.__reveal(), rare: Boolean(document.querySelector("#pull .now.rare")) }));
    if (st.rare && !rare) rare = await mean(await shot());
    if (!st.rare && !plain) plain = await mean(await shot());
    if (rare && plain) break;
    if (st.r.shown >= st.r.drawn) break;
    await p.waitForTimeout(340);
  }
  check("instrument:the-round-showed-both-a-rare-and-a-plain-card", Boolean(rare && plain),
    (rare ? "rare seen" : "no rare") + ", " + (plain ? "plain seen" : "no plain"));
  if (rare && plain) {
    // 금색 테두리와 바탕이 붙으므로 빨강과 초록 채널이 파랑보다 크게 벌어진다.
    const gap = Math.abs(rare[0] - plain[0]) + Math.abs(rare[1] - plain[1]) + Math.abs(rare[2] - plain[2]);
    check("pullshow:a-rare-card-does-not-look-like-a-plain-one", gap > 12,
      "channel gap " + gap.toFixed(1) + " over 12");
  }

  // 건너뛰기. 기다리는 것이 연출이지 벌은 아니다.
  await p.click("#pull");
  await p.waitForTimeout(260);
  const skipped = await p.evaluate(() => window.__reveal());
  check("pullshow:one-tap-opens-the-rest", skipped.shown === skipped.drawn,
    skipped.shown + " of " + skipped.drawn);
  const done = await p.evaluate(() => document.querySelectorAll("#pull .done i").length);
  check("pullshow:the-cards-already-opened-stay-on-screen", done === skipped.drawn - 1,
    done + " stacked of " + (skipped.drawn - 1));
  await p.click("#pull");
  await p.waitForTimeout(220);
  const closed = await p.evaluate(() => document.getElementById("pull").hidden);
  check("pullshow:the-next-tap-closes-it", closed === true, "hidden " + closed);
  check("console:no-errors", errs.length === 0, errs.slice(0, 2).join(" | ") || "clean");
  await ctx.close();

  if (notes.length) console.log(notes.map((x) => "  ok   " + x).join(LINE));
  if (fails.length) console.log(fails.map((x) => "  FAIL " + x).join(LINE));
  console.log(fails.length ? "pullshow FAIL " + fails.length : "pullshow PASS " + notes.length);
  if (fails.length) process.exitCode = 1;
} finally {
  clearTimeout(t);
  if (b) await b.close();
}
