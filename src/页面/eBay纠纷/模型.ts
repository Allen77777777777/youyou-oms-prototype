import { ref, watch } from 'vue'
import { createCustomerServiceLog } from '@/组件/客服日志/日志工具'
import { currentHandlerName } from '@/组件/客服处理人/处理人'
import { 转换eBay时间 } from '../eBay订单/时间工具'
import { 读取排序时刻 } from '@/组件/筛选/筛选工具'
import { returnSession } from '../eBay退换货申请/数据'
import { caseFromReturn, createDisputeData, inquiryRefundReceipts } from './数据'
import { attachPaymentFiles, fileRequests, isPaymentDecision, knownPaymentRevision, paymentAvailableActions, validatePaymentEvidence } from './支付争议证据'
import { normalizedInquiryTrackings } from './办理接口边界'
import { enrichInquiryCaseAuditFixtures } from './退款与案件对齐样例'
import { enrichPaymentAuditFixtures } from './支付争议对齐样例'
import { auditRefundReceipt, enrichRefundFlowFixtures, refundEligibilityReceipt } from './退款回执样例'
import { actionLabels, type ActionCode, type ActionDraft, type DisputeKind, type DisputeQueue, type DisputeRecord } from './类型'
export * from './类型'

export function createAlignedDisputeData() {
  const rows = createDisputeData()
  enrichInquiryCaseAuditFixtures(rows)
  enrichPaymentAuditFixtures(rows)
  enrichRefundFlowFixtures(rows)
  return rows
}
export const disputeRecords = ref<DisputeRecord[]>(createAlignedDisputeData())
type Identity = Pick<DisputeRecord, 'shopId' | 'kind' | 'id'>
export function recordKey(row: Identity) { return JSON.stringify([row.shopId, row.kind, row.id]) }
export function findRecord(shopId: string, kind: DisputeKind, id: string) {
  return disputeRecords.value.find(row => row.shopId === shopId && row.kind === kind && row.id === id)
}
watch(() => returnSession.records.map(caseFromReturn), sources => {
  const linked = sources.filter((row): row is DisputeRecord => row !== null).map(row => {
    const prior = disputeRecords.value.find(existing => recordKey(existing) === recordKey(row))
    return { ...row, operationLogs: prior?.operationLogs, closedHandlerIds: prior?.closedHandlerIds }
  })
  const standalone = disputeRecords.value.filter(row => !row.links.some(link => link.kind === 'RETURN'))
  disputeRecords.value = [...standalone, ...linked]
}, { immediate: true, flush: 'sync' })

export function queueOf(row: DisputeRecord): DisputeQueue | null {
  if (row.owner === '已结束') return '已结束'
  if (row.owner === '卖家') return '待卖家处理'
  if (row.caseInfo?.appeal) return '申诉跟进'
  if (row.owner === '待核实') return null
  return '等待结果'
}

export function dateText(value?: string | null) {
  const text = value?.trim()
  if (!text || text === '—') return '—'
  // 日期型历史及通知保持来源精度；仅自带时区的时刻参与北京时间换算。
  if (/^\d{4}-\d\d-\d\d$/.test(text)) return text
  return 转换eBay时间(text, 'Asia/Shanghai')
}
export function isSellerOverdue(row: DisputeRecord, now = new Date()): boolean {
  if (row.owner !== '卖家' || !row.date || row.pending) return false
  if (row.kind === 'INR_REQUEST' && !row.inquiry?.primaryAction) return false
  const value = row.date.value
  if (/^\d{4}-\d\d-\d\d$/.test(value)) {
    // 后台日期不带时刻或时区，只显示当日历日，无从证实准确的逾期时刻。
    return false
  }
  const instant = 读取排序时刻(value)
  return instant !== undefined && instant < now.getTime()
}

const inquiryActions: ActionCode[] = ['TRACKING', 'MESSAGE', 'REFUND', 'ESCALATE']
function currentDecision(row: DisputeRecord) {
  return row.caseInfo?.decisions?.find(decision => decision.id === row.caseInfo?.latestDecisionId)
}
function normalizedTrackings(draft: ActionDraft) {
  return normalizedInquiryTrackings(draft)
}
const paymentActions: ActionCode[] = ['ACCEPT', 'ACCEPT_RETURN', 'CONTEST', 'EVIDENCE']
export function availableActions(row: DisputeRecord): ActionCode[] {
  if (row.pending) return []
  if (row.kind === 'EBAY_CASE') {
    const info = row.caseInfo
    const decision = currentDecision(row)
    const currentCanBeReviewed = info?.decisions ? decision?.inFavorOf === 'BUYER' && !decision.review : info?.decisionParty === 'BUYER' && !info.appeal
    const appealDeadline = 读取排序时刻(info?.appealDeadline)
    const allowed = info?.appealEligible === true && info.appealEvidence === 'TEXT' && currentCanBeReviewed &&
      appealDeadline !== undefined && appealDeadline > Date.now() &&
      ['CLOSED', 'CS_CLOSED'].includes(row.status) && row.actions.includes('APPEAL')
    return allowed ? ['APPEAL'] : []
  }
  if (row.owner === '已结束') return []
  if (row.kind === 'INR_REQUEST' && row.inquiry && row.status === 'OPEN' && !row.links.some(link => link.kind === 'EBAY_CASE')) {
    const info = row.inquiry
    const scopedActions = info.primaryAction || info.secondaryActions ? [info.primaryAction, ...(info.secondaryActions || [])] : row.actions
    return row.actions.filter(action => inquiryActions.includes(action) && (action === 'MESSAGE' ? info.messageAllowed === true : scopedActions.includes(action))
      && !(action === 'REFUND' && (info.refundBlockReason || ['FAILED', 'UNKNOWN', 'ACCEPTED', 'COMPLETED'].includes(info.refundOutcome || ''))))
  }
  if (row.kind === 'PAYMENT_DISPUTE' && row.payment) {
    return paymentAvailableActions(row).filter(action => paymentActions.includes(action) &&
      (action !== 'EVIDENCE' || (row.actions.includes('CONTEST') && fileRequests(row).length > 0)))
  }
  return []
}

export function validateAction(row: DisputeRecord, action: ActionCode, draft: ActionDraft): string {
  if (!availableActions(row).includes(action)) return '当前记录已不能办理此操作，请刷新详情。'
  if (isPaymentDecision(action) && (!knownPaymentRevision(draft.platformRevision) || draft.platformRevision !== row.payment?.platformRevision)) {
    return '支付争议的平台版本已变化或尚未取得，请刷新后重新打开办理。'
  }
  if (action === 'TRACKING') {
    const entries = normalizedTrackings(draft)
    if (entries.some(entry => entry.carrierCode !== undefined && !entry.carrierCode)) return '请填写每个包裹的平台承运商代码。'
    if (entries.some(entry => entry.carrierCode === 'UNSUPPORTED' && !entry.unsupportedCarrierName)) return '其他承运商须填写名称。'
    if (!entries.length || entries.some(entry => !entry.carrier || !entry.tracking)) return '请为每个包裹填写承运商和跟踪号。'
    if (entries.some(entry => entry.tracking.length > 500)) return '跟踪号不能超过 500 个字符。'
    const keys = entries.map(entry => JSON.stringify([entry.carrier.toLowerCase(), entry.tracking]))
    if (new Set(keys).size !== keys.length) return '本次提交含重复的承运商和跟踪号。'
  }
  if (action === 'MESSAGE' && !draft.message?.trim()) return '请填写发给买家的留言。'
  if (action === 'MESSAGE' && (draft.message?.length ?? 0) > 500) return '请求内留言最多 500 个字符。'
  if (action === 'APPEAL' && !draft.message?.trim()) return '请说明原裁决尚未考虑的新证据。'
  if (action === 'ESCALATE') {
    const offered = row.inquiry?.referralOptions?.map(option => option.code) ?? row.referralReasons
    if (!offered.includes(draft.reason || '')) return '请选择该请求允许的介入原因。'
  }
  if (action === 'REFUND') {
    const estimate = row.inquiry?.refundEstimate
    if (!estimate?.currency || !/^\d+(\.\d+)?$/.test(estimate.value) || Number(estimate.value) <= 0) return '平台可退估算金额或币种尚未核实。'
  }
  if ((action === 'ACCEPT' || action === 'ACCEPT_RETURN') && (!row.amount.currency || !/^\d+(\.\d+)?$/.test(row.amount.value) || Number(row.amount.value) <= 0)) return '争议金额或币种尚未核实，请先核查。'
  if ((action === 'ACCEPT_RETURN' || (action === 'CONTEST' && row.payment?.reasonCode === 'SIGNIFICANTLY_NOT_AS_DESCRIBED')) && !draft.returnAddress?.trim()) return '请核对并填写完整的退货地址。'
  return action === 'EVIDENCE' || action === 'CONTEST' ? validatePaymentEvidence(row, action, draft) : ''
}

function logEvent(row: DisputeRecord, at: string, actor: string, title: string, detail: string) {
  row.history.push({ at, actor, title, detail })
  row.updatedAt = at
}
function operationSummary(row: DisputeRecord, action: ActionCode, draft: ActionDraft) {
  if (action === 'TRACKING') return normalizedTrackings(draft).map(entry => entry.carrier + ' · ' + entry.tracking).join('；')
  if (action === 'MESSAGE') return `请求内留言 ${draft.message?.trim().length || 0} 字，正文见处理过程`
  if (action === 'EVIDENCE') return `举证要求：${draft.evidenceRequest || '未记录'}；归集 ${draft.evidenceFiles?.length || 0} 份材料，原件见举证要求与材料`
  if (action === 'REFUND') return `按本案预计退款 ${row.inquiry?.refundEstimate?.currency || ''} ${row.inquiry?.refundEstimate?.value || ''} 提交；实际退款待回执`
  if (action === 'ESCALATE') return `介入原因：${row.inquiry?.referralOptions?.find(option => option.code === draft.reason)?.label || draft.reason || '未记录'}`
  if (action === 'APPEAL') return `目标裁决：${row.caseInfo?.latestDecisionId || '未记录'}；已提交新证据说明，内容见本次办理`
  return `争议金额 ${row.amount.currency} ${row.amount.value}；平台版本 ${draft.platformRevision ?? '未记录'}${draft.returnAddress ? '；含本次退回地址，地址见办理资料' : ''}`
}
function logRecheck(row: DisputeRecord, at: string, result: string, content: string) {
  const pending = row.pending
  if (!pending) return
  const logs = row.operationLogs ??= []
  const relatedId = pending.operationId
  if (logs.some(log => log.relatedId === relatedId && log.action === '核查' + actionLabels[pending.action] && log.result === result && log.content.endsWith(content))) return
  logs.push({ ...createCustomerServiceLog('系统', '核查' + actionLabels[pending.action],
    `原提交人：${pending.submittedBy || '未记录'}；${content}`, result, at), relatedId, submittedBy: pending.submittedBy })
}
/** 受理与外部办理结果分开。只在本地形成记录，不向平台、仓库或售后单写入。 */
export function submitAction(row: DisputeRecord, action: ActionCode, draft: ActionDraft, expectedRevision: number, at = new Date().toISOString()): string {
  const current = findRecord(row.shopId, row.kind, row.id)
  if (current !== row || current.revision !== expectedRevision) return '记录版本已变化，请刷新后重新核对。'
  const error = validateAction(row, action, draft)
  if (error) return error
  const actor = currentHandlerName.value
  const operation = createCustomerServiceLog(actor, actionLabels[action], operationSummary(row, action, draft),
    ['TRACKING', 'MESSAGE', 'EVIDENCE'].includes(action) ? '成功' : '已提交', at)
  ;(row.operationLogs ??= []).push(operation)
  row.revision++
  if (action === 'TRACKING') {
    const trackings = normalizedTrackings(draft), info = row.inquiry!
    info.trackings = trackings
    info.carrier = trackings[0]!.carrier
    info.tracking = trackings[0]!.tracking
    info.providedInfo ??= []
    for (const entry of trackings) info.providedInfo.push({ ...entry, kind: 'TRACKING', at, actor: '卖家' })
    info.state = '已提供跟踪信息'
    row.progress = '已更新物流'
    logEvent(row, at, '卖家', row.progress, trackings.map(entry => entry.carrier + ' · ' + entry.tracking).join('；'))
  } else if (action === 'MESSAGE') {
    row.progress = '已给买家留言'
    logEvent(row, at, '卖家', row.progress, draft.message!.trim())
  } else if (action === 'EVIDENCE') {
    attachPaymentFiles(row, draft, at)
    row.progress = '已归集抗辩证据'
    logEvent(row, at, '卖家', row.progress, (draft.evidenceFiles || []).map(file => file.name).join('、'))
  } else {
    row.pending = { action, draft: { ...draft }, submittedBy: actor, operationId: operation.id }
    if (isPaymentDecision(action) && row.payment) row.payment.submittedRevision = draft.platformRevision
    if (action === 'APPEAL' && row.caseInfo?.latestDecisionId) row.pending.decisionId = row.caseInfo.latestDecisionId
    row.progress = actionLabels[action] + '已提交，等待回查'
    row.nextStep = '刷新核查平台回执'
    row.owner = '待核实'
    if (action === 'REFUND') {
      row.inquiry!.refundStatus = '待回查'
      row.inquiry!.refundOutcome = 'UNKNOWN'
      row.inquiry!.refundFailure = undefined
    }
    logEvent(row, at, '卖家', row.progress, '已记录提交，等待平台确认。')
  }
  return ''
}

function confirmReferral(row: DisputeRecord, reason: string, at: string) {
  // 本地模拟成功回执，和 Return 的 Case ID 名称空间分开。
  const id = 'DEMO-CASE-FROM-' + row.id
  const link = { shopId: row.shopId, kind: 'EBAY_CASE' as const, id }
  const reasonLabel = row.inquiry?.referralOptions?.find(option => option.code === reason)?.label ?? reason
  const caseRecord: DisputeRecord = {
    ...row, kind: 'EBAY_CASE', id, status: 'OPEN', statusText: '等待 eBay 裁决', nextStep: '等待 eBay 核查',
    owner: 'eBay', progress: 'eBay 已介入', date: null, pending: null, inquiry: undefined, actions: [], referralReasons: [],
    amount: { ...row.amount }, createdAt: at, updatedAt: at, syncedAt: at, revision: 1,
    caseInfo: { type: 'ITEM_NOT_RECEIVED', initiator: '卖家', escalationReason: reasonLabel, referralReasonCode: reason, decision: '', appeal: '' },
    history: [{ at, actor: 'eBay', title: '已受理介入请求', detail: reasonLabel }], operationLogs: [],
    links: [{ shopId: row.shopId, kind: 'INR_REQUEST', id: row.id }],
  }
  if (!findRecord(link.shopId, link.kind, link.id)) disputeRecords.value.unshift(caseRecord)
  if (!row.links.some(value => value.kind === link.kind && value.shopId === link.shopId && value.id === link.id)) row.links.push(link)
  row.status = 'CLOSED'
  row.statusText = '已升级 eBay 介入'
  row.owner = '已结束'
  row.progress = 'eBay 已确认升级'
  row.nextStep = '查看关联 Case'
  row.inquiry!.state = '已转入案件'
}

export function refreshRecord(row: DisputeRecord, at = new Date().toISOString()): string {
  const current = findRecord(row.shopId, row.kind, row.id)
  if (current !== row) return '记录已更新，请重新打开详情。'
  row.syncedAt = at
  const pending = row.pending
  if (!pending) return '已刷新当前记录。'
  const { action, draft } = pending
  let detail = ''
  if (action === 'ESCALATE') {
    confirmReferral(row, draft.reason || '', at)
    detail = draft.reason || ''
  } else if (action === 'APPEAL' && row.caseInfo) {
    const decision = currentDecision(row)
    if (pending.decisionId && pending.decisionId !== decision?.id) {
      const message = '当前裁决已更新，请核查原裁决的申诉回执。'
      logRecheck(row, at, '待核查', message)
      return message
    }
    if (decision && !decision.review) decision.review = { at, requester: '卖家', reason: '申请复核', note: draft.message?.trim() }
    row.caseInfo.appealEligible = false
    row.caseInfo.appeal = '卖家已申诉，等待 eBay 复核'
    row.caseInfo.platformAction = '可在 Seller Hub 查看申诉进展'
    row.progress = row.caseInfo.appeal
    row.nextStep = '等待 eBay 审核新证据'
    row.owner = 'eBay'
    detail = draft.message?.trim() || ''
  } else if (action === 'REFUND') {
    const auditReceipt = auditRefundReceipt(row)
    if (auditReceipt?.outcome === 'FAILED') {
      const info = row.inquiry!
      info.refundOutcome = 'FAILED'
      info.refundFailure = { code: auditReceipt.code, message: auditReceipt.message, retryable: auditReceipt.retryable, at }
      info.refundStatus = '退款未成功'
      if (!auditReceipt.retryable) info.refundBlockReason = auditReceipt.message
      row.progress = '已核实退款未成功'
      row.nextStep = auditReceipt.retryable ? '处理失败原因后重新核验退款条件' : '核对平台限制及原争议后办理'
      row.owner = '卖家'
      logRecheck(row, at, '失败', auditReceipt.message)
      row.pending = null
      row.revision++
      logEvent(row, at, '平台回查', row.progress, auditReceipt.message)
      return row.progress
    }
    if (auditReceipt?.outcome === 'UNKNOWN') {
      row.inquiry!.refundOutcome = 'UNKNOWN'
      const message = '尚未取得退款结果，请稍后继续核查，勿重复申请。'
      logRecheck(row, at, '待核查', message)
      return message
    }
    if (auditReceipt?.outcome === 'COMPLETED') {
      const info = row.inquiry!
      const refunds = info.refunds ??= []
      if (!refunds.some(refund => refund.id === auditReceipt.refund.id)) refunds.push(auditReceipt.refund)
      info.refundOutcome = 'COMPLETED'
      info.refundFailure = undefined
      info.refundStatus = '已核实平台退款 ' + auditReceipt.refund.amount.currency + ' ' + auditReceipt.refund.amount.value
      if (auditReceipt.closed) {
        info.closedAt = auditReceipt.closedAt
        row.status = 'CLOSED'
        row.statusText = '请求已关闭'
        row.owner = '已结束'
      } else row.owner = '待核实'
      row.progress = auditReceipt.closed ? '已核实平台退款和关闭回执' : '已核实平台退款'
      row.nextStep = '查看退款记录'
      detail = info.refundStatus
    } else {
      const receipt = inquiryRefundReceipts[recordKey(row)]
      if (!receipt) {
        const message = '尚未取得退款结果，请稍后继续核查。'
        logRecheck(row, at, '待核查', message)
        return message
      }
      const refunds = row.inquiry!.refunds ??= []
      if (!refunds.some(refund => refund.id === receipt.id)) refunds.push({ id: receipt.id, status: receipt.status, amount: { ...receipt.amount } })
      row.inquiry!.refundStatus = '已核实平台退款 ' + receipt.amount.currency + ' ' + receipt.amount.value
      row.inquiry!.refundOutcome = 'COMPLETED'
      if (receipt.closed) {
        row.inquiry!.closedAt = receipt.closedAt
        row.status = 'CLOSED'
        row.statusText = '请求已关闭'
        row.owner = '已结束'
      } else {
        row.owner = '待核实'
      }
      row.progress = receipt.closed ? '已核实平台退款和关闭回执' : '已核实平台退款'
      row.nextStep = '查看退款记录'
      detail = row.inquiry!.refundStatus
    }
  } else if (row.payment) {
    row.payment.response = actionLabels[action]
    row.payment.responseCode = action === 'ACCEPT' ? 'SELLER_ACCEPT' : action === 'ACCEPT_RETURN' ? 'SELLER_ACCEPT_WITH_RETURN' : 'SELLER_CONTEST'
    row.payment.availableChoices = []
    row.payment.responseNote = action === 'CONTEST' ? draft.evidenceNote?.trim() : undefined
    row.payment.returnAddress = draft.returnAddress?.trim() || ''
    if (row.payment.details) row.payment.details.returnAddress = draft.paymentReturnAddress
    // 此处模拟已读到的卖家回应；资金、退款、退回轨迹和结案均须另有对应事实。
    row.status = 'OPEN'
    if (action === 'CONTEST') {
      row.statusText = '等待付款机构裁决'
      row.progress = '答复已获平台确认'
      row.owner = '付款机构'
      row.nextStep = '等待付款机构裁决'
    } else if (action === 'ACCEPT_RETURN') {
      row.statusText = '已接受并要求退回'
      row.progress = '平台已确认退回要求'
      row.owner = '买家'
      row.nextStep = '跟进买家退回包裹及平台退款结果'
    } else {
      row.statusText = '已接受争议'
      row.progress = '平台已确认接受，待回查结案'
      row.owner = 'eBay'
      row.nextStep = '核查争议结案与退款记录'
    }
    detail = [actionLabels[action], draft.evidenceNote?.trim()].filter(Boolean).join(' · ')
  }
  logRecheck(row, at, action === 'REFUND' ? '退款已确认' : '已受理', row.progress)
  row.pending = null
  row.actions = []
  if (row.inquiry) {
    row.inquiry.primaryAction = undefined
    row.inquiry.secondaryActions = []
  }
  row.date = null
  row.revision++
  logEvent(row, at, '平台回查', row.progress, detail)
  return row.progress
}

export function recheckRefundEligibility(row: DisputeRecord, at = new Date().toISOString()): string {
  if (findRecord(row.shopId, row.kind, row.id) !== row || row.pending || row.kind !== 'INR_REQUEST' ||
      row.status !== 'OPEN' || row.owner === '已结束' || row.inquiry?.refundOutcome !== 'FAILED' || !row.inquiry.refundFailure?.retryable) {
    return '当前不能重新核验退款条件，请核查原办理结果。'
  }
  const receipt = refundEligibilityReceipt(row)
  if (!receipt?.allowed) return '尚未取得新的退款资格，请核查失败原因及平台指引。'
  const actor = currentHandlerName.value
  row.inquiry.refundEstimate = { ...receipt.estimate }
  row.inquiry.refundEstimateBreakdown = receipt.breakdown
  row.inquiry.refundFailure = undefined
  row.inquiry.refundOutcome = undefined
  row.inquiry.refundBlockReason = undefined
  row.inquiry.refundStatus = '可重新申请，尚未退款'
  row.progress = '已重新核验退款条件'
  row.nextStep = '核对最新估算后申请退款'
  row.owner = '卖家'
  if (!row.actions.includes('REFUND')) row.actions.push('REFUND')
  row.inquiry.primaryAction = 'REFUND'
  row.revision++
  ;(row.operationLogs ??= []).push(createCustomerServiceLog(actor, '重新核验退款条件', '已取得本请求新的退款资格及估算，尚未再次退款', '成功', at))
  return row.progress
}
