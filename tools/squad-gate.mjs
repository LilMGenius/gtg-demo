import { chromium } from "playwright";
import { KICKERS, ROLES, ROLE_SLOTS, FIELD, defaultEleven, kickerByName } from "../src/roster.mjs";
import { TEAM_RULE } from "../src/reality.mjs";
import { makeRng, buildSet } from "../src/chain.mjs";

// 필드 열 명의 자. 판에 나오는 키커가 명단 일흔일곱에서 매 구 무작위였다.
// 플레이어가 상대를 고를 방법이 없으면 잘 차는 키커를 영입할 이유도 없고, 난도와 보상을
// 스스로 올리는 축이 통째로 없다. 고르는 화면이 서는 것과 그 선택이 판에 닿는 것은 다른 명제다.
//
// 축은 셋이다. 정원이 지켜지는가, 고른 사람만 판에 서는가, 화면에서 세우고 내릴 수 있는가.
// 대조군은 명단 전체다. 아무나 나오는 판과 고른 필드 열 명이 나오는 판이 같은 수를 주면 못 가른다.
// 표본 범위: 키퍼는 안 세운다. 누가 차는가만 재므로 키퍼 능력치가 결론을 안 바꾼다.
// 시드 하나로 이천 구를 돌린다. 필드 열 명 밖의 이름이 한 번이라도 나오면 그 자리에서 빨개진다.
const EXE = process.env.LOCALAPPDATA + "/ms-playwright/chromium-1228/chrome-win64/chrome.exe";
const BASE = "http://127.0.0.1:10310/web/index.html?seed=20&preset=rich,veteran";
const LINE = String.fromCharCode(10);
const t = setTimeout(() => { console.log("WATCHDOG"); process.exit(1); }, 180000);
t.unref();

const fails = [], notes = [];
const check = (n, ok, d) => (ok ? notes : fails).push(n + " " + d);

const eleven = defaultEleven();
const rule = TEAM_RULE.values;
const roleOfName = Object.fromEntries(KICKERS.map((k) => [k.name, k.role]));
const legal = (slots) => rule.goalkeepers + Object.values(slots).reduce((a, b) => a + b) === rule.maximum;
check("squad:formation-obeys-law-3.1", legal(ROLE_SLOTS), TEAM_RULE.source.clause);
// 잘못된 4-4-3은 골키퍼를 더하면 IFAB 최대 인원을 넘는다.
check("control:4-4-3-plus-keeper-is-rejected", !legal({ 수비수: 4, 미드필더: 4, 공격수: 3 }), "4-4-3 rejected");
check("instrument:the-default-eleven-is-a-real-eleven",
  eleven.length === rule.maximum - rule.goalkeepers && eleven.every((n) => kickerByName(n)),
  eleven.length + " names, all on the roster");
const perRole = {};
for (const n of eleven) { const k = kickerByName(n); perRole[k.role] = (perRole[k.role] || 0) + 1; }
check("squad:the-default-eleven-fills-every-position-to-its-quota",
  ROLES.every((r) => perRole[r] === ROLE_SLOTS[r]),
  ROLES.map((r) => r + " " + (perRole[r] || 0) + "/" + ROLE_SLOTS[r]).join(", "));
// 시작 필드 열 명이 명단에서 싼 쪽이어야 영입이 살 것을 판다.
const startFame = eleven.reduce((s, n) => s + kickerByName(n).fame, 0) / FIELD;
const allFame = KICKERS.reduce((s, k) => s + k.fame, 0) / KICKERS.length;
check("squad:the-starting-eleven-leaves-room-to-buy-better",
  startFame < allFame, "starting fame " + startFame.toFixed(2) + " under roster " + allFame.toFixed(2));

/* 고른 사람만 판에 서는가. 필드 열 명을 넘긴 이름이 한 번이라도 나오면 그 선택은 화면 장식이다.
   대조군으로 명단 전체를 넘긴 판을 같이 돌린다. 거기서는 필드 열 명 밖 이름이 나와야 한다. */
const draw = (pool) => {
  const rng = makeRng(31);
  const seen = new Set();
  for (let i = 0; i < 400; i += 1) for (const s of buildSet(rng, 5, 0, pool)) seen.add(s.kicker.name);
  return seen;
};
const mine = draw(eleven.map(kickerByName));
const anyone = draw(undefined);
check("squad:only-the-eleven-take-the-shots",
  [...mine].every((n) => eleven.includes(n)) && mine.size === rule.maximum - rule.goalkeepers,
  mine.size + " distinct kickers over 2000 balls");
check("control:without-a-chosen-eleven-the-whole-roster-shoots",
  anyone.size > FIELD, anyone.size + " distinct of " + KICKERS.length);

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
  const keepers = await p.locator('#roster .row.mine [data-at].here').count();
  check("squad:one-goalkeeper-starts", keepers === rule.goalkeepers, keepers + " goalkeeper");

  const tabs = await p.evaluate(() => [...document.querySelectorAll("#roster .kind")].map((e) => e.dataset.pos));
  check("squad:the-panel-splits-by-position", tabs.length === 4 && tabs[0] === "gk", tabs.join(", "));


  // 창 머리. 창 이름이 탭 줄 위 머리 띠에 서고, 재화 띠와 닫기와 안 겹친다.
  const head = await p.evaluate(() => {
    const r = (s) => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return { l: b.left, r: b.right, t: b.top, b: b.bottom }; };
    return { title: r("#roster > .ptitle"), tabs: r("#roster > .kinds"), strip: r("#top"), close: r("#roster > .close"), text: document.querySelector("#roster > .ptitle")?.textContent };
  });
  const apart = (a, c) => !a || !c || a.r <= c.l || c.r <= a.l || a.b <= c.t || c.b <= a.t;
  check("squad:the-panel-name-stands-above-the-tabs", head.title && head.text === "선수단" && head.title.b <= head.tabs.t,
    head.title ? "title bottom " + Math.round(head.title.b) + " tabs top " + Math.round(head.tabs.t) : "no title");
  check("squad:the-panel-name-clears-the-strip-and-close", apart(head.title, head.strip) && apart(head.title, head.close), JSON.stringify(head.title));
  // 탭마다 그 자리의 보유 수를 전체 풀과 함께 단다.
  const counts = await p.evaluate(() => [...document.querySelectorAll("#roster .kind small")].map((e) => e.textContent));
  const want = ["gk"].concat(ROLES).map((id) => id === "gk" ? null : KICKERS.filter((k) => k.role === id).length);
  check("squad:every-position-tab-shows-owned-over-pool", counts.length === 4 && counts.every((c, i) => /^보유 \d+\/\d+$/.test(c) && (want[i] === null || Number(c.split("/")[1]) === want[i])), counts.join(", "));
  // 상태 글자와 중복 머리가 없다. 밝은 카드와 판의 점이 그 말을 한다.
  const WORDS = /선발|해제|출전|교체|가진 사람|주전 \d/;
  const words = async () => p.evaluate((src) => { const re = new RegExp(src); return [...document.querySelectorAll("#roster *")].filter((e) => !e.children.length && re.test(e.textContent)).map((e) => e.textContent.trim()); }, WORDS.source);
  const said = await words();
  check("squad:no-status-words-or-owner-heading", said.length === 0, said.join(", ") || "none");
  await p.evaluate(() => document.querySelector("#roster .row.mine button")?.insertAdjacentHTML("beforeend", "<i class=tag>선발</i>"));
  check("control:a-planted-status-word-is-caught", (await words()).length > 0, "planted tag");
  await p.click('#roster .kind[data-pos="공격수"]');
  await p.waitForTimeout(300);
  // 포메이션 판. 선발 열하나가 포지션 색 점으로 선다.
  const board = async () => p.evaluate(() => {
    const dots = [...document.querySelectorAll("#roster .pitch .dot")].map((d) => d.className.replace("dot pos-", ""));
    const lines = [...document.querySelectorAll("#roster .pitch .line")].map((l) => [...l.querySelectorAll(".dot")].map((d) => d.className.replace("dot pos-", "")));
    return { dots, lines };
  });
  const roleCls = { 수비수: "df", 미드필더: "mf", 공격수: "fw" };
  const b0 = await board();
  const e0 = await p.evaluate(() => window.__eleven());
  const want0 = ["gk"].concat(e0.map((n) => roleCls[roleOfName[n]])).sort();
  check("squad:the-board-shows-the-eleven-in-position-colours", JSON.stringify(b0.dots.slice().sort()) === JSON.stringify(want0) && b0.dots.length === rule.maximum,
    b0.dots.length + " dots " + b0.lines.map((l) => l.join("")).join("|"));
  await p.evaluate(() => document.querySelector("#roster .pitch .dot")?.remove());
  check("control:a-missing-dot-is-caught", (await board()).dots.length !== rule.maximum, "planted removal");

  await p.evaluate(() => { window.__roster(false); window.__roster(true); });
  await p.waitForTimeout(300);
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
  check("squad:the-quota-cannot-be-exceeded", over + rule.goalkeepers <= rule.maximum, over + " field starters");
  // 자리별 정원이 없다. 공격수 셋을 내리고 수비수 셋을 더 세우면 수비가 일곱이고 판은 파랑 두 줄이다.
  const free = await p.evaluate(async () => {
    const wait = () => new Promise((r) => setTimeout(r, 120));
    const tab = async (pos) => { document.querySelector('#roster .kind[data-pos="' + pos + '"]').click(); await wait(); };
    await tab("공격수");
    for (let i = 0; i < 3; i += 1) { document.querySelector("#roster .row.mine [data-kick].here")?.click(); await wait(); }
    await tab("수비수");
    for (let i = 0; i < 3; i += 1) { document.querySelector("#roster .row.hire [data-buy]:not([disabled])")?.click(); await wait(); }
    for (let i = 0; i < 3; i += 1) { document.querySelector('#roster .row.mine [data-kick][aria-pressed="false"]:not(.full)')?.click(); await wait(); }
    const lines = [...document.querySelectorAll("#roster .pitch .line")].map((l) => [...l.querySelectorAll(".dot")].map((d) => d.className.replace("dot pos-", "")).join(","));
    return { n: window.__eleven().length, lines };
  });
  const blue = free.lines.filter((l) => l.split(",").every((c) => c === "df"));
  check("squad:the-formation-is-free-and-the-board-wraps-lines", free.n === rule.maximum - rule.goalkeepers && blue.length === 2 && blue.join(",").split(",").length === 7,
    free.n + " field, lines " + free.lines.join(" | "));

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
