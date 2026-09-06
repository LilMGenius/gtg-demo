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
  const span = (e) => { const r = e.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.right)]; };
  const rack = document.querySelector("#shop .rack");
  const goods = document.querySelector("#shop .goods");
  /* 접힌 자리. 선반이 제 창을 가지면 그 창의 아래끝이고, 안 가지면 상자의 아래끝이다.
     상자 높이가 아니라 clientHeight를 쓰는 이유는, 넘친 내용은 상자 밖에 그려지지 않기 때문이다. */
  const box = rack ? rack.getBoundingClientRect() : null;
  const top = box ? Math.round(box.top) : null;
  const fold = box ? Math.round(box.top) + rack.clientHeight : null;
  const one = document.querySelector("#shop .rack .card");
  const badge = one ? one.querySelector(".buy") : null;
  const rect = (e) => { const r = e.getBoundingClientRect(); return [Math.round(r.top), Math.round(r.bottom)]; };
  /* 값을 지금 읽어 둔다. 아래의 시착 누름이 상점을 통째로 다시 그리므로, 노드를 들고 있다가
     그 뒤에 재면 화면에서 떨어져 나간 상자를 재게 되고 좌표가 전부 0으로 온다. */
  const card = one ? rect(one) : null;
  const px = badge ? rect(badge) : null;
  const pick = [...document.querySelectorAll("#shop .rack .card.gear")].filter((c) => typeof c.onclick === "function")[0];
  if (pick) pick.click();
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
  return { rack: rack ? span(rack) : null, goods: goods ? span(goods) : null,
    top: top, fold: fold, card: card, px: px,
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
    return { count, rare, fit, parked };
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
  const inside = Boolean(h.rack && h.goods) && h.rack[0] >= h.goods[0] && h.rack[1] <= h.goods[1];
  check("rack:the-shelf-stays-inside-its-column", inside,
    "rack x[" + (h.rack || "none") + "] in goods x[" + (h.goods || "none") + "] at " + HAND_W + "x" + HAND_H);
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
