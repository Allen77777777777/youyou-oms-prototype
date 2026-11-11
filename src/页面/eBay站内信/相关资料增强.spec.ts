import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import RelatedPanel from './相关资料栏.vue'
import { mailSession, resetMailSession } from './会话'
import { tickets, type Ticket } from '../工单管理/会话'
import { initializeAfterSaleDemo } from '../售后单管理/演示数据'
import { 原型标注指令 } from '@/原型标注/原型标注指令'

let wrapper: VueWrapper | undefined
let previousTickets: Ticket[]
beforeEach(() => { resetMailSession(); initializeAfterSaleDemo(); previousTickets = tickets.value })
afterEach(() => { wrapper?.unmount(); wrapper = undefined; tickets.value = previousTickets })
function sample() {
  const conversation = mailSession.conversations.find(row => row.id === 'conv-context-07')!
  const order = mailSession.orders.find(row => row.id === 'order-context-07')!
  wrapper = mount(RelatedPanel, { props: { conversation, orders: mailSession.orders, activeTab: 'overview', selectedOrderId: order.id },
    global: { directives: { prototype: 原型标注指令 } }, attachTo: document.body })
  return { conversation, order }
}

describe('站内信相关资料增强集成', () => {
  it('七分类保留，概览显示两商品两独立包裹、一申请两办理且真实零值分类收为一行', () => {
    sample()
    expect(wrapper!.findAll('[role="tab"]')).toHaveLength(7)
    expect(wrapper!.findAll('[data-order-item]')).toHaveLength(2)
    expect(wrapper!.findAll('[data-package-id]')).toHaveLength(2)
    const parcels = wrapper!.findAll('[data-package-id]')
    expect(parcels[0]!.text()).toContain('已签收')
    expect(parcels[1]!.text()).toContain('运输中')
    expect(parcels[1]!.text()).not.toContain('已签收')
    expect(wrapper!.findAll('[data-return-progress]')).toHaveLength(1)
    expect(wrapper!.findAll('[data-after-sale]')).toHaveLength(2)
    expect(wrapper!.text()).toContain('49.90 USD')
    expect(wrapper!.get('.context-empty-categories').text()).toContain('纠纷 0')
    expect(wrapper!.get('.context-empty-categories').text()).toContain('评价 0')
    expect(wrapper!.findAll('.recent-events li')).toHaveLength(2)
    for (const id of ['relatedTickets', 'afterSaleProgress', 'orderContents', 'packageContents', 'compactOverview']) {
      expect(wrapper!.findAll(`[data-prototype-id="oms.ebay.messages.${id}"]`), id).toHaveLength(1)
    }
  })
  it('同步失败不折成0，也不露出旧申请和内部退款资料', async () => {
    const { order } = sample()
    order.afterSales.state = 'failed'
    order.disputes.state = 'not_synced'
    await nextTick()
    expect(wrapper!.find('[data-return-progress]').exists()).toBe(false)
    expect(wrapper!.find('[data-after-sale]').exists()).toBe(false)
    expect(wrapper!.get('[data-context-section="afterSales"]').text()).toContain('同步失败')
    expect(wrapper!.get('[data-context-section="disputes"]').text()).toContain('尚未同步')
    expect(wrapper!.get('.context-empty-categories').text()).not.toContain('纠纷')
  })
  it('共享申请只替换显式绑定的同笔摘要，其他申请在概览及分类继续可见且计数一致', async () => {
    const { order } = sample()
    order.afterSales.records.push({ id: 'RETURN-UNMAPPED-CONTEXT', title: '另一笔退货申请', status: '待卖家处理', description: '仍需核对的另一笔申请摘要', at: '2026-11-09T01:00:00Z' })
    await nextTick()
    expect(wrapper!.get('[data-context-section="afterSales"] .section-count').text()).toBe('2')
    expect(wrapper!.findAll('[data-return-progress]')).toHaveLength(1)
    expect(wrapper!.get('.fallback-application').text()).toContain('另一笔退货申请')
    await wrapper!.setProps({ activeTab: 'afterSales' })
    expect(wrapper!.get('.section-count').text()).toBe('2')
    expect(wrapper!.get('.fallback-application').text()).toContain('RETURN-UNMAPPED-CONTEXT')
  })
  it('无订单时仍显示精确消息来源工单，不从同买家订单兜底', async () => {
    const conversation = mailSession.conversations.find(row => row.id === 'conv-01')!
    conversation.association = 'none'; conversation.relatedOrderIds = []
    tickets.value = [{ id: 'GD-CONTEXT-ONLY', title: '跟进当前会话', owner: '客服01', creator: '客服01', description: '',
      status: '处理中', createdAt: '2026-11-09 09:00', updatedAt: '2026-11-09 09:00', nextAt: '2026-11-10 10:00', dueAt: '', logs: [], result: '',
      source: { kind: 'message', shopId: conversation.shopId, shopName: conversation.shopName, contextId: conversation.id, id: 'msg-01-3', summary: '当前来信' } }]
    wrapper = mount(RelatedPanel, { props: { conversation, orders: mailSession.orders, activeTab: 'overview', selectedOrderId: '' }, global: { directives: { prototype: {} } } })
    expect(wrapper.text()).toContain('暂无关联订单')
    expect(wrapper.get('[data-ticket-scope="conversation"]').text()).toContain('跟进当前会话')
    expect(wrapper.find('[data-ticket-scope="order"]').exists()).toBe(false)
    expect(wrapper.find('[data-order-item]').exists()).toBe(false)
  })
  it('历史订单只读预览不带当前会话工单，不写回选择或页签', async () => {
    const { conversation, order } = sample()
    const historical = { ...order, id: 'context-history', orderNo: 'DEMO-HISTORY-CONTEXT', activity: [] }
    mailSession.orders.push(historical)
    tickets.value = [{ id: 'GD-CONTEXT-CURRENT', title: '仅当前会话任务', owner: '客服01', creator: '客服01', description: '',
      status: '处理中', createdAt: '2026-11-09 09:00', updatedAt: '2026-11-09 09:00', nextAt: '', dueAt: '', logs: [], result: '',
      source: { kind: 'message', shopId: conversation.shopId, shopName: conversation.shopName, contextId: conversation.id, id: 'msg-context-07-1', summary: '当前来信' } }]
    await nextTick()
    expect(wrapper!.text()).toContain('仅当前会话任务')
    await wrapper!.get('.history-trigger').trigger('click')
    await wrapper!.get('[data-history-order="context-history"]').trigger('click')
    expect(wrapper!.get('.history-preview-scope').text()).toContain('DEMO-HISTORY-CONTEXT')
    expect(wrapper!.text()).not.toContain('仅当前会话任务')
    expect(wrapper!.emitted('update:selectedOrderId')).toBeUndefined()
    expect(wrapper!.emitted('update:activeTab')).toBeUndefined()
    await wrapper!.get('.history-back').trigger('click')
    expect(wrapper!.text()).toContain('仅当前会话任务')
  })
})
