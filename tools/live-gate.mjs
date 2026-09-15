import { chromium, devices, request } from "playwright";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { clearDraw } from "./draw.mjs";
import { SET_END } from "../web/src/ui/lines.mjs";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const OUT = join(ROOT, ".omo", "evidence");
const LIVE = "https://lilmgenius.github.io/gtg-demo/web/index.html";
const WRONG = "https://lilmgenius.github.io/gtg-demo/web/nope.html";
const FILES = ["web/index.html", "web/src/main.mjs", "web/src/render/scene.mjs",
  "web/src/ui/wiki.mjs", "web/wiki/dist/pages.json"];
const AXES = ["live:the-deployed-bytes-are-the-gated-bytes",
  "live:a-first-round-finishes-on-a-phone-over-the-network",
  "control:a-wrong-path-is-not-a-round", "live:no-login-is-required-before-the-first-ball",
  "control:a-required-login-reds-the-axis"];
const STEP_MS = 26000;
const started = Date.now();
const verdicts = new Map();
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const git = (...args) => execFileSync("git", args, { cwd: ROOT, timeout: 10000 });
const head = git("rev-parse", "HEAD").toString().trim();
mkdirSync(OUT, { recursive: true });
const check = (name, ok, detail) => {
  verdicts.set(name, ok);
  console.log(`  ${ok ? "ok  " : "FAIL"} ${name} ${detail}`);
};
let browser;
let api;
const watchdog = setTimeout(() => {
  console.error("WATCHDOG 240000ms");
  for (const name of AXES) if (!verdicts.has(name)) check(name, false, "watchdog before completion");
  void browser?.close();
  process.exit(1);
}, 240000);
watchdog.unref();

async function deployedBytes() {
  const local = FILES.map((path) => ({ path, hash: sha(git("show", `${head}:${path}`)) }));
  api = await request.newContext({ timeout: 12000 });
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const pairs = await Promise.all(local.map(async ({ path, hash }) => {
      const url = new URL(`../${path}`, LIVE).href;
      try {
        const response = await api.get(url, { headers: { "Cache-Control": "no-cache" } });
        const body = await response.body();
        const remote = sha(body);
        const headers = response.headers();
        const htmlCommit = path.endsWith("index.html")
          ? body.toString().match(/(?:commit|revision|git-sha)[^\r\n<>]{0,100}?\b([a-f0-9]{40})\b/i)?.[1] : null;
        const commit = headers["x-git-sha"] || headers["x-commit-sha"] || headers["x-revision"] || htmlCommit;
        console.log(`hash attempt=${attempt} path=${path} HEAD=${hash} deployed=${remote} HTTP=${response.status()} deployedCommit=${commit || "not exposed"}`);
        return response.status() === 200 && response.url() === url && remote === hash;
      } catch (error) {
        console.log(`hash attempt=${attempt} path=${path} HEAD=${hash} deployed=unavailable error=${error.message}`);
        return false;
      }
    }));
    if (pairs.every(Boolean)) return true;
    console.log("Pages lags a push by minutes; hashes identify bytes, not an unexposed deployed commit.");
    if (attempt < 3) {
      console.log(`hash retry ${attempt + 1}/3 in 60s`);
      await new Promise((resolve) => setTimeout(resolve, 60000));
    }
  }
  return false;
}

// Reuse manual-qa.mjs pad/pip observables and draw.mjs's hold/release sequence.
// Playwright (Apache-2.0): https://playwright.dev/docs/emulation and
// https://playwright.dev/docs/api/class-cdpsession. Adapt only the helper's mouse
// interface to Chromium touch input so it still owns reveal timing and state reads.
async function touchDraw(page, context) {
  const cdp = await context.newCDPSession(page);
  let spot;
  let down = false;
  const hand = {
    evaluate: page.evaluate.bind(page),
    waitForFunction: page.waitForFunction.bind(page),
    waitForTimeout: page.waitForTimeout.bind(page),
    locator: page.locator.bind(page),
    click: (selector, options) => page.locator(selector).tap(options),
    mouse: {
      move: async (x, y) => { spot = { x, y }; },
      down: async () => {
        await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [spot] });
        down = true;
      },
      up: async () => {
        await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
        down = false;
      }
    }
  };
  try {
    if (!(await clearDraw(hand))) throw new Error("touch draw did not close");
  } finally {
    if (down) await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await cdp.detach();
  }
}

const noLoginRequired = (result) => result.status === 200 && result.entered
  && result.balls === 5 && result.surface && !result.error && result.inputSamples > 0
  && result.audit.length === 0 && result.titleTaps.length === 1 && result.titleTaps[0] === "go"
  && result.navigations.length === 1 && result.navigations[0] === LIVE
  && result.inputValues?.every((value) => value === "")
  && result.cookie === "" && result.storageCookies === 0 && !result.hadContextCookies;

async function phoneRound(url, control = false, requiredLogin = false) {
  const t0 = Date.now();
  const context = await browser.newContext({ ...devices["Pixel 7"],
    viewport: { width: 740, height: 360 }, screen: { width: 740, height: 360 },
    deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    storageState: { cookies: [], origins: [] } });
  const result = { url, status: null, entered: false, balls: 0, surface: false,
    consoleErrors: [], pageErrors: [], audit: [], samples: 0, inputSamples: 0,
    titleTaps: [], navigations: [], mutationHits: 0, hadContextCookies: false, resources: 0,
    largestResource: { ms: 0, url: "" }, error: null };
  const page = await context.newPage();
  page.setDefaultTimeout(control || requiredLogin ? 4000 : STEP_MS);
  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) result.navigations.push(frame.url());
  });
  if (requiredLogin) {
    await page.route(new URL("src/ui/title.mjs", LIVE).href, async (route) => {
      try {
        const response = await route.fetch({ timeout: 12000 });
        const original = await response.text();
        if (response.status() !== 200 || original !== git("show", `${head}:web/src/ui/title.mjs`).toString()) {
          throw new Error("required-login control title differs from HEAD");
        }
        let body = original;
        // start() must reject the guest before go.onclick can silently create it.
        // Route only this response; the tracked title and real live run stay intact.
        for (const [anchor, replacement] of [
          ["const start = () => {", "const start = () => {\n    if (!currentId()) return;"],
          ["go.onclick = () => {", "go.onclick = () => {\n    if (!currentId()) return start();"]
        ]) {
          if (body.split(anchor).length !== 2) throw new Error(`mutation anchor must occur once: ${anchor}`);
          body = body.replace(anchor, replacement);
        }
        await route.fulfill({ response, body });
        result.mutationHits += 1;
        console.log(`required-login mutation originalSHA256=${sha(original)} mutatedSHA256=${sha(body)}`);
      } catch (error) {
        result.mutationError = error.message;
        await route.abort();
      }
    });
  }
  page.on("console", (message) => { if (message.type() === "error") result.consoleErrors.push(message.text()); });
  page.on("pageerror", (error) => result.pageErrors.push(error.message));
  const pending = new Map();
  page.on("request", (req) => pending.set(req, Date.now()));
  const finished = (req) => {
    const began = pending.get(req);
    if (began === undefined) return;
    const ms = Date.now() - began;
    result.resources += 1;
    if (ms > result.largestResource.ms) result.largestResource = { ms, url: req.url() };
    pending.delete(req);
  };
  page.on("requestfinished", finished);
  page.on("requestfailed", finished);
  // Observe credential interaction, title taps and cookies without changing state.
  // An optional visible account form does not make login a prerequisite.
  await page.exposeFunction("lvAudit", (sample) => {
    result.samples += 1;
    if (sample.values?.length === 2) result.inputSamples += 1;
    if (sample.titleTap !== undefined) result.titleTaps.push(sample.titleTap);
    if (sample.cookie || sample.credentialEvent || sample.values?.some((value) => value !== "")) {
      if (!result.audit.some((entry) => JSON.stringify(entry) === JSON.stringify(sample))) result.audit.push(sample);
    }
  });
  await page.addInitScript(() => {
    for (const type of ["focusin", "keydown", "beforeinput", "input", "change"]) {
      document.addEventListener(type, (event) => {
        if (event.target.matches?.("#aid, #apw")) {
          void window.lvAudit({ credentialEvent: type, target: event.target.id });
        }
      }, true);
    }
    document.addEventListener("pointerdown", (event) => {
      const title = document.getElementById("title");
      if (title && !title.hidden && title.contains(event.target)) {
        void window.lvAudit({ titleTap: event.target.closest("button")?.id || event.target.id || "other" });
      }
    }, true);
    const sample = () => {
      if (document.body) {
        void window.lvAudit({ cookie: document.cookie,
          values: [...document.querySelectorAll("#aid, #apw")].map((input) => input.value) });
      }
      setTimeout(sample, 100);
    };
    sample();
  });
  const cookiePoll = setInterval(() => {
    void context.cookies().then((cookies) => {
      if (cookies.length) result.hadContextCookies = true;
    }).catch((error) => { result.cookieError = error.message; });
  }, 200);
  try {
    const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20000 });
    result.status = response?.status() ?? null;
    result.loadedUrl = page.url();
    await page.locator("#go").waitFor({ state: "visible" });
    // Two observer samples on the settled title precede any input.
    await page.waitForTimeout(250);
    // The title button pulses continuously; manual-qa also bypasses stability here.
    if (await page.locator("#lv").innerText() !== "Lv 1"
      || await page.locator("#pips i.gone, #pips i.save").count() !== 0) {
      throw new Error("fresh entry did not start at level 1 with zero completed balls");
    }
    await page.locator("#go").tap({ force: true });
    await page.locator("#title").waitFor({ state: "hidden" });
    result.entered = true;
    await page.locator("#pull:not([hidden])").waitFor({ state: "visible" });
    await touchDraw(page, context);
    // The first round runs behind the onboarding cards. Count its existing pips;
    // restarting it or demanding five further completions would measure round two.
    for (let tap = 0; tap < 5; tap += 1) {
      result.balls = await page.locator("#pips i.gone, #pips i.save").count();
      if (result.balls === 5) break;
      await page.waitForFunction(() => document.querySelectorAll(".zone.live").length === 3,
        null, { timeout: STEP_MS });
      const before = await page.locator("#pips i.gone, #pips i.save").count();
      if (await page.locator("#lv").innerText() !== "Lv 1") throw new Error("missed the first round");
      console.log(`phone ${control ? "control" : "live"} beforeTap=${before}/5`);
      await page.locator(`.zone[data-dive='${[-1, 0, 1, -1, 0][tap]}']`).tap();
      await page.waitForFunction((n) => document.querySelectorAll("#pips i.gone, #pips i.save").length > n,
        before, { timeout: STEP_MS });
      result.balls = await page.locator("#pips i.gone, #pips i.save").count();
      console.log(`phone ${control ? "control" : "live"} ball=${result.balls}/5 wallMs=${Date.now() - t0}`);
    }
    await page.waitForFunction((templates) => {
      const saved = document.querySelectorAll("#pips i.save").length;
      const caption = document.querySelector("#caption");
      return document.querySelectorAll("#pips i.gone, #pips i.save").length === 5
        && document.querySelector("#lv")?.textContent === "Lv 2"
        && caption && templates.some((text) => text.replace("{n}", String(saved)) === caption.innerText);
    }, SET_END, { timeout: STEP_MS });
    result.surface = await page.locator("#caption").isVisible();
    result.caption = await page.locator("#caption").innerText();
    if (!control && !requiredLogin) {
      const png = await page.screenshot();
      const width = png.readUInt32BE(16), height = png.readUInt32BE(20);
      if (Math.max(width, height) > 1600) throw new Error(`screenshot exceeds ceiling: ${width}x${height}`);
      result.png = join(OUT, "lv-phone-first-round.png");
      writeFileSync(result.png, png);
      console.log(`screenshot ${result.png} ${width}x${height} sha256=${sha(png)}`);
    }
  } catch (error) {
    result.error = `${error.name}: ${error.message}`;
  } finally {
    clearInterval(cookiePoll);
    result.inputValues = await page.locator("#aid, #apw").evaluateAll((inputs) => inputs.map((input) => input.value));
    result.observedBalls = await page.locator("#pips i.gone, #pips i.save").count();
    result.titleVisible = await page.locator("#title").isVisible();
    result.cookie = await page.evaluate(() => document.cookie).catch(() => null);
    result.storageCookies = (await context.cookies()).length;
    result.wallMs = Date.now() - t0;
    for (const [req, began] of pending) {
      const ms = Date.now() - began;
      if (ms > result.largestResource.ms) result.largestResource = { ms, url: req.url(), pending: true };
    }
    console.log(`phone ${requiredLogin ? "required-login" : control ? "control" : "live"} ${JSON.stringify(result)}`);
    await context.close();
  }
  return result;
}

try {
  const require = createRequire(import.meta.url);
  const pkg = require("playwright/package.json");
  const coreRequire = createRequire(require.resolve("playwright"));
  const coreRoot = dirname(coreRequire.resolve("playwright-core/package.json"));
  const declared = JSON.parse(readFileSync(join(coreRoot, "browsers.json"), "utf8"))
    .browsers.find((entry) => entry.name === "chromium");
  console.log(`invocation=node tools/live-gate.mjs at=${new Date().toISOString()} HEAD=${head} gateSHA256=${sha(readFileSync(fileURLToPath(import.meta.url)))}`);
  console.log(`runtime node=${process.version} executable=${process.execPath} playwright=${pkg.version} resolved=${require.resolve("playwright")} chromiumExpected=${declared.browserVersion}`);
  check(AXES[0], await deployedBytes(), `HEAD=${head} five HTTPS hash pairs`);
  browser = await chromium.launch({ headless: true });
  console.log(`browser actual=${browser.version()} executable=${chromium.executablePath()}`);
  if (browser.version() !== declared.browserVersion) throw new Error("Chromium differs from Playwright's declared binary");
  const live = await phoneRound(LIVE);
  check(AXES[1], live.status === 200 && live.loadedUrl === LIVE && live.balls === 5 && live.surface
    && !live.error && live.consoleErrors.length === 0 && live.pageErrors.length === 0,
  `balls=${live.balls}/5 result=${live.surface} consoleErrors=${live.consoleErrors.length} pageErrors=${live.pageErrors.length} wallMs=${live.wallMs} largestResource=${JSON.stringify(live.largestResource)}`);
  const control = await phoneRound(WRONG, true);
  check(AXES[2], control.status === 404 && control.loadedUrl === WRONG && !control.entered
    && control.balls === 0 && !control.surface && control.error?.startsWith("TimeoutError:"),
  `HTTP=${control.status} entered=${control.entered} balls=${control.balls}/5 result=${control.surface}`);
  check(AXES[3], noLoginRequired(live) && !live.cookieError,
  `balls=${live.balls}/5 inputValues=${JSON.stringify(live.inputValues)} credentialOrCookieViolations=${live.audit.length} titleTaps=${JSON.stringify(live.titleTaps)} navigations=${live.navigations.length} finalCookie=${JSON.stringify(live.cookie)} contextCookies=${live.storageCookies}`);
  const required = await phoneRound(LIVE, false, true);
  const requiredVerdict = noLoginRequired(required) ? "GREEN" : "RED";
  check(AXES[4], requiredVerdict === "RED" && required.mutationHits === 1 && !required.mutationError
    && required.status === 200 && required.titleVisible && !required.entered && required.observedBalls === 0
    && required.titleTaps.length === 1 && required.titleTaps[0] === "go"
    && required.inputValues.length === 2 && required.inputValues.every((value) => value === "")
    && required.audit.length === 0 && required.navigations.length === 1
    && required.consoleErrors.length === 0 && required.pageErrors.length === 0
    && required.error?.startsWith("TimeoutError:"),
  `mutationHits=${required.mutationHits} loginAxis=${requiredVerdict} HTTP=${required.status} entered=${required.entered} balls=${required.observedBalls}/5 titleVisible=${required.titleVisible}`);
  if (git("rev-parse", "HEAD").toString().trim() !== head) throw new Error("HEAD moved during live measurement");
} catch (error) {
  console.error(error.stack);
  for (const name of AXES) if (!verdicts.has(name)) check(name, false, error.message);
  process.exitCode = 1;
} finally {
  await browser?.close();
  await api?.dispose();
  clearTimeout(watchdog);
}
const failed = AXES.filter((name) => verdicts.get(name) !== true);
console.log(`live ${failed.length || process.exitCode ? "FAIL" : "PASS"} axes=${AXES.length - failed.length}/${AXES.length} totalWallMs=${Date.now() - started}`);
if (failed.length) process.exitCode = 1;
