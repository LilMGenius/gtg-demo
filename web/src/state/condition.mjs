import { CAUSE_LABEL } from '../../../src/ledger.mjs';

// dateGate의 진행 상태 판정과 사유 반환 방식을 재사용한다. 결제는 기존 wallet.pay가 맡는다.
const labels = { ...CAUSE_LABEL, level: '레벨', saves: '세이브', fans: '팔로워' };
export function conditionLabel(condition) {
  if (!condition) return '';
  const unit = condition.key === 'saves' ? '회' : condition.key === 'fans' ? '명' : '';
  return labels[condition.key] + ' ' + condition.min.toLocaleString('ko-KR') + unit;
}
export function purchaseCondition(item, state) {
  const condition = item.condition;
  if (!condition) return { met: true };
  const value = condition.key === 'fans' ? state.fans
    : condition.key === 'saves' ? Object.values(state.record).reduce((sum, row) => sum + row.saved, 0)
      : state.keeper[condition.key];
  const route = ['handling', 'agility'].includes(condition.key) ? 'gym' : condition.key === 'fans' ? 'gram' : 'pitch';
  return { met: value >= condition.min, value, min: condition.min, route, label: conditionLabel(condition) };
}
