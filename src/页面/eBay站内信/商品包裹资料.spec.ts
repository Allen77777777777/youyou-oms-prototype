import { afterEach, describe, expect, it } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import ProductPackageDetails from './商品包裹资料.vue'
import { createRelatedOrders } from './数据'
import type { RelatedOrder } from './类型'

const wrappers: VueWrapper[] = []
function view(order: RelatedOrder, mode: 'products' | 'packages', compact = false) {
  const wrapper = mount(ProductPackageDetails, {
    props: { order, mode, compact },
    global: { stubs: { ElIcon: { template: '<span><slot /></span>' }, ElTag: { template: '<span><slot /></span>' } } },
  })
  wrappers.push(wrapper)
  return wrapper
}
afterEach(() => { wrappers.splice(0).forEach(wrapper => wrapper.unmount()) })

describe('商品包裹资料数量展示', () => {
  it('商品行和包裹各自展示来源数量与独立物流状态', () => {
    const order = createRelatedOrders().find(row => row.id === 'order-context-07')!
    const products = view(order, 'products'), parcels = view(order, 'packages')
    expect(products.findAll('.item-quantity').map(row => row.text())).toEqual(['× 1', '× 1'])
    expect(products.get('[data-order-item="DEMO-CONTEXT-1007-L1"]').text()).toContain('HOME-CABLE-07')
    expect(products.get('[data-order-item="DEMO-CONTEXT-1007-L2"]').text()).toContain('TRAVEL-BAG-CONTEXT-07')
    const first = parcels.get('[data-package-id="PKG-CONTEXT-1007-A"]'), second = parcels.get('[data-package-id="PKG-CONTEXT-1007-B"]')
    expect(first.text()).toContain('已签收')
    expect(first.get('.package-goods').text()).toContain('理线盒')
    expect(first.get('.package-goods').text()).not.toContain('旅行收纳袋')
    expect(second.text()).toContain('运输中')
    expect(second.get('.package-goods').text()).toContain('旅行收纳袋')
    expect(second.get('.package-goods').text()).not.toContain('理线盒')
    expect(second.text()).toContain('11-09 08:45 北京时间')
  })

  it.each([Number.NaN, Number.POSITIVE_INFINITY, 0, -1, 1.5])('非法数量 %s 显示待核实，不展示为可执行商品数量', quantity => {
    const order = createRelatedOrders().find(row => row.id === 'order-context-07')!
    order.items![0]!.quantity = quantity
    order.logistics.records[0]!.packageItems![0]!.quantity = quantity
    const products = view(order, 'products'), parcels = view(order, 'packages')
    expect(products.findAll('.item-quantity')[0]!.text()).toBe('数量待核实')
    expect(parcels.findAll('.package-goods b')[0]!.text()).toBe('数量待核实')
    expect(parcels.findAll('.package-goods p')[0]!.text()).toContain('商品关联待核实')
    expect(products.text()).not.toContain('NaN')
    expect(parcels.text()).not.toContain('NaN')
    expect(products.text()).not.toContain('Infinity')
    expect(parcels.text()).not.toContain('Infinity')
    expect(products.findAll('.item-packages')).toHaveLength(1)
  })
})
