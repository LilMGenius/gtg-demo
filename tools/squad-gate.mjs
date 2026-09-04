import { chromium } from "playwright";
import { KICKERS, ROLES, ROLE_SLOTS, ELEVEN, defaultEleven, kickerByName } from "../src/roster.mjs";
import { makeRng, buildSet } from "../src/chain.mjs";

// 주전 열하나의 자. 판에 나오는 키커가 명단 일흔일곱에서 매 구 무작위였다.
// 플레이어가 상대를 고를 방법이 없으면 잘 차는 키커를 영입할 이유도 없고, 난도와 보상을
// 스스로 올리는 축이 통째로 없다. 고르는 화면이 서는 것과 그 선택이 판에 닿는 것은 다른 명제다.
//
// 축은 셋이다. 정원이 지켜지는가, 고른 사람만 판에 서는가, 화면에서 세우고 내릴 수 있는가.
// 대조군은 명단 전체다. 아무나 나오는 판과 고른 열하나가 나오는 판이 같은 수를 주면 못 가른다.
// 표본 범위: 키퍼는 안 세운다. 누가 차는가만 재므로 키퍼 능력치가 결론을 안 바꾼다.
// 시드 하나로 이천 구를 돌린다. 열하나 밖의 이름이 한 번이라도 나오면 그 자리에서 빨개진다.
const EXE = process.env.LOCALAPPDATA + "/ms-playwright/chromium-1228/chrome-win64/chrome.exe";
const BASE = "http://127.0.0.1:10310/web/index.html?seed=20&preset=rich";
const LINE = String.fromCharCode(10);
const t = setTimeout(() => { console.log("WATCHDOG"); process.exit(1); }, 180000);
t.unref();

const fails = [], notes = [];
const check = (n, ok, d) => (ok ? notes : fails).push(n + " " + d);

const eleven = defaultEleven();
check("instrument:the-default-eleven-is-a-real-eleven",
  eleven.length === ELEVEN && eleven.every((n) => kickerByName(n)),
  eleven.length + " names, all on the roster");
const perRole = {};
for (const n of eleven) { const k = kickerByName(n); perRole[k.role] = (perRole[k.role] || 0) + 1; }
check("squad:the-default-eleven-fills-every-position-to-its-quota",
  ROLES.every((r) => perRole[r] === ROLE_SLOTS[r]),
  ROLES.map((r) => r + " " + (perRole[r] || 0) + "/" + ROLE_SLOTS[r]).join(", "));
// 시작 열하나가 명단에서 싼 쪽이어야 영입이 살 것을 판다.
const startFame = eleven.reduce((s, n) => s + kickerByName(n).fame, 0) / ELEVEN;
const allFame = KICKERS.reduce((s, k) => s + k.fame, 0) / KICKERS.length;
check("squad:the-starting-eleven-leaves-room-to-buy-better",
  startFame < allFame, "starting fame " + startFame.toFixed(2) + " under roster " + allFame.toFixed(2));

/* 고른 사람만 판에 서는가. 열하나를 넘긴 이름이 한 번이라도 나오면 그 선택은 화면 장식이다.
   대조군으로 명단 전체를 넘긴 판을 같이 돌린다. 거기서는 열하나 밖 이름이 나와야 한다. */
const draw = (pool) => {
  const rng = makeRng(31);
  const seen = new Set();
  for (let i = 0; i < 400; i += 1) for (const s of buildSet(rng, 5, 0, pool)) seen.add(s.kicker.name);
  return seen;
};
const mine = draw(eleven.map(kickerByName));
const anyone = draw(undefined);
check("squad:only-the-eleven-take-the-shots",
  [...mine].every((n) => eleven.includes(n)) && mine.size === ELEVEN,
  mine.size + " distinct kickers over 2000 balls");
check("control:without-a-chosen-eleven-the-whole-roster-shoots",
  anyone.size > ELEVEN, anyone.size + " distinct of " + KICKERS.length);

let b;
try {
  b = await chromium.launch({ executablePath: EXE });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } });
  const p = await ctx.newPage();
  const errs = [];
  p.on("pageerror", (e) => errs.push(String(e)));
  p.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
  await p.goto(BASE, { waitUntil: "load" });
  await p.waitForSelector("#go", { timeout: 15000 });
  await p.click("#go", { force: true });
  await p.waitForTimeout(900);
  await p.evaluate(() => window.__roster(true));
  await p.waitForSelector("#roster .kind", { timeout: 8000 });

  const tabs = await p.evaluate(() => [...document.querySelectorAll("#roster .kind")].map((e) => e.dataset.pos));
  check("squad:the-panel-splits-by-position", tabs.length === 4 && tabs[0] === "gk", tabs.join(", "));

  await p.click('#roster .kind[data-pos="공격수"]');
  await p.waitForTimeout(500);
  const before = await p.evaluate(() => window.__eleven());
  // 카드가 실제로 읽히는가. 이름과 값이 잘려 사라지면 세울 사람을 얼굴로만 골라야 한다.
  const cards = await p.evaluate(() => [...document.querySelectorAll("#roster .row.mine [data-kick]")]
    .map((e) => ({ h: e.offsetHeight, t: e.textContent.trim().length })));
  check("squad:every-starter-card-is-readable",
    cards.length > 0 && cards.every((c) => c.h > 80 && c.t > 3),
    cards.map((c) => c.h + "px/" + c.t).join(", "));

  // 내리기. 정원이 하나 빈다.
  await p.click("#roster .row.mine [data-kick]");
  await p.waitForTimeout(400);
  const dropped = await p.evaluate(() => window.__eleven());
  check("squad:a-starter-can-be-dropped", dropped.length === before.length - 1,
    before.length + " to " + dropped.length);
  /* 다시 세우기. 벤치로 내려간 사람이 그 자리에 돌아온다.
     쉼표로 이은 셀렉터는 둘 중 먼저 나오는 것을 집으므로 방금 내린 카드가 아니라 주전을 또 눌렀다.
     벤치에 선 카드만 집는다. */
  await p.click("#roster .row.mine [data-kick]:not(.here)");
  await p.waitForTimeout(400);
  const back = await p.evaluate(() => window.__eleven());
  check("squad:a-benched-player-can-be-put-back", back.length === before.length,
    dropped.length + " to " + back.length);
  // 정원을 넘겨 세우려 해도 안 선다.
  const over = await p.evaluate(() => {
    const b2 = [...document.querySelectorAll("#roster .row.mine [data-kick]")].find((e) => !e.classList.contains("here"));
    if (b2) b2.click();
    return window.__eleven().length;
  });
  check("squad:the-quota-cannot-be-exceeded", over <= 11, over + " starters");
  check("console:no-errors", errs.length === 0, errs.slice(0, 2).join(" | ") || "clean");
  await ctx.close();
} finally {
  clearTimeout(t);
  if (b) await b.close();
}

if (notes.length) console.log(notes.map((x) => "  ok   " + x).join(LINE));
if (fails.length) console.log(fails.map((x) => "  FAIL " + x).join(LINE));
console.log(fails.length ? "squad FAIL " + fails.length : "squad PASS " + notes.length);
if (fails.length) process.exitCode = 1;
