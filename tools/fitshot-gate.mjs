import { readFileSync } from "node:fs";
import { chromium } from "playwright";
import { KEEPERS, KICKERS } from "../src/roster.mjs";

// 시착실 미리보기의 자. 이 칸이 답하는 질문은 걸친 뒤의 내가 어떻게 보이는가인데,
// 겨냥이 몸통이면 카메라는 허리를 보고 머리는 프레임 위로 밀려 나간다.
// 잘린 것은 화면에서 바로 안 드러난다. 그림은 있고 색도 맞으므로, 무엇이 없는지를 세는 자가 없으면
// 머리 없는 사람을 파는 상점이 조용히 초록으로 남는다.
//
// 축은 둘이고 서로 다른 것이 답한다. 위쪽 8% 행에 사람 화소가 없는가는 화소가 답하고,
// 머리 반지름 상자가 프레임 안인가는 투영이 답한다. 화소만으로는 머리와 어깨가 안 갈린다.
// 체격 둘을 나란히 세우는 이유는 겨냥이 한 체격에만 맞을 수 있기 때문이다. 로스터의 다른 끝은
// 그때 잘린 채로 팔린다.
//
// 대조군 둘. 위쪽 띠에 표식을 심으면 그 수만큼 잡혀야 하고(자가 그 자리를 정말 보는가),
// 키 큰 몸과 작은 몸은 서로 다른 그림이어야 한다(체격 손잡이가 정말 굽는 데까지 닿았는가).
//
// 구운 그림이 온전해도 그것을 거는 칸이 자르면 사람은 잘린 그림을 본다. 그래서 갈래가 둘이다.
// 구운 PNG를 재는 갈래와, 화면에 그려진 칸을 찍어서 재는 갈래다. 앞엣것만 있을 때 발이 잘린 채로
// 아홉 축이 초록이었다(실측: 172x172 칸에 172x229 그림이 서서 아래 57px이 잘렸다).
const EXE = process.env.LOCALAPPDATA + "/ms-playwright/chromium-1228/chrome-win64/chrome.exe";
const BASE = "http://127.0.0.1:10310/web/index.html?seed=20&preset=rich,veteran";
// 몸에 걸치는 여덟 선반. 시착실은 선반과 같이 다시 그려지므로 탭마다 새로 굽힌다.
const TABS = ["glove", "boot", "kit", "sock", "frame", "city", "hair", "ink"];
// 로스터의 두 극단 바깥까지 벌린다. 168과 200 사이만 재면 프레임이 체격을 따라가는지가 안 드러난다.
const BODIES = [[205, 96], [165, 62]];
// 화면에 거는 두 폭. 계획이 정한 모바일 하한과 데스크톱 기준이다.
const VIEWS = [[1280, 720], [740, 360]];
// 그려진 그림이 칸 밖으로 나갔는지 재는 여유. 반올림 때문에 0은 못 쓴다.
const EDGE_SLACK = 0.5;
// 위쪽 8%. 정수리 위에 이만큼도 여백이 없으면 머리가 프레임 변에 닿아 있고, 머리 한 등급만 커져도 잘린다.
const TOP_BAND = 0.08;
// 위쪽 띠에 심는 표식. 10x4=40화소이고 4행은 어느 프레임에서도 8% 띠 안이다.
const MARK = { w: 10, h: 4 };
// 아래쪽 2%. 발이 변에 닿으면 그 그림은 전신이 아니라 발목에서 끊긴 그림이다.
const FOOT_BAND = 0.02;
/* 세로로 55%. 이 아래로 내려가면 사람이 칸 가운데 작게 선 그림이라, 잘리지 않았다는 사실만으로
   통과하는 겨냥이 생긴다. 카메라는 하나이고 두 체격은 24% 갈리므로 작은 쪽 몫은 큰 쪽의 0.8배다.
   실측으로 키 205가 프레임 세로의 77.0%, 165가 59.4%를 쓴다. 이 바닥을 더 못 올리는 이유는
   아래 반사실이 매 판 다시 재서 같은 줄에 찍는다. 주석에만 사는 수는 다음 랩이 손으로 다시 유도한다. */
const SPAN_FLOOR = 0.55;
/* 카메라를 15% 당긴 반사실. 작은 체격의 몫은 0.594에서 0.70으로 오르지만, 그 대가로 가장 높은 머리를
   얹은 큰 체격이 프레임 밖으로 나간다. 어느 변이 먼저 깨지는지는 재서 찍는다.
   묶는 조건은 두 띠 중 하나가 깨지는 것이다. 둘 다 성하면 카메라를 당길 여지가 남은 것이고,
   그날은 바닥을 올릴 수 있게 된 날이므로 이 축이 빨개져 그렇게 말한다. */
const TIGHTER = 0.85;
// 배경과의 차이. 칸 바탕색에서 채널 하나라도 이만큼 벌어지면 사람이 그린 화소다.
const DIFF = 24;
// 미리보기 칸의 바탕색. 구운 그림은 투명 배경이라 화면이 실제로 보여 주는 것은 이 색 위에 얹힌 사람이다.
const CARD_BG = [0x12, 0x18, 0x0f];
/* 유니폼 선반이 파는 치수는 기장이다. 열두 벌의 기장 배율이 0.74에서 1.34까지 갈리는데,
   선반 카드에서는 그 치수가 구조상 안 읽힌다. 카드는 448x205 머리어깨 조각이고 그 겨냥이 목을 타므로,
   기장이 늘면 목도 같이 올라가 카드 안의 그림이 거의 제자리에 남는다(실측: 카드에서 가장 긴 벌과 가장 짧은 벌의
   밑단 차이가 다섯 벌 전부 0.000이고, 겨냥 거리를 1.7에서 2.1까지 밀어도 게이트 몸에서 0.005다).
   파는 치수가 화면에서 읽히는 자리는 시착실 온몸 그림뿐이고, 그것이 이 파일이 재는 그림이다.
   그런데 긴 벌이 아래로 더 내려오는가를 여태 어느 축도 안 물었다. 위의 축들은 잘렸는가와 프레임을 채우는가만
   묻고, 그 둘은 열두 벌이 전부 같은 기장이어도 초록이다. */
// 재는 몸은 게임이 만드는 몸의 봉투다. tools/thumb-gate.mjs가 쓰는 유도를 같은 소스에서 같은 방식으로 끌어온다.
// 위의 BODIES는 이 자의 다른 축이 쓰는 두 극단이라 섞지 않는다. 봉투를 손으로 베끼면 폭이 넓어진 날
// 넓어진 자리만 조용히 안 재고 초록이 난다.
const CHAIN = readFileSync(new URL("../src/chain.mjs", import.meta.url), "utf8");
const SIZED = KICKERS.concat(KEEPERS).filter((r) => Number.isFinite(r.height) && Number.isFinite(r.weight));
// 178 + Math.floor(rng() * 21)은 178에서 198까지다. 상한은 밑값 더하기 폭 빼기 하나다.
const rollOf = (hit) => (hit ? [Number(hit[1]), Number(hit[1]) + Number(hit[2]) - 1] : null);
const ROLL_H = rollOf(CHAIN.match(/const height = (\d+) \+ Math\.floor\(rng\(\) \* (\d+)\)/));
const ROLL_W = rollOf(CHAIN.match(/const weight = (\d+) \+ Math\.floor\(rng\(\) \* (\d+)\)/));
const bandOf = (key, roll) => [
  Math.min.apply(null, SIZED.map((r) => r[key]).concat(roll || [])),
  Math.max.apply(null, SIZED.map((r) => r[key]).concat(roll || []))
];
const BAND_H = bandOf("height", ROLL_H);
const BAND_W = bandOf("weight", ROLL_W);
// 여태 재 온 한 벌. 봉투의 귀퉁이가 아니라 옛 표본이라 맨 앞에 남긴다.
const KIT_BODY = { height: 188, weight: 84 };
const KIT_BODIES = [KIT_BODY,
  { height: BAND_H[0], weight: BAND_W[0] }, { height: BAND_H[0], weight: BAND_W[1] },
  { height: BAND_H[1], weight: BAND_W[0] }, { height: BAND_H[1], weight: BAND_W[1] }];
/* 셔츠만 남기는 표식. 굽기 전에 상의 색을 이 색으로 갈면 마스크에 드는 것이 셔츠와 어깨 스펀지뿐이고,
   양말과 반바지는 무슨 색이어도 안 걸린다. 밑단에서 색이 겹치는 문제가 이 한 수로 사라진다.
   색과 술어는 tools/thumb-gate.mjs가 쓰는 그대로다. 1.9배는 가장 보라에 가까운 상품(143,79,209)이
   안 걸리는 값이고, 색조로 고르므로 빛이 안 닿는 면에서 표식이 어두워져도 그 비율이 살아 있다. */
const KIT_MARK = 0xff00ff;
/* 기장이 이 폭 이하로 갈리는 쌍은 안 묻는다. 그 폭에서는 품과 어깨 스펀지가 밑단을 한 행 움직인다.
   실측: 165/65에서 기장 1.06이 250행, 1.10이 249행이고 두 기장의 차가 정확히 0.04다. 품이 0.94에서
   0.84로 줄고 스펀지가 0에서 1.9로 들어간 쌍이라, 그 한 행은 기장이 아니라 그 둘이 만든 것이다. */
const LEN_GUARD = 0.04;
/* 밑단 폭의 바닥. 가장 긴 벌과 가장 짧은 벌의 밑단 차이고, 실측은 188/84 0.185, 165/65 0.163,
   165/96 0.183, 200/65 0.185, 200/96 0.205다. 가장 좁은 것이 0.163이고 그 절반이 0.0815라,
   바닥은 소수 둘째 자리로 내린 0.08이다. 내리는 까닭은 바닥이 절반 위로 올라가면 안 되기 때문이다.
   아래 심는 대조군이 이 바닥을 매 판 다시 재서 같은 줄에 찍는다. 주석에만 사는 수는 다음 랩이 손으로 다시 유도한다. */
const HEM_FLOOR = 0.08;
const LINE = String.fromCharCode(10);
const t = setTimeout(() => { console.log("WATCHDOG"); process.exit(1); }, 240000);
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
  await p.waitForTimeout(1300);
  await p.evaluate(() => window.__shop(true));
  await p.waitForTimeout(400);

  // 한 장을 읽는다. 바탕색을 깔고 그 위에 굽는 그림을 얹어, 바탕과 다른 화소만 사람으로 센다.
  // mark가 오면 위쪽 띠에 그 크기의 표식을 같이 심는다. 대조군이 쓰는 자리다.
  // 판을 인자로 받는다. 화면을 찍는 갈래가 다른 폭의 판에서 같은 자를 써야 하기 때문이다.
  const measure = (pg, src, mark) => pg.evaluate(async (o) => {
    const im = new Image();
    await new Promise((res, rej) => { im.onload = res; im.onerror = rej; im.src = o.src; });
    const cv = document.createElement("canvas");
    cv.width = im.naturalWidth;
    cv.height = im.naturalHeight;
    const c = cv.getContext("2d");
    c.fillStyle = "rgb(" + o.bg.join(",") + ")";
    c.fillRect(0, 0, cv.width, cv.height);
    c.drawImage(im, 0, 0);
    if (o.mark) {
      c.fillStyle = "#ff00ff";
      c.fillRect(0, 0, o.mark.w, o.mark.h);
    }
    const d = c.getImageData(0, 0, cv.width, cv.height).data;
    const topRows = Math.round(cv.height * o.band);
    const footRow = cv.height - Math.round(cv.height * o.foot);
    let top = 0, foot = 0, all = 0, first = -1, last = -1;
    for (let y = 0; y < cv.height; y += 1) {
      for (let x = 0; x < cv.width; x += 1) {
        const i = (y * cv.width + x) * 4;
        if (Math.abs(d[i] - o.bg[0]) < o.diff && Math.abs(d[i + 1] - o.bg[1]) < o.diff && Math.abs(d[i + 2] - o.bg[2]) < o.diff) continue;
        all += 1;
        if (first < 0) first = y;
        last = y;
        if (y < topRows) top += 1;
        if (y >= footRow) foot += 1;
      }
    }
    return { w: cv.width, h: cv.height, all, top, foot, topRows,
      span: last < 0 ? 0 : (last - first + 1) / cv.height,
      crown: last < 0 ? -1 : first / cv.height, sole: last < 0 ? -1 : (last + 1) / cv.height };
  }, { src, mark: mark || null, bg: CARD_BG, diff: DIFF, band: TOP_BAND, foot: FOOT_BAND });

  // 화면에 걸린 그 그림. 시착실이 방금 구운 것을 그대로 읽는다.
  const shot = () => p.evaluate(() => { const i = document.querySelector("#shop .fitting .me img"); return i ? i.getAttribute("src") : ""; });
  // 머리 상자. 시착실이 쓰는 그 겨냥으로 다시 구워 투영을 읽고, 같은 장인지 url로 대조한다.
  const head = (kind) => p.evaluate(async (k) => {
    const m = await import("/web/src/render/thumb.mjs");
    const g = await import("/web/src/state/gear.mjs");
    const who = window.__keeperStats();
    return m.headBox(k, who, g.lookOf(window.__gear(), who.name));
  }, kind);
  const tab = (name) => p.evaluate((x) => { for (const e of document.querySelectorAll("#shop .tab")) if (e.dataset.tab === x) e.click(); }, name);

  const rows = [];
  const tallest = [];
  for (const [h, w] of BODIES) {
    await p.evaluate((o) => window.__setBody(o[0], o[1]), [h, w]);
    for (const name of TABS) {
      await tab(name);
      await p.waitForTimeout(220);
      const src = await shot();
      if (!src || src.indexOf("data:image") !== 0) { rows.push({ at: h + ":" + name, dead: true }); continue; }
      const box = await head("body");
      rows.push(Object.assign({ at: h + ":" + name, src, box }, await measure(p, src)));
    }
    /* 최악의 표본. 가장 높은 머리 등급을 걸친 한 장이다. 상점에서 걸쳐 보는 순간 시착실이 굽는 그림이
       이것이고, 정수리가 프레임 위로 나가는 것은 늘 이 등급에서 먼저 일어난다.
       걸치는 자리를 클릭으로 밟으면 이미 그 등급을 가진 계정에서는 아무 일도 안 일어나므로,
       시착실이 쓰는 그 함수를 같은 인자로 직접 부른다. */
    const worst = await p.evaluate(async () => {
      const m = await import("/web/src/render/thumb.mjs");
      const g = await import("/web/src/state/gear.mjs");
      const who = window.__keeperStats();
      const top = g.HAIRS.length - 1;
      const look = g.lookOf(Object.assign({}, window.__gear(), { hair: top }), who.name);
      return { rank: top, url: m.thumbURL("body", who, look) };
    });
    tallest.push(Object.assign({ at: h + ":hair" + worst.rank }, await measure(p, worst.url)));
  }
  /* 바닥값의 천장. 카메라를 당긴 반사실을 실제로 구워, 그때 가장 높은 머리의 정수리가 어디 서는지를 잰다.
     headBox가 지금 쓰는 거리를 같이 돌려주므로 겨냥 상수를 이 파일로 옮겨 적지 않는다.
     옮겨 적으면 겨냥이 움직인 날 두 곳이 갈리고, 이 반사실만 옛 거리를 말한다. */
  // 천장을 정하는 것은 큰 체격이다. 위 고리가 마지막에 심어 둔 몸은 작은 쪽이라, 여기서 다시 큰 쪽을 세운다.
  await p.evaluate((o) => window.__setBody(o[0], o[1]), BODIES[0]);
  const ceiling = await p.evaluate(async (k) => {
    const m = await import("/web/src/render/thumb.mjs");
    const g = await import("/web/src/state/gear.mjs");
    const who = window.__keeperStats();
    const look = g.lookOf(Object.assign({}, window.__gear(), { hair: g.HAIRS.length - 1 }), who.name);
    const now = m.headBox("body", who, look);
    const tight = m.headBox("body", who, look, { dist: now.dist * k });
    return { dist: now.dist, near: now.dist * k, url: tight.url };
  }, TIGHTER);
  const ceilingRead = await measure(p, ceiling.url);
  /* 대조군의 표본은 판이 닫히기 전에 뜬다. 아래 축은 화면 갈래를 다 돈 뒤에 판정하지만,
     그 판정이 읽는 그림은 여기서 이미 재어 둔 것이다. */
  const clean = rows.find((r) => !r.dead);
  const marked = clean ? await measure(p, clean.src, MARK) : null;
  const live = rows.filter((r) => !r.dead);
  /* 기장 표본. 열두 벌을 다섯 벌의 몸에 걸쳐 온몸 그림을 굽고, 셔츠 마스크의 가장 낮은 행을 밑단으로 읽는다.
     화면의 시착실 칸을 클릭으로 밟지 않고 굽는 자를 직접 부른다. 칸은 한 번에 한 벌만 걸고, 이미 가진 등급을
     밟으면 아무 일도 안 일어나므로 열두 벌이 한 판에서 안 걸린다.
     몸은 이 판에 심긴 몸을 안 쓴다. 위 고리와 천장 절이 __setBody로 몸을 갈아 놓으므로, 키퍼 객체에 키와
     몸무게를 직접 얹어 이 절이 어느 순서에 놓여도 같은 다섯 벌을 재게 한다.
     상의 말고 걸친 것은 이 판이 걸친 그대로 둔다. 열두 벌이 전부 같은 나머지를 쓰므로 견줄 수 있고,
     그 나머지에 표식 색과 부딪히는 것이 있는지는 표식 없는 장이 답한다. */
  const kit = await p.evaluate(async ([bodies, mark, flat]) => {
    const m = await import("/web/src/render/thumb.mjs");
    const g = await import("/web/src/state/gear.mjs");
    const hemOf = (url) => new Promise((res) => {
      const im = new Image();
      im.onload = () => {
        const cv = document.createElement("canvas");
        cv.width = im.width;
        cv.height = im.height;
        const c = cv.getContext("2d");
        c.drawImage(im, 0, 0);
        const d = c.getImageData(0, 0, im.width, im.height).data;
        let px = 0, low = -1, high = -1;
        for (let y = 0; y < im.height; y += 1) {
          for (let x = 0; x < im.width; x += 1) {
            const i = (y * im.width + x) * 4;
            const r = d[i], g2 = d[i + 1], bl = d[i + 2];
            if (!(r > g2 * 1.9 && bl > g2 * 1.9 && r > 40 && bl > 40 && d[i + 3] > 16)) continue;
            px += 1;
            low = y;
            if (high < 0) high = y;
          }
        }
        // 밑단은 행 번호 더하기 하나를 세로로 나눈 몫이다. 아래 변에서 잘린 셔츠가 정확히 1.000으로 읽힌다.
        res({ w: im.width, h: im.height, px, row: low,
          hem: low < 0 ? -1 : (low + 1) / im.height, collar: high < 0 ? -1 : high / im.height });
      };
      im.onerror = () => res({ w: 0, h: 0, px: -1, row: -1, hem: -1, collar: -1 });
      im.src = url;
    });
    const who = window.__keeperStats();
    const worn = window.__gear();
    const shelf = [];
    for (let rank = 0; rank < g.KITS.length; rank += 1) {
      for (let skin = 0; skin < g.skinsAt("pads", rank).length; skin += 1) {
        shelf.push({ tag: rank + ":" + skin, rank, skin, len: g.skinAt("pads", rank, skin).cut.len });
      }
    }
    // 기장 하나만 심는다. 품과 스펀지를 그대로 두는 까닭은 대조군이 기장 말고 아무것도 안 갈아야 하기 때문이다.
    const bake = (k, s, marked, len) => {
      const look = g.lookOf(Object.assign({}, worn, { pads: s.rank, padsSkin: s.skin }), who.name);
      if (marked) look.shirt = mark;
      if (len !== null) look.kitCut = Object.assign({}, look.kitCut, { len });
      return m.thumbURL("body", k, look);
    };
    const out = { shelf, by: [] };
    for (const at of bodies) {
      const k = Object.assign({}, who, { height: at.height, weight: at.weight });
      const row = { body: at.height + "/" + at.weight, live: [], flat: [] };
      for (const s of shelf) row.live.push(Object.assign({ tag: s.tag, len: s.len }, await hemOf(bake(k, s, true, null))));
      for (const s of shelf) row.flat.push(Object.assign({ tag: s.tag, len: s.len }, await hemOf(bake(k, s, true, flat))));
      row.bare = await hemOf(bake(k, shelf[0], false, null));
      out.by.push(row);
    }
    return out;
  }, [KIT_BODIES, KIT_MARK, 1]);
  const kitLong = kit.shelf.reduce((a, c) => (c.len > a.len ? c : a), kit.shelf[0]);
  const kitShort = kit.shelf.reduce((a, c) => (c.len < a.len ? c : a), kit.shelf[0]);
  const kitOrder = kit.shelf.slice().sort((a, c) => a.len - c.len);
  const hemAt = (row, key, tag) => row[key].find((r) => r.tag === tag);
  const spreadOf = (row, key) => hemAt(row, key, kitLong.tag).hem - hemAt(row, key, kitShort.tag).hem;
  const bandAt = (row, key) => Math.max.apply(null, row[key].map((r) => r.hem)) - Math.min.apply(null, row[key].map((r) => r.hem));
  /* 쌍으로 묻는다. 순위 상관 하나로 내면 어느 쌍이 뒤집혔는지가 그 수에 안 남아서, 빨개진 날 읽는 사람이
     열두 벌을 다시 굽는다. */
  const inverted = [];
  let asked = 0;
  for (const row of kit.by) {
    for (const a of row.live) {
      for (const c of row.live) {
        if (!(a.len > c.len + LEN_GUARD)) continue;
        asked += 1;
        if (a.hem >= c.hem) continue;
        inverted.push(row.body + " len " + a.len + " hem " + a.hem.toFixed(3) + " over len " + c.len + " hem " + c.hem.toFixed(3));
      }
    }
  }
  const tooFlat = kit.by.filter((row) => spreadOf(row, "live") < HEM_FLOOR);
  const kitBlind = kit.by.filter((row) => row.bare.px !== 0);
  const kitThin = kit.by.filter((row) => row.live.length !== kit.shelf.length || row.flat.length !== kit.shelf.length
    || row.live.concat(row.flat).some((r) => !(r.px > 0) || !(r.row >= 0)));
  const kitBakes = kit.by.length * kit.shelf.length * 2 + kit.by.length;
  await ctx.close();

  /* 화면 갈래. 구운 그림이 아니라 그 그림을 거는 칸을 찍는다.
     칸 안에 그림이 들어갔는가는 사각형 둘을 맞대서 답하고, 발이 살아 있는가는 찍은 화소가 답한다.
     둘 다 필요하다. 앞엣것만 보면 object-fit이 죽어도 사각형은 맞을 수 있고,
     뒤엣것만 보면 왜 잘렸는지가 안 남는다. */
  const cards = [];
  for (const [vw, vh] of VIEWS) {
    const vctx = await b.newContext({ viewport: { width: vw, height: vh } });
    const vp = await vctx.newPage();
    vp.on("pageerror", (e) => errs.push(String(e)));
    vp.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
    await vp.goto(BASE, { waitUntil: "load" });
    await vp.waitForSelector("#go", { timeout: 15000 });
    await vp.click("#go", { force: true });
    await vp.waitForTimeout(1300);
    await vp.evaluate(() => window.__shop(true));
    await vp.waitForTimeout(400);
    for (const [h, w] of BODIES) {
      await vp.evaluate((o) => window.__setBody(o[0], o[1]), [h, w]);
      await vp.evaluate(() => { for (const e of document.querySelectorAll("#shop .tab")) if (e.dataset.tab === "glove") e.click(); });
      await vp.waitForTimeout(300);
      const seat = await vp.evaluate(() => {
        const card = document.querySelector("#shop .fitting .me");
        const im = card && card.querySelector("img");
        if (!card || !im) return null;
        const s = getComputedStyle(card);
        const c = card.getBoundingClientRect();
        const i = im.getBoundingClientRect();
        // 칸의 안쪽 상자. 테두리는 그림이 설 자리가 아니므로 빼고 잰다.
        const bt = parseFloat(s.borderTopWidth) || 0, bl = parseFloat(s.borderLeftWidth) || 0;
        const br = parseFloat(s.borderRightWidth) || 0, bb = parseFloat(s.borderBottomWidth) || 0;
        const box = { x: c.x + bl, y: c.y + bt, w: c.width - bl - br, h: c.height - bt - bb };
        return { box, img: { x: i.x, y: i.y, w: i.width, h: i.height },
          over: { left: box.x - i.x, top: box.y - i.y, right: (i.x + i.width) - (box.x + box.w), bottom: (i.y + i.height) - (box.y + box.h) },
          clip: { x: Math.round(box.x), y: Math.round(box.y), width: Math.round(box.w), height: Math.round(box.h) } };
      });
      if (!seat) { cards.push({ at: vw + "x" + vh + ":" + h, dead: true }); continue; }
      /* 찍기 전에 진열을 잠깐 숨긴다. 좁은 폭에서 선반의 rack이 제 칸보다 넓어 왼쪽 기둥 위로 넘어오고,
         그 카드의 테두리가 미리보기 칸 안에서 발로 읽힌다(실측: 740x360에서 칸 오른쪽 아래 2px 띠).
         그 겹침은 이 칸의 결함이 아니라 진열 폭의 결함이라, 이 자는 칸이 스스로 그린 것만 본다. */
      await vp.evaluate(() => { const g = document.querySelector("#shop .goods"); if (g) g.style.visibility = "hidden"; });
      const png = await vp.screenshot({ clip: seat.clip });
      await vp.evaluate(() => { const g = document.querySelector("#shop .goods"); if (g) g.style.visibility = ""; });
      const shot = await measure(vp, "data:image/png;base64," + png.toString("base64"));
      cards.push(Object.assign({ at: vw + "x" + vh + ":" + h, seat }, shot));
    }
    await vctx.close();
  }
  const liveCards = cards.filter((c) => !c.dead);
  check("instrument:every-sample-drew-a-preview", rows.length === BODIES.length * TABS.length && live.length === rows.length,
    live.length + " of " + rows.length + " samples, " + (live[0] ? live[0].w + "x" + live[0].h : "none"));
  check("instrument:the-body-i-planted-is-the-body-in-the-picture",
    live.length > 1 && live[0].src !== live[live.length - 1].src && live.every((r) => r.all > 0),
    live.length ? "tall " + live[0].all + " px, short " + live[live.length - 1].all + " px" : "no samples");
  check("instrument:the-measured-picture-is-the-one-on-screen",
    live.length > 0 && live.every((r) => r.box && r.box.url === r.src),
    live.filter((r) => !r.box || r.box.url !== r.src).map((r) => r.at).join(", ") || live.length + " matched");
  check("instrument:every-card-was-drawn-and-shot",
    liveCards.length === VIEWS.length * BODIES.length && liveCards.every((c) => c.all > 0),
    liveCards.map((c) => c.at + " " + c.w + "x" + c.h + " " + c.all + "px").join(", ") || "no cards");
  /* 셔츠와 양말이 밑단에서 색으로 안 갈리는 문제를 표식이 없앤다. 그 표식이 정말 셔츠만 집는가는 같은 장을
     상의 색 그대로 한 번 더 구워서 답한다. 그 장에 표식 색 화소가 하나라도 있으면 아래 밑단은 셔츠가 아닌
     것을 같이 읽고 있고, 그러면 기장과 아무 상관 없는 자리가 밑단으로 찍힌다. */
  check("instrument:the-kit-hem-mask-catches-only-the-shirt",
    kit.by.length === KIT_BODIES.length && kit.shelf.length > 1 && kitThin.length === 0 && kitBlind.length === 0,
    kitThin.length || kitBlind.length
      ? kitThin.map((row) => row.body + " short of " + kit.shelf.length + " looks")
        .concat(kitBlind.map((row) => row.body + " " + row.bare.px + "px marked with the shirt tone left real")).join(", ")
      : kit.by.length + " bodies by " + kit.shelf.length + " looks on the "
        + kit.by[0].live[0].w + "x" + kit.by[0].live[0].h + " body shot, shirt "
        + Math.min.apply(null, kit.by.map((row) => Math.min.apply(null, row.live.map((r) => r.px)))) + ".."
        + Math.max.apply(null, kit.by.map((row) => Math.max.apply(null, row.live.map((r) => r.px))))
        + "px marked, and " + kit.by.map((row) => row.bare.px).join("/")
        + "px on the same bake with the shirt tone left real");

  /* 대조군. 같은 그림의 위쪽 띠에 40화소를 심고 다시 잰다. 그만큼 정확히 늘어야
     이 자가 그 자리를 보고 있는 것이고, 안 늘면 앞의 초록은 아무것도 못 본 초록이다. */
  check("control:a-planted-mark-in-the-top-band-is-counted",
    Boolean(marked) && marked.top - clean.top === MARK.w * MARK.h,
    marked ? (marked.top - clean.top) + " of " + (MARK.w * MARK.h) + " planted pixels over the top " + marked.topRows + " rows" : "no sample");
  /* 심는 대조군. 열두 벌의 기장을 전부 1로 갈아 굽고, 아래 폭 술어가 그 장에서 지는지 본다. 품과 스펀지는
     그대로 두므로 갈린 것이 기장 하나뿐이고, 그래서 이 대조군이 무너뜨리는 것도 기장 하나다.
     폭이 바닥 아래로 안 내려가면 그 술어는 선반의 기장표를 안 읽는 것이고, 그날 난 초록은 열두 벌이 한 기장이어도
     났을 초록이다. 실제로 선반 카드에서는 이 대조군과 파는 기장표가 같은 수를 내서 축이 안 선다. */
  check("control:one-cut-length-for-every-kit-flattens-the-hem",
    kit.by.length === KIT_BODIES.length && kit.by.every((row) => row.flat.every((r) => r.px > 0))
      && kit.by.every((row) => spreadOf(row, "flat") < HEM_FLOOR),
    "the planted cut length 1 on all " + kit.shelf.length + " looks, girth and padding left alone, reads spread "
    + kit.by.map((row) => row.body + " " + spreadOf(row, "flat").toFixed(3)).join(", ") + " against the floor "
    + HEM_FLOOR + ", and its whole hem band is " + kit.by.map((row) => bandAt(row, "flat").toFixed(3)).join("/")
    + " wide against the live " + kit.by.map((row) => bandAt(row, "live").toFixed(3)).join("/"));

  const cut = live.concat(tallest).filter((r) => r.top > 0);
  check("fitshot:the-crown-clears-the-top-band", cut.length === 0,
    cut.map((r) => r.at + " " + r.top + "px").join(", ")
    || (live.length + tallest.length) + " samples clear over " + (live[0] ? live[0].topRows : 0) + " rows, tallest hair at "
    + tallest.map((r) => r.at + " " + r.crown.toFixed(3)).join(", "));
  const outside = live.filter((r) => !r.box || r.box.x - r.box.rx < 0 || r.box.x + r.box.rx > 1 || r.box.y - r.box.ry < 0 || r.box.y + r.box.ry > 1);
  check("fitshot:the-head-box-sits-inside-the-frame", outside.length === 0,
    outside.map((r) => r.at + " " + (r.box ? r.box.x.toFixed(2) + "/" + r.box.y.toFixed(2) + " r" + r.box.ry.toFixed(2) : "no box")).join(", ")
    || live.map((r) => r.box.y.toFixed(2)).slice(0, 2).join(" ") + " top of frame");
  const grounded = live.concat(tallest).filter((r) => r.foot > 0);
  check("fitshot:the-feet-stay-off-the-bottom-edge", grounded.length === 0,
    grounded.map((r) => r.at + " " + r.foot + "px").join(", ") || (live.length + tallest.length) + " samples clear");
  const small = live.filter((r) => r.span < SPAN_FLOOR);
  // 프레임 안에서 사람이 선 자리. 두 체격의 정수리와 발끝을 몫으로 적어 두면
  // 다음 랩이 겨냥을 옮길 때 눈이 아니라 이 수에서 시작한다.
  const seat = BODIES.map((o) => {
    const mine = live.filter((r) => r.at.indexOf(o[0] + ":") === 0);
    return o[0] + " " + (mine.length ? mine[0].crown.toFixed(3) + "-" + mine[0].sole.toFixed(3) : "none");
  }).join(", ");
  /* 바닥값과 그 바닥이 못 올라가는 이유를 한 줄에 같이 찍는다. 당긴 프레임이 두 띠를 다 지키면
     카메라를 당길 여지가 남은 것이므로 이 축이 그날 빨개져 바닥을 올리라고 말한다. */
  const pinned = ceilingRead.top > 0 || ceilingRead.foot > 0;
  check("fitshot:the-whole-body-fills-the-frame", small.length === 0 && pinned,
    (small.length ? small.map((r) => r.at + " " + r.span.toFixed(3)).join(", ") + "; " : "lowest "
      + Math.min.apply(null, live.map((r) => r.span)).toFixed(3) + " of the frame height; ") + seat
    + "; floor " + SPAN_FLOOR + " pinned by the tallest hair at dist " + ceiling.near.toFixed(2)
    + " (" + TIGHTER + " of " + ceiling.dist.toFixed(2) + "), crown " + ceilingRead.crown.toFixed(3)
    + " sole " + ceilingRead.sole.toFixed(3) + ", " + ceilingRead.top + "px in the top band and "
    + ceilingRead.foot + "px in the bottom one");
  /* 긴 벌이 아래로 더 내려오는가. 선반이 기장으로 파는 열두 벌이 화면에서 그 순서대로 서야 한다.
     두 절로 묻는다. 앞 절은 순서이고, 뒤 절은 그 순서가 눈에 보일 만큼 벌어졌는가다. 앞 절만 두면 열두 벌이
     한 행씩 갈리는 그림도 초록이고, 뒤 절만 두면 양 끝 둘만 맞고 가운데가 뒤섞인 그림이 초록이다. */
  check("fitshot:a-longer-kit-cut-hangs-lower-on-the-body",
    kit.by.length === KIT_BODIES.length && asked > 0 && inverted.length === 0 && tooFlat.length === 0,
    (inverted.length ? "inverted " + inverted.join(", ") + "; " : "")
    + (tooFlat.length ? "under the floor " + HEM_FLOOR + " at "
      + tooFlat.map((row) => row.body + " " + spreadOf(row, "live").toFixed(3)).join(", ") + "; " : "")
    + "the hem falls with the cut on all " + asked + " pairs over " + LEN_GUARD + " of cut length apart, spread "
    + kit.by.map((row) => row.body + " " + spreadOf(row, "live").toFixed(3)).join(", ") + " between "
    + kitLong.tag + " len " + kitLong.len + " and " + kitShort.tag + " len " + kitShort.len
    + ", floor " + HEM_FLOOR + " at half the narrowest of those");
  /* 화면 축 하나. 그려진 그림이 칸 안에 들어갔는가. object-fit은 선언만으로는 아무것도 안 하고,
     퍼센트 높이가 안 풀리면 그림이 제 비율로 서서 칸 밖으로 흘러넘친다. 사각형 둘이 그것을 말한다. */
  const spilled = liveCards.filter((c) => c.seat.over.left < -EDGE_SLACK || c.seat.over.top < -EDGE_SLACK
    || c.seat.over.right > EDGE_SLACK || c.seat.over.bottom > EDGE_SLACK);
  check("fitshot:the-rendered-picture-fits-its-card", spilled.length === 0,
    spilled.map((c) => c.at + " img " + Math.round(c.seat.img.w) + "x" + Math.round(c.seat.img.h)
      + " in " + Math.round(c.seat.box.w) + "x" + Math.round(c.seat.box.h)
      + " spills " + Math.round(c.seat.over.bottom) + "px below").join(", ")
    || liveCards.map((c) => c.at + " " + Math.round(c.seat.img.w) + "x" + Math.round(c.seat.img.h)
      + " in " + Math.round(c.seat.box.w) + "x" + Math.round(c.seat.box.h)).join(", "));
  // 찍은 칸에서 발과 정수리가 살아 있는가. 칸이 자르면 잘린 자리에 사람 화소가 변까지 닿는다.
  const cutFeet = liveCards.filter((c) => c.foot > 0);
  check("fitshot:the-feet-survive-on-screen", cutFeet.length === 0,
    cutFeet.map((c) => c.at + " " + c.foot + "px on the bottom edge").join(", ")
    || liveCards.map((c) => c.at + " sole " + c.sole.toFixed(3)).join(", "));
  const cutCrown = liveCards.filter((c) => c.top > 0);
  check("fitshot:the-crown-survives-on-screen", cutCrown.length === 0,
    cutCrown.map((c) => c.at + " " + c.top + "px on the top edge").join(", ")
    || liveCards.map((c) => c.at + " crown " + c.crown.toFixed(3)).join(", "));
  check("console:no-errors", errs.length === 0, errs.slice(0, 2).join(" | ") || "clean");

  console.log("표본 범위: 체격 " + BODIES.length + " × 장비 " + TABS.length + "탭 = " + rows.length
    + "장, 여기에 체격마다 가장 높은 머리 등급 한 장씩 " + tallest.length + "장, 그리고 화면에 그려진 칸을 찍은 것이 "
    + VIEWS.map((v) => v[0] + "x" + v[1]).join("과 ") + " 두 폭 × 체격 " + BODIES.length + " = " + cards.length + "장, 그리고 기장 축이 봉투 " + kit.by.length + "벌에 유니폼 " + kit.shelf.length
    + "벌을 걸쳐 표식 있는 장과 기장 1로 심은 장으로 두 번 굽고 표식 없는 장을 더한 " + kitBakes + "장");
  console.log("기장별 밑단: 몸 " + KIT_BODIES.map((k) => k.height + "/" + k.weight).join(" ") + " (봉투 "
    + BAND_H.join("..") + "cm " + BAND_W.join("..") + "kg, chain rng "
    + (ROLL_H ? ROLL_H.join("..") : "unread") + "cm " + (ROLL_W ? ROLL_W.join("..") : "unread") + "kg)");
  console.log("  " + "body".padEnd(8) + kitOrder.map((s) => (s.tag + "/" + s.len).padStart(9)).join("")
    + "   band   spread");
  for (const row of kit.by) {
    console.log("  " + row.body.padEnd(8) + kitOrder.map((s) => hemAt(row, "live", s.tag).hem.toFixed(3).padStart(9)).join("")
      + "   " + bandAt(row, "live").toFixed(3) + "   " + spreadOf(row, "live").toFixed(3));
    console.log("  " + "len 1".padEnd(8) + kitOrder.map((s) => hemAt(row, "flat", s.tag).hem.toFixed(3).padStart(9)).join("")
      + "   " + bandAt(row, "flat").toFixed(3) + "   " + spreadOf(row, "flat").toFixed(3));
  }
  if (notes.length) console.log(notes.map((x) => "  ok   " + x).join(LINE));
  if (fails.length) console.log(fails.map((x) => "  FAIL " + x).join(LINE));
  console.log(fails.length ? "fitshot FAIL " + fails.length : "fitshot PASS " + notes.length);
  if (fails.length) process.exitCode = 1;
} finally {
  clearTimeout(t);
  if (b) await b.close();
}
