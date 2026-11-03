import type { 全渠道订单, 订单商品行 } from '../全渠道订单/类型'
import type { 仓配单据 } from '../仓配管理/仓配模型'
import type { CancelOutboundContext } from '../eBay取消订单申请/模型'
import { resolveCancellationOrder, resolveCancellationOutbound } from '../eBay取消订单申请/关联导航'
import type { ReturnRecord } from './模型'
import { demoReturnItemLinks } from './虚构商品关联'

const sourceIdentity = (source: ReturnRecord) => ({ systemOrderNo: source.systemOrderNo, shopId: source.shopId, orderId: source.orderNo, buyer: source.buyerId })

/** 只复用已明确的订单身份；本次申请商品和数量不作为整单身份或履约范围。 */
export function resolveReturnOrder(source: ReturnRecord, orders: readonly 全渠道订单[]): 全渠道订单 | undefined {
  return resolveCancellationOrder(sourceIdentity(source) as Parameters<typeof resolveCancellationOrder>[0], orders)
}

/** 仅复用明确的虚构来源交易行，双平台交易身份、订单和明细均须唯一一致。 */
export function resolveReturnItem(source: ReturnRecord, orders: readonly 全渠道订单[]): 订单商品行 | undefined {
  const order = resolveReturnOrder(source, orders), detail = source.detail
  if (!order || !detail?.itemId || !detail.transactionId) return undefined
  const links = demoReturnItemLinks.filter(link => link.shopId === source.shopId && link.orderNo === source.orderNo && link.itemId === detail.itemId && link.transactionId === detail.transactionId && link.systemOrderNo === order.systemOrderNo)
  // 重复初始化测试可能重建同一虚构来源；相同证据去重，不合并不同来源明细。
  const identities = [...new Set(links.map(link => link.externalLineId))]
  if (identities.length !== 1) return undefined
  const items = order.items.filter(item => item.externalLineId === identities[0] && item.platformItemId === detail.itemId)
  return items.length === 1 ? items[0] : undefined
}

export function resolveReturnOutbound(source: ReturnRecord, context: CancelOutboundContext, rows: readonly 仓配单据[], orders: readonly 全渠道订单[]): 仓配单据 | undefined {
  return resolveCancellationOutbound(sourceIdentity(source) as Parameters<typeof resolveCancellationOutbound>[0], context, rows, orders)
}
