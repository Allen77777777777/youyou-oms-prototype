import { reactive } from 'vue'
import { reviewSession } from './会话'
import { mailSession } from '../eBay站内信/会话'
import { validateDraft } from '../eBay站内信/模型'
import { richHtmlToSendText } from '../消息模板管理/富文本'
import type { Conversation, MailMessage, ReplyDraft } from '../eBay站内信/类型'
import type { ReviewRecord } from './类型'
import { getAwaitingReviewOrders } from './未收到评价会话'
import { projectAwaitingReviewOrders } from './未收到评价模型'

/** 联系上下文不要求存在评价；订单跟踪联系不创建占位评价。 */
export type ReviewContactRecord = Pick<ReviewRecord, 'id' | 'shopId' | 'shopName' | 'buyerId' | 'orderLineItemId' | 'listingId' | 'orderId' | 'conversationId' | 'orderNo' | 'title' | 'sku' | 'platformSku' | 'owner' | 'createdAt'> & { scopeKey?: string }
interface ContactTarget { review: ReviewContactRecord; key: string; identity: string; conversation?: Conversation }
export interface ContactResult { ok: boolean; message: string; conversationId?: string; messageId?: string; delivery?: MailMessage['delivery'] }
/** 联系窗口的临时草稿独立于邮箱；关闭、切换对象与卸载时丢弃。 */
export const reviewContactSession = reactive({ drafts: {} as Record<string, ReplyDraft>, sending: {} as Record<string, boolean> })
let generation = 0, sequence = 0
export function resetReviewContactSession(): void { generation++; reviewContactSession.drafts = {}; reviewContactSession.sending = {} }
const present = (value: unknown): value is string => typeof value === 'string' && !!value.trim()
const contactKey = (r: ReviewContactRecord) => r.scopeKey ?? JSON.stringify([r.shopId, r.buyerId, r.orderLineItemId])
const identityOf = (r: ReviewRecord) => JSON.stringify([r.id, r.shopId, r.buyerId, r.orderLineItemId, r.listingId, r.orderId ?? '', r.conversationId ?? ''])
const localConversationId = (r: ReviewContactRecord) => `review-mail:${contactKey(r)}`

function resolveAwaitingContact(id: string): ContactTarget | string {
  const orderId = id.slice('awaiting:'.length)
  const matches = projectAwaitingReviewOrders(getAwaitingReviewOrders(), reviewSession.reviews, reviewSession.buyerFeedback).filter(order => order.id === orderId)
  if (matches.length !== 1) return '订单已收到买家评价或资料已变化，请重新查询'
  const order = matches[0]!
  if (order.status !== 'unreviewed') return order.blockedReason || '订单评价资料待核对，核实后才能联系买家'
  if (![order.id, order.shopId, order.buyerId, order.orderNo].every(present) || !order.missingLines.length) return '订单或买家身份不完整，请核查后联系'
  const scopeKey = JSON.stringify(['awaiting-order', order.shopId, order.buyerId, order.id])
  const review: ReviewContactRecord = {
    id, scopeKey, shopId: order.shopId, shopName: order.shopName, buyerId: order.buyerId, orderNo: order.orderNo,
    orderLineItemId: '', listingId: '', owner: '', createdAt: order.shippedAt,
    title: order.missingLines.map(line => line.title).join('、'),
    sku: order.missingLines.length === 1 ? order.missingLines[0]!.sku : '',
    platformSku: order.missingLines.length === 1 ? order.missingLines[0]!.platformSku : '',
  }
  const identity = JSON.stringify([id, order.shopId, order.buyerId, order.orderNo, order.omsOrderId ?? '', order.missingLines.map(line => [line.id, line.orderLineItemId, line.listingId])])
  const conversations = mailSession.conversations.filter(c => c.id === localConversationId(review))
  // 同一交易可能从已收到的自动评价或订单跟踪入口联系，必须复用相同执行结果。
  const lineIds = new Set(order.missingLines.map(line => line.orderLineItemId))
  const linkedReviews = reviewSession.reviews.filter(r => r.shopId === order.shopId && r.buyerId === order.buyerId && lineIds.has(r.orderLineItemId))
  for (const linked of linkedReviews) {
    const linkedTarget = resolveContact(linked.id)
    if (typeof linkedTarget === 'string') return linkedTarget
    if (linkedTarget.conversation) conversations.push(linkedTarget.conversation)
  }
  const distinct = [...new Set(conversations)]
  if (distinct.length > 1) return '关联会话不唯一，请先在站内信中核查'
  const conversation = distinct[0]
  if (conversation && (conversation.source !== 'buyer' || conversation.shopId !== order.shopId || conversation.buyerId !== order.buyerId)) return '会话与店铺、买家身份不一致，暂不能发送'
  return { review, key: scopeKey, identity, conversation }
}

function resolveContact(reviewId: string): ContactTarget | string {
  if (reviewId.startsWith('awaiting:')) return resolveAwaitingContact(reviewId)
  const reviews = reviewSession.reviews.filter(r => r.id === reviewId)
  if (reviews.length !== 1) return '评价不存在或标识重复，请刷新后核查'
  const r = reviews[0]!
  if (![r.shopId, r.buyerId, r.orderLineItemId, r.listingId].every(present)) return '店铺、买家或交易身份不完整，暂不能联系买家'
  const sameLine = reviewSession.reviews.filter(item => item.shopId === r.shopId && item.orderLineItemId === r.orderLineItemId)
  if (sameLine.length !== 1) return '交易行关联不唯一，请核查后联系买家'
  const target: ContactTarget = { review: r, key: contactKey(r), identity: identityOf(r) }
  let candidates: Conversation[] = []
  if (r.orderId) {
    const orders = mailSession.orders.filter(order => order.id === r.orderId)
    if (orders.length !== 1 || orders[0]!.shopId !== r.shopId || orders[0]!.buyerId !== r.buyerId) return '关联订单与店铺、买家不一致，请核查后联系'
  }
  if (r.conversationId) {
    candidates = mailSession.conversations.filter(c => c.id === r.conversationId)
    if (!r.orderId || candidates.length !== 1) return '关联会话缺失或不唯一，请核查后联系'
    const c = candidates[0]!
    if (c.association !== 'confirmed' || !c.relatedOrderIds.includes(r.orderId)) return '会话与评价交易未确认关联，暂不能发送'
  } else if (r.orderId) {
    candidates = mailSession.conversations.filter(c => c.association === 'confirmed' && c.relatedOrderIds.includes(r.orderId!))
    if (candidates.length > 1) return '关联会话不唯一，请核查后联系'
  }
  candidates.push(...mailSession.conversations.filter(c => c.id === localConversationId(r)))
  const relatedOrders = getAwaitingReviewOrders().filter(order => order.shopId === r.shopId && order.buyerId === r.buyerId && order.association === 'confirmed' && order.lines.some(line => line.association === 'confirmed' && line.orderLineItemId === r.orderLineItemId && line.listingId === r.listingId))
  for (const order of relatedOrders) {
    const key = JSON.stringify(['awaiting-order', order.shopId, order.buyerId, order.id])
    candidates.push(...mailSession.conversations.filter(c => c.id === `review-mail:${key}`))
  }
  candidates = [...new Set(candidates)]
  if (candidates.length > 1) return '关联会话标识重复，请核查后联系'
  const c = candidates[0]
  if (c && (c.source !== 'buyer' || c.shopId !== r.shopId || c.buyerId !== r.buyerId)) return '会话与店铺、买家身份不一致，暂不能发送'
  target.conversation = c
  return target
}

export function getReviewContactIdentity(reviewId: string): string { const target = resolveContact(reviewId); return typeof target === 'string' ? '' : target.identity }
export function getReviewContactRecord(reviewId: string): ReviewContactRecord | undefined { const target = resolveContact(reviewId); return typeof target === 'string' ? undefined : target.review }
export function getReviewContactConversation(reviewId: string): Conversation | undefined { const target = resolveContact(reviewId); return typeof target === 'string' ? undefined : target.conversation }
export function getReviewContactDraft(reviewId: string): ReplyDraft | undefined {
  const target = resolveContact(reviewId)
  if (typeof target === 'string') return undefined
  reviewContactSession.drafts[target.key] ??= { body: '', attachments: [] }
  return reviewContactSession.drafts[target.key]
}
function clearContactDraft(draft: ReplyDraft): void {
  draft.body = ''; draft.attachments = []
  delete draft.bodyHtml; delete draft.subject; delete draft.translation; delete draft.savedAt
}
/** 按打开时持有的草稿对象清除，评价身份变化也不会误清另一窗口。 */
export function discardReviewContactDraft(draft: ReplyDraft | undefined): void {
  if (!draft) return
  clearContactDraft(draft)
  for (const [key, stored] of Object.entries(reviewContactSession.drafts)) if (stored === draft) delete reviewContactSession.drafts[key]
}
export function isReviewContactSending(reviewId: string): boolean {
  const target = resolveContact(reviewId)
  return typeof target !== 'string' && Boolean(reviewContactSession.sending[target.key])
}
export function getReviewContactBlockedReason(reviewId: string, expectedIdentity?: string): string | undefined {
  const target = resolveContact(reviewId)
  if (typeof target === 'string') return target
  if (expectedIdentity !== undefined && target.identity !== expectedIdentity) return '收件人或交易资料已变化，请关闭后重新打开'
  const c = target.conversation
  if (reviewContactSession.sending[target.key] || c?.messages.some(m => m.delivery === 'sending')) return '该买家的会话正在发送，请稍后再试'
  if (c?.messages.some(m => m.delivery === 'unknown')) return '存在发送结果待核查的消息，核查前不能重复发送'
  if (c && !c.canReply) return '当前买家会话不支持发送站内信'
  if (c?.status === 'ignored') return '会话已忽略，请先在站内信中取消忽略'
  return undefined
}

function createContactConversation(target: ContactTarget, at: string): Conversation {
  const r = target.review
  return {
    id: localConversationId(r), source: 'buyer', shopId: r.shopId, shopName: r.shopName, buyerId: r.buyerId,
    subject: `关于订单 ${r.orderNo || r.orderLineItemId}`, unread: false, flagged: false, assignee: r.owner,
    status: 'pending', updatedAt: at, canReply: true, priority: 'normal', tags: [],
    association: r.orderId ? 'confirmed' : 'none', relatedOrderIds: r.orderId ? [r.orderId] : [],
    product: { title: r.title, sku: r.sku }, messages: [], sendScenario: 'success',
  }
}

/** 首次联系仅供编辑器读取上下文；打开窗口不创建会话或伪造来信。 */
export function getReviewContactEditorConversation(reviewId: string): Conversation | undefined {
  const target = resolveContact(reviewId)
  return typeof target === 'string' ? undefined : target.conversation ?? createContactConversation(target, target.review.createdAt)
}

/** 仅模拟发送；复用邮箱正文校验和执行状态，不写入评价事实或邮箱草稿。 */
export async function sendReviewContact(reviewId: string, expectedIdentity: string, options: { by?: string; outcome?: Conversation['sendScenario'] } = {}): Promise<ContactResult> {
  const error = getReviewContactBlockedReason(reviewId, expectedIdentity)
  if (error) return { ok: false, message: error }
  const target = resolveContact(reviewId)
  if (typeof target === 'string') return { ok: false, message: target }
  const draft = getReviewContactDraft(reviewId)!
  const validation = validateDraft(draft)
  if (validation) return { ok: false, message: validation.replace('回复内容', '站内信正文') }
  const snapshot: ReplyDraft = { body: draft.bodyHtml ? richHtmlToSendText(draft.bodyHtml) : draft.body, attachments: draft.attachments.map(attachment => ({ ...attachment })) }
  const finalValidation = validateDraft(snapshot)
  if (finalValidation) return { ok: false, message: finalValidation.replace('回复内容', '站内信正文') }
  if (/\{\{|\}\}/.test(snapshot.body)) return { ok: false, message: '正文仍含未填写的模板变量，请补齐后发送' }
  const draftSignature = JSON.stringify(draft), currentGeneration = generation, at = new Date().toISOString(), by = options.by ?? '客服01'
  const recipient = { shopId: target.review.shopId, buyerId: target.review.buyerId }
  let c = target.conversation
  if (!c) { mailSession.conversations.push(createContactConversation(target, at)); c = mailSession.conversations[mailSession.conversations.length - 1]! }
  reviewContactSession.sending[target.key] = true
  const messageId = `review-contact-${Date.now()}-${++sequence}`
  c.messages.push({ id: messageId, kind: 'outgoing', sendSource: 'manual', sender: by, body: snapshot.body, attachments: snapshot.attachments, at, delivery: 'sending', markProcessedOnSuccess: false })
  c.updatedAt = at
  const outcome = options.outcome ?? c.sendScenario
  await new Promise(resolve => setTimeout(resolve, 300))
  if (currentGeneration !== generation) return { ok: false, message: '会话已重置，请核查本次发送结果' }
  delete reviewContactSession.sending[target.key]
  const stored = mailSession.conversations.filter(item => item.id === c.id)
  if (stored.length !== 1 || stored[0] !== c) return { ok: false, message: '会话资料已变化，请核查本次发送结果' }
  const message = c.messages.find(item => item.id === messageId)
  if (!message || message.delivery !== 'sending') return { ok: false, message: '发送记录已变化，请核查本次发送结果' }
  if (c.source !== 'buyer' || c.shopId !== recipient.shopId || c.buyerId !== recipient.buyerId) {
    message.delivery = 'unknown'; message.failureReason = '发送期间会话身份发生变化，请核查本次发送结果。'
    return { ok: false, message: message.failureReason, conversationId: c.id, messageId, delivery: 'unknown' }
  }
  message.delivery = outcome
  message.failureReason = outcome === 'failed' ? '平台明确拒绝本次发送，请核对内容后重试。' : outcome === 'unknown' ? '发送结果待核查，核查前禁止重复发送。' : undefined
  if (outcome === 'success') {
    const savedDraft = reviewContactSession.drafts[target.key]
    if (savedDraft === draft && JSON.stringify(savedDraft) === draftSignature) clearContactDraft(savedDraft)
    c.lastHandledBy = by; c.lastHandledAt = new Date().toISOString(); c.lastHandledAction = '发送站内信成功'
  }
  return { ok: outcome === 'success', message: outcome === 'success' ? '站内信已发送' : message.failureReason!, conversationId: c.id, messageId, delivery: outcome }
}
