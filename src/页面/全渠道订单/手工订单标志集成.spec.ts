import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import AllOrders from './全渠道订单页面.vue'
import { 全渠道订单模拟数据 } from './模拟数据'
import { 共享订单 } from '../订单处理/演示会话'

const 初始订单 = JSON.stringify(共享订单.value)
let page: VueWrapper | undefined
beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
  const 普通单 = structuredClone(全渠道订单模拟数据[0]!)
  普通单.systemOrderNo = 'OMS-DEMO-FLAG-REGULAR'
  const 手工单 = structuredClone(普通单)
  手工单.systemOrderNo = 'OMS-DEMO-FLAG-MANUAL'
  手工单.orderType = '手工订单'; 手工单.platformCode = '手工'
  手工单.platformOrderNo = ''; 手工单.platformOrderId = undefined; 手工单.platformOrderStatus = undefined
  手工单.processingStatus = '待审核'; 手工单.fulfillmentOrders = []
  手工单.manualOrder = { scenario: '寄样赠送', reason: '虚构标志集成场景', paidConfirmed: false, requestId: 'manual-flag-integration' }
  共享订单.value = [普通单, 手工单]
})
afterEach(() => {
  page?.unmount(); page = undefined
  共享订单.value = JSON.parse(初始订单)
  document.body.innerHTML = ''; vi.unstubAllGlobals()
})

describe('全渠道订单手工标志集成', () => {
  it('既有状态区域显示手工单的手，普通平台订单仍不新增标志', async () => {
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/oms/orders/all', component: { template: '<div />' } }, { path: '/oms/orders/all/:systemOrderNo', name: 'oms-all-order-detail', component: { template: '<div />' } }] })
    await router.push('/oms/orders/all'); await router.isReady()
    page = mount(AllOrders, { attachTo: document.body, global: { plugins: [router], directives: { prototype: {} }, stubs: { ElTooltip: { template: '<span><slot /></span>' }, ElPopover: { template: '<span><slot name="reference" /></span>' }, ElDropdown: { template: '<span><slot /></span>' } } } })
    await nextTick(); await flushPromises(); await nextTick()
    const rows = page.get('.订单表格').findAll('tbody tr.el-table__row')
    expect(rows).toHaveLength(2)
    const manual = rows.find(row => row.text().includes('OMS-DEMO-FLAG-MANUAL'))!
    const regular = rows.find(row => row.text().includes('OMS-DEMO-FLAG-REGULAR'))!
    expect(manual.get('.状态单元格 [data-flag-code="MANUAL_ORDER"]').text()).toBe('手')
    expect(manual.findAll('[data-flag-code]')).toHaveLength(1)
    expect(regular.find('[data-flag-code]').exists()).toBe(false)
  })
})
