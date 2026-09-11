import { chromium } from "playwright";

// 화면 위 조작 한 벌의 자. 조작 하나가 다른 그림 언어나 다른 색이나 다른 크기를 쓰면
// 그 하나가 남의 화면처럼 보이고, 덮개 밖에 남으면 창이 열린 동안에도 눌린다.
//
// 재는 것은 넷이다. 아이콘이 전부 같은 격자 픽셀로 그려졌는가, 색이 한 토큰인가,
// 판때기 크기가 서로 맞는가, 창을 열면 전부 덮개 아래로 들어가는가.
//
// 덮임은 선언이 아니라 화소로 잰다. z-index를 읽으면 쌓임 맥락이 갈리는 자리를 못 본다.
// 대조군으로 창을 닫은 프레임을 같이 재서, 어두워진 것이 창 때문임을 갈라 놓는다.
const EXE = process.env.LOCALAPPDATA + "/ms-playwright/chromium-1228/chrome-win64/chrome.exe";
// veteran은 첫 진입 개봉을 마친 저장이다. 개봉판은 화면 전체를 덮고 그동안 어떤 창도 안 열리므로,
// 신규 저장에서 시작하면 이 자는 창 크롬이 아니라 잠긴 문 앞의 어두운 화면을 잰다. 실측 밝기 9.5였다.
const BASE = "http://127.0.0.1:10310/web/index.html?seed=20&preset=rich,veteran";
// 그 잠금 자체를 재는 표본은 프리셋 없이 따로 세운다. 같은 판에서 둘을 재면 하나가 다른 하나를 지운다.
const FIRST = "http://127.0.0.1:10310/web/index.html?seed=20";
const LINE = String.fromCharCode(10);
const t = setTimeout(() => { console.log("WATCHDOG"); process.exit(1); }, 150000);
t.unref();

const fails = [], notes = [];
const check = (n, ok, d) => (ok ? notes : fails).push(n + " " + d);

// 화면 위 조작 전부. 상태 칩 #top은 조작이 아니라 표시라 여기 안 들어간다.
// 갈래가 둘이다. 켜고 끄는 토글과 창을 여는 버튼은 다른 일을 하므로 다른 판때기를 쓴다.
// 토글 안에서도 자리가 갈린다. 판을 굴리는 둘은 왼쪽 기둥에 서고, 소리는 판이 아니라
// 기기를 만지는 설정이라 오른쪽 기둥 맨 위 제 칸을 쓴다. 판때기는 자리가 아니라 하는 일을
// 따라가므로, 소리는 오른쪽으로 가서도 토글 판때기 그대로다.
const PLAY = ["auto", "out"];
const SETTINGS = ["mute"];
const TOGGLES = SETTINGS.concat(PLAY);
const OPENERS = ["gymBtn", "rosterBtn", "gramBtn", "shopBtn"];
const IDS = TOGGLES.concat(OPENERS);

/* 첫 진입 개봉을 걷는 손. 이 모양의 임자는 tools/onboard-gate.mjs이고 여기 것은 그 자의 press와 tap을
   그대로 옮긴 사본이다. 짧은 누름은 한 단을 올릴 뿐이므로(web/src/main.mjs의 step) 누름 수로는 이 판을
   못 걷는다. 실측으로 0.7초 간격 여섯 번은 열한 장 가운데 셋째 장 둘째 단에서, 0.5초 간격 여덟 번은
   셋째 장 첫 단에서 끝났고 판은 그대로 서 있었다. 문턱 LONG_MS 0.45초보다 오래 붙들면 남은 것이 그 자리에서
   전부 열리고, 뗀 뒤 한 번 누르는 것이 닫는다. 첫 진입은 키퍼 한 장과 키커 열한 장 두 마디라
   그 쌍을 판이 걷힐 때까지 되풀이한다. */
async function clearDraw(page) {
  // 카드가 지나는 다섯 단의 마지막 번호. 길이는 제품의 STAGE_MS가 정하고 계기는 그 수를 마주 든다.
  const STAGE_LAST = 4;
  /* 긴 누름이 남은 것을 여는 것을 기다리는 상한. 제품 문턱이 0.45초라 여섯 배가 넘고,
     문턱이 아니라 상한이므로 초록 회차에서는 0.5초 언저리에 풀린다. */
  const PRESS_MS = 3000;
  // 마디 수의 상한. 두 마디가 끝이고 남는 둘은 손이 한 번 헛나갔을 때의 자리다.
  const BEATS = 4;
  // 닫힌 판은 누를 자리가 없다. 그 자리에서 한 번 더 누르면 오류로 끝나 결과 줄이 아예 안 남는다.
  const standing = () => page.evaluate(() => { const e = document.getElementById("pull"); return Boolean(e) && !e.hidden; });
  for (let beat = 0; beat < BEATS; beat += 1) {
    if (!(await standing())) return true;
    const spot = await page.locator("#pull .tap").boundingBox();
    if (!spot) return false;
    /* 손가락이 내려가 있는 동안 열리는 물건이라 누름과 뗌을 따로 보내고, 열린 것을 보고 뗀다.
       뗄 때 브라우저가 만드는 click은 제 일을 한 긴 누름의 것이라 제품이 삼키므로 닫는 누름은 따로 간다. */
    await page.mouse.move(spot.x + spot.width / 2, spot.y + spot.height / 2);
    await page.mouse.down();
    await page.waitForFunction((last) => {
      const r = window.__reveal();
      return r.drawn > 0 && r.shown === r.drawn && r.stage === last;
    }, STAGE_LAST, { timeout: PRESS_MS, polling: "raf" }).catch(() => {});
    await page.mouse.up();
    await page.waitForTimeout(300);
    if (await standing()) await page.click("#pull", { force: true });
    /* 닫히거나, 닫혀서 다음 마디가 이어 열리거나. 둘 중 하나가 설 때까지가 이 마디의 끝이다. */
    await page.waitForFunction(() => {
      const e = document.getElementById("pull");
      if (!e || e.hidden) return true;
      const r = window.__reveal();
      return r.drawn > 0 && r.shown < r.drawn;
    }, null, { timeout: PRESS_MS, polling: "raf" }).catch(() => {});
  }
  return !(await standing());
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

  /* 첫 진입 개봉이 서 있는 동안 창이 열리면 개봉판이 조용히 걷힌다. 개봉판은 화면을 다 덮어
     사람의 클릭을 막고 있으므로 그 창을 여는 것은 손잡이뿐이고, 그 자리는 사람이 못 가는 자리다.
     처음 오는 사람이 자기가 무엇을 들고 시작하는지를 못 보고 지나가는 결함이기도 하다. */
  {
    const fresh = await b.newContext({ viewport: { width: 1280, height: 720 } });
    const q = await fresh.newPage();
    await q.goto(FIRST, { waitUntil: "load" });
    await q.waitForSelector("#go", { timeout: 15000 });
    await q.click("#go", { force: true });
    await q.waitForTimeout(1300);
    const standing = await q.evaluate(() => !document.getElementById("pull").hidden);
    check("chrome:the-first-reveal-stands-on-a-new-save", standing, String(standing));
    await q.evaluate(() => window.__shop(true));
    await q.waitForTimeout(400);
    const held = await q.evaluate(() => ({ shop: document.getElementById("shop").hidden, pull: !document.getElementById("pull").hidden }));
    check("chrome:no-window-opens-while-the-reveal-stands", held.shop && held.pull,
      "shop hidden " + held.shop + ", reveal standing " + held.pull);
    // 대조군. 개봉을 사람처럼 눌러 끝내면 같은 손잡이로 창이 열려야 한다.
    // 안 열리면 위의 초록은 잠금이 아니라 손잡이가 죽은 것이다.
    await clearDraw(q);
    await q.evaluate(() => window.__shop(true));
    await q.waitForTimeout(400);
    const after = await q.evaluate(() => document.getElementById("shop").hidden);
    check("control:the-same-handle-opens-once-the-reveal-is-done", after === false, "shop hidden " + after);
    await fresh.close();
  }

  const scan = await p.evaluate((arg) => {
    const ids = arg.ids;
    const out = [];
    for (const id of ids) {
      const e = document.getElementById(id);
      if (!e) { out.push({ id, missing: true }); continue; }
      const svg = e.querySelector("svg");
      const r = e.getBoundingClientRect();
      const s = getComputedStyle(e);
      out.push({
        id,
        // 격자 픽셀이 아닌 그림. path나 circle이 있으면 손그림 한 벌에서 튄다.
        strays: svg ? svg.querySelectorAll("path,circle,ellipse,polygon,line").length : -1,
        rects: svg ? svg.querySelectorAll("rect").length : -1,
        filled: svg ? svg.getAttribute("fill") : "",
        // 3px 격자에 안 맞는 좌표. 하나라도 있으면 그 아이콘만 다른 눈금 위에 있다.
        offGrid: svg ? [...svg.querySelectorAll("rect")].filter((q) =>
          ["x", "y", "width", "height"].some((k) => Number(q.getAttribute(k)) % 3 !== 0)).length : -1,
        color: s.color,
        // 판때기는 CSS 상자로 잰다. 조작마다 기울기가 달라 getBoundingClientRect는
        // 회전된 상자를 돌려주고, 같은 66x40이 67x42와 68x43으로 갈려 읽힌다.
        w: e.offsetWidth,
        h: e.offsetHeight,
        onScreen: r.top >= 0 && r.bottom <= innerHeight
      });
    }
    const top = document.getElementById("top").getBoundingClientRect();
    const mute = document.getElementById("mute").getBoundingClientRect();
    const lift = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--lift")) || 0;
    const span = (list) => list.map((id) => document.getElementById(id).getBoundingClientRect());
    const cols = {
      toggleRight: Math.max(...span(arg.play).map((r) => r.right)),
      openerLeft: Math.min(...span(arg.openers).map((r) => r.left)),
      settingsBottom: mute.bottom,
      openerTop: Math.min(...span(arg.openers).map((r) => r.top))
    };
    /* 소리와 상태 칩이 세로로 겹쳐 있을 때는 위아래 거리 하나로 충분했다. 둘이 좌우로 갈라선
       지금 세로만 재면 늘 0이 나와, 판때기가 칩에서 화면 반대편에 있어도 빨갛다.
       갈라선 축을 재야 같은 질문이 계속 성립한다. 두 축 다 0이면 겹친 것이다. */
    const dx = Math.max(0, Math.max(top.left - mute.right, mute.left - top.right));
    const dy = Math.max(0, Math.max(top.top - mute.bottom, mute.top - top.bottom));
    const chipGap = (dx === 0 && dy === 0) ? 0 : Math.round(Math.max(dx, dy));
    return { out, cols, chipGap, lift };
  }, { ids: IDS, play: PLAY, openers: OPENERS });

  check("instrument:every-control-was-found", scan.out.every((s) => !s.missing),
    scan.out.filter((s) => s.missing).map((s) => s.id).join(", ") || IDS.length + " controls");
  check("chrome:every-icon-is-drawn-on-the-same-grid", scan.out.every((s) => s.strays === 0 && s.rects > 0 && s.offGrid === 0),
    scan.out.filter((s) => s.strays !== 0 || s.offGrid !== 0).map((s) => s.id + " strays " + s.strays + " offGrid " + s.offGrid).join(", ") || "all rects on 3px");
  const tones = new Set(scan.out.map((s) => s.color));
  check("chrome:every-control-wears-one-colour", tones.size === 1, [...tones].join(" | "));
  const plate = (list) => new Set(scan.out.filter((s) => list.includes(s.id)).map((s) => s.w + "x" + s.h));
  const said = (list) => scan.out.filter((s) => list.includes(s.id)).map((s) => s.id + " " + s.w + "x" + s.h).join(", ");
  // 갈래 안에서는 판때기가 같고 갈래끼리는 다르다. 크기까지 같으면 무엇이 창을 여는지가 눌러 봐야 안다.
  check("chrome:each-kind-of-control-shares-one-plate", plate(TOGGLES).size === 1 && plate(OPENERS).size === 1,
    said(TOGGLES) + " | " + said(OPENERS));
  check("instrument:the-plates-were-not-all-identical-by-accident",
    new Set([...plate(TOGGLES), ...plate(OPENERS)]).size === 2,
    [...plate(TOGGLES)].join(",") + " against " + [...plate(OPENERS)].join(","));
  check("chrome:the-two-kinds-stand-in-different-columns", scan.cols.toggleRight < scan.cols.openerLeft,
    "toggles end at " + scan.cols.toggleRight.toFixed(0) + "px, openers start at " + scan.cols.openerLeft.toFixed(0) + "px");
  // 설정 칸은 창 기둥 위에 선다. 아래 버튼을 물면 소리를 끄려다 훈련장이 열린다.
  check("chrome:the-settings-slot-clears-the-window-column",
    scan.cols.openerTop - scan.cols.settingsBottom >= scan.lift,
    Math.round(scan.cols.openerTop - scan.cols.settingsBottom) + "px against " + scan.lift + "px");
  // 칩과 버튼은 갈래가 다른 조작이라 gap 게이트가 안 본다. 여기서 본다.
  check("chrome:the-sound-toggle-clears-the-status-chip", scan.chipGap >= scan.lift,
    scan.chipGap + "px against " + scan.lift + "px");

  /* 기둥의 리듬. 소리가 오른쪽 기둥으로 간 뒤 왼쪽 기둥에는 그 판때기가 서 있던 자리가 그대로 남았다.
     실측 1280x720에서 상태 칩 아래끝 74px과 자동 140px 사이가 66px으로, 오른쪽 기둥이 네 번 지키는
     12px의 다섯 배 반이었다. 판때기 하나가 빠진 자리는 사람 눈에 여백이 아니라 사라진 버튼으로 읽힌다.
     간격은 CSS 상자로 잰다. 판때기마다 기울기가 달라 getBoundingClientRect는 회전된 상자를 돌려주고,
     상태 칩은 폭이 실측 350px이라 -1.1도만으로 아래끝이 3.3px 내려앉아 같은 자리가 다른 수로 읽힌다.
     두 뷰포트에서 잰다. 글자 크기가 폭을 따라 굽어 칩의 키가 실측 55px에서 66px까지 갈리므로,
     한 폭에서만 맞춘 자리는 다른 폭에서 다시 벌어진다. */
  const rhythmOf = (page) => page.evaluate(() => {
    const box = (id) => { const e = document.getElementById(id); return { top: e.offsetTop, bottom: e.offsetTop + e.offsetHeight }; };
    const gaps = (ids) => ids.slice(1).map((id, i) => ({ pair: ids[i] + " to " + id, gap: box(id).top - box(ids[i]).bottom }));
    return { left: gaps(["top", "auto", "out"]), right: gaps(["mute", "gymBtn", "rosterBtn", "gramBtn", "shopBtn"]) };
  });
  /* 대역은 오른쪽 기둥이 그 판에서 실제로 쓴 값으로 매 판 다시 낸다. 숫자를 박아 두면 기둥이 움직인
     날 자가 먼저 늙는다. 여유 2px은 offsetTop과 offsetHeight가 정수로 끊기며 생기는 오차고,
     간격 하나는 위 판때기와 아래 판때기가 각각 한 번씩 끊긴 값이라 1px이 두 번 든다. */
  const TOL = 2;
  const judge = (r) => {
    const lo = Math.min(...r.right.map((g) => g.gap));
    const hi = Math.max(...r.right.map((g) => g.gap));
    return {
      band: lo + " to " + hi,
      off: r.left.filter((g) => g.gap < lo - TOL || g.gap > hi + TOL),
      over: r.left.filter((g) => g.gap > hi * 2)
    };
  };
  const say = (tag, r, v) => tag + " left " + r.left.map((g) => g.pair + " " + g.gap).join(", ") + " against right " + v.band;

  const wideRhythm = await rhythmOf(p);
  const narrow = await b.newContext({ viewport: { width: 740, height: 360 } });
  const np = await narrow.newPage();
  await np.goto(BASE, { waitUntil: "load" });
  await np.waitForSelector("#go", { timeout: 15000 });
  await np.click("#go", { force: true });
  await np.waitForTimeout(1300);
  const tightRhythm = await rhythmOf(np);
  await narrow.close();
  const wide = judge(wideRhythm), tight = judge(tightRhythm);
  check("chrome:the-left-column-keeps-the-right-column-rhythm",
    wide.off.length === 0 && wide.over.length === 0 && tight.off.length === 0 && tight.over.length === 0,
    say("1280x720", wideRhythm, wide) + " | " + say("740x360", tightRhythm, tight));

  /* 대조군. 떠난 소리 판때기 46px을 자동 위에 도로 심는다. 이 자가 살아 있으면 그 한 칸이
     들어온 순간 빨개져야 하고, 안 빨개지면 위의 초록은 리듬이 아니라 아무것도 안 잰 것이다. */
  await p.evaluate(() => {
    const t = document.getElementById("top");
    const want = t.offsetTop + t.offsetHeight + 46;
    const d = want - document.getElementById("auto").offsetTop;
    for (const id of ["auto", "out"]) { const e = document.getElementById(id); e.dataset.was = e.style.top; e.style.top = (e.offsetTop + d) + "px"; }
  });
  const planted = await rhythmOf(p);
  await p.evaluate(() => { for (const id of ["auto", "out"]) { const e = document.getElementById(id); e.style.top = e.dataset.was; delete e.dataset.was; } });
  const plant = judge(planted);
  check("control:planting-the-old-sound-plate-reddens-the-rhythm-axis",
    plant.off.length > 0 || plant.over.length > 0,
    say("planted 46px", planted, plant));

  // 덮임. 창을 연 프레임과 닫은 프레임의 밝기를 조작마다 잰다.
  const lum = async () => p.evaluate((ids) => ids.map((id) => {
    const e = document.getElementById(id);
    const s = getComputedStyle(e);
    return { id, o: Number(s.opacity), f: s.filter };
  }), IDS);
  const shot = async (id) => (await p.locator("#" + id).screenshot()).toString("base64");
  const mean = (a) => p.evaluate((s) => new Promise((res) => {
    const im = new Image();
    im.onload = () => {
      const cv = document.createElement("canvas");
      cv.width = im.width; cv.height = im.height;
      const g = cv.getContext("2d");
      g.drawImage(im, 0, 0);
      const d = g.getImageData(0, 0, im.width, im.height).data;
      let sum = 0;
      for (let i = 0; i < d.length; i += 4) sum += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
      res(sum / (d.length / 4));
    };
    im.src = "data:image/png;base64," + s;
  }), a);

  // 창 하나로만 재면 나머지 창은 아무도 안 본 채로 남는다. 창마다 전부 돈다.
  //
  // 조작과 칩은 창이 열렸을 때 하는 일이 다르다. 조작은 물러나고 칩은 남는다.
  // 밝기를 40퍼센트로 낮추는 덮개만으로는, 판이 큰 상점에서는 조작이 판에 가려 사라지고
  // 판이 작은 훈련장에서는 그대로 읽혀서 같은 덮개가 창마다 다른 말을 했다.
  // 그래서 조작은 밝기가 아니라 좌표로 잰다. 뷰포트를 벗어나면 창마다 같은 말이 된다.
  // 칩은 잔고를 보며 사는 자리라 남아야 하고, 남는 이상 덮여야 한다.
  const WINDOWS = ["shop", "gym", "roster", "gram", "me", "wiki"];
  const boxes = () => p.evaluate((ids) => ids.map((id) => {
    const r = document.getElementById(id).getBoundingClientRect();
    return { id, left: r.left, right: r.right, off: r.right <= 0 || r.left >= innerWidth };
  }), IDS);
  const chipLum = async () => mean(await shot("top"));
  /* 상태 칩은 반투명 판때기라 그 뒤 경기장이 비친다. 행인이 걷고 공이 도는 동안 재면
     칩의 내용이 한 글자도 안 바뀌었는데 밝기가 흔들린다. 실측으로 대조군이 47.1에서
     44.6으로 안 돌아왔고, 칩의 마크업은 두 시점이 바이트까지 같았다. 움직인 것은 배경이다.
     판을 멈추고 세계시계를 얼린 뒤에 잰다. 조작 기둥은 전이라 얼려도 계속 물러난다. */
  await p.evaluate(() => window.__lockRound());
  await p.evaluate(() => window.__freeze(true));
  await p.waitForTimeout(300);
  const baseChip = await chipLum();
  const baseBox = await boxes();
  const stayed = [], veiled = [], restored = [], vanished = [], shouted = [];
  for (const win of WINDOWS) {
    await p.evaluate((w) => window["__" + w](true), win);
    // 400ms는 물러나는 데 쓰는 240ms보다 길다. 움직이는 중간을 재면 좌표가 회차마다 갈린다.
    await p.waitForTimeout(400);
    for (const b of await boxes()) if (!b.off) stayed.push(win + "/" + b.id + " " + b.left.toFixed(0) + " to " + b.right.toFixed(0));
    // 칩이 화면에서 사라지면 밝기 비교가 무의미해진다. 잔고를 보며 사는 자리에서
    // 잔고가 없어지는 것이 그 자체로 결함이라 자리부터 확인한다.
    const chip = await p.evaluate(() => {
      const e = document.getElementById("top");
      const r = e.getBoundingClientRect();
      return { w: e.offsetWidth, o: Number(getComputedStyle(e).opacity), on: r.width > 0 && r.height > 0 };
    });
    if (!(chip.w > 0 && chip.o > 0 && chip.on)) vanished.push(win + " " + chip.w + "px opacity " + chip.o);
    // 사건 단어와 섬광은 #hud 밖에 있어 창 덮개가 안 닿는다. 글자가 화면 너비의 절반을 쓰므로
    // 어두워지는 것만으로는 부족하고 창이 열린 동안에는 아예 안 보여야 한다.
    const loud = await p.evaluate(() => ["stamp", "flash"].filter((id) => {
      const e = document.getElementById(id);
      return e && Number(getComputedStyle(e).opacity) > 0.01;
    }));
    for (const id of loud) shouted.push(win + "/" + id);
    // 덮개가 얹히면 밝기가 내려간다. 10%는 배경 #080b07c4가 판때기 위에 앉을 때의 실측 하한이다.
    const nowChip = await chipLum();
    if (nowChip > baseChip * 0.9) veiled.push(win + "/top " + baseChip.toFixed(1) + " to " + nowChip.toFixed(1));
    await p.evaluate((w) => window["__" + w](false), win);
    await p.waitForTimeout(400);
    const backChip = await chipLum();
    if (Math.abs(backChip - baseChip) > baseChip * 0.05) restored.push(win + "/top " + baseChip.toFixed(1) + " to " + backChip.toFixed(1));
    const backBox = await boxes();
    for (let i = 0; i < backBox.length; i++) if (Math.abs(backBox[i].left - baseBox[i].left) > 1) restored.push(win + "/" + backBox[i].id + " " + baseBox[i].left.toFixed(0) + " to " + backBox[i].left.toFixed(0));
  }
  check("chrome:every-window-clears-both-columns-off-screen", stayed.length === 0,
    stayed.slice(0, 6).join(", ") || WINDOWS.length + " windows over " + IDS.length + " controls");
  check("chrome:every-window-veils-the-status-chip", veiled.length === 0,
    veiled.slice(0, 6).join(", ") || "chip veiled in all " + WINDOWS.length);
  check("chrome:the-status-chip-stays-on-screen-in-every-window", vanished.length === 0,
    vanished.join(", ") || "chip present in all " + WINDOWS.length);
  check("chrome:the-event-word-goes-quiet-while-a-window-is-open", shouted.length === 0,
    shouted.join(", ") || "stamp and flash silent in all " + WINDOWS.length);
  // 대조군. 창을 닫으면 밝기가 돌아와야 한다. 안 돌아오면 위의 하락은 창 때문이 아니다.
  check("control:closing-any-window-puts-every-surface-back", restored.length === 0,
    restored.slice(0, 6).join(", ") || "all restored");

  // 창은 한 번에 하나만 선다. 겹쳐 열면 닫았을 때 무엇이 남는지가 닫아 봐야 안다.
  await p.evaluate(() => window.__shop(true));
  await p.evaluate(() => window.__gym(true));
  await p.waitForTimeout(300);
  const stacked = await p.evaluate((w) => w.filter((id) => !document.getElementById(id).hidden), WINDOWS);
  await p.evaluate((w) => w.forEach((id) => window["__" + id](false)), WINDOWS);
  await p.waitForTimeout(200);
  const leftOpen = await p.evaluate((w) => w.filter((id) => !document.getElementById(id).hidden), WINDOWS);
  check("chrome:opening-a-second-window-closes-the-first", stacked.length === 1 && stacked[0] === "gym",
    stacked.join(", ") || "none open");
  check("control:the-windows-all-shut-again", leftOpen.length === 0, leftOpen.join(", ") || "all shut");

  check("console:no-errors", errs.length === 0, errs.slice(0, 2).join(" | ") || "clean");

  // 소리 아이콘을 다시 그렸으니 토글이 그 그림 위에서도 도는지 본다. 파동이 사라지고 사선이 서야 한다.
  const seeSlash = () => p.evaluate(() => {
    const on = [...document.querySelectorAll("#mute .slash")].filter((e) => Number(getComputedStyle(e).opacity) > 0).length;
    const wave = [...document.querySelectorAll("#mute .wave")].filter((e) => Number(getComputedStyle(e).opacity) > 0).length;
    return { on, wave, pressed: document.getElementById("mute").getAttribute("aria-pressed") };
  });
  const loud = await seeSlash();
  await p.click("#mute", { force: true });
  await p.waitForTimeout(200);
  const quiet = await seeSlash();
  await p.click("#mute", { force: true });
  await p.waitForTimeout(200);
  const loudAgain = await seeSlash();
  check("chrome:muting-swaps-the-waves-for-the-slash",
    loud.wave > 0 && loud.on === 0 && quiet.wave === 0 && quiet.on > 0,
    "loud " + loud.wave + "/" + loud.on + " muted " + quiet.wave + "/" + quiet.on);
  check("control:unmuting-puts-the-waves-back", loudAgain.wave === loud.wave && loudAgain.on === 0,
    loudAgain.wave + "/" + loudAgain.on + " pressed " + loudAgain.pressed);
  await ctx.close();

  if (notes.length) console.log(notes.map((x) => "  ok   " + x).join(LINE));
  if (fails.length) console.log(fails.map((x) => "  FAIL " + x).join(LINE));
  console.log(fails.length ? "chrome FAIL " + fails.length : "chrome PASS " + notes.length);
  if (fails.length) process.exitCode = 1;
} finally {
  clearTimeout(t);
  if (b) await b.close();
}
