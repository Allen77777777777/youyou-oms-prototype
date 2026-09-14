import type { 全渠道订单 } from '../全渠道订单/类型'

export type 规则类型 = '审单规则' | '分仓规则' | '订单标发规则'
export type 条件字段 = 'platformCode' | 'storeName' | 'countryCode' | 'fulfillmentMode'
export interface 规则条件 { field: 条件字段; operator: '等于' | '不等于'; value: string }
export interface 订单规则 { id: string; name: string; type: 规则类型; enabled: boolean; priority: number; mode: '全部满足' | '任一满足'; conditions: 规则条件[]; action: string; version: number; updatedAt: string; note: string }
export const 条件字段名: Record<条件字段, string> = { platformCode: '平台', storeName: '店铺', countryCode: '目的国家', fulfillmentMode: '履约模式' }
export const 规则动作: Record<规则类型, string[]> = { 审单规则: ['进入人工复核', '满足门禁后建议自动审核'], 分仓规则: ['万邑通美西仓', '谷仓美东仓', '西邮波兰仓', '出口易德国仓', '4PX 巴西圣保罗仓'], 订单标发规则: ['具备出库事实后建议标发', '进入人工核查'] }

export function 命中规则(规则: 订单规则, 订单: 全渠道订单): boolean {
  if (!规则.enabled || !规则.conditions.length) return false
  const 结果 = 规则.conditions.map((条件) => {
    if (!条件.value.trim()) return false
    const 原值 = 条件.field === 'countryCode' ? 订单.address.countryCode : 订单[条件.field]
    return 条件.operator === '等于' ? 原值 === 条件.value : 原值 !== 条件.value
  })
  return 规则.mode === '全部满足' ? 结果.every(Boolean) : 结果.some(Boolean)
}
export function 试算规则(规则: 订单规则[], 订单: 全渠道订单, 类型: 规则类型) {
  const 候选 = 规则.filter((项) => 项.type === 类型).sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id))
  const 轨迹 = 候选.map((项) => ({ rule: 项, matched: 命中规则(项, 订单) }))
  const 首个命中 = 轨迹.find((项) => 项.matched)?.rule
  const 门禁: string[] = []
  if (订单.fulfillmentMode !== '自配送') 门禁.push('平台履约订单不进入自配送作业')
  if (!订单.processingStatus) 门禁.push('订单尚未进入 OMS 处理')
  // 标准订单的 paidAt 只用于展示，不能代替 eBay 当前订单级 orderPaymentStatus。
  // 未通过 PAID 准入的订单没有处理状态；准入后的非 PAID 更新应先由平台适配链路转为异常。
  if (订单.processingStatus === '不发货' || 订单.processingStatus === '异常' || 订单.cancelledAt || 订单.blockReason) 门禁.push('订单存在终止或异常门禁')
  if (订单.platformCode !== 'eBay') 门禁.push('该平台接入与动作门禁尚未验证')
  if (类型 === '审单规则' || 类型 === '分仓规则') {
    if (订单.processingStatus !== '待审核') 门禁.push('审单与首次路由分配只在待审核阶段执行')
  }
  if (类型 === '订单标发规则' && !订单.fulfillmentOrders.some((项) => 项.isActive && 项.shippedQuantity > 0 && 项.shippedAt)) 门禁.push('未取得有效出库事实，不得标发')
  return { trace: 轨迹, hit: 首个命中, gates: 门禁 }
}

export function 创建规则样例(): 订单规则[] {
  const 基础 = { enabled: true, mode: '全部满足' as const, version: 1, updatedAt: '2026-09-12 09:00 UTC+8', note: '合理假设：本地条件与动作样例，待岗位及接口评审。' }
  return [
    { ...基础, id: 'RULE-REVIEW-01', name: 'eBay 北美订单人工复核', type: '审单规则', priority: 10, conditions: [{ field: 'platformCode', operator: '等于', value: 'eBay' }, { field: 'countryCode', operator: '等于', value: 'US' }], action: '进入人工复核' },
    { ...基础, id: 'RULE-ROUTE-01', name: '美国自配送默认路由', type: '分仓规则', priority: 10, conditions: [{ field: 'countryCode', operator: '等于', value: 'US' }, { field: 'fulfillmentMode', operator: '等于', value: '自配送' }], action: '万邑通美西仓' },
    { ...基础, id: 'RULE-ROUTE-02', name: '北美备用仓候选', type: '分仓规则', priority: 20, enabled: false, conditions: [{ field: 'countryCode', operator: '等于', value: 'US' }], action: '谷仓美东仓' },
    { ...基础, id: 'RULE-CONFIRM-01', name: 'eBay 实际出库后回传', type: '订单标发规则', priority: 10, conditions: [{ field: 'platformCode', operator: '等于', value: 'eBay' }], action: '具备出库事实后建议标发' },
  ]
}
