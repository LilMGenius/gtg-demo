import { chromium } from "playwright";

// 꼬리가 옮긴 키퍼가 걸어서 돌아오는지 재는 자.
//
// 나가는 걸음은 애니메이션이었고 돌아오는 걸음은 없었다. 그를 제자리로 되돌리는 것이 리셋이었고,
// 리셋은 한 프레임에 좌표를 바꾸므로 화면에서는 순간이동이었다. 실측 2.51미터다.
//
// 재는 것은 셋이다. 꼬리가 끝나기 전에 집에 도착하는가, 꼬리가 끝나는 자리에서 좌표가 튀지 않는가,
// 그리고 사건이 벌어지는 동안에는 집을 비우는가.
// 마지막이 대조군이다. 늘 집에 있으면 앞의 둘은 아무것도 증명하지 않는다.
const EXE = process.env.LOCALAPPDATA + "/ms-playwright/chromium-1228/chrome-win64/chrome.exe";
const BASE = "http://127.0.0.1:10310/web/index.html?seed=20";
const LINE = String.fromCharCode(10);
// 돌아오는 걸음은 4.6초에 시작해 1.4초를 쓴다. 그 뒤로는 집에 서 있어야 한다.
const HOME_BY = 6.2;
// 0.25m. 골문 반폭 2.2의 약 십분의 일이라 사람 눈에는 제자리로 읽히는 폭이다.
const NEAR = 0.25;
const KEEPER_Z = 0.9;
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
  await p.goto(BASE, { waitUntil: "load" });
  await p.waitForSelector("#go", { timeout: 15000 });
  await p.click("#go", { force: true });
  await p.waitForTimeout(900);

  const rows = [];
  for (let i = 0; i < 320; i += 1) {
    await p.waitForTimeout(120);
    rows.push(await p.evaluate(() => {
      const k = window.__keeperPos();
      return { kind: window.__tailKind(), age: window.__tailAge(), x: k.x, z: k.z };
    }));
  }

  const away = (r) => Math.hypot(r.x, r.z - KEEPER_Z);
  const seen = [...new Set(rows.filter((r) => r.kind).map((r) => r.kind))];
  check("instrument:some-tail-was-caught", seen.length > 0, seen.join(", ") + " over " + rows.length + " samples");

  // 꼬리가 끝나기 전에 집에 도착했는가. 나이가 충분히 든 표본만 본다.
  const late = rows.filter((r) => r.kind && r.age >= HOME_BY);
  const stray = late.filter((r) => away(r) > NEAR);
  check("homing:a-tail-that-moved-him-brings-him-back", late.length > 0 && stray.length === 0,
    stray.length ? stray.slice(0, 3).map((r) => r.kind + " age " + r.age.toFixed(1) + " " + away(r).toFixed(2) + "m").join(", ")
      : late.length + " late samples all within " + NEAR + "m");

  // 꼬리가 끝나는 자리에서 좌표가 튀는가. 그 경계가 예전 순간이동이 나오던 자리다.
  const jumps = [];
  for (let i = 1; i < rows.length; i += 1) {
    if (rows[i - 1].kind && !rows[i].kind) {
      const d = Math.hypot(rows[i].x - rows[i - 1].x, rows[i].z - rows[i - 1].z);
      if (d > NEAR) jumps.push(rows[i - 1].kind + " " + d.toFixed(2) + "m");
    }
  }
  check("homing:the-tail-ends-without-a-teleport", jumps.length === 0, jumps.join(", ") || "no jump at any tail end");

  // 대조군. 사건이 도는 동안에는 집을 비운다. 안 비우면 위의 둘이 늘 참이다.
  const mid = rows.filter((r) => r.kind && r.age > 0.8 && r.age < 4.0);
  const out = mid.filter((r) => away(r) > NEAR * 2);
  check("control:the-event-actually-takes-him-off-his-line", out.length > 0,
    out.length + " of " + mid.length + " mid-tail samples away from home");

  check("console:no-errors", errs.length === 0, errs.slice(0, 2).join(" | ") || "clean");
  await ctx.close();

  if (notes.length) console.log(notes.map((x) => "  ok   " + x).join(LINE));
  if (fails.length) console.log(fails.map((x) => "  FAIL " + x).join(LINE));
  console.log(fails.length ? "homing FAIL " + fails.length : "homing PASS " + notes.length);
  if (fails.length) process.exitCode = 1;
} finally {
  clearTimeout(t);
  if (b) await b.close();
}

