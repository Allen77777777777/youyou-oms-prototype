import { getSkuHandlerIds, handlerIdFromLegacy, handlerNames, handlerOptions } from '@/组件/客服处理人/处理人'
import { recordMailOperation } from './操作日志'
import type { Conversation } from './类型'

function legacyIds(c: Conversation): string[] {
  const value = handlerIdFromLegacy(c.assignee)
  return value ? [value] : []
}

export function getConversationHandlerIds(c: Conversation): string[] {
  const a = c.assignment
  if (!a) return legacyIds(c)
  if (a.manualIds !== undefined) return a.manualIds
  const validRuleUser = a.rule && handlerOptions.some(person => person.value === a.rule!.userId)
  return validRuleUser ? [a.rule!.userId] : a.skuHandlerIds
}

function ensureAssignment(c: Conversation) {
  const existing = legacyIds(c)
  return c.assignment ??= { systemSkus: [], skuHandlerIds: [], ...(existing.length ? { manualIds: existing } : {}) }
}

export function snapshotConversationSkus(c: Conversation, skus: readonly string[], log = true) {
  const before = getConversationHandlerIds(c)
  const a = ensureAssignment(c)
  const oldSkus = a.systemSkus
  a.systemSkus = [...new Set(skus.map(sku => sku.trim()).filter(Boolean))]
  a.skuHandlerIds = getSkuHandlerIds(a.systemSkus)
  if (log && !a.manualIds && !a.rule && (handlerNames(before) !== handlerNames(a.skuHandlerIds) || oldSkus.join() !== a.systemSkus.join())) {
    recordMailOperation(c, '系统', '匹配处理人', `系统 SKU：${a.systemSkus.join('、') || '未关联'}；处理人：${handlerNames(before)} → ${handlerNames(a.skuHandlerIds)}`)
  }
}

export function applyManualHandlers(c: Conversation, ids: readonly string[] | null, operator: string) {
  const before = getConversationHandlerIds(c)
  if (ids && ids.some(id => !handlerOptions.some(option => option.value === id))) return false
  const a = ensureAssignment(c)
  if (ids === null) {
    if (a.manualIds === undefined) return false
    delete a.manualIds
  } else {
    const next = [...new Set(ids)]
    if (a.manualIds && next.length === a.manualIds.length && next.every(id => a.manualIds!.includes(id))) return false
    a.manualIds = next
  }
  const after = getConversationHandlerIds(c)
  c.assignee = after.length === 1 ? handlerNames(after) : ''
  recordMailOperation(c, operator, ids === null ? '恢复自动分配' : '指派客服', `${ids === null ? '恢复自动' : '人工指派'}：${handlerNames(before)} → ${handlerNames(after)}`)
  return true
}

export function applyRuleHandler(c: Conversation, rule: NonNullable<NonNullable<Conversation['assignment']>['rule']>, ruleName: string) {
  const before = getConversationHandlerIds(c)
  const a = ensureAssignment(c)
  a.rule = { ...rule }
  const after = getConversationHandlerIds(c)
  c.assignee = after.length === 1 ? handlerNames(after) : ''
  const reference = `${ruleName}（第 ${rule.version} 版），消息 ${rule.messageId}`
  if (a.manualIds !== undefined) {
    recordMailOperation(c, '系统', '保留人工指派', `${reference} 指定 ${handlerNames([rule.userId])}；当前处理人仍为 ${handlerNames(after)}。`, '已保留')
  } else {
    recordMailOperation(c, '系统', '站内信规则指派', `${reference}；处理人：${handlerNames(before)} → ${handlerNames(after)}`)
  }
}
