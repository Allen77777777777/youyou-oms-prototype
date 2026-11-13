import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { computed, nextTick } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { getOrderAfterSalesContext, getOrderReturnProgress, getRelatedTicketGroups } from './关联办理资料'
import TicketSummary from './关联工单摘要.vue'
import ReturnSummary from './售后办理摘要.vue'
import { mailSession, resetMailSession } from './会话'
import type { RelatedOrder } from './类型'
import { tickets, type Ticket, type TicketSource } from '../工单管理/会话'
import { returnSession, createReturnData } from '../eBay退换货申请/数据'
import { afterSaleRecords, activeAfterSaleActor, afterSaleActors } from '../售后单管理/会话'
import { initializeAfterSaleDemo } from '../售后单管理/演示数据'
import { 共享订单 } from '../订单处理/演示会话'
import { disputeRecords } from '../eBay纠纷/模型'
import { disputeTicketSource } from '../eBay纠纷/导航'

const snapshot = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T
const initialTickets = snapshot(tickets.value)
const initialReturns = snapshot(returnSession.records)
const initialSales = snapshot(afterSaleRecords.value)
const initialOrders = snapshot(共享订单.value)
const initialActor = activeAfterSaleActor.value
function task(id: string, source: TicketSource, patch: Partial<Ticket> = {}): Ticket {
  return { id, source, title: '核实处理进展 ' + id, description: '', owner: '跟单员小周', creator: '客服小林',
    status: '处理中', createdAt: '2026-11-09 09:00', updatedAt: '2026-11-09 09:00', nextAt: '2026-11-09 16:30', dueAt: '', result: '', logs: [], ...patch }
}
const messageSource = (messageId = 'msg-01-3', conversationId = 'conv-01'): TicketSource => ({ kind: 'message', id: messageId, contextId: conversationId, shopId: 'shop-us', shopName: '演示店铺-US', summary: '买家询问进展' })
function matchingOrder(returnId = 'DEMO-RT-007'): RelatedOrder {
  const source = returnSession.records.find(row => row.id === returnId)!
  const base = snapshot(mailSession.orders[0]!)
  return { ...base, id: 'context-' + returnId, shopId: source.shopId, shopName: source.shopName, orderNo: source.orderNo, buyerId: source.buyerId, afterSales: { state: 'ready', records: [] } }
}

beforeEach(() => {
  resetMailSession()
  tickets.value = []
  returnSession.records = createReturnData()
  afterSaleRecords.value = []
  activeAfterSaleActor.value = afterSaleActors[0]!
  共享订单.value = snapshot(initialOrders)
})
afterEach(() => {
  tickets.value = snapshot(initialTickets)
  returnSession.records = snapshot(initialReturns)
  afterSaleRecords.value = snapshot(initialSales)
  共享订单.value = snapshot(initialOrders)
  activeAfterSaleActor.value = initialActor
  resetMailSession()
})

describe('站内信相关办理资料的精确关联', () => {
  it('未关联订单也展示本会话工单；跨店、错会话、缺失及未成功消息不纳入', () => {
    const conversation = mailSession.conversations.find(row => row.id === 'conv-01')!
    conversation.association = 'none'
    conversation.messages.push({ id: 'failed', kind: 'outgoing', sender: '客服', body: '未送达', at: conversation.updatedAt, delivery: 'failed' })
    tickets.value = [task('GD-A', messageSource()), task('GD-B', { ...messageSource(), shopId: 'shop-uk' }),
      task('GD-C', messageSource('msg-01-3', 'other')), task('GD-D', messageSource('missing')), task('GD-E', messageSource('failed'))]
    expect(getRelatedTicketGroups(conversation).conversation).toMatchObject([{ id: 'GD-A', owner: '跟单员小周', status: '处理中', time: '2026-11-09T08:30:00.000Z', timeLabel: '下次跟进' }])
    expect(getRelatedTicketGroups(conversation).order).toEqual([])
  })

  it('重复消息身份不回退第一条；非法跟进时间不偷用完成期限', () => {
    const conversation = mailSession.conversations.find(row => row.id === 'conv-01')!
    tickets.value = [task('GD-A', messageSource(), { nextAt: '时间待核实', dueAt: '2026-11-10 17:00' })]
    const result = getRelatedTicketGroups(conversation).conversation[0]!
    expect(result).toMatchObject({ timeLabel: '下次跟进', timeIssue: '时间待核实' })
    expect(result.time).toBeUndefined()
    conversation.messages.push({ ...conversation.messages.find(row => row.id === 'msg-01-3')! })
    expect(getRelatedTicketGroups(conversation).conversation).toEqual([])
  })

  it('区分本会话与本订单其他来源，不以同买家或相似编号关联', () => {
    const conversation = mailSession.conversations.find(row => row.id === 'conv-01')!
    const order = matchingOrder('DEMO-RT-012')
    const source: TicketSource = { kind: 'return', shopId: order.shopId, shopName: order.shopName!, id: 'DEMO-RT-012', summary: '核实退回' }
    tickets.value = [task('GD-A', messageSource()), task('GD-B', source), task('GD-C', { ...source, id: 'DEMO-RT-007' })]
    expect(getRelatedTicketGroups(conversation, order).conversation.map(row => row.id)).toEqual(['GD-A'])
    expect(getRelatedTicketGroups(conversation, order).order.map(row => row.id)).toEqual(['GD-B'])
    expect(getRelatedTicketGroups(undefined, order).conversation).toEqual([])
    expect(getRelatedTicketGroups(undefined, { ...order, shopId: 'shop-uk' }).order).toEqual([])
  })

  it('同店同单同买家的旧 Case 工单可关联，同号其他纠纷类型和重复来源不会被误关联', () => {
    const previousDisputes = disputeRecords.value
    const caseRecord = previousDisputes.find(row => row.kind === 'EBAY_CASE')!
    const source = disputeTicketSource(caseRecord)
    const order = { ...mailSession.orders[0]!, shopId: caseRecord.shopId, orderNo: caseRecord.orderId, buyerId: caseRecord.buyer }
    const sameIdInquiry = { ...caseRecord, kind: 'INR_REQUEST' as const, orderId: 'OTHER-ORDER' }
    try {
      disputeRecords.value = [sameIdInquiry, caseRecord]
      tickets.value = [
        task('GD-CASE-OLD', source),
        task('GD-CASE-EMPTY', { ...source, contextId: '' }),
        task('GD-CASE-TYPED', { ...source, contextId: 'EBAY_CASE' }),
        task('GD-INR', disputeTicketSource(sameIdInquiry)),
        task('GD-UNKNOWN', { ...source, contextId: 'UNKNOWN' }),
        task('GD-OTHER-SHOP', { ...source, shopId: 'other-shop' }),
      ]
      expect(getRelatedTicketGroups(undefined, order).order.map(row => row.id)).toEqual(['GD-CASE-EMPTY', 'GD-CASE-OLD', 'GD-CASE-TYPED'])
      expect(getRelatedTicketGroups(undefined, { ...order, orderNo: 'OTHER-ORDER' }).order.map(row => row.id)).toEqual(['GD-INR'])
      expect(getRelatedTicketGroups(undefined, { ...order, buyerId: 'other-buyer' }).order).toEqual([])

      disputeRecords.value = [sameIdInquiry, caseRecord, { ...caseRecord, shopId: 'other-shop' }]
      expect(getRelatedTicketGroups(undefined, order).order).toHaveLength(3)
      disputeRecords.value.push({ ...caseRecord, orderId: 'OTHER-ORDER' })
      expect(getRelatedTicketGroups(undefined, order).order).toEqual([])
    } finally {
      disputeRecords.value = previousDisputes
    }
  })

  it('另一会话工单按具体消息唯一订单归入，多单或待确认消息不泛挂', () => {
    const order = mailSession.orders.find(row => row.id === 'order-02')!
    const conversation = mailSession.conversations.find(row => row.id === 'conv-02')!
    const message = conversation.messages.find(row => row.kind === 'incoming')!
    tickets.value = [task('GD-A', messageSource(message.id, conversation.id))]
    expect(getRelatedTicketGroups(undefined, order).order.map(row => row.id)).toEqual(['GD-A'])
    mailSession.orders.push({ ...snapshot(order), id: 'other-order', orderNo: 'OTHER-ORDER' })
    conversation.relatedOrderIds.push('other-order')
    expect(getRelatedTicketGroups(undefined, order).order.map(row => row.id)).toEqual(['GD-A'])
    message.orderAssociation = { state: 'confirmed', orderIds: [order.id, 'other-order'] }
    expect(getRelatedTicketGroups(undefined, order).order).toEqual([])
    message.orderAssociation = { state: 'pending', orderIds: [] }
    expect(getRelatedTicketGroups(undefined, order).order).toEqual([])
  })

  it('已结束工单保留真实状态并停止展示旧跟进预约，未安排跟进时使用完成期限', () => {
    const conversation = mailSession.conversations.find(row => row.id === 'conv-01')!
    tickets.value = [task('GD-B', messageSource(), { status: '已放弃' }),
      task('GD-A', messageSource(), { nextAt: '', dueAt: '2026-11-10 17:00' })]
    const rows = getRelatedTicketGroups(conversation).conversation
    expect(rows.map(row => row.id)).toEqual(['GD-A', 'GD-B'])
    expect(rows[0]).toMatchObject({ timeLabel: '完成期限', time: '2026-11-10T09:00:00.000Z' })
    expect(rows[1]).toMatchObject({ status: '已放弃' })
    expect(rows[1]?.time).toBeUndefined()
  })

  it('平台申请一笔与内部两笔办理分别表达，实收和实退取既有凭证', () => {
    initializeAfterSaleDemo()
    const order = matchingOrder()
    const [progress] = getOrderReturnProgress(order)
    expect(progress?.returnId).toBe('DEMO-RT-007')
    expect(progress?.internalRecords).toHaveLength(2)
    expect(progress?.internalRecords.find(row => row.kind === '退货')).toMatchObject({ receivedQty: 1, approvedReturnQty: 1 })
    expect(progress?.internalRecords.find(row => row.kind === '全额退款')).toMatchObject({ actualAmount: { currency: 'USD', value: '49.90' }, executionResult: '退款成功' })
    expect(getOrderReturnProgress({ ...order, orderNo: 'DEMO-1007' })).toEqual([])
    expect(getOrderReturnProgress({ ...order, buyerId: 'buyer_demo_07' })).toEqual([])
    expect(getOrderReturnProgress({ ...order, afterSales: { state: 'forbidden', records: [] } })).toEqual([])
  })

  it('报价和重发建单不显示成实退或已发货，重发订单必须反向关联本售后单', () => {
    initializeAfterSaleDemo()
    const [quote] = getOrderReturnProgress(matchingOrder('DEMO-RT-019'))
    expect(quote?.internalRecords[0]).toMatchObject({ amountLabel: '报价金额', executionResult: '已报价，等待买家决定', amount: { value: '10.00', currency: 'USD' } })
    expect(quote?.internalRecords[0]?.actualAmount).toBeUndefined()
    const reship = getOrderReturnProgress(matchingOrder('DEMO-RT-003'))[0]?.internalRecords[0]
    expect(reship).toMatchObject({ kind: '重发', approval: '待审核', executionResult: '等待重发审核', packages: [] })
    expect(reship?.manualStatus).toBeUndefined()
    const source = afterSaleRecords.value.find(row => row.kind === '重发')!
    source.manualOrderNo = 共享订单.value[0]!.systemOrderNo
    expect(getOrderReturnProgress(matchingOrder('DEMO-RT-003'))[0]?.internalRecords[0]?.manualIssue).toBe('重发订单关联待核实')
  })

  it('重发审核后的手工订单与各有效履约分别读取，待审核不能冒充发货成功', () => {
    initializeAfterSaleDemo()
    const source = afterSaleRecords.value.find(row => row.kind === '重发')!
    const manual = snapshot(共享订单.value[0]!)
    Object.assign(manual, { systemOrderNo: 'MANUAL-CONTEXT-01', platformCode: '手工', orderType: '手工订单', processingStatus: '待审核',
      manualOrder: { scenario: '售后补寄', originalOrderNo: source.systemOrderNo, afterSaleNo: source.no, requestId: 'after-sale:' + source.no, reason: '核实后补寄', paidConfirmed: false }, fulfillmentOrders: [] })
    共享订单.value.push(manual)
    source.approval = '已审核'
    source.manualOrderNo = manual.systemOrderNo
    const order = matchingOrder('DEMO-RT-003')
    expect(getOrderReturnProgress(order)[0]?.internalRecords[0]).toMatchObject({ approval: '已审核', manualStatus: '待审核', packages: [] })
    const shared = 共享订单.value.find(row => row.systemOrderNo === manual.systemOrderNo)!
    shared.fulfillmentOrders = [
      { fulfillmentOrderNo: 'FL-A', isActive: true, route: shared.defaultRoute!, status: '已发货', plannedQuantity: 1, shippedQuantity: 1, trackingNumber: 'TRACK-A' },
      { fulfillmentOrderNo: 'FL-B', isActive: true, route: shared.defaultRoute!, status: '执行中', plannedQuantity: 1, shippedQuantity: 0 },
      { fulfillmentOrderNo: 'FL-OLD', isActive: false, route: shared.defaultRoute!, status: '已终止', plannedQuantity: 1, shippedQuantity: 0 },
    ]
    expect(getOrderReturnProgress(order)[0]?.internalRecords[0]?.packages).toEqual([
      { no: 'FL-A', status: '已发货', shippedQuantity: 1, trackingNumber: 'TRACK-A' },
      { no: 'FL-B', status: '执行中', shippedQuantity: 0, trackingNumber: undefined },
    ])
  })

  it('资料读取失败保留来源自己的旧快照说明，重复来源不取首条，查看不推进原单', () => {
    initializeAfterSaleDemo()
    const order = matchingOrder()
    const source = returnSession.records.find(row => row.id === 'DEMO-RT-007')!
    source.detail!.readStatus.summary.status = 'failed'
    const before = JSON.stringify([returnSession.records, afterSaleRecords.value, 共享订单.value])
    expect(getOrderReturnProgress(order)[0]?.platformReadNote).toContain('本次未确认')
    getRelatedTicketGroups(undefined, order)
    expect(JSON.stringify([returnSession.records, afterSaleRecords.value, 共享订单.value])).toBe(before)
    returnSession.records.push(snapshot(source))
    expect(getOrderReturnProgress(order)).toEqual([])
  })

  it('响应共享工单和售后变化，售后单店铺权限裁剪不把无权记录当成功', () => {
    initializeAfterSaleDemo()
    const order = matchingOrder()
    const progress = computed(() => getOrderReturnProgress(order))
    expect(progress.value[0]?.internalRecords).toHaveLength(2)
    activeAfterSaleActor.value = { id: 'restricted', name: '受限人员', canApprove: false, shopIds: ['shop-uk'] }
    expect(progress.value[0]?.internalRecords).toHaveLength(0)
    activeAfterSaleActor.value = afterSaleActors[0]!
    const refund = afterSaleRecords.value.find(row => row.returnId === 'DEMO-RT-007' && row.kind === '全额退款')!
    refund.executionResult = '资金归属待核实'
    delete refund.actualAmount
    expect(progress.value[0]?.internalRecords.find(row => row.kind === '全额退款')?.executionResult).toBe('资金归属待核实')
    expect(progress.value[0]?.internalRecords.find(row => row.kind === '全额退款')?.actualAmount).toBeUndefined()
  })

  it.each(['itemOnHold', 'contentOnHold'] as const)('来源 %s 隐藏商品与申请内容，不恢复缓存标题或原因', field => {
    const order = matchingOrder('DEMO-RT-022')
    const source = returnSession.records.find(row => row.id === 'DEMO-RT-022')!
    source.title = '缓存商品标题'
    source.reason = '缓存的申请说明'
    source.detail![field] = true
    const summary = getOrderReturnProgress(order)[0]!
    expect(summary.title).toBe('平台已隐藏商品内容')
    expect(summary.reason).toBe('')
    const wrapper = mount(ReturnSummary, { props: { order, compact: true } })
    expect(wrapper.text()).toContain('平台已隐藏商品内容')
    expect(wrapper.text()).not.toContain('缓存商品标题')
    expect(wrapper.text()).not.toContain('缓存的申请说明')
    wrapper.unmount()
  })

  it('共享Return仅替换显式returnId对应摘要，混合旧资料保留且计数一致', () => {
    initializeAfterSaleDemo()
    const order = matchingOrder()
    const bound = { id: 'legacy-return-summary', returnId: 'DEMO-RT-007', title: '旧申请摘要', status: '处理中', description: '', at: '2026-10-25T04:20:00Z' }
    const other = { id: 'legacy-unmatched', title: '其他售后申请', status: '待处理', description: '', at: '2026-10-25T04:20:00Z' }
    const unboundSameId = { ...other, id: 'DEMO-RT-007', title: '编号相同但来源未核实' }
    order.afterSales.records = [bound, other, unboundSameId]
    const before = snapshot(order)
    const context = getOrderAfterSalesContext(order)
    expect(context.returns.map(row => row.returnId)).toEqual(['DEMO-RT-007'])
    expect(context.records).toEqual([other, unboundSameId])
    expect(context.count).toBe(3)
    expect(order).toEqual(before)
  })

  it.each(['not_synced', 'failed', 'forbidden'] as const)('售后资料%s不读取共享申请或旧记录，计数保持未知', state => {
    initializeAfterSaleDemo()
    const order = matchingOrder()
    order.afterSales = { state, records: [{ id: 'legacy', returnId: 'DEMO-RT-007', title: '旧申请', status: '已关闭', description: '', at: '' }] }
    expect(getOrderReturnProgress(order)).toEqual([])
    expect(getOrderAfterSalesContext(order)).toEqual({ returns: [], records: [], count: null })
  })

  it('Return来源冲突或订单身份不符时不吞旧记录；有效空资料才显示零', () => {
    initializeAfterSaleDemo()
    const order = matchingOrder()
    order.afterSales.records = [{ id: 'legacy', returnId: 'DEMO-RT-007', title: '既有申请摘要', status: '已关闭', description: '', at: '' }]
    returnSession.records.push(snapshot(returnSession.records.find(row => row.id === 'DEMO-RT-007')!))
    expect(getOrderAfterSalesContext(order)).toEqual({ returns: [], records: order.afterSales.records, count: 1 })
    const noSource = { ...order, orderNo: 'ORDER-WITHOUT-RETURN', afterSales: { state: 'ready' as const, records: [] } }
    expect(getOrderAfterSalesContext(noSource)).toEqual({ returns: [], records: [], count: 0 })
    expect(getOrderAfterSalesContext()).toEqual({ returns: [], records: [], count: null })
  })
})

describe('紧凑办理摘要组件', () => {
  it('概览工单按组折叠，点击准确进入工单并可独立于订单展示', async () => {
    const conversation = mailSession.conversations.find(row => row.id === 'conv-01')!
    tickets.value = [1, 2, 3].map(n => task('GD-' + n, messageSource()))
    const router = createRouter({ history: createMemoryHistory(), routes: [
      { path: '/', component: { template: '<div />' } }, { path: '/tickets', name: 'oms-tickets', component: { template: '<div />' } },
    ] })
    await router.push('/')
    const wrapper = mount(TicketSummary, { props: { conversation, compact: true }, global: { plugins: [router] } })
    expect(wrapper.findAll('[data-related-ticket]')).toHaveLength(2)
    await wrapper.get('.ticket-more').trigger('click')
    expect(wrapper.findAll('[data-related-ticket]')).toHaveLength(3)
    await wrapper.get('[aria-label="查看工单 GD-2"]').trigger('click')
    await nextTick()
    await flushPromises()
    expect(router.currentRoute.value.query.ticketId).toBe('GD-2')
    wrapper.unmount()
  })

  it('售后摘要在无路由环境可读，显示两笔独立办理且报价不伪造实退', () => {
    initializeAfterSaleDemo()
    const wrapper = mount(ReturnSummary, { props: { order: matchingOrder(), compact: true } })
    expect(wrapper.findAll('[data-return-progress]')).toHaveLength(1)
    expect(wrapper.findAll('[data-after-sale]')).toHaveLength(2)
    expect(wrapper.text()).toContain('2 笔售后单')
    expect(wrapper.text()).toContain('49.90 USD')
    wrapper.unmount()
    const quoted = mount(ReturnSummary, { props: { order: matchingOrder('DEMO-RT-019'), compact: true } })
    expect(quoted.text()).toContain('报价金额')
    expect(quoted.text()).toContain('金额未确认')
    expect(quoted.text()).not.toContain('退款成功')
    quoted.unmount()
  })
})
