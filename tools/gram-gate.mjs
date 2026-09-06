import { chromium } from "playwright";
import { pinClock } from "./clock.mjs";

// 아웃문그램과 키커별 상대 전적은 화면에 선 지 오래인데 재는 자가 없었다.
// 두 창 다 장부를 옮겨 그리는 창이라, 옮기는 도중에 어긋나면 화면만 조용히 거짓말을 한다.
// 그래서 묻는 것은 창이 열리는가가 아니라 창이 말한 수가 장부의 수와 같은가이다.
// 읽는 화면: 피드는 #gram의 .post 카드이고, 상대 전적은 #me의 .tab[data-tab="log"]을 눌러
// 여는 #me .pane table이다. 줄은 tbody tr 하나, 칸은 넷(초상 td img | 이름 | em 막은 | i 먹힌)이다.

const EXE = process.env.LOCALAPPDATA + "/ms-playwright/chromium-1228/chrome-win64/chrome.exe";
// 신규 키퍼로 돌리면 다섯 판이 전부 실점이라 먹힌 글의 표시가 갈리는지를 못 묻는다.
// 만렙으로 돌려 선방과 실점이 둘 다 나오게 하고, 둘 다 나왔는지를 축으로 말한다.
const BASE = "http://127.0.0.1:10310/web/index.html?seed=20&preset=maxed,veteran";
const LINE = String.fromCharCode(10);
// 판을 도는 창은 프레임으로 센다. 잠으로 세면 기계가 바쁜 날 구가 덜 돌아 표본이 빈다.
const STEP = 1 / 60;
const ROUND_FRAMES = 60 * 60;
const t = setTimeout(() => { console.log("WATCHDOG"); process.exit(1); }, 240000);
t.unref();

const fails = [], notes = [];
const check = (n, ok, d) => (ok ? notes : fails).push(n + " " + d);

let b;
try {
  b = await chromium.launch({ executablePath: EXE });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } });
  await pinClock(ctx, STEP);
  const p = await ctx.newPage();
  const errs = [];
  p.on("pageerror", (e) => errs.push(String(e)));
  p.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
  await p.goto(BASE, { waitUntil: "load" });
  await p.evaluate(() => localStorage.clear());
  await p.reload({ waitUntil: "load" });
  await p.waitForSelector("#go", { timeout: 15000 });
  await p.click("#go", { force: true });

  // 대조군. 한 구도 안 돈 자리에서 피드는 비어 있어야 하고, 빈 이유를 자기 글자로 말해야 한다.
  await p.evaluate(() => window.__gram(true));
  await p.waitForTimeout(300);
  const empty = await p.evaluate(() => {
    const box = document.getElementById("gram");
    const posts = [...box.querySelectorAll(".post")];
    return { count: posts.length, empty: posts.filter((x) => x.classList.contains("empty")).length, says: (posts[0] ? posts[0].textContent : "").trim().length };
  });
  check("control:a-fresh-save-shows-the-empty-feed", empty.empty === 1 && empty.says > 0, "posts " + empty.count + " empty " + empty.empty + " chars " + empty.says);
  await p.evaluate(() => window.__gram(false));
  /* 창이 열려 있는 동안 조작 기둥은 화면 밖으로 물러난다. 닫자마자 누르면 그 버튼은 아직 밖이고,
     클릭이 뷰포트 밖이라 조용히 시간만 끌다 죽는다. 기둥이 돌아온 것을 보고 누른다. */
  await p.waitForFunction(() => document.getElementById('auto').getBoundingClientRect().left >= 0, null, { timeout: 5000 });

  // 판을 돈다. 손으로 치면 결과가 한쪽으로 쏠리므로 자동으로 두고, 크레딧을 먼저 채운다.
  await p.evaluate(() => { const bot = window.__bot(); bot.tier = 3; bot.ms = 3600000; });
  await p.click("#auto", { force: true });
  const from = await p.evaluate(() => window.__frames());
  await p.waitForFunction((n) => window.__frames() >= n, from + ROUND_FRAMES, { timeout: 90000 });

  // 읽는 동안에도 판은 계속 돌아서, 장부를 먼저 읽고 피드를 나중에 읽으면 한 판이 어긋난다.
  // 실측으로 장부는 일곱이고 피드는 여섯이었다. 읽기 전에 세계를 멈춘다.
  await p.evaluate(() => window.__plan(0, null, window.__frames()));
  await p.waitForTimeout(120);
  const ledger = await p.evaluate(() => window.__record());
  const names = Object.keys(ledger);
  const saved = names.reduce((a, n) => a + ledger[n].saved, 0);
  const conceded = names.reduce((a, n) => a + ledger[n].conceded, 0);
  console.log("  ledger " + names.length + " kickers, saved " + saved + " conceded " + conceded);
  check("control:the-window-actually-played", saved + conceded >= 3, saved + conceded + " rounds landed");
  check("instrument:both-outcomes-occurred", saved > 0 && conceded > 0, "saved " + saved + " conceded " + conceded);

  await p.evaluate(() => window.__gram(true));
  await p.waitForTimeout(320);
  const feed = await p.evaluate(() => {
    const box = document.getElementById("gram");
    return [...box.querySelectorAll(".post")].map((x) => ({
      bad: x.classList.contains("bad"),
      empty: x.classList.contains("empty"),
      name: (x.querySelector("b") ? x.querySelector("b").textContent : "").trim(),
      text: x.textContent.trim()
    }));
  });
  await p.evaluate(() => window.__gram(false));
  for (const f of feed.slice(0, 4)) console.log("  post " + (f.bad ? "bad " : "ok  ") + f.name + " | " + f.text.slice(0, 44));

  check("gram:rounds-leave-posts", feed.length > 0 && feed.every((f) => !f.empty), feed.length + " posts");
  const unknown = feed.filter((f) => !f.name || names.indexOf(f.name) < 0);
  check("gram:every-post-names-a-kicker-in-the-ledger", unknown.length === 0, unknown.map((f) => f.name || "(none)").join(",") || names.length + " kickers seen");
  // 장부는 판정이 나는 순간 오르고 글은 연출이 끝나야 올라간다. 그래서 어느 순간에 재도
  // 글이 장부보다 최대 한 판 뒤에 있다. 실측으로 장부 일곱에 글 여섯이었고 그것은 결함이 아니라
  // 두 수가 서로 다른 순간의 것이라는 뜻이다. 차이를 한 판까지 허용하고, 대신 이름별로 정확히 맞춘다.
  const inFlight = saved + conceded - feed.length;
  check("gram:a-post-per-round-with-one-in-flight", inFlight >= 0 && inFlight <= 1, feed.length + " posts, " + (saved + conceded) + " decided, " + inFlight + " still playing");
  // 이름별로는 글이 장부를 넘을 수 없다. 넘으면 없는 판의 글이 있다는 뜻이다.
  const over = names.filter((n) => feed.filter((f) => f.name === n).length > ledger[n].saved + ledger[n].conceded);
  check("gram:no-name-has-more-posts-than-rounds", over.length === 0, over.join(",") || names.length + " names within their counts");
  // 먹힌 글은 표시가 달라야 한다. 같은 모양이면 피드가 성적을 말하지 않는다.
  const badOver = names.filter((n) => feed.filter((f) => f.name === n && f.bad).length > ledger[n].conceded);
  check("gram:conceded-posts-are-marked", badOver.length === 0 && feed.filter((f) => f.bad).length >= conceded - 1, feed.filter((f) => f.bad).length + " marked vs " + conceded + " conceded");

  // 상대 전적은 내 정보 창이 그린다. 장부와 화면이 같은 수를 말하는지가 이 창의 전부다.
  await p.evaluate(() => window.__me(true));
  // 그 창은 이제 칸 셋으로 갈렸고 전적은 제 칸에 있다. 열지 않고 세면 0줄이 나오는데,
  // 그 0은 화면이 장부를 안 옮겼다는 뜻이 아니라 이 자가 다른 칸을 보고 있다는 뜻이다.
  await p.click('#me .tab[data-tab="log"]', { force: true });
  await p.waitForTimeout(320);
  /* 상대 전적은 이제 표다. 줄은 tbody tr 하나이고 칸은 넷이라, span 안의 b를 훑던 옛 읽기는
     표 앞에서 빈손으로 돌아온다. 칸을 그대로 읽는다. 초상은 구운 크기와 그려진 상자를 둘 다
     재는데, naturalWidth만 보면 규칙이 통째로 안 걸려 0px으로 선 그림도 제 크기를 내고 통과한다. */
  const readRows = () => p.evaluate(() => {
    const tb = document.querySelector("#me .pane table");
    if (!tb) return [];
    return [...tb.querySelectorAll("tbody tr")].map((tr) => {
      const td = [...tr.querySelectorAll("td")];
      const txt = (i, sel) => { const e = td[i] ? td[i].querySelector(sel) : null; return e ? e.textContent.trim() : ""; };
      const im = td[0] ? td[0].querySelector("img") : null;
      const box = im ? im.getBoundingClientRect() : null;
      return {
        name: td[1] ? td[1].textContent.trim() : "",
        nums: txt(2, "em") + "-" + txt(3, "i"),
        nat: im ? im.naturalWidth : 0,
        w: box ? Math.round(box.width) : 0
      };
    });
  });
  const rows = await readRows();
  /* 대조군. 같은 읽기를 능력치 칸에서 하면 한 줄도 안 나와야 한다. 거기서도 줄이 나오면 이 자는
     전적 칸을 연 것을 증명하지 못하고, 그 칸이 사라진 날에도 초록을 낸다. */
  await p.click('#me .tab[data-tab="stat"]', { force: true });
  await p.waitForTimeout(320);
  const elsewhere = await readRows();
  await p.evaluate(() => window.__me(false));
  for (const r of rows.slice(0, 4)) console.log("  row " + r.name + " " + r.nums + " face " + r.w + "px");

  check("instrument:the-record-reader-finds-nothing-in-the-other-tab", elsewhere.length === 0,
    elsewhere.length + " rows in the stat pane");
  // 얼굴이 첫 칸이라 누구한테 약한지가 이름보다 먼저 읽힌다. 안 그려진 초상은 그 순서를 못 만든다.
  const drawn = rows.filter((r) => r.nat > 0 && r.w > 0).length;
  check("record:every-faced-kicker-has-a-row", rows.length === names.length && drawn === rows.length,
    rows.length + " rows vs " + names.length + " kickers, " + drawn + " portraits drawn");
  const wrong = rows.filter((r) => {
    const led = ledger[r.name];
    if (!led) return true;
    return r.nums !== led.saved + "-" + led.conceded;
  });
  check("record:the-screen-matches-the-ledger", wrong.length === 0, wrong.map((r) => r.name + " " + r.nums).join(", ") || rows.length + " rows agree");

  /* 여기부터는 장부가 아니라 화면의 모양을 잰다. 담벼락과 계정을 가르는 것은 수가 아니라 배치다.
     계정 머리에 얼굴이 화소로 찍혔는가, 숫자가 두 칸으로 서는가, 글 한 장이 카드 요소인가,
     좋아요 수 앞에 아이콘이 서는가. 클래스 이름은 사람이 그것을 봤다는 증거가 아니라서 상자를 잰다.
     표본에는 남이 찍은 사진 한 장과 좋아요 칸이 없는 옛 글 한 장을 심는다. 둘 다 실제 저장에 서는
     모양인데 도는 판에서는 안 나오고, 안 재면 이 축들이 사람의 저장에서 처음 빨개진다. */
  await p.evaluate(() => {
    const posts = window.__posts();
    const k = window.__keeperStats();
    /* 행인이 찍은 사진. 행인은 생김새가 저장에 없어 초상이 실루엣으로 선다.
       그림 없는 판때기를 그림과 같은 자로 재면 주소가 빈 문자열이라 -1이 나온다. */
    posts.push({ n: "심은행인", c: false, g: 0, t: "심은 사진 한 장", lb: 4, ct: 0, l: 5,
      ph: { city: 0, passer: 0, tier: 2, h: k.height, w: k.weight, look: {} } });
    // 좋아요 칸이 없던 옛 글. l 자체가 없는 모양이고 화면은 그 자리를 0으로 채운다.
    posts.push({ n: "옛글", c: false, g: 0, t: "좋아요 칸이 없던 시절의 글" });
  });
  await p.evaluate(() => window.__gram(true));
  await p.waitForTimeout(360);
  const shape = await p.evaluate(() => {
    const box = document.getElementById("gram");
    const h4 = box.querySelector("h4");
    const pfp = h4 ? h4.querySelector("img.pfp") : null;
    const pbox = pfp ? pfp.getBoundingClientRect() : null;
    const cells = h4 ? [...h4.querySelectorAll("small .stat")] : [];
    // 머리의 숫자 띠에 남은 글자. 종결 어미로 끝나면 그것은 숫자가 아니라 안내문이다.
    const strip = [];
    const small = h4 ? h4.querySelector("small") : null;
    if (small) {
      const walk = document.createTreeWalker(small, NodeFilter.SHOW_TEXT);
      for (let n = walk.nextNode(); n; n = walk.nextNode()) {
        const e = n.parentElement;
        if (!e || e.namespaceURI !== "http://www.w3.org/1999/xhtml") continue;
        const s = n.nodeValue.trim();
        if (s) strip.push(s);
      }
    }
    const posts = [...box.querySelectorAll(".post")];
    return {
      pfp: Boolean(pfp), nat: pfp ? pfp.naturalWidth : 0,
      pw: pbox ? Math.round(pbox.width) : 0, ph: pbox ? Math.round(pbox.height) : 0,
      cells: cells.map((e) => ({ icons: e.querySelectorAll("svg").length, digits: /[0-9]/.test(e.textContent) })),
      tips: cells.map((e) => (e.getAttribute("title") || "")).filter((s) => s.length > 0),
      strip: strip,
      tags: posts.map((e) => e.tagName),
      likes: posts.map((e) => {
        const cell = e.querySelector(".react .like");
        if (!cell) return "no like cell";
        const icon = cell.querySelector("svg");
        const num = cell.querySelector("em");
        if (!icon || !num) return "icon " + Boolean(icon) + " number " + Boolean(num);
        if (!/^[+]?[0-9,]+$/.test(num.textContent.trim())) return "not a number: " + num.textContent.trim();
        const a = icon.getBoundingClientRect();
        const b2 = num.getBoundingClientRect();
        return a.right <= b2.left + 1 ? "ok" : "icon ends at " + Math.round(a.right) + ", number starts at " + Math.round(b2.left);
      }),
      avas: posts.map((e) => {
        const plate = e.querySelector(".ava");
        if (!plate) return null;
        const q = plate.getBoundingClientRect();
        const url = /url\("([^"]+)"\)/.exec(getComputedStyle(plate).backgroundImage);
        /* 초상 없는 사람은 실루엣 판때기다. 아이콘이 그 자리를 채우므로 그림 주소가 아니라
           그려진 아이콘을 센다. 둘을 한 자로 재면 실루엣이 안 그려진 그림으로 잡힌다. */
        return { w: Math.round(q.width), h: Math.round(q.height), src: url ? url[1] : "",
          anon: plate.classList.contains("anon"), icons: plate.querySelectorAll("svg").length,
          iconBox: (() => {
            const g = plate.querySelector("svg");
            if (!g) return null;
            const r = g.getBoundingClientRect();
            return { w: Math.round(r.width), h: Math.round(r.height) };
          })() };
      })
    };
  });
  console.log("  header " + shape.pw + "x" + shape.ph + " portrait, " + shape.cells.length + " number cells, "
    + shape.tags.length + " cards, " + shape.avas.filter((a) => a && a.anon).length + " of them anonymous");

  // 계정을 여는 첫 신호는 이름이 아니라 얼굴이다. 계획이 적은 48px을 상자로 확인한다.
  check("gram:the-account-header-carries-a-drawn-portrait",
    shape.pfp && shape.nat > 0 && shape.pw >= 48 && shape.ph >= 48,
    "img " + shape.pfp + ", natural " + shape.nat + ", drawn at " + shape.pw + "x" + shape.ph);
  check("gram:the-account-header-counts-followers-and-mutuals",
    shape.cells.length === 2 && shape.cells.every((c) => c.icons === 1 && c.digits),
    shape.cells.length + " cells, " + JSON.stringify(shape.cells));
  // 배율을 설명하는 문장은 툴팁으로 내려가고 숫자만 남는다. 띠에 종결 어미가 남으면 안 내려간 것이다.
  check("gram:the-multiplier-sentence-left-the-number-strip-for-a-tooltip",
    shape.tips.length > 0 && shape.strip.length > 0 && shape.strip.every((s) => !/(?:다|요)$|[.!?]$/.test(s)),
    (shape.strip.join(" | ") || "no text") + " with tooltip " + (shape.tips[0] || "none"));
  check("gram:every-post-is-a-card-element",
    shape.tags.length > 0 && shape.tags.every((t) => t === "ARTICLE"),
    [...new Set(shape.tags)].join(",") + " over " + shape.tags.length + " posts");
  check("gram:the-like-count-leads-with-its-icon",
    shape.likes.length > 0 && shape.likes.every((s) => s === "ok"),
    shape.likes.filter((s) => s !== "ok").slice(0, 3).join(" | ") || shape.likes.length + " posts read icon first");

  const plates = shape.avas.filter(Boolean);
  check("gram:every-post-plates-its-author",
    plates.length === shape.tags.length && plates.length > 0 && plates.every((a) => a.w >= 40 && a.h >= 40),
    plates.length + " plates over " + shape.tags.length + " posts, sizes "
      + ([...new Set(plates.map((a) => a.w + "x" + a.h))].join(",") || "none"));
  /* 얼굴을 든 판때기는 그림이라 클래스가 아니라 화소로 본다. 빈 판때기에도 주소는 붙는다.
     실루엣은 그림이 아니라서 이 자의 표본이 아니다. 섞어 재면 설계대로 선 실루엣이
     안 그려진 초상으로 잡혀, 사진에 태그된 사람의 저장이 전부 빨개진다. */
  const faced = plates.filter((a) => !a.anon);
  const ink = await p.evaluate((list) => Promise.all(list.map((s) => new Promise((res) => {
    const im = new Image();
    im.onload = () => {
      const cv = document.createElement("canvas");
      cv.width = im.width; cv.height = im.height;
      const g = cv.getContext("2d");
      g.drawImage(im, 0, 0);
      const d = g.getImageData(0, 0, im.width, im.height).data;
      let on = 0;
      for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 24) on += 1;
      res(100 * on / (d.length / 4));
    };
    im.onerror = () => res(-1);
    im.src = s;
  }))), faced.map((a) => a.src));
  check("gram:the-author-plate-is-actually-drawn",
    faced.length > 0 && ink.length === faced.length && ink.every((x) => x > 8),
    ink.map((x) => x.toFixed(1) + "%").slice(0, 4).join(", ") + " over " + faced.length + " faced plates of " + plates.length);
  /* 얼굴이 없는 사람의 판때기. 그림이 안 오는 자리라 빈 칸으로 두면 그 카드만 작성자가 사라진다.
     그 자리를 실루엣이 채웠는지는 아이콘 상자와 화소 둘로 본다. 상자만 보면 안 그려진 아이콘도
     통과하므로, 아이콘을 껐다 켜서 그 상자 안의 밝기가 얼마나 달라지는지를 같이 센다.
     자와 문턱 8%는 staticon 게이트가 내 정보 창 아이콘에 쓰는 그것과 같다. */
  const anon = plates.filter((a) => a.anon);
  const ANON = "#gram .post .ava.anon";
  const win = await p.evaluate((sel) => {
    const e = document.querySelector(sel);
    const g = e ? e.querySelector("svg") : null;
    if (!e || !g) return null;
    const a = e.getBoundingClientRect(), c = g.getBoundingClientRect();
    return { x: (c.left - a.left) / a.width, y: (c.top - a.top) / a.height, w: c.width / a.width, h: c.height / a.height };
  }, ANON);
  let mark = -1;
  if (win) {
    const one = p.locator(ANON).first();
    const on = (await one.screenshot()).toString("base64");
    await p.evaluate((sel) => { document.querySelector(sel + " svg").style.visibility = "hidden"; }, ANON);
    const off = (await one.screenshot()).toString("base64");
    await p.evaluate((sel) => { document.querySelector(sel + " svg").style.visibility = ""; }, ANON);
    mark = await p.evaluate(([a, c, box]) => {
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
        return n ? hit / n : -1;
      });
    }, [on, off, win]);
  }
  check("gram:a-faceless-author-still-gets-a-silhouette",
    anon.length > 0 && anon.every((a) => a.icons === 1 && a.iconBox && a.iconBox.w >= 12 && a.iconBox.h >= 12) && mark >= 0.08,
    anon.length + " anonymous plates, mark "
      + (anon[0] && anon[0].iconBox ? anon[0].iconBox.w + "x" + anon[0].iconBox.h : "no box")
      + ", " + (mark * 100).toFixed(1) + "% of the plate changes when the mark is hidden");

  /* 심어 둔 사진 글에서 선팔 버튼의 자리를 잰다. 신규 저장은 라포가 0이라 아무도 나를 안 찍고,
     안 심은 표본에는 버튼이 한 개도 없어 잴 자리가 없다. */
  const spot = await p.evaluate(() => {
    const card = document.querySelector("#gram .post.shot");
    const btn = card ? card.querySelector(".by .fol") : null;
    return card && btn
      ? { right: Math.round(card.getBoundingClientRect().right - btn.getBoundingClientRect().right),
        top: Math.round(btn.getBoundingClientRect().top - card.getBoundingClientRect().top),
        w: Math.round(btn.getBoundingClientRect().width), h: Math.round(btn.getBoundingClientRect().height),
        label: btn.textContent.trim() }
      : null;
  });
  check("gram:the-follow-button-sits-small-at-the-card-top-right",
    Boolean(spot) && spot.right >= 0 && spot.right <= 16 && spot.top >= 0 && spot.top <= 16 && spot.h <= 34,
    spot ? spot.label + " " + spot.w + "x" + spot.h + ", " + spot.right + "px in from the right, "
      + spot.top + "px down from the top" : "no photo card");
  // 심은 둘을 도로 뺀다. 남겨 두면 뒤에 붙는 축이 심은 글을 판이 낳은 글로 읽는다.
  await p.evaluate(() => {
    const posts = window.__posts();
    posts.pop();
    posts.pop();
  });

  /* 쪽지는 카드 아래에 접혀 있다. 접힌 자리에 대화가 이미 그려져 있으면 접힌 것이 아니고,
     쪽지함이 피드 위에 서면 계정을 여는 첫 화면이 남의 대화가 된다. */
  const fold = await p.evaluate(() => {
    const s = window.__social();
    s.follows["0:2"] = 1;
    s.dm = {};
    window.__rapport()["0:2"] = 9;
    window.__gram(false);
    window.__gram(true);
    const box = document.getElementById("gram");
    const feed = box.querySelector(".feed");
    const dms = box.querySelector(".dms");
    const handle = box.querySelector('.dmOpen[data-key="0:2"]');
    if (!feed || !dms || !handle) return null;
    const under = Math.round(dms.getBoundingClientRect().top - feed.getBoundingClientRect().bottom);
    const before = Boolean(box.querySelector(".dm"));
    handle.click();
    const again = box.querySelector('.dmOpen[data-key="0:2"]');
    const body = box.querySelector(".dm");
    return { under: under, before: before, after: Boolean(body),
      below: body && again ? Math.round(body.getBoundingClientRect().top - again.getBoundingClientRect().bottom) : null };
  });
  check("gram:the-thread-folds-under-the-feed",
    Boolean(fold) && fold.under >= 0 && fold.before === false && fold.after === true && fold.below >= 0,
    fold ? "inbox " + fold.under + "px under the feed, thread drawn " + fold.before + " then " + fold.after
      + ", body " + fold.below + "px under its handle" : "no fold under the feed");
  await p.evaluate(() => window.__gram(false));

  check("console:no-errors", errs.length === 0, errs.slice(0, 3).join(" | ") || "clean");
  if (notes.length) console.log(notes.map((x) => "  ok   " + x).join(LINE));
  if (fails.length) console.log(fails.map((x) => "  FAIL " + x).join(LINE));
  console.log(fails.length ? "gram FAIL " + fails.length : "gram PASS");
  if (fails.length) process.exitCode = 1;
} finally {
  clearTimeout(t);
  if (b) await b.close();
}
