import { chromium } from "playwright";

// 사건이 언제 시작하는가의 자. 판정은 공이 날아가기 전에 이미 끝나 있고 화면은 그것을 연기한다.
// 그런데 첫 사건이 착탄 0.9초 뒤에 시작해서, 막은 공은 흙에 서 있다가 장갑으로 뛰어오르고
// 먹힌 공은 그물에 들어갔다가 다시 나왔다. 그 그림은 판정이 뒤늦게 발동한 것으로 읽힌다.
//
// 재는 것은 둘이다. 닿아서 끝나는 사건이 공이 아직 움직이는 동안 시작하는가,
// 그 시작에서 공이 순간이동하지 않는가. 대조군은 안 닿고 지나가는 사건이다.
// 거기서는 공이 멈춘 뒤에 자막이 오는 것이 맞고, 그 차이가 이 자가 무언가를 재고 있다는 증거다.
// 표본 범위: 판정을 안 부른다. 시작 시점만 재므로 키퍼 표본이 결론을 안 바꾼다.
const EXE = process.env.LOCALAPPDATA + "/ms-playwright/chromium-1228/chrome-win64/chrome.exe";
const LINE = String.fromCharCode(10);
// 체인의 첫 줄이 쓰는 이름이다. 닿았으면 contact, 못 닿았으면 miss로 갈리고 나머지는 그 뒤에 온다.
const TOUCHED = new Set(["contact"]);
const t = setTimeout(() => { console.log("WATCHDOG"); process.exit(1); }, 260000);
t.unref();

const fails = [], notes = [];
const check = (n, ok, d) => (ok ? notes : fails).push(n + " " + d);
const step = (a, c) => Math.hypot(a.x - c.x, a.y - c.y, a.z - c.z);

let b;
try {
  b = await chromium.launch({ executablePath: EXE });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } });
  const p = await ctx.newPage();
  const errs = [];
  p.on("pageerror", (e) => errs.push(String(e)));
  p.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });

  // 프레임마다 브라우저 안에서 모은다. 시작 프레임은 밖에서 폴링하면 그 간격만큼 늦게 잡힌다.
  const watch = async (url) => {
    await p.goto(url, { waitUntil: "load" });
    await p.evaluate(() => localStorage.clear());
    await p.goto(url, { waitUntil: "load" });
    await p.waitForSelector("#go", { timeout: 15000 });
    await p.click("#go", { force: true });
    await p.evaluate(() => {
      window.__rec = [];
      const tick = () => { window.__rec.push({ b: window.__ballPos(), k: window.__tailKind() }); requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
    });
    // 닿는 구는 흔치 않다. 16초에서는 표본이 한 번뿐이라 그 한 번이 우연이면 이 자가 거짓 초록을 낸다.
    await p.waitForTimeout(26000);
    return p.evaluate(() => window.__rec);
  };

  // 첫 사건이 시작한 프레임만 뽑는다. 자막이 여러 줄이면 꼬리가 여러 번 갈리는데, 문제는 첫 줄이다.
  const starts = (rec) => {
    const out = [];
    for (let i = 3; i < rec.length - 4; i += 1) {
      if (rec[i].k && !rec[i - 1].k) {
        out.push({
          kind: rec[i].k,
          before: step(rec[i - 1].b, rec[i - 3].b) / 2,
          jump: Math.max(step(rec[i + 1].b, rec[i].b), step(rec[i + 2].b, rec[i + 1].b))
        });
      }
    }
    return out;
  };

  // 닿는 구가 표본에 한 번만 들면 그 한 번이 우연일 때 이 자가 거짓 초록을 낸다.
  // 만렙 키퍼로 시드를 둘 돌려 닿는 쪽을 늘리고, 신규 키퍼 한 판으로 못 닿는 쪽을 받는다.
  const all = [];
  for (const url of ["http://127.0.0.1:10310/web/index.html?seed=20&preset=maxed",
    "http://127.0.0.1:10310/web/index.html?seed=3&preset=maxed",
    "http://127.0.0.1:10310/web/index.html?seed=7"]) {
    for (const x of starts(await watch(url))) all.push(x);
  }
  const touched = all.filter((x) => TOUCHED.has(x.kind));
  const passed = all.filter((x) => !TOUCHED.has(x.kind));

  check("instrument:both-classes-of-event-were-seen", touched.length > 1 && passed.length > 1,
    touched.length + " touched (" + touched.map((x) => x.kind).join(",") + "), "
    + passed.length + " untouched (" + passed.map((x) => x.kind).join(",") + ")");
  // 0.02는 정지한 공의 프레임 이동량이다. 그보다 크면 아직 날거나 구르는 중이다.
  const parked = touched.filter((x) => x.before < 0.02);
  check("tailstart:a-touched-event-opens-while-the-ball-is-still-moving", parked.length === 0,
    parked.length ? parked.map((x) => x.kind + " opened on a parked ball").join(", ")
      : touched.map((x) => x.kind + " " + x.before.toFixed(3) + "m/frame").join(", "));
  const flung = touched.filter((x) => x.jump > 0.8);
  check("tailstart:the-ball-does-not-teleport-when-the-event-opens", flung.length === 0,
    flung.length ? flung.map((x) => x.kind + " jumped " + x.jump.toFixed(2) + "m").join(", ")
      : "worst jump " + Math.max.apply(null, touched.map((x) => x.jump)).toFixed(2) + "m");
  // 대조군. 안 닿고 지나가는 사건은 공이 그물이나 흙에 선 뒤에 온다. 두 갈래가 같으면 위 축은 아무것도 안 가른다.
  const early = passed.filter((x) => x.before >= 0.02);
  check("control:an-untouched-event-still-waits-for-the-ball-to-settle", early.length === 0,
    early.length ? early.map((x) => x.kind + " " + x.before.toFixed(3) + "m/frame").join(", ")
      : passed.map((x) => x.kind + " " + x.before.toFixed(3)).join(", "));

  check("console:no-errors", errs.length === 0, errs.slice(0, 2).join(" | ") || "clean");
  await ctx.close();

  if (notes.length) console.log(notes.map((x) => "  ok   " + x).join(LINE));
  if (fails.length) console.log(fails.map((x) => "  FAIL " + x).join(LINE));
  console.log(fails.length ? "tailstart FAIL " + fails.length : "tailstart PASS " + notes.length);
  if (fails.length) process.exitCode = 1;
} finally {
  clearTimeout(t);
  if (b) await b.close();
}
