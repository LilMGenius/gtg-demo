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
   판정에 안 들어가고 선호만 옮기므로(main.mjs chooseDive) 놓친 창은 다음 구에서 다시 잡는다. 세 구를 다 놓치면
   그것은 창이 아니라 화면이 누름을 안 받는 것이다. */
const PRESS_TRIES = 3;
// 누름이 실제 입력으로 커밋됐는지 기다리는 상한. 커밋은 pointerdown과 같은 태스크에서 끝나므로 1초면 넉넉하다.
const PRESS_MS = 1000;
/* 자막 한 줄은 제 타이머로 0.85초를 산다(main.mjs rollCaptions). 막 선 줄에서 누르면 다음 걸음까지
   그만큼 남으므로, 이 안에 줄이 바뀌면 그 걸음은 타이머가 아니라 손가락이다. */
const SKIP_MS = 250;
/* 심은 disabled를 프레임마다 세는 창. 비행 한 마디보다 짧아야 그 구를 안 넘기고 도로 뽑는다. */
const PLANT_MS = 200;
const LINE = String.fromCharCode(10);
const t = setTimeout(() => { console.log("WATCHDOG"); process.exit(1); }, WATCHDOG_MS);
t.unref();

const fails = [], notes = [];
const check = (n, ok, d) => (ok ? notes : fails).push(n + " " + d);
const one = (x) => x.toFixed(1);
/* 화소가 다르다고 부를 채널 차이와, 도는 것을 증명하는 최소 몫. thumb-gate가 호버 회전에 쓰는 두 수 그대로다. */
const TURN_DELTA = 8;
const TURN_SHARE = 0.02;
/* 사람이 봤다고 부를 화소 몫. wiki와 mepane의 그늘 축이 쓰는 바닥과 같은 수다. */
const SEEN_SHARE = 0.12;
/* 판때기 셋이 한 줄을 나눠 가질 때 허락하는 어긋남. chrome-gate의 리듬 축과 같은 여유이고,
   정수로 끊기는 offset과 소수로 오는 상자를 같이 품는다. */
const TILE_TOL = 2;
/* 길이 어느 쪽으로 갈라져도 판정 줄 수는 이만큼이다. 줄 수를 세는 축 자신은 빼고 센 값이다. */
const ROWS = 31;
/* 봇이 갈린 구를 안 내주면 그 뒤 축들은 잴 기회가 없다. 그때 줄을 통째로 빼면 못 잰 축이 통과한 축으로
   읽히고 판정 수만 조용히 줄어든다. 못 쟀다고 적어 빨간 줄로 남긴다. */
const unmeasured = (names, why) => { for (const n of names) check(n, false, "unmeasured: " + why); };
const BADGE_AXES = [
  "control:the-two-bare-corners-match-each-other",
  "zone:the-bot-badge-actually-looks-different-from-a-bare-corner",
  "zone:the-bot-mark-and-the-hand-mark-do-not-look-the-same",
  "zone:the-next-ball-clears-the-badge-but-not-the-preference",
  "zone:the-cleared-corner-matches-a-bare-corner-in-pixels",
];
const SPLIT_AXES = ["zone:a-bot-ball-marks-the-side-the-bot-chose"].concat(BADGE_AXES);

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
  off: !b.classList.contains("live"),
})));
const open = (p) => p.waitForFunction(() => document.querySelectorAll(".zone.live").length === 3, null, { timeout: ROUND_MS });
// 한 구가 커밋되는 순간. commit이 setPad(false)와 markDive를 같은 태스크에서 끝내므로 그 구가 그린 표시를 본다.
const shut = (p) => p.waitForFunction(() => [...document.querySelectorAll(".zone")].every((b) => !b.classList.contains("live")), null, { timeout: ROUND_MS });
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
/* 프레임마다 패드를 훑는 자. 한 구는 대기와 비행과 자막과 쉬는 참으로 마디를 갈아타므로 스냅숏 한 장은
   그중 한 마디만 본다. 죽은 단추가 한 프레임도 없다는 말은 프레임마다 세야 주장이 된다.
   마디는 자막으로 읽는다. 커밋이 자막을 비우고(main.mjs commit) 되감기 줄만 .tick을 달기 때문에,
   빈 자막은 비행이고 .tick이 붙은 줄은 쉬는 참이며 나머지는 글자가 선 마디다. */
const watch = (p) => p.evaluate(() => {
  if (window.__zpad) window.__zpad.on = false;
  const s = { on: true, frames: 0, off: 0, air: 0, line: 0, rest: 0, first: null };
  window.__zpad = s;
  const tick = () => {
    if (!s.on) return;
    const dead = [...document.querySelectorAll(".zone")].filter((z) => z.hasAttribute("disabled"));
    s.frames += 1;
    if (dead.length) { s.off += 1; if (!s.first) s.first = dead.map((z) => z.dataset.dive).join("/"); }
    const cap = document.getElementById("caption");
    if (!cap.textContent.trim()) s.air += 1;
    else if (cap.querySelector(".tick")) s.rest += 1;
    else s.line += 1;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
});
const reap = (p) => p.evaluate(() => {
  const s = window.__zpad;
  s.on = false;
  return { frames: s.frames, off: s.off, air: s.air, line: s.line, rest: s.rest, first: s.first };
});
const sayWatch = (w) => w.off + " of " + w.frames + " frames carried disabled (" + (w.first || "none")
  + "), phases air " + w.air + " line " + w.line + " rest " + w.rest;
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
      /* 손 안 댄 판을 찍는 것은 첫 시도뿐이다. 놓친 누름도 이제 선호를 옮기므로, 두 번째 창의 판때기는
         이미 한쪽이 서 있는 판이고 아무도 안 누른 대기 상태의 기준선이 아니다. */
      if (!tries) { shutter = Date.now() - t0; rest = f.lum; restMarks = f.ms; }
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
    /* 판을 견주는 축은 두 종류이고, 가운데 판이 낀 같은 순간 비교는 믿을 수 없다. 가운데 화살표가 옆
       화살표보다 굵어서 판이 켜져 있는 것만으로 5.3에서 7.0 밝고, 그 수가 SEEN 3을 넘는다. 실제로 pref
       클래스를 통째로 뗀 화면에서 가운데 50.0 대 44.6/44.7이 초록으로 지나간 적이 있다. 좌우 두 판은
       서로 거울이라 0.1로 만나므로 같은 순간에 견줄 수 있는 짝은 그것뿐이다. 나머지는 시간축으로 옮긴다.
       아래 두 축이 그것이고, 둘 다 패드가 열린 두 프레임만 쓴다. 비활성 흐림이 섞이면 표시와 구별이 안 된다.
       계기가 두 프레임 사이에 흔들렸는지는 한 번도 선호가 아니었던 오른쪽 판이 잰다. */
    const iR = iOf(keptMarks, 1);
    const iC = iOf(restMarks, 0);
    const drift = Math.abs(kept[iR] - rest[iR]);
    // 표시의 폭. 누름이 선호를 왼쪽으로 옮긴 뒤 가운데 판은 한 번도 선호가 아니므로 두 프레임의 차가 그것이다.
    const shed = Math.abs(rest[iC] - kept[iC]);
    const r2 = away(kept, iOf(keptMarks, -1));
    check("control:the-never-preferred-plate-reads-the-same-on-the-next-ball",
      drift < TWIN && keptMarks.every((m) => !m.off),
      "right " + one(rest[iR]) + " then " + one(kept[iR]) + " apart " + one(drift));
    check("zone:the-standing-preference-actually-looks-different",
      shed > SEEN && shed > drift * 4,
      "centre " + one(rest[iC]) + " preferred then " + one(kept[iC]) + " bare, shed " + one(shed));
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

  /* 일반 앱 UX 문법 둘. 위의 축들은 이 게임의 선호와 배지를 알아야 읽히지만, 아래 둘은 게임을 몰라도
     잡히는 자리다. 표면마다 도메인 축 옆에 같은 문법을 세운다는 래칫의 요구가 여기에 서는 자리다.
     하나. 상태를 바꾼 조작이 그 밑의 정지 그림을 실제로 갈아 끼우는가. 위의 판때기 축들은 네모 안 평균
     밝기를 견주므로 판이 조금 밝아지기만 해도 초록이 난다. 이 자는 같은 판때기를 선호 전후로 두 장 찍어
     실제로 바뀐 화소의 몫을 세고, 바닥은 한 번도 선호가 아닌 이웃 판때기가 같은 두 순간에 움직인 몫이다.
     thumb-gate가 호버 회전에 쓰는 자와 같은 식이고 채널 차 8과 몫 0.02도 그 자의 수다.
     둘. 세 판때기가 한 줄을 빈 칸 없이 채우는가. #pad 한 줄을 flex:1 셋이 나눠 갖는 자리라, 칸 하나가
     빠지면 그 자리가 배경으로 남고 남은 둘이 넓어진다. 문법 다섯 중 창 열림은 hand-gate가 같은 패드에서
     이미 재므로 여기에 두 번 세우지 않는다.
     판을 잠그고 잰다. 구가 굴러가면 두 프레임 사이에 공과 자막이 바뀌어, 센 화소가 판때기가 아니라 그
     판의 것이 된다. 잠긴 판에서 패드는 흐려지지만 선호 표기는 그대로 칠해진다. hud.css에서
     .zone.pref>svg가 .zone:not(.live) svg 뒤에 서서 같은 특이도로 이기기 때문이다. 선호를 옮기는 것은
     pointerdown이고 그 자리에는 창 관문이 없으므로, 잠긴 판에서도 사람 손가락과 같은 길로 옮겨 간다. */
  {
    const { ctx, p } = await start(BASE);
    await settled(p);
    await p.evaluate(() => window.__lockRound());
    await p.waitForTimeout(800);
    await calm(p);
    const rects = await plateRects(p);
    const shotOf = () => p.screenshot().then((x) => x.toString("base64"));
    /* 두 장에서 같은 네모를 잘라 바뀐 화소의 몫을 센다. 이미지 폭과 뷰포트 폭의 배율은 meter와 같은
       이유로 다시 잰다. 잘라 내는 자리가 밀리면 안 움직인 판때기도 통째로 움직인 것으로 읽힌다. */
    const shareOf = (one, two, box) => p.evaluate(([a, c, r, d]) => Promise.all([a, c].map((s) => new Promise((res) => {
      const im = new Image();
      im.onload = () => {
        const k = im.width / window.innerWidth;
        const cv = document.createElement("canvas");
        cv.width = Math.max(1, Math.round(r.width * k));
        cv.height = Math.max(1, Math.round(r.height * k));
        const g = cv.getContext("2d");
        g.drawImage(im, Math.round(r.x * k), Math.round(r.y * k), cv.width, cv.height, 0, 0, cv.width, cv.height);
        res(g.getImageData(0, 0, cv.width, cv.height));
      };
      im.src = "data:image/png;base64," + s;
    }))).then(([u, v]) => {
      if (u.width !== v.width || u.height !== v.height) return -1;
      let n = 0;
      for (let i = 0; i < u.data.length; i += 4) {
        const m = Math.max(Math.abs(u.data[i] - v.data[i]), Math.abs(u.data[i + 1] - v.data[i + 1]), Math.abs(u.data[i + 2] - v.data[i + 2]));
        if (m > d) n += 1;
      }
      return n / (u.width * u.height);
    }), [one, two, box, TURN_DELTA]);
    // 손가락과 같은 길로 누른다. 좌표로 눌러야 히트테스트를 지나고, 선호를 옮기는 것은 손이 올라오는 순간이다.
    const tapPad = async (dive) => {
      const box = await p.locator('.zone[data-dive="' + dive + '"]').boundingBox();
      await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await p.mouse.down();
      await p.mouse.up();
    };
    const tile = () => p.evaluate(() => {
      const zs = [...document.querySelectorAll(".zone")];
      const r = zs.map((z) => z.getBoundingClientRect());
      const host = document.getElementById("pad").getBoundingClientRect();
      return { w: r.map((q) => +q.width.toFixed(2)), gaps: r.slice(1).map((q, i) => +(q.left - r[i].right).toFixed(2)),
        lead: +(r[0].left - host.left).toFixed(2), trail: +(host.right - r[2].right).toFixed(2) };
    });
    const tiled = (t) => {
      const spread = +(Math.max.apply(null, t.w) - Math.min.apply(null, t.w)).toFixed(2);
      const holes = t.gaps.filter((g) => Math.abs(g) > TILE_TOL);
      const edge = Math.max(Math.abs(t.lead), Math.abs(t.trail));
      return { spread: spread, holes: holes, edge: edge, ok: spread <= TILE_TOL && holes.length === 0 && edge <= TILE_TOL };
    };
    const sayTile = (t, v) => "widths " + t.w.join("/") + " spread " + v.spread + ", gaps " + t.gaps.join("/")
      + ", row edges " + t.lead + " and " + t.trail;

    const bareLook = await p.evaluate(() => {
      const s = getComputedStyle(document.querySelectorAll(".zone > svg")[0]);
      return { color: s.color, background: s.backgroundColor, shadow: s.boxShadow };
    });
    const before = await shotOf();
    const beforeMarks = await marks(p);
    await tapPad(-1);
    await p.waitForFunction(() => document.querySelector('.zone[data-dive="-1"]').classList.contains("pref"),
      null, { timeout: 3000 }).catch(() => {});
    await calm(p);
    const after = await shotOf();
    const afterMarks = await marks(p);
    const gained = await shareOf(before, after, rects[0]);
    const resting = await shareOf(before, after, rects[2]);
    check("ux:the-standing-preference-repaints-the-pad-in-rendered-pixels",
      onlyAt(beforeMarks, 0, "pref") && onlyAt(afterMarks, -1, "pref")
        && gained > resting + TURN_SHARE && gained >= SEEN_SHARE,
      (gained * 100).toFixed(1) + "% of the left plate moved when the preference landed on it, a never-preferred neighbour "
      + (resting * 100).toFixed(1) + "%, floor " + Math.max((resting + TURN_SHARE) * 100, SEEN_SHARE * 100).toFixed(1)
      + "%, marks " + fmt(beforeMarks) + " then " + fmt(afterMarks));
    /* 대조군. 표기가 아무것도 안 칠하면 위 축은 빨개져야 한다. 선호는 그대로 둔 채 그 판때기에
       선호 이전의 색과 바탕과 그림자를 도로 심어, 표기만 든 채 그림은 안 바뀐 화면을 만든다. */
    await p.evaluate((look) => {
      const s = document.querySelectorAll(".zone > svg")[0].style;
      s.color = look.color; s.background = look.background; s.boxShadow = look.shadow;
    }, bareLook);
    await p.waitForTimeout(220);
    const planted = await shotOf();
    const plantShare = await shareOf(before, planted, rects[0]);
    await p.evaluate(() => {
      const s = document.querySelectorAll(".zone > svg")[0].style;
      s.color = ""; s.background = ""; s.boxShadow = "";
    });
    await p.waitForTimeout(220);
    const backMarks = await marks(p);
    check("control:a-preference-that-paints-nothing-reddens-the-repaint-axis",
      plantShare < resting + TURN_SHARE && plantShare < SEEN_SHARE && onlyAt(backMarks, -1, "pref"),
      "the marked plate wearing its bare paint moves " + (plantShare * 100).toFixed(1) + "% against the "
      + Math.max((resting + TURN_SHARE) * 100, SEEN_SHARE * 100).toFixed(1) + "% floor, restored to " + fmt(backMarks));

    const row = await tile();
    const rowOk = tiled(row);
    check("ux:the-three-pads-tile-the-row-with-no-vacated-slot", rowOk.ok,
      rowOk.holes.length ? "gap " + rowOk.holes.join("/") + "px between pads, " + sayTile(row, rowOk)
        : rowOk.spread > TILE_TOL ? "pads differ by " + rowOk.spread + "px, " + sayTile(row, rowOk)
          : sayTile(row, rowOk));
    // 대조군. 가운데 판때기 앞에 46px을 심으면 그 줄에 빈 칸이 생기고 위 축이 그것을 봐야 한다.
    await p.evaluate(() => { document.querySelectorAll(".zone")[1].style.marginLeft = "46px"; });
    await p.waitForTimeout(160);
    const hurt = await tile();
    const hurtOk = tiled(hurt);
    await p.evaluate(() => { document.querySelectorAll(".zone")[1].style.marginLeft = ""; });
    await p.waitForTimeout(160);
    const healed = tiled(await tile());
    check("control:a-planted-46px-hole-reddens-the-tiling-axis",
      hurtOk.ok === false && healed.ok === rowOk.ok,
      "planted " + sayTile(hurt, hurtOk) + ", restored to " + healed.ok);
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
      } else unmeasured(BADGE_AXES, "the split ball carried no badged button");
    } else unmeasured(SPLIT_AXES, "no bot ball left the preferred side within " + BOT_BALLS + " balls");
    await ctx.close();
  }

  /* 입력 문법 셋. 위의 축들은 판때기의 칠을 재므로 누름이 무엇을 뜻하는지가 어긋나도 초록이 난다.
     여기서 재는 것은 칠이 아니라 한 번의 누름이 한 뜻을 갖는가다. 방향 선택은 판이 사는 동안 언제든
     바뀌므로 창은 판정을 받는 구간일 뿐이고, 창 밖의 누름도 방향이다. */
  {
    const { ctx, p } = await start(BASE);
    await settled(p);
    await watch(p);
    const capOf = () => p.evaluate(() => document.getElementById("caption").textContent.trim());
    const pressedOn = (ms, dive) => ms.length === 3 && ms.every((m) => m.pressed === String(m.dive === dive));
    const prefOf = (ms) => { const m = ms.find((x) => x.pref); return m ? m.dive : null; };
    // 손가락. 좌표로 눌러야 히트테스트를 지난다. 뗌은 따로 보내 누름 하나만 읽는다.
    const fingerDown = async (dive) => {
      const box = await p.locator('.zone[data-dive="' + dive + '"]').boundingBox();
      await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await p.mouse.down();
    };

    /* 하나. 방향키는 창 밖에서도 선호를 옮긴다. 이 구의 판정은 이미 굴러갔으므로 __lastInput은 그대로여야
       하고 눌린 표시만 옮겨 가야 한다. 창이 닫힌 뒤에 눌러야 창 밖이다. */
    await shut(p);
    const flew = await p.evaluate(() => window.__lastInput);
    const keyBefore = await marks(p);
    await p.keyboard.press("ArrowRight");
    await p.waitForFunction(() => document.querySelector('.zone[data-dive="1"]').getAttribute("aria-pressed") === "true",
      null, { timeout: SKIP_MS }).catch(() => {});
    const keyAfter = await marks(p);
    const keyInput = await p.evaluate(() => window.__lastInput);
    check("ux:an-arrow-key-outside-the-window-moves-the-preference",
      pressedOn(keyBefore, 0) && pressedOn(keyAfter, 1) && prefOf(keyAfter) === 1
        && keyInput && flew && keyInput.dive === flew.dive && keyInput.errMs === flew.errMs && keyInput.auto === flew.auto,
      "aria " + keyBefore.map((m) => m.pressed).join("/") + " then " + keyAfter.map((m) => m.pressed).join("/")
      + ", the flying ball judged " + JSON.stringify(flew) + " then " + JSON.stringify(keyInput));

    /* 둘. 자막 위의 누름 한 번은 넘기기이면서 방향이다. 손가락이 내려간 채로 읽는 이유는 그 둘이 누름과
       뗌에 나뉘어 있었기 때문이다. 나뉘어 있으면 같은 손짓이 두 뜻을 갖고, 뗌이 안 오는 누름은 방향을
       잃는다. 자막 한 줄은 제 타이머로 0.85초를 사니 SKIP_MS 안의 걸음은 타이머가 아니라 손가락이다. */
    await p.waitForFunction(() => {
      const c = document.getElementById("caption");
      return Boolean(c.textContent.trim()) && !c.querySelector(".tick");
    }, null, { timeout: ROUND_MS });
    const line = await capOf();
    const capBefore = await marks(p);
    const t0 = Date.now();
    await fingerDown(-1);
    const stepped = await p.waitForFunction((s) => document.getElementById("caption").textContent.trim() !== s,
      line, { timeout: SKIP_MS }).then(() => true).catch(() => false);
    const stepMs = Date.now() - t0;
    const capDown = await marks(p);
    await p.mouse.up();
    const capUp = await marks(p);
    check("ux:a-pad-press-during-a-caption-skips-and-sets-the-direction",
      stepped && prefOf(capBefore) !== -1 && pressedOn(capDown, -1),
      "the line stepped " + (stepped ? "in " + stepMs + "ms" : "not inside " + SKIP_MS + "ms")
      + ", preference " + JSON.stringify(prefOf(capBefore)) + " with the finger down " + JSON.stringify(prefOf(capDown))
      + " and after the lift " + JSON.stringify(prefOf(capUp)));

    /* 셋. 어느 마디에도 죽은 단추가 없다. 한 구를 통째로 지난 표본이라야 그 말이 선다. 마디는 자막으로
       가른다. 빈 자막은 비행, .tick은 쉬는 참, 나머지는 글자가 선 마디다. */
    await waitRound(p);
    const seen = await reap(p);
    check("ux:no-pad-is-ever-disabled",
      seen.off === 0 && seen.frames > 0 && seen.air > 0 && seen.line > 0 && seen.rest > 0, sayWatch(seen));

    /* 대조군. 0을 재는 축은 대조군이 양수를 내야 설계다. 비행 중에 disabled를 도로 심으면 그 프레임이
       잡혀야 하고, 심기 전후의 깨끗한 프레임도 같은 표본에 있어야 심은 것이 잡힌 것으로 읽힌다. */
    await watch(p);
    await shut(p);
    const planted = await p.evaluate((ms) => new Promise((done) => {
      const zs = [...document.querySelectorAll(".zone")];
      for (const z of zs) z.setAttribute("disabled", "");
      setTimeout(() => { for (const z of zs) z.removeAttribute("disabled"); done(true); }, ms);
    }), PLANT_MS);
    const hurt = await reap(p);
    const healed = await p.evaluate(() => document.querySelectorAll(".zone[disabled]").length);
    check("control:a-planted-disabled-reddens-the-never-disabled-axis",
      planted === true && hurt.off > 0 && hurt.frames > hurt.off && healed === 0,
      "planting disabled for " + PLANT_MS + "ms caught " + hurt.off + " of " + hurt.frames
      + " frames on " + (hurt.first || "none") + ", pulled back to " + healed + " dead pads");
    await ctx.close();
  }

  /* 자판 문법 둘. 위의 축들은 손가락이 닿는 자리를 재므로 자판만 쓰는 사람이 같은 판을 못 눌러도 초록이 난다.
     하나. 초점이 선 판에서 Enter와 space는 그 판의 방향이다. space는 창 전체가 가운데로 읽어 가던 키라,
     초점이 선 판을 눌렀는데 가운데가 들어가면 자판 쓰는 사람만 다른 게임을 한다.
     둘. 읽어 주는 자에게 창이 열렸는지가 들린다. 흐림은 눈에만 보이고 묶음 이름은 귀에 남는다. */
  {
    const { ctx, p } = await start(BASE);
    await settled(p);
    const padRole = () => p.evaluate(() => {
      const g = document.getElementById("pad");
      return { role: g.getAttribute("role"), label: g.getAttribute("aria-label"),
        live: document.querySelectorAll(".zone.live").length };
    });
    const focusKey = async (dive, key) => {
      const sel = '.zone[data-dive="' + dive + '"]';
      await p.focus(sel);
      const on = await p.evaluate((s) => document.activeElement === document.querySelector(s), sel);
      await p.keyboard.press(key);
      return on;
    };
    /* 창 안에서 왼쪽 판에 초점을 세우고 Enter를 누른다. 커밋된 입력이 -1이면 그 키가 그 판으로 갔다. */
    await open(p);
    const labelOpen = await padRole();
    const beforeEnter = await p.evaluate(() => window.__lastInput);
    const focusedL = await focusKey(-1, "Enter");
    const tookEnter = await p.waitForFunction(() => window.__lastInput?.dive === -1 && window.__lastInput?.auto === false,
      null, { timeout: PRESS_MS }).then(() => true).catch(() => false);
    const enterInput = await p.evaluate(() => window.__lastInput);
    /* 다음 구에서 오른쪽 판에 초점을 세우고 space를 누른다. 창 전체가 받던 길이 살아 있으면 가운데가
       들어가므로, 들어온 값이 1이라는 것은 그 길이 이 누름에는 안 섰다는 말이기도 하다. */
    await waitRound(p);
    const focusedR = await focusKey(1, " ");
    const tookSpace = await p.waitForFunction(() => window.__lastInput?.dive === 1 && window.__lastInput?.auto === false,
      null, { timeout: PRESS_MS }).then(() => true).catch(() => false);
    const spaceInput = await p.evaluate(() => window.__lastInput);
    check("ux:enter-and-space-on-a-focused-pad-mean-that-pad",
      focusedL && focusedR && tookEnter && tookSpace && enterInput?.dive === -1 && spaceInput?.dive === 1
        && enterInput?.auto === false && spaceInput?.auto === false,
      "focus left then Enter judged " + JSON.stringify(enterInput) + " (was " + JSON.stringify(beforeEnter)
      + "), focus right then space judged " + JSON.stringify(spaceInput)
      + ", the centre path fired " + (spaceInput?.dive === 0));
    /* 대조군. 판이 제 keydown을 잃으면 위 축은 빨개져야 한다. 초점만 세우고 Enter를 눌러도 아무것도
       안 커밋되는 것이 그 증거다. 누르기 전 값이 1이므로 -1이 들어오면 그것은 이 누름이 만든 것이다. */
    await waitRound(p);
    const cut = await p.evaluate(() => {
      const z = document.querySelector('.zone[data-dive="-1"]');
      const had = typeof z.onkeydown === "function";
      z.onkeydown = null;
      return had;
    });
    const beforeCut = await p.evaluate(() => window.__lastInput);
    const focusedCut = await focusKey(-1, "Enter");
    const tookCut = await p.waitForFunction(() => window.__lastInput?.dive === -1,
      null, { timeout: PRESS_MS }).then(() => true).catch(() => false);
    const cutInput = await p.evaluate(() => window.__lastInput);
    check("control:a-pad-stripped-of-its-keydown-reddens-the-focused-key-axis",
      cut === true && focusedCut && tookCut === false && cutInput?.dive !== -1,
      "with the left pad onkeydown nulled, Enter on it judged " + JSON.stringify(cutInput)
      + " (was " + JSON.stringify(beforeCut) + "), a handler was there to pull " + cut);
    /* 묶음 이름은 창이 열린 프레임과 닫힌 프레임에서 따로 읽는다. 한 자리에서만 읽으면 안 움직이는
       이름도 초록이 난다. */
    await shut(p);
    const labelShut = await padRole();
    check("ux:the-pad-group-names-its-window-state",
      labelOpen.role === "group" && labelShut.role === "group"
        && Boolean(labelOpen.label) && Boolean(labelShut.label) && labelOpen.label !== labelShut.label
        && labelOpen.live === 3 && labelShut.live === 0,
      "role " + JSON.stringify(labelShut.role) + ", open " + JSON.stringify(labelOpen.label)
      + " with " + labelOpen.live + " live pads, shut " + JSON.stringify(labelShut.label)
      + " with " + labelShut.live);
    await ctx.close();
  }
  check("console:no-errors", errs.length === 0, errs.slice(0, 2).join(" | ") || "clean");
  /* 못 잰 축을 빨간 줄로 남기는 것과 그 줄이 실제로 다 나왔는지는 다른 주장이다. 뒤엣것을 여기서 센다. */
  const drawn = notes.length + fails.length;
  check("instrument:every-axis-reported-a-row", drawn === ROWS, drawn + " rows against " + ROWS);
  console.log("표본 범위: veteran 손 모드 대기·왼쪽 누름·다음 두 구, 잠근 판에서 선호를 옮긴 두 프레임, rich 크레딧 봇 한 구와 그 다음 구, 1280x720");
  if (notes.length) console.log(notes.map((x) => "  ok   " + x).join(LINE));
  if (fails.length) console.log(fails.map((x) => "  FAIL " + x).join(LINE));
  console.log(fails.length ? "zone FAIL " + fails.length : "zone PASS " + notes.length);
  if (fails.length) process.exitCode = 1;
} finally {
  clearTimeout(t);
  if (browser) await browser.close();
}
