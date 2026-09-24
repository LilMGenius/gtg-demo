import { CAUSE_LABEL } from '../../../src/ledger.mjs';

// dateGate의 진행 상태 판정과 사유 반환 방식을 재사용한다. 결제는 기존 wallet.pay가 맡는다.
const labels = { ...CAUSE_LABEL, level: '레벨', saves: '세이브', fans: '팔로워' };
export function conditionLabel(condition) {
  if (!condition) return '';
  const unit = condition.key === 'saves' ? '회' : condition.key === 'fans' ? '명' : '';
  return labels[condition.key] + ' ' + condition.min.toLocaleString('ko-KR') + unit;
}
export function purchaseCondition(item, state) {
  if (item.conditions?.length) {
    const parts = item.conditions.map(condition => purchaseCondition({ condition }, state));
    const place = state.place || state.gear;
    const unlocked = place?.venueUnlocked?.includes(item.city) || Number(place?.city) >= item.city;
    const met = Boolean(unlocked || parts.every(part => part.met));
    // 한번 넘은 문은 팔로워 감소나 키퍼 교체로 닫히지 않는다. 계정의 자리 저장에 남긴다.
    if (met && place) place.venueUnlocked = [...new Set([...(place.venueUnlocked || []), item.city])];
    const pending = parts.find(part => !part.met) || parts.at(-1);
    return { ...pending, met, parts, label: parts.map(part => part.label).join(' · ') };
  }
  const condition = item.condition;
  if (!condition) return { met: true };
  const value = condition.key === 'fans' ? state.fans
    : condition.key === 'saves' ? Object.values(state.record || {}).reduce((sum, row) => sum + row.saved, 0)
      : state.keeper[condition.key];
  const route = ['handling', 'agility'].includes(condition.key) ? 'gym' : condition.key === 'fans' ? 'gram' : 'pitch';
  return { met: value >= condition.min, value, min: condition.min, route, label: conditionLabel(condition) };
}
