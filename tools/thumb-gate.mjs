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
      { tab: "socks", field: "socks", look: "sock", rows: g.SOCKS },
      { tab: "ink", field: "ink", look: "ink", rows: g.TATTOOS }
    // 형태 값이 등급 줄에 있을 수도 있고, 그 등급의 변형 목록에 있을 수도 있다.
    // 한쪽만 보면 변형을 들인 선반이 조용히 이 자에서 빠진다. 실제로 그렇게 두 선반이 빠졌다.
    ].filter((s) => s.rows.every((r, i) => (g.SKINS[s.field] ? g.skinAt(s.field, i, 0).cut : r.cut)));
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
  const OLD_PADS_AIM = { part: "torso", lift: 0.3 };
  const heads = await p.evaluate(async (old) => {
    const m = await import("/web/src/render/thumb.mjs");
    const g = await import("/web/src/state/gear.mjs");
    const k = { height: 188, weight: 84 };
    const read = (tag, len, hb) => ({ tag, len,
      top: hb.y - hb.ry, bot: hb.y + hb.ry, left: hb.x - hb.rx, right: hb.x + hb.rx,
      eyes: hb.eyes.map((e) => ({ x: e.x, y: e.y })) });
    const out = { live: [], was: [], arm: [],
      shelf: { ranks: g.KITS.length, per: g.KITS.map((_, r) => g.skinsAt("pads", r).length) } };
    for (let rank = 0; rank < g.KITS.length; rank += 1) {
      for (let skin = 0; skin < g.skinsAt("pads", rank).length; skin += 1) {
        const look = g.lookOf({ pads: rank, padsSkin: skin });
        const tag = rank + ":" + skin;
        const len = g.skinAt("pads", rank, skin).cut.len;
        out.live.push(read(tag, len, m.headBox("pads", k, look)));
        out.was.push(read(tag, len, m.headBox("pads", k, look, old)));
        const ab = m.armBox("pads", k, look);
        out.arm.push({ tag, len, y0: ab ? ab.y0 : 1, parts: ab ? ab.parts : 0 });
      }
    }
    return out;
  }, OLD_PADS_AIM);
  const headIn = (r) => r.top >= 0 && r.bot <= 1 && r.left >= 0 && r.right <= 1;
  const eyesIn = (r) => r.eyes.length === 2 && r.eyes.every((e) => e.x >= 0 && e.x <= 1 && e.y >= 0 && e.y <= 1);
  const sayHead = (r) => r.tag + " len " + r.len + " box " + r.top.toFixed(3) + ".." + r.bot.toFixed(3)
    + " eyes " + (r.eyes.length ? r.eyes.map((e) => e.y.toFixed(3)).join("/") : "none");
  const looks = heads.shelf.per.reduce((a, c) => a + c, 0);
  const lost = heads.live.filter((r) => !headIn(r) || !eyesIn(r));
  check("instrument:every-kit-look-returned-a-head-box",
    heads.live.length === looks && heads.live.every((r) => r.bot > r.top) && heads.arm.every((r) => r.parts >= 1),
    heads.live.length + " of " + looks + " looks measured, shoulder box over "
    + heads.arm.map((r) => r.parts).join("/") + " meshes");
  check("thumb:every-kit-look-keeps-its-head-in-frame", heads.live.length === looks && lost.length === 0,
    lost.length ? lost.map(sayHead).join(", ")
      : heads.shelf.ranks + " grades over " + heads.shelf.per.join("/") + " variants, box "
        + Math.min.apply(null, heads.live.map((r) => r.top)).toFixed(3) + ".."
        + Math.max.apply(null, heads.live.map((r) => r.bot)).toFixed(3)
        + " with both eyes inside on all " + heads.live.length + ", longest shirt "
        + Math.max.apply(null, heads.live.map((r) => r.len)));
  const cut = heads.arm.filter((r) => !(r.y0 >= 0));
  check("thumb:every-kit-look-keeps-its-shoulders-in-frame", heads.arm.length === looks && cut.length === 0,
    cut.length ? cut.map((r) => r.tag + " len " + r.len + " shoulder top " + r.y0.toFixed(3)).join(", ")
      : "shoulder box top " + Math.min.apply(null, heads.arm.map((r) => r.y0)).toFixed(3)
        + " at the highest, inside the frame on all " + heads.arm.length);
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
  const fills = await p.evaluate(async ([delta, old, pad, nearDist]) => {
    const m = await import("/web/src/render/thumb.mjs");
    const g = await import("/web/src/state/gear.mjs");
    const k = { height: 188, weight: 84 };
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
  }, [FILL_DELTA, OLD_INK_AIM, SKIN_PAD, NEAR_INK_DIST]);
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
  const dead = await p.evaluate(async () => {
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
    m.startSpin(shot, "nosuchkind", { height: 188, weight: 84 }, {});
    await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
    const cs = getComputedStyle(im);
    const out = { rest, h: +im.getBoundingClientRect().height.toFixed(2), vis: cs.display + "/" + cs.visibility, canvas: Boolean(shot.querySelector("canvas")) };
    m.stopSpin();
    card.remove();
    return out;
  });
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
