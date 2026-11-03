import { describe, expect, it } from 'vitest'
import type { 全渠道订单, 履约单摘要 } from '../全渠道订单/类型'
import { 全渠道订单模拟数据 } from '../全渠道订单/模拟数据'
import { 读取拆分包裹商品投影, 格式化包裹金额 } from './拆分包裹商品投影'

const 克隆 = <T>(值: T): T => JSON.parse(JSON.stringify(值)) as T
function 场景(原量 = 2, 分配 = [1, 1], 实收?: string, 编号 = 分配.map((_, 索引) => `FO-${String.fromCharCode(65 + 索引)}`)) {
  const 订单 = 克隆(全渠道订单模拟数据[0]!)
  const 模板 = 订单.items[0]!
  订单.systemOrderNo = 'OMS-PARCEL-PROJECTION'
  订单.items = [{ ...模板, externalLineId: 'SOURCE-LINE', systemSku: 'SKU-A', orderedQuantity: 原量, fulfillableQuantity: 分配.reduce((总, 数量) => 总 + 数量, 0), unitPrice: { currency: 'USD', value: '999.99' }, itemTotal: { currency: 'USD', value: '99999.00' }, actualReceived: 实收 === undefined ? undefined : { currency: 'USD', value: 实收 } }]
  const route = 克隆(订单.defaultRoute!)
  订单.manualShippingPlan = { id: 'MANUAL-PROJECTION', kind: '拆分发货', orderNos: [订单.systemOrderNo], reason: '按包只读投影', updatedAt: '2026-10-21', packages: 分配.map((数量, 索引) => ({ key: `package-${索引}`, route: 克隆(route), items: [{ orderNo: 订单.systemOrderNo, externalLineId: 'SOURCE-LINE', quantity: 数量 }] })) }
  订单.fulfillmentOrders = 分配.map((数量, 索引): 履约单摘要 => ({ fulfillmentOrderNo: 编号[索引]!, status: '待执行', isActive: true, route: 克隆(route), manualPlanId: 订单.manualShippingPlan!.id, plannedQuantity: 数量, shippedQuantity: 0, items: [{ orderNo: 订单.systemOrderNo, externalLineId: 'SOURCE-LINE', quantity: 数量 }] }))
  return 订单
}
function 金额结果(订单: 全渠道订单) {
  return Object.fromEntries(订单.fulfillmentOrders.map(履约 => [履约.fulfillmentOrderNo, 读取拆分包裹商品投影(订单, 履约).items[0]?.actualReceived?.value]))
}

describe('拆分包裹商品的只读数量与实收投影', () => {
  it('同一来源行一加一分包只显示本包一件和一半实收，单价及原订单全JSON不变', () => {
    const 订单 = 场景(2, [1, 1], '70.50')
    const 原值 = JSON.stringify(订单)
    for (const 履约 of 订单.fulfillmentOrders) {
      const 结果 = 读取拆分包裹商品投影(订单, 履约)
      expect(结果.quantity).toBe(1)
      expect(结果.items).toHaveLength(1)
      expect(结果.items[0]).toMatchObject({ quantity: 1, actualReceived: { currency: 'USD', value: '35.25' }, item: { externalLineId: 'SOURCE-LINE', orderedQuantity: 2, fulfillableQuantity: 2, unitPrice: { currency: 'USD', value: '999.99' }, actualReceived: { currency: 'USD', value: '70.50' } } })
      expect(格式化包裹金额(结果.items[0]!.actualReceived)).toBe('USD 35.25')
      结果.items[0]!.item.unitPrice.value = 'CHANGED'
      结果.items[0]!.actualReceived!.value = 'CHANGED'
    }
    expect(JSON.stringify(订单)).toBe(原值)
  })

  it('一百拆三份最大余数分配，按履约号稳定逆序处理尾差而不受数组顺序影响', () => {
    const 订单 = 场景(3, [1, 1, 1], '100', ['FULFILLMENT-Z', 'FULFILLMENT-A', 'FULFILLMENT-M'])
    expect(金额结果(订单)).toEqual({ 'FULFILLMENT-Z': '33.34', 'FULFILLMENT-A': '33.33', 'FULFILLMENT-M': '33.33' })
    订单.fulfillmentOrders.reverse()
    expect(金额结果(订单)).toEqual({ 'FULFILLMENT-A': '33.33', 'FULFILLMENT-M': '33.33', 'FULFILLMENT-Z': '33.34' })
  })

  it('两分拆四包仅两个包分到一分，不用负金额吸收尾差', () => {
    const 订单 = 场景(4, [1, 1, 1, 1], '0.02')
    expect(金额结果(订单)).toEqual({ 'FO-A': '0.00', 'FO-B': '0.00', 'FO-C': '0.01', 'FO-D': '0.01' })
  })

  it.each([
    ['0', { 'FO-A': '0.00', 'FO-B': '0.00', 'FO-C': '0.00' }],
    ['-100', { 'FO-A': '-33.33', 'FO-B': '-33.33', 'FO-C': '-33.34' }],
    ['1.23456789', { 'FO-A': '0.41', 'FO-B': '0.41', 'FO-C': '0.41' }],
  ] as const)('零、负值及八位小数来源 %s 仍按显示精度守恒', (来源, 预期) => {
    const 订单 = 场景(3, [1, 1, 1], 来源)
    expect(金额结果(订单)).toEqual(预期)
  })

  it('原下单十件、可发六件分三加三，实收只投影百分之六十', () => {
    const 订单 = 场景(10, [3, 3], '100.00')
    expect(金额结果(订单)).toEqual({ 'FO-A': '30.00', 'FO-B': '30.00' })
    expect(读取拆分包裹商品投影(订单, 订单.fulfillmentOrders[0]!).quantity).toBe(3)
  })

  it('部分履约目标份额本身四舍五入后再分配尾差，不把整行余额摊满', () => {
    const 订单 = 场景(3, [1, 1], '100')
    expect(金额结果(订单)).toEqual({ 'FO-A': '33.33', 'FO-B': '33.34' })
  })

  it.each([undefined, '', 'not-money', '1e5', 'Infinity', '1.234567891'])('来源实收 %s 缺失或非法只展示金额未知，不能按单价补造', 来源 => {
    const 订单 = 场景(2, [1, 1], 来源)
    const 结果 = 读取拆分包裹商品投影(订单, 订单.fulfillmentOrders[0]!)
    expect(结果.quantity).toBe(1)
    expect(结果.items[0]!.quantity).toBe(1)
    expect(结果.items[0]!.actualReceived).toBeUndefined()
    expect(结果.items[0]!.reason).toBeTruthy()
    expect(格式化包裹金额(结果.items[0]!.actualReceived)).toBe('—')
  })

  it('超过安全整数的钱款保持完整精度，输出与格式化都不经Number', () => {
    const 订单 = 场景(2, [1, 1], '9007199254740993.01')
    expect(金额结果(订单)).toEqual({ 'FO-A': '4503599627370496.50', 'FO-B': '4503599627370496.51' })
    expect(格式化包裹金额(订单.items[0]!.actualReceived)).toBe('USD 9,007,199,254,740,993.01')
    expect(格式化包裹金额(读取拆分包裹商品投影(订单, 订单.fulfillmentOrders[1]!).items[0]!.actualReceived)).toBe('USD 4,503,599,627,370,496.51')
  })

  it.each(['SKU-A', 'SKU-B'])('不同金额字段保留自己的币种，来源行的SKU为 %s 时也不合并或换汇', 第二SKU => {
    const 订单 = 场景(2, [1, 1], '10.00')
    订单.items[0]!.currencyCode = 'JPY'
    订单.items[0]!.unitPrice = { currency: 'EUR', value: '6.25' }
    订单.items[0]!.itemTotal = { currency: 'CAD', value: '12.50' }
    const 第二行 = { ...克隆(订单.items[0]!), externalLineId: 'SECOND-LINE', systemSku: 第二SKU, actualReceived: { currency: 'GBP', value: '6.00' } }
    订单.items.push(第二行)
    for (const 履约 of 订单.fulfillmentOrders) {
      履约.items!.push({ orderNo: 订单.systemOrderNo, externalLineId: 第二行.externalLineId, quantity: 1 })
      履约.plannedQuantity = 2
    }
    const 原值 = JSON.stringify(订单)
    const 结果 = 读取拆分包裹商品投影(订单, 订单.fulfillmentOrders[0]!)
    expect(结果.items.map(行 => [行.item.externalLineId, 行.item.systemSku, 行.quantity, 行.actualReceived])).toEqual([
      ['SOURCE-LINE', 'SKU-A', 1, { currency: 'USD', value: '5.00' }],
      ['SECOND-LINE', 第二SKU, 1, { currency: 'GBP', value: '3.00' }],
    ])
    expect(结果.items[0]!.item.unitPrice).toEqual({ currency: 'EUR', value: '6.25' })
    expect(结果.items[0]!.item.itemTotal).toEqual({ currency: 'CAD', value: '12.50' })
    expect(格式化包裹金额(结果.items[0]!.item.unitPrice)).toBe('EUR 6.25')
    expect(JSON.stringify(订单)).toBe(原值)
  })
})

describe('分包事实不可信时不退回整单商品', () => {
  it.each([0, -1, 0.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1])('非法本包量 %s 返回待核实', 数量 => {
    const 订单 = 场景(2, [1, 1], '10')
    订单.fulfillmentOrders[0]!.items![0]!.quantity = 数量
    订单.fulfillmentOrders[0]!.plannedQuantity = 数量
    expect(读取拆分包裹商品投影(订单, 订单.fulfillmentOrders[0]!)).toMatchObject({ items: [], quantity: null, reason: expect.any(String) })
  })

  it.each([
    ['重复履约', (订单: 全渠道订单) => { 订单.fulfillmentOrders.push(克隆(订单.fulfillmentOrders[0]!)) }],
    ['来源行重复', (订单: 全渠道订单) => { 订单.items.push(克隆(订单.items[0]!)) }],
    ['包内重复来源行', (订单: 全渠道订单) => { 订单.fulfillmentOrders[0]!.items!.push(克隆(订单.fulfillmentOrders[0]!.items![0]!)); 订单.fulfillmentOrders[0]!.plannedQuantity = 2 }],
    ['兄弟包缺分配', (订单: 全渠道订单) => { delete 订单.fulfillmentOrders[1]!.items }],
    ['兄弟包缺失', (订单: 全渠道订单) => { 订单.fulfillmentOrders.pop() }],
    ['其他来源订单', (订单: 全渠道订单) => { 订单.fulfillmentOrders[0]!.items![0]!.orderNo = 'OTHER-SOURCE' }],
    ['其他来源商品', (订单: 全渠道订单) => { 订单.fulfillmentOrders[0]!.items![0]!.externalLineId = 'OTHER-LINE' }],
    ['同组超分', (订单: 全渠道订单) => { 订单.fulfillmentOrders[1]!.items![0]!.quantity = 2; 订单.fulfillmentOrders[1]!.plannedQuantity = 2 }],
    ['同组漏分', (订单: 全渠道订单) => { 订单.items[0]!.fulfillableQuantity = 3; 订单.items[0]!.orderedQuantity = 3 }],
    ['其他发货安排', (订单: 全渠道订单) => { 订单.fulfillmentOrders[1]!.manualPlanId = 'OTHER-PLAN' }],
    ['目标履约已终止', (订单: 全渠道订单) => { 订单.fulfillmentOrders[0]!.isActive = false }],
  ] as const)('%s 保留来源原事实并只返回待核实', (_, 修改) => {
    const 订单 = 场景(2, [1, 1], '10')
    修改(订单)
    const 原值 = JSON.stringify(订单)
    const 结果 = 读取拆分包裹商品投影(订单, 订单.fulfillmentOrders[0]!)
    expect(结果).toMatchObject({ items: [], quantity: null, reason: expect.any(String) })
    expect(JSON.stringify(订单)).toBe(原值)
  })

  it('传入履约组成被替换或履约不在该订单中时不能借用同编号的真实分配', () => {
    const 订单 = 场景(2, [1, 1], '10')
    const 传入 = 克隆(订单.fulfillmentOrders[0]!)
    传入.items![0]!.quantity = 2
    expect(读取拆分包裹商品投影(订单, 传入).quantity).toBeNull()
    传入.fulfillmentOrderNo = 'OTHER-FO'
    expect(读取拆分包裹商品投影(订单, 传入).quantity).toBeNull()
  })

  it('空或非法金额、未知币种均显示横线，合法负金额与舍入保持精确', () => {
    expect(格式化包裹金额()).toBe('—')
    expect(格式化包裹金额({ currency: '', value: '10' })).toBe('—')
    expect(格式化包裹金额({ currency: 'USD', value: 'bad' })).toBe('—')
    expect(格式化包裹金额({ currency: 'USD', value: '-1234.565' })).toBe('USD -1,234.57')
    expect(格式化包裹金额({ currency: 'USD', value: '0' })).toBe('USD 0.00')
  })
})
