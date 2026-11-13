import type { 全渠道订单 } from '../全渠道订单/类型'
import { 解析合单重量 } from '../订单规则/合单规则模型'
import { 命中字段搜索, type 搜索模式 } from '@/组件/筛选/筛选工具'
import { 划分合单候选组, 是合单等待, type 合单等待记录 } from './自动合单模型'
import { 放单依据名称 } from './自动合单展示'

export type 合单分组页签 = 'waiting' | 'blocked'
export interface 合单展示组 {
  key: string
  label: string
  records: 合单等待记录[]
  orderNos: string[]
  stores: Array<{ value: string; label: string }>
  storeByOrder: Record<string, string>
  quantity: number
  weightKg?: string
  deadlineAt: number | null
  deadlineReason: string
  progress: string
  status: string
  reason: string
}
export interface 合单组筛选 {
  keyword: string
  mode: 搜索模式
  storeIds: string[]
  nearDeadline: boolean
}
export const 合单临近截止分钟 = 30

/** 只作显示投影；组成员始终来自执行算法或已经冻结的失败组，不按筛选结果重新组单。 */
export function 创建合单展示组(records: readonly 合单等待记录[], orders: readonly 全渠道订单[], tab: 合单分组页签): 合单展示组[] {
  let groups: 合单等待记录[][]
  if (tab === 'waiting') groups = 划分合单候选组(records)
  else {
    const frozen = new Map<string, 合单等待记录[]>()
    for (const row of records.filter(item => item.status === '分仓待处理')) {
      // 无冻结组号的旧记录独立展示，不能凭地址合并新的执行组。
      const key = row.groupId ? `group:${row.groupId}` : `order:${row.orderNo}`
      frozen.set(key, [...(frozen.get(key) ?? []), row])
    }
    groups = [...frozen.values()]
  }
  const byOrder = new Map(orders.map(order => [order.systemOrderNo, order]))
  return groups.map((rows, index) => {
    const first = rows[0]!
    const deadline = rows.filter(row => row.deadlineAt !== null).sort((a, b) => a.deadlineAt! - b.deadlineAt!)[0]
    const weights = rows.map(row => 解析合单重量(row.weightKg))
    const total = weights.every(weight => weight !== undefined) ? weights.reduce<bigint>((sum, weight) => sum + weight!, 0n) : undefined
    const stores = new Map<string, string>()
    for (const row of rows) {
      const order = byOrder.get(row.orderNo)
      if (order?.storeId) stores.set(order.storeId, order.storeName || order.storeId)
    }
    const orderNos = rows.map(row => row.orderNo)
    const status = tab === 'blocked' ? '分仓待处理' : first.status
    const action = first.action
    return {
      key: JSON.stringify([tab, tab === 'blocked' ? first.groupId ?? null : first.settingsVersion, [...orderNos].sort()]),
      label: tab === 'blocked' ? first.groupId || `待处理组 ${index + 1}` : `候选组 ${String(index + 1).padStart(2, '0')}`,
      records: rows, orderNos,
      stores: [...stores].map(([value, label]) => ({ value, label })),
      storeByOrder: Object.fromEntries(rows.map(row => [row.orderNo, byOrder.get(row.orderNo)?.storeId ?? ''])),
      quantity: rows.reduce((sum, row) => sum + row.quantity, 0),
      weightKg: total === undefined ? undefined : `${total / 1_000_000n}${total % 1_000_000n ? `.${String(total % 1_000_000n).padStart(6, '0').replace(/0+$/, '')}` : ''}`,
      deadlineAt: deadline?.deadlineAt ?? null,
      deadlineReason: 放单依据名称(deadline?.deadlineReason ?? ''),
      progress: tab === 'waiting' && action.mode === 'advanced' && action.releaseMode === 'ready' ? `${rows.length} / ${action.readyOrderCount} 单` : `${rows.length} 单`,
      status,
      reason: [...new Set(rows.map(row => row.reason).filter(Boolean))].join('；'),
    }
  })
}

export function 筛选合单展示组(groups: readonly 合单展示组[], filters: 合单组筛选, now: number): 合单展示组[] {
  return groups.filter(group => group.orderNos.some(orderNo => 命中字段搜索(orderNo, filters.keyword, filters.mode)
      && (!filters.storeIds.length || filters.storeIds.includes(group.storeByOrder[orderNo] ?? '')))
    && (!filters.nearDeadline || (group.records.some(是合单等待) && group.deadlineAt !== null && group.deadlineAt <= now + 合单临近截止分钟 * 60_000)))
}

/** 完整名单同时用于确认和确认后复核；候选组变化时需要重新确认。 */
export function 合单组成员签名(groups: readonly 合单展示组[]): string {
  return JSON.stringify(groups.map(group => group.key).sort())
}

export function 合单整组确认文本(groups: readonly 合单展示组[], action: '结束等待' | '解除组合'): string {
  const count = groups.reduce((sum, group) => sum + group.orderNos.length, 0)
  const instruction = action === '结束等待'
    ? '这些订单将一起结束等待，继续分仓和审核，不代表立即发货。'
    : '各来源订单将独立分仓并继续审核，仍须通过发货条件校验。'
  return `将${action} ${groups.length} 组，共 ${count} 张订单。${instruction}\n\n${groups.map(group => `${group.label}（${group.orderNos.length} 单）：${group.orderNos.join('、')}`).join('\n')}`
}
