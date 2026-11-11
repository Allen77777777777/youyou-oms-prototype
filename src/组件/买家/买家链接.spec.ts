import { describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import BuyerLink from './买家链接.vue'

describe('统一买家入口', () => {
  it('保留原始店铺和买家标识，进入详情且不触发父行点击或键盘动作', async () => {
    const router = createRouter({ history: createMemoryHistory(), routes: [
      { path: '/', component: { template: '<div />' } },
      { path: '/oms/ebay-service/buyers/:shopId/:buyerId', name: 'oms-ebay-buyer-detail', component: { template: '<div />' } },
    ] })
    await router.push('/')
    const click = vi.fn(), keydown = vi.fn()
    const wrapper = mount(defineComponent({ setup: () => () => h('div', { onClick: click, onKeydown: keydown }, [h(BuyerLink, { shopId: 'shop-甲', buyerId: 'buyer/a#1' })]) }), { global: { plugins: [router], directives: { prototype: {} } } })
    await wrapper.get('button').trigger('keydown', { key: 'Enter' })
    await wrapper.get('button').trigger('click'); await flushPromises()
    expect(click).not.toHaveBeenCalled(); expect(keydown).not.toHaveBeenCalled()
    expect(router.currentRoute.value.name).toBe('oms-ebay-buyer-detail')
    expect(router.currentRoute.value.params).toEqual({ shopId: 'shop-甲', buyerId: 'buyer/a#1' })
    expect(wrapper.get('button').attributes('type')).toBe('button')
    wrapper.unmount()
  })

  it.each([{ shopId: '', buyerId: 'buyer_demo' }, { shopId: 'shop-us', buyerId: '' }, { shopId: ' ', buyerId: 'buyer_demo' }])('缺少来源身份只保留文本 $shopId $buyerId', props => {
    const wrapper = mount(BuyerLink, { props, slots: { default: '待核对' }, global: { directives: { prototype: {} } } })
    expect(wrapper.find('button').exists()).toBe(false)
    expect(wrapper.text()).toBe('待核对')
    wrapper.unmount()
  })
})
