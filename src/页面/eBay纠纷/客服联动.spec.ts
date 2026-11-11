import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import Context from './纠纷客服联动.vue'
import { createDisputeData } from './数据'
import { addDisputeNote, disputePackageScope, initializeDisputeContext, notesForDispute, resolveDisputeOrder } from './客服关联'
import { 共享订单 } from '../订单处理/演示会话'
import { mailSession } from '../eBay站内信/会话'

const row = createDisputeData()[0]!
let wrapper: VueWrapper | undefined
afterEach(() => { wrapper?.unmount(); wrapper = undefined; ElMessage.closeAll() })

describe('纠纷详情的订单、来信与内部备注', () => {
  it('同一平台订单身份只能打开唯一同店且买家一致的订单，重复系统路由亦阻断', () => {
    initializeDisputeContext(row)
    const order = resolveDisputeOrder(row, 共享订单.value)!
    expect(order.systemOrderNo).toBe('OMS-DEMO-DS-101')
    expect(resolveDisputeOrder(row, [{ ...order, buyerExternalId: 'else' }])).toBeUndefined()
    expect(resolveDisputeOrder(row, [{ ...order, storeId: 'else' }])).toBeUndefined()
    expect(resolveDisputeOrder(row, [order, { ...order, systemOrderNo: 'other-order', buyerExternalId: 'else' }])).toBeUndefined()
    expect(resolveDisputeOrder(row, [order, { ...order, platformCode: 'Temu' }])).toBeUndefined()
  })
  it('备注按店铺、对象类型及编号隔离，案件资料和平台历史保持原值', () => {
    const sample = { ...row, id: 'NOTE-TEST' }, before = structuredClone(sample)
    expect(addDisputeNote(sample, '   ')).toBeTruthy()
    expect(addDisputeNote(sample, 'A'.repeat(501))).toBeTruthy()
    expect(addDisputeNote(sample, '  等待承运商提供签收单  ')).toBe('')
    expect(notesForDispute(sample)[0]).toMatchObject({ text: '等待承运商提供签收单', author: expect.any(String), at: expect.any(String) })
    expect(notesForDispute({ ...sample, kind: 'EBAY_CASE' })).toEqual([])
    expect(notesForDispute({ ...sample, shopId: 'another-shop' })).toEqual([])
    const { operationLogs, ...businessFacts } = sample
    expect(businessFacts).toEqual(before)
    expect(operationLogs).toEqual([expect.objectContaining({ action: '添加内部备注', result: '成功' })])
  })
  it('三包裹订单只标出涉及支付争议两行的包裹，行标识缺失时改为待核实', () => {
    const payment = createDisputeData().find(item => item.id === 'DEMO-PD-113')!
    initializeDisputeContext(payment)
    const order = resolveDisputeOrder(payment, 共享订单.value)!
    const scopes = () => order.fulfillmentOrders.map(pack => disputePackageScope(payment, order, pack))
    expect(scopes()).toEqual(['含本纠纷订单行', '含本纠纷订单行', '其他订单行'])
    payment.payment!.details!.lines[1]!.itemId = 'different-item'
    expect(scopes()).toEqual(Array(3).fill('纠纷行关联待核实'))
  })
  it('分栏挂载只显示所选区块；查看备注或来信不初始化订单，包裹明细按需展开', async () => {
    const payment = createDisputeData().find(item => item.id === 'DEMO-PD-104')!
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: { template: '<div />' } }] })
    await router.push('/')
    const ordersBefore = 共享订单.value.length, conversationsBefore = mailSession.conversations.length
    wrapper = mount(Context, { props: { record: payment, section: 'note' }, global: { plugins: [router],
      directives: { prototype: {} }, stubs: { ElTooltip: { inheritAttrs: false, template: '<slot/>' } } } })
    expect(wrapper.find('[aria-label="内部备注"]').exists()).toBe(true)
    expect(wrapper.find('[aria-label="关联订单"]').exists()).toBe(false)
    expect(wrapper.find('[aria-label="买家站内信区"]').exists()).toBe(false)
    expect(mailSession.conversations).toHaveLength(conversationsBefore)
    await wrapper.setProps({ section: 'mail' })
    expect(wrapper.find('[aria-label="买家站内信区"]').exists()).toBe(true)
    expect(共享订单.value).toHaveLength(ordersBefore)
    expect(wrapper.find('[aria-label="内部备注"]').exists()).toBe(false)
    await wrapper.setProps({ section: 'order' })
    expect(wrapper.get('[aria-label="关联订单"] h2').text()).toBe('关联订单')
    const pack = wrapper.get('details.fulfillment')
    expect(pack.attributes('open')).toBeUndefined()
    expect(pack.get('summary').text()).toContain('含本纠纷订单行')
    await pack.get('summary').trigger('click')
    expect(pack.attributes('open')).toBeDefined()
    expect(pack.get('.package-body').text()).toContain('DEMO-GB-TRK-104')
  })
  it('从当前案件打开订单、原始来信和发信弹窗，外发保存该纠纷的来源类型', async () => {
    const page = { template: '<div />' }
    const router = createRouter({ history: createMemoryHistory(), routes: [
      { path: '/', component: page }, { path: '/orders/:systemOrderNo', name: 'oms-all-order-detail', component: page },
      { path: '/oms/ebay-service/messages', component: page },
    ] })
    await router.push('/')
    wrapper = mount(Context, { props: { record: row }, global: { plugins: [router], directives: { prototype: {} }, stubs: {
      ElDialog: { props: ['modelValue'], template: '<section v-if="modelValue" role="dialog"><slot/><slot name="footer"/></section>' },
      ElTooltip: { inheritAttrs: false, template: '<slot/>' },
    } } })
    async function click(text: string) {
      const button = wrapper!.findAll('button').find(btn => btn.text().trim() === text)
      if (!button) throw new Error(text)
      await button.trigger('click'); await flushPromises()
    }
    await click('查看订单详情')
    expect(router.currentRoute.value.params.systemOrderNo).toBe('OMS-DEMO-DS-101')
    await click('查看站内信')
    expect(mailSession.navigationTarget).toMatchObject({ shopId: row.shopId, buyerId: row.buyer, messageId: 'DEMO-MSG-DS-101' })
    await click('发送站内信')
    expect(wrapper.get('[role=dialog]').text()).toContain('来源纠纷Item not received · DEMO-INR-101')
    await wrapper.get('select[aria-label="选择站内信会话"]').setValue('DEMO-MAIL-DS-101')
    const before = row.history.length
    await wrapper.get('textarea[aria-label="联系买家站内信正文"]').setValue('We have asked the carrier to check.')
    await wrapper.get('.reply-footer-actions button').trigger('click')
    const thread = mailSession.conversations.find(item => item.id === 'DEMO-MAIL-DS-101')!
    await vi.waitFor(() => expect(thread.messages[thread.messages.length - 1]).toMatchObject({
      kind: 'outgoing', delivery: 'success', body: 'We have asked the carrier to check.',
      originApplication: { kind: 'INR_REQUEST', applicationId: row.id, shopId: row.shopId, orderNo: row.orderId },
    }))
    expect(row.history).toHaveLength(before)
    expect(wrapper.get('.buyer-mail-title').text()).toContain('1')
  })
})
