import { chromium } from "playwright";

// 머리가 몸통 안에 잠겼는지 재는 자.
// 상의 등급은 몸통을 세로로 늘린다. 목 자리를 원래 기장으로 두면 늘어난 옷이 머리를 삼키고,
// 실측으로 시작 상의에서 정수리가 몸통 꼭대기보다 0.05m 아래였다. 헤어와 얼굴이 실루엣에서
// 사라진 상태인데 포즈 게이트도 표정 게이트도 이것을 못 봤다. 둘 다 머리가 거기 있다고 전제한다.
//
// 축은 둘이고 둘 다 월드 좌표다. 정수리가 몸통 꼭대기 위에 있는가, 눈이 그 위에 있는가.
// 화면 몫으로 재려다 한 번 틀렸다. 격자를 키퍼 상자에 맞추면 품 넓은 옷이 상자를 키우고,
// 그러면 같은 머리가 더 적은 칸을 가진다. 실측으로 등급 사이 몫이 1.57배 갈렸는데 그 갈림은
// 머리가 아니라 상자의 것이었다. 세 등급의 눈 높이는 그 사이에도 흔들리지 않았다.
// 대조군은 둘이다. 머리를 레이어 밖으로 내보내면 머리 칸이 0이 되고, 옷 등급이 실제로 갈린다.
const EXE = process.env.LOCALAPPDATA + "/ms-playwright/chromium-1228/chrome-win64/chrome.exe";
const BASE = "http://127.0.0.1:10310/web/index.html?seed=20";
const GRADES = [0, 1, 2, 3];
const LINE = String.fromCharCode(10);
const t = setTimeout(() => { console.log("WATCHDOG"); process.exit(1); }, 180000);
t.unref();

const fails = [], notes = [];
const check = (n, ok, d) => (ok ? notes : fails).push(n + " " + d);

let b;
try {
  b = await chromium.launch({ executablePath: EXE });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } });
  const errs = [];
  const read = async (pads) => {
    const p = await ctx.newPage();
    p.on("pageerror", (e) => errs.push(String(e)));
    p.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
    // 저장은 페이지 스크립트보다 먼저 심어야 한다. 뒤에 심으면 이미 읽힌 뒤다.
    await p.addInitScript((g) => {
      localStorage.setItem("gtg.save.v1", JSON.stringify({
        // 저장 판독기는 레벨이 있는 키퍼가 없으면 통째로 버린다. 장비만 심으면 아무것도 안 심긴다.
        keeper: { level: 1, name: "동네형" },
        gear: { grip: 0, studs: 0, pads: g, socks: 0, hair: 0, ink: 0, frame: 0, city: 0 },
        at: Date.now()
      }));
    }, pads);
    await p.goto(BASE, { waitUntil: "load" });
    await p.waitForSelector("#go", { timeout: 15000 });
    await p.click("#go", { force: true });
    await p.waitForTimeout(1200);
    const on = await p.evaluate(() => window.__headVis(40));
    await p.evaluate(() => window.__headHide(true));
    const off = await p.evaluate(() => window.__headVis(40));
    await p.evaluate(() => window.__headHide(false));
    const gear = await p.evaluate(() => window.__gear());
    await p.close();
    return { pads, on, off, worn: gear.pads };
  };

  const got = [];
  for (const g of GRADES) got.push(await read(g));

  check("instrument:the-probe-found-a-head-and-a-body",
    got.every((r) => r.on.head > 0 && r.on.body > 0),
    got.map((r) => r.pads + " " + r.on.head + "/" + r.on.body).join(", "));
  check("instrument:the-shirt-grade-actually-changed",
    got.every((r) => r.worn === r.pads),
    got.map((r) => r.pads + " worn " + r.worn).join(", "));
  check("control:hiding-the-head-empties-its-count",
    got.every((r) => r.off.head === 0),
    got.map((r) => r.pads + " " + r.off.head).join(", "));
  check("headroom:the-crown-clears-the-shirt",
    got.every((r) => r.on.rise > 0),
    got.map((r) => r.pads + " rise " + r.on.rise.toFixed(3)).join(", "));
  check("headroom:the-eyes-clear-the-shirt",
    got.every((r) => r.on.eyeRise > 0),
    got.map((r) => r.pads + " eyes " + r.on.eyeRise.toFixed(3)).join(", "));
  check("console:no-errors", errs.length === 0, errs.slice(0, 2).join(" | ") || "clean");
  await ctx.close();

  if (notes.length) console.log(notes.map((x) => "  ok   " + x).join(LINE));
  if (fails.length) console.log(fails.map((x) => "  FAIL " + x).join(LINE));
  console.log(fails.length ? "headroom FAIL " + fails.length : "headroom PASS " + notes.length);
  if (fails.length) process.exitCode = 1;
} finally {
  clearTimeout(t);
  if (b) await b.close();
}
