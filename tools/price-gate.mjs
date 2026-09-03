import { chromium } from "playwright";

// 값 표기의 자. 상단 잔고는 아이콘인데 상점 버튼은 '140 땀'처럼 글자였다.
// 같은 재화가 두 표기로 갈리면 어느 재화로 사는지가 글자를 읽어야 아는 정보가 된다.
//
// 재는 것은 셋이다. 값을 말하는 판에 재화 이름이 글자로 남지 않는가, 값마다 아이콘이 하나씩
// 붙어 있는가, 그 아이콘이 DOM에만 있는 게 아니라 화소로 찍혔는가.
// 앞의 둘은 대조군을 달고 온다. 판에 '땀' 글자를 심어서 자가 그것을 잡는지 먼저 본다.
const EXE = process.env.LOCALAPPDATA + "/ms-playwright/chromium-1228/chrome-win64/chrome.exe";
// maxed는 훈련장의 잉여 훈련 환전 줄을 열고, rich는 상점 값이 전부 모자람 문구로 덮이는 것을 막는다.
const BASE = "http://127.0.0.1:10310/web/index.html?seed=20&preset=maxed,rich";
const LINE = String.fromCharCode(10);
// U+B540. 재화 이름을 소스에 글자로 두면 이 파일 자신이 잔여 검색에 걸린다.
// 값은 아래 대조군이 검증한다. 코드포인트를 잘못 적으면 이 자는 엉뚱한 글자를 재고 조용히 초록을 낸다.
const WORD = String.fromCharCode(0xB540);
// U+AD6C. 판을 세던 옛 단위이고 U+D55C은 그 앞에 붙던 관형사다.
// 소스에 글자로 두는 것을 피하는 이유는 위와 같다.
const SHOT = String.fromCharCode(0xAD6C);
const HAN_ONE = String.fromCharCode(0xD55C);
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
    let seenAll = "", unitAll = "", total = 0, blind = 0, dark = [];
    for (const tab of tabs) {
      if (tab) {
        await p.click('#shop .tab[data-tab="' + tab + '"]', { force: true });
        await p.waitForTimeout(180);
      }
      const seen = await p.evaluate(shown, "#" + id);
      // 값으로 쓰인 자리만 잔여다. 선반 문구의 그 낱말은 재화가 아니라 몸에서 나는 것을 말한다.
      // 가르는 것은 한 글자 덩어리 안에 숫자가 같이 있는가다. 이웃한 값까지 이어 붙여 재면
      // 옆 카드의 가격이 문구를 값으로 만들어 버린다.
      const hit = seen.find((s) => s.indexOf(WORD) >= 0 && /[0-9]/.test(s));
      if (hit) {
        seenAll = (tab || id) + ": " + hit.trim();
        break;
      }
      // 판을 세는 단위. 파운더가 두 번 짚은 표현이라 화면에서 사라진 것을 계기가 지킨다.
      // 숫자나 관형사가 앞에 붙은 자리만 단위다. 낱말 자체는 다른 뜻으로도 쓰인다.
      const unit = seen.find((s) => new RegExp("(?:[0-9]|" + HAN_ONE + ") ?" + SHOT).test(s));
      if (unit) {
        unitAll = (tab || id) + ": " + unit.trim();
        break;
      }
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
    check("price:" + id + "-every-price-carries-the-icon", total > 0 && blind === 0,
      total + " prices, " + blind + " without an icon");
    // 값을 하나도 안 그린 선반은 잰 것이 없다. 그 선반이 앞의 축을 초록으로 만들지 않도록 따로 적는다.
    check("instrument:" + id + "-every-view-had-a-price", dark.length === 0, dark.join(", ") || "all views priced");
    if (hook) await p.evaluate((h) => { window[h](false); }, hook);
    else await p.click("#gym .close", { force: true });
    await p.waitForTimeout(120);
  }

  // 대조군. 상점에 재화 이름을 글자로 심어 두면 이 자가 그것을 잡아야 한다.
  await p.evaluate((h) => { window.__shop(true); }, "__shop");
  await p.waitForTimeout(320);
  await p.evaluate((w) => {
    const q = document.createElement("span");
    q.id = "priceProbe";
    q.textContent = "999 " + w[0] + " 3" + w[1];
    document.querySelector("#shop").appendChild(q);
  }, [WORD, SHOT]);
  await p.waitForTimeout(120);
  const planted = await p.evaluate(shown, "#shop");
  // 축과 같은 규칙으로 잰다. 자가 심은 것을 못 잡으면 앞의 초록은 아무것도 안 잰 초록이다.
  const gotIt = planted.find((s) => s.indexOf(WORD) >= 0 && /[0-9]/.test(s));
  check("instrument:a-planted-currency-word-is-caught", Boolean(gotIt), gotIt ? gotIt.trim() : "missed");
  const gotUnit = planted.find((s) => new RegExp("(?:[0-9]|" + HAN_ONE + ") ?" + SHOT).test(s));
  check("instrument:a-planted-round-unit-is-caught", Boolean(gotUnit), gotUnit ? gotUnit.trim() : "missed");
  await p.evaluate(() => { const q = document.getElementById("priceProbe"); if (q) q.remove(); });

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
