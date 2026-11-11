<script setup lang="ts">
import { handlerNames } from '@/组件/客服处理人/处理人'
import { getReturnHandlerIds, getReturnSystemSkus } from './处理人'
import { useBuyerPageActive } from '@/组件/买家/页面活跃'
import BuyerLink from '@/组件/买家/买家链接.vue'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, toRefs, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Refresh } from '@element-plus/icons-vue'
import { ElAlert, ElButton, ElDialog, ElInput, ElMessage, ElTable, ElTableColumn, ElTag, ElTooltip } from 'element-plus'
import CopyNumber from '@/组件/单号复制.vue'
import OperationLogs from '@/组件/客服日志/日志列表.vue'
import { returnOperationEntries } from './操作日志'
import TicketSourceActions from '@/页面/工单管理/来源工单操作.vue'
import { findRecord as findDispute } from '../eBay纠纷/模型'
import { disputeLocation } from '../eBay纠纷/导航'
import BuyerMail from '../eBay取消订单申请/买家站内信.vue'
import { 共享订单 } from '../订单处理/演示会话'
import { 仓库会话单据 } from '../仓配管理/仓配会话'
import { 获取状态说明 } from '../eBay订单/订单工具'
import type { CancelOutboundContext } from '../eBay取消订单申请/模型'
import { resolveReturnOrder, resolveReturnOutbound, resolveReturnItem } from './关联导航'
import { actionNames, actionOptions, addReturnNote, createReturnActionDraft, escalationReasons, formatReturnTime, getReturnApprovalAction, getReturnBlockedReason, getReturnDetail, isEscalated, prepareReturnAction, returnKey, stateNames, submitPreparedReturnAction, type ReturnAction, type ReturnRecord } from './模型'
import PlatformStatus from './平台状态资料.vue'
import { afterSaleReasons, afterSaleReturnSummary, canViewAfterSale, recordsForReturn, validateAfterSale } from '../售后单管理/会话'
import { createReturnSaleDraft, isSaleAction, prepareDirectSale, submitReturnAndSale, syncReturnWithSales, validateSaleQuantity } from './售后联动'
import ReturnSaleFields from './售后联填.vue'
import ReshipForm from './重发办理.vue'
import { activityNames, noLabelReasons, formatMinor, parseMoney, type ReturnAddress } from './接口契约'
import { readReturnDetailView, clearReturnDetailView } from './视图会话'
import { 注册业务页签清理 } from '@/布局/页签操作'
import ReturnData from './退货资料.vue'
import ReturnItemData from './申请商品资料.vue'
import ReturnHistoryAttributes from './历史属性资料.vue'
import ReturnActionForm from './处理表单.vue'
import { returnAnnotation as annotation } from './标注'
const props = defineProps<{ row: ReturnRecord }>()
const router = useRouter(), route = useRoute(), active = computed(() => props.row)
const linkedCase = computed(() => {
  const row = active.value
  const found = row.caseId ? findDispute(row.shopId, 'EBAY_CASE', row.caseId) : undefined
  return found?.links.some(source => source.kind === 'RETURN' && source.shopId === row.shopId && source.id === row.id) ? found : undefined
})
const view = readReturnDetailView(returnKey(props.row))
const { note, action, actionDraft, actionError, confirmation, prepared, refreshFeedback } = toRefs(view)
watch([() => view.saleDraft, actionDraft], () => { actionError.value = '' }, { deep: true })
const currentPath = route.path
注册业务页签清理(currentPath, () => clearReturnDetailView(returnKey(props.row)))
const readingPane = ref<HTMLElement>(), operationPane = ref<HTMLElement>()
onMounted(() => nextTick(() => { if (readingPane.value) readingPane.value.scrollTop = view.readScroll; if (operationPane.value) operationPane.value.scrollTop = view.actionScroll }))
onBeforeUnmount(() => { view.readScroll = readingPane.value?.scrollTop || 0; view.actionScroll = operationPane.value?.scrollTop || 0 })
const now = ref(new Date().toISOString()), clock = setInterval(() => { now.value = new Date().toISOString() }, 30_000)
onBeforeUnmount(() => clearInterval(clock))
const time = (value: string | null | undefined, row: ReturnRecord) => formatReturnTime(value, row)
const noteTime = (value: string | undefined) => value?.trim() ? formatReturnTime(value, active.value) : '未记录'
const orderedNotes = computed(() => [...active.value.notes].reverse())
const buyerMailTime = (value: string) => formatReturnTime(value, active.value)
const closed = (row: ReturnRecord) => row.state === 'CLOSED' || row.status === 'CLOSED'
const linkedItem = computed(() => resolveReturnItem(active.value, 共享订单.value))
const activeDetail = computed(() => active.value ? getReturnDetail(active.value) : null)
const linkedOrder = computed(() => active.value && resolveReturnOrder(active.value, 共享订单.value))
const linkedOutbounds = computed(() => new Set((active.value?.outbounds || []).filter(context => active.value && resolveReturnOutbound(active.value, context, 仓库会话单据.value, 共享订单.value)).map(context => context.outboundId)))
const orderAmount = computed(() => { const amount = linkedOrder.value?.amount.orderAmount; return amount?.currency && amount.value !== undefined ? amount.currency + ' ' + amount.value : '—' })
const orderAddress = computed<ReturnAddress | null>(() => { const value = linkedOrder.value?.address; return value ? { name: value.fullName, addressLine1: value.addressLine1, addressLine2: value.addressLine2, city: value.city || '', stateOrProvince: value.stateProvince || '', postalCode: value.postalCode || '', country: value.countryCode } : null })
const orderState = (row: ReturnRecord) => 获取状态说明('fulfillment', row.platformOrderStatus || '').text
const internalHint = (row: ReturnRecord) => row.outcome === 'pending' ? '处理已提交，等待平台回执。请刷新数据查看进度。' : row.outcome === 'unknown' ? '上次处理结果尚未确认，请先刷新核查；确认前不能重复提交。' : row.outcome === 'failed' ? '上次处理未成功，请查看下方处理结果，核对后按当前资格继续。' : ''
function openOrder(row: ReturnRecord) { const order = resolveReturnOrder(row, 共享订单.value); if (!order) return void ElMessage.warning('订单关联尚未核实，请核对当前申请的订单信息'); void router.push({ name: 'oms-all-order-detail', params: { systemOrderNo: order.systemOrderNo } }) }
function openOutbound(row: ReturnRecord, context: CancelOutboundContext) { const outbound = resolveReturnOutbound(row, context, 仓库会话单据.value, 共享订单.value); if (!outbound) return void ElMessage.warning('出库单关联尚未核实，请核对仓库账号及来源订单'); void router.push({ path: '/oms/warehouse-delivery/outbound-orders', query: { outboundId: outbound.id } }) }
function saveNote() { if (!active.value) return; const error = addReturnNote(active.value, note.value); if (error) return void ElMessage.warning(error); note.value = ''; ElMessage.success('内部备注已保存') }
function syncOne() { if (!active.value) return; const result = syncReturnWithSales(active.value); refreshFeedback.value = result.message; if (result.status === 'success') ElMessage.success(result.message); else ElMessage.warning(result.message) }
const actionPanel = ref<HTMLElement>()
type WorkbenchAction = ReturnAction | 'reship'
const actionList = computed<WorkbenchAction[]>(() => {
  const extra: ReturnAction[] = ['provideRma', 'receive', 'label']
  return ['approve', 'partial', 'refund', 'message', 'decline', 'reship', 'escalate',
    ...extra.filter(value => active.value.options.includes(actionOptions[value]))]
})
const permissionError = (row: ReturnRecord, value: ReturnAction) => isSaleAction(value, false) && !canViewAfterSale(row) ? '当前人员没有该店铺的售后办理权限' : ''
const blocked = (row: ReturnRecord, value: ReturnAction) => permissionError(row, value) || getReturnBlockedReason(row, value === 'approve' ? getReturnApprovalAction(row) : value, now.value)
const requiresSale = computed(() => isSaleAction(action.value, actionDraft.value?.keepOriginalItem))
watch(requiresSale, () => {
  view.preparedSale = undefined
  prepared.value = null
  confirmation.value = false
})
const selected = (value: ReturnAction) => action.value === value || (value === 'approve' && action.value === 'offerReturn')
const linkedSales = computed(() => recordsForReturn(active.value.shopId, active.value.id))
const saleTotals = computed(() => afterSaleReturnSummary(active.value.shopId, active.value.id))
const hasReturnSale = computed(() => linkedSales.value.some(sale => sale.kind === '退货'))
function openSale(no: string) { void router.push({ path: '/oms/ebay-service/after-sale-orders', query: { documentNo: no } }) }
function closeAction() {
  action.value = null; actionDraft.value = null; prepared.value = null; confirmation.value = false
  view.saleDraft = undefined; view.preparedSale = undefined; view.reshipOpen = false; view.reshipWork = undefined; actionError.value = ''
}
function chooseAction(value: ReturnAction) {
  const reason = blocked(active.value, value)
  if (reason) return void ElMessage.warning(reason)
  closeAction()
  const actual = value === 'approve' ? getReturnApprovalAction(active.value) : value
  action.value = actual
  actionDraft.value = createReturnActionDraft(active.value, actual)
  if (requiresSale.value) view.saleDraft = createReturnSaleDraft(active.value)
  void nextTick(() => { if (operationPane.value) operationPane.value.scrollTop = 0; actionPanel.value?.querySelector<HTMLInputElement | HTMLTextAreaElement>('input,textarea')?.focus({ preventScroll: true }) })
}
function prepare() {
  if (!action.value || !actionDraft.value) return
  view.preparedSale = undefined
  actionError.value = permissionError(active.value, action.value)
  if (actionError.value) return
  if (requiresSale.value) {
    const fields = view.saleDraft ??= createReturnSaleDraft(active.value)
    actionError.value = validateSaleQuantity(active.value, fields)
    if (!actionError.value && !afterSaleReasons.some(reason => reason === fields.reason)) actionError.value = '请选择系统售后原因'
    if (actionError.value) return
  }
  const read = syncReturnWithSales(active.value)
  if (read.status !== 'success') { actionError.value = '处理前资料核验未完成：' + read.message; return }
  const result = prepareReturnAction(active.value, action.value, actionDraft.value)
  actionError.value = result.error
  if (!result.prepared) return
  if (requiresSale.value) {
    const fields = view.saleDraft ??= createReturnSaleDraft(active.value)
    if (action.value === 'refund' && !fields.refundScope) { actionError.value = '请核实并选择本次退款类型'; return }
    const info = prepareDirectSale(active.value, result.prepared, fields)
    actionError.value = validateSaleQuantity(active.value, fields) || validateAfterSale(info).join('；')
    if (actionError.value) return
    view.preparedSale = info
  }
  prepared.value = result.prepared; confirmation.value = true
}
function submit() {
  if (!prepared.value) return
  actionError.value = permissionError(active.value, prepared.value.action)
  if (actionError.value) { confirmation.value = false; return }
  const needsSale = isSaleAction(prepared.value.action, prepared.value.draft.keepOriginalItem)
  const sale = needsSale ? view.preparedSale : undefined
  if (needsSale && !sale) { confirmation.value = false; actionError.value = '请重新核对售后单信息'; return }
  actionError.value = sale ? submitReturnAndSale(active.value, prepared.value, sale).error : submitPreparedReturnAction(active.value, prepared.value)
  confirmation.value = false
  if (actionError.value) return
  closeAction()
  if (active.value.outcome === 'failed' || active.value.outcome === 'unknown') ElMessage.warning('请查看处理结果并按提示继续')
  else ElMessage.success(sale ? '已生成售后单，请刷新查看平台处理结果' : '已提交，请刷新数据查看处理结果')
}
function openReship() {
  if (view.reshipOpen) return
  closeAction()
  view.reshipOpen = true
  void nextTick(() => { if (operationPane.value) operationPane.value.scrollTop = 0 })
}
const confirmationTotal = computed(() => { const items = prepared.value?.draft.refundItems.filter(item => item.selected) || [], currency = items[0]?.currency; if (!currency) return '—'; let total = 0n; for (const item of items) { const value = parseMoney(item.value,currency); if (value === null || item.currency !== currency) return '—'; total += value }; return currency + ' ' + formatMinor(total,currency) })
const buyerPageActive = useBuyerPageActive()
</script>
<template>
<section class="return-workbench">
<header class="return-workbench-header"><div class="workbench-title"><h1>退货退款申请详情</h1></div><div class="return-detail-toolbar">
  <TicketSourceActions :source="{ kind: 'return', id: active.id, shopId: active.shopId, shopName: active.shopName, summary: active.title }" />
  <div v-prototype="annotation('detail-sync')" class="sync-actions detail-refresh"><ElTooltip content="获取当前退货申请的最新进度、退款信息及上次处理结果。刷新不会再次提交退货、退款、消息或介入请求。" placement="bottom" :trigger="['hover','focus']"><ElButton class="detail-refresh-action" :icon="Refresh" @click="syncOne">刷新数据</ElButton></ElTooltip></div></div></header>
<div v-if="active" v-prototype="annotation('detail')" class="return-detail">
<div class="return-reading" ref="readingPane">
        <header class="detail-heading"><div><div class="detail-id"><span>ReturnID</span><strong><CopyNumber :value="active.id" label="ReturnID" /></strong></div><p class="muted">{{ active.shopName }} · {{ active.site }} · <BuyerLink :shop-id="active.shopId" :buyer-id="active.buyerId" /></p></div><div class="detail-heading-status"><PlatformStatus :row="active" /></div></header>
        <div class="detail-meta"><span>处理人 {{ handlerNames(getReturnHandlerIds(active)) }}</span><span>{{ active.site }}</span><span>最近完整刷新 {{ time(active.lastSyncedAt, active) }}</span></div>
        <p v-if="internalHint(active)" class="business-hint" role="status">{{ internalHint(active) }}</p>
        <section v-if="active.submissionError" v-prototype="annotation('execution')" class="execution-panel"><ElAlert :title="active.outcome === 'unknown' ? '处理结果待核实' : '上次处理未成功'" :description="active.submissionError" :type="active.outcome === 'unknown' ? 'warning' : 'error'" :closable="false" show-icon /></section><ReturnData :row="active" area="status" />
        <div class="detail-workspace">
          <main class="detail-main">
            <ReturnData :row="active" area="application"><template #order-context><section v-prototype="annotation('order-context')" class="order-context application-order-context"><h4>关联订单</h4><dl class="detail-grid"><dt>OMS订单号</dt><dd><CopyNumber :value="active.systemOrderNo" label="OMS订单号"><button v-if="linkedOrder" type="button" class="link-button" @click="openOrder(active)">{{ active.systemOrderNo }}</button><span v-else>{{ active.systemOrderNo || '—' }}</span></CopyNumber></dd><dt>平台订单号</dt><dd><CopyNumber :value="active.orderNo" label="平台订单号" /></dd><dt>平台订单状态</dt><dd>{{ orderState(active) }}</dd><dt>OMS订单状态</dt><dd>{{ active.omsStatus || '—' }}</dd><dt>订单金额</dt><dd>{{ orderAmount }}</dd><dt>实际出库数量</dt><dd>{{ active.shipped === undefined || active.shipped === null ? '待核实' : active.shipped + ' 件' }}</dd></dl></section></template></ReturnData>
            <ReturnData :row="active" area="refund" />
            <ReturnItemData :row="active" :linked-item="linkedItem" />
            <section v-if="linkedOrder?.items.length" class="detail-panel order-products"><h3>订单商品</h3><ElTable :data="linkedOrder.items" border><ElTableColumn label="商品" prop="platformItemTitle" min-width="160" /><ElTableColumn label="平台 SKU" prop="platformSku" min-width="130" /><ElTableColumn label="系统 SKU" prop="systemSku" min-width="130" /><ElTableColumn label="订单数量" prop="orderedQuantity" width="85" /></ElTable></section>
            <section v-prototype="annotation('outbound')" class="detail-panel outbound-panel"><h3>原发货出库单</h3><ElTable v-if="active.outbounds?.length" :data="active.outbounds" row-key="no" border class="outbound-context-table"><ElTableColumn label="三方仓出库单号" min-width="175"><template #default="{ row }"><CopyNumber :value="row.externalNo" label="三方仓出库单号"><button v-if="row.externalNo && linkedOutbounds.has(row.outboundId)" type="button" class="link-button" @click="openOutbound(active, row as CancelOutboundContext)">{{ row.externalNo }}</button><span v-else>{{ row.externalNo || '—' }}</span></CopyNumber><div class="muted">OMS出库单号<br /><CopyNumber :value="row.no" label="OMS出库单号"><button v-if="row.no && linkedOutbounds.has(row.outboundId)" type="button" class="link-button" @click="openOutbound(active, row as CancelOutboundContext)">{{ row.no }}</button><span v-else>{{ row.no || '—' }}</span></CopyNumber></div></template></ElTableColumn><ElTableColumn label="发货仓库 / 账号" min-width="135"><template #default="{ row }"><div>{{ row.warehouse || '—' }}</div><div class="muted">{{ row.account || '—' }}</div></template></ElTableColumn><ElTableColumn label="物流渠道" min-width="125"><template #default="{ row }"><div>{{ row.channel || '—' }}</div><div class="muted">{{ row.channelCode || '—' }}</div></template></ElTableColumn><ElTableColumn label="出库状态" min-width="95"><template #default="{ row }"><ElTag size="small" :type="row.status === '已出库' ? 'success' : row.status === '已取消' ? 'info' : 'warning'">{{ row.status || '—' }}</ElTag></template></ElTableColumn><ElTableColumn label="原发货跟踪号 / 时间" min-width="170"><template #default="{ row }"><CopyNumber :value="row.tracking" label="原发货跟踪号" /><div class="muted">{{ time(row.shippedAt, active) }}</div></template></ElTableColumn></ElTable><div v-else class="empty-inline">{{ active.outbounds ? '暂无关联三方仓出库单' : '三方仓出库单关联信息待核实' }}</div></section>
            <ReturnData :row="active" area="shipping" />
            <section v-if="isEscalated(active)" v-prototype="annotation('escalation')" class="detail-panel case-panel"><h3>关联纠纷</h3><dl class="detail-grid"><dt>纠纷编号</dt><dd><CopyNumber :value="active.caseId" label="纠纷编号"><ElButton v-if="linkedCase" link type="primary" @click="router.push(disputeLocation(linkedCase.shopId, linkedCase.kind, linkedCase.id))">{{ linkedCase.id }}</ElButton><span v-else>{{ active.caseId || '关联编号待刷新' }}</span></CopyNumber></dd><dt>纠纷处理</dt><dd>{{ active.caseStatus || '待刷新' }}</dd><dt>原申请状态</dt><dd>{{ stateNames[active.state] || '状态待核实' }}</dd><dt>原申请编号</dt><dd><CopyNumber :value="active.id" label="原申请编号" /></dd></dl><p v-if="activeDetail?.caseDecision" class="case-decision">{{ activeDetail.caseDecision }}</p><p class="muted">{{ activeDetail?.caseClosed ? '关联案件已结束，退货申请记录继续保留。' : '案件处理与退货记录分别跟进。' }}</p></section>
          </main>
          <aside class="detail-aside">
        <section v-prototype="annotation('history')" class="detail-panel return-history-panel"><h3>处理过程</h3><div v-for="(entry,index) in active.history" :key="index" class="history-entry" :class="{ seller: entry.author === '卖家' }"><header><strong>{{ ({ BUYER: '买家', SELLER: '卖家', EBAY: 'eBay', SYSTEM: '平台系统' } as Record<string,string>)[entry.author] || entry.author }}</strong><time>{{ time(entry.at, active) }}</time></header><p v-if="entry.activity" class="activity-kind">{{ activityNames[entry.activity] || entry.activity }}</p><p v-if="entry.text">{{ activeDetail?.contentOnHold ? '平台已隐藏沟通内容' : entry.text }}</p><small v-if="entry.fromState || entry.toState">{{ entry.fromState ? stateNames[entry.fromState] || entry.fromState : '—' }} → {{ entry.toState ? stateNames[entry.toState] || entry.toState : '—' }}</small><ReturnHistoryAttributes :entry="entry" :content-on-hold="activeDetail?.contentOnHold" /></div><div v-if="!active.history.length" class="empty-inline">暂无处理过程</div></section>
            <ReturnData :row="active" area="aside" :order-address="orderAddress">
            <template #before-addresses>
              <section v-prototype="annotation('buyer-mail')" class="detail-panel buyer-mail-panel">
                <BuyerMail :key="returnKey(active)" :shop-id="active.shopId" :buyer-id="active.buyerId" :format-time="buyerMailTime"
                  :application="{ kind: 'return', applicationId: active.id, shopName: active.shopName, orderNo: active.orderNo, recipient: active.mailRecipient, systemSkus: getReturnSystemSkus(active) }" />
              </section>
            </template>
          </ReturnData>
          </aside>
        </div>
      </div>
<aside ref="operationPane" class="return-operation" aria-label="退货处理操作栏">
<section v-prototype="annotation('action')" class="operation-header">
  <h2>处理申请</h2>
  <div class="action-buttons">
    <template v-for="value in actionList" :key="value">
      <span v-if="value === 'reship'"><ElButton :type="view.reshipOpen ? 'primary' : 'default'" :aria-pressed="!!view.reshipOpen" @click="openReship">重发</ElButton></span>
      <ElTooltip v-else :content="blocked(active, value)" :disabled="!blocked(active, value)">
        <span><ElButton :type="selected(value) ? 'primary' : 'default'" :aria-pressed="selected(value)" :disabled="!!blocked(active, value)" @click="chooseAction(value)">{{ actionNames[value] }}</ElButton></span>
      </ElTooltip>
    </template>
  </div>
</section>
          <section v-if="action || view.reshipOpen || isEscalated(active) || closed(active) || !active.eligibilityKnown" ref="actionPanel" v-prototype="annotation('action-form')" class="detail-panel action-section">
            <ReshipForm v-if="view.reshipOpen" :row="active" @close="closeAction" @submitted="closeAction" />
            <p v-else-if="isEscalated(active) || closed(active) || !active.eligibilityKnown" class="muted">{{ isEscalated(active) ? '请结合关联纠纷最新结果继续处理。' : closed(active) ? '申请已关闭，可查看历史和添加内部备注。' : '申请资料待核实，请先刷新数据。' }}</p>
            <ReturnActionForm v-if="action && actionDraft" :row="active" :action="action" :draft="actionDraft" :error="actionError" @cancel="closeAction" @prepare="prepare">
              <template #after-sale><ReturnSaleFields v-if="requiresSale && view.saleDraft" :row="active" :draft="view.saleDraft" :kind="action === 'partial' ? '部分退款' : '退货'" :has-error="!!actionError" :refund-items="action === 'refund' ? actionDraft.refundItems : undefined" /></template>
            </ReturnActionForm>
          </section>
<p v-if="!action && !view.reshipOpen && !isEscalated(active) && !closed(active) && active.eligibilityKnown" class="operation-empty">选择上方操作，核对资料后办理。</p>
<section v-prototype="annotation('after-sale-links')" class="linked-sales"><header><h3>关联售后单</h3><span class="sale-count">{{ saleTotals.count }} 笔</span></header>
  <div v-for="sale in linkedSales" :key="sale.no" class="sale-link">
    <button type="button" class="link-button" @click="openSale(sale.no)">{{ sale.no }}</button>
    <span>{{ sale.kind }}</span><span>{{ sale.approval || sale.executionResult }}</span>
  </div>
  <div v-if="saleTotals.actualAmounts.length || saleTotals.hasUnverifiedRefund || hasReturnSale" class="sale-totals">
    <div v-if="saleTotals.actualAmounts.length">累计实退 <b v-for="amount in saleTotals.actualAmounts" :key="amount.currency">{{ amount.currency }} {{ amount.value }}</b></div>
    <div v-if="saleTotals.hasUnverifiedRefund">含尚无实退金额的记录</div>
    <div v-if="saleTotals.approvedReturnQty != null">批准寄回 <b>{{ saleTotals.approvedReturnQty }} 件</b></div>
    <div v-if="hasReturnSale">实收入库
      <b v-if="saleTotals.receivedQty != null">{{ saleTotals.receivedQty }} 件{{ saleTotals.hasUnverifiedReceipt ? '，另有待核实' : '' }}</b>
      <b v-else>{{ saleTotals.hasUnverifiedReceipt ? '待核实' : '无需寄回' }}</b>
    </div>
  </div>
  <p v-if="!linkedSales.length" class="muted">暂无关联售后单</p>
</section>
<section v-prototype="annotation('notes')" class="detail-panel internal-notes-panel"><h3>内部备注</h3><div class="note-form"><ElInput v-model="note" type="textarea" :rows="3" placeholder="添加内部跟进记录，不发送给买家" :maxlength="500" show-word-limit aria-label="退货退款内部备注" /><div class="note-actions"><ElButton @click="saveNote">添加备注</ElButton></div></div><div v-for="(entry,index) in orderedNotes" :key="index" class="note-entry"><p>{{ entry.text }}</p><small>操作人：{{ entry.author?.trim() || '未记录' }} · 时间：{{ noteTime(entry.at) }}</small></div></section>
<section v-prototype="annotation('logs')" class="detail-panel operation-logs-panel"><OperationLogs :key="returnKey(active)" class="internal-records" :entries="returnOperationEntries(active)" :format-time="buyerMailTime" /></section>
</aside>
</div>
    <ElDialog :model-value="buyerPageActive && confirmation" @update:model-value="value => { if (buyerPageActive) confirmation = value }" :title="action ? `确认${actionNames[action]}` : '确认操作'" width="500px" append-to-body :destroy-on-close="buyerPageActive">
      <div v-if="active && prepared" class="return-confirm"><p>退货申请：<strong>{{ active.id }}</strong></p><p>店铺：{{ active.shopName }} · 买家：<BuyerLink :shop-id="active.shopId" :buyer-id="active.buyerId" /></p><p>操作：<strong>{{ actionNames[prepared.action] }}</strong></p>
        <p v-if="prepared.action === 'partial'">报价金额：<strong>{{ active.currency }} {{ prepared.draft.partialAmount }}</strong>，需等待买家决定。</p>
        <template v-if="prepared.action === 'refund'"><div v-for="item in prepared.draft.refundItems.filter(item => item.selected)" :key="item.refundFeeType" class="confirm-refund-item"><span>{{ activeDetail?.refund.items.find(line => line.refundFeeType === item.refundFeeType)?.label || item.refundFeeType }}</span><strong>{{ item.currency }} {{ item.value }}</strong></div><p>本次退款合计：<strong>{{ confirmationTotal }}</strong></p></template>
        <p v-if="['approve','offerReturn'].includes(prepared.action)">商品安排：{{ prepared.draft.keepOriginalItem ? '允许买家保留，无需寄回' : '按退货安排寄回' }}</p><p v-if="prepared.request.body.RMANumber">退货授权编号：{{ prepared.draft.rmaNumber }}</p>
        <p v-if="prepared.action === 'escalate'">介入原因：{{ escalationReasons.find(item => item.value === prepared!.draft.reason)?.label }}</p>
        <template v-if="prepared.action === 'label'"><p>面单处理：{{ { UPLOAD_LABEL: '提供已上传的面单', MARK_AS_SENT: '面单已通过其他方式提供', NO_LABEL: '不提供面单，说明退回安排' }[prepared.draft.label.labelAction] }}</p><p v-if="prepared.draft.label.labelAction === 'UPLOAD_LABEL' && prepared.draft.label.fileId">文件：{{ activeDetail?.files.find(file => file.fileId === prepared!.draft.label.fileId)?.fileName }}</p><p v-if="prepared.draft.label.labelAction !== 'NO_LABEL' && prepared.draft.label.trackingNumber">{{ prepared.draft.label.carrierEnum }} · {{ prepared.draft.label.trackingNumber }}</p><p v-if="prepared.draft.label.labelAction === 'MARK_AS_SENT' && prepared.draft.label.labelSentDate">发送时间：{{ time(prepared.draft.label.labelSentDate, active) }}</p><p v-if="prepared.draft.label.labelAction === 'NO_LABEL' && prepared.draft.label.noLabelReason">原因：{{ noLabelReasons.find(item => item.value === prepared!.draft.label.noLabelReason)?.label }}</p><p v-if="prepared.draft.label.returnLabelCost">面单费用：{{ active.currency }} {{ prepared.draft.label.returnLabelCost }}</p></template>
        <section v-if="view.preparedSale" class="sale-summary"><strong>同时创建售后单 · 无需审核</strong><p>{{ view.preparedSale.kind }} · {{ view.preparedSale.items[0]?.title }} × {{ view.preparedSale.items[0]?.quantity }}</p><p>系统原因：{{ view.preparedSale.items[0]?.reason }}</p><p v-if="view.preparedSale.note">售后单备注：{{ view.preparedSale.note }}</p></section>
        <p v-if="prepared.draft.text" class="confirm-message">{{ prepared.draft.text }}</p><ElAlert title="请核对本次提交内容。资格或来源金额变化后须重新确认；退款以平台资金结果为准。" type="info" :closable="false" />
      </div>
      <template #footer><ElButton @click="confirmation = false">返回修改</ElButton><ElButton type="primary" @click="submit">确认提交</ElButton></template>
    </ElDialog>
</section>
</template>
<style scoped>
.sale-count{font-size:11px;line-height:19px;padding:0 7px;border-radius:3px;background:#f2f5f9;color:#63748a}
.sale-totals{display:flex;flex-wrap:wrap;gap:5px 16px;font-size:11px;line-height:1.7;margin-top:9px;padding-top:8px;border-top:1px solid #edf0f4;color:#738090}
.sale-totals b{margin-left:4px;color:#3e5065;font-weight:500}
.linked-sales,.sale-summary{min-width:0;border:1px solid #e1e6ec;background:#fff;border-radius:4px;padding:12px;margin:16px 0}.linked-sales header{display:flex;align-items:center;justify-content:space-between}.linked-sales h3{font-size:13px;color:var(--yy-text-heading);margin:0}.linked-sales p,.sale-summary p{margin:6px 0;font-size:12px}.sale-link{display:flex;flex-wrap:wrap;align-items:center;gap:10px;font-size:12px;margin-top:10px}.sale-link .link-button{border:0;background:transparent;cursor:pointer;padding:0;line-height:1.6}.sale-link span{color:#737c89}.linked-sales :deep(.reship-form){margin-top:12px}
.application-order-context{margin-top:16px;padding-top:14px;border-top:1px solid #ebeef5;font-size:12px}
.application-order-context h4{margin:0 0 12px;color:var(--yy-text-heading);font-size:12px}
.detail-main>.order-products{margin-top:0}
@container return-application (min-width:600px){.return-reading .application-order-context .detail-grid{grid-template-columns:100px minmax(0,1fr) 100px minmax(0,1fr)}}
</style>
<style scoped>
.filter-actions{display:flex;gap:10px;flex:none}
.execution-panel{margin-bottom:16px}.returns-page{display:flex;flex-direction:column;min-width:0;height:100%;background:#fff;padding:16px 18px 0;color:#303a49;font-size:13px;box-sizing:border-box}.returns-filters{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding-bottom:16px}.returns-filters :deep(.el-button){margin:0;height:32px;font-size:12px}.date-filter{display:flex;align-items:center;gap:8px;white-space:nowrap;font-size:12px;color:#637085}.returns-toolbar{display:flex;align-items:center;justify-content:space-between;gap:14px;border-bottom:1px solid #e5eaf0;min-height:48px}.returns-toolbar>.el-button{flex:none}.queue-tabs{display:flex;gap:23px;align-items:center;overflow-x:auto;min-width:0}.queue-tabs button,.detail-tabs button{background:none;border:0;border-bottom:2px solid transparent;white-space:nowrap;padding:15px 0 13px;cursor:pointer;color:#5d6978;font-size:13px}.queue-tabs button.active,.detail-tabs button.active{color:#2673d9;border-bottom-color:#2673d9;font-weight:600}.queue-tabs button span{font-size:11px;padding:1px 6px;border-radius:8px;background:#f0f3f7;margin-left:5px;font-weight:400}.queue-tabs button.active span{background:#edf4ff}.returns-table-wrap{margin-top:14px;flex:1;min-height:0;overflow:auto}.returns-table{font-size:12px;width:100%}.returns-table :deep(.el-table__cell){padding:12px 0}.returns-table :deep(.cell){line-height:1.85}.returns-table :deep(th .cell){line-height:1.6}.muted{color:#7a8797;font-size:12px;line-height:1.8}.link-button{padding:0;border:0;background:none;color:#2877cb;cursor:pointer;font:inherit}.product-title{font-weight:500;color:var(--yy-text-heading)}.quantity{margin-left:8px}.case-id{font-size:11px;color:#ac5844}.pending-label,.overdue{color:#b86c18;font-size:12px}.overdue{color:#c24f40}.returns-pagination{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:14px 0;flex-wrap:wrap;color:#7a8797;font-size:12px}.returns-pagination :deep(.el-pagination){--el-pagination-button-height:28px;--el-pagination-font-size:12px}.inline-error{color:#c04d3e;margin:4px 0;width:100%;font-size:12px}.return-detail{font-size:13px;color:#354154}.detail-heading{display:flex;align-items:center;gap:16px}.detail-heading>div{flex:1;min-width:0}.detail-heading h2{font-size:19px;margin:0 0 7px;color:var(--yy-text-heading)}.status-notice{background:#eff5ff;color:#356eaf;border:1px solid #dce9fa;margin-top:16px;padding:11px 14px;border-radius:4px}.status-notice.uncertain{color:#a46922;background:#fff9ed;border-color:#f1dfba}.detail-tabs{display:flex;gap:30px;border-bottom:1px solid #e6ebf1;margin:10px 0 20px}.detail-section{margin-bottom:24px}.detail-section h3,.case-panel h3{color:var(--yy-text-heading);font-size:14px;margin:0 0 15px}.product-card{display:flex;align-items:center;gap:15px;padding:14px;background:#f7f9fb;border:1px solid #e7ecf1;border-radius:5px}.product-mark{display:grid;place-items:center;width:58px;height:58px;background:#e7eef6;color:#71859d;border-radius:5px;font-size:12px;flex:none}.product-card p{margin:5px 0 0;font-size:12px}.detail-grid{display:grid;grid-template-columns:1fr 1fr;gap:18px 30px;margin:20px 0}.detail-grid>div{display:grid;grid-template-columns:140px 1fr;gap:12px;min-width:0}.detail-grid dt{color:#798698}.detail-grid dd{margin:0;overflow-wrap:anywhere}.case-panel{background:#fff7f1;border:1px solid #f0dccc;border-radius:5px;padding:16px;margin-bottom:24px}.case-panel .detail-grid{margin:0}.case-panel p{font-size:12px;color:#9b7258;margin:14px 0 0}.action-buttons{display:flex;gap:8px;flex-wrap:wrap}.action-buttons .el-button{margin:0;font-size:12px}.action-form{margin-top:16px;background:#f8fafc;border:1px solid #e3e9f1;padding:17px;border-radius:5px}.action-form h4{margin:0 0 12px;font-size:14px;color:var(--yy-text-heading)}.action-form p{margin-top:0}.form-row{display:flex;align-items:center;gap:12px;margin-bottom:15px;flex-wrap:wrap}.form-row label{min-width:90px}.form-row>.el-select{width:300px}.form-row>span{font-size:12px;color:#768498}.form-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:16px}.note-form{display:flex;gap:10px}.note-entry{padding:10px 12px;margin-bottom:10px;border-left:3px solid #d5e1ed;background:#fafbfd}.note-entry p{margin:0 0 5px;white-space:pre-wrap;overflow-wrap:anywhere}.note-entry small{color:#8793a3}.history-entry{margin-bottom:16px;padding:15px;background:#f4f7fa;border-radius:5px}.history-entry.seller{background:#edf5ff}.history-entry header{display:flex;justify-content:space-between;gap:12px;font-size:12px;color:#7a8797}.history-entry p{white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.8;margin:10px 0 0}.log-entry{border-bottom:1px solid #eef1f5;padding:13px 0}.log-entry span{font-size:12px;color:#8490a0}.log-entry p{margin:6px 0 0;line-height:1.7}.return-confirm{font-size:13px;line-height:1.8;overflow-wrap:anywhere}.confirm-message{background:#f7f9fb;padding:12px;white-space:pre-wrap;max-height:200px;overflow:auto}@media(max-width:1400px){.queue-tabs{gap:15px}.returns-page{padding:12px 14px 0}.detail-grid>div{grid-template-columns:120px 1fr}}@media(max-width:900px){.detail-grid{grid-template-columns:1fr}.detail-heading{flex-wrap:wrap}.queue-tabs{gap:12px}}

.returns-page{padding:14px 16px 0;color:#303133}.returns-filters{gap:8px;padding-bottom:13px}.field-label{color:#606266;font-size:12px;margin-left:3px}.returns-toolbar{border:0;padding:12px 0;min-height:32px}.queue-tabs{border-bottom:1px solid #e6e8eb;min-height:43px;align-items:stretch;gap:23px}.queue-tabs button{padding:10px 2px}.queue-tabs button.active{color:#1677ff;border-color:#1677ff}.returns-table-wrap{margin-top:0}.muted{color:#909399}.link-button{color:#1677ff;text-align:left;word-break:break-all}.sync-actions{display:flex;gap:5px;align-items:center}.sync-help{border:0;background:none;color:#909399;cursor:help;padding:6px;display:flex;align-items:center}.sync-help:focus-visible{outline:2px solid #1677ff;outline-offset:2px;border-radius:3px}.time-header{display:flex;align-items:center;gap:5px}.time-header .el-icon{color:#909399}
:global(.return-drawer .el-drawer__header){margin-bottom:10px;padding:18px 22px 0}:global(.return-drawer .el-drawer__title){font-size:22px;line-height:30px;font-weight:600;color:var(--yy-text-heading,#151515)}:global(.return-drawer .el-drawer__body){padding:0 22px 20px}.return-drawer-header{display:flex;align-items:center;justify-content:space-between;gap:16px;min-width:0;flex:1}.return-drawer-header h2{margin:0;min-width:0}.detail-refresh{flex:none}.detail-refresh :deep(.el-button){height:32px;font-size:12px}.detail-heading{justify-content:space-between;gap:14px}.detail-heading>div:first-child{min-width:0}.detail-heading>.detail-heading-status{flex:none;text-align:right}.detail-heading p{margin:3px 0 0;line-height:18px}.detail-id{display:flex;align-items:center;gap:8px;line-height:28px;flex-wrap:wrap}.detail-id>span{font-size:12px;color:#909399}.detail-id strong{font-size:20px;color:var(--yy-text-heading,#151515)}.detail-heading-status :deep(.el-tag){height:32px;padding:0 13px;font-size:15px;font-weight:600}.detail-heading-status :deep(.el-tag--primary){--el-tag-bg-color:#eaf3ff;--el-tag-border-color:#a8ccff;--el-tag-text-color:#155fce}.detail-heading-status>.muted{margin-top:4px}.detail-meta{display:flex;align-items:center;gap:14px;flex-wrap:wrap;margin:7px 0 13px;color:#909399;font-size:11px}.business-hint{background:#fff8e9;color:#986618;padding:11px 14px;line-height:1.7;font-size:12px;border-radius:4px;margin:0 0 14px}
.detail-workspace{display:grid;grid-template-columns:minmax(0,1.75fr) minmax(300px,1fr);gap:20px;align-items:start}.detail-main,.detail-aside{min-width:0}.detail-panel{border:1px solid #e8ebef;border-radius:5px;padding:16px;margin-bottom:16px;min-width:0}.detail-panel h3{color:var(--yy-text-heading,#151515);font-size:14px;margin:0 0 17px}.detail-grid{grid-template-columns:106px minmax(0,1fr) 106px minmax(0,1fr);gap:17px 10px;font-size:12px;margin:0}.detail-grid dt{color:#909399;line-height:1.7}.detail-grid dd{line-height:1.7}.product-card>div{min-width:0;overflow-wrap:anywhere}.order-products{margin-top:18px}.order-products h4{margin:0 0 12px;font-size:12px;color:var(--yy-text-heading,#151515)}.detail-panel :deep(.el-table__cell){font-size:12px}.detail-panel :deep(th.el-table__cell){background:#f6f7f9;color:var(--yy-text-heading,#151515)}.outbound-context-table{width:100%;font-size:12px}.outbound-context-table :deep(.cell){overflow-wrap:anywhere}.outbound-context-table :deep(.number-copy){width:100%}.empty-inline{padding:20px 12px;text-align:center;color:#909399;font-size:12px;background:#fafbfc;border-radius:4px}.case-panel{background:#fffaf6;border-color:#f0dccc}.case-panel>p:last-child{margin-bottom:0}.action-section>p{margin:12px 0 0}.note-form{display:block}.note-actions{display:flex;justify-content:flex-end;margin-top:10px}.note-entry{background:none;border:0;border-bottom:1px solid #ebeef5;padding:12px 0;margin:0}.history-entry{padding:13px 15px;margin-bottom:12px;border:1px solid #e6ecf2;background:#f8fafc}.history-entry:last-child{margin-bottom:0}.history-entry header{font-size:11px;flex-wrap:wrap}.history-entry header strong{font-size:12px;color:var(--yy-text-heading,#151515)}.history-entry p{font-size:12px;line-height:1.8;margin:9px 0 0}.internal-records{margin-top:18px;border-top:1px solid #ebeef5;padding-top:14px}.internal-records summary{font-size:12px;color:#606266;cursor:pointer}.log-entry time{font-size:11px;color:#909399}.log-entry p{font-size:12px;overflow-wrap:anywhere;white-space:pre-wrap}.drawer-footer{display:flex;justify-content:space-between;align-items:center;gap:14px}.footer-actions{min-width:0}.drawer-footer>.el-button{flex:none}
@media(max-width:1350px){.returns-page{padding:12px}.returns-filters{gap:7px}:global(.return-drawer .el-drawer__header){padding:16px 18px 0}:global(.return-drawer .el-drawer__body){padding:0 18px 18px}.detail-workspace{grid-template-columns:minmax(0,1.6fr) minmax(300px,1fr);gap:14px}.detail-panel{padding:14px}.detail-grid{grid-template-columns:98px minmax(0,1fr) 98px minmax(0,1fr);gap:14px 8px}}
@media(max-width:1050px){.detail-workspace{grid-template-columns:minmax(0,1fr)}}
@media(max-width:700px){.detail-grid{grid-template-columns:95px minmax(0,1fr)}.detail-heading{flex-wrap:wrap}.detail-heading>.detail-heading-status{text-align:left}}

.refresh-result{color:#909399;font-size:12px;line-height:1.6;flex:1}.returns-toolbar{gap:12px}.confirm-refund-item{display:flex;justify-content:space-between;padding:7px 0;gap:12px;border-bottom:1px solid #ebeef5}.activity-kind{font-size:11px!important;color:#6b7d92}.footer-actions .action-buttons{row-gap:8px}.case-decision{line-height:1.8}.action-section :deep(.action-form){margin-top:0}

.return-workbench{display:flex;flex-direction:column;height:100%;min-height:0;min-width:0;overflow:hidden;background:#f5f7fa}
.return-workbench-header{display:flex;flex-shrink:0;align-items:center;justify-content:space-between;padding:12px 18px;gap:12px;background:#fff;border-bottom:1px solid #e6e8eb}.workbench-title,.return-detail-toolbar{display:flex;align-items:center;gap:12px;min-width:0}.workbench-title h1{font-size:17px;color:var(--yy-text-heading);margin:0;white-space:nowrap}
.return-workbench .return-detail{display:grid;grid-template-columns:minmax(0,1fr) 460px;flex:1;min-height:0;min-width:0;overflow:hidden}
.return-reading{overflow:auto;min-width:0;min-height:0;padding:20px;background:#fff;overscroll-behavior:contain;scrollbar-gutter:stable}.return-operation{overflow:auto;min-width:0;min-height:0;padding:18px;border-left:1px solid #e2e6ec;background:#fbfcfe;overscroll-behavior:contain;scrollbar-gutter:stable}
.operation-header{margin-bottom:18px}.operation-header h2{font-size:16px;color:var(--yy-text-heading);margin:0 0 16px}.operation-header .action-buttons{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}.operation-header .action-buttons>span{display:block;min-width:0}.operation-header .el-button{width:100%;margin:0;padding:8px 10px;font-size:12px}.operation-empty{font-size:12px;line-height:1.8;color:#909399;padding:18px 12px;border:1px dashed #dce3ed;border-radius:4px}
.return-operation .action-section{border:0;padding:0;margin:0}.return-operation .action-section :deep(.action-form){padding:0;border:0;background:transparent;margin:0}.return-operation .action-section :deep(.form-row){display:block;margin-bottom:14px}.return-operation .action-section :deep(.form-row>label){display:block;margin-bottom:8px}.return-operation .action-section :deep(.el-select),.return-operation .action-section :deep(.el-input),.return-operation .action-section :deep(.el-textarea){max-width:100%}.return-operation .action-section :deep(.form-row>.el-select){width:100%}.return-operation .action-section :deep(.form-actions){flex-wrap:wrap}
.application-product-identities{display:grid;grid-template-columns:100px minmax(0,1fr);font-size:12px;gap:7px;margin:10px 0 0}.application-product-identities dt{color:#909399}.application-product-identities dd{margin:0;overflow-wrap:anywhere}
.return-reading .detail-workspace{grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}.return-reading .detail-grid{grid-template-columns:100px minmax(0,1fr);gap:12px 8px}.return-reading .product-card{padding:12px;gap:12px}.return-reading .detail-panel{padding:14px}.return-reading .product-mark{width:44px;height:44px}
@media(max-width:1050px){.return-reading .detail-workspace{grid-template-columns:minmax(0,1fr)}}
@media(max-width:1350px){.return-reading{padding:16px}.return-operation{padding:16px}.return-reading .detail-grid{grid-template-columns:100px minmax(0,1fr)}}
@media(max-width:900px){.return-workbench .return-detail{grid-template-columns:minmax(250px,1fr) 350px}.return-workbench-header{padding:10px}.workbench-title h1{font-size:15px}.return-reading{padding:12px}.return-operation{padding:14px}.return-detail-toolbar{gap:5px}}


.return-operation .internal-notes-panel{margin-top:24px;background:#fff}.detail-aside>.return-history-panel{margin-top:0}.detail-aside>.return-history-panel .history-entry:last-child{margin-bottom:0}
.detail-aside>.return-history-panel .history-entry time,.return-operation .internal-notes-panel .note-entry small,.return-operation .internal-notes-panel .log-entry time{font-size:12px;line-height:1.6}
.refresh-button-group{gap:0;height:32px;box-sizing:border-box;border:1px solid var(--el-border-color,#dcdfe6);border-radius:4px;background:#fff}.refresh-button-group:focus-within{border-color:var(--el-color-primary,#409eff)}.refresh-button-group .detail-refresh-action{height:30px;border:0;border-radius:3px 0 0 3px;background:transparent;padding:0 6px 0 12px}.refresh-button-group .sync-help{width:28px;height:30px;padding:0;justify-content:center;border-radius:0 3px 3px 0}.refresh-button-group .sync-help:hover{color:var(--el-color-primary,#409eff)}.refresh-button-group .sync-help:focus-visible{outline-offset:-4px}
</style>
