import { chromium } from "playwright";
import { impactBase, statImpact, statHeld } from "../web/src/state/impact.mjs";
import { GROWABLE } from "../src/ledger.mjs";

// 능력치 몫의 자. 훈련장은 한 칸 올림의 몫을, 내 정보는 지금 값이 1에 비해 버는 몫을 칸마다 적는다.
// 묻는 것은 셋이다. 화면의 수가 같은 키퍼로 노드에서 잰 수와 같은가, 열다섯 칸이 전부 채워지는가,
// 1인 칸의 몫이 0인가. 대조군은 한 칸을 올린 키퍼로 잰 수가 화면과 갈리는지다. 안 갈리면 이 자는 키퍼를 안 본다.
const EXE = process.env.LOCALAPPDATA + "/ms-playwright/chromium-1228/chrome-win64/chrome.exe";
const URL = "http://127.0.0.1:10310/web/index.html?seed=20&preset=rich,veteran";
const t = setTimeout(() => { console.log("WATCHDOG"); process.exit(1); }, 170000);
t.unref();
const fails = [], notes = [];
const check = (n, ok, d) => (ok ? notes : fails).push(n + " " + d);
const fmt = (r) => {
  if (!r) return "";
  const parts = [];
  if (r.save) parts.push("세이브 " + (r.save > 0 ? "+" : "") + r.save.toFixed(1) + "%p");
  if (r.fans) parts.push("팔로워 " + (r.fans > 0 ? "+" : "") + Math.round(r.fans) + "%");
  return parts.length ? parts.join("") : "변화 없음";
};

const b = await chromium.launch({ executablePath: EXE });
try {
  const p = await (await b.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  const errs = [];
  p.on("pageerror", (e) => errs.push(String(e)));
  await p.goto(URL, { waitUntil: "load" });
  await p.click("#go", { force: true });
  await p.waitForTimeout(1300);
  const keeper = await p.evaluate(() => window.__keeperStats());
  const city = await p.evaluate(() => window.__gear().city);
  const read = async (open, box) => {
    await p.evaluate((f) => window[f](true), open);
    await p.waitForFunction((b) => { const f = [...document.querySelectorAll(b + " [data-fx]")]; return f.length && !f.some((e) => e.textContent.includes("…")); }, box, { timeout: 60000 });
    const got = await p.evaluate((b) => Object.fromEntries([...document.querySelectorAll(b + " [data-fx]")].map((e) => [e.dataset.fx, e.textContent])), box);
    await p.evaluate((f) => window[f](false), open);
    return got;
  };
  const gym = await read("__gym", "#gym");
  const me = await read("__me", "#me");
  const base = impactBase(keeper, city);
  const wantGym = {}, wantMe = {};
  for (const s of GROWABLE) {
    // 상한이 없으니 10 이상 칸도 한 칸 올림의 몫을 적는다.
    wantGym[s] = fmt(statImpact(keeper, s, base, city));
    wantMe[s] = fmt(statHeld(keeper, s, base, city));
  }
  const off = (got, want) => GROWABLE.filter((s) => got[s] !== want[s]).map((s) => s + " " + JSON.stringify(got[s]) + " want " + JSON.stringify(want[s]));
  check("statfx:every-growable-stat-has-a-gym-slot", GROWABLE.every((s) => s in gym), Object.keys(gym).length + "/" + GROWABLE.length);
  check("statfx:every-growable-stat-has-a-profile-slot", GROWABLE.every((s) => s in me), Object.keys(me).length + "/" + GROWABLE.length);
  const og = off(gym, wantGym), om = off(me, wantMe);
  check("statfx:gym-figures-match-the-node-measure", og.length === 0, og.slice(0, 3).join(", ") || "15 slots equal");
  check("statfx:profile-figures-match-the-node-measure", om.length === 0, om.slice(0, 3).join(", ") || "15 slots equal");
  // 1인 칸은 버는 것이 없다.
  const one = { ...keeper, focus: 1 };
  check("statfx:a-stat-at-one-holds-nothing", fmt(statHeld(one, "focus", impactBase(one, city), city)) === "변화 없음", "focus at 1");
  // 대조군. 핸들링을 한 칸 올린 키퍼로 재면 화면과 갈려야 한다.
  const shifted = { ...keeper, handling: keeper.handling + 1 };
  const sb = impactBase(shifted, city);
  const diff = GROWABLE.filter((s) => fmt(statHeld(shifted, s, sb, city)) !== wantMe[s]).length;
  check("control:a-keeper-one-point-off-reads-differently", diff > 0, diff + " profile slots differ");
  check("console:no-errors", errs.length === 0, errs.slice(0, 2).join(" | ") || "clean");
} finally {
  await b.close();
}
for (const n of notes) console.log("  ok   " + n);
for (const f of fails) console.log("  FAIL " + f);
console.log(fails.length ? "statfx FAIL " + fails.length : "statfx PASS " + notes.length);
process.exitCode = fails.length ? 1 : 0;
