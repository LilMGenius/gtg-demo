import { chromium } from "playwright";
import { DM_COOLDOWN, DM_WIN_FANS, dmOdds, DM_MOVES } from "../web/src/state/gram.mjs";

// 쪽지의 자. 미연시를 따로 열지 않고 계정 안에서 잇는다는 설계라, 이 창이 대화의 전부다.
//
// 재는 것은 셋이다. 맞팔이라야 대화가 열리는가, 답장 한 번이 결과를 내는가,
// 답장한 뒤 다음 말이 세 판 뒤로 밀리는가. 마지막이 없으면 같은 사람에게 무한히 답장해
// 팔로워를 뽑아낼 수 있다. 대조군은 선팔만 걸린 사람이다. 거기서도 대화가 열리면 맞팔이 값을 잃는다.
// 표본 범위: 판정을 안 부른다. 계정 화면만 재므로 키퍼 표본이 결론을 안 바꾼다.
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
  await p.evaluate(() => window.__lockRound());

  // 선팔만 걸린 사람과 맞팔인 사람을 하나씩 심는다. 둘을 같이 두어야 갈리는지를 물을 수 있다.
  await p.evaluate(() => {
    const s = window.__social();
    s.follows["0:1"] = 0;
    s.follows["0:2"] = 1;
    s.dm = {};
    const r = window.__rapport();
    r["0:1"] = 9;
    r["0:2"] = 9;
  });
  await p.evaluate(() => window.__gram(true));
  await p.waitForTimeout(320);
  const inbox = await p.evaluate(() => [...document.querySelectorAll("#gram .dmOpen")].map((e) => e.dataset.key));
  check("dm:only-a-mutual-follow-opens-a-thread", inbox.length === 1 && inbox[0] === "0:2",
    inbox.join(", ") || "no thread");

  await p.click('#gram .dmOpen[data-key="0:2"]', { force: true });
  await p.waitForTimeout(260);
  const open = await p.evaluate(() => {
    const box = document.getElementById("gram");
    return { them: (box.querySelector(".dm .them") || {}).textContent || "",
      picks: [...box.querySelectorAll(".dm [data-dm]")].map((e) => e.dataset.dm),
      odds: [...box.querySelectorAll(".dm [data-dm] em")].map((e) => e.textContent.trim()) };
  });
  check("instrument:the-thread-shows-a-message-and-its-choices",
    open.them.length > 0 && open.picks.length === DM_MOVES.length,
    open.them + " with " + open.picks.length + " replies");
  // 화면이 말한 확률과 판정 쪽 확률이 같은가. 다르면 고르는 손이 다른 수를 보고 고른 것이다.
  const keeper = await p.evaluate(() => window.__keeperStats());
  const want = DM_MOVES.map((m) => dmOdds(keeper, m.id) + "%");
  check("dm:the-odds-on-screen-are-the-odds-the-judge-uses",
    want.every((w, i) => open.odds[i] && open.odds[i].indexOf(w) >= 0),
    open.odds.join(" | ") + " against " + want.join(", "));

  // 답장한다. 이긴 답장은 팔로워와 라포를 같이 올린다.
  const before = await p.evaluate(() => ({ fans: window.__fans(), rap: window.__rapport()["0:2"], social: window.__social() }));
  let won = false;
  for (let i = 0; i < 24 && !won; i += 1) {
    await p.evaluate(() => { const s = window.__social(); s.dm = {}; });
    await p.evaluate(() => { window.__gram(false); window.__gram(true); });
    await p.waitForTimeout(160);
    await p.click('#gram .dmOpen[data-key="0:2"]', { force: true });
    await p.waitForTimeout(140);
    await p.click("#gram .dm [data-dm]", { force: true });
    await p.waitForTimeout(160);
    won = await p.evaluate(() => Boolean(document.querySelector("#gram .dm .out.win")));
  }
  const after = await p.evaluate(() => ({ fans: window.__fans(), rap: window.__rapport()["0:2"], social: window.__social(),
    said: Boolean(document.querySelector("#gram .dm .me")), picks: document.querySelectorAll("#gram .dm [data-dm]").length }));
  check("instrument:a-winning-reply-was-reached", won, "won " + won);
  check("dm:a-reply-closes-the-choices-and-shows-both-lines", after.said === true && after.picks === 0,
    "my line " + after.said + ", choices left " + after.picks);
  check("dm:a-winning-reply-pays-followers-and-deepens-the-face",
    after.fans - before.fans >= DM_WIN_FANS && after.rap > before.rap,
    "followers +" + (after.fans - before.fans) + ", rapport " + before.rap + " to " + after.rap);
  // 답장한 시각이 남아야 다음 말이 밀린다. 안 남으면 같은 사람에게 무한히 답장한다.
  check("dm:the-answer-is-stamped-on-the-thread", after.social.dm && Number.isFinite(after.social.dm["0:2"] && after.social.dm["0:2"].at),
    JSON.stringify(after.social.dm));

  // 계정으로 돌아가면 그 사람은 목록에서 빠져 있어야 한다. 판이 세 번 돌기 전에는 새 말이 없다.
  await p.click("#gram .close", { force: true });
  await p.waitForTimeout(220);
  const back = await p.evaluate(() => [...document.querySelectorAll("#gram .dmOpen")].map((e) => e.dataset.key));
  check("dm:the-thread-goes-quiet-until-more-rounds-are-played", back.indexOf("0:2") < 0,
    back.join(", ") || "inbox empty, cooldown " + DM_COOLDOWN);
  // 대조군. 판이 그만큼 돌면 다시 온다. 안 오면 대화가 한 번으로 끝나는 시스템이다.
  await p.evaluate((n) => {
    const rec = window.__record();
    rec["게이트"] = { saved: n, conceded: 0 };
    window.__gram(false); window.__gram(true);
  }, DM_COOLDOWN + 1);
  await p.waitForTimeout(240);
  const again = await p.evaluate(() => [...document.querySelectorAll("#gram .dmOpen")].map((e) => e.dataset.key));
  check("control:more-rounds-bring-the-next-message", again.indexOf("0:2") >= 0,
    again.join(", ") || "still quiet");

  check("console:no-errors", errs.length === 0, errs.slice(0, 2).join(" | ") || "clean");
  await ctx.close();

  if (notes.length) console.log(notes.map((x) => "  ok   " + x).join(LINE));
  if (fails.length) console.log(fails.map((x) => "  FAIL " + x).join(LINE));
  console.log(fails.length ? "dm FAIL " + fails.length : "dm PASS " + notes.length);
  if (fails.length) process.exitCode = 1;
} finally {
  clearTimeout(t);
  if (b) await b.close();
}
