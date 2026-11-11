import { getSkuHandlerIds } from '@/组件/客服处理人/处理人'
import { 共享订单 } from '../订单处理/演示会话'
import { readSharedUkOrderFixture } from '../eBay退换货申请/关联资料'
import { resolveCancellationOrder } from './关联导航'
import { syncCancellation, type CancelRecord } from './模型'

export function getCancelSystemSkus(row: CancelRecord): string[] {
  let orders = 共享订单.value
  if (row.systemOrderNo === 'OMS-DEMO-RET-002' && !orders.some(order => order.systemOrderNo === row.systemOrderNo ||
    (order.platformCode === 'eBay' && order.storeId === row.shopId && order.platformOrderNo === row.orderId))) {
    const fixture = readSharedUkOrderFixture()
    if (fixture) orders = [fixture]
  }
  const order = resolveCancellationOrder(row, orders)
  return [...new Set(order?.items.flatMap(item => item.skuResolutionStatus === '成功' && item.systemSku ? [item.systemSku] : []) ?? [])]
}

export function getCancelHandlerIds(row: CancelRecord): string[] {
  if (row.cancelState === 'CLOSED') return row.closedHandlerIds ?? []
  return getSkuHandlerIds(getCancelSystemSkus(row))
}

export function refreshCancelWithHandlers(row: CancelRecord, at?: string) {
  const wasOpen = row.cancelState !== 'CLOSED'
  syncCancellation(row, at)
  if (wasOpen && row.cancelState === 'CLOSED') row.closedHandlerIds = getSkuHandlerIds(getCancelSystemSkus(row))
}
