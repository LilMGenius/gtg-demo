// \uce90\ud504\ucc98 \uc911 \ubc1c\ud654\ud55c \ud6a8\uacfc\uc74c\uc744 \uadf8\ub300\ub85c \ub2e4\uc2dc \uc74d\uc73c\ub85c \ucc0d\uc5b4\ub0b8\ub2e4.
// \uc0dd\uc131 \ud568\uc218\uac00 t0\ub97c \ubc1b\uc73c\ubbc0\ub85c \ud55c OfflineAudioContext\uc5d0 \uc804\ubd80 \uc608\uc57d\ud558\uba74 \ud55c \ubc88\uc5d0 \uc11e\uc778\ub2e4.
import { chromium } from 'playwright';
import fs from 'node:fs';

const EXE = process.env.LOCALAPPDATA + '/ms-playwright/chromium-1228/chrome-win64/chrome.exe';
const DIR = process.env.OUT || 'video.local';
const SRC = JSON.parse(fs.readFileSync(DIR + '/sfx.json', 'utf8'));
const PAD = 1.5;
const SECONDS = Math.max(...SRC.events.map((e) => e[2])) + PAD;

const t = setTimeout(() => { console.log('WATCHDOG'); process.exit(1); }, 180000); t.unref();
let b;
try {
  b = await chromium.launch({ executablePath: EXE });
  const p = await (await b.newContext()).newPage();
  p.on('pageerror', (e) => console.log('ERR', String(e && e.stack || e)));
  await p.goto('http://127.0.0.1:10310/web/index.html', { waitUntil: 'load' });

  const b64 = await p.evaluate(async ({ events, seconds }) => {
    const mod = await import('/web/src/audio/sfx.mjs');
    const SR = 48000;
    const ac = new OfflineAudioContext(1, Math.ceil(SR * seconds), SR);
    const g = ac.createGain();
    g.gain.value = 1;
    g.connect(ac.destination);
    const noise = mod.makeNoise(ac, 1.2);
    for (const [name, arg, at] of events) mod.buildSfx(name, ac, g, noise, at, arg ?? undefined);
    const d = (await ac.startRendering()).getChannelData(0);

    // 16bit PCM WAV. \ubc14\uc774\ud2b8\ub97c \uc9c1\uc811 \uc36c\ub2e4. \uc774 \ud398\uc774\uc9c0\uc5d0\ub294 \uc778\ucf54\ub354\uac00 \uc5c6\ub2e4.
    const n = d.length;
    const buf = new ArrayBuffer(44 + n * 2);
    const v = new DataView(buf);
    const tag = (o, s) => { for (let i = 0; i < s.length; i += 1) v.setUint8(o + i, s.charCodeAt(i)); };
    tag(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); tag(8, 'WAVEfmt ');
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, SR, true); v.setUint32(28, SR * 2, true);
    v.setUint16(32, 2, true); v.setUint16(34, 16, true);
    tag(36, 'data'); v.setUint32(40, n * 2, true);
    for (let i = 0; i < n; i += 1) {
      const x = Math.max(-1, Math.min(1, d[i]));
      v.setInt16(44 + i * 2, x < 0 ? x * 0x8000 : x * 0x7fff, true);
    }
    const bytes = new Uint8Array(buf);
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(s);
  }, { events: SRC.events, seconds: SECONDS });

  fs.writeFileSync(DIR + '/sfx.wav', Buffer.from(b64, 'base64'));
  console.log('sfx.wav', SRC.events.length, 'events', SECONDS.toFixed(2), 's');
} finally { clearTimeout(t); if (b) await b.close(); }
