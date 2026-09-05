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
export const BED = 0.048;


export function mountBgm(base = '') {
  const el = new Audio();
  el.loop = true;
  /* 첫 입력 전에는 안 받는다. 브라우저가 어차피 입력 전 재생을 막는데 preload가 auto면
     소리를 켜 본 적 없는 사람에게도 4MB가 전량 내려간다. 실측으로 방문 한 번의 60에서 62퍼센트가
     이 파일이었고 입력 861ms 전에 요청이 나갔다. src를 첫 입력에서 꽂으면 받는 시점이 곧 듣는 시점이다. */
  el.preload = 'none';
  const pick = SRC.find(([type]) => el.canPlayType(type)) ?? SRC[1];
  const src = base + pick[1];

  let level = readVolume(KEY, BED);
  let muted = false;
  el.volume = level;

  // 탭 전환이나 잠깐의 끊김으로 죽지 않는다. 끄는 건 volume 0뿐이다.
  const resume = () => { if (el.paused) el.play().catch(() => {}); };
  el.addEventListener('pause', resume);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) resume(); });

  const kick = () => {
    if (!el.src) el.src = src;
    resume();
    if (!el.paused) {
      for (const ev of ['pointerdown', 'keydown', 'touchstart']) document.removeEventListener(ev, kick);
    }
  };
  /* 마운트 직후의 한 번은 자동재생이 허용된 브라우저를 위한 것이었는데, 그 한 번이 src를
     꽂으면 입력 전에 받는 셈이 된다. 지금은 첫 입력이 유일한 문이다. 자동재생이 허용된
     브라우저도 첫 입력 뒤에야 음악이 나오고, 그 대가로 안 듣는 사람은 한 바이트도 안 받는다. */
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
