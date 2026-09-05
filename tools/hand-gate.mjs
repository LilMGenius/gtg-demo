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
    await page.waitForFunction(() => document.querySelectorAll(".zone:not([disabled])").length === 3, null, { timeout: ROUND_MS });
    return { ctx, page };
  };
  const waitRound = async (page) => {
    const before = await page.evaluate(() => document.querySelectorAll("#pips i.gone, #pips i.save").length);
    await page.waitForFunction((n) => document.querySelectorAll("#pips i.gone, #pips i.save").length > n, before, { timeout: ROUND_MS });
    await page.waitForFunction(() => document.querySelectorAll(".zone:not([disabled])").length === 3, null, { timeout: ROUND_MS });
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

    // 축 3. 지갑으로 실제 봇 시간을 사고 자동을 켜도 같은 호출 자리를 계속 써야 한다.
    {
      const { ctx, page } = await open(null, BASE + ",rich");
      await page.click("#auto", { force: true });
      await page.waitForSelector('.buy[data-bot="1"]', { timeout: ROUND_MS });
      await page.click('.buy[data-bot="1"]', { force: true });
      await page.click("#shop .close", { force: true });
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
      await page.waitForFunction(() => document.querySelectorAll(".zone:not([disabled])").length === 3, null, { timeout: ROUND_MS });
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
      await page.click("#shop .close", { force: true });
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
    console.log("표본 범위: veteran 손 모드 5구, 왼쪽 선호 뒤 무입력 3구, 크레딧 봇 2구, 저장 재적재와 두 옛 저장, 740x360·1280x720 패드");
    if (notes.length) console.log(notes.map((x) => "  ok   " + x).join(LINE));
    if (fails.length) console.log(fails.map((x) => "  FAIL " + x).join(LINE));
    console.log(fails.length ? "hand FAIL " + fails.length : "hand PASS 9");
    if (fails.length) process.exitCode = 1;
  }
} finally {
  clearTimeout(t);
  if (browser) await browser.close();
}
