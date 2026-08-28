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
      x.cen = m.centroid(d, 0, Math.max(60, x.tailMs));
      // 발소리는 두 접촉의 크기가 발마다 뒤집힌다. 한 번만 재면 뒷접촉이 큰 발에서
      // 상승이 25ms로 읽히고 게이트가 코드와 무관하게 붉어진다. 열한 번의 중앙값으로 잰다.
      const at = [];
      for (let i = 0; i < 11; i += 1) {
        at.push(m.attackMs(await m.renderSfx(sfx, name, ARG[name], LEN[name])));
      }
      x.attackMs = at.sort((u, v) => u - v)[5];
      x.tailBright = m.tailBrightness(d);
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
    // 노이즈 재생 배속이 발화마다 달라서 한 번만 재면 네 번에 한 번은 틀린 답이 나온다.
    // 귀가 듣는 것은 한 발이 아니라 수백 발의 분포다. 열한 번씩 재서 중앙값과 양 끝을 남긴다.
    const RUNS = 11;
    const med = (a) => a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)];
    const dbOf = async (name, arg) => {
      const v = [];
      for (let i = 0; i < RUNS; i += 1) {
        const d = await m.renderSfx(sfx, name, arg, LEN[name]);
        v.push(20 * Math.log10(rms(d) * 0.7));
      }
      return { med: Number(med(v).toFixed(1)), lo: Number(Math.min(...v).toFixed(1)), hi: Number(Math.max(...v).toFixed(1)) };
    };
    out.spread = {};
    out.db = {};
    for (const name of sfx.SFX_NAMES) {
      out.spread[name] = await dbOf(name, ARG[name]);
      out.db[name] = out.spread[name].med;
    }
    // 가장 작은 소리는 살짝 디디는 발소리다. 세게 디디는 쪽만 재면 바닥을 놓친다.
    out.spread.stepSoft = await dbOf('step', false);
    out.db.stepSoft = out.spread.stepSoft.med;
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

  // 몸. 차고 놓고 튀기는 것은 저역이 있어야 사물이다. 없으면 바람 소리다.
  // 다만 저역에만 쌓으면 노트북과 휴대폰 스피커가 통째로 못 낸다.
  // 저역 60% 이상을 요구하던 이 검사가 안 들리는 설계를 강제했다.
  // 그래프 피크 0.95에 400Hz 미만 97%는 작은 스피커에서 무음과 같다.
  // 양쪽을 다 재야 한다. 저역이 있어야 사물이고, 재생되는 대역이 있어야 소리다.
  for (const name of ["kick", "dribble", "place"]) {
    const lo = r.each[name].body.lo;
    check(name + ":body-has-weight", lo >= 0.28, lo.toFixed(3));
    check(name + ":survives-a-laptop-speaker", 1 - lo >= 0.3, (1 - lo).toFixed(3));
  }

  // 골대. 금속은 오래 울리고 배음이 정수배가 아니다.
  check("post:rings-longer-than-the-leather-sounds", r.each.post.tailMs >= 220, r.each.post.tailMs + "ms");
  check("post:modes-are-inharmonic", r.each.post.harmonicity >= 0.04, String(r.each.post.harmonicity));

  // 흙 위에 놓는 소리는 울리면 안 된다.
  check("place:does-not-ring", r.each.place.tailMs <= 90, r.each.place.tailMs + "ms");

  // 여기부터는 형용사를 잰다. 위의 검사는 전부 구조만 봐서, 킥이 골대보다 밝아도 초록이었다.
  // 바는 코드가 내는 값이 아니라 물리에서 나온다. 산출물에 맞춰 세운 바는 아무 말도 안 한다.
  //
  // 인스텝 킥은 크고 물렁한 가죽 구체를 9ms 남짓 누르는 일이다. 에너지가 100~600Hz에 몰린다.
  check("kick:is-a-dull-thump-not-a-bright-click", r.each.kick.cen <= 900, r.each.kick.cen + "Hz");
  // 먹먹함은 저역이 남는 것이다. 40ms에 끊기면 딱 소리지 퍽 소리가 아니다.
  check("kick:the-low-end-keeps-ringing-after-contact", r.each.kick.tailMs >= 80, r.each.kick.tailMs + "ms");
  // 알루미늄 크로스바는 712/1965/3845/6358 모드가 다 살아 울린다. 무게중심이 위로 올라간다.
  check("post:is-a-bright-metal-ring", r.each.post.cen >= 1800, r.each.post.cen + "Hz");
  // 먹먹하다와 명쾌하다가 같은 밝기면 두 형용사 중 하나는 구현되지 않은 것이다.
  check("post:reads-brighter-than-the-kick-by-ear",
    r.each.post.cen >= r.each.kick.cen * 2,
    "post " + r.each.post.cen + " vs kick " + r.each.kick.cen);
  // 울림이 금속을 들고 가야 튕이다. 앞머리만 밝으면 퍽 뒤에 웅웅이 붙은 것이다.
  check("post:the-ring-carries-the-metal-not-just-the-strike",
    r.each.post.tailBright >= 0.55, String(r.each.post.tailBright));
  // 튀어오르는 공과 내려놓는 공은 다른 소리다. 꼬리 길이가 갈라야 한다.
  check("dribble:bounces-instead-of-landing-dead", r.each.dribble.tailMs >= 90, r.each.dribble.tailMs + "ms");
  check("place:is-drier-than-the-dribble",
    r.each.dribble.tailMs >= r.each.place.tailMs * 1.6,
    "dribble " + r.each.dribble.tailMs + " vs place " + r.each.place.tailMs);
  // 세게 튀기는 것과 살짝 내려놓는 것이 같은 크기면 둘은 한 소리다.
  check("dribble:hits-harder-than-a-ball-set-down",
    r.each.dribble.peak >= r.each.place.peak * 1.5,
    r.each.dribble.peak + " vs " + r.each.place.peak);
  // 다섯 소리 다 부딪힌 소리다. 피크까지 12ms를 넘으면 켜진 소리로 들린다.
  for (const name of r.names) {
    check(name + ":peaks-like-an-impact-not-a-fade-in", r.each[name].attackMs <= 12,
      r.each[name].attackMs + "ms");
  }

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
  const incMed = Math.max(r.db.dribble, r.db.place, r.db.step);
  const incHi = Math.max(r.spread.dribble.hi, r.spread.place.hi, r.spread.step.hi);
  check("mix:the-kick-stays-above-the-incidental-sounds",
    r.db.kick >= incMed + 3,
    "kick " + r.db.kick + " vs " + incMed.toFixed(1));
  // 중앙값만 보면 운 나쁜 발에서 계층이 뒤집힌다. 제일 약한 슛이 제일 큰 잡음보다 위에 있어야 한다.
  check("mix:even-the-weakest-kick-outranks-the-loudest-incidental",
    r.spread.kick.lo >= incHi,
    "kick lo " + r.spread.kick.lo + " vs inc hi " + incHi.toFixed(1));


  // 살아 있는 소리. 위의 검사는 OfflineAudioContext라 마스터 게인을 지나지 않는다.
  // 음소거가 음량에 0을 써서 영영 무음이 되던 버그는 그 창 밖에서 일어났다.
  const live = await b.newContext();
  await live.addInitScript(() => {
    window.__acCount = 0;
    const AC0 = window.AudioContext;
    window.AudioContext = function (...a) { window.__acCount += 1; return new AC0(...a); };
    window.AudioContext.prototype = AC0.prototype;
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

  // 오디오 장치가 바뀌면 <audio>는 따라가고 AudioContext는 사라진 장치로 계속 내보낸다.
  // 그러면 음악만 남고 효과음이 사라진다. 신고된 증상과 정확히 같다.
  // 헤드리스는 장치가 하나라 진짜 전환을 못 만든다. 이벤트만 쏴서 복구를 잰다.
  // 장치가 하나뿐인 헤드리스에서는 소리가 난다는 것만으로는 아무 말도 안 된다.
  // 수리를 빼도 그 검사는 통과한다. 컨텍스트가 실제로 교체되었는지를 센다.
  const dev = await lp.evaluate(async () => {
    const before = window.__acCount;
    navigator.mediaDevices.dispatchEvent(new Event("devicechange"));
    await new Promise((r) => setTimeout(r, 200));
    window.__peakReset();
    window.__sfx.kick(1);
    await new Promise((r) => setTimeout(r, 450));
    return { opened: window.__acCount - before, peak: Number(window.__peakMax.toFixed(4)) };
  });
  check("live:a-device-swap-reopens-the-context-instead-of-shouting-at-the-gone-device",
    dev.opened === 1, "opened " + dev.opened);
  check("live:a-device-swap-does-not-take-the-effects-with-it", dev.peak > 0.02, String(dev.peak));

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

  // 발화마다 그래프를 새로 세우고 아무도 안 끊으면 마스터에 노드가 쌓인다.
  // 방치형이라 탭을 하루 켜두는 게 정상 사용이다. 6만 개까지 밀었을 때
  // 킥 피크가 0.83에서 1.99로 튀었고 골대 소리는 따다다다로 들렸다.
  // 발화 수가 아니라 남은 노드 수를 센다. 세지 않으면 안 보이는 종류의 고장이다.
  const leak = await gp.evaluate(async () => {
    const seen = new Set();
    const AC = window.AudioContext || window.webkitAudioContext;
    // 살아있는 컨텍스트에서 만들어진 노드를 세고, 끊긴 것을 빼야 한다.
    // 브라우저는 노드 수를 안 알려준다. 대신 우리가 끊는 그 두 개를 직접 감시한다.
    let alive = 0;
    const wrap = (proto, key) => {
      const f = proto[key];
      proto[key] = function (...a) {
        const n = f.apply(this, a);
        if (this.state !== "closed") {
          alive += 1;
          const d = n.disconnect.bind(n);
          n.disconnect = (...r) => { if (!seen.has(n)) { seen.add(n); alive -= 1; } return d(...r); };
        }
        return n;
      };
    };
    wrap(AC.prototype, "createWaveShaper");
    const before = alive;
    for (let i = 0; i < 300; i += 1) {
      window.__sfx.post();
      if (i % 25 === 0) await new Promise((r) => setTimeout(r, 4));
    }
    await new Promise((r) => setTimeout(r, 3200));
    return { before, after: alive };
  });
  check("live:three-hundred-shots-do-not-leave-three-hundred-nodes-on-the-master",
    leak.after - leak.before <= 5, "left " + (leak.after - leak.before));

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
  const legacyMix = await xp.evaluate(async () => {
    const m = await import("/web/src/audio/bgm.mjs");
    return { sfx: window.__sfx.volume, bgm: window.__bgm.volume, bed: m.BED };
  });
  check("live:a-legacy-stored-mix-loses-to-the-code-default",
    legacyMix.sfx === 0.9 && legacyMix.bgm === legacyMix.bed, JSON.stringify(legacyMix));
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
