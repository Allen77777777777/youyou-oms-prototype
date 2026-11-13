<script setup lang="ts">
import { currentHandlerId, handlerFilterOptions, handlerNames, matchesHandlerFilter } from '@/组件/客服处理人/处理人'
import { getCancelHandlerIds, getCancelSystemSkus, refreshCancelWithHandlers } from './处理人'
import { initializeReturnDemoContext } from '../eBay退换货申请/关联资料'
import { useBuyerPageActive } from '@/组件/买家/页面活跃'
import BuyerLink from '@/组件/买家/买家链接.vue'
import { computed, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Refresh, Download, Search } from '@element-plus/icons-vue'
import { ElCheckbox, ElButton, ElDialog, ElDrawer, ElEmpty, ElInput, ElMessage, ElOption, ElPagination, ElSelect, ElTable, ElTableColumn, ElTag, ElTooltip } from 'element-plus'
import MultiFilter from '@/组件/筛选/多选筛选.vue'
import FieldSearch from '@/组件/筛选/字段搜索.vue'
import DateRange from '@/组件/筛选/时间范围.vue'
import { 校验字段搜索, 校验时间范围, type 搜索字段 } from '@/组件/筛选/筛选工具'
import { addNote, blockedReason, cancellationOperationEntries, cancelKey, cancelTimeZone, createFilters, filterCancellations, formatCancelTime, inQueue, shopOptions, stateNames, statusNames, activityNames, partyNames, refundStatusNames, submitCancellation, type CancelAction, type CancelRecord } from './模型'
import OperationLogs from '@/组件/客服日志/日志列表.vue'
import { cancellationSession as session } from './会话'
import { cancellationAnnotation as annotation } from './标注'
import { cancelReasonLabel } from './原因映射'
import { 获取状态说明 } from '../eBay订单/订单工具'
import BuyerMail from './买家站内信.vue'
import TicketSourceActions from '@/页面/工单管理/来源工单操作.vue'
import type { TicketSource } from '../工单管理/会话'
import CopyNumber from '@/组件/单号复制.vue'
import { 共享订单 } from '../订单处理/演示会话'
import { 仓库会话单据 } from '../仓配管理/仓配会话'
import { resolveCancellationOrder, resolveCancellationOutbound } from './关联导航'
import type { CancelOutboundContext } from './模型'

const router = useRouter(), route = useRoute()
function ticketSource(row: CancelRecord): TicketSource {
  return { kind: 'cancel', id: row.cancelId, shopId: row.shopId, shopName: row.shop, summary: row.products[0]?.title || row.orderId }
}
const draft = reactive(createFilters()), applied = reactive(createFilters()), queue = ref('all'), page = ref(1), size = ref(20), error = ref('')
const fields: 搜索字段[] = [{ value: 'cancelId', label: 'CancelID' }, { value: 'orderId', label: '平台订单号' }, { value: 'buyer', label: '买家ID' }, { value: 'sku', label: 'SKU' }]
const onlyMine = ref(false)
const queues = [{ id: 'all', label: '全部' }, { id: 'pending', label: '待响应' }, { id: 'processing', label: '处理中' }, { id: 'closed', label: '已关闭' }]
const stateOptions = computed(() => Object.entries(stateNames).map(([value, label]) => ({ value, label })))
const base = computed(() => filterCancellations(session.records, applied).filter(row => {
  if (!onlyMine.value && !applied.handlers.length) return true
  const ids = getCancelHandlerIds(row)
  return matchesHandlerFilter(ids, applied.handlers) && (!onlyMine.value || ids.includes(currentHandlerId.value))
}))
const results = computed(() => base.value.filter(r => inQueue(r, queue.value)))
const rows = computed(() => results.value.slice((page.value - 1) * size.value, page.value * size.value))
const selected = ref<string[]>([]), table = ref<{ clearSelection: () => void }>()
function clearSelection() { selected.value = []; table.value?.clearSelection() }
function query() { error.value = 校验字段搜索(draft.query, draft.mode) || 校验时间范围(draft.dates) || ''; if (error.value) return; Object.assign(applied, { ...draft, handlers: [...draft.handlers], shops: [...draft.shops], states: [...draft.states], dates: draft.dates ? [...draft.dates] : null }); page.value = 1; clearSelection() }
function reset() { onlyMine.value = false; Object.assign(draft, createFilters()); queue.value = 'all'; query() }
watch([onlyMine, currentHandlerId], () => { page.value = 1; clearSelection() })
function changeQueue(value: string) { queue.value = value; page.value = 1; clearSelection() }
watch(size, () => { page.value = 1; clearSelection() })
watch(() => results.value.length, count => { page.value = Math.min(page.value, Math.max(1, Math.ceil(count / size.value))) })
const stateTone = (r: CancelRecord) => r.cancelState === 'CLOSED' ? 'info' : r.cancelState === 'OTHER' || !stateNames[r.cancelState] ? 'warning' : r.cancelState === 'APPROVAL_PENDING' ? 'primary' : 'warning'
const canRespond = (r: CancelRecord) => r.requestor === 'BUYER' && r.cancelState === 'APPROVAL_PENDING'
const orderState = (r: CancelRecord) => 获取状态说明('fulfillment', r.platformOrderStatus).text
const refundLabel = (r: CancelRecord) => r.refundStatus ? refundStatusNames[r.refundStatus] || '退款状态待核实' : '—'
const partyLabel = (party: string, activity: string) => party === 'UNKNOWN' && activity.startsWith('SYSTEM_') ? '平台系统' : partyNames[party] || '参与方待核实'
const activityHint = (party: string, activity: string) => `${activity} / ${party}${party === 'UNKNOWN' && activity.startsWith('SYSTEM_') ? '；“平台系统”为事件类型推断的展示标签' : ''}`
const money = (value: number | undefined, currency?: string) => value === undefined || value === null || !currency ? '—' : `${currency} ${value.toFixed(2)}`
const internalHint = (r: CancelRecord) => r.submission === 'unknown' ? '上次处理结果尚未确认，请刷新数据核实后再操作。' : r.submission === 'submitted' ? '本次处理已提交，请刷新数据查看最新进度。' : r.submission === 'failed' ? '上次处理未成功，请核对申请后重新处理。' : ''
const noteTime = (value: string | undefined, row: CancelRecord) => value?.trim() ? formatCancelTime(value, row) : '未记录'
const detailKey = ref(''), sourceError = ref('')
const detail = computed(() => {
  const matches = session.records.filter(row => cancelKey(row) === detailKey.value)
  return matches.length === 1 ? matches[0] : undefined
})
const detailOpen = computed({ get: () => !!detail.value, set: (value: boolean) => {
  if (value) return
  detailKey.value = ''
  if ('cancelId' in route.query) {
    const { shopId, cancelId, ...otherQuery } = route.query
    void router.replace({ path: route.path, query: otherQuery })
  }
} })
const linkedOrder = computed(() => detail.value && resolveCancellationOrder(detail.value, 共享订单.value))
const linkedOutbounds = computed(() => new Set((detail.value?.outbounds || []).filter(context => detail.value && resolveCancellationOutbound(detail.value, context, 仓库会话单据.value, 共享订单.value)).map(context => context.outboundId)))
const note = ref(''), detailError = ref('')
function openDetail(r: CancelRecord) {
  if (r.systemOrderNo === 'OMS-DEMO-RET-002') initializeReturnDemoContext(r.systemOrderNo)
  detailKey.value = cancelKey(r); note.value = ''; detailError.value = ''
}
watch(() => route.fullPath, () => {
  if (route.path !== '/oms/ebay-service/cancellations') return
  sourceError.value = ''
  detailKey.value = ''
  if (!('cancelId' in route.query || 'shopId' in route.query)) return
  const matches = session.records.filter(row => row.shopId === route.query.shopId && row.cancelId === route.query.cancelId)
  if (matches.length === 1) openDetail(matches[0]!)
  else sourceError.value = '未找到唯一对应的取消申请，请核对店铺和CancelID'
}, { immediate: true })
function openOrder(r: CancelRecord) {
  const order = resolveCancellationOrder(r, 共享订单.value)
  if (!order) return void ElMessage.warning('订单关联尚未核实，请核对当前申请的订单信息')
  detailKey.value = ''; void router.push({ name: 'oms-all-order-detail', params: { systemOrderNo: order.systemOrderNo } })
}
function openOutbound(r: CancelRecord, context: CancelOutboundContext) {
  const row = resolveCancellationOutbound(r, context, 仓库会话单据.value, 共享订单.value)
  if (!row) return void ElMessage.warning('出库单关联尚未核实，请核对仓库账号及来源订单')
  detailKey.value = ''; void router.push({ path: '/oms/warehouse-delivery/outbound-orders', query: { outboundId: row.id } })
}
function saveNote() { if (!detail.value) return; if (!addNote(detail.value, note.value)) { detailError.value = '请填写 1～500 字的备注。'; return }; note.value = ''; detailError.value = ''; ElMessage.success('备注已添加') }
function refreshOne(r: CancelRecord) { refreshCancelWithHandlers(r); ElMessage.success(r.submission === 'unknown' ? '数据已刷新，上次处理结果仍待确认。' : '数据已刷新') }
function refreshList() { const targets = selected.value.length ? session.records.filter(r => selected.value.includes(cancelKey(r))) : session.records.filter(r => !applied.shops.length || applied.shops.includes(r.shopId)); targets.forEach(r => refreshCancelWithHandlers(r)); ElMessage.success(`已刷新 ${targets.length} 条申请`); clearSelection() }
const confirmOpen = ref(false), action = ref<CancelAction>('approve'), actionKey = ref(''), actionNote = ref(''), actionError = ref('')
const actionRecord = computed(() => session.records.find(r => cancelKey(r) === actionKey.value))
function openAction(r: CancelRecord, kind: CancelAction) { const block = blockedReason(r, kind); if (block) return void ElMessage.warning(block); actionKey.value = cancelKey(r); action.value = kind; actionNote.value = ''; actionError.value = ''; confirmOpen.value = true }
function confirmAction() { if (!actionRecord.value) return; const result = submitCancellation(actionRecord.value, action.value, actionNote.value); if (!result.ok) { actionError.value = result.message; return }; confirmOpen.value = false; ElMessage.success('处理已提交，可刷新数据查看最新进度。') }
function exportRows() {
  const data = selected.value.length ? results.value.filter(r => selected.value.includes(cancelKey(r))) : results.value
  if (!data.length) return void ElMessage.warning('当前没有可导出的申请')
  const cell = (v: unknown) => `"${String(v ?? '').replace(/^[=+@\-]/, "'$&").replace(/"/g, '""')}"`
  const csv = '\uFEFF' + [['CancelID', '店铺ID', '店铺', '平台订单号', '买家ID', '发起人', '处理人', '平台处理状态', '平台处理状态原值', '处理结果摘要', '退款状态', '申请时间', '显示时区', '数据性质'], ...data.map(r => [r.cancelId, r.shopId, r.shop, r.orderId, r.buyer, r.requestor === 'BUYER' ? '买家' : '卖家', handlerNames(getCancelHandlerIds(r)), stateNames[r.cancelState] || r.cancelState, r.cancelState, statusNames[r.cancelStatus] || r.cancelStatus, refundLabel(r), formatCancelTime(r.createdAt, r), cancelTimeZone(), '虚构评审数据'])].map(row => row.map(cell).join(',')).join('\r\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' })); const a = document.createElement('a'); a.href = url; a.download = 'eBay取消订单申请-虚构评审数据.csv'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
}
const buyerPageActive = useBuyerPageActive()
</script>

<template>
  <section v-prototype="annotation('overview')" class="cancel-page">
    <div v-prototype="annotation('queues')" class="cancel-queues" role="tablist" aria-label="取消申请平台流程阶段">
      <button v-for="q in queues" :key="q.id" role="tab" :aria-selected="queue === q.id" :class="{ active: queue === q.id }" @click="changeQueue(q.id)">{{ q.label }} <span>{{ base.filter(r => inQueue(r, q.id)).length }}</span></button>
    </div>
    <div v-prototype="annotation('filters')" class="cancel-filters">
      <ElCheckbox v-model="onlyMine">只看我的</ElCheckbox>
      <MultiFilter v-model="draft.handlers" :options="handlerFilterOptions" placeholder="处理人" :width="130" />
      <MultiFilter v-model="draft.shops" :options="shopOptions" placeholder="店铺" :width="154" />
      <MultiFilter v-model="draft.states" :options="stateOptions" placeholder="平台处理状态" :width="155" />
      <ElSelect v-model="draft.requestor" clearable placeholder="发起人" aria-label="取消申请发起人" style="width:125px"><ElOption value="BUYER" label="买家发起" /><ElOption value="SELLER" label="卖家发起" /></ElSelect>
      <span class="field-label">申请时间</span><DateRange v-model="draft.dates" precision="date" :width="248" aria-prefix="取消申请" :shortcuts-enabled="false" hint="按北京时间的申请日期筛选，包含起止日" />
      <FieldSearch v-model="draft.query" v-model:field="draft.field" v-model:mode="draft.mode" :fields="fields" aria-prefix="取消申请" :width="374" @search="query" />
      <ElButton type="primary" :icon="Search" @click="query">查询</ElButton><ElButton @click="reset">重置</ElButton>
      <p v-if="error" class="cancel-error" role="alert">{{ error }}</p>
      <p v-if="sourceError" class="cancel-error" role="alert">{{ sourceError }}</p>
    </div>
    <div class="cancel-toolbar">
      <span v-if="selected.length" class="muted">已选 {{ selected.length }} 条</span>
      <div class="toolbar-right">
        <div v-prototype="annotation('sync')" class="sync-actions">
          <ElButton :icon="Refresh" @click="refreshList">{{ selected.length ? '刷新所选' : '刷新数据' }}</ElButton>
        </div>
        <ElButton :icon="Download" @click="exportRows">导出{{ selected.length ? `（${selected.length}）` : '' }}</ElButton>
      </div>
    </div>
    <ElTable ref="table" v-prototype="annotation('table')" :data="rows" :row-key="cancelKey" border height="calc(100vh - 290px)" class="cancel-table" @selection-change="selected = $event.map((r: CancelRecord) => cancelKey(r))">
      <ElTableColumn type="selection" width="44" />
      <ElTableColumn label="CancelID" min-width="170"><template #default="{ row }"><button class="link" @click="openDetail(row as CancelRecord)">{{ row.cancelId }}</button><div class="subline">{{ row.orderId }}</div><div class="subline">{{ row.shop }} · {{ row.site }}</div></template></ElTableColumn>
      <ElTableColumn label="商品信息" min-width="170"><template #default="{ row }"><div class="product-title">{{ row.products[0]?.title || '—' }}</div><div v-if="row.products[0]" class="subline">{{ row.products[0].sku }} × {{ row.products[0].quantity }}</div><button v-if="row.products.length > 1" class="link subline" @click="openDetail(row as CancelRecord)">共 {{ row.products.length }} 种商品</button></template></ElTableColumn>
      <ElTableColumn label="买家 / 取消原因" min-width="145"><template #default="{ row }"><div><BuyerLink :shop-id="row.shopId" :buyer-id="row.buyer" /></div><div class="subline"><ElTooltip :disabled="!row.reasonCode?.trim()" :content="row.reasonCode || ''"><span>{{ cancelReasonLabel(row.reasonCode) }}</span></ElTooltip></div><ElTag size="small" :type="row.requestor === 'SELLER' ? 'info' : 'primary'" effect="plain">{{ row.requestor === 'BUYER' ? '买家发起' : '卖家发起' }}</ElTag></template></ElTableColumn>
      <ElTableColumn label="平台处理状态" min-width="145"><template #default="{ row }"><ElTooltip :content="row.cancelState" placement="top"><ElTag :type="stateTone(row as CancelRecord)" size="small">{{ stateNames[row.cancelState] || '状态待核实' }}</ElTag></ElTooltip><ElTooltip :content="row.cancelStatus" placement="top"><div class="subline">{{ statusNames[row.cancelStatus] || '处理结果待核实' }}</div></ElTooltip><div v-if="row.refundStatus" class="subline">退款：{{ refundLabel(row as CancelRecord) }}</div></template></ElTableColumn>
      <ElTableColumn label="订单 / 履约状态" min-width="155"><template #default="{ row }"><div>平台：{{ orderState(row as CancelRecord) }}</div><div class="subline">OMS：{{ row.omsStatus || '—' }}</div><div class="subline">已出库 {{ row.shipped === null ? '待核实' : `${row.shipped} 件` }}</div><div class="subline" :class="{ warning: row.activeWarehouse !== false }">{{ row.activeWarehouse === null ? '仓库执行待核实' : row.activeWarehouse ? '仓库执行未结束' : '无未结束仓库执行' }}</div></template></ElTableColumn>
      <ElTableColumn label="申请时间 / 响应期限" min-width="184"><template #default="{ row }"><div>{{ formatCancelTime(row.createdAt, row as CancelRecord) }}</div><div class="subline">截止 {{ formatCancelTime(row.dueAt, row as CancelRecord) }}</div></template></ElTableColumn>
      <ElTableColumn label="处理人" min-width="98"><template #default="{ row }">{{ handlerNames(getCancelHandlerIds(row as CancelRecord)) }}</template></ElTableColumn>
        <ElTableColumn label="操作" width="132" fixed="right"><template #default="{ row }"><div class="cancel-row-actions">
        <ElButton link type="primary" size="small" @click="openDetail(row as CancelRecord)">{{ canRespond(row as CancelRecord) ? '处理' : '查看' }}</ElButton>
        <TicketSourceActions compact :source="ticketSource(row as CancelRecord)" />
      </div></template></ElTableColumn>
      <template #empty><ElEmpty description="没有匹配的取消申请" :image-size="70" /></template>
    </ElTable>
    <footer class="cancel-pagination"><span class="muted">共 {{ results.length }} 条</span><ElPagination v-model:current-page="page" v-model:page-size="size" :total="results.length" :page-sizes="[10,20,50]" layout="sizes, prev, pager, next, jumper" @current-change="clearSelection" /></footer>

    <ElDrawer :model-value="buyerPageActive && detailOpen" @update:model-value="value => { if (buyerPageActive) detailOpen = value }" title="取消订单申请详情" size="min(1250px, 96vw)" class="cancel-drawer" :destroy-on-close="buyerPageActive">
      <template #header="{ titleId, titleClass }">
        <div class="detail-drawer-header">
          <h2 :id="titleId" :class="titleClass">取消订单申请详情</h2>
          <div v-if="detail" class="cancel-detail-actions">
            <TicketSourceActions :source="ticketSource(detail)" />
            <div v-prototype="annotation('detail-sync')" class="sync-actions detail-refresh">
              <ElButton :icon="Refresh" @click="refreshOne(detail)">刷新数据</ElButton>
            </div>
          </div>
        </div>
      </template>
      <template v-if="detail">
        <div v-prototype="annotation('detail')" class="detail-content">
          <div class="detail-heading"><div><div class="detail-id"><span>CancelID</span><strong><CopyNumber :value="detail.cancelId" label="CancelID" /></strong></div><p class="muted">{{ detail.shop }} · {{ detail.site }} · <BuyerLink :shop-id="detail.shopId" :buyer-id="detail.buyer" /></p></div><div class="detail-heading-status"><ElTooltip :content="detail.cancelState"><ElTag :type="stateTone(detail)">{{ stateNames[detail.cancelState] || '状态待核实' }}</ElTag></ElTooltip><div class="subline">{{ statusNames[detail.cancelStatus] || '处理结果待核实' }}</div></div></div>
          <div class="detail-meta"><span>处理人 {{ handlerNames(getCancelHandlerIds(detail)) }}</span><span>{{ detail.site }}</span><span>最近刷新 {{ formatCancelTime(detail.lastSyncedAt, detail) }}</span></div>
          <p v-if="internalHint(detail)" class="business-hint" role="status">{{ internalHint(detail) }}</p>
          <div class="detail-workspace">
            <main class="detail-main">
              <section class="detail-panel application-panel"><h3>申请与退款</h3><dl class="detail-grid"><dt>发起人</dt><dd>{{ detail.requestor === 'BUYER' ? '买家' : '卖家' }}</dd><dt v-prototype="annotation('reason')">取消原因</dt><dd><ElTooltip :disabled="!detail.reasonCode?.trim()" :content="detail.reasonCode || ''"><span>{{ cancelReasonLabel(detail.reasonCode) }}</span></ElTooltip></dd><dt>申请时间</dt><dd>{{ formatCancelTime(detail.createdAt, detail) }}</dd><dt>响应期限</dt><dd>{{ formatCancelTime(detail.dueAt, detail) }}</dd><dt>退款状态</dt><dd><ElTooltip :disabled="!detail.refundStatus" :content="detail.refundStatus"><span>{{ refundLabel(detail) }}</span></ElTooltip></dd><dt>实际退款金额</dt><dd>{{ money(detail.actualRefundAmount, detail.actualRefundCurrency) }}</dd><dt>退款时间</dt><dd>{{ formatCancelTime(detail.refundIssuedAt, detail) }}</dd><dt>平台处理结果</dt><dd><ElTooltip :content="detail.cancelStatus"><span>{{ statusNames[detail.cancelStatus] || '处理结果待核实' }}</span></ElTooltip></dd></dl></section>
              <section v-prototype="annotation('order-context')" class="detail-panel order-context"><h3>订单信息</h3><dl class="detail-grid"><dt>OMS订单号</dt><dd><CopyNumber :value="detail.systemOrderNo" label="OMS订单号"><button v-if="linkedOrder" class="link" type="button" @click="openOrder(detail)">{{ detail.systemOrderNo }}</button><span v-else>{{ detail.systemOrderNo || '—' }}</span></CopyNumber></dd><dt>平台订单号</dt><dd><CopyNumber :value="detail.orderId" label="平台订单号" /></dd><dt>平台订单状态</dt><dd><ElTooltip :disabled="!detail.platformOrderStatus" :content="detail.platformOrderStatus || ''"><span>{{ orderState(detail) }}</span></ElTooltip></dd><dt>OMS订单状态</dt><dd>{{ detail.omsStatus || '—' }}</dd><dt>订单金额</dt><dd>{{ money(detail.amount, detail.currency) }}</dd><dt>实际出库数量</dt><dd>{{ detail.shipped === null ? '待核实' : `${detail.shipped} 件` }}</dd></dl>
                <div class="fulfillment-check"><span>平台取消资格 <b :class="{ warning: detail.eligibility !== true }">{{ detail.eligibility === null ? '待核实' : detail.eligibility ? '符合' : '不符合' }}</b></span><span>仓库执行 <b :class="{ warning: detail.activeWarehouse !== false }">{{ detail.activeWarehouse === null ? '待核实' : detail.activeWarehouse ? '存在未结束执行' : '无未结束执行' }}</b></span></div>
                <p v-if="canRespond(detail) && blockedReason(detail, 'approve') && !internalHint(detail)" class="business-hint">{{ blockedReason(detail, 'approve') }}</p>
              </section>
              <section class="detail-panel"><h3>整单商品 <small>{{ detail.products.length }} 种</small></h3><ElTable :data="detail.products" border><ElTableColumn label="商品" prop="title" min-width="180" /><ElTableColumn label="SKU" prop="sku" min-width="145" /><ElTableColumn label="订单数量" prop="quantity" width="85" /></ElTable></section>
              <section class="detail-panel outbound-panel"><h3>关联三方仓出库单</h3><ElTable v-if="detail.outbounds?.length" :data="detail.outbounds" row-key="no" border class="outbound-context-table"><ElTableColumn label="三方仓出库单号" min-width="180"><template #default="{ row }"><div><CopyNumber :value="row.externalNo" label="三方仓出库单号"><button v-if="row.externalNo && linkedOutbounds.has(row.outboundId)" class="link" type="button" @click="openOutbound(detail, row as CancelOutboundContext)">{{ row.externalNo }}</button><span v-else>{{ row.externalNo || '—' }}</span></CopyNumber></div><div class="subline">OMS出库单号<br /><CopyNumber :value="row.no" label="OMS出库单号"><button v-if="row.no && linkedOutbounds.has(row.outboundId)" class="link" type="button" @click="openOutbound(detail, row as CancelOutboundContext)">{{ row.no }}</button><span v-else>{{ row.no || '—' }}</span></CopyNumber></div></template></ElTableColumn><ElTableColumn label="发货仓库 / 账号" min-width="150"><template #default="{ row }"><div>{{ row.warehouse || '—' }}</div><div class="subline">{{ row.account || '—' }}</div></template></ElTableColumn><ElTableColumn label="物流渠道" min-width="145"><template #default="{ row }"><div>{{ row.channel || '—' }}</div><div class="subline">{{ row.channelCode || '—' }}</div></template></ElTableColumn><ElTableColumn label="出库状态" min-width="105"><template #default="{ row }"><ElTag size="small" :type="row.status === '已出库' ? 'success' : row.status === '已取消' ? 'info' : 'warning'">{{ row.status || '—' }}</ElTag></template></ElTableColumn><ElTableColumn label="跟踪号 / 发货时间" min-width="170"><template #default="{ row }"><div><CopyNumber :value="row.tracking" label="跟踪号" /></div><div class="subline">{{ formatCancelTime(row.shippedAt, detail) }}</div></template></ElTableColumn></ElTable><div v-else class="outbound-empty">{{ detail.outbounds ? '暂无关联三方仓出库单' : '三方仓出库单关联信息待核实' }}</div></section>
            </main>
            <aside class="detail-aside">
              <section v-prototype="annotation('platform-history')" class="detail-panel"><h3>平台处理过程</h3><ol v-if="detail.activityHistories.length" class="history platform-history"><li v-for="(event, i) in detail.activityHistories" :key="i"><div class="history-event"><ElTooltip :content="activityHint(event.activityParty, event.activityType)"><strong>{{ activityNames[event.activityType] || '平台事件待核实' }}</strong></ElTooltip><span class="actor">{{ partyLabel(event.activityParty, event.activityType) }}</span></div><time>{{ formatCancelTime(event.actionDate, detail) }}</time><p v-if="event.stateFrom || event.stateTo" class="history-transition">{{ event.stateFrom ? stateNames[event.stateFrom] || event.stateFrom : '—' }} <span>→</span> {{ event.stateTo ? stateNames[event.stateTo] || event.stateTo : '—' }}</p></li></ol><div v-else class="empty-inline">暂无平台处理过程</div></section>
              <section v-prototype="annotation('buyer-mail')" class="detail-panel buyer-mail-panel">
                <BuyerMail :key="cancelKey(detail)" :shop-id="detail.shopId" :buyer-id="detail.buyer"
                  :application="{ kind: 'cancel', applicationId: detail.cancelId, shopName: detail.shop, orderNo: detail.orderId, recipient: detail.mailRecipient, systemSkus: getCancelSystemSkus(detail) }" />
              </section>
              <section v-prototype="annotation('notes')" class="detail-panel internal-notes-panel"><h3>内部备注</h3><ElInput v-model="note" type="textarea" :rows="3" maxlength="500" show-word-limit placeholder="添加内部跟进记录，不发送给买家" aria-label="取消申请内部备注" /><div class="note-actions"><ElButton @click="saveNote">添加备注</ElButton></div><p v-if="detailError" role="alert" class="cancel-error">{{ detailError }}</p><div v-for="(n, i) in detail.notes" :key="i" class="note-row"><p>{{ typeof n === 'string' ? n : n.text }}</p><small>操作人：{{ typeof n === 'string' ? '未记录' : n.author?.trim() || '未记录' }} · 时间：{{ typeof n === 'string' ? '未记录' : noteTime(n.at, detail) }}</small></div></section>
              <section v-prototype="annotation('logs')" class="detail-panel operation-logs-panel"><OperationLogs :key="cancelKey(detail)" class="internal-records" :entries="cancellationOperationEntries(detail)" :format-time="value => formatCancelTime(value, detail!)" /></section>
            </aside>
          </div>
        </div>
      </template>
      <template #footer><div v-if="detail" v-prototype="annotation('response')" class="drawer-footer"><span /><template v-if="canRespond(detail)"><ElTooltip :disabled="!blockedReason(detail, 'reject')" :content="blockedReason(detail, 'reject')"><span><ElButton :disabled="!!blockedReason(detail, 'reject')" @click="openAction(detail, 'reject')">拒绝</ElButton></span></ElTooltip><ElTooltip :disabled="!blockedReason(detail, 'approve')" :content="blockedReason(detail, 'approve')"><span><ElButton type="primary" :disabled="!!blockedReason(detail, 'approve')" @click="openAction(detail, 'approve')">同意取消</ElButton></span></ElTooltip></template><ElButton @click="detailOpen = false">关闭</ElButton></div></template>
    </ElDrawer>
    <ElDialog :model-value="buyerPageActive && confirmOpen" @update:model-value="value => { if (buyerPageActive) confirmOpen = value }" :title="action === 'approve' ? '确认同意取消订单' : '确认拒绝取消申请'" width="540px" append-to-body :destroy-on-close="buyerPageActive" :close-on-click-modal="false"><template v-if="actionRecord"><p>CancelID：<strong>{{ actionRecord.cancelId }}</strong></p><p>店铺：{{ actionRecord.shop }}</p><p>订单：{{ actionRecord.orderId }} · {{ actionRecord.products.length }} 种商品</p><p class="business-hint">{{ action === 'approve' ? '同意后将向 eBay 提交整单取消；已付款订单的退款进度需以平台最新结果为准。' : '拒绝后买家取消请求将结束。若已发货，随请求提供当前记录中的发货时间与跟踪号。' }}</p><label class="note-label">内部处理说明</label><ElInput v-model="actionNote" type="textarea" :rows="3" maxlength="500" show-word-limit placeholder="记录本次核对及处理依据，仅内部留存" aria-label="取消申请处理说明" /><p v-if="actionError" class="cancel-error" role="alert">{{ actionError }}</p></template><template #footer><ElButton @click="confirmOpen = false">返回</ElButton><ElButton type="primary" @click="confirmAction">确认{{ action === 'approve' ? '同意' : '拒绝' }}</ElButton></template></ElDialog>
  </section>
</template>

<style scoped>
.cancel-page{background:#fff;min-height:calc(100vh - 64px);padding:14px 16px 10px;box-sizing:border-box;min-width:0;color:#303133;font-size:13px}.cancel-filters{display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding-bottom:13px}.cancel-filters :deep(.el-button)+.el-button{margin-left:0}.field-label{color:#606266;margin-left:3px}.cancel-queues{display:flex;gap:23px;border-bottom:1px solid #e6e8eb;min-height:43px;align-items:stretch}.cancel-queues button{border:0;background:transparent;color:#606266;padding:8px 2px;cursor:pointer;font:inherit;border-bottom:2px solid transparent}.cancel-queues button.active{color:#1677ff;border-color:#1677ff;font-weight:600}.cancel-queues button span{background:#f0f2f5;border-radius:9px;padding:1px 7px;margin-left:4px;font-size:11px}.cancel-queues button.active span{background:#eaf3ff}.cancel-toolbar{display:flex;justify-content:space-between;gap:12px;align-items:center;padding:12px 0;flex-wrap:wrap}.muted,.subline{color:#909399;font-size:12px}.subline{margin:5px 0;line-height:1.5;overflow-wrap:anywhere}.cancel-table{width:100%}.cancel-table :deep(th.el-table__cell){color:var(--yy-text-heading,#151515);background:#f6f7f9;font-weight:600}.cancel-table :deep(.el-table__cell){padding:12px 0;font-size:12px}.product-title{line-height:1.5}.link{border:0;background:transparent;padding:0;color:#1677ff;cursor:pointer;text-align:left;font:inherit;word-break:break-all}.warning{color:#c27803}.cancel-error{color:#d83d3d;flex-basis:100%;margin:5px 0}.cancel-pagination{display:flex;justify-content:space-between;gap:12px;align-items:center;padding-top:14px;flex-wrap:wrap}.sync-actions{display:flex;gap:5px;align-items:center}.detail-heading{display:flex;justify-content:space-between;gap:16px;align-items:start}.detail-id{display:flex;align-items:center;gap:12px;flex-wrap:wrap}.detail-id>span{font-size:12px;color:#909399}.detail-heading strong{font-size:20px;color:var(--yy-text-heading,#151515)}.detail-heading p{margin:8px 0 0}.detail-heading-status{text-align:right;flex-shrink:0}.detail-meta{display:flex;gap:18px;align-items:center;margin:14px 0 18px;color:#909399;font-size:11px;flex-wrap:wrap}.detail-workspace{display:grid;grid-template-columns:minmax(0,1.75fr) minmax(300px,1fr);gap:20px;align-items:start}.detail-main,.detail-aside{min-width:0}.detail-panel{border:1px solid #e8ebef;border-radius:5px;padding:16px;margin-bottom:16px;min-width:0}.detail-panel h3{font-size:14px;color:var(--yy-text-heading,#151515);margin:0 0 17px;display:flex;align-items:center;gap:9px}.detail-panel h3 small{font-weight:400;color:#909399;font-size:12px}.detail-grid{display:grid;grid-template-columns:106px minmax(0,1fr) 106px minmax(0,1fr);gap:17px 10px;font-size:12px;margin:0}.detail-grid dt{color:#909399;line-height:1.7}.detail-grid dd{margin:0;overflow-wrap:anywhere;line-height:1.7}.fulfillment-check{display:flex;gap:18px;flex-wrap:wrap;background:#f8fafc;border-radius:4px;padding:12px;margin-top:17px;font-size:12px;color:#606266}.fulfillment-check b{margin-left:8px;font-weight:500}.business-hint{background:#fff8e9;color:#986618;padding:11px 14px;line-height:1.7;font-size:12px;border-radius:4px}.detail-panel>.business-hint:last-child{margin-bottom:0}.outbound-context-table{width:100%;font-size:12px}.detail-panel :deep(.el-table__cell){font-size:12px}.detail-panel :deep(th.el-table__cell){background:#f6f7f9;color:var(--yy-text-heading,#151515)}.outbound-context-table :deep(.cell){overflow-wrap:anywhere}.outbound-empty,.empty-inline{padding:20px 12px;text-align:center;color:#909399;font-size:12px;background:#fafbfc;border-radius:4px}.note-actions{display:flex;justify-content:flex-end;margin-top:10px}.note-row{padding:12px 0;border-bottom:1px solid #ebeef5;line-height:1.7;font-size:12px;white-space:pre-wrap;overflow-wrap:anywhere}.drawer-footer{display:flex;align-items:center;gap:10px}.drawer-footer>span:empty{flex:1}.drawer-footer :deep(.el-button)+.el-button{margin-left:0}.history{list-style:none;padding:0 0 0 4px;margin:0}.history li{border-left:2px solid #e6edf8;padding:0 0 22px 15px;position:relative}.history li:last-child{padding-bottom:0;border-left-color:transparent}.history li:before{content:'';position:absolute;width:8px;height:8px;background:#79aaff;border-radius:50%;left:-5px;top:3px}.history time{color:#909399;font-size:11px}.history p{line-height:1.7;margin:7px 0 0;font-size:12px;overflow-wrap:anywhere}.history-event{display:flex;gap:10px;justify-content:space-between;align-items:start;margin-bottom:7px}.history-event strong{font-size:12px;font-weight:500;color:var(--yy-text-heading,#151515);line-height:1.5}.actor{font-size:11px;color:#909399;flex-shrink:0}.history-transition{color:#606266}.history-transition>span{color:#b5bdca;margin:0 5px}.internal-records{margin-top:18px;border-top:1px solid #ebeef5;padding-top:14px}.internal-records summary{font-size:12px;color:#606266;cursor:pointer}.internal-records .history{margin-top:18px}.note-label{display:block;margin:18px 0 9px;color:var(--yy-text-heading,#151515)}@media(max-width:1350px){.cancel-page{padding:12px}.cancel-filters{gap:7px}.detail-workspace{grid-template-columns:minmax(0,1.6fr) minmax(300px,1fr);gap:14px}.detail-panel{padding:14px}.detail-grid{grid-template-columns:98px minmax(0,1fr) 98px minmax(0,1fr);gap:14px 8px}}@media(max-width:1050px){.detail-workspace{grid-template-columns:minmax(0,1fr)}.detail-grid{grid-template-columns:106px minmax(0,1fr) 106px minmax(0,1fr)}}@media(max-width:700px){.detail-grid{grid-template-columns:95px minmax(0,1fr)}.cancel-queues{gap:12px;flex-wrap:wrap}.drawer-footer{gap:6px;flex-wrap:wrap}.detail-heading-status{text-align:left}.detail-heading{flex-wrap:wrap}}
/* 详情的标题、申请身份与状态集中呈现，减少抽屉首屏留白。 */
.detail-drawer-header{display:flex;align-items:center;justify-content:space-between;gap:16px;min-width:0;flex:1}
.detail-drawer-header h2{margin:0;min-width:0;color:var(--yy-text-heading,#151515)}
.detail-refresh{flex:none}
.detail-refresh :deep(.el-button){height:32px;font-size:12px}
:global(.cancel-drawer .el-drawer__header) {
  margin-bottom: 10px;
  padding: 18px 22px 0;
}
:global(.cancel-drawer .el-drawer__title) {
  font-size: 22px;
  line-height: 30px;
  font-weight: 600;
}
:global(.cancel-drawer .el-drawer__body) {
  padding: 0 22px 20px;
}
.detail-heading {
  gap: 14px;
  align-items: center;
}
.detail-heading > div:first-child {
  min-width: 0;
}
.detail-id {
  gap: 8px;
  line-height: 28px;
}
.detail-heading p {
  margin-top: 3px;
  line-height: 18px;
}
.detail-heading-status :deep(.el-tag) {
  height: 32px;
  padding: 0 13px;
  font-size: 15px;
  font-weight: 600;
}
.detail-heading-status :deep(.el-tag--primary) {
  --el-tag-bg-color: #eaf3ff;
  --el-tag-border-color: #a8ccff;
  --el-tag-text-color: #155fce;
}
.detail-heading-status .subline {
  margin: 4px 0 0;
}
.detail-meta {
  margin: 7px 0 13px;
  gap: 14px;
}
@media (max-width: 1350px) {
  :global(.cancel-drawer .el-drawer__header) {
    padding: 16px 18px 0;
  }
  :global(.cancel-drawer .el-drawer__body) {
    padding: 0 18px 18px;
  }
}
@media (max-width: 700px) {
  .detail-heading {
    align-items: flex-start;
    gap: 10px;
  }
}
.cancel-row-actions,.cancel-detail-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.cancel-filters{padding-top:14px;padding-bottom:0}
.cancel-filters :deep(.el-button),.cancel-toolbar :deep(.el-button){height:32px;font-size:12px}
.toolbar-right{display:flex;align-items:center;justify-content:flex-end;gap:8px;margin-left:auto;flex-wrap:wrap}
.toolbar-right :deep(.el-button)+.el-button{margin-left:0}
.cancel-row-actions :deep(.el-button){font-size:12px}
</style>
