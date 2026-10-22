import type { 全渠道订单 } from '../全渠道订单/类型'
import type { AgingRecord } from '../三方仓库龄/库龄模型'
import type { 渠道配置 } from '../仓配管理/物流渠道配置'
import { 分仓仓库键, 读取分仓候选, 校验分仓路由, 检查分仓剩余库存, 读取分仓策略, type 分仓路由动作 } from './规则路由'
import type { 订单规则 } from './规则逻辑'
import { 计算综合库龄, type 综合库龄明细 } from './综合库龄比较'

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
export interface 库龄比较项 { route: 渠道配置; ageDays: string; ageDetails: 综合库龄明细[]; snapshotDate: string }
export const 库龄分仓说明 = '按所选批次取法取得每个 SKU 的来源库龄，多 SKU 累加比较，不乘商品件数；优先分配综合库龄最高的仓库。'

/** 只读候选排序，不分配批次、不扣减库存，也不把快照在库量当成实时可用量。 */
export function 计算库龄分仓(规则: 订单规则, 订单: 全渠道订单, 渠道: readonly 渠道配置[], 资料: readonly 候选库龄资料[] = []) {
  const gates: string[] = [], ranked: 库龄比较项[] = [], skipped: 渠道配置[] = []
  const 路由错误 = 校验分仓路由(规则, 渠道)
  if (路由错误) return { ranked, skipped, gates: [路由错误], route: undefined }
  if (!订单.items.length || 订单.items.some(项 => 项.skuResolutionStatus !== '成功' || !项.systemSku?.trim())) return { ranked, skipped, gates: ['订单SKU映射未完整识别，无法匹配库龄'], route: undefined }
  const 订单SKU = [...new Set(订单.items.map(项 => 项.systemSku!))]
  const 候选 = 读取分仓候选(规则, 渠道)
  const 取法 = (读取分仓策略(规则) as { ageBatchPreference?: 'recent' | 'all' }).ageBatchPreference ?? 'all'
  if (!['recent', 'all'].includes(取法)) return { ranked, skipped, gates: ['请选择有效的库龄批次取法'], route: undefined }
  const 待比较: 渠道配置[] = []
  for (const 仓 of 候选) {
    const 来源列表 = 资料.filter(项 => 分仓仓库键(项.scope) === 分仓仓库键(仓))
    if (来源列表.length !== 1) { gates.push(`${仓.warehouse}：未取得唯一的库龄来源资料`); continue }
    const 来源 = 来源列表[0]!
    if (读取分仓策略(规则).checkRemainingStock) {
      const 库存项 = 订单SKU.map(sku => 来源.remainingStock?.filter(项 => 项.systemSku === sku) ?? [])
      const 检测 = 检查分仓剩余库存(规则, 库存项.every(项 => 项.length === 1) ? 库存项.map(项 => 项[0]!.quantity) : undefined)
      if (检测 === 'unknown') { gates.push(`${仓.warehouse}：未取得完整的分仓后剩余可用库存，无法判断是否跳过该仓库`); continue }
      if (检测 === 'skip') { skipped.push(仓); continue }
    }
    待比较.push(仓)
  }
  const 库龄 = 计算综合库龄(订单, 待比较, 资料, 取法)
  gates.push(...库龄.gates)
  const 按仓库 = new Map(库龄.summaries.map(项 => [项.warehouseKey, 项]))
  for (const 仓 of 待比较) {
    const 汇总 = 按仓库.get(分仓仓库键(仓))
    if (汇总) ranked.push({ route: 仓, ageDays: 汇总.ageDays, ageDetails: 汇总.ageDetails, snapshotDate: 汇总.ageDetails[0]!.snapshotDate })
  }
  if (skipped.length === 候选.length && 候选.length) gates.push('所有候选仓库的分仓后剩余库存均不满足要求，未分配仓库')
  // 稳定排序使同龄仓按用户配置顺序排列；任一候选资料未知则不宣称已找到全局最长。
  ranked.sort((a, b) => BigInt(a.ageDays) > BigInt(b.ageDays) ? -1 : BigInt(a.ageDays) < BigInt(b.ageDays) ? 1 : 0)
  return { ranked, skipped, gates, route: gates.length ? undefined : ranked[0]?.route }
}
