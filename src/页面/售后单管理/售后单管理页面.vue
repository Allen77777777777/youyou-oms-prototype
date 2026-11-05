<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElButton, ElDrawer, ElEmpty, ElOption, ElPagination, ElSelect, ElTable, ElTableColumn, ElTag } from 'element-plus'
import DateRange from '@/组件/筛选/时间范围.vue'
import FieldSearch from '@/组件/筛选/字段搜索.vue'
import MultiFilter from '@/组件/筛选/多选筛选.vue'
import { 命中多选, 命中字段搜索, 命中时间范围, 校验字段搜索, 校验时间范围, type 搜索字段, type 搜索模式 } from '@/组件/筛选/筛选工具'
import { 标注状态 } from '@/原型标注/标注状态'
import { 格式化北京时间 } from '../订单处理/时间展示工具'
import { activeAfterSaleActor, afterSaleActors, afterSaleFacts, afterSaleKinds, afterSaleReasons, afterSaleRecords, canApproveReship, canViewAfterSale, recordsForReturn, type AfterSaleRecord } from './会话'
import { initializeAfterSaleDemo } from './演示数据'
import { afterSaleAnnotation as annotation } from './标注'
import Detail from './售后单详情.vue'
import ReviewDialog from './重发审核.vue'
import PlatformState from './平台售后状态.vue'

initializeAfterSaleDemo()
const route = useRoute()
const router = useRouter()
const fields: 搜索字段[] = [
  { value: 'no', label: '售后单号' }, { value: 'returnId', label: '来源申请号' }, { value: 'orderNo', label: '平台订单号' },
  { value: 'systemOrderNo', label: '原系统订单号' }, { value: 'sku', label: '系统 SKU' }, { value: 'manualOrderNo', label: '重发订单号' },
]
const methods = afterSaleKinds.map(value => ({ value, label: value }))
const reasons = afterSaleReasons.map(value => ({ value, label: value }))
const queues = ['全部', '待审核', '已审核', '无需审核'] as const
const queue = ref<typeof queues[number]>('全部')
const emptyFilters = () => ({
  shops: [] as string[], kinds: [] as string[], reasons: [] as string[], dates: null as string[] | null,
  field: 'no', mode: 'contains' as 搜索模式, keyword: '',
})
const draft = ref(emptyFilters())
const applied = ref(emptyFilters())
const error = ref('')
const page = ref(1)
const pageSize = ref(20)
const visible = computed(() => afterSaleRecords.value.filter(row => canViewAfterSale(row, activeAfterSaleActor.value)))
const shops = computed(() => [...new Map(visible.value.map(row => [row.shopId, { value: row.shopId, label: row.shopName }])).values()])
const currentNo = computed(() => typeof route.query.documentNo === 'string' ? route.query.documentNo : '')
const selected = computed(() => visible.value.find(row => row.no === currentNo.value))
const demoMode = 标注状态.标注模式

function searchValue(row: AfterSaleRecord, field: string) {
  if (field === 'sku') return row.items.map(item => item.sku ?? '')
  if (field === 'returnId' || field === 'orderNo' || field === 'systemOrderNo' || field === 'manualOrderNo') return row[field]
  return row.no
}
const filtered = computed(() => {
  const q = applied.value
  return visible.value.filter(row =>
    命中多选(q.shops, row.shopId) && 命中多选(q.kinds, row.kind) &&
    (!q.reasons.length || row.items.some(item => q.reasons.includes(item.reason))) &&
    命中时间范围(row.createdAt, q.dates) && 命中字段搜索(searchValue(row, q.field), q.keyword, q.mode),
  ).sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.no.localeCompare(a.no))
})
const byQueue = (row: AfterSaleRecord, bucket: typeof queues[number]) => bucket === '全部' || (row.approval ?? '无需审核') === bucket
const results = computed(() => filtered.value.filter(row => byQueue(row, queue.value)))
const pageRows = computed(() => results.value.slice((page.value - 1) * pageSize.value, page.value * pageSize.value))
const checkedNo = ref('')
const reviewing = ref(false)
const checked = computed(() => queue.value === '待审核'
  ? pageRows.value.find(row => row.no === checkedNo.value && canApproveReship(row))
  : undefined)
const actorId = computed({
  get: () => activeAfterSaleActor.value.id,
  set: (id: string) => { const actor = afterSaleActors.find(item => item.id === id); if (actor) activeAfterSaleActor.value = actor },
})
watch(() => results.value.length, count => { page.value = Math.min(page.value, Math.max(1, Math.ceil(count / pageSize.value))) })
watch(pageSize, () => { page.value = 1 })
function clearSelection() { checkedNo.value = ''; reviewing.value = false }
watch([queue, page, pageSize, actorId, currentNo], clearSelection, { flush: 'sync' })
watch(checked, row => { if (!row) clearSelection() })

function query() {
  error.value = 校验字段搜索(draft.value.keyword, draft.value.mode) ?? 校验时间范围(draft.value.dates) ?? ''
  if (error.value) return
  const value = draft.value
  clearSelection()
  applied.value = { ...value, shops: [...value.shops], kinds: [...value.kinds], reasons: [...value.reasons], dates: value.dates && [...value.dates] }
  page.value = 1
}
function reset() { draft.value = emptyFilters(); queue.value = '全部'; query() }
function open(no: string) { void router.push({ path: route.path, query: { ...route.query, documentNo: no } }) }
function close() {
  const { documentNo: _documentNo, ...query } = route.query
  void router.replace({ path: route.path, query })
}
function showReturnRecords(row: AfterSaleRecord) {
  draft.value = { ...emptyFilters(), shops: [row.shopId], field: 'returnId', mode: 'exact', keyword: row.returnId }
  queue.value = '全部'
  query()
}
const reasonText = (row: AfterSaleRecord) => [...new Set(row.items.map(item => item.reason || '待补录'))].join('、') || '待补录'
function returnQuantities(row: AfterSaleRecord) {
  const { approvedReturnQty, receivedQty } = afterSaleFacts(row)
  return '批准退回 ' + (approvedReturnQty != null ? approvedReturnQty + ' 件' : '待确认') + ' · 实收 ' + (receivedQty != null ? receivedQty + ' 件' : '待确认')
}
</script>

<template>
  <section class="after-sale-page" aria-label="售后单管理">
    <div v-prototype="annotation('queues')" class="queues" role="tablist" aria-label="售后单审核筛选">
      <button v-for="value in queues" :key="value" type="button" role="tab" :aria-selected="queue === value" @click="queue = value; page = 1">
        {{ value }}<span>{{ filtered.filter(row => byQueue(row, value)).length }}</span>
      </button>
    </div>
    <div v-prototype="annotation('filters')" class="filters">
      <MultiFilter v-model="draft.kinds" :options="methods" placeholder="售后类型" :width="124" />
      <MultiFilter v-model="draft.shops" :options="shops" placeholder="来源店铺" :width="144" />
      <MultiFilter v-model="draft.reasons" :options="reasons" placeholder="系统售后原因" :width="145" />
      <span class="date-label">创建时间</span><DateRange v-model="draft.dates" aria-prefix="售后单" precision="date" :width="228" :show-hint="false" />
      <FieldSearch v-model="draft.keyword" v-model:field="draft.field" v-model:mode="draft.mode" :fields="fields" aria-prefix="售后单" :width="342" @search="query" />
      <div class="filter-actions"><ElButton type="primary" @click="query">查询</ElButton><ElButton @click="reset">重置</ElButton></div>
      <ElSelect v-if="demoMode" v-model="actorId" aria-label="原型操作身份" size="small" style="width: 132px">
        <template #prefix>模拟身份</template><ElOption v-for="actor in afterSaleActors" :key="actor.id" :label="actor.name" :value="actor.id" />
      </ElSelect>
      <p v-if="error" class="error" role="alert">{{ error }}</p>
    </div>
    <div v-if="queue === '待审核'" v-prototype="annotation('reviewSelection')" class="review-toolbar">
      <ElButton type="primary" :disabled="!checked || reviewing" @click="reviewing = true">审核</ElButton>
    </div>
    <div v-prototype="annotation('list')" class="table-area">
      <ElTable :data="pageRows" row-key="no" border height="100%" aria-label="售后单列表" :header-cell-style="{ background: '#f7f8fa', color: 'var(--yy-text-heading)' }">
        <ElTableColumn v-if="queue === '待审核'" label="选择" width="52" align="center">
          <template #default="{ row }"><input v-model="checkedNo" type="radio" name="pending-reship" :value="row.no" :disabled="!canApproveReship(row as AfterSaleRecord)" :aria-label="'选择审核 ' + row.no" /></template>
        </ElTableColumn>
        <ElTableColumn label="售后单号 / 创建时间" min-width="154">
          <template #default="{ row }"><button class="number-link" @click="open(row.no)">{{ row.no }}</button><div class="sub">{{ 格式化北京时间(row.createdAt) }}</div></template>
        </ElTableColumn>
        <ElTableColumn label="来源申请 / 来源场景" min-width="143">
          <template #default="{ row }"><button class="number-link" :aria-label="'查看 ' + row.returnId + ' 的全部处理记录'" @click="showReturnRecords(row as AfterSaleRecord)">{{ row.returnId }}</button><span v-if="recordsForReturn(row.shopId, row.returnId).length > 1" class="count">{{ recordsForReturn(row.shopId, row.returnId).length }} 笔</span><div class="sub">eBay退货申请</div></template>
        </ElTableColumn>
        <ElTableColumn label="店铺" min-width="115" prop="shopName" />
        <ElTableColumn label="平台订单号" min-width="142" prop="orderNo" />
        <ElTableColumn label="商品名称 / 系统 SKU" min-width="176">
          <template #default="{ row }">
            <div v-for="item in row.items" :key="item.lineId" class="product-line">
              <div>{{ item.title || '—' }}</div><div class="sub">{{ item.sku || '—' }}</div>
            </div>
            <span v-if="!row.items.length">—</span>
          </template>
        </ElTableColumn>
        <ElTableColumn label="系统售后原因" min-width="106"><template #default="{ row }">{{ reasonText(row as AfterSaleRecord) }}</template></ElTableColumn>
        <ElTableColumn label="售后类型 / 本次处置" min-width="157"><template #default="{ row }"><strong class="method">{{ row.kind }}</strong><div class="sub">
          <template v-if="row.kind === '退货'">{{ returnQuantities(row as AfterSaleRecord) }}</template>
          <template v-else-if="row.kind === '重发'">申请重发 {{ row.items.reduce((sum: number, item: AfterSaleRecord['items'][number]) => sum + item.quantity, 0) }} 件</template>
          <template v-else-if="row.actualAmount">实退 {{ row.actualAmount.value }} {{ row.actualAmount.currency }}</template>
          <template v-else-if="row.amount">{{ row.actionLabel?.includes('报价') ? '报价' : '拟退' }} {{ row.amount.value }} {{ row.amount.currency }} · 暂无实退</template>
          <template v-else>暂无已确认实退</template>
        </div></template></ElTableColumn>
        <ElTableColumn label="审核状态" width="83">
          <template #default="{ row }"><ElTag v-if="row.approval" :type="row.approval === '待审核' ? 'warning' : 'success'" size="small">{{ row.approval }}</ElTag><span v-else class="quiet">无需审核</span></template>
        </ElTableColumn>
        <ElTableColumn label="平台售后状态" min-width="118"><template #default="{ row }"><PlatformState :record="row as AfterSaleRecord" /></template></ElTableColumn>
        <ElTableColumn label="创建人" width="72" prop="createdBy" />
        <ElTableColumn label="操作" width="61" fixed="right"><template #default="{ row }"><ElButton link type="primary" @click="open(row.no)">详情</ElButton></template></ElTableColumn>
        <template #empty><ElEmpty description="暂无符合条件的售后单" :image-size="64" /></template>
      </ElTable>
    </div>
    <footer><span>共 {{ results.length }} 张售后单</span><ElPagination v-model:current-page="page" v-model:page-size="pageSize" :page-sizes="[10,20,50]" :total="results.length" layout="sizes, prev, pager, next" size="small" background /></footer>
    <ElDrawer :model-value="!!currentNo" title="售后单详情" size="min(820px, 96vw)" class="after-sale-drawer" :destroy-on-close="true" @update:model-value="value => { if (!value) close() }">
      <Detail v-if="selected" :key="selected.no" :record="selected" />
      <ElEmpty v-else description="未找到可查看的售后单，请核对单号及店铺权限"><ElButton @click="close">返回列表</ElButton></ElEmpty>
    </ElDrawer>
    <ReviewDialog v-if="reviewing && checked" :key="checked.no" :record="checked" @close="reviewing = false" />
  </section>
</template>

<style scoped>
.after-sale-page { box-sizing: border-box; display: flex; flex-direction: column; gap: 0; height: 100%; min-height: 340px; min-width: 0; padding: 14px 16px 0; overflow: hidden; background: #fff; color: #303133; }
.filter-actions, .after-sale-page footer { display: flex; align-items: center; }
.filters { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-top: 12px; }
.review-toolbar { display: flex; margin-top: 10px; }
.table-area input[type="radio"] { width: 15px; height: 15px; accent-color: #267be0; vertical-align: middle; }
.date-label, .quiet, .sub { color: #697483; font-size: 12px; }
.filter-actions .el-button + .el-button { margin-left: 8px; }
.error { flex-basis: 100%; color: #b64437; margin: 0; font-size: 12px; }
.queues { display: flex; align-items: stretch; gap: 24px; min-height: 41px; flex-shrink: 0; border-bottom: 1px solid #e5e8ec; overflow-x: auto; }
.queues button { display: inline-flex; align-items: center; gap: 6px; border: 0; border-bottom: 2px solid transparent; background: none; padding: 0 1px; color: #586272; cursor: pointer; font-size: 13px; white-space: nowrap; }
.queues button[aria-selected="true"] { color: #1767be; border-color: #267be0; font-weight: 600; }
.queues button span { padding: 1px 6px; color: #5a687b; background: #f0f3f6; border-radius: 9px; font-size: 11px; font-variant-numeric: tabular-nums; }
.queues button[aria-selected="true"] span { color: #1767be; background: #eaf3ff; }
.table-area { flex: 1 1 0; min-height: 130px; min-width: 0; margin-top: 12px; }
.table-area :deep(.el-table) { font-size: 12px; }
.table-area :deep(.el-table__cell) { padding: 9px 0; }
.table-area :deep(.cell) { line-height: 1.7; overflow-wrap: anywhere; }
.number-link { background: none; border: 0; color: #176dc9; cursor: pointer; padding: 0; text-align: left; font: inherit; font-weight: 600; }
.number-link:hover { text-decoration: underline; }
.count { display: inline-block; font-size: 10px; margin-left: 5px; padding: 0 5px; background: #eaf2fb; color: #41678f; border-radius: 6px; }
.product-line + .product-line { border-top: 1px solid #ebeef5; margin-top: 5px; padding-top: 5px; }
.method { font-weight: 500; color: #354053; }
.sub { font-size: 11px; margin-top: 2px; }
.after-sale-page footer { justify-content: space-between; gap: 10px; flex-wrap: wrap; min-height: 52px; font-size: 12px; color: #687587; }
:global(.after-sale-drawer .el-drawer__header) { padding: 17px 22px 14px; margin: 0; border-bottom: 1px solid #e7ebf0; }
:global(.after-sale-drawer .el-drawer__title) { color: var(--yy-text-heading); font-size: 17px; font-weight: 600; }
:global(.after-sale-drawer .el-drawer__body) { padding: 18px 22px 24px; }
@media (max-width: 1360px) { .after-sale-page { padding: 12px 14px 0; } }
</style>
