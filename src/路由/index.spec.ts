// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'

import { router } from './index'

describe('eBay订单详情路由', () => {
  it('使用卖家与订单号形成稳定详情路径，并保留列表菜单上下文', () => {
    const 详情 = router.resolve('/oms/orders/ebay/seller-us-01/15-10578-48261')

    expect(详情.name).toBe('oms-ebay-order-detail')
    expect(详情.params).toMatchObject({
      sellerId: 'seller-us-01',
      orderId: '15-10578-48261',
    })
    expect(详情.meta.activeMenu).toBe('/oms/orders/ebay')
    expect(详情.meta.tabTitlePrefix).toBe('eBay')
    expect(详情.meta.tabTitleParam).toBe('orderId')
  })

  it('同一订单解析为同一路径，不同订单解析为不同页签路径', () => {
    const 同一订单首次 = router.resolve({
      name: 'oms-ebay-order-detail',
      params: { sellerId: 'seller-us-01', orderId: '15-10578-48261' },
    })
    const 同一订单再次 = router.resolve('/oms/orders/ebay/seller-us-01/15-10578-48261')
    const 另一订单 = router.resolve({
      name: 'oms-ebay-order-detail',
      params: { sellerId: 'seller-us-01', orderId: '21-09741-66320' },
    })

    expect(同一订单首次.path).toBe(同一订单再次.path)
    expect(另一订单.path).not.toBe(同一订单首次.path)
  })
})

describe('全渠道订单详情路由', () => {
  it('使用系统订单号形成应用内详情页签，并保留列表菜单上下文', () => {
    const 详情 = router.resolve('/oms/orders/all/OMS260909000184')

    expect(详情.name).toBe('oms-all-order-detail')
    expect(详情.params.systemOrderNo).toBe('OMS260909000184')
    expect(详情.meta.activeMenu).toBe('/oms/orders/all')
    expect(详情.meta.tabTitlePrefix).toBe('订单')
    expect(详情.meta.tabTitleParam).toBe('systemOrderNo')
  })

  it('同一系统订单复用相同路径，不同订单形成不同页签路径', () => {
    const 同一订单首次 = router.resolve({
      name: 'oms-all-order-detail',
      params: { systemOrderNo: 'OMS260909000184' },
    })
    const 同一订单再次 = router.resolve('/oms/orders/all/OMS260909000184')
    const 另一订单 = router.resolve({
      name: 'oms-all-order-detail',
      params: { systemOrderNo: 'OMS260910000219' },
    })

    expect(同一订单首次.path).toBe(同一订单再次.path)
    expect(另一订单.path).not.toBe(同一订单首次.path)
  })
})
