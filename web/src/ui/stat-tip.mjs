/* 능력치 효과 팝업. 훈련장 칸과 내 정보 칸이 같은 부품 하나를 쓴다. 칸 아래 줄은 지금 값과 한 칸 올림의 몫을
   한 줄로만 말하지만, 이 팝업은 그 능력치가 키퍼 성능에 하는 일을 세 줄로 푼다. 현재 효과, 다음 한 칸의 몫,
   소프트캡이다. 수는 제품이 이미 재는 것(impact-view의 effects, chain.mjs의 statValue)을 그대로 읽고 여기서
   새로 재거나 반올림하지 않는다. 마우스는 올림, 키보드는 초점, 터치는 길게 누름(내 정보는 눌러도 된다)이 연다.
   Esc는 팝업을 먼저 닫고 창은 그대로 둔다. 팝업은 설명하는 칸을 절대 가리지 않는다. */
import { STAT_KNEE, STAT_TOP, statValue } from '../../../src/chain.mjs';
import { fxParts } from './impact-view.mjs';
import { t } from './i18n.mjs';

// 칸 테두리에서 팝업까지. 훈련장 칸은 올림 4px에 그림자가 오른쪽 아래로 8px 10px 나가서 12px면 그림자까지 비킨다.
const GAP = 12;
// 화면 가장자리 여백. 팝업 그림자(--lift 4px)가 화면 밖으로 안 나가는 값보다 크다.
const EDGE = 8;
// 팝업 최대 너비. 390px 폰에서 화면 폭 아래이고 영어 소프트캡 줄이 네 줄 안에 접히는 값이다.
const MAX_W = 280;
// 길게 누름 시간. 터치 기기의 보통 길게 누름 문턱(약 400~500ms)의 아래쪽이라 훈련 탭과 안 섞이고 오래 기다리지도 않는다.
const HOLD_MS = 420;
// 누른 손가락이 이만큼 움직이면 굴리는 중이지 누르는 중이 아니다. 터치 기기의 보통 탭 허용치(약 10px)다.
const SLOP = 10;

const hits = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;

/* 팝업 자리. 칸 아래, 위, 오른쪽, 왼쪽 순으로 화면 안에 들어가고 칸과 안 겹치는 첫 자리를 고른다.
   어느 쪽도 안 들어가면(아주 작은 화면) 칸과 안 겹치는 자리 중 첫째를 화면 안으로 눌러 고르고, 그것도 없으면 아래다.
   게이트가 이 함수를 그대로 불러 겹침 판정을 시험한다. */
export function placeTip(cell, size, view, gap = GAP, edge = EDGE) {
  const fitX = (x) => Math.min(Math.max(x, edge), Math.max(edge, view.w - edge - size.w));
  const fitY = (y) => Math.min(Math.max(y, edge), Math.max(edge, view.h - edge - size.h));
  const midX = cell.left + (cell.right - cell.left) / 2 - size.w / 2;
  const midY = cell.top + (cell.bottom - cell.top) / 2 - size.h / 2;
  const tries = [
    { side: 'below', left: fitX(midX), top: cell.bottom + gap },
    { side: 'above', left: fitX(midX), top: cell.top - gap - size.h },
    { side: 'right', left: cell.right + gap, top: fitY(midY) },
    { side: 'left', left: cell.left - gap - size.w, top: fitY(midY) }
  ];
  const box = (p) => ({ left: p.left, top: p.top, right: p.left + size.w, bottom: p.top + size.h });
  const inside = (p) => p.left >= edge && p.top >= edge && p.left + size.w <= view.w - edge && p.top + size.h <= view.h - edge;
  const found = tries.find((p) => inside(p) && !hits(box(p), cell));
  if (found) return found;
  const pressed = tries.map((p) => ({ ...p, left: fitX(p.left), top: fitY(p.top) })).find((p) => !hits(box(p), cell));
  return pressed || tries[0];
}

export function createStatTip({ state, el, effects, label, icon }) {
  const tip = document.createElement('div');
  tip.id = 'statTip';
  tip.className = 'stattip';
  tip.setAttribute('role', 'tooltip');
  tip.hidden = true;
  document.body.append(tip);

  let cur = null, curBox = null, curSel = '', curKey = '', token = 0, frame = 0, lastRect = '';
  let lastInput = 'pointer', press = null, suppress = false;

  const kneeLine = (v) => (v > STAT_KNEE
    ? t('소프트캡 {0} 초과. 지금 실효 {1}, 최대 {2}에 수렴한다').replace('{0}', STAT_KNEE).replace('{1}', statValue(v).toFixed(1)).replace('{2}', STAT_TOP)
    : t('소프트캡 {0}. 넘으면 한 칸의 효과가 줄고 {1} 근처에서 멈춘다').replace('{0}', STAT_KNEE).replace('{1}', STAT_TOP));
  const row = (kind, title, r) => '<p data-tip="' + kind + '"><i>' + t(title) + '</i>'
    + (r ? fxParts(r).map((x) => '<span>' + t(x) + '</span>').join('') : '<span>…</span>') + '</p>';
  function paint(k, fx) {
    const v = state.keeper[k];
    tip.innerHTML = '<h5><i aria-hidden="true">' + icon(k) + '</i><span>' + t(label(k)) + '</span><b>' + v + '</b></h5>'
      + row('held', '현재 효과 (훈련 전 대비)', fx && fx.held) + row('next', '다음 한 칸', fx && fx.next)
      + '<p class="knee" data-tip="knee">' + kneeLine(v) + '</p>';
  }

  function place() {
    const r = cur.getBoundingClientRect();
    const sig = [r.left, r.top, r.width, r.height, tip.offsetWidth, tip.offsetHeight].map(Math.round).join(',');
    if (sig === lastRect) return;
    lastRect = sig;
    tip.style.maxWidth = Math.min(MAX_W, document.documentElement.clientWidth - 2 * EDGE) + 'px';
    const p = placeTip(r, { w: tip.offsetWidth, h: tip.offsetHeight }, { w: document.documentElement.clientWidth, h: innerHeight });
    tip.style.left = p.left + 'px';
    tip.style.top = p.top + 'px';
    tip.dataset.side = p.side;
  }

  // 수를 재는 일은 한 박자 미룬다. 먼저 틀을 그려야 올림이 바로 읽히고, 처음 재는 값은 100ms 안팎이 든다.
  function fill() {
    const k = curKey, mine = ++token;
    paint(k, null);
    lastRect = '';
    place();
    setTimeout(() => {
      if (mine !== token || !cur) return;
      paint(k, effects(k));
      lastRect = '';
      place();
    }, 0);
  }

  /* 칸이 다시 그려져도(훈련으로 값이 바뀜) 같은 능력치 칸을 찾아 따라간다. 칸이 자라서 밀리는 것도 같은 걸로 따라간다.
     창이 닫히거나 칸이 사라지면 접는다. */
  function track() {
    frame = 0;
    if (!cur) return;
    if (curBox.hidden) return hide();
    if (!cur.isConnected) {
      const next = curBox.querySelector(curSel + '[data-k="' + curKey + '"]');
      if (!next) return hide();
      cur = next;
      cur.setAttribute('aria-describedby', 'statTip');
      fill();
    } else place();
    frame = requestAnimationFrame(track);
  }

  function show(cell, box, sel) {
    if (cur === cell && !tip.hidden) return;
    hide();
    cur = cell; curBox = box; curSel = sel; curKey = cell.dataset.k;
    cell.setAttribute('aria-describedby', 'statTip');
    tip.hidden = false;
    fill();
    frame = requestAnimationFrame(track);
  }

  function hide() {
    token += 1;
    cancelAnimationFrame(frame);
    frame = 0;
    if (cur) cur.removeAttribute('aria-describedby');
    cur = null;
    tip.hidden = true;
  }

  /* 한 창에 연결한다. 창 상자는 다시 그려져도 남는 쪽이라 위임으로 건다. tapShows는 눌러도 아무 일이 없는 칸(내 정보)이
     짧게 눌러도 여는 것이고, 훈련장은 짧은 누름이 훈련이라 길게 눌러야 열린다. */
  function bind(boxId, sel, tapShows = false) {
    const box = el(boxId);
    const cellOf = (e) => { const c = e.target.closest?.(sel); return c && box.contains(c) ? c : null; };
    box.addEventListener('pointerover', (e) => { const c = e.pointerType === 'touch' ? null : cellOf(e); if (c) show(c, box, sel); });
    box.addEventListener('pointerout', (e) => {
      const c = e.pointerType === 'touch' ? null : cellOf(e);
      if (c && c === cur && !c.contains(e.relatedTarget)) hide();
    });
    box.addEventListener('focusin', (e) => { const c = cellOf(e); if (c && lastInput === 'key') show(c, box, sel); });
    box.addEventListener('focusout', (e) => { const c = cellOf(e); if (c && c === cur) hide(); });
    box.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'touch') return;
      const c = cellOf(e);
      if (!c) return;
      press = { cell: c, x: e.clientX, y: e.clientY, held: false, moved: false, timer: setTimeout(() => { press.held = true; show(c, box, sel); }, HOLD_MS) };
    });
    box.addEventListener('pointermove', (e) => {
      if (press && !press.held && Math.hypot(e.clientX - press.x, e.clientY - press.y) > SLOP) { press.moved = true; clearTimeout(press.timer); }
    });
    const lift = (e) => {
      if (!press) return;
      clearTimeout(press.timer);
      const { cell, held, moved } = press;
      press = null;
      if (e.type === 'pointercancel') return;
      // 길게 눌러 연 뒤의 손뗌이 훈련으로 읽히면 안 된다. 다음 click 하나를 삼킨다.
      if (held) { suppress = true; setTimeout(() => { suppress = false; }, 600); }
      else if (tapShows && !moved) show(cell, box, sel);
    };
    box.addEventListener('pointerup', lift);
    box.addEventListener('pointercancel', lift);
    box.addEventListener('click', (e) => { if (suppress) { suppress = false; e.preventDefault(); e.stopPropagation(); } }, true);
    // 길게 누름이 기기의 문맥 메뉴나 글자 선택을 띄우면 팝업이 가려진다.
    box.addEventListener('contextmenu', (e) => { if (cellOf(e)) e.preventDefault(); });
  }

  addEventListener('keydown', (e) => {
    lastInput = 'key';
    if (e.key === 'Escape' && !tip.hidden) {
      e.preventDefault();
      e.stopImmediatePropagation();
      hide();
    }
  }, true);
  // 손가락이 다른 데를 누르면 길게 눌러 연 팝업을 접는다. 마우스는 올림 끝에서 스스로 접는다.
  addEventListener('pointerdown', (e) => {
    lastInput = 'pointer';
    if (e.pointerType === 'touch' && cur && !cur.contains(e.target)) hide();
  }, true);
  // 굴리거나 창 크기가 바뀌면 칸이 움직이고, 닫히면 팝업이 갈 곳이 없다. 칸 쫓기가 위치는 맞추지만 이 둘은 접는 쪽이 읽힌다.
  addEventListener('resize', hide);

  return { bind, hide };
}
