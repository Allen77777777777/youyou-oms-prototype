import { createCustomerServiceLog } from '@/组件/客服日志/日志工具'
import { formatReturnTime } from '../eBay退换货申请/模型'
import { syncReturnWithSales } from '../eBay退换货申请/售后联动'
import { 共享订单 } from '../订单处理/演示会话'
import { afterSaleRecords, type AfterSaleRecord } from './会话'
import { afterSaleResultPresentation } from './办理结果'
import { activeAfterSaleActor, canViewAfterSale, type AfterSaleActor } from './权限'
import { resolveAfterSaleSource } from './来源关联'

export { resolveAfterSaleSource } from './来源关联'
export interface AfterSaleCheckResult { ok: boolean; status: 'success' | 'failed' | 'unconfirmed'; message: string }

/** 主动核查仅回读来源；既有 syncReturnWithSales 按业务凭据更新各单，不重新提交平台动作或重发订单。 */
export function refreshAfterSaleResult(
  input: AfterSaleRecord, actor: AfterSaleActor = activeAfterSaleActor.value, now = new Date().toISOString(),
): AfterSaleCheckResult {
  const matches = afterSaleRecords.value.filter(record => record.no === input.no && record.shopId === input.shopId && record.returnId === input.returnId && record.requestId === input.requestId)
  const record = matches.length === 1 ? matches[0] : undefined
  if (!record || !canViewAfterSale(record, actor)) return { ok: false, status: 'failed', message: '售后单不存在或没有当前店铺的核查权限' }
  const source = resolveAfterSaleSource(record)
  const previousSuccess = source.row?.lastSyncedAt || record.resultCheck?.sourceSucceededAt
  const finish = (status: AfterSaleCheckResult['status'], message: string, sourceSucceededAt = previousSuccess): AfterSaleCheckResult => {
    record.resultCheck = { at: now, status, message, operator: actor.name, ...(sourceSucceededAt ? { sourceSucceededAt } : {}) }
    ;(record.logs ??= []).push(createCustomerServiceLog(actor.name, '刷新办理结果',
      `本次办理 ${record.requestId}；${message}`, status === 'success' ? '查询成功' : status === 'unconfirmed' ? '仍待核查' : '查询失败', now))
    return { ok: status !== 'failed', status, message }
  }
  const retained = previousSuccess ? `保留上次成功读取 ${formatReturnTime(previousSuccess)} 的资料` : '尚无成功读取记录，已有资料仍待核实'
  if (!source.row) return finish('failed', `${source.issue}；${retained}`)
  try {
    const result = syncReturnWithSales(source.row, now)
    if (result.status !== 'success') return finish('failed', `${result.message}；${retained}`)
    const current = resolveAfterSaleSource(record)
    if (!current.row) return finish('failed', `${current.issue}；本次结果未确认`)
    const ownSubmission = current.row.afterSaleSubmission
    const ownUnknown = ownSubmission?.no === record.no && ownSubmission.requestId === record.requestId && current.row.outcome === 'unknown'
    const presentation = afterSaleResultPresentation(record, 共享订单.value, actor)
    const unresolved = !record.executionResult.trim() || presentation.group === '待核查' || ownUnknown
    return finish(unresolved ? 'unconfirmed' : 'success',
      unresolved ? `来源资料已读取，本次办理仍待核查；${presentation.text}` : `查询成功；本次办理：${presentation.text}`,
      current.row.lastSyncedAt || previousSuccess)
  } catch {
    // 不将接口报文或可能含客户信息的异常原文写入业务日志。
    return finish('failed', `办理结果读取失败，请稍后重新核查；${retained}`)
  }
}
