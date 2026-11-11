import type { DisputeRecord, Money } from './类型'
import type { PaymentEvidenceSet, PaymentFile } from './支付争议证据'

const money = (value: string, currency = 'GBP'): Money => ({ value, currency })
const clone = (row: DisputeRecord): DisputeRecord => JSON.parse(JSON.stringify(row))

/** 本地虚构评审资料；不代表店铺 API 已取得这些结果或写入权限。 */
export function enrichPaymentAuditFixtures(rows: DisputeRecord[]) {
  const find = (id: string) => rows.find(row => row.kind === 'PAYMENT_DISPUTE' && row.id === id)
  const initial = find('DEMO-PD-104')
  if (initial?.payment) initial.payment.availableChoices = ['SELLER_ACCEPT', 'SELLER_ACCEPT_WITH_RETURN', 'SELLER_CONTEST']
  const limited = find('DEMO-PD-105')
  if (limited?.payment) limited.payment.availableChoices = ['SELLER_ACCEPT']
  const answered = find('DEMO-PD-103')
  if (answered?.payment) {
    // 该样例只核实“已答复”，不能补造具体 SELLER_ACCEPT / SELLER_CONTEST 原码。
    answered.payment.availableChoices = []
  }
  const closed = find('DEMO-PD-109')
  if (closed?.payment) {
    closed.payment.responseCode = 'SELLER_CONTEST'
    closed.payment.availableChoices = []
  }
  const followup = find('DEMO-PD-110')
  if (followup?.payment?.details && !followup.payment.details.evidenceSets?.length) {
    followup.payment.responseCode = 'SELLER_CONTEST'
    followup.payment.availableChoices = []
    const lines = followup.payment.details.lines.map(line => ({ ...line }))
    const file = followup.payment.evidence[0]
    if (file) {
      file.type = 'image/jpeg'
      file.uploadedAt = '2026-11-04T09:58:00Z'
      followup.payment.details.evidenceSets = [{
        id: file.evidenceId || 'DEMO-SET-110-1', type: 'PROOF_OF_ITEM_AS_DESCRIBED', lines,
        requestedAt: '2026-11-03T09:00:00Z', dueAt: '2026-11-06T12:00:00Z', providedAt: '2026-11-04T10:00:00Z',
        files: [file], shipments: [],
      }]
    }
  }
  const tracking = find('DEMO-PD-113')
  if (tracking?.payment) tracking.payment.availableChoices = ['SELLER_ACCEPT', 'SELLER_CONTEST']

  if (initial?.payment && !find('DEMO-PD-114')) {
    const overdue = clone(initial)
    if (!overdue.payment) return rows
    overdue.id = 'DEMO-PD-114'
    overdue.orderId = 'DEMO-UK-ORDER-114'
    overdue.buyer = 'demo_buyer_114'
    overdue.title = '折叠储物篮 · 浅灰'
    overdue.sku = 'HOME-BASKET-GY'
    overdue.statusText = '应答已逾期，尚未答复'
    overdue.progress = '卖家应答已超期'
    overdue.nextStep = '核对当前选项，尽快答复支付争议'
    overdue.reason = '买家不认可交易'
    overdue.buyerNote = ''
    overdue.amount = money('26.50')
    overdue.date = { label: '卖家应答截止', value: '2026-11-04T15:00:00Z', source: '支付争议详情' }
    overdue.payment.response = '应答已逾期，尚未答复'
    overdue.payment.responseCode = 'SELLER_RESPONSE_OVERDUE'
    overdue.payment.reasonCode = 'FRAUD'
    overdue.payment.platformRevision = 3
    overdue.payment.availableChoices = ['SELLER_ACCEPT', 'SELLER_CONTEST']
    overdue.actions = ['ACCEPT', 'CONTEST', 'EVIDENCE']
    overdue.payment.details = {
      lines: [{ itemId: 'DEMO-ITEM-114', lineItemId: 'DEMO-LINE-114-1' }],
      requests: [{ key: 'demo-identity-114', evidenceId: 'DEMO-REQUEST-SET-114', type: 'PROOF_OF_AUTHENTICITY',
        lines: [{ itemId: 'DEMO-ITEM-114', lineItemId: 'DEMO-LINE-114-1' }],
        requestedAt: '2026-11-01T08:00:00Z', dueAt: '2026-11-06T15:00:00Z' }],
    }
    overdue.payment.evidence = []
    overdue.history = [{ at: '2026-11-05T01:00:00Z', actor: 'eBay', title: '卖家应答已逾期', detail: '尚未收到卖家接受或抗辩，当前仍可按平台选项答复。' }]
    rows.push(overdue)
  }
  if (initial?.payment && !find('DEMO-PD-115')) {
    const de = clone(initial)
    de.id = 'DEMO-PD-115'
    de.shopId = 'demo-home-de'
    de.shopName = '家居精选店 DE'
    de.site = '德国'
    de.orderId = 'DEMO-DE-ORDER-115'
    de.buyer = 'demo_buyer_115'
    de.title = '书桌抽屉收纳格'
    de.sku = 'HOME-DRAWER-115'
    de.amount = money('42.60', 'EUR')
    de.status = 'ACTION_NEEDED'
    de.statusText = '已抗辩，收到后续材料要求'
    de.progress = '付款机构要求补充签收凭证'
    de.nextStep = '前往德国站卖家后台按当前通知补证'
    de.actions = []
    de.owner = '卖家'
    de.reason = '买家未收到包裹'
    de.buyerNote = ''
    de.date = { label: '后续材料截止', value: '2026-11-12T14:00:00Z', source: '付款机构证据请求' }
    const line = { itemId: 'DEMO-ITEM-115', lineItemId: 'DEMO-LINE-115-1' }
    const file: PaymentFile = { name: 'demo-delivery-115.jpg', note: '此前已归集的投递凭证', evidenceId: 'DEMO-SET-115-1',
      fileId: 'DEMO-FILE-115-1', type: 'image/jpeg', uploadedAt: '2026-11-03T08:25:00Z', providedAt: '2026-11-03T08:30:00Z', size: 58_400 }
    const set: PaymentEvidenceSet = { id: 'DEMO-SET-115-1', type: 'PROOF_OF_DELIVERY_AS_FILE', lines: [line],
      requestedAt: '2026-11-02T11:00:00Z', dueAt: '2026-11-06T14:00:00Z', providedAt: '2026-11-03T08:30:00Z', files: [file],
      shipments: [] }
    const shipmentSet: PaymentEvidenceSet = { id: 'DEMO-SET-115-POD', type: 'PROOF_OF_DELIVERY', lines: [line],
      requestedAt: '2026-11-02T11:00:00Z', dueAt: '2026-11-06T14:00:00Z', providedAt: '2026-11-03T08:30:00Z', files: [],
      shipments: [{ carrier: 'DHL', tracking: 'DEMO-DE-TRK-115', lines: [line] }] }
    de.payment = { ...de.payment!, response: '已抗辩', responseCode: 'SELLER_CONTEST', reasonCode: 'ITEM_NOT_RECEIVED',
      availableChoices: [], platformRevision: 8, evidence: [file], returnAddress: '',
      platformAction: '在德国站 Seller Hub 查看本案通知，按当前要求补交签收凭证；此前抗辩材料保持原记录',
      details: { lines: [line], requests: [{ key: 'demo-followup-115', evidenceId: 'DEMO-REQUEST-SET-115-2',
        type: 'PROOF_OF_DELIVERY_SIGNATURE', lines: [line], requestedAt: '2026-11-05T08:00:00Z', dueAt: '2026-11-12T14:00:00Z' }],
        evidenceSets: [set, shipmentSet],
        returnAddress: { fullName: 'DEMO Returns Team', addressLine1: 'DEMO Warehouse Road 15', addressLine2: 'Unit DEMO-B',
          city: 'DEMO City', county: 'DEMO District', stateOrProvince: 'DEMO Region', postalCode: 'DEMO-115', country: 'DE',
          primaryPhone: { number: '0000000115', countryCode: 'DE' } },
      } }
    de.history = [
      { at: '2026-11-03T08:30:00Z', actor: '卖家', title: '提供投递凭证', detail: '材料已归集至原证据组。' },
      { at: '2026-11-03T09:00:00Z', actor: '卖家', title: '已提交抗辩', detail: '付款机构已收到卖家答复。' },
      { at: '2026-11-05T08:00:00Z', actor: 'eBay', title: '要求后续材料', detail: '当前要求签收凭证，请按本案通知到卖家后台办理。' },
    ]
    rows.push(de)
    if (!find('DEMO-PD-116')) {
      const resolved = clone(de)
      resolved.id = 'DEMO-PD-116'
      resolved.orderId = 'DEMO-DE-ORDER-116'
      resolved.buyer = 'demo_buyer_116'
      resolved.status = 'CLOSED'
      resolved.statusText = '支付争议已关闭'
      resolved.owner = '已结束'
      resolved.progress = '付款机构已裁决，卖家部分受保护'
      resolved.nextStep = '核对追偿、费用及各笔资金流水'
      resolved.date = null
      resolved.payment!.platformAction = undefined
      resolved.payment!.outcome = '付款机构裁定买家获退'
      resolved.payment!.protection = '卖家部分受保护'
      resolved.payment!.details = { lines: [{ itemId: 'DEMO-ITEM-116', lineItemId: 'DEMO-LINE-116-1' }], requests: [],
        closedAt: '2026-11-05T09:00:00Z', protectedAmount: money('30.20', 'EUR'), recoupAmount: money('12.40', 'EUR'),
        fees: money('1.50', 'EUR'), feeCredit: money('0.50', 'EUR'),
        transactions: [{ at: '2026-11-05T09:00:00Z', type: '扣款', reason: '争议追偿', amount: money('12.40', 'EUR') }] }
      resolved.payment!.evidence = []
      resolved.history = [{ at: '2026-11-05T09:00:00Z', actor: '付款机构', title: '争议已关闭', detail: '买家获退，卖家部分受保护；追偿金额与费用各自记录。' }]
      rows.push(resolved)
    }
  }
  return rows
}
