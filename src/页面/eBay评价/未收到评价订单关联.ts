import type { 全渠道订单 } from '../全渠道订单/类型'
import type { AwaitingReviewOrder } from './未收到评价模型'

const present = (value: unknown): value is string => typeof value === 'string' && Boolean(value.trim())

/** 只读详情按明确的 OMS 身份定位；Feedback 采集、关联资格与订单商品变化不影响此身份。 */
export function resolveAwaitingOmsOrder(source: AwaitingReviewOrder, orders: readonly 全渠道订单[]): 全渠道订单 | undefined {
  if (source.platform !== 'eBay' || ![source.omsOrderId, source.omsOrderNo, source.shopId, source.buyerId, source.orderNo].every(present)) return undefined
  // 当前原型以系统订单号作为共享 OMS 路由主键；两个来源字段必须指向同一对象。
  if (source.omsOrderId !== source.omsOrderNo) return undefined
  const bySystemId = orders.filter(order => order.systemOrderNo === source.omsOrderNo)
  if (bySystemId.length !== 1) return undefined
  const order = bySystemId[0]!
  if (order.platformCode !== 'eBay' || order.storeId !== source.shopId || order.buyerExternalId !== source.buyerId || order.platformOrderNo !== source.orderNo) return undefined
  const byPlatformIdentity = orders.filter(candidate => candidate.platformCode === 'eBay' && candidate.storeId === source.shopId && candidate.platformOrderNo === source.orderNo)
  return byPlatformIdentity.length === 1 && byPlatformIdentity[0] === order ? order : undefined
}

const optionalIdentity = (value: string | undefined) => value ?? ''

/** 快照一致性只用于演示资料对齐及去重，不作为打开已知 OMS 详情的额外资格。 */
export function isAwaitingOmsSnapshotConsistent(source: AwaitingReviewOrder, order: 全渠道订单): boolean {
  if (!source.lines.length || source.lines.length !== order.items.length) return false
  const sourceIds = source.lines.map(line => line.id), targetIds = order.items.map(item => item.externalLineId)
  if (!sourceIds.every(present) || !targetIds.every(present) || new Set(sourceIds).size !== sourceIds.length || new Set(targetIds).size !== targetIds.length) return false
  return source.lines.every(line => {
    const item = order.items.find(candidate => candidate.externalLineId === line.id)
    return item !== undefined && Number.isSafeInteger(line.quantity) && line.quantity > 0 && item.orderedQuantity === line.quantity
      && optionalIdentity(item.platformItemId) === line.listingId
      && optionalIdentity(item.systemSku) === line.sku
      && optionalIdentity(item.platformSku) === line.platformSku
  })
}
