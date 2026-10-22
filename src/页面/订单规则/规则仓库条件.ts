import type { 全渠道订单, 订单路由 } from '../全渠道订单/类型'
import type { 渠道配置 } from '../仓配管理/物流渠道配置'
import { 解析来源时刻 } from '../订单处理/时间展示工具'
import type { 规则类型 } from './规则逻辑'

// 与现有分仓仓库键采用相同编码；不运行时导入规则路由，避免条件字典初始化循环。
function 仓库身份键(channel: 渠道配置): string { return JSON.stringify([channel.providerId, channel.accountId, channel.warehouseId]) }

function 完整仓库身份(channel: 渠道配置): boolean {
  return [channel.id, channel.providerId, channel.accountId, channel.warehouseId].every(值 => typeof 值 === 'string' && !!值.trim())
}

/** 来源于共享渠道字典的只读仓库选项；停用或仓配分离不抹去历史仓库身份。 */
export function 创建发货仓库选项(channels: readonly 渠道配置[]): { value: string; label: string }[] {
  const result = new Map<string, { value: string; label: string }>()
  const counts = new Map<string, number>()
  for (const channel of channels) counts.set(channel.id, (counts.get(channel.id) ?? 0) + 1)
  for (const channel of channels) {
    if (!完整仓库身份(channel) || counts.get(channel.id) !== 1) continue
    const value = 仓库身份键(channel)
    if (!result.has(value)) result.set(value, { value, label: `${channel.warehouse?.trim() || channel.warehouseId} · ${channel.provider?.trim() || channel.providerId} · ${channel.account?.trim() || channel.accountId}` })
  }
  return [...result.values()]
}

/**
 * 只按唯一渠道 ID 关联稳定仓库三元组；名称仅展示，不能作为兜底身份。
 * 来源中的任一路由无法识别时整体未知，防止否定条件从部分已知仓库误得出结论。
 */
export function 读取发货仓库来源(order: 全渠道订单, type: 规则类型, channels: readonly 渠道配置[], action?: string): string[] | undefined {
  if (type !== '审单规则' && type !== '订单标发规则') return undefined
  const active = order.fulfillmentOrders.filter(项 => 项.isActive === true)
  // 终止状态与仍有效标志冲突时不自行借默认仓消解。
  if (active.some(项 => 项.status === '已终止')) return undefined
  let routes: readonly 订单路由[]
  if (type === '订单标发规则') {
    routes = active.filter(项 => action === '物流下单后标发'
      ? typeof 项.trackingNumber === 'string' && !!项.trackingNumber.trim()
      : Number.isFinite(项.shippedQuantity) && 项.shippedQuantity > 0 && 解析来源时刻(项.shippedAt) !== undefined).map(项 => 项.route)
  } else if (active.length) {
    routes = active.map(项 => 项.route)
  } else if (order.manualShippingPlan) {
    routes = order.manualShippingPlan.packages.map(项 => 项.route)
  } else {
    routes = order.defaultRoute ? [order.defaultRoute] : []
  }
  if (!routes.length) return undefined
  const result = new Set<string>()
  for (const route of routes) {
    if (typeof route?.shippingChannelId !== 'string' || !route.shippingChannelId.trim()) return undefined
    const matched = channels.filter(channel => channel.id === route.shippingChannelId)
    if (matched.length !== 1 || !完整仓库身份(matched[0]!)) return undefined
    result.add(仓库身份键(matched[0]!))
  }
  return result.size ? [...result] : undefined
}
