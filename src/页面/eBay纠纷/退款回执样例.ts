import type { DisputeRecord, InquiryRefund } from './类型'

// 仅用于本地演练已知失败与未知结果，不能作为真实平台回执或授权依据。
export type AuditRefundReceipt =
  | { outcome: 'UNKNOWN' }
  | { outcome: 'FAILED'; code: string; message: string; retryable: boolean }
  | { outcome: 'COMPLETED'; refund: InquiryRefund; closed: boolean; closedAt?: string }
const key = (row: DisputeRecord) => JSON.stringify([row.shopId, row.kind, row.id])
export function auditRefundReceipt(row: DisputeRecord): AuditRefundReceipt | undefined {
  if (row.shopId !== 'demo-outdoor-uk' || row.kind !== 'INR_REQUEST') return
  if (row.id === 'DEMO-INR-121') return { outcome: 'UNKNOWN' }
  if (row.id === 'DEMO-INR-122') return { outcome: 'FAILED', code: 'REFUND_BLOCKED_BY_PAYMENT_DISPUTE',
    message: '平台已明确该笔交易存在支付争议，当前不能就此请求退款。请核对原争议及平台办理指引。', retryable: false }
  if (row.id === 'DEMO-INR-120') return { outcome: 'COMPLETED', closed: true, closedAt: '2026-11-05T08:30:00Z',
    refund: { id: 'DEMO-REFUND-120', status: '已完成', statusCode: 'COMPLETED', amount: { currency: 'GBP', value: '23.90' },
      breakdown: { netAmount: { currency: 'GBP', value: '22.40' }, totalCreditAmount: { currency: 'GBP', value: '1.50' },
        credits: [{ code: 'FEE_CREDIT', label: '费用返还', amount: { currency: 'GBP', value: '1.50' } }] } } }
}

export function refundEligibilityReceipt(row: DisputeRecord) {
  // 只为这一笔虚构记录提供重新查询后的资格；其他失败不在前端自行解除。
  return key(row) === JSON.stringify(['demo-outdoor-uk', 'INR_REQUEST', 'DEMO-INR-120'])
    ? { allowed: true, estimate: { currency: 'GBP', value: '23.90' }, breakdown: {
      priceLines: [{ code: 'LISTING_SUBTOTAL', label: '商品退款小计', amount: { currency: 'GBP', value: '20.90' } },
        { code: 'SHIPPING_SUBTOTAL', label: '运费退款小计', amount: { currency: 'GBP', value: '3.00' } }],
      netAmount: { currency: 'GBP', value: '22.40' }, totalCreditAmount: { currency: 'GBP', value: '1.50' },
      credits: [{ code: 'FEE_CREDIT', label: '费用返还', amount: { currency: 'GBP', value: '1.50' } }],
    } } : undefined
}

export function enrichRefundFlowFixtures(rows: DisputeRecord[]) {
  const source = rows.find(row => row.id === 'DEMO-INR-101' && row.kind === 'INR_REQUEST')
  if (!source?.inquiry) return
  for (const suffix of ['120', '121', '122']) {
    if (rows.some(row => row.shopId === source.shopId && row.id === 'DEMO-INR-' + suffix)) continue
    const row: DisputeRecord = JSON.parse(JSON.stringify(source))
    row.id = 'DEMO-INR-' + suffix
    row.orderId = 'DEMO-UK-ORDER-' + suffix
    row.buyer = 'demo_buyer_' + suffix
    row.inquiry!.lineItems = [{ id: 'DEMO-INQUIRY-LINE-' + suffix, orderLineId: 'DEMO-DS-LINE-' + suffix, title: row.title, quantity: 1 }]
    row.inquiry!.carrier = 'DPD'
    row.inquiry!.tracking = 'DEMO-DPD-' + suffix
    row.inquiry!.trackings = [{ carrier: 'DPD', carrierCode: 'DPD', tracking: 'DEMO-DPD-' + suffix }]
    row.inquiry!.providedInfo = []
    row.links = []
    row.history = []
    row.operationLogs = []
    row.inquiry!.refunds = []
    row.inquiry!.refundStatus = suffix === '120' ? '退款未成功' : '等待核查退款结果'
    row.inquiry!.primaryAction = 'REFUND'
    row.inquiry!.secondaryActions = ['TRACKING']
    row.actions = ['REFUND', 'TRACKING', 'MESSAGE']
    if (suffix === '120') {
      row.inquiry!.refundOutcome = 'FAILED'
      row.inquiry!.refundFailure = { code: 'REFUND_INSTRUMENT_INSUFFICIENT_FUNDS', message: '平台明确退款出资余额不足，请处理付款账户后重新核验退款条件。', retryable: true, at: '2026-11-05T06:30:00Z' }
      row.progress = '退款未成功：出资余额不足'
      row.nextStep = '处理付款账户后重新核验退款条件'
      row.owner = '卖家'
      row.pending = null
    } else {
      row.inquiry!.refundOutcome = 'UNKNOWN'
      row.progress = '退款已提交，等待核查结果'
      row.nextStep = '核查原退款结果，勿重复申请'
      row.owner = '待核实'
      row.pending = { action: 'REFUND', draft: {}, submittedBy: '客服', operationId: 'DEMO-REFUND-ATTEMPT-' + suffix }
    }
    row.history.push({ at: '2026-11-05T06:30:00Z', actor: '卖家', title: suffix === '120' ? '退款未成功' : '已提交退款申请', detail: row.inquiry!.refundFailure?.message || row.nextStep })
    rows.push(row)
  }
}
