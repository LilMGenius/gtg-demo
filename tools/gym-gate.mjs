import { chromium } from "playwright";

// 훈련장 게이트. 성장 칸이 전부 상한에 닿았을 때 훈련이 사표가 되는가.
// 이 축은 파운더가 먼저 본 결함이다. 만렙에 닿은 저장을 어느 게이트도 입력으로 쓴 적이 없었다.
// 종단 상태는 주입 훅(?preset=maxed)으로 앞당기고, 판정식은 건드리지 않는다.
// 두 번째 축 무리는 격자가 화면 안에 있는가다. F3 6.7은 740x360에서 다섯째 열이 잘린다고 적었는데
// 실측은 그렇지 않았다. 카드의 오른끝은 그림자까지 725.78px이고 화면은 740px이라 14.22px이 남는다.
// 남은 사실은 기울기다. 그림자가 오른쪽 여백만 8px 먹어 왼쪽 22.20px 오른쪽 14.22px로 갈리고,
// 리포트는 그 기울기를 잘림으로 읽었다. 그래서 이 축은 잘림을 고치는 대신 잘리지 않음을 붙잡는다.
// 그림자는 레이아웃 상자 밖에 그려져서 rect만 재면 안 보인다. 계산된 box-shadow의 x 오프셋을 더한다.
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

  // 좁은 폭은 제 창을 따로 열어야 해서 부팅이 페이지를 받는다. 두 창이 같은 순서를 밟아야
  // 넓은 쪽과 좁은 쪽의 차이가 폭에서만 오고 진행 상태에서 오지 않는다.
  const bootOn = async (pg, q) => {
    await pg.goto(BASE + q, { waitUntil: "load" });
    await pg.evaluate(() => localStorage.clear());
    await pg.reload({ waitUntil: "load" });
    await pg.waitForTimeout(1200);
    await pg.click("#go", { force: true });
    await pg.waitForTimeout(1400);
    await pg.click("#gymBtn", { force: true });
    await pg.waitForTimeout(300);
  };
  const boot = (q) => bootOn(p, q);

  // 대조군. 주입이 없으면 성장 칸은 상한이 아니고, 환전 줄 자체가 화면에 없다.
  // 이게 없으면 본시험의 녹색은 화면이 늘 그렇게 생긴 것과 구분되지 않는다.
  await boot("?seed=20&preset=veteran");
  const plain = await gym();
  check("control:fresh-save-is-not-at-the-ceiling", plain.rows.some((r) => r.tail !== "MAX"), plain.rows.filter((r) => r.tail === "MAX").length + "/" + plain.rows.length + " max");
  check("control:swap-row-is-absent-below-the-ceiling", plain.swap === null, plain.swap ? plain.swap.text : "absent");

  // 본시험. 만렙 저장에서 훈련장을 연다.
  await boot("?seed=20&preset=maxed,veteran");
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
  check("exit:swap-row-states-the-rate-in-its-own-text", !!maxed.swap && maxed.swap.text.includes("육수") && maxed.swap.text.includes(want), (maxed.swap ? maxed.swap.text : "absent") + " want " + want);

  await p.click("#gym .swap", { force: true });
  await p.waitForTimeout(400);
  const after = await p.evaluate(() => ({ points: window.__points(), coin: window.__wallet().coin }));
  check("exit:swap-drains-the-training-backlog", after.points === 0, String(after.points));
  check("exit:swap-pays-the-declared-rate", after.coin === before.coin + before.points * COIN_DRILL, before.coin + "+" + before.points * COIN_DRILL + " -> " + after.coin);
  const done = await gym();
  check("exit:spent-swap-row-says-why-it-is-dead", !!done.swap && done.swap.off && done.swap.text.includes("바꿀 훈련이 없다"), done.swap ? done.swap.text + " off=" + done.swap.off : "absent");

  // 카드 한 장의 오른끝. 레이아웃 상자에 그림자 x 오프셋을 더한 값이고, inset 그림자는 상자 안이라 뺀다.
  const edges = () => {
    const cards = [...document.querySelectorAll("#gym .row button")];
    let worst = -Infinity, who = "", left = Infinity;
    for (const el of cards) {
      const r = el.getBoundingClientRect();
      let dx = 0;
      for (const one of getComputedStyle(el).boxShadow.split(/,(?![^(]*\))/)) {
        if (/inset/.test(one)) continue;
        const m = one.match(/(-?[\d.]+)px\s+(-?[\d.]+)px\s+(-?[\d.]+)px(?:\s+(-?[\d.]+)px)?/);
        if (m) dx = Math.max(dx, +m[1] + +m[3] + (m[4] === undefined ? 0 : +m[4]));
      }
      const over = r.right + dx - innerWidth;
      if (over > worst) { worst = over; who = el.dataset.k || ""; }
      left = Math.min(left, r.left);
    }
    return { n: cards.length, worst: +worst.toFixed(2), who, left: +left.toFixed(2), iw: innerWidth };
  };
  const said = (e) => e.n + " cards, worst right edge " + (e.iw + e.worst).toFixed(2) + " of " + e.iw + " on " + e.who +
    " (" + (e.worst > 0 ? "over by " + e.worst.toFixed(2) : "clear by " + (-e.worst).toFixed(2)) + "px), left " + e.left;
  const inside = (e) => e.n === SLOTS && e.worst <= 0 && e.left >= 0;

  // 본시험. 리포트가 찍은 화면과 같은 740x360이다.
  const mob = await b.newContext({ viewport: { width: 740, height: 360 }, deviceScaleFactor: 2 });
  const mp = await mob.newPage();
  mp.on("pageerror", (e) => errs.push(String(e)));
  mp.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
  // 상한 주입은 이 축과 상관이 없다. 리포트가 판정한 그 화면을 그대로 다시 세워야
  // 이 게이트가 찍는 그림이 10-gym-740.png와 같은 자리에서 비교된다.
  await bootOn(mp, "?seed=20&preset=veteran");
  // 커서가 카드 위에 남으면 hover 그림자(8px 10px)가 섞인다. 재기 전에 화면 밖으로 뺀다.
  await mp.mouse.move(2, 2);
  await mp.waitForTimeout(150);
  const narrow = await mp.evaluate(edges);
  check("gym:every-card-and-its-shadow-stays-inside-the-viewport-at-740x360", inside(narrow), said(narrow));
  if (shot) await mp.screenshot({ path: shot.replace(/\.png$/, "") + "-740.png" });
  await mob.close();

  // 대조군. 같은 판정식이 1280x720에서도 통과해야 이 축이 폭 하나에만 붙은 것이 아니다.
  await p.mouse.move(2, 2);
  await p.waitForTimeout(150);
  const wide = await p.evaluate(edges);
  check("control:every-card-and-its-shadow-stays-inside-the-viewport-at-1280x720", inside(wide), said(wide));

  // 음성 대조군. 폭을 억지로 늘려 카드를 화면 밖으로 밀고, 판정식이 그때 실제로 빨개지는지 본다.
  // 이게 없으면 위 두 줄의 녹색은 판정식이 아무것도 안 재는 경우와 구분되지 않는다.
  await p.evaluate(() => {
    const s = document.createElement("style");
    s.id = "plant";
    s.textContent = "#gym .row{width:calc(100vw + 120px)}";
    document.head.append(s);
  });
  await p.waitForTimeout(150);
  const planted = await p.evaluate(edges);
  await p.evaluate(() => document.getElementById("plant").remove());
  await p.waitForTimeout(150);
  const back = await p.evaluate(edges);
  check("control:planted-width-pushes-a-card-past-the-viewport-edge", !inside(planted) && inside(back),
    "planted " + said(planted) + " | restored " + said(back));

  if (shot) await p.screenshot({ path: shot });
  check("console:no-errors", errs.length === 0, errs.slice(0, 3).join(" | ") || "clean");

  console.log(notes.map((s) => "  ok   " + s).join("\n"));
  if (fails.length) console.log(fails.map((s) => "  FAIL " + s).join("\n"));
  console.log(fails.length ? "gym FAIL " + fails.length : "gym PASS " + notes.length);
  if (fails.length) process.exitCode = 1;
} finally {
  clearTimeout(t);
  if (b) await b.close();
}
