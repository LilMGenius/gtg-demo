import { chromium } from "playwright";

// 다시 차는 마디의 자. 판정은 리바운드를 다시 찼다고 말하는데 화면에서는 키커가 제자리에 선 채
// 공만 혼자 굴러갔다. 자막과 그림이 다른 사건을 가리키면 플레이어는 그림을 믿는다.
//
// 재는 것은 셋이다. 키커가 흘러나온 공까지 실제로 이동하는가, 두 번째 비행이 그 도착 뒤에 시작하는가,
// 흘러나온 공이 땅에 서는가. 표본은 브라우저 안에서 프레임마다 모은다.
// 표본 범위: 판정을 안 부른다. 꼬리 연출만 재므로 키퍼 표본이 결론을 안 바꾼다.
const EXE = process.env.LOCALAPPDATA + "/ms-playwright/chromium-1228/chrome-win64/chrome.exe";
const BASE = "http://127.0.0.1:10310/web/index.html?seed=20";
const LINE = String.fromCharCode(10);
const t = setTimeout(() => { console.log("WATCHDOG"); process.exit(1); }, 120000);
t.unref();

const fails = [], notes = [];
const check = (n, ok, d) => (ok ? notes : fails).push(n + " " + d);
const gap = (a) => Math.hypot(a.b.x - a.k.x, a.b.z - a.k.z);

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
  await p.waitForTimeout(1000);

  // 밖에서 폴링하면 프레임을 건너뛴다. 두 번째 발이 언제 떠나는지는 프레임 단위 질문이다.
  const play = async (kind) => {
    /* 리바운드는 골문 앞에서 튄 공으로 시작한다. 정지 상태에서 바로 부르면 공이 아직 키커 발밑에 있어
       달려갈 거리 자체가 없고, 그 표본에서는 어떤 축도 이동을 못 잰다. 선방을 먼저 재생해
       공을 골문 앞 장갑으로 보내 놓고 그 자리에서 리바운드를 연다. */
    await p.evaluate(() => { window.__lockRound(); window.__act("save"); });
    await p.waitForTimeout(900);
    await p.evaluate((k) => {
      window.__rec = [];
      window.__act(k);
      const tick = () => { window.__rec.push({ b: window.__ballPos(), k: window.__kickerPos() }); requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
    }, kind);
    await p.waitForTimeout(1800);
    return p.evaluate(() => window.__rec);
  };

  const rec = await play("rebound");
  check("instrument:the-recorder-saw-the-whole-tail", rec.length > 60, rec.length + " frames");
  const walk = Math.max.apply(null, rec.map((r) => r.k.z)) - Math.min.apply(null, rec.map((r) => r.k.z));
  const near = Math.min.apply(null, rec.map(gap));
  check("refire:the-kicker-runs-to-the-loose-ball", walk > 3 && near < 1.2,
    "the kicker covered " + walk.toFixed(1) + "m and got within " + near.toFixed(2) + "m");
  // 도착 프레임과 두 번째 출발 프레임. 순서가 뒤집히면 공이 혼자 떠난 것이다.
  const arrive = rec.findIndex((r) => gap(r) < 1.2);
  let leave = -1;
  for (let i = arrive + 1; i < rec.length - 2; i += 1) {
    if (rec[i + 1].b.z < rec[i].b.z - 0.05 && rec[i + 2].b.z < rec[i + 1].b.z - 0.05) { leave = i; break; }
  }
  check("refire:the-second-flight-starts-after-the-kicker-arrives", arrive >= 0 && leave > arrive,
    "arrived at frame " + arrive + ", the ball left at " + leave);
  // 흘러나온 공은 땅에 있다. 그물에 걸린 높이를 쓰면 필드 한복판에 공이 뜬다.
  const rest = rec.slice(arrive, leave < 0 ? arrive + 1 : leave);
  const low = rest.length ? Math.min.apply(null, rest.map((r) => r.b.y)) : 99;
  check("refire:the-loose-ball-waits-on-the-ground", low < 0.2, "lowest " + low.toFixed(2) + "m over " + rest.length + " frames");
  const end = rec[rec.length - 1].b;
  check("refire:the-ball-ends-in-the-net", end.z < 0, "the ball finished at z " + end.z.toFixed(2));

  // 대조군. 잡은 사건에서는 키커가 제자리에 선다. 안 그러면 위의 이동은 꼬리마다 도는 것이다.
  const still = await play("catch");
  const stillWalk = Math.max.apply(null, still.map((r) => r.k.z)) - Math.min.apply(null, still.map((r) => r.k.z));
  check("control:a-caught-ball-leaves-the-kicker-where-he-stood", stillWalk < 0.5,
    "the kicker moved " + stillWalk.toFixed(2) + "m");

  check("console:no-errors", errs.length === 0, errs.slice(0, 2).join(" | ") || "clean");
  await ctx.close();

  if (notes.length) console.log(notes.map((x) => "  ok   " + x).join(LINE));
  if (fails.length) console.log(fails.map((x) => "  FAIL " + x).join(LINE));
  console.log(fails.length ? "refire FAIL " + fails.length : "refire PASS " + notes.length);
  if (fails.length) process.exitCode = 1;
} finally {
  clearTimeout(t);
  if (b) await b.close();
}
