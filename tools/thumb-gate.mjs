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
  const shapes = await p.evaluate(async () => {
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
      { tab: "socks", field: "socks", look: "sock", rows: g.SOCKS }
    ].filter((s) => s.rows.every((r) => r.cut));
    const out = [];
    for (const s of TABLE) {
      const bake = (n) => { const look = g.lookOf({ [s.field]: n }); look[s.look] = MARK; return m.thumbURL(s.tab, k, look); };
      const ranks = s.rows.map((r, i) => i);
      const ms = [];
      for (const n of ranks) ms.push(await mask(bake(n)));
      const twice = await mask(bake(ranks[ranks.length - 1]));
      const pairs = [];
      for (let i = 0; i < ms.length; i++) for (let j = i + 1; j < ms.length; j++) pairs.push({ n: ranks[i] + "-" + ranks[j], v: iou(ms[i], ms[j]) });
      // 무게중심. 물건이 칸 구석에 걸쳐 있으면 화소 수는 넉넉해도 사람은 잘린 물건을 본다.
      const mid = ms.map((x) => {
        let sx = 0, sy = 0, n = 0;
        for (let i = 0; i < x.length; i++) if (x[i]) { sx += i % x.w; sy += Math.floor(i / x.w); n++; }
        return n ? { x: sx / n / x.w, y: sy / n / x.h } : { x: -1, y: -1 };
      });
      out.push({ tab: s.tab, cover: ms.map((x) => x.reduce((a, b) => a + b, 0)), pairs, mid, control: iou(ms[ms.length - 1], twice) });
    }
    return out;
  });
  check("instrument:some-shelf-declares-a-shape", shapes.length > 0, shapes.map((s) => s.tab).join(", "));
  for (const s of shapes) {
    // 0.75. 두 등급이 칠해진 자리의 4분의 3을 공유하면 사람은 같은 물건에 색만 바꾼 것으로 읽는다.
    // 지금 최악 쌍이 머리 0.67 축구화 0.71이라 통과용으로 맞춘 수가 아니고, 형태가 무너지는 날 먼저 운다.
    const shared = s.pairs.filter((x) => x.v > 0.75);
    check("thumb:" + s.tab + ":ranks-do-not-share-one-shape", shared.length === 0,
      shared.map((x) => x.n + " " + x.v.toFixed(3)).join(", ") || "worst pair " + Math.max(...s.pairs.map((x) => x.v)).toFixed(3));
    // 1000화소. 굽는 칸의 1퍼센트쯤이다. 이 아래로 내려간 등급은 껍데기가 몸 안으로 들어가
    // 그 값을 치른 사람만 맨몸이 된다. 실제로 높이를 줄여 짧은 머리를 만들다 이 값이 227까지 내려갔다.
    check("thumb:" + s.tab + ":every-rank-paints-something", s.cover.every((n) => n >= 1000), s.cover.join(", "));
    // 가운데 60퍼센트. 겨냥이 어긋나면 물건이 변으로 밀리고, 그때 칸에 담기는 것은 물건이 아니라
    // 그 옆에 붙은 몸이다. 축구화 칸이 정강이만 담고 있던 것을 아무 축도 못 봤다.
    const off = s.mid.filter((m) => m.x < 0.2 || m.x > 0.8 || m.y < 0.2 || m.y > 0.8);
    check("thumb:" + s.tab + ":the-goods-sit-inside-the-frame", off.length === 0,
      s.mid.map((m) => m.x.toFixed(2) + "/" + m.y.toFixed(2)).join(" "));
    check("control:" + s.tab + ":the-same-cut-paints-the-same-pixels", s.control > 0.999, s.control.toFixed(4));
  }

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
