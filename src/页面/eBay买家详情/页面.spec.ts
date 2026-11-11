import { afterEach, describe, expect, it } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import BuyerPage from './买家详情页面.vue'
import { buyerTime, buyerTimeValue } from './展示工具'
import { mailSession } from '../eBay站内信/会话'
import MultiFilter from '@/组件/筛选/多选筛选.vue'

let wrapper: VueWrapper | undefined
afterEach(() => wrapper?.unmount())
async function open(shopId = 'shop-us', buyerId = 'buyer_demo_01') {
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/buyers/:shopId/:buyerId', component: BuyerPage },
    { path: '/messages', name: 'oms-ebay-messages', component: { template: '<div>原会话</div>' } },
  ] })
  await router.push(`/buyers/${shopId}/${buyerId}`); await router.isReady()
  wrapper = mount(BuyerPage, { global: { plugins: [router], directives: { prototype: {} } } })
  await flushPromises()
  return router
}
describe('买家详情只读查看', () => {
  it('概览不标读，分类型计数；沟通原单精确定位来源会话', async () => {
    const before = JSON.stringify(mailSession.conversations)
    const router = await open()
    expect(wrapper!.get('h1').text()).toBe('买家详情')
    expect(wrapper!.findAll('.buyer-tabs button')).toHaveLength(6)
    expect(wrapper!.text()).not.toContain('总待办')
    expect(JSON.stringify(mailSession.conversations)).toBe(before)
    await wrapper!.findAll('.buyer-tabs button').find(button => button.text().startsWith('沟通'))!.trigger('click')
    await flushPromises()
    expect(wrapper!.get('.buyer-record-table').text()).toContain('conv-01')
    await wrapper!.findAll('.buyer-record-table button').find(button => button.text() === '查看原单')!.trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.query).toMatchObject({ shopId: 'shop-us', conversationId: 'conv-01' })
  })
  it('不存在的身份显示受控空态，不展示其他买家记录', async () => {
    await open('unknown', 'buyer_demo_01')
    expect(wrapper!.text()).toContain('未找到可查看的买家资料')
    expect(wrapper!.find('.buyer-tabs').exists()).toBe(false)
    expect(wrapper!.text()).not.toContain('GD-1001')
  })
  it('查询店铺后覆盖告警与分类数量采用同一范围，重置恢复原范围', async () => {
    const order = mailSession.orders.find(row => row.shopId === 'shop-us' && row.buyerId === 'buyer_demo_01')!
    const original = order.disputes
    try {
      order.disputes = { state: 'failed', records: [] }
      await open()
      expect(wrapper!.find('.buyer-coverage-note').exists()).toBe(true)
      expect(wrapper!.findAll('.buyer-tabs button').find(button => button.text().startsWith('售后'))!.text()).toContain('已收录')
      wrapper!.findComponent(MultiFilter).vm.$emit('update:modelValue', ['shop-uk'])
      await wrapper!.findAll('button').find(button => button.text() === '查询')!.trigger('click')
      await flushPromises()
      expect(wrapper!.find('.buyer-coverage-note').exists()).toBe(false)
      expect(wrapper!.findAll('.buyer-tabs button').find(button => button.text().startsWith('售后'))!.text()).not.toContain('已收录')
      await wrapper!.findAll('button').find(button => button.text() === '重置')!.trigger('click')
      await flushPromises()
      expect(wrapper!.find('.buyer-coverage-note').exists()).toBe(true)
    } finally { order.disputes = original }
  })
  it('北京时间转换并保留日期精度，不猜测无偏移来源', () => {
    expect(buyerTime('2026-11-06T01:02:03Z')).toBe('2026-11-06 09:02:03')
    expect(buyerTime('2026-11-06')).toBe('2026-11-06')
    expect(buyerTime('2026-11-06 01:02:03')).toBe('时间待核实')
    expect(buyerTime('2026-02-30')).toBe('时间待核实')
    expect(buyerTimeValue('2026-02-30')).toBeUndefined()
  })
})
