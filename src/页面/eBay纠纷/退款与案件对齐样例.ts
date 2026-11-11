import type { DisputeRecord, Money, SellerRefundAmounts } from './类型'

const gbp = (value: string): Money => ({ value, currency: 'GBP' })
const cad = (value: string): Money => ({ value, currency: 'CAD' })
const usd = (value: string): Money => ({ value, currency: 'USD' })

/** 本文件全部为独立虚构的来源值；不由订单金额推算退款或资金结论。 */
function estimate(): SellerRefundAmounts {
  return {
    priceLines: [{ code: 'LISTING_SUBTOTAL', label: '商品退款小计', amount: gbp('20.90') },
      { code: 'SHIPPING_SUBTOTAL', label: '运费退款小计', amount: gbp('3.00') }],
    netAmount: gbp('23.00'), totalCreditAmount: gbp('0.90'),
    credits: [{ code: 'FEE_CREDIT', label: '费用返还', amount: gbp('0.90') }],
  }
}

function copy(source: DisputeRecord, id: string): DisputeRecord {
  const row = JSON.parse(JSON.stringify(source)) as DisputeRecord
  row.id = id
  const suffix = id.split('-').slice(-1)[0]
  row.orderId = 'DEMO-UK-ORDER-' + suffix
  row.buyer = 'demo_buyer_' + suffix
  row.links = []; row.history = []; row.operationLogs = []; row.pending = null; row.revision = 1
  return row
}

export function enrichInquiryCaseAuditFixtures(rows: DisputeRecord[]): void {
  for (const row of rows) {
    for (const tracking of row.inquiry?.trackings || []) {
      if (tracking.carrier === 'DPD') tracking.carrierCode = 'DPD'
    }
  }
  const inquiry = rows.find(row => row.id === 'DEMO-INR-101')
  const reviewed = rows.find(row => row.id === 'DEMO-CASE-112')
  if (inquiry?.inquiry) {
    inquiry.inquiry.refundEstimateBreakdown = estimate()
    if (!rows.some(row => row.id === 'DEMO-INR-116')) {
      const detailed = copy(inquiry, 'DEMO-INR-116')
      detailed.title = '充电营灯 · 暖白'; detailed.sku = 'OUT-LIGHT-WH'
      detailed.progress = '等待卖家核对退款'; detailed.nextStep = '核对退款分项与预计净退款后办理'
      detailed.actions = ['REFUND', 'MESSAGE']; detailed.inquiry!.primaryAction = 'REFUND'
      detailed.inquiry!.secondaryActions = []; detailed.inquiry!.refunds = []
      detailed.inquiry!.lineItems = [{ id: 'DEMO-INR-LINE-116', orderLineId: 'DEMO-DS-LINE-116', title: detailed.title, quantity: 1 }]
      detailed.inquiry!.trackings = []; detailed.inquiry!.carrier = ''; detailed.inquiry!.tracking = ''
      detailed.inquiry!.providedInfo = []; detailed.inquiry!.requestedInfo = []
      rows.push(detailed)
    }
    if (!rows.some(row => row.id === 'DEMO-INR-117')) {
      const refunded = copy(inquiry, 'DEMO-INR-117')
      refunded.title = ''; refunded.sku = ''; refunded.owner = '已结束'; refunded.status = 'CLOSED'
      refunded.statusText = '请求已关闭'; refunded.progress = '已取得退款结果'
      refunded.nextStep = '查看卖家退款及出资执行记录'; refunded.actions = []; refunded.date = null
      refunded.sourceVersion = 'Post-Order v2 · GraphQL seller refund'
      refunded.inquiry = {
        carrier: '', tracking: '', state: '', refundStatus: '退款已完成', refundOutcome: 'COMPLETED',
        closedAt: '2026-11-05T03:05:00Z', inquiryContentOnHold: true, initiator: '买家', responder: '卖家',
        refunds: [{ id: 'DEMO-REF-117', status: '已完成', statusCode: 'COMPLETED', amount: gbp('23.90'),
          breakdown: { ...estimate(), eBayProtectionCoveredAmount: gbp('5.00'), plannedBuyerRecoveryAmount: gbp('5.00') },
          fundings: [{ stateCode: 'COMPLETED', stateText: '出资执行已完成', executions: [
            { amount: gbp('23.00'), attemptedAt: '2026-11-05T03:00:00Z', completedAt: '2026-11-05T03:04:00Z',
              stateCode: 'COMPLETED', stateText: '已完成', paymentMethod: '可用余额' },
          ] }],
        }],
      }
      refunded.buyerNote = ''
      refunded.history = [{ at: '2026-11-05T03:05:00Z', actor: 'eBay', title: '请求已关闭', detail: '已取得退款结果。' }]
      rows.push(refunded)
    }
  }
  if (reviewed?.caseInfo) {
    // 平台未公开固定结果码的样例使用 DEMO 前缀，不冒充已核实枚举。
    for (const decision of reviewed.caseInfo.decisions || []) {
      for (const outcome of decision.outcomes) outcome.code ??= decision.inFavorOf === 'SELLER' ? 'DEMO_CREDIT_SELLER' : 'DEMO_REFUND_BUYER'
      if (decision.review) decision.review.reasonCode ??= 'CONFIRMED_DELIVERY'
    }
    if (!rows.some(row => row.id === 'DEMO-CASE-118')) {
      const funds = copy(reviewed, 'DEMO-CASE-118')
      funds.title = '收纳工具包'; funds.sku = 'OUT-TOOL-18'; funds.sourceVersion = 'Post-Order v2'
      funds.amount = usd('34.67'); funds.progress = '案件退款与扣款已取得'; funds.nextStep = '核对原币扣款和费用返还'
      funds.caseInfo = {
        type: 'ITEM_NOT_RECEIVED', initiator: '买家', escalationReason: '买家表示未收到商品',
        decision: '原裁决支持买家', appeal: '申诉处理已结束', decisionParty: 'BUYER',
        legacyAppeal: { requestedAt: '2026-11-04T06:00:00Z', statusCode: 'SELLER_APPEALED', statusText: '卖家已提出申诉',
          outcomeCode: 'DENIED', outcomeText: '申诉未获批准', closureReasonCode: 'OTHER', closureReasonText: '其他原因', refundAmount: cad('0.00') },
        funds: { refundAmount: usd('34.67'), refundChargedAmount: { ...cad('45.01'), convertedFromValue: '34.67', convertedFromCurrency: 'USD', exchangeRate: '1.29826' }, feeCreditAmount: cad('1.20'),
          transactions: [{ at: '2026-11-03T07:00:00Z', type: '退款', amount: { ...cad('45.01'), convertedFromValue: '34.67', convertedFromCurrency: 'USD' }, fundingSource: '可用余额', fundingStatus: 'FUNDED' }] },
      }
      rows.push(funds)
    }
    if (!rows.some(row => row.id === 'DEMO-CASE-119')) {
      const restricted = copy(reviewed, 'DEMO-CASE-119')
      restricted.title = ''; restricted.sku = ''; restricted.buyerNote = ''; restricted.sourceVersion = 'Post-Order v2'
      restricted.caseInfo = { type: 'RETURN', initiator: '买家', escalationReason: '退货申请升级',
        decision: '案件已关闭', appeal: '', caseContentOnHold: true,
        legacyClosure: { buyerReasonCode: 'UNDEFINED', buyerReasonText: '平台未明确买家关闭原因' } }
      restricted.progress = '案件已关闭'; restricted.nextStep = '查看关闭原因与可见记录'
      rows.push(restricted)
    }
  }
}
