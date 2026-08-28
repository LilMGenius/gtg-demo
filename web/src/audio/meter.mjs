// 소리를 귀 없이 재는 계측기. sfx.mjs의 그래프 함수를 OfflineAudioContext로 렌더해서
// 파형 자체를 잰다. 선언값이 아니라 나온 소리를 잰다.
//
// 창을 둘로 나눈다. 접촉은 십수 밀리초 안에 끝나고 몸은 그 뒤로 남는다.
// 한 창으로만 재면 긴 저역이 짧은 고역을 항상 이기고, 접촉이 없어도 통과한다.

export const SR = 48000;

export async function renderSfx(mod, name, arg, seconds) {
  const ac = new OfflineAudioContext(1, Math.floor(SR * seconds), SR);
  const g = ac.createGain();
  g.gain.value = 1;
  g.connect(ac.destination);
  const noise = mod.makeNoise(ac, 1.2);
  mod.buildSfx(name, ac, g, noise, 0, arg);
  return (await ac.startRendering()).getChannelData(0);
}

export async function renderRaw(fn, seconds) {
  const ac = new OfflineAudioContext(1, Math.floor(SR * seconds), SR);
  const g = ac.createGain();
  g.gain.value = 1;
  g.connect(ac.destination);
  const noise = (() => {
    const n = Math.floor(SR * 1.2);
    const buf = ac.createBuffer(1, n, SR);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i += 1) d[i] = Math.random() * 2 - 1;
    return buf;
  })();
  fn(ac, g, noise);
  return (await ac.startRendering()).getChannelData(0);
}

function rmsEnvelope(d, hopMs) {
  const hop = Math.max(1, Math.floor((SR * hopMs) / 1000));
  const e = [];
  for (let i = 0; i + hop <= d.length; i += hop) {
    let s = 0;
    for (let j = 0; j < hop; j += 1) s += d[i + j] * d[i + j];
    e.push(Math.sqrt(s / hop));
  }
  return e;
}

// 접촉을 몇 번 하는지. hop 1ms라야 뒤꿈치와 앞꿈치가 갈라진다.
// 4ms로 재면 두 겹과 한 겹이 같은 값을 내고, 그 지표는 아무 말도 안 한 것이 된다.
export function contacts(d) {
  const e = rmsEnvelope(d, 1);
  const pk = Math.max(...e);
  if (pk <= 0) return 0;
  let n = 0;
  let armed = true;
  for (let i = 0; i < e.length; i += 1) {
    if (armed && e[i] > pk * 0.45) { n += 1; armed = false; }
    if (!armed && e[i] < pk * 0.2) armed = true;
  }
  return n;
}

export function peakOf(d) {
  let m = 0;
  for (let i = 0; i < d.length; i += 1) m = Math.max(m, Math.abs(d[i]));
  return m;
}

// 피크의 5% 아래로 내려가 다시 안 올라오는 지점. 울림의 길이다.
export function tailMs(d) {
  const e = rmsEnvelope(d, 4);
  const pk = Math.max(...e);
  let last = 0;
  for (let i = 0; i < e.length; i += 1) if (e[i] > pk * 0.05) last = i;
  return last * 4;
}

function goertzel(d, f, from, len) {
  const w = (2 * Math.PI * f) / SR;
  const c = 2 * Math.cos(w);
  let s1 = 0;
  let s2 = 0;
  const end = Math.min(d.length, from + len);
  for (let i = from; i < end; i += 1) {
    const s0 = d[i] + c * s1 - s2;
    s2 = s1;
    s1 = s0;
  }
  return Math.sqrt(Math.abs(s1 * s1 + s2 * s2 - c * s1 * s2)) / (end - from);
}

export function spectrum(d, fromMs, lenMs) {
  const from = Math.floor((SR * fromMs) / 1000);
  const len = Math.floor((SR * lenMs) / 1000);
  const bins = [];
  for (let f = 60; f < 12000; f *= 1.04) bins.push({ f: Math.round(f), a: goertzel(d, f, from, len) });
  return bins;
}

// 저역이 몸, 고역이 접촉. 비율만 본다. 절대값은 게인이 바뀌면 따라 움직인다.
export function bands(d, fromMs, lenMs) {
  const s = spectrum(d, fromMs, lenMs);
  let lo = 0;
  let mid = 0;
  let hi = 0;
  let tot = 0;
  for (const x of s) {
    tot += x.a;
    if (x.f < 400) lo += x.a;
    else if (x.f < 1800) mid += x.a;
    else hi += x.a;
  }
  if (tot <= 0) return { lo: 0, mid: 0, hi: 0 };
  return { lo: lo / tot, mid: mid / tot, hi: hi / tot };
}

export function topPeaks(d, fromMs, lenMs, k) {
  const s = spectrum(d, fromMs, lenMs).slice();
  s.sort((a, x) => x.a - a.a);
  const picked = [];
  for (const x of s) {
    if (picked.every((y) => Math.abs(y.f - x.f) / x.f > 0.2)) picked.push(x);
    if (picked.length >= k) break;
  }
  return picked.map((x) => x.f).sort((a, x) => a - x);
}

// 밝기의 무게중심. 먹먹하다와 명쾌하다를 가르는 단 하나의 수치다.
// 대역 비율은 세 칸으로 뭉개서 900Hz 가죽과 3000Hz 금속을 같은 hi로 읽는다.
// 중심은 그 둘을 숫자 하나로 갈라낸다.
export function centroid(d, fromMs, lenMs) {
  const s = spectrum(d, fromMs, lenMs);
  let num = 0;
  let den = 0;
  for (const x of s) { num += x.f * x.a; den += x.a; }
  return den > 0 ? Math.round(num / den) : 0;
}

// 피크까지 걸린 시간. 실제 충돌은 접촉이 끝나기 전에 최대가 되므로 밀리초 한 자리다.
// 이게 길면 때린 소리가 아니라 켜진 소리다.
export function attackMs(d) {
  const e = rmsEnvelope(d, 1);
  const pk = Math.max(...e);
  if (pk <= 0) return 999;
  for (let i = 0; i < e.length; i += 1) if (e[i] >= pk * 0.9) return i;
  return 999;
}

// 울림이 밝기를 얼마나 들고 가는지. 튕 소리는 꼬리에서도 금속이 남는다.
// 앞머리만 밝고 꼬리가 어두우면 그건 튕이 아니라 퍽 뒤에 붙은 웅웅거림이다.
export function tailBrightness(d) {
  const t = tailMs(d);
  if (t < 40) return 0;
  const head = centroid(d, 0, 40);
  const late = centroid(d, Math.round(t * 0.55), Math.max(40, Math.round(t * 0.35)));
  return head > 0 ? Number((late / head).toFixed(3)) : 0;
}

// 종은 모든 모드가 정수배다. 하나만 정수배에 가까워도 종이라고 부르면 관을 종으로 잃는다.
// 알루미늄 관은 1 : 2.76 : 5.40 : 8.93이고, 마지막은 9에 거의 붙는다.
// 그래서 가장 먼 모드로 잰다. 종은 가장 먼 것도 0이고, 관은 어떤 세 모드를 집어도 멀다.
export function harmonicity(peaks) {
  if (peaks.length < 2) return 1;
  const f0 = peaks[0];
  let far = 0;
  for (let i = 1; i < peaks.length; i += 1) {
    const r = peaks[i] / f0;
    const d = Math.abs(r - Math.round(r)) / Math.max(1, Math.round(r));
    far = Math.max(far, d);
  }
  return far;
}

export function measure(d) {
  return {
    peak: Number(peakOf(d).toFixed(4)),
    tailMs: tailMs(d),
    contacts: contacts(d),
    attack: bands(d, 0, 12),
    body: bands(d, 0, 140),
    peaks: topPeaks(d, 20, 300, 3)
  };
}
