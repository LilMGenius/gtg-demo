import { chromium } from "playwright";

// 경기장 선의 자. 판정 단위와 렌더 미터가 같은 판이라 골대는 실물 7.32 x 2.44로 서 있는데
// 선만 축소판을 쓰면 한 화면이 두 경기장을 그린 것이 된다.
//
// 재는 것은 둘이다. 그은 선이 실제 규격인가, 그 선이 화면에 실제로 찍히는가.
// 규격은 코드가 아니라 씬에 선 물건에서 읽고, 찍힘은 선언이 아니라 화소로 본다.
// 대조군은 선이 없는 흙 한 점이다. 그 점이 밝으면 이 자는 선이 아니라 땅을 재고 있다.
// 표본 범위: 판정을 안 부른다. 그려진 선만 재므로 키퍼 표본이 결론을 안 바꾼다.
const EXE = process.env.LOCALAPPDATA + "/ms-playwright/chromium-1228/chrome-win64/chrome.exe";
const BASE = "http://127.0.0.1:10310/web/index.html?seed=20";
const LINE = String.fromCharCode(10);
// 실제 규격. 페널티 에어리어 40.32 x 16.5, 골 에어리어 18.32 x 5.5, 스팟 11, 아크 반지름 9.15.
const WANT = { boxW: 40.32, boxD: 16.5, areaW: 18.32, areaD: 5.5, spot: 11, arcR: 9.15 };
const t = setTimeout(() => { console.log("WATCHDOG"); process.exit(1); }, 120000);
t.unref();

const fails = [], notes = [];
const check = (n, ok, d) => (ok ? notes : fails).push(n + " " + d);
const near = (a, c, tol) => Math.abs(a - c) <= tol;

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
  await p.waitForTimeout(700);
  // 흐르는 판을 찍으면 공과 사람이 선 위에 들어온다. 세우고 HUD를 접은 뒤에 잰다.
  await p.evaluate(() => { window.__lockRound(); window.__fixedStep(0.000001); document.getElementById("hud").style.display = "none"; });
  await p.waitForTimeout(400);

  const marks = await p.evaluate(() => window.__marks());
  const by = (name) => marks.find((m) => m.mark === name);
  check("instrument:every-line-answered-to-its-name", marks.length === 9,
    marks.map((m) => m.mark).join(", "));
  const boxL = by("boxLeft"), boxR = by("boxRight"), boxF = by("boxFront");
  check("pitchline:the-penalty-area-is-the-real-size",
    near(boxR.x - boxL.x, WANT.boxW, 0.05) && near(boxF.z, WANT.boxD, 0.05) && near(boxF.w, WANT.boxW, 0.05),
    (boxR.x - boxL.x).toFixed(2) + "m wide, " + boxF.z.toFixed(2) + "m deep");
  const arL = by("areaLeft"), arR = by("areaRight"), arF = by("areaFront");
  check("pitchline:the-goal-area-is-the-real-size",
    near(arR.x - arL.x, WANT.areaW, 0.05) && near(arF.z, WANT.areaD, 0.05) && near(arF.w, WANT.areaW, 0.05),
    (arR.x - arL.x).toFixed(2) + "m wide, " + arF.z.toFixed(2) + "m deep");
  // 비율은 두 사각형이 같은 규격표에서 나왔는지를 묻는다. 하나만 맞으면 우연일 수 있다.
  check("pitchline:the-two-boxes-share-one-rulebook",
    near((boxR.x - boxL.x) / (arR.x - arL.x), 2.2009, 0.01) && near(boxF.z / arF.z, 3, 0.01),
    ((boxR.x - boxL.x) / (arR.x - arL.x)).toFixed(3) + " wide, " + (boxF.z / arF.z).toFixed(3) + " deep");
  const arc = by("arc"), spot = by("spot");
  const half = Math.acos((WANT.boxD - WANT.spot) / WANT.arcR);
  check("pitchline:the-arc-is-drawn-on-the-spot-with-the-real-radius",
    near(arc.z, WANT.spot, 0.01) && near(spot.z, WANT.spot, 0.01)
    && near((arc.inner + arc.outer) / 2, WANT.arcR, 0.01) && near(arc.span, half * 2, 0.01),
    "r " + ((arc.inner + arc.outer) / 2).toFixed(2) + "m, span " + arc.span.toFixed(3) + " rad want " + (half * 2).toFixed(3));
  // 아크는 박스 밖으로 나온 몫만 그린다. 박스 안까지 그리면 반달이 아니라 원이 된다.
  const apexZ = WANT.spot + WANT.arcR * Math.cos(0);
  check("pitchline:the-arc-bulges-away-from-the-goal",
    near(arc.from + arc.span / 2, -Math.PI / 2, 0.01),
    "midpoint " + (arc.from + arc.span / 2).toFixed(3) + " rad, apex at z " + apexZ.toFixed(2));

  // 화소로 본다. 그은 것과 찍힌 것은 다른 주장이다.
  const shot = (await p.screenshot()).toString("base64");
  const lum = await p.evaluate(([b64, pts]) => new Promise((res) => {
    const im = new Image();
    im.onload = () => {
      const cv = document.createElement("canvas");
      cv.width = im.width; cv.height = im.height;
      const g = cv.getContext("2d");
      g.drawImage(im, 0, 0);
      const out = [];
      for (const q of pts) {
        const v = window.__project ? window.__project(q[0], q[1], q[2]) : null;
        if (!v || Math.abs(v.x) > 1 || Math.abs(v.y) > 1) { out.push({ on: false }); continue; }
        const px = Math.round((v.x * 0.5 + 0.5) * im.width);
        const py = Math.round((-v.y * 0.5 + 0.5) * im.height);
        // 한 화소만 보면 안티에일리어싱이 답을 정한다. 5x5 창에서 가장 밝은 값을 쓴다.
        let best = 0;
        for (let dy = -2; dy <= 2; dy += 1) for (let dx = -2; dx <= 2; dx += 1) {
          const d = g.getImageData(Math.max(0, Math.min(im.width - 1, px + dx)), Math.max(0, Math.min(im.height - 1, py + dy)), 1, 1).data;
          best = Math.max(best, 0.2126 * d[0] + 0.7152 * d[1] + 0.0722 * d[2]);
        }
        out.push({ on: true, px, py, lum: best });
      }
      res(out);
    };
    im.src = "data:image/png;base64," + b64;
    // 가운데를 찍으면 키커의 몸과 그림자가 그 화소의 주인이 된다. 선 위에서 옆으로 비켜 잰다.
    // 아크는 꼭짓점에서 40도 돌린 자리, 대조군은 그 x에서 선이 하나도 안 지나는 z다.
  }), [shot, [[6, 0.02, WANT.boxD], [WANT.arcR * Math.sin(0.698), 0.02, WANT.spot + WANT.arcR * Math.cos(0.698)], [6, 0.02, 14]]]);

  const [front, apex, bare] = lum;
  check("instrument:the-three-points-are-inside-the-frame", front.on && apex.on && bare.on,
    JSON.stringify(lum.map((x) => (x.on ? x.px + "," + x.py : "off"))));
  // 흙은 실측 140 부근이고 석회는 그보다 밝다. 문턱은 대조군 흙에서 끌어온다.
  check("pitchline:the-box-front-line-is-actually-painted", front.on && bare.on && front.lum > bare.lum + 25,
    "line " + (front.lum || 0).toFixed(0) + " against dirt " + (bare.lum || 0).toFixed(0));
  check("pitchline:the-arc-is-actually-painted", apex.on && bare.on && apex.lum > bare.lum + 25,
    "arc " + (apex.lum || 0).toFixed(0) + " against dirt " + (bare.lum || 0).toFixed(0));

  check("console:no-errors", errs.length === 0, errs.slice(0, 2).join(" | ") || "clean");
  await ctx.close();

  if (notes.length) console.log(notes.map((x) => "  ok   " + x).join(LINE));
  if (fails.length) console.log(fails.map((x) => "  FAIL " + x).join(LINE));
  console.log(fails.length ? "pitchline FAIL " + fails.length : "pitchline PASS " + notes.length);
  if (fails.length) process.exitCode = 1;
} finally {
  clearTimeout(t);
  if (b) await b.close();
}
