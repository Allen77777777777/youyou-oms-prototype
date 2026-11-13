import { beforeEach, describe, expect, it } from 'vitest'
import { activeAfterSaleActor, afterSaleActors, afterSaleRecords } from '../售后单管理/会话'
import { afterSaleFailureSummary } from '../售后单管理/失败原因'
import { createReturnData } from './数据'
import { initializeReturnDemoContext } from './关联资料'
import { applyIssueRefundResponse, createReturnActionDraft, prepareReturnAction, type ReturnAction, type ReturnRecord } from './模型'
import { createCorrectedReturnSaleDraft, createReturnSaleDraft, prepareDirectSale, submitReturnAndSale, syncReturnWithSales } from './售后联动'
import { resolveReturnBuyerReply } from './售后回执证据'

const now = '2026-11-04T03:00:00Z'
function submit(row: ReturnRecord, action: ReturnAction) {
  const draft = createReturnActionDraft(row, action)
  draft.text = 'Message to buyer'
  if (action === 'partial') draft.partialAmount = '10.00'
  const result = prepareReturnAction(row, action, draft, now)
  expect(result.error).toBe('')
  const prepared = result.prepared!
  const fields = { ...createReturnSaleDraft(row), refundScope: '全额退款' as const, reason: '破损', note: '核实依据' }
  const input = prepareDirectSale(row, prepared, fields)
  const submitted = submitReturnAndSale(row, prepared, input, now)
  expect(submitted.error).toBe('')
  return afterSaleRecords.value.find(record => record.no === submitted.no)!
}
function context(row: ReturnRecord) {
  const attempt = row.lastSubmission!
  return { shopId: row.shopId, returnId: row.id, submissionId: attempt.id, httpStatus: 200, request: attempt.requestSnapshot! }
}
function twoQuotes() {
  const row = createReturnData()[0]!
  row.mock = {}
  const first = submit(row, 'partial')
  syncReturnWithSales(row, now)
  row.mock = { externalEvent: 'buyerDecline', externalEventId: 'reply-A', externalRequestId: first.requestId }
  syncReturnWithSales(row, now)
  const second = submit(row, 'partial')
  syncReturnWithSales(row, now)
  return { row, first, second }
}
beforeEach(() => {
  activeAfterSaleActor.value = afterSaleActors[0]!
  afterSaleRecords.value = []
  initializeReturnDemoContext()
})

describe('售后回执始终归原办理', () => {
  it('未知退款迟到成功即时回填，FULL读取失败仍可补可靠成功，不补造实退金额', () => {
    const row = createReturnData()[2]!
    row.mock = { submit: 'unknown' }
    const doc = submit(row, 'refund'), bound = context(row)
    expect(afterSaleFailureSummary(doc, [row])).toContain('尚未确认')
    expect(applyIssueRefundResponse(row, { refundStatus: 'SUCCESS' }, bound, now).outcome).toBe('confirmed')
    expect(doc.executionResult).toBe('平台已确认退款，实退金额待核实')
    expect(doc.actualAmount).toBeUndefined()
    expect(afterSaleFailureSummary(doc, [row])).toBe('')
    const count = doc.logs!.length
    applyIssueRefundResponse(row, { refundStatus: 'SUCCESS' }, bound, now)
    expect(doc.logs).toHaveLength(count)
    doc.executionResult = '平台结果待核实'
    row.mock.readFailure = 'all'
    expect(syncReturnWithSales(row, now).status).toBe('failed')
    expect(doc.executionResult).toBe('平台已确认退款，实退金额待核实')
  })
  it('原退款迟到成功只回填原售后单，不覆盖另一笔当前消息尝试', () => {
    const row = createReturnData()[2]!
    row.mock = { submit: 'unknown' }
    const doc = submit(row, 'refund'), bound = context(row)
    row.lastSubmission = { id: 'new-message', action: '发送消息', operator: '客服02', outcome: 'pending' }
    row.submissionAttempts!.push(row.lastSubmission)
    row.pendingAction = 'message'; row.outcome = 'pending'; row.afterSaleSubmission = undefined
    applyIssueRefundResponse(row, { refundStatus: 'SUCCESS' }, bound, now)
    expect(doc.executionResult).toContain('平台已确认退款')
    expect(row.lastSubmission).toMatchObject({ id: 'new-message', outcome: 'pending' })
    expect(row.pendingAction).toBe('message')
  })
  it.each(['PENDING', 'FAILED'] as const)('同笔可靠SUCCESS及实退金额不被迟到%s资金资料或受理状态降格', status => {
    const row = createReturnData()[2]!, doc = submit(row, 'refund'), bound = context(row)
    syncReturnWithSales(row, now); syncReturnWithSales(row, now)
    expect(doc.actualAmount?.value).toBe('29.50')
    applyIssueRefundResponse(row, { refundStatus: 'SUCCESS' }, bound, now)
    row.mock = { refundResult: { status, sellerActual: null, buyerActual: null, actualItems: [], issuedAt: null, initiator: 'SELLER_INITIATED', state: 'REFUND_INITIATED', returnStatus: 'RETURN_REQUESTED' } }
    row.detail!.refund.status = 'PENDING'
    syncReturnWithSales(row, now)
    expect(doc).toMatchObject({ executionResult: '平台退款成功', actualAmount: { value: '29.50', currency: 'USD' } })
    row.outcome = 'pending'; row.pendingAction = 'refund'
    syncReturnWithSales(row, now)
    expect(doc.executionResult).toBe('平台退款成功')
    expect(doc.actualAmount?.value).toBe('29.50')
  })
  it('旧报价重复拒绝不改新报价、不倒退当前申请阶段、不重复写结果日志', () => {
    const { row, first, second } = twoQuotes()
    const counts = [first.logs!.length, second.logs!.length, row.history.length]
    row.mock = { externalEvent: 'buyerDecline', externalEventId: 'reply-A', externalRequestId: first.requestId }
    syncReturnWithSales(row, now)
    expect(first.executionResult).toBe('买家已拒绝报价')
    expect(second.executionResult).toBe('已报价，待买家决定')
    expect(row.state).toBe('PARTIAL_REFUND_REQUESTED')
    expect([first.logs!.length, second.logs!.length, row.history.length]).toEqual(counts)
  })
  it('多次报价无本笔标识保持待核查，补齐B标识后只更新B', () => {
    const { row, first, second } = twoQuotes()
    row.mock = { externalEvent: 'buyerAccept', externalEventId: 'reply-B' }
    syncReturnWithSales(row, now)
    expect(second.executionResult).toBe('已报价，待买家决定')
    expect(row.state).toBe('PARTIAL_REFUND_REQUESTED')
    expect(row.mock.consumed).toBe(false)
    row.mock.externalRequestId = second.requestId
    syncReturnWithSales(row, now)
    expect(first.executionResult).toBe('买家已拒绝报价')
    expect(second.executionResult).toBe('买家已接受报价，退款处理中')
    expect(row.afterSaleRefundNo).toBe(second.no)
  })
  it('已经接受且退款成功的报价不被矛盾拒绝或重复接受回退，也不清实退金额', () => {
    const row = createReturnData()[0]!, doc = submit(row, 'partial')
    syncReturnWithSales(row, now)
    row.mock = { externalEvent: 'buyerAccept', externalRequestId: doc.requestId }
    syncReturnWithSales(row, now)
    doc.executionResult = '平台退款成功'; doc.actualAmount = { value: '10.00', currency: 'USD' }
    row.mock = { externalEvent: 'buyerDecline', externalRequestId: doc.requestId }
    syncReturnWithSales(row, now)
    expect(row.state).toBe('PARTIAL_REFUND_INITIATED')
    expect(doc).toMatchObject({ executionResult: '平台退款成功', actualAmount: { value: '10.00', currency: 'USD' } })
    expect(row.logs.some(log => log.result === '回复冲突')).toBe(true)
  })
  it.each(['pending', 'unknown'] as const)('新报价为%s时，已确认的旧报价不能再视为当前报价', outcome => {
    const { row, first, second } = twoQuotes()
    row.lastSubmission!.outcome = outcome
    row.outcome = outcome; row.pendingAction = 'partial'
    row.mock = { externalEvent: 'buyerAccept', externalRequestId: first.requestId, resolve: 'unknown' }
    expect(resolveReturnBuyerReply(row)).toMatchObject({ requestId: first.requestId, current: false })
    if (outcome === 'unknown') {
      syncReturnWithSales(row, now)
      expect(row.outcome).toBe('unknown')
      expect(row.pendingAction).toBe('partial')
      expect(second.executionResult).toBe('平台结果待核实')
    }
  })
  it('报价后的申请已关闭且资金成功，迟到买家接受仅补原报价证据，不倒退来源终态', () => {
    const row = createReturnData()[0]!, doc = submit(row, 'partial')
    syncReturnWithSales(row, now)
    row.state = 'CLOSED'; row.status = 'CLOSED'; row.detail!.refund.status = 'SUCCESS'
    row.mock = { externalEvent: 'buyerAccept', externalRequestId: doc.requestId }
    syncReturnWithSales(row, now)
    expect(row.afterSaleBuyerReplies?.[0]).toMatchObject({ requestId: doc.requestId, decision: 'accepted' })
    expect([row.state, row.status, row.detail!.refund.status]).toEqual(['CLOSED', 'CLOSED', 'SUCCESS'])
  })
})

describe('明确失败后重试与更正分开', () => {
  it('更正金额创建新单，原失败单、原尝试和本次错误分别保留，重复提交不重建', () => {
    const row = createReturnData()[0]!
    row.mock = { submit: 'failed', error: '报价已过期，请核对后重新办理' }
    const original = submit(row, 'partial')
    expect(afterSaleFailureSummary(original, [row])).toBe('报价已过期，请核对后重新办理')
    const fields = createCorrectedReturnSaleDraft(row, 'partial')!
    expect(fields.requestId).not.toBe(original.requestId)
    const draft = { ...row.pendingDraft!, partialAmount: '9.00' }
    const prepared = prepareReturnAction(row, 'partial', draft, now).prepared!
    const input = prepareDirectSale(row, prepared, fields)
    const created = submitReturnAndSale(row, prepared, input, now)
    expect(created.error).toBe('')
    expect(created.no).not.toBe(original.no)
    expect(afterSaleRecords.value).toHaveLength(2)
    expect(row.submissionAttempts).toHaveLength(2)
    expect(original.amount?.value).toBe('10.00')
    expect(original.executionResult).toBe('平台提交失败')
    expect(afterSaleFailureSummary(original, [row])).toBe('报价已过期，请核对后重新办理')
    expect(submitReturnAndSale(row, prepared, input, now)).toEqual(created)
    expect(row.submissionAttempts).toHaveLength(2)
  })
  it('原请求重试不允许偷改对客正文或金额，提示切换更正后新办理', () => {
    const row = createReturnData()[0]!
    row.mock = { submit: 'failed' }
    submit(row, 'partial')
    const fields = createReturnSaleDraft(row, undefined, 'partial')
    for (const changed of [{ partialAmount: '9.00' }, { text: 'Corrected message' }]) {
      const prepared = prepareReturnAction(row, 'partial', { ...row.pendingDraft!, ...changed }, now).prepared!
      expect(submitReturnAndSale(row, prepared, prepareDirectSale(row, prepared, fields), now).error).toContain('更正后新办理')
    }
    expect(afterSaleRecords.value).toHaveLength(1)
    expect(row.submissionAttempts).toHaveLength(1)
  })
  it.each(['pending', 'unknown'] as const)('%s不能通过更正入口取得新业务或提交新请求', outcome => {
    const row = createReturnData()[0]!
    row.mock = { submit: outcome === 'unknown' ? 'unknown' : 'accepted' }
    submit(row, 'partial')
    expect(createCorrectedReturnSaleDraft(row, 'partial')).toBeUndefined()
    expect(prepareReturnAction(row, 'partial', { ...row.pendingDraft!, partialAmount: '9.00' }, now).prepared).toBeUndefined()
    expect(afterSaleRecords.value).toHaveLength(1)
  })
})
