import type { 全渠道订单 } from '../全渠道订单/类型'
import { isValidAge, isValidQuantity } from '../三方仓库龄/库龄模型'
import type { 渠道配置 } from '../仓配管理/物流渠道配置'
import type { 候选库龄资料 } from './库龄分仓'
import { 分仓仓库键 } from './规则路由'

export interface 综合库龄明细 {
  systemSku: string
  warehouseSku: string
  unit: string
  ageDays: string
  recordIds: string[]
  selectedRecordIds: string[]
  snapshotDate: string
  organization: string
  sourceCustomer: string
}
export interface 综合库龄汇总 {
  warehouseKey: string
  ageDays: string
  ageDetails: 综合库龄明细[]
}

function 有效日期(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const timestamp = Date.parse(`${value}T00:00:00Z`)
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value
}

/**
 * 纯库龄分仓与综合比价共用的只读库龄指标；逐 SKU 取值后累加。
 * 最近批次采用来源最小库龄是本轮实现方案，不根据日期反算天数。
 * 多 SKU 每个系统 SKU 只计一次，不乘件数；同仓不同渠道共享同一份只读来源。
 */
export function 计算综合库龄(
  订单: 全渠道订单,
  候选: readonly 渠道配置[],
  资料: readonly 候选库龄资料[],
  取法: 'recent' | 'all',
) {
  const summaries: 综合库龄汇总[] = [], gates: string[] = []
  if (!['recent', 'all'].includes(取法)) return { summaries, gates: ['请选择有效的综合库龄取法'] }
  if (!订单.items.length || 订单.items.some(项 => 项.skuResolutionStatus !== '成功' || !项.systemSku?.trim())) return { summaries, gates: ['订单SKU映射未完整识别，无法比较综合库龄'] }
  const 订单SKU = [...new Set(订单.items.map(项 => 项.systemSku!))]
  const 日期 = new Set<string>(), 组织 = new Set<string>()
  const 已检查仓库 = new Set<string>()
  for (const 仓 of 候选) {
    const warehouseKey = 分仓仓库键(仓)
    if (已检查仓库.has(warehouseKey)) continue
    已检查仓库.add(warehouseKey)
    const 来源列表 = 资料.filter(项 => 分仓仓库键(项.scope) === warehouseKey)
    if (来源列表.length !== 1) { gates.push(`${仓.warehouse}：未取得唯一的综合库龄来源资料`); continue }
    const 来源 = 来源列表[0]!
    if (!来源.organization?.trim() || !来源.sourceCustomer?.trim() || !有效日期(来源.snapshotDate) || !Array.isArray(来源.records)) { gates.push(`${仓.warehouse}：综合库龄归属或快照日期未核实`); continue }
    日期.add(来源.snapshotDate); 组织.add(来源.organization)
    const 同范围 = 来源.records.filter(项 => 项.provider === 仓.provider && 项.accountId === 仓.accountId && 项.warehouseId === 仓.warehouseId && 项.organization === 来源.organization && 项.sourceCustomer === 来源.sourceCustomer && 项.snapshotDate === 来源.snapshotDate && 订单SKU.includes(项.systemSku))
    // 来源身份必须在本仓整个比较范围内唯一，不能让同一来源行被两个 SKU 重复计入。
    const 有货来源 = 同范围.filter(项 => 项.quality !== '不良品' && (!isValidQuantity(项.onHandQty) || /[1-9]/.test(项.onHandQty)))
    if (new Set(有货来源.map(项 => 项.id)).size !== 有货来源.length) { gates.push(`${仓.warehouse}：库龄来源身份重复，资料缺失或待核验`); continue }
    const ageDetails: 综合库龄明细[] = []
    let 未知 = false, total = 0n
    for (const sku of 订单SKU) {
      // 已核实不良品和明确零库存的历史行不参与；未知数量仍保留并阻断，不能当成零。
      const 明细 = 有货来源.filter(项 => 项.systemSku === sku)
      const 仓库SKU = new Set(明细.map(项 => 项.warehouseSku)), 单位 = new Set(明细.map(项 => 项.unit))
      if (!明细.length || 仓库SKU.size !== 1 || 单位.size !== 1 || new Set(明细.map(项 => 项.id)).size !== 明细.length || 明细.some(项 => !项.id?.trim() || !项.warehouseSku?.trim() || !项.unit?.trim() || 项.quality !== '良品' || 项.mapping !== '已映射' || 项.summaryBlocked || !Array.isArray(项.issues) || 项.issues.length || !isValidAge(项.agingDays) || !isValidQuantity(项.onHandQty))) {
        gates.push(`${仓.warehouse}：SKU ${sku} 的综合库龄资料缺失或待核验`); 未知 = true; continue
      }
      const 选中库龄 = 明细.reduce((value, 项) => 取法 === 'recent' ? Math.min(value, 项.agingDays!) : Math.max(value, 项.agingDays!), 明细[0]!.agingDays!)
      const ageDays = String(选中库龄)
      total += BigInt(选中库龄)
      ageDetails.push({ systemSku: sku, warehouseSku: 明细[0]!.warehouseSku, unit: 明细[0]!.unit, ageDays,
        recordIds: 明细.map(项 => 项.id), selectedRecordIds: 明细.filter(项 => 项.agingDays === 选中库龄).map(项 => 项.id),
        snapshotDate: 来源.snapshotDate, organization: 来源.organization, sourceCustomer: 来源.sourceCustomer })
    }
    if (!未知) summaries.push({ warehouseKey, ageDays: String(total), ageDetails })
  }
  if (日期.size > 1) gates.push('综合库龄候选仓库的快照日期不一致，需取得同一日期资料后比较')
  if (组织.size > 1) gates.push('综合库龄候选仓库的来源跨组织，请核验订单归属')
  return { summaries, gates }
}
