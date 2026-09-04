import { chromium } from "playwright";
import { COIN_SAVE, COIN_CONCEDED, COIN_FAME_STEP } from "../web/src/state/wallet.mjs";

// 한 구가 벌어들인 육수가 화면에 뜨는지 잰다. 총액만 갱신하면 유명한 키커를 막아 더 벌었다는
// 사실이 어디에도 안 남고, 보상이 난이도를 탄다는 설계가 플레이어에게 도달하지 않는다.
// 팝업은 1.1초 뒤 스스로 사라지므로 상태가 아니라 사건이고, 폴링으로만 잡힌다.

const EXE = process.env.LOCALAPPDATA + "/ms-playwright/chromium-1228/chrome-win64/chrome.exe";
const BASE = "http://127.0.0.1:10310/web/index.html";
const t = setTimeout(() => { console.log("WATCHDOG"); process.exit(1); }, 180000);
t.unref();

// 한 구가 낼 수 있는 값은 범위가 아니라 집합이다. 실점은 명성이 안 붙어 4 하나뿐이고,
// 세이브는 12에서 명성 한 계단마다 2씩 올라 30까지 짝수만 나온다.
// 범위로 재면 13이나 5 같은 값이 통과한다. 그런 수가 뜨는 건 식이 바뀌었다는 뜻이다.
const LEGAL = new Set([COIN_CONCEDED]);
for (let f = 1; f <= 10; f += 1) LEGAL.add(COIN_SAVE + COIN_FAME_STEP * (f - 1));

// 애니메이션이 1.1초다. 200ms면 한 팝업을 다섯 번 본다.
const POLL = 200;
// 팝업을 넉넉히 모으려면 여러 구가 돌아야 한다. 자동은 대기시간을 안 줄이므로 구당 4초 남짓이다.
const WATCH_MS = 70000;
const WANT = 5;

const fails = [], notes = [];
const check = (n, ok, d) => (ok ? notes : fails).push(n + " " + d);

let b;
try {
  b = await chromium.launch({ executablePath: EXE });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } });
  const p = await ctx.newPage();
  const errs = [];
  p.on("pageerror", (e) => errs.push(String(e)));
  p.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
  await p.goto(BASE, { waitUntil: "load" });
  await p.evaluate(() => localStorage.clear());
  await p.reload({ waitUntil: "load" });
  await p.waitForTimeout(1200);
  await p.click("#go", { force: true });
  await p.waitForTimeout(1400);
  await p.evaluate(() => { const bot = window.__bot(); bot.tier = 3; bot.ms = 3600000; });
  await p.click("#auto", { force: true });

  const pops = [];
  let seenGone = false, doubled = 0, prev = null;
  let coin = await p.evaluate(() => window.__wallet().coin);
  const start = Date.now();
  while (Date.now() - start < WATCH_MS && pops.length < WANT) {
    const now = await p.evaluate(() => {
      const host = document.getElementById("purse");
      const all = host.querySelectorAll(".pop");
      const b = host.querySelector("b");
      return { n: all.length, text: all.length ? all[0].textContent : null, coin: window.__wallet().coin, shown: b ? b.textContent : "" };
    });
    if (now.n > 1) doubled += 1;
    if (now.text === null) seenGone = true;
    // 같은 노드를 다섯 번 세지 않도록, 없다가 생긴 순간만 한 건으로 잡는다.
    if (now.text !== null && prev === null) pops.push({ text: now.text, delta: now.coin - coin, shown: now.shown });
    if (now.text !== null) coin = now.coin;
    prev = now.text;
    await p.waitForTimeout(POLL);
  }

  check("pop:appears", pops.length >= WANT, pops.length + " of " + WANT + " in " + ((Date.now() - start) / 1000).toFixed(0) + "s");
  check("pop:one-at-a-time", doubled === 0, "frames with two pops " + doubled);
  check("pop:clears-itself", seenGone, "an empty frame was seen " + seenGone);

  // 정규식 대신 문자로 검사한다. 이 레포에서는 이스케이프가 전송 단계에서 먹혀 조용히 다른 식이 된다.
  const digits = (t) => t.length > 0 && [...t].every((c) => c >= "0" && c <= "9");
  const bad = pops.filter((x) => x.text[0] !== "+" || !digits(x.text.slice(1)));
  check("pop:reads-as-gain", bad.length === 0, bad.map((x) => x.text).join(",") || pops.map((x) => x.text).join(" "));

  const nums = pops.map((x) => Number(x.text.slice(1)));
  const outside = nums.filter((n) => !LEGAL.has(n));
  check("pop:is-a-legal-reward", outside.length === 0, "illegal [" + outside.join(",") + "] saw " + nums.join(","));

  // 화면이 말한 값과 지갑이 실제로 오른 폭이 같아야 한다. 다르면 둘 중 하나가 거짓말이다.
  const mismatch = pops.filter((x) => Number(x.text.slice(1)) !== x.delta);
  check("pop:matches-wallet-delta", mismatch.length === 0,
    mismatch.map((x) => x.text + " vs " + x.delta).join(" | ") || pops.map((x) => x.text + "=" + x.delta).join(" "));

  check("balance:rose", pops[pops.length - 1] && [...pops[pops.length - 1].shown].some((c) => c >= "1" && c <= "9"), pops.length ? pops[pops.length - 1].shown : "no pop");
  check("console:no-errors", errs.length === 0, errs.slice(0, 3).join(" | ") || "clean");

  const LINE = String.fromCharCode(10);
  if (notes.length) console.log(notes.map((x) => "  ok   " + x).join(LINE));
  if (fails.length) console.log(fails.map((x) => "  FAIL " + x).join(LINE));
  console.log(fails.length ? "purse FAIL " + fails.length : "purse PASS");
  if (fails.length) process.exitCode = 1;
} finally {
  clearTimeout(t);
  if (b) await b.close();
}
