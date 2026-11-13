<script setup lang="ts">
import BuyerLink from '@/组件/买家/买家链接.vue'
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElButton, ElTable, ElTableColumn, ElTag } from 'element-plus'
import NumberCopy from '@/组件/单号复制.vue'
import ServiceLogs from '@/组件/客服日志/日志列表.vue'
import { 格式化北京时间 } from '../订单处理/时间展示工具'
import { 手工店铺选项 } from '../手工订单/模型'
import { resolveAfterSaleSource } from './来源关联'
import { refreshAfterSaleResult } from './来源与核查'
import { afterSaleResultPresentation, resolveAfterSaleReshipOrder } from './办理结果'
import { afterSaleDisplayItems } from './商品展示'
import { afterSaleFailureSummary } from './失败原因'
import { activeAfterSaleActor, afterSaleFacts, afterSaleReturnSummary, canApproveReship, recordsForReturn, type AfterSaleRecord } from './会话'
import ReviewDialog from './重发审核.vue'
import PlatformState from './平台售后状态.vue'
import ReturnShipping from './退回物流.vue'
import { afterSaleAnnotation as annotation } from './标注'

const props = defineProps<{ record: AfterSaleRecord }>()
const router = useRouter()
const confirming = ref(false)
const refreshing = ref(false)
const isReship = computed(() => props.record.kind === '重发')
const isReturn = computed(() => props.record.kind === '退货')
const isRefund = computed(() => props.record.kind === '全额退款' || props.record.kind === '部分退款')
const facts = computed(() => afterSaleFacts(props.record))
const resultPresentation = computed(() => afterSaleResultPresentation(props.record))
const displayItems = computed(() => afterSaleDisplayItems(props.record))
const failureSummary = computed(() => afterSaleFailureSummary(props.record))
const receipts = computed(() => {
  if (facts.value.receivedQty == null) return []
  return [...new Map(props.record.warehouseReceipts?.map(line => [JSON.stringify([line.warehouse, line.receiptNo, line.lineId]), line])).values()]
})
const permitted = computed(() => canApproveReship(props.record, activeAfterSaleActor.value))
const manual = computed(() => resolveAfterSaleReshipOrder(props.record))
const packages = computed(() => manual.value?.fulfillmentOrders.filter(parcel => parcel.isActive) ?? [])
const sourceResolution = computed(() => resolveAfterSaleSource(props.record))
const linkedReturn = computed(() => sourceResolution.value.row)
const readableReturn = computed(() => linkedReturn.value?.detail?.contentOnHold ? undefined : linkedReturn.value)
const pendingRefund = computed(() => {
  const row = readableReturn.value
  return row?.pendingAction === 'refund' && ['pending', 'unknown'].includes(row.outcome) ? row : undefined
})
const related = computed(() => recordsForReturn(props.record.shopId, props.record.returnId).sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.no.localeCompare(b.no)))
const summary = computed(() => afterSaleReturnSummary(props.record.shopId, props.record.returnId))
const dispatchStore = computed(() => 手工店铺选项.value.find(store => store.storeId === props.record.reshipDraft?.storeId)?.storeName)
const address = computed(() => {
  const value = props.record.reshipDraft?.address
  return value && [value.countryCode, value.stateProvince, value.city, value.district, value.addressLine1, value.addressLine2, value.postalCode].filter(Boolean).join(' · ')
})
const amount = (value: AfterSaleRecord['amount'] | null) => value ? value.value + ' ' + value.currency : '—'
function source() {
  void router.push({ name: 'oms-ebay-return-detail', params: { shopId: props.record.shopId, returnId: props.record.returnId } })
}
function openOrder() {
  if (manual.value) void router.push({ name: 'oms-order-processing', query: { systemOrderNo: manual.value.systemOrderNo } })
}
function openOriginal() {
  if (props.record.systemOrderNo) void router.push({ name: 'oms-all-order-detail', params: { systemOrderNo: props.record.systemOrderNo } })
}
function openRelated(no: string) {
  void router.push({ path: router.currentRoute.value.path, query: { ...router.currentRoute.value.query, documentNo: no } })
}
async function refreshResult() {
  if (refreshing.value) return
  refreshing.value = true
  try { await refreshAfterSaleResult(props.record) }
  finally { refreshing.value = false }
}
watch(() => [props.record.no, activeAfterSaleActor.value.id], () => { confirming.value = false })
watch(permitted, value => { if (!value) confirming.value = false }, { flush: 'sync' })
</script>

<template>
  <article class="after-detail">
    <div v-prototype="annotation('detail')" class="identity">
      <div>
        <div class="eyebrow">售后单号</div><div v-if="readableReturn" class="sub">买家 <BuyerLink :shop-id="record.shopId" :buyer-id="readableReturn.buyerId" /></div>
        <NumberCopy :value="record.no" label="售后单号"><strong class="document-no">{{ record.no }}</strong></NumberCopy>
      </div>
      <div class="identity-status"><strong>{{ record.kind }}</strong><ElTag v-if="record.approval" :type="record.approval === '待审核' ? 'warning' : 'success'" size="small">{{ record.approval }}</ElTag><span v-else>无需审核</span>
        <ElButton v-if="isReship && record.approval === '待审核'" type="primary" size="small" :disabled="!permitted" @click="confirming = true">审核重发</ElButton>
      </div>
    </div>
    <section v-prototype="annotation('resultCheck')" class="result-check" aria-label="办理结果查询">
      <div class="check-heading"><ElButton size="small" :loading="refreshing" @click="refreshResult">刷新办理结果</ElButton><span>最近查询：{{ record.resultCheck ? 格式化北京时间(record.resultCheck.at) : '尚未查询' }}</span><span v-if="record.resultCheck">{{ record.resultCheck.operator }}</span></div>
      <p v-if="record.resultCheck" :class="{ 'check-warning': record.resultCheck.status !== 'success' }" role="status">{{ record.resultCheck.message }}<span v-if="record.resultCheck.status !== 'success' && record.resultCheck.sourceSucceededAt"> 上次成功读取：{{ 格式化北京时间(record.resultCheck.sourceSucceededAt) }}</span></p>
      <p v-if="sourceResolution.issue" class="check-warning" role="status">{{ sourceResolution.issue }}</p>
    </section>
    <div v-prototype="annotation('result')" class="case-metrics">
      <div><span>平台售后状态</span><PlatformState :record="record" class="state-value" /></div>
      <div><span>本次批准退回</span><strong>{{ isReturn ? (facts.approvedReturnQty != null ? facts.approvedReturnQty + ' 件' : '待确认') : '不适用' }}</strong></div>
      <div><span>本次仓库实收</span><strong>{{ isReturn ? (facts.receivedQty != null ? facts.receivedQty + ' 件' : '未确认数量') : '不适用' }}</strong></div>
      <div><span>本次实际退款</span><strong>{{ isRefund ? (record.actualAmount ? amount(record.actualAmount) : '未确认金额') : '不适用' }}</strong></div>
    </div>
    <section v-if="related.length > 1" v-prototype="annotation('related')" class="detail-section case-history">
      <div class="section-heading"><h3>同申请处理记录 <span>{{ related.length }} 笔</span></h3><small>{{ record.returnId }}</small></div>
      <div class="totals">
        <span>累计批准退回 <b>{{ summary.approvedReturnQty != null ? summary.approvedReturnQty + ' 件' : '—' }}</b></span>
        <span>累计仓库实收 <b>{{ summary.receivedQty != null ? summary.receivedQty + ' 件' : '—' }}</b></span>
        <span>已确认实退合计 <b>{{ summary.actualAmounts.map(amount).join(' / ') || '—' }}</b></span>
        <small v-if="summary.hasUnverifiedRefund">仅合计已核实的实退金额</small>
        <small v-if="summary.hasUnverifiedReceipt">有实收数量待确认</small>
      </div>
      <ElTable :data="related" size="small" border>
        <ElTableColumn label="售后单号 / 办理时间" min-width="175"><template #default="{ row }">
          <strong v-if="row.no === record.no" class="current-no">{{ row.no }} <small>本单</small></strong>
          <button v-else class="link" @click="openRelated(row.no)">{{ row.no }}</button>
          <div class="row-time">{{ 格式化北京时间(row.createdAt) }}</div>
        </template></ElTableColumn>
        <ElTableColumn label="售后类型" prop="kind" width="85" />
        <ElTableColumn label="办理结果" min-width="125"><template #default="{ row }">{{ afterSaleResultPresentation(row as AfterSaleRecord).text }}<div v-if="afterSaleFailureSummary(row as AfterSaleRecord)" class="failure-summary">失败原因：{{ afterSaleFailureSummary(row as AfterSaleRecord) }}</div></template></ElTableColumn>
        <ElTableColumn label="本笔实退" min-width="98"><template #default="{ row }">{{ amount(row.actualAmount) }}</template></ElTableColumn>
      </ElTable>
    </section>
    <section class="detail-section">
      <h3>单据信息</h3>
      <dl class="facts">
        <dt>来源平台</dt><dd>{{ record.platform }}</dd>
        <dt>来源店铺</dt><dd>{{ record.shopName }}</dd>
        <dt>来源申请号</dt><dd><NumberCopy :value="record.returnId" label="来源申请号"><button class="link" @click="source">{{ record.returnId }}</button></NumberCopy></dd>
        <dt>平台订单号</dt><dd><NumberCopy :value="record.orderNo" label="平台订单号" /></dd>
        <dt>原系统订单号</dt><dd><NumberCopy v-if="record.systemOrderNo" :value="record.systemOrderNo" label="原系统订单号"><button class="link" @click="openOriginal">{{ record.systemOrderNo }}</button></NumberCopy><span v-else>—</span></dd>
        <dt>单据来源</dt><dd>{{ record.source }}</dd>
        <dt>创建人</dt><dd>{{ record.createdBy || '—' }}</dd>
        <dt>创建时间</dt><dd>{{ 格式化北京时间(record.createdAt) }}</dd>
        <dt>平台退货原因</dt><dd class="wide">{{ record.platformReason || '—' }}</dd>
        <dt>内部备注</dt><dd class="wide note">{{ record.note || '—' }}</dd>
      </dl>
    </section>
    <section class="detail-section">
      <h3>本次处理商品</h3>
      <ElTable :data="displayItems" size="small" border>
        <ElTableColumn label="商品名称 / 系统 SKU" min-width="205"><template #default="{ row }"><div>{{ row.title || '—' }}</div><small>{{ row.sku || '—' }}</small><div v-if="row.skuSourceNote" class="sku-source"><small>{{ row.skuSourceNote }}</small></div></template></ElTableColumn>
        <ElTableColumn label="本次数量" width="88" align="right" prop="quantity" />
        <ElTableColumn label="系统售后原因" min-width="135"><template #default="{ row }">{{ row.reason || '待补录' }}</template></ElTableColumn>
      </ElTable>
    </section>
    <ReturnShipping :row="linkedReturn" :issue="sourceResolution.issue" />
    <section v-if="isReship && record.approval === '已审核' && record.reshipDraft" class="detail-section">
      <h3>重发安排</h3>
      <dl class="facts">
        <dt>发货店铺</dt><dd>{{ dispatchStore || '—' }}</dd>
        <dt>发货仓库</dt><dd>{{ record.reshipRoute?.warehouse || '—' }}</dd>
        <dt>仓储服务商</dt><dd>{{ record.reshipRoute?.warehouseProvider || '—' }}</dd>
        <dt>仓库账号</dt><dd>{{ record.reshipRoute?.warehouseAccount || '—' }}</dd>
        <dt>物流渠道</dt><dd>{{ record.reshipRoute?.shippingChannel || '—' }}</dd>
        <dt>收件人</dt><dd>{{ record.reshipDraft.address.fullName || '—' }}</dd>
        <dt>收件地址</dt><dd class="wide">{{ address || '—' }}</dd>
      </dl>
    </section>
    <section v-if="isReship" v-prototype="annotation('approval')" class="detail-section">
      <div class="section-heading">
        <h3>重发审核</h3>
      </div>
      <dl class="facts">
        <dt>审核状态</dt><dd>{{ record.approval }}</dd>
        <template v-if="record.reviewedBy"><dt>审核人</dt><dd>{{ record.reviewedBy }}</dd></template>
        <template v-if="record.reviewedAt"><dt>审核时间</dt><dd>{{ 格式化北京时间(record.reviewedAt) }}</dd></template>
        <dt>申请累计实退</dt><dd>{{ amount(readableReturn?.detail?.refund.buyerActual) }}</dd>
        <template v-if="pendingRefund"><dt>未确认退款</dt><dd>{{ pendingRefund.pendingAmount === null ? '金额待核实' : pendingRefund.pendingAmount + ' ' + pendingRefund.currency }} · {{ pendingRefund.outcome === 'unknown' ? '结果待核实' : '处理中' }}</dd></template>
      </dl>
      <p v-if="record.approval === '待审核' && !permitted" class="attention">当前操作人没有此单的重发审核权限。</p>
    </section>
    <section class="detail-section">
      <h3>本次办理明细</h3>
      <dl class="facts">
        <dt>业务动作</dt><dd>{{ record.actionLabel || record.kind }}</dd>
        <dt>本次办理结果</dt><dd><ElTag :type="resultPresentation.tone" size="small">{{ resultPresentation.text }}</ElTag></dd>
        <template v-if="failureSummary"><dt>失败原因</dt><dd class="wide failure-summary">{{ failureSummary }}</dd></template>
        <template v-if="isRefund">
          <dt>{{ record.actionLabel?.includes('报价') ? '本次报价' : '拟退款金额' }}</dt><dd>{{ amount(record.amount) }}</dd>
          <dt>实际退款金额</dt><dd>{{ amount(record.actualAmount) }}</dd>
        </template>
        <template v-if="isReship">
          <dt>重发手工订单</dt><dd><NumberCopy v-if="record.manualOrderNo" :value="record.manualOrderNo" label="重发手工订单号"><button v-if="manual" class="link" @click="openOrder">{{ record.manualOrderNo }}</button><span v-else>{{ record.manualOrderNo }}</span></NumberCopy><span v-else>尚未创建</span></dd>
          <dt>OMS 处理状态</dt><dd>{{ manual?.processingStatus || '—' }}</dd>
        </template>
      </dl>
      <ElTable v-if="receipts.length" class="dispatch-table" :data="receipts" border size="small">
        <ElTableColumn prop="receiptNo" label="仓库实收凭证" min-width="145" />
        <ElTableColumn prop="warehouse" label="实收仓库" min-width="115" />
        <ElTableColumn prop="quantity" label="实收件数" width="95" align="right" />
      </ElTable>
      <ElTable v-if="packages.length" class="dispatch-table" :data="packages" border size="small">
        <ElTableColumn prop="fulfillmentOrderNo" label="履约单号" min-width="155" />
        <ElTableColumn label="包裹出库数量" width="115" align="right"><template #default="{ row }">{{ row.shippedQuantity ?? '—' }}</template></ElTableColumn>
        <ElTableColumn label="重发跟踪号" min-width="155"><template #default="{ row }"><NumberCopy :value="row.trackingNumber" label="重发跟踪号" /></template></ElTableColumn>
      </ElTable>
    </section>
    <section v-prototype="annotation('logs')" class="detail-section"><ServiceLogs :key="JSON.stringify([record.shopId, record.no])" :entries="record.logs || []" :format-time="格式化北京时间" /></section>
    <ReviewDialog v-if="confirming && permitted" :record="record" @close="confirming = false" />
  </article>
</template>

<style scoped>
.after-detail { display: grid; gap: 15px; min-width: 0; font-size: 13px; color: #374253; }
.identity, .identity-status, .section-heading { display: flex; align-items: center; gap: 9px; }
.identity, .section-heading { justify-content: space-between; }
.identity { flex-wrap: wrap; padding: 0 0 2px; }
.identity-status { font-size: 12px; color: #687587; }
.identity-status strong { font-size: 13px; color: var(--yy-text-heading); }
.eyebrow { color: #687587; font-size: 12px; line-height: 19px; }
.document-no { color: var(--yy-text-heading); font-size: 21px; font-variant-numeric: tabular-nums; }
.detail-section { padding: 16px; border: 1px solid #e4e9ee; border-radius: 5px; min-width: 0; }
.detail-section h3 { font-size: 14px; color: var(--yy-text-heading); line-height: 20px; margin: 0 0 13px; }
.section-heading { margin-bottom: 13px; }
.section-heading h3 { margin: 0; }
.facts { display: grid; grid-template-columns: 94px minmax(0, 1fr) 97px minmax(0, 1fr); align-items: baseline; gap: 10px 9px; margin: 0; font-size: 12px; line-height: 1.65; }
dt, small { color: #687587; }
dd { margin: 0; min-width: 0; overflow-wrap: anywhere; }
.wide { grid-column: span 3; }
.facts dt:has(+ .wide) { grid-column: 1; }
.case-metrics { display: grid; grid-template-columns: repeat(4,minmax(0,1fr)); gap: 1px; border: 1px solid #dce6f1; background: #dce6f1; border-radius: 5px; overflow: hidden; }
.case-metrics > div { display: flex; flex-direction: column; align-items: flex-start; gap: 4px; padding: 10px 12px; background: #f5f8fc; }
.case-metrics span,.row-time { font-size: 11px; color: #6d7888; }
.case-metrics strong { font-size: 13px; overflow-wrap: anywhere; }
.case-metrics .state-value { font-size: 13px; font-weight: 600; }
.case-metrics small { font-size: 11px; }
.case-history h3 span { background: #eef3f8; color: #547189; border-radius: 9px; padding: 2px 7px; font-size: 11px; font-weight: 500; }
.totals { display: flex; align-items: baseline; flex-wrap: wrap; gap: 5px 18px; margin-bottom: 9px; color: #697788; font-size: 12px; }
.totals b,.current-no { color: #39485a; font-weight: 550; }
.current-no small { font-size: 10px; color: #627c98; }
.note { white-space: pre-wrap; }
.link { font: inherit; text-align: left; padding: 0; border: 0; background: none; color: #176dc9; cursor: pointer; overflow-wrap: anywhere; }
.link:hover { text-decoration: underline; }
.detail-section :deep(.el-table) { font-size: 12px; }
.detail-section :deep(th.el-table__cell) { background: #f7f8fa; color: var(--yy-text-heading); }
.detail-section :deep(.cell) { line-height: 1.65; overflow-wrap: anywhere; }
.dispatch-table { margin-top: 12px; }
.attention { color: #935c11; background: #fff8e9; padding: 8px 12px; border-radius: 4px; font-size: 12px; margin: 12px 0 0; line-height: 1.7; }
.result-check { border: 1px solid #e4e9ee; border-radius: 5px; padding: 10px 12px; font-size: 12px; }
.check-heading { display: flex; align-items: center; flex-wrap: wrap; gap: 8px 12px; color: #687587; }
.result-check p { margin: 8px 0 0; line-height: 1.7; overflow-wrap: anywhere; }
.check-warning { color: #935c11; }
.failure-summary { color: #a34b3c; font-size: 12px; line-height: 1.65; overflow-wrap: anywhere; }
@media (max-width: 650px) { .facts { grid-template-columns: 92px minmax(0, 1fr); } .wide { grid-column: auto; } .case-metrics { grid-template-columns: repeat(2,minmax(0,1fr)); } }
</style>
