import { reactive } from 'vue'
import { createReturnFilters, type ReturnQueue, type ReturnAction, type ReturnActionDraft, type PreparedReturnAction } from './模型'

export const returnListView = reactive({ draft: createReturnFilters(), applied: createReturnFilters(), queue: 'all' as ReturnQueue, page: 1, pageSize: 20, searchError: '', scrollTop: 0, tableScrollTop: 0 })
export interface ReturnDetailView {
  note: string; action: ReturnAction | null; actionDraft: ReturnActionDraft | null
  actionError: string; confirmation: boolean; prepared: PreparedReturnAction | null
  refreshFeedback: string; readScroll: number; actionScroll: number
}
const detailViews = new Map<string, ReturnDetailView>()
export function readReturnDetailView(key: string): ReturnDetailView {
  if (!detailViews.has(key)) detailViews.set(key, reactive({ note: '', action: null, actionDraft: null, actionError: '', confirmation: false, prepared: null, refreshFeedback: '', readScroll: 0, actionScroll: 0 }))
  return detailViews.get(key)!
}
export function clearReturnDetailView(key: string): void { detailViews.delete(key) }
export function resetReturnViews(): void {
  Object.assign(returnListView, { draft: createReturnFilters(), applied: createReturnFilters(), queue: 'all', page: 1, pageSize: 20, searchError: '', scrollTop: 0, tableScrollTop: 0 })
  detailViews.clear()
}
