import { draftKey, getPersonalMailStar } from './会话'
import { 命中字段搜索 } from '@/组件/筛选/筛选工具'
import { richHtmlToText, sanitizeRichHtml } from '../消息模板管理/富文本'
import type { Conversation, MailFilters, MailMessage, MailPriority, ReplyDraft, RelatedOrder } from './类型'
import { getMessageOrders } from './消息订单'
import { canOperateMail, canViewMail } from './权限与协作'
export { mailTagDefinitions as mailTags, mailTagDefinitions as tagOptions, tagStyle } from './设置模型'

export const mailboxFolders = [
  { id: 'inbox', label: '收件箱' },
  { id: 'starred', label: '星标关注' },
  { id: 'drafts', label: '草稿箱' },
  { id: 'outbox', label: '发件箱' },
  { id: 'automated', label: '自动发送' },
  { id: 'failed', label: '发信失败' },
  { id: 'ebay', label: 'eBay消息' },
  { id: 'ignored', label: '已忽略' },
] as const

export const priorityOptions: Array<{ value: MailPriority; label: string }> = [
  { value: 'urgent', label: '紧急' }, { value: 'high', label: '高' },
  { value: 'normal', label: '普通' }, { value: 'low', label: '低' },
]
/** 新会话默认普通；本轮没有自动客服规则引擎。 */
export const defaultMailPriority: MailPriority = 'normal'

/** 买家按人工处理状态计待处理，平台通知按阅读状态；均不改变收发记录。 */
export function isPendingConversation(conversation: Conversation): boolean {
  if (conversation.status === 'ignored') return false
  if (conversation.source === 'ebay') return conversation.unread
  return conversation.status === 'pending'
}

export interface MailboxEntry {
  id: string
  conversation: Conversation
  message?: MailMessage
}

/** 搜索使用可见正文文本；有富文本时先清理标记与非显示内容。 */
export function getMessageBodyText(message: MailMessage): string {
  if (message.notice) return [message.notice.heading, ...message.notice.paragraphs, ...message.notice.sections.map(section => `${section.title}\n${section.content}`), message.notice.footer].join('\n\n')
  return message.bodyHtml ? richHtmlToText(sanitizeRichHtml(message.bodyHtml)) : message.body
}

/** 会话预筛选后再次匹配具体信件，避免同会话另一条标题或正文带入无关消息。 */
export function matchesEntryTextSearch(entry: MailboxEntry, filters: MailFilters, orders?: RelatedOrder[]): boolean {
  if (filters.field === 'orderNo' && orders) {
    const messages = entry.message ? [entry.message] : entry.conversation.messages.filter(message => message.kind !== 'note')
    const numbers = messages.flatMap(message => getMessageOrders(entry.conversation, message, orders).map(order => order.orderNo))
    return 命中字段搜索(numbers, filters.query, filters.mode, 'identifier')
  }
  if (filters.field !== 'subject' && filters.field !== 'body') return true
  const { conversation, message } = entry
  if (message?.kind === 'note') return false
  const values = message
    ? filters.field === 'subject' ? message.subject?.trim() || conversation.subject : getMessageBodyText(message)
    : filters.field === 'subject'
      ? [conversation.subject, ...conversation.messages.filter(item => item.kind !== 'note').map(item => item.subject?.trim() || conversation.subject)]
      : conversation.messages.filter(item => item.kind !== 'note').map(getMessageBodyText)
  return 命中字段搜索(values, filters.query, filters.mode, 'text')
}

function matchingMessages(conversation: Conversation, folderId: string): MailMessage[] {
  switch (folderId) {
    case 'inbox': return conversation.source === 'buyer' ? conversation.messages.filter(message => message.kind === 'incoming') : []
    case 'ebay': return conversation.source === 'ebay' ? conversation.messages.filter(message => message.kind === 'incoming') : []
    case 'outbox': return conversation.source === 'buyer' ? conversation.messages.filter(message => message.kind === 'outgoing') : []
    case 'automated': return conversation.source === 'buyer' ? conversation.messages.filter(message => message.kind === 'outgoing' && message.sendSource === 'automation') : []
    case 'failed': return conversation.source === 'buyer' ? conversation.messages.filter(message => message.kind === 'outgoing' && (message.delivery === 'failed' || message.delivery === 'unknown')) : []
    default: return []
  }
}

function matchesConversationFolder(conversation: Conversation, folderId: string, drafts: Record<string, ReplyDraft>): boolean {
  switch (folderId) {
    case 'starred': return getPersonalMailStar(conversation)
    case 'drafts': return (['reply', 'note'] as const).some(mode => {
      if (!canOperateMail(conversation, mode === 'note' ? 'note' : 'send')) return false
      const draft = drafts[draftKey(conversation.id, mode)]
      return Boolean(draft && (draft.body.trim() || draft.attachments.length))
    })
    case 'ignored': return conversation.status === 'ignored'
    default: return false
  }
}

/** 收发目录逐条引用原消息；关注、草稿和忽略保留会话聚合，不复制或搬移记录。 */
export function mailboxEntries(conversations: Conversation[], folderId: string, drafts: Record<string, ReplyDraft> = {}): MailboxEntry[] {
  return conversations.flatMap(conversation => {
    if (!canViewMail(conversation)) return []
    if (matchesConversationFolder(conversation, folderId, drafts)) return [{ id: JSON.stringify([conversation.id]), conversation }]
    return matchingMessages(conversation, folderId).map(message => ({ id: JSON.stringify([conversation.id, message.id]), conversation, message }))
  })
}

export function matchesFolder(conversation: Conversation, folderId: string, drafts: Record<string, ReplyDraft> = {}): boolean {
  return canViewMail(conversation) && (matchesConversationFolder(conversation, folderId, drafts) || matchingMessages(conversation, folderId).length > 0)
}

export function isEntryUnread(entry: MailboxEntry): boolean {
  return (!entry.message || entry.message.kind === 'incoming') && entry.conversation.unread
}

/** 会话是阅读状态的唯一业务粒度；来信字段仅兼容旧数据，始终镜像会话值。 */
export function setConversationUnread(conversation: Conversation, unread: boolean): boolean {
  const changed = conversation.unread !== unread
  conversation.unread = unread
  conversation.messages.forEach(message => { if (message.kind === 'incoming') message.unread = unread })
  return changed
}

/** 主动打开任意消息定位或会话条目，都更新其整会话；不代表买家已读回执。 */
export function setEntryUnread(entry: MailboxEntry, unread: boolean): void {
  setConversationUnread(entry.conversation, unread)
}

/** 批量先按店铺与会话去重，返回阅读状态实际变化的会话数。 */
export function setEntriesUnread(entries: MailboxEntry[], unread: boolean): number {
  const conversations = new Map(entries.map(entry => [JSON.stringify([entry.conversation.shopId, entry.conversation.id]), entry.conversation]))
  return [...conversations.values()].filter(conversation => setConversationUnread(conversation, unread)).length
}

export function isEntryPending(entry: MailboxEntry): boolean {
  if (entry.conversation.status === 'ignored') return false
  if (entry.conversation.source === 'buyer') return isPendingConversation(entry.conversation)
  if (!entry.message) return isPendingConversation(entry.conversation)
  return isEntryUnread(entry)
}

export function folderPendingCount(conversations: Conversation[], folderId: string, drafts: Record<string, ReplyDraft> = {}): number {
  return mailboxEntries(conversations, folderId, drafts).filter(isEntryPending).length
}

function isPublicHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, '')
  if (host.startsWith('[')) {
    // 仅接受全局单播，排除本地、映射地址和常见过渡/文档前缀；不做 DNS 查询。
    const address = host.slice(1, -1), segments = address.split(':')
    const first = Number.parseInt(segments[0] ?? '', 16), second = Number.parseInt(segments[1] || '0', 16)
    return first >= 0x2000 && first <= 0x3fff && first !== 0x2002 && first !== 0x3fff
      && !(first === 0x2001 && (second === 0 || second === 2 || second === 0xdb8 || second >= 0x10 && second <= 0x2f))
  }
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
    // URL 已将整数、十六进制和缩写 IPv4 规范化，统一按规范地址检查。
    const [a = -1, b = -1, c = -1] = host.split('.').map(Number)
    return !(a === 0 || a === 10 || a === 127 || a >= 224 || a === 169 && b === 254
      || a === 172 && b >= 16 && b <= 31 || a === 192 && b === 168
      || a === 100 && b >= 64 && b <= 127 || a === 198 && (b === 18 || b === 19)
      || a === 192 && b === 0 && (c === 0 || c === 2) || a === 198 && b === 51 && c === 100
      || a === 203 && b === 0 && c === 113)
  }
  if (!host.includes('.') || /(?:^|\.)(?:localhost|local|internal|lan|home|localdomain|test|invalid|onion)$/.test(host)) return false
  return host.split('.').every(label => /^(?!-)[a-z0-9-]{1,63}(?<!-)$/.test(label))
}

/** 仅本地格式校验；正式获取还需服务端校验 DNS、重定向、类型与实际大小。 */
export function validateAttachmentUrl(value: string): string | undefined {
  const trimmed = value.trim()
  if (!trimmed) return '请输入附件链接'
  if (trimmed.length > 2048 || !/^https?:\/\//i.test(trimmed) || /[\u0000-\u0020\u007f\\]/.test(trimmed)) return '请输入有效的 HTTP 或 HTTPS 附件链接'
  let url: URL
  try { url = new URL(trimmed) } catch { return '请输入有效的 HTTP 或 HTTPS 附件链接' }
  if (url.username || url.password || /^https?:\/\/[^/]*@/i.test(trimmed)) return '附件链接不能包含账号或密码'
  if (!isPublicHostname(url.hostname)) return '附件链接须使用公网地址，不支持本机或内网地址'
  let pathname: string
  try { pathname = decodeURIComponent(url.pathname) } catch { return '附件链接路径无效' }
  if (!/\.(?:png|jpe?g|pdf)$/i.test(pathname)) return '附件链接仅支持 PNG、JPG 或 PDF 文件'
  return undefined
}
