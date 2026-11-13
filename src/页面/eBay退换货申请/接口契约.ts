/** Post-Order v2 合同形状；只构造/解析本地资料，不包含网络或授权。 */
import { 读取排序时刻 } from '@/组件/筛选/筛选工具'
import { actionNames, actionOptions, escalationReasons, getReturnBlockedReason, getReturnDetail, isEscalated, isReturnClosed, knownReturnStates, knownReturnStatuses, returnKey, type ReturnRecord } from './模型'
import { recordReturnOperation, startReturnSubmission } from './操作日志'
import { buildRmaGraphqlRequest, usesRmaGraphql, type RmaGraphqlSource } from './RMA授权'
import { getReturnWritePermissionError } from './权限'
import { notifyReturnRefundEvidence } from './售后回执证据'
export type ReturnAction = 'approve' | 'decline' | 'offerReturn' | 'partial' | 'refund' | 'message' | 'escalate' | 'provideRma' | 'receive' | 'label'
export interface ReturnMoney { value: string; currency: string; convertedFromValue?: string; convertedFromCurrency?: string; exchangeRate?: string }
export interface ReturnAddress { name: string; addressLine1: string; addressLine2?: string; city: string; stateOrProvince: string; postalCode: string; country: string }
export interface ReturnAttachment { fileId: string; fileName: string; fileFormat: string; filePurpose: string; fileStatus: string; submitter: string; creationDate: string; secureUrl?: string; fileData?: string; resizedFileData?: string; previewUrl?: string; demo?: boolean }
export interface ReturnScan { at: string; description: string; location: string; eventCode?: string; eventStatus?: string; eventCity?: string; eventPostalCode?: string; eventStateOrProvince?: string }
export interface ReturnShipment { shipmentId: string; carrierEnum: string; carrierName: string; trackingNumber: string; deliveryStatus: string; actualShipDate: string | null; actualDeliveryDate: string | null; markAsReceived: boolean; originAddress: ReturnAddress | null; destinationAddress: ReturnAddress | null; labelFileId?: string; scans: ReturnScan[]; readStatus: 'success' | 'failed' | 'unknown'; carrierUsed?: string; minDeliveryEstimate?: string | null; maxDeliveryEstimate?: string | null; errorCode?: string; shippingMethod?: string; shippedBy?: string; labelDate?: string | null; labelAvailableUntilDate?: string; labelId?: string; labelPrintExpired?: boolean | null; labelVoidExpired?: boolean | null; active?: boolean | null; trackingRead?: ReturnReadResult; trackingStatus?: string; rawTracking?: Record<string, unknown> }
export interface ReturnRefundItem {
  refundFeeType: string; label: string; currency: string; estimated: string; optional: boolean
  min: string | null; max: string | null; minCurrency?: string; maxCurrency?: string
  amountEditable?: boolean | null; overwritableBySeller?: boolean | null
}
export interface ReturnFunding { amount: ReturnMoney | null; at: string | null; fundingStatus: string; fundingSource: { type: string; brand: string; memo: string } | null }
export interface ReturnHistoryAttributes { keepOriginalItem: boolean | null; partialRefundAmount: ReturnMoney | null; refundDeductionType: { amount: ReturnMoney | null; percentage: number | null } | null; rmaNumber: string; sellerReturnAddress: ReturnAddress | null; updatedTrackingNumber: string; moneyMovementRef: string; escalateReason: string; rlspType: string; toEmailAddress: string }
export interface ReturnHistoryEntry { at: string; text: string; author: string; activity?: string; fromState?: string; toState?: string; attributes?: Record<string, unknown>; parsedAttributes?: ReturnHistoryAttributes }
export interface ReturnLabelResponse { labelData: string; labelId: string; labelURL: string; trackingNumber: string }
export interface ReturnRefundInfo { sellerEstimated: ReturnMoney | null; buyerEstimated: ReturnMoney | null; sellerActual: ReturnMoney | null; buyerActual: ReturnMoney | null; outstanding: ReturnMoney | null; status: string | null; issuedAt: string | null; initiator: string | null; items: ReturnRefundItem[]; itemsComplete: boolean; actualItems: Array<{ refundFeeType: string; amount: ReturnMoney }>; partialOfferLimit: ReturnMoney | null; partialOfferLimitVerified: boolean; partialOfferLimitSource: string; provisional: string | null; moneyMovements: Array<{ id: string; type: string; status: string; amount: ReturnMoney | null; requestedAmount?: ReturnMoney | null; actualAmount?: ReturnMoney | null; at: string | null }>; recoup: string | null; actualTotal?: ReturnMoney | null; feeCreditAmount?: ReturnMoney | null; netChargeAmount?: ReturnMoney | null; fundings?: ReturnFunding[]; actualItemsComplete?: boolean; actualTotalMatches?: boolean | null; integrityIssues?: string[] }
export interface ReturnDue { activity: string; at: string | null }
export interface ReturnReadResult { status: 'success' | 'failed' | 'unknown'; succeededAt: string | null; attemptedAt: string | null; error: string }
export interface ReturnDetailData {
  buyerComment: string; currentType: string; itemId: string; transactionId: string; itemPicture: string | null;
  itemTitle?: string | null; itemPrice?: ReturnMoney | null; transactionDate?: string | null; itemOnHold?: boolean | null;
  summaryQuantity?: number | null; fullQuantity?: number | null; quantityConflict?: boolean;
  keepItemInfo?: { value: boolean | null; source: 'state' | 'history' | 'unknown' | 'conflict'; note: string };
  shippingLabelCost?: { totalAmount: ReturnMoney | null; itemizedCosts: Array<{ costType: string; amount: ReturnMoney | null }> } | null;
  labelResponse?: ReturnLabelResponse | null; labelRead?: ReturnReadResult;
  itemMetadata?: { ebayPlusTxn: boolean | null; listingSiteId: number | null; relistStatus: string; relistedItemId: string };
  rawSummary?: Record<string, unknown>; rawFull?: Record<string, unknown>;
  buyerAddress: ReturnAddress | null; orderAddress: ReturnAddress | null; sellerAddress: ReturnAddress | null;
  files: ReturnAttachment[]; shipments: ReturnShipment[]; refund: ReturnRefundInfo;
  sellerDue: ReturnDue | null; buyerDue: ReturnDue | null; timeoutAt: string | null;
  rmaRequired: boolean | null; rmaNumber: string | null; shippingPayer: string | null;
  rmaGraphql?: RmaGraphqlSource;
  availableActions: Array<{ actionType: string; actionURL?: string }>;
  closeInfo: { at: string | null; reason: string; buyerReason: string; buyerComment: string } | null;
  holdInfo: { status: string; reason: string; until: string | null; createdAt?: string | null; referenceId?: string; transactionId?: string } | null; contentOnHold: boolean;
  caseUrl: string | null; caseClosed: boolean; caseDecision: string | null;
  readStatus: { summary: ReturnReadResult; detail: ReturnReadResult; files: ReturnReadResult; tracking: ReturnReadResult };
  identityConflicts?: Partial<Record<'summary' | 'detail', boolean>>
  eligibilityVersion: number; attemptedAt: string | null;
}
export interface ReturnActionDraft {
  text: string; partialAmount: string; keepOriginalItem: boolean; rmaNumber: string; reason: string;
  refundItems: Array<{ refundFeeType: string; currency: string; value: string; selected: boolean }>;
  label: { labelAction: 'UPLOAD_LABEL' | 'MARK_AS_SENT' | 'NO_LABEL'; fileId: string; carrierEnum: string; trackingNumber: string; noLabelReason: string; labelSentDate: string; returnLabelCost: string };
}
export interface ReturnApiRequest { method: 'POST'; path: string; body: Record<string, unknown>; api?: 'return-graphql'; headers?: Record<string, string> }
export interface PreparedReturnAction { action: ReturnAction; request: ReturnApiRequest; draft: ReturnActionDraft; identity: string; sourceSignature: string; integrity: string; preparedAt: string; confirmationId: string }
export interface ReturnRefundEvidence { shopId: string; returnId: string; submissionId: string; status: 'SUCCESS'; observedAt: string; source: 'issue_refund' }
export interface IssueRefundResponseContext { shopId: string; returnId: string; submissionId: string; httpStatus: number; request: ReturnApiRequest }
export interface ReturnRefundResult { status: 'SUCCESS' | 'FAILED' | 'PENDING'; sellerActual: ReturnMoney | null; buyerActual: ReturnMoney | null; actualItems: Array<{ refundFeeType: string; amount: ReturnMoney }>; issuedAt: string | null; initiator: string; state: string; returnStatus: string; closeAt?: string; closeReason?: string; error?: string; actualTotal?: ReturnMoney | null; netChargeAmount?: ReturnMoney | null; feeCreditAmount?: ReturnMoney | null; fundings?: ReturnFunding[] }
export interface ReturnMockScenario { submit?: 'accepted' | 'failed' | 'unknown'; resolve?: 'success' | 'failed' | 'unknown'; readFailure?: 'summary' | 'detail' | 'files' | 'tracking' | 'all'; externalEvent?: 'buyerAccept' | 'buyerDecline' | 'autoApprove' | 'autoRefund' | 'buyerClose' | 'systemClose' | 'caseClose'; externalEventId?: string; externalKeepOriginalItem?: boolean; externalRefundKind?: '全额退款' | '部分退款'; externalRequestId?: string; consumed?: boolean; error?: string; refundResult?: ReturnRefundResult; refundResultConsumed?: boolean; rmaResponse?: unknown; issueRefundResponse?: unknown; issueRefundHttpStatus?: number; saveFailure?: boolean }

const currencyDigits: Record<string, number> = { USD: 2, GBP: 2, EUR: 2, AUD: 2, CAD: 2, CNY: 2, HKD: 2, TWD: 2, NZD: 2, CHF: 2, SGD: 2, PLN: 2, SEK: 2, NOK: 2, DKK: 2, CZK: 2, HUF: 2, ILS: 2, MYR: 2, PHP: 2, MXN: 2, BRL: 2, INR: 2, JPY: 0, KRW: 0 }
export function moneyDigits(currency: string): number | null { return currencyDigits[currency] ?? null }
/** 所有比较与合计以最小货币单位计算；未知币种拒绝猜精度。 */
export function parseMoney(value: string | null | undefined, currency: string): bigint | null {
  if (typeof value !== 'string') return null
  const digits = moneyDigits(currency), clean = value.trim()
  if (digits === null || !/^\d+(?:\.\d+)?$/.test(clean)) return null
  const [whole = '', fraction = ''] = clean.split('.')
  if (fraction.length > digits || whole.length > 13) return null
  return BigInt(whole) * 10n ** BigInt(digits) + BigInt((fraction.padEnd(digits, '0') || '0'))
}
export function formatMinor(value: bigint, currency: string): string {
  const digits = moneyDigits(currency)
  if (digits === null) return ''
  const text = value.toString().padStart(digits + 1, '0')
  return digits ? text.slice(0, -digits) + '.' + text.slice(-digits) : text
}
export function moneyText(value: ReturnMoney | null | undefined): string { return value ? `${value.currency} ${value.value}` : '—' }
export function apiMoney(value: string, currency: string): { value: number; currency: string } | null {
  const minor = parseMoney(value, currency)
  if (minor === null || minor > BigInt(Number.MAX_SAFE_INTEGER)) return null
  const canonical = formatMinor(minor, currency), number = Number(canonical)
  // 只在JSON number边界转换；要求序列化后仍可精确回到同一最小单位。
  if (!Number.isFinite(number) || parseMoney(String(number), currency) !== minor) return null
  return { value: number, currency }
}
export const noLabelReasons = [
  { value: 'ITEM_TOO_LARGE', label: '商品过大，无法使用退货面单' }, { value: 'OTHER', label: '其他原因' },
  { value: 'REIMBURSE', label: '买家自行寄回，卖家报销运费' }, { value: 'RETURN_TO_INTL_LOCATION', label: '跨国退回' },
  { value: 'RETURN_TO_STORE', label: '退回门店' }, { value: 'WORK_WITH_BUYER', label: '与买家协商退回方式' },
]
export const refundFeeNames: Record<string, string> = { PURCHASE_PRICE: '商品价款', ORIGINAL_SHIPPING: '原发货运费', RETURN_SHIPPING: '退回运费', ITEM_TAX: '商品税费', ITEM_IMPORT_TAX: '进口税费', OTHER: '其他费用' }

export function refundRangeText(item: ReturnRefundItem): string {
  const min = item.min == null ? '' : `${item.minCurrency || item.currency} ${item.min}`
  const max = item.max == null ? '' : `${item.maxCurrency || item.currency} ${item.max}`
  if (min && max) return `${min} ～ ${max}`
  if (min) return `下限 ${min}`
  if (max) return `上限 ${max}`
  return '未提供'
}
export function refundAmountFixed(item: ReturnRefundItem): boolean {
  if (item.amountEditable === false || item.overwritableBySeller === false) return true
  return item.min != null && item.min === item.max && (item.minCurrency || item.currency) === (item.maxCurrency || item.currency)
}
export function refundSubmissionBlock(refund: ReturnRefundInfo): string {
  for (const item of refund.items) {
    if (item.min == null || item.max == null) return `${item.label}的可提交金额范围尚未核实，暂不能提交退款`
    const min = parseMoney(item.min, item.currency), max = parseMoney(item.max, item.currency)
    if ((item.minCurrency || item.currency) !== item.currency || (item.maxCurrency || item.currency) !== item.currency || min === null || max === null || min > max) {
      return `${item.label}的金额范围或币种不一致，请核实后再提交`
    }
  }
  return refund.itemsComplete && refund.items.length ? '' : '本次退款费用明细与金额尚未确认'
}
/** ReturnReasonEnum 的现行及废弃历史码；不把本地演示名称当平台枚举。 */
export const returnReasonNames: Record<string, string> = {
  ARRIVED_DAMAGED: '到货破损', ARRIVED_LATE: '到货晚于预计时间', CUSTOMIZED: '商品经过定制', DEFECTIVE_ITEM: '商品无法正常使用',
  DIFFERENT_FROM_LISTING: '商品与刊登展示差异较大', DOES_NOT_FIT: '商品不适配买家车辆', EXPIRED_ITEM: '商品已过期', FAKE_OR_COUNTERFEIT: '疑似假冒商品',
  FOUND_BETTER_PRICE: '找到更优惠价格', IN_STORE_RETURN: '门店退货', MISCATEGORIZED: '商品类目不符合鉴定计划', MISSING_PARTS: '缺少配件',
  NO_LONGER_NEED_ITEM: '不再需要商品', NO_REASON: '未提供具体原因', NOT_AS_DESCRIBED: '商品与描述不符', ORDERED_ACCIDENTALLY: '意外下单',
  ORDERED_DIFFERENT_ITEM: '收到错误商品', ORDERED_WRONG_ITEM: '买错商品', OTHER: '其他原因', RETURNING_GIFT: '退回不需要的礼物',
  WITHDRAW_FROM_PURCHASE_CONTRACT: '撤回购买合同', WRONG_SIZE: '商品尺寸不合适',
  BUYER_CANCEL_ORDER: '买家取消订单（历史原因）', BUYER_NO_SHOW: '买家未到场（历史原因）', BUYER_NOT_SCHEDULED: '买家未预约（历史原因）',
  BUYER_REFUSED_TO_PICKUP: '买家拒绝提货（历史原因）', OUT_OF_STOCK: '缺货（历史原因）', VALET_DELIVERY_ISSUES: '代售配送问题（历史原因）', VALET_UNAVAILABLE: '代售服务不可用（历史原因）',
}
export function returnReasonText(code: string | null | undefined): string { const value = code?.trim() || ''; return value ? returnReasonNames[value] || `原因待核实（${value}）` : '—' }
export const activityNames: Record<string, string> = { SELLER_APPROVE_REQUEST: '回应退货申请', SELLER_DECLINE_REQUEST: '拒绝退货', SELLER_OFFER_RETURNS: '提议退回商品', SELLER_OFFER_PARTIAL_REFUND: '提出部分退款', SELLER_ISSUE_REFUND: '发起退款', SELLER_RETRY_REFUND: '核实并重试退款', SELLER_PROVIDE_RMA: '提供退货授权编号', SELLER_PROVIDE_LABEL: '提供退货面单', SELLER_MARK_AS_RECEIVED: '确认收到退货', SELLER_SEND_MESSAGE: '发送退货留言', SELLER_ESCALATE: '请求 eBay 介入', BUYER_ACCEPTS_PARTIAL_REFUND: '确认部分退款报价', BUYER_DECLINE_PARTIAL_REFUND: '回应部分退款报价', BUYER_MARK_RETURN_SHIPPED: '寄回退货', BUYER_PROVIDE_TRACKING_INFO: '提供退回运单', REMINDER_BUYER_TO_RESPOND_RE_OFFER: '回应部分退款报价', REMINDER_BUYER_TO_SHIP: '寄回退货', REMINDER_FOR_REFUND: '向买家退款', REMINDER_FOR_RMA: '提供退货授权编号', REMINDER_SELLER_TO_RESPOND: '回应退货申请' }
export function safePlatformUrl(value: string | null | undefined): string | null {
  if (!value) return null
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password && /(^|\.)ebay\.(com|co\.uk|com\.au|de|fr|it|es|ca|ie|at|be|nl|ch)$/.test(url.hostname) ? url.href : null } catch { return null }
}
export function emptyReturnDetail(): ReturnDetailData {
  const unread = (): ReturnReadResult => ({ status: 'unknown', attemptedAt: null, succeededAt: null, error: '' })
  return { buyerComment: '', currentType: '', itemId: '', transactionId: '', itemPicture: null, buyerAddress: null, orderAddress: null, sellerAddress: null, files: [], shipments: [], refund: { sellerEstimated: null, buyerEstimated: null, sellerActual: null, buyerActual: null, outstanding: null, status: null, issuedAt: null, initiator: null, items: [], itemsComplete: false, actualItems: [], partialOfferLimit: null, partialOfferLimitVerified: false, partialOfferLimitSource: '', provisional: null, moneyMovements: [], recoup: null }, sellerDue: null, buyerDue: null, timeoutAt: null, rmaRequired: null, rmaNumber: null, shippingPayer: null, availableActions: [], closeInfo: null, holdInfo: null, contentOnHold: false, caseUrl: null, caseClosed: false, caseDecision: null, labelResponse: null, labelRead: unread(), readStatus: { summary: unread(), detail: unread(), files: unread(), tracking: unread() }, eligibilityVersion: 0, attemptedAt: null }
}

type Obj = Record<string, unknown>
const object = (value: unknown): Obj => value && typeof value === 'object' && !Array.isArray(value) ? value as Obj : {}
const string = (value: unknown): string => typeof value === 'string' ? value : ''
const date = (value: unknown): string | null => string(object(value).value) || null
const array = (value: unknown): unknown[] => Array.isArray(value) ? value : []
const nullableBoolean = (value: unknown): boolean | null => typeof value === 'boolean' ? value : null
function readRmaPolicy(value: unknown): boolean | null {
  const policy = object(value)
  const documented = nullableBoolean(policy.rmaRequired)
  const observed = nullableBoolean(policy.rmarequired)
  if ('rmaRequired' in policy && 'rmarequired' in policy) {
    return documented === observed ? documented : null
  }
  return documented ?? observed
}
const nullableNumber = (value: unknown): number | null => typeof value === 'number' && Number.isFinite(value) ? value : null
const quantity = (value: unknown): number | null => typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : null
const scalarText = (value: unknown): string => typeof value === 'number' && Number.isFinite(value) ? String(value) : string(value)
export function readMoney(value: unknown): ReturnMoney | null {
  const item = object(value), currency = string(item.currency), amount = typeof item.value === 'number' && Number.isFinite(item.value) ? String(item.value) : string(item.value)
  const minor = parseMoney(amount, currency)
  if (minor === null) return null
  const result: ReturnMoney = { value: formatMinor(minor, currency), currency }
  // 原币与汇率是来源事实；不自行换汇，也不透传进写请求。
  if (item.convertedFromValue !== undefined) result.convertedFromValue = scalarText(item.convertedFromValue)
  if (item.convertedFromCurrency !== undefined) result.convertedFromCurrency = string(item.convertedFromCurrency)
  if (item.exchangeRate !== undefined) result.exchangeRate = string(item.exchangeRate)
  return result
}
export function parseReturnHistoryAttributes(value: unknown): ReturnHistoryAttributes {
  const source = object(value), deduction = object(source.refundDeductionType)
  return { keepOriginalItem: nullableBoolean(source.keepOriginalItem), partialRefundAmount: readMoney(source.partialRefundAmount),
    refundDeductionType: Object.keys(deduction).length ? { amount: readMoney(deduction.refundDeductionAmount), percentage: nullableNumber(deduction.refundDeductionPercentage) } : null,
    rmaNumber: string(source.RMA), sellerReturnAddress: readReturnAddress(source.sellerReturnAddress), updatedTrackingNumber: string(source.updatedTrackingNumber),
    moneyMovementRef: string(object(source.moneyMovementRef).idref), escalateReason: string(source.escalateReason), rlspType: string(source.rlspType), toEmailAddress: string(source.toEmailAddress) }
}
function readDue(value: unknown): ReturnDue | null { const item = object(value); return item.activityDue ? { activity: string(item.activityDue), at: date(item.respondByDate) } : null }
export function readReturnAddress(value: unknown): ReturnAddress | null {
  const item = object(value), address = object(item.address)
  if (!Object.keys(item).length) return null
  return { name: string(item.name), addressLine1: string(address.addressLine1), addressLine2: string(address.addressLine2), city: string(address.city), stateOrProvince: string(address.stateOrProvince), postalCode: string(address.postalCode), country: string(address.country) }
}
export function readReturnFiles(value: unknown): ReturnAttachment[] {
  return array(value).map(raw => { const item = object(raw); return { fileId: string(item.fileId), fileName: string(item.fileName), fileFormat: string(item.fileFormat), filePurpose: string(item.filePurpose), fileStatus: string(item.fileStatus), submitter: string(item.submitter), creationDate: date(item.creationDate) || '', secureUrl: string(item.secureUrl) || undefined, fileData: string(item.fileData) || undefined, resizedFileData: string(item.resizedFileData) || undefined } }).filter(item => !!item.fileId)
}
export function parseReturnSummary(payload: unknown) {
  const root = object(payload)
  if (!root.summary || !Object.keys(object(root.summary)).length) throw new Error('SUMMARY响应缺少summary，不以FULL替代')
  const summary = object(root.summary), creation = object(summary.creationInfo), item = object(creation.item), escalation = object(summary.escalationInfo), eligibility = object(escalation.sellerEscalationEligibilityInfo)
  return {
    returnId: string(summary.returnId), orderId: string(summary.orderId), buyerId: string(summary.buyerLoginName), state: string(summary.state), status: string(summary.status),
    returnType: string(creation.type), currentType: string(summary.currentType), buyerComment: string(object(creation.comments).content),
    itemId: string(item.itemId), transactionId: string(item.transactionId), quantity: quantity(item.returnQuantity), reason: string(creation.reason), reasonType: string(creation.reasonType),
    createdAt: date(creation.creationDate), sellerDue: readDue(summary.sellerResponseDue), buyerDue: readDue(summary.buyerResponseDue), timeoutAt: date(summary.timeoutDate),
    rmaRequired: readRmaPolicy(summary.returnPolicy),
    availableActions: array(summary.sellerAvailableOptions).map(raw => { const option = object(raw); return { actionType: string(option.actionType), actionURL: safePlatformUrl(string(option.actionURL)) || undefined } }),
    sellerEstimated: readMoney(object(summary.sellerTotalRefund).estimatedRefundAmount), buyerEstimated: readMoney(object(summary.buyerTotalRefund).estimatedRefundAmount),
    sellerActual: readMoney(object(summary.sellerTotalRefund).actualRefundAmount), buyerActual: readMoney(object(summary.buyerTotalRefund).actualRefundAmount),
    caseId: string(escalation.caseId) || null, escalation: { eligible: nullableBoolean(eligibility.eligible), start: date(eligibility.startTime), end: date(eligibility.endTime) }, raw: summary,
  }
}
function readShipment(value: unknown): ReturnShipment {
  const source = object(value), carrier = string(source.carrierUsed) || string(source.carrierEnum)
  return {
    shipmentId: string(source.shipmentId), carrierEnum: string(source.carrierEnum), carrierName: string(source.carrierName) || carrier, carrierUsed: string(source.carrierUsed),
    trackingNumber: string(source.trackingNumber), deliveryStatus: string(source.deliveryStatus), actualShipDate: date(source.actualShipDate), actualDeliveryDate: date(source.actualDeliveryDate),
    markAsReceived: source.markAsReceived === true, originAddress: readReturnAddress(source.originAddress), destinationAddress: readReturnAddress(source.destinationAddress),
    minDeliveryEstimate: date(source.minDeliveryEstimate), maxDeliveryEstimate: date(source.maxDeliveryEstimate), errorCode: string(source.errorCode),
    shippingMethod: string(source.shippingMethod), shippedBy: string(source.shippedBy), labelDate: date(source.labelDate), labelId: string(source.labelId),
    labelAvailableUntilDate: string(source.labelAvailableUntilDate), labelPrintExpired: nullableBoolean(source.labelPrintExpired), labelVoidExpired: nullableBoolean(source.labelVoidExpired), active: nullableBoolean(source.active),
    scans: [], readStatus: 'unknown',
  }
}
export function parseReturnFull(payload: unknown) {
  const root = object(payload)
  if (!root.detail || !Object.keys(object(root.detail)).length) throw new Error('FULL响应缺少detail，不以SUMMARY替代')
  const detail = object(root.detail), refund = object(detail.refundInfo), estimated = object(refund.estimatedRefundDetail), actual = object(refund.actualRefundDetail), actualRefund = object(actual.actualRefund), shipmentInfo = object(detail.returnShipmentInfo), close = object(detail.closeInfo), hold = object(detail.holdInfo), item = object(detail.itemDetail)
  const items: ReturnRefundItem[] = []; let itemsComplete = Array.isArray(estimated.itemizedRefundDetails) && estimated.itemizedRefundDetails.length > 0
  for (const [values, optional] of [[estimated.itemizedRefundDetails, false], [estimated.optionalRefundLineItems, true]] as const) {
    for (const raw of array(values)) {
      const line = object(raw), fee = string(line.refundFeeType), amount = readMoney(line.estimatedAmount)
      if (!fee || !amount) { itemsComplete = false; continue }
      const min = readMoney(line.minAmount), max = readMoney(line.maxAmount)
      // itemsComplete 供退款和当前售后单办理使用。只读列表始终保留已经取得的费用及预计额。
      if (!min || !max || min.currency !== amount.currency || max.currency !== amount.currency) itemsComplete = false
      items.push({ refundFeeType: fee, label: refundFeeNames[fee] || fee, optional, currency: amount.currency, estimated: amount.value,
        min: min?.value ?? null, max: max?.value ?? null, minCurrency: min?.currency, maxCurrency: max?.currency,
        amountEditable: nullableBoolean(line.amountEditable), overwritableBySeller: nullableBoolean(line.overwritableBySeller) })
    }
  }
  const shipmentValues = [...array(shipmentInfo.allShipmentTrackings), ...(shipmentInfo.shipmentTracking ? [shipmentInfo.shipmentTracking] : [])]
  const shipments: ReturnShipment[] = [], seen = new Set<string>()
  for (const raw of shipmentValues) {
    const value = readShipment(raw), key = JSON.stringify([value.shipmentId, value.trackingNumber, value.carrierUsed || value.carrierEnum])
    // 空身份不合并；不能因三项均空就丢失后续来源行。
    if ((value.shipmentId || value.trackingNumber) && seen.has(key)) continue
    seen.add(key); shipments.push(value)
  }
  const actualTotal = readMoney(actualRefund.totalAmount), actualLines = array(actualRefund.itemizedRefundDetail)
  const actualItems: Array<{ refundFeeType: string; amount: ReturnMoney }> = [], integrityIssues: string[] = []
  let actualItemsComplete = Array.isArray(actualRefund.itemizedRefundDetail) && actualLines.length > 0
  const actualFees = new Set<string>()
  for (const raw of actualLines) {
    const line = object(raw), fee = string(line.refundFeeType), amount = readMoney(line.refundAmount)
    if (!fee || !amount || actualFees.has(fee)) { actualItemsComplete = false; continue }
    actualFees.add(fee); actualItems.push({ refundFeeType: fee, amount })
  }
  if (actualLines.length && !actualItemsComplete) integrityIssues.push('实际退款分项存在缺失、无效金额或重复费用类型')
  let actualTotalMatches: boolean | null = null
  if (actualTotal && actualItemsComplete) {
    if (actualItems.some(line => line.amount.currency !== actualTotal.currency)) integrityIssues.push('实际退款总额与分项币种不一致，不能直接核对合计')
    else { const sum = actualItems.reduce((total, line) => total + parseMoney(line.amount.value, line.amount.currency)!, 0n); actualTotalMatches = sum === parseMoney(actualTotal.value, actualTotal.currency); if (!actualTotalMatches) integrityIssues.push('实际退款总额与分项合计不一致') }
  }
  if (Object.keys(actualRefund).length && !actualItemsComplete) integrityIssues.push('实际退款分项尚不完整，请核实来源')
  if (actualRefund.totalAmount !== undefined && !actualTotal) integrityIssues.push('实际退款总额格式或币种待核实')
  const labelCost = object(shipmentInfo.shippingLabelCost)
  const recoupInfo = object(detail.payoutRecoupInfo), amountToRecoup = readMoney(recoupInfo.amountToRecoup)
  const payoutId = typeof recoupInfo.payoutId === 'number' && Number.isFinite(recoupInfo.payoutId) ? String(recoupInfo.payoutId) : string(recoupInfo.payoutId).trim()
  const history: ReturnHistoryEntry[] = array(detail.responseHistory).map(raw => {
    const entry = object(raw), attributes = object(entry.attributes)
    return { at: date(entry.creationDate) || '', text: string(entry.notes), author: string(entry.author), activity: string(entry.activity), fromState: string(entry.fromState), toState: string(entry.toState), attributes,
      ...(Object.keys(attributes).length ? { parsedAttributes: parseReturnHistoryAttributes(attributes) } : {}) }
  })
  const itemOnHold = nullableBoolean(item.itemOnHold), contentOnHold = detail.returnContentOnHold === true
  return {
    marketplaceId: string(detail.marketplaceId), itemId: string(item.itemId), transactionId: string(item.transactionId),
    itemTitle: itemOnHold || contentOnHold ? null : string(item.itemTitle) || null, itemPicture: itemOnHold || contentOnHold ? null : string(item.itemPicUrl) || null,
    itemOnHold, itemPrice: readMoney(item.itemPrice), transactionDate: date(item.transactionDate), quantity: quantity(item.returnQuantity),
    itemMetadata: { ebayPlusTxn: nullableBoolean(item.ebayPlusTxn), listingSiteId: nullableNumber(item.listingSiteId), relistStatus: string(item.relistStatus), relistedItemId: string(item.relistedItemId) },
    buyerAddress: readReturnAddress(detail.buyerAddress), sellerAddress: readReturnAddress(detail.sellerAddress), files: readReturnFiles(detail.files), shipments, shippingPayer: string(shipmentInfo.payee) || null,
    shippingLabelCost: Object.keys(labelCost).length ? { totalAmount: readMoney(labelCost.totalAmount), itemizedCosts: array(labelCost.itemizedReturnShippingCost).map(raw => { const line = object(raw); return { costType: string(line.returnShippingCostType), amount: readMoney(line.amount) } }) } : null,
    rmaNumber: string(detail.RMANumber) || null, contentOnHold,
    closeInfo: Object.keys(close).length ? { at: date(close.returnCloseDate), reason: string(close.returnCloseReason), buyerReason: string(close.buyerCloseReason), buyerComment: string(close.buyerCloseComment) || string(object(close.buyerCloseComment).content) } : null,
    holdInfo: Object.keys(hold).length ? { status: string(hold.holdStatus), reason: '', until: date(hold.holdReleaseDate), createdAt: date(hold.holdCreationDate), referenceId: string(hold.holdReferenceId), transactionId: string(hold.holdTransactionId) } : null,
    refundItems: items, refundItemsComplete: itemsComplete, refundStatus: string(actual.refundStatus) || null, refundIssuedAt: date(actual.refundIssuedDate), refundInitiator: string(actual.refundInitiationType) || null,
    outstanding: readMoney(actual.outstandingAmount), actualItems, actualTotal, feeCreditAmount: readMoney(actualRefund.feeCreditAmount), netChargeAmount: readMoney(actual.netChargeAmount), actualItemsComplete, actualTotalMatches, integrityIssues,
    fundings: array(actual.fundings).map(raw => { const line = object(raw), source = object(line.fundingSource); return { amount: readMoney(line.amount), at: date(line.date), fundingStatus: string(line.fundingStatus), fundingSource: Object.keys(source).length ? { type: string(source.type), brand: string(source.brand), memo: string(source.memo) } : null } }),
    provisional: refund.provisionalRefund ? `退货前临时退款：${object(refund.provisionalRefund).refundProvided === true ? '已发放' : object(refund.provisionalRefund).refundProvided === false ? '未发放' : '待核实'}；撤回：${object(refund.provisionalRefund).refundReversed === true ? '已撤回' : object(refund.provisionalRefund).refundReversed === false ? '未撤回' : '待核实'}` : null,
    provisionalRaw: refund.provisionalRefund, recoup: amountToRecoup ? `待追回金额 ${moneyText(amountToRecoup)}${payoutId ? `；卖家收款批次 ${payoutId}` : ''}` : null, recoupRaw: detail.payoutRecoupInfo,
    moneyMovements: array(detail.moneyMovementInfo).map(raw => { const movement = object(raw), actualAmount = readMoney(movement.actualAmount); return { id: string(movement.externalPaymentId), type: string(movement.moneyMovementType), status: string(movement.status), at: date(movement.creationDate), amount: actualAmount, actualAmount, requestedAmount: readMoney(movement.requestedAmount) } }),
    history, raw: detail,
  }
}
export function createReturnActionDraft(row: ReturnRecord, action: ReturnAction): ReturnActionDraft {
  const detail = getReturnDetail(row)
  return { text: '', partialAmount: '', keepOriginalItem: ['approve', 'offerReturn'].includes(action) ? false : row.keepItem, rmaNumber: detail.rmaNumber || '', reason: '', refundItems: detail.refund.items.map(item => ({ refundFeeType: item.refundFeeType, currency: item.currency, value: item.estimated, selected: !item.optional })), label: { labelAction: 'UPLOAD_LABEL', fileId: '', carrierEnum: '', trackingNumber: '', noLabelReason: '', labelSentDate: '', returnLabelCost: '' } }
}
export function buildReturnRequest(row: ReturnRecord, action: ReturnAction, draft: ReturnActionDraft): { error: string; request?: ReturnApiRequest } {
  if (action === 'provideRma' && usesRmaGraphql(row)) return buildRmaGraphqlRequest(row, draft.rmaNumber)
  const detail = getReturnDetail(row), text = draft.text.trim(), base = `/post-order/v2/return/${encodeURIComponent(row.id)}`
  if (text.length > 2000) return { error: '说明最多 2000 字（本地限制）' }
  if (['message', 'escalate'].includes(action) && !text) return { error: '请填写说明内容' }
  let path = `${base}/decide`, body: Record<string, unknown> = text ? { comments: { content: text } } : {}
  if (action === 'message') { path = `${base}/send_message`; body = { message: { content: text } } }
  else if (action === 'escalate') { if (!escalationReasons.some(item => item.value === draft.reason)) return { error: '请选择适用于卖家的介入原因' }; path = `${base}/escalate`; body.reason = draft.reason }
  else if (action === 'receive') path = `${base}/mark_as_received`
  else if (action === 'refund') {
    path = `${base}/issue_refund`
    const sourceBlock = refundSubmissionBlock(detail.refund)
    if (sourceBlock) return { error: sourceBlock }
    if (draft.refundItems.length !== detail.refund.items.length) return { error: '退款费用明细已变化，请重新核对' }
    const selected: Array<{ refundFeeType: string; refundAmount: { value: number; currency: string } }> = [], seen = new Set<string>(); let total = 0n, currency = ''
    for (const source of detail.refund.items) {
      const matches = draft.refundItems.filter(item => item.refundFeeType === source.refundFeeType)
      if (matches.length !== 1 || seen.has(source.refundFeeType)) return { error: '退款费用类型存在重复或缺失，请核实来源' }
      seen.add(source.refundFeeType); const item = matches[0]!
      if (!item.selected) { if (!source.optional) return { error: '必需退款费用项不能取消' }; continue }
      if (item.currency !== source.currency || (currency && currency !== item.currency)) return { error: '退款分项币种不一致，请核实' }
      currency = item.currency
      const minor = parseMoney(item.value, currency), min = parseMoney(source.min, currency), max = parseMoney(source.max, currency), amount = apiMoney(item.value, currency)
      if (minor === null || min === null || max === null || !amount || min > max || minor < min || minor > max) return { error: `${source.label}金额不符合来源上下限或币种精度` }
      if (refundAmountFixed(source) && minor !== parseMoney(source.estimated, currency)) return { error: `${source.label}为固定金额，请使用来源金额` }
      total += minor; selected.push({ refundFeeType: source.refundFeeType, refundAmount: amount })
    }
    const amount = apiMoney(formatMinor(total, currency), currency)
    if (!amount || total <= 0n) return { error: '退款合计须大于 0 且金额可精确表示' }
    body.refundDetail = { itemizedRefundDetail: selected, totalAmount: amount }
  } else if (action === 'label') {
    path = `${base}/add_shipping_label`; const label = draft.label
    if (!['UPLOAD_LABEL', 'MARK_AS_SENT', 'NO_LABEL'].includes(label.labelAction)) return { error: '当前不支持该面单办理方式' }
    body.labelAction = label.labelAction
    if (label.labelAction === 'UPLOAD_LABEL') {
      const matches = detail.files.filter(file => file.fileId === label.fileId && file.submitter === 'SELLER' && file.filePurpose === 'LABEL_RELATED' && ['CREATED', 'PUBLISHED'].includes(file.fileStatus))
      if (matches.length !== 1) return { error: '请先上传并取得当前申请的有效面单文件回执' }
      body.fileId = label.fileId
    }
    if (label.labelAction === 'NO_LABEL') { if (!noLabelReasons.some(item => item.value === label.noLabelReason)) return { error: '请选择不提供面单的原因' }; body.noLabelReason = label.noLabelReason }
    if (label.labelAction === 'MARK_AS_SENT') {
      const sentAt = 读取排序时刻(label.labelSentDate)
      if (sentAt === undefined) return { error: '请填写已提供面单的实际时间' }
      body.forwardShippingLabelProvided = true; body.labelSentDate = { value: new Date(sentAt).toISOString() }
    }
    if (label.labelAction !== 'NO_LABEL' && label.trackingNumber.trim()) { if (!label.carrierEnum.trim()) return { error: '退回跟踪号须同时填写平台承运商代码' }; body.trackingNumber = label.trackingNumber.trim(); body.carrierEnum = label.carrierEnum.trim() }
    if (label.returnLabelCost.trim()) { const amount = apiMoney(label.returnLabelCost, row.currency); if (!amount) return { error: '面单费用或币种精度不正确' }; body.returnLabelCost = amount }
  } else {
    const decisions: Partial<Record<ReturnAction, string>> = { approve: 'APPROVE', decline: 'DECLINE', offerReturn: 'OFFER_RETURN', partial: 'OFFER_PARTIAL_REFUND', provideRma: 'PROVIDE_RMA' }
    body.decision = decisions[action]
    if (!body.decision) return { error: '不存在已核实的平台操作' }
    if (action === 'partial') {
      const limit = detail.refund.partialOfferLimit
      if (!limit || !detail.refund.partialOfferLimitVerified) return { error: '部分退款报价额度尚未核实' }
      const amount = apiMoney(draft.partialAmount, limit.currency), minor = parseMoney(draft.partialAmount, limit.currency), max = parseMoney(limit.value, limit.currency)
      if (!amount || minor === null || max === null || minor <= 0n || minor >= max) return { error: '部分退款须大于 0、小于已核实报价额度，并符合币种精度' }
      body.partialRefundAmount = amount
    }
    if (['approve', 'offerReturn'].includes(action)) body.keepOriginalItem = draft.keepOriginalItem
    if (action === 'provideRma' || (action === 'approve' && !draft.keepOriginalItem && draft.rmaNumber.trim())) { if (!draft.rmaNumber.trim()) return { error: '请填写退货授权编号' }; if (Array.from(draft.rmaNumber.trim()).length > 100) return { error: '退货授权编号最多 100 个字符' }; body.RMANumber = draft.rmaNumber.trim(); body.rMAProvided = true }
  }
  return { error: '', request: { method: 'POST', path, body } }
}
function sourceSignature(row: ReturnRecord): string {
  const detail = getReturnDetail(row)
  return JSON.stringify([row.shopId, row.id, row.buyerId, row.orderNo, row.marketplaceId, row.currency, row.state, row.status, row.options, row.returnType, detail.currentType, row.quantity, detail.summaryQuantity, detail.fullQuantity, detail.quantityConflict, row.eligibilityKnown, row.escalation, row.keepItem, row.received, detail.keepItemInfo, detail.eligibilityVersion, detail.readStatus.summary.status, detail.readStatus.detail.status, detail.refund, detail.rmaRequired, detail.rmaNumber, detail.rmaGraphql, detail.files.map(item => [item.fileId, item.fileStatus, item.filePurpose, item.submitter])])
}
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T
const preparedIntegrity = (prepared: PreparedReturnAction) => JSON.stringify([prepared.confirmationId, prepared.action, prepared.request, prepared.draft, prepared.identity, prepared.sourceSignature, prepared.preparedAt])
function findPreparedSubmission(row: ReturnRecord, prepared: PreparedReturnAction) {
  return row.submissionAttempts?.find(attempt => attempt.confirmationId === prepared.confirmationId)
}
export function prepareReturnAction(row: ReturnRecord, action: ReturnAction, draft: ReturnActionDraft, now = new Date().toISOString()): { error: string; prepared?: PreparedReturnAction } {
  const error = getReturnBlockedReason(row, action, now); if (error) return { error }
  // provideRmaNumber 没有 comments；隐藏的旧说明不进入请求、确认或日志。
  if (action === 'provideRma' && usesRmaGraphql(row)) draft = { ...draft, text: '' }
  const built = buildReturnRequest(row, action, draft); if (!built.request) return { error: built.error }
  const prepared: PreparedReturnAction = { action, request: clone(built.request), draft: clone(draft), identity: JSON.stringify([returnKey(row), row.buyerId, row.orderNo]), sourceSignature: sourceSignature(row), integrity: '', preparedAt: now, confirmationId: crypto.randomUUID() }
  prepared.integrity = preparedIntegrity(prepared)
  return { error: '', prepared }
}
export function validatePreparedReturnAction(row: ReturnRecord, prepared: PreparedReturnAction, now = new Date().toISOString()): string {
  const permissionError = getReturnWritePermissionError(row)
  if (permissionError) return permissionError
  if (!prepared.confirmationId || prepared.integrity !== preparedIntegrity(prepared)) return '确认内容已变化，请重新确认'
  if (prepared.identity !== JSON.stringify([returnKey(row), row.buyerId, row.orderNo])) return '申请身份已变化，请刷新后重新确认'
  const existing = findPreparedSubmission(row, prepared)
  if (existing) return existing.confirmationIntegrity === prepared.integrity ? '' : '此确认已用于其他提交内容，请重新确认'
  if (prepared.identity !== JSON.stringify([returnKey(row), row.buyerId, row.orderNo]) || prepared.sourceSignature !== sourceSignature(row)) return '申请资格或金额资料已变化，请刷新后重新确认'
  const error = getReturnBlockedReason(row, prepared.action, now); if (error) return error
  const built = buildReturnRequest(row, prepared.action, prepared.draft)
  if (!built.request || JSON.stringify(built.request) !== JSON.stringify(prepared.request)) return built.error || '请求内容已变化，请重新确认'
  if (row.mock?.saveFailure) return '本次执行记录保存失败，未发送，请重试'
  return ''
}
export function submitPreparedReturnAction(row: ReturnRecord, prepared: PreparedReturnAction, now = new Date().toISOString()): string {
  const error = validatePreparedReturnAction(row, prepared, now)
  if (error) return error
  if (findPreparedSubmission(row, prepared)) return ''
  // 关联仅属于本次提交。无售后单的免寄回决定不能接收上一笔退货的回执。
  row.afterSaleSubmission = undefined
  row.pendingAction = prepared.action; row.pendingText = prepared.draft.text.trim(); row.pendingAmount = prepared.action === 'partial' ? Number(prepared.draft.partialAmount) : null; row.pendingRequest = clone(prepared.request); row.pendingDraft = clone(prepared.draft); row.submissionError = ''
  row.outcome = row.mock?.submit === 'failed' ? 'failed' : row.mock?.submit === 'unknown' ? 'unknown' : 'pending'
  if (row.outcome === 'failed') { row.submissionError = row.mock?.error || '平台明确拒绝：当前申请资格发生变化，请刷新后核对'; row.pendingAction = null; if (row.mock) row.mock.submit = 'accepted' }
  startReturnSubmission(row, actionNames[prepared.action])
  Object.assign(row.lastSubmission!, { confirmationId: prepared.confirmationId, confirmationIntegrity: prepared.integrity, identity: prepared.identity, requestSnapshot: clone(prepared.request), submittedAt: now, outcome: row.outcome, resultError: row.submissionError || (row.outcome === 'unknown' ? '平台尚未确认本次提交结果，请保留原请求继续核查' : '') })
  ;(row.submissionAttempts ??= []).push(row.lastSubmission!)
  recordReturnOperation(row, '提交' + actionNames[prepared.action], `本次请求快照已保存${prepared.request.api === 'return-graphql' ? prepared.draft.rmaNumber.trim() ? '；提供退货授权编号' : '；本次免除退货授权编号要求' : ''}${prepared.draft.text.trim() ? `；含${prepared.action === 'message' ? '退货留言' : '对外处理说明'}（${prepared.draft.text.trim().length}字）` : ''}`, row.outcome === 'failed' ? '明确失败' : row.outcome === 'unknown' ? '结果待核查，禁止重提' : '已提交，待回查', now, row.lastSubmission!.operator, true)
  if (prepared.action === 'refund' && row.mock?.issueRefundResponse !== undefined) {
    applyIssueRefundResponse(row, row.mock.issueRefundResponse, { shopId: row.shopId, returnId: row.id, submissionId: row.lastSubmission!.id, httpStatus: row.mock.issueRefundHttpStatus ?? 200, request: prepared.request }, now)
  }
  return ''
}

/** issue_refund 的响应只有 refundStatus；身份及尝试由受控请求上下文绑定，不从金额或旧详情推断。 */
export function applyIssueRefundResponse(row: ReturnRecord, payload: unknown, context: IssueRefundResponseContext, now = new Date().toISOString()): { outcome: 'confirmed' | 'pending' | 'unknown'; error: string } {
  const attempt = row.submissionAttempts?.find(item => item.id === context.submissionId)
  const expectedPath = `/post-order/v2/return/${encodeURIComponent(row.id)}/issue_refund`
  const request = attempt?.requestSnapshot
  if (!context.shopId || context.shopId !== row.shopId || context.returnId !== row.id || !attempt || attempt.identity !== JSON.stringify([returnKey(row), row.buyerId, row.orderNo]) || !request || request.method !== 'POST' || request.path !== expectedPath || request.api || JSON.stringify(request) !== JSON.stringify(context.request)) {
    return { outcome: 'unknown', error: '退款回执与当前申请或执行尝试不一致，请核查原请求' }
  }
  const previous = row.refundEvidence?.find(item => item.shopId === row.shopId && item.returnId === row.id && item.submissionId === attempt.id && item.status === 'SUCCESS')
  const response = object(payload), errors = response.errors
  const hasErrors = errors !== undefined && (!Array.isArray(errors) || errors.length > 0)
  const success = context.httpStatus >= 200 && context.httpStatus < 300 && !hasErrors && response.refundStatus === 'SUCCESS'
  if (success && !previous) {
    ;(row.refundEvidence ??= []).push({ shopId: row.shopId, returnId: row.id, submissionId: attempt.id, status: 'SUCCESS', observedAt: now, source: 'issue_refund' })
    recordReturnOperation({ ...row, lastSubmission: attempt }, '读取退款回执', '已确认本次退款资金成功；实际金额继续按独立来源核实', '退款成功，实际金额待核实', now, '系统', true, true)
  }
  const confirmed = success || !!previous
  const pending = !confirmed && context.httpStatus >= 200 && context.httpStatus < 300 && !hasErrors && ['PENDING', 'REQUESTED'].includes(String(response.refundStatus))
  const outcome = confirmed ? 'confirmed' : pending ? 'pending' : 'unknown'
  const error = confirmed ? '' : pending ? '' : '退款结果待核查，请保留原请求，勿重复退款'
  attempt.outcome = outcome
  attempt.resultError = error
  // 迟到回执可补原尝试；不能改变另一笔正在办理的表单和提交状态。
  if (row.lastSubmission?.id === attempt.id) {
    row.outcome = outcome; row.submissionError = error
    if (confirmed) row.pendingAction = null
  }
  if (confirmed) notifyReturnRefundEvidence(row)
  return { outcome, error }
}
export function uploadReturnAttachment(row: ReturnRecord, input: { fileName: string; filePurpose: 'ITEM_RELATED' | 'LABEL_RELATED' | 'REFUND_RELATED'; data: string; fileFormat: string }, now = new Date().toISOString()): { error: string; file?: ReturnAttachment; request?: ReturnApiRequest } {
  const permissionError = getReturnWritePermissionError(row)
  if (permissionError) return { error: permissionError }
  if (row.outcome === 'pending' || row.outcome === 'unknown') return { error: '上次处理尚未确认，请先核查' }
  if (!row.shopId || !row.id || isReturnClosed(row) || isEscalated(row)) return { error: '当前申请不允许在本地继续上传' }
  const format = input.fileFormat.toUpperCase(), allowed = input.filePurpose === 'LABEL_RELATED' ? ['PNG', 'JPEG', 'JPG', 'GIF', 'BMP', 'PDF'] : ['PNG', 'JPEG', 'JPG', 'GIF', 'BMP']
  if (!input.fileName.trim() || !allowed.includes(format)) return { error: '文件格式不符合该用途，面单可使用PDF或图片，其他材料使用图片' }
  const data = input.data.replace(/^data:[^;,]+;base64,/, '')
  if (!data || !/^[A-Za-z0-9+/]+={0,2}$/.test(data) || data.length % 4 !== 0) return { error: '文件内容不是有效Base64资料' }
  if (!['ITEM_RELATED', 'LABEL_RELATED', 'REFUND_RELATED'].includes(input.filePurpose)) return { error: '文件用途未核实' }
  const signatures: Record<string, RegExp> = { PNG: /^iVBORw0KGgo/, JPEG: /^\/9j\//, JPG: /^\/9j\//, GIF: /^R0lGOD/, BMP: /^Qk/, PDF: /^JVBERi0/ }
  if (!signatures[format]?.test(data)) return { error: '文件内容与声明格式不一致，请重新选择' }
  const detail = getReturnDetail(row), fileId = `DEMO-FILE-${row.id}-${detail.files.length + 1}`
  const file: ReturnAttachment = { fileId, fileName: input.fileName.trim(), fileFormat: format, filePurpose: input.filePurpose, fileStatus: 'CREATED', submitter: 'SELLER', creationDate: now, fileData: data, previewUrl: format === 'PDF' ? undefined : `data:image/${format === 'JPG' ? 'jpeg' : format.toLowerCase()};base64,${data}`, demo: true }
  detail.files.push(file)
  recordReturnOperation(row, '上传申请附件', `用途：${file.filePurpose}；格式：${format}；已取得文件回执，尚未关联发布；不代表留言已发送`, '文件已上传', now)
  return { error: '', file, request: { method: 'POST', path: `/post-order/v2/return/${encodeURIComponent(row.id)}/file/upload`, body: { data, fileName: file.fileName, filePurpose: file.filePurpose } } }
}
function rejectSource(row: ReturnRecord, group: 'summary' | 'detail', error: string, now: string): never {
  row.eligibilityKnown = false
  const detail = getReturnDetail(row)
  ;(detail.identityConflicts ??= {})[group] = true
  const read = detail.readStatus[group]; read.status = 'failed'; read.error = error; read.attemptedAt = now
  throw new Error(error)
}
function verifyItemIdentity(row: ReturnRecord, source: { itemId: string; transactionId: string }, group: 'summary' | 'detail', now: string): void {
  const detail = getReturnDetail(row)
  if ((detail.itemId && source.itemId && detail.itemId !== source.itemId) || (detail.transactionId && source.transactionId && detail.transactionId !== source.transactionId)) rejectSource(row, group, 'SUMMARY与FULL商品交易身份冲突，拒绝合并并暂停处理', now)
}
/** 数量保留两组来源；缺失和冲突均不沿用旧展示数。 */
function reconcileReturnQuantity(row: ReturnRecord): void {
  const detail = getReturnDetail(row), summary = detail.summaryQuantity, full = detail.fullQuantity
  detail.quantityConflict = typeof summary === 'number' && typeof full === 'number' && summary !== full
  row.quantity = detail.quantityConflict ? null : summary ?? full ?? null
}
/** 只读事实投影，不从历史授予任何当前操作资格。 */
export function updateReturnKeepItemInfo(row: ReturnRecord): void {
  const detail = getReturnDetail(row), returningStates = new Set(['ITEM_READY_TO_SHIP', 'ITEM_SHIPPED', 'ITEM_DELIVERED', 'RETURN_LABEL_PENDING', 'RETURN_LABEL_REQUESTED', 'RMA_PENDING'])
  const evidence = row.history
    .filter(entry => ['SELLER_APPROVE_REQUEST', 'SELLER_OFFER_RETURNS'].includes(entry.activity || '') && entry.author === 'SELLER' && typeof entry.parsedAttributes?.keepOriginalItem === 'boolean' && !!entry.toState)
    .map(entry => ({ entry, instant: 读取排序时刻(entry.at) }))
    .filter((value): value is { entry: ReturnHistoryEntry; instant: number } => value.instant !== undefined)
  const latestAt = evidence.length ? Math.max(...evidence.map(value => value.instant)) : null
  const latest = evidence.filter(value => value.instant === latestAt).map(value => value.entry)
  const values = new Set(latest.map(entry => entry.parsedAttributes!.keepOriginalItem))
  const historical = values.size === 1 ? latest[0]!.parsedAttributes!.keepOriginalItem : null
  const conflict = values.size > 1 || (row.state === 'ITEM_KEPT' && historical === false) || (returningStates.has(row.state) && historical === true)
  if (conflict) detail.keepItemInfo = { value: null, source: 'conflict', note: '当前平台阶段与适用商品安排证据存在冲突，请核实' }
  else if (row.state === 'ITEM_KEPT') detail.keepItemInfo = { value: true, source: 'state', note: '平台当前阶段明确为买家保留商品' }
  else if (historical !== null && latest.every(entry => entry.parsedAttributes!.keepOriginalItem ? entry.toState === 'ITEM_KEPT' : returningStates.has(entry.toState || ''))) detail.keepItemInfo = { value: historical, source: 'history', note: '来源于最新适用卖家退货决定的商品安排，不表示退款完成' }
  else detail.keepItemInfo = { value: null, source: 'unknown', note: '当前商品安排尚未取得可靠来源' }
  row.keepItem = detail.keepItemInfo.value === true
}
export function applyReturnSummary(row: ReturnRecord, payload: unknown, now = new Date().toISOString()): void {
  if (row.detail?.rmaGraphql) row.detail.rmaGraphql.readStatus = 'unknown'
  const source = parseReturnSummary(payload)
  if (!source.returnId || source.returnId !== row.id || (row.orderNo && source.orderId && row.orderNo !== source.orderId)) rejectSource(row, 'summary', 'Return或关联订单身份不一致，拒绝合并', now)
  verifyItemIdentity(row, source, 'summary', now)
  const detail = getReturnDetail(row)
  row.orderNo = source.orderId; row.buyerId = source.buyerId; row.state = source.state; row.status = source.status; row.returnType = source.returnType
  row.options = source.availableActions.map(item => item.actionType); row.caseId = source.caseId; row.escalation = source.escalation; row.reasonCode = source.reason; row.reasonType = source.reasonType; row.reason = returnReasonText(source.reason)
  if (source.createdAt) row.createdAt = source.createdAt
  Object.assign(detail, { currentType: source.currentType, buyerComment: source.buyerComment, itemId: source.itemId || detail.itemId, transactionId: source.transactionId || detail.transactionId, sellerDue: source.sellerDue, buyerDue: source.buyerDue, timeoutAt: source.timeoutAt, rmaRequired: source.rmaRequired, availableActions: source.availableActions, summaryQuantity: source.quantity, rawSummary: structuredClone(source.raw) })
  reconcileReturnQuantity(row); updateReturnKeepItemInfo(row)
  Object.assign(detail.refund, { sellerEstimated: source.sellerEstimated, buyerEstimated: source.buyerEstimated, sellerActual: source.sellerActual, buyerActual: source.buyerActual })
  row.estimatedRefund = source.sellerEstimated ? Number(source.sellerEstimated.value) : null; row.actualRefund = source.sellerActual ? Number(source.sellerActual.value) : null
  row.deadline = source.sellerDue?.at || null; row.eligibilityKnown = knownReturnStates.has(row.state) && knownReturnStatuses.has(row.status); detail.eligibilityVersion++
  detail.readStatus.summary = { status: 'success', succeededAt: now, attemptedAt: now, error: '' }
  if (source.itemId && source.transactionId) delete detail.identityConflicts?.summary
}
export function applyReturnFull(row: ReturnRecord, payload: unknown, now = new Date().toISOString(), requestContext?: { shopId: string; returnId: string }): void {
  if (row.detail?.rmaGraphql) row.detail.rmaGraphql.readStatus = 'unknown'
  if (requestContext && (requestContext.shopId !== row.shopId || requestContext.returnId !== row.id)) rejectSource(row, 'detail', 'FULL请求上下文与当前申请身份不一致，拒绝合并', now)
  const source = parseReturnFull(payload), detail = getReturnDetail(row)
  verifyItemIdentity(row, source, 'detail', now)
  for (const shipment of source.shipments) {
    const previous = detail.shipments.filter(existing => existing.shipmentId === shipment.shipmentId && existing.trackingNumber === shipment.trackingNumber && (existing.carrierUsed || existing.carrierEnum) === (shipment.carrierUsed || shipment.carrierEnum))
    if (previous.length === 1 && shipment.trackingNumber && (shipment.carrierUsed || shipment.carrierEnum)) {
      const prior = previous[0]!
      shipment.scans = prior.scans; shipment.readStatus = prior.readStatus; shipment.trackingRead = prior.trackingRead; shipment.trackingStatus = prior.trackingStatus; shipment.rawTracking = prior.rawTracking
      if (prior.labelFileId) shipment.labelFileId = prior.labelFileId
    }
  }
  Object.assign(detail, { itemId: source.itemId || detail.itemId, transactionId: source.transactionId || detail.transactionId, itemTitle: source.itemTitle, itemPicture: source.itemPicture, itemPrice: source.itemPrice, transactionDate: source.transactionDate, itemOnHold: source.itemOnHold, itemMetadata: source.itemMetadata,
    buyerAddress: source.buyerAddress, sellerAddress: source.sellerAddress, files: source.files, shipments: source.shipments, shippingPayer: source.shippingPayer, shippingLabelCost: source.shippingLabelCost,
    rmaNumber: source.rmaNumber, contentOnHold: source.contentOnHold, closeInfo: source.closeInfo, holdInfo: source.holdInfo, fullQuantity: source.quantity, rawFull: structuredClone(source.raw) })
  // 受限或缺失标题不得从旧申请缓存恢复。独立OMS订单不在此函数的写入范围。
  row.title = source.itemTitle || ''
  Object.assign(detail.refund, { items: source.refundItems, itemsComplete: source.refundItemsComplete, status: source.refundStatus, issuedAt: source.refundIssuedAt, initiator: source.refundInitiator, outstanding: source.outstanding, actualItems: source.actualItems,
    actualTotal: source.actualTotal, feeCreditAmount: source.feeCreditAmount, netChargeAmount: source.netChargeAmount, fundings: source.fundings, actualItemsComplete: source.actualItemsComplete, actualTotalMatches: source.actualTotalMatches, integrityIssues: source.integrityIssues,
    provisional: source.provisional, recoup: source.recoup, moneyMovements: source.moneyMovements })
  if (source.marketplaceId) row.marketplaceId = source.marketplaceId
  row.history = source.history; reconcileReturnQuantity(row); updateReturnKeepItemInfo(row)
  detail.readStatus.detail = { status: 'success', succeededAt: now, attemptedAt: now, error: '' }
  if (source.itemId && source.transactionId) delete detail.identityConflicts?.detail
}

export interface ReturnTrackingContext { shopId: string; returnId: string; carrierUsed: string; trackingNumber: string; shipmentId?: string }
export function parseReturnTracking(payload: unknown) {
  const source = object(payload)
  if (!Object.keys(source).length || (Array.isArray(source.errors) ? source.errors.length > 0 : !!source.errors)) throw new Error('退回轨迹响应为空或包含来源错误')
  if (source.scanHistory !== undefined && !Array.isArray(source.scanHistory)) throw new Error('退回轨迹scanHistory格式无效')
  return { carrierUsed: string(source.carrierUsed), trackingNumber: string(source.trackingNumber), trackingStatus: string(source.trackingStatus),
    scans: array(source.scanHistory).map(raw => { const entry = object(raw), eventCity = string(entry.eventCity), eventPostalCode = string(entry.eventPostalCode), eventStateOrProvince = string(entry.eventStateOrProvince)
      return { at: date(entry.eventTime) || '', description: string(entry.eventDesc), location: [eventCity, eventStateOrProvince, eventPostalCode].filter(Boolean).join(', '), eventCode: string(entry.eventCode), eventStatus: string(entry.eventStatus), eventCity, eventPostalCode, eventStateOrProvince } }), raw: source }
}
/** 响应必须同时匹配原查询上下文及唯一退回运单，不能把第一条或原发运单当作目标。 */
export function applyReturnTracking(row: ReturnRecord, payload: unknown, context: ReturnTrackingContext, now = new Date().toISOString()): void {
  const detail = getReturnDetail(row)
  if (context.shopId !== row.shopId || context.returnId !== row.id || !context.carrierUsed || !context.trackingNumber) throw new Error('退回轨迹请求上下文与当前申请不一致或身份缺失')
  const matches = detail.shipments.filter(shipment => shipment.trackingNumber === context.trackingNumber && (shipment.carrierUsed || shipment.carrierEnum) === context.carrierUsed && (!context.shipmentId || shipment.shipmentId === context.shipmentId))
  if (matches.length !== 1) throw new Error('退回轨迹无法唯一匹配来源运单')
  const shipment = matches[0]!
  try {
    const source = parseReturnTracking(payload)
    if (source.carrierUsed !== context.carrierUsed || source.trackingNumber !== context.trackingNumber) throw new Error('退回轨迹响应承运商或跟踪号与请求身份不一致')
    shipment.scans = source.scans; shipment.trackingStatus = source.trackingStatus; shipment.rawTracking = structuredClone(source.raw); shipment.readStatus = 'success'
    shipment.trackingRead = { status: 'success', attemptedAt: now, succeededAt: now, error: '' }
  } catch (error) {
    shipment.readStatus = 'failed'; shipment.trackingRead = { status: 'failed', attemptedAt: now, succeededAt: shipment.trackingRead?.succeededAt || null, error: error instanceof Error ? error.message : '退回轨迹读取失败' }
    detail.readStatus.tracking = { status: 'failed', attemptedAt: now, succeededAt: detail.readStatus.tracking.succeededAt, error: shipment.trackingRead.error }
    throw error
  }
  const complete = detail.shipments.every(value => value.readStatus === 'success'), failed = detail.shipments.some(value => value.readStatus === 'failed')
  detail.readStatus.tracking = { status: complete ? 'success' : failed ? 'failed' : 'unknown', attemptedAt: now, succeededAt: complete ? now : detail.readStatus.tracking.succeededAt, error: complete ? '' : '仍有退回运单轨迹未完整读取' }
}
export function parseReturnLabelResponse(payload: unknown): ReturnLabelResponse {
  const source = object(payload)
  if (!Object.keys(source).length || (Array.isArray(source.errors) ? source.errors.length > 0 : !!source.errors)) throw new Error('面单响应为空或包含来源错误，请核实结果')
  return { labelData: string(source.labelData), labelId: string(source.labelId), labelURL: string(source.labelURL), trackingNumber: string(source.trackingNumber) }
}
/** 只保存读取事实，不因收到面单资料新增运单、发布附件或提前推进Return状态。 */
export function applyReturnLabelResponse(row: ReturnRecord, payload: unknown, context: { shopId: string; returnId: string }, now = new Date().toISOString()): void {
  if (context.shopId !== row.shopId || context.returnId !== row.id) throw new Error('面单响应上下文与当前申请不一致')
  const detail = getReturnDetail(row)
  try { detail.labelResponse = parseReturnLabelResponse(payload); detail.labelRead = { status: 'success', attemptedAt: now, succeededAt: now, error: '' } }
  catch (error) { detail.labelRead = { status: 'failed', attemptedAt: now, succeededAt: detail.labelRead?.succeededAt || null, error: error instanceof Error ? error.message : '面单响应读取失败' }; throw error }
}
