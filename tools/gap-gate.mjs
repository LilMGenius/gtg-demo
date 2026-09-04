import { chromium } from "playwright";

// 조작끼리 붙어 있는지 재는 자.
// 소리 버튼과 상점 버튼이 1.1px 떨어져 있어 검은 판 하나로 읽혔고, 육수와 캐시는 4px 간격에
// 가르는 선도 없어 한 줄의 숫자 띠가 됐다. 두 조작이 붙어 보이면 그것은 한 조작이다.
//
// 문턱은 지어내지 않고 --lift를 그대로 읽는다. 모든 조작이 그 길이만큼 그림자를 오른아래로
// 던지므로, 그보다 가까운 둘은 한쪽 그림자가 다른 쪽 위에 앉는다. 값은 런타임에서 읽어
// 토큰이 바뀌면 문턱도 같이 움직이게 한다.
//
// 칩 안의 값은 붙어 있어도 사이에 선이 그어져 있으면 갈린 것이다. 팔로워와 지갑이 그렇게 서 있고,
// 상자 간격만 재면 그 설계를 결함으로 읽는다. 간격이거나 선이거나 둘 중 하나면 통과다.
const EXE = process.env.LOCALAPPDATA + "/ms-playwright/chromium-1228/chrome-win64/chrome.exe";
const BASE = "http://127.0.0.1:10310/web/index.html?seed=20&preset=rich";
const LINE = String.fromCharCode(10);
const t = setTimeout(() => { console.log("WATCHDOG"); process.exit(1); }, 120000);
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
  await p.goto(BASE, { waitUntil: "load" });
  await p.waitForSelector("#go", { timeout: 15000 });
  await p.click("#go", { force: true });
  await p.waitForTimeout(1300);

  const scan = await p.evaluate(() => { const lift = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--lift")) || 0; const box = (e) => { const r = e.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }; }; const dist = (a, c) => { const dx = Math.max(0, Math.max(a.l - c.r, c.l - a.r)); const dy = Math.max(0, Math.max(a.t - c.b, c.t - a.b)); if (dx === 0 && dy === 0) return 0; if (dx === 0) return dy; if (dy === 0) return dx; return Math.hypot(dx, dy); }; const ruled = (e) => parseFloat(getComputedStyle(e).borderLeftWidth) > 0 || parseFloat(getComputedStyle(e).borderRightWidth) > 0; const pick = (sel) => [...document.querySelectorAll(sel)].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 1 && r.height > 1; }); const solo = pick("#hud > button"); const chip = pick("#top > *").concat(pick("#purse .cur")); const bad = []; const seen = []; for (let i = 0; i < solo.length; i++) for (let j = i + 1; j < solo.length; j++) { const g = dist(box(solo[i]), box(solo[j])); seen.push(g); if (g < lift) bad.push((solo[i].id || "?") + " and " + (solo[j].id || "?") + " " + g.toFixed(1)); } const fused = []; for (let i = 0; i < chip.length; i++) for (let j = i + 1; j < chip.length; j++) { const a = chip[i], c = chip[j]; if (a.contains(c) || c.contains(a)) continue; const g = dist(box(a), box(c)); if (g >= lift) continue; if (ruled(a) || ruled(c)) continue; fused.push((a.id || a.className || "?") + " and " + (c.id || c.className || "?") + " " + g.toFixed(1)); } return { lift, bad, fused, solo: solo.length, chip: chip.length, minSolo: seen.length ? Math.min.apply(null, seen) : -1 }; });
  check("instrument:the-bar-came-from-the-token", scan.lift > 0, String(scan.lift) + "px");
  check("instrument:both-sets-had-members", scan.solo > 1 && scan.chip > 1, scan.solo + " standalone, " + scan.chip + " in the chip");
  check("gap:no-two-controls-share-a-shadow", scan.bad.length === 0, scan.bad.join(", ") || "closest pair " + scan.minSolo.toFixed(1) + "px");
  check("gap:every-value-in-the-chip-is-parted-by-space-or-a-rule", scan.fused.length === 0, scan.fused.join(", ") || "all parted");

  // 심어서 증명한다. 소리 버튼 바로 옆에 조작 하나를 붙여 두면 이 자가 잡아야 한다.
  await p.evaluate(() => { const m = document.getElementById("mute").getBoundingClientRect(); const q = document.createElement("button"); q.id = "plantProbe"; q.style.cssText = "position:absolute;left:" + m.left + "px;top:" + (m.bottom + 1) + "px;width:40px;height:30px"; document.getElementById("hud").appendChild(q); });
  await p.waitForTimeout(120);
  const after = await p.evaluate(() => { const lift = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--lift")) || 0; const es = [...document.querySelectorAll("#hud > button")].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 1 && r.height > 1; }); let worst = 1e9; for (let i = 0; i < es.length; i++) for (let j = i + 1; j < es.length; j++) { const a = es[i].getBoundingClientRect(), c = es[j].getBoundingClientRect(); const dx = Math.max(0, Math.max(a.left - c.right, c.left - a.right)); const dy = Math.max(0, Math.max(a.top - c.bottom, c.top - a.bottom)); const g = (dx === 0 && dy === 0) ? 0 : (dx === 0 ? dy : (dy === 0 ? dx : Math.hypot(dx, dy))); worst = Math.min(worst, g); } return { worst, lift }; });
  await p.evaluate(() => { const q = document.getElementById("plantProbe"); if (q) q.remove(); });
  check("instrument:a-planted-neighbour-is-caught", after.worst < after.lift, "planted pair " + after.worst.toFixed(1) + "px under " + after.lift + "px");
  check("console:no-errors", errs.length === 0, errs.slice(0, 2).join(" | ") || "clean");
  await ctx.close();

  if (notes.length) console.log(notes.map((x) => "  ok   " + x).join(LINE));
  if (fails.length) console.log(fails.map((x) => "  FAIL " + x).join(LINE));
  console.log(fails.length ? "gap FAIL " + fails.length : "gap PASS " + notes.length);
  if (fails.length) process.exitCode = 1;
} finally {
  clearTimeout(t);
  if (b) await b.close();
}
