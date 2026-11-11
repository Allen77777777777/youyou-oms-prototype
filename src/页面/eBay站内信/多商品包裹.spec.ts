import { describe, expect, it } from 'vitest'
import { createConversations, createRelatedOrders } from './数据'
import { createReturnData } from '../eBay退换货申请/数据'
import { getItemPackageAllocations, getOrderItems, getPackageItems } from './多商品包裹'

const sample = () => createRelatedOrders().find(order => order.id === 'order-context-07')!

describe('站内信多商品与包裹来源分配', () => {
  it('逐订单行展示系统与平台 SKU，并维持两个包裹各自的状态和来源时间', () => {
    const order = sample(), items = getOrderItems(order)
    expect(items).toHaveLength(2)
    expect(items[0]).toMatchObject({ id: 'DEMO-CONTEXT-1007-L1', systemSku: 'HOME-CABLE-07', platformSku: 'EBAY-HOME-CABLE-07', quantity: 1 })
    expect(items[1]).toMatchObject({ systemSku: 'TRAVEL-BAG-CONTEXT-07', specification: '海军蓝 · 六件套' })
    const [delivered, inTransit] = order.logistics.records
    expect(getPackageItems(order, delivered!)).toMatchObject({ state: 'confirmed', lines: [{ orderItemId: items[0]!.id, quantity: 1, verified: true }] })
    expect(getPackageItems(order, inTransit!)).toMatchObject({ state: 'confirmed', lines: [{ orderItemId: items[1]!.id, quantity: 1, verified: true }] })
    expect(getItemPackageAllocations(order, items[0]!.id)[0]!.package).toMatchObject({ status: '已签收', latestEventAt: '2026-10-11T07:40:00Z' })
    expect(getItemPackageAllocations(order, items[1]!.id)[0]!.package).toMatchObject({ status: '运输中', latestEventAt: '2026-11-09T00:45:00Z' })
    expect(order.omsStatus).toBe('已发货')
  })

  it('旧 product 与 platformProduct 继续只读回显，不按单商品、SKU或标题推断包裹范围', () => {
    const order = createRelatedOrders()[0]!, before = structuredClone(order)
    const items = getOrderItems(order)
    expect(items).toEqual([{ title: '刹车片套装', systemSku: 'DEMO-BP-01', platformSku: 'EBAY-DEMO-BP-01', quantity: 1 }])
    expect(items[0]!.id).toBeUndefined()
    expect(getPackageItems(order, order.logistics.records[0]!)).toEqual({ state: 'unconfirmed', lines: [], message: '包裹商品范围待核实' })
    expect(getItemPackageAllocations(order, items[0]!.id)).toEqual([])
    expect(order).toEqual(before)
  })

  it('同一商品的两件分别装入两个包裹，按每包数量展示且不合并签收状态', () => {
    const order = createRelatedOrders().find(row => row.id === 'order-02')!
    const allocations = getItemPackageAllocations(order, order.items![0]!.id)
    expect(allocations.map(line => [line.package.id, line.quantity, line.package.status])).toEqual([
      ['PKG-order-02-1', 1, '运输中'], ['PKG-order-02-2', 1, '已签收'],
    ])
    expect(allocations.reduce((sum, line) => sum + line.quantity, 0)).toBe(order.items![0]!.quantity)
  })

  it('未知订单行与重复订单行身份不取首条或按同名商品补齐', () => {
    const order = sample(), pkg = order.logistics.records[0]!
    pkg.packageItems![0]!.orderItemId = 'unknown-line'
    expect(getPackageItems(order, pkg)).toMatchObject({ state: 'unconfirmed', lines: [{ orderItemId: 'unknown-line', quantity: 1, verified: false, warning: '订单行关联待核实' }] })
    pkg.packageItems![0]!.orderItemId = order.items![0]!.id!
    order.items!.push({ ...order.items![0]! })
    expect(getPackageItems(order, pkg).lines[0]!.verified).toBe(false)
    expect(getItemPackageAllocations(order, order.items![0]!.id)).toEqual([])
  })

  it('各包裹对同一商品的分配量超过订购数量时不显示为有效分配', () => {
    const order = sample(), itemId = order.items![0]!.id!
    order.logistics.records[1]!.packageItems = [{ orderItemId: itemId, quantity: 1 }]
    for (const pkg of order.logistics.records) expect(getPackageItems(order, pkg).lines[0]).toMatchObject({ verified: false, warning: '包裹分配数量超过订单数量，待核实' })
    expect(getItemPackageAllocations(order, itemId)).toEqual([])
    expect(order.items![0]!.quantity).toBe(1)
  })

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])('异常包裹数量 %s 保留待核实且不参与分配', quantity => {
    const order = sample(), pkg = order.logistics.records[0]!
    pkg.packageItems![0]!.quantity = quantity
    expect(getPackageItems(order, pkg).lines[0]).toMatchObject({ verified: false, warning: '包裹商品数量待核实' })
    expect(getItemPackageAllocations(order, order.items![0]!.id)).toEqual([])
  })

  it('重复包裹身份或同包重复分配不能累计为可靠发运数量', () => {
    const order = sample(), pkg = order.logistics.records[0]!
    pkg.packageItems!.push({ ...pkg.packageItems![0]! })
    expect(getPackageItems(order, pkg).lines.every(line => !line.verified)).toBe(true)
    pkg.packageItems!.pop()
    order.logistics.records.push(structuredClone(pkg))
    expect(getPackageItems(order, pkg).lines[0]).toMatchObject({ verified: false, warning: '包裹来源身份待核实' })
    expect(getItemPackageAllocations(order, order.items![0]!.id)).toEqual([])
  })

  it('部分明确分配不自动补足未分配数量，克隆对象按来源身份读取原包裹', () => {
    const order = sample(), pkg = order.logistics.records[0]!
    order.items![0]!.quantity = 2
    const cloned = { ...structuredClone(pkg), packageItems: [{ orderItemId: order.items![1]!.id!, quantity: 99 }] }
    expect(getPackageItems(order, cloned).lines[0]).toMatchObject({ orderItemId: order.items![0]!.id, quantity: 1, verified: true })
    expect(getItemPackageAllocations(order, order.items![0]!.id)).toHaveLength(1)
    expect(getItemPackageAllocations(order, order.items![0]!.id)[0]!.quantity).toBe(1)
  })

  it('物流读取失败时不把旧包裹分配继续显示为有效', () => {
    const order = sample()
    order.logistics.state = 'failed'
    expect(getPackageItems(order, order.logistics.records[0]!)).toMatchObject({ state: 'unconfirmed', lines: [] })
    expect(getItemPackageAllocations(order, order.items![0]!.id)).toEqual([])
  })

  it('独立会话与已有 Return 007 精确同店、同单、同买家；原分页售前样例不变', () => {
    const order = sample(), source = createReturnData().find(row => row.id === 'DEMO-RT-007')!
    const conversation = createConversations().find(row => row.id === 'conv-context-07')!
    expect([order.shopId, order.orderNo, order.buyerId]).toEqual([source.shopId, source.orderNo, source.buyerId])
    expect(conversation).toMatchObject({ shopId: order.shopId, buyerId: order.buyerId, association: 'confirmed', relatedOrderIds: [order.id] })
    expect(order.items!.find(item => item.systemSku === source.sku)?.quantity).toBe(source.quantity)
    expect(order.afterSales.records[0]!.id).toBe(source.id)
    expect(createConversations().filter(row => /^conv-(09|1\d|2[0-8])$/.test(row.id)).every(row => row.association === 'none')).toBe(true)
  })
})
