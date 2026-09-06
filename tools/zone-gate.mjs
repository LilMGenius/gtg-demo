import { chromium } from "playwright";

// 세 다이빙 버튼이 지금 선호를 말하는지, 봇이 대신 고른 구를 사람이 고른 구와 다르게 말하는지 화소로 재는 자.
// 손 모드의 선택은 한 구짜리 표시가 아니라 다음 구에도 남는 고정 선호다. 안 누르면 그 선호가 그대로 들어가고,
// 봇 크레딧이 있을 때만 봇이 대신 고르며 그 구는 배지로 갈린다.
//
// 축은 넷이다. 대기 상태에 선호 한 쪽이 서 있는가, 누르면 그 쪽으로 옮겨 가는가, 다음 구가 열려도 지워지지 않는가,
// 봇이 고른 구는 배지로 다르게 보이는가. 표시는 클래스가 아니라 화소로 잰다. 클래스가 붙었다는 것과 사람이
// 다르게 본다는 것은 다른 주장이다. 판때기는 .zone > svg 하나뿐이고 .zone svg는 배지 svg까지 여섯을 잡으므로 쓰지 않는다.
const EXE = process.env.LOCALAPPDATA + "/ms-playwright/chromium-1228/chrome-win64/chrome.exe";
const BASE = "http://127.0.0.1:10310/web/index.html?seed=20&preset=veteran";
// 봇 크레딧을 지갑으로 사는 갈래. hand 게이트가 같은 프리셋으로 봇을 세운다.
const RICH = BASE + ",rich";
// 한 구가 끝나고 다음 입력창이 열릴 때까지의 상한. 최장 자막과 재시작보다 길다.
const ROUND_MS = 24000;
// 손 모드 네 구와 봇 여섯 구를 다 끝낼 수 있는 상한. 그보다 길면 멈춘 계기를 살아 있다고 읽는다.
const WATCHDOG_MS = 240000;
// 판때기 평균 밝기가 이만큼 갈리면 사람 눈에 다른 판이다. 실측으로 노란 선호 판 140.0과 대기 판 46.5는 90 넘게 갈린다.
const SEEN = 3;
// 손 안 댄 두 판은 같은 처지라 이 안에서 만나야 한다. 실측 대기 판 둘 0.9, 비활성 판 둘 0.1이고 표시 판의 이탈은 90 이상이다.
const TWIN = 5;
/* 구석 네모는 판때기 밖 배경 위에 앉아 버튼마다 바닥 밝기가 다르다. 실측으로 맨 구석 둘이 배경 때문에
   10.9까지 갈렸고 배지가 붙은 구석은 82 갈렸다. 25면 배경 차이는 품고 배지와는 안 붙는다. */
const CORNER = 25;
// 봇이 선호와 다른 쪽을 고르는 구를 기다리는 상한. 판단력이 낮을수록 세 쪽을 고르게 굴리므로 넷이면 넉넉하다.
const BOT_BALLS = 4;
/* 손 모드 입력창은 비행 0.55~1.1초에 꼬리 0.26초라 가장 짧은 구가 0.81초다. 창이 닫힌 뒤의 누름은
   chooseDive의 phase 관문에서 그대로 돌아가므로 놓친 창은 다음 구에서 다시 잡는다. 세 구를 다 놓치면
   그것은 창이 아니라 화면이 누름을 안 받는 것이다. */
const PRESS_TRIES = 3;
// 누름이 실제 입력으로 커밋됐는지 기다리는 상한. 커밋은 pointerdown과 같은 태스크에서 끝나므로 1초면 넉넉하다.
const PRESS_MS = 1000;
const LINE = String.fromCharCode(10);
const t = setTimeout(() => { console.log("WATCHDOG"); process.exit(1); }, WATCHDOG_MS);
t.unref();

const fails = [], notes = [];
const check = (n, ok, d) => (ok ? notes : fails).push(n + " " + d);
const one = (x) => x.toFixed(1);

/* 한 장의 화면에서 여러 네모의 평균 밝기를 한꺼번에 뽑는다. 네모마다 따로 찍으면 그 사이에 구가 커밋돼
   대기 판(46.5)과 비활성 판(38.0)이 한 표본 안에 섞인다. 실측으로 그 섞임이 같은 처지의 두 판을 8.6까지
   벌려 대조군을 무너뜨렸고, 세 판을 찍는 데 입력창 0.81초를 다 써서 이어지는 누름도 통째로 사라졌다. */
const meter = async (p, rects) => {
  const png = (await p.screenshot()).toString("base64");
  return p.evaluate(([s, rs]) => new Promise((res) => {
    const im = new Image();
    im.onload = () => {
      // 이미지 폭과 뷰포트 폭이 다르면 네모도 그만큼 커진다. 배율을 안 재면 잘라 낸 자리가 밀린다.
      const k = im.width / window.innerWidth;
      const cv = document.createElement("canvas");
      cv.width = im.width; cv.height = im.height;
      const g = cv.getContext("2d");
      g.drawImage(im, 0, 0);
      res(rs.map((r) => {
        const d = g.getImageData(Math.round(r.x * k), Math.round(r.y * k),
          Math.max(1, Math.round(r.width * k)), Math.max(1, Math.round(r.height * k))).data;
        let sum = 0;
        for (let i = 0; i < d.length; i += 4) sum += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
        return sum / (d.length / 4);
      }));
    };
    im.src = "data:image/png;base64," + s;
  }), [png, rects]);
};
/* 색이 칠해지는 것은 svg 판이므로 버튼이 아니라 그 판의 네모를 잰다. 버튼째 재면 대부분이 투명한 여백이라
   표시가 붙어도 평균이 0.3밖에 안 움직였다. */
const plateRects = (p) => p.locator(".zone > svg").evaluateAll((es) => es.map((e) => {
  const r = e.getBoundingClientRect();
  return { x: r.x, y: r.y, width: r.width, height: r.height };
}));
/* 배지가 뜬 버튼에서 그 작은 네모의 자리를 재고 같은 자리를 세 버튼에 옮겨 놓는다. 배지는 버튼 오른쪽 끝에
   붙으므로 오른쪽 모서리에서 같은 거리를 뗀다. 안 뜬 배지는 display:none이라 상자가 없어 직접 못 잰다. */
const cornerRects = (p) => p.evaluate(() => {
  const zs = [...document.querySelectorAll(".zone")];
  const k = zs.findIndex((z) => z.querySelector(".bot:not([hidden])"));
  if (k < 0) return null;
  const b = zs[k].querySelector(".bot").getBoundingClientRect();
  const base = zs[k].getBoundingClientRect();
  return zs.map((z) => {
    const r = z.getBoundingClientRect();
    return { x: r.right - (base.right - b.x), y: b.y, width: b.width, height: b.height };
  });
});
const marks = (p) => p.evaluate(() => [...document.querySelectorAll(".zone")].map((b) => ({
  dive: Number(b.dataset.dive),
  pref: b.classList.contains("pref"),
  pressed: b.getAttribute("aria-pressed"),
  badge: Boolean(b.querySelector(".bot:not([hidden])")),
  off: b.disabled,
})));
const open = (p) => p.waitForFunction(() => document.querySelectorAll(".zone:not([disabled])").length === 3, null, { timeout: ROUND_MS });
// 한 구가 커밋되는 순간. commit이 setPad(false)와 markDive를 같은 태스크에서 끝내므로 그 구가 그린 표시를 본다.
const shut = (p) => p.waitForFunction(() => [...document.querySelectorAll(".zone")].every((b) => b.disabled), null, { timeout: ROUND_MS });
/* 첫 입력창은 #hud가 0.3초 동안 떠오르는 도중에 열린다. 그 사이에 찍은 판 셋은 같은 판인데도 밝기가
   28 갈렸다. 판을 찍는 것은 덮개가 완전히 뜬 뒤여야 한다. */
const settled = (p) => p.waitForFunction(() => getComputedStyle(document.getElementById("hud")).opacity === "1", null, { timeout: 5000 });
/* 판때기는 색과 그림자를 0.12초에 걸쳐 바꾼다. 그 중간에 찍은 두 판은 같은 판인데 5.2 갈렸다. 전환이 다 끝난 뒤에 찍는다. */
const calm = (p) => p.waitForFunction(() => [...document.querySelectorAll(".zone > svg")].every((s) => s.getAnimations().length === 0), null, { timeout: 5000 });
/* 창이 열려 있는 동안 왼쪽 기둥 버튼은 -96px로 밀려 화면 밖에 선다(hud.css 945). 닫으면 0.24초에 걸쳐
   돌아오므로 그 사이의 누름은 뷰포트 밖이라는 이유로 거절된다. 실측으로 상점을 닫자마자 누른 자동 버튼이
   그렇게 죽었다. 자리로 돌아오고 미끄러짐이 끝난 뒤에 누른다. */
const back = (p, sel) => p.waitForFunction((s) => {
  const e = document.querySelector(s);
  return Boolean(e) && e.getBoundingClientRect().x >= 0 && e.getAnimations().length === 0;
}, sel, { timeout: 5000 });
const waitRound = async (p) => {
  const before = await p.evaluate(() => document.querySelectorAll("#pips i.gone, #pips i.save").length);
  await p.waitForFunction((n) => document.querySelectorAll("#pips i.gone, #pips i.save").length > n, before, { timeout: ROUND_MS });
  await open(p);
};
const onlyAt = (ms, dive, key) => ms.length === 3 && ms.every((m) => m[key] === (m.dive === dive));
const iOf = (ms, dive) => ms.findIndex((m) => m.dive === dive);
const fmt = (ms) => ms.map((m) => (m.pref ? "pref" : "") + (m.badge ? "+bot" : "")).map((s) => s || "-").join("/");
const away = (xs, i) => {
  const [a, b] = xs.filter((_, k) => k !== i);
  return { twin: Math.abs(a - b), gap: Math.min(Math.abs(xs[i] - a), Math.abs(xs[i] - b)) };
};
/* 한 프레임을 뜬다. 입력창은 열렸다가 닫히기만 하므로 찍은 뒤에 읽은 표시가 열림이면 찍는 동안도 열려
   있었다. 찍기 전에 읽으면 셔터가 늦었을 때 열린 표시와 닫힌 판때기가 한 표본에 섞인다. */
const frame = async (p, rects) => {
  await calm(p);
  const lum = await meter(p, rects);
  return { lum, ms: await marks(p) };
};

let browser;
try {
  browser = await chromium.launch({ executablePath: EXE });
  const errs = [];
  const start = async (url) => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const p = await ctx.newPage();
    p.on("pageerror", (e) => errs.push(String(e)));
    p.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
    await p.goto(url, { waitUntil: "load" });
    await p.waitForSelector("#go", { timeout: ROUND_MS });
    await p.click("#go", { force: true });
    await open(p);
    return { ctx, p };
  };
  const press = (p) => p.locator('.zone[data-dive="-1"]').dispatchEvent("pointerdown");
  /* 누름이 화면에 닿았는지는 클래스가 아니라 실제로 커밋된 입력으로 확인한다. 선호는 가운데에서 시작하므로
     왼쪽이 손으로 들어간 구는 누름이 창 안에 들어갔다는 뜻이다. */
  const took = (p) => p.waitForFunction(() => window.__lastInput?.dive === -1 && window.__lastInput?.auto === false,
    null, { timeout: PRESS_MS }).then(() => true).catch(() => false);

  // 손 모드. 대기 상태에 선호가 서 있고, 누르면 옮겨 가고, 다음 구에도 남는다.
  {
    const { ctx, p } = await start(BASE);
    await settled(p);
    const rects = await plateRects(p);
    let restMarks = [], rest = [], shutter = 0, tries = 0, hit = false;
    // 대기 판을 찍고 곧바로 누른다. 창을 놓치면 그 구는 선호대로 날아가므로 다음 구에서 같은 순서를 다시 밟는다.
    for (; tries < PRESS_TRIES && !hit; tries += 1) {
      const t0 = Date.now();
      const f = await frame(p, rects);
      shutter = Date.now() - t0;
      rest = f.lum; restMarks = f.ms;
      await press(p);
      hit = await took(p);
      if (!hit) await waitRound(p);
    }
    check("instrument:the-pad-opens-with-one-standing-preference-and-no-badge",
      onlyAt(restMarks, 0, "pref") && restMarks.every((m) => !m.badge && !m.off),
      fmt(restMarks) + " 표본 " + shutter + "ms");
    check("control:the-press-landed-inside-the-input-window",
      hit, hit ? "hand input on ball " + tries : "no press committed in " + PRESS_TRIES + " balls");
    const r0 = away(rest, iOf(restMarks, 0));
    check("control:the-two-unpreferred-plates-match-each-other",
      r0.twin < TWIN, "left " + one(rest[0]) + " right " + one(rest[2]) + " apart " + one(r0.twin));
    check("zone:the-standing-preference-actually-looks-different",
      r0.gap > SEEN && r0.gap > r0.twin * 4,
      "centre " + one(rest[1]) + " against " + one(rest[0]) + " and " + one(rest[2]));

    // 누른 구가 나는 동안. 표시는 왼쪽으로 옮겨 갔고 가운데는 나머지와 같은 판으로 돌아갔다.
    const air = await frame(p, rects);
    const pressed = air.lum, pressedMarks = air.ms;
    check("zone:the-pressed-side-takes-the-mark",
      onlyAt(pressedMarks, -1, "pref") && pressedMarks.every((m) => m.pressed === String(m.dive === -1)) && pressedMarks.every((m) => !m.badge),
      fmt(pressedMarks) + " aria " + pressedMarks.map((m) => m.pressed).join("/"));
    /* 구를 커밋하면 세 버튼이 전부 비활성으로 흐려지므로 기준선과의 차는 표시가 아니라 비활성의 것이다.
       안 누른 둘은 서로 같은 처지이므로 둘 사이의 차가 대조군이고, 그 차보다 누른 쪽의 이탈이 커야 한다.
       비활성은 화살표를 36% 알파로 죽여 글리프 모양 차이까지 같이 죽이므로 여기서는 가운데와 오른쪽이
       한 짝으로 선다. 실측 0.2. */
    const r1 = away(pressed, iOf(pressedMarks, -1));
    check("control:the-two-untouched-plates-match-each-other-while-the-ball-flies",
      r1.twin < TWIN, "centre " + one(pressed[1]) + " right " + one(pressed[2]) + " apart " + one(r1.twin));
    check("zone:the-pressed-side-actually-looks-different",
      r1.gap > SEEN && r1.gap > r1.twin * 4,
      "left " + one(pressed[0]) + " against " + one(pressed[1]) + " and " + one(pressed[2]));

    /* 다음 구가 열려도 선호는 지워지지 않는다. 한 구짜리 표시였던 시절의 축을 뒤집은 자리다.
       셔터가 늦어 창이 닫힌 프레임은 판 셋이 통째로 흐려져 시간축 대조군이 무너지므로 다음 구에서 다시 뜬다. */
    let keptMarks = [], kept = [];
    for (let i = 0; i < PRESS_TRIES; i += 1) {
      await waitRound(p);
      const f = await frame(p, rects);
      kept = f.lum; keptMarks = f.ms;
      if (keptMarks.every((m) => !m.off)) break;
    }
    /* 이 프레임에서는 같은 순간의 두 무표시 판이 대조군이 못 된다. 가운데 화살표가 옆 화살표보다 굵어서
       켜져 있을 때 구조적으로 밝다. 실측으로 대기 상태의 좌우 두 판은 0.1로 만나지만 가운데와 오른쪽은
       7.0 갈리고, 그 차는 표시가 아니라 글리프 모양이다. 그래서 대조군을 시간축에서 잡는다.
       한 번도 선호였던 적이 없는 오른쪽 판은 대기 프레임과 이 프레임에서 같은 값을 읽어야 한다. */
    const iR = iOf(keptMarks, 1);
    const drift = Math.abs(kept[iR] - rest[iR]);
    const r2 = away(kept, iOf(keptMarks, -1));
    check("control:the-never-preferred-plate-reads-the-same-on-the-next-ball",
      drift < TWIN && keptMarks.every((m) => !m.off),
      "right " + one(rest[iR]) + " then " + one(kept[iR]) + " apart " + one(drift));
    check("zone:the-next-ball-keeps-the-preference",
      onlyAt(keptMarks, -1, "pref") && keptMarks.every((m) => !m.badge), fmt(keptMarks));
    check("zone:the-kept-preference-still-looks-different",
      r2.gap > SEEN && r2.gap > drift * 4,
      "left " + one(kept[0]) + " against " + one(kept[1]) + " and " + one(kept[2]));

    /* 대조군. 크레딧이 없는 무입력 구는 배지를 안 그리고 선호도 안 움직인다. 그 구가 커밋되는 순간에 재야
       그 구의 markDive가 그린 것을 본다. 다음 창이 열린 뒤에 재면 새 구가 다시 그린 것을 보게 된다. */
    await shut(p);
    const idleMarks = await marks(p);
    const idle = await p.evaluate(() => ({ dive: window.__lastInput?.dive, auto: window.__lastInput?.auto }));
    check("control:an-uncredited-untapped-ball-paints-no-badge-and-keeps-the-side",
      onlyAt(idleMarks, -1, "pref") && idleMarks.every((m) => !m.badge) && idle.dive === -1 && idle.auto === false,
      fmt(idleMarks) + " input " + JSON.stringify(idle));
    await ctx.close();
  }

  // 봇. 선호를 왼쪽에 세운 뒤 크레딧을 사고 자동을 켠다. 봇이 선호와 다른 쪽을 고른 구에서만 배지가 선호와
  // 갈리는지 잴 수 있다. 같은 쪽을 골라 겹친 구는 증거가 아니므로 갈리는 구가 올 때까지 기다리고, 끝내 안 오면
  // unmeasured로 떨어뜨린다. 배지는 다음 구가 열리면 걷히므로 그 구가 나는 동안 찍는다.
  {
    const { ctx, p } = await start(RICH);
    const rects = await plateRects(p);
    let hit = false;
    for (let i = 0; i < PRESS_TRIES && !hit; i += 1) {
      await press(p);
      hit = await took(p);
      if (!hit) await waitRound(p);
    }
    await waitRound(p);
    await back(p, "#auto");
    await p.click("#auto", { force: true });
    await p.waitForSelector('.buy[data-bot="1"]', { timeout: ROUND_MS });
    await p.click('.buy[data-bot="1"]', { force: true });
    await p.click("#shop .close", { force: true });
    await back(p, "#auto");
    await p.click("#auto", { force: true });
    const armed = await p.evaluate(() => ({
      bot: window.__bot().ms > 0,
      auto: document.getElementById("auto").classList.contains("on"),
      pref: [...document.querySelectorAll(".zone.pref")].map((b) => Number(b.dataset.dive)),
    }));
    check("control:wallet-bought-a-live-bot-and-enabled-auto-with-the-preference-on-the-left",
      hit && armed.bot && armed.auto && armed.pref.length === 1 && armed.pref[0] === -1, JSON.stringify(armed));
    /* 한 구씩 세면서 갈린 구를 찾는다. 한 번의 기다림이 한 구를 넘지 않아야 멈춘 화면과 안 갈린 봇을 구별한다. */
    let split = false, ball = 0;
    for (; ball < BOT_BALLS && !split; ball += 1) {
      await shut(p);
      const s = await p.evaluate(() => ({
        ran: window.__botRan(),
        dive: window.__lastInput?.dive,
        badge: [...document.querySelectorAll(".zone")].some((b) => b.classList.contains("bot")),
      }));
      split = s.ran === true && Number.isFinite(s.dive) && s.dive !== -1 && s.badge;
      if (!split) await open(p);
    }
    check("instrument:the-bot-chose-a-side-other-than-the-standing-preference",
      split, split ? "split on bot ball " + ball : "unmeasured: no bot ball left the preferred side within " + BOT_BALLS + " balls");
    if (split) {
      // 자동을 끈다. 다음 구가 손 모드로 열려야 걷힌 배지를 찍을 시간이 있다.
      await back(p, "#auto");
      await p.click("#auto", { force: true });
      const corners = await cornerRects(p);
      await calm(p);
      const botMarks = await marks(p);
      const botDive = await p.evaluate(() => window.__lastInput?.dive);
      // 판 셋과 구석 셋을 한 프레임에서 잘라야 두 표시를 같은 순간으로 견준다.
      const lit = await meter(p, rects.concat(corners));
      const plate = lit.slice(0, 3), corner = lit.slice(3);
      const k = botMarks.findIndex((m) => m.badge);
      const h = iOf(botMarks, -1);
      check("zone:a-bot-ball-marks-the-side-the-bot-chose",
        k >= 0 && botMarks.filter((m) => m.badge).length === 1 && botMarks[k].dive === botDive && onlyAt(botMarks, -1, "pref"),
        fmt(botMarks) + " bot dive " + botDive);
      if (k >= 0) {
        const c0 = away(corner, k);
        check("control:the-two-bare-corners-match-each-other",
          c0.twin < CORNER, "bare " + one(corner[(k + 1) % 3]) + " and " + one(corner[(k + 2) % 3]) + " apart " + one(c0.twin));
        check("zone:the-bot-badge-actually-looks-different-from-a-bare-corner",
          c0.gap > SEEN && c0.gap > c0.twin * 4, "badge " + one(corner[k]) + " against bare by " + one(c0.gap));
        check("zone:the-bot-mark-and-the-hand-mark-do-not-look-the-same",
          Math.abs(plate[h] - plate[k]) > SEEN && Math.abs(corner[h] - corner[k]) > SEEN,
          "plates hand " + one(plate[h]) + " bot " + one(plate[k]) + ", corners hand " + one(corner[h]) + " bot " + one(corner[k]));
        // 다음 구가 열리면 배지는 걷히고 선호는 남는다. 클래스가 아니라 같은 구석의 화소로 잰다.
        await open(p);
        await calm(p);
        const afterMarks = await marks(p);
        const after = (await meter(p, rects.concat(corners))).slice(3);
        const c1 = away(after, k);
        check("zone:the-next-ball-clears-the-badge-but-not-the-preference",
          afterMarks.every((m) => !m.badge) && onlyAt(afterMarks, -1, "pref"), fmt(afterMarks));
        check("zone:the-cleared-corner-matches-a-bare-corner-in-pixels",
          c1.gap < CORNER && Math.abs(after[k] - corner[k]) > SEEN,
          "cleared " + one(after[k]) + " off bare by " + one(c1.gap) + ", was " + one(corner[k]));
      }
    }
    await ctx.close();
  }

  check("console:no-errors", errs.length === 0, errs.slice(0, 2).join(" | ") || "clean");
  console.log("표본 범위: veteran 손 모드 대기·왼쪽 누름·다음 두 구, rich 크레딧 봇 한 구와 그 다음 구, 1280x720");
  if (notes.length) console.log(notes.map((x) => "  ok   " + x).join(LINE));
  if (fails.length) console.log(fails.map((x) => "  FAIL " + x).join(LINE));
  console.log(fails.length ? "zone FAIL " + fails.length : "zone PASS " + notes.length);
  if (fails.length) process.exitCode = 1;
} finally {
  clearTimeout(t);
  if (browser) await browser.close();
}
