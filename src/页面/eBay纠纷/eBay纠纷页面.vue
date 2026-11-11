<script setup lang="ts">
import { currentHandlerId, handlerFilterOptions, handlerNames } from '@/组件/客服处理人/处理人'
import { getDisputeHandlerIds, refreshDisputeWithHandlers } from './处理人'
import BuyerLink from '@/组件/买家/买家链接.vue'
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElCheckbox, ElButton, ElEmpty, ElMessage, ElPagination, ElTable, ElTableColumn } from 'element-plus'
import { Refresh } from '@element-plus/icons-vue'
import MultiFilter from '@/组件/筛选/多选筛选.vue'
import FieldSearch from '@/组件/筛选/字段搜索.vue'
import CopyNumber from '@/组件/单号复制.vue'
import { 校验字段搜索, type 搜索字段 } from '@/组件/筛选/筛选工具'
import TicketSourceActions from '../工单管理/来源工单操作.vue'
import { disputeRecords, availableActions, dateText, isSellerOverdue, recordKey } from './模型'
import { kindLabels, type DisputeKind, type DisputeRecord } from './类型'
import { disputeKinds, caseSources, idLabels, disputeLocation, validKind, disputeTicketSource } from './导航'
import { views, emptyFilters, matchesFilters, needsSellerHubFollowup, workFilters } from './列表视图'
import { disputeAnnotations } from './标注'
import { nextPaymentEvidenceDeadline as nextEvidenceDate } from './支付争议证据'

const router = useRouter()
const route = useRoute()
const active = computed<DisputeKind>(() => validKind(route.query.issueType) ? route.query.issueType : 'INR_REQUEST')
const view = computed(() => views[active.value])
const typeRows = computed(() => disputeRecords.value.filter(row => row.kind === active.value))
const filtered = computed(() => typeRows.value.filter(row => matchesFilters(row, active.value, view.value.applied) && (!view.value.onlyMine || getDisputeHandlerIds(row).includes(currentHandlerId.value))))
const shown = computed(() => filtered.value.slice((view.value.page - 1) * view.value.size, view.value.page * view.value.size))
const searchFields = computed<搜索字段[]>(() => [
  { value: 'id', label: idLabels[active.value] }, { value: 'orderId', label: '平台订单号' },
  { value: 'buyer', label: '买家' }, { value: 'sku', label: '系统 SKU' },
])
const options = (pairs: [string, string][]) => [...new Map(pairs)].map(([value, label]) => ({ value, label }))
const shopOptions = computed(() => options(typeRows.value.map(row => [row.shopId, row.shopName])))
const statusOptions = computed(() => options(typeRows.value.map(row => [row.statusText, row.statusText])))
const workOptions = computed(() => workFilters.filter(item => item.value !== 'appeal' || active.value === 'EBAY_CASE'))
const sourceOptions = options(Object.entries(caseSources))
const searchError = ref('')
const amountLabels = { INR_REQUEST: '请求金额', EBAY_CASE: '案件金额', PAYMENT_DISPUTE: '争议金额' }
const counts = computed(() => {
  const totals = { INR_REQUEST: 0, EBAY_CASE: 0, PAYMENT_DISPUTE: 0 }
  for (const row of disputeRecords.value) totals[row.kind]++
  return totals
})
watch([() => filtered.value.length, () => view.value.size], ([count, size]) => {
  view.value.page = Math.min(view.value.page, Math.max(1, Math.ceil(count / size)))
})
watch([() => view.value.onlyMine, currentHandlerId], () => { view.value.page = 1 })
watch(active, () => { searchError.value = '' })
function setTab(kind: DisputeKind) {
  if (kind !== active.value) void router.replace({ name: 'oms-ebay-disputes', query: { issueType: kind } })
}
function search() {
  const draft = view.value.draft
  searchError.value = 校验字段搜索(draft.query, draft.mode) || ''
  if (searchError.value) return
  view.value.applied = { ...draft, handlers: [...draft.handlers], shops: [...draft.shops], statuses: [...draft.statuses], sources: [...draft.sources], work: [...draft.work] }
  view.value.page = 1
}
function reset() {
  view.value.onlyMine = false
  view.value.draft = emptyFilters()
  search()
}
function open(row: DisputeRecord) {
  void router.push(disputeLocation(row.shopId, row.kind, row.id))
}
function refresh() {
  const shops = view.value.applied.shops
  const targets = typeRows.value.filter(row => !shops.length || shops.includes(row.shopId))
  targets.forEach(row => refreshDisputeWithHandlers(row))
  ElMessage.success('已刷新 ' + targets.length + ' 条记录')
}
function statusTone(row: DisputeRecord) {
  if (row.owner === '已结束') return 'closed'
  if (row.pending || row.owner === '待核实') return 'pending'
  if (row.owner === '卖家') return 'attention'
  return 'waiting'
}
const money = (row: DisputeRecord) => row.amount?.value ? row.amount.currency + ' ' + row.amount.value : '—'
</script>

<template>
  <ElEmpty v-if="route.query.shopId !== undefined || route.query.caseId !== undefined" description="请核对原工单的店铺和 Case ID">
    <ElButton @click="router.replace({ name: 'oms-ebay-disputes' })">返回纠纷列表</ElButton>
  </ElEmpty>
  <section v-else class="disputes-page">
    <header class="type-bar">
      <nav v-prototype="disputeAnnotations.queues" class="issue-tabs" role="tablist" aria-label="Issue type">
        <button v-for="kind in disputeKinds" :key="kind" type="button" role="tab" :aria-selected="active === kind"
          :aria-label="kindLabels[kind]" :class="{ current: active === kind }" @click="setTab(kind)">
          {{ kindLabels[kind] }}<span class="count">{{ counts[kind] }}</span>
        </button>
      </nav>
      <ElButton :icon="Refresh" size="small" class="refresh" @click="refresh">刷新数据</ElButton>
    </header>
    <div v-prototype="disputeAnnotations.filters" class="filters">
      <ElCheckbox v-model="view.onlyMine">只看我的</ElCheckbox>
      <MultiFilter v-model="view.draft.handlers" :options="handlerFilterOptions" placeholder="处理人" :width="130" />
      <MultiFilter v-model="view.draft.shops" :options="shopOptions" placeholder="店铺" :width="148" />
      <MultiFilter v-model="view.draft.statuses" :options="statusOptions" placeholder="平台状态" :width="136" />
      <MultiFilter v-model="view.draft.work" :options="workOptions" placeholder="办理进度" :width="150" />
      <MultiFilter v-if="active === 'EBAY_CASE'" v-model="view.draft.sources" :options="sourceOptions" placeholder="案件来源" :width="144" />
      <FieldSearch v-model="view.draft.query" v-model:field="view.draft.field" v-model:mode="view.draft.mode"
        :fields="searchFields" :width="368" aria-prefix="eBay纠纷" @search="search" />
      <ElButton type="primary" @click="search">查询</ElButton>
      <ElButton @click="reset">重置</ElButton>
      <span v-if="searchError" role="alert">{{ searchError }}</span>
    </div>
    <div v-prototype="disputeAnnotations.list" class="dispute-table" role="tabpanel" :aria-label="kindLabels[active]">
      <ElTable :key="active" :data="shown" :row-key="recordKey" height="100%" size="small" border>
        <ElTableColumn :label="idLabels[active] + ' / 店铺'" min-width="158">
          <template #default="{ row }">
            <CopyNumber :value="row.id" :label="idLabels[active]"><button type="button" class="text-link record-id" @click="open(row as DisputeRecord)">{{ row.id }}</button></CopyNumber>
            <div class="secondary">{{ row.shopName }}</div>
          </template>
        </ElTableColumn>
        <ElTableColumn v-if="active === 'EBAY_CASE'" label="案件来源" min-width="110">
          <template #default="{ row }">{{ row.caseInfo ? caseSources[(row as DisputeRecord).caseInfo!.type] || '待核实' : '待核实' }}</template>
        </ElTableColumn>
        <ElTableColumn label="商品 / 订单" min-width="196">
          <template #default="{ row }"><div class="product">{{ row.title || (row.inquiry?.inquiryContentOnHold || row.caseInfo?.caseContentOnHold ? '部分商品资料受平台限制' : '商品资料待核实') }}</div><div class="secondary">{{ row.sku }} × {{ row.quantity ?? '—' }}</div>
            <div class="order-no">{{ row.orderId }}</div></template>
        </ElTableColumn>
        <ElTableColumn label="状态 / 当前进展" min-width="160">
          <template #default="{ row }"><span class="state-chip" :class="statusTone(row as DisputeRecord)">{{ row.statusText }}</span>
            <div v-if="row.progress !== row.statusText" class="secondary">{{ row.progress }}</div></template>
        </ElTableColumn>
        <ElTableColumn label="当前事项 / 时间" min-width="178">
          <template #default="{ row }"><div>{{ row.nextStep || '—' }}</div><small class="secondary">当前应办方：{{ row.owner }}</small>
            <div v-if="row.date" class="secondary" :class="{ overdue: isSellerOverdue(row as DisputeRecord) }">{{ row.date.label }} · {{ dateText(row.date.value) }}</div>
            <div v-else-if="row.payment?.waitEstimate" class="secondary">{{ row.payment.waitEstimate }}</div>
            <div v-if="active === 'PAYMENT_DISPUTE' && nextEvidenceDate(row as DisputeRecord) && !(row.date?.label === '补证截止' && row.date.value === nextEvidenceDate(row as DisputeRecord))" class="secondary">材料截止 · {{ dateText(nextEvidenceDate(row as DisputeRecord)) }}</div>
          </template>
        </ElTableColumn>
        <ElTableColumn label="买家 / 发起日期" min-width="126">
          <template #default="{ row }"><div><BuyerLink :shop-id="row.shopId" :buyer-id="row.buyer" /></div><div class="secondary">{{ dateText(row.createdAt).slice(0,10) }}</div></template>
        </ElTableColumn>
        <ElTableColumn :label="amountLabels[active]" min-width="90" align="right"><template #default="{ row }"><span class="amount">{{ money(row as DisputeRecord) }}</span></template></ElTableColumn>
        <ElTableColumn label="处理人" min-width="98"><template #default="{ row }">{{ handlerNames(getDisputeHandlerIds(row as DisputeRecord)) }}</template></ElTableColumn>
        <ElTableColumn label="操作" width="100" fixed="right">
          <template #default="{ row }"><div class="row-actions"><ElButton type="primary" link @click="open(row as DisputeRecord)">{{ row.pending ? '核查结果' : needsSellerHubFollowup(row as DisputeRecord) ? '跟进补证' : availableActions(row as DisputeRecord).length ? '处理' : '查看' }}</ElButton>
            <TicketSourceActions compact :source="disputeTicketSource(row as DisputeRecord)" /></div></template>
        </ElTableColumn>
        <template #empty><ElEmpty description="没有匹配的记录" :image-size="62" /></template>
      </ElTable>
    </div>
    <footer class="dispute-footer"><span>共 {{ filtered.length }} 条</span>
      <ElPagination v-model:current-page="view.page" v-model:page-size="view.size" :page-sizes="[10,20,50]" :total="filtered.length"
        layout="sizes, prev, pager, next, jumper" @size-change="view.page = 1" />
    </footer>
  </section>
</template>

<style scoped>
.disputes-page{height:100%;box-sizing:border-box;display:flex;flex-direction:column;min-width:0;padding:0 16px;color:var(--el-text-color-primary);background:#fff;font-size:13px}
.type-bar{display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #e4e9ee;gap:16px}
.issue-tabs{display:flex;align-items:stretch;gap:24px;overflow-x:auto}
.issue-tabs button{position:relative;display:inline-flex;align-items:center;gap:7px;white-space:nowrap;padding:16px 1px 13px;background:none;border:0;border-bottom:3px solid transparent;color:#53616f;font:inherit;font-size:14px;font-weight:550;cursor:pointer}
.issue-tabs .current{color:var(--el-color-primary);border-bottom-color:var(--el-color-primary)}
.issue-tabs button:focus-visible,.text-link:focus-visible{outline:2px solid var(--el-color-primary);outline-offset:-2px}
.count{font-size:11px;font-weight:600;padding:1px 6px;border-radius:9px;background:#eff2f5;color:#526276;line-height:16px}
.current .count{background:var(--el-color-primary-light-9);color:var(--el-color-primary)}
.refresh{flex:none}.filters{display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:15px 0}.filters :deep(.el-button){margin-left:0}.filters [role=alert]{color:var(--el-color-danger)}
.dispute-table{min-height:180px;flex:1;min-width:0}.dispute-table :deep(th.el-table__cell){color:var(--yy-text-heading,#16191d);background:#f5f7fa;font-weight:600}
.dispute-table :deep(.el-table__cell){padding:10px 0}.dispute-table :deep(.cell){line-height:1.5;overflow-wrap:anywhere}
.text-link{padding:0;border:0;background:none;font:inherit;color:var(--el-color-primary);cursor:pointer;text-align:left}.record-id{font-weight:600;font-variant-numeric:tabular-nums}
.product{font-weight:550;color:var(--yy-text-heading,#16191d)}.secondary,.order-no{color:#606e7e;margin-top:4px;font-size:12px}.order-no,.amount{font-variant-numeric:tabular-nums}
.state-chip{display:inline-block;padding:2px 7px;border-radius:4px;font-weight:550;line-height:18px}.waiting{background:#eef4fb;color:#345c87}.attention{background:#fff2dd;color:#875609}.closed{background:#f0f3f4;color:#596573}.pending{background:#f6effa;color:#765889}
.secondary.overdue{color:#b43d31}.row-actions{display:flex;align-items:flex-start;gap:3px;flex-direction:column}.row-actions :deep(.el-button){padding:1px 0;margin:0;font-size:12px}
.dispute-footer{min-height:52px;display:flex;align-items:center;justify-content:flex-end;gap:14px;color:#637084}
@media(max-width:760px){.disputes-page{padding:0 8px}.issue-tabs{gap:12px}.issue-tabs button{font-size:12px}.type-bar{align-items:flex-start;flex-wrap:wrap;gap:4px}.filters{padding:8px 0}.dispute-footer{justify-content:flex-start;overflow-x:auto}}
</style>
