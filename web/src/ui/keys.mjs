// Native button activation and focus remain owned by the browser.
export const KEY_MAP = [
  { key: 'Escape', action: 'close', label: 'Escape', note: '창 닫기, 개봉은 순서대로 확인' },
  { key: 'Tab', action: 'category', label: 'Tab / Shift+Tab', note: '카테고리 다음 / 이전' },
  { key: 'F6', action: 'focus', label: 'F6 / Shift+F6', note: '창 안 버튼 다음 / 이전' },
  { keys: { w: 'wikiBtn', s: 'shopBtn', g: 'gymBtn', r: 'rosterBtn', m: 'meBtn', f: 'gramBtn' }, action: 'open', label: 'W / S / G / R / M / F', note: '위키 / 상점 / 훈련장 / 선수 명단 / 내 정보 / 아웃문그램' },
  { key: 'v', action: 'fullscreen', label: 'V', note: '전체 화면 전환' },
  { key: 'a', action: 'auto', label: 'A', note: '자동 조작' },
  { keys: { ArrowLeft: -1, ArrowRight: 1 }, action: 'move', label: '← / →', note: '누르는 동안 좌우 이동, 다이빙은 자동' },
  { key: ' ', action: 'confirm', label: 'Space', note: '선택한 버튼 실행' },
  { key: 'Enter', action: 'confirm', label: 'Enter', note: '선택한 버튼 실행' }
];
