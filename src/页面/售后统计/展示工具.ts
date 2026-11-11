import type { AfterSaleRecord, DataSet, MoneyTotal, OrderLine, SkuRow, StatisticsFilter, StatisticsResult } from './类型'
import { formatDuration, formatMoney, parseTime, unverifiedCostRecordIds } from './模型'
import { buildBacklog, buildCurrencyRows, buildExecutionRows, buildReasonRows, collectCostEvidence, reasonCategories } from './分析工具'
import type { CollectedCostEvidence, ReasonCategory, ReasonRow } from './分析工具'
import { convertAmount, convertMoneyTotals, sumConverted } from './汇率换算'
import type { ExchangeQuote } from './汇率换算'
export type StatisticsTab = 'overview' | 'sku' | 'cost' | 'handling' | 'problems'
export const tabLabels: Record<StatisticsTab, string> = { overview: '售后总览', sku: 'SKU售后分析', cost: '售后成本分析', handling: '售后处理分析', problems: '售后原因分析' }
export interface StatisticsExportOptions {
  /** V0.2导出调用兼容参数；有displayCurrency时不再用于过滤来源原币。 */
  currency?: string
  displayCurrency?: string
  exchangeQuote?: ExchangeQuote
  reasonCategory?: string
  /** 传入页面已排序、已按最低成熟样本筛选的完整集合，不是当前分页。 */
  skuRows?: SkuRow[]
  dateMode?: 'created' | 'handling' | 'cohort' | 'backlog'
}
export const executionKindText = (kind: string) => ({ refund: '退款', return: '退货', reship: '重发' })[kind as 'refund' | 'return' | 'reship'] ?? kind
export const executionOutcomeText = (outcome: string) => ({ success: '已确认成功', pending: '执行中', failed: '明确失败', unknown: '待核查' })[outcome as 'success' | 'pending' | 'failed' | 'unknown'] ?? outcome
export function formatTime(value?: string): string {
  if (!value || parseTime(value) === null) return '—'
  const parts = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(value))
  const get = (key: string) => parts.find(p => p.type === key)?.value ?? ''
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}`
}
export const moneyText = (values: MoneyTotal[]) => values.length ? values.map(v => formatMoney(v.value, v.currency)).join('\n') : '—'
export const rateText = (value: number | null) => value === null ? '—' : `${(value * 100).toFixed(2)}%`
export const shopName = (data: DataSet, id: string) => data.shops.find(s => s.id === id)?.name ?? '店铺待关联'
export const staffName = (data: DataSet, id?: string) => data.staff.find(s => s.id === id)?.name ?? '人员未记录'
export function csvCell(value: unknown): string {
  let text = String(value ?? '')
  if (/^[\s]*[=+\-@\t\r]/.test(text)) text = `'${text}`
  return `"${text.replace(/"/g, '""')}"`
}
export const toCsv = (rows: unknown[][]) => '\uFEFF' + rows.map(row => row.map(csvCell).join(',')).join('\r\n')
function metadata(data: DataSet, filter: StatisticsFilter, title: string, options: StatisticsExportOptions = {}): unknown[][] {
  const mode = options.dateMode ?? 'created'
  return [
    ['售后统计', title], ['业务时区', 'Asia/Shanghai（北京时间）'], ['数据截至', formatTime(data.asOf)],
    ...(mode === 'backlog' ? [['统计时间', '截至资料时点的当前积压；不受建单及办理日期限制']] : mode === 'cohort' ? [] : [[mode === 'handling' ? '办理期间' : '售后建单批次', `${filter.startDate} 至 ${filter.endDate}`]]),
    ['SKU订单创建批次', `${filter.cohortStartDate} 至 ${filter.cohortEndDate}`],
    ['SKU观察规则', '创建后连续30日；仅已满观察期商品行；SKU分析不受售后建单批次限制'],
    ['店铺范围', filter.shopIds.length ? filter.shopIds.map(id => shopName(data, id)).join('、') : '全部可见店铺'],
    ['来源渠道', filter.origins.join('、') || '全部'], ['来源场景', filter.scenarios.join('、') || '全部'], ['登记处理方式', filter.methods.join('、') || '全部'], ['系统SKU（精确）', filter.sku || '全部'],
    [options.displayCurrency ? '展示币种' : '所选币种', options.displayCurrency || options.currency || '全部原币，分别列示'],
    ...(options.displayCurrency ? [['币种含义', '所有来源原币折算至目标展示币种，不过滤来源记录'], ['汇率快照标识', options.exchangeQuote?.id ?? '未取得'], ['汇率日期', options.exchangeQuote ? formatTime(options.exchangeQuote.asOf) : '未取得'], ['汇率来源', options.exchangeQuote?.source ?? '未取得；同币种恒等换算无需外部汇率'], ['换算舍入', '按每笔唯一凭证或已核实份额精确换算，目标最小货币单位四舍五入后合计；缺率阻断完整金额']] : []),
    ['售后原因分析大类', options.reasonCategory || '全部'],
    ['执行结果口径', '退款、退货、重发按独立结构化执行证据统计；登记处理方式与内部办理状态不替代执行成功'],
    ['金额口径', options.displayCurrency ? '确认费用按凭证去重，原币依据不变，统一折算展示；回收单列；缺失不是0；建单批次截至结果不等于当期资金流' : '确认费用按凭证去重、原币分别计量；回收单列；缺失不是0；建单批次截至结果不等于当期资金流'],
    ['SKU金额口径', '关联售后凭证全额与所选SKU已确认分摊份额分列；未取得可靠分摊不按件数或售价分配'],
    ['资料性质', '本地独立虚构系统售后、订单和凭证资料；真实采集、权限和跨工作台同步未接入'], [],
  ]
}
function inCurrency<T extends { currency: string }>(values: T[], currency?: string): T[] { return currency ? values.filter(v => v.currency === currency) : values }
const legacyCurrency = (options: StatisticsExportOptions): string | undefined => options.displayCurrency ? undefined : options.currency
const reasonCategory = (value?: string): ReasonCategory => reasonCategories.find(category => category === value) ?? '全部'
const convertedTotals = (values: MoneyTotal[], options: StatisticsExportOptions) => convertMoneyTotals(values, options.displayCurrency!, options.exchangeQuote)
export function createSummaryCsv(data: DataSet, result: StatisticsResult, filter: StatisticsFilter, tab: StatisticsTab, handling: 'customer' | 'staff', options: StatisticsExportOptions = {}): string {
  const rows: unknown[][] = metadata(data, filter, tabLabels[tab] + (tab === 'handling' ? ` · ${handling === 'customer' ? '客户' : '客服'}` : ''), { ...options, dateMode: tab === 'handling' && handling === 'staff' ? 'handling' : tab === 'sku' ? 'cohort' : 'created' })
  if (tab === 'overview') {
    rows.push(['指标', '数值'], ['单据办理量（系统售后单）', result.summary.recordCount], ['涉及订单数', result.summary.orderCount], ['涉及客户数', result.summary.customerCount], ['批次未完成售后单', result.summary.pendingCount], ['费用待核实售后单', result.summary.unknownCostCount], [], ['店铺', '售后单数', '订单数', '客户数', '内部办理已完成', '批次未完成售后单'])
    result.shopRows.forEach(r => rows.push([r.name, r.count, r.orderCount, r.customerCount, r.completedCount, r.pendingCount]))
    for (const [label, groups] of [['来源渠道', result.originRows], ['来源场景', result.scenarioRows], ['登记处理方式', result.methodRows]] as const) { rows.push([], [label, '售后单数']); groups.forEach(r => rows.push([r.name, r.count])) }
    rows.push([], ['实际执行类型', '执行结果', '去重执行证据数', '涉及售后单数'])
    buildExecutionRows(data, result.records).forEach(r => rows.push([executionKindText(r.kind), executionOutcomeText(r.outcome), r.count, r.recordIds.length]))
    rows.push([], ['日期（北京）', '售后单数', '平台售后', '内部售后']); result.trend.forEach(r => rows.push([r.date, r.count, r.platformCount, r.internalCount]))
  } else if (tab === 'sku') {
    rows.push(['系统SKU', '商品', '成熟订单商品行', '涉售后商品行', '30日涉及率', '观察中商品行', '关联覆盖', '比率说明', '售后单数', options.displayCurrency ? `已确认已分摊成本（${options.displayCurrency}）` : '已确认已分摊成本', '未分摊凭证数', ...(options.displayCurrency ? ['换算说明'] : [])])
    ;(options.skuRows ?? result.skuRows).forEach(r => {
      const converted = options.displayCurrency ? convertedTotals(r.confirmedCosts, options) : undefined
      rows.push([r.sku, r.title, r.soldLineCount, r.affectedLineCount, rateText(r.rate), r.observingLineCount, rateText(r.linkageCoverage), r.rateNote, r.recordCount, converted ? converted.value ?? '—' : moneyText(inCurrency(r.confirmedCosts, legacyCurrency(options))), r.unallocatedCount, ...(converted ? [converted.reasons.join('；')] : [])])
    })
  } else if (tab === 'cost') {
    const evidence = inCurrency(collectCostEvidence(data, result.records, filter.sku), legacyCurrency(options))
    if (options.displayCurrency) {
      const target = options.displayCurrency, quote = options.exchangeQuote
      const confirmed = evidence.filter(e => e.status === 'confirmed' && e.kind !== '费用回收')
      const recovery = evidence.filter(e => e.status === 'confirmed' && e.kind === '费用回收')
      const pending = evidence.filter(e => e.status === 'pending' && e.kind !== '费用回收')
      const sums = [sumConverted(confirmed, target, quote), sumConverted(recovery, target, quote), sumConverted(pending, target, quote)]
      const allocated = sumConverted(confirmed.filter(e => e.allocationValid && e.allocatedValue !== null).map(e => ({ value: e.allocatedValue!, currency: e.currency })), target, quote)
      rows.push(['展示币种', '关联售后凭证全额·已确认支出', '关联售后凭证全额·已确认费用回收', '关联售后凭证全额·待核实支出', '所选SKU已确认已分摊支出', '确认支出未分摊凭证数', '换算说明'],
        [target, ...sums.map(sum => sum.value ?? '—'), filter.sku ? allocated.value ?? '—' : '未筛选SKU', confirmed.filter(e => !e.allocationValid).length, [...new Set([...sums, ...(filter.sku ? [allocated] : [])].flatMap(sum => sum.reasons))].join('；')])
      rows.push([], ['费用项目', '展示币种', '关联售后凭证全额·已确认', '关联售后凭证全额·待核实', '已确认凭证数', '待核实凭证数', '未分摊凭证数', '换算说明'])
      for (const kind of [...new Set(evidence.map(entry => entry.kind))]) {
        const members = evidence.filter(entry => entry.kind === kind), confirmedRows = members.filter(entry => entry.status === 'confirmed'), pendingRows = members.filter(entry => entry.status === 'pending')
        const confirmedValue = sumConverted(confirmedRows, target, quote), pendingValue = sumConverted(pendingRows, target, quote)
        rows.push([kind, target, confirmedValue.value ?? '—', pendingValue.value ?? '—', confirmedRows.length, pendingRows.length, members.filter(entry => !entry.allocationValid).length, [...new Set([...confirmedValue.reasons, ...pendingValue.reasons])].join('；')])
      }
    } else {
      rows.push(['币种', '关联售后凭证全额·已确认支出', '关联售后凭证全额·已确认费用回收', '关联售后凭证全额·待核实支出', '所选SKU已确认已分摊支出', '确认支出未分摊凭证数'])
      buildCurrencyRows(evidence).forEach(r => rows.push([r.currency, r.confirmed ?? '—', r.recovery ?? '—', r.pending ?? '—', filter.sku ? r.allocated ?? '—' : '未筛选SKU', r.unallocatedCount]))
      rows.push([], ['费用项目', '币种', '关联售后凭证全额·已确认', '关联售后凭证全额·待核实', '已确认凭证数', '待核实凭证数', '未分摊凭证数'])
      inCurrency(result.costRows, options.currency).forEach(r => rows.push([r.kind, r.currency, r.confirmed ?? '—', r.pending ?? '—', r.confirmedCount, r.pendingCount, r.unallocatedCount]))
    }
    rows.push([], ['费用待核实售后单（与币种无关）', result.summary.unknownCostCount])
  } else if (tab === 'handling') {
    if (handling === 'staff') {
      rows.push(['期间办理', '成功动作／首响完成／结办完成分别按各自实际事件时间'], ['客服', '期间涉及售后单', '成功人工动作', '明确结办单', '平均办理耗时', '办理样本', '平均人工首响', '首响样本'])
      result.staffRows.filter(r => r.recordCount > 0).forEach(r => rows.push([r.name, r.recordCount, r.actionCount, r.completedCount, formatDuration(r.averageHandlingHours), r.handlingSamples, formatDuration(r.firstResponseHours), r.responseSamples]))
      const backlog = buildBacklog(data, filter)
      rows.push([], ['当前积压', '截至资料时点；不受建单及办理日期限制'], ['未完成售后单', backlog.allIds.length], ['有可靠期限且已超期', backlog.overdueIds.length], ['负责人待关联', backlog.unownedIds.length], [], ['积压建单自然天龄分组', '未完成售后单'])
      backlog.ageRows.forEach(r => rows.push([r.label, r.count]))
      rows.push([], ['当前积压售后单号', '店铺', '当前负责人', '当前状态', '建单时间（北京）', '本单期限（北京）'])
      backlog.records.forEach(r => rows.push([r.no, shopName(data, r.shopId), staffName(data, r.ownerId), r.status, formatTime(r.createdAt), formatTime(r.dueAt)]))
    } else {
      rows.push(['统计时间', '按售后建单批次看截至当前结果'], ['客户', '店铺', '涉及售后单', '涉及订单', '内部办理已完成', '批次未完成', '超期', '平均办理耗时', '办理样本', '平均人工首响', '首响样本'])
      result.customerRows.forEach(r => rows.push([r.name, shopName(data, r.shopId ?? ''), r.recordCount, r.orderCount, r.completedCount, r.currentPending, r.overdueCount, formatDuration(r.averageHandlingHours), r.handlingSamples, formatDuration(r.firstResponseHours), r.responseSamples]))
    }
  } else {
    const reasons = buildReasonRows(data, result.records, reasonCategory(options.reasonCategory), filter.sku)
    rows.push(['原始售后原因', '分析大类', '涉及售后单', '涉及订单', '涉及SKU', '批次未完成售后单', `已确认可归因成本（${options.displayCurrency ?? '原币'}）`, ...(options.displayCurrency ? ['换算说明'] : [])])
    reasons.forEach(r => {
      const converted = options.displayCurrency ? convertedTotals(r.confirmedCosts, options) : undefined
      rows.push([r.name, r.category, r.count, r.orderCount, r.skuCount, r.pendingCount, converted ? converted.value ?? '—' : moneyText(r.confirmedCosts), ...(converted ? [converted.reasons.join('；')] : [])])
    })
    rows.push([], ['原始售后原因', '分析大类', '系统SKU', '商品', '涉及售后单'])
    reasons.forEach(r => r.skus.forEach(sku => rows.push([r.name, r.category, sku.sku, sku.title, sku.count])))
    rows.push([], ['说明', '分析大类为统计展示映射，保留原始原因；一单可涉及多个原因，分组单数不可相加；不自动判定质量或责任，不复制费用到多个原因。'])
  }
  if (result.issues.length) rows.push([], ['统计待核对事项'], ...result.issues.map(issue => [issue]))
  return toCsv(rows)
}
export function createRecordCsv(data: DataSet, records: AfterSaleRecord[], filter: StatisticsFilter, title: string, options: StatisticsExportOptions = {}): string {
  const reasons = buildReasonRows(data, records, reasonCategory(options.reasonCategory), filter.sku)
  const reasonIds = new Set(reasons.flatMap(r => r.recordIds))
  const selected = options.reasonCategory && options.reasonCategory !== '全部' ? records.filter(r => reasonIds.has(r.internalId)) : records
  const unverified = new Set(unverifiedCostRecordIds(data, selected))
  return toCsv([...metadata(data, filter, title, options), ['售后单号', '来源渠道', '来源场景', '来源单号', '登记处理方式', '店铺', '原订单', '客户', '当前负责人', '创建时间（北京）', '内部办理状态', '单据全部SKU', '原始售后原因（整单）', '命中售后原因分析大类', '独立执行结果', '费用完整性'], ...selected.map(r => [r.no, r.origin, r.scenario, r.sourceId ?? '未记录', r.method, shopName(data, r.shopId), r.orderNo ?? '待关联', r.customerName ?? '客户未关联', staffName(data, r.ownerId), formatTime(r.createdAt), r.status, r.items.map(i => i.sku ?? '待关联').join('；'), [...new Set(r.items.map(i => i.problem))].join('；'), reasons.filter(reason => reason.recordIds.includes(r.internalId)).map(reason => reason.category).filter((value, index, values) => values.indexOf(value) === index).join('；') || '待归类', buildExecutionRows(data, [r]).filter(e => e.count > 0).map(e => `${executionKindText(e.kind)}·${executionOutcomeText(e.outcome)} ${e.count}笔`).join('；') || '未取得可靠执行证据', unverified.has(r.internalId) ? r.costCoverage === 'partial' ? '部分待核实' : '待核实' : '已核实'])])
}
export function createLineCsv(data: DataSet, lines: OrderLine[], filter: StatisticsFilter, title: string, options: StatisticsExportOptions = {}): string {
  return toCsv([...metadata(data, filter, title, { ...options, dateMode: 'cohort' }), ['订单商品行ID', '订单号', '店铺', '系统SKU', '商品', '购买件数', '创建时间（北京）'], ...lines.map(r => [r.id, r.orderNo, shopName(data, r.shopId), r.sku ?? '待关联', r.title, r.quantity, formatTime(r.createdAt)])])
}
export function createEvidenceCsv(data: DataSet, evidence: CollectedCostEvidence[], filter: StatisticsFilter, title: string, options: StatisticsExportOptions = {}): string {
  const selected = inCurrency(evidence, legacyCurrency(options))
  if (options.displayCurrency) {
    return toCsv([...metadata(data, filter, title, options), ['凭证行标识', '店铺', '费用项目', '原币', '原币凭证全额', '展示币种', '折算凭证全额', '确认状态', '原币SKU核实份额', '目标币种SKU核实份额', '分摊核实', '凭证来源', '凭证时间（北京）', '汇率快照标识', '应用汇率', '显示汇率是否近似', '精确汇率分子', '精确汇率分母', '汇率日期（北京）', '汇率来源', '换算说明', '关联售后单号'], ...selected.map(r => {
      const converted = convertAmount(r.value, r.currency, options.displayCurrency!, options.exchangeQuote)
      const allocated = filter.sku && r.allocationValid && r.allocatedValue !== null ? convertAmount(r.allocatedValue, r.currency, options.displayCurrency!, options.exchangeQuote) : undefined
      return [r.evidenceId, shopName(data, r.shopId), r.kind, r.currency, r.value, options.displayCurrency, converted.value ?? '—', r.status === 'confirmed' ? '已确认' : '待核实', filter.sku && r.allocationValid ? r.allocatedValue ?? '—' : '—', allocated?.value ?? '—', !filter.sku ? '未筛选SKU' : r.allocationValid ? '已核实' : '待核实', r.source, formatTime(r.at), converted.quoteId ?? (converted.derivation === 'identity' ? '同币种恒等' : '—'), converted.rate ?? '—', converted.rateIsApproximate ? '是，金额采用精确比值计算' : converted.rate ? '否' : '—', converted.rateExact?.numerator ?? '—', converted.rateExact?.denominator ?? '—', converted.asOf ? formatTime(converted.asOf) : '—', converted.source ?? (converted.derivation === 'identity' ? '同币种恒等汇率1' : '—'), [...new Set([converted.reason, allocated?.reason].filter(Boolean))].join('；'), r.recordIds.map(id => data.records.find(record => record.internalId === id && record.shopId === r.shopId)?.no ?? id).join('；')]
    })])
  }
  return toCsv([...metadata(data, filter, title, options), ['凭证行标识', '店铺', '费用项目', '币种', '关联售后凭证全额', '确认状态', '所选SKU核实分摊份额', '分摊核实', '凭证来源', '凭证时间（北京）', '关联售后单号'], ...selected.map(r => [r.evidenceId, shopName(data, r.shopId), r.kind, r.currency, r.value, r.status === 'confirmed' ? '已确认' : '待核实', filter.sku && r.allocationValid ? r.allocatedValue ?? '—' : '—', !filter.sku ? '未筛选SKU' : r.allocationValid ? '已核实' : '待核实', r.source, formatTime(r.at), r.recordIds.map(id => data.records.find(record => record.internalId === id && record.shopId === r.shopId)?.no ?? id).join('；')])])
}
export function createReasonSkuCsv(data: DataSet, reason: ReasonRow, filter: StatisticsFilter, options: StatisticsExportOptions = {}): string {
  return toCsv([...metadata(data, filter, `${reason.name} · SKU分布`, options), ['原始售后原因', reason.name], ['分析大类', reason.category], [], ['系统SKU', '商品', '涉及售后单', '关联售后单号'], ...reason.skus.map(row => [row.sku, row.title, row.count, row.recordIds.map(id => data.records.find(record => record.internalId === id)?.no ?? id).join('；')])])
}
