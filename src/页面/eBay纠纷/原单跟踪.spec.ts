import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import Picker from './选择原单跟踪.vue'
import { createDisputeData } from './数据'
import { initializeDisputeContext, resolveDisputeOrder } from './客服关联'
import { originalTrackingOptions } from './原单跟踪'
import { 共享订单 } from '../订单处理/演示会话'
import type { 履约单摘要 } from '../全渠道订单/类型'

function scenario() {
  const row = createDisputeData().find(item => item.id === 'DEMO-INR-101')!
  initializeDisputeContext(row, 'order')
  const order = resolveDisputeOrder(row, 共享订单.value)!
  const pack = order.fulfillmentOrders[0]!
  function options(...packs: 履约单摘要[]) { return originalTrackingOptions(row, [{ ...order, fulfillmentOrders: packs }]) }
  return { row, order, pack, options }
}

describe('更新 INR 所用的原单跟踪号', () => {
  it('只列当前店铺、请求行已核实且有效实发的包裹，排除作废、零实发、其他订单和跟踪号冲突', () => {
    const { row, order, pack, options } = scenario()
    expect(options(pack)).toHaveLength(1)
    expect(originalTrackingOptions(row, [{ ...order, storeId: 'another' }])).toEqual([])
    for (const patch of [
      { status: '执行中' as const }, { isActive: false }, { shippedQuantity: 0 }, { trackingNumber: '—' },
      { items: [{ orderNo: 'different', externalLineId: pack.items![0]!.externalLineId, quantity: 1 }] },
    ]) expect(options({ ...pack, ...patch })).toEqual([])
    expect(options(pack, { ...pack, fulfillmentOrderNo: 'another-package' })).toEqual([])
  })
  it('混装包裹仅有部分实发量时不能证明哪一行已发；全为本案行时可以取用', () => {
    const { row, order, pack, options } = scenario()
    const mixed = { ...pack, plannedQuantity: 2, shippedQuantity: 1, items: [
      ...pack.items!, { orderNo: order.systemOrderNo, externalLineId: 'OTHER', quantity: 1 },
    ] }
    expect(originalTrackingOptions(row, [{ ...order, items: [...order.items, { ...order.items[0]!, externalLineId: 'OTHER' }],
      fulfillmentOrders: [mixed] }])).toEqual([])
    expect(options({ ...mixed, items: [{ ...pack.items![0]!, quantity: 2 }] })).toHaveLength(1)
  })
  it('仅复用本请求中同号、一致的承运商；渠道名和冲突的信息均留待填写', () => {
    const { row, pack, options } = scenario()
    expect(options(pack)[0]).toMatchObject({ tracking: 'DEMO-GB-TRK-101', carrier: 'Royal Mail' })
    expect(options({ ...pack, trackingNumber: 'NEW-TRACKING' })[0]?.carrier).toBeUndefined()
    row.inquiry!.trackings!.push({ tracking: pack.trackingNumber!, carrier: 'Another carrier' })
    expect(options(pack)[0]?.carrier).toBeUndefined()
  })
  it('查看候选不填入、不提交，只有选用才发出跟踪资料', async () => {
    const { row, pack } = scenario()
    const before = structuredClone(row)
    const wrapper = mount(Picker, { props: { record: row } })
    try {
      await wrapper.get('button').trigger('click')
      expect(wrapper.emitted('pick')).toBeUndefined()
      await wrapper.get('button[aria-label="选用 DEMO-GB-TRK-101"]').trigger('click')
      expect(wrapper.emitted('pick')).toEqual([[{ tracking: pack.trackingNumber, carrier: 'Royal Mail' }]])
      expect(row).toEqual(before)
    } finally { wrapper.unmount() }
  })
})
