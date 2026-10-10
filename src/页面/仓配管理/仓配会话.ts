import { ref, watch } from 'vue'
import { 共享订单, 仓库执行记录, 操作核查证据, 预置仓库评审执行身份, type 仓库执行 } from '../订单处理/演示会话'
import { 同步演示仓库状态, 同步仓库状态阻断原因, 重新推单阻断原因, 执行演示重新推单, 仓单期望版本, 仓单来源订单, 截单阻断原因, 执行演示截单 } from '../订单处理/操作功能模型'
import { 创建仓配样例, 取得操作拦截, 执行样例动作, 演示时间, type 仓配单据 } from './仓配模型'
import { 创建出库工作台样例, 创建历史出库快照, 创建推单出库快照, 取得出库详情, 命中截单能力样例, type 出库快照, type 出库作业动作, type 出库截单影响范围 } from './三方仓出库模型'
import { 创建渠道配置样例, type 渠道配置, type 渠道操作记录 } from './物流渠道配置'

export const 仓库会话单据 = ref<仓配单据[]>(创建出库工作台样例())
export const 物流会话单据 = ref<仓配单据[]>(创建仓配样例('物流'))
export const 渠道会话 = ref<渠道配置[]>(创建渠道配置样例())
export const 渠道会话审计 = ref<渠道操作记录[]>([])
// 只收敛领域初始化时固化的旧预置评审对象，领域事实仍用于原门禁。
// 会话模块首次加载或HMR前已新推的对象不属于该固定集合，仍会正常投影。
const 启动评审执行 = new Set(预置仓库评审执行身份)

function 标准时间(time: string) {
  const date = new Date(time.replace(' UTC+8', '+08:00').replace(' UTC', 'Z').replace(' ', 'T'))
  return Number.isNaN(date.getTime()) ? time : new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(date)
}
function 复制快照(snapshot: 出库快照): 出库快照 { return JSON.parse(JSON.stringify(snapshot)) as 出库快照 }
/** 只读投影本出库执行；专项测试可显式展示旧评审对象，不重编号或反推历史逐商品分配。 */
export function 创建仓库执行投影(execution: 仓库执行, existing?: 仓配单据): 仓配单据 {
    const sources = execution.订单号.map(no => 共享订单.value.find(order => order.systemOrderNo === no)).filter((order): order is NonNullable<typeof order> => !!order)
    const id = `shared-${execution.出库单号}`
    // 路由、收件、来源、计划和逐商品组成在提交时固定；刷新只更新仓库已知执行事实。
    const snapshot = existing?.outboundDetail ? 复制快照(existing.outboundDetail) : (execution.出库快照 ? 复制快照(execution.出库快照) : 创建历史出库快照(sources, execution.履约单号))
    if (snapshot.submittedAt) snapshot.submittedAt = 标准时间(snapshot.submittedAt)
    const route = snapshot.route
    const facts = execution.出库事实
    if (facts) {
      snapshot.quantitySummary.plannedQuantity = facts.planned
      snapshot.quantitySummary.shippedQuantity = facts.shipped
      if (facts.shippedAt && execution.状态 === '已出库') snapshot.shippedAt = 标准时间(facts.shippedAt)
      // 只有履约累计量不能证明逐来源、逐商品出库归属；保留累计事实，将缺少来源明细的实际量置为未知。
      if (facts.shipped !== null && snapshot.items.length && snapshot.items.every(item => item.shippedQuantity !== null) && snapshot.items.reduce((sum, item) => sum + item.shippedQuantity!, 0) !== facts.shipped) {
        for (const item of snapshot.items) { item.shippedQuantity = null; item.lineStatus = '出库量待核实' }
      }
    }
    return {
      id, kind: '仓库', no: execution.出库单号, fulfillment: execution.履约单号, order: snapshot.sourceOrders.map(source => source.systemOrderNo).join('、') || execution.订单号.join('、'),
      provider: route?.warehouseProvider || '待补充', warehouse: route?.warehouse || '待补充', account: route?.warehouseAccount || '待补充', channel: route?.shippingChannel || '待补充', channelCode: route?.shippingChannelCode || '', platform: snapshot.sourceOrders[0]?.platform || '',
      status: execution.状态, labelMode: route?.labelMode === '仓配一体' ? '仓库回传' : '仓配分离', externalNo: execution.外部仓库单号 || '', tracking: facts?.tracking || existing?.tracking || '', createdAt: existing ? existing.createdAt : (snapshot.submittedAt ? 标准时间(snapshot.submittedAt) : ''), updatedAt: 标准时间(execution.更新时间),
      planned: snapshot.quantitySummary.plannedQuantity ?? 0, shipped: snapshot.quantitySummary.shippedQuantity ?? 0,
      sku: snapshot.items.map(item => item.systemSku).filter(Boolean).join('、'), goods: snapshot.items.map(item => item.goods).filter(Boolean).join('、'), country: snapshot.recipient?.countryCode || '',
      reason: execution.原因, reasonCode: execution.待核查 ? 'EXTERNAL_RESULT_PENDING_CHECK' : execution.原因 ? 'DEMO_SHARED_EXECUTION_BLOCKED' : '', awaitingCheck: execution.待核查, blocker: '',
      history: existing?.history || [{ time: 标准时间(execution.更新时间), title: `仓库状态 · ${execution.状态}`, detail: `关联履约 ${execution.履约单号}；来源订单：${execution.订单号.join('、')}。` }], attempts: existing?.attempts || [], outboundDetail: snapshot,
    }
}
function 同步共享执行() {
  for (const execution of 仓库执行记录.value) {
    const existing = 仓库会话单据.value.find(row => row.id === `shared-${execution.出库单号}`)
    if (!existing && 启动评审执行.has(JSON.stringify([execution.出库单号, execution.履约单号]))) continue
    const row = 创建仓库执行投影(execution, existing)
    if (existing) Object.assign(existing, row)
    else 仓库会话单据.value.unshift(row)
  }
}
watch([仓库执行记录, 共享订单], 同步共享执行, { deep: true, immediate: true })

export function 仓配会话操作拦截(row: 仓配单据, action: 出库作业动作, options?: { 批量?: boolean }): string {
  if (action === '截单' && (row.kind !== '仓库' || !row.id.startsWith('shared-'))) return '尚未取得关联订单、仓库执行及已核验的截单能力，请联系仓库核实'
  if (!row.id.startsWith('shared-')) return action === '截单' ? '尚未取得关联订单、仓库执行及已核验的截单能力，请联系仓库核实' : 取得操作拦截(row, action)
  const matches = 仓库执行记录.value.filter(item => item.出库单号 === row.no && item.履约单号 === row.fulfillment)
  const execution = matches[0]
  if (matches.length !== 1 || !execution) return '出库单关联已变化或不唯一，请刷新后重新核查'
  if (action === '截单') {
    const reasons = 截单阻断原因(execution, options?.批量 === true)
    const sources = 仓单来源订单(execution), detail = 取得出库详情(row)
    if (JSON.stringify([...new Set(detail.sourceOrders.map(source => source.systemOrderNo))].sort()) !== JSON.stringify([...new Set(sources.map(source => source.systemOrderNo))].sort())) reasons.push('本次执行的来源范围已变化，请先核对原仓单的完整影响范围')
    if (detail.quantitySummary.shippedQuantity !== 0 || sources.some(source => 操作核查证据.value[source.systemOrderNo]?.零出库已核实 !== true)) reasons.push('本出库单的最新零出库事实尚未核实，不能提交截单')
    if (!命中截单能力样例(row) && sources.some(source => 操作核查证据.value[source.systemOrderNo]?.截单阶段可撤 !== true)) reasons.push('尚未取得当前仓库账号及作业阶段的截单能力，请联系仓库核实')
    if (sources.some(source => ['未知', '未查到', '查询失败'].includes(操作核查证据.value[source.systemOrderNo]?.同步结果 ?? ''))) reasons.push('仓库最新执行结果尚未核实，请先查询或联系仓库核查')
    if (sources.some(source => { const route = source.fulfillmentOrders.find(item => item.fulfillmentOrderNo === row.fulfillment)?.route; return !route || route.warehouseProvider !== row.provider || route.warehouseAccount !== row.account || route.warehouse !== row.warehouse })) reasons.push('仓库执行快照与来源关联不一致，请先核对原仓库账号及影响范围')
    return [...new Set(reasons)].join('；')
  }
  if (action === '查询结果') return 同步仓库状态阻断原因(execution).join('；')
  if (action !== '重新提交') return '当前出库单不支持此操作'
  const reasons = 重新推单阻断原因(execution)
  const candidate = execution.出库快照 || 创建推单出库快照(仓单来源订单(execution), execution.履约单号, '')
  if (!candidate.snapshotReliable) reasons.push(candidate.compositionReason)
  return [...new Set(reasons)].join('；')
}
export function 取得出库截单影响范围(row: 仓配单据, 批量 = false): 出库截单影响范围 {
  const execution = 仓库执行记录.value.find(item => item.出库单号 === row.no && item.履约单号 === row.fulfillment)
  const detail = 取得出库详情(row), sources = execution ? 仓单来源订单(execution) : []
  const numbers = [...new Set([...(execution?.订单号 || []), ...sources.map(source => source.systemOrderNo), ...detail.sourceOrders.map(source => source.systemOrderNo)])]
  return {
    outboundNo: row.no, fulfillmentNo: row.fulfillment, provider: row.provider, warehouse: row.warehouse, account: row.account, status: row.status,
    sourceOrders: numbers.map(systemOrderNo => {
      const source = sources.find(order => order.systemOrderNo === systemOrderNo), stored = detail.sourceOrders.find(order => order.systemOrderNo === systemOrderNo)
      return { systemOrderNo, platformOrderNo: source?.platformOrderNo || stored?.platformOrderNo || '', platform: source?.platformCode || stored?.platform || '', shopId: source?.storeId || stored?.shopId || '', shop: source?.storeName || stored?.shop || '', processingStatus: source?.processingStatus || null }
    }), quantitySummary: { ...detail.quantitySummary }, isShared: numbers.length > 1, versions: execution ? 仓单期望版本(execution) : {}, blocker: 仓配会话操作拦截(row, '截单', { 批量 }),
  }
}
export function 执行仓配会话动作(row: 仓配单据, action: 出库作业动作, options?: { 修复说明?: string; 版本表?: Record<string, number>; 截单原因?: string; 批量?: boolean; 确认全部来源?: boolean }): { success: boolean; reason: string } {
  if (action === '截单') {
    if (options?.确认全部来源 !== true) return { success: false, reason: '请确认已核对本出库单及全部来源订单的影响范围' }
    const reason = options.截单原因?.trim() || ''
    if (!reason || reason.length > 500) return { success: false, reason: '请填写 1～500 字的截单原因' }
    const impact = 取得出库截单影响范围(row, options?.批量 === true)
    if (!options.版本表 || impact.sourceOrders.some(source => !Number.isInteger(options.版本表![source.systemOrderNo]) || options.版本表![source.systemOrderNo]! <= 0)) return { success: false, reason: '全部来源订单版本尚未确认，请重新打开截单预检' }
  }
  if (!row.id.startsWith('shared-')) {
    if (action === '截单') return { success: false, reason: 仓配会话操作拦截(row, action, { 批量: options?.批量 }) }
    const result = 执行样例动作(row, action)
    if (result.success && action === '查询结果' && row.outboundDetail) row.outboundDetail.lastSyncedAt = 演示时间()
    return result
  }
  const blocker = 仓配会话操作拦截(row, action, { 批量: options?.批量 })
  if (blocker) return { success: false, reason: blocker }
  const execution = 仓库执行记录.value.find(item => item.出库单号 === row.no && item.履约单号 === row.fulfillment)!
  const before = execution.状态
  const result = action === '查询结果' ? 同步演示仓库状态(row.no) : action === '截单' ? 执行演示截单(row.no, options!.版本表!, options?.截单原因?.trim() || '', options?.批量 === true) : 执行演示重新推单(row.no, options?.版本表 || 仓单期望版本(execution), options?.修复说明 || '')
  // 截单命令的版本、文本或资格预检失败尚未发送外部请求，不追加接口尝试。
  if (action === '截单' && !result.成功) return { success: false, reason: result.信息 }
  if (result.成功 && action === '重新提交' && !execution.出库快照) {
    execution.出库快照 = 创建推单出库快照(仓单来源订单(execution), execution.履约单号, execution.更新时间)
    row.outboundDetail = 复制快照(execution.出库快照)
  }
  同步共享执行()
  const time = 演示时间()
  if (row.outboundDetail && action === '查询结果') {
    if (result.成功) {
      row.outboundDetail.lastSyncedAt = time
      // 状态查询没有仓库受理时间字段；确认已受理不等于取得该事件的发生时间。
    }
    // 查询失败只补查询原因；保留最后可信状态、时间和数量。未知结果不开放重提。
    else if (result.待核查) { execution.待核查 = true; execution.原因 = result.信息; row.awaitingCheck = true; row.reason = result.信息; row.reasonCode = 'EXTERNAL_RESULT_PENDING_CHECK' }
  }
  row.history.unshift({ time, title: action === '查询结果' ? '同步仓库状态' : action === '截单' ? '截单' : '重新推单', detail: `${before} → ${row.status}；${result.信息}；操作者：当前用户` })
  row.attempts.unshift({ id: `ATT-${row.id}-${row.attempts.length + 1}`, time, action, result: result.成功 ? '成功' : '失败', reason: result.信息 })
  return { success: result.成功, reason: result.信息 }
}
