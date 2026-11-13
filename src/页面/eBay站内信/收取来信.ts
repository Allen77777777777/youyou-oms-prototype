import { applyIncomingRules, type IncomingFacts } from '../自动客服规则/来信规则执行'
import { snapshotConversationSkus } from './会话处理人'
import { 解析来源时刻 } from '../订单处理/时间展示工具'
import { recordMailOperation } from './操作日志'
import type { Conversation, MailMessage, WorkStatus } from './类型'

export interface IncomingReceipt {
  shopId: string
  shopName: string
  conversationId: string
  buyerId: string
  subject: string
  message: MailMessage
  facts: IncomingFacts
  /** 历史补采不重开待办或执行来信规则，新历史会话须有已核实的迁移状态。 */
  historical?: boolean
  historicalStatus?: WorkStatus
}

/** 输入为已经通过身份核验的新来信。按店铺、会话和消息做幂等，同名买家不合并。 */
export function receiveNewMail(conversations: Conversation[], receipt: IncomingReceipt) {
  const { shopId, shopName, buyerId, conversationId, subject, message, facts } = receipt
  const incomingAt = 解析来源时刻(message.at)
  if (!shopId || !conversationId || !buyerId || !message.id || message.kind !== 'incoming' || message.notice ||
      message.sender !== buyerId || !message.body.trim() || incomingAt === undefined) return
  const matches = conversations.filter(c => c.id === conversationId)
  if (matches.length > 1 || matches.some(c => c.shopId !== shopId || c.source !== 'buyer' || c.buyerId !== buyerId)) return
  let conversation = matches[0]
  if (conversation?.messages.some(m => m.id === message.id)) return
  const wasExisting = !!conversation
  const stale = conversation?.messages.some(m => m.kind === 'incoming' && (解析来源时刻(m.at) ?? -Infinity) > incomingAt)
  if (!conversation) {
    if (receipt.historical && !receipt.historicalStatus) return
    conversation = { id: conversationId, source: 'buyer', shopId, shopName, buyerId, subject, unread: true, flagged: false, assignee: '',
      status: receipt.historicalStatus ?? 'pending', updatedAt: message.at, canReply: true, association: 'none', relatedOrderIds: [], messages: [], sendScenario: 'success' }
    conversations.push(conversation)
  }
  const historical = receipt.historical || stale
  conversation.messages.push({ ...message, historical: Boolean(historical), unread: historical ? conversation.unread : true })
  if (historical) return conversation
  conversation.unread = true
  for (const m of conversation.messages) if (m.kind === 'incoming') m.unread = true
  if (incomingAt >= (解析来源时刻(conversation.updatedAt) ?? -Infinity)) conversation.updatedAt = message.at
  // 每封可信新增来信都更新版本，旧发送成功不能把本封新问题标成已处理。
  conversation.statusRevision = (conversation.statusRevision ?? 0) + 1
  if (conversation.status === 'ignored') return conversation
  if (conversation.status === 'processed') {
    conversation.status = 'pending'
    recordMailOperation(conversation, '系统', '新来信进入待处理', `消息记录：${message.id}`)
  }
  const skus = facts.lines?.flatMap(line => line.systemSku?.trim() ? [line.systemSku.trim()] : []) ?? []
  if (!wasExisting || skus.length) snapshotConversationSkus(conversation, skus)
  applyIncomingRules(conversation, message.id, facts)
  return conversation
}

/** 本地收信队列。本样例商品已按店铺、刊登和具体变体核实；无订单资料时不构造金额、拆单或履约模式。 */
export function collectNextMail(conversations: Conversation[]) {
  for (let index = 1; index <= 3; index++) {
    const id = 'incoming-product-enquiry', buyer = 'buyer_enquiry_uk_parts', messageId = `enquiry-received-${index}`
    if (conversations.some(c => c.shopId === 'shop-us' && c.id === id && c.messages.some(m => m.id === messageId))) continue
    return receiveNewMail(conversations, {
      shopId: 'shop-us', shopName: '演示店铺-US', buyerId: buyer, conversationId: id, subject: '两件商品的规格咨询',
      message: { id: messageId, kind: 'incoming', sender: buyer, body: [
        'Could you confirm the specifications of these two items?',
        'Do the two items use the same installation tools?',
        'Could you send the measurements for both items?',
      ][index - 1]!, at: new Date().toISOString() },
      facts: { lines: [
        { systemSku: 'DEMO-BP-01', platformSku: 'EBAY-DEMO-BP-01' },
        { systemSku: 'DEMO-DH-02', platformSku: 'EBAY-DEMO-DH-02' },
      ], site: JSON.stringify(['eBay', 'DEMO-EBAY-US']) },
    })
  }
}
