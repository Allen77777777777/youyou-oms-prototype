/** Post-Order v2 合同形状；只构造/解析本地资料，不包含网络或授权。 */
import { actionNames, actionOptions, escalationReasons, getReturnBlockedReason, getReturnDetail, isEscalated, isReturnClosed, knownReturnStates, knownReturnStatuses, returnKey, type ReturnRecord } from './模型'
export type ReturnAction = 'approve' | 'decline' | 'offerReturn' | 'partial' | 'refund' | 'message' | 'escalate' | 'provideRma' | 'receive' | 'label'
export interface ReturnMoney { value: string; currency: string }
export interface ReturnAddress { name: string; addressLine1: string; addressLine2?: string; city: string; stateOrProvince: string; postalCode: string; country: string }
export interface ReturnAttachment { fileId: string; fileName: string; fileFormat: string; filePurpose: string; fileStatus: string; submitter: string; creationDate: string; secureUrl?: string; fileData?: string; resizedFileData?: string; previewUrl?: string; demo?: boolean }
export interface ReturnShipment { shipmentId: string; carrierEnum: string; carrierName: string; trackingNumber: string; deliveryStatus: string; actualShipDate: string | null; actualDeliveryDate: string | null; markAsReceived: boolean; originAddress: ReturnAddress | null; destinationAddress: ReturnAddress | null; labelFileId?: string; scans: Array<{ at: string; description: string; location: string }>; readStatus: 'success' | 'failed' | 'unknown' }
export interface ReturnRefundItem { refundFeeType: string; label: string; currency: string; estimated: string; min: string; max: string; optional: boolean }
export interface ReturnRefundInfo { sellerEstimated: ReturnMoney | null; buyerEstimated: ReturnMoney | null; sellerActual: ReturnMoney | null; buyerActual: ReturnMoney | null; outstanding: ReturnMoney | null; status: string | null; issuedAt: string | null; initiator: string | null; items: ReturnRefundItem[]; itemsComplete: boolean; actualItems: Array<{ refundFeeType: string; amount: ReturnMoney }>; partialOfferLimit: ReturnMoney | null; partialOfferLimitVerified: boolean; partialOfferLimitSource: string; provisional: string | null; moneyMovements: Array<{ id: string; type: string; status: string; amount: ReturnMoney | null; requestedAmount?: ReturnMoney | null; actualAmount?: ReturnMoney | null; at: string | null }>; recoup: string | null }
export interface ReturnDue { activity: string; at: string | null }
export interface ReturnReadResult { status: 'success' | 'failed' | 'unknown'; succeededAt: string | null; attemptedAt: string | null; error: string }
export interface ReturnDetailData {
  buyerComment: string; currentType: string; itemId: string; transactionId: string; itemPicture: string | null;
  buyerAddress: ReturnAddress | null; orderAddress: ReturnAddress | null; sellerAddress: ReturnAddress | null;
  files: ReturnAttachment[]; shipments: ReturnShipment[]; refund: ReturnRefundInfo;
  sellerDue: ReturnDue | null; buyerDue: ReturnDue | null; timeoutAt: string | null;
  rmaRequired: boolean | null; rmaNumber: string | null; shippingPayer: string | null;
  availableActions: Array<{ actionType: string; actionURL?: string }>;
  closeInfo: { at: string | null; reason: string; buyerReason: string; buyerComment: string } | null;
  holdInfo: { status: string; reason: string; until: string | null } | null; contentOnHold: boolean;
  caseUrl: string | null; caseClosed: boolean; caseDecision: string | null;
  readStatus: { summary: ReturnReadResult; detail: ReturnReadResult; files: ReturnReadResult; tracking: ReturnReadResult };
  eligibilityVersion: number; attemptedAt: string | null;
}
export interface ReturnActionDraft {
  text: string; partialAmount: string; keepOriginalItem: boolean; rmaNumber: string; reason: string;
  refundItems: Array<{ refundFeeType: string; currency: string; value: string; selected: boolean }>;
  label: { labelAction: 'UPLOAD_LABEL' | 'MARK_AS_SENT' | 'NO_LABEL'; fileId: string; carrierEnum: string; trackingNumber: string; noLabelReason: string; labelSentDate: string; returnLabelCost: string };
}
export interface ReturnApiRequest { method: 'POST'; path: string; body: Record<string, unknown> }
export interface PreparedReturnAction { action: ReturnAction; request: ReturnApiRequest; draft: ReturnActionDraft; identity: string; sourceSignature: string; integrity: string; preparedAt: string }
export interface ReturnRefundResult { status: 'SUCCESS' | 'FAILED' | 'PENDING'; sellerActual: ReturnMoney | null; buyerActual: ReturnMoney | null; actualItems: Array<{ refundFeeType: string; amount: ReturnMoney }>; issuedAt: string | null; initiator: string; state: string; returnStatus: string; closeAt?: string; closeReason?: string; error?: string }
export interface ReturnMockScenario { submit?: 'accepted' | 'failed' | 'unknown'; resolve?: 'success' | 'failed' | 'unknown'; readFailure?: 'summary' | 'detail' | 'files' | 'tracking' | 'all'; externalEvent?: 'buyerAccept' | 'buyerDecline' | 'autoApprove' | 'autoRefund' | 'buyerClose' | 'systemClose' | 'caseClose'; consumed?: boolean; error?: string; refundResult?: ReturnRefundResult; refundResultConsumed?: boolean }

const currencyDigits: Record<string, number> = { USD: 2, GBP: 2, EUR: 2, AUD: 2, CAD: 2, CNY: 2, HKD: 2, TWD: 2, NZD: 2, CHF: 2, SGD: 2, PLN: 2, SEK: 2, NOK: 2, DKK: 2, CZK: 2, HUF: 2, ILS: 2, MYR: 2, PHP: 2, MXN: 2, BRL: 2, INR: 2, JPY: 0, KRW: 0 }
export function moneyDigits(currency: string): number | null { return currencyDigits[currency] ?? null }
/** 所有比较与合计以最小货币单位计算；未知币种拒绝猜精度。 */
export function parseMoney(value: string, currency: string): bigint | null {
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
export const activityNames: Record<string, string> = { SELLER_APPROVE_REQUEST: '回应退货申请', SELLER_DECLINE_REQUEST: '拒绝退货', SELLER_OFFER_RETURNS: '提供退货方案', SELLER_OFFER_PARTIAL_REFUND: '提出部分退款', SELLER_ISSUE_REFUND: '发起退款', SELLER_RETRY_REFUND: '核实并重试退款', SELLER_PROVIDE_RMA: '提供退货授权编号', SELLER_PROVIDE_LABEL: '提供退货面单', SELLER_MARK_AS_RECEIVED: '确认收到退货', SELLER_SEND_MESSAGE: '发送退货留言', SELLER_ESCALATE: '请求 eBay 介入', BUYER_ACCEPTS_PARTIAL_REFUND: '确认部分退款报价', BUYER_DECLINE_PARTIAL_REFUND: '回应部分退款报价', BUYER_MARK_RETURN_SHIPPED: '寄回退货', BUYER_PROVIDE_TRACKING_INFO: '提供退回运单', REMINDER_BUYER_TO_RESPOND_RE_OFFER: '回应部分退款报价', REMINDER_BUYER_TO_SHIP: '寄回退货', REMINDER_FOR_REFUND: '向买家退款', REMINDER_FOR_RMA: '提供退货授权编号', REMINDER_SELLER_TO_RESPOND: '回应退货申请' }
export function safePlatformUrl(value: string | null | undefined): string | null {
  if (!value) return null
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password && /(^|\.)ebay\.(com|co\.uk|com\.au|de|fr|it|es|ca|ie|at|be|nl|ch)$/.test(url.hostname) ? url.href : null } catch { return null }
}
export function emptyReturnDetail(): ReturnDetailData {
  const unread = (): ReturnReadResult => ({ status: 'unknown', attemptedAt: null, succeededAt: null, error: '' })
  return { buyerComment: '', currentType: '', itemId: '', transactionId: '', itemPicture: null, buyerAddress: null, orderAddress: null, sellerAddress: null, files: [], shipments: [], refund: { sellerEstimated: null, buyerEstimated: null, sellerActual: null, buyerActual: null, outstanding: null, status: null, issuedAt: null, initiator: null, items: [], itemsComplete: false, actualItems: [], partialOfferLimit: null, partialOfferLimitVerified: false, partialOfferLimitSource: '', provisional: null, moneyMovements: [], recoup: null }, sellerDue: null, buyerDue: null, timeoutAt: null, rmaRequired: null, rmaNumber: null, shippingPayer: null, availableActions: [], closeInfo: null, holdInfo: null, contentOnHold: false, caseUrl: null, caseClosed: false, caseDecision: null, readStatus: { summary: unread(), detail: unread(), files: unread(), tracking: unread() }, eligibilityVersion: 0, attemptedAt: null }
}

type Obj = Record<string, unknown>
const object = (value: unknown): Obj => value && typeof value === 'object' && !Array.isArray(value) ? value as Obj : {}
const string = (value: unknown): string => typeof value === 'string' ? value : ''
const date = (value: unknown): string | null => string(object(value).value) || null
const array = (value: unknown): unknown[] => Array.isArray(value) ? value : []
function readMoney(value: unknown): ReturnMoney | null {
  const item = object(value), currency = string(item.currency), amount = typeof item.value === 'number' && Number.isFinite(item.value) ? String(item.value) : string(item.value)
  const minor = parseMoney(amount, currency)
  return minor === null ? null : { value: formatMinor(minor, currency), currency }
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
  return { returnId: string(summary.returnId), orderId: string(summary.orderId), buyerId: string(summary.buyerLoginName), state: string(summary.state), status: string(summary.status), returnType: string(creation.type), currentType: string(summary.currentType), buyerComment: string(object(creation.comments).content), itemId: string(item.itemId), transactionId: string(item.transactionId), quantity: typeof item.returnQuantity === 'number' ? item.returnQuantity : null, reason: string(creation.reason), createdAt: date(creation.creationDate), sellerDue: readDue(summary.sellerResponseDue), buyerDue: readDue(summary.buyerResponseDue), timeoutAt: date(summary.timeoutDate), rmaRequired: typeof object(summary.returnPolicy).rmaRequired === 'boolean' ? object(summary.returnPolicy).rmaRequired as boolean : null, availableActions: array(summary.sellerAvailableOptions).map(raw => { const option = object(raw); return { actionType: string(option.actionType), actionURL: safePlatformUrl(string(option.actionURL)) || undefined } }), sellerEstimated: readMoney(object(summary.sellerTotalRefund).estimatedRefundAmount), buyerEstimated: readMoney(object(summary.buyerTotalRefund).estimatedRefundAmount), sellerActual: readMoney(object(summary.sellerTotalRefund).actualRefundAmount), buyerActual: readMoney(object(summary.buyerTotalRefund).actualRefundAmount), caseId: string(escalation.caseId) || null, escalation: { eligible: eligibility.eligible === true, start: date(eligibility.startTime), end: date(eligibility.endTime) } }
}
export function parseReturnFull(payload: unknown) {
  const root = object(payload)
  if (!root.detail || !Object.keys(object(root.detail)).length) throw new Error('FULL响应缺少detail，不以SUMMARY替代')
  const detail = object(root.detail), refund = object(detail.refundInfo), estimated = object(refund.estimatedRefundDetail), actual = object(refund.actualRefundDetail), actualRefund = object(actual.actualRefund), shipmentInfo = object(detail.returnShipmentInfo), close = object(detail.closeInfo), hold = object(detail.holdInfo), item = object(detail.itemDetail)
  const items: ReturnRefundItem[] = []; let itemsComplete = Array.isArray(estimated.itemizedRefundDetails) && estimated.itemizedRefundDetails.length > 0
  for (const [values, optional] of [[estimated.itemizedRefundDetails, false], [estimated.optionalRefundLineItems, true]] as const) {
    for (const raw of array(values)) { const line = object(raw), amount = readMoney(line.estimatedAmount), min = readMoney(line.minAmount), max = readMoney(line.maxAmount), fee = string(line.refundFeeType); if (fee && amount && min && max && amount.currency === min.currency && min.currency === max.currency) items.push({ refundFeeType: fee, label: refundFeeNames[fee] || fee, currency: amount.currency, estimated: amount.value, min: min.value, max: max.value, optional }); else itemsComplete = false }
  }
  const shipmentValues = [...array(shipmentInfo.allShipmentTrackings), ...(shipmentInfo.shipmentTracking ? [shipmentInfo.shipmentTracking] : [])]
  const shipments: ReturnShipment[] = [], seen = new Set<string>()
  for (const raw of shipmentValues) { const value = object(raw), id = string(value.shipmentId), tracking = string(value.trackingNumber), carrier = string(value.carrierUsed) || string(value.carrierEnum), key = JSON.stringify([id, tracking, carrier]); if (seen.has(key)) continue; seen.add(key); shipments.push({ shipmentId: id, carrierEnum: string(value.carrierEnum), carrierName: string(value.carrierName) || carrier, trackingNumber: tracking, deliveryStatus: string(value.deliveryStatus), actualShipDate: date(value.actualShipDate), actualDeliveryDate: date(value.actualDeliveryDate), markAsReceived: value.markAsReceived === true, originAddress: readReturnAddress(value.originAddress), destinationAddress: readReturnAddress(value.destinationAddress), scans: [], readStatus: 'unknown' }) }
  return { marketplaceId: string(detail.marketplaceId), itemId: string(item.itemId), transactionId: string(item.transactionId), itemPicture: string(item.itemPicUrl) || null, buyerAddress: readReturnAddress(detail.buyerAddress), sellerAddress: readReturnAddress(detail.sellerAddress), files: readReturnFiles(detail.files), shipments, shippingPayer: string(shipmentInfo.payee) || null, rmaNumber: string(detail.RMANumber) || null, contentOnHold: detail.returnContentOnHold === true, closeInfo: Object.keys(close).length ? { at: date(close.returnCloseDate), reason: string(close.returnCloseReason), buyerReason: string(close.buyerCloseReason), buyerComment: string(close.buyerCloseComment) || string(object(close.buyerCloseComment).content) } : null, holdInfo: Object.keys(hold).length ? { status: string(hold.holdStatus), reason: '', until: date(hold.holdReleaseDate) } : null, refundItems: items, refundItemsComplete: itemsComplete, refundStatus: string(actual.refundStatus) || null, refundIssuedAt: date(actual.refundIssuedDate), refundInitiator: string(actual.refundInitiationType) || null, outstanding: readMoney(actual.outstandingAmount), actualItems: array(actualRefund.itemizedRefundDetail).map(raw => { const line = object(raw); return { refundFeeType: string(line.refundFeeType), amount: readMoney(line.refundAmount) } }).filter((line): line is {refundFeeType:string;amount:ReturnMoney} => !!line.amount), provisional: refund.provisionalRefund ? `退货前临时退款：${object(refund.provisionalRefund).refundProvided === true ? '已发放' : object(refund.provisionalRefund).refundProvided === false ? '未发放' : '待核实'}；撤回：${object(refund.provisionalRefund).refundReversed === true ? '已撤回' : object(refund.provisionalRefund).refundReversed === false ? '未撤回' : '待核实'}` : null, provisionalRaw: refund.provisionalRefund, recoup: detail.payoutRecoupInfo ? `平台待向卖家追偿 ${moneyText(readMoney(object(detail.payoutRecoupInfo).amountToRecoup))}；付款批次 ${object(detail.payoutRecoupInfo).payoutId ?? '待核实'}` : null, recoupRaw: detail.payoutRecoupInfo, moneyMovements: array(detail.moneyMovementInfo).map(raw => { const movement = object(raw), actualAmount = readMoney(movement.actualAmount); return { id: string(movement.externalPaymentId), type: string(movement.moneyMovementType), status: string(movement.status), at: date(movement.creationDate), amount: actualAmount, actualAmount, requestedAmount: readMoney(movement.requestedAmount) } }), history: array(detail.responseHistory).map(raw => { const entry = object(raw); return { at: date(entry.creationDate) || '', text: string(object(entry.notes).content), author: string(entry.author), activity: string(entry.activity), fromState: string(entry.fromState), toState: string(entry.toState), attributes: object(entry.attributes) } }) }
}

export function createReturnActionDraft(row: ReturnRecord, _action: ReturnAction): ReturnActionDraft {
  const detail = getReturnDetail(row)
  return { text: '', partialAmount: '', keepOriginalItem: row.keepItem, rmaNumber: detail.rmaNumber || '', reason: '', refundItems: detail.refund.items.map(item => ({ refundFeeType: item.refundFeeType, currency: item.currency, value: item.estimated, selected: !item.optional })), label: { labelAction: 'UPLOAD_LABEL', fileId: '', carrierEnum: '', trackingNumber: '', noLabelReason: '', labelSentDate: '', returnLabelCost: '' } }
}
export function buildReturnRequest(row: ReturnRecord, action: ReturnAction, draft: ReturnActionDraft): { error: string; request?: ReturnApiRequest } {
  const detail = getReturnDetail(row), text = draft.text.trim(), base = `/post-order/v2/return/${encodeURIComponent(row.id)}`
  if (text.length > 2000) return { error: '说明最多 2000 字（本地限制）' }
  if (['message', 'escalate'].includes(action) && !text) return { error: '请填写说明内容' }
  let path = `${base}/decide`, body: Record<string, unknown> = text ? { comments: { content: text } } : {}
  if (action === 'message') { path = `${base}/send_message`; body = { message: { content: text } } }
  else if (action === 'escalate') { if (!escalationReasons.some(item => item.value === draft.reason)) return { error: '请选择适用于卖家的介入原因' }; path = `${base}/escalate`; body.reason = draft.reason }
  else if (action === 'receive') path = `${base}/mark_as_received`
  else if (action === 'refund') {
    path = `${base}/issue_refund`
    if (!detail.refund.itemsComplete || !detail.refund.items.length || draft.refundItems.length !== detail.refund.items.length) return { error: '退款费用明细不完整或已变化，请重新核对' }
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
    if (label.labelAction === 'MARK_AS_SENT') { if (!label.labelSentDate || !Number.isFinite(Date.parse(label.labelSentDate))) return { error: '请填写已提供面单的实际时间' }; body.forwardShippingLabelProvided = true; body.labelSentDate = { value: new Date(label.labelSentDate).toISOString() } }
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
    if (['approve', 'offerReturn', 'partial'].includes(action)) body.keepOriginalItem = draft.keepOriginalItem
    if (action === 'provideRma' || (action === 'approve' && draft.rmaNumber.trim())) { if (!draft.rmaNumber.trim()) return { error: '请填写退货授权编号' }; body.RMANumber = draft.rmaNumber.trim(); body.rMAProvided = true }
  }
  return { error: '', request: { method: 'POST', path, body } }
}
function sourceSignature(row: ReturnRecord): string {
  const detail = getReturnDetail(row)
  return JSON.stringify([row.shopId, row.id, row.buyerId, row.orderNo, row.marketplaceId, row.currency, row.state, row.status, row.options, row.returnType, row.eligibilityKnown, row.escalation, row.keepItem, row.received, detail.eligibilityVersion, detail.readStatus.summary.status, detail.readStatus.detail.status, detail.refund, detail.rmaRequired, detail.rmaNumber, detail.files.map(item => [item.fileId, item.fileStatus, item.filePurpose, item.submitter])])
}
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T
export function prepareReturnAction(row: ReturnRecord, action: ReturnAction, draft: ReturnActionDraft, now = new Date().toISOString()): { error: string; prepared?: PreparedReturnAction } {
  const error = getReturnBlockedReason(row, action, now); if (error) return { error }
  const built = buildReturnRequest(row, action, draft); if (!built.request) return { error: built.error }
  const prepared: PreparedReturnAction = { action, request: clone(built.request), draft: clone(draft), identity: JSON.stringify([returnKey(row), row.buyerId, row.orderNo]), sourceSignature: sourceSignature(row), integrity: '', preparedAt: now }
  prepared.integrity = JSON.stringify([prepared.action, prepared.request, prepared.draft, prepared.identity, prepared.sourceSignature])
  return { error: '', prepared }
}
export function submitPreparedReturnAction(row: ReturnRecord, prepared: PreparedReturnAction, now = new Date().toISOString()): string {
  if (prepared.integrity !== JSON.stringify([prepared.action, prepared.request, prepared.draft, prepared.identity, prepared.sourceSignature])) return '确认内容已变化，请重新确认'
  if (prepared.identity !== JSON.stringify([returnKey(row), row.buyerId, row.orderNo]) || prepared.sourceSignature !== sourceSignature(row)) return '申请资格或金额资料已变化，请刷新后重新确认'
  const error = getReturnBlockedReason(row, prepared.action, now); if (error) return error
  const built = buildReturnRequest(row, prepared.action, prepared.draft)
  if (!built.request || JSON.stringify(built.request) !== JSON.stringify(prepared.request)) return built.error || '请求内容已变化，请重新确认'
  row.pendingAction = prepared.action; row.pendingText = prepared.draft.text.trim(); row.pendingAmount = prepared.action === 'partial' ? Number(prepared.draft.partialAmount) : null; row.pendingRequest = clone(prepared.request); row.pendingDraft = clone(prepared.draft); row.submissionError = ''
  row.outcome = row.mock?.submit === 'failed' ? 'failed' : row.mock?.submit === 'unknown' ? 'unknown' : 'pending'
  if (row.outcome === 'failed') { row.submissionError = row.mock?.error || '平台明确拒绝：当前申请资格发生变化，请刷新后核对'; row.pendingAction = null; if (row.mock) row.mock.submit = 'accepted' }
  row.logs.push({ at: now, text: `客服01 提交${actionNames[prepared.action]}；${prepared.action === 'message' ? '退货留言' : '对外处理说明'}${prepared.draft.text.trim() ? '：' + prepared.draft.text.trim() : ''}；${row.outcome === 'failed' ? row.submissionError : row.outcome === 'unknown' ? '响应超时，结果待核查，禁止重提' : '等待平台回查'}；请求快照已保存` })
  return ''
}
export function uploadReturnAttachment(row: ReturnRecord, input: { fileName: string; filePurpose: 'ITEM_RELATED' | 'LABEL_RELATED' | 'REFUND_RELATED'; data: string; fileFormat: string }, now = new Date().toISOString()): { error: string; file?: ReturnAttachment; request?: ReturnApiRequest } {
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
  detail.files.push(file); row.logs.push({ at: now, text: `客服01 上传${file.fileName}；已取得虚构文件回执，尚未关联发布；不代表留言已发送` })
  return { error: '', file, request: { method: 'POST', path: `/post-order/v2/return/${encodeURIComponent(row.id)}/file/upload`, body: { data, fileName: file.fileName, filePurpose: file.filePurpose } } }
}
function rejectSource(row: ReturnRecord, group: 'summary' | 'detail', error: string, now: string): never {
  row.eligibilityKnown = false
  const read = getReturnDetail(row).readStatus[group]; read.status = 'failed'; read.error = error; read.attemptedAt = now
  throw new Error(error)
}
function verifyItemIdentity(row: ReturnRecord, source: { itemId: string; transactionId: string }, group: 'summary' | 'detail', now: string): void {
  const detail = getReturnDetail(row)
  if ((detail.itemId && source.itemId && detail.itemId !== source.itemId) || (detail.transactionId && source.transactionId && detail.transactionId !== source.transactionId)) rejectSource(row, group, 'SUMMARY与FULL商品交易身份冲突，拒绝合并并暂停处理', now)
}
export function applyReturnSummary(row: ReturnRecord, payload: unknown, now = new Date().toISOString()): void {
  const source = parseReturnSummary(payload)
  if (!source.returnId || source.returnId !== row.id || (row.orderNo && source.orderId && row.orderNo !== source.orderId)) rejectSource(row, 'summary', 'Return或关联订单身份不一致，拒绝合并', now)
  verifyItemIdentity(row, source, 'summary', now)
  const detail = getReturnDetail(row); row.orderNo = source.orderId; row.buyerId = source.buyerId; row.state = source.state; row.status = source.status; row.returnType = source.returnType; row.options = source.availableActions.map(item => item.actionType); row.caseId = source.caseId; row.escalation = source.escalation; row.reasonCode = source.reason; if (source.quantity !== null) row.quantity = source.quantity; if (source.createdAt) row.createdAt = source.createdAt
  Object.assign(detail, { currentType: source.currentType, buyerComment: source.buyerComment, itemId: source.itemId || detail.itemId, transactionId: source.transactionId || detail.transactionId, sellerDue: source.sellerDue, buyerDue: source.buyerDue, timeoutAt: source.timeoutAt, rmaRequired: source.rmaRequired, availableActions: source.availableActions })
  Object.assign(detail.refund, { sellerEstimated: source.sellerEstimated, buyerEstimated: source.buyerEstimated, sellerActual: source.sellerActual, buyerActual: source.buyerActual }); row.estimatedRefund = source.sellerEstimated ? Number(source.sellerEstimated.value) : null; row.actualRefund = source.sellerActual ? Number(source.sellerActual.value) : null; row.deadline = source.sellerDue?.at || null; row.eligibilityKnown = knownReturnStates.has(row.state) && knownReturnStatuses.has(row.status); detail.eligibilityVersion++; detail.readStatus.summary = { status: 'success', succeededAt: now, attemptedAt: now, error: '' }
}
export function applyReturnFull(row: ReturnRecord, payload: unknown, now = new Date().toISOString(), requestContext?: { shopId: string; returnId: string }): void {
  if (requestContext && (requestContext.shopId !== row.shopId || requestContext.returnId !== row.id)) rejectSource(row, 'detail', 'FULL请求上下文与当前申请身份不一致，拒绝合并', now)
  const source = parseReturnFull(payload), detail = getReturnDetail(row)
  verifyItemIdentity(row, source, 'detail', now)
  Object.assign(detail, { itemId: source.itemId || detail.itemId, transactionId: source.transactionId || detail.transactionId, itemPicture: source.itemPicture, buyerAddress: source.buyerAddress, sellerAddress: source.sellerAddress, files: source.files, shipments: source.shipments, shippingPayer: source.shippingPayer, rmaNumber: source.rmaNumber, contentOnHold: source.contentOnHold, closeInfo: source.closeInfo, holdInfo: source.holdInfo })
  Object.assign(detail.refund, { items: source.refundItems, itemsComplete: source.refundItemsComplete, status: source.refundStatus, issuedAt: source.refundIssuedAt, initiator: source.refundInitiator, outstanding: source.outstanding, actualItems: source.actualItems, provisional: source.provisional, recoup: source.recoup, moneyMovements: source.moneyMovements }); if (source.marketplaceId) row.marketplaceId = source.marketplaceId; row.history = source.history; detail.readStatus.detail = { status: 'success', succeededAt: now, attemptedAt: now, error: '' }
}
