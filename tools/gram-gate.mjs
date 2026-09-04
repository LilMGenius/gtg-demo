import { chromium } from "playwright";

// 아웃문그램과 키커별 상대 전적은 화면에 선 지 오래인데 재는 자가 없었다.
// 두 창 다 장부를 옮겨 그리는 창이라, 옮기는 도중에 어긋나면 화면만 조용히 거짓말을 한다.
// 그래서 묻는 것은 창이 열리는가가 아니라 창이 말한 수가 장부의 수와 같은가이다.

const EXE = process.env.LOCALAPPDATA + "/ms-playwright/chromium-1228/chrome-win64/chrome.exe";
// 신규 키퍼로 돌리면 다섯 판이 전부 실점이라 먹힌 글의 표시가 갈리는지를 못 묻는다.
// 만렙으로 돌려 선방과 실점이 둘 다 나오게 하고, 둘 다 나왔는지를 축으로 말한다.
const BASE = "http://127.0.0.1:10310/web/index.html?seed=20&preset=maxed";
const LINE = String.fromCharCode(10);
// 판을 도는 창은 프레임으로 센다. 잠으로 세면 기계가 바쁜 날 구가 덜 돌아 표본이 빈다.
const STEP = 1 / 60;
const ROUND_FRAMES = 60 * 60;
const t = setTimeout(() => { console.log("WATCHDOG"); process.exit(1); }, 240000);
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

  // 대조군. 한 구도 안 돈 자리에서 피드는 비어 있어야 하고, 빈 이유를 자기 글자로 말해야 한다.
  await p.evaluate(() => window.__gram(true));
  await p.waitForTimeout(300);
  const empty = await p.evaluate(() => {
    const box = document.getElementById("gram");
    const posts = [...box.querySelectorAll(".post")];
    return { count: posts.length, empty: posts.filter((x) => x.classList.contains("empty")).length, says: (posts[0] ? posts[0].textContent : "").trim().length };
  });
  check("control:a-fresh-save-shows-the-empty-feed", empty.empty === 1 && empty.says > 0, "posts " + empty.count + " empty " + empty.empty + " chars " + empty.says);
  await p.evaluate(() => window.__gram(false));
  /* 창이 열려 있는 동안 조작 기둥은 화면 밖으로 물러난다. 닫자마자 누르면 그 버튼은 아직 밖이고,
     클릭이 뷰포트 밖이라 조용히 시간만 끌다 죽는다. 기둥이 돌아온 것을 보고 누른다. */
  await p.waitForFunction(() => document.getElementById('auto').getBoundingClientRect().left >= 0, null, { timeout: 5000 });

  // 판을 돈다. 손으로 치면 결과가 한쪽으로 쏠리므로 자동으로 두고, 크레딧을 먼저 채운다.
  await p.evaluate(() => { const bot = window.__bot(); bot.tier = 3; bot.ms = 3600000; });
  await p.click("#auto", { force: true });
  const from = await p.evaluate(() => window.__frames());
  await p.waitForFunction((n) => window.__frames() >= n, from + ROUND_FRAMES, { timeout: 90000 });

  // 읽는 동안에도 판은 계속 돌아서, 장부를 먼저 읽고 피드를 나중에 읽으면 한 판이 어긋난다.
  // 실측으로 장부는 일곱이고 피드는 여섯이었다. 읽기 전에 세계를 멈춘다.
  await p.evaluate(() => window.__plan(0, null, window.__frames()));
  await p.waitForTimeout(120);
  const ledger = await p.evaluate(() => window.__record());
  const names = Object.keys(ledger);
  const saved = names.reduce((a, n) => a + ledger[n].saved, 0);
  const conceded = names.reduce((a, n) => a + ledger[n].conceded, 0);
  console.log("  ledger " + names.length + " kickers, saved " + saved + " conceded " + conceded);
  check("control:the-window-actually-played", saved + conceded >= 3, saved + conceded + " rounds landed");
  check("instrument:both-outcomes-occurred", saved > 0 && conceded > 0, "saved " + saved + " conceded " + conceded);

  await p.evaluate(() => window.__gram(true));
  await p.waitForTimeout(320);
  const feed = await p.evaluate(() => {
    const box = document.getElementById("gram");
    return [...box.querySelectorAll(".post")].map((x) => ({
      bad: x.classList.contains("bad"),
      empty: x.classList.contains("empty"),
      name: (x.querySelector("b") ? x.querySelector("b").textContent : "").trim(),
      text: x.textContent.trim()
    }));
  });
  await p.evaluate(() => window.__gram(false));
  for (const f of feed.slice(0, 4)) console.log("  post " + (f.bad ? "bad " : "ok  ") + f.name + " | " + f.text.slice(0, 44));

  check("gram:rounds-leave-posts", feed.length > 0 && feed.every((f) => !f.empty), feed.length + " posts");
  const unknown = feed.filter((f) => !f.name || names.indexOf(f.name) < 0);
  check("gram:every-post-names-a-kicker-in-the-ledger", unknown.length === 0, unknown.map((f) => f.name || "(none)").join(",") || names.length + " kickers seen");
  // 장부는 판정이 나는 순간 오르고 글은 연출이 끝나야 올라간다. 그래서 어느 순간에 재도
  // 글이 장부보다 최대 한 판 뒤에 있다. 실측으로 장부 일곱에 글 여섯이었고 그것은 결함이 아니라
  // 두 수가 서로 다른 순간의 것이라는 뜻이다. 차이를 한 판까지 허용하고, 대신 이름별로 정확히 맞춘다.
  const inFlight = saved + conceded - feed.length;
  check("gram:a-post-per-round-with-one-in-flight", inFlight >= 0 && inFlight <= 1, feed.length + " posts, " + (saved + conceded) + " decided, " + inFlight + " still playing");
  // 이름별로는 글이 장부를 넘을 수 없다. 넘으면 없는 판의 글이 있다는 뜻이다.
  const over = names.filter((n) => feed.filter((f) => f.name === n).length > ledger[n].saved + ledger[n].conceded);
  check("gram:no-name-has-more-posts-than-rounds", over.length === 0, over.join(",") || names.length + " names within their counts");
  // 먹힌 글은 표시가 달라야 한다. 같은 모양이면 피드가 성적을 말하지 않는다.
  const badOver = names.filter((n) => feed.filter((f) => f.name === n && f.bad).length > ledger[n].conceded);
  check("gram:conceded-posts-are-marked", badOver.length === 0 && feed.filter((f) => f.bad).length >= conceded - 1, feed.filter((f) => f.bad).length + " marked vs " + conceded + " conceded");

  // 상대 전적은 내 정보 창이 그린다. 장부와 화면이 같은 수를 말하는지가 이 창의 전부다.
  await p.evaluate(() => window.__me(true));
  // 그 창은 이제 칸 셋으로 갈렸고 전적은 제 칸에 있다. 열지 않고 세면 0줄이 나오는데,
  // 그 0은 화면이 장부를 안 옮겼다는 뜻이 아니라 이 자가 다른 칸을 보고 있다는 뜻이다.
  await p.click('#me .tab[data-tab="log"]', { force: true });
  await p.waitForTimeout(320);
  const rows = await p.evaluate(() => {
    const box = document.getElementById("me");
    const out = [];
    for (const s of box.querySelectorAll("span")) {
      const b = s.querySelector("b");
      if (!b) continue;
      const em = b.querySelector("em");
      if (!em) continue;
      const name = s.childNodes[0] ? String(s.childNodes[0].textContent).trim() : "";
      const nums = b.textContent.trim();
      out.push({ name, nums });
    }
    return out;
  });
  await p.evaluate(() => window.__me(false));
  for (const r of rows.slice(0, 4)) console.log("  row " + r.name + " " + r.nums);

  check("record:every-faced-kicker-has-a-row", rows.length === names.length, rows.length + " rows vs " + names.length + " kickers");
  const wrong = rows.filter((r) => {
    const led = ledger[r.name];
    if (!led) return true;
    return r.nums !== led.saved + "-" + led.conceded;
  });
  check("record:the-screen-matches-the-ledger", wrong.length === 0, wrong.map((r) => r.name + " " + r.nums).join(", ") || rows.length + " rows agree");

  check("console:no-errors", errs.length === 0, errs.slice(0, 3).join(" | ") || "clean");
  if (notes.length) console.log(notes.map((x) => "  ok   " + x).join(LINE));
  if (fails.length) console.log(fails.map((x) => "  FAIL " + x).join(LINE));
  console.log(fails.length ? "gram FAIL " + fails.length : "gram PASS");
  if (fails.length) process.exitCode = 1;
} finally {
  clearTimeout(t);
  if (b) await b.close();
}
