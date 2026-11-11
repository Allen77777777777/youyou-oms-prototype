import type { AfterSaleRecord, CostEvidence, CostRow, DataSet, GroupRow, HandlingRow, MoneyTotal, OrderLine, ProblemRow, SkuRow, StatisticsFilter, StatisticsResult, Summary } from './类型'
import { costKinds } from './类型'

const DAY = 86400000
const OBSERVATION_DAYS = 30
const UNKNOWN = '__unknown__'
const currencyDigits: Record<string, number> = { USD: 2, GBP: 2, EUR: 2, CNY: 2, AUD: 2, CAD: 2, JPY: 0, KRW: 0 }
export function createDefaultFilter(): StatisticsFilter {
  return { startDate: '2026-10-01', endDate: '2026-10-31', shopIds: [], origins: [], scenarios: [], methods: [], sku: '', cohortStartDate: '2026-09-01', cohortEndDate: '2026-09-30' }
}
/** 不猜时区，拒绝日期滚动、24时、未知偏移和不合法偏移。 */
export function parseTime(value?: string | null): number | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value) || value.endsWith('-00:00')) return null
  const date = value.slice(0, 10), calendar = Date.parse(date + 'T00:00:00Z')
  if (!Number.isFinite(calendar) || new Date(calendar).toISOString().slice(0, 10) !== date || Number(value.slice(11, 13)) > 23 || Number(value.slice(14, 16)) > 59 || Number(value.slice(17, 19)) > 59) return null
  if (!value.endsWith('Z')) { const offset = value.slice(-5); if (Number(offset.slice(0, 2)) > 14 || Number(offset.slice(3)) > 59 || Number(offset.slice(0, 2)) === 14 && Number(offset.slice(3)) !== 0) return null }
  const result = Date.parse(value)
  return Number.isFinite(result) ? result : null
}
function dayStart(value: string): number | null { return /^\d{4}-\d{2}-\d{2}$/.test(value) ? parseTime(value + 'T00:00:00+08:00') : null }
function range(start: string, end: string): [number, number] | null {
  const a = dayStart(start), b = dayStart(end)
  return a !== null && b !== null && a <= b ? [a, b + DAY] : null
}
export function beijingDate(value: string): string { const time = parseTime(value); return time === null ? '' : new Date(time + 8 * 3600000).toISOString().slice(0, 10) }
export function parseMinor(value: string, currency: string): bigint | null {
  const digits = currencyDigits[currency]
  if (digits === undefined || !/^\d+(?:\.\d+)?$/.test(value)) return null
  const [whole = '', fraction = ''] = value.split('.')
  if (fraction.length > digits) return null
  return BigInt(whole) * 10n ** BigInt(digits) + BigInt(fraction.padEnd(digits, '0') || '0')
}
export function formatMinor(value: bigint, currency: string): string {
  const digits = currencyDigits[currency] ?? 2, negative = value < 0n, absolute = negative ? -value : value, base = 10n ** BigInt(digits)
  return (negative ? '-' : '') + (absolute / base).toString() + (digits ? '.' + (absolute % base).toString().padStart(digits, '0') : '')
}
export function formatMoney(value: string | null | undefined, currency?: string): string { return value === null || value === undefined ? '—' : (currency ? currency + ' ' : '') + value }
export function formatDuration(hours: number | null | undefined): string {
  if (hours === null || hours === undefined || !Number.isFinite(hours)) return '—'
  if (hours < 1) return Math.round(hours * 60) + ' 分钟'
  return hours.toFixed(1) + ' 小时'
}
const uniq = (values: string[]) => [...new Set(values)]
const key = (...values: (string | undefined)[]) => JSON.stringify(values)
const validAt = (value: string | undefined, cutoff: number) => { const time = parseTime(value); return time !== null && time <= cutoff }
function allRecords(data: DataSet, issues: string[] = []): AfterSaleRecord[] {
  const groups = new Map<string, AfterSaleRecord[]>(), cutoff = parseTime(data.asOf) ?? -Infinity
  for (const record of data.records) {
    if (!record.internalId || !validAt(record.createdAt, cutoff)) { issues.push('售后单身份或创建时间待核实：' + record.no); continue }
    const updatedAt = parseTime(record.updatedAt)
    if (updatedAt === null || updatedAt < parseTime(record.createdAt)!) { issues.push('售后单快照时间待核实：' + record.no); continue }
    if (updatedAt > cutoff) continue
    const group = groups.get(record.internalId) ?? []; group.push(record); groups.set(record.internalId, group)
  }
  return [...groups.values()].flatMap(group => {
    if (new Set(group.map(row => key(row.shopId, row.orderId, row.no, row.createdAt))).size > 1) { issues.push('同一售后单身份冲突：' + group[0]!.no); return [] }
    return [...group].sort((a, b) => (parseTime(b.updatedAt) ?? 0) - (parseTime(a.updatedAt) ?? 0)).slice(0, 1)
  })
}
function matches(record: AfterSaleRecord, filter: StatisticsFilter): boolean {
  const sku = filter.sku.trim()
  return (!filter.shopIds.length || filter.shopIds.includes(record.shopId)) && (!filter.origins.length || filter.origins.includes(record.origin))
    && (!filter.scenarios.length || filter.scenarios.includes(record.scenario)) && (!filter.methods.length || filter.methods.includes(record.method))
    && (!sku || record.items.some(item => sku === UNKNOWN ? !item.sku || item.linkage !== 'verified' : item.sku === sku))
}
export function recordsForFilter(data: DataSet, filter: StatisticsFilter): AfterSaleRecord[] {
  const dates = range(filter.startDate, filter.endDate)
  if (!dates) return []
  return allRecords(data).filter(record => matches(record, filter) && parseTime(record.createdAt)! >= dates[0] && parseTime(record.createdAt)! < dates[1])
    .sort((a, b) => parseTime(b.createdAt)! - parseTime(a.createdAt)! || a.internalId.localeCompare(b.internalId))
}
export function detailRecords(data: DataSet, recordIds: string[]): AfterSaleRecord[] { const ids = new Set(recordIds); return allRecords(data).filter(record => ids.has(record.internalId)) }
export function orderLineKey(shopId: string, id: string): string { return key(shopId, id) }
function allOrderLines(data: DataSet): OrderLine[] {
  const cutoff = parseTime(data.asOf) ?? -Infinity
  return [...new Map(data.orderLines.filter(line => line.valid && !!line.id && !!line.shopId && validAt(line.createdAt, cutoff))
    .map(line => [orderLineKey(line.shopId, line.id), line])).values()]
}
/** 与分母使用同一有效行去重集合，不从裸商品行ID跨店匹配。 */
export function detailOrderLines(data: DataSet, lineIds: string[]): OrderLine[] {
  const ids = new Set(lineIds)
  return allOrderLines(data).filter(line => ids.has(orderLineKey(line.shopId, line.id)))
}
function groupRows(records: AfterSaleRecord[], identity: (record: AfterSaleRecord) => string, name = (id: string) => id): GroupRow[] {
  const groups = new Map<string, AfterSaleRecord[]>()
  for (const row of records) { const id = identity(row), group = groups.get(id) ?? []; group.push(row); groups.set(id, group) }
  return [...groups].map(([id, rows]) => ({ key: id, name: name(id), count: rows.length,
    orderCount: uniq(rows.flatMap(row => row.orderId ? [key(row.shopId, row.orderId)] : [])).length,
    customerCount: uniq(rows.flatMap(row => row.customerId ? [key(row.shopId, row.customerId)] : [])).length,
    completedCount: rows.filter(row => row.status === '已完成').length, pendingCount: rows.filter(row => row.status !== '已完成').length,
    recordIds: rows.map(row => row.internalId) })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'zh-CN'))
}
export interface Evidence { cost: CostEvidence; shopId: string; recordIds: string[] }
function evidenceLedger(data: DataSet, issues: string[]): Evidence[] {
  const groups = new Map<string, Evidence[]>(), invalid = new Set<string>(), cutoff = parseTime(data.asOf) ?? -Infinity
  for (const record of allRecords(data)) for (const cost of record.costs) {
    const id = key(record.shopId, cost.evidenceId), at = parseTime(cost.at)
    // 未来版本不参与当前快照，也不覆盖已取得的有效历史凭证。
    if (at !== null && at > cutoff) { issues.push('费用依据待核实：' + record.no); continue }
    if (!cost.evidenceId || at === null || typeof cost.source !== 'string' || !cost.source.trim()
      || !costKinds.includes(cost.kind) || !['confirmed', 'pending'].includes(cost.status) || parseMinor(cost.value, cost.currency) === null) {
      issues.push('费用依据待核实：' + record.no)
      if (cost.evidenceId) invalid.add(id)
      continue
    }
    const group = groups.get(id) ?? []
    group.push({ cost, shopId: record.shopId, recordIds: [record.internalId] }); groups.set(id, group)
  }
  return [...groups].flatMap(([id, group]) => {
    const signatures = new Set(group.map(({ cost }) => JSON.stringify([cost.kind, cost.status, cost.currency, parseMinor(cost.value, cost.currency)?.toString(), parseTime(cost.at), cost.source,
      [...cost.allocations ?? []].sort((a, b) => a.orderLineId.localeCompare(b.orderLineId))])))
    if (invalid.has(id) || signatures.size !== 1) { issues.push('同一费用凭证内容冲突，未计金额：' + group[0]!.cost.evidenceId); return [] }
    return [{ ...group[0]!, recordIds: uniq(group.flatMap(row => row.recordIds)) }]
  })
}
/** 分析明细复用同店完整凭证核验，不按筛选子集隐藏同身份冲突。 */
export function costEvidenceLedger(data: DataSet): Evidence[] { return evidenceLedger(data, []) }
function selectedLedger(ledger: Evidence[], records: AfterSaleRecord[]): Evidence[] {
  const ids = new Set(records.map(row => row.internalId)); return ledger.filter(row => row.recordIds.some(id => ids.has(id)))
}
function moneyTotals(evidence: Evidence[], mode: 'confirmed' | 'pending' | 'recovery' | 'net'): MoneyTotal[] {
  const sums = new Map<string, { value: bigint; count: number; components: { value: string; currency: string }[] }>()
  for (const { cost } of evidence) {
    const recovery = cost.kind === '费用回收'
    if (mode === 'net' ? cost.status !== 'confirmed' : mode === 'recovery' ? cost.status !== 'confirmed' || !recovery : cost.status !== mode || recovery) continue
    const total = sums.get(cost.currency) ?? { value: 0n, count: 0, components: [] }
    const signed = parseMinor(cost.value, cost.currency)! * (mode === 'net' && recovery ? -1n : 1n)
    total.value += signed; total.count++; total.components.push({ value: formatMinor(signed, cost.currency), currency: cost.currency }); sums.set(cost.currency, total)
  }
  return [...sums].map(([currency, sum]) => ({ currency, value: formatMinor(sum.value, currency), evidenceCount: sum.count, components: sum.components })).sort((a, b) => a.currency.localeCompare(b.currency))
}
function duration(start: string, end: string, asOf: string): number | null {
  const a = parseTime(start), b = parseTime(end), cutoff = parseTime(asOf)
  return a !== null && b !== null && cutoff !== null && a <= b && b <= cutoff ? (b - a) / 3600000 : null
}
function samples(records: AfterSaleRecord[], data: DataSet, actorId?: string, dates?: [number, number]) {
  const responses = new Map<string, number>(), handled = new Map<string, number>()
  const inDates = (value: string) => { const at = parseTime(value); return at !== null && (!dates || at >= dates[0] && at < dates[1]) }
  for (const row of records) {
    const response = row.response, handling = row.handling
    if (response?.evidenceId && response.human && (!actorId || response.actorId === actorId) && inDates(response.respondedAt)) {
      const hours = duration(response.startedAt, response.respondedAt, data.asOf)
      if (hours !== null) responses.set(key(row.shopId, response.evidenceId), hours)
    }
    if (handling?.evidenceId && row.status === '已完成' && (!actorId || handling.closedBy === actorId) && inDates(handling.endedAt)) {
      const hours = duration(handling.startedAt, handling.endedAt, data.asOf)
      if (hours !== null) handled.set(key(row.shopId, handling.evidenceId), hours)
    }
  }
  const average = (map: Map<string, number>) => map.size ? [...map.values()].reduce((sum, value) => sum + value, 0) / map.size : null
  return { averageHandlingHours: average(handled), handlingSamples: handled.size, firstResponseHours: average(responses), responseSamples: responses.size }
}
const isOverdue = (record: AfterSaleRecord, asOf: string) => record.status !== '已完成' && parseTime(record.dueAt) !== null && parseTime(record.dueAt)! < parseTime(asOf)!
function unknownCostIds(records: AfterSaleRecord[], ledger: Evidence[]): string[] {
  return records.filter(row => {
    const entries = selectedLedger(ledger, [row])
    return row.costCoverage !== 'complete' || !entries.length || entries.some(entry => entry.cost.status === 'pending')
      || uniq(row.costs.map(cost => cost.evidenceId)).some(id => !entries.some(entry => entry.cost.evidenceId === id))
  }).map(row => row.internalId)
}
/** 指定记录集合的同源费用核实结论，适用于SKU／客服跨建单期间下钻。 */
export function unverifiedCostRecordIds(data: DataSet, records: AfterSaleRecord[]): string[] {
  return unknownCostIds(detailRecords(data, records.map(row => row.internalId)), evidenceLedger(data, []))
}
function summarize(records: AfterSaleRecord[], data: DataSet, ledger: Evidence[]): Summary {
  const group = groupRows(records, () => 'all')[0], costs = selectedLedger(ledger, records)
  const unknownCostRecordIds = unknownCostIds(records, ledger)
  return { recordCount: records.length, orderCount: group?.orderCount ?? 0, customerCount: group?.customerCount ?? 0,
    completedCount: group?.completedCount ?? 0, pendingCount: group?.pendingCount ?? 0, overdueCount: records.filter(row => isOverdue(row, data.asOf)).length,
    unlinkedSkuCount: records.filter(row => row.items.some(item => !item.sku || item.linkage !== 'verified')).length,
    unknownCostCount: unknownCostRecordIds.length, unknownCostRecordIds,
    confirmedCosts: moneyTotals(costs, 'confirmed'), pendingCosts: moneyTotals(costs, 'pending'), recoveries: moneyTotals(costs, 'recovery'), netCosts: moneyTotals(costs, 'net'), ...samples(records, data) }
}
function buildCostRows(records: AfterSaleRecord[], ledger: Evidence[]): CostRow[] {
  const groups = new Map<string, Evidence[]>()
  for (const entry of selectedLedger(ledger, records)) { const id = key(entry.cost.kind, entry.cost.currency), group = groups.get(id) ?? []; group.push(entry); groups.set(id, group) }
  return [...groups].map(([id, group]) => {
    const cost = group[0]!.cost, confirmed = group.filter(row => row.cost.status === 'confirmed'), pending = group.filter(row => row.cost.status === 'pending')
    const total = (entries: Evidence[]) => entries.length ? formatMinor(entries.reduce((sum, row) => sum + parseMinor(row.cost.value, row.cost.currency)!, 0n), cost.currency) : null
    return { key: id, kind: cost.kind, currency: cost.currency, confirmed: total(confirmed), pending: total(pending), confirmedCount: confirmed.length, pendingCount: pending.length,
      unallocatedCount: group.filter(row => !row.cost.allocations?.length).length, recordIds: uniq(group.flatMap(row => row.recordIds)).filter(id => records.some(row => row.internalId === id)) }
  })
}
function buildSkuRows(data: DataSet, filter: StatisticsFilter, ledger: Evidence[], issues: string[]): SkuRow[] {
  const dates = range(filter.cohortStartDate, filter.cohortEndDate), cutoff = parseTime(data.asOf)
  if (!dates || cutoff === null) return []
  const skuSearch = filter.sku.trim(), all = allRecords(data), selected = all.filter(row => matches(row, filter))
  const lines = allOrderLines(data).filter(line => (!filter.shopIds.length || filter.shopIds.includes(line.shopId))
    && (!skuSearch || (skuSearch === UNKNOWN ? !line.sku : line.sku === skuSearch))
    && parseTime(line.createdAt)! >= dates[0] && parseTime(line.createdAt)! < dates[1])
  const skus = uniq([...lines.map(line => line.sku || UNKNOWN), ...selected.flatMap(row => row.items.filter(item => !skuSearch || (skuSearch === UNKNOWN ? !item.sku || item.linkage !== 'verified' : item.sku === skuSearch)).map(item => item.linkage === 'verified' && item.sku ? item.sku : UNKNOWN))])
  return skus.map(sku => {
    const productLines = lines.filter(line => (line.sku || UNKNOWN) === sku), mature = productLines.filter(line => parseTime(line.createdAt)! + OBSERVATION_DAYS * DAY <= cutoff)
    const matureIds = new Map(mature.map(line => [key(line.shopId, line.id), line]))
    const affected = new Set<string>(), related = new Map<string, AfterSaleRecord>()
    for (const row of selected) for (const item of row.items) {
      const itemSku = item.linkage === 'verified' && item.sku ? item.sku : UNKNOWN
      if (itemSku !== sku) continue
      const line = matureIds.get(key(row.shopId, item.orderLineId)), created = parseTime(row.createdAt)!
      if (line && item.linkage === 'verified' && row.orderId === line.orderId && created >= parseTime(line.createdAt)! && created < parseTime(line.createdAt)! + OBSERVATION_DAYS * DAY) { affected.add(key(row.shopId, line.id)); related.set(row.internalId, row) }
      if (sku === UNKNOWN) related.set(row.internalId, row)
    }
    const records = [...related.values()], shops = uniq(mature.map(line => line.shopId))
    const complete = shops.length > 0 && shops.every(shop => data.coverage.some(coverage => coverage.shopId === shop && coverage.ordersComplete && coverage.afterSalesComplete
      && parseTime(coverage.from) !== null && parseTime(coverage.through) !== null && parseTime(coverage.from)! <= dates[0] && parseTime(coverage.through)! >= Math.min(dates[1] + OBSERVATION_DAYS * DAY, cutoff)))
    const relevantUnknown = all.filter(row => shops.includes(row.shopId) && parseTime(row.createdAt)! >= dates[0] && parseTime(row.createdAt)! < dates[1] + OBSERVATION_DAYS * DAY
      && row.items.some(item => item.linkage !== 'verified' || !item.orderLineId || !item.sku || !data.orderLines.some(line => line.id === item.orderLineId && line.shopId === row.shopId && line.orderId === row.orderId && line.sku === item.sku)))
    const knownRecords = all.filter(row => shops.includes(row.shopId) && parseTime(row.createdAt)! >= dates[0] && parseTime(row.createdAt)! < dates[1] + OBSERVATION_DAYS * DAY)
    const coverage = knownRecords.length ? (knownRecords.length - relevantUnknown.length) / knownRecords.length : complete ? 1 : null
    const rate = sku !== UNKNOWN && mature.length > 0 && complete && relevantUnknown.length === 0 ? affected.size / mature.length : null
    const allocated: Evidence[] = [], costs = selectedLedger(ledger, records)
    let unallocatedCount = 0
    for (const entry of costs) {
      const allocations = entry.cost.allocations, allocatedIds = new Set<string>()
      let allocationValid = true
      const sum = allocations?.reduce((sum, item) => { const value = parseMinor(item.value, entry.cost.currency); if (value === null || allocatedIds.has(item.orderLineId) || !all.some(record => entry.recordIds.includes(record.internalId) && record.items.some(line => line.orderLineId === item.orderLineId && line.linkage === 'verified'))) { allocationValid = false; return sum }; allocatedIds.add(item.orderLineId); return sum + value }, 0n)
      if (!allocations?.length || !allocationValid || sum !== parseMinor(entry.cost.value, entry.cost.currency)) { unallocatedCount++; continue }
      const productAmount = allocations.filter(item => matureIds.has(key(entry.shopId, item.orderLineId))).reduce((sum, item) => sum + parseMinor(item.value, entry.cost.currency)!, 0n)
      if (productAmount > 0n) allocated.push({ ...entry, cost: { ...entry.cost, value: formatMinor(productAmount, entry.cost.currency) } })
    }
    if (sku === UNKNOWN && records.length) issues.push('存在未可靠关联 SKU 的售后单，相关商品发生率暂不展示')
    return { key: sku, sku: sku === UNKNOWN ? '未关联 SKU' : sku, title: productLines[0]?.title ?? records[0]?.items[0]?.title ?? '—', recordCount: records.length,
      orderCount: uniq(records.flatMap(row => row.orderId ? [key(row.shopId, row.orderId)] : [])).length,
      soldLineCount: mature.length, affectedLineCount: affected.size, observingLineCount: productLines.length - mature.length, rate,
      rateNote: sku === UNKNOWN ? 'SKU关联待核实' : !mature.length ? '暂无成熟订单商品行' : !complete ? '订单或售后来源覆盖不完整' : relevantUnknown.length ? '存在未关联售后，暂不计算' : '订单创建后30日，按商品行去重',
      linkageCoverage: coverage, confirmedCosts: moneyTotals(allocated, 'confirmed'), unallocatedCount, recordIds: records.map(row => row.internalId),
      denominatorLineIds: mature.map(line => orderLineKey(line.shopId, line.id)), affectedLineIds: mature.filter(line => affected.has(key(line.shopId, line.id))).map(line => orderLineKey(line.shopId, line.id)),
      observingLineIds: productLines.filter(line => parseTime(line.createdAt)! + OBSERVATION_DAYS * DAY > cutoff).map(line => orderLineKey(line.shopId, line.id)) }
  }).sort((a, b) => b.recordCount - a.recordCount || a.sku.localeCompare(b.sku))
}
function buildHandlingRows(data: DataSet, filter: StatisticsFilter, records: AfterSaleRecord[]): { customerRows: HandlingRow[]; staffRows: HandlingRow[] } {
  const all = allRecords(data).filter(row => matches(row, filter)), dates = range(filter.startDate, filter.endDate)!, cutoff = parseTime(data.asOf)!
  const period = (value: string) => { const time = parseTime(value); return time !== null && time >= dates[0] && time < dates[1] && time <= cutoff }
  const customerKey = (row: AfterSaleRecord) => row.customerId ? key(row.shopId, row.customerId) : key(UNKNOWN, row.internalId)
  const customerRows = groupRows(records, customerKey, id => { const row = records.find(row => customerKey(row) === id); return row?.customerId ? row.customerName || '未记录客户' : `客户待关联 · ${row?.no || '—'}` }).map(group => {
    const rows = records.filter(row => group.recordIds.includes(row.internalId)), backlog = rows.filter(row => row.status !== '已完成')
    return { key: group.key, name: group.name, shopId: rows[0]?.shopId, recordCount: group.count, orderCount: group.orderCount, completedCount: group.completedCount,
      actionCount: 0, currentPending: backlog.length, overdueCount: backlog.filter(row => isOverdue(row, data.asOf)).length,
      ...samples(rows, data), recordIds: group.recordIds, pendingRecordIds: backlog.map(row => row.internalId) }
  })
  const people = uniq([...data.staff.map(staff => staff.id), ...all.flatMap(row => [row.ownerId || UNKNOWN, ...row.actions.filter(action => action.source === 'human').map(action => action.actorId || UNKNOWN)])])
  const staffRows = people.map(id => {
    const actions = new Set<string>(), acted = new Map<string, AfterSaleRecord>()
    for (const row of all) for (const action of row.actions) if (action.id && action.source === 'human' && action.outcome === 'success' && (action.actorId || UNKNOWN) === id && period(action.at)) { actions.add(key(row.shopId, action.id)); acted.set(row.internalId, row) }
    const responseRows = all.filter(row => row.response?.actorId === id && row.response.human && period(row.response.respondedAt) && duration(row.response.startedAt, row.response.respondedAt, data.asOf) !== null)
    const handledRows = all.filter(row => row.handling?.closedBy === id && row.status === '已完成' && period(row.handling.endedAt) && duration(row.handling.startedAt, row.handling.endedAt, data.asOf) !== null)
    const rows = [...new Map([...acted.values(), ...responseRows, ...handledRows].map(row => [row.internalId, row])).values()]
    const backlog = all.filter(row => (row.ownerId || UNKNOWN) === id && row.status !== '已完成')
    return { key: id, name: data.staff.find(staff => staff.id === id)?.name || '人员未记录', recordCount: rows.length,
      orderCount: uniq(rows.flatMap(row => row.orderId ? [key(row.shopId, row.orderId)] : [])).length, completedCount: handledRows.length,
      actionCount: actions.size, currentPending: backlog.length, overdueCount: backlog.filter(row => isOverdue(row, data.asOf)).length,
      ...samples(all, data, id, dates), recordIds: rows.map(row => row.internalId), pendingRecordIds: backlog.map(row => row.internalId) }
  }).filter(row => row.recordCount || row.currentPending)
  return { customerRows, staffRows }
}
export function buildStatistics(data: DataSet, filter: StatisticsFilter): StatisticsResult {
  // 店铺范围先隔离，再读取凭证和诊断；同店完整凭证用于识别重复／冲突。
  if (filter.shopIds.length) data = { ...data, records: data.records.filter(row => filter.shopIds.includes(row.shopId)), orderLines: data.orderLines.filter(row => filter.shopIds.includes(row.shopId)), coverage: data.coverage.filter(row => filter.shopIds.includes(row.shopId)) }
  const issues: string[] = [], ledger = evidenceLedger(data, issues), records = recordsForFilter(data, filter)
  const dates = range(filter.startDate, filter.endDate), cohort = range(filter.cohortStartDate, filter.cohortEndDate)
  const error = !dates || !cohort || parseTime(data.asOf) === null ? '请选择有效的统计日期、订单批次和截至时间' : null
  const result: StatisticsResult = { records, summary: summarize(records, data, ledger), trend: [], originRows: [], scenarioRows: [], methodRows: [], shopRows: [], skuRows: [], costRows: [], customerRows: [], staffRows: [], problemRows: [], issues, asOf: data.asOf, error }
  if (error || !dates) return result
  allRecords(data, issues)
  result.originRows = groupRows(records, row => row.origin); result.scenarioRows = groupRows(records, row => row.scenario); result.methodRows = groupRows(records, row => row.method)
  result.shopRows = groupRows(records, row => row.shopId, id => data.shops.find(shop => shop.id === id)?.name || '店铺待核实')
  const days = new Map<string, { date: string; count: number; platformCount: number; internalCount: number }>()
  for (let day = dates[0]; day < dates[1] && day <= parseTime(data.asOf)!; day += DAY) { const date = new Date(day + 8 * 3600000).toISOString().slice(0, 10); days.set(date, { date, count: 0, platformCount: 0, internalCount: 0 }) }
  for (const row of records) { const point = days.get(beijingDate(row.createdAt)); if (point) { point.count++; if (row.origin === '平台售后') point.platformCount++; else point.internalCount++ } }
  result.trend = [...days.values()]; result.costRows = buildCostRows(records, ledger); result.skuRows = buildSkuRows(data, filter, ledger, issues)
  Object.assign(result, buildHandlingRows(data, filter, records))
  const problems = uniq(records.flatMap(row => row.items.map(item => item.problem || '问题待归类')))
  result.problemRows = problems.map(problem => {
    const rows = records.filter(row => row.items.some(item => (item.problem || '问题待归类') === problem)), group = groupRows(rows, () => problem)[0]!
    return { ...group, share: records.length ? rows.length / records.length : 0, skuCount: uniq(rows.flatMap(row => row.items.filter(item => item.problem === problem && item.linkage === 'verified' && item.sku).map(item => item.sku!))).length,
      // 多问题单缺少问题级金额依据，不把整笔金额复制到每个问题。
      confirmedCosts: moneyTotals(selectedLedger(ledger, rows).filter(entry => uniq(records.filter(row => entry.recordIds.includes(row.internalId)).flatMap(row => row.items.map(item => item.problem || '问题待归类'))).every(item => item === problem)), 'confirmed') } as ProblemRow
  }).sort((a, b) => b.count - a.count)
  result.issues = uniq(issues)
  return result
}
