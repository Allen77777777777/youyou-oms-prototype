<script setup lang="ts">
import { computed, reactive, ref, watch, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import { Plus, ArrowDown, VideoPlay, VideoPause } from '@element-plus/icons-vue'
import { ElButton, ElIcon, ElTable, ElTableColumn, ElSwitch, ElDropdown, ElDropdownMenu, ElDropdownItem, ElDrawer, ElTag, ElPagination, ElEmpty, ElMessage, ElMessageBox, ElTimeline, ElTimelineItem } from 'element-plus'
import MultiSelectFilter from '@/组件/筛选/多选筛选.vue'
import FieldSearch from '@/组件/筛选/字段搜索.vue'
import { 校验字段搜索, 命中字段搜索, type 搜索模式 } from '@/组件/筛选/筛选工具'
import { serviceRuleAnnotation as annotation } from './标注'
import { serviceRules, serviceRuleLogs, activeRuleType, ruleTypes, ruleListPath, sortedServiceRules, typeLabel, actionSummary, timingSummary, conditionSummary, createEditor, setRulesEnabled, deleteRule, moveRule, templatePreview, templateError, type ServiceRule, type ServiceRuleType, type EditorMode } from './规则模型'
import './规则样式.css'
import { autoReplyScheduleSummary, autoReplyTimeZones, autoReplyShopSummary, ruleTriggerLabel } from './规则模型'

const router = useRouter()
const makeFilters = () => ({ field: 'name', mode: 'contains' as 搜索模式, query: '', statuses: [] as string[] })
const filters = reactive(makeFilters()), applied = reactive(makeFilters())
const searchFields = [{ value: 'name', label: '规则名称', kind: 'text' as const }, { value: 'note', label: '规则说明', kind: 'text' as const }]
const statusOptions = [{ value: 'enabled', label: '启用' }, { value: 'disabled', label: '停用' }]
const page = ref(1), size = ref(20), selected = ref<ServiceRule[]>([])
const table = ref<{ clearSelection: () => void }>()
const sameType = computed(() => sortedServiceRules(activeRuleType.value))
const isAutoReply = computed(() => activeRuleType.value === 'autoReply')
function shopName(rule: ServiceRule) { return autoReplyShopSummary(rule.autoReply) }
function scheduleSummary(rule: ServiceRule) { return rule.autoReply ? autoReplyScheduleSummary(rule.autoReply) : [] }
function zoneLabel(rule: ServiceRule) { return autoReplyTimeZones.find(item => item.value === rule.autoReply?.timeZone)?.label ?? rule.autoReply?.timeZone ?? '' }
const rows = computed(() => sameType.value.filter(item => (!applied.statuses.length || applied.statuses.includes(item.enabled ? 'enabled' : 'disabled')) && 命中字段搜索(applied.field === 'note' ? item.note : item.name, applied.query, applied.mode, 'text')))
const visibleRows = computed(() => rows.value.slice((page.value - 1) * size.value, page.value * size.value))
const filtered = computed(() => !!applied.query.trim() || applied.statuses.length > 0)
const detailOpen = ref(false), detailId = ref(''), logOpen = ref(false), logId = ref(''), logName = ref('')
const detail = computed(() => serviceRules.value.find(item => item.id === detailId.value))
const detailTemplate = computed(() => detail.value?.type !== 'assignment' && detail.value ? templatePreview(detail.value) : undefined)
const currentLogs = computed(() => serviceRuleLogs.value.filter(item => item.ruleId === logId.value))
function clearSelection() { selected.value = []; table.value?.clearSelection() }
function query() { const error = 校验字段搜索(filters.query, filters.mode, 'text'); if (error) return void ElMessage.warning(error); Object.assign(applied, { ...filters, statuses: [...filters.statuses] }); page.value = 1; clearSelection() }
function reset() { Object.assign(filters, makeFilters()); Object.assign(applied, makeFilters()); page.value = 1; clearSelection() }
function changeType(type: ServiceRuleType) { activeRuleType.value = type; reset() }
watch([page, size], clearSelection)
watch(() => rows.value.length, () => { page.value = Math.min(page.value, Math.max(1, Math.ceil(rows.value.length / size.value))) })
function edit(mode: EditorMode, source?: ServiceRule) { const session = createEditor(source?.type ?? activeRuleType.value, mode, source); void router.push({ name: `oms-auto-service-rule-${mode}`, params: { sessionId: session.id } }) }
async function enabledChange(enabled: boolean, targets = selected.value) {
  const snapshots = targets.map(item => ({ id: item.id, version: item.version })), changed = targets.filter(item => item.enabled !== enabled).length
  if (!changed) return void ElMessage.info(`所选规则均已${enabled ? '启用' : '停用'}`)
  try { await ElMessageBox.confirm(`已选 ${targets.length} 条规则，将${enabled ? '启用' : '停用'} ${changed} 条，跳过 ${targets.length - changed} 条已处于目标状态的规则。`, `${enabled ? '启用' : '停用'}规则`, { type: 'warning', confirmButtonText: `确认${enabled ? '启用' : '停用'}`, cancelButtonText: '取消' }) } catch { return }
  const result = setRulesEnabled(snapshots, enabled)
  if (result.error) return void ElMessage.warning(result.error)
  clearSelection(); ElMessage.success(`${result.changed} 条已${enabled ? '启用' : '停用'}，${result.skipped} 条跳过`)
}
async function remove(row: ServiceRule) {
  const id = row.id, version = row.version, name = row.name
  try { await ElMessageBox.confirm(`删除规则“${name}”？删除后不再参与后续匹配，历史操作记录保留。`, '删除规则', { type: 'warning', confirmButtonText: '确认删除', cancelButtonText: '取消' }) } catch { return }
  const error = deleteRule(id, version)
  if (error) return void ElMessage.warning(error)
  if (detailId.value === id) detailOpen.value = false
  clearSelection(); ElMessage.success('规则已删除')
}
function openDetail(row: ServiceRule) { detailId.value = row.id; detailOpen.value = true }
function openLogs(row: ServiceRule) { logId.value = row.id; logName.value = row.name; logOpen.value = true }
function more(command: string, row: ServiceRule) { if (command === 'copy') edit('copy', row); else if (command === 'logs') openLogs(row); else if (command === 'delete') void remove(row); else step(row, command === 'up' ? -1 : 1) }
function reorder(from: string, to: string, snapshot = JSON.stringify(sameType.value), context = orderContext()) {
  if (isAutoReply.value || filtered.value || context !== orderContext() || !visibleRows.value.some(item => item.id === from) || !visibleRows.value.some(item => item.id === to)) return
  const error = moveRule(from, to, snapshot)
  if (error) return void ElMessage.warning(error)
  clearSelection(); if (from !== to) ElMessage.success('优先级已调整')
}
function step(row: ServiceRule, offset: number) { if (filtered.value) return; const target = visibleRows.value[visibleRows.value.findIndex(item => item.id === row.id) + offset]; if (target) reorder(row.id, target.id) }
function orderContext() { return JSON.stringify({ type: activeRuleType.value, filters: applied, page: page.value, size: size.value }) }
const draggedId = ref(''), targetId = ref('')
let drag: { id: string; x: number; y: number; pointerId: number; snapshot: string; context: string } | undefined
function rowAt(x: number, y: number) { return document.elementFromPoint(x, y)?.closest('.el-table__row')?.querySelector<HTMLElement>('[data-service-rule-id]')?.dataset.serviceRuleId ?? '' }
function pointerDown(event: PointerEvent, row: ServiceRule) {
  if (filtered.value || event.button !== 0) return
  cleanupDrag()
  drag = { id: row.id, x: event.clientX, y: event.clientY, pointerId: event.pointerId, snapshot: JSON.stringify(sameType.value), context: orderContext() }
  window.addEventListener('pointermove', pointerMove); window.addEventListener('pointerup', pointerUp); window.addEventListener('pointercancel', cleanupDrag); window.addEventListener('keydown', dragKey)
}
function pointerMove(event: PointerEvent) { if (!drag || event.pointerId !== drag.pointerId) return; if (!draggedId.value && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 5) return; draggedId.value = drag.id; targetId.value = rowAt(event.clientX, event.clientY) }
function pointerUp(event: PointerEvent) { const current = drag, target = rowAt(event.clientX, event.clientY), moved = !!draggedId.value; cleanupDrag(); if (current && moved && target) reorder(current.id, target, current.snapshot, current.context) }
function dragKey(event: KeyboardEvent) { if (event.key === 'Escape') cleanupDrag() }
function cleanupDrag() { drag = undefined; draggedId.value = ''; targetId.value = ''; window.removeEventListener('pointermove', pointerMove); window.removeEventListener('pointerup', pointerUp); window.removeEventListener('pointercancel', cleanupDrag); window.removeEventListener('keydown', dragKey) }
function rowClass({ row }: { row: ServiceRule }) { return row.id === draggedId.value ? 'service-dragging' : row.id === targetId.value ? 'service-drop-target' : '' }
onBeforeUnmount(cleanupDrag)
</script>

<template>
  <main class="service-rules-page" v-prototype="annotation('overview', '自动客服规则工作台')">
    <nav class="service-rule-tabs" role="tablist" aria-label="自动客服规则类型" v-prototype="annotation('types', '四类自动客服规则')"><button v-for="type in ruleTypes" :key="type.value" role="tab" :aria-selected="activeRuleType === type.value" :class="{ active: activeRuleType === type.value }" @click="changeType(type.value)">{{ type.label }}</button></nav>
    <div class="service-rule-filters" v-prototype="annotation('filters', '规则查询与筛选')"><MultiSelectFilter v-model="filters.statuses" :options="statusOptions" placeholder="启用状态" /><FieldSearch v-model="filters.query" v-model:field="filters.field" v-model:mode="filters.mode" :fields="searchFields" aria-prefix="自动客服规则" @search="query" /><ElButton type="primary" @click="query">查询</ElButton><ElButton @click="reset">重置</ElButton></div>
    <div class="service-rule-toolbar"><ElButton type="primary" :icon="Plus" v-prototype="annotation('edit', '新增规则与独立编辑页签')" @click="edit('new')">新增规则</ElButton><div class="service-batch-actions" v-prototype="annotation('batch', '批量启用与停用')"><ElButton :icon="VideoPlay" :disabled="!selected.length" @click="enabledChange(true)">批量启用</ElButton><ElButton :icon="VideoPause" :disabled="!selected.length" @click="enabledChange(false)">批量停用</ElButton></div><span class="service-selection-count">{{ selected.length ? `已选 ${selected.length} 条` : '' }}</span></div>
    <div class="service-rules-table">
      <ElTable ref="table" :data="visibleRows" row-key="id" height="100%" :row-class-name="rowClass" @selection-change="selected = $event">
        <ElTableColumn type="selection" width="44" />
        <ElTableColumn v-if="!isAutoReply" label="优先级" width="118" align="center"><template #default="{ row }"><div class="service-priority-cell"><span class="service-rule-order">{{ row.order }}</span><button class="service-order-handle" :data-service-rule-id="row.id" :disabled="filtered" :aria-label="`调整${row.name}优先级`" :title="filtered ? '重置筛选后可调整优先级' : '拖动调整优先级，或按上下方向键'" v-prototype="annotation('order', '规则匹配优先级')" @pointerdown="pointerDown($event, row as ServiceRule)" @keydown.up.prevent="step(row as ServiceRule, -1)" @keydown.down.prevent="step(row as ServiceRule, 1)">⠿</button></div></template></ElTableColumn>
        <ElTableColumn label="规则名称" min-width="190"><template #default="{ row }"><button class="service-rule-name" @click="openDetail(row as ServiceRule)">{{ row.name }}</button><p v-if="row.note.trim()" class="service-rule-note" :title="row.note">{{ row.note }}</p></template></ElTableColumn>
        <ElTableColumn v-if="isAutoReply" label="店铺账号" min-width="145"><template #default="{ row }"><div class="service-summary-lines" tabindex="0" :title="shopName(row as ServiceRule)">{{ shopName(row as ServiceRule) }}</div></template></ElTableColumn>
        <ElTableColumn label="触发时机" min-width="155"><template #default="{ row }"><span>{{ ruleTriggerLabel(row as ServiceRule) }}</span><small class="service-secondary">{{ timingSummary(row as ServiceRule) }}</small></template></ElTableColumn>
        <ElTableColumn v-if="isAutoReply" label="休息时段" min-width="255"><template #default="{ row }"><div class="service-summary-lines" tabindex="0" :title="[zoneLabel(row as ServiceRule), ...scheduleSummary(row as ServiceRule)].join('\n')"><div v-for="line in scheduleSummary(row as ServiceRule)" :key="line">{{ line }}</div></div><small class="service-secondary">{{ zoneLabel(row as ServiceRule) }}</small></template></ElTableColumn>
        <ElTableColumn v-else label="判断条件" min-width="205"><template #default="{ row }"><div class="service-summary-lines" tabindex="0" :title="row.conditions.map(conditionSummary).join('\n')"><div v-for="condition in row.conditions" :key="condition.field">{{ conditionSummary(condition) }}</div></div></template></ElTableColumn>
        <ElTableColumn label="执行动作" min-width="215"><template #default="{ row }"><div class="service-summary-lines" tabindex="0" :title="actionSummary(row as ServiceRule).join('\n')"><div v-for="action in actionSummary(row as ServiceRule)" :key="action">{{ action }}</div></div><small v-if="templateError(row as ServiceRule)" class="service-template-error">{{ templateError(row as ServiceRule) }}</small></template></ElTableColumn>
        <ElTableColumn label="状态" width="75"><template #default="{ row }"><ElSwitch :model-value="row.enabled" :aria-label="`${row.name}启用状态`" @change="enabledChange($event === true, [row as ServiceRule])" /></template></ElTableColumn>
        <ElTableColumn label="更新时间" width="152"><template #default="{ row }"><span class="service-updated-time">{{ row.updatedAt }}</span></template></ElTableColumn>
        <ElTableColumn label="操作" width="116" fixed="right"><template #default="{ row, $index }"><div class="service-row-actions"><ElButton link type="primary" @click="edit('edit', row as ServiceRule)">编辑</ElButton><ElDropdown trigger="click" @command="more($event, row as ServiceRule)"><ElButton link type="primary">更多<ElIcon><ArrowDown /></ElIcon></ElButton><template #dropdown><ElDropdownMenu><ElDropdownItem command="copy">复制</ElDropdownItem><ElDropdownItem command="logs">操作日志</ElDropdownItem><ElDropdownItem v-if="!isAutoReply" command="up" :disabled="filtered || $index === 0">上移</ElDropdownItem><ElDropdownItem v-if="!isAutoReply" command="down" :disabled="filtered || $index === visibleRows.length - 1">下移</ElDropdownItem><ElDropdownItem command="delete" divided class="service-delete-menu">删除</ElDropdownItem></ElDropdownMenu></template></ElDropdown></div></template></ElTableColumn>
        <template #empty><ElEmpty description="暂无符合条件的规则" :image-size="70"><ElButton link type="primary" @click="reset">重置筛选</ElButton></ElEmpty></template>
      </ElTable>
    </div>
    <footer class="service-rule-pagination"><span>共 {{ rows.length }} 条规则</span><ElPagination v-model:current-page="page" v-model:page-size="size" :total="rows.length" :page-sizes="[10, 20, 50]" layout="sizes, prev, pager, next, jumper" @size-change="page = 1" /></footer>
    <ElDrawer v-model="detailOpen" title="规则详情" size="min(760px, calc(100vw - 80px))" append-to-body class="service-rule-drawer"><div v-if="detail" class="service-detail" v-prototype="annotation('details', '规则详情与当前模板')"><header><h2>{{ detail.name }}</h2><ElTag :type="detail.enabled ? 'success' : 'info'" size="small">{{ detail.enabled ? '启用' : '停用' }}</ElTag></header><p class="service-detail-type">{{ typeLabel(detail.type) }}</p><section v-if="detail.type !== 'autoReply'"><h3>优先级</h3><p class="service-detail-order">{{ detail.order }}</p></section><section v-else><h3>店铺账号</h3><p>{{ shopName(detail) }}</p></section><section><h3>触发时机</h3><p>{{ ruleTriggerLabel(detail) }} · {{ timingSummary(detail) }}</p></section><section v-if="detail.type === 'autoReply'" v-prototype="annotation('auto-reply-schedule', '自动回复休息时段详情')"><h3>休息时段</h3><p>时间所属时区：{{ zoneLabel(detail) }}</p><p v-for="line in scheduleSummary(detail)" :key="line">{{ line }}</p></section><section v-else><h3>判断条件 <small>全部满足</small></h3><p v-for="condition in detail.conditions" :key="condition.field">{{ conditionSummary(condition) }}</p></section><section><h3>执行动作</h3><p v-for="action in actionSummary(detail)" :key="action">{{ action }}</p><p v-if="templateError(detail)" class="service-validation-error">{{ templateError(detail) }}</p><div v-if="detailTemplate" class="service-template-preview"><p>{{ detailTemplate.body }}</p><div v-if="detailTemplate.attachments.length" class="service-template-attachments"><ElTag v-for="name in detailTemplate.attachments" :key="name" type="info" size="small">{{ name }}</ElTag></div><small v-if="detailTemplate.variables.length">执行时填入：{{ detailTemplate.variables.join('、') }}</small></div></section><section v-if="detail.note"><h3>规则说明</h3><p>{{ detail.note }}</p></section><small class="service-secondary">更新时间：{{ detail.updatedAt }}</small></div><template #footer><ElButton @click="detailOpen = false">关闭</ElButton><ElButton v-if="detail" type="primary" @click="detailOpen = false; edit('edit', detail)">编辑规则</ElButton></template></ElDrawer>
    <ElDrawer v-model="logOpen" title="操作日志" size="min(660px, calc(100vw - 80px))" append-to-body class="service-rule-drawer"><section v-prototype="annotation('logs', '规则操作日志')"><h2 class="service-log-name">{{ logName }}</h2><ElTimeline v-if="currentLogs.length"><ElTimelineItem v-for="log in currentLogs" :key="log.id" :timestamp="log.at" placement="top"><strong>{{ log.action }}</strong><p class="service-log-content">{{ log.content }}</p><small>{{ log.operator }}</small></ElTimelineItem></ElTimeline><ElEmpty v-else description="暂无操作记录" :image-size="80" /></section><template #footer><ElButton @click="logOpen = false">关闭</ElButton></template></ElDrawer>
  </main>
</template>
