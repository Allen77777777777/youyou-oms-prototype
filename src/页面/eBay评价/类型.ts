import type { CustomerServiceLog } from '@/组件/客服日志/日志工具'
export type ReviewCommentType = 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE'
export type ReviewHandlingStatus = 'pending' | 'processing' | 'resolved'
export type ReviewPlatformState = 'ENTERED' | 'WITHDRAWN' | 'HIDDEN' | 'REVISED' | 'REVISION_OPEN' | 'REVISION_DECLINED_OR_EXPIRED'
export type ReviewSource = 'all' | 'buyer' | 'automated'
export type BuyerFeedbackSendSource = 'manual' | 'automation' | 'external' | 'unknown'

export interface ReviewReasonCategory {
  id: string
  name: string
  builtin: boolean
  enabled: boolean
  /** 一经业务使用保留该名称，停用不改写历史评价或日志。 */
  used: boolean
}

export interface ReviewComment { text: string; at: string; by: string }
export interface ReviewLog { id: string; at: string; by: string; action: string; detail: string; result?: string }
/** 本地已核实的商品关联及匹配快照，名称、相似 SKU 不构成关联。 */
export interface ReviewSkuLink { shopId: string; buyerId: string; orderLineItemId: string; sku: string; handlerIds: string[] }
export interface ReviewRecord {
  skuLink?: ReviewSkuLink
  id: string
  shopId: string
  shopName: string
  buyerId: string
  orderLineItemId: string
  /** 仅在同店铺、同买家且精确关联的站内信样例中提供；不是 OMS 订单 ID。 */
  orderId?: string
  orderNo: string
  conversationId?: string
  title: string
  sku: string
  platformSku: string
  listingId: string
  commentType: ReviewCommentType
  content: string
  translation: string
  createdAt: string
  automated: boolean
  platformState: ReviewPlatformState
  reply?: ReviewComment
  followup?: ReviewComment
  handlingStatus: ReviewHandlingStatus
  /** 旧原型人工指派的显示名。 */
  owner?: string
  handlerIds?: string[]
  reason: string
  notes: ReviewComment[]
  logs: ReviewLog[]
  eligibleForRevision: boolean
  logistics: { warehouse: string; channel: string; trackingNumber: string; status: string }
  afterSalesSummary: string
}

export interface BuyerFeedbackAttempt {
  id: string
  at: string
  by: string
  text: string
  /** 仅演示已明确成功或失败；超时、结果未知不能写成失败并盲目重试。 */
  outcome: 'failed' | 'succeeded'
  code?: string
  message: string
  sendSource?: BuyerFeedbackSendSource
  automationRuleName?: string
}
export interface BuyerFeedbackRecord {
  skuLink?: ReviewSkuLink
  id: string
  shopId: string
  shopName: string
  buyerId: string
  orderNo: string
  orderLineItemId: string
  title: string
  sku: string
  completedAt: string
  eligible: boolean
  ineligibleReason?: string
  status: 'pending' | 'sent'
  comment?: ReviewComment
  attempts?: BuyerFeedbackAttempt[]
  /** 卖家给买家好评的执行来源，与收到评价的 automated 字段无关。 */
  sendSource?: BuyerFeedbackSendSource
  /** 仅展示已执行结果的规则名称快照，本原型不执行自动好评规则。 */
  automationRuleName?: string
  /** 仅虚构演示资料：第一次通过资格和内容校验的提交模拟明确失败。 */
  simulateFailureOnce?: boolean
}

export interface ReviewFilters {
  shopIds: string[]
  commentTypes: ReviewCommentType[]
  handlingStatuses: ReviewHandlingStatus[]
  owners: string[]
  source: ReviewSource
  platformStates: ReviewPlatformState[]
  replyState: 'all' | 'replied' | 'unreplied'
  /** 北京时间 YYYY-MM-DD，含首尾日。 */
  dateRange: [string, string] | []
  field: string
  mode: 'contains' | 'exact'
  query: string
  onlyAttention: boolean
}

export interface ReviewSummary {
  total: number
  positive: number
  neutral: number
  negative: number
  nonPositive: number
  /** 百分数，范围 0～100；无有效评价时为 null。 */
  nonPositiveRate: number | null
  /** 有效中差评中尚未完成处理的数量，包含 pending 与 processing。 */
  pending: number
  processing: number
  resolved: number
  replyCount: number
  automated: number
}
export interface ReviewTrend { date: string; total: number; positive: number; neutral: number; negative: number }
export interface ReviewShopSummary extends ReviewSummary { shopId: string; shopName: string }
export interface ReviewReasonSummary { reason: string; count: number }
export interface ReviewActionResult { ok: boolean; message: string; error?: string }

export interface ReviewSession {
  reviews: ReviewRecord[]
  reasonCategories: ReviewReasonCategory[]
  reasonOperationLogs: CustomerServiceLog[]
  buyerFeedback: BuyerFeedbackRecord[]
  replyDrafts: Record<string, string>
  lastSyncedAt: string
  syncing: boolean
}
