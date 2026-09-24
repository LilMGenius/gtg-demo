import * as chain from '../src/chain.mjs';
export * from '../src/chain.mjs';

// move-gate의 실제 속도 자취와 botPlan을 재사용한다. 판정은 제품 resolve가 소유한다.
export const MODES = ['hand-centre', 'hand-follow', 'hand-bait', 'bot'];
// 숙련 손의 방향 읽기 90%는 완벽 입력을 없애기 위한 P15 HOTL 시험값이다.
export const P_READ = 0.9;
const clampX = x => Math.max(-chain.X_MAX, Math.min(chain.X_MAX, x));
function fromTrace(trace, auto) {
  const last = trace.at(-1), prev = trace.at(-2);
  // 자취의 밀리초를 초당 속도로 환산한다.
  return { trace, x: last.x, vx: (last.x - prev.x) * 1000 / (last.ms - prev.ms), auto };
}
export function positionInput(keeper, shot, rng, mode = 'hand-follow', pRead = P_READ) {
  if (mode === 'bot') return fromTrace(chain.botPlan(keeper, shot, rng), true);
  // 1초 전 표본은 U1 키커의 가장 이른 관측보다 앞선다.
  if (mode === 'hand-centre') return fromTrace([{ ms: -1000, x: 0 }, { ms: 0, x: 0 }], false);
  const speed = chain.moveSpeed(keeper);
  if (mode === 'hand-bait') {
    // U1 move-gate와 같은 0.3 편위, 접촉 600ms 전 큰 쪽 이동이다.
    return fromTrace([{ ms: -1000, x: 0.3 }, { ms: -600, x: 0.3 }, { ms: 0, x: clampX(0.3 - speed * 0.6) }], false);
  }
  if (mode !== 'hand-follow') throw new Error(`Unknown position mode: ${mode}`);
  // 중앙을 관측한 키커의 큰 쪽은 -x다. 원래 shot.side는 재조준 전 값이라 답으로 쓰지 않는다.
  const likely = Number.isFinite(shot.sideU) && !shot.chip && shot.side !== 0 ? (shot.sideU < 0.5 ? -1 : 1) : shot.side;
  const side = rng() < pRead ? likely : -likely;
  // 접촉 500ms 전 이동은 배정된 손 정책이며 속도는 제품 함수로 제한한다.
  return fromTrace([{ ms: -1000, x: 0 }, { ms: -500, x: 0 }, { ms: 0, x: clampX(side * speed * 0.5) }], false);
}

// 기존 계기의 자동 입력 호출은 봇 자취로 치환한다. 수동 방향 서술자는 resolve에서 손 이동으로 바꾼다.
export const autoInput = (keeper, shot, rng) => positionInput(keeper, shot, rng, 'bot');

function movingAtRead(shot, raw) {
  if (shot.chip || shot.side === 0) return false;
  // U1 관측시점 식을 읽어 계측의 난수 경계를 맞춘다. 계수 변경은 아래 식에도 반영한다.
  const ms = -(900 - 65 * (shot.kicker.composure - 1));
  const samples = raw.trace.filter(p => p.ms <= 0).slice().sort((a, b) => a.ms - b.ms);
  if (!samples.length || ms < samples[0].ms) return false;
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1], b = samples[i];
    if (ms > b.ms || b.ms === a.ms) continue;
    // 0.3단위/s는 제품 readPosition의 이동 판독 경계다.
    return Math.abs((clampX(b.x) - clampX(a.x)) * 1000 / (b.ms - a.ms)) > 0.3;
  }
  return false;
}

export function resolve(arg) {
  // 32비트 시드 셋으로 정책, 자동 다이빙, 이후 사슬을 분리한다. 분기 수가 달라도 같은 구를 짝짓는다.
  const seed = () => Math.floor(arg.rng() * 4294967296);
  const policy = chain.makeRng(seed()), position = chain.makeRng(seed()), outcome = chain.makeRng(seed());
  const raw = Array.isArray(arg.input?.trace) ? arg.input : positionInput(arg.keeper, arg.shot, policy, arg.input?.auto === false ? 'hand-follow' : 'bot');
  const prefix = [];
  const draw = () => { const u = position(); prefix.push(u); return u; };
  if (movingAtRead(arg.shot, raw)) draw();
  // readU, missU, timeU 세 롤과 제품의 전진 분기를 같은 순서로 미리 보존한다.
  draw(); draw(); draw();
  const wantOut = arg.shot.forced || draw() * 100 < 16 + arg.keeper.judgement * 2;
  if (wantOut) draw();
  let cursor = 0;
  const result = chain.resolve({ ...arg, input: raw, rng: () => cursor < prefix.length ? prefix[cursor++] : outcome() });
  if (!Array.isArray(result.input.trace)) throw new Error('Position population escaped trace path');
  return result;
}
