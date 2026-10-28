import { describe, expect, it } from 'vitest'
import { 全渠道订单模拟数据 } from './模拟数据'
import type { 全渠道订单, 人工发货分配, 订单商品行 } from './类型'
import { 读取分配商品 } from './履约商品展示'

function 商品(id: string, name: string): 订单商品行 {
  return {
    externalLineId: id, platformSku: `PLATFORM-${id}`, systemSku: 'DEMO-SAME-SKU', systemItemName: name,
    orderedQuantity: 8, fulfillableQuantity: 8, skuResolutionStatus: '成功', currencyCode: 'USD',
    unitPrice: { currency: 'USD', value: '10.00' }, itemTotal: { currency: 'USD', value: '80.00' },
  }
}
function 订单(no: string): 全渠道订单 {
  return { ...structuredClone(全渠道订单模拟数据[0]!), systemOrderNo: no, items: [商品('LINE-1', `${no}的商品`), 商品('LINE-2', `${no}的其他商品`)], manualShippingPlan: undefined }
}

describe('履约单商品按明确来源分配展示', () => {
  it('拆分只展示本次商品和分配数量，历史分配不被最新方案替换', () => {
    const order = 订单('OMS-A')
    order.manualShippingPlan = {
      id: 'PLAN-NEW', kind: '拆分发货', orderNos: [order.systemOrderNo], reason: '', updatedAt: '',
      packages: [{ key: 'NEW-P1', route: order.defaultRoute!, items: [{ orderNo: order.systemOrderNo, externalLineId: 'LINE-2', quantity: 8 }] }],
    }
    const current = 读取分配商品([{ orderNo: order.systemOrderNo, externalLineId: 'LINE-1', quantity: 2 }], order, [])
    const history = 读取分配商品([{ orderNo: order.systemOrderNo, externalLineId: 'LINE-2', quantity: 3 }], order, [])
    expect(current.rows.map(row => [row.item?.externalLineId, row.quantity])).toEqual([['LINE-1', 2]])
    expect(history.rows.map(row => [row.item?.externalLineId, row.quantity])).toEqual([['LINE-2', 3]])
    expect(current.message).toBeUndefined()
    expect(读取分配商品(undefined, order, [order])).toEqual({ rows: [], message: '本次商品明细待核实' })
    expect(读取分配商品([], order, [order])).toEqual({ rows: [], message: '本次商品明细待核实' })
  })

  it('合并相同SKU及相同行号仍按来源订单分别解析，当前详情优先于会话旧引用', () => {
    const current = 订单('OMS-A'), other = 订单('OMS-B'), staleCurrent = 订单('OMS-A')
    staleCurrent.items[0]!.systemItemName = '过期会话商品'
    const result = 读取分配商品([
      { orderNo: 'OMS-A', externalLineId: 'LINE-1', quantity: 2 },
      { orderNo: 'OMS-B', externalLineId: 'LINE-1', quantity: 1 },
    ], current, [staleCurrent, staleCurrent, other])
    expect(result.rows.map(row => [row.orderNo, row.item?.systemSku, row.item?.systemItemName, row.quantity])).toEqual([
      ['OMS-A', 'DEMO-SAME-SKU', 'OMS-A的商品', 2], ['OMS-B', 'DEMO-SAME-SKU', 'OMS-B的商品', 1],
    ])
    expect(new Set(result.rows.map(row => row.key)).size).toBe(2)
    expect(result.message).toBeUndefined()
  })

  it('缺失或不唯一来源/商品行保留分配身份和数量，不取首条或整单兜底', () => {
    const current = 订单('OMS-A'), other = 订单('OMS-B')
    current.items.push(商品('LINE-1', '重复行号'))
    const allocations: 人工发货分配[] = [
      { orderNo: 'OMS-A', externalLineId: 'LINE-1', quantity: 1 },
      { orderNo: 'OMS-B', externalLineId: 'LINE-2', quantity: 2 },
      { orderNo: 'OMS-MISSING', externalLineId: 'LINE-1', quantity: 3 },
      { orderNo: 'OMS-A', externalLineId: 'MISSING', quantity: 4 },
      { orderNo: '', externalLineId: '', quantity: 5 },
    ]
    const result = 读取分配商品(allocations, current, [other, structuredClone(other)])
    expect(result.rows.map(({ orderNo, externalLineId, quantity, item }) => ({ orderNo, externalLineId, quantity, item }))).toEqual(allocations.map(row => ({ ...row, item: undefined })))
    expect(result.message).toBe('部分商品资料或数量待核实')
  })

  it('非法分配数量不改成零或来源下单量，函数及返回副本均不改写输入', () => {
    const current = 订单('OMS-A')
    const allocations = [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, 2].map(quantity => ({ orderNo: 'OMS-A', externalLineId: 'LINE-1', quantity }))
    const before = structuredClone({ current, allocations })
    const result = 读取分配商品(allocations, current, [current])
    expect(result.rows.map(row => row.quantity)).toEqual([undefined, undefined, undefined, undefined, undefined, undefined, 2])
    expect(new Set(result.rows.map(row => row.key)).size).toBe(allocations.length)
    result.rows[0]!.item!.systemItemName = '只修改展示副本'
    result.rows[0]!.item!.unitPrice.value = '0.00'
    expect({ current, allocations }).toEqual(before)
  })
})
