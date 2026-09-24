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
  // 기존 카드 렌더러의 실제 리그와 카메라를 계기 안에서만 연다. 상품 코드는 그대로 쓴다.
  await p.route("**/web/src/render/thumb.mjs", async (route) => {
    const response = await route.fetch();
    await route.fulfill({ response, body: await response.text() +
      '\nexport function spongeSurface(k, look) { frame("pads", k, look); return { rig, scene, cam, cv: R.domElement, render: () => R.render(scene, cam) }; }' });
  });
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
  const PADS_DROP = { lift: -0.75 }; // 넓어진 카드의 실제 윗변 밖까지 깃을 보내는 결함 대조군이다.
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
      /* 겉모습은 등급과 변형의 짝이다. 변형 번호를 안 실으면 lookOf가 그 등급의 0번을 집어,
         이 자는 선반이 파는 열둘 가운데 넷만 굽고 있었다. 형태를 들고 있는 것이 변형 줄의 cut이라
         안 구운 여덟 장은 어느 형태 축도 본 적이 없다. 실측: 유니폼 3등급 2번 변형(pad 1.9, len 1.10)이
         다섯 벌 가운데 넷에서 스펀지 윗변을 깃 아래로 떨궜는데, 그 장이 구워진 적이 없어 아무 축도 안 울었다.
         변형 번호 0을 실은 장은 안 실은 장과 같은 바이트라, 아래 자리 절이 재던 장은 그대로 남는다. */
      const bake = (n, k, over, v) => { const look = g.lookOf({ [s.field]: n, [s.field + "Skin"]: v || 0 }); look[s.look] = MARK; return m.thumbURL(s.tab, k, look, over); };
      const ranks = s.rows.map((r, i) => i);
      const looks = [];
      for (const n of ranks) {
        const many = g.SKINS[s.field] ? g.skinsAt(s.field, n).length : 1;
        for (let v = 0; v < many; v += 1) looks.push({ rank: n, skin: v, tag: n + ":" + v });
      }
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
         회차가 적었지만 재지는 않았다. 실측으로 혼자 돌 때 19.51초에서 20.36초였다. 겉모습을 다 걷어
         선반마다 굽는 장이 넷에서 열둘로 늘어난 회차는 굽는 블록이 4.23초, 자 전체가 23.67초이고,
         시한은 그대로 180초다.
         등급끼리 형태가 다른가와 무엇이든 칠했는가도 체격마다 답이 갈린다. 실측으로 머리 칸의
         가장 마른 겉모습이 188/84에서 239인데 165/65에서 219이고, 축구화 칸의 최악 쌍이 188/84에서
         0.781인데 200/65에서 0.795다. 최악의 귀퉁이는 선반마다 축마다 다른 벌에 서고, 한 벌이 그것을
         다 들고 있지 않다. */
      const per = [];
      let ms = null;
      for (const k of bodies) {
        const one = [];
        for (const L of looks) one.push(await mask(bake(L.rank, k, undefined, L.skin)));
        if (!ms) ms = one;
        /* 쌍은 등급이 다른 겉모습끼리만 센다. 한 등급 안의 변형은 서로 닮는 것이 정상이고,
           그 둘이 다른 그림인가는 variant-gate가 이미 묻는다. 여기서 같이 세면 정상인 닮음이
           이 자를 영원히 빨갛게 만든다. */
        const pairs = [];
        for (let i = 0; i < one.length; i++) for (let j = i + 1; j < one.length; j++) {
          if (looks[i].rank === looks[j].rank) continue;
          pairs.push({ n: looks[i].tag + "-" + looks[j].tag, v: iou(one[i], one[j]) });
        }
        /* 자리 절은 등급마다 0번 변형 하나를 그대로 읽는다. 그 절이 재는 것은 겨냥이라 변형을
           얹어도 답이 안 갈리고, 얹으면 축이 든 등급 번호가 무엇을 가리키는지만 흐려진다. */
        // The shop wearer's beard shares hairTone. Measure the actual card mask, including it,
        // rather than silently substituting the clean-shaven look used by the shape comparison.
        const paid = [];
        if (s.tab === "hair") for (let i = 0; i < looks.length; i += 1) {
          const L = looks[i];
          if (L.rank < 2) continue;
          const wearer = window.__keeperStats().name;
          if (!wearer) throw new Error("hair shelf wearer missing");
          const look = g.lookOf({ hair: L.rank, hairSkin: L.skin }, wearer);
          look.hair = MARK;
          const box = m.headBox("hair", k, look);
          const pixels = await mask(box.url);
          let disc = 0, shell = 0;
          for (let y = 0; y < pixels.h; y += 1) for (let x = 0; x < pixels.w; x += 1) {
            if (((x + 0.5) / pixels.w - box.x) ** 2 / box.rx ** 2
              + ((y + 0.5) / pixels.h - box.y) ** 2 / box.ry ** 2 > 1) continue;
            disc += 1;
            shell += pixels[y * pixels.w + x];
          }
          paid.push({ tag: L.tag, disc, shell, ratio: disc ? shell / disc : 1 });
        }
        per.push({ body: k.height + "/" + k.weight, paid,
          mid: one.filter((x, i) => looks[i].skin === 0).map(midOf), pairs,
          cover: one.map((x) => x.reduce((a, b) => a + b, 0)) });
      }
      /* 심는 대조군은 겨냥을 내려 깃을 칸 위로 밀어낸 장이다. 유니폼 칸에서 게이트 몸 한 벌만 굽는다.
         깃이 칸을 벗어난다는 것은 한 벌에서 이미 판가름 나고, 다섯 벌로 늘리면 굽는 장만 다섯 배가 된다.
         아래 머리 자가 옛 고정 보정을 되심는 것과 같은 자리다. */
      const plant = s.tab === wide ? midOf(await mask(bake(ranks[0], bodies[0], drop))) : null;
      const lastLook = looks[looks.length - 1];
      const twice = await mask(bake(lastLook.rank, bodies[0], undefined, lastLook.skin));
      out.push({ tab: s.tab, looks: looks.map((L) => L.tag), per, plant, control: iou(ms[ms.length - 1], twice) });
    }
    return out;
  }, [BODIES, WIDE_SHELF, PADS_DROP]);
  // 선반마다 구운 겉모습 수. 변형을 들인 선반이 등급 수만큼만 구워지면 그 수가 여기서 먼저 보인다.
  check("instrument:some-shelf-declares-a-shape", shapes.length > 0,
    shapes.map((s) => s.tab + " " + s.looks.length + " looks").join(", "));
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
    if (s.tab === "hair") {
      const paid = s.per.flatMap((row) => row.paid.map((q) => ({ ...q, body: row.body })));
      const expected = s.looks.filter((tag) => Number(tag.split(":")[0]) >= 2).length * BODIES.length;
      check("thumb:hair:the-paid-shell-leaves-half-the-head-disc",
        expected > 0 && paid.length === expected && paid.every((q) => q.disc > 0 && q.ratio <= 0.50),
        paid.length + " of " + expected + " paid skins; " + paid.map((q) => q.body + " " + q.tag
          + " " + q.shell + "/" + q.disc + "=" + q.ratio.toFixed(4)).join(", "));
    }
    /* 0.75. 두 등급이 칠해진 자리의 4분의 3을 공유하면 사람은 같은 물건에 색만 바꾼 것으로 읽는다.
       판정은 다섯 벌에서 등급이 다른 모든 겉모습 쌍이다. 실측으로 표본을 변형까지 넓히자 다섯 선반이
       상한을 넘었다. 머리 0:2-2:1이 188/84에서 0.829, 장갑 1:1-2:2가 188/84에서 0.801, 양말 1:1-2:2가
       200/96에서 0.799, 축구화 2:1-3:2가 200/65에서 0.795, 문신 0:0-1:2가 200/65에서 0.765다.
       유니폼만 1:2-3:0의 0.749로 남았다. 등급 줄의 0번 변형만 읽던 자리는 이 수를 하나도 못 봤다. */
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
    /* 1000화소. 굽는 칸의 1퍼센트쯤이다. 이 아래로 내려간 겉모습은 껍데기가 몸 안으로 들어가
       그 값을 치른 사람만 맨몸이 된다. 실제로 높이를 줄여 짧은 머리를 만들다 이 값이 227까지 내려갔다.
       판정은 다섯 벌의 모든 겉모습이다. 실측으로 가장 마른 장이 머리 1:2로 165/65에서 219이고
       같은 선반의 1:1이 880이다. 0번 변형만 읽던 자리가 보던 가장 마른 장은 1096이라, 바닥 아래의
       장 둘이 그 뒤에 서 있었다. */
    const starved = [];
    let leanest = null;
    for (const row of s.per) row.cover.forEach((n, i) => {
      if (n < 1000) starved.push(row.body + " " + s.looks[i] + " " + n);
      if (!leanest || n < leanest.n) leanest = { n, at: row.body + " " + s.looks[i] };
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
  // 모든 착용 선반이 상품과 착용자를 함께 판다. 등급과 변형과 체격 봉투를 빠짐없이 걷는다.
  const wearers = await p.evaluate(async bodies => {
    const m = await import("/web/src/render/thumb.mjs");
    const g = await import("/web/src/state/gear.mjs");
    const shelves = {grip:g.GLOVES, studs:g.BOOTS, pads:g.KITS, socks:g.SOCKS, ink:g.TATTOOS, hair:g.HAIRS, beard:g.BEARDS};
    const rows = [];
    for (const [kind, grades] of Object.entries(shelves)) {
      for (const body of bodies) for (const [rank] of grades.entries()) {
        for (const [skin] of g.skinsAt(kind, rank).entries()) {
          const look = g.lookOf({[kind]:rank, [kind + "Skin"]:skin});
          const box = m.wearerBox(kind, body, look);
          rows.push({kind, rank, skin, body, ...box, head:{...box.head, url:undefined}});
        }
      }
    }
    // 봇은 세 판매 등급을 같은 체격 봉투로 검사한다. 외형 변형은 봇 카탈로그에 없다.
    const bots = await import("/web/src/state/bot.mjs");
    const botGrades = bots.BOTS;
    for (const body of bodies) for (const entry of botGrades) {
      const box = m.wearerBox("bot", body, {rank:entry.tier});
      rows.push({kind:"bot", rank:entry.tier, body, ...box, head:{...box.head, url:undefined}});
    }
    // 옛 장갑 겨냥의 거리 0.94·높이 0.03·시선 0.12를 그대로 심어 상품만 남고 얼굴을 잃는 회귀를 잡는다.
    const old = m.wearerBox("grip", bodies[0], g.lookOf({grip:0}), {part:"glove", dist:0.94, lift:0.03, high:0.12});
    return {rows, old:{...old, head:{...old.head, url:undefined}}, expected:[...Object.entries(shelves).map(([kind, grades]) => ({kind, n:grades.reduce((n, _, rank) => n + g.skinsAt(kind, rank).length, 0) * bodies.length})), {kind:"bot", n:botGrades.length * bodies.length}]};
  }, BODIES);
  const pointInside = p => p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1;
  // 리그가 반환하는 두 눈과 두 어깨의 실제 메시 정점을 모두 확인해 일부만 측정한 통과를 막는다.
  const personInside = r => r.head && r.head.ry > 0
    && r.head.x - r.head.rx >= 0 && r.head.x + r.head.rx <= 1
    && r.head.y - r.head.ry >= 0 && r.head.y + r.head.ry <= 1
    && r.head.eyes.length === 2 && r.head.eyes.every(pointInside)
    && r.shoulders.length === 2 && r.shoulders.every(points => points.length > 0 && points.every(pointInside));
  for (const {kind, n} of wearers.expected) {
    const rows = wearers.rows.filter(r => r.kind === kind);
    const lost = rows.filter(r => !personInside(r));
    check("thumb:" + kind + ":every-worn-look-keeps-head-eyes-and-shoulders",
      n > 0 && rows.length === n && lost.length === 0,
      rows.length + "/" + n + " looks; outside: " + JSON.stringify(lost));
  }
  check("control:the-old-glove-frame-loses-its-wearer", !personInside(wearers.old)
    && wearers.old.head.eyes.length === 2 && wearers.old.shoulders.length === 2,
    JSON.stringify(wearers.old));

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
  /* 빨판은 손바닥 바깥면에 붙어 있다고 파는 물건인데, 그 둘이 떠 있는지는 여태 아무 자도 안 읽었다.
     f02c218이 빨판 z를 0.3s에서 0.42s로 옮겨 판과 판 사이가 0.06s 벌어졌고, 그 틈은 외곽선이 가려서
     그림으로는 앉은 것으로 읽힌다. 외곽선을 얇게 하거나 z를 더 올리면 그 틈이 조용히 열린다.
     빨판 메시는 없다. 손바닥과 엄지와 손목밴드와 빨판 다섯이 mergeGeos로 한 장이 되므로 자리는
     병합 순서가 준다. 상자 하나가 정점 스물넷이고 앞의 셋이 손바닥과 엄지와 손목밴드라, 빨판은
     그 뒤로 스물넷씩 놓인다. 정점 수가 (3 더하기 빨판 수) 곱하기 스물넷이 아니면 그 순서가 흐른
     것이고, 그때 이 자가 재는 것은 빨판이 아니므로 축이 수 대신 그 어긋남으로 먼저 빨개진다.
     재는 방향은 손바닥 바깥면의 법선이다. 어깨와 팔꿈치가 돌아가 있어서 월드 z를 그대로 쓰면
     앞면이 앞면이 아니다. 월드 행렬로 옮긴 정점을 그 법선에 사영해 월드 단위로 읽는다.
     경계는 외곽선이 그 면에서 실제로 밀어 주는 거리다. addOutline은 지오메트리 원점 기준 배율이라
     펜 굵기가 그대로 서는 자리는 실루엣 끝이고 손바닥 앞면은 그 안쪽이다. 실측: 굵기가 0.028인데
     그 면에서 밀리는 거리는 0.0066에서 0.0123이다. 굵기를 그대로 경계로 쓰면 실제로 칠해지는 잉크보다
     세 배 넓은 자리를 허락한다.
     굵기는 actors.mjs에서 읽는다. 여기 0.028을 베껴 두면 그 줄이 얇아진 날 이 축만 옛 굵기로 초록이
     난다. 읽은 수가 rig가 쓴 수인지는 살아 있는 외곽선의 scale.z와 맞춰 본다.
     실측: 정점 흔들림이 0.02라 판과 판 사이의 0.06s(188/84에서 0.0179)는 상자 눈금에서 -0.0192에서
     0.0004로 닫힌다. 가장 나쁜 자리가 200/65 3:1 두 번째 손의 0.0004이고 그 자리의 경계가 0.0079다.
     심는 대조군을 같은 축이 든다. 빨판 z를 s 곱하기 0.6으로 옮긴 값을 같은 표본에서 셈해 서른 장이
     전부 경계를 넘는지 묻는다. 이 조건이 없으면 경계가 넓어져 아무것도 못 가르는 날에도 초록이 난다. */
  const PLANT_PIP_Z = 0.6;
  const ACTORS = readFileSync(new URL("../web/src/render/objects/actors.mjs", import.meta.url), "utf8");
  const oneOf = (re, what) => {
    const all = ACTORS.match(new RegExp(re.source, "g")) || [];
    if (all.length !== 1) throw new Error(what + " read " + all.length + " times in actors.mjs, want 1");
    return Number(ACTORS.match(re)[1]);
  };
  const SHELL = 0; // 무광 키트에는 복제 외곽선이 없으므로 접촉 허용 폭도 없다.
  const PIP_Z = oneOf(/pip\.translate\(col \* s \* [\d.]+, row \* s \* [\d.]+, s \* ([\d.]+)\);/, "the pad z");
  const GLOVE_SIZE = oneOf(/gloveSize: h \* ([\d.]+),/, "the keeper glove size");
  const pads = await p.evaluate(async ([bodies, shell, gsize]) => {
    const T = await import("/web/vendor/three.module.min.js");
    const A = await import("/web/src/render/objects/actors.mjs");
    const g = await import("/web/src/state/gear.mjs");
    const box = new T.BoxGeometry(1, 1, 1).attributes.position.count;
    // 빨판을 든 장만 고른다. 등급 번호를 여기 적으면 빨판이 다른 등급에도 붙는 날 그 등급이 조용히 빠진다.
    const looks = [];
    for (let rank = 0; rank < g.GLOVES.length; rank += 1) {
      for (let skin = 0; skin < g.skinsAt("grip", rank).length; skin += 1) {
        if (g.skinAt("grip", rank, skin).cut.pips > 0) looks.push({ rank, skin });
      }
    }
    const out = { box, looks: looks.map((L) => L.rank + ":" + L.skin), rows: [] };
    for (const k of bodies) {
      for (const L of looks) {
        const cut = g.skinAt("grip", L.rank, L.skin).cut;
        const rig = A.buildKeeper(k.height, k.weight, g.lookOf({ grip: L.rank, gripSkin: L.skin }));
        rig.updateMatrixWorld(true);
        const hands = rig.userData.gloves || [];
        for (let at = 0; at < hands.length; at += 1) {
          const gv = hands[at];
          const pos = gv.geometry.attributes.position;
          const bb = gv.geometry.boundingBox;
          const ink = gv.children.filter((c) => c.userData && c.userData.isOutline);
          const nrm = new T.Vector3(0, 0, 1).transformDirection(gv.matrixWorld).normalize();
          const spot = new T.Vector3();
          const face = (from, to) => {
            let hi = -Infinity, lo = Infinity, zhi = -Infinity;
            for (let i = from; i < to; i += 1) {
              spot.fromBufferAttribute(pos, i);
              if (spot.z > zhi) zhi = spot.z;
              spot.applyMatrix4(gv.matrixWorld);
              const d = spot.dot(nrm);
              if (d > hi) hi = d;
              if (d < lo) lo = d;
            }
            return { hi, lo, zhi };
          };
          const parts = gv.userData.partVertices;
          const palm = face(0, parts[0]); // 구와 상자의 정점 수를 같은 수로 가정하지 않는다.
          const start = parts.slice(0, 3).reduce((a, n) => a + n, 0); // 손바닥, 엄지, 손목 뒤가 빨판의 시작이다.
          let back = Infinity;
          for (let q = 0; q < cut.pips; q += 1) back = Math.min(back, face(start + q * box, start + (q + 1) * box).lo);
          const sz = ink.length ? ink[0].scale.z : 1; // 외곽선이 없으면 표면 자체 배율이다.
          out.rows.push({
            body: k.height + "/" + k.weight, tag: L.rank + ":" + L.skin, hand: at,
            verts: pos.count, want: start + cut.pips * box, inks: ink.length, sz,
            wantSz: 1 + (shell * 2) / Math.max(0.04, bb.max.z - bb.min.z),
            s: (k.height / 100) * gsize * cut.bulk, stand: back - palm.hi,
            reach: (palm.zhi - (bb.max.z + bb.min.z) / 2) * (sz - 1)
          });
        }
      }
    }
    return out;
  }, [BODIES, SHELL, GLOVE_SIZE]);
  const padSay = (r) => r.body + " " + r.tag + " hand " + r.hand + " standoff "
    + r.stand.toFixed(5) + " of " + r.reach.toFixed(5);
  const padEnds = (k) => Math.min.apply(null, pads.rows.map((r) => r[k])).toFixed(5)
    + ".." + Math.max.apply(null, pads.rows.map((r) => r[k])).toFixed(5);
  const padClear = pads.rows.filter((r) => !(r.stand <= r.reach));
  const padDrift = pads.rows.filter((r) => r.verts !== r.want || r.inks !== 0
    || Math.abs(r.sz - r.wantSz) > 1e-9);
  const padPlant = pads.rows.filter((r) => r.stand + (PLANT_PIP_Z - PIP_Z) * r.s > r.reach);
  const padTight = pads.rows.reduce((a, c) => (a && a.reach - a.stand <= c.reach - c.stand ? a : c), null);
  check("thumb:grip:the-suction-pads-sit-on-the-palm",
    pads.rows.length === BODIES.length * pads.looks.length * 2 && padDrift.length === 0
      && padClear.length === 0 && padPlant.length === pads.rows.length,
    padDrift.length ? "the merged glove drifted at " + padDrift.map((r) => r.body + " " + r.tag
      + " verts " + r.verts + "/" + r.want + " outlines " + r.inks
      + " scale " + r.sz.toFixed(6) + "/" + r.wantSz.toFixed(6)).join(", ")
      : padClear.length ? "standing clear of the palm at " + padClear.map(padSay).join(", ")
        : "pads " + pads.looks.join("/") + " on " + BODIES.length + " bodies stand "
          + padEnds("stand") + " from the palm face, inside the " + SHELL + " pen that reaches "
          + padEnds("reach") + " there, tightest " + padSay(padTight) + ", planted z "
          + PLANT_PIP_Z + " stands clear on " + padPlant.length + " of " + pads.rows.length);
  /* 어깨 스펀지는 상의 위로 솟은 어깨로 파는 물건이다. 그 끝이 제가 얹힌 상의 꼭대기보다 위에
     서는지는 여태 아무 자도 안 읽었다. 878b0f0은 폭만 고쳤고, 세로는 그 회차가 종이에서 진단만
     해 두고 축으로 안 옮겼다. 옷깃 아래로 내려앉은 스펀지는 상의 실루엣 안에 통째로 들어가고,
     값을 치른 어깨는 화면에서 몸통과 같은 색 한 덩어리가 된다.
     그 종이 식은 척추 좌표계의 수다. 스펀지 끝을 torsoLen 0.92 더하기 armR 곱하기 1.15 더하기
     0.88 pad로 놓고 상의 꼭대기를 torsoLen 더하기 torsoR 곱하기 len으로 놓아 165/96 3:0에서
     -0.0116을 준다. 화면은 그 좌표계가 아니다. buildKeeper가 짓고 바로 드는 ready 포즈가 척추를
     rx -0.30으로 숙이고 어깨 관절을 rz -0.78과 0.84로 벌린다. 숙인 몸통은 옷깃을 내리고, 벌어진
     어깨는 폭이 armR 1.9 더하기 torsoR girth 0.9인 상자의 위 모서리를 들어 올린다. 실측으로 같은
     자리가 +0.047과 +0.039다. 그래서 이 축은 식이 아니라 rig에서 정점을 월드로 옮겨 읽는다.
     옷의 꼭대기와 잉크의 꼭대기를 따로 잰다. 옷 위에 선 상자라도 몸통 잉크 아래면
     어깨 윗선이 없다. 자기 외곽선을 단 스펀지는 그 외곽선 정점이 몸통 외곽선보다 바닥만큼
     높아야 하고, 카드에서 몸통만 남긴 실루엣보다 위에 실제로 찍힌 행도 있어야 한다.
     스펀지는 메시 하나다. 빨판과 달리 병합되지 않아 어깨 관절의 BoxGeometry 자식 하나가 그것이고,
     하나가 아니면 축이 수 대신 그 어긋남으로 먼저 빨개진다. 폭과 두께와 깊이와 앉은 높이를
     actors.mjs에서 한 자리씩 읽어 다시 세워 맞춘다. 여기 수를 베껴 두면 그 식이 얇아진 날 이 축만
     옛 수로 초록이 난다. 자리를 손으로 옮겨 셈한 값이 pad.matrixWorld로 읽은 값과 같은지도 같이
     묻는다. 그 둘이 같아야 아래의 심기가 rig를 옮긴 것과 같은 말이 된다.
     경기장 키퍼도 같은 rig다. scene.mjs의 setKeeper가 같은 buildKeeper에 같은 look을 넘기므로 이
     수는 상점 칸만의 수가 아니다. 다만 재는 자세는 지을 때 드는 ready 한 벌이고, 다이브는 어깨를
     더 벌린다. 그 자세를 재는 자는 아직 없다. */
  // 0.013. 살아 있는 예순 줄에서 가장 좁은 여유 0.02735(165/96 3:2 두 번째 어깨)의 절반을 소수
  // 세 자리로 내린 수다. 통과용으로 고른 수가 아니라 표본이 남긴 수고, 몸이나 등급이 늘면 같이
  // 다시 난다. 절대 길이라 가장 작은 몸이 가장 좁은 여유를 들고 그 자리에서 읽힌다.
  const CROWN_FLOOR = 0.013;
  const CROWN_FLOOR_FROM = "half the tightest live margin 0.02735 at 165/96 3:2 hand 1";
  /* 심는 대조군은 자리를 제 여유만큼 내린다. 어깨가 벌어져 자리 한 칸이 월드 y로는 0.636과
     0.551만 내려가므로 내리는 칸은 여유를 그 기울기로 나눈 값이고, 그러면 예순 줄이 전부 옷깃
     아래 정확히 바닥만큼에 앉아야 한다. 자리를 상수로 미는 심기는 이 일을 못 한다. 실측: 자리를
     반으로 줄이면 바닥 아래로 아홉 줄뿐이고 그 아홉이 전부 3:0과 3:2다. 자리를 0으로 둬도 2등급
     서른 줄은 안 운다. 기장이 0.74에서 0.84라 옷깃이 낮고 어깨 관절이 이미 그 위에 있어서다.
     그래서 심는 값을 상수가 아니라 잰 여유에서 뽑는다. */
  const PLANT_SEAT = 0.5;
  const manyOf = (re, what) => {
    const all = ACTORS.match(new RegExp(re.source, "g")) || [];
    if (all.length !== 1) throw new Error(what + " read " + all.length + " times in actors.mjs, want 1");
    return ACTORS.match(re).slice(1).map(Number);
  };
  const [ARM_K] = manyOf(/shoulderX: w \* [\d.]+, armR: h \* ([\d.]+),/, "the keeper arm radius");
  const [TORSO_K] = manyOf(/torsoR: w \* ([\d.]+), torsoLen: h \* [\d.]+,/, "the keeper torso radius");
  const [W_BASE, W_AT, W_STEP] = manyOf(/const w = ([\d.]+) \+ \(weight - (\d+)\) \* ([\d.]+);/, "the girth from weight");
  const [PAD_TH_K] = manyOf(/const th = o\.armR \* ([\d.]+) \* kc\.pad;/, "the sponge thickness");
  const [PAD_LIFT_K, PAD_SEAT_K, PAD_SEAT_DOWN] = manyOf(/pad\.position\.set\(side \* \(o\.armR \* [\d.]+ \+ Math\.max\([\d.]+, kc\.pad\) \* [\d.]+\), o\.armR \* ([\d.]+) \+ th \* ([\d.]+) - ([\d.]+), o\.armR \* [\d.]+\);/, "the sponge seat");
  const [PAD_WIDE_K, PAD_GIRTH_K] = manyOf(/const wide = o\.armR \* ([\d.]+) \+ o\.torsoR \* kc\.girth \* ([\d.]+);/, "the sponge width");
  const [PAD_DEEP_K] = manyOf(/new THREE\.BoxGeometry\(wide, th, o\.armR \* ([\d.]+)\)/, "the sponge depth");
  const TORSO_PEN = 0; // 키트 몸통은 복제 잉크 없이 실제 표면이 외곽선이다.
  const crowns = await p.evaluate(async ([bodies, lit, floor, halfAt]) => {
    const T = await import("/web/vendor/three.module.min.js");
    const A = await import("/web/src/render/objects/actors.mjs");
    const g = await import("/web/src/state/gear.mjs");
    const box = new T.BoxGeometry(1, 1, 1).attributes.position.count;
    // 스펀지를 든 장만 고른다. 등급 번호를 여기 적으면 스펀지가 다른 등급에 붙는 날 그 등급이 조용히 빠진다.
    const looks = [];
    for (let rank = 0; rank < g.KITS.length; rank += 1) {
      for (let skin = 0; skin < g.skinsAt("pads", rank).length; skin += 1) {
        if (g.skinAt("pads", rank, skin).cut.pad > 0) looks.push({ rank, skin });
      }
    }
    const spot = new T.Vector3();
    // 겉보기 꼭대기는 정점을 하나씩 월드로 옮겨 읽는다. 상자를 든 어깨가 돌아가 있어서 축에 나란한
    // 바운딩 상자는 제 꼭대기를 실제보다 높게 준다. 자리를 옮긴 셈도 같은 자로 읽어야 견줄 수 있다.
    const topOf = (mesh, frame, shift) => {
      const pos = mesh.geometry.attributes.position;
      let hi = -Infinity;
      for (let i = 0; i < pos.count; i += 1) {
        spot.fromBufferAttribute(pos, i);
        if (shift) spot.add(shift);
        spot.applyMatrix4(frame);
        if (spot.y > hi) hi = spot.y;
      }
      return hi;
    };
    const out = { box, looks: looks.map((L) => L.rank + ":" + L.skin), rows: [] };
    for (const k of bodies) {
      for (const L of looks) {
        const cut = g.skinAt("pads", L.rank, L.skin).cut;
        const rig = A.buildKeeper(k.height, k.weight, g.lookOf({ pads: L.rank, padsSkin: L.skin }));
        rig.updateMatrixWorld(true);
        const torso = rig.userData.torso;
        const ink = torso.children.filter((c) => c.userData && c.userData.isOutline);
        const crown = topOf(torso, torso.matrixWorld, null);
        const h = k.height / 100;
        const w = lit.wBase + (k.weight - lit.wAt) * lit.wStep;
        const armR = h * lit.armK;
        const torsoR = w * lit.torsoK;
        const th = armR * lit.thK * cut.pad;
        const arms = rig.userData.arms || [];
        for (let at = 0; at < arms.length; at += 1) {
          const sh = arms[at];
          const boxes = sh.children.filter((c) => c.isMesh && c.geometry.type === "BoxGeometry");
          const pad = boxes.length === 1 ? boxes[0] : null;
          const par = pad ? (pad.geometry.parameters || {}) : {};
          const home = pad ? pad.position : new T.Vector3();
          const seatTo = (y) => topOf(pad, sh.matrixWorld, new T.Vector3(home.x, y, home.z));
          const top = pad ? seatTo(home.y) : 0;
          const fall = pad ? top - seatTo(home.y - 1) : 0;
          const margin = top - crown;
          const padInk = pad ? pad.children.filter((c) => c.userData.isOutline) : [];
          const inkTop = padInk.length === 1 ? topOf(padInk[0], padInk[0].matrixWorld, null) : top;
          const torsoInkTop = ink.length === 1 ? topOf(ink[0], ink[0].matrixWorld, null) : crown;
          out.rows.push({
            body: k.height + "/" + k.weight, tag: L.rank + ":" + L.skin, hand: at,
            boxes: boxes.length, verts: pad ? pad.geometry.attributes.position.count : 0,
            inks: ink.length,
            padInks: pad ? pad.children.filter((c) => c.userData && c.userData.isOutline).length : -1,
            wide: Number(par.width) || 0, high: Number(par.height) || 0, deep: Number(par.depth) || 0,
            wantWide: armR * lit.wideK + torsoR * cut.girth * lit.girthK,
            wantHigh: th, wantDeep: armR * lit.deepK,
            seat: home.y, wantSeat: armR * lit.liftK + th * lit.seatK - lit.seatDown,
            crown, pen: ink.length === 1 ? topOf(torso, ink[0].matrixWorld, null) - crown : 0,
            inkTop, torsoInkTop, inkMargin: inkTop - torsoInkTop,
            top, live: pad ? topOf(pad, pad.matrixWorld, null) : 0, fall, margin,
            sank: pad && fall > 0 ? seatTo(home.y - (margin + floor) / fall) - crown : 0,
            half: pad ? seatTo(home.y * halfAt) - crown : 0
          });
        }
      }
    }
    return out;
  }, [BODIES, { armK: ARM_K, torsoK: TORSO_K, wBase: W_BASE, wAt: W_AT, wStep: W_STEP, thK: PAD_TH_K,
    liftK: PAD_LIFT_K, seatK: PAD_SEAT_K, seatDown: PAD_SEAT_DOWN, wideK: PAD_WIDE_K, girthK: PAD_GIRTH_K, deepK: PAD_DEEP_K },
  CROWN_FLOOR, PLANT_SEAT]);
  const crownSay = (r) => r.body + " " + r.tag + " hand " + r.hand + " clears by " + r.margin.toFixed(5);
  const crownEnds = (k) => Math.min.apply(null, crowns.rows.map((r) => r[k])).toFixed(5)
    + ".." + Math.max.apply(null, crowns.rows.map((r) => r[k])).toFixed(5);
  const crownDrift = crowns.rows.filter((r) => r.boxes !== 1 || r.verts !== crowns.box || r.inks !== 0
    || r.padInks > 1 || !(r.fall > 0 && r.fall <= 1) || Math.abs(r.top - r.live) > 1e-9
    || Math.abs(r.wide - r.wantWide) > 1e-9 || Math.abs(r.high - r.wantHigh) > 1e-9
    || Math.abs(r.deep - r.wantDeep) > 1e-9 || Math.abs(r.seat - r.wantSeat) > 1e-9);
  const crownLow = crowns.rows.filter((r) => !(r.margin > CROWN_FLOOR));
  const crownSank = crowns.rows.filter((r) => Math.abs(r.sank + CROWN_FLOOR) <= 1e-9);
  const crownHalf = crowns.rows.filter((r) => r.half <= CROWN_FLOOR);
  const crownInk = crowns.rows.filter((r) => r.margin < r.pen);
  const crownTight = crowns.rows.reduce((a, c) => (a && a.margin <= c.margin ? a : c), null);
  check("thumb:pads:the-jersey-sponge-rises-above-the-shirt-crown",
    crowns.rows.length === BODIES.length * crowns.looks.length * 2 && crownDrift.length === 0
      && crownLow.length === 0 && crownSank.length === crowns.rows.length,
    crownDrift.length ? "the shoulder sponge drifted at " + crownDrift.map((r) => r.body + " " + r.tag
      + " hand " + r.hand + " boxes " + r.boxes + " verts " + r.verts + "/" + crowns.box + " outlines "
      + r.padInks + "/" + r.inks + " wide " + r.wide.toFixed(6) + "/" + r.wantWide.toFixed(6) + " high "
      + r.high.toFixed(6) + "/" + r.wantHigh.toFixed(6) + " deep " + r.deep.toFixed(6) + "/"
      + r.wantDeep.toFixed(6) + " seat " + r.seat.toFixed(6) + "/" + r.wantSeat.toFixed(6) + " fall "
      + r.fall.toFixed(5) + " world " + r.top.toFixed(6) + "/" + r.live.toFixed(6)).join(", ")
      : crownLow.length ? "sunk into its own shirt at " + crownLow.map(crownSay).join(", ")
        : "sponges " + crowns.looks.join("/") + " on " + BODIES.length
          + " bodies clear the nominal shirt crown by " + crownEnds("margin") + " over the floor "
          + CROWN_FLOOR + ", " + CROWN_FLOOR_FROM + ", tightest " + crownSay(crownTight) + ", the "
          + TORSO_PEN + " ink shell stands " + crownEnds("pen") + " proud of that crown and buries "
          + crownInk.length + " of " + crowns.rows.length + ", the seat dropped by each margin sinks all "
          + crownSank.length + " to -" + CROWN_FLOOR + " while halving it sinks only " + crownHalf.length);

  const inkLow = crowns.rows.filter((r) => r.padInks !== 0 || r.inkMargin < CROWN_FLOOR);
  check("thumb:pads:the-sponge-silhouette-clears-the-ink-shell",
    crowns.rows.length === BODIES.length * crowns.looks.length * 2 && inkLow.length === 0,
    "floor " + CROWN_FLOOR + ", margins " + crownEnds("inkMargin") + ", below " + inkLow.length
      + " of " + crowns.rows.length + ": " + inkLow.map((r) => r.body + " " + r.tag + " hand "
        + r.hand + " " + r.inkMargin.toFixed(5)).join(", "));

  // 상자 정점은 화소가 아니다. 같은 카드에서 스펀지를 숨긴 장과 원래 장을 굽는다.
  // 어깨 열은 스펀지만 남긴 장에서 읽고, 몸통 잉크 윗행은 몸통만 남긴 장에서 읽는다.
  // 머리는 어깨가 아니므로 몸통 대조군에 넣지 않는다. 색 표식은 기존 셔츠 마스크와 같다.
  const spongePixels = await p.evaluate(async (bodies) => {
    const t = await import("/web/src/render/thumb.mjs");
    const g = await import("/web/src/state/gear.mjs");
    const rows = [];
    const belongs = (o, parent) => { for (let q = o; q; q = q.parent) if (q === parent) return true; return false; };
    const mark = (d, i) => d[i] > 40 && d[i + 2] > 40 && d[i] > d[i + 1] * 1.9 && d[i + 2] > d[i + 1] * 1.9;
    for (const body of bodies) for (let rank = 0; rank < g.KITS.length; rank += 1) {
      for (let skin = 0; skin < g.skinsAt("pads", rank).length; skin += 1) {
        if (!(g.skinAt("pads", rank, skin).cut.pad > 0)) continue;
        const look = g.lookOf({ pads: rank, padsSkin: skin });
        look.shirt = 0xff00ff;
        const s = t.spongeSurface(body, look);
        const pads = s.rig.userData.arms.map((a) => a.children.filter((c) => c.isMesh && c.geometry.type === "BoxGeometry"));
        if (pads.length !== 2 || pads.some((a) => a.length !== 1)) throw Error("sponge pixel population drift");
        const meshes = [];
        s.rig.traverse((o) => { if (o.isMesh) meshes.push([o, o.visible]); });
        const cv = document.createElement("canvas");
        cv.width = s.cv.width; cv.height = s.cv.height;
        const c = cv.getContext("2d");
        const grab = () => { s.render(); c.clearRect(0, 0, cv.width, cv.height); c.drawImage(s.cv, 0, 0); return c.getImageData(0, 0, cv.width, cv.height).data; };
        const restore = () => { for (const [o, visible] of meshes) o.visible = visible; };
        try {
          const full = grab();
          for (const [o] of meshes) o.visible = belongs(o, s.rig.userData.torso);
          const torso = grab();
          for (let hand = 0; hand < pads.length; hand += 1) {
            restore();
            pads[hand][0].visible = false;
            const bare = grab();
            for (const [o] of meshes) o.visible = belongs(o, pads[hand][0]);
            const padOnly = grab();
            const cols = new Set();
            for (let i = 0; i < padOnly.length; i += 4) if (mark(padOnly, i)) cols.add((i / 4) % cv.width);
            let edge = cv.height;
            for (const x of cols) for (let y = 0; y < cv.height; y += 1) {
              if (torso[(y * cv.width + x) * 4 + 3] > 24) { edge = Math.min(edge, y); break; }
            }
            const painted = new Set();
            let pixels = 0, shirt = 0;
            for (const x of cols) for (let y = 0; y < edge; y += 1) {
              const i = (y * cv.width + x) * 4;
              const changed = Math.max(...[0, 1, 2, 3].map((n) => Math.abs(full[i + n] - bare[i + n]))) > 24;
              const ink = full[i + 3] > 24 && Math.max(full[i], full[i + 1], full[i + 2]) < 80;
              if (changed && (mark(full, i) || ink)) { pixels += 1; painted.add(y); if (mark(full, i)) shirt += 1; }
            }
            rows.push({ body: body.height + "/" + body.weight, tag: rank + ":" + skin, hand,
              columns: cols.size, edge, height: cv.height, rows: painted.size, pixels, shirt });
          }
        } finally { restore(); }
      }
    }
    return rows;
  }, BODIES);
  const pixelLow = spongePixels.filter((r) => r.columns === 0 || r.edge <= 0 || r.edge >= r.height || r.rows < 1);
  check("thumb:pads:the-card-sponge-paints-above-the-no-pad-ink-silhouette",
    spongePixels.length === crowns.rows.length && pixelLow.length === 0,
    "floor 1 row, below " + pixelLow.length + " of " + spongePixels.length + ": "
      + spongePixels.map((r) => r.body + " " + r.tag + " hand " + r.hand + " " + r.rows + "rows/" + r.pixels + "px").join(", "));


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
     그래서 바닥은 굽는다. 정지 그림이 선 각과, 화면이 첫 프레임에 실제로 그린 각을 각각 한 장씩 구워
     그 둘의 거리를 바닥으로 쓴다. 그린 각은 도는 칸이 자기 시계로 들고 있는 수라, 기계가 바빠 첫
     프레임이 늦게 오면 바닥도 같은 만큼 늦은 각에서 구워지고, 주사율이 두 배인 화면에서는 같이 반이 된다.
     시계에서 뜬 수라 출발각에는 안 움직인다. 각을 튼 회귀는 도약만 커지고 바닥은 쉬는 각에서 구워져
     그대로라, 자기를 심판할 바닥을 같이 올릴 수 없다.
     실측: 100밀리초를 심은 대조군 회차에서 잰 각이 0.089에서 0.133라디안으로 가정값 0.0262의 서너 배였고,
     두 프레임을 박은 바닥은 열 선반 가운데 여덟이 빨개졌다(잉크 34.3퍼센트 대 바닥 15.1퍼센트).
     잰 각으로 구운 바닥은 같은 회차에서 열이 다 초록이었다(잉크 34.3 대 39.2).
     구운 화소끼리 견준다. 칸을 찍으면 자리와 각이 한 수에 섞여서, 위의 자리 축이 이미 답한 것을 다시 묻게 된다. */
  /* 가정값. 한 바퀴가 8초라 60헤르츠 두 프레임은 33.3밀리초, 곧 0.0262라디안이고 1.50도다.
     이 수는 이제 바닥이 아니라 대조군이다. 아래 줄이 잰 각과 이 수를 같이 찍어, 이 기계가 그
     가정에서 얼마나 갈렸는지가 회차마다 보인다. */
  const TURN_STEP = Math.PI * 2 * ((2 / 60) * 1000) / 8000;
  const startAt = await p.evaluate(async ([delta]) => {
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
      let bake = null;
      for (const kind of [shot.dataset.kind].concat(Object.keys(g.SKINS))) {
        const y = m.yawOf(kind);
        for (const arg of [g.lookOf(Object.assign({}, gear, { [kind]: rank }), me.name), { rank, skin: 0 }, rank]) {
          let rest = "";
          try { rest = m.thumbURL(kind, me, arg, { yaw: y }); } catch (e) { rest = ""; }
          if (rest !== still) continue;
          bake = { kind, arg, y };
          break;
        }
        if (bake) break;
      }
      /* 프레임 간격을 호버 직전에 잰다. 부하도 주사율도 이 한 수에 들어오고, 아래 여유가 여기서 나온다. */
      const beat = await new Promise((res) => requestAnimationFrame((p1) => requestAnimationFrame((p2) => res(p2 - p1))));
      card.dispatchEvent(new PointerEvent("pointerenter", { bubbles: false }));
      /* 한 프레임 안에 잡는다. 더 늦게 잡으면 도약과 정상 회전이 한 수에 섞인다. */
      await frames(1);
      /* 그 프레임이 그린 각. 캔버스를 읽기 전에 뜨므로 이 수와 아래 화소는 같은 프레임 몫이다.
         시계는 도는 칸이 들고 있고 여기서는 읽기만 한다. 밖에서 다시 세면 프레임이 밀린 회차에서 갈린다. */
      const spin = typeof window.__spinTurn === "function" ? window.__spinTurn() : -1;
      const cv = shot.querySelector("canvas");
      const one = cv ? cv.toDataURL("image/png") : "";
      card.dispatchEvent(new PointerEvent("pointerleave", { bubbles: false }));
      await new Promise((res) => setTimeout(res, 80));
      /* 한 프레임 여유. 잰 각과 구운 각이 같아도 살아 있는 칸과 구운 장의 화소가 완전히 같지는 않고,
         그 차이는 한 프레임 몫 안이다. 여유도 잰 간격에서 나오니 120헤르츠에서는 같이 반이 된다. */
      const slack = Math.PI * 2 * beat / 8000;
      let turn = null;
      if (bake && spin > 0) {
        try { turn = m.thumbURL(bake.kind, me, bake.arg, { yaw: bake.y + spin + slack }); } catch (e) { turn = null; }
      }
      if (!one || !turn) { out.push({ tab, jump: -1, step: -1, spin, beat }); continue; }
      const a = await read(still);
      const b = await read(one);
      const c = await read(turn);
      out.push({ tab, jump: gap(a, b), step: gap(a, c), spin, beat });
    }
    return out;
  }, [TURN_DELTA]);
  const jumped = startAt.filter((x) => !(x.jump >= 0 && x.step >= 0 && x.jump <= x.step + TURN_SHARE));
  const beats = startAt.map((x) => x.beat).filter((v) => v > 0).sort((u, v) => u - v);
  const beat = beats.length ? beats[beats.length >> 1] : -1;
  check("thumb:the-spin-starts-from-the-still", startAt.length > 0 && jumped.length === 0,
    (startAt.map((x) => x.jump < 0 || x.step < 0 ? x.tab + " unmeasured at " + x.spin.toFixed(4) + "rad"
      : x.tab + " " + (x.jump * 100).toFixed(1) + "% vs floor "
        + ((x.step + TURN_SHARE) * 100).toFixed(1) + "% at " + x.spin.toFixed(4) + "rad").join(", ") || "no shelf was read")
    + ", assumed " + TURN_STEP.toFixed(4) + "rad, frames arrive every " + beat.toFixed(1) + "ms");

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
