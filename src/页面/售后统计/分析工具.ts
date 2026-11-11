import { costEvidenceLedger, detailRecords, formatMinor, parseMinor, parseTime } from './模型'
import type { AfterSaleItem, AfterSaleRecord, CostEvidence, CostKind, DataSet, ExecutionEvidence, MoneyTotal, StatisticsFilter } from './类型'

export const reasonCategories = ['全部', '产品相关', '描述相关', '履约物流', '买家意愿', '业务处理', '待归类'] as const
export type ReasonCategory = typeof reasonCategories[number]
type ClassifiedReason = Exclude<ReasonCategory, '全部'>

/** 仅为统计分析映射，原始原因原文保持在单据上；分类不代表责任认定。 */
const reasonCategoryMap: Record<string, ClassifiedReason> = {
  '质量问题': '产品相关', '功能异常': '产品相关', '缺少配件': '产品相关', '少配件': '产品相关',
  '不合适': '产品相关', '尺寸不合适': '产品相关',
  '描述不符': '描述相关', '商品与描述不符': '描述相关',
  '未收到': '履约物流', '未收到商品': '履约物流', '破损': '履约物流', '运输破损': '履约物流',
  '分开发货': '履约物流', '发错货': '履约物流', '发错商品': '履约物流', '缺货': '履约物流',
  '少件': '履约物流', '仓库退回': '履约物流', '派送失败退回了': '履约物流',
  '客户抱怨物流问题': '履约物流', '物流延误': '履约物流',
  '无理由退货': '买家意愿', '买家改变主意': '买家意愿', '客户误下单': '买家意愿',
  '客户要取消': '买家意愿', '运费太贵': '买家意愿',
  '平台退款': '业务处理', '买家平台退款': '业务处理', '退快递费': '业务处理',
  '退差价': '业务处理', '退货已签收': '业务处理', '修改好评': '业务处理',
  '未授权付款': '待归类', '问题待归类': '待归类',
}
export function getReasonCategory(raw: string): ClassifiedReason { return reasonCategoryMap[raw.trim()] ?? '待归类' }

export interface ReasonSkuRow { sku: string; title: string; count: number; recordIds: string[] }
export interface ReasonRow {
  name: string; category: ClassifiedReason; count: number; orderCount: number; skuCount: number; pendingCount: number
  recordIds: string[]; skus: ReasonSkuRow[]; confirmedCosts: MoneyTotal[]
}
const unique = (values: string[]) => [...new Set(values)]
const identity = (...values: string[]) => JSON.stringify(values)
const nonEmpty = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0
function currentSelection(data: DataSet, records: AfterSaleRecord[]): AfterSaleRecord[] {
  return detailRecords(data, unique(records.map(row => row.internalId)))
}
function matchesItem(item: AfterSaleItem, sku: string): boolean {
  return !sku || (sku === '__unknown__' ? !item.sku || item.linkage !== 'verified' : item.sku === sku)
}

export function buildReasonRows(data: DataSet, records: AfterSaleRecord[], category: ReasonCategory = '全部', sku = ''): ReasonRow[] {
  const selectedSku = sku.trim(), groups = new Map<string, { record: AfterSaleRecord; item: AfterSaleItem }[]>()
  const selected = currentSelection(data, records)
  for (const record of selected) for (const item of record.items) {
    if (!matchesItem(item, selectedSku)) continue
    const name = item.problem || '问题待归类'
    if (category !== '全部' && getReasonCategory(name) !== category) continue
    const entries = groups.get(name) ?? []; entries.push({ record, item }); groups.set(name, entries)
  }
  // 分析筛选只能改变可见分组，不能隐藏同笔凭证关联的其他商品／单据来制造唯一归因。
  const completeLedger = new Map(costEvidenceLedger(data).map(entry => [identity(entry.shopId, entry.cost.evidenceId), entry]))
  const allCurrent = detailRecords(data, unique(data.records.map(row => row.internalId)))
  const attributable = new Map<string, Map<string, { value: bigint; count: number; components: { value: string; currency: string }[] }>>()
  for (const cost of collectCostEvidence(data, selected, selectedSku)) {
    if (cost.status !== 'confirmed' || cost.kind === '费用回收') continue
    const full = completeLedger.get(cost.key)
    if (!full) continue
    const references = allCurrent.filter(row => row.shopId === cost.shopId && full.recordIds.includes(row.internalId))
    if (!references.length || references.some(row => !row.items.length)) continue
    const rawReasons = unique(references.flatMap(row => row.items.map(item => item.problem)))
    if (rawReasons.length !== 1 || !rawReasons[0]?.trim() || rawReasons[0] === '问题待归类' || !groups.has(rawReasons[0])) continue
    // 选择SKU后只能采用已完整核实的该SKU份额；整单凭证不能作为该商品的成本。
    const value = selectedSku ? cost.allocationValid ? cost.allocatedValue : null : cost.value
    if (value === null) continue
    const byCurrency = attributable.get(rawReasons[0]) ?? new Map<string, { value: bigint; count: number; components: { value: string; currency: string }[] }>()
    const total = byCurrency.get(cost.currency) ?? { value: 0n, count: 0, components: [] }
    total.value += parseMinor(value, cost.currency)!; total.count++; total.components.push({ value, currency: cost.currency })
    byCurrency.set(cost.currency, total); attributable.set(rawReasons[0], byCurrency)
  }
  return [...groups].map(([name, entries]) => {
    const rows = [...new Map(entries.map(entry => [entry.record.internalId, entry.record])).values()]
    const products = new Map<string, typeof entries>()
    for (const entry of entries) if (entry.item.linkage === 'verified' && entry.item.sku) {
      const members = products.get(entry.item.sku) ?? []; members.push(entry); products.set(entry.item.sku, members)
    }
    const skus = [...products].map(([productSku, members]) => {
      const recordIds = unique(members.map(entry => entry.record.internalId))
      return { sku: productSku, title: members[0]!.item.title, count: recordIds.length, recordIds }
    }).sort((a, b) => b.count - a.count || a.sku.localeCompare(b.sku))
    return { name, category: getReasonCategory(name), count: rows.length,
      orderCount: unique(rows.flatMap(row => row.orderId ? [identity(row.shopId, row.orderId)] : [])).length,
      skuCount: skus.length, pendingCount: rows.filter(row => row.status !== '已完成').length,
      recordIds: rows.map(row => row.internalId), skus,
      confirmedCosts: [...attributable.get(name) ?? []].map(([currency, total]) => ({ currency, value: formatMinor(total.value, currency), evidenceCount: total.count, components: total.components })).sort((a, b) => a.currency.localeCompare(b.currency)) }
  }).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'zh-CN'))
}

export interface CollectedCostEvidence {
  key: string; shopId: string; evidenceId: string; kind: CostKind; currency: string; value: string
  status: 'confirmed' | 'pending'; at: string; source: string; recordIds: string[]
  allocatedValue: string | null; allocationValid: boolean
}
export interface CurrencyRow {
  currency: string; confirmed: string | null; recovery: string | null; pending: string | null
  allocated: string | null; unallocatedCount: number
}

/** 完整分摊必须回到同店、原订单及本次已核实商品行，不凭相同裸行号归属。 */
function allocationValue(data: DataSet, cost: CostEvidence, shopId: string, records: AfterSaleRecord[], sku: string): string | null {
  if (!cost.allocations?.length) return null
  const cutoff = parseTime(data.asOf), total = parseMinor(cost.value, cost.currency), seen = new Set<string>()
  if (cutoff === null || total === null) return null
  let sum = 0n, selected = 0n
  for (const allocation of cost.allocations) {
    const amount = parseMinor(allocation.value, cost.currency)
    if (!allocation.orderLineId || seen.has(allocation.orderLineId) || amount === null || allocation.currency && allocation.currency !== cost.currency) return null
    seen.add(allocation.orderLineId); sum += amount
    const lines = data.orderLines.filter(line => line.shopId === shopId && line.id === allocation.orderLineId && line.valid
      && parseTime(line.createdAt) !== null && parseTime(line.createdAt)! <= cutoff)
    const signatures = new Set(lines.map(line => identity(line.orderId, line.sku ?? '', line.createdAt)))
    if (!lines.length || signatures.size !== 1) return null
    const line = lines[0]!
    const verified = records.some(record => record.shopId === shopId && record.orderId === line.orderId
      && record.items.some(item => item.linkage === 'verified' && item.orderLineId === line.id && !!item.sku && item.sku === line.sku))
    if (!verified) return null
    if (!sku || line.sku === sku) selected += amount
  }
  return sum === total ? formatMinor(selected, cost.currency) : null
}

export function collectCostEvidence(data: DataSet, records: AfterSaleRecord[], sku = ''): CollectedCostEvidence[] {
  const selected = currentSelection(data, records), selectedIds = new Set(selected.map(row => row.internalId))
  const shopIds = new Set(selected.map(row => row.shopId)), current = detailRecords(data, unique(data.records.map(row => row.internalId))).filter(row => shopIds.has(row.shopId))
  const scoped = { ...data, records: current, orderLines: data.orderLines.filter(line => shopIds.has(line.shopId)) }
  if (parseTime(data.asOf) === null) return []
  return costEvidenceLedger(scoped).flatMap(entry => {
    const key = identity(entry.shopId, entry.cost.evidenceId)
    const recordIds = entry.recordIds.filter(id => selectedIds.has(id))
    if (!recordIds.length) return []
    const references = current.filter(row => entry.recordIds.includes(row.internalId))
    const allocatedValue = allocationValue(scoped, entry.cost, entry.shopId, references, sku.trim())
    return [{ key, shopId: entry.shopId, evidenceId: entry.cost.evidenceId, kind: entry.cost.kind, currency: entry.cost.currency,
      value: entry.cost.value, status: entry.cost.status, at: entry.cost.at, source: entry.cost.source,
      recordIds, allocatedValue, allocationValid: allocatedValue !== null }]
  }).sort((a, b) => a.currency.localeCompare(b.currency) || a.kind.localeCompare(b.kind, 'zh-CN') || a.key.localeCompare(b.key))
}

export function buildCurrencyRows(evidence: CollectedCostEvidence[]): CurrencyRow[] {
  const currencies = unique(evidence.map(entry => entry.currency)).sort()
  return currencies.map(currency => {
    const rows = [...new Map(evidence.filter(entry => entry.currency === currency).map(entry => [entry.key, entry])).values()]
    const total = (members: CollectedCostEvidence[], allocated = false): string | null => {
      if (!members.length) return null
      return formatMinor(members.reduce((sum, entry) => sum + parseMinor(allocated ? entry.allocatedValue! : entry.value, currency)!, 0n), currency)
    }
    const confirmed = rows.filter(entry => entry.kind !== '费用回收' && entry.status === 'confirmed')
    return { currency, confirmed: total(confirmed), recovery: total(rows.filter(entry => entry.kind === '费用回收' && entry.status === 'confirmed')),
      pending: total(rows.filter(entry => entry.kind !== '费用回收' && entry.status === 'pending')),
      allocated: total(confirmed.filter(entry => entry.allocationValid && entry.allocatedValue !== null), true),
      unallocatedCount: confirmed.filter(entry => !entry.allocationValid).length }
  })
}

export interface CollectedExecutionEvidence extends ExecutionEvidence { key: string; shopId: string; recordIds: string[] }
export interface ExecutionRow { key: string; kind: ExecutionEvidence['kind']; outcome: ExecutionEvidence['outcome']; count: number; recordIds: string[] }
const executionKinds = ['refund', 'return', 'reship'] as const
const executionOutcomes = ['success', 'pending', 'failed', 'unknown'] as const

export function collectExecutionEvidence(data: DataSet, records: AfterSaleRecord[]): CollectedExecutionEvidence[] {
  const selected = currentSelection(data, records), selectedIds = new Set(selected.map(row => row.internalId)), shops = new Set(selected.map(row => row.shopId))
  const current = detailRecords(data, unique(data.records.map(row => row.internalId))).filter(row => shops.has(row.shopId))
  const cutoff = parseTime(data.asOf), invalid = new Set<string>()
  const groups = new Map<string, { record: AfterSaleRecord; evidence: ExecutionEvidence }[]>()
  if (cutoff === null) return []
  for (const record of current) for (const evidence of record.results ?? []) {
    if (!evidence.id) continue
    const key = identity(record.shopId, evidence.id), at = parseTime(evidence.at)
    if (at !== null && at > cutoff) continue
    if (at === null || !executionKinds.includes(evidence.kind) || !executionOutcomes.includes(evidence.outcome)
      || !nonEmpty(evidence.source) || !nonEmpty(evidence.reference)) { invalid.add(key); continue }
    const entries = groups.get(key) ?? []; entries.push({ record, evidence }); groups.set(key, entries)
  }
  return [...groups].flatMap(([key, entries]) => {
    if (invalid.has(key) || new Set(entries.map(({ evidence }) => identity(evidence.kind, evidence.outcome, evidence.at, evidence.source, evidence.reference))).size !== 1) return []
    const recordIds = unique(entries.map(entry => entry.record.internalId)).filter(id => selectedIds.has(id))
    if (!recordIds.length) return []
    return [{ ...entries[0]!.evidence, key, shopId: entries[0]!.record.shopId, recordIds }]
  }).sort((a, b) => a.kind.localeCompare(b.kind) || a.outcome.localeCompare(b.outcome) || a.key.localeCompare(b.key))
}

export function buildExecutionRows(data: DataSet, records: AfterSaleRecord[]): ExecutionRow[] {
  const evidence = collectExecutionEvidence(data, records)
  return executionKinds.flatMap(kind => executionOutcomes.map(outcome => {
    const entries = evidence.filter(entry => entry.kind === kind && entry.outcome === outcome)
    return { key: identity(kind, outcome), kind, outcome, count: entries.length, recordIds: unique(entries.flatMap(entry => entry.recordIds)) }
  }))
}

export interface BacklogAgeRow { label: string; count: number; recordIds: string[] }
export interface BacklogResult { records: AfterSaleRecord[]; allIds: string[]; overdueIds: string[]; unownedIds: string[]; ageRows: BacklogAgeRow[] }
export function buildBacklog(data: DataSet, filter: StatisticsFilter): BacklogResult {
  const cutoff = parseTime(data.asOf), selectedSku = filter.sku.trim()
  const records = cutoff === null ? [] : detailRecords(data, unique(data.records.map(row => row.internalId))).filter(row => row.status !== '已完成'
    && (!filter.shopIds.length || filter.shopIds.includes(row.shopId)) && (!filter.origins.length || filter.origins.includes(row.origin))
    && (!filter.scenarios.length || filter.scenarios.includes(row.scenario)) && (!filter.methods.length || filter.methods.includes(row.method))
    && (!selectedSku || row.items.some(item => matchesItem(item, selectedSku))))
    .sort((a, b) => parseTime(a.createdAt)! - parseTime(b.createdAt)! || a.internalId.localeCompare(b.internalId))
  const ageRows: BacklogAgeRow[] = ['0～2天', '3～7天', '8～15天', '16～30天', '31天及以上', '时间待核实'].map(label => ({ label, count: 0, recordIds: [] }))
  for (const row of records) {
    const created = parseTime(row.createdAt), age = created !== null && cutoff !== null ? Math.floor((cutoff - created) / 86400000) : null
    const index = age === null || age < 0 ? 5 : age <= 2 ? 0 : age <= 7 ? 1 : age <= 15 ? 2 : age <= 30 ? 3 : 4
    ageRows[index]!.recordIds.push(row.internalId); ageRows[index]!.count++
  }
  return { records, allIds: records.map(row => row.internalId),
    overdueIds: records.filter(row => parseTime(row.dueAt) !== null && parseTime(row.dueAt)! < cutoff!).map(row => row.internalId),
    unownedIds: records.filter(row => !row.ownerId?.trim()).map(row => row.internalId), ageRows }
}
