import { matchesHandlerFilter } from '@/组件/客服处理人/处理人'
import { getDisputeHandlerIds } from './处理人'
import { reactive } from 'vue'
import { 命中多选, 命中字段搜索, type 搜索模式 } from '@/组件/筛选/筛选工具'
import type { DisputeKind, DisputeRecord } from './类型'
import { availableActions, isSellerOverdue } from './模型'
import { paymentHasAnswered } from './支付争议证据'

export const workFilters = [
  { value: 'seller', label: '待卖家办理' }, { value: 'overdue', label: '卖家已超期' },
  { value: 'verify', label: '提交待回查' }, { value: 'platform', label: '等待平台或付款机构' },
  { value: 'appeal', label: '可申诉' },
]
export function needsSellerHubFollowup(row: DisputeRecord) {
  return !row.pending && row.owner === '卖家' && row.status === 'ACTION_NEEDED' &&
    paymentHasAnswered(row) && !!row.payment?.platformAction && !!row.payment.details?.requests.length
}
function matchesWork(row: DisputeRecord, value: string) {
  if (value === 'overdue') return isSellerOverdue(row)
  if (value === 'verify') return !!row.pending
  if (value === 'seller') return !row.pending && row.owner === '卖家'
  if (value === 'appeal') return availableActions(row).includes('APPEAL')
  return value === 'platform' && !row.pending && ['eBay', '付款机构'].includes(row.owner)
}

export function emptyFilters() {
  return { handlers: [] as string[], shops: [] as string[], statuses: [] as string[], sources: [] as string[], work: [] as string[],
    field: 'id', mode: 'contains' as 搜索模式, query: '' }
}
function newView() {
  return { onlyMine: false, draft: emptyFilters(), applied: emptyFilters(), page: 1, size: 10 }
}
export const views = reactive({ INR_REQUEST: newView(), EBAY_CASE: newView(), PAYMENT_DISPUTE: newView() })
export function matchesFilters(row: DisputeRecord, kind: DisputeKind, filters: ReturnType<typeof emptyFilters>) {
  if (row.kind !== kind || !命中多选(filters.shops, row.shopId) || !命中多选(filters.statuses, row.statusText)) return false
  if (filters.handlers.length && !matchesHandlerFilter(getDisputeHandlerIds(row), filters.handlers)) return false
  if (kind === 'EBAY_CASE' && !命中多选(filters.sources, row.caseInfo?.type)) return false
  if (filters.work.length && !filters.work.some(value => matchesWork(row, value))) return false
  const searchValues: Record<string, string> = { id: row.id, orderId: row.orderId, buyer: row.buyer, sku: row.sku }
  return 命中字段搜索(searchValues[filters.field], filters.query, filters.mode)
}
