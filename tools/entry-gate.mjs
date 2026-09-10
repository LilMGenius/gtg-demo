import { chromium } from "playwright";

// 진입점이 장르 표준을 따르는지 재는 자.
// 자기 정보는 초상화로 열고, 재화를 누르면 버는 법이 열리고, 상점은 제 버튼을 갖는다.
// 지금은 레벨 글자가 내 정보를 열고 재화 칩이 상점을 연다. 둘 다 button 요소가 아니라
// 글자라서 누를 수 있다는 신호가 화면에 없다. 열린다는 것과 누를 생각이 든다는 것은 다른 주장이다.
//
// 문턱을 지어내지 않는다. 축은 전부 참거짓이다. 무엇이 무엇을 여는가와,
// 누름을 받는 것이 button 요소인가만 묻는다.
const EXE = process.env.LOCALAPPDATA + "/ms-playwright/chromium-1228/chrome-win64/chrome.exe";
const BASE = "http://127.0.0.1:10310/web/index.html?seed=20&preset=veteran";
const LINE = String.fromCharCode(10);
/* 켜진 프레임과 그림을 끈 프레임의 휘도차를 센다. ui-gate가 아이콘 축에 쓰는 것과 같은 자다.
   화소차 6 미만은 안티에일리어싱 잔파동과 구분되지 않으므로 안 센다. */
function inkDiff([a, b]) {
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
  return Promise.all([load(a), load(b)]).then(([A, Bb]) => {
    const n = Math.min(A.data.length, Bb.data.length) >> 2;
    const L = (d, i) => 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
    let hit = 0;
    for (let i = 0; i < n; i += 1) {
      if (Math.abs(L(A.data, i * 4) - L(Bb.data, i * 4)) >= 6) hit += 1;
    }
    return hit / n;
  });
}
const t = setTimeout(() => { console.log("WATCHDOG"); process.exit(1); }, 120000);
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
  await p.goto(BASE, { waitUntil: "load" });
  await p.waitForSelector("#go", { timeout: 15000 });
  await p.click("#go", { force: true });
  await p.waitForTimeout(1200);

  const shown = (id) => p.evaluate((i) => { const e = document.getElementById(i); return Boolean(e) && !e.hidden; }, id);
  const shut = async () => { await p.evaluate(() => { for (const i of ["me", "shop", "gym", "roster", "gram", "wiki"]) { const e = document.getElementById(i); if (e) e.hidden = true; } document.body.classList.remove("panelOpen"); }); await p.waitForTimeout(120); };
  const tap = async (sel) => { await shut(); const e = await p.$(sel); if (!e) return false; await e.click({ force: true }); await p.waitForTimeout(260); return true; };

  // 대조군. 이미 button인 훈련장이 훈련장을 연다. 여기가 거짓이면 이 자의 클릭이 안 닿는 것이다.
  const ctlHit = await tap("#gymBtn");
  check("control:a-known-button-opens-its-panel", ctlHit && (await shown("gym")), String(ctlHit));
  // 대조군. 빈 자리를 눌러도 아무 창이 안 열려야 한다. 열리면 이 자가 클릭이 아니라 시간을 재고 있는 것이다.
  await shut();
  await p.mouse.click(640, 400);
  await p.waitForTimeout(200);
  const stray = [];
  for (const id of ["me", "shop", "gym", "roster", "gram", "wiki"]) if (await shown(id)) stray.push(id);
  check("control:an-empty-spot-opens-nothing", stray.length === 0, stray.join(",") || "none");

  const hitMe = await tap("#meBtn");
  check("entry:a-portrait-button-opens-my-page", hitMe && (await shown("me")), hitMe ? "opened " + (await shown("me")) : "#meBtn missing");
  const hitShop = await tap("#shopBtn");
  check("entry:the-shop-has-its-own-button", hitShop && (await shown("shop")), hitShop ? "opened " + (await shown("shop")) : "#shopBtn missing");
  const hitPurse = await tap("#purse");
  check("entry:currency-does-not-open-the-shop", hitPurse && !(await shown("shop")), hitPurse ? "shop " + (await shown("shop")) : "#purse missing");
  check("entry:currency-opens-how-to-earn", hitPurse && (await shown("wiki")), hitPurse ? "wiki " + (await shown("wiki")) : "#purse missing");

  // 재화 띠는 칩 셋이 한 손잡이 안에 선다. 하나만 눌러 나온 초록은 나머지 둘을 아무도 안 잰 초록이다.
  const chips = await p.evaluate(() => document.querySelectorAll("#purse .cur").length);
  const deaf = [];
  for (let i = 0; i < chips; i += 1) {
    await shut();
    const c = (await p.$$("#purse .cur"))[i];
    if (!c) { deaf.push("chip" + i); continue; }
    await c.click({ force: true });
    await p.waitForTimeout(240);
    if (!(await shown("wiki"))) deaf.push("chip" + i);
  }
  check("entry:every-currency-chip-opens-how-to-earn", chips >= 3 && deaf.length === 0,
    chips + " chips, " + (deaf.join(",") || "all opened"));

  // 버는 법은 문장이 아니라 표다. 항목 한 칸과 값 한 칸이고, 값 칸은 숫자거나 두 글자 명사다.
  // 라벨 문법 계약이 값 자리에 허락하는 모양은 그 둘뿐이다.
  await tap("#purse");
  const sheet = await p.evaluate(() => [...document.querySelectorAll("#wiki .body tbody tr")]
    .map((row) => [...row.querySelectorAll("th,td")].map((cell) => cell.textContent.trim())));
  const prose = sheet.filter((c) => c.length !== 2 || !(/^[0-9,]+$/.test(c[1]) || [...c[1]].length <= 2))
    .map((c) => c.join(" | "));
  check("entry:how-to-earn-answers-in-two-columns", sheet.length >= 4 && prose.length === 0,
    prose.slice(0, 3).join(" / ") || sheet.length + " rows");
  await shut();

  /* 컨디션 칸. 세 밴드 전부에서 이름이 서고 그림이 그려져 있어야 한다.
     이름만 물으면 빈 칸도 초록이 되고, 그림만 물으면 읽는 자에게 아무것도 안 간다.
     묻는 것은 attribute가 아니라 브라우저가 계산한 이름이다. role 없는 div에 붙은 aria-label은
     generic을 이름 짓는 것이라 ARIA가 금지하고, 크롬은 계산은 해도 보조기술까지 간다는 보장이 없다.
     그래서 role도 같이 받아 적고 generic이면 이름이 있어도 못 세운 것으로 친다.
     판이 돌면 매 구 state.form이 다시 굴러 심은 밴드가 지워지므로 판을 먼저 세운다. */
  const ink = async (sel) => {
    const size = await p.evaluate((s) => {
      const e = document.querySelector(s);
      if (!e) return null;
      const r = e.getBoundingClientRect();
      return { w: r.width, h: r.height };
    }, sel);
    if (!size || size.w < 1 || size.h < 1) return 0;
    const node = p.locator(sel);
    const on = (await node.screenshot()).toString("base64");
    const had = await p.evaluate((s) => {
      const q = document.querySelector(s + " svg");
      if (!q) return false;
      q.style.visibility = "hidden";
      return true;
    }, sel);
    if (!had) return 0;
    const off = (await node.screenshot()).toString("base64");
    await p.evaluate((s) => { const q = document.querySelector(s + " svg"); if (q) q.style.visibility = ""; }, sel);
    return p.evaluate(inkDiff, [on, off]);
  };
  /* 계산된 이름은 크롬에게 묻는다. playwright의 accessibility 스냅샷은 1.61에서 사라졌고,
     남은 ariaSnapshot은 playwright가 제 규칙으로 다시 계산한 값이라 이 축이 묻는 것과 다르다.
     묻는 것은 이 브라우저가 보조기술에 무엇을 넘기는가다. */
  const cdp = await ctx.newCDPSession(p);
  await cdp.send("Accessibility.enable");
  const axOf = async (sel) => {
    const ev = await cdp.send("Runtime.evaluate", { expression: "document.querySelector(" + JSON.stringify(sel) + ")" });
    const objectId = ev.result && ev.result.objectId;
    if (!objectId) return { role: "none", name: "" };
    const tree = await cdp.send("Accessibility.getPartialAXTree", { objectId, fetchRelatives: false });
    await cdp.send("Runtime.releaseObject", { objectId });
    const node = (tree.nodes || [])[0];
    if (!node) return { role: "none", name: "" };
    return { role: node.role ? String(node.role.value) : "none", name: node.name ? String(node.name.value) : "" };
  };
  await p.evaluate(() => window.__lockRound());
  const bands = [["good", 0.9], ["mid", 0], ["bad", -0.9]];
  const nameless = [], blank = [], said = [];
  for (const [tag, v] of bands) {
    await p.evaluate((x) => window.__form(x), v);
    await p.waitForTimeout(160);
    const ax = await axOf("#form");
    const name = ax.name;
    const role = ax.role;
    const cover = await ink("#form");
    said.push(tag + " " + role + "/" + JSON.stringify(name) + " ink " + (cover * 100).toFixed(1) + "%");
    if (name === "" || role === "generic" || role === "GenericContainer") nameless.push(tag + " " + role);
    if (!(cover > 0)) blank.push(tag);
  }
  await p.evaluate(() => window.__form(0));
  check("entry:the-condition-slot-carries-a-name-in-every-band", nameless.length === 0,
    nameless.join(", ") || said.join(" | "));
  check("entry:the-condition-slot-paints-an-icon-in-every-band", blank.length === 0,
    blank.length ? "no ink in " + blank.join(",") + " | " + said.join(" | ") : said.join(" | "));

  /* 재화 띠의 일반 앱 UX 문법 둘. 도메인 축과 달리 게임을 몰라도 잡히는 자리다.
     하나. 한 표기가 한 자리에서만 선다. 칩 셋은 같은 종류의 칸이므로 같은 글꼴 토큰과 같은 자릿점과
     같은 아이콘-숫자 차례로 서야 한다. 팬 5,000과 땀 8,000과 스폰 1,000이 한 줄에 붙어 서는 띠라,
     한 칩만 자릿점이 다르면 읽는 눈이 그 수를 다른 단위로 받는다.
     둘. 옮기거나 지운 칩이 자리를 남기지 않는다. 자리는 offsetLeft로 잰다. 띠가 -1.1도 기울어
     getBoundingClientRect는 회전된 상자를 돌려주고, 실측으로 같은 12px 간격이 11.55px로 읽힌다.
     여유 2px과 대역을 그 판에서 다시 내는 방식은 chrome-gate의 리듬 축과 같은 식이다. 그 자는
     기둥의 세로 리듬을 갖고 이 자는 띠 안의 가로 리듬을 가지므로, 같은 자리를 두 번 재지 않는다. */
  const TOL = 2;
  const CHIP = () => {
    const font = (e) => { const s = getComputedStyle(e); return [s.fontFamily.split(",")[0], s.fontSize, s.fontWeight, s.fontStyle, s.letterSpacing].join("|"); };
    return [...document.querySelectorAll("#purse .cur")].map((c, i) => {
      const val = c.querySelector("b,i,u,em");
      const icon = c.querySelector("svg");
      const kids = [...c.children];
      return { id: c.id || ("chip" + i), tag: val ? val.tagName : "none",
        text: val ? val.textContent.trim() : "", font: val ? font(val) : "none",
        iconFirst: Boolean(icon) && Boolean(val) && kids.indexOf(icon) === 0 && kids.indexOf(icon) < kids.indexOf(val),
        left: c.offsetLeft, width: c.offsetWidth, ink: val ? Math.round(val.getBoundingClientRect().width) : 0 };
    });
  };
  // 자릿점은 세 자리마다 쉼표다. state가 toLocaleString으로 굽는 모양이고, 칩 셋이 그것을 같이 쓴다.
  const NUM = /^[0-9]{1,3}(,[0-9]{3})*$/;
  const oneFormat = (cs) => {
    const fonts = [...new Set(cs.map((c) => c.font))];
    const off = cs.filter((c) => !NUM.test(c.text) || !c.iconFirst);
    return { fonts: fonts, off: off, ok: cs.length >= 3 && fonts.length === 1 && off.length === 0 };
  };
  const rhythm = (cs) => {
    const gaps = cs.slice(1).map((c, i) => ({ pair: cs[i].id + " to " + c.id, gap: c.left - (cs[i].left + cs[i].width) }));
    const lo = gaps.length ? Math.min.apply(null, gaps.map((g) => g.gap)) : 0;
    const hi = gaps.length ? Math.max.apply(null, gaps.map((g) => g.gap)) : 0;
    return { gaps: gaps, lo: lo, hi: hi, holes: gaps.filter((g) => g.gap > lo + TOL),
      blank: cs.filter((c) => c.ink <= 0 || c.text.length === 0),
      ok: gaps.length >= 2 && hi - lo <= TOL && cs.every((c) => c.ink > 0 && c.text.length > 0) };
  };
  const chips3 = await p.evaluate(CHIP);
  const fmt = oneFormat(chips3);
  const beat = rhythm(chips3);
  const sayChips = (cs) => cs.map((c) => c.id + " " + JSON.stringify(c.text) + " " + c.tag).join(", ");
  check("ux:the-currency-chips-read-one-number-format", fmt.ok,
    fmt.off.length ? fmt.off.map((c) => c.id + " draws " + JSON.stringify(c.text) + " icon-first " + c.iconFirst).join(", ")
      : fmt.fonts.length > 1 ? chips3.length + " chips carry " + fmt.fonts.length + " fonts: " + fmt.fonts.join(" vs ")
        : chips3.length + " chips, one font " + fmt.fonts[0] + ", " + sayChips(chips3));
  check("ux:the-resource-strip-leaves-no-vacated-slot", beat.ok,
    beat.blank.length ? beat.blank.map((c) => c.id + " stands empty at " + c.left + " wide " + c.width).join(", ")
      : beat.holes.length ? beat.holes.map((g) => g.pair + " " + g.gap + "px against a " + beat.lo + "px band").join(", ")
        : beat.gaps.map((g) => g.pair + " " + g.gap).join(", ") + "px, band " + beat.lo + " to " + beat.hi + ", every chip inked");
  /* 대조군 둘을 한 축에 둔다. 자릿점을 빈칸으로 바꾼 칩과 글꼴을 줄인 칩이 각각 위의 표기 축을
     빨갛게 만들어야 하고, 46px을 밀어 넣은 칩이 리듬 축을 빨갛게 만들어야 한다. 심은 뒤에 도로 뺀다. */
  const plantText = await p.evaluate(() => {
    const val = document.querySelectorAll("#purse .cur")[1].querySelector("b,i,u,em");
    val.dataset.was = val.textContent;
    // 자릿점을 빈칸으로 쓰는 칩 하나. 이 판의 수가 세 자리 아래라 원문을 고쳐 쓰면 아무것도 안 심는다.
    val.textContent = "12 345";
    return val.textContent;
  });
  const afterText = oneFormat(await p.evaluate(CHIP));
  await p.evaluate(() => { const v = document.querySelectorAll("#purse .cur")[1].querySelector("b,i,u,em"); v.textContent = v.dataset.was; delete v.dataset.was; });
  await p.evaluate(() => { const v = document.querySelectorAll("#purse .cur")[1].querySelector("b,i,u,em"); v.style.fontSize = "13px"; });
  const afterFont = oneFormat(await p.evaluate(CHIP));
  await p.evaluate(() => { document.querySelectorAll("#purse .cur")[1].querySelector("b,i,u,em").style.fontSize = ""; });
  const back = oneFormat(await p.evaluate(CHIP));
  check("control:an-odd-chip-format-reddens-the-format-axis",
    afterText.ok === false && afterFont.ok === false && back.ok === fmt.ok,
    "separator " + JSON.stringify(plantText) + " caught " + (afterText.ok === false)
    + ", 13px font caught " + (afterFont.ok === false) + ", restored to " + back.ok);
  await p.evaluate(() => { document.querySelectorAll("#purse .cur")[1].style.marginLeft = "46px"; });
  const afterGap = rhythm(await p.evaluate(CHIP));
  await p.evaluate(() => { document.querySelectorAll("#purse .cur")[1].style.marginLeft = ""; });
  const backGap = rhythm(await p.evaluate(CHIP));
  check("control:a-planted-46px-hole-reddens-the-rhythm-axis",
    afterGap.ok === false && backGap.ok === beat.ok,
    "planted band " + afterGap.lo + " to " + afterGap.hi + ", holes " + afterGap.holes.length + ", restored to " + backGap.ok);

  // 누름을 받는 것은 button이어야 한다. 글자 조각에 붙은 핸들러는 누를 수 있다는 신호를 화면에 안 낸다.
  const handlers = await p.evaluate(() => { const bad = []; for (const el of document.querySelectorAll("#hud *")) { if (!el.onclick && !el.onpointerdown) continue; if (el.tagName !== "BUTTON") bad.push((el.id || el.className || el.tagName) + ":" + el.tagName.toLowerCase()); } return bad; });
  check("affordance:every-hud-click-target-is-a-button", handlers.length === 0, handlers.join(", ") || "all buttons");
  check("console:no-errors", errs.length === 0, errs.slice(0, 2).join(" | ") || "clean");
  await ctx.close();

  if (notes.length) console.log(notes.map((x) => "  ok   " + x).join(LINE));
  if (fails.length) console.log(fails.map((x) => "  FAIL " + x).join(LINE));
  console.log(fails.length ? "entry FAIL " + fails.length : "entry PASS " + notes.length);
  if (fails.length) process.exitCode = 1;
} finally {
  clearTimeout(t);
  if (b) await b.close();
}
