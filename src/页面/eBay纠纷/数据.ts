import type { DisputeRecord, Money } from './类型'
import type { ReturnRecord } from '../eBay退换货申请/模型'

const gbp = (value: string): Money => ({ currency: 'GBP', value })
const recorded = '2026-11-05T02:00:00Z'

function base(kind: DisputeRecord['kind'], id: string, orderSuffix: string): DisputeRecord {
  return {
    kind, id, shopId: 'demo-outdoor-uk', shopName: '户外精选店 UK', site: '英国',
    orderId: 'DEMO-UK-ORDER-' + orderSuffix, buyer: 'demo_buyer_' + orderSuffix,
    title: '便携营灯 · 雾蓝', sku: 'OUT-LIGHT-BL', quantity: 1, amount: gbp('23.90'),
    createdAt: '2026-11-03T01:00:00Z', updatedAt: recorded, syncedAt: recorded,
    status: 'OPEN', statusText: '进行中', sourceVersion: kind === 'PAYMENT_DISPUTE' ? 'Fulfillment API' : 'GraphQL',
    progress: '', nextStep: '', owner: '待核实', date: null,
    reason: '买家未收到商品', buyerNote: '', history: [], links: [], revision: 1,
    actions: [], referralReasons: [], pending: null,
  }
}

export function createDisputeData(): DisputeRecord[] {
  const inquiry = base('INR_REQUEST', 'DEMO-INR-101', '101')
  Object.assign(inquiry, {
    // API 演示使用明确虚构的 UTC 时刻；不由旧截图日历日期补零点。
    createdAt: '2026-11-05T01:00:00Z', status: 'OPEN', statusText: '请求已开启', progress: '已更新物流',
    nextStep: '在处理期限前核对并更新包裹跟踪', owner: '卖家', date: { label: '卖家处理期限', value: '2026-11-10T15:00:00Z', source: 'eBay 接口' },
    buyerNote: 'The parcel has not arrived. Can you check where it is?',
    actions: ['TRACKING', 'REFUND', 'MESSAGE'],
    inquiry: {
      carrier: 'Royal Mail', tracking: 'DEMO-GB-TRK-101', state: '已提供跟踪信息', refundStatus: '',
      lineItems: [{ id: 'DEMO-INR-LINE-101', orderLineId: 'DEMO-DS-LINE-101', title: inquiry.title, quantity: 1 }],
      trackings: [{ carrier: 'Royal Mail', tracking: 'DEMO-GB-TRK-101' }],
      primaryAction: 'TRACKING', secondaryActions: ['REFUND'], messageAllowed: true, initiator: '买家', responder: '卖家',
      requestedInfo: [{ kind: 'TRACKING', actor: '买家', at: '2026-11-05T01:00:00Z' }],
      providedInfo: [{ kind: 'TRACKING', actor: '卖家', at: '2026-11-05T01:30:00Z', carrier: 'Royal Mail', tracking: 'DEMO-GB-TRK-101' }],
      refundEstimate: gbp('23.90'), refunds: [],
    },
    history: [
      { at: '2026-11-05T01:00:00Z', actor: '买家', title: '发起未收到货请求', detail: '收件地址暂未收到包裹。' },
      { at: '2026-11-05T01:30:00Z', actor: '卖家', title: '更新跟踪', detail: 'Royal Mail · DEMO-GB-TRK-101' },
    ],
  })
  const waitingCase = base('EBAY_CASE', 'DEMO-CASE-102', '102')
  // 原后台截图历史与案件通知仅有日历日期，保留精度，不补来源未提供的时刻。
  Object.assign(waitingCase, {
    createdAt: '2026-11-04', title: '不锈钢保温壶 · 银色', sku: 'KIT-POT-SV', amount: gbp('31.50'),
    owner: 'eBay', progress: 'eBay 暂缓审理', statusText: '等待 eBay 裁决', status: 'ON_HOLD',
    nextStep: '等待 eBay 复核，留意补充资料通知',
    date: { label: '平台暂缓审阅至', value: '2026-11-09', source: 'eBay 案件通知' },
    caseInfo: { type: 'ITEM_NOT_RECEIVED', initiator: '卖家', escalationReason: '已提供发货跟踪，请 eBay 核实是否送达。', decision: '', appeal: '' },
    buyerNote: 'The replacement has not arrived either.',
    links: [{ shopId: waitingCase.shopId, kind: 'INR_REQUEST', id: 'DEMO-INR-102' }],
    history: [
      { at: '2026-11-03', actor: '卖家', title: '申请内留言', detail: '卖家说明此前已安排补寄，并提供了跟踪信息。' },
      { at: '2026-11-04', actor: '卖家', title: '请求 eBay 介入', detail: '请核查物流证据。' },
      { at: '2026-11-04', actor: 'eBay', title: '暂缓审阅', detail: '11 月 9 日复核进展，如有需要将另行索取资料。' },
    ],
  })
  const escalated = base('INR_REQUEST', 'DEMO-INR-102', '102')
  Object.assign(escalated, {
    title: waitingCase.title, sku: waitingCase.sku, amount: { ...waitingCase.amount },
    createdAt: '2026-11-03', status: 'CLOSED_WITH_ESCALATION', sourceVersion: 'Post-Order v2', statusText: '已升级 eBay 介入', progress: '已转入关联案件办理',
    nextStep: '查看关联 Case', owner: '已结束', buyerNote: waitingCase.buyerNote,
    inquiry: { carrier: 'Royal Mail', tracking: 'DEMO-GB-TRK-102', state: '已转入案件', refundStatus: '',
      creationReason: { code: 'ITEM_NOT_RECEIVED_TRACKING_SHOWS_DELIVERED', text: '物流显示已投递，但买家未收到' }, closedAt: '2026-11-04',
      provisionalRefund: { provided: true, reversed: true },
      lineItems: [{ id: 'DEMO-INR-LINE-102', orderLineId: 'DEMO-DS-LINE-102', title: waitingCase.title, quantity: 1 }] },
    links: [{ kind: 'EBAY_CASE', shopId: waitingCase.shopId, id: waitingCase.id }],
    history: [{ at: '2026-11-04', actor: 'eBay', title: '创建关联案件', detail: waitingCase.id }],
  })
  const answered = base('PAYMENT_DISPUTE', 'DEMO-PD-103', '103')
  // 此笔已答复样本的原后台历史只有日期，不能反推出 API 时间戳。
  Object.assign(answered, {
    createdAt: '2026-11-02', title: '桌面收纳盒 · 奶白', sku: 'HOME-BOX-WH', amount: gbp('20.00'),
    status: 'OPEN', statusText: '等待付款机构裁决', owner: '付款机构', progress: '卖家已提交答复', nextStep: '等待付款机构裁决',
    reason: '商品与描述严重不符', buyerNote: 'I did not make this purchase.',
    payment: { reasonCode: 'SIGNIFICANTLY_NOT_AS_DESCRIBED', response: '已提交答复，具体选择待核实', held: gbp('16.72'),
      convertedHold: { value: '21.68', currency: 'USD' }, protection: '', liability: null, outcome: '', waitEstimate: '约 2–8 周，有时更久',
      evidence: [], returnAddress: '' },
    history: [
      { at: '2026-11-02', actor: '付款机构', title: '收到支付争议', detail: '争议金额 GBP 20.00。' },
      { at: '2026-11-03', actor: '卖家', title: '已提交答复', detail: '平台已记录答复。' },
    ],
  })
  const contest = base('PAYMENT_DISPUTE', 'DEMO-PD-104', '104')
  Object.assign(contest, {
    title: '咖啡滤杯 · 陶瓷', sku: 'KIT-CUP-02', amount: gbp('28.40'), owner: '卖家', status: 'ACTION_NEEDED', statusText: '待卖家应答',
    progress: '已收到支付争议', nextStep: '核对订单并选择应答方式', reason: '商品与描述严重不符',
    buyerNote: 'The item differs from the description.', actions: ['ACCEPT', 'ACCEPT_RETURN', 'CONTEST', 'EVIDENCE'],
    date: { label: '卖家应答截止', value: '2026-11-07T15:00:00Z', source: '支付争议详情' },
    payment: { reasonCode: 'SIGNIFICANTLY_NOT_AS_DESCRIBED', response: '', held: null, convertedHold: null,
      protection: '', liability: null, outcome: '', waitEstimate: '', evidence: [], returnAddress: '' },
    history: [{ at: '2026-11-03T01:00:00Z', actor: '付款机构', title: '请求卖家应答', detail: '可接受或提交抗辩。' }],
  })
  const limited = base('PAYMENT_DISPUTE', 'DEMO-PD-105', '105')
  Object.assign(limited, {
    title: '旅行洗漱袋', sku: 'TRAVEL-BAG-05', amount: gbp('17.60'), owner: '卖家', status: 'ACTION_NEEDED',
    statusText: '待卖家应答', progress: '已收到支付争议', nextStep: '查看可用应答选项', reason: '预期退款未收到',
    actions: ['ACCEPT'], payment: { ...contest.payment!, reasonCode: 'CREDIT_NOT_PROCESSED', evidence: [] },
    history: [{ at: '2026-11-03T01:00:00Z', actor: '付款机构', title: '请求卖家应答', detail: '本笔返回的可用选项为接受；未取得应答期限。' }],
  })
  const ready = base('INR_REQUEST', 'DEMO-INR-106', '106')
  Object.assign(ready, {
    title: '自行车工具袋', sku: 'OUT-TOOL-06', amount: gbp('15.80'), owner: '卖家', statusText: '待卖家回复',
    progress: '买卖双方仍未解决', nextStep: '回复买家或请求 eBay 介入', actions: ['MESSAGE', 'ESCALATE'],
    referralReasons: ['UNABLE_TO_REACH_AGREEMENT', 'OTHER_REFERRAL'],
    inquiry: {
      carrier: 'DPD', tracking: 'DEMO-DPD-106', state: '已提供跟踪信息', refundStatus: '',
      trackings: [{ carrier: 'DPD', tracking: 'DEMO-DPD-106' }], secondaryActions: ['ESCALATE'], messageAllowed: true, initiator: '买家', responder: '卖家',
      referralOptions: [{ code: 'UNABLE_TO_REACH_AGREEMENT', label: '双方未能达成一致' }, { code: 'OTHER_REFERRAL', label: '其他原因' }],
      requestedInfo: [{ kind: 'SIGNATURE', actor: 'eBay', at: '2026-11-04T01:15:00Z' }],
      providedInfo: [
        { kind: 'TRACKING', actor: '卖家', at: '2026-11-03T02:30:00Z', carrier: 'DPD', tracking: 'DEMO-DPD-106' },
        { kind: 'SIGNATURE', actor: '卖家', at: '2026-11-04T02:00:00Z', tracking: 'DEMO-DPD-106',
          documentId: 'DEMO-PROOF-106', documentName: '承运商签收回单.pdf', uploadedAt: '2026-11-04T01:55:00Z' },
      ],
      refundBlockReason: 'eBay 退款回执提示该笔交易存在支付争议，当前无法就此请求退款。',
    },
    history: [{ at: '2026-11-03T03:00:00Z', actor: '买家', title: '仍未收到包裹', detail: '已查看投递点，尚未找到包裹。' }],
  })
  const legacy = base('EBAY_CASE', 'CASE-DEMO-001', '107')
  Object.assign(legacy, {
    shopId: 'shop-us', shopName: '演示店铺-US', site: '美国', orderId: 'DEMO-US-ORDER-107',
    title: '便携收纳架', sku: 'HOME-RACK-07', amount: { currency: 'USD', value: '34.50' },
    owner: 'eBay', statusText: '等待 eBay 裁决', progress: '买家反馈包裹未收到', nextStep: '等待 eBay 核实签收信息',
    caseInfo: { type: 'ITEM_NOT_RECEIVED', initiator: '买家', escalationReason: '仍未收到商品', decision: '', appeal: '' },
    history: [{ at: '2026-11-03T01:00:00Z', actor: 'eBay', title: '受理案件', detail: '等待核实承运商签收信息。' }],
  })
  const appeal = base('EBAY_CASE', 'DEMO-CASE-108', '108')
  Object.assign(appeal, {
    title: '露营水袋', sku: 'OUT-WATER-08', status: 'CLOSED', statusText: '原案已裁决', owner: 'eBay',
    progress: '卖家已申请复核', nextStep: '跟进申诉结果',
    caseInfo: { type: 'ITEM_NOT_RECEIVED', initiator: '买家', escalationReason: '未收到商品', decision: '原裁决支持买家',
      appeal: '卖家已申诉，等待 eBay 复核', platformAction: '可在 Seller Hub 查看申诉进展',
      latestDecisionId: 'DEMO-DEC-108-1',
      decisions: [{ id: 'DEMO-DEC-108-1', at: '2026-11-03T06:00:00Z', inFavorOf: 'BUYER', note: '原有物流记录未能证明已投递。',
        outcomes: [{ label: '给予买家退款', amount: gbp('23.90') }],
        review: { at: '2026-11-04T02:00:00Z', requester: '卖家', reason: '已取得新的投递资料', note: '请复核承运商后续提供的签收明细。' } }] },
    history: [
      { at: '2026-11-03T06:00:00Z', actor: 'eBay', title: '作出原裁决', detail: '原裁决支持买家。' },
      { at: '2026-11-04T02:00:00Z', actor: '卖家', title: '已申请复核', detail: '请求核验新增投递证明，尚未返回复核结果。' },
    ],
  })
  const closed = base('PAYMENT_DISPUTE', 'DEMO-PD-109', '109')
  Object.assign(closed, {
    title: '桌面灯架', sku: 'HOME-ARM-09', owner: '已结束', status: 'CLOSED', statusText: '支付争议已关闭',
    progress: '付款机构已裁决', nextStep: '查看裁决及资金记录', reason: '买家不认可交易', amount: gbp('19.80'),
    payment: { ...limited.payment!, reasonCode: 'FRAUD', response: '已抗辩', protection: '卖家获得保护',
      liability: gbp('0.00'), outcome: '付款机构裁定买家获退', evidence: [] },
    history: [{ at: '2026-11-05T01:30:00Z', actor: '付款机构', title: '裁决已返回', detail: '买家获退；资金记录显示由卖家保护覆盖。' }],
  })
  const reopened = base('PAYMENT_DISPUTE', 'DEMO-PD-110', '110')
  Object.assign(reopened, {
    title: '陶瓷香薰座', sku: 'HOME-SCENT-10', owner: '卖家', status: 'ACTION_NEEDED', statusText: '已答复，付款机构要求补证',
    progress: '收到新的证据请求', nextStep: '前往卖家后台查看补证要求', reason: '商品与描述严重不符',
    date: { label: '补证截止', value: '2026-11-11T17:30:00Z', source: '付款机构证据请求' },
    payment: { ...contest.payment!, response: '已抗辩', evidence: [{ name: 'demo-description.jpg', note: '商品说明截图' }],
      platformAction: '在 Seller Hub 查看新的证据请求，根据当前指引提交补充资料' },
    history: [
      { at: '2026-11-04T10:00:00Z', actor: '卖家', title: '已提交抗辩', detail: '已提交商品说明截图。' },
      { at: '2026-11-05T01:00:00Z', actor: '付款机构', title: '要求补充证据', detail: '请核实商品描述并补充相应材料。' },
    ],
  })
  const paymentLine = (suffix: string) => ({ itemId: 'DEMO-ITEM-' + suffix, lineItemId: 'DEMO-LINE-' + suffix + '-1' })
  for (const [row, suffix] of [[answered, '103'], [contest, '104'], [limited, '105'], [closed, '109'], [reopened, '110']] as const) {
    row.payment!.details = { lines: [paymentLine(suffix)], requests: [] }
  }
  contest.payment!.platformRevision = 5
  limited.payment!.platformRevision = 2
  contest.payment!.details!.requests = [{
    key: 'demo-description-104', type: 'PROOF_OF_ITEM_AS_DESCRIBED', lines: [paymentLine('104')],
    requestedAt: '2026-11-03T09:00:00Z', dueAt: '2026-11-07T12:00:00Z',
  }]
  // 已抗辩后的新请求单独显示。原已提供的证据没有本次新请求的身份。
  reopened.payment!.details!.requests = [{
    key: 'demo-followup-110', type: 'PROOF_OF_ITEM_AS_DESCRIBED', lines: [paymentLine('110')],
    requestedAt: '2026-11-05T02:00:00Z', dueAt: '2026-11-11T17:30:00Z',
  }]
  Object.assign(reopened.payment!.evidence[0]!, {
    evidenceId: 'DEMO-SET-110-1', fileId: 'DEMO-FILE-110-1', providedAt: '2026-11-04T10:00:00Z',
  })
  reopened.payment!.details!.buyerReturn = { onHold: true, packages: [{ carrier: 'Royal Mail', tracking: 'DEMO-RETURN-110' }] }
  closed.payment!.liability = null
  Object.assign(closed.payment!.details!, {
    closedAt: '2026-11-05T01:45:00Z', protectedAmount: gbp('19.80'), fees: gbp('2.00'), feeCredit: gbp('2.00'),
    transactions: [
      { at: '2026-11-05T01:42:00Z', reason: '争议费用', type: '扣款', amount: gbp('2.00') },
      { at: '2026-11-05T01:45:00Z', reason: '争议费用', type: '入账', amount: gbp('2.00') },
    ],
  })
  const shippingProof = base('PAYMENT_DISPUTE', 'DEMO-PD-113', '113')
  const shippingLines = [paymentLine('113'), { itemId: 'DEMO-ITEM-113-B', lineItemId: 'DEMO-LINE-113-2' }]
  Object.assign(shippingProof, {
    title: '营灯及配套挂架', sku: '', quantity: 2, amount: gbp('32.40'), reason: '买家未收到包裹',
    status: 'ACTION_NEEDED', statusText: '待卖家应答', owner: '卖家', progress: '平台要求核实发运跟踪',
    nextStep: '核对两条争议订单行的履约跟踪，再提交抗辩', actions: ['ACCEPT', 'CONTEST'],
    date: { label: '卖家应答截止', value: '2026-11-10T15:00:00Z', source: '支付争议详情' },
    payment: { ...contest.payment!, platformRevision: 7, reasonCode: 'ITEM_NOT_RECEIVED', evidence: [],
      details: { lines: shippingLines, requests: [{ key: 'demo-tracking-113', type: 'PROOF_OF_DELIVERY', lines: shippingLines,
        requestedAt: '2026-11-04T10:15:00Z', dueAt: '2026-11-09T15:00:00Z' }],
        deliveryEvidence: [{ requestKey: 'demo-tracking-113', carrier: 'Royal Mail', tracking: 'DEMO-GB-TRK-113A', lines: [shippingLines[0]!] }] } },
  })
  // 滚动的虚构窗口让“期内申诉”可持续评审。线上资格和窗口须取对应案件核实信息。
  const today = new Date()
  const relativeDay = (offset: number) => new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + offset, 12)).toISOString()
  const eligible = base('EBAY_CASE', 'DEMO-CASE-111', '111')
  const deadline = relativeDay(27)
  Object.assign(eligible, {
    title: '便携野餐餐具', sku: 'OUT-CUTLERY-11', amount: gbp('26.80'), owner: '已结束', status: 'CS_CLOSED',
    statusText: 'eBay 已结案', sourceVersion: 'Post-Order v2', createdAt: relativeDay(-8), updatedAt: relativeDay(-3),
    progress: '原裁决支持买家', nextStep: '有新证据时可申请复核', actions: ['APPEAL'],
    date: { label: '申诉窗口截止', value: deadline, source: '案件申诉期限' },
    caseInfo: { type: 'ITEM_NOT_RECEIVED', initiator: '买家', escalationReason: '买家表示未收到商品', decision: '原裁决支持买家',
      decisionParty: 'BUYER', appeal: '', appealEligible: true, appealDeadline: deadline, appealEvidence: 'TEXT', platformAction: '如需提交附件，请在 Seller Hub 办理申诉',
      latestDecisionId: 'DEMO-DEC-111-1', decisions: [{ id: 'DEMO-DEC-111-1', at: relativeDay(-3), inFavorOf: 'BUYER',
        note: '现有记录不足以核实投递。', outcomes: [{ label: '给予买家退款', amount: gbp('26.80') }] }] },
    history: [{ at: relativeDay(-3), actor: 'eBay', title: '裁决支持买家', detail: '案件已关闭，卖家当前有申诉资格。' }],
  })
  const reviewed = base('EBAY_CASE', 'DEMO-CASE-112', '112')
  Object.assign(reviewed, {
    title: '折叠工具包', sku: 'OUT-TOOL-12', status: 'CLOSED', statusText: 'eBay 已结案', owner: '已结束',
    progress: 'eBay 已完成复核', nextStep: '查看两轮裁决及结果',
    caseInfo: { type: 'ITEM_NOT_RECEIVED', initiator: '买家', escalationReason: '买家表示未收到商品',
      decision: '复核后支持卖家', decisionParty: 'SELLER', appeal: '复核完成', latestDecisionId: 'DEMO-DEC-112-2',
      decisions: [
        { id: 'DEMO-DEC-112-1', at: '2026-11-03T06:00:00Z', inFavorOf: 'BUYER', note: '当时缺少有效投递证明。',
          outcomes: [{ label: '给予买家退款', amount: gbp('23.90') }],
          review: { at: '2026-11-04T02:00:00Z', requester: '卖家', reason: '提交新投递证明', note: '承运商补充了签收资料。' } },
        { id: 'DEMO-DEC-112-2', at: '2026-11-05T01:30:00Z', inFavorOf: 'SELLER', note: '新增资料核实已投递。',
          outcomes: [{ label: '向卖家补偿退款扣款', amount: gbp('23.90') }] },
      ] },
    history: [
      { at: '2026-11-03T06:00:00Z', actor: 'eBay', title: '初次裁决', detail: '支持买家。' },
      { at: '2026-11-04T02:00:00Z', actor: '卖家', title: '申请裁决复核', detail: '提交补充投递证明。' },
      { at: '2026-11-05T01:30:00Z', actor: 'eBay', title: '作出复核裁决', detail: '复核后支持卖家。' },
    ],
  })
  return [inquiry, waitingCase, answered, contest, limited, ready, escalated, legacy, appeal, closed, reopened, eligible, reviewed, shippingProof]
}

/** 财务与请求关闭分别来自本地虚构的成功回执，不用申请金额推算到账。 */
export const inquiryRefundReceipts: Record<string, { id: string; status: string; amount: Money; closed: boolean; closedAt?: string }> = {
  [JSON.stringify(['demo-outdoor-uk', 'INR_REQUEST', 'DEMO-INR-101'])]: { id: 'DEMO-REF-101', status: 'COMPLETED', amount: gbp('23.90'), closed: true },
}

/** 投影已经拿到 Case ID 的 Return，保留原记录的交易身份和商品。 */
export function caseFromReturn(source: ReturnRecord): DisputeRecord | null {
  if (!source.caseId || !source.shopId) return null
  const row = base('EBAY_CASE', source.caseId, source.id)
  const escalation = [...source.history].reverse().find(event => event.activity === 'SELLER_ESCALATE')
  return {
    ...row, shopId: source.shopId, shopName: source.shopName, site: source.site, orderId: source.orderNo,
    buyer: source.buyerId, title: source.title, sku: source.sku, quantity: source.quantity, reason: source.reason,
    amount: { currency: source.currency, value: '' }, createdAt: escalation?.at ?? '', updatedAt: source.updatedAt,
    syncedAt: source.lastSyncedAt, owner: source.caseStatus === '等待 eBay 处理' ? 'eBay' : '待核实', status: '', sourceVersion: 'Post-Order v2 · Return', statusText: source.caseStatus || '平台状态待核实',
    progress: '退货申请已升级', nextStep: '跟进 eBay 案件进展', buyerNote: source.detail?.buyerComment || '',
    caseInfo: { type: 'RETURN', initiator: escalation ? '卖家' : '待核实', escalationReason: escalation?.text ?? '', decision: '', appeal: '' },
    links: [{ kind: 'RETURN', shopId: source.shopId, id: source.id }],
    history: [{ at: escalation?.at ?? '', actor: 'eBay', title: '退货申请已关联案件', detail: source.id }],
  }
}
