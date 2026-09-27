import { chromium } from "playwright";
import { clearDraw } from "./draw.mjs";

// 손가락 바닥의 자. 짧은 화면에서 누르는 것마다 가운데를 맞춘 44px 칸의 네 귀와 가운데를 찍어 그것이 돌아오는지 본다.
// 상자 크기만 재면 보이는 모양을 안 키우고 누르는 칸만 키운 조작을 작다고 잘못 읽고, 반대로 옆 조작이 덮은 자리를 못 본다.
// 실측 740x360에서 레벨 칩 39x25, 컨디션 24x24, 팔로워 28x20, 확률 26x22, 위키 링크 26x18, 오른쪽 메뉴 66x40이 바닥 아래였다.
// 대조군은 누르는 칸을 걷어 낸 화면이다.
const EXE = process.env.LOCALAPPDATA + "/ms-playwright/chromium-1228/chrome-win64/chrome.exe";
const BASE = "http://127.0.0.1:10310/web/index.html?seed=20&preset=rich,veteran";
const FLOOR = 44;
const t = setTimeout(() => { console.log("WATCHDOG"); process.exit(1); }, 240000); t.unref();
const fails = [], notes = [];
const check = (n, ok, d) => (ok ? notes : fails).push(n + " " + d);
// 창 밖(경기 화면)에서 누르는 것과 창 안에서 누르는 것. 창은 열고 재고 닫는다.
const SPOTS = [
  { at: "hud", open: null, sel: ["#lv", "#form", "#gymBtn", "#rosterBtn", "#gramBtn", "#shopBtn", "#wikiBtn", "#mute", "#fullscreen"] },
  { at: "gram", open: "gram", sel: ["#gramFollowers"] },
  { at: "shop", open: "shop", tab: "pull", sel: ["#shop .odds-link"] },
  { at: "wiki", open: "wiki", sel: ["#wiki .body a"] }
];
const probe = (sels) => sels.flatMap((sel) => [...document.querySelectorAll(sel)].filter((e) => e.getClientRects().length && getComputedStyle(e).visibility !== "hidden").slice(0, 3).map((e) => {
  e.scrollIntoView({ block: "center", inline: "center" });
  const r = e.getBoundingClientRect();
  const cx = r.left + r.width / 2, cy = r.top + r.height / 2, h = 44 / 2 - 1;
  const pts = [[cx, cy], [cx - h, cy - h], [cx + h, cy - h], [cx - h, cy + h], [cx + h, cy + h]];
  const miss = pts.filter(([x, y]) => { const t = document.elementFromPoint(x, y); return !t || !(t === e || e.contains(t)); }).length;
  return { sel, box: Math.round(r.width) + "x" + Math.round(r.height), miss };
}));
const measure = async (p) => {
  const out = [];
  for (const s of SPOTS) {
    if (s.open) await p.evaluate((id) => window["__" + id](true), s.open);
    if (s.tab) await p.evaluate((k) => document.querySelector('#shop .tab[data-tab="' + k + '"]')?.click(), s.tab);
    await p.waitForTimeout(300);
    out.push(...(await p.evaluate(probe, s.sel)).map((r) => Object.assign({ at: s.at }, r)));
    if (s.open) await p.evaluate((id) => window["__" + id](false), s.open);
    await p.waitForTimeout(150);
  }
  return out;
};
const b = await chromium.launch({ executablePath: EXE });
try {
  for (const [W, H] of [[844, 390], [740, 360]]) {
    const p = await b.newPage({ viewport: { width: W, height: H } });
    await p.goto(BASE); await p.locator("#go").click({ force: true }); await clearDraw(p);
    const rows = await measure(p);
    const seen = new Set(rows.map((r) => r.sel));
    const lost = SPOTS.flatMap((s) => s.sel).filter((s) => !seen.has(s));
    check(W + "x" + H + ":instrument:every-target-was-found", lost.length === 0, lost.join(", ") || seen.size + " selectors");
    const bad = rows.filter((r) => r.miss > 0);
    check(W + "x" + H + ":touch:every-target-answers-a-44px-finger", rows.length > 0 && bad.length === 0,
      bad.map((r) => r.at + " " + r.sel + " " + r.box + " misses " + r.miss + "/5").join(", ") || rows.length + " targets");
    if (W === 740) {
      await p.addStyleTag({ content: "*::after{content:none!important}" });
      const planted = (await measure(p)).filter((r) => r.miss > 0);
      check(W + "x" + H + ":control:targets-without-their-hit-cell-are-caught", planted.length > 0, planted.length + " caught");
    }
    await p.close();
  }
} catch (e) { check("instrument:run-completed", false, String(e).slice(0, 300)); }
await b.close();
if (notes.length) console.log(notes.map((x) => "  ok   " + x).join(String.fromCharCode(10)));
if (fails.length) console.log(fails.map((x) => "  FAIL " + x).join(String.fromCharCode(10)));
console.log(fails.length ? "touch FAIL " + fails.length : "touch PASS " + notes.length);
process.exit(fails.length ? 1 : 0);
