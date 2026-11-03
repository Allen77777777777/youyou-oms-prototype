import { reactive } from 'vue'
import { createConversations, createRelatedOrders } from './数据'
import type { ContextTab, Conversation, MessageSource, RelatedOrder, ReplyDraft } from './类型'

interface MailSession {
  navigationTarget?: { conversationId: string; messageId: string; shopId: string; buyerId: string }
  conversations: Conversation[]
  orders: RelatedOrder[]
  drafts: Record<string, ReplyDraft>
  activeSource: MessageSource
  activeId: string
  contextOpen: boolean
  contextTab: ContextTab
  selectedOrderId: string
  composeMode: 'reply' | 'note'
  folder: string
  onlyPendingFolders: boolean
  autoNext: boolean
  markProcessedOnSend: boolean
  pageSize: number
  foldersCollapsed: boolean
  listOpen: boolean
  readerOpen: boolean
}

function initialSession(): MailSession {
  return { conversations: createConversations(), orders: createRelatedOrders(), drafts: {}, activeSource: 'buyer', activeId: 'conv-01', contextOpen: false, contextTab: 'overview', selectedOrderId: '', composeMode: 'reply', folder: 'inbox', onlyPendingFolders: false, autoNext: false, markProcessedOnSend: true, pageSize: 20, foldersCollapsed: false, listOpen: true, readerOpen: true }
}

/** 仅保留当前浏览器会话；路由往返保持，刷新重置，不读写平台或本地持久存储。 */
export const mailSession = reactive<MailSession>(initialSession())

export function draftKey(conversationId: string, mode: 'reply' | 'note'): string {
  return JSON.stringify([conversationId, mode])
}

export function resetMailSession(): void {
  delete mailSession.navigationTarget
  Object.assign(mailSession, initialSession())
}

/** 显式点击来源来信时传递稳定消息身份；收件工作台消费后才应用选中与阅读行为。 */
export function requestBuyerMailNavigation(shopId: string, buyerId: string, conversationId: string, messageId: string): boolean {
  if (![shopId, buyerId, conversationId, messageId].every(value => value.trim())) return false
  const matches = mailSession.conversations.filter(c => c.id === conversationId)
  if (matches.length !== 1) return false
  const c = matches[0]!
  if (c.source !== 'buyer' || c.shopId !== shopId || c.buyerId !== buyerId || c.messages.filter(m => m.id === messageId && m.kind === 'incoming' && !m.notice).length !== 1) return false
  mailSession.navigationTarget = { shopId, buyerId, conversationId, messageId }
  return true
}
