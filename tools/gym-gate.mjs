import { chromium } from "playwright";

// \ud6c8\ub828\uc7a5 \uac8c\uc774\ud2b8. \uc131\uc7a5 \uce78\uc774 \uc804\ubd80 \uc0c1\ud55c\uc5d0 \ub2ff\uc558\uc744 \ub54c \ud6c8\ub828\uc774 \uc0ac\ud45c\uac00 \ub418\ub294\uac00.
// \uc774 \ucd95\uc740 \ud30c\uc6b4\ub354\uac00 \uba3c\uc800 \ubcf8 \uacb0\ud568\uc774\ub2e4. \ub9cc\ub819\uc5d0 \ub2ff\uc740 \uc800\uc7a5\uc744 \uc5b4\ub290 \uac8c\uc774\ud2b8\ub3c4 \uc785\ub825\uc73c\ub85c \uc4f4 \uc801\uc774 \uc5c6\uc5c8\ub2e4.
// \uc885\ub2e8 \uc0c1\ud0dc\ub294 \uc8fc\uc785 \ud6c5(?preset=maxed)\uc73c\ub85c \uc55e\ub2f9\uae30\uace0, \ud310\uc815\uc2dd\uc740 \uac74\ub4dc\ub9ac\uc9c0 \uc54a\ub294\ub2e4.
const EXE = process.env.LOCALAPPDATA + "/ms-playwright/chromium-1228/chrome-win64/chrome.exe";
const BASE = "http://127.0.0.1:10310/web/index.html";
// \ud6c8\ub828 \ud55c \ud68c\uc758 \ud658\uc804 \ub2e8\uac00. wallet.mjs\uc758 COIN_DRILL\uacfc \uac19\uc740 \uac12\uc774\uc5b4\uc57c \ud55c\ub2e4.
const COIN_DRILL = 24;
// \uc131\uc7a5 \uce78 \uc218. ledger.mjs GROWABLE\uc758 \uae38\uc774\ub2e4.
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

  // \ub300\uc870\uad70. \uc8fc\uc785\uc774 \uc5c6\uc73c\uba74 \uc131\uc7a5 \uce78\uc740 \uc0c1\ud55c\uc774 \uc544\ub2c8\uace0, \ud658\uc804 \uc904 \uc790\uccb4\uac00 \ud654\uba74\uc5d0 \uc5c6\ub2e4.
  // \uc774\uac8c \uc5c6\uc73c\uba74 \ubcf8\uc2dc\ud5d8\uc758 \ub179\uc0c9\uc740 \ud654\uba74\uc774 \ub298 \uadf8\ub807\uac8c \uc0dd\uae34 \uac83\uacfc \uad6c\ubd84\ub418\uc9c0 \uc54a\ub294\ub2e4.
  await boot("?seed=20");
  const plain = await gym();
  check("control:fresh-save-is-not-at-the-ceiling", plain.rows.some((r) => r.tail !== "MAX"), plain.rows.filter((r) => r.tail === "MAX").length + "/" + plain.rows.length + " max");
  check("control:swap-row-is-absent-below-the-ceiling", plain.swap === null, plain.swap ? plain.swap.text : "absent");

  // \ubcf8\uc2dc\ud5d8. \ub9cc\ub819 \uc800\uc7a5\uc5d0\uc11c \ud6c8\ub828\uc7a5\uc744 \uc5f0\ub2e4.
  await boot("?seed=20&preset=maxed");
  const applied = await p.evaluate(() => window.__preset);
  check("preset:maxed-was-applied", Array.isArray(applied) && applied.includes("maxed"), JSON.stringify(applied));
  const maxed = await gym();
  check("ceiling:every-slot-reads-max", maxed.rows.length === SLOTS && maxed.rows.every((r) => r.tail === "MAX"), maxed.rows.filter((r) => r.tail === "MAX").length + "/" + maxed.rows.length);
  check("ceiling:every-slot-is-unclickable", maxed.rows.every((r) => r.off), maxed.rows.filter((r) => !r.off).map((r) => r.k).join(",") || "all off");

  const before = await p.evaluate(() => ({ points: window.__points(), coin: window.__wallet().coin }));
  // \uc774 \uac8c\uc774\ud2b8\uc758 \uc0b0\ucd9c\ubb3c. \ub9cc\ub819\uc5d0\uc11c \ud6c8\ub828\uc774 \uc0ac\ud45c\uac00 \ub418\uc9c0 \uc54a\uace0 \ud658\uc804\uc73c\ub85c \ube60\uc838\ub098\uac08 \ubb38\uc774 \uc788\ub294\uac00.
  check("exit:swap-row-is-open-at-the-ceiling", maxed.swap !== null && !maxed.swap.off, maxed.swap ? maxed.swap.text + " off=" + maxed.swap.off : "absent");
  // \ubabb \ub204\ub974\ub294 \uc0ac\uc720\ub4e0 \uac12\uc774\ub4e0 \ubc84\ud2bc \uae00\uc790\uac00 \ub4e4\uace0 \uc788\uc5b4\uc57c \ud55c\ub2e4. \ud658\uc728\uc744 \ud654\uba74 \ubc16\uc5d0\uc11c \uc54c\uc544\ub0bc \uae38\uc740 \uc5c6\ub2e4.
  const want = String(before.points * COIN_DRILL);
  check("exit:swap-row-states-the-rate-in-its-own-text", !!maxed.swap && maxed.swap.text.includes("\ub540") && maxed.swap.text.includes(want), (maxed.swap ? maxed.swap.text : "absent") + " want " + want);

  await p.click("#gym .swap", { force: true });
  await p.waitForTimeout(400);
  const after = await p.evaluate(() => ({ points: window.__points(), coin: window.__wallet().coin }));
  check("exit:swap-drains-the-training-backlog", after.points === 0, String(after.points));
  check("exit:swap-pays-the-declared-rate", after.coin === before.coin + before.points * COIN_DRILL, before.coin + "+" + before.points * COIN_DRILL + " -> " + after.coin);
  const done = await gym();
  check("exit:spent-swap-row-says-why-it-is-dead", !!done.swap && done.swap.off && done.swap.text.includes("\ubc14\uafc0 \ud6c8\ub828\uc774 \uc5c6\ub2e4"), done.swap ? done.swap.text + " off=" + done.swap.off : "absent");

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
