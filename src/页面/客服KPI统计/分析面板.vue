<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Download } from '@element-plus/icons-vue'
import { ElButton, ElEmpty, ElRadioButton, ElRadioGroup } from 'element-plus'
import { metricDetails, formatKpiDuration, isResponseDurationMetric, kpiMetricLabels, parseKpiTime } from './统计模型'
import type { KpiDetail, KpiFilter, KpiMetric, KpiResult } from './统计模型'
import { waitingBuckets, platformDueItems } from './分析模型'
import type { queryKpiComparison } from './分析模型'
import { comparisonColumns, createKpiComparisonCsv, createKpiTrendCsv, formatKpiTime, kpiChange, metricValue } from './展示工具'
import { kpiAnnotation as annotation } from './标注'

const props = defineProps<{ result: KpiResult; comparison: ReturnType<typeof queryKpiComparison>; filter: KpiFilter; view: 'staff' | 'shop'; shopScope: string; staffScope: string }>()
const emit = defineEmits<{
  selection: [metric: KpiMetric, rows: KpiDetail[], title: string, description: string]
  download: [content: string, filename: string]
}>()
const buckets = computed(() => waitingBuckets(props.result))
const pending = computed(() => metricDetails(props.result, 'pendingReplies').sort((a, b) => (b.durationMinutes ?? 0) - (a.durationMinutes ?? 0)))
const longest = computed(() => pending.value.length ? formatKpiDuration(pending.value[0]!.durationMinutes) : '—')
const dueMode = ref<'soon' | 'all'>('soon')
const dueItems = computed(() => platformDueItems(props.result))
const soonItems = computed(() => dueItems.value.filter(row => (parseKpiTime(row.dueAt) ?? Infinity) - (parseKpiTime(props.result.asOf) ?? 0) <= 86400000))
const visibleDue = computed(() => dueMode.value === 'soon' ? soonItems.value : dueItems.value)
const dueTitle = computed(() => dueMode.value === 'soon' ? '24小时内到期事项' : '全部有截止时间的未逾期待办')
const remaining = (row: KpiDetail) => formatKpiDuration(((parseKpiTime(row.dueAt) ?? 0) - (parseKpiTime(props.result.asOf) ?? 0)) / 60000)
const objectLabel = (row: KpiDetail) => ({ cancellation: '取消申请', return: '退货申请', dispute: '纠纷', conversation: '站内信', ticket: '工单' })[row.objectType]
function showPending(rows: KpiDetail[], title: string) {
  emit('selection', 'pendingReplies', [...rows].sort((a, b) => (b.durationMinutes ?? 0) - (a.durationMinutes ?? 0)), title, '截至统计时点仍待人工回复的会话，包含期初积压；等待时长分组仅供分析。')
}
function showDue(rows: KpiDetail[] = visibleDue.value) {
  emit('selection', rows[0]?.metric ?? 'cancellationPending', rows, dueTitle.value, '仅含截至时点仍需卖家办理、有可靠平台必办截止时间且尚未逾期的事项。已逾期事项在店铺“待办与逾期”查看。')
}
const changes = computed(() => comparisonColumns.map(metric => ({ metric, ...(props.comparison.previous ? kpiChange(props.result.summary[metric], props.comparison.previous.summary[metric], metric) : { difference: '—', rate: '—' }) })))
function exportComparison() { emit('download', createKpiComparisonCsv(props.comparison, props.filter, props.shopScope, props.staffScope), `客服KPI_期间对比_${props.filter.startDate}_${props.filter.endDate}.csv`) }

const trendMetric = ref<KpiMetric>('humanMessages')
watch(() => props.view, view => { if (view === 'staff' && trendMetric.value === 'automaticMessages') trendMetric.value = 'humanMessages' })
const effectiveMetric = computed(() => props.view === 'staff' && trendMetric.value === 'automaticMessages' ? 'humanMessages' : trendMetric.value)
const trendOptions = computed<KpiMetric[]>(() => ['humanMessages', ...(props.view === 'shop' ? ['automaticMessages' as const] : []), 'averageResponseMinutes', 'medianResponseMinutes', 'p90ResponseMinutes', 'pendingReplies'])
const durationTrend = computed(() => isResponseDurationMetric(effectiveMetric.value))
const lineTrend = computed(() => durationTrend.value || effectiveMetric.value === 'pendingReplies')
const trendDescription = computed(() => effectiveMetric.value === 'pendingReplies' ? '按每日截至状态统计，包含期初积压；当前日截至已取得数据的时点。' : durationTrend.value ? '按首次人工成功回复日归入样本；无样本日期留空，夜间及节假日连续计时。' : '按人工或自动消息成功发送日统计。')
const trendValues = computed(() => props.result.trend.map(day => day.metrics[effectiveMetric.value]))
const maximum = computed(() => Math.max(2, Math.ceil(Math.max(0, ...trendValues.value.filter((n): n is number => n !== null)) / 2) * 2))
const chartWidth = computed(() => Math.max(760, props.result.trend.length * 30))
const pointX = (i: number) => 75 + (i + .5) * (chartWidth.value - 100) / Math.max(1, props.result.trend.length)
const pointY = (n: number) => 154 - n / maximum.value * 120
const showDate = (i: number) => i === 0 || i === props.result.trend.length - 1 || i % Math.max(1, Math.ceil(props.result.trend.length / 12)) === 0
const trendPath = computed(() => {
  let continuous = false
  return trendValues.value.map((value, i) => {
    if (value === null) { continuous = false; return '' }
    const command = continuous ? 'L' : 'M'; continuous = true
    return `${command}${pointX(i)},${pointY(value)}`
  }).join(' ')
})
const hasTrend = computed(() => lineTrend.value ? trendValues.value.some(value => value !== null) : trendValues.value.some(value => (value ?? 0) > 0))
function exportTrend() { emit('download', createKpiTrendCsv(props.result, props.filter, props.shopScope, props.staffScope, props.view), `客服KPI_每日趋势_${props.filter.startDate}_${props.filter.endDate}.csv`) }
</script>

<template>
  <div class="kpi-analysis-grid" :class="{ 'is-staff': view === 'staff' }">
    <section v-prototype="annotation('waiting-analysis', '待回复等待分析')" class="kpi-panel kpi-waiting-panel">
      <header class="kpi-panel-head"><h2>待回复等待分析</h2><span>截至 {{ formatKpiTime(result.asOf) }}</span></header>
      <div class="kpi-waiting-summary"><div><span>待人工回复</span><button @click="showPending(pending, '全部待人工回复')">{{ pending.length }}<small> 个会话</small></button></div><div><span>最长等待</span><button @click="showPending(pending, '按等待时长排序')">{{ longest }}</button></div></div>
      <div class="kpi-waiting-buckets"><button v-for="bucket in buckets" :key="bucket.key" :data-testid="`waiting-bucket-${bucket.key}`" @click="showPending(bucket.details, `等待 ${bucket.label}`)"><span>{{ bucket.label }}</span><div class="kpi-bucket-track"><i :style="{ width: `${pending.length ? bucket.count / pending.length * 100 : 0}%` }" /></div><strong>{{ bucket.count }}</strong></button></div>
      <p class="kpi-analysis-note">含期初积压 · 分组仅供分析，不设回复达标线</p>
    </section>
    <section v-if="view === 'shop'" v-prototype="annotation('due-analysis', '平台待办临期分析')" class="kpi-panel kpi-due-panel">
      <header class="kpi-panel-head"><h2>平台待办临期</h2><ElRadioGroup v-model="dueMode" size="small" aria-label="临期查看范围"><ElRadioButton value="soon">24小时内</ElRadioButton><ElRadioButton value="all">全部未逾期</ElRadioButton></ElRadioGroup></header>
      <div class="kpi-due-caption"><span>{{ dueTitle }} <strong>{{ visibleDue.length }}</strong> 项</span><ElButton link type="primary" @click="showDue()">查看全部临期事项</ElButton></div>
      <ElEmpty v-if="!visibleDue.length" description="当前范围暂无符合条件的事项" :image-size="40" />
      <div v-else class="kpi-due-list"><button v-for="row in visibleDue.slice(0, 4)" :key="row.id" @click="showDue([row])"><span><strong>{{ row.number }}</strong><small>{{ row.shopName }} · {{ objectLabel(row) }}</small></span><span class="kpi-due-time">剩余 {{ remaining(row) }}<small>{{ formatKpiTime(row.dueAt) }}</small></span></button></div>
      <p class="kpi-analysis-note">按平台截止时间升序 · 仅含卖家必办事项</p>
    </section>
  </div>

  <section v-prototype="annotation('trend', '响应与积压每日趋势')" class="kpi-panel kpi-trend-panel">
    <header class="kpi-panel-head"><h2>每日统计趋势</h2><label class="kpi-trend-select"><span>指标</span><select v-model="trendMetric" aria-label="趋势指标"><option v-for="key in trendOptions" :key="key" :value="key">{{ kpiMetricLabels[key] }}</option></select></label><ElButton :icon="Download" @click="exportTrend">导出趋势</ElButton></header>
    <p class="kpi-trend-description">{{ trendDescription }}</p>
    <ElEmpty v-if="!hasTrend" :description="durationTrend ? '当前范围暂无响应样本' : '当前范围暂无回复记录'" :image-size="45" class="kpi-trend-empty" />
    <div v-else class="kpi-chart-scroll"><svg class="kpi-chart kpi-analysis-chart" :viewBox="`0 0 ${chartWidth} 190`" :style="{ minWidth: `${chartWidth}px` }" role="img" :aria-label="`${kpiMetricLabels[effectiveMetric]}每日趋势`">
      <g v-for="tick in [0, .5, 1]" :key="tick"><line x1="75" :x2="chartWidth - 20" :y1="154 - tick * 120" :y2="154 - tick * 120" /><text x="65" :y="158 - tick * 120" text-anchor="end">{{ durationTrend ? formatKpiDuration(maximum * tick) : Math.ceil(maximum * tick) }}</text></g>
      <path v-if="lineTrend" :d="trendPath" class="kpi-trend-line" />
      <g v-for="(day, index) in result.trend" :key="day.date" tabindex="0" :aria-label="`${day.date} ${metricValue(day.metrics, effectiveMetric)}，${day.metrics.responseSamples}个响应样本，截至${formatKpiTime(day.asOf)}`"><title>{{ day.date }}：{{ metricValue(day.metrics, effectiveMetric) }}{{ durationTrend ? `；${day.metrics.responseSamples} 个响应样本` : '' }}；截至 {{ formatKpiTime(day.asOf) }}</title><template v-if="day.metrics[effectiveMetric] !== null"><circle v-if="lineTrend" :cx="pointX(index)" :cy="pointY(day.metrics[effectiveMetric]!)" r="4" class="kpi-trend-point" /><rect v-else :x="pointX(index) - 9" :y="pointY(day.metrics[effectiveMetric]!)" width="18" :height="154 - pointY(day.metrics[effectiveMetric]!)" rx="2" /></template><text v-else :x="pointX(index)" y="150" text-anchor="middle">—</text><text v-if="showDate(index)" :x="pointX(index)" y="178" text-anchor="middle">{{ day.date.slice(5) }}</text><text v-if="result.trend.length <= 10 && day.metrics[effectiveMetric] !== null" :x="pointX(index)" :y="pointY(day.metrics[effectiveMetric]!) - 12" text-anchor="middle">{{ metricValue(day.metrics, effectiveMetric) }}</text></g>
    </svg></div>
  </section>

  <section v-prototype="annotation('comparison', '上一同长度期间对比')" class="kpi-panel kpi-comparison-panel">
    <header class="kpi-panel-head"><h2>上一同长度期间对比</h2><span>同一筛选范围 · 对齐截至时刻</span><ElButton :icon="Download" @click="exportComparison">导出对比</ElButton></header>
    <div class="kpi-comparison-periods"><span><i />当前 {{ comparison.currentStart }} 至 {{ comparison.currentEnd }}<small>截至 {{ formatKpiTime(result.asOf) }}</small></span><span><i />前期 {{ comparison.previousStart }} 至 {{ comparison.previousEnd }}<small>{{ comparison.previous ? `截至 ${formatKpiTime(comparison.previous.asOf)}` : '暂无可靠可比数据' }}</small></span></div>
    <p v-if="comparison.error" class="kpi-comparison-unavailable" role="status">{{ comparison.error }}</p>
    <div class="kpi-comparison-scroll"><table class="kpi-comparison-table" data-testid="comparison-table"><thead><tr><th>指标</th><th>当前值</th><th>前期值</th><th>变化量</th><th>变化比例</th></tr></thead><tbody><tr v-for="row in changes" :key="row.metric"><th>{{ kpiMetricLabels[row.metric] }}</th><td>{{ metricValue(result.summary, row.metric) }}</td><td>{{ comparison.previous ? metricValue(comparison.previous.summary, row.metric) : '—' }}</td><td>{{ row.difference }}</td><td>{{ row.rate }}</td></tr></tbody></table></div>
    <p class="kpi-analysis-note">{{ comparison.label }} · 响应按各期原始样本计算，待回复为各期截至存量</p>
  </section>
</template>
