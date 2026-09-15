// Native button activation and focus remain owned by the browser.
export const KEY_MAP = [
  { key: 'Escape', action: 'close', label: 'Escape', note: '창 닫기, 개봉은 순서대로 확인' },
  { key: 'Tab', action: 'category', label: 'Tab / Shift+Tab', note: '카테고리 다음 / 이전' },
  { key: 'F6', action: 'focus', label: 'F6 / Shift+F6', note: '창 안 버튼 다음 / 이전' },
  { keys: { w: 'wikiBtn', s: 'shopBtn', g: 'gymBtn', r: 'rosterBtn', m: 'meBtn', f: 'gramBtn' }, action: 'open', label: 'W / S / G / R / M / F', note: '위키 / 상점 / 훈련장 / 선수 명단 / 내 정보 / 아웃문그램' },
  { key: 'v', action: 'fullscreen', label: 'V', note: '전체 화면 전환' },
  { key: 'a', action: 'auto', label: 'A', note: '자동 조작' },
  { key: 'd', action: 'out', label: 'D', note: '돌진' },
  { keys: { ArrowLeft: -1, ArrowUp: 0, ArrowRight: 1 }, action: 'dive', label: '← / ↑ / →', note: '왼쪽 / 가운데 / 오른쪽 다이빙' },
  { key: ' ', action: 'confirm', value: 0, label: 'Space', note: '선택한 버튼 실행, 경기장에서는 가운데 다이빙' },
  { key: 'Enter', action: 'confirm', label: 'Enter', note: '선택한 버튼 실행' }
];
