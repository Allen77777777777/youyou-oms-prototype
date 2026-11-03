import { reactive } from 'vue'
import { 共享订单, 仓库执行记录 } from '../订单处理/演示会话'
import { createAwaitingReviewOrders } from './未收到评价数据'
import { isAwaitingOmsSnapshotConsistent, resolveAwaitingOmsOrder } from './未收到评价订单关联'
import type { AwaitingReviewOrder } from './未收到评价模型'
import type { 全渠道订单 } from '../全渠道订单/类型'
import type { ReviewComment } from './类型'

export const awaitingReviewSession = reactive({ orders: createAwaitingReviewOrders(), sharedNotes: {} as Record<string, ReviewComment[]> })
export function resetAwaitingReviewSession(): void {
  awaitingReviewSession.orders = createAwaitingReviewOrders()
  awaitingReviewSession.sharedNotes = {}
}

function currentShipping(order: 全渠道订单) {
  const active = order.fulfillmentOrders.filter(item => item.isActive)
  const shipments = active.filter(item => item.shippedQuantity > 0 && item.shippedAt)
  const currentFulfillmentNos = new Set(active.map(item => item.fulfillmentOrderNo))
  const outboundStatuses = [...new Set(仓库执行记录.value.filter(execution => execution.订单号.includes(order.systemOrderNo) && currentFulfillmentNos.has(execution.履约单号)).map(execution => execution.状态))]
  const shippedAt = order.fulfillmentCompletedAt || shipments.map(item => item.shippedAt!).sort((a, b) => Date.parse(a.replace(' UTC+8', '+08:00').replace(' ', 'T')) - Date.parse(b.replace(' UTC+8', '+08:00').replace(' ', 'T'))).slice(-1)[0] || ''
  return { processingStatus: order.processingStatus || '', shippedAt, outboundStatuses, trackingNumbers: [...new Set(shipments.flatMap(item => item.trackingNumber ? [item.trackingNumber] : []))] }
}

/** 一份 OMS 事实只形成一条跟踪来源；Feedback 资格与只读 OMS 详情身份独立。 */
export function getAwaitingReviewOrders(): AwaitingReviewOrder[] {
  const targets = awaitingReviewSession.orders.map(source => resolveAwaitingOmsOrder(source, 共享订单.value))
  const targetCounts = new Map<string, number>()
  for (const target of targets) if (target) targetCounts.set(target.systemOrderNo, (targetCounts.get(target.systemOrderNo) ?? 0) + 1)
  const represented = new Set<string>()
  const linked = awaitingReviewSession.orders.map((source, index): AwaitingReviewOrder => {
    const target = targets[index]
    if (!target) return source.omsOrderId ? { ...source, omsOrderId: undefined, coverage: 'unknown', association: 'unknown' } : source
    const consistent = isAwaitingOmsSnapshotConsistent(source, target) && targetCounts.get(target.systemOrderNo) === 1
    if (targetCounts.get(target.systemOrderNo) === 1) represented.add(target.systemOrderNo)
    return {
      ...source, shopName: target.storeName, ...currentShipping(target),
      coverage: consistent ? source.coverage : 'unknown', association: consistent ? source.association : 'unknown',
      // 原始虚构来源仍保留；当前 OMS 商品变化会显式归待核对，不把旧映射套到新增商品。
      lines: target.items.map(item => {
        const sourceLines = source.lines.filter(line => line.id === item.externalLineId)
        const line = sourceLines[0]
        const sameLine = sourceLines.length === 1 && line !== undefined && item.orderedQuantity === line.quantity && (item.platformItemId || '') === line.listingId && (item.systemSku || '') === line.sku && (item.platformSku || '') === line.platformSku
        return { id: item.externalLineId, orderLineItemId: sameLine ? line!.orderLineItemId : '', listingId: item.platformItemId || '', title: item.platformItemTitle || item.systemItemName || '', sku: item.systemSku || '', platformSku: item.platformSku || '', quantity: item.orderedQuantity, association: sameLine ? line!.association : 'unknown' }
      }),
    }
  })
  const shared: AwaitingReviewOrder[] = 共享订单.value.filter(order => order.platformCode === 'eBay' && order.processingStatus === '已发货' && !represented.has(order.systemOrderNo)).map(order => {
    const id = `OMS-SHARED:${order.systemOrderNo}`
    awaitingReviewSession.sharedNotes[id] ??= []
    return { id, omsOrderId: order.systemOrderNo, omsOrderNo: order.systemOrderNo, shopId: order.storeId, shopName: order.storeName, buyerId: order.buyerExternalId || '', orderNo: order.platformOrderNo, platform: order.platformCode, ...currentShipping(order), coverage: 'unknown', association: 'unknown', notes: awaitingReviewSession.sharedNotes[id]!,
      lines: order.items.map(item => ({ id: item.externalLineId, orderLineItemId: '', listingId: item.platformItemId || '', title: item.platformItemTitle || item.systemItemName || '', sku: item.systemSku || '', platformSku: item.platformSku || '', quantity: item.orderedQuantity, association: 'unknown' })) }
  })
  return [...linked, ...shared]
}
