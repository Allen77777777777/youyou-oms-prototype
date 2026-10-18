import type { 全渠道订单 } from '../全渠道订单/类型'
import { isValidAge, isValidQuantity, type AgingRecord } from '../三方仓库龄/库龄模型'
import type { 渠道配置 } from '../仓配管理/物流渠道配置'
import { 分仓仓库键, 读取分仓候选, 校验分仓路由, 检查分仓剩余库存, 读取分仓策略, type 分仓路由动作 } from './规则路由'
import type { 订单规则 } from './规则逻辑'

/** 由现有中台资料按稳定身份关联后的只读来源范围，不从仓库名称猜关联。 */
export interface 候选库龄资料 {
  scope: Pick<分仓路由动作, 'providerId' | 'accountId' | 'warehouseId'>
  organization: string
  sourceCustomer: string
  snapshotDate: string
  records: readonly AgingRecord[]
  /** 现有库存能力按订单、SKU和同一来源范围核实的分配后数量，不能使用库龄快照数量代替。 */
  remainingStock?: readonly { systemSku: string; quantity: string }[]
}
export interface 库龄比较项 { route: 渠道配置; ageDays: number; systemSku: string; recordId: string; snapshotDate: string }
export const 库龄分仓说明 = '在所选发货仓内匹配订单 SKU 的库龄，优先分配 SKU 库龄最长的仓库。订单包含多个 SKU 时，取其中最大的库龄进行匹配。'

/** 只读候选排序，不分配批次、不扣减库存，也不把快照在库量当成实时可用量。 */
export function 计算库龄分仓(规则: 订单规则, 订单: 全渠道订单, 渠道: readonly 渠道配置[], 资料: readonly 候选库龄资料[] = []) {
  const gates: string[] = [], ranked: 库龄比较项[] = [], skipped: 渠道配置[] = []
  const 路由错误 = 校验分仓路由(规则, 渠道)
  if (路由错误) return { ranked, skipped, gates: [路由错误], route: undefined }
  if (!订单.items.length || 订单.items.some(项 => 项.skuResolutionStatus !== '成功' || !项.systemSku?.trim())) return { ranked, skipped, gates: ['订单SKU映射未完整识别，无法匹配库龄'], route: undefined }
  const 订单SKU = [...new Set(订单.items.map(项 => 项.systemSku!))]
  const 候选 = 读取分仓候选(规则, 渠道)
  const 日期 = new Set<string>(), 组织 = new Set<string>()
  for (const 仓 of 候选) {
    const 来源列表 = 资料.filter(项 => 分仓仓库键(项.scope) === 分仓仓库键(仓))
    if (来源列表.length !== 1) { gates.push(`${仓.warehouse}：未取得唯一的库龄来源资料`); continue }
    const 来源 = 来源列表[0]!
    if (!来源.organization || !来源.sourceCustomer || !/^\d{4}-\d{2}-\d{2}$/.test(来源.snapshotDate)) { gates.push(`${仓.warehouse}：库龄归属或快照日期未核实`); continue }
    if (读取分仓策略(规则).checkRemainingStock) {
      const 库存项 = 订单SKU.map(sku => 来源.remainingStock?.filter(项 => 项.systemSku === sku) ?? [])
      const 检测 = 检查分仓剩余库存(规则, 库存项.every(项 => 项.length === 1) ? 库存项.map(项 => 项[0]!.quantity) : undefined)
      if (检测 === 'unknown') { gates.push(`${仓.warehouse}：未取得完整的分仓后剩余可用库存，无法判断是否跳过该仓库`); continue }
      if (检测 === 'skip') { skipped.push(仓); continue }
    }
    日期.add(来源.snapshotDate); 组织.add(来源.organization)
    const 同范围 = 来源.records.filter(项 => 项.provider === 仓.provider && 项.accountId === 仓.accountId && 项.warehouseId === 仓.warehouseId && 项.organization === 来源.organization && 项.sourceCustomer === 来源.sourceCustomer && 项.snapshotDate === 来源.snapshotDate && 订单SKU.includes(项.systemSku))
    const 可比较: AgingRecord[] = []
    let 未知 = false
    for (const sku of 订单SKU) {
      const 明细 = 同范围.filter(项 => 项.systemSku === sku && 项.quality !== '不良品')
      const 仓库SKU = new Set(明细.map(项 => 项.warehouseSku)), 单位 = new Set(明细.map(项 => 项.unit))
      if (!明细.length || 仓库SKU.size !== 1 || 单位.size !== 1 || new Set(明细.map(项 => 项.id)).size !== 明细.length || 明细.some(项 => !项.warehouseSku || !项.unit || 项.quality !== '良品' || 项.mapping !== '已映射' || 项.summaryBlocked || 项.issues.length || !isValidAge(项.agingDays) || !isValidQuantity(项.onHandQty))) {
        gates.push(`${仓.warehouse}：SKU ${sku} 的库龄资料缺失或待核验`); 未知 = true; continue
      }
      // 排除没有在库数量的历史批次；不累加快照数量作为订单可用库存。
      const 有库存明细 = 明细.filter(项 => /[1-9]/.test(项.onHandQty!))
      if (!有库存明细.length) { gates.push(`${仓.warehouse}：SKU ${sku} 无有货的库龄明细`); 未知 = true; continue }
      可比较.push(...有库存明细)
    }
    if (未知) continue
    const 最长 = 可比较.reduce((a, b) => a.agingDays! >= b.agingDays! ? a : b)
    ranked.push({ route: 仓, ageDays: 最长.agingDays!, systemSku: 最长.systemSku, recordId: 最长.id, snapshotDate: 来源.snapshotDate })
  }
  if (日期.size > 1) gates.push('候选仓库的库龄快照日期不一致，需取得同一日期资料后比较')
  if (组织.size > 1) gates.push('候选仓库的库龄资料跨组织，请核验订单归属')
  if (skipped.length === 候选.length && 候选.length) gates.push('所有候选仓库的分仓后剩余库存均不满足要求，未分配仓库')
  // 稳定排序使同龄仓按用户配置顺序排列；任一候选资料未知则不宣称已找到全局最长。
  ranked.sort((a, b) => b.ageDays - a.ageDays)
  return { ranked, skipped, gates, route: gates.length ? undefined : ranked[0]?.route }
}
