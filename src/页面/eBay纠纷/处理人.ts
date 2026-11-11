import { getSkuHandlerIds } from '@/组件/客服处理人/处理人'
import { 共享订单 } from '../订单处理/演示会话'
import { returnSession } from '../eBay退换货申请/数据'
import { getReturnSystemSkus } from '../eBay退换货申请/处理人'
import { resolveDisputeOrder } from './客服关联'
import { disputeHandlerOrderCandidates } from './客服关联样例'
import { disputeRecords, refreshRecord, type DisputeRecord } from './模型'

export function getDisputeSystemSkus(row: DisputeRecord): string[] {
  if (row.kind === 'EBAY_CASE') {
    const kind = row.caseInfo?.type === 'RETURN' ? 'RETURN' : row.caseInfo?.type === 'ITEM_NOT_RECEIVED' ? 'INR_REQUEST' : undefined
    const sources = row.links.filter(link => link.kind === kind && link.shopId === row.shopId)
    if (sources.length !== 1) return []
    const id = sources[0]!.id
    if (kind === 'RETURN') {
      const matches = returnSession.records.filter(source => source.id === id && source.shopId === row.shopId)
      const source = matches[0]
      return matches.length === 1 && source?.orderNo === row.orderId && source.buyerId === row.buyer ? getReturnSystemSkus(source) : []
    }
    const matches = disputeRecords.value.filter(source => source.kind === 'INR_REQUEST' && source.id === id && source.shopId === row.shopId)
    const source = matches[0]
    return matches.length === 1 && source?.orderId === row.orderId && source.buyer === row.buyer ? getDisputeSystemSkus(source) : []
  }
  const order = resolveDisputeOrder(row, disputeHandlerOrderCandidates(row, 共享订单.value))
  if (!order) return []
  const lines = row.kind === 'INR_REQUEST'
    ? row.inquiry?.lineItems?.map(item => ({ lineId: item.orderLineId, itemId: '' }))
    : row.payment?.details?.lines.filter(item => !!item.itemId).map(item => ({ lineId: item.lineItemId, itemId: item.itemId }))
  return [...new Set((lines ?? []).flatMap(line => {
    if (!line.lineId) return []
    const candidates = order.items.filter(item => item.externalLineId === line.lineId)
    const item = candidates.length === 1 ? candidates[0] : undefined
    return item?.skuResolutionStatus === '成功' && item.systemSku && (!line.itemId || line.itemId === item.platformItemId) ? [item.systemSku] : []
  }))]
}

export function getDisputeHandlerIds(row: DisputeRecord): string[] {
  if (row.owner === '已结束') return row.closedHandlerIds ?? []
  return getSkuHandlerIds(getDisputeSystemSkus(row))
}

export function refreshDisputeWithHandlers(row: DisputeRecord, at?: string) {
  const wasOpen = row.owner !== '已结束'
  const message = refreshRecord(row, at)
  if (wasOpen && row.owner === '已结束') row.closedHandlerIds = getSkuHandlerIds(getDisputeSystemSkus(row))
  return message
}
