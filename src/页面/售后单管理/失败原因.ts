import type { AfterSaleRecord } from './会话'
import type { ReturnRecord } from '../eBay退换货申请/模型'
import { canViewAfterSale } from './权限'
import { resolveAfterSaleSource } from './来源关联'

/** 只显示本次办理已保存的错误；当前申请的 submissionError 不作历史兜底。 */
export function afterSaleFailureSummary(record: AfterSaleRecord, sourceRows?: readonly ReturnRecord[]): string {
  if (!canViewAfterSale(record) || !/失败|待核实|待核查|未提交/.test(record.executionResult)) return ''
  const source = resolveAfterSaleSource(record, sourceRows).row
  if (!source || source.detail?.contentOnHold) return ''
  const attempts = source.submissionAttempts?.filter(attempt => attempt.businessId === record.requestId) || []
  const latest = attempts[attempts.length - 1]
  return latest?.resultError?.trim() || ''
}
