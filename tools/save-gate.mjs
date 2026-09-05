import { chromium } from "playwright";

// 저장 게이트. 탭을 닫아도 키퍼가 남는가, 자리를 비운 시간이 상한 안에서만 쌓이는가.
// 대조군 셋: 저장이 비었을 때 0, 시계를 되돌렸을 때 0, 몇 달 비웠을 때도 상한.
const EXE = process.env.LOCALAPPDATA + "/ms-playwright/chromium-1228/chrome-win64/chrome.exe";
const URL = "http://127.0.0.1:10310/web/index.html?seed=20&preset=veteran";
const t = setTimeout(() => { console.log("WATCHDOG"); process.exit(1); }, 150000);
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

  await p.goto(URL, { waitUntil: "load" });
  await p.evaluate(() => localStorage.clear());
  await p.reload({ waitUntil: "load" });
  await p.waitForTimeout(1200);

  // 대조군 1. 저장이 없으면 오프라인 적립도 없다.
  const fresh = await p.evaluate(() => window.__points());
  check("control:no-save-means-no-offline-picks", fresh === 0, String(fresh));

  await p.click("#go", { force: true });
  await p.waitForTimeout(1400);
  for (let i = 0; i < 4; i++) { await p.keyboard.press(i % 2 ? "ArrowRight" : "ArrowLeft"); await p.waitForTimeout(3200); }
  await p.waitForTimeout(2000);

  const before = await p.evaluate(() => JSON.parse(localStorage.getItem(window.__saveKey())));
  check("save:record-written-while-playing", before !== null && Number.isFinite(before?.keeper?.level), JSON.stringify(before && { lv: before.keeper.level, fans: before.fans }));
  check("save:followers-accumulated", (before?.fans || 0) > 0, String(before?.fans));

  // 되살아나는가. 새 탭에서 같은 키퍼가 나와야 한다.
  await p.reload({ waitUntil: "load" });
  await p.waitForTimeout(1200);
  const after = await p.evaluate(() => JSON.parse(localStorage.getItem(window.__saveKey())));
  check("save:keeper-survives-reload", after?.keeper?.level === before?.keeper?.level, after?.keeper?.level + "/" + before?.keeper?.level);
  /* 저장과 화면을 맞대는 축이라 둘을 같은 순간에 읽어야 한다. 되살아난 판은 계속 굴러서
     읽는 사이에 한 구가 끝나면 저장은 옛 수를, 화면은 새 수를 말한다. 실측으로 그렇게 한 번 빨갰다.
     판을 세우고 그 자리에서 둘 다 읽는다. */
  await p.evaluate(() => window.__lockRound());
  await p.waitForTimeout(150);
  const live = await p.evaluate(() => ({
    saved: JSON.parse(localStorage.getItem(window.__saveKey())).fans,
    shown: document.getElementById("fans").textContent
  }));
  check("save:followers-restored-on-screen", live.shown.includes(String(live.saved)),
    live.shown + " against " + live.saved);

  // 대조군 2. 시계를 되돌린 사람은 적립이 없다.
  await p.evaluate(() => {
    const s = JSON.parse(localStorage.getItem(window.__saveKey()));
    s.at = Date.now() + 9e8;
    localStorage.setItem(window.__saveKey(), JSON.stringify(s));
  });
  await p.reload({ waitUntil: "load" });
  await p.waitForTimeout(900);
  const back = await p.evaluate(() => window.__points());
  check("control:clock-rollback-gains-nothing", back === 0, String(back));

  // 대조군 3. 몇 달을 비워도 상한을 못 넘는다.
  await p.evaluate(() => {
    const s = JSON.parse(localStorage.getItem(window.__saveKey()));
    s.at = Date.now() - 90 * 24 * 3600 * 1000;
    localStorage.setItem(window.__saveKey(), JSON.stringify(s));
  });
  await p.reload({ waitUntil: "load" });
  await p.waitForTimeout(900);
  const capped = await p.evaluate(() => window.__points());
  check("offline:ninety-days-still-hits-the-cap", capped === 12, String(capped));

  // 한 구간만 비운 사람은 그만큼만 받는다. 상한과 구분되어야 계측기를 믿는다.
  await p.evaluate(() => {
    const s = JSON.parse(localStorage.getItem(window.__saveKey()));
    s.at = Date.now() - 3 * 20 * 60 * 1000 - 1000;
    localStorage.setItem(window.__saveKey(), JSON.stringify(s));
  });
  await p.reload({ waitUntil: "load" });
  await p.waitForTimeout(900);
  const three = await p.evaluate(() => window.__points());
  check("offline:one-hour-away-pays-exactly-three", three === 3, String(three));

  // 만렙 데드락. 전 스탯 10인 저장에 밀린 훈련이 쌓여도 진행이 멈추면 안 된다.
  // 강제 팝업을 훈련장 패널로 옮긴 뒤에도 같은 상황을 다시 잰다. 문턱은 그대로다.
  await p.evaluate(() => {
    const s = JSON.parse(localStorage.getItem(window.__saveKey()));
    // 저장의 정본은 보유 목록이고 keeper 칸은 구버전을 위한 사본이다. 정본을 올려야 만렙이 된다.
    const head = Array.isArray(s.squad) ? s.squad[Number(s.pick) || 0] : s.keeper;
    for (const k of Object.keys(head)) if (k !== 'level' && Number.isFinite(head[k])) head[k] = 10;
    head.level = 40;
    s.keeper = head;
    s.at = Date.now() - 90 * 24 * 3600 * 1000;
    localStorage.setItem(window.__saveKey(), JSON.stringify(s));
  });
  await p.reload({ waitUntil: 'load' });
  await p.waitForTimeout(900);
  const maxedPoints = await p.evaluate(() => window.__points());
  check('maxed:points-were-actually-queued', maxedPoints === 12, String(maxedPoints));
  // 타이틀이 화면을 덮고 있는 동안은 HUD 버튼을 눌러도 타이틀이 받는다. 먼저 들어가야 한다.
  await p.click('#go', { force: true });
  await p.waitForTimeout(900);
  // 열자마자 아무것도 못 고르는 상태여야 정상이다. 칸은 열다섯 그대로고 전부 잠긴다.
  await p.click('#gymBtn', { force: true });
  await p.waitForTimeout(300);
  const panel = await p.evaluate(() => {
    const g = document.getElementById('gym');
    const bs = [...g.querySelectorAll('.row button')];
    return { open: !g.hidden, n: bs.length, live: bs.filter((b) => !b.disabled).length, close: !!g.querySelector('.close') };
  });
  check('maxed:gym-opens-with-fifteen-locked-stats', panel.open && panel.n === 15 && panel.live === 0, JSON.stringify(panel));
  check('maxed:panel-always-carries-a-way-out', panel.close, String(panel.close));
  // 고를 게 없는 패널이 포인트를 삼키면 안 된다. 닫고 나서도 열둘 그대로여야 한다.
  await p.click('#gym .close', { force: true });
  await p.waitForTimeout(300);
  const kept = await p.evaluate(() => window.__points());
  check('maxed:a-dead-panel-does-not-eat-points', kept === 12, String(kept));
  // 진짜 문턱은 진행이다. 만렙 저장으로도 구가 실제로 굴러가야 한다.
  await p.click('#auto', { force: true });
  let moved = false, samples = 0, lastSeen = '';
  const first = await p.evaluate(() => document.getElementById('caption').textContent);
  for (let i = 0; i < 120; i++) {
    const cap = await p.evaluate(() => document.getElementById('caption').textContent);
    samples += 1;
    lastSeen = cap.slice(0, 40);
    if (cap !== first) { moved = true; break; }
    await p.waitForTimeout(500);
  }
  check('maxed:the-run-keeps-advancing', moved, samples + ' samples, last=' + lastSeen);
  check("console:no-errors", errs.length === 0, errs.slice(0, 3).join(" | ") || "clean");

  console.log(notes.map((s) => "  ok   " + s).join("\n"));
  if (fails.length) console.log(fails.map((s) => "  FAIL " + s).join("\n"));
  console.log(fails.length ? "save FAIL " + fails.length : "save PASS");
  if (fails.length) process.exitCode = 1;
} finally {
  clearTimeout(t);
  if (b) await b.close();
}
