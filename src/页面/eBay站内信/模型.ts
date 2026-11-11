import { 命中多选, 命中字段搜索, 校验字段搜索, 读取排序时刻 } from '@/组件/筛选/筛选工具'
import { createRelatedOrders } from './数据'
import { getMessageBodyText, validateAttachmentUrl } from './邮箱模型'
import { richHtmlToText, sanitizeRichHtml } from '../消息模板管理/富文本'
import type { ContextDataset, Conversation, MailFilters, MessageSource, RelatedOrder, ReplyDraft } from './类型'
import { getConversationHandlerIds } from './会话处理人'
import { handlerIdFromLegacy, matchesHandlerFilter } from '@/组件/客服处理人/处理人'

export function getRelatedOrders(conversation: Conversation, orders: RelatedOrder[]): RelatedOrder[] {
  if (conversation.association !== 'confirmed' || !conversation.buyerId) return []
  const ids = new Set(conversation.relatedOrderIds)
  return orders.filter(order => ids.has(order.id) && order.shopId === conversation.shopId && order.buyerId === conversation.buyerId)
}

export function getBuyerHistory(conversation: Conversation, orders: RelatedOrder[]): RelatedOrder[] {
  if (conversation.source !== 'buyer' || !conversation.buyerId) return []
  // 待确认候选仍可在历史范围核对，但绝不作为当前订单事实。
  const currentIds = new Set(getRelatedOrders(conversation, orders).map(order => order.id))
  const scope = conversation.buyerDataScope
  // 生产接口必须在返回订单、计数及详情前校验组织/店铺/模块权限；前端过滤仅演示该数据契约。
  // 缺少可信身份键或授权店铺集合时兼容旧数据：只查看本店历史，不按同名买家跨店合并。
  return orders.filter(order => {
    if (currentIds.has(order.id) || (scope && !scope.shopIds.includes(order.shopId))) return false
    if (order.shopId === conversation.shopId) {
      return order.buyerId === conversation.buyerId && !(scope?.buyerKey && order.buyerKey && scope.buyerKey !== order.buyerKey)
    }
    return Boolean(scope?.buyerKey.trim() && scope.shopIds.includes(order.shopId) && order.buyerKey === scope.buyerKey)
  })
}

export function getContextCount(dataset: ContextDataset | undefined): number | null {
  return dataset?.state === 'ready' ? dataset.records.length : null
}

export function filterConversations(items: Conversation[], source: MessageSource, queue: string, filters: MailFilters, orders = createRelatedOrders()): Conversation[] {
  const kind = filters.field === 'subject' || filters.field === 'body' ? 'text' : 'identifier'
  if (校验字段搜索(filters.query, filters.mode, kind)) return []
  if (!['buyerId', 'subject', 'body', 'orderNo'].includes(filters.field)) return []
  const handlerIds = filters.assignees.map(id => handlerIdFromLegacy(id) || id)
  return items.filter(item => {
    if (item.source !== source || !命中多选(filters.shopIds, item.shopId) || !matchesHandlerFilter(getConversationHandlerIds(item), handlerIds)) return false
    if (filters.onlyUnread && !item.unread || filters.onlyFlagged && !item.flagged) return false
    if (source === 'buyer' && queue !== 'all' && item.status !== queue) return false
    if (source === 'ebay' && ((queue === 'unread' && !item.unread) || (queue === 'read' && item.unread))) return false
    if (source === 'ebay' && !['all', 'unread', 'read'].includes(queue)) return false
    const values = filters.field === 'buyerId' ? item.buyerId
      : filters.field === 'subject' ? [item.subject, ...item.messages.filter(message => message.kind !== 'note').map(message => message.subject?.trim() || item.subject)]
      : filters.field === 'body' ? item.messages.filter(message => message.kind !== 'note').map(getMessageBodyText)
      : getRelatedOrders(item, orders).map(order => order.orderNo)
    return 命中字段搜索(values, filters.query, filters.mode, kind)
  }).sort((a, b) => {
    const timeA = 读取排序时刻(a.updatedAt), timeB = 读取排序时刻(b.updatedAt)
    if (timeA === undefined && timeB !== undefined) return 1
    if (timeA !== undefined && timeB === undefined) return -1
    return (timeB ?? 0) - (timeA ?? 0) || a.id.localeCompare(b.id)
  })
}

export const MAX_REPLY_BODY_LENGTH = 2000
export const MAX_NOTE_BODY_LENGTH = 5000
export const MAX_REPLY_ATTACHMENTS = 5

export function validateDraft(draft: ReplyDraft, mode: 'reply' | 'note' = 'reply'): string | undefined {
  if (!draft.body.trim()) return '请输入回复内容'
  const limit = mode === 'note' ? MAX_NOTE_BODY_LENGTH : MAX_REPLY_BODY_LENGTH
  if (draft.body.length > limit) return `${mode === 'note' ? '内部备注' : '回复内容'}不能超过 ${limit} 个字符`
  if (draft.bodyHtml && richHtmlToText(sanitizeRichHtml(draft.bodyHtml)).trim() !== draft.body.trim()) return '正文格式与文本内容不一致，请重新核对正文'
  if (draft.attachments.length > MAX_REPLY_ATTACHMENTS) return `每次最多添加 ${MAX_REPLY_ATTACHMENTS} 个附件`
  for (const attachment of draft.attachments) {
    if (attachment.source === 'url') {
      const error = validateAttachmentUrl(attachment.url ?? '')
      if (error) return error
      if (!Number.isFinite(attachment.size) || attachment.size < 0 || attachment.size > 5 * 1024 * 1024) return '单个附件不能超过 5 MB，未获取的链接附件大小可为 0'
    } else if (!Number.isFinite(attachment.size) || attachment.size <= 0 || attachment.size > 5 * 1024 * 1024) return '单个附件必须大于 0 且不超过 5 MB'
    if (!['image/png', 'image/jpeg', 'application/pdf'].includes(attachment.type)) return '附件仅支持 PNG、JPG 或 PDF'
  }
  return undefined
}

export function getPreview(conversation: Conversation): string {
  const last = [...conversation.messages].reverse().find(message => message.kind !== 'note')
  return last ? getMessageBodyText(last) : conversation.subject
}

export function formatMailTime(at: string): string {
  const timestamp = 读取排序时刻(at)
  if (timestamp === undefined) return '—'
  const parts = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(timestamp)
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find(part => part.type === type)?.value ?? ''
  return `${value('month')}-${value('day')} ${value('hour')}:${value('minute')}`
}
