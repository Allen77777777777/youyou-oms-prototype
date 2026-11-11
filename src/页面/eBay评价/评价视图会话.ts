import { reactive } from 'vue'
import { createAwaitingReviewFilters, type AwaitingReviewFilters } from './未收到评价模型'

export type ReviewDirection = 'received' | 'awaiting' | 'given'
export interface AwaitingReviewView {
  draft: AwaitingReviewFilters
  applied: AwaitingReviewFilters
  page: number
  pageSize: number
  selected: string[]
}
export function cloneAwaitingFilters(filters: AwaitingReviewFilters): AwaitingReviewFilters {
  return { ...filters, handlerIds: [...filters.handlerIds], shopIds: [...filters.shopIds], outboundStatuses: [...filters.outboundStatuses], dateRange: filters.dateRange.length ? [filters.dateRange[0]!, filters.dateRange[1]!] : [] }
}
const initialView = (): AwaitingReviewView => ({ draft: createAwaitingReviewFilters(), applied: createAwaitingReviewFilters(), page: 1, pageSize: 20, selected: [] })
/** 只恢复同一浏览器会话内的查看位置；刷新重置，不作为业务持久化。 */
export const reviewViewSession = reactive({ activeTab: 'received' as ReviewDirection, awaitingGeneration: 0, awaiting: initialView() })
export function resetAwaitingReviewView(): void { reviewViewSession.awaitingGeneration++; reviewViewSession.awaiting = initialView() }
export function resetReviewViewSession(): void { reviewViewSession.activeTab = 'received'; resetAwaitingReviewView() }
export function saveAwaitingReviewView(view: AwaitingReviewView, generation: number): void {
  if (generation !== reviewViewSession.awaitingGeneration) return
  reviewViewSession.awaiting = { draft: cloneAwaitingFilters(view.draft), applied: cloneAwaitingFilters(view.applied), page: view.page, pageSize: view.pageSize, selected: [...view.selected] }
}
