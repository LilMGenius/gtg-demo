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
   섞임이므로 버린다.

   밟은 단은 프레임으로 센다. 밖에서 한 바퀴 도는 데 0.14초가 들고 가장 짧은 단이 0.24초라,
   바쁜 기계에서는 단 하나가 통째로 두 물음 사이에 들어간다. 제품은 setTimeout 사슬이라 단을
   건너뛴 적이 없고 늦으면 그 단이 길어질 뿐인데, 폴링으로 재면 그 늦음이 제품의 결함으로 읽힌다.
   그래서 개봉을 누르기 전에 브라우저 안에 프레임마다 __reveal()을 적는 기록을 걸고 순서는 그
   기록으로만 판정한다. 한 사다리 안에서 프레임이 가장 짧은 단보다 벌어졌으면 빠진 단은 제품이
   아니라 이 자가 눈을 감은 자리이므로, 그 장은 순서 축에서 빼고 계기 축이 이름과 함께 적는다.

   화소와 등급은 낱장 회차에서 받는다. 한 장짜리 회차는 그 장이 마지막 단에 서면 사슬이 거기서
   멈추므로 열린 단이 안 지나가고, 봉인과 실루엣만 좁은 창을 다툰다. 전설 선반은 하한이 명성 9라
   나오는 장이 반드시 희귀하다. 동네 열한 장은 명성 9가 무게로 8.5%뿐이라 한 장도 안 나오는
   회차가 셋에 하나꼴이고, 그 회차에서는 등급 축 둘이 표본 없이 죽는다. */
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
/* 제품이 선언한 가장 짧은 단이다(main.mjs STAGE_MS의 최솟값). 기록의 두 프레임이 이보다 벌어지면
   그 사이에 단 하나가 통째로 들어갈 수 있으므로, 빠진 단을 제품의 것이라고 부를 수 없다. */
const BLINK_MS = 240;
// 다 밟은 사다리의 모양. 단 수에서 뽑으므로 단이 늘면 이 줄이 같이 는다.
const LADDER = Array.from({ length: STAGES }, (v, i) => i).join(",");
// 화소를 남길 단. 봉인과 실루엣과 열린 단이고, 나머지 둘은 앞뒤 단과 그림이 같다.
const WANT = [0, 2, STAGES - 1];
// 묶음 회차에서 안 연 채 남길 장수. 탭 축이 열 것이 없으면 그 축은 아무것도 안 잰다.
const SPARE = 2;
/* 길게 누름이 남은 것을 여는 것을 기다리는 상한. 제품 문턱이 0.45초라 여섯 배가 넘고,
   문턱이 아니라 상한이므로 초록 회차에서는 0.5초 언저리에 풀린다. */
const PRESS_MS = 3000;
// 낱장 회차 상한. 좁은 창을 놓치면 다음 회차가 새로 열고, 여섯이면 화소 넷을 다 받고도 남는다.
const SOLO_CAP = 6;
// 창 하나를 기다리는 상한. 희귀 카드가 마지막 단까지 2.1초라 그보다 넉넉하다.
const SHOT_MS = 6000;
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

  const card = p.locator("#pull .now");
  // 걸어 온 사다리와 받아 둔 화소. 사다리는 회차를 가리지 않고 쌓이고 이름이 열쇠다.
  const seen = new Map();
  const pix = [];

  /* 프레임마다 브라우저 안에서 적는다. 밖에서 물으면 한 바퀴가 0.14초라 0.24초짜리 단이
     두 물음 사이에 통째로 들어간다. 단이 바뀐 시각도 같은 자리에서 찍어 둔다. 화소를 찍는 쪽이
     그 시각을 써야 좁은 창을 온전히 쓰고, 밖에서 알아차린 시각을 쓰면 알아차린 만큼이 창에서 깎인다. */
  const record = () => p.evaluate(() => {
    if (window.__recOn) return true;
    window.__recOn = true;
    window.__rec = [];
    window.__at = { s: -2, w: 0, t: 0 };
    let f = 0;
    const tick = () => {
      f += 1;
      const r = window.__reveal();
      if (r.drawn > 0 && r.shown > 0) {
        const now = document.querySelector("#pull .now");
        const beam = now ? now.querySelector(".beam") : null;
        const anims = beam && beam.getAnimations ? beam.getAnimations() : [];
        const dur = anims.length ? Number(anims[0].effect.getTiming().duration) : null;
        const tag = now ? now.querySelector("b") : null;
        if (r.stage !== window.__at.s || r.shown !== window.__at.w) {
          window.__at = { s: r.stage, w: r.shown, t: performance.now() };
        }
        window.__rec.push({ f: f, t: performance.now(), s: r.stage, w: r.shown,
          n: tag ? tag.textContent : "",
          rare: Boolean(now && now.classList.contains("rare")),
          beam: Number.isFinite(dur) ? dur : null,
          // 능력치 줄은 마지막 두 단에서만 묻는다. 프레임마다 배치를 재면 그 값이 다시 프레임을 늦춘다.
          rows: now && r.stage >= 3
            ? [...now.querySelectorAll(".stats > span")].filter((e) => e.getClientRects().length).length : 0 });
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    return true;
  });

  const drain = () => p.evaluate(() => { const r = window.__rec; window.__rec = []; return r; });

  /* 회차를 열기 전에 기록을 비운다. 앞 회차의 마지막 프레임이 남아 있으면 단이 바뀐 시각이
     그 프레임의 것이 되어, 가라앉기도 전에 찍은 화소가 가라앉은 것으로 읽힌다. */
  const arm = () => p.evaluate(() => { window.__rec = []; window.__at = { s: -2, w: 0, t: 0 }; });

  // 기록을 카드별 사다리로 접는다. 프레임 간격 중 가장 넓은 것을 같이 들고 있어야
  // 빠진 단이 제품의 것인지 이 자가 눈을 감은 자리인지 아래에서 가를 수 있다.
  const fold = (rec) => {
    let prev = null;
    for (const x of rec) {
      const key = x.n || ("#" + x.w);
      if (!seen.has(key)) seen.set(key, { n: key, rare: x.rare, order: [], rows: {}, beam: [], gap: 0, tail: false });
      const bag = seen.get(key);
      if (bag.order[bag.order.length - 1] !== x.s) bag.order.push(x.s);
      if (bag.rows[x.s] === undefined || x.rows > bag.rows[x.s]) bag.rows[x.s] = x.rows;
      if (x.beam !== null && bag.beam.indexOf(x.beam) < 0) bag.beam.push(x.beam);
      if (prev !== null && x.t - prev > bag.gap) bag.gap = x.t - prev;
      prev = x.t;
    }
    // 회차를 끊은 자리에서 걷던 장은 사다리가 아니라 조각이다. 조각을 세면 안 본 카드가 빨개진다.
    const last = rec.length ? rec[rec.length - 1] : null;
    if (last && last.s < STAGES - 1) seen.get(last.n || ("#" + last.w)).tail = true;
  };

  /* 아직 안 찍은 단의 창이 열리기를 기다렸다가 한 장 남긴다. 창이 열렸다는 말은 셋이다.
     그 단에 들어선 지 문턱만큼 지났고, 카드 안에서 도는 전환이 하나도 없고, 아직 그 단이다.
     단에 들어선 시각은 브라우저가 들고 있다. 밖에서 알아차린 시각을 쓰면 알아차린 만큼이 창에서 깎인다.
     그림 필터가 0.22초에 걸쳐 도므로 문턱 0.18초만으로는 도는 중인 화소를 찍는다. 실측으로 그때
     밝기가 0.24가 아니라 0.219였다. 찍은 뒤에 아직 같은 단인지 다시 묻고, 갈렸으면 버린다. */
  const shoot = async (steps, have) => {
    let at = null;
    try {
      const hit = await p.waitForFunction(([ws, hs, ms]) => {
        const r = window.__reveal();
        if (r.drawn <= 0 || r.shown <= 0 || ws.indexOf(r.stage) < 0) return null;
        if (hs.indexOf(r.shown + ":" + r.stage) >= 0) return null;
        if (window.__at.s !== r.stage || window.__at.w !== r.shown) return null;
        if (performance.now() - window.__at.t < ms) return null;
        const now = document.querySelector("#pull .now");
        if (!now || now.getAnimations({ subtree: true }).some((a) => a.playState === "running")) return null;
        return { card: r.shown, stage: r.stage };
      }, [steps, have, SETTLE_MS], { timeout: SHOT_MS, polling: "raf" });
      at = await hit.jsonValue();
    } catch (e) { return null; }
    let png = null;
    try { png = (await card.screenshot()).toString("base64"); } catch (e) { return null; }
    const after = await read();
    if (after.stage !== at.stage || after.card !== at.card) return { card: at.card, stage: at.stage, png: null };
    return { card: at.card, stage: at.stage, png: png, name: after.name, rare: after.rare };
  };

  // 찍은 장을 카드 이름 아래 모은다. 뽑은 순서대로 서므로 아래 축이 고르는 표본이 회차 순서를 따른다.
  const keep = (s) => {
    if (!s || !s.png) return false;
    let one = pix.find((x) => x.name === s.name);
    if (!one) { one = { name: s.name, rare: s.rare, f: {} }; pix.push(one); }
    one.f[s.stage] = s.png;
    return true;
  };

  // 받아야 할 화소가 다 섰는가. 봉인 짝과 실루엣 짝과 등급 두 장이다.
  const want = () => pix.some((c) => c.f[0] && c.f[4]) && pix.some((c) => !c.rare && c.f[2] && c.f[4])
    && pix.some((c) => c.rare && c.f[4]) && pix.some((c) => !c.rare && c.f[4]);

  /* 닫힌 판은 누를 자리가 없다. 빨간 자에서 한 번 더 누르면 거기서 오류로 끝나 결과 줄이 아예 안 남고,
     무엇이 빨간지 못 읽는다. 누른 것과 누를 자리가 없던 것을 가르므로 축도 그 둘을 안 섞는다. */
  const tap = async () => {
    if (await p.evaluate(() => document.getElementById("pull").hidden)) return false;
    await p.click("#pull", { force: true });
    return true;
  };

  /* 길게 누른다. 손가락이 내려가 있는 동안 남은 것이 전부 열리는 물건이라 누름과 뗌을 따로 보내고,
     열린 것을 보고 뗀다. 뗌이 뒤따라 보내는 누름은 제품이 삼키므로 여기서 다시 안 센다. */
  const press = async () => {
    if (await p.evaluate(() => document.getElementById("pull").hidden)) return false;
    const spot = await p.locator("#pull .tap").boundingBox();
    if (!spot) return false;
    await p.mouse.move(spot.x + spot.width / 2, spot.y + spot.height / 2);
    await p.mouse.down();
    await p.waitForFunction((last) => {
      const r = window.__reveal();
      return r.drawn > 0 && r.shown === r.drawn && r.stage === last;
    }, STAGES - 1, { timeout: PRESS_MS, polling: "raf" }).catch(() => {});
    await p.mouse.up();
    return true;
  };

  /* 화면을 닫는다. 다 안 열린 회차는 길게 눌러 전부 열고 그 다음 누름이 닫는다. 짧은 누름은 한 단만
     올리므로 누름 수만 세어 닫으려 들면 열한 장짜리 회차가 영영 안 닫히고, 다음 회차가 선반에 못 닿는다. */
  const dismiss = async () => {
    for (let i = 0; i < 4; i += 1) {
      if (await p.evaluate(() => document.getElementById("pull").hidden)) return;
      await press();
      await tap();
      await p.waitForTimeout(220);
    }
  };

  /* 낱장 한 회차. 사서 봉인과 실루엣과 열린 단을 한 장씩 찍고 닫는다.
     닫아야 다음 회차를 산다. 개봉 화면이 선반을 통째로 덮기 때문이다. */
  const solo = async (kind) => {
    await arm();
    await p.click('#shop .kind[data-kind="' + kind + '"]', { force: true });
    await p.waitForTimeout(160);
    await p.locator("#shop .buy.pull").nth(0).click();
    await p.waitForSelector("#pull .now img", { timeout: 8000 });
    const have = [];
    for (const at of WANT) {
      // 이미 지나간 단은 기다리지 않는다. 낱장은 한 번 지나가면 그 단이 다시 안 온다.
      const live = await read();
      if (live.stage < 0 || live.stage > at) continue;
      const got = await shoot([at], have);
      if (got && got.png) { have.push(got.card + ":" + got.stage); keep(got); }
    }
    /* 걸은 것을 여기서 접는다. 아래 닫기가 마지막 단으로 건너뛰므로, 닫은 뒤에 접으면
       그 건너뜀이 제품이 단을 빠뜨린 것으로 기록에 남는다. */
    fold(await drain());
    await dismiss();
  };

  await p.goto(BASE, { waitUntil: "load" });
  await p.waitForSelector("#go", { timeout: 15000 });
  await p.click("#go", { force: true });
  await p.waitForTimeout(900);
  /* 처음 온 계정은 카드부터 연다. 그 흐름을 안 닫고 상점을 열면 이 자의 판정이
     첫 진입 개봉과 상점 개봉을 섞어 읽는다. 사람도 똑같이 닫고 나서 상점에 간다. */
  await dismiss();
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

  /* 묶음 한 회차부터 연다. 이 회차가 뽑는 자리를 앞뒤로 옮기지 않는다. 뽑기는 시드 난수를 쓰고
     그 난수는 판이 도는 동안에도 조금씩 당겨지므로, 앞에 다른 회차를 끼우면 이 회차가 다른 열한 장을
     뽑는다. 아래 축들이 고르는 표본이 통째로 갈리는 자리라, 낱장 회차는 전부 이 뒤에 선다. */
  await record();
  await arm();
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

  /* 다섯 단을 걷는다. 순서는 기록이 프레임마다 적고, 화소는 창이 열릴 때마다 한 장씩 받는다.
     밖에서 단을 폴링하지 않으므로 화소를 놓쳐도 순서 판정은 안 흔들린다.
     마지막 두 장은 안 연 채로 끊는다. 걷다가 다 열어 버리면 아래 탭 축이 잴 것이 없다. */
  const have = [];
  for (let i = 0; i < 40; i += 1) {
    const live = await p.evaluate(() => window.__reveal());
    if (live.drawn > 0 && live.shown >= live.drawn - SPARE) break;
    if (want()) break;
    const got = await shoot(WANT, have);
    if (!got) break;
    if (got.png) { have.push(got.card + ":" + got.stage); keep(got); }
  }
  await p.waitForFunction((left) => {
    const r = window.__reveal();
    return r.drawn > 0 && r.shown >= r.drawn - left;
  }, SPARE, { timeout: 90000, polling: "raf" }).catch(() => {});
  fold(await drain());

  /* 짧은 누름 한 번. 이것은 한 단만 올린다. 자동 사다리가 같은 창에서 또 올리면 이 축이 무엇을
     잰 것인지 갈리므로, 누른 순간의 상태를 브라우저 안에서 잡아 그 짝과 비교한다. */
  await p.evaluate(() => {
    window.__tapAt = null;
    document.addEventListener("pointerup", () => { window.__tapAt = window.__reveal(); }, true);
  });
  let step = null;
  for (let i = 0; i < 6 && !step; i += 1) {
    /* 판이 이미 걷혔으면 여기서 그친다. 없는 자리를 누르면 그 기다림이 결과 줄을 통째로 삼켜
       무엇이 빨간지 못 읽는다. 누를 자리가 있고 아직 올릴 단이 남은 창만 이 손을 쓴다. */
    const live = await p.waitForFunction((last) => {
      const e = document.getElementById("pull");
      if (!e || e.hidden) return { gone: true };
      const r = window.__reveal();
      return (r.drawn > 0 && r.shown > 0 && r.shown < r.drawn && r.stage < last) ? { gone: false } : null;
    }, STAGES - 1, { timeout: 8000, polling: "raf" }).then((h) => h.jsonValue()).catch(() => ({ gone: true }));
    if (live.gone) break;
    await p.evaluate(() => { window.__tapAt = null; });
    if (!(await tap())) break;
    const seen = await p.evaluate(() => ({ pre: window.__tapAt, post: window.__reveal() }));
    if (seen.pre && seen.pre.stage < STAGES - 1 && seen.pre.shown < seen.pre.drawn) step = seen;
  }
  check("instrument:a-tap-landed-while-a-stage-was-still-left", Boolean(step),
    step ? "pressed at stage " + step.pre.stage + ", " + step.pre.shown + " of " + step.pre.drawn
      : "no press landed below the last stage");
  check("pullshow:a-tap-advances-one-stage",
    Boolean(step) && step.post.shown === step.pre.shown && step.post.stage === step.pre.stage + 1,
    step ? "stage " + step.pre.stage + " to " + step.post.stage + ", shown " + step.pre.shown
      + " to " + step.post.shown + " of " + step.post.drawn : "unmeasured");

  // 길게 누르면 남은 것이 한 번에 열린다. 기다리는 것이 연출이지 벌은 아니다.
  await press();
  await p.waitForTimeout(260);
  const skipped = await p.evaluate(() => window.__reveal());
  check("pullshow:a-long-press-opens-the-rest-at-once",
    skipped.drawn > 0 && skipped.shown === skipped.drawn,
    skipped.shown + " of " + skipped.drawn);
  const done = await p.evaluate(() => document.querySelectorAll("#pull .done i").length);
  check("pullshow:the-cards-already-opened-stay-on-screen", done === skipped.drawn - 1,
    done + " stacked of " + (skipped.drawn - 1));
  // 건너뛴 카드는 반쯤 열린 채로 서면 안 된다. 마지막 단까지 가야 이름과 능력치가 같이 있다.
  const landed = await read();
  check("pullshow:the-skipped-card-lands-fully-open",
    landed.stage === STAGES - 1 && landed.rows === STAT_ROWS,
    "stage " + landed.stage + " of " + (STAGES - 1) + ", " + landed.rows + " stat rows");
  const closing = await tap();
  await p.waitForTimeout(220);
  const closed = await p.evaluate(() => document.getElementById("pull").hidden);
  check("pullshow:the-next-tap-closes-it", closing && closed === true,
    "tapped " + closing + ", hidden " + closed);

  /* 전설 선반 낱장. 하한이 명성 9라 이 회차의 카드는 반드시 희귀하고, 등급 축 둘이 여기서 표본을 받는다.
     동네 열한 장은 명성 9가 무게로 8.5%뿐이라 한 장도 안 나오는 회차가 셋에 하나꼴이고,
     그 회차에서는 등급 축이 표본 없이 죽는다. 확률이 아니라 풀이 등급을 보장하는 자리로 옮긴다. */
  await solo("legend");
  /* 묶음 회차가 좁은 창을 놓쳤으면 낱장으로 메운다. 낱장은 그 장이 마지막 단에 서면 사슬이 거기서
     멈추므로 열린 단이 안 지나가고, 봉인과 실루엣만 창을 다툰다. 바쁜 기계에서만 도는 자리다. */
  for (let i = 0; i < SOLO_CAP && !want(); i += 1) await solo("town");

  /* 사다리 판정. 회차를 다 돈 뒤에 한 번만 접는다. 앞에서 한 번 세어 두면 뒤에 선 회차의 사다리가
     그 수에 안 들어가고, 전설 한 장이 등급 축에 안 닿는다.
     기록의 두 프레임이 가장 짧은 단보다 벌어진 장은 그 사이로 단이 지나갔을 수 있어 제품이 건너뛴
     것인지 이 자가 눈을 감은 것인지 못 가른다. 그런 장은 순서 축에서 빼고 계기 축이 이름과 빠진
     단을 적는다. 제품을 빨갛게 칠하는 것은 기록이 촘촘했을 때뿐이다. */
  const cards = [...seen.values()];
  const gone = (c) => {
    const out = [];
    for (let s = 0; s < STAGES; s += 1) if (c.order.indexOf(s) < 0) out.push(s);
    return out.join("/");
  };
  const blind = cards.filter((c) => !c.tail && c.order[0] === 0
    && c.order.join(",") !== LADDER && c.gap > BLINK_MS);
  const full = cards.filter((c) => !c.tail && c.order[0] === 0 && blind.indexOf(c) < 0);
  const walked = full.filter((c) => c.order.join(",") === LADDER);
  check("instrument:the-walk-caught-whole-ladders", full.length >= 2,
    full.length + " cards seen from their first stage over " + cards.length + " cards, "
    + (blind.length ? blind.map((c) => c.n + " blinked " + c.gap.toFixed(0) + "ms past stage " + gone(c)).join(", ")
      : "worst frame gap " + top(cards.map((c) => c.gap)).toFixed(0) + "ms of " + BLINK_MS));
  check("pullshow:the-opening-walks-five-stages-in-order",
    full.length >= 2 && walked.length === full.length,
    walked.length + "/" + full.length + " walked " + LADDER + "; first other "
    + (full.find((c) => c.order.join(",") !== LADDER) || { order: [] }).order.join(","));

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

  const sealed = pix.find((c) => c.f[0] && c.f[4]);
  check("instrument:one-card-was-caught-both-sealed-and-open", Boolean(sealed),
    sealed ? sealed.name : "no card yielded stage 0 and stage 4 over " + pix.length + " cards shot");
  if (sealed) {
    const gap = await apart(sealed.f[0], sealed.f[4]);
    check("pullshow:the-sealed-stage-does-not-show-the-face", gap >= FACE_AREA,
      (gap * 100).toFixed(1) + "% of the card changed between sealed and open, floor "
      + (FACE_AREA * 100) + "%");
  }
  // 실루엣은 등급 테두리가 없는 카드에서 잰다. 금테가 붙은 카드는 그 테만으로 채도가 선다.
  const grey = pix.find((c) => !c.rare && c.f[2] && c.f[4]);
  check("instrument:a-plain-card-was-caught-in-silhouette-and-open", Boolean(grey),
    grey ? grey.name : "no plain card yielded stage 2 and stage 4 over " + pix.length + " cards shot");
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
    late.length ? late.map((c) => c.n + " " + c.rows[3] + "/" + c.rows[4]).join(", ") : "no card reached the last two stages");

  /* 등급 연출. 명성 9 이상이 올 때 판이 달라야 한다. 열린 단에서 희귀와 보통을 한 장씩 잡아
     카드 화소를 비교한다. 희귀 쪽은 전설 선반이 대므로 이 축은 회차 운에 안 걸린다. */
  const rareShot = pix.find((c) => c.rare && c.f[4]);
  const plainShot = pix.find((c) => !c.rare && c.f[4]);
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
  /* 일반 앱 UX 문법 둘. 위의 축들은 이 게임의 등급과 단을 알아야 읽히지만, 아래 둘은 어느 앱의
     전체 화면 창이든 같은 것을 묻는다. 표면마다 도메인 축 옆에 같은 문법을 세운다는 래칫의 요구다.
     하나. 상태를 바꾸는 조작이 그 상태가 사는 동안 내내 열려 있다. 이 창에서 상태를 바꾸는 조작은
     넘기고 닫는 한 마디뿐이고, 제품은 그것을 판 전체를 덮는 투명 버튼으로 세웠다. 그러면 봉인 단이든
     마지막 단이든 창 어느 자리를 눌러도 그 버튼이 받아야 한다. 묻는 것은 disabled 하나가 아니라
     화면이 실제로 그 누름을 받는가이므로, 카드 한가운데를 비롯한 여섯 자리에서 elementFromPoint가
     그 버튼을 내는지 본다. 층이 겹쳐 다른 판이 앞에 서면 사람이 카드를 눌렀는데 아무 일도 안 난다.
     둘. 옮기거나 지운 요소가 남긴 빈 칸이 없다. 한 장짜리 회차에서 이미 나온 줄은 채울 것이 영영
     없으므로, 그 줄이 자리를 잡고 서 있으면 그것은 여백이 아니라 사라진 물건으로 읽힌다.
     빈 칸인지는 화소로 묻는다. 줄을 그대로 찍은 프레임과 그 줄만 감춘 프레임이 한 화소도 안 갈리면
     그 줄은 아무것도 안 그린다. 채널 차 8은 thumb-gate가 회전에, wiki-gate가 그늘에 쓰는 수다. */
  const UX_PIX = 8;
  const uxShot = (clip) => p.screenshot({ clip: clip }).then((x) => x.toString("base64"));
  const uxMoved = (a, z) => p.evaluate(([s1, s2, tol]) => Promise.all([s1, s2].map((s) => new Promise((res) => {
    const im = new Image();
    im.onload = () => {
      const cv = document.createElement("canvas");
      cv.width = im.width; cv.height = im.height;
      const g = cv.getContext("2d");
      g.drawImage(im, 0, 0);
      res(g.getImageData(0, 0, im.width, im.height));
    };
    im.src = "data:image/png;base64," + s;
  }))).then(([u, v]) => {
    if (u.width !== v.width || u.height !== v.height) return -1;
    let n = 0;
    for (let i = 0; i < u.data.length; i += 4) {
      const m = Math.max(Math.abs(u.data[i] - v.data[i]), Math.abs(u.data[i + 1] - v.data[i + 1]), Math.abs(u.data[i + 2] - v.data[i + 2]));
      if (m > tol) n += 1;
    }
    return n / (u.width * u.height);
  }), [a, z, UX_PIX]);
  /* 흐름에 선 줄만 센다. 넘기는 한 마디는 inset:0으로 판을 통째로 덮는 절대 위치라 기둥의 칸이 아니다.
     자리는 offsetTop으로 잰다. 카드가 기울어 서서 getBoundingClientRect는 회전된 상자를 돌려준다. */
  const uxRows = () => {
    const box = document.getElementById("pull");
    if (!box || box.hidden) return null;
    const gap = parseFloat(getComputedStyle(box).rowGap) || 0;
    const rows = [...box.children].filter((e) => {
      const s = getComputedStyle(e);
      return s.position !== "absolute" && s.position !== "fixed" && s.display !== "none";
    }).map((e) => {
      const q = e.getBoundingClientRect();
      return { cls: (e.className || e.tagName).split(" ")[0], top: e.offsetTop, h: e.offsetHeight,
        clip: { x: Math.round(q.x), y: Math.round(q.y), width: Math.round(q.width), height: Math.round(q.height) },
        kids: e.childElementCount, chars: (e.textContent || "").trim().length,
        minH: getComputedStyle(e).minHeight };
    });
    const r = window.__reveal();
    return { gap: gap, rows: rows, drawn: r.drawn, shown: r.shown };
  };
  const uxHide = (i, on) => p.evaluate(([k, v]) => {
    const box = document.getElementById("pull");
    const kids = [...box.children].filter((e) => {
      const s = getComputedStyle(e);
      return s.position !== "absolute" && s.position !== "fixed" && s.display !== "none";
    });
    if (kids[k]) kids[k].style.visibility = v ? "hidden" : "";
  }, [i, on]);
  // 한 바퀴. 흐름의 줄마다 그대로 찍은 것과 그 줄만 감춘 것을 견줘, 아무것도 안 그리는 줄을 걷어 낸다.
  const uxSweep = async () => {
    const live = await p.evaluate(uxRows);
    if (!live) return null;
    const out = [];
    for (let i = 0; i < live.rows.length; i += 1) {
      const r = live.rows[i];
      if (r.clip.width < 1 || r.clip.height < 1) { out.push(Object.assign({ share: 0 }, r)); continue; }
      const on = await uxShot(r.clip);
      await uxHide(i, true);
      await p.waitForTimeout(60);
      const off = await uxShot(r.clip);
      await uxHide(i, false);
      await p.waitForTimeout(60);
      out.push(Object.assign({ share: await uxMoved(on, off) }, r));
    }
    const bare = out.filter((r) => !(r.share > 0));
    return { gap: live.gap, drawn: live.drawn, rows: out, bare: bare,
      cost: bare.reduce((a, r) => a + r.h + live.gap, 0), ok: out.length > 0 && bare.length === 0 };
  };
  const uxTap = () => {
    const box = document.getElementById("pull");
    const t = box ? box.querySelector(".tap") : null;
    const now = box ? box.querySelector(".now") : null;
    if (!box || !t || !now) return { there: false, stage: "?" };
    const owns = (e) => Boolean(e) && (e === t || t.contains(e));
    const name = (e) => (e ? String((e.className && e.className.baseVal !== undefined ? e.className.baseVal : e.className) || e.tagName) : "none");
    const at = (x, y) => { const e = document.elementFromPoint(x, y); return { hit: owns(e), who: name(e) }; };
    const q = now.getBoundingClientRect();
    const b = box.getBoundingClientRect();
    const spots = {
      card: at(q.x + q.width / 2, q.y + q.height / 2),
      cardTop: at(q.x + q.width / 2, q.y + 14),
      cardFoot: at(q.x + q.width / 2, q.bottom - 14),
      overCard: at(b.x + b.width / 2, Math.max(b.y + 2, q.y - 14)),
      underCard: at(b.x + b.width / 2, Math.min(b.bottom - 2, q.bottom + 14)),
      strip: at(b.x + b.width / 2, b.bottom - 8)
    };
    return { there: true, stage: now.dataset.stage, tag: t.tagName, off: t.disabled,
      pe: getComputedStyle(t).pointerEvents, text: (t.textContent || "").trim(),
      w: Math.round(t.getBoundingClientRect().width), h: Math.round(t.getBoundingClientRect().height),
      spots: spots, deaf: Object.keys(spots).filter((k) => !spots[k].hit) };
  };
  const uxLive = (s) => Boolean(s) && s.there && s.tag === "BUTTON" && s.off === false && s.pe !== "none" && s.deaf.length === 0;
  const uxSay = (s) => (s ? "stage " + s.stage + " " + JSON.stringify(s.text) + " " + s.w + "x" + s.h
    + (s.deaf.length ? ", dead at " + s.deaf.map((k) => k + " (" + s.spots[k].who + ")").join(" and ") : ", live at all six spots")
    : "no reveal");

  /* 한 장짜리 회차를 연다. 묶음 회차에서는 이미 나온 줄이 채워지므로 빈 줄이 안 보이고, 그 줄이
     영영 안 채워지는 것은 한 장을 뽑았을 때다. 이 회차는 모든 표본을 받은 뒤라 위 축들의 뽑기 자리를
     앞뒤로 안 옮긴다. 지갑은 앞선 회차들이 얼마를 썼든 살 수 있게 채운다. */
  let uxOpen = false;
  try {
    await p.evaluate(() => { const w = window.__wallet(); w.coin = Math.max(w.coin, 20000); });
    await p.evaluate(() => window.__shop(true));
    await p.waitForSelector("#shop .buy.pull", { timeout: 8000 });
    await p.click('#shop .kind[data-kind="town"]', { force: true });
    await p.waitForTimeout(200);
    await p.locator("#shop .buy.pull").nth(0).click({ timeout: 6000 });
    await p.waitForFunction(() => {
      const e = document.getElementById("pull");
      return Boolean(e && !e.hidden && e.querySelector(".now") && window.__reveal().drawn === 1);
    }, null, { timeout: 12000, polling: 30 });
    uxOpen = true;
  } catch (e) { uxOpen = false; }
  if (!uxOpen) {
    check("ux:the-tap-stays-open-at-every-stage", false, "unmeasured: no single-card round opened");
    check("control:a-tap-that-takes-no-pointer-reddens-the-open-axis", false, "unmeasured: no single-card round opened");
    check("ux:a-single-card-reveal-leaves-no-vacated-row", false, "unmeasured: no single-card round opened");
    check("control:the-vacated-row-axis-follows-a-planted-and-a-cleared-hole", false, "unmeasured: no single-card round opened");
  } else {
    const sealed = await p.evaluate(uxTap);
    await p.waitForFunction(() => {
      const n = document.querySelector("#pull .now");
      return Boolean(n) && n.dataset.stage === String(4);
    }, null, { timeout: 12000, polling: 30 }).catch(() => {});
    await p.waitForTimeout(220);
    const opened = await p.evaluate(uxTap);
    check("ux:the-tap-stays-open-at-every-stage", uxLive(sealed) && uxLive(opened),
      uxSay(sealed) + " | " + uxSay(opened));
    // 대조군. 그 버튼이 누름을 안 받게 심으면 위 축이 빨개져야 한다. 심고 곧바로 도로 뺀다.
    await p.evaluate(() => { document.querySelector("#pull .tap").style.pointerEvents = "none"; });
    await p.waitForTimeout(140);
    const numb = await p.evaluate(uxTap);
    await p.evaluate(() => { document.querySelector("#pull .tap").style.pointerEvents = ""; });
    await p.waitForTimeout(140);
    const woke = await p.evaluate(uxTap);
    check("control:a-tap-that-takes-no-pointer-reddens-the-open-axis",
      uxLive(numb) === false && uxLive(woke) === uxLive(opened),
      "planting pointer-events none left " + numb.deaf.length + " of six spots dead, restored to "
      + (6 - woke.deaf.length) + " live");

    const uxNow = await uxSweep();
    check("ux:a-single-card-reveal-leaves-no-vacated-row", Boolean(uxNow) && uxNow.ok && uxNow.drawn === 1,
      !uxNow ? "no reveal on screen"
        : uxNow.bare.length
          ? uxNow.bare.map((r) => "." + r.cls + " stands " + r.h + "px tall with " + r.kids + " children and paints "
            + (r.share * 100).toFixed(1) + "% (min-height " + r.minH + ")").join(", ")
            + ", costing " + uxNow.cost + "px of the column with " + uxNow.drawn
            + " card drawn, so the card sits " + (uxNow.cost / 2) + "px above centre"
          : uxNow.rows.length + " rows all inked over " + uxNow.drawn + " card, lowest "
            + (Math.min.apply(null, uxNow.rows.map((r) => r.share)) * 100).toFixed(1) + "%");
    /* 대조군은 양쪽으로 민다. 빈 칸을 하나 더 심으면 빨개져야 하고, 지금 빈 칸으로 잡힌 줄을 걷으면
       초록으로 돌아와야 한다. 한쪽만 보면 늘 빨간 자와 실제로 재는 자를 못 가른다. */
    await p.evaluate(() => {
      const box = document.getElementById("pull");
      const hole = document.createElement("div");
      hole.id = "uxHole";
      hole.style.minHeight = "34px";
      hole.style.width = "120px";
      box.insertBefore(hole, box.querySelector(".tap"));
    });
    await p.waitForTimeout(160);
    const uxPlanted = await uxSweep();
    await p.evaluate(() => { const e = document.getElementById("uxHole"); if (e) e.remove(); });
    await p.waitForTimeout(160);
    await p.evaluate((names) => {
      const box = document.getElementById("pull");
      for (const e of [...box.children]) if (names.indexOf((e.className || "").split(" ")[0]) >= 0) e.style.display = "none";
    }, (uxNow && uxNow.bare.length ? uxNow.bare : []).map((r) => r.cls));
    await p.waitForTimeout(160);
    const uxCleared = await uxSweep();
    await p.evaluate(() => { for (const e of [...document.getElementById("pull").children]) e.style.display = ""; });
    await p.waitForTimeout(160);
    check("control:the-vacated-row-axis-follows-a-planted-and-a-cleared-hole",
      Boolean(uxPlanted) && uxPlanted.ok === false && Boolean(uxCleared) && uxCleared.ok === true,
      "a planted 34px hole read " + (uxPlanted ? uxPlanted.bare.length + " bare rows" : "nothing")
      + ", clearing " + ((uxNow && uxNow.bare.length) ? uxNow.bare.map((r) => "." + r.cls).join(" and ") : "nothing")
      + " read " + (uxCleared ? uxCleared.bare.length + " bare rows" : "nothing"));
    for (let i = 0; i < 4; i += 1) {
      if (await p.evaluate(() => document.getElementById("pull").hidden)) break;
      await p.click("#pull", { force: true });
      await p.waitForTimeout(220);
    }
  }

  /* 판. 이름과 능력치 다섯 줄이 구운 초상 위에 바로 앉으면, 글자 뒤에 무엇이 오는지를 카드가 아니라
     그림이 정한다. 1280에서 이름이 키퍼의 가슴을 가로지르고 그 옆에 장갑이 섰고, 이름표는 카드 왼쪽 끝에
     값은 오른쪽 끝에 붙어 눈이 카드 폭만큼 몸을 건너야 했다. 740에서는 그 장갑이 이름과 첫 값 사이를
     뚫고 들어왔다. 위의 축들은 이 게임의 등급과 단을 알아야 읽히지만 아래 셋은 어느 앱이든 같은 것을
     묻는다. 글자는 판 위에 앉고, 값은 제 이름표 옆에 선다.
     이름 자리는 화소로 묻는다. 글자색만 투명으로 두면 배치는 그대로이고 칠만 빠지므로 남는 화소는
     전부 판이어야 하고, 한 점이라도 판의 색에서 벗어나면 그 자리는 판이 아니라 그림이다.
     얼굴 자리는 그림 상자의 위 45%로 둔다. 카드 rig가 몸통을 겨냥해 위로 올려 잡아 머리가 초상의
     윗부분에 서므로 실제 머리는 그보다 위에서 끝나고, 이 자는 제품에 유리한 쪽으로 안 틀린다.
     카드가 기울어 서므로 화면 좌표는 회전을 통과시켜 얻는다. getBoundingClientRect는 기울어진 상자를
     감싸는 곧은 상자라, 그 상자의 모서리에는 판 밖의 화소가 들어와 판의 결함으로 읽힌다. */
  const HEAD_SHARE = 0.45;
  // 이름 상자 안을 3화소 격자로 훑는다. 1280에서 팔백 점이 넘어 장갑 하나가 들어오면 수십 점이 걸린다.
  const PLATE_STEP = 3;
  const plateInk = (off) => p.evaluate((v) => {
    const nm = document.querySelector("#pull .now .foot > b");
    if (!nm) return false;
    nm.style.color = v ? "transparent" : "";
    return true;
  }, off);
  const plateGeo = (share, step) => p.evaluate(([sh, st]) => {
    const now = document.querySelector("#pull .now");
    if (!now) return null;
    const foot = now.querySelector(".foot");
    const img = now.querySelector("img");
    const nm = foot ? foot.querySelector(":scope > b") : null;
    if (!foot || !img || !nm) return null;
    const cs = getComputedStyle(now);
    const M = cs.transform === "none" ? new DOMMatrixReadOnly() : new DOMMatrixReadOnly(cs.transform);
    const q = now.getBoundingClientRect();
    const cx = q.x + q.width / 2;
    const cy = q.y + q.height / 2;
    const bl = parseFloat(cs.borderLeftWidth) || 0;
    const bt = parseFloat(cs.borderTopWidth) || 0;
    /* 카드 안쪽 한 점을 화면 좌표로. 회전축은 상자 한가운데이고 위 조상에는 변형이 없으므로,
       안쪽 좌표에서 가운데를 뺀 자리에 행렬을 곱하고 가운데를 도로 더하면 그 점이다. */
    const on = (lx, ly) => {
      const dx = bl + lx - now.offsetWidth / 2;
      const dy = bt + ly - now.offsetHeight / 2;
      return [cx + M.a * dx + M.c * dy, cy + M.b * dx + M.d * dy];
    };
    const nx = foot.offsetLeft + nm.offsetLeft;
    const ny = foot.offsetTop + nm.offsetTop;
    const pts = [];
    for (let y = ny + 2; y <= ny + nm.offsetHeight - 2; y += st) {
      for (let x = nx + 2; x <= nx + nm.offsetWidth - 2; x += st) pts.push(on(x, y));
    }
    // 이름표와 값 사이. 둘은 같은 상자 안에 서므로 회전을 안 통과시켜도 거리가 안 흔들린다.
    const rows = [...foot.querySelectorAll(".stats > span")].map((s) => {
      const lab = s.querySelector("i");
      const val = s.querySelector("b");
      if (!lab || !val) return null;
      return { n: lab.textContent,
        gap: Math.round((val.offsetLeft - lab.offsetLeft - lab.offsetWidth) * 10) / 10 };
    }).filter((r) => r);
    return { vw: innerWidth, vh: innerHeight, cardH: now.offsetHeight, pts: pts, rows: rows,
      plateTop: Math.round(foot.offsetTop * 10) / 10,
      headBottom: Math.round((img.offsetTop + img.offsetHeight * sh) * 10) / 10,
      bg: getComputedStyle(foot).backgroundColor,
      gap2: parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--gap-2")) || 0 };
  }, [share, step]);
  // 찍은 한 장에서 그 점들의 색을 읽는다. 판의 색에서 문턱만큼 벗어난 점 하나면 그 자리는 그림이다.
  const plateSample = (png, pts, want, tol) => p.evaluate(([s, list, hue, t]) => new Promise((res) => {
    const im = new Image();
    im.onload = () => {
      const cv = document.createElement("canvas");
      cv.width = im.width; cv.height = im.height;
      const g = cv.getContext("2d");
      g.drawImage(im, 0, 0);
      const d = g.getImageData(0, 0, im.width, im.height).data;
      const m = hue.match(/[0-9.]+/g) || [];
      const rgb = [Number(m[0]) || 0, Number(m[1]) || 0, Number(m[2]) || 0];
      let off = 0, worst = 0, sum = 0, sq = 0, n = 0;
      for (const pt of list) {
        const x = Math.round(pt[0]), y = Math.round(pt[1]);
        if (x < 0 || y < 0 || x >= im.width || y >= im.height) continue;
        const i = (y * im.width + x) * 4;
        const far = Math.max(Math.abs(d[i] - rgb[0]), Math.abs(d[i + 1] - rgb[1]), Math.abs(d[i + 2] - rgb[2]));
        if (far > worst) worst = far;
        if (far > t) off += 1;
        const lum = d[i] * 0.2126 + d[i + 1] * 0.7152 + d[i + 2] * 0.0722;
        sum += lum; sq += lum * lum; n += 1;
      }
      res({ n: n, off: off, worst: worst,
        sd: n ? Math.sqrt(Math.max(0, sq / n - (sum / n) * (sum / n))) : -1 });
    };
    im.src = "data:image/png;base64," + s;
  }), [png, pts, want, tol]);
  // 한 폭에서 한 벌. 폭을 바꾸고 카드가 마지막 단에 가만히 선 뒤에 재고 찍는다.
  const plateAt = async (w, h) => {
    await p.setViewportSize({ width: w, height: h });
    await p.waitForTimeout(300);
    await p.waitForFunction(() => {
      const n = document.querySelector("#pull .now");
      return Boolean(n) && n.dataset.stage === String(4)
        && !n.getAnimations({ subtree: true }).some((a) => a.playState === "running");
    }, null, { timeout: 8000, polling: "raf" }).catch(() => {});
    const geo = await plateGeo(HEAD_SHARE, PLATE_STEP);
    if (!geo) return null;
    await plateInk(true);
    await p.waitForTimeout(90);
    const png = (await p.screenshot()).toString("base64");
    await plateInk(false);
    return Object.assign({ ink: await plateSample(png, geo.pts, geo.bg, PIXEL_TOL) }, geo);
  };

  /* 한 장짜리 회차를 다시 연다. 위의 ux 한 바퀴가 판을 닫고 나갔고, 이 자는 폭을 두 번 바꾸므로
     제 회차를 따로 열어야 앞 축들이 본 화면을 안 흔든다. */
  let plateOpen = false;
  try {
    await p.evaluate(() => { const w = window.__wallet(); w.coin = Math.max(w.coin, 20000); });
    await p.evaluate(() => window.__shop(true));
    await p.waitForSelector("#shop .buy.pull", { timeout: 8000 });
    await p.click('#shop .kind[data-kind="town"]', { force: true });
    await p.waitForTimeout(200);
    await p.locator("#shop .buy.pull").nth(0).click({ timeout: 6000 });
    await p.waitForFunction(() => {
      const e = document.getElementById("pull");
      return Boolean(e && !e.hidden && e.querySelector(".now") && window.__reveal().drawn === 1);
    }, null, { timeout: 12000, polling: 30 });
    await p.waitForFunction(() => {
      const n = document.querySelector("#pull .now");
      return Boolean(n) && n.dataset.stage === String(4);
    }, null, { timeout: 12000, polling: 30 });
    plateOpen = true;
  } catch (e) { plateOpen = false; }
  if (!plateOpen) {
    check("pullshow:the-name-sits-on-a-plate-not-on-the-artwork", false, "unmeasured: no single-card round opened");
    check("pullshow:a-stat-value-stands-beside-its-label", false, "unmeasured: no single-card round opened");
    check("pullshow:the-plate-leaves-the-face-clear", false, "unmeasured: no single-card round opened");
    check("control:a-transparent-plate-reddens-the-name-axis", false, "unmeasured: no single-card round opened");
  } else {
    const wide = await plateAt(1280, 720);
    const tight = await plateAt(740, 360);
    const plateSay = (x) => (x ? x.vw + "x" + x.vh : "unmeasured");
    const plateFlat = (x) => Boolean(x) && Boolean(x.ink) && x.ink.n > 0 && x.ink.off === 0;
    const statNear = (x) => Boolean(x) && x.rows.length === STAT_ROWS
      && x.rows.every((r) => r.gap <= x.gap2 * 2);
    const faceClear = (x) => Boolean(x) && x.plateTop > x.headBottom;
    const pair = (f) => [wide, tight].map(f).join(" | ");
    check("pullshow:the-name-sits-on-a-plate-not-on-the-artwork",
      plateFlat(wide) && plateFlat(tight),
      pair((x) => (!x ? "unmeasured" : plateSay(x) + " " + x.ink.off + " of " + x.ink.n
        + " samples off the plate " + x.bg + ", worst channel " + x.ink.worst + " over " + PIXEL_TOL
        + ", luminance sd " + x.ink.sd.toFixed(1))));
    check("pullshow:a-stat-value-stands-beside-its-label",
      statNear(wide) && statNear(tight),
      pair((x) => (!x ? "unmeasured" : plateSay(x) + " widest gap "
        + top(x.rows.map((r) => r.gap)).toFixed(1) + "px over " + (x.gap2 * 2) + " across "
        + x.rows.length + " rows")));
    check("pullshow:the-plate-leaves-the-face-clear",
      faceClear(wide) && faceClear(tight),
      pair((x) => (!x ? "unmeasured" : plateSay(x) + " plate top " + x.plateTop
        + "px against head bottom " + x.headBottom + "px of a " + x.cardH + "px card")));
    /* 대조군. 판의 바탕만 투명으로 심으면 이름 자리가 그림으로 돌아가야 하고, 걷으면 다시 판이어야 한다.
       한쪽만 보면 늘 빨간 자와 실제로 재는 자를 못 가른다. */
    const coat = await p.addStyleTag({ content: "#pull .now .foot{background:transparent}" });
    await p.waitForTimeout(140);
    const bare = await plateAt(1280, 720);
    await coat.evaluate((e) => e.remove());
    await p.waitForTimeout(140);
    const back = await plateAt(1280, 720);
    check("control:a-transparent-plate-reddens-the-name-axis",
      plateFlat(bare) === false && plateFlat(back) === true,
      "a transparent plate left " + (bare ? bare.ink.off + " of " + bare.ink.n + " samples off "
        + bare.bg + ", worst channel " + bare.ink.worst : "nothing measured") + "; removing it read "
      + (back ? back.ink.off + " of " + back.ink.n + " off " + back.bg : "nothing measured"));
  }

  check("console:no-errors", errs.length === 0, errs.slice(0, 2).join(" | ") || "clean");
  await ctx.close();

  console.log("표본 범위: 묶음 한 회차 열한 장을 프레임마다 적어 사다리로, 봉인·실루엣·열린 단은 낱장 회차의 카드 화소로, 등급 갈래는 전설 선반 한 장으로, 확률 표는 이적시장 선반 한 바퀴로");
  if (notes.length) console.log(notes.map((x) => "  ok   " + x).join(LINE));
  if (fails.length) console.log(fails.map((x) => "  FAIL " + x).join(LINE));
  console.log(fails.length ? "pullshow FAIL " + fails.length : "pullshow PASS " + notes.length);
  if (fails.length) process.exitCode = 1;
} finally {
  clearTimeout(t);
  if (b) await b.close();
}
