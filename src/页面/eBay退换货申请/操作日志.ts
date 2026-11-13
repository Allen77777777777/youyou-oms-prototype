import { currentHandlerName } from '@/组件/客服处理人/处理人'
import { createCustomerServiceLog, type CustomerServiceLog } from '@/组件/客服日志/日志工具'
import type { ReturnApiRequest } from './接口契约'

export interface ReturnOperationLog extends Partial<CustomerServiceLog> {
  at: string
  /** 兼容已有评审记录；新记录仅保存摘要，不复制消息、地址或文件正文。 */
  text: string
  submissionId?: string
  submittedBy?: string
}
export interface ReturnSubmission {
  id: string; operator: string; action: string
  confirmationId?: string; confirmationIntegrity?: string; identity?: string
  requestSnapshot?: ReturnApiRequest; submittedAt?: string
  outcome?: 'pending' | 'unknown' | 'confirmed' | 'failed'; businessId?: string
  /** 本次尝试的业务错误摘要；不保存响应正文，不借用申请的另一笔错误。 */
  resultError?: string
}
interface LoggedReturn { logs: ReturnOperationLog[]; lastSubmission?: ReturnSubmission }

export function recordReturnOperation(row: LoggedReturn, action: string, content: string, result: string, now: string, operator = currentHandlerName.value, related = false, deduplicate = false) {
  const submission = related ? row.lastSubmission : undefined
  const fullContent = content + (related ? `；原提交人：${submission?.operator || '未记录'}` : '')
  if (deduplicate && row.logs.some(log => log.submissionId === submission?.id && log.action === action && log.content === fullContent && log.result === result)) return
  const log = createCustomerServiceLog(operator, action, fullContent, result, now)
  row.logs.push({ ...log, text: `${action}；${fullContent}；${result}`, ...(submission ? { submissionId: submission.id, submittedBy: submission.operator } : {}) })
}

export function returnOperationEntries(row: LoggedReturn): CustomerServiceLog[] {
  return row.logs.map(log => ({ ...log, action: log.action || '历史记录', content: log.content ?? log.text }))
}

export function startReturnSubmission(row: LoggedReturn, action: string) {
  row.lastSubmission = { id: crypto.randomUUID(), operator: currentHandlerName.value, action }
}
