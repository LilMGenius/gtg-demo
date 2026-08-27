// BGM. 무한 루프.
// 브라우저는 사용자 입력 전 재생을 막는다. 그래서 첫 입력을 기다렸다가 튼다.
const SRC = [
  ['audio/ogg; codecs=opus', 'assets/audio/bgm.ogg'],
  ['audio/mp4; codecs=mp4a.40.2', 'assets/audio/bgm.m4a'],
];
import { readVolume } from './volume.mjs';

const KEY = 'gtg.bgm.volume';

// 베드는 가장 작은 효과음 아래에 깔린다. bgm 파일 자체가 -13.8dB라 이것보다 크게 틀면
// 발소리와 공 놓는 소리가 음악 밑에 깔린다. 효과음이 안 난다는 신고의 정체는 그것이었다.
// 0.10은 가장 작은 효과음보다 4.3dB 아래였다. 숫자로는 효과음이 이기지만
// 귀로는 진다. 음악은 내내 울리고 효과음은 수십 밀리초에 끝난다.
// 순간음이 지속음을 뚫으려면 10dB는 벌어야 한다.
export const BED = 0.072;


export function mountBgm(base = '') {
  const el = new Audio();
  el.loop = true;
  el.preload = 'auto';
  const pick = SRC.find(([type]) => el.canPlayType(type)) ?? SRC[1];
  el.src = base + pick[1];

  let level = readVolume(KEY, BED);
  let muted = false;
  el.volume = level;

  // 탭 전환이나 잠깐의 끊김으로 죽지 않는다. 끄는 건 volume 0뿐이다.
  const resume = () => { if (el.paused) el.play().catch(() => {}); };
  el.addEventListener('pause', resume);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) resume(); });

  const kick = () => {
    resume();
    if (!el.paused) {
      for (const ev of ['pointerdown', 'keydown', 'touchstart']) document.removeEventListener(ev, kick);
    }
  };
  kick();
  for (const ev of ['pointerdown', 'keydown', 'touchstart']) document.addEventListener(ev, kick);

  return {
    get volume() { return level; },
    set volume(v) {
      level = Math.min(1, Math.max(0.01, v));
      if (!muted) el.volume = level;
      localStorage.setItem(KEY, String(level));
    },
    get muted() { return muted; },
    set muted(on) {
      muted = !!on;
      el.volume = muted ? 0 : level;
    },
  };
}
