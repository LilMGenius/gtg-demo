import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import { passerAt } from "../web/src/state/passer.mjs";

// 저장 게이트. 탭을 닫아도 키퍼가 남는가, 자리를 비운 시간이 상한 안에서만 쌓이는가.
// 대조군 셋: 저장이 비었을 때 0, 시계를 되돌렸을 때 0, 몇 달 비웠을 때도 상한.
const EXE = process.env.LOCALAPPDATA + "/ms-playwright/chromium-1228/chrome-win64/chrome.exe";
const URL = "http://127.0.0.1:10310/web/index.html?seed=20&preset=veteran";
const FACE_SRC = import.meta.dirname + "/../web/src/state/passer.mjs";
/* 얼굴표가 한 번 재배열됐다(web/src/state/passer.mjs FACES_V). 라포는 (도시, 번호)로 붙으므로
   그 전에 쓰인 저장은 익힌 얼굴을 옆 사람에게 붙여 놓는다. 아래는 옛 표에서 3번 도시 7번 자리에
   앉아 있던 사람이고, 지금 표에서 그 이름은 다른 번호에 앉아 있다. */
const FACE_FIX = { city: 3, was: 7, name: "알콩달", n: 5 };
// 팔로우와 쪽지도 같은 (도시, 번호) 키를 쓴다(web/src/state/gram.mjs whoKey). 맞팔 하나와 답장 시각 하나를
// 그 시절 번호에 앉혀 두 지도가 같은 이동을 받는지 본다. 값이 그대로 건너오는지도 같이 본다.
const SOCIAL_FIX = { back: 1, at: 2 };
// 그 이름이 지금 앉은 자리. 이동표가 아니라 이름으로 찾는다. 판 1로 찍힌 저장을 지을 때 쓴다.
const seatNow = (() => {
  for (let i = 0; i < 32; i += 1) { const w = passerAt(FACE_FIX.city, i); if (w && w.name === FACE_FIX.name) return i; }
  return -1;
})();
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
  /* 옛 표로 쓰인 저장 하나. 판번호를 지우고 그 시절 번호에 라포를 앉힌 뒤 다시 읽는다.
     묻는 것은 번호가 아니라 이름이다. 번호로 물으면 이동표를 이동표로 재는 셈이라 아무것도 안 가른다. */
  const seat = async () => {
    await p.evaluate((f) => {
      const s = JSON.parse(localStorage.getItem(window.__saveKey()));
      delete s.faces;
      s.rapport = { [f.city + ":" + f.was]: f.n };
      localStorage.setItem(window.__saveKey(), JSON.stringify(s));
    }, FACE_FIX);
    await p.reload({ waitUntil: "load" });
    await p.waitForTimeout(900);
    const r = await p.evaluate(() => window.__rapport());
    const keys = Object.keys(r || {});
    const at = keys.length === 1 ? Number(keys[0].split(":")[1]) : -1;
    const who = at >= 0 ? (passerAt(FACE_FIX.city, at) || {}).name : null;
    return { keys, at, who, n: at >= 0 ? r[keys[0]] : 0 };
  };
  const carried = await seat();
  check("save:a-reordered-face-table-keeps-rapport-on-the-same-person",
    carried.who === FACE_FIX.name && carried.n === FACE_FIX.n,
    "wrote " + FACE_FIX.city + ":" + FACE_FIX.was + ", the seat " + FACE_FIX.name
    + " held in the old table, and read back " + JSON.stringify(carried.keys) + " which is "
    + carried.who + " at " + carried.n);
  /* 같은 저장의 팔로우와 쪽지. 라포와 같은 (도시, 번호) 키라 같은 이동을 받아야 한다.
     stamp가 null이면 판번호가 없는 저장이고, 1이면 라포만 옮기고 나간 판이다. 그 판의 라포는 이미
     지금 자리에 앉아 있고 팔로우와 쪽지만 옛 자리에 남아 있어서, 라포를 지금 자리에 앉힌 채로 쓴다. */
  const seatBoth = async (stamp) => {
    await p.evaluate(([f, g, v]) => {
      const s = JSON.parse(localStorage.getItem(window.__saveKey()));
      const old = f.city + ":" + f.was;
      if (v === null) delete s.faces; else s.faces = v;
      s.rapport = { [v === null ? old : f.city + ":" + f.now]: f.n };
      s.social = { follows: { [old]: g.back }, dm: { [old]: { at: g.at } } };
      localStorage.setItem(window.__saveKey(), JSON.stringify(s));
    }, [Object.assign({ now: seatNow }, FACE_FIX), SOCIAL_FIX, stamp]);
    await p.reload({ waitUntil: "load" });
    await p.waitForTimeout(900);
    const got = await p.evaluate(() => ({ social: window.__social(), rap: window.__rapport() }));
    const fk = Object.keys((got.social && got.social.follows) || {});
    const dk = Object.keys((got.social && got.social.dm) || {});
    const rk = Object.keys(got.rap || {});
    const seatOf = (keys) => (keys.length === 1 ? Number(keys[0].split(":")[1]) : -1);
    const nameOf = (keys) => { const i = seatOf(keys); return i >= 0 ? (passerAt(FACE_FIX.city, i) || {}).name : null; };
    return { fk, dk, rk, at: seatOf(fk), who: nameOf(fk), rapWho: nameOf(rk),
      back: fk.length === 1 ? got.social.follows[fk[0]] : -1,
      dmAt: dk.length === 1 ? Number(got.social.dm[dk[0]].at) : -1 };
  };
  const both = await seatBoth(null);
  check("save:a-reordered-face-table-keeps-the-follow-and-the-dm-on-the-same-person",
    both.who === FACE_FIX.name && both.back === SOCIAL_FIX.back && both.dk.length === 1
    && both.dk[0] === both.fk[0] && both.dmAt === SOCIAL_FIX.at,
    "wrote a mutual and a dm on " + FACE_FIX.city + ":" + FACE_FIX.was + ", the seat " + FACE_FIX.name
    + " held in the old table, and read back " + JSON.stringify(both.fk) + " which is " + both.who
    + ", follow " + both.back + ", dm at " + both.dmAt);
  /* 판 1로 찍힌 저장. 라포는 이미 옮겨졌고 팔로우와 쪽지는 아직인 세대다. 라포를 또 옮기면 한 번 옮긴
     키가 다시 움직여 둘이 서로 다른 사람에게 붙는다. 옮길 것만 옮겨 둘이 한 사람 위에 서야 통과다. */
  const half = await seatBoth(1);
  check("save:a-save-stamped-before-the-social-step-moves-only-what-is-left",
    half.rapWho === FACE_FIX.name && half.who === FACE_FIX.name && half.fk.length === 1
    && half.rk.length === 1 && half.fk[0] === half.rk[0],
    "stamped 1 with the rapport already at " + FACE_FIX.city + ":" + seatNow + ", so rapport stayed on "
    + half.rapWho + " and the follow arrived at " + JSON.stringify(half.fk) + " which is " + half.who);
  /* 같은 저장의 글. 팔로우와 달리 (도시, 번호)가 키가 아니라 기록 안에 칸으로 박혀 있고, 피드의 선팔
     버튼이 그 칸을 그대로 whoKey에 넘긴다(web/src/main.mjs folBtn). 댓글 한 장과 사진 한 장을 그 시절
     번호에 앉히고 다시 읽는다. 묻는 것은 여기서도 번호가 아니라 이름이다. */
  const seatPosts = async (stamp) => {
    await p.evaluate(([f, g, v]) => {
      const s = JSON.parse(localStorage.getItem(window.__saveKey()));
      const old = f.city + ":" + f.was;
      // 판 2로 찍힌 저장은 라포와 사회가 이미 지금 자리에 앉아 있고 글만 옛 자리에 남아 있다.
      const held = v === null ? old : f.city + ":" + f.now;
      if (v === null) delete s.faces; else s.faces = v;
      s.rapport = { [held]: f.n };
      s.social = { follows: { [held]: g.back }, dm: { [held]: { at: g.at } } };
      s.posts = [
        { n: f.name, c: false, g: 0, t: "cm", lb: 0, ct: f.city, l: 1,
          cm: { city: f.city, passer: f.was, tier: 3, who: f.name, text: "x" } },
        { n: f.name, c: false, g: 0, t: "ph", lb: 0, ct: f.city, l: 1,
          ph: { city: f.city, passer: f.was, tier: 3, h: 186, w: 80, look: {} } }
      ];
      localStorage.setItem(window.__saveKey(), JSON.stringify(s));
    }, [Object.assign({ now: seatNow }, FACE_FIX), SOCIAL_FIX, stamp]);
    await p.reload({ waitUntil: "load" });
    await p.waitForTimeout(900);
    const got = await p.evaluate(() => ({ posts: window.__posts(), social: window.__social(), rap: window.__rapport() }));
    const list = Array.isArray(got.posts) ? got.posts : [];
    const cm = (list.find((x) => x && x.cm) || {}).cm || null;
    const ph = (list.find((x) => x && x.ph) || {}).ph || null;
    const nameAt = (i) => (Number.isFinite(i) && i >= 0 ? (passerAt(FACE_FIX.city, i) || {}).name : null);
    const oneSeat = (m) => { const k = Object.keys(m || {}); return k.length === 1 ? Number(k[0].split(":")[1]) : -1; };
    const cmAt = cm ? Math.floor(Number(cm.passer)) : -1;
    const phAt = ph ? Math.floor(Number(ph.passer)) : -1;
    const rapSeat = oneSeat(got.rap);
    const folSeat = oneSeat(got.social && got.social.follows);
    return { cmAt, phAt, cmWho: nameAt(cmAt), phWho: nameAt(phAt), printed: cm ? cm.who : null,
      rapSeat, folSeat, rapWho: nameAt(rapSeat), folWho: nameAt(folSeat) };
  };
  const carriedPosts = await seatPosts(null);
  check("save:a-reordered-face-table-keeps-an-old-post-on-the-same-person",
    carriedPosts.cmWho === FACE_FIX.name && carriedPosts.phWho === FACE_FIX.name
    && carriedPosts.cmAt === carriedPosts.phAt && carriedPosts.printed === FACE_FIX.name,
    "wrote a comment post and a photo post on " + FACE_FIX.city + ":" + FACE_FIX.was + ", the seat "
    + FACE_FIX.name + " held in the old table, and read back the comment at " + carriedPosts.cmAt
    + " and the photo at " + carriedPosts.phAt + " which is " + carriedPosts.cmWho
    + ", under the card name " + carriedPosts.printed);
  /* 판 2로 찍힌 저장. 라포와 팔로우는 이미 옮겨졌고 글만 옛 자리에 남은 세대다. 앞의 두 걸음을 다시
     밟으면 한 번 옮긴 키가 또 움직인다. 넷이 한 사람 위에 서야 통과다. */
  const lastLeg = await seatPosts(2);
  check("save:a-save-stamped-before-the-posts-step-moves-only-what-is-left",
    lastLeg.rapWho === FACE_FIX.name && lastLeg.folWho === FACE_FIX.name
    && lastLeg.rapSeat === lastLeg.folSeat && lastLeg.cmWho === FACE_FIX.name
    && lastLeg.phWho === FACE_FIX.name && lastLeg.cmAt === lastLeg.rapSeat,
    "stamped 2 with rapport and the follow already at " + FACE_FIX.city + ":" + seatNow
    + ", so they stayed on " + lastLeg.rapWho + " and " + lastLeg.folWho + " and the posts arrived at "
    + lastLeg.cmAt + "/" + lastLeg.phAt + " which is " + lastLeg.cmWho);
  /* 심은 대조군. 이동표를 안 읽는 판을 라우팅한다. 서버가 no-store라 새로 읽어 간다.
     같은 저장이 옛 자리에 그대로 남고 그 자리가 이제 다른 사람이어야, 위 축이 이동표를 재고 있는 것이다. */
  const face = readFileSync(FACE_SRC, "utf8");
  const hits = face.match(/const row = FACE_MOVES\[c\];/g) || [];
  check("instrument:the-planted-control-found-its-one-anchor", hits.length === 1,
    hits.length + " reads of the move table in " + FACE_SRC);
  if (hits.length === 1) {
    await p.route("**/web/src/state/passer.mjs", (r) => r.fulfill({ status: 200,
      contentType: "text/javascript; charset=utf-8", body: face.replace(hits[0], "const row = null;") }));
    const flat = await seat();
    const flatBoth = await seatBoth(null);
    const flatPosts = await seatPosts(null);
    await p.unroute("**/web/src/state/passer.mjs");
    check("control:an-identity-map-leaves-the-rapport-on-someone-else",
      flat.at === FACE_FIX.was && flat.who !== FACE_FIX.name,
      "identity left it at " + FACE_FIX.city + ":" + flat.at + ", which is " + flat.who
      + " and not " + FACE_FIX.name);
    check("control:an-identity-map-leaves-the-follow-on-someone-else",
      flatBoth.at === FACE_FIX.was && flatBoth.who !== FACE_FIX.name,
      "identity left the follow at " + FACE_FIX.city + ":" + flatBoth.at + ", which is " + flatBoth.who
      + " and not the name the fixture wrote");
    check("control:an-identity-map-leaves-the-post-on-someone-else",
      flatPosts.cmAt === FACE_FIX.was && flatPosts.phAt === FACE_FIX.was
      && flatPosts.cmWho !== FACE_FIX.name,
      "identity left the post at " + FACE_FIX.city + ":" + flatPosts.cmAt + ", which is "
      + flatPosts.cmWho + " and not " + FACE_FIX.name);
  }
  /* 이동표에 줄이 없는 도시. 오늘은 동네가 넷이라 이 키가 저장에 들어올 길이 없지만, 키를 거르는 자는
     세 길 중 하나에만 서 있다. 라포는 readRapport가 [0-3]으로 막고, 팔로우와 쪽지는 readSocial이 도시를
     안 막고, 글은 기록 안의 칸이라 거르는 정규식이 아예 없다. 줄이 없는 도시는 옮길 표가 없으니 제자리여야
     한다. 라포 키도 같이 심는다. 읽는 자리에서 버려져 화면에는 안 뜨지만, 세 길이 한 저장 안에 같이 있어야
     다섯 번째 동네가 붙는 날 이 축이 그 저장을 통째로 본다. */
  const FAR = { city: 4, was: 7, n: 5 };
  const FAR_KEY = FAR.city + ":" + FAR.was;
  const farPost = { n: FACE_FIX.name, c: false, g: 0, t: "cm", lb: 0, ct: FAR.city, l: 1,
    cm: { city: FAR.city, passer: FAR.was, tier: 3, who: FACE_FIX.name, text: "x" } };
  const farCm = JSON.stringify(farPost.cm);
  const seatFar = async () => {
    await p.evaluate(([f, g, post]) => {
      const s = JSON.parse(localStorage.getItem(window.__saveKey()));
      const old = f.city + ":" + f.was;
      delete s.faces;
      s.rapport = { [old]: f.n };
      s.social = { follows: { [old]: g.back }, dm: { [old]: { at: g.at } } };
      s.posts = [post];
      localStorage.setItem(window.__saveKey(), JSON.stringify(s));
    }, [FAR, SOCIAL_FIX, farPost]);
    await p.reload({ waitUntil: "load" });
    await p.waitForTimeout(900);
    const got = await p.evaluate(() => ({ social: window.__social(), posts: window.__posts() }));
    const fk = Object.keys((got.social && got.social.follows) || {});
    const one = fk.length === 1 ? fk[0] : "";
    const dm = one && got.social.dm ? got.social.dm[one] : null;
    const cm = ((Array.isArray(got.posts) ? got.posts : []).find((x) => x && x.cm) || {}).cm || null;
    return { fk, cm: cm ? JSON.stringify(cm) : null, back: one ? got.social.follows[one] : -1,
      dmAt: dm ? Number(dm.at) : -1 };
  };
  const far = await seatFar();
  check("save:an-unknown-town-key-passes-the-migration-untouched",
    far.fk.length === 1 && far.fk[0] === FAR_KEY && far.back === SOCIAL_FIX.back
    && far.dmAt === SOCIAL_FIX.at && far.cm === farCm,
    "wrote a follow, a dm and a post on " + FAR_KEY + ", a town the move table has no row for, and read back "
    + JSON.stringify(far.fk) + ", follow " + far.back + ", dm at " + far.dmAt + ", post record " + far.cm);
  /* 심은 대조군. 줄을 고르는 그 한 줄에서 도시를 마지막 줄로 다시 눌러 오늘의 바이트를 되살린다.
     앵커가 위 대조군이 세어 둔 그 줄이라, 막는 자를 함수의 어디에 세우든 대조군은 같은 자리에 선다. */
  if (hits.length === 1) {
    await p.route("**/web/src/state/passer.mjs", (r) => r.fulfill({ status: 200,
      contentType: "text/javascript; charset=utf-8",
      body: face.replace(hits[0], "const row = FACE_MOVES[Math.max(0, Math.min(FACE_MOVES.length - 1, c))];") }));
    const pinned = await seatFar();
    await p.unroute("**/web/src/state/passer.mjs");
    check("control:a-copy-without-the-guard-clamps-that-key-onto-the-last-row",
      pinned.fk.length === 1 && pinned.fk[0] !== FAR_KEY && pinned.cm !== farCm,
      "the clamped copy moved the follow to " + JSON.stringify(pinned.fk) + " and the post record to "
      + pinned.cm + ", neither of which is " + FAR_KEY);
  }
  check("console:no-errors", errs.length === 0, errs.slice(0, 3).join(" | ") || "clean");

  console.log(notes.map((s) => "  ok   " + s).join("\n"));
  if (fails.length) console.log(fails.map((s) => "  FAIL " + s).join("\n"));
  console.log(fails.length ? "save FAIL " + fails.length : "save PASS");
  if (fails.length) process.exitCode = 1;
} finally {
  clearTimeout(t);
  if (b) await b.close();
}
