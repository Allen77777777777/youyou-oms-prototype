import { beforeEach, describe, expect, it } from 'vitest'
import { afterSaleActors, afterSaleRecords, activeAfterSaleActor, createAfterSale, recordsForReturn } from '../售后单管理/会话'
import { createReturnData, syncReturnList } from './数据'
import { initializeReturnDemoContext } from './关联资料'
import { createReturnActionDraft, prepareReturnAction, submitPreparedReturnAction, type ReturnAction, type ReturnRecord } from './模型'
import { createReturnSaleDraft, prepareDirectSale, submitReturnAndSale, syncReturnWithSales } from './售后联动'

const now = '2026-11-04T03:00:00Z'
function prepare(row: ReturnRecord, action: ReturnAction, refundScope: '全额退款' | '部分退款' = '全额退款') {
  const draft = createReturnActionDraft(row, action)
  draft.text = 'Message to buyer'
  if (action === 'partial') draft.partialAmount = '10.00'
  const result = prepareReturnAction(row, action, draft, now)
  expect(result.error).toBe('')
  const prepared = result.prepared!
  const fields = { ...createReturnSaleDraft(row), refundScope, reason: '破损', note: '客服内部核实依据' }
  return { prepared, input: prepareDirectSale(row, prepared, fields) }
}
beforeEach(() => {
  activeAfterSaleActor.value = afterSaleActors[0]!
  afterSaleRecords.value = []
  initializeReturnDemoContext()
})

describe('退货申请与售后单按本次办理联动', () => {
  it('免寄回使用原平台请求防重，未知回执不会改写同申请的历史退货单', () => {
    const row = createReturnData()[0]!, { input } = prepare(row, 'approve')
    const prior = createAfterSale(input).record!
    prior.approvedReturnQty = 1
    prior.executionResult = '已确认退货安排'
    row.afterSaleSubmission = { no: prior.no, requestId: prior.requestId, action: 'approve' }
    const draft = createReturnActionDraft(row, 'approve')
    draft.keepOriginalItem = true
    draft.text = 'Keep the product.'
    const prepared = prepareReturnAction(row, 'approve', draft, now).prepared!
    expect(() => prepareDirectSale(row, prepared, createReturnSaleDraft(row))).toThrow('无需创建售后单')
    expect(submitReturnAndSale(row, prepared, input, now).error).toBeTruthy()
    row.mock = { submit: 'unknown' }
    expect(submitPreparedReturnAction(row, prepared, now)).toBe('')
    expect(row.afterSaleSubmission).toBeUndefined()
    expect(submitPreparedReturnAction(row, prepared, now)).toContain('待核查')
    syncReturnWithSales(row, now)
    expect(row.outcome).toBe('unknown')
    row.mock.resolve = 'success'
    syncReturnWithSales(row, now)
    expect(row.state).toBe('ITEM_KEPT')
    expect(afterSaleRecords.value).toHaveLength(1)
    expect(prior).toMatchObject({ executionResult: '已确认退货安排', approvedReturnQty: 1 })
  })
  it.each([true, undefined])('平台自动批准的保留商品值为 %s 时只保留办理事实，不补退货单', keep => {
    const row = createReturnData()[17]!
    row.mock!.externalKeepOriginalItem = keep
    syncReturnWithSales(row, now)
    syncReturnWithSales(row, now)
    expect(row.mock?.consumed).toBe(true)
    expect(row.history.filter(entry => entry.activity === 'EBAY_RULE_AUTO_APPROVE')).toHaveLength(1)
    expect(afterSaleRecords.value).toHaveLength(0)
    if (keep) expect(row.state).toBe('ITEM_KEPT')
  })
  it('发起全额退款直接建单，本次确认的金额与独立资金结果分开', () => {
    const row = createReturnData()[2]!
    const { prepared, input } = prepare(row, 'refund')
    expect(submitReturnAndSale(row, prepared, input, now).error).toBe('')
    const doc = recordsForReturn(row.shopId, row.id)[0]!
    expect(doc).toMatchObject({ kind: '全额退款', approval: null, note: '客服内部核实依据', platformReason: row.reason, amount: { value: '29.50', currency: 'USD' } })
    expect(doc.items[0]?.reason).toBe('破损')
    expect(JSON.stringify(row.pendingRequest)).not.toMatch(/客服内部核实依据|破损|售后单/)
    syncReturnWithSales(row, now)
    expect(doc.executionResult).toBe('退款处理中')
    expect(doc.actualAmount).toBeUndefined()
    syncReturnWithSales(row, now)
    expect(doc.actualAmount).toEqual({ value: '29.50', currency: 'USD' })
  })
  it.each(['buyerAccept', 'buyerDecline'] as const)('报价及买家回复 %s 持续更新同一售后单，未收到资金证据不计退款', event => {
    const row = createReturnData()[0]!, { prepared, input } = prepare(row, 'partial')
    submitReturnAndSale(row, prepared, input, now)
    const doc = afterSaleRecords.value[0]!
    expect(doc).toMatchObject({ kind: '部分退款', approval: null, actionLabel: '部分退款报价' })
    syncReturnWithSales(row, now)
    expect(doc.executionResult).toBe('已报价，待买家决定')
    row.mock = { externalEvent: event }
    syncReturnWithSales(row, now)
    expect(doc.executionResult).toBe(event === 'buyerAccept' ? '买家已接受报价，退款处理中' : '买家已拒绝报价')
    expect(doc.actualAmount).toBeUndefined()
    if (event === 'buyerAccept') {
      row.mock.refundResult = {
        status: 'SUCCESS', sellerActual: null, buyerActual: { value: '30.00', currency: 'USD' },
        actualTotal: { value: '10.00', currency: 'USD' }, actualItems: [{ refundFeeType: 'PURCHASE_PRICE', amount: { value: '10.00', currency: 'USD' } }],
        issuedAt: now, initiator: 'SELLER_INITIATED', state: 'PARTIAL_REFUNDED', returnStatus: 'LESS_THAN_A_FULL_REFUND_ISSUED',
      }
      syncReturnWithSales(row, now)
      expect(doc.actualAmount?.value).toBe('10.00')
    }
    expect(afterSaleRecords.value).toHaveLength(1)
  })
  it('本次必退商品价款低于已核实上限时，即便草稿残留全额选择也按部分登记', () => {
    const row = createReturnData()[2]!, price = row.detail!.refund.items.find(i => i.refundFeeType === 'PURCHASE_PRICE')!
    price.min = '1.00'
    const draft = createReturnActionDraft(row, 'refund')
    draft.refundItems[0]!.value = '1.00'
    const { prepared } = prepareReturnAction(row, 'refund', draft, now)
    expect(prepared).toBeDefined()
    const input = prepareDirectSale(row, prepared!, { ...createReturnSaleDraft(row), reason: '退差价', refundScope: '全额退款' })
    expect(input.kind).toBe('部分退款')
    expect(submitReturnAndSale(row, prepared!, { ...input, kind: '全额退款' }, now).error).toContain('金额')
    expect(afterSaleRecords.value).toHaveLength(0)
    expect(submitReturnAndSale(row, prepared!, input, now).error).toBe('')
  })
  it('报价明确失败后，后续买家活动不归到失败的售后单', () => {
    const row = createReturnData()[0]!, { prepared, input } = prepare(row, 'partial')
    row.mock = { submit: 'unknown', resolve: 'failed' }
    submitReturnAndSale(row, prepared, input, now)
    syncReturnWithSales(row, now)
    row.mock = { externalEvent: 'buyerAccept' }
    syncReturnWithSales(row, now)
    expect(afterSaleRecords.value[0]?.executionResult).toBe('平台明确失败')
    expect(row.afterSaleRefundNo).toBeUndefined()
  })
  it.each([false, true])('同申请两笔资金处理仅按明确关联归属实退（有本笔标识 %s）', hasRequestId => {
    const row = createReturnData()[2]!, { prepared, input } = prepare(row, 'refund')
    const earlier = createAfterSale({ ...input, requestId: 'earlier-offer', kind: '部分退款', actionLabel: '部分退款报价' }).record!
    const later = submitReturnAndSale(row, prepared, input, now)
    expect(later.no).toBeTruthy()
    syncReturnWithSales(row, now)
    expect(row.afterSaleRefundNo).toBe(later.no)
    if (hasRequestId) row.mock!.externalRequestId = earlier.requestId
    syncReturnWithSales(row, now)
    expect(earlier.actualAmount?.value).toBe(hasRequestId ? '29.50' : undefined)
    expect(afterSaleRecords.value.find(r => r.no === later.no)?.actualAmount).toBeUndefined()
  })
  it('接受退货直接建单；重放首次确认返回原单，内容冲突和来源过期都不会再次写平台', () => {
    const row = createReturnData()[0]!, { prepared, input } = prepare(row, 'approve')
    const first = submitReturnAndSale(row, prepared, input, now)
    expect(afterSaleRecords.value[0]).toMatchObject({ no: first.no, kind: '退货', approval: null })
    const writes = row.logs.length
    row.afterSaleSubmission = undefined
    expect(submitReturnAndSale(row, prepared, input, now)).toEqual(first)
    expect(submitReturnAndSale(row, prepared, { ...input, note: '冲突说明' }, now).error).toContain('内容不同')
    const stale = submitReturnAndSale(row, prepared, { ...input, requestId: 'another-attempt' }, now)
    expect(stale.error).toBeTruthy()
    expect(row.logs).toHaveLength(writes)
    expect(afterSaleRecords.value).toHaveLength(1)
  })
  it('当前账号无店铺权限或联填数量不合法，均在写平台前阻断', () => {
    const row = createReturnData()[0]!, { prepared, input } = prepare(row, 'approve')
    activeAfterSaleActor.value = { ...afterSaleActors[1]!, shopIds: [] }
    expect(submitReturnAndSale(row, prepared, input, now).error).toContain('权限')
    activeAfterSaleActor.value = afterSaleActors[1]!
    input.items[0]!.quantity = 99
    expect(submitReturnAndSale(row, prepared, input, now).error).toBeTruthy()
    expect(row.outcome).toBe('idle')
    expect(afterSaleRecords.value).toHaveLength(0)
  })
  it('列表同步按明确活动登记自动退货及自动退款，重放来源不会另建', () => {
    const rows = createReturnData(), auto = rows[17]!, refund = rows[19]!
    syncReturnList([auto, refund], [auto.shopId], now)
    expect(recordsForReturn(auto.shopId, auto.id)[0]).toMatchObject({ kind: '退货', source: '平台同步', approval: null })
    expect(recordsForReturn(refund.shopId, refund.id)[0]).toMatchObject({ kind: '全额退款', source: '平台同步', approval: null, actualAmount: { value: '49.90', currency: 'USD' } })
    syncReturnWithSales(createReturnData()[19]!, now)
    expect(afterSaleRecords.value).toHaveLength(2)
    expect(refund.pendingRequest).toBeFalsy()
  })
  it('外部退货没有已核实的内部原因时只保留平台事实；补全该事件归类后登记同一次办理', () => {
    const row = createReturnData()[17]!
    row.afterSaleEventReasons = {}
    syncReturnWithSales(row, now)
    expect(row.mock?.consumed).toBe(true)
    expect(afterSaleRecords.value).toHaveLength(0)
    row.afterSaleEventReasons[JSON.stringify(['autoApprove', row.mock!.externalEventId])] = '不合适'
    syncReturnWithSales(row, now)
    syncReturnWithSales(row, now)
    expect(afterSaleRecords.value).toHaveLength(1)
    expect(afterSaleRecords.value[0]?.items[0]?.reason).toBe('不合适')
  })
  it('同一自动退款的来源修订，仅剩成功状态与累计资金时清除上次确认的单笔金额', () => {
    const row = createReturnData()[19]!
    syncReturnWithSales(row, now)
    expect(afterSaleRecords.value[0]?.actualAmount?.value).toBe('49.90')
    Object.assign(row.mock!.refundResult!, { actualItems: [], actualTotal: null, buyerActual: { value: '99.00', currency: 'USD' } })
    Object.assign(row.mock!, { consumed: false, refundResultConsumed: false })
    syncReturnWithSales(row, now)
    expect(afterSaleRecords.value).toHaveLength(1)
    expect(afterSaleRecords.value[0]?.actualAmount).toBeUndefined()
    expect(afterSaleRecords.value[0]?.executionResult).toContain('金额待核实')
  })
  it('外部退款先收到自动活动、随后才取得独立资金结果时，补记同一笔并支持再次核查', () => {
    const row = createReturnData()[19]!, receipt = row.mock!.refundResult
    delete row.mock!.refundResult
    syncReturnWithSales(row, now)
    expect(afterSaleRecords.value).toHaveLength(0)
    row.mock!.refundResult = receipt
    syncReturnWithSales(row, now)
    syncReturnWithSales(row, now)
    expect(afterSaleRecords.value).toHaveLength(1)
    expect(afterSaleRecords.value[0]?.actualAmount?.value).toBe('49.90')
  })
  it('已知同一次办理标识先校验类型，冲突时不重复补单，来源更正后关联原单', () => {
    const row = createReturnData()[2]!, { prepared, input } = prepare(row, 'refund')
    submitReturnAndSale(row, prepared, input, now)
    syncReturnWithSales(row, now)
    Object.assign(row.mock!, { externalEvent: 'autoRefund', externalEventId: 'platform-correlation', externalRequestId: input.requestId, externalRefundKind: '部分退款' })
    syncReturnWithSales(row, now)
    expect(afterSaleRecords.value[0]?.actualAmount).toBeUndefined()
    expect(afterSaleRecords.value).toHaveLength(1)
    row.mock!.externalRefundKind = '全额退款'
    syncReturnWithSales(row, now)
    expect(afterSaleRecords.value).toHaveLength(1)
    expect(afterSaleRecords.value[0]?.actualAmount?.value).toBe('29.50')
  })
  it.each(['externalEventId', 'externalRefundKind'] as const)('外部退款缺少 %s 时不把来源总额补记成本次金额', key => {
    const row = createReturnData()[19]!
    delete row.mock![key]
    syncReturnWithSales(row, now)
    expect(row.detail?.refund.status).toBe('SUCCESS')
    expect(afterSaleRecords.value).toHaveLength(0)
    Object.assign(row.mock!, { externalEventId: 'DEMO-REFUND-020', externalRefundKind: '全额退款' })
    syncReturnWithSales(row, now)
    expect(afterSaleRecords.value).toHaveLength(1)
    expect(afterSaleRecords.value[0]?.actualAmount?.value).toBe('49.90')
  })
})
