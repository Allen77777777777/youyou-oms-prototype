import type { ReturnRecord } from './模型'

/** 合同层只发出窄通知，不反向加载售后会话及演示数据。 */
let refundEvidenceReconciler: ((row: ReturnRecord) => void) | undefined
export function registerReturnRefundEvidenceReconciler(handler: (row: ReturnRecord) => void): void { refundEvidenceReconciler = handler }
export function notifyReturnRefundEvidence(row: ReturnRecord): void { refundEvidenceReconciler?.(row) }

export function returnRefundEvidenceBusinessIds(row: ReturnRecord): Set<string> {
  const ids = new Set<string>()
  for (const evidence of row.refundEvidence || []) {
    if (evidence.shopId !== row.shopId || evidence.returnId !== row.id || evidence.status !== 'SUCCESS' || evidence.source !== 'issue_refund') continue
    const attempts = row.submissionAttempts?.filter(attempt => attempt.id === evidence.submissionId) || []
    const attempt = attempts.length === 1 ? attempts[0] : undefined
    if (!attempt?.businessId || attempt.requestSnapshot?.method !== 'POST' || attempt.requestSnapshot.api || attempt.requestSnapshot.path !== `/post-order/v2/return/${encodeURIComponent(row.id)}/issue_refund`) continue
    ids.add(attempt.businessId)
  }
  return ids
}

/** 已确认受理的报价才可以接收买家决定；多笔时缺少本笔标识不猜配。 */
export function resolveReturnBuyerReply(row: ReturnRecord): { requestId?: string; current: boolean; hasLocalOffers: boolean } {
  const attempts = row.submissionAttempts?.filter(attempt => attempt.businessId && attempt.requestSnapshot?.body.decision === 'OFFER_PARTIAL_REFUND') || []
  const confirmed = attempts.filter(attempt => attempt.outcome === 'confirmed')
  const historicalCandidates = row.afterSaleOfferEvidence?.filter(evidence => evidence.shopId === row.shopId && evidence.returnId === row.id && evidence.requestId && evidence.sourceEventId) || []
  const historical = historicalCandidates.filter((evidence, index, all) =>
    !all.some(other => other.requestId === evidence.requestId && other.sourceEventId !== evidence.sourceEventId || other.sourceEventId === evidence.sourceEventId && other.requestId !== evidence.requestId) &&
    all.findIndex(other => other.requestId === evidence.requestId && other.sourceEventId === evidence.sourceEventId) === index)
  const ids = [...new Set([...confirmed.map(attempt => attempt.businessId!), ...historical.map(evidence => evidence.requestId)])]
  const explicit = row.mock?.externalRequestId
  const requestId = explicit ? (ids.includes(explicit) ? explicit : undefined) : ids.length === 1 && confirmed.some(attempt => attempt.businessId === ids[0]) ? ids[0] : undefined
  const currentId = attempts.length ? attempts[attempts.length - 1]?.businessId : historical.length === 1 ? historical[0]?.requestId : undefined
  return { requestId, current: !!requestId && currentId === requestId, hasLocalOffers: !!attempts.length || !!historicalCandidates.length }
}
