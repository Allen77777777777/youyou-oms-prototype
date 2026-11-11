<script lang="ts">
import { reactive } from 'vue'
import type { 搜索模式 } from '@/组件/筛选/筛选工具'

const scopes = ['我的待办', '我发起的', '全部工单'] as const
const schedules = ['全部时间', '待跟进', '完成逾期', '今天跟进', '后续待办', '待安排'] as const
type Scope = typeof scopes[number]
type Schedule = typeof schedules[number]
const blankFilters = () => ({ kinds: [] as string[], statuses: [] as string[], priorities: [] as string[], owners: [] as string[], field: 'title', keyword: '', mode: 'contains' as 搜索模式 })
// 业务详情会卸载列表。按操作身份保存本次浏览位置，切回时仍能接着处理。
const workspaceViews = new Map<string, ReturnType<typeof newView>>()
function newView() {
  return reactive({ scope: '我的待办' as Scope, schedule: '全部时间' as Schedule, draft: blankFilters(), applied: blankFilters(), page: 1, pageSize: 20 })
}
function viewFor(actor: string) {
  let view = workspaceViews.get(actor)
  if (!view) {
    view = newView()
    workspaceViews.set(actor, view)
  }
  return view
}
</script>

<script setup lang="ts">
import BuyerLink from '@/组件/买家/买家链接.vue'
import { useBuyerPageActive } from '@/组件/买家/页面活跃'
import { resolveTicketBuyer } from '@/页面/eBay买家详情/聚合'
import { computed, h, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElButton, ElDrawer, ElEmpty, ElMessage, ElOption, ElPagination, ElPopover, ElSelect, ElTable, ElTableColumn, ElTag } from 'element-plus'
import MultiFilter from '@/组件/筛选/多选筛选.vue'
import FieldSearch from '@/组件/筛选/字段搜索.vue'
import { 命中多选, 命中字段搜索, 校验字段搜索, type 搜索字段 } from '@/组件/筛选/筛选工具'
import { actors, checkFollowupReminders, currentActor, isTicketClosed, latestBusinessLog, latestBusinessProgress, markNotificationRead, sourceLabels, sourceLocation, ticketNotifications, ticketNow, ticketPriorities, tickets, ticketTimeRestoreIssue, type Ticket, type TicketKind } from './会话'
import { isTicketViewTime } from './时间存储'
import { ticketAnnotations } from './标注'
import TicketDetail from './工单详情.vue'
import TicketCreate from './来源工单操作.vue'

const route = useRoute()
const router = useRouter()
const view = computed(() => viewFor(currentActor.value))
const fields: 搜索字段[] = [{ value: 'title', label: '工单事项', kind: 'text' }, { value: 'id', label: '工单号' }, { value: 'sourceId', label: '来源单号' }]
const kinds = [...Object.entries(sourceLabels).map(([value, label]) => ({ value, label })), { value: 'none', label: '无来源' }]
const statuses = ['待处理', '处理中', '已完成', '已放弃'].map(value => ({ value, label: value }))
const priorities = ticketPriorities.map(value => ({ value, label: value }))
const owners = actors.map(value => ({ value, label: value }))
const focusId = computed(() => typeof route.query.ticketId === 'string' ? route.query.ticketId : '')
const selected = computed(() => tickets.value.find(item => item.id === focusId.value))
const now = ref(ticketNow())
const showNotifications = ref(false)
const myNotifications = computed(() => ticketNotifications.value.filter(item => item.recipient === currentActor.value).slice().reverse())
const unreadCount = computed(() => myNotifications.value.filter(item => !item.readAt).length)
let timer: ReturnType<typeof setInterval>
function refreshReminders() {
  now.value = ticketNow()
  const error = checkFollowupReminders(now.value)
  if (error) ElMessage.warning(error)
}
onMounted(() => { refreshReminders(); timer = setInterval(refreshReminders, 30000) })
watch(currentActor, () => { showNotifications.value = false; refreshReminders() })
onBeforeUnmount(() => clearInterval(timer))

function nextActionTime(row: Ticket) {
  const next = isTicketViewTime(row.nextAt) ? row.nextAt : ''
  const due = isTicketViewTime(row.dueAt) ? row.dueAt : ''
  if (next && due) return next < due ? next : due
  return next || due
}
// 各快捷范围独立筛选；排序继续采用跟进与完成期限中较早的时间。
function timeOrder(row: Ticket) {
  const next = nextActionTime(row)
  if (!next) return 3
  if (next <= now.value) return 0
  return next.slice(0, 10) === now.value.slice(0, 10) ? 1 : 2
}
function inScope(row: Ticket, scope: Scope) {
  if (scope === '我的待办') return row.owner === currentActor.value && !isTicketClosed(row)
  if (scope === '我发起的') return row.creator === currentActor.value
  return true
}
function inSchedule(row: Ticket, schedule: Schedule) {
  if (schedule === '全部时间') return true
  if (isTicketClosed(row)) return false
  if (schedule === '待跟进') return isTicketViewTime(row.nextAt) && row.nextAt <= now.value
  if (schedule === '完成逾期') return isTicketViewTime(row.dueAt) && row.dueAt < now.value
  if (schedule === '待安排') return !row.nextAt && !row.dueAt
  const next = nextActionTime(row)
  if (schedule === '今天跟进') return !!next && next > now.value && next.slice(0, 10) === now.value.slice(0, 10)
  return !!next && next.slice(0, 10) > now.value.slice(0, 10)
}
function compareNext(a: Ticket, b: Ticket) {
  if (isTicketClosed(a) || isTicketClosed(b)) {
    if (isTicketClosed(a) !== isTicketClosed(b)) return isTicketClosed(a) ? 1 : -1
    return (b.closedAt || b.updatedAt).localeCompare(a.closedAt || a.updatedAt) || b.id.localeCompare(a.id)
  }
  const order = timeOrder(a) - timeOrder(b)
  const nextA = nextActionTime(a) || '9999'
  const nextB = nextActionTime(b) || '9999'
  return order || nextA.localeCompare(nextB) || b.updatedAt.localeCompare(a.updatedAt) || b.id.localeCompare(a.id)
}
const filtered = computed(() => {
  const q = view.value.applied
  return tickets.value.filter(row => {
    const value = q.field === 'title' ? row.title : q.field === 'id' ? row.id : row.source?.id || ''
    return 命中多选(q.kinds, row.source?.kind || 'none') && 命中多选(q.statuses, row.status) && 命中多选(q.owners, row.owner) && 命中多选(q.priorities, row.priority || '普通')
      && 命中字段搜索(value, q.keyword, q.mode, q.field === 'title' ? 'text' : 'identifier')
  })
})
const scoped = computed(() => filtered.value.filter(row => inScope(row, view.value.scope)))
const results = computed(() => scoped.value.filter(row => inSchedule(row, view.value.schedule)).sort(compareNext))
const pageRows = computed(() => results.value.slice((view.value.page - 1) * view.value.pageSize, view.value.page * view.value.pageSize))
watch(() => [results.value.length, view.value.pageSize], () => {
  view.value.page = Math.min(view.value.page, Math.max(1, Math.ceil(results.value.length / view.value.pageSize)))
})
function query() {
  const d = view.value.draft
  const error = 校验字段搜索(d.keyword, d.mode, d.field === 'title' ? 'text' : 'identifier')
  if (error) return void ElMessage.warning(error)
  view.value.applied = { ...d, kinds: [...d.kinds], owners: [...d.owners], statuses: [...d.statuses], priorities: [...d.priorities] }
  view.value.page = 1
}
function reset() {
  view.value.draft = blankFilters()
  view.value.schedule = '全部时间'
  query()
}
function setScope(value: Scope) {
  view.value.scope = value
  view.value.page = 1
  view.value.schedule = '全部时间'
}
function setSchedule(value: Schedule) {
  view.value.schedule = value
  view.value.page = 1
}
function openTicket(id: string) { void router.push({ name: 'oms-tickets', query: { ...route.query, ticketId: id } }) }
function closeTicket() {
  const { ticketId: _id, ...query } = route.query
  void router.replace({ name: 'oms-tickets', query })
}
function latestProgress(row: Ticket) { return latestBusinessProgress(row) }
function progressMeta(row: Ticket) {
  const log = latestBusinessLog(row)
  return log ? log.actor + ' · ' + log.time : ''
}
function checklistProgress(row: Ticket) {
  const items = row.checklist || []
  return items.length ? '待办 ' + items.filter(item => item.done).length + ' / ' + items.length : ''
}
function openNotification(id: string, ticketId: string) {
  const error = markNotificationRead(id)
  if (error) return void ElMessage.warning(error)
  showNotifications.value = false
  openTicket(ticketId)
}
function markAllRead() {
  for (const item of myNotifications.value.filter(item => !item.readAt)) {
    const error = markNotificationRead(item.id)
    if (error) return void ElMessage.warning(error)
  }
}
const buyerPageActive = useBuyerPageActive()
</script>

<template>
  <section class="tickets-page" aria-label="工单管理">
    <p v-if="ticketTimeRestoreIssue" class="time-restore-warning" role="alert">{{ ticketTimeRestoreIssue }}。核实前暂停保存及提醒。</p>
    <header class="workspace-header">
      <div class="scope-tabs" role="tablist" aria-label="工单范围">
        <button v-for="scope in scopes" :key="scope" type="button" role="tab" :aria-selected="view.scope === scope" @click="setScope(scope)">
          {{ scope }}<span>{{ filtered.filter(row => inScope(row, scope)).length }}</span>
        </button>
      </div>
      <div class="header-actions">
        <ElPopover v-model:visible="showNotifications" trigger="click" placement="bottom-end" :width="370" :hide-after="0">
          <template #reference><ElButton v-prototype="ticketAnnotations.notifications" class="notification-trigger" text aria-label="工单提醒">工单提醒<span v-if="unreadCount" class="notification-count">{{ unreadCount }}</span></ElButton></template>
          <section class="notification-panel" aria-label="工单提醒列表">
            <header><strong>工单提醒</strong><ElButton v-if="unreadCount" link type="primary" size="small" @click="markAllRead">全部标为已读</ElButton></header>
            <ul v-if="myNotifications.length">
              <li v-for="item in myNotifications" :key="item.id" :class="{ unread: !item.readAt }">
                <button type="button" @click="openNotification(item.id, item.ticketId)"><span>{{ item.title }}</span><small>{{ item.ticketId }} · {{ item.time }}</small></button>
              </li>
            </ul>
            <p v-else class="no-notifications">暂无工单提醒</p>
          </section>
        </ElPopover>
      <label class="actor-control">当前身份
        <ElSelect v-model="currentActor" aria-label="当前操作身份" size="small" style="width: 126px">
          <ElOption v-for="actor in actors" :key="actor" :value="actor" :label="actor" />
        </ElSelect>
      </label>
      </div>
    </header>
    <div class="filters">
      <MultiFilter v-model="view.draft.kinds" :options="kinds" placeholder="来源类型" :width="125" />
      <MultiFilter v-model="view.draft.statuses" :options="statuses" placeholder="工单状态" :width="116" />
      <MultiFilter v-model="view.draft.priorities" :options="priorities" placeholder="优先级" :width="100" />
      <MultiFilter v-model="view.draft.owners" :options="owners" placeholder="负责人" :width="122" />
      <FieldSearch v-model="view.draft.keyword" v-model:field="view.draft.field" v-model:mode="view.draft.mode" :fields="fields" aria-prefix="工单" :width="360" @search="query" />
      <div class="filter-actions"><ElButton type="primary" @click="query">查询</ElButton><ElButton @click="reset">重置</ElButton></div>
    </div>
    <div class="toolbar">
      <TicketCreate manual @created="item => openTicket(item.id)" />
      <div v-prototype="ticketAnnotations.schedule" class="timings" role="group" aria-label="待办时间分组" title="各范围独立筛选，同一工单可同时处于待跟进和完成逾期">
        <button v-for="schedule in schedules" :key="schedule" type="button" :aria-pressed="view.schedule === schedule" :class="{ overdue: schedule === '完成逾期' }" @click="setSchedule(schedule)">
          {{ schedule }}<span v-if="schedule !== '全部时间'">{{ scoped.filter(row => inSchedule(row, schedule)).length }}</span>
        </button>
      </div>
    </div>
    <div v-prototype="ticketAnnotations.list" class="table-area">
      <ElTable :data="pageRows" row-key="id" border height="100%" aria-label="工单列表">
        <ElTableColumn label="工单号 / 工单事项" min-width="205">
          <template #default="{ row }"><button class="number-link" type="button" @click="openTicket(row.id)">{{ row.id }}</button>
            <div class="subject">{{ row.title }}</div><div v-if="row.checklist?.length" class="sub checklist-progress">{{ checklistProgress(row as Ticket) }}</div></template>
        </ElTableColumn>
        <ElTableColumn label="优先级" width="75" align="center">
          <template #default="{ row }">
            <span class="ticket-priority" :data-priority="row.priority || '普通'">{{ row.priority || '普通' }}</span>
          </template>
        </ElTableColumn>
        <ElTableColumn label="来源单号 / 来源类型" min-width="145">
          <template #default="{ row }">
            <template v-if="row.source"><button class="number-link" type="button" @click="router.push(sourceLocation(row.source))">{{ row.source.id }}</button><div class="sub">{{ sourceLabels[row.source.kind as TicketKind] }}</div></template>
            <span v-else class="sub">无来源</span>
          </template>
        </ElTableColumn>
        <ElTableColumn label="店铺 / 买家" min-width="111"><template #default="{ row }">{{ row.source?.shopName || '—' }}<div v-if="row.source && resolveTicketBuyer(row.source)" class="sub"><BuyerLink :shop-id="row.source.shopId" :buyer-id="resolveTicketBuyer(row.source)?.buyerId" /></div></template></ElTableColumn>
        <ElTableColumn label="负责人" width="96" prop="owner" />
        <ElTableColumn label="状态" width="84">
          <template #default="{ row }"><ElTag size="small" :type="row.status === '已完成' ? 'success' : row.status === '已放弃' ? 'warning' : row.status === '处理中' ? 'primary' : 'info'">{{ row.status }}</ElTag></template>
        </ElTableColumn>
        <ElTableColumn label="下次跟进" min-width="135">
          <template #default="{ row }"><span :class="{ 'followup-due': !isTicketClosed(row as Ticket) && isTicketViewTime(row.nextAt) && row.nextAt <= now }">{{ row.nextAt || '—' }}</span><div v-if="!isTicketClosed(row as Ticket) && isTicketViewTime(row.nextAt) && row.nextAt <= now" class="sub followup-due">已到跟进时间</div></template>
        </ElTableColumn>
        <ElTableColumn label="完成期限" min-width="135">
          <template #default="{ row }"><span :class="{ late: !isTicketClosed(row as Ticket) && isTicketViewTime(row.dueAt) && row.dueAt < now }">{{ row.dueAt || '—' }}</span><div v-if="!isTicketClosed(row as Ticket) && isTicketViewTime(row.dueAt) && row.dueAt < now" class="sub late">完成已逾期</div></template>
        </ElTableColumn>
        <ElTableColumn label="最新进展" min-width="180"
          :show-overflow-tooltip="{ enterable: true, hideAfter: 180 }"
          :tooltip-formatter="({ row }) => h('div', { class: 'ticket-progress-fulltext' }, latestProgress(row as Ticket))">
          <template #default="{ row }"><div class="progress-content">{{ latestProgress(row as Ticket) }}</div><div v-if="progressMeta(row as Ticket)" class="sub progress-meta">{{ progressMeta(row as Ticket) }}</div></template>
        </ElTableColumn>
        <ElTableColumn label="操作" width="65" fixed="right"><template #default="{ row }"><ElButton link type="primary" @click="openTicket(row.id)">{{ row.owner === currentActor && !isTicketClosed(row as Ticket) ? '跟进' : '详情' }}</ElButton></template></ElTableColumn>
        <template #empty><ElEmpty :description="view.scope === '我的待办' ? '当前范围内没有待办工单' : '暂无符合条件的工单'" :image-size="60" /></template>
      </ElTable>
    </div>
    <footer class="pagination"><span>共 {{ results.length }} 张工单</span>
      <ElPagination v-model:current-page="view.page" v-model:page-size="view.pageSize" :page-sizes="[10,20,50]" :total="results.length" layout="sizes, prev, pager, next" size="small" background @size-change="view.page = 1" />
    </footer>
    <ElDrawer :model-value="buyerPageActive && !!focusId" title="工单详情" size="min(1180px, 96vw)" class="ticket-drawer" :destroy-on-close="buyerPageActive" @update:model-value="value => { if (buyerPageActive && !value) closeTicket() }">
      <TicketDetail v-if="selected" :key="selected.id + currentActor" :ticket="selected" />
      <ElEmpty v-else description="未找到该工单"><ElButton @click="closeTicket">返回工单列表</ElButton></ElEmpty>
    </ElDrawer>
  </section>
</template>

<style scoped>
.time-restore-warning { margin: 0 0 8px; color: #9b651b; font-size: 12px; line-height: 1.5; }
.tickets-page { box-sizing: border-box; display: flex; flex-direction: column; height: 100%; min-height: 400px; min-width: 0; padding: 10px 16px 0; color: var(--yy-text-regular); background: #fff; }
.workspace-header { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 0 18px; border-bottom: 1px solid #e5e8ed; }
.scope-tabs { display: flex; gap: 24px; align-items: stretch; }
.scope-tabs button, .timings button { display: inline-flex; align-items: center; gap: 6px; border: 0; background: none; cursor: pointer; font: inherit; white-space: nowrap; }
.scope-tabs button { min-height: 42px; padding: 0 1px; color: #536175; border-bottom: 2px solid transparent; font-size: 14px; }
.scope-tabs button[aria-selected="true"] { color: #1767be; border-color: #267be0; font-weight: 600; }
.scope-tabs button span { background: #f0f3f6; padding: 1px 6px; border-radius: 9px; color: #687483; font-size: 11px; font-variant-numeric: tabular-nums; }
.scope-tabs button[aria-selected="true"] span { color: #1767be; background: #eaf3ff; }
.header-actions { display:flex; align-items:center; gap:14px; }
.notification-trigger { font-size:12px; padding:6px 8px; }
.notification-count { margin-left:5px; min-width:16px; height:16px; padding:0 4px; box-sizing:border-box; border-radius:8px; background:#eaf3ff; color:#1767be; line-height:16px; font-size:11px; }
.notification-panel { color:#354356; font-size:13px; }
.notification-panel header { display:flex; align-items:center; justify-content:space-between; padding-bottom:9px; border-bottom:1px solid #e6ebf0; }
.notification-panel strong { color:var(--yy-text-heading); }
.notification-panel ul { margin:0; padding:0; max-height:340px; overflow:auto; list-style:none; }
.notification-panel li + li { border-top:1px solid #edf0f3; }
.notification-panel li button { display:grid; gap:5px; width:100%; border:0; padding:11px 8px; background:#fff; text-align:left; font:inherit; color:#5d6c7f; cursor:pointer; }
.notification-panel li button:hover { background:#f5f8fc; }
.notification-panel li.unread button { color:#254d7a; background:#f2f7ff; }
.notification-panel small { color:#778498; font-size:11px; }
.no-notifications { margin:22px 0; color:#778498; text-align:center; }
.actor-control, .filters, .toolbar, .timings, .filter-actions, .pagination { display: flex; align-items: center; }
.actor-control { gap: 8px; min-height: 38px; font-size: 12px; color: #637083; }
.filters { flex-wrap: wrap; gap: 8px; padding: 14px 0 11px; }
.filter-actions :deep(.el-button + .el-button) { margin-left: 8px; }
.toolbar { flex-wrap: wrap; gap: 6px 18px; justify-content: space-between; padding: 5px 0 12px; }
.timings { flex-wrap: wrap; gap: 2px; }
.timings button { padding: 4px 8px; border-radius: 4px; color: #526479; font-size: 12px; }
.timings button:hover { background: #f2f5f8; }
.timings button[aria-pressed="true"] { background: #eaf3ff; color: #1767be; font-weight: 600; }
.timings button span { font-size: 11px; color: inherit; }
.timings button.overdue { color:#a54535; }
.table-area { flex: 1 1 0; min-height: 150px; min-width: 0; }
.table-area :deep(.el-table) { font-size: 12px; }
.table-area :deep(th.el-table__cell) { background: #f7f8fa; color: var(--yy-text-heading); }
.table-area :deep(.el-table__cell) { padding: 9px 0; }
.table-area :deep(.cell) { line-height: 1.65; overflow-wrap: anywhere; }
.number-link { background: none; border: 0; padding: 0; color: #176dc9; font: inherit; font-weight: 600; text-align: left; cursor: pointer; }
.number-link:hover { text-decoration: underline; }
.subject { margin-top: 2px; color: #354053; }
.ticket-priority { color:#526071; }
.ticket-priority[data-priority="优先"] { color:#99540b; font-weight:600; }
.ticket-priority[data-priority="紧急"] { color:#b02e2b; font-weight:600; }
:global(.ticket-progress-fulltext) { max-width:min(400px, 75vw); max-height:min(260px, 40vh); overflow:auto; overscroll-behavior:contain; white-space:pre-wrap; overflow-wrap:anywhere; line-height:1.6; text-align:left; }
.sub { color: #778498; font-size: 11px; margin-top: 2px; }
.progress-content, .progress-meta { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.followup-due, .sub.followup-due { color:#92601e; }
.late { color: #ae4b37; }
.sub.late { color:#ae4b37; }
.pagination { justify-content: space-between; gap: 8px; flex-wrap: wrap; min-height: 50px; color: #677687; font-size: 12px; }
:global(.ticket-drawer .el-drawer__header) { padding: 17px 22px 14px; margin: 0; border-bottom: 1px solid #e7ebf0; }
:global(.ticket-drawer .el-drawer__title) { color: var(--yy-text-heading); font-size: 17px; font-weight: 600; }
:global(.ticket-drawer .el-drawer__body) { padding: 18px 22px 24px; }
@media (max-width: 1360px) { .tickets-page { padding: 9px 13px 0; } }
</style>
