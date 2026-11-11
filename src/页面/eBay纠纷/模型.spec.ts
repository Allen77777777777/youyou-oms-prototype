import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { resetReturnSession, returnSession } from '../eBay退换货申请/数据'
import { createDisputeData } from './数据'
import {
  actionLabels, availableActions, dateText, disputeRecords, findRecord, isSellerOverdue, kindLabels, queueOf,
  recordKey, refreshRecord, submitAction, validateAction, type DisputeKind,
} from './模型'

function sample(id: string, kind: DisputeKind) {
  return findRecord('demo-outdoor-uk', kind, id)!
}
beforeEach(() => {
  disputeRecords.value = createDisputeData()
  resetReturnSession()
})
afterEach(resetReturnSession)

describe('按平台对象定位纠纷和处理期限', () => {
  it('后台类型名、旧工单和已升级 Return 保留源身份', () => {
    expect(Object.values(kindLabels)).toEqual(['Item not received', 'Case', 'Payment dispute'])
    expect(findRecord('shop-us', 'EBAY_CASE', 'CASE-DEMO-001')?.shopName).toBe('演示店铺-US')
    expect(sample('DEMO-CASE-006', 'EBAY_CASE').links).toEqual([{ kind: 'RETURN', id: 'DEMO-RT-006', shopId: 'demo-outdoor-uk' }])
    expect(sample('DEMO-CASE-006', 'EBAY_CASE').amount.value).toBe('')
    expect(findRecord('shop-us', 'EBAY_CASE', 'DEMO-CASE-006')).toBeUndefined()
  })
  it('同店同号的两种对象独立，重复的订单号不构成关联', () => {
    const request = sample('DEMO-INR-101', 'INR_REQUEST')
    disputeRecords.value.push({ ...sample('DEMO-PD-104', 'PAYMENT_DISPUTE'), id: request.id, orderId: request.orderId })
    const payment = sample(request.id, 'PAYMENT_DISPUTE')
    expect(recordKey(payment)).not.toBe(recordKey(request))
    expect(payment.links).toEqual([])
    expect(request.links).toEqual([])
  })
  it('Return 仅在原申请取得案件编号后进入，并可按来源返回', () => {
    const source = returnSession.records.find(row => row.id === 'DEMO-RT-005')!
    source.status = 'ESCALATED'
    expect(findRecord(source.shopId, 'EBAY_CASE', 'DEMO-CASE-005')).toBeUndefined()
    source.caseId = 'DEMO-CASE-005'
    source.caseStatus = '等待 eBay 处理'
    expect(findRecord(source.shopId, 'EBAY_CASE', source.caseId)?.links[0]?.id).toBe(source.id)
    expect(findRecord(source.shopId, 'EBAY_CASE', source.caseId)?.owner).toBe('eBay')
  })
  it('日期精度、截止责任和等待机构各自独立', () => {
    const hold = sample('DEMO-CASE-102', 'EBAY_CASE'), paid = sample('DEMO-PD-103', 'PAYMENT_DISPUTE')
    expect(dateText(hold.date!.value)).toBe('2026-11-09')
    expect(isSellerOverdue(hold, new Date('2030-01-01'))).toBe(false)
    expect(dateText('2026-11-05T02:00:00Z')).toContain('2026-11-05 10:00')
    expect(hold.owner).toBe('eBay')
    expect(paid.owner).toBe('付款机构')
    expect(queueOf(hold)).toBe('等待结果')
    expect(queueOf(sample('DEMO-CASE-108', 'EBAY_CASE'))).toBe('申诉跟进')
    expect(paid.date).toBeNull()
    expect(isSellerOverdue(sample('DEMO-PD-104', 'PAYMENT_DISPUTE'), new Date('2030-01-01'))).toBe(true)
    expect(isSellerOverdue(sample('DEMO-PD-105', 'PAYMENT_DISPUTE'), new Date('2030-01-01'))).toBe(false)
  })
})

describe('逐笔资格、动作回执与原始业务事实', () => {
  it('样本显示已更新跟踪及三个办理选项，留言只进入申请历史', () => {
    const request = sample('DEMO-INR-101', 'INR_REQUEST')
    expect(availableActions(request)).toEqual(['TRACKING', 'REFUND', 'MESSAGE'])
    expect(submitAction(request, 'TRACKING', { carrier: 'DPD', tracking: 'DEMO-NEXT' }, request.revision)).toBe('')
    expect(request.inquiry?.tracking).toBe('DEMO-NEXT')
    expect(submitAction(request, 'MESSAGE', { message: '已向承运商查询。' }, request.revision)).toBe('')
    expect(request.history[request.history.length - 1]?.detail).toBe('已向承运商查询。')
    expect(request.owner).toBe('卖家')
    expect(availableActions(sample('DEMO-CASE-102', 'EBAY_CASE'))).toEqual([])
    expect(availableActions(sample('DEMO-INR-102', 'INR_REQUEST'))).toEqual([])
  })
  it('退款确认分开，待回查不能重复提交', () => {
    const row = sample('DEMO-INR-101', 'INR_REQUEST'), before = row.revision
    expect(submitAction(row, 'REFUND', {}, before)).toBe('')
    expect(availableActions(row)).toEqual([])
    expect(row.inquiry?.refundStatus).toBe('待回查')
    expect(submitAction(row, 'REFUND', {}, before)).toContain('版本')
    refreshRecord(row)
    const count = row.history.length
    refreshRecord(row)
    expect(row.history).toHaveLength(count)
    expect(row.inquiry?.refundStatus).toContain('已核实')
    expect(queueOf(row)).toBe('已结束')
  })
  it('申诉要求明确资格、有效窗口和新证据，回查后保留原裁决', () => {
    const row = sample('DEMO-CASE-111', 'EBAY_CASE'), info = row.caseInfo!
    const original = info.decision, deadline = info.appealDeadline
    expect(availableActions(row)).toEqual(['APPEAL'])
    expect(validateAction(row, 'APPEAL', {})).toContain('新证据')
    info.appealEvidence = 'ATTACHMENT'
    expect(availableActions(row)).toEqual([])
    info.appealEvidence = 'TEXT'
    info.appealDeadline = '2001-01-01T00:00:00Z'
    expect(availableActions(row)).toEqual([])
    info.appealDeadline = deadline
    info.appealEligible = false
    expect(availableActions(row)).toEqual([])
    info.appealEligible = true
    expect(submitAction(row, 'APPEAL', { message: '承运商出具新的投递说明。' }, row.revision)).toBe('')
    expect(availableActions(row)).toEqual([])
    expect(info.appeal).toBe('')
    refreshRecord(row)
    expect(info.decision).toBe(original)
    expect(info.appeal).toContain('等待 eBay')
    expect(queueOf(row)).toBe('申诉跟进')
    expect(availableActions(row)).toEqual([])
    expect(row.history[row.history.length - 1]?.detail).toContain('承运商')
  })
  it('介入确认后才创建独立 Case 并保留来源请求', () => {
    const request = sample('DEMO-INR-106', 'INR_REQUEST')
    expect(submitAction(request, 'ESCALATE', { reason: '未返回原因' }, request.revision)).toContain('允许')
    expect(submitAction(request, 'ESCALATE', { reason: request.referralReasons[0] }, request.revision)).toBe('')
    expect(request.links).toEqual([])
    refreshRecord(request)
    const link = request.links[0]!
    const linked = findRecord(link.shopId, 'EBAY_CASE', link.id)!
    expect(linked.links[0]?.id).toBe(request.id)
    expect(linked.caseInfo?.referralReasonCode).toBe('UNABLE_TO_REACH_AGREEMENT')
    expect(linked.caseInfo?.escalationReason).toBe('双方未能达成一致')
    expect(availableActions(request)).toEqual([])
    refreshRecord(request)
    expect(disputeRecords.value.filter(row => recordKey(row) === recordKey(linked))).toHaveLength(1)
  })
  it('按包裹提交完整跟踪组，逐条记录，签收和平台原有资料保持原样', () => {
    const row = sample('DEMO-INR-101', 'INR_REQUEST')
    const existing = row.inquiry!.providedInfo![0]!
    const one = { carrier: 'DPD', tracking: 'DEMO-ONE' }, two = { carrier: 'Royal Mail', tracking: 'DEMO-TWO' }
    expect(validateAction(row, 'TRACKING', { trackings: [one, { ...two, tracking: '' }] })).toContain('每个包裹')
    expect(validateAction(row, 'TRACKING', { trackings: [one, one] })).toContain('重复')
    expect(submitAction(row, 'TRACKING', { trackings: [one, two] }, row.revision)).toBe('')
    expect(row.inquiry!.trackings).toEqual([one, two])
    expect(row.inquiry!.providedInfo).toEqual([existing, expect.objectContaining(one), expect.objectContaining(two)])
    expect(row.history[row.history.length - 1]?.detail).toContain('DEMO-TWO')
  })
  it('已明确的退款拦截阻止提交，估算缺失时不能用交易金额代替', () => {
    const row = sample('DEMO-INR-101', 'INR_REQUEST'), info = row.inquiry!
    delete info.refundEstimate
    expect(validateAction(row, 'REFUND', {})).toContain('估算')
    info.refundBlockReason = 'eBay 回执已明确存在支付争议'
    expect(availableActions(row)).not.toContain('REFUND')
    expect(validateAction(row, 'REFUND', {})).not.toBe('')
    expect(info.refunds).toEqual([])
  })
  it('申诉回执归原裁决，后续复核不会覆盖原轮，当前裁决无法识别时不能代为提交', () => {
    const row = sample('DEMO-CASE-111', 'EBAY_CASE'), info = row.caseInfo!
    const original = info.latestDecisionId
    expect(submitAction(row, 'APPEAL', { message: '新投递资料' }, row.revision)).toBe('')
    info.latestDecisionId = 'UNKNOWN'
    expect(refreshRecord(row)).toContain('核查原裁决')
    expect(row.pending?.action).toBe('APPEAL')
    expect(info.decisions![0]!.review).toBeUndefined()
    info.latestDecisionId = original
    refreshRecord(row)
    expect(info.decisions![0]!.review?.note).toBe('新投递资料')
    const finished = sample('DEMO-CASE-112', 'EBAY_CASE')
    expect(finished.caseInfo!.decisions!.map(decision => decision.inFavorOf)).toEqual(['BUYER', 'SELLER'])
    expect(availableActions(finished)).toEqual([])
  })
  it('已答复与待补证样例不会重新开放应答，暂扣不覆盖争议额', () => {
    const answered = sample('DEMO-PD-103', 'PAYMENT_DISPUTE')
    expect(availableActions(answered)).toEqual([])
    expect(answered.payment?.held?.value).toBe('16.72')
    expect(answered.payment?.convertedHold?.currency).toBe('USD')
    expect(answered.amount.value).toBe('20.00')
    expect(availableActions(sample('DEMO-PD-110', 'PAYMENT_DISPUTE'))).toEqual([])
    expect(queueOf(sample('DEMO-PD-110', 'PAYMENT_DISPUTE'))).toBe('待卖家处理')
  })
  it('物流跟踪举证不使用图片接口，证据必须关联该请求', () => {
    const row = sample('DEMO-PD-113', 'PAYMENT_DISPUTE')
    row.actions.push('EVIDENCE')
    expect(availableActions(row)).not.toContain('EVIDENCE')
    const draft = { platformRevision: row.payment!.platformRevision }
    expect(validateAction(row, 'CONTEST', { ...draft, evidenceNote: '已发运' })).toContain('物流跟踪')
    const details = row.payment!.details!
    details.deliveryEvidence = [{ requestKey: '另一个要求', carrier: 'Demo', tracking: 'DEMO-PARCEL', lines: [details.lines[0]!] }]
    expect(validateAction(row, 'CONTEST', draft)).toContain('物流跟踪')
    details.deliveryEvidence[0]!.requestKey = details.requests[0]!.key
    expect(validateAction(row, 'CONTEST', draft)).toContain('物流跟踪')
    details.deliveryEvidence[0]!.lines = [...details.lines]
    expect(validateAction(row, 'CONTEST', draft)).toBe('')
  })
  it('接受争议与接受并要求退回各自跟进资金或退货', () => {
    const row = sample('DEMO-PD-105', 'PAYMENT_DISPUTE')
    const localRevision = row.revision
    expect(submitAction(row, 'ACCEPT', {}, localRevision)).toContain('平台版本')
    expect(submitAction(row, 'ACCEPT', { platformRevision: row.payment!.platformRevision! - 1 }, localRevision)).toContain('平台版本')
    expect(row.revision).toBe(localRevision)
    expect(row.pending).toBeNull()
    expect(submitAction(row, 'ACCEPT', { platformRevision: row.payment!.platformRevision }, localRevision)).toBe('')
    expect(row.pending?.draft.platformRevision).toBe(2)
    refreshRecord(row)
    expect(row.nextStep).toContain('结案与退款')
    expect(row.payment?.liability).toBeNull()
    const returning = sample('DEMO-PD-104', 'PAYMENT_DISPUTE')
    expect(submitAction(returning, 'ACCEPT_RETURN', { platformRevision: returning.payment!.platformRevision, returnAddress: 'Demo address' }, returning.revision)).toBe('')
    refreshRecord(returning)
    expect(returning.owner).toBe('买家')
    expect(returning.nextStep).toContain('退回包裹')
  })
  it('受限争议禁止未返回选项；已有证据可复用，正式抗辩需要地址', () => {
    const limited = sample('DEMO-PD-105', 'PAYMENT_DISPUTE'), contest = sample('DEMO-PD-104', 'PAYMENT_DISPUTE')
    expect(availableActions(limited)).toEqual(['ACCEPT'])
    expect(submitAction(limited, 'CONTEST', {}, limited.revision)).toContain('不能办理')
    const evidenceRequest = contest.payment!.details!.requests[0]!.key
    const file = (name: string) => new File(['content'], name, { type: 'image/png' })
    expect(validateAction(contest, 'EVIDENCE', { evidenceRequest, evidenceNote: '文字不能代替文件' })).toContain('文件')
    const platformRevision = contest.payment!.platformRevision
    expect(validateAction(contest, 'CONTEST', { platformRevision, returnAddress: 'Demo address', evidenceNote: '仅填说明' })).toContain('请先按本案要求')
    expect(submitAction(contest, 'EVIDENCE', { evidenceRequest, evidenceFiles: [file('one.png')], evidenceNote: '商品描述' }, contest.revision)).toBe('')
    expect(validateAction(contest, 'EVIDENCE', { evidenceRequest, evidenceFiles: [file('one.png')] })).toContain('同名')
    expect(validateAction(contest, 'EVIDENCE', { evidenceRequest, evidenceFiles: [2,3,4,5,6].map(n => file(n + '.png')) })).toContain('合计')
    expect(validateAction(contest, 'EVIDENCE', { evidenceRequest, evidenceFiles: [new File([new Uint8Array(1_499_999)], 'large.png')] })).toContain('1.5 MB')
    const firstSet = contest.payment!.evidence[0]!
    expect(submitAction(contest, 'EVIDENCE', { evidenceRequest, evidenceFiles: [file('two.png')] }, contest.revision)).toBe('')
    const nextFile = contest.payment!.evidence[1]!
    expect(nextFile.evidenceId).toBe(firstSet.evidenceId)
    expect(nextFile.fileId).not.toBe(firstSet.fileId)
    expect(contest.payment?.response).toBe('')
    expect(contest.payment!.platformRevision).toBe(platformRevision)
    expect(validateAction(contest, 'CONTEST', { platformRevision, evidenceNote: '实物与描述相符' })).toContain('地址')
    expect(submitAction(contest, 'CONTEST', { platformRevision, returnAddress: 'Demo returns address', evidenceNote: '实物与描述相符' }, contest.revision)).toBe('')
    refreshRecord(contest)
    expect(contest.payment?.responseNote).toBe('实物与描述相符')
    expect(contest.payment?.response).toBe(actionLabels.CONTEST)
    expect(contest.payment?.liability).toBeNull()
    expect(contest.payment?.evidence).toHaveLength(2)
    expect(availableActions(contest)).toEqual([])
  })
})
