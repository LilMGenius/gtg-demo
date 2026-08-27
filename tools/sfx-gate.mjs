import { chromium } from "playwright";

// 소리 게이트. 귀 대신 파형을 잰다.
// 선언값을 안 읽는다. sfx.mjs가 실제로 렌더한 샘플만 본다.
//
// 대조군 셋이 붙어 있다. 정수배로 쌓은 가짜 골대는 반드시 거부되고,
// 한 겹짜리 발소리도 거부되고, 사각파 삐 소리도 거부돼야 한다.
// 셋 다 예상대로 나와야 이 계측기가 무엇을 보고 있다고 말할 수 있다.
const EXE = process.env.LOCALAPPDATA + "/ms-playwright/chromium-1228/chrome-win64/chrome.exe";
const URL = "http://127.0.0.1:10310/web/index.html";
const t = setTimeout(() => { console.log("WATCHDOG"); process.exit(1); }, 85000);
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

  check("console:no-errors", errs.length === 0, errs.slice(0, 3).join(" | ") || "clean");

  console.log(notes.map((s) => "  ok   " + s).join("\n"));
  if (fails.length) console.log(fails.map((s) => "  FAIL " + s).join("\n"));
  console.log(fails.length ? "sfx FAIL " + fails.length : "sfx PASS " + notes.length);
  if (fails.length) process.exitCode = 1;
} finally {
  clearTimeout(t);
  if (b) await b.close();
}
