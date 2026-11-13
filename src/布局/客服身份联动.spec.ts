import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import { currentHandlerId, currentHandlerName } from '@/组件/客服处理人/处理人'
import { activeAfterSaleActor, afterSaleActors } from '@/页面/售后单管理/权限'
import { 标注状态 } from '@/原型标注/标注状态'
import TopNavigation from './顶部导航.vue'

afterEach(() => { 标注状态.退出(); activeAfterSaleActor.value = afterSaleActors[0]!; currentHandlerId.value = 'staff-01' })

describe('顶部演示操作身份入口', () => {
  it.each(['/oms/ebay-service/returns', '/oms/ebay-service/after-sale-orders'])('在%s与售后共用操作身份', async path => {
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path, component: { template: '<div />' } }] })
    await router.push(path); await router.isReady()
    标注状态.切换模式()
    const wrapper = mount(TopNavigation, { global: { plugins: [router], stubs: {
      RouteTabs: true, ElDropdown: { name: 'ElDropdown', template: '<div><slot /><slot name="dropdown" /></div>' },
      ElDropdownMenu: true, ElDropdownItem: true, ElPopover: true, ElTooltip: true, ElIcon: true, ElDialog: true, ElBadge: true, ElInput: true,
    } } })
    try {
      const menu = wrapper.findAllComponents({ name: 'ElDropdown' }).find(node => node.attributes('popper-class') === '客服身份菜单')!
      expect(menu.exists()).toBe(true)
      menu.vm.$emit('command', 'staff-03')
      await flushPromises()
      expect(activeAfterSaleActor.value.name).toBe('客服03')
      expect(currentHandlerName.value).toBe('客服03')
      activeAfterSaleActor.value = afterSaleActors[2]!
      await flushPromises()
      expect(currentHandlerId.value).toBe('ops-02')
      expect(wrapper.get('[aria-label="切换客服演示身份"]').text()).toBe('02')
      menu.vm.$emit('command', 'staff-unknown')
      expect(currentHandlerId.value).toBe('ops-02')
    } finally { wrapper.unmount() }
  })
})
