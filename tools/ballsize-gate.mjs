import { chromium } from "playwright";

// 공 크기의 자. 크기는 두 가지가 곱해진 것이다. 거리에서 오는 배율과 발에 맞은 순간의 짜부라짐.
// 앞엣것은 이어져야 하고 뒤엣것은 튀어야 한다. 한 수로 재면 그 둘이 구분되지 않는다.
//
// 재는 것은 셋이다. 거리 배율이 프레임 사이에서 안 튀는가, 그 배율이 실제로 거리를 따라가는가,
// 짜부라짐은 여전히 한 프레임에 터지는가. 표본은 브라우저 안에서 프레임마다 모은다.
// 밖에서 폴링하면 프레임을 건너뛰고, 건너뛴 자리가 곧 튐이 숨는 자리다.
// 표본 범위: 판정을 안 부른다. 화면 크기만 재므로 키퍼 표본이 결론을 안 바꾼다.
const EXE = process.env.LOCALAPPDATA + "/ms-playwright/chromium-1228/chrome-win64/chrome.exe";
const BASE = "http://127.0.0.1:10310/web/index.html?seed=20";
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
  p.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
  await p.goto(BASE, { waitUntil: "load" });
  await p.evaluate(() => localStorage.clear());
  await p.goto(BASE, { waitUntil: "load" });
  await p.waitForSelector("#go", { timeout: 15000 });
  await p.click("#go", { force: true });
  await p.evaluate(() => {
    window.__rec = [];
    const tick = () => { window.__rec.push(window.__ballSize()); requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  });
  await p.waitForTimeout(4200);
  const rec = await p.evaluate(() => window.__rec);

  const moved = Math.max.apply(null, rec.map((r) => r.z)) - Math.min.apply(null, rec.map((r) => r.z));
  check("instrument:the-recorder-saw-a-whole-shot", rec.length > 90 && moved > 3,
    rec.length + " frames, the ball crossed " + moved.toFixed(1) + "m");
  // 짜부라짐이 한 번도 안 걸린 표본은 발에 맞는 순간을 지나지 않은 것이다. 그러면 아래 축이 아무것도 안 잰다.
  const squash = Math.max.apply(null, rec.map((r) => r.x / Math.max(0.001, r.y)));
  check("instrument:the-window-covered-the-strike", squash > 1.15,
    "widest squash " + squash.toFixed(2));

  // 되돌아가는 프레임은 순간이동이다. 공이 골대에서 발밑으로 돌아갈 때 거리는 당연히 튄다.
  let worst = 0, at = -1;
  for (let i = 1; i < rec.length; i += 1) {
    if (Math.abs(rec[i].z - rec[i - 1].z) > 1) continue;
    const d = Math.abs(rec[i].gain - rec[i - 1].gain);
    if (d > worst) { worst = d; at = i; }
  }
  check("ballsize:the-distance-gain-never-jumps-between-frames", worst <= 0.08,
    "worst step " + worst.toFixed(3) + " at frame " + at + " (z " + (at > 0 ? rec[at].z.toFixed(1) : "-") + ")");
  const far = rec[0].gain;
  const near = Math.min.apply(null, rec.map((r) => r.gain));
  check("ballsize:the-gain-follows-the-distance", far - near > 0.2,
    "at rest " + far.toFixed(2) + " down to " + near.toFixed(2));
  // 대조군. 이어져야 할 것과 튀어야 할 것이 같은 자에 안 걸린다는 증거다.
  let squashStep = 0;
  for (let i = 1; i < rec.length; i += 1) {
    if (Math.abs(rec[i].z - rec[i - 1].z) > 1) continue;
    squashStep = Math.max(squashStep, Math.abs(rec[i].x / Math.max(0.001, rec[i].y) - rec[i - 1].x / Math.max(0.001, rec[i - 1].y)));
  }
  check("control:the-impact-still-jumps-in-one-frame", squashStep > 0.2,
    "widest squash step " + squashStep.toFixed(2) + " against a gain step of " + worst.toFixed(3));

  check("console:no-errors", errs.length === 0, errs.slice(0, 2).join(" | ") || "clean");
  await ctx.close();

  if (notes.length) console.log(notes.map((x) => "  ok   " + x).join(LINE));
  if (fails.length) console.log(fails.map((x) => "  FAIL " + x).join(LINE));
  console.log(fails.length ? "ballsize FAIL " + fails.length : "ballsize PASS " + notes.length);
  if (fails.length) process.exitCode = 1;
} finally {
  clearTimeout(t);
  if (b) await b.close();
}
