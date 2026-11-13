import { reactive, watch } from 'vue'
import { createConversations, createRelatedOrders } from './数据'
import { currentHandlerId } from '@/组件/客服处理人/处理人'
import { canOperateMail, canViewMail } from './权限与协作'
import type { ContextTab, Conversation, MailMessage, MessageSource, RelatedOrder, ReplyDraft } from './类型'

interface MailSession {
  navigationTarget?: { conversationId: string; messageId: string; shopId: string; buyerId: string }
  conversations: Conversation[]
  orders: RelatedOrder[]
  drafts: Record<string, ReplyDraft>
  personalStars: Record<string, boolean>
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
  return { conversations: createConversations(), orders: createRelatedOrders(), drafts: {}, personalStars: {}, activeSource: 'buyer', activeId: 'conv-01', contextOpen: false, contextTab: 'overview', selectedOrderId: '', composeMode: 'reply', folder: 'inbox', onlyPendingFolders: false, autoNext: false, markProcessedOnSend: true, pageSize: 20, foldersCollapsed: false, listOpen: true, readerOpen: true }
}

/** 消息为本地虚构资料，个人草稿及星标在本浏览器保存；生产由服务端鉴权与持久化。 */
export const mailSession = reactive<MailSession>(initialSession())

const privateStateKey = 'youyou-oms:mail-private-state:v1'
const draftVersions = reactive<Record<string, number>>({})
const draftSignatures = new Map<string, string>()

export function draftKey(conversationId: string, mode: 'reply' | 'note', userId = currentHandlerId.value, shopId?: string): string {
  const matches = mailSession.conversations.filter(item => item.id === conversationId)
  const shop = shopId ?? (matches.length === 1 ? matches[0]!.shopId : '')
  return JSON.stringify(['prototype-org', shop, conversationId, userId, mode])
}

export function draftVersion(key: string): number {
  return draftVersions[key] ?? 0
}

export function getMailDraft(conversation: Conversation, mode: 'reply' | 'note'): ReplyDraft | undefined {
  if (!canOperateMail(conversation, mode === 'note' ? 'note' : 'send')) return undefined
  const key = draftKey(conversation.id, mode, currentHandlerId.value, conversation.shopId)
  if (!mailSession.drafts[key]) mailSession.drafts[key] = { body: '', attachments: [] }
  return mailSession.drafts[key]
}

/** 提交时固定 key 与版本，回执不会因体验人员切换而清理别人的草稿。 */
export function clearSubmittedDraft(key: string, version: number): boolean {
  if (!mailSession.drafts[key] || draftVersion(key) !== version) return false
  mailSession.drafts[key] = { body: '', attachments: [] }
  return true
}

/** 服务端保存草稿的本地契约，旧版本只返回冲突，保留两端输入供本人选择。 */
export function saveMailDraft(conversation: Conversation, mode: 'reply' | 'note', value: ReplyDraft, expectedVersion: number): { ok: true; version: number } | { ok: false; reason: string } {
  if (!canOperateMail(conversation, mode === 'note' ? 'note' : 'send')) return { ok: false, reason: '没有此会话的草稿编辑权限' }
  const key = draftKey(conversation.id, mode, currentHandlerId.value, conversation.shopId)
  if (expectedVersion !== draftVersion(key)) return { ok: false, reason: '草稿已有较新版本，请核对后再保存' }
  mailSession.drafts[key] = { ...value, attachments: value.attachments.map(item => ({ ...item })) }
  return { ok: true, version: draftVersion(key) }
}

function personalStarKey(conversation: Conversation, userId: string): string {
  return JSON.stringify([conversation.shopId, conversation.id, userId])
}

export function getPersonalMailStar(conversation: Conversation, userId = currentHandlerId.value): boolean {
  if (!canViewMail(conversation, userId)) return false
  return mailSession.personalStars[personalStarKey(conversation, userId)] ?? (userId === 'staff-01' && conversation.flagged)
}

export function setPersonalMailStar(conversation: Conversation, value: boolean, userId = currentHandlerId.value): boolean {
  if (!canOperateMail(conversation, 'star', userId) || getPersonalMailStar(conversation, userId) === value) return false
  mailSession.personalStars[personalStarKey(conversation, userId)] = value
  if (userId === 'staff-01') conversation.flagged = value
  return true
}

function persistPrivateState(): void {
  try {
    globalThis.localStorage?.setItem(privateStateKey, JSON.stringify({ drafts: mailSession.drafts, versions: draftVersions, stars: mailSession.personalStars }))
  } catch { /* 保留内存中的输入，存储不可用不影响当次编辑。 */ }
}

export function restoreMailPrivateState(): void {
  try {
    const stored = globalThis.localStorage?.getItem(privateStateKey)
    if (!stored) return
    const value = JSON.parse(stored) as { drafts?: Record<string, ReplyDraft>; versions?: Record<string, number>; stars?: Record<string, boolean> }
    for (const [key, draft] of Object.entries(value.drafts ?? {})) {
      const identity = JSON.parse(key) as unknown[]
      if (!Array.isArray(identity) || identity.length !== 5 || identity[0] !== 'prototype-org' ||
        !['reply', 'note'].includes(String(identity[4])) || typeof draft.body !== 'string' || !Array.isArray(draft.attachments)) continue
      mailSession.drafts[key] = draft
      draftSignatures.set(key, JSON.stringify(draft))
      draftVersions[key] = Math.max(1, Number.isInteger(value.versions?.[key]) ? value.versions![key]! : 1)
    }
    for (const [key, starred] of Object.entries(value.stars ?? {})) {
      if (typeof starred === 'boolean') mailSession.personalStars[key] = starred
    }
  } catch { /* 无效的本地资料不作为可用个人草稿。 */ }
}

export function resetMailSession(): void {
  delete mailSession.navigationTarget
  draftSignatures.clear()
  for (const key of Object.keys(draftVersions)) delete draftVersions[key]
  Object.assign(mailSession, initialSession())
  try { globalThis.localStorage?.removeItem(privateStateKey) } catch { /* 重置仍清理内存。 */ }
}

restoreMailPrivateState()
watch(() => mailSession.drafts, drafts => {
  for (const [key, value] of Object.entries(drafts)) {
    const signature = JSON.stringify(value)
    if (draftSignatures.get(key) !== signature) {
      draftVersions[key] = draftVersion(key) + 1
      draftSignatures.set(key, signature)
    }
  }
  for (const key of draftSignatures.keys()) {
    if (!(key in drafts)) { draftSignatures.delete(key); delete draftVersions[key] }
  }
  persistPrivateState()
}, { deep: true, flush: 'sync' })
watch(() => mailSession.personalStars, persistPrivateState, { deep: true, flush: 'sync' })

/** 排除重复消息身份、内部备注及未确认发送的记录。 */
export function businessMessages(conversation: Conversation) {
  const messages = new Map<string, MailMessage>()
  const seen = new Set<string>()
  for (const message of conversation.messages) {
    if (!message.id?.trim()) continue
    if (seen.has(message.id)) { messages.delete(message.id); continue }
    seen.add(message.id)
    if (message.kind === 'incoming' || (message.kind === 'outgoing' && message.delivery === 'success')) messages.set(message.id, message)
  }
  return messages
}

export function findBusinessMessage(shopId: string, conversationId: string, messageId: string) {
  if (![shopId, conversationId, messageId].every(value => value.trim())) return
  const matches = mailSession.conversations.filter(item => item.id === conversationId)
  const conversation = matches.length === 1 ? matches[0] : undefined
  if (!conversation || conversation.shopId !== shopId) return
  const message = businessMessages(conversation).get(messageId)
  return message ? { conversation, message } : undefined
}

/** 显式点击来源来信时传递稳定消息身份；收件工作台消费后才应用选中与阅读行为。 */
export function requestBuyerMailNavigation(shopId: string, buyerId: string, conversationId: string, messageId: string): boolean {
  if (![shopId, buyerId, conversationId, messageId].every(value => value.trim())) return false
  const source = findBusinessMessage(shopId, conversationId, messageId)
  if (!source || source.conversation.source !== 'buyer' || source.conversation.buyerId !== buyerId || source.message.kind !== 'incoming' || source.message.notice) return false
  mailSession.navigationTarget = { shopId, buyerId, conversationId, messageId }
  return true
}
