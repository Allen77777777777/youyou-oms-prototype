import type { 全渠道订单, 订单路由 } from '../全渠道订单/类型'

/** 用户指定的固定评审数据；不调用建单命令，不因打开表单重复新增。 */
export function 创建手工订单演示(路由: 订单路由): 全渠道订单[] {
  const 场景 = [
    { scenario: '售后补寄' as const, quantity: 1, reason: '售后核实后补寄收纳箱，原订单仅作追溯', originalOrderNo: 'OMS-DEMO-CF-01' },
    { scenario: '线下销售' as const, quantity: 2, reason: '线下成交已确认收款，安排仓库发货' },
    { scenario: '寄样赠送' as const, quantity: 1, reason: '寄送产品样品，供收件方体验' },
    { scenario: '其他' as const, quantity: 3, reason: '活动物料寄送，按本次需求安排发货' },
  ]
  return 场景.map((项, 索引) => {
    const 后缀 = String(索引 + 1).padStart(2, '0')
    const 单号 = `OMS-DEMO-MANUAL-${后缀}`
    const 时间 = `2026-11-03T07:00:0${4 - 索引}Z`
    return {
      systemOrderNo: 单号, platformCode: '手工', storeId: 'store-ebay-us-01', storeName: '北美底盘配件店',
      platformOrderNo: '', platformOrderStatus: undefined, orderType: '手工订单',
      manualOrder: { scenario: 项.scenario, originalOrderNo: 项.originalOrderNo, reason: 项.reason, paidConfirmed: 项.scenario === '线下销售', requestId: `demo-manual-purpose-${后缀}` },
      fulfillmentMode: '自配送', processingStatus: '待审核', defaultRoute: { ...路由 },
      admissionReason: '人工创建；已填写店铺及仓库物流，由订单处理核对资料并审核后发货。',
      orderedAt: 时间, createdAt: 时间, lastSyncedAt: '', shipByLabel: '无平台时限', urgency: '无时限', tags: [],
      address: { fullName: `虚构收件人 ${后缀}`, countryCode: 'US', stateProvince: 'CA', city: 'Demo City', addressLine1: `${100 + 索引} Example Street`, postalCode: '90000', telephone: '000-000-0000' },
      amount: { orderAmount: 项.scenario === '线下销售' ? { value: '79.90', currency: 'USD' } : { value: '', currency: '' } },
      items: [{ externalLineId: `MANUAL-LINE-${单号}-1`, systemSku: 'DEMO-STORAGE-01', systemItemName: '折叠收纳箱', orderedQuantity: 项.quantity, fulfillableQuantity: 项.quantity, skuResolutionStatus: '成功', currencyCode: '', unitPrice: { value: '', currency: '' }, itemTotal: { value: '', currency: '' } }],
      fulfillmentOrders: [], reviews: [], sync: { latestAttempt: '', message: '人工创建，无平台下载或同步任务。固定虚构评审数据。' },
      operationLogs: [{ operatedAt: 时间, operationType: '手工订单评审样例初始化', operationResult: '成功', operator: '原型演示', content: `固定虚构数据；业务用途：${项.scenario}。进入待审核；未审核、未推仓，不调用外部接口。` }],
    }
  })
}
