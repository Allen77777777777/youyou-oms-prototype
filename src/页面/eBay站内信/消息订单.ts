import type { Conversation, MailMessage, RelatedOrder } from './类型'

export interface MessageOrderContext {
  state: 'confirmed' | 'pending' | 'none'
  orders: RelatedOrder[]
}

/** 只消费当前消息的明确证据，重复、缺失或冲突的来源整体待确认。 */
export function getMessageOrderContext(conversation: Conversation, message: MailMessage | undefined, orders: RelatedOrder[]): MessageOrderContext {
  const pending: MessageOrderContext = { state: 'pending', orders: [] }
  if (conversation.source !== 'buyer') return { state: 'none', orders: [] }
  if (!message || message.kind === 'note' || conversation.messages.filter(item => item.id === message.id).length !== 1) return pending
  const association = message.orderAssociation
  if (association?.state === 'none') return { state: 'none', orders: [] }
  if (association?.state === 'pending') return pending
  if (association?.state === 'confirmed') {
    const ids = new Set(association.orderIds)
    if (!ids.size || ids.size !== association.orderIds.length) return pending
    const matched = orders.filter(order => ids.has(order.id))
    if (matched.length !== ids.size || new Set(matched.map(order => order.id)).size !== ids.size
      || matched.some(order => order.shopId !== conversation.shopId || order.buyerId !== conversation.buyerId)) return pending
    return { state: 'confirmed', orders: matched }
  }
  const origin = message.originApplication
  if (origin?.shopId === conversation.shopId && origin.orderNo?.trim()) {
    const matched = orders.filter(order => order.shopId === conversation.shopId && order.buyerId === conversation.buyerId && order.orderNo === origin.orderNo)
    if (matched.length === 1) return { state: 'confirmed', orders: matched }
  }
  return pending
}

export function getMessageOrders(conversation: Conversation, message: MailMessage | undefined, orders: RelatedOrder[]): RelatedOrder[] {
  return getMessageOrderContext(conversation, message, orders).orders
}

export function getLastBusinessMessage(conversation: Conversation): MailMessage | undefined {
  return [...conversation.messages].reverse().find(message => message.kind === 'incoming' || (message.kind === 'outgoing' && message.delivery === 'success'))
}
