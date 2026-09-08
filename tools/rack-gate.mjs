import { chromium } from "playwright";
import { GLOVES, BOOTS, KITS, SOCKS, GOALS, CITIES, HAIRS, TATTOOS } from "../web/src/state/gear.mjs";

// 선반이 화면 폭을 쓰는지 재는 자.
// 상품을 한 열로 세우면 폭의 대부분이 비고 넷째 장은 스크롤 뒤로 숨는다. 눌러 볼 생각이 들려면
// 상품이 먼저 눈에 들어와야 하는데, 한 열은 목록이지 진열이 아니다.
//
// 칸 수는 offsetTop으로 센다. 카드마다 rotate가 걸려 있어 getBoundingClientRect는 회전된
// 바깥 상자를 돌려주고, 그러면 같은 줄에 선 카드의 top이 서로 달라져 한 줄이 두 줄로 읽힌다.
// 실측으로 이 착오가 900px에서 세 칸을 두 칸으로 보고했다. offsetTop은 배치 좌표라 변형에 안 흔들린다.
//
// 문턱은 지어내지 않는다. 축은 폭이 넓어지면 칸이 늘어나는가와, 좁아져도 상품이 사라지지 않는가다.
// 둘 다 같은 화면을 두 폭에서 재서 비교하는 것이라 절대값을 고를 일이 없다.
const EXE = process.env.LOCALAPPDATA + "/ms-playwright/chromium-1228/chrome-win64/chrome.exe";
const BASE = "http://127.0.0.1:10310/web/index.html?seed=20&preset=rich,veteran";
const WIDE = 1280;
const NARROW = 620;
// 계획이 못 박은 모바일 하한. 선반이 제 기둥을 넘어 왼쪽 탈의실을 덮는 것은 이 폭에서만 드러난다.
const HAND_W = 740;
const HAND_H = 360;
/* 선반 데이터가 들고 있는 설명 문장 전부. 카드는 이제 효과 한 줄만 들으므로 이 문장들은
   화면에서 내려왔고, 내려온 글이 아무도 안 읽는 값으로 남으면 다음 청소가 죽은 데이터로 지운다.
   수를 여기 적지 않고 데이터에서 센다. 적어 두면 등급이 하나 늘어난 날 이 자만 옛 수를 말한다. */
const NOTES = [GLOVES, BOOTS, KITS, SOCKS, GOALS, CITIES, HAIRS, TATTOOS]
  .reduce((all, rows) => all.concat(rows.map((g) => g.note)), []).filter((s) => s);
const LINE = String.fromCharCode(10);
const t = setTimeout(() => { console.log("WATCHDOG"); process.exit(1); }, 180000);
t.unref();

const fails = [], notes = [];
const check = (n, ok, d) => (ok ? notes : fails).push(n + " " + d);

const COUNT = () => { const out = {}; for (const tab of [...document.querySelectorAll("#shop .tab")]) { tab.click(); const rack = document.querySelector("#shop .rack"); const cards = rack ? [...rack.querySelectorAll(".card")] : []; const tops = {}; for (const c of cards) tops[c.offsetTop] = (tops[c.offsetTop] || 0) + 1; const cols = Object.keys(tops).length ? Math.max.apply(null, Object.values(tops)) : 0; const tracks = rack ? getComputedStyle(rack).gridTemplateColumns.split(" ").filter((s) => s).length : 0; out[tab.dataset.tab] = { cards: cards.length, cols, tracks }; } return out; };

/* 선반 상자가 제 기둥 안에 서는가, 그리고 왼쪽 기둥의 두 버튼이 제 화소를 갖는가.
   폭만 재면 안 된다. 94vw는 뷰포트를 재지 부모를 안 재므로 상자는 규칙대로 그려지고도
   옆 기둥 위로 넘어간다. 넘어간 자리에서 누가 눌리는지는 좌표를 찍어야 답이 나온다.
   걸쳐 본 것을 하나 만들어 두 버튼을 살려 놓고 잰다. 죽은 버튼도 제 화소를 갖지만
   이 축이 묻는 것은 사람이 눌러서 닿는가다. */
const FIT = () => {
  const tab = document.querySelector('#shop .tab[data-tab="hair"]');
  if (tab) tab.click();
  // 시착 누름이 상점을 다시 그리는 마지막 손질이다. 재는 것은 전부 그 뒤로 미룬다.
  const pick = [...document.querySelectorAll("#shop .rack .card.gear")].filter((c) => typeof c.onclick === "function")[0];
  if (pick) pick.click();
  /* 상자는 누름 뒤에 다시 찾는다. 누르기 전에 잡아 둔 손잡이는 다시 그리는 순간 화면에서 떨어져 나가고,
     떨어진 상자는 좌표를 전부 0으로 돌려준다. 0은 0 안에 들어가므로 담김을 묻는 축이 조용히 통과한다
     (실측: 선반 x[0,0] in 기둥 x[0,0]으로 초록, 같은 자리를 다시 찾아 재면 x[229,725]).
     한 번 이 함정에 빠져 카드와 배지만 앞으로 옮겼고, 같은 재정렬이 깨뜨린 나머지 둘은 뒤에 남았다. */
  const span = (e) => { const r = e.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.right)]; };
  const rect = (e) => { const r = e.getBoundingClientRect(); return [Math.round(r.top), Math.round(r.bottom)]; };
  const rack = document.querySelector("#shop .rack");
  const goods = document.querySelector("#shop .goods");
  const one = document.querySelector("#shop .rack .card");
  const badge = one ? one.querySelector(".buy") : null;
  /* 접힌 자리. 선반이 제 창을 가지면 그 창의 아래끝이고, 안 가지면 상자의 아래끝인데,
     상자가 화면보다 길면 그 아래끝은 화면 밖에 있다. 화면 밖의 선은 접힘이 아니라 그냥 안 보이는
     자리라, 둘 중 위에 있는 것이 진짜 접힘이다(실측: 상자 아래끝 582에 화면 360. 582로 재면
     카드를 330px로 부풀려 배지가 화면 아래 93px에 서도 두 축이 초록이었다). */
  const box = rack ? rack.getBoundingClientRect() : null;
  const top = box ? Math.round(box.top) : null;
  const fold = box ? Math.min(Math.round(box.top) + rack.clientHeight, innerHeight) : null;
  const bar = rack ? span(rack) : null;
  const col = goods ? span(goods) : null;
  const card = one ? rect(one) : null;
  const px = badge ? rect(badge) : null;
  const hit = (sel) => {
    const e = document.querySelector(sel);
    if (!e) return { own: false, live: false, who: "missing" };
    e.scrollIntoView({ block: "center" });
    const r = e.getBoundingClientRect();
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    const cls = top && top.getAttribute("class") ? "." + top.getAttribute("class").trim().split(/ +/).join(".") : "";
    return { own: Boolean(top) && (top === e || e.contains(top)), live: !e.disabled,
      who: top ? top.tagName.toLowerCase() + cls : "null" };
  };
  return { rack: bar, goods: col, top: top, fold: fold, card: card, px: px,
    all: hit("#shop .fitting .all"), strip: hit("#shop .fitting .strip") };
};

/* 등급 프레임 색. 카드가 든 등급과 그 카드의 테두리 색을 같이 뽑는다.
   선언된 값이 아니라 계산된 값을 읽어야, 규칙이 다른 규칙에 덮인 카드가 잡힌다. */
const RARE = () => {
  const out = [];
  for (const tab of [...document.querySelectorAll("#shop .tab")]) {
    tab.click();
    for (const c of document.querySelectorAll("#shop .rack .card")) {
      out.push({ tab: tab.dataset.tab, rare: c.dataset.rare === undefined ? null : Number(c.dataset.rare),
        color: getComputedStyle(c).borderTopColor });
    }
  }
  return out;
};

// sRGB 상대 명도. 채널을 선형으로 편 뒤 사람 눈의 가중치로 더한다.
const lumOf = (css) => {
  const n = (css.match(/[0-9.]+/g) || []).slice(0, 3).map(Number);
  if (n.length < 3) return -1;
  const lin = n.map((v) => { const u = v / 255; return u <= 0.04045 ? u / 12.92 : Math.pow((u + 0.055) / 1.055, 2.4); });
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
};

/* 기간 토큰이 카드 안에 통째로 서는가. 봇은 분이고 버프는 슛이라 파는 물건의 크기 그 자체인데,
   효과 문장이 두 줄에서 잘리면 그 뒤에 붙은 이 칸이 말줄임표 뒤로 통째로 사라졌다.
   실측으로 송진 스프레이가 1280에서 잘려(문장 81px, 창 54px) 10슛이 선반 어디에도 안 떴고,
   형제 둘은 12슛과 8슛을 그대로 들고 있어 셋 중 하나만 조용히 기간을 감췄다.
   묻는 것이 셋이다. 글자가 있는가, 그 상자가 카드 안에 들어 있는가, 그 한가운데를 찍으면
   그 칸이 돌아오는가. 앞의 둘만 물으면 다른 조각이 위에 덮인 자리를 통과시킨다. */
const DURATION = () => {
  const out = [];
  for (const tab of [...document.querySelectorAll("#shop .tab")]) {
    const kind = tab.dataset.tab;
    if (kind !== "bot" && kind !== "buff") continue;
    tab.click();
    for (const card of document.querySelectorAll("#shop .rack .card.gear")) {
      const name = (card.querySelector("b") || {}).textContent || "";
      const dur = card.querySelector(".duration");
      const em = card.querySelector("em");
      const eff = card.querySelector(".eff");
      if (!dur) { out.push({ tab: kind, name: name.trim(), has: false }); continue; }
      /* 화면 밖의 점은 elementFromPoint가 null을 낸다. 좁은 폭에서는 카드가 접힌 자리 아래에 서므로
         먼저 화면 가운데로 끌어오고, 끌어온 뒤의 좌표로 다시 잰다.
         끌어오는 것은 이 칸이 아니라 카드다. overflow:hidden 상자도 코드로는 굴러가므로,
         잘린 칸을 직접 끌어오면 그 상자가 27px 굴러 이 자가 재려던 잘림 자체가 사라진다
         (실측: 송진 스프레이가 이 실수 하나로 잘린 채 초록을 냈다). 카드를 끌면 상자는 안 구른다. */
      card.scrollIntoView({ block: "center" });
      const c = card.getBoundingClientRect();
      const d = dur.getBoundingClientRect();
      const mid = document.elementFromPoint(d.left + d.width / 2, d.top + d.height / 2);
      out.push({ tab: kind, name: name.trim(), has: true, txt: (dur.textContent || "").trim(),
        w: Math.round(d.width), h: Math.round(d.height),
        inside: d.width > 0 && d.height > 0 && d.left >= c.left - 1 && d.right <= c.right + 1
          && d.top >= c.top - 1 && d.bottom <= c.bottom + 1,
        own: Boolean(mid) && (mid === dur || dur.contains(mid) || mid.contains(dur)),
        // 세로 폭에서는 가로로 돌리라는 판이 화면을 통째로 덮는다. 그 판 아래의 점은 카드가
        // 가린 것이 아니라 상점 자체가 사람에게 안 보이는 것이라, 누름 축이 잴 자리가 아니다.
        shop: Boolean(mid) && Boolean(document.getElementById("shop")) && document.getElementById("shop").contains(mid),
        /* 자르는 상자는 .eff다. em은 flex에 overflow:visible이라 굴림값이 0에 못 박혀 있고,
           거기만 물으면 이 대조군은 못 빨개진다(실측: .eff를 99로 밀면 1280에서 27, 740에서 22로 서는데
           같은 순간 em은 둘 다 0이었다). 둘 다 읽어, 접기가 나중에 어느 쪽으로 옮겨 가도 빨개진다.
           .eff가 없으면 -1이라 이 축이 또 0에 못 박히는 그 순간에 빨개진다. */
        effTop: eff ? Math.round(eff.scrollTop) : -1,
        emTop: em ? Math.round(em.scrollTop) : -1,
        who: mid ? mid.tagName.toLowerCase() + (mid.className ? "." + String(mid.className).trim().split(/ +/).join(".") : "") : "null",
        card: [Math.round(c.left), Math.round(c.right), Math.round(c.top), Math.round(c.bottom)],
        rect: [Math.round(d.left), Math.round(d.right), Math.round(d.top), Math.round(d.bottom)] });
    }
  }
  return out;
};

/* 접힌 효과 이름 옆에서 수치가 어디에 서는가. 이름이 두 줄이 되면 칸이 이름 블록 전체가 아니라
   첫 줄에만 붙었다(실측: 1280에서 자양강장제 이름 블록의 세로 가운데가 417.3인데 12슛은 402.71,
   한 줄 26.88의 절반인 13.44를 14.58이 넘었다). 아래 줄은 값 없이 남고 값은 위로 떠서,
   넉 장을 훑는 눈이 그 수가 어느 이름의 것인지를 카드마다 다시 맞춘다.
   줄 수는 그려진 상자로 센다. Range가 세는 줄은 접기 전의 줄이라 740에서 송진 스프레이가
   세 줄로 잡히는데 화면에 선 상자는 한 줄이다(실측: range 3, 상자 24.28px에 한 줄 22.5px).
   사람이 보는 이름 블록은 접힌 뒤의 상자이므로 그쪽으로 재고, Range 수는 같이 적어 접힘을 남긴다.
   한 줄 카드와 두 줄 카드를 같은 식으로 잰다. 식이 하나여야 두 줄만 따로 봐 주는 예외가 안 생긴다. */
const ALIGN = () => {
  const out = [];
  const num = (v) => Math.round(v * 100) / 100;
  const read = (eff, dur) => {
    const n = eff.getBoundingClientRect(), v = dur.getBoundingClientRect();
    const lh = parseFloat(getComputedStyle(eff).lineHeight);
    const rng = document.createRange();
    rng.selectNodeContents(eff);
    return { lh: num(lh), rows: Math.round(n.height / lh), range: rng.getClientRects().length,
      nMid: num(n.top + n.height / 2), vMid: num(v.top + v.height / 2),
      off: num(Math.abs((v.top + v.height / 2) - (n.top + n.height / 2))) };
  };
  for (const tab of [...document.querySelectorAll("#shop .tab")]) {
    const kind = tab.dataset.tab;
    if (kind !== "bot" && kind !== "buff") continue;
    tab.click();
    for (const card of document.querySelectorAll("#shop .rack .card.gear")) {
      const name = (((card.querySelector("b") || {}).textContent) || "").trim();
      const em = card.querySelector("em");
      const eff = card.querySelector(".eff");
      const dur = card.querySelector(".duration");
      if (!em || !eff || !dur) { out.push({ tab: kind, name: name, split: false }); continue; }
      const live = read(eff, dur);
      /* 대조군은 같은 화면에서 만든다. 칸을 첫 줄에 못 박고 같은 자로 다시 재는 것이라,
         묻는 것은 문턱이 맞는가가 아니라 이 자가 어긋남을 보기는 하는가다.
         잰 뒤에 인라인 값을 도로 지운다. 남겨 두면 뒤에 오는 축이 이 자가 민 화면을 잰다. */
      em.style.alignItems = "flex-start";
      dur.style.alignSelf = "flex-start";
      const pinned = read(eff, dur);
      em.style.alignItems = "";
      dur.style.alignSelf = "";
      out.push({ tab: kind, name: name, split: true, live: live, pinned: pinned });
    }
  }
  return out;
};
let b;
try {
  b = await chromium.launch({ executablePath: EXE });
  const errs = [];
  const at = async (w, h) => {
    const ctx = await b.newContext({ viewport: { width: w, height: h } });
    const p = await ctx.newPage();
    p.on("pageerror", (e) => errs.push(String(e)));
    await p.goto(BASE, { waitUntil: "load" });
    await p.waitForSelector("#go", { timeout: 15000 });
    await p.click("#go", { force: true });
    await p.waitForTimeout(1300);
    await p.evaluate(() => window.__shop(true));
    await p.waitForTimeout(300);
    const count = await p.evaluate(COUNT);
    const rare = await p.evaluate(RARE);
    const fit = await p.evaluate(FIT);
    const dur = await p.evaluate(DURATION);
    const align = await p.evaluate(ALIGN);
    /* 내려온 설명 문장이 어디에 서 있는가. 페이지가 이미 불러 둔 판을 다시 부르는 것이라
       모듈이 두 번 돌지 않고, 화면에 안 그려지는 값을 화면 쪽에서 읽는 유일한 길이다. */
    const parked = await p.evaluate(async () => {
      const m = await import("/web/src/main.mjs");
      if (!Array.isArray(m.SHELF_NOTES_FOR_WIKI)) return null;
      const out = [];
      for (const s of m.SHELF_NOTES_FOR_WIKI) for (const g of (s && s.rows) || []) out.push(g && g.note);
      return out;
    }).catch(() => null);
    await ctx.close();
    return { count, rare, fit, parked, dur, align };
  };
  const full = await at(WIDE, 720);
  const thin = await at(NARROW, 720);
  const hand = await at(HAND_W, HAND_H);
  const wide = full.count;
  const narrow = thin.count;

  const racks = Object.keys(wide).filter((k) => wide[k].cards > 0);
  check("instrument:some-shelf-had-cards", racks.length > 0, racks.length + " shelves with cards");
  // 대조군. 줄을 세는 두 방법이 같은 답을 내야 한다. 하나는 카드의 배치 좌표를 묶은 것이고
  // 하나는 그리드가 선언한 트랙 수다. 둘이 갈리면 세는 쪽이 틀린 것이다.
  const disagree = racks.filter((k) => wide[k].cards >= wide[k].tracks && wide[k].cols !== wide[k].tracks);
  check("control:two-ways-of-counting-columns-agree", disagree.length === 0, disagree.map((k) => k + " " + wide[k].cols + " vs " + wide[k].tracks).join(", ") || "agree on " + racks.length);

  const single = racks.filter((k) => wide[k].cards >= 2 && wide[k].cols < 2);
  check("rack:a-wide-screen-puts-cards-side-by-side", single.length === 0, single.join(", ") || "widest shelf " + Math.max.apply(null, racks.map((k) => wide[k].cols)) + " columns");

  const lost = racks.filter((k) => !narrow[k] || narrow[k].cards !== wide[k].cards);
  check("rack:a-narrow-screen-keeps-every-card", lost.length === 0, lost.join(", ") || "all shelves keep their cards");

  const stuck = racks.filter((k) => wide[k].cards >= 4 && narrow[k].cols >= wide[k].cols);
  check("rack:columns-follow-the-viewport", stuck.length === 0, stuck.map((k) => k + " " + wide[k].cols + "->" + narrow[k].cols).join(", ") || WIDE + "px vs " + NARROW + "px differ on every full shelf");

  /* 선반이 제 기둥을 안 넘는가. 실측으로 740x360에서 선반 상자가 x[129,825]에 서고
     기둥은 x[229,725]였다. 넘친 200px이 왼쪽 탈의실 위로 올라가 카드 두 장이 그 기둥을 덮었다. */
  const h = hand.fit;
  /* 폭이 0인 상자는 통과가 아니라 실패다. 담김만 물으면 x[0,0]이 x[0,0] 안에 들어가므로,
     아무것도 못 잰 판이 가장 깨끗한 초록으로 온다. 재기 전에 잰 것이 있는지부터 묻는다. */
  const drawn = Boolean(h.rack && h.goods) && h.rack[1] > h.rack[0] && h.goods[1] > h.goods[0];
  const inside = drawn && h.rack[0] >= h.goods[0] && h.rack[1] <= h.goods[1];
  check("rack:the-shelf-stays-inside-its-column", inside,
    "rack x[" + (h.rack || "none") + "] in goods x[" + (h.goods || "none") + "] at " + HAND_W + "x" + HAND_H
      + (drawn ? "" : ", one of the two boxes measured no width"));
  // 덮였는지는 좌표가 답한다. 두 버튼 한가운데를 찍어 돌아오는 것이 그 버튼 자신인지 본다.
  check("rack:the-fitting-buttons-take-their-own-taps", h.all.own && h.strip.own,
    "buy -> " + h.all.who + (h.all.live ? "" : " (disabled)") + ", strip -> " + h.strip.who + (h.strip.live ? "" : " (disabled)"));
  /* 카드 한 장이 통째로 서는가. 그림과 이름과 효과까지 보이고 값만 접힌 자리 아래로 내려가면,
     무엇을 파는지는 보이고 얼마인지는 굴려야 보인다. 상자의 아래끝이 아니라 접힌 자리와 맞댄다.
     실측으로 선반 창이 187px인데 카드가 216px이라 값 배지가 17px 잘려 있었다. */
  check("rack:a-whole-card-stands-above-the-fold",
    Boolean(h.card) && h.fold !== null && h.card[1] > h.card[0] && h.card[0] >= h.top && h.card[1] <= h.fold,
    "first card y[" + (h.card || "none") + "] against rack fold " + h.fold + " at " + HAND_W + "x" + HAND_H);
  // 값 배지는 카드에서 가장 아래에 서는 조각이라 접힘을 가장 먼저 맞는다. 선반 안에 통째로 들어야 한다.
  check("rack:the-price-badge-is-whole-inside-the-shelf",
    Boolean(h.px) && h.fold !== null && h.top !== null && h.px[1] > h.px[0] && h.px[0] >= h.top && h.px[1] <= h.fold,
    "badge y[" + (h.px || "none") + "] inside shelf y[" + h.top + "," + h.fold + "]");
  // 대조군. 같은 두 좌표가 넓은 폭에서는 제 버튼을 돌려줘야 한다. 아니면 이 자가 눈이 먼 것이다.
  check("control:the-same-two-taps-land-on-a-wide-screen", full.fit.all.own && full.fit.strip.own,
    "buy -> " + full.fit.all.who + ", strip -> " + full.fit.strip.who + " at " + WIDE + "x720");

  /* 등급 프레임. 4단이 서로 다른 색이고 등급이 오를수록 밝아진다.
     명도를 고른 이유는 색상만으로는 순서가 없기 때문이다. 파랑과 보라 중 어느 것이 위인지는
     아무도 못 읽지만, 어느 쪽이 밝은지는 읽는다. */
  const rare = full.rare;
  const blind = rare.filter((c) => !Number.isFinite(c.rare));
  check("rack:every-card-declares-its-tier", rare.length > 0 && blind.length === 0,
    blind.length ? blind.length + " of " + rare.length + " cards carry no tier (" + [...new Set(blind.map((c) => c.tab))].join(", ") + ")"
      : rare.length + " cards over " + new Set(rare.map((c) => c.tab)).size + " shelves");
  const byTier = new Map();
  // 등급을 안 든 카드는 여기서 뺀다. 안 빼면 null 한 칸이 통째로 한 등급으로 서서
  // 아래 대조군이 빈 집합 위에서 초록을 낸다.
  for (const c of rare) { if (!Number.isFinite(c.rare)) continue; if (!byTier.has(c.rare)) byTier.set(c.rare, new Set()); byTier.get(c.rare).add(c.color); }
  const split = [...byTier].filter((e) => e[1].size > 1);
  check("control:one-tier-is-one-colour-on-every-shelf", byTier.size > 0 && split.length === 0,
    split.map((e) => e[0] + " wears " + [...e[1]].join(" / ")).join(", ") || byTier.size + " tiers, one colour each");
  const tiers = [...byTier.keys()].sort((a, c) => a - c);
  const tone = tiers.map((k) => [...byTier.get(k)][0]);
  check("rack:the-four-tiers-wear-four-colours", tiers.length === 4 && new Set(tone).size === 4,
    tiers.join(",") + " -> " + tone.join(" "));
  const lum = tone.map(lumOf);
  let rises = tiers.length > 1;
  for (let i = 1; i < lum.length; i += 1) if (!(lum[i] > lum[i - 1])) rises = false;
  check("rack:the-frame-brightens-with-the-tier", rises,
    tiers.map((k, i) => k + " " + lum[i].toFixed(3)).join(" < "));

  /* 내려온 설명 문장에 독자가 있는가. 카드에서 빠진 뒤로 이 문장들을 읽는 화면이 없어서,
     다음 청소가 죽은 값으로 보고 지울 수 있는 자리에 남았다. 위키 화면이 가져갈 때까지
     이 축이 그 독자다. 문장을 여기 옮겨 적지 않고 선반 데이터에서 세어 맞대므로,
     등급이 늘거나 문장이 바뀌면 옮겨 적은 쪽이 아니라 양쪽이 같이 움직인다. */
  const parked = full.parked;
  const unread = parked === null ? NOTES : NOTES.filter((s) => parked.indexOf(s) < 0);
  check("rack:every-shelf-note-has-a-reader", parked !== null && NOTES.length > 0 && unread.length === 0,
    parked === null ? "SHELF_NOTES_FOR_WIKI missing from main.mjs, " + NOTES.length + " notes unread"
      : unread.length ? unread.length + " of " + NOTES.length + " unread, first " + JSON.stringify(unread[0])
        : NOTES.length + " notes parked for the wiki screen");
  /* 기간 토큰. 세 폭에서 봇과 버프 카드 전부를 훑는다. 1280만 재면 좁은 폭에서 한 줄로 접히는
     자리를 놓치고, 그 폭이 F3에서 열 장까지 잘린 폭이다. */
  const durMissing = [], durOut = [], durHidden = [], durEmpty = [], durBlocked = [], durRolled = [];
  let durSeen = 0, durTapped = 0;
  for (const [w, h, rows] of [[WIDE, 720, full.dur], [NARROW, 720, thin.dur], [HAND_W, HAND_H, hand.dur]]) {
    for (const d of rows) {
      durSeen += 1;
      const at = d.name + " " + w + "x" + h;
      if (!d.has) { durMissing.push(at); continue; }
      if (!/[0-9]/.test(d.txt) || !/[분슛]/.test(d.txt)) durEmpty.push(at + " reads " + JSON.stringify(d.txt));
      if (!d.inside) durOut.push(at + " token x[" + d.rect[0] + "," + d.rect[1] + "] y[" + d.rect[2] + "," + d.rect[3] + "] against card x[" + d.card[0] + "," + d.card[1] + "] y[" + d.card[2] + "," + d.card[3] + "]");
      if (d.effTop !== 0 || d.emTop !== 0) durRolled.push(at + " clamp box at " + d.effTop + ", effect row at " + d.emTop);
      if (!d.shop) { durBlocked.push(at + " " + d.who); continue; }
      durTapped += 1;
      if (!d.own) durHidden.push(at + " centre returns " + d.who);
    }
  }
  const durCards = full.dur.length + thin.dur.length + hand.dur.length;
  check("rack:every-bot-and-buff-card-carries-its-duration", durSeen > 0 && durMissing.length === 0,
    durMissing.slice(0, 3).join(", ") || durSeen + " card readings over three widths, every one carries a duration span");
  check("rack:the-duration-token-reads-a-number-and-a-unit", durSeen > 0 && durEmpty.length === 0,
    durEmpty.slice(0, 3).join(", ") || durSeen + " tokens carry a number and 분 or 슛");
  check("rack:the-duration-token-sits-inside-its-card", durSeen > 0 && durOut.length === 0,
    durOut.slice(0, 2).join(", ") || durSeen + " tokens inside their card box");
  /* 잘림은 여기서 잡힌다. 말줄임표 뒤로 넘어간 칸은 폭도 높이도 남아 있지만 그 한가운데를 찍으면
     제 칸이 아니라 그것을 자른 부모가 돌아온다. */
  check("rack:the-duration-token-answers-its-own-centre", durTapped > 0 && durHidden.length === 0,
    durHidden.slice(0, 3).join(", ") || durTapped + " of " + durSeen + " tokens answer a tap at their centre, "
      + durBlocked.length + " behind the portrait lock");
  /* 계기. 잘린 상자가 굴러 있으면 위 축이 잰 것은 화면에 선 자리가 아니다. 굴림값 0을 같이 물어야
     이 자가 잘림을 보고 있다고 말할 수 있다. 묻는 상자는 자르는 상자여야 한다. */
  check("instrument:no-clamped-box-was-rolled-while-measuring", durRolled.length === 0,
    durRolled.slice(0, 2).join(", ") || durSeen + " readings taken with every clamp box and effect row at scrollTop 0");
  check("instrument:every-bot-and-buff-card-was-read-for-duration", durCards === durSeen && durSeen > 0,
    durSeen + " readings, " + full.dur.length + " at " + WIDE + "px, " + thin.dur.length + " at " + NARROW + "px, " + hand.dur.length + " at " + HAND_W + "px, "
      + durTapped + " tap-tested, texts " + full.dur.map((d) => d.txt).join(" "));
  /* 접힌 이름 옆의 수치. 이름 블록의 세로 가운데와 수치 칸의 세로 가운데가 한 줄 높이의 절반 안에
     같이 서는가를 묻는다. 문턱은 지어낸 수가 아니라 그 화면이 쓰는 줄 높이 그 자체다.
     한 줄 카드도 같은 식으로 잰다. 두 줄만 따로 재면 규칙이 둘이 되고, 그때 어느 쪽이 옳은지는
     카드마다 갈린다. */
  const alignRows = [];
  for (const [w, h, rows] of [[WIDE, 720, full.align], [NARROW, 720, thin.align], [HAND_W, HAND_H, hand.align]])
    for (const a of rows) alignRows.push({ at: a.name + " " + w + "x" + h, a: a });
  const paired = alignRows.filter((r) => r.a.split);
  const hung = paired.filter((r) => r.a.live.off > r.a.live.lh / 2);
  const wrapped = paired.filter((r) => r.a.live.rows >= 2);
  check("rack:a-wrapped-name-keeps-its-value-beside-it", paired.length > 0 && hung.length === 0,
    hung.slice(0, 3).map((r) => r.at + " value mid " + r.a.live.vMid + " against name mid " + r.a.live.nMid
      + " over " + r.a.live.rows + " lines, off " + r.a.live.off + " past " + (r.a.live.lh / 2)).join(", ")
      || paired.length + " readings, " + wrapped.length + " of them two-line, worst off "
        + Math.max.apply(null, paired.map((r) => r.a.live.off)) + " inside half a line");
  /* 두 줄 표본이 없으면 이 축은 아무것도 안 물은 것이다. 한 줄짜리만 모아 놓고 초록을 내면
     그 초록은 정렬이 옳다는 뜻이 아니라 접힌 이름을 한 장도 못 만났다는 뜻이다. */
  check("instrument:a-two-line-effect-name-stood-in-the-sample", wrapped.length > 0,
    wrapped.length ? wrapped.length + " of " + paired.length + " readings draw two lines: "
      + wrapped.map((r) => r.at + " range " + r.a.live.range).join(", ")
      : "no card drew a two-line effect name over " + paired.length + " readings");
  // 대조군. 같은 카드의 칸을 첫 줄에 못 박으면 위 축이 빨개져야 한다. 안 빨개지면 이 자가 눈이 먼 것이다.
  const unseen = wrapped.filter((r) => r.a.pinned.off <= r.a.pinned.lh / 2);
  check("control:a-value-pinned-to-the-first-line-is-caught", wrapped.length > 0 && unseen.length === 0,
    unseen.slice(0, 2).map((r) => r.at + " stays inside " + (r.a.pinned.lh / 2) + " at off " + r.a.pinned.off).join(", ")
      || wrapped.length + " two-line readings go red when pinned to the first line, off "
        + wrapped.map((r) => r.a.pinned.off).join(" / "));
  check("console:no-errors", errs.length === 0, errs.slice(0, 2).join(" | ") || "clean");

  for (const k of racks) console.log("  " + k.padEnd(7) + " cards " + wide[k].cards + "  columns " + wide[k].cols + " at " + WIDE + "px, " + narrow[k].cols + " at " + NARROW + "px");
  console.log("  표본 범위: 선반 " + racks.length + "칸 x 폭 " + WIDE + "/" + NARROW + "/" + HAND_W + "px, 카드 " + rare.length + "장");
  if (notes.length) console.log(notes.map((x) => "  ok   " + x).join(LINE));
  if (fails.length) console.log(fails.map((x) => "  FAIL " + x).join(LINE));
  console.log(fails.length ? "rack FAIL " + fails.length : "rack PASS " + notes.length);
  if (fails.length) process.exitCode = 1;
} finally {
  clearTimeout(t);
  if (b) await b.close();
}
