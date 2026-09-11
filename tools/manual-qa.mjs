import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/* 사람이 겪는 첫 판 한 바퀴를 그대로 돌며 표면마다 그림과 수치를 남기는 드라이버다.
   게이트가 아니라서 판정을 안 내린다. 무엇을 눌렀고 그때 화면에 무엇이 있었는지만 적고,
   합격은 그림을 본 사람이 정한다. 같은 질문에 두 번 답하는 임시 파일로 두면 랩마다 새로 짜게 되고,
   그때 나온 수는 지난 랩의 수와 나란히 못 놓는다. 그래서 추적되는 계기로 둔다.
   네 모드가 한 파일인 것은 가입부터 위키까지의 차례가 모드마다 같아서다. 떼어 놓으면 같은 차례가
   네 번 적히고, 한 곳을 고친 랩이 나머지 셋을 안 고친 채 지나간다.
   판을 굴리는 것은 실제 포인터뿐이다. window.__* 는 재기만 하고 화면을 안 움직인다. */

const HERE = dirname(fileURLToPath(import.meta.url));
// 증거는 언제나 이 레포의 .omo 아래다. 상대경로로 만들면 부른 자리에 따라 엉뚱한 루트에 떨어진다.
const OUT = join(dirname(HERE), ".omo", "evidence", "F3");
const EXE = process.env.LOCALAPPDATA + "/ms-playwright/chromium-1228/chrome-win64/chrome.exe";
// 게이트가 쓰는 주소와 시드 그대로다. 시드를 고정해야 같은 키커가 같은 차례로 와서 랩끼리 수가 비교된다.
const BASE = "http://127.0.0.1:10310/web/index.html?seed=20";
// 한 모드가 통째로 도는 상한. 실측으로 한 바퀴가 3분 언저리라 그 세 배를 두고, 9분 벽 아래에 둔다.
const WATCH_MS = 520000;
// 한 번의 기다림 상한. 가장 긴 한 구가 자막까지 24초라 그보다 길고, 한 호출이 90초를 안 넘는다.
const STEP_MS = 26000;
// 전사 한 장의 한 변 상한. 여러 장이 실린 요청은 2000을 넘는 변 하나로 세션이 죽으므로 그 아래서 자른다.
const MAX_SIDE = 1600;
// 카드가 지나는 마지막 단. 길이는 제품의 STAGE_MS가 정하고 계기는 그 수를 마주 든다.
const STAGE_LAST = 4;
// 한 판은 다섯 구다. 판정이 세는 수와 같은 수를 세야 판이 끝난 자리에서 그림을 찍는다.
const BALLS = 5;
// 걸음 한 장을 찾으려고 훑는 횟수와 간격. 24 x 90ms면 막고 돌아오는 2초 남짓을 덮는다.
const WALK_N = 64;
const WALK_MS = 90;
const LINE = String.fromCharCode(10);

/* 모드 넷. desk와 mob이 파운더가 말한 두 뷰포트이고, bot은 지갑이 찬 사람만 걸을 수 있는 구매와
   봇 다리를 맡고, zoom은 조각만 2배로 떠서 얼굴과 썸네일을 가까이 본다. 1280을 2배로 통째로 찍으면
   2560이라 전사 상한을 넘기므로 zoom은 화면 전체를 안 찍는다. */
const MODES = {
  desk: { vp: { width: 1280, height: 720 }, dpr: 1, url: BASE, clips: false, guest: true },
  mob: { vp: { width: 740, height: 360 }, dpr: 2, url: BASE, clips: false, guest: true },
  bot: { vp: { width: 1280, height: 720 }, dpr: 1, url: BASE + "&preset=veteran,rich", clips: false, guest: false },
  zoom: { vp: { width: 1280, height: 720 }, dpr: 2, url: BASE, clips: true, guest: true }
};

const mode = process.argv[2];
const cfg = MODES[mode];
if (!cfg) {
  console.log("usage: node tools/manual-qa.mjs desk|mob|bot|zoom");
  process.exit(1);
}
mkdirSync(OUT, { recursive: true });

const log = { mode, vp: cfg.vp, dpr: cfg.dpr, url: cfg.url, at: new Date().toISOString(),
  shots: [], steps: [], errs: [], m: {} };
const put = (k, v) => { log.m[k] = v; };
const step = (k, v) => { log.steps.push({ k, v }); };
const save = () => writeFileSync(join(OUT, "run-" + mode + ".json"), JSON.stringify(log, null, 1));

const die = setTimeout(() => {
  log.errs.push("WATCHDOG " + WATCH_MS);
  try { save(); } catch (e) { void e; }
  console.log(mode + " WATCHDOG");
  process.exit(1);
}, WATCH_MS);
die.unref();

async function snap(page, id, sel) {
  /* zoom은 조각만 찍고 나머지 모드는 화면만 찍는다. 한 차례를 네 모드가 공유하므로 부르는 자리에
     둘 다 적어 두고 어느 쪽을 찍을지는 모드가 고른다. 이름 앞의 번호는 표면의 차례라 모드가 달라도
     같은 번호가 같은 표면을 가리킨다. */
  if (cfg.clips !== Boolean(sel)) return null;
  let clip = null;
  if (sel) {
    const box = await page.locator(sel).first().boundingBox().catch(() => null);
    if (!box) { step("miss", id + " " + sel); return null; }
    // 상한을 넘는 변은 잘라서 담는다. 늘리는 것은 없는 화소를 만드는 일이라 하지 않는다.
    const cap = MAX_SIDE / cfg.dpr;
    const x = Math.min(Math.max(0, box.x), cfg.vp.width - 1);
    const y = Math.min(Math.max(0, box.y), cfg.vp.height - 1);
    clip = {
      x, y,
      width: Math.max(1, Math.min(box.width, cap, cfg.vp.width - x)),
      height: Math.max(1, Math.min(box.height, cap, cfg.vp.height - y))
    };
  }
  const file = id + "-" + mode + ".png";
  const buf = await page.screenshot(clip ? { clip } : {});
  writeFileSync(join(OUT, file), buf);
  /* 찍을 때 뜻한 크기가 아니라 파일이 실제로 든 크기가 상한을 받는다. PNG의 IHDR이 그 수를 들고 있어
     16번째 바이트부터 폭과 높이를 되읽는다. */
  const w = buf.readUInt32BE(16);
  const h = buf.readUInt32BE(20);
  log.shots.push({ file, w, h, over: Math.max(w, h) > MAX_SIDE });
  return file;
}

const padOpen = (page) => page.waitForFunction(
  () => document.querySelectorAll(".zone:not([disabled])").length === 3, null, { timeout: STEP_MS });
const padShut = (page) => page.waitForFunction(
  () => Array.from(document.querySelectorAll(".zone")).every((b) => b.disabled), null, { timeout: STEP_MS });
/* 창이 닫힌 것을 기다리는 자리. waitForSelector는 기본이 보일 때까지라 숨은 요소에 물으면 영영 안 온다.
   실측으로 훈련장을 닫고 26초를 기다리다 죽었다. 숨은 것은 보이기가 아니라 속성으로 묻는다. */
/* 창이 닫히면 HUD 기둥이 0.24초 동안 제자리로 미끄러져 돌아온다. 그 사이에 누르면 아직 화면 밖인
   자리를 누르게 된다. 그려진 사각형이 창 안에 들어설 때까지 기다린다. */
const settle = (page, sel) => page.waitForFunction((x) => {
  const el = document.querySelector(x);
  if (!el) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight;
}, sel, { timeout: STEP_MS });
const gone = (page, id) => page.waitForFunction((x) => document.getElementById(x).hidden, id, { timeout: STEP_MS });
const pipCount = (page) => page.evaluate(() => document.querySelectorAll("#pips i.gone, #pips i.save").length);
const ballDone = (page, before) => page.waitForFunction(
  (n) => document.querySelectorAll("#pips i.gone, #pips i.save").length > n, before, { timeout: STEP_MS });
const marks = (page) => page.evaluate(
  () => Array.from(document.querySelectorAll(".zone")).map((b) => b.getAttribute("aria-pressed")).join("/"));

/* 붙들어 남은 것을 한 번에 여는 손. 짧은 누름은 한 단만 올리므로 열한 장을 그것으로 끝내려면 쉰다섯 번을
   눌러야 한다. 손가락이 내려가 있는 동안 열리는 물건이라 누름과 뗌을 따로 보내고, 열린 것을 보고 뗀다.
   붙든 시간을 같이 돌려주는 것은 제품 문턱 0.45초를 넘겨서 열린 것인지가 그 수로만 보이기 때문이다. */
async function hold(page) {
  const box = await page.locator("#pull .tap").boundingBox().catch(() => null);
  if (!box) return null;
  const t0 = Date.now();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForFunction((last) => {
    const r = window.__reveal();
    return r.drawn > 0 && r.shown === r.drawn && r.stage === last;
  }, STAGE_LAST, { timeout: STEP_MS, polling: "raf" }).catch(() => {});
  const ms = Date.now() - t0;
  await page.mouse.up();
  return ms;
}

/* 마지막 단의 그림은 brightness(0)에서 제 색으로 0.22초에 걸쳐 돌아온다. 그 도중에 찍으면 다 열린
   카드가 어두운 판으로 남아, 아무도 본 적 없는 그림이 연출의 증거가 된다. 실측으로 긴 누름 직후에
   찍은 넉 장이 전부 그 중간 프레임이었다. 필터가 none으로 앉은 뒤에 찍는다. */
const lit = (page) => page.waitForFunction(() => {
  const img = document.querySelector("#pull .now img");
  return Boolean(img) && getComputedStyle(img).filter === "none";
}, null, { timeout: STEP_MS, polling: "raf" });

/* 카드가 다 앉은 뒤에 찍는다. 그림 필터만 기다리면 단마다 다시 도는 0.16초 pullDeal 합성이 아직 돌아,
   다 열린 카드가 배경 위에 반투명하게 얹힌 채로 남는다. 실측으로 05-reveal-end-desk의 판이 (12,11,6)이었고
   가라앉은 값은 (6,8,3)이다. 도는 것이 없는지 묻는 이 모양의 주인은 tools/pullshow-gate.mjs의 plateAt이고,
   여기서는 그것을 그대로 가져다 #pull 아래에 건다.
   mode "all"은 #pull 아래 전부를 묻는다. 마지막 단과 봉인 단은 도는 것이 잠깐 없는 자리가 있어서 거기서 풀린다.
   mode "card"는 판과 카드가 제 몸에 건 합성만 묻는다. 등급 단의 빛은 그 단 자체라 --beam-ms가 단 길이와 같고,
   빛이 꺼지기를 기다리면 그 단이 이미 지나간 뒤에 찍는다. 같은 이유로 pullshow-gate.mjs는 1단을 아예 안 찍는다.
   기다린 뒤에 프레임 둘을 더 센다. 시간이 아니라 프레임으로 세야 바쁜 기계에서도 같은 수의 그림이 지나간다. */
const calm = async (page, mode) => {
  await page.waitForFunction((m) => {
    const box = document.getElementById("pull");
    if (!box) return false;
    if (m === "all") return box.getAnimations({ subtree: true }).length === 0;
    const now = box.querySelector(".now");
    return box.getAnimations().length === 0 && (!now || now.getAnimations().length === 0);
  }, mode, { timeout: STEP_MS, polling: "raf" }).catch(() => {});
  await page.evaluate(() => new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res))));
};

const revealAt = (page) => page.evaluate(() => {
  const box = document.getElementById("pull");
  const now = box.querySelector(".now");
  const tap = box.querySelector(".tap");
  const count = box.querySelector(".count");
  const nameEl = box.querySelector(".now .foot b");
  return {
    open: !box.hidden,
    stage: now ? Number(now.dataset.stage) : -1,
    label: tap ? tap.textContent : "",
    count: count ? count.textContent : "",
    name: nameEl ? nameEl.textContent : "",
    rows: box.querySelectorAll(".now .stats span").length,
    seal: Boolean(now && now.querySelector(".seal")),
    // 그림에 걸린 필터. 단이 올라도 이 값이 안 앉으면 화면은 아직 지난 단의 밝기다.
    dim: (function () { const i = box.querySelector(".now img"); return i ? getComputedStyle(i).filter : ""; }()),
    r: window.__reveal()
  };
});

async function titleLeg(page) {
  await page.waitForSelector("#go", { timeout: STEP_MS });
  put("title", await page.evaluate(() => {
    const word = document.getElementById("word");
    const spans = Array.from(word.querySelectorAll("span")).map((s) => {
      const r = s.getBoundingClientRect();
      return { t: s.textContent, top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left) };
    });
    return {
      go: document.getElementById("go").textContent,
      login: document.getElementById("ain").textContent,
      up: document.getElementById("aup").textContent,
      nick: !document.getElementById("anick").hidden,
      // 두 줄이 겹치는지. 윗줄의 아래가 아랫줄의 위보다 낮으면 글자가 서로를 지난다.
      overlap: spans.length === 2 ? Math.round(spans[0].bottom - spans[1].top) : null,
      spans
    };
  }));
  await snap(page, "01-title");
  await snap(page, "01-title-word", "#word");
  await page.click("#aup");
  put("signup", await page.evaluate(() => ({
    nick: !document.getElementById("anick").hidden,
    login: document.getElementById("ain").textContent,
    up: document.getElementById("aup").textContent
  })));
  await snap(page, "02-signup");
  await snap(page, "02-signup-form", "#gate");
  await page.click("#aup");
  await page.click("#go", { force: true });
}

async function revealLeg(page) {
  /* 판이 뜨는 순간을 프레임 단위로 잡는다. 첫 단은 0.3초만 서 있어서 한 박자라도 늦으면 사다리가
     혼자 한 단을 올리고, 그 뒤의 누름은 0단이 아니라 1단에서 시작한다. */
  await page.waitForFunction(() => {
    const p = document.getElementById("pull");
    return Boolean(p && !p.hidden && p.querySelector(".now"));
  }, null, { timeout: STEP_MS, polling: "raf" });
  /* 누른 순간의 단을 브라우저 안에서 잡아 둔다. 밖에서 누르기 전에 읽고 누른 뒤에 또 읽으면 그 사이
     자동 사다리가 한 단을 올려, 누름이 올린 것인지 사다리가 올린 것인지를 이 축이 못 가른다. */
  await page.evaluate(() => {
    window.__qaTapAt = null;
    document.addEventListener("pointerup", () => { window.__qaTapAt = window.__reveal(); }, true);
  });
  const sealed = await revealAt(page);
  /* 카드가 선 순간 곧바로 한 번 누른다. 단은 0.3초마다 혼자 오르므로 누르기 전에 그림부터 찍으면
     그 사이 사다리가 한 단을 올려, 누름이 올린 단을 아무도 못 본다. 봉인 층은 열한 장짜리 회차가 받는다. */
  await page.click("#pull", { force: true });
  const tapped = await revealAt(page);
  const pre = await page.evaluate(() => window.__qaTapAt);
  await calm(page, "card");
  await snap(page, "04-reveal-stage1");
  const shotAt = await revealAt(page);
  await snap(page, "04-reveal-stage1-card", "#pull .now");
  const held = await hold(page);
  await lit(page).catch(() => {});
  await calm(page, "all");
  const opened = await revealAt(page);
  await snap(page, "05-reveal-end");
  await snap(page, "05-reveal-end-card", "#pull .now");
  put("revealKeeper", { sealed, pre, tapped, shotAt, held, opened });
  await page.click("#pull", { force: true });
  await page.waitForFunction(() => window.__reveal().drawn > 1, null, { timeout: STEP_MS });
  await page.waitForTimeout(200);
  await calm(page, "all");
  const kick = await revealAt(page);
  await snap(page, "06-kicker-sealed");
  await snap(page, "06-kicker-sealed-card", "#pull .now");
  const heldK = await hold(page);
  await lit(page).catch(() => {});
  await calm(page, "all");
  const allK = await revealAt(page);
  await snap(page, "07-kickers-all");
  put("revealKickers", { sealed: kick, held: heldK, opened: allK });
  await page.click("#pull", { force: true });
  await page.waitForFunction(() => document.getElementById("pull").hidden, null, { timeout: STEP_MS });
  put("owned", await page.evaluate(() => ({
    kickers: window.__kickers().length, eleven: window.__eleven().length, squad: window.__squad()
  })));
}

/* 막고 돌아오는 걸음을 한 장 잡는다. 누운 자세가 아니라 서서 걷는 중간이어야 하므로 x가 가운데로
   오는 동안에 찍고, 그 사이 y가 오르내리는지를 같은 표본에 남긴다. 걸음의 위아래가 없으면 미끄러짐이다. */
async function walkLeg(page) {
  const path = [];
  let got = false;
  let peak = 0;
  for (let i = 0; i < WALK_N; i += 1) {
    const at = await page.evaluate(() => {
      const p = window.__keeperPos();
      return { x: Math.round(p.x * 1000) / 1000, y: Math.round(p.y * 1000) / 1000, t: Math.round(performance.now()) };
    });
    path.push(at);
    const ax = Math.abs(at.x);
    if (ax > peak) peak = ax;
    /* 가장 멀리 나갔던 자리에서 한 걸음 이상 돌아왔고 아직 가운데에 안 닿은 구간이 걸음의 중간이다.
       누운 자리에 그대로 있는 프레임을 찍으면 걸음이 아니라 정지가 증거로 남는다. 실측으로 막은 직후
       2초는 x가 1.29에 붙어 있었고 걸음은 그 뒤에 시작했다. */
    if (!got && peak > 0.5 && ax < peak - 0.08 && ax > 0.12) {
      await snap(page, "10-walk-back");
      await snap(page, "10-walk-back-crop", "#stage");
      got = true;
      path.push({ shot: true, x: at.x });
    }
    await page.waitForTimeout(WALK_MS);
  }
  put("walk", { got, peak, path });
}

async function ballsLeg(page) {
  await padOpen(page);
  put("pad", await page.evaluate(() => Array.from(document.querySelectorAll(".zone")).map((b) => {
    const r = b.getBoundingClientRect();
    return { dive: Number(b.dataset.dive), w: Math.round(r.width), h: Math.round(r.height),
      pressed: b.getAttribute("aria-pressed") };
  })));
  await snap(page, "08-pad-armed");
  await snap(page, "08-pad-armed-crop", "#pad");
  const rounds = [];
  for (let i = 0; i < BALLS; i += 1) {
    const before = await pipCount(page);
    let mid = null;
    if (i === 0) {
      await page.click(".zone[data-dive='-1']");
      await snap(page, "09-pad-left-pressed");
    }
    if (i === 1) {
      /* 창이 닫힌 뒤에 선호를 옮긴다. 방향은 차기 전에만 바꾸는 것이 아니라 판이 살아 있는 동안
         언제든 바뀌어야 한다는 파운더 지적의 자리다. 비활성 버튼은 click의 활성 검사에서 멈추므로
         좌표로 실제 포인터를 보낸다. 크롬은 비활성 버튼에도 pointerdown과 pointerup을 그대로 보낸다. */
      await padShut(page);
      const flying = await page.evaluate(() => window.__lastInput);
      const box = await page.locator(".zone[data-dive='1']").boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.up();
      mid = {
        flying,
        shut: await page.evaluate(() => Array.from(document.querySelectorAll(".zone")).every((b) => b.disabled)),
        held: await page.evaluate(() => window.__lastInput),
        marks: await marks(page)
      };
      await snap(page, "09b-pad-mid-change");
      await snap(page, "09b-pad-mid-change-crop", "#pad");
    }
    await ballDone(page, before);
    rounds.push({
      i,
      input: await page.evaluate(() => window.__lastInput),
      calls: await page.evaluate(() => window.__autoCalls),
      marks: await marks(page),
      mid
    });
    if (i === 0) await walkLeg(page);
    if (i < BALLS - 1) await padOpen(page);
  }
  put("rounds", rounds);
  put("purse", await page.evaluate(() => {
    const top = document.getElementById("top");
    const purse = document.getElementById("purse");
    return { txt: purse ? purse.textContent : "", coin: window.__wallet().coin, fans: window.__fans(),
      topH: top ? Math.round(top.getBoundingClientRect().height) : null };
  }));
  await snap(page, "11-after-five-balls");
}

const chromeAt = (page) => page.evaluate(() => {
  /* 왼쪽 기둥의 구멍을 재는 자리. 소리끄기가 자리를 옮기면서 빈 칸 하나가 남았다는 지적이라,
     같은 기둥에 선 버튼들의 세로 간격을 그대로 적는다. 사람이 보는 것은 이름이 아니라 그 틈이다. */
  const ids = ["meBtn", "purse", "mute", "wikiBtn", "out", "auto", "gymBtn", "rosterBtn", "gramBtn", "shopBtn"];
  const seen = {};
  for (const id of ids) {
    const node = document.getElementById(id);
    if (!node) { seen[id] = null; continue; }
    const r = node.getBoundingClientRect();
    const cs = getComputedStyle(node);
    seen[id] = { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height),
      vis: cs.visibility, disp: cs.display, op: cs.opacity, hidden: node.hidden };
  }
  const left = ids.filter((id) => seen[id] && seen[id].x + seen[id].w / 2 < innerWidth / 2)
    .sort((a, b) => seen[a].y - seen[b].y);
  const gaps = [];
  for (let i = 1; i < left.length; i += 1) {
    gaps.push(left[i - 1] + ">" + left[i] + ":" + Math.round(seen[left[i]].y - (seen[left[i - 1]].y + seen[left[i - 1]].h)));
  }
  return { seen, leftColumn: left, gaps, vw: innerWidth, vh: innerHeight };
});

const fontsAt = (page) => page.evaluate(() => {
  // 표면마다 글씨 크기가 갈리면 품질이 낮아 보인다는 지적의 계기다. 보이는 글자 마디만 센다.
  const roots = ["#top", "#pad", "#gym", "#shop", "#me", "#wiki"];
  const hit = {};
  for (const sel of roots) {
    const root = document.querySelector(sel);
    if (!root || root.hidden) continue;
    for (const node of root.querySelectorAll("*")) {
      const txt = Array.from(node.childNodes).some((c) => c.nodeType === 3 && c.textContent.trim());
      if (!txt) continue;
      const r = node.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) continue;
      const cs = getComputedStyle(node);
      const key = Math.round(parseFloat(cs.fontSize) * 100) / 100 + "px " + cs.fontFamily.split(",")[0].replace(/"/g, "");
      hit[key] = (hit[key] || 0) + 1;
    }
  }
  return hit;
});

async function gymLeg(page) {
  await page.click("#gymBtn");
  await page.waitForSelector("#gym:not([hidden])", { timeout: STEP_MS });
  await page.waitForTimeout(200);
  put("gym", await page.evaluate(() => {
    const box = document.getElementById("gym");
    const row = box.querySelector(".row");
    const cards = Array.from(box.querySelectorAll(".row button"));
    const last = cards.length ? cards[cards.length - 1].getBoundingClientRect() : null;
    const first = cards.length ? cards[0].getBoundingClientRect() : null;
    return {
      cards: cards.length,
      head: (box.querySelector("h4") || { textContent: "" }).textContent,
      // 격자가 창 밖으로 나가면 마지막 칸의 오른쪽이 창 너비를 지난다.
      rowRight: row ? Math.round(row.getBoundingClientRect().right) : null,
      overflow: row ? Math.round(row.scrollWidth - row.clientWidth) : null,
      lastRight: last ? Math.round(last.right) : null,
      cut: last ? Math.round(last.right) - innerWidth : null,
      cardW: first ? Math.round(first.width) : null,
      boxOver: Math.round(box.scrollHeight - box.clientHeight),
      sample: cards.slice(0, 3).map((b) => b.textContent)
    };
  }));
  await snap(page, "12-gym");
  await snap(page, "12-gym-row", "#gym .row");
  put("fontsGym", await fontsAt(page));
  await page.click("#gym .close", { force: true });
  await gone(page, "gym");
}

const shelfAt = (page) => page.evaluate(() => {
  const box = document.getElementById("shop");
  const cur = box.querySelector(".tabs .tab[aria-current]");
  const cards = Array.from(box.querySelectorAll(".card.gear")).map((c) => {
    const b = c.querySelector("b");
    const em = c.querySelector("em");
    const buy = c.querySelector(".buy");
    const shot = c.querySelector(".shot");
    const img = shot ? shot.querySelector("img") : null;
    const lh = b ? parseFloat(getComputedStyle(b).lineHeight) : 0;
    const cr = c.getBoundingClientRect();
    return {
      name: b ? b.textContent : "",
      // 이름이 접힌 줄 수. 두 줄 카드와 한 줄 카드의 값 배지 높이가 갈리면 선반이 들쭉날쭉해진다.
      lines: b && lh ? Math.round(b.getBoundingClientRect().height / lh) : 0,
      eff: em ? em.textContent : "",
      effCut: em ? Math.round(em.scrollHeight - em.clientHeight) : 0,
      label: buy ? buy.textContent : "",
      off: buy ? buy.disabled : null,
      bad: buy ? buy.classList.contains("bad-price") : null,
      img: Boolean(img && img.getAttribute("src")),
      imgW: img ? img.naturalWidth : 0,
      footTop: buy ? Math.round(buy.getBoundingClientRect().top - cr.top) : null,
      h: Math.round(cr.height)
    };
  });
  /* 값이 적힌 자리는 선반 종류를 안 가리고 전부 훑는다. 부족할 때 원래 값을 붉게 쓰는 문법이
     열한 선반에서 같은지가 파운더 지적이라, 이적시장의 뽑기 버튼도 같은 배열에 들어와야 한다. */
  const buys = Array.from(box.querySelectorAll(".buy")).map((b) => {
    const px = b.querySelector("[data-coin]");
    return { txt: b.textContent, coin: px ? Number(px.dataset.coin) : null,
      off: b.disabled, bad: b.classList.contains("bad-price"),
      red: getComputedStyle(px || b).color };
  });
  return {
    tab: cur ? cur.dataset.tab : "",
    head: (box.querySelector(".goods h4") || { textContent: "" }).textContent,
    cards, buys, wallet: window.__wallet().coin,
    withImg: cards.filter((c) => c.img).length
  };
});

const specAt = (page) => page.evaluate(() => {
  const spec = document.querySelector("#shop .spec");
  if (!spec) return null;
  const rows = Array.from(spec.querySelectorAll("i")).map((row) => {
    const v = row.querySelector("em");
    const k = row.querySelector("span");
    if (!v || !k) return null;
    const rr = row.getBoundingClientRect();
    const vr = v.getBoundingClientRect();
    const kr = k.getBoundingClientRect();
    const lh = parseFloat(getComputedStyle(k).lineHeight) || 0;
    return {
      v: v.textContent, k: k.textContent,
      lines: lh ? Math.round(kr.height / lh) : 0,
      // 값과 이름의 세로 가운데 차이. 이름이 두 줄로 접혔는데 값이 첫 줄에 매달리면 이 수가 벌어진다.
      gap: Math.round((vr.top + vr.height / 2) - (kr.top + kr.height / 2)),
      vTop: Math.round(vr.top - rr.top), kTop: Math.round(kr.top - rr.top), rowH: Math.round(rr.height)
    };
  }).filter(Boolean);
  return { at: spec.dataset.at, head: (spec.querySelector("b") || { textContent: "" }).textContent, rows };
});

const spinAt = (page) => page.evaluate(async () => {
  const shot = document.querySelector("#shop .shot.spinning");
  if (!shot) return { spinning: false };
  const img = shot.querySelector("img");
  const cv = shot.querySelector("canvas");
  const sr = shot.getBoundingClientRect();
  const cr = cv ? cv.getBoundingClientRect() : null;
  /* 도는지는 클래스가 아니라 화소가 말한다. 한 바퀴가 8초라 0.13초 사이는 6도뿐이고, 그 두 장은
     사람 눈에도 계기에도 같은 그림이다. 0.9초를 두면 40도라 각이 눈에 보이고, 그래도 화소가
     안 움직이면 사람이 본 것은 회전이 아니라 멈춘 그림이다. */
  const read = () => (cv && cv.toDataURL ? cv.toDataURL() : "");
  const a = read();
  await new Promise((done) => setTimeout(done, 900));
  const b = read();
  return {
    spinning: true,
    // 도는 그림이 멈춘 그림을 대신하는지. 멈춘 그림이 남아 있으면 도는 것이 그 뒤에서 가려진다.
    stillDisplay: img ? getComputedStyle(img).display : "none",
    canvas: Boolean(cv),
    fillW: cr ? Math.round((cr.width / sr.width) * 100) : null,
    fillH: cr ? Math.round((cr.height / sr.height) * 100) : null,
    shotW: Math.round(sr.width), shotH: Math.round(sr.height),
    moved: Boolean(a && b && a !== b), px: a.length + "/" + b.length
  };
});

const TABS = ["pull", "glove", "boot", "kit", "sock", "frame", "city", "hair", "ink", "bot", "buff"];

async function shopLeg(page) {
  await settle(page, "#shopBtn");
  await page.click("#shopBtn");
  await page.waitForSelector("#shop:not([hidden])", { timeout: STEP_MS });
  await page.waitForTimeout(400);
  await snap(page, "13-shop-open");
  await snap(page, "13-shop-fitting", "#shop .fitting");
  const shelves = {};
  let twoLine = null;
  for (const tab of TABS) {
    await page.click("#shop .tab[data-tab='" + tab + "']", { force: true });
    await page.waitForTimeout(320);
    shelves[tab] = await shelfAt(page);
    if (tab === "glove") { await snap(page, "14-shelf-glove"); await snap(page, "14-shelf-glove-rack", "#shop .rack"); }
    if (tab === "pull") { await snap(page, "15-shelf-pull"); await snap(page, "15-shelf-pull-buys", "#shop .buys"); }
    if (tab === "hair") { await snap(page, "16-shelf-hair"); }
    if (tab === "bot") { await snap(page, "17-shelf-bot"); }
    if (tab === "buff") { await snap(page, "17b-shelf-buff"); }
    if (tab === "hair" || tab === "ink") {
      for (let i = 0; i < 3; i += 1) await snap(page, "16-" + tab + "-thumb-" + i, "#shop .rack .card.gear:nth-child(" + (i + 1) + ") .pic");
    }
    /* 효과 이름이 두 줄로 접히는 카드를 찾아 그 자리에서 값의 높이를 잰다. 어느 선반에 있는지는
       선반 데이터가 정하므로 미리 못 적는다. 처음 만난 두 줄 카드 하나면 이 축은 닫힌다. */
    const cards = await page.locator("#shop .card[data-spec]").count();
    for (let i = 0; i < Math.min(cards, 5); i += 1) {
      await page.locator("#shop .card[data-spec]").nth(i).hover({ force: true });
      await page.waitForTimeout(130);
      const spec = await specAt(page);
      if (!spec || !spec.rows.length) continue;
      if (!twoLine && spec.rows.some((r) => r.lines > 1)) {
        twoLine = { tab, card: i, spec };
        await snap(page, "18-spec-two-line");
        await snap(page, "18-spec-two-line-box", "#shop .spec");
      }
      if (tab === "glove" && i === 0) {
        put("specOne", spec);
        await snap(page, "18b-spec-hover");
      }
      if (!log.m.spin || !log.m.spin.spinning) put("spin", await spinAt(page));
      if (tab === "hair" && i === 1) {
        await snap(page, "19-spin-hover");
        await snap(page, "19-spin-hover-shot", "#shop .shot.spinning");
        // 같은 칸을 0.9초 뒤에 한 번 더 뜬다. 두 장의 각이 다르면 그 회전은 사람 눈에도 보인다.
        put("spinHair", await spinAt(page));
        await snap(page, "19b-spin-late");
        await snap(page, "19b-spin-late-shot", "#shop .shot.spinning");
      }
    }
  }
  put("shelves", shelves);
  put("twoLine", twoLine);
  put("fontsShop", await fontsAt(page));
}

async function tryOnLeg(page, buy) {
  await page.click("#shop .tab[data-tab='hair']", { force: true });
  await page.waitForTimeout(320);
  // 카드 몸을 눌러 걸쳐 본다. 값 버튼이 아니라 카드라서 지갑은 안 움직이고 미리보기만 갈아입는다.
  await page.click("#shop .rack .card.gear:nth-child(2) .pic", { force: true });
  await page.waitForTimeout(500);
  const fitted = await page.evaluate(() => {
    const box = document.getElementById("shop");
    const all = box.querySelector(".fitting .all");
    const me = box.querySelector(".fitting .me img");
    const px = all ? all.querySelector("[data-coin]") : null;
    const mr = me ? me.getBoundingClientRect() : null;
    return {
      chips: Array.from(box.querySelectorAll(".tried i[data-off]")).map((i) => i.textContent),
      allTxt: all ? all.textContent : "", allOff: all ? all.disabled : null,
      allBad: all ? all.classList.contains("bad-price") : null,
      bill: px ? Number(px.dataset.coin) : null,
      wallet: window.__wallet().coin,
      // 미리보기 그림이 칸 안에 다 들어오는지. 머리가 잘리면 그림의 위가 칸 위보다 높다.
      preview: mr ? { w: Math.round(mr.width), h: Math.round(mr.height),
        natW: me.naturalWidth, natH: me.naturalHeight, fit: getComputedStyle(me).objectFit } : null
    };
  });
  put("tryOn", fitted);
  await snap(page, "20-fitting-tryon");
  await snap(page, "20-fitting-tryon-box", "#shop .fitting");
  if (!buy) return;
  await page.click("#shop .fitting .all", { force: true });
  await page.waitForTimeout(600);
  put("bought", await page.evaluate(() => {
    const box = document.getElementById("shop");
    return {
      wallet: window.__wallet().coin, gear: window.__gear(),
      chips: Array.from(box.querySelectorAll(".tried i[data-off]")).length,
      labels: Array.from(box.querySelectorAll(".card.gear .buy")).map((b) => b.textContent)
    };
  }));
  await snap(page, "21-after-buy");
  await snap(page, "21-after-buy-rack", "#shop .rack");
}

async function rosterLeg(page) {
  /* 창이 열려 있는 동안 그 창을 연 버튼은 화면 밖으로 미끄러져 나가 있다. 실측으로 상점을 연 뒤
     #shopBtn을 누르려다 outside of the viewport로 죽었다. 닫는 것은 언제나 창 자신의 닫기다. */
  await page.click("#shop .close", { force: true });
  await gone(page, "shop");
  await settle(page, "#rosterBtn");
  await page.click("#rosterBtn", { force: true });
  await page.waitForSelector("#roster:not([hidden])", { timeout: STEP_MS });
  await page.waitForTimeout(600);
  put("roster", await page.evaluate(() => {
    const box = document.getElementById("roster");
    const faces = Array.from(box.querySelectorAll("img"));
    return { faces: faces.length, withSrc: faces.filter((i) => i.getAttribute("src")).length,
      head: (box.querySelector("h4") || { textContent: "" }).textContent,
      cards: box.querySelectorAll(".card, .man, li").length };
  }));
  await snap(page, "22-roster");
  for (let i = 0; i < 4; i += 1) await snap(page, "22-roster-face-" + i, "#roster img:nth-of-type(" + (i + 1) + ")");
  await page.click("#roster .close", { force: true });
  await gone(page, "roster");
  await settle(page, "#meBtn");
}

const meAt = (page) => page.evaluate(() => {
  const box = document.getElementById("me");
  const pane = box.querySelector(".pane");
  const panebox = box.querySelector(".panebox");
  const h4 = box.querySelector("h4");
  const top = document.getElementById("top");
  const cue = (root) => Array.from(root.querySelectorAll(":scope > .cue"))
    .map((c) => (c.classList.contains("down") ? "down" : "up") + ":" + (c.style.opacity || "unset"));
  const hr = h4 ? h4.getBoundingClientRect() : null;
  const tr = top ? top.getBoundingClientRect() : null;
  const cur = box.querySelector(".tab[aria-current]");
  return {
    tab: cur ? cur.dataset.tab : "",
    tables: box.querySelectorAll("table").length,
    rows: box.querySelectorAll("table tr").length,
    paneOver: pane ? Math.round(pane.scrollHeight - pane.clientHeight) : null,
    paneH: pane ? Math.round(pane.clientHeight) : null,
    boxOver: Math.round(box.scrollHeight - box.clientHeight),
    cues: (panebox ? cue(panebox) : []).concat(cue(box)),
    // 아는 얼굴이 빈 새 저장에서 그 칸이 무엇을 세우는지. 글자만 있으면 덜 그려진 화면으로 읽힌다.
    emptyIcon: box.querySelectorAll(".note.dim svg").length,
    emptyTxt: (box.querySelector(".note.dim") || { textContent: "" }).textContent,
    big: Array.from(box.querySelectorAll(".big span")).map((s) => s.textContent),
    // 제목이 상단 재화 띠와 겹치면 두 글자가 서로를 지난다. 양수면 겹친 높이다.
    headOverTop: hr && tr ? Math.round(Math.min(hr.bottom, tr.bottom) - Math.max(hr.top, tr.top)) : null,
    txt: (pane ? pane.textContent : "").slice(0, 140)
  };
});

async function meLeg(page) {
  await page.click("#meBtn", { force: true });
  await page.waitForSelector("#me:not([hidden])", { timeout: STEP_MS });
  await page.waitForTimeout(500);
  const panes = {};
  const names = [["stat", "23-me-stat"], ["face", "24-me-face"], ["log", "25-me-log"]];
  for (const pair of names) {
    await page.click("#me .tab[data-tab='" + pair[0] + "']", { force: true });
    await page.waitForTimeout(320);
    panes[pair[0]] = await meAt(page);
    await snap(page, pair[1]);
    await snap(page, pair[1] + "-card", "#me .card");
  }
  put("me", panes);
  put("fontsMe", await fontsAt(page));
  await page.click("#me .close", { force: true });
  await gone(page, "me");
  await settle(page, "#wikiBtn");
}

const wikiAt = (page) => page.evaluate(() => {
  const box = document.getElementById("wiki");
  const cur = box.querySelector(".cats [data-cat][aria-current]");
  const body = box.querySelector(".body");
  const cues = Array.from(box.querySelectorAll(".cue"))
    .map((c) => (c.classList.contains("down") ? "down" : "up") + ":" + (c.style.opacity || "unset"));
  return {
    cat: cur ? cur.dataset.cat : "",
    over: body ? Math.round(body.scrollHeight - body.clientHeight) : null,
    at: body ? Math.round(body.scrollTop) : null,
    h: body ? Math.round(body.clientHeight) : null,
    tables: box.querySelectorAll("table").length,
    cues,
    head: (box.querySelector(".body h5, .body h4, .body b") || { textContent: "" }).textContent
  };
});

async function wikiLeg(page) {
  await page.click("#wikiBtn", { force: true });
  await page.waitForSelector("#wiki:not([hidden])", { timeout: STEP_MS });
  await page.waitForTimeout(400);
  await snap(page, "26-wiki-open");
  await snap(page, "26-wiki-sheet", "#wiki .sheet");
  const cats = {};
  for (const cat of ["hand", "coin", "drill", "pull", "gram", "bot", "buff", "risk"]) {
    await page.click("#wiki .cats [data-cat='" + cat + "']", { force: true });
    await page.waitForTimeout(260);
    cats[cat] = await wikiAt(page);
    if (cat === "drill") { await snap(page, "27-wiki-drill"); await snap(page, "27-wiki-drill-body", "#wiki .bodybox"); }
    if (cat === "hand") await snap(page, "26b-wiki-hand");
  }
  /* 굴려 본다. 아래에 더 있다는 신호가 켜져 있었는지와 실제로 닿는지는 다른 축이고,
     사람이 잃는 것은 닿을 수 있는데 있는 줄 모르는 쪽이다. */
  await page.click("#wiki .cats [data-cat='drill']", { force: true });
  await page.waitForTimeout(240);
  const before = await wikiAt(page);
  await page.mouse.move(cfg.vp.width / 2, cfg.vp.height / 2);
  await page.mouse.wheel(0, 240);
  await page.waitForTimeout(320);
  const after = await wikiAt(page);
  await snap(page, "28-wiki-scrolled");
  put("wiki", { cats, wheel: { before, after } });
  await page.click("#wiki .close", { force: true });
  await gone(page, "wiki");
}

async function botLeg(page) {
  await padOpen(page);
  await snap(page, "08-pad-armed");
  await shopLeg(page);
  await tryOnLeg(page, true);
  await page.click("#shop .tab[data-tab='bot']", { force: true });
  await page.waitForSelector(".buy[data-bot='1']", { timeout: STEP_MS });
  await page.click(".buy[data-bot='1']", { force: true });
  await page.waitForTimeout(500);
  put("botBuy", await page.evaluate(() => ({ bot: window.__bot(), wallet: window.__wallet().coin })));
  await snap(page, "29-bot-bought");
  await page.click("#shop .close", { force: true });
  await gone(page, "shop");
  // 창이 닫히면 두 기둥이 0.24초 동안 제자리로 미끄러져 돌아온다. 움직이는 중에 누르면 빈 자리를 누른다.
  await page.waitForTimeout(600);
  await page.click("#auto", { force: true });
  await page.waitForFunction(() => window.__botRan() === true, null, { timeout: STEP_MS });
  put("botRound", await page.evaluate(() => ({
    input: window.__lastInput, calls: window.__autoCalls,
    auto: document.getElementById("auto").classList.contains("on"),
    zones: Array.from(document.querySelectorAll(".zone")).map((b) => ({
      dive: Number(b.dataset.dive), badge: Boolean(b.querySelector(".bot:not([hidden])")),
      pressed: b.getAttribute("aria-pressed")
    }))
  })));
  await snap(page, "30-pad-bot-badge");
  await snap(page, "30-pad-bot-badge-crop", "#pad");
}

let browser;
try {
  browser = await chromium.launch({ executablePath: EXE });
  const ctx = await browser.newContext({ viewport: cfg.vp, deviceScaleFactor: cfg.dpr });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => log.errs.push("pageerror " + String(e)));
  page.on("console", (m) => { if (m.type() === "error") log.errs.push("console " + m.text()); });
  // 새 손님으로 온다. 남은 저장이 있으면 개봉 화면이 안 열리고, 그 화면이 이 감사의 절반이다.
  await page.addInitScript(() => { try { localStorage.clear(); } catch (e) { void e; } });
  await page.goto(cfg.url, { waitUntil: "load" });
  await titleLeg(page);
  if (cfg.guest) {
    await revealLeg(page);
    await ballsLeg(page);
    await gymLeg(page);
    await shopLeg(page);
    await tryOnLeg(page, false);
    await rosterLeg(page);
    await meLeg(page);
    await wikiLeg(page);
  } else {
    await botLeg(page);
  }
  put("guest", await page.evaluate(() => Object.keys(localStorage).sort()));
  /* 마지막 창이 닫히고 기둥이 제자리에 설 때까지 기다린 뒤에 잰다. 미끄러지는 도중에 재면
     실측처럼 mute가 x=1314, auto가 x=-81로 읽혀 화면 밖에 선 버튼 목록이 증거로 남는다. */
  await settle(page, "#mute").catch(() => {});
  await settle(page, "#auto").catch(() => {});
  put("chrome", await chromeAt(page));
  put("fontsEnd", await fontsAt(page));
  put("end", await page.evaluate(() => ({
    wallet: window.__wallet().coin, level: window.__keeperStats().level, points: window.__points(),
    record: Object.keys(window.__record()).length, fans: window.__fans(),
    panels: ["gym", "roster", "gram", "me", "shop", "wiki", "pull", "date"]
      .map((id) => id + ":" + (document.getElementById(id).hidden ? "shut" : "open")).join(" ")
  })));
  await snap(page, "31-end");
  await ctx.close();
} finally {
  clearTimeout(die);
  if (browser) await browser.close();
  save();
  const over = log.shots.filter((s) => s.over).length;
  console.log(mode + " done. shots " + log.shots.length + ", over " + over
    + ", errs " + log.errs.length + ", steps " + log.steps.length);
  if (log.errs.length) console.log(log.errs.slice(0, 5).join(LINE));
}
