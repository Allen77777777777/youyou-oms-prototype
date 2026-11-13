<script setup lang="ts">
import { handlerNames, handlerFilterOptions } from '@/组件/客服处理人/处理人'
import { useBuyerPageActive } from '@/组件/买家/页面活跃'
import BuyerLink from '@/组件/买家/买家链接.vue'
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { Download } from '@element-plus/icons-vue'
import { ElButton, ElDialog, ElDrawer, ElEmpty, ElInput, ElMessage, ElOption, ElPagination, ElSelect, ElTable, ElTableColumn, ElTag, ElTooltip } from 'element-plus'
import MultiFilter from '@/组件/筛选/多选筛选.vue'
import FieldSearch from '@/组件/筛选/字段搜索.vue'
import DateRange from '@/组件/筛选/时间范围.vue'
import { type 搜索字段 } from '@/组件/筛选/筛选工具'
import { 共享订单 } from '../订单处理/演示会话'
import { reviewSession } from './会话'
import { formatReviewTime } from './模型'
import { reviewAnnotation as annotation } from './标注'
import { getReviewContactBlockedReason, resolveReviewContact } from './联系买家模型'
import MailVerificationLink from '../eBay站内信/发送核查入口.vue'
import { getVisibleContactMailVerifications } from '../eBay站内信/发送核查'
import { getAwaitingReviewOrders } from './未收到评价会话'
import { resolveAwaitingOmsOrder } from './未收到评价订单关联'
import { cloneAwaitingFilters, reviewViewSession, saveAwaitingReviewView } from './评价视图会话'
import { AWAITING_LOGISTICS_PLACEHOLDER, addAwaitingReviewNote, validateAwaitingReviewFilters, createAwaitingReviewFilters, exportAwaitingReviewCsv, filterAwaitingReviewOrders, getAwaitingShippedDays, projectAwaitingReviewOrders, type AwaitingReviewRow } from './未收到评价模型'

const emit = defineEmits<{ contact: [id: string] }>()
const router = useRouter()
const savedView = reviewViewSession.awaiting, viewGeneration = reviewViewSession.awaitingGeneration
const draft = reactive(cloneAwaitingFilters(savedView.draft)), applied = reactive(cloneAwaitingFilters(savedView.applied))
const page = ref(savedView.page), pageSize = ref(savedView.pageSize), selected = ref<string[]>([...savedView.selected]), error = ref('')
const table = ref<{ clearSelection(): void; toggleRowSelection(row: AwaitingReviewRow, selected: boolean): void }>()
const fields: 搜索字段[] = [{ value: 'orderNo', label: '平台订单号' }, { value: 'buyerId', label: '买家ID' }, { value: 'sku', label: '系统SKU' }, { value: 'platformSku', label: '平台SKU' }, { value: 'title', label: '商品名称', kind: 'text' }]
const sourceOrders = computed(getAwaitingReviewOrders)
const projected = computed(() => projectAwaitingReviewOrders(sourceOrders.value, reviewSession.reviews, reviewSession.buyerFeedback))
const shops = computed(() => [...new Map(sourceOrders.value.map(order => [order.shopId, { value: order.shopId, label: order.shopName }])).values()].filter(option => option.value))
const outboundStates = computed(() => [...new Set(sourceOrders.value.flatMap(order => order.outboundStatuses))].map(value => ({ value, label: value })))
const dates = computed({ get: () => draft.dateRange.length ? [...draft.dateRange] : null, set: (value: string[] | null) => { draft.dateRange = value?.length === 2 ? [value[0]!, value[1]!] : [] } })
function clearSelection() { selected.value = []; table.value?.clearSelection() }
function query() {
  error.value = validateAwaitingReviewFilters(draft) ?? ''
  if (error.value) return
  Object.assign(applied, cloneAwaitingFilters(draft)); page.value = 1; clearSelection()
}
function reset() { Object.assign(draft, createAwaitingReviewFilters()); query() }
const base = computed(() => filterAwaitingReviewOrders(projected.value, { ...applied, status: 'all' }))
const results = computed(() => filterAwaitingReviewOrders(projected.value, applied))
const rows = computed(() => results.value.slice((page.value - 1) * pageSize.value, page.value * pageSize.value))
onMounted(async () => {
  await nextTick()
  const restored = rows.value.filter(row => savedView.selected.includes(row.id))
  selected.value = restored.map(row => row.id)
  for (const row of restored) table.value?.toggleRowSelection(row, true)
})
onBeforeUnmount(() => saveAwaitingReviewView({ draft, applied, page: page.value, pageSize: pageSize.value, selected: selected.value }, viewGeneration))
function changeQueue(status: 'unreviewed' | 'check') { draft.status = status; applied.status = status; page.value = 1; clearSelection() }
watch(() => results.value.length, count => { page.value = Math.min(page.value, Math.max(1, Math.ceil(count / pageSize.value))) })
watch(pageSize, () => { page.value = 1; clearSelection() })
const formatTime = formatReviewTime
const shippedDays = (row: AwaitingReviewRow) => getAwaitingShippedDays(row)
const blockReason = (row: AwaitingReviewRow) => row.status === 'check' ? row.blockedReason || '评价或订单关联尚待核对，核对后再联系买家' : getReviewContactBlockedReason(`awaiting:${row.id}`)
const contactVerifications = (row: AwaitingReviewRow) => row.status === 'check' ? [] : getVisibleContactMailVerifications(resolveReviewContact(`awaiting:${row.id}`))
function contact(row: AwaitingReviewRow) { if (!blockReason(row as AwaitingReviewRow)) emit('contact', `awaiting:${row.id}`) }
const detailId = ref('')
const detail = computed(() => results.value.find(row => row.id === detailId.value))
const detailOpen = computed({ get: () => !!detail.value, set: (value: boolean) => { if (!value) detailId.value = '' } })
function linkedOmsOrder(row: AwaitingReviewRow) {
  const source = sourceOrders.value.filter(order => order.id === row.id)
  return source.length === 1 ? resolveAwaitingOmsOrder(source[0]!, 共享订单.value) : undefined
}
function viewOrder(row: AwaitingReviewRow) {
  if (sourceOrders.value.filter(order => order.id === row.id).length !== 1) { ElMessage.warning('订单资料已变化，请重新查询后查看'); return }
  const target = linkedOmsOrder(row)
  if (target) { void router.push({ name: 'oms-all-order-detail', params: { systemOrderNo: target.systemOrderNo } }); return }
  detailId.value = row.id
}
const orderLinkLabel = (row: AwaitingReviewRow) => linkedOmsOrder(row) ? '查看OMS订单' : '查看订单信息'
const noteId = ref(''), noteText = ref(''), noteError = ref('')
const noteOrder = computed(() => sourceOrders.value.find(order => order.id === noteId.value))
const noteOpen = computed({ get: () => !!noteOrder.value, set: (value: boolean) => { if (!value) { noteId.value = ''; noteText.value = ''; noteError.value = '' } } })
function openNote(row: AwaitingReviewRow) { noteId.value = row.id; noteText.value = ''; noteError.value = '' }
function saveNote() {
  if (!noteOrder.value) return
  const result = addAwaitingReviewNote(noteOrder.value, noteText.value)
  noteError.value = result.ok ? '' : result.message
  if (result.ok) { noteOpen.value = false; ElMessage.success('备注已添加') }
}
const latestNote = (row: AwaitingReviewRow) => row.notes[row.notes.length - 1]
function exportData() {
  const exported = selected.value.length ? results.value.filter(row => selected.value.includes(row.id)) : results.value
  const url = URL.createObjectURL(new Blob([exportAwaitingReviewCsv(exported)], { type: 'text/csv;charset=utf-8;' }))
  const link = document.createElement('a'); link.href = url; link.download = 'eBay未收到买家评价-虚构评审数据.csv'; link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
const buyerPageActive = useBuyerPageActive()
</script>

<template>
  <div class="awaiting-review-panel" v-prototype="annotation('awaiting', '未收到买家评价')">
    <div class="review-filters awaiting-review-filters" v-prototype="annotation('awaitingFilters', '未收到评价订单筛选')">
      <MultiFilter v-model="draft.shopIds" :options="shops" placeholder="全部店铺" :width="145" />
      <MultiFilter v-model="draft.handlerIds" :options="handlerFilterOptions" placeholder="处理人" :width="120" />
      <MultiFilter v-model="draft.outboundStatuses" :options="outboundStates" placeholder="出库状态" :width="130" />
      <ElSelect v-model="draft.automated" aria-label="未收到评价来源" style="width:146px"><ElOption value="all" label="全部评价情况" /><ElOption value="none" label="暂无评价" /><ElOption value="only" label="仅平台自动评价" /></ElSelect>
      <ElSelect v-model="draft.sellerFeedback" aria-label="是否已给买家好评" style="width:145px"><ElOption value="all" label="全部好评情况" /><ElOption value="sent" label="已给买家好评" /><ElOption value="not_sent" label="尚未给买家好评" /><ElOption value="partial" label="部分已给好评" /><ElOption value="unknown" label="好评记录待核对" /></ElSelect>
      <div class="awaiting-days"><span>发货天数</span><ElInput v-model="draft.minDays" inputmode="numeric" aria-label="发货最少天数" placeholder="起" /><span>至</span><ElInput v-model="draft.maxDays" inputmode="numeric" aria-label="发货最多天数" placeholder="止" /></div>
      <div class="review-search-row"><span class="review-date-label">发货时间</span><DateRange v-model="dates" precision="date" :width="250" aria-prefix="未收到评价发货" hint="按北京时间的发货日期查询，包含起止日期。" /><FieldSearch v-model="draft.query" v-model:field="draft.field" v-model:mode="draft.mode" :fields="fields" :width="360" aria-prefix="未收到评价" @search="query" /><ElButton type="primary" @click="query">查询</ElButton><ElButton @click="reset">重置</ElButton></div>
    </div>
    <p v-if="error" class="review-inline-error awaiting-error" role="alert">{{ error }}</p>
    <div class="review-tools">
      <div class="review-queues" aria-label="未收到评价订单视图" v-prototype="annotation('awaitingQueues', '未收到与待核对视图')"><button :class="{ active: applied.status === 'unreviewed' }" :aria-pressed="applied.status === 'unreviewed'" @click="changeQueue('unreviewed')">未收到买家评价 <b>{{ base.filter(row => row.status === 'unreviewed').length }}</b></button><button :class="{ active: applied.status === 'check' }" :aria-pressed="applied.status === 'check'" @click="changeQueue('check')">待核对 <b>{{ base.filter(row => row.status === 'check').length }}</b></button></div>
      <ElButton :icon="Download" :disabled="!results.length" v-prototype="annotation('awaitingExport', '导出未收到评价订单')" @click="exportData">导出{{ selected.length ? '所选' : '' }}</ElButton>
    </div>
    <div class="review-table awaiting-review-table" v-prototype="annotation('awaitingTable', '订单与未评价商品')">
      <ElTable ref="table" :data="rows" row-key="id" height="100%" stripe @selection-change="(items: AwaitingReviewRow[]) => selected = items.map(item => item.id)">
        <ElTableColumn type="selection" width="38" />
        <ElTableColumn type="expand" width="34"><template #default="{ row }"><div class="awaiting-lines"><h3>{{ row.status === 'check' ? '待核对商品' : '未收到买家评价的商品' }}</h3><ElTable :data="row.missingLines" row-key="id" size="small"><ElTableColumn prop="title" label="商品名称" min-width="160" /><ElTableColumn prop="sku" label="系统SKU" min-width="130" /><ElTableColumn prop="platformSku" label="平台SKU" min-width="140" /><ElTableColumn prop="quantity" label="数量" width="70" /><ElTableColumn label="商品行处理人" min-width="114"><template #default="{ row: line }">{{ handlerNames(line.handlerIds ?? []) }}</template></ElTableColumn><ElTableColumn label="评价情况" width="160"><template #default="{ row: line }"><span>{{ row.status === 'check' ? '待核对' : line.automatedOnly ? '仅平台自动评价'  : '未收到买家评价' }}</span><small v-if="line.association !== 'confirmed'" class="review-time">交易关联待核对</small></template></ElTableColumn></ElTable></div></template></ElTableColumn>
        <ElTableColumn label="店铺 / 买家" width="155"><template #default="{ row }"><div class="review-shop">{{ row.shopName || '店铺待核对' }}</div><div class="review-secondary"><BuyerLink :shop-id="row.shopId" :buyer-id="row.buyerId">{{ row.buyerId || '买家待核对' }}</BuyerLink></div><button class="review-order-link" @click="viewOrder(row as AwaitingReviewRow)">{{ row.orderNo || '订单号待核对' }}</button></template></ElTableColumn>
        <ElTableColumn label="未评价商品" min-width="190"><template #default="{ row }"><div v-for="line in row.missingLines.slice(0, 2)" :key="line.id" class="awaiting-product"><span>{{ line.title }}</span><small>{{ line.sku }}</small></div><div class="awaiting-line-count"><template v-if="row.missingLines.length < row.unreviewedLineCount">匹配 {{ row.missingLines.length }} 项 · {{ row.unreviewedLineCount }} 项未评价</template><template v-else>{{ row.status === 'check' ? '待核对' : '未评价' }} {{ row.missingLines.length }} / {{ row.totalLineCount }} 项</template><small v-if="row.missingLines.length > 2"> · 展开查看全部</small></div></template></ElTableColumn>
        <ElTableColumn label="发货时间 / 天数" width="148"><template #default="{ row }"><span>{{ formatTime(row.shippedAt) }}</span><small class="review-time">{{ shippedDays(row as AwaitingReviewRow) === undefined ? '发货天数待核对' : `已发货 ${shippedDays(row as AwaitingReviewRow)} 天` }}</small></template></ElTableColumn>
        <ElTableColumn label="出库 / 物流轨迹" width="150"><template #default="{ row }"><div v-prototype="annotation('awaitingShipping', '出库状态与物流轨迹占位')"><span>{{ row.outboundStatuses.join('、') || '—' }}</span><small class="review-time">物流轨迹：{{ AWAITING_LOGISTICS_PLACEHOLDER }}</small><small v-for="tracking in row.trackingNumbers" :key="tracking" class="review-time awaiting-tracking">{{ tracking }}</small></div></template></ElTableColumn>
        <ElTableColumn label="评价情况" width="124"><template #default="{ row }"><ElTag size="small" :type="row.status === 'check' ? 'warning' : 'info'" effect="plain">{{ row.status === 'check' ? '待核对' : row.automatedOnly ? '仅平台自动评价' : '暂无评价' }}</ElTag><small v-if="row.blockedReason" class="awaiting-check-reason">{{ row.blockedReason }}</small><small v-else-if="row.reviewedLineCount" class="review-time">{{ row.reviewedLineCount }} 项已收到买家评价</small></template></ElTableColumn>
        <ElTableColumn label="处理人" min-width="110"><template #default="{ row }">{{ handlerNames(row.handlerIds) }}</template></ElTableColumn>
        <ElTableColumn label="给买家好评" width="112"><template #default="{ row }"><span>{{ row.sellerFeedbackLabel }}</span></template></ElTableColumn>
        <ElTableColumn label="内部备注" min-width="145"><template #default="{ row }"><template v-if="latestNote(row as AwaitingReviewRow)"><button class="review-comment review-note-preview" :title="latestNote(row as AwaitingReviewRow)?.text" @click="openNote(row as AwaitingReviewRow)">{{ latestNote(row as AwaitingReviewRow)?.text }}</button><small class="review-time">{{ latestNote(row as AwaitingReviewRow)?.by }} · {{ formatTime(latestNote(row as AwaitingReviewRow)!.at) }}</small></template><span v-else class="review-muted">—</span></template></ElTableColumn>
        <ElTableColumn label="操作" width="132" fixed="right"><template #default="{ row }"><div class="review-row-actions"><ElButton v-prototype="annotation('awaitingOrderLink', '查看OMS订单与订单信息')" link type="primary" @click="viewOrder(row as AwaitingReviewRow)">{{ orderLinkLabel(row as AwaitingReviewRow) }}</ElButton><MailVerificationLink v-if="contactVerifications(row as AwaitingReviewRow).length" :targets="contactVerifications(row as AwaitingReviewRow)" /><ElTooltip v-else :disabled="!blockReason(row as AwaitingReviewRow)" :content="blockReason(row as AwaitingReviewRow)" placement="top"><span><ElButton link type="primary" :disabled="!!blockReason(row as AwaitingReviewRow)" @click="contact(row as AwaitingReviewRow)">联系买家</ElButton></span></ElTooltip><ElButton link type="primary" @click="openNote(row as AwaitingReviewRow)">添加备注</ElButton></div></template></ElTableColumn>
        <template #empty><ElEmpty :description="applied.status === 'check' ? '没有需要核对的订单' : '没有符合条件的未评价订单'" :image-size="66" /></template>
      </ElTable>
    </div>
    <footer class="review-pagination"><span>共 {{ results.length }} 笔订单<span v-if="selected.length"> · 已选 {{ selected.length }} 笔</span></span><ElPagination v-model:current-page="page" v-model:page-size="pageSize" :page-sizes="[10, 20, 50]" :total="results.length" layout="sizes, prev, pager, next, jumper" size="small" :pager-count="5" @current-change="clearSelection" /></footer>
    <ElDrawer :model-value="buyerPageActive && detailOpen" @update:model-value="value => { if (buyerPageActive) detailOpen = value }" title="订单与评价跟踪" size="min(860px, 94vw)" :destroy-on-close="buyerPageActive"><div v-if="detail" class="awaiting-order-detail" v-prototype="annotation('awaitingDetail', '未评价订单上下文')"><h3>{{ detail.orderNo }}</h3><dl><dt>店铺</dt><dd>{{ detail.shopName }}</dd><dt>买家ID</dt><dd><BuyerLink :shop-id="detail.shopId" :buyer-id="detail.buyerId">{{ detail.buyerId || '待核对' }}</BuyerLink></dd><dt>处理人</dt><dd>{{ handlerNames(detail.handlerIds) }}</dd><dt>OMS处理状态</dt><dd>{{ detail.processingStatus }}</dd><dt>发货时间</dt><dd>{{ formatTime(detail.shippedAt) }}（北京时间）</dd><dt>出库状态</dt><dd>{{ detail.outboundStatuses.join('、') || '—' }}</dd><dt>物流轨迹状态</dt><dd>{{ AWAITING_LOGISTICS_PLACEHOLDER }}</dd><dt>跟踪号</dt><dd>{{ detail.trackingNumbers.join('、') || '暂无资料' }}</dd><dt>评价情况</dt><dd>{{ detail.status === 'check' ? '待核对' : detail.automatedOnly ? '仅平台自动评价，未收到买家主动评价' : '未收到买家评价' }}</dd><dt>给买家好评</dt><dd>{{ detail.sellerFeedbackLabel }}</dd></dl><p v-if="detail.blockedReason" class="awaiting-check-reason">{{ detail.blockedReason }}</p><h3>{{ detail.status === 'check' ? '待核对商品' : '未评价商品' }}</h3><ElTable :data="detail.missingLines" row-key="id"><ElTableColumn prop="title" label="商品名称" min-width="160" /><ElTableColumn prop="sku" label="系统SKU" min-width="130" /><ElTableColumn prop="platformSku" label="平台SKU" min-width="140" /><ElTableColumn prop="quantity" label="数量" width="70" /><ElTableColumn label="商品行处理人" min-width="114"><template #default="{ row: line }">{{ handlerNames(line.handlerIds ?? []) }}</template></ElTableColumn></ElTable><div class="awaiting-detail-actions"><MailVerificationLink v-if="contactVerifications(detail).length" :targets="contactVerifications(detail)" /><ElTooltip v-else :disabled="!blockReason(detail)" :content="blockReason(detail)" placement="top"><span><ElButton type="primary" :disabled="!!blockReason(detail)" @click="contact(detail)">联系买家</ElButton></span></ElTooltip><ElButton @click="openNote(detail)">添加备注</ElButton></div><h3>内部备注</h3><div v-for="(item, index) in [...detail.notes].reverse()" :key="index" class="awaiting-note"><p>{{ item.text }}</p><small>{{ item.by }} · {{ formatTime(item.at) }}</small></div><p v-if="!detail.notes.length" class="review-muted">暂无内部备注</p></div></ElDrawer>
    <ElDialog :model-value="buyerPageActive && noteOpen" @update:model-value="value => { if (buyerPageActive) noteOpen = value }" title="添加内部备注" width="min(560px, 92vw)" align-center :close-on-click-modal="false" :destroy-on-close="buyerPageActive"><div v-if="noteOrder" class="awaiting-note-form" v-prototype="annotation('awaitingNotes', '未评价订单内部备注')"><p>{{ noteOrder.shopName }} · <BuyerLink :shop-id="noteOrder.shopId" :buyer-id="noteOrder.buyerId" /><br />{{ noteOrder.orderNo }}</p><ElInput v-model="noteText" type="textarea" :rows="5" maxlength="1000" show-word-limit aria-label="未评价订单内部备注" placeholder="填写本次沟通或跟进情况" /><p v-if="noteError" role="alert" class="review-inline-error">{{ noteError }}</p></div><template #footer><ElButton @click="noteOpen = false">关闭</ElButton><ElButton type="primary" @click="saveNote">保存备注</ElButton></template></ElDialog>
  </div>
</template>

<style scoped>
.awaiting-review-panel{flex:1;min-height:0;min-width:0;display:flex;flex-direction:column;overflow:hidden}.awaiting-review-filters{gap:8px}.awaiting-days{display:flex;align-items:center;gap:7px;font-size:12px;color:#6c7d91}.awaiting-days .el-input{width:56px}.awaiting-days :deep(.el-input__inner){font-size:12px}.awaiting-error{padding:0 16px}.awaiting-product{display:flex;flex-direction:column;margin:0 0 7px;line-height:1.55}.awaiting-product span{color:#415975;overflow-wrap:anywhere}.awaiting-product small{color:#97a4b5;font-size:10px;overflow-wrap:anywhere}.awaiting-line-count{font-size:11px;color:#8192a7}.awaiting-line-count small{font-size:10px}.awaiting-tracking{font-size:10px;overflow-wrap:anywhere}.awaiting-check-reason{display:block;color:#b38c55;font-size:11px;line-height:1.65;margin:6px 0 0;overflow-wrap:anywhere}.awaiting-lines{padding:13px 22px 18px 54px;background:#fafbfd}.awaiting-lines h3,.awaiting-order-detail h3{font-size:13px;color:var(--yy-text-heading);font-weight:600;margin:0 0 13px}.awaiting-lines :deep(.el-table__cell){padding:7px 0}.awaiting-order-detail{font-size:13px;color:#5b6e85;line-height:1.8}.awaiting-order-detail dl{display:grid;grid-template-columns:100px minmax(0,1fr);gap:10px;margin:0 0 25px}.awaiting-order-detail dt{color:#95a3b5}.awaiting-order-detail dd{margin:0;overflow-wrap:anywhere}.awaiting-detail-actions{display:flex;align-items:center;gap:9px;margin:20px 0 28px}.awaiting-note{padding:10px 0;border-bottom:1px solid #edf0f5}.awaiting-note p{white-space:pre-wrap;overflow-wrap:anywhere;margin:0 0 5px}.awaiting-note small{font-size:11px;color:#99a5b6}.awaiting-note-form p{font-size:12px;line-height:1.8;color:#8393a8;margin:0 0 16px}.awaiting-note-form :deep(.el-textarea__inner){font-size:13px;line-height:1.8}@media(max-width:1280px){.awaiting-lines{padding-left:24px}.awaiting-review-filters{gap:7px}}
</style>
