import { getSkuHandlerIds, handlerNames } from '@/组件/客服处理人/处理人'
import { 读取排序时刻 } from '@/组件/筛选/筛选工具'
import { 共享订单 } from '../订单处理/演示会话'
import { resolveReturnItem } from './关联导航'
import { isReturnClosed, type ReturnRecord } from './模型'
import { recordReturnOperation } from './操作日志'

/** 调用方已经核实的本次申请商品行，不接受展示 SKU 代替交易关联。 */
export interface ReturnHandlerSourceLine {
  sourceId: string
  systemSku?: string
  verified: boolean
  issue?: string
}
export interface ReturnHandlerLine extends ReturnHandlerSourceLine { handlerIds: string[] }
export interface ReturnHandlerAssignmentEvent {
  version: number
  handlerIds: string[]
  previousHandlerIds: string[]
  assignedAt: string
  source: 'initial' | 'trusted-association' | 'manual'
  actorId: string
  manualOverride: boolean
  lines: ReturnHandlerLine[]
}
/** 仅本地记录与审计；生产仍需在服务端原子检查版本并可靠保存。 */
export interface ReturnHandlerAssignment {
  shopId: string
  returnId: string
  version: number
  events: ReturnHandlerAssignmentEvent[]
}
interface ReturnHandlerContext { at: string; actorId: string; lines?: readonly ReturnHandlerSourceLine[] }
export interface ReturnHandlerChange extends ReturnHandlerContext {
  expectedVersion: number
  source: 'trusted-association' | 'manual'
  authorized: boolean
  associationAllowed?: boolean
  handlerIds?: readonly string[]
}
export type ReturnHandlerAssignmentResult = { ok: true; version: number; changed: boolean } | { ok: false; version: number; error: string }
type ReadHandlers = (skus: readonly string[]) => string[]
const unique = (values: readonly string[]) => [...new Set(values.map(value => value.trim()).filter(Boolean))]

export function getReturnSystemSkus(row: ReturnRecord): string[] {
  const detail = row.detail
  if (detail?.itemOnHold || detail?.contentOnHold || detail?.identityConflicts?.summary || detail?.identityConflicts?.detail) return []
  const item = resolveReturnItem(row, 共享订单.value)
  return item?.skuResolutionStatus === '成功' && item.systemSku ? [item.systemSku] : []
}

/** 仅在创建或显式可信分配事件读取来源；普通显示不调用此函数。 */
export function getReturnHandlerSourceLines(row: ReturnRecord): ReturnHandlerSourceLine[] {
  const detail = row.detail
  const sourceId = JSON.stringify([row.shopId, row.orderNo, detail?.itemId || '', detail?.transactionId || ''])
  if (detail?.itemOnHold || detail?.contentOnHold || detail?.identityConflicts?.summary || detail?.identityConflicts?.detail) {
    return [{ sourceId, verified: false, issue: '申请商品来源冻结或交易身份存在冲突' }]
  }
  const item = resolveReturnItem(row, 共享订单.value)
  if (!item) return [{ sourceId, verified: false, issue: '本次申请交易商品行尚未核实' }]
  return [{ sourceId: item.externalLineId, systemSku: item.systemSku?.trim(), verified: item.skuResolutionStatus === '成功' && !!item.systemSku?.trim(),
    ...(item.skuResolutionStatus !== '成功' || !item.systemSku?.trim() ? { issue: '系统 SKU 未识别' } : {}) }]
}

function currentEvent(row: ReturnRecord): ReturnHandlerAssignmentEvent | undefined {
  const assignment = row.handlerAssignment, event = assignment?.events[assignment.events.length - 1]
  if (!assignment || assignment.shopId !== row.shopId || assignment.returnId !== row.id || !event || event.version !== assignment.version
    || !Number.isSafeInteger(event.version) || event.version < 1 || !event.actorId.trim() || 读取排序时刻(event.assignedAt) === undefined) return
  return event
}

/** 快照缺失或损坏时不从今天的目录补造历史，也不退回较旧事件冒充当前。 */
export function getReturnHandlerIds(row: ReturnRecord): string[] {
  const event = currentEvent(row)
  if (event) return unique(event.handlerIds)
  return row.handlerAssignment === undefined && isReturnClosed(row) ? unique(row.closedHandlerIds ?? []) : []
}

export function getReturnHandlerPresentation(row: ReturnRecord) {
  const event = currentEvent(row), handlerIds = getReturnHandlerIds(row)
  const status = event ? 'recorded' : handlerIds.length ? 'legacy' : 'unrecorded'
  const issues = event ? event.lines.filter(line => line.issue).map(line => `${line.systemSku || line.sourceId}：${line.issue}`)
    : ['处理人分配历史未记录，不使用当前 SKU 目录反推']
  return { status, handlerIds, label: status === 'unrecorded' ? '未记录' : handlerNames(handlerIds), issues,
    version: row.handlerAssignment?.version ?? 0, assignedAt: event?.assignedAt }
}

/** “未分配”只命中明确保存的空名单，不能混入历史未记录。 */
export function matchesReturnHandlerFilter(row: ReturnRecord, selected: readonly string[]): boolean {
  if (!selected.length) return true
  const presentation = getReturnHandlerPresentation(row)
  return presentation.handlerIds.length ? presentation.handlerIds.some(id => selected.includes(id))
    : presentation.status === 'recorded' && selected.includes('')
}

function saveAssignment(row: ReturnRecord, context: ReturnHandlerContext, source: ReturnHandlerAssignmentEvent['source'], readHandlers: ReadHandlers,
  manualIds?: readonly string[]): ReturnHandlerAssignmentResult {
  const assignment = row.handlerAssignment, previous = currentEvent(row), version = assignment?.version ?? 0
  const at = 读取排序时刻(context.at), actorId = context.actorId.trim()
  if (!row.shopId || !row.id || !actorId || at === undefined) return { ok: false, version, error: '分配身份、操作者或生效时刻尚未核实' }
  if (assignment && !previous) return { ok: false, version, error: '已有分配历史不完整，请先核实，不能覆盖补造' }
  if (previous && at < 读取排序时刻(previous.assignedAt)!) return { ok: false, version, error: '分配事件早于当前生效记录，请重新核实' }
  const sourceLines = context.lines ?? (source === 'manual' && previous ? previous.lines : getReturnHandlerSourceLines(row))
  const lines: ReturnHandlerLine[] = (sourceLines.length ? sourceLines : [{ sourceId: row.id, verified: false, issue: '本次申请交易商品行尚未核实' }]).map(line => {
    const systemSku = line.systemSku?.trim(), verified = line.verified && !!line.sourceId.trim() && !!systemSku
    const ids = verified ? unique(readHandlers([systemSku!])) : []
    return { sourceId: line.sourceId, systemSku, verified, handlerIds: ids,
      ...(!verified ? { issue: line.issue || '本次申请交易商品行或系统 SKU 尚未核实' } : !ids.length ? { issue: '系统 SKU 无有效运营人员绑定' } : {}) }
  })
  if (source === 'trusted-association' && !lines.some(line => line.verified)) return { ok: false, version, error: '关联补齐尚无已核实的申请商品行，保留原分配' }
  const handlerIds = source === 'manual' ? unique(manualIds ?? []) : unique(lines.flatMap(line => line.handlerIds))
  const event: ReturnHandlerAssignmentEvent = { version: version + 1, handlerIds, previousHandlerIds: getReturnHandlerIds(row), assignedAt: context.at,
    source, actorId, manualOverride: source === 'manual', lines }
  row.handlerAssignment = { shopId: row.shopId, returnId: row.id, version: event.version, events: [...(assignment?.events ?? []), event] }
  recordReturnOperation(row, '处理人分配', `来源：${source}；原名单：${previous ? handlerNames(event.previousHandlerIds) : '未记录'}；当前名单：${handlerNames(handlerIds)}；版本：${event.version}${lines.some(line => line.issue) ? '；待补齐：' + lines.filter(line => line.issue).map(line => `${line.systemSku || line.sourceId}：${line.issue}`).join('、') : ''}`,
    '已保存本地分配快照', context.at, handlerNames([actorId]))
  return { ok: true, version: event.version, changed: true }
}

/** 创建事件幂等；禁止借打开页面给旧记录制造责任历史。 */
export function initializeReturnHandlers(row: ReturnRecord, context: ReturnHandlerContext, readHandlers: ReadHandlers = getSkuHandlerIds): ReturnHandlerAssignmentResult {
  if (row.handlerAssignment) return currentEvent(row) ? { ok: true, version: row.handlerAssignment.version, changed: false }
    : { ok: false, version: row.handlerAssignment.version, error: '已有分配历史不完整，请先核实，不能覆盖补造' }
  if (isReturnClosed(row)) return { ok: false, version: 0, error: '已结束申请不按当前目录补造处理人历史' }
  return saveAssignment(row, context, 'initial', readHandlers)
}

/** 供显式可信来源分配或已有授权交接调用；不新增交接界面，也不在读取时执行。 */
export function assignReturnHandlers(row: ReturnRecord, change: ReturnHandlerChange, readHandlers: ReadHandlers = getSkuHandlerIds): ReturnHandlerAssignmentResult {
  const version = row.handlerAssignment?.version ?? 0
  if (change.expectedVersion !== version) return { ok: false, version, error: '人员已变化，请保留输入并重新核对' }
  if (!change.authorized) return { ok: false, version, error: '缺少本店铺处理人分配权限' }
  if (isReturnClosed(row)) return { ok: false, version, error: '已结束申请不回改处理人历史' }
  if (change.source === 'trusted-association' && (!change.associationAllowed || currentEvent(row)?.manualOverride)) {
    return { ok: false, version, error: '关联补齐不适用于当前分配，须由有权人员落实交接' }
  }
  if (change.source === 'manual' && change.handlerIds === undefined) return { ok: false, version, error: '请明确完整处理人名单；空名单须显式提交' }
  return saveAssignment(row, change, change.source, readHandlers, change.handlerIds)
}

/** 办结只固化已有责任，不在关闭时读取今天的目录重算；旧字段兼容既有消费者。 */
export function captureReturnHandlers(row: ReturnRecord): void {
  const event = currentEvent(row)
  if (event) row.closedHandlerIds = unique(event.handlerIds)
}
