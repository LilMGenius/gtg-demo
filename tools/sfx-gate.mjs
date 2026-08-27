import { chromium } from "playwright";

// 소리 게이트. 귀 대신 파형을 잰다.
// 선언값을 안 읽는다. sfx.mjs가 실제로 렌더한 샘플만 본다.
//
// 대조군 셋이 붙어 있다. 정수배로 쌓은 가짜 골대는 반드시 거부되고,
// 한 겹짜리 발소리도 거부되고, 사각파 삐 소리도 거부돼야 한다.
// 셋 다 예상대로 나와야 이 계측기가 무엇을 보고 있다고 말할 수 있다.
const EXE = process.env.LOCALAPPDATA + "/ms-playwright/chromium-1228/chrome-win64/chrome.exe";
const URL = "http://127.0.0.1:10310/web/index.html";
const t = setTimeout(() => { console.log("WATCHDOG"); process.exit(1); }, 180000);
t.unref();

const fails = [];
const notes = [];
function check(name, ok, detail) {
  (ok ? notes : fails).push(name + " " + detail);
}

let b;
try {
  b = await chromium.launch({ executablePath: EXE });
  const p = await (await b.newContext()).newPage();
  const errs = [];
  p.on("pageerror", (e) => errs.push(String(e)));
  await p.goto(URL, { waitUntil: "load" });

  const r = await p.evaluate(async () => {
    const sfx = await import("/web/src/audio/sfx.mjs");
    const m = await import("/web/src/audio/meter.mjs");
    const LEN = { kick: 0.6, post: 1.4, dribble: 0.5, place: 0.4, step: 0.4 };
    const ARG = { kick: 0.6, step: true };
    const out = { names: sfx.SFX_NAMES.slice(), each: {} };
    for (const name of sfx.SFX_NAMES) {
      const d = await m.renderSfx(sfx, name, ARG[name], LEN[name]);
      const x = m.measure(d);
      x.harmonicity = Number(m.harmonicity(x.peaks).toFixed(3));
      out.each[name] = x;
    }
    out.kickSoft = Number(m.peakOf(await m.renderSfx(sfx, "kick", 0.05, 0.6)).toFixed(4));
    out.kickHard = Number(m.peakOf(await m.renderSfx(sfx, "kick", 1.0, 0.6)).toFixed(4));

    const a = await m.renderSfx(sfx, "step", true, 0.4);
    const c = await m.renderSfx(sfx, "step", true, 0.4);
    let diff = 0;
    for (let i = 0; i < a.length; i += 1) diff = Math.max(diff, Math.abs(a[i] - c[i]));
    out.stepVariation = Number(diff.toFixed(4));

    const bell = await m.renderRaw((ac, g) => {
      [712, 1424, 2848, 5696].forEach((f, i) => {
        const o = ac.createOscillator();
        o.type = "sine";
        o.frequency.value = f;
        const gg = ac.createGain();
        gg.gain.setValueAtTime(0.0001, 0);
        gg.gain.exponentialRampToValueAtTime(0.3 / (i + 1.2), 0.004);
        gg.gain.exponentialRampToValueAtTime(0.0001, 0.9 - i * 0.16);
        o.connect(gg).connect(g);
        o.start(0);
        o.stop(1.2);
      });
    }, 1.4);
    out.bellHarmonicity = Number(m.harmonicity(m.measure(bell).peaks).toFixed(3));

    const hammer = await m.renderRaw((ac, g, noise) => {
      const s = ac.createBufferSource();
      s.buffer = noise;
      s.loop = true;
      s.start(0);
      s.stop(0.1);
      const bp = ac.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = 900;
      bp.Q.value = 1.1;
      const gg = ac.createGain();
      gg.gain.setValueAtTime(0.0001, 0);
      gg.gain.exponentialRampToValueAtTime(0.34, 0.004);
      gg.gain.exponentialRampToValueAtTime(0.0001, 0.055);
      s.connect(bp).connect(gg).connect(g);
    }, 0.4);
    out.hammerContacts = m.contacts(hammer);

    const beep = await m.renderRaw((ac, g) => {
      const o = ac.createOscillator();
      o.type = "square";
      o.frequency.value = 880;
      const gg = ac.createGain();
      gg.gain.value = 0.3;
      o.connect(gg).connect(g);
      o.start(0);
      o.stop(0.2);
    }, 0.4);
    out.beepAttackHi = Number(m.bands(beep, 0, 12).hi.toFixed(4));

    // 효과음이 나는 것과 들리는 것은 다른 말이다. 베드 밑으로 내려가면 안 난 것과 같다.
    const rms = (d) => {
      let peak = 0;
      for (let i = 0; i < d.length; i += 1) peak = Math.max(peak, Math.abs(d[i]));
      const thr = peak * 0.1;
      let sum = 0;
      let n = 0;
      for (let i = 0; i < d.length; i += 1) {
        if (Math.abs(d[i]) > thr) { sum += d[i] * d[i]; n += 1; }
      }
      return Math.sqrt(sum / Math.max(1, n));
    };
    out.db = {};
    for (const name of sfx.SFX_NAMES) {
      const d = await m.renderSfx(sfx, name, ARG[name], LEN[name]);
      out.db[name] = Number((20 * Math.log10(rms(d) * 0.7)).toFixed(1));
    }
    // 가장 작은 소리는 살짝 디디는 발소리다. 세게 디디는 쪽만 재면 바닥을 놓친다.
    const soft = await m.renderSfx(sfx, 'step', false, LEN.step);
    out.db.stepSoft = Number((20 * Math.log10(rms(soft) * 0.7)).toFixed(1));
    out.quietSfxDb = Math.min(...Object.values(out.db));

    const bgm = await import('/web/src/audio/bgm.mjs');
    const raw = await (await fetch('/web/assets/audio/bgm.m4a')).arrayBuffer();
    const ac = new OfflineAudioContext(1, 8, m.SR);
    const buf = await ac.decodeAudioData(raw);
    out.bedDb = Number((20 * Math.log10(rms(buf.getChannelData(0)) * bgm.BED)).toFixed(1));
    return out;
  });

  // 대조군 먼저. 계측기가 갈라내지 못하면 아래 판정은 전부 무의미하다.
  // FFT 빈 해상도 때문에 완벽한 정수배도 0이 아니라 0.013으로 읽힌다.
  // 관은 어떤 세 모드를 집어도 0.08 아래로 내려오지 않는다. 그 사이에 선을 긋는다.
  check("control:integer-stack-reads-as-a-bell", r.bellHarmonicity <= 0.03, String(r.bellHarmonicity));
  check("control:one-layer-step-reads-as-a-hammer", r.hammerContacts === 1, String(r.hammerContacts));
  check("control:square-wave-has-no-contact-transient", r.beepAttackHi < 0.12, String(r.beepAttackHi));

  // 다섯 소리가 다 존재한다. 이름이 빠지면 호출부가 조용히 죽는다.
  check("sfx:five-sounds-present", r.names.length === 5, r.names.join(","));

  for (const name of r.names) {
    const x = r.each[name];
    // 클리핑. 1을 넘으면 스피커에서 지직거린다.
    check(name + ":stays-under-full-scale", x.peak > 0.02 && x.peak < 0.99, String(x.peak));
    // 접촉의 고역. 이게 없으면 몸만 남고 퍽 소리가 된다.
    check(name + ":attack-carries-a-contact-transient", x.attack.hi >= 0.05, x.attack.hi.toFixed(3));
  }

  // 몸. 차고 놓고 튀기는 것은 저역이 우세해야 사물이다.
  for (const name of ["kick", "dribble", "place"]) {
    check(name + ":body-is-low-heavy", r.each[name].body.lo >= 0.6, r.each[name].body.lo.toFixed(3));
  }

  // 골대. 금속은 오래 울리고 배음이 정수배가 아니다.
  check("post:rings-longer-than-the-leather-sounds", r.each.post.tailMs >= 220, r.each.post.tailMs + "ms");
  check("post:modes-are-inharmonic", r.each.post.harmonicity >= 0.04, String(r.each.post.harmonicity));

  // 흙 위에 놓는 소리는 울리면 안 된다.
  check("place:does-not-ring", r.each.place.tailMs <= 90, r.each.place.tailMs + "ms");

  // 발은 뒤꿈치와 앞꿈치로 두 번 닿는다.
  check("step:lands-on-two-contacts", r.each.step.contacts === 2, String(r.each.step.contacts));
  check("step:repeats-are-not-identical", r.stepVariation > 0.01, String(r.stepVariation));

  // 세기가 안 들리면 약한 슛과 강슛이 같은 소리다.
  check("kick:power-changes-what-you-hear", r.kickHard >= r.kickSoft * 1.4,
    r.kickSoft + " -> " + r.kickHard);

  // 음악이 발소리보다 크면 효과음은 나와도 안 난다. 파운더가 신고한 것이 그것이다.
  // 간신히 넘기는 것으로는 부족하다. 묻히지 않고 들리려면 여유가 필요하다.
  check("mix:the-quietest-sound-clears-the-music-bed-by-3dB", r.quietSfxDb - r.bedDb >= 3,
    "sfx " + r.quietSfxDb.toFixed(1) + "dB vs bed " + r.bedDb + "dB");
  // 현실의 계층이 뒤집힐 수 있다. 공을 놓거나 디디는 소리가 슛만큼 크면 믹스가 깨진 것이다.
  check("mix:the-kick-stays-above-the-incidental-sounds",
    r.db.kick >= Math.max(r.db.dribble, r.db.place, r.db.step) + 3,
    JSON.stringify(r.db));


  // 살아 있는 소리. 위의 검사는 OfflineAudioContext라 마스터 게인을 지나지 않는다.
  // 음소거가 음량에 0을 써서 영영 무음이 되던 버그는 그 창 밖에서 일어났다.
  const live = await b.newContext();
  await live.addInitScript(() => {
    const AC = window.AudioContext;
    const gain0 = AC.prototype.createGain;
    AC.prototype.createGain = function () {
      const node = gain0.call(this);
      const self = this;
      if (!self.__tap) {
        const a = self.createAnalyser();
        a.fftSize = 2048;
        self.__tap = a;
        const buf = new Float32Array(a.fftSize);
        window.__peakMax = 0;
        window.__peakReset = () => { window.__peakMax = 0; };
        const tick = () => {
          a.getFloatTimeDomainData(buf);
          for (let i = 0; i < buf.length; i += 1) {
            const v = Math.abs(buf[i]);
            if (v > window.__peakMax) window.__peakMax = v;
          }
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }
      const conn = node.connect.bind(node);
      node.connect = (dst, ...rest) => {
        const out = conn(dst, ...rest);
        if (dst === self.destination) conn(self.__tap);
        return out;
      };
      return node;
    };
  });
  const lp = await live.newPage();
  lp.on("pageerror", (e) => errs.push(String(e)));
  await lp.goto(URL, { waitUntil: "load" });
  // 음소거를 한 번 눌렀던 브라우저의 저장 상태를 그대로 만든다.
  await lp.evaluate(() => { localStorage.clear(); localStorage.setItem("gtg.sfx.volume", "0"); });
  await lp.reload({ waitUntil: "load" });
  await lp.waitForTimeout(600);
  const tap = (sel) => lp.evaluate((s) => {
    const g = document.querySelector(s);
    const r = g.getBoundingClientRect();
    const o = { bubbles: true, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2 };
    g.dispatchEvent(new PointerEvent("pointerdown", o));
    g.dispatchEvent(new MouseEvent("click", o));
  }, sel);
  const firePeak = () => lp.evaluate(async () => {
    window.__peakReset();
    window.__sfx.kick(1);
    await new Promise((r) => setTimeout(r, 450));
    return Number(window.__peakMax.toFixed(4));
  });
  await tap("#go");
  await lp.waitForTimeout(900);
  const legacyZero = await firePeak();
  await tap("#mute");
  await lp.waitForTimeout(250);
  const whileMuted = await firePeak();
  await tap("#mute");
  await lp.waitForTimeout(250);
  const afterUnmute = await firePeak();
  const stored = await lp.evaluate(() => localStorage.getItem("gtg.sfx.volume"));
  await lp.reload({ waitUntil: "load" });
  await lp.waitForTimeout(600);
  await tap("#go");
  await lp.waitForTimeout(900);
  const afterReload = await firePeak();

  check("control:mute-silences-the-live-master", whileMuted < 0.005, String(whileMuted));
  check("live:a-stored-zero-volume-still-makes-sound", legacyZero > 0.02, String(legacyZero));
  check("live:unmute-gives-back-what-mute-took", afterUnmute > 0.02, String(afterUnmute));
  // 믹스는 코드가 소유한다. 화면에 음량 슬라이더가 없으니 저장된 믹스는 잔재뿐이다.
  // 잔재가 남아있으면 그 브라우저만 새 믹스를 영영 받지 못한다.
  check("live:no-stored-mix-survives-a-reload", stored === null, String(stored));
  check("live:sound-survives-a-reload-after-a-mute-toggle", afterReload > 0.02, String(afterReload));

  // 발화되는 것과 소리가 난다고 느끼는 것은 다른 말이다.
  // 슛 한 번만 울리고 결과 연출 수초가 통째로 조용하면 플레이어는 무음이라고 말한다.
  // 사건마다 강제로 발동시켜 어느 결과가 무음으로 끝나는지 센다.
  const KINDS = ["catch", "save", "spill", "rebound", "reboundMiss", "gloveGone",
    "charge", "beat", "carriedIn", "downed", "lost", "talked", "distracted", "openGoalScored", "skied",
    "miss"];
  const silent = await lp.evaluate(async (kinds) => {
    const out = [];
    for (const k of kinds) {
      window.__sfxLog = [];
      window.__act(k);
      await new Promise((r) => setTimeout(r, 1200));
      if (window.__sfxLog.length === 0) out.push(k);
    }
    return out;
  }, KINDS);
  check("live:every-outcome-makes-at-least-one-sound", silent.length === 0,
    silent.join(",") || String(KINDS.length) + " kinds");

  // 사건마다 소리가 나는 것과 플레이 내내 소리가 들리는 것은 다른 말이다.
  // 사건을 전부 채워도 공을 다시 세우는 몇 초가 비어 있으면 무음으로 신고된다.
  // 선언이 아니라 마스터를 직접 탭해서 가장 긴 조용한 구간을 초로 잰다.
  // AnalyserNode 폴링은 버킷 사이를 흘려 피크를 놓친다. ScriptProcessor만 유효하다.
  const TAP_MASTER = () => {
    window.__buckets = [];
    const AC = window.AudioContext;
    const gain0 = AC.prototype.createGain;
    AC.prototype.createGain = function (...a) {
      const node = gain0.apply(this, a);
      const self = this;
      const conn = node.connect.bind(node);
      node.connect = (dst, ...rest) => {
        if (dst === self.destination && !self.__tap) {
          const sp = self.createScriptProcessor(1024, 1, 1);
          self.__tap = sp;
          sp.onaudioprocess = (e) => {
            const d = e.inputBuffer.getChannelData(0);
            let m = 0;
            for (let i = 0; i < d.length; i += 1) { const v = Math.abs(d[i]); if (v > m) m = v; }
            window.__buckets.push([self.currentTime, m]);
          };
          sp.connect(self.destination);
          conn(sp);
        }
        return conn(dst, ...rest);
      };
      return node;
    };
  };
  const gapCtx = await b.newContext();
  await gapCtx.addInitScript(TAP_MASTER);
  const gp = await gapCtx.newPage();
  gp.on("pageerror", (e) => errs.push(String(e)));
  await gp.goto(URL, { waitUntil: "load" });
  await gp.waitForTimeout(900);
  await gp.evaluate(() => {
    const g = document.querySelector("#go");
    const r = g.getBoundingClientRect();
    const o = { bubbles: true, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2 };
    g.dispatchEvent(new PointerEvent("pointerdown", o));
    g.dispatchEvent(new MouseEvent("click", o));
  });
  await gp.waitForTimeout(1400);
  await gp.evaluate(() => { window.__buckets = []; });
  await gp.keyboard.press("ArrowLeft");
  await gp.waitForTimeout(16000);
  const maxGap = await gp.evaluate(() => {
    const bs = window.__buckets;
    let gap = 0;
    let prev = bs.length ? bs[0][0] : 0;
    for (const [t, v] of bs) { if (v > 0.01) { if (t - prev > gap) gap = t - prev; prev = t; } }
    return Number(gap.toFixed(2));
  });
  check("live:play-never-goes-quiet-for-more-than-four-seconds", maxGap > 0 && maxGap <= 4,
    maxGap + "s");

  // 여기까지는 전부 새 브라우저다. 새 브라우저는 코드의 믹스를 그대로 받는다.
  // 신고자는 지난 구현의 믹스가 저장된 채 남은 브라우저였다.
  // BGM은 audio 요소라 마스터 탭에 잡히지 않는다. 그래서 재는 것은 파형이 아니라
  // 재생 직전의 두 음량 자체다. 잔재가 코드 기본값을 이기면 새 믹스는 영영 안 간다.
  const legacyCtx = await b.newContext();
  await legacyCtx.addInitScript(() => {
    localStorage.setItem("gtg.sfx.volume", "0.7");
    localStorage.setItem("gtg.bgm.volume", "0.1");
  });
  const xp = await legacyCtx.newPage();
  await xp.goto(URL, { waitUntil: "load" });
  await xp.waitForTimeout(900);
  const legacyMix = await xp.evaluate(() => {
    return { sfx: window.__sfx.volume, bgm: window.__bgm.volume };
  });
  check("live:a-legacy-stored-mix-loses-to-the-code-default",
    legacyMix.sfx === 0.9 && legacyMix.bgm === 0.072, JSON.stringify(legacyMix));
  await legacyCtx.close();

  check("console:no-errors", errs.length === 0, errs.slice(0, 3).join(" | ") || "clean");

  console.log(notes.map((s) => "  ok   " + s).join("\n"));
  if (fails.length) console.log(fails.map((s) => "  FAIL " + s).join("\n"));
  console.log(fails.length ? "sfx FAIL " + fails.length : "sfx PASS " + notes.length);
  if (fails.length) process.exitCode = 1;
} finally {
  clearTimeout(t);
  if (b) await b.close();
}
