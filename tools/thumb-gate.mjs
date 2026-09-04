import { chromium } from "playwright";

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
const BASE = "http://127.0.0.1:10310/web/index.html?seed=20&preset=rich";
// 몸에 걸치는 여섯 선반만 굽는다. 골대와 동네와 봇과 버프는 몸이 아니라 다른 주어라 아직 안 굽는다.
const WORN = ["glove", "boot", "kit", "sock", "hair", "ink"];
const LINE = String.fromCharCode(10);
const t = setTimeout(() => { console.log("WATCHDOG"); process.exit(1); }, 180000);
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
  await p.waitForTimeout(1300);
  await p.evaluate(() => window.__shop(true));
  await p.waitForTimeout(400);

  const grab = async (tab) => p.evaluate((t) => { for (const x of document.querySelectorAll("#shop .tab")) if (x.dataset.tab === t) x.click(); return new Promise((res) => setTimeout(() => { const cards = [...document.querySelectorAll("#shop .rack .card")]; res(cards.map((c) => { const i = c.querySelector(".shot img"); return i ? i.getAttribute("src") : ""; })); }, 260)); }, tab);

  let drawn = 0;
  for (const tab of WORN) {
    const urls = await grab(tab);
    const painted = urls.filter((u) => u && u.indexOf("data:image") === 0);
    drawn += painted.length;
    check("thumb:" + tab + ":every-card-carries-a-picture", urls.length > 0 && painted.length === urls.length, painted.length + " of " + urls.length);
    const uniq = new Set(painted);
    check("thumb:" + tab + ":ranks-do-not-share-one-picture", painted.length > 1 && uniq.size === painted.length, uniq.size + " distinct of " + painted.length);
  }
  check("instrument:some-card-was-painted", drawn > 0, drawn + " pictures");

  // 머리 선반은 네 이름이 전부 형태를 말한다. 깎아준 머리, 투블럭, 기른 머리, 모히칸이다.
  // 위의 축은 그림 파일이 다른가만 보므로 색 한 값만 바꿔도 통과한다. 실제로 이 선반은
  // 네 등급의 겉 실루엣 IoU가 1.0000인 채로 135와 375와 840에 팔리고 있었다.
  //
  // 색을 상수로 못 박고 그 색이 칠해진 자리만 세면 남는 변수는 형태뿐이다.
  // 껍데기는 두개골 안쪽에도 걸치므로 겉 실루엣이 아니라 칠해진 화소를 봐야 한다.
  const hairShape = await p.evaluate(async () => {
    const m = await import("/web/src/render/thumb.mjs");
    const g = await import("/web/src/state/gear.mjs");
    const k = { height: 188, weight: 84 };
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
        for (let i = 0; i < d.length; i += 4) a.push(d[i] > 150 && d[i + 1] < 90 && d[i + 2] > 150 && d[i + 3] > 16 ? 1 : 0);
        res(a);
      };
      im.src = url;
    });
    const bake = (n) => { const look = g.lookOf({ hair: n }); look.hair = MARK; return m.thumbURL("hair", k, look); };
    const ranks = g.HAIRS.map((h) => h.hair);
    const ms = [];
    for (const n of ranks) ms.push(await mask(bake(n)));
    const twice = await mask(bake(ranks[ranks.length - 1]));
    const iou = (x, y) => { let i = 0, u = 0; for (let n = 0; n < x.length; n++) { if (x[n] && y[n]) i++; if (x[n] || y[n]) u++; } return u ? i / u : 1; };
    const pairs = [];
    for (let i = 0; i < ms.length; i++) for (let j = i + 1; j < ms.length; j++) pairs.push({ n: ranks[i] + "-" + ranks[j], v: iou(ms[i], ms[j]) });
    return { cover: ms.map((x) => x.reduce((a, b) => a + b, 0)), pairs, control: iou(ms[ms.length - 1], twice) };
  });
  // 0.75. 두 등급이 칠해진 자리의 4분의 3을 공유하면 사람은 같은 머리에 색만 바꾼 것으로 읽는다.
  // 지금 최악 쌍이 0.667이라 통과용으로 맞춘 수가 아니고, 형태가 무너지는 날 먼저 운다.
  const shared = hairShape.pairs.filter((x) => x.v > 0.75);
  check("thumb:hair:ranks-do-not-share-one-shape", shared.length === 0,
    shared.map((x) => x.n + " " + x.v.toFixed(3)).join(", ") || "worst pair " + Math.max(...hairShape.pairs.map((x) => x.v)).toFixed(3));
  // 1000화소. 256x256의 1.5퍼센트다. 이 아래로 내려간 등급은 껍데기가 두개골 안으로 들어가
  // 그 값을 치른 사람만 대머리가 된다. 실제로 높이를 줄이는 방식으로 짧은 머리를 만들다 이 값이 227까지 내려갔다.
  const bald = hairShape.cover.filter((n) => n < 1000).length;
  check("thumb:hair:every-rank-paints-something", bald === 0, hairShape.cover.join(", "));
  check("control:the-same-cut-paints-the-same-pixels", hairShape.control > 0.999, hairShape.control.toFixed(4));

  // 대조군. 같은 등급을 두 번 구우면 같은 그림이어야 한다. 매번 달라지면 위의 다름은
  // 상품의 차이가 아니라 굽는 잡음이고, 그 축은 아무것도 증명하지 않는다.
  const twice = await p.evaluate(async () => {
    const m = await import("/web/src/render/thumb.mjs");
    const g = await import("/web/src/state/gear.mjs");
    const k = { height: 188, weight: 84 };
    const a = m.thumbURL("grip", k, g.lookOf({ grip: 1 }));
    const c = m.thumbURL("grip", k, g.lookOf({ grip: 1 }));
    const d = m.thumbURL("grip", k, g.lookOf({ grip: 3 }));
    return { same: a === c, differs: a !== d, len: a.length };
  });
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
