import type { 全渠道订单, 人工发货分配, 人工发货方案, 履约单摘要, 订单商品行, 订单路由 } from '../全渠道订单/类型'

const 时间 = (time: string) => `2026-10-28T${time}+08:00`
const 金额 = (value: string) => ({ currency: 'USD', value })

/** 固定虚构回放，仅展示历史与当前履约；不表示现有操作已支持审核后撤销重拆。 */
export function 创建拆单重拆详情演示(
  创建订单: (序号: number, 覆盖?: Partial<全渠道订单>) => 全渠道订单,
  路由: readonly 订单路由[],
): 全渠道订单 {
  if (路由.length < 2) throw new Error('拆单重拆详情演示需要两条完整虚构仓库渠道')
  const 订单号 = 'OMS-DEMO-DETAIL-RESPLIT'
  const 商品: 订单商品行[] = [
    { externalLineId: 'DEMO-DETAIL-RESPLIT-L1', platformItemId: 'DEMO-DETAIL-RESPLIT-PRODUCT-1', platformSku: 'DEMO-DETAIL-RESPLIT-PART-1', platformItemTitle: 'Demo Front Wheel Bearing Assembly', platformVariant: '演示标准规格', systemSku: 'DEMO-SKU-1', systemItemName: '演示前轮轴承总成', orderedQuantity: 2, fulfillableQuantity: 2, skuResolutionStatus: '成功', currencyCode: 'USD', unitPrice: 金额('29.90'), itemTotal: 金额('59.80'), actualReceived: 金额('59.80'), actualReceivedSource: 'PLATFORM' },
    { externalLineId: 'DEMO-DETAIL-RESPLIT-L2', platformItemId: 'DEMO-DETAIL-RESPLIT-PRODUCT-2', platformSku: 'DEMO-DETAIL-RESPLIT-PART-2', platformItemTitle: 'Demo Rear Brake Pad Kit', platformVariant: '演示标准规格', systemSku: 'DEMO-SKU-2', systemItemName: '演示后轮制动片', orderedQuantity: 1, fulfillableQuantity: 1, skuResolutionStatus: '成功', currencyCode: 'USD', unitPrice: 金额('45.00'), itemTotal: 金额('45.00'), actualReceived: 金额('45.00'), actualReceivedSource: 'PLATFORM' },
  ]
  const 分配 = (index: number): 人工发货分配 => ({ orderNo: 订单号, externalLineId: 商品[index]!.externalLineId, quantity: 商品[index]!.orderedQuantity })
  const 当前方案: 人工发货方案 = {
    id: 'MSP-DEMO-DETAIL-RESPLIT-R2', kind: '拆分发货', orderNos: [订单号],
    reason: '虚构回放：第一轮未推仓且零出库，结束旧方案后交换两包仓库渠道，重新拆分并审核。', updatedAt: 时间('09:10:00'),
    packages: [0, 1].map(index => ({ key: `DEMO-DETAIL-RESPLIT-R2-P${index + 1}`, route: { ...路由[1 - index]! }, items: [分配(index)] })),
  }
  const 历史履约: 履约单摘要[] = [0, 1].map(index => ({
    fulfillmentOrderNo: `FL-DEMO-DETAIL-RESPLIT-R1-P${index + 1}`, status: '已终止', isActive: false,
    route: { ...路由[index]! }, plannedQuantity: 商品[index]!.orderedQuantity, shippedQuantity: 0,
    items: [分配(index)], manualPlanId: 'MSP-DEMO-DETAIL-RESPLIT-R1',
  }))
  const 当前履约: 履约单摘要[] = 当前方案.packages.map((包裹, index) => ({
    fulfillmentOrderNo: `FL-DEMO-DETAIL-RESPLIT-R2-P${index + 1}`, status: '待执行', isActive: true,
    route: { ...包裹.route }, plannedQuantity: 商品[index]!.orderedQuantity, shippedQuantity: 0,
    items: 包裹.items.map(item => ({ ...item })), manualPlanId: 当前方案.id,
  }))
  return 创建订单(605, {
    systemOrderNo: 订单号, platformOrderId: 'DEMO-DETAIL-RESPLIT', platformOrderNo: 'DEMO-DETAIL-RESPLIT',
    platformCode: 'eBay', orderType: '线上订单', platformOrderType: 'NORMAL', platformOrderStatus: 'NOT_STARTED', fulfillmentMode: '自配送', processingStatus: '待推单',
    storeId: 'demo-ebay-resplit-detail', storeName: '拆单历史详情演示店', buyerExternalId: 'DEMO-DETAIL-RESPLIT-BUYER',
    address: { fullName: 'DEMO***', countryCode: 'US', stateProvince: 'CA', city: 'DEMO CITY', addressLine1: 'DEMO *** STREET', postalCode: 'DEMO***', email: 'demo***@example.invalid', buyerMessage: '' },
    defaultRoute: { ...路由[0]! }, manualShippingPlan: 当前方案, items: 商品,
    amount: { orderAmount: 金额('104.80'), buyerPaidShipping: 金额('0.00'), buyerPaidTax: 金额('0.00'), transactionFee: 金额('0.00'), platformSubsidy: 金额('0.00'), otherFee: 金额('0.00') },
    orderedAt: 时间('08:00:00'), paidAt: 时间('08:01:00'), createdAt: 时间('08:02:00'), lastSyncedAt: 时间('09:20:00'), platformUpdatedAt: 时间('09:20:00'),
    shipByAt: 时间('18:00:00'), shipByLabel: '10-28 18:00', urgency: '正常',
    blockReason: undefined, noShipmentReason: undefined, admissionReason: undefined, cancelledAt: undefined, cancelledReason: undefined, fulfillmentCompletedAt: undefined, professionalOrder: undefined,
    tags: ['拆单重拆详情演示'], fulfillmentOrders: [...历史履约, ...当前履约],
    reviews: [
      { round: 1, type: '人工审核', triggerSource: '虚构历史回放', status: '已通过', completedAt: 时间('08:12:00'), decisionNote: '第一轮拆分方案审核通过，生成两张履约单；两包均未推仓、未取号、实际出库为零。后续旧方案安全结束，原审核结论保留。' },
      { round: 2, type: '人工审核', triggerSource: '虚构重拆回放', status: '已通过', completedAt: 时间('09:12:00'), decisionNote: '已核对旧两张履约均已终止且零出库、无仓库请求；第二轮重新拆分并交换两包路线，审核通过后形成两张当前履约，等待推单。仅为给定的虚构展示事实。' },
    ],
    operationLogs: [
      { operatedAt: 时间('08:02:00'), operationType: '演示样例初始化', operationResult: '成功', operator: '原型演示', content: '固定虚构拆单撤销后重新拆单的详情回放；只用于当前与历史履约混排展示，不表示当前产品已支持审核后撤销重规划，未调用真实平台或仓库。' },
      { operatedAt: 时间('08:10:00'), operationType: '拆分发货（演示）', operationResult: '成功', operator: '原型演示', content: '第一轮方案 MSP-DEMO-DETAIL-RESPLIT-R1：商品行 L1 分配2件、L2分配1件，分别使用两条原始仓库渠道。' },
      { operatedAt: 时间('08:12:00'), operationType: '人工审核（演示）', operationResult: '成功', operator: '原型演示', content: '第一轮审核通过，形成 R1-P1、R1-P2 两张履约；均未推仓、未取号、有效出库量为0。' },
      { operatedAt: 时间('09:00:00'), operationType: '撤销拆分方案（虚构回放）', operationResult: '成功', operator: '原型演示', content: '已核实第一轮未推仓、无仓库请求且零出库，安全结束旧方案；R1 两张履约标记为已终止、历史版本，保留原商品分配与原路线。此为展示回放，不开放现有操作限制。' },
      { operatedAt: 时间('09:10:00'), operationType: '重新拆分发货（虚构回放）', operationResult: '成功', operator: '原型演示', content: '第二轮方案 MSP-DEMO-DETAIL-RESPLIT-R2：保留商品行分配2件和1件，交换两包仓库渠道；订单原始商品及金额不变。' },
      { operatedAt: 时间('09:12:00'), operationType: '人工审核（演示）', operationResult: '成功', operator: '原型演示', content: '第二轮审核通过，生成 R2-P1、R2-P2 两张当前有效履约，订单待推单；未创建仓单、跟踪号或标发记录，第一轮历史原样保留。' },
    ],
    sync: { status: '已同步', normalizationStatus: '已标准化', latestAttempt: 时间('09:20:00'), lastSuccess: 时间('09:20:00'), message: '固定虚构回放，未调用真实平台或仓库 API；审核后重规划操作能力未在本样例中实现。' },
  })
}
