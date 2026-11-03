import { afterEach, describe, expect, it } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import ContextPanel from './相关资料栏.vue'
import { createConversations, createRelatedOrders } from './数据'
import type { ContextTab, Conversation, RelatedOrder } from './类型'

const wrappers: VueWrapper[] = []
function makePanel(options: { conversation?: Conversation; orders?: RelatedOrder[]; activeTab?: ContextTab; selectedOrderId?: string } = {}) {
  const wrapper = mount(ContextPanel, {
    props: { conversation: options.conversation ?? createConversations()[0]!, orders: options.orders ?? createRelatedOrders(), activeTab: options.activeTab ?? 'overview', selectedOrderId: options.selectedOrderId ?? 'order-01' },
    global: {
      directives: { prototype: {} },
      stubs: {
        ElIcon: { template: '<span><slot /></span>' },
        ElTag: { template: '<span class="status-tag"><slot /></span>' },
        ElSelect: { props: ['modelValue'], emits: ['update:modelValue'], template: '<select :value="modelValue" @change="$emit(\'update:modelValue\', $event.target.value)"><slot /></select>' },
        ElOption: { props: ['value', 'label'], template: '<option :value="value">{{ label }}</option>' },
      },
    },
  })
  wrappers.push(wrapper)
  return wrapper
}
function button(wrapper: VueWrapper, label: string) {
  const result = wrapper.findAll('button').find(item => item.text() === label)
  if (!result) throw new Error(`没有找到按钮 ${label}`)
  return result
}
afterEach(() => { wrappers.splice(0).forEach(wrapper => wrapper.unmount()); document.body.innerHTML = '' })

describe('站内信相关资料栏', () => {
  it('当前订单摘要与跨店买家其他订单分开，历史不是可切换的当前关联', async () => {
    const wrapper = makePanel()
    expect(wrapper.get('.scope-order').text()).toContain('DEMO-1001')
    expect(wrapper.get('[data-context-section="afterSales"]').text()).toContain('待卖家处理')
    expect(wrapper.get('[data-context-section="reviews"]').text()).toContain('中评')
    expect(wrapper.text()).not.toContain('DEMO-1004')
    await button(wrapper, '买家其他订单').trigger('click')
    expect(wrapper.get('.buyer-history').text()).toContain('DEMO-1004')
    expect(wrapper.get('.buyer-history').text()).toContain('DEMO-1010')
    expect(wrapper.get('.buyer-history').text()).toContain('演示店铺-UK')
    expect(wrapper.get('.buyer-history').find('select').exists()).toBe(true)
    expect(wrapper.emitted('update:selectedOrderId')).toBeUndefined()
    expect(wrapper.get('.scope-order').text()).toContain('DEMO-1001')
    await button(wrapper, '查看申请').trigger('click')
    expect(wrapper.emitted('update:activeTab')?.slice(-1)[0]).toEqual(['afterSales'])
    await wrapper.setProps({ activeTab: 'afterSales' })
    expect(wrapper.get('.context-record').text()).toContain('RET-DEMO-01')
    expect(wrapper.get('.record-details').text()).toContain('关联商品')
    await wrapper.get('[aria-label="收起相关资料"]').trigger('click')
    expect(wrapper.emitted('close')).toHaveLength(1)
  })

  it('按店铺筛选并独立查看其他订单全部资料，返回后当前订单和页签保持原值', async () => {
    const wrapper = makePanel({ activeTab: 'afterSales' })
    await button(wrapper, '买家其他订单').trigger('click')
    await wrapper.get('[aria-label="买家订单店铺"]').setValue('shop-uk')
    expect(wrapper.findAll('.history-order')).toHaveLength(1)
    expect(wrapper.get('.history-order').text()).toContain('DEMO-1010')
    await wrapper.get('[data-history-order="order-10"]').trigger('click')
    expect(wrapper.get('.history-preview-scope').text()).toContain('演示店铺-UK')
    expect(wrapper.get('.history-preview-scope').text()).toContain('DEMO-1010')
    expect(wrapper.findAll('[role="tab"]')).toHaveLength(7)
    expect(wrapper.get('.order-summary').text()).toContain('折叠露营椅')
    await button(wrapper, '订单').trigger('click')
    expect(wrapper.get('.context-facts').text()).toContain('演示店铺-UK')
    expect(wrapper.get('.context-facts').text()).toContain('GBP')
    for (const [tab, recordId] of [['物流', 'PKG-order-10'], ['售后', 'RET-DEMO-10'], ['纠纷', 'CASE-DEMO-10'], ['评价', 'REV-DEMO-10']]) {
      await button(wrapper, tab!).trigger('click')
      expect(wrapper.get('.context-record').text()).toContain(recordId)
    }
    await button(wrapper, '动态').trigger('click')
    expect(wrapper.get('.context-timeline').text()).toContain('仓库已发货')
    expect(wrapper.emitted('update:selectedOrderId')).toBeUndefined()
    expect(wrapper.emitted('update:activeTab')).toBeUndefined()
    await button(wrapper, '返回当前会话资料').trigger('click')
    expect(wrapper.get('.scope-order').text()).toContain('DEMO-1001')
    expect(wrapper.get('.context-record').text()).toContain('RET-DEMO-01')
    expect(wrapper.get('[aria-label="买家订单店铺"]').element).toHaveProperty('value', 'shop-uk')
  })

  it('身份或店铺权限不足不展示跨店信息，撤回访问范围后退出已打开的历史详情', async () => {
    const conversation = createConversations()[0]!
    const wrapper = makePanel({ conversation })
    await button(wrapper, '买家其他订单').trigger('click')
    await wrapper.get('[data-history-order="order-10"]').trigger('click')
    await wrapper.setProps({ conversation: { ...conversation, buyerDataScope: { ...conversation.buyerDataScope!, shopIds: ['shop-us'] } } })
    expect(wrapper.find('.history-preview-scope').exists()).toBe(false)
    expect(wrapper.get('.scope-order').text()).toContain('DEMO-1001')
    expect(wrapper.text()).not.toContain('DEMO-1010')
    expect(wrapper.get('.buyer-history').text()).not.toContain('演示店铺-UK')
    await wrapper.setProps({ conversation: { ...conversation, buyerDataScope: undefined } })
    expect(wrapper.get('.buyer-history').text()).toContain('DEMO-1004')
    expect(wrapper.get('.buyer-history').text()).not.toContain('DEMO-1010')
    expect(wrapper.emitted('update:selectedOrderId')).toBeUndefined()
  })

  it('同一对象不同来源取得状态分别展示，未知资料不能被表示成零条', async () => {
    const conversation = createConversations().find(item => item.relatedOrderIds.includes('order-07'))!
    const wrapper = makePanel({ conversation, selectedOrderId: 'order-07' })
    expect(wrapper.get('[data-context-section="afterSales"]').text()).toContain('尚未同步')
    expect(wrapper.get('[data-context-section="disputes"]').text()).toContain('同步失败')
    expect(wrapper.get('[data-context-section="reviews"]').text()).toContain('无查看权限')
    for (const section of ['afterSales', 'disputes', 'reviews']) {
      expect(wrapper.get(`[data-context-section="${section}"]`).find('.section-count').exists()).toBe(false)
    }
    await wrapper.setProps({ activeTab: 'disputes' })
    expect(wrapper.get('.large-state').text()).toContain('同步失败')
    expect(wrapper.find('.context-record').exists()).toBe(false)
    const other = makePanel()
    expect(other.get('[data-context-section="disputes"] .section-count').text()).toBe('0')
    expect(other.get('[data-context-section="disputes"]').text()).toContain('暂无纠纷记录')
  })

  it('候选订单不提升为已关联事实，售前无订单保留可信商品信息', async () => {
    const conversation = createConversations().find(item => item.association === 'pending')!
    const wrapper = makePanel({ conversation, selectedOrderId: conversation.relatedOrderIds[0] })
    expect(wrapper.text()).toContain('订单关联待确认')
    expect(wrapper.find('.context-tabs').exists()).toBe(false)
    expect(wrapper.find('[data-context-section="afterSales"]').exists()).toBe(false)
    expect(wrapper.emitted('update:selectedOrderId')?.slice(-1)[0]).toEqual([''])
    const presale = createConversations().find(item => item.source === 'buyer' && item.association === 'none' && item.product)!
    await wrapper.setProps({ conversation: presale, selectedOrderId: '' })
    expect(wrapper.text()).toContain('暂无关联订单')
    expect(wrapper.get('.standalone-product').text()).toContain(presale.product!.title)
    expect(wrapper.find('.order-summary').exists()).toBe(false)
  })

  it('多笔已确认订单不默认选最新，只有可验证关联参与选择', async () => {
    const orders = createRelatedOrders()
    const conversation = { ...createConversations()[0]!, relatedOrderIds: ['order-01', 'order-04', 'order-10'] }
    const wrapper = makePanel({ conversation, orders, selectedOrderId: '' })
    expect(wrapper.text()).toContain('请选择当前订单')
    expect(wrapper.get('select').findAll('option').map(item => item.attributes('value'))).toEqual(['order-01', 'order-04'])
    expect(wrapper.find('[data-context-section="afterSales"]').exists()).toBe(false)
    await wrapper.get('select').setValue('order-04')
    expect(wrapper.emitted('update:selectedOrderId')?.slice(-1)[0]).toEqual(['order-04'])
    await wrapper.setProps({ selectedOrderId: 'order-04' })
    expect(wrapper.get('.order-summary').text()).toContain('空气滤芯')
    expect(wrapper.get('[data-context-section="reviews"]').text()).toContain('好评')
    expect(wrapper.get('[data-context-section="afterSales"] .section-count').text()).toBe('0')
  })
})
