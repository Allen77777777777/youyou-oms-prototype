import { reactive } from 'vue'
import { currentHandlerId, handlerOptions } from '@/组件/客服处理人/处理人'
import { getConversationHandlerIds } from './会话处理人'
import type { Conversation } from './类型'

export type MailAction = 'view' | 'read' | 'star' | 'send' | 'note' | 'process' | 'assign' | 'claim'
  | 'batchSend' | 'tags' | 'priority' | 'ignore' | 'verify' | 'recall' | 'tagsAdmin'

export interface MailAccessProfile {
  shopIds: string[]
  actions: MailAction[]
  /** 已明确授予同店代办资格，仍受店铺和动作权限约束。 */
  delegate: boolean
}

const allActions: MailAction[] = ['view', 'read', 'star', 'send', 'note', 'process', 'assign', 'claim',
  'batchSend', 'tags', 'priority', 'ignore', 'verify', 'recall', 'tagsAdmin']
function initialProfiles(): Record<string, MailAccessProfile> {
  return {
    'staff-01': { shopIds: ['*'], actions: [...allActions], delegate: true },
    'staff-02': { shopIds: ['shop-us', 'shop-uk'], actions: ['view', 'read', 'star', 'send', 'note', 'process', 'claim', 'tags', 'priority', 'ignore', 'recall'], delegate: false },
    'staff-03': { shopIds: ['shop-us'], actions: ['view', 'read', 'star', 'assign', 'claim', 'recall', 'verify', 'tagsAdmin'], delegate: false },
  }
}

/** 本地虚构授权用于体验身份切换，生产由认证及店铺权限服务提供。 */
export const mailAccessProfiles = reactive(initialProfiles())

function hasShopAccess(shopId: string, profile: MailAccessProfile | undefined): boolean {
  return Boolean(shopId && profile && (profile.shopIds.includes('*') || profile.shopIds.includes(shopId)))
}

export function canViewMail(conversation: Pick<Conversation, 'shopId'> | undefined, userId = currentHandlerId.value): boolean {
  const profile = mailAccessProfiles[userId]
  return Boolean(conversation && hasShopAccess(conversation.shopId, profile) && profile?.actions.includes('view'))
}

const handlingActions: MailAction[] = ['send', 'note', 'process', 'batchSend', 'tags', 'priority', 'ignore']

export function canOperateMail(conversation: Conversation | undefined, action: MailAction, userId = currentHandlerId.value): boolean {
  if (!conversation || !canViewMail(conversation, userId)) return false
  const profile = mailAccessProfiles[userId]!
  if (!profile.actions.includes(action)) return false
  if (action === 'tagsAdmin') return canAdminMailTags(userId)
  if (action === 'claim') return getConversationHandlerIds(conversation).length === 0
  if (action === 'batchSend' && !profile.actions.includes('send')) return false
  return !handlingActions.includes(action) || profile.delegate || getConversationHandlerIds(conversation).includes(userId)
}

export function mailOperationReason(conversation: Conversation | undefined, action: MailAction, userId = currentHandlerId.value): string | undefined {
  if (!canViewMail(conversation, userId)) return '没有该店铺的站内信查看权限'
  if (!mailAccessProfiles[userId]?.actions.includes(action)) return '当前人员没有此操作权限'
  if (!canOperateMail(conversation, action, userId)) {
    if (action === 'tagsAdmin') return '没有业务标签字典维护权限'
    return action === 'claim' ? '此会话已有处理人，请由有指派权限的人员办理交接' : '请先成为会话处理人或取得代办授权'
  }
  return undefined
}

export function canAdminMailTags(userId = currentHandlerId.value): boolean {
  const profile = mailAccessProfiles[userId]
  // 当前只有一份共享字典，维护权覆盖全部引用店铺，不能用单店权限修改隐藏店铺的引用。
  return Boolean(profile?.shopIds.includes('*') && profile.actions.includes('view') && profile.actions.includes('tagsAdmin'))
}

export function getMailReviewers(shopId: string): Array<{ value: string; label: string }> {
  return handlerOptions.filter(person => {
    const profile = mailAccessProfiles[person.value]
    return hasShopAccess(shopId, profile) && profile?.actions.includes('view') && profile.actions.includes('verify')
  })
}

export function resetMailAccessProfiles(): void {
  for (const key of Object.keys(mailAccessProfiles)) delete mailAccessProfiles[key]
  Object.assign(mailAccessProfiles, initialProfiles())
}
