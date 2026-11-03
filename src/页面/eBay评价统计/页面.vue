<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { DataAnalysis, Download, Grid, Goods, QuestionFilled, TrendCharts } from '@element-plus/icons-vue'
import { ElButton, ElEmpty, ElIcon, ElMessage, ElOption, ElSelect, ElTable, ElTableColumn, ElTooltip } from 'element-plus'
import MultiFilter from '@/组件/筛选/多选筛选.vue'
import DateRange from '@/组件/筛选/时间范围.vue'
import { 校验时间范围 } from '@/组件/筛选/筛选工具'
import { reviewSession } from '../eBay评价/会话'
import { reviewShops } from '../eBay评价/数据'
import { createReviewFilters, filterReviews, groupReviewReasons, groupReviewsByShop, groupReviewTrend, isEffectiveReview, summarizeReviews } from '../eBay评价/模型'
import type { ReviewFilters } from '../eBay评价/类型'
import { statisticsAnnotation as annotation } from './标注'
import { chartScale, createStatisticsCsv, defaultStatisticsRange, formatReviewRate, statisticsReviewQuery } from './统计工具'

const router = useRouter()
function initialFilters(): ReviewFilters { return { ...createReviewFilters(), dateRange: [...defaultStatisticsRange] } }
const draft = reactive(initialFilters()), applied = reactive(initialFilters()), queryError = ref('')
const cloneFilters = (value: ReviewFilters): ReviewFilters => ({ ...value, shopIds: [...value.shopIds], dateRange: [...value.dateRange] as ReviewFilters['dateRange'] })
const shopOptions = computed(() => reviewShops)
const results = computed(() => filterReviews(reviewSession.reviews, applied).filter(isEffectiveReview))
const summary = computed(() => summarizeReviews(results.value))
const trend = computed(() => groupReviewTrend(results.value, applied.dateRange))
const shops = computed(() => groupReviewsByShop(results.value))
const reasons = computed(() => groupReviewReasons(results.value))
const scale = computed(() => chartScale(trend.value))
const rangeLabel = computed(() => applied.dateRange.length ? `${applied.dateRange[0]} 至 ${applied.dateRange[1]}` : '全部时间')
const sourceLabel = computed(() => ({ all: '全部来源', buyer: '买家主动', automated: '平台自动' }[applied.source]))
const vocPlaceholders = [
  { id: 'voc-topics', title: 'VOC 主题排行', description: '汇总买家关注的正面与负面主题', icon: DataAnalysis },
  { id: 'voc-heatmap', title: '店铺 × 主题热力图', description: '对比各店铺的问题主题分布', icon: Grid },
  { id: 'voc-skus', title: '跨店铺 SKU 问题排行', description: '按系统 SKU 汇总跨店铺问题评价', icon: Goods },
  { id: 'voc-trend', title: '负面主题趋势', description: '观察负面主题随评价日期的变化', icon: TrendCharts },
]
const plot = { left: 40, top: 16, width: 784, height: 172 }
const barWidth = computed(() => Math.min(18, plot.width / Math.max(1, trend.value.length) * 0.55))
const barX = (index: number) => plot.left + (index + 0.5) * plot.width / Math.max(1, trend.value.length) - barWidth.value / 2
const barHeight = (value: number) => value / scale.value.maximum * plot.height
const barY = (value: number) => plot.top + plot.height - barHeight(value)
const showDateLabel = (index: number) => index === 0 || index === trend.value.length - 1 || index % Math.max(1, Math.ceil(trend.value.length / 6)) === 0

function query() {
  queryError.value = 校验时间范围(draft.dateRange) ?? ''
  if (queryError.value) return
  Object.assign(applied, cloneFilters(draft))
}
function reset() { Object.assign(draft, initialFilters()); query() }
function changeDates(value: string[] | null) { draft.dateRange = value?.length ? [...value] as [string, string] : [] }
function drill(options: Parameters<typeof statisticsReviewQuery>[1] = {}) {
  void router.push({ path: '/oms/ebay-service/reviews', query: statisticsReviewQuery(applied, options) })
}
function exportStatistics() {
  const csv = createStatisticsCsv({ filters: cloneFilters(applied), shopNames: shopOptions.value.filter(shop => applied.shopIds.includes(shop.value)).map(shop => shop.label), summary: summary.value, shops: shops.value, trend: trend.value, reasons: reasons.value })
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }))
  const link = document.createElement('a'); link.href = url; link.download = `eBay评价统计_${applied.dateRange.length ? applied.dateRange.join('_') : '全部时间'}.csv`
  document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 0)
  ElMessage.success('已导出当前统计')
}
</script>

<template>
  <section v-prototype="annotation('overview', 'eBay评价统计')" class="review-statistics-page">
    <div v-prototype="annotation('filters', '统计范围与查询')" class="statistics-filters">
      <MultiFilter v-model="draft.shopIds" :options="shopOptions" placeholder="店铺" :width="156" />
      <label class="statistics-date"><span>评价日期</span><DateRange :model-value="draft.dateRange" precision="date" :width="270" aria-prefix="评价统计" hint="按收到评价的北京时间，包含起止整日" @update:model-value="changeDates" /></label>
      <ElSelect v-model="draft.source" aria-label="评价来源" class="statistics-source"><ElOption label="全部来源" value="all" /><ElOption label="买家主动" value="buyer" /><ElOption label="平台自动" value="automated" /></ElSelect>
      <ElButton type="primary" @click="query">查询</ElButton><ElButton @click="reset">重置</ElButton>
      <span class="filters-spacer" />
      <ElButton v-prototype="annotation('export', '导出当前统计')" :icon="Download" @click="exportStatistics">导出统计</ElButton>
    </div>
    <p v-if="queryError" class="query-error" role="alert">{{ queryError }}</p>
    <div class="statistics-scope"><span>{{ rangeLabel }}<i />北京时间</span><span>{{ sourceLabel }}<i />{{ applied.shopIds.length ? `已选 ${applied.shopIds.length} 个店铺` : '全部店铺' }}</span></div>

    <div v-prototype="annotation('metrics', '评价指标与统计口径')" class="statistics-metrics">
      <article class="metric"><div class="metric-label">有效评价<ElTooltip content="当前范围收到的有效评价，排除已撤回、已隐藏、已被替代的旧评价；按评价记录计数。" placement="top"><button class="help-button" aria-label="有效评价口径"><ElIcon><QuestionFilled /></ElIcon></button></ElTooltip></div><button class="metric-number" data-testid="metric-total" @click="drill()">{{ summary.total }}</button><span class="metric-foot">好评 {{ summary.positive }} · 中评 {{ summary.neutral }} · 差评 {{ summary.negative }}</span></article>
      <article class="metric"><div class="metric-label">买家主动评价</div><button class="metric-number" data-testid="metric-buyer" :disabled="applied.source === 'automated'" @click="drill({ source: 'buyer' })">{{ summary.total - summary.automated }}</button><span class="metric-foot">买家实际提交</span></article>
      <article class="metric"><div class="metric-label">平台自动评价<ElTooltip content="eBay自动生成的评价单独计数，不等同于买家主动表达满意。" placement="top"><button class="help-button" aria-label="平台自动评价口径"><ElIcon><QuestionFilled /></ElIcon></button></ElTooltip></div><button class="metric-number" data-testid="metric-automated" :disabled="applied.source === 'buyer'" @click="drill({ source: 'automated' })">{{ summary.automated }}</button><span class="metric-foot">与主动评价分开查看</span></article>
      <article class="metric metric-attention"><div class="metric-label">中差评</div><button class="metric-number" data-testid="metric-nonpositive" @click="drill({ nonPositive: true })">{{ summary.nonPositive }}</button><span class="metric-foot">中评 {{ summary.neutral }} · 差评 {{ summary.negative }}</span></article>
      <article class="metric"><div class="metric-label">中差评率<ElTooltip content="当前筛选范围的有效中差评数 ÷ 有效评价数。无有效评价显示—。这是内部统计口径，不是eBay官方好评率或信用分。" placement="top"><button class="help-button" aria-label="中差评率口径"><ElIcon><QuestionFilled /></ElIcon></button></ElTooltip></div><strong class="metric-number metric-rate" data-testid="metric-rate">{{ formatReviewRate(summary.nonPositiveRate) }}</strong><span class="metric-foot">与当前来源、店铺范围一致</span></article>
      <article class="metric"><div class="metric-label">待处理中差评<ElTooltip content="有效中差评中仍待处理或处理中的记录，内部处理完成不表示平台已删除或改为好评。" placement="top"><button class="help-button" aria-label="待处理中差评口径"><ElIcon><QuestionFilled /></ElIcon></button></ElTooltip></div><button class="metric-number" data-testid="metric-pending" @click="drill({ pending: true })">{{ summary.pending }}</button><span class="metric-foot">其中处理中 {{ summary.processing }}</span></article>
    </div>

    <div class="statistics-charts">
      <section v-prototype="annotation('trend', '评价每日趋势')" class="statistics-panel trend-panel">
        <header class="panel-header"><h2>评价趋势</h2><div class="chart-legend"><span><b class="positive" />好评</span><span><b class="neutral" />中评</span><span><b class="negative" />差评</span></div></header>
        <ElEmpty v-if="!summary.total" description="当前范围暂无评价" :image-size="72" class="chart-empty" />
        <svg v-else class="trend-chart" viewBox="0 0 850 224" role="img" aria-label="按北京时间日期统计的好评、中评、差评数量趋势">
          <g v-for="tick in scale.ticks" :key="tick"><line :x1="plot.left" :x2="plot.left + plot.width" :y1="barY(tick)" :y2="barY(tick)" class="chart-grid" /><text x="29" :y="barY(tick) + 4" text-anchor="end" class="axis-label">{{ tick }}</text></g>
          <g v-for="(point, index) in trend" :key="point.date" class="trend-bar" tabindex="0" :aria-label="`${point.date}，好评${point.positive}，中评${point.neutral}，差评${point.negative}`">
            <title>{{ point.date }}：好评 {{ point.positive }}，中评 {{ point.neutral }}，差评 {{ point.negative }}</title>
            <rect :x="barX(index)" :y="barY(point.positive)" :width="barWidth" :height="barHeight(point.positive)" class="bar-positive" />
            <rect :x="barX(index)" :y="barY(point.positive + point.neutral)" :width="barWidth" :height="barHeight(point.neutral)" class="bar-neutral" />
            <rect :x="barX(index)" :y="barY(point.total)" :width="barWidth" :height="barHeight(point.negative)" class="bar-negative" />
            <text v-if="showDateLabel(index)" :x="barX(index) + barWidth / 2" y="211" text-anchor="middle" class="axis-label">{{ point.date.slice(5) }}</text>
          </g>
        </svg>
      </section>
      <section v-prototype="annotation('reasons', '中差评原因分布')" class="statistics-panel reasons-panel">
        <header class="panel-header"><h2>中差评原因</h2><ElTooltip content="按客服维护的原因分类，每条评价归入一类；只统计当前范围内有效中差评。" placement="top"><button class="help-button" aria-label="中差评原因口径"><ElIcon><QuestionFilled /></ElIcon></button></ElTooltip></header>
        <ElEmpty v-if="!reasons.length" description="当前范围暂无中差评" :image-size="72" class="chart-empty" />
        <div v-else class="reason-list"><div v-for="reason in reasons" :key="reason.reason" class="reason-row"><span class="reason-label" :title="reason.reason">{{ reason.reason }}</span><div class="reason-track"><span :style="{ width: `${summary.nonPositive ? reason.count / summary.nonPositive * 100 : 0}%` }" /></div><strong>{{ reason.count }}</strong></div></div>
      </section>
    </div>

    <section v-prototype="annotation('voc', 'VOC 分析二期规划')" class="statistics-panel voc-panel" aria-labelledby="voc-heading">
      <header class="panel-header"><h2 id="voc-heading">VOC 分析</h2><span class="voc-phase">二期规划</span></header>
      <div class="voc-planning-summary">通过外部 AI API 分析买家评价，暂未开放。</div>
      <div class="voc-placeholders">
        <article v-for="item in vocPlaceholders" :key="item.id" v-prototype="annotation(item.id, item.title)" class="voc-placeholder">
          <div class="voc-placeholder-heading"><ElIcon aria-hidden="true"><component :is="item.icon" /></ElIcon><h3>{{ item.title }}</h3></div>
          <p>{{ item.description }}</p><span class="voc-unavailable">暂未开放</span>
        </article>
      </div>
    </section>

    <section v-prototype="annotation('stores', '店铺统计与评价下钻')" class="statistics-panel shops-panel">
      <header class="panel-header"><h2>店铺统计</h2><span class="panel-meta">{{ shops.length }} 个店铺</span></header>
      <ElTable :data="shops" row-key="shopId" class="statistics-shop-table" empty-text="当前范围暂无店铺评价" :max-height="420">
        <ElTableColumn label="店铺" min-width="180"><template #default="{ row }"><button class="table-link shop-name" :title="row.shopName" @click="drill({ shopId: row.shopId })">{{ row.shopName }}</button></template></ElTableColumn>
        <ElTableColumn prop="total" label="有效评价" min-width="84" align="right" />
        <ElTableColumn label="买家主动" min-width="84" align="right"><template #default="{ row }">{{ row.total - row.automated }}</template></ElTableColumn>
        <ElTableColumn prop="automated" label="平台自动" min-width="84" align="right" />
        <ElTableColumn prop="positive" label="好评" min-width="65" align="right" />
        <ElTableColumn prop="neutral" label="中评" min-width="65" align="right" />
        <ElTableColumn prop="negative" label="差评" min-width="65" align="right" />
        <ElTableColumn label="中差评率" min-width="94" align="right"><template #default="{ row }">{{ formatReviewRate(row.nonPositiveRate) }}</template></ElTableColumn>
        <ElTableColumn label="待处理" min-width="78" align="right"><template #default="{ row }"><button class="table-link" @click="drill({ shopId: row.shopId, pending: true })">{{ row.pending }}</button></template></ElTableColumn>
        <ElTableColumn label="操作" min-width="150" align="left"><template #default="{ row }"><div class="row-actions"><button class="table-link" @click="drill({ shopId: row.shopId })">查看评价</button><button class="table-link" @click="drill({ shopId: row.shopId, nonPositive: true })">中差评 {{ row.nonPositive }}</button></div></template></ElTableColumn>
      </ElTable>
    </section>
  </section>
</template>

<style scoped>
.review-statistics-page{height:100%;min-width:0;overflow:auto;container-type:inline-size;padding:14px;background:var(--yy-bg-page);font-size:12px;color:var(--yy-text-regular)}
.statistics-filters{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:12px;background:#fff;border:1px solid var(--yy-border);border-radius:4px}.statistics-filters .el-button+.el-button{margin-left:0}.statistics-date{display:flex;gap:8px;align-items:center;flex:none}.statistics-date>span{white-space:nowrap}.statistics-source{width:124px;flex:none}.filters-spacer{flex:1}.query-error{color:var(--yy-danger);margin:8px 0}.statistics-scope{display:flex;justify-content:space-between;gap:12px;margin:12px 1px 10px;color:var(--yy-text-secondary);font-size:11px}.statistics-scope>span{display:flex;align-items:center;gap:8px}.statistics-scope i{height:10px;border-left:1px solid #d4d9e1}
.statistics-metrics{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:10px;margin-bottom:12px}.metric{min-width:0;display:flex;align-items:flex-start;flex-direction:column;padding:15px 16px 13px;background:#fff;border:1px solid var(--yy-border);border-radius:4px}.metric-label{display:flex;align-items:center;gap:5px;white-space:nowrap;color:var(--yy-text-heading);font-size:12px}.help-button{display:inline-flex;align-items:center;justify-content:center;flex:none;border:0;padding:0;background:transparent;color:#9aa4b1;cursor:help;line-height:1}.help-button:focus-visible{outline:2px solid #409eff;outline-offset:3px}.metric-number{font-family:Arial,sans-serif;font-size:28px;line-height:1.3;font-weight:600;letter-spacing:-.5px;margin:10px 0 7px;padding:0;border:0;background:none;color:var(--yy-text-primary);font-variant-numeric:tabular-nums;text-align:left}.metric button.metric-number{cursor:pointer}.metric button.metric-number:hover{color:var(--yy-primary)}.metric button.metric-number:disabled{cursor:default;color:#abb1ba}.metric-attention .metric-number{color:#c45c4e}.metric-foot{font-size:11px;color:var(--yy-text-secondary);line-height:17px;white-space:normal}.metric-rate{display:block}
.statistics-charts{display:grid;grid-template-columns:minmax(0,2.1fr) minmax(275px,1fr);gap:12px;margin-bottom:12px}.statistics-panel{min-width:0;border:1px solid var(--yy-border);border-radius:4px;background:#fff}.panel-header{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:49px;padding:0 16px;border-bottom:1px solid var(--yy-border-light)}.panel-header h2{font-size:14px;font-weight:600;margin:0;color:var(--yy-text-heading)}.panel-meta{font-size:11px;color:var(--yy-text-secondary)}.chart-legend{display:flex;align-items:center;gap:15px;font-size:11px}.chart-legend>span{display:flex;align-items:center;gap:5px}.chart-legend b{width:7px;height:7px;display:inline-block;border-radius:2px}.positive,.bar-positive{background:#6eabd9;fill:#6eabd9}.neutral,.bar-neutral{background:#e7b966;fill:#e7b966}.negative,.bar-negative{background:#d7796a;fill:#d7796a}.trend-chart{display:block;width:100%;height:240px;padding:9px 12px 0}.chart-grid{stroke:#edf0f4;stroke-width:1}.axis-label{font-size:11px;fill:#88919e;font-family:Arial,sans-serif}.trend-bar:focus{outline:0}.trend-bar:hover rect,.trend-bar:focus rect{filter:brightness(.85)}.chart-empty{height:240px;padding:20px}.chart-empty :deep(.el-empty__description p){font-size:12px}.reason-list{display:flex;flex-direction:column;gap:17px;padding:20px 17px;max-height:240px;overflow-y:auto}.reason-row{display:grid;grid-template-columns:86px minmax(0,1fr) 24px;gap:10px;align-items:center;font-size:12px}.reason-label{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.reason-track{height:7px;background:#f2f4f7;border-radius:2px;overflow:hidden}.reason-track>span{display:block;height:100%;border-radius:2px;background:#88aac8}.reason-row strong{font-weight:500;font-variant-numeric:tabular-nums;text-align:right}
.shops-panel{overflow:hidden}.statistics-shop-table{font-size:12px;width:100%;font-variant-numeric:tabular-nums}.statistics-shop-table :deep(th.el-table__cell){background:#fafbfc;font-weight:500}.statistics-shop-table :deep(td.el-table__cell){height:47px}.statistics-shop-table :deep(.cell){padding-left:14px;padding-right:14px;white-space:nowrap}.table-link{padding:0;border:0;background:none;color:var(--yy-primary);cursor:pointer;font-size:12px;font-variant-numeric:tabular-nums}.table-link:hover{text-decoration:underline}.shop-name{max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;vertical-align:middle}.row-actions{display:flex;gap:14px;align-items:center}.shops-panel :deep(.el-table__inner-wrapper:before){display:none}
.voc-panel{margin-bottom:12px}.voc-phase{padding:3px 8px;border-radius:3px;background:var(--yy-bg-page);color:var(--yy-text-secondary);font-size:11px;white-space:nowrap}.voc-planning-summary{padding:13px 16px 0;color:var(--yy-text-secondary);line-height:18px}.voc-placeholders{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;padding:12px 16px 16px}.voc-placeholder{min-width:0;padding:15px 14px;border:1px dashed var(--yy-border);border-radius:4px;background:var(--yy-bg-page)}.voc-placeholder-heading{display:flex;align-items:center;gap:8px}.voc-placeholder-heading>.el-icon{flex:none;font-size:17px;color:var(--yy-text-secondary)}.voc-placeholder h3{margin:0;font-size:13px;font-weight:500;color:var(--yy-text-heading);line-height:20px}.voc-placeholder p{margin:8px 0 13px;color:var(--yy-text-secondary);font-size:12px;line-height:19px}.voc-unavailable{display:inline-block;color:var(--yy-text-secondary);font-size:11px;line-height:18px}
@container(max-width:1000px){.statistics-metrics{grid-template-columns:repeat(3,minmax(0,1fr))}.metric{padding:13px 15px}.metric-number{margin:6px 0}.statistics-charts{grid-template-columns:minmax(0,1.65fr) minmax(240px,1fr)}.reason-row{grid-template-columns:76px minmax(0,1fr) 20px;gap:7px}}
@container(max-width:1000px){.voc-placeholders{grid-template-columns:repeat(2,minmax(0,1fr))}}
@container(max-width:780px){.statistics-charts{grid-template-columns:minmax(0,1fr)}.reason-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px 25px}.statistics-scope{flex-wrap:wrap}.filters-spacer{display:none}}
@container(max-width:520px){.voc-placeholders{grid-template-columns:minmax(0,1fr)}}
</style>
