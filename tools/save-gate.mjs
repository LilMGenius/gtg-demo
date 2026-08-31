import { chromium } from "playwright";

// 저장 게이트. 탭을 닫아도 키퍼가 남는가, 자리를 비운 시간이 상한 안에서만 쌓이는가.
// 대조군 셋: 저장이 비었을 때 0, 시계를 되돌렸을 때 0, 몇 달 비웠을 때도 상한.
const EXE = process.env.LOCALAPPDATA + "/ms-playwright/chromium-1228/chrome-win64/chrome.exe";
const URL = "http://127.0.0.1:10310/web/index.html?seed=20";
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
  const fresh = await p.evaluate(() => window.__picks());
  check("control:no-save-means-no-offline-picks", fresh === 0, String(fresh));

  await p.click("#go", { force: true });
  await p.waitForTimeout(1400);
  for (let i = 0; i < 4; i++) { await p.keyboard.press(i % 2 ? "ArrowRight" : "ArrowLeft"); await p.waitForTimeout(3200); }
  await p.waitForTimeout(2000);

  const before = await p.evaluate(() => JSON.parse(localStorage.getItem("gtg.save.v1")));
  check("save:record-written-while-playing", before !== null && Number.isFinite(before?.keeper?.level), JSON.stringify(before && { lv: before.keeper.level, fans: before.fans }));
  check("save:followers-accumulated", (before?.fans || 0) > 0, String(before?.fans));

  // 되살아나는가. 새 탭에서 같은 키퍼가 나와야 한다.
  await p.reload({ waitUntil: "load" });
  await p.waitForTimeout(1200);
  const after = await p.evaluate(() => JSON.parse(localStorage.getItem("gtg.save.v1")));
  check("save:keeper-survives-reload", after?.keeper?.level === before?.keeper?.level, after?.keeper?.level + "/" + before?.keeper?.level);
  const fansShown = await p.evaluate(() => document.getElementById("fans").textContent);
  check("save:followers-restored-on-screen", fansShown.includes(String(before.fans)), fansShown);

  // 대조군 2. 시계를 되돌린 사람은 적립이 없다.
  await p.evaluate(() => {
    const s = JSON.parse(localStorage.getItem("gtg.save.v1"));
    s.at = Date.now() + 9e8;
    localStorage.setItem("gtg.save.v1", JSON.stringify(s));
  });
  await p.reload({ waitUntil: "load" });
  await p.waitForTimeout(900);
  const back = await p.evaluate(() => window.__picks());
  check("control:clock-rollback-gains-nothing", back === 0, String(back));

  // 대조군 3. 몇 달을 비워도 상한을 못 넘는다.
  await p.evaluate(() => {
    const s = JSON.parse(localStorage.getItem("gtg.save.v1"));
    s.at = Date.now() - 90 * 24 * 3600 * 1000;
    localStorage.setItem("gtg.save.v1", JSON.stringify(s));
  });
  await p.reload({ waitUntil: "load" });
  await p.waitForTimeout(900);
  const capped = await p.evaluate(() => window.__picks());
  check("offline:ninety-days-still-hits-the-cap", capped === 12, String(capped));

  // 한 구간만 비운 사람은 그만큼만 받는다. 상한과 구분되어야 계측기를 믿는다.
  await p.evaluate(() => {
    const s = JSON.parse(localStorage.getItem("gtg.save.v1"));
    s.at = Date.now() - 3 * 20 * 60 * 1000 - 1000;
    localStorage.setItem("gtg.save.v1", JSON.stringify(s));
  });
  await p.reload({ waitUntil: "load" });
  await p.waitForTimeout(900);
  const three = await p.evaluate(() => window.__picks());
  check("offline:one-hour-away-pays-exactly-three", three === 3, String(three));

  // 만렙 데드락. 전 스탯 10인 저장에 밀린 훈련이 쌓이면 고를 카드가 없다.
  // 그때 빈 카드가 뜨면 닫을 버튼이 없어 게임이 그 자리에서 멈춘다. 실제로 멈췄었다.
  await p.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('gtg.save.v1'));
    for (const k of Object.keys(s.keeper)) if (k !== 'level' && Number.isFinite(s.keeper[k])) s.keeper[k] = 10;
    s.keeper.level = 40;
    s.at = Date.now() - 90 * 24 * 3600 * 1000;
    localStorage.setItem('gtg.save.v1', JSON.stringify(s));
  });
  await p.reload({ waitUntil: 'load' });
  await p.waitForTimeout(900);
  const maxedPicks = await p.evaluate(() => window.__picks());
  check('maxed:picks-were-actually-queued', maxedPicks === 12, String(maxedPicks));
  await p.click('#go', { force: true });
  await p.waitForTimeout(900);
  await p.click('#auto', { force: true });
  let emptyCard = 0, sawDrop = false, samples = 0, lastSeen = '', prevPicks = maxedPicks;
  // 한 세트는 다섯 구다. 자동으로 굴려도 세트가 닫히기까지 1분 넘게 걸린다.
  for (let i = 0; i < 220; i++) {
    const s = await p.evaluate(() => {
      const box = document.getElementById('offer');
      return { open: !box.hidden, btns: box.querySelectorAll('button').length, picks: window.__picks(), cap: document.getElementById('caption').textContent };
    });
    samples += 1;
    if (s.open && s.btns === 0) emptyCard += 1;
    // 자막은 다음 구가 즉시 덮어써서 0.5초 표본으로는 못 잡는다. 픽 큐는 showOffer를 지나야만 비므로 그게 증거다.
    if (prevPicks > 0 && s.picks === 0) sawDrop = true;
    prevPicks = s.picks;
    lastSeen = s.cap.slice(0, 40) + ' picks' + s.picks;
    if (sawDrop && i > 4) break;
    await p.waitForTimeout(500);
  }
  check('maxed:offer-was-actually-reached', sawDrop, samples + ' samples, last=' + lastSeen);
  check('maxed:no-empty-offer-card-ever-shown', emptyCard === 0, emptyCard + '/' + samples);
  const spent = await p.evaluate(() => window.__picks());
  check('maxed:queued-picks-do-not-pile-up', spent === 0, String(spent));
  check("console:no-errors", errs.length === 0, errs.slice(0, 3).join(" | ") || "clean");

  console.log(notes.map((s) => "  ok   " + s).join("\n"));
  if (fails.length) console.log(fails.map((s) => "  FAIL " + s).join("\n"));
  console.log(fails.length ? "save FAIL " + fails.length : "save PASS");
  if (fails.length) process.exitCode = 1;
} finally {
  clearTimeout(t);
  if (b) await b.close();
}
