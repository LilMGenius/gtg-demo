import { buildId } from './build.mjs';

// 수집기 승인은 별도 작업이므로 기본값에서는 외부 전송을 열지 않는다.
export const TELEMETRY_ENDPOINT = '';
export const STORAGE_KEY = 'gtg.telemetry';
export const OPT_OUT_KEY = 'gtg.telemetry.optOut';
export const DNT_KEY = 'gtg.telemetry.doNotTrack';
// readiness.md 계기 절이 정한 설치별 현지 날짜 수집 상한이다.
export const DAILY_LIMIT = 500;
// 최근 흐름만 검사할 수 있게 보관하며 하루 상한보다 작은 메모리 고리를 쓴다.
export const RING_LIMIT = 100;
// Beacon의 공유 keepalive 예산을 독점하지 않도록 배치 하나를 16 KiB로 제한한다.
export const BATCH_BYTES = 16384;
// P24-T1이 요구한 유입 표지 최대 길이다.
const SOURCE_LENGTH = 32;
// 정확한 화면 크기 대신 폰과 태블릿을 가르는 거친 CSS 폭 경계만 남긴다.
const PHONE_WIDTH = 600;
// 태블릿과 데스크톱을 가르는 거친 CSS 폭 경계다.
const TABLET_WIDTH = 1024;
// 첫 봉투 계약을 수집기가 구분할 수 있게 고정한다.
const SCHEMA = 1;
// 빈 계수와 최초 순번은 관측 전 상태를 뜻한다.
const ZERO = 0;
// 이벤트 하나와 달력 월의 영 기반 인덱스를 사람이 읽는 값으로 바꾸는 단위다.
const ONE = 1;
// UUID 규격의 자릿수와 버전 비트만 허용하여 저장소에 심은 자유 문자열을 배제한다.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const EVENTS = new Set(['first_playable', 'first_contact', 'set_complete',
  'second_set_start', 'training_spent', 'bot_on', 'bot_off', 'return_visit', 'error']);
// 키뿐 아니라 값도 채널 목록으로 한정해 쿼리에 들어온 이름과 연락처가 봉투에 못 들어오게 한다.
const SOURCES = new Set(['direct', 'reddit', 'discord', 'youtube', 'itch',
  'crazygames', 'poki', 'google', 'newsletter', 'market-test']);
const ERRORS = new Set(['load', 'save', 'render', 'runtime', 'unknown']);
const flag = value => value === '1' || value === 'true' || value === 'yes';
const nonnegative = value => Number.isFinite(value) && value >= ZERO;
const localDay = date => [date.getFullYear(), date.getMonth() + ONE, date.getDate()].join('-');
const bytes = events => new TextEncoder().encode(JSON.stringify({ events })).byteLength;

// W3C의 native randomUUID와 Beacon을 그대로 사용한다. 알고리즘이나 외부 SDK를 복제하지 않는다.
// https://www.w3.org/TR/webcrypto-2/#Crypto-method-randomUUID
// https://www.w3.org/TR/beacon/#sendbeacon-method
// endpoint와 시계 주입은 헤드리스 계기가 실제 전송 경계와 날짜 경계를 재기 위한 자리다.
export async function createTelemetry({ window: host = globalThis.window,
  endpoint = TELEMETRY_ENDPOINT, now = () => new Date() } = {}) {
  const ring = [];
  let pending = [];
  let idle = null;
  let sequence = ZERO;
  let sessionId;
  let disposed = false;

  function enabled() {
    try {
      return !disposed && !flag(host.navigator.doNotTrack) && !flag(host.doNotTrack)
        && !host.navigator.globalPrivacyControl
        && !flag(host.localStorage.getItem(OPT_OUT_KEY))
        && !flag(host.localStorage.getItem(DNT_KEY));
    } catch {
      // 저장소를 못 읽으면 거부 여부와 일일 상한을 보장할 수 없어 수집을 닫는다.
      return false;
    }
  }

  const build = enabled() ? await buildId() : null;
  const params = new URLSearchParams(host.location.search);
  const source = ['src', 'utm_source'].map(key => params.get(key)?.trim().slice(ZERO, SOURCE_LENGTH))
    .find(value => SOURCES.has(value)) ?? 'direct';
  const device = {
    input: host.navigator.maxTouchPoints > ZERO ? 'touch' : 'non-touch',
    viewport: host.innerWidth < PHONE_WIDTH ? 'phone'
      : host.innerWidth < TABLET_WIDTH ? 'tablet' : 'desktop',
  };

  function clear() {
    ring.length = ZERO;
    pending = [];
    idle = null;
  }

  function allowed() {
    if (enabled() && build) return true;
    clear();
    return false;
  }

  function send() {
    if (!allowed() || !endpoint || !pending.length) return false;
    try {
      // true는 전송 완료가 아니라 브라우저 큐 수락이다. 거절된 배치는 다음 flush까지 남긴다.
      if (!host.navigator.sendBeacon(endpoint, JSON.stringify({ events: pending }))) return false;
      pending = [];
      return true;
    } catch {
      // 수집기 장애가 게임 흐름을 중단시키지 않는다.
      return false;
    }
  }

  function append(name, mode, data) {
    if (!allowed() || !['hand', 'bot'].includes(mode)) return false;
    const date = now();
    const day = localDay(date);
    let state;
    try {
      const raw = host.localStorage.getItem(STORAGE_KEY);
      try { state = JSON.parse(raw); } catch { return false; }
      if (!state) state = { install_id: host.crypto.randomUUID(), day, count: ZERO };
      if (!UUID.test(state.install_id) || !Number.isInteger(state.count)
        || state.count < ZERO || state.count > DAILY_LIMIT || typeof state.day !== 'string') return false;
      if (state.day !== day) state = { ...state, day, count: ZERO };
      if (state.count >= DAILY_LIMIT) return false;
      state.count += ONE;
      host.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      return false;
    }
    sessionId ??= host.crypto.randomUUID();
    sequence += ONE;
    const event = {
      schema: SCHEMA, event_id: host.crypto.randomUUID(), event: name,
      install_id: state.install_id, session_id: sessionId, sequence,
      occurred_at: date.toISOString(), local_day: day, build_id: build,
      source, device: { ...device }, mode, data,
    };
    ring.push(event);
    if (ring.length > RING_LIMIT) ring.shift();
    if (endpoint) {
      if (bytes([...pending, event]) > BATCH_BYTES) send();
      // 전송 거절이 이어져도 메모리 상한은 지킨다. 최신 사건은 검사 고리에서 볼 수 있다.
      if (bytes([...pending, event]) <= BATCH_BYTES) pending.push(event);
    }
    return true;
  }

  // 자유 텍스트와 임의 속성은 받지 않는다. 오류도 stack/message 대신 범주만 남긴다.
  function record(name, { mode, amount, category } = {}) {
    if (!EVENTS.has(name)) return false;
    let data = {};
    if (name === 'training_spent') {
      if (!nonnegative(amount)) return false;
      data = { amount };
    }
    if (name === 'error') data = { category: ERRORS.has(category) ? category : 'unknown' };
    return append(name, mode, data);
  }

  // 방치 틱은 기록하지 않고 flush 때 합계 하나로 만든다. 방치는 항상 bot 모집단이다.
  function accrueIdle({ amount, duration_ms } = {}) {
    if (!allowed() || !nonnegative(amount) || !nonnegative(duration_ms)) return false;
    const next = { amount: (idle?.amount ?? ZERO) + amount,
      duration_ms: (idle?.duration_ms ?? ZERO) + duration_ms };
    if (!nonnegative(next.amount) || !nonnegative(next.duration_ms)) return false;
    idle = next;
    return true;
  }

  function flush() {
    if (!allowed()) return false;
    if (idle) {
      append('idle_accrual', 'bot', idle);
      idle = null;
    }
    return send();
  }

  host.addEventListener('pagehide', flush);
  return {
    record, accrueIdle, flush,
    snapshot: () => allowed() ? structuredClone(ring) : [],
    dispose() {
      host.removeEventListener('pagehide', flush);
      disposed = true;
      clear();
    },
  };
}
