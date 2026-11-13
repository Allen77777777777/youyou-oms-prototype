import { describe, expect, it } from 'vitest'
import { createReturnData } from './数据'
import { applyIssueRefundResponse, applyReturnFull, createReturnActionDraft, getReturnBlockedReason, prepareReturnAction, submitPreparedReturnAction, validatePreparedReturnAction, type IssueRefundResponseContext, type PreparedReturnAction, type ReturnRecord } from './模型'

const now = '2026-11-13T01:00:00Z'
function createRefund() {
  const row = createReturnData()[2]!
  row.mock = {}
  const result = prepareReturnAction(row, 'refund', createReturnActionDraft(row, 'refund'), now)
  expect(result.error).toBe('')
  return { row, prepared: result.prepared! }
}
function startRefund() {
  const result = createRefund()
  expect(submitPreparedReturnAction(result.row, result.prepared, now)).toBe('')
  return result
}
function context(row: ReturnRecord): IssueRefundResponseContext {
  return { shopId: row.shopId, returnId: row.id, submissionId: row.lastSubmission!.id, httpStatus: 200, request: structuredClone(row.lastSubmission!.requestSnapshot!) }
}
function recalculateIntegrity(prepared: PreparedReturnAction) {
  prepared.integrity = JSON.stringify([prepared.confirmationId, prepared.action, prepared.request, prepared.draft, prepared.identity, prepared.sourceSignature, prepared.preparedAt])
}

describe('退货提交确认防重与保存失败', () => {
  it('同一确认重复提交返回原尝试，不重放或增加日志', () => {
    const { row, prepared } = startRefund(), original = structuredClone(row)
    expect(validatePreparedReturnAction(row, prepared, '2026-11-13T01:01:00Z')).toBe('')
    expect(submitPreparedReturnAction(row, structuredClone(prepared), '2026-11-13T01:01:00Z')).toBe('')
    expect(row).toEqual(original)
    expect(row.submissionAttempts).toHaveLength(1)
    expect(row.lastSubmission).toMatchObject({ confirmationId: prepared.confirmationId, confirmationIntegrity: prepared.integrity, identity: prepared.identity, requestSnapshot: prepared.request, submittedAt: now, outcome: 'pending' })
  })
  it('已消费的确认标识不能换内容，即使重新计算摘要也拒绝', () => {
    const { row, prepared } = startRefund(), changed = structuredClone(prepared), before = structuredClone(row)
    changed.request.body.comments = { content: 'Changed' }; changed.draft.text = 'Changed'
    recalculateIntegrity(changed)
    expect(submitPreparedReturnAction(row, changed)).toContain('此确认已用于其他提交内容')
    expect(row).toEqual(before)
  })
  it('确认编号或时间被修改且未重新确认时拒绝', () => {
    const { row, prepared } = createRefund()
    for (const field of ['confirmationId', 'preparedAt'] as const) {
      const changed = structuredClone(prepared); changed[field] = 'OTHER'
      expect(submitPreparedReturnAction(row, changed)).toContain('确认内容已变化')
    }
    expect(row.lastSubmission).toBeUndefined()
  })
  it('保存失败没有发送、日志或尝试副作用，恢复后原确认只保存一次', () => {
    const { row, prepared } = createRefund()
    row.mock = { saveFailure: true, submit: 'failed' }
    row.afterSaleSubmission = { no: 'AS-EXISTING', requestId: 'ORIGINAL', action: 'refund' }
    const before = structuredClone(row)
    expect(validatePreparedReturnAction(row, prepared, now)).toContain('执行记录保存失败，未发送')
    expect(submitPreparedReturnAction(row, prepared, now)).toContain('执行记录保存失败，未发送')
    expect(row).toEqual(before)
    row.mock.saveFailure = false
    expect(submitPreparedReturnAction(row, prepared, now)).toBe('')
    expect(row.submissionAttempts).toHaveLength(1)
    expect(row.outcome).toBe('failed')
  })
  it('明确失败后必须新确认，旧尝试保留，新执行另有编号', () => {
    const { row, prepared } = createRefund(); row.mock = { submit: 'failed' }
    expect(submitPreparedReturnAction(row, prepared, now)).toBe('')
    const failedId = row.lastSubmission!.id
    expect(submitPreparedReturnAction(row, prepared, now)).toBe('')
    expect(row.submissionAttempts).toHaveLength(1)
    expect(row.outcome).toBe('failed')
    const next = prepareReturnAction(row, 'refund', createReturnActionDraft(row, 'refund'), now).prepared!
    expect(next.confirmationId).not.toBe(prepared.confirmationId)
    expect(submitPreparedReturnAction(row, next, now)).toBe('')
    expect(row.submissionAttempts).toHaveLength(2)
    expect(row.submissionAttempts![0]).toMatchObject({ id: failedId, outcome: 'failed' })
    expect(row.lastSubmission!.id).not.toBe(failedId)
    expect(row.outcome).toBe('pending')
  })
})

describe('可信 issue_refund SUCCESS 与独立实际金额', () => {
  it('直接SUCCESS保存尝试资金证据，不生成金额、关闭事实或平台历史', () => {
    const { row, prepared } = createRefund()
    row.mock = { issueRefundResponse: { refundStatus: 'SUCCESS' } }
    const original = { state: row.state, status: row.status, refund: structuredClone(row.detail!.refund), actual: row.actualRefund, history: structuredClone(row.history) }
    expect(submitPreparedReturnAction(row, prepared, now)).toBe('')
    expect(row.outcome).toBe('confirmed'); expect(row.pendingAction).toBeNull()
    expect(row.refundEvidence).toEqual([{ shopId: row.shopId, returnId: row.id, submissionId: row.lastSubmission!.id, status: 'SUCCESS', observedAt: now, source: 'issue_refund' }])
    expect(row.detail!.refund).toEqual(original.refund)
    expect(row.actualRefund).toBe(original.actual)
    expect({ state: row.state, status: row.status, history: row.history }).toEqual({ state: original.state, status: original.status, history: original.history })
    expect(row.logs.some(log => log.result === '退款成功，实际金额待核实')).toBe(true)
    expect(getReturnBlockedReason(row, 'refund', now)).not.toBe('')
    const before = structuredClone(row)
    expect(submitPreparedReturnAction(row, prepared, now)).toBe('')
    expect(row).toEqual(before)
  })
  it('旧FULL没有SUCCESS也不能清除已确认资金防重；重复和迟到未知不降格', () => {
    const { row } = startRefund(), bound = context(row)
    expect(applyIssueRefundResponse(row, { refundStatus: 'SUCCESS' }, bound, now).outcome).toBe('confirmed')
    const logCount = row.logs.length
    applyReturnFull(row, { detail: { refundInfo: { actualRefundDetail: { refundStatus: 'PENDING' } } } }, '2026-11-13T01:02:00Z')
    expect(row.detail!.refund.status).toBe('PENDING')
    expect(row.refundEvidence).toHaveLength(1)
    expect(getReturnBlockedReason(row, 'refund', now)).not.toBe('')
    expect(applyIssueRefundResponse(row, { refundStatus: 'UNKNOWN' }, bound, '2026-11-13T01:03:00Z').outcome).toBe('confirmed')
    expect(applyIssueRefundResponse(row, { refundStatus: 'SUCCESS' }, bound, '2026-11-13T01:04:00Z').outcome).toBe('confirmed')
    expect(row.outcome).toBe('confirmed')
    expect(row.refundEvidence![0]!.observedAt).toBe(now)
    expect(row.logs).toHaveLength(logCount)
  })
  it.each(['shop', 'return', 'attempt', 'request', 'copiedShop'] as const)('%s身份不匹配时不确认资金', kind => {
    const { row } = startRefund(), bound = context(row)
    if (kind === 'shop') bound.shopId = 'OTHER'
    if (kind === 'return') bound.returnId = 'OTHER'
    if (kind === 'attempt') bound.submissionId = 'OTHER'
    if (kind === 'request') bound.request.body.comments = { content: 'OTHER' }
    if (kind === 'copiedShop') { row.shopId = 'OTHER'; bound.shopId = 'OTHER' }
    const before = structuredClone(row)
    expect(applyIssueRefundResponse(row, { refundStatus: 'SUCCESS' }, bound, now).outcome).toBe('unknown')
    expect(row).toEqual(before)
  })
  it.each([
    ['服务器错误', 500, { refundStatus: 'SUCCESS' }],
    ['混合错误', 200, { refundStatus: 'SUCCESS', errors: [{ errorId: 'EXAMPLE' }] }],
    ['缺失状态', 200, {}], ['未知状态', 200, { refundStatus: 'FUTURE' }], ['明确资金失败', 200, { refundStatus: 'FAILED' }],
  ])('%s不产生成功证据，也不授权重发', (_name, httpStatus, payload) => {
    const { row } = startRefund(), bound = { ...context(row), httpStatus: httpStatus as number }
    expect(applyIssueRefundResponse(row, payload, bound, now).outcome).toBe('unknown')
    expect(row.refundEvidence).toBeUndefined()
    expect(row.outcome).toBe('unknown')
    expect(getReturnBlockedReason(row, 'refund', now)).toContain('待核查')
  })
  it.each(['PENDING', 'REQUESTED'])('%s只保留办理中，不写成功或实际金额', refundStatus => {
    const { row } = startRefund(), actual = structuredClone(row.detail!.refund)
    expect(applyIssueRefundResponse(row, { refundStatus }, context(row), now).outcome).toBe('pending')
    expect(row.refundEvidence).toBeUndefined()
    expect(row.detail!.refund).toEqual(actual)
    expect(row.outcome).toBe('pending')
  })
  it('原退款迟到成功只确认原尝试，不覆盖另一笔当前办理', () => {
    const { row } = startRefund(), bound = context(row), first = row.lastSubmission!
    row.lastSubmission = { id: 'NEWER-ATTEMPT', operator: '客服演示', action: '发送消息', outcome: 'pending' }
    row.submissionAttempts!.push(row.lastSubmission)
    row.pendingAction = 'message'; row.pendingText = 'New message'; row.outcome = 'pending'
    expect(applyIssueRefundResponse(row, { refundStatus: 'SUCCESS' }, bound, now).outcome).toBe('confirmed')
    expect(first.outcome).toBe('confirmed')
    expect(row.lastSubmission.id).toBe('NEWER-ATTEMPT')
    expect(row.outcome).toBe('pending'); expect(row.pendingAction).toBe('message'); expect(row.pendingText).toBe('New message')
    expect(row.logs[row.logs.length - 1]?.submissionId).toBe(first.id)
  })
})
