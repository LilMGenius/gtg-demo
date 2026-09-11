import { chromium } from "playwright";

// 훈련장 게이트. 성장 칸이 전부 상한에 닿았을 때 훈련이 사표가 되는가.
// 이 축은 파운더가 먼저 본 결함이다. 만렙에 닿은 저장을 어느 게이트도 입력으로 쓴 적이 없었다.
// 종단 상태는 주입 훅(?preset=maxed)으로 앞당기고, 판정식은 건드리지 않는다.
// 두 번째 축 무리는 격자가 화면 안에 있는가다. F3 6.7은 740x360에서 다섯째 열이 잘린다고 적었는데
// 실측은 그렇지 않았다. 카드의 오른끝은 그림자까지 725.78px이고 화면은 740px이라 14.22px이 남는다.
// 남은 사실은 기울기다. 그림자가 오른쪽 여백만 8px 먹어 왼쪽 22.20px 오른쪽 14.22px로 갈리고,
// 리포트는 그 기울기를 잘림으로 읽었다. 그래서 이 축은 잘림을 고치는 대신 잘리지 않음을 붙잡는다.
// 그림자는 레이아웃 상자 밖에 그려져서 rect만 재면 안 보인다. 계산된 box-shadow의 x 오프셋을 더한다.
const EXE = process.env.LOCALAPPDATA + "/ms-playwright/chromium-1228/chrome-win64/chrome.exe";
const BASE = "http://127.0.0.1:10310/web/index.html";
// 훈련 한 회의 환전 단가. wallet.mjs의 COIN_DRILL과 같은 값이어야 한다.
const COIN_DRILL = 24;
// 성장 칸 수. ledger.mjs GROWABLE의 길이다.
const SLOTS = 15;
// 성장 상한이 값 자리에 내는 글자. main.mjs 훈련장의 만렙 판정과 같은 값이어야 한다.
const CEIL_TEXT = "10";
// 상한 칸이 값과 꺼짐을 한 몸으로 들고 있는가. 심은 대조군이 같은 식을 다시 타야 한다.
const cappedOk = (rows) => rows.length === SLOTS && rows.every((r) => r.tail === CEIL_TEXT && r.off);
const t = setTimeout(() => { console.log("WATCHDOG"); process.exit(1); }, 150000);
t.unref();

const fails = [], notes = [];
const check = (n, ok, d) => (ok ? notes : fails).push(n + " " + d);
const shot = process.argv[2];

let b;
try {
  b = await chromium.launch({ executablePath: EXE });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } });
  const p = await ctx.newPage();
  const errs = [];
  p.on("pageerror", (e) => errs.push(String(e)));
  p.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });

  const gym = async () => p.evaluate(() => {
    const box = document.getElementById("gym");
    const rows = [...box.querySelectorAll(".row button")].map((x) => ({
      k: x.dataset.k, tail: x.querySelector("em").textContent, off: x.disabled,
    }));
    const sw = box.querySelector(".swap");
    return { head: box.querySelector("h4").textContent, rows, swap: sw ? { text: sw.textContent, off: sw.disabled } : null };
  });

  // 좁은 폭은 제 창을 따로 열어야 해서 부팅이 페이지를 받는다. 두 창이 같은 순서를 밟아야
  // 넓은 쪽과 좁은 쪽의 차이가 폭에서만 오고 진행 상태에서 오지 않는다.
  const bootOn = async (pg, q) => {
    await pg.goto(BASE + q, { waitUntil: "load" });
    await pg.evaluate(() => localStorage.clear());
    await pg.reload({ waitUntil: "load" });
    await pg.waitForTimeout(1200);
    await pg.click("#go", { force: true });
    await pg.waitForTimeout(1400);
    await pg.click("#gymBtn", { force: true });
    await pg.waitForTimeout(300);
  };
  const boot = (q) => bootOn(p, q);

  // 대조군. 주입이 없으면 성장 칸은 상한이 아니고, 환전 줄 자체가 화면에 없다.
  // 이게 없으면 본시험의 녹색은 화면이 늘 그렇게 생긴 것과 구분되지 않는다.
  await boot("?seed=20&preset=veteran");
  const plain = await gym();
  check("control:fresh-save-is-not-at-the-ceiling", plain.rows.every((r) => r.tail !== CEIL_TEXT), plain.rows.filter((r) => r.tail === CEIL_TEXT).length + "/" + plain.rows.length + " at the cap, first tail " + JSON.stringify(plain.rows[0] ? plain.rows[0].tail : ""));
  check("control:swap-row-is-absent-below-the-ceiling", plain.swap === null, plain.swap ? plain.swap.text : "absent");

  // 본시험. 만렙 저장에서 훈련장을 연다.
  await boot("?seed=20&preset=maxed,veteran");
  const applied = await p.evaluate(() => window.__preset);
  check("preset:maxed-was-applied", Array.isArray(applied) && applied.includes("maxed"), JSON.stringify(applied));
  const maxed = await gym();
  check("ceiling:every-slot-reads-max", maxed.rows.length === SLOTS && maxed.rows.every((r) => r.tail === CEIL_TEXT), maxed.rows.filter((r) => r.tail === CEIL_TEXT).length + "/" + maxed.rows.length);
  check("ceiling:every-slot-is-unclickable", maxed.rows.every((r) => r.off), maxed.rows.filter((r) => !r.off).map((r) => r.k).join(",") || "all off");
  /* 상한 칸이 화면에 내는 글자. 값 자리에는 값만 서고, 못 누른다는 사실은 버튼이 들고 있다.
     위 두 줄과 같은 표본을 보지만 묻는 것이 다르다. 저쪽은 열다섯이 다 상한인가이고,
     이쪽은 상한 칸 하나가 값과 꺼짐을 한 몸으로 들고 있는가다. */
  check("gym:a-capped-drill-shows-the-number-and-stays-disabled", cappedOk(maxed.rows),
    maxed.rows.filter((r) => r.tail === CEIL_TEXT && r.off).length + "/" + maxed.rows.length
    + " capped drills draw " + JSON.stringify(CEIL_TEXT) + " with the button disabled, first tail "
    + JSON.stringify(maxed.rows[0] ? maxed.rows[0].tail : "") + " off=" + (maxed.rows[0] ? maxed.rows[0].off : "none"));
  /* 대조군. 상한 칸 하나에 낱말을 심으면 위 축이 빨개져야 한다. 심고 곧바로 도로 뺀다.
     이게 없으면 위 줄의 초록은 판정식이 아무것도 안 재는 경우와 구분되지 않는다. */
  await p.evaluate(() => { const e = document.querySelector("#gym .row button em"); e.dataset.was = e.textContent; e.textContent = "MAX"; });
  const worded = await gym();
  await p.evaluate(() => { const e = document.querySelector("#gym .row button em"); e.textContent = e.dataset.was; delete e.dataset.was; });
  const wordBack = await gym();
  check("control:a-worded-tail-reddens-the-capped-drill-axis", !cappedOk(worded.rows) && cappedOk(wordBack.rows),
    "planting a word in one tail left " + worded.rows.filter((r) => r.tail === CEIL_TEXT && r.off).length + "/"
    + worded.rows.length + " capped, restored to "
    + wordBack.rows.filter((r) => r.tail === CEIL_TEXT && r.off).length + "/" + wordBack.rows.length);

  const before = await p.evaluate(() => ({ points: window.__points(), coin: window.__wallet().coin }));
  // 이 게이트의 산출물. 만렙에서 훈련이 사표가 되지 않고 환전으로 빠져나갈 문이 있는가.
  check("exit:swap-row-is-open-at-the-ceiling", maxed.swap !== null && !maxed.swap.off, maxed.swap ? maxed.swap.text + " off=" + maxed.swap.off : "absent");
  // 못 누르는 사유든 값이든 버튼 글자가 들고 있어야 한다. 환율을 화면 밖에서 알아낼 길은 없다.
  const want = String(before.points * COIN_DRILL);
  check("exit:swap-row-states-the-rate-in-its-own-text", !!maxed.swap && maxed.swap.text.includes("육수") && maxed.swap.text.includes(want), (maxed.swap ? maxed.swap.text : "absent") + " want " + want);

  await p.click("#gym .swap", { force: true });
  await p.waitForTimeout(400);
  const after = await p.evaluate(() => ({ points: window.__points(), coin: window.__wallet().coin }));
  check("exit:swap-drains-the-training-backlog", after.points === 0, String(after.points));
  check("exit:swap-pays-the-declared-rate", after.coin === before.coin + before.points * COIN_DRILL, before.coin + "+" + before.points * COIN_DRILL + " -> " + after.coin);
  const done = await gym();
  check("exit:spent-swap-row-says-why-it-is-dead", !!done.swap && done.swap.off && done.swap.text.includes("바꿀 훈련이 없다"), done.swap ? done.swap.text + " off=" + done.swap.off : "absent");

  // 카드 한 장의 오른끝. 레이아웃 상자에 그림자 x 오프셋을 더한 값이고, inset 그림자는 상자 안이라 뺀다.
  const edges = () => {
    const cards = [...document.querySelectorAll("#gym .row button")];
    let worst = -Infinity, who = "", left = Infinity;
    for (const el of cards) {
      const r = el.getBoundingClientRect();
      let dx = 0;
      for (const one of getComputedStyle(el).boxShadow.split(/,(?![^(]*\))/)) {
        if (/inset/.test(one)) continue;
        const m = one.match(/(-?[\d.]+)px\s+(-?[\d.]+)px\s+(-?[\d.]+)px(?:\s+(-?[\d.]+)px)?/);
        if (m) dx = Math.max(dx, +m[1] + +m[3] + (m[4] === undefined ? 0 : +m[4]));
      }
      const over = r.right + dx - innerWidth;
      if (over > worst) { worst = over; who = el.dataset.k || ""; }
      left = Math.min(left, r.left);
    }
    return { n: cards.length, worst: +worst.toFixed(2), who, left: +left.toFixed(2), iw: innerWidth };
  };
  const said = (e) => e.n + " cards, worst right edge " + (e.iw + e.worst).toFixed(2) + " of " + e.iw + " on " + e.who +
    " (" + (e.worst > 0 ? "over by " + e.worst.toFixed(2) : "clear by " + (-e.worst).toFixed(2)) + "px), left " + e.left;
  const inside = (e) => e.n === SLOTS && e.worst <= 0 && e.left >= 0;

  // 본시험. 리포트가 찍은 화면과 같은 740x360이다.
  const mob = await b.newContext({ viewport: { width: 740, height: 360 }, deviceScaleFactor: 2 });
  const mp = await mob.newPage();
  mp.on("pageerror", (e) => errs.push(String(e)));
  mp.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
  // 상한 주입은 이 축과 상관이 없다. 리포트가 판정한 그 화면을 그대로 다시 세워야
  // 이 게이트가 찍는 그림이 10-gym-740.png와 같은 자리에서 비교된다.
  await bootOn(mp, "?seed=20&preset=veteran");
  // 커서가 카드 위에 남으면 hover 그림자(8px 10px)가 섞인다. 재기 전에 화면 밖으로 뺀다.
  await mp.mouse.move(2, 2);
  await mp.waitForTimeout(150);
  const narrow = await mp.evaluate(edges);
  check("gym:every-card-and-its-shadow-stays-inside-the-viewport-at-740x360", inside(narrow), said(narrow));
  /* 창이 열리면 두 조작 기둥은 화면 밖으로 나가고 재화 띠만 물 아래 남는다. 그러면 훈련장의 첫 줄은
     띠 아래에서 시작해야 한다. 띠의 바닥은 --strip-b가 정하지만 레벨 칩이 그 상자 밖으로 내려오므로,
     토큰과 실제 잉크 중 아래쪽을 바닥으로 읽는다(실측 740x360: 토큰 63, 상자 65.16, 잉크 67.5).
     F3 6.5가 남긴 잔여물이 이 자리다. 제목 상자가 5.46에 서서 셋째 칩의 가로 312~332를 물었고,
     같은 비교자로 칩 잉크의 18.22퍼센트가 제목과 같이 움직였다. */
  const column = () => {
    const rnd = (n) => Math.round(n * 100) / 100;
    const g = document.getElementById("gym");
    const strip = document.getElementById("top");
    let ink = strip.getBoundingClientRect().bottom;
    for (const el of strip.querySelectorAll("*")) ink = Math.max(ink, el.getBoundingClientRect().bottom);
    // 토큰은 계산식이라 글자로는 못 읽는다. 같은 식을 키로 받는 상자를 하나 세워 풀린 px을 받는다.
    const probe = document.createElement("div");
    probe.style.cssText = "position:absolute;top:0;left:0;width:1px;height:var(--strip-b);visibility:hidden";
    document.body.append(probe);
    const token = probe.getBoundingClientRect().height;
    probe.remove();
    const head = g.querySelector("h4").getBoundingClientRect();
    const close = g.querySelector(".close").getBoundingClientRect();
    const mid = document.elementFromPoint((close.left + close.right) / 2, (close.top + close.bottom) / 2);
    /* 굴러간다는 자국. 그늘은 opacity로 켜지고 꺼지므로 있고 없고가 아니라 그려졌는가를 읽는다.
       높이를 같이 보는 것은 대조군이 겹을 display로 걷어도 붙어 있던 opacity는 1로 남아서다. */
    const sign = g.querySelector(":scope > .cue.down");
    const cueH = sign ? rnd(sign.getBoundingClientRect().height) : 0;
    return { token: rnd(token), ink: rnd(ink), floor: rnd(Math.max(token, ink)), head: rnd(head.top),
      close: rnd(close.bottom), spare: rnd(innerHeight - close.bottom), ih: innerHeight,
      top: rnd(g.scrollTop), over: rnd(g.scrollHeight - g.clientHeight), rolls: g.scrollHeight > g.clientHeight,
      cue: Boolean(sign) && cueH > 0 && Number(getComputedStyle(sign).opacity) > 0.5, cueH,
      hit: mid ? mid.tagName + "." + String(mid.className) : "none" };
  };
  const below = (c) => c.head >= c.floor;
  const reach = (c) => c.spare >= 8 && c.hit === "BUTTON.close";
  /* 쉼 자리의 닫기. 화면 안에 서 있으면 그것으로 끝이고, 접힘 아래로 내려갔다면 굴러간다는 자국이
     켜져 있을 때만 봐준다. 자국이 없으면 나갈 길이 있다는 것을 사람이 알 방법이 없다. */
  const allowed = (c) => reach(c) || (c.rolls && c.cue);
  // 자국은 구르는 화면에서만 선다. 안 구르는 화면에서 켜지면 그 그늘은 거짓말이다.
  const rested = (c) => c.top === 0 && c.cue === c.rolls;
  const saidHead = (c) => "title top " + c.head + " against strip bottom " + c.floor + " (token " + c.token + ", ink " + c.ink + "), "
    + (below(c) ? "clear by " + (c.head - c.floor).toFixed(2) : "under by " + (c.floor - c.head).toFixed(2)) + "px";
  const saidClose = (c) => "close bottom " + c.close + " of " + c.ih + ", spare " + c.spare + "px of 8, hit " + c.hit
    + (reach(c) ? "" : ", below the fold with the cue " + (c.cue ? "on" : "off"));
  const saidCue = (c) => "scrollTop " + c.top + ", " + (c.rolls ? "rolls " + c.over + "px past the fold" : "does not roll")
    + ", cue " + (c.cue ? "on" : "off") + " " + c.cueH + "px";
  const col = await mp.evaluate(column);
  /* 두 번째 740. 씨앗과 순서는 위와 같고 주입만 다르다. 성장 칸이 전부 상한이면 환전 줄이 한 칸 더
     붙어 기둥이 화면보다 길어지고, 그때부터 이 창이 제 스크롤로 받는다. 이 게이트는 그 상태를 한 번도
     안 세웠다. 위의 두 축은 안 구르는 화면에서만 초록이었고, 사람이 닫기에 닿으려면 반드시 지나야
     하는 자리를 아무도 안 쟀다. */
  const roll = await b.newContext({ viewport: { width: 740, height: 360 }, deviceScaleFactor: 2 });
  const rp = await roll.newPage();
  rp.on("pageerror", (e) => errs.push(String(e)));
  rp.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
  await bootOn(rp, "?seed=20&preset=maxed,veteran");
  await rp.mouse.move(2, 2);
  await rp.waitForTimeout(150);
  const ceil = await rp.evaluate(column);
  if (shot) await rp.screenshot({ path: shot.replace(/\.png$/, "") + "-740-maxed.png" });
  check("gym:the-title-starts-below-the-status-strip-at-740", below(col) && below(ceil), "plain " + saidHead(col) + " | ceiling " + saidHead(ceil));
  // 닫기는 이 창의 유일한 출구다. 띠만큼 기둥을 내리면 아래끝이 화면 밖으로 나갈 수 있으므로, 상자의
  // 아래끝과 그 가운데를 짚는 손이 같이 녹색이거나, 그 아래에 더 있다는 자국이 켜져 있어야 한다.
  check("gym:the-close-button-stays-inside-the-viewport-at-740", allowed(col) && allowed(ceil), "plain " + saidClose(col) + " | ceiling " + saidClose(ceil));
  check("gym:a-rolling-gym-shows-its-cue-at-rest", rested(col) && rested(ceil), "ceiling " + saidCue(ceil) + " | plain " + saidCue(col));
  /* 끝까지 굴린 자리. 휠로 밀면 마지막 한 칸이 남았는지 끝인지를 이 게이트가 못 가리므로, 굴림값을
     상한까지 밀어 브라우저가 소수 자리까지 맞추게 둔다. */
  await rp.evaluate(() => { const g = document.getElementById("gym"); g.scrollTop = g.scrollHeight; });
  await rp.waitForTimeout(200);
  const rolled = await rp.evaluate(column);
  check("gym:the-close-button-is-reachable-after-the-roll", reach(rolled), saidClose(rolled) + ", " + saidCue(rolled));
  /* 음성 대조군. 자국 한 겹을 걷으면 쉼 자리의 두 축이 같이 빨개져야 한다. 걷고 곧바로 도로 붙인다.
     이게 없으면 위 두 줄의 초록은 판정식이 아무것도 안 재는 경우와 구분되지 않는다. */
  await rp.evaluate(() => { document.getElementById("gym").scrollTop = 0; });
  await rp.waitForTimeout(200);
  const blind = await rp.addStyleTag({ content: "#gym > .cue.down{display:none}" });
  await rp.waitForTimeout(150);
  const blinded = await rp.evaluate(column);
  await blind.evaluate((n) => n.remove());
  await rp.waitForTimeout(150);
  const lit = await rp.evaluate(column);
  check("control:hiding-the-cue-reddens-the-resting-gym", !rested(blinded) && !allowed(blinded) && rested(lit) && allowed(lit),
    "planted " + saidCue(blinded) + " / " + saidClose(blinded) + " | restored " + saidCue(lit) + " / " + saidClose(lit));
  await roll.close();
  /* 살아 있는 크기 변화. 위의 두 문맥은 좁은 화면으로 부팅해서 그릴 때 한 번 센 값을 보는데, 사람이
     창을 열어 둔 채로 화면을 줄이면 아무도 다시 안 센다. 1280x720에서 훈련장을 열면 기둥이 화면 안에
     들어와 자국이 꺼져 있고, 거기서 740x360으로 줄이면 기둥이 접힘을 넘는다. 굴리지도 다시 그리지도
     않는다. 겹을 걷어 빨갛게 만드는 대조군을 여기에는 못 심는다. 관찰자를 밖에서 끊을 손잡이가 없다.
     그래서 앞뒤 한 쌍으로 대신한다. 줄이기 전의 꺼짐과 줄인 뒤의 켜짐을 같이 적고, 그 사이에 굴림
     사건이 하나도 안 났다는 것과 창이 다시 안 그려졌다는 것을 같이 적는다. 심은 것이 아니라 앞뒤
     한 쌍이라 이름을 instrument로 적는다. */
  const live = await b.newContext({ viewport: { width: 1280, height: 720 } });
  const lp = await live.newPage();
  lp.on("pageerror", (e) => errs.push(String(e)));
  lp.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
  await bootOn(lp, "?seed=20&preset=maxed,veteran");
  await lp.mouse.move(2, 2);
  /* 굴림 사건을 여기서 센다. 자국이 켜진 이유가 크기 변화인지 굴림인지를 이 수 하나가 가른다.
     닫기에 표를 하나 남기는 것은 다시 그림을 잡기 위해서다. 다시 그리면 innerHTML이 갈려 표가 사라진다. */
  await lp.evaluate(() => {
    const g = document.getElementById("gym");
    g.dataset.gateScrolls = "0";
    g.addEventListener("scroll", () => { g.dataset.gateScrolls = String(Number(g.dataset.gateScrolls) + 1); });
    g.querySelector(".close").dataset.gateMark = "1";
  });
  await lp.waitForTimeout(150);
  const roomy = await lp.evaluate(column);
  await lp.setViewportSize({ width: 740, height: 360 });
  /* 관찰자는 다음 프레임에 깬다. 정해진 시간을 기다리면 느린 기계에서 아직 안 깬 것을 없는 것으로
     읽으므로, 프레임마다 자국을 보고 켜지는 순간 끝낸다. 안 켜지면 짧게 포기하고 그대로 잰다. */
  const woke = await lp.waitForFunction(() => {
    const s = document.getElementById("gym").querySelector(":scope > .cue.down");
    return Boolean(s) && s.getBoundingClientRect().height > 0 && Number(getComputedStyle(s).opacity) > 0.5;
  }, null, { polling: "raf", timeout: 1500 }).then(() => true).catch(() => false);
  const shrunk = await lp.evaluate(column);
  const trace = await lp.evaluate(() => {
    const g = document.getElementById("gym");
    const c = g.querySelector(".close");
    return { scrolls: Number(g.dataset.gateScrolls), redrawn: !(c && c.dataset.gateMark === "1") };
  });
  await live.close();
  check("gym:a-resize-onto-a-short-viewport-relights-the-cue", shrunk.rolls && shrunk.cue && shrunk.top === 0,
    "1280x720 " + saidCue(roomy) + " -> 740x360 " + saidCue(shrunk) + ", "
    + (woke ? "lit inside the raf wait" : "still dark after 1500ms") + ", " + saidClose(shrunk));
  check("instrument:the-cue-was-off-before-the-resize-and-nothing-scrolled-or-redrew",
    !roomy.cue && !roomy.rolls && trace.scrolls === 0 && !trace.redrawn,
    "before " + saidCue(roomy) + " | after " + saidCue(shrunk) + ", scroll events " + trace.scrolls
    + ", panel " + (trace.redrawn ? "was redrawn" : "was not redrawn"));
  // 음성 대조군. 위 여백을 도로 걷으면 제목이 띠 밑으로 들어가야 한다.
  // 이게 없으면 위 축의 녹색은 판정식이 아무것도 안 재는 경우와 구분되지 않는다.
  const bald = await mp.addStyleTag({ content: "#gym{padding-top:0}" });
  await mp.waitForTimeout(150);
  const plantedTop = await mp.evaluate(column);
  await bald.evaluate((n) => n.remove());
  await mp.waitForTimeout(150);
  const restoredTop = await mp.evaluate(column);
  check("control:stripping-the-top-padding-buries-the-title-under-the-strip", !below(plantedTop) && below(restoredTop),
    "planted " + saidHead(plantedTop) + " | restored " + saidHead(restoredTop));
  if (shot) await mp.screenshot({ path: shot.replace(/\.png$/, "") + "-740.png" });
  await mob.close();

  // 대조군. 같은 판정식이 1280x720에서도 통과해야 이 축이 폭 하나에만 붙은 것이 아니다.
  await p.mouse.move(2, 2);
  await p.waitForTimeout(150);
  const wide = await p.evaluate(edges);
  check("control:every-card-and-its-shadow-stays-inside-the-viewport-at-1280x720", inside(wide), said(wide));

  // 음성 대조군. 폭을 억지로 늘려 카드를 화면 밖으로 밀고, 판정식이 그때 실제로 빨개지는지 본다.
  // 이게 없으면 위 두 줄의 녹색은 판정식이 아무것도 안 재는 경우와 구분되지 않는다.
  await p.evaluate(() => {
    const s = document.createElement("style");
    s.id = "plant";
    s.textContent = "#gym .row{width:calc(100vw + 120px)}";
    document.head.append(s);
  });
  await p.waitForTimeout(150);
  const planted = await p.evaluate(edges);
  await p.evaluate(() => document.getElementById("plant").remove());
  await p.waitForTimeout(150);
  const back = await p.evaluate(edges);
  check("control:planted-width-pushes-a-card-past-the-viewport-edge", !inside(planted) && inside(back),
    "planted " + said(planted) + " | restored " + said(back));

  if (shot) await p.screenshot({ path: shot });
  check("console:no-errors", errs.length === 0, errs.slice(0, 3).join(" | ") || "clean");

  console.log(notes.map((s) => "  ok   " + s).join("\n"));
  if (fails.length) console.log(fails.map((s) => "  FAIL " + s).join("\n"));
  console.log(fails.length ? "gym FAIL " + fails.length : "gym PASS " + notes.length);
  if (fails.length) process.exitCode = 1;
} finally {
  clearTimeout(t);
  if (b) await b.close();
}
