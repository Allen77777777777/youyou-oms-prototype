import { ref, watch } from 'vue'
import { 共享订单, 仓库执行记录, 核查演示仓库结果 } from '../订单处理/演示会话'
import { 创建仓配样例, 取得操作拦截, 执行样例动作, 演示时间, 仓储服务商, type 仓配单据, type 作业动作, type 物流渠道 } from './仓配模型'

export const 仓库会话单据 = ref<仓配单据[]>(创建仓配样例('仓库'))
export const 物流会话单据 = ref<仓配单据[]>(创建仓配样例('物流'))
export const 渠道会话 = ref<物流渠道[]>(仓储服务商.flatMap((p, i) => [0, 1].map(n => ({ id: `channel-${i}-${n}`, name: `${p} · ${n ? '经济配送' : '标准配送'}`, code: `DEMO_WH_${i + 1}_${n + 1}`, provider: p, account: `演示账号 ${String(i % 3 + 1).padStart(2, '0')}`, warehouse: n ? '美东演示仓' : '美西演示仓', providerCode: `DEMO-SERVICE-${n + 1}`, countries: n ? ['US'] : ['US', 'CA'], enabled: i !== 4 || n === 0, labelMode: '仓库回传', updatedAt: '2026-09-12 09:00:00' }))))
export const 渠道会话审计 = ref<Array<{ code: string; action: string; time: string; detail: string }>>([])

function 标准时间(time: string) {
  const date = new Date(time.replace(' UTC+8', '+08:00').replace(' UTC', 'Z').replace(' ', 'T'))
  return Number.isNaN(date.getTime()) ? time : new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(date)
}
function 同步共享执行() {
  for (const 执行 of 仓库执行记录.value) {
    const order = 共享订单.value.find(o => o.systemOrderNo === 执行.订单号[0])
    const fulfillment = order?.fulfillmentOrders.find(f => f.fulfillmentOrderNo === 执行.履约单号)
    const id = `shared-${执行.履约单号}`
    const existing = 仓库会话单据.value.find(row => row.id === id)
    const row: 仓配单据 = {
      id, kind: '仓库', no: 执行.出库单号, fulfillment: 执行.履约单号, order: 执行.订单号.join('、'),
      provider: fulfillment?.route.warehouseProvider || '待补充', warehouse: fulfillment?.route.warehouse || '待补充', account: fulfillment?.route.warehouseAccount || '待补充', channel: fulfillment?.route.shippingChannel || '待补充', channelCode: fulfillment?.route.shippingChannelCode || '待补充', platform: order?.platformCode || '待补充',
      status: 执行.状态, labelMode: fulfillment?.route.labelMode === '仓配一体' ? '仓库回传' : '仓配分离 · 面单来源待核验', externalNo: 执行.外部仓库单号 || '', tracking: fulfillment?.trackingNumber || '', createdAt: existing?.createdAt || 标准时间(执行.更新时间), updatedAt: 标准时间(执行.更新时间),
      planned: fulfillment?.plannedQuantity || 0, shipped: fulfillment?.shippedQuantity || 0, sku: order?.items.map(i => i.systemSku || '未识别').join('、') || '待补充', goods: order?.items.map(i => i.systemItemName || '演示商品').join('、') || '待补充', country: order?.address.countryCode || '待补充',
      reason: 执行.原因, reasonCode: 执行.待核查 ? 'EXTERNAL_RESULT_PENDING_CHECK' : 执行.原因 ? 'DEMO_SHARED_EXECUTION_BLOCKED' : '', awaitingCheck: 执行.待核查,
      blocker: 执行.状态 === '下单失败' ? '账号开通/映射修复由现有中台及接入支持处理，原型未接入修复回执；当前保持阻断，可使用独立明确失败样例评审重提流程' : '',
      history: existing?.history || [{ time: 标准时间(执行.更新时间), title: `订单处理关联 · ${执行.状态}`, detail: `来自共享履约执行 ${执行.履约单号}；订单处理、全渠道详情与仓配工作台读取同一演示事实。` }],
      attempts: existing?.attempts || [],
    }
    if (existing) Object.assign(existing, row)
    else 仓库会话单据.value.unshift(row)
  }
}
watch([仓库执行记录, 共享订单], 同步共享执行, { deep: true, immediate: true })

export function 仓配会话操作拦截(row: 仓配单据, action: 作业动作): string { return 取得操作拦截(row, action) }
export function 执行仓配会话动作(row: 仓配单据, action: 作业动作): { success: boolean; reason: string } {
  if (!row.id.startsWith('shared-')) return 执行样例动作(row, action)
  const blocker = 仓配会话操作拦截(row, action)
  if (blocker) return { success: false, reason: blocker }
  if (action !== '查询结果') return { success: false, reason: '请先修复原仓库请求的前置条件，再从订单处理发起受控操作' }
  const before = row.status
  const result = 核查演示仓库结果(row.fulfillment)
  同步共享执行()
  const time = 演示时间()
  row.history.unshift({ time, title: '演示操作 · 查询结果', detail: `${before} → ${row.status}；${result.信息}；操作者：演示操作员` })
  row.attempts.unshift({ id: `DEMO-SHARED-ATT-${row.id}-${row.attempts.length + 1}`, time, action, result: result.成功 ? '成功' : '失败', reason: result.信息 })
  return { success: result.成功, reason: result.信息 }
}
