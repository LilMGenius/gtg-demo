import { chromium } from "playwright";
import { selfieFans, likesFor } from "../web/src/state/gram.mjs";

// 셀카의 자. 라포를 쌓아 값을 치르고 만나러 갔으면 그 자리에서 회수되는 것이 있어야 한다.
// 없으면 만남은 자막 한 줄로 끝나고, 그 뒤로 아무도 다시 안 만나러 간다.
//
// 재는 것은 셋이다. 이긴 만남에서만 그 자리가 열리는가, 한 장이 내 계정에 실제로 올라가는가,
// 그 한 장이 팔로워를 선언한 만큼 올리는가. 한 번만 찍히는지도 같이 본다.
// 대조군은 진 만남이다. 거기서도 자리가 열리면 만남의 결과가 화면에서 사라진다.
// 표본 범위: 판정을 안 부른다. 만남과 계정만 재므로 키퍼 표본이 결론을 안 바꾼다.
const EXE = process.env.LOCALAPPDATA + "/ms-playwright/chromium-1228/chrome-win64/chrome.exe";
const BASE = "http://127.0.0.1:10310/web/index.html?seed=20&preset=maxed,rich,veteran";
const LINE = String.fromCharCode(10);
const t = setTimeout(() => { console.log("WATCHDOG"); process.exit(1); }, 180000);
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
  await p.goto(BASE, { waitUntil: "load" });
  await p.evaluate(() => localStorage.clear());
  await p.reload({ waitUntil: "load" });
  await p.waitForSelector("#go", { timeout: 15000 });
  await p.click("#go", { force: true });
  await p.waitForTimeout(1200);
  // 만남은 라포가 쌓여야 열린다. 판을 수십 번 돌려 그 자리를 만드는 대신 저장에 직접 심는다.
  // 심는 값은 판정이 읽는 그 자리이고, 만남의 문도 같은 값을 읽는다.
  await p.evaluate(() => { window.__rapport()["0:0"] = 9; window.__lockRound(); });
  await p.waitForTimeout(200);

  // 진 만남. 화면이 그 결과를 말하고, 셀카 자리는 없어야 한다.
  const lost = await p.evaluate(() => {
    window.__date(0, 0);
    const box = document.getElementById("date");
    // 세 갈래 중 하나를 고른다. 결과는 굴림이라 여기서 정하지 않는다.
    return { moves: box.querySelectorAll("[data-move]").length };
  });
  check("instrument:the-date-window-offers-its-moves", lost.moves >= 2, lost.moves + " moves");

  // 이길 때까지 굴린다. 이긴 자리에서만 셀카가 열리는 것이 이 자의 주장이다.
  let won = null;
  let lostSeen = null;
  for (let i = 0; i < 30 && (!won || !lostSeen); i += 1) {
    await p.evaluate(() => { window.__date(); window.__rapport()["0:0"] = 9; window.__date(0, 0); });
    await p.waitForTimeout(90);
    await p.click("#date [data-move]", { force: true });
    await p.waitForTimeout(140);
    const seen = await p.evaluate(() => {
      const box = document.getElementById("date");
      return { win: Boolean(box.querySelector(".out .win")), selfie: Boolean(box.querySelector(".selfie")),
        fans: window.__fans() };
    });
    if (seen.win && !won) won = seen;
    if (!seen.win && !lostSeen) lostSeen = seen;
  }
  check("instrument:both-outcomes-were-seen", Boolean(won) && Boolean(lostSeen),
    "won " + Boolean(won) + " lost " + Boolean(lostSeen));
  check("control:a-lost-date-offers-no-selfie", lostSeen && lostSeen.selfie === false,
    lostSeen ? "selfie " + lostSeen.selfie : "no lost date seen");
  check("selfie:a-won-date-opens-the-camera", won && won.selfie === true,
    won ? "selfie " + won.selfie : "no won date seen");

  /* 찍는다. 위 순회는 두 결과를 다 보려고 계속 굴렸으므로 마지막 화면은 진 만남일 수 있다.
     누르기 전에 지금 열려 있는 화면이 이긴 만남인지부터 다시 만든다. */
  for (let i = 0; i < 30; i += 1) {
    const live = await p.evaluate(() => Boolean(document.querySelector("#date .selfie")));
    if (live) break;
    await p.evaluate(() => { window.__date(); window.__rapport()["0:0"] = 9; window.__date(0, 0); });
    await p.waitForTimeout(90);
    await p.click("#date [data-move]", { force: true });
    await p.waitForTimeout(140);
  }
  const before = await p.evaluate(() => ({ fans: window.__fans(), posts: window.__posts().length }));
  await p.click("#date .selfie", { force: true });
  await p.waitForTimeout(220);
  const after = await p.evaluate(() => ({ fans: window.__fans(), posts: window.__posts(),
    still: Boolean(document.querySelector("#date .selfie")), took: Boolean(document.querySelector("#date .took")) }));
  const shots = after.posts.filter((x) => x.sf);
  check("selfie:the-shot-lands-in-my-feed", shots.length === 1 && after.posts.length === before.posts + 1,
    shots.length + " selfies, feed " + before.posts + " to " + after.posts.length);
  const want = shots.length ? selfieFans(shots[0].sf.tier, shots[0].ct) : -1;
  check("selfie:the-followers-match-the-declared-number", after.fans - before.fans === want,
    (after.fans - before.fans) + " against " + want);
  check("selfie:the-likes-come-from-that-number",
    shots.length === 1 && shots[0].l >= likesFor(want, shots[0].ct, 0) && shots[0].l <= likesFor(want, shots[0].ct, 1),
    shots.length ? shots[0].l + " in [" + likesFor(want, shots[0].ct, 0) + "," + likesFor(want, shots[0].ct, 1) + "]" : "none");
  check("selfie:the-camera-closes-after-one-shot", after.still === false && after.took === true,
    "button " + after.still + ", result " + after.took);

  // 피드에 그림이 실제로 선다. 남이 올린 사진과 같은 자로 본다.
  await p.evaluate(() => { window.__date(); window.__me(false); window.__gram(true); });
  await p.waitForTimeout(500);
  const card = await p.evaluate(() => {
    const c = document.querySelector("#gram .post.shot.mine");
    return c ? { by: (c.querySelector(".by b") || {}).textContent || "", src: (c.querySelector("img") || {}).src || "" } : null;
  });
  check("selfie:the-feed-shows-the-shot-as-mine", Boolean(card) && card.by.length > 0, card ? card.by : "no card");
  const ink = await p.evaluate((s) => new Promise((res) => {
    const im = new Image();
    im.onload = () => {
      const cv = document.createElement("canvas");
      cv.width = im.width; cv.height = im.height;
      const g = cv.getContext("2d");
      g.drawImage(im, 0, 0);
      const d = g.getImageData(0, 0, im.width, im.height).data;
      let on = 0;
      for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 24) on += 1;
      res(100 * on / (d.length / 4));
    };
    im.onerror = () => res(-1);
    im.src = s;
  }), card ? card.src : "");
  check("selfie:the-picture-is-actually-drawn", ink > 8, ink.toFixed(1) + "% of the plate has ink");

  check("console:no-errors", errs.length === 0, errs.slice(0, 2).join(" | ") || "clean");
  await ctx.close();

  if (notes.length) console.log(notes.map((x) => "  ok   " + x).join(LINE));
  if (fails.length) console.log(fails.map((x) => "  FAIL " + x).join(LINE));
  console.log(fails.length ? "selfie FAIL " + fails.length : "selfie PASS " + notes.length);
  if (fails.length) process.exitCode = 1;
} finally {
  clearTimeout(t);
  if (b) await b.close();
}
