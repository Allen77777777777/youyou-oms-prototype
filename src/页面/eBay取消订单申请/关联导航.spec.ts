import { describe, expect, it } from 'vitest'
import { createCancellations } from './模型'
import { resolveCancellationOrder, resolveCancellationOutbound } from './关联导航'
import { 共享订单, 取消申请OMS样例 } from '../订单处理/演示会话'
import { 仓库会话单据 } from '../仓配管理/仓配会话'
import { initializeReturnDemoContext } from '../eBay退换货申请/关联资料'

const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

describe('取消申请详情关联身份', () => {
  it('所有明确关联订单可打开共享详情，商品与仓单来源一致', () => {
    const sources = createCancellations()
    initializeReturnDemoContext('OMS-DEMO-RET-002')
    const linkedNumbers = sources.flatMap(source => source.systemOrderNo ? [source.systemOrderNo] : [])
    expect(取消申请OMS样例.订单.some(row => row.systemOrderNo === 'OMS-DEMO-RET-002')).toBe(false)
    expect(共享订单.value.filter(order => linkedNumbers.includes(order.systemOrderNo))).toHaveLength(linkedNumbers.length)
    for (const source of sources) {
      const order = resolveCancellationOrder(source, 共享订单.value)
      if (!source.systemOrderNo) { expect(order).toBeUndefined(); continue }
      expect(order).toBeDefined()
      expect(order!.items.map(item => [item.systemSku, item.orderedQuantity])).toEqual(source.products.map(item => [item.sku, item.quantity]))
      for (const context of source.outbounds || []) {
        const outbound = resolveCancellationOutbound(source, context, 仓库会话单据.value, 共享订单.value)
        expect(outbound).toBeDefined(); expect(outbound!.outboundDetail!.snapshotReliable).toBe(true)
        expect(outbound!.outboundDetail!.items.length).toBeGreaterThan(0)
        expect(outbound!.status).toBe(context.status)
      }
    }
  })
  it('订单缺失、重复或店铺买家平台身份不一致时不猜测', () => {
    const source = createCancellations()[0]!, order = resolveCancellationOrder(source, 共享订单.value)!
    expect(resolveCancellationOrder(source, [])).toBeUndefined()
    expect(resolveCancellationOrder(source, [order, order])).toBeUndefined()
    for (const patch of [{ shopId: 'other' }, { buyer: 'other' }, { orderId: 'other' }, { systemOrderNo: undefined }]) expect(resolveCancellationOrder({ ...source, ...patch }, [order])).toBeUndefined()
    expect(resolveCancellationOrder(source, [order, { ...order, systemOrderNo: 'DUPLICATE-PLATFORM-IDENTITY' }])).toBeUndefined()
  })
  it('仓单不依赖可空外部号兜底，稳定ID、账号、仓库和来源冲突时拦截', () => {
    const source = createCancellations()[1]!, context = source.outbounds![1]!
    const row = resolveCancellationOutbound(source, context, 仓库会话单据.value, 共享订单.value)!
    expect(context.externalNo).toBeNull(); expect(row).toBeDefined()
    expect(resolveCancellationOutbound(source, { ...context, outboundId: undefined }, [row], 共享订单.value)).toBeUndefined()
    expect(resolveCancellationOutbound(source, context, [row, row], 共享订单.value)).toBeUndefined()
    for (const patch of [{ account: 'other' }, { warehouse: 'other' }, { externalNo: 'other' }, { no: 'other' }]) expect(resolveCancellationOutbound(source, { ...context, ...patch }, [row], 共享订单.value)).toBeUndefined()
    const changed = copy(row); changed.outboundDetail!.sourceOrders[0]!.shopId = 'other'
    expect(resolveCancellationOutbound(source, context, [changed], 共享订单.value)).toBeUndefined()
  })
})
