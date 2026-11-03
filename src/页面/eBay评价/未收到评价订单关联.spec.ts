import { describe, expect, it } from 'vitest'
import { 全渠道订单模拟数据 } from '../全渠道订单/模拟数据'
import type { 全渠道订单 } from '../全渠道订单/类型'
import type { AwaitingReviewOrder } from './未收到评价模型'
import { isAwaitingOmsSnapshotConsistent, resolveAwaitingOmsOrder } from './未收到评价订单关联'

function fixture(): { source: AwaitingReviewOrder; order: 全渠道订单 } {
  const order = structuredClone(全渠道订单模拟数据[0]!)
  Object.assign(order, { systemOrderNo: 'OMS-LINK-DEMO', platformCode: 'eBay', storeId: 'shop-link', buyerExternalId: 'buyer-link', platformOrderNo: 'EBAY-LINK-DEMO' })
  const source: AwaitingReviewOrder = {
    id: 'AWAIT-LINK-DEMO', omsOrderId: order.systemOrderNo, omsOrderNo: order.systemOrderNo, shopId: order.storeId, shopName: order.storeName,
    buyerId: order.buyerExternalId!, orderNo: order.platformOrderNo, platform: 'eBay', processingStatus: '已发货', shippedAt: '2026-10-20T10:00:00+08:00',
    outboundStatuses: ['已出库'], trackingNumbers: [], coverage: 'complete', association: 'confirmed', notes: [],
    lines: order.items.map(item => ({ id: item.externalLineId, orderLineItemId: `FEEDBACK-${item.externalLineId}`, listingId: item.platformItemId ?? '', title: item.platformItemTitle ?? '', sku: item.systemSku ?? '', platformSku: item.platformSku ?? '', quantity: item.orderedQuantity, association: 'confirmed' })),
  }
  return { source, order }
}

describe('未收到评价订单的 OMS 只读关联', () => {
  it('稳定主身份唯一时返回原订单，读取不修改任何业务事实', () => {
    const { source, order } = fixture(), before = JSON.stringify({ source, order })
    expect(resolveAwaitingOmsOrder(source, [order])).toBe(order)
    expect(JSON.stringify({ source, order })).toBe(before)
  })

  it.each(['omsOrderId', 'omsOrderNo', 'shopId', 'buyerId', 'orderNo'] as const)('来源%s缺失不按其他字段猜订单', key => {
    const { source, order } = fixture(); source[key] = ''
    expect(resolveAwaitingOmsOrder(source, [order])).toBeUndefined()
  })

  it('来源两个 OMS 身份不一致或找不到指定主键时不跳转', () => {
    const { source, order } = fixture()
    source.omsOrderId = 'OTHER-OMS'
    expect(resolveAwaitingOmsOrder(source, [order])).toBeUndefined()
    source.omsOrderId = source.omsOrderNo
    expect(resolveAwaitingOmsOrder(source, [])).toBeUndefined()
  })

  it.each(['platformCode', 'storeId', 'buyerExternalId', 'platformOrderNo'] as const)('目标%s冲突时拒绝已知单号的错误归属', key => {
    const { source, order } = fixture()
    if (key === 'platformCode') order.platformCode = 'Temu'
    else order[key] = 'OTHER'
    expect(resolveAwaitingOmsOrder(source, [order])).toBeUndefined()
  })

  it('全局系统主键或同店铺平台单身份重复时拒绝取首条', () => {
    const { source, order } = fixture(), duplicate = structuredClone(order)
    expect(resolveAwaitingOmsOrder(source, [order, duplicate])).toBeUndefined()
    duplicate.systemOrderNo = 'OTHER-OMS'
    duplicate.buyerExternalId = 'OTHER-BUYER'
    expect(resolveAwaitingOmsOrder(source, [order, duplicate])).toBeUndefined()
    duplicate.storeId = 'other-shop'
    expect(resolveAwaitingOmsOrder(source, [order, duplicate])).toBe(order)
  })

  it('Feedback资格未知、订单处理状态或商品后续变化不阻止可靠 OMS 主键只读查看', () => {
    const { source, order } = fixture()
    source.coverage = 'unknown'; source.association = 'unknown'; source.lines.forEach(line => { line.association = 'unknown'; line.orderLineItemId = '' })
    order.processingStatus = '异常'; order.items[0]!.orderedQuantity += 1
    expect(resolveAwaitingOmsOrder(source, [order])).toBe(order)
    expect(isAwaitingOmsSnapshotConsistent(source, order)).toBe(false)
  })
})

describe('未收到评价 OMS 演示快照一致性', () => {
  it('用完整来源商品行而非未评价子集校验，行排序及 Feedback ID 不影响比较', () => {
    const { source, order } = fixture()
    expect(isAwaitingOmsSnapshotConsistent(source, order)).toBe(true)
    source.lines.reverse(); source.lines.forEach(line => { line.orderLineItemId = 'ANOTHER-FEEDBACK-ID' })
    expect(isAwaitingOmsSnapshotConsistent(source, order)).toBe(true)
    source.lines.pop()
    expect(isAwaitingOmsSnapshotConsistent(source, order)).toBe(false)
  })

  it.each(['listingId', 'sku', 'platformSku', 'quantity', 'id'] as const)('商品%s冲突不会被 SKU 或其他行兜底', key => {
    const { source, order } = fixture()
    if (key === 'quantity') source.lines[0]!.quantity += 1
    else source.lines[0]![key] = 'OTHER'
    expect(isAwaitingOmsSnapshotConsistent(source, order)).toBe(false)
  })

  it('缺少商品行、重复行身份和无效数量不能作为一致的演示快照', () => {
    const { source, order } = fixture()
    source.lines = []; order.items = []
    expect(isAwaitingOmsSnapshotConsistent(source, order)).toBe(false)
    const next = fixture()
    next.source.lines.push({ ...next.source.lines[0]! }); next.order.items.push({ ...next.order.items[0]! })
    expect(isAwaitingOmsSnapshotConsistent(next.source, next.order)).toBe(false)
    const invalid = fixture(); invalid.source.lines[0]!.quantity = NaN
    expect(isAwaitingOmsSnapshotConsistent(invalid.source, invalid.order)).toBe(false)
  })

  it('双方同缺可选商品资料不伪造字段，也不影响稳定行身份', () => {
    const { source, order } = fixture()
    for (const line of source.lines) { line.listingId = ''; line.sku = ''; line.platformSku = '' }
    for (const item of order.items) { delete item.platformItemId; delete item.systemSku; delete item.platformSku }
    expect(isAwaitingOmsSnapshotConsistent(source, order)).toBe(true)
    expect(resolveAwaitingOmsOrder(source, [order])).toBe(order)
  })
})
