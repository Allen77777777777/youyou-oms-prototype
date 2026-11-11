<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElButton, ElCheckbox, ElEmpty, ElIcon, ElMessage, ElPagination, ElTable, ElTableColumn, ElTooltip } from 'element-plus'
import { ArrowRight, ChatLineRound, Clock, QuestionFilled, RefreshLeft, Shop, ShoppingBag, Star, Tickets, User } from '@element-plus/icons-vue'
import MultiFilter from '@/组件/筛选/多选筛选.vue'
import FieldSearch from '@/组件/筛选/字段搜索.vue'
import { 命中字段搜索, 校验字段搜索, 排序列表, type 搜索字段, type 搜索模式 } from '@/组件/筛选/筛选工具'
import { useBuyerProfile } from './聚合'
import type { BuyerCategory, BuyerRecord } from './模型'
import { buyerAnnotations as annotation } from './标注'
import { buyerTime, buyerTimeValue } from './展示工具'

const route = useRoute(), router = useRouter()
const param = (key: string) => typeof route.params[key] === 'string' ? route.params[key] as string : ''
const profile = useBuyerProfile(() => param('shopId'), () => param('buyerId'))
const categories: Array<{ key: BuyerCategory; label: string }> = [
  { key: 'orders', label: '订单' }, { key: 'messages', label: '沟通' }, { key: 'afterSales', label: '售后与纠纷' },
  { key: 'reviews', label: '评价' }, { key: 'tickets', label: '工单' },
]
const categoryIcons = { orders: ShoppingBag, messages: ChatLineRound, afterSales: RefreshLeft, reviews: Star, tickets: Tickets }
const tab = ref<BuyerCategory | 'overview'>('overview')
const fields: 搜索字段[] = [{ value: 'number', label: '单据编号' }, { value: 'summary', label: '摘要', kind: 'text' }]
const initialFilters = () => ({ shops: [] as string[], kinds: [] as string[], field: 'number', mode: 'contains' as 搜索模式, text: '', pending: false })
const draft = reactive(initialFilters()), applied = reactive(initialFilters())
const page = ref(1), pageSize = ref(10)
const shopOptions = computed(() => profile.value.shops.map(shop => ({ value: shop.id, label: shop.name })))
const scoped = computed(() => profile.value.records.filter(row => !applied.shops.length || applied.shops.includes(row.shopId)))
const orders = computed(() => 排序列表(scoped.value.filter(row => row.category === 'orders'), row => buyerTimeValue(row.occurredAt), 'asc', row => row.key))
const datedOrders = computed(() => orders.value.filter(row => buyerTimeValue(row.occurredAt) !== undefined))
const currentRows = computed(() => scoped.value.filter(row => row.category === tab.value))
const kindOptions = computed(() => [...new Map(currentRows.value.map(row => [row.kind, { value: row.kind, label: row.typeLabel }])).values()])
const rows = computed(() => 排序列表(currentRows.value.filter(row =>
  (!applied.kinds.length || applied.kinds.includes(row.kind)) && (!applied.pending || row.pending)
  && 命中字段搜索(applied.field === 'summary' ? row.summary : row.number, applied.text, applied.mode, applied.field === 'summary' ? 'text' : 'identifier'),
), row => buyerTimeValue(row.occurredAt), 'desc', row => row.key))
const visibleRows = computed(() => rows.value.slice((page.value - 1) * pageSize.value, page.value * pageSize.value))
const recent = computed(() => 排序列表(scoped.value, row => buyerTimeValue(row.occurredAt), 'desc', row => row.key).slice(0, 6))
const pendingGroups = computed(() => [...new Map(scoped.value.filter(row => row.pending).map(row => [row.kind, {
  kind: row.kind, label: row.typeLabel, category: row.category,
  rows: 排序列表(scoped.value.filter(item => item.pending && item.kind === row.kind), item => buyerTimeValue(item.dueAt), 'asc', item => item.key),
}])).values()])
const rangeLabel = computed(() => applied.shops.length ? `已选 ${applied.shops.length} 个店铺` : profile.value.identityMode === 'verified' ? '全部可见店铺' : '来源店铺')
const scopeShopCount = computed(() => new Set(scoped.value.map(row => row.shopId)).size)
const count = (category: BuyerCategory) => scoped.value.filter(row => row.category === category).length
const scopedCoverageIssues = computed(() => profile.value.coverageIssues.filter(issue => !applied.shops.length || applied.shops.includes(issue.shopId)))
const hasCoverageIssue = (category: BuyerCategory) => scopedCoverageIssues.value.some(issue => issue.category === category)
const coverageMessages = computed(() => [...new Set(scopedCoverageIssues.value.filter(issue => tab.value === 'overview' || issue.category === tab.value).map(issue => issue.message))])
function query() {
  const error = 校验字段搜索(draft.text, draft.mode, draft.field === 'summary' ? 'text' : 'identifier')
  if (error) return void ElMessage.warning(error)
  Object.assign(applied, { ...draft, shops: [...draft.shops], kinds: [...draft.kinds] })
  page.value = 1
}
function reset() { Object.assign(draft, initialFilters()); Object.assign(applied, initialFilters()); page.value = 1 }
function selectTab(value: BuyerCategory | 'overview') {
  tab.value = value
  draft.kinds = []; applied.kinds = []; draft.pending = false; applied.pending = false
  draft.text = ''; applied.text = ''; page.value = 1
}
function showPending(category: BuyerCategory, kind: string) {
  selectTab(category)
  draft.kinds = [kind]; applied.kinds = [kind]; draft.pending = true; applied.pending = true
}
function openRecord(row: BuyerRecord) {
  if (row.location) void router.push(row.location)
}
watch([() => rows.value.length, pageSize], () => { page.value = Math.min(page.value, Math.max(1, Math.ceil(rows.value.length / pageSize.value))) })
</script>

<template>
  <section class="buyer-page">
    <div class="buyer-profile-card">
      <header v-prototype="annotation.identity" class="buyer-header">
        <div class="buyer-avatar" aria-hidden="true"><ElIcon :size="26"><User /></ElIcon></div>
        <div class="buyer-identity">
          <div class="buyer-title"><h1>买家详情</h1><span class="buyer-id">{{ profile.buyerId || '身份待核实' }}</span><span class="platform-badge">eBay</span></div>
          <div class="buyer-meta"><span>{{ rangeLabel }}</span><span>北京时间</span>
            <ElTooltip :content="`${profile.scopeText}。${profile.coverageText}`" placement="bottom"><button type="button" class="buyer-help" aria-label="查看数据范围说明"><ElIcon><QuestionFilled /></ElIcon></button></ElTooltip>
          </div>
        </div>
        <div v-if="profile.found" class="buyer-scope-filter">
          <span class="filter-label">查看范围</span>
          <MultiFilter v-model="draft.shops" :options="shopOptions" placeholder="全部店铺" :width="180" />
          <ElButton type="primary" @click="query">查询</ElButton><ElButton @click="reset">重置</ElButton>
        </div>
      </header>
      <div v-if="profile.found" v-prototype="annotation.overview" class="buyer-metrics">
        <div class="metric metric-count"><span class="metric-icon"><ElIcon><ShoppingBag /></ElIcon></span><div><span class="metric-label">订单记录</span><strong>{{ orders.length }}<small>笔</small></strong></div></div>
        <div class="metric metric-count"><span class="metric-icon"><ElIcon><Shop /></ElIcon></span><div><span class="metric-label">关联店铺</span><strong>{{ scopeShopCount }}<small>个</small></strong></div></div>
        <div class="metric"><span class="metric-label">最早订单时间 <ElTooltip content="按已同步且下单时间可信的订单计算；历史覆盖不足时不代表真实首次购买。"><ElIcon><QuestionFilled /></ElIcon></ElTooltip></span><strong class="metric-time">{{ buyerTime(datedOrders[0]?.occurredAt) }}</strong></div>
        <div class="metric"><span class="metric-label">最近订单时间</span><strong class="metric-time">{{ buyerTime(datedOrders[datedOrders.length - 1]?.occurredAt) }}</strong></div>
      </div>
    </div>

    <ElEmpty v-if="!profile.found" description="未找到可查看的买家资料，请从原业务记录核对买家与店铺。" />
    <template v-else>
      <div v-if="profile.identityMode === 'shop-only'" class="buyer-scope-note">当前仅查看来源店铺记录；跨店买家身份尚未核实。</div>
      <div class="buyer-nav-row">
        <nav class="buyer-tabs" aria-label="买家资料分类">
          <button type="button" :class="{ selected: tab === 'overview' }" :aria-current="tab === 'overview' ? 'page' : undefined" @click="selectTab('overview')">概览</button>
          <button v-for="item in categories" :key="item.key" type="button" :class="{ selected: tab === item.key }" :aria-current="tab === item.key ? 'page' : undefined" @click="selectTab(item.key)">{{ item.label }}<span>{{ hasCoverageIssue(item.key) ? `已收录 ${count(item.key)}` : count(item.key) }}</span></button>
        </nav>
        <span class="buyer-scope-caption">本系统已同步记录</span>
      </div>
      <div v-if="coverageMessages.length" class="buyer-coverage-note" role="status"><p v-for="message in coverageMessages" :key="message">{{ message }}</p></div>

      <div v-if="tab === 'overview'" class="buyer-overview">
        <section class="buyer-panel pending-panel">
          <header class="panel-heading"><h2>待处理事项</h2><span>按业务类型查看</span></header>
          <ElEmpty v-if="!pendingGroups.length" description="当前范围暂无待处理事项" :image-size="82" />
          <div v-else class="pending-grid">
            <section v-for="group in pendingGroups" :key="group.kind" class="pending-group">
              <header class="group-heading">
                <span class="group-icon" aria-hidden="true"><ElIcon><component :is="categoryIcons[group.category]" /></ElIcon></span>
                <h3>{{ group.label }}</h3><span class="group-count">{{ group.rows.length }}</span>
                <button type="button" class="group-more" :aria-label="`查看全部${group.label}`" @click="showPending(group.category, group.kind)">查看全部<ElIcon><ArrowRight /></ElIcon></button>
              </header>
              <article v-for="row in group.rows.slice(0, 1)" :key="row.key" class="pending-record">
                <div class="record-heading"><button v-if="row.location" type="button" class="text-link record-number" @click="openRecord(row)">{{ row.number }}</button><strong v-else>{{ row.number }}</strong><span class="pending-state">{{ row.status }}</span></div>
                <p class="record-summary" :title="row.summary">{{ row.summary }}</p>
                <div class="record-meta"><span>{{ row.shopName }}</span><span v-for="person in row.people" :key="person.label">{{ person.label }}：{{ person.value }}</span></div>
                <div v-if="row.dueAt" class="pending-deadline"><ElIcon><Clock /></ElIcon><span>{{ row.dueLabel || (row.category === 'tickets' ? '工单跟进时间' : '响应期限') }}：{{ buyerTime(row.dueAt) }}</span></div>
              </article>
            </section>
          </div>
        </section>
        <section class="buyer-panel recent-panel">
          <header class="panel-heading"><h2>近期记录</h2><span>最近 6 条</span></header>
          <ElEmpty v-if="!recent.length" description="当前范围暂无记录" :image-size="82" />
          <div class="recent-timeline">
            <article v-for="row in recent" :key="row.key" class="recent-record">
              <span class="timeline-dot" aria-hidden="true"></span>
              <div class="recent-top"><span>{{ row.typeLabel }}</span><time>{{ buyerTime(row.occurredAt) }}</time></div>
              <p class="record-summary" :title="row.summary">{{ row.summary }}</p>
              <div class="recent-reference"><button v-if="row.location" type="button" class="text-link record-number" @click="openRecord(row)">{{ row.number }}</button><strong v-else class="record-number">{{ row.number }}</strong><span>{{ row.shopName }}</span></div>
              <div class="recent-state">{{ row.status }}</div>
            </article>
          </div>
        </section>
      </div>

      <section v-else v-prototype="annotation.records" class="buyer-records">
        <div class="record-filters">
          <MultiFilter v-model="draft.kinds" :options="kindOptions" placeholder="记录类型" :width="150" />
          <FieldSearch v-model="draft.text" v-model:field="draft.field" v-model:mode="draft.mode" :fields="fields" aria-prefix="买家记录" @search="query" />
          <ElCheckbox v-if="tab !== 'orders'" v-model="draft.pending" @change="query">只看待处理</ElCheckbox>
          <span class="record-sort">按业务时间从新到旧</span>
        </div>
        <ElTable :data="visibleRows" row-key="key" class="buyer-record-table" empty-text="当前条件下暂无记录">
          <ElTableColumn label="记录 / 摘要" min-width="290">
            <template #default="{ row }">
              <div class="table-kind">{{ row.typeLabel }}</div><button v-if="row.location" type="button" class="text-link record-number" @click="openRecord(row as BuyerRecord)">{{ row.number }}</button><strong v-else class="record-number">{{ row.number }}</strong>
              <p class="record-summary">{{ row.summary }}</p><p v-if="row.relationLabel" class="record-relation">{{ row.relationLabel }}</p>
              <span v-if="row.amount" class="record-amount">{{ row.amount.currency }} {{ row.amount.value }}</span>
            </template>
          </ElTableColumn>
          <ElTableColumn prop="shopName" label="来源店铺" width="160" />
          <ElTableColumn label="当前进展" min-width="180"><template #default="{ row }"><span class="record-state">{{ row.status }}</span><div v-for="person in row.people" :key="person.label" class="record-meta">{{ person.label }}：{{ person.value }}</div></template></ElTableColumn>
          <ElTableColumn label="业务时间（北京时间）" width="195"><template #default="{ row }"><time>{{ buyerTime(row.occurredAt) }}</time><div v-if="row.dueAt" class="record-deadline"><span>{{ row.dueLabel || (row.category === 'tickets' ? '工单跟进' : '响应期限') }}</span><time>{{ buyerTime(row.dueAt) }}</time></div></template></ElTableColumn>
          <ElTableColumn label="操作" width="95" align="center"><template #default="{ row }"><button v-if="row.location" type="button" class="text-link" @click="openRecord(row as BuyerRecord)">查看原单</button><span v-else class="unlinked">待关联</span></template></ElTableColumn>
        </ElTable>
        <div class="buyer-pagination"><ElPagination v-model:current-page="page" v-model:page-size="pageSize" :page-sizes="[10, 20, 50]" :total="rows.length" layout="total, sizes, prev, pager, next, jumper" /></div>
      </section>
    </template>
  </section>
</template>

<style scoped src="./买家详情样式.css"></style>
