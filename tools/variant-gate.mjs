import { chromium } from "playwright";

// 변형 선반의 자. 선반 길이가 등급 수에 묶여 있으면 콘텐츠가 넷에서 멈춘다.
// 등급을 늘리면 값 사다리와 팔로워 승수가 같이 늘어나므로, 그 매듭 밖에서 늘리는 길이 변형이다.
//
// 재는 것은 다섯이다. 선반이 등급보다 많은 물건을 파는가, 등급마다 변형이 둘 이상인가,
// 같은 등급의 변형끼리 화면이 갈리는가, 가진 등급의 변형을 바꾸는 데 값이 안 드는가,
// 그 선택이 저장에 남는가.
//
// 값이 안 든다는 축에는 판을 세우는 절차가 붙는다. 창이 열려 있어도 판이 굴러
// 완봉 보상이 지갑에 들어오면, 그 몫이 변형 값으로 읽힌다.
const EXE = process.env.LOCALAPPDATA + "/ms-playwright/chromium-1228/chrome-win64/chrome.exe";
const BASE = "http://127.0.0.1:10310/web/index.html?seed=20&preset=rich";
const LINE = String.fromCharCode(10);
const t = setTimeout(() => { console.log("WATCHDOG"); process.exit(1); }, 150000);
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

  // 어느 선반을 재는지는 데이터가 정한다. 변형 표에 든 칸이 곧 대상이라,
  // 새 선반에 변형을 붙이면 이 자가 손댈 목록 없이 따라온다.
  const shelves = await p.evaluate(async () => {
    const g = await import("/web/src/state/gear.mjs");
    return g.SKIN_FIELDS.map((f) => {
      const per = g.SKINS[f].map((_, r) => g.skinsAt(f, r).length);
      return { field: f, ranks: g.SKINS[f].length, per, total: per.reduce((a, c) => a + c, 0) };
    });
  });
  check("instrument:some-shelf-declares-variants", shelves.length > 0, shelves.map((s) => s.field).join(", "));
  for (const s of shelves) {
    check("variant:" + s.field + ":the-shelf-sells-more-than-one-thing-per-grade", s.total > s.ranks,
      s.total + " items over " + s.ranks + " grades");
    check("variant:" + s.field + ":every-grade-carries-at-least-two", s.per.every((n) => n >= 2), s.per.join(", "));
  }

  // 같은 등급의 변형끼리 화면이 갈리는가. 굽힌 그림을 화소로 맞댄다.
  // 대조군으로 같은 변형을 두 번 구워 같은 그림이 나오는 것을 먼저 확인한다.
  for (const s of shelves) {
    const drawn = await p.evaluate(async (field) => {
      const m = await import("/web/src/render/thumb.mjs");
      const g = await import("/web/src/state/gear.mjs");
      const k = { height: 188, weight: 84 };
      // 장면 칸은 외형 묶음이 아니라 등급과 변형을 받는다. 몸 칸은 그 둘을 담은 외형 묶음을 받는다.
      const scene = field === "frame" || field === "city";
      const bake = (rank, at) => m.thumbURL(field, k, scene ? { rank, skin: at } : g.lookOf({ [field]: rank, [field + "Skin"]: at }));
      const same = [];
      let twice = true;
      for (let r = 0; r < g.SKINS[field].length; r++) {
        const urls = g.skinsAt(field, r).map((v, i) => bake(r, i));
        for (let i = 0; i < urls.length; i++) for (let j = i + 1; j < urls.length; j++) if (urls[i] === urls[j]) same.push(r + ":" + i + "-" + j);
        if (r === 0) twice = bake(0, 1) === urls[1];
      }
      return { same, twice };
    }, s.field);
    check("variant:" + s.field + ":variants-of-one-grade-do-not-bake-the-same-picture", drawn.same.length === 0, drawn.same.join(", ") || "all distinct");
    check("control:" + s.field + ":the-same-variant-bakes-the-same-picture", drawn.twice, String(drawn.twice));
  }

  // 가진 등급의 변형을 바꾸는 데 값이 드는가. 판을 세우고 잰다.
  await p.evaluate(() => window.__shop(true));
  await p.waitForTimeout(400);
  await p.evaluate(() => { for (const x of document.querySelectorAll("#shop .tab")) if (x.dataset.tab === "hair") x.click(); });
  await p.waitForTimeout(700);
  await p.evaluate(() => window.__fixedStep(0.000001));
  await p.waitForTimeout(250);
  const coin = () => p.evaluate(() => window.__squad().coin);
  const worn = () => p.evaluate(() => window.__gear());
  const idle = await coin();
  await p.waitForTimeout(600);
  const stillIdle = await coin();
  check("control:the-wallet-holds-still-while-the-world-is-stopped", idle === stillIdle, idle + " then " + stillIdle);

  const before = await coin();
  const was = await worn();
  await p.evaluate(() => { const s = document.querySelector('#shop .skin[data-rank="0"][data-skin="2"]'); s && s.click(); });
  await p.waitForTimeout(500);
  const after = await coin();
  const now = await worn();
  check("variant:switching-a-grade-you-own-costs-nothing", before === after, before + " then " + after);
  check("variant:switching-actually-changes-what-is-worn", was.hairSkin !== now.hairSkin, JSON.stringify(was.hairSkin) + " to " + JSON.stringify(now.hairSkin));

  // 저장에 남는가. 다시 읽어들여 같은 변형이 서 있어야 한다.
  // 저장 키는 save.mjs가 소유한다. 여기 이름을 손으로 적으면 그 파일이 바뀐 날 이 축이 조용히 통과한다.
  const saved = await p.evaluate(async () => {
    const raw = localStorage.getItem("gtg.save.v1");
    if (!raw) return { has: false, at: -1 };
    const j = JSON.parse(raw);
    const k = j.keeper && j.keeper.worn ? j.keeper.worn : null;
    return { has: true, at: k && k.hairSkin !== undefined ? k.hairSkin : -1 };
  });
  check("variant:the-choice-reaches-the-save", saved.has && saved.at === now.hairSkin,
    JSON.stringify(saved) + " against worn " + now.hairSkin);

  await p.evaluate(() => window.__fixedStep(0));
  check("console:no-errors", errs.length === 0, errs.slice(0, 2).join(" | ") || "clean");
  await ctx.close();

  if (notes.length) console.log(notes.map((x) => "  ok   " + x).join(LINE));
  if (fails.length) console.log(fails.map((x) => "  FAIL " + x).join(LINE));
  console.log(fails.length ? "variant FAIL " + fails.length : "variant PASS " + notes.length);
  if (fails.length) process.exitCode = 1;
} finally {
  clearTimeout(t);
  if (b) await b.close();
}

