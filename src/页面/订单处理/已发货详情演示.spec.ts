import { describe, expect, it } from 'vitest'
import { 创建已发货详情演示, 已发货详情演示目录 } from './已发货详情演示'
import { 全渠道订单模拟数据 } from '../全渠道订单/模拟数据'
import type { 全渠道订单, 订单路由 } from '../全渠道订单/类型'

const 路由: 订单路由[] = [
  { warehouse: '万邑通美西仓', warehouseProvider: '万邑通', warehouseAccount: '万邑通 · 北美主体', shippingChannel: 'USPS Ground Advantage', shippingChannelCode: 'WYT-USPS-GA', shippingChannelId: 'DEMO-CF-CHANNEL-WYT', labelMode: '仓配一体' },
  { warehouse: '谷仓美东仓', warehouseProvider: '谷仓', warehouseAccount: '谷仓 · 北美主体', shippingChannel: 'FedEx Home Delivery', shippingChannelCode: 'GC-FEDEX-HD', shippingChannelId: 'DEMO-CF-CHANNEL-GC', labelMode: '仓配一体' },
]
const 创建 = () => 创建已发货详情演示((_序号: number, 覆盖: Partial<全渠道订单> = {}) => ({ ...structuredClone(全渠道订单模拟数据[0]!), ...覆盖 }), 路由)

describe('已发货详情三类固定演示事实', () => {
  it('提供三个主入口和合并的另一来源，全部交易金额配平且不改变模板与路由', () => {
    const before = JSON.stringify({ template: 全渠道订单模拟数据[0], routes: 路由 }), data = 创建()
    expect(已发货详情演示目录).toHaveLength(3)
    expect(data.订单).toHaveLength(4)
    expect(new Set(data.订单.map(order => order.systemOrderNo)).size).toBe(4)
    for (const order of data.订单) {
      expect(order.processingStatus).toBe('已发货'); expect(order.platformOrderStatus).toBe('FULFILLED')
      const cents = (text: string) => BigInt(text.replace('.', ''))
      expect(order.items.reduce((sum, item) => sum + cents(item.itemTotal.value), 0n)).toBe(cents(order.amount.orderAmount.value))
      for (const item of order.items) expect(cents(item.unitPrice.value) * BigInt(item.orderedQuantity)).toBe(cents(item.itemTotal.value))
      expect(order.reviews[0]!.status).toBe('已通过')
      expect(order.operationLogs[0]!.content).toContain('虚构')
      expect(order.fulfillmentOrders.every(f => f.isActive && f.status === '已发货' && f.plannedQuantity === f.shippedQuantity)).toBe(true)
    }
    expect(JSON.stringify({ template: 全渠道订单模拟数据[0], routes: 路由 })).toBe(before)
  })

  it('拆单形成两条独立路线及仓单，正常单一条，合并两来源仅一条共享执行', () => {
    const data = 创建(), split = data.订单[0]!, normal = data.订单[1]!, a = data.订单[2]!, b = data.订单[3]!
    expect(split.fulfillmentOrders).toHaveLength(2)
    expect(new Set(split.fulfillmentOrders.map(f => f.route.shippingChannelCode)).size).toBe(2)
    expect(new Set(split.fulfillmentOrders.map(f => f.trackingNumber)).size).toBe(2)
    expect(normal.manualShippingPlan).toBeUndefined(); expect(normal.fulfillmentOrders).toHaveLength(1)
    expect(a.manualShippingPlan?.kind).toBe('合并发货')
    expect(a.manualShippingPlan?.orderNos).toEqual([a.systemOrderNo, b.systemOrderNo])
    expect(a.fulfillmentOrders).toEqual(b.fulfillmentOrders)
    expect(a.fulfillmentOrders[0]!.items).toHaveLength(2)
    expect(a.fulfillmentOrders[0]!.plannedQuantity).toBe(3)
    expect(data.执行).toHaveLength(4)
    expect(data.执行.filter(row => row.订单号.length === 2)).toHaveLength(1)
    expect(a.address).toEqual(b.address); expect(a.buyerExternalId).toBe(b.buyerExternalId)
  })

  it('所有仓单保留精确逐行出库与快照，标发逐来源归属不重复计入共享包总量', () => {
    const data = 创建()
    for (const execution of data.执行) {
      const snapshot = execution.出库快照!
      expect(snapshot.snapshotReliable).toBe(true)
      expect(snapshot.items.length).toBeGreaterThan(0)
      expect(snapshot.items.every(item => item.plannedQuantity === item.shippedQuantity && item.lineStatus === '已出库' && item.warehouseSku && item.unit === '件')).toBe(true)
      expect(snapshot.items.reduce((sum, item) => sum + item.shippedQuantity!, 0)).toBe(execution.出库事实!.shipped)
      expect(snapshot.sourceOrders.map(order => order.systemOrderNo)).toEqual(execution.订单号)
      expect(snapshot.shippedAt).toBe(execution.出库事实!.shippedAt)
    }
    expect(data.标发).toHaveLength(5)
    for (const mark of data.标发) {
      const order = data.订单.find(order => order.systemOrderNo === mark.orderNo)!, line = order.items.find(item => item.externalLineId === mark.lineId)!
      const execution = data.执行.find(row => row.出库单号 === mark.outboundNo)!
      expect(mark.status).toBe('标发成功'); expect(mark.quantity).toBe(line.orderedQuantity)
      expect(mark.fulfillmentNo).toBe(execution.履约单号); expect(mark.tracking).toBe(execution.出库事实!.tracking)
      expect(mark.attempts).toHaveLength(1)
    }
    const shared = data.标发.filter(mark => mark.fulfillmentNo === 'FL-DEMO-DETAIL-MERGE')
    expect(shared.map(mark => mark.quantity)).toEqual([2, 1])
    expect(new Set(shared.map(mark => mark.orderNo)).size).toBe(2)
  })
})
