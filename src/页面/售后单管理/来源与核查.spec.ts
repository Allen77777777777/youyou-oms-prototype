import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { resetReturnSession, returnSession } from '../eBay退换货申请/数据'
import { createReturnActionDraft, prepareReturnAction } from '../eBay退换货申请/模型'
import { createReturnSaleDraft, prepareDirectSale, submitReturnAndSale } from '../eBay退换货申请/售后联动'
import { 共享订单, 仓库执行记录 } from '../订单处理/演示会话'
import { 渠道会话 } from '../仓配管理/仓配会话'
import { activeAfterSaleActor, afterSaleActors, afterSaleFacts, afterSaleRecords, approveReship, createAfterSale } from './会话'
import { initializeAfterSaleDemo } from './演示数据'
import { refreshAfterSaleResult } from './来源与核查'
import { resolveAfterSaleSource } from './来源关联'

const now = '2026-11-04T03:00:00Z'
const orderSnapshot = JSON.stringify(共享订单.value), executionSnapshot = JSON.stringify(仓库执行记录.value), channelSnapshot = JSON.stringify(渠道会话.value)
function restore() {
  共享订单.value = JSON.parse(orderSnapshot); 仓库执行记录.value = JSON.parse(executionSnapshot); 渠道会话.value = JSON.parse(channelSnapshot)
  afterSaleRecords.value = []; activeAfterSaleActor.value = afterSaleActors[0]!; resetReturnSession()
}
beforeEach(() => { restore(); initializeAfterSaleDemo() })
afterEach(restore)
const reship = () => afterSaleRecords.value.find(record => record.kind === '重发')!

describe('售后单统一来源与主动核查', () => {
  it('来源省略订单号仍保持唯一申请关联及平台状态，不以不同店铺同号兜底', () => {
    const record = reship(), source = resolveAfterSaleSource(record).row!
    source.orderNo = ''
    expect(resolveAfterSaleSource(record)).toEqual({ row: source, issue: '' })
    expect(afterSaleFacts(record).platformState).toBe('退货已送达')
    expect(resolveAfterSaleSource({ ...record, shopId: 'other-shop' }).row).toBeUndefined()
    expect(resolveAfterSaleSource({ ...record, returnId: '' }).issue).toContain('缺失')
  })
  it('已知订单号冲突或来源身份重复均阻断，不取首条', () => {
    const record = reship(), source = resolveAfterSaleSource(record).row!
    source.orderNo = 'conflicting-order'
    expect(resolveAfterSaleSource(record).issue).toContain('冲突')
    source.orderNo = record.orderNo
    returnSession.records.push(JSON.parse(JSON.stringify(source)))
    expect(resolveAfterSaleSource(record).issue).toContain('重复')
    expect(afterSaleFacts(record).platformReadNote).toBe('来源申请待核实')
  })
  it.each(['summary', 'detail'] as const)('来源 %s 已标识身份冲突时不透传历史资料或执行核查', group => {
    const record = reship(), source = resolveAfterSaleSource(record).row!
    source.detail!.identityConflicts = { [group]: true }
    const before = JSON.stringify(source)
    expect(resolveAfterSaleSource(record).row).toBeUndefined()
    expect(resolveAfterSaleSource(record).issue).toContain('身份冲突')
    expect(afterSaleFacts(record).platformReadNote).toBe('来源申请待核实')
    expect(refreshAfterSaleResult(record, afterSaleActors[1], now).status).toBe('failed')
    expect(JSON.stringify(source)).toBe(before)
  })
  it('内容隐藏保持来源状态与核查身份，隐藏标识不被解析或刷新抹除', () => {
    const record = reship(), source = resolveAfterSaleSource(record).row!
    source.detail!.contentOnHold = true
    expect(resolveAfterSaleSource(record).row?.detail?.contentOnHold).toBe(true)
    refreshAfterSaleResult(record, afterSaleActors[1], now)
    expect(source.detail!.contentOnHold).toBe(true)
  })
  it('重复主动核查每次记录本人和原办理，不建重发单、不覆盖创建审核人', () => {
    const record = reship(), orderCount = 共享订单.value.length, recordCount = afterSaleRecords.value.length
    const createdBy = record.createdBy
    expect(refreshAfterSaleResult(record, afterSaleActors[1], now).status).toBe('success')
    refreshAfterSaleResult(record, afterSaleActors[1], '2026-11-04T03:01:00Z')
    const checks = record.logs!.filter(log => log.action === '刷新办理结果')
    expect(checks).toHaveLength(2)
    expect(checks[0]).toMatchObject({ operator: '客服01', at: now, result: '查询成功', content: expect.stringContaining(record.requestId) })
    expect(record.resultCheck).toMatchObject({ operator: '客服01', at: '2026-11-04T03:01:00Z', status: 'success' })
    expect(record.createdBy).toBe(createdBy); expect(record.reviewedBy).toBeUndefined()
    expect(record.approval).toBe('待审核'); expect(record.manualOrderNo).toBeUndefined()
    expect(afterSaleRecords.value).toHaveLength(recordCount); expect(共享订单.value).toHaveLength(orderCount)
  })
  it('执行时复验权限，拒绝不会读取来源、写日志或更改旧核查结果', () => {
    const record = reship(), source = resolveAfterSaleSource(record).row!, before = JSON.stringify([record, source])
    expect(refreshAfterSaleResult(record, { ...afterSaleActors[1]!, shopIds: [] }, now)).toMatchObject({ ok: false, status: 'failed' })
    expect(JSON.stringify([record, source])).toBe(before)
  })
  it.each(['已发货', '异常'] as const)('已审核重发核查使用当前 OMS %s 结果，与列表和详情一致', status => {
    const record = reship()
    expect(approveReship(record.no).ok).toBe(true)
    const order = 共享订单.value.find(row => row.systemOrderNo === record.manualOrderNo)!
    order.processingStatus = status
    const result = refreshAfterSaleResult(record, afterSaleActors[1], now)
    expect(result).toMatchObject({ status: status === '异常' ? 'unconfirmed' : 'success', message: expect.stringContaining('重发' + status) })
    expect(result.message).not.toContain('已创建手工订单')
    expect(record.logs!.slice(-1)[0]!.content).toContain('重发' + status)
  })
  it('显式核查人员与页面身份不同，重发结果按本次实际核查权限判定', () => {
    const record = reship()
    expect(approveReship(record.no).ok).toBe(true)
    const order = 共享订单.value.find(row => row.systemOrderNo === record.manualOrderNo)!
    order.processingStatus = '已发货'
    activeAfterSaleActor.value = { ...afterSaleActors[1]!, shopIds: [] }
    expect(refreshAfterSaleResult(record, afterSaleActors[0], now)).toMatchObject({ status: 'success', message: expect.stringContaining('重发已发货') })
    expect(record.resultCheck?.operator).toBe(afterSaleActors[0]!.name)
  })
  it('核查时来源身份冲突只记录本单失败，不读取另一订单或刷新来源时间', () => {
    const record = reship(), source = resolveAfterSaleSource(record).row!, priorAt = source.lastSyncedAt
    source.orderNo = 'another-order'
    const before = JSON.stringify(source)
    expect(refreshAfterSaleResult(record, afterSaleActors[1], now)).toMatchObject({ status: 'failed', message: expect.stringContaining('冲突') })
    expect(source.lastSyncedAt).toBe(priorAt)
    expect(JSON.stringify(source)).toBe(before)
    expect(record.logs!.slice(-1)[0]).toMatchObject({ action: '刷新办理结果', result: '查询失败', operator: '客服01' })
  })
  it.each(['all', 'tracking'] as const)('读取 %s 失败保留上次成功时间与已知实退，不把旧值冒充本次结果', failure => {
    const record = afterSaleRecords.value.find(row => row.kind === '全额退款')!, source = resolveAfterSaleSource(record).row!
    const priorAt = source.lastSyncedAt, amount = { ...record.actualAmount! }
    source.mock = { readFailure: failure }
    const result = refreshAfterSaleResult(record, afterSaleActors[1], now)
    expect(result).toMatchObject({ ok: false, status: 'failed', message: expect.stringContaining('上次成功读取') })
    expect(source.lastSyncedAt).toBe(priorAt)
    expect(record.actualAmount).toEqual(amount)
    expect(record.resultCheck).toMatchObject({ at: now, sourceSucceededAt: priorAt, status: 'failed' })
    expect(record.logs!.slice(-1)[0]).toMatchObject({ operator: '客服01', result: '查询失败' })
  })
  it('读取成功但本次提交仍未知时保持待核查，不新增提交尝试或实退', () => {
    const record = afterSaleRecords.value.find(row => row.kind === '部分退款')!, source = resolveAfterSaleSource(record).row!
    source.outcome = 'unknown'; source.pendingAction = 'partial'; source.mock = { resolve: 'unknown' }
    source.afterSaleSubmission = { no: record.no, requestId: record.requestId, action: 'partial' }
    const attempts = JSON.stringify(source.submissionAttempts)
    const result = refreshAfterSaleResult(record, afterSaleActors[1], now)
    expect(result.status).toBe('unconfirmed')
    expect(record.executionResult).toBe('平台结果待核实')
    expect(record.actualAmount).toBeUndefined()
    expect(JSON.stringify(source.submissionAttempts)).toBe(attempts)
    expect(record.logs!.slice(-1)[0]?.result).toBe('仍待核查')
  })
  it.each([false, true])('同申请两笔退款按独立办理凭据更新，不能把累计资金给当前单（有凭据 %s）', hasRequestId => {
    const source = returnSession.records.find(row => row.id === 'DEMO-RT-003')!
    const draft = createReturnActionDraft(source, 'refund')
    const prepared = prepareReturnAction(source, 'refund', draft, now).prepared!
    expect(prepared).toBeDefined()
    const input = prepareDirectSale(source, prepared, { ...createReturnSaleDraft(source), refundScope: '全额退款', reason: '质量问题' })
    const earlier = createAfterSale({ ...input, requestId: 'earlier-quote', kind: '部分退款', actionLabel: '部分退款报价' }).record!
    const submitted = submitReturnAndSale(source, prepared, input, now)
    const later = afterSaleRecords.value.find(record => record.no === submitted.no)!
    expect(later).toBeDefined()
    const attempts = source.submissionAttempts!.length, count = afterSaleRecords.value.length
    refreshAfterSaleResult(later, afterSaleActors[1], now)
    if (hasRequestId) source.mock!.externalRequestId = earlier.requestId
    refreshAfterSaleResult(later, afterSaleActors[1], '2026-11-04T03:01:00Z')
    expect(earlier.actualAmount?.value).toBe(hasRequestId ? '29.50' : undefined)
    expect(later.actualAmount).toBeUndefined()
    expect(source.submissionAttempts).toHaveLength(attempts)
    expect(afterSaleRecords.value).toHaveLength(count)
  })
})
