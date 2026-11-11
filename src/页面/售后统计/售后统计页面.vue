<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from 'vue'
import { Download, QuestionFilled } from '@element-plus/icons-vue'
import { ElButton, ElDrawer, ElEmpty, ElIcon, ElInput, ElInputNumber, ElMessage, ElOption, ElPagination, ElRadioButton, ElRadioGroup, ElSelect, ElTable, ElTableColumn, ElTooltip } from 'element-plus'
import DateRange from '@/组件/筛选/时间范围.vue'
import MultiFilter from '@/组件/筛选/多选筛选.vue'
import { 校验时间范围 } from '@/组件/筛选/筛选工具'
import { demoData } from './数据'
import { buildStatistics, createDefaultFilter, detailOrderLines, detailRecords, formatDuration, formatMoney, orderLineKey, parseMinor, parseTime } from './模型'
import { buildBacklog, buildExecutionRows, buildReasonRows, collectCostEvidence, collectExecutionEvidence, reasonCategories } from './分析工具'
import { methods, origins, scenarios } from './类型'
import type { AfterSaleRecord, HandlingRow, MoneyTotal, OrderLine, SkuRow, StatisticsFilter } from './类型'
import { createEvidenceCsv, createLineCsv, createRecordCsv, createReasonSkuCsv, createSummaryCsv, formatTime, rateText, shopName, tabLabels } from './展示工具'
import type { StatisticsExportOptions, StatisticsTab } from './展示工具'
import { convertAmount, convertMoneyTotals, demoExchangeQuote, displayCurrencies, sumConverted } from './汇率换算'
import RecordDetail from './售后记录详情.vue'
import { annotation } from './标注'
import './样式.css'

const tab = ref<StatisticsTab>('overview'), handlingView = ref<'customer' | 'staff'>('customer')
const cloneFilter = (f: StatisticsFilter): StatisticsFilter => ({ ...f, shopIds: [...f.shopIds], origins: [...f.origins], scenarios: [...f.scenarios], methods: [...f.methods] })
const draft = reactive(createDefaultFilter()), applied = reactive(createDefaultFilter())
type DateMode = 'batch' | 'cohort' | 'events'
const defaultDates = () => ({ batch: ['2026-10-01', '2026-10-31'], cohort: ['2026-09-01', '2026-09-30'], events: ['2026-10-01', '2026-10-31'] })
const draftRanges = reactive(defaultDates()), appliedRanges = reactive(defaultDates())
const dateMode = computed<DateMode>(() => tab.value === 'sku' ? 'cohort' : tab.value === 'handling' && handlingView.value === 'staff' ? 'events' : 'batch')
const dateLabel = computed(() => ({ batch: '售后建单日期', cohort: '订单创建日期', events: '办理日期' })[dateMode.value])
const dateDraft = computed({ get: () => draftRanges[dateMode.value], set: (v: string[] | null) => { draftRanges[dateMode.value] = v ?? [] } })
const filter = computed<StatisticsFilter>(() => ({ ...cloneFilter(applied), startDate: appliedRanges[dateMode.value === 'events' ? 'events' : 'batch'][0]!, endDate: appliedRanges[dateMode.value === 'events' ? 'events' : 'batch'][1]!, cohortStartDate: appliedRanges.cohort[0]!, cohortEndDate: appliedRanges.cohort[1]! }))
const result = computed(() => buildStatistics(demoData, filter.value))
const queryError = ref(''), showIssues = ref(false), tablePage = ref(1)
const displayCurrencyDraft = ref('CNY'), displayCurrency = ref('CNY')
const exchangeQuote = demoExchangeQuote
const currencyNames: Record<string, string> = { CNY: 'CNY 人民币', USD: 'USD 美元', EUR: 'EUR 欧元', GBP: 'GBP 英镑' }
const reasonCategory = ref<(typeof reasonCategories)[number]>('全部'), skuSort = ref('count'), minimumSamples = ref(0)
const scopeText = computed(() => applied.shopIds.length ? applied.shopIds.map(id => shopName(demoData, id)).join('、') : '全部可见店铺')
const rangeText = computed(() => appliedRanges[dateMode.value].join(' 至 '))
const shopOptions = demoData.shops.map(s => ({ value: s.id, label: s.name }))
const asOptions = (values: readonly string[]) => values.map(value => ({ value, label: value }))
const convertedMoney = (values: MoneyTotal[]) => formatMoney(convertMoneyTotals(values, displayCurrency.value, exchangeQuote).value, displayCurrency.value)
const conversionMissing = (values: MoneyTotal[]) => convertMoneyTotals(values, displayCurrency.value, exchangeQuote).missingCount
const convertedValue = (value: string | null | undefined, source: string) => value == null ? '—' : formatMoney(convertAmount(value, source, displayCurrency.value, exchangeQuote).value, displayCurrency.value)
const conversionRate = (source: string) => { const converted = convertAmount('1', source, displayCurrency.value, exchangeQuote); return converted.rate === null ? '汇率待核实' : `1 ${source} ${converted.rateIsApproximate ? '≈' : '='} ${converted.rate} ${displayCurrency.value}` }

function query() {
  const dates = dateDraft.value
  queryError.value = dates.length === 2 ? 校验时间范围(dates) ?? '' : '请选择完整的日期范围'
  if (queryError.value) return
  if (!displayCurrencies.some(c => c === displayCurrencyDraft.value)) { queryError.value = '请选择有效的展示币种'; return }
  const next = cloneFilter(draft); next.sku = next.sku.trim()
  const candidate = { ...next, startDate: dateMode.value === 'cohort' ? filter.value.startDate : dates[0]!, endDate: dateMode.value === 'cohort' ? filter.value.endDate : dates[1]!, cohortStartDate: dateMode.value === 'cohort' ? dates[0]! : filter.value.cohortStartDate, cohortEndDate: dateMode.value === 'cohort' ? dates[1]! : filter.value.cohortEndDate }
  queryError.value = buildStatistics(demoData, candidate).error ?? ''
  if (queryError.value) return
  appliedRanges[dateMode.value] = [...dates]; displayCurrency.value = displayCurrencyDraft.value; Object.assign(applied, next); closeDetails(); tablePage.value = 1
}
function reset() {
  Object.assign(draft, cloneFilter(createDefaultFilter())); Object.assign(applied, cloneFilter(createDefaultFilter()))
  Object.assign(draftRanges, defaultDates()); Object.assign(appliedRanges, defaultDates())
  displayCurrencyDraft.value = 'CNY'; displayCurrency.value = 'CNY'; reasonCategory.value = '全部'; skuSort.value = 'count'; minimumSamples.value = 0
  queryError.value = ''; showIssues.value = false; tablePage.value = 1; closeDetails()
}

const allIds = computed(() => result.value.records.map(r => r.internalId))
const pendingIds = computed(() => result.value.records.filter(r => r.status !== '已完成').map(r => r.internalId))
const overdueIds = computed(() => result.value.records.filter(r => r.status !== '已完成' && parseTime(r.dueAt) !== null && parseTime(result.value.asOf) !== null && parseTime(r.dueAt)! < parseTime(result.value.asOf)!).map(r => r.internalId))
const backlog = computed(() => buildBacklog(demoData, filter.value))
const reasonRows = computed(() => buildReasonRows(demoData, result.value.records, reasonCategory.value, applied.sku))
const executionRows = computed(() => buildExecutionRows(demoData, result.value.records).filter(r => r.count > 0))
const missingExecutionIds = computed(() => { const known = new Set(collectExecutionEvidence(demoData, result.value.records).flatMap(e => e.recordIds)); return allIds.value.filter(id => !known.has(id)) })
const allEvidence = computed(() => collectCostEvidence(demoData, result.value.records, applied.sku))
const evidence = computed(() => allEvidence.value)
const costSummary = computed(() => {
  const confirmed = evidence.value.filter(e => e.status === 'confirmed' && e.kind !== '费用回收')
  return {
    confirmed: sumConverted(confirmed, displayCurrency.value, exchangeQuote),
    recovery: sumConverted(evidence.value.filter(e => e.status === 'confirmed' && e.kind === '费用回收'), displayCurrency.value, exchangeQuote),
    pending: sumConverted(evidence.value.filter(e => e.status === 'pending' && e.kind !== '费用回收'), displayCurrency.value, exchangeQuote),
    allocated: sumConverted(confirmed.filter(e => e.allocationValid && e.allocatedValue !== null).map(e => ({ value: e.allocatedValue!, currency: e.currency })), displayCurrency.value, exchangeQuote),
    unallocatedCount: confirmed.filter(e => !e.allocationValid).length,
  }
})
const exchangeMissingCount = computed(() => sumConverted(evidence.value, displayCurrency.value, exchangeQuote).missingCount)
const costCards = computed<Card[]>(() => {
  const row = costSummary.value
  return [
    { id: 'confirmedCosts', label: applied.sku ? '关联凭证已确认支出' : '已确认支出', value: formatMoney(row.confirmed.value, displayCurrency.value), note: row.confirmed.missingCount ? '缺少必要汇率，合计待核实' : '已按展示币种折算 · 未扣费用回收', help: '当前批次的唯一凭证逐笔折算后汇总，不是当期资金流。' },
    { id: 'recoveries', label: '已确认费用回收', value: formatMoney(row.recovery.value, displayCurrency.value), note: row.recovery.missingCount ? '缺少必要汇率，合计待核实' : '赔付与费用返还', help: '只统计可靠的回收凭证。' },
    { id: 'pendingCosts', label: '待核实支出', value: formatMoney(row.pending.value, displayCurrency.value), note: row.pending.missingCount ? '缺少必要汇率，合计待核实' : '不计入已确认支出', help: '只表示已取得的待核实金额，未知金额不补0。' },
  ]
})
const costRows = computed(() => [...new Set(evidence.value.map(e => e.kind))].map(kind => {
  const rows = evidence.value.filter(e => e.kind === kind), confirmed = rows.filter(e => e.status === 'confirmed'), pending = rows.filter(e => e.status === 'pending')
  const a = sumConverted(confirmed, displayCurrency.value, exchangeQuote), b = sumConverted(pending, displayCurrency.value, exchangeQuote)
  return { key: kind, kind, confirmed: a.value, pending: b.value, missingCount: a.missingCount + b.missingCount, confirmedCount: confirmed.length, pendingCount: pending.length }
}))
const executionKind = { refund: '退款', return: '退货实收', reship: '重发出库' }
const executionOutcome = { success: '已成功', pending: '处理中', failed: '明确失败', unknown: '待核查' }
const skuRows = computed(() => [...result.value.skuRows].filter(r => r.soldLineCount >= (minimumSamples.value || 0)).sort((a, b) => {
  let x: number | bigint | null, y: number | bigint | null
  if (skuSort.value === 'rate') { x = a.rate; y = b.rate }
  else if (skuSort.value === 'cost') { const amount = (r: SkuRow) => { const m = convertMoneyTotals(r.confirmedCosts, displayCurrency.value, exchangeQuote); return m.value === null ? null : parseMinor(m.value, displayCurrency.value) }; x = amount(a); y = amount(b) }
  else { x = a.recordCount; y = b.recordCount }
  if (x === null || y === null) return x === y ? a.sku.localeCompare(b.sku) : x === null ? 1 : -1
  return x < y ? 1 : x > y ? -1 : a.sku.localeCompare(b.sku)
}))
const pageSkus = computed(() => skuRows.value.slice((tablePage.value - 1) * 10, tablePage.value * 10))
const handlingRows = computed(() => handlingView.value === 'customer' ? result.value.customerRows : result.value.staffRows.filter(r => r.recordCount > 0))
const pageHandling = computed(() => handlingRows.value.slice((tablePage.value - 1) * 10, tablePage.value * 10))
const repeatCustomerCount = computed(() => result.value.customerRows.filter(r => r.orderCount >= 2 && !r.key.includes('unknown')).length)
const staffPendingIds = computed(() => [...new Set(result.value.staffRows.flatMap(r => r.pendingRecordIds))])
const staffPeriodIds = computed(() => [...new Set(result.value.staffRows.flatMap(r => r.recordIds))])
const staffAverage = (rows: HandlingRow[]) => { const count = rows.reduce((n, r) => n + r.responseSamples, 0); return { count, average: count ? rows.reduce((n, r) => n + (r.firstResponseHours ?? 0) * r.responseSamples, 0) / count : null } }
interface Card { id: string; label: string; value: string | number; note: string; help: string; ids?: string[] }
const cards = computed<Card[]>(() => {
  const s = result.value.summary
  if (tab.value === 'overview') return [
    { id: 'recordCount', label: '办理量 · 系统售后单', value: s.recordCount, note: '同一申请可产生多笔独立办理', help: '按内部售后单身份去重；退货后退款可形成两张单，不能理解为两次独立问题。', ids: allIds.value },
    { id: 'orderCount', label: '影响范围 · 原订单', value: s.orderCount, note: '同店同订单只计一次', help: '可靠关联的原订单分别去重；缺少关联不补造。' },
    { id: 'pendingCount', label: '该批截至当前未完成', value: s.pendingCount, note: '限定所选建单批次', help: '包括待处理、处理中和待核实；与全部创建日期的当前积压分开。', ids: pendingIds.value },
  ]
  if (tab.value === 'sku') { const sum = result.value.skuRows.reduce((s, r) => ({ mature: s.mature + r.soldLineCount, affected: s.affected + r.affectedLineCount, observing: s.observing + r.observingLineCount }), { mature: 0, affected: 0, observing: 0 }); return [
    { id: 'matureLines', label: '成熟订单商品行', value: sum.mature, note: '订单创建后已满30日', help: '按全部订单样本范围计量；表内排序与最小样本只改变列表展示。' },
    { id: 'affectedLines', label: '涉售后商品行', value: sum.affected, note: '匹配售后条件的成熟商品行', help: '同一行先退货再退款只涉及一次，不是商品件数或质量不良数。' },
    { id: 'observingLines', label: '观察中商品行', value: sum.observing, note: '暂不参与完整窗口涉及率', help: '未满30日保留观察，不按已知部分冒充完整窗口。' },
  ] }
  if (tab.value === 'handling' && handlingView.value === 'staff') { const average = staffAverage(result.value.staffRows); return [
    { id: 'staffActions', label: '期间成功人工动作', value: result.value.staffRows.reduce((n, r) => n + r.actionCount, 0), note: '归实际操作人', help: '只计可靠成功人工动作，系统自动动作、失败与回查不增加工作量。' },
    { id: 'staffRecords', label: '期间涉及售后单', value: staffPeriodIds.value.length, note: '跨人员重新去重', help: '按动作发生、首响完成与结办完成事件关联；不是本期新建单量。', ids: staffPeriodIds.value },
    { id: 'staffResponse', label: '期间平均人工首响', value: formatDuration(average.average), note: `${average.count} 个可靠样本 · 连续自然时间`, help: '只纳入有可靠起止与实际人员的人工响应，包含下班和节假日。' },
  ] }
  if (tab.value === 'handling') return [
    { id: 'customerCount', label: '涉及客户', value: s.customerCount, note: '可信买家身份＋店铺', help: '不按显示名称合并跨店客户或缺失身份。' },
    { id: 'pendingCount', label: '该批截至当前未完成', value: s.pendingCount, note: '只观察该建单批次', help: '不混入客户其他创建日期的售后单。', ids: pendingIds.value },
    { id: 'averageHandling', label: '平均办理耗时', value: formatDuration(s.averageHandlingHours), note: `${s.handlingSamples} 个可靠已完成样本`, help: '未完成或没有可靠起止证据不凑耗时样本。' },
  ]
  return []
})

type EvidenceRow = ReturnType<typeof collectCostEvidence>[number]
type ReasonRow = ReturnType<typeof buildReasonRows>[number]
interface Frame { kind: 'records' | 'lines' | 'reasonSkus' | 'evidence' | 'record'; title: string; ids?: string[]; sku?: SkuRow; lineKind?: 'affected' | 'denominator' | 'observing'; reason?: ReasonRow; evidence?: EvidenceRow[]; record?: AfterSaleRecord; dateMode?: StatisticsExportOptions['dateMode']; page: number; scroll: number }
const drawerOpen = ref(false), frames = ref<Frame[]>([]), drawerContent = ref<HTMLElement>()
const frame = computed(() => frames.value[frames.value.length - 1])
const detailPage = computed({ get: () => frame.value?.page ?? 1, set: (v: number) => { if (frame.value) frame.value.page = v } })
const details = computed(() => detailRecords(demoData, frame.value?.ids ?? []))
const pageDetails = computed(() => details.value.slice((detailPage.value - 1) * 10, detailPage.value * 10))
const lineKind = computed({ get: () => frame.value?.lineKind ?? 'affected', set: (v: 'affected' | 'denominator' | 'observing') => { if (frame.value) { frame.value.lineKind = v; frame.value.page = 1 } } })
const lines = computed(() => { const sku = frame.value?.sku; return sku ? detailOrderLines(demoData, lineKind.value === 'affected' ? sku.affectedLineIds : lineKind.value === 'denominator' ? sku.denominatorLineIds : sku.observingLineIds) : [] })
const pageLines = computed(() => lines.value.slice((detailPage.value - 1) * 10, detailPage.value * 10))
const lineRowKey = (line: OrderLine) => orderLineKey(line.shopId, line.id)
function closeDetails() { drawerOpen.value = false; frames.value = [] }
function openFrame(next: Omit<Frame, 'page' | 'scroll'>, nested = false) {
  const body = drawerContent.value?.closest('.el-drawer__body'); if (frame.value && body) frame.value.scroll = body.scrollTop
  const f = { dateMode: nested ? frame.value?.dateMode : dateMode.value === 'events' ? 'handling' as const : dateMode.value === 'cohort' ? 'cohort' as const : 'created' as const, ...next, page: 1, scroll: 0 }; frames.value = nested ? [...frames.value, f] : [f]; drawerOpen.value = true
  void nextTick(() => { const body = drawerContent.value?.closest('.el-drawer__body'); if (body) body.scrollTop = 0 })
}
function backTo(index: number) { frames.value = frames.value.slice(0, index + 1); void nextTick(() => { const body = drawerContent.value?.closest('.el-drawer__body'); if (body) body.scrollTop = frame.value?.scroll ?? 0 }) }
const drill = (title: string, ids: string[], nested = false) => openFrame({ kind: 'records', title, ids }, nested)
const drillBacklog = (title: string, ids: string[]) => openFrame({ kind: 'records', title, ids, dateMode: 'backlog' })
const drillRate = (sku: SkuRow) => openFrame({ kind: 'lines', title: `${sku.sku} · 30日涉及率`, sku, lineKind: 'affected' })
const openRecord = (record: AfterSaleRecord) => openFrame({ kind: 'record', title: record.no, record }, true)
const drillEvidence = (title = '费用凭证', rows = evidence.value) => openFrame({ kind: 'evidence', title, evidence: rows })
const trendMaximum = computed(() => Math.max(1, ...result.value.trend.map(r => r.count)))
const trendWidth = 900
const trendX = (i: number) => 40 + (i + .5) * (trendWidth - 60) / Math.max(1, result.value.trend.length)
const scenarioMaximum = computed(() => Math.max(1, ...result.value.scenarioRows.map(r => r.count)))
function download(content: string, name: string) { const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8;' })); const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); ElMessage.success('已导出当前查询范围') }
const exportOptions = computed(() => ({ displayCurrency: displayCurrency.value, exchangeQuote, reasonCategory: tab.value === 'problems' ? reasonCategory.value : '全部', skuRows: skuRows.value }))
function exportSummary() { download(createSummaryCsv(demoData, result.value, filter.value, tab.value, handlingView.value, exportOptions.value), `售后统计_${tabLabels[tab.value]}_${rangeText.value.replace(' 至 ', '_')}.csv`) }
function exportDetails() {
  const f = frame.value; if (!f) return
  const title = f.title
  const content = f.kind === 'lines' ? createLineCsv(demoData, lines.value, filter.value, `${title} · ${lineKind.value}`, exportOptions.value) : f.kind === 'evidence' ? createEvidenceCsv(demoData, f.evidence ?? [], filter.value, title, exportOptions.value) : f.kind === 'reasonSkus' ? createReasonSkuCsv(demoData, f.reason!, filter.value, exportOptions.value) : createRecordCsv(demoData, f.kind === 'record' && f.record ? [f.record] : details.value, filter.value, title, { ...exportOptions.value, dateMode: f.dateMode })
  download(content, `售后统计_${title}_明细.csv`)
}
watch([tab, handlingView], () => { closeDetails(); tablePage.value = 1; queryError.value = '' })
watch([displayCurrency, reasonCategory, skuSort, minimumSamples], () => { closeDetails(); tablePage.value = 1 })
</script>

<template>
  <section v-prototype="annotation('overview', '售后统计')" class="as-statistics">
    <div class="as-tabs" role="tablist" aria-label="售后统计分析维度"><button v-for="(label, key) in tabLabels" :key="key" role="tab" :aria-selected="tab === key" :class="{ active: tab === key }" @click="tab = key">{{ label }}</button><span class="as-tab-note">北京时间 · 系统售后单</span><ElButton v-prototype="annotation('export', '统计导出')" class="as-export" :icon="Download" @click="exportSummary">导出统计</ElButton></div>
    <div v-if="tab === 'handling'" class="as-view-switch" v-prototype="annotation('handling-view', '处理分析视角')"><ElRadioGroup v-model="handlingView" aria-label="售后处理分析维度"><ElRadioButton value="customer">客户售后</ElRadioButton><ElRadioButton value="staff">客服办理</ElRadioButton></ElRadioGroup><span>{{ handlingView === 'customer' ? '按建单批次观察客户售后经历' : '期间工作与截至当前积压分别呈现' }}</span></div>
    <div v-prototype="annotation('filters', '单行查询与展示币种')" class="as-filters">
      <div class="as-filter-controls">
        <label class="as-date"><span>{{ dateLabel }}</span><DateRange v-model="dateDraft" precision="date" :width="220" :shortcuts-enabled="false" :aria-prefix="tab === 'sku' ? '售后统计订单批次' : dateMode === 'events' ? '售后统计办理' : '售后统计建单'" /></label>
        <MultiFilter v-model="draft.shopIds" :options="shopOptions" placeholder="店铺" :width="100" />
        <ElInput v-model="draft.sku" class="as-sku-search" aria-label="系统SKU精确搜索" placeholder="系统SKU" clearable @keyup.enter="query" />
        <MultiFilter v-model="draft.origins" :options="asOptions(origins)" placeholder="来源渠道" :width="100" />
        <MultiFilter v-model="draft.scenarios" :options="asOptions(scenarios)" placeholder="来源场景" :width="106" />
        <MultiFilter v-model="draft.methods" :options="asOptions(methods)" placeholder="登记处理方式" :width="118" />
        <ElSelect v-model="displayCurrencyDraft" class="as-display-currency" aria-label="展示币种" placeholder="展示币种"><ElOption v-for="c in displayCurrencies" :key="c" :label="currencyNames[c] || c" :value="c" /></ElSelect>
        <ElButton type="primary" @click="query">查询</ElButton><ElButton @click="reset">重置</ElButton>
      </div>
      <div class="as-filter-meta"><span>已查询：{{ dateLabel }} {{ rangeText }} · {{ scopeText }}</span><span v-if="tab === 'sku'">创建后30日 · 来源／场景／方式仅筛分子</span><span v-else-if="dateMode === 'events'">动作按发生日 · 首响与结办按完成日</span><span v-else>所选建单批次 · 截至当前结果</span><span v-prototype="annotation('exchange', '展示币种与汇率依据')">统一展示 {{ displayCurrency }} · 汇率日期 {{ formatTime(exchangeQuote.asOf) }}</span><button v-if="result.issues.length" class="as-issue-button" :aria-expanded="showIssues" @click="showIssues = !showIssues">{{ result.issues.length }} 项数据待核对</button><span>数据截至 {{ formatTime(result.asOf) }}</span></div>
    </div>
    <p v-if="queryError" class="as-query-error" role="alert">{{ queryError }}</p><div v-if="showIssues" class="as-warning"><p v-for="issue in result.issues" :key="issue">{{ issue }}</p></div>
    <div v-if="cards.length" class="as-metrics"><article v-for="card in cards" :key="card.id" class="as-metric"><div class="as-metric-label">{{ card.label }}<ElTooltip :content="card.help"><button class="as-help" :aria-label="`${card.label}统计口径`"><ElIcon><QuestionFilled /></ElIcon></button></ElTooltip></div><button v-if="card.ids" class="as-metric-value clickable" :data-testid="`metric-${card.id}`" @click="drill(card.label, card.ids)">{{ card.value }}</button><div v-else class="as-metric-value" :data-testid="`metric-${card.id}`">{{ card.value }}</div><span class="as-footnote">{{ card.note }}</span></article></div>

    <template v-if="tab === 'overview'">
      <div class="as-overview-primary"><section class="as-panel"><header class="as-panel-head"><h2>售后建单趋势</h2><span>所选建单批次 · 按北京时间归日</span></header><ElEmpty v-if="!result.records.length" description="当前范围暂无趋势数据" :image-size="45" /><svg v-else class="as-chart" :viewBox="`0 0 ${trendWidth} 170`" role="img" aria-label="每日售后建单数量"><g v-for="tick in [0, .5, 1]" :key="tick"><line x1="35" :x2="trendWidth - 15" :y1="133 - tick * 110" :y2="133 - tick * 110" /><text x="28" :y="137 - tick * 110" text-anchor="end">{{ Math.ceil(trendMaximum * tick) }}</text></g><g v-for="(day, i) in result.trend" :key="day.date"><title>{{ day.date }}：{{ day.count }} 单</title><rect :x="trendX(i) - 6" :y="133 - day.count / trendMaximum * 110" width="12" :height="day.count / trendMaximum * 110" rx="2" /><text v-if="i === 0 || i === result.trend.length - 1 || i % Math.max(1, Math.ceil(result.trend.length / 8)) === 0" :x="trendX(i)" y="155" text-anchor="middle">{{ day.date.slice(5) }}</text></g></svg></section><section class="as-panel"><header class="as-panel-head"><h2>该批需要关注</h2><span>截至当前</span></header><div class="as-attention"><button @click="drill('该批未完成', pendingIds)"><span>未完成售后单</span><strong>{{ pendingIds.length }}</strong></button><button @click="drill('该批已超期', overdueIds)"><span>具有可靠期限的已超期</span><strong>{{ overdueIds.length }}</strong></button><button @click="drill('费用待核实售后单', result.summary.unknownCostRecordIds)"><span>费用待核实</span><strong>{{ result.summary.unknownCostCount }}</strong></button></div></section></div>
      <div class="as-grid"><section class="as-panel"><header class="as-panel-head"><h2>来源场景</h2><span>按系统售后单计数</span></header><div class="as-bars"><div v-for="row in result.scenarioRows" :key="row.key" class="as-bar"><span>{{ row.name }}</span><div class="as-bar-track"><div class="as-bar-fill" :style="{ width: `${row.count / scenarioMaximum * 100}%` }" /></div><button class="as-link" @click="drill(row.name, row.recordIds)">{{ row.count }}</button></div><ElEmpty v-if="!result.scenarioRows.length" description="暂无记录" :image-size="45" /></div></section><section class="as-panel"><header class="as-panel-head"><h2>登记处理方式</h2><span>登记方案量，包含失败与待核查单据</span></header><div class="as-methods"><div v-for="row in result.methodRows" :key="row.key" class="as-method"><span>{{ row.name }}</span><button class="as-link" @click="drill(`登记${row.name}`, row.recordIds)">{{ row.count }} 单</button></div></div><div class="as-panel-foot">登记方式与实际执行结果分别统计。</div></section></div>
      <section v-prototype="annotation('execution', '实际执行结果')" class="as-panel"><header class="as-panel-head"><h2>实际执行结果</h2><span>该批截至当前的独立执行证据</span><ElButton link type="primary" @click="drill('未取得独立执行结果', missingExecutionIds)">{{ missingExecutionIds.length }} 单未取得独立结果</ElButton></header><ElTable :data="executionRows" class="as-table as-execution-table" empty-text="当前范围未取得独立执行结果"><ElTableColumn label="执行事项" min-width="150"><template #default="{ row }">{{ executionKind[row.kind as keyof typeof executionKind] }}</template></ElTableColumn><ElTableColumn label="结果" min-width="130"><template #default="{ row }"><span :class="`as-outcome-${row.outcome}`">{{ executionOutcome[row.outcome as keyof typeof executionOutcome] }}</span></template></ElTableColumn><ElTableColumn prop="count" label="去重执行证据数" min-width="150" align="right" /><ElTableColumn label="涉及售后单" min-width="140" align="right"><template #default="{ row }"><button class="as-link" @click="drill(`${executionKind[row.kind as keyof typeof executionKind]} · ${executionOutcome[row.outcome as keyof typeof executionOutcome]}`, row.recordIds)">{{ row.recordIds.length }}</button></template></ElTableColumn></ElTable></section>
      <section class="as-panel"><header class="as-panel-head"><h2>店铺售后汇总</h2><span>客户 {{ result.summary.customerCount }} · 各维度独立去重</span><ElButton link type="primary" @click="drill('全部售后单', allIds)">查看全部售后单</ElButton></header><ElTable :data="result.shopRows" class="as-table" row-key="key" empty-text="暂无售后记录"><ElTableColumn prop="name" label="店铺" min-width="180" /><ElTableColumn prop="count" label="系统售后单" min-width="120" align="right"><template #default="{ row }"><button class="as-link" @click="drill(row.name, row.recordIds)">{{ row.count }}</button></template></ElTableColumn><ElTableColumn prop="orderCount" label="涉及订单" min-width="120" align="right" /><ElTableColumn prop="customerCount" label="涉及客户" min-width="120" align="right" /><ElTableColumn prop="completedCount" label="该批内部已完成" min-width="150" align="right" /><ElTableColumn prop="pendingCount" label="该批未完成" min-width="130" align="right" /></ElTable></section>
    </template>

    <section v-else-if="tab === 'sku'" v-prototype="annotation('sku', 'SKU涉及率与订单批次')" class="as-panel"><header class="as-panel-head"><h2>SKU售后分析</h2><span>按商品行计量 · 内部30日观察口径</span></header><div class="as-analysis-tools"><label>排序<ElSelect v-model="skuSort" aria-label="SKU排序" style="width:160px"><ElOption label="售后单量从高到低" value="count" /><ElOption label="涉及率从高到低" value="rate" /><ElOption label="已分摊成本从高到低" value="cost" /></ElSelect></label><label>最小成熟样本<ElInputNumber v-model="minimumSamples" aria-label="最小成熟样本" :min="0" :step="1" :precision="0" controls-position="right" style="width:110px" /></label><span class="as-muted">金额统一展示 {{ displayCurrency }}</span><span class="as-muted">{{ skuRows.length }} 个SKU分组 · 按涉及率判断时请同时查看样本量</span></div><ElTable :data="pageSkus" class="as-table as-sku-table" row-key="key" empty-text="暂无符合样本条件的SKU"><ElTableColumn label="系统SKU／商品" min-width="210" fixed="left"><template #default="{ row }"><div class="as-name">{{ row.sku }}</div><div class="as-muted">{{ row.title }}</div></template></ElTableColumn><ElTableColumn prop="soldLineCount" label="成熟商品行" min-width="110" align="right" /><ElTableColumn prop="affectedLineCount" label="涉售后商品行" min-width="120" align="right" /><ElTableColumn label="30日涉及率" min-width="160" align="right"><template #default="{ row }"><button class="as-link" @click="drillRate(row as SkuRow)">{{ rateText(row.rate) }}</button><div v-if="row.rate === null" class="as-row-issue">{{ row.rateNote }}</div></template></ElTableColumn><ElTableColumn prop="observingLineCount" label="观察中商品行" min-width="120" align="right" /><ElTableColumn label="30日关联售后单" min-width="140" align="right"><template #default="{ row }"><button class="as-link" @click="drill(`${row.sku} · 30日关联售后单`, row.recordIds)">{{ row.recordCount }}</button></template></ElTableColumn><ElTableColumn label="已确认已分摊成本" min-width="180" align="right"><template #default="{ row }">{{ convertedMoney(row.confirmedCosts) }}<div v-if="conversionMissing(row.confirmedCosts)" class="as-row-issue">汇率待核实</div><div v-if="row.unallocatedCount" class="as-row-issue">{{ row.unallocatedCount }} 笔尚未分摊</div></template></ElTableColumn></ElTable><ElPagination v-model:current-page="tablePage" :total="skuRows.length" :page-size="10" layout="total, prev, pager, next" class="as-pagination" /></section>

    <template v-else-if="tab === 'cost'">
      <section v-prototype="annotation('costs', '统一币种费用与凭证')" class="as-panel">
        <header class="as-panel-head"><h2>{{ applied.sku ? '关联售后费用与SKU分摊' : '售后费用摘要' }}</h2><span>统一展示 {{ displayCurrency }} · 逐凭证折算后汇总 · 支出与回收分开</span></header>
        <div v-if="applied.sku" class="as-context-note">筛选 {{ applied.sku }} 命中的售后单可能包含其他商品。关联费用为整笔凭证金额，所选SKU仅采用核实份额。</div>
        <div v-if="exchangeMissingCount" class="as-context-note as-rate-warning">{{ exchangeMissingCount }} 条凭证缺少必要汇率，受影响合计待核实，不以其他已折算部分代替完整金额。</div>
        <div class="as-metrics as-cost-metrics"><article v-for="card in costCards" :key="card.id" class="as-metric"><div class="as-metric-label">{{ card.label }}</div><div class="as-metric-value money" :data-testid="'metric-' + card.id">{{ card.value }}</div><span class="as-footnote">{{ card.note }}</span></article></div>
        <div v-if="applied.sku" class="as-sku-allocation"><span>已确认分摊至 {{ applied.sku }}</span><strong data-testid="metric-allocatedCosts">{{ formatMoney(costSummary.allocated.value, displayCurrency) }}</strong><span v-if="costSummary.allocated.missingCount" class="as-row-issue">汇率待核实</span><span class="as-muted">{{ costSummary.unallocatedCount }} 条确认支出凭证尚无完整分摊依据</span></div>
        <div class="as-cost-coverage"><button class="as-link" data-testid="metric-unknownCostCount" @click="drill('费用待核实售后单', result.summary.unknownCostRecordIds)">{{ result.summary.unknownCostCount }}</button><span>张售后单费用仍待核实，选择展示币种不改变单据范围和确认状态。</span></div>
      </section>
      <section class="as-panel"><header class="as-panel-head"><h2>费用项目</h2><span>统一展示 {{ displayCurrency }} · 保留各原币凭证</span><ElButton link type="primary" @click="drillEvidence()">查看全部凭证</ElButton></header><ElTable :data="costRows" class="as-table as-cost-table" row-key="key" empty-text="当前范围暂无费用凭证"><ElTableColumn prop="kind" label="费用项目" min-width="170" /><ElTableColumn :label="'已确认金额（' + displayCurrency + '）'" min-width="180" align="right"><template #default="{ row }">{{ formatMoney(row.confirmed) }}<div v-if="row.missingCount" class="as-row-issue">部分汇率待核实</div></template></ElTableColumn><ElTableColumn :label="'待核实金额（' + displayCurrency + '）'" min-width="180" align="right"><template #default="{ row }">{{ formatMoney(row.pending) }}</template></ElTableColumn><ElTableColumn prop="confirmedCount" label="已确认凭证" min-width="120" align="right" /><ElTableColumn prop="pendingCount" label="待核实凭证" min-width="120" align="right" /><ElTableColumn label="明细" width="110"><template #default="{ row }"><ElButton link type="primary" @click="drillEvidence(row.kind + ' · ' + displayCurrency, evidence.filter(e => e.kind === row.kind))">查看凭证</ElButton></template></ElTableColumn></ElTable></section>
    </template>

    <template v-else-if="tab === 'handling'">
      <section v-prototype="annotation('handling', '客户与客服处理分析')" class="as-panel"><header class="as-panel-head"><h2>{{ handlingView === 'customer' ? '客户售后经历' : '期间办理情况' }}</h2><span>{{ handlingView === 'customer' ? `所选建单批次截至结果 · 多订单售后客户 ${repeatCustomerCount}` : `${rangeText} · 按实际动作与完成时间` }}</span></header><ElTable :data="pageHandling" class="as-table as-handling-table" row-key="key" empty-text="当前范围暂无办理记录"><ElTableColumn :label="handlingView === 'customer' ? '客户／店铺' : '客服'" min-width="185" fixed="left"><template #default="{ row }">{{ row.name }}<div v-if="handlingView === 'customer'" class="as-muted">{{ shopName(demoData, row.shopId) }}</div></template></ElTableColumn><ElTableColumn label="涉及售后单" min-width="120" align="right"><template #default="{ row }"><button class="as-link" @click="drill(`${row.name} · 涉及售后单`, row.recordIds)">{{ row.recordCount }}</button></template></ElTableColumn><ElTableColumn v-if="handlingView === 'customer'" prop="orderCount" label="涉及订单" min-width="100" align="right" /><ElTableColumn v-else prop="actionCount" label="成功人工动作" min-width="130" align="right" /><ElTableColumn prop="completedCount" :label="handlingView === 'customer' ? '该批内部已完成' : '期间明确结办'" min-width="140" align="right" /><ElTableColumn v-if="handlingView === 'customer'" label="该批未完成" min-width="115" align="right"><template #default="{ row }"><button class="as-link" @click="drill(`${row.name} · 该批未完成`, row.pendingRecordIds)">{{ row.currentPending }}</button></template></ElTableColumn><ElTableColumn v-if="handlingView === 'customer'" prop="overdueCount" label="该批已超期" min-width="105" align="right" /><ElTableColumn label="平均办理耗时" min-width="145" align="right"><template #default="{ row }">{{ formatDuration(row.averageHandlingHours) }}<div class="as-muted">{{ row.handlingSamples }} 个样本</div></template></ElTableColumn><ElTableColumn label="平均人工首响" min-width="145" align="right"><template #default="{ row }">{{ formatDuration(row.firstResponseHours) }}<div class="as-muted">{{ row.responseSamples }} 个样本</div></template></ElTableColumn></ElTable><ElPagination v-model:current-page="tablePage" :total="handlingRows.length" :page-size="10" layout="total, prev, pager, next" class="as-pagination" /></section>
      <section v-if="handlingView === 'staff'" v-prototype="annotation('backlog', '截至当前积压')" class="as-panel"><header class="as-panel-head"><h2>截至当前积压</h2><span>{{ formatTime(result.asOf) }} 北京时间 · 全部创建日期</span></header><div class="as-backlog-summary"><button @click="drillBacklog('当前待处理售后单', staffPendingIds)"><span>当前待处理售后单</span><strong data-testid="metric-staffPending">{{ staffPendingIds.length }}</strong></button><button @click="drillBacklog('当前已超期', backlog.overdueIds)"><span>有可靠期限的已超期</span><strong>{{ backlog.overdueIds.length }}</strong></button><button @click="drillBacklog('负责人未记录', backlog.unownedIds)"><span>负责人未记录</span><strong>{{ backlog.unownedIds.length }}</strong></button></div><div class="as-age-rows"><button v-for="age in backlog.ageRows" :key="age.label" @click="drillBacklog(`当前积压 · 建单${age.label}`, age.recordIds)"><span>{{ age.label }}</span><strong>{{ age.count }}</strong></button></div><ElTable :data="result.staffRows.filter(r => r.currentPending)" class="as-table as-backlog-table" row-key="key"><ElTableColumn prop="name" label="截至负责人" min-width="160" /><ElTableColumn label="当前未完成" min-width="130" align="right"><template #default="{ row }"><button class="as-link" @click="drillBacklog(`${row.name} · 当前积压`, row.pendingRecordIds)">{{ row.currentPending }}</button></template></ElTableColumn><ElTableColumn prop="overdueCount" label="有可靠期限的已超期" min-width="190" align="right" /></ElTable><div class="as-panel-foot">积压仅受已查询店铺和业务条件约束，不受办理日期截断。分组为建单至截至时点的自然天龄，不代表最后一次跟进后的等待时长。</div></section>
    </template>

    <section v-else v-prototype="annotation('problems', '售后原因与分析分类')" class="as-panel"><header class="as-panel-head"><h2>售后原因分析</h2><span>原始原因保留 · 分析分类不代表责任归属</span></header><div class="as-analysis-tools"><label>分析分类<ElSelect v-model="reasonCategory" aria-label="原因分析分类" style="width:150px"><ElOption v-for="c in reasonCategories" :key="c" :label="c" :value="c" /></ElSelect></label><span class="as-muted">{{ reasonRows.length }} 个原始原因 · 同一单可命中多个原因，分组数不相加</span><ElButton link type="primary" @click="drill('商品关联待核实', result.records.filter(r => r.items.some(i => !i.sku || i.linkage !== 'verified')).map(r => r.internalId))">商品关联待核实 {{ result.summary.unlinkedSkuCount }} 单</ElButton></div><ElTable :data="reasonRows" class="as-table as-reason-table" row-key="name" empty-text="当前分类暂无售后原因"><ElTableColumn prop="category" label="分析分类" min-width="120" /><ElTableColumn prop="name" label="原始售后原因" min-width="190" /><ElTableColumn label="涉及售后单" min-width="130" align="right"><template #default="{ row }"><button class="as-link" @click="drill(row.name, row.recordIds)">{{ row.count }}</button></template></ElTableColumn><ElTableColumn prop="orderCount" label="涉及订单" min-width="115" align="right" /><ElTableColumn label="涉及SKU" min-width="125" align="right"><template #default="{ row }"><button class="as-link" @click="openFrame({ kind: 'reasonSkus', title: `${row.name} · SKU分布`, reason: row as ReasonRow })">{{ row.skuCount }}</button></template></ElTableColumn><ElTableColumn prop="pendingCount" label="该批未完成" min-width="130" align="right" /><ElTableColumn label="已确认可归因成本" min-width="180" align="right"><template #default="{ row }"><div class="as-money-list">{{ convertedMoney(row.confirmedCosts) }}</div><div v-if="conversionMissing(row.confirmedCosts)" class="as-row-issue">汇率待核实</div></template></ElTableColumn></ElTable></section>

    <ElDrawer v-model="drawerOpen" :title="frame?.title ?? '统计明细'" size="min(1120px, 94vw)" append-to-body class="as-drawer" destroy-on-close>
      <div ref="drawerContent" v-prototype="annotation('details', '统计明细与来源证据')">
        <nav v-if="frames.length > 1" class="as-detail-path" aria-label="统计明细路径"><button v-for="(item, i) in frames" :key="i" :disabled="i === frames.length - 1" @click="backTo(i)">{{ item.title }}</button><ElButton @click="backTo(frames.length - 2)">返回上一级</ElButton></nav>
        <div class="as-detail-toolbar"><div><strong v-if="frame?.kind === 'records'">{{ details.length }} 张售后单</strong><strong v-else-if="frame?.kind === 'lines'">{{ lines.length }} 条订单商品行</strong><strong v-else-if="frame?.kind === 'evidence'">{{ frame.evidence?.length }} 条唯一费用凭证</strong><span>北京时间 · {{ scopeText }}</span></div><ElButton :icon="Download" @click="exportDetails">导出明细</ElButton></div>
        <template v-if="frame?.kind === 'records'"><ElTable :data="pageDetails" class="as-table as-detail-table" row-key="internalId" empty-text="没有符合条件的售后单"><ElTableColumn label="售后单／来源" min-width="215"><template #default="{ row }"><button class="as-link" @click="openRecord(row as AfterSaleRecord)">{{ row.no }}</button><div class="as-muted">{{ row.scenario }} · {{ row.sourceId || '内部主动发起' }}</div></template></ElTableColumn><ElTableColumn label="店铺" min-width="150"><template #default="{ row }">{{ shopName(demoData, row.shopId) }}</template></ElTableColumn><ElTableColumn prop="method" label="登记处理方式" min-width="130" /><ElTableColumn label="商品" min-width="180"><template #default="{ row }"><div v-for="(item, i) in row.items" :key="i">{{ item.sku || 'SKU待关联' }}<div class="as-muted">{{ item.title }}</div></div></template></ElTableColumn><ElTableColumn prop="status" label="内部办理状态" min-width="120" /><ElTableColumn label="建单时间" width="155"><template #default="{ row }">{{ formatTime(row.createdAt) }}</template></ElTableColumn><ElTableColumn label="操作" width="100" fixed="right"><template #default="{ row }"><ElButton link type="primary" @click="openRecord(row as AfterSaleRecord)">查看记录</ElButton></template></ElTableColumn></ElTable><ElPagination v-model:current-page="detailPage" :total="details.length" :page-size="10" layout="total, prev, pager, next" class="as-pagination" /></template>
        <template v-else-if="frame?.kind === 'lines'"><p class="as-detail-note">{{ frame.sku?.rateNote }}。订单创建批次：{{ appliedRanges.cohort.join(' 至 ') }}；连续观察30日。</p><ElRadioGroup v-model="lineKind" aria-label="SKU涉及率明细" size="small"><ElRadioButton value="affected">分子：涉售后商品行</ElRadioButton><ElRadioButton value="denominator">分母：成熟商品行</ElRadioButton><ElRadioButton value="observing">观察中</ElRadioButton></ElRadioGroup><ElTable :data="pageLines" :row-key="lineRowKey" class="as-table"><ElTableColumn prop="orderNo" label="原订单" min-width="180" /><ElTableColumn label="店铺" min-width="150"><template #default="{ row }">{{ shopName(demoData, row.shopId) }}</template></ElTableColumn><ElTableColumn prop="sku" label="系统SKU" min-width="130" /><ElTableColumn prop="title" label="商品" min-width="180" /><ElTableColumn prop="quantity" label="购买件数" width="100" /><ElTableColumn label="订单创建时间" min-width="160"><template #default="{ row }">{{ formatTime(row.createdAt) }}</template></ElTableColumn></ElTable><ElPagination v-model:current-page="detailPage" :total="lines.length" :page-size="10" layout="total, prev, pager, next" class="as-pagination" /></template>
        <ElTable v-else-if="frame?.kind === 'reasonSkus'" :data="frame.reason?.skus" class="as-table as-reason-sku-table" row-key="sku" empty-text="该原因暂无可靠关联SKU"><ElTableColumn prop="sku" label="系统SKU" min-width="180" /><ElTableColumn prop="title" label="商品" min-width="220" /><ElTableColumn label="涉及售后单" min-width="140"><template #default="{ row }"><button class="as-link" @click="drill(`${frame?.reason?.name} · ${row.sku}`, row.recordIds, true)">{{ row.count }}</button></template></ElTableColumn></ElTable>
        <ElTable v-else-if="frame?.kind === 'evidence'" :data="frame.evidence" class="as-table as-evidence-table" row-key="key" empty-text="该项暂无有效费用凭证"><ElTableColumn label="费用凭证／来源" min-width="200"><template #default="{ row }">{{ row.evidenceId }}<div class="as-muted">{{ row.source }}</div></template></ElTableColumn><ElTableColumn prop="kind" label="费用项目" min-width="150" /><ElTableColumn :label="'折算金额（' + displayCurrency + '）'" min-width="145" align="right"><template #default="{ row }">{{ convertedValue(row.value, row.currency) }}</template></ElTableColumn><ElTableColumn label="原币金额／换算率" min-width="205"><template #default="{ row }">{{ formatMoney(row.value, row.currency) }}<div class="as-muted">{{ conversionRate(row.currency) }}</div></template></ElTableColumn><ElTableColumn label="确认状态" min-width="100"><template #default="{ row }">{{ row.status === 'confirmed' ? '已确认' : '待核实' }}</template></ElTableColumn><ElTableColumn v-if="applied.sku" label="所选SKU核实份额" min-width="165"><template #default="{ row }">{{ convertedValue(row.allocatedValue, row.currency) }}</template></ElTableColumn><ElTableColumn label="关联售后单" min-width="250"><template #default="{ row }"><button v-for="record in detailRecords(demoData, row.recordIds)" :key="record.internalId" class="as-link as-record-link" @click="openRecord(record)">{{ record.no }}</button></template></ElTableColumn></ElTable>
        <RecordDetail v-else-if="frame?.kind === 'record' && frame.record" :record="frame.record" :data="demoData" :display-currency="displayCurrency" :exchange-quote="exchangeQuote" />
      </div>
    </ElDrawer>
  </section>
</template>
