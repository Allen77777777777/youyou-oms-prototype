import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { resetReturnSession, returnSession, syncReturnList } from '../eBay退换货申请/数据'
import { createReturnSaleDraft, prepareReship } from '../eBay退换货申请/售后联动'
import { 共享订单, 仓库执行记录, 当前版本, 提交审核轮次 } from '../订单处理/演示会话'
import { 执行待审核规则轮次 } from '../订单处理/审单规则执行'
import { 渠道会话 } from '../仓配管理/仓配会话'
import { initializeAfterSaleDemo } from './演示数据'
import { afterSaleResultPresentation } from './办理结果'
import { activeAfterSaleActor, afterSaleActors, afterSaleFacts, afterSaleReasons, afterSaleRecords, afterSaleReturnSummary, approveReship, createAfterSale, createPlatformAfterSale, getReshipReviewDraft, updateAfterSaleResult, type AfterSaleInput } from './会话'

const orderSnapshot = JSON.stringify(共享订单.value), executionSnapshot = JSON.stringify(仓库执行记录.value)
const channels = JSON.stringify(渠道会话.value)
const restore = () => {
  共享订单.value = JSON.parse(orderSnapshot); 仓库执行记录.value = JSON.parse(executionSnapshot); 渠道会话.value = JSON.parse(channels)
  afterSaleRecords.value = []; activeAfterSaleActor.value = afterSaleActors[0]!; resetReturnSession()
}
beforeEach(restore)
afterEach(restore)
const base = (): AfterSaleInput => ({ requestId: 'request-1', shopId: 'shop-us', shopName: '演示店铺-US', returnId: 'DEMO-RT-001', orderNo: 'DEMO-ORDER-1001', kind: '部分退款', actionLabel: '部分退款报价', amount: { value: '10.00', currency: 'USD' }, items: [{ lineId: 'line-1', title: '置物架', quantity: 1, reason: '质量问题' }], note: '客服内部归类' })

describe('售后单分流与跨页面共享', () => {
  it('本单操作日志区分人员与系统，重复建单和无变化回查不重复留痕', () => {
    const input = base(), record = createAfterSale(input, afterSaleActors[1]).record!
    expect(record.logs?.[0]).toMatchObject({ operator: '客服01', action: '创建售后单', result: '成功' })
    expect(record.logs?.[0]?.content).not.toContain(input.note)
    createAfterSale(input, afterSaleActors[1]); expect(record.logs).toHaveLength(1)
    updateAfterSaleResult(record.no, '买家已拒绝报价')
    expect(record.logs?.slice(-1)[0]).toMatchObject({ operator: '系统', action: '执行结果更新', result: '已更新' })
    updateAfterSaleResult(record.no, '买家已拒绝报价'); expect(record.logs).toHaveLength(2)
    const external = createPlatformAfterSale({ ...input, requestId: 'external-refund', kind: '全额退款' }).record!
    expect(external.logs?.[0]?.operator).toBe('系统 · eBay同步')
    expect(record.logs?.[0]?.operator).toBe('客服01')
  })
  it('重发执行仅对状态事实变化留痕，包裹顺序变化不记且回查不覆盖原审核人', () => {
    initializeAfterSaleDemo()
    const record = afterSaleRecords.value.find(row => row.kind === '重发')!
    expect(approveReship(record.no, afterSaleActors[0]).ok).toBe(true)
    const order = 共享订单.value.find(row => row.systemOrderNo === record.manualOrderNo)!
    const reviewer = record.logs?.find(log => log.action === '审核重发')?.operator
    activeAfterSaleActor.value = afterSaleActors[1]!
    order.fulfillmentOrders = ['DEMO-PARCEL-A', 'DEMO-PARCEL-B'].map(fulfillmentOrderNo => ({
      fulfillmentOrderNo, status: '待执行', isActive: true, route: { ...order.defaultRoute! }, plannedQuantity: 1, shippedQuantity: 0,
    }))
    const count = record.logs!.length
    order.fulfillmentOrders = [...order.fulfillmentOrders].reverse()
    expect(record.logs).toHaveLength(count)
    order.fulfillmentOrders[0]!.status = '已发货'
    expect(record.logs).toHaveLength(count + 1)
    expect(record.logs?.slice(-1)[0]).toMatchObject({ operator: '系统', action: '重发执行结果更新' })
    expect(record.logs?.find(log => log.action === '审核重发')?.operator).toBe(reviewer)
    expect(reviewer).toBe('运营01')
  })
  it.each(['其他售后单', '其他场景', '其他原单', '重复订单'] as const)('重发关联出现%s时不写入该订单的执行事实', failure => {
    initializeAfterSaleDemo()
    const record = afterSaleRecords.value.find(row => row.kind === '重发')!
    expect(approveReship(record.no).ok).toBe(true)
    const order = 共享订单.value.find(row => row.systemOrderNo === record.manualOrderNo)!
    if (failure === '其他售后单') order.manualOrder!.afterSaleNo = 'ANOTHER-AFTER-SALE'
    if (failure === '其他场景') order.manualOrder!.scenario = '寄样赠送'
    if (failure === '其他原单') order.manualOrder!.originalOrderNo = 'ANOTHER-ORDER'
    if (failure === '重复订单') 共享订单.value.push(JSON.parse(JSON.stringify(order)))
    const count = record.logs!.length
    order.processingStatus = '已发货'
    expect(afterSaleResultPresentation(record).group).toBe('待核查')
    expect(record.logs).toHaveLength(count)
  })
  it('系统记录可靠执行事实不依赖当前查看人的店铺权限', () => {
    initializeAfterSaleDemo()
    const record = afterSaleRecords.value.find(row => row.kind === '重发')!
    expect(approveReship(record.no).ok).toBe(true)
    const order = 共享订单.value.find(row => row.systemOrderNo === record.manualOrderNo)!
    activeAfterSaleActor.value = { ...afterSaleActors[1]!, shopIds: [] }
    const count = record.logs!.length
    order.processingStatus = '待推单'
    expect(record.logs).toHaveLength(count + 1)
    expect(record.logs![record.logs!.length - 1]).toMatchObject({ operator: '系统', action: '重发执行结果更新', content: expect.stringContaining('待审核 → 待推单') })
    expect(afterSaleResultPresentation(record).text).toBe('重发订单关联待核查')
  })
  it('从申请列表先同步再打开售后管理，已收买家答复的历史报价仍关联同一单', () => {
    const source = returnSession.records.find(r => r.id === 'DEMO-RT-019')!
    syncReturnList([source], [source.shopId])
    initializeAfterSaleDemo()
    const quote = afterSaleRecords.value.find(r => r.returnId === source.id)!
    expect(quote.executionResult).toBe('买家已接受报价，退款处理中')
    expect(source.afterSaleOfferNo).toBe(quote.no); expect(source.afterSaleRefundNo).toBe(quote.no)
    expect(quote.actualAmount).toBeUndefined()
    initializeAfterSaleDemo()
    expect(afterSaleRecords.value.filter(r => r.returnId === source.id)).toHaveLength(1)
  })
  it('平台直接办理不会制造审批人或资金成功，回查只更新原单', () => {
    const input = base()
    const quote = createAfterSale(input).record!
    expect(quote).toMatchObject({ approval: null, kind: '部分退款', createdBy: '运营01' })
    expect(quote.reviewedBy).toBeUndefined(); expect(quote.actualAmount).toBeUndefined()
    expect(createAfterSale(input).record).toBe(quote)
    expect(createAfterSale({ ...input, note: '改变内容' }).ok).toBe(false)
    expect(approveReship(quote.no).ok).toBe(false)
    updateAfterSaleResult(quote.no, '买家拒绝报价')
    expect(quote.actualAmount).toBeUndefined()
    const ret = createAfterSale({ ...input, requestId: 'accept', kind: '退货', amount: undefined }).record!
    expect(ret.no).not.toBe(quote.no); expect(afterSaleRecords.value).toHaveLength(2)
    const external = createPlatformAfterSale({ ...input, requestId: 'platform:refund:1', kind: '全额退款' }).record!
    updateAfterSaleResult(external.no, '平台退款成功', { value: '8.00', currency: 'USD' })
    expect(external).toMatchObject({ source: '平台同步', approval: null, createdBy: 'eBay', actualAmount: { value: '8.00' } })
    updateAfterSaleResult(external.no, '已读取本次退款进度')
    expect(external.actualAmount?.value).toBe('8.00')
    updateAfterSaleResult(external.no, '平台退款失败', null)
    expect(external.actualAmount).toBeUndefined()
    expect(createAfterSale({ ...input, shopId: 'demo-outdoor-uk' }, afterSaleActors[2]).ok).toBe(false)
  })
  it('待审重发不会创建手工单，审核须店铺授权且允许自审，重复审核或重建同一决定只产生一单', () => {
    initializeAfterSaleDemo(); initializeAfterSaleDemo()
    expect(afterSaleRecords.value.map(r => r.kind).sort()).toEqual(['全额退款', '部分退款', '退货', '退货', '重发'].sort())
    const platformRefund = afterSaleRecords.value.find(r => r.kind === '全额退款')!
    expect(platformRefund.actualAmount?.value).toBe('49.90'); expect(platformRefund.amount).toBeUndefined()
    const pending = afterSaleRecords.value.find(r => r.kind === '重发')!
    const linkedOrders = () => 共享订单.value.filter(o => o.manualOrder?.afterSaleNo === pending.no)
    expect(pending.approval).toBe('待审核'); expect(linkedOrders()).toHaveLength(0)
    expect(approveReship(pending.no, afterSaleActors[1]).ok).toBe(false)
    expect(approveReship(pending.no, { ...afterSaleActors[0]!, shopIds: [] }).ok).toBe(false)
    expect(createAfterSale({ ...pending, requestId: 'new-click' }).ok).toBe(false)
    expect(approveReship(pending.no)).toMatchObject({ ok: true, record: { approval: '已审核', reviewedBy: pending.createdBy } })
    expect(approveReship(pending.no).ok).toBe(true); expect(linkedOrders()).toHaveLength(1)
    const manual = linkedOrders()[0]!
    expect(manual).toMatchObject({ systemOrderNo: pending.manualOrderNo, processingStatus: '待审核', platformCode: '手工', manualOrder: { scenario: '售后补寄', originalOrderNo: pending.systemOrderNo } })
    expect(manual.platformOrderStatus).toBeUndefined()
    for (const mode of ['立即执行', '定时执行'] as const) {
      const report = 执行待审核规则轮次(mode)
      expect(report.明细.find(r => r.订单号 === manual.systemOrderNo)).toMatchObject({ 结果: '跳过', 原因: expect.stringContaining('人工审核') })
    }
    expect(manual.reviews).toHaveLength(0)
    // 普通的手工「售后补寄」没有售后单号，仍会按原规则参与审单。
    const ordinary = 共享订单.value.find(o => o.manualOrder?.scenario === '售后补寄' && !o.manualOrder.afterSaleNo)!
    expect(ordinary.reviews.some(r => r.type === '自动审核')).toBe(true)
    expect(提交审核轮次(manual.systemOrderNo, 当前版本(manual.systemOrderNo), '人工核对重发')).toMatchObject({ 成功: true })
    expect(manual.processingStatus).toBe('待推单')
  })
  it('待审期间原单执行或物流资料变更，审核重新校验且不放行', () => {
    initializeAfterSaleDemo()
    const pending = afterSaleRecords.value.find(r => r.kind === '重发')!
    const channel = 渠道会话.value.find(c => c.id === pending.reshipRoute?.shippingChannelId)!
    channel.enabled = false
    expect(approveReship(pending.no)).toMatchObject({ ok: false, message: expect.stringContaining('停用') })
    expect(pending.reviewedAt).toBeUndefined(); expect(pending.manualOrderNo).toBeUndefined()
    channel.enabled = true
    const source = returnSession.records.find(r => r.id === pending.returnId)!
    source.orderNo = '其他订单'
    expect(approveReship(pending.no).ok).toBe(false)
    expect(pending.approval).toBe('待审核')
  })

  it('申请阶段只登记明细，必填现行原因，审核时按已知值带出、补齐后只建单一次', () => {
    initializeAfterSaleDemo()
    const row = returnSession.records.find(r => r.id === 'DEMO-RT-001')!
    const fields = createReturnSaleDraft(row)
    expect(afterSaleReasons).toHaveLength(22)
    expect(fields.reason).toBe('')
    for (const reason of ['', '待归类', '商品质量问题']) {
      expect(createAfterSale(prepareReship(row, { ...fields, reason })).message).toContain('请选择系统售后原因')
    }
    const input = prepareReship(row, { ...fields, reason: '质量问题' })
    const record = createAfterSale(input).record!
    expect(record.reshipDraft).toBeUndefined()
    const review = getReshipReviewDraft(record)
    expect(review.storeId).toBe(row.shopId)
    expect(review.items[0]?.quantity).toBe(fields.quantity)
    expect(review.address).toMatchObject({ fullName: 'Demo Recipient', telephone: '+1 202-555-0142' })
    expect(review.channel).toBe('GC-FEDEX-HD')
    expect(approveReship(record.no, afterSaleActors[0], { ...review, address: { ...review.address, telephone: '' } }).ok).toBe(false)
    expect(record.approval).toBe('待审核')
    const valid = getReshipReviewDraft(afterSaleRecords.value.find(r => r.requestId === 'seed-after-sale:DEMO-RT-003')!)
    expect(approveReship(record.no, afterSaleActors[0], { ...review, items: valid.items }).ok).toBe(false)
    expect(approveReship(record.no, afterSaleActors[0], review).ok).toBe(true)
    expect(createAfterSale(input).record?.no).toBe(record.no)
    expect(approveReship(record.no, afterSaleActors[0], review).ok).toBe(true)
    expect(共享订单.value.filter(o => o.manualOrder?.afterSaleNo === record.no)).toHaveLength(1)
  })

  it('同一来源分笔保留处置，按币种和仓库实收单去重，当前平台状态同源更新', () => {
    initializeAfterSaleDemo()
    const row = returnSession.records.find(r => r.id === 'DEMO-RT-007')!
    const returned = afterSaleRecords.value.find(r => r.returnId === row.id && r.kind === '退货')!
    returned.warehouseReceipts!.push({ ...returned.warehouseReceipts![0]! })
    const totals = () => afterSaleReturnSummary(row.shopId, row.id)
    expect(totals()).toMatchObject({ count: 2, approvedReturnQty: 1, receivedQty: 1, actualAmounts: [{ currency: 'USD', value: '49.90' }] })
    expect(afterSaleFacts(returned).platformStatus).toBe('已关闭')
    row.status = 'ITEM_DELIVERED'
    expect(afterSaleFacts(returned).platformStatus).toBe('退货已送达')
    delete returned.warehouseReceipts
    expect(totals()).toMatchObject({ approvedReturnQty: 1, receivedQty: undefined, hasUnverifiedReceipt: true })
    const second = createPlatformAfterSale({ ...base(), returnId: row.id, orderNo: row.orderNo, requestId: 'foreign-refund' }).record!
    updateAfterSaleResult(second.no, '已退款', { currency: 'GBP', value: '3.21' })
    expect(totals().actualAmounts).toEqual(expect.arrayContaining([{ currency: 'USD', value: '49.90' }, { currency: 'GBP', value: '3.21' }]))
    expect(afterSaleReturnSummary('another-shop', row.id).count).toBe(0)
  })

  it('平台售后状态同申请摘要分别投影，保留失败前快照、未知原码和无来源边界', () => {
    initializeAfterSaleDemo()
    const sample = afterSaleRecords.value.find(r => r.kind === '部分退款')!
    const source = returnSession.records.find(r => r.id === sample.returnId && r.shopId === sample.shopId)!
    const summary = source.detail!.readStatus.summary
    source.state = 'PARTIAL_REFUND_REQUESTED'; source.status = 'RETURN_REQUESTED'
    source.detail!.readStatus.detail.status = 'failed'
    expect(afterSaleFacts(sample)).toMatchObject({ platformState: '待买家接受报价', platformStatus: '已申请退货', platformReadNote: '' })
    summary.status = 'failed'; summary.succeededAt = '2026-11-04T02:30:00Z'
    expect(afterSaleFacts(sample)).toMatchObject({ platformState: '待买家接受报价', platformStatus: '已申请退货', platformReadNote: '上次读取 2026-11-04 10:30:00，本次未确认' })
    summary.succeededAt = null
    expect(afterSaleFacts(sample)).toMatchObject({ platformState: '状态待核实', platformStatus: '总体状态待核实', platformStateCode: '', platformReadNote: '尚未成功读取退货申请摘要' })
    summary.status = 'success'; source.state = 'FUTURE_STATE'; source.status = 'ESCALATED'
    expect(afterSaleFacts(sample)).toMatchObject({ platformState: '状态待核实', platformStateCode: 'FUTURE_STATE', platformStatus: '已升级纠纷' })
    source.state = 'REFUND_FAILED'; source.status = 'FUTURE_STATUS'
    expect(afterSaleFacts(sample)).toMatchObject({ platformState: '退款失败', platformStatusCode: 'FUTURE_STATUS', platformStatus: '总体状态待核实' })
    source.orderNo = ''
    expect(afterSaleFacts(sample).platformState).toBe('退款失败')
    source.orderNo = 'different-order-id'
    expect(afterSaleFacts(sample).platformReadNote).toBe('来源申请待核实')
    expect(afterSaleFacts({ ...sample, shopId: 'different-shop' }).platformReadNote).toBe('来源申请待核实')
  })
})
