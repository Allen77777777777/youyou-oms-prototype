import { 共享订单 } from '../订单处理/演示会话'
import { afterSaleRecords, createAfterSale, createPlatformAfterSale, updateAfterSaleResult, validateAfterSale, type AfterSaleInput } from '../售后单管理/会话'
import { resolveReturnItem, resolveReturnOrder } from './关联导航'
import { formatMinor, parseMoney, type PreparedReturnAction, type ReturnAction, type ReturnActionDraft, type ReturnMoney } from './接口契约'
import { captureReturnHandlers } from './处理人'
import { isReturnClosed, syncReturn, submitPreparedReturnAction, validatePreparedReturnAction, type ReturnRecord } from './模型'

export interface ReturnSaleDraft {
  requestId: string
  quantity: number | undefined
  reason: string
  note: string
  refundScope: '全额退款' | '部分退款' | ''
}
/** 只比较本次申请已经核实的必退分项；可选运费单独办理。 */
export function directRefundCoverage(row: ReturnRecord, items: ReturnActionDraft['refundItems']) {
  const source = row.detail?.refund
  const required = source?.items.filter(item => !item.optional) || []
  if (!source?.itemsComplete || !required.some(item => item.refundFeeType === 'PURCHASE_PRICE')) return null
  let short = false
  for (const item of required) {
    const chosen = items.find(line => line.selected && line.refundFeeType === item.refundFeeType && line.currency === item.currency)
    const max = parseMoney(item.max, item.currency), amount = chosen ? parseMoney(chosen.value, item.currency) : null
    if (max === null || amount === null || amount > max) return null
    if (amount < max) short = true
  }
  return short ? '部分退款' : '全额退款'
}
export function isSaleAction(action: ReturnAction | null, keepOriginalItem: boolean | undefined): boolean {
  return action === 'refund' || action === 'partial' || ((action === 'approve' || action === 'offerReturn') && keepOriginalItem === false)
}
export function returnSaleItem(row: ReturnRecord) {
  const detail = row.detail
  const restricted = detail?.contentOnHold || detail?.itemOnHold
  const item = restricted ? undefined : resolveReturnItem(row, 共享订单.value)
  const title = restricted ? '商品内容已隐藏' : detail?.itemTitle || row.title
  const sourceLineId = detail?.itemId && detail.transactionId ? JSON.stringify([detail.itemId, detail.transactionId]) : ''
  return { lineId: item?.externalLineId || sourceLineId, sku: item?.systemSku, title: title || '申请商品' }
}
export function createReturnSaleDraft(row: ReturnRecord, requestId: string = crypto.randomUUID()): ReturnSaleDraft {
  return { requestId, quantity: row.quantity ?? undefined, reason: '', note: '', refundScope: '' }
}
export function validateSaleQuantity(row: ReturnRecord, draft: Pick<ReturnSaleDraft, 'quantity'>): string {
  if (row.detail?.quantityConflict || !Number.isSafeInteger(row.quantity) || !row.quantity || row.quantity < 1) return '申请商品数量待核实，请先刷新资料'
  if (!Number.isSafeInteger(draft.quantity) || !draft.quantity || draft.quantity < 1 || draft.quantity > row.quantity) return '本次商品数量须为正整数，且不能超过申请数量'
  return ''
}
function saleBase(row: ReturnRecord, draft: ReturnSaleDraft) {
  return {
    requestId: draft.requestId, shopId: row.shopId, shopName: row.shopName, returnId: row.id, orderNo: row.orderNo,
    systemOrderNo: resolveReturnOrder(row, 共享订单.value)?.systemOrderNo, platformReason: row.reason, note: draft.note,
    items: [{ ...returnSaleItem(row), quantity: draft.quantity ?? 0, reason: draft.reason }],
  }
}
export function prepareDirectSale(row: ReturnRecord, prepared: PreparedReturnAction, draft: ReturnSaleDraft): AfterSaleInput {
  if (!isSaleAction(prepared.action, prepared.draft.keepOriginalItem)) throw new Error('本次平台操作无需创建售后单')
  const base = saleBase(row, draft)
  if (prepared.action === 'partial') return { ...base, kind: '部分退款', actionLabel: '部分退款报价', amount: { value: prepared.draft.partialAmount, currency: row.detail?.refund.partialOfferLimit?.currency || row.currency } }
  if (prepared.action === 'refund') {
    const items = prepared.draft.refundItems.filter(item => item.selected)
    const currency = items[0]!.currency
    const amount = items.reduce((sum, item) => sum + parseMoney(item.value, currency)!, 0n)
    const kind = directRefundCoverage(row, prepared.draft.refundItems) || draft.refundScope
    if (!kind) throw new Error('请核实并选择本次退款类型')
    return { ...base, kind, actionLabel: '发起退款', amount: { value: formatMinor(amount, currency), currency } }
  }
  return { ...base, kind: '退货', actionLabel: '接受退货 · 买家寄回' }
}
/** 二次确认后先复验资格及联填资料。两项校验通过才落单并沿用原本唯一的提交入口。 */
export function submitReturnAndSale(row: ReturnRecord, prepared: PreparedReturnAction, input: AfterSaleInput, now = new Date().toISOString()) {
  if (input.shopId !== row.shopId || input.returnId !== row.id || !isSaleAction(prepared.action, prepared.draft.keepOriginalItem)) return { error: '请核对申请和售后处理方式' }
  if (afterSaleRecords.value.some(record => record.shopId === row.shopId && record.returnId === row.id && record.requestId === input.requestId)) {
    const existing = createAfterSale(input)
    return existing.ok && existing.record ? { error: '', no: existing.record.no } : { error: existing.message }
  }
  const validation = validatePreparedReturnAction(row, prepared, now)
  if (validation) return { error: validation }
  const source = returnSaleItem(row)
  const chosen = input.items[0]
  if (input.orderNo !== row.orderNo || input.systemOrderNo !== resolveReturnOrder(row, 共享订单.value)?.systemOrderNo || input.items.length !== 1 || !chosen || chosen.lineId !== source.lineId || chosen.sku !== source.sku || chosen.title !== source.title || validateSaleQuantity(row, chosen)) return { error: '售后商品或原单关联已变化，请重新确认' }
  if ((prepared.action === 'approve' || prepared.action === 'offerReturn') && chosen.quantity !== row.quantity) return { error: '接受退货适用于整笔申请，请核对申请数量' }
  const expected = prepareDirectSale(row, prepared, { requestId: input.requestId, quantity: chosen.quantity, reason: chosen.reason, note: input.note || '', refundScope: input.kind === '部分退款' ? '部分退款' : '全额退款' })
  if (input.kind !== expected.kind || input.actionLabel !== expected.actionLabel || input.amount?.value !== expected.amount?.value || input.amount?.currency !== expected.amount?.currency) return { error: '售后类型或金额与本次平台操作不一致，请重新确认' }
  const check = validateAfterSale(input)
  if (check.length) return { error: check[0]! }
  const created = createAfterSale(input)
  if (!created.ok || !created.record) return { error: created.message }
  const no = created.record.no
  if (created.reused) return { error: '', no }
  const error = submitPreparedReturnAction(row, prepared, now)
  if (error) { updateAfterSaleResult(no, '未提交：' + error); return { error, no } }
  row.afterSaleSubmission = { no, requestId: input.requestId, action: prepared.action }
  updateAfterSaleResult(no, row.outcome === 'failed' ? '平台提交失败' : row.outcome === 'unknown' ? '平台结果待核实' : '已提交，待平台回查')
  return { error: '', no }
}
export function prepareReship(row: ReturnRecord, fields: ReturnSaleDraft): AfterSaleInput {
  return { ...saleBase(row, fields), kind: '重发', actionLabel: '商家重发' }
}
function verifiedMoney(row: ReturnRecord): ReturnMoney | undefined {
  const refund = row.detail?.refund
  if (refund?.status !== 'SUCCESS' || refund.integrityIssues?.length || !refund.actualItemsComplete || refund.actualTotalMatches !== true) return
  const amount = refund.actualTotal
  return amount && parseMoney(amount.value, amount.currency) !== null ? amount : undefined
}
function recordFunds(row: ReturnRecord, no: string) {
  const status = row.detail?.refund.status, amount = verifiedMoney(row)
  const text = status === 'SUCCESS' ? (amount ? '平台退款成功' : '平台已确认退款，实退金额待核实') : status === 'FAILED' ? '平台退款失败' : '退款处理中'
  updateAfterSaleResult(no, text, amount ?? null)
}
function reconcilePlatformSale(row: ReturnRecord, event: 'autoApprove' | 'autoRefund', newReceipt: boolean) {
  const mock = row.mock
  const kind = event === 'autoApprove' ? '退货' : mock?.externalRefundKind
  if (!kind || !mock?.externalEventId || (event === 'autoRefund' && !mock.refundResultConsumed)) return
  const keepInfo = row.detail?.keepItemInfo
  if (event === 'autoApprove' && (mock.externalKeepOriginalItem !== false || keepInfo?.value === true || keepInfo?.source === 'conflict')) return
  const eventKey = JSON.stringify([event, mock.externalEventId])
  if (row.afterSaleExternalKey === eventKey && !newReceipt) return
  const fields = createReturnSaleDraft(row, mock.externalRequestId || eventKey)
  fields.reason = row.afterSaleEventReasons?.[eventKey] || (event === 'autoRefund' ? '平台退款' : '')
  if (validateSaleQuantity(row, fields)) return
  const known = afterSaleRecords.value.find(record => record.shopId === row.shopId && record.returnId === row.id && record.requestId === fields.requestId)
  if (known && known.kind !== kind) return
  if (event === 'autoApprove' && known?.actionLabel === '接受退货 · 无需寄回') return
  const input: AfterSaleInput = { ...saleBase(row, fields), kind, actionLabel: event === 'autoApprove' ? '平台自动批准退货' : '平台自动退款' }
  const doc = known || createPlatformAfterSale(input).record
  if (!doc) return
  row.afterSaleExternalKey = eventKey
  if (event === 'autoRefund') recordFunds(row, doc.no)
  else {
    doc.approvedReturnQty = doc.items.reduce((sum, item) => sum + item.quantity, 0)
    updateAfterSaleResult(doc.no, '平台已确认退货安排')
  }
}
/** 列表和详情使用同一回查；只更新明确关联的本笔业务。外部回执可独立补单，不回发平台。 */
export function syncReturnWithSales(row: ReturnRecord, now = new Date().toISOString()) {
  const pending = row.pendingAction, oldOutcome = row.outcome
  const event = row.mock?.externalEvent
  const eventPreviouslyRead = row.mock?.consumed
  const previouslyRead = row.mock?.refundResultConsumed
  const wasOpen = !isReturnClosed(row)
  const result = syncReturn(row, now)
  if (wasOpen && isReturnClosed(row)) captureReturnHandlers(row)
  if (result.status !== 'success') return result
  const submission = row.afterSaleSubmission
  if (submission && pending === submission.action && (oldOutcome === 'pending' || oldOutcome === 'unknown')) {
    if (row.outcome === 'confirmed') {
      if (pending === 'partial') row.afterSaleOfferNo = submission.no
      if (pending === 'refund') row.afterSaleRefundNo = submission.no
      if (pending === 'approve' || pending === 'offerReturn') {
        const doc = afterSaleRecords.value.find(r => r.no === submission.no)
        if (doc?.kind === '退货') doc.approvedReturnQty = row.keepItem ? 0 : doc.items.reduce((sum, item) => sum + item.quantity, 0)
      }
    }
    const outcome = row.outcome === 'failed' ? '平台明确失败' : row.outcome === 'unknown' ? '平台结果待核实' : pending === 'partial' ? '已报价，待买家决定' : pending === 'refund' ? '退款处理中' : row.keepItem ? '已确认无需寄回' : '已确认退货安排'
    updateAfterSaleResult(submission.no, outcome)
  }
  if (event && row.mock?.consumed) {
    if (!eventPreviouslyRead && (event === 'buyerAccept' || event === 'buyerDecline') && row.afterSaleOfferNo) {
      updateAfterSaleResult(row.afterSaleOfferNo, event === 'buyerAccept' ? '买家已接受报价，退款处理中' : '买家已拒绝报价')
      if (event === 'buyerAccept') row.afterSaleRefundNo = row.afterSaleOfferNo
    }
    if (event === 'autoApprove' || event === 'autoRefund') reconcilePlatformSale(row, event, !previouslyRead && !!row.mock.refundResultConsumed)
  }
  if (!previouslyRead && row.mock?.refundResultConsumed && event !== 'autoRefund') {
    const refunds = afterSaleRecords.value.filter(r => r.shopId === row.shopId && r.returnId === row.id && (r.kind === '全额退款' || r.kind === '部分退款'))
    // 一笔申请可多次报价或退款；遇到多笔，不以最近一次本地提交指针认领资金。
    const matched = row.mock.externalRequestId
      ? refunds.find(r => r.requestId === row.mock!.externalRequestId)
      : refunds.length === 1 && refunds[0]?.no === row.afterSaleRefundNo ? refunds[0] : undefined
    if (matched) recordFunds(row, matched.no)
  }
  return result
}
