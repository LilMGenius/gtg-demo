import { chromium } from "playwright";

// 골이 들어갔다는 사실이 화면에서 증명되는지 재는 자.
// 자막이 "먹혔다"라고 말하는 것은 증거가 아니다. 그림이 사건을 말해야 하고, 그러려면
// 골 입구와 그 안으로 넘어간 공이 같은 프레임에 함께 보여야 한다.
// 실점 4종 중 골망 안의 공이 실제로 보이는 것은 t-talked 한 장뿐이라는 지적에서 나왔다.
//
// 바(먼저 정하고 낮추지 않는다). 실점 연출마다 촬영 시점에서 다섯 개가 전부 참이어야 한다.
//   1. 골 입구 네 꼭짓점이 전부 화면 안. 크로스바가 화면을 잘라 나가면 관객은 골대를 못 읽는다.
//   2. 공의 월드 z < 0. 골 평면을 실제로 넘어갔다.
//   3. 공의 NDC가 골 입구 사각형 안. 넘어갔더라도 화면에서 골대 밖에 찍히면 골로 안 읽힌다.
//   4. 광선 판정으로 공이 가려지지 않았다. 그물은 가림에서 빠지고 기둥은 가린다.
//   5. 공의 화면 지름 20px 이상. 점은 사건이 아니다.
// 대조군: 같은 자를 save(비실점)에 댄다. save가 다섯 개를 전부 만족하면 자가 고장난 것이다.
const EXE = process.env.LOCALAPPDATA + "/ms-playwright/chromium-1228/chrome-win64/chrome.exe";
const URL = "http://127.0.0.1:10310/web/index.html?seed=" + (process.argv[2] || 20);
const W = 1280;
const H = 720;
// 촬영 시점과 같아야 한다. 게이트가 다른 순간을 재면 통과한 그림과 찍힌 그림이 다른 것이 된다.
const SHOT_MS = 520;
const LATE_MS = 1200;
const CONCEDE = ["carriedIn", "gloveGone", "downed", "talked"];
const BAR_PX = 20;
const t = setTimeout(() => { console.log("WATCHDOG"); process.exit(1); }, 150000);
t.unref();

const measure = () => {
  const gf = window.__goalFrame();
  const b = window.__ballPos();
  const pr = window.__ballProbe.probeAt(b.x, b.y, b.z);
  const fv = window.__flightVis();
  return {
    goalOn: gf.minX >= -1 && gf.maxX <= 1 && gf.minY >= -1 && gf.maxY <= 1,
    gf: [gf.minX, gf.maxX, gf.minY, gf.maxY],
    past: b.z < 0,
    z: b.z,
    ndc: [pr.ndc[0], pr.ndc[1]],
    inMouth: pr.ndc[0] >= gf.minX && pr.ndc[0] <= gf.maxX && pr.ndc[1] >= gf.minY && pr.ndc[1] <= gf.maxY,
    seen: pr.visible === true,
    px: fv.ballPx,
  };
};

const verdict = (m) => [m.goalOn, m.past, m.inMouth, m.seen, m.px >= BAR_PX];
const line = (name, m) => {
  const v = verdict(m);
  return name.padEnd(11)
    + (v[0] ? " goalOn" : " GOALCUT")
    + (v[1] ? " past" : " NEAR") + "(z=" + m.z.toFixed(2) + ")"
    + (v[2] ? " inMouth" : " OUTSIDE") + "(ndc " + m.ndc[0].toFixed(2) + "," + m.ndc[1].toFixed(2) + ")"
    + (v[3] ? " seen" : " HIDDEN")
    + " " + m.px.toFixed(1) + "px" + (v[4] ? "" : " SMALL");
};

let br;
let fail = 0;
try {
  br = await chromium.launch({ executablePath: EXE });
  const ctx = await br.newContext({ viewport: { width: W, height: H } });
  const p = await ctx.newPage();
  const errs = [];
  p.on("pageerror", (e) => errs.push(String(e)));

  const run = async (kind) => {
    await p.goto(URL, { waitUntil: "load" });
    await p.waitForTimeout(1400);
    await p.click("#go", { force: true });
    await p.waitForTimeout(1500);
    await p.keyboard.press("ArrowLeft");
    await p.waitForTimeout(700);
    await p.evaluate((k) => window.__act(k), kind);
    await p.waitForTimeout(SHOT_MS);
    const at = await p.evaluate(measure);
    await p.waitForTimeout(LATE_MS - SHOT_MS);
    const late = await p.evaluate(measure);
    return { at, late };
  };

  for (const kind of CONCEDE) {
    const r = await run(kind);
    const v = verdict(r.at);
    if (v.some((x) => !x)) fail += 1;
    console.log(line(kind, r.at));
    // 늦은 표본은 판정에 쓰지 않는다. 언제 증거가 서는지를 알아야 타이밍을 어디로 옮길지 정할 수 있다.
    console.log("  @1.2s".padEnd(11) + line("", r.late).trim());
  }

  const ctrl = await run("save");
  const cv = verdict(ctrl.at);
  console.log(line("CONTROL save", ctrl.at));
  console.log("ERRORS " + errs.length);
  if (cv.every((x) => x)) { console.log("INSTRUMENT DEAD: a save satisfied every goal criterion"); process.exit(1); }
  if (errs.length) fail += 1;
  console.log(fail ? "FAIL " + fail : "PASS");
} finally {
  if (br) await br.close();
}
process.exit(fail ? 1 : 0);
