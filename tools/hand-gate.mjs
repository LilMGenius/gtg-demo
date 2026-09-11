import { chromium } from "playwright";

// 손 모드가 봇 판단을 빌리지 않고 저장한 방향만 내는지 브라우저에서 잰다.
const EXE = process.env.LOCALAPPDATA + "/ms-playwright/chromium-1228/chrome-win64/chrome.exe";
const BASE = "http://127.0.0.1:10310/web/index.html?seed=20&preset=veteran";
// 다섯 구와 저장 재적재를 모두 끝낼 수 있는 상한이다. 그보다 길면 멈춘 계기를 살아 있다고 읽는다.
const WATCHDOG_MS = 240000;
// 페이지가 한 구를 끝내고 다음 입력창을 열 때까지 허용하는 시간이다. 최장 자막과 재시작보다 길다.
const ROUND_MS = 24000;
const LINE = String.fromCharCode(10);
const t = setTimeout(() => { console.log("WATCHDOG"); process.exit(1); }, WATCHDOG_MS);
t.unref();

const fails = [], notes = [];
const check = (n, ok, d) => (ok ? notes : fails).push(n + " " + d);

let browser;
try {
  browser = await chromium.launch({ executablePath: EXE });
  const errs = [];
  const open = async (saved, url = BASE) => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await ctx.newPage();
    page.on("pageerror", (e) => errs.push(String(e)));
    page.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
    if (saved) {
      await page.addInitScript((record) => {
        localStorage.setItem("gtg.save.v1", JSON.stringify(record));
      }, saved);
    }
    await page.goto(url, { waitUntil: "load" });
    await page.waitForSelector("#go", { timeout: ROUND_MS });
    await page.click("#go", { force: true });
    await page.waitForFunction(() => document.querySelectorAll(".zone.live").length === 3, null, { timeout: ROUND_MS });
    return { ctx, page };
  };
  const waitRound = async (page) => {
    const before = await page.evaluate(() => document.querySelectorAll("#pips i.gone, #pips i.save").length);
    await page.waitForFunction((n) => document.querySelectorAll("#pips i.gone, #pips i.save").length > n, before, { timeout: ROUND_MS });
    await page.waitForFunction(() => document.querySelectorAll(".zone.live").length === 3, null, { timeout: ROUND_MS });
  };
  // 입력창이 닫힌 순간. 세 판이 모두 꺼져 있으면 그 구는 이미 커밋됐고 판정은 굴러갔다.
  const shut = (page) => page.waitForFunction(() => [...document.querySelectorAll(".zone")].every((b) => !b.classList.contains("live")), null, { timeout: ROUND_MS });
  /* 창 밖의 판을 누르는 자리. 판때기는 이제 어느 마디에서도 안 잠기지만 좌표로 직접 누르는 것은 그대로
     둔다. 사람 손가락이 보내는 것과 같은 이벤트가 히트테스트를 지나 화면에 닿아야 하고, dispatchEvent는
     맞아도 그 길을 안 지나기 때문이다. */
  const tap = async (page, dive) => {
    const box = await page.locator('.zone[data-dive="' + dive + '"]').boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.up();
  };
  const pressed = (page) => page.evaluate(() => [...document.querySelectorAll(".zone")].map((b) => ({ dive: Number(b.dataset.dive), pressed: b.getAttribute("aria-pressed") })));
  // 창이 닫히면 #auto와 #out은 -96px에서 제자리로 .24s 동안 미끄러져 돌아온다.
  // 그 사이 두 기둥은 화면 밖에 있고, force는 가려진 것을 건너뛸 뿐 누를 자리가 화면 안인지는 그대로 본다.
  // 한가한 기계에서는 닫자마자 눌러도 맞아 초록이 나왔고, 기계가 바쁘면 움직이는 중간에 자를 대서
  // 느린 랩 세 번이 여기서 죽었다. d7cf608, 7daa663, 그리고 단독 재실행 한 번.
  // 그래서 재우지 않고 실제로 그려진 사각형이 제자리에 설 때까지 기다린 뒤에 누른다.
  const closePanel = async (page, panel, back = "#auto") => {
    await page.click(panel + " .close", { force: true });
    await page.waitForFunction((sel) => {
      const el = document.querySelector(sel);
      if (!el) return false;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return false;
      const x = r.left + r.width / 2;
      const y = r.top + r.height / 2;
      const inside = r.left >= 0 && x >= 0 && x <= innerWidth && y >= 0 && y <= innerHeight;
      const slide = getComputedStyle(el).translate;
      return inside && (slide === "none" || /^0px( 0px)?$/.test(slide));
    }, back, { timeout: ROUND_MS });
  };

  // 축 1. 사람이 아무 방향도 누르지 않아도 손 모드는 다섯 구를 고정 선호로 끝낸다.
  {
    const { ctx, page } = await open();
    for (let i = 0; i < 5; i += 1) await waitRound(page);
    const calls = await page.evaluate(() => window.__autoCalls);
    check("hand:five-untapped-rounds-never-call-autoInput",
      Number.isFinite(calls) && calls === 0,
      Number.isFinite(calls) ? "autoInput calls " + calls : "__autoCalls hook missing");
    await ctx.close();
  }

  // 현 코드의 RED는 계측 훅이 없어서 여기서 끝낸다. 나머지 축은 훅이 생긴 GREEN에서만 의미가 있다.
  if (fails.length) {
    console.log("표본 범위: veteran 손 모드 무입력 5구");
    console.log(fails.map((x) => "  FAIL " + x).join(LINE));
    console.log("hand FAIL " + fails.length);
    process.exitCode = 1;
  } else {
    // 축 2. 한 번 고른 왼쪽은 다음 세 무입력 구에도 그대로 들어가야 한다.
    {
      const { ctx, page } = await open();
      await page.click('.zone[data-dive="-1"]');
      await waitRound(page);
      const dives = [];
      for (let i = 0; i < 3; i += 1) {
        await waitRound(page);
        dives.push(await page.evaluate(() => window.__lastInput?.dive));
      }
      check("hand:a-clicked-left-preference-survives-three-untapped-rounds",
        dives.length === 3 && dives.every((d) => d === -1), dives.join(","));
      await ctx.close();
    }

    /* 축 10. 선호는 킥과 킥 사이에도 바뀐다. 방향 선택이 킥 앞에만 열려 있으면 막는 중에 마음이 바뀐 사람은
       다음 창이 열릴 때까지 기다려야 한다. 고정 선호는 이 구의 입력이 아니라 상태이므로 창 밖에서도 옮겨
       가야 하고, 이미 굴린 이 구의 판정 입력은 그대로여야 한다. 창 안의 누름은 축 2가 대조군으로 잡는다. */
    {
      const { ctx, page } = await open();
      // 첫 구는 손 대지 않고 흘린다. 그 구의 입력은 시작 선호인 가운데이고, 커밋된 뒤에 눌러야 창 밖이다.
      await shut(page);
      const flying = await page.evaluate(() => window.__lastInput);
      await tap(page, 1);
      const moved = await page.evaluate(() => ({
        shut: [...document.querySelectorAll(".zone")].every((b) => !b.classList.contains("live")),
        dive: window.__lastInput?.dive,
      }));
      const movedMarks = await pressed(page);
      await waitRound(page);
      const openedMarks = await pressed(page);
      await waitRound(page);
      const rolled = await page.evaluate(() => window.__lastInput);
      const onRight = (marks) => marks.length === 3 && marks.every((v) => v.pressed === (v.dive === 1 ? "true" : "false"));
      check("hand:the-preference-can-change-between-kicks",
        flying?.dive === 0 && moved.shut && moved.dive === 0 && onRight(movedMarks)
          && onRight(openedMarks) && rolled?.dive === 1 && rolled?.auto === false,
        JSON.stringify({ flying: flying?.dive, held: moved.dive, shut: moved.shut,
          pressed: movedMarks.map((v) => v.pressed).join("/"), opened: openedMarks.map((v) => v.pressed).join("/"),
          next: rolled?.dive, auto: rolled?.auto }));
      await ctx.close();
    }

    // 축 3. 지갑으로 실제 봇 시간을 사고 자동을 켜도 같은 호출 자리를 계속 써야 한다.
    {
      const { ctx, page } = await open(null, BASE + ",rich");
      await page.click("#auto", { force: true });
      await page.waitForSelector('.buy[data-bot="1"]', { timeout: ROUND_MS });
      await page.click('.buy[data-bot="1"]', { force: true });
      await closePanel(page, "#shop");
      await page.click("#auto", { force: true });
      const armed = await page.evaluate(() => ({ bot: window.__bot(), auto: document.getElementById("auto").classList.contains("on") }));
      check("control:wallet-bought-a-live-bot-and-enabled-auto", armed.bot.ms > 0 && armed.auto, JSON.stringify(armed));
      await waitRound(page);
      const calls = await page.evaluate(() => window.__autoCalls);
      check("bot:credited-auto-still-calls-autoInput", Number.isFinite(calls) && calls >= 1, String(calls));
      await ctx.close();
    }

    // 축 4와 오래된 저장 대조군. 새 필드는 저장 뒤 남고, 없는 필드는 중앙으로 읽어 한 구를 계속 굴린다.
    {
      const { ctx, page } = await open();
      await page.click('.zone[data-dive="-1"]');
      await waitRound(page);
      const saved = await page.evaluate(() => JSON.parse(localStorage.getItem(window.__saveKey())));
      await page.reload({ waitUntil: "load" });
      await page.waitForSelector("#go", { timeout: ROUND_MS });
      await page.click("#go", { force: true });
      await page.waitForFunction(() => document.querySelectorAll(".zone.live").length === 3, null, { timeout: ROUND_MS });
      await waitRound(page);
      const after = await page.evaluate(() => ({ pref: JSON.parse(localStorage.getItem(window.__saveKey())).pref, dive: window.__lastInput?.dive }));
      check("save:preferred-left-survives-reload", saved?.pref === -1 && after.pref === -1 && after.dive === -1, JSON.stringify({ before: saved?.pref, after }));
      await ctx.close();
    }
    {
      const old = { keeper: { level: 1, name: "동네형" }, onboard: 2, at: Date.now() };
      const { ctx, page } = await open(old);
      await waitRound(page);
      const input = await page.evaluate(() => window.__lastInput);
      check("stale_state:an-old-save-without-pref-plays-centre", input?.dive === 0 && input?.errMs === 0, JSON.stringify(input));
      await ctx.close();
    }

    // 축 5. 오른쪽을 누른 뒤 다음 입력창에서도 실제 DOM의 그 버튼 하나만 눌린 상태여야 한다.
    {
      const { ctx, page } = await open();
      await page.click('.zone[data-dive="1"]');
      await waitRound(page);
      const pressed = await page.evaluate(() => [...document.querySelectorAll('.zone')].map((b) => ({
        dive: Number(b.dataset.dive), pressed: b.getAttribute('aria-pressed')
      })));
      check("pad:preferred-zone-is-aria-pressed",
        pressed.length === 3 && pressed.every((v) => v.pressed === (v.dive === 1 ? 'true' : 'false')),
        JSON.stringify(pressed));
      await ctx.close();
    }

    // 축 6. 실제 크레딧 봇이 뛴 한 구는 고른 구 안에 글자 없는 봇 배지를 남겨야 한다.
    {
      const { ctx, page } = await open(null, BASE + ",rich");
      await page.click("#auto", { force: true });
      await page.waitForSelector('.buy[data-bot="1"]', { timeout: ROUND_MS });
      await page.click('.buy[data-bot="1"]', { force: true });
      await closePanel(page, "#shop");
      await page.click("#auto", { force: true });
      await page.waitForFunction(() => window.__botRan() === true, null, { timeout: ROUND_MS });
      const badge = await page.evaluate(() => ({
        input: window.__lastInput?.dive,
        zones: [...document.querySelectorAll('.zone')].map((b) => ({
          dive: Number(b.dataset.dive), badge: Boolean(b.querySelector('.bot:not([hidden])'))
        }))
      }));
      check("pad:a-bot-round-carries-the-bot-badge",
        badge.zones.filter((v) => v.badge).length === 1 && badge.zones.some((v) => v.badge && v.dive === badge.input),
        JSON.stringify(badge));
      await ctx.close();
    }

    // 축 7. 손가락 한 개를 받는 세 구는 좁은 가로와 넓은 가로 모두 48px보다 작아지면 안 된다.
    {
      const { ctx, page } = await open();
      const sizes = [];
      for (const viewport of [{ width: 740, height: 360 }, { width: 1280, height: 720 }]) {
        await page.setViewportSize(viewport);
        sizes.push(await page.evaluate(() => [...document.querySelectorAll('.zone')].map((b) => {
          const r = b.getBoundingClientRect();
          return { width: r.width, height: r.height };
        })));
      }
      check("pad:zones-meet-48px",
        sizes.every((sample) => sample.length === 3 && sample.every((r) => r.width >= 48 && r.height >= 48)),
        JSON.stringify(sizes));
      await ctx.close();
    }

    // 저장된 선호는 첫 구를 열기 전부터 실제 눌림 속성으로 복원돼야 한다.
    {
      const saved = { keeper: { level: 1, name: "동네형" }, onboard: 2, at: Date.now(), pref: -1 };
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
      const page = await ctx.newPage();
      await page.addInitScript((record) => localStorage.setItem("gtg.save.v1", JSON.stringify(record)), saved);
      await page.goto(BASE, { waitUntil: "load" });
      await page.waitForSelector("#go", { timeout: ROUND_MS });
      const pressed = await page.evaluate(() => [...document.querySelectorAll('.zone')].map((b) => ({
        dive: Number(b.dataset.dive), pressed: b.getAttribute('aria-pressed')
      })));
      check("stale_state:stored-preference-renders-before-first-round",
        pressed.length === 3 && pressed.every((v) => v.pressed === (v.dive === -1 ? 'true' : 'false')),
        JSON.stringify(pressed));
      await ctx.close();
    }

    // 저장된 선호가 첫 구를 연 뒤에도 눌림 상태로 남아야 하므로 최소 저장을 넣고 확인한다.
    {
      const saved = { keeper: { level: 1, name: "동네형" }, onboard: 2, pref: -1 };
      // 고정 뷰포트는 요청된 실제 손 모드 패드 크기에서 상태를 측정하기 위한 값이다.
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
      const page = await ctx.newPage();
      await page.addInitScript((record) => localStorage.setItem("gtg.save.v1", JSON.stringify(record)), saved);
      await page.goto("http://127.0.0.1:10310/web/index.html?seed=20", { waitUntil: "load" });
      await page.waitForSelector("#go", { timeout: ROUND_MS });
      await page.click("#go", { force: true });
      // 300ms는 go 직후 다음 구의 패드 상태가 반영됐는지 확인하기 위한 관찰 창이다.
      await page.waitForTimeout(300);
      const pressed = await page.evaluate(() => [...document.querySelectorAll('.zone')].map((b) => ({
        dive: Number(b.dataset.dive), pressed: b.getAttribute('aria-pressed')
      })));
      check("pad:a-saved-preference-is-pressed-after-go",
        pressed.length === 3 && pressed.every((v) => v.pressed === (v.dive === -1 ? 'true' : 'false')),
        JSON.stringify(pressed));
      await ctx.close();
    }
    check("console:no-errors", errs.length === 0, errs.slice(0, 3).join(" | ") || "clean");
    console.log("표본 범위: veteran 손 모드 5구, 왼쪽 선호 뒤 무입력 3구, 창 밖 오른쪽 누름 뒤 두 구, 크레딧 봇 2구, 저장 재적재와 두 옛 저장, 740x360·1280x720 패드");
    if (notes.length) console.log(notes.map((x) => "  ok   " + x).join(LINE));
    if (fails.length) console.log(fails.map((x) => "  FAIL " + x).join(LINE));
    console.log(fails.length ? "hand FAIL " + fails.length : "hand PASS 10");
    if (fails.length) process.exitCode = 1;
  }
} finally {
  clearTimeout(t);
  if (browser) await browser.close();
}
