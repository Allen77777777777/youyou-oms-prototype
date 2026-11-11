import type { 原型标注 } from '@/类型/标注'
import { mailSession } from './会话'
import { getApplicationOutstandingReason, getContactBlockedReason, type BuyerContactResolution } from './联系买家发送'
import type { Conversation, MailBusinessSourceKind, MailMessage } from './类型'

const sourceLabels: Record<MailBusinessSourceKind, string> = {
  cancel: '取消订单申请', return: '退货退款申请', INR_REQUEST: 'Item not received', EBAY_CASE: 'Case', PAYMENT_DISPUTE: 'Payment dispute',
}
export const mailBusinessSourceLabel = (kind: MailBusinessSourceKind) => sourceLabels[kind]

export interface ApplicationMailContext {
  kind: MailBusinessSourceKind
  applicationId: string
  shopId: string
  shopName: string
  /** 来源页面已核验该店铺可用的站内信对方身份。核验失败须传 blockedReason。 */
  buyerId: string
  orderNo: string
  systemSkus?: string[]
  blockedReason?: string
}

function sameApplication(origin: MailMessage['originApplication'], ctx: ApplicationMailContext): boolean {
  return !!origin && origin.shopId === ctx.shopId && origin.kind === ctx.kind && origin.applicationId === ctx.applicationId
}

function applicationMailOrders(ctx: ApplicationMailContext) {
  return ctx.orderNo.trim() ? mailSession.orders.filter(o => o.shopId === ctx.shopId && o.orderNo === ctx.orderNo) : []
}

export const NEW_APPLICATION_MAIL = '__application_new_conversation__'

export function getApplicationMailConversations(ctx: ApplicationMailContext): Conversation[] {
  if (!ctx.buyerId.trim() || ctx.blockedReason) return []
  return mailSession.conversations.filter(c => c.source === 'buyer' && c.shopId === ctx.shopId && c.buyerId === ctx.buyerId)
}

export function applicationThreadIsRelated(ctx: ApplicationMailContext, conversation: Conversation): boolean {
  const orders = applicationMailOrders(ctx)
  const order = orders.length === 1 && orders[0]!.buyerId === ctx.buyerId ? orders[0] : undefined
  if (order && conversation.association === 'confirmed' && conversation.relatedOrderIds.includes(order.id)) return true
  return conversation.messages.some(m => m.kind === 'outgoing' && (sameApplication(m.originApplication, ctx) ||
    (!!ctx.orderNo && m.originApplication?.shopId === ctx.shopId && m.originApplication.orderNo === ctx.orderNo)))
}

export function needsApplicationThreadChoice(ctx: ApplicationMailContext, candidates = getApplicationMailConversations(ctx)): boolean {
  if (candidates.length !== 1) return candidates.length > 1
  return !applicationThreadIsRelated(ctx, candidates[0]!)
}

function applicationContactKey(ctx: ApplicationMailContext): string {
  return JSON.stringify([ctx.kind, ctx.shopId, ctx.applicationId, ctx.buyerId, ctx.orderNo])
}

export function hasApplicationMailThread(ctx: ApplicationMailContext): boolean {
  const id = `application-mail:${applicationContactKey(ctx)}`
  return getApplicationMailConversations(ctx).some(c => c.id === id)
}

function validateApplication(ctx: ApplicationMailContext): string | undefined {
  if (ctx.blockedReason) return ctx.blockedReason
  if (![ctx.shopId, ctx.buyerId, ctx.applicationId].every(id => id.trim())) return '申请、店铺或买家身份不完整，请核实后联系'
  const orders = applicationMailOrders(ctx)
  if (orders.length > 1 || (orders.length === 1 && orders[0]!.buyerId !== ctx.buyerId)) return '关联订单与收件买家不一致或不唯一，请核实后联系'
}

export function resolveApplicationMailContact(ctx: ApplicationMailContext, selectedConversationId = ''): BuyerContactResolution {
  const blocked = validateApplication(ctx)
  if (blocked) return blocked
  const candidates = getApplicationMailConversations(ctx)
  if (!selectedConversationId && needsApplicationThreadChoice(ctx, candidates)) {
    return getApplicationOutstandingReason(ctx) || '请选择要使用的站内信会话，或发起新会话'
  }
  const key = applicationContactKey(ctx)
  const newConversationId = `application-mail:${key}`
  let conversation: Conversation | undefined
  if (selectedConversationId === NEW_APPLICATION_MAIL) conversation = candidates.find(c => c.id === newConversationId)
  else if (selectedConversationId) conversation = candidates.find(c => c.id === selectedConversationId)
  else conversation = candidates[0]
  if ((selectedConversationId && selectedConversationId !== NEW_APPLICATION_MAIL && !conversation) ||
    (conversation && mailSession.conversations.filter(c => c.id === conversation.id).length !== 1)) {
    return '所选会话的关联已变化或不唯一，请重新核实'
  }
  if (!conversation && mailSession.conversations.some(c => c.id === newConversationId)) return '已有会话身份不一致，请先核实'
  const order = applicationMailOrders(ctx)[0]
  return {
    key, newConversationId, identity: JSON.stringify([key, conversation?.id ?? newConversationId, order?.id]), conversation,
    record: { shopId: ctx.shopId, shopName: ctx.shopName, buyerId: ctx.buyerId, orderNo: ctx.orderNo, orderId: order?.id,
      title: order?.platformProduct?.title, sku: order?.product.sku, platformSku: order?.platformProduct?.sku, systemSkus: ctx.systemSkus },
    originApplication: { kind: ctx.kind, applicationId: ctx.applicationId, shopId: ctx.shopId, orderNo: ctx.orderNo },
    revalidate: () => resolveApplicationMailContact(ctx, selectedConversationId),
  }
}

/** 需选择会话时仍允许打开弹窗，具体目标须由客服确认。 */
export function getApplicationMailBlockedReason(ctx: ApplicationMailContext): string | undefined {
  const reason = validateApplication(ctx) || getApplicationOutstandingReason(ctx)
  if (reason) return reason
  const candidates = getApplicationMailConversations(ctx)
  if (needsApplicationThreadChoice(ctx, candidates)) return undefined
  return getContactBlockedReason(resolveApplicationMailContact(ctx))
}

export function applicationContactAnnotation(kind: ApplicationMailContext['kind'], section: 'compose' | 'editor' | 'send'): 原型标注 {
  const group = kind === 'cancel' ? 'cancellations' : kind === 'return' ? 'returns' : 'disputes'
  const anchor = `oms.ebay-${group}.buyer-contact.${section}`
  const route = { cancellations: '/oms/ebay-service/cancellations', returns: '/oms/ebay-service/returns/:shopId/:returnId', disputes: '/oms/ebay-service/disputes/:shopId/:kind/:recordId' }[group]
  return { id: anchor, 锚点: anchor, 分类: '交互', 路由: route, 版本: '2026-11-05', 标题: { compose: '联系买家', editor: '站内信编辑器', send: '发送站内信' }[section],
    说明: '使用当前店铺的已核验买家身份发送站内信，外发进入共享发件箱，来源业务单据独立办理。原型只模拟发送。',
    交互规则: ['同店同买家存在多个会话、或唯一会话与申请关联不明时，手选目标或发起新会话，首次联系可直接起草。关闭丢弃未提交内容；收件身份变化需重新打开，结果待核查时禁止重复发送。'],
    prd引用: ['PRD/eBay站内信功能PRD.md', { cancellations: 'PRD/eBay取消订单申请功能PRD.md', returns: 'PRD/eBay退换货申请功能PRD.md', disputes: 'PRD/eBay纠纷功能PRD.md' }[group]],
    事实等级: '合理假设', 状态: '待评审' }
}
