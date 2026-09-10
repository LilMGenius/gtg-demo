import { chromium } from "playwright";
import { KICKERS, ROLES } from "../src/roster.mjs";

// 내 정보 칸과 선수단 칸의 자. 한 창이 성격이 다른 넷을 한 두루마리에 쌓으면, 무엇을 보러 들어왔든
// 나머지 셋을 지나가야 답이 나온다. 칸을 갈랐다는 주장은 갈린 뒤에도 셋이 다 보이면 거짓이다.
//
// 재는 것은 여섯이다. 칸이 셋이고 한 번에 하나만 서는가, 각 칸이 자기 것만 그리는가,
// 초상화와 걸친 것은 어느 칸에서도 남는가, 둘째 단의 큰 수 셋이 장부와 같은 수로 서는가,
// 상대 전적이 진짜 표인가, 선수단의 포지션 넷이 서로 다른 카드 집합을 여는가.
// 대조군으로 칸을 옮겨 다니며 같은 것을 다시 잰다. 한 칸만 재면 나머지 둘은 아무도 안 본다.
const EXE = process.env.LOCALAPPDATA + "/ms-playwright/chromium-1228/chrome-win64/chrome.exe";
// famous는 라포 줄을, seed 20은 전적 줄을, rich는 영입 카드의 값을 살아 있게 만든다.
const BASE = "http://127.0.0.1:10310/web/index.html?seed=20&preset=famous,rich,veteran";
const LINE = String.fromCharCode(10);
const t = setTimeout(() => { console.log("WATCHDOG"); process.exit(1); }, 180000);
t.unref();

const fails = [], notes = [];
const check = (n, ok, d) => (ok ? notes : fails).push(n + " " + d);
const TABS = ["stat", "face", "log"];
// 포지션 넷. 화면은 약어로 세우고 계기는 데이터 이름으로 부른다. 둘을 한 곳에서 이어야
// 약어가 바뀐 날 이 자가 엉뚱한 탭을 누르지 않는다.
const POS = ["gk"].concat(ROLES);

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
  // 전적 한 줄과 아는 얼굴 한 줄을 만든다. 빈 칸만 재면 갈렸는지를 알 수 없다.
  // 라포는 판을 여러 번 돌려야 쌓이므로 저장에 직접 심는다. 심는 값은 판정이 읽는 그 자리다.
  await p.evaluate(() => window.__act && window.__act("save"));
  await p.evaluate(() => { window.__rapport()["0:0"] = 4; });
  /* 6.5 (a). 창 바탕 #080b07c4는 뒤가 비치는 것이 설계다. 그래서 살아 있는 자막이 첫 단 글자
     아래로 그대로 올라온다. 실측 1280x720에서 자막 상자가 첫 단 상자 안으로 13.6px 들어왔고,
     첫 단 상자 27390px 중 2323px이 자막의 잉크였다. 화면에서는 두 문장이 한 덩어리로 읽힌다.
     자막이 살아 있는 화면과 자막만 걷은 화면을 같은 자리에서 찍어 달라진 화소를 센다. 창은 두
     장에서 다 열려 있으므로 창의 어둠과 그 겹은 같고, 남는 차이는 자막의 잉크뿐이다.
     찍기 전에 장면 캔버스를 세우고 뒤에 단색을 깐다. 움직이는 배경 위에서는 같은 화면을 두 번
     찍어도 화소가 흔들려 잉크와 배경을 못 가른다. title-gate가 같은 이유로 쓰는 자세다.
     자막 한 줄이 실제로 떠 있는 것을 프레임으로 기다린 뒤에 판을 잠근다. 카운트다운은 0.1초마다
     숫자를 갈아서, 안 잠그면 정지 프레임 두 장이 그 숫자 하나로 갈린다. */
  const INK_TOL = 8;
  const inkMoved = (a, z) => p.evaluate(([s1, s2, tol]) => new Promise((res) => {
    const load = (s) => new Promise((r2) => { const im = new Image(); im.onload = () => r2(im); im.src = "data:image/png;base64," + s; });
    Promise.all([load(s1), load(s2)]).then(([ia, ib]) => {
      const cv = document.createElement("canvas");
      cv.width = ia.width; cv.height = ia.height;
      const g = cv.getContext("2d");
      g.drawImage(ia, 0, 0);
      const da = g.getImageData(0, 0, ia.width, ia.height).data;
      g.clearRect(0, 0, cv.width, cv.height);
      g.drawImage(ib, 0, 0);
      const db = g.getImageData(0, 0, ia.width, ia.height).data;
      let n = 0;
      for (let i = 0; i < da.length; i += 4) {
        if (Math.max(Math.abs(da[i] - db[i]), Math.abs(da[i + 1] - db[i + 1]), Math.abs(da[i + 2] - db[i + 2])) > tol) n += 1;
      }
      res({ moved: n, all: da.length / 4 });
    });
  }), [a, z, INK_TOL]);
  // 자르는 자리는 화면 안으로 물린다. 창 밖을 자르면 찍기가 통째로 죽어 축이 아니라 계기가 운다.
  const inkClip = (r, vw, vh) => {
    const x = Math.max(0, Math.floor(r.l));
    const y = Math.max(0, Math.floor(r.t));
    return { x, y, width: Math.max(1, Math.min(Math.ceil(r.r) - x, vw - x)),
      height: Math.max(1, Math.min(Math.ceil(r.b) - y, vh - y)) };
  };
  const inkShot = async (c) => (await p.screenshot({ clip: c })).toString("base64");
  const inkBox = (sel) => p.evaluate((s) => {
    const e = document.querySelector(s);
    if (!e) return null;
    const q = e.getBoundingClientRect();
    return { t: +q.top.toFixed(1), b: +q.bottom.toFixed(1), l: +q.left.toFixed(1), r: +q.right.toFixed(1) };
  }, sel);
  const standDown = (on) => p.evaluate((v) => {
    document.getElementById("stage").style.visibility = v ? "hidden" : "";
    document.body.style.background = v ? "#7f7f7f" : "";
  }, on);

  await p.waitForFunction(() => document.getElementById("caption").textContent.trim().length > 0, null, { timeout: 25000 });
  await p.evaluate(() => window.__lockRound());
  await p.evaluate(() => window.__me(true));
  await p.waitForTimeout(420);
  await standDown(true);
  await p.waitForTimeout(200);
  const capSeen = await p.evaluate(() => {
    const cap = document.getElementById("caption").getBoundingClientRect();
    const h4 = document.querySelector("#me h4").getBoundingClientRect();
    return { text: document.getElementById("caption").textContent.trim(),
      into: +(Math.min(cap.bottom, h4.bottom) - Math.max(cap.top, h4.top)).toFixed(1),
      op: Number(getComputedStyle(document.getElementById("caption")).opacity) };
  });
  const capClip = inkClip(await inkBox("#me h4"), 1280, 720);
  const capOn = await inkShot(capClip);
  const capOn2 = await inkShot(capClip);
  await p.evaluate(() => { document.getElementById("caption").style.visibility = "hidden"; });
  await p.waitForTimeout(90);
  const capOff = await inkShot(capClip);
  await p.evaluate(() => { document.getElementById("caption").style.visibility = ""; });
  await p.waitForTimeout(90);
  /* 대조군. 비교자가 진짜 달라진 화소를 잡는지 먼저 묻는다. 같은 자리에 한 겹을 심어 두고 다시
     잰다. 이게 없으면 찍기가 통째로 죽은 날에도 위의 축이 0으로 초록을 낸다. */
  await p.evaluate((r) => {
    const q = document.createElement("div");
    q.id = "inkProbe";
    q.style.cssText = "position:fixed;z-index:99;pointer-events:none;background:#ff00ff;left:"
      + r.x + "px;top:" + r.y + "px;width:" + r.width + "px;height:" + r.height + "px";
    document.body.append(q);
  }, capClip);
  await p.waitForTimeout(90);
  const capPlanted = await inkShot(capClip);
  await p.evaluate(() => { const q = document.getElementById("inkProbe"); if (q) q.remove(); });
  await standDown(false);
  await p.evaluate(() => window.__me(false));
  await p.waitForTimeout(160);
  const capStill = await inkMoved(capOn, capOn2);
  const capInk = await inkMoved(capOn, capOff);
  const capCaught = await inkMoved(capOn, capPlanted);
  check("instrument:a-live-caption-stood-behind-the-header", capSeen.text.length > 0 && capSeen.into > 0,
    JSON.stringify(capSeen.text) + " reaches " + capSeen.into + "px into the header box, caption opacity " + capSeen.op);
  check("control:the-ink-comparator-catches-a-planted-layer", capCaught.moved >= capCaught.all * 0.98,
    capCaught.moved + " of " + capCaught.all + "px caught under a planted layer");
  check("mepane:the-header-carries-no-caption-ink-at-1280x720", capInk.moved === 0 && capStill.moved === 0,
    capInk.moved + "px of " + capInk.all + " = " + (100 * capInk.moved / capInk.all).toFixed(2)
    + "% of the header box moved when the caption was pulled, a still frame moves " + capStill.moved + "px");
  /* 큰 수 셋은 장부에서 나온다. 막은 것만 있는 장부로 재면 먹힌 수 칸이 0으로 서고,
     0은 자리가 비어 있는 것과 화면에서 안 갈린다. 두 이름을 심어 세 수가 전부 살아 있게 한다.
     판이 계속 돌면 그 사이에 장부가 또 움직이므로, 심기 전에 판을 멈춘다. */
  await p.evaluate(() => window.__freeze(true));
  /* 판도 같이 세운다. 얼리기는 그림만 세우고 구는 계속 도는데, 한 세트가 끝나면 개봉 창이 열리고
     그때부터 openMe가 shutOthers에서 조용히 되돌아간다. 그러면 이 자는 숨은 옛 화면을 읽는다.
     실측으로 기계가 바쁜 랩에서 컨디션 축이 그 옛 화면을 읽고 빨개졌다. */
  await p.evaluate(() => window.__lockRound());
  await p.evaluate((names) => {
    const r = window.__record();
    r[names[0]] = { saved: 7, conceded: 3 };
    r[names[1]] = { saved: 2, conceded: 4 };
  }, [KICKERS[0].name, KICKERS[1].name]);
  /* 최근 줄은 피드에서 나온다. 열 판보다 많이 심어야 자르는 자리가 재진다. 남이 찍은 사진과
     셀카도 같이 심는다. 둘은 판이 아니라 글이라 걸러져야 하고, 안 걸리면 이 축이 그것을 잡는다. */
  await p.evaluate((names) => {
    const posts = window.__posts();
    const one = { city: 0, passer: 0, tier: 1, h: 180, w: 75, look: {} };
    for (let i = 0; i < 12; i += 1) posts.push({ n: names[i % 2], c: i % 3 === 0, g: 0, t: "", lb: 0, ct: 0, l: 0 });
    posts.push({ n: names[0], c: false, g: 0, t: "", lb: 0, ct: 0, l: 0, ph: one });
    posts.push({ n: names[1], c: false, g: 0, t: "", lb: 0, ct: 0, l: 0, sf: one });
  }, [KICKERS[0].name, KICKERS[1].name]);
  await p.evaluate(() => window.__me(true));
  await p.waitForTimeout(500);

  const read = () => p.evaluate(() => {
    const box = document.getElementById("me");
    const card = box.querySelector(".card");
    const cr = card ? card.getBoundingClientRect() : null;
    const inBox = (e) => {
      const r = e.getBoundingClientRect();
      return Boolean(r.width > 0 && r.height > 0 && cr && r.top >= cr.top - 1 && r.bottom <= cr.bottom + 1);
    };
    // 토큰 실측. 선언이 아니라 브라우저가 계산한 px여야 '이 크기 이상'을 잴 수 있다.
    const probe = document.createElement("span");
    probe.style.cssText = "position:fixed;visibility:hidden;font-size:var(--fs-title)";
    document.body.append(probe);
    const titlePx = Number.parseFloat(getComputedStyle(probe).fontSize);
    probe.remove();
    const tabs = [...box.querySelectorAll(".tab")].map((e) => e.dataset.tab);
    const table = (() => {
      const tb = box.querySelector(".pane table");
      if (!tb) return null;
      const rows = [...tb.querySelectorAll("tbody tr")];
      return {
        cols: tb.querySelectorAll("thead th").length,
        rows: rows.length,
        faces: rows.filter((r) => { const im = r.querySelector("img"); return im && im.naturalWidth > 0; }).length,
        square: rows.every((r) => r.querySelectorAll("td").length === 4),
        cells: rows.map((r) => [...r.querySelectorAll("td")].map((c) => c.textContent.trim()))
      };
    })();
    return {
      // 창이 정말 열려 있는가. 숨은 판은 옛 그림을 그대로 들고 있어, 안 물으면 지난 렌더가 답이 된다.
      open: !document.getElementById("me").hidden,
      tabs,
      current: [...box.querySelectorAll('.tab[aria-current="true"]')].map((e) => e.dataset.tab),
      /* 자식 선택자다. span 하나로 세면 칸 안의 이름 span까지 같이 세어 열다섯이 서른으로 찍힌다.
         문턱은 그대로 전부 보이는가이고, 바뀌는 것은 찍히는 수가 진짜 칸 수인지다. */
      stats: box.querySelectorAll(".grid > span").length,
      logs: box.querySelectorAll(".log span").length,
      // 라포 줄은 사람에게 붙은 버튼을 들고 있다. 그 버튼이 곧 그 칸의 표식이다.
      faces: box.querySelectorAll(".note .go").length,
      wear: box.querySelectorAll(".wear .on i").length,
      shot: box.querySelector(".wear .shot img") ? 1 : 0,
      // 첫 단. 누구를 보고 있는지가 초상과 이름과 레벨과 컨디션으로 선다.
      head: {
        /* 그려진 상자를 잰다. naturalWidth는 구운 그림의 원래 크기라, 규칙이 통째로 안 걸려
           초상이 0px으로 서 있어도 448을 낸다. 실측으로 21e0f33이 정확히 그 상태였다. */
        face: (() => {
          const im = box.querySelector("h4 img");
          const h4 = box.querySelector("h4");
          if (!im || !h4) return { w: 0, h: 0, inside: false };
          const r = im.getBoundingClientRect();
          const q = h4.getBoundingClientRect();
          return { w: Math.round(r.width), h: Math.round(r.height),
            inside: r.width > 0 && r.height > 0 && r.top >= q.top - 1 && r.bottom <= q.bottom + 1
              && r.left >= q.left - 1 && r.right <= q.right + 1 };
        })(),
        text: box.querySelector("h4") ? box.querySelector("h4").textContent.trim() : "",
        cond: box.querySelectorAll("h4 .cond svg").length,
        // 칸이 든 것과 칩이 든 것. 둘을 같이 들고 나와야 옮겨 온 것인지 따로 그린 것인지가 갈린다.
        mark: (() => { const c = box.querySelector("h4 .cond"); return c ? c.innerHTML : ""; })(),
        chip: (() => { const f = document.getElementById("form"); return f ? f.innerHTML : ""; })()
      },
      // 둘째 단. 큰 수 셋이다.
      big: [...box.querySelectorAll(".big > span")].map((e) => {
        const v = e.querySelector("b");
        return {
          text: v ? v.textContent.trim() : "",
          px: v ? Number.parseFloat(getComputedStyle(v).fontSize) : 0,
          seen: inBox(e)
        };
      }),
      titlePx,
      table,
      // 아는 얼굴 카드. 실루엣과 단계 바와 만남 버튼이 한 장에 있어야 카드다.
      met: [...box.querySelectorAll(".pane .met")].map((e) => {
        const bar = e.querySelector(".bar u");
        const go = e.querySelector(".go");
        return {
          face: e.querySelectorAll(".ava svg").length,
          bar: bar ? Math.round(bar.getBoundingClientRect().width) : -1,
          go: go ? (go.querySelector(".px") ? "px" : go.textContent.trim()) : ""
        };
      }),
      // 긁지 않고 보이는 능력치. 창을 연 이유가 능력치인데 절반이 접힘 아래면 그 창은 답을 반만 한다.
      inView: (() => {
        const pane = box.querySelector(".pane");
        if (!pane) return 0;
        const r = pane.getBoundingClientRect();
        return [...box.querySelectorAll(".grid > span")].filter((e) => {
          const q = e.getBoundingClientRect();
          return q.top >= r.top - 1 && q.bottom <= r.bottom + 1;
        }).length;
      })(),
      // 축이 빨갛게 죽을 때 무엇이 자리를 먹었는지가 같이 적혀야 다음 사람이 다시 안 잰다.
      room: (() => {
        const pane = box.querySelector(".pane");
        const grid = box.querySelector(".grid");
        const px = (e) => (e ? Math.round(e.getBoundingClientRect().height) : -1);
        return "card " + px(card) + " pane " + px(pane) + " grid " + px(grid)
          + " wear " + px(box.querySelector(".wear")) + " big " + px(box.querySelector(".big"))
          + " head " + px(box.querySelector("h4"));
      })(),
      chars: box.textContent.trim().length
    };
  });

  const seen = {};
  for (const id of TABS) {
    await p.click('#me .tab[data-tab="' + id + '"]', { force: true });
    await p.waitForTimeout(220);
    seen[id] = await read();
  }

  check("instrument:the-three-panes-were-found",
    TABS.every((id) => seen[id].open && seen[id].tabs.join(",") === TABS.join(",")),
    seen.stat.tabs.join(", ") + " with the panel open " + TABS.map((id) => seen[id].open).join("/"));
  check("mepane:one-pane-stands-at-a-time", TABS.every((id) => seen[id].current.length === 1 && seen[id].current[0] === id),
    TABS.map((id) => id + " -> " + seen[id].current.join("/")).join(", "));
  check("mepane:the-stat-pane-holds-the-growth-slots", seen.stat.stats > 0 && seen.face.stats === 0 && seen.log.stats === 0,
    "stat " + seen.stat.stats + ", face " + seen.face.stats + ", log " + seen.log.stats);
  check("mepane:the-record-pane-holds-the-record", seen.log.logs > 0 && seen.stat.logs === 0 && seen.face.logs === 0,
    "stat " + seen.stat.logs + ", face " + seen.face.logs + ", log " + seen.log.logs);
  // 최근 줄은 열 판에서 끊긴다. 안 끊으면 피드가 길어질수록 전적 칸이 두루마리로 되돌아간다.
  check("mepane:the-recent-rounds-stop-at-ten", seen.log.logs === 10, seen.log.logs + " rounds in the record pane");
  check("mepane:the-people-pane-holds-the-people", seen.face.faces > 0 && seen.stat.faces === 0 && seen.log.faces === 0,
    "stat " + seen.stat.faces + ", face " + seen.face.faces + ", log " + seen.log.faces);
  check("mepane:the-wardrobe-stays-in-every-pane", TABS.every((id) => seen[id].wear === 8 && seen[id].shot === 1),
    TABS.map((id) => id + " " + seen[id].wear + " lines, shot " + seen[id].shot).join(", "));
  // 720p에서 능력치가 하나도 접힘 아래로 안 내려가야 한다. 실측으로 열다섯 중 아홉만 보이던 자리다.
  // 이 축은 능력치가 늘어나는 날에도 운다. 칸이 늘면 격자나 창 높이가 같이 움직여야 한다는 뜻이다.
  check("mepane:every-stat-is-visible-without-scrolling", seen.stat.inView === seen.stat.stats,
    seen.stat.inView + " of " + seen.stat.stats + " in view, " + seen.stat.room);
  // 갈랐다면 한 칸의 글자 수가 셋을 합친 것보다 적다. 같으면 탭만 그리고 내용은 그대로 쌓인 것이다.
  const widest = Math.max(seen.stat.chars, seen.face.chars, seen.log.chars);
  const total = seen.stat.chars + seen.face.chars + seen.log.chars;
  check("mepane:no-pane-carries-the-whole-scroll", widest < total * 0.8,
    widest + " chars against " + total + " over three panes");

  /* 둘째 단. 세 수는 어느 칸에서도 남는다. 칸을 옮기면 사라지는 수는 그 칸의 내용이지 단이 아니다.
     크기는 제목 토큰 실측을 자로 쓴다. 선언을 읽으면 토큰이 바뀐 날 이 축이 조용히 통과한다. */
  const bigOk = TABS.every((id) => seen[id].big.length === 3
    && seen[id].big.every((v) => v.seen && v.px >= seen[id].titlePx - 0.5 && v.text.length > 0));
  check("mepane:the-record-leads-with-three-big-numbers", bigOk,
    TABS.map((id) => id + " " + seen[id].big.map((v) => v.text + "@" + v.px).join("/")).join(", ")
    + " title " + seen.stat.titlePx);
  // 화면의 수와 장부의 수. 화면이 제 수를 따로 세면 장부가 움직인 날 둘이 갈린다.
  const ledger = await p.evaluate(() => {
    const r = window.__record();
    let s = 0, c = 0;
    for (const k of Object.keys(r)) { s += r[k].saved; c += r[k].conceded; }
    return { s, c, n: Object.keys(r).length };
  });
  const rate = ledger.s + ledger.c > 0 ? Math.round((ledger.s / (ledger.s + ledger.c)) * 100) : 0;
  const shown = seen.stat.big.map((v) => v.text.replace(/[^0-9]/g, ""));
  check("mepane:the-big-numbers-agree-with-the-ledger",
    shown.join(",") === [String(rate), String(ledger.s), String(ledger.c)].join(","),
    "screen " + shown.join("/") + " ledger " + rate + "/" + ledger.s + "/" + ledger.c);

  // 상대 전적. 표가 아니면 이름과 수가 줄마다 다른 자리에 서고, 누구한테 약한지가 눈으로 안 읽힌다.
  const tb = seen.log.table;
  check("mepane:the-head-to-head-is-a-real-table",
    Boolean(tb) && tb.cols === 4 && tb.rows > 0 && tb.square && tb.faces === tb.rows,
    tb ? tb.cols + " columns, " + tb.rows + " rows, " + tb.faces + " faces, square " + tb.square
      : "no table in the record pane");
  check("instrument:the-table-holds-the-planted-rows", Boolean(tb) && tb.rows >= ledger.n,
    tb ? tb.rows + " rows against " + ledger.n + " in the ledger" : "no table");

  // 첫 단. 초상과 이름과 레벨은 늘 서 있고 컨디션은 값이 있을 때만 선다.
  /* 잘라 낸 초상은 정사각이다. 상자를 안 받은 img는 제 칸을 채우고 늘어나므로, 정사각인지를
     묻는 것이 크기 상수를 여기 다시 적지 않고 규칙이 걸렸는지 묻는 방법이다.
     실측으로 21e0f33의 초상이 454x217이었고 naturalWidth는 그때도 448이었다. */
  const square = (f) => f.w > 0 && f.inside && Math.abs(f.w - f.h) <= 1;
  const headOk = TABS.every((id) => square(seen[id].head.face) && /Lv ?[0-9]/.test(seen[id].head.text));
  check("mepane:the-top-tier-carries-the-face-and-the-level", headOk,
    TABS.map((id) => id + " face " + seen[id].head.face.w + "x" + seen[id].head.face.h
      + " inside " + seen[id].head.face.inside).join(", ") + " text " + JSON.stringify(seen.stat.head.text));
  /* 컨디션. 상단 칩이 그 값의 유일한 소유자라 여기서는 칩이 낸 판정을 그대로 옮긴다.
     기복은 판당 한 번 굴러서 기다릴 수 없으므로 값을 넣어 두 상태를 다 본다.
     대조군이 없으면 늘 서 있는 아이콘 하나로도 이 축이 통과한다. */
  /* 다시 그리는 길은 탭 누르기다. 닫았다 여는 길은 다른 창이 열려 있으면 되돌아가고,
     그때 판은 숨은 채 옛 그림을 들고 있어 이 축이 지난 렌더를 읽는다. */
  const condAt = async (v) => {
    await p.evaluate((x) => { window.__form(x); }, v);
    await p.click('#me .tab[data-tab="face"]', { force: true });
    await p.waitForTimeout(200);
    await p.click('#me .tab[data-tab="stat"]', { force: true });
    await p.waitForTimeout(240);
    const got = await read();
    return { cond: got.head.cond, mark: got.head.mark, chip: got.head.chip, open: got.open };
  };
  /* 칩이 세 갈래를 다 그리게 된 뒤로 '아이콘 없음'은 상태가 아니다. 그래서 묻는 것은 둘이다.
     칸이 든 그림이 칩이 든 그것과 같은가, 그리고 세 갈래가 서로 다른 그림인가.
     앞이 소유 관계를 재고 뒤가 대조군이다. 하나만 재면 늘 같은 아이콘 하나로도 통과한다. */
  const shots = [];
  for (const v of [1, 0, -1]) shots.push(await condAt(v));
  const copied = shots.every((r) => r.open && r.cond === 1 && r.mark === r.chip);
  const apart = new Set(shots.map((r) => r.mark)).size === 3;
  check("mepane:the-condition-follows-the-chip", copied && apart,
    "form 1/0/-1 -> " + shots.map((r) => r.cond).join("/") + " icon, copied from the chip "
    + copied + ", three states apart " + apart);

  // 아는 얼굴. 줄이 아니라 카드다. 실루엣과 단계 바와 만남 버튼이 한 장에 같이 선다.
  await p.evaluate(() => { window.__form(0.5); window.__me(false); window.__me(true); });
  await p.click('#me .tab[data-tab="face"]', { force: true });
  await p.waitForTimeout(300);
  const metView = (await read()).met;
  check("mepane:a-known-face-stands-as-a-card",
    metView.length > 0 && metView.every((m) => m.face > 0 && m.bar > 0 && m.go.length > 0),
    metView.length ? JSON.stringify(metView) : "no cards in the people pane");

  // 대조군. 닫고 다시 열면 능력치 칸으로 돌아온다. 안 돌아오면 다음에 연 사람이 탭을 눌러야 한다.
  await p.evaluate(() => { window.__me(false); window.__me(true); });
  await p.waitForTimeout(350);
  const again = await read();
  check("control:reopening-lands-on-the-stat-pane", again.current.join("") === "stat", again.current.join("/") || "none");

  /* 접힘 아래. 상대 전적 표는 진짜 표로 서 있었는데 1280x720에서 243px 자리에 700px을 담아
     최근 목록만 보이고 표는 통째로 화면 밖이었다. 능력치도 416을 같은 자리에 담아 기복과
     프로의식이 같이 잘렸다. 아래에 더 있다는 말이 화면 어디에도 없었다. 위키가 이미 같은
     결함을 아래끝 그늘 한 겹으로 닫았으므로, 여기서 재는 것도 그 그늘이다. */
  const CUE_TOL = 8;
  /* 신호가 옮겨야 하는 최소 화소 몫. 그늘이 DOM에만 있고 화면을 안 건드리면 위의 축은 빈 초록이다.
     26px 띠는 위로 갈수록 투명해져 몫이 1에 닿지 못한다. 실측으로 가장 약한 칸이 22.4%,
     위키 여덟 칸에서 가장 약한 것이 51.4%였다. 12%는 그 절반 아래라 신호를 그렸다면 넘고
     안 그렸다면 못 넘는 자리다. */
  const CUE_FLOOR = 0.12;
  const paneCue = () => p.evaluate(() => {
    const pane = document.querySelector("#me .pane");
    if (!pane) return null;
    /* 신호는 구르는 칸의 형제다. 안에 두면 내용과 같이 굴러가 아래끝에 못 선다.
       그래서 칸이 아니라 칸을 감싼 상자에서 찾는다. 상자가 없으면 여기서 null이 난다. */
    const wrap = pane.parentElement;
    const r = pane.getBoundingClientRect();
    const seat = (sel) => {
      const e = wrap ? wrap.querySelector(sel) : null;
      if (!e) return null;
      const q = e.getBoundingClientRect();
      return { h: Math.round(q.height), w: Math.round(q.width), bottom: Math.round(q.bottom),
        left: Math.round(q.left), op: Number(getComputedStyle(e).opacity) };
    };
    return { over: Math.round(pane.scrollHeight - pane.clientHeight), at: Math.round(pane.scrollTop),
      bottom: Math.round(r.bottom), left: Math.round(r.left), w: Math.round(r.width),
      down: seat(".cue.down"), up: seat(".cue.up") };
  });
  // 끝까지 굴린다. scrollTop을 코드로 밀면 scroll 이벤트가 안 오는 판이 있어 여기서 같이 친다.
  const paneScrollTo = (to) => p.evaluate((v) => {
    const pane = document.querySelector("#me .pane");
    if (!pane) return -1;
    pane.scrollTop = v < 0 ? pane.scrollHeight : v;
    pane.dispatchEvent(new Event("scroll"));
    return Math.round(pane.scrollTop);
  }, to);
  /* 화소로 묻는다. 신호가 DOM에만 있고 화소를 하나도 안 옮기면 위의 축들은 빈 초록이다.
     같은 자리를 두 번 찍는다. 한 번은 그대로, 한 번은 신호를 걷고. 세 채널 중 가장 큰 차가
     8을 넘은 화소를 센다. 8은 글자 가장자리가 배경과 섞이며 흔들리는 폭보다 크다.
     자르는 자리를 화면 안으로 물린다. 창 밖을 자르면 찍기가 통째로 죽어 축이 아니라 계기가 운다.
     화면 높이는 부르는 쪽이 넘긴다. 이 자는 1280x720과 740x360 둘에서 도는데, 한 곳에 박아 두면
     좁은 화면에서 창 밖을 자르게 된다. */
  const paneShot = async (c, vh) => {
    const y = Math.max(0, c.bottom - c.down.h);
    const h = Math.max(1, Math.min(c.down.h, vh - y));
    return (await p.screenshot({ clip: { x: Math.max(0, c.left), y, width: c.w, height: h } })).toString("base64");
  };
  const paneMoved = async (a, z) => p.evaluate(([s1, s2, tol]) => new Promise((res) => {
    const load = (s) => new Promise((r2) => { const im = new Image(); im.onload = () => r2(im); im.src = "data:image/png;base64," + s; });
    Promise.all([load(s1), load(s2)]).then(([ia, ib]) => {
      const cv = document.createElement("canvas");
      cv.width = ia.width; cv.height = ia.height;
      const g = cv.getContext("2d");
      g.drawImage(ia, 0, 0);
      const da = g.getImageData(0, 0, ia.width, ia.height).data;
      g.clearRect(0, 0, cv.width, cv.height);
      g.drawImage(ib, 0, 0);
      const db = g.getImageData(0, 0, ia.width, ia.height).data;
      let n = 0;
      for (let i = 0; i < da.length; i += 4) {
        if (Math.max(Math.abs(da[i] - db[i]), Math.abs(da[i + 1] - db[i + 1]), Math.abs(da[i + 2] - db[i + 2])) > tol) n += 1;
      }
      res({ moved: n, all: da.length / 4 });
    });
  }), [a, z, CUE_TOL]);

  /* 같은 물음을 창에 대고 다시 묻는 자. 세로가 짧은 화면에서는 구르는 것이 칸이 아니라 창이라,
     신호도 칸이 아니라 창에 붙는다. 신호를 자식으로 좁히는 이유는 창 안에 칸의 신호가 같이
     들어 있어, 안 좁히면 창의 신호 대신 칸의 것을 읽기 때문이다. 아래끝은 창 상자와 화면 중
     위엣것을 쓴다. 화면 밖으로 내려간 상자 끝을 그대로 자르면 찍기가 죽는다. */
  const panelCue = () => p.evaluate(() => {
    const box = document.getElementById("me");
    if (!box) return null;
    const r = box.getBoundingClientRect();
    const seat = (sel) => {
      const e = box.querySelector(":scope > " + sel);
      if (!e) return null;
      const q = e.getBoundingClientRect();
      return { h: Math.round(q.height), w: Math.round(q.width), bottom: Math.round(q.bottom),
        left: Math.round(q.left), op: Number(getComputedStyle(e).opacity) };
    };
    return { over: Math.round(box.scrollHeight - box.clientHeight), at: Math.round(box.scrollTop),
      bottom: Math.min(Math.round(r.bottom), window.innerHeight), left: Math.max(0, Math.round(r.left)),
      w: Math.round(r.width), down: seat(".cue.down"), up: seat(".cue.up") };
  });
  const panelShot = async (c) => {
    const y = Math.max(0, c.bottom - c.down.h);
    const h = Math.max(1, Math.min(c.down.h, 360 - y));
    return (await p.screenshot({ clip: { x: c.left, y, width: c.w, height: h } })).toString("base64");
  };
  const panelScrollTo = (to) => p.evaluate((v) => {
    const box = document.getElementById("me");
    if (!box) return -1;
    box.scrollTop = v < 0 ? box.scrollHeight : v;
    box.dispatchEvent(new Event("scroll"));
    return Math.round(box.scrollTop);
  }, to);

  /* 셋 다 센 것을 같이 찍는다. 신호가 통째로 없으면 실패 목록이 비어서, 앞 축에서 걸러진 칸을
     뒤 축은 잰 적도 없이 초록으로 넘긴다. 그래서 넘친 수와 잰 수를 나란히 적는다. */
  const cueless = [], offSeat = [], noFlip = [], dull = [], stuck = [], overTally = [];
  let overflowing = 0, seated = 0, pixels = 0, flips = 0, fitted = 0, worst = 1;
  for (const id of TABS) {
    await p.click('#me .tab[data-tab="' + id + '"]', { force: true });
    await p.waitForTimeout(240);
    await paneScrollTo(0);
    await p.waitForTimeout(90);
    const c = await paneCue();
    if (!c) { cueless.push(id + " no pane"); continue; }
    overTally.push(id + " " + c.over);
    /* 대조군. 안 넘치는 칸은 신호를 안 켠다. 늘 켜 두는 그늘은 마지막 줄을 영원히 흐리게 두고,
       그때 이 신호는 더 있다는 뜻을 잃는다. */
    if (c.over <= 1) {
      fitted += 1;
      if (!c.down) stuck.push(id + " no cue element");
      else if (c.down.op > 0) stuck.push(id + " opacity " + c.down.op);
      continue;
    }
    overflowing += 1;
    if (!c.down || c.down.h < 1 || c.down.op < 1) {
      cueless.push(id + " " + (c.down ? c.down.h + "px opacity " + c.down.op : "no .cue.down"));
      continue;
    }
    seated += 1;
    if (Math.abs(c.down.bottom - c.bottom) > 1 || Math.abs(c.down.w - c.w) > 2) {
      offSeat.push(id + " cue bottom " + c.down.bottom + " width " + c.down.w + ", pane bottom " + c.bottom + " width " + c.w);
    }
    const on = await paneShot(c, 720);
    /* 칸의 신호만 걷는다. 창에도 같은 클래스가 붙으므로 좁히지 않으면 화면에 걸린 신호가 같이 걷히고,
       그러면 이 축이 무엇을 재고 있는지가 흐려진다. */
    await p.evaluate(() => { const e = document.querySelector("#me .panebox .cue.down"); if (e) e.style.display = "none"; });
    await p.waitForTimeout(70);
    const off = await paneShot(c, 720);
    await p.evaluate(() => { const e = document.querySelector("#me .panebox .cue.down"); if (e) e.style.display = ""; });
    await p.waitForTimeout(70);
    const m = await paneMoved(on, off);
    pixels += 1;
    const share = m.moved / m.all;
    if (share < worst) worst = share;
    if (share < CUE_FLOOR) dull.push(id + " " + (share * 100).toFixed(1) + "% of " + m.all + "px");
    await paneScrollTo(-1);
    await p.waitForTimeout(120);
    const e2 = await paneCue();
    flips += 1;
    const turned = e2 && e2.down && e2.up && e2.down.op === 0 && e2.up.op === 1;
    if (!turned) noFlip.push(id + " " + (e2 && e2.down ? "down " + e2.down.op + " up " + (e2.up ? e2.up.op : "none") : "no cue"));
  }
  check("mepane:an-overflowing-pane-paints-a-bottom-cue", overflowing > 0 && cueless.length === 0,
    cueless.slice(0, 3).join(", ") || overflowing + " overflowing panes at 1280x720, every one cued, hidden px " + overTally.join(" "));
  check("mepane:the-cue-sits-on-the-pane-bottom-edge", overflowing > 0 && seated === overflowing && offSeat.length === 0,
    offSeat.slice(0, 2).join(", ") || seated + " of " + overflowing + " cues flush with the pane box");
  check("mepane:the-cue-flips-when-the-pane-hits-the-bottom", overflowing > 0 && flips === overflowing && noFlip.length === 0,
    noFlip.slice(0, 3).join(", ") || flips + " of " + overflowing + " panes flip the cue to the top edge at max scroll");
  check("mepane:the-cue-moves-real-pixels", overflowing > 0 && pixels === overflowing && dull.length === 0,
    dull.slice(0, 3).join(", ") || pixels + " of " + overflowing + " strips compared, weakest "
      + (pixels ? (worst * 100).toFixed(1) + "%" : "nothing") + " of pixels moved, floor " + (CUE_FLOOR * 100).toFixed(0) + "%");
  check("control:a-pane-that-fits-paints-no-cue", fitted > 0 && stuck.length === 0,
    stuck.slice(0, 3).join(", ") || (fitted
      ? fitted + " of three panes fit at 1280x720 and none paints a cue"
      : "no pane fits at 1280x720 for this account, hidden px " + overTally.join(" ")));
  /* 넓은 화면에서 창이 든 신호. 여기서는 칸이 구르므로 창의 신호는 꺼져 있어야 한다.
     아래 좁은 화면 대조군이 이 값을 그대로 읽는다. */
  await p.click('#me .tab[data-tab="log"]', { force: true });
  await p.waitForTimeout(240);
  const wideSeen = { panel: await panelCue(), pane: await paneCue() };
  await p.evaluate(() => window.__me(false));

  /* 선수단. 골키퍼 하나와 필드 셋은 다른 질문이라 한 목록에 못 섞는다. 탭이 갈렸다는 주장은
     탭을 눌러도 같은 카드가 서 있으면 거짓이고, 지금 어느 탭인지는 색이 아니라 상태로 서야 한다. */
  await p.evaluate(() => window.__roster(true));
  await p.waitForSelector("#roster .kind", { timeout: 8000 });
  await p.waitForTimeout(400);
  const rosterRead = () => p.evaluate(() => {
    const box = document.getElementById("roster");
    const key = (e) => (e.dataset.at !== undefined ? "at:" + e.dataset.at
      : e.dataset.n !== undefined ? "n:" + e.dataset.n
        : e.dataset.kick !== undefined ? "k:" + e.dataset.kick
          : e.dataset.buy !== undefined ? "b:" + e.dataset.buy : "?");
    return {
      kinds: [...box.querySelectorAll(".kind")].map((e) => ({
        pos: e.dataset.pos,
        sel: e.getAttribute("aria-selected"),
        // 강조는 그려진 색으로 잰다. aria만 재면 규칙이 통째로 안 걸린 날에도 초록이 난다.
        bg: getComputedStyle(e).backgroundColor,
        icon: e.querySelectorAll("svg").length,
        text: (e.querySelector("span") || e).textContent.trim()
      })),
      keys: [...box.querySelectorAll(".row button")].map(key),
      cards: [...box.querySelectorAll(".row button")].map((e) => {
        const im = e.querySelector("img");
        return {
          face: im ? im.naturalWidth : 0,
          name: e.querySelector(".nm") ? e.querySelector(".nm").textContent.trim() : "",
          em: e.querySelector("em") ? e.querySelector("em").textContent.trim() : "",
          tag: e.querySelector(".tag") ? e.querySelector(".tag").textContent.trim() : "",
          px: e.querySelectorAll(".px").length,
          buy: e.dataset.n !== undefined || e.dataset.buy !== undefined
        };
      })
    };
  });
  const board = {};
  for (const pos of POS) {
    await p.click('#roster .kind[data-pos="' + pos + '"]', { force: true });
    await p.waitForTimeout(260);
    board[pos] = await rosterRead();
  }
  check("instrument:the-four-position-tabs-were-found",
    POS.every((pos) => board[pos].kinds.length === 4 && board[pos].kinds.map((k) => k.pos).join(",") === POS.join(",")),
    board[POS[0]].kinds.map((k) => k.pos + "/" + k.text).join(", ") || "no tabs");
  check("roster:the-open-position-is-marked-on-the-tab-itself",
    POS.every((pos) => board[pos].kinds.filter((k) => k.sel === "true").length === 1
      && board[pos].kinds.find((k) => k.sel === "true").pos === pos
      && board[pos].kinds.filter((k) => k.sel === "false").length === 3),
    POS.map((pos) => pos + " -> " + board[pos].kinds.map((k) => k.sel).join("/")).join(", "));
  check("roster:every-position-tab-carries-an-icon-and-a-short-name",
    board[POS[0]].kinds.every((k) => k.icon === 1 && k.text.length > 0 && k.text.length <= 2),
    board[POS[0]].kinds.map((k) => k.text + "(" + k.icon + ")").join(", "));
  const sets = POS.map((pos) => board[pos].keys.join(","));
  const clashes = [];
  for (let i = 0; i < POS.length; i += 1) {
    if (!board[POS[i]].keys.length) clashes.push(POS[i] + ":empty");
    for (let j = i + 1; j < POS.length; j += 1) if (sets[i] === sets[j]) clashes.push(POS[i] + "=" + POS[j]);
  }
  check("roster:switching-a-position-changes-the-card-set", clashes.length === 0,
    clashes.length ? clashes.join(", ") : POS.map((pos) => pos + " " + board[pos].keys.length).join(", "));
  const flat = [];
  for (const pos of POS) for (const c of board[pos].cards) flat.push({ pos, c });
  const blind = flat.filter((x) => !(x.c.face > 0));
  const nameless = flat.filter((x) => !x.c.name);
  const stateless = flat.filter((x) => (x.c.buy ? x.c.px === 0 : x.c.tag === ""));
  check("roster:every-card-leads-with-a-face-then-the-name-and-the-state",
    flat.length > 0 && blind.length === 0 && nameless.length === 0 && stateless.length === 0,
    flat.length + " cards, " + blind.length + " faceless, " + nameless.length + " nameless, "
    + stateless.length + " without a state or a price"
    + (stateless.length ? " first " + stateless[0].pos + " " + JSON.stringify(stateless[0].c) : ""));
  /* 강조. 열린 탭이 나머지 셋과 다른 색으로 서 있는가. 이 랩에서 통째로 빠졌던 자리다.
     규칙 다섯이 다른 규칙 안에 갇힌 채 실려 나갔고, aria만 재던 자는 그 상태로도 초록을 냈다.
     실측으로 그때 열린 탭과 닫힌 탭의 배경이 둘 다 rgb(240,240,240)이었다. */
  const paint = POS.map((pos) => {
    const on = board[pos].kinds.find((k) => k.sel === "true");
    const off = board[pos].kinds.filter((k) => k.sel !== "true").map((k) => k.bg);
    return { pos, on: on ? on.bg : "none", off,
      ok: Boolean(on) && off.length === 3 && off.every((c) => c !== on.bg) };
  });
  check("roster:the-open-position-is-painted-apart-from-the-shut-ones", paint.every((r) => r.ok),
    paint.map((r) => r.pos + " " + r.on + " against " + (r.off[0] || "none")).join(", "));

  /* 대조군. 창을 닫고 다시 열면 골키퍼 칸이다. 내 정보의 칸이 이미 같은 규칙을 쓰고 있고,
     남겨 두면 다음에 연 사람이 남의 포지션을 먼저 보고 자기 키퍼를 찾으러 탭을 눌러야 한다. */
  await p.click('#roster .kind[data-pos="' + POS[3] + '"]', { force: true });
  await p.waitForTimeout(220);
  await p.evaluate(() => { window.__roster(false); window.__roster(true); });
  await p.waitForTimeout(400);
  const back = await rosterRead();
  const open = back.kinds.filter((k) => k.sel === "true").map((k) => k.pos);
  check("control:reopening-the-squad-lands-on-the-keeper-tab", open.join("") === POS[0],
    "shut on " + POS[3] + ", opened on " + (open.join("/") || "none") + " with " + back.keys.length + " cards");

  /* 손가락 바닥. 초상화 버튼이 이미 44px을 쓰고 탭만 그 아래였다(실측 39px과 41px).
     좁은 화면에서 재는 이유는 탭 높이가 글자 토큰을 타고 화면 폭을 따라 줄기 때문이다. */
  const TOUCH = 44;
  await p.setViewportSize({ width: 740, height: 360 });
  await p.waitForTimeout(450);
  const kindH = await p.evaluate(() => [...document.querySelectorAll("#roster .kind")]
    .map((e) => Math.round(e.getBoundingClientRect().height)));
  await p.evaluate(() => { window.__roster(false); window.__me(true); });
  await p.waitForTimeout(450);
  const tabH = await p.evaluate(() => [...document.querySelectorAll("#me .tab")]
    .map((e) => Math.round(e.getBoundingClientRect().height)));
  await p.evaluate(() => window.__me(false));
  const floor = kindH.concat(tabH);
  check("layout:every-tab-clears-the-touch-floor-at-740x360",
    floor.length === 7 && floor.every((v) => v >= TOUCH),
    "position tabs " + kindH.join("/") + ", profile tabs " + tabH.join("/") + " against " + TOUCH + "px");

  /* 좁고 낮은 화면. 여기서 구르는 것은 칸이 아니라 창이다. 상한을 걷은 자리라 칸은 제 높이를 다 쓰고,
     넘치는 만큼을 창이 받는다. 그래서 칸에 붙은 신호는 꺼진 채가 맞고, 그 상태로 두면 화면에는
     아래에 더 있다는 말이 한 군데도 안 남는다. 실측으로 전적 칸에서 최근 목록이 화면 밖으로 흐르고
     상대 전적 표는 그보다 400px 아래에 있었다. 그래서 같은 물음을 창에 대고 다시 묻는다. */
  await p.evaluate(() => window.__me(true));
  await p.click('#me .tab[data-tab="log"]', { force: true });
  await p.waitForTimeout(320);
  await panelScrollTo(0);
  await p.waitForTimeout(120);
  const narrow = await panelCue();
  const narrowPane = await paneCue();
  const panelSeated = Boolean(narrow) && narrow.over > 1 && Boolean(narrow.down)
    && narrow.down.h >= 1 && narrow.down.op === 1;
  const panelFlush = panelSeated && Math.abs(narrow.down.bottom - narrow.bottom) <= 1;
  check("mepane:the-panel-cues-what-overflows-at-740x360", panelSeated && panelFlush,
    narrow
      ? "panel hides " + narrow.over + "px, cue "
        + (narrow.down ? narrow.down.h + "px opacity " + narrow.down.op + " bottom " + narrow.down.bottom : "none")
        + ", panel visible bottom " + narrow.bottom
      : "no panel");

  /* 화소. 창의 신호도 DOM에만 있으면 위의 축이 빈 초록이다. 칸에 쓴 그 자를 그대로 쓰되
     화면 높이만 360으로 넘긴다. 걷는 것도 창의 신호 하나로 좁힌다. */
  let panelShare = -1;
  if (panelSeated) {
    const on = await panelShot(narrow);
    await p.evaluate(() => { const e = document.querySelector("#me > .cue.down"); if (e) e.style.display = "none"; });
    await p.waitForTimeout(70);
    const off = await panelShot(narrow);
    await p.evaluate(() => { const e = document.querySelector("#me > .cue.down"); if (e) e.style.display = ""; });
    await p.waitForTimeout(70);
    const m = await paneMoved(on, off);
    panelShare = m.moved / m.all;
  }
  check("mepane:the-panel-cue-moves-real-pixels-at-740x360", panelShare >= CUE_FLOOR,
    panelShare < 0 ? "no panel cue to compare"
      : (panelShare * 100).toFixed(1) + "% of the bottom strip moved, floor " + (CUE_FLOOR * 100).toFixed(0) + "%");

  /* 끝까지 굴린다. 아래끝 신호가 꺼지고 위끝 신호가 켜져야 한다. 안 뒤집히면 이 겹은 상태가 아니라
     늘 켜 둔 장식이고, 그때 마지막 줄만 영원히 흐려진다. */
  await panelScrollTo(-1);
  await p.waitForTimeout(150);
  const narrowEnd = await panelCue();
  const flipped = Boolean(narrowEnd) && Boolean(narrowEnd.down) && Boolean(narrowEnd.up)
    && narrowEnd.down.op === 0 && narrowEnd.up.op === 1;
  check("mepane:the-panel-cue-flips-at-the-bottom-at-740x360", flipped,
    narrowEnd && narrowEnd.down
      ? "at " + narrowEnd.at + " of " + narrowEnd.over + " down " + narrowEnd.down.op
        + " up " + (narrowEnd.up ? narrowEnd.up.op : "none")
      : "no panel cue at max scroll");

  /* 대조군. 구르는 상자만 신호를 켠다. 좁은 화면에서는 창이 구르고 칸은 안 구르며,
     넓은 화면에서는 그 반대다. 한쪽만 재면 늘 켜 둔 신호 둘로도 위의 축이 통과한다. */
  const narrowSplit = Boolean(narrowPane) && Boolean(narrowPane.down) && narrowPane.down.op === 0 && panelSeated;
  const wideSplit = Boolean(wideSeen.panel) && Boolean(wideSeen.pane) && Boolean(wideSeen.pane.down)
    && wideSeen.pane.down.op === 1 && (!wideSeen.panel.down || wideSeen.panel.down.op === 0);
  check("control:only-the-scrolling-box-cues-at-740x360", narrowSplit && wideSplit,
    "740x360 pane cue " + (narrowPane && narrowPane.down ? narrowPane.down.op : "none")
    + " panel cue " + (narrow && narrow.down ? narrow.down.op : "none")
    + ", 1280x720 pane cue " + (wideSeen.pane && wideSeen.pane.down ? wideSeen.pane.down.op : "none")
    + " panel cue " + (wideSeen.panel && wideSeen.panel.down ? wideSeen.panel.down.op : "none")
    + " over " + (wideSeen.panel ? wideSeen.panel.over : "?"));

  /* 6.5 (b). 창은 inset:0으로 화면을 덮고 첫 단은 그 창의 맨 위다. 세로 360px에서는 그 맨 위가
     재화 띠와 같은 자리라, 실측으로 초상과 이름이 띠 아래끝 66.2px보다 61.8px 위에서 시작해
     스폰 칩을 통째로 덮었다. 그 칸 한가운데에서 elementFromPoint가 첫 단을 냈으므로, 셋째 재화는
     창이 열려 있는 동안 읽을 수 없다.
     묻는 것은 둘이다. 자리로 물어 첫 단이 띠 아래에서 시작하는가, 화소로 물어 띠 위에 창의
     잉크가 한 점도 없는가. 화소는 창을 연 화면과 창의 내용만 걷은 화면을 견준다. 창을 닫은
     화면과 견주면 창 바탕의 어둠과 그 겹이 칩 글자의 가장자리를 통째로 흔들어, 첫 단이 띠를
     완전히 비켜선 자리에서도 실측 21042px 중 1069px이 달라진다. 그 5%는 첫 단이 아니라 겹이다.
     굴림값 0에서 잰다. 첫 단은 두루마리의 첫 줄이라 굴려 둔 창에서는 화면 밖에 있고, 그 자리를
     재면 이 축이 가장 나쁜 자리를 안 보고 지나간다. */
  const STRIP_FLOOR = 0.005;
  await panelScrollTo(0);
  await p.waitForTimeout(140);
  await standDown(true);
  await p.waitForTimeout(200);
  const stripTop = await inkBox("#top");
  const stripHead = await inkBox("#me h4");
  const stripClip = inkClip(stripTop, 740, 360);
  const stripOn = await inkShot(stripClip);
  const stripOn2 = await inkShot(stripClip);
  await p.evaluate(() => { for (const e of document.querySelectorAll("#me > *")) e.style.visibility = "hidden"; });
  await p.waitForTimeout(90);
  const stripBare = await inkShot(stripClip);
  await p.evaluate(() => { for (const e of document.querySelectorAll("#me > *")) e.style.visibility = ""; });
  await standDown(false);
  await p.waitForTimeout(90);
  const stripStill = await inkMoved(stripOn, stripOn2);
  const stripInk = await inkMoved(stripOn, stripBare);
  const stripShare = stripInk.moved / stripInk.all;
  check("mepane:the-header-clears-the-resource-strip-at-740x360",
    stripTop.b <= stripHead.t && stripShare <= STRIP_FLOOR && stripStill.moved === 0,
    "the strip ends at " + stripTop.b + " and the header starts at " + stripHead.t + ", "
    + stripInk.moved + "px of " + stripInk.all + " = " + (100 * stripShare).toFixed(2)
    + "% of the strip carries panel ink, floor " + (100 * STRIP_FLOOR).toFixed(1)
    + "%, a still frame moves " + stripStill.moved + "px");
  await p.evaluate(() => window.__me(false));

  /* 일반 앱 UX 문법 둘. 위의 축들은 이 게임의 장부와 성장 칸을 알아야 읽히지만, 아래 둘은 어느 앱의
     프로필이든 같은 것을 묻는다. 표면마다 도메인 축 옆에 같은 문법을 세운다는 래칫의 요구다.
     하나. 같은 종류의 칸은 같은 표기다. 머리의 큰 수 셋은 한 줄에 나란히 선 같은 종류이고, 성장 칸
     열다섯도 서로 같은 종류다. 무리 안에서 글꼴이 갈리면 한 수가 다른 층의 것으로 읽히고, 값 자리에
     낱말이 서면 그 칸만 다른 문법이 된다. 세이브율의 %는 그 수의 단위라 값의 일부이고, 그것을 빼면
     막은 수와 같은 모양이다. 성장 칸은 단위가 없으므로 숫자만 선다.
     둘. 상태를 바꾸는 조작이 그 상태가 사는 동안 내내 열려 있다. 칸을 끝까지 굴린 자리에서도 탭 셋은
     그대로 눌려야 한다. 묻는 것은 disabled 하나가 아니라 화면이 실제로 그 누름을 받는가이므로
     elementFromPoint로 그 칸이 맨 앞인지까지 보고, 실제로 눌러 칸이 바뀌는 것까지 본다.
     접힌 이름 문법은 이 표면에 안 선다. 성장 칸 이름은 1280x720에서도 740x360에서도 두 줄로 안 접히고,
     수는 이름 옆이 아니라 이름 아래 칸에 서는 구조다. 접힌 이름이 표본에 없으므로 그 축을 세우지 않고,
     대신 두 폭에서 센 줄 수를 아래 표본 줄이 적는다. */
  const uxSlots = () => {
    const font = (e) => { const s = getComputedStyle(e); return [s.fontFamily.split(",")[0], s.fontSize, s.fontWeight, s.fontStyle, s.letterSpacing].join("|"); };
    const box = document.getElementById("me");
    const big = [...box.querySelectorAll(".big span")].map((s) => {
      const v = s.querySelector("b");
      return { where: "big", text: v ? v.textContent.trim() : "", font: v ? font(v) : "none",
        label: (s.querySelector("i") || {}).textContent || "" };
    });
    const grid = [...box.querySelectorAll(".grid > span")].map((s) => {
      const v = s.querySelector("b");
      const n = s.querySelector("span");
      return { where: "grid", text: v ? v.textContent.trim() : "", font: v ? font(v) : "none",
        label: n ? n.textContent.trim() : "" };
    });
    return { big: big, grid: grid };
  };
  const uxNames = () => [...document.querySelectorAll("#me .grid > span")].map((s) => {
    const n = s.querySelector("span");
    if (!n) return 0;
    return Math.round(n.getBoundingClientRect().height / parseFloat(getComputedStyle(n).lineHeight));
  });
  const uxTabState = () => [...document.querySelectorAll("#me .tabs .tab")].map((t) => {
    const q = t.getBoundingClientRect();
    const mid = document.elementFromPoint(q.x + q.width / 2, q.y + q.height / 2);
    return { k: t.dataset.tab, off: t.disabled, pe: getComputedStyle(t).pointerEvents,
      cur: t.getAttribute("aria-current") === "true", hit: mid === t || (mid && t.contains(mid)),
      w: Math.round(q.width), h: Math.round(q.height) };
  });
  // 값 자리의 모양 둘. 셈은 숫자만, 비율은 그 뒤에 단위 한 글자. 낱말이 서면 둘 다 안 맞는다.
  const UX_TALLY = /^[0-9]{1,3}(,[0-9]{3})*$/;
  const UX_RATE = /^[0-9]{1,3}(,[0-9]{3})*%$/;
  const uxFormat = (slots) => {
    const faces = (rs) => [...new Set(rs.map((r) => r.font))];
    const bigOdd = slots.big.filter((r) => !(UX_TALLY.test(r.text) || UX_RATE.test(r.text)));
    const gridOdd = slots.grid.filter((r) => !UX_TALLY.test(r.text));
    return { bigFaces: faces(slots.big), gridFaces: faces(slots.grid), bigOdd: bigOdd, gridOdd: gridOdd,
      ok: slots.big.length === 3 && slots.grid.length > 0 && faces(slots.big).length === 1
        && faces(slots.grid).length === 1 && bigOdd.length === 0 && gridOdd.length === 0 };
  };
  const uxDeaf = (ts) => ts.filter((t) => t.off || t.pe === "none" || !t.hit || t.w < 1 || t.h < 1);

  await p.evaluate(() => window.__me(true));
  await p.waitForTimeout(460);
  const uxNarrow = await p.evaluate(uxSlots);
  const uxNarrowRows = await p.evaluate(uxNames);
  await p.setViewportSize({ width: 1280, height: 720 });
  await p.waitForTimeout(460);
  const uxWide = await p.evaluate(uxSlots);
  const uxWideRows = await p.evaluate(uxNames);
  const uxFmt = uxFormat(uxWide);
  const uxFmtNarrow = uxFormat(uxNarrow);
  check("ux:the-numbers-of-one-kind-read-one-format", uxFmt.ok && uxFmtNarrow.ok,
    uxFmt.bigOdd.length || uxFmt.gridOdd.length
      ? uxFmt.bigOdd.concat(uxFmt.gridOdd).map((r) => r.where + " " + r.label + " draws " + JSON.stringify(r.text)).join(", ")
      : uxFmt.bigFaces.length > 1 || uxFmt.gridFaces.length > 1
        ? "the three big numbers carry " + uxFmt.bigFaces.length + " faces and the " + uxWide.grid.length
          + " growth slots " + uxFmt.gridFaces.length
        : uxWide.big.map((r) => r.text).join("/") + " on one face " + uxFmt.bigFaces[0] + ", "
          + uxWide.grid.length + " growth values " + uxWide.grid.map((r) => r.text).join(" ")
          + " on " + uxFmt.gridFaces[0] + ", both viewports");
  /* 대조군 둘. 큰 수 하나의 글꼴을 줄이면 머리 셋이 두 표기로 갈리고, 성장 칸 하나에 낱말을 심으면
     값 자리에 값이 아닌 것이 선다. 둘 다 위 축을 빨갛게 만들어야 한다. 심고 곧바로 도로 뺀다. */
  await p.evaluate(() => { document.querySelector("#me .big span b").style.fontSize = "13px"; });
  const uxSmall = uxFormat(await p.evaluate(uxSlots));
  await p.evaluate(() => { document.querySelector("#me .big span b").style.fontSize = ""; });
  await p.evaluate(() => { const e = document.querySelector("#me .grid > span b"); e.dataset.was = e.textContent; e.textContent = "MAX"; });
  const uxWord = uxFormat(await p.evaluate(uxSlots));
  await p.evaluate(() => { const e = document.querySelector("#me .grid > span b"); e.textContent = e.dataset.was; delete e.dataset.was; });
  const uxBack = uxFormat(await p.evaluate(uxSlots));
  check("control:a-shrunk-number-and-a-worded-slot-redden-the-format-axis",
    uxSmall.ok === false && uxWord.ok === false && uxBack.ok === uxFmt.ok,
    "13px on a big number caught " + (uxSmall.ok === false) + ", a word in a growth slot caught "
    + (uxWord.ok === false) + ", restored to " + uxBack.ok);

  /* 굴린 자리에서 탭이 살아 있는가. 칸을 끝까지 밀고 나서 묻는다. 굴린 뒤에 죽는 탭은 사람이 위로
     되감아야 겨우 눌리는 탭이고, 그 되감기는 화면 어디에도 안 적혀 있다. */
  const uxRolled = await p.evaluate(() => {
    const e = document.querySelector("#me .pane");
    if (!e) return -1;
    e.scrollTop = e.scrollHeight;
    e.dispatchEvent(new Event("scroll"));
    return Math.round(e.scrollTop);
  });
  await p.waitForTimeout(240);
  const uxTabs = await p.evaluate(uxTabState);
  const uxNumb = uxDeaf(uxTabs);
  const uxWas = await p.evaluate(() => (document.querySelector("#me .pane").textContent || "").slice(0, 40));
  await p.locator('#me .tabs .tab[data-tab="log"]').click({ timeout: 4000 }).catch(() => {});
  await p.waitForTimeout(320);
  const uxMoved = await p.evaluate(() => ({
    cur: [...document.querySelectorAll("#me .tabs .tab")].filter((t) => t.getAttribute("aria-current") === "true").map((t) => t.dataset.tab).join(","),
    body: (document.querySelector("#me .pane").textContent || "").slice(0, 40) }));
  check("ux:the-tabs-stay-live-while-the-pane-scrolls",
    uxNumb.length === 0 && uxRolled > 0 && uxMoved.cur === "log" && uxMoved.body !== uxWas,
    uxNumb.length ? uxNumb.map((t) => t.k + " off " + t.off + " pointer " + t.pe + " hit " + t.hit).join(", ")
      : "the pane scrolled to " + uxRolled + " and all " + uxTabs.length
        + " tabs stayed hit-testable, then the record tab swapped the pane");
  // 대조군. 굴린 자리에서 탭 줄이 누름을 안 받게 심으면 위 축이 빨개져야 한다.
  await p.evaluate(() => { document.querySelector("#me .tabs").style.pointerEvents = "none"; });
  await p.waitForTimeout(160);
  const uxDead = uxDeaf(await p.evaluate(uxTabState));
  await p.evaluate(() => { document.querySelector("#me .tabs").style.pointerEvents = ""; });
  await p.waitForTimeout(160);
  const uxAlive = uxDeaf(await p.evaluate(uxTabState));
  check("control:a-tab-row-that-takes-no-pointer-reddens-the-live-axis",
    uxDead.length === uxTabs.length && uxAlive.length === 0,
    "planting pointer-events none killed " + uxDead.length + " of " + uxTabs.length + " tabs, restored to "
    + (uxTabs.length - uxAlive.length) + " live");
  await p.evaluate(() => window.__me(false));

  check("console:no-errors", errs.length === 0, errs.slice(0, 2).join(" | ") || "clean");
  await ctx.close();

  console.log("표본 범위: 내 정보 칸 셋 + 선수단 포지션 넷, 1280x720과 740x360 두 화면. 접힌 이름 문법은 이 표면에 안 선다: 성장 칸 이름이 두 줄로 선 것이 740x360에서 "
    + uxNarrowRows.filter((n) => n >= 2).length + "개, 1280x720에서 " + uxWideRows.filter((n) => n >= 2).length + "개다");
  if (notes.length) console.log(notes.map((x) => "  ok   " + x).join(LINE));
  if (fails.length) console.log(fails.map((x) => "  FAIL " + x).join(LINE));
  console.log(fails.length ? "mepane FAIL " + fails.length : "mepane PASS " + notes.length);
  if (fails.length) process.exitCode = 1;
} finally {
  clearTimeout(t);
  if (b) await b.close();
}
