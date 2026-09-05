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
    check("console:no-errors", errs.length === 0, errs.slice(0, 3).join(" | ") || "clean");
    console.log("표본 범위: veteran 손 모드 5구, 왼쪽 선호 뒤 무입력 3구, 크레딧 봇 1구, 저장 재적재와 pref 없는 옛 저장 1구");
    if (notes.length) console.log(notes.map((x) => "  ok   " + x).join(LINE));
    if (fails.length) console.log(fails.map((x) => "  FAIL " + x).join(LINE));
    console.log(fails.length ? "hand FAIL " + fails.length : "hand PASS 4");
    if (fails.length) process.exitCode = 1;
  }
} finally {
  clearTimeout(t);
  if (browser) await browser.close();
}
