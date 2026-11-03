import { 全渠道订单模拟数据 } from '../全渠道订单/模拟数据'
import type { 全渠道订单, 订单路由, 履约单摘要 } from '../全渠道订单/类型'
import { 共享订单, 仓库执行记录, type 仓库执行 } from '../订单处理/演示会话'
import { 仓库会话单据, 创建仓库执行投影 } from '../仓配管理/仓配会话'
import { 创建推单出库快照 } from '../仓配管理/三方仓出库模型'
import { createReturnData } from './数据'
import { resolveReturnOrder } from './关联导航'
import { returnKey, type ReturnRecord } from './模型'
import { demoReturnItemLinks } from './虚构商品关联'

const money = (cents: number, currency: string) => ({ currency, value: `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}` })
// 固定虚构订单单价，与Return预计退款额独立，不从退款字段反算订单价格。
const demoOrderUnitPrices = new Map<string, number>([
  [JSON.stringify(['shop-us', 'DEMO-RT-001']), 4990],
  [JSON.stringify(['demo-outdoor-uk', 'DEMO-RT-002']), 3680],
  [JSON.stringify(['shop-us', 'DEMO-RT-003']), 2950],
])

function createDemoOrder(source: ReturnRecord): { order: 全渠道订单; executions: 仓库执行[] } {
  const orderProducts = source.orderProducts!, outbounds = source.outbounds!
  const requestedItemCents = demoOrderUnitPrices.get(returnKey(source))
  if (requestedItemCents === undefined) throw new Error('退货固定虚构订单缺少独立价格资料')
  const unitPrices = orderProducts.map((_, index) => index === 0 ? requestedItemCents : 1000)
  const orderAmountCents = orderProducts.reduce((sum, item, index) => sum + unitPrices[index]! * item.quantity, 0)
  const firstOutbound = outbounds[0]!
  const orderRoute: 订单路由 = { warehouse: firstOutbound.warehouse, warehouseProvider: firstOutbound.warehouse.split(' · ')[0]!, warehouseAccount: firstOutbound.account, shippingChannel: firstOutbound.channel!, shippingChannelCode: firstOutbound.channelCode!, labelMode: '仓配一体' }
  const order: 全渠道订单 = {
    ...structuredClone(全渠道订单模拟数据[0]!),
    systemOrderNo: source.systemOrderNo!, platformCode: 'eBay', platformOrderId: source.orderNo, platformOrderNo: source.orderNo, platformOrderStatus: source.platformOrderStatus!,
    storeId: source.shopId, storeName: source.shopName, buyerExternalId: source.buyerId, professionalOrder: undefined,
    orderType: '线上订单', fulfillmentMode: '自配送', processingStatus: '已发货', defaultRoute: orderRoute, manualShippingPlan: undefined,
    address: { fullName: 'DEMO***', countryCode: source.marketplaceId === 'EBAY_GB' ? 'GB' : 'US', city: 'DEMO CITY', addressLine1: 'DEMO *** STREET', postalCode: 'DEMO***' },
    items: orderProducts.map((item, index) => ({ externalLineId: `DEMO-RET-ORDER-LINE-${source.id}-${index + 1}`, platformItemTitle: item.title, platformSku: `PLATFORM-${item.sku}`, systemSku: item.sku, systemItemName: item.title, orderedQuantity: item.quantity, fulfillableQuantity: item.quantity, skuResolutionStatus: '成功', currencyCode: source.currency, unitPrice: money(unitPrices[index]!, source.currency), itemTotal: money(unitPrices[index]! * item.quantity, source.currency) })),
    amount: { orderAmount: money(orderAmountCents, source.currency) },
    orderedAt: '2026-10-08T02:00:00Z', paidAt: '2026-10-08T02:05:00Z', createdAt: '2026-10-08T02:10:00Z',
    lastSyncedAt: source.lastSyncedAt, platformUpdatedAt: undefined, shipByAt: undefined, shipByLabel: '—', urgency: '正常',
    fulfillmentCompletedAt: '2026-10-10T05:00:00Z', fulfillmentOrders: [], reviews: [], operationLogs: [], tags: [],
    blockReason: undefined, noShipmentReason: undefined, admissionReason: undefined, cancelledAt: undefined, cancelledReason: undefined,
    sync: { status: '已同步', normalizationStatus: '已标准化', latestAttempt: source.lastSyncedAt, lastSuccess: source.lastSyncedAt, message: '退货详情固定虚构整单资料；真实API未接入。' },
  }
  const executions: 仓库执行[] = []
  for (const [index, outbound] of outbounds.entries()) {
    const route: 订单路由 = { ...orderRoute, warehouse: outbound.warehouse, warehouseProvider: outbound.warehouse.split(' · ')[0]!, warehouseAccount: outbound.account, shippingChannel: outbound.channel!, shippingChannelCode: outbound.channelCode! }
    const items = outbounds.length === 1 ? order.items : [order.items[index]!]
    const planned = items.reduce((sum, item) => sum + item.orderedQuantity, 0)
    const fulfillment: 履约单摘要 = { fulfillmentOrderNo: `FL-DEMO-RET-${source.id}-${index + 1}`, status: '待执行', isActive: true, route, plannedQuantity: planned, shippedQuantity: 0, items: items.map(item => ({ orderNo: order.systemOrderNo, externalLineId: item.externalLineId, quantity: item.orderedQuantity })) }
    order.fulfillmentOrders.push(fulfillment)
    const snapshot = 创建推单出库快照([order], fulfillment.fulfillmentOrderNo, '2026-10-09T03:00:00Z')
    snapshot.quantitySummary = { plannedQuantity: planned, shippedQuantity: planned, unit: '件' }
    snapshot.lastSyncedAt = source.lastSyncedAt; snapshot.shippedAt = outbound.shippedAt
    for (const item of snapshot.items) { item.shippedQuantity = item.plannedQuantity; item.unit = '件'; item.lineStatus = '已出库' }
    Object.assign(fulfillment, { status: '已发货', shippedQuantity: planned, trackingNumber: outbound.tracking!, shippedAt: outbound.shippedAt! })
    executions.push({ 履约单号: fulfillment.fulfillmentOrderNo, 订单号: [order.systemOrderNo], 出库单号: outbound.no, 三方仓出库单号: outbound.externalNo!, 状态: '已出库', 待核查: false, 原因: '', 更新时间: source.lastSyncedAt, 出库快照: snapshot, 出库事实: { planned, shipped: planned, tracking: outbound.tracking, shippedAt: outbound.shippedAt } })
  }
  return { order, executions }
}

/** 仅退货页面显式初始化；导入模块、创建来源数据或其他工作台启动不会新增共享订单。 */
export function initializeReturnDemoContext(): void {
  for (const source of createReturnData().filter(row => row.systemOrderNo && row.orderProducts?.length && row.outbounds?.length)) {
    const sameSystemId = 共享订单.value.filter(order => order.systemOrderNo === source.systemOrderNo)
    // 有现成身份时只复用，不从来源商品或编号覆盖现有共享事实。
    if (sameSystemId.length) continue
    const platformIdentity = 共享订单.value.filter(order => order.platformCode === 'eBay' && order.storeId === source.shopId && order.platformOrderNo === source.orderNo)
    if (platformIdentity.length) continue
    const { order, executions } = createDemoOrder(source)
    if (!resolveReturnOrder(source, [order])) continue
    const detail = source.detail
    const item = order.items[0]
    if (detail?.itemId && detail.transactionId && item) {
      item.platformItemId = detail.itemId
      demoReturnItemLinks.push({ shopId: source.shopId, orderNo: source.orderNo, itemId: detail.itemId, transactionId: detail.transactionId, systemOrderNo: order.systemOrderNo, externalLineId: item.externalLineId })
    }
    共享订单.value.push(order)
    for (const execution of executions) {
      if (仓库执行记录.value.some(existing => existing.出库单号 === execution.出库单号)) continue
      仓库执行记录.value.push(execution)
      const projected = 创建仓库执行投影(execution)
      if (!仓库会话单据.value.some(existing => existing.id === projected.id)) 仓库会话单据.value.push(projected)
    }
  }
}
