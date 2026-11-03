import { reactive } from 'vue'
import { createBuyerFeedback, createReviewReasons, createReviews } from './数据'
import type { ReviewSession } from './类型'
import { resetReviewViewSession } from './评价视图会话'

function initialSession(): ReviewSession {
  return { reviews: createReviews(), reasonCategories: createReviewReasons(), buyerFeedback: createBuyerFeedback(), replyDrafts: {}, lastSyncedAt: '2026-10-29T09:00:00+08:00', syncing: false }
}

/** 同一浏览器会话内两页面共用，路由切换保持、刷新重置；无API或持久化。 */
export const reviewSession = reactive<ReviewSession>(initialSession())
let sessionGeneration = 0
export function resetReviewSession(): void {
  sessionGeneration += 1
  Object.assign(reviewSession, initialSession())
  resetReviewViewSession()
}

/** 演示同步只更新刷新时间，不生成新评价或伪造平台改评结果，也不覆盖内部处理。 */
export async function syncReviews(): Promise<boolean> {
  if (reviewSession.syncing) return false
  const generation = sessionGeneration
  reviewSession.syncing = true
  await new Promise(resolve => setTimeout(resolve, 350))
  if (generation !== sessionGeneration) return false
  reviewSession.lastSyncedAt = new Date().toISOString()
  reviewSession.syncing = false
  return true
}
