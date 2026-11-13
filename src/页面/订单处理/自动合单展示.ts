import { 划分合单候选组, 是合单等待, type 合单等待记录 } from './自动合单模型'

/** 展示本组最早期限；保留每张订单自己的原始截止，不能因后加入而延长。 */
export function 合单展示期限(record: 合单等待记录, records: readonly 合单等待记录[]) {
  const group = 是合单等待(record) ? 划分合单候选组(records).find(items => items.some(item => item.orderNo === record.orderNo)) : undefined
  const first = (group ?? [record]).filter(item => item.deadlineAt !== null).sort((a, b) => a.deadlineAt! - b.deadlineAt!)[0]
  return { at: first?.deadlineAt ?? null, reason: 放单依据名称(first?.deadlineReason ?? '') }
}
export function 放单依据名称(reason: string) {
  return ({ '最长等待时间已到': '最长等待上限', '已到固定放单时间': '固定放单时点', '本轮合单处理时间已到': '下轮合单批次', '已进入发货截止预留时间': '发货时限保护' } as Record<string, string>)[reason] ?? reason
}
