import { chromium } from "playwright";

// 계정의 자. 저장 자리가 브라우저 하나에 하나뿐이라 같은 기기를 쓰는 두 사람이 한 판을 나눠 썼고,
// 화면 어디에도 누가 하는 판인지가 없었다. 스토어에 올릴 물건에는 그 칸이 있어야 한다.
//
// 축은 넷이다. 가입이 서는가, 잘못된 값을 거절하는가, 판이 계정마다 갈리는가,
// 로그아웃하면 다시 묻는가. 셋째가 핵이다. 앞의 셋이 다 돼도 저장이 한 자리면 계정은 장식이다.
// 대조군은 같은 계정으로 다시 들어가는 것이다. 갈리기만 하고 안 돌아오면 그것은 삭제다.
const EXE = process.env.LOCALAPPDATA + "/ms-playwright/chromium-1228/chrome-win64/chrome.exe";
const BASE = "http://127.0.0.1:10310/web/index.html?seed=20";
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
  p.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });

  const open = async () => {
    await p.goto(BASE, { waitUntil: "load" });
    await p.waitForSelector("#gate", { timeout: 15000 });
    await p.waitForTimeout(300);
  };
  const signUp = async (id, pw, nick) => {
    await p.click("#aup");
    await p.fill("#aid", id);
    await p.fill("#apw", pw);
    await p.fill("#anick", nick);
    await p.click("#ain");
    await p.waitForTimeout(1200);
  };
  const logIn = async (id, pw) => {
    await p.fill("#aid", id);
    await p.fill("#apw", pw);
    await p.click("#ain");
    await p.waitForTimeout(1200);
  };
  const start = async () => {
    // 시작은 언제나 같은 버튼이다. 계정 칸은 이름을 정하는 자리이지 문이 아니다.
    // 시작 버튼은 흔들리는 중이라 안정될 때까지 기다리면 영영 못 누른다. 다른 계기들과 같이 force로 누른다.
    await p.click("#go", { force: true });
    await p.waitForTimeout(900);
  };
  const said = () => p.evaluate(() => {
    const e = document.getElementById("asay");
    return e && !e.hidden ? e.textContent.trim() : "";
  });
  const whoNow = () => p.evaluate(() => {
    const e = document.querySelector("#gate .who");
    return e && !e.hidden ? e.textContent.trim() : "";
  });

  await open();
  // 처음 오면 아이디와 비밀번호를 묻는다. 시작 버튼은 그 뒤에 선다.
  const first = await p.evaluate(() => ({
    gate: !document.getElementById("gate").hidden,
    id: !document.getElementById("aid").hidden,
    go: document.getElementById("go").offsetParent !== null
  }));
  check("account:a-new-visitor-is-offered-a-name",
    first.gate && first.id && first.go,
    "gate " + first.gate + ", id asked " + first.id + ", start still there " + first.go);

  /* 계정 없이 눌러도 판은 열린다. 첫 화면이 로그인 폼이면 방치형에서 그 자리가 이탈 지점이고,
     계기 아흔 곳도 사람과 다른 문으로 들어가게 된다. 대신 그 자리에서 손님 계정이 서야 한다. */
  await start();
  const guest = await p.evaluate(() => localStorage.getItem("gtg.session.v1"));
  check("account:starting-without-one-still-makes-an-account", Boolean(guest), String(guest));
  await p.evaluate(() => { localStorage.removeItem("gtg.session.v1"); });
  await open();

  // 거절. 짧은 비밀번호는 안 받는다. 받아 두고 나중에 고치면 그 계정은 영영 약하다.
  await p.click("#aup");
  await p.fill("#aid", "bran");
  await p.fill("#apw", "1");
  await p.fill("#anick", "브란");
  await p.click("#ain");
  await p.waitForTimeout(300);
  check("account:a-weak-password-is-refused", (await said()).length > 0, await said());

  await p.fill("#apw", "pass12");
  await p.click("#ain");
  await p.waitForTimeout(1300);
  check("account:signing-up-names-the-player", (await whoNow()).indexOf("브란") >= 0, await whoNow());

  // 같은 아이디는 두 번 안 받는다. 덮어쓰면 남의 판이 사라진다.
  await p.evaluate(() => { localStorage.removeItem("gtg.session.v1"); });
  await open();
  await signUp("bran", "other9", "다른사람");
  check("account:an-id-cannot-be-taken-twice", (await said()).length > 0, await said());

  /* 판이 갈리는가. 첫 계정으로 들어가 육수를 심고, 둘째 계정으로 들어가 그 값이 안 보이면 갈린 것이다.
     그리고 첫 계정으로 돌아가 값이 그대로면 갈린 것이지 지운 것이 아니다. */
  await open();
  await logIn("bran", "pass12");
  await start();
  await p.evaluate(() => { window.__wallet().coin = 4242; window.__persist(); });
  await p.waitForTimeout(300);
  const mine = await p.evaluate(() => window.__wallet().coin);

  await p.evaluate(() => { localStorage.removeItem("gtg.session.v1"); });
  await open();
  await signUp("mate", "pass34", "동거인");
  await start();
  const theirs = await p.evaluate(() => window.__wallet().coin);
  check("account:two-accounts-do-not-share-one-save", mine === 4242 && theirs !== 4242,
    "mine " + mine + ", theirs " + theirs);

  await p.evaluate(() => { localStorage.removeItem("gtg.session.v1"); });
  await open();
  await logIn("bran", "pass12");
  await start();
  const backAgain = await p.evaluate(() => window.__wallet().coin);
  check("control:coming-back-to-an-account-finds-its-save", backAgain === 4242,
    "found " + backAgain);

  // 로그아웃하면 다시 묻는다.
  await open();
  await p.click("#aup");
  await p.waitForTimeout(1200);
  const after = await p.evaluate(() => ({
    who: document.querySelector("#gate .who").hidden,
    id: !document.getElementById("aid").hidden
  }));
  check("account:logging-out-asks-again", after.who && after.id,
    "name hidden " + after.who + ", id asked " + after.id);

  check("console:no-errors", errs.length === 0, errs.slice(0, 2).join(" | ") || "clean");
  await ctx.close();
} finally {
  clearTimeout(t);
  if (b) await b.close();
}

if (notes.length) console.log(notes.map((x) => "  ok   " + x).join(LINE));
if (fails.length) console.log(fails.map((x) => "  FAIL " + x).join(LINE));
console.log(fails.length ? "account FAIL " + fails.length : "account PASS " + notes.length);
if (fails.length) process.exitCode = 1;
