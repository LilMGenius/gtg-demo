import { chromium } from "playwright";
import { passerCountAt } from "../web/src/state/passer.mjs";

// 동네를 사면 사람이 는다는 것이 화면에서 참인지 잰다. 판정 쪽 행인 풀은 도시마다 늘지만,
// 그것을 그리는 쪽이 안 따라오면 등급을 올려도 같은 운동장이고 값을 낸 이유가 사라진다.
// visible이 켜진 것과 그 사람이 화면 안에 있는 것은 다른 명제라 둘 다 센다.

const EXE = process.env.LOCALAPPDATA + "/ms-playwright/chromium-1228/chrome-win64/chrome.exe";
const BASE = "http://127.0.0.1:10310/web/index.html";
const t = setTimeout(() => { console.log("WATCHDOG"); process.exit(1); }, 90000);
t.unref();

const fails = [], notes = [];
const check = (n, ok, d) => (ok ? notes : fails).push(n + " " + d);
// NDC 한 변이 1이다. 발끝이 살짝 걸친 사람까지 세면 등급 차이가 경계 흔들림에 묻히므로
// 안쪽으로 조금 좁혀 확실히 화면에 있는 사람만 센다.
const IN = 0.98;
const onScreen = (r) => r.on && Math.abs(r.x) < IN && Math.abs(r.y) < IN && r.z < 1;

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
  await p.waitForTimeout(1200);
  await p.click("#go", { force: true });
  await p.waitForTimeout(1400);

  const on = [], seen = [];
  for (let city = 0; city <= 3; city += 1) {
    const rows = await p.evaluate((c) => window.__crowd(c), city);
    await p.waitForTimeout(120);
    const lit = rows.filter((r) => r.on).length;
    const vis = rows.filter(onScreen).length;
    on.push(lit);
    seen.push(vis);
    const want = passerCountAt(city);
    // 그리는 인원은 판정 풀과 같아야 한다. 어긋나면 판정이 지목한 번호가 화면에 없다.
    check("city" + city + ":lit-matches-pool", lit === want, lit + " vs pool " + want);
    check("city" + city + ":someone-on-screen", vis > 0, vis + " on screen");
  }

  // 등급은 값을 낸 만큼 사람을 준다. 같은 수면 그 상품은 아무것도 안 판 것이다.
  const rises = on.every((v, i) => i === 0 || v > on[i - 1]);
  check("lit:strictly-rises", rises, on.join(" -> "));
  check("onscreen:top-beats-base", seen[3] > seen[0], seen.join(" -> "));

  // 0번은 집중력 판정이 지목하는 미인이라 어느 등급에서도 안 숨는다.
  const rows0 = await p.evaluate(() => window.__crowd(0));
  check("beauty:never-hidden", rows0[0].on === true, "city0 index0 on " + rows0[0].on);

  check("console:no-errors", errs.length === 0, errs.slice(0, 3).join(" | ") || "clean");
  const LINE = String.fromCharCode(10);
  if (notes.length) console.log(notes.map((x) => "  ok   " + x).join(LINE));
  if (fails.length) console.log(fails.map((x) => "  FAIL " + x).join(LINE));
  console.log(fails.length ? "crowd FAIL " + fails.length : "crowd PASS");
  if (fails.length) process.exitCode = 1;
} finally {
  clearTimeout(t);
  if (b) await b.close();
}
