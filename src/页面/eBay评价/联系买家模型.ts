import { reviewSystemSkus } from './评价处理人'
import { reviewSession } from './会话'
import { mailSession } from '../eBay站内信/会话'
import type { Conversation, ReplyDraft } from '../eBay站内信/类型'
import type { ReviewRecord } from './类型'
import { getContactBlockedReason, getContactDraft, getContactEditorConversation, isContactSending, sendBuyerContact, type BuyerContactTarget } from '../eBay站内信/联系买家发送'
export { contactSession as reviewContactSession, resetContactSession as resetReviewContactSession, discardContactDraft as discardReviewContactDraft, type ContactResult } from '../eBay站内信/联系买家发送'
import { getAwaitingReviewOrders } from './未收到评价会话'
import { projectAwaitingReviewOrders } from './未收到评价模型'

/** 联系上下文不要求存在评价；订单跟踪联系不创建占位评价。 */
export type ReviewContactRecord = Pick<ReviewRecord, 'id' | 'shopId' | 'shopName' | 'buyerId' | 'orderLineItemId' | 'listingId' | 'orderId' | 'conversationId' | 'orderNo' | 'title' | 'sku' | 'platformSku' | 'createdAt'> & { scopeKey?: string; systemSkus?: string[] }
type ContactTarget = BuyerContactTarget<ReviewContactRecord>
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
    orderLineItemId: '', listingId: '', systemSkus: [...new Set(order.missingLines.map(line => line.sku).filter(Boolean))], createdAt: order.shippedAt,
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
    const linkedTarget = resolveReviewContact(linked.id)
    if (typeof linkedTarget === 'string') return linkedTarget
    if (linkedTarget.conversation) conversations.push(linkedTarget.conversation)
  }
  const distinct = [...new Set(conversations)]
  if (distinct.length > 1) return '关联会话不唯一，请先在站内信中核查'
  const conversation = distinct[0]
  if (conversation && (conversation.source !== 'buyer' || conversation.shopId !== order.shopId || conversation.buyerId !== order.buyerId)) return '会话与店铺、买家身份不一致，暂不能发送'
  return { record: review, newConversationId: localConversationId(review), key: scopeKey, identity, conversation }
}

export function resolveReviewContact(reviewId: string): ContactTarget | string {
  if (reviewId.startsWith('awaiting:')) return resolveAwaitingContact(reviewId)
  const reviews = reviewSession.reviews.filter(r => r.id === reviewId)
  if (reviews.length !== 1) return '评价不存在或标识重复，请刷新后核查'
  const r = reviews[0]!
  if (![r.shopId, r.buyerId, r.orderLineItemId, r.listingId].every(present)) return '店铺、买家或交易身份不完整，暂不能联系买家'
  const sameLine = reviewSession.reviews.filter(item => item.shopId === r.shopId && item.orderLineItemId === r.orderLineItemId)
  if (sameLine.length !== 1) return '交易行关联不唯一，请核查后联系买家'
  const target: ContactTarget = { record: { ...r, systemSkus: reviewSystemSkus(r) }, newConversationId: localConversationId(r), key: contactKey(r), identity: identityOf(r) }
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

export function getReviewContactIdentity(reviewId: string): string { const target = resolveReviewContact(reviewId); return typeof target === 'string' ? '' : target.identity }
export function getReviewContactRecord(reviewId: string): ReviewContactRecord | undefined { const target = resolveReviewContact(reviewId); return typeof target === 'string' ? undefined : target.record }
export function getReviewContactConversation(reviewId: string): Conversation | undefined { const target = resolveReviewContact(reviewId); return typeof target === 'string' ? undefined : target.conversation }
export function getReviewContactDraft(reviewId: string): ReplyDraft | undefined { return getContactDraft(resolveReviewContact(reviewId)) }
export function isReviewContactSending(reviewId: string): boolean { return isContactSending(resolveReviewContact(reviewId)) }
export function getReviewContactBlockedReason(reviewId: string, expectedIdentity?: string): string | undefined { return getContactBlockedReason(resolveReviewContact(reviewId), expectedIdentity) }
export function getReviewContactEditorConversation(reviewId: string): Conversation | undefined { return getContactEditorConversation(resolveReviewContact(reviewId)) }
export function sendReviewContact(reviewId: string, expectedIdentity: string, options?: Parameters<typeof sendBuyerContact>[2]) { return sendBuyerContact(resolveReviewContact(reviewId), expectedIdentity, options) }
