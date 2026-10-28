import type { 全渠道订单, 人工发货分配, 人工发货方案, 订单商品行, 订单路由, 履约单摘要 } from '../全渠道订单/类型'
import type { 标发单 } from '../订单标发/标发逻辑'
import type { 仓库执行 } from './演示会话'
import { 创建推单出库快照 } from '../仓配管理/三方仓出库模型'

/** 三个详情入口；合并入口另有一张明确来源订单，不伪造单来源合并。 */
export const 已发货详情演示目录 = [
  { kind: '拆单', orderNo: 'OMS-DEMO-DETAIL-SPLIT', name: '两仓两渠道拆分发货' },
  { kind: '正常订单', orderNo: 'OMS-DEMO-DETAIL-NORMAL', name: '单仓单包正常发货' },
  { kind: '合并发货', orderNo: 'OMS-DEMO-DETAIL-MERGE', name: '两张来源订单共用一个包裹', companionOrderNo: 'OMS-DEMO-DETAIL-MERGE-B' },
] as const

const 时间 = (time: string) => `2026-10-28T${time}+08:00`
const 金额 = (value: string) => ({ currency: 'USD', value })
function 商品(code: string, sku: 1 | 2, quantity: number, unitPrice: string, total: string): 订单商品行 {
  return {
    externalLineId: `DEMO-DETAIL-${code}`, platformItemId: `DEMO-DETAIL-PRODUCT-${sku}`, platformSku: `DEMO-DETAIL-PART-${sku}`,
    platformItemTitle: sku === 1 ? 'Demo Front Wheel Bearing Assembly' : 'Demo Rear Brake Pad Kit',
    platformVariant: '演示标准规格', systemSku: `DEMO-SKU-${sku}`, systemItemName: sku === 1 ? '演示前轮轴承总成' : '演示后轮制动片',
    orderedQuantity: quantity, fulfillableQuantity: quantity, skuResolutionStatus: '成功', currencyCode: 'USD',
    unitPrice: 金额(unitPrice), itemTotal: 金额(total), actualReceived: 金额(total), actualReceivedSource: 'PLATFORM',
  }
}

/** 明确给定的虚构已发货事实，仅用于详情展示；不模拟接口调用或生产履约生成。 */
export function 创建已发货详情演示(
  创建订单: (序号: number, 覆盖?: Partial<全渠道订单>) => 全渠道订单,
  路由: readonly 订单路由[],
): { 订单: 全渠道订单[]; 执行: 仓库执行[]; 标发: 标发单[] } {
  if (路由.length < 2) throw new Error('已发货详情演示需要两条完整虚构仓库渠道')
  const 定义 = [
    { code: 'SPLIT', kind: '拆单', total: '104.80', items: [商品('SPLIT-L1', 1, 2, '29.90', '59.80'), 商品('SPLIT-L2', 2, 1, '45.00', '45.00')] },
    { code: 'NORMAL', kind: '正常订单', total: '68.50', items: [商品('NORMAL-L1', 1, 1, '68.50', '68.50')] },
    { code: 'MERGE', kind: '合并发货', total: '39.00', items: [商品('MERGE-L1', 1, 2, '19.50', '39.00')] },
    { code: 'MERGE-B', kind: '合并发货来源', total: '32.00', items: [商品('MERGE-B-L1', 2, 1, '32.00', '32.00')] },
  ]
  const 订单 = 定义.map((定义, index) => 创建订单(601 + index, {
    systemOrderNo: `OMS-DEMO-DETAIL-${定义.code}`, platformOrderId: `DEMO-DETAIL-${定义.code}`, platformOrderNo: `DEMO-DETAIL-${定义.code}`,
    platformCode: 'eBay', orderType: '线上订单', platformOrderType: 'NORMAL', platformOrderStatus: 'FULFILLED', fulfillmentMode: '自配送', processingStatus: '已发货',
    storeId: 'demo-ebay-shipped-detail', storeName: '已发货详情演示店', buyerExternalId: 定义.code.startsWith('MERGE') ? 'DEMO-DETAIL-MERGE-BUYER' : `DEMO-DETAIL-${定义.code}-BUYER`,
    address: { fullName: 'DEMO***', countryCode: 'US', stateProvince: 'CA', city: 'DEMO CITY', addressLine1: 'DEMO *** STREET', postalCode: 'DEMO***', email: 'demo***@example.invalid', buyerMessage: '' },
    defaultRoute: { ...路由[定义.code.startsWith('MERGE') ? 1 : 0]! }, items: 定义.items,
    amount: { orderAmount: 金额(定义.total), buyerPaidShipping: 金额('0.00'), buyerPaidTax: 金额('0.00'), transactionFee: 金额('0.00'), platformSubsidy: 金额('0.00'), otherFee: 金额('0.00') },
    orderedAt: 时间(`08:00:0${index}`), paidAt: 时间('08:01:00'), createdAt: 时间('08:02:00'), lastSyncedAt: 时间('10:25:00'), platformUpdatedAt: 时间('10:24:00'),
    shipByAt: 时间('11:30:00'), shipByLabel: '10-28 11:30', urgency: '正常', fulfillmentCompletedAt: 时间('10:20:00'),
    blockReason: undefined, noShipmentReason: undefined, admissionReason: undefined, cancelledAt: undefined, cancelledReason: undefined,
    professionalOrder: undefined, manualShippingPlan: undefined, fulfillmentOrders: [], tags: ['已发货详情演示', 定义.kind],
    reviews: [{ round: 1, type: '人工审核', triggerSource: '虚构详情评审样例', status: '已通过', completedAt: 时间('08:12:00'), decisionNote: `虚构${定义.kind}样例已核对全部来源商品和路线；审核汇总仅用于展示。` }],
    operationLogs: [{ operatedAt: 时间('08:02:00'), operationType: '演示样例初始化', operationResult: '成功', operator: '原型演示', content: `虚构${定义.kind}已发货详情样例；订单、出库及标发均为固定演示事实，未调用平台或仓库。` }],
    sync: { status: '已同步', normalizationStatus: '已标准化', latestAttempt: 时间('10:25:00'), lastSuccess: 时间('10:25:00'), message: '固定虚构同步结果，仅用于详情评审；未发生真实 API 调用。' },
  }))
  const [拆单, 正常, 合并A, 合并B] = 订单 as [全渠道订单, 全渠道订单, 全渠道订单, 全渠道订单]
  const 分配 = (单: 全渠道订单, index: number): 人工发货分配 => ({ orderNo: 单.systemOrderNo, externalLineId: 单.items[index]!.externalLineId, quantity: 单.items[index]!.orderedQuantity })
  const 拆分安排: 人工发货方案 = {
    id: 'MSP-DEMO-DETAIL-SPLIT', kind: '拆分发货', orderNos: [拆单.systemOrderNo], reason: '虚构评审：商品分别由两仓发运，展示两条独立渠道。', updatedAt: 时间('08:10:00'),
    packages: [0, 1].map(index => ({ key: `DEMO-DETAIL-SPLIT-P${index + 1}`, route: { ...路由[index]! }, items: [分配(拆单, index)] })),
  }
  const 合并安排: 人工发货方案 = {
    id: 'MSP-DEMO-DETAIL-MERGE', kind: '合并发货', orderNos: [合并A.systemOrderNo, 合并B.systemOrderNo], reason: '虚构评审：同店铺、买家和收件资料的两张订单共同发运。', updatedAt: 时间('08:10:00'),
    packages: [{ key: 'DEMO-DETAIL-MERGE-P1', route: { ...路由[1]! }, items: [分配(合并A, 0), 分配(合并B, 0)] }],
  }
  拆单.manualShippingPlan = structuredClone(拆分安排)
  合并A.manualShippingPlan = structuredClone(合并安排); 合并B.manualShippingPlan = structuredClone(合并安排)

  const 分组 = [
    { code: 'SPLIT-P1', orders: [拆单], route: 路由[0]!, items: [分配(拆单, 0)], planId: 拆分安排.id, carrier: 'USPS', shippedAt: 时间('10:10:00') },
    { code: 'SPLIT-P2', orders: [拆单], route: 路由[1]!, items: [分配(拆单, 1)], planId: 拆分安排.id, carrier: 'FedEx', shippedAt: 时间('10:20:00') },
    { code: 'NORMAL', orders: [正常], route: 路由[0]!, items: [分配(正常, 0)], planId: undefined, carrier: 'USPS', shippedAt: 时间('10:20:00') },
    { code: 'MERGE', orders: [合并A, 合并B], route: 路由[1]!, items: [分配(合并A, 0), 分配(合并B, 0)], planId: 合并安排.id, carrier: 'FedEx', shippedAt: 时间('10:20:00') },
  ]
  const 执行: 仓库执行[] = [], 标发: 标发单[] = []
  for (const 组 of 分组) {
    const 履约: 履约单摘要 = { fulfillmentOrderNo: `FL-DEMO-DETAIL-${组.code}`, status: '待执行', isActive: true, route: { ...组.route }, plannedQuantity: 组.items.reduce((sum, item) => sum + item.quantity, 0), shippedQuantity: 0, items: structuredClone(组.items), manualPlanId: 组.planId }
    for (const 单 of 组.orders) 单.fulfillmentOrders.push(structuredClone(履约))
    // 固定样例按本包分配提供独立的快照输入，保持来源订单的完整商品和数量不变。
    const 快照来源 = 组.orders.map(单 => ({
      ...structuredClone(单),
      items: 组.items.filter(分配 => 分配.orderNo === 单.systemOrderNo).map(分配 => {
        const 商品行 = 单.items.find(行 => 行.externalLineId === 分配.externalLineId)
        if (!商品行) throw new Error(`虚构详情分配缺少来源商品行：${分配.externalLineId}`)
        return { ...structuredClone(商品行), fulfillableQuantity: 分配.quantity }
      }),
    }))
    const 快照 = 创建推单出库快照(快照来源, 履约.fulfillmentOrderNo, 时间('08:20:00'))
    if (!快照.snapshotReliable) throw new Error(`虚构已发货详情快照不完整：${履约.fulfillmentOrderNo}`)
    快照.acceptedAt = '2026-10-28 08:21:00 UTC+8'; 快照.operationStartedAt = '2026-10-28 09:00:00 UTC+8'; 快照.shippedAt = 组.shippedAt; 快照.lastSyncedAt = '2026-10-28 10:22:00 UTC+8'; 快照.warehouseStatusRaw = 'DEMO-SHIPPED'
    快照.quantitySummary.shippedQuantity = 履约.plannedQuantity
    快照.quantitySummary.unit = '件'
    快照.items.forEach(item => {
      item.shippedQuantity = item.plannedQuantity; item.lineStatus = '已出库'
      // 样例自带虚构仓库商品身份，不依赖其他评审模块是否预置相同 SKU 映射。
      item.warehouseSku = `DEMO-WH-${路由.indexOf(组.route) + 1}-${item.systemSku}`
      item.unit = '件'
    })
    const tracking = `DEMO-TRACK-DETAIL-${组.code}`, outboundNo = `CK-DEMO-DETAIL-${组.code}`
    for (const 单 of 组.orders) {
      Object.assign(单.fulfillmentOrders.find(item => item.fulfillmentOrderNo === 履约.fulfillmentOrderNo)!, { status: '已发货', shippedQuantity: 履约.plannedQuantity, trackingNumber: tracking, shippedAt: 组.shippedAt })
      单.operationLogs.push({ operatedAt: 组.shippedAt, operationType: '同步仓库出库（演示）', operationResult: '成功', operator: '原型演示', content: `虚构仓单 ${outboundNo} 已出库${履约.plannedQuantity}件，跟踪号 ${tracking}。${组.orders.length > 1 ? '数量为共享履约整包总量，不分摊为本订单数量。' : ''}` })
    }
    执行.push({ 履约单号: 履约.fulfillmentOrderNo, 订单号: 组.orders.map(单 => 单.systemOrderNo), 出库单号: outboundNo, 三方仓出库单号: `WH-DEMO-DETAIL-${组.code}`, externalLogisticsOrderNo: `LOGISTICS-DEMO-DETAIL-${组.code}`, 状态: '已出库', 待核查: false, 原因: '', 更新时间: 时间('10:22:00'), 出库快照: 快照, 出库事实: { planned: 履约.plannedQuantity, shipped: 履约.plannedQuantity, tracking, shippedAt: 组.shippedAt } })
    for (const [index, item] of 组.items.entries()) {
      const no = `BF-DEMO-DETAIL-${组.code}-${index + 1}`
      标发.push({ no, orderNo: item.orderNo, fulfillmentNo: 履约.fulfillmentOrderNo, status: '标发成功', tracking, carrier: 组.carrier, shippedAt: 组.shippedAt, quantity: item.quantity, lineId: item.externalLineId, idempotencyKey: `${no}-V1`, pendingVerification: false, reason: '固定虚构成功回执，仅用于详情展示', externalId: `DEMO-EBAY-FULFILLMENT-${组.code}-${index + 1}`, outboundNo, attempts: [{ time: 时间('10:23:00'), action: '标发提交（演示）', result: '标发成功', evidence: '固定虚构平台回执；未调用真实 eBay API' }] })
      组.orders.find(单 => 单.systemOrderNo === item.orderNo)!.operationLogs.push({ operatedAt: 时间('10:23:00'), operationType: '订单标发（演示）', operationResult: '成功', operator: '原型演示', content: `虚构标发单 ${no}，本来源商品行 ${item.externalLineId} 标发${item.quantity}件；仅本地固定成功结果。` })
    }
  }
  // 沿用既有固定已发货样例的确认可履约量语义，不把该字段改作剩余量计数器；终态与有效出库事实阻断重复发货。
  return { 订单, 执行, 标发 }
}
