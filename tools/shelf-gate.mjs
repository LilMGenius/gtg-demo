import { chromium } from "playwright";
import { GLOVES, BOOTS, KITS, SOCKS, GOALS, CITIES, HAIRS, TATTOOS } from "../web/src/state/gear.mjs";
import { BOTS } from "../web/src/state/bot.mjs";
import { BUFFS } from "../web/src/state/buff.mjs";

// 빈 탭은 만들지 않는다는 확정 설계를 재는 자가 없었다. 탭은 열한 개인데
// 어느 하나가 조용히 비어도 상점은 열리고 게이트는 초록이었다.
// 행 수를 코드에서 뽑아 화면과 맞대므로 등급을 늘리면 이 게이트가 먼저 빨개진다.

const EXE = process.env.LOCALAPPDATA + "/ms-playwright/chromium-1228/chrome-win64/chrome.exe";
const BASE = "http://127.0.0.1:10310/web/index.html?preset=rich";
const t = setTimeout(() => { console.log("WATCHDOG"); process.exit(1); }, 90000);
t.unref();

// 탭마다 몇 줄이 서야 하는지는 그 선반의 데이터가 정한다. 화면에 적힌 수를 옮겨 적으면
// 데이터가 늘어난 날 문서와 화면이 같이 틀리고 아무도 모른다.
const WANT = {
  pull: 1,
  glove: GLOVES.length, boot: BOOTS.length, kit: KITS.length, sock: SOCKS.length,
  frame: GOALS.length, city: CITIES.length, hair: HAIRS.length, ink: TATTOOS.length,
  bot: BOTS.length, buff: BUFFS.length
};

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
  await p.goto(BASE, { waitUntil: "load" });
  await p.waitForTimeout(1200);
  await p.click("#go", { force: true });
  await p.waitForTimeout(1400);
  await p.evaluate(() => window.__shop(true));
  await p.waitForTimeout(400);

  const ids = await p.$$eval(".tab", (ns) => ns.map((n) => n.dataset.tab));
  const labels = await p.$$eval(".tab", (ns) => ns.map((n) => n.textContent.trim()));
  const want = Object.keys(WANT);
  check("tabs:count-matches-shelves", ids.length === want.length, ids.length + " vs " + want.length);
  check("tabs:no-unknown-id", ids.every((id) => want.includes(id)), ids.join(","));
  check("tabs:labels-unique", new Set(labels).size === labels.length, labels.join(","));

  for (const id of ids) {
    await p.click('.tab[data-tab="' + id + '"]');
    await p.waitForTimeout(140);
    const seen = await p.evaluate(() => {
      const s = document.getElementById("shop");
      // 카드는 이제 .rack 안에 산다. 직계 자식만 세면 격자로 옮긴 날 전부 0이 되고,
      // 그 0은 선반이 비었다는 뜻으로 읽힌다. 상점 안의 카드를 깊이와 무관하게 센다.
      const rows = s.querySelectorAll(".card").length;
      const head = s.querySelector("h4");
      return { rows, head: head ? head.textContent.trim().length : 0, marked: s.querySelectorAll('.tab[aria-current="true"]').length };
    });
    // 빈 탭 금지. 한 줄도 없는 탭은 상점이 파는 것이 없다는 뜻이다.
    check("tab:" + id + ":rows", seen.rows === WANT[id], seen.rows + " want " + WANT[id]);
    check("tab:" + id + ":has-head", seen.head > 0, "head chars " + seen.head);
    // 지금 어디에 서 있는지가 화면에 표시돼야 탭 사이를 오갈 수 있다.
    check("tab:" + id + ":one-current", seen.marked === 1, "current " + seen.marked);
  }

  check("console:no-errors", errs.length === 0, errs.slice(0, 3).join(" | ") || "clean");
  const LINE = String.fromCharCode(10);
  if (notes.length) console.log(notes.map((x) => "  ok   " + x).join(LINE));
  if (fails.length) console.log(fails.map((x) => "  FAIL " + x).join(LINE));
  console.log(fails.length ? "shelf FAIL " + fails.length : "shelf PASS");
  if (fails.length) process.exitCode = 1;
} finally {
  clearTimeout(t);
  if (b) await b.close();
}
