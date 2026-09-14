import type { 全渠道订单 } from '../全渠道订单/类型'

export type 标发状态 = '待标发' | '标发中' | '标发成功' | '标发失败' | '无需标发'
export interface 标发单 {
  no: string; orderNo: string; fulfillmentNo: string; status: 标发状态
  tracking: string; carrier: string; shippedAt: string; quantity: number
  lineId: string; idempotencyKey: string; pendingVerification: boolean
  reason: string; attempts: Array<{ time: string; action: string; result: string; evidence: string }>
  externalId?: string; exemptionReason?: string
}

export const 标发状态列表: 标发状态[] = ['待标发', '标发中', '标发成功', '标发失败', '无需标发']

export function 标发阻断原因(单: 标发单, 订单?: 全渠道订单): string[] {
  const 原因: string[] = []
  if (!订单) return ['来源订单不存在，需核查关联关系']
  if (单.status !== '待标发' && 单.status !== '标发失败') 原因.push('当前状态不可提交')
  if (单.pendingVerification) 原因.push('平台结果待核查，确认前禁止重提')
  if (订单.platformCode !== 'eBay') 原因.push('该平台标发规则与接口待接入')
  if (订单.fulfillmentMode !== '自配送') 原因.push('平台履约订单不进入 OMS 标发')
  if (订单.cancelledAt || 订单.processingStatus === '不发货' || 订单.blockReason) 原因.push('订单存在已确认阻断，需核查订单上下文')
  // paidAt 是展示字段，不参与标发门禁；当前订单级付款状态由平台适配链路处理。
  // 已发货终态不因后续非 PAID 更新回退，标发仍以有效出库事实和平台结果为准。
  const 履约 = 订单.fulfillmentOrders.find((项) => 项.fulfillmentOrderNo === 单.fulfillmentNo && 项.isActive)
  if (!履约 || 履约.shippedQuantity <= 0 || !履约.shippedAt) 原因.push('缺少有效仓库出库事实或实际发货时间')
  if (!单.tracking || !单.carrier || !单.shippedAt) 原因.push('跟踪号、承运商或提交发货时间缺失')
  const 行 = 订单.items.find((项) => 项.externalLineId === 单.lineId)
  if (!行 || !Number.isInteger(单.quantity) || 单.quantity <= 0 || 单.quantity > (履约?.shippedQuantity ?? 0)) 原因.push('标发数量超过有效出库数量或来源行无效')
  if (行 && 单.quantity !== (行.fulfillableQuantity ?? 行.orderedQuantity)) 原因.push('eBay 同一订单行必须以一个跟踪号覆盖该行全部应标发数量')
  return 原因
}

export function 创建标发演示单(订单列表: 全渠道订单[]): 标发单[] {
  return 订单列表.filter((订单) => /^OMS-DEMO-CF-0[1-6]$/.test(订单.systemOrderNo)).map((订单, 序号) => {
    const 履约 = 订单.fulfillmentOrders[0]!
    const 状态: 标发状态[] = ['待标发', '标发中', '标发成功', '标发失败', '无需标发', '标发失败']
    const 单: 标发单 = {
      no: `CF-DEMO-260912-${String(序号 + 1).padStart(3, '0')}`, orderNo: 订单.systemOrderNo,
      fulfillmentNo: 履约.fulfillmentOrderNo, status: 状态[序号]!, tracking: 履约.trackingNumber ?? '',
      carrier: 'USPS', shippedAt: 履约.shippedAt ?? '', quantity: 订单.items[0]?.fulfillableQuantity ?? 1,
      lineId: 订单.items[0]!.externalLineId, idempotencyKey: `DEMO-CF-${序号 + 1}-V1`,
      pendingVerification: 序号 === 3, reason: 序号 === 3 ? '请求超时，平台是否受理待核查' : 序号 === 5 ? '平台明确拒绝：演示授权校验失败；已更新演示凭据，可重新校验' : '',
      attempts: [],
    }
    if (序号 === 2) 单.externalId = 'DEMO-FULFILLMENT-003'
    if (序号 === 4) 单.exemptionReason = 'DEMO_EXEMPTION_ONLY：用于评审豁免事实展示，实际适用场景待确认'
    if (序号 > 0) 单.attempts.push({ time: '2026-09-12 09:30:00 UTC+8', action: 序号 === 4 ? '演示豁免结论' : '标发提交', result: 单.status, evidence: 序号 === 3 ? 'EXTERNAL_RESULT_PENDING_VERIFICATION；禁止重试' : 单.externalId || 单.exemptionReason || '本地模拟接口尝试，未调用外部平台' })
    return 单
  })
}
