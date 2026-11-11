import { handlerIdFromLegacy } from '@/组件/客服处理人/处理人'
import type { BuyerFeedbackRecord, ReviewRecord } from './类型'

type TransactionItem = Pick<ReviewRecord, 'shopId' | 'buyerId' | 'orderLineItemId' | 'sku' | 'skuLink'>

/** SKU 来自评价所属交易行。缺失身份的记录等待资料核对。 */
export function reviewSystemSkus(row: TransactionItem): string[] {
  const link = row.skuLink
  if (!link) return []
  const fields = ['shopId', 'buyerId', 'orderLineItemId', 'sku'] as const
  return fields.every(field => row[field]?.trim() && row[field] === link[field]) ? [link.sku] : []
}

export function getReviewSkuHandlerIds(row: TransactionItem): string[] {
  return reviewSystemSkus(row).length ? [...row.skuLink!.handlerIds] : []
}
export function hasManualReviewHandlers(row: ReviewRecord): boolean {
  return row.handlerIds !== undefined || Boolean(row.owner?.trim())
}

export function getReviewHandlerIds(row: ReviewRecord): string[] {
  if (row.handlerIds) return [...row.handlerIds]
  if (row.owner?.trim()) return [handlerIdFromLegacy(row.owner)]
  return getReviewSkuHandlerIds(row)
}

export function getBuyerFeedbackHandlerIds(row: BuyerFeedbackRecord): string[] {
  return getReviewSkuHandlerIds(row)
}

export function sameReviewHandlers(current: readonly string[], next: readonly string[]): boolean {
  return current.length === next.length && current.every(id => next.includes(id))
}
