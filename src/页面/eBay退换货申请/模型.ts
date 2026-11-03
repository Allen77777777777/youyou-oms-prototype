import { 命中字段搜索, 命中多选, type 搜索模式 } from '@/组件/筛选/筛选工具'
import { eBay查询日期 } from '../eBay订单/时间工具'
import { cancelTimeZone, formatCancelTime, type CancelOutboundContext } from '../eBay取消订单申请/模型'
import { activityNames, emptyReturnDetail, parseMoney, createReturnActionDraft, prepareReturnAction, submitPreparedReturnAction, type ReturnAction, type ReturnDetailData, type ReturnApiRequest, type ReturnActionDraft, type ReturnMockScenario } from './接口契约'
export * from './接口契约'

export type ReturnQueue = 'all' | 'response' | 'processing' | 'case' | 'closed'
export interface ReturnRecord {
  id: string; shopId: string; shopName: string; site: string; marketplaceId: string; orderNo: string; buyerId: string
  title: string; sku: string; quantity: number; category: string; reason: string; reasonCode: string
  state: string; status: string; currency: string; estimatedRefund: number | null; actualRefund: number | null
  createdAt: string; deadline: string | null; options: string[]; eligibilityKnown: boolean
  escalation: { eligible: boolean; start: string | null; end: string | null }
  caseId: string | null; caseStatus: string | null; shipping: string; tracking: string | null
  keepItem: boolean; received: boolean; returnType: string; outcome: 'idle' | 'pending' | 'unknown' | 'confirmed' | 'failed'
  pendingAction: ReturnAction | null; pendingText: string; pendingAmount: number | null; updatedAt: string; lastSyncedAt: string
  systemOrderNo?: string; platformOrderStatus?: string; omsStatus?: string; warehouse?: string; orderChannel?: string; shipped?: number | null
  /** 当前申请商品与整单范围独立；缺失时不能将title/quantity当作整单资料。 */
  orderProducts?: Array<{ title: string; sku: string; quantity: number }> | null
  /** 原订单发货仓单；tracking仍只表示买家退回的物流单号。 */
  outbounds?: CancelOutboundContext[] | null
  notes: Array<{ at: string; text: string; author: string }>; history: Array<{ at: string; text: string; author: string; activity?: string; fromState?: string; toState?: string; attributes?: Record<string, unknown> }>
  logs: Array<{ at: string; text: string }>
  detail?: ReturnDetailData; pendingRequest?: ReturnApiRequest | null; pendingDraft?: ReturnActionDraft | null; submissionError?: string; mock?: ReturnMockScenario
}
export interface ReturnFilters { shops: string[]; reasons: string[]; states: string[]; /** 旧配置兼容字段，不再作为业务筛选。 */ outcomes: string[]; field: string; query: string; mode: 搜索模式; dates: string[] | null }
export const createReturnFilters = (): ReturnFilters => ({ shops: [], reasons: [], states: [], outcomes: [], field: 'id', query: '', mode: 'contains', dates: null })
export const returnKey = (row: Pick<ReturnRecord, 'shopId' | 'id'>): string => JSON.stringify([row.shopId, row.id])
export const returnTimeZone = (row: Pick<ReturnRecord, 'marketplaceId'>): string | undefined => cancelTimeZone(row)
export const formatReturnTime = (value: string | null | undefined, row: Pick<ReturnRecord, 'marketplaceId'>): string => formatCancelTime(value, row)
export function findReturnRecord(records: readonly ReturnRecord[], key: string): ReturnRecord | undefined {
  const matches = records.filter(row => returnKey(row) === key)
  return matches.length === 1 ? matches[0] : undefined
}
export function getReturnDetail(row: ReturnRecord): ReturnDetailData { return row.detail ??= emptyReturnDetail() }
export const actionNames: Record<ReturnAction, string> = { approve: '接受退货', decline: '拒绝退货', offerReturn: '提供退货方案', partial: '提出部分退款', refund: '发起退款', message: '发送消息', escalate: '请求 eBay 介入', provideRma: '提供退货授权', receive: '确认收到退货', label: '提供退货面单' }
export const stateNames: Record<string, string> = {
  INITIAL: '申请已发起', RETURN_REQUESTED: '待卖家回应', RETURN_REJECTED: '已拒绝',
  RETURN_LABEL_PENDING: '待提供退货面单', RETURN_LABEL_PENDING_TIMEOUT: '退货面单待提供超时', RETURN_LABEL_REQUESTED: '已请求退货面单', RETURN_LABEL_REQUESTED_TIMEOUT: '退货面单请求超时', RETURN_REQUEST_TIMEOUT: '买家发起退货超时', RMA_PENDING: '待提供退货授权',
  ITEM_READY_TO_SHIP: '待买家寄回', ITEM_SHIPPED: '买家已寄回', ITEM_DELIVERED: '退货已送达', ITEM_KEPT: '无需寄回',
  PARTIAL_REFUND_REQUESTED: '待买家接受报价', PARTIAL_REFUND_DECLINED: '买家已拒绝报价', PARTIAL_REFUND_INITIATED: '部分退款处理中', PARTIAL_REFUND_FAILED: '部分退款失败', PARTIAL_REFUNDED: '已部分退款', REFUND_INITIATED: '退款处理中', REFUND_FAILED: '退款失败', REFUND_TIMEOUT: '退款处理超时', CLOSED: '已关闭', UNKNOWN: '状态待核实',
  AUTO_REFUND_INITIATED: '平台自动退款处理中', LESS_THAN_A_FULL_REFUND_ISSUED: '尚未足额退款', PARTIAL_REFUND_AS_PAYOUT_INITIATED: '部分退款扣款处理中', PARTIAL_REFUND_NON_PAYPAL_INITIATED: '部分退款处理中', PAYOUT_INITIATED: '付款处理中', REFUND_AS_PAYOUT_INITIATED: '退款扣款处理中', REFUND_SENT_PENDING_CONFIRMATION: '退款已发送待确认',
}
export const outcomeNames = { idle: '未提交', pending: '已提交 · 待回查', unknown: '结果待核查', confirmed: '已回查', failed: '明确失败' }
export const knownReturnStates = new Set(Object.keys(stateNames).filter(value => value !== 'UNKNOWN'))
export const knownReturnStatuses = new Set(['RETURN_REQUESTED', 'RETURN_REJECTED', 'RETURN_REQUESTED_TIMEOUT', 'RETURN_LABEL_REQUESTED', 'WAITING_FOR_RETURN_LABEL', 'WAITING_FOR_RMA', 'READY_FOR_SHIPPING', 'ITEM_SHIPPED', 'ITEM_DELIVERED', 'PARTIAL_REFUND_REQUESTED', 'PARTIAL_REFUND_DECLINED', 'PARTIAL_REFUND_INITIATED', 'PARTIAL_REFUND_FAILED', 'LESS_THAN_A_FULL_REFUND_ISSUED', 'CLOSED', 'ESCALATED'])
export const statusNames: Record<string, string> = { RETURN_REQUESTED: '已申请退货', RETURN_REJECTED: '已拒绝退货', RETURN_REQUESTED_TIMEOUT: '退货申请响应超时', RETURN_LABEL_REQUESTED: '已请求退货面单', WAITING_FOR_RETURN_LABEL: '等待退货面单', WAITING_FOR_RMA: '等待退货授权', READY_FOR_SHIPPING: '等待买家寄回', ITEM_SHIPPED: '买家已寄回', ITEM_DELIVERED: '退货已送达', PARTIAL_REFUND_REQUESTED: '已提出部分退款报价', PARTIAL_REFUND_DECLINED: '部分退款报价被拒绝', PARTIAL_REFUND_INITIATED: '部分退款已发起', PARTIAL_REFUND_FAILED: '部分退款失败', LESS_THAN_A_FULL_REFUND_ISSUED: '已发生部分退款', CLOSED: '已关闭', ESCALATED: '已升级纠纷' }
export const isEscalated = (row: ReturnRecord) => !!row.caseId || row.status === 'ESCALATED'
export const isReturnClosed = (row: ReturnRecord) => row.state === 'CLOSED' || row.status === 'CLOSED'
export const actionOptions: Record<ReturnAction, string> = { approve: 'SELLER_APPROVE_REQUEST', decline: 'SELLER_DECLINE_REQUEST', offerReturn: 'SELLER_OFFER_RETURNS', partial: 'SELLER_OFFER_PARTIAL_REFUND', refund: 'SELLER_ISSUE_REFUND', message: 'SELLER_SEND_MESSAGE', escalate: 'SELLER_ESCALATE', provideRma: 'SELLER_PROVIDE_RMA', receive: 'SELLER_MARK_AS_RECEIVED', label: 'SELLER_PROVIDE_LABEL' }
export const escalationReasons = [
  { value: 'ITEM_NOT_RECEIVED', label: '未在预期时间收到退货' },
  { value: 'BUYER_RETURNED_WRONG_ITEM', label: '买家退回的商品不符' },
  { value: 'ITEM_RECEIVED_IN_DIFFERENT_CONDITION', label: '退回商品状况发生变化' },
  { value: 'RECEIVED_EMPTY_BOX', label: '收到空包裹' },
  { value: 'RECEIVED_DAMAGED_ITEM', label: '退回商品运输途中损坏' },
  { value: 'OTHER', label: '其他原因' },
]
export function inReturnQueue(row: ReturnRecord, queue: ReturnQueue): boolean {
  if (queue === 'all') return true
  const closed = isReturnClosed(row) || row.detail?.caseClosed === true
  if (queue === 'closed') return closed
  if (closed) return false
  if (queue === 'case') return isEscalated(row)
  if (isEscalated(row)) return false
  const response = !knownReturnStates.has(row.state) || !knownReturnStatuses.has(row.status) || ['INITIAL', 'RETURN_REQUESTED', 'RETURN_REJECTED', 'PARTIAL_REFUND_DECLINED', 'RETURN_LABEL_PENDING_TIMEOUT', 'RETURN_LABEL_REQUESTED_TIMEOUT', 'RETURN_REQUEST_TIMEOUT'].includes(row.state)
  if (queue === 'response') return response
  return queue === 'processing' && !response
}
export function getReturnCurrentTasks(row: ReturnRecord): Array<{ party: string; activity: string; label: string; at: string | null }> {
  const detail = getReturnDetail(row)
  if (isReturnClosed(row) || isEscalated(row)) return []
  return ([['卖家', detail.sellerDue], ['买家', detail.buyerDue]] as const).flatMap(([party, due]) => due ? [{ party, activity: due.activity, label: activityNames[due.activity] || due.activity, at: due.at }] : [])
}
export function filterReturns(rows: ReturnRecord[], filters: ReturnFilters): ReturnRecord[] {
  return rows.filter(row => {
    const date = filters.dates?.length === 2 ? eBay查询日期(row.createdAt, 'site', [row.marketplaceId]) : null
    return 命中多选(filters.shops, row.shopId) && 命中多选(filters.reasons, row.reasonCode) && 命中多选(filters.states, row.state)
      && 命中字段搜索(String(row[filters.field as keyof ReturnRecord] ?? ''), filters.query, filters.mode)
      && (!filters.dates?.length || Boolean(date && date >= filters.dates[0]! && date <= filters.dates[1]!))
  })
}
export function getReturnBlockedReason(row: ReturnRecord, action: ReturnAction, now = new Date().toISOString()): string {
  if (!row.shopId || !row.id || !row.buyerId) return '申请身份不完整，请先核实来源资料'
  if (row.outcome === 'pending') return '上次提交尚未回查，请先刷新数据'
  if (row.outcome === 'unknown') return '上次操作结果待核查，请刷新数据并核实后再处理'
  if (isEscalated(row)) return '已升级为纠纷，请在纠纷流程继续处理'
  if (isReturnClosed(row)) return '申请已关闭'
  if (row.returnType !== 'MONEY_BACK') return '此类买家诉求暂不支持在线处理'
  const detail = getReturnDetail(row)
  if (!row.eligibilityKnown || !knownReturnStates.has(row.state) || !knownReturnStatuses.has(row.status) || detail.readStatus.summary.status !== 'success') return '当前可执行操作尚未核实，请先刷新数据'
  if (!row.options.includes(actionOptions[action])) return action === 'refund' && row.options.includes('SELLER_RETRY_REFUND') ? '平台要求退款重试，请通过来源平台入口核实处理' : '当前申请不支持此操作'
  if (['refund', 'partial', 'label', 'provideRma', 'approve'].includes(action) && detail.readStatus.detail.status !== 'success') return '详情资料尚未完整刷新，请先核实后处理'
  if (action === 'refund' && (!detail.refund.itemsComplete || !detail.refund.items.length || detail.refund.items.some(item => { const min = parseMoney(item.min, item.currency), max = parseMoney(item.max, item.currency); return min === null || max === null || min > max }))) return '本次退款费用明细与金额尚未确认'
  if (action === 'partial' && (!detail.refund.partialOfferLimitVerified || !detail.refund.partialOfferLimit || (parseMoney(detail.refund.partialOfferLimit.value, detail.refund.partialOfferLimit.currency) ?? 0n) <= 0n)) return '部分退款报价额度尚未核实'
  if (action === 'escalate') {
    const time = Date.parse(now), start = Date.parse(row.escalation.start ?? ''), end = Date.parse(row.escalation.end ?? '')
    if (!row.escalation.eligible) return '平台当前未授予卖家请求介入资格'
    if (!Number.isFinite(start) || !Number.isFinite(end) || !Number.isFinite(time)) return '卖家介入时间窗资料不完整，请先刷新核实'
    if (time < start) return '尚未到卖家允许请求介入的时间'
    if (time > end) return '已超过卖家允许请求介入的时间'
  }
  return ''
}
export function validateReturnAction(row: ReturnRecord, action: ReturnAction, text: string, amount: number | null, reason: string, now?: string): string {
  const draft = createReturnActionDraft(row, action); draft.text = text; draft.partialAmount = amount === null ? '' : String(amount); draft.reason = reason
  return prepareReturnAction(row, action, draft, now).error
}
/** 此处只建立本地待回查记录，不把提交动作等同于平台终态。 */
export function submitReturnAction(row: ReturnRecord, action: ReturnAction, text: string, amount: number | null = null, reason = '', now = new Date().toISOString()): string {
  const draft = createReturnActionDraft(row, action); draft.text = text; draft.partialAmount = amount === null ? '' : String(amount); draft.reason = reason
  const result = prepareReturnAction(row, action, draft, now)
  return result.prepared ? submitPreparedReturnAction(row, result.prepared, now) : result.error
}
function setOptions(row: ReturnRecord, values: string[]) { row.options = values; getReturnDetail(row).availableActions = values.map(actionType => ({ actionType })) }
function setTasks(row: ReturnRecord, seller: string | null, buyer: string | null) {
  const detail = getReturnDetail(row)
  // 固定虚构来源日期，不以本地当前时间计算平台业务时限。
  detail.sellerDue = seller ? { activity: seller, at: '2026-11-15T23:59:59Z' } : null
  detail.buyerDue = buyer ? { activity: buyer, at: '2026-11-18T23:59:59Z' } : null
  row.deadline = detail.sellerDue?.at || null
}
function addActivity(row: ReturnRecord, activity: string, text: string, at: string, author = '平台') { row.history.push({ at, text, author, activity }) }
function applyAccepted(row: ReturnRecord, action: ReturnAction, now: string) {
  const detail = getReturnDetail(row), draft = row.pendingDraft, body = row.pendingRequest?.body || {}
  if (['approve', 'offerReturn', 'provideRma'].includes(action)) {
    if (draft?.rmaNumber.trim()) detail.rmaNumber = draft.rmaNumber.trim()
    if (action !== 'provideRma') row.keepItem = draft?.keepOriginalItem ?? row.keepItem
    if (row.keepItem) { row.state = 'ITEM_KEPT'; row.shipping = '无需寄回'; setOptions(row, ['SELLER_ISSUE_REFUND', 'SELLER_SEND_MESSAGE']); setTasks(row, 'SELLER_ISSUE_REFUND', null) }
    else if (detail.rmaRequired && !detail.rmaNumber) { row.state = 'RMA_PENDING'; row.status = 'WAITING_FOR_RMA'; setOptions(row, ['SELLER_PROVIDE_RMA', 'SELLER_SEND_MESSAGE']); setTasks(row, 'SELLER_PROVIDE_RMA', null) }
    else { row.state = 'RETURN_LABEL_PENDING'; row.status = 'WAITING_FOR_RETURN_LABEL'; row.shipping = '等待提供退货面单'; setOptions(row, ['SELLER_PROVIDE_LABEL', 'SELLER_SEND_MESSAGE']); setTasks(row, 'SELLER_PROVIDE_LABEL', null) }
  }
  if (action === 'decline') { row.state = 'RETURN_REJECTED'; row.status = 'RETURN_REJECTED'; setOptions(row, ['SELLER_SEND_MESSAGE']); setTasks(row, null, null) }
  if (action === 'partial') { row.state = 'PARTIAL_REFUND_REQUESTED'; row.status = 'PARTIAL_REFUND_REQUESTED'; setOptions(row, ['SELLER_SEND_MESSAGE']); setTasks(row, null, 'REMINDER_BUYER_TO_RESPOND_RE_OFFER') }
  if (action === 'refund') { row.state = 'REFUND_INITIATED'; detail.refund.status = 'PENDING'; setOptions(row, []); setTasks(row, null, null) }
  if (action === 'receive') { row.received = true; row.state = 'ITEM_DELIVERED'; row.status = 'ITEM_DELIVERED'; row.shipping = '卖家已确认收到退货'; for (const shipment of detail.shipments) shipment.markAsReceived = true; setOptions(row, ['SELLER_ISSUE_REFUND', 'SELLER_SEND_MESSAGE']); setTasks(row, 'SELLER_ISSUE_REFUND', null) }
  if (action === 'label') {
    const file = detail.files.find(item => item.fileId === body.fileId); if (file) file.fileStatus = 'PUBLISHED'
    if (body.labelAction !== 'NO_LABEL') {
      const trackingNumber = typeof body.trackingNumber === 'string' ? body.trackingNumber : '', carrierEnum = typeof body.carrierEnum === 'string' ? body.carrierEnum : ''
      const matches = detail.shipments.filter(item => (file && item.labelFileId === file.fileId) || (trackingNumber && item.trackingNumber === trackingNumber && item.carrierEnum === carrierEnum))
      if (matches.length === 1) { matches[0]!.labelFileId = file?.fileId; if (trackingNumber) matches[0]!.trackingNumber = trackingNumber; if (carrierEnum) matches[0]!.carrierEnum = carrierEnum }
      else if (!matches.length) detail.shipments.push({ shipmentId: `DEMO-LABEL-SHIPMENT-${row.id}-${detail.shipments.length + 1}`, carrierEnum, carrierName: carrierEnum, trackingNumber, deliveryStatus: '', actualShipDate: null, actualDeliveryDate: null, markAsReceived: false, originAddress: null, destinationAddress: null, labelFileId: file?.fileId, scans: [], readStatus: 'success' })
      if (trackingNumber) row.tracking = trackingNumber
    }
    row.state = 'ITEM_READY_TO_SHIP'; row.status = 'READY_FOR_SHIPPING'; row.shipping = body.labelAction === 'NO_LABEL' ? '已提供无面单退回安排，待买家寄回' : '退货面单已提供，待买家寄回'; setOptions(row, ['SELLER_SEND_MESSAGE']); setTasks(row, null, 'BUYER_MARK_RETURN_SHIPPED')
  }
  if (action === 'escalate') { row.status = 'ESCALATED'; row.caseId = `DEMO-CASE-${row.id.slice(-3)}`; row.caseStatus = '等待 eBay 处理（虚构回执）'; detail.caseUrl = null; setOptions(row, []); setTasks(row, null, null) }
  addActivity(row, actionOptions[action], action === 'message' ? row.pendingText : `${actionNames[action]}已获平台回执${draft?.text.trim() ? '；' + draft.text.trim() : ''}`, now, '卖家')
  row.logs.push({ at: now, text: `回查确认${actionNames[action]}已受理${action === 'partial' ? '；等待买家决定，尚未退款' : action === 'refund' ? '；退款处理中，尚未确认到账' : ''}` })
  row.pendingAction = null; row.outcome = 'confirmed'; row.submissionError = ''
}
function applyRefundResult(row: ReturnRecord, now: string): boolean {
  const result = row.mock?.refundResult
  if (!result || row.mock?.refundResultConsumed) return false
  const detail = getReturnDetail(row)
  detail.refund.status = result.status; detail.refund.sellerActual = result.sellerActual ? { ...result.sellerActual } : null; detail.refund.buyerActual = result.buyerActual ? { ...result.buyerActual } : null; detail.refund.actualItems = result.actualItems.map(item => ({ ...item, amount: { ...item.amount } })); detail.refund.issuedAt = result.issuedAt; detail.refund.initiator = result.initiator
  row.actualRefund = result.sellerActual ? Number(result.sellerActual.value) : null; row.state = result.state; row.status = result.returnStatus
  if (result.closeAt) detail.closeInfo = { at: result.closeAt, reason: result.closeReason || '', buyerReason: '', buyerComment: '' }
  if (result.status === 'FAILED') { row.submissionError = result.error || '退款失败，请按平台当前允许的下一步核实处理'; setOptions(row, ['SELLER_RETRY_REFUND', 'SELLER_SEND_MESSAGE']) }
  else setOptions(row, [])
  setTasks(row, null, null); row.mock!.refundResultConsumed = true
  addActivity(row, 'NOTIFY_UPDATE_REFUND_STATUS', result.status === 'SUCCESS' ? '已取得退款成功及实际金额回执' : result.status === 'FAILED' ? '已取得退款失败回执，未把预计金额当成已退款' : '平台资金仍在处理中', now)
  return true
}
function applyExternal(row: ReturnRecord, event: NonNullable<ReturnMockScenario['externalEvent']>, now: string) {
  const detail = getReturnDetail(row)
  if (event === 'buyerAccept') { row.state = 'PARTIAL_REFUND_INITIATED'; row.status = 'PARTIAL_REFUND_INITIATED'; detail.refund.status = 'PENDING'; setOptions(row, []); setTasks(row, null, null); addActivity(row, 'BUYER_ACCEPTS_PARTIAL_REFUND', '买家已接受部分退款报价，资金结果待回查', now, '买家') }
  if (event === 'buyerDecline') { row.state = 'PARTIAL_REFUND_DECLINED'; row.status = 'PARTIAL_REFUND_DECLINED'; setOptions(row, ['SELLER_APPROVE_REQUEST', 'SELLER_OFFER_PARTIAL_REFUND', 'SELLER_SEND_MESSAGE']); setTasks(row, 'SELLER_APPROVE_REQUEST', null); addActivity(row, 'BUYER_DECLINE_PARTIAL_REFUND', '买家拒绝部分退款报价', now, '买家') }
  if (event === 'autoApprove') { row.state = 'ITEM_READY_TO_SHIP'; row.status = 'READY_FOR_SHIPPING'; row.shipping = '平台已自动批准，等待买家寄回'; setOptions(row, ['SELLER_SEND_MESSAGE']); setTasks(row, null, 'BUYER_MARK_RETURN_SHIPPED'); addActivity(row, 'EBAY_RULE_AUTO_APPROVE', '平台自动批准退货', now) }
  if (event === 'autoRefund') { if (applyRefundResult(row, now)) addActivity(row, 'SYSTEM_INITIATED_REFUND', '已读取平台自动退款来源结果', now) }
  if (event === 'buyerClose' || event === 'systemClose') { row.state = 'CLOSED'; row.status = 'CLOSED'; detail.closeInfo = { at: now, reason: event === 'buyerClose' ? 'BUYER_CLOSED' : 'OTHER', buyerReason: event === 'buyerClose' ? 'BUYER_NO_LONGER_WANTS_RETURN' : '', buyerComment: event === 'buyerClose' ? 'The issue has been resolved.' : '' }; setOptions(row, []); setTasks(row, null, null); addActivity(row, event === 'buyerClose' ? 'BUYER_CLOSE_RETURN' : 'SYSTEM_CLOSE_RETURN', event === 'buyerClose' ? '买家关闭申请' : '平台关闭申请', now, event === 'buyerClose' ? '买家' : '平台') }
  if (event === 'caseClose') { detail.caseClosed = true; detail.caseDecision = '平台已结束案件（虚构回查结果）'; row.caseStatus = '已结束'; addActivity(row, 'CASE_UPDATED', '已取得独立Case的结束结果，原Return继续保留', now) }
}
export interface ReturnSyncResult { status: 'success' | 'partial' | 'failed'; message: string }
/** 仅回放固定虚构回执，无人工改成功入口；读取成功不等于操作成功。 */
export function syncReturn(row: ReturnRecord, now = new Date().toISOString()): ReturnSyncResult {
  const detail = getReturnDetail(row), failure = row.mock?.readFailure; detail.attemptedAt = now
  for (const key of ['summary', 'detail', 'files', 'tracking'] as const) { const read = detail.readStatus[key]; read.attemptedAt = now; if (failure === key || failure === 'all') { read.status = 'failed'; read.error = `${key.toUpperCase()}读取失败（虚构回执）` } else { read.status = 'success'; read.succeededAt = now; read.error = '' } }
  if (failure === 'all' || failure === 'summary') { row.eligibilityKnown = false; return { status: failure === 'all' ? 'failed' : 'partial', message: '申请资格读取失败，保留原资料并暂停处理' } }
  row.eligibilityKnown = knownReturnStates.has(row.state) && knownReturnStatuses.has(row.status); detail.eligibilityVersion++
  if (!failure) row.lastSyncedAt = now
  if (failure) return { status: 'partial', message: '部分资料刷新失败，已保留上次资料；请查看对应区域' }
  if (row.outcome === 'unknown') {
    if (!row.mock?.resolve || row.mock.resolve === 'unknown') { row.logs.push({ at: now, text: '查询后仍未确认上次操作结果；继续禁止重复提交' }); return { status: 'success', message: '读取成功，上次操作结果仍待核查' } }
    if (row.mock.resolve === 'failed') { row.outcome = 'failed'; row.pendingAction = null; row.submissionError = '已取得明确失败回执，未执行成功；可按最新资格重新处理'; row.logs.push({ at: now, text: row.submissionError }); return { status: 'success', message: row.submissionError } }
    if (row.pendingAction) applyAccepted(row, row.pendingAction, now)
  } else if (row.outcome === 'pending' && row.pendingAction) {
    if (row.mock?.resolve === 'failed') { row.outcome = 'failed'; row.pendingAction = null; row.submissionError = row.mock.error || '平台明确拒绝本次操作，请核对后重新处理'; row.logs.push({ at: now, text: row.submissionError }) }
    else applyAccepted(row, row.pendingAction, now)
  } else if (row.mock?.externalEvent && !row.mock.consumed) { applyExternal(row, row.mock.externalEvent, now); row.mock.consumed = true }
  else if (row.pendingRequest?.path.endsWith('/issue_refund') && row.detail?.refund.status === 'PENDING') applyRefundResult(row, now)
  return { status: 'success', message: row.outcome === 'failed' ? row.submissionError || '已取得明确失败结果' : '申请资料已刷新' }
}
export function addReturnNote(row: ReturnRecord, text: string, now = new Date().toISOString()): string {
  if (!text.trim() || text.trim().length > 500) return '内部备注须为 1～500 字'
  row.notes.push({ at: now, text: text.trim(), author: '客服01' }); return ''
}
