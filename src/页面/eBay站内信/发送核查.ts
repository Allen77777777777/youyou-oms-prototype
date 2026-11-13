import { reactive } from 'vue'
import { currentHandlerId, currentHandlerName, handlerOptions } from '@/组件/客服处理人/处理人'
import { mailSession } from './会话'
import { recordMailOperation } from './操作日志'
import { canOperateMail, canViewMail, getMailReviewers } from './权限与协作'
import type { Conversation, MailMessage } from './类型'

export type MailEvidenceKind = 'success' | 'not_accepted' | 'unresolved'
export interface MailVerificationEvidence {
  id: string
  kind: MailEvidenceKind
  description: string
  platformMessageId?: string
  shopId?: string
  buyerId?: string
  attemptMessageId?: string
  attemptId?: string
}
export interface MailAttemptHistory {
  attemptId: string
  operator: string
  submittedAt: string
  conclusion?: 'success' | 'not_accepted'
  concludedAt?: string
  concludedBy?: string
  evidenceHistory: MailVerificationEvidence[]
}
export interface MailVerificationRecord {
  attemptId: string
  messageId: string
  shopId: string
  buyerId: string
  conversationId: string
  operator: string
  operatorId: string
  submittedAt: string
  provisional: boolean
  incomingMessageIds: string[]
  hasReplyCoverage: boolean
  statusRevision: number
  originApplication?: MailMessage['originApplication']
  lastCheckedAt?: string
  evidence?: MailVerificationEvidence
  evidenceHistory: MailVerificationEvidence[]
  history: MailAttemptHistory[]
  conclusion?: 'success' | 'not_accepted'
  concludedAt?: string
  concludedBy?: string
  reviewerId?: string
  reviewerName?: string
  handedAt?: string
  acceptedAt?: string
  firstReviewedAt?: string
  reviewDueAt?: string
  conflict: boolean
}
export interface MailAttemptOptions {
  provisional?: boolean
  operator?: string
  operatorId?: string
  statusRevision?: number
  incomingMessageIds?: string[]
  submittedAt?: string
}
interface MailVerificationResult { ok: boolean; message: string }
interface MailSendTarget {
  conversation?: Conversation
  shopId: string
  buyerId: string
  originApplication?: MailMessage['originApplication']
}
export interface MailVerificationTarget {
  conversation: Conversation
  message: MailMessage
}

let records = new WeakMap<MailMessage, MailVerificationRecord>()
const evidenceOverrides = new Map<string, MailVerificationEvidence>()

/** 全部为固定虚构回查凭证。生产须由原尝试回执或可信平台消息取得证据。 */
const demoEvidence: Record<string, MailVerificationEvidence> = {
  'msg-08-2': { id: 'CHECK-DEMO-08', kind: 'success', description: '平台已收件，外发记录与原发送尝试一致。', platformMessageId: 'EBAY-DEMO-MSG-08', attemptMessageId: 'msg-08-2' },
  'msg-check-rejected': { id: 'CHECK-DEMO-REJECTED', kind: 'not_accepted', description: '原请求被明确拒绝，未建立平台外发消息。', attemptMessageId: 'msg-check-rejected' },
}

export function resetMailVerification() {
  records = new WeakMap()
  evidenceOverrides.clear()
}

/** 供本地资料初始化与自动化验收设置证据，业务弹窗不提供手动选择结果的控件。 */
export function setMockVerificationEvidence(messageId: string, evidence: MailVerificationEvidence) {
  evidenceOverrides.set(messageId, { ...evidence })
}

export function registerMailAttempt(c: Conversation, message: MailMessage, options: MailAttemptOptions = {}) {
  const existing = records.get(message)
  if (existing) return existing
  const value = reactive<MailVerificationRecord>({
    attemptId: message.id,
    messageId: message.id,
    shopId: c.shopId,
    buyerId: c.buyerId,
    conversationId: c.id,
    operator: options.operator ?? message.sender,
    operatorId: options.operatorId ?? handlerOptions.find(person => person.label === message.sender)?.value ?? '',
    submittedAt: options.submittedAt ?? message.at,
    provisional: options.provisional ?? isMailConversationProvisional(c),
    incomingMessageIds: [...(options.incomingMessageIds ?? message.incomingMessageIds ?? [])],
    hasReplyCoverage: Boolean(options.incomingMessageIds || message.incomingMessageIds),
    statusRevision: options.statusRevision ?? c.statusRevision ?? 0,
    originApplication: message.originApplication ? { ...message.originApplication } : undefined,
    evidenceHistory: [],
    history: [],
    conflict: false,
  })
  records.set(message, value)
  return value
}

export function ensureMailVerification(c: Conversation, message: MailMessage) {
  return registerMailAttempt(c, message)
}

export function isMailConversationProvisional(c: Conversation): boolean {
  return c.messages.some(message => records.get(message)?.provisional)
}

/** 重试复用聚合消息行，但平台尝试始终使用新身份，旧凭证仅留在历史尝试中。 */
export function restartMailAttempt(c: Conversation, message: MailMessage, options: MailAttemptOptions = {}) {
  const previous = ensureMailVerification(c, message)
  if (message.delivery !== 'failed' || previous.conflict) return
  const history: MailAttemptHistory[] = [...previous.history, {
    attemptId: previous.attemptId,
    operator: previous.operator,
    submittedAt: previous.submittedAt,
    conclusion: previous.conclusion,
    concludedAt: previous.concludedAt,
    concludedBy: previous.concludedBy,
    evidenceHistory: previous.evidenceHistory.map(evidence => ({ ...evidence })),
  }]
  records.delete(message)
  const record = registerMailAttempt(c, message, {
    ...options,
    provisional: options.provisional ?? previous.provisional,
    incomingMessageIds: options.incomingMessageIds ?? previous.incomingMessageIds,
    statusRevision: options.statusRevision ?? previous.statusRevision,
    operator: options.operator ?? currentHandlerName.value,
    operatorId: options.operatorId ?? currentHandlerId.value,
  })
  record.attemptId = `${message.id}:attempt:${history.length + 1}`
  record.submittedAt = options.submittedAt ?? new Date().toISOString()
  record.history = history
  record.hasReplyCoverage = previous.hasReplyCoverage
  return record
}

export function hasMailVerification(message: MailMessage): boolean {
  const record = records.get(message)
  return message.kind === 'outgoing' && (message.delivery === 'unknown' || Boolean(record?.lastCheckedAt || record?.history.length || record?.evidenceHistory.length))
}

function sameBusiness(a: MailMessage['originApplication'], b: MailMessage['originApplication']) {
  return Boolean(a && b && a.kind === b.kind && a.shopId === b.shopId && a.applicationId === b.applicationId)
}

function blockingMailAttempts(target: MailSendTarget) {
  const matches: Array<MailVerificationTarget & { record?: MailVerificationRecord }> = []
  for (const c of mailSession.conversations) {
    for (const message of c.messages) {
      if (message.kind !== 'outgoing') continue
      const record = records.get(message)
      if ((record?.shopId ?? c.shopId) !== target.shopId) continue
      if (!record?.conflict && message.delivery !== 'sending' && message.delivery !== 'unknown') continue
      const sameConversation = (record?.conversationId ?? c.id) === target.conversation?.id
      const originalBusiness = sameBusiness(record?.originApplication ?? message.originApplication, target.originApplication)
      const recipientProtection = record?.provisional && record.buyerId === target.buyerId
      if (sameConversation || originalBusiness || recipientProtection) matches.push({ conversation: c, message, record })
    }
  }
  return matches
}

export function getMailBlockingReason(target: MailSendTarget): string | undefined {
  const first = blockingMailAttempts(target)[0]
  if (!first) return
  if (first.record?.conflict) return '存在相互冲突的发送证据，请先核查原发送记录'
  if (first.message.delivery === 'sending') return '该买家的会话正在发送，请稍后再试'
  return '存在发送结果待核查的消息，核查前不能重复发送'
}

export function canViewMailVerification({ conversation, message }: MailVerificationTarget): boolean {
  if (!canViewMail(conversation) || !hasMailVerification(message)) return false
  const threads = mailSession.conversations.filter(c => c.shopId === conversation.shopId && c.id === conversation.id)
  if (threads.length !== 1 || threads[0] !== conversation || !conversation.messages.includes(message)
    || conversation.messages.filter(m => m.id === message.id).length !== 1) return false
  const record = records.get(message)
  return !record || (record.shopId === conversation.shopId && record.buyerId === conversation.buyerId && record.conversationId === conversation.id)
}

/** 阻断资格与查看权限独立。来源页仅对可定位且授权查看的原尝试显示入口。 */
export function getVisibleBlockingMailVerifications(target: MailSendTarget): MailVerificationTarget[] {
  return blockingMailAttempts(target).filter(item => (item.message.delivery === 'unknown' || item.record?.conflict)
    && item.conversation.shopId === target.shopId && item.conversation.buyerId === target.buyerId && canViewMailVerification(item))
    .map(({ conversation, message }) => ({ conversation, message }))
}

export function getVisibleContactMailVerifications(target: string | {
  record: Pick<MailSendTarget, 'shopId' | 'buyerId'>
  conversation?: Conversation
  originApplication?: MailMessage['originApplication']
}): MailVerificationTarget[] {
  if (typeof target === 'string') return []
  return getVisibleBlockingMailVerifications({ ...target.record, conversation: target.conversation, originApplication: target.originApplication })
}

/** 本地核查工作日历示例为北京周一至五09:00–18:00。真实店铺排班须由中台提供。 */
export function addMailReviewWorkingHours(start: string, hours = 2): string {
  const minute = 60_000
  const offset = 8 * 60 * minute
  let cursor = Date.parse(start)
  if (!Number.isFinite(cursor)) return ''
  let remaining = hours * 60
  while (remaining > 0) {
    const local = new Date(cursor + offset)
    const day = local.getUTCDay()
    const hour = local.getUTCHours()
    if (day !== 0 && day !== 6 && hour >= 9 && hour < 18) remaining--
    cursor += minute
  }
  return new Date(cursor).toISOString()
}

function findAttempt(c: Conversation, message: MailMessage): MailVerificationResult | undefined {
  if (!canViewMail(c)) return { ok: false, message: '没有查看本会话的权限' }
  if (message.kind !== 'outgoing' || c.messages.filter(m => m.id === message.id).length !== 1 || !c.messages.includes(message)) {
    return { ok: false, message: '原发送记录不存在或身份重复，请先核实来源' }
  }
  const record = ensureMailVerification(c, message)
  if (record.shopId !== c.shopId || record.buyerId !== c.buyerId || record.conversationId !== c.id) {
    return { ok: false, message: '原发送身份发生变化，请先核实店铺、买家及会话' }
  }
}

function getEvidence(c: Conversation, message: MailMessage): MailVerificationEvidence {
  const record = ensureMailVerification(c, message)
  const evidence = evidenceOverrides.get(record.attemptId) ?? evidenceOverrides.get(message.id) ?? (!record.history.length ? demoEvidence[message.id] : undefined)
  if (!evidence) return { id: `CHECK-${message.id}`, kind: 'unresolved', description: '本次回查尚未取得可确认原尝试的结果。' }
  const sourceMatches = (!evidence.shopId || evidence.shopId === c.shopId)
    && (!evidence.buyerId || evidence.buyerId === c.buyerId)
    && evidence.attemptMessageId === message.id
    && (record.history.length ? evidence.attemptId === record.attemptId : !evidence.attemptId || evidence.attemptId === record.attemptId)
  if (!sourceMatches || (evidence.kind === 'success' && !evidence.platformMessageId?.trim())) {
    return { id: evidence.id, kind: 'unresolved', description: '回查结果与原发送身份不一致或缺少平台消息标识，请继续核实。' }
  }
  return { ...evidence, shopId: c.shopId, buyerId: c.buyerId }
}

function handOver(c: Conversation, message: MailMessage, record: MailVerificationRecord, at: string) {
  if (record.handedAt) return
  const reviewers = getMailReviewers(c.shopId)
  const reviewer = reviewers.find(person => person.value !== currentHandlerId.value) ?? reviewers[0]
  record.handedAt = at
  record.reviewerId = reviewer?.value
  record.reviewerName = reviewer?.label
  recordMailOperation(c, currentHandlerName.value, '交接发送核查', `消息记录：${message.id}；接收人：${reviewer?.label ?? '待主管指定核查人'}`, '待核查', at)
}

function retainEvidence(record: MailVerificationRecord, evidence: MailVerificationEvidence) {
  record.evidence = { ...evidence }
  if (!record.evidenceHistory.some(item => item.id === evidence.id && item.kind === evidence.kind)) record.evidenceHistory.push({ ...evidence })
}

export function queryMailVerification(c: Conversation, message: MailMessage): MailVerificationResult {
  const error = findAttempt(c, message)
  if (error) return error
  if (!canOperateMail(c, 'recall')) return { ok: false, message: '没有发起只读回查的权限' }
  const record = ensureMailVerification(c, message)
  const at = new Date().toISOString()
  record.lastCheckedAt = at
  const evidence = getEvidence(c, message)
  retainEvidence(record, evidence)
  if (canOperateMail(c, 'verify') && record.acceptedAt && !record.firstReviewedAt) record.firstReviewedAt = at
  recordMailOperation(c, currentHandlerName.value, '回查发送结果', `消息记录：${message.id}；证据：${evidence.id}`, evidence.kind === 'unresolved' ? '仍待核查' : '取得核查证据', at)
  if (record.conclusion && evidence.kind !== 'unresolved' && record.conclusion !== evidence.kind) {
    record.conflict = true
    recordMailOperation(c, currentHandlerName.value, '发送核查证据冲突', `消息记录：${message.id}；证据：${evidence.id}`, '待复核', at)
  }
  if (evidence.kind === 'unresolved') handOver(c, message, record, at)
  return { ok: true, message: evidence.description }
}

export function acceptMailVerification(c: Conversation, message: MailMessage): MailVerificationResult {
  const error = findAttempt(c, message)
  if (error) return error
  if (!canOperateMail(c, 'verify')) return { ok: false, message: '没有接手和确认核查结论的权限' }
  const record = ensureMailVerification(c, message)
  if (record.acceptedAt) return { ok: true, message: '已接手核查' }
  const at = new Date().toISOString()
  record.reviewerId = currentHandlerId.value
  record.reviewerName = currentHandlerName.value
  record.acceptedAt = at
  record.handedAt ??= at
  record.reviewDueAt = addMailReviewWorkingHours(at)
  recordMailOperation(c, currentHandlerName.value, '接手发送核查', `消息记录：${message.id}`, '待核查', at)
  return { ok: true, message: '已接手核查，请在客服工作时限内完成首次人工复核' }
}

function applySuccess(c: Conversation, message: MailMessage, record: MailVerificationRecord) {
  message.delivery = 'success'
  delete message.failureReason
  const hasNewIncoming = c.messages.some(m => m.kind === 'incoming' && !m.historical && !record.incomingMessageIds.includes(m.id))
  if (record.hasReplyCoverage && record.statusRevision === (c.statusRevision ?? 0) && !hasNewIncoming && c.status !== 'ignored') {
    if (message.markProcessedOnSuccess !== false && c.status !== 'processed') {
      c.status = 'processed'
      recordMailOperation(c, '系统', '发送成功后标注已处理', `消息记录：${message.id}；依照原发送选项更新`)
    }
    c.lastHandledBy = record.operator
    c.lastHandledAt = record.submittedAt
    c.lastHandledAction = '回复成功'
  }
}

function applyEvidence(c: Conversation, message: MailMessage, evidence: MailVerificationEvidence, operator: string): MailVerificationResult {
  const record = ensureMailVerification(c, message)
  if (evidence.kind === 'unresolved') return { ok: false, message: '证据不足，继续保留待核查' }
  if (record.conclusion && record.conclusion !== evidence.kind) {
    record.conflict = true
    recordMailOperation(c, operator, '发送核查证据冲突', `消息记录：${message.id}；证据：${evidence.id}`, '待复核')
    return { ok: false, message: '本次证据与已核实结论冲突，已暂停后续发送并保留证据' }
  }
  if (record.conclusion === evidence.kind) return { ok: true, message: '该核查结论已记录' }
  record.conclusion = evidence.kind
  record.concludedAt = new Date().toISOString()
  record.concludedBy = operator
  if (evidence.kind === 'success') applySuccess(c, message, record)
  else {
    message.delivery = 'failed'
    message.failureReason = '原请求已确认未受理，可核对内容并人工重试。'
  }
  recordMailOperation(c, operator, '确认发送核查结论', `消息记录：${message.id}；原发起人：${record.operator}；证据：${evidence.id}`, evidence.kind === 'success' ? '确认成功' : '确认未受理')
  return { ok: true, message: evidence.kind === 'success' ? '已将原发送记录补记成功' : '已确认未受理，可由有发送权限的客服核对后重试' }
}

export function confirmMailVerification(c: Conversation, message: MailMessage): MailVerificationResult {
  const error = findAttempt(c, message)
  if (error) return error
  if (!canOperateMail(c, 'verify')) return { ok: false, message: '没有确认发送核查结论的权限' }
  const record = ensureMailVerification(c, message)
  if (!record.evidence) return { ok: false, message: '请先回查取得证据' }
  if (record.evidence.kind === 'unresolved') return { ok: false, message: '证据不足，继续保留待核查' }
  record.firstReviewedAt ??= new Date().toISOString()
  return applyEvidence(c, message, record.evidence, currentHandlerName.value)
}

/** 原发送尝试的迟到回执以稳定尝试身份归并，调用者须先完成平台来源校验。 */
export function applyLateMailEvidence(c: Conversation, message: MailMessage, evidence: MailVerificationEvidence): MailVerificationResult {
  const record = ensureMailVerification(c, message)
  if (record.shopId !== c.shopId || record.buyerId !== c.buyerId || evidence.attemptMessageId !== message.id
    || (evidence.shopId && evidence.shopId !== c.shopId) || (evidence.buyerId && evidence.buyerId !== c.buyerId)
    || (evidence.kind === 'success' && !evidence.platformMessageId?.trim())) return { ok: false, message: '迟到回执身份不足或与原尝试不符' }
  if (evidence.attemptId && evidence.attemptId !== record.attemptId) {
    const previous = record.history.find(item => item.attemptId === evidence.attemptId)
    if (!previous) return { ok: false, message: '回执尝试身份不存在，请核实来源' }
    if (!previous.evidenceHistory.some(item => item.id === evidence.id && item.kind === evidence.kind)) previous.evidenceHistory.push({ ...evidence })
    if (evidence.kind === 'success' && previous.conclusion !== 'success') {
      record.conflict = true
      recordMailOperation(c, '系统', '历史发送尝试结果冲突', `消息记录：${message.id}；历史尝试：${previous.attemptId}；证据：${evidence.id}`, '待复核')
    }
    return { ok: false, message: '已保留历史尝试回执，请核对在途或后续发送记录' }
  }
  if (record.history.length && evidence.attemptId !== record.attemptId) return { ok: false, message: '重试回执缺少本次尝试身份' }
  retainEvidence(record, evidence)
  return applyEvidence(c, message, evidence, '系统')
}
