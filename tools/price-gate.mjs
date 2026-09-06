import { chromium } from "playwright";

// 값 표기의 자. 상단 잔고는 아이콘인데 상점 버튼은 '140 육수'처럼 글자였다.
// 같은 재화가 두 표기로 갈리면 어느 재화로 사는지가 글자를 읽어야 아는 정보가 된다.
//
// 재는 것은 셋이다. 값을 말하는 판에 재화 이름이 글자로 남지 않는가, 값마다 아이콘이 하나씩
// 붙어 있는가, 그 아이콘이 DOM에만 있는 게 아니라 화소로 찍혔는가.
// 앞의 둘은 대조군을 달고 온다. 판에 '육수' 글자를 심어서 자가 그것을 잡는지 먼저 본다.
const EXE = process.env.LOCALAPPDATA + "/ms-playwright/chromium-1228/chrome-win64/chrome.exe";
// maxed는 훈련장의 잉여 훈련 환전 줄을 열고, rich는 상점 값이 전부 모자람 문구로 덮이는 것을 막는다.
const BASE = "http://127.0.0.1:10310/web/index.html?seed=20&preset=maxed,rich,veteran";
const LINE = String.fromCharCode(10);
// U+C721 U+C218. 재화 이름을 소스에 글자로 두면 이 파일 자신이 잔여 검색에 걸린다.
// 값은 아래 대조군이 검증한다. 코드포인트를 잘못 적으면 이 자는 엉뚱한 글자를 재고 조용히 초록을 낸다.
const WORD = String.fromCharCode(0xC721, 0xC218);
// U+AD6C. 판을 세던 옛 단위이고 U+D55C은 그 앞에 붙던 관형사다.
// 소스에 글자로 두는 것을 피하는 이유는 위와 같다.
const SHOT = String.fromCharCode(0xAD6C);
const HAN_ONE = String.fromCharCode(0xD55C);
// 값과 값을 잇는 자리에 쓰인 구분 기호. 화면에서는 목록 기호로 읽혀 두 값이 한 항목처럼 붙고,
// 파운더가 이것을 불렛포인트라 부르며 두 번 짚었다. 가운뎃점, 불릿, 그리고 em 대시 무리다.
const BULLETS = [0x00B7, 0x2022, 0x2014, 0x2013, 0x2015].map((c) => String.fromCharCode(c));
const t = setTimeout(() => { console.log("WATCHDOG"); process.exit(1); }, 150000);
t.unref();

const fails = [], notes = [];
const check = (n, ok, d) => (ok ? notes : fails).push(n + " " + d);

// 보이는 글자만 센다. textContent는 접힌 자식까지 세므로 화면에 없는 글자가 결함으로 잡힌다.
// 아이콘 안의 <title>도 뺀다. 그것은 그려지는 글자가 아니라 아이콘의 이름이고,
// 세면 이 자가 자기 아이콘의 이름을 남은 글자로 잡아 스스로 빨간불을 만든다.
function shown(sel) {
  const root = document.querySelector(sel);
  if (!root) return [];
  const out = [];
  const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = walk.nextNode(); n; n = walk.nextNode()) {
    const e = n.parentElement;
    if (!e) continue;
    if (e.namespaceURI !== "http://www.w3.org/1999/xhtml") continue;
    const s = getComputedStyle(e);
    if (s.display === "none" || s.visibility === "hidden") continue;
    if (!e.getClientRects().length) continue;
    out.push(n.nodeValue);
  }
  return out;
}

// 라벨 문법. 버튼과 배지에 서는 글자는 값이거나 두 글자 이하 명사다.
// 값은 아이콘이 재화를 말하므로 숫자만 남고, 상태는 착용·보유·한도·품절처럼 두 글자로 선다.
const NOUN_MAX = 2;
// 값 하나. 앞의 부호는 묶음 회차 배지가 값의 일부로 쓴다(측정: 열 장 회차 배지 '+1').
const VALUE = "^[+]?[0-9,]+$";
// 문장 끝. 종결 어미나 마침표로 끝나면 그것은 라벨이 아니라 문장이다.
const SENTENCE = "(?:다|요)$|[.!?]$";
// 이름 자리는 종결 어미 자를 못 받는다. 명단의 사람 이름 '레이나요'가 문장으로 잡힌다.
const STOP = "[.!?]$";
// 두 글자를 넘지만 계획 todo 4가 이름으로 지정한 상태 라벨. 지금은 하나뿐이고,
// 이 목록이 길어지는 만큼 계약이 헐거워지므로 늘릴 때는 계획 문서가 근거여야 한다.
const LONG_STATES = ["상위 보유"];
// 재는 자리는 버튼과 배지다. 죽은 이름은 안 넣는다. .got은 화면에서 사라졌고
// .price-badge는 이 파일 밖 어디에도 없어, 둘 다 아무것도 안 재면서 목록만 길게 했다.
const LABEL_NODES = "button, .px, .held, .tried i";
// 이름이 서는 자리. 선반 탭과 갈래 버튼과 명단 카드와 걸친 목록은 상품과 사람의 이름을 든다.
// 이름에는 두 글자 자를 못 대지만 마침표 자는 그대로 받는다.
const NAME_SLOTS = ".tab, .kind, #roster .row button, #shop .fitting .tried i[data-off]";

// 한 판의 버튼과 배지를 재서 계약을 어긴 글자만 돌려준다. 판이 없으면 null이라 0건과 안 섞인다.
// 재는 단위는 그려진 글자 토막 하나다. 버튼 글자를 통째로 이으면 사유 배지와 값이 붙어
// 화면에 없는 '품절1380' 같은 라벨이 생기고, 그것을 재면 이 자가 스스로 빨간불을 만든다.
// 아이콘 안의 <title>은 shown()과 같은 이유로 뺀다. 그래야 값 배지가 '140'으로 읽힌다.
function labelHits(cfg) {
  const root = document.querySelector(cfg.sel);
  if (!root) return null;
  const out = { seen: 0, runs: 0, sentence: [], shape: [] };
  for (const node of root.querySelectorAll(cfg.nodes)) {
    if (!node.getClientRects().length) continue;
    const named = Boolean(node.closest(cfg.names));
    let counted = false;
    const walk = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
    for (let n = walk.nextNode(); n; n = walk.nextNode()) {
      const e = n.parentElement;
      if (!e) continue;
      if (e.namespaceURI !== "http://www.w3.org/1999/xhtml") continue;
      const s = getComputedStyle(e);
      if (s.display === "none" || s.visibility === "hidden") continue;
      if (!e.getClientRects().length) continue;
      const text = n.nodeValue.trim().split(/[ \t\r\n]+/).join(" ");
      if (!text) continue;
      out.runs += 1;
      counted = true;
      if (new RegExp(named ? cfg.stop : cfg.sentence).test(text)) { out.sentence.push(text); continue; }
      if (named) continue;
      if (new RegExp(cfg.value).test(text)) continue;
      if (text.length <= cfg.max) continue;
      if (cfg.states.indexOf(text) >= 0) continue;
      out.shape.push(text);
    }
    if (counted) out.seen += 1;
  }
  return out;
}

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

  // 값을 말하는 판 셋. 상점과 선수단은 훅으로 열리고 훈련장은 버튼으로만 열린다.
  // 아는 얼굴은 라포가 쌓여야 만남 줄이 서므로 신규 표본에서는 잴 값이 없다.
  const panes = [["shop", "__shop"], ["roster", "__roster"], ["gym", null]];
  for (const [id, hook] of panes) {
    if (hook) await p.evaluate((h) => { window[h](true); }, hook);
    else await p.click("#gymBtn", { force: true });
    await p.waitForTimeout(320);
    // 상점은 한 번에 한 선반만 그린다. 열린 탭만 재면 나머지 열 선반은 안 재고 초록이 난다.
    const tabs = id === "shop"
      ? await p.evaluate(() => [...document.querySelectorAll("#shop .tab")].map((e) => e.dataset.tab))
      : [null];
    let seenAll = "", unitAll = "", dotAll = "", total = 0, blind = 0, dark = [];
    for (const tab of tabs) {
      if (tab) {
        await p.click('#shop .tab[data-tab="' + tab + '"]', { force: true });
        await p.waitForTimeout(180);
      }
      const seen = await p.evaluate(shown, "#" + id);
      // 값으로 쓰인 자리만 잔여다. 선반 문구의 그 낱말은 재화가 아니라 몸에서 나는 것을 말한다.
      // 가르는 것은 한 글자 덩어리 안에 숫자가 같이 있는가다. 이웃한 값까지 이어 붙여 재면
      // 옆 카드의 가격이 문구를 값으로 만들어 버린다.
      // 발견해도 다음 칸으로 넘어간다. 여기서 루프를 끊으면 아래 가격 집계가 0으로 남아,
      // 이 축 하나가 옆 축까지 같이 빨갛게 만든다. 축은 서로를 안 끌고 죽어야 한다.
      const hit = seen.find((s) => s.indexOf(WORD) >= 0 && /[0-9]/.test(s));
      if (hit && !seenAll) seenAll = (tab || id) + ": " + hit.trim();
      // 판을 세는 단위. 파운더가 두 번 짚은 표현이라 화면에서 사라진 것을 계기가 지킨다.
      // 숫자나 관형사가 앞에 붙은 자리만 단위다. 낱말 자체는 다른 뜻으로도 쓰인다.
      const unit = seen.find((s) => new RegExp("(?:[0-9]|" + HAN_ONE + ") ?" + SHOT).test(s));
      if (unit && !unitAll) unitAll = (tab || id) + ": " + unit.trim();
      // 값을 잇는 기호. 문장 안의 낱말이 아니라 값 사이에 선 자리만 결함이다.
      const dotted = seen.find((s) => BULLETS.some((d) => s.indexOf(d) >= 0));
      if (dotted && !dotAll) dotAll = (tab || id) + ": " + dotted.trim();
      const px = await p.evaluate((q) => {
        const es = [...document.querySelectorAll(q + " .px")].filter((e) => e.getClientRects().length);
        return { n: es.length, blind: es.filter((e) => !e.querySelector("svg")).length };
      }, "#" + id);
      total += px.n;
      blind += px.blind;
      if (px.n === 0) dark.push(tab || id);
    }
    check("price:" + id + "-says-no-currency-in-letters", seenAll === "", seenAll || "clean over " + tabs.length + " view(s)");
    check("unit:" + id + "-counts-rounds-in-the-new-word", unitAll === "", unitAll || "clean over " + tabs.length + " view(s)");
    check("prose:" + id + "-joins-values-with-words-not-a-bullet", dotAll === "", dotAll || "clean over " + tabs.length + " view(s)");
    check("price:" + id + "-every-price-carries-the-icon", total > 0 && blind === 0,
      total + " prices, " + blind + " without an icon");
    // 값을 하나도 안 그린 선반은 잰 것이 없다. 그 선반이 앞의 축을 초록으로 만들지 않도록 따로 적는다.
    check("instrument:" + id + "-every-view-had-a-price", dark.length === 0, dark.join(", ") || "all views priced");
    if (hook) await p.evaluate((h) => { window[h](false); }, hook);
    else await p.click("#gym .close", { force: true });
    await p.waitForTimeout(120);
  }

  // 값이 없는 창에도 글자는 있다. 불렛과 옛 단위와 재화 이름은 값과 무관하게 나오므로
  // 값을 재는 축과 글자를 재는 축은 순회 목록이 다르다. 여기는 글자만 본다.
  const PROSE = [["gram", "__gram"], ["me", "__me"], ["earn", "__earn"], ["top", null], ["caption", null]];
  let letters = "", oldUnit = "", dots = "", swept = 0;
  for (const [id, hook] of PROSE) {
    if (hook) { await p.evaluate((h) => { window[h](true); }, hook); await p.waitForTimeout(320); }
    const seen = await p.evaluate(shown, "#" + id);
    swept += seen.length;
    const hit = seen.find((s) => s.indexOf(WORD) >= 0 && /[0-9]/.test(s));
    if (hit && !letters) letters = id + ": " + hit.trim();
    const unit = seen.find((s) => new RegExp("(?:[0-9]|" + HAN_ONE + ") ?" + SHOT).test(s));
    if (unit && !oldUnit) oldUnit = id + ": " + unit.trim();
    const dotted = seen.find((s) => BULLETS.some((d) => s.indexOf(d) >= 0));
    if (dotted && !dots) dots = id + ": " + dotted.trim();
    if (hook) { await p.evaluate((h) => { window[h](false); }, hook); await p.waitForTimeout(120); }
  }
  check("instrument:the-wordless-surfaces-had-words", swept > 0, swept + " text nodes over " + PROSE.length + " surfaces");
  check("price:the-wordless-surfaces-say-no-currency-in-letters", letters === "", letters || "clean");
  check("unit:the-wordless-surfaces-count-rounds-in-the-new-word", oldUnit === "", oldUnit || "clean");
  check("prose:the-wordless-surfaces-join-values-with-words-not-a-bullet", dots === "", dots || "clean");

  // 대조군. 상점에 재화 이름을 글자로 심어 두면 이 자가 그것을 잡아야 한다.
  await p.evaluate((h) => { window.__shop(true); }, "__shop");
  await p.waitForTimeout(320);
  await p.evaluate((w) => {
    const q = document.createElement("span");
    q.id = "priceProbe";
    q.textContent = "999 " + w[0] + " 3" + w[1] + " " + w[2] + " 7";
    document.querySelector("#shop").appendChild(q);
  }, [WORD, SHOT, BULLETS[0]]);
  await p.waitForTimeout(120);
  const planted = await p.evaluate(shown, "#shop");
  // 축과 같은 규칙으로 잰다. 자가 심은 것을 못 잡으면 앞의 초록은 아무것도 안 잰 초록이다.
  const gotIt = planted.find((s) => s.indexOf(WORD) >= 0 && /[0-9]/.test(s));
  check("instrument:a-planted-currency-word-is-caught", Boolean(gotIt), gotIt ? gotIt.trim() : "missed");
  const gotUnit = planted.find((s) => new RegExp("(?:[0-9]|" + HAN_ONE + ") ?" + SHOT).test(s));
  check("instrument:a-planted-round-unit-is-caught", Boolean(gotUnit), gotUnit ? gotUnit.trim() : "missed");
  const gotDot = planted.find((s) => BULLETS.some((d) => s.indexOf(d) >= 0));
  check("instrument:a-planted-bullet-is-caught", Boolean(gotDot), gotDot ? gotDot.trim() : "missed");
  await p.evaluate(() => { const q = document.getElementById("priceProbe"); if (q) q.remove(); });

  // 상점 열한 선반과 시착실과 선수단과 프로필의 버튼과 배지를 잰다.
  // 표면 이름을 같이 들고 다니는 이유는, 아무것도 못 잰 표면 하나가 이 축을 조용히 초록으로
  // 만들기 때문이다. 앞의 자는 표면 수를 글자로 적어 두어 빈 판에서도 같은 초록을 냈다.
  const labelCfg = { nodes: LABEL_NODES, names: NAME_SLOTS, states: LONG_STATES,
    value: VALUE, sentence: SENTENCE, stop: STOP, max: NOUN_MAX };
  const board = { surfaces: [], empty: [], sentence: [], shape: [], runs: 0 };
  const sweepLabels = async (name, sel) => {
    const got = await p.evaluate(labelHits, Object.assign({ sel: sel }, labelCfg));
    board.surfaces.push(name);
    if (!got || got.seen === 0) { board.empty.push(name); return; }
    board.runs += got.runs;
    for (const h of got.sentence) board.sentence.push(name + ": " + h);
    for (const h of got.shape) board.shape.push(name + ": " + h);
  };
  // 상점은 한 번에 한 선반만 그린다. 시착실은 선반과 같이 다시 그려지지만 판이 달라 따로 센다.
  const sweepShop = async (mark) => {
    const list = await p.evaluate(() => [...document.querySelectorAll("#shop .tab")].map((e) => e.dataset.tab));
    for (const tab of list) {
      await p.click('#shop .tab[data-tab="' + tab + '"]', { force: true });
      await p.waitForTimeout(180);
      await sweepLabels(mark + tab, "#shop .goods");
    }
    await sweepLabels(mark + "fitting", "#shop .fitting");
    return list;
  };
  await p.evaluate((h) => { window[h](true); }, "__shop");
  await p.waitForTimeout(320);
  await sweepShop("rich:");
  await p.evaluate((h) => { window[h](false); }, "__shop");
  await p.waitForTimeout(120);
  for (const id of ["roster", "me"]) {
    await p.evaluate((h) => { window[h](true); }, "__" + id);
    await p.waitForTimeout(320);
    await sweepLabels(id, "#" + id);
    await p.evaluate((h) => { window[h](false); }, "__" + id);
    await p.waitForTimeout(120);
  }
  // 기간과 횟수는 가격 배지 밖의 카드 보조행에 있어야 한다. planted 문장은 반드시 같은 축에 걸린다.
  await p.evaluate((h) => { window[h](true); }, "__shop");
  await p.waitForTimeout(320);
  await p.click('#shop .tab[data-tab="bot"]', { force: true });
  await p.waitForTimeout(180);
  const botDuration = await p.evaluate(() => [...document.querySelectorAll("#shop .card[data-spec=bot]")].every((card) => {
    const badge = card.querySelector(".buy");
    const body = card.querySelector(".duration");
    return Boolean(badge && body && !/[분슛]/.test(badge.textContent) && /분/.test(body.textContent));
  }));
  await p.click('#shop .tab[data-tab="buff"]', { force: true });
  await p.waitForTimeout(180);
  const buffDuration = await p.evaluate(() => [...document.querySelectorAll("#shop .card[data-spec=buff]")].every((card) => {
    const badge = card.querySelector(".buy");
    const body = card.querySelector(".duration");
    return Boolean(badge && body && !/[분슛]/.test(badge.textContent) && /슛/.test(body.textContent));
  }));
  check("price:duration-sits-outside-the-badge", botDuration && buffDuration,
    botDuration && buffDuration ? "bot and buff cards" : "bot=" + botDuration + ", buff=" + buffDuration);
  await p.evaluate((h) => { window[h](false); }, "__shop");
  await p.waitForTimeout(120);

  await p.evaluate((h) => { window[h](true); }, "__shop");
  await p.waitForTimeout(320);
  // 대조군. 지운 라벨 열둘을 그대로 심어 이 자가 전부 잡는지 본다. 일곱만 잡던 자가 초록이던
  // 적이 있고, 그 초록은 다섯 자리가 비어 있다는 뜻이었다. 심는 곳은 이 자의 판이라 화면은 안 건드린다.
  const OLD_LABELS = ["눌러서 걸쳐 본다", "카드에 손을 올리면 무엇을 사는지가 여기 뜬다",
    "고른 것이 없다", "전부 사기 300", "300 모자라다", "더 좋은 클론이 남아 있다",
    "더 못 담는다", "지난 장갑", "끼는 중", "150 내고 20분", "잔고 부족", "남은 카드 3"];
  await p.evaluate((list) => {
    const box = document.createElement("div");
    box.id = "labelProbe";
    for (const s of list) {
      const b = document.createElement("button");
      b.textContent = s;
      box.appendChild(b);
    }
    document.querySelector("#shop .goods").appendChild(box);
  }, OLD_LABELS);
  await p.waitForTimeout(120);
  const plantedOld = await p.evaluate(labelHits, Object.assign({ sel: "#labelProbe" }, labelCfg));
  const caughtOld = plantedOld ? plantedOld.sentence.concat(plantedOld.shape) : [];
  const missedOld = OLD_LABELS.filter((s) => caughtOld.indexOf(s) < 0);
  check("instrument:the-twelve-retired-labels-are-caught", missedOld.length === 0,
    (OLD_LABELS.length - missedOld.length) + "/" + OLD_LABELS.length
    + (missedOld.length ? " missed " + missedOld.join(" | ") : " planted and caught"));
  await p.evaluate(() => { const q = document.getElementById("labelProbe"); if (q) q.remove(); });
  // 부족 분기는 rich 프리셋에서 한 번도 안 그려진다. 지갑을 비워야 서는 자리라
  // 라벨 계약도 색도 이 판에서만 잴 것이 있다. 잰 뒤에는 값을 되돌린다.
  const coinFull = await p.evaluate(() => window.__wallet().coin);
  const badRGB = await p.evaluate(() => {
    const v = getComputedStyle(document.documentElement).getPropertyValue("--bad").trim();
    const n = parseInt(v.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  });
  // 살 수 있는 값의 색이 대조군이고, 그 색은 선반마다 따로 꺼낸다. 뽑기 버튼의 값은
  // 버튼 색을 물려받아 흰색이고 나머지 열 선반은 노랑이라, 하나로 묶으면 열 선반이 색 없이 읽힌다.
  const warmOf = {};
  // 채널당 24. 글자 가장자리는 배경과 섞여 채널이 크게 흔들리므로 심 화소만 센다.
  const TONE_TOL = 24;
  // 숫자 한 칸이 그 색으로 찍혔다고 부를 최소 화소.
  // 측정: 부족 숫자 43칸의 최저가 67, 살 수 있는 값 11칸의 최저가 106이라 둘 다 여유가 크다.
  const TONE_FLOOR = 20;
  // 창은 .px 안의 <b>다. 아이콘은 부족해도 노랑이므로, 표기 전체를 창으로 쓰면
  // 아이콘의 노랑이 숫자 색을 덮어 읽힌다.
  // 창은 요소 자체를 찍는다. 화면을 통째로 찍고 좌표로 잘라 내면 창이 한 칸이라도 어긋난 순간
  // 자가 버튼 바탕만 세면서 숫자가 안 칠해졌다고 말한다(측정: 노란 숫자에서 노란 화소 0).
  const paintAt = async (loc, at, warm) => {
    const png = (await loc.screenshot()).toString("base64");
    return p.evaluate(([s, bad, tone, tol, mark]) => new Promise((res) => {
      const im = new Image();
      im.onload = () => {
        const cv = document.createElement("canvas");
        cv.width = im.width; cv.height = im.height;
        const g = cv.getContext("2d");
        g.drawImage(im, 0, 0);
        const d = g.getImageData(0, 0, im.width, im.height).data;
        const near = (i, c) => Math.abs(d[i] - c[0]) <= tol && Math.abs(d[i + 1] - c[1]) <= tol
          && Math.abs(d[i + 2] - c[2]) <= tol;
        let hot = 0, mild = 0;
        // 창 안에서 가장 많이 나온 색. 축이 빨갛게 죽을 때 무엇을 재고 있었는지가 같이 적힌다.
        const tally = new Map();
        for (let i = 0; i < d.length; i += 4) {
          if (near(i, bad)) hot += 1;
          if (tone && near(i, tone)) mild += 1;
          const key = d[i] + "," + d[i + 1] + "," + d[i + 2];
          tally.set(key, (tally.get(key) || 0) + 1);
        }
        let top = "", most = -1;
        for (const [key, count] of tally) if (count > most) { most = count; top = key; }
        res({ at: mark, bad: hot, warm: mild, n: d.length / 4, top: top });
      };
      im.src = "data:image/png;base64," + s;
    }), [png, badRGB, warm, TONE_TOL, at]);
  };
  // 살 수 있는 버튼의 숫자는 같은 선반에서 제 색으로 남아야 한다. 이 대조군이 없으면
  // 모든 숫자를 붉다고 읽는 자도 초록을 낸다.
  const warmSeen = [];
  const shopTabs = await p.evaluate(() => [...document.querySelectorAll("#shop .tab")].map((e) => e.dataset.tab));
  for (const tab of shopTabs) {
    await p.click('#shop .tab[data-tab="' + tab + '"]', { force: true });
    await p.waitForTimeout(180);
    const one = p.locator("#shop .goods .buy:not(.bad-price) .px b").first();
    if (!(await one.count())) continue;
    warmOf[tab] = await one.evaluate((e) => {
      const c = getComputedStyle(e).color.match(/[0-9]+/g).map(Number);
      return [c[0], c[1], c[2]];
    });
    warmSeen.push(await paintAt(one, tab, warmOf[tab]));
  }
  // 시착실의 부족은 청구서가 있어야 선다. 장갑 선반에서 살 수 있는 카드 하나를 걸쳐 본다.
  await p.click('#shop .tab[data-tab="glove"]', { force: true });
  await p.waitForTimeout(180);
  await p.click("#shop .card.gear:last-child .shot", { force: true });
  await p.waitForTimeout(180);
  await p.evaluate(() => { window.__wallet().coin = 0; });
  let shortSeen = 0, shortLow = -1, shortWarm = 0, shortFirst = "";
  for (const tab of shopTabs) {
    await p.click('#shop .tab[data-tab="' + tab + '"]', { force: true });
    await p.waitForTimeout(180);
    await sweepLabels("poor:" + tab, "#shop .goods");
    const list = p.locator("#shop .bad-price .px b");
    const many = await list.count();
    for (let i = 0; i < many; i += 1) {
      const g = await paintAt(list.nth(i), tab + "#" + i, warmOf[tab] || null);
      shortSeen += 1;
      if (shortLow < 0 || g.bad < shortLow) shortLow = g.bad;
      shortWarm += g.warm;
      if (g.bad < TONE_FLOOR && !shortFirst) shortFirst = tab + " " + g.at + " bad=" + g.bad + " warm=" + g.warm + " top " + g.top;
    }
  }
  await sweepLabels("poor:fitting", "#shop .fitting");
  const shortNodes = await p.evaluate(() => document.querySelectorAll("#shop .bad-price").length);
  await p.evaluate((c) => { window.__wallet().coin = c; }, coinFull);
  check("instrument:the-drained-wallet-drew-the-shortfall-branch", shortSeen >= 11 && shortNodes > 0,
    shortSeen + " shortfall digits over " + shopTabs.length + " shelves, " + shortNodes + " nodes on the last one");
  check("instrument:an-affordable-digit-on-the-same-shelf-stays-warm",
    warmSeen.length >= 10 && warmSeen.every((w) => w.bad === 0 && w.warm > 0),
    warmSeen.length + " controls, lowest warm " + (warmSeen.length ? Math.min.apply(null, warmSeen.map((w) => w.warm)) : -1)
    + ", highest bad " + (warmSeen.length ? Math.max.apply(null, warmSeen.map((w) => w.bad)) : -1)
    + (warmSeen.length ? ", first box " + warmSeen[0].at + " top " + warmSeen[0].top : ""));
  check("price:the-shortfall-digit-is-painted-bad", shortSeen > 0 && shortLow >= TONE_FLOOR && shortWarm === 0,
    shortFirst || (shortSeen + " digits, lowest bad " + shortLow + ", warm " + shortWarm));
  check("label:no-sentence-in-buttons-or-badges", board.sentence.length === 0,
    board.sentence.length ? board.sentence.length + " hits; first " + board.sentence[0]
      : "clean over " + board.surfaces.length + " surfaces, " + board.runs + " labels");
  check("label:every-button-and-badge-is-a-value-or-a-short-noun", board.shape.length === 0,
    board.shape.length ? board.shape.length + " hits; first " + board.shape[0]
      : "clean over " + board.surfaces.length + " surfaces, " + board.runs + " labels");
  check("instrument:every-label-surface-yielded-labels", board.surfaces.length >= 15 && board.empty.length === 0,
    board.empty.length ? "empty " + board.empty.join(", ")
      : board.surfaces.length + " surfaces, " + board.runs + " labels");
  await p.evaluate((h) => { window[h](true); }, "__shop");
  await p.waitForTimeout(320);
  // 아이콘이 화소로 찍혔는가. DOM에 있는 것으로는 부족하다. 첫 값 표기 하나를 켜고 끄고 잰다.
  // 세는 창은 아이콘 자기 상자다. 표기 전체를 창으로 쓰면 옆의 숫자가 분모를 키워
  // 같은 아이콘이 6%대로 읽힌다. ui-gate의 8%는 아이콘 상자를 재던 수이므로 창을 맞춰야 같은 뜻이 된다.
  const win = await p.evaluate(() => {
    const s = document.querySelector("#shop .px");
    const g = s.querySelector("svg");
    const a = s.getBoundingClientRect(), c = g.getBoundingClientRect();
    return { x: (c.left - a.left) / a.width, y: (c.top - a.top) / a.height, w: c.width / a.width, h: c.height / a.height };
  });
  const one = p.locator("#shop .px").first();
  const on = (await one.screenshot()).toString("base64");
  await p.evaluate(() => { document.querySelector("#shop .px svg").style.visibility = "hidden"; });
  const off = (await one.screenshot()).toString("base64");
  await p.evaluate(() => { document.querySelector("#shop .px svg").style.visibility = ""; });
  const cover = await p.evaluate(([a, c, box]) => {
    const load = (s) => new Promise((res) => {
      const im = new Image();
      im.onload = () => {
        const cv = document.createElement("canvas");
        cv.width = im.width; cv.height = im.height;
        const g = cv.getContext("2d");
        g.drawImage(im, 0, 0);
        res(g.getImageData(0, 0, im.width, im.height));
      };
      im.src = "data:image/png;base64," + s;
    });
    return Promise.all([load(a), load(c)]).then(([A, B]) => {
      const L = (d, i) => 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
      const x0 = Math.floor(box.x * A.width), y0 = Math.floor(box.y * A.height);
      const x1 = Math.ceil((box.x + box.w) * A.width), y1 = Math.ceil((box.y + box.h) * A.height);
      let hit = 0, n = 0;
      // 화소차 6 미만은 안티에일리어싱 잔파동과 구분되지 않으므로 세지 않는다.
      for (let y = y0; y < y1 && y < A.height; y += 1) {
        for (let x = x0; x < x1 && x < A.width; x += 1) {
          const i = (y * A.width + x) * 4;
          n += 1;
          if (Math.abs(L(A.data, i) - L(B.data, i)) >= 6) hit += 1;
        }
      }
      return hit / n;
    });
  }, [on, off, win]);
  check("price:the-icon-is-drawn-over-8pct", cover >= 0.08, (cover * 100).toFixed(1) + "%");

  check("console:no-errors", errs.length === 0, errs.slice(0, 2).join(" | ") || "clean");
  await ctx.close();

  if (notes.length) console.log(notes.map((x) => "  ok   " + x).join(LINE));
  if (fails.length) console.log(fails.map((x) => "  FAIL " + x).join(LINE));
  console.log(fails.length ? "price FAIL " + fails.length : "price PASS " + notes.length);
  if (fails.length) process.exitCode = 1;
} finally {
  clearTimeout(t);
  if (b) await b.close();
}
