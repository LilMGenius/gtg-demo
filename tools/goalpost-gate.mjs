import { chromium } from "playwright";
import { R_HALF_W, R_H } from "../web/src/render/units.mjs";

// 골대가 실물 형상인지 잰다. 뒷틀이 앞보다 좁으면 사다리꼴이고, 그 결함은 파운더가
// 화면에서 먼저 봤는데 어느 게이트도 골대가 직육면체인지를 묻지 않았다.
// 프레이밍은 카메라가 풀 문제고 실물 형상은 실물 형상으로 둔다는 판정이 여기 고정된다.

const EXE = process.env.LOCALAPPDATA + "/ms-playwright/chromium-1228/chrome-win64/chrome.exe";
const BASE = "http://127.0.0.1:10310/web/index.html";
const t = setTimeout(() => { console.log("WATCHDOG"); process.exit(1); }, 90000);
t.unref();

// 허용 오차. 기둥 반지름 0.06, 뒷틀 레일 반지름 0.05, jitterMesh 0.018,
// 그리고 앞뒤가 각각 0.021과 0.012 라디안 기울어 있어 높이 2.44에서 최대 0.05가 밀린다.
// 합쳐서 0.2면 의도된 흔들림은 전부 통과하고, 뒤가 앞보다 눈에 띄게 좁은 형태는 잡힌다.
const TOL = 0.2;

const fails = [], notes = [];
const check = (n, ok, d) => (ok ? notes : fails).push(n + " " + d);
const F = (x) => Number(x).toFixed(3);

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
  const s = await p.evaluate(() => window.__goalShape());

  check("hook:three-parts", !!(s && s.post && s.bar && s.rear), "post " + !!s.post + " bar " + !!s.bar + " rear " + !!s.rear);
  if (!s || !s.post || !s.bar || !s.rear) throw new Error("goalShape incomplete");

  // 앞 입구는 판정이 쓰는 폭과 높이를 그대로 그린다. 그림과 숫자가 어긋나면 화면이 거짓말을 한다.
  const frontW = s.post.maxX - s.post.minX;
  check("front:width-matches-judgement", Math.abs(frontW - R_HALF_W * 2) < TOL + 0.12, F(frontW) + " vs " + F(R_HALF_W * 2));
  check("front:symmetric", Math.abs(s.post.maxX + s.post.minX) < TOL, "center " + F((s.post.maxX + s.post.minX) / 2));
  check("front:two-posts", s.post.n === 2, String(s.post.n));
  check("bar:at-goal-height", Math.abs(s.bar.maxY - R_H) < TOL, F(s.bar.maxY) + " vs " + F(R_H));

  // 직육면체. 뒤가 앞보다 좁으면 사각뿔을 자른 모양이 된다.
  const rearW = s.rear.maxX - s.rear.minX;
  check("rear:same-width", Math.abs(rearW - frontW) < TOL, F(rearW) + " vs front " + F(frontW));
  check("rear:same-height", Math.abs(s.rear.maxY - s.bar.maxY) < TOL, F(s.rear.maxY) + " vs bar " + F(s.bar.maxY));
  check("rear:not-tapered", rearW >= frontW - TOL, "rear " + F(rearW) + " front " + F(frontW));

  // 뒷틀은 골라인 뒤에 선다. 앞으로 나오면 공이 골대 안으로 못 들어간다.
  check("rear:behind-goal-line", s.rear.maxZ < 0.1 && s.rear.minZ < s.post.minZ, "rear z " + F(s.rear.minZ) + ".." + F(s.rear.maxZ));

  // 바닥에서 선다. 기둥이 떠 있으면 골대가 공중에 걸린다.
  check("front:stands-on-ground", Math.abs(s.post.minY) < TOL, F(s.post.minY));

  check("console:no-errors", errs.length === 0, errs.slice(0, 3).join(" | ") || "clean");
  const LINE = String.fromCharCode(10);
  if (notes.length) console.log(notes.map((x) => "  ok   " + x).join(LINE));
  if (fails.length) console.log(fails.map((x) => "  FAIL " + x).join(LINE));
  console.log(fails.length ? "goalpost FAIL " + fails.length : "goalpost PASS");
  if (fails.length) process.exitCode = 1;
} finally {
  clearTimeout(t);
  if (b) await b.close();
}
