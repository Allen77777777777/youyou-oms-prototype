<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { Download, QuestionFilled, ArrowLeft, Document } from '@element-plus/icons-vue'
import { ElButton, ElDialog, ElDrawer, ElEmpty, ElIcon, ElMessage, ElPagination, ElRadioButton, ElRadioGroup, ElTable, ElTableColumn, ElTooltip } from 'element-plus'
import DateRange from '@/组件/筛选/时间范围.vue'
import MultiFilter from '@/组件/筛选/多选筛选.vue'
import { 校验时间范围 } from '@/组件/筛选/筛选工具'
import { demoKpiData, REVIEW_AS_OF } from './演示数据'
import { createDefaultKpiFilter, formatKpiDuration, isResponseDurationMetric, kpiMetricLabels, metricDetails, queryKpi, UNRECORDED_STAFF, UNASSOCIATED_SHOP } from './统计模型'
import type { KpiDetail, KpiFilter, KpiMetric } from './统计模型'
import { backlogColumns, responseColumns, createKpiDetailsCsv, createKpiSummaryCsv, formatKpiTime, metricValue, shopColumns, staffColumns } from './展示工具'
import { queryKpiComparison } from './分析模型'
import AnalysisPanels from './分析面板.vue'
import { kpiAnnotation as annotation } from './标注'
import './样式.css'

const tab = ref<'staff' | 'shop'>('staff')
const tableMode = ref<'activity' | 'backlog' | 'response'>('activity')
const initial = () => ({ ...createDefaultKpiFilter(), shopIds: [] as string[], staffIds: [] as string[] })
const draft = reactive(initial()), applied = reactive(initial())
const draftDates = ref<string[]>([draft.startDate, draft.endDate])
const queryError = ref('')
const filter = computed<KpiFilter>(() => ({ ...applied, shopIds: [...applied.shopIds], staffIds: tab.value === 'staff' ? [...applied.staffIds] : [], asOf: REVIEW_AS_OF }))
const comparison = computed(() => queryKpiComparison(demoKpiData, filter.value))
const result = computed(() => comparison.value.current)
const rows = computed(() => tab.value === 'staff' ? result.value.staffRows : result.value.shopRows)
const columns = computed(() => tableMode.value === 'response' ? responseColumns : tab.value === 'staff' ? staffColumns : tableMode.value === 'backlog' ? backlogColumns : shopColumns)
const responseMetrics: KpiMetric[] = ['medianResponseMinutes', 'p90ResponseMinutes', 'responseSamples']
const shopOptions = computed(() => [...demoKpiData.shops.map(item => ({ value: item.id, label: item.name })), { value: UNASSOCIATED_SHOP, label: '未关联店铺' }])
const staffOptions = computed(() => [...demoKpiData.staff.map(item => ({ value: item.id, label: item.name })), { value: UNRECORDED_STAFF, label: '人员未记录' }])
const scopeNames = (ids: string[], options: { value: string; label: string }[], all: string) => ids.length ? ids.map(id => options.find(option => option.value === id)?.label ?? id).join('、') : all
const shopScope = computed(() => scopeNames(applied.shopIds, shopOptions.value, '全部店铺'))
const staffScope = computed(() => tab.value === 'staff' ? scopeNames(applied.staffIds, staffOptions.value, '全部客服') : '不按客服筛选')
const rangeLabel = computed(() => `${applied.startDate} 至 ${applied.endDate}`)
const metrics = computed<KpiMetric[]>(() => tab.value === 'staff'
  ? ['humanMessages', 'repliedConversations', 'averageResponseMinutes', 'ticketsCompleted']
  : ['incomingConversations', 'humanMessages', 'automaticMessages', 'averageResponseMinutes', 'pendingReplies'])
const helps: Partial<Record<KpiMetric, string>> = {
  humanMessages: '按成功发送的人工消息计数，重复回执与重试不重复计入；自动回复独立统计。',
  repliedConversations: '期间内有人工成功回复的会话去重数。多人回复同一会话时，合计独立去重。',
  averageResponseMinutes: '本轮首次买家来信至首次人工成功回复的平均耗时。包含下班、周末和节假日；自动回复不停止计时；未回复不计入均值。',
  medianResponseMinutes: '有效响应轮次按耗时排序后的中间值；偶数样本取中间两项均值。夜间、周末和节假日连续计时。',
  p90ResponseMinutes: '有效响应轮次按耗时从小到大排序，取第向上取整(90%×样本数)项，即九成样本的耗时不超过该值；仅用于分析。',
  responseSamples: '期间内完成人工首响、具有可靠起止时刻的响应轮次数，三种耗时均由这批样本计算。',
  incomingConversations: '期间有有效买家来信的会话数，按店铺和会话独立去重。',
  automaticMessages: '系统成功发送的自动回复，单独计数，不计入客服人工回复量。',
  ticketsCompleted: '按首次有效完成事件归日，工单独立去重。重复完成不重复计数；放弃另计。',
  ticketsAbandoned: '按首次有效放弃事件归日，独立去重。放弃不等于完成；两项不可相加为处理总量。',
  pendingReplies: '截至统计时点仍待人工回复的会话，含跨期积压。多人负责时，每位处理人可查到该会话，合计按会话去重。',
}
function help(metric: KpiMetric): string {
  return helps[metric] ?? (metric.endsWith('Overdue') ? '截至统计时点，卖家仍有必办事项且已超过来源明确的平台截止时间。不包含工单内部期限。'
    : metric.endsWith('Pending') ? '截至统计时点仍需卖家办理的来源对象，包含期间开始前的积压；等待买家或平台不计入卖家待办。'
      : '期间内有已确认人工办理事实的业务对象数，按对象去重，不等于平台结案或退款到账。')
}
function foot(metric: KpiMetric): string {
  if (metric === 'averageResponseMinutes') return `${result.value.summary.responseSamples} 个响应样本 · 连续自然时间`
  if (metric === 'humanMessages') return '仅计确认成功的人工发送'
  if (metric === 'repliedConversations' || metric === 'incomingConversations') return '按会话独立去重'
  if (metric === 'ticketsCompleted') return `已放弃 ${result.value.summary.ticketsAbandoned} 单 · 单独统计`
  if (metric === 'automaticMessages') return '系统自动接待 · 不计个人工作量'
  return '包含期初积压 · 按统计截止时点'
}
const isOverdue = (key: KpiMetric) => key.endsWith('Overdue')
function query() {
  queryError.value = draftDates.value.length === 2 ? 校验时间范围(draftDates.value) ?? '' : '请选择完整的统计日期'
  if (queryError.value) return
  const candidate = { startDate: draftDates.value[0]!, endDate: draftDates.value[1]!, shopIds: [...draft.shopIds], staffIds: [...draft.staffIds] }
  queryError.value = queryKpi(demoKpiData, { ...candidate, staffIds: tab.value === 'staff' ? candidate.staffIds : [], asOf: REVIEW_AS_OF }).error ?? ''
  if (queryError.value) return
  Object.assign(applied, candidate)
  drawerOpen.value = false
}
function reset() { Object.assign(draft, initial()); draftDates.value = [draft.startDate, draft.endDate]; query() }
const shortcuts = ['今天', '昨天', '本周', '本月'] as const
function shortcut(kind: typeof shortcuts[number]) {
  const today = formatKpiTime(REVIEW_AS_OF).slice(0, 10)
  const end = new Date(`${today}T00:00:00+08:00`)
  let start = new Date(end)
  if (kind === '昨天') { start = new Date(+start - 86400000); end.setTime(+start) }
  if (kind === '本周') { const day = new Date(+start + 8 * 3600000).getUTCDay() || 7; start = new Date(+start - (day - 1) * 86400000) }
  if (kind === '本月') start = new Date(`${today.slice(0, 7)}-01T00:00:00+08:00`)
  draftDates.value = [formatKpiTime(start.toISOString()).slice(0, 10), formatKpiTime(end.toISOString()).slice(0, 10)]
}

const drawerOpen = ref(false), detailPage = ref(1)
const drillMetric = ref<KpiMetric>('humanMessages')
const drillScope = ref<{ group: 'all' | 'staff' | 'shop'; id?: string }>({ group: 'all' })
const drillName = ref('当前范围')
const selectedDetails = ref<KpiDetail[] | null>(null)
const selectedTitle = ref(''), selectedDescription = ref('')
const detailTitle = computed(() => selectedTitle.value || `${kpiMetricLabels[drillMetric.value]} · ${drillName.value}`)
const details = computed(() => selectedDetails.value ?? metricDetails(result.value, drillMetric.value, drillScope.value))
const responseDrill = computed(() => isResponseDurationMetric(drillMetric.value) || drillMetric.value === 'responseSamples')
const pageDetails = computed(() => details.value.slice((detailPage.value - 1) * 10, detailPage.value * 10))
const selectedRecord = ref<KpiDetail | null>(null)
const recordOpen = ref(false)
function drill(metric: KpiMetric, id?: string, name?: string) {
  selectedDetails.value = null; selectedTitle.value = ''; selectedDescription.value = ''
  drillMetric.value = metric
  drillScope.value = id ? { group: tab.value, id } : { group: 'all' }
  drillName.value = name ?? '当前范围'
  detailPage.value = 1
  drawerOpen.value = true
}
function drillSelection(metric: KpiMetric, rows: KpiDetail[], title: string, description: string) {
  drillMetric.value = metric; drillScope.value = { group: 'all' }; drillName.value = title
  selectedDetails.value = rows; selectedTitle.value = title; selectedDescription.value = description
  detailPage.value = 1; drawerOpen.value = true
}
function openRecord(row: KpiDetail) { selectedRecord.value = row; recordOpen.value = true }
watch(tab, () => { drawerOpen.value = false; tableMode.value = 'activity' })
const summaryCells = ({ columns: tableColumns }: { columns: Array<{ property?: string }> }) => tableColumns.map((column, i) => i === 0 ? '合计（独立去重）' : metricValue(result.value.summary, column.property?.replace('metrics.', '') as KpiMetric))

function download(content: string, filename: string) {
  const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8;' }))
  const link = document.createElement('a'); link.href = url; link.download = filename
  document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000)
  ElMessage.success('已导出当前查询范围')
}
function exportSummary() {
  const exportColumns = [...new Set(tab.value === 'staff' ? [...staffColumns, ...responseColumns] : [...shopColumns, ...backlogColumns, ...responseColumns])]
  download(createKpiSummaryCsv(result.value, filter.value, tab.value, exportColumns, shopScope.value, staffScope.value), `客服KPI_${tab.value === 'staff' ? '客服统计' : '店铺统计'}_${applied.startDate}_${applied.endDate}.csv`)
}
function exportDetails() {
  download(createKpiDetailsCsv(details.value, filter.value, result.value.asOf, drillMetric.value, drillName.value, shopScope.value, staffScope.value, selectedTitle.value || kpiMetricLabels[drillMetric.value]), `客服KPI_${selectedTitle.value || kpiMetricLabels[drillMetric.value]}_${applied.startDate}_${applied.endDate}.csv`)
}
</script>

<template>
  <section v-prototype="annotation('overview', '客服KPI统计页面')" class="kpi-page">
    <div class="kpi-tabs" role="tablist" aria-label="客服统计维度">
      <button role="tab" :aria-selected="tab === 'staff'" :class="{ active: tab === 'staff' }" @click="tab = 'staff'">客服统计</button>
      <button role="tab" :aria-selected="tab === 'shop'" :class="{ active: tab === 'shop' }" @click="tab = 'shop'">店铺统计</button>
      <span class="kpi-tab-note">北京时间 · 响应按连续自然时间</span>
    </div>
    <div v-prototype="annotation('filters', '统计筛选与截止时点')" class="kpi-filters">
      <label class="kpi-date-label"><span>统计日期</span><DateRange :model-value="draftDates" precision="date" :width="270" :shortcuts-enabled="false" aria-prefix="客服KPI统计" hint="按北京时间首尾整日，待办统计至期末或数据截至时点" @update:model-value="draftDates = $event ?? []" /></label>
      <MultiFilter v-model="draft.shopIds" :options="shopOptions" placeholder="店铺" :width="150" />
      <MultiFilter v-if="tab === 'staff'" v-model="draft.staffIds" :options="staffOptions" placeholder="客服" :width="140" />
      <ElButton type="primary" @click="query">查询</ElButton><ElButton @click="reset">重置</ElButton>
      <div class="kpi-filter-spacer" />
      <ElButton v-prototype="annotation('export', '导出统计汇总')" :icon="Download" @click="exportSummary">导出统计</ElButton>
      <div class="kpi-filter-secondary"><div class="kpi-shortcuts"><button v-for="item in shortcuts" :key="item" @click="shortcut(item)">{{ item }}</button></div><span>已查询：{{ rangeLabel }}</span><ElTooltip v-if="result.issues.length" :content="result.issues.map(item => item.reason).filter((item, i, all) => all.indexOf(item) === i).join('；')" placement="bottom"><span class="kpi-data-issue" tabindex="0">{{ result.issues.length }} 条记录待核对</span></ElTooltip><span>数据截至 {{ formatKpiTime(result.asOf) }}</span></div>
    </div>
    <p v-if="queryError" class="kpi-query-error" role="alert">{{ queryError }}</p>
    <div v-prototype="annotation('metrics', '统计指标与人工响应')" class="kpi-metrics" :style="{ '--metric-count': metrics.length }">
      <article v-for="metric in metrics" :key="metric" class="kpi-metric">
        <div class="kpi-metric-label">{{ kpiMetricLabels[metric] }}<ElTooltip :content="help(metric)" placement="top"><button class="kpi-help" :aria-label="`${kpiMetricLabels[metric]}统计口径`"><ElIcon><QuestionFilled /></ElIcon></button></ElTooltip></div>
        <button class="kpi-metric-value" :data-testid="`metric-${metric}`" @click="drill(metric)">{{ metricValue(result.summary, metric) }}</button>
        <span class="kpi-metric-foot">{{ foot(metric) }}</span>
      </article>
    </div>

    <section v-prototype="annotation('response-analysis', '人工响应分布分析')" class="kpi-response-band">
      <div class="kpi-response-heading"><h2>人工响应分析</h2><span>仅含已人工回复的有效轮次</span></div>
      <div v-for="metric in responseMetrics" :key="metric" class="kpi-response-cell"><span>{{ kpiMetricLabels[metric] }}<ElTooltip :content="help(metric)"><button class="kpi-help" :aria-label="`${kpiMetricLabels[metric]}统计口径`"><ElIcon><QuestionFilled /></ElIcon></button></ElTooltip></span><button :data-testid="`response-${metric}`" @click="drill(metric)">{{ metricValue(result.summary, metric) }}</button></div>
    </section>

    <section v-prototype="annotation('table', '客服与店铺统计明细表')" class="kpi-panel kpi-table-panel">
      <header class="kpi-panel-head"><h2>{{ tab === 'staff' ? '客服工作明细' : '店铺统计明细' }}</h2><span>{{ rows.length }} {{ tab === 'staff' ? '个人员分组' : '个店铺分组' }}</span><ElRadioGroup v-model="tableMode" size="small" aria-label="统计内容"><ElRadioButton value="activity">工作量</ElRadioButton><ElRadioButton value="response">响应分析</ElRadioButton><ElRadioButton v-if="tab === 'shop'" value="backlog">待办与逾期</ElRadioButton></ElRadioGroup></header>
      <ElTable :key="`${tab}-${tableMode}`" :data="rows" class="kpi-table" row-key="id" show-summary :summary-method="summaryCells" empty-text="当前范围暂无统计记录" max-height="394" stripe>
        <ElTableColumn prop="name" :label="tab === 'staff' ? '客服' : '店铺'" :width="tab === 'staff' ? 162 : 180" fixed="left"><template #default="{ row }"><div class="kpi-identity"><strong :title="row.name">{{ row.name }}</strong></div></template></ElTableColumn>
        <ElTableColumn v-for="metric in columns" :key="metric" :prop="`metrics.${metric}`" :label="kpiMetricLabels[metric]" :min-width="isResponseDurationMetric(metric) ? 150 : 113" align="right" sortable>
          <template #header><span class="kpi-column-label">{{ kpiMetricLabels[metric] }}<ElTooltip :content="help(metric)" placement="top"><button class="kpi-help" :aria-label="`${kpiMetricLabels[metric]}列口径`"><ElIcon><QuestionFilled /></ElIcon></button></ElTooltip></span></template>
          <template #default="{ row }"><button class="kpi-table-number" :class="{ overdue: isOverdue(metric) && (row.metrics[metric] ?? 0) > 0 }" :aria-label="`${row.name} ${kpiMetricLabels[metric]} ${metricValue(row.metrics, metric)}`" @click="drill(metric, row.id, row.name)">{{ metricValue(row.metrics, metric) }}</button></template>
        </ElTableColumn>
      </ElTable>
      <div class="kpi-table-foot"><span>{{ tableMode === 'response' ? '耗时按原始响应样本独立计算；无样本显示 —，待回复不计入响应耗时。' : tab === 'shop' && tableMode === 'backlog' ? '待办包含期初积压；逾期仅按来源明确的平台期限统计。' : '合计按当前范围独立去重；售后办理量不等于平台结案量。' }}</span><span>{{ shopScope }}<template v-if="tab === 'staff'"> · {{ staffScope }}</template></span></div>
    </section>

    <AnalysisPanels :result="result" :comparison="comparison" :filter="filter" :view="tab" :shop-scope="shopScope" :staff-scope="staffScope" @selection="drillSelection" @download="download" />

    <ElDrawer v-model="drawerOpen" size="min(1080px, 94vw)" append-to-body class="kpi-drawer" :title="detailTitle" destroy-on-close>
      <section v-prototype="annotation('details', '统计下钻明细与来源记录')" class="kpi-drill">
        <div class="kpi-drill-toolbar"><div><strong>{{ details.length }} {{ responseDrill ? '个响应样本' : '条记录' }}</strong><span>{{ rangeLabel }} · 北京时间</span></div><ElButton :icon="Download" @click="exportDetails">导出明细</ElButton></div>
        <p class="kpi-drill-help">{{ selectedDescription || help(drillMetric) }}</p>
        <ElTable :data="pageDetails" class="kpi-detail-table" row-key="id" empty-text="当前范围没有符合此指标的记录" stripe>
          <ElTableColumn label="业务记录" min-width="215"><template #default="{ row }"><button class="kpi-record-link" @click="openRecord(row as KpiDetail)">{{ row.number }}</button><div class="kpi-record-title" :title="row.title">{{ row.title }}</div></template></ElTableColumn>
          <ElTableColumn prop="shopName" label="店铺" min-width="140" show-overflow-tooltip />
          <ElTableColumn prop="staffName" label="人员" width="105" />
          <ElTableColumn v-if="responseDrill || drillMetric === 'pendingReplies'" :label="responseDrill ? '人工响应耗时' : '截至等待时长'" min-width="135"><template #default="{ row }">{{ formatKpiDuration(row.durationMinutes ?? null) }}</template></ElTableColumn>
          <ElTableColumn v-else prop="action" label="统计动作" min-width="140" show-overflow-tooltip />
          <ElTableColumn v-if="selectedDetails?.some(row => row.dueAt)" label="平台截止时间" width="170"><template #default="{ row }">{{ formatKpiTime(row.dueAt) }}</template></ElTableColumn>
          <ElTableColumn label="发生时间" width="170"><template #default="{ row }">{{ formatKpiTime(row.occurredAt) }}</template></ElTableColumn>
          <ElTableColumn prop="result" label="结果" min-width="120" show-overflow-tooltip />
          <ElTableColumn label="操作" width="93" fixed="right"><template #default="{ row }"><ElButton link type="primary" @click="openRecord(row as KpiDetail)">查看记录</ElButton></template></ElTableColumn>
        </ElTable>
        <ElPagination v-model:current-page="detailPage" :total="details.length" :page-size="10" layout="total, prev, pager, next" class="kpi-pagination" />
      </section>
    </ElDrawer>
    <ElDialog v-model="recordOpen" title="统计来源记录" width="min(760px, 91vw)" append-to-body class="kpi-record-dialog" destroy-on-close>
      <div v-if="selectedRecord" class="kpi-record">
        <div class="kpi-record-heading"><ElIcon><Document /></ElIcon><div><h3>{{ selectedRecord.number }}</h3><p>{{ selectedRecord.title }}</p></div></div>
        <dl class="kpi-record-fields"><div><dt>店铺</dt><dd>{{ selectedRecord.shopName }}</dd></div><div><dt>人员</dt><dd>{{ selectedRecord.staffName }}</dd></div><div><dt>统计动作</dt><dd>{{ selectedRecord.action }}</dd></div><div><dt>动作结果</dt><dd>{{ selectedRecord.result }}</dd></div><div><dt>发生时间</dt><dd>{{ formatKpiTime(selectedRecord.occurredAt) }}</dd></div><div><dt>统计截止</dt><dd>{{ formatKpiTime(result.asOf) }}</dd></div><template v-if="selectedRecord.startedAt"><div><dt>本轮首次来信</dt><dd>{{ formatKpiTime(selectedRecord.startedAt) }}</dd></div><div><dt>首次人工回复</dt><dd>{{ formatKpiTime(selectedRecord.respondedAt) }}</dd></div><div><dt>{{ selectedRecord.respondedAt ? '响应耗时' : '截至等待耗时' }}</dt><dd>{{ formatKpiDuration(selectedRecord.durationMinutes ?? null) }}</dd></div></template><div v-if="selectedRecord.dueAt"><dt>平台截止时间</dt><dd>{{ formatKpiTime(selectedRecord.dueAt) }}</dd></div></dl>
        <h4>记录时间线</h4><ol class="kpi-history"><li v-for="event in selectedRecord.history" :key="event.id"><div><strong>{{ event.action }}</strong><span>{{ event.result }}</span></div><p>{{ event.actor }} · {{ formatKpiTime(event.at) }}</p></li></ol>
      </div>
      <template #footer><ElButton :icon="ArrowLeft" @click="recordOpen = false">返回明细</ElButton></template>
    </ElDialog>
  </section>
</template>
