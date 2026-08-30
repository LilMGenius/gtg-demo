import { chromium } from "playwright";

// 골이 그물에 박혔다는 사실이 화면에서 증명되는지 재는 자.
// 코드에 감쇠파가 있다는 것과 관객이 출렁임을 본다는 것은 다른 주장이다.
// 카메라는 골대 뒤 z=-5.1에서 +z를 본다. 뒷그물이 밀리는 방향은 시선축과 거의 나란해서
// 월드 변위가 커도 화면에서는 원근 축소로만 남는다. 그래서 화소로 잰다.
//
// 바(먼저 정하고 낮추지 않는다).
//   1. 크리틱이 보는 프레임(선언 520ms 뒤)에서 화면 변위 3px 이상.
//   2. 사건 전체에서 최고 화면 변위 8px 이상. 한 프레임만 튀는 것은 출렁임이 아니다.
//   3. 밀린 정점 40개 이상. 실 몇 가닥이 튀면 그물이 아니라 구멍으로 읽힌다.
// 대조군: 같은 자를 아무 사건도 없는 대기 상태에 댄다. 여기서 화소가 나오면 자가 고장난 것이다.
const EXE = process.env.LOCALAPPDATA + "/ms-playwright/chromium-1228/chrome-win64/chrome.exe";
const URL = "http://127.0.0.1:10310/web/index.html?seed=" + (process.argv[2] || 20);
const W = 1280;
const H = 720;
const SHOT_MS = 520;
const SPAN_MS = 1600;
const STEP_MS = 40;
const CONCEDE = ["carriedIn", "gloveGone", "downed", "talked"];
const BAR_SHOT = 3;
const BAR_PEAK = 8;
const BAR_MOVED = 40;
const t = setTimeout(() => { console.log("WATCHDOG"); process.exit(1); }, 200000);
t.unref();

let br;
let fail = 0;
try {
  br = await chromium.launch({ executablePath: EXE });
  const ctx = await br.newContext({ viewport: { width: W, height: H } });
  const p = await ctx.newPage();
  const errs = [];
  p.on("pageerror", (e) => errs.push(String(e)));

  const arm = async () => {
    await p.goto(URL, { waitUntil: "load" });
    await p.waitForTimeout(1400);
    await p.click("#go", { force: true });
    await p.waitForTimeout(1500);
    await p.keyboard.press("ArrowLeft");
    await p.waitForTimeout(700);
  };

  const sample = async (ms) => {
    let peak = { maxPx: 0, maxDz: 0, moved: 0 };
    let shot = null;
    let peakAt = 0;
    for (let el = 0; el <= ms; el += STEP_MS) {
      const v = await p.evaluate(() => window.__netVis());
      if (v.maxPx > peak.maxPx) { peak = v; peakAt = el; }
      if (shot === null && el >= SHOT_MS) shot = v;
      await p.waitForTimeout(STEP_MS);
    }
    return { peak, peakAt, shot: shot || peak };
  };

  for (const kind of CONCEDE) {
    await arm();
    await p.evaluate((k) => window.__act(k), kind);
    const r = await sample(SPAN_MS);
    const ok = [r.shot.maxPx >= BAR_SHOT, r.peak.maxPx >= BAR_PEAK, r.peak.moved >= BAR_MOVED];
    if (ok.some((x) => !x)) fail += 1;
    console.log(kind.padEnd(10)
      + " shot " + r.shot.maxPx.toFixed(2) + "px" + (ok[0] ? "" : " FLAT")
      + " peak " + r.peak.maxPx.toFixed(2) + "px@" + r.peakAt + "ms" + (ok[1] ? "" : " WEAK")
      + " dz " + r.peak.maxDz.toFixed(3)
      + " moved " + r.peak.moved + (ok[2] ? "" : " NARROW"));
  }

  await arm();
  const ctl = await sample(600);
  const ctlOk = ctl.peak.maxPx < 0.5;
  if (!ctlOk) fail += 1;
  console.log("CONTROL    idle " + ctl.peak.maxPx.toFixed(3) + "px" + (ctlOk ? "" : " LEAK"));
  console.log("ERRORS " + errs.length);
  if (errs.length) fail += 1;
  console.log(fail === 0 ? "PASS" : "FAIL " + fail);
} finally {
  if (br) await br.close();
}
process.exit(fail === 0 ? 0 : 1);
