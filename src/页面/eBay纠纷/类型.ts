import type { PaymentDetails, PaymentFile, PaymentReturnAddress } from './支付争议证据'
import type { CustomerServiceLog } from '@/组件/客服日志/日志工具'
export const kindLabels = { INR_REQUEST: 'Item not received', EBAY_CASE: 'Case', PAYMENT_DISPUTE: 'Payment dispute' } as const
export type DisputeKind = keyof typeof kindLabels
export const queues = ['全部', '待卖家处理', '等待结果', '申诉跟进', '已结束'] as const
export type DisputeQueue = typeof queues[number]
export const actionLabels = {
  TRACKING: '更新跟踪', MESSAGE: '给买家留言', REFUND: '全额退款', ESCALATE: '请求 eBay 介入',
  ACCEPT: '接受争议', ACCEPT_RETURN: '接受并要求退回', CONTEST: '抗辩', EVIDENCE: '准备证据', APPEAL: '办理申诉',
} as const
export type ActionCode = keyof typeof actionLabels
export interface ActionDraft {
  carrier?: string; tracking?: string; message?: string; reason?: string; returnAddress?: string
  trackings?: InquiryTracking[]
  evidenceRequest?: string; evidenceFiles?: File[]; evidenceNote?: string
  paymentReturnAddress?: PaymentReturnAddress
  platformRevision?: number
}
export interface Money {
  value: string; currency: string
  convertedFromValue?: string; convertedFromCurrency?: string; exchangeRate?: string
}
export interface InquiryTracking {
  carrier: string; tracking: string; carrierCode?: string; unsupportedCarrierName?: string
}
export interface RefundAmountLine { code?: string; label: string; amount: Money }
/** 全部金额直接投影来源值；不在页面计算净额或合并不同币种。 */
export interface SellerRefundAmounts {
  priceLines?: RefundAmountLine[]; credits?: RefundAmountLine[]; withholdings?: RefundAmountLine[]
  netAmount?: Money; totalCreditAmount?: Money; totalWithholdingAmount?: Money
  eBayProtectionCoveredAmount?: Money; plannedBuyerRecoveryAmount?: Money
}
export interface RefundFundingExecution {
  amount?: Money; attemptedAt?: string; completedAt?: string; stateCode?: string; stateText?: string; paymentMethod?: string
}
export interface InquiryRefund {
  id: string; status: string; amount: Money; statusCode?: string
  breakdown?: SellerRefundAmounts
  fundings?: { stateCode?: string; stateText?: string; executions?: RefundFundingExecution[] }[]
}
interface InquiryInformation {
  kind: 'TRACKING' | 'SIGNATURE'; at: string; actor: string
}
export interface InquiryDetails {
  carrier: string; tracking: string; state: string; refundStatus: string
  initiator?: string; responder?: string; closedAt?: string; resolutionEstimate?: string
  inquiryContentOnHold?: boolean
  creationReason?: { code: string; text: string }
  messageAllowed?: boolean
  lineItems?: { id: string; orderLineId: string; title: string; quantity: number | null }[]
  trackings?: InquiryTracking[]
  primaryAction?: ActionCode
  secondaryActions?: ActionCode[]
  requestedInfo?: InquiryInformation[]
  providedInfo?: (InquiryInformation & {
    tracking: string; carrier?: string; documentName?: string; documentId?: string; uploadedAt?: string
  })[]
  /** 使用卖家侧退款总额的原币值；估算与实际退款采用相同口径。 */
  refundEstimate?: Money
  refundEstimateBreakdown?: SellerRefundAmounts
  provisionalRefund?: { provided?: boolean; reversed?: boolean }
  refunds?: InquiryRefund[]
  refundBlockReason?: string
  refundFailure?: { code: string; message: string; retryable: boolean; at?: string }
  refundOutcome?: 'UNKNOWN' | 'ACCEPTED' | 'FAILED' | 'COMPLETED'
  referralOptions?: { code: string; label: string }[]
}
export interface CaseDecision {
  id: string; at: string; inFavorOf: 'BUYER' | 'SELLER' | 'BOTH' | 'NONE'
  note?: string; outcomes: { code?: string; label: string; amount?: Money }[]
  review?: { at: string; requester: string; reason: string; reasonCode?: string; note?: string }
}
export interface CaseLegacyAppeal {
  requestedAt?: string; statusCode?: string; statusText?: string; outcomeCode?: string; outcomeText?: string
  closureReasonCode?: string; closureReasonText?: string; refundAmount?: Money
}
export interface CaseFunds {
  refundChargedAmount?: Money; refundAmount?: Money; feeCreditAmount?: Money; internationalRefundAmount?: Money
  transactions?: { at?: string; type?: string; reason?: string; amount?: Money; fundingSource?: string; fundingStatus?: string }[]
}
export interface DisputeLink { shopId: string; kind: DisputeKind | 'RETURN'; id: string }
export interface DisputeEvent { at: string; actor: string; title: string; detail: string }
export interface DisputeOperationLog extends CustomerServiceLog { relatedId?: string; submittedBy?: string }
export interface DisputeRecord {
  /** 明确办结时保存的人员。旧历史若无快照，保留未知。 */
  closedHandlerIds?: string[]
  id: string; shopId: string; shopName: string; kind: DisputeKind
  orderId: string; buyer: string; site: string; title: string; sku: string; quantity: number | null; amount: Money
  createdAt: string; updatedAt: string; syncedAt: string; status: string; statusText: string; sourceVersion: string
  progress: string; nextStep: string; owner: '卖家' | '买家' | '物流' | 'eBay' | '付款机构' | '已结束' | '待核实'
  date: { label: string; value: string; source: string } | null
  reason: string; buyerNote: string; history: DisputeEvent[]; links: DisputeLink[]; revision: number
  operationLogs?: DisputeOperationLog[]
  actions: ActionCode[]; referralReasons: string[]; pending: {
    action: ActionCode; draft: ActionDraft; decisionId?: string; submittedBy?: string; operationId?: string
  } | null
  inquiry?: InquiryDetails
  caseInfo?: {
    type: 'ITEM_NOT_RECEIVED' | 'RETURN'; initiator: string; escalationReason: string
    decision: string; appeal: string; platformAction?: string; appealEligible?: boolean; appealDeadline?: string
    appealEvidence?: 'TEXT' | 'ATTACHMENT'; decisionParty?: 'BUYER' | 'SELLER' | 'BOTH' | 'NONE'
    decisions?: CaseDecision[]; latestDecisionId?: string; referralReasonCode?: string
    caseContentOnHold?: boolean
    legacyAppeal?: CaseLegacyAppeal
    legacyClosure?: { buyerReasonCode?: string; buyerReasonText?: string; sellerReasonCode?: string; sellerReasonText?: string }
    funds?: CaseFunds
  }
  payment?: {
    platformRevision?: number; submittedRevision?: number
    responseCode?: string; availableChoices?: string[]
    reasonCode: string; response: string; responseNote?: string; held: Money | null; convertedHold: Money | null
    protection: string; liability: Money | null; outcome: string; waitEstimate: string
    evidence: PaymentFile[]; returnAddress: string; platformAction?: string; details?: PaymentDetails
  }
}
