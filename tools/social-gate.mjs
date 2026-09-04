import { chromium } from "playwright";
import { likesFor, backOdds, mutualBoost, whoKey } from "../web/src/state/gram.mjs";

// 아웃문그램의 자. 담벼락이면 글만 붙으면 끝이지만, 계정이면 누가 보고 반응하고 이어진다.
//
// 재는 것은 셋이다. 좋아요가 그 구의 화제에서 나오는가, 댓글이 얼굴 튼 사람에게서만 오는가,
// 선팔이 관계를 실제로 바꾸는가. 화면이 말한 수와 장부의 수를 같은 자리에서 맞댄다.
// 대조군은 아무도 안 따라간 계정이다. 거기서 배율이 1이 아니면 이 자는 아무것도 안 재고 있다.
// 표본 범위: 판정을 안 부른다. 팔로워 축만 재므로 키퍼 표본이 결론을 안 바꾼다.
const EXE = process.env.LOCALAPPDATA + "/ms-playwright/chromium-1228/chrome-win64/chrome.exe";
const BASE = "http://127.0.0.1:10310/web/index.html?seed=20&preset=maxed,famous";
const LINE = String.fromCharCode(10);
const STEP = 1 / 60;
const t = setTimeout(() => { console.log("WATCHDOG"); process.exit(1); }, 200000);
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

  // 대조군. 아무도 안 따라간 계정은 배율이 1이고 화면도 0퍼센트라고 말해야 한다.
  const bare = await p.evaluate(() => ({ social: window.__social(), posts: window.__posts().length }));
  check("control:a-fresh-account-follows-nobody",
    Object.keys(bare.social.follows).length === 0 && Math.abs(mutualBoost(bare.social) - 1) < 1e-9,
    "follows " + Object.keys(bare.social.follows).length + ", posts " + bare.posts);

  // 얼굴을 튼 사람이 없으면 댓글이 한 줄도 안 붙는다. 그 문이 이 시스템의 설계라 먼저 열어 둔다.
  // 행인 인덱스는 구마다 굴러 나오므로 열 자리를 모두 3단계로 심는다.
  await p.evaluate(() => { const r = window.__rapport(); for (let i = 0; i < 10; i += 1) r["0:" + i] = 6; });
  const from = await p.evaluate(() => window.__frames());
  await p.waitForFunction((n) => window.__frames() >= n, from + 60 * 70, { timeout: 120000 });
  // 읽는 동안에도 판이 돌면 장부와 화면이 한 글 어긋난다. 세우고 읽는다.
  await p.evaluate(() => window.__plan(0, null, window.__frames()));
  await p.waitForTimeout(150);

  const posts = await p.evaluate(() => window.__posts());
  check("instrument:the-account-has-posts-to-read", posts.length >= 3, posts.length + " posts");
  // 좋아요는 그 글의 화제와 동네에서 나온다. 굴림 폭 0.7~1.3 안에 있어야 그 식에서 나온 수다.
  const off = posts.filter((x) => {
    const lo = likesFor(x.g, 0, 0);
    const hi = likesFor(x.g, 0, 1);
    return !(x.l >= lo && x.l <= hi);
  });
  check("social:every-post-carries-likes-from-its-own-topic", posts.every((x) => x.l >= 1) && off.length === 0,
    off.length ? off.map((x) => x.l + " outside [" + likesFor(x.g, 0, 0) + "," + likesFor(x.g, 0, 1) + "]").join(", ")
      : posts.map((x) => x.l).join(",") + " likes over " + posts.length + " posts");
  const cmts = posts.filter((x) => x.cm);
  check("instrument:some-post-drew-a-comment", cmts.length > 0, cmts.length + " of " + posts.length);
  check("social:a-comment-only-comes-from-a-known-face", cmts.every((x) => x.cm.tier >= 1 && x.cm.who && x.cm.text),
    cmts.map((x) => x.cm.who + " " + x.cm.tier + "단계").join(", "));

  // 화면이 장부를 옮겨 그리는가. 옮기는 도중에 어긋나면 화면만 조용히 거짓말을 한다.
  await p.evaluate(() => window.__gram(true));
  await p.waitForTimeout(320);
  const shown = await p.evaluate(() => {
    const box = document.getElementById("gram");
    return {
      likes: [...box.querySelectorAll(".post i")].map((e) => e.textContent.trim()),
      cmts: [...box.querySelectorAll(".cmt")].length,
      buttons: [...box.querySelectorAll(".cmt .fol")].map((e) => ({ key: e.dataset.key, label: e.textContent.trim(), off: e.disabled })),
      head: box.querySelector("h4 small").textContent.trim()
    };
  });
  check("social:the-feed-shows-one-comment-row-per-comment", shown.cmts === cmts.length,
    shown.cmts + " rows against " + cmts.length + " comments");
  check("social:the-header-states-the-multiplier-the-ledger-holds",
    shown.head.indexOf(String(Math.round((mutualBoost(bare.social) - 1) * 100)) + "%") >= 0,
    shown.head);

  // 선팔을 건다. 관계가 바뀌면 버튼이 바뀌고 장부에도 남아야 한다.
  const first = shown.buttons[0];
  check("instrument:a-follow-button-was-offered", Boolean(first) && !first.off && first.label === "선팔",
    first ? first.label + " off=" + first.off : "none");
  await p.click("#gram .cmt .fol", { force: true });
  await p.waitForTimeout(260);
  const after = await p.evaluate((k) => {
    const box = document.getElementById("gram");
    const btn = [...box.querySelectorAll(".cmt .fol")].find((e) => e.dataset.key === k);
    return { social: window.__social(), label: btn ? btn.textContent.trim() : "", off: btn ? btn.disabled : null,
      head: box.querySelector("h4 small").textContent.trim() };
  }, first.key);
  const held = after.social.follows[first.key];
  check("social:the-follow-lands-in-the-ledger", held === 0 || held === 1,
    first.key + " holds " + JSON.stringify(held) + " with odds " + backOdds(1) + " to " + backOdds(3));
  check("social:the-button-says-what-the-ledger-says",
    after.label === (held === 1 ? "맞팔" : "팔로우 중") && after.off === true,
    after.label + " off=" + after.off);
  check("social:the-multiplier-follows-the-mutuals",
    after.head.indexOf(String(Math.round((mutualBoost(after.social) - 1) * 100)) + "%") >= 0,
    after.head + " against " + mutualBoost(after.social).toFixed(2));

  check("console:no-errors", errs.length === 0, errs.slice(0, 2).join(" | ") || "clean");
  await ctx.close();

  if (notes.length) console.log(notes.map((x) => "  ok   " + x).join(LINE));
  if (fails.length) console.log(fails.map((x) => "  FAIL " + x).join(LINE));
  console.log(fails.length ? "social FAIL " + fails.length : "social PASS " + notes.length);
  if (fails.length) process.exitCode = 1;
} finally {
  clearTimeout(t);
  if (b) await b.close();
}
