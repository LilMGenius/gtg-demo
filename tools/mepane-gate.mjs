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
  /* 큰 수 셋은 장부에서 나온다. 막은 것만 있는 장부로 재면 먹힌 수 칸이 0으로 서고,
     0은 자리가 비어 있는 것과 화면에서 안 갈린다. 두 이름을 심어 세 수가 전부 살아 있게 한다.
     판이 계속 돌면 그 사이에 장부가 또 움직이므로, 심기 전에 판을 멈춘다. */
  await p.evaluate(() => window.__freeze(true));
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
        cond: box.querySelectorAll("h4 .cond svg").length
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

  check("instrument:the-three-panes-were-found", TABS.every((id) => seen[id].tabs.join(",") === TABS.join(",")),
    seen.stat.tabs.join(", ") || "no tabs");
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
  const condAt = async (v) => {
    await p.evaluate((x) => { window.__form(x); window.__me(false); window.__me(true); }, v);
    await p.waitForTimeout(300);
    return (await read()).head.cond;
  };
  const condUp = await condAt(1);
  const condFlat = await condAt(0);
  check("mepane:the-condition-follows-the-chip", condUp === 1 && condFlat === 0,
    "form 1 -> " + condUp + " icon, form 0 -> " + condFlat + " icon");

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

  check("console:no-errors", errs.length === 0, errs.slice(0, 2).join(" | ") || "clean");
  await ctx.close();

  console.log("표본 범위: 내 정보 칸 셋 + 선수단 포지션 넷, 한 화면 1280x720");
  if (notes.length) console.log(notes.map((x) => "  ok   " + x).join(LINE));
  if (fails.length) console.log(fails.map((x) => "  FAIL " + x).join(LINE));
  console.log(fails.length ? "mepane FAIL " + fails.length : "mepane PASS " + notes.length);
  if (fails.length) process.exitCode = 1;
} finally {
  clearTimeout(t);
  if (b) await b.close();
}
