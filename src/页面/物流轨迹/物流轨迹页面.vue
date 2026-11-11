<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { Download, Refresh, Plus, Van, Filter, QuestionFilled } from '@element-plus/icons-vue'
import { ElButton, ElDialog, ElDrawer, ElEmpty, ElIcon, ElMessage, ElOption, ElPagination, ElPopover, ElRadioButton, ElRadioGroup, ElSelect, ElTable, ElTableColumn, ElTabPane, ElTabs, ElTag, ElTooltip } from 'element-plus'
import FieldSearch from '@/组件/筛选/字段搜索.vue'
import MultiFilter from '@/组件/筛选/多选筛选.vue'
import DateRange from '@/组件/筛选/时间范围.vue'
import NumberCopy from '@/组件/单号复制.vue'
import { 命中时间范围, 校验字段搜索, 校验时间范围 } from '@/组件/筛选/筛选工具'
import { createTrackingRecords } from './演示数据'
import { emptyTrackingFilters, estimatedDeliveryLabel, exportTrackingCsv, firstTrackingEvent, filterTrackingRecords, formatEventTime, formatTrackingTime, metricDaysLabel, milestoneTime, refreshTracking, registerTracking, statusLabel, subStatusLabel, subscriptionLabel, subscriptionStatuses, signatureTime, trackingStatuses, transitDaysLabel } from './模型'
import type { TrackingEvent, TrackingRecord } from './模型'
import { trackingAnnotation as annotation } from './标注'
import './样式.css'

const records = ref(createTrackingRecords())
const draft = reactive(emptyTrackingFilters()), applied = reactive(emptyTrackingFilters())
const dates = ref<string[] | null>(null), appliedDates = ref<string[] | null>(null)
type TrackingDateField = 'orderPlacedAt' | 'shippedAt' | 'latestEventAt' | 'lastSyncAt'
const dateFields: Array<{ value: TrackingDateField; label: string }> = [{ value: 'orderPlacedAt', label: '订单下单时间' }, { value: 'shippedAt', label: '实际发货时间' }, { value: 'latestEventAt', label: '轨迹发生时间' }, { value: 'lastSyncAt', label: '成功同步时间' }]
const draftDateField = ref<TrackingDateField>('orderPlacedAt'), appliedDateField = ref<TrackingDateField>('orderPlacedAt')
const advancedOpen = ref(false)
function dismissAdvanced(event: PointerEvent) {
  if (!advancedOpen.value || !(event.target instanceof Element)) return
  if (event.target.closest('.tracking-more, .tracking-more-filters, .el-popper')) return
  advancedOpen.value = false
}
onMounted(() => document.addEventListener('pointerdown', dismissAdvanced))
onBeforeUnmount(() => document.removeEventListener('pointerdown', dismissAdvanced))
const hasAdvancedFilters = computed(() => applied.subscriptions.length > 0 || applied.syncStates.length > 0)
const statusTab = ref('all'), page = ref(1), pageSize = ref(10)
const table = ref<{ clearSelection: () => void }>()
const selected = ref<TrackingRecord[]>([])
const queryError = ref('')
const baseRows = computed(() => filterTrackingRecords(records.value, { ...applied, statuses: [] }).filter(row => 命中时间范围(row[appliedDateField.value] ?? undefined, appliedDates.value)))
const rows = computed(() => baseRows.value.filter(row => statusTab.value === 'all' || row.status === statusTab.value))
const pageRows = computed(() => rows.value.slice((page.value - 1) * pageSize.value, page.value * pageSize.value))
const stateTabs = computed(() => [{ value: 'all', label: '全部' }, ...trackingStatuses].map(tab => ({ ...tab, count: baseRows.value.filter(row => tab.value === 'all' || row.status === tab.value).length })))
const option = (values: string[]) => [...new Set(values)].map(value => ({ value, label: value }))
const platformOptions = computed(() => option(records.value.map(row => row.platform)))
const warehouseOptions = computed(() => option(records.value.map(row => row.warehouse)))
const shopOptions = computed(() => [...new Map(records.value.filter(row => !draft.platforms.length || draft.platforms.includes(row.platform)).map(row => [row.shopId, { value: row.shopId, label: row.shopName }])).values()])
const syncOptions = [{ value: 'success', label: '更新成功' }, { value: 'pending', label: '等待轨迹' }, { value: 'failed', label: '更新失败' }, { value: 'never', label: '尚未更新' }]
const timingHelps = { transit: '直接采用17TRACK返回的运输时效，签收包裹采用来源妥投计算终点。有效0天保留；无轨迹或缺失显示—，不根据OMS下单或发货时间相减。', first: '全部运输商事件中最早的可靠发生时刻，作为上网时间参考。不是17TRACK注册、首次读取或OMS发货时间；来源时间不完整时留空。', picked: '运输商揽收节点时间，与OMS实际发货时间分别展示。日期不补时刻，来源时区不明时保留核实提示。', delivered: '来自来源签收节点及签收事件。来源冲突显示待核实；退件签收不作为收件人签收时间。' }
const firstTime = (row: TrackingRecord) => formatTrackingTime(firstTrackingEvent(row)?.timeUtc)
const estimateSource = (row: TrackingRecord) => row.timeMetrics.estimatedDelivery.source === 'Official' ? '运输商提供' : row.timeMetrics.estimatedDelivery.source === '17TRACK' ? '17TRACK提供' : '—'
const fields = [{ value: 'number', label: '跟踪号' }, { value: 'orderNo', label: '系统订单号' }, { value: 'platformOrderNo', label: '平台订单号' }]
function platformsChanged(value: string[]) { draft.platforms = value; draft.shops = draft.shops.filter(id => shopOptions.value.some(shop => shop.value === id)) }
function clearSelection() { selected.value = []; table.value?.clearSelection() }
function query() {
  const error = 校验字段搜索(draft.keyword, draft.mode) || 校验时间范围(dates.value)
  if (error) { queryError.value = error; ElMessage.warning(error); return }
  Object.assign(applied, { ...draft, platforms: [...draft.platforms], shops: [...draft.shops], warehouses: [...draft.warehouses], statuses: [...draft.statuses], subscriptions: [...draft.subscriptions], syncStates: [...draft.syncStates] })
  appliedDates.value = dates.value ? [...dates.value] : null
  appliedDateField.value = draftDateField.value; advancedOpen.value = false
  queryError.value = ''; page.value = 1; clearSelection()
}
function reset() { Object.assign(draft, emptyTrackingFilters()); dates.value = null; draftDateField.value = 'orderPlacedAt'; statusTab.value = 'all'; query() }
function chooseTab(value: string) { statusTab.value = value; page.value = 1; clearSelection() }
function changePage(value: number) { page.value = value; clearSelection() }
const detailId = ref<string | null>(null), detailTab = ref('trajectory')
const current = computed(() => records.value.find(row => row.id === detailId.value))
const timeMode = ref<'beijing' | 'source'>('beijing'), language = ref<'original' | 'zh'>('original'), eventOrder = ref('desc')
function openDetail(row: TrackingRecord) { detailId.value = row.id; detailTab.value = 'trajectory'; timeMode.value = 'beijing'; language.value = 'original'; eventOrder.value = 'desc' }
const statusTone = (row: TrackingRecord) => row.status === 'Delivered' ? 'success' : ['Exception', 'DeliveryFailure'].includes(row.status ?? '') ? 'danger' : row.status === 'Expired' ? 'warning' : row.status === null || row.status === 'NotFound' ? 'info' : 'primary'
function syncLabel(row: TrackingRecord) { return row.syncState === 'failed' ? '更新失败' : row.syncState === 'pending' ? '等待轨迹' : row.syncState === 'success' ? '更新成功' : '尚未更新' }
function displayEvents(events: TrackingEvent[]) { return eventOrder.value === 'asc' ? [...events].reverse() : events }
const canRegister = (row: TrackingRecord) => row.subscription === 'unregistered' || row.subscription === 'failed'
const canRefresh = (row: TrackingRecord) => row.subscription === 'registered'

type Action = 'register' | 'refresh'
const action = ref<Action>('register'), confirmation = ref(false), targets = ref<string[]>([]), skipped = ref(0)
const carrierDraft = reactive<Record<string, number | undefined>>({})
const carrierOptions = [{ value: 21051, label: 'USPS' }, { value: 100002, label: 'UPS' }, { value: 100003, label: 'FedEx' }, { value: 100001, label: 'DHL Express' }, { value: 7041, label: 'DHL Paket' }]
const targetRows = computed(() => targets.value.map(id => records.value.find(row => row.id === id)).filter((row): row is TrackingRecord => !!row))
function prepareAction(kind: Action, items: TrackingRecord[]) {
  const eligible = items.filter(kind === 'register' ? canRegister : canRefresh)
  if (!eligible.length) return void ElMessage.warning(kind === 'register' ? '所选包裹均已注册或已停止跟踪，无需重复注册' : '请先为所选包裹注册跟踪；停止跟踪的包裹需先核查')
  action.value = kind; targets.value = eligible.map(row => row.id); skipped.value = items.length - eligible.length
  for (const row of eligible) carrierDraft[row.id] = row.carrierCode ?? undefined
  confirmation.value = true
}
const resultVisible = ref(false), executing = ref(false)
const actionResults = ref<Array<{ id: string; number: string; ok: boolean; pending: boolean; message: string }>>([])
function executeAction() {
  if (executing.value) return
  executing.value = true
  try {
    actionResults.value = targetRows.value.map(row => {
      if (action.value === 'register' && canRegister(row as TrackingRecord)) {
        const chosen = carrierOptions.find(item => item.value === carrierDraft[row.id])
        if (chosen && row.carrierCode === null) { row.carrierCode = chosen.value; row.carrierName = chosen.label }
      }
      const result = action.value === 'register' ? registerTracking(row) : refreshTracking(row)
      return { id: row.id, number: row.number, pending: action.value === 'refresh' && result.ok && row.syncState === 'pending', ...result }
    })
    confirmation.value = false; resultVisible.value = true; clearSelection()
    page.value = Math.min(page.value, Math.max(1, Math.ceil(rows.value.length / pageSize.value)))
  } finally { executing.value = false }
}
function download() {
  const items = selected.value.length ? rows.value.filter(row => selected.value.some(item => item.id === row.id)) : rows.value
  if (!items.length) return void ElMessage.warning('当前范围没有可导出的包裹')
  const url = URL.createObjectURL(new Blob([exportTrackingCsv(items)], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a'); link.href = url; link.download = '物流轨迹.csv'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
}
</script>

<template>
  <section class="tracking-page" v-prototype="annotation('overview', '物流轨迹工作台')">

    <nav class="tracking-status-tabs" aria-label="物流状态" v-prototype="annotation('status', '17TRACK物流主状态')"><button v-for="tab in stateTabs" :key="tab.value" type="button" :class="{ active: statusTab === tab.value }" :aria-pressed="statusTab === tab.value" @click="chooseTab(tab.value)">{{ tab.label }}<span>{{ tab.count }}</span></button><ElTooltip content="按17TRACK官方九个物流主状态分类。全部包含尚未取得来源状态的包裹，可用注册状态和同步结果筛选。" :trigger="['hover', 'focus']" placement="bottom"><ElIcon class="tracking-status-help" tabindex="0" aria-label="物流状态说明"><QuestionFilled /></ElIcon></ElTooltip></nav>
    <section class="tracking-filters" v-prototype="annotation('filters', '单行查询与订单日期')">
      <div class="tracking-filter-viewport"><div class="tracking-filter-line">
        <MultiFilter :model-value="draft.platforms" :options="platformOptions" placeholder="平台" :width="88" @update:model-value="platformsChanged" />
        <MultiFilter v-model="draft.shops" :options="shopOptions" placeholder="店铺" :width="106" />
        <MultiFilter v-model="draft.warehouses" :options="warehouseOptions" placeholder="发货仓库" :width="106" />
        <ElSelect v-model="draftDateField" class="tracking-date-type" aria-label="物流轨迹日期类型" title="日期范围按北京时间查询，包含起止日"><ElOption v-for="item in dateFields" :key="item.value" :value="item.value" :label="item.label" /></ElSelect>
        <DateRange v-model="dates" precision="date" aria-prefix="物流轨迹日期查询" :width="236" hint="按所选时间字段的北京时间日期查询，包含起止日" />
        <FieldSearch v-model="draft.keyword" v-model:field="draft.field" v-model:mode="draft.mode" :fields="fields" aria-prefix="物流轨迹" :width="348" style="flex:1 1 348px;min-width:318px;max-width:390px" @search="query" />
        <ElButton class="tracking-query-button" type="primary" @click="query">查询</ElButton><ElButton class="tracking-reset-button" @click="reset">重置</ElButton>
        <ElPopover :visible="advancedOpen" trigger="click" placement="bottom-end" :width="354" popper-class="tracking-more-popover"><template #reference><ElButton class="tracking-more" :icon="Filter" aria-label="更多筛选" title="注册状态与同步结果" :aria-expanded="advancedOpen" @click="advancedOpen = !advancedOpen" @keydown.esc.prevent="advancedOpen = false">更多<i v-if="hasAdvancedFilters" class="tracking-filter-dot" /></ElButton></template><section class="tracking-more-filters" @keydown.esc.stop="advancedOpen = false"><h3>更多筛选</h3><div><label>注册状态</label><MultiFilter v-model="draft.subscriptions" :options="subscriptionStatuses" placeholder="注册状态" :width="230" /></div><div><label>同步结果</label><MultiFilter v-model="draft.syncStates" :options="syncOptions" placeholder="同步结果" :width="230" /></div><footer><ElButton @click="advancedOpen = false">收起</ElButton><ElButton type="primary" @click="query">查询</ElButton></footer></section></ElPopover>
      </div></div><p v-if="queryError" class="tracking-query-error" role="alert">{{ queryError }}</p>
    </section>
    <div class="tracking-toolbar"><div><ElButton :icon="Plus" :disabled="!selected.length" v-prototype="annotation('register', '注册跟踪与受理')" @click="prepareAction('register', selected)">批量注册</ElButton><ElButton :icon="Refresh" :disabled="!selected.length" v-prototype="annotation('refresh', '更新轨迹与失败保留')" @click="prepareAction('refresh', selected)">批量更新轨迹</ElButton><span class="tracking-selection">已选 <b>{{ selected.length }}</b> 项</span></div><div><span class="tracking-results-count">共 {{ rows.length }} 个包裹</span><ElButton :icon="Download" v-prototype="annotation('export', '物流轨迹导出范围')" :disabled="!rows.length" @click="download">{{ selected.length ? '导出已选' : '导出查询结果' }}</ElButton></div></div>
    <div class="tracking-table-wrap" v-prototype="annotation('table', '包裹轨迹与关联身份')"><ElTable ref="table" :data="pageRows" row-key="id" height="100%" stripe @selection-change="selected = $event">
      <ElTableColumn type="selection" width="44" fixed="left" />
      <ElTableColumn label="跟踪号 / 查询运输商" min-width="222" fixed="left"><template #default="{ row }"><div class="tracking-cell-stack"><NumberCopy :value="row.number" label="跟踪号"><button class="tracking-link tracking-number" @click="openDetail(row as TrackingRecord)">{{ row.number }}</button></NumberCopy><span>{{ row.carrierName || '运输商待明确' }}</span><small>{{ row.country }}</small></div></template></ElTableColumn>
      <ElTableColumn label="物流状态" width="122"><template #default="{ row }"><div class="tracking-cell-stack"><ElTag :type="statusTone(row as TrackingRecord)" effect="light">{{ statusLabel(row.status) }}</ElTag><span class="tracking-substatus">{{ subStatusLabel(row.subStatus) }}</span></div></template></ElTableColumn>
      <ElTableColumn label="运输天数" width="112"><template #header>运输天数<ElTooltip :content="timingHelps.transit" placement="top"><ElIcon class="tracking-help"><QuestionFilled /></ElIcon></ElTooltip></template><template #default="{ row }"><div class="tracking-transit-days" v-prototype="annotation('timing', '运输天数与来源时效')">{{ transitDaysLabel(row as TrackingRecord) }}</div></template></ElTableColumn>
      <ElTableColumn label="最新轨迹" min-width="275"><template #default="{ row }"><div class="tracking-latest" role="button" tabindex="0" :aria-label="`查看${row.number}物流轨迹`" title="查看轨迹详情" @click="openDetail(row as TrackingRecord)" @keydown.enter.prevent="openDetail(row as TrackingRecord)" @keydown.space.prevent="openDetail(row as TrackingRecord)"><span :title="row.latestEventText">{{ row.latestEventText || (row.status === 'NotFound' ? '运输商暂未返回轨迹信息' : row.subscription === 'unregistered' ? '尚未注册跟踪' : '等待获取运输商轨迹') }}</span><small v-if="row.latestLocation">{{ row.latestLocation }}</small><time>{{ formatTrackingTime(row.latestEventAt) }}</time></div></template></ElTableColumn>
      <ElTableColumn label="系统订单 / 包裹" min-width="205"><template #default="{ row }"><div class="tracking-cell-stack"><NumberCopy :value="row.orderNo" label="系统订单号" /><span>{{ row.platform }} · {{ row.shopName }}</span><small>{{ row.packageNo }}</small></div></template></ElTableColumn>
      <ElTableColumn label="平台订单号 / 履约单号" min-width="238"><template #default="{ row }"><div class="tracking-reference-numbers" v-prototype="annotation('references', '平台订单与履约单号')"><span><small>平台</small><NumberCopy :value="row.platformOrderNo" label="平台订单号" /></span><span><small>履约</small><NumberCopy :value="row.fulfillmentNo" label="履约单号" /></span></div></template></ElTableColumn>
      <ElTableColumn label="订单 / 发货时间" width="184"><template #header>订单 / 发货时间<ElTooltip content="下单时间来自关联OMS订单，实际发货时间来自当前包裹有效出库事实，均按北京时间显示。" placement="top"><ElIcon class="tracking-help"><QuestionFilled /></ElIcon></ElTooltip></template><template #default="{ row }"><div class="tracking-order-dates" v-prototype="annotation('order-times', '订单与本包发货时间')"><span><small>下单</small><time>{{ formatTrackingTime(row.orderPlacedAt) }}</time></span><span><small>发货</small><time>{{ formatTrackingTime(row.shippedAt) }}</time></span></div></template></ElTableColumn>
      <ElTableColumn label="物流关键时间" width="190"><template #header>物流关键时间<ElTooltip content="首次为最早可靠来源轨迹时刻，揽收与签收为运输商节点时间。精确时刻按北京时间展示，只有日期时保留来源日期。" placement="top"><ElIcon class="tracking-help"><QuestionFilled /></ElIcon></ElTooltip></template><template #default="{ row }"><div class="tracking-key-dates"><span><small>首次</small><time>{{ firstTime(row as TrackingRecord) }}</time></span><span><small>揽收</small><time>{{ milestoneTime(row as TrackingRecord, 'PickedUp') }}</time></span><span><small>签收</small><time>{{ signatureTime(row as TrackingRecord) }}</time></span></div></template></ElTableColumn>
      <ElTableColumn label="发货仓库 / 物流渠道" min-width="164"><template #default="{ row }"><div class="tracking-cell-stack"><strong>{{ row.warehouse }}</strong><span>{{ row.channel }}</span></div></template></ElTableColumn>
      <ElTableColumn label="注册 / 同步状态" min-width="185"><template #header>注册 / 同步状态<ElTooltip content="更新时间为最近一次成功取得17TRACK缓存的时间，按北京时间展示，失败尝试不覆盖已有成功时间。" placement="top"><ElIcon class="tracking-help"><QuestionFilled /></ElIcon></ElTooltip></template><template #default="{ row }"><div class="tracking-cell-stack"><span class="tracking-subscription" :class="{ failure: row.subscription === 'failed' }"><i :class="row.subscription" />{{ subscriptionLabel(row.subscription) }}<span class="tracking-sync-label" :class="{ failure: row.syncState === 'failed' }">{{ syncLabel(row as TrackingRecord) }}</span></span><time>{{ formatTrackingTime(row.lastSyncAt) }}</time><ElTooltip v-if="row.syncError" :content="row.syncError" placement="top"><span class="tracking-error-text">{{ row.syncError }}</span></ElTooltip></div></template></ElTableColumn>
      <ElTableColumn label="操作" width="84" fixed="right"><template #default="{ row }"><div class="tracking-row-actions"><ElButton link type="primary" @click="openDetail(row as TrackingRecord)">查看轨迹</ElButton><ElButton v-if="canRegister(row as TrackingRecord)" link type="primary" @click="prepareAction('register', [row as TrackingRecord])">注册跟踪</ElButton><ElButton v-else-if="canRefresh(row as TrackingRecord)" link type="primary" @click="prepareAction('refresh', [row as TrackingRecord])">更新轨迹</ElButton></div></template></ElTableColumn>
      <template #empty><ElEmpty description="暂无符合条件的包裹"><ElButton @click="reset">重置筛选</ElButton></ElEmpty></template>
    </ElTable></div>
    <footer class="tracking-pagination"><span>每行对应一个包裹，物流状态独立于订单处理状态</span><ElPagination :current-page="page" :page-size="pageSize" :page-sizes="[10, 20, 50]" :total="rows.length" layout="total, sizes, prev, pager, next" @update:current-page="changePage" @update:page-size="pageSize = $event; changePage(1)" /></footer>
  </section>

  <ElDrawer :model-value="!!current" title="物流轨迹详情" size="860px" class="tracking-drawer" @update:model-value="!$event && (detailId = null)">
    <template v-if="current"><section class="tracking-detail-summary" v-prototype="annotation('detail', '轨迹详情、语言与时间')"><div><div class="tracking-detail-number"><NumberCopy :value="current.number" label="跟踪号" /><ElTag :type="statusTone(current)">{{ statusLabel(current.status) }}</ElTag></div><p>{{ current.carrierName || '运输商待明确' }} <span>·</span> {{ current.country }} <span>·</span> {{ current.packageNo }}</p></div><ElButton v-if="canRegister(current)" type="primary" :icon="Plus" @click="prepareAction('register', [current])">注册跟踪</ElButton><ElButton v-else-if="canRefresh(current)" :icon="Refresh" @click="prepareAction('refresh', [current])">更新轨迹</ElButton></section>
      <div class="tracking-detail-sync"><span>{{ subscriptionLabel(current.subscription) }} · {{ syncLabel(current) }}</span><span>最近成功同步 {{ formatTrackingTime(current.lastSyncAt) }}（北京时间）</span></div><div v-if="current.syncError" class="tracking-failure-banner">{{ current.syncError }}<span v-if="current.lastSyncAt">已保留上次成功取得的轨迹。</span></div>
      <section class="tracking-metrics-panel" v-prototype="annotation('timing', '运输天数与来源时效')"><div><span>运输天数<ElTooltip :content="timingHelps.transit" placement="top"><ElIcon class="tracking-help"><QuestionFilled /></ElIcon></ElTooltip></span><strong class="tracking-metric-days">{{ transitDaysLabel(current) }}</strong></div><div><span>首次轨迹时间<ElTooltip :content="timingHelps.first" placement="top"><ElIcon class="tracking-help"><QuestionFilled /></ElIcon></ElTooltip></span><strong>{{ firstTime(current) }}</strong></div><div><span>揽收时间<ElTooltip :content="timingHelps.picked" placement="top"><ElIcon class="tracking-help"><QuestionFilled /></ElIcon></ElTooltip></span><strong>{{ milestoneTime(current, 'PickedUp') }}</strong></div><div><span>签收时间<ElTooltip :content="timingHelps.delivered" placement="top"><ElIcon class="tracking-help"><QuestionFilled /></ElIcon></ElTooltip></span><strong>{{ signatureTime(current) }}</strong></div></section>
      <ElTabs v-model="detailTab" class="tracking-detail-tabs"><ElTabPane label="物流轨迹" name="trajectory"><div class="tracking-trajectory-tools"><ElRadioGroup v-model="language" size="small" aria-label="轨迹语言"><ElRadioButton value="original">原文</ElRadioButton><ElRadioButton value="zh">中文显示</ElRadioButton></ElRadioGroup><ElRadioGroup v-model="timeMode" size="small" aria-label="轨迹时间"><ElRadioButton value="beijing">北京时间</ElRadioButton><ElRadioButton value="source">来源时间</ElRadioButton></ElRadioGroup><ElSelect v-model="eventOrder" aria-label="轨迹顺序" size="small" class="tracking-order-select"><ElOption value="desc" label="最新在前" /><ElOption value="asc" label="最早在前" /></ElSelect></div>
        <section v-for="provider in current.providers" :key="provider.id" class="tracking-provider"><header><div><ElIcon><Van /></ElIcon><h3>{{ provider.name }}</h3></div><span>{{ provider.number }} · {{ provider.events.length }} 条轨迹</span></header><ol class="tracking-timeline"><li v-for="(event, index) in displayEvents(provider.events)" :key="event.id" :class="{ first: index === 0 }"><span class="tracking-timeline-dot" /><div class="tracking-event-time"><time>{{ formatEventTime(event, timeMode) }}</time><small v-if="timeMode === 'beijing' && !event.timeUtc">来源：{{ event.timeRaw }}</small></div><div class="tracking-event-content"><strong>{{ language === 'zh' && event.descriptionZh ? event.descriptionZh : event.description }}</strong><span v-if="language === 'zh' && !event.descriptionZh" class="tracking-translation-fallback">暂无中文，显示原文</span><p>{{ event.location || '地点未提供' }}</p><small>{{ statusLabel(event.status) }}<template v-if="event.subStatus"> · {{ subStatusLabel(event.subStatus) }}</template></small></div></li></ol><ElEmpty v-if="!provider.events.length" description="该运输商尚未返回轨迹事件" :image-size="70" /></section>
        <ElEmpty v-if="!current.providers.length" :description="current.subscription === 'unregistered' ? '尚未注册跟踪，请先注册' : current.subscription === 'failed' ? '注册未成功，请核对运输商后重试' : '尚未取得轨迹，请等待更新'" :image-size="90" />
      </ElTabPane><ElTabPane label="关联资料" name="related"><section class="tracking-info-section"><h3>订单与包裹</h3><dl class="tracking-info-grid"><div><dt>系统订单号</dt><dd><NumberCopy :value="current.orderNo" label="系统订单号" /></dd></div><div><dt>平台订单号</dt><dd><NumberCopy :value="current.platformOrderNo" label="平台订单号" /></dd></div><div><dt>平台 / 店铺</dt><dd>{{ current.platform }} / {{ current.shopName }}</dd></div><div><dt>订单下单时间（北京时间）</dt><dd>{{ formatTrackingTime(current.orderPlacedAt) }}</dd></div><div><dt>履约单号</dt><dd>{{ current.fulfillmentNo }}</dd></div><div><dt>包裹编号</dt><dd>{{ current.packageNo }}</dd></div><div><dt>目的国家 / 地区</dt><dd>{{ current.country }}</dd></div></dl></section><section class="tracking-info-section"><h3>仓库与查询信息</h3><dl class="tracking-info-grid"><div><dt>发货仓库</dt><dd>{{ current.warehouse }}</dd></div><div><dt>物流渠道</dt><dd>{{ current.channel }}</dd></div><div><dt>实际发货时间（北京时间）</dt><dd>{{ formatTrackingTime(current.shippedAt) }}</dd></div><div><dt>查询运输商 / 代码</dt><dd>{{ current.carrierName || '待明确' }} / {{ current.carrierCode ?? '—' }}</dd></div><div><dt>注册状态</dt><dd>{{ subscriptionLabel(current.subscription) }}</dd></div><div><dt>注册时间（北京时间）</dt><dd>{{ formatTrackingTime(current.registeredAt) }}</dd></div></dl></section><section class="tracking-info-section tracking-time-details" v-prototype="annotation('timing-details', '物流里程碑与其他时效')"><h3>物流时效与节点<ElTooltip content="精确时刻按北京时间展示；来源仅有日期时保留原日期，不补时刻或推测时区。" placement="top"><ElIcon class="tracking-help"><QuestionFilled /></ElIcon></ElTooltip></h3><dl class="tracking-info-grid"><div><dt>收到信息时间</dt><dd>{{ milestoneTime(current, 'InfoReceived') }}</dd></div><div><dt>离港时间</dt><dd>{{ milestoneTime(current, 'Departure') }}</dd></div><div><dt>到港时间</dt><dd>{{ milestoneTime(current, 'Arrival') }}</dd></div><div><dt>运单时效<ElTooltip content="17TRACK以首条来源事件计算的运单时效，与OMS订单下单时间无关。" placement="top"><ElIcon class="tracking-help"><QuestionFilled /></ElIcon></ElTooltip></dt><dd>{{ metricDaysLabel(current, 'daysAfterOrder') }}</dd></div><div><dt>妥投时效<ElTooltip content="仅收件人签收包裹展示17TRACK返回的妥投时效，未签收或无结果不将来源占位0展示为已妥投。" placement="top"><ElIcon class="tracking-help"><QuestionFilled /></ElIcon></ElTooltip></dt><dd>{{ metricDaysLabel(current, 'daysOfTransitDone') }}</dd></div><div><dt>信息无更新天数<ElTooltip content="读取17TRACK来源值；签收、退件签收和无结果不将占位0解读为刚更新。" placement="top"><ElIcon class="tracking-help"><QuestionFilled /></ElIcon></ElTooltip></dt><dd>{{ metricDaysLabel(current, 'daysAfterLastUpdate') }}</dd></div><div class="tracking-info-wide"><dt>预计投递时间</dt><dd>{{ estimatedDeliveryLabel(current) }}<span v-if="estimateSource(current) !== '—'" class="tracking-estimate-source">{{ estimateSource(current) }}</span></dd></div></dl></section></ElTabPane><ElTabPane label="操作日志" name="logs"><div class="tracking-logs"><article v-for="log in current.logs" :key="log.id"><div><strong>{{ log.action }}</strong><ElTag :type="/失败/.test(log.result) ? 'danger' : 'info'" size="small">{{ log.result }}</ElTag><time>{{ formatTrackingTime(log.at) }}（北京时间）</time></div><p>{{ log.detail }}</p></article><ElEmpty v-if="!current.logs.length" description="暂无操作记录" :image-size="70" /></div></ElTabPane></ElTabs>
    </template>
  </ElDrawer>
  <ElDialog v-model="confirmation" :title="action === 'register' ? '注册物流跟踪' : '更新物流轨迹'" width="740px" class="tracking-action-dialog" :close-on-click-modal="false"><p class="tracking-action-intro">本次{{ action === 'register' ? '注册' : '更新' }} <b>{{ targetRows.length }}</b> 个包裹<span v-if="skipped">，另有 {{ skipped }} 项不符合操作条件，已跳过</span>。</p><p class="tracking-action-note">{{ action === 'register' ? '注册受理后等待运输商返回轨迹，注册结果不代表物流已更新。查询运输商用于17TRACK识别跟踪号。' : '读取17TRACK已有轨迹，失败时保留上次成功结果。此操作不保证运输商立即产生新轨迹。' }}</p><ElTable :data="targetRows" max-height="330" row-key="id"><ElTableColumn prop="number" label="跟踪号" min-width="220" /><ElTableColumn label="查询运输商" min-width="210"><template #default="{ row }"><ElSelect v-if="action === 'register' && row.carrierCode === null" v-model="carrierDraft[row.id]" filterable clearable placeholder="请选择查询运输商" :aria-label="`${row.number}查询运输商`"><ElOption v-for="item in carrierOptions" :key="item.value" :value="item.value" :label="item.label" /></ElSelect><span v-else>{{ row.carrierName || '待明确' }}</span></template></ElTableColumn><ElTableColumn label="当前注册状态" width="138"><template #default="{ row }">{{ subscriptionLabel(row.subscription) }}</template></ElTableColumn></ElTable><template #footer><ElButton @click="confirmation = false">取消</ElButton><ElButton type="primary" :loading="executing" @click="executeAction">{{ action === 'register' ? '确认注册' : '确认更新' }}</ElButton></template></ElDialog>
  <ElDialog v-model="resultVisible" :title="action === 'register' ? '注册结果' : '更新结果'" width="740px" class="tracking-result-dialog"><div class="tracking-batch-summary"><span>共 {{ actionResults.length }} 项</span><span class="success">{{ action === 'register' ? '受理' : '取得缓存' }} {{ actionResults.filter(item => item.ok && !item.pending).length }}</span><span v-if="actionResults.some(item => item.pending)">等待轨迹 {{ actionResults.filter(item => item.pending).length }}</span><span class="failure">失败 {{ actionResults.filter(item => !item.ok).length }}</span><span v-if="skipped">跳过 {{ skipped }}</span></div><ElTable :data="actionResults" row-key="id" max-height="340"><ElTableColumn prop="number" label="跟踪号" min-width="220" /><ElTableColumn label="结果" width="90"><template #default="{ row }"><ElTag :type="row.pending ? 'info' : row.ok ? 'success' : 'danger'">{{ row.pending ? '等待轨迹' : row.ok ? (action === 'register' ? '已受理' : '已取得') : '失败' }}</ElTag></template></ElTableColumn><ElTableColumn prop="message" label="处理说明" min-width="250" /></ElTable><template #footer><ElButton type="primary" @click="resultVisible = false">完成</ElButton></template></ElDialog>
</template>
