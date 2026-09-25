// Destinations belong here; renderers and gates read the same table.
export const HUD_LINKS = {
  fans: { panel: 'gram', cat: null, label: '팔로워 아웃문그램 열기' },
  lv: { panel: 'wiki', cat: 'drill', label: '레벨 위키 훈련 열기' },
  form: { panel: 'wiki', cat: 'hand', label: '컨디션 위키 조작 열기' },
  pips: { panel: 'wiki', cat: 'coin', label: '세이브 위키 재화 열기' },
  purse: { panel: 'wiki', cat: 'coin', label: '재화 위키 재화 열기' },
  gramFollowers: { panel: 'wiki', cat: 'gram', label: '팔로워 위키 아웃문그램 열기' },
  gramEffect: { panel: 'wiki', cat: 'gram', label: '맞팔 효과 위키 아웃문그램 열기' }
};

export function linkAttrs(id) {
  const { label } = HUD_LINKS[id];
  return 'type="button" data-hud-link="' + id + '" aria-label="' + label + '" title="' + label + '"';
}
