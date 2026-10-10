import type { 全渠道订单, 履约单摘要, 订单处理状态 } from '../全渠道订单/类型'
import type { 仓库执行 } from './演示会话'

/** 展示来源时间自带的 UTC 偏移；缺失时不推测服务器或用户时区。 */
export function 提取发货时区(来源时间?: string): string {
  if (!来源时间?.trim() || 来源时间.trim() === '—') return '平台未提供'
  return 来源时间.trim().match(/\bUTC(?:[+-]\d{1,2}(?::\d{2})?)?$/i)?.[0].toUpperCase() ?? '时区未提供'
}

/** 已有履约计划优先；未创建履约单时展示待发数量，未知数量不能合计为零。 */
export function 展示计划数量(商品: { fulfillableQuantity?: number }[], 履约计划?: number): string {
  if (履约计划 !== undefined) return `计划发货 ${履约计划} 件`
  if (!商品.length || 商品.some((行) => 行.fulfillableQuantity === undefined)) return '待发数量待核实'
  return `待发数量 ${商品.reduce((合计, 行) => 合计 + 行.fulfillableQuantity!, 0)} 件`
}

export interface 作业行 { key: string; order: 全渠道订单; fulfillment?: 履约单摘要; execution?: 仓库执行; stage: 订单处理状态 }

/** 列表及仓库筛选共用实际路由；完整身份包含账号，不把同仓不同账号压成首条。 */
export function 获取作业路由(行: 作业行) {
  const 有效路由 = 行.order.fulfillmentOrders.filter(项 => 项.isActive).map(项 => 项.route)
  const 路由 = 行.fulfillment ? [行.fulfillment.route] : 行.stage !== '待审核' && 有效路由.length ? 有效路由 : 行.order.defaultRoute ? [行.order.defaultRoute] : []
  const 已见 = new Set<string>()
  return 路由.filter(项 => {
    const 身份 = JSON.stringify([项.warehouseProvider, 项.warehouseAccount, 项.warehouse, 项.shippingChannelCode, 项.shippingChannel, 项.labelMode])
    if (已见.has(身份)) return false
    已见.add(身份)
    return true
  })
}

export function 命中作业仓库(行: 作业行, 仓库: string) {
  return !仓库 || 获取作业路由(行).some(项 => 项.warehouse === 仓库)
}
export type 作业关注 = '全部' | '可审核' | '审核待处理' | '可推仓' | '结果待核查' | '下单失败' | '待出库' | '部分出库' | '出库异常' | '取消中' | '待标发' | '标发中' | '标发失败' | '标发成功' | '无需标发' | '无标发记录'

/** 快捷关注只筛选已存在的事实，不写入订单或仓库状态。 */
export function 命中作业关注(行: 作业行, 关注: 作业关注, 阻断: string[], 标发状态?: string): boolean {
  if (关注 === '全部') return true
  if (关注 === '可审核') return 行.stage === '待审核' && !阻断.length
  if (关注 === '审核待处理') return 行.stage === '待审核' && !!阻断.length
  if (关注 === '可推仓') return 行.stage === '待推单' && !阻断.length
  if (关注 === '结果待核查') return !!行.execution?.待核查 || 行.execution?.状态 === '下单中'
  if (关注 === '部分出库') return !!行.fulfillment && 行.fulfillment.shippedQuantity > 0 && 行.fulfillment.shippedQuantity < 行.fulfillment.plannedQuantity
  if (['下单失败', '待出库', '出库异常', '取消中'].includes(关注)) return 行.execution?.状态 === 关注
  if (关注 === '无标发记录') return 行.stage === '已发货' && !标发状态
  return 行.stage === '已发货' && 标发状态 === 关注
}

export function 展示剩余数量(履约?: 履约单摘要): string {
  if (!履约) return '待审核确认'
  if (履约.shippedQuantity > 履约.plannedQuantity) return '数量待核查'
  return String(履约.plannedQuantity - 履约.shippedQuantity)
}
