import { chromium } from "playwright";
import { pinClock } from "./clock.mjs";

// 사건이 언제 시작하는가의 자. 판정은 공이 날아가기 전에 이미 끝나 있고 화면은 그것을 연기한다.
// 그런데 첫 사건이 착탄 0.9초 뒤에 시작해서, 막은 공은 흙에 서 있다가 장갑으로 뛰어오르고
// 먹힌 공은 그물에 들어갔다가 다시 나왔다. 그 그림은 판정이 뒤늦게 발동한 것으로 읽힌다.
//
// 재는 것은 둘이다. 닿아서 끝나는 사건이 공이 아직 움직이는 동안 시작하는가,
// 그 시작에서 공이 순간이동하지 않는가. 대조군은 안 닿고 지나가는 사건이다.
// 거기서는 공이 멈춘 뒤에 자막이 오는 것이 맞고, 그 차이가 이 자가 무언가를 재고 있다는 증거다.
// 표본 범위: 판정을 안 부른다. 시작 시점만 재므로 키퍼 표본이 결론을 안 바꾼다.
//
// 표본은 초가 아니라 구로 센다. 벽시계 26초로 끊으면 한 판이 8.7초인 지금 페이지마다 세 구와
// 두 구가 들어와 표본이 여덟 구이고, 그 여덟에 닿는 구는 하나다. 닿는 구를 내는 시드가 그중
// 하나뿐인데 그 시드의 두 번째 contact가 36.0초에 열리므로, 창이 26초에서 닫히는 한 닿는 쪽
// 표본은 기계가 아무리 한가해도 하나다. 표본 하나짜리 갈래는 이 자가 재려는 것을 못 가른다.
// 그래서 세계시계를 1/60로 못 박고(clock.mjs pinClock) 페이지마다 BALLS구가 열릴 때까지 돈다.
// 바쁜 기계는 벽시계가 늘어날 뿐 같은 표본을 낸다.
const EXE = process.env.LOCALAPPDATA + "/ms-playwright/chromium-1228/chrome-win64/chrome.exe";
const LINE = String.fromCharCode(10);
const STEP = 1 / 60;
// 페이지마다 받을 구 수. 한 세트가 다섯 구라 여기서 끊으면 세트 사이 쉬는 시간을 안 기다린다.
const BALLS = 5;
// 표본이 안 차는데 프레임만 도는 판을 끊는다. 실측으로 다섯 구가 가장 느린 페이지에서 3091 프레임이다.
const RAF_CAP = 4200;
// 체인의 첫 줄이 쓰는 이름이다. 닿았으면 contact, 못 닿았으면 miss로 갈리고 나머지는 그 뒤에 온다.
// 이 표본에 실제로 뜨는 첫 줄은 contact, miss, wide, talked, emptyGoal 다섯이고
// 그중 키퍼가 공에 손을 댄 것은 contact뿐이다. wide와 emptyGoal은 키커가 골문을 안 맞힌 구다.
const TOUCHED = new Set(["contact"]);
// 닿는 구가 표본에 한 번만 들면 그 한 번이 우연일 때 이 자가 거짓 초록을 낸다.
// 만렙 키퍼 시드로 닿는 쪽을 늘리고, 신규 키퍼 한 판으로 못 닿는 쪽을 받는다.
// 실측 다섯 구당 닿는 수는 시드 3이 둘, 42가 둘, 20이 영, 신인 7이 영이다.
// 닿는 쪽을 두 시드가 따로 대므로 한 시드가 조용해진 날에도 그 갈래가 표본 하나로 안 떨어진다.
const PAGES = [
  "http://127.0.0.1:10310/web/index.html?seed=20&preset=maxed",
  "http://127.0.0.1:10310/web/index.html?seed=3&preset=maxed",
  "http://127.0.0.1:10310/web/index.html?seed=42&preset=maxed",
  "http://127.0.0.1:10310/web/index.html?seed=7"
];
// 구로 세는 자는 바쁜 기계에서 벽시계가 늘어난다. 여기서 죽으면 그 늘어남이 다시 판정에 섞인다.
const t = setTimeout(() => { console.log("WATCHDOG"); process.exit(1); }, 540000);
t.unref();

const fails = [], notes = [];
const check = (n, ok, d) => (ok ? notes : fails).push(n + " " + d);
const step = (a, c) => Math.hypot(a.x - c.x, a.y - c.y, a.z - c.z);

let b;
try {
  b = await chromium.launch({ executablePath: EXE });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } });
  // 세계시계를 프레임에 못 박는다. 이게 없으면 아래의 구 수 목표가 다시 벽시계로 돌아간다.
  await pinClock(ctx, STEP);
  const p = await ctx.newPage();
  const errs = [];
  p.on("pageerror", (e) => errs.push(String(e)));
  p.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });

  // 프레임마다 브라우저 안에서 모은다. 시작 프레임은 밖에서 폴링하면 그 간격만큼 늦게 잡힌다.
  // 구가 몇 개 열렸는지도 같은 자리에서 센다. 밖에서 세면 그 수가 다시 폴링 간격에 걸린다.
  const watch = async (url) => {
    await p.goto(url, { waitUntil: "load" });
    await p.evaluate(() => localStorage.clear());
    await p.goto(url, { waitUntil: "load" });
    await p.waitForSelector("#go", { timeout: 15000 });
    await p.click("#go", { force: true });
    await p.evaluate(() => {
      window.__rec = [];
      window.__opens = 0;
      window.__openAt = 0;
      const tick = () => {
        const k = window.__tailKind();
        const n = window.__rec.length;
        if (k && n > 0 && !window.__rec[n - 1].k) { window.__opens += 1; window.__openAt = n; }
        window.__rec.push({ b: window.__ballPos(), k });
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    // 마지막 구도 뒤 프레임 몇 장이 있어야 튐을 잰다. 목표를 채운 자리에서 바로 끊으면
    // starts가 그 구를 못 읽어, 세어 놓은 구 수와 실제로 뽑힌 구 수가 하나씩 어긋난다.
    await p.waitForFunction(([n, cap]) => (window.__opens >= n && window.__rec.length >= window.__openAt + 8)
      || window.__rec.length >= cap, [BALLS, RAF_CAP], { timeout: 240000, polling: "raf" });
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

  const all = [], seen = [];
  for (const url of PAGES) {
    const got = starts(await watch(url));
    seen.push(url.split("seed=")[1].split("&")[0] + ":" + got.length);
    for (const x of got) all.push(x);
  }
  const touched = all.filter((x) => TOUCHED.has(x.kind));
  const passed = all.filter((x) => !TOUCHED.has(x.kind));

  // 몇 구를 봤는지를 같이 적는다. 갈래가 비었을 때 표본이 모자란 것인지 사건이 안 난 것인지는
  // 이 수가 없으면 못 가르고, 그 둘은 고칠 자리가 다르다.
  check("instrument:both-classes-of-event-were-seen", touched.length > 1 && passed.length > 1,
    touched.length + " touched (" + touched.map((x) => x.kind).join(",") + "), "
    + passed.length + " untouched (" + passed.map((x) => x.kind).join(",") + "), "
    + all.length + " balls seen (" + seen.join(" ") + ")");
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
  // 이 표본의 안 닿는 쪽 실측 폭은 0.001에서 0.014다. 그물 높은 곳에 걸린 공은 자막이 열릴 때
  // 아직 중력으로 떨어지는 중이라 이 수가 바에 붙는다. 페이지를 갈아 끼울 때는 닿는 수만 세지 말고
  // 그 페이지의 안 닿는 쪽 폭도 같이 읽어야, 표본을 넓힌 자리에서 이 축이 대신 빨개지지 않는다.
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
