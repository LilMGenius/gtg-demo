import { chromium } from "playwright";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { CAUSE_LABEL } from "../src/ledger.mjs";
import { pinClock } from "./clock.mjs";

// Reuse sfx-gate's frame-stamped sound log and clock.mjs clock. Reuse walkback-gate's
// page.route control so the historical module never replaces a tracked file.
// Natural seed-20 rounds, veteran onboarding and maxed stats. ArrowLeft starts the shot;
// ArrowRight during flight sets the following rounds' preference, as in walkback-gate.
// The radius comes from the rendered ball geometry, not a second tolerance in this gate.
const ROOT = fileURLToPath(new URL("../", import.meta.url));
const EXE = process.env.LOCALAPPDATA + "/ms-playwright/chromium-1228/chrome-win64/chrome.exe";
const BASE = "http://127.0.0.1:10310/web/index.html?preset=veteran,maxed&seed=20&vary=0";
const OLD = "b0b9b60";
const SHOT = process.argv.find((a) => a.startsWith("--screenshot="))?.slice(13);
const t = setTimeout(() => { console.log("WATCHDOG"); process.exit(1); }, 230000);
t.unref();
const rows = [];
function check(name, ok, detail) {
  rows.push(ok);
  console.log((ok ? "  ok   " : "  FAIL ") + name + " " + detail);
}
const waitFrames = async (page, n) => {
  const from = await page.evaluate(() => window.__frames());
  await page.waitForFunction(([f, k]) => window.__frames() - f >= k, [from, n], { timeout: 60000, polling: "raf" });
};

async function sample(browser, body, tag, { scene, error = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  try {
    await pinClock(ctx);
    await ctx.addInitScript(() => {
      const log = [];
      log.push = function (e) {
        return Array.prototype.push.call(this, [e[0], e[1], e[2], window.__frames ? window.__frames() : 0]);
      };
      window.__sfxLog = log;
    });
    const page = await ctx.newPage();
    page.setDefaultTimeout(60000);
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
    if (body !== null) await page.route("**/web/src/main.mjs", (r) => r.fulfill({ status: 200, contentType: "text/javascript; charset=utf-8", body }));
    if (scene) await page.route("**/web/src/render/scene.mjs", (r) => r.fulfill({ status: 200, contentType: "text/javascript; charset=utf-8", body: scene }));
    if (error) await ctx.addInitScript(() => {
      window.addEventListener("load", () => { throw new Error("m2 restart injected page error"); }, { once: true });
    });
    await page.goto(BASE, { waitUntil: "load" });
    await page.waitForSelector("#go");
    if (error) return { errors };
    await waitFrames(page, 54);
    await page.click("#go", { force: true });
    await waitFrames(page, 84);
    await page.evaluate(() => {
      window.__m2Windows = [];
      let current = null;
      const read = () => {
        const cap = document.getElementById("caption");
        const tick = cap.querySelector(".tick");
        const f = window.__frames();
        const pos = window.__ballPos();
        const kind = window.__tailKind();
        if (tick && !current) {
          const rect = cap.getBoundingClientRect();
          const style = getComputedStyle(cap);
          current = {
            caption: cap.textContent, html: cap.innerHTML, kind, start: f, z: [pos.z], y: [pos.y],
            visible: rect.width > 0 && rect.height > 0 && rect.top >= 0 && rect.bottom <= innerHeight && style.visibility === "visible" && style.display !== "none",
            single: cap.children.length === 1 && cap.firstElementChild.tagName === "SPAN" && tick.parentElement === cap.firstElementChild,
            captions: [], end: null
          };
        }
        if (current && tick) {
          current.z.push(pos.z);
          current.y.push(pos.y);
          if (current.captions.at(-1) !== cap.textContent) current.captions.push(cap.textContent);
        } else if (current) {
          current.end = f;
          current.resetZ = pos.z;
          current.resetKind = kind;
          current.pad = document.querySelector(".zone")?.classList.contains("live") === true;
          current.dribbles = window.__sfxLog.filter((e) => e[0] === "dribble" && e[3] >= current.start && e[3] < f).length;
          window.__m2Windows.push(current);
          current = null;
        }
      };
      new MutationObserver(read).observe(document.getElementById("caption"), { childList: true, subtree: true, characterData: true });
      const frame = () => { read(); requestAnimationFrame(frame); };
      requestAnimationFrame(frame);
    });
    const radius = await page.evaluate(async () => (await import("/web/src/render/units.mjs")).BALL_R);
    const spot = await page.evaluate(() => window.__ballPos().z);
    await page.keyboard.press("ArrowLeft");
    await waitFrames(page, 12);
    await page.keyboard.press("ArrowRight");
    const chosen = {};
    let seen = 0;
    let pictured = false;
    // A bounded natural-play search. Missing either outcome is a failed instrument, never a pass.
    for (let n = 0; n < 32 && (!chosen.net || !chosen.hand); n += 1) {
      await waitFrames(page, 120);
      if (SHOT && tag === "live" && !pictured && await page.locator("#caption .tick").count()) {
        const png = await page.screenshot();
        if (png.readUInt32BE(16) !== 1280 || png.readUInt32BE(20) !== 720) throw new Error("screenshot dimensions");
        writeFileSync(SHOT, png);
        console.log("screenshot " + SHOT + " " + await page.locator("#caption").innerText());
        pictured = true;
      }
      const records = await page.evaluate(() => window.__m2Windows);
      for (const r of records.slice(seen)) {
        const type = ["save", "catch"].includes(r.kind) ? "hand" : r.z[0] < 0 ? "net" : "other";
        console.log(tag + " natural " + type + " " + JSON.stringify({ caption: r.caption, kind: r.kind, frames: [r.start, r.end], dribbles: r.dribbles, y: [Math.min(...r.y), Math.max(...r.y)], firstY: r.y[0], samples: r.y.length, z: [Math.min(...r.z), Math.max(...r.z)], rest: r.z[0], reset: r.resetZ, spot, radius }));
        if (type !== "other" && !chosen[type]) chosen[type] = r;
      }
      seen = records.length;
    }
    const net = chosen.net;
    const hand = chosen.hand;
    const captionOk = (r, label) => Boolean(r) && r.visible && r.single && r.captions.length > 1 && r.captions.every((s) => s.startsWith(label + " ") && !s.includes("중") && /^\d+\.\ds$/.test(s.slice(label.length + 1)));
    const stationary = (r) => Boolean(r) && r.end > r.start && r.z.length > 1 && r.z.every(Number.isFinite) && Math.max(...r.z) <= r.z[0] + radius && r.resetZ === spot && r.resetKind === null && r.pad;
    return {
      caption: captionOk(net, CAUSE_LABEL.goalKick) && captionOk(hand, CAUSE_LABEL.throwing),
      silent: Boolean(net) && net.dribbles === 0,
      bounce: Boolean(hand) && hand.dribbles > 0,
      handSilent: Boolean(hand) && hand.dribbles === 0,
      held: Boolean(hand) && hand.end > hand.start && hand.y.length > 1 && hand.y.every((y) => Number.isFinite(y) && Math.abs(y - hand.y[0]) <= radius),
      stationary: stationary(net) && stationary(hand),
      kicked: Boolean(net) && net.z.every(Number.isFinite) && Math.max(...net.z) > net.z[0] + radius,
      zMax: net && Math.max(...net.z),
      detail: JSON.stringify({ net: net?.caption, hand: hand?.caption, netDribbles: net?.dribbles, handDribbles: hand?.dribbles, handY: hand && [Math.min(...hand.y), Math.max(...hand.y)], firstY: hand?.y[0], radius }),
      errors
    };
  } finally {
    await ctx.close();
  }
}

let browser;
try {
  const old = execFileSync("git", ["show", OLD + ":web/src/main.mjs"], { cwd: ROOT, encoding: "utf8" });
  console.log("restart " + new Date().toISOString() + " HEAD " + execFileSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim());
  console.log("runtime " + process.execPath + " " + process.version + " playwright " + import.meta.resolve("playwright") + " chromium " + EXE);
  browser = await chromium.launch({ executablePath: EXE });
  console.log("browser " + browser.version() + " " + BASE + " 1280x720 natural; no __lockRound/__act forcing");
  const live = await sample(browser, null, "live");
  check("restart:the-caption-names-the-owning-stat-and-nothing-it-does-not-draw", live.caption, live.detail);
  check("restart:no-dribble-sound-while-the-ball-is-in-the-net", live.silent, live.detail);
  check("restart:no-dribble-sound-while-the-ball-is-in-the-glove", live.handSilent, live.detail);
  check("restart:the-held-ball-stays-in-the-glove-while-it-counts-down", live.held, live.detail);
  check("restart:nothing-is-kicked-before-the-next-shot", live.stationary, "all sampled z <= resting z + ball radius; reset z equals ready spot");
  const control = await sample(browser, old, "control");
  check("control:the-old-caption-and-dribble-redden-the-axes", !control.caption && !control.silent && !control.handSilent && control.bounce && control.stationary, OLD + " caption=" + control.caption + " net-silent=" + control.silent + " hand-silent=" + control.handSilent + " " + control.detail);
  // Reuse walkback-gate's served-module routing for a rendered-ball plant. The scene's
  // ballPos is a getter; accumulate the nudge after poses overwrite the ball each frame.
  const source = readFileSync(new URL("../web/src/render/scene.mjs", import.meta.url), "utf8");
  const anchor = "    if (cue) { ballProbe.sample(tail ? tail.kind : 'flight'); stageProbe.sample(); }";
  if (source.split(anchor).length !== 2) throw new Error("scene plant anchor must match once");
  const scene = "window.__m2plant = true;\n" + source.replace(anchor, anchor + "\n    if (window.__m2plant && tail && cue?.ended && document.querySelector('#caption .tick')) ball.position.z += (tail.m2KickZ = (tail.m2KickZ || 0) + 0.05);");
  const planted = await sample(browser, null, "planted", { scene });
  check("control:a-kicked-ball-reddens-the-stationary-axis", live.stationary && !planted.stationary && planted.kicked, "live stationary=" + live.stationary + " planted stationary=" + planted.stationary + " planted z max=" + planted.zMax);
  const injected = await sample(browser, null, "injected", { error: true });
  check("control:an-injected-page-error-reddens-the-console-axis", live.errors.length === 0 && injected.errors.some((e) => e === "Error: m2 restart injected page error"), "live errors=" + JSON.stringify(live.errors) + " injected errors=" + JSON.stringify(injected.errors));
  check("console:no-errors", live.errors.length + control.errors.length === 0, JSON.stringify([...live.errors, ...control.errors]));
} catch (e) {
  check("instrument:completed", false, String(e.stack || e));
} finally {
  if (browser) await browser.close();
  clearTimeout(t);
}
const fails = rows.filter((ok) => !ok).length;
console.log(fails ? "restart FAIL " + fails : "restart PASS " + rows.length);
if (fails) process.exitCode = 1;
