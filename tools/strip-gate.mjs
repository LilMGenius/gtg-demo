import { chromium } from "playwright";

// 시착용을 무르는 자의 자. 걸친 것을 벗는 길이 카드를 다시 찾아 누르는 것뿐이면,
// 무엇을 걸쳤는지 아는 자리와 그것을 무르는 자리가 갈려 있다.
//
// 읽는 자리는 탈의실 아래 단추 줄이다. 벗기는 #shop .fitting .acts .strip에 서고,
// 걸친 것은 그 위 #shop .fitting .tried i[data-off]에 칩으로 눕는다.
//
// 재는 것은 넷이다. 걸친 줄마다 무르는 자리가 있는가, 하나를 벗으면 그것만 빠지는가,
// 전부 벗기가 목록을 비우는가, 벗을 것이 없을 때 그 자리가 꺼진 채로 서 있는가.
//
// 벗기는 값을 안 건드린다. 시착용은 치른 적이 없으므로 되돌릴 잔고도 없고,
// 그 대조군이 없으면 이 자리는 환불 버튼과 구분되지 않는다.
const EXE = process.env.LOCALAPPDATA + "/ms-playwright/chromium-1228/chrome-win64/chrome.exe";
const LINE = String.fromCharCode(10);
const t = setTimeout(() => { console.log("WATCHDOG"); process.exit(1); }, 150000);
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
  p.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
  await p.goto("http://127.0.0.1:10310/web/index.html?seed=20&preset=rich,veteran", { waitUntil: "load" });
  await p.waitForSelector("#go", { timeout: 15000 });
  await p.click("#go", { force: true });
  await p.waitForTimeout(1300);
  await p.evaluate(() => window.__shop(true));
  await p.waitForTimeout(320);

  /* 벗기는 늘 서 있고, 벗을 것이 없을 때 꺼진다. 그래서 세는 것만으로는 두 상태가 안 갈리고
     칠을 같이 읽어야 한다. disabled는 코드가 하는 말이고, color와 background는 화면이 하는 말이다. */
  const worn = () => p.evaluate(() => {
    const s = document.querySelector("#shop .fitting .acts .strip");
    const cs = s && getComputedStyle(s);
    return {
      rows: [...document.querySelectorAll("#shop .fitting .tried i[data-off]")].map((e) => e.dataset.off),
      strip: document.querySelectorAll("#shop .fitting .acts .strip").length,
      label: s ? s.textContent.trim() : "",
      off: !!(s && s.disabled),
      ink: cs ? cs.color + " on " + cs.backgroundColor + " a" + cs.opacity : "no button",
      coin: window.__wallet().coin,
      body: (document.querySelector("#shop .fitting .me img") || {}).src || ""
    };
  });

  const bare = await worn();
  check("instrument:nothing-is-tried-on-at-the-start", bare.rows.length === 0, bare.rows.join(", ") || "empty");

  // 세 선반에서 하나씩 걸친다. 한 선반만 걸치면 하나 벗기와 전부 벗기가 같은 동작이 된다.
  for (const tab of ["glove", "boot", "kit"]) {
    await p.click('#shop .tab[data-tab="' + tab + '"]', { force: true });
    await p.waitForSelector('#shop .card[data-spec="' + tab + '"]', { timeout: 8000 });
    await p.locator('#shop .card[data-spec="' + tab + '"]').nth(2).click({ force: true });
    await p.waitForTimeout(220);
  }
  const three = await worn();
  check("strip:every-tried-row-carries-a-way-off",
    three.rows.length === 3 && three.strip === 1 && !three.off,
    three.rows.join(", ") + ", " + three.strip + " strip button, " + (three.off ? "dead" : "live"));
  check("control:trying-on-still-spends-nothing", three.coin === bare.coin, bare.coin + " then " + three.coin);
  check("instrument:the-body-changed-while-tried-on", three.body !== bare.body && three.body.length > 0,
    three.body === bare.body ? "same picture" : "picture moved");

  /* 벗을 것이 없는 자리. 단추가 사라지는 것이 아니라 꺼진 채로 남으므로, 서 있는가와 죽어 있는가를
     같이 묻는다. 살아 있는 벗기를 한 번 본 다음에 판정하는 것은 칠 때문이다. disabled만 읽으면
     :disabled 규칙이 통째로 없어져도 이 축이 파랗고, 눌리는 단추와 안 눌리는 단추가 화면에서 같아진다. */
  check("strip:with-nothing-tried-there-is-nothing-to-take-off",
    bare.strip === 1 && bare.label === "벗기" && bare.off && bare.ink !== three.ink,
    bare.strip + " strip button, " + (bare.off ? "dead" : "live") + ", " + bare.ink
      + (bare.ink === three.ink ? ", painted like the live one" : " vs live " + three.ink));

  // 하나만 벗는다. 나머지 둘은 그대로 남아야 한다.
  const drop = three.rows[1];
  await p.click('#shop .fitting .tried i[data-off="' + drop + '"]', { force: true });
  await p.waitForTimeout(300);
  const two = await worn();
  check("strip:taking-one-off-leaves-the-others", two.rows.length === 2 && two.rows.indexOf(drop) < 0
    && three.rows.filter((r) => r !== drop).every((r) => two.rows.indexOf(r) >= 0),
    "dropped " + drop + ", left " + two.rows.join(", "));
  check("control:taking-one-off-moves-no-money", two.coin === three.coin, three.coin + " then " + two.coin);

  // 전부 벗는다. 목록이 비는 것과 그 자리가 다시 꺼지는 것까지가 한 동작이다.
  await p.click("#shop .fitting .acts .strip", { force: true });
  await p.waitForTimeout(300);
  const none = await worn();
  check("strip:taking-everything-off-empties-the-list",
    none.rows.length === 0 && none.strip === 1 && none.off && none.ink === bare.ink && none.ink !== three.ink,
    (none.rows.join(", ") || "empty") + ", " + none.strip + " strip button, "
      + (none.off ? "dead again" : "still live") + ", " + none.ink);
  check("control:the-body-returns-to-the-bare-picture", none.body === bare.body,
    none.body === bare.body ? "back to bare" : "picture did not return");
  check("control:taking-everything-off-moves-no-money", none.coin === bare.coin, bare.coin + " then " + none.coin);

  check("console:no-errors", errs.length === 0, errs.slice(0, 2).join(" | ") || "clean");
  await ctx.close();

  if (notes.length) console.log(notes.map((x) => "  ok   " + x).join(LINE));
  if (fails.length) console.log(fails.map((x) => "  FAIL " + x).join(LINE));
  console.log(fails.length ? "strip FAIL " + fails.length : "strip PASS " + notes.length);
  if (fails.length) process.exitCode = 1;
} finally {
  clearTimeout(t);
  if (b) await b.close();
}
