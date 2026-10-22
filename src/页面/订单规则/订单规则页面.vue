<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { Plus, VideoPlay, Document, CopyDocument, InfoFilled, ArrowDown } from '@element-plus/icons-vue'
import { ElButton, ElIcon, ElTag, ElTable, ElTableColumn, ElDrawer, ElDropdown, ElDropdownItem, ElDropdownMenu, ElSelect, ElOption, ElPagination, ElSwitch, ElEmpty, ElMessage, ElMessageBox, ElTimeline, ElTimelineItem, ElAlert } from 'element-plus'
import MultiSelectFilter from '@/组件/筛选/多选筛选.vue'
import FieldSearch from '@/组件/筛选/字段搜索.vue'
import ConditionSummary from './规则条件摘要.vue'
import PricingResult from './比价试算结果.vue'
import { 创建模拟运费报价, 比价费用说明 } from './比价分仓'
import { 共享订单 } from '../订单处理/演示会话'
import { 共享规则, 共享规则日志, 记录规则操作 } from './演示会话'
import { 格式化标发动作, 标发动作说明 } from './标发动作'
import { 条件字段名, 试算规则, type 规则类型, type 订单规则, type 规则条件 } from './规则逻辑'
import { 规则搜索字段, 默认规则筛选, 校验规则筛选, 命中规则筛选, 排序规则展示 } from './规则筛选'
import { 默认审单分组 } from './默认审单清单'
import { 规则标注 } from './规则标注'
import { 创建规则草稿, 当前规则分类, 读取规则草稿, 丢弃规则草稿 } from './规则编辑会话'
import { 关闭业务页签 } from '@/布局/页签操作'
import { 渠道会话 } from '../仓配管理/仓配会话'
import { 分仓配置摘要, 格式化分仓策略 } from './规则路由'
import { 条件定义, 格式化条件值, 是否多选条件字段, 读取条件多选值 } from './规则条件定义'
import { 规则基础选项 } from './规则基础选项'
import { 中台比价汇率快照 } from './比价汇率资料'
import './规则样式.css'

const 类型列表: 规则类型[] = ['审单规则', '分仓规则', '订单标发规则']
const router = useRouter()
const 当前类型 = 当前规则分类
const 类型说明: Record<规则类型, string> = { 审单规则: '命中规则条件的订单，需要人工复核，订单将保留在待审核', 分仓规则: '根据订单条件分配发货仓库和物流渠道，供待审核订单确定发货方案。', 订单标发规则: '命中后按配置安排标发，或无需由 OMS 回传发货信息。' }
const 规则 = 共享规则
const 筛选 = reactive(默认规则筛选()), 已应用 = reactive(默认规则筛选())
const 状态选项 = [{ value: 'true', label: '启用' }, { value: 'false', label: '停用' }]
const 当前页 = ref(1), 每页 = ref(20), 勾选 = ref<订单规则[]>([])
const 表格 = ref<{ clearSelection: () => void }>()
const 本类 = computed(() => 规则.value.filter(项 => 项.type === 当前类型.value))
const 列表 = computed(() => 排序规则展示(本类.value.filter(项 => 命中规则筛选(项, 已应用)), { field: 'priority', direction: 'asc' }))
const 分页列表 = computed(() => 列表.value.slice((当前页.value - 1) * 每页.value, 当前页.value * 每页.value))
const 详情打开 = ref(false), 详情Id = ref(''), 默认打开 = ref(false), 日志打开 = ref(false)
const 详情 = computed(() => 规则.value.find(项 => 项.id === 详情Id.value))
const 日志规则 = ref<Pick<订单规则, 'id' | 'name' | 'type'>>()
const 当前规则日志 = computed(() => 共享规则日志.value.filter(项 => 项.ruleId === 日志规则.value?.id))
const 完整顺序 = computed(() => [...本类.value].sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id)))
const 调序限制 = computed(() => {
  if (已应用.keyword.trim() || 已应用.enabled.length) return '重置筛选后可调整优先级'
  const values = 完整顺序.value.map(项 => 项.priority)
  return values.some(值 => !Number.isFinite(值)) || new Set(values).size !== values.length ? '优先级资料需核查后再调整' : ''
})
const 拖动Id = ref(''), 目标Id = ref(''), 已拖动 = ref(false)
let 拖动会话: { id: string; snapshot: string; context: string; x: number; y: number; pointerId: number; handle: HTMLElement } | undefined
const 试算打开 = ref(false), 试算订单 = ref(''), 试算类型 = ref<规则类型>('审单规则')
const 试算结果 = ref<ReturnType<typeof 试算规则>>(), 试算快照 = ref(''), 试算订单快照 = ref(''), 试算渠道快照 = ref(''), 试算汇率快照 = ref('')
const 试算来源 = computed(() => 共享订单.value.find(项 => 项.systemOrderNo === 试算订单.value))
const 试算依赖渠道 = computed(() => 试算类型.value === '分仓规则' || 规则.value.some(项 => 项.type === 试算类型.value && 项.conditions.some(条件 => 条件.field === 'shippingWarehouse')))
const 试算依赖汇率 = computed(() => 试算结果.value?.pricing !== undefined)
const 试算过期 = computed(() => !!试算结果.value && (试算快照.value !== JSON.stringify(规则.value) || 试算订单快照.value !== JSON.stringify(试算来源.value) || (试算依赖渠道.value && 试算渠道快照.value !== JSON.stringify(渠道会话.value)) || (试算依赖汇率.value && 试算汇率快照.value !== JSON.stringify(中台比价汇率快照.value ?? null))))
function 时间() { return new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Shanghai' }) + ' UTC+8' }
function 清勾选() { 勾选.value = []; 表格.value?.clearSelection() }
function 查询() { const 错误 = 校验规则筛选(筛选); if (错误) return void ElMessage.warning(错误); Object.assign(已应用, JSON.parse(JSON.stringify(筛选))); 当前页.value = 1; 清勾选() }
function 重置筛选() { Object.assign(筛选, 默认规则筛选()); Object.assign(已应用, 默认规则筛选()); 当前页.value = 1; 清勾选() }
function 切规则组(type: 规则类型) { 当前类型.value = type; 重置筛选() }
watch(试算订单, () => { 试算结果.value = undefined })
watch(() => 列表.value.length, () => { 当前页.value = Math.min(当前页.value, Math.max(1, Math.ceil(列表.value.length / 每页.value))) })
function 打开编辑(项?: 订单规则) { const mode = 项 ? 'edit' : 'new'; const session = 创建规则草稿(项?.type || 当前类型.value, 规则.value, mode, 项); if (session) void router.push({ name: `oms-order-rule-${mode}`, params: { sessionId: session.id } }) }
function 复制规则(项: 订单规则) { const session = 创建规则草稿(项.type, 规则.value, 'copy', 项); if (session) void router.push({ name: 'oms-order-rule-copy', params: { sessionId: session.id } }) }
async function 批量启停(enabled: boolean, target = 勾选.value) {
  const 快照 = target.map(项 => ({ id: 项.id, version: 项.version, type: 项.type })), 待变更 = target.filter(项 => 项.enabled !== enabled)
  if (!待变更.length) return void ElMessage.info(`所选规则均已${enabled ? '启用' : '停用'}`)
  const 跳过数 = target.length - 待变更.length
  try { await ElMessageBox.confirm(`已选 ${target.length} 条${当前类型.value}，将${enabled ? '启用' : '停用'} ${待变更.length} 条，跳过已处于该状态的 ${跳过数} 条。影响后续本地试算，已产生的订单事实和历史快照不变。`, `${enabled ? '启用' : '停用'}规则`, { confirmButtonText: `确认${enabled ? '启用' : '停用'}`, cancelButtonText: '取消', type: 'warning' }) } catch { return }
  if (快照.some(项 => { const 当前 = 规则.value.find(条 => 条.id === 项.id); return !当前 || 当前.version !== 项.version || 当前.type !== 项.type })) return void ElMessage.warning('所选规则已变化，请重新选择')
  const timestamp = 时间()
  待变更.forEach(项 => { 项.enabled = enabled; 项.version++; 项.updatedAt = timestamp; 记录规则操作(项, enabled ? '启用' : '停用', `${enabled ? '启用' : '停用'}规则「${项.name}」`, timestamp) })
  清勾选(); ElMessage.success(`${待变更.length} 条已${enabled ? '启用' : '停用'}，${跳过数} 条跳过`)
}
function 调序上下文() { return JSON.stringify({ type: 当前类型.value, filters: 已应用, page: 当前页.value, size: 每页.value, ids: 分页列表.value.map(项 => 项.id) }) }
function 提交移动(sourceId: string, targetId: string, snapshot = JSON.stringify(本类.value), context = 调序上下文()) {
  if (调序限制.value || snapshot !== JSON.stringify(本类.value) || context !== 调序上下文()) return void ElMessage.warning('列表或规则已变化，请重新调整优先级')
  if (sourceId === targetId) return
  const visible = 分页列表.value.map(项 => 项.id)
  if (!visible.includes(sourceId) || !visible.includes(targetId)) return
  const items = [...完整顺序.value], values = items.map(项 => 项.priority)
  const from = items.findIndex(项 => 项.id === sourceId), to = items.findIndex(项 => 项.id === targetId)
  if (from < 0 || to < 0) return
  const [item] = items.splice(from, 1); items.splice(to, 0, item!)
  const timestamp = 时间(); let changed = 0
  items.forEach((项, index) => { const priority = values[index]!; if (项.priority !== priority) { const before = 项.priority; 项.priority = priority; 项.version++; 项.updatedAt = timestamp; changed++; 记录规则操作(项, '调整优先级', `调整匹配顺序：第 ${values.indexOf(before) + 1} 位 → 第 ${index + 1} 位`, timestamp) } })
  if (!changed) return
  清勾选(); ElMessage.success('优先级已更新')
}
async function 键盘移动(id: string, offset: number) {
  const index = 分页列表.value.findIndex(项 => 项.id === id), target = 分页列表.value[index + offset]
  if (!target) return
  提交移动(id, target.id)
  await nextTick()
  Array.from(document.querySelectorAll<HTMLElement>('.优先级单元')).find(项 => 项.dataset.ruleId === id)?.querySelector<HTMLButtonElement>('.列表拖拽手柄')?.focus()
}
function 目标规则(x: number, y: number) { return document.elementFromPoint(x, y)?.closest('.el-table__row')?.querySelector<HTMLElement>('.优先级单元')?.dataset.ruleId || '' }
function 开始拖动(event: PointerEvent, id: string) {
  if (调序限制.value || event.button !== 0) return
  取消拖动()
  const handle = event.currentTarget as HTMLElement
  拖动会话 = { id, snapshot: JSON.stringify(本类.value), context: 调序上下文(), x: event.clientX, y: event.clientY, pointerId: event.pointerId, handle }
  handle.setPointerCapture?.(event.pointerId)
  window.addEventListener('pointermove', 拖动经过); window.addEventListener('pointerup', 结束拖动); window.addEventListener('pointercancel', 取消拖动); window.addEventListener('keydown', 拖动按键)
}
function 拖动经过(event: PointerEvent) {
  if (!拖动会话 || event.pointerId !== 拖动会话.pointerId) return
  if (!已拖动.value && Math.hypot(event.clientX - 拖动会话.x, event.clientY - 拖动会话.y) < 5) return
  已拖动.value = true; 拖动Id.value = 拖动会话.id; 目标Id.value = 目标规则(event.clientX, event.clientY)
}
function 结束拖动(event: PointerEvent) {
  if (!拖动会话 || event.pointerId !== 拖动会话.pointerId) return
  const session = 拖动会话, target = 目标规则(event.clientX, event.clientY), moved = 已拖动.value
  取消拖动()
  if (moved && target) 提交移动(session.id, target, session.snapshot, session.context)
}
function 拖动按键(event: KeyboardEvent) { if (event.key === 'Escape') 取消拖动() }
function 取消拖动() {
  if (拖动会话?.handle.hasPointerCapture?.(拖动会话.pointerId)) 拖动会话.handle.releasePointerCapture(拖动会话.pointerId)
  拖动会话 = undefined; 拖动Id.value = ''; 目标Id.value = ''; 已拖动.value = false
  window.removeEventListener('pointermove', 拖动经过); window.removeEventListener('pointerup', 结束拖动); window.removeEventListener('pointercancel', 取消拖动); window.removeEventListener('keydown', 拖动按键)
}
function 排序行样式({ row }: { row: 订单规则 }) { return [row.id === 拖动Id.value ? '正在调序' : '', row.id === 目标Id.value && row.id !== 拖动Id.value ? 完整顺序.value.findIndex(项 => 项.id === row.id) > 完整顺序.value.findIndex(项 => 项.id === 拖动Id.value) ? '调序目标下' : '调序目标上' : ''].filter(Boolean).join(' ') }
onBeforeUnmount(取消拖动)
function 条件值(条件: 规则条件) {
  if (是否多选条件字段(条件.field)) {
    if (条件.field === 'siteCode' && 条件.values === undefined) return `原站点条件待重选：${条件.value}`
    const options = 规则基础选项(条件.field, 共享订单.value, 渠道会话.value)
    return 读取条件多选值(条件).map(value => options.find(项 => 项.value === value)?.label || (条件.field === 'shippingWarehouse' ? '已失效仓库（请重新选择）' : `已失效选项（${value}）`)).join('、')
  }
  if (条件.field === 'platformOrderStatus') { const name = ({ NOT_STARTED: '未履约', IN_PROGRESS: '部分履约', FULFILLED: '全部履约' } as Record<string,string>)[条件.value]; return name ? `${name}（${条件.value}）` : 条件.value }
  return 格式化条件值(条件)
}
function 条件比较(条件: 规则条件) { return ['range', 'volume', 'dimensionRange'].includes(条件定义[条件.field]?.kind) || (条件.field === 'productDimensions' && 条件.dimensionRules) ? '' : 条件.operator }
function 条件全文(项: 订单规则) { return [`${项.mode === '全部满足' ? '满足全部条件' : '旧匹配方式待核查'} · ${项.conditions.length} 项`, ...项.conditions.map(条件 => `${条件字段名[条件.field]} ${条件比较(条件)} ${条件值(条件)}`)] }
function 路由配置行(项: 订单规则) { return 分仓配置摘要(项, 渠道会话.value) }
function 打开详情(项: 订单规则) { 详情Id.value = 项.id; 详情打开.value = true }
function 打开操作日志(项: 订单规则) { 日志规则.value = { id: 项.id, name: 项.name, type: 项.type }; 日志打开.value = true }
function 更多操作(command: unknown, 项: 订单规则) {
  if (command === 'copy') 复制规则(项)
  else if (command === 'logs') 打开操作日志(项)
  else if (command === 'delete') void 删除规则(项)
}
async function 删除规则(项: 订单规则) {
  const snapshot = { id: 项.id, version: 项.version, type: 项.type, name: 项.name }
  try { await ElMessageBox.confirm(`确定删除规则“${snapshot.name}”？删除后不再参与后续匹配，已产生的订单事实不受影响。`, '删除规则', { confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning' }) } catch { return }
  const index = 规则.value.findIndex(条 => 条.id === snapshot.id && 条.version === snapshot.version && 条.type === snapshot.type)
  if (index < 0) return void ElMessage.warning('规则已变化，请重新确认删除')
  记录规则操作(规则.value[index]!, '删除', `删除规则「${snapshot.name}」`)
  规则.value.splice(index, 1)
  const session = 读取规则草稿('edit', snapshot.id)
  if (session) 丢弃规则草稿(session.key)
  关闭业务页签(`/oms/self-fulfillment/order-rules/edit/${snapshot.id}`, '/oms/self-fulfillment/order-rules')
  if (详情Id.value === snapshot.id) 详情打开.value = false
  清勾选(); ElMessage.success('规则已删除')
}
function 开始试算() { 试算类型.value = 当前类型.value; 试算订单.value ||= 共享订单.value.find(项 => 项.processingStatus === '待审核')?.systemOrderNo || 共享订单.value[0]?.systemOrderNo || ''; 试算结果.value = undefined; 试算打开.value = true }
function 执行试算() {
  if (!试算来源.value) return
  试算渠道快照.value = JSON.stringify(渠道会话.value)
  试算快照.value = JSON.stringify(规则.value)
  试算订单快照.value = JSON.stringify(试算来源.value)
  试算汇率快照.value = JSON.stringify(中台比价汇率快照.value ?? null)
  const rules = JSON.parse(试算快照.value) as 订单规则[], order = JSON.parse(试算订单快照.value)
  const rates = 中台比价汇率快照.value ? JSON.parse(试算汇率快照.value) : undefined
  const initial = 试算规则(rules, order, 试算类型.value, 渠道会话.value)
  试算结果.value = initial.hit?.warehouseAction?.mode === 'price' ? 试算规则(rules, order, 试算类型.value, 渠道会话.value, [], 创建模拟运费报价(initial.hit, order, 渠道会话.value), rates) : initial
}
</script>

<template>
  <main class="订单规则页面">
    <section class="规则工作台" v-prototype="规则标注('overview', '订单规则工作台')">
      <div class="类型栏" v-prototype="规则标注('categories', '规则分类')"><div class="规则页签" role="tablist" aria-label="规则类型"><button v-for="类型 in 类型列表" :key="类型" role="tab" :aria-selected="当前类型 === 类型" :class="{ active: 当前类型 === 类型 }" @click="切规则组(类型)">{{ 类型 }}</button></div><div class="顶栏操作"><ElButton link :icon="Document" @click="默认打开 = true">系统默认审定规则</ElButton></div></div>
      <div class="搜索栏" v-prototype="规则标注('filters', '规则查询')"><FieldSearch v-model="筛选.keyword" v-model:field="筛选.searchType" v-model:mode="筛选.searchMatch" :fields="规则搜索字段" aria-prefix="订单规则" @search="查询" /><MultiSelectFilter v-model="筛选.enabled" :options="状态选项" placeholder="规则状态" /><ElButton type="primary" @click="查询">查询</ElButton><ElButton @click="重置筛选">重置</ElButton></div>
      <div class="规则工具栏"><div class="左工具"><ElButton type="primary" :icon="Plus" @click="打开编辑()">新增规则</ElButton><ElButton :icon="VideoPlay" @click="开始试算">规则试算</ElButton><span class="批量工具" v-prototype="规则标注('batch', '批量启停规则')"><ElButton :disabled="!勾选.length" @click="批量启停(true)">批量启用</ElButton><ElButton :disabled="!勾选.length" @click="批量启停(false)">批量停用</ElButton></span><span v-if="勾选.length" class="勾选数量">已选 {{ 勾选.length }} 条</span></div></div>
      <div class="优先级提示" v-prototype="规则标注('priority', '优先级与匹配顺序')"><ElIcon><InfoFilled /></ElIcon><span>同类规则按优先级从小到大试算，首条命中作为候选；规则命中后仍需检查发货条件。</span></div>
      <div class="规则表格容器"><ElTable ref="表格" :data="分页列表" :row-class-name="排序行样式" row-key="id" @selection-change="勾选 = $event" class="规则表格"><ElTableColumn type="selection" width="44" /><ElTableColumn label="优先级" width="64"><template #default="{ row }"><div class="优先级单元" :data-rule-id="row.id"><button type="button" class="列表拖拽手柄" :disabled="!!调序限制" :aria-label="`调整${row.name}优先级`" :title="调序限制 || '拖动调整优先级；也可使用上下方向键'" @pointerdown.prevent="开始拖动($event, row.id)" @keydown.up.prevent="键盘移动(row.id, -1)" @keydown.down.prevent="键盘移动(row.id, 1)"><i v-for="n in 6" :key="n" /></button></div></template></ElTableColumn><ElTableColumn label="规则名称" min-width="225"><template #default="{ row }"><ElButton link type="primary" class="规则名称" @click="打开详情(row as 订单规则)">{{ row.name }}</ElButton><div v-if="row.note?.trim()" class="规则副文 规则说明">{{ row.note }}</div></template></ElTableColumn><ElTableColumn label="匹配条件" min-width="270"><template #default="{ row }"><div v-prototype="规则标注('condition-summary', '匹配条件摘要与全文')"><ConditionSummary :lines="条件全文(row as 订单规则)" /></div></template></ElTableColumn><ElTableColumn label="执行动作" min-width="185"><template #default="{ row }"><template v-if="row.type === '分仓规则'"><ConditionSummary :lines="路由配置行(row as 订单规则)" /></template><template v-else><div class="动作摘要">{{ row.type === '订单标发规则' ? 格式化标发动作(row as 订单规则) : row.action }}</div><div class="规则副文">{{ row.type === '审单规则' ? '待审核 · 检查后处理' : row.action === '无需标发' ? '不回传平台发货信息' : row.action === '物流下单后标发' ? '获取跟踪号后安排标发' : '有效出库且订单已发货' }}</div></template></template></ElTableColumn><ElTableColumn label="状态" width="95"><template #default="{ row }"><ElSwitch :model-value="row.enabled" :aria-label="`${row.name}状态`" @change="批量启停(!row.enabled, [row as 订单规则])" /></template></ElTableColumn><ElTableColumn label="更新时间" width="155"><template #default="{ row }"><span class="更新时间">{{ row.updatedAt.replace(' UTC+8', '') }}</span></template></ElTableColumn><ElTableColumn label="操作" width="116" fixed="right"><template #default="{ row }"><div class="规则行操作"><ElButton link type="primary" @click="打开编辑(row as 订单规则)">编辑</ElButton><ElDropdown trigger="click" placement="bottom-end" @command="更多操作($event, row as 订单规则)"><ElButton link type="primary" :aria-label="`${row.name}更多操作`" v-prototype="规则标注('row-more', '更多规则操作')">更多<ElIcon><ArrowDown /></ElIcon></ElButton><template #dropdown><ElDropdownMenu class="规则更多菜单"><ElDropdownItem command="copy">复制</ElDropdownItem><ElDropdownItem command="logs"><span v-prototype="规则标注('logs', '单条规则操作日志')">操作日志</span></ElDropdownItem><ElDropdownItem command="delete" divided class="危险菜单项"><span v-prototype="规则标注('delete', '删除规则')">删除</span></ElDropdownItem></ElDropdownMenu></template></ElDropdown></div></template></ElTableColumn><template #empty><ElEmpty description="暂无符合条件的规则" :image-size="70"><ElButton @click="重置筛选">清空筛选</ElButton><ElButton type="primary" @click="打开编辑()">新增规则</ElButton></ElEmpty></template></ElTable></div>
      <footer class="列表底栏"><span>共 {{ 列表.length }} 条规则，{{ 列表.filter(项 => 项.enabled).length }} 条启用</span><ElPagination v-model:current-page="当前页" v-model:page-size="每页" :page-sizes="[10,20,50]" :total="列表.length" layout="prev, pager, next, sizes" @current-change="清勾选" @size-change="当前页 = 1; 清勾选()" /></footer>
    </section>
    <ElDrawer v-model="详情打开" title="规则详情" size="min(760px, calc(100vw - 80px))" class="订单规则附属抽屉" append-to-body><div v-if="详情" v-prototype="规则标注('details', '只读规则详情')"><div class="详情题头"><h2>{{ 详情.name }}</h2><ElTag :type="详情.enabled ? 'success' : 'info'">{{ 详情.enabled ? '启用' : '停用' }}</ElTag></div><dl class="详情信息"><div><dt>规则类型</dt><dd>{{ 详情.type }}</dd></div><div><dt>优先级</dt><dd>{{ 详情.priority }}</dd></div><div><dt>当前版本</dt><dd>v{{ 详情.version }}</dd></div><div><dt>更新时间</dt><dd>{{ 详情.updatedAt }}</dd></div></dl><section class="详情分区"><h3>规则条件 <small>{{ 详情.mode === '全部满足' ? '全部满足' : '旧匹配方式待核查' }}</small></h3><div v-for="(条件, index) in 详情.conditions" :key="index" class="详情条件"><span>{{ 条件字段名[条件.field] }}</span><i v-if="条件比较(条件)">{{ 条件比较(条件) }}</i><strong>{{ 条件值(条件) }}</strong></div></section><section class="详情分区"><h3>执行动作</h3><template v-if="详情.type === '分仓规则'"><p v-for="行 in 路由配置行(详情)" :key="行">{{ 行 }}</p><p v-if="详情.warehouseAction?.mode === 'price'" class="辅助文字">{{ 比价费用说明 }}</p></template><template v-else-if="详情.type === '订单标发规则'"><p>{{ 格式化标发动作(详情) }}</p><p class="辅助文字">{{ 标发动作说明(详情) }}</p></template><p v-else>{{ 详情.action }}</p><p v-if="详情.type !== '订单标发规则'" class="辅助文字">{{ 类型说明[详情.type] }}</p><template v-if="详情.type === '审单规则' && 详情.orderNote?.trim()"><h4>订单备注</h4><p class="订单备注正文">{{ 详情.orderNote }}</p></template></section><section v-if="详情.note?.trim()" class="详情分区"><h3>规则说明</h3><p>{{ 详情.note }}</p></section></div><template #footer><ElButton @click="详情打开 = false">关闭</ElButton><ElButton v-if="详情" :icon="CopyDocument" @click="详情打开 = false; 复制规则(详情)">复制规则</ElButton><ElButton v-if="详情" type="primary" @click="详情打开 = false; 打开编辑(详情)">编辑规则</ElButton></template></ElDrawer>
    <ElDrawer v-model="默认打开" title="系统默认审定规则" size="min(820px, calc(100vw - 80px))" class="订单规则附属抽屉" append-to-body><section v-prototype="规则标注('default-checks', '系统默认审核拦截规则')"><div class="默认说明">命中以下任意一条规则，订单审核不通过。</div><section v-for="组 in 默认审单分组" :key="组.title" class="默认分组"><h3>{{ 组.title }}<small>{{ 组.items.length }} 项</small></h3><div v-for="项 in 组.items" :key="项.no" class="默认检查项"><span>{{ String(项.no).padStart(2,'0') }}</span><div><strong>{{ 项.name }}</strong></div></div></section></section><template #footer><ElButton @click="默认打开 = false">关闭</ElButton></template></ElDrawer>
    <ElDrawer v-model="试算打开" title="规则试算" size="min(800px, calc(100vw - 80px))" class="订单规则附属抽屉" append-to-body><section v-prototype="规则标注('simulation', '只读规则试算与命中轨迹')"><div class="试算提示"><ElIcon><InfoFilled /></ElIcon><span>只返回匹配建议，不执行订单动作；本地试算未覆盖全部默认审单项。</span></div><label class="试算标签">选择订单 <ElTag size="small" type="info">{{ 试算类型 }}</ElTag></label><div class="试算选择"><ElSelect v-model="试算订单" filterable aria-label="选择试算订单"><ElOption v-for="订单 in 共享订单" :key="订单.systemOrderNo" :label="`${订单.systemOrderNo} · ${订单.platformCode} · ${订单.processingStatus || '未进入处理'}`" :value="订单.systemOrderNo" /></ElSelect><ElButton type="primary" @click="执行试算">开始试算</ElButton></div><div v-if="试算来源" class="订单快照"><span>平台<strong>{{ 试算来源.platformCode }}</strong></span><span>店铺<strong>{{ 试算来源.storeName }}</strong></span><span>国家<strong>{{ 试算来源.address.countryCode || '—' }}</strong></span><span>处理状态<strong>{{ 试算来源.processingStatus || '未进入处理' }}</strong></span></div>
      <template v-if="试算结果"><ElAlert v-if="试算过期" title="配置或订单已变化，请重新试算" type="warning" :closable="false" class="过期提示" /><div class="试算结论"><small>候选结果</small><h2>{{ 试算结果.hit?.name || '未命中启用规则' }}</h2><template v-if="试算类型 === '分仓规则' && 试算结果.hit"><p>分仓模式：{{ 格式化分仓策略(试算结果.hit) }}</p><p>发货仓库：{{ 试算结果.route?.warehouse || (试算结果.aging || 试算结果.pricing ? '尚未确定' : '配置待核查') }}</p><p>物流渠道：{{ 试算结果.route?.name || (试算结果.aging || 试算结果.pricing ? '随匹配仓库确定' : '配置待核查') }}</p><template v-if="试算结果.aging"><p v-for="行 in 路由配置行(试算结果.hit).slice(1)" :key="行" class="辅助文字">{{ 行 }}</p><p v-for="仓 in 试算结果.aging.skipped" :key="`skipped-${仓.id}`" class="辅助文字">{{ 仓.warehouse }}：分仓后剩余库存不满足要求，已跳过</p><p v-for="项 in 试算结果.aging.ranked" :key="项.route.id">{{ 项.route.warehouse }}：库龄合计 {{ 项.ageDays }} 天 · {{ 项.ageDetails.length }} 个 SKU · 快照 {{ 项.snapshotDate }}</p></template></template><p v-else>{{ 试算结果.hit?.type === '订单标发规则' ? 格式化标发动作(试算结果.hit) : 试算结果.hit?.action || '请调整条件，或交由人工核对' }}</p><p v-if="试算结果.hit?.type === '订单标发规则'" class="辅助文字">{{ 标发动作说明(试算结果.hit) }} 当前仅预览配置，不安排实际标发任务。</p><p v-if="试算类型 === '审单规则' && 试算结果.hit?.orderNote?.trim()" class="订单备注正文">订单备注：{{ 试算结果.hit.orderNote }}</p><span v-if="试算结果.hit">v{{ 试算结果.hit.version }} · 优先级 {{ 试算结果.hit.priority }}</span></div><PricingResult v-if="试算结果.pricing" :result="试算结果.pricing" /><div class="门禁结果"><h3>执行条件</h3><p v-if="试算结果.gates.length" class="门禁阻断">{{ 试算结果.gates.length }} 项条件需处理</p><ul v-if="试算结果.gates.length"><li v-for="gate in 试算结果.gates" :key="gate">{{ gate }}</li></ul><p v-else class="辅助文字">当前演示阶段条件无拦截；实际执行仍需重查默认审单、平台、库存和权限。</p><p v-if="试算结果.unknownFields.length" class="资料未知">条件资料未知：{{ 试算结果.unknownFields.join('、') }}。相关规则不作为可执行结论。</p></div><h3 class="轨迹标题">匹配轨迹 <span>{{ 试算结果.trace.length }} 条规则</span></h3><ElTimeline><ElTimelineItem v-for="条 in 试算结果.trace" :key="条.rule.id" :type="!条.rule.enabled ? 'info' : 条.matched ? 'primary' : 'info'" :hollow="!条.matched"><div class="轨迹标题行"><strong>{{ 条.rule.name }}</strong><ElTag size="small" :type="!条.rule.enabled ? 'info' : 条.unknownFields.length ? 'warning' : 条.matched ? 'success' : 'info'">{{ !条.rule.enabled ? '停用跳过' : 条.unknownFields.length ? '资料未知' : 条.rule.id === 试算结果.hit?.id ? '首个命中候选' : 条.matched ? '后续命中' : '未命中' }}</ElTag></div><p class="轨迹元数据">优先级 {{ 条.rule.priority }} · v{{ 条.rule.version }} · {{ 条.rule.mode === '全部满足' ? '全部满足' : '旧匹配方式待核查' }}</p><p class="轨迹条件" v-for="(条件,index) in 条.rule.conditions" :key="index">{{ 条件字段名[条件.field] }} {{ 条件比较(条件) }} {{ 条件值(条件) }}</p></ElTimelineItem></ElTimeline></template><ElEmpty v-else description="选择订单后，点击开始试算查看匹配结果" :image-size="85" /></section></ElDrawer>
    <ElDrawer v-model="日志打开" title="操作日志" size="min(900px, calc(100vw - 80px))" class="订单规则附属抽屉" append-to-body><section class="规则日志" v-prototype="规则标注('logs', '单条规则操作日志')"><div class="日志题头"><h2>{{ 日志规则?.name }}</h2><ElTag size="small" type="info">{{ 日志规则?.type }}</ElTag></div><ElTable class="规则操作日志表" :data="当前规则日志" empty-text="暂无操作日志"><ElTableColumn label="操作时间" width="170"><template #default="{ row }">{{ row.time.replace(' UTC+8', '') }}</template></ElTableColumn><ElTableColumn prop="operator" label="操作人" width="100" /><ElTableColumn prop="action" label="操作" width="110" /><ElTableColumn prop="text" label="操作内容" min-width="250" /></ElTable></section></ElDrawer>
  </main>
</template>
