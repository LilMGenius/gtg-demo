import { chromium } from "playwright";

// 사고 연출은 확률로만 나온다. 이 드라이버는 판정을 건너뛰고 꼬리 하나만 직접 재생해서 찍는다.
// act()는 결과를 바꾸지 않으므로 이렇게 불러도 판정 계약은 그대로다.
const EXE = process.env.LOCALAPPDATA + "/ms-playwright/chromium-1228/chrome-win64/chrome.exe";
const KIND = process.argv[2] || "talked";
const OUT = process.argv[3] || "tail-" + KIND + ".png";
const t = setTimeout(() => { console.log("WATCHDOG"); process.exit(1); }, 60000);
t.unref();
let b;
try {
  b = await chromium.launch({ executablePath: EXE });
  const p = await (await b.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  const errs = [];
  p.on("pageerror", (e) => errs.push(String(e)));
  p.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
  await p.goto("http://127.0.0.1:10310/web/index.html?seed=20", { waitUntil: "load" });
  await p.waitForTimeout(1200);
  await p.click("#go", { force: true });
  await p.waitForTimeout(1500);
  await p.keyboard.press("ArrowLeft");
  await p.waitForTimeout(700);
  await p.evaluate((k) => window.__act(k), KIND);
  await p.waitForTimeout(520);
  await p.screenshot({ path: OUT });
  console.log(JSON.stringify({ kind: KIND, out: OUT, errs }));
} finally {
  clearTimeout(t);
  if (b) await b.close();
}
