import type { 全渠道订单 } from '../全渠道订单/类型'
import type { 仓配单据 } from '../仓配管理/仓配模型'
import { 取得出库详情 } from '../仓配管理/三方仓出库模型'
import type { CancelOutboundContext, CancelRecord } from './模型'

/** 编号只用于展示；按明确系统身份定位后，再校验来源平台、店铺、订单和买家。 */
export function resolveCancellationOrder(source: CancelRecord, orders: readonly 全渠道订单[]): 全渠道订单 | undefined {
  if (![source.systemOrderNo, source.shopId, source.orderId, source.buyer].every(value => value?.trim())) return undefined
  const matches = orders.filter(order => order.systemOrderNo === source.systemOrderNo)
  if (matches.length !== 1) return undefined
  const order = matches[0]!
  if (order.platformCode !== 'eBay' || order.storeId !== source.shopId || order.platformOrderNo !== source.orderId || order.buyerExternalId !== source.buyer) return undefined
  return orders.filter(candidate => candidate.platformCode === 'eBay' && candidate.storeId === source.shopId && candidate.platformOrderNo === source.orderId).length === 1 ? order : undefined
}

export function resolveCancellationOutbound(source: CancelRecord, context: CancelOutboundContext, rows: readonly 仓配单据[], orders: readonly 全渠道订单[]): 仓配单据 | undefined {
  if (!context.outboundId?.trim() || !resolveCancellationOrder(source, orders)) return undefined
  const matches = rows.filter(row => row.id === context.outboundId)
  if (matches.length !== 1) return undefined
  const row = matches[0]!
  if (row.kind !== '仓库' || row.no !== context.no || (row.externalNo || null) !== context.externalNo || row.account !== context.account || row.warehouse !== context.warehouse) return undefined
  const sources = 取得出库详情(row).sourceOrders.filter(order => order.systemOrderNo === source.systemOrderNo && order.platform === 'eBay' && order.shopId === source.shopId && order.platformOrderNo === source.orderId)
  return sources.length === 1 ? row : undefined
}
