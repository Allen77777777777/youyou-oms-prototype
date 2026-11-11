import type { 全渠道订单, 订单路由, 履约单摘要 } from '../全渠道订单/类型'
import type { 仓库执行 } from '../订单处理/演示会话'
import { 创建推单出库快照 } from '../仓配管理/三方仓出库模型'
import { createCancellations } from './模型'

/** 固定虚构关联资料与取消申请共享来源身份，不将来源编号指向无关订单。 */
export function 创建取消申请OMS演示(createOrder: (index: number, patch?: Partial<全渠道订单>) => 全渠道订单): { 订单: 全渠道订单[]; 执行: 仓库执行[] } {
  const 订单: 全渠道订单[] = [], 执行: 仓库执行[] = []
  for (const [index, source] of createCancellations().entries()) {
    // 该跨功能样例使用退货原单的同一份订单、商品、履约及仓库执行资料。
    if (!source.systemOrderNo || source.systemOrderNo === 'OMS-DEMO-RET-002') continue
    const countryCode = ({ EBAY_US: 'US', EBAY_GB: 'GB', EBAY_DE: 'DE' } as Record<string, string>)[source.marketplaceId]!
    const route: 订单路由 = { warehouse: source.warehouse, warehouseProvider: source.warehouse.split(' · ')[0]!, warehouseAccount: source.outbounds?.[0]?.account || `DEMO ${source.warehouse.split(' · ')[0]}账号`, shippingChannel: source.orderChannel!, shippingChannelCode: source.outbounds?.[0]?.channelCode || `DEMO-CXL-${countryCode}`, labelMode: '仓配一体' }
    const order = createOrder(950 + index, {
      systemOrderNo: source.systemOrderNo, platformCode: 'eBay', platformOrderId: source.orderId, platformOrderNo: source.orderId,
      storeId: source.shopId, storeName: source.shop, buyerExternalId: source.buyer, professionalOrder: undefined,
      orderType: '线上订单', fulfillmentMode: '自配送', processingStatus: source.omsStatus as 全渠道订单['processingStatus'], platformOrderStatus: source.platformOrderStatus!,
      address: { fullName: 'DEMO***', countryCode, stateProvince: 'DEMO', city: 'DEMO CITY', addressLine1: 'DEMO *** STREET', postalCode: 'DEMO***' },
      defaultRoute: route, manualShippingPlan: undefined,
      items: source.products.map((item, itemIndex) => ({ externalLineId: `DEMO-CXL-${source.cancelId}-LINE-${itemIndex + 1}`, platformSku: item.sku, platformItemTitle: item.title, systemSku: item.sku, systemItemName: item.title, orderedQuantity: item.quantity, fulfillableQuantity: item.quantity, skuResolutionStatus: '成功', currencyCode: source.currency, unitPrice: { currency: source.currency, value: (source.amount / source.products.reduce((sum, item) => sum + item.quantity, 0)).toFixed(2) }, itemTotal: { currency: source.currency, value: (source.amount * item.quantity / source.products.reduce((sum, item) => sum + item.quantity, 0)).toFixed(2) } })),
      amount: { orderAmount: { currency: source.currency, value: source.amount.toFixed(2) } },
      orderedAt: source.createdAt, paidAt: source.createdAt, createdAt: source.createdAt, lastSyncedAt: source.lastSyncedAt,
      shipByAt: undefined, shipByLabel: '—', urgency: '正常', tags: [], fulfillmentOrders: [], reviews: [],
      operationLogs: [{ operatedAt: source.createdAt, operationType: '演示样例初始化', operationResult: '成功', operator: '原型演示', content: '取消申请固定虚构关联订单，仅供只读详情评审。' }],
      sync: { status: '已同步', normalizationStatus: '已标准化', latestAttempt: source.lastSyncedAt, lastSuccess: source.lastSyncedAt, message: '固定虚构来源快照，未调用真实 API。' },
    })
    for (const [outboundIndex, outbound] of (source.outbounds || []).entries()) {
      const planned = source.outbounds!.length === 2 ? 1 : source.products.reduce((sum, item) => sum + item.quantity, 0)
      const shipped = outbound.status === '已出库' ? source.shipped! : 0
      const fulfillment: 履约单摘要 = { fulfillmentOrderNo: `FL-DEMO-CXL-${source.cancelId}-${outboundIndex + 1}`, status: '待执行', isActive: outbound.status !== '已取消', route: { warehouse: outbound.warehouse, warehouseProvider: outbound.warehouse.split(' · ')[0]!, warehouseAccount: outbound.account, shippingChannel: outbound.channel!, shippingChannelCode: outbound.channelCode!, labelMode: '仓配一体' }, plannedQuantity: planned, shippedQuantity: 0, items: [{ orderNo: order.systemOrderNo, externalLineId: order.items[0]!.externalLineId, quantity: planned }] }
      order.fulfillmentOrders.push(fulfillment)
      const snapshot = 创建推单出库快照([order], fulfillment.fulfillmentOrderNo, source.createdAt)
      snapshot.quantitySummary = { plannedQuantity: planned, shippedQuantity: shipped, unit: '件' }
      snapshot.lastSyncedAt = source.lastSyncedAt; snapshot.shippedAt = outbound.shippedAt
      for (const item of snapshot.items) { item.shippedQuantity = shipped; item.unit = '件'; item.lineStatus = outbound.status! }
      Object.assign(fulfillment, { status: outbound.status === '已取消' ? '已关闭' : outbound.status === '已出库' ? '已发货' : '执行中', shippedQuantity: shipped, trackingNumber: outbound.tracking || undefined, shippedAt: outbound.shippedAt || undefined })
      执行.push({ 履约单号: fulfillment.fulfillmentOrderNo, 订单号: [order.systemOrderNo], 出库单号: outbound.no, 三方仓出库单号: outbound.externalNo || undefined, 状态: outbound.status as 仓库执行['状态'], 待核查: false, 原因: '', 更新时间: source.lastSyncedAt, 出库快照: snapshot, 出库事实: { planned, shipped, tracking: outbound.tracking, shippedAt: outbound.shippedAt } })
    }
    订单.push(order)
  }
  return { 订单, 执行 }
}
