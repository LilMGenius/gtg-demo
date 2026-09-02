import { chromium } from "playwright";

// 훈련장 게이트. 성장 칸이 전부 상한에 닿았을 때 훈련이 사표가 되는가.
// 이 축은 파운더가 먼저 본 결함이다. 만렙에 닿은 저장을 어느 게이트도 입력으로 쓴 적이 없었다.
// 종단 상태는 주입 훅(?preset=maxed)으로 앞당기고, 판정식은 건드리지 않는다.
const EXE = process.env.LOCALAPPDATA + "/ms-playwright/chromium-1228/chrome-win64/chrome.exe";
const BASE = "http://127.0.0.1:10310/web/index.html";
// 훈련 한 회의 환전 단가. wallet.mjs의 COIN_DRILL과 같은 값이어야 한다.
const COIN_DRILL = 24;
// 성장 칸 수. ledger.mjs GROWABLE의 길이다.
const SLOTS = 15;
const t = setTimeout(() => { console.log("WATCHDOG"); process.exit(1); }, 150000);
t.unref();

const fails = [], notes = [];
const check = (n, ok, d) => (ok ? notes : fails).push(n + " " + d);
const shot = process.argv[2];

let b;
try {
  b = await chromium.launch({ executablePath: EXE });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } });
  const p = await ctx.newPage();
  const errs = [];
  p.on("pageerror", (e) => errs.push(String(e)));
  p.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });

  const gym = async () => p.evaluate(() => {
    const box = document.getElementById("gym");
    const rows = [...box.querySelectorAll(".row button")].map((x) => ({
      k: x.dataset.k, tail: x.querySelector("em").textContent, off: x.disabled,
    }));
    const sw = box.querySelector(".swap");
    return { head: box.querySelector("h4").textContent, rows, swap: sw ? { text: sw.textContent, off: sw.disabled } : null };
  });

  const boot = async (q) => {
    await p.goto(BASE + q, { waitUntil: "load" });
    await p.evaluate(() => localStorage.clear());
    await p.reload({ waitUntil: "load" });
    await p.waitForTimeout(1200);
    await p.click("#go", { force: true });
    await p.waitForTimeout(1400);
    await p.click("#gymBtn", { force: true });
    await p.waitForTimeout(300);
  };

  // 대조군. 주입이 없으면 성장 칸은 상한이 아니고, 환전 줄 자체가 화면에 없다.
  // 이게 없으면 본시험의 녹색은 화면이 늘 그렇게 생긴 것과 구분되지 않는다.
  await boot("?seed=20");
  const plain = await gym();
  check("control:fresh-save-is-not-at-the-ceiling", plain.rows.some((r) => r.tail !== "MAX"), plain.rows.filter((r) => r.tail === "MAX").length + "/" + plain.rows.length + " max");
  check("control:swap-row-is-absent-below-the-ceiling", plain.swap === null, plain.swap ? plain.swap.text : "absent");

  // 본시험. 만렙 저장에서 훈련장을 연다.
  await boot("?seed=20&preset=maxed");
  const applied = await p.evaluate(() => window.__preset);
  check("preset:maxed-was-applied", Array.isArray(applied) && applied.includes("maxed"), JSON.stringify(applied));
  const maxed = await gym();
  check("ceiling:every-slot-reads-max", maxed.rows.length === SLOTS && maxed.rows.every((r) => r.tail === "MAX"), maxed.rows.filter((r) => r.tail === "MAX").length + "/" + maxed.rows.length);
  check("ceiling:every-slot-is-unclickable", maxed.rows.every((r) => r.off), maxed.rows.filter((r) => !r.off).map((r) => r.k).join(",") || "all off");

  const before = await p.evaluate(() => ({ points: window.__points(), coin: window.__wallet().coin }));
  // 이 게이트의 산출물. 만렙에서 훈련이 사표가 되지 않고 환전으로 빠져나갈 문이 있는가.
  check("exit:swap-row-is-open-at-the-ceiling", maxed.swap !== null && !maxed.swap.off, maxed.swap ? maxed.swap.text + " off=" + maxed.swap.off : "absent");
  // 못 누르는 사유든 값이든 버튼 글자가 들고 있어야 한다. 환율을 화면 밖에서 알아낼 길은 없다.
  const want = String(before.points * COIN_DRILL);
  check("exit:swap-row-states-the-rate-in-its-own-text", !!maxed.swap && maxed.swap.text.includes("땀") && maxed.swap.text.includes(want), (maxed.swap ? maxed.swap.text : "absent") + " want " + want);

  await p.click("#gym .swap", { force: true });
  await p.waitForTimeout(400);
  const after = await p.evaluate(() => ({ points: window.__points(), coin: window.__wallet().coin }));
  check("exit:swap-drains-the-training-backlog", after.points === 0, String(after.points));
  check("exit:swap-pays-the-declared-rate", after.coin === before.coin + before.points * COIN_DRILL, before.coin + "+" + before.points * COIN_DRILL + " -> " + after.coin);
  const done = await gym();
  check("exit:spent-swap-row-says-why-it-is-dead", !!done.swap && done.swap.off && done.swap.text.includes("바꿀 훈련이 없다"), done.swap ? done.swap.text + " off=" + done.swap.off : "absent");

  if (shot) await p.screenshot({ path: shot });
  check("console:no-errors", errs.length === 0, errs.slice(0, 3).join(" | ") || "clean");

  console.log(notes.map((s) => "  ok   " + s).join("\n"));
  if (fails.length) console.log(fails.map((s) => "  FAIL " + s).join("\n"));
  console.log(fails.length ? "gym FAIL " + fails.length : "gym PASS");
  if (fails.length) process.exitCode = 1;
} finally {
  clearTimeout(t);
  if (b) await b.close();
}
