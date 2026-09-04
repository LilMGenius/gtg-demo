import { chromium } from "playwright";

// 사기 전에 걸쳐 볼 수 있는지 재는 자.
// 꾸미는 재미로 하는 게임에서 값을 치른 뒤에야 자기 모습을 보는 것은 순서가 뒤집힌 것이다.
//
// 가장 중요한 축은 걸쳐 보는 것이 돈을 안 쓰는가다. 시착용이 조용히 결제가 되면
// 눌러 보는 행위 자체가 함정이 되고, 그 손해는 되돌릴 방법이 없다.
const EXE = process.env.LOCALAPPDATA + "/ms-playwright/chromium-1228/chrome-win64/chrome.exe";
const BASE = "http://127.0.0.1:10310/web/index.html?seed=20&preset=rich";
const LINE = String.fromCharCode(10);
const t = setTimeout(() => { console.log("WATCHDOG"); process.exit(1); }, 180000);
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
  await p.goto(BASE, { waitUntil: "load" });
  await p.waitForSelector("#go", { timeout: 15000 });
  await p.click("#go", { force: true });
  await p.waitForTimeout(1300);
  await p.evaluate(() => window.__shop(true));
  await p.waitForTimeout(400);

  const shot = () => p.evaluate(() => { const i = document.querySelector("#shop .fitting .me img"); return i ? i.getAttribute("src") : ""; });
  const coin = () => p.evaluate(() => window.__squad().coin);
  const tap = (n) => p.evaluate((k) => { const c = [...document.querySelectorAll("#shop .rack .card")]; if (c[k]) c[k].click(); }, n);
  const tab = (t) => p.evaluate((x) => { for (const b of document.querySelectorAll("#shop .tab")) if (b.dataset.tab === x) b.click(); }, t);
  // 값은 버튼이 들고 있는 데이터에서 읽는다. 그려진 글자에는 천 단위 쉼표와 아이콘 이름이 섞여
  // 파싱이 값을 잘못 읽는다. 축은 그대로 버튼이 부르는 값이다.
  const bill = () => p.evaluate(() => { const b = document.querySelector("#shop .fitting .all"); const c = b ? b.querySelector(".px[data-coin]") : null; return { label: b ? b.textContent.trim() : "", coin: c ? Number(c.dataset.coin) : null, off: b ? b.disabled : true, rows: document.querySelectorAll("#shop .fitting .tried i:not(.dim)").length }; });

  await tab("glove");
  await p.waitForTimeout(400);
  const bare = await shot();
  const purse0 = await coin();
  check("instrument:the-fitting-room-drew-someone", bare.indexOf("data:image") === 0, bare.slice(0, 16) + " " + bare.length + " chars");

  await tap(3);
  await p.waitForTimeout(450);
  const worn = await shot();
  const purse1 = await coin();
  const billed = await bill();
  check("fit:pressing-a-card-changes-the-body", worn !== bare, worn === bare ? "same picture" : "picture changed");
  check("fit:trying-on-spends-nothing", purse1 === purse0, purse0 + " then " + purse1);
  check("fit:the-tried-item-is-listed", billed.rows === 1, billed.rows + " rows, button " + JSON.stringify(billed.label));

  // 대조군. 같은 칸을 다시 누르면 벗는다. 벗은 뒤의 그림이 처음과 같아야
  // 위의 그림 변화가 시착용 때문이지 그리는 잡음 때문이 아니다.
  await tap(3);
  await p.waitForTimeout(450);
  const off = await shot();
  const billedOff = await bill();
  check("control:pressing-again-takes-it-off", off === bare, off === bare ? "back to the bare picture" : "did not return");
  check("control:the-list-empties-when-nothing-is-tried", billedOff.rows === 0 && billedOff.off === true, billedOff.rows + " rows, disabled " + billedOff.off);

  // 두 칸을 걸치고 값을 맞댄다. 버튼이 부르는 값이 선반 값의 합이어야 한다.
  await tap(3);
  await p.waitForTimeout(380);
  await tab("kit");
  await p.waitForTimeout(380);
  await tap(3);
  await p.waitForTimeout(450);
  const two = await bill();
  const want = await p.evaluate(async () => {
    const g = await import("/web/src/state/gear.mjs");
    return g.gloveAt(3).cost + g.kitAt(3).cost;
  });
  check("fit:the-bill-is-the-sum-of-the-shelf-prices", two.coin === want, two.coin + " want " + want);
  check("fit:both-tried-items-are-listed", two.rows === 2, two.rows + " rows");

  // 창이 열려 있어도 판은 계속 굴러가고 완봉 보상이 지갑에 들어온다.
  // 사기 전후를 그냥 맞대면 그 사이 벌어들인 몫이 결제액으로 읽힌다.
  // 실측으로 1670을 결제한 회차가 1666으로 잡혔다. 판을 세워 놓고 재야 이 축이 결제만 본다.
  await p.evaluate(() => window.__fixedStep(0.000001));
  await p.waitForTimeout(200);
  const idle = await coin();
  await p.waitForTimeout(700);
  const stillIdle = await coin();
  const before = await coin();
  await p.evaluate(() => { const a = document.querySelector("#shop .fitting .all"); if (a && !a.disabled) a.click(); });
  await p.waitForTimeout(600);
  const after = await coin();
  await p.evaluate(() => window.__fixedStep(0));
  // 대조군. 판을 세운 동안 아무것도 안 사면 잔고가 한 푼도 안 움직여야 한다.
  // 안 멈췄으면 위의 차액에 배경 수입이 섞여 있고, 그 축은 결제를 재는 것이 아니다.
  check("control:the-wallet-holds-still-while-the-world-is-stopped", idle === stillIdle, idle + " then " + stillIdle);
  const done = await bill();
  check("fit:buying-everything-charges-the-bill-once", before - after === want, before + " minus " + after + " is " + (before - after) + ", want " + want);
  check("fit:the-fitting-empties-after-buying", done.rows === 0, done.rows + " rows left");
  check("console:no-errors", errs.length === 0, errs.slice(0, 2).join(" | ") || "clean");
  await ctx.close();

  if (notes.length) console.log(notes.map((x) => "  ok   " + x).join(LINE));
  if (fails.length) console.log(fails.map((x) => "  FAIL " + x).join(LINE));
  console.log(fails.length ? "fit FAIL " + fails.length : "fit PASS " + notes.length);
  if (fails.length) process.exitCode = 1;
} finally {
  clearTimeout(t);
  if (b) await b.close();
}
