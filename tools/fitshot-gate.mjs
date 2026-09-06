import { chromium } from "playwright";

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
const EXE = process.env.LOCALAPPDATA + "/ms-playwright/chromium-1228/chrome-win64/chrome.exe";
const BASE = "http://127.0.0.1:10310/web/index.html?seed=20&preset=rich,veteran";
// 몸에 걸치는 여덟 선반. 시착실은 선반과 같이 다시 그려지므로 탭마다 새로 굽힌다.
const TABS = ["glove", "boot", "kit", "sock", "frame", "city", "hair", "ink"];
// 로스터의 두 극단 바깥까지 벌린다. 168과 200 사이만 재면 프레임이 체격을 따라가는지가 안 드러난다.
const BODIES = [[205, 96], [165, 62]];
// 위쪽 8%. 정수리 위에 이만큼도 여백이 없으면 머리가 프레임 변에 닿아 있고, 머리 한 등급만 커져도 잘린다.
const TOP_BAND = 0.08;
// 위쪽 띠에 심는 표식. 10x4=40화소이고 4행은 어느 프레임에서도 8% 띠 안이다.
const MARK = { w: 10, h: 4 };
// 아래쪽 2%. 발이 변에 닿으면 그 그림은 전신이 아니라 발목에서 끊긴 그림이다.
const FOOT_BAND = 0.02;
/* 세로로 55%. 이 아래로 내려가면 사람이 칸 가운데 작게 선 그림이라, 잘리지 않았다는 사실만으로
   통과하는 겨냥이 생긴다. 카메라는 하나이고 두 체격은 24% 갈리므로 작은 쪽 몫은 큰 쪽의 0.8배다.
   실측으로 키 205가 프레임 세로의 77.0%, 165가 59.4%를 쓴다. 작은 쪽을 키우려고 카메라를 당기면
   가장 높은 머리를 얹은 큰 쪽의 정수리가 위쪽 8% 띠로 들어간다(실측: 모히칸이 프레임의 6.9%). */
const SPAN_FLOOR = 0.55;
// 배경과의 차이. 칸 바탕색에서 채널 하나라도 이만큼 벌어지면 사람이 그린 화소다.
const DIFF = 24;
// 미리보기 칸의 바탕색. 구운 그림은 투명 배경이라 화면이 실제로 보여 주는 것은 이 색 위에 얹힌 사람이다.
const CARD_BG = [0x12, 0x18, 0x0f];
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
  p.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
  await p.goto(BASE, { waitUntil: "load" });
  await p.waitForSelector("#go", { timeout: 15000 });
  await p.click("#go", { force: true });
  await p.waitForTimeout(1300);
  await p.evaluate(() => window.__shop(true));
  await p.waitForTimeout(400);

  // 한 장을 읽는다. 바탕색을 깔고 그 위에 굽는 그림을 얹어, 바탕과 다른 화소만 사람으로 센다.
  // mark가 오면 위쪽 띠에 그 크기의 표식을 같이 심는다. 대조군이 쓰는 자리다.
  const measure = (src, mark) => p.evaluate(async (o) => {
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
      rows.push(Object.assign({ at: h + ":" + name, src, box }, await measure(src)));
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
    tallest.push(Object.assign({ at: h + ":hair" + worst.rank }, await measure(worst.url)));
  }
  const live = rows.filter((r) => !r.dead);
  check("instrument:every-sample-drew-a-preview", rows.length === BODIES.length * TABS.length && live.length === rows.length,
    live.length + " of " + rows.length + " samples, " + (live[0] ? live[0].w + "x" + live[0].h : "none"));
  check("instrument:the-body-i-planted-is-the-body-in-the-picture",
    live.length > 1 && live[0].src !== live[live.length - 1].src && live.every((r) => r.all > 0),
    live.length ? "tall " + live[0].all + " px, short " + live[live.length - 1].all + " px" : "no samples");
  check("instrument:the-measured-picture-is-the-one-on-screen",
    live.length > 0 && live.every((r) => r.box && r.box.url === r.src),
    live.filter((r) => !r.box || r.box.url !== r.src).map((r) => r.at).join(", ") || live.length + " matched");

  /* 대조군. 같은 그림의 위쪽 띠에 40화소를 심고 다시 잰다. 그만큼 정확히 늘어야
     이 자가 그 자리를 보고 있는 것이고, 안 늘면 앞의 초록은 아무것도 못 본 초록이다. */
  const clean = live[0];
  const marked = clean ? await measure(clean.src, MARK) : null;
  check("control:a-planted-mark-in-the-top-band-is-counted",
    Boolean(marked) && marked.top - clean.top === MARK.w * MARK.h,
    marked ? (marked.top - clean.top) + " of " + (MARK.w * MARK.h) + " planted pixels over the top " + marked.topRows + " rows" : "no sample");

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
  check("fitshot:the-whole-body-fills-the-frame", small.length === 0,
    (small.length ? small.map((r) => r.at + " " + r.span.toFixed(3)).join(", ") + "; " : "lowest "
      + Math.min.apply(null, live.map((r) => r.span)).toFixed(3) + " of the frame height; ") + seat);
  check("console:no-errors", errs.length === 0, errs.slice(0, 2).join(" | ") || "clean");
  await ctx.close();

  console.log("표본 범위: 체격 " + BODIES.length + " × 장비 " + TABS.length + "탭 = " + rows.length
    + "장, 여기에 체격마다 가장 높은 머리 등급 한 장씩 " + tallest.length + "장");
  if (notes.length) console.log(notes.map((x) => "  ok   " + x).join(LINE));
  if (fails.length) console.log(fails.map((x) => "  FAIL " + x).join(LINE));
  console.log(fails.length ? "fitshot FAIL " + fails.length : "fitshot PASS " + notes.length);
  if (fails.length) process.exitCode = 1;
} finally {
  clearTimeout(t);
  if (b) await b.close();
}
