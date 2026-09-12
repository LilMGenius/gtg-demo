import { readFileSync } from "node:fs";
import { chromium } from "playwright";
import { KEEPERS, KICKERS } from "../src/roster.mjs";

// 상품이 그림으로 서는지 재는 자.
// 글자만 있는 선반은 목록이지 진열이 아니다. 파는 것이 겉모습인데 그 겉모습을 안 보여 주면
// 무엇을 사는지가 값을 치른 뒤에야 드러난다.
//
// 가장 중요한 축은 등급끼리 그림이 다른가다. 네 등급이 같은 그림이면 상점은 같은 물건을
// 네 값에 팔고 있는 것이고, 그 사실은 값 옆의 이름만 봐서는 안 드러난다.
// 실측으로 장갑과 유니폼과 머리는 등급마다 색이 갈린다. 안 갈리는 선반이 생기면 여기서 먼저 빨개진다.
//
// 맥락은 하나여야 한다. 카드마다 WebGL을 열면 열 몇 장에서 상한에 걸려 조용히 검은 칸이 된다.
const EXE = process.env.LOCALAPPDATA + "/ms-playwright/chromium-1228/chrome-win64/chrome.exe";
const BASE = "http://127.0.0.1:10310/web/index.html?seed=20&preset=rich,veteran";
/* 어느 탭을 재는지는 화면이 정한다. 진열 격자를 세우는 탭은 전부 상품을 파는 선반이고,
   목록을 여기 손으로 적으면 선반이 하나 늘어난 날 그 하나만 조용히 안 재고 초록이 난다. */
/* 썸네일 칸의 바탕은 화면에서 읽는다. 여기 상수로 베껴 두면 hud.css가 그 색을 바꾼 날
   모든 화소가 바탕과 멀어져 잉크로 읽히고, 이 자의 모든 축이 영원히 초록이 된다.
   베낀 값이 틀렸다는 것을 아무도 못 보는 자리라, 아래의 빈 칸 대조군이 그 짝이다. */
// 바탕과 다르다고 볼 채널합 거리. 안티에일리어싱 잔파동은 한 자리 수라 24는 그 위다.
const SHOT_DELTA = 24;
/* 칸이 그림을 든다고 부를 최소 화소 비율. 실측으로 그림이 든 칸은 21.1퍼센트(머리)에서
   99.9퍼센트(동네) 사이이고 빈 칸은 0.0퍼센트였다. 0.10은 가장 마른 칸의 절반이라
   그림이 조금 작아지는 것으로는 안 울고, 칸이 비면 반드시 운다. */
const SHOT_INK = 0.1;
const LINE = String.fromCharCode(10);
const t = setTimeout(() => { console.log("WATCHDOG"); process.exit(1); }, 180000);
t.unref();

const fails = [], notes = [];
const check = (n, ok, d) => (ok ? notes : fails).push(n + " " + d);

/* 재는 몸은 게임이 만드는 몸이어야 한다. 유니폼 축들이 여태 키 188 몸무게 84 한 벌만 구웠고,
   한 벌에서 초록인 것은 그 한 벌에서 초록이라는 말뿐이다. 유니폼 칸의 겨냥은 목 관절을 타서
   체격이 갈리면 프레임 안의 자리도 같이 갈린다. 실측: 상품 무게중심 y가 이 벌에서 0.73인데
   키 205 몸무게 58에서 0.815로 상한 0.8을 넘었고, 198/74에서 남은 여유가 0.023이었다.
   그래서 체격을 이 파일에 안 적고 만드는 자리에서 읽는다. 무작위로 태어나는 키퍼의 폭은
   src/chain.mjs의 두 줄이 정하고, 명단에 적힌 몸은 src/roster.mjs가 줄마다 들고 있다.
   둘을 합친 봉투의 네 귀퉁이가 표본이다. 여기 상수로 베끼면 폭이 넓어진 날 넓어진 자리만
   조용히 안 재고 초록이 난다.
   표본 범위: 봉투 네 귀퉁이와 게이트 몸 188/84, 다섯 벌이다. 188/84를 남기는 까닭은 앞선
   회차의 수와 견줄 자리가 하나는 있어야 하기 때문이다. 성장 칸은 안 돈다. 키와 몸무게는
   태어날 때 받고 레벨을 안 타며, 굽는 자가 읽는 것도 그 둘뿐이다. */
const CHAIN = readFileSync(new URL("../src/chain.mjs", import.meta.url), "utf8");
const CREW = KICKERS.concat(KEEPERS);
const SIZED = CREW.filter((r) => Number.isFinite(r.height) && Number.isFinite(r.weight));
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
const GATE_BODY = { height: 188, weight: 84 };
const BODIES = [GATE_BODY,
  { height: BAND_H[0], weight: BAND_W[0] }, { height: BAND_H[0], weight: BAND_W[1] },
  { height: BAND_H[1], weight: BAND_W[0] }, { height: BAND_H[1], weight: BAND_W[1] }];
// 봉투가 게이트 몸을 담는지. 담지 않으면 다섯 표본 가운데 한 벌이 게임이 안 만드는 몸이고,
// 그 한 벌에서 난 초록은 게임이 만드는 어떤 몸도 안 지킨다. 손으로 남긴 수라 소스가 움직이면 먼저 어긋난다.
const HOLDS_GATE_BODY = BAND_H[0] <= GATE_BODY.height && GATE_BODY.height <= BAND_H[1]
  && BAND_W[0] <= GATE_BODY.weight && GATE_BODY.weight <= BAND_W[1];
// 세로 절과 깃 대조군이 이 이름에 걸리는 선반. 머리와 어깨가 칸 밖으로 나간 회귀가 이 칸에서
// 났고, 겨냥이 목 관절이다. 봉투는 여섯 선반이 다 돈다.
const WIDE_SHELF = "pads";
const ENVELOPE = "roster " + SIZED.length + " of " + CREW.length + " entries "
  + bandOf("height", null).join("..") + "cm " + bandOf("weight", null).join("..") + "kg, chain rng "
  + (ROLL_H ? ROLL_H.join("..") : "unread") + "cm " + (ROLL_W ? ROLL_W.join("..") : "unread")
  + "kg, envelope " + BAND_H.join("..") + "cm " + BAND_W.join("..") + "kg, bodies "
  + BODIES.map((k) => k.height + "/" + k.weight).join(" ")
  + ", gate body " + GATE_BODY.height + "/" + GATE_BODY.weight
  + (HOLDS_GATE_BODY ? " inside" : " outside") + " the envelope";

let b;
try {
  b = await chromium.launch({ executablePath: EXE });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } });
  const p = await ctx.newPage();
  const errs = [];
  p.on("pageerror", (e) => errs.push(String(e)));
  await p.goto(BASE, { waitUntil: "load" });
  await p.waitForSelector("#go", { timeout: 15000 });
  await p.click("#go", { force: true });
  await p.waitForTimeout(1300);
  await p.evaluate(() => window.__shop(true));
  await p.waitForTimeout(400);

  const grab = async (tab) => p.evaluate((t) => { for (const x of document.querySelectorAll("#shop .tab")) if (x.dataset.tab === t) x.click(); return new Promise((res) => setTimeout(() => { const cards = [...document.querySelectorAll("#shop .rack .card")]; res(cards.map((c) => { const i = c.querySelector(".shot img"); return i ? i.getAttribute("src") : ""; })); }, 260)); }, tab);

  /* 화면에 걸린 칸을 그대로 찍어 화소를 센다. 구운 그림의 주소를 읽는 것으로는
     그림이 사람 눈에 닿았다고 말할 수 없다. 주소가 멀쩡한 채로 칸이 0px이거나,
     칸이 접혔거나, 그림이 칸 밖으로 밀려도 주소는 그대로다. */
  const inkAt = async (box, bg) => {
    if (await box.count() === 0) return { w: 0, h: 0, ink: 0 };
    const png = (await box.screenshot({ timeout: 8000 })).toString("base64");
    return p.evaluate(([s, bg, delta]) => new Promise((res) => {
      const im = new Image();
      im.onload = () => {
        const cv = document.createElement("canvas");
        cv.width = im.width; cv.height = im.height;
        const g = cv.getContext("2d");
        g.drawImage(im, 0, 0);
        const d = g.getImageData(0, 0, im.width, im.height).data;
        let n = 0;
        for (let k = 0; k < d.length; k += 4) {
          if (Math.abs(d[k] - bg[0]) + Math.abs(d[k + 1] - bg[1]) + Math.abs(d[k + 2] - bg[2]) > delta) n += 1;
        }
        res({ w: im.width, h: im.height, ink: n });
      };
      im.src = "data:image/png;base64," + s;
    }), [png, bg, SHOT_DELTA]);
  };
  const inkOf = (i) => inkAt(p.locator("#shop .rack .card").nth(i).locator(".shot"), SHOT_BG);

  // 진열 격자를 세우는 탭만 선반이다. 이적시장은 사는 자리라 격자가 없다.
  const SHELF = await p.evaluate(() => {
    const out = [];
    for (const tab of [...document.querySelectorAll("#shop .tab")]) {
      tab.click();
      const rack = document.querySelector("#shop .rack");
      if (rack && rack.querySelectorAll(".card").length) out.push(tab.dataset.tab);
    }
    return out;
  });
  check("instrument:every-shelf-tab-was-found", SHELF.length > 0, SHELF.join(", "));

  // 바탕색은 화면이 소유한다. 칸을 하나 잡아 계산된 배경을 읽어 오고, 못 읽으면 재지 않는다.
  const SHOT_BG = await p.evaluate(() => {
    const e = document.querySelector("#shop .rack .card .shot");
    if (!e) return null;
    const m = getComputedStyle(e).backgroundColor.match(/[0-9.]+/g);
    return m && m.length >= 3 ? m.slice(0, 3).map(Number) : null;
  });
  check("instrument:the-box-background-came-from-the-page", SHOT_BG !== null,
    SHOT_BG ? "rgb(" + SHOT_BG.join(",") + ") read from getComputedStyle" : "could not read the shot background");

  let drawn = 0;
  const thin = [];
  for (const tab of SHELF) {
    const urls = await grab(tab);
    const painted = urls.filter((u) => u && u.indexOf("data:image") === 0);
    drawn += painted.length;
    // 칸마다 그려진 화소 비율. 가장 마른 칸이 이 선반의 답이다.
    const ratio = [];
    for (let i = 0; i < urls.length; i += 1) {
      const m = await inkOf(i);
      ratio.push(m.w * m.h ? m.ink / (m.w * m.h) : 0);
    }
    const worst = ratio.length ? Math.min.apply(null, ratio) : 0;
    if (worst < SHOT_INK) thin.push(tab + " " + (worst * 100).toFixed(1) + "%");
    check("thumb:" + tab + ":every-card-carries-a-picture",
      urls.length > 0 && painted.length === urls.length && worst >= SHOT_INK,
      painted.length + " of " + urls.length + " baked, thinnest box " + (worst * 100).toFixed(1) + "% painted");
    const uniq = new Set(painted);
    check("thumb:" + tab + ":ranks-do-not-share-one-picture", painted.length > 1 && uniq.size === painted.length, uniq.size + " distinct of " + painted.length);
  }
  check("instrument:some-card-was-painted", drawn > 0, drawn + " pictures");
  check("thumb:no-shelf-shows-a-blank-box", thin.length === 0, thin.join(", ") || SHELF.length + " shelves clear the floor");

  /* 대조군. 같은 규칙을 입힌 빈 칸을 선반에 심어, 잉크 자가 그것을 그림 없는 칸으로 읽는지 본다.
     이 자가 재는 것은 바탕에서 멀어진 화소 수인데, 바탕값이 틀리면 빈 칸조차 가득 찬 것으로 읽히고
     위의 모든 축이 뜻 없이 초록이 된다. 0이 아니라 문턱 아래인지를 묻는 이유는 칸에 테두리가 있고,
     그 2px 테두리가 반투명 흰색이라 바탕 위에서 실제로 잉크로 잡히기 때문이다. */
  await p.evaluate(() => {
    const rack = document.querySelector("#shop .rack");
    const card = document.createElement("div");
    card.className = "card gear";
    card.id = "inkProbe";
    const pic = document.createElement("div");
    pic.className = "pic";
    const shot = document.createElement("div");
    shot.className = "shot";
    pic.appendChild(shot);
    card.appendChild(pic);
    rack.appendChild(card);
  });
  await p.waitForTimeout(120);
  const blank = await inkAt(p.locator("#inkProbe .shot"), SHOT_BG);
  const blankRatio = blank.w * blank.h ? blank.ink / (blank.w * blank.h) : -1;
  check("control:a-blank-box-does-not-clear-the-ink-floor",
    blankRatio >= 0 && blankRatio < SHOT_INK,
    (blankRatio * 100).toFixed(1) + "% painted on an empty box, floor " + (SHOT_INK * 100).toFixed(0) + "%");
  await p.evaluate(() => { const q = document.getElementById("inkProbe"); if (q) q.remove(); });

  /* 재는 몸을 먼저 찍어 둔다. 아래 세 축이 이 다섯 벌을 돌고, 명단 한 줄이 몸을 안 들고 있거나
     src/chain.mjs의 두 줄을 못 읽거나 봉투가 게이트 몸 188/84를 놓치면 여기서 먼저 빨개진다.
     그러면 아래의 초록은 좁아진 봉투의 초록이다.
     봉투가 그 한 벌을 담는지 묻는 까닭은 다섯 표본 가운데 그것만 소스에서 안 끌어온 수이기
     때문이다. 앞선 회차와 견줄 자리로 손으로 남긴 수라, 명단이나 rng가 움직여 봉투가 그 수를
     벗어나면 게임이 안 만드는 몸 한 벌을 계속 재면서 초록이 난다.
     표본 수를 세는 술어는 이 자리에 못 쓴다. BODIES가 다섯 칸 리터럴이라 그 수는 소스가
     어떻게 움직여도 다섯이고, 못 틀리는 술어는 재는 자리를 차지한 채 아무것도 안 잰다. */
  check("instrument:the-body-envelope-came-from-the-game",
    Boolean(ROLL_H) && Boolean(ROLL_W) && SIZED.length === CREW.length && HOLDS_GATE_BODY
    && BAND_H[0] < BAND_H[1] && BAND_W[0] < BAND_W[1], ENVELOPE);

  // 이름이 형태를 말하는 선반들. 머리는 깎아준 머리와 투블럭과 기른 머리와 모히칸이고,
  // 축구화는 실내화와 닳은 축구화와 스터드 여섯 개와 스파이크다.
  // 위의 축은 그림 파일이 다른가만 보므로 색 한 값만 바꿔도 통과한다. 두 선반 다
  // 네 등급의 IoU가 1.0000인 채로 팔리고 있었다.
  //
  // 색을 상수로 못 박고 그 색이 칠해진 자리만 세면 남는 변수는 형태뿐이다.
  // 껍데기는 두개골 안쪽에도 걸치므로 겉 실루엣이 아니라 칠해진 화소를 봐야 한다.
  //
  // 어느 선반을 재는지는 데이터가 정한다. 등급 줄이 cut을 들고 있으면 그 선반은
  // 형태를 판다고 스스로 선언한 것이다. 새 선반에 cut을 붙이면 이 자가 따라온다.
  /* 심는 대조군의 겨냥. lift는 겨냥점을 세로로 옮기는 값이라, 내리면 사람이 칸에서 위로 오른다.
     -0.5는 깃이 칸 위 변에 닿는 자리다. 실측으로 상의가 칠한 첫 줄이 게이트 몸에서
     -0.2에 0.259, -0.3에 0.151, -0.4에 0.039, -0.5에 0.000이다. 다섯 벌이 모두 -0.5에서 0.000이고
     한 칸 앞인 -0.4까지는 다섯 벌 다 초록이라, 이 값은 문턱을 스치는 자리가 아니다. */
  const PADS_DROP = { lift: -0.5 };
  const shapes = await p.evaluate(async ([bodies, wide, drop]) => {
    const m = await import("/web/src/render/thumb.mjs");
    const g = await import("/web/src/state/gear.mjs");
    // 어느 등급의 색도 아니고 살색과도 먼 값이라 이 색이 찍힌 자리는 머리 껍데기뿐이다.
    const MARK = 0xff00ff;
    const mask = (url) => new Promise((res) => {
      const im = new Image();
      im.onload = () => {
        const cv = document.createElement("canvas");
        cv.width = im.width; cv.height = im.height;
        const c = cv.getContext("2d");
        c.drawImage(im, 0, 0);
        const d = c.getImageData(0, 0, im.width, im.height).data;
        const a = [];
        // 색조로 고른다. 밝기로 고르면 등을 보는 칸처럼 빛이 안 닿는 면에서 표식이 어두워져
        // 칠해진 자리가 0으로 읽힌다. 표식은 초록이 0이라 어두워져도 비율이 살아 있다.
        // 1.9배는 가장 보라에 가까운 상품인 문어 빨판 장갑(143,79,209)이 안 걸리는 값이다.
        for (let i = 0; i < d.length; i += 4) {
          const r = d[i], g2 = d[i + 1], bl = d[i + 2];
          a.push(r > g2 * 1.9 && bl > g2 * 1.9 && r > 40 && bl > 40 && d[i + 3] > 16 ? 1 : 0);
        }
        a.w = im.width; a.h = im.height;
        res(a);
      };
      im.src = url;
    });
    const iou = (x, y) => { let i = 0, u = 0; for (let n = 0; n < x.length; n++) { if (x[n] && y[n]) i++; if (x[n] || y[n]) u++; } return u ? i / u : 1; };
    // tab은 겨냥표의 키, field는 장비 칸 이름, look은 그 선반이 칠하는 색의 자리다.
    const TABLE = [
      { tab: "hair", field: "hair", look: "hair", rows: g.HAIRS },
      { tab: "studs", field: "studs", look: "boot", rows: g.BOOTS },
      { tab: "grip", field: "grip", look: "glove", rows: g.GLOVES },
      { tab: "pads", field: "pads", look: "shirt", rows: g.KITS },
      { tab: "socks", field: "socks", look: "sock", rows: g.SOCKS },
      { tab: "ink", field: "ink", look: "ink", rows: g.TATTOOS }
    // 형태 값이 등급 줄에 있을 수도 있고, 그 등급의 변형 목록에 있을 수도 있다.
    // 한쪽만 보면 변형을 들인 선반이 조용히 이 자에서 빠진다. 실제로 그렇게 두 선반이 빠졌다.
    ].filter((s) => s.rows.every((r, i) => (g.SKINS[s.field] ? g.skinAt(s.field, i, 0).cut : r.cut)));
    const out = [];
    for (const s of TABLE) {
      const bake = (n, k, over) => { const look = g.lookOf({ [s.field]: n }); look[s.look] = MARK; return m.thumbURL(s.tab, k, look, over); };
      const ranks = s.rows.map((r, i) => i);
      // 무게중심과 칠해진 자리의 상자. 물건이 칸 구석에 걸쳐 있으면 화소 수는 넉넉해도 사람은 잘린 물건을 본다.
      const midOf = (x) => {
        let sx = 0, sy = 0, n = 0, x0 = x.w, x1 = -1, y0 = x.h, y1 = -1;
        for (let i = 0; i < x.length; i++) if (x[i]) {
          const cx = i % x.w, cy = Math.floor(i / x.w);
          sx += cx; sy += cy; n++;
          if (cx < x0) x0 = cx;
          if (cx > x1) x1 = cx;
          if (cy < y0) y0 = cy;
          if (cy > y1) y1 = cy;
        }
        /* 상자는 화소 경계를 분수로 옮긴다. x0과 y0은 첫 칸의 자리라 변에 닿으면 0이고, x1과 y1은
           끝 칸의 다음 자리라 변에 닿으면 1이다. 그래서 변에서 잘린 것이 0과 1로만 읽힌다.
           칠한 자리가 없으면 무게중심도 상자도 없다. 어느 술어에도 안 드는 값으로 돌려준다. */
        return n ? { n, x: sx / n / x.w, y: sy / n / x.h,
          x0: x0 / x.w, x1: (x1 + 1) / x.w, y0: y0 / x.h, y1: (y1 + 1) / x.h }
          : { n: 0, x: -1, y: -1, x0: -1, x1: 2, y0: -1, y1: 2 };
      };
      /* 세 축이 다 봉투를 돈다. 굽는 장이 다섯 배가 되면 이 자가 제 시한 안에서 죽는다고 앞선
         회차가 적었지만 재지는 않았다. 실측으로 혼자 돌 때 19.51초에서 20.36초이고, 시한은 180초다.
         등급끼리 형태가 다른가와 무엇이든 칠했는가도 체격마다 답이 갈린다. 실측으로 머리 칸의
         가장 마른 등급이 188/84에서 1365인데 165/65에서 1096이고, 유니폼 칸의 최악 쌍이 188/84에서
         0.664인데 165/96에서 0.765다. 게이트 몸 한 벌은 어느 축에서도 최악의 귀퉁이가 아니다. */
      const per = [];
      let ms = null;
      for (const k of bodies) {
        const one = [];
        for (const n of ranks) one.push(await mask(bake(n, k)));
        if (!ms) ms = one;
        const pairs = [];
        for (let i = 0; i < one.length; i++) for (let j = i + 1; j < one.length; j++) pairs.push({ n: ranks[i] + "-" + ranks[j], v: iou(one[i], one[j]) });
        per.push({ body: k.height + "/" + k.weight, mid: one.map(midOf), pairs,
          cover: one.map((x) => x.reduce((a, b) => a + b, 0)) });
      }
      /* 심는 대조군은 겨냥을 내려 깃을 칸 위로 밀어낸 장이다. 유니폼 칸에서 게이트 몸 한 벌만 굽는다.
         깃이 칸을 벗어난다는 것은 한 벌에서 이미 판가름 나고, 다섯 벌로 늘리면 굽는 장만 다섯 배가 된다.
         아래 머리 자가 옛 고정 보정을 되심는 것과 같은 자리다. */
      const plant = s.tab === wide ? midOf(await mask(bake(ranks[0], bodies[0], drop))) : null;
      const twice = await mask(bake(ranks[ranks.length - 1], bodies[0]));
      out.push({ tab: s.tab, per, plant, control: iou(ms[ms.length - 1], twice) });
    }
    return out;
  }, [BODIES, WIDE_SHELF, PADS_DROP]);
  check("instrument:some-shelf-declares-a-shape", shapes.length > 0, shapes.map((s) => s.tab).join(", "));
  /* 여섯 선반이 다 봉투를 돈다. 표본이 접혔는지는 걷어 온 표본에서 되읽는다. 폭이 접힌 선반은
     굽기만 하고 판정에서 빠질 수 있고, 그때 메시지의 몸 목록에만 흔적이 남아서 그 줄을 세지
     않으면 다섯 벌을 잰 초록과 구별이 안 된다. 이름도 같이 묻는다. 이 파일의 겨냥표는 선반
     이름을 손으로 들고 있어서, gear.mjs가 칸 이름을 바꿔도 여기 적힌 이름으로 계속 걷는다.
     그때 폭은 멀쩡하고 이름만 게임에 없다. 장비표에 묻는 까닭은 그것이 걷은 표본과 다른 곳에서
     오기 때문이다. 화면 탭 목록은 이 물음에 못 쓴다. 탭은 kit과 glove로 서고 겨냥표는 pads와
     grip으로 서서, 두 이름공간이 애초에 다르다. */
  // 선반 이름의 원장은 gear.mjs다. 겨냥표가 손으로 든 이름 여섯을 그 원장에 대조한다.
  const GEAR_SHELVES = await p.evaluate(async () => {
    const g = await import("/web/src/state/gear.mjs");
    return Object.keys(g.SKINS);
  });
  const walked = shapes.filter((s) => s.per.length === BODIES.length);
  const named = shapes.filter((s) => GEAR_SHELVES.indexOf(s.tab) >= 0);
  check("instrument:every-shelf-walked-the-whole-envelope",
    shapes.length > 0 && walked.length === shapes.length && named.length === shapes.length,
    "walked the envelope " + (walked.map((s) => s.tab).join(" ") || "none") + ", samples "
    + shapes.map((s) => s.tab + " " + s.per.length).join(" ") + " of " + BODIES.length + " bodies, "
    + named.length + " of " + shapes.length + " names in the gear table");
  // 가운데 60퍼센트. 겨냥이 어긋나면 물건이 변으로 밀리고, 그때 칸에 담기는 것은 물건이 아니라
  // 그 옆에 붙은 몸이다. 축구화 칸이 정강이만 담고 있던 것을 아무 축도 못 봤다.
  /* 상한은 그대로 0.2에서 0.8이고 달라진 것은 표본이다. 축 이름은 선반마다 하나로 남긴다.
     체격마다 축을 세우면 어느 이름이 상품을 지키는 이름인지 읽는 사람이 골라야 하고,
     그 고르는 일은 아무도 안 한다. 판정은 그 선반이 잰 체격 전부이고, 메시지가 몸별 수를 든다. */
  /* 상한을 두 번 적지 않는다. 술어와 여유가 같은 수를 봐야 하고, 두 자리로 적으면 그 여유가
     안 읽힌다. 실측으로 200/65 1등급이 0.80으로 찍혔는데 세 자리로는 0.798이었다. 반올림한
     한 자리 뒤에 남은 여유가 0.001인지 0.005인지가 이 축이 답해야 하는 것이다. */
  const LOW = 0.2;
  const HIGH = 0.8;
  const midIn = (q) => q.x >= LOW && q.x <= HIGH && q.y >= LOW && q.y <= HIGH;
  const midGap = (q) => Math.min(q.x - LOW, HIGH - q.x, q.y - LOW, HIGH - q.y);
  const sayMid = (q) => q.x.toFixed(3) + "/" + q.y.toFixed(3);
  /* 유니폼 칸만 세로를 다르게 읽는다. 84a5b84에서 이 칸의 겨냥이 목 관절로 올라간 뒤로 상의의
     아래끝은 어느 체격 어느 등급에서도 448x205 칸 밖이다. 기장이 0.74에서 1.34까지인데 칸이
     머리와 어깨만 담으므로 밑단은 설계상 안 담긴다. 실측으로 다섯 체격 스무 장 전부 칠해진
     아래끝이 1.000이고, kit-dist.txt의 거리 훑기가 1.7에서 3.4까지 그 값을 못 움직였다.
     그래서 세로 무게중심이 재던 것은 상품이 칸에 담겼는가가 아니라 칸이 몸의 어디를 잘랐는가다.
     실측: 200/65 1등급이 0.798로 상한에서 0.002 남았고, 그 0.002는 칸 높이 205의 한 줄이다.
     옳게 구운 칸에서도 빨개질 수 있는 자리라 세로 절을 갈아낸다. 바뀌는 것은 재는 성질이고
     문턱은 아니다. 새 절은 깃이 칸 안에 있고 상의가 좌우로 안 잘렸는가다. 칠해진 상자의 x0이
     0보다 크고 x1이 1보다 작고 첫 줄 y0이 0보다 큰가를 묻는다. 밑단이 아래 변에서 잘리는 것은
     예상된 값이라 y1은 안 묻는다. 가로 무게중심은 그대로 든다. 그 절은 겨냥이 옆으로 밀리는
     회귀를 재고, 실측으로 이 칸에서 0.508에서 0.554 사이라 여유가 살아 있다.
     첫 줄의 여유는 실측으로 200/65 2등급의 0.215가 가장 작다. */
  const clipIn = (q) => q.x >= LOW && q.x <= HIGH && q.x0 > 0 && q.x1 < 1 && q.y0 > 0;
  const clipGap = (q) => Math.min(q.x - LOW, HIGH - q.x, q.x0, 1 - q.x1, q.y0);
  const sayClip = (q) => q.x.toFixed(3) + " collar " + q.y0.toFixed(3) + " sides "
    + q.x0.toFixed(3) + ".." + q.x1.toFixed(3) + " hem " + q.y1.toFixed(3);
  for (const s of shapes) {
    /* 0.75. 두 등급이 칠해진 자리의 4분의 3을 공유하면 사람은 같은 물건에 색만 바꾼 것으로 읽는다.
       판정은 다섯 벌의 모든 쌍이다. 실측으로 표본을 봉투로 넓히자 유니폼 1-3 쌍이 165/96에서
       0.765로 상한을 넘었고, 같은 쌍이 게이트 몸에서는 0.664다. 한 벌만 읽던 자리가 그 수를 못 봤다.
       나머지 선반의 최악 쌍은 장갑 0.736, 양말 0.735, 축구화 0.696, 문신 0.484, 머리 0.479다. */
    const twins = [];
    let twinWorst = null;
    for (const row of s.per) for (const x of row.pairs) {
      if (x.v > 0.75) twins.push(row.body + " " + x.n + " " + x.v.toFixed(3));
      if (!twinWorst || x.v > twinWorst.v) twinWorst = { v: x.v, at: row.body + " " + x.n };
    }
    check("thumb:" + s.tab + ":ranks-do-not-share-one-shape",
      s.per.length === BODIES.length && twins.length === 0,
      s.per.length + " of " + BODIES.length + " bodies, "
      + (twins.length ? "sharing at " + twins.join(", ") + "; " : "")
      + "worst pair " + twinWorst.v.toFixed(3) + " at " + twinWorst.at);
    /* 1000화소. 굽는 칸의 1퍼센트쯤이다. 이 아래로 내려간 등급은 껍데기가 몸 안으로 들어가
       그 값을 치른 사람만 맨몸이 된다. 실제로 높이를 줄여 짧은 머리를 만들다 이 값이 227까지 내려갔다.
       판정은 다섯 벌 전부다. 실측으로 가장 마른 장이 머리 1등급 165/65의 1096이고 게이트 몸의
       같은 등급은 1365라, 이 축이 지키는 자리도 게이트 몸이 아니다. */
    const starved = [];
    let leanest = null;
    for (const row of s.per) row.cover.forEach((n, i) => {
      if (n < 1000) starved.push(row.body + " rank " + i + " " + n);
      if (!leanest || n < leanest.n) leanest = { n, at: row.body + " rank " + i };
    });
    check("thumb:" + s.tab + ":every-rank-paints-something",
      s.per.length === BODIES.length && starved.length === 0,
      s.per.length + " of " + BODIES.length + " bodies, "
      + (starved.length ? "under the floor at " + starved.join(", ") + "; " : "")
      + "thinnest " + leanest.n + " at " + leanest.at + ", "
      + s.per.map((row) => row.body + " " + row.cover.join("/")).join(", "));
    const CLIP = s.tab === WIDE_SHELF;
    const inFrame = CLIP ? clipIn : midIn;
    const gapOf = CLIP ? clipGap : midGap;
    const say = CLIP ? sayClip : sayMid;
    const off = [];
    let tight = null;
    for (const row of s.per) {
      row.mid.forEach((q, n) => {
        if (!inFrame(q)) off.push(row.body + " rank " + n + " " + say(q));
        if (!tight || gapOf(q) < tight.gap) tight = { gap: gapOf(q), at: row.body + " rank " + n, q };
      });
    }
    /* 잰 벌 수가 술어에 든다. 여섯 선반이 다 다섯 벌이라, 표본이 접히면 메시지가 아니라 판정이
       먼저 답한다. 위의 두 축도 같은 수를 본다. 이름 자체가 어긋나 선반이 하나도 안 도는
       경우는 위의 계기가 잡는다. */
    const wantBodies = BODIES.length;
    check("thumb:" + s.tab + (CLIP ? ":the-shirt-keeps-its-collar-and-both-sides-in-frame" : ":the-goods-sit-inside-the-frame"),
      s.per.length === wantBodies && s.per.every((row) => row.mid.every(inFrame)),
      s.per.length + " of " + wantBodies + " bodies, "
      + (off.length ? "outside at " + off.join(", ") + "; all " : "")
      + s.per.map((row) => row.body + " " + row.mid.map(say).join(" ")).join(", ")
      + ", tightest " + tight.gap.toFixed(3) + " from the edge at " + tight.at + " " + say(tight.q));
    check("control:" + s.tab + ":the-same-cut-paints-the-same-pixels", s.control > 0.999, s.control.toFixed(4));
  }
  /* 심는 대조군. 위의 세로 절이 정말 무엇을 재는지는 그 절을 빨간 편으로 밀 수 있는 장이
     있는가로만 답한다. 90fb31d가 봉투 계기에서 걷어낸 결함이 그것이다. 다섯 칸 리터럴을 훑는
     술어는 소스가 어떻게 움직여도 못 틀렸다. 그래서 겨냥을 내려 깃을 칸 위로 밀어낸 장을 굽고,
     이 술어가 그 장에서 지는지 본다. 상의가 여전히 수천 화소를 칠하는지도 같이 묻는다. 빈 장은
     어느 절로도 지므로 빈 장으로 난 빨강은 깃을 잰 적이 없다. 유니폼 칸을 아예 안 걷은 날은
     이 자가 먼저 운다. */
  const wideKit = shapes.find((x) => x.tab === WIDE_SHELF);
  const plantSay = wideKit && wideKit.plant ? sayClip(wideKit.plant) + " on " + wideKit.plant.n + " marked pixels" : "nothing baked";
  check("control:" + WIDE_SHELF + ":a-dropped-aim-clips-the-collar-off-the-top",
    Boolean(wideKit) && Boolean(wideKit.plant) && wideKit.plant.n > 0
    && wideKit.plant.y0 === 0 && !clipIn(wideKit.plant),
    "the planted aim lift " + PADS_DROP.lift + " reads " + plantSay + ", the shipped aim reads "
    + (wideKit ? sayClip(wideKit.per[0].mid[0]) + " at " + wideKit.per[0].body + " rank 0" : "no kit shelf"));

  /* 유니폼 칸의 머리. 위의 네 축은 상의가 칸을 채우는지만 묻고, 그 상의를 입은 사람의 머리가
     칸에 있는지는 안 묻는다. 그래서 시작 상의 카드가 얼굴 없이 팔린 채로 넷 다 초록이었다.
     실측: 등급 0 변형 0에서 머리 중심이 프레임 위 -0.112에 섰고 눈 둘이 통째로 칸 밖인데,
     그 장이 칠한 상의 화소는 12667개라 잉크 축도 모양 축도 통과했다. 파운더가 그 칸을 보고
     그로테스크하다고 짚었다. 카드 넷 가운데 얼굴이 없는 것은 값이 0인 기본 등급 하나였다.
     자리는 계기가 준다. headBox가 머리 상자와 눈을, armBox가 어깨 상자를 그림 몫으로
     돌려주므로 겨냥 상수를 이 파일로 옮겨 적지 않는다.
     표본은 등급 넷에 변형 셋이다. 등급만 돌면 기장을 들고 있는 것이 변형이라 가장 긴 상의인
     기장 1.34가 표본에서 빠지고, 하필 그 한 장이 가장 나쁜 장이다.
     어깨를 따로 묻는 이유는 그것이 옛 고정 보정이 지키려던 값이기 때문이다. 머리만 묻는 자는
     겨냥을 위로 올리는 어떤 회귀에도 초록을 낸다. */
  // 심는 대조군. 이 자리로 겨냥을 되돌리면 기본 등급의 머리가 칸 밖으로 나가야 한다.
  /* 체격도 표본이다. 아래 두 축이 재던 몸은 188/84 하나였는데 게임은 그보다 넓은 몸을 만든다.
     BODIES가 소스에서 끌어온 봉투의 네 귀퉁이와 그 게이트 몸이고, 판정은 다섯 벌 전부다. */
  const OLD_PADS_AIM = { part: "torso", lift: 0.3 };
  /* 아래 바닥 자가 심는 겨냥. 부위는 파는 그대로 목이고 lift 한 칸만 흐른 값이다. 위의 자가 옛
     겨냥을 통째로 되심는 것과 달라야 한다. 실제로 나는 회귀는 부위가 바뀌는 것이 아니라 상수
     하나가 조용히 흐르는 것이고, 아래 자가 재는 띠도 그 흐름이다. */
  const HEAD_DROP = { lift: 0.3 };
  const heads = await p.evaluate(async ([old, bodies, drop]) => {
    const m = await import("/web/src/render/thumb.mjs");
    const g = await import("/web/src/state/gear.mjs");
    const read = (tag, len, hb) => ({ tag, len,
      top: hb.y - hb.ry, bot: hb.y + hb.ry, left: hb.x - hb.rx, right: hb.x + hb.rx,
      eyes: hb.eyes.map((e) => ({ x: e.x, y: e.y })) });
    const out = { by: [], was: [], down: [],
      shelf: { ranks: g.KITS.length, per: g.KITS.map((_, r) => g.skinsAt("pads", r).length) } };
    for (let at = 0; at < bodies.length; at += 1) {
      const k = { height: bodies[at].height, weight: bodies[at].weight };
      const row = { body: k.height + "/" + k.weight, live: [], arm: [] };
      for (let rank = 0; rank < g.KITS.length; rank += 1) {
        for (let skin = 0; skin < g.skinsAt("pads", rank).length; skin += 1) {
          const look = g.lookOf({ pads: rank, padsSkin: skin });
          const tag = rank + ":" + skin;
          const len = g.skinAt("pads", rank, skin).cut.len;
          row.live.push(read(tag, len, m.headBox("pads", k, look)));
          const ab = m.armBox("pads", k, look);
          row.arm.push({ tag, len, y0: ab ? ab.y0 : 1, parts: ab ? ab.parts : 0 });
          // 심는 대조군은 게이트 몸 한 벌에서만 굽는다. 옛 겨냥이 머리를 잃는다는 것은 한 벌에서
          // 이미 판가름 나고, 다섯 벌로 늘리면 굽는 장만 다섯 배가 된다.
          if (at === 0) out.was.push(read(tag, len, m.headBox("pads", k, look, old)));
          if (at === 0) out.down.push(read(tag, len, m.headBox("pads", k, look, drop)));
        }
      }
      out.by.push(row);
    }
    return out;
  }, [OLD_PADS_AIM, BODIES, HEAD_DROP]);
  const headIn = (r) => r.top >= 0 && r.bot <= 1 && r.left >= 0 && r.right <= 1;
  const eyesIn = (r) => r.eyes.length === 2 && r.eyes.every((e) => e.x >= 0 && e.x <= 1 && e.y >= 0 && e.y <= 1);
  const sayHead = (r) => r.tag + " len " + r.len + " box " + r.top.toFixed(3) + ".." + r.bot.toFixed(3)
    + " eyes " + (r.eyes.length ? r.eyes.map((e) => e.y.toFixed(3)).join("/") : "none");
  const looks = heads.shelf.per.reduce((a, c) => a + c, 0);
  const spread = heads.by.length * looks;
  const whole = (row) => row.live.length === looks && row.arm.length === looks;
  const lost = [];
  for (const row of heads.by) for (const r of row.live) if (!headIn(r) || !eyesIn(r)) lost.push(row.body + " " + sayHead(r));
  const cut = [];
  for (const row of heads.by) for (const r of row.arm) if (!(r.y0 >= 0)) cut.push(row.body + " " + r.tag + " len " + r.len + " shoulder top " + r.y0.toFixed(3));
  check("instrument:every-kit-look-returned-a-head-box",
    heads.by.length === BODIES.length && heads.by.every((row) => whole(row)
      && row.live.every((r) => r.bot > r.top) && row.arm.every((r) => r.parts >= 1)),
    heads.by.length + " bodies by " + looks + " looks measured, shoulder box over "
    + heads.by.map((row) => row.arm.map((r) => r.parts).join("/")).join(" and ") + " meshes");
  check("thumb:every-kit-look-keeps-its-head-in-frame",
    heads.by.length === BODIES.length && heads.by.every((row) => whole(row)
      && row.live.every((r) => headIn(r) && eyesIn(r))),
    lost.length ? lost.join(", ")
      : heads.shelf.ranks + " grades over " + heads.shelf.per.join("/") + " variants on "
        + heads.by.length + " bodies, box "
        + heads.by.map((row) => row.body + " " + Math.min.apply(null, row.live.map((r) => r.top)).toFixed(3)
          + ".." + Math.max.apply(null, row.live.map((r) => r.bot)).toFixed(3)).join(", ")
        + ", both eyes inside on all " + spread + ", longest shirt "
        + Math.max.apply(null, heads.by[0].live.map((r) => r.len)));

  /* 머리가 칸 밑으로 가라앉는 쪽은 여태 어느 축도 안 읽었다. 위 축은 머리 상자가 칸을 벗어나는
     자리만 묻고, 유니폼 축은 깃이 칸 위로 잘리는 자리만 묻는다. 그래서 겨냥이 내려앉아 사람이
     통째로 칸 밑으로 미끄러지는 동안 둘 다 초록이다. 실측: 0등급 장에 over lift +0.2를 주면 깃이 0.659에서
     0.688로 내려앉는데 머리 밑끝은 0.715라 아직 칸 안이고, 머리가 칸을 벗어나는 자리는 +0.5의
     1.005다. 그 사이 세 칸이 아무 축에도 안 걸렸다.
     바닥은 실측의 잔여로 정한다. 다섯 벌 열두 장에서 파는 바이트의 머리 밑끝이 가장 낮은 자리가
     0.517이고(188/84가 0.516, 165 두 벌이 0.513, 200 두 벌이 0.517), 겨냥을 흘리면 +0.1에 0.617,
     +0.2에 0.715, +0.3에 0.813이다. 파는 0.517과 +0.2의 0.715의 가운데가 0.616이고, 바닥은 그 값을
     백분위로 올린 0.62다. 올리는 까닭은 여유 하나다. 0.616으로 박으면 파는 바이트에 0.099만 남아
     0.1을 못 채운다. 0.62에서 파는 여유가 0.103이고 +0.2가 0.095 넘어 예순 장 전부 빨개진다.
     밑끝은 lift 한 칸에 0.098씩 움직이는 직선이라, 0.2 폭의 가운데는 구조상 +0.1 자리에 앉는다.
     그래서 이 바닥이 가르는 것은 +0.2부터이고 +0.1은 0.003 남기고 지나간다. 이 축이 약속하는 것도
     그 +0.2다. 바닥을 1.0으로 두는 갈래는 없다. 그 수는 위 축이 이미 묻는 값이라, 그러면 이 자는
     아무것도 새로 안 잰다.
     깃과 밑단을 밑끝 옆에 같이 찍는다. 머리 밑끝만 찍으면 그 아래 상의가 어디 있는지 읽는 사람이
     다른 줄에서 찾아야 한다. 그 두 수는 위의 유니폼 표본이 이미 잰 값이라 여기서 다시 안 굽는다. */
  const HEAD_FLOOR = 0.62;
  const HEAD_FLOOR_FROM = "midpoint of the shipped 0.517 and the +0.2 drift 0.715, raised to clear 0.1";
  const shirtAt = (body) => {
    const row = wideKit ? wideKit.per.find((x) => x.body === body) : null;
    if (!row) return "shirt unread";
    const ends = (k) => Math.min.apply(null, row.mid.map((q) => q[k])).toFixed(3)
      + ".." + Math.max.apply(null, row.mid.map((q) => q[k])).toFixed(3);
    return "collar " + ends("y0") + " hem " + ends("y1");
  };
  const chinOf = (row) => Math.max.apply(null, row.live.map((r) => r.bot));
  const sank = [];
  for (const row of heads.by) for (const r of row.live) {
    if (!(r.bot <= HEAD_FLOOR)) sank.push(row.body + " " + sayHead(r) + " " + shirtAt(row.body));
  }
  const lowChin = heads.by.length ? Math.max.apply(null, heads.by.map(chinOf)) : 2;
  check("thumb:" + WIDE_SHELF + ":the-head-keeps-a-floor-below-it",
    heads.by.length === BODIES.length && heads.by.every((row) => whole(row)
      && row.live.every((r) => r.bot <= HEAD_FLOOR)),
    (sank.length ? "through the floor " + HEAD_FLOOR + " at " + sank.join(", ") + "; all "
      : "floor " + HEAD_FLOOR + ", " + HEAD_FLOOR_FROM + ", ")
    + heads.by.map((row) => row.body + " chin " + chinOf(row).toFixed(3) + " " + shirtAt(row.body)).join(", ")
    + ", lowest chin " + lowChin.toFixed(3) + " with " + (HEAD_FLOOR - lowChin).toFixed(3)
    + " left on all " + spread + " looks");
  /* 심는 대조군. 위 바닥이 정말 무엇을 재는지는 그 술어를 빨간 편으로 밀 수 있는 장이 있는가로만
     답한다. 겨냥을 한 칸 흘린 장을 굽고 이 자가 그 장에서 지는지 본다. 같은 장에서 위 프레임 축이
     초록인지도 같이 묻는다. 둘이 같이 참이어야 이 바닥이 새로 여는 띠가 있다는 말이 되고, 프레임
     축이 같이 빨개지는 장으로 난 초록은 이미 재던 것을 두 번 적은 것이다. 상자가 제대로 굽혔는지는
     그 프레임 절이 같이 답한다. 눈 둘까지 칸에 든 장이라 빈 상자로 난 빨강이 아니다.
     게이트 몸 한 벌에서만 굽는다. 밑끝이 바닥을 지난다는 것은 한 벌에서 이미 판가름 나고,
     다섯 벌로 늘리면 굽는 장만 다섯 배가 된다. */
  const sunk = heads.down.filter((r) => r.bot > HEAD_FLOOR);
  const stillIn = heads.down.filter((r) => headIn(r) && eyesIn(r));
  check("control:" + WIDE_SHELF + ":a-drifting-aim-sinks-the-head-inside-the-frame",
    heads.down.length === looks && stillIn.length === looks && sunk.length > 0,
    "the planted aim lift " + HEAD_DROP.lift + " reads "
    + (heads.down.length ? sayHead(heads.down[0]) : "no planted look") + " and sinks through the floor "
    + HEAD_FLOOR + " on " + sunk.length + " of " + heads.down.length + " looks, inside the frame on "
    + stillIn.length + ", so the frame axis above keeps its green exactly where this floor reds");
  /* 이름이 술어와 같은 것을 말해야 한다. armBox가 돌려주는 것은 삼각근과 위팔의 상자이고 이 축이
     보는 것은 그 상자의 위끝 하나뿐이라, 지키는 것은 어깨선이 칸 위로 안 잘리는 것이다.
     삼각근 아래의 팔은 448x205 머리어깨 칸에서 구조상 칸 밖이다. 실측으로 그 상자 밑끝이
     1.085에서 1.713 사이라 이 커밋 앞에서도 뒤에서도 팔을 통째로 담은 장은 한 장도 없다.
     그래서 어깨를 통째로 담았다고 읽히는 옛 이름은 이 술어가 한 번도 잰 적 없는 것을 약속했다. */
  check("thumb:every-kit-look-keeps-its-shoulder-line-in-frame",
    heads.by.length === BODIES.length && heads.by.every((row) => row.arm.length === looks
      && row.arm.every((r) => r.y0 >= 0)),
    cut.length ? cut.join(", ")
      : "shoulder line top " + heads.by.map((row) => row.body + " "
        + Math.min.apply(null, row.arm.map((r) => r.y0)).toFixed(3)).join(", ")
        + " at the highest, inside the frame on all " + spread);
  const wasLost = heads.was.filter((r) => !headIn(r) || !eyesIn(r));
  const wasBase = heads.was.find((r) => r.tag === "0:0");
  check("control:the-old-fixed-lift-loses-the-base-kit-head",
    Boolean(wasBase) && !(headIn(wasBase) && eyesIn(wasBase)) && wasLost.length > 0,
    "the planted aim part torso lift 0.3 reads " + (wasBase ? sayHead(wasBase) : "no base kit")
    + " and loses the head on " + wasLost.length + " of " + heads.was.length + " looks ("
    + wasLost.map((r) => r.tag).join(" ") + ")");

  /* 타투 칸이 파는 것은 팔이 아니라 팔에 새긴 그림이다. 위의 축들은 등급끼리 다른가와
     무엇이든 칠해졌는가만 묻고, 그 그림이 칸에서 얼마를 차지하는지는 안 묻는다. 그래서
     무늬가 칸 위쪽 귀퉁이에 손톱만 하게 걸리고 나머지를 소매와 유니폼이 먹은 채로
     네 등급이 전부 초록으로 지나갔다. 실측: 옛 겨냥에서 세 유료 등급의 무늬가 칸의
     16.6과 18.4와 18.1퍼센트였고, 카드 크기에서 사람이 본 것은 타투가 아니라 어두운 쐐기였다.
     무늬는 색이 아니라 견줌으로 센다. 견주는 기준은 상점이 실제로 파는 맨살 칸, 곧 0등급을
     그대로 구운 장이다. 값을 치른 사람이 얻는 것은 그 칸과 달라진 화소이고, 그것이 산 그림이다.
     inkGrade만 0으로 내린 반사실을 기준으로 삼으면 안 된다. 그 장은 등급의 띠 폭 전체를
     한 번 덮어 칠하는데(texture.mjs의 0등급 분기), 1등급과 2등급이 팔리는 장은 그 자리를
     맨 소매로 둔다. 그래서 차이에 상품이 칠한 적 없는 대조군의 띠가 통째로 섞인다.
     실측: 2등급이 그 자로 84.4퍼센트였고 상품이 칠한 그림은 28.6퍼센트였다.
     색으로 고르는 길은 따로 막혀 있다. 0등급이 까는 띠가 같이 잡혀 맨살 대조군이 죽는다. */
  // 42퍼센트. 여기 박힌 상수다. db998fe에서 반사실 자가 잰 84.2퍼센트의 절반이고, 그 84.2도
  // 상수로 같이 찍는다. 절반이라는 문장을 살아 있는 최솟값으로 다시 세면 빨간 판에서
  // 42는 16.6의 절반이라는 거짓 문장이 찍힌다. 실제로 그렇게 찍힌 적이 있다.
  const INK_FILL = 0.42;
  const INK_FILL_FROM = "half of 84.2% measured at db998fe";
  // 채널 최대 차 8. 압축 잔파동과 안티에일리어싱 위이고, 아래의 회전 자가 쓰는 그 폭이다.
  const FILL_DELTA = 8;
  // 심는 대조군. 이 자리로 겨냥을 되돌리면 위의 축이 빨개져야 한다.
  const OLD_INK_AIM = { part: "arm", dist: 0.58, lift: -0.12, high: 0.08, yaw: -0.7 };
  /* 위의 자는 그림이 카드를 얼마나 덮는지만 묻는다. 그래서 카메라가 팔 윤곽 안에 들어앉아
     카드 넷이 전부 대각선 쐐기가 된 채로 초록이 났다. 실측: 세 유료 등급의 무늬가 카드의
     82.8과 77.0과 85.1퍼센트인데 사람이 본 것은 팔이 아니라 초록 귀퉁이가 붙은 쐐기였다.
     팔로 읽히게 하는 단서는 무늬 위쪽에 카드 제 표면이 남아 있는 것이다. 띠의 위 끝을 열마다
     찾아 그 위에서 파는 0등급 장의 색 상자에 드는 불투명 화소를 센다. 어깨의 유니폼도 그 색에
     들어 같이 세어진다. 이 축은 맨살을 안 센다. 셀 살이 없어서다. 3등급은 위팔의 0.98을 덮는
     소매라 띠 위에 남는 것은 어깨와 유니폼이고, 띠 위 상자 안 화소의 평균색이 15/63/51이다.
     카드의 불투명 화소 85993 가운데 붉은 채널이 100을 넘는 것이 하나도 없다.
     띠 아래는 안 묻는다. INK_FOOT 0.3이 띠의 발을 위팔 3할 지점에 박아 두어 가까운 겨냥에서는
     그 발이 카드 밖이고, 실측으로 0.39까지 띠 아래 불투명 화소가 0이다. 없는 것을 묻는 축은
     겨냥이 아니라 텍스처에 답을 요구한다.
     색 상자는 상점이 실제로 파는 0등급 장이 소유한다. 위의 자가 기준으로 삼는 그 한 장에서
     채널마다 5퍼센타일과 95퍼센타일을 읽고 6을 덧댄 상자다. 여기 색을 박으면 유니폼이나
     빛이 바뀐 날 모든 화소가 상자에 들고 이 축이 영원히 초록이 된다. */
  // 2000화소. 448x205 카드의 2.2퍼센트다. 실측으로 지금 겨냥이 5808과 8410과 3854라
  // 통과용으로 맞춘 수가 아니고, 0.28로 붙인 대조군이 995와 1785와 0으로 운다.
  const INK_SKIN = 2000;
  const SKIN_PAD = 6;
  // 심는 대조군. 이 거리로 붙으면 띠가 카드를 삼켜 위의 축이 빨개져야 한다.
  const NEAR_INK_DIST = 0.28;
  const fills = await p.evaluate(async ([delta, old, pad, nearDist, k]) => {
    const m = await import("/web/src/render/thumb.mjs");
    const g = await import("/web/src/state/gear.mjs");
    const read = (src) => new Promise((res) => {
      const im = new Image();
      im.onload = () => {
        const cv = document.createElement("canvas");
        cv.width = im.width; cv.height = im.height;
        const c = cv.getContext("2d");
        c.drawImage(im, 0, 0);
        res(c.getImageData(0, 0, im.width, im.height));
      };
      im.src = src;
    });
    const moved = (a, c) => {
      if (a.width !== c.width || a.height !== c.height) return -1;
      let d = 0;
      for (let i = 0; i < a.data.length; i += 4) {
        const hit = Math.max(Math.abs(a.data[i] - c.data[i]), Math.abs(a.data[i + 1] - c.data[i + 1]),
          Math.abs(a.data[i + 2] - c.data[i + 2]), Math.abs(a.data[i + 3] - c.data[i + 3]));
        if (hit > delta) d += 1;
      }
      return d / (a.width * a.height);
    };
    /* 카드 색 상자. 파는 0등급 장의 불투명 화소만 모아 채널마다 5에서 95퍼센타일을 읽는다.
       그 장이 이 겨냥에서 실제로 보여 주는 색의 폭이라, 겨냥이 움직이면 상자도 같이 움직인다.
       붉은 채널의 위 끝이 40이라 살색은 이 상자에 애초에 못 든다. */
    const toneOf = (im) => {
      const ch = [[], [], []];
      for (let i = 0; i < im.data.length; i += 4) {
        if (im.data[i + 3] <= 16) continue;
        ch[0].push(im.data[i]); ch[1].push(im.data[i + 1]); ch[2].push(im.data[i + 2]);
      }
      return ch.map((q) => {
        q.sort((x, y) => x - y);
        return q.length ? [q[Math.floor(q.length * 0.05)] - pad, q[Math.floor(q.length * 0.95)] + pad] : [1, 0];
      });
    };
    /* 띠 위의 카드 색. 열마다 파는 장과 달라진 첫 행이 띠의 위 끝이고, 그 위에서 카드 색 상자에
       드는 불투명 화소를 센다. 어깨의 유니폼도 그 색에 들어 같이 세어진다.
       열의 첫 행부터 띠면 그 열은 어깨가 카드 밖이라 세지 않는다. */
    const skinAbove = (a, c, box) => {
      if (a.width !== c.width || a.height !== c.height) return -1;
      const W = a.width, H = a.height;
      let n = 0;
      for (let x = 0; x < W; x += 1) {
        let top = -1;
        for (let y = 0; y < H; y += 1) {
          const i = (y * W + x) * 4;
          const hit = Math.max(Math.abs(a.data[i] - c.data[i]), Math.abs(a.data[i + 1] - c.data[i + 1]),
            Math.abs(a.data[i + 2] - c.data[i + 2]), Math.abs(a.data[i + 3] - c.data[i + 3]));
          if (hit > delta) { top = y; break; }
        }
        if (top <= 0) continue;
        for (let y = 0; y < top; y += 1) {
          const i = (y * W + x) * 4;
          if (a.data[i + 3] <= 16) continue;
          if (a.data[i] >= box[0][0] && a.data[i] <= box[0][1] && a.data[i + 1] >= box[1][0]
            && a.data[i + 1] <= box[1][1] && a.data[i + 2] >= box[2][0] && a.data[i + 2] <= box[2][1]) n += 1;
        }
      }
      return n;
    };
    const rig = async (over) => {
      const skin = await read(m.thumbURL("ink", k, g.lookOf({ ink: 0 }), over));
      const box = toneOf(skin);
      const sold = [], flat = [], above = [];
      for (let n = 0; n < g.TATTOOS.length; n += 1) {
        const bare = g.lookOf({ ink: n });
        bare.inkGrade = 0;
        const a = await read(m.thumbURL("ink", k, g.lookOf({ ink: n }), over));
        sold.push(moved(a, skin));
        flat.push(moved(a, await read(m.thumbURL("ink", k, bare, over))));
        above.push(skinAbove(a, skin, box));
      }
      return { sold, flat, above, box };
    };
    /* 대조군은 띠 위 축이 쓰는 장만 굽는다. 반사실까지 같이 구우면 한 회차가 아홉 장 더
       늘어나고, 이 판의 굽는 수는 옆 게이트의 page.goto를 30초 밖으로 밀어낸 적이 있다. */
    const nearSkin = async (dist) => {
      const over = { dist };
      const skin = await read(m.thumbURL("ink", k, g.lookOf({ ink: 0 }), over));
      const box = toneOf(skin);
      const above = [];
      for (let n = 0; n < g.TATTOOS.length; n += 1) {
        above.push(skinAbove(await read(m.thumbURL("ink", k, g.lookOf({ ink: n }), over)), skin, box));
      }
      return { above, box };
    };
    const live = await rig();
    const was = await rig(old);
    const near = await nearSkin(nearDist);
    const one = m.thumbURL("ink", k, g.lookOf({ ink: 0 }));
    const two = m.thumbURL("ink", k, g.lookOf({ ink: 0 }));
    return { live, was, near, base: { same: one === two, len: one.length } };
  }, [FILL_DELTA, OLD_INK_AIM, SKIN_PAD, NEAR_INK_DIST, GATE_BODY]);
  const pct = (x) => (x * 100).toFixed(1) + "%";
  const paid = fills.live.sold.slice(1);
  /* 자의 바닥. 위의 모든 수는 맨살 장 하나와 견준 차이라, 그 장이 구울 때마다 흔들리면
     차이가 세는 것은 상품이 아니라 굽는 잡음이다. 두 번 구워 글자까지 같은지 먼저 묻는다. */
  check("instrument:the-bare-skin-card-bakes-the-same-bytes", fills.base.same && fills.base.len > 0,
    fills.base.same ? "grade 0 baked twice is the same " + fills.base.len + " char still"
      : "grade 0 moved between two bakes");
  check("thumb:the-tattoo-fills-its-card", paid.length > 0 && paid.every((x) => x >= INK_FILL),
    "grades 1..3 paint " + paid.map(pct).join(" ") + " of the card over the sold bare-skin card, floor "
    + pct(INK_FILL) + " (" + INK_FILL_FROM + "); the forced-grade-0 counterfactual reads "
    + fills.live.flat.slice(1).map(pct).join(" ") + " on the same bakes");
  check("control:bare-skin-carries-no-tattoo", fills.live.sold[0] >= 0 && fills.live.sold[0] < 0.005,
    (fills.live.sold[0] * 100).toFixed(2) + "% on grade 0, the rank that sells no tattoo");
  const wasWorst = Math.min.apply(null, fills.was.sold.slice(1));
  check("control:the-old-arm-aim-misses-the-tattoo-floor", wasWorst >= 0 && wasWorst < INK_FILL,
    "the planted rig dist 0.58 lift -0.12 high 0.08 yaw -0.70 paints "
    + fills.was.sold.slice(1).map(pct).join(" ") + " (counterfactual "
    + fills.was.flat.slice(1).map(pct).join(" ") + "), worst " + pct(wasWorst)
    + " under the " + pct(INK_FILL) + " floor");
  const skinUp = fills.live.above.slice(1);
  const boxOf = (q) => q.map((c) => c[0] + ".." + c[1]).join("/");
  check("thumb:card-tone-stands-above-the-tattoo", skinUp.length > 0 && skinUp.every((n) => n >= INK_SKIN),
    "grades 1..3 keep " + skinUp.join(" ") + " opaque pixels above the band's top edge inside the tone box, floor "
    + INK_SKIN + "; the tone box r/g/b " + boxOf(fills.live.box)
    + " came from the sold grade-0 card's whole tone, the same still the fill axis measures against,"
    + " and the shoulder's uniform is inside it");
  const nearWorst = Math.min.apply(null, fills.near.above.slice(1));
  check("control:a-closer-arm-aim-loses-the-card-above-the-band", nearWorst >= 0 && nearWorst < INK_SKIN,
    "the planted rig dist " + NEAR_INK_DIST + " keeps " + fills.near.above.slice(1).join(" ")
    + " opaque pixels above the band inside the tone box (tone box " + boxOf(fills.near.box)
    + "), worst " + nearWorst + " under the " + INK_SKIN + " floor");

  // 대조군. 같은 등급을 두 번 구우면 같은 그림이어야 한다. 매번 달라지면 위의 다름은
  // 상품의 차이가 아니라 굽는 잡음이고, 그 축은 아무것도 증명하지 않는다.
  const twice = await p.evaluate(async (k) => {
    const m = await import("/web/src/render/thumb.mjs");
    const g = await import("/web/src/state/gear.mjs");
    const a = m.thumbURL("grip", k, g.lookOf({ grip: 1 }));
    const c = m.thumbURL("grip", k, g.lookOf({ grip: 1 }));
    const d = m.thumbURL("grip", k, g.lookOf({ grip: 3 }));
    return { same: a === c, differs: a !== d, len: a.length };
  }, GATE_BODY);
  check("control:the-same-item-bakes-the-same-picture", twice.same, String(twice.same) + " over " + twice.len + " chars");
  check("control:a-different-item-bakes-a-different-picture", twice.differs, String(twice.differs));

  // 하나의 맥락만 연다. 카드 수만큼 캔버스가 생기면 여기서 잡힌다.
  const canvases = await p.evaluate(() => document.querySelectorAll("canvas").length);
  check("thumb:one-canvas-serves-every-card", canvases <= 2, canvases + " canvases on the page");

  // 호버에서 도는가. 정지한 그림은 한 면만 보여 준다.
  const spin = await p.evaluate(async () => {
    const card = document.querySelector("#shop .rack .card");
    card.dispatchEvent(new PointerEvent("pointerenter", { bubbles: false }));
    await new Promise((r) => setTimeout(r, 120));
    const cv = card.querySelector("canvas");
    if (!cv) return { moved: false, turned: false };
    const one = cv.toDataURL();
    await new Promise((r) => setTimeout(r, 700));
    const two = cv.toDataURL();
    card.dispatchEvent(new PointerEvent("pointerleave", { bubbles: false }));
    await new Promise((r) => setTimeout(r, 120));
    return { moved: true, turned: one !== two, left: !card.querySelector("canvas") };
  });
  check("hover:the-live-view-moves-into-the-card", spin.moved, String(spin.moved));
  check("hover:the-item-turns-while-hovered", spin.turned, String(spin.turned));
  check("hover:the-live-view-leaves-when-the-pointer-does", spin.left === true, String(spin.left));

  /* 위의 세 축은 캔버스가 카드 안으로 들어왔는지만 묻는다. 그래서 캔버스가 정지 그림 아래
     칸에 서서 상자 밖으로 잘려도 초록이 났다. 실측: 호버 한 프레임 뒤 .shot 격자가 94.8px
     두 줄로 갈려 정지 그림이 124.9px에서 97.0px로 줄고, 캔버스는 y=318.7에 서서 상자
     아래변 348.8 밖으로 밀렸다. 눈에 닿은 것은 회전이 아니라 살짝 올라간 정지 그림이었다.
     그래서 여기는 누가 칸을 차지했는지를 묻는다. 정지 그림이 비켰는가, 캔버스가 칸을 채웠는가. */
  /* 캔버스가 정지 그림이 섰던 자리를 그대로 받는가를 잰다. 견주는 상대가 상자 안쪽이 아니라
     정지 그림인 이유는, 정지 그림 자체가 안쪽 상자와 안 맞기 때문이다. 실측: 장비 선반은
     208.46x124.87로 안쪽 상자 208.50x124.91보다 0.04px 작고, 봇과 버프 선반은
     208.48x126.55로 1.64px 크다. 굽는 판이 448x205와 448x269로 달라 격자 줄 높이가
     122.70px과 124.39px로 갈리기 때문이다. 안쪽 상자를 1px 안으로 맞추라고 하면 겹침을
     고친 뒤에도 봇 선반만 1.64px로 빨개지는데, 그것은 이 자가 잡으려는 겹침이 아니라
     원래부터 있던 줄 높이 몫이다. 그래서 자리는 정지 그림과 견주고, 안쪽 상자는 2px 안에서
     덮였는지만 본다. 캔버스가 반 칸에 머물거나 상자 밖으로 밀리면 두 수가 같이 크게 벌어진다. */
  const CELL_SLACK = 1;
  const CELL_SPILL = 2;
  /* 도는 것을 증명하는 화소 문턱. 8초 한 바퀴에서 0.5초는 22.5도라 옆면이 크게 바뀐다.
     채널 최대 차 8은 압축 잔파동과 안티에일리어싱 위다. 바닥은 둘로 잡는다. 안 도는 이웃 칸을
     같은 간격으로 두 번 찍은 몫과, 그 몫이 0으로 나올 때를 받는 고정값 0.02다. */
  const TURN_DELTA = 8;
  const TURN_SHARE = 0.02;
  const pngOf = (box) => box.screenshot({ timeout: 8000 }).then((x) => x.toString("base64"));
  const moveOf = (one, two) => p.evaluate(([a, c, d]) => Promise.all([a, c].map((s) => new Promise((res) => {
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
    for (let k = 0; k < u.data.length; k += 4) {
      const m = Math.max(Math.abs(u.data[k] - v.data[k]), Math.abs(u.data[k + 1] - v.data[k + 1]), Math.abs(u.data[k + 2] - v.data[k + 2]));
      if (m > d) n += 1;
    }
    return n / (u.width * u.height);
  }), [one, two, TURN_DELTA]);

  // 두 장이 필요하다. 하나는 호버해서 도는 칸, 하나는 안 도는 이웃 칸이라 바닥이 된다.
  const pick = await p.evaluate(() => {
    const cards = [...document.querySelectorAll("#shop .rack .card")];
    const a = cards.findIndex((c) => c.querySelector(".shot img"));
    return { a, b: cards.findIndex((c, n) => n !== a && c.querySelector(".shot img")), all: cards.length };
  });
  const swap = await p.evaluate((n) => {
    const card = document.querySelectorAll("#shop .rack .card")[n];
    const shot = card.querySelector(".shot");
    const box = (e) => { const q = e.getBoundingClientRect(); return { x: +q.x.toFixed(2), y: +q.y.toFixed(2), w: +q.width.toFixed(2), h: +q.height.toFixed(2) }; };
    const rest = box(shot.querySelector("img"));
    card.dispatchEvent(new PointerEvent("pointerenter", { bubbles: false }));
    return new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(() => {
      /* 상자 자체가 아니라 상자 안쪽과 견준다. 테두리 2px은 칸의 몫이 아니라 상자의 몫이고,
         자식은 그 안에만 설 수 있어 상자 밖변으로 재면 채운 칸도 2px씩 모자라게 읽힌다. */
      const s = getComputedStyle(shot);
      const q = shot.getBoundingClientRect();
      const in4 = ["Top", "Right", "Bottom", "Left"].map((k) => parseFloat(s["border" + k + "Width"]) + parseFloat(s["padding" + k]));
      const cell = { x: +(q.x + in4[3]).toFixed(2), y: +(q.y + in4[0]).toFixed(2), w: +(q.width - in4[1] - in4[3]).toFixed(2), h: +(q.height - in4[0] - in4[2]).toFixed(2) };
      const img = shot.querySelector("img");
      const cv = shot.querySelector("canvas");
      const cs = img ? getComputedStyle(img) : null;
      const ir = img ? box(img) : { w: 0, h: 0 };
      const cr = cv ? box(cv) : null;
      const gap = cr ? Math.max(Math.abs(cr.x - rest.x), Math.abs(cr.y - rest.y), Math.abs(cr.w - rest.w), Math.abs(cr.h - rest.h)) : -1;
      const bare = cr ? +Math.max(cell.w - cr.w, cell.h - cr.h).toFixed(2) : 999;
      res({ rest, ir, cr, cell, gap, bare, hidden: !img || cs.display === "none" || cs.visibility === "hidden" || ir.w * ir.h === 0,
        vis: cs ? cs.display + "/" + cs.visibility : "no img" });
    })));
  }, pick.a);
  check("thumb:the-spin-replaces-the-still", swap.hidden && swap.gap >= 0 && swap.gap <= CELL_SLACK && swap.bare <= CELL_SPILL,
    "card " + pick.a + " of " + pick.all + ": still " + swap.vis + " " + swap.ir.w + "x" + swap.ir.h
    + " (resting " + swap.rest.w + "x" + swap.rest.h + "), canvas "
    + (swap.cr ? swap.cr.w + "x" + swap.cr.h + " off that slot by " + swap.gap.toFixed(2) + "px, short of the "
      + swap.cell.w + "x" + swap.cell.h + " inner box by " + swap.bare + "px" : "not in the box"));

  const liveOne = await pngOf(p.locator("#shop .rack .card").nth(pick.a).locator(".shot"));
  const stillOne = await pngOf(p.locator("#shop .rack .card").nth(pick.b).locator(".shot"));
  await p.waitForTimeout(500);
  const liveTwo = await pngOf(p.locator("#shop .rack .card").nth(pick.a).locator(".shot"));
  const stillTwo = await pngOf(p.locator("#shop .rack .card").nth(pick.b).locator(".shot"));
  const live = await moveOf(liveOne, liveTwo);
  const still = await moveOf(stillOne, stillTwo);
  check("thumb:the-spin-actually-turns", live > still + TURN_SHARE,
    (live * 100).toFixed(1) + "% of the box moved in 500ms, a resting neighbour " + (still * 100).toFixed(1)
    + "%, floor " + ((still + TURN_SHARE) * 100).toFixed(1) + "%");

  const back = await p.evaluate((n) => {
    const card = document.querySelectorAll("#shop .rack .card")[n];
    const shot = card.querySelector(".shot");
    card.dispatchEvent(new PointerEvent("pointerleave", { bubbles: false }));
    return new Promise((res) => setTimeout(() => {
      const img = shot.querySelector("img");
      const q = img ? img.getBoundingClientRect() : { width: 0, height: 0 };
      const cs = img ? getComputedStyle(img) : null;
      res({ w: +q.width.toFixed(2), h: +q.height.toFixed(2), canvas: Boolean(shot.querySelector("canvas")),
        vis: cs ? cs.display + "/" + cs.visibility : "no img" });
    }, 160));
  }, pick.a);
  check("thumb:the-still-returns-after-leave",
    !back.canvas && back.vis === "block/visible" && Math.abs(back.w - swap.rest.w) <= CELL_SLACK && Math.abs(back.h - swap.rest.h) <= CELL_SLACK,
    "still " + back.vis + " " + back.w + "x" + back.h + " (rested " + swap.rest.w + "x" + swap.rest.h + "), canvas "
    + (back.canvas ? "still in the box" : "gone"));

  /* 도는 그림은 정지 그림이 선 그 각에서 출발해야 한다. 출발각을 여기서 상수로 박으면
     겨냥이 그 상수와 다른 선반마다 정지 그림과 첫 프레임 사이에 각 차이만큼의 도약이 생기고,
     사람이 보는 것은 회전이 아니라 한 번에 돌아간 뒤에 도는 그림이다.
     실측: 유니폼 겨냥은 2.7인데 출발이 -0.7이라 3.4라디안을 한 프레임에 건너뛰어 칸의 39.1퍼센트가
     한 번에 바뀌었고, 장면 칸 넷은 정지 그림이 -0.35인데 같은 -0.7에서 출발해 5.9에서 30.2퍼센트가 바뀌었다.
     바닥은 그 칸 자신의 두 프레임 몫이다. 도는 속도가 선반마다 달라서(0.9에서 18.8퍼센트) 고정값 하나로 재면
     빠른 칸이 영원히 빨갛거나 느린 칸이 영원히 초록이 된다. 이웃 잡음 자와 같은 규칙으로 TURN_SHARE를 얹는다.
     그 몫을 살아 있는 회전에서 뜨면 자가 재이는 것을 따라간다. 두 프레임을 뜬 각이 곧 출발각이라,
     많이 움직이는 각으로 튄 회귀는 자기를 심판할 바닥을 같이 올린다. 실측: 같은 잉크 선반의 바닥이
     초록 회차에서 18.2퍼센트, 출발각을 pi 튼 대조군 회차에서 4.5퍼센트로 네 배 갈렸다. 잉크의 정직한
     도약은 3.5퍼센트라, 18.2퍼센트 바닥 앞에서는 그 여섯 배도 초록으로 지나간다. 기계가 바빠 프레임을
     흘리면 같은 방향으로 밀려, 쓸기가 도는 동안 이 자가 가장 너그러워진다.
     그래서 바닥은 굽는다. 정지 그림이 선 각과 거기서 두 프레임만큼 돌린 각을 각각 한 장씩 구워
     그 둘의 거리를 바닥으로 쓴다. 부하에도 출발각에도 안 움직이고, 회차마다 같은 수가 나온다.
     구운 화소끼리 견준다. 칸을 찍으면 자리와 각이 한 수에 섞여서, 위의 자리 축이 이미 답한 것을 다시 묻게 된다. */
  /* 한 바퀴가 8초라 60헤르츠 두 프레임은 33.3밀리초, 곧 0.0262라디안이고 1.50도다.
     사라진 실측 자와 같은 폭이라 초록 회차가 재던 수와 그대로 견줘진다. */
  const TURN_STEP = Math.PI * 2 * ((2 / 60) * 1000) / 8000;
  const startAt = await p.evaluate(async ([delta, sweep]) => {
    const m = await import("/web/src/render/thumb.mjs");
    const g = await import("/web/src/state/gear.mjs");
    const read = (src) => new Promise((res) => {
      const im = new Image();
      im.onload = () => {
        const cv = document.createElement("canvas");
        cv.width = im.width; cv.height = im.height;
        const c = cv.getContext("2d");
        c.drawImage(im, 0, 0);
        res(c.getImageData(0, 0, im.width, im.height));
      };
      im.src = src;
    });
    const gap = (u, v) => {
      if (u.width !== v.width || u.height !== v.height) return -1;
      let n = 0;
      for (let k = 0; k < u.data.length; k += 4) {
        const hit = Math.max(Math.abs(u.data[k] - v.data[k]), Math.abs(u.data[k + 1] - v.data[k + 1]), Math.abs(u.data[k + 2] - v.data[k + 2]));
        if (hit > delta) n += 1;
      }
      return n / (u.width * u.height);
    };
    const frames = (n) => new Promise((res) => {
      let left = n;
      const step = () => (left -= 1) <= 0 ? res() : requestAnimationFrame(step);
      requestAnimationFrame(step);
    });
    /* 구울 인자는 화면이 쓴 것과 같아야 한다. 탭 이름과 굽는 종류가 갈리는 선반이 있고(장갑 탭은 grip을 굽는다),
       걸치는 칸과 자리 칸과 봇이 받는 인자가 세 모양이라, 그 표를 여기 옮겨 적으면 화면이 바뀐 날
       바닥만 조용히 딴 물건을 잰다. 그래서 적지 않고 맞춰 본다. 후보를 구워 칸에 걸린 정지 그림과
       바이트로 같은 장이 나오면 그것이 화면이 쓴 짝이다. 못 찾으면 그 줄은 안 잰 것으로 적는다. */
    const gear = window.__gear();
    const me = window.__keeperStats();
    const out = [];
    for (const tab of [...document.querySelectorAll("#shop .tab")].map((x) => x.dataset.tab)) {
      for (const x of document.querySelectorAll("#shop .tab")) if (x.dataset.tab === tab) x.click();
      await new Promise((res) => setTimeout(res, 260));
      const card = [...document.querySelectorAll("#shop .rack .card")].find((c) => c.querySelector(".shot img"));
      if (!card) continue;
      const shot = card.querySelector(".shot");
      const still = shot.querySelector("img").getAttribute("src");
      const rank = Number(shot.dataset.rank);
      let turn = null;
      for (const kind of [shot.dataset.kind].concat(Object.keys(g.SKINS))) {
        const y = m.yawOf(kind);
        for (const arg of [g.lookOf(Object.assign({}, gear, { [kind]: rank }), me.name), { rank, skin: 0 }, rank]) {
          let rest = "";
          try { rest = m.thumbURL(kind, me, arg, { yaw: y }); } catch (e) { rest = ""; }
          if (rest !== still) continue;
          try { turn = m.thumbURL(kind, me, arg, { yaw: y + sweep }); } catch (e) { turn = null; }
          break;
        }
        if (turn) break;
      }
      card.dispatchEvent(new PointerEvent("pointerenter", { bubbles: false }));
      /* 한 프레임 안에 잡는다. 더 늦게 잡으면 도약과 정상 회전이 한 수에 섞인다. */
      await frames(1);
      const cv = shot.querySelector("canvas");
      const one = cv ? cv.toDataURL("image/png") : "";
      card.dispatchEvent(new PointerEvent("pointerleave", { bubbles: false }));
      await new Promise((res) => setTimeout(res, 80));
      if (!one || !turn) { out.push({ tab, jump: -1, step: -1 }); continue; }
      const a = await read(still);
      const b = await read(one);
      const c = await read(turn);
      out.push({ tab, jump: gap(a, b), step: gap(a, c) });
    }
    return out;
  }, [TURN_DELTA, TURN_STEP]);
  const jumped = startAt.filter((x) => !(x.jump >= 0 && x.step >= 0 && x.jump <= x.step + TURN_SHARE));
  check("thumb:the-spin-starts-from-the-still", startAt.length > 0 && jumped.length === 0,
    startAt.map((x) => x.jump < 0 || x.step < 0 ? x.tab + " unmeasured"
      : x.tab + " " + (x.jump * 100).toFixed(1) + "% vs floor "
        + ((x.step + TURN_SHARE) * 100).toFixed(1) + "%").join(", ") || "no shelf was read");

  /* 대조군. 굽는 자가 없는 종류는 호버해도 정지 그림이 그대로 서야 한다. startSpin은 그런
     종류에서 먼저 돌아 나가는데, 숨기는 규칙이 그 앞에 서면 캔버스도 그림도 없는 빈 칸이 남는다.
     그 칸은 호버해야만 비므로 위의 잉크 축이 영원히 못 본다. */
  const dead = await p.evaluate(async (k) => {
    const m = await import("/web/src/render/thumb.mjs");
    const rack = document.querySelector("#shop .rack");
    const card = document.createElement("div");
    card.className = "card gear";
    card.id = "spinProbe";
    const pic = document.createElement("div");
    pic.className = "pic";
    const shot = document.createElement("div");
    shot.className = "shot";
    const im = document.createElement("img");
    im.alt = "";
    pic.appendChild(shot); card.appendChild(pic); rack.appendChild(card);
    await new Promise((res) => { im.onload = res; im.onerror = res; im.src = document.querySelector("#shop .rack .card .shot img").getAttribute("src"); shot.appendChild(im); });
    await new Promise((res) => requestAnimationFrame(res));
    const rest = +im.getBoundingClientRect().height.toFixed(2);
    m.startSpin(shot, "nosuchkind", k, {});
    await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
    const cs = getComputedStyle(im);
    const out = { rest, h: +im.getBoundingClientRect().height.toFixed(2), vis: cs.display + "/" + cs.visibility, canvas: Boolean(shot.querySelector("canvas")) };
    m.stopSpin();
    card.remove();
    return out;
  }, GATE_BODY);
  check("control:a-kind-with-no-render-keeps-its-still",
    dead.vis === "block/visible" && dead.h > 0 && Math.abs(dead.h - dead.rest) <= 1 && !dead.canvas,
    "still " + dead.vis + " " + dead.h + "px, rested " + dead.rest + "px, canvas " + (dead.canvas ? "moved in" : "stayed out"));

  check("console:no-errors", errs.length === 0, errs.slice(0, 2).join(" | ") || "clean");
  await ctx.close();

  if (notes.length) console.log(notes.map((x) => "  ok   " + x).join(LINE));
  if (fails.length) console.log(fails.map((x) => "  FAIL " + x).join(LINE));
  console.log(fails.length ? "thumb FAIL " + fails.length : "thumb PASS " + notes.length);
  if (fails.length) process.exitCode = 1;
} finally {
  clearTimeout(t);
  if (b) await b.close();
}
