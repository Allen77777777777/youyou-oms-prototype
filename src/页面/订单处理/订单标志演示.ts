import type { 全渠道订单 } from '../全渠道订单/类型'
import type { 订单标志证据 } from './订单标志模型'

// 固定虚构快照；eBay 并行原值留在适配证据中，不扩充全渠道通用订单字段。
const 场景 = [
  { 状态: '待审核', 留言: '演示买家留言：请使用稳固包装。', 付款: 'PAID', 取消: 'NONE_REQUESTED', 有信: false },
  { 状态: '待审核', 留言: '', 付款: 'PAID', 取消: 'NONE_REQUESTED', 有信: true },
  { 状态: '待审核', 留言: '演示买家留言：请勿折叠商品外包装。', 付款: 'PAID', 取消: 'NONE_REQUESTED', 有信: true },
  { 状态: '待审核', 留言: '', 付款: 'PAID', 取消: 'NONE_REQUESTED', 有信: false },
  { 状态: '异常', 留言: '演示买家留言：请核对商品规格。', 付款: 'PARTIALLY_REFUNDED', 取消: 'NONE_REQUESTED', 有信: false },
  { 状态: '异常', 留言: '', 付款: 'PAID', 取消: 'IN_PROGRESS', 有信: true },
  { 状态: '异常', 留言: '', 付款: 'PAID', 取消: 'CANCELED', 有信: false },
  { 状态: '已发货', 留言: '', 付款: 'FULLY_REFUNDED', 取消: 'CANCELED', 有信: false },
] as const

function 订单身份(索引: number) {
  const 后缀 = String(索引 + 1).padStart(2, '0')
  return { systemOrderNo: `OMS260910-FLAG-${后缀}`, storeId: 'demo-ebay-flags', platformOrderId: `DEMO-EB-FLAG-${后缀}` }
}

export const 订单标志演示证据: 订单标志证据[] = 场景.map((项, 索引) => {
  const 身份 = 订单身份(索引)
  return {
    ...身份, revision: 1, sourceVersion: 'demo-v1', reliable: true, complete: true,
    paymentStatus: 项.付款, cancelState: 项.取消, refunds: [],
    messages: 项.有信 ? [{ messageId: `DEMO-MESSAGE-FLAG-${索引 + 1}`, direction: 'BUYER_INBOUND', valid: true, linkedOrder: { ...身份 } }] : [],
  }
})

export function 创建订单标志演示(创建样例: (序号: number, 覆盖?: Partial<全渠道订单>) => 全渠道订单): 全渠道订单[] {
  const 演示基准时刻 = Date.now()
  return 场景.map((项, 索引) => {
    const 身份 = 订单身份(索引)
    const 订单 = 创建样例(40 + 索引, {
      ...身份, platformCode: 'eBay', platformOrderNo: 身份.platformOrderId,
      storeName: 'eBay 标志演示店', buyerExternalId: `demo-flag-buyer-${索引 + 1}`,
      processingStatus: 项.状态, platformOrderStatus: 项.状态 === '已发货' ? 'FULFILLED' : 'NOT_STARTED',
      cancelledAt: 项.取消 === 'CANCELED' ? '2026-10-09 10:00:00 UTC+8' : undefined,
      cancelledReason: 项.取消 === 'CANCELED' ? 'DEMO：平台已确认最终取消。' : undefined,
      blockReason: 项.状态 === '异常' ? (项.取消 === 'NONE_REQUESTED' ? 'DEMO：准入后付款变为部分退款，已转异常，停止后续发货，等待人工复核。' : 项.取消 === 'IN_PROGRESS' ? 'DEMO：准入后平台取消处理中，已转异常，停止后续发货；尚无最终取消事实。' : 'DEMO：准入后平台已取消，已转异常，等待人工复核是否不发货。') : undefined,
      admissionReason: 项.状态 === '待审核' ? 'DEMO：订单级 PAID、未申请取消，通过初次准入。标志仅作只读展示。' : 项.状态 === '已发货' ? 'DEMO：已有足量有效出库，之后退款并取消，保留已发货终态与出库事实。' : 'DEMO：已准入待审核订单收到付款或取消更新，固定展示转异常后的结果。',
    })
    订单.address = { ...订单.address, buyerMessage: 项.留言 }
    订单.operationLogs = [{ operatedAt: '2026-10-09 10:00:00 UTC+8', operationType: '标志演示初始化', operationResult: '成功', operator: '原型演示', content: '虚构订单与独立适配证据初始化；未请求外部平台、未执行自动打标或订单规则。' }]
    // 一条相对本次初始化时刻的虚构时限，与其他历史超时样例形成对照；不修改真实来源数据。
    if (索引 === 0) {
      const 演示时刻 = (偏移: number) => new Date(演示基准时刻 + 偏移).toISOString()
      订单.orderedAt = 演示时刻(-2 * 3_600_000)
      订单.paidAt = 演示时刻(-2 * 3_600_000 + 60_000)
      订单.createdAt = 演示时刻(-2 * 3_600_000 + 120_000)
      订单.lastSyncedAt = 演示时刻(-60_000)
      订单.shipByAt = 演示时刻(30 * 3_600_000)
      订单.shipByLabel = '演示初始化后 30 小时'
      订单.operationLogs[0]!.operatedAt = 订单.createdAt
    }
    if (项.状态 === '已发货') {
      订单.reviews = [{ round: 1, type: '人工审核', triggerSource: '演示审核', status: '已通过', completedAt: '2026-09-12 09:05:00 UTC+8', decisionNote: 'DEMO：审核通过后已全部有效出库；后续退款取消不回退已发货终态。' }]
      订单.fulfillmentOrders = [{ fulfillmentOrderNo: 'FL-DEMO-FLAG-08', status: '已发货', isActive: true, route: structuredClone(订单.defaultRoute!), plannedQuantity: 1, shippedQuantity: 1, trackingNumber: 'DEMO-TRACK-FLAG-08', shippedAt: '2026-09-12 09:30:00 UTC+8' }]
    }
    return 订单
  })
}
