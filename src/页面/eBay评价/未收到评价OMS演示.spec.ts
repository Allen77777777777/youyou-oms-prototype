import { beforeEach, describe, expect, it } from 'vitest'
import { 共享订单, 仓库执行记录, 评价跟踪OMS样例, 取消申请OMS样例 } from '../订单处理/演示会话'
import { 仓库会话单据 } from '../仓配管理/仓配会话'
import { 共享标发单 } from '../订单标发/演示会话'
import { createAwaitingReviewOrders } from './未收到评价数据'
import { awaitingReviewSession, getAwaitingReviewOrders, resetAwaitingReviewSession } from './未收到评价会话'
import { isAwaitingOmsSnapshotConsistent, resolveAwaitingOmsOrder } from './未收到评价订单关联'
import { createBuyerFeedback, createReviews } from './数据'
import { createAwaitingReviewFilters, filterAwaitingReviewOrders, projectAwaitingReviewOrders } from './未收到评价模型'

const sources = () => createAwaitingReviewOrders().filter(source => source.omsOrderId)
beforeEach(() => resetAwaitingReviewSession())

describe('未收到评价共享 OMS 演示资料', () => {
  it('31条明确来源与共享OMS主身份及全部商品一一对应，不把Feedback ID当OMS商品行ID', () => {
    const orders = sources()
    expect(orders).toHaveLength(31)
    expect(评价跟踪OMS样例.订单).toHaveLength(31)
    expect(new Set(orders.map(source => source.omsOrderNo)).size).toBe(31)
    for (const source of orders) {
      const target = resolveAwaitingOmsOrder(source, 共享订单.value)
      expect(target, source.id).toBeDefined()
      expect(isAwaitingOmsSnapshotConsistent(source, target!)).toBe(true)
      expect(target!.items.map(item => [item.externalLineId, item.platformItemTitle, item.orderedQuantity])).toEqual(source.lines.map(line => [line.id, line.title, line.quantity]))
      expect(target!.buyerExternalId).toBe(source.buyerId)
      expect(target!.platformOrderNo).toBe(source.orderNo)
      expect(source.lines.every(line => line.id !== line.orderLineItemId)).toBe(true)
    }
    const unmatched = createAwaitingReviewOrders().find(source => source.id === 'AWAIT-DEMO-ASSOCIATION')!
    expect(unmatched.omsOrderId).toBeUndefined()
    expect(resolveAwaitingOmsOrder(unmatched, 共享订单.value)).toBeUndefined()
  })

  it('每单有明确完整出库快照、履约与跟踪号，仓单详情可读且未伪造平台标发', () => {
    for (const source of sources()) {
      const order = resolveAwaitingOmsOrder(source, 共享订单.value)!
      expect(order.processingStatus).toBe('已发货')
      expect(order.fulfillmentOrders).toHaveLength(1)
      const fulfillment = order.fulfillmentOrders[0]!
      const total = source.lines.reduce((sum, line) => sum + line.quantity, 0)
      expect(fulfillment).toMatchObject({ status: '已发货', isActive: true, plannedQuantity: total, shippedQuantity: total, shippedAt: source.shippedAt, trackingNumber: source.trackingNumbers[0] })
      const executions = 仓库执行记录.value.filter(execution => execution.履约单号 === fulfillment.fulfillmentOrderNo)
      expect(executions).toHaveLength(1)
      const execution = executions[0]!, snapshot = execution.出库快照!
      expect(execution.出库单号).toBe(`CK-DEMO-AWAIT-${source.id}`)
      expect(execution.订单号).toEqual([order.systemOrderNo])
      expect(execution.状态).toBe('已出库')
      expect(snapshot.snapshotReliable).toBe(true)
      expect(snapshot.quantitySummary).toEqual({ plannedQuantity: total, shippedQuantity: total, unit: '件' })
      expect(snapshot.items.reduce((sum, line) => sum + line.shippedQuantity!, 0)).toBe(total)
      expect(snapshot.items.map(line => [line.externalLineId, line.shippedQuantity])).toEqual(source.lines.map(line => [line.id, line.quantity]))
      expect(仓库会话单据.value.filter(row => row.no === execution.出库单号)).toHaveLength(1)
      expect(共享标发单.value.filter(mark => mark.orderNo === order.systemOrderNo)).toEqual([])
    }
  })

  it('共享OMS与评价来源不双重展示，原未评价/待核对数量及历史评价口径保持', () => {
    const projected = getAwaitingReviewOrders()
    for (const source of sources()) {
      expect(projected.filter(order => order.omsOrderNo === source.omsOrderNo)).toHaveLength(1)
      expect(projected.find(order => order.id === source.id)!.omsOrderId).toBe(source.omsOrderNo)
    }
    const rows = filterAwaitingReviewOrders(projectAwaitingReviewOrders(projected, createReviews(), createBuyerFeedback()), { ...createAwaitingReviewFilters(), status: 'all' })
    const cancellationNos = new Set(取消申请OMS样例.订单.map(order => order.systemOrderNo))
    const originalOrders = 共享订单.value
    let baselineRows: typeof rows = []
    try {
      共享订单.value = originalOrders.filter(order => !cancellationNos.has(order.systemOrderNo))
      baselineRows = filterAwaitingReviewOrders(projectAwaitingReviewOrders(getAwaitingReviewOrders(), createReviews(), createBuyerFeedback()), { ...createAwaitingReviewFilters(), status: 'all' })
    } finally { 共享订单.value = originalOrders }
    expect(baselineRows.filter(row => row.status === 'unreviewed')).toHaveLength(27)
    expect(baselineRows.filter(row => row.status === 'check')).toHaveLength(8)
    expect(rows.filter(row => !cancellationNos.has(row.omsOrderNo))).toEqual(baselineRows)
    const cancellationRows = rows.filter(row => cancellationNos.has(row.omsOrderNo))
    expect(cancellationRows).toHaveLength(1)
    const cancellation = cancellationRows[0]!
    expect(cancellation).toMatchObject({ id: 'OMS-SHARED:OMS-DEMO-CXL-0003', omsOrderNo: 'OMS-DEMO-CXL-0003', status: 'check', coverage: 'unknown', association: 'unknown' })
    expect(projected.filter(row => row.omsOrderNo === cancellation.omsOrderNo)).toHaveLength(1)
    expect(cancellation.lines.every(line => line.orderLineItemId === '' && line.association === 'unknown')).toBe(true)
    expect(rows.filter(row => row.status === 'unreviewed')).toHaveLength(27)
    expect(rows.filter(row => row.status === 'check')).toHaveLength(8 + cancellationRows.length)
    expect(rows.some(row => row.id.startsWith('AWAIT-DEMO-RECEIVED-'))).toBe(false)
  })

  it('仅商品文案更新同步当前资料，不撤销稳定OMS详情身份', () => {
    const before = 共享订单.value
    try {
      const source = sources()[0]!
      const clone = JSON.parse(JSON.stringify(resolveAwaitingOmsOrder(source, before)!)) as typeof before[number]
      clone.items[0]!.platformItemTitle = '更新后的折叠收纳箱'
      共享订单.value = before.map(order => order.systemOrderNo === clone.systemOrderNo ? clone : order)
      const row = getAwaitingReviewOrders().find(order => order.id === source.id)!
      expect(row.lines[0]!.title).toBe('更新后的折叠收纳箱')
      expect(row.association).toBe('confirmed')
      expect(resolveAwaitingOmsOrder(row, 共享订单.value)).toBeDefined()
      expect(getAwaitingReviewOrders().filter(order => order.omsOrderNo === source.omsOrderNo)).toHaveLength(1)
    } finally { 共享订单.value = before }
  })

  it('当前商品范围变化保留OMS只读链接，映射归待核对且不静默丢新增商品', () => {
    const before = 共享订单.value
    try {
      const source = sources()[0]!
      const clone = JSON.parse(JSON.stringify(resolveAwaitingOmsOrder(source, before)!)) as typeof before[number]
      clone.items.push({ ...clone.items[0]!, externalLineId: 'NEW-OMS-LINE', orderedQuantity: 2, platformSku: 'NEW-PLATFORM-SKU' })
      共享订单.value = before.map(order => order.systemOrderNo === clone.systemOrderNo ? clone : order)
      const row = getAwaitingReviewOrders().find(order => order.id === source.id)!
      expect(row).toMatchObject({ omsOrderId: source.omsOrderNo, association: 'unknown', coverage: 'unknown' })
      expect(row.lines).toHaveLength(clone.items.length)
      expect(row.lines.find(line => line.id === 'NEW-OMS-LINE')).toMatchObject({ association: 'unknown', orderLineItemId: '', quantity: 2 })
      expect(resolveAwaitingOmsOrder(row, 共享订单.value)).toBeDefined()
      expect(getAwaitingReviewOrders().filter(order => order.omsOrderNo === source.omsOrderNo)).toHaveLength(1)
      expect(awaitingReviewSession.orders.find(order => order.id === source.id)!.lines).toHaveLength(source.lines.length)
    } finally { 共享订单.value = before }
  })

  it('主身份缺失、冲突或重复时不指向错误订单，来源仍以待核对保留', () => {
    const before = 共享订单.value
    try {
      const source = sources()[0]!
      共享订单.value = before.filter(order => order.systemOrderNo !== source.omsOrderNo)
      const missing = getAwaitingReviewOrders().find(order => order.id === source.id)!
      expect(missing).toMatchObject({ association: 'unknown', coverage: 'unknown' })
      expect(missing.omsOrderId).toBeUndefined()
      const clone = JSON.parse(JSON.stringify(resolveAwaitingOmsOrder(source, before)!)) as typeof before[number]
      clone.buyerExternalId = 'DIFFERENT-BUYER'
      共享订单.value = before.map(order => order.systemOrderNo === clone.systemOrderNo ? clone : order)
      expect(getAwaitingReviewOrders().find(order => order.id === source.id)!.omsOrderId).toBeUndefined()
      共享订单.value = [...before, JSON.parse(JSON.stringify(resolveAwaitingOmsOrder(source, before)!)) as typeof before[number]]
      expect(getAwaitingReviewOrders().find(order => order.id === source.id)!.omsOrderId).toBeUndefined()
    } finally { 共享订单.value = before }
  })
})
