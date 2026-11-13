import { 共享合单记录 } from './自动合单状态'
import { 共享订单, 订单版本, 人工发货上下文, 仓库执行记录 } from './演示会话'
import { 自动合单样例资料 } from './自动合单演示'
import { 是合单等待, 读取合单分组身份, 解析合单来源时间, type 合单等待记录 } from './自动合单模型'
import { 人工发货操作阻断原因 } from './拆合发货模型'
import { 解析合单重量 } from '../订单规则/合单规则模型'

const 分池键 = (row: 合单等待记录) => JSON.stringify([row.settingsVersion, row.action, row.groupKey])

/**
 * 确认范围不仅受名单影响：来源数量变更后，容量重分组可能把原本另组的成员带出。
 * 因此同时冻结相关同身份策略池（含容量切出的其他组）的记录、来源事实及订单版本。
 * 仅用于本地确认期间并发保护，不写入日志，不替代服务端组锁与执行前复验。
 */
function 相关合单记录(orderNos: readonly string[]): 合单等待记录[] {
  const selected = new Set(orderNos)
  const affected = 共享合单记录.value.filter(row => selected.has(row.orderNo))
  const pools = new Set(affected.filter(是合单等待).map(分池键))
  const frozenGroups = new Set(affected.filter(row => row.status === '分仓待处理' && row.groupId).map(row => row.groupId))
  return 共享合单记录.value.filter(row => selected.has(row.orderNo)
    || (是合单等待(row) && pools.has(分池键(row)))
    || (row.status === '分仓待处理' && row.groupId && frozenGroups.has(row.groupId)))
    .slice().sort((a, b) => a.orderNo.localeCompare(b.orderNo))
}

const 需复核 = (orderNo: string, reason: string) => `订单 ${orderNo} ${reason}。请先在合单处理中点击“立即执行合单”复核，更新结果后重新选择并确认。`

/**
 * 只读检查确认打开前是否已经过时。等待池复核会按当前来源重新分组，不能把旧名单作为确认范围。
 * 解除组合使用冻结组，不按当前收件身份或容量重分组；取消或资料变化来源仍由解除执行逐单拦截。
 */
export function 校验合单操作来源一致性(orderNos: readonly string[], mode: '等待' | '解除组合' = '等待'): string {
  if (!orderNos.length) return ''
  const related = 相关合单记录(orderNos)
  for (const orderNo of orderNos) if (related.filter(row => row.orderNo === orderNo).length !== 1) return 需复核(orderNo, '的合单记录已变化')
  const context = { ...人工发货上下文(), 规则合单: true }
  for (const row of related) {
    const matches = 共享订单.value.filter(order => order.systemOrderNo === row.orderNo)
    if (matches.length !== 1) return 需复核(row.orderNo, '的来源记录不存在或编号不唯一')
    if (mode === '解除组合') {
      if (row.status !== '分仓待处理' || !row.groupId) return 需复核(row.orderNo, '的冻结合单组已变化')
      continue
    }
    if (!是合单等待(row)) return 需复核(row.orderNo, '已不在等待池')
    const order = matches[0]!
    const gates = 人工发货操作阻断原因(context, [row.orderNo], '合并发货').filter(reason => reason !== '合并发货至少选择两张来源订单')
    if (order.manualShippingPlan || (order.platformCode === 'eBay' && order.platformOrderStatus === 'IN_PROGRESS')
      || (order.initialReviewPending && (!order.mergeNodeArrival || order.mergeNodeArrival.skuResolution !== '已完成' || !['已完成', '不适用'].includes(order.mergeNodeArrival.giftProcessing) || order.mergeNodeArrival.splitProcessing !== '未拆单'))) gates.push('合单执行资格已变化')
    if (gates.length) return 需复核(row.orderNo, '的合单资格需重新核实')
    const facts = 自动合单样例资料[row.orderNo]
    if (order.items.reduce((sum, line) => sum + (line.fulfillableQuantity ?? 0), 0) !== row.quantity) return 需复核(row.orderNo, '的当前可发数量与等待记录不一致')
    if (读取合单分组身份(order, row.action.groupBySite, facts?.siteId).key !== row.groupKey) return 需复核(row.orderNo, '的当前收件身份或站点与等待记录不一致')
    const weight = 解析合单重量(facts?.weightKg), recordedWeight = 解析合单重量(row.weightKg)
    if ((row.action.maxWeightKg !== undefined && weight === undefined) || weight !== recordedWeight) return 需复核(row.orderNo, '的当前重量与等待记录不一致或尚未核实')
    const shipByAt = 解析合单来源时间(order.shipByAt)
    if ((order.shipByAt && shipByAt === undefined) || (!order.shipByAt && order.urgency !== '无时限')) return 需复核(row.orderNo, '的发货截止时间尚未核实')
    if (shipByAt !== undefined && (row.deadlineAt === null || shipByAt - row.action.shipByBufferMinutes * 60_000 < row.deadlineAt)) return 需复核(row.orderNo, '存在尚未更新到等待记录的更早发货截止')
  }
  return ''
}

export function 合单操作复核快照(orderNos: readonly string[]): string {
  const related = 相关合单记录(orderNos)
  const sources = new Map(共享订单.value.map(order => [order.systemOrderNo, order]))
  const relatedNos = new Set(related.map(row => row.orderNo))
  const fulfillmentNos = new Set(related.flatMap(row => sources.get(row.orderNo)?.fulfillmentOrders.map(item => item.fulfillmentOrderNo) ?? []))
  return JSON.stringify({
    sources: related.map(row => ({ record: row, order: sources.get(row.orderNo) ?? null, version: 订单版本.value[row.orderNo] ?? null, sourceFacts: 自动合单样例资料[row.orderNo] ?? null })),
    warehouseExecutions: 仓库执行记录.value.filter(item => item.订单号.some(orderNo => relatedNos.has(orderNo)) || fulfillmentNos.has(item.履约单号)),
  })
}
