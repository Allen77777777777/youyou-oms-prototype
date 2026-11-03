import type { Conversation } from '../eBay站内信/类型'
import { getMessageBodyText } from '../eBay站内信/邮箱模型'
import { 转换eBay时间 } from '../eBay订单/时间工具'
import { 读取排序时刻 } from '@/组件/筛选/筛选工具'

export interface BuyerIncomingMail {
  key: string
  conversationId: string
  messageId: string
  subject: string
  at: string
  bodyText: string
  attachmentNames: string[]
}

/** 只读投影同店铺、同来源买家的全部来信，不要求关联当前取消订单。 */
export function getBuyerIncomingMail(conversations: Conversation[], shopId: string, buyerId: string): BuyerIncomingMail[] {
  if (!shopId.trim() || !buyerId.trim()) return []
  return conversations
    .filter(conversation => conversation.source === 'buyer' && conversation.shopId === shopId && conversation.buyerId === buyerId)
    .flatMap(conversation => conversation.messages
      .filter(message => message.kind === 'incoming' && !message.notice)
      .map(message => ({
        key: JSON.stringify([shopId, buyerId, conversation.id, message.id]),
        conversationId: conversation.id,
        messageId: message.id,
        subject: message.subject?.trim() || conversation.subject,
        at: message.at,
        bodyText: getMessageBodyText(message),
        attachmentNames: (message.attachments ?? []).map(attachment => attachment.name),
      })))
    .sort((a, b) => {
      const left = 读取排序时刻(a.at), right = 读取排序时刻(b.at)
      if (left === undefined && right !== undefined) return 1
      if (left !== undefined && right === undefined) return -1
      return (right ?? 0) - (left ?? 0) || a.key.localeCompare(b.key)
    })
}

/** 不猜来源墙钟或默认北京时间；缺失／无效站点时区保留来源值与核验提示。 */
export function formatBuyerMailTime(at: string, timeZone?: string): string {
  try { return 转换eBay时间(at, timeZone) }
  catch { return 转换eBay时间(at, undefined) }
}
