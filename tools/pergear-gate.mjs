import { chromium } from "playwright";
import { WORN_FIELDS, PLACE_FIELDS } from "../web/src/state/gear.mjs";

// 착용의 임자를 재는 자. 장비가 계정 하나에 붙어 있으면 누구를 세워도 같은 장갑을 끼고,
// 선수단은 이름만 다른 같은 사람 목록이 된다.
//
// 재는 것은 셋이다. 산 것이 지금 뛰는 사람에게만 붙는가, 교체하면 그 사람의 것으로 갈리는가,
// 그리고 서는 자리는 사람을 안 따라가는가.
//
// 마지막이 대조군이다. 골대와 동네까지 같이 갈리면 이 랩은 착용을 옮긴 것이 아니라
// 저장을 사람마다 통째로 복제한 것이고, 둘은 화면에서 구분되지 않는다.
const EXE = process.env.LOCALAPPDATA + "/ms-playwright/chromium-1228/chrome-win64/chrome.exe";
const LINE = String.fromCharCode(10);
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
  await p.goto("http://127.0.0.1:10310/web/index.html?seed=20&preset=rich,veteran", { waitUntil: "load" });
  await p.waitForSelector("#go", { timeout: 15000 });
  await p.click("#go", { force: true });
  await p.waitForTimeout(1300);

  const read = () => p.evaluate(() => window.__worn());
  const start = await read();
  // 시작 키퍼는 명단 밖 신규라 선수단 창에 줄이 없다. 오갈 수 있는 표본이 필요하므로
  // 명단에서 둘을 데려와 그 둘로 왕복한다. 신규 키퍼로 돌아갈 길이 없다는 것은 별도 항목이다.
  const hire = async () => {
    await p.evaluate(() => window.__roster(true));
    await p.waitForSelector("#roster .row button", { timeout: 8000 });
    // 영입 줄에서만 고른다. 보유 줄이 위에 서면서 첫 번째 눌리는 버튼이 이미 가진 사람이 됐다.
    await p.evaluate(() => {
      const b = [...document.querySelectorAll("#roster .row.hire button")].find((e) => !e.disabled);
      if (b) b.click();
    });
    await p.waitForTimeout(450);
    await p.evaluate(() => window.__roster(false));
    await p.waitForTimeout(180);
    // 이름은 화면 글자가 아니라 상태에서 읽는다. 버튼은 이름과 레벨과 안내를 한 덩어리로 들고 있어
    // 글자를 쪼개면 카드 문구가 바뀐 날 이 자가 엉뚱한 이름을 든다.
    return (await p.evaluate(() => window.__worn())).name;
  };
  const stand = async (name) => {
    await p.evaluate(() => window.__roster(true));
    await p.waitForSelector("#roster .row button", { timeout: 8000 });
    await p.evaluate((n) => {
      const b = [...document.querySelectorAll("#roster .row.mine button")].find((e) => e.textContent.indexOf(n) === 0);
      if (b) b.click();
    }, name);
    await p.waitForTimeout(450);
    await p.evaluate(() => window.__roster(false));
    await p.waitForTimeout(180);
  };
  const first = await hire();
  check("instrument:the-first-keeper-owns-a-worn-set", start.all.length === 1
    && WORN_FIELDS.every((f) => start.worn[f] === 0), JSON.stringify(start.worn));

  // 첫 키퍼에게 장갑과 축구화를 사 입힌다.
  await p.evaluate(() => window.__shop(true));
  await p.waitForTimeout(320);
  for (const tab of ["glove", "boot"]) {
    await p.click('#shop .tab[data-tab="' + tab + '"]', { force: true });
    await p.waitForSelector('#shop .card[data-spec="' + tab + '"]', { timeout: 8000 });
    await p.locator('#shop .buy[data-kind="' + tab + '"][data-rank="2"]').click({ force: true });
    await p.waitForTimeout(260);
  }
  // 골대도 하나 사서 장소가 사람을 안 따라가는 것을 나중에 맞댈 수 있게 둔다.
  await p.click('#shop .tab[data-tab="frame"]', { force: true });
  await p.waitForSelector('#shop .card[data-spec="frame"]', { timeout: 8000 });
  await p.locator('#shop .buy[data-kind="frame"][data-rank="2"]').click({ force: true });
  await p.waitForTimeout(260);
  await p.evaluate(() => window.__shop(false));
  await p.waitForTimeout(200);

  const dressed = await read();
  check("pergear:what-was-bought-lands-on-the-keeper-who-bought-it",
    dressed.worn.grip === 2 && dressed.worn.studs === 2, JSON.stringify(dressed.worn));
  check("pergear:the-place-is-not-worn", dressed.place.frame === 2 && PLACE_FIELDS.every((f) => dressed.worn[f] === undefined),
    JSON.stringify(dressed.place));

  // 명단에서 한 명 더 데려와 세운다.
  const hired = await hire();
  const swapped = await read();
  check("instrument:a-second-keeper-came-in", swapped.all.length === 3 && swapped.name === hired,
    swapped.all.length + " keepers, standing " + swapped.name);
  check("pergear:a-new-keeper-starts-bare", WORN_FIELDS.every((f) => swapped.worn[f] === 0), JSON.stringify(swapped.worn));
  check("pergear:the-first-keeper-keeps-what-it-bought",
    swapped.all[1].grip === 2 && swapped.all[1].studs === 2, JSON.stringify(swapped.all[1]));
  check("control:the-place-follows-nobody", swapped.place.frame === 2, JSON.stringify(swapped.place));

  // 앞사람으로 돌아가면 그 장갑이 돌아온다.
  await stand(first);
  const back = await read();
  check("pergear:coming-back-restores-that-keepers-kit",
    back.name === first && back.worn.grip === 2 && back.worn.studs === 2,
    back.name + " " + JSON.stringify(back.worn));

  // 저장을 거쳐도 사람마다 따로 남는가. 탭을 닫는 것과 같은 경로다.
  await p.reload({ waitUntil: "load" });
  await p.waitForSelector("#go", { timeout: 15000 });
  await p.click("#go", { force: true });
  await p.waitForTimeout(1300);
  const reborn = await read();
  check("pergear:the-save-carries-each-keepers-kit",
    reborn.all.length === 3 && reborn.all[1].grip === 2 && reborn.all[2].grip === 0,
    JSON.stringify(reborn.all));

  check("console:no-errors", errs.length === 0, errs.slice(0, 2).join(" | ") || "clean");
  await ctx.close();

  if (notes.length) console.log(notes.map((x) => "  ok   " + x).join(LINE));
  if (fails.length) console.log(fails.map((x) => "  FAIL " + x).join(LINE));
  console.log(fails.length ? "pergear FAIL " + fails.length : "pergear PASS " + notes.length);
  if (fails.length) process.exitCode = 1;
} finally {
  clearTimeout(t);
  if (b) await b.close();
}
