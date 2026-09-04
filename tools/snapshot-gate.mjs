import { chromium } from "playwright";
import { photoOdds, likesFor, whoKey } from "../web/src/state/gram.mjs";

// 타임라인의 자. 계정에 내가 쓴 글만 올라오면 그것은 일기지 타임라인이 아니다.
// 그 구를 지켜본 사람이 나를 찍어 올리고, 그 글에는 사진과 작성자와 선팔 자리가 있어야 한다.
//
// 재는 것은 셋이다. 지나간 사람이 있던 구에서만 사진이 오는가, 그 사진이 실제로 그려지는가,
// 남이 올린 글이 내 글과 화면에서 갈리는가. 그림은 화소로 본다. src가 붙었다는 것은 그려졌다는 뜻이 아니다.
// 표본 범위: 판정을 안 부른다. 계정 화면만 재므로 키퍼 표본이 결론을 안 바꾼다.
const EXE = process.env.LOCALAPPDATA + "/ms-playwright/chromium-1228/chrome-win64/chrome.exe";
// 동네 3은 행인이 가장 자주 지나간다. 사진이 오는 구를 표본 안에 넣으려면 그 자리가 맞다.
const BASE = "http://127.0.0.1:10310/web/index.html?seed=20&preset=maxed,famous,rich";
const LINE = String.fromCharCode(10);
const STEP = 1 / 60;
const t = setTimeout(() => { console.log("WATCHDOG"); process.exit(1); }, 280000);
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
  await p.evaluate((s) => window.__fixedStep(s), STEP);
  await p.click("#go", { force: true });
  // 얼굴을 튼 사람이 없으면 아무도 안 찍는다. 그 문이 설계라 열 자리를 모두 3단계로 심는다.
  // 동네도 최고 등급으로 올린다. 지나가는 사람이 잦아야 표본에 사진이 든다.
  await p.evaluate(() => {
    const r = window.__rapport();
    for (let i = 0; i < 12; i += 1) r["3:" + i] = 6;
    window.__gear().city = 3;
  });
  const from = await p.evaluate(() => window.__frames());
  await p.waitForFunction((n) => window.__frames() >= n, from + 60 * 150, { timeout: 200000 });
  await p.evaluate(() => window.__plan(0, null, window.__frames()));
  await p.waitForTimeout(150);

  const posts = await p.evaluate(() => window.__posts());
  const shots = posts.filter((x) => x.ph);
  check("instrument:the-account-filled-up", posts.length >= 6, posts.length + " posts");
  // 한 장은 우연일 수 있다. 타임라인이라면 남이 올린 글이 여러 장 섞여 있어야 한다.
  check("snapshot:passers-posted-photos", shots.length >= 2, shots.length + " of " + posts.length + " came from a passer");
  // 찍은 사람은 그 구에 있던 사람이다. 얼굴을 튼 단계가 0이면 애초에 안 찍는다.
  check("snapshot:the-photo-names-who-took-it",
    shots.every((x) => x.ph.tier >= 1 && x.n && photoOdds(x.ph.tier) > 0),
    shots.map((x) => x.n + " " + x.ph.tier + "단계").join(", "));
  // 사진은 저장에 이미지를 안 싣는다. 그때의 차림만 남기고 열 때 다시 굽는 설계다.
  check("snapshot:the-save-carries-the-look-not-the-picture",
    shots.every((x) => x.ph.look && Number.isFinite(x.ph.h) && Number.isFinite(x.ph.w) && !x.ph.src),
    shots.length ? JSON.stringify(shots[0].ph.look).slice(0, 60) : "none");

  await p.evaluate(() => window.__gram(true));
  await p.waitForTimeout(600);
  const seen = await p.evaluate(() => {
    const box = document.getElementById("gram");
    const cards = [...box.querySelectorAll(".post.shot")];
    return {
      cards: cards.length,
      mine: box.querySelectorAll(".post:not(.shot):not(.empty)").length,
      by: cards.map((c) => (c.querySelector(".by b") || {}).textContent || ""),
      buttons: cards.map((c) => Boolean(c.querySelector(".by .fol"))),
      src: cards.map((c) => (c.querySelector("img") || {}).src || "")
    };
  });
  check("snapshot:every-photo-post-stands-in-the-feed", seen.cards === shots.length && seen.mine > 0,
    seen.cards + " photo cards, " + seen.mine + " of my own");
  check("snapshot:the-photo-post-says-who-and-offers-a-follow",
    seen.by.every((x) => x.length > 0) && seen.buttons.every(Boolean),
    seen.by.join(", "));
  // 그림이 실제로 그려졌는지는 화소로 본다. 빈 캔버스도 src는 붙는다.
  const ink = await p.evaluate((list) => Promise.all(list.map((s) => new Promise((res) => {
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
  }))), seen.src);
  check("snapshot:the-picture-is-actually-drawn", ink.length > 0 && ink.every((x) => x > 8),
    ink.map((x) => x.toFixed(1) + "%").join(", "));

  check("console:no-errors", errs.length === 0, errs.slice(0, 2).join(" | ") || "clean");
  await ctx.close();

  if (notes.length) console.log(notes.map((x) => "  ok   " + x).join(LINE));
  if (fails.length) console.log(fails.map((x) => "  FAIL " + x).join(LINE));
  console.log(fails.length ? "snapshot FAIL " + fails.length : "snapshot PASS " + notes.length);
  if (fails.length) process.exitCode = 1;
} finally {
  clearTimeout(t);
  if (b) await b.close();
}
