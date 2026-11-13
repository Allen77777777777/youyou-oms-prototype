import { reactive } from 'vue'
import { mailSession } from './会话'
import { validateDraft } from './模型'
import { richHtmlToSendText } from '../消息模板管理/富文本'
import { recordMailOperation } from './操作日志'
import { snapshotConversationSkus } from './会话处理人'
import { currentHandlerId, currentHandlerName } from '@/组件/客服处理人/处理人'
import { canOperateMail } from './权限与协作'
import { getMailBlockingReason, isMailConversationProvisional, registerMailAttempt } from './发送核查'
import type { Conversation, MailMessage, ReplyDraft } from './类型'

export interface BuyerContactRecord {
  systemSkus?: string[]
  shopId: string; shopName: string; buyerId: string; orderNo: string
  orderId?: string; orderLineItemId?: string; title?: string; sku?: string; platformSku?: string; owner?: string; createdAt?: string
}
export interface BuyerContactTarget<T extends BuyerContactRecord = BuyerContactRecord> {
  record: T; key: string; identity: string; newConversationId: string; conversation?: Conversation
  originApplication?: MailMessage['originApplication']
  revalidate?: () => BuyerContactResolution
}
export type BuyerContactResolution = BuyerContactTarget | string
export interface ContactResult { ok: boolean; message: string; conversationId?: string; messageId?: string; delivery?: MailMessage['delivery'] }
export const contactSession = reactive({ drafts: {} as Record<string, ReplyDraft>, sending: {} as Record<string, boolean> })
let generation = 0, sequence = 0
function personalContactKey(target: BuyerContactTarget, userId = currentHandlerId.value) { return JSON.stringify([target.key, userId]) }
export function resetContactSession(): void { generation++; contactSession.drafts = {}; contactSession.sending = {} }
export function getContactDraft(target: BuyerContactResolution): ReplyDraft | undefined {
  if (typeof target === 'string') return undefined
  const key = personalContactKey(target)
  contactSession.drafts[key] ??= { body: '', attachments: [] }
  return contactSession.drafts[key]
}
function clearContactDraft(draft: ReplyDraft): void {
  draft.body = ''; draft.attachments = []
  delete draft.bodyHtml; delete draft.subject; delete draft.translation; delete draft.savedAt
}
/** 按打开时持有的草稿对象清除，来源身份变化也不会误清另一窗口。 */
export function discardContactDraft(draft: ReplyDraft | undefined): void {
  if (!draft) return
  clearContactDraft(draft)
  for (const [key, stored] of Object.entries(contactSession.drafts)) if (stored === draft) delete contactSession.drafts[key]
}
export function isContactSending(target: BuyerContactResolution): boolean {
  return typeof target !== 'string' && Boolean(contactSession.sending[personalContactKey(target)])
}
export function getApplicationOutstandingReason(origin: NonNullable<MailMessage['originApplication']>): string | undefined {
  const attempts = mailSession.conversations.flatMap(thread => thread.messages).filter(m =>
    m.kind === 'outgoing' && m.originApplication?.kind === origin.kind &&
    m.originApplication.shopId === origin.shopId && m.originApplication.applicationId === origin.applicationId)
  if (attempts.some(m => m.delivery === 'unknown')) return '本次申请有站内信发送结果待核查，请先到站内信核查'
  if (attempts.some(m => m.delivery === 'sending')) return '本次申请的站内信正在发送，请稍后再试'
}

export function getContactBlockedReason(target: BuyerContactResolution, expectedIdentity?: string): string | undefined {
  if (typeof target === 'string') return target
  if (expectedIdentity !== undefined && target.identity !== expectedIdentity) return '收件人或交易资料已变化，请关闭后重新打开'
  const c = target.conversation
  const permissionTarget = c ?? createContactConversation(target, '')
  if (!canOperateMail(permissionTarget, 'send')) return '没有向本店该会话发送站内信的权限'
  const outstanding = target.originApplication && getApplicationOutstandingReason(target.originApplication)
  if (outstanding) return outstanding
  const sharedBlock = getMailBlockingReason({ conversation: c, shopId: target.record.shopId, buyerId: target.record.buyerId, originApplication: target.originApplication })
  if (sharedBlock) return sharedBlock
  if (contactSession.sending[personalContactKey(target)] || c?.messages.some(m => m.delivery === 'sending')) return '该买家的会话正在发送，请稍后再试'
  if (c?.messages.some(m => m.delivery === 'unknown')) return '存在发送结果待核查的消息，核查前不能重复发送'
  if (c && !c.canReply) return '当前买家会话不支持发送站内信'
  if (c?.status === 'ignored') return '会话已忽略，请先在站内信中取消忽略'
  return undefined
}

function createContactConversation(target: BuyerContactTarget, at: string): Conversation {
  const r = target.record
  return {
    id: target.newConversationId, source: 'buyer', shopId: r.shopId, shopName: r.shopName, buyerId: r.buyerId,
    subject: r.orderNo || r.orderLineItemId ? `关于订单 ${r.orderNo || r.orderLineItemId}` : '联系买家', unread: false, flagged: false, assignee: '',
    status: 'pending', updatedAt: at, canReply: true, priority: 'normal', tags: [],
    association: r.orderId ? 'confirmed' : 'none', relatedOrderIds: r.orderId ? [r.orderId] : [],
    product: r.title ? { title: r.title, sku: r.sku ?? '' } : undefined, messages: [], sendScenario: 'success',
  }
}

/** 首次联系仅供编辑器读取上下文；打开窗口不创建会话或伪造来信。 */
export function getContactEditorConversation(target: BuyerContactResolution): Conversation | undefined {
  return typeof target === 'string' ? undefined : target.conversation ?? createContactConversation(target, target.record.createdAt ?? '')
}

/** 仅模拟发送；复用邮箱正文校验和执行状态，不写入来源业务资料或邮箱草稿。 */
export async function sendBuyerContact(target: BuyerContactResolution, expectedIdentity: string, options: { by?: string; outcome?: Conversation['sendScenario'] } = {}): Promise<ContactResult> {
  if (typeof target !== 'string' && target.revalidate) target = target.revalidate()
  const error = getContactBlockedReason(target, expectedIdentity)
  if (error) return { ok: false, message: error }
  if (typeof target === 'string') return { ok: false, message: target }
  const draft = getContactDraft(target)!
  const validation = validateDraft(draft)
  if (validation) return { ok: false, message: validation.replace('回复内容', '站内信正文') }
  const snapshot: ReplyDraft = { body: draft.bodyHtml ? richHtmlToSendText(draft.bodyHtml) : draft.body, attachments: draft.attachments.map(attachment => ({ ...attachment })) }
  const finalValidation = validateDraft(snapshot)
  if (finalValidation) return { ok: false, message: finalValidation.replace('回复内容', '站内信正文') }
  if (/\{\{|\}\}/.test(snapshot.body)) return { ok: false, message: '正文仍含未填写的模板变量，请补齐后发送' }
  const draftSignature = JSON.stringify(draft), currentGeneration = generation, at = new Date().toISOString(), by = options.by ?? currentHandlerName.value
  const operatorId = currentHandlerId.value, contactKey = personalContactKey(target, operatorId)
  const recipient = { shopId: target.record.shopId, buyerId: target.record.buyerId }
  let c = target.conversation
  if (!c) {
    const fresh = createContactConversation(target, at)
    snapshotConversationSkus(fresh, target.record.systemSkus ?? [])
    mailSession.conversations.push(fresh)
    c = mailSession.conversations[mailSession.conversations.length - 1]!
  }
  contactSession.sending[contactKey] = true
  const messageId = `${target.originApplication ? 'application' : 'review'}-contact-${Date.now()}-${++sequence}`
  c.messages.push({ id: messageId, kind: 'outgoing', sendSource: 'manual', ...(target.originApplication ? { originApplication: { ...target.originApplication } } : {}), sender: by, body: snapshot.body, attachments: snapshot.attachments, at, delivery: 'sending', markProcessedOnSuccess: false,
    orderAssociation: target.record.orderId ? { state: 'confirmed', orderIds: [target.record.orderId], source: '来源业务单据' } : { state: 'pending', orderIds: [] },
    incomingMessageIds: c.messages.filter(message => message.kind === 'incoming').map(message => message.id),
  })
  registerMailAttempt(c, c.messages[c.messages.length - 1]!, { provisional: !target.conversation || isMailConversationProvisional(c), operator: by, operatorId })
  recordMailOperation(c, by, '发送站内信', `消息记录：${messageId}${target.originApplication ? `；来源申请：${target.originApplication.applicationId}` : ''}`, '发送中', at)
  c.updatedAt = at
  const outcome = options.outcome ?? c.sendScenario
  await new Promise(resolve => setTimeout(resolve, 300))
  if (currentGeneration !== generation) return { ok: false, message: '会话已重置，请核查本次发送结果' }
  delete contactSession.sending[contactKey]
  const stored = mailSession.conversations.filter(item => item.id === c.id)
  if (stored.length !== 1 || stored[0] !== c) return { ok: false, message: '会话资料已变化，请核查本次发送结果' }
  const message = c.messages.find(item => item.id === messageId)
  if (!message || message.delivery !== 'sending') return { ok: false, message: '发送记录已变化，请核查本次发送结果' }
  if (c.source !== 'buyer' || c.shopId !== recipient.shopId || c.buyerId !== recipient.buyerId) {
    message.delivery = 'unknown'; message.failureReason = '发送期间会话身份发生变化，请核查本次发送结果。'
    recordMailOperation(c, by, '站内信发送结果', `消息记录：${messageId}`, '结果待核查')
    return { ok: false, message: message.failureReason, conversationId: c.id, messageId, delivery: 'unknown' }
  }
  message.delivery = outcome
  recordMailOperation(c, by, '站内信发送结果', `消息记录：${messageId}`, outcome === 'success' ? '发送成功' : outcome === 'unknown' ? '结果待核查' : '发送失败')
  message.failureReason = outcome === 'failed' ? '平台明确拒绝本次发送，请核对内容后重试。' : outcome === 'unknown' ? '发送结果待核查，核查前禁止重复发送。' : undefined
  if (outcome === 'success') {
    const savedDraft = contactSession.drafts[contactKey]
    if (savedDraft === draft && JSON.stringify(savedDraft) === draftSignature) clearContactDraft(savedDraft)
    c.lastHandledBy = by; c.lastHandledAt = new Date().toISOString(); c.lastHandledAction = '发送站内信成功'
  }
  return { ok: outcome === 'success', message: outcome === 'success' ? '站内信已发送' : message.failureReason!, conversationId: c.id, messageId, delivery: outcome }
}
