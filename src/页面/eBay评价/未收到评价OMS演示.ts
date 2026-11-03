import type { 全渠道订单, 订单商品行, 订单路由, 履约单摘要 } from '../全渠道订单/类型'
import type { 仓库执行 } from '../订单处理/演示会话'
import { 创建推单出库快照 } from '../仓配管理/三方仓出库模型'
import { createAwaitingReviewOrders } from './未收到评价数据'

const money = (cents: number) => ({ currency: 'USD', value: `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}` })
const before = (time: string, minutes: number) => new Date(Date.parse(time) - minutes * 60_000).toISOString()

/** 固定虚构来源生成完整共享订单；不把评价来源主键指向无关的既有订单。 */
export function 创建评价跟踪OMS演示(
  创建订单: (序号: number, 覆盖?: Partial<全渠道订单>) => 全渠道订单,
  路由: readonly 订单路由[],
): { 订单: 全渠道订单[]; 执行: 仓库执行[] } {
  if (!路由.length) throw new Error('评价跟踪 OMS 演示需要完整的虚构仓库渠道')
  const 来源 = createAwaitingReviewOrders().filter(source => source.association === 'confirmed' && source.omsOrderId === source.omsOrderNo)
  const 订单: 全渠道订单[] = [], 执行: 仓库执行[] = []
  for (const [index, source] of 来源.entries()) {
    if (!source.lines.length || source.lines.some(line => !Number.isSafeInteger(line.quantity) || line.quantity <= 0) || source.trackingNumbers.length !== 1) throw new Error(`评价跟踪虚构来源范围不完整：${source.id}`)
    const 订单路由 = { ...路由[index % 路由.length]! }
    const items: 订单商品行[] = source.lines.map(line => ({
      // Feedback 交易行标识与 OMS 来源商品行标识分别保留，不假设两者相同。
      externalLineId: line.id, platformItemId: line.listingId, platformSku: line.platformSku,
      platformItemTitle: line.title, systemSku: line.sku, systemItemName: line.title,
      orderedQuantity: line.quantity, fulfillableQuantity: line.quantity, skuResolutionStatus: '成功', currencyCode: 'USD',
      unitPrice: money(1000), itemTotal: money(line.quantity * 1000), actualReceived: money(line.quantity * 1000), actualReceivedSource: 'PLATFORM',
    }))
    const quantity = items.reduce((sum, item) => sum + item.orderedQuantity, 0)
    const fulfillmentNo = `FL-DEMO-AWAIT-${source.id}`
    const fulfillment: 履约单摘要 = {
      fulfillmentOrderNo: fulfillmentNo, status: '待执行', isActive: true, route: 订单路由,
      plannedQuantity: quantity, shippedQuantity: 0,
      items: items.map(item => ({ orderNo: source.omsOrderNo, externalLineId: item.externalLineId, quantity: item.orderedQuantity })),
    }
    const submittedAt = before(source.shippedAt, 120), completedAt = source.shippedAt
    const order = 创建订单(800 + index, {
      systemOrderNo: source.omsOrderNo, platformCode: 'eBay', platformOrderId: source.orderNo, platformOrderNo: source.orderNo,
      storeId: source.shopId, storeName: source.shopName, buyerExternalId: source.buyerId,
      orderType: '线上订单', fulfillmentMode: '自配送', processingStatus: '已发货', platformOrderType: 'NORMAL',
      // 未提供平台标发回执；显式的虚构平台状态不能从仓库已出库反推。
      platformOrderStatus: 'NOT_STARTED', professionalOrder: undefined,
      address: { fullName: 'DEMO***', countryCode: 'US', stateProvince: 'CA', city: 'DEMO CITY', addressLine1: 'DEMO *** STREET', postalCode: 'DEMO***', email: 'demo***@example.invalid', buyerMessage: '' },
      defaultRoute: { ...订单路由 }, manualShippingPlan: undefined, items, fulfillmentOrders: [fulfillment],
      amount: { orderAmount: money(quantity * 1000), buyerPaidShipping: money(0), buyerPaidTax: money(0), transactionFee: money(0), platformSubsidy: money(0), otherFee: money(0) },
      orderedAt: before(completedAt, 4320), paidAt: before(completedAt, 4319), createdAt: before(completedAt, 4318),
      shipByAt: before(completedAt, -1440), shipByLabel: '演示发货时限', urgency: '正常',
      lastSyncedAt: completedAt, fulfillmentCompletedAt: completedAt, platformUpdatedAt: undefined,
      tags: [], blockReason: undefined, noShipmentReason: undefined, admissionReason: undefined, cancelledAt: undefined, cancelledReason: undefined,
      reviews: [{ round: 1, type: '人工审核', triggerSource: '评价跟踪虚构来源', status: '已通过', completedAt: before(completedAt, 121), decisionNote: '固定虚构已发货样例，全部来源商品与本次仓库执行范围一致；未调用真实 API。' }],
      operationLogs: [{ operatedAt: before(completedAt, 4318), operationType: '演示样例初始化', operationResult: '成功', operator: '原型演示', content: '评价跟踪固定虚构 OMS 订单；商品、发货与仓库执行共同作为详情演示资料，未提供平台标发回执。' }],
      sync: { status: '已同步', normalizationStatus: '已标准化', latestAttempt: completedAt, lastSuccess: completedAt, message: '固定虚构来源快照，仅用于本地详情评审。' },
    })
    const snapshot = 创建推单出库快照([order], fulfillmentNo, submittedAt)
    if (!snapshot.snapshotReliable) throw new Error(`评价跟踪虚构出库范围不完整：${source.id}`)
    snapshot.acceptedAt = before(completedAt, 119); snapshot.operationStartedAt = before(completedAt, 60)
    snapshot.shippedAt = completedAt; snapshot.lastSyncedAt = completedAt; snapshot.warehouseStatusRaw = 'DEMO-SHIPPED'
    snapshot.quantitySummary.shippedQuantity = quantity; snapshot.quantitySummary.unit = '件'
    for (const item of snapshot.items) {
      item.shippedQuantity = item.plannedQuantity; item.lineStatus = '已出库'; item.unit = '件'
      item.warehouseSku = `DEMO-AWAIT-WH-${item.systemSku}`
    }
    Object.assign(order.fulfillmentOrders[0]!, { status: '已发货', shippedQuantity: quantity, shippedAt: completedAt, trackingNumber: source.trackingNumbers[0] })
    const outboundNo = `CK-DEMO-AWAIT-${source.id}`
    order.operationLogs.push({ operatedAt: completedAt, operationType: '同步仓库出库（演示）', operationResult: '成功', operator: '原型演示', content: `固定虚构仓单 ${outboundNo} 已出库${quantity}件；跟踪号由本次虚构仓库执行提供，物流轨迹尚未接入。` })
    订单.push(order)
    执行.push({ 履约单号: fulfillmentNo, 订单号: [source.omsOrderNo], 出库单号: outboundNo, 三方仓出库单号: `WH-DEMO-AWAIT-${source.id}`, 状态: '已出库', 待核查: false, 原因: '', 更新时间: completedAt, 出库快照: snapshot, 出库事实: { planned: quantity, shipped: quantity, tracking: source.trackingNumbers[0]!, shippedAt: completedAt } })
  }
  return { 订单, 执行 }
}
