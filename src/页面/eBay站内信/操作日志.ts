import { createCustomerServiceLog } from '@/组件/客服日志/日志工具'
import type { Conversation } from './类型'

export function recordMailOperation(conversation: Conversation, operator: string, action: string, content: string, result = '已完成', at = new Date().toISOString()) {
  const entry = createCustomerServiceLog(operator, action, content, result, at)
  ;(conversation.operationLogs ??= []).push(entry)
  return entry
}

/** 仅记录发生的实际变更；标签的选择顺序不构成业务变更。 */
export function changeMailProperty<K extends 'assignee' | 'priority' | 'tags' | 'flagged'>(conversation: Conversation, key: K, value: Conversation[K], operator: string, action: string, content: string): boolean {
  const before = key === 'priority' ? conversation.priority ?? 'normal' : conversation[key]
  const same = key === 'tags' ? JSON.stringify([...(conversation.tags ?? [])].sort()) === JSON.stringify([...(value as string[] | undefined ?? [])].sort()) : before === value
  if (same) return false
  conversation[key] = value
  recordMailOperation(conversation, operator, action, content)
  return true
}
