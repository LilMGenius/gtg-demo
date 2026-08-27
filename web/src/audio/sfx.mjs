// 효과음. 샘플 없이 Web Audio로 합성한다.
// 파일을 안 쓰는 이유는 용량이 아니라 권리다. 우리가 만든 소리만 빌드에 들어간다.
//
// 현실감의 기준은 하나다. 한 소리는 몸(저역)과 접촉(고역 트랜지언트)을 같이 가져야 한다.
// 둘 중 하나만 있으면 삐 소리이거나 퍽 소리이지 사물이 부딪힌 소리가 아니다.
//
// 그래프를 만드는 함수는 전부 (ac, out, t0)를 받는다. 실시간 컨텍스트를 안 잡으므로
// OfflineAudioContext로 그대로 렌더해서 파형을 잴 수 있다. 귀 없이 소리를 검사하는 유일한 경로다.

import { readVolume } from './volume.mjs';

export const SFX_NAMES = ['kick', 'post', 'dribble', 'place', 'step'];

// 노이즈 소스는 색을 안 정한다. 흙이냐 가죽이냐 금속이냐는 체인의 필터가 정한다.
// 어두운 소스를 쓰면 그 뒤의 밴드패스가 통과시킬 게 남지 않는다. 측정으로 확인했다.
// 버퍼를 Math.random으로 채우면 런마다 스펙트럼이 달라져 계측값이 튀고, 게이트가
// 코드가 그대로인데도 세 번에 한 번꿩 빨간불을 켜다. 버퍼는 고정하고
// 개별 재생의 배속도와 시점만 흔든다. 귀에는 같은 변화가 남는다.
export function makeNoise(ac, seconds = 1.2) {
  const n = Math.floor(ac.sampleRate * seconds);
  const buf = ac.createBuffer(1, n, ac.sampleRate);
  const d = buf.getChannelData(0);
  let s = 0x2f6e2b1 >>> 0;
  for (let i = 0; i < n; i += 1) {
    s = (s * 1664525 + 1013904223) >>> 0;
    d[i] = (s / 0x80000000) - 1;
  }
  return buf;
}

// 즉시 시작, 지수 감쇠. 트랜지언트의 기본형이다.
function env(g, peak, decay, t0) {
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + decay);
}

function noiseAt(ac, noise, t0, dur) {
  const s = ac.createBufferSource();
  s.buffer = noise;
  s.loop = true;
  s.playbackRate.value = 0.85 + Math.random() * 0.3;
  s.start(t0);
  s.stop(t0 + dur + 0.05);
  return s;
}

// 겹친 층이 더해지면서 1을 넘었다. 측정된 피크가 1.73이었고 그건 디지털 클리핑이다.
// 잘라내는 대신 곡선으로 눕힌다. 0.66까지는 3차, 그 위는 tanh.
// 몸과 접촉을 둘 다 크게 쓰면서 한계를 안 넘는 유일한 방법이다.
function softClipCurve(n = 2048) {
  const c = new Float32Array(n);
  for (let i = 0; i < n; i += 1) {
    const x = (i / (n - 1)) * 2 - 1;
    const a = Math.abs(x);
    const y = a <= 0.66 ? a - (a * a * a) / 3 : Math.tanh(a);
    c[i] = Math.sign(x) * y;
  }
  return c;
}

function clipper(ac, out) {
  const w = ac.createWaveShaper();
  w.curve = softClipCurve();
  w.oversample = '2x';
  const g = ac.createGain();
  g.gain.value = 1.15;
  w.connect(g).connect(out);
  return w;
}

// 접촉의 순간. 짧고 높다.
// 몸만 있으면 북이고, 이 몇 밀리초가 붙어야 무언가에 맞은 소리가 된다.
// 측정이 잡아냈다. 어택 창의 고역 비중이 2%까지 내려가 있었고 그건 퍽 소리다.
function snap(ac, out, noise, t0, peak, freq, dur) {
  const s = noiseAt(ac, noise, t0, dur);
  const hp = ac.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = freq;
  const tilt = ac.createBiquadFilter();
  tilt.type = 'peaking';
  tilt.frequency.value = freq * 1.7;
  tilt.Q.value = 0.8;
  tilt.gain.value = 7;
  const g = ac.createGain();
  env(g, peak, dur, t0);
  s.connect(hp).connect(tilt).connect(g).connect(out);
}

// 공을 차는 소리. 먹먹한 쪽은 가죽이 눌리는 저역이고, 발등이 닿는 순간은 고역이다.
// 고역만 키우면 풍선 터지는 소리가 되고, 저역만 남기면 북이 된다.
// 노트북과 휴대폰 스피커는 300Hz 아래를 못 낸다. sine으로 52Hz까지 내리면
// 그래프 피크가 0.95여도 귀에는 아무것도 안 남는다. 무음 신고 일곱 번째의 정체다.
// triangle은 같은 피치에 홀수 배음을 달고 나온다. 작은 스피커는 그 배음을 듣고
// 내려가지 않는 기음을 귀가 채워 넣는다. 큰 스피커에서는 저역이 그대로 남는다.
function kick(ac, out, noise, t0, power = 0.6) {
  const p = Math.min(1, Math.max(0, power));

  const body = ac.createOscillator();
  body.type = 'triangle';
  body.frequency.setValueAtTime(196 + p * 52, t0);
  body.frequency.exponentialRampToValueAtTime(112, t0 + 0.13);
  const bg = ac.createGain();
  env(bg, 0.05 + p * 0.07, 0.17, t0);
  body.connect(bg).connect(out);
  body.start(t0);
  body.stop(t0 + 0.3);

  const skin = noiseAt(ac, noise, t0, 0.09);
  const lp = ac.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(2100 + p * 1500, t0);
  lp.frequency.exponentialRampToValueAtTime(880, t0 + 0.08);
  lp.Q.value = 0.7;
  const hp = ac.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 340;
  const sg = ac.createGain();
  // 부드러운 킥과 강슈가 소프트클리퍼 안에서 같은 크기로 눌렸다.
  // 약한 쪽 바닥을 내려서 세기 차이를 다시 들리게 한다.
  env(sg, 0.21 + p * 0.72, 0.09, t0);
  skin.connect(lp).connect(hp).connect(sg).connect(out);

  snap(ac, out, noise, t0, 0.19 + p * 0.70, 2400, 0.016);
}

// 골대 맞는 소리. 알루미늄 관의 배음은 정수배가 아니다.
// 정수배로 쌓으면 종소리가 되고 축구장이 아니라 교회가 된다.
// 관의 굽힘 모드는 1 : 2.76 : 5.40 : 8.93 근처에 선다. 눈대중으로 고른 값은
// 정수배로 미끄러지고 그러면 종소리가 된다. 측정 게이트가 그걸 잡아냈다.
const POST_MODES = [712, 1965, 3845, 6358];
function post(ac, out, noise, t0) {
  const detune = 0.97 + Math.random() * 0.06;

  POST_MODES.forEach((f, i) => {
    const o = ac.createOscillator();
    o.type = 'sine';
    o.frequency.value = f * detune;
    const g = ac.createGain();
    // 위 모드일수록 빨리 죽는다. 금속이 울리다 마는 소리가 여기서 나온다.
    env(g, 0.3 / (i + 1.2), 0.9 - i * 0.16, t0);
    o.connect(g).connect(out);
    o.start(t0);
    o.stop(t0 + 1.0);
  });

  // 맞는 순간의 마찰. 이 5ms가 없으면 울림만 남고 접촉이 안 들린다.
  const scr = noiseAt(ac, noise, t0, 0.02);
  const hp = ac.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 2600;
  const g = ac.createGain();
  env(g, 0.22, 0.02, t0);
  scr.connect(hp).connect(g).connect(out);
}

// 드리블. 차는 소리와 같은 재질이라 형태는 같고 크기만 다르다.
function dribble(ac, out, noise, t0) {
  const o = ac.createOscillator();
  o.type = 'triangle';
  o.frequency.setValueAtTime(248, t0);
  o.frequency.exponentialRampToValueAtTime(164, t0 + 0.09);
  const g = ac.createGain();
  env(g, 0.045, 0.12, t0);
  const lp = ac.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 1500;
  o.connect(lp).connect(g).connect(out);
  o.start(t0);
  o.stop(t0 + 0.25);

  const tap = noiseAt(ac, noise, t0, 0.03);
  const bp = ac.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 1800;
  bp.Q.value = 1.0;
  const tg = ac.createGain();
  env(tg, 0.36, 0.03, t0);
  tap.connect(bp).connect(tg).connect(out);

  snap(ac, out, noise, t0, 0.28, 2600, 0.012);
}

// 공을 땅에 놓는 소리. 흙 위에 얹는 것이라 울림이 없다.
// 마른 마찰 한 겹과 아주 짧은 저역 하나. 그 이상 넣으면 공이 아니라 상자가 된다.
function place(ac, out, noise, t0) {
  const dirt = noiseAt(ac, noise, t0, 0.11);
  const bp = ac.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.setValueAtTime(1400, t0);
  bp.frequency.exponentialRampToValueAtTime(560, t0 + 0.1);
  bp.Q.value = 0.9;
  const dg = ac.createGain();
  env(dg, 0.40, 0.11, t0);
  dirt.connect(bp).connect(dg).connect(out);

  const thud = ac.createOscillator();
  thud.type = 'triangle';
  thud.frequency.value = 172;
  const tg = ac.createGain();
  env(tg, 0.035, 0.07, t0);
  thud.connect(tg).connect(out);
  thud.start(t0);
  thud.stop(t0 + 0.15);

  snap(ac, out, noise, t0, 0.30, 3000, 0.009);
}

// 발소리. 뒤꿈치와 앞꿈치가 십수 밀리초 간격으로 두 번 닿는다.
// 한 겹이면 망치질이고 두 겹이라야 사람 발이다.
function step(ac, out, noise, t0, hard = false) {
  const layer = (at, peak, freq) => {
    const s = noiseAt(ac, noise, at, 0.06);
    const bp = ac.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = freq;
    bp.Q.value = 1.1;
    const g = ac.createGain();
    env(g, peak, 0.055, at);
    s.connect(bp).connect(g).connect(out);
  };
  // 발소리는 현실에서 작다. 그러나 음악과 같이 나면 없는 소리가 된다.
  const loud = hard ? 1.1 : 0.85;
  layer(t0, loud, 900 + Math.random() * 260);
  layer(t0 + 0.012 + Math.random() * 0.006, loud * 0.7, 1400 + Math.random() * 260);
}

// 이름 하나로 그래프를 세운다. 실시간과 오프라인이 같은 함수를 탄다.
// 검사한 소리와 들리는 소리가 다르면 검사가 아무 말도 안 한 것이 된다.
export function buildSfx(name, ac, out, noise, t0, arg) {
  out = clipper(ac, out);
  if (name === 'kick') return kick(ac, out, noise, t0, arg ?? 0.6);
  if (name === 'post') return post(ac, out, noise, t0);
  if (name === 'dribble') return dribble(ac, out, noise, t0);
  if (name === 'place') return place(ac, out, noise, t0);
  if (name === 'step') return step(ac, out, noise, t0, arg ?? false);
  throw new Error('unknown sfx ' + name);
}

const KEY = 'gtg.sfx.volume';

export function mountSfx() {
  let ctx = null;
  let master = null;
  let noise = null;
  let muted = false;
  // 0.7은 마스터에서 3dB를 그냥 버리는 값이다. 헤드룸이 아니라 노트북 스피커로 듣는다.
  let level = readVolume(KEY, 0.9);

  function ensure() {
    if (ctx && ctx.state !== 'closed') return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : level;
    master.connect(ctx.destination);
    noise = makeNoise(ctx);
    return ctx;
  }

  // 장치가 바뀌면 <audio>는 새 장치로 따라가고 AudioContext는 안 따라간다.
  // 헤드셋을 빼거나 블루투스가 붙으면 음악만 남고 효과음은 사라진 장치로 계속 나간다.
  // 무음 신고가 다섯 번 동안 게이트에서 한 번도 재현되지 않은 이유다. 헤드리스에는 장치가 하나다.
  // 장치가 바뀌었다는 신호를 받으면 컨텍스트를 버리고 다음 발화에서 새로 열어 잡는다.
  const drop = () => {
    const dead = ctx;
    ctx = null;
    master = null;
    noise = null;
    if (dead && dead.state !== 'closed') dead.close().catch(() => {});
  };
  if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) {
    navigator.mediaDevices.addEventListener('devicechange', drop);
  }

  const fire = (name, arg) => {
    const ac = ensure();
    if (!ac) return;
    // 브라우저는 신뢰하지 않는 입력으로 열린 컨텍스트를 다시 재우기도 한다.
    // BGM은 <audio> 요소라 살아있고 효과음만 죽는다. 헤드리스에서는 재현이 안 된다.
    // 발화 직전에 상태를 보고 깨운다. 깨우는 동안 한 발은 버리고 다음 발부터 들린다.
    if (ac.state !== 'running') ac.resume();
    // 영상 캡처는 소리를 담지 못한다. 발화 시각을 남겨두면 같은 소리를 같은 자리에 깔아 넣을 수 있다.
    if (window.__sfxLog) window.__sfxLog.push([name, arg ?? null, performance.now()]);
    buildSfx(name, ac, master, noise, ac.currentTime, arg);
  };

  // 브라우저는 첫 입력 전에 오디오를 안 열어준다. 그래서 입력에 붙여 깨운다.
  const wake = () => {
    const ac = ensure();
    if (ac && ac.state === 'suspended') ac.resume();
  };
  for (const ev of ['pointerdown', 'keydown', 'touchstart']) {
    document.addEventListener(ev, wake, { passive: true });
  }

  return {
    kick: (power) => fire('kick', power),
    post: () => fire('post'),
    dribble: () => fire('dribble'),
    place: () => fire('place'),
    step: (hard) => fire('step', hard),
    get volume() { return level; },
    set volume(v) {
      level = Math.min(1, Math.max(0.01, v));
      if (!muted && ensure()) master.gain.value = level;
      localStorage.setItem(KEY, String(level));
    },
    // 음소거는 음량과 따로 산다. 음량에 0을 써버리면 다시 켜는 것이 아니라 음량을 잊는 것이다.
    get muted() { return muted; },
    set muted(on) {
      muted = !!on;
      if (master) master.gain.value = muted ? 0 : level;
    }
  };
}
