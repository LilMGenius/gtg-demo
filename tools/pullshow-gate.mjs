import { chromium } from "playwright";

/* 개봉 연출의 자. 뽑은 열 장이 상점 카드 안 58x34 칩으로 1.3초에 스쳐 지나갔고, 그 다음 판은
   한 장을 한 번에 뒤집어 등급과 얼굴과 이름과 능력치가 같은 프레임에 왔다. 이 장르에서 뽑는 순간은
   결과 통보가 아니라 파는 물건 자체인데, 화면이 그것을 한 번에 다 털어놓았다.

   재는 것은 아홉이다. 화면을 덮는가, 한 장씩 사람을 보여 주는가, 눌러서 건너뛸 수 있는가,
   등급이 다르면 카드가 다른가, 다섯 단을 순서대로 밟는가, 등급 단이 명성 9 이상에서 길어지는가,
   봉인 단에 얼굴이 없는가, 실루엣 단에 색이 없는가, 확률 표가 개봉 화면 밖 물음표 아래에 있는가.
   대조군은 뽑기 전이다. 거기서 이 화면이 서 있으면 아래의 어떤 축도 뽑기가 만든 것이 아니다.

   단은 속성이 아니라 화소로 판정한다. data-stage가 붙어 있다는 것과 사람이 봉인된 카드를 봤다는 것은
   다른 말이라, 단마다 카드를 한 장씩 찍어 색과 밝기와 화소 차이를 잰다. 찍기 전에 그 단이 이미
   서 있었는지를 묻고 찍은 뒤에 아직 같은 단인지를 다시 묻는다. 두 물음이 갈리면 그 화소는 두 단의
   섞임이므로 버린다. */
const EXE = process.env.LOCALAPPDATA + "/ms-playwright/chromium-1228/chrome-win64/chrome.exe";
const BASE = "http://127.0.0.1:10310/web/index.html?seed=20&preset=rich,veteran";
const LINE = String.fromCharCode(10);
// 다섯 단. 0 봉인, 1 등급 신호, 2 실루엣, 3 이름과 초상, 4 스탯 다섯 줄이다.
const STAGES = 5;
// 마지막 단에 서는 능력치 줄 수. 키퍼든 키커든 다섯이다.
const STAT_ROWS = 5;
/* 등급 단이 명성 9 이상에서 몇 배로 서야 하는가. 화면은 1.2초 대 0.4초라 실제 비가 3이고,
   자는 그 절반인 2를 문턱으로 둔다. 두 배 아래로 내려가면 길어진 빛이 신호가 아니라 지연으로 읽힌다. */
const RARE_RATIO = 2;
/* 단이 바뀐 뒤 이만큼 지나야 전환(0.16~0.22초)이 끝난 화소다. 가장 짧은 봉인 단이 0.3초라
   이 문턱 뒤에도 한 장을 찍을 창이 0.12초 남는다. */
const SETTLE_MS = 180;
// 화소가 다르다고 부를 채널 차이. 안티에일리어싱 잔파동은 이보다 훨씬 작다.
const PIXEL_TOL = 24;
// 봉인 단과 열린 단이 다른 그림이라고 부를 최소 면적. 카드의 4분의 1이다.
const FACE_AREA = 0.25;
// 실루엣 단의 채도 상한. 열린 단의 이 비율을 넘으면 색이 빠진 것이 아니다.
const GREY_RATIO = 0.4;
const t = setTimeout(() => { console.log("WATCHDOG"); process.exit(1); }, 180000);
t.unref();

const fails = [], notes = [];
const check = (n, ok, d) => (ok ? notes : fails).push(n + " " + d);
const top = (list) => list.reduce((a, x) => (x > a ? x : a), 0);
const low = (list) => list.reduce((a, x) => (x < a ? x : a), list[0]);

let b;
try {
  b = await chromium.launch({ executablePath: EXE });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } });
  const p = await ctx.newPage();
  const errs = [];
  p.on("pageerror", (e) => errs.push(String(e)));
  p.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });

  // 카드 한 장의 평균 색과 채도. 채도는 채널 최대와 최소의 차라 회색은 0에 붙는다.
  const tone = (png) => p.evaluate((s) => new Promise((res) => {
    const im = new Image();
    im.onload = () => {
      const cv = document.createElement("canvas");
      cv.width = im.width; cv.height = im.height;
      const g = cv.getContext("2d");
      g.drawImage(im, 0, 0);
      const d = g.getImageData(0, 0, im.width, im.height).data;
      let r = 0, gg = 0, bb = 0, sat = 0;
      for (let i = 0; i < d.length; i += 4) {
        r += d[i]; gg += d[i + 1]; bb += d[i + 2];
        sat += Math.max(d[i], d[i + 1], d[i + 2]) - Math.min(d[i], d[i + 1], d[i + 2]);
      }
      const n = d.length / 4;
      res({ r: r / n, g: gg / n, b: bb / n, sat: sat / n, lum: (r * 0.2126 + gg * 0.7152 + bb * 0.0722) / n });
    };
    im.src = "data:image/png;base64," + s;
  }), png);

  // 두 장이 다른 화소의 비율. 같은 카드의 두 단을 맞대므로 상자 크기는 같다.
  const apart = (a, c) => p.evaluate(([x, y, tol]) => new Promise((res) => {
    const load = (s) => new Promise((ok) => { const im = new Image(); im.onload = () => ok(im); im.src = "data:image/png;base64," + s; });
    Promise.all([load(x), load(y)]).then(([A, B]) => {
      if (A.width !== B.width || A.height !== B.height) return res(-1);
      const cv = document.createElement("canvas");
      cv.width = A.width; cv.height = A.height;
      const g = cv.getContext("2d");
      g.drawImage(A, 0, 0);
      const da = g.getImageData(0, 0, A.width, A.height).data;
      g.clearRect(0, 0, A.width, A.height);
      g.drawImage(B, 0, 0);
      const db = g.getImageData(0, 0, A.width, A.height).data;
      let hit = 0;
      for (let i = 0; i < da.length; i += 4) {
        if (Math.abs(da[i] - db[i]) >= tol || Math.abs(da[i + 1] - db[i + 1]) >= tol
          || Math.abs(da[i + 2] - db[i + 2]) >= tol) hit += 1;
      }
      res(hit / (da.length / 4));
    });
  }), [a, c, PIXEL_TOL]);

  // 지금 서 있는 카드가 어느 단에 있고 무엇을 들고 있는가. 걷는 동안 이 한 판독만 쓴다.
  const read = () => p.evaluate(() => {
    const box = document.getElementById("pull");
    const r = window.__reveal();
    const now = box.querySelector(".now");
    if (!now) return { card: r.shown, drawn: r.drawn, stage: -1, rare: false, name: "", rows: 0, beam: null };
    const beam = now.querySelector(".beam");
    const anims = beam && beam.getAnimations ? beam.getAnimations() : [];
    const dur = anims.length ? Number(anims[0].effect.getTiming().duration) : null;
    const rows = [...now.querySelectorAll(".stats > span")].filter((e) => e.getClientRects().length).length;
    return { card: r.shown, drawn: r.drawn,
      stage: now.dataset.stage === undefined ? -1 : Number(now.dataset.stage),
      rare: now.classList.contains("rare"), name: (now.querySelector("b") || {}).textContent || "",
      rows: rows, beam: Number.isFinite(dur) ? dur : null };
  });

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

  /* 확률과 남은 카드. 사는 자리가 아니라 확인하는 자리라, 개봉 화면이 아니라 이적시장 선반의
     표시 하나 아래에 접혀 있어야 한다. 접힌 것과 없는 것은 다르므로 눌러서 표까지 확인한다. */
  const readOdds = () => p.evaluate(() => {
    const det = document.querySelector("#shop .odds");
    const buys = document.querySelector("#shop .buys");
    if (!det) return null;
    const sum = det.querySelector("summary");
    const em = det.querySelector("em");
    const vis = (node) => {
      let s = "";
      for (const c of node.childNodes) {
        if (c.nodeType === 3) { s += c.nodeValue; continue; }
        if (c.nodeType !== 1) continue;
        if (c.namespaceURI !== "http://www.w3.org/1999/xhtml") continue;
        if (getComputedStyle(c).display === "none") continue;
        s += vis(c);
      }
      return s;
    };
    const rows = em ? [...em.children].filter((e) => e.getClientRects().length)
      .map((e) => [...e.children].map((c) => c.textContent.trim())) : [];
    const panel = em ? em.getBoundingClientRect() : null;
    const bar = buys ? buys.getBoundingClientRect() : null;
    return { open: det.open, face: sum ? vis(sum).trim() : "", label: sum ? (sum.getAttribute("aria-label") || "") : "",
      rows: rows, buysTop: bar ? bar.top : null,
      over: Boolean(det.open && panel && bar && panel.height > 0 && panel.bottom > bar.top
        && panel.right > bar.left && panel.left < bar.right) };
  });
  const shut = await readOdds();
  check("instrument:the-market-shelf-carries-an-odds-control", Boolean(shut), shut ? "found" : "no #shop .odds");
  if (shut) {
    await p.click("#shop .odds summary", { force: true });
    await p.waitForTimeout(220);
    const open = await readOdds();
    const head = open.rows.length ? open.rows[0] : [];
    const body = open.rows.slice(1);
    check("pullshow:the-odds-hide-behind-one-mark-on-the-market-tab",
      shut.open === false && shut.face.length <= 1 && shut.label.length > 0 && open.open === true,
      "shut " + shut.open + ", face " + JSON.stringify(shut.face) + ", label " + JSON.stringify(shut.label)
      + ", opened " + open.open);
    check("pullshow:the-odds-are-a-table-of-grade-and-chance-and-stock",
      head.length === 3 && body.length >= 2
      && body.every((r) => r.length === 3 && /%$/.test(r[1]) && /^[0-9]+$/.test(r[2])),
      (open.rows.length ? open.rows.map((r) => r.join(" | ")).join(" / ") : "no rows"));
    check("pullshow:the-odds-panel-floats-over-the-shelf",
      open.over === true && shut.buysTop !== null && Math.abs(open.buysTop - shut.buysTop) <= 1,
      "overlap " + open.over + ", buys top " + shut.buysTop + " to " + open.buysTop);
    await p.click("#shop .odds summary", { force: true });
    await p.waitForTimeout(160);
  }

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
      nat: img ? img.naturalWidth : 0, name: (now.querySelector("b") || {}).textContent || "",
      // 확률은 이 화면에 없어야 한다. 사는 자리도 확인하는 자리도 아니기 때문이다.
      pct: (document.getElementById("pull").textContent || "").indexOf("%") >= 0,
      odds: document.querySelectorAll("#pull .odds").length };
  });
  check("instrument:the-reveal-stands-with-one-card", cover.cards === 1 && cover.name.length > 0,
    cover.cards + " cards, name " + cover.name);
  check("pullshow:the-reveal-takes-the-whole-screen",
    cover.w >= cover.vw - 1 && cover.h >= cover.vh - 1, cover.w + "x" + cover.h + " of " + cover.vw + "x" + cover.vh);
  // 카드가 화면 높이의 3분의 1을 넘어야 상점 안 칩(34px)과 다른 물건으로 읽힌다.
  check("pullshow:the-card-is-big-enough-to-be-the-point",
    cover.cardH > cover.vh / 3, cover.cardH.toFixed(0) + "px of " + cover.vh);
  check("pullshow:the-card-carries-a-baked-portrait", cover.nat > 0, "natural width " + cover.nat);
  check("pullshow:the-odds-table-is-not-in-the-reveal", cover.pct === false && cover.odds === 0,
    "percent on screen " + cover.pct + ", odds nodes " + cover.odds);

  /* 다섯 단을 걷는다. 카드마다 밟은 단의 순서와, 등급 단에 걸린 애니메이션 길이와,
     마지막 단의 능력치 줄 수를 적고, 봉인과 실루엣과 열린 단의 화소를 한 장씩 남긴다.
     마지막 두 장은 안 연 채로 끊는다. 걷다가 다 열어 버리면 아래 탭 축이 잴 것이 없다. */
  const card = p.locator("#pull .now");
  const WANT = [0, 2, 4];
  const seen = new Map();
  let mark = { card: -1, stage: -2, at: 0 };
  const stop = Date.now() + 60000;
  const bags = () => [...seen.entries()].map(([n, v]) => Object.assign({ n: n }, v));
  const enough = () => {
    const all = bags();
    return all.filter((c) => c.order.join(",") === "0,1,2,3,4").length >= 2
      && all.some((c) => c.f[0] && c.f[4]) && all.some((c) => !c.rare && c.f[2] && c.f[4])
      && all.some((c) => c.rare && c.f[4]) && all.some((c) => !c.rare && c.f[4])
      && all.some((c) => c.rare && c.beam.length) && all.some((c) => !c.rare && c.beam.length)
      && all.some((c) => c.rows[3] !== undefined && c.rows[4] !== undefined);
  };
  while (Date.now() < stop) {
    const st = await read();
    if (!st.drawn) break;
    let bag = seen.get(st.card);
    if (!bag) { bag = { rare: st.rare, name: st.name, order: [], f: {}, rows: {}, beam: [] }; seen.set(st.card, bag); }
    if (st.card !== mark.card || st.stage !== mark.stage) {
      mark = { card: st.card, stage: st.stage, at: Date.now() };
      bag.order.push(st.stage);
    }
    bag.rows[st.stage] = Math.max(bag.rows[st.stage] || 0, st.rows);
    if (st.beam !== null && bag.beam.indexOf(st.beam) < 0) bag.beam.push(st.beam);
    if (WANT.indexOf(st.stage) >= 0 && bag.f[st.stage] === undefined && Date.now() - mark.at >= SETTLE_MS) {
      let png = null;
      try { png = (await card.screenshot()).toString("base64"); } catch (e) { png = null; }
      const after = await read();
      if (png && after.card === st.card && after.stage === st.stage) {
        bag.f[st.stage] = png;
        bag.rows[st.stage] = Math.max(bag.rows[st.stage] || 0, after.rows);
      }
    }
    if (enough() || st.card >= st.drawn - 2) break;
    await p.waitForTimeout(25);
  }
  const cards = bags();
  const full = cards.filter((c) => c.order[0] === 0);
  const walked = full.filter((c) => c.order.join(",") === "0,1,2,3,4");
  check("instrument:the-walk-caught-whole-ladders", full.length >= 2,
    full.length + " cards seen from their first stage over " + cards.length + " cards");
  check("pullshow:the-opening-walks-five-stages-in-order",
    full.length >= 2 && walked.length === full.length,
    walked.length + "/" + full.length + " walked 0,1,2,3,4; first other "
    + (full.find((c) => c.order.join(",") !== "0,1,2,3,4") || { order: [] }).order.join(","));

  const rareBeam = cards.filter((c) => c.rare && c.beam.length).map((c) => top(c.beam));
  const plainBeam = cards.filter((c) => !c.rare && c.beam.length).map((c) => top(c.beam));
  check("instrument:both-a-rare-and-a-plain-grade-stage-were-timed",
    rareBeam.length > 0 && plainBeam.length > 0,
    rareBeam.length + " rare, " + plainBeam.length + " plain");
  if (rareBeam.length && plainBeam.length) {
    check("pullshow:a-rare-card-holds-the-grade-stage-longer",
      low(rareBeam) >= top(plainBeam) * RARE_RATIO,
      "rare " + low(rareBeam) + "ms, plain " + top(plainBeam) + "ms, ratio "
      + (low(rareBeam) / top(plainBeam)).toFixed(2));
  }

  const sealed = cards.find((c) => c.f[0] && c.f[4]);
  check("instrument:one-card-was-caught-both-sealed-and-open", Boolean(sealed),
    sealed ? sealed.name : "no card yielded stage 0 and stage 4");
  if (sealed) {
    const gap = await apart(sealed.f[0], sealed.f[4]);
    check("pullshow:the-sealed-stage-does-not-show-the-face", gap >= FACE_AREA,
      (gap * 100).toFixed(1) + "% of the card changed between sealed and open, floor "
      + (FACE_AREA * 100) + "%");
  }
  // 실루엣은 등급 테두리가 없는 카드에서 잰다. 금테가 붙은 카드는 그 테만으로 채도가 선다.
  const grey = cards.find((c) => !c.rare && c.f[2] && c.f[4]);
  check("instrument:a-plain-card-was-caught-in-silhouette-and-open", Boolean(grey),
    grey ? grey.name : "no plain card yielded stage 2 and stage 4");
  if (grey) {
    const dim = await tone(grey.f[2]);
    const lit = await tone(grey.f[4]);
    check("pullshow:the-silhouette-stage-has-no-colour",
      dim.sat <= lit.sat * GREY_RATIO && dim.lum < lit.lum,
      "saturation " + dim.sat.toFixed(1) + " of " + lit.sat.toFixed(1) + ", luminance "
      + dim.lum.toFixed(1) + " of " + lit.lum.toFixed(1));
  }
  const late = cards.filter((c) => c.rows[3] !== undefined && c.rows[4] !== undefined);
  check("pullshow:the-stat-rows-stand-only-at-the-last-stage",
    late.length > 0 && late.every((c) => c.rows[3] === 0 && c.rows[4] === STAT_ROWS),
    late.length ? late.map((c) => c.name + " " + c.rows[3] + "/" + c.rows[4]).join(", ") : "no card reached the last two stages");

  /* 등급 연출. 명성 9 이상이 올 때 판이 달라야 한다. 열린 단에서 희귀와 보통을 한 장씩 잡아
     카드 화소를 비교한다. 한 회차에 둘 다 안 나오면 비교할 것이 없으므로 그 사실을 적는다. */
  const rareShot = cards.find((c) => c.rare && c.f[4]);
  const plainShot = cards.find((c) => !c.rare && c.f[4]);
  check("instrument:the-round-showed-both-a-rare-and-a-plain-card", Boolean(rareShot && plainShot),
    (rareShot ? "rare " + rareShot.name : "no rare") + ", " + (plainShot ? "plain " + plainShot.name : "no plain"));
  if (rareShot && plainShot) {
    const a = await tone(rareShot.f[4]);
    const c = await tone(plainShot.f[4]);
    // 금색 테두리와 바탕이 붙으므로 빨강과 초록 채널이 파랑보다 크게 벌어진다.
    const gap = Math.abs(a.r - c.r) + Math.abs(a.g - c.g) + Math.abs(a.b - c.b);
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
  // 건너뛴 카드는 반쯤 열린 채로 서면 안 된다. 마지막 단까지 가야 이름과 능력치가 같이 있다.
  const landed = await read();
  check("pullshow:the-skipped-card-lands-fully-open",
    landed.stage === STAGES - 1 && landed.rows === STAT_ROWS,
    "stage " + landed.stage + " of " + (STAGES - 1) + ", " + landed.rows + " stat rows");
  await p.click("#pull");
  await p.waitForTimeout(220);
  const closed = await p.evaluate(() => document.getElementById("pull").hidden);
  check("pullshow:the-next-tap-closes-it", closed === true, "hidden " + closed);
  check("console:no-errors", errs.length === 0, errs.slice(0, 2).join(" | ") || "clean");
  await ctx.close();

  console.log("표본 범위: 열한 장 한 회차의 카드마다 다섯 단, 그중 봉인·실루엣·열린 단은 카드 화소로, 확률 표는 이적시장 선반 한 바퀴로");
  if (notes.length) console.log(notes.map((x) => "  ok   " + x).join(LINE));
  if (fails.length) console.log(fails.map((x) => "  FAIL " + x).join(LINE));
  console.log(fails.length ? "pullshow FAIL " + fails.length : "pullshow PASS " + notes.length);
  if (fails.length) process.exitCode = 1;
} finally {
  clearTimeout(t);
  if (b) await b.close();
}
