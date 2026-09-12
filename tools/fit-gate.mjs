import { chromium } from "playwright";

// 사기 전에 걸쳐 볼 수 있는지 재는 자.
// 꾸미는 재미로 하는 게임에서 값을 치른 뒤에야 자기 모습을 보는 것은 순서가 뒤집힌 것이다.
//
// 가장 중요한 축은 걸쳐 보는 것이 돈을 안 쓰는가다. 시착용이 조용히 결제가 되면
// 눌러 보는 행위 자체가 함정이 되고, 그 손해는 되돌릴 방법이 없다.
//
// 뒤쪽 절반은 손가락이 같은 카드를 누르는 자리다. 터치에는 호버가 없어서 걸쳐 보기와 회전이
// 눌림 하나를 두고 다투고, 그 다툼은 누른 시간으로만 갈린다. 그래서 문턱 앞과 뒤를 따로 잰다.
const EXE = process.env.LOCALAPPDATA + "/ms-playwright/chromium-1228/chrome-win64/chrome.exe";
const BASE = "http://127.0.0.1:10310/web/index.html?seed=20&preset=rich,veteran";
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

  const shot = () => p.evaluate(() => { const i = document.querySelector("#shop .fitting .me img"); return i ? i.getAttribute("src") : ""; });
  const coin = () => p.evaluate(() => window.__squad().coin);
  const tap = (n) => p.evaluate((k) => { const c = [...document.querySelectorAll("#shop .rack .card")]; if (c[k]) c[k].click(); }, n);
  const tab = (t) => p.evaluate((x) => { for (const b of document.querySelectorAll("#shop .tab")) if (b.dataset.tab === x) b.click(); }, t);
  // 값은 버튼이 들고 있는 데이터에서 읽는다. 그려진 글자에는 천 단위 쉼표와 아이콘 이름이 섞여
  // 파싱이 값을 잘못 읽는다. 축은 그대로 버튼이 부르는 값이다.
  const bill = () => p.evaluate(() => { const b = document.querySelector("#shop .fitting .all"); const c = b ? b.querySelector(".px[data-coin]") : null; return { label: b ? b.textContent.trim() : "", coin: c ? Number(c.dataset.coin) : null, off: b ? b.disabled : true, rows: document.querySelectorAll("#shop .fitting .tried i:not(.dim)").length }; });

  await tab("glove");
  await p.waitForTimeout(400);
  const bare = await shot();
  const purse0 = await coin();
  check("instrument:the-fitting-room-drew-someone", bare.indexOf("data:image") === 0, bare.slice(0, 16) + " " + bare.length + " chars");

  await tap(3);
  await p.waitForTimeout(450);
  const worn = await shot();
  const purse1 = await coin();
  const billed = await bill();
  check("fit:pressing-a-card-changes-the-body", worn !== bare, worn === bare ? "same picture" : "picture changed");
  check("fit:trying-on-spends-nothing", purse1 === purse0, purse0 + " then " + purse1);
  check("fit:the-tried-item-is-listed", billed.rows === 1, billed.rows + " rows, button " + JSON.stringify(billed.label));

  // 대조군. 같은 칸을 다시 누르면 벗는다. 벗은 뒤의 그림이 처음과 같아야
  // 위의 그림 변화가 시착용 때문이지 그리는 잡음 때문이 아니다.
  await tap(3);
  await p.waitForTimeout(450);
  const off = await shot();
  const billedOff = await bill();
  check("control:pressing-again-takes-it-off", off === bare, off === bare ? "back to the bare picture" : "did not return");
  check("control:the-list-empties-when-nothing-is-tried", billedOff.rows === 0 && billedOff.off === true, billedOff.rows + " rows, disabled " + billedOff.off);

  // 두 칸을 걸치고 값을 맞댄다. 버튼이 부르는 값이 선반 값의 합이어야 한다.
  await tap(3);
  await p.waitForTimeout(380);
  await tab("kit");
  await p.waitForTimeout(380);
  await tap(3);
  await p.waitForTimeout(450);
  const two = await bill();
  const want = await p.evaluate(async () => {
    const g = await import("/web/src/state/gear.mjs");
    return g.gloveAt(3).cost + g.kitAt(3).cost;
  });
  check("fit:the-bill-is-the-sum-of-the-shelf-prices", two.coin === want, two.coin + " want " + want);
  check("fit:both-tried-items-are-listed", two.rows === 2, two.rows + " rows");

  // 창이 열려 있어도 판은 계속 굴러가고 완봉 보상이 지갑에 들어온다.
  // 사기 전후를 그냥 맞대면 그 사이 벌어들인 몫이 결제액으로 읽힌다.
  // 실측으로 1670을 결제한 회차가 1666으로 잡혔다. 판을 세워 놓고 재야 이 축이 결제만 본다.
  await p.evaluate(() => window.__fixedStep(0.000001));
  await p.waitForTimeout(200);
  const idle = await coin();
  await p.waitForTimeout(700);
  const stillIdle = await coin();
  const before = await coin();
  await p.evaluate(() => { const a = document.querySelector("#shop .fitting .all"); if (a && !a.disabled) a.click(); });
  await p.waitForTimeout(600);
  const after = await coin();
  await p.evaluate(() => window.__fixedStep(0));
  // 대조군. 판을 세운 동안 아무것도 안 사면 잔고가 한 푼도 안 움직여야 한다.
  // 안 멈췄으면 위의 차액에 배경 수입이 섞여 있고, 그 축은 결제를 재는 것이 아니다.
  check("control:the-wallet-holds-still-while-the-world-is-stopped", idle === stillIdle, idle + " then " + stillIdle);
  const done = await bill();
  check("fit:buying-everything-charges-the-bill-once", before - after === want, before + " minus " + after + " is " + (before - after) + ", want " + want);
  check("fit:the-fitting-empties-after-buying", done.rows === 0, done.rows + " rows left");
  check("console:no-errors", errs.length === 0, errs.slice(0, 2).join(" | ") || "clean");
  await ctx.close();

  /* 터치의 긴 누름. 손가락은 카드 위에 머물 수 없어서 호버가 없고, 터치의 pointerenter는 누르는
     순간에 한 번 오고 마는 것이라 시착용이 이미 그 눌림을 쓰고 있다. 그래서 회전을 볼 길이
     터치에 있는지는 눌린 시간으로만 갈린다. 문턱은 여기 적지 않고 화면이 쓰는 값을 화면에서 읽는다.
     베껴 적으면 화면이 그 값을 바꾼 날 이 자만 옛 문턱을 재고, 그 초록은 아무것도 증명하지 않는다. */
  const touch = await b.newContext({ viewport: { width: 740, height: 360 }, hasTouch: true });
  const tp = await touch.newPage();
  const terrs = [];
  tp.on("pageerror", (e) => terrs.push(String(e)));
  await tp.goto(BASE, { waitUntil: "load" });
  await tp.waitForSelector("#go", { timeout: 15000 });
  await tp.click("#go", { force: true });
  await tp.waitForTimeout(1300);
  await tp.evaluate(() => window.__shop(true));
  await tp.waitForTimeout(400);
  const ttab = (x) => tp.evaluate((k) => { for (const e of document.querySelectorAll("#shop .tab")) if (e.dataset.tab === k) e.click(); }, x);
  await ttab("glove");
  await tp.waitForTimeout(420);
  const LONG = await tp.evaluate(() => window.__reveal().long);
  const cdp = await touch.newCDPSession(tp);
  // 손가락이 닿는 자리는 화면에서 읽는다. 카드가 창 밖에 서 있으면 그 누름은 아무 카드에도 안 닿고,
  // 안 닿은 누름이 낸 초록은 회전이 아니라 빈 자리를 잰 것이다.
  const spotOf = (n) => tp.evaluate((k) => {
    const c = [...document.querySelectorAll("#shop .rack .card")][k];
    if (!c) return null;
    c.scrollIntoView({ block: "center", inline: "center" });
    for (const e of document.querySelectorAll("#shop .rack .card")) delete e.dataset.probe;
    c.dataset.probe = "1";
    const r = c.getBoundingClientRect();
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2),
      inside: r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight };
  }, n);
  /* 도는지는 칸이 캔버스를 들었는지와 표시가 걸렸는지로 읽는다. 호버를 재는 자들이 읽는 것과 같다.
     화소를 굽는 toDataURL은 짧은 누름을 재는 자리에서 안 부른다. 실측으로 한 번에 30밀리초가 들어서
     그 비용이 문턱을 넘겨 버리고, 짧은 누름이 긴 누름으로 읽힌다. */
  const feel = (n) => tp.evaluate((k) => {
    const c = document.querySelector("#shop .rack .card[data-probe]") || [...document.querySelectorAll("#shop .rack .card")][k];
    const s = c ? c.querySelector(".shot") : null;
    return { spin: Boolean(s && s.querySelector("canvas")), lit: Boolean(s && s.classList.contains("spinning")),
      fit: Boolean(c && c.classList.contains("fit")), live: document.querySelectorAll("#shop .rack .card[data-probe]").length,
      tried: document.querySelectorAll("#shop .fitting .tried i[data-off]").length,
      spec: ((document.querySelector("#shop .fitting .spec") || {}).textContent || "").trim().length };
  }, n);
  const ink = (n) => tp.evaluate((k) => {
    const c = document.querySelector("#shop .rack .card[data-probe]") || [...document.querySelectorAll("#shop .rack .card")][k];
    const cv = c ? c.querySelector(".shot canvas") : null;
    return cv ? cv.toDataURL("image/png") : "";
  }, n);
  /* 회전이 언제 섰는지는 창 안에서 잰다. 누르는 동안 창 밖으로 한 번 나가면 그 왕복이 시간을
     먹어서(실측 50밀리초 대기가 130밀리초로 잡혔다) 재려던 짧은 누름이 문턱 쪽으로 끌려간다.
     그래서 프레임마다 캔버스를 보는 자를 창 안에 세우고, 손가락이 닿은 시각과 캔버스가 처음
     보인 시각의 차이를 남긴다. 그 차이가 이 고침의 주장 자체다. 누르는 순간 도는 화면과
     문턱을 넘겨야 도는 화면은 캔버스가 있었다는 사실로는 안 갈리고, 이 차이로만 갈린다. */
  const watch = () => tp.evaluate(() => {
    window.__spinSeen = 0;
    window.__spinFrames = 0;
    window.__spinAt = -1;
    window.__pressAt = -1;
    window.__spinStamp = () => { if (window.__pressAt < 0) window.__pressAt = performance.now(); };
    document.getElementById("shop").addEventListener("pointerdown", window.__spinStamp, true);
    const tick = () => {
      window.__spinFrames += 1;
      if (document.querySelector("#shop .rack .shot canvas")) {
        window.__spinSeen += 1;
        if (window.__spinAt < 0) window.__spinAt = performance.now();
      }
      window.__spinWatch = requestAnimationFrame(tick);
    };
    window.__spinWatch = requestAnimationFrame(tick);
  });
  const seen = () => tp.evaluate(() => {
    if (window.__spinWatch) cancelAnimationFrame(window.__spinWatch);
    window.__spinWatch = 0;
    document.getElementById("shop").removeEventListener("pointerdown", window.__spinStamp, true);
    return { seen: window.__spinSeen, frames: window.__spinFrames,
      lag: window.__spinAt < 0 || window.__pressAt < 0 ? -1 : Math.round(window.__spinAt - window.__pressAt) };
  });
  // 붙들고 있는 동안 한 번 읽고, 화소가 움직였는지 보려고 0.3초 뒤에 한 번 더 읽는다.
  const hold = async (n, ms) => {
    const spot = await spotOf(n);
    if (!spot) return { spot: null, held: 0, at: { spin: false, lit: false, spec: 0 }, after: {}, turn: false, saw: { seen: 0, frames: 0, lag: -1 } };
    await watch();
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: spot.x, y: spot.y }] });
    const t0 = Date.now();
    await tp.waitForTimeout(ms);
    const at = await feel(n);
    const one = await ink(n);
    await tp.waitForTimeout(300);
    const two = await ink(n);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    const held = Date.now() - t0;
    const saw = await seen();
    await tp.waitForTimeout(260);
    return { spot, held, at, saw, after: await feel(n), turn: one !== "" && one !== two };
  };
  /* 스쳐 누르는 손. 닿자마자 떼므로 누르는 동안은 아무것도 안 묻고, 본 것은 지켜보던 자에게서
     누름이 끝난 뒤에 받는다. 이 누름은 문턱보다 짧아야 짧은 누름이다. */
  const tapq = async (n, ms) => {
    const spot = await spotOf(n);
    await watch();
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: spot.x, y: spot.y }] });
    const t0 = Date.now();
    await tp.waitForTimeout(ms);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    const held = Date.now() - t0;
    const saw = await seen();
    await tp.waitForTimeout(300);
    return { spot, held, saw, after: await feel(n) };
  };

  const CARD = 3, PLANT = 2, MUTE = 1;
  const long = await hold(CARD, LONG + 100);
  check("instrument:the-card-sat-inside-the-touch-viewport", Boolean(long.spot && long.spot.inside),
    long.spot ? long.spot.x + "," + long.spot.y + " inside " + long.spot.inside : "no card at " + CARD);
  check("shop:a-long-press-on-a-card-spins-it-on-touch",
    long.at.spin && long.at.lit && long.turn && long.saw.lag >= LONG,
    "canvas " + long.at.spin + ", lit " + long.at.lit + ", turned " + long.turn + ", spin began " + long.saw.lag
    + "ms after the finger landed, seen in " + long.saw.seen + " of " + long.saw.frames + " frames over " + long.held + "ms held");
  check("shop:the-spin-stops-when-the-finger-lifts", long.after.spin === false && long.after.lit === false,
    "canvas " + long.after.spin + ", lit " + long.after.lit);
  /* 긴 누름이 걸쳐 보기를 안 건드리는가. 이것이 이 축 무리의 뼈다. 회전만 보고 손을 떼는 길이
     없으면 터치는 돌려 보는 값을 시착용으로 치르고, 그 값은 카드마다 다시 치러야 한다. */
  check("shop:a-long-press-leaves-the-item-untried",
    long.after.fit === false && long.after.tried === 0 && long.after.live === 1,
    "fit " + long.after.fit + ", rows " + long.after.tried + ", the pressed card survived " + (long.after.live === 1));
  // 효과 칸은 같은 눌림이 채운다. 회전을 가르는 줄이 그 눌림까지 같이 걸러 내면 여기가 빨개진다.
  check("shop:the-spec-panel-still-fills-on-the-same-press", long.at.spec > 0, long.at.spec + " chars while held");
  const quick = await tapq(CARD, 60);
  check("shop:a-quick-tap-on-a-card-still-tries-it-on",
    quick.held < LONG && quick.saw.seen === 0 && quick.after.fit && quick.after.tried === 1 && quick.after.live === 0,
    quick.held + "ms press under " + LONG + ", spin seen in " + quick.saw.seen + " of " + quick.saw.frames
    + " frames, fit " + quick.after.fit + ", rows " + quick.after.tried);

  /* 심은 대조군. 위의 두 축을 깨진 사본에 물린다. 하나는 누르는 순간 바로 돌면서 그 누름을 늘
     삼키는 사본이고, 다른 하나는 예약을 아예 안 거는 사본이다. 둘 중 어느 것도 안 빨개지면
     위의 축들은 회전이 아니라 시간이 흐른 것을 재고 있다. */
  await tp.evaluate((k) => {
    const c = [...document.querySelectorAll("#shop .rack .card")][k];
    const spin = c.onpointerenter;
    c.addEventListener("pointerdown", (e) => { if (e.pointerType === "touch") spin({ pointerType: "mouse" }); });
    c.onclick = null;
  }, PLANT);
  const now = await tapq(PLANT, 60);
  check("control:an-immediate-spin-on-touchstart-goes-red", now.saw.seen > 0 || now.after.fit === false,
    "shop:a-quick-tap-on-a-card-still-tries-it-on would read " + now.held + "ms press under " + LONG
    + ", spin seen in " + now.saw.seen + " of " + now.saw.frames + " frames at lag " + now.saw.lag
    + ", fit " + now.after.fit + ", rows " + now.after.tried);
  // 예약을 안 거는 사본. 듣는 자를 통째로 뗀 카드가 그것이다.
  await tp.evaluate((k) => {
    const c = [...document.querySelectorAll("#shop .rack .card")][k];
    c.replaceWith(c.cloneNode(true));
  }, MUTE);
  const mute = await hold(MUTE, LONG + 100);
  check("control:a-card-that-never-arms-goes-red", !(mute.at.spin && mute.at.lit && mute.turn && mute.saw.lag >= LONG),
    "shop:a-long-press-on-a-card-spins-it-on-touch would read canvas " + mute.at.spin
    + ", lit " + mute.at.lit + ", turned " + mute.turn + ", lag " + mute.saw.lag
    + ", seen in " + mute.saw.seen + " of " + mute.saw.frames + " frames over " + mute.held + "ms held");

  /* 대조군. 마우스는 손을 올린 그 자리에서 그대로 돈다. 터치를 가르는 줄이 호버까지 같이
     잘라 내면 여기가 빨개지고, 고친 것이 한쪽 손을 고치면서 다른 손을 부순 것이 된다. */
  await ttab("glove");
  await tp.waitForTimeout(420);
  await tp.locator("#shop .rack .card").nth(CARD).hover();
  await tp.waitForTimeout(240);
  const over = await feel(CARD);
  await tp.mouse.move(4, 4);
  await tp.waitForTimeout(280);
  const away = await feel(CARD);
  check("control:the-mouse-hover-path-still-spins", over.spin && over.lit && away.spin === false,
    "over canvas " + over.spin + ", lit " + over.lit + ", away canvas " + away.spin);
  check("console:no-errors-under-touch", terrs.length === 0, terrs.slice(0, 2).join(" | ") || "clean");
  await touch.close();

  if (notes.length) console.log(notes.map((x) => "  ok   " + x).join(LINE));
  if (fails.length) console.log(fails.map((x) => "  FAIL " + x).join(LINE));
  console.log(fails.length ? "fit FAIL " + fails.length : "fit PASS " + notes.length);
  if (fails.length) process.exitCode = 1;
} finally {
  clearTimeout(t);
  if (b) await b.close();
}
